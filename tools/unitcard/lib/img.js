// unitcard/img: pure-node picture work for unit cards. Picture = { w, h, d: Uint8Array RGBA, straight alpha }.
//   decode(buf, name?) -> picture | throws    PNG (all bit depths, palette, tRNS, Adam7), TGA, DDS, BMP, JPG (baseline, via shotcrop/jpeg)
//   png(pic) -> Buffer   RGBA PNG          tga(pic) -> Buffer  32-bit uncompressed TGA, bottom-up, alpha 8 bits (as vanilla unit_icon)
//   dds(pic) -> Buffer   DXT1 (opaque) through lib/model/ddsenc (only for sizes that are multiples of 4)
//   blank(w,h,rgba?) copy(p) crop(p,x,y,w,h) mirror(p) resize(p,w,h)   resize = premultiplied separable Lanczos-3 (area-aware when shrinking)
//   bbox(p, minA) -> [x,y,w,h] | null       fit(p, W, H, o) -> picture W x H (o.mode contain|cover|crop, o.box, o.scale, o.dx, o.dy, o.margin, o.anchor)
//   over(dst, src, x, y, opacity) in place   key(p, rgb, tol, soft) background removal by colour, keyEdge(p, tol) by the corner colour
//   lut(p, L, mask?) per-channel tables     grey(p) silhouette(p, rgb) outline(p, rgb, r) shadow(p, dx, dy, blur, opacity, rgb) blur(p, r)
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-7331418f)
'use strict';
const zlib = require('zlib');
const path = require('path');

function blank(w, h, c) {
  const d = new Uint8Array(w * h * 4);
  if (c) for (let i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3]; }
  return { w, h, d };
}
function copy(p) { return { w: p.w, h: p.h, d: new Uint8Array(p.d) }; }

// ---------- PNG ----------
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePng(buf) {
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('not a PNG');
  let o = 8, w = 0, h = 0, bd = 8, ct = 6, il = 0, pal = null, trns = null; const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), dat = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); bd = dat[8]; ct = dat[9]; il = dat[12]; }
    else if (type === 'PLTE') pal = dat;
    else if (type === 'tRNS') trns = dat;
    else if (type === 'IDAT') idat.push(dat);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!w || !h) throw new Error('PNG without a header');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error('PNG colour type ' + ct + ' unknown');
  const bpp = Math.max(1, (ch * bd) >> 3), out = new Uint8Array(w * h * 4);
  let pos = 0;
  const pass = (x0, y0, dx, dy) => {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) return;
    const stride = Math.ceil(pw * ch * bd / 8);
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let y = 0; y < ph; y++) {
      const f = raw[pos++];
      for (let i = 0; i < stride; i++) {
        const x = raw[pos + i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v;
        if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        cur[i] = v & 255;
      }
      pos += stride;
      for (let x = 0; x < pw; x++) {
        const s = sample(cur, x, ch, bd), di = ((y0 + y * dy) * w + x0 + x * dx) * 4;
        put(out, di, s, ct, bd, pal, trns);
      }
      const t = prev; prev = cur; cur = t;
    }
  };
  if (il) { pass(0, 0, 8, 8); pass(4, 0, 8, 8); pass(0, 4, 4, 8); pass(2, 0, 4, 4); pass(0, 2, 2, 4); pass(1, 0, 2, 2); pass(0, 1, 1, 2); }
  else pass(0, 0, 1, 1);
  return { w, h, d: out };
}
function sample(row, x, ch, bd) {
  const s = new Array(ch);
  for (let c = 0; c < ch; c++) {
    if (bd === 8) s[c] = row[x * ch + c];
    else if (bd === 16) { const i = (x * ch + c) * 2; s[c] = (row[i] << 8) | row[i + 1]; }
    else { const bit = (x * ch + c) * bd, by = row[bit >> 3], sh = 8 - bd - (bit & 7); s[c] = (by >> sh) & ((1 << bd) - 1); }
  }
  return s;
}
function put(out, di, s, ct, bd, pal, trns) {
  const max = (1 << bd) - 1, sc = v => (bd === 8 ? v : bd === 16 ? v >> 8 : Math.round(v * 255 / max));
  if (ct === 3) {
    const i = s[0]; out[di] = pal ? pal[i * 3] : 0; out[di + 1] = pal ? pal[i * 3 + 1] : 0; out[di + 2] = pal ? pal[i * 3 + 2] : 0;
    out[di + 3] = trns && i < trns.length ? trns[i] : 255; return;
  }
  if (ct === 0 || ct === 4) {
    const g = sc(s[0]); out[di] = out[di + 1] = out[di + 2] = g;
    out[di + 3] = ct === 4 ? sc(s[1]) : (trns && trns.length >= 2 && s[0] === trns.readUInt16BE(0) ? 0 : 255); return;
  }
  out[di] = sc(s[0]); out[di + 1] = sc(s[1]); out[di + 2] = sc(s[2]);
  out[di + 3] = ct === 6 ? sc(s[3]) : (trns && trns.length >= 6 && s[0] === trns.readUInt16BE(0) && s[1] === trns.readUInt16BE(2) && s[2] === trns.readUInt16BE(4) ? 0 : 255);
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
}
function png(p) {
  const hd = Buffer.alloc(13); hd.writeUInt32BE(p.w, 0); hd.writeUInt32BE(p.h, 4); hd[8] = 8; hd[9] = 6;
  const raw = Buffer.alloc((p.w * 4 + 1) * p.h);
  for (let y = 0; y < p.h; y++) { raw[y * (p.w * 4 + 1)] = 0; Buffer.from(p.d.buffer, p.d.byteOffset + y * p.w * 4, p.w * 4).copy(raw, y * (p.w * 4 + 1) + 1); }
  return Buffer.concat([SIG, chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- TGA / DDS write ----------
// vanilla unit_icon / squad / portrait: type 2, 32 bpp, descriptor 8 (bottom-up, 8 alpha bits), no id, no RLE [V census]
function tga(p) {
  const out = Buffer.alloc(18 + p.w * p.h * 4);
  out[2] = 2; out.writeUInt16LE(p.w, 12); out.writeUInt16LE(p.h, 14); out[16] = 32; out[17] = 8;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const s = (y * p.w + x) * 4, d = 18 + ((p.h - 1 - y) * p.w + x) * 4;
    out[d] = p.d[s + 2]; out[d + 1] = p.d[s + 1]; out[d + 2] = p.d[s]; out[d + 3] = p.d[s + 3];
  }
  return out;
}
function dds(p) { return require('../../lib/model/ddsenc').encode(p.d, p.w, p.h, { mips: false }); }

// ---------- decode any ----------
function decode(buf, name) {
  const ext = path.extname(name || '').toLowerCase();
  if (buf.slice(0, 8).equals(SIG)) return decodePng(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const j = require('../../shotcrop/jpeg').decode(buf), d = new Uint8Array(j.width * j.height * 4);
    for (let i = 0, k = 0; i < j.width * j.height; i++, k += 3) { d[i * 4] = j.data[k]; d[i * 4 + 1] = j.data[k + 1]; d[i * 4 + 2] = j.data[k + 2]; d[i * 4 + 3] = 255; }
    return { w: j.width, h: j.height, d };
  }
  let r = null;
  if (buf.toString('latin1', 0, 4) === 'DDS ') r = require('../../lib/model/dds').decode(buf);
  else if (buf[0] === 0x42 && buf[1] === 0x4d) r = require('../../lib/model/bmp').decode(buf);
  else if (ext === '.tga' || ext === '' || !ext) r = require('../../lib/model/tga').decode(buf);
  if (!r) throw new Error('picture kind not known: ' + (name || 'buffer') + ' (PNG, TGA, DDS, BMP, JPG)');
  if (r.error) throw new Error(r.error);
  return { w: r.width, h: r.height, d: new Uint8Array(r.rgba) };
}

// ---------- geometry ----------
function crop(p, x, y, w, h) {
  const o = blank(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = x + i, sy = y + j; if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) continue;
    const s = (sy * p.w + sx) * 4, d = (j * w + i) * 4; o.d[d] = p.d[s]; o.d[d + 1] = p.d[s + 1]; o.d[d + 2] = p.d[s + 2]; o.d[d + 3] = p.d[s + 3];
  }
  return o;
}
function mirror(p) {
  const o = blank(p.w, p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const s = (y * p.w + x) * 4, d = (y * p.w + p.w - 1 - x) * 4; for (let c = 0; c < 4; c++) o.d[d + c] = p.d[s + c]; }
  return o;
}
function lanczos(x) { if (x === 0) return 1; if (x <= -3 || x >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); }
function weights(src, dst) {
  const scale = dst / src, fs = scale < 1 ? 1 / scale : 1, sup = 3 * fs, out = [];
  for (let i = 0; i < dst; i++) {
    const c = (i + 0.5) / scale - 0.5, a = Math.floor(c - sup + 1), b = Math.ceil(c + sup - 1), ws = []; let sum = 0;
    for (let j = a; j <= b; j++) { const w = lanczos((j - c) / fs); if (w) { ws.push([Math.min(src - 1, Math.max(0, j)), w]); sum += w; } }
    for (const e of ws) e[1] /= sum || 1;
    out.push(ws);
  }
  return out;
}
// premultiplied, so transparent pixels never bleed their colour into the edge
function resize(p, W, H) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  if (W === p.w && H === p.h) return copy(p);
  const pre = new Float32Array(p.w * p.h * 4);
  for (let i = 0; i < p.w * p.h; i++) { const a = p.d[i * 4 + 3] / 255; pre[i * 4] = p.d[i * 4] * a; pre[i * 4 + 1] = p.d[i * 4 + 1] * a; pre[i * 4 + 2] = p.d[i * 4 + 2] * a; pre[i * 4 + 3] = p.d[i * 4 + 3]; }
  const wx = weights(p.w, W), wy = weights(p.h, H), mid = new Float32Array(W * p.h * 4);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [j, w] of wx[x]) { const s = (y * p.w + j) * 4; r += pre[s] * w; g += pre[s + 1] * w; b += pre[s + 2] * w; a += pre[s + 3] * w; }
    const d = (y * W + x) * 4; mid[d] = r; mid[d + 1] = g; mid[d + 2] = b; mid[d + 3] = a;
  }
  const o = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [j, w] of wy[y]) { const s = (j * W + x) * 4; r += mid[s] * w; g += mid[s + 1] * w; b += mid[s + 2] * w; a += mid[s + 3] * w; }
    const d = (y * W + x) * 4, A = Math.max(0, Math.min(255, a));
    o.d[d + 3] = Math.round(A);
    if (A > 0.5) { const k = 255 / A; o.d[d] = cl(r * k); o.d[d + 1] = cl(g * k); o.d[d + 2] = cl(b * k); }
  }
  return o;
}
// area average (shrinking only): each output pixel is the exact mean of the source area it covers, premultiplied (no ringing, no
// lost thin lines the way a point sample loses them); for growing, resize() is used
function area(p, W, H) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  if (W > p.w || H > p.h) return resize(p, W, H);
  if (W === p.w && H === p.h) return copy(p);
  const span = (n, m) => { const out = []; const k = n / m; for (let i = 0; i < m; i++) { const a = i * k, b = a + k, ws = []; for (let j = Math.floor(a); j < Math.min(n, Math.ceil(b)); j++) { const w = Math.min(b, j + 1) - Math.max(a, j); if (w > 1e-6) ws.push([j, w / k]); } out.push(ws); } return out; };
  const sx = span(p.w, W), sy = span(p.h, H), mid = new Float32Array(W * p.h * 4);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [j, w] of sx[x]) { const s = (y * p.w + j) * 4, al = p.d[s + 3] * w; r += p.d[s] * al; g += p.d[s + 1] * al; b += p.d[s + 2] * al; a += al; }
    const d = (y * W + x) * 4; mid[d] = r; mid[d + 1] = g; mid[d + 2] = b; mid[d + 3] = a;
  }
  const o = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [j, w] of sy[y]) { const s = (j * W + x) * 4; r += mid[s] * w; g += mid[s + 1] * w; b += mid[s + 2] * w; a += mid[s + 3] * w; }
    const d = (y * W + x) * 4; o.d[d + 3] = cl(a);
    if (a > 0.01) { o.d[d] = cl(r / a); o.d[d + 1] = cl(g / a); o.d[d + 2] = cl(b / a); }
  }
  return o;
}
function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function bbox(p, minA) {
  const m = minA == null ? 8 : minA; let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.d[(y * p.w + x) * 4 + 3] > m) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
// place a subject into a W x H box. contain: whole subject inside the margins; cover: fill the box, cut the rest;
// crop: o.box [x,y,w,h] in source pixels first, then contain. scale multiplies, dx/dy shift in output pixels.
// anchor: [ax, ay] in 0..1 (0.5 = centre; vanilla vehicle icons sit low, ay ~0.6)
function fit(p, W, H, o) {
  o = o || {};
  let src = p;
  if (o.box) src = crop(p, o.box[0] | 0, o.box[1] | 0, Math.max(1, o.box[2] | 0), Math.max(1, o.box[3] | 0));
  else if (o.trim !== false) { const b = bbox(p, 8); if (b) src = crop(p, b[0], b[1], b[2], b[3]); }
  const m = o.margin || [0, 0, 0, 0];   // top right bottom left
  const bw = Math.max(1, W - m[1] - m[3]), bh = Math.max(1, H - m[0] - m[2]);
  let s = o.mode === 'cover' ? Math.max(bw / src.w, bh / src.h) : Math.min(bw / src.w, bh / src.h);
  s *= o.scale || 1;
  const sw = Math.max(1, Math.round(src.w * s)), sh = Math.max(1, Math.round(src.h * s)), r = resize(src, sw, sh);
  const an = o.anchor || [0.5, 0.5];
  const x = Math.round(m[3] + (bw - sw) * an[0] + (o.dx || 0)), y = Math.round(m[0] + (bh - sh) * an[1] + (o.dy || 0));
  const out = blank(W, H); over(out, r, x, y, 1);
  return out;
}

// ---------- compose and colour ----------
function over(dst, src, x, y, op) {
  x |= 0; y |= 0; const k = op == null ? 1 : op;
  for (let j = 0; j < src.h; j++) {
    const ty = y + j; if (ty < 0 || ty >= dst.h) continue;
    for (let i = 0; i < src.w; i++) {
      const tx = x + i; if (tx < 0 || tx >= dst.w) continue;
      const s = (j * src.w + i) * 4, d = (ty * dst.w + tx) * 4, sa = src.d[s + 3] / 255 * k;
      if (sa <= 0) continue;
      const da = dst.d[d + 3] / 255, oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) dst.d[d + c] = cl((src.d[s + c] * sa + dst.d[d + c] * da * (1 - sa)) / oa);
      dst.d[d + 3] = cl(oa * 255);
    }
  }
  return dst;
}
function dist(p, i, rgb) { const r = p.d[i] - rgb[0], g = p.d[i + 1] - rgb[1], b = p.d[i + 2] - rgb[2]; return Math.sqrt(r * r + g * g + b * b); }
// key out a colour: within tol -> transparent, tol..tol+soft -> partial (and colour unmixed from the key)
function key(p, rgb, tol, soft) {
  const o = copy(p), t = tol == null ? 40 : tol, s = soft == null ? 30 : soft;
  for (let i = 0; i < o.d.length; i += 4) {
    const e = dist(o, i, rgb);
    if (e <= t) o.d[i + 3] = 0;
    else if (e < t + s) {
      const a = (e - t) / s; o.d[i + 3] = cl(o.d[i + 3] * a);
      for (let c = 0; c < 3; c++) o.d[i + c] = cl((o.d[i + c] - rgb[c] * (1 - a)) / a);
    }
  }
  return o;
}
function cornerColour(p) {
  const pts = [0, p.w - 1, (p.h - 1) * p.w, p.h * p.w - 1].map(i => [p.d[i * 4], p.d[i * 4 + 1], p.d[i * 4 + 2]]);
  return [0, 1, 2].map(c => pts.map(q => q[c]).sort((a, b) => a - b)[1]);
}
function keyEdge(p, tol, soft) { return key(p, cornerColour(p), tol, soft); }
function hasAlpha(p) { for (let i = 3; i < p.d.length; i += 4) if (p.d[i] < 250) return true; return false; }
// L = [Lr, Lg, Lb] each 256 numbers; mask(i) -> 0..1 how much of the table applies to pixel i
function lut(p, L, mask) {
  const o = copy(p);
  for (let i = 0, n = 0; i < o.d.length; i += 4, n++) {
    const m = mask ? mask(n) : 1; if (m <= 0) continue;
    for (let c = 0; c < 3; c++) { const v = o.d[i + c]; o.d[i + c] = cl(v + (L[c][v] - v) * m); }
  }
  return o;
}
function grey(p) { const o = copy(p); for (let i = 0; i < o.d.length; i += 4) { const y = cl(0.299 * o.d[i] + 0.587 * o.d[i + 1] + 0.114 * o.d[i + 2]); o.d[i] = o.d[i + 1] = o.d[i + 2] = y; } return o; }
function silhouette(p, rgb) { const o = copy(p); for (let i = 0; i < o.d.length; i += 4) { o.d[i] = rgb[0]; o.d[i + 1] = rgb[1]; o.d[i + 2] = rgb[2]; } return o; }
function alphaOf(p) { const a = new Float32Array(p.w * p.h); for (let i = 0; i < a.length; i++) a[i] = p.d[i * 4 + 3]; return a; }
function boxBlur(a, w, h, r) {
  if (r <= 0) return a;
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))]; t[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, y + k)) * w + x]; o[y * w + x] = s / n; }
  return o;
}
function blur(p, r) {
  const o = copy(p); const ch = [0, 1, 2, 3].map(c => { const a = new Float32Array(p.w * p.h); for (let i = 0; i < a.length; i++) a[i] = p.d[i * 4 + c] * (c === 3 ? 1 : p.d[i * 4 + 3] / 255); return boxBlur(boxBlur(a, p.w, p.h, r), p.w, p.h, r); });
  for (let i = 0; i < p.w * p.h; i++) { const A = ch[3][i]; o.d[i * 4 + 3] = cl(A); for (let c = 0; c < 3; c++) o.d[i * 4 + c] = A > 0.5 ? cl(ch[c][i] * 255 / A) : 0; }
  return o;
}
// a ring of colour rgb, r pixels wide, behind the subject
function outline(p, rgb, r, op) {
  const a = alphaOf(p), d = new Float32Array(a.length), R = Math.max(1, r | 0);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    let m = 0;
    for (let j = -R; j <= R && m < 255; j++) for (let i = -R; i <= R; i++) { if (i * i + j * j > R * R + R) continue; const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= p.w || Y >= p.h) continue; const v = a[Y * p.w + X]; if (v > m) m = v; }
    d[y * p.w + x] = m;
  }
  const ring = blank(p.w, p.h, [rgb[0], rgb[1], rgb[2], 0]);
  for (let i = 0; i < d.length; i++) ring.d[i * 4 + 3] = cl(d[i] * (op == null ? 1 : op));
  return over(ring, p, 0, 0, 1);
}
function shadow(p, dx, dy, r, op, rgb) {
  const a = boxBlur(boxBlur(alphaOf(p), p.w, p.h, r | 0), p.w, p.h, r | 0), c = rgb || [0, 0, 0];
  const sh = blank(p.w, p.h, [c[0], c[1], c[2], 0]);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const sx = x - (dx | 0), sy = y - (dy | 0); if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) continue; sh.d[(y * p.w + x) * 4 + 3] = cl(a[sy * p.w + sx] * (op == null ? 0.5 : op)); }
  return over(sh, p, 0, 0, 1);
}
function stats(p, mask) {
  let n = 0, L = 0, S = 0, A = 0;
  for (let i = 0, k = 0; i < p.d.length; i += 4, k++) {
    if (mask && !mask(k)) continue;
    const r = p.d[i], g = p.d[i + 1], b = p.d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L += 0.299 * r + 0.587 * g + 0.114 * b; S += mx ? (mx - mn) / mx : 0; A += p.d[i + 3]; n++;
  }
  return n ? { lum: L / n, sat: S / n, alpha: A / n, n } : { lum: 0, sat: 0, alpha: 0, n: 0 };
}
function same(a, b) { if (a.w !== b.w || a.h !== b.h) return false; for (let i = 0; i < a.d.length; i++) if (a.d[i] !== b.d[i]) return false; return true; }
function dataUrl(p) { return 'data:image/png;base64,' + png(p).toString('base64'); }
function fromDataUrl(s) { const m = /^data:image\/[a-z]+;base64,(.*)$/i.exec(s || ''); if (!m) throw new Error('not a picture data URL'); return decode(Buffer.from(m[1], 'base64'), 'x.png'); }

module.exports = { blank, copy, decode, decodePng, png, tga, dds, crop, mirror, resize, area, bbox, fit, over, key, keyEdge, cornerColour, hasAlpha, lut, grey, silhouette, blur, outline, shadow, stats, same, dataUrl, fromDataUrl, cl };
