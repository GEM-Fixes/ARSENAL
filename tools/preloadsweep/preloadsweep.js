#!/usr/bin/env node
// preloadsweep: ladder rung L3. One multiplayer match load tests many entities through a thin mod's /set/multiplayer/preload.
//   plan <modDir> [--names a,b | --names-file f | --all-defs] --out <dir> [--sentinels good,bad] [--name <thin folder name>] [--target-name <id>]
//        [--game <dir>] [--exe <exe file> | --exe as64|mowas_2|mowas2|goh] [--map multi/m:mode] [--inst n]
//        modDir must be <game>/mods/<folder> (or give --game). writes mod.info, resource/set/multiplayer/preload (UTF-8 CRLF), run.json. never launches
//        --exe: an exe file, or a game word (the exe file of that game under --game). The game = the exe's name (lib/games): as64.exe,
//        mowas_2.exe, binaries/x64/call_to_arms.exe. No --exe: as64.exe, then mowas_2.exe, then binaries/x64/call_to_arms.exe under the game.
//        MoW:AS2 (mowas_2.exe): vfs mowas_2 (no as64/core), mods list without as64+.
//        GoH (call_to_arms.exe): no --game = the GoH install (lib/games install). Same preload file form and the same `Can't preload` line in
//        call_to_arms.exe [I]. The target mod may sit in <GoH>/mods or anywhere
//        (mounted by path); --out must not be among the GoH game files (lib/writeguard; a new folder under <GoH>/mods is allowed) and its name must pass the
//        GoH folder rule (no space, '-' or <>+()[]{}!@#$%^&*=;:|'"; gohweb vfs/goh-modinfo-version-rule). A target with no MinGameVersion is
//        fine on GoH (missing bound = open, same note). Default map multi/2v2_gelid:battle_zones. No control pipe on GoH
//        goh-drive.md): the step prints modswitch + uidrive goh lines, log = <GoH user dir>/log/game.log. Nothing is launched.
//   read <game.log | log dir> --plan <run.json> [--exe <exe>] [--crashed] [--out dir] [--json] [-q]
//        --crashed: the process died with no Exception block (testrun/gamewatch crashed-silent). --out: writes not_reached.txt for the next plan
//        verdict: COMPLETE | CRASHED | INCOMPLETE | NOT_CALIBRATED | INCONCLUSIVE. exit 0 only on COMPLETE. each entity: FAILED | NOT_REACHED | NO_ERROR
//   bisect --plan <run.json> (--crashed | --clean | --log <game.log>)
//        pending list crashed / ran clean; writes bisect/step-N-{a,b}.txt, loads the next list into the preload file, prints runs remaining
//
// file format, from source [V]: LoadPreloadList (86-108) reads `keyword "name"` pairs to `}` or EOF; keyword entity|human|sound
//   any case; no keyword or an unknown one = entity. Read at only when , so a multiplayer match is required.
// order [V]: s_scenePreloads is a flat_set sorted by name then texMod (:48-55), byte order, not file order, and shares roster items.
//   So the list is bracketed by marker names no def has: head (sorts first), a checkpoint after each entity, tail (sorts last). Each logs
//   `Can't preload the '<name>' entity` (CacheEntity, a miss in g_entityDescriptions, no def read), the only positive signal the engine gives.
//   Run id in the marker names: a stale log can't prove this run.
//   [T] until calibrated: markers land in the log in loop order, and crash window = the entity after the last marker seen.
// the plan keeps the winning base preload list: dropping those FX could raw-load them mid-match, outside quant = fatal [I].
// codes: PRELOAD_FAILED PRELOAD_CRASH PRELOAD_INCONCLUSIVE PRELOAD_NOT_CALIBRATED PRELOAD_INCOMPLETE WARN_PRELOAD_NOT_REACHED
//        WARN_PLAN_NAME_UNKNOWN WARN_PLAN_NO_BASE WARN_PLAN_NO_EXE WARN_PLAN_ORDER
// Author: Imperator_Aug (ARSENAL, ia-20cbe2c6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const cli = require('../lib/cli'), vfs = require('../lib/vfs'), exever = require('../lib/exever'), userdir = require('../lib/userdir'), games = require('../lib/games');
const { encodeText } = require('../lib/enc');
const { createReport } = require('../lib/report');
const { MARK } = require('../lib/gamewatch');

const PRELOAD_KEY = 'resource/set/multiplayer/preload', PRELOAD_REL = 'resource/set/multiplayer/preload';
const MODERN_MIN = [3, 301];   // newmod RANGE.as64; IsModern
const OWN_ENTRIES = new Set(['mod.info', 'resource', 'run.json', 'bisect', 'not_reached.txt']);
const CANT = /Can't preload the '([^']*)' entity/;
const q = s => '"' + s + '"';
const clean = s => String(s).trim().toLowerCase();
const die = m => { throw new Error(m); };

function splitNames(text) { return text.split(/[\r\n,]+/).map(s => s.replace(/#.*$/, '')).map(clean).filter(Boolean); }
function checkName(n) { if (/["\r\n\\]/.test(n)) die(`bad entity name: ${JSON.stringify(n)}`); return n; }
const uniq = a => [...new Set(a)];

// engine order: std::string < on the bytes as read from the file (UTF-8, ENCFIX)
function byteSort(names) {
  const b = new Map(names.map(n => [n, encodeText(n)]));
  return names.slice().sort((x, y) => Buffer.compare(b.get(x), b.get(y)));
}

// `keyword "name"` pairs, same reading as LoadPreloadList. returns [{kw,name}], order kept
function parsePreload(text) {
  const out = [], re = /(?:([A-Za-z_]\w*)\s+)?"([^"]*)"/g;
  const body = text.replace(/\/\/[^\r\n]*/g, '');
  let m;
  while ((m = re.exec(body))) {
    const k = (m[1] || 'entity').toLowerCase();
    out.push({ kw: k === 'human' || k === 'sound' ? k : 'entity', name: m[2].toLowerCase() });
  }
  return out;
}

// ---- current list: what the preload file holds, with its markers
function makeCurrent(names, plan, badIn) {
  const id = crypto.randomBytes(4).toString('hex');
  const head = `!psw${id}_a_head`, tail = `zzzzzz_psw${id}_tail`, cpSuffix = `!psw${id}`;
  const bad = badIn && badIn.kind !== 'missing' ? badIn : { name: `!psw${id}_b_bad`, kind: 'missing' };
  const good = plan.good;
  const entities = uniq(names.concat(bad.kind === 'missing' ? [] : [bad.name]).concat(good && good.kind === 'def' && !plan.base.some(b => b.name === good.name) ? [good.name] : []));
  const cps = {};
  for (const e of entities) cps[e] = e + cpSuffix;
  const kinds = new Map();
  for (const b of plan.base) kinds.set(b.name, 'base');
  for (const e of entities) kinds.set(e, 'entity');
  for (const e of entities) kinds.set(cps[e], 'cp');
  kinds.set(head, 'head'); kinds.set(tail, 'tail');
  if (bad.kind === 'missing') kinds.set(bad.name, 'bad');
  const order = byteSort([...kinds.keys()]);
  return { id, head, tail, bad, good, names: names.slice(), entities, cps, order, kinds: order.map(n => kinds.get(n)) };
}

function preloadText(cur, plan) {
  const seen = new Set(), L = [];
  const add = (kw, n) => { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); L.push(`${kw}\t${q(n)}`); } };
  // entities first: entries are unique by name, the first one kept (flat_set insert)
  add('entity', cur.head);
  if (cur.bad.kind === 'missing') add('entity', cur.bad.name);
  for (const e of byteSort(cur.entities)) { add('entity', e); add('entity', cur.cps[e]); }
  for (const b of plan.base) add(b.kw, b.name);
  add('entity', cur.tail);
  return L.join('\r\n') + '\r\n';
}

function writeCp1251(file, text) {
  const b = encodeText(text);   // as64 reads SDL strings as UTF-8
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}

function loadPreload(run, runDir) { writeCp1251(path.join(runDir, PRELOAD_REL), preloadText(run.current, run)); }

// ---- plan
function modInfo(thinName, target) {
  const L = ['{Mod', `\t{Name ${q('preloadsweep ' + thinName)}}`, `\t{Desc ${q('L3 preload sweep, test only')}}`];
  if (target.min) L.push(`\t{MinGameVersion ${q(target.min)}}`);
  if (target.max) L.push(`\t{MaxGameVersion ${q(target.max)}}`);
  L.push(`\t{Require ${q(target.id)}}`, '}', '');
  return L.join('\r\n');
}
function readRange(file) {
  const t = fs.readFileSync(file).toString('latin1');
  const get = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(t); return m ? m[1] : null; };
  return { min: get('MinGameVersion'), max: get('MaxGameVersion') };
}
const isModern = v => { const p = String(v || '').split('.').map(Number); return p[0] > MODERN_MIN[0] || (p[0] === MODERN_MIN[0] && (p[1] || 0) >= MODERN_MIN[1]); };
const within = (root, f) => { const r = path.relative(path.resolve(root), path.resolve(f)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

const WORDS = ['as64', 'mowas_2', 'mowas2', 'goh'];
const isWord = x => WORDS.includes(String(x || '').toLowerCase());
// game id of an --exe value (a game word or an exe file named like one of the games), else null
const gameOfExe = x => !x ? null : isWord(x) ? games.idOf(x) : games.idOf(path.basename(String(x)));
const GOH_MAP = 'multi/2v2_gelid:battle_zones';   // default skirmish map
// GoH skips a mods/ folder whose name has a byte >= 0x80, a space or one of these ( [V], gohweb vfs/goh-modinfo-version-rule)
const GOH_BAD_NAME = /[^\x21-\x7f]|[<>+()[\]{}!@#$%^&*\-=;:|'"]/;

function pickExe(o, game) {
  if (o.x.exe && isWord(o.x.exe)) return path.join(game, ...games.get(o.x.exe).file.split('/'));
  if (o.x.exe) return o.x.exe;
  for (const n of ['as64.exe', 'mowas_2.exe', 'binaries/x64/call_to_arms.exe']) { const p = path.join(game, ...n.split('/')); if (fs.existsSync(p)) return p; }
  return null;
}

function cmdPlan(o, rep) {
  const modDir = o.pos[1] && path.resolve(o.pos[1]);
  if (!modDir || !fs.existsSync(path.join(modDir, 'mod.info'))) die('plan: <modDir> with a mod.info required');
  const outDir = o.x.out ? path.resolve(o.x.out) : die('plan: --out <dir> required');
  const sources = [o.x.names, o.x['names-file'], o.x['all-defs']].filter(Boolean).length;
  if (sources !== 1) die('plan: give exactly one of --names, --names-file, --all-defs');
  const folder = path.basename(modDir);
  // GoH named by --exe and no --game: the GoH install (a word: lib/games install; a file: three folders up from binaries/x64/<exe>)
  let game;
  if (gameOfExe(o.x.exe) === 'goh' && !o.gameGiven) {
    game = isWord(o.x.exe) ? games.install('goh').dir : path.resolve(path.dirname(o.x.exe), '..', '..');
    if (!game) die('plan: no Gates of Hell install found: give --game <GoH folder>');
  } else game = o.gameDir ? path.resolve(o.gameDir) : path.dirname(path.dirname(modDir));
  const exePath = pickExe(o, game), gid = gameOfExe(exePath), isGoh = gid === 'goh';
  if (isGoh) {
    // GoH: the target is read only (mounted by path, wherever it is); the thin mod is written outside the GoH install
    const why = require('../lib/writeguard').refuseWrite(outDir, { purpose: 'write the preloadsweep thin mod' });
    if (why) die('plan: ' + why);
    const thin0 = o.x.name || path.basename(outDir);
    if (GOH_BAD_NAME.test(thin0)) die(`plan: thin mod name "${thin0}" never loads on GoH: no space, no byte >= 0x80, none of <>+()[]{}!@#$%^&*-=;:|'" (GoH folder rule, gohweb vfs/goh-modinfo-version-rule); give --name`);
  } else if (path.basename(path.dirname(modDir)).toLowerCase() !== 'mods' || !within(game, modDir)) die('plan: modDir must be <game>/mods/<folder>');
  if (within(modDir, outDir)) die('plan: --out inside the target mod refused');
  if (!isGoh && within(game, outDir) && !within(path.join(game, 'mods'), outDir)) die('plan: --out inside the game install, outside mods/, refused');
  if (fs.existsSync(outDir)) {
    const stray = fs.readdirSync(outDir).filter(n => !OWN_ENTRIES.has(n));
    let ours = !stray.length;
    if (ours && fs.existsSync(path.join(outDir, 'mod.info'))) { try { ours = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8')).tool === 'preloadsweep'; } catch { ours = false; } }
    if (!ours) die(`plan: ${outDir} holds files that are not a preloadsweep run: pick an empty folder`);
  }

  // vfs exe: the named game; an --exe file of no known name keeps the old rule (mowas in the name -> mowas_2, else as64); none named -> vfs picks
  const vexe = o.x.exe ? (games.exeOf(gid) || (/mowas/i.test(o.x.exe) ? 'mowas_2' : 'as64')) : isGoh ? 'goh' : undefined;
  const lay = folder.toLowerCase(), defs = new Set(), modDefs = new Set(), defPaths = new Map();
  const v = isGoh ? vfs.build({ gameDir: game, mods: [], modDirs: [{ dir: modDir, id: lay }], exe: vexe }) : vfs.build({ gameDir: game, mods: [folder], exe: vexe });
  for (const [key, rec] of v.files) {
    if (!key.startsWith('resource/entity/') || !key.endsWith('.def')) continue;
    const t = key.slice(key.lastIndexOf('/') + 1, -4);
    defs.add(t);
    (defPaths.get(t) || defPaths.set(t, []).get(t)).push(key);
    const l = String(rec.layer).toLowerCase();
    if (l === lay || l.startsWith(lay + ' patch')) modDefs.add(t);
  }
  let names;
  if (o.x.names) names = splitNames(o.x.names);
  else if (o.x['names-file']) names = splitNames(fs.readFileSync(o.x['names-file'], 'latin1'));
  else names = [...modDefs];
  names = uniq(names).map(checkName);
  if (!names.length) die('plan: entity list is empty');
  // same entity name under two def paths: the engine logs "Entity redefinition" and the first def wins [I], so the sweep tests one of them.
  // Static count only; compare with the log's redefinition lines [T]
  const redef = names.filter(n => (defPaths.get(n) || []).length > 1);
  if (redef.length) rep.info(redef[0], 0, 'WARN_PLAN_REDEFINED', `${redef.length} of ${names.length} planned names have 2+ def paths in the mounted set (first def wins; \`Entity redefinition\` lines expected in the log): ${redef.slice(0, 5).join(', ')}${redef.length > 5 ? ', ...' : ''}`);
  for (const n of names) if (!defs.has(n)) rep.add(n, 0, 'WARN_PLAN_NAME_UNKNOWN', 'no def of this name in the mounted set: expect a Can\'t preload line, not a load test');

  const baseRec = v.files.get(PRELOAD_KEY);
  const base = baseRec ? parsePreload(vfs.readRec(baseRec).toString('latin1')) : [];
  vfs.closeRecs && vfs.closeRecs(v);
  if (!base.length) rep.add(PRELOAD_REL, 0, 'WARN_PLAN_NO_BASE', 'no base preload list found: the thin mod replaces it with only the sweep list, effects it listed then load on demand');

  const [goodArg, badArg] = o.x.sentinels ? o.x.sentinels.split(',').map(clean) : [];
  if (o.x.sentinels && (!goodArg || !badArg)) die('--sentinels needs good,bad');
  const fallbackGood = base.find(b => b.kw === 'entity' && defs.has(b.name));
  const goodName = goodArg || (fallbackGood && fallbackGood.name) || null;
  if (goodArg && !defs.has(goodArg)) rep.add(goodArg, 0, 'WARN_PLAN_NAME_UNKNOWN', 'good sentinel has no def in the mounted set');
  const good = goodName ? { name: checkName(goodName), kind: 'def' } : null;
  const bad = badArg ? { name: checkName(badArg), kind: defs.has(badArg) ? 'def' : 'named-missing' } : null;

  let exe = null;
  if (exePath && fs.existsSync(exePath)) { const r = exever.check(exePath); exe = { path: exePath, name: r.name, sha: r.sha, short: r.short, known: r.known }; }
  else rep.add(exePath || 'exe', 0, 'WARN_PLAN_NO_EXE', 'no exe to hash: read can not give a verdict against a sha, pass --exe');

  const range = readRange(path.join(modDir, 'mod.info'));
  // GoH: each bound optional, missing = open ( [V], gohweb vfs/goh-modinfo-version-rule): the thin mod copies what is there
  if (!range.min && !isGoh) die('plan: target mod.info has no MinGameVersion: the exe refuses a mod with none (PORT-48), so the thin mod could not copy a range');
  const target = { dir: modDir, folder, id: (o.x['target-name'] || folder).toLowerCase(), min: range.min, max: range.max };
  checkName(target.id);
  const thinName = o.x.name || path.basename(outDir);
  const run = { tool: 'preloadsweep', version: 1, created: new Date().toISOString(), target, thin: { dir: outDir, name: thinName }, game, exe, map: o.x.map || (isGoh ? GOH_MAP : 'multi/1v1_road:combat'), inst: +(o.x.inst || 1), base, good, names, current: null, bisect: null };
  if (gid === 'goh' || gid === 'mowas2') run.gameId = gid;   // as64 run.json stays as it was
  run.current = makeCurrent(names, run, bad);

  const c = run.current, i = n => c.order.indexOf(n);
  if (i(c.head) !== 0) rep.add(c.order[0], 0, 'WARN_PLAN_ORDER', 'sorts before the head marker: its result can not be proven reached');
  if (i(c.tail) !== c.order.length - 1) rep.add(c.order[c.order.length - 1], 0, 'WARN_PLAN_ORDER', 'sorts after the tail marker: only a crash can speak for it');

  writeCp1251(path.join(outDir, 'mod.info'), modInfo(thinName, target));
  loadPreload(run, outDir);
  const runFile = path.join(outDir, 'run.json');
  fs.writeFileSync(runFile, JSON.stringify(run, null, 1));

  console.log(`read: ${folder} and base through vfs (${v.files.size} files, ${defs.size} entity defs, ${modDefs.size} in the target's layers)`);
  console.log(`wrote: ${outDir} (mod.info, ${PRELOAD_REL}, run.json), ${names.length} entities, ${base.length} base preload entries kept, run id ${c.id}`);
  console.log(`bad sentinel: ${c.bad.name} (${c.bad.kind}); good sentinel: ${good ? good.name : 'none'}`);
  if (c.bad.kind === 'missing') console.log('  a missing-name sentinel only proves preload ran and warnings reach the log. For broken-def detection use --sentinels good,<known broken def>');
  printStep(run, runFile);
  return 0;
}

function logFileFor(run) {
  if (run.gameId === 'goh') { const g = userdir.gohUserDir(); return g ? path.join(g, 'log', 'game.log') : '<GoH user dir>/log/game.log'; }
  const inst = run.gameId === 'mowas2' ? 0 : run.inst;   // mowas_2.exe has no -instance (TST-19): its log is the main user dir's
  const d = userdir.logDir(inst);
  return d ? path.join(d, 'game.log') : `<instance ${inst} log dir>/game.log`;
}
function modsArg(run) {
  const list = [q(run.target.folder), run.thin.name.includes(' ') ? q(run.thin.name) : run.thin.name];
  if (isModern(run.target.min) && !run.gameId) list.unshift('as64+');   // as64+ is AS64's own built-in mod: never on mowas_2 or GoH
  return list.join(',');
}
function printStep(run, runFile) {
  console.log('--- in-game step (L3): nothing was launched and nothing is tested yet');
  const goh = run.gameId === 'goh';
  const inMods = path.basename(path.dirname(run.thin.dir)).toLowerCase() === 'mods';
  if (goh) {
    // GoH: ARSENAL never writes into the GoH install; the user copies both folders in
    const tIn = path.basename(path.dirname(run.target.dir)).toLowerCase() === 'mods' && within(run.game, run.target.dir);
    if (!tIn) console.log(`0. copy ${run.target.dir} to <GoH>/mods/${run.target.folder}`);
    console.log(`0. copy ${run.thin.dir} to <GoH>/mods/${run.thin.name} (by hand: ARSENAL does not write into the GoH install)`);
  } else if (!inMods) console.log(`0. copy ${run.thin.dir} to <game>/mods/${run.thin.name}`);
  console.log(`1. exe to read against: ${run.exe ? `${run.exe.path} sha256 ${run.exe.sha}${run.exe.known ? '' : ' (NOT in modweb/porting/exe-versions.md: log it)'}` : 'UNKNOWN'}`);
  console.log(`2. multiplayer match required (preload list is read only in one). mods, this order: ${run.target.folder}, ${run.thin.name}`);
  if (goh) {
    console.log(`   no control pipe and no testrun on GoH (modweb/testing/goh-drive.md). With the game closed, enable the mods:`);
    console.log(`   node tools/modswitch/modswitch.js --game "${run.game}" --profile "<GoH user dir>/profiles/<id>/options.set" --set ${run.target.folder.toLowerCase()},${run.thin.name.toLowerCase()} --write`);
    console.log(`   then host a skirmish (${run.map}) by hand, or: node tools/uidrive/uidrive.js play goh boot,skirmish; wait for the load to end or crash`);
  } else if (run.gameId === 'mowas2') {
    console.log(`   mowas_2.exe has no -control and no -instance (limits TST-19), so no testrun line: host a LAN match with mods ${modsArg(run)} by hand, wait for the load to end or crash`);
  } else {
    console.log(`   node tools/testrun/testrun.js --exe "${run.exe ? run.exe.path : '<exe>'}" --map ${run.map} --mods '${modsArg(run)}' --inst ${run.inst} --hold 5 --timeout 300`);
    console.log(`   no control pipe on this exe: host a LAN match with those mods by hand, wait for the load to end or crash`);
  }
  console.log(`3. node tools/preloadsweep/preloadsweep.js read "${logFileFor(run)}" --plan "${runFile}"`);
}

// ---- read
function parseLog(text) {
  const lines = text.split(/\r?\n/), cant = [], exceptions = [];
  let cmd = null, build = null;
  lines.forEach((ln, i) => {
    if (cmd === null && /^(?:\[[^\]]*\]\s*)?CMD(?::| =)/.test(ln)) cmd = ln;   // AS2 `CMD:`, GoH `CMD = ` (gohweb logs/goh-game-log)
    if (build === null && /^(?:\[[^\]]*\]\s*)?Build:/.test(ln)) build = ln.trim();
    const m = CANT.exec(ln);
    if (m) cant.push({ name: m[1].toLowerCase(), line: i + 1 });
    if (MARK.test(ln)) {
      let msg = '', file = null;
      for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
        if (MARK.test(lines[j])) break;
        if (!msg && lines[j].trim()) msg = lines[j].trim().replace(/^\[\d\d:\d\d:\d\d\] /, '');
        const f = /^(?:\[\d\d:\d\d:\d\d\] )?>\s*file\s+"([^"]+)"/.exec(lines[j]);   // GoH stamps every line (GHLOG-07)
        if (f) file = f[1];
      }
      exceptions.push({ line: i + 1, msg, file });
    }
  });
  return { lines, cant, exceptions, cmd, build };
}

// pure: plan's current list + parsed log -> per-entity results and verdict inputs
function classify(cur, log, crashedFlag) {
  const idx = new Map(cur.order.map((n, i) => [n, i])), kind = new Map(cur.order.map((n, i) => [n, cur.kinds[i]]));
  const isMarker = n => ['head', 'tail', 'cp', 'bad'].includes(kind.get(n));
  // a second load in one session repeats the head: judge the last pass
  let from = 0;
  for (const c of log.cant) if (c.name === cur.head) from = c.line;
  const events = log.cant.filter(c => c.line >= from), seq = events.filter(c => isMarker(c.name));
  const signal = seq.length > 0;
  let ordered = true;
  for (let i = 1; i < seq.length; i++) if (idx.get(seq[i].name) <= idx.get(seq[i - 1].name)) ordered = false;
  const lastSeen = signal ? Math.max(...seq.map(c => idx.get(c.name))) : -1;
  const tailEvent = seq.find(c => c.name === cur.tail) || null;
  const exAll = log.exceptions.filter(e => e.line >= from);
  const exInside = tailEvent ? exAll.filter(e => e.line < tailEvent.line) : exAll;
  const crash = signal && (exInside.length > 0 || (!!crashedFlag && !tailEvent));
  const crashAfter = !!tailEvent && (exAll.some(e => e.line > tailEvent.line) || !!crashedFlag);
  const ex = exInside[0] || null;
  const failedBy = new Map();
  for (const c of events) if (!failedBy.has(c.name)) failedBy.set(c.name, c.line);

  const results = new Map();
  const sorted = byteSort(cur.entities);
  let assigned = false, crashEntity = null;
  for (const e of sorted) {
    const at = idx.get(e);
    if (failedBy.has(e)) { results.set(e, { status: 'FAILED', how: 'cant_preload', line: failedBy.get(e), why: `Can't preload line ${failedBy.get(e)}` }); continue; }
    if (!signal) { results.set(e, { status: 'NOT_REACHED', why: 'no sign preload ran' }); continue; }
    if (tailEvent && !crash) { results.set(e, { status: 'NO_ERROR', why: 'loop finished, no error line' }); continue; }
    if (!ordered) { results.set(e, { status: 'NOT_REACHED', why: 'markers out of order: position unknown' }); continue; }
    if (at < lastSeen) { results.set(e, { status: 'NO_ERROR', why: 'a later marker logged, no error line' }); continue; }
    if (crash && !assigned) {
      assigned = true; crashEntity = e;
      const between = cur.order.slice(lastSeen + 1, at).filter(n => kind.get(n) === 'base');
      const also = between.length ? `; base entries in the same window: ${between.slice(0, 5).join(', ')}` : '';
      const said = ex ? `; ${ex.msg}${ex.file ? ` in ${ex.file}` : ''}` : '; no Exception block';
      // the Exception's file names the def being read: another name = probably a roster/base item in the window, not this entity [I]
      const fb = ex && ex.file ? ex.file.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]*$/, '').toLowerCase() : null;
      const other = fb && /\.def$/i.test(ex.file) && fb !== e ? `; Exception file ${fb}.def is not this entity: likely another item in the window` : '';
      results.set(e, { status: 'FAILED', how: 'crash', line: ex ? ex.line : 0, why: `crash in its window, after marker ${cur.order[lastSeen]}${also}${said}${other}. A roster item sorting in this window would look the same` });
      continue;
    }
    results.set(e, { status: 'NOT_REACHED', why: crash ? 'after the crash' : 'no later marker in the log' });
  }

  // log lines in each entity's window: not failures, kept for the reader
  if (signal && ordered) {
    let walk = -1, ei = 0;
    const next = () => { while (ei < sorted.length && idx.get(sorted[ei]) <= walk) ei++; return sorted[ei]; };
    const byLine = new Map(seq.map(c => [c.line, c.name]));
    for (let ln = Math.max(from, 1); ln <= log.lines.length; ln++) {
      const name = byLine.get(ln);
      if (name) { walk = idx.get(name); if (name === cur.tail) break; continue; }
      const text = log.lines[ln - 1];
      if (!/^\[\d\d:\d\d:\d\d\]/.test(text)) continue;
      const e = next();
      if (!e) break;
      if ((CANT.exec(text) || [])[1] === e) continue;
      const r = results.get(e);
      if (r) (r.logged = r.logged || []).push({ line: ln, text: text.trim().slice(0, 160) });
    }
  }

  // bad sentinel: caught = an error at it. silent = passed it, nothing said. not reached = crash or log end came first
  let bad;
  const badAt = idx.get(cur.bad.name);
  if (failedBy.has(cur.bad.name)) bad = 'CAUGHT';
  else if (crashEntity === cur.bad.name) bad = 'CAUGHT';
  else if (signal && (tailEvent || (ordered && badAt < lastSeen))) bad = 'SILENT';
  else bad = 'NOT_REACHED';
  const goodAt = cur.good ? idx.get(cur.good.name) : -1;
  const good = !cur.good ? null : failedBy.has(cur.good.name) || crashEntity === cur.good.name ? 'FAILED'
    : signal && (tailEvent || (ordered && goodAt < lastSeen)) ? 'NO_ERROR' : 'NOT_REACHED';
  return { signal, ordered, tail: !!tailEvent, crash, crashAfter, ex, crashEntity, results, bad, good, seq, from, reachedLast: lastSeen >= 0 ? cur.order[lastSeen] : null };
}

function checkExe(run, o) {
  const issues = [], want = run.exe;
  const nowPath = (o.x.exe && !isWord(o.x.exe) ? o.x.exe : null) || (want && want.path);
  let now = null;
  if (nowPath && fs.existsSync(nowPath)) now = exever.identify(nowPath);
  if (!want) issues.push('plan holds no exe sha');
  else if (now && now.sha !== want.sha) issues.push(`exe ${now.name} is sha ${now.short}, the plan was made for ${want.short}`);
  return { want, now, issues };
}

function cmdRead(o, rep) {
  const target = o.pos[1] || die('read: <gameLogFile> required');
  const planFile = o.x.plan || die('read: --plan <run.json> required');
  const run = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const logFile = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, 'game.log') : target;
  const rel = path.basename(logFile);
  const log = parseLog(fs.readFileSync(logFile).toString('utf8'));
  const cur = run.current, c = classify(cur, log, !!o.x.crashed);
  const exe = checkExe(run, o);

  const logExe = log.cmd && /([^\\/"\s]+\.exe)/i.exec(log.cmd);
  if (exe.want && logExe && logExe[1].toLowerCase() !== exe.want.name.toLowerCase()) exe.issues.push(`log ran ${logExe[1]}, the plan was made for ${exe.want.name}`);

  let verdict, why;
  if (!c.signal) {
    verdict = 'INCONCLUSIVE';
    why = `nothing proves preload ran: no marker of run ${cur.id} in this log (wrong log, stale log, mod not mounted, not a multiplayer match, or crash before preload)`;
    if (log.exceptions.length) why += `. Exception at line ${log.exceptions[0].line} came before any marker: ${log.exceptions[0].msg}`;
  } else if (exe.issues.length) {
    verdict = 'INCONCLUSIVE'; why = exe.issues.join('; ');
  } else if (!c.ordered) {
    verdict = 'INCONCLUSIVE'; why = 'markers came out of the engine sort order: the positional reading fails on this exe, re-check scene preload order';
  } else if (c.good === 'FAILED') {
    verdict = 'INCONCLUSIVE'; why = `good sentinel ${cur.good.name} failed: the target may not be mounted, or the sentinel is not good`;
  } else if (c.bad !== 'CAUGHT') {
    verdict = 'NOT_CALIBRATED';
    why = `known-bad sentinel ${cur.bad.name} ${c.bad === 'SILENT' ? 'gave no error' : 'was not reached'}: sweep NOT CALIBRATED, every NO_ERROR is meaningless`;
  } else if (c.crash) {
    verdict = 'CRASHED'; why = c.crashEntity ? `crash in the window of ${c.crashEntity}` : `crash after the last entity's marker, in a base or roster item`;
  } else if (!c.tail) {
    verdict = 'INCOMPLETE'; why = 'preload began but the tail marker is missing and no crash was seen: log cut off or game still loading';
  } else {
    verdict = 'COMPLETE'; why = 'head and tail markers logged, bad sentinel caught';
  }

  const rows = cur.names.map(n => ({ name: n, ...c.results.get(n) }));
  const count = s => rows.filter(r => r.status === s).length;
  if (verdict === 'INCONCLUSIVE' && !c.signal) for (const r of rows) r.status = 'NOT_REACHED';

  const out = o.x.json ? null : console.log;
  const sentinel = `bad ${cur.bad.name} (${cur.bad.kind}): ${c.bad}; good ${cur.good ? cur.good.name : 'none'}: ${c.good || '-'}`;
  const calLevel = verdict === 'NOT_CALIBRATED' || c.bad !== 'CAUGHT' ? 'NOT CALIBRATED'
    : cur.bad.kind === 'def' ? 'calibrated on a real def' : 'calibrated on a missing name only: broken-def detection unproven';
  if (out) {
    out(`VERDICT: ${verdict}: ${why}`);
    out(`exe: ${exe.want ? `${exe.want.name} sha256 ${exe.want.sha}` : 'UNKNOWN'}${exe.now && exe.want && exe.now.sha === exe.want.sha ? ' (file re-hashed, same)' : exe.now ? '' : ' (file not re-hashed)'}${log.build ? `; log ${log.build}` : ''}`);
    out(`signal: ${c.signal ? `${c.seq.length} marker lines, last ${c.reachedLast}, tail ${c.tail ? 'seen' : 'NOT seen'}` : 'NONE'}`);
    out(`sentinels: ${sentinel}: ${calLevel}`);
    if (c.crashAfter) out('crash after the tail marker: not from the preload loop, not attributed to an entity');
    for (const r of rows) {
      if (o.q && r.status === 'NO_ERROR') continue;
      const extra = r.logged ? ` [${r.logged.length} log line(s) in window, first ${r.logged[0].line}: ${r.logged[0].text}]` : '';
      out(`${r.status} ${r.name}: ${r.why}${extra}`);
    }
    out(`counts: FAILED ${count('FAILED')}, NOT_REACHED ${count('NOT_REACHED')}, NO_ERROR ${count('NO_ERROR')} of ${rows.length}`);
    out('Reminder: NO_ERROR only means no error line for that entity. It is not a pass, and a def read does not spawn the unit.');
  } else {
    console.log(JSON.stringify({ verdict, why, exe: exe.want, signal: c.signal, tail: c.tail, crash: c.crash, sentinels: { bad: c.bad, good: c.good, level: calLevel }, entities: rows }, null, 1));
  }

  if (verdict === 'INCONCLUSIVE') rep.add(rel, 0, 'PRELOAD_INCONCLUSIVE', why);
  if (verdict === 'NOT_CALIBRATED') rep.add(rel, 0, 'PRELOAD_NOT_CALIBRATED', why);
  if (verdict === 'INCOMPLETE') rep.add(rel, 0, 'PRELOAD_INCOMPLETE', why);
  if (c.crash) rep.add(rel, c.ex ? c.ex.line : 0, 'PRELOAD_CRASH', `${c.ex ? c.ex.msg : 'no Exception block'}; suspect ${c.crashEntity || 'none'}`);
  for (const r of rows) if (r.status === 'FAILED') rep.add(rel, r.line || 0, 'PRELOAD_FAILED', `${r.name}: ${r.why}`);
  const nr = rows.filter(r => r.status === 'NOT_REACHED');
  if (nr.length) rep.add(rel, 0, 'WARN_PRELOAD_NOT_REACHED', `${nr.length} entities not proven reached`);
  if (o.x.out && nr.length) {
    fs.mkdirSync(o.x.out, { recursive: true });
    fs.writeFileSync(path.join(o.x.out, 'not_reached.txt'), nr.map(r => r.name).join('\r\n') + '\r\n');
    if (out) out(`next: ${path.join(o.x.out, 'not_reached.txt')} holds the ${nr.length} unreached: plan again with --names-file`);
  }
  return verdict === 'COMPLETE' ? 0 : 1;
}

// ---- bisect. pending = the list in the preload file. stack = lists still owed a run
function oneCrasherWorst(n) {     // n entities known to hold exactly one crasher
  if (n <= 1) return 0;
  const a = Math.ceil(n / 2), b = n - a;
  return 1 + Math.max(oneCrasherWorst(a) + 1, oneCrasherWorst(b));
}
function remaining(b) {
  if (!b.pending) return { oneCrasher: 0, worst: 0 };
  const stackRuns = b.stack.filter(s => !s.mustCrash).length;
  const worstOf = s => s.mustCrash ? 2 * s.names.length - 2 : 2 * s.names.length - 1;
  const p = b.pending.names.length;
  const top = b.stack[b.stack.length - 1];
  const crashPath = 1 + oneCrasherWorst(p) + stackRuns;
  const cleanPath = 1 + (b.pending.sib && top ? oneCrasherWorst(top.names.length) + Math.max(0, stackRuns - 1) : stackRuns);
  return { oneCrasher: Math.max(crashPath, cleanPath), worst: 2 * p - 1 + b.stack.reduce((t, s) => t + worstOf(s), 0) };
}

function split(names, b, runDir, step) {
  const s = byteSort(names), half = Math.ceil(s.length / 2), a = s.slice(0, half), c = s.slice(half);
  const dir = path.join(runDir, 'bisect');
  fs.mkdirSync(dir, { recursive: true });
  const fa = path.join(dir, `step-${step}-a.txt`), fb = path.join(dir, `step-${step}-b.txt`);
  fs.writeFileSync(fa, a.join('\r\n') + '\r\n');
  fs.writeFileSync(fb, c.join('\r\n') + '\r\n');
  console.log(`split ${s.length} -> A ${a.length} (${path.relative(runDir, fa)}), B ${c.length} (${path.relative(runDir, fb)})`);
  b.stack.push({ names: c, mustCrash: false });
  b.pending = { names: a, sib: true };
}

function advance(b, runDir) {
  b.pending = null;
  while (b.stack.length) {
    const next = b.stack.pop();
    if (!next.mustCrash) { b.pending = { names: next.names, sib: false }; return; }
    if (next.names.length === 1) { b.crashers.push({ name: next.names[0], inferred: true }); console.log(`crasher (inferred, sibling list ran clean): ${next.names[0]}`); continue; }
    b.step++;
    split(next.names, b, runDir, b.step);
    return;
  }
}

function cmdBisect(o) {
  const planFile = o.x.plan || die('bisect: --plan <run.json> required');
  const run = JSON.parse(fs.readFileSync(planFile, 'utf8')), runDir = path.dirname(path.resolve(planFile));
  let result = o.x.crashed ? 'crashed' : o.x.clean ? 'clean' : null;
  if (o.x.crashed && o.x.clean) die('bisect: --crashed or --clean, not both');
  if (o.x.log) {
    const c = classify(run.current, parseLog(fs.readFileSync(o.x.log).toString('utf8')), false);
    if (!c.signal) die(`bisect: ${o.x.log} holds no marker of run ${run.current.id}: it proves nothing, list not judged`);
    result = c.crash ? 'crashed' : c.tail ? 'clean' : die(`bisect: ${o.x.log} has no crash and no tail marker: list not judged`);
    console.log(`log says: ${result}`);
  }
  if (!result) die('bisect: --crashed, --clean or --log <game.log> required');

  let b = run.bisect;
  if (!b) {
    if (result !== 'crashed') die('bisect: nothing to narrow, the run did not crash');
    const skip = run.current.bad.kind === 'def' ? run.current.bad.name : null;
    const names = run.names.filter(n => n !== skip);
    if (skip) console.log(`bad sentinel ${skip} left out of the lists, it would crash each one; a missing-name sentinel stands in`);
    if (!names.length) die('bisect: no entities left to split');
    b = run.bisect = { step: 0, runs: 1, crashers: [], clean: [], stack: [], pending: { names, sib: false } };
  } else {
    if (!b.pending) die(`bisect: finished already. crashers: ${b.crashers.map(c => c.name).join(', ') || 'none'}`);
    b.runs++;
  }

  if (result === 'clean') {
    b.clean.push(...b.pending.names);
    const top = b.stack[b.stack.length - 1];
    if (b.pending.sib && top) top.mustCrash = true;
    advance(b, runDir);
  } else if (b.pending.names.length === 1) {
    b.crashers.push({ name: b.pending.names[0], inferred: false });
    console.log(`crasher (its own run crashed): ${b.pending.names[0]}`);
    advance(b, runDir);
  } else {
    b.step++;
    split(b.pending.names, b, runDir, b.step);
  }

  const bad = run.current.bad.kind === 'def' ? null : run.current.bad;
  if (b.pending) {
    run.current = makeCurrent(b.pending.names, run, bad);
    loadPreload(run, runDir);
    console.log(`loaded: ${b.pending.names.length} entities into ${PRELOAD_REL}, run id ${run.current.id}`);
    console.log('run the same in-game step, then: bisect --plan run.json --crashed | --clean | --log <game.log>');
  } else {
    const c = b.crashers.map(x => x.name + (x.inferred ? ' (inferred)' : '')).join(', ') || 'none';
    console.log(`done after ${b.runs} run(s). crashers: ${c}. cleared by a clean run: ${b.clean.length}`);
  }
  fs.writeFileSync(planFile, JSON.stringify(run, null, 1));
  const r = remaining(b);
  console.log(`runs remain: ${r.oneCrasher ? `at most ${r.oneCrasher} if one crasher is left, at most ${r.worst} if every entity crashes` : 0}`);
  return 0;
}

const SPEC = { flags: ['--all-defs', '--crashed', '--clean', '--json'], values: ['--names', '--names-file', '--out', '--sentinels', '--name', '--target-name', '--exe', '--map', '--inst', '--plan', '--log'] };
function main() {
  const o = cli.parse(process.argv.slice(2), SPEC);
  o.gameGiven = process.argv.slice(2).includes('--game');
  const stray = o.pos.find(a => a.startsWith('--'));
  if (stray) die(`unknown option ${stray}`);
  const sub = o.pos[0];
  if (sub === 'bisect') { process.exitCode = cmdBisect(o); return; }
  if (sub !== 'plan' && sub !== 'read') die('usage: preloadsweep plan|read|bisect (see the file header)');
  const rep = createReport();
  const rc = sub === 'plan' ? cmdPlan(o, rep) : cmdRead(o, rep);
  if (!(o.x.json && sub === 'read')) rep.print({ showInfo: !o.q });
  process.exitCode = rc;
}
if (require.main === module) cli.run(main);
module.exports = { parsePreload, byteSort, makeCurrent, preloadText, parseLog, classify, oneCrasherWorst };
