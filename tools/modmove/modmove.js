#!/usr/bin/env node
// modmove: what must change when a mod moves between as64 | mowas2 | goh. rows: PORT-01..36 (via portdiff) TST-19 TST-20 LOG-19 LOG-20 ENG-24 ENG-26 VFS-46 LOC-23
//   static <modDir> --from X --to Y [--as2 G] [--goh H] [--exe-<t> f] [--top N] [--json f] [-q] [--summary] [--no-lint]
//   static --matrix dirA,dirB,.. [--jobs N]        one line per mod over the 6 directions: must/likely counts
//   live --targets as64,mowas2,goh [--mod dir] [--stage mowas2=e2e_test,as64=e2e_test2,goh=name] [--wait s] [--quiet s] [--hang-sec s] [--out dir]
//        [--backup dir] [--user-dir d] [--goh-user-dir d] [--exe-<t> f] [--as64-inst N] [--no-canary] [--with <mods/ folders, comma: parents loaded before it>] [--try-mismatch: boot a mode-mismatched set instead of refusing, to see what the exe does]
//        boots each exe twice (baseline, with mod), polls game.log, kills only its own process. boot + mount only: NO control pipe.
//   fixtures --out dir                             minimal mods, one per known difference, + manifest.json
// codes: MOVE_* (must change) | WARN_MOVE_* (likely, [I]/[T]) | MOVE_OK_* info (fine). MOVE_LIVE_* in live.
// Author: Imperator_Aug (ARSENAL, ia-54e48882)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');
const C = require('./lib/common');

const VALUE = new Set(['with', 'from', 'to', 'as2', 'goh', 'json', 'top', 'matrix', 'jobs', 'targets', 'mod', 'stage', 'wait', 'quiet', 'hang-sec', 'out', 'backup',
  'user-dir', 'goh-user-dir', 'as64-inst', 'poll', 'args-as64', 'args-mowas2', 'args-goh', 'relaunch-grace', 'exe-as64', 'exe-mowas2', 'exe-goh']);
const FLAG = new Set(['q', 'summary', 'no-lint', 'no-canary', 'no-proc', 'try-mismatch', 'help']);
function args(argv) {
  const o = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q') { o.q = true; continue; }
    if (!a.startsWith('--')) { o.pos.push(a); continue; }
    const k = a.slice(2);
    if (FLAG.has(k)) o[k] = true;
    else if (VALUE.has(k)) { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); o[k] = argv[++i]; }
    else throw new Error('unknown arg ' + a);
  }
  const num = (k, d) => { if (o[k] != null) { const n = Number(o[k]); if (!Number.isFinite(n) || n < 0) throw new Error('--' + k + ' needs a number'); o[k] = n; } else if (d != null) o[k] = d; };
  num('top', 20); num('jobs', 1); num('wait'); num('quiet'); num('hang-sec'); num('poll'); num('as64-inst');
  o.as64Inst = o['as64-inst'] || 0; o.userDir = o['user-dir']; o.gohUserDir = o['goh-user-dir']; o.noLint = o['no-lint'];
  o.canary = o['no-canary'] ? false : true; o.tryMismatch = o['try-mismatch']; o.noProc = o['no-proc']; o.relaunchGrace = o['relaunch-grace'] != null ? +o['relaunch-grace'] : undefined;
  if (o.poll != null) o.poll = +o.poll;
  return o;
}

function printStatic(r, o, from, to) {
  const rep = createReport();
  for (const f of r.findings) rep.add(f.file, f.line, f.code, f.msg);
  for (const f of r.infos) rep.info(from + '->' + to, 0, f.code, f.msg);
  for (const n of r.notes) rep.info(from + '->' + to, 0, 'MOVE_NOTE', n);
  if (o.summary) {
    const g = { must: [], likely: [] };
    for (const f of r.findings) g[f.group].push(f);
    const sect = (t, l) => { console.log(`== ${t} (${l.length})`); for (const f of l) console.log(`  ${f.file}${f.line ? ':' + f.line : ''}: ${f.code} ${f.msg}`); };
    console.log(`${r.mod}: ${from} -> ${to}`);
    sect('must change', g.must); sect('likely [I]', g.likely);
    console.log(`== fine (${r.infos.length})`); if (!o.q) for (const f of r.infos) console.log(`  ${f.code} ${f.msg}`);
    console.log(`${r.findings.length} findings`);
  } else rep.print({ showInfo: !o.q });
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ tool: 'modmove', mod: r.mod, from, to, findings: r.findings, fine: r.infos, notes: r.notes,
    counts: { must: r.findings.filter(f => f.group === 'must').length, likely: r.findings.filter(f => f.group === 'likely').length, fine: r.infos.length } }, null, 1) + '\n');
}

function staticCmd(o) {
  const { check } = require('./lib/static');
  if (o.matrix) return matrix(o);
  const dir = o.pos[1];
  if (!dir || !fs.existsSync(dir)) throw new Error('static needs an existing <modDir>');
  if (!C.TARGETS.includes(o.from) || !C.TARGETS.includes(o.to)) throw new Error('--from and --to must be one of ' + C.TARGETS.join('|'));
  if (o.from === o.to) throw new Error('--from and --to are the same target');
  const r = check(path.resolve(dir), o.from, o.to, o);
  printStatic(r, o, o.from, o.to);
}

function dirs(o) {
  const dl = o.matrix.split(',').filter(Boolean), out = [];
  for (const d of dl) { if (!fs.existsSync(path.join(d, 'mod.info')) && fs.existsSync(d)) { const sub = fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(d, e.name, 'mod.info'))); if (sub.length) { for (const e of sub) out.push(path.join(d, e.name)); continue; } } out.push(d); }
  return out;
}
async function matrix(o) {
  const mods = dirs(o), jobs = [];
  const dirsPairs = [];
  for (const f of C.TARGETS) for (const t of C.TARGETS) if (f !== t) dirsPairs.push([f, t]);
  for (const m of mods) for (const [f, t] of dirsPairs) jobs.push({ m, f, t });
  const tmp = C.tmpDir('mm-matrix-'), results = new Map();
  const passthru = [];
  for (const k of ['as2', 'goh', 'top', 'exe-as64', 'exe-mowas2', 'exe-goh']) if (o[k] != null) passthru.push('--' + k, String(o[k]));
  if (o.noLint) passthru.push('--no-lint');
  let next = 0;
  const run = () => new Promise(res => {
    const j = jobs[next++]; if (!j) return res(false);
    const jf = path.join(tmp, `${next}.json`);
    const c = cp.spawn(process.execPath, [__filename, 'static', j.m, '--from', j.f, '--to', j.t, '--json', jf, '-q', ...passthru], { stdio: 'ignore', windowsHide: true });
    c.on('exit', code => { let v = null; try { v = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* crashed */ } results.set(j.m + '|' + j.f + '|' + j.t, v ? v.counts : { err: code }); res(true); });
  });
  const worker = async () => { while (await run()); };
  await Promise.all(Array.from({ length: Math.max(1, o.jobs) }, worker));
  fs.rmSync(tmp, { recursive: true, force: true });
  const head = ['mod', ...dirsPairs.map(([f, t]) => `${f}>${t}`)];
  const rows = mods.map(m => [path.basename(m), ...dirsPairs.map(([f, t]) => { const c = results.get(m + '|' + f + '|' + t); return !c ? '?' : c.err !== undefined ? 'ERR' : `${c.must}/${c.likely}`; })]);
  const w = head.map((_, i) => Math.max(head[i].length, ...rows.map(r => r[i].length)));
  console.log('cells = must-change / likely [I] findings per direction');
  console.log(head.map((c, i) => c.padEnd(w[i])).join(' | '));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join(' | '));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ head, rows }, null, 1) + '\n');
}

async function liveCmd(o) {
  if (!o.targets) throw new Error('live needs --targets as64,mowas2,goh');
  const { live } = require('./lib/live');
  const { res, table } = await live(o);
  console.log(table);
  res.print({ showInfo: !o.q });
}

function fixturesCmd(o) {
  if (!o.out) throw new Error('fixtures needs --out dir');
  const m = require('./lib/fixtures').write(path.resolve(o.out));
  console.log(`wrote ${Object.keys(m.mods).length} fixture mods + manifest.json to ${o.out}`);
}

cli.run(async () => {
  const o = args(process.argv.slice(2)), cmd = o.pos[0];
  if (o.help || !cmd) { console.log('usage: modmove static <modDir> --from X --to Y | static --matrix a,b | live --targets as64,mowas2,goh | fixtures --out dir  (targets: as64 mowas2 goh)'); return; }
  if (cmd === 'static') return staticCmd(o);
  if (cmd === 'live') return liveCmd(o);
  if (cmd === 'fixtures') return fixturesCmd(o);
  throw new Error('unknown command ' + cmd);
});
