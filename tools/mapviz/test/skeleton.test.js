// skeleton test: the mapviz dispatcher (literal parts table, "not built", faults, part help), the shared helpers
// (parseArgs, progress and cancel, writeAtomic), palette.json shape and the README anchors.
// usage: node tools/mapviz/test/skeleton.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-34a44c93)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const DIR = path.resolve(__dirname, '..');
const MV = path.join(DIR, 'mapviz.js');
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-skeleton-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz skeleton: ' + what); } }
function run(args, cwd) {
  const r = spawnSync(process.execPath, [MV].concat(args), { cwd: cwd || W, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

const mv = require(MV);
const SRC = fs.readFileSync(MV, 'utf8');

// ---- 1. the parts table is literal and matches the folders ----
const SKIP = /^(test|cache|node_modules|dist|out|work|_retired)$/;   // folder names the exe build skips
const re = /\{ part: '([a-z]+)', id: '(MV-[A-Z0-9]+)', wave: '([A-E])', dir: '([a-z/]+)',(?: lead: '([a-z]+)',)? load: \(\) => opt\(\(\) => require\('\.\/([a-z/]+)\/cli'\), '\.\/([a-z/]+)\/cli'\) \}/g;
const lit = [];
let m;
while ((m = re.exec(SRC))) lit.push({ part: m[1], id: m[2], wave: m[3], dir: m[4], lead: m[5], req: m[6], spec: m[7] });
ok(lit.length === mv.PARTS.length && lit.length >= 13, 'every PARTS entry is a literal line (' + lit.length + ' of ' + mv.PARTS.length + ')');
for (const l of lit) {
  const p = mv.PARTS.find(x => x.part === l.part);
  ok(p && p.id === l.id && p.wave === l.wave && p.dir === l.dir, 'table entry ' + l.part + ' matches the export');
  ok(l.req === l.dir && l.spec === l.dir, 'entry ' + l.part + ' requires ./' + l.dir + '/cli and names the same spec');
  ok(l.dir.split('/').every(s => !SKIP.test(s)), 'folder ' + l.dir + ' is not a name the exe build skips');
}
for (const need of ['mapkit', 'raster', 'jobs', 'work', 'entcat', 'water', 'pass', 'render', 'sight', 'cover', 'paint', 'previews', 'strong'])
  ok(!!mv.findPart(need), 'part ' + need + ' is in the table');
ok(!/require\([^)]*edshot/.test(SRC), 'mapviz.js never requires edshot');
ok(!mv.PARTS.some(p => /edshot|bc1|scenecache/.test(p.part + p.dir)), 'edshot, bc1 and scenecache are not in the table');
ok(new Set(mv.PARTS.map(p => p.part)).size === mv.PARTS.length, 'part names are unique');

// ---- 2. fixed numbers ----
ok(JSON.stringify(mv.EXIT) === JSON.stringify({ OK: 0, FINDINGS: 1, USAGE: 2, NOT_FOUND: 3, NOT_BUILT: 4, CANCELLED: 5, REFUSED: 6, BUSY: 7 }), 'exit code table');
ok(mv.CODES.MV_NOT_BUILT === 4 && mv.CODES.MV_CANCELLED === 5 && mv.CODES.MV_FAULT === 2, 'error code table');
ok(mv.TARGETS.as64 === 'as64' && mv.TARGETS.mowas2 === 'mowas_2' && mv.TARGETS.goh === 'goh' && Object.keys(mv.TARGETS).length === 3, 'target -> exe id');
ok(mv.CONTRACT === 4, 'contract 4 (waves C and D)');
ok(/^const CONTRACT = 4;/m.test(SRC), 'CONTRACT is a literal line');

// ---- 2b. waves C and D: the commands each part's cli lists and its VERSION (drafts rules.md, render.md, paint.md,
// previews.md, jobs.md 6). Checked only for a part whose cli.js is there and loads; a part not built yet is skipped.
const WANT = {
  sight: { cmds: ['grid', 'view', 'pair', 'profile'], version: 1 },
  cover: { cmds: ['map', 'profile'], version: 1 },
  pass: { cmds: ['terrain', 'obstacles', 'travel', 'routes'], version: 3 },
  strong: { cmds: ['points', 'checks', 'presets'], version: 1 },
  render: { cmds: ['l0', 'l1', 'c0', 'l2', 'pack', 'l3', 'l4'], version: 5 },
  paint: { cmds: ['styles', 'draw', 'marks'], version: 1 },
  previews: { cmds: ['plan', 'write', 'check', 'undo'], version: 1 },
};
const cmdGaps = mv => {
  const out = [];
  for (const name of Object.keys(WANT)) {
    const p = mv.findPart(name);
    if (!p) { out.push(name + ': not in the table'); continue; }
    let c = null; try { c = p.load(); } catch (e) { out.push(name + ': cli does not load: ' + e.message); continue; }
    if (!c) continue;
    const have = Object.keys(c.commands || {});
    const miss = WANT[name].cmds.filter(k => !have.includes(k));
    if (miss.length) out.push(name + ': no command ' + miss.join(', '));
    if (c.version !== WANT[name].version) out.push(name + ': version ' + c.version + ', want ' + WANT[name].version);
  }
  return out;
};
{
  const gaps = cmdGaps(mv);
  ok(!gaps.length, 'wave C and D parts list their commands and versions: ' + gaps.join('; '));
  // seeded: a planted table whose render cli lacks l4 and has an old version is caught
  const fake = { findPart: n => (n === 'render' ? { load: () => ({ version: 4, commands: { l0: {}, l1: {}, c0: {}, l2: {}, pack: {}, l3: {} }, run() { } }) } : { load: () => null }) };
  const g2 = cmdGaps(fake);
  ok(g2.some(s => s === 'render: no command l4') && g2.some(s => s === 'render: version 4, want 5') && g2.length === 2, 'seeded: a part without l4 and with an old version is caught (' + g2.join('; ') + ')');
}

// ---- 2c. integration rulings R-a to R-g (waves C and D). Each check is skipped while its part is not built; the
// three games share one rule, so each runtime check runs for as64, mowas2 and goh.
const GAMES = ['as64', 'mowas2', 'goh'];
const tryReq = rel => { try { return require(path.join(DIR, rel)); } catch (e) { return null; } };
// source files of the built parts and the page (no tests, no work folders): the scans below read these
function srcFiles() {
  const out = [], roots = [DIR, path.join(DIR, '..', 'gui', 'ext', 'mapviz')];
  const walk = d => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (e.isDirectory()) { if (!/^(test|cache|node_modules|work|out|_retired|edshot)$/.test(e.name)) walk(path.join(d, e.name)); }
      else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(path.join(d, e.name));
    }
  };
  for (const r of roots) walk(r);
  return out;
}
const scan = (files, re) => files.filter(f => { try { return re.test(fs.readFileSync(f, 'utf8')); } catch (e) { return false; } }).map(f => path.relative(DIR, f).replace(/\\/g, '/'));
const SRCS = srcFiles();
ok(SRCS.length > 20 && SRCS.some(f => /paint[\\/]index\.js$/.test(f)), 'rulings: the source scan finds the part files (' + SRCS.length + ')');
ok(scan([MV], /edshot/).length === 1 && scan([path.join(DIR, 'nosuch.js')], /x/).length === 0, 'seeded: the scan reads a file and skips a missing one');
{ // R-a: the viewshed vector is sight.rings (file sight.rings.json); the grid sight.view keeps its name
  const T = tryReq('jobs/table');
  const v = T && T.JOBS && T.JOBS.view;
  if (v) {
    ok(v.part === 'sight' && v.cmd === 'view', 'R-a: job row view runs sight view');
    ok(v.products.includes('sight.rings.json') && v.products.includes('sight.view') && !v.products.includes('sight.view.json'), 'R-a: job row view lists sight.rings.json and the grid sight.view (' + v.products.join(',') + ')');
    ok(v.needs.slice().sort().join() === 'doc,entcat,grids,sight', 'R-a: job row view needs doc, grids, entcat, sight (' + v.needs.join(',') + ')');
    ok(!Object.keys(T.JOBS).some(k => (T.JOBS[k].products || []).includes('sight.view.json')), 'R-a: no job row lists sight.view.json');
  }
  const sv = mv.findPart('sight'); let sc = null; try { sc = sv && sv.load(); } catch (e) { }
  if (sc) ok(/sight\.rings\.json/.test((sc.commands.view || {}).summary || ''), 'R-a: sight view says it writes sight.rings.json');
  const old = scan(SRCS, /sight\.view\.json/);
  ok(!old.length, 'R-a: no part or page source names sight.view.json ' + old.join(' '));
  // the old shell fix row "GET sight/pair is not built" is void: the layers sub-page serves it; the shell keeps no vector alias
  const SUB = path.join(DIR, '..', 'gui', 'ext', 'mapviz', 'sub');
  ok(scan([path.join(SUB, 'layers.server.js')], /R\['GET \/api\/x\/mapviz\/sight\/pair'\]/).length === 1, 'layers.server.js serves GET /api/x/mapviz/sight/pair');
  ok(!scan([path.join(SUB, 'shell.server.js')], /VECTOR_ALIAS/).length, 'shell.server.js keeps no VECTOR_ALIAS');
}
// R-b: CONTRACT 4 is checked in section 2.
{ // R-c: runOnce is gone from the jobs runner, and no built part or page calls it
  const J = tryReq('jobs/index');
  if (J) ok(typeof J.runOnce === 'undefined' && !(J.runner && typeof J.runner.runOnce !== 'undefined'), 'R-c: jobs/index has no runOnce');
  const calls = scan(SRCS, /\brunOnce\b/);
  ok(!calls.length, 'R-c: no part or page source calls runOnce ' + calls.join(' '));
}
{ // R-d: a bad input from code -> MV_FAULT PAINT_DRAW_BAD; a bad argument -> MV_USAGE; PAINT_INPUT_BAD is not used
  const used = scan(SRCS, /PAINT_INPUT_BAD/);
  ok(!used.length, 'R-d: no source uses PAINT_INPUT_BAD ' + used.join(' '));
  const cv = tryReq('paint/canvas'), pi = tryReq('paint/index');
  const errOf = fn => { try { fn(); return null; } catch (e) { return { code: e.code, detail: e.detail && e.detail.code }; } };
  if (cv && typeof cv.color === 'function') {
    const e = errOf(() => cv.color('#12345'));
    ok(e && e.code === 'MV_FAULT' && e.detail === 'PAINT_DRAW_BAD', 'R-d: a bad palette entry gives MV_FAULT PAINT_DRAW_BAD (' + JSON.stringify(e) + ')');
    ok(errOf(() => cv.color('#123456')) === null, 'R-d: a good palette entry passes');
  }
  if (pi && typeof pi.frameFor === 'function') {
    const e = errOf(() => pi.frameFor({ boxes: { world: [0, 0, 100, 100] } }, { size: 64, box: [10, 10, 0, 0] }));
    ok(e && e.code === 'MV_FAULT' && e.detail === 'PAINT_DRAW_BAD', 'R-d: a bad frame gives MV_FAULT PAINT_DRAW_BAD (' + JSON.stringify(e) + ')');
  }
  if (mv.findPart('paint') && fs.existsSync(path.join(DIR, 'paint', 'cli.js'))) {
    for (const g of GAMES) {
      const r = run(['paint', 'draw', '--target', g, '--map', 'multi/x', '--style', 'staff', '--size', 'big', '--json']);
      let j = null; try { j = JSON.parse(r.out); } catch (e) { }
      ok(r.code === 2 && j && j.error && j.error.code === 'MV_USAGE', 'R-d: ' + g + ': a bad --size on paint draw gives MV_USAGE exit 2 (got ' + r.code + ')');
    }
  }
}
// R-e: a README matter (the clerk writes the code's form); nothing to run here.
{ // R-f: phase null = the lowest phase of the mode, on every game (rules/pass resolvePhase; strong uses it when built)
  const P = tryReq('rules/pass/speed');
  if (P && typeof P.resolvePhase === 'function') {
    for (const g of GAMES) {
      const id = g === 'goh' ? 'frontlines' : 'frontline';
      const doc = { modes: [{ id, spawns: [{ team: 'a', phase: 3 }, { team: 'b', phase: 2 }], flags: [{ phase: null }], clipsBySide: [{ team: 'a', phase: 4, clip: 'x' }] },
        { id: 'battle_zones', spawns: [{ team: 'a', phase: null }], flags: [], clipsBySide: [] }] };
      ok(P.resolvePhase(doc, id, null) === 2, 'R-f: ' + g + ': phase null resolves to the lowest phase of the mode (2)');
      ok(P.resolvePhase(doc, id, 4) === 4, 'R-f: ' + g + ': a given phase is kept');
      ok(P.resolvePhase(doc, 'battle_zones', null) === null, 'R-f: ' + g + ': a mode without phases resolves to null');
    }
  }
}
{ // R-g: left out of version 1 on all three games: the per-flag nearness slider and weights, "with spotters", "enemy has
  // an officer". The page (code and lang files) offers none of them; the rules keep officer as a sight viewer kind and
  // strong keeps its own path nearness factor, which are not these controls.
  const PG = path.join(DIR, '..', 'gui', 'ext', 'mapviz');
  const pageFiles = SRCS.filter(f => f.startsWith(PG)).concat((() => { try { return fs.readdirSync(path.join(PG, 'sub')).filter(n => /\.lang\.json$/.test(n)).map(n => path.join(PG, 'sub', n)); } catch (e) { return []; } })());
  const left = scan(pageFiles, /spotter|officer|nearness/i);
  ok(pageFiles.length > 10 && !left.length, 'R-g: the page offers no nearness slider, spotters or officer (' + pageFiles.length + ' files) ' + left.join(' '));
  const sv = mv.findPart('strong'); let stc = null; try { stc = sv && sv.load(); } catch (e) { }
  if (stc) ok(!Object.keys(stc.commands).some(k => /spotter|officer|near/i.test(k + ((stc.commands[k] || {}).args || ''))), 'R-g: strong takes no spotters, officer or per-flag nearness flag');
}

// ---- 3. help and parts through the real entry, in an empty cwd ----
const cwd = path.join(W, 'cwd'); fs.mkdirSync(cwd, { recursive: true });
for (const a of [[], ['--help'], ['-h']]) {
  const r = run(a, cwd);
  ok(r.code === 0, 'help ' + (a[0] || '(no args)') + ' exits 0 (got ' + r.code + ')');
  ok(/usage: node tools\/mapviz\/mapviz\.js/.test(r.out) && mv.PARTS.every(p => r.out.includes(p.part)), 'help ' + (a[0] || '(no args)') + ' lists usage and every part');
  ok(!/Error: |unknown (arg|option|flag|command)|ENOENT/i.test(r.out + r.err), 'help ' + (a[0] || '(no args)') + ' has no error words');
}
ok(fs.readdirSync(cwd).length === 0, 'help wrote nothing in the cwd');
{
  const r = run(['parts', '--json'], cwd);
  let j = null; try { j = JSON.parse(r.out); } catch (e) { }
  ok(r.code === 0 && j && j.contract === mv.CONTRACT && j.parts.length === mv.PARTS.length, 'parts --json');
  ok(j && j.parts.every(p => ['built', 'not built', 'broken'].includes(p.state)), 'parts states');
  ok(j && !j.parts.some(p => p.state === 'broken'), 'no part is broken');
}

// ---- 4. not built, through the real entry, for every part whose cli.js is absent ----
let absent = 0;
for (const p of mv.PARTS) {
  if (fs.existsSync(path.join(DIR, p.dir, 'cli.js'))) continue;
  absent++;
  const r = run([p.part, 'list'], cwd);
  ok(r.code === 4, p.part + ' not built exits 4 (got ' + r.code + ')');
  ok(r.err.startsWith('mapviz ' + p.part + ': not built'), p.part + ' says not built on stderr');
  ok(r.out === '', p.part + ' not built prints nothing on stdout');
  const rj = run([p.part, 'list', '--json'], cwd);
  let j = null; try { j = JSON.parse(rj.out); } catch (e) { }
  ok(rj.code === 4 && j && j.v === 1 && j.error.code === 'MV_NOT_BUILT' && j.error.part === p.part && j.error.detail.id === p.id, p.part + ' not built --json');
}
{
  const r = run(['nosuchpart', 'x'], cwd);
  ok(r.code === 2 && /no part named nosuchpart/.test(r.err), 'unknown part exits 2');
}

// ---- 5. dispatch with a planted table: not built, fault (seeded defect), built part, help, bad command, progress end ----
(async () => {
  const fake = path.join(W, 'fake');
  fs.mkdirSync(path.join(fake, 'broken'), { recursive: true });
  fs.mkdirSync(path.join(fake, 'good'), { recursive: true });
  fs.mkdirSync(path.join(fake, 'nover'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'nover', 'cli.js'), "module.exports = { part: 'nover', commands: {}, run() { return 0; } };\n");
  fs.writeFileSync(path.join(fake, 'broken', 'cli.js'), "require('./missing_dep');\nmodule.exports = { part: 'broken', commands: {}, run() { return 0; } };\n");
  fs.writeFileSync(path.join(fake, 'good', 'cli.js'),
    "const mv = require(process.env.MV_SKEL);\n" +
    "module.exports = { part: 'good', version: 1, summary: 'test part', commands: { echo: { args: '--target T', summary: 'echo flags' }, fail: { args: '', summary: 'throws' }, slow: { args: '', summary: 'cancel' } },\n" +
    "  run(argv) { const o = mv.parseArgs(argv.slice(1));\n" +
    "    if (argv[0] === 'fail') throw new mv.MvError('MV_NOT_FOUND', 'no map x', { map: 'x' });\n" +
    "    if (argv[0] === 'slow') { const p = mv.progress(o); p.stage('a', 3); p.step(); require('fs').writeFileSync(o.cancelFlag, ''); p.step(); return 0; }\n" +
    "    process.stdout.write(JSON.stringify({ exe: o.exe, mods: o.mods }) + '\\n'); return 1; } };\n");
  process.env.MV_SKEL = MV;
  const nb = path.join(fake, 'none', 'cli'), br = path.join(fake, 'broken', 'cli'), gd = path.join(fake, 'good', 'cli'), nv = path.join(fake, 'nover', 'cli');
  const table = [
    { part: 'none', id: 'MV-X1', wave: 'A', dir: 'none', load: () => mv.opt(() => require(nb), nb, __filename) },
    { part: 'broken', id: 'MV-X2', wave: 'A', dir: 'broken', load: () => mv.opt(() => require(br), br, __filename) },
    { part: 'good', id: 'MV-X3', wave: 'A', dir: 'good', load: () => mv.opt(() => require(gd), gd, __filename) },
    { part: 'nover', id: 'MV-X4', wave: 'A', dir: 'nover', load: () => mv.opt(() => require(nv), nv, __filename) },
  ];
  ok(mv.partState(table[0]) === 'not built', 'absent cli -> not built');
  ok(mv.partState(table[1]) === 'broken', 'seeded defect: a cli whose own require is missing is broken, not "not built"');
  ok(mv.partState(table[2]) === 'built', 'present cli -> built');
  ok(mv.partState(table[3]) === 'broken', 'seeded defect: a cli without an integer version is broken');

  const cap = await capture(() => mv.dispatch(['none', 'list'], table));
  ok(cap.code === 4 && /mapviz none: not built \(MV-X1, wave A\)/.test(cap.err), 'dispatch: not built -> 4');
  const cb = await capture(() => mv.dispatch(['broken', 'x', '--json'], table));
  let jb = null; try { jb = JSON.parse(cb.out); } catch (e) { }
  ok(cb.code === 2 && jb && jb.error.code === 'MV_FAULT', 'dispatch: missing deeper module -> fault 2');
  const ch = await capture(() => mv.dispatch(['good', '--help'], table));
  ok(ch.code === 0 && /mapviz good \(MV-X3, wave A\)/.test(ch.out) && /echo --target T/.test(ch.out), 'dispatch: part help');
  const ce = await capture(() => mv.dispatch(['good', 'echo', '--target', 'mowas2', '--mods', 'a, b:1'], table));
  ok(ce.code === 1 && ce.out.trim() === JSON.stringify({ exe: 'mowas_2', mods: ['a', 'b:1'] }), 'dispatch: run gets parsed flags, its exit code passes through');
  const cn = await capture(() => mv.dispatch(['good', 'nope'], table));
  ok(cn.code === 2 && /no command nope/.test(cn.err), 'dispatch: unknown command -> 2');
  const c0 = await capture(() => mv.dispatch(['good'], table));
  ok(c0.code === 2, 'dispatch: no command -> 2');
  const pf = path.join(W, 'p1.jsonl');
  for (const f of ['p1.jsonl', 'p2.jsonl', 'cancel']) { try { fs.unlinkSync(path.join(W, f)); } catch (e) { } }
  const cf = await capture(() => mv.dispatch(['good', 'fail', '--json', '--progress', pf], table));
  let jf = null; try { jf = JSON.parse(cf.out); } catch (e) { }
  ok(cf.code === 3 && jf && jf.error.code === 'MV_NOT_FOUND' && jf.error.detail.map === 'x', 'dispatch: MvError -> its exit code and JSON');
  const endF = readLines(pf).pop();
  ok(endF && endF.end === 'failed' && endF.code === 3, 'progress end line after a failure');
  const pf2 = path.join(W, 'p2.jsonl'), flag = path.join(W, 'cancel');
  const cs = await capture(() => mv.dispatch(['good', 'slow', '--progress', pf2, '--cancel-flag', flag], table));
  const lines2 = readLines(pf2);
  ok(cs.code === 5, 'cancel flag -> exit 5 (got ' + cs.code + ')');
  ok(lines2.length >= 2 && lines2[0].stage === 'a' && lines2[0].total === 3 && lines2[lines2.length - 1].end === 'cancelled', 'progress lines: stage first, end cancelled last');

  // ---- 6. helpers ----
  const o = mv.parseArgs(['pos1', '--target', 'goh', '--in', 'a', '--in', 'b', '--mod-dir', 'm', '--json', '--size', '512', '--zz', '3'], { zz: 'num' });
  ok(o.exe === 'goh' && o.in.join() === 'a,b' && o.modDirs.join() === 'm' && o.json === true && o.size === 512 && o.extra.zz === 3 && o.pos.join() === 'pos1', 'parseArgs common and own flags');
  ok(o.side === 'both' && o.kind === 'inf' && o.seed === 1, 'parseArgs defaults');
  for (const bad of [['--target', 'as2'], ['--side', 'c'], ['--kind', 'car'], ['--nope'], ['--map'], ['--size', 'big']]) {
    let code = null; try { mv.parseArgs(bad); } catch (e) { code = e.code; }
    ok(code === 'MV_USAGE', 'parseArgs refuses ' + bad.join(' '));
  }
  const af = path.join(W, 'atomic', 'x.json');
  mv.writeAtomic(af, '{}');
  ok(fs.readFileSync(af, 'utf8') === '{}' && fs.readdirSync(path.dirname(af)).length === 1, 'writeAtomic leaves one file');
  ok(mv.findIn([path.join(W, 'nope'), path.dirname(af)], 'x.json') === af && mv.findIn([W], 'nope.json') === null, 'findIn');
  // checkOut: the --game folder reaches writeguard (seeded defect: an --out inside a plain folder named as the game)
  const fakeGame = path.join(W, 'fakegame'); fs.mkdirSync(fakeGame, { recursive: true });
  const refusedBy = o2 => { try { mv.checkOut(path.join(fakeGame, 'x'), o2); return null; } catch (e) { return e.code; } };
  ok(refusedBy({ game: fakeGame }) === 'MV_REFUSED', 'checkOut refuses an --out inside the --game folder');
  ok(refusedBy(mv.parseArgs(['--target', 'mowas2', '--game', fakeGame])) === 'MV_REFUSED', 'checkOut refuses it with parsed flags');
  ok(refusedBy({ gameDir: fakeGame }) === 'MV_REFUSED', 'checkOut takes o.gameDir too');
  ok(mv.checkOut(path.join(W, 'outok'), { game: fakeGame }) === path.join(W, 'outok'), 'checkOut passes a folder outside the game');
  let t = 0; const pf3 = path.join(W, 'p3.jsonl');
  try { fs.unlinkSync(pf3); } catch (e) { }   // a reused scratch dir: count this run's lines only
  const rep = mv.progress({ progress: pf3 }, () => t);
  rep.stage('s', 100); for (let i = 0; i < 50; i++) { t += 10; rep.step(); }
  ok(readLines(pf3).length === 3, 'progress: 50 steps in 0.5 s give 3 lines, at most 4 per second (' + readLines(pf3).length + ')');
  t += 2500; rep.check();
  ok(readLines(pf3).length === 4, 'progress: heartbeat after 2 s');

  // ---- 7. palette.json ----
  let pal = null; try { pal = JSON.parse(fs.readFileSync(path.join(DIR, 'palette.json'), 'utf8')); } catch (e) { }
  ok(!!pal && pal.v === 1, 'palette.json parses, v 1');
  if (pal) {
    const COL = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;
    const badCol = [];
    (function walk(x, at) {
      if (typeof x === 'string') { if (x[0] === '#' && !COL.test(x)) badCol.push(at); return; }
      if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], at + '.' + k);
    })(pal, '');
    ok(!badCol.length, 'every colour is #RRGGBB or #RRGGBBAA ' + badCol.slice(0, 3).join(' '));
    ok(pal.sides.a.fill === '#0072B2' && pal.sides.b.fill === '#D55E00', 'sides blue and vermilion');
    ok(pal.water.bands.length === 3 && pal.water.bands.every((b, i) => b.code === i), 'water bands by code');
    ok(pal.cover.bands.length === 6 && pal.cover.bands.every((b, i) => b.code === i), 'cover bands by code');
    ok(pal.slope.classes.length === 15 && pal.slope.classDeg === 6, 'slope classes 15');
    ok(pal.ground.types.length === 12 && pal.ground.types.every((b, i) => b.code === i), 'ground types 0..11');
    ok(['snow', 'forest', 'slope'].every((id, i) => pal.ground.types[9 + i].id === id), 'GoH types 9 snow, 10 forest, 11 slope');
    // test-theme flags a CSS colour name after fill/stroke even in a property path, so no palette key may be one
    const NAMED = /^(white|black|red|green|blue|gray|grey|yellow|orange|silver|navy|maroon|purple|teal|lime|pink|gold|brown|cyan|magenta|olive|aqua|fuchsia|darkgray|lightgray|darkgrey|lightgrey)$/i;
    const badKey = [];
    (function keys(x, at) {
      if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (NAMED.test(k)) badKey.push(at + '.' + k); keys(x[k], at + '.' + k); }
    })(pal, '');
    ok(!badKey.length, 'no palette key is a CSS colour name ' + badKey.slice(0, 3).join(' '));
    // version 4 (jobs.md 7): pass codes 5 blockedObject, 6 crossObject, 7 outsidePather (move.<kind>, obst.<kind>)
    ok(pal.pass.codes.length === 8 && pal.pass.codes.every((b, i) => b.code === i), 'pass codes 0..7 (' + pal.pass.codes.length + ')');
    ok(['blockedObject', 'crossObject', 'outsidePather'].every((id, i) => pal.pass.codes[5 + i] && pal.pass.codes[5 + i].id === id), 'pass codes 5 blockedObject, 6 crossObject, 7 outsidePather');
    const isCol = v => typeof v === 'string' && COL.test(v);
    ok(pal.pass.codes.slice(5).every(b => isCol(b.fill) || !!(b.hatch && isCol(b.hatch.color))), 'pass codes 5..7 carry a fill or a hatch colour');
    const sf = pal.sight && pal.sight.fire;
    ok(!!sf && ['clear', 'terrain', 'object', 'water'].every(k => isCol(sf[k])), 'sight.fire clear, terrain, object, water');
    const sl = pal.strong && pal.strong.labels;
    ok(!!sl && typeof sl === 'object' && Object.keys(sl).length >= 2 && Object.keys(sl).every(k => isCol(sl[k])), 'strong.labels: one colour per classifier');
    const cp = pal.cover && pal.cover.point;
    ok(!!cp && isCol(cp.row0) && isCol(cp.row1), 'cover.point row0, row1');
    const wb = pal.styles.staff && pal.styles.staff.waterBands;
    ok(Array.isArray(wb) && wb.length === 3 && wb.every(isCol), 'styles.staff.waterBands: three fills');
    ok(!!(pal.danger && Array.isArray(pal.danger.stops) && pal.danger.stops.length), 'danger.stops (paint danger mark)');
    // page drafts (page-pg2 S11, page-pg3 N8): objects and checks, checked when present
    if (pal.objects) {
      const o = pal.objects, cats = o.categories || {};
      ok(isCol(o.line) && isCol(o.fill) && isCol(o.selected), 'objects line, fill, selected');
      ok(Object.keys(cats).length === 17 && Object.keys(cats).every(k => isCol(cats[k].fill) && isCol(cats[k].line)), 'objects.categories: 17 entcat categories, fill and line (' + Object.keys(cats).length + ')');
    }
    if (pal.checks) ok(['mark', 'ring', 'halo', 'fine'].every(k => isCol(pal.checks[k])), 'checks mark, ring, halo, fine');
    const st = pal.height.stops;
    ok(st[0].at === 0 && st[st.length - 1].at === 1 && st.every((s, i) => !i || s.at > st[i - 1].at), 'height stops ascend 0..1');
    for (const k of ['outsidePather', 'outsideWorld', 'noData', 'blocked', 'degraded', 'approx']) ok(!!pal.masks[k], 'mask ' + k);
    for (const k of Object.keys(pal.masks)) ok(!!(pal.masks[k].hatch && COL.test(pal.masks[k].hatch.color)), 'mask ' + k + ' is hatched');
    ok(Object.keys(pal.styles).sort().join() === 'field_sketch,painted,recon,staff', 'four style entries');
    const fsk = pal.styles.field_sketch;
    for (const k of ['paper', 'graphite', 'roadSmudge', 'buildingFill', 'buildingLine', 'waterHatch', 'crest', 'tree']) ok(COL.test(fsk[k] || ''), 'field_sketch.' + k);
  }

  // ---- 8. README anchors ----
  const RM = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  ok(/^# mapviz \(contract, frozen \d{4}-\d{2}-\d{2}\)$/m.test(RM) && new RegExp('^Contract version: ' + mv.CONTRACT + '\\.', 'm').test(RM), 'README title and contract version (= mapviz.js CONTRACT)');
  ok(/^\| 2026-\d{2}-\d{2} \| R23 \|/m.test(RM), 'README Changes table holds the version 3 rulings (R14 to R23)');
  ok(/^\| 2026-\d{2}-\d{2} \| R(2[6-9]|[3-9]\d) \|/m.test(RM), 'README Changes table holds a ruling after R25 (version 4, waves C and D)');
  const heads = ['1. Parts and owned paths', '2. Common CLI flags and rules', '3. mapdoc/1', '4. Grid files (.mvg) and layer names', '5. Data the page reads',
    '6. Routes and the job protocol', '7. Progress and cancel', '8. Cache', '9. Rules for every part', '10. Fixture map', '11. How this contract changes', '12. Left open by wave 0'];
  for (const h of heads) ok(RM.includes('\n## ' + h + '\n'), 'README section ' + h);
  for (const p of mv.PARTS) ok(RM.includes(p.id) && RM.includes(p.dir), 'README names ' + p.part + ' (' + p.id + ', ' + p.dir + ')');
  for (const id of ['MV-BC1', 'MV-SCN', 'MV-EDC', 'MV-PG1']) ok(RM.includes(id), 'README names ' + id);
  for (const k of Object.keys(mv.EXIT)) ok(new RegExp('\\| ' + mv.EXIT[k] + ' \\| ' + k + ' \\|').test(RM), 'README exit row ' + mv.EXIT[k] + ' ' + k);
  for (const c of Object.keys(mv.CODES)) ok(RM.includes(c), 'README names error code ' + c);
  if (pal) for (const k of Object.keys(pal).filter(k => !['v', 'about', 'styles'].includes(k))) ok(new RegExp('\\| ' + k + '(,| \\|)').test(RM), 'README documents palette key ' + k);
  if (pal) for (const s of Object.keys(pal.styles)) ok(RM.includes('| styles.' + s + ' |'), 'README documents styles.' + s);
  ok(/`MVG1`/.test(RM) && /row 0 = min world y/.test(RM), 'README grid magic and row order');
  ok(RM.includes('(366, 259)') && RM.includes('(635, 351)') && RM.includes('-58'), 'README known answers');
  ok(RM.includes('this file wins') && RM.includes('tools/gui/remote.js') && RM.includes('test/fxmake.js'), 'README: precedence, coordinator-only list, fixture maker');
  ok(!RM.includes('MV_REMOTE'), 'README: no MV_REMOTE answer (gui.js answers rmt.viewOnly)');
  ok(!/[^\x00-\x7f]/.test(RM) && !RM.includes('\r'), 'README is ASCII with LF');
  for (const f of ['mapviz.js', 'palette.json', 'test/run.sh', 'test/skeleton.test.js']) {
    const s = fs.readFileSync(path.join(DIR, f), 'utf8');
    ok(!s.includes('\r') && !/[^\x00-\x7f]/.test(s), f + ' is ASCII with LF');
    ok(!/[A-Z]:[\\/][Uu]sers[\\/]|\/home\/[a-z]/.test(s), f + ' holds no home folder path');
  }
  for (const s of ['staff', 'painted', 'recon', 'sketch']) ok(fs.existsSync(path.join(DIR, 'paint', s)), 'paint/' + s + ' folder exists');
  // README section 1 "Folders": every part folder's test/ (with its .gitkeep) and tools/gui/ext/mapviz/sub/
  const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
  const fm = /tools\/mapviz\/\{([^}]*)\}\/test\//.exec(RM);
  const FOLDERS = fm ? fm[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  ok(FOLDERS.length === 17 && FOLDERS.includes('lib/mapkit') && FOLDERS.includes('paint/sketch'), 'README lists the 17 part folders (' + FOLDERS.length + ')');
  for (const d of FOLDERS) ok(isDir(path.join(DIR, d, 'test')) && fs.existsSync(path.join(DIR, d, 'test', '.gitkeep')), d + '/test/ folder exists with its .gitkeep');
  ok(isDir(path.join(DIR, '..', 'gui', 'ext', 'mapviz', 'sub')), 'tools/gui/ext/mapviz/sub/ folder exists');
  ok(!isDir(path.join(DIR, 'nosuchpart', 'test')), 'seeded: a folder that is not there is not taken for one');

  if (fail) { console.log('FAIL mapviz skeleton: ' + fail + ' of ' + (pass + fail)); process.exit(1); }
  console.log('PASS mapviz skeleton (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz skeleton: ' + (e && e.stack || e)); process.exit(1); });

function readLines(f) {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; }
}

// capture(fn): run fn with stdout and stderr captured -> {code, out, err}
async function capture(fn) {
  const wo = process.stdout.write, we = process.stderr.write;
  let out = '', err = '';
  process.stdout.write = s => { out += s; return true; };
  process.stderr.write = s => { err += s; return true; };
  let code;
  try { code = await fn(); } finally { process.stdout.write = wo; process.stderr.write = we; }
  return { code, out, err };
}
