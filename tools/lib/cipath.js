// cipath: loose-file lookups without regard to letter case, as the game sees names on Windows (NTFS + its pak lookups),
// so the tools find `Entity/Vehicle/Tank.DEF` against `entity/vehicle/tank.def` on a case-sensitive file system too.
//   resolve(root, rel, opt) -> real path under root whose segments match rel ignoring case, or null
//   exists(root, rel, opt)  -> bool          readdirCI(dir, opt) -> { names, find(name), clashes } | null
//   clashes(root, opt) -> [{ dir, names, chosen }]  (entries of one folder that differ only by case: Linux only; chosen =
//     the sorted-first, picked when no entry has the exact case asked; only folders already listed this run are seen)
//   clear(opt)  drop the cached listings (default cache, or opt.cache)
// opt: { fs: { readdirSync, statSync } (default node fs), cache: Map (default module cache), onClash(c) }
// Rules: '/' and '\' both separate. Fast path: the exact path exists -> that path, no listing read (Windows: always, so
// results there are the joined path as before). Otherwise each segment is matched in its parent's listing: exact-case
// entry first, else the first in sorted order among the case-equal ones (a clash, reported once per dir+fold).
// Refused (null): absolute rel, drive letter, UNC, any '..' segment. root itself is taken as given (not case-resolved).
// Fold = per code point simple uppercase (one code point to one, like the NTFS $UpCase table): ß stays ß, [I] tables differ in rare points.
// Author: Imperator_Aug (ARSENAL, ia-3dd76e32)
const nodeFs = require('fs'), path = require('path');

const _cache = new Map();   // dir -> listing | null
const _fold = new Map();
function fold(s) {
  let r = _fold.get(s);
  if (r !== undefined) return r;
  r = '';
  for (const ch of s) { const u = ch.toUpperCase(); r += [...u].length === 1 ? u : ch; }
  if (_fold.size > 200000) _fold.clear();
  _fold.set(s, r);
  return r;
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function stat(F, p) { try { return F.statSync(p) || null; } catch { return null; } }

function readdirCI(dir, opt = {}) {
  const F = opt.fs || nodeFs, cache = opt.cache || _cache;
  if (cache.has(dir)) return cache.get(dir);
  let names = null;
  try { names = F.readdirSync(dir); } catch { names = null; }
  let out = null;
  if (names) {
    const byFold = new Map();
    for (const n of names) { const k = fold(String(n)); const a = byFold.get(k); if (a) a.push(String(n)); else byFold.set(k, [String(n)]); }
    const clashes = [];
    for (const a of byFold.values()) if (a.length > 1) { a.sort(cmp); clashes.push({ dir, names: a.slice() }); }
    out = {
      dir, names: names.map(String), clashes,
      // exact-case entry wins, else first in sorted order
      find(name) { const a = byFold.get(fold(String(name))); if (!a) return null; return a.includes(name) ? name : a[0]; },
      group(name) { return byFold.get(fold(String(name))) || null; },
    };
  }
  cache.set(dir, out);
  return out;
}

// split rel into segments; null when refused
function segments(rel) {
  const s = String(rel == null ? '' : rel);
  if (/^[\\/]/.test(s) || /^[A-Za-z]:/.test(s) || path.isAbsolute(s)) return null;
  const segs = s.split(/[\\/]+/).filter(x => x !== '' && x !== '.');
  if (segs.some(x => x === '..')) return null;
  return segs;
}

const _reported = new WeakMap();   // cache -> Set of reported "dir\0fold"
function report(opt, cache, dir, group, chosen) {
  let seen = _reported.get(cache);
  if (!seen) _reported.set(cache, seen = new Set());
  const k = dir + '\0' + fold(chosen);
  if (seen.has(k)) return;
  seen.add(k);
  if (typeof opt.onClash === 'function') opt.onClash({ dir, names: group.slice(), chosen });
}

function resolve(root, rel, opt = {}) {
  const segs = segments(rel);
  if (!segs || root == null) return null;
  const F = opt.fs || nodeFs, cache = opt.cache || _cache;
  const exact = segs.length ? path.join(root, ...segs) : root;
  if (stat(F, exact)) return exact;                       // fast path
  let cur = root;
  for (const sg of segs) {
    const L = readdirCI(cur, opt);
    if (!L) return null;
    const real = L.find(sg);
    if (real === null) return null;
    const g = L.group(sg);
    if (g && g.length > 1) report(opt, cache, cur, g, real);
    cur = path.join(cur, real);
  }
  return segs.length ? cur : null;                         // root itself missing
}

const exists = (root, rel, opt) => resolve(root, rel, opt) !== null;

// clashes seen in cached listings at or under root (only folders already listed this run)
function clashes(root, opt = {}) {
  const cache = opt.cache || _cache, out = [];
  const r = root == null ? null : path.resolve(String(root));
  for (const [dir, L] of cache) {
    if (!L || !L.clashes.length) continue;
    const d = path.resolve(dir);
    if (r !== null && d !== r && !d.startsWith(r.endsWith(path.sep) ? r : r + path.sep)) continue;
    for (const c of L.clashes) out.push({ dir, names: c.names.slice(), chosen: c.names[0] });
  }
  return out;
}

function clear(opt = {}) { (opt.cache || _cache).clear(); }

module.exports = { resolve, exists, readdirCI, clashes, clear, fold, segments };
