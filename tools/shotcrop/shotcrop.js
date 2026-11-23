#!/usr/bin/env node
// shotcrop: crop a region of a game screenshot (JPG baseline, or PNG 8-bit RGB/RGBA non-interlaced) and upscale to PNG.
// usage: node tools/shotcrop/shotcrop.js <in.jpg> (--box x,y,w,h | --frac fx,fy,fw,fh) [--scale 4] [--smooth] [--out out.png] | --info
// exit: 0 ok, 2 bad args/box out of bounds/unsupported file
// Author: Imperator_Aug (ARSENAL, ia-834923c0)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const { decode } = require('./jpeg');

function crc32(b) { let c, crc = ~0; for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function decodePng(buf) {
  let p = 8, w, h, ct, idat = [];
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] || (ct !== 2 && ct !== 6)) throw new Error('PNG: only 8-bit RGB/RGBA non-interlaced'); }
    else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 2 ? 3 : 4, raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, cur = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)];
    for (let i = 0; i < st; i++) {
      const x = raw[y * (st + 1) + 1 + i], a = i >= bpp ? cur[y * st + i - bpp] : 0, b = y ? cur[(y - 1) * st + i] : 0, c = i >= bpp && y ? cur[(y - 1) * st + i - bpp] : 0;
      let v = x;
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[y * st + i] = v & 255;
    }
  }
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { data[i * 3] = cur[i * bpp]; data[i * 3 + 1] = cur[i * bpp + 1]; data[i * 3 + 2] = cur[i * bpp + 2]; }
  return { width: w, height: h, data };
}
function load(file) { const b = fs.readFileSync(file); return b[0] === 0x89 ? decodePng(b) : decode(b); }

function crop(img, x, y, w, h, scale, smooth) {
  const W = w * scale, H = h * scale, out = Buffer.alloc(W * H * 3), s = img.data, iw = img.width;
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < W; ox++) {
    const o = (oy * W + ox) * 3;
    if (!smooth) { const i = ((y + Math.floor(oy / scale)) * iw + x + Math.floor(ox / scale)) * 3; out[o] = s[i]; out[o + 1] = s[i + 1]; out[o + 2] = s[i + 2]; }
    else {
      const fx = Math.min(w - 1, Math.max(0, (ox + 0.5) / scale - 0.5)), fy = Math.min(h - 1, Math.max(0, (oy + 0.5) / scale - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let c = 0; c < 3; c++) {
        const g = (xx, yy) => s[((y + yy) * iw + x + xx) * 3 + c];
        out[o + c] = Math.round((g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty);
      }
    }
  }
  return { width: W, height: H, data: out };
}

function main(argv) {
  const a = { scale: 4 }; let file = null;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--box') a.box = argv[++i]; else if (k === '--frac') a.frac = argv[++i];
    else if (k === '--scale') a.scale = Number(argv[++i]); else if (k === '--out') a.out = argv[++i];
    else if (k === '--contrast') a.contrast = true;
    else if (k === '--info') a.info = true; else if (k === '--smooth' || k === '--bilinear') a.smooth = true; else if (k === '--nearest') a.smooth = false;
    else if (k[0] === '-') return fail('unknown option ' + k); else file = k;
  }
  if (!file) return fail('usage: shotcrop <in.jpg> (--box x,y,w,h | --frac fx,fy,fw,fh) [--scale N] [--smooth] [--out f.png] | --info');
  let img; try { img = load(file); } catch (e) { return fail(file + ': ' + e.message); }
  if (a.info) { console.log(img.width + 'x' + img.height); return 0; }
  const nums = s => s.split(',').map(Number);
  let box;
  if (a.box) box = nums(a.box);
  else if (a.frac) { const f = nums(a.frac); if (f.length !== 4) return fail('--frac needs 4 values'); box = [Math.round(f[0] * img.width), Math.round(f[1] * img.height), Math.round(f[2] * img.width), Math.round(f[3] * img.height)]; }
  else return fail('need --box or --frac');
  if (box.length !== 4 || box.some(v => !Number.isInteger(v))) return fail('box needs 4 integers');
  const [x, y, w, h] = box;
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > img.width || y + h > img.height) return fail(`BOX_OOB box ${box} outside ${img.width}x${img.height}`);
  if (!(a.scale >= 1) || !Number.isInteger(a.scale) || a.scale > 32) return fail('--scale must be integer 1..32');
  const res = crop(img, x, y, w, h, a.scale, a.smooth);
  if (a.contrast) { // stretch the 1st..99th percentile of all channel values to 0..255 (pale/white-on-bright text)
    const hist = new Uint32Array(256); for (const v of res.data) hist[v]++;
    const n = res.data.length; let lo = 0, hi = 255, c = 0;
    while (lo < 255 && (c += hist[lo]) < n * 0.01) lo++;
    c = 0; while (hi > 0 && (c += hist[hi]) < n * 0.01) hi--;
    if (hi > lo) for (let i = 0; i < n; i++) { const v = Math.round((res.data[i] - lo) * 255 / (hi - lo)); res.data[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
  }
  const out = a.out || path.join(path.dirname(file), path.basename(file).replace(/\.\w+$/, '') + '-crop.png');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, encodePng(res.width, res.height, res.data));
  console.log(`${out}: ${res.width}x${res.height} (box ${x},${y},${w},${h} x${a.scale})`);
  return 0;
}
function fail(m) { console.error(m); return 2; }
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { crop, encodePng, decodePng, load };
