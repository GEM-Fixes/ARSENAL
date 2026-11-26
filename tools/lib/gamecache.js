// gamecache: the game's own layers of a lib/vfs view (base, its N.pat, as64/core; GoH resource/, N.pat, localizations/<lang>),
// kept on disk keyed by the game's fingerprint, so a tool's vfs.build takes them in ~0.1-0.2 s instead of mounting the paks again
// (central directories of 17 paks, 138k records: 0.4-0.9 s on AS2, 1.2 s on GoH, in every linter process and worker). Shared by
// every tool and process (lib/cachestore under ARSENAL_CACHE, section 'gamecache'). lib/vfs build calls it; nobody else needs to.
//   take(c) -> {files, shadows, problems} | null   c = {gameDir (resolved), exe, isGoh, langs, coreDir, ci, exists, covered}:
//     the layers as a fresh mount would leave them (same records, same key order, same Map order, same shared objects), or
//     null (off, a miss, a cache that cannot be read). On a miss c.parts is set for save.
//   save(c, layers) -> bool   after a fresh mount (c from take): encoded, decoded again and compared field by field with what the
//     mount made; stored only when equal. One writer per fingerprint (a mkdir lock under the store, <root>/gamecache-lock/<key>,
//     taken over after 2 min): processes that miss together mount as before and only the lock holder pays for the store.
//     An entry that did not decode is written over. Never throws.
//   fingerprint(c) -> sha1   what the mount reads, relative to the game folder: every fixed root name the mount asks for (its
//     case-resolved path and stat), every file and folder below the mounted folders (size + content sha1 up to 2 MB, else size,
//     mtime and ctime). The game folder's own path is not in it: a tools/check overlay (junctions + copied root files) of the
//     same game gets the same layers, with its own paths put back in (container, problem where).
//   Also in the key: the code of the mount (vfs, pak, names, cipath, sdl, enc and this file, sha1 of their text), the exe, the
//     GoH languages, the platform, the format; lib/cachestore adds the release.
//   Refused (the mount runs as before and nothing is stored): env ARSENAL_GAME_CACHE=0, a vfs opts.fs seam, a modtree listing
//     that covers a mounted game folder (c.covered), a string with a NUL or not well formed, a record or problem of another
//     shape, the game path in a problem text, any error.
//   stats() -> {hit, miss, saved, refused, loadMs, saveMs, fpMs, getMs, why}   counts of this process (tests, bench)
// Author: Imperator_Aug (ARSENAL, ia-d23b75bf)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const FORMAT = 1, SECTION = 'gamecache', HASH_MAX = 2 * 1024 * 1024;
const SKIP_DIR = new Set(['.svn', '.git']);
const REC_PAK = 'source,container,entry,layer,size,ent', REC_LOOSE = 'source,container,entry,layer,size';
const ENT = 'name,method,csize,size,off,crc,time', PROB = 'code,msg,where,level', DEL = 'deleted,layer,how';
const ST = { hit: 0, miss: 0, saved: 0, refused: 0, loadMs: 0, saveMs: 0, fpMs: 0, getMs: 0, why: '' };
const off = () => process.env.ARSENAL_GAME_CACHE === '0';
const fwd = p => p.replace(/\\/g, '/');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

let CODE = null;
function codeSig() {
  if (CODE) return CODE;
  const h = crypto.createHash('sha1');
  for (const f of ['vfs.js', 'pak.js', 'names.js', 'cipath.js', 'sdl.js', 'enc.js', 'gamecache.js']) h.update(f + '\0').update(fs.readFileSync(path.join(__dirname, f)));
  return (CODE = h.digest('hex'));
}
let STORE = null;
const store = () => STORE || (STORE = require('./cachestore').open());

// ---- fingerprint: what the game mount reads, paths relative to the game folder
function fingerprint(c) {
  const rows = [], G = c.gameDir;
  const rel = p => (p ? fwd(path.relative(G, p)) : '-');
  // a file directly in a mount root (resource.pak, N.pat, localization.pak: what tools/check copies into its overlay, with a new
  // time) by its content up to HASH_MAX; any other by size, mtime and ctime (an overlay links those folders: the same times)
  const statRow = (p, st, top) => {
    if (!st) return '-';
    if (st.isDirectory()) return 'd';
    if (top && st.size <= HASH_MAX) { let h; try { h = sha1(fs.readFileSync(p)); } catch (e) { h = 'x'; } return 'f|' + st.size + '|h' + h; }
    return 'f|' + st.size + '|m' + st.mtimeMs + '|c' + st.ctimeMs;
  };
  const walk = dir => {
    let ns; try { ns = fs.readdirSync(dir); } catch (e) { rows.push(rel(dir) + '/|unreadable'); return; }
    for (const nm of ns.sort()) {
      const p = path.join(dir, nm), st = c.exists(p);
      rows.push(rel(p) + '|' + statRow(p, st));
      if (st && st.isDirectory() && !SKIP_DIR.has(nm.toLowerCase())) walk(p);
    }
  };
  const fixed = (R, name) => {
    const p = c.ci(R, name), st = c.exists(p);
    rows.push('@' + rel(R) + ':' + name + '>' + rel(p) + '|' + statRow(p, st, true));
    return st && st.isDirectory() ? p : null;
  };
  const pats = R => { for (let n = 1; ; n++) { const p = c.ci(R, n + '.pat'); rows.push('@' + rel(R) + ':' + n + '.pat>' + rel(p) + '|' + statRow(p, c.exists(p), true)); if (!c.exists(p)) break; } };
  const root = R => {
    if (c.isGoh) {
      const d = fixed(R, 'resource'); if (d) walk(d);
      pats(R);
      fixed(R, 'localizations');
      for (const l of c.langs) { fixed(R, 'localizations/' + l + '.pak'); const ld = fixed(R, 'localizations/' + l); if (ld) walk(ld); }
      return;
    }
    fixed(R, 'resource.pak');
    const d = fixed(R, 'resource'); if (d) walk(d);
    pats(R);
    fixed(R, 'localization.pak');
    const l = fixed(R, 'localization'); if (l) walk(l);
  };
  rows.push('exe ' + c.exe + ' goh ' + !!c.isGoh + ' langs ' + (c.langs || []).join(',') + ' ' + process.platform);
  root(G);
  if (c.coreDir) { rows.push('core ' + rel(c.coreDir) + '|' + statRow(c.coreDir, c.exists(c.coreDir))); if (c.exists(c.coreDir)) root(c.coreDir); }
  return sha1(rows.join('\n'));
}

// ---- the compact form: u32 header length, header JSON, u32 string bytes, the strings (latin1, or UTF-8 when a char is past U+00FF;
// NUL between), padding to 4, one block of unsigned 32-bit columns. NONE = 0xFFFFFFFF in a reference column; a number that may pass
// 4 GB (zip64: record size, ent csize, size, off) is two columns, low and high
// head: files, records, ents, shadows counts
// files (2): key string, record
// ents (11): name string, name suffix length (NONE = the whole string), method, csize lo hi, size lo hi, off lo hi, crc, time
// records (8): flags (1 pak, 2 entry = its ent's name), container, layer, size lo hi, entry string, entry suffix length, ent (NONE)
// shadows (3): key string, by (a record, or records + deleted index), over (a record or NONE)
const NONE = 0xFFFFFFFF, HI = 0x100000000;
function encode(L, G) {
  const P = fwd(G);
  const why = m => { throw Object.assign(new Error(m), { refuse: true }); };
  const strs = [], sIdx = new Map();
  const str = s => { if (typeof s !== 'string') why('not a string'); let i = sIdx.get(s); if (i === undefined) { i = strs.length; sIdx.set(s, i); strs.push(s); } return i; };
  const conts = [], cIdx = new Map(), lays = [], lIdx = new Map();
  const tab = (m, a, s) => { let i = m.get(s); if (i === undefined) { i = a.length; m.set(s, i); a.push(s); } return i; };
  const recs = [], rIdx = new Map(), recKey = [], ents = [], entKey = [], eIdx = new Map();
  const big = x => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
  const u32 = x => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < HI;
  const addRec = (r, key) => {
    let i = rIdx.get(r);
    if (i === undefined) {
      const ks = Object.keys(r).join(',');
      if ((r.source !== 'pak' && r.source !== 'loose') || ks !== (r.source === 'pak' ? REC_PAK : REC_LOOSE)) why('record shape ' + ks);
      if (!big(r.size) || typeof r.entry !== 'string' || typeof r.layer !== 'string' || typeof r.container !== 'string') why('record types');
      if (!r.container.startsWith(P + '/')) why('container outside the game folder');
      if (r.source === 'pak' && (!r.ent || typeof r.ent !== 'object')) why('pak record without ent');
      i = recs.length; rIdx.set(r, i); recs.push(r); recKey.push(key);
      if (r.ent && !eIdx.has(r.ent)) {
        const e = r.ent;
        if (Object.keys(e).join(',') !== ENT || typeof e.name !== 'string') why('ent shape');
        if (!u32(e.method) || !big(e.csize) || !big(e.size) || !big(e.off) || !u32(e.crc) || !u32(e.time)) why('ent types');
        eIdx.set(e, ents.length); ents.push(e); entKey.push(key);
      }
    }
    return i;
  };
  const fileRec = [];
  for (const [k, r] of L.files) { str(k); fileRec.push(addRec(r, k)); }
  const dels = [], sh = [];
  for (const s of L.shadows) {
    if (Object.keys(s).join(',') !== 'key,by,over') why('shadow shape');
    let by;
    if (s.by && s.by.deleted === true) { if (Object.keys(s.by).join(',') !== DEL) why('delete shape'); by = -1 - dels.length; dels.push(s.by); }
    else by = addRec(s.by, s.key);
    sh.push(str(s.key), by, s.over ? addRec(s.over, s.key) : NONE);
  }
  const nf = L.files.size, nr = recs.length, ne = ents.length, ns = L.shadows.length;
  const len = 4 + nf * 2 + ne * 11 + nr * 8 + ns * 3;
  if (nr + dels.length >= NONE || strs.length + nr + ne >= NONE) why('too many');
  const A = new Uint32Array(len);
  A[0] = nf; A[1] = nr; A[2] = ne; A[3] = ns;
  let q = 4, ki = 0;
  for (const k of L.files.keys()) { A[q++] = sIdx.get(k); A[q++] = fileRec[ki++]; }
  // a string as a reference: the suffix of the key it is bound to (most pak names are their key's tail), else its own string
  const ref = (s, key) => { if (typeof key === 'string' && key.endsWith(s)) { A[q++] = str(key); A[q++] = s.length; } else { A[q++] = str(s); A[q++] = NONE; } };
  const two = x => { A[q++] = x % HI; A[q++] = Math.floor(x / HI); };
  for (let i = 0; i < ne; i++) { const e = ents[i]; ref(e.name, entKey[i]); A[q++] = e.method; two(e.csize); two(e.size); two(e.off); A[q++] = e.crc; A[q++] = e.time; }
  for (let i = 0; i < nr; i++) {
    const r = recs[i], shared = !!r.ent && r.entry === r.ent.name;
    A[q++] = (r.source === 'pak' ? 1 : 0) | (shared ? 2 : 0); A[q++] = tab(cIdx, conts, r.container.slice(P.length)); A[q++] = tab(lIdx, lays, r.layer); two(r.size);
    if (shared) { A[q++] = 0; A[q++] = 0; } else ref(r.entry, recKey[i]);
    A[q++] = r.ent ? eIdx.get(r.ent) : NONE;
  }
  for (let i = 0; i < sh.length; i += 3) { A[q++] = sh[i]; A[q++] = sh[i + 1] < 0 ? nr + (-1 - sh[i + 1]) : sh[i + 1]; A[q++] = sh[i + 2]; }
  if (q !== len) why('layout');
  const probs = L.problems.map(p => {
    if (Object.keys(p).join(',') !== PROB) why('problem shape');
    if (p.code === 'CASE_CLASH') why('case clash');   // (case-sensitive fs: a clash line of a lookup may come again after a take)
    if (typeof p.msg !== 'string' || typeof p.where !== 'string') why('problem types');
    const low = process.platform === 'win32' ? s => s.toLowerCase() : s => s, w = p.where, inW = low(w).indexOf(low(P));
    if (low(p.msg).includes(low(P)) || inW > 0) why('game path in a problem');
    if (inW < 0) return [p.code, p.msg, w, p.level, 0];
    if (!w.startsWith(P) || (w.length > P.length && w[P.length] !== '/')) why('game path in a problem');
    return [p.code, p.msg, w.slice(P.length), p.level, 1];
  });
  const joined = strs.join('\0'), enc = /[^\x00-\xff]/.test(joined) ? 'utf8' : 'latin1';   // (latin1: one byte a char, decoded faster)
  if (strs.some(s => s.includes('\0')) || !joined.isWellFormed()) why('string not storable');
  const hdr = Buffer.from(JSON.stringify({ f: FORMAT, enc, conts, lays, probs, dels }), 'utf8'), sb = Buffer.from(joined, enc);
  const head = 8 + hdr.length + sb.length, pad = (4 - (head % 4)) % 4;
  const out = Buffer.alloc(head + pad + len * 4);
  out.writeUInt32LE(hdr.length, 0); hdr.copy(out, 4);
  out.writeUInt32LE(sb.length, 4 + hdr.length); sb.copy(out, 8 + hdr.length);
  Buffer.from(A.buffer, A.byteOffset, A.byteLength).copy(out, head + pad);
  return out;
}

function decode(buf, G) {
  const P = fwd(G);
  const hl = buf.readUInt32LE(0), H = JSON.parse(buf.toString('utf8', 4, 4 + hl));
  if (H.f !== FORMAT || (H.enc !== 'utf8' && H.enc !== 'latin1')) throw new Error('format');
  const sl = buf.readUInt32LE(4 + hl), head = 8 + hl + sl, pad = (4 - (head % 4)) % 4;
  const S = sl ? buf.toString(H.enc, 8 + hl, head).split('\0') : [];
  const nb = buf.length - head - pad, at = buf.byteOffset + head + pad;
  if (nb < 16 || nb % 4) throw new Error('length');
  // the columns as a Uint32Array (copied when the Buffer sits unaligned in a pool); a load gives a small integer where it fits, as
  // pak.list's numbers are
  const N = at % 4 === 0 ? new Uint32Array(buf.buffer, at, nb / 4) : new Uint32Array(buf.buffer.slice(at, at + nb));
  const conts = H.conts.map(r => P + r), lays = H.lays;
  const nf = N[0], nr = N[1], ne = N[2], ns = N[3];
  if (4 + nf * 2 + ne * 11 + nr * 8 + ns * 3 !== N.length) throw new Error('length');
  const sref = (s, n) => (n === NONE ? S[s] : S[s].slice(S[s].length - n));
  const two = (lo, hi) => (hi ? hi * HI + lo : lo);
  let q = 4 + nf * 2;
  const E = new Array(ne);
  for (let i = 0; i < ne; i++, q += 11) {
    E[i] = { name: sref(N[q], N[q + 1]), method: N[q + 2], csize: two(N[q + 3], N[q + 4]), size: two(N[q + 5], N[q + 6]), off: two(N[q + 7], N[q + 8]), crc: N[q + 9], time: N[q + 10] };
  }
  const R = new Array(nr);
  for (let i = 0; i < nr; i++, q += 8) {
    const f = N[q], e = N[q + 7], ent = e === NONE ? undefined : E[e], entry = f & 2 ? ent.name : sref(N[q + 5], N[q + 6]);
    R[i] = f & 1
      ? { source: 'pak', container: conts[N[q + 1]], entry, layer: lays[N[q + 2]], size: two(N[q + 3], N[q + 4]), ent }
      : { source: 'loose', container: conts[N[q + 1]], entry, layer: lays[N[q + 2]], size: two(N[q + 3], N[q + 4]) };
  }
  const files = new Map();
  for (let i = 0, p = 4; i < nf; i++, p += 2) files.set(S[N[p]], R[N[p + 1]]);
  const shadows = new Array(ns);
  for (let i = 0; i < ns; i++, q += 3) {
    const b = N[q + 1], o = N[q + 2];
    shadows[i] = { key: S[N[q]], by: b >= nr ? H.dels[b - nr] : R[b], over: o === NONE ? null : R[o] };
  }
  const problems = H.probs.map(x => ({ code: x[0], msg: x[1], where: x[4] ? P + x[2] : x[2], level: x[3] }));
  return { files, shadows, problems };
}

// field by field, with the sharing of record and ent objects, Map order and key order
function same(a, b) {
  if (a.files.size !== b.files.size || a.shadows.length !== b.shadows.length || a.problems.length !== b.problems.length) return false;
  const rm = new Map(), em = new Map();
  const pair = (m, x, y) => { const z = m.get(x); if (z === undefined) { m.set(x, y); return true; } return z === y; };
  const sameObj = (x, y) => { const kx = Object.keys(x), ky = Object.keys(y); if (kx.join(',') !== ky.join(',')) return false; for (const k of kx) if (k !== 'ent' && x[k] !== y[k]) return false; return true; };
  const rec = (x, y) => {
    if (!x || !y) return x === y;
    if (x.deleted || y.deleted) return JSON.stringify(x) === JSON.stringify(y);
    if (!pair(rm, x, y) || !sameObj(x, y)) return false;
    if (!x.ent !== !y.ent) return false;
    return !x.ent || (pair(em, x.ent, y.ent) && sameObj(x.ent, y.ent));
  };
  const ia = a.files.entries(), ib = b.files.entries();
  for (let x = ia.next(), y = ib.next(); !x.done; x = ia.next(), y = ib.next()) if (x.value[0] !== y.value[0] || !rec(x.value[1], y.value[1])) return false;
  for (let i = 0; i < a.shadows.length; i++) {
    const x = a.shadows[i], y = b.shadows[i];
    if (Object.keys(x).join(',') !== Object.keys(y).join(',') || x.key !== y.key || !rec(x.by, y.by) || !rec(x.over, y.over)) return false;
  }
  return JSON.stringify(a.problems) === JSON.stringify(b.problems);
}

function partsOf(c) { return { v: FORMAT, code: codeSig(), exe: c.exe || '', langs: c.isGoh ? (c.langs || []).join(',') : '', platform: process.platform, fp: fingerprint(c) }; }
function refuse(m) { ST.refused++; ST.why = m; return null; }

function take(c) {
  if (off()) return null;
  if (c.covered) return refuse('a listing covers a game folder');
  const t0 = Date.now();
  try { c.parts = partsOf(c); } catch (e) { c.parts = null; return refuse('fingerprint: ' + e.message); }
  ST.fpMs += Date.now() - t0;
  try {
    const t1 = Date.now(), got = store().getRaw(SECTION, FORMAT, c.parts, {});
    ST.getMs += Date.now() - t1;
    if (!got || !got.raw) { ST.miss++; return null; }
    const L = decode(got.buf, c.gameDir);
    ST.hit++; ST.loadMs += Date.now() - t0;
    return L;
  } catch (e) { c.bad = true; return refuse('take: ' + e.message); }   // (parts kept: the mount's save puts a good entry over it)
}

// one writer per fingerprint at a time: processes that start together on a new game (a check's linters, sdllint's workers) mount
// as before and the first one stores; the others do not pay for the encode. A lock older than LOCK_MS is left by a dead process
const LOCK_MS = 120000;
function lock(dir) {
  try { fs.mkdirSync(path.dirname(dir), { recursive: true }); fs.mkdirSync(dir); return true; } catch (e) {
    if (e.code !== 'EEXIST') return false;
    try { if (Date.now() - fs.statSync(dir).mtimeMs > LOCK_MS) { fs.rmdirSync(dir); fs.mkdirSync(dir); return true; } } catch (e2) { /* another took it */ }
    return false;
  }
}
function save(c, L) {
  if (off() || !c || !c.parts) return false;
  const t0 = Date.now();
  let held = null;
  try {
    const S = store(), dir = path.join(S.root, 'gamecache-lock', S.key(SECTION, c.parts));
    if (!lock(dir)) return false;
    held = dir;
    if (!c.bad && S.state(SECTION, FORMAT, c.parts, {}).state === 'ready') return false;   // stored meanwhile
    const buf = encode(L, c.gameDir);
    if (!same(L, decode(buf, c.gameDir))) return !!refuse('decoded form differs');
    const r = S.put(SECTION, FORMAT, c.parts, {}, buf);
    if (r && r.bytes) ST.saved++;
    ST.saveMs += Date.now() - t0;
    return !!(r && r.bytes);
  } catch (e) { refuse('save: ' + e.message); return false; } finally { if (held) { try { fs.rmdirSync(held); } catch (e) { /* gone */ } } }
}
const stats = () => Object.assign({}, ST);
module.exports = { take, save, fingerprint, stats, _parts: partsOf, _encode: encode, _decode: decode, _same: same, _reset: () => { STORE = null; CODE = null; for (const k of Object.keys(ST)) ST[k] = typeof ST[k] === 'number' ? 0 : ''; } };
