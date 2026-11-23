// soedit/check: after SOEdit closes, compare the staged files now against the stage record (README "check").
//   check({arg, game, exe, json, q, log, runLinters}) -> exit code (0 nothing lost, 1 a loss or a missing file, 2 no record)
//   originals = the pristine copies stage keeps at <mod>/.arsenal/soedit/<stem>.orig/<rel>; when one is gone, the source named in the
//     record (game loose file, pak entry, mod file) is re-read and used only if its sha256 still equals the recorded one.
//   per file: FILE_UNCHANGED (info), FILE_CHANGED, FILE_MISSING, FILE_NEW (a .mdl .ply .vol .anm .mtl in a staged folder, not in the record)
//   losses in changed files:
//     WARN_ANM_VERSION_CHANGED  .anm EANM version differs (lib/anm.js header)             [I: whether the game reads both versions alike]
//     WARN_PLY_SUBM_TO_MESH     .ply has fewer SUBM and more MESH parts than before (lib/ply.js)  [I: what a MESH rewrite drops]
//     MDL_KEYWORD_LOST          a keyword block of a bone / volume / sequence present before is gone (names the owner and the keyword);
//                               also a whole bone, volume or sequence that is gone
//     MDL_BLOCK_LOST            a top-level block (Skeleton, Volume "n", ...) is gone
//     MDL_COMMENTS_DROPPED      fewer ';' comment lines than before (count)
//   then tools/binhdr (`<game|-> --folder <mod>`) and tools/expcheck (`<mod> --game G`) run on the mod folder; only their findings on the
//   changed/new files are kept (codes kept, message prefixed with the tool name). expcheck is skipped without a game folder.
//   exe (o.exe, else the stage record's exe): a game other than AS64 is passed on to expcheck as --exe <exe> (MoW:AS2: no as64/core
//   in its view); no exe or as64: the argument lists are as before. linters(out, rels, game, rep, run, exe).
// Author: Imperator_Aug (ARSENAL, ia-27643974)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { createReport } = require('../lib/report'), sdl = require('../lib/sdl'), anm = require('../lib/anm'), ply = require('../lib/ply'), pak = require('../lib/pak');
const S = require('./stage');

const LOSS_FREE = new Set(['FILE_CHANGED', 'FILE_NEW']);
const fwd = p => String(p).replace(/\\/g, '/');
const keyToDisk = (root, key) => path.join(root, ...key.split('/'));
const readOr = f => { try { return fs.readFileSync(f); } catch (e) { return null; } };

// ---- .mdl structure
function commentLines(text) {
  let n = 0;
  for (const L of text.split(/\r?\n/)) {
    let inStr = false;
    for (let i = 0; i < L.length; i++) {
      const c = L[i];
      if (c === '"' && L[i - 1] !== '\\') inStr = !inStr;
      else if (c === ';' && !inStr) { n++; break; }
    }
  }
  return n;
}
const sOf = n => { const s = n.vals.find(v => v.t === 's'); return s ? s.v : (n.vals.length ? n.vals[n.vals.length - 1].v : ''); };
// -> {top: Map sig -> [line], ents: Map id -> {label, line, kw:Set}}
function mdlShape(buf) {
  const text = buf.toString('latin1');
  const tree = sdl.parseLines(text.split(/\r?\n/));
  const top = new Map(), ents = new Map();
  for (const k of tree.kids) {
    const sig = (k.name || '') + (k.vals.length ? ` "${sOf(k)}"` : '');
    if (!top.has(sig)) top.set(sig, []); top.get(sig).push(k.line);
  }
  const ENT = new Set(['bone', 'volume', 'sequence']);
  const seen = new Map();
  (function walk(n, owner, inVol) {
    for (const k of n.kids) {
      const nm = (k.name || '').toLowerCase();
      if (ENT.has(nm) && !(inVol && nm === 'bone')) {   // {Volume {Bone "b"}} names the bone the volume hangs on: a keyword, not a bone
        const name = sOf(k);
        const base = nm === 'sequence' ? `sequence "${name}" of ${owner}` : `${nm} "${name}"`;
        const c = (seen.get(base) || 0) + 1; seen.set(base, c);
        const id = c > 1 ? `${base} #${c}` : base;
        const kw = new Set();
        for (const v of k.vals) if (v.t === 'w') kw.add('type ' + v.v.toLowerCase());
        for (const x of k.kids) { const xn = (x.name || '').toLowerCase(); if (!ENT.has(xn) || (nm === 'volume' && xn === 'bone')) kw.add(xn); }
        ents.set(id, { label: id, line: k.line, kw });
        if (nm !== 'volume') walk(k, nm === 'bone' ? `bone "${name}"` : owner, false);
      } else walk(k, owner, inVol);
    }
  })(tree, 'the model', false);
  return { top, ents, comments: commentLines(text) };
}
function mdlLoss(a, b, add) {
  const A = mdlShape(a), B = mdlShape(b), lostTop = new Set();
  for (const [sig, ls] of A.top) {
    const n = (B.top.get(sig) || []).length;
    if (n < ls.length) { lostTop.add(sig.toLowerCase()); add(0, 'MDL_BLOCK_LOST', `top-level block {${sig}} is gone (${ls.length} before, ${n} now; was line ${ls[n]})`); }
  }
  for (const [id, e] of A.ents) {
    const f = B.ents.get(id);
    if (!f) { if (!lostTop.has(id.replace(/ #\d+$/, '').toLowerCase())) add(0, 'MDL_KEYWORD_LOST', `${e.label} is gone (was line ${e.line})`); continue; }
    for (const k of e.kw) if (!f.kw.has(k)) add(f.line, 'MDL_KEYWORD_LOST', `${e.label}: ${k.startsWith('type ') ? 'bone ' + k : `{${k}}`} is gone (was line ${e.line})`);
  }
  if (B.comments < A.comments) add(0, 'MDL_COMMENTS_DROPPED', `${A.comments - B.comments} comment lines dropped (${A.comments} before, ${B.comments} now)`);
}
function anmLoss(a, b, add) {
  const A = anm.parseHeader(a), B = anm.parseHeader(b);
  if (A.version !== B.version) add(0, 'WARN_ANM_VERSION_CHANGED', `EANM version ${A.version} -> ${B.version}${B.error ? ` (${B.error})` : ''} [I]`);
}
function plyLoss(a, b, add) {
  const cnt = buf => { const p = ply.parse(buf), c = { SUBM: 0, MESH: 0 }; for (const x of p.parts) c[x.tag]++; return c; };
  const A = cnt(a), B = cnt(b);
  if (B.SUBM < A.SUBM && B.MESH > A.MESH) add(0, 'WARN_PLY_SUBM_TO_MESH', `${A.SUBM - B.SUBM} SUBM parts written back as MESH (SUBM ${A.SUBM} -> ${B.SUBM}, MESH ${A.MESH} -> ${B.MESH}) [I]`);
}
const LOSS = { mdl: mdlLoss, anm: anmLoss, ply: plyLoss };

function original(out, rec, f) {
  const p = S.pristinePath(out, rec.stem, f.rel);
  const b = readOr(p);
  if (b) return b;
  let s = null;
  try {
    if (f.source === 'pak' || (f.pak && f.entry)) { const L = pak.list(f.pak), e = L.find(x => x.name === f.entry); s = e ? pak.read(L, e) : null; }
    else if (f.path) s = readOr(f.path);
  } catch (e) { s = null; }
  return s && S.sha256(s) === f.sha256 ? s : null;
}

// binhdr + expcheck on the mod folder, findings on `rels` only
function defaultRun(script, args) {
  const r = cp.spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 256 << 20 });
  try { return JSON.parse(r.stdout); } catch (e) { return { error: (r.stderr || r.stdout || '').trim().split(/\r?\n/).slice(-1)[0] || `exit ${r.status}` }; }
}
function linters(out, rels, game, rep, run = defaultRun, exe) {
  const want = new Set([...rels].map(r => r.toLowerCase()));
  const keep = (tool, j) => {
    if (!j || j.error) { rep.info('', 0, 'LINTER_FAILED', `${tool} did not run: ${j ? j.error : 'no output'}`); return; }
    let n = 0;
    for (const f of j.findings || []) {
      const rel = fwd(f.file || '').toLowerCase().replace(/^\.\//, '');
      if (!want.has(rel)) continue;
      rep.add(f.file, f.line, f.code, `[${tool}] ${f.msg}`); n++;
    }
    rep.info('', 0, 'LINTER_RAN', `${tool}: ${n} findings on the changed files`);
  };
  const T = path.resolve(__dirname, '..');
  keep('binhdr', run(path.join(T, 'binhdr', 'binhdr.js'), [game || '-', '--folder', out, '--format', 'json', '--no-rc', '-q']));
  const ex = exe === 'mowas2' ? 'mowas_2' : exe;
  if (game) keep('expcheck', run(path.join(T, 'expcheck', 'expcheck.js'), [out, '--game', game, '--format', 'json', '--no-rc', '-q'].concat(ex && ex !== 'as64' ? ['--exe', ex] : [])));
  else rep.info('', 0, 'LINTER_SKIPPED', 'expcheck needs the game folder (--game, or the one in the stage record): skipped');
}

function check(o) {
  const log = o.log || (s => console.log(s));
  let r;
  try { r = S.findRecord(o.arg || ''); } catch (e) { log(`soedit check: the stage record could not be read: ${e.message}`); return 2; }
  if (!r) { log(`soedit check: no stage record for ${o.arg}. Stage the model first: node tools/soedit/soedit.js stage <entity or .mdl> --out <mod folder>`); return 2; }
  const rec = r.rec, out = S.outOfRecord(r.file), rep = createReport();
  const game = o.game || rec.game || null, exe = o.exe || rec.exe || null;
  const touched = [];
  const known = new Set(rec.files.map(f => f.rel.toLowerCase()));
  for (const f of rec.files) {
    const cur = readOr(keyToDisk(out, f.rel));
    if (!cur) { rep.add(f.rel, 0, 'FILE_MISSING', `staged ${f.kind} is gone from the mod folder`); continue; }
    const h = S.sha256(cur);
    if (h === f.sha256) { rep.info(f.rel, 0, 'FILE_UNCHANGED', 'same bytes as staged'); continue; }
    rep.add(f.rel, 0, 'FILE_CHANGED', `${f.size} -> ${cur.length} bytes`);
    touched.push(f.rel);
    const fn = LOSS[f.kind];
    if (!fn) continue;
    const orig = original(out, rec, f);
    if (!orig) { rep.info(f.rel, 0, 'ORIGINAL_MISSING', 'no pristine copy and the source changed: loss checks skipped'); continue; }
    try { fn(orig, cur, (line, code, msg) => rep.add(f.rel, line, code, msg)); }
    catch (e) { rep.info(f.rel, 0, 'LOSS_CHECK_FAILED', e.message); }
  }
  // new editable files in the staged folders
  const dirs = new Set(rec.files.map(f => f.rel.slice(0, f.rel.lastIndexOf('/') + 1)));
  for (const d of [...dirs].sort()) {
    let list = []; try { list = fs.readdirSync(keyToDisk(out, d.replace(/\/$/, ''))); } catch (e) { continue; }
    for (const n of list.sort()) {
      const rel = d + n;
      if (known.has(rel.toLowerCase()) || !S.EDIT_EXTS.has(path.extname(n).toLowerCase())) continue;
      try { if (!fs.statSync(keyToDisk(out, rel)).isFile()) continue; } catch (e) { continue; }
      rep.add(rel, 0, 'FILE_NEW', 'not in the stage record (written after staging)');
      touched.push(rel);
    }
  }
  if (touched.length && o.linters !== false) linters(out, touched, game, rep, o.runLinters, exe);
  rep.print({ format: 'text', showInfo: !o.q, meta: { tool: 'soedit' } });
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(Object.assign(rep.toJSON({ tool: 'soedit' }), { record: fwd(r.file), changed: touched }), null, 1) + '\n');
  return Object.keys(rep.counts).some(c => !LOSS_FREE.has(c)) ? 1 : 0;
}

module.exports = { check, mdlShape, mdlLoss, anmLoss, plyLoss, commentLines, linters };
