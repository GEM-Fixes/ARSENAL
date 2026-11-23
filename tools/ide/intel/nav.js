// ide intel nav: hover, go to definition, find usages, outline and autocomplete words for the editor (contract: tools/ide/README.md).
//   hover(doc, pos, ictx) -> null | { line, col, len, what, title, lead:{k,p}, rows:[{k, v}], links:[{text|k, link}] }
//   def(doc, pos, ictx) -> [{ link, label, line? }]      refs(doc, pos|{name}, ictx) -> { name, kind, hits, truncated, why }
//   symbols(doc) -> [{ name, line, endLine, depth }]     words(kind, ictx) -> [{ w, hint? }]     wordAt(text, pos) -> {word,line,col,len,quoted}|null
//   refsAsync(doc, pos|{name}, ictx, {signal?, budgetMs?}) -> Promise<refs shape> (sliced, 8 s; routes use this; refs() stops at 400 ms)
//   touch(ictx, rel) -> mark the entity index + own game view stale after a save   warm(ictx) -> start the index load in the background
//     touch marks the copies of every game on ictx.gameDir (ictx.exe may be given and changes nothing: a mod in the shared AS2
//     install is in the AS64 and the MoW:AS2 view alike; the GoH install has its own gameDir, so its copies are its own)
//   classify(text, pos) -> context of the token under pos (exported for tests)   _ready(ictx, ms) -> Promise (entity index loaded, tests)
// doc = { key, text, file? }  pos = { line, col } 1-based  ictx = { gameDir, mods, folder, vfs? } (all optional; vfs = lazy getter
//   for the layered view the GUI already built; used before our own copy). ictx.exe or ictx.game ('as64'|'mowas2'|'mowas_2'|'goh',
//   intel/game.js) names the game: our own view and the entity index are that game's (vfs / entityindex exe, one cache per game;
//   AS64 and no game named keep their keys, names and child arguments), and under GoH (named, or a GoH install as gameDir) the
//   key facts come from keylint/vocab.goh.json, the engine field row is left out (fields.json is the as64 engine) and the
//   linked rows are gohweb GH rows (gohkeys.json) instead of limits rows.
// Sources: keylint/vocab.json (keys per file kind), fieldtypes/fields.json (engine reader types; no ranges exist there),
//   limits rows that name a key as `{key` or `key` [I] (intel/limkeys.json, built by limkeys.js; live scan only without the json),
//   lib/vfs (which layer wins), entityindex (names, users).
// Entity index: loaded from tools/entityindex/cache/<vanilla|mods-hash>.json when it belongs to this game, else from our own
//   cache under lib/toolcache dir('ide')/entityindex (per user, platform.cacheDir()); a background `entityindex.js --cache <tmp>` refresh (spawn, shell:false) keeps it fresh.
//   Until something is loaded, entity hovers carry an ide.h.ixLoading row. A failed build retries after 30 s, 2 min, 10 min.
//   Never writes into the game folder. Never throws to the caller.
// Author: Imperator_Aug (ARSENAL, ia-748cbdbc)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const sdl = require('../../lib/sdl'), sdlx = require('../../lib/sdlx'), vfsLib = require('../../lib/vfs');
const GAME = require('./game');

const TOOLS = path.join(__dirname, '..', '..'), ROOT = path.join(TOOLS, '..');
const lc = s => String(s == null ? '' : s).toLowerCase();
const fwd = s => String(s).replace(/\\/g, '/');
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const safe = (fn, dflt) => function () { try { return fn.apply(null, arguments); } catch (e) { if (process.env.IDE_NAV_DEBUG) console.error(e); return typeof dflt === 'function' ? dflt() : dflt; } };
const esc = s => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

// ---------------------------------------------------------------- text, tokens, word under cursor
let _lex = { text: null, lines: null, toks: null };
function lex(text) {
  if (_lex.text === text) return _lex;
  const lines = String(text).split('\n');
  _lex = { text, lines, toks: sdl.tokenize(lines) };
  return _lex;
}
// raw extent of a token on its line: [start0, end0) and the word part
function spanOf(tok, L) {
  const s = tok.col - 1;
  if (tok.t === 's') {
    let j = s + 1;
    while (j < L.length && L[j] !== '"') j += L[j] === '\\' && j + 1 < L.length ? 2 : 1;
    return { s, e: Math.min(L.length, j + 1), ws: s + 1, we: Math.min(j, L.length) };
  }
  if (tok.t === 'w') {
    let ws = s, we = s + tok.v.length;
    while (ws < we && L[ws] === '(') ws++;
    while (we > ws && L[we - 1] === ')') we--;
    return { s, e: s + tok.v.length, ws, we };
  }
  return { s, e: s + 1, ws: s, we: s + 1 };
}
// index of the token under pos in toks (cursor on the char, or right after the word when nothing else is there)
function tokAt(toks, lines, pos) {
  const L = lines[pos.line - 1]; if (L === undefined) return -1;
  const c = pos.col - 1;
  let after = -1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]; if (t.line < pos.line) continue; if (t.line > pos.line) break;
    if (t.t === '{' || t.t === '}') continue;
    const sp = spanOf(t, L);
    if (c >= sp.s && c < sp.e) return i;
    if (c === sp.e) after = i;
  }
  return after;
}
function wordOf(tok, L, line) {
  const sp = spanOf(tok, L);
  if (tok.t === 'w' && sp.we <= sp.ws) return null;
  return { word: L.slice(sp.ws, sp.we), line, col: sp.ws + 1, len: sp.we - sp.ws, quoted: tok.t === 's' };
}
function wordAt(text, pos) {
  if (!pos || !(pos.line >= 1) || !(pos.col >= 1)) return null;
  const lines = String(text).split('\n'), L = lines[pos.line - 1];
  if (L === undefined) return null;
  const toks = sdl.tokenize([L]).map(t => Object.assign(t, { line: pos.line }));
  const i = tokAt(toks, lines, pos);
  return i < 0 ? null : wordOf(toks[i], L, pos.line);
}

// ---------------------------------------------------------------- context classifier
const NUM = /^[-+]?(0x[0-9a-f]+|\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
const PATHY = /[\/\\]|\.(def|ext|inc|mdl|mtl|ply|vol|anm|dds|tga|ebm|bmp|tex|set|mi|lng|lua|ogg|wav|ammo|weapon|fx|ps|tpl|font|ctm|info|mod|grenade|mine|fsm|pattern|presets|ani|anm)$/i;
const PATH_KEYS = new Set(['extension', 'model', 'diffuse', 'diffuse1', 'bump', 'specular', 'mask', 'envmap', 'texture', 'ply', 'vol', 'anm', 'mesh', 'file', 'include', 'icon', 'picture', 'image', 'sprite', 'map', 'sound', 'animation']);
const TEX_KEYS = new Set(['diffuse', 'diffuse1', 'bump', 'specular', 'mask', 'envmap', 'texture']);
const MESH_KEYS = new Set(['ply', 'vol', 'anm', 'mesh']);
const STUFF_KEYS = new Set(['item', 'weapon', 'ammo', 'from', 'stuff', 'items']);
const fold = t => !t ? '*a' : t.t === 's' ? '*s' : NUM.test(t.v) ? '#n' : lc(t.v);

// -> { w, role, tok, owner (block-name token), path:[folded ancestors of owner block], depth, tag?, target?, lngPath? }
// role: key | value | include | define | macro | param | mod | tag | lng
function classify(text, pos) {
  const X = lex(text), toks = X.toks, lines = X.lines;
  const i = tokAt(toks, lines, pos);
  if (i < 0) return null;
  const tok = toks[i], w = wordOf(tok, lines[tok.line - 1], tok.line);
  if (!w) return null;
  // block stack up to tok
  const stack = [{ name: null, open: null, tag: '' }];
  let wantName = false, tagNext = null;
  for (let j = 0; j <= i; j++) {
    const t = toks[j];
    if (t.t === '{') {
      const b = { name: null, open: t, tag: '' };
      const n = toks[j + 1];
      if (n && n.t === 'w' && n.line === t.line && n.col === t.col + 1 && n.v[0] === '#') { b.tagTok = n; b.tag = n.v.slice(1); tagNext = n; }
      stack.push(b); wantName = true; continue;
    }
    if (t.t === '}') { if (stack.length > 1) stack.pop(); wantName = false; continue; }
    if (t === tagNext) { tagNext = null; continue; }
    if (wantName) { stack[stack.length - 1].name = t; wantName = false; }
  }
  const top = stack[stack.length - 1];
  const r = { w, tok, depth: stack.length - 1, role: 'value', owner: null, path: [] };
  const names = stack.slice(1).map(b => b.name);
  if (top.tagTok === tok) {
    r.role = 'tag'; r.tag = top.tag;
    r.owner = top.name || null;
    return r;
  }
  if (top.name === tok) { r.role = 'key'; r.owner = tok; r.path = names.slice(0, -1).map(fold); }
  else { r.owner = top.name; r.path = names.slice(0, -1).map(fold); }
  r.names = names;
  const prev = toks[i - 1], prev2 = toks[i - 2], next = toks[i + 1];
  const pv = prev && prev.t === 'w' ? lc(prev.v) : null;
  if (tok.t === 'w') {
    const v = lc(tok.v);
    if (v === '(include' && next && next.t === 's') { r.role = 'include'; r.target = next.v; return r; }
    if (v === '(define' && next && next.t === 's') { r.role = 'define'; r.target = next.v; r.defining = true; return r; }
    if (v === '(mod' && next) { r.role = 'mod'; const nn = next.t === 'w' && lc(next.v) === 'not' ? toks[i + 2] : next; r.target = nn ? nn.v : ''; r.not = nn !== next; return r; }
    if (v[0] === '%' || /^\(?%/.test(v)) { r.role = 'param'; r.target = w.word; return r; }
  }
  if (tok.t === 's') {
    if (pv === '(include') { r.role = 'include'; r.target = tok.v; return r; }
    if (pv === '(define') { r.role = 'define'; r.target = tok.v; r.defining = true; return r; }
    if (pv === '(mod' || (pv === 'not' && prev2 && prev2.t === 'w' && lc(prev2.v) === '(mod')) { r.role = 'mod'; r.target = tok.v; r.not = pv === 'not'; return r; }
    if (prev && prev.t === 'w' && prev.v === '(' && prev.line === tok.line && prev.col + 1 === tok.col) { r.role = 'macro'; r.target = tok.v; return r; }
  }
  return r;
}
// lng: full localization key of the entry under the cursor (file title + nested names), or null
function lngKeyOf(docKey, names) {
  const strs = names.slice(1);   // names[0] = tags root
  if (!names.length || names.some(n => !n)) return null;
  let rel = lc(docKey || '');
  const m = /(?:^|\/)(?:resource\/interface\/text|localization)\/(.*)\.lng$/.exec(rel) || /([^\/]*)\.lng$/.exec(rel);
  const parts = m ? m[1].split('/') : [];
  if (parts.length && parts[parts.length - 1][0] === '#') parts.pop();
  return parts.concat(strs.map(t => t.v)).join('/');
}

// ---------------------------------------------------------------- vocab, engine fields, limits
// gk = 'goh' | 'as2' (gkOf(c)): GoH reads keylint/vocab.goh.json (learned from the GoH install, as keylint does for a GoH game
// dir) when it is there, has no AS2 engine field table (fieldtypes/fields.json is the as64 engine: not shown) and shows gohweb
// rows (intel/gohkeys.json, limkeys.js --goh) instead of the as64 limits rows. gk 'mowas2' (MoW:AS2 named) reads
// keylint/vocab.mowas2.json (learn.js --exe mowas_2: the MoW:AS2 mount, no as64/core) when it is there, as keylint does for
// --exe mowas_2; else vocab.json. MoW:AS2 shares the AS2 engine fields and limits rows with AS64.
let _fields, _lim;
const _vocab = new Map(), _keyIdx = new Map();
const gkOf = c => (c && c.G && c.G.kind === 'goh' ? 'goh' : c && c.G && c.G.id === 'mowas2' ? 'mowas2' : 'as2');
const gkNorm = gk => (gk === 'goh' || gk === 'mowas2' ? gk : 'as2');
const VOCAB_OF = { goh: 'vocab.goh.json', mowas2: 'vocab.mowas2.json' };
// the vocab file a gk reads (exported for tests): its own file when present, else vocab.json
function vocabFile(gk) {
  const own = VOCAB_OF[gkNorm(gk)] && path.join(TOOLS, 'keylint', VOCAB_OF[gkNorm(gk)]);
  return own && isFile(own) ? own : path.join(TOOLS, 'keylint', 'vocab.json');
}
function vocab(gk) {
  gk = gkNorm(gk);
  if (!_vocab.has(gk)) _vocab.set(gk, JSON.parse(fs.readFileSync(vocabFile(gk), 'utf8')));
  return _vocab.get(gk);
}
const fields = () => { if (_fields === undefined) { try { _fields = JSON.parse(fs.readFileSync(path.join(TOOLS, 'fieldtypes', 'fields.json'), 'utf8')).keys || {}; } catch (e) { _fields = {}; } } return _fields; };
function keyIdx(gk) {
  gk = gkNorm(gk);
  if (_keyIdx.has(gk)) return _keyIdx.get(gk);
  const m = new Map();
  for (const [kind, ps] of Object.entries(vocab(gk).kinds || {})) for (const [p, e] of Object.entries(ps)) for (const [k, ks] of Object.entries(e.k || {})) {
    let a = m.get(k); if (!a) m.set(k, a = []); a.push({ kind, path: p, ks });
  }
  _keyIdx.set(gk, m);
  return m;
}
let _model;
const model = () => _model || (_model = require('../../keylint/model'));
function kindOfDoc(doc) {
  const k = doc && (doc.key || (doc.file ? 'resource/x/' + path.basename(fwd(doc.file)) : ''));
  if (!k) return null;
  try { return model().kindOf(lc(fwd(k))); } catch (e) { return null; }
}
const extOf = s => { const b = lc(s).split('/').pop(), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1); };
const SIG = { I: 'int', F: 'float', X: 'float', S: 'string', T: 'ident', P: '%param' };
function sigText(sg) {
  if (sg === '') return 'block';
  const plus = sg.endsWith('+');
  return sg.replace(/\+$/, '').split('').map(c => SIG[c] || '?').join(' ') + (plus ? ' ...' : '');
}
const topOf = m => Object.entries(m || {}).sort((a, b) => b[1] - a[1]);
function sigsOf(ks) {
  const t = topOf(ks.s), n = t.reduce((a, x) => a + x[1], 0) || 1;
  return t.slice(0, 3).map(([sg, c]) => sigText(sg) + (t.length > 1 ? ' (' + Math.round(100 * c / n) + '%)' : '')).join(', ');
}
// vocab facts for a key in this file kind at this path
function keyFacts(key, kind, pathArr, gk) {
  const k = lc(key), all = keyIdx(gk).get(k) || [];
  if (!all.length) return { all };
  const p = (pathArr || []).join('/');
  const exact = all.find(a => a.kind === kind && a.path === p);
  const sameKind = all.filter(a => a.kind === kind).sort((a, b) => b.ks.n - a.ks.n);
  const best = exact || sameKind[0] || all.slice().sort((a, b) => b.ks.n - a.ks.n)[0];
  const byKind = new Map();
  for (const a of all) byKind.set(a.kind, (byKind.get(a.kind) || 0) + a.ks.n);
  const kinds = [...byKind].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const uses = sameKind.reduce((s, a) => s + a.ks.n, 0);
  return { all, exact, best, kinds, uses, total: [...byKind.values()].reduce((a, b) => a + b, 0), inKind: sameKind.length > 0 };
}
function engineTypes(key, gk) { if (gk === 'goh') return null; const f = fields()[lc(key)]; return f && f.types && f.types.length ? f.types.slice(0, 4).join(', ') : null; }
// limits rows naming a key [I]. limkeys.json (built by limkeys.js, required so the exe embeds it) first; the live scan of
// ../limits only when the json is missing (the exe has no limits folder). mode 'json'|'scan' forces one source (tests).
// gk 'goh': gohweb rows (GH<AREA>-NN) from gohkeys.json (limkeys.js --goh), else the live scan ../; GHKEY rows first.
let _limScan, _goh, _gohScan;
function limJson() {
  if (_lim === undefined) { try { const j = require('./limkeys.json'); _lim = j && j.keys && typeof j.keys === 'object' ? j.keys : null; } catch (e) { _lim = null; } }
  return _lim;
}
function limScan() { if (!_limScan) { try { _limScan = require('./limkeys').scan(); } catch (e) { _limScan = {}; } } return _limScan; }
function gohJson() {
  if (_goh === undefined) { try { const j = require('./gohkeys.json'); _goh = j && j.keys && typeof j.keys === 'object' ? j.keys : null; } catch (e) { _goh = null; } }
  return _goh;
}
function gohScan() { if (!_gohScan) { try { const L = require('./limkeys'); _gohScan = L.scan(L.GOH); } catch (e) { _gohScan = {}; } } return _gohScan; }
function limRows(key, mode, gk) {
  if (!key || key.length < 3 || /[^A-Za-z0-9_]/.test(key)) return [];
  const goh = gk === 'goh';
  const src = goh ? (mode === 'scan' ? gohScan() : mode === 'json' ? gohJson() || {} : gohJson() || gohScan())
    : mode === 'scan' ? limScan() : mode === 'json' ? limJson() || {} : limJson() || limScan();
  const ids = Object.prototype.hasOwnProperty.call(src, lc(key)) ? src[lc(key)] : null;
  if (!Array.isArray(ids)) return [];
  const out = ids.slice(), first = goh ? /^GHKEY-/ : /^KEY-/;
  out.sort((a, b) => (first.test(b) ? 1 : 0) - (first.test(a) ? 1 : 0));
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- game index (vfs) + where a key lives
const _vfs = new Map();
// G = the request's game (intel/game.js: ictx.exe / ictx.game, else a GoH folder by its exe file); kp = its part of every cache key
// ('' for AS64 and for no game named, so AS64 keys stay as they were)
function ctxOf(ictx) {
  ictx = ictx || {};
  const g = ictx.gameDir && isDir(ictx.gameDir) ? path.resolve(ictx.gameDir) : null;
  const mods = Array.isArray(ictx.mods) ? ictx.mods.map(String) : [];
  const folder = ictx.folder && isDir(ictx.folder) ? path.resolve(ictx.folder) : null;
  let myId = null;
  if (g && folder) { const rel = fwd(path.relative(g, folder)).split('/'); if (rel.length === 2 && lc(rel[0]) === 'mods') myId = lc(rel[1]); }
  const G = GAME.gameOf(ictx);
  return { g, mods, folder, myId, ictx, G, kp: GAME.keyPart(G) };
}
// layered game view: ictx.vfs first (routes put a lazy getter there: the view files/lib vfsFor already built, .files Map),
// else our own copy. Ours is built synchronously once; after that a stale copy (60 s, or touch()) keeps serving while a
// rebuild runs off the request path (setTimeout; vfs build itself is synchronous, so it still costs the thread ~0.5 s once).
const VFS_TTL = 60000;
const asView = x => x && x.files instanceof Map && typeof x.chain === 'function' ? x : x && x.v && x.v.files instanceof Map ? x.v : null;
function vfsOf(c) {
  if (c._v !== undefined) return c._v;
  let v = null;
  if (c.ictx && typeof c.ictx === 'object' && 'vfs' in c.ictx) { try { v = asView(c.ictx.vfs); } catch (e) { v = null; } }
  if (!v) v = ownVfs(c);
  c._v = v;
  return v;
}
function vfsBuild(c) { try { return vfsLib.build(Object.assign({ gameDir: c.g, mods: c.mods, disableVersionControl: true }, c.G && c.G.exe ? { exe: c.G.exe } : {})); } catch (x) { return null; } }
function ownVfs(c) {
  if (!c.g) return null;
  const id = lc(c.g) + '|' + c.mods.join(',') + c.kp;
  let e = _vfs.get(id);
  if (!e) {
    e = { t: Date.now(), v: vfsBuild(c), stale: false, pending: false, c: { g: c.g, mods: c.mods.slice(), G: c.G } };
    _vfs.set(id, e);
    if (_vfs.size > 4) _vfs.delete(_vfs.keys().next().value);
  } else if ((e.stale || Date.now() - e.t > (e.v ? VFS_TTL : 30000)) && !e.pending) {
    e.pending = true;
    const tm = setTimeout(() => {
      const v = vfsBuild(e.c);
      if (v) e.v = v;
      e.t = Date.now(); e.stale = false; e.pending = false;
    }, 20);
    if (tm.unref) tm.unref();
  }
  return e.v;
}
// mod-folder rel paths a virtual key can live at
function relCands(key) {
  const k = lc(key), out = [k];
  if (k.startsWith('resource/interface/text/')) out.push('localization/' + k.slice(24));
  return out;
}
function whereOf(rec, c, v) {
  if (!rec) return null;
  const m = lc(String(rec.layer).replace(/ patch \d+$/, ''));
  if (c.myId && m === c.myId) return 'mine';
  return v && v.mods.map(lc).includes(m) ? 'othermod' : 'vanilla';
}
// -> { key, found, where, layer, size, layers, rel? }
function locate(key, c) {
  key = lc(fwd(key));
  const out = { key, found: false, where: null, layer: null, size: 0, layers: 0 };
  if (c.folder) for (const r of relCands(key)) {
    const f = path.join(c.folder, ...r.split('/'));
    if (isFile(f)) { out.found = true; out.where = 'mine'; out.layer = 'this mod'; out.rel = r; out.size = fs.statSync(f).size; out.file = f; break; }
  }
  const v = vfsOf(c);
  if (v) {
    const ch = v.chain(key).filter(x => !x.deleted);
    out.layers = ch.length + (out.found && !ch.some(x => whereOf(x, c, v) === 'mine') ? 1 : 0);
    const win = v.files.get(key);
    if (win && !out.found) { out.found = true; out.where = whereOf(win, c, v); out.layer = win.layer; out.size = win.size || 0; out.rec = win; }
  }
  return out;
}
function hasKey(c) { const v = vfsOf(c); return k => { k = lc(k); if (v && v.files.has(k)) return true; if (c.folder) for (const r of relCands(k)) if (isFile(path.join(c.folder, ...r.split('/')))) return true; return false; }; }
function readKey(key, c) {
  const l = locate(key, c);
  try {
    if (l.file) return fs.readFileSync(l.file);
    if (l.rec) return vfsLib.readRec(l.rec);
  } catch (e) { /* none */ }
  return null;
}
function decode(buf) {
  if (!buf) return null;
  let b = buf; if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.slice(3);
  const e = require('../../lib/enc');
  return e.isUtf8(b) ? b.toString('utf8') : e.decodeCp1251(b);
}
function linkFor(key, line, c) {
  const l = c ? locate(key, c) : { key };
  const tail = line ? ':' + line : '';
  if (l.rel) return 'ide:' + l.rel + tail;
  return 'key:' + lc(key) + tail;
}
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
// candidate keys a string value can mean, best first
function pathCands(value, owner, docKey) {
  const l = lc(fwd(value)).trim(), dk = lc(docKey || 'resource/x');
  const out = [];
  const add = x => { x = path.posix.normalize(x); if (!out.includes(x)) out.push(x); };
  if (owner === 'include') { add(sdlx.resolveInclude(value, dk).key); return out; }
  if (TEX_KEYS.has(owner)) {
    const base = l.startsWith('$/') ? 'resource/texture/common/' + l.slice(2) : l.startsWith('/') ? 'resource/' + l.slice(1) : dirOf(dk) + l;
    for (const x of ['', '.dds', '.tga', '.ebm', '.bmp', '.tex']) add(base + x);
    return out;
  }
  if (MESH_KEYS.has(owner)) { add(dirOf(dk) + l); return out; }
  if (owner === 'extension' || owner === 'model') {
    add(dirOf(dk) + l); add('resource/entity/' + l); add('resource/' + l.replace(/^\//, ''));
    return out;
  }
  if (l.startsWith('/')) add('resource/' + l.slice(1));
  else { add(dirOf(dk) + l); add('resource/' + l); }
  if (!extOf(l)) for (const x of ['.dds', '.tga']) add(out[0] + x);
  return out;
}
function resolvePath(value, owner, doc, c) {
  if (sdlx.resolveInclude(value, 'resource/x').kind !== 'virtual' && owner === 'include') return { key: null, found: false, special: true };
  const cands = pathCands(value, owner, doc && doc.key), has = hasKey(c);
  const hit = cands.find(has);
  return hit ? locate(hit, c) : { key: cands[0], found: false, cands };
}

// ---------------------------------------------------------------- entity index (lazy, background refresh)
const IX = new Map();
let ixLib;
const ixMod = () => ixLib || (ixLib = require('../../entityindex/index'));
// our own index copies live in the per-user cache (lib/toolcache: <platform.cacheDir()>/ide/entityindex, ARSENAL_CACHE overrides)
let toolcache;
const tc = () => toolcache || (toolcache = require('../../lib/toolcache'));
const ixTmp = () => path.join(tc().dir('ide'), 'entityindex');
// the entityindex tool's own cache file (per user; an old tools/entityindex/cache copy is taken over once by toolcache)
const ixDefault = name => tc().file('entityindex', name, path.join(TOOLS, 'entityindex', 'cache'));
const md5 = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
function ixMetaOk(file, c) {
  try {
    const fd = fs.openSync(file, 'r'), b = Buffer.alloc(600); const n = fs.readSync(fd, b, 0, 600, 0); fs.closeSync(fd);
    const m = /"meta":(\{[^}]*\})/.exec(b.slice(0, n).toString('utf8')); if (!m) return false;
    const meta = JSON.parse(m[1]);
    // a named game: the cache must be that game's view (meta.exe; caches from before meta.exe have none and pass as before)
    if (c.G && c.G.exe && meta.exe && meta.exe !== c.G.exe) return false;
    return meta.version === ixMod().VERSION && meta.game && lc(path.resolve(meta.game)) === lc(c.g) && !meta.folder &&
      (meta.mods || []).map(lc).join(',') === c.mods.map(x => lc(x.split(':')[0])).join(',');
  } catch (e) { return false; }
}
// the exe the index child and the cache file names get: only a named game other than AS64 (AS64 arguments and names as before)
const ixExe = c => (c.G && c.G.exe && c.G.exe !== 'as64' ? c.G.exe : undefined);
// load a cache by its base name: entityindex load(base, exe, gameDir) finds the same file cachePath gives and checks it is that
// game's (load re-applies cachePath, so it is given the base, never an already-named file)
const ixLoad = (base, c) => ixMod().load(base, ixExe(c), c.g);
// ---- CACHE (gui README, contract 1): what our index copy was built from, as stamps instead of an age.
// ictx.shared = { cache, modtree, gameview } of the GUI server (ext/ide/routes ictxOf); without it (the CLI, a test) the modules.
// The copy has a sidecar <copy>.sig = { release, sig }: release = lib/credit version() of the ARSENAL that built it (a copy of
// another release, or with no sidecar, is never read: it is built again), sig = ixSig at the start of that build.
// ixSig = the game stamp (lib/gameview) + per active mod the signatures of the areas the index reads (lib/modtree entity, set, pak:
// the mod's folder is <game>/mods/<id>). A mod with no such folder (a GoH Workshop item) has no stamp: only then is the copy also
// built again by age (IX_TTL), as before. The walks are asked again in the background at most every IX_WATCH ms while the index
// is in use, so a change made outside the GUI is seen; a save through the GUI marks the index stale at once (touch).
let _rel;
const release = () => (_rel === undefined ? (_rel = (() => { try { return String(require('../../lib/credit').version()); } catch (e) { return ''; } })()) : _rel);
const sharedOf = c => (c && c.ictx && c.ictx.shared) || {};
const mtOf = c => sharedOf(c).modtree || require('../../lib/modtree');
const gvOf = c => sharedOf(c).gameview || require('../../lib/gameview');
const IX_AREAS = ['entity', 'set', 'pak'], IX_WATCH = 60000;
// the folders of the active mods: [{ id, dir | null }] ('as64+' is the game's own mode, part of the game stamp)
function ixModDirs(c) {
  const out = [];
  for (const m of c.mods) {
    const id = lc(String(m).split(':')[0]);
    if (!id || id === 'as64+') continue;
    const d = path.join(c.g, 'mods', id);
    out.push({ id, dir: isDir(d) ? d : null });
  }
  return out;
}
// -> { sig: '<game>|<mods>', open: a mod has no stamp }
function ixSig(c) {
  let g = ''; try { g = gvOf(c).stamp({ gameDir: c.g, exe: ixExe(c) }) || ''; } catch (e) { g = ''; }
  const parts = []; let open = false;
  for (const m of ixModDirs(c)) {
    if (!m.dir) { open = true; parts.push(m.id + '=-'); continue; }
    let T = null; try { T = mtOf(c).last(m.dir); } catch (e) { T = null; }
    if (!T) open = true;   // no walk known yet: by age until one is
    parts.push(m.id + '=' + (T ? IX_AREAS.map(a => T.areas[a]).join('.') : '?'));
  }
  return { sig: g + '|' + parts.join(','), open };
}
function ixSigNow(s, c) {
  const now = Date.now();
  if (!s.sigNow || now - s.sigAt > 2000) { s.sigNow = ixSig(c); s.sigAt = now; }
  return s.sigNow;
}
// ask the walks of the active mods again (async, shared with every page); the next ixGet sees a moved signature
function ixWatch(s, c, maxAgeMs) {
  const now = Date.now();
  if (s.watchAt && now - s.watchAt < IX_WATCH) return Promise.resolve();
  s.watchAt = now;
  const ps = [];
  for (const m of ixModDirs(c)) if (m.dir) { try { ps.push(mtOf(c).ensure(m.dir, { maxAgeMs: maxAgeMs === undefined ? IX_WATCH : maxAgeMs }).catch(() => null)); } catch (e) { /* no walk: the old signature stays */ } }
  return Promise.all(ps).then(() => { s.sigNow = null; });
}
const sideOf = f => { try { const o = JSON.parse(fs.readFileSync(f + '.sig', 'utf8')); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
function sideWrite(f, sig) { try { const t = f + '.sig.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify({ release: release(), sig })); fs.renameSync(t, f + '.sig'); } catch (e) { /* the copy is then built again next start */ } }
// tmpBase = the --cache the child is given; tmp = the file it writes for that exe and game folder (entityindex
// cachePath(base, exe, gameDir): <base>.<exe>.json, a GoH folder with no exe named keyed goh, and in the shared entityindex
// folder .f<hex> for a game folder that is not the installed game), so we read the very file the child writes
function ixPaths(c) {
  const id = lc(c.g) + '|' + c.mods.join(',') + c.kp, tmpBase = path.join(ixTmp(), 'ix-' + md5(id) + '.json');
  return { id, tmpBase, tmp: ixMod().cachePath(tmpBase, ixExe(c), c.g) };
}
function ixState(c) {
  if (!c.g) return null;
  const P = ixPaths(c), id = P.id;
  let s = IX.get(id);
  if (s) return s;
  const tmpBase = P.tmpBase;
  s = { id, idx: null, t: 0, child: null, waiters: [], tmpBase, tmp: P.tmp, sig: null };
  IX.set(id, s);
  const dname = (c.mods.length ? 'mods-' + md5(c.mods.join(',')) : 'vanilla') + '.json';
  const dBase = ixDefault(dname), dflt = ixMod().cachePath(dBase, ixExe(c), c.g);
  const side = sideOf(s.tmp), mine = !!side && side.release === release();   // our copy: only one this release built
  for (const [f, base] of [[s.tmp, tmpBase], [dflt, dBase]]) {
    if (s.idx || !isFile(f) || !ixMetaOk(f, c)) continue;
    if (f === s.tmp && !mine) continue;
    try { s.idx = ixLoad(base, c); s.t = Date.now(); s.from = f; if (f === s.tmp) s.sig = String(side.sig || ''); } catch (e) { /* next */ }
    if (s.idx && f === dflt && !isFile(s.tmp)) { try { fs.mkdirSync(ixTmp(), { recursive: true }); fs.copyFileSync(f, s.tmp); } catch (e) { /* refresh does a full build */ } }
  }
  // a copy built from what is there now is used as it is; anything else is built (again) in the background
  const now = ixSig(c);
  if (!s.idx || s.sig === null || s.sig !== now.sig || now.open) ixRefresh(s, c);
  return s;
}
// a failed build is retried after 30 s, 2 min, then every 10 min; a good build resets the count
const IX_BACKOFF = [30000, 120000, 600000], IX_TTL = 5 * 60000;
const IXCFG = { script: null, quietMs: 120000 };   // tests swap the child script and the quiet limit (_ixTest)
function ixFail(s) {
  s.child = null; s.failed = true; s.fails = (s.fails || 0) + 1;
  s.retryAt = Date.now() + IX_BACKOFF[Math.min(s.fails, IX_BACKOFF.length) - 1];
}
function ixRefresh(s, c) {
  if (s.child) { s.again = true; return; }
  s.again = false; s.stale = false;
  s.cx = { g: c.g, mods: c.mods.slice(), G: c.G, kp: c.kp, ictx: c.ictx && c.ictx.shared ? { shared: c.ictx.shared } : undefined };
  s.buildSig = ixSig(c).sig;   // what this build reads; kept beside the copy when it ends well
  try {
    fs.mkdirSync(ixTmp(), { recursive: true });
    // Single-file exe: process.execPath is the exe and TOOLS is its virtual root (__as2_sea__/tools), so this runs
    // `exe <VROOT>/entityindex/entityindex.js <game> ... --cache <tmp>`. tools/dist/sea-main.js main() lines 89-91 (GUI-4) take a
    // first argument ending in .js that lies under VROOT and run that embedded script with the rest of the argv; with node it is
    // a plain `node entityindex.js ...`. Keep the script path first and absolute.
    const args = [IXCFG.script || path.join(TOOLS, 'entityindex', 'entityindex.js'), c.g].concat(c.mods.length ? ['--mods', c.mods.join(',')] : [])
      .concat(ixExe(c) ? ['--exe', ixExe(c)] : []).concat(['--cache', s.tmpBase || s.tmp]);
    const ch = cp.spawn(process.execPath, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    s.child = ch; s.started = Date.now();
    let said = false, done = false;
    const heard = () => { said = true; };
    if (ch.stdout) { ch.stdout.on('data', heard); ch.stdout.on('error', () => {}); }
    if (ch.stderr) { ch.stderr.on('data', heard); ch.stderr.on('error', () => {}); }
    // guard: a child that says nothing within 120 s (wrong entry, a GUI started instead of the script, a hang) is a failed build
    const quiet = setTimeout(() => { if (!said && !done) { try { ch.kill(); } catch (e) { /* gone */ } finish(false); } }, IXCFG.quietMs);
    if (quiet.unref) quiet.unref();
    const finish = good => {
      if (done) return; done = true; clearTimeout(quiet);
      if (s.child === ch) s.child = null;
      if (good) {
        try { s.idx = ixLoad(s.tmpBase, s.cx || c); s.t = Date.now(); s.from = s.tmp; s.users = null; s.failed = false; s.fails = 0; s.sig = s.buildSig; sideWrite(s.tmp, s.sig); } catch (e) { ixFail(s); }
      } else ixFail(s);
      flush(s);
      if (s.again && s.cx) { s.again = false; ixRefresh(s, s.cx); }
    };
    ch.on('error', () => finish(false));
    ch.on('close', code => finish(code === 0 && said));   // close: after stdio drained, so `said` is final
  } catch (e) { ixFail(s); flush(s); }
}
function flush(s) { const w = s.waiters; s.waiters = []; for (const f of w) { try { f(); } catch (e) { /* waiter */ } } }
function ixGet(c) {
  const s = ixState(c); if (!s) return null;
  ixWatch(s, c);
  if (!s.child) {
    const now = Date.now(), cur = ixSigNow(s, c);
    // stamps decide: built again when the game or an active mod's entity, set or pak files moved; by age only for a mod with no stamp
    if (s.stale || (s.t && !s.failed && (s.sig !== cur.sig || (cur.open && now - s.t > IX_TTL)))) ixRefresh(s, c);
    else if (s.failed && now >= (s.retryAt || 0)) ixRefresh(s, c);
  }
  return s.idx;
}
// ---- Prepare (gui README "Prepare sections"): the state of our index copy without starting anything, and a build to the end.
// indexState(ictx) -> { state: 'ready'|'none'|'stale'|'na', why, at, bytes }   reads the sidecar and the last known signatures only
function indexState(ictx) {
  const c = ctxOf(ictx);
  if (!c.g) return { state: 'na', why: [] };
  const P = ixPaths(c);
  let st = null; try { st = fs.statSync(P.tmp); } catch (e) { st = null; }
  if (!st || !st.isFile()) return { state: 'none', why: [] };
  const side = sideOf(P.tmp), out = { at: st.mtimeMs, bytes: st.size };
  if (!side || side.release !== release()) return Object.assign({ state: 'stale', why: ['release'] }, out);
  const now = ixSig(c).sig, a = String(side.sig || '').split('|'), b = now.split('|'), why = [];
  if (a[0] !== b[0]) why.push('game');
  if (a.slice(1).join('|') !== b.slice(1).join('|')) why.push('mod');
  return Object.assign({ state: why.length ? 'stale' : 'ready', why }, out);
}
// indexPrepare(ictx, { signal }) -> Promise<{ built: bool }>   walks of the active mods first (fresh signatures), then the copy is
// loaded or built by the same code a hover uses; resolves when a copy made from what is there now is loaded. signal stops the build.
async function indexPrepare(ictx, o) {
  const c = ctxOf(ictx), signal = o && o.signal;
  if (!c.g) throw new Error('The game folder is not set.');
  const s = ixState(c);
  s.watchAt = 0;
  await ixWatch(s, c, 15000);
  let built = false;
  for (let i = 0; i < 3; i++) {
    if (signal && signal.aborted) break;
    if (!s.child) {
      if (s.idx && !s.failed && !s.stale && s.sig === ixSig(c).sig) break;
      if (i > 0 && s.failed) break;
      ixRefresh(s, c);
    }
    if (s.child) {
      built = true;
      await new Promise(res => {
        const stop = () => { try { if (s.child) s.child.kill(); } catch (e) { /* gone */ } };
        if (signal) signal.addEventListener('abort', stop, { once: true });
        s.waiters.push(() => { if (signal) signal.removeEventListener('abort', stop); res(); });
      });
    }
  }
  if (signal && signal.aborted) return { built, stopped: true };
  if (!s.idx || s.failed) throw new Error('The index of unit and item names could not be built.');
  return { built };
}
// building: no index loaded yet and a build is running now
const ixBusy = s => !!(s && !s.idx && s.child);
// after a save: mark the entity index (and our own game view) for the saved file's game stale; the next call refreshes both
// in the background and keeps serving the old copy meanwhile. rel = mod-relative path (files the index never reads are ignored).
function touch(ictx, rel) {
  const c = ctxOf(ictx), r = lc(fwd(rel || ''));
  if (r && /\.(lng|lua|txt|log|md|json|xml|ini|mi|dds|tga|png|jpg|ogg|wav)$/.test(r)) return false;
  let n = 0;
  for (const [id, s] of IX) if (!c.g || id.startsWith(lc(c.g) + '|')) { s.stale = true; if (s.child) s.again = true; n++; }
  for (const [id, e] of _vfs) if (!c.g || id.startsWith(lc(c.g) + '|')) { e.stale = true; n++; }
  return n > 0;
}
// start the entity index load/build in the background (routes call it after a lint)
function warm(ictx) { const c = ctxOf(ictx); if (c.g) ixGet(c); return true; }
// value (lower) -> [{ file, line, kind, from }] over entity + stuff refs; include key -> [entity key]
function usersMap(s) {
  if (s.users && s.users.idx === s.idx) return s.users;
  const by = new Map(), inc = new Map(), idx = s.idx;
  const push = (m, k, x) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(x); };
  for (const r of Object.values(idx.entities)) {
    for (const f of r.refs || []) push(by, lc(f[1]), { file: f[2], line: f[3], kind: f[0], from: r.key });
    for (const k of r.inherits || []) push(inc, lc(k), r.key);
  }
  for (const r of Object.values(idx.stuff)) for (const f of r.refs || []) push(by, lc(f[1]), { file: f[2], line: f[3], kind: f[0], from: r.key });
  s.users = { idx, by, inc };
  return s.users;
}
const baseName = k => String(k).split('/').pop();

// ---------------------------------------------------------------- hover
const H = (w, what, title, k, p, rows, links) => ({ line: w.line, col: w.col, len: w.len, what, title, lead: { k, p: p || {} }, rows: rows || [], links: links || [] });
const row = (k, v) => ({ k, v: String(v) });
const kb = n => n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';

function hoverKey(cx, kind, w, gk) {
  const key = cx.tok.t === 's' ? null : cx.tok.v;
  if (!key) return null;
  const f = keyFacts(key, kind, cx.path, gk), eng = engineTypes(key, gk), lim = limRows(key, undefined, gk);
  const rows = [], links = lim.map(id => ({ text: id, link: 'lim:' + id }));
  if (!f.all.length && !eng) return H(w, 'key', key, 'ide.h.keyNew', { key }, [], links);
  if (f.kinds && f.kinds.length) rows.push(row('ide.h.r.files', f.kinds.slice(0, 6).join(', ') + (f.kinds.length > 6 ? ' ...' : '')));
  if (f.best) rows.push(row('ide.h.r.type', sigsOf(f.best.ks)));
  if (eng) rows.push(row('ide.h.r.engine', eng));
  if (f.best) { const ex = topOf(f.best.ks.v).slice(0, 5).map(x => x[0]); if (ex.length) rows.push(row('ide.h.r.examples', ex.join(', '))); }
  if (f.best && f.best.path) rows.push(row('ide.h.r.inside', '{' + f.best.path.split('/').join(' {')));
  const lead = !f.all.length ? ['ide.h.keyEngine', { key }] : kind && !f.inKind ? ['ide.h.keyOther', { key, n: f.total }] : ['ide.h.key', { key, n: f.inKind ? f.uses : f.total }];
  return H(w, 'key', key, lead[0], lead[1], rows, links);
}
function hoverValue(cx, kind, w, gk) {
  const owner = cx.owner && cx.owner.t === 'w' ? cx.owner.v : null;
  const v = cx.tok.v, rows = [];
  if (owner) {
    const f = keyFacts(owner, kind, cx.path, gk), eng = engineTypes(owner, gk);
    if (f.best) {
      rows.push(row('ide.h.r.expect', sigsOf(f.best.ks)));
      const seen = (f.best.ks.v || {})[lc(v)]; if (seen) rows.push(row('ide.h.r.seen', String(seen)));
      const ex = topOf(f.best.ks.v).slice(0, 5).map(x => x[0]); if (ex.length) rows.push(row('ide.h.r.examples', ex.join(', ')));
    }
    if (eng) rows.push(row('ide.h.r.engine', eng));
  }
  if (cx.tok.t === 'w' && NUM.test(v)) {
    if (/^[-+]?0x/i.test(v)) rows.unshift(row('ide.h.r.dec', String(parseInt(v.replace(/^\+/, ''), 16))));
    else if (/^[-+]?\d+$/.test(v) && Math.abs(+v) < 2 ** 53) rows.unshift(row('ide.h.r.hex', (+v < 0 ? '-0x' : '0x') + Math.abs(+v).toString(16).toUpperCase()));
    return H(w, 'value', v, owner ? 'ide.h.number' : 'ide.h.numberBare', { key: owner || '' }, rows);
  }
  if (!owner && !rows.length) return null;
  return H(w, 'value', v, owner ? 'ide.h.value' : 'ide.h.valueBare', { key: owner || '' }, rows);
}
function hoverPath(cx, doc, c, w, owner) {
  const v = cx.tok.v;
  if (!c.g && !c.folder) return H(w, owner === 'include' ? 'include' : 'path', v, 'ide.h.pathNoGame', { value: v });
  const r = resolvePath(v, owner, doc, c);
  const what = owner === 'include' ? 'include' : 'path';
  if (r.special) return H(w, what, v, 'ide.h.includeSpecial', { value: v });
  if (!r.found) return H(w, what, v, what === 'include' ? 'ide.h.includeMissing' : 'ide.h.pathMissing', { key: r.key || v }, r.cands && r.cands.length > 1 ? [row('ide.h.r.tried', r.cands.slice(0, 4).join(', '))] : []);
  const rows = [row('ide.h.r.key', r.key), row('ide.h.r.layer', r.layer)];
  if (r.size) rows.push(row('ide.h.r.size', kb(r.size)));
  if (r.layers > 1) rows.push(row('ide.h.r.layers', String(r.layers)));
  const lead = what === 'include' ? 'ide.h.include' : 'ide.h.path';
  const k = lead + (r.where === 'mine' ? 'Mine' : r.where === 'othermod' ? 'Other' : 'Vanilla');
  return H(w, what, v, k, { key: r.key }, rows, [{ k: 'ide.h.l.open', link: linkFor(r.key, 0, c) }]);
}
// ---------------------------------------------------------------- sound names (tools/sound/model.js: the engine's own name rule)
// fireSound "mg34" plays weapon/shot/mg34, reloadSound weapon/reload/..; link_sound, start_sound, play_sound and {sound ..} take the
// name under resource/sound/ as it is. A folder name plays one of its files (shuffle bag), a file name (no .wav) that file.
const SOUND_KEYS = new Set(['firesound', 'reloadsound', 'link_sound', 'start_sound', 'play_sound', 'sound']);
const SOUND_PRE = { firesound: 'weapon/shot/', reloadsound: 'weapon/reload/' };
let sndModel = null;
const sndM = () => sndModel || (sndModel = require('../../sound/model'));
const _sndDirs = new WeakMap();
function soundSrc(c) {
  const v = vfsOf(c);
  let idx = v ? _sndDirs.get(v) : null;
  if (v && !idx) {
    idx = new Map();
    for (const [k, r] of v.files) { if (r && r.deleted || !k.startsWith('resource/sound/')) continue; const d = k.slice(0, k.lastIndexOf('/')); let a = idx.get(d); if (!a) idx.set(d, a = []); a.push(k); }
    _sndDirs.set(v, idx);
  }
  const list = dir => {
    dir = lc(fwd(dir)).replace(/\/+$/, '');
    const out = new Set(idx && idx.get(dir) || []);
    if (c.folder) { try { const d = path.join(c.folder, ...dir.split('/')); for (const e of fs.readdirSync(d)) if (isFile(path.join(d, e))) out.add(dir + '/' + lc(e)); } catch (e) { /* none */ } }
    return [...out];
  };
  return { read: k => readKey(k, c), list };
}
// a value that names a sound: under a sound key, or a .wav / sound/ path -> the name the engine plays, or null
function soundName(v, ownerName) {
  const raw = lc(fwd(String(v || ''))).trim();
  if (!raw || /[\0"]/.test(raw)) return null;
  const under = /^\/?(resource\/)?sound\//.test(raw);
  if (!(ownerName && SOUND_KEYS.has(ownerName)) && !under && !/\.wav$/.test(raw)) return null;
  if (!under && /\.wav$/.test(raw) && !(ownerName && SOUND_KEYS.has(ownerName))) return null;   // a .wav path elsewhere: a plain path
  let n = raw.replace(/^\/+/, '').replace(/^resource\//, '').replace(/^sound\//, '');
  const pre = !under && SOUND_PRE[ownerName] || '';
  return { raw, name: pre + n.replace(/\.wav$/, ''), pre };
}
function hoverSound(cx, c, w, ownerName) {
  const v = cx.tok.v, sn = soundName(v, ownerName);
  if (!sn) return null;
  if (!c.g && !c.folder) return H(w, 'path', v, 'ide.h.pathNoGame', { value: v });
  const M = sndM(), src = soundSrc(c);
  let res = M.resolve(sn.name, src.list), played = sn.name, hint = null;
  if (res.warn && !sn.pre) for (const p of ['weapon/shot/', 'weapon/reload/']) { const r2 = M.resolve(p + sn.name, src.list); if (!r2.warn) { hint = p + sn.name; break; } }
  if (res.warn) {
    const rows = [row('ide.h.r.splayed', 'resource/sound/' + played)];
    if (hint) rows.push(row('ide.h.r.shint', hint));
    return H(w, 'path', v, 'ide.h.soundMissing', { name: v, key: 'resource/sound/' + played }, rows);
  }
  const first = res.fixed || res.files[0];
  const rows = [row('ide.h.r.sfolder', res.folderKey)];
  rows.push(row('ide.h.r.sfiles', res.fixed ? '1 (' + baseName(res.fixed) + ')' : String(res.files.length)));
  try {
    const f = M.folder(res.folderKey, src.read, M.soundSet(src.read));
    const dist = (+f.minDistance.toFixed(2)) + '-' + (f.maxDistance > 0 ? (+f.maxDistance.toFixed(2)) + ' m' : '∞');
    rows.push(row('ide.h.r.sloud', (f.loudness || '-') + ', ' + dist + ', ' + f.group + (f.volume !== 1 ? ', Volume ' + f.volume : '')));
  } catch (e) { /* no sound.set: the card still says what plays */ }
  if (sn.pre) rows.push(row('ide.h.r.splayed', 'resource/sound/' + played));
  const lead = res.fixed ? 'ide.h.soundFile' : res.files.length > 1 ? 'ide.h.soundFolder' : 'ide.h.soundOne';
  return H(w, 'path', v, lead, { name: v, n: res.files.length }, rows, [{ k: 'ide.h.l.play', link: linkFor(first, 0, c) }]);
}
function hoverEntity(cx, c, w, ownerName) {
  const s = ixState(c); const idx = s && ixGet(c);
  if (!idx) return null;
  const name = lc(cx.tok.v).trim();
  if (!name) return null;
  const recs = /^[\w.\-]+$/.test(name) ? idx.byName(name) : [];
  if (recs.length) {
    // usedEnt = references the entity index records (entity and stuff files that name it); not a text search (refs finds more).
    // Shown only when > 0: zero there does not mean "unused".
    const U = usersMap(s), uses = (U.by.get(name) || []).length;
    const e = recs[0], rows = [row('ide.h.r.def', e.key)];
    if (recs.length > 1) rows.push(row('ide.h.r.defs', String(recs.length)));
    if (e.inherits && e.inherits.length) rows.push(row('ide.h.r.inherit', e.inherits.slice(0, 6).map(baseName).join(' > ') + (e.inherits.length > 6 ? ' ...' : '')));
    if (e.model) rows.push(row('ide.h.r.model', e.model));
    rows.push(row('ide.h.r.layer', e.layer || e.source || ''));
    if (uses > 0) rows.push(row('ide.h.r.usedEnt', String(uses)));
    const links = recs.slice(0, 5).map(r => ({ text: baseName(r.key), link: linkFor(r.key, 1, c) }));
    return H(w, 'entity', cx.tok.v, 'ide.h.entityIs', { name: cx.tok.v }, rows, links);
  }
  if (ownerName && STUFF_KEYS.has(ownerName)) {
    const m = idx.stuffMatch(name);
    if (!m.length) return H(w, 'entity', cx.tok.v, 'ide.h.stuffNone', { tags: cx.tok.v });
    const rows = [row('ide.h.r.found', m.slice(0, 3).map(baseName).join(', ') + (m.length > 3 ? ' ...' : ''))];
    return H(w, 'entity', cx.tok.v, 'ide.h.stuff', { tags: cx.tok.v, n: m.length }, rows, m.slice(0, 5).map(k => ({ text: baseName(k), link: linkFor(k, 1, c) })));
  }
  return null;
}
// macro definition: this text first, then its includes (3 levels, 30 files) -> { line, key|null } | null
function findDefine(name, doc, c) {
  const re = new RegExp('\\(define\\s+"' + esc(name) + '"', 'i');
  const scan = text => { const ls = String(text).split('\n'); for (let i = 0; i < ls.length; i++) { const t = ls[i].split(';')[0]; if (re.test(t)) return i + 1; } return 0; };
  const own = scan(doc.text);
  if (own) return { line: own, key: null };
  if (!c.g && !c.folder) return null;
  const seen = new Set(), q = [[doc.text, doc.key || 'resource/x', 0]];
  while (q.length && seen.size < 30) {
    const [text, from, d] = q.shift();
    for (const m of String(text).matchAll(/\(include\s+"([^"]+)"/gi)) {
      const r = sdlx.resolveInclude(m[1], lc(from)); if (r.kind !== 'virtual' || seen.has(r.key)) continue;
      seen.add(r.key);
      const t = decode(readKey(r.key, c)); if (t == null) continue;
      const ln = scan(t); if (ln) return { line: ln, key: r.key };
      if (d < 2) q.push([t, r.key, d + 1]);
    }
  }
  return null;
}
function hoverLng(cx, doc, c, w) {
  const names = cx.names || [];
  const full = lngKeyOf(doc.key || doc.file, cx.role === 'key' ? names : names);
  if (!full) return null;
  const rows = [row('ide.h.r.fullkey', full)];
  // text here: entry block whose kids are strings
  const X = lex(doc.text), i = X.toks.indexOf(cx.tok);
  let j = i + 1, here = null;
  if (cx.role === 'key') { const n = X.toks[j]; if (n && n.t === 's') here = n.v; }
  else here = cx.tok.v;
  if (here != null) rows.push(row('ide.h.r.text', here));
  if (doc.key && (c.g || c.folder)) {
    const t = decode(readKey(doc.key, c));
    if (t != null) {
      const tree = sdl.parseLines(t.split(/\r?\n/));
      let n = tree;
      for (const nm of names) { n = n && n.kids.find(k => lc(k.name) === lc(nm.v)); }
      const g = n && n.vals.filter(x => x.t === 's').map(x => x.v).join(' ');
      if (g && g !== here) rows.push(row('ide.h.r.game', g));
    }
  }
  return H(w, 'lng', cx.tok.v, here == null ? 'ide.h.lngGroup' : 'ide.h.lng', { key: full }, rows);
}

function hover(doc, pos, ictx) {
  if (!doc || doc.text == null) return null;
  const cx = classify(doc.text, pos); if (!cx) return null;
  const c = ctxOf(ictx), kind = kindOfDoc(doc), w = cx.w;
  const isLng = kind ? /\.lng$/.test(kind) || kind === 'lng' : /\.lng$/i.test(String(doc.file || doc.key || ''));
  switch (cx.role) {
    case 'tag': {
      const t = cx.tag || '';
      if (t.includes('#')) return H(w, 'tag', '{#' + t, 'ide.h.tagOff', { tag: t }, [], [{ text: 'SDL', link: 'docs:modweb/sdl/strings-tags.md' }]);
      if (t === '+' || t === '' || /^[+-]+$/.test(t)) return H(w, 'tag', '{#' + t, 'ide.h.tagFold', { tag: t });
      return H(w, 'tag', '{#' + t, 'ide.h.tagEat', { tag: t });
    }
    case 'include': {
      const fake = { tok: { t: 's', v: cx.target } };
      return hoverPath(fake, doc, c, w, 'include');
    }
    case 'define': {
      const n = (String(doc.text).match(new RegExp('\\(\\s*"' + esc(cx.target) + '"', 'gi')) || []).length;
      return H(w, 'define', cx.target, 'ide.h.define', { name: cx.target, n });
    }
    case 'macro': {
      const d = findDefine(cx.target, doc, c);
      if (!d) return H(w, 'define', cx.target, 'ide.h.macroNone', { name: cx.target });
      if (!d.key) return H(w, 'define', cx.target, 'ide.h.macro', { name: cx.target, line: d.line });
      return H(w, 'define', cx.target, 'ide.h.macroFar', { name: cx.target, key: d.key }, [], [{ k: 'ide.h.l.def', link: linkFor(d.key, d.line, c) }]);
    }
    case 'param': return H(w, 'define', cx.target, 'ide.h.param', { name: cx.target.replace(/^\(/, '') });
    case 'mod': {
      const v = vfsOf(c), name = cx.target || '';
      if (!v) return H(w, 'value', name, cx.not ? 'ide.h.modNot' : 'ide.h.mod', { name });
      const on = v.mods.map(lc).includes(lc(name)) || (lc(name) === 'as64+' && v.mode === 'enhanced');
      return H(w, 'value', name, (cx.not ? 'ide.h.modNot' : 'ide.h.mod') + (on ? 'On' : 'Off'), { name });
    }
  }
  // .lng root block `{tags`: not a data key and not a text entry
  if (isLng && cx.role === 'key' && cx.depth === 1) return null;
  if (isLng) { const r = hoverLng(cx, doc, c, w); if (r) return r; }
  const ownerName = cx.owner && cx.owner.t === 'w' ? lc(cx.owner.v) : null;
  if (cx.role === 'key' && cx.tok.t === 'w') return hoverKey(cx, kind, w, gkOf(c));
  // value or string key
  const v = cx.tok.v;
  let loading = false;
  if (cx.tok.t === 's' || (cx.tok.t === 'w' && !NUM.test(v))) {
    if (cx.role !== 'key' && !NUM.test(v)) { const sh = hoverSound(cx, c, w, ownerName); if (sh) return sh; }
    const looksPath = !NUM.test(v) && (PATHY.test(v) || (ownerName && PATH_KEYS.has(ownerName) && cx.tok.t === 's' && v.length > 0));
    if (looksPath && (cx.role !== 'key')) return hoverPath(cx, doc, c, w, ownerName);
    if (c.g) {
      const e = hoverEntity(cx, c, w, ownerName); if (e) return e;
      loading = /^[\w.\-]+$/.test(lc(v).trim()) && ixBusy(ixState(c));
    }
  }
  if (cx.role === 'key') return null;
  const hv = hoverValue(cx, kind, w, gkOf(c));
  if (!loading) return hv;
  // the entity index is still building: say so instead of a silent "not an entity"
  const card = hv || H(w, 'value', v, 'ide.h.valueBare', { key: '' });
  card.rows.push({ k: 'ide.h.ixLoading', v: '' });
  return card;
}

// ---------------------------------------------------------------- definition
function def(doc, pos, ictx) {
  if (!doc || doc.text == null) return [];
  const cx = classify(doc.text, pos); if (!cx) return [];
  const c = ctxOf(ictx);
  const ownerName = cx.owner && cx.owner.t === 'w' ? lc(cx.owner.v) : null;
  if (cx.role === 'include') {
    const r = resolvePath(cx.target, 'include', doc, c);
    return r.found ? [{ link: linkFor(r.key, 1, c), label: r.key, line: 1 }] : [];
  }
  if (cx.role === 'macro' || (cx.role === 'define' && !cx.defining)) {
    const d = findDefine(cx.target, doc, c);
    if (!d) return [];
    return d.key ? [{ link: linkFor(d.key, d.line, c), label: d.key, line: d.line }] : [{ link: null, label: cx.target, line: d.line }];
  }
  if (cx.role === 'param' || cx.role === 'tag' || cx.role === 'mod' || cx.role === 'define') return [];
  if (cx.role === 'key' && cx.tok.t === 'w') return [];
  const v = cx.tok.v;
  if (NUM.test(v)) return [];
  const looksPath = PATHY.test(v) || (ownerName && PATH_KEYS.has(ownerName) && cx.tok.t === 's');
  if (looksPath && (c.g || c.folder)) {
    const r = resolvePath(v, ownerName, doc, c);
    if (r.found) return [{ link: linkFor(r.key, 1, c), label: r.key, line: 1 }];
  }
  const s = ixState(c), idx = s && ixGet(c);
  if (!idx) return [];
  const name = lc(v).trim();
  const recs = /^[\w.\-]+$/.test(name) ? idx.byName(name) : [];
  if (recs.length) return recs.slice(0, 20).map(r => ({ link: linkFor(r.key, 1, c), label: r.key, line: 1 }));
  if (ownerName && STUFF_KEYS.has(ownerName)) return idx.stuffMatch(name).slice(0, 20).map(k => ({ link: linkFor(k, 1, c), label: k, line: 1 }));
  return [];
}

// ---------------------------------------------------------------- usages
// ms = time budget of refs() on the request thread; msAsync = refsAsync() total budget (sliced, setImmediate between slices)
const CAP = { hits: 500, files: 30000, ms: 400, msAsync: 8000, slice: 25, size: 4 * 1024 * 1024, line: 2000, ixHits: 300 };
const BIN = /\.(pak|pat|zip|7z|rar|dds|tga|png|jpg|jpeg|bmp|ogg|wav|mp3|mdl|ply|anm|vol|exe|dll|bin|fnt|ttf|psd|mtl|msh|lnk|ebm|tex|ani|cache|bak)$/i;
const TEXT = /\.(def|ext|inc|def1|set|dl|reg|ammo|weapon|pattern|mine|grenade|hand|fsm|fx|font|ps|mi|info|mod|ctm|etf|presets|accuracy|tpl|lng|lua|txt|xml|ini|json)$/i;
// mod-folder files (rel, sorted per folder), one folder read per step so a slice can stop between folders
function* walkGen(dir, rel) {
  let ns; try { ns = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  ns.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of ns) {
    if (e.name === '.git' || e.name === '.svn' || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) yield* walkGen(path.join(dir, e.name), r); else yield r;
  }
}
// One search, written as a generator so refs() (400 ms, request thread) and refsAsync() (8 s, sliced) share it.
// Order = relevance: 1 entity index users, 2 the open mod's files, 3 game files (layer winners). The generator yields after
// each unit of work; it checks the deadline itself and stops with truncated:true, why:'time' keeping what it found.
const newR = () => ({ name: '', kind: 'text', hits: [], truncated: false, why: null, t0: Date.now() });
const outR = R => { const o = { name: R.name, kind: R.kind, hits: R.hits, truncated: R.truncated, why: R.why, ms: Date.now() - R.t0 }; if (R.building) o.building = true; return o; };
function* refsGen(doc, posOrName, ictx, R, deadline) {
  const c = ctxOf(ictx);
  let name = null, kind = 'text';
  if (posOrName && posOrName.name) name = String(posOrName.name);
  else if (doc && doc.text != null && posOrName) {
    const cx = classify(doc.text, posOrName); if (!cx) return;
    name = cx.target || cx.tok.v;
    kind = cx.role === 'macro' || cx.role === 'define' ? 'macro' : cx.role === 'param' ? 'param' : cx.role === 'key' && cx.tok.t === 'w' ? 'key' : cx.role === 'include' ? 'file' : 'text';
  }
  name = String(name || '').trim();
  R.name = name; R.kind = kind;
  if (!name || name.length > 200) return;
  const hits = R.hits, byLink = new Map();
  const over = () => Date.now() > deadline;
  const stop = w => { R.truncated = true; if (!R.why) R.why = w; };
  const add = h => { const o = byLink.get(h.link); if (o) { if (!o.text && h.text) o.text = h.text; return; } byLink.set(h.link, h); hits.push(h); };
  // 1 entity index users
  const s = c.g ? ixState(c) : null, idx = s && ixGet(c);
  if (s && !idx && s.child) R.building = true;
  const lines = new Map();
  const lineText = (key, ln) => {
    if (!lines.has(key)) { const t = decode(readKey(key, c)); lines.set(key, t == null ? null : t.split(/\r?\n/)); }
    const a = lines.get(key); return a && a[ln - 1] != null ? a[ln - 1].trim().slice(0, 400) : '';
  };
  if (idx) {
    const nl = lc(name);
    if (idx.byName(nl).length && kind === 'text') R.kind = kind = 'entity';
    const U = usersMap(s), all = U.by.get(nl) || [], us = all.slice(0, CAP.ixHits);
    let n = 0;
    // after the deadline the links still come (cheap), the line text does not (a file read each)
    for (const u of us) { const l = locate(u.file, c); add({ link: linkFor(u.file, u.line, c), where: l.where || 'vanilla', text: over() ? '' : lineText(u.file, u.line) }); if ((++n & 15) === 0) yield; }
    if (kind === 'file' || /\.(ext|inc)$/.test(nl)) for (const k of (U.inc.get(nl) || []).slice(0, CAP.ixHits)) add({ link: linkFor(k, 1, c), where: locate(k, c).where || 'vanilla', text: baseName(k) });
    if (all.length > CAP.ixHits) stop('hits');
    yield;
  }
  // 2 text search: mod folder, then the game index (winners), whole word, case-insensitive
  const re = new RegExp('(^|[^A-Za-z0-9_])' + esc(name) + '($|[^A-Za-z0-9_])', 'i');
  let files = 0;
  const scanText = (text, mk) => {
    const ls = text.split(/\r?\n/);
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].length > CAP.line ? ls[i].slice(0, CAP.line) : ls[i];
      if (!re.test(t)) continue;
      const h = mk(i + 1, t.trim().slice(0, 400)); if (h) add(h);
      if (hits.length >= CAP.hits) { stop('hits'); return false; }
    }
    return true;
  };
  const mineDone = new Set();
  if (c.folder) {
    for (const rel of walkGen(c.folder, '')) {
      if (++files > CAP.files) { stop('files'); return; }
      if (over()) { stop('time'); return; }
      if (BIN.test(rel) || !(TEXT.test(rel) || !extOf(rel))) continue;
      const f = path.join(c.folder, ...rel.split('/'));
      let st; try { st = fs.statSync(f); } catch (e) { continue; }
      if (st.size > CAP.size) continue;
      let b; try { b = fs.readFileSync(f); } catch (e) { continue; }
      if (b.includes(0)) continue;
      const r = lc(rel); mineDone.add(r.startsWith('localization/') ? 'resource/interface/text/' + r.slice(13) : r);
      if (!scanText(decode(b), (ln, t) => ({ link: 'ide:' + rel + ':' + ln, where: 'mine', text: t }))) return;
      yield;
    }
  }
  if (over()) { stop('time'); return; }
  yield;
  const v = vfsOf(c);
  if (!v) return;
  let skipped = 0;
  for (const [key, rec] of v.files) {
    if (mineDone.has(key) || BIN.test(key) || !(TEXT.test(key) || key.startsWith('resource/set/stuff/'))) { if ((++skipped & 1023) === 0) yield; continue; }
    if (++files > CAP.files) { stop('files'); return; }
    if (over()) { stop('time'); return; }
    if ((rec.size || 0) > CAP.size) continue;
    let b; try { b = vfsLib.readRec(rec); } catch (e) { continue; }
    if (b && !b.includes(0) && re.test(b.toString('latin1'))) {
      const where = whereOf(rec, c, v);
      if (!scanText(decode(b), (ln, t) => ({ link: linkFor(key, ln, c), where, text: t }))) return;
    }
    yield;
  }
}
// request thread: at most CAP.ms (400 ms) of work, then {truncated:true, why:'time'} with what was found
function refs(doc, posOrName, ictx) {
  const R = newR();
  try { const it = refsGen(doc, posOrName, ictx, R, R.t0 + CAP.ms); while (!it.next().done) { /* run */ } }
  catch (e) { if (process.env.IDE_NAV_DEBUG) console.error(e); R.truncated = true; R.why = R.why || 'error'; }
  return outR(R);
}
// routes: the full search in slices of ~25 ms with setImmediate between them (other requests run in the gaps), 8 s total.
// opts = { signal? (AbortSignal: stop and resolve with what was found, why:'abort'), budgetMs? }. Never rejects.
function refsAsync(doc, posOrName, ictx, opts) {
  opts = opts || {};
  return new Promise(res => {
    const R = newR();
    const budget = opts.budgetMs > 0 ? Math.min(+opts.budgetMs, 60000) : CAP.msAsync;
    let it;
    try { it = refsGen(doc, posOrName, ictx, R, R.t0 + budget); } catch (e) { res(outR(R)); return; }
    const step = () => {
      try {
        if (opts.signal && opts.signal.aborted) { R.truncated = true; R.why = 'abort'; try { it.return(); } catch (e) { /* closed */ } res(outR(R)); return; }
        const end = Date.now() + CAP.slice;
        while (Date.now() < end) if (it.next().done) { res(outR(R)); return; }
        setImmediate(step);
      } catch (e) { if (process.env.IDE_NAV_DEBUG) console.error(e); R.truncated = true; R.why = R.why || 'error'; res(outR(R)); }
    };
    step();
  });
}

// ---------------------------------------------------------------- outline
function toBuf(text) {
  const b = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); b[i] = ch < 256 ? ch : ch >= 0x410 && ch <= 0x44F ? ch - 0x410 + 0xC0 : 63; }
  return b;
}
function symbols(doc) {
  if (!doc || doc.text == null) return [];
  const key = lc(doc.key || 'resource/buffer'), out = [];
  const r = sdlx.read(toBuf(String(doc.text)), { file: key, key, open: () => null, onError() {} });
  const nm = n => { const f = n.items[0]; return f ? (f.k === 'STRING' ? f.value : f.text !== undefined ? String(f.text) : '') : ''; };
  const blocks = items => { const a = []; for (const n of items) { if (n.k === 'BLOCK' && n.file === key) a.push(n); else if (n.k === 'MOD') a.push(...blocks(n.items)); } return a; };
  for (const n of blocks(r.root.items)) {
    out.push({ name: nm(n) || '{}', line: n.line, endLine: Math.max(n.line, n.endLine || n.line), depth: 0 });
    for (const k of blocks(n.items)) out.push({ name: nm(k) || '{}', line: k.line, endLine: Math.max(k.line, k.endLine || k.line), depth: 1 });
  }
  return out;
}

// ---------------------------------------------------------------- autocomplete words
const _words = new Map();
function words(kind, ictx) {
  let k = lc(kind || '').trim();
  if (!k || k === 'lng' || k === 'lua' || k === 'log' || k === 'text') return [];
  const gk = gkOf(ctxOf(ictx)), mk = gk + '|' + k;   // the GoH vocab under GoH (cache per game)
  if (_words.has(mk)) return _words.get(mk);
  const V = vocab(gk).kinds || {};
  let kinds;
  if (V[k]) kinds = [k];
  else if (k.includes('/')) { try { kinds = [model().kindOf(k.startsWith('resource/') ? k : 'resource/' + k)]; } catch (e) { kinds = []; } }
  else { const ext = k.replace(/^\./, ''); kinds = Object.keys(V).filter(x => x === ext || x.endsWith('.' + ext)); if (ext === 'sdl') kinds = Object.keys(V); }
  const acc = new Map();
  for (const kk of kinds) for (const e of Object.values(V[kk] || {})) for (const [key, ks] of Object.entries(e.k || {})) {
    if (!/^[a-z_][a-z0-9_.\-]*$/.test(key)) continue;
    const a = acc.get(key) || { n: 0, sp: new Map(), s: new Map() };
    a.n += ks.n || 0;
    for (const [sp, n] of Object.entries(ks.sp || {})) a.sp.set(sp, (a.sp.get(sp) || 0) + n);
    for (const [sg, n] of Object.entries(ks.s || {})) a.s.set(sg, (a.s.get(sg) || 0) + n);
    acc.set(key, a);
  }
  const out = [];
  for (const [key, a] of acc) {
    const sp = [...a.sp].sort((x, y) => y[1] - x[1])[0], sg = [...a.s].sort((x, y) => y[1] - x[1])[0];
    const o = { w: sp ? sp[0] : key }; if (sg) o.hint = sigText(sg[0]);
    out.push(o);
  }
  out.sort((x, y) => (lc(x.w) < lc(y.w) ? -1 : lc(x.w) > lc(y.w) ? 1 : 0));
  const res = out.slice(0, 4000);
  _words.set(mk, res);
  return res;
}

// test helper: wait until the entity index for ictx is loaded (or failed / timed out)
function _ready(ictx, ms) {
  const c = ctxOf(ictx), s = ixState(c);
  if (!s) return Promise.resolve(false);
  if (s.idx && !s.child) return Promise.resolve(true);
  return new Promise(res => {
    const t = setTimeout(() => res(!!s.idx), ms || 60000);
    s.waiters.push(() => { clearTimeout(t); res(!!s.idx); });
  });
}

// test hook: swap the index child script / quiet limit; returns the index state for ictx (read-only use).
// _ixTest('dirs') -> { tmp, vanilla }: where the index copies are kept (no file is created)
function _ixTest(cfg, ictx) {
  if (cfg === 'dirs') return { tmp: ixTmp(), vanilla: path.join(tc().dir('entityindex'), 'vanilla.json') };
  if (cfg) { if ('script' in cfg) IXCFG.script = cfg.script || null; if (cfg.quietMs > 0) IXCFG.quietMs = cfg.quietMs; }
  if (!ictx) return null;
  const c = ctxOf(ictx);
  return IX.get(lc(c.g || '') + '|' + c.mods.join(',') + c.kp) || null;
}

// (inc) where an include goes, by the same rule the include hover and INCLUDE_MISSING use: sdlx.resolveInclude against the including
// file's key, then this mod's loose file, then the layered game view (other mods, game paks). value = the string as written.
// -> { value, kind:'virtual'|'fs'|'user', key, found, where:'mine'|'othermod'|'vanilla'|null, layer, rel?, size, tried:[key] }
function incLocate(value, fromKey, ictx) {
  const v = String(value == null ? '' : value);
  const r = sdlx.resolveInclude(v, lc(fromKey || 'resource/x'));
  const out = { value: v, kind: r.kind, key: r.key, found: false, where: null, layer: null, size: 0, tried: [r.key] };
  if (r.kind !== 'virtual' || !r.key) return out;
  const c = ctxOf(ictx), l = locate(r.key, c);
  out.found = !!l.found; out.where = l.where || null; out.layer = l.layer || null; out.size = l.size || 0;
  if (l.rel) out.rel = l.rel;
  out.tried = relCands(r.key);
  return out;
}

module.exports = {
  incLocate: safe(incLocate, null),
  hover: safe(hover, null), def: safe(def, () => []), refs: safe(refs, () => ({ name: '', kind: 'text', hits: [], truncated: false })),
  refsAsync: function () { try { return refsAsync.apply(null, arguments); } catch (e) { return Promise.resolve({ name: '', kind: 'text', hits: [], truncated: false }); } },
  symbols: safe(symbols, () => []), words: safe(words, () => []), wordAt: safe(wordAt, null),
  touch: safe(touch, false), warm: safe(warm, false), indexState: safe(indexState, () => ({ state: 'none', why: [] })), indexPrepare,
  // false while the index of unit and item names is still loading: def() finds no name then, the Editor says so
  defReady: safe(function (ictx) { const c = ctxOf(ictx); return !!(ixState(c) && ixGet(c)); }, false),
  classify: safe(classify, null), _ready, _lngKeyOf: lngKeyOf, _pathCands: pathCands, _limRows: safe(limRows, () => []), _gameOf: safe(function (ictx) { const c = ctxOf(ictx); return { G: c.G, kp: c.kp, gk: gkOf(c) }; }, null), _vocabFile: vocabFile, _ixTest, _ixSig: ictx => ixSig(ctxOf(ictx)),
};
