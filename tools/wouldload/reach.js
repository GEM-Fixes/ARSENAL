// wouldload/reach: can anything load the entity a crash-class finding sits on? REACHABLE | ORPHAN | UNKNOWN. UNKNOWN counts like REACHABLE.
// engine facts (src read-only clone):
//   LoadData -> LoadEntityDescriptions enumerates /entity/*.def with repository iterator and only
//   Adds the name -> file into a map. The .def is NOT parsed there. Parse happens
//   on first spawn/preload by name. The two other walks of that map ( tree
//   ReloadInteractions) read only the name/file or an already-loaded raw. So enumeration does not make an unreferenced def load [I].
//   => a def is ORPHAN only when no text of the mod, no vanilla/other-layer file and no same-path override can name it.
// ORPHAN needs ALL of: (1) name not defined on another layer (vanilla or required mod, any dir), (2) mod def path not an override of a lower layer
//   (v.shadows), (3) whole-word, case-insensitive name absent from every text file of the mod layer (loose, resource.pak, N.pat; .def .inc .set .mi
//   .lua .ext .mdl ... any non-media file) other than the def itself, (4) every mod file was read.
// interaction selectors (check-false B): a top-level `{"name" {on ...}}` block in resource/set/interaction*/ files only matches entities that are
//   already loaded: ReloadInteractions walks g_entityDescriptions and calls UpdateInfo on loaded raw [V], so the
//   selector key loads nothing and is blanked before the scan. {spawn}/{tear}/{entity} values inside the block still count.
// reachAll (check --reach-all via wouldload): reach of EVERY mod def + mod .mdl/.ply under resource/entity/ that no mod text names (file token
//   `x.mdl`/`x.ply`) and whose stem is not a def stem of its folder (convention load guard) [I]
// check-false R1: names with '-' (guzzi-sa500, usa-soldier12) are scanned too; their word edge also excludes '-' (x-guzzi-sa500 is no ref).
// check-false R2: not a reference: hits in .lng (key lookup), .tex (texture params) and thumbs.db (Windows cache), and a hit that is the stem
//   of a quoted file name ("p40.dds", "/x/fiat35.mdl"): a file, not an entity name [I]
// not seen: names built at run time (string concatenation in lua/engine), other installed mods naming it, binary map data in unknown formats
//   (scanned as raw bytes, so a plain-text name inside still matches) [T]
// Author: Imperator_Aug (ARSENAL, ia-ea147ba8)
const vfs = require('../lib/vfs');

const MEDIA = new Set(['.dds', '.tga', '.png', '.jpg', '.jpeg', '.bmp', '.wav', '.ogg', '.mp3', '.ply', '.anm', '.bik', '.avi', '.mp4', '.ttf', '.otf', '.exe', '.dll', '.pak', '.pat', '.zip', '.psd', '.fnt', '.lng', '.tex', '.db']);   // .lng: localization text looked up by key, no spawn path (not a reference) [I]; .tex texture params, .db thumbs.db (R2)
const MAX_BYTES = 400 * 1024 * 1024;   // V8 string limit is ~512M chars; map.net of a real 8v8 map is 88 MB
const WORD = /^[a-z0-9_]+$/, DASHED = /^[a-z0-9_][a-z0-9_-]*$/;
// R2: the hit ending at `end` is the stem of a quoted file name ("p40.dds")
const fileStem = (text, end) => /^\.[a-z0-9_]{1,8}"/i.test(text.slice(end, end + 10));
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(i); };
const nameOfKey = k => k.slice(k.lastIndexOf('/') + 1, -4);
const isInteraction = k => /^resource\/set\/interaction[^/]*\//.test(k);
// blank the first string of every top-level block (the selector key): same length, so offsets and lines stay
function stripSelectors(text) {
  const out = text.split('');
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ';') { while (i + 1 < text.length && text[i + 1] !== '\n') i++; }
    else if (c === '"') { while (++i < text.length && text[i] !== '"'); }
    else if (c === '}') { if (depth > 0) depth--; }
    else if (c === '{') {
      if (depth++ !== 0) continue;
      let j = i + 1;
      for (;;) { while (j < text.length && /\s/.test(text[j])) j++; if (text[j] === ';') { while (j < text.length && text[j] !== '\n') j++; } else break; }
      if (text[j] !== '"') continue;
      let k = j + 1; while (k < text.length && text[k] !== '"') { if (text[k] !== '\n') out[k] = ' '; k++; }
      i = k;
    }
  }
  return out.join('');
}
const FILE_TOKEN = /[a-z0-9_\-]+\.(?:mdl|ply)(?![a-z0-9_])/gi;
// the same tokens as FILE_TOKEN (lower case), found from each '.' instead: the regex backtracks over every start in a long word run
// (9 s per pass on a 3000-file mod). '.' is outside the class, so a token is the class run that ends at '.mdl'/'.ply', cut at the end of
// the token before it (the regex's lastIndex), with no [a-z0-9_] after it.
const CLS = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 45;
function fileTokens(text, add) {
  let prev = 0, i = text.indexOf('.');
  while (i >= 0) {
    const e = text.substr(i + 1, 3).toLowerCase();
    if (e === 'mdl' || e === 'ply') {
      let s = i; while (s > prev && CLS(text.charCodeAt(s - 1))) s--;
      const a = text.charCodeAt(i + 4);
      if (s < i && !(CLS(a) && a !== 45)) { add(text.slice(s, i + 4).toLowerCase()); prev = i + 4; i = text.indexOf('.', prev); continue; }
    }
    i = text.indexOf('.', i + 1);
  }
}

// v: vfs.build result, id: mod layer id, names: iterable of lowercase entity names -> Map name -> {reach, why}
function reachability(v, id, names, memo, opt = {}) {
  const out = new Map(), lay = String(id).toLowerCase();
  const mine = rec => { const l = String(rec.layer).toLowerCase(); return l === lay || l.startsWith(lay + ' patch'); };
  if (!memo.index) {
    const modDefs = new Map(), other = new Set(), over = new Set();
    for (const [k, rec] of v.files) {
      if (!k.startsWith('resource/entity/') || !k.endsWith('.def')) continue;
      const n = nameOfKey(k);
      if (mine(rec)) { let a = modDefs.get(n); if (!a) modDefs.set(n, a = []); a.push(k); } else other.add(n);
    }
    for (const s of v.shadows) {
      if (!s.key.startsWith('resource/entity/') || !s.key.endsWith('.def') || !s.over || !s.by || s.by.deleted) continue;
      if (mine(s.by) && !mine(s.over)) over.add(nameOfKey(s.key));
    }
    memo.index = { modDefs, other, over, refs: new Map(), scanned: new Set(), incomplete: '', files: 0, fileTokens: null };
  }
  const ix = memo.index;
  const todo = new Set();
  for (const n of names) {
    if (ix.other.has(n)) out.set(n, { reach: 'REACHABLE', why: 'name is also defined on another layer (vanilla or required mod): ' + 'redefinition, vanilla may refer to it' });
    else if (ix.over.has(n)) out.set(n, { reach: 'REACHABLE', why: 'overrides a def path of a lower layer (vanilla refers to it)' });
    else if (!ix.modDefs.has(n)) out.set(n, { reach: 'UNKNOWN', why: 'no def of this name in the mounted mod layer: cannot judge' });
    else if (!DASHED.test(n)) out.set(n, { reach: 'UNKNOWN', why: 'name has characters outside [a-z0-9_-]: whole-word scan not defined for it' });
    else todo.add(n);
  }
  const fresh = [...todo].filter(n => !ix.scanned.has(n));
  const wantFiles = opt.files && !ix.fileTokens;
  if (fresh.length || wantFiles) {
    const want = new Set(fresh), own = new Map();
    for (const n of fresh) for (const k of ix.modDefs.get(n)) own.set(k, n);
    // few names: one alternation regex over the raw text (no lowercase copy); many: token loop with a Set
    // plain names keep the [a-z0-9_] word edge; dashed names (R1) also stop at '-'
    const plain = [...want].filter(n => WORD.test(n)), dashed = [...want].filter(n => !WORD.test(n));
    const alt = [plain.length ? '(?<![a-z0-9_])(?:' + plain.join('|') + ')(?![a-z0-9_])' : '', dashed.length ? '(?<![a-z0-9_-])(?:' + dashed.join('|') + ')(?![a-z0-9_-])' : ''].filter(Boolean).join('|');
    const rx = want.size && want.size <= 120 ? new RegExp(alt, 'gi') : null;
    const ft = wantFiles ? new Set() : null;
    for (const [k, rec] of v.files) {
      if (!mine(rec) || MEDIA.has(extOf(k))) continue;   // .db = thumbs.db
      if (rec.size > MAX_BYTES) { ix.incomplete = `${k} (${rec.size} bytes) too big to scan`; continue; }
      let text;
      try { text = vfs.readRec(rec).toString('latin1'); if (isInteraction(k)) text = stripSelectors(text); } catch (e) { ix.incomplete = k + ' unreadable: ' + e.message; continue; }
      ix.files++;
      const mine1 = own.get(k);
      let m;
      if (ft) fileTokens(text, t => ft.add(t));
      if (!want.size) continue;
      const hit = (w, end) => { if (w !== mine1 && !ix.refs.has(w) && !fileStem(text, end)) ix.refs.set(w, k); };
      if (rx) { rx.lastIndex = 0; while ((m = rx.exec(text)) !== null) hit(m[0].toLowerCase(), m.index + m[0].length); }
      else {
        // tokens with '-': the whole token can be a dashed name; each '-' part keeps the old [a-z0-9_] match for plain names
        const lo = text.toLowerCase(), re = /[a-z0-9_-]+/g;
        while ((m = re.exec(lo)) !== null) {
          const t = m[0], end = m.index + t.length;
          if (want.has(t)) hit(t, end);
          if (t.includes('-')) { let at = m.index; for (const p of t.split('-')) { if (p && want.has(p) && WORD.test(p)) hit(p, at + p.length); at += p.length + 1; } }
        }
      }
    }
    for (const n of fresh) ix.scanned.add(n);
    if (ft) ix.fileTokens = ft;
  }
  for (const n of todo) {
    const r = ix.refs.get(n);
    if (r) out.set(n, { reach: 'REACHABLE', why: `named in ${r}` });
    else if (ix.incomplete) out.set(n, { reach: 'UNKNOWN', why: 'no ref found but the scan is incomplete: ' + ix.incomplete });
    else out.set(n, { reach: 'ORPHAN', why: `no other layer defines it, no override, no whole-word ref in ${ix.files} mod text files; def enumeration only indexes the name, parse is lazy [I]; run-time built names unseen [T]` });
  }
  return out;
}
// every mod def + unreferenced mod meshes/models under resource/entity/. -> {defs: {key: REACHABLE|ORPHAN|UNKNOWN}, unrefFiles: [key], files, incomplete}
function reachAll(v, id, memo) {
  memo = memo || {};
  reachability(v, id, [], memo);   // builds the index
  const ix = memo.index, res = reachability(v, id, [...ix.modDefs.keys()], memo, { files: true });
  const defs = {}, stems = new Map(), lay = String(id).toLowerCase();
  for (const [n, keys] of ix.modDefs) for (const k of keys) {
    defs[k] = res.get(n).reach;
    const d = k.slice(0, k.lastIndexOf('/')); let a = stems.get(d); if (!a) stems.set(d, a = new Set()); a.add(n);
  }
  const unrefFiles = [];
  if (!ix.incomplete && ix.fileTokens) for (const [k, rec] of v.files) {
    if (!k.startsWith('resource/entity/') || !/\.(mdl|ply)$/.test(k)) continue;
    const l = String(rec.layer).toLowerCase(); if (l !== lay && !l.startsWith(lay + ' patch')) continue;
    const base = k.slice(k.lastIndexOf('/') + 1), stem = base.slice(0, -4), d = k.slice(0, k.lastIndexOf('/'));
    if (ix.fileTokens.has(base) || (stems.get(d) && stems.get(d).has(stem))) continue;
    unrefFiles.push(k);
  }
  return { defs, unrefFiles, files: ix.files, incomplete: ix.incomplete };
}
module.exports = { reachability, reachAll, stripSelectors };
