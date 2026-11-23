// dxbc: the game's shader cache files (.pso pixel, .vso vertex) and the DXBC container inside them. Read only, no dependencies.
// Cache file = the key as an engine string (a count byte, 0xFF = a 3-byte count follows) then the
// compiled code ( Add); a file that starts with "DXBC" has no key (:306-330 OpenCachedShader).
// Key = "<file stem>[<entry>]$<define>#<value>..." (:231-252 GetCacheFileName), the file name = MD5 of the key (:250).
//   cacheSplit(buf) -> { key, keyLen, codeOff, code }
//   parseKey(key)   -> { file, entry, defines:[[name, value|null]] } | null
//   md5Name(key)    -> [md5 of the key as written, md5 of it in lower case]
//   parse(code)     -> { magic, checksum, size, chunks[{id,off,size}], model{type,major,minor,name}, rdef, isgn, osgn, stat, notes[] }
// No the game.
// Author: Imperator_Aug (ARSENAL, ia-a59283c2)
'use strict';
const crypto = require('crypto');
const TYPES = { 0: 'pixel', 1: 'vertex', 2: 'geometry', 3: 'hull', 4: 'domain', 5: 'compute', 0xfffe: 'vertex', 0xffff: 'pixel', 0x4753: 'geometry', 0x4853: 'hull', 0x4453: 'domain', 0x4353: 'compute' };
const SHORT = { pixel: 'ps', vertex: 'vs', geometry: 'gs', hull: 'hs', domain: 'ds', compute: 'cs' };
const SV = ['', 'POSITION', 'CLIP_DISTANCE', 'CULL_DISTANCE', 'RENDER_TARGET_ARRAY_INDEX', 'VIEWPORT_ARRAY_INDEX', 'VERTEX_ID', 'PRIMITIVE_ID', 'INSTANCE_ID', 'IS_FRONT_FACE', 'SAMPLE_INDEX'];
const CT = ['?', 'uint', 'int', 'float'];
const BIND = ['cbuffer', 'tbuffer', 'texture', 'sampler', 'uav rw typed', 'structured', 'uav rw structured', 'byteaddress', 'uav rw byteaddress', 'uav append structured', 'uav consume structured', 'uav rw structured counter'];
const DIM = ['', 'buffer', '1d', '1d array', '2d', '2d array', '2d ms', '2d ms array', '3d', 'cube', 'cube array', 'buffer ex'];

function cacheSplit(buf) {
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === 'DXBC') return { key: null, keyLen: 0, codeOff: 0, code: buf };
  if (!buf.length) return { key: null, keyLen: 0, codeOff: 0, code: buf };
  let n = buf[0], p = 1;
  if (n === 0xff) { n = buf.length >= 4 ? buf[1] | (buf[2] << 8) | (buf[3] << 16) : 0; p = 4; }
  if (p + n > buf.length) return { key: null, keyLen: n, codeOff: buf.length, code: Buffer.alloc(0), bad: true };
  return { key: buf.toString('latin1', p, p + n), keyLen: n, codeOff: p + n, code: buf.subarray(p + n) };
}
function parseKey(key) {
  const s = String(key || ''), o = s.indexOf('[');
  if (o < 0) return null;
  const c = s.indexOf(']', o + 1);
  if (c < 0) return null;
  const defines = [];
  let rest = s.slice(c + 1);
  while (rest[0] === '$') {
    rest = rest.slice(1);
    const e = rest.search(/[$#]/), name = e < 0 ? rest : rest.slice(0, e);
    rest = e < 0 ? '' : rest.slice(e);
    let value = null;
    if (rest[0] === '#') { const v = rest.indexOf('$', 1); value = v < 0 ? rest.slice(1) : rest.slice(1, v); rest = v < 0 ? '' : rest.slice(v); }
    defines.push([name, value]);
  }
  return { file: s.slice(0, o), entry: s.slice(o + 1, c), defines };
}
const md5 = s => crypto.createHash('md5').update(Buffer.from(s, 'latin1')).digest('hex');
function md5Name(key) { return [md5(key), md5(String(key).toLowerCase())]; }

function cstr(b, off) { if (off < 0 || off >= b.length) return ''; let e = b.indexOf(0, off); if (e < 0) e = b.length; return b.toString('latin1', off, Math.min(e, off + 256)); }

function sig(b, id) {   // ISGN/OSGN 24-byte elements; OSG5 28 (stream first); ISG1/OSG1/PSG1 32 (stream first, min precision last)
  const out = [], n = b.readUInt32LE(0), st = id === 'OSG5' ? 28 : /1$/.test(id) ? 32 : 24, pre = st === 24 ? 0 : 4;
  for (let i = 0; i < n && i < 128; i++) {
    const q = 8 + i * st; if (q + st > b.length) break;
    const m = b[q + pre + 20], mask = 'xyzw'.split('').filter((c, k) => m & (1 << k)).join('');
    out.push({ name: cstr(b, b.readUInt32LE(q + pre)), index: b.readUInt32LE(q + pre + 4), sv: SV[b.readUInt32LE(q + pre + 8)] != null ? SV[b.readUInt32LE(q + pre + 8)] : String(b.readUInt32LE(q + pre + 8)),
      type: CT[b.readUInt32LE(q + pre + 12)] || '?', reg: b.readUInt32LE(q + pre + 16), mask });
  }
  return out;
}
function rdef(b) {
  const o = { cbuffers: [], bindings: [], creator: '', major: b[17], minor: b[16], type: TYPES[b.readUInt16LE(18)] || null };
  const cbN = b.readUInt32LE(0), cbOff = b.readUInt32LE(4), bN = b.readUInt32LE(8), bOff = b.readUInt32LE(12);
  o.creator = cstr(b, b.readUInt32LE(24));
  const rd11 = b.length >= 32 && b.toString('latin1', 28, 32) === 'RD11';
  const bst = 32, vst = rd11 ? 40 : 24;
  for (let i = 0; i < bN && i < 256; i++) {
    const q = bOff + i * bst; if (q + 32 > b.length) break;
    o.bindings.push({ name: cstr(b, b.readUInt32LE(q)), type: BIND[b.readUInt32LE(q + 4)] || String(b.readUInt32LE(q + 4)), dim: DIM[b.readUInt32LE(q + 12)] || '', slot: b.readUInt32LE(q + 20), count: b.readUInt32LE(q + 24) });
  }
  for (let i = 0; i < cbN && i < 64; i++) {
    const q = cbOff + i * 24; if (q + 24 > b.length) break;
    const vn = b.readUInt32LE(q + 4), vo = b.readUInt32LE(q + 8), vars = [];
    for (let k = 0; k < vn && k < 512; k++) { const r = vo + k * vst; if (r + 16 > b.length) break; vars.push({ name: cstr(b, b.readUInt32LE(r)), off: b.readUInt32LE(r + 4), size: b.readUInt32LE(r + 8), used: !!(b.readUInt32LE(r + 12) & 2) }); }
    o.cbuffers.push({ name: cstr(b, b.readUInt32LE(q)), size: b.readUInt32LE(q + 12), vars });
  }
  return o;
}
function parse(code) {
  const o = { magic: code.toString('latin1', 0, 4), checksum: code.length >= 20 ? code.subarray(4, 20).toString('hex') : '', size: 0, chunks: [], model: null, rdef: null, isgn: null, osgn: null, stat: null, notes: [] };
  if (o.magic !== 'DXBC' || code.length < 32) { o.notes.push('notDxbc'); return o; }
  o.size = code.readUInt32LE(24);
  if (o.size !== code.length) o.notes.push('sizeDiffers');
  const n = code.readUInt32LE(28);
  for (let i = 0; i < n && i < 64; i++) {
    const at = 32 + i * 4; if (at + 4 > code.length) break;
    const off = code.readUInt32LE(at); if (off + 8 > code.length) { o.notes.push('chunkPast'); continue; }
    const id = code.toString('latin1', off, off + 4), size = code.readUInt32LE(off + 4);
    o.chunks.push({ id, off, size });
    const b = code.subarray(off + 8, Math.min(code.length, off + 8 + size));
    try {
      if (id === 'RDEF' && b.length >= 28) o.rdef = rdef(b);
      else if (/^(ISGN|ISG1)$/.test(id) && b.length >= 8) o.isgn = sig(b, id);
      else if (/^(OSGN|OSG1|OSG5)$/.test(id) && b.length >= 8) o.osgn = sig(b, id);
      else if ((id === 'SHDR' || id === 'SHEX') && b.length >= 8) {
        const v = b.readUInt32LE(0), t = TYPES[(v >>> 16) & 0xffff] || 'unknown', major = (v >> 4) & 0xf, minor = v & 0xf;
        o.model = { type: t, major, minor, name: (SHORT[t] || '?') + '_' + major + '_' + minor, dwords: b.readUInt32LE(4), ext: id === 'SHEX' };
      } else if (id === 'STAT' && b.length >= 8) o.stat = { instructions: b.readUInt32LE(0), temps: b.readUInt32LE(4) };
    } catch (e) { o.notes.push('chunkBad:' + id); }
  }
  if (!o.model) o.notes.push('noCode');
  return o;
}

module.exports = { cacheSplit, parseKey, md5Name, parse };
