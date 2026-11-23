// view kind misc, server side: an archive opened as a file (.pak, .pat, .zip). Only the central directory is read (tools/lib/pak.js
// list() for a file on disk; for an archive packed inside a pak, the same records through R.readRange), never the whole archive.
// Why this does not fight the explorer: the explorer shows a mod's own pak as a folder (its rows open the entries, viewOf() is null for
// a folder) and its "Open as bytes" forces the hex kind; this kind only answers when an archive is opened as a file (a vanilla pak from
// a search or a problem, a .zip, a pak by path or key, the phone), and it opens entries through the ordinary refs, so an entry opened
// here is the same tab as the one the explorer opens.
//   GET /api/x/view/misc/list?<ref>          -> { name, size, count, files, dirs, total, packed, methods{}, zip64, nested, entries:
//                                                [[name, size, csize, method, dosTime]], cut, open:'ask'|null, why }
//   GET /api/x/view/misc/ref?<ref>&entry=    -> { ref|null, why }: a ref that opens exactly this entry of exactly this archive
//                                                (checked by resolving it): the rel form for a mod's pak, the path form, or
//                                                key + idx (the layer of this archive in the game's view, needs a mod); else
//                                                why not (nested, zip, shadow, dir, none)
// Read only.
// Author: Imperator_Aug (ARSENAL, ia-d70d8e0e)
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../ref'), pak = require('../../../../lib/pak');
const CAP = 60000;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// central directory of an archive read through read(off, len) (async), the rules of lib/pak list() (zip64 too)
async function cdList(read, fsize) {
  const tailLen = Math.min(fsize, 22 + 65535), base = fsize - tailLen, tail = await read(base, tailLen);
  let e = tail.length - 22;
  while (e >= 0 && tail.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw bad('Not an archive: there is no end-of-central-directory record.', 415);
  let n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16), z64 = false;
  if (n === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) {
    const lp = base + e - 20, loc = lp >= 0 ? await read(lp, 20) : null;
    if (!loc || loc.length < 20 || loc.readUInt32LE(0) !== 0x07064b50) throw bad('zip64: no EOCD64 locator.', 415);
    const r = await read(Number(loc.readBigUInt64LE(8)), 56);
    if (r.length < 56 || r.readUInt32LE(0) !== 0x06064b50) throw bad('zip64: bad EOCD64 record.', 415);
    n = Number(r.readBigUInt64LE(32)); cdSize = Number(r.readBigUInt64LE(40)); cdOff = Number(r.readBigUInt64LE(48)); z64 = true;
  }
  if (cdOff + cdSize > fsize) throw bad('The central directory points past the end of the archive.', 415);
  const buf = await read(cdOff, cdSize), ents = [];
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad('Bad central directory entry ' + i + '.', 415);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const ent = { name: buf.toString('latin1', p + 46, p + 46 + nl).replace(/\\/g, '/'), method: buf.readUInt16LE(p + 10), csize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24),
      off: buf.readUInt32LE(p + 42), time: (buf.readUInt16LE(p + 14) << 16 | buf.readUInt16LE(p + 12)) >>> 0 };
    let q = p + 46 + nl; const end = q + xl;
    while (q + 4 <= end) { const id = buf.readUInt16LE(q), len = buf.readUInt16LE(q + 2); if (id === 1) { let k = q + 4; for (const f of ['size', 'csize', 'off']) if (ent[f] === 0xFFFFFFFF && k + 8 <= q + 4 + len) { ent[f] = Number(buf.readBigUInt64LE(k)); k += 8; } z64 = true; break; } q += 4 + len; }
    ents.push(ent); p += 46 + nl + xl + cl;
  }
  ents.zip64 = z64;
  return ents;
}

const CACHE = new Map();
async function entriesOf(r) {
  let mt = 0; try { mt = fs.statSync(r.file).mtimeMs; } catch { /* gone */ }
  const k = r.file + '|' + (r.entry || '') + '|' + r.size + '|' + mt;
  if (CACHE.has(k)) return CACHE.get(k);
  let ents;
  if (r.src.type === 'file') {
    try { ents = pak.list(r.file); } catch (e) { throw bad('Not an archive, or a damaged one: ' + e.message, 415); }
    ents.zip64 = ents.some(e => e.size > 0xFFFFFFFE || e.csize > 0xFFFFFFFE || e.off > 0xFFFFFFFE);
  } else ents = await cdList((off, len) => R.readRange(r.src, off, len), r.size);
  if (CACHE.size >= 4) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, ents);
  return ents;
}

async function list(url, body, ctx) {
  const r = R.resolve(ctx, R.refOfQuery(url)), ents = await entriesOf(r);
  const o = { name: r.name, size: r.size, count: ents.length, files: 0, dirs: 0, total: 0, packed: 0, methods: {}, zip64: !!ents.zip64, nested: r.src.type !== 'file',
    entries: [], cut: false, open: r.src.type === 'file' ? 'ask' : null, why: r.src.type === 'file' ? null : 'nested' };
  for (const e of ents) {
    if (e.name.endsWith('/')) o.dirs++; else { o.files++; o.total += e.size; o.packed += e.csize; o.methods[e.method] = (o.methods[e.method] || 0) + 1; }
    if (o.entries.length < CAP) o.entries.push([e.name, e.size, e.csize, e.method, e.time]); else o.cut = true;
  }
  return o;
}

// the refs that could open this entry, checked by resolving each one: it must land on this archive and this entry
async function ref(url, body, ctx) {
  const q = R.refOfQuery(url), entry = url.searchParams.get('entry') || '';
  if (!entry || entry.length > 1024 || /\0/.test(entry)) throw bad('entry: an entry name from the list is needed');
  const r = R.resolve(ctx, q);
  if (r.src.type !== 'file') return { ref: null, why: 'nested' };
  const ents = await entriesOf(r), ent = ents.find(e => e.name === entry);
  if (!ent) throw bad('No such entry in that archive.', 404);
  if (entry.endsWith('/')) return { ref: null, why: 'dir' };
  const cand = [], dir = path.dirname(r.file), segs = entry.split('/').filter(Boolean);
  if (r.rel && r.where === 'mine') cand.push({ mod: r.mod, rel: r.rel + '::' + entry });
  const withMod = o => (q.mod ? Object.assign({ mod: q.mod }, o) : o);
  if (/\.pat$/i.test(r.file)) cand.push(withMod({ path: path.join(dir, 'resource', ...segs) }));
  cand.push(withMod({ path: path.join(dir, ...segs) }));
  if (/^resource\.pak$/i.test(path.basename(r.file))) cand.push(withMod({ path: path.join(dir, 'resource', ...segs) }));
  // the game's layered view: the layer of this key that is this archive (a loose folder of the same name stops the path form)
  if (q.mod) {
    try {
      const lib = require('../../files/lib'), key = R.keyNorm(entry), { chain } = lib.chainFor(ctx, lib.checkRead(ctx, q.mod), key);
      const same = f => path.resolve(f).toLowerCase() === path.resolve(r.file).toLowerCase();
      const idx = chain.findIndex(c => c && !c.deleted && c.source === 'pak' && same(lib.recFile(c)) && String(c.entry).toLowerCase() === entry.toLowerCase());
      if (idx >= 0) cand.push({ mod: q.mod, key, idx: String(idx) });
    } catch { /* no layered view for this name */ }
  }
  let shadow = false;
  for (const c of cand) {
    let t; try { t = R.resolve(ctx, c); } catch { continue; }
    const same = path.resolve(t.file).toLowerCase() === path.resolve(r.file).toLowerCase();
    if (same && t.entry === ent.name) return { ref: c, why: null };
    shadow = true;
  }
  return { ref: null, why: /\.zip$/i.test(r.file) ? 'zip' : shadow ? 'shadow' : 'none' };
}

module.exports = {
  exts: ['pak', 'pat', 'zip'],
  routes: { 'GET /api/x/view/misc/list': list, 'GET /api/x/view/misc/ref': ref },
  remote: ['GET /api/x/view/misc/list', 'GET /api/x/view/misc/ref'],
  cdList,
};
