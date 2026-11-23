// previews cli (MV-PRV): `node tools/mapviz/mapviz.js previews plan|write|check|undo [flags]` (previews.md 8).
// Light at load: the game is read only inside run.
// write --all (deploy all, the page's "Write all previews into the mod"): every file this game reads for the map (no
// --targets); a source picture drawn here (none cached in --in) is drawn at the long side the largest file needs
// (sizes.matchLong); a file that fails (its source missing, compose or encode throwing) is reported and the rest are still
// written in one journal entry (one undo). The answer adds all:true, skipped:[{id, path, code, why}] (files the game does
// not read, sources not built) and failed:[{id, path, code, why}]; exit 1 when any failed. plan --all gives its hash.
// Author: Imperator_Aug (ARSENAL, ia-f4196d63)
'use strict';

const VERSION = 1;
const OWN = { mod: 'str', targets: 'str', source: 'str', marks: 'str', compose: 'str', set: 'multi', title: 'str', 'minimap-size': 'num',
  best: 'bool', 'rename-stronger': 'bool', yes: 'bool', 'plan-hash': 'str', n: 'num', all: 'bool' };
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D] --map K [--mode m] [--in D] [--out D] [--json]';
const PLAN = ' --mod D [--targets a,b | --all] [--source s] [--marks m] [--compose c] [--set t.k=v] [--title text] [--minimap-size n]';

const commands = {
  plan: { args: COMMON + PLAN, summary: 'dry run: the files, sizes, stretch, warnings and what each write replaces' },
  write: { args: COMMON + PLAN + ' (--yes | --plan-hash h) [--best] [--rename-stronger] [--progress f] [--cancel-flag f]', summary: 'compose, encode and write every target into the mod, with backups; --all: every file the game reads for the map at its own size, a failing file reported and the rest written (one undo)' },
  check: { args: COMMON + ' --mod D [--targets a,b]', summary: 'read the written files back' },
  undo: { args: COMMON + ' --mod D [--n k]', summary: 'restore what write k replaced' },
};

function json(v) { return JSON.stringify(v, null, 1).replace(/\r/g, '') + '\n'; }

function setup(argv) {
  const M = require('../mapviz');
  const o = M.parseArgs(argv.slice(1), OWN);
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <key> is needed');
  if (!o.extra.mod) throw new M.MvError('MV_USAGE', '--mod <folder> is needed', { code: 'PRV_MOD_MISSING' });
  const x = o.extra;
  if (x.minimapSize !== undefined && !(Number.isInteger(x.minimapSize) && x.minimapSize >= 256 && x.minimapSize <= 4096 && x.minimapSize % 4 === 0))
    throw new M.MvError('MV_USAGE', '--minimap-size must be a multiple of 4 from 256 to 4096', { code: 'PRV_SET' });
  if (x.n !== undefined && !(Number.isInteger(x.n) && x.n >= 1)) throw new M.MvError('MV_USAGE', '--n must be a journal entry number from 1', { code: 'PRV_SET' });
  if (x.all && x.targets) throw new M.MvError('MV_USAGE', '--all writes every file the game reads for the map; leave --targets out', { code: 'PRV_SET' });
  return { M, o, x };
}

function open(M, o) {
  const mk = require('../lib/mapkit');
  const src = mk.source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
  const doc = mk.doc(src, o.map, { mode: o.mode });
  return { src, doc };
}

function planOpts(o, x) {
  return { mod: x.mod, mode: o.mode, targets: x.targets ? String(x.targets).split(',').map(s => s.trim()).filter(Boolean) : null,
    source: x.source, marks: x.marks, compose: x.compose, set: x.set || [], title: x.title, minimapSize: x.minimapSize, in: o.in, game: o.game, all: !!x.all };
}

function say(o, body, text) { if (o.json) process.stdout.write(json(body)); else if (!o.q) process.stdout.write(text + '\n'); }

function planText(p) {
  const out = [p.map + ' (' + p.target + ', ' + p.kind + ')' + (p.mode ? ' mode ' + p.mode : '') + ' into mod ' + p.mod.id + (p.mod.inStack ? '' : ' (not in the stack)')];
  for (const t of p.targets) {
    if (t.state === 'none') { out.push('  ' + t.id + ': none (' + t.why + ')'); continue; }
    out.push('  ' + t.id + ': ' + t.state + ' ' + t.file + ' ' + (t.size ? t.size.join('x') : '?') + ' ' + t.format + (t.mips ? ' ' + t.mips + ' mips' : '') +
      ', source ' + t.source.name + ' (' + t.source.resolved + ', ' + t.source.state + '), ' + t.compose + ', marks ' + t.marks +
      ', ratio ' + t.stretch.ratio + (t.notes.length ? ', ' + t.notes.join(' ') : ''));
    for (const w of t.warnings) out.push('    ' + w.code + ' ' + w.what + ' ' + w.name + (w.px ? ' at px ' + w.px.join(',') : ''));
  }
  for (const n of p.notes) out.push('  note ' + n.code + ': ' + n.text);
  out.push('  hash ' + p.hash);
  return out.join('\n');
}

function writeOut(M, o, name, body, src) {
  if (!o.out) return;
  const path = require('path');
  const out = M.checkOut(o.out, o);
  M.writeAtomic(path.join(out, name), json(body));
  if (src) M.writeAtomic(path.join(out, 'reads.json'), json({ v: 1, inputs: src.reads() }));
}

async function cmdPlan(argv) {
  const { M, o, x } = setup(argv);
  const I = require('./index');
  const { src, doc } = open(M, o);
  const p = I.plan(src, doc, planOpts(o, x));
  writeOut(M, o, 'previews.plan.json', p, src);
  say(o, p, planText(p));
  return I.findings(p) ? 1 : 0;
}

async function cmdWrite(argv) {
  const { M, o, x } = setup(argv);
  const I = require('./index'), CP = require('./compose');
  const prog = M.progress(o);
  prog.stage('plan', 1);
  const { src, doc } = open(M, o);
  const p = I.plan(src, doc, planOpts(o, x));
  if (x.planHash) { if (x.planHash !== p.hash) throw new M.MvError('MV_REFUSED', 'the plan changed since it was shown (hash ' + p.hash + ', given ' + x.planHash + '); look at the plan again', { code: 'PRV_PLAN_CHANGED', hash: p.hash }); }
  else if (!x.yes) throw new M.MvError('MV_REFUSED', 'give --yes or --plan-hash <hash of the plan you looked at>', { code: 'PRV_CONFIRM', hash: p.hash });
  const all = !!x.all, skipped = [], failed = [];
  // --all: a file that fails is reported and left out; a cancel always stops the run. Messages lose drive paths.
  const scrubMsg = m => String(m || '').replace(/(?<![\w.])(?:[A-Za-z]:)?[\\/][^\s,;:)]*[\\/]([^\\/\s,;:)]+)/g, '$1');
  const failOf = (t, e) => ({ id: t.id, path: t.path, code: (e && e.detail && typeof e.detail.code === 'string' && e.detail.code) || (e && e.prv) || 'PRV_FILE_FAILED', why: scrubMsg(e && e.message) });
  const keepGoing = e => all && !(e instanceof M.MvError && e.code === 'MV_CANCELLED');
  if (all) for (const t of p.targets) if (t.state === 'none') skipped.push({ id: t.id, path: t.path, code: t.why || 'PRV_NO_FILE_IN_GAME', why: I.noteText(t.why || 'PRV_NO_FILE_IN_GAME', t.file) });
  let rows = p.targets.filter(t => t.state === 'write');
  for (const t of rows.slice()) {
    let e = null;
    if (t.source.state === 'not built') e = new M.MvError('MV_NOT_BUILT', 'the style ' + t.source.resolved + ' for ' + t.id + ' is not built yet', { code: 'PRV_SOURCE_MISSING', target: t.id });
    else if (t.source.state !== 'ok') e = new M.MvError('MV_NOT_FOUND', 'source ' + t.source.resolved + ' for ' + t.id + ' is missing', { code: 'PRV_SOURCE_MISSING', target: t.id });
    if (!e) continue;
    if (!all) throw e;
    rows = rows.filter(r => r !== t);
    if (t.source.state === 'not built') skipped.push({ id: t.id, path: t.path, code: 'PRV_SOURCE_MISSING', why: e.message }); else failed.push(failOf(t, e));
  }
  prog.step(1);
  const font = x.title ? CP.loadFont(src, 40) : null;
  // --all: a picture drawn here (no cached rung in --in) is drawn at the long side the largest file needs
  const drawSize = all && rows.length ? require('./sizes').matchLong(doc.boxes.world, rows.map(t => t.size)) : undefined;
  const sources = CP.Sources(src, doc, { mode: o.mode, progress: prog, cancelFlag: o.cancelFlag, size: drawSize });
  const copts = { sources, paint: I.paint(), mode: o.mode, seed: o.seed, in: o.in, title: x.title || null, font, progress: prog, cancelFlag: o.cancelFlag };
  const composed = {};
  prog.stage('compose', rows.length);
  let n0 = 0;
  for (const t of rows) {
    const row = Object.assign({}, t, { source: Object.assign({}, t.source, { from: t.source.from === 'draw' && I.STYLES.includes(t.source.resolved) ? 'paint' : t.source.from, file: p.files_[t.id] }) });
    try { composed[t.id] = await I.compose(src, doc, row, copts); } catch (e) { if (!keepGoing(e)) throw e; failed.push(failOf(t, e)); }
    prog.stage('compose', rows.length);   // a drawn source (render l1) reports its own stages; back to ours
    prog.set(++n0, rows.length);
  }
  rows = rows.filter(t => composed[t.id]);
  prog.stage('encode', rows.length);
  const pics = {};
  for (const t of rows) {
    const c = composed[t.id];
    try {
      if (t.format === 'PNG') pics[t.id] = require('../lib/raster/png').encode({ w: c.w, h: c.h, rgba: c.rgba });
      else pics[t.id] = require('../../lib/model/ddsenc').encode(c.rgba, c.w, c.h, { mips: true, best: !!x.best });
    } catch (e) { if (!keepGoing(e)) throw e; failed.push(failOf(t, e)); }
    prog.step(1);
  }
  rows = rows.filter(t => pics[t.id]);
  prog.stage('commit', 1);
  const renames = x.renameStronger ? rows.map(t => p.files_['stronger:' + t.id]).filter(Boolean) : [];
  // prog.stage('commit') above was the last cancel test: once commit runs, the mod has changed and the run ends 0 or 1.
  // --all with every file failed or skipped: nothing is committed (no empty journal entry)
  const r = rows.length || !all ? I.commit(x.mod, p, pics, { renameStronger: renames }) : { written: [], backups: [], renamed: [], entry: null };
  try { prog.step(1); } catch (e) { if (!(e instanceof M.MvError && e.code === 'MV_CANCELLED')) throw e; }   // the line is out; a late cancel is ignored
  // late P3: notes [{code, text}], one per (target, code), the file named in the text; target kept as an extra field
  const notes = [];
  for (const t of rows) {
    const tx = composed[t.id].texts || {};
    // a paint note text may name a file by its full path: only the base name goes out (bodies never hold a drive path)
    const scrub = s => String(s).replace(/(?<![\w.])(?:[A-Za-z]:)?[\\/][^\s,;:)]*[\\/]([^\\/\s,;:)]+)/g, '$1');
    for (const c of composed[t.id].notes) {
      const s = tx[c] ? scrub(tx[c]) : null;
      notes.push({ code: c, text: s && !/[A-Za-z]:[\\/]/.test(s) ? t.file + ': ' + s : I.noteText(c, t.file), target: t.id });
    }
  }
  const body = { v: 1, target: p.target, map: p.map, mode: p.mode, planHash: p.hash, written: r.written, backups: r.backups,
    entry: r.entry ? { n: r.entry.n, made: r.entry.made } : null, notes, n: r.entry ? r.entry.n : null, renamed: r.renamed,
    files: r.entry ? r.entry.files.map(f => ({ path: f.path, sha1: f.sha1, bytes: f.bytes, before: f.before })) : [] };
  if (all) { body.all = true; body.skipped = skipped; body.failed = failed; }
  writeOut(M, o, 'previews.write.json', body, src);
  say(o, body, r.written.map(f => 'wrote ' + f).concat(r.backups.map(f => 'backup ' + f), r.renamed.map(f => 'moved ' + f),
    skipped.map(f => 'skipped ' + f.path + ': ' + f.why), failed.map(f => 'FAILED ' + f.path + ': ' + f.code + ' ' + f.why)).join('\n') + '\njournal entry ' + (r.entry ? r.entry.n : 'none'));
  const strongerLeft = rows.some(t => t.notes.includes('PRV_STRONGER_FILE')) && !x.renameStronger;
  // paint's own sidecar notes (PAINT_*) are reported, not findings; a PRV_ note from compose is
  const prvNote = rows.some(t => composed[t.id].notes.some(c => /^PRV_/.test(c) && !I.INFO.has(c)));
  return I.findings(p) || prvNote || strongerLeft || failed.length ? 1 : 0;
}

async function cmdCheck(argv) {
  const { M, o, x } = setup(argv);
  const I = require('./index'), G = require('./guard');
  const g = G.guard(x.mod, o.target, { game: o.game });
  if (g) throw new M.MvError(g.code === 'PRV_MOD_MISSING' ? 'MV_NOT_FOUND' : 'MV_REFUSED', g.why, { code: g.code });
  const { src, doc } = open(M, o);
  const fake = { mod: { inStack: (src.modDirs || []).some(d => G.same(d, x.mod)) || (src.mods || []).some(m => String(m).split(':')[0].toLowerCase() === require('path').basename(x.mod).toLowerCase()) } };
  const ans = I.check(src, doc, { mod: x.mod, targets: x.targets ? String(x.targets).split(',').map(s => s.trim()) : null, minimapSize: x.minimapSize,
    winners: I.winners(src, doc, fake, require('path').resolve(x.mod)) });
  writeOut(M, o, 'previews.check.json', ans, null);
  say(o, ans, ans.files.map(f => (f.ok ? 'ok   ' : 'FAIL ') + f.path + (f.facts ? ' ' + f.facts.format + ' ' + f.facts.size.join('x') + ' ' + f.facts.mips + ' mips' : '') + (f.why ? ': ' + f.why : '') + (f.notes.length ? ' ' + f.notes.join(' ') : '')).join('\n'));
  return ans.ok ? 0 : 1;
}

async function cmdUndo(argv) {
  const { M, o, x } = setup(argv);
  const I = require('./index'), G = require('./guard');
  const g = G.guard(x.mod, o.target, { game: o.game });
  if (g) throw new M.MvError(g.code === 'PRV_MOD_MISSING' ? 'MV_NOT_FOUND' : 'MV_REFUSED', g.why, { code: g.code });
  const ans = I.undo(x.mod, { n: x.n, map: o.map, target: o.target });
  const gone = new Set(ans.deleted || []);
  say(o, ans, ans.restored.map(f => (gone.has(f) ? 'removed ' : 'restored ') + f).concat(ans.kept.map(f => 'kept (changed since the write) ' + f)).join('\n') || 'nothing to do');
  return ans.kept.length ? 1 : 0;
}

module.exports = {
  part: 'previews', version: VERSION, summary: 'the pictures a game loads as map previews, written into a mod', commands,
  run(argv) {
    const c = argv[0];
    if (c === 'plan') return cmdPlan(argv);
    if (c === 'write') return cmdWrite(argv);
    if (c === 'check') return cmdCheck(argv);
    if (c === 'undo') return cmdUndo(argv);
    const M = require('../mapviz');
    throw new M.MvError('MV_USAGE', 'no command ' + c + '; commands: ' + Object.keys(commands).join(', '));
  },
};
