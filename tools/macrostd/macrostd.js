#!/usr/bin/env node
// macrostd: standardizes the macros of a MoW:AS2 mod's SDL text IN PLACE with undo, and proves after each step that every file still
//   expands to identical data. rows SDL-01 SDL-17 SDL-18 SDL-19 SDL-21 SDL-50 SDL-56 GPL-11 PORT-55 PORT-61 TST-108 VFS-01
// usage:
//   node tools/macrostd/macrostd.js scan   <modDir> --game <dir> [--exe mowas_2] [--json f]
//   node tools/macrostd/macrostd.js plan   <modDir> --game <dir> --only <step[,step]> [--tsv f] [--out MACROS.md]
//   node tools/macrostd/macrostd.js apply  <modDir> --game <dir> --only <step[,step]> [--undo <dir>] [--tsv f] [--out MACROS.md]
//   node tools/macrostd/macrostd.js undo   <modDir> --step <step> [--undo <dir>]
//   node tools/macrostd/macrostd.js verify <modDir> --game <dir> --before <snapshotDir> [--allow f.tsv] [--json f]   (verify.js)
//   node tools/macrostd/macrostd.js lint   <modDir> --game <dir> [-q] [--format json|sarif|csv|html] [-o f]               (lint.js)
//   node tools/macrostd/macrostd.js index  <modDir> --game <dir> [--out MACROS.md]   = apply --only index (undo-able like any step)
//   node tools/macrostd/macrostd.js steps                                            lists the steps
//   --exe defaults to mowas_2 (the AS2 install also holds as64.exe; pass --exe as64 for AS64). Steps run in the --only order; the
//   intended order is fmt, indent, then dead, names, index. Each step sees the previous step's output (plan: in memory).
//
// STEP CONTRACT (other builders add steps here; the core discovers every tools/macrostd/steps/*.js):
//   module.exports = { id, title, plan(ctx) }        id = file name without .js, [a-z0-9_-]+
//   ctx = { modDir     absolute mod folder
//           gameDir    game install (read only)
//           exe        'mowas_2' | 'as64'
//           model      model.js build() result for the CURRENT text (rebuilt after every earlier step of the run): files, defines,
//                      calls, includes, graph, includedBy, roots, owner, byName, dyn, vanilla, callCount(name), dynMatch(name),
//                      preInclude(key), exists(key), inScope(key) - see model.js header
//           read(rel)  -> Buffer of a mod-relative file as it is now (earlier steps of this run applied); throws when missing
//           exists(rel)-> bool, same view
//           vanilla    { has(key), read(key) -> Buffer|null }   key = lowercase 'resource/...' (the game's paks, no mod)
//           opts       { only:[ids], out, tsv, ... } the parsed command line values (x) plus only }
//   plan(ctx) returns { changes: [{ file, after, create, rows }], cases: [{ id, title, detail }] }
//     file    mod-relative path, forward slashes, real letter case as on disk (model rel)
//     after   Buffer of the whole new content | null (no content change: rows are report-only)
//     create  true when the file does not exist yet
//     rows    [{ line, kind, before, after, note }] one per change, become TSV rows (step, file, line, kind, before, after, note)
//     cases   things NOT applied that need the owner (printed, TSV kind CASE)
//   The core does all writing, undo and TSV. A step must never return: a file outside resource/ other than MACROS*.md / README*
//   at the mod root; lua, resource/interface/, mod.info, .pat; a rename or delete. Violations throw (the run stops before writing).
//   Steps keep bytes 1:1 (latin1 strings) and the line ends unless the step is about them; comments (';' to line end) and strings
//   ('"' .. '"', never across a line end) must be respected when finding spans (scan.js does).
// apply: before the first write of each file in a step the original is copied to <undo>/<step>/<mod-relative path>, <undo> =
//   --undo dir or <modDir>/.arsenal-undo/macrostd-<YYYYMMDD>; an existing copy is never overwritten (it is the older original);
//   files a step creates are listed in <undo>/<step>/_created.txt. undo puts the copies back, deletes the created files and renames
//   the step folder to <step>.undone-<HHMMSS>. Undo steps in reverse order of applying them.
// Author: Imperator_Aug (ARSENAL, ia-3e8c31ba)
const fs = require('fs'), path = require('path');
const cli = require('../lib/cli'), { createReport, walkFiles, relPath } = require('../lib/report');
const model = require('./model');

const STEPS_DIR = path.join(__dirname, 'steps');
function loadSteps() {
  const m = new Map();
  for (const f of fs.readdirSync(STEPS_DIR).filter(f => f.endsWith('.js')).sort()) {
    const s = require(path.join(STEPS_DIR, f));
    if (!s || typeof s.plan !== 'function' || s.id !== f.slice(0, -3)) throw new Error(`steps/${f}: must export { id: '${f.slice(0, -3)}', title, plan(ctx) }`);
    m.set(s.id, s);
  }
  return m;
}

const lc = s => s.toLowerCase();
// write keeping the file's attributes: on Windows a plain 'w' open of a Hidden or System file fails with EPERM
// (CREATE_ALWAYS), and RobZ ships 764 hidden files. An existing file is opened r+ and truncated instead.
function writeKeep(abs, buf) {
  if (!fs.existsSync(abs)) { fs.writeFileSync(abs, buf); return; }
  const fd = fs.openSync(abs, 'r+');
  try { fs.ftruncateSync(fd, 0); fs.writeSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
}
function checkChange(c, modDir, stepId, existsFn) {
  const f = c.file;
  const bad = why => { throw new Error(`step ${stepId}: change refused for "${f}": ${why}`); };
  if (typeof f !== 'string' || !f || f.includes('\\') || path.isAbsolute(f) || f.split('/').some(p => p === '..' || p === '.' || p === '')) bad('not a mod-relative path with forward slashes');
  const root = /^(MACROS|README)[^/]*$/i.test(f);
  if (!root && !/^resource\//i.test(f)) bad('outside resource/');
  if (/\.lua$/i.test(f) || /^resource\/interface\//i.test(f) || /(^|\/)mod\.info$/i.test(f) || /\.pat$/i.test(f)) bad('lua, interface, mod.info and .pat are never changed');
  const exists = existsFn ? existsFn(f) : fs.existsSync(path.join(modDir, f));   // existsFn sees files earlier steps of the run created
  if (c.create && exists) bad('create: file exists');
  if (!c.create && !exists && c.after) bad('file does not exist (create not set)');
  if (c.after !== null && c.after !== undefined && !Buffer.isBuffer(c.after)) bad('after must be a Buffer or null');
  if (!Array.isArray(c.rows)) bad('rows missing');
}

const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
const tsvCell = v => String(v === undefined || v === null ? '' : v).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');

// plan (write=false) or apply (write=true) a list of steps. -> { perStep:[{id, files, rows, cases}], tsv:[rows], cases }
function runSteps(o, ids, write) {
  const steps = loadSteps();
  for (const id of ids) if (!steps.has(id)) throw new Error(`unknown step "${id}" (steps: ${[...steps.keys()].join(', ')})`);
  const modDir = path.resolve(o.modDir);
  if (write) {
    const wg = require('../lib/writeguard');
    const why = wg.refuseWrite(modDir, { game: o.gameDir });
    if (why) throw new Error('refused: ' + why);
  }
  const van = model.vanillaScan(o);
  let m = model.build({ modDir, gameDir: o.gameDir, exe: o.exe, vanilla: van, log: o.log });
  const overlay = new Map();     // lowercase rel -> Buffer (current text after earlier steps; plan only keeps it in memory)
  const absOf = rel => path.join(modDir, ...rel.split('/'));
  const read = rel => { const k = lc(rel); if (overlay.has(k)) return overlay.get(k); return fs.readFileSync(absOf(rel)); };
  const exists = rel => overlay.has(lc(rel)) || fs.existsSync(absOf(rel));
  const undoBase = o.undo ? path.resolve(o.undo) : path.join(modDir, '.arsenal-undo', 'macrostd-' + ymd(new Date()));
  const tsv = [], perStep = [], allCases = [];
  for (const id of ids) {
    const step = steps.get(id), t0 = Date.now();
    const ctx = { modDir, gameDir: o.gameDir, exe: o.exe, model: m, read, exists, vanilla: { has: van.has, read: van.read }, opts: Object.assign({}, o.x || {}, { only: ids, out: o.out }) };
    const res = step.plan(ctx) || {};
    const changes = res.changes || [], cases = res.cases || [];
    for (const c of changes) checkChange(c, modDir, id, exists);
    const texts = new Map(), newFiles = new Map();
    let nFiles = 0, nRows = 0;
    const udir = path.join(undoBase, id);
    for (const c of changes) {
      for (const r of c.rows) tsv.push([id, c.file, r.line, r.kind, r.before, r.after, r.note]);
      nRows += c.rows.length;
      if (!c.after) continue;
      const cur = exists(c.file) ? read(c.file) : null;
      if (cur && cur.equals(c.after)) continue;
      nFiles++;
      overlay.set(lc(c.file), c.after);
      texts.set(lc(c.file), c.after.toString('latin1'));
      if (!m.files.has(lc(c.file))) newFiles.set(lc(c.file), c.file);
      if (write) {
        const abs = absOf(c.file), u = path.join(udir, ...c.file.split('/'));
        if (fs.existsSync(abs)) { if (!fs.existsSync(u)) { fs.mkdirSync(path.dirname(u), { recursive: true }); fs.copyFileSync(abs, u); } }
        else {
          fs.mkdirSync(udir, { recursive: true });
          const cf = path.join(udir, '_created.txt'), list = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8').split(/\r?\n/).filter(Boolean) : [];
          if (!list.includes(c.file)) fs.writeFileSync(cf, list.concat(c.file).join('\r\n') + '\r\n');
          fs.mkdirSync(path.dirname(abs), { recursive: true });
        }
        writeKeep(abs, c.after);
      }
    }
    for (const c of cases) { tsv.push([id, '', '', 'CASE', c.title, '', (c.id ? c.id + ': ' : '') + (c.detail || '')]); allCases.push(Object.assign({ step: id }, c)); }
    perStep.push({ id, files: nFiles, rows: nRows, cases: cases.length, ms: Date.now() - t0 });
    if (texts.size) m = model.build({ modDir, gameDir: o.gameDir, exe: o.exe, vanilla: van, prev: m, texts, newFiles });
  }
  if (o.tsv) fs.writeFileSync(o.tsv, ['step\tfile\tline\tkind\tbefore\tafter\tnote'].concat(tsv.map(r => r.map(tsvCell).join('\t'))).join('\r\n') + '\r\n');
  return { perStep, tsv, cases: allCases, undoBase, model: m };
}

function undo(o) {
  const modDir = path.resolve(o.modDir), step = o.step;
  if (!step) throw new Error('undo needs --step <step>');
  let base = o.undo ? path.resolve(o.undo) : null;
  if (!base) {
    const ud = path.join(modDir, '.arsenal-undo');
    const cands = fs.existsSync(ud) ? fs.readdirSync(ud).filter(d => /^macrostd-\d{8}$/.test(d) && fs.existsSync(path.join(ud, d, step))).sort() : [];
    if (!cands.length) throw new Error(`no undo folder for step ${step} under ${ud}`);
    base = path.join(ud, cands[cands.length - 1]);
  }
  const sd = path.join(base, step);
  if (!fs.existsSync(sd)) throw new Error(`no ${sd}`);
  let restored = 0, deleted = 0;
  for (const f of walkFiles(sd, /./)) {
    const rel = relPath(sd, f);
    if (rel === '_created.txt') continue;
    const dst = path.join(modDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    writeKeep(dst, fs.readFileSync(f)); restored++;
  }
  const cf = path.join(sd, '_created.txt');
  if (fs.existsSync(cf)) for (const rel of fs.readFileSync(cf, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const p = path.join(modDir, ...rel.split('/'));
    if (fs.existsSync(p)) { fs.unlinkSync(p); deleted++; }
  }
  const t = new Date(), stamp = [t.getHours(), t.getMinutes(), t.getSeconds()].map(x => String(x).padStart(2, '0')).join('');
  fs.renameSync(sd, path.join(base, `${step}.undone-${stamp}`));
  return { restored, deleted, from: sd };
}

function printSteps(r, write) {
  for (const c of r.cases) console.log(`case ${c.step} ${c.id || ''}: ${c.title}${c.detail ? ' - ' + c.detail : ''}`);
  for (const s of r.perStep) console.log(`${write ? 'apply' : 'plan'} ${s.id}: ${s.files} files, ${s.rows} rows, ${s.cases} cases, ${s.ms} ms`);
  if (write) console.log(`undo copies: ${r.undoBase}`);
}

function main() {
  const argv = process.argv.slice(2), cmd = argv[0];
  const o0 = cli.parse(argv.slice(1), { values: ['--only', '--tsv', '--undo', '--before', '--allow', '--json', '--out', '--step'] });
  const o = { modDir: o0.pos[0], gameDir: o0.gameDir, exe: o0.exe || 'mowas_2', x: o0.x, only: o0.x.only, tsv: o0.x.tsv, undo: o0.x.undo, out: o0.x.out, step: o0.x.step };
  if (cmd === 'steps') { for (const s of loadSteps().values()) console.log(`${s.id}\t${s.title}`); return; }
  if (!cmd || !o.modDir || /^(-h|--help|help)$/.test(cmd)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 0 : 2);
  }
  if (!fs.existsSync(o.modDir)) throw new Error('no such mod folder: ' + o.modDir);
  if (cmd !== 'undo' && !o.gameDir) throw new Error('--game <dir> needed');
  if (cmd === 'scan') {
    const t0 = Date.now(), m = model.build(Object.assign({}, o, { log: s => console.error(s) }));
    const sum = Object.assign(model.summary(m), { ms: Date.now() - t0 });
    for (const [k, v] of Object.entries(sum)) console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    if (o.x.json) fs.writeFileSync(o.x.json, JSON.stringify(sum, null, 1));
    return;
  }
  if (cmd === 'plan' || cmd === 'apply' || cmd === 'index') {
    const ids = cmd === 'index' ? ['index'] : String(o.only || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) throw new Error('--only <step[,step]> needed (steps: ' + [...loadSteps().keys()].join(', ') + ')');
    const r = runSteps(o, ids, cmd !== 'plan');
    printSteps(r, cmd !== 'plan');
    if (o.tsv) console.log(`tsv: ${o.tsv} (${r.tsv.length} rows)`);
    return;
  }
  if (cmd === 'undo') { const r = undo(o); console.log(`undo ${o.step}: ${r.restored} files restored, ${r.deleted} created files deleted (${r.from})`); return; }
  if (cmd === 'verify') {
    if (!o.x.before) throw new Error('verify needs --before <snapshotDir>');
    const r = require('./verify').run({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, before: o.x.before, allow: o.x.allow, json: o.x.json });
    process.exitCode = r.rc; return;
  }
  if (cmd === 'lint') {
    const m = model.build(o), rep = createReport();
    require('./lint').lint(m, rep, { progress: s => process.stderr.write(s + '\n') });
    cli.printReport(rep, o0, { tool: 'macrostd' });
    return;
  }
  throw new Error('unknown command ' + cmd + ' (scan plan apply undo verify lint index steps)');
}

if (require.main === module) cli.run(main);
module.exports = { loadSteps, runSteps, undo, checkChange };
