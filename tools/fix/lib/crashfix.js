// fix/crashfix: fixers for crash-class findings of the source mod. each returns { edits, cant } like edits.js (edit = { kind, key, out, before, after, lines:Set, why:[], targets })
//   include(c, lint)      INCLUDE_MISSING with exactly 1 same-basename file in the vfs: the include path is rewritten; 0 or >1: refused, candidates listed
//   macro(c, lint)        MACRO_UNDEFINED where exactly 1 other .inc/.set/.ext in the vfs defines that name: an (include) line is added at the top of the using file; else refused
//   stubmtl(c)            PLY_MTL_MISSING (binhdr, FMT-03: load-time crash): copy of the nearest same-folder .mtl placed at the missing key; no .mtl in the folder: refused
//   quarantine(c, work, o) entities still crash-class in the patch result (wouldload classify): mod.info Delete of their .def in the patch mod, with what refers to them
// Author: Imperator_Aug (ARSENAL, ia-6bb1b7a1)
const path = require('path');
const vfs = require('../../lib/vfs'), C = require('../../modmove/lib/common'), refscan = require('./refscan');

const bname = k => k.split('/').pop().toLowerCase();
const strip = code => code.replace(/^WARN_/, '');
function lintFolder(c, folder) {
  const r = require('../../sdllint/sdllint').lint(Object.assign({ folder, gameDir: c.game, mods: c.list }, c.exe ? { exe: c.exe } : {}));
  return r.rep.toJSON({ tool: 'sdllint' }).findings;
}
function mineRec(c, f) { const rec = c.v.files.get(String(f.file).toLowerCase()); return c.mineOf(rec) ? rec : null; }
function editFor(map, c, rec, key) {
  let e = map.get(key);
  if (!e) { const b = vfs.readRec(rec); e = { key, out: key, before: b, lines: new Set(), why: [], targets: [], work: b.toString('latin1').split('\n') }; map.set(key, e); }
  return e;
}
function finish(map, kind) {
  const out = [];
  for (const e of map.values()) { if (!e.why.length) continue; e.kind = kind; e.after = Buffer.from(e.work.join('\n'), 'latin1'); delete e.work; out.push(e); }
  return out;
}

let _bn = null;
function byBase(c) {
  if (_bn && _bn.v === c.v) return _bn.map;
  const map = new Map();
  for (const k of c.v.files.keys()) { const b = bname(k); let a = map.get(b); if (!a) map.set(b, a = []); a.push(k); }
  _bn = { v: c.v, map };
  return map;
}
const absRef = key => '/' + key.replace(/^resource\//, '');

function include(c, lint) {
  const edits = new Map(), cant = [], seen = new Set();
  for (const f of lint) {
    if (strip(f.code) !== 'INCLUDE_MISSING') continue;
    const m = /^include "([^"]+)" not found/.exec(f.msg);
    const dk = f.file + ':' + f.line + ':' + (m && m[1]);
    if (seen.has(dk)) continue; seen.add(dk);
    if (!m) { cant.push({ key: f.file, line: f.line, code: 'FIX_INCLUDE_PARSE', msg: 'cannot read the include path from the finding' }); continue; }
    const key = String(f.file).toLowerCase(), rec = mineRec(c, f);
    if (!rec) { cant.push({ key: f.file, line: f.line, code: 'FIX_INCLUDE_NOT_MINE', msg: `include "${m[1]}": the including file wins from ${(c.v.files.get(key) || {}).layer || 'nowhere'}, not from this mod` }); continue; }
    const v = m[1];
    let cands = [...new Set((byBase(c).get(bname(v.replace(/\\/g, '/'))) || []).filter(k => k !== key && k.startsWith('resource/')))];
    if (cands.length > 1 && v[0] !== '/') {
      // relative include: prefer the candidate whose folder mirrors the includer's, minus resource/<top>/ (TF-16 row 203: 20 of 21 ambiguous on one mod)
      const tail = key.split('/').slice(2, -1).join('/');
      const mir = cands.filter(k => k.split('/').slice(2, -1).join('/') === tail);
      if (mir.length === 1) cands = mir;
    }
    if (cands.length !== 1) { cant.push({ key: f.file, line: f.line, code: cands.length ? 'FIX_INCLUDE_AMBIGUOUS' : 'FIX_INCLUDE_NO_CANDIDATE', msg: `include "${v}": ${cands.length ? cands.length + ' candidates: ' + cands.slice(0, 5).join(' | ') : '0 files with that name in the vfs'}` }); continue; }
    const nv = absRef(cands[0]);
    if (/[^\x20-\x7e]/.test(nv) || /["{}()]/.test(nv)) { cant.push({ key: f.file, line: f.line, code: 'FIX_INCLUDE_ODD_PATH', msg: `include "${v}": candidate path has odd characters: ${cands[0]}` }); continue; }
    const e = editFor(edits, c, rec, key), L = e.work[f.line - 1];
    const at = L === undefined ? -1 : L.toLowerCase().indexOf('"' + v.toLowerCase() + '"');
    if (at < 0 || L.toLowerCase().indexOf('"' + v.toLowerCase() + '"', at + 1) >= 0) { cant.push({ key: f.file, line: f.line, code: 'FIX_INCLUDE_NOT_ON_LINE', msg: `include "${v}": not found exactly once on line ${f.line}` }); continue; }
    e.work[f.line - 1] = L.slice(0, at + 1) + nv + L.slice(at + 1 + v.length);
    e.targets.push(f); e.lines.add(f.line); e.why.push(`INCLUDE_MISSING line ${f.line}: "${v}" -> "${nv}"`);
  }
  return { edits: finish(edits, 'include'), cant };
}

// define index: name -> [keys] over .inc/.set/.ext (defines sit there; .def files only include them)
let _def = null;
function defIndex(c) {
  if (_def && _def.v === c.v) return _def.map;
  const map = new Map(), re = /\(\s*define\s+"([^"]+)"/gi;
  for (const [k, rec] of c.v.files) {
    if (!/\.(inc|set|ext)$/.test(k) || !k.startsWith('resource/')) continue;
    let b; try { b = vfs.readRec(rec); } catch { continue; }
    if (b.indexOf('define') < 0 && b.indexOf('DEFINE') < 0 && b.indexOf('Define') < 0) continue;
    const t = b.toString('latin1'); re.lastIndex = 0; let m;
    while ((m = re.exec(t))) { let a = map.get(m[1]); if (!a) map.set(m[1], a = new Set()); a.add(k); }
  }
  _def = { v: c.v, map };
  return map;
}
function macro(c, lint) {
  const edits = new Map(), cant = [], seen = new Set();
  for (const f of lint) {
    if (strip(f.code) !== 'MACRO_UNDEFINED') continue;
    const m = /^define not found: "([^"]+)"/.exec(f.msg);
    if (!m) { cant.push({ key: f.file, line: f.line, code: 'FIX_MACRO_PARSE', msg: 'cannot read the macro name from the finding' }); continue; }
    const key = String(f.file).toLowerCase(), dk = key + ':' + m[1];
    if (seen.has(dk)) continue; seen.add(dk);
    const rec = mineRec(c, f);
    if (!rec) { cant.push({ key: f.file, line: f.line, code: 'FIX_MACRO_NOT_MINE', msg: `macro "${m[1]}": the using file wins from ${(c.v.files.get(key) || {}).layer || 'nowhere'}, not from this mod` }); continue; }
    const where = [...(defIndex(c).get(m[1]) || [])].filter(k => k !== key);
    if (where.length !== 1) { cant.push({ key: f.file, line: f.line, code: where.length ? 'FIX_MACRO_AMBIGUOUS' : 'FIX_MACRO_NO_DEFINITION', msg: `macro "${m[1]}": ${where.length ? 'defined in ' + where.length + ' places: ' + where.slice(0, 5).join(' | ') : 'no .inc/.set/.ext in the vfs defines it'}` }); continue; }
    const e = editFor(edits, c, rec, key);
    const bom = e.work[0].charCodeAt(0) === 0xEF && e.work[0].slice(0, 3) === '\xEF\xBB\xBF';
    // same-line prefix: line numbers of every finding stay valid (TF-16 row 201) [I: SDL is whitespace-insensitive; a ';SDL' marker line stays [T]]
    const inc = `(include "${absRef(where[0])}") `;
    e.work[0] = bom ? e.work[0].slice(0, 3) + inc + e.work[0].slice(3) : inc + e.work[0];
    e.added = (e.added || []).concat(where[0]);
    e.targets.push(f); e.lines.add(1); e.why.push(`MACRO_UNDEFINED "${m[1]}" (line ${f.line}): added (include "${absRef(where[0])}") at the top`);
  }
  return { edits: finish(edits, 'macro'), cant };
}

function stubmtl(c, o) {
  const cant = [], edits = [], seen = new Set();
  const r = C.runTool('binhdr', [c.game, '--mods', c.list.join(','), '--strict', '--ext', 'ply', '-q'].concat(c.exe ? ['--exe', c.exe] : []));
  if (!/^\d+ findings/m.test(r.out)) return { edits, cant: [{ key: '-', code: 'FIX_STUBMTL_BINHDR_FAILED', msg: 'binhdr did not finish: ' + (r.err || r.out).slice(0, 160) }] };
  // only meshes something reaches: the ply's name is referenced (whole word) by a text file; a .mdl referrer must itself be referenced, up to 3 hops
  const fl = C.parseFindings(r.out).filter(x => x.code === 'PLY_MTL_MISSING' && !x.info), skipped = [];
  const plyName = f => bname(String(f.file)).replace(/\.[^.]+$/, '');
  const reach = new Map();   // name -> true when reached
  let front = new Map([...new Set(fl.map(plyName))].map(n => [n, [n]]));   // current name -> original ply names
  for (let hop = 0; hop < 3 && front.size; hop++) {
    const hits = refscan.scan(c, front.keys()), next = new Map();
    for (const [n, origs] of front) for (const h of hits.get(n) || []) {
      if (/\.mdl$/.test(h.file)) { const mn = bname(h.file).replace(/\.mdl$/, ''); if (mn !== n) { const a = next.get(mn) || []; next.set(mn, a.concat(origs)); } }
      else for (const o2 of origs) reach.set(o2, true);
    }
    front = next;
  }
  for (const f of fl) {
    if (!reach.has(plyName(f))) { skipped.push({ key: f.file, msg: `${f.file}: no text file references "${plyName(f)}": no stub for its missing material` }); continue; }
    const rec = c.v.files.get(String(f.file).toLowerCase());
    if (!c.mineOf(rec)) { cant.push({ key: f.file, line: 0, code: 'FIX_STUBMTL_NOT_MINE', msg: 'mesh wins from ' + (rec ? rec.layer : 'nowhere') + ', not from this mod' }); continue; }
    const m = /-> (\S+) not in resource index/.exec(f.msg);
    if (!m) { cant.push({ key: f.file, line: 0, code: 'FIX_STUBMTL_PARSE', msg: 'cannot read the missing .mtl key from the finding' }); continue; }
    const key = m[1];
    if (seen.has(key)) continue; seen.add(key);
    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const sib = [...c.v.files.keys()].filter(k => k.startsWith(dir) && k.indexOf('/', dir.length) < 0 && k.endsWith('.mtl')).sort();
    if (!sib.length) { cant.push({ key: f.file, line: 0, code: 'FIX_STUBMTL_NO_SOURCE', msg: `${key} missing and no other .mtl in ${dir}: nothing safe to copy` }); continue; }
    const want = key.slice(dir.length).replace(/\.mtl$/, ''), pick = sib.find(k => bname(k).startsWith(want.slice(0, 3))) || sib[0];
    edits.push({ kind: 'stubmtl', key, out: key, before: null, after: vfs.readRec(c.v.files.get(pick)), lines: new Set(), why: [`${f.file}: ${key} missing (load-time crash, FMT-03); copy of ${pick}. VISUAL RISK: textures/shading come from the copied material, not the original`], raw: true });
  }
  return { edits, cant, skipped };
}

// work = patch folder with the surviving edits; returns { del:[{name,key}], cant, refs }
function quarantine(c, work, o) {
  const wl = require('../../wouldload/wouldload'), gate = require('./gate');
  const lint = lintFolder(c, work), ref = gate.refcheck(c, work, o);
  if (!ref.ok) return { del: [], cant: [{ key: '-', code: 'FIX_QUARANTINE_REFCHECK_FAILED', msg: ref.err }], refs: {} };
  const cl = wl.classify(lint, ref.list, { v: c.v, others: new Set() });
  const idx = new Map();
  for (const k of c.v.files.keys()) if (/^resource\/entity\/.*\.def$/.test(k)) { const n = bname(k).replace(/\.def$/, ''); let a = idx.get(n); if (!a) idx.set(n, a = []); a.push(k); }
  const del = [], cant = [];
  for (const x of cl.crash) {
    const ks = idx.get(x.entity) || [], mine = ks.filter(k => c.mineOf(c.v.files.get(k)));
    if (ks.length && mine.length === ks.length) for (const k of mine) del.push({ name: x.entity, key: k, why: `${x.code} ${x.file}:${x.line}` });
    else cant.push({ key: x.file, line: x.line, code: 'FIX_QUARANTINE_NOT_MINE', msg: `${x.entity}: ${x.code}; its .def ${ks.length ? 'wins from another layer (' + ks.join(', ') + ')' : 'is not found'}: not removed` });
  }
  if (cl.unnamed) cant.push({ key: '-', line: 0, code: 'FIX_QUARANTINE_UNNAMED', msg: `${cl.unnamed} more entities are crash-class behind shared refs and cannot be named: not removed` });
  // who refers: one whole-word pass over every visible text file (loose, paks, N.pat); kind decides whether deleting is allowed
  const refs = {}, counts = { quarantined: 0, referenced: 0, refused: 0 };
  const keep = [];
  if (del.length) {
    const names = [...new Set(del.map(d => d.name))], dead = new Set(del.map(d => d.key));
    const hits = refscan.scan(c, names, { skipKeys: dead });
    for (const n of names) {
      const rf = hits.get(n) || [];
      refs[n] = rf;
      if (rf.length) counts.referenced++;
      const bad = rf.find(r => refscan.decide(r.kind) === 'fatal') || rf.find(r => refscan.decide(r.kind) === 'unknown');
      if (bad) {
        counts.refused++;
        cant.push({ key: bad.file, line: bad.line, code: 'QUARANTINE_REFUSED', msg: `${n}: ${bad.file}:${bad.line} (${bad.kind}) would turn a load fault into a fatal one; entity kept` + (refscan.decide(bad.kind) === 'unknown' ? ' [I: referrer kind ' + bad.kind + ' not proven safe]' : ''), entity: n });
      } else keep.push(n);
    }
  }
  const final = del.filter(d => keep.includes(d.name));
  counts.quarantined = new Set(final.map(d => d.name)).size;
  return { del: final, cant, refs, counts };
}

module.exports = { include, macro, stubmtl, quarantine, lintFolder, mineRec, editFor, defIndex, strip };
