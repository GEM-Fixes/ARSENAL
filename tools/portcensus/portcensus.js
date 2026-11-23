#!/usr/bin/env node
// portcensus: how many GoH vehicle units pass the static port verdict, and which keys hold the rest back (NAT-CEN, contract census/1).
// GoH read-only, no game launch. Holds no check of its own: per unit it runs goh2as2 -> nativepass -> portverdict as child processes.
//   node tools/portcensus/portcensus.js --goh H --game G --out <dir> [--class a,b] [--every k] [--limit n] [--units a,b | --unit-list F]
//        [--budget-s s] [--rules dir] [--jobs j] [--batch n] [--resume] [--conv-cmd F] [--pass-cmd F] [--verdict-cmd F] [--exe as64|mowas_2|mowas2]
//   --exe: the AS2 build the units are ported to, passed as --exe to goh2as2, nativepass and portverdict (mowas_2: no as64/core and
//          no as64+ in their vfs views, mod.info range 3.262); none = the AS64 argument lists as before. goh: refused, exit 2 (GoH is the source)
//   units: GoH defs entity/-vehicle/<nation>/<class>/<folder>/<stem>.def (loose + resource/**/*.pak via tools/lib/pakset), the wreck
//          folders x/ left out [I: x/ holds the _x/_xx destroyed hulks]. Sorted by stem; class = the GoH folder <class>.
//          --class filters, then --every k keeps index 0,k,2k.. (same sample every run), then --limit n the first n.
//          --units a,b / --unit-list F (one per line): exactly those (a name not in the GoH list is passed to goh2as2 as given, class '?').
//   per unit (dir <out>/u/<stem>, <out>/n/<stem>, <out>/v/<stem>.json):
//          conv    goh2as2 --goh H --entity <key> --out u/<stem> --text-only --game G --no-ask --no-keylint
//          pass    nativepass u/<stem> --out n/<stem> --game G [--rules dir] --json n/<stem>.pass.json
//          verdict portverdict n/<stem> --game G --goh H --json v/<stem>.verdict.json
//          a step fails when its process crashes, exits >= 2, or leaves no output (conv: gaps/<stem>.gaps.json; pass: n/<stem>; verdict: the
//          unit in the JSON). goh2as2 exit 1 with output is not a failure: the verdict judges what it wrote. A failed unit -> failed[], run goes on.
//          one process per unit, --jobs in parallel (default: cores-1, max 8).
//   --batch n: one goh2as2 --entity-list / nativepass / portverdict per n units (u/_b_<first>); a step that fails as a whole -> each unit alone.
//          Faster (NAT-CEN: 21 units 227 s at --batch 6 --jobs 4, vs 16 units 305 s single at 8 jobs) but gaps hand/unexplained of a unit
//          can differ from its single run (shared files owned by the first unit; 2 of 16 lower in batch) [V], so default 1.
//   --budget-s s: no unit starts after s seconds; running ones finish; record written. 0 = none starts.
//   --resume: units with a verdict in v/<stem>.json are skipped (failed ones run again); a record of another build (its field exe,
//          absent = as64) runs again and is left out of the census; census.json carries exe when the build is not as64.
//   stubs (tests): --conv-cmd/--pass-cmd/--verdict-cmd F or env PORTCENSUS_CONV/_PASS/_VERDICT = a node script run with the real tool's args.
//   output: <out>/census.json (census/1, byte-stable), <out>/census.txt (same text as stdout), <out>/census.time.json (times, not stable).
//   exit 0 = ran, 2 = usage.
// Author: Imperator_Aug (ARSENAL, ia-e9b34320)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const TOOLS = path.resolve(__dirname, '..');
const TOP = 15;

function usage(msg) {
  if (msg) console.error('portcensus: ' + msg);
  console.error('usage: node tools/portcensus/portcensus.js --goh H --game G --out <dir> [--class a,b] [--every k] [--limit n] [--units a,b | --unit-list F] [--budget-s s] [--rules dir] [--jobs j] [--batch n] [--resume] [--exe as64|mowas_2]');
  process.exit(2);
}
function parseArgs(argv) {
  const o = { every: 1, limit: 0, budget: null, batch: 1, jobs: Math.max(1, Math.min(8, os.cpus().length - 1)), resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(a + ' needs a value'); return argv[++i]; };
    const num = () => { const v = Number(nx()); if (!Number.isFinite(v) || v < 0) usage(a + ' needs a number >= 0'); return v; };
    if (a === '--goh') o.goh = nx(); else if (a === '--game') o.game = nx(); else if (a === '--out') o.out = nx();
    else if (a === '--class') o.cls = nx().split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (a === '--every') o.every = Math.max(1, Math.floor(num())); else if (a === '--limit') o.limit = Math.floor(num());
    else if (a === '--units') o.units = nx().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--unit-list') { const f = nx(); let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { usage('--unit-list: ' + e.message); } o.units = t.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')); }
    else if (a === '--budget-s') o.budget = num(); else if (a === '--rules') o.rules = nx(); else if (a === '--jobs') o.jobs = Math.max(1, Math.floor(num()));
    else if (a === '--resume') o.resume = true; else if (a === '--batch') o.batch = Math.max(1, Math.floor(num()));
    else if (a === '--conv-cmd') o.convCmd = nx(); else if (a === '--pass-cmd') o.passCmd = nx(); else if (a === '--verdict-cmd') o.verdictCmd = nx();
    else if (a === '--exe') {
      const games = require('../lib/games'), g = games.get(nx());
      if (!g) usage('--exe must be one of as64|mowas_2|mowas2');
      if (g.kind === 'goh') games.refuse('portcensus', g, 'the census ports GoH units to an AS2 build (as64 or mowas_2); GoH is the source, given by --goh', 'plan/reports/game-parity/t-port-b.md: n/a (source game)');
      o.exe = g.exe;
    }
    else if (a === '-h' || a === '--help') usage();
    else usage('unknown option ' + a);
  }
  if (!o.goh || !o.game || !o.out) usage('--goh, --game and --out are required');
  o.convCmd = o.convCmd || process.env.PORTCENSUS_CONV || path.join(TOOLS, 'goh2as2/goh2as2.js');
  o.passCmd = o.passCmd || process.env.PORTCENSUS_PASS || path.join(TOOLS, 'nativepass/nativepass.js');
  o.verdictCmd = o.verdictCmd || process.env.PORTCENSUS_VERDICT || path.join(TOOLS, 'portverdict/portverdict.js');
  o.out = path.resolve(o.out);
  return o;
}

const slash = s => String(s || '').replace(/\\/g, '/');
const xf = o => (o.exe ? ['--exe', o.exe] : []);   // the AS2 build to every step; none named = the AS64 argument lists as before
// the build a record belongs to: null = as64 (no field written, AS64 records byte for byte as before), else the vfs exe (mowas_2)
const buildOf = o => (o.exe && o.exe !== 'as64' ? o.exe : null);
// write a per-unit record marked with its build; the v/ folder is made again if it went missing, so a lost folder gives a record, not a crash
function writeRec(o, file, rec) {
  const b = buildOf(o), out = b ? { unit: rec.unit, class: rec.class, exe: b, ...rec } : rec;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  return out;
}
const cmpS = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---- GoH unit list: [{unit, key, class}] sorted by unit
const UNIT_RE = /^entity\/-vehicle\/[^/]+\/([^/]+)\/([^/]+)\/([^/]+)\.def$/;
function listUnits(goh) {
  const root = fs.existsSync(path.join(goh, 'resource')) ? path.join(goh, 'resource') : goh;
  const keys = new Set();
  if (fs.existsSync(root)) {
    const pakset = require('../lib/pakset');
    const ps = pakset.open(root, { ext: new Set(['.def']) });
    for (const e of ps.entries) keys.add(e.key.toLowerCase());
    ps.close();
    const ent = path.join(root, 'entity', '-vehicle');
    if (fs.existsSync(ent)) for (const f of fs.readdirSync(ent, { recursive: true }).map(String)) if (/\.def$/i.test(f)) keys.add(('entity/-vehicle/' + slash(f)).toLowerCase());
  }
  const out = [], seen = new Set();
  for (const k of [...keys].sort()) {
    const m = UNIT_RE.exec(k);
    if (!m || m[2] === 'x') continue;
    if (seen.has(m[3])) continue;   // first key wins on a stem clash (none in GoH 2026-11-09 [V])
    seen.add(m[3]);
    out.push({ unit: m[3], key: k, class: m[1] });
  }
  return out.sort((a, b) => cmpS(a.unit, b.unit));
}

function select(o, all) {
  if (o.units) {
    const by = new Map(all.map(u => [u.unit, u]));
    const s = [...new Set(o.units.map(n => n.toLowerCase().replace(/\.def$/, '').replace(/^.*\//, '')))].sort();
    return s.map(n => by.get(n) || { unit: n, key: n, class: '?' });
  }
  let l = all;
  if (o.cls) {
    // a class no GoH unit has would give a silent "asked 0": name it and the classes there are (stderr only, the census stays as it is)
    const have = [...new Set(all.map(u => u.class))].sort(), none = o.cls.filter(c => !have.includes(c));
    if (none.length) console.error(`portcensus: no GoH unit in class ${none.join(', ')} (classes: ${have.join(', ')})`);
    l = l.filter(u => o.cls.includes(u.class));
  }
  l = l.filter((_, i) => i % o.every === 0);
  if (o.limit) l = l.slice(0, o.limit);
  return l;
}

// ---- child process, async
function run(script, args, cwd) {
  return new Promise(res => {
    const t0 = Date.now();
    let err = '', outp = '';
    let p;
    try { p = cp.spawn(process.execPath, [script, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return res({ code: -1, out: '', err: e.message, s: 0 }); }
    p.stdout.on('data', d => { outp += d; if (outp.length > 1 << 20) outp = outp.slice(-(1 << 19)); });
    p.stderr.on('data', d => { err += d; if (err.length > 1 << 20) err = err.slice(-(1 << 19)); });
    p.on('error', e => res({ code: -1, out: outp, err: err + e.message, s: (Date.now() - t0) / 1000 }));
    p.on('close', code => res({ code: code === null ? -1 : code, out: outp, err, s: (Date.now() - t0) / 1000 }));
  });
}

function cleanWhy(o, s) {
  let t = String(s || '').replace(/\r/g, '').trim().split('\n').filter(Boolean).slice(-2).join(' / ');
  const subs = [[o.out, '<out>'], [path.resolve(o.goh), 'H'], [path.resolve(o.game), 'G'], [TOOLS, 'tools'], [os.tmpdir(), '<tmp>']];
  for (const [a, b] of subs) for (const v of [a, slash(a)]) t = t.split(v).join(b).split(v.toLowerCase()).join(b);
  t = t.replace(/[A-Za-z]:[\\/][^\s"']*/g, '<path>');
  return t.slice(0, 200);
}
const fail = (o, step, r, msg) => ({ step, why: cleanWhy(o, msg || `exit ${r.code}: ${r.err || r.out}`) });

async function doUnit(o, u, times) {
  const uDir = path.join(o.out, 'u', u.unit), nDir = path.join(o.out, 'n', u.unit), vFile = path.join(o.out, 'v', u.unit + '.json');
  const T = times[u.unit] = {};
  const cwd = path.resolve(TOOLS, '..');
  fs.rmSync(uDir, { recursive: true, force: true }); fs.rmSync(nDir, { recursive: true, force: true });
  const done = (rec) => writeRec(o, vFile, rec);
  const base = { unit: u.unit, class: u.class };
  // conv
  let r = await run(o.convCmd, ['--goh', o.goh, '--entity', u.key, '--out', uDir, '--text-only', '--game', o.game, '--no-ask', '--no-keylint', ...xf(o)], cwd);
  T.conv = r.s;
  const gaps = path.join(uDir, 'gaps', u.unit + '.gaps.json');
  if (r.code < 0 || r.code >= 2 || !fs.existsSync(gaps)) return done({ ...base, failed: fail(o, 'conv', r, r.code === 0 || r.code === 1 ? `exit ${r.code}, no gaps/${u.unit}.gaps.json: ${r.err || r.out}` : null) });
  // pass
  const pj = path.join(o.out, 'n', u.unit + '.pass.json');
  r = await run(o.passCmd, [uDir, '--out', nDir, '--game', o.game, ...(o.rules ? ['--rules', o.rules] : []), '--json', pj, ...xf(o)], cwd);
  T.pass = r.s;
  if (r.code !== 0 || !fs.existsSync(nDir)) return done({ ...base, failed: fail(o, 'pass', r) });
  // verdict
  const vj = path.join(o.out, 'v', u.unit + '.verdict.json');
  fs.rmSync(vj, { force: true });
  r = await run(o.verdictCmd, [nDir, '--game', o.game, '--goh', o.goh, '--json', vj, ...xf(o)], cwd);
  T.verdict = r.s;
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(vj, 'utf8')); } catch { /* below */ }
  if (r.code !== 0 || !rec || !Array.isArray(rec.units)) return done({ ...base, failed: fail(o, 'verdict', r) });
  const v = rec.units.find(x => String(x.unit).toLowerCase() === u.unit) || (rec.units.length === 1 ? rec.units[0] : null);
  if (!v) return done({ ...base, failed: { step: 'verdict', why: 'unit not in verdict' } });
  return done({ ...base, verdict: v });
}

// ---- a batch: one goh2as2 (--entity-list), one nativepass, one portverdict for units us; a step that fails as a whole -> each unit alone
async function doBatch(o, us, times) {
  if (us.length === 1) return doUnit(o, us[0], times);
  const name = '_b_' + us[0].unit, uDir = path.join(o.out, 'u', name), nDir = path.join(o.out, 'n', name), cwd = path.resolve(TOOLS, '..');
  fs.rmSync(uDir, { recursive: true, force: true }); fs.rmSync(nDir, { recursive: true, force: true });
  const lst = path.join(o.out, 'u', name + '.list');
  fs.writeFileSync(lst, us.map(u => u.key).join('\n') + '\n');
  const alone = async () => { for (const u of us) await doUnit(o, u, times); };
  const T = { conv: 0, pass: 0, verdict: 0 };
  const share = () => { for (const u of us) times[u.unit] = { conv: T.conv / us.length, pass: T.pass / us.length, verdict: T.verdict / us.length, batch: name }; };
  let r = await run(o.convCmd, ['--goh', o.goh, '--entity-list', lst, '--out', uDir, '--text-only', '--game', o.game, '--no-ask', '--no-keylint', ...xf(o)], cwd);
  T.conv = r.s;
  const convCode = r.code;
  if (r.code < 0 || r.code >= 2) return alone();
  const pj = path.join(o.out, 'n', name + '.pass.json');
  r = await run(o.passCmd, [uDir, '--out', nDir, '--game', o.game, ...(o.rules ? ['--rules', o.rules] : []), '--json', pj, ...xf(o)], cwd);
  T.pass = r.s;
  if (r.code !== 0 || !fs.existsSync(nDir)) return alone();
  const vj = path.join(o.out, 'v', name + '.verdict.json');
  fs.rmSync(vj, { force: true });
  r = await run(o.verdictCmd, [nDir, '--game', o.game, '--goh', o.goh, '--json', vj, ...xf(o)], cwd);
  T.verdict = r.s;
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(vj, 'utf8')); } catch { /* below */ }
  if (r.code !== 0 || !rec || !Array.isArray(rec.units)) return alone();
  share();
  for (const u of us) {
    const base = { unit: u.unit, class: u.class }, vFile = path.join(o.out, 'v', u.unit + '.json');
    let out;
    if (!fs.existsSync(path.join(uDir, 'gaps', u.unit + '.gaps.json'))) out = { ...base, failed: { step: 'conv', why: `exit ${convCode}, no gaps/${u.unit}.gaps.json` } };
    else {
      const v = rec.units.find(x => String(x.unit).toLowerCase() === u.unit);
      out = v ? { ...base, verdict: v } : { ...base, failed: { step: 'verdict', why: 'unit not in verdict' } };
    }
    writeRec(o, vFile, out);
  }
}

// ---- census from the per-unit records
function top(units, pick) {
  const n = new Map();
  for (const v of units) for (const k of new Set(pick(v))) n.set(k, (n.get(k) || 0) + 1);
  return [...n].map(([key, c]) => ({ key, units: c })).sort((a, b) => b.units - a.units || cmpS(a.key, b.key)).slice(0, TOP);
}
function census(asked, recs) {
  const ok = recs.filter(r => r.verdict), failed = recs.filter(r => r.failed);
  const byClass = {};
  for (const u of asked) byClass[u.class] = byClass[u.class] || { done: 0, bar: 0, native: 0 };
  for (const r of ok) { byClass[r.class].done++; if (r.verdict.bar === true) byClass[r.class].bar++; if (r.verdict.native) byClass[r.class].native++; }
  const bc = {}; for (const k of Object.keys(byClass).sort()) bc[k] = byClass[k];
  const V = ok.map(r => r.verdict);
  return {
    form: 'census/1', asked: asked.length, done: ok.length, bar: V.filter(v => v.bar === true).length, native: V.filter(v => v.native === true).length, byClass: bc,
    topMissing: top(V, v => (v.keys && v.keys.missing) || []),
    topExtra: top(V, v => (v.keys && v.keys.extra) || []),
    topValues: top(V, v => ((v.values && v.values.out) || []).map(x => x.key)),
    failed: failed.map(r => ({ unit: r.unit, step: r.failed.step, why: r.failed.why })).sort((a, b) => cmpS(a.unit, b.unit)),
  };
}
function text(c) {
  const L = [`portcensus: asked ${c.asked}, done ${c.done}, bar ${c.bar}, native ${c.native}, failed ${c.failed.length}, not started ${c.asked - c.done - c.failed.length}`];
  L.push('by class (done / bar / native):');
  for (const [k, v] of Object.entries(c.byClass)) L.push(`  ${k.padEnd(14)} ${String(v.done).padStart(4)} ${String(v.bar).padStart(4)} ${String(v.native).padStart(4)}`);
  for (const [t, a] of [['missing', c.topMissing], ['extra', c.topExtra], ['value', c.topValues]]) {
    L.push(`top ${t} keys${t === 'value' ? ', not part of the bar' : ''} (units):`);
    if (!a.length) L.push('  (none)');
    for (const x of a) L.push(`  ${String(x.units).padStart(4)} ${x.key}`);
  }
  if (c.failed.length) { L.push('failed:'); for (const f of c.failed) L.push(`  ${f.unit} ${f.step}: ${f.why}`); }
  return L.join('\n') + '\n';
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  for (const d of ['', 'u', 'n', 'v']) fs.mkdirSync(path.join(o.out, d), { recursive: true });
  const asked = select(o, listUnits(o.goh));
  // a record of another build (an as64 record in a mowas_2 run or the reverse) is not this run's answer: resume runs it again, the census leaves it out
  const recOf = u => { try { const r = JSON.parse(fs.readFileSync(path.join(o.out, 'v', u.unit + '.json'), 'utf8')); return (r.exe || null) === buildOf(o) ? r : null; } catch { return null; } };
  const todo = asked.filter(u => !(o.resume && (recOf(u) || {}).verdict));
  if (!o.resume) for (const u of asked) fs.rmSync(path.join(o.out, 'v', u.unit + '.json'), { force: true });
  const deadline = o.budget === null ? Infinity : t0 + o.budget * 1000;
  const times = {};
  let next = 0, started = 0;
  const chunks = [];
  for (let i = 0; i < todo.length; i += o.batch) chunks.push(todo.slice(i, i + o.batch));
  const worker = async () => {
    while (next < chunks.length && Date.now() < deadline) {
      const us = chunks[next++]; started += us.length;
      try { await doBatch(o, us, times); } catch (e) { for (const u of us) if (!recOf(u)) { try { writeRec(o, path.join(o.out, 'v', u.unit + '.json'), { unit: u.unit, class: u.class, failed: { step: 'census', why: cleanWhy(o, e.message) } }); } catch (e2) { console.error('portcensus: ' + u.unit + ': ' + e2.message); } } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.jobs, Math.max(1, chunks.length)) }, worker));
  const recs = asked.map(recOf).filter(Boolean);
  // class from the GoH list (the record's is the same unless --units named a unit the list lacks)
  const cls = new Map(asked.map(u => [u.unit, u.class]));
  for (const r of recs) r.class = cls.get(r.unit) || r.class;
  const c = census(asked, recs);
  if (buildOf(o)) c.exe = buildOf(o);   // the build of the census; absent = as64 (census.json byte for byte as before)
  fs.writeFileSync(path.join(o.out, 'census.json'), JSON.stringify(c, null, 1) + '\n');
  const t = text(c);
  fs.writeFileSync(path.join(o.out, 'census.txt'), t);
  fs.writeFileSync(path.join(o.out, 'census.time.json'), JSON.stringify({ form: 'census-time/1', exe: o.exe || 'as64', wall_s: (Date.now() - t0) / 1000, jobs: o.jobs, started, skipped_resume: asked.length - todo.length, units: times }, null, 1) + '\n');
  process.stdout.write(t);
}

if (require.main === module) main().catch(e => { console.error('portcensus: ' + e.stack); process.exit(1); });
module.exports = { listUnits, select, census, text, UNIT_RE };
