// ext view: where the bytes of a viewed file come from. The same `ref` forms, the same resolution and the same safety checks as
// /api/x/files/open (tools/gui/ext/files/lib.js, reused, not copied): {mod, rel} a file of the mod (a pak too), {mod, rel:'<pak>::<entry>'}
// an entry of one of the mod's own paks, {mod, key[, idx]} a layer of the game's layered view (no idx = the copy the game loads),
// {mod?, path} any file by its full path (inside the mod = the rel form; a packed path like mods/x/resource/set/a.set is found in its
// pak). A phone (ctx.session.remote) is asked about every file through ctx.pathOk (lib.remoteRead). Nothing is ever written here.
// Big files: readRange reads one slice (a loose file or a stored pak entry at its offset; a deflated pak entry is inflated as a stream
// up to the slice and the stream is kept for the next slice), so a 2 GB entry is paged without loading it.
// Author: Imperator_Aug (ARSENAL, ia-eab5b4c2)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const lib = require('../files/lib'), names = require('../../../lib/names'), pak = require('../../../lib/pak');

const MAX_READ = 64 * 1024 * 1024, LIST_CAP = 5000, TEXT_ROOT = 'resource/interface/text/';
// Game parity: the request's game comes with ctx (ctx.gameId, ctx.exe, ctx.curDir); files/lib vfsFor, chainFor and readMod build the
// view of that game (MoW:AS2 with exe mowas_2, GoH over the GoH install). A mod is checked in read mode (lib.checkRead): nothing is written
// here, so under GoH a mod in <GoH>/mods/<name> or a GoH Workshop item may be viewed (files/lib refuseZone read rule).
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s).toLowerCase();
const norm = p => lc(fwd(path.resolve(p))).replace(/\/+$/, '');
const inside = (p, root) => norm(p).startsWith(norm(root) + '/');
const stat = f => { try { return fs.statSync(f); } catch { return null; } };
const baseName = s => String(s || '').split('::').pop().split(/[\\/]/).pop();

// ?mod=&rel=|key=[&idx=]|path= -> q (strings; empty values dropped)
function refOfQuery(url) {
  const q = {}, sp = url && url.searchParams;
  if (sp) for (const k of ['mod', 'rel', 'key', 'idx', 'path']) { const v = sp.get(k); if (v != null && v !== '') q[k] = v; }
  return q;
}
function keyNorm(k) {
  if (typeof k !== 'string' || !k || k.length > 512 || /\0/.test(k)) throw bad('key: a game file name like resource/sound/a.wav is needed');
  let n = names.normalize(k).replace(/^\.?\/+/, '');
  if (!n.startsWith('resource/')) n = 'resource/' + n;
  if (n.split('/').some(x => x === '..')) throw bad('key: ".." is not allowed');
  return n;
}
// key of an entry inside one of the mod's own paks (the rule of files/lib tree)
function pakKey(pr, entry) {
  if (pr.includes('/')) return null;
  const base = /\.pat$/i.test(pr) || /^resource\.pak$/i.test(pr) ? 'resource/' : /^localization\.pak$/i.test(pr) ? TEXT_ROOT : null;
  return base ? base + names.zipEntryName(entry) : null;
}
const fileSrc = f => ({ type: 'file', file: f });
const pakSrc = (file, ent) => ({ type: 'pak', file, ent });

// q -> { name, key, rel, idx?, file, inPak, entry, size, where:'mine'|'othermod'|'vanilla'|'outside', layer, src }
// (file = the file on disk: the loose file, or the pak that holds the entry). Throws Error with .status (400, 403, 404, 415).
function resolve(ctx, q) {
  q = q || {};
  if (q.key != null && q.key !== '') {
    // no mod: the game as it ships (lib.readMod; only layers inside the game folder)
    const mod = lib.readMod(ctx, q.mod), key = keyNorm(q.key);
    const { cv, chain } = lib.chainFor(ctx, mod, key);
    let idx = -1;
    if (q.idx == null || q.idx === '') { for (let i = chain.length - 1; i >= 0; i--) if (!chain[i].deleted) { idx = i; break; } }
    else { idx = Number(q.idx); if (!Number.isInteger(idx) || idx < 0 || idx > 1e5) throw bad('idx: pick a layer from the list'); }
    const rec = chain[idx];
    if (!rec || rec.deleted) throw bad(q.idx == null || q.idx === '' ? 'The game has no file ' + key + '.' : 'That layer has no file.', 404);
    const f = lib.recFile(rec);
    lib.remoteRead(ctx, f);
    const o = { name: baseName(key), key, rel: null, idx, layer: rec.layer || null, where: lib.kindOf(rec, cv), mod };
    if (rec.source === 'pak') return Object.assign(o, { file: f, inPak: path.basename(f), entry: rec.entry, size: rec.ent ? rec.ent.size : (rec.size || 0), src: pakSrc(f, rec.ent) });
    const st = stat(f); if (!st || !st.isFile()) throw bad('That layer has no file.', 404);
    return Object.assign(o, { file: f, inPak: null, entry: null, size: st.size, src: fileSrc(f) });
  }
  if (typeof q.rel === 'string' && q.rel) {
    const mod = lib.checkRead(ctx, q.mod);
    if (q.rel.includes('::')) {
      const p = lib.pakTarget(mod, q.rel);
      lib.remoteRead(ctx, p.pf);
      return { name: baseName(p.entry), key: pakKey(p.pr, p.entry), rel: p.rel, layer: null, where: 'mine', mod, file: p.pf, inPak: p.pr, entry: p.entry, size: p.ent.size, src: pakSrc(p.pf, p.ent) };
    }
    const t = lib.target(mod, q.rel, { read: true }), st = stat(t.f);
    if (!st || !st.isFile()) throw bad('No such file in your mod: ' + t.rel, 404);
    lib.remoteRead(ctx, t.f);
    return { name: baseName(t.rel), key: lib.keyOf(t.rel), rel: t.rel, layer: null, where: 'mine', mod, file: t.f, inPak: null, entry: null, size: st.size, src: fileSrc(t.f) };
  }
  if (q.path) {
    if (typeof q.path !== 'string' || q.path.length > 1024 || /\0/.test(q.path) || !path.isAbsolute(q.path)) throw bad('path: a full file path is needed');
    const f = path.resolve(q.path);
    // a problem list names a packed file by the path it would have loose (mods/x/resource/set/a.set held by resource/gamelogic.pak)
    const loc = stat(f) ? null : require('../../../lib/locate').find(f);
    if (q.mod) {
      const mod = lib.checkRead(ctx, q.mod);
      if (loc && loc.pak && inside(loc.pak, mod)) return resolve(ctx, { mod, rel: fwd(path.relative(mod, loc.pak)) + '::' + loc.entry });
      if (inside(f, mod)) return resolve(ctx, { mod, rel: fwd(path.relative(mod, f)) });
    }
    if (loc && loc.pak) {
      lib.remoteRead(ctx, loc.pak);
      return { name: baseName(loc.entry), key: null, rel: null, layer: null, where: 'outside', mod: q.mod || null, file: loc.pak, inPak: path.basename(loc.pak), entry: loc.entry, size: loc.ent.size, src: pakSrc(loc.pak, loc.ent) };
    }
    lib.remoteRead(ctx, f);
    const st = stat(f); if (!st || !st.isFile()) throw bad('No such file.', 404);
    return { name: baseName(f), key: null, rel: null, layer: null, where: 'outside', mod: q.mod || null, file: f, inPak: null, entry: null, size: st.size, src: fileSrc(f) };
  }
  throw bad('Open a file first: rel, key or path is needed.');
}

// ---------------------------------------------------------------- reading
function readAt(file, pos, len) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(len); let got = 0;
    while (got < len) { const n = fs.readSync(fd, b, got, len - got, pos + got); if (n <= 0) break; got += n; }
    return got === len ? b : b.subarray(0, got);
  } finally { fs.closeSync(fd); }
}
// where the packed bytes of a pak entry start (after its local header)
function dataOff(file, ent) {
  const h = readAt(file, ent.off, 30);
  if (h.length < 30 || h.readUInt32LE(0) !== 0x04034b50) throw bad(ent.name + ': the pak is damaged (bad local header).', 415);
  return ent.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
}
// whole file (sync): a loose file or a pak entry
function readAll(src) {
  if (src.type === 'file') return fs.readFileSync(src.file);
  try { return pak.read({ file: src.file }, src.ent); } catch (e) { throw bad('That pak entry cannot be read: ' + e.message, 415); }
}
// inflate cursors: one live stream per deflated entry, kept 60 s, so paging forward goes on from where the last page stopped
const CUR = new Map(), CUR_MAX = 4, CUR_MS = 60000;
function dropCur(k) { const c = CUR.get(k); if (!c) return; CUR.delete(k); clearTimeout(c.tm); try { c.rs.destroy(); c.inf.destroy(); } catch { /* gone */ } }
function newCur(src) {
  const start = dataOff(src.file, src.ent), csize = src.ent.csize;
  const rs = fs.createReadStream(src.file, { start, end: Math.max(start, start + csize - 1), highWaterMark: 1 << 20 });
  const inf = zlib.createInflateRaw({ chunkSize: 1 << 16 });
  rs.on('error', e => inf.destroy(e));
  if (csize > 0) rs.pipe(inf); else { rs.destroy(); inf.end(); }
  return { rs, inf, it: inf[Symbol.asyncIterator](), pos: 0, carry: null, tm: null };
}
async function nextChunk(c) { if (c.carry) { const b = c.carry; c.carry = null; return b; } const r = await c.it.next(); return r.done ? null : r.value; }
async function inflateRange(src, off, len) {
  const k = norm(src.file) + '|' + src.ent.off;
  let c = CUR.get(k), own = false;
  if (c && c.busy) { c = newCur(src); own = true; }   // a second slice of the same entry while one is read: a stream of its own
  else if (c && off < c.pos && c.back && off >= c.backOff && c.backOff + c.back.length === c.pos) {
    // a step back inside the last slice (find next from a hit, the page before): give those bytes again instead of a restart
    const again = c.back.subarray(off - c.backOff);
    c.carry = c.carry ? Buffer.concat([again, c.carry]) : again; c.pos = off; c.back = null;
  }
  else if (!c || off < c.pos) { dropCur(k); c = newCur(src); CUR.set(k, c); while (CUR.size > CUR_MAX) dropCur(CUR.keys().next().value); }
  if (own) {
    const tmp = 'own|' + Math.random(); CUR.set(tmp, c);   // so dropCur can end it
    try { c.busy = true; return await take(c, off, len, tmp); } finally { dropCur(tmp); }
  }
  clearTimeout(c.tm); c.busy = true;
  const buf = await take(c, off, len, k);
  c.busy = false;
  if (CUR.get(k) === c) { c.tm = setTimeout(() => dropCur(k), CUR_MS); if (c.tm.unref) c.tm.unref(); }
  return buf;
}
async function take(c, off, len, k) {
  const out = [], need = off + len;
  try {
    while (c.pos < need) {
      const b = await nextChunk(c);
      if (!b) break;
      const s = c.pos, e = s + b.length;
      if (e > off) out.push(b.subarray(Math.max(0, off - s), Math.min(b.length, need - s)));
      if (e > need) { c.carry = b.subarray(need - s); c.pos = need; } else c.pos = e;
    }
  } catch (e) { dropCur(k); throw bad('That pak entry cannot be read: ' + e.message, 415); }
  const buf = Buffer.concat(out);
  c.back = buf; c.backOff = c.pos - buf.length;   // kept for a step back (see inflateRange)
  return buf;
}
// one slice of the bytes -> Promise<Buffer> (shorter at the end of the file)
async function readRange(src, off, len) {
  const size = src.type === 'file' ? ((stat(src.file) || {}).size || 0) : src.ent.size;
  off = Math.max(0, Math.floor(Number(off) || 0)); len = Math.max(0, Math.min(Math.floor(Number(len) || 0), size - off));
  if (!len) return Buffer.alloc(0);
  if (src.type === 'file') return readAt(src.file, off, len);
  if (src.ent.method === 0) return readAt(src.file, dataOff(src.file, src.ent) + off, len);
  if (src.ent.method !== 8) throw bad(src.ent.name + ': unsupported zip method ' + src.ent.method, 415);
  return inflateRange(src, off, len);
}

// readRef(ctx, q, {max}) -> { buf, name, key, rel, file, inPak, entry, size, where, layer } (sync). Above max (default 64 MB): 413.
function readRef(ctx, q, opt) {
  const max = (opt && opt.max) || MAX_READ, r = resolve(ctx, q);
  if (r.size > max) throw bad('File over ' + Math.round(max / 1048576) + ' MB: too big to load whole (' + r.size + ' bytes).', 413);
  const buf = readAll(r.src);
  return { buf, name: r.name, key: r.key || null, rel: r.rel || null, file: r.file || null, inPak: r.inPak || null, entry: r.entry || null, size: buf.length, where: r.where, layer: r.layer || null };
}

// ---------------------------------------------------------------- neighbour files in the game's layered view (mod over game)
// lib.checkMod, except that a folder with nothing of a mod in it yet (a new mod a guided task fills: no mod.info, resource or
// localization) still reads the game's own files; every other refusal (no folder, zone, phone) stands, as checkMod checks those first.
// No mod at all: null, the game as it ships (lib.readMod)
function modOrEmpty(ctx, mod) {
  try { return lib.readMod(ctx, mod); }
  catch (e) { if (e && /does not look like a mod/.test(String(e.message))) return path.resolve(mod); throw e; }
}
// readKey(ctx, mod, key) -> Buffer | null: the copy the game loads (null when there is none); a phone is asked per file (403).
function readKey(ctx, mod, key, opt) {
  const m = modOrEmpty(ctx, mod), k = keyNorm(key);
  const { chain } = lib.chainFor(ctx, m, k);
  let rec = null; for (let i = chain.length - 1; i >= 0; i--) if (!chain[i].deleted) { rec = chain[i]; break; }
  if (!rec) return null;
  lib.remoteRead(ctx, lib.recFile(rec));
  const max = (opt && opt.max) || MAX_READ;
  if ((rec.size || (rec.ent && rec.ent.size) || 0) > max) throw bad('File over ' + Math.round(max / 1048576) + ' MB: ' + k, 413);
  return rec.source === 'pak' ? readAll(pakSrc(rec.container, rec.ent)) : fs.readFileSync(lib.recFile(rec));
}
const _sorted = new WeakMap();
function sortedKeys(v) { let a = _sorted.get(v); if (!a) { a = Array.from(v.files.keys()).sort(); _sorted.set(v, a); } return a; }
function lowerBound(a, s) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < s) lo = m + 1; else hi = m; } return lo; }
// listKeys(ctx, mod, prefix) -> [key] sorted, every file of the merged view whose key starts with prefix ('resource/' added), at
// most 5000. A mod outside the game folder is not in the index: its loose files under the prefix are added (as files/lib chainFor).
function listKeys(ctx, mod, prefix) {
  const m = lib.readMod(ctx, mod);   // null: no mod, the game as it ships
  let p = names.normalize(String(prefix || '')).replace(/^\.?\/+/, '');
  if (p.split('/').some(x => x === '..')) throw bad('prefix: ".." is not allowed');
  if (!p.startsWith('resource/')) p = 'resource/' + p;
  const out = new Set(), cv = lib.vfsFor(ctx, m);
  if (cv.v) {
    const keys = sortedKeys(cv.v);
    for (let i = lowerBound(keys, p); i < keys.length && keys[i].startsWith(p) && out.size < LIST_CAP; i++) { const r = cv.v.files.get(keys[i]); if (r && !r.deleted) out.add(keys[i]); }
  }
  if (!cv.inMods && m) {
    const dirKey = p.slice(0, p.lastIndexOf('/') + 1), dir = path.join(m, ...dirKey.split('/').filter(Boolean));
    const walk = (d, kp, depth) => {
      if (out.size >= LIST_CAP || depth > 12) return;
      let ents = []; try { lib.remoteRead(ctx, d); ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const k = kp + names.normalize(e.name);
        if (e.isDirectory()) { if (p.startsWith(k + '/') || (k + '/').startsWith(p)) walk(path.join(d, e.name), k + '/', depth + 1); }
        else if (e.isFile() && k.startsWith(p)) out.add(k);
      }
    };
    walk(dir, dirKey, 0);
  }
  return [...out].sort().slice(0, LIST_CAP);
}

module.exports = { resolve, readRange, readAll, readRef, refOfQuery, readKey, listKeys, keyNorm, pakKey, MAX_READ,
  _cursors: () => CUR.size, _dropCursors: () => { for (const k of [...CUR.keys()]) dropCur(k); } };
