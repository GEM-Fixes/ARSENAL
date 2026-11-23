// corpus: the text files of one mod kept in memory for the text search (files/lib.js search), so a search reads the disk once.
// Measured on a 112k-file mod (37k files that are not binary by extension, about 130 MB of text): the old search read every file
// again on each search, stopped at its 8 s budget or its 30,000-file cap and so missed hits; from memory the scan takes well under 1 s.
//   open(mt, dir, o) -> Promise<C>   o: {skip(rel) -> bool, maxSize}. The file list comes from the shared walk (lib/modtree), never
//     from a walk of its own (PERF.md R1):
//       a walk of this process younger than 15 s and not touched: used as it is
//       an older one, not touched, and a corpus is held: used as it is, a new walk starts in the background, C.asOf = its time
//       touched (a write through the GUI) or nothing held: waits for one walk
//     A file whose size and time are the same as held keeps its bytes; a changed or new one is read again; a gone one is dropped.
//   C.rels   the rel paths the search looks at, in the order of the old walker (folder by folder, names by code unit)
//   C.all    every rel path of the mod (for the keys the mod has)
//   C.buf(rel) -> Buffer | null   sync; reads the file when it is not held yet. null = binary (a zero byte in the first 8 KB),
//     larger than maxSize, or unreadable. A file over 64 KB is read whole only when its head is not binary.
//   C.ascii(rel) -> bool   every byte of the held file is below 128 (kept after the first ask); false when not held
//   C.fill()   loads what is not held yet in the background, 8 files at a time through the thread pool; one run per corpus
//   C.loaded, C.total, C.bytes, C.asOf (ms of the walk when it is an older one, else 0)
//   warm(mt, dir, o) -> {state: 'ready' | 'loading', loaded, total}   open + fill, never throws
//   Memory: one mod at a time (opening another drops the first), dropped after IDLE_MS without a search, at most MAX_BYTES of
//     text (env ARSENAL_CORPUS_MB, default 1024): files past the cap are read from disk on each search, as before.
//   drop() for tests and for a restart.
// Author: Imperator_Aug (ARSENAL, ia-ebdb6c73)
'use strict';
const fs = require('fs'), path = require('path');

const IDLE_MS = 15 * 60 * 1000, HEAD = 8192, HEAD_FROM = 65536, FILL_N = 8, FRESH_MS = 15000;
const MAX_BYTES = (n => (n >= 1 && n <= 65536 ? n : 1024))(Number(process.env.ARSENAL_CORPUS_MB)) * 1024 * 1024;
const keyOf = d => { const p = path.resolve(String(d)).replace(/\\/g, '/'); return process.platform === 'win32' ? p.toLowerCase() : p; };
const isBin = b => b.subarray(0, HEAD).includes(0);
// the old walker's order: per folder, names sorted by code unit, a folder's files at the folder's place
function bySeg(a, b) {
  const x = a.split('/'), y = b.split('/'), n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return x.length - y.length;
}

let CUR = null, timer = null;
function drop() { CUR = null; if (timer) { clearTimeout(timer); timer = null; } }
function used() { if (timer) clearTimeout(timer); timer = setTimeout(drop, IDLE_MS); if (timer.unref) timer.unref(); }

// one file -> Buffer or null, sync
function readOne(f, size, maxSize) {
  if (size > maxSize) return null;
  try {
    if (size > HEAD_FROM) {
      const fd = fs.openSync(f, 'r'); let bin;
      try { const h = Buffer.alloc(HEAD); const n = fs.readSync(fd, h, 0, HEAD, 0); bin = h.subarray(0, n).includes(0); } finally { fs.closeSync(fd); }
      if (bin) return null;
    }
    const b = fs.readFileSync(f);
    return isBin(b) ? null : b;
  } catch (e) { return null; }
}
async function readOneA(f, size, maxSize) {
  if (size > maxSize) return null;
  try {
    if (size > HEAD_FROM) {
      const fh = await fs.promises.open(f, 'r'); let bin;
      try { const h = Buffer.alloc(HEAD); const r = await fh.read(h, 0, HEAD, 0); bin = h.subarray(0, r.bytesRead).includes(0); } finally { await fh.close(); }
      if (bin) return null;
    }
    const b = await fs.promises.readFile(f);
    return isBin(b) ? null : b;
  } catch (e) { return null; }
}

// T (modtree) -> the corpus of dir, keeping the bytes of every file whose size and time did not move
function sync(c, T, o) {
  if (c.sig === T.all) return;
  const old = c.files, files = new Map(), all = new Array(T.files.length), rels = [];
  let bytes = 0, loaded = 0;
  for (let i = 0; i < T.files.length; i++) {
    const r = T.files[i], rel = r[0]; all[i] = rel;
    if (o.skip(rel)) continue;
    const p = old && old.get(rel);
    const e = p && p.s === r[1] && p.m === r[2] ? p : { s: r[1], m: r[2], b: undefined };
    if (e.b !== undefined) { loaded++; if (e.b) bytes += e.b.length; }
    files.set(rel, e); rels.push(rel);
  }
  rels.sort(bySeg);
  c.files = files; c.rels = rels; c.all = all; c.sig = T.all; c.at = T.at; c.bytes = bytes; c.loaded = loaded; c.total = rels.length; c.mine = null;
}

function make(dir, o) {
  const c = { key: keyOf(dir), dir: path.resolve(String(dir)), files: null, rels: [], all: [], sig: '', at: 0, bytes: 0, loaded: 0, total: 0, asOf: 0, mine: null, run: null, maxSize: o.maxSize };
  const hold = (e, b) => {
    if (e.b !== undefined) return e.b;
    if (b && c.bytes + b.length > MAX_BYTES) return b;          // past the cap: not held, read again next time
    e.b = b; c.loaded++; if (b) c.bytes += b.length;
    return b;
  };
  c.buf = rel => {
    const e = c.files.get(rel);
    if (!e) return null;
    if (e.b !== undefined) return e.b;
    return hold(e, readOne(path.join(c.dir, ...rel.split('/')), e.s, c.maxSize));
  };
  c.ascii = rel => {
    const e = c.files.get(rel);
    if (!e || !e.b) return false;
    if (e.a === undefined) { const b = e.b; let a = true; for (let i = 0; i < b.length; i++) if (b[i] > 127) { a = false; break; } e.a = a; }
    return e.a;
  };
  c.fill = () => {
    if (c.run || c.loaded >= c.total) return c.run;
    const run = c.run = (async () => {
      const files = c.files, todo = c.rels.filter(r => files.get(r).b === undefined);
      let i = 0;
      const one = async () => {
        while (i < todo.length && CUR === c && c.files === files && c.bytes < MAX_BYTES) {
          const rel = todo[i++], e = files.get(rel);
          if (e.b !== undefined) continue;
          hold(e, await readOneA(path.join(c.dir, ...rel.split('/')), e.s, c.maxSize));
        }
      };
      await Promise.all(Array.from({ length: FILL_N }, one));
    })().catch(() => {}).then(() => { if (c.run === run) c.run = null; if (CUR === c && c.loaded < c.total && c.bytes < MAX_BYTES) c.fill(); });
    return run;
  };
  return c;
}

async function open(mt, dir, o) {
  const key = keyOf(dir);
  let c = CUR && CUR.key === key ? CUR : null;
  let T = mt.fresh(dir, FRESH_MS), asOf = 0;
  if (!T) {
    const held = c && c.files ? mt.fresh(dir) : null;           // not touched since its walk: good enough to answer from
    if (held) { T = held; asOf = held.at; mt.ensure(dir).catch(() => {}); }
    else T = await mt.ensure(dir);
  }
  if (!c) { c = make(dir, o); CUR = c; }
  c.maxSize = o.maxSize;
  sync(c, T, o);
  c.asOf = asOf;
  used();
  return c;
}

async function warm(mt, dir, o) {
  try {
    const c = await open(mt, dir, o);
    c.fill();
    return { state: c.loaded >= c.total ? 'ready' : 'loading', loaded: c.loaded, total: c.total };
  } catch (e) { return { state: 'failed', loaded: 0, total: 0 }; }
}

module.exports = { open, warm, drop, bySeg, MAX_BYTES, _cur: () => CUR };
