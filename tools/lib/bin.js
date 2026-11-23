// bin: little-endian binary reader for AS2 formats (.ply .anm .vol .dds map.net ...). bounds-checked: any over-read throws BinError
//   const r = new Reader(buf [, pos, end]);  r.u8() u16() u32() i8() i16() i32() f32() f64()  r.skip(n)  r.bytes(n)
//   r.str(n [,enc='latin1'])  fixed-length string;  r.cstr()  NUL-terminated;  r.tag()  4-char id
//   r.lstr(lenBytes=4)  length-prefixed string (len u8|u16|u32|i32 then bytes)
//   r.pos r.end r.left  r.eof()  r.peekTag()  r.sub(n) -> Reader over next n bytes (advances)
//   chunks(buf, pos=0, {end, sizeBytes=4, tagLen=4, sizeIncludesHeader=false}) -> [{ id, start, size, end }]  id+size chunk walk;
//     a chunk running past `end` throws BinError (offset = chunk header start)
// Author: Imperator_Aug (ARSENAL, ia-5afeb8bc)
class BinError extends Error {
  constructor(msg, offset) { super(msg); this.name = 'BinError'; this.offset = offset; }
}

class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.buf = buf; this.pos = pos; this.end = Math.min(end, buf.length); }
  get left() { return this.end - this.pos; }
  eof() { return this.pos >= this.end; }
  need(n) {
    if (!(n >= 0) || this.pos + n > this.end) throw new BinError(`read of ${n} bytes at ${this.pos} runs past end ${this.end}`, this.pos);
  }
  u8() { this.need(1); return this.buf[this.pos++]; }
  i8() { this.need(1); return this.buf.readInt8(this.pos++); }
  u16() { this.need(2); const v = this.buf.readUInt16LE(this.pos); this.pos += 2; return v; }
  i16() { this.need(2); const v = this.buf.readInt16LE(this.pos); this.pos += 2; return v; }
  u32() { this.need(4); const v = this.buf.readUInt32LE(this.pos); this.pos += 4; return v; }
  i32() { this.need(4); const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v; }
  f32() { this.need(4); const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; }
  skip(n) { this.need(n); this.pos += n; return this; }
  bytes(n) { this.need(n); const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  str(n, enc = 'latin1') { return this.bytes(n).toString(enc); }
  tag() { return this.str(4); }
  peekTag() { return this.pos + 4 <= this.end ? this.buf.toString('latin1', this.pos, this.pos + 4) : null; }
  cstr(enc = 'latin1') {
    let e = this.pos;
    while (e < this.end && this.buf[e] !== 0) e++;
    if (e >= this.end) throw new BinError(`unterminated string at ${this.pos}`, this.pos);
    const s = this.buf.toString(enc, this.pos, e);
    this.pos = e + 1;
    return s;
  }
  lstr(lenBytes = 4, enc = 'latin1') {
    const n = lenBytes === 1 ? this.u8() : lenBytes === 2 ? this.u16() : this.i32();
    return this.str(n, enc);
  }
  sub(n) { this.need(n); const r = new Reader(this.buf, this.pos, this.pos + n); this.pos += n; return r; }
}

function chunks(buf, pos = 0, o = {}) {
  const end = Math.min(o.end ?? buf.length, buf.length), sb = o.sizeBytes || 4, tl = o.tagLen || 4, out = [];
  while (pos < end) {
    if (pos + tl + sb > end) throw new BinError(`truncated chunk header at ${pos}`, pos);
    const id = buf.toString('latin1', pos, pos + tl);
    const size = sb === 2 ? buf.readUInt16LE(pos + tl) : buf.readUInt32LE(pos + tl);
    const start = pos + tl + sb, cend = o.sizeIncludesHeader ? pos + size : start + size;
    if (cend > end || cend < start) throw new BinError(`chunk ${JSON.stringify(id)} at ${pos} size ${size} runs past end ${end}`, pos);
    out.push({ id, start, size: cend - start, end: cend });
    pos = cend;
  }
  return out;
}

module.exports = { Reader, BinError, chunks };
