// Author: Imperator_Aug (ARSENAL, ia-11d603bc)
'use strict';
// baseline/extended-sequential JPEG decoder (huffman, 8-bit, any sampling, restart markers). progressive/arith refused.
// decode(buf) -> {width,height,data:Buffer RGB}
const ZZ = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];

function buildHuff(counts, syms) {
  const maxcode = new Int32Array(18).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    valptr[l] = k; mincode[l] = code;
    code += counts[l - 1]; k += counts[l - 1];
    maxcode[l] = counts[l - 1] ? code - 1 : -1;
    code <<= 1;
  }
  return { maxcode, valptr, mincode, syms };
}

const C = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) C[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2;
function idct(blk, out) { // blk: dequantized natural order 64 -> out Uint8 64
  const t = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += C[u * 8 + x] * blk[y * 8 + u]; t[y * 8 + x] = s; }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    let s = 0; for (let v = 0; v < 8; v++) s += C[v * 8 + y] * t[v * 8 + x];
    s = Math.round(s + 128); out[y * 8 + x] = s < 0 ? 0 : s > 255 ? 255 : s;
  }
}

function decode(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('not a JPEG (no SOI)');
  let p = 2; const qt = [], hdc = [], hac = []; let frame = null, ri = 0, adobe = -1;
  let planes = null;
  while (p < buf.length) {
    if (buf[p] !== 0xFF) { p++; continue; }
    const m = buf[p + 1]; p += 2;
    if (m === 0xFF) { p--; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7) || m === 0) continue;
    if (m === 0xD9) break;
    const len = buf.readUInt16BE(p), end = p + len, d = p + 2;
    if (m === 0xDB) {
      let q = d;
      while (q < end) { const pq = buf[q] >> 4, tq = buf[q] & 15; q++; const t = new Int32Array(64);
        for (let i = 0; i < 64; i++) { t[ZZ[i]] = pq ? buf.readUInt16BE(q) : buf[q]; q += pq ? 2 : 1; } qt[tq] = t; }
    } else if (m === 0xC4) {
      let q = d;
      while (q < end) { const tc = buf[q] >> 4, th = buf[q] & 15; q++;
        const counts = [...buf.subarray(q, q + 16)]; q += 16; const n = counts.reduce((a, b) => a + b, 0);
        const h = buildHuff(counts, buf.subarray(q, q + n)); q += n; (tc ? hac : hdc)[th] = h; }
    } else if (m === 0xDD) ri = buf.readUInt16BE(d);
    else if (m === 0xEE && buf.toString('latin1', d, d + 5) === 'Adobe') adobe = buf[d + 11];
    else if (m === 0xC0 || m === 0xC1) {
      if (buf[d] !== 8) throw new Error('unsupported precision ' + buf[d]);
      frame = { h: buf.readUInt16BE(d + 1), w: buf.readUInt16BE(d + 3), comps: [] };
      const n = buf[d + 5];
      for (let i = 0; i < n; i++) frame.comps.push({ id: buf[d + 6 + i * 3], hs: buf[d + 7 + i * 3] >> 4, vs: buf[d + 7 + i * 3] & 15, tq: buf[d + 8 + i * 3] });
    } else if (m === 0xC2 || m === 0xC6 || m === 0xCA || m === 0xCE) throw new Error('progressive JPEG not supported (re-save as baseline)');
    else if (m >= 0xC3 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) throw new Error('unsupported JPEG type SOF' + (m - 0xC0) + ' (arithmetic/lossless)');
    else if (m === 0xDA) {
      if (!frame) throw new Error('SOS before SOF');
      const ns = buf[d], sc = [];
      for (let i = 0; i < ns; i++) { const c = frame.comps.find(c => c.id === buf[d + 1 + i * 2]); if (!c) throw new Error('bad scan component'); c.td = buf[d + 2 + i * 2] >> 4; c.ta = buf[d + 2 + i * 2] & 15; sc.push(c); }
      p = end;
      p = scan(sc);
      continue;
    }
    p = end;
  }
  if (!planes) throw new Error('no image data');

  function scan(sc) {
    const f = frame; const hmax = Math.max(...f.comps.map(c => c.hs)), vmax = Math.max(...f.comps.map(c => c.vs));
    const mcw = Math.ceil(f.w / (8 * hmax)), mch = Math.ceil(f.h / (8 * vmax));
    planes = f.comps.map(c => { const pw = mcw * c.hs * 8, ph = mch * c.vs * 8; c.pw = pw; c.ph = ph; c.pred = 0; return new Uint8Array(pw * ph); });
    let bits = 0, nb = 0, q = p;
    const readBit = () => {
      if (nb === 0) {
        if (q >= buf.length) throw new Error('truncated JPEG');
        let b = buf[q++];
        if (b === 0xFF) { const b2 = buf[q]; if (b2 === 0) q++; else { q--; throw new Error('unexpected marker in scan'); } }
        bits = b; nb = 8;
      }
      nb--; return (bits >> nb) & 1;
    };
    const recv = n => { let v = 0; while (n--) v = (v << 1) | readBit(); return v; };
    const ext = (v, n) => n && v < (1 << (n - 1)) ? v - (1 << n) + 1 : v;
    const hd = h => { let code = 0; for (let l = 1; l <= 16; l++) { code = (code << 1) | readBit(); if (h.maxcode[l] >= 0 && code <= h.maxcode[l] && code >= h.mincode[l]) return h.syms[h.valptr[l] + code - h.mincode[l]]; } throw new Error('bad huffman code'); };
    const blk = new Float64Array(64), out = new Uint8Array(64);
    let cnt = 0;
    const single = sc.length === 1;
    const doBlock = (c, bx, by) => {
      blk.fill(0); const Q = qt[c.tq]; if (!Q) throw new Error('missing quant table');
      const dc = hdc[c.td], ac = hac[c.ta]; if (!dc || !ac) throw new Error('missing huffman table');
      const t = hd(dc); c.pred += ext(recv(t), t); blk[0] = c.pred * Q[0];
      for (let k = 1; k < 64;) {
        const rs = hd(ac), r = rs >> 4, s = rs & 15;
        if (s === 0) { if (r === 15) { k += 16; continue; } break; }
        k += r; if (k > 63) break;
        blk[ZZ[k]] = ext(recv(s), s) * Q[ZZ[k]]; k++;
      }
      idct(blk, out);
      for (let y = 0; y < 8; y++) { const o = (by * 8 + y) * c.pw + bx * 8; for (let x = 0; x < 8; x++) planes[f.comps.indexOf(c)][o + x] = out[y * 8 + x]; }
    };
    const total = single ? Math.ceil(Math.ceil(f.w * sc[0].hs / hmax) / 8) * Math.ceil(Math.ceil(f.h * sc[0].vs / vmax) / 8) : mcw * mch;
    const sw = single ? Math.ceil(Math.ceil(f.w * sc[0].hs / hmax) / 8) : 0;
    for (let m = 0; m < total; m++) {
      if (ri && cnt === ri) {
        nb = 0; while (q < buf.length && !(buf[q] === 0xFF && buf[q + 1] >= 0xD0 && buf[q + 1] <= 0xD7)) q++;
        q += 2; for (const c of f.comps) c.pred = 0; cnt = 0;
      }
      if (single) doBlock(sc[0], m % sw, Math.floor(m / sw));
      else { const mx = m % mcw, my = Math.floor(m / mcw);
        for (const c of sc) for (let v = 0; v < c.vs; v++) for (let h = 0; h < c.hs; h++) doBlock(c, mx * c.hs + h, my * c.vs + v); }
      cnt++;
    }
    while (q < buf.length && !(buf[q] === 0xFF && buf[q + 1] !== 0 && !(buf[q + 1] >= 0xD0 && buf[q + 1] <= 0xD7))) q++;
    return q;
  }

  const f = frame, hmax = Math.max(...f.comps.map(c => c.hs)), vmax = Math.max(...f.comps.map(c => c.vs));
  const data = Buffer.alloc(f.w * f.h * 3), n = f.comps.length;
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v + 0.5 | 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const v = f.comps.map((c, i) => planes[i][Math.floor(y * c.vs / vmax) * c.pw + Math.floor(x * c.hs / hmax)]);
    let r, g, b;
    if (n === 1) r = g = b = v[0];
    else if (n === 3 && adobe !== 0) { const Y = v[0], cb = v[1] - 128, cr = v[2] - 128; r = cl(Y + 1.402 * cr); g = cl(Y - 0.344136 * cb - 0.714136 * cr); b = cl(Y + 1.772 * cb); }
    else { r = v[0]; g = v[1]; b = v[2]; }
    const o = (y * f.w + x) * 3; data[o] = r; data[o + 1] = g; data[o + 2] = b;
  }
  return { width: f.w, height: f.h, data };
}
module.exports = { decode };
