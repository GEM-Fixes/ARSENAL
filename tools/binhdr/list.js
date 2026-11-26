// binhdr reading helpers: one async listing per mod of only what the game mounts, and a read-ahead pool of files or header ranges.
//   listMounted(modDir) -> Promise<T>  a lib/vfs opts.listings scan ({dir, files: [[rel, size, mtimeMs]], left: [rel]}) of the
//     mounted roots only: resource/, localization/, localizations/ (any case) walked in full, every other root folder (e.g.
//     .arsenal-undo restore points, .git, notes) put in `left` and never entered; root files listed (N.pat, resource.pak, ...).
//     Links and junctions go in `left` (vfs asks the disk for them, as its own walk). Folders listed and files stat'ed WINDOW at a time.
//   walkLoose(resDir) -> Promise<[[rel, size]]>  the --folder walk: same order as a recursive fs.readdirSync walk (readdir order,
//     depth first), stats WINDOW at a time.
//   ahead(items, readFn, window) -> async generator of [item, value|Error] in item order, readFn(item) run up to `window` ahead.
//   readWhole(path) / readHead(path, n) -> Promise<Buffer> (head: the first n bytes, fewer when the file is shorter).
//   wavHead(path) -> Promise<{len, at(p, n)}>: the file length and its chunk headers, read in 64 KB blocks as the chunk walk needs.
//   WINDOW = env ARSENAL_READ_WINDOW (default 32).
// Author: Imperator_Aug (ARSENAL, ia-bafc6711)
'use strict';
const fs = require('fs'), fsp = fs.promises, path = require('path');

const WINDOW = Math.max(1, parseInt(process.env.ARSENAL_READ_WINDOW, 10) || 32);
const MOUNTED = /^(resource|localizations?)$/i;

// run fn over items, at most n at a time; results in item order
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const lane = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
  return out;
}

async function listMounted(modDir, o = {}) {
  const dir = path.resolve(modDir), W = o.window || WINDOW, files = [], left = [];
  // dirs to list, breadth first in waves; each entry: rel ('' = root)
  let wave = [''];
  while (wave.length) {
    const lists = await pool(wave, W, async rel => { try { return await fsp.readdir(path.join(dir, rel), { withFileTypes: true }); } catch (e) { if (!rel) throw e; return []; } });
    const next = [], stats = [];
    wave.forEach((rel, wi) => {
      for (const e of lists[wi]) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isSymbolicLink()) left.push(r);
        else if (e.isDirectory()) { if (rel || MOUNTED.test(e.name)) next.push(r); else left.push(r); }
        else if (e.isFile()) stats.push(r);
        else left.push(r);
      }
    });
    const st = await pool(stats, W, async r => { try { return await fsp.stat(path.join(dir, r)); } catch (e) { return null; } });
    stats.forEach((r, k) => { if (st[k]) files.push([r, st[k].size, st[k].mtimeMs]); });
    wave = next;
  }
  return { dir, files, left };
}

async function walkLoose(resDir, o = {}) {
  const W = o.window || WINDOW, out = [];
  // tree of readdir results, listed level by level, then flattened depth first in readdir order
  const kids = new Map();
  let wave = [''];
  while (wave.length) {
    const lists = await pool(wave, W, async rel => { try { return await fsp.readdir(path.join(resDir, rel), { withFileTypes: true }); } catch (e) { return []; } });
    const next = [];
    wave.forEach((rel, wi) => { kids.set(rel, lists[wi]); for (const e of lists[wi]) if (e.isDirectory()) next.push(rel ? rel + '/' + e.name : e.name); });
    wave = next;
  }
  const flat = [];
  (function walk(rel) { for (const e of kids.get(rel) || []) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(r); else flat.push(r); } })('');
  const st = await pool(flat, W, async r => { try { return await fsp.stat(path.join(resDir, r)); } catch (e) { return e; } });
  flat.forEach((r, k) => out.push([r, st[k]]));
  return out;
}

// o.weight(item) -> bytes it will hold (default 0): no new read starts while the reads in flight or not yet taken hold more than
// o.cap (256 MB), one always runs (a 90 MB GoH map.net x 32 would not fit in memory)
async function* ahead(items, readFn, window = WINDOW, o = {}) {
  const q = [], wt = o.weight || (() => 0), cap = o.cap || 268435456;
  let next = 0, held = 0;
  const start = () => { const it = items[next++], w = +wt(it) || 0; held += w; q.push(Promise.resolve().then(() => readFn(it)).then(v => [it, v, w], e => [it, e instanceof Error ? e : new Error(String(e)), w])); };
  const fill = () => { while (next < items.length && q.length < window && (!q.length || held < cap)) start(); };
  fill();
  while (q.length) {
    const [it, v, w] = await q.shift();
    held -= w;
    fill();
    yield [it, v];
  }
}

const readWhole = p => fsp.readFile(p);
async function readHead(p, n) {
  const fh = await fsp.open(p, 'r');
  try {
    const buf = Buffer.alloc(n);
    let got = 0;
    while (got < n) { const { bytesRead } = await fh.read(buf, got, n - got, got); if (!bytesRead) break; got += bytesRead; }
    return got < n ? buf.subarray(0, got) : buf;
  } finally { await fh.close(); }
}

// .wav: the length plus every 8-byte chunk header the walk of misc.checkWav visits (12, then 8 + size + pad on), prefetched
const BLK = 65536;
async function wavHead(p) {
  const fh = await fsp.open(p, 'r');
  try {
    const len = (await fh.stat()).size, blocks = new Map();
    const block = async b => { if (blocks.has(b)) return; const buf = Buffer.alloc(Math.min(BLK, len - b * BLK)); let got = 0; while (got < buf.length) { const { bytesRead } = await fh.read(buf, got, buf.length - got, b * BLK + got); if (!bytesRead) break; got += bytesRead; } blocks.set(b, buf.subarray(0, got)); };
    const need = async (q, n) => { for (let b = Math.floor(q / BLK); b <= Math.floor((q + n - 1) / BLK); b++) await block(b); };
    const at = (q, n) => { const out = Buffer.alloc(n); for (let i = 0; i < n; i++) { const b = blocks.get(Math.floor((q + i) / BLK)); out[i] = b ? b[(q + i) % BLK] : 0; } return out; };
    if (len >= 12) {
      await need(0, 12);
      if (at(0, 4).toString('latin1') === 'RIFF' && at(8, 4).toString('latin1') === 'WAVE') {
        let q = 12;
        while (q + 8 <= len) { await need(q, 8); const sz = at(q + 4, 4).readUInt32LE(0); q += 8 + sz + (sz & 1); }
      }
    }
    return { len, at };
  } finally { await fh.close(); }
}

// sparse(p, probe) -> Promise<{buf, mkReader}>: a buffer of the file's full length with only the ranges a check reads filled in.
//   probe(buf, mkReader) runs the check (findings to a sink); mkReader(buf, pos) gives a lib/bin Reader whose reads of a range not
//   read yet throw NeedMore (skips only check the bounds), so the probe is run again after each missing range is read (64 KB at
//   least). When the probe ends (or throws anything else, which the real run then throws the same way: every byte it read is
//   filled), the real check run on buf with mkReader reads the same bytes. Used for big .ply (VERT data skipped) and map.net
//   (only header + MAP0/MAP1/GRID tables needed). More than 64 rounds: the rest of the file is read whole.
const { Reader } = require('../lib/bin');
class NeedMore extends Error { constructor(pos, n) { super(`binhdr sparse: ${n} bytes at ${pos} not read`); this.pos = pos; this.n = n; } }
async function sparse(p, probe, o = {}) {
  const fh = await fsp.open(p, 'r');
  try {
    const len = (await fh.stat()).size, buf = Buffer.alloc(len), have = [];   // have: [start, end) ranges read
    const covered = (q, n) => { if (n <= 0) return true; for (const [a, b] of have) if (q >= a && q + n <= b) return true; return false; };
    const fill = async (q, n) => {
      const a = Math.max(0, q), b = Math.min(len, Math.max(q + n, q + (o.block || BLK)));
      let got = 0;
      while (a + got < b) { const { bytesRead } = await fh.read(buf, a + got, b - a - got, a + got); if (!bytesRead) break; got += bytesRead; }
      have.push([a, a + got]);
    };
    const mkReader = (b, pos, end) => {
      const r = new Reader(b, pos, end);
      r.need = function (n) { Reader.prototype.need.call(this, n); if (!covered(this.pos, n)) throw new NeedMore(this.pos, n); };
      r.skip = function (n) { Reader.prototype.need.call(this, n); this.pos += n; return this; };
      return r;
    };
    await fill(0, o.head || BLK);
    for (let round = 0; ; round++) {
      try { probe(buf, mkReader); break; } catch (e) {
        if (!(e instanceof NeedMore)) break;
        if (round >= 64) { await fill(0, len); break; }
        await fill(e.pos, e.n);
      }
    }
    return { buf, mkReader };
  } finally { await fh.close(); }
}

module.exports = { WINDOW, MOUNTED, pool, listMounted, walkLoose, ahead, readWhole, readHead, wavHead, sparse, NeedMore };
