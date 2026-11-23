#!/usr/bin/env node
// artport: GoH interface art -> AS2/as64 mod folder. no deps (zlib only). reads GoH, writes only --out.
//   node tools/artport/artport.js formats
//   node tools/artport/artport.js census <scene.pak|dir>
//   node tools/artport/artport.js find   <scene.pak|dir> <substr> [kind]
//   node tools/artport/artport.js convert <in.gif|png|tga> <out.tga|png> [--size WxH]
//   node tools/artport/artport.js port --src <scene.pak|dir> --from <stem> --to <stem> --out <dir>
//        [--kinds unit_icon,unit_icon_small,squad,portrait,vehicle_view] [--convert gif|png|none] [--size WxH] [--root resource/interface]
//   port --from-entity <entity|breed> [--logic <gamelogic.pak|dir>] in place of --from: stem per kind from breed set / entity name
// formats: loader takes .dds .tga .bmp .jpg .png; .gif is NOT registered -> always convert [V].
//   png goes as is by default [T in game]; --convert png writes tga instead (fallback if as64 rejects png).
// out layout: <out>/<root>/scene/<kind>/<to>_NN.<ext>; plus <out>/art-port.json (names, no pixels)
// Author: Imperator_Aug (ARSENAL, ia-08e0df22)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// ---------- png ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const isPng = b => b.length > 8 && b.readUInt32BE(0) === 0x89504E47;
const isGif = b => b.length > 6 && b.toString('latin1', 0, 3) === 'GIF';

function decodePng(b) {
  if (!isPng(b)) throw new Error('not a png');
  let p = 8, w, h, bd, ct, il, plte = null, trns = null; const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || il !== 0) throw new Error(`png bit depth ${bd} interlace ${il} not supported`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) throw new Error('png colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  if (raw.length < (stride + 1) * h) throw new Error('png data short');
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[o + x - ch] : 0, up = y ? px[o - stride + x] : 0, c = x >= ch && y ? px[o - stride + x - ch] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      else if (f !== 0) throw new Error('png filter ' + f);
      px[o + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, a = 255;
    if (ct === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (ct === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (ct === 0) { r = g = bl = px[i]; }
    else if (ct === 4) { r = g = bl = px[i * 2]; a = px[i * 2 + 1]; }
    else { const k = px[i]; if (!plte || k * 3 + 2 >= plte.length) throw new Error('png palette index'); r = plte[k * 3]; g = plte[k * 3 + 1]; bl = plte[k * 3 + 2]; if (trns && k < trns.length) a = trns[k]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = bl; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

function encodePng({ w, h, rgba }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc32(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- gif (first frame, composited on the logical screen) ----------
function decodeGif(b) {
  if (!isGif(b)) throw new Error('not a gif');
  const W = b.readUInt16LE(6), H = b.readUInt16LE(8), fl = b[10]; let p = 13, gct = null, trans = -1;
  if (fl & 0x80) { const n = 3 << ((fl & 7) + 1); gct = b.subarray(p, p + n); p += n; }
  const out = Buffer.alloc(W * H * 4);
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x21) {
      const lab = b[p++];
      if (lab === 0xF9 && b[p] >= 4) { trans = b[p + 1] & 1 ? b[p + 4] : -1; }
      while (b[p]) p += b[p] + 1; p++;
    } else if (t === 0x2C) {
      const x0 = b.readUInt16LE(p), y0 = b.readUInt16LE(p + 2), w = b.readUInt16LE(p + 4), h = b.readUInt16LE(p + 6), lf = b[p + 8]; p += 9;
      let ct = gct; if (lf & 0x80) { const n = 3 << ((lf & 7) + 1); ct = b.subarray(p, p + n); p += n; }
      if (!ct) throw new Error('gif has no colour table');
      const minb = b[p++], parts = []; while (b[p]) { parts.push(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; } p++;
      const idx = lzw(Buffer.concat(parts), minb, w * h);
      const order = []; if (lf & 0x40) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) order.push(y); } else for (let y = 0; y < h; y++) order.push(y);
      for (let r = 0; r < h; r++) for (let x = 0; x < w; x++) {
        const k = idx[r * w + x], X = x0 + x, Y = y0 + order[r]; if (X >= W || Y >= H || k === trans) continue;
        const o = (Y * W + X) * 4; out[o] = ct[k * 3]; out[o + 1] = ct[k * 3 + 1]; out[o + 2] = ct[k * 3 + 2]; out[o + 3] = 255;
      }
      return { w: W, h: H, rgba: out };
    } else if (t === 0x3B) break; else throw new Error('gif block ' + t);
  }
  throw new Error('gif has no image');
}
function lzw(data, minb, n) {
  const out = Buffer.alloc(n), clear = 1 << minb, eoi = clear + 1; let size = minb + 1, next = eoi + 1, prev = -1, o = 0, bits = 0, acc = 0, di = 0;
  const pre = new Int32Array(4096), suf = new Uint8Array(4096), len = new Uint16Array(4096);
  for (let i = 0; i < clear; i++) { suf[i] = i; len[i] = 1; pre[i] = -1; }
  const emit = c => { const l = len[c]; let q = o + l - 1; for (let k = c; k >= 0 && q >= o; k = pre[k]) { if (q < n) out[q] = suf[k]; q--; } o += l; };
  const first = c => { while (pre[c] >= 0) c = pre[c]; return suf[c]; };
  while (o < n) {
    while (bits < size && di < data.length) { acc |= data[di++] << bits; bits += 8; }
    if (bits < size) break;
    const code = acc & ((1 << size) - 1); acc >>>= size; bits -= size;
    if (code === clear) { size = minb + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (prev < 0) { emit(code); prev = code; continue; }
    if (code < next) { emit(code); if (next < 4096) { pre[next] = prev; suf[next] = first(code); len[next] = len[prev] + 1; next++; } }
    else { if (next < 4096) { pre[next] = prev; suf[next] = first(prev); len[next] = len[prev] + 1; next++; } emit(next - 1); }
    prev = code; if (next === (1 << size) && size < 12) size++;
  }
  return out;
}

// ---------- tga ----------
// type 2 truecolour 32bpp, bottom-up (descriptor 0x08): the safest layout for the engine reader.
function encodeTga({ w, h, rgba }) {
  const hd = Buffer.alloc(18); hd[2] = 2; hd.writeUInt16LE(w, 12); hd.writeUInt16LE(h, 14); hd[16] = 32; hd[17] = 8;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = ((h - 1 - y) * w + x) * 4; px[d] = rgba[s + 2]; px[d + 1] = rgba[s + 1]; px[d + 2] = rgba[s]; px[d + 3] = rgba[s + 3]; }
  return Buffer.concat([hd, px]);
}
function decodeTga(b) { // type 2 / 10, 24/32 bpp only (what the converter needs)
  const t = b[2], bpp = b[16], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bytes = bpp >> 3, top = !!(b[17] & 0x20);
  if (![2, 10].includes(t) || ![24, 32].includes(bpp)) throw new Error(`tga type ${t} ${bpp}bpp not supported`);
  let p = 18 + b[0]; const px = Buffer.alloc(w * h * bytes);
  if (t === 2) b.copy(px, 0, p, p + px.length);
  else for (let o = 0; o < px.length;) { const c = b[p++], n = (c & 127) + 1; if (c & 128) { for (let i = 0; i < n; i++, o += bytes) b.copy(px, o, p, p + bytes); p += bytes; } else { b.copy(px, o, p, p + n * bytes); p += n * bytes; o += n * bytes; } }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * bytes, d = ((top ? y : h - 1 - y) * w + x) * 4; rgba[d] = px[s + 2]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s]; rgba[d + 3] = bytes === 4 ? px[s + 3] : 255; }
  return { w, h, rgba };
}
function dims(b) { // header-only size for the report
  if (isPng(b)) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (isGif(b)) return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.length > 18 && b[1] === 0 && [2, 3, 10, 11].includes(b[2])) return [b.readUInt16LE(12), b.readUInt16LE(14)];
  return null;
}

// ---------- resize (area average, premultiplied alpha) ----------
function resize({ w, h, rgba }, W, H) {
  if (W === w && H === h) return { w, h, rgba };
  const out = Buffer.alloc(W * H * 4), sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy; let r = 0, g = 0, bl = 0, a = 0, wt = 0;
    for (let j = Math.floor(y0); j < Math.min(h, Math.ceil(y1)); j++) for (let i = Math.floor(x0); i < Math.min(w, Math.ceil(x1)); i++) {
      const f = (Math.min(x1, i + 1) - Math.max(x0, i)) * (Math.min(y1, j + 1) - Math.max(y0, j)), s = (j * w + i) * 4, al = rgba[s + 3] / 255;
      r += rgba[s] * al * f; g += rgba[s + 1] * al * f; bl += rgba[s + 2] * al * f; a += al * f; wt += f;
    }
    const o = (y * W + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(bl / a); }
    out[o + 3] = wt ? Math.round(255 * a / wt) : 0;
  }
  return { w: W, h: H, rgba: out };
}

// ---------- source index (pak or dir) ----------
function openSrc(src) {
  const idx = new Map(); // lower key (no leading interface/) -> { name, read() }
  const add = (name, read) => { const k = name.replace(/\\/g, '/').replace(/^interface\//i, ''); idx.set(k.toLowerCase(), { name: k, read }); };
  if (fs.statSync(src).isDirectory()) {
    (function walk(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = d + '/' + e.name; if (e.isDirectory()) walk(f, rel + e.name + '/'); else add(rel + e.name, () => fs.readFileSync(f)); } })(src, '');
  } else {
    const pak = require('../lib/pak.js'), ents = pak.list(src);
    for (const en of ents) if (!en.name.endsWith('/')) add(en.name, () => pak.read(ents, en));
  }
  return idx;
}
const KINDS = ['unit_icon', 'unit_icon_small', 'squad', 'portrait', 'vehicle_view'];
const IMG = /\.(tga|png|gif|dds|bmp|jpg|ebm|mtl)$/i;

// files of `stem` in kind: scene/<kind>/<stem>(_NN)?.ext ; vehicle_view: whole dir scene/vehicle_view/<stem>/**
function pick(idx, kind, stem) {
  const s = stem.toLowerCase(), pre = `scene/${kind}/`, out = [];
  for (const [k, v] of idx) {
    if (!k.startsWith(pre) || !IMG.test(k)) continue;
    const rel = v.name.slice(pre.length);
    if (kind === 'vehicle_view') { if (rel.toLowerCase().startsWith(s + '/')) out.push({ v, rel: rel.slice(s.length), frame: '' }); continue; }
    const m = /^(.*?)((?:_\d\d)?)(\.[a-z0-9]+)$/i.exec(rel);
    if (m && m[1].toLowerCase() === s) out.push({ v, rel: m[2] + m[3], frame: m[2] });
  }
  return out;
}

// stem per kind from a GoH name (PORT row 48). breed: set/breed/**/<name>.set in --logic (gamelogic.pak|dir) gives
// {portrait "p"} {icon "i"} {nationality n}; unit_icon stems are "i(n)" (bazooka(can)_00) else "i" [I from data].
// otherwise the entity name itself (807/3264 unit_icon stems = vehicle def names), then trailing _seg stripped [I].
function parseBreed(t) { const g = k => (new RegExp(`\\{${k}\\s+"?([^"}\\s]+)"?\\s*\\}`).exec(t) || [])[1]; return { portrait: g('portrait'), icon: g('icon'), nat: g('nationality') }; }
function resolveStems(idx, name, logic) {
  const n = name.toLowerCase(), has = (kind, s) => s && pick(idx, kind, s).length > 0, out = { stems: {}, via: {} };
  let br = null;
  if (logic) { const li = openSrc(logic); for (const [k, v] of li) if (k.startsWith('set/breed/') && k.endsWith('/' + n + '.set')) { br = Object.assign(parseBreed(v.read().toString('latin1')), { file: v.name }); break; } }
  const strip = []; for (let s = n; s; s = s.includes('_') ? s.slice(0, s.lastIndexOf('_')) : '') strip.push(s);
  for (const kind of KINDS) {
    let tries = [];
    if (br) { const ic = br.icon && br.nat ? [br.icon + '(' + br.nat + ')', br.icon] : [br.icon]; tries = kind === 'portrait' ? [br.portrait] : kind === 'squad' ? [...ic, br.portrait] : ic; }
    tries = [...tries, ...strip];
    const hit = tries.find(s => has(kind, s));
    if (hit) { out.stems[kind] = hit; out.via[kind] = br && tries.indexOf(hit) < tries.length - strip.length ? 'breed ' + br.file : hit === n ? 'name' : 'stripped'; }
  }
  out.breed = br; return out;
}

function convertBuf(buf, ext, want, size) { // -> { buf, ext } or null if loads as is
  let img = null;
  if (isGif(buf)) img = decodeGif(buf); else if (want.has('png') && isPng(buf)) img = decodePng(buf);
  if (!img) return null;
  if (size) img = resize(img, size[0], size[1]);
  return { buf: encodeTga(img), ext: '.tga' };
}

function port(o) {
  const idx = openSrc(o.src), kinds = (o.kinds || KINDS.join(',')).split(','), want = new Set((o.convert || '').split(',').filter(x => x && x !== 'none'));
  const root = o.root || 'resource/interface', res = { from: o.from, to: o.to, files: [], missing: [], converted: 0 };
  if (o['from-entity']) { const r = resolveStems(idx, o['from-entity'], o.logic); res.from = o['from-entity']; res.stems = r.stems; res.via = r.via; }
  for (const kind of kinds) {
    const stem = res.stems ? res.stems[kind] : o.from;
    if (!stem) { res.missing.push(kind); continue; }
    const found = pick(idx, kind, stem);
    if (!found.length) { res.missing.push(kind); continue; }
    for (const f of found) {
      let buf = f.v.read(), rel = f.rel, conv = null;
      const ext = path.extname(rel).toLowerCase();
      if (ext === '.gif' || (ext === '.png' && want.has('png'))) { conv = convertBuf(buf, ext, want, null); }
      let size = null; if (o.size && kind === 'unit_icon' && /\.(tga|png|gif)$/i.test(rel)) size = o.size;
      if (size) { const img = conv ? decodeTga(conv.buf) : isPng(buf) ? decodePng(buf) : isGif(buf) ? decodeGif(buf) : ['.tga'].includes(ext) ? decodeTga(buf) : null; if (img) { conv = { buf: encodeTga(resize(img, size[0], size[1])), ext: '.tga' }; } }
      if (conv) { buf = conv.buf; rel = rel.slice(0, rel.length - ext.length) + conv.ext; res.converted++; }
      const dst = path.join(o.out, root, 'scene', kind, o.to + rel), d = dims(buf);
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf);
      res.files.push({ kind, file: path.relative(o.out, dst).replace(/\\/g, '/'), bytes: buf.length, size: d && d.join('x'), converted: !!conv });
    }
  }
  fs.mkdirSync(o.out, { recursive: true });
  const mf = path.join(o.out, 'art-port.json'); let all = []; try { all = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { }
  all = all.filter(r => !(r.from === res.from && r.to === res.to)); all.push(res); fs.writeFileSync(mf, JSON.stringify(all, null, 1));
  return res;
}

function census(src) {
  const idx = openSrc(src), by = {};
  for (const [k, v] of idx) {
    const m = /^scene\/([^/]+)\/.*(\.[a-z0-9]+)$/i.exec(k); if (!m || !IMG.test(k)) continue;
    const key = `${m[1]} ${m[2]}`; by[key] = (by[key] || 0) + 1;
  }
  return by;
}

// ---------- cli ----------
function parseArgs(a) { const o = { _: [] }; for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i]; else o._.push(a[i]); } return o; }
const parseSize = s => { if (!s) return null; const m = /^(\d+)x(\d+)$/.exec(s); if (!m) throw new Error('--size WxH'); return [+m[1], +m[2]]; };

function main(argv) {
  const [cmd, ...rest] = argv, o = parseArgs(rest);
  if (cmd === 'formats') { console.log('loads as is: .dds .tga(2,10) .bmp .jpg .png [V]\nconvert: .gif -> .tga (always)\noptional: .png -> .tga (--convert png)'); return 0; }
  if (cmd === 'census') { const by = census(o._[0]); for (const k of Object.keys(by).sort()) console.log(k, by[k]); return 0; }
  if (cmd === 'find') { const idx = openSrc(o._[0]), s = o._[1].toLowerCase(), kind = o._[2]; let n = 0; for (const [k, v] of idx) if (k.includes(s) && (!kind || k.startsWith(`scene/${kind}/`)) && n++ < 40) console.log(v.name); return 0; }
  if (cmd === 'convert') {
    const [i, out] = o._, buf = fs.readFileSync(i), size = parseSize(o.size);
    let img = isGif(buf) ? decodeGif(buf) : isPng(buf) ? decodePng(buf) : decodeTga(buf);
    if (size) img = resize(img, size[0], size[1]);
    fs.writeFileSync(out, /\.png$/i.test(out) ? encodePng(img) : encodeTga(img)); console.log(`${i} -> ${out} ${img.w}x${img.h}`); return 0;
  }
  if (cmd === 'port') {
    if (!o.src || !(o.from || o['from-entity']) || !o.to || !o.out) { console.error('port needs --src --from|--from-entity --to --out'); return 2; }
    o.size = parseSize(o.size); const r = port(o);
    if (r.stems) console.log('stems: ' + (Object.entries(r.stems).map(([k, s]) => `${k}=${s} (${r.via[k]})`).join(', ') || 'none'));
    console.log(`${r.from} -> ${o.to}: ${r.files.length} files, ${r.converted} converted, kinds missing: ${r.missing.join(',') || '-'}`); return r.files.length ? 0 : 1;
  }
  console.error('usage: artport.js formats|census|find|convert|port (see header)'); return 2;
}
module.exports = { decodePng, encodePng, decodeGif, decodeTga, encodeTga, resize, dims, openSrc, pick, port, census, lzw, resolveStems, parseBreed };
if (require.main === module) process.exit(main(process.argv.slice(2)));
