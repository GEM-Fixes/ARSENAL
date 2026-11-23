// Author: Imperator_Aug (ARSENAL, ia-09f80b2a)
'use strict';
// assetsame: ASSET-SAME. Census of texture + animation files in AS2 and GoH (headers only), classes, sample compare. Read-only on both installs.
//   node tools/assetsame/assetsame.js census [--out dir] [--game as2|goh|both] [--limit n]   -> census-<game>.json (per file rows) + classes.json + summary
//   node tools/assetsame/assetsame.js compare [--out dir]                                      -> sample per class (<=3), pixel / pose stats, converter output diff
//   installs: lib/games (gamedir); env ASSETSAME_AS2 / ASSETSAME_GOH = a resource folder overrides. as2 = AS64 and MoW:AS2 alike (base data shared)
// Reuses tools/lib/pakset (paks), tools/lib/anm (header), tools/covanm/anmparse (frames). DDS header rules: tools/binhdr/misc.js (FMT-02).
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const ps = require(path.join(ROOT, 'tools/lib/pakset'));
const anmHdr = require(path.join(ROOT, 'tools/lib/anm'));
const anmFull = require(path.join(ROOT, 'tools/covanm/anmparse'));

// <install>/resource of each side, found through lib/games (gamedir) when first read: as2 = the AS2 install (base data, shared by AS64 and
// MoW:AS2; as64/core is not read), goh = the GoH install. ASSETSAME_AS2 / ASSETSAME_GOH (a resource folder) override.
const INSTALL = {};
for (const [k, id, env] of [['as2', 'as64', 'ASSETSAME_AS2'], ['goh', 'goh', 'ASSETSAME_GOH']]) {
  Object.defineProperty(INSTALL, k, { enumerable: true, get() {
    if (process.env[env]) return process.env[env];
    const d = require('../lib/games').install(id).dir;
    if (!d) throw new Error('assetsame: no ' + (k === 'goh' ? 'GoH' : 'AS2') + ' install found (set ' + env + ' to its resource folder)');
    return path.join(d, 'resource');
  } });
}
const TEX_EXT = new Set(['.dds', '.tga', '.png', '.jpg', '.bmp', '.ebm', '.tex']);
const MTL_TEX_KEYS = ['diffuse', 'diffuse1', 'bump', 'specular', 'lightmap', 'mask', 'envmap', 'environment', 'height', 'bumpvolume', 'simple', 'glow'];

const extOf = n => { const i = n.lastIndexOf('.'); return i > n.lastIndexOf('/') ? n.slice(i) : ''; };

// ---------- texture headers ----------
function ddsHeader(b) {
  if (b.length < 128 || b.readUInt32LE(0) !== 0x20534444) return { error: 'not dds' };
  const u = o => b.readUInt32LE(o);
  const h = u(12), w = u(16), mips = Math.max(1, u(28)), pf = u(80), cc = b.toString('latin1', 84, 88), bits = u(88);
  const caps2 = u(112);
  const r = { w, h, mips, cube: !!(caps2 & 0x200), volume: !!(u(8) & 0x800000), alpha: false };
  if (pf & 4) {
    r.fmt = cc === 'DX10' ? 'DX10:' + (b.length >= 132 ? b.readUInt32LE(128) : '?') : cc.replace(/\0/g, '');
    r.alpha = /^(DXT[2-5]|ATI|BC)/.test(r.fmt) ? /^DXT[2-5]$/.test(r.fmt) : false;
    if (r.fmt === 'DXT1') r.alpha = 'dxt1-1bit?';   // headers only: 1-bit alpha is not stated in the header
    r.channels = { DXT1: 'rgb(a1)', DXT3: 'rgba', DXT5: 'rgba', ATI1: 'r', ATI2: 'rg' }[r.fmt] || '?';
  } else {
    const amask = u(104), rm = u(92);
    r.fmt = 'RAW' + bits + (pf & 0x3 ? 'A' : '') + (pf & 0x40 ? '-rgb' : pf & 0x20000 ? '-lum' : '');
    r.alpha = !!(pf & 1 || pf & 2) && amask !== 0;
    r.channels = pf & 0x20000 ? 'l' : (r.alpha ? 'rgba' : 'rgb');
    r.rmask = rm.toString(16);
  }
  return r;
}
function tgaHeader(b) {
  if (b.length < 18) return { error: 'short tga' };
  const idLen = b[0], cmap = b[1], type = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  return { w, h, mips: 1, fmt: 'TGA' + type + '/' + bpp, tgaType: type, bpp, alpha: (desc & 15) > 0 || bpp === 32, channels: bpp === 8 ? 'l' : bpp === 32 ? 'rgba' : bpp === 24 ? 'rgb' : 'bgr555', rle: type === 10 || type === 9, topDown: !!(desc & 0x20), cmap: cmap, idLen };
}
function pngHeader(b) {
  if (b.length < 29 || b.readUInt32BE(0) !== 0x89504e47) return { error: 'not png' };
  const ct = b[25], bd = b[24];
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), mips: 1, fmt: 'PNG' + bd + '/ct' + ct, alpha: ct === 4 || ct === 6, channels: { 0: 'l', 2: 'rgb', 3: 'pal', 4: 'la', 6: 'rgba' }[ct], interlaced: b[28] === 1 };
}
function textureHeader(name, b) {
  const e = extOf(name);
  if (e === '.dds') return ddsHeader(b);
  if (e === '.tga') return tgaHeader(b);
  if (e === '.png') return pngHeader(b);
  if (e === '.bmp') return b.length > 30 ? { w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)), mips: 1, fmt: 'BMP' + b.readUInt16LE(28), alpha: b.readUInt16LE(28) === 32 } : { error: 'short bmp' };
  if (e === '.jpg') {
    let p = 2;
    while (p + 9 < b.length) { if (b[p] !== 0xff) { p++; continue; } const m = b[p + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(p + 5), w: b.readUInt16BE(p + 7), mips: 1, fmt: 'JPG', channels: b[p + 9] === 1 ? 'l' : 'rgb', alpha: false }; p += 2 + b.readUInt16BE(p + 2); }
    return { error: 'no SOF' };
  }
  return { fmt: e.slice(1).toUpperCase() + '-text', mips: 1 };
}

// ---------- names ----------
// stem: key without ext, without #variant / $ marks. suffix = last _token (<=8 chars) of the stem, '' if none
function stemOf(key) { return key.replace(/\.[a-z0-9]+$/, ''); }
function variantOf(stem) { const m = stem.match(/#([^#$]*)(\$?)$/); return m ? '#' + m[1] + m[2] : stem.endsWith('$') ? '$' : ''; }
function baseStem(stem) { return stem.replace(/#[^#$/]*\$?$/, '').replace(/\$$/, ''); }
function suffixOf(stem) { const s = baseStem(stem), b = s.slice(s.lastIndexOf('/') + 1), i = b.lastIndexOf('_'); return i > 0 && b.length - i <= 9 ? b.slice(i) : ''; }
function familyOf(key) {
  const p = key.split('/');
  if (p[0] === 'texture') return p.slice(0, 3).join('/').replace(/\.[a-z0-9]+$/, '');
  if (p[0] === 'interface') return p.slice(0, p[1] === 'scene' ? 3 : 2).join('/').replace(/\.[a-z0-9]+$/, '');
  if (p[0] === 'entity') return 'entity/' + (p[1] || '').replace(/\.[a-z0-9]+$/, '') + (p[1] === '-vehicle' || p[1] === 'construction' ? '/' + (p[2] || '').replace(/\.[a-z0-9]+$/, '') : '');
  return p.slice(0, 2).join('/').replace(/\.[a-z0-9]+$/, '');
}
// coarse unit kind for animation / texture sorting
function kindOf(key) {
  if (/^entity\/-?vehicle|\/vehicle\//.test(key)) return 'vehicle';
  if (/humanskin|\/human|infantry|\/hum_|\/character|\/soldier/.test(key)) return 'human';
  if (/^entity\/inventory|\/gun|\/weapon|cannon|mortar|machinegun/.test(key)) return 'gun';
  if (/^entity\/construction/.test(key)) return 'construction';
  if (/^entity\/landscape|^entity\/particle|^entity\/fx/.test(key)) return 'fx-landscape';
  if (/^interface/.test(key)) return 'interface';
  if (/^texture\/common\/(_)?vehicle/.test(key)) return 'vehicle';
  if (/^texture/.test(key)) return 'texture-' + (key.split('/')[2] || '').replace(/^_/, '');
  if (/^map\//.test(key)) return 'map';
  return 'other';
}

// ---------- mtl role map ----------
// "$/x" -> texture/common/x (goh2as2.js:235). other: next to the .mtl, or rooted
function resolveTex(mtlKey, ref) {
  const r = ref.toLowerCase().replace(/\\/g, '/').replace(/\.(dds|tga|png|ebm|tex|jpg|bmp)$/, '');
  const dir = mtlKey.slice(0, mtlKey.lastIndexOf('/'));
  if (r.startsWith('$/')) return ['texture/common/' + r.slice(2), 'entity/' + r.slice(2), 'texture/' + r.slice(2)];
  if (r.startsWith('/')) return [r.slice(1)];
  return [dir + '/' + r, 'texture/common/' + r];
}
function parseMtl(text) {
  const kv = [];
  for (const m of text.matchAll(/\{(\w+)\s+("[^"]*"|[^\s}]*)/g)) kv.push([m[1], m[2].replace(/^"|"$/g, '')]);
  const type = (text.match(/\{material\s+(\w+)/) || [])[1] || '?';
  return { type, kv };
}
function roleMap(entries, readFn) {
  const roles = new Map();   // resolved stem -> Set(key)
  const mtlStats = { types: {}, keys: {} };
  const have = new Set(entries.filter(e => TEX_EXT.has(extOf(e.name))).map(e => stemOf(e.key)));
  for (const e of entries) {
    if (extOf(e.name) !== '.mtl') continue;
    const m = parseMtl(readFn(e).toString('latin1'));
    mtlStats.types[m.type] = (mtlStats.types[m.type] || 0) + 1;
    for (const [k, v] of m.kv) {
      const kl = k.toLowerCase();
      mtlStats.keys[kl] = (mtlStats.keys[kl] || 0) + 1;
      if (!MTL_TEX_KEYS.includes(kl) || !v || /^[\d.\s-]+$/.test(v)) continue;
      const role = m.type + '.' + kl;
      for (const c of resolveTex(e.key, v)) {
        // variants: a mtl names the base stem; #winter files share the role
        if (have.has(c)) { (roles.get(c) || roles.set(c, new Set()).get(c)).add(role); break; }
      }
    }
  }
  return { roles, mtlStats };
}

// ---------- animations ----------
function anmRow(key, b) {
  const h = anmHdr.parseHeader(b);
  const r = { key, size: b.length, version: h.version, frames: h.frames, bones: h.boneCount, error: h.error };
  if (h.error || h.boneCount === 0) return r;
  const f = anmFull.parse(b);
  r.fullError = f.error;
  r.kinds = [...anmFull.category(f)].sort();
  let mx = 0, n = 0, sum = 0, rot = 0, posrecs = 0, maxm = 0;
  for (const x of f.recs) {
    if (x.pos) { posrecs++; for (const v of x.pos) { const a = Math.abs(v); if (a > mx) mx = a; sum += a; n++; } }
    if (x.rot) rot++;
    if (x.matr) for (let i = 9; i < 12; i++) { const a = Math.abs(x.matr[i]); if (a > maxm) maxm = a; }
  }
  r.maxPos = +Math.max(mx, maxm).toFixed(3); r.meanPos = n ? +(sum / n).toFixed(3) : 0; r.rotRecs = rot; r.posRecs = posrecs; r.recs = f.recs.length;
  r.placement = h.bones.some(x => x.toLowerCase() === 'placement');
  r.lodBones = h.bones.filter(x => /_lod\d+$/i.test(x)).length;
  r.boneSig = sigOf(h.bones);
  r.boneNames = h.bones;
  return r;
}
function sigOf(names) { let x = 0; for (const s of names.join('|')) x = (x * 31 + s.charCodeAt(0)) >>> 0; return names.length + ':' + x.toString(16); }
const bucket = (n, edges) => { for (const e of edges) if (n <= e) return '<=' + e; return '>' + edges[edges.length - 1]; };

// ---------- census ----------
function census(game, opts) {
  opts = opts || {};
  const t0 = Date.now();
  const s = ps.open(INSTALL[game]);
  const rows = { tex: [], anm: [], mtl: null, counts: {}, loose: 0, errors: s.errors.length };
  const ents = s.entries;
  const rm = roleMap(ents, ps.read);
  rows.mtl = rm.mtlStats;
  let nT = 0, nA = 0;
  for (const e of ents) {
    const x = extOf(e.name);
    if (TEX_EXT.has(x)) {
      if (opts.limit && nT >= opts.limit) continue;
      nT++;
      let b; try { b = ps.read(e); } catch (er) { rows.tex.push({ key: e.key, error: 'read ' + er.message }); continue; }
      const h = textureHeader(e.name, b), st = stemOf(e.key), bs = baseStem(st);
      const roleSet = rm.roles.get(st) || rm.roles.get(bs);
      rows.tex.push(Object.assign({ key: e.key, ext: x, size: e.size, family: familyOf(e.key), kind: kindOf(e.key), suffix: suffixOf(st), variant: variantOf(st), roles: roleSet ? [...roleSet].sort() : [] }, h));
    } else if (x === '.anm') {
      if (opts.limit && nA >= opts.limit) continue;
      nA++;
      let b; try { b = ps.read(e); } catch (er) { rows.anm.push({ key: e.key, error: 'read ' + er.message }); continue; }
      const r = anmRow(e.key, b); r.family = familyOf(e.key); r.kind = kindOf(e.key);
      rows.anm.push(r);
    }
  }
  s.close();
  rows.ms = Date.now() - t0;
  return rows;
}

// ---------- classes ----------
function roleOf(t) {
  if (t.roles && t.roles.length) {
    const k = t.roles.map(r => r.split('.')[1]);
    const u = [...new Set(k)];
    return u.length === 1 ? u[0] : u.sort().join('+');
  }
  return 'unref' + (t.suffix ? ':' + t.suffix : '');
}
function texClass(t) {
  if (t.error) return 'ERR';
  const sz = !t.w ? '-' : (isPow2(t.w) && isPow2(t.h) ? 'p2' : 'npot');
  return [t.ext, t.fmt, t.alpha ? 'A' : 'noA', t.mips > 1 ? 'mip' : 'nomip', sz, roleOf(t)].join('|');
}
const isPow2 = n => n > 0 && (n & (n - 1)) === 0;
function anmClass(a) {
  if (a.error) return 'ERR:' + a.error;
  if (!a.bones) return 'header-only';
  return ['v' + (a.version >>> 0).toString(16), (a.kinds || []).join('+') || 'none', 'bones' + bucket(a.bones, [1, 10, 38, 60, 100, 255]), a.kind, 'frames' + bucket(a.frames, [1, 30, 100, 400])].join('|');
}
function tally(rows, fn) { const m = new Map(); for (const r of rows) { const k = fn(r); const o = m.get(k) || m.set(k, { n: 0, ex: [] }).get(k); o.n++; if (o.ex.length < 3) o.ex.push(r.key); } return m; }

function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

// ---------- pixel decode (top mip) ----------
function c565(v) { return [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31]; }
function decodeDds(b) {
  const h = ddsHeader(b); if (h.error) return null;
  const { w, h: ht, fmt } = h; let off = 128 + (fmt.startsWith('DX10') ? 20 : 0);
  const out = Buffer.alloc(w * ht * 4);
  const put = (x, y, r, g, bl, a) => { if (x >= w || y >= ht) return; const o = (y * w + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = a; };
  if (/^DXT[1-5]$/.test(fmt) || fmt === 'ATI2' || fmt === 'ATI1') {
    const bs = fmt === 'DXT1' || fmt === 'ATI1' ? 8 : 16;
    for (let by = 0; by < Math.ceil(ht / 4); by++) for (let bx = 0; bx < Math.ceil(w / 4); bx++, off += bs) {
      if (off + bs > b.length) return null;
      const alphaOf = (o, five) => { // DXT5-style 8-value interpolated channel block -> 16 values
        const a0 = b[o], a1 = b[o + 1], t = [a0, a1]; if (a0 > a1) for (let i = 1; i < 7; i++) t.push(((7 - i) * a0 + i * a1) / 7); else { for (let i = 1; i < 5; i++) t.push(((5 - i) * a0 + i * a1) / 5); t.push(0, 255); }
        let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(b[o + 2 + i]) << BigInt(8 * i);
        const v = []; for (let i = 0; i < 16; i++) v.push(t[Number((bits >> BigInt(3 * i)) & 7n)]); return v;
      };
      if (fmt === 'ATI1') { const v = alphaOf(off); for (let i = 0; i < 16; i++) put(bx * 4 + (i & 3), by * 4 + (i >> 2), v[i], v[i], v[i], 255); continue; }
      if (fmt === 'ATI2') { const r = alphaOf(off), g = alphaOf(off + 8); for (let i = 0; i < 16; i++) put(bx * 4 + (i & 3), by * 4 + (i >> 2), r[i], g[i], 0, 255); continue; }
      const co = bs === 8 ? off : off + 8, c0 = b.readUInt16LE(co), c1 = b.readUInt16LE(co + 2), p0 = c565(c0), p1 = c565(c1);
      const pal = [p0.concat(255), p1.concat(255)];
      if (c0 > c1 || bs === 16) { pal.push(p0.map((v, i) => (2 * v + p1[i]) / 3).concat(255), p0.map((v, i) => (v + 2 * p1[i]) / 3).concat(255)); }
      else { pal.push(p0.map((v, i) => (v + p1[i]) / 2).concat(255), [0, 0, 0, 0]); }
      const idx = b.readUInt32LE(co + 4);
      let av = null;
      if (fmt === 'DXT5') av = alphaOf(off);
      else if (fmt === 'DXT3' || fmt === 'DXT2') { av = []; for (let i = 0; i < 16; i++) av.push(((b[off + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17); }
      for (let i = 0; i < 16; i++) { const c = pal[(idx >> (2 * i)) & 3]; put(bx * 4 + (i & 3), by * 4 + (i >> 2), c[0], c[1], c[2], av ? av[i] : c[3]); }
    }
    return { w, h: ht, rgba: out, fmt };
  }
  if (fmt.startsWith('RAW')) {
    const bits = +fmt.match(/RAW(\d+)/)[1], bpp = bits / 8;
    if (bits !== 32 && bits !== 24) return null;
    const masks = [b.readUInt32LE(92), b.readUInt32LE(96), b.readUInt32LE(100), b.readUInt32LE(104)];
    const sh = m => m ? (m === 0xff ? 0 : m === 0xff00 ? 8 : m === 0xff0000 ? 16 : 24) : -1;
    const s = masks.map(sh);
    for (let i = 0; i < w * ht; i++) { const v = bpp === 4 ? b.readUInt32LE(off + i * 4) : b[off + i * 3] | b[off + i * 3 + 1] << 8 | b[off + i * 3 + 2] << 16; out[i * 4] = (v >>> s[0]) & 255; out[i * 4 + 1] = (v >>> s[1]) & 255; out[i * 4 + 2] = (v >>> s[2]) & 255; out[i * 4 + 3] = s[3] < 0 ? 255 : (v >>> s[3]) & 255; }
    return { w, h: ht, rgba: out, fmt };
  }
  return null;
}
function decodeTga(b) {
  const h = tgaHeader(b); if (h.error || h.cmap || ![2, 10].includes(h.tgaType) || ![24, 32].includes(h.bpp)) return null;
  const n = h.w * h.h, bp = h.bpp / 8, out = Buffer.alloc(n * 4); let p = 18 + h.idLen, i = 0;
  const wr = (q, s) => { const d = q * 4; out[d] = b[s + 2]; out[d + 1] = b[s + 1]; out[d + 2] = b[s]; out[d + 3] = bp === 4 ? b[s + 3] : 255; };
  if (h.tgaType === 2) for (; i < n; i++, p += bp) wr(i, p);
  else while (i < n && p < b.length) { const c = b[p++], cnt = (c & 127) + 1; if (c & 128) { for (let k = 0; k < cnt && i < n; k++, i++) wr(i, p); p += bp; } else for (let k = 0; k < cnt && i < n; k++, i++, p += bp) wr(i, p); }
  if (!h.topDown) { const row = h.w * 4, t = Buffer.alloc(out.length); for (let y = 0; y < h.h; y++) out.copy(t, y * row, (h.h - 1 - y) * row, (h.h - y) * row); return { w: h.w, h: h.h, rgba: t, fmt: h.fmt }; }
  return { w: h.w, h: h.h, rgba: out, fmt: h.fmt };
}
function decode(name, b) { const e = extOf(name); return e === '.dds' ? decodeDds(b) : e === '.tga' ? decodeTga(b) : null; }
// box-downsample to (w,h) by integer factors when possible, else nearest
function resample(img, w, h) {
  if (img.w === w && img.h === h) return img.rgba;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * img.w / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.w / w)), y0 = Math.floor(y * img.h / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.h / h));
    const a = [0, 0, 0, 0]; let c = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * img.w + xx) * 4; for (let k = 0; k < 4; k++) a[k] += img.rgba[o + k]; c++; }
    for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = a[k] / c;
  }
  return out;
}
// per-channel mean absolute difference + mean of each side, at the smaller common size (capped 256 for speed)
function pixelDiff(A, B) {
  const w = Math.min(A.w, B.w, 256), h = Math.min(A.h, B.h, 256);
  const a = resample(A, w, h), b = resample(B, w, h), d = [0, 0, 0, 0], ma = [0, 0, 0, 0], mb = [0, 0, 0, 0], n = w * h;
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { d[k] += Math.abs(a[i * 4 + k] - b[i * 4 + k]); ma[k] += a[i * 4 + k]; mb[k] += b[i * 4 + k]; }
  return { cmp: w + 'x' + h, mad: d.map(v => +(v / n).toFixed(2)), meanA: ma.map(v => +(v / n).toFixed(1)), meanB: mb.map(v => +(v / n).toFixed(1)) };
}
// pose compare for two parsed anm of the same bone names: first-frame pos/rot per bone
function poseDiff(a, b) {
  const A = anmFull.parse(a), B = anmFull.parse(b);
  const nameA = A.bones, nameB = B.bones, shared = nameA.filter(x => nameB.includes(x));
  const rec = (P, names) => { const m = new Map(); for (const r of P.recs) if (r.frame === 0 || !m.has(names[r.bone])) { const k = names[r.bone]; if (!m.has(k) || r.frame === 0) m.set(k, r); } return m; };
  const ra = rec(A, nameA), rb = rec(B, nameB);
  let n = 0, dp = 0, dr = 0, sa = 0, sb = 0;
  for (const k of shared) { const x = ra.get(k), y = rb.get(k); if (!x || !y) continue; if (x.pos && y.pos) { n++; dp += Math.hypot(...x.pos.map((v, i) => v - y.pos[i])); sa += Math.hypot(...x.pos); sb += Math.hypot(...y.pos); } if (x.rot && y.rot) dr += Math.hypot(...x.rot.map((v, i) => v - y.rot[i])); }
  return { sharedBones: shared.length, onlyA: nameA.length - shared.length, onlyB: nameB.length - shared.length, posPairs: n, meanPosDiff: n ? +(dp / n).toFixed(3) : null, meanPosLenA: n ? +(sa / n).toFixed(3) : null, meanPosLenB: n ? +(sb / n).toFixed(3) : null, meanRotDiff: n ? +(dr / n).toFixed(4) : null, versionA: A.version, versionB: B.version, framesA: A.frames, framesB: B.frames };
}

module.exports = { ddsHeader, tgaHeader, pngHeader, textureHeader, stemOf, baseStem, variantOf, suffixOf, familyOf, kindOf, resolveTex, parseMtl, roleMap, anmRow, census, texClass, anmClass, roleOf, tally, decode, decodeDds, decodeTga, resample, pixelDiff, poseDiff, median, INSTALL, extOf, sigOf };

// ---------- CLI ----------
if (require.main === module) {
  const args = process.argv.slice(2), cmd = args[0];
  const opt = k => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
  const out = opt('out') || path.resolve(ROOT, '..', 'run', 'sessions', 'w70', 'ASSET-SAME');
  const games = (opt('game') || 'both') === 'both' ? ['as2', 'goh'] : [opt('game')];
  if (cmd === 'census') {
    for (const g of games) {
      const r = census(g, { limit: opt('limit') ? +opt('limit') : 0 });
      fs.writeFileSync(path.join(out, 'census-' + g + '.json'), JSON.stringify(r));
      console.log(g, 'textures', r.tex.length, 'anm', r.anm.length, r.ms + ' ms', 'paks with errors', r.errors);
    }
  } else if (cmd === 'compare') {
    require('./compare').run(out, module.exports);
  } else console.log('usage: assetsame.js census|compare [--out dir] [--game as2|goh|both] [--limit n]');
}
