#!/usr/bin/env node
// bootloop: boot a big port on the game again and again; each crash is read from game.log and either fixed by a known rule or stops the loop
// usage:
//   boot  --mods a,b --game G --text dir --run dir --log game.log [--fix dir] [--exe f] [--map m] [--inst n] [--max n] [--tag t] [--ent-keys f]
//   parse <game.log> [--json]                  what the first exception in a log says, no game
//   drop  --text dir [--fix dir] [--run dir] [--file key] [--ent-keys f] key...   drop block keys from entity + properties text
//   pack  --text dir --pak dir --run dir [--fix dir --empty-fix]   rebuild the static pak layer from the loose source
//   sweep --mods a,b --target folder --game G --text dir --run dir --log game.log [--names-file f] [--only regex] [--chunk n] [--max n] [--repeat n] [--retry] [--inst n] [--timeout s]
//         load every entity through the MP preload list, a chunk per boot. each crash is recorded per entity with its cause, the entity is skipped next boot.
//         stops when one cause has hit --repeat entities (default 3): census that family before booting again. state in --run/sweep-state.json; --retry tests crashers again
//   ingest <read.json> <game.log> --run dir    apply one preloadsweep read to the sweep state, no game
// layers: --text = unmounted loose source (resource/), --fix = mounted loose layer on top of the paks; every change goes to both
// a crash in entity/properties: unexpected token drops the marked key. other entity crashes and set/ crashes stop, they need a rule
// other files: AS2's copy goes in, or the file is emptied if AS2 has none. logged to keep-as2.txt, emptied.txt, dropped.txt in --run
// the loop finds causes one at a time: census the whole tree with portfix before a boot (limits PORT-47 on)
// games: boot and sweep boot AS64 only. --exe f is an exe file or a game word as64|mowas_2|mowas2|goh (lib/games; a word = that game's exe
//   under --game). The game: --exe word or file name, else the exe found in --game (as64.exe, mowas_2.exe, binaries/x64/call_to_arms.exe).
//   MoW:AS2: refused at the start (every boot is a testrun pipe run on a numbered instance; mowas_2.exe has no -control, no -instance:
//   limits TST-19). GoH: refused (no control pipe,; GoH is the port's source side, not a boot target).
//   parse, drop, pack, ingest read and write files only and take no game.
// Author: Imperator_Aug (ARSENAL, ia-7cb28894)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const LIB = path.join(__dirname, '..', 'lib'), TOOLS = path.join(__dirname, '..');
const low = s => String(s || '').toLowerCase();

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); if (['json', 'empty-fix', 'retry'].includes(k)) o[k] = true; else o[k] = argv[++i]; } else o._.push(a); }
  return o;
}

// first exception of a game.log: message, deepest real file (a macro frame reads file "define 'x'", an include may be relative), frames, marked key
function parseCrash(log) {
  const L = log.split(/\r?\n/), x = L.findIndex(l => /\*{5,} Exception \*{5,}/.test(l));
  if (x < 0) return null;
  const blk = L.slice(x + 1, x + 60), msg = (blk.find(s => s.trim()) || '').trim();
  let file;
  for (const s of blk.slice(0, 40)) { const f = (/^>+ file "([^"]+)"/.exec(s) || [])[1]; if (!f || /^define /.test(f)) continue; const g = f.replace(/\\/g, '/'); file = g.startsWith('/') || !file ? g : path.posix.dirname(file) + '/' + g; }
  const frames = blk.filter(s => /^\s+#0[2-6] /.test(s)).map(s => s.replace(/^\s+#\d+ \S+ /, '').trim()).filter(s => !/RaiseAppError|LogError/.test(s)).slice(0, 3).join(' < ');
  const mark = blk.map(s => /\{(?:\xef\xbf\xbd|�)\s*([A-Za-z_+][\w+]*)/.exec(s)).find(Boolean);
  return { msg, file: file || null, key: file ? low(file.replace(/^\/+/, '')) : null, frames, bad: mark ? low(mark[1]) : null };
}

// what the loop does with a crash; done = causes already tried this run
function decide(c, done) {
  if (!c.key) return { act: 'stop', why: 'crash names no file' };
  if (/^(entity|properties)\//.test(c.key)) {
    if (!/unexpected token/.test(c.msg) || !c.bad) return { act: 'stop', why: c.key + ' needs a look: ' + c.msg };
    const tag = c.key + '|' + c.bad;
    if (done.has(tag)) return { act: 'stop', why: tag + ' crashed again after the drop' };
    return { act: 'drop', tag, bad: c.bad };
  }
  if (c.key.startsWith('set/')) return { act: 'stop', why: c.key + ' set file: merge, never swap' };
  if (done.has(c.key)) return { act: 'stop', why: c.key + ' crashed again with its replacement on top' };
  return { act: 'swap', tag: c.key };
}

function dropKeys(o, keys, only) {
  const sdlw = require(path.join(LIB, 'sdlwrite'));
  const OVER = o.text, BIN = /\.(dds|tga|png|jpg|ogg|wav|ply|anm|mp3|bmp|skel|pak|bin|mtl|ebm|tex|ctm|etf|font|tpl)$/i;
  const keepF = o.run && path.join(o.run, 'keep-as2.txt');
  const keep = new Set(keepF && fs.existsSync(keepF) ? fs.readFileSync(keepF, 'latin1').split(/\r?\n/).map(l => l.split('\t')[0]) : []);
  const files = [];
  if (only) files.push(only);
  else for (const d of ['entity', 'properties']) { if (!fs.existsSync(path.join(OVER, d))) continue; for (const r of fs.readdirSync(path.join(OVER, d), { recursive: true })) { const k = d + '/' + String(r).replace(/\\/g, '/'); if (!BIN.test(k) && !keep.has(low(k))) files.push(k); } }
  let changed = 0, fails = 0; const hits = {};
  for (const k of files) {
    const p = path.join(OVER, k); let st; try { st = fs.statSync(p); } catch { continue; } if (!st.isFile() || st.size > 4e6) continue;
    let b = fs.readFileSync(p), root; try { root = sdlw.parse(b).root; } catch { fails++; continue; }
    const spans = [];
    const walk = ns => { for (const c of ns || []) { if (c.type === 'block') { const n = low(c.name); if (keys.has(n)) { spans.push([c.start, c.end]); hits[n] = (hits[n] || 0) + 1; } else walk(c.items); } else if (c.type === 'list') walk(c.items); } };
    walk(root.items);
    if (!spans.length) continue;
    spans.sort((x, y) => y[0] - x[0]); for (const [s, e] of spans) b = Buffer.concat([b.subarray(0, s), b.subarray(e)]);
    fs.writeFileSync(p, b); changed++;
    if (o.fix) { const q = path.join(o.fix, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, b); }
  }
  const line = `drop ${only || 'ALL'} changed ${changed} parse-fail ${fails} ${JSON.stringify(hits)}`;
  if (o.run) fs.appendFileSync(path.join(o.run, 'dropped.txt'), line + '\n');
  return line;
}

const games = require('../lib/games'), WORDS = ['as64', 'mowas_2', 'mowas2', 'goh'];
// --exe as a file: a word names that game's exe under --game; a path stays as given; none: as64.exe under --game (as before)
function exeFile(o) {
  if (o.exe && WORDS.includes(low(o.exe))) return path.join(o.game || '.', ...games.get(o.exe).file.split('/'));
  return o.exe || path.join(o.game, 'as64.exe');
}
// the game a boot would start; refuses (exit 2, one line) everything but AS64
function refuseGame(o, what) {
  let g = o.exe ? (WORDS.includes(low(o.exe)) ? games.idOf(o.exe) : games.idOf(path.basename(o.exe))) : null;
  if (!g && !o.exe && o.game) {
    if (fs.existsSync(path.join(o.game, 'as64.exe'))) g = 'as64';
    else if (fs.existsSync(path.join(o.game, 'mowas_2.exe'))) g = 'mowas2';
    else if (fs.existsSync(path.join(o.game, 'binaries', 'x64', 'call_to_arms.exe'))) g = 'goh';
  }
  if (g === 'mowas2') games.refuse('bootloop ' + what, g, 'every boot is a testrun pipe run on a numbered instance, and mowas_2.exe has no -control and no -instance', 'limits TST-19');
  else if (g === 'goh') games.refuse('bootloop ' + what, g, 'GoH has no control pipe, and GoH is the source side of the port, not a boot target', 'modweb/testing/goh-drive.md');
}

const platform = require('../lib/platform');
const gameUp = () => platform.isRunning(/as64\.exe|mowas_2\.exe/i) === true;
const pause = ms => spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);

function cmdBoot(o) {
  for (const k of ['mods', 'game', 'text', 'run', 'log']) if (!o[k]) throw new Error('boot needs --' + k);
  const pakset = require(path.join(LIB, 'pakset'));
  const MAX = +o.max || 25, TAG = o.tag || 'b', exe = exeFile(o), map = o.map || 'multi/1v1_road:combat', inst = o.inst || '1';
  if (inst === '0') throw new Error('instance 0 is the player\'s own');
  fs.mkdirSync(path.join(o.run, 'logs'), { recursive: true });
  const say = s => { console.log(s); fs.appendFileSync(path.join(o.run, 'bootloop.log'), s + '\n'); };
  const as2 = pakset.open(path.join(o.game, 'resource'), null), as2map = new Map();
  for (const e of as2.entries) as2map.set(low(e.key), e); // later entries win, same as mount order
  // keys AS2's entity + properties use: such a key is dropped in that file only; unknown list: always that file only
  const ek = o['ent-keys'] || path.join(o.run, 'as2entkeys.json'), AS2KEYS = fs.existsSync(ek) ? new Set(JSON.parse(fs.readFileSync(ek, 'utf8'))) : null;
  const done = new Set();
  for (let i = 1; i <= MAX; i++) {
    for (let t = 0; t < 30 && gameUp(); t++) pause(2000);
    if (gameUp()) { say('STOP: game still running before launch'); break; }
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'testrun', 'testrun.js'), '--exe', exe, '--map', map, '--mods', o.mods, '--inst', inst, '--hold', o.hold || '5', '--timeout', '900', '--hang-sec', '900', '--mod-timeout', '900', '--stage-timeout', '600'], { encoding: 'utf8', timeout: 1200000, maxBuffer: 1 << 28 });
    const n = TAG + i, log = fs.readFileSync(o.log, 'latin1');
    fs.writeFileSync(path.join(o.run, 'logs', n + '.testrun.txt'), (r.stdout || '') + (r.stderr || ''));
    fs.copyFileSync(o.log, path.join(o.run, 'logs', n + '.log'));
    const c = parseCrash(log);
    if (!c) { const L = log.split(/\r?\n/).filter(Boolean); say(`${n}: no exception; testrun exit ${r.status}; log lines ${L.length}; last: ${L[L.length - 1]}`.slice(0, 300)); break; }
    say(`${n}: ${c.msg} | file ${c.file || '-'} | ${c.frames}`.slice(0, 400));
    const d = decide(c, done);
    if (d.act === 'stop') { say('STOP: ' + d.why); break; }
    done.add(d.tag);
    if (d.act === 'drop') {
      const wide = AS2KEYS && !AS2KEYS.has(d.bad);
      say(`  drop ${d.bad} ${wide ? 'everywhere' : 'in ' + c.key}: ${dropKeys(o, new Set([d.bad]), wide ? null : c.key)}`.slice(0, 300));
      continue;
    }
    const e = as2map.get(c.key), body = e ? pakset.read(e) : Buffer.alloc(0);
    for (const root of [o.text, o.fix].filter(Boolean)) { const q = path.join(root, c.key); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, body); }
    fs.appendFileSync(path.join(o.run, e ? 'keep-as2.txt' : 'emptied.txt'), `${c.key}\t${c.msg}\t${c.frames}\n`);
  }
  as2.close();
}

function cmdPack(o) {
  for (const k of ['text', 'pak', 'run']) if (!o[k]) throw new Error('pack needs --' + k);
  if (gameUp()) { console.log('game running, not packing'); process.exitCode = 1; return; }
  const src = path.dirname(o.text), out = path.join(o.run, 'pak');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/\.pak$/i.test(f)) fs.unlinkSync(path.join(out, f));
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'packer', 'packer.js'), src, '--out', out, '--summary', '-q'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status) { console.log('packer failed: ' + (r.stderr || r.stdout).slice(0, 400)); process.exitCode = 1; return; }
  console.log((r.stdout || '').trim().split(/\r?\n/).slice(-3).join('\n'));
  const pr = path.join(o.pak, 'resource'); fs.mkdirSync(pr, { recursive: true });
  const info = path.join(src, 'mod.info'); if (fs.existsSync(info)) fs.copyFileSync(info, path.join(o.pak, 'mod.info'));
  for (const f of fs.readdirSync(out)) fs.copyFileSync(path.join(out, f), path.join(pr, f));
  // the packer leaves folders outside its roles loose
  for (const d of ['difficulties', 'shader']) if (fs.existsSync(path.join(o.text, d))) fs.cpSync(path.join(o.text, d), path.join(pr, d), { recursive: true });
  // the fix layer's files are in the new paks now; only with --empty-fix, only files under that folder
  if (o.fix && o['empty-fix']) { let n = 0; for (const r2 of fs.readdirSync(o.fix, { recursive: true })) { const q = path.join(o.fix, String(r2)); if (fs.lstatSync(q).isFile()) { fs.unlinkSync(q); n++; } } console.log('fix layer emptied: ' + n + ' files'); }
}

// ---- sweep: every entity, MP preload list (tools/preloadsweep plans and reads, this keeps the score)
const stateFile = o => path.join(o.run, 'sweep-state.json');
const loadState = o => fs.existsSync(stateFile(o)) ? JSON.parse(fs.readFileSync(stateFile(o), 'utf8')) : { iter: 0, results: {}, causes: {} };
const saveState = (o, st) => fs.writeFileSync(stateFile(o), JSON.stringify(st, null, 1));
// same fault, different entity: names, paths and numbers out
function causeKey(c) {
  const src = /\(([\w.]+), (\d+)\)/.exec(c.msg);
  const text = c.msg.replace(/\([\w.]+, \d+\).*$/, '').replace(/"[^"]*"|'[^']*'/g, '<x>').replace(/\S*[\/\\]\S*/g, '<path>').replace(/0x[0-9a-f]+/gi, 'N').replace(/\d+/g, 'N').trim().slice(0, 100);
  return text + ' @' + (src ? src[1] + ':' + src[2] : (c.frames || '?').slice(0, 60));
}
function ingest(st, read, log) {
  let crashed = null, loaded = 0, missing = 0;
  for (const e of read.entities) {
    const k = low(e.name);
    if (e.status === 'NO_ERROR') { st.results[k] = { actual: 'LOAD', run: st.iter }; loaded++; }
    else if (e.status === 'FAILED' && e.how === 'crash') { st.results[k] = { actual: 'CRASH', run: st.iter, why: String(e.why || '').slice(0, 200) }; crashed = k; }
    else if (e.status === 'FAILED') { st.results[k] = { actual: 'MISSING', run: st.iter }; missing++; }
  }
  let cause = null;
  if (crashed) {
    const c = parseCrash(log) || { msg: '(no exception block)', frames: '', file: null };
    cause = causeKey(c);
    const t = st.causes[cause] = st.causes[cause] || { msg: c.msg.slice(0, 300), n: 0, entities: [], files: [] };
    t.n++; t.entities.push(crashed); if (c.file) t.files.push(c.file);
    st.results[crashed].cause = cause;
  }
  return { crashed, cause, loaded, missing };
}
// entity name = .def file name, lowercase; first path wins, the engine reports redefinitions
function allDefs(o) {
  const root = path.join(o.text, 'entity'), re = o.only ? new RegExp(o.only, 'i') : null, names = new Set();
  for (const r of fs.readdirSync(root, { recursive: true })) { const k = String(r).replace(/\\/g, '/'); if (!/\.def$/i.test(k) || (re && !re.test(k))) continue; const n = low(path.posix.basename(k)).replace(/\.def$/, ''); if (!/["\\\r\n]/.test(n)) names.add(n); }
  return [...names];
}
function cmdSweep(o) {
  for (const k of ['mods', 'target', 'game', 'text', 'run', 'log']) if (!o[k]) throw new Error('sweep needs --' + k);
  const inst = o.inst || '1'; if (inst === '0') throw new Error('instance 0 is the player\'s own');
  const PS = path.join(TOOLS, 'preloadsweep', 'preloadsweep.js'), TR = path.join(TOOLS, 'testrun', 'testrun.js');
  const THIN = o.target + '_sweep', out = path.join(o.run, 'sweep'), thin = path.join(o.game, 'mods', THIN);
  const CHUNK = +o.chunk || 1500, MAX = +o.max || 40, REPEAT = +o.repeat || 3;
  fs.mkdirSync(path.join(o.run, 'logs'), { recursive: true });
  const say = s => { console.log(s); fs.appendFileSync(path.join(o.run, 'sweep.log'), s + '\n'); };
  const st = loadState(o);
  if (o.retry) { for (const [k, v] of Object.entries(st.results)) if (v.actual === 'CRASH') delete st.results[k]; st.causes = {}; }
  const all = o['names-file'] ? fs.readFileSync(o['names-file'], 'latin1').split(/\r?\n/).map(low).filter(Boolean) : allDefs(o);
  const node = (a, t) => spawnSync(process.execPath, ['--max-old-space-size=8000', ...a], { encoding: 'utf8', timeout: t, maxBuffer: 1 << 28 });
  for (let i = 0; i < MAX; i++) {
    const left = all.filter(n => !st.results[n]);
    say(`-- ${left.length} left of ${all.length}, run ${st.iter}`);
    if (!left.length) { say('STOP: all recorded'); break; }
    if (gameUp()) { say('STOP: game running'); break; }
    st.iter++;
    const nf = path.join(o.run, 'sweep-names.txt'), chunk = left.slice(0, CHUNK);
    fs.writeFileSync(nf, chunk.join('\r\n') + '\r\n', 'latin1');
    const p = node([PS, 'plan', path.join(o.game, 'mods', o.target), '--names-file', nf, '--out', out, '--game', o.game, '--name', THIN, '--target-name', o.mods.split(',').pop(), '--sentinels', 'dustrun_big,' + THIN + '_bad_sentinel'], 900000);
    if (p.status !== 0) { say('STOP: plan failed: ' + ((p.stdout || '') + (p.stderr || '')).slice(-500)); break; }
    fs.mkdirSync(path.join(thin, 'resource', 'set', 'multiplayer'), { recursive: true });
    for (const f of ['mod.info', 'run.json', 'resource/set/multiplayer/preload']) fs.copyFileSync(path.join(out, f), path.join(thin, f));
    const t0 = Date.now(), secs = o.timeout || '1800';
    const r = node([TR, '--exe', exeFile(o), '--map', o.map || 'multi/1v1_road:combat', '--mods', o.mods + ',' + THIN, '--inst', inst, '--hold', '5', '--timeout', secs, '--hang-sec', '900', '--mod-timeout', '900', '--stage-timeout', secs], (+secs + 300) * 1000);
    const n = 's' + st.iter, tr = (r.stdout || '') + (r.stderr || '');
    fs.writeFileSync(path.join(o.run, 'logs', n + '.testrun.txt'), tr);
    if (gameUp()) { saveState(o, st); say('STOP: game still running after testrun'); break; }
    fs.copyFileSync(o.log, path.join(o.run, 'logs', n + '.log'));
    const rd = node([PS, 'read', o.log, '--plan', path.join(out, 'run.json'), '--json', ...(/crashed-silent/.test(tr) ? ['--crashed'] : [])], 300000);
    let read; try { read = JSON.parse(rd.stdout); } catch { say('STOP: read not json: ' + ((rd.stdout || '') + (rd.stderr || '')).slice(-300)); break; }
    const v = ingest(st, read, fs.readFileSync(o.log, 'latin1'));
    saveState(o, st);
    say(`${n}: ${read.verdict}, ${Math.round((Date.now() - t0) / 1000)}s, loaded ${v.loaded}, missing ${v.missing}, testrun exit ${r.status}${v.crashed ? ', crash ' + v.crashed + ' :: ' + v.cause : ''}`.slice(0, 400));
    if (!read.crash && read.verdict !== 'COMPLETE') { say('STOP: no crash but ' + read.verdict + ': ' + read.why); break; }
    if (read.crash && !v.crashed) { say('STOP: crash not attributed: ' + read.why); break; }
    if (v.cause && st.causes[v.cause].n >= REPEAT) { say('STOP: repeated cause, census this family: ' + v.cause); break; }
  }
  saveState(o, st);
  for (const [k, c] of Object.entries(st.causes)) say(`cause x${c.n} ${k} :: ${c.entities.slice(0, 6).join(',')}`.slice(0, 300));
}

const [cmd, ...rest] = process.argv.slice(2), o = args(rest);
if (cmd === 'parse') { const c = parseCrash(fs.readFileSync(o._[0], 'latin1')); const d = c ? decide(c, new Set()) : { act: 'none' }; console.log(o.json ? JSON.stringify({ crash: c, decide: d }) : c ? `${c.msg}\nfile ${c.file || '-'}\nbad ${c.bad || '-'}\nact ${d.act} ${d.why || ''}`.trim() : 'no exception'); }
else if (cmd === 'drop') { if (!o.text || !o._.length) throw new Error('drop needs --text and keys'); console.log(dropKeys(o, new Set(o._.map(low)), o.file ? low(o.file.replace(/^\/+/, '')) : null)); }
else if (cmd === 'boot') { refuseGame(o, 'boot'); if (platform.requireWin('booting the game (bootloop boot)')) cmdBoot(o); }
else if (cmd === 'pack') cmdPack(o);
else if (cmd === 'sweep') { refuseGame(o, 'sweep'); if (platform.requireWin('booting the game (bootloop sweep)')) cmdSweep(o); }
else if (cmd === 'ingest') { const st = loadState(o); st.iter++; const v = ingest(st, JSON.parse(fs.readFileSync(o._[0], 'utf8')), fs.readFileSync(o._[1], 'latin1')); saveState(o, st); console.log(JSON.stringify(v)); }
else { console.log('usage: bootloop boot|parse|drop|pack|sweep|ingest, see head of file'); process.exitCode = 2; }
