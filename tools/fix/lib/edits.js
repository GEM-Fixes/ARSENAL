// fix/edits: SDL-file fixers on a mod's own files. each edit = { kind, key, out, before, after, lines:Set (changed line numbers), why }
//   repoint(c, findings) -> { edits, cant }   refcheck path findings with exactly 1 same-basename candidate in the vfs
//   setEdits(c, specs)   -> { edits, cant }   --set file:path=value: whole winning file copied from its vfs layer, patched via lib/sdlwrite
// Author: Imperator_Aug (ARSENAL, ia-f8465160)
const vfs = require('../../lib/vfs');
const pe = require('../../patch-entity/patch-entity');

const base = s => s.replace(/\\/g, '/').split('/').pop();
const stem = s => base(s).replace(/\.[^.\/]+$/, '').toLowerCase();
const extOf = s => { const m = /\.([^.\/\\]+)$/.exec(s); return m ? m[1].toLowerCase() : ''; };
const KINDS = {
  REF_MODEL_MISSING: { re: /^Extension "([^"]+)"/, exts: ['ext', 'mdl'] },
  REF_MESH_MISSING: { re: /^\w+ "([^"]+)" not found/, exts: ['ply', 'vol', 'anm', 'mdl'] },
  REF_TEXTURE_MISSING: { re: /^texture "([^"]+)"/, exts: ['dds', 'tga', 'ebm', 'bmp', 'tex'], tex: true },
  REF_SOUND_MISSING: { re: /^(?:fireSound|reloadSound) "([^"]+)"/, exts: ['wav'], sound: true },
  REF_WRONG_FOLDER: { re: /^(?:\w+) "([^"]+)" resolves/, exts: null, given: /write "([^"]+)" or move|but exists as (\S+)/ },
  // VIS-12: preset id = file path under set/environment/ without the extension; exactly 1 file of that base name there -> the id is rewritten
  ENV_PRESET_MISSING: { re: /^environment preset "([^"]+)"/, exts: ['set'], env: true },
};
const ENVDIR = 'resource/set/environment/';
const REPOINT_CODES = Object.keys(KINDS);

let _idx = null;
function index(c) {
  if (_idx && _idx.v === c.v) return _idx.map;
  const map = new Map();
  for (const k of c.v.files.keys()) { const s = stem(k); let a = map.get(s); if (!a) map.set(s, a = []); a.push(k); }
  _idx = { v: c.v, map };
  return map;
}

// folders under resource/sound/ that directly hold >= 1 .wav, keyed by last segment (lowercase)
let _sd = null;
function soundDirs(c) {
  if (_sd && _sd.v === c.v) return _sd.map;
  const map = new Map();
  for (const k of c.v.files.keys()) {
    if (!k.startsWith('resource/sound/') || extOf(k) !== 'wav') continue;
    const d = k.slice(0, k.lastIndexOf('/')), s = d.split('/').pop();
    let a = map.get(s); if (!a) map.set(s, a = new Set()); a.add(d);
  }
  _sd = { v: c.v, map };
  return map;
}

function repoint(c, findings) {
  const edits = new Map(), cant = [], done = [], grp = new Map();
  // environment presets: one name is often used on hundreds of lines, so a refusal is one row per (code, name) with a count
  const refuse = (K, f, v, code, msg) => {
    if (!K.env) { cant.push({ key: f.file, line: f.line, code, msg }); return; }
    const g = grp.get(code + '|' + v.toLowerCase());
    if (g) g.n++; else grp.set(code + '|' + v.toLowerCase(), { n: 1, row: { key: f.file, line: f.line, code, msg } });
  };
  for (const f of findings) {
    const K = KINDS[f.code];
    if (!K) continue;
    const loc = `${f.file}:${f.line}`;
    const m = K.re.exec(f.msg);
    if (!m) { cant.push({ key: f.file, line: f.line, code: 'FIX_REPOINT_PARSE', msg: `${f.code}: cannot read the path from "${f.msg.slice(0, 60)}"` }); continue; }
    const v = m[1], key = f.file.toLowerCase();
    const rec = c.v.files.get(key);
    if (!c.mineOf(rec)) { refuse(K, f, v, 'FIX_REPOINT_NOT_MINE', `${f.code} "${v}": the file wins from ${rec ? rec.layer : 'nowhere'}, not from this mod`); continue; }
    // candidate
    let target = null, why = '', isDir = false;
    if (K.env) {
      const id = v.replace(/\\/g, '/').replace(/\.set$/i, '');
      const uniq = [...new Set((index(c).get(base(id).toLowerCase()) || []).filter(k => k.startsWith(ENVDIR)))];
      if (uniq.length === 1) target = uniq[0].slice(ENVDIR.length).replace(/\.[^.\/]+$/, '');
      else why = uniq.length ? `${uniq.length} candidates: ${uniq.slice(0, 5).join(' | ')}${uniq.length > 5 ? ' ...' : ''}` : '0 candidates with that name';
    } else if (K.given) {
      const g = K.given.exec(f.msg), p = g && (g[1] || g[2]);
      if (p) target = p.startsWith('/') ? p.slice(1) : p.replace(/^resource\//, '');
      else { why = 'no single path in the finding'; }
    } else {
      const vv = K.sound ? v.replace(/[\\/]+$/, '') : v;
      const vx = extOf(vv), want = vx ? [vx] : K.exts;
      const cands = (index(c).get(stem(vv)) || []).filter(k => k.startsWith('resource/') && want.includes(extOf(k)));
      const uniq = [...new Set(cands)];
      // sound names may be a folder holding .wav files (VIS-08): folder index, TF-16 row 183 [I: file-vs-folder precedence [T]]
      const dirs = K.sound && !vx ? [...(soundDirs(c).get(base(vv).toLowerCase()) || [])] : [];
      if (uniq.length === 1 && !dirs.length) target = uniq[0].replace(/^resource\//, '').replace(vx || !(K.tex || K.sound) ? /$^/ : /\.[^.\/]+$/, '');
      else if (!uniq.length && dirs.length === 1) { target = dirs[0].replace(/^resource\//, ''); isDir = true; }
      else if (uniq.length + dirs.length) why = `${uniq.length + dirs.length} candidates: ${uniq.concat(dirs).slice(0, 5).join(' | ')}${uniq.length + dirs.length > 5 ? ' ...' : ''}`;
      else why = '0 candidates with that name';
    }
    if (!target) { refuse(K, f, v, uniq0(why) ? 'FIX_REPOINT_NO_CANDIDATE' : 'FIX_REPOINT_AMBIGUOUS', `${f.code} "${v}" (${loc}): ${why}`); continue; }
    if (/[^\x20-\x7e]/.test(target) || /["{}]/.test(target)) { refuse(K, f, v, 'FIX_REPOINT_NON_ASCII', `${f.code} "${v}": candidate path has odd characters: ${target}`); continue; }
    // sounds resolve as resource/sound/<name> (leading slashes dropped, VIS-08), so no leading slash and no sound/ prefix
    // GoH: fireSound / reloadSound are read under sound/weapon/shot/ and sound/weapon/reload/ (GoH ), so the
    // value is the rest of the path below that folder, with a trailing "/" for a folder (the form vanilla GoH writes); outside it: refused
    const gohPre = K.sound && c.exe === 'goh' ? (/^reloadSound/.test(f.msg) ? 'sound/weapon/reload/' : 'sound/weapon/shot/') : null;
    if (gohPre && !target.toLowerCase().startsWith(gohPre)) { cant.push({ key: f.file, line: f.line, code: 'FIX_REPOINT_NO_CANDIDATE', msg: `${f.code} "${v}": the only same-name sound is outside resource/${gohPre.slice(0, -1)}, where GoH looks: ${target}` }); continue; }
    if (K.sound && !/^sound\//.test(target)) { cant.push({ key: f.file, line: f.line, code: 'FIX_REPOINT_NO_CANDIDATE', msg: `${f.code} "${v}": the only same-name file is outside resource/sound: ${target}` }); continue; }
    const nv = gohPre ? target.slice(gohPre.length) + (isDir ? '/' : '') : K.sound ? target.replace(/^sound\//, '') : K.env ? target : '/' + target;
    let e = edits.get(key);
    if (!e) { const b = vfs.readRec(rec); e = { kind: 'repoint', key, out: key, before: b, lines: new Set(), why: [], work: b.toString('latin1').split('\n') }; edits.set(key, e); }
    const L = e.work[f.line - 1];
    // environment: the quoted value, so a preset name that is also a word on the line is not hit
    const nd = (K.env ? '"' + v + '"' : v).toLowerCase(), off = K.env ? 1 : 0;
    const at = L === undefined ? -1 : L.toLowerCase().indexOf(nd);
    if (at < 0 || L.toLowerCase().indexOf(nd, at + 1) >= 0) { refuse(K, f, v, 'FIX_REPOINT_NOT_ON_LINE', `${f.code} "${v}": value not found exactly once on line ${f.line} (included/macro text?)`); continue; }
    e.work[f.line - 1] = L.slice(0, at + off) + nv + L.slice(at + off + v.length);
    (e.targets = e.targets || []).push(f);
    e.lines.add(f.line); e.why.push(`${f.code} line ${f.line}: "${v}" -> "${nv}"`);
    done.push(f);
  }
  for (const g of grp.values()) { if (g.n > 1) g.row.msg += ` (same on ${g.n} lines, first shown)`; cant.push(g.row); }
  const out = [];
  for (const e of edits.values()) { if (!e.lines.size) continue; e.after = Buffer.from(e.work.join('\n'), 'latin1'); delete e.work; out.push(e); }
  return { edits: out, cant, done };
}
const uniq0 = w => /^(0 cand|no single)/.test(w);

// spec = "file:path=value" ; file = vfs key (resource/ optional), path/value = patch-entity syntax (a/b, a/b#N, a/b[2])
// prior (optional) = Map out-path -> earlier edit of the same file: --set then composes on its bytes (TF-16 row 184) [I: untested]
function setEdits(c, specs, prior) {
  const edits = new Map(), cant = [], reused = new Set();
  for (const s of specs) {
    const ci = s.indexOf(':'), eq = s.indexOf('=');
    if (ci < 1 || eq < ci + 2) { cant.push({ key: s, code: 'FIX_SET_BAD_SPEC', msg: 'expected file:path=value' }); continue; }
    let key = s.slice(0, ci).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (!key.startsWith('resource/')) key = 'resource/' + key;
    const spec = { op: 'set', path: s.slice(ci + 1, eq), value: s.slice(eq + 1) };
    let e = edits.get(key);
    if (!e && prior && prior.has(key)) {
      e = prior.get(key); e.cur = e.after; e.reused = true; reused.add(e); edits.set(key, e);
    }
    if (!e) {
      const rec = c.v.files.get(key);
      if (!rec) { cant.push({ key, code: 'FIX_SET_NO_FILE', msg: 'not in the vfs (vanilla, deps, mod)' }); continue; }
      const b = vfs.readRec(rec);
      e = { kind: 'set', key, out: key, before: b, cur: b, lines: new Set(), why: [], from: rec.layer };
      edits.set(key, e);
    }
    let r;
    try { r = pe.applyEdit(e.cur, spec); } catch (x) { r = { err: ['PATCH_NOT_SDL', x.message] }; }
    if (r.err) { cant.push({ key, code: 'FIX_SET_' + r.err[0], msg: `${spec.path}: ${r.err[1]}` }); continue; }
    e.cur = r.buf; e.why.push(`set ${spec.path} = ${spec.value}`);
  }
  const out = [];
  for (const e of edits.values()) {
    if (!e.why.length || Buffer.compare(e.cur, e.before) === 0) { if (e.reused) { delete e.cur; delete e.reused; } continue; }
    e.after = e.cur; delete e.cur;
    for (const d of pe.lineDiff(e.before.toString('latin1'), e.after.toString('latin1'))) { const m = /^[-+](\d+):/.exec(d); if (m) e.lines.add(+m[1]); }
    if (e.reused) { delete e.reused; continue; } // already in the caller's list: union of lines, not pushed twice
    out.push(e);
  }
  return { edits: out, cant };
}

module.exports = { repoint, setEdits, REPOINT_CODES };
