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
// map.net is left out of the scan (owner decision 2026-11-25): the engine reads from it only heights, ground and material names
// no entity name [I]; milint and binhdr still check map.net itself. On a real map it is most of the bytes
//   (88 MB for 8v8). ARSENAL_REACH_MAPNET=1 scans it again (the old way).
// Author: Imperator_Aug (ARSENAL, ia-ea147ba8)
const vfs = require('../lib/vfs'), path = require('path');

const MEDIA = new Set(['.dds', '.tga', '.png', '.jpg', '.jpeg', '.bmp', '.wav', '.ogg', '.mp3', '.ply', '.anm', '.bik', '.avi', '.mp4', '.ttf', '.otf', '.exe', '.dll', '.pak', '.pat', '.zip', '.psd', '.fnt', '.lng', '.tex', '.db']);   // .lng: localization text looked up by key, no spawn path (not a reference) [I]; .tex texture params, .db thumbs.db (R2)
const MAX_BYTES = 400 * 1024 * 1024;   // V8 string limit is ~512M chars; map.net of a real 8v8 map is 88 MB
const WORD = /^[a-z0-9_]+$/, DASHED = /^[a-z0-9_][a-z0-9_-]*$/;
// R2: the hit ending at `end` is the stem of a quoted file name ("p40.dds")
const fileStem = (text, end) => /^\.[a-z0-9_]{1,8}"/i.test(text.slice(end, end + 10));
const SKIP_MAPNET = process.env.ARSENAL_REACH_MAPNET !== '1';
const isMapNet = k => k === 'map.net' || k.endsWith('/map.net');   // vfs keys are lower case
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

// what one file's text gives the scan, for any name set (the reach cache, reachcache.js): its distinct lower-case [a-z0-9_-]+ runs,
// grouped by the ends they occur with: a = never a quoted file stem (R2), b = only a stem, c = both; f = its .mdl/.ply file tokens.
// Strings joined with \n (flat, no slice of the text kept). applyFacts gives the names the text loop or regex below would hit in it
function factsOf(text) {
  const lo = text.toLowerCase(), re = /[a-z0-9_-]+/g, tok = new Map();
  let m;
  while ((m = re.exec(lo)) !== null) {
    const t = m[0], e = m.index + t.length, f = text.charCodeAt(e) === 46 && fileStem(text, e) ? 2 : 1, o = tok.get(t) || 0;
    if ((o | f) !== o) tok.set(t, o | f);
  }
  const g = [[], [], [], []]; for (const [t, f] of tok) g[f].push(t);
  const ft = new Set(); fileTokens(text, x => ft.add(x));
  return { a: g[1].join('\n'), b: g[2].join('\n'), c: g[3].join('\n'), f: [...ft].join('\n') };
}
const factFiles = fx => (fx.f ? fx.f.split('\n') : []);
// hit(name) for each name of want the scan would find in the file. A hit is the whole run (any name) or a '-' part of it (plain
// names); a stem end stops the hit that ends where the run ends, inner parts end at a '-'. mx = {P, D}: the one regex over plain
// (P) and dashed (D) names together: at a run's start the plain branch is tried first (its first part), then the dashed one (the
// whole run, nothing after it is tried); later parts can only be plain hits. A plain-only or dashed-only regex finds what the run
// loop finds (each match is a whole [a-z0-9_] or [a-z0-9_-] run, case-blind on ASCII), so mx = null serves both
function applyFacts(fx, want, mx, hit) {
  for (const [s, ns] of [[fx.a, true], [fx.c, true], [fx.b, false]]) {
    if (!s) continue;
    for (const t of s.split('\n')) {
      if (!mx) {
        if (ns && want.has(t)) hit(t);
        if (t.indexOf('-') < 0) continue;
        const ps = t.split('-'), L = ps.length - 1;
        for (let i = 0; i <= L; i++) { const p = ps[i]; if (p && (ns || i < L) && want.has(p) && WORD.test(p)) hit(p); }
      } else {
        const ps = t.split('-'), L = ps.length - 1;
        let i = 1;
        if (ps[0] && mx.P.has(ps[0])) { if (ns || L > 0) hit(ps[0]); }
        else if (mx.D.has(t)) { if (ns) hit(t); i = L + 1; }
        for (; i <= L; i++) if (ps[i] && (ns || i < L) && mx.P.has(ps[i])) hit(ps[i]);
      }
    }
  }
}

// v: vfs.build result, id: mod layer id, names: iterable of lowercase entity names -> Map name -> {reach, why}
// The scan of the mod's text is one generator (core): it yields {k, rec} for each file it reads and takes back {buf} or {err}
// (what vfs.readRec gave or threw). reachability drives it with vfs.readRec, one file after the other, as before; reachabilityAsync
// with the loose files read ahead through the thread pool (lib/sdlset readAhead) and the loop given a turn while it waits (wouldload
// runs it beside its sdllint and refcheck children, whose pipes it must keep reading): the same files in the same order, so the same
// answers. memo.cache (reachcache.open, wouldload): each file's facts (factsOf) by its signature; a file with known facts is not
// read, the others are read and their facts stored. The same names hit in the same files, so the same answers.
function* core(v, id, names, memo, opt) {
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
    memo.index = { modDefs, other, over, refs: new Map(), scanned: new Set(), incomplete: '', files: 0, fileTokens: null, exact: true };
  }
  const ix = memo.index;
  const todo = todoOf(ix, names, out);
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
    // the regex with plain AND dashed names can let one branch's match hide the other's (a-b: "a" taken, "a-b" never tried);
    // the token loop and a one-kind regex find each name alone. exact = every scan of this memo found each name alone (sameScan)
    if (rx && plain.length && dashed.length) ix.exact = false;
    const ft = wantFiles ? new Set() : null;
    const list = [];
    for (const [k, rec] of v.files) if (mine(rec) && !MEDIA.has(extOf(k)) && !(SKIP_MAPNET && isMapNet(k))) list.push([k, rec]);   // .db = thumbs.db
    // memo.cache (reachcache.js): what a file gives is taken from the cache when its signature is known; only the rest is read
    const C = memo.cache, ckey = new Map(), had = new Map();
    if (C) for (const [k, rec] of list) {
      if (rec.size > MAX_BYTES) continue;
      const c = C.key(k, rec); if (!c) continue;
      ckey.set(k, c); const f = C.get(c); if (f) had.set(k, f);
    }
    const mixed = !!(rx && plain.length && dashed.length), P = new Set(plain), D = new Set(dashed);
    yield { plan: list.filter(x => x[1].size <= MAX_BYTES && !had.has(x[0])).map(x => x[0]) };
    for (const [k, rec] of list) {
      if (rec.size > MAX_BYTES) { ix.incomplete = `${k} (${rec.size} bytes) too big to scan`; continue; }
      let text, fx = had.get(k);
      if (!fx) {
        const got = yield { k, rec };
        try { if (got.err) throw got.err; text = got.buf.toString('latin1'); if (isInteraction(k)) text = stripSelectors(text); } catch (e) { ix.incomplete = k + ' unreadable: ' + e.message; continue; }
        if (C) { fx = factsOf(text); text = null; if (ckey.has(k)) C.put(ckey.get(k), fx); }
      }
      ix.files++;
      const mine1 = own.get(k);
      let m;
      if (fx) {
        if (ft) for (const t of factFiles(fx)) ft.add(t);
        if (want.size) applyFacts(fx, want, mixed ? { P, D } : null, w => { if (w !== mine1 && !ix.refs.has(w)) ix.refs.set(w, k); });
        continue;
      }
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
// the names the text scan judges (the rest get their answer in out here): on another layer, an override, no mod def, odd characters
function todoOf(ix, names, out) {
  const todo = new Set();
  for (const n of names) {
    if (ix.other.has(n)) out.set(n, { reach: 'REACHABLE', why: 'name is also defined on another layer (vanilla or required mod): ' + 'redefinition, vanilla may refer to it' });
    else if (ix.over.has(n)) out.set(n, { reach: 'REACHABLE', why: 'overrides a def path of a lower layer (vanilla refers to it)' });
    else if (!ix.modDefs.has(n)) out.set(n, { reach: 'UNKNOWN', why: 'no def of this name in the mounted mod layer: cannot judge' });
    else if (!DASHED.test(n)) out.set(n, { reach: 'UNKNOWN', why: 'name has characters outside [a-z0-9_-]: whole-word scan not defined for it' });
    else todo.add(n);
  }
  return todo;
}
const readOf = rec => { try { return { buf: vfs.readRec(rec) }; } catch (err) { return { err }; } };
function reachability(v, id, names, memo, opt = {}) {
  const g = core(v, id, names, memo, opt);
  let r = g.next();
  while (!r.done) r = g.next(r.value.plan ? undefined : readOf(r.value.rec));
  return r.value;
}
// the same answer as reachability; loose files read ahead (o.window at a time, default 32; o.maxBytes held, default 128 MB), the loop
// gets a turn at least every 20 ms. A file the read-ahead does not hold (failed, not started) is read by vfs.readRec as before
async function reachabilityAsync(v, id, names, memo, opt = {}, o = {}) {
  const g = core(v, id, names, memo, opt);
  let r = g.next(), ra = null, t = Date.now();
  try {
    while (!r.done) {
      const q = r.value;
      if (q.plan) {
        ra = require('../lib/sdlset').readAhead({ window: o.window || 32, maxBytes: o.maxBytes || 128 * 1024 * 1024 });
        for (const k of q.plan) { const rec = v.files.get(k); if (rec && rec.source === 'loose') ra.add(k, path.join(rec.container, rec.entry)); }
        r = g.next(); continue;
      }
      let got;
      if (ra && q.rec.source === 'loose') {
        const w = ra.wait(q.k); if (w) { await w; t = Date.now(); }
        const b = ra.take(q.k); ra.drop(q.k);
        got = b !== undefined ? { buf: b } : readOf(q.rec);
      } else got = readOf(q.rec);
      if (Date.now() - t > 20) { await new Promise(res => setImmediate(res)); t = Date.now(); }
      r = g.next(got);
    }
  } finally { if (ra) ra.close(); }
  return r.value;
}
// can reachability(v, id, names, memo) take the answers memo holds already (a reachAll scan of this view), with the same result as
// a scan of its own (a fresh memo)? Yes when memo scanned every name of names that the text scan judges, each of its scans found
// each name alone (ix.exact), and a scan of its own would too (not the regex over plain and dashed names together). The same files
// in the same order give the same first file per name, the same file count and the same incomplete note.
function sameScan(memo, names) {
  const ix = memo && memo.index;
  if (!ix || ix.exact === false) return false;
  const todo = todoOf(ix, names, new Map());
  if ([...todo].some(n => !ix.scanned.has(n))) return false;
  const plain = [...todo].filter(n => WORD.test(n)).length;
  return !(todo.size && todo.size <= 120 && plain && plain < todo.size);
}
// every mod def + unreferenced mod meshes/models under resource/entity/. -> {defs: {key: REACHABLE|ORPHAN|UNKNOWN}, unrefFiles: [key], files, incomplete}
function reachAll(v, id, memo) {
  memo = memo || {};
  reachability(v, id, [], memo);   // builds the index
  return allOf(v, id, memo, reachability(v, id, [...memo.index.modDefs.keys()], memo, { files: true }));
}
// the same as reachAll, read as reachabilityAsync reads
async function reachAllAsync(v, id, memo, o) {
  memo = memo || {};
  await reachabilityAsync(v, id, [], memo, {}, o);
  return allOf(v, id, memo, await reachabilityAsync(v, id, [...memo.index.modDefs.keys()], memo, { files: true }, o));
}
function allOf(v, id, memo, res) {
  const ix = memo.index;
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
module.exports = { reachability, reachabilityAsync, reachAll, reachAllAsync, sameScan, stripSelectors, factsOf, applyFacts };
