// gridfile: mapviz grid files (.mvg), the binary layout of tools/mapviz/README.md section 4.1, and the in-memory grid
// object of section 4.3. Sync, no state, node built-ins only. Every other mapviz part reads and writes grids through here.
//   ETYPES                    {u8, i8, u16, i16, u32, i32, f32, rgba8} -> {name, id, bytes (per element), Array}
//   ETYPE_BY_ID               [id] -> the same entry (ids 1..8)
//   FLAGS                     {NODATA: 1, BITS: 2}   header flag bits
//   FIXED                     72, header bytes before the name
//   encode(grid) -> Buffer    header + data; refuses a bad grid (Error codes GRIDFILE_GRID, GRIDFILE_DATA, GRIDFILE_META)
//   decode(buf) -> grid       refuses: GRIDFILE_MAGIC, GRIDFILE_VERSION, GRIDFILE_SIZE, GRIDFILE_ETYPE, GRIDFILE_HEADER,
//                             GRIDFILE_META (the codes are stable; the page and the CLI map them, never the message)
//   decodeHeader(buf, total?) -> {grid (data null), hdrBytes, flags, dataBytes}; total = file size (default buf.length)
//   dataBlock(buf) -> Buffer  the raw little-endian data block of a checked file (section 5.1 envelope)
//   write(file, grid) -> file atomic: temp file in the same folder, then rename
//   read(file) -> grid
//   readHeader(file) -> grid with data null (reads the header bytes only; checks the size against the file's size)
//   elementSize(etype) -> bytes per element (rgba8 4);  dataBytes(grid) -> w * h * elementSize
// Grid object: {name, w, h, cell, ox, oy, etype, sample: 'cell'|'lattice', scale, offset, nodata: number|null, meta, data}.
// rgba8 data is a Uint8ClampedArray of w*h*4. Files are little endian on any host. scale and offset are f32 in the file,
// so a decoded value is Math.fround of the written one. Flag bit 1 (bit mask) is written when meta.bits is an array and
// etype is u8 or u32; it is not a field of the grid object (meta.bits carries it).
// Author: Imperator_Aug (ARSENAL, ia-fe1aef7b)
'use strict';
const fs = require('fs'), path = require('path');

const MAGIC = 'MVG1';
const VERSION = 1;
const FIXED = 72;
const FLAGS = Object.freeze({ NODATA: 1, BITS: 2 });
const ETYPES = Object.freeze({
  u8: Object.freeze({ name: 'u8', id: 1, bytes: 1, Array: Uint8Array }),
  i8: Object.freeze({ name: 'i8', id: 2, bytes: 1, Array: Int8Array }),
  u16: Object.freeze({ name: 'u16', id: 3, bytes: 2, Array: Uint16Array }),
  i16: Object.freeze({ name: 'i16', id: 4, bytes: 2, Array: Int16Array }),
  u32: Object.freeze({ name: 'u32', id: 5, bytes: 4, Array: Uint32Array }),
  i32: Object.freeze({ name: 'i32', id: 6, bytes: 4, Array: Int32Array }),
  f32: Object.freeze({ name: 'f32', id: 7, bytes: 4, Array: Float32Array }),
  rgba8: Object.freeze({ name: 'rgba8', id: 8, bytes: 4, Array: Uint8ClampedArray }),
});
const ETYPE_BY_ID = Object.freeze([null].concat(Object.keys(ETYPES).map(k => ETYPES[k]).sort((a, b) => a.id - b.id)));
const SAMPLES = ['cell', 'lattice'];
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function fail(code, msg) { const e = new Error('grid file: ' + msg); e.code = code; return e; }
function elementSize(etype) { const t = ETYPES[etype]; if (!t) throw fail('GRIDFILE_GRID', 'unknown etype ' + etype); return t.bytes; }
function count(grid) { return grid.w * grid.h * (grid.etype === 'rgba8' ? 4 : 1); }   // typed array elements
function dataBytes(grid) { return grid.w * grid.h * elementSize(grid.etype); }
const isUint32 = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isFin = v => typeof v === 'number' && Number.isFinite(v);

// JSON with every non-ASCII UTF-16 unit as \uXXXX (surrogate pairs become two escapes, which JSON reads back as one char)
function asciiJson(v) {
  return JSON.stringify(v).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function checkGrid(g) {
  if (!g || typeof g !== 'object') throw fail('GRIDFILE_GRID', 'no grid object');
  if (typeof g.name !== 'string' || !/^[\x21-\x7e]+$/.test(g.name)) throw fail('GRIDFILE_GRID', 'name must be printable ASCII without spaces: ' + JSON.stringify(g.name));
  if (!isUint32(g.w) || !isUint32(g.h)) throw fail('GRIDFILE_GRID', 'w and h must be integers 0..2^32-1');
  if (!ETYPES[g.etype]) throw fail('GRIDFILE_GRID', 'etype must be one of ' + Object.keys(ETYPES).join(' ') + ', not ' + g.etype);
  if (SAMPLES.indexOf(g.sample) < 0) throw fail('GRIDFILE_GRID', "sample must be 'cell' or 'lattice', not " + g.sample);
  if (!isFin(g.cell) || !(g.cell > 0)) throw fail('GRIDFILE_GRID', 'cell must be a number > 0');
  if (!isFin(g.ox) || !isFin(g.oy)) throw fail('GRIDFILE_GRID', 'ox and oy must be finite numbers');
  if (g.scale != null && !isFin(g.scale)) throw fail('GRIDFILE_GRID', 'scale must be a finite number');
  if (g.offset != null && !isFin(g.offset)) throw fail('GRIDFILE_GRID', 'offset must be a finite number');
  if (g.nodata != null && typeof g.nodata !== 'number') throw fail('GRIDFILE_GRID', 'nodata must be a number or null');
  if (g.meta != null && (typeof g.meta !== 'object' || Array.isArray(g.meta))) throw fail('GRIDFILE_META', 'meta must be an object');
  const T = ETYPES[g.etype], d = g.data;
  const okType = d instanceof T.Array || (g.etype === 'rgba8' && d instanceof Uint8Array);
  if (!okType) throw fail('GRIDFILE_DATA', 'data must be a ' + T.Array.name + ' for etype ' + g.etype);
  if (d.length !== count(g)) throw fail('GRIDFILE_DATA', 'data holds ' + d.length + ' elements, w*h' + (g.etype === 'rgba8' ? '*4' : '') + ' = ' + count(g));
}

function encode(grid) {
  checkGrid(grid);
  const T = ETYPES[grid.etype];
  const name = Buffer.from(grid.name, 'latin1');
  let mj;   // meta JSON cannot write (circular, BigInt, toJSON -> undefined) or that is not an object (a Date) is refused here
  try { mj = asciiJson(grid.meta == null ? {} : grid.meta); } catch (e) { throw fail('GRIDFILE_META', 'meta is not JSON: ' + e.message); }
  if (typeof mj !== 'string' || mj[0] !== '{') throw fail('GRIDFILE_META', 'meta must serialise to a JSON object');
  const meta = Buffer.from(mj, 'latin1');
  const hdr = Math.ceil((FIXED + name.length + meta.length) / 8) * 8;
  if (hdr > 0xffff || name.length > 0xffff || meta.length > 0xffff) throw fail('GRIDFILE_META', 'name and meta do not fit a 65535 byte header (' + hdr + ')');
  const nb = dataBytes(grid);
  const buf = Buffer.alloc(hdr + nb);          // zero filled: reserved fields and the pad stay 0
  let flags = 0;
  if (grid.nodata != null) flags |= FLAGS.NODATA;
  if (grid.meta && Array.isArray(grid.meta.bits) && (grid.etype === 'u8' || grid.etype === 'u32')) flags |= FLAGS.BITS;
  buf.write(MAGIC, 0, 'latin1');
  buf.writeUInt16LE(VERSION, 4);
  buf.writeUInt16LE(hdr, 6);
  buf.writeUInt32LE(grid.w, 8);
  buf.writeUInt32LE(grid.h, 12);
  buf.writeDoubleLE(grid.cell, 16);
  buf.writeDoubleLE(grid.ox, 24);
  buf.writeDoubleLE(grid.oy, 32);
  buf.writeUInt8(T.id, 40);
  buf.writeUInt8(grid.sample === 'lattice' ? 1 : 0, 41);
  buf.writeUInt16LE(flags, 42);
  buf.writeFloatLE(grid.scale == null ? 1 : grid.scale, 44);
  buf.writeFloatLE(grid.offset == null ? 0 : grid.offset, 48);
  buf.writeUInt32LE(0, 52);
  buf.writeDoubleLE(grid.nodata == null ? 0 : grid.nodata, 56);
  buf.writeUInt16LE(name.length, 64);
  buf.writeUInt16LE(meta.length, 66);
  buf.writeUInt32LE(0, 68);
  name.copy(buf, FIXED);
  meta.copy(buf, FIXED + name.length);
  const d = grid.data;
  if (HOST_LE || T.Array.BYTES_PER_ELEMENT === 1) Buffer.from(d.buffer, d.byteOffset, nb).copy(buf, hdr);
  else leWrite(buf, hdr, d, T);
  return buf;
}

// The element-wise little-endian path a big-endian host takes for 2 and 4 byte etypes (the test runs it on any host).
function leWrite(buf, at, d, T) {
  const dv = new DataView(buf.buffer, buf.byteOffset + at, d.length * T.bytes);
  for (let i = 0; i < d.length; i++) {
    const o = i * T.bytes;
    if (T.name === 'u16') dv.setUint16(o, d[i], true); else if (T.name === 'i16') dv.setInt16(o, d[i], true);
    else if (T.name === 'u32') dv.setUint32(o, d[i], true); else if (T.name === 'i32') dv.setInt32(o, d[i], true);
    else dv.setFloat32(o, d[i], true);
  }
}
function leRead(ab, T) {
  const dv = new DataView(ab), n = ab.byteLength / T.bytes, a = new T.Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * T.bytes;
    a[i] = T.name === 'u16' ? dv.getUint16(o, true) : T.name === 'i16' ? dv.getInt16(o, true) : T.name === 'u32' ? dv.getUint32(o, true)
      : T.name === 'i32' ? dv.getInt32(o, true) : dv.getFloat32(o, true);
  }
  return a;
}

// header checks, in the order of section 4.1's refusals; total = the whole file's size
function decodeHeader(buf, total) {
  if (!Buffer.isBuffer(buf)) {
    if (!(buf instanceof Uint8Array)) throw fail('GRIDFILE_HEADER', 'not a Buffer');
    buf = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  }
  if (total == null) total = buf.length;
  if (buf.length < 4 || buf.toString('latin1', 0, 4) !== MAGIC) throw fail('GRIDFILE_MAGIC', 'not a grid file (magic is not MVG1)');
  if (buf.length < FIXED) throw fail('GRIDFILE_HEADER', 'header cut short (' + buf.length + ' of ' + FIXED + ' bytes)');
  const version = buf.readUInt16LE(4);
  if (version > VERSION || version < 1) throw fail('GRIDFILE_VERSION', 'grid file version ' + version + ' (this reader knows 1)');
  const id = buf.readUInt8(40);
  if (id < 1 || id > 8) throw fail('GRIDFILE_ETYPE', 'etype ' + id + ' outside 1..8');
  const T = ETYPE_BY_ID[id];
  const hdr = buf.readUInt16LE(6), w = buf.readUInt32LE(8), h = buf.readUInt32LE(12);
  const nameLen = buf.readUInt16LE(64), metaLen = buf.readUInt16LE(66);
  if (hdr % 8 || hdr < FIXED + nameLen + metaLen) throw fail('GRIDFILE_HEADER', 'header size ' + hdr + ' is not a multiple of 8 holding name and meta');
  const dataLen = w * h * T.bytes;
  if (total !== hdr + dataLen) throw fail('GRIDFILE_SIZE', 'file size ' + total + ', header + data = ' + (hdr + dataLen));
  if (buf.length < hdr) throw fail('GRIDFILE_HEADER', 'header cut short (' + buf.length + ' of ' + hdr + ' bytes)');
  const sampleId = buf.readUInt8(41);
  if (sampleId > 1) throw fail('GRIDFILE_HEADER', 'sample ' + sampleId + ' is neither 0 cell nor 1 lattice');
  const flags = buf.readUInt16LE(42);
  let meta;
  try { meta = JSON.parse(buf.toString('latin1', FIXED + nameLen, FIXED + nameLen + metaLen)); }
  catch (e) { throw fail('GRIDFILE_META', 'meta is not JSON: ' + e.message); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw fail('GRIDFILE_META', 'meta is not a JSON object');
  const grid = {
    name: buf.toString('latin1', FIXED, FIXED + nameLen),
    w, h,
    cell: buf.readDoubleLE(16),
    ox: buf.readDoubleLE(24),
    oy: buf.readDoubleLE(32),
    etype: T.name,
    sample: SAMPLES[sampleId],
    scale: buf.readFloatLE(44),
    offset: buf.readFloatLE(48),
    nodata: flags & FLAGS.NODATA ? buf.readDoubleLE(56) : null,
    meta,
    data: null,
  };
  return { grid, hdrBytes: hdr, flags, dataBytes: dataLen };
}

function dataBlock(buf) {
  const H = decodeHeader(buf);
  return buf.subarray(H.hdrBytes, H.hdrBytes + H.dataBytes);
}

function decode(buf) {
  const H = decodeHeader(buf), g = H.grid, T = ETYPES[g.etype];
  const ab = new ArrayBuffer(H.dataBytes);                  // own, aligned memory
  Buffer.from(ab).set(buf.subarray(H.hdrBytes, H.hdrBytes + H.dataBytes));
  g.data = !HOST_LE && T.Array.BYTES_PER_ELEMENT > 1 ? leRead(ab, T) : new T.Array(ab);
  return g;
}

function write(file, grid) {
  const buf = encode(grid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp' + process.pid;
  try { fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* tmp never made */ } throw e; }
  return file;
}

function read(file) { return decode(fs.readFileSync(file)); }

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    let buf = Buffer.alloc(Math.min(FIXED, total));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (buf.length === FIXED && buf.toString('latin1', 0, 4) === MAGIC) {
      const hdr = buf.readUInt16LE(6);
      if (hdr > FIXED && hdr <= total) { buf = Buffer.alloc(hdr); fs.readSync(fd, buf, 0, hdr, 0); }
    }
    return decodeHeader(buf, total).grid;
  } finally { fs.closeSync(fd); }
}

module.exports = { ETYPES, ETYPE_BY_ID, FLAGS, FIXED, MAGIC, VERSION, encode, decode, decodeHeader, dataBlock, write, read, readHeader, elementSize, dataBytes,
  _le: { write: leWrite, read: leRead } };   // test hook: the big-endian host path
