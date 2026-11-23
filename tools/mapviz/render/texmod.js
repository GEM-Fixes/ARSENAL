// render texmod (MV-R2, builder R2b): object materials and their textures for the scene pack (design 7 L3; freeze render.md
// 3.3, 4.3). Parent side only: reads the game through an io {has(key), read(key) -> Buffer|null, keys() -> iterable of vfs
// keys} (entcat's loader gives one: ioOf(L)).
//   ioOf(L) -> io over a scenecache loader (reads land in L.reads())
//   readMtl(io, mtlKey, target) -> {key, type, diffuse, lightmap, blend:'none'|'test'|'blend', alpharef, a2c, color:[r,g,b,a],
//       noLight, bad?: text}     a .mtl text as the engine reads it (modweb formats/textures; GHFMT-11 keys) [V keys, I maths]:
//       diffuse = the first {diffuse "x"} (a 'layered' material: the first one found depth first); blend test|blend|none,
//       add and sub drawn as blend [I]; alpharef = {alpharef n}, else 128 [I]; a2c = {alphatocoverage}; color =
//       {color 0xAARRGGBB} or {color "r g b gloss"} (the 4th number is gloss, not alpha: a = 255) [V textures.md], white
//       when absent; lightmap = {lightmap "x"} on goh only (GoH texture slot 1 on every material, GHFMT-11/28 [V]); as64
//       and mowas2 have no such key and it is ignored there.
//   stems(name, mtlKey) -> [resource key stem]   texture name -> candidate stems (no extension) in lookup order:
//       '$/x' -> resource/texture/common/x, then resource/entity/x, resource/texture/x [V
//       tools/assetsame]; '/x' -> resource/x; a bare name -> beside the .mtl, then resource/texture/common/x [I]
//   variants(io) -> Map(stem -> Map(variant -> key))   the `T#/` listing of the whole stack: every image key holding
//       `#`, stem = the key before '#', variant = the text after '#' up to the extension (a trailing '$' kept: `$`
//       variants are static here, design 7 L3); the winner among extensions as tools/lib/model/picture.js winner
//   commonIndex(io) -> Map(basename -> Map(variant -> key)) of the variants under resource/texture/common/ (GoH lookup)
//   resolve(io, name, o) -> {key, variant, from:'default'|'texmod'|'common', stem} | null
//       o = {mtlKey, tm (texModOf form) | variant (one word), target, vix, cix}. TexMod chain (design 7 L3, as
//        [V]): the per-texture entry whose title is the texture's title, else the
//       record's head word (or its {default}); that variant when a `<stem>#<variant>` image exists (from 'texmod'); on goh,
//       else a variant of that basename under resource/texture/common/ (from 'common': GoH looks variant frames up in
//       common_textures [V GHVIS-42; I where]); then the same for {default}; else the default texture (from 'default').
//       A descriptor (.tex > .ebm) is followed through {reference}/{frame} (at most 6 steps). No image at all -> null.
//       The same chain on as64, mowas2 and goh [I, the record form is the same].
//   texModOf(v, d, entries) -> {v, d, e:[[title, variant]]} | null;  texModKey(tm) -> string | null (geoms[].variant)
//   winnerKey(io, stem) -> key   the image the game loads for a stem (.tex > .ebm > the last of .dds .tga .bmp .jpg .png)
// Author: Imperator_Aug (ARSENAL, ia-84419dad)
'use strict';

const IMAGES = ['.dds', '.tga', '.bmp', '.jpg', '.png'];
const lc = s => String(s == null ? '' : s).toLowerCase().replace(/\\/g, '/');
const unq = v => String(v == null ? '' : v).replace(/^"|"$/g, '');
const MAX_HOPS = 6;

function ioOf(L) {
  return { has: k => L.vfs().files.has(k), read: k => L.read(k), keys: () => L.vfs().files.keys() };
}

function colorOf(v) {
  const s = unq(v).trim();
  let m = /^0x([0-9a-f]{1,8})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16) >>> 0; return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, (n >>> 24) & 255]; }
  m = s.split(/\s+/).map(Number);
  if (m.length >= 3 && m.slice(0, 3).every(x => Number.isFinite(x))) return [m[0], m[1], m[2], 255].map(x => Math.max(0, Math.min(255, Math.round(x))));
  return [255, 255, 255, 255];
}

function readMtl(io, mtlKey, target) {
  const out = { key: mtlKey, type: null, diffuse: null, lightmap: null, blend: 'none', alpharef: 128, a2c: false, color: [255, 255, 255, 255], noLight: false };
  const buf = io.read(mtlKey);
  if (!buf) { out.bad = 'missing'; return out; }
  let n = null;
  try { n = require('./mats').tree(buf.toString('latin1')); } catch (e) { n = null; }
  if (!n) { out.bad = 'unreadable'; return out; }
  out.type = n.v && n.v.length ? lc(unq(n.v[0])) : null;
  const walk = node => {
    for (const c of node.kids || []) {
      const k = lc(c.k), v = c.v || [];
      if (k === 'diffuse' && !out.diffuse && v.length) out.diffuse = unq(v[0]);
      else if (k === 'lightmap' && !out.lightmap && v.length && target === 'goh') out.lightmap = unq(v[0]);
      else if (k === 'blend' && v.length) { const b = lc(v[0]); out.blend = b === 'test' ? 'test' : b === 'none' ? 'none' : 'blend'; }
      else if (k === 'alpharef' && v.length && Number.isFinite(Number(v[0]))) out.alpharef = Math.max(0, Math.min(255, Math.round(Number(v[0]))));
      else if (k === 'alphatocoverage') out.a2c = true;
      else if (k === 'color' && v.length) out.color = colorOf(v.join(' '));
      else if (k === 'nolight') out.noLight = true;
      else if (k === 'layer' || k === 'layered') walk(c);
    }
  };
  walk(n);
  return out;
}

function stems(name, mtlKey) {
  let n = lc(name).trim().replace(/\.(dds|tga|bmp|jpg|png|ebm|tex)$/, '');
  if (!n) return [];
  if (n[0] === '#') return [];   // a g_textureMap alias (.ctm): not read [I]
  if (n.startsWith('$/')) { const r = n.slice(2); return ['resource/texture/common/' + r, 'resource/entity/' + r, 'resource/texture/' + r]; }
  if (n.startsWith('//')) return [n.slice(2)];
  if (n[0] === '/') return ['resource' + n];
  if (n.startsWith('resource/')) return [n];
  const dir = mtlKey ? lc(mtlKey).slice(0, lc(mtlKey).lastIndexOf('/') + 1) : 'resource/';
  const norm = k => require('path').posix.normalize(k).replace(/^\/+/, '');
  return [norm(dir + n), norm('resource/texture/common/' + n)];
}

function winnerKey(io, stem) {
  for (const e of ['.tex', '.ebm']) if (io.has(stem + e)) return stem + e;
  let w = null;
  for (const e of IMAGES) if (io.has(stem + e)) w = stem + e;
  return w;
}

// a descriptor (.tex/.ebm) -> the image it names ({reference "x"} or {bitmap {frame "x"}}); null when none
function follow(io, key, hops) {
  if (!/\.(tex|ebm)$/.test(key)) return key;
  if (hops > MAX_HOPS) return null;
  const buf = io.read(key);
  if (!buf) return null;
  let n = null;
  try { n = require('./mats').tree(buf.toString('latin1')); } catch (e) { n = null; }
  if (!n) return null;
  const dir = key.slice(0, key.lastIndexOf('/') + 1);
  let target = null;
  const head = lc(n.k);
  if (head === 'reference' && n.v && n.v.length) target = unq(n.v[0]);
  for (const c of n.kids || []) {
    if (target) break;
    const k = lc(c.k);
    if ((k === 'reference' || k === 'frame') && c.v && c.v.length) target = unq(c.v[0]);
  }
  if (!target) return null;
  for (const s of stems(target, dir + 'x.mtl')) {
    const w = winnerKey(io, s);
    if (w) return follow(io, w, hops + 1);
  }
  return null;
}

function variants(io) {
  const m = new Map();
  for (const k0 of io.keys()) {
    const k = String(k0);
    const h = k.lastIndexOf('#');
    if (h < 0 || !k.startsWith('resource/')) continue;
    const dot = k.lastIndexOf('.');
    if (dot < h) continue;
    const ext = k.slice(dot);
    if (!IMAGES.includes(ext) && ext !== '.tex' && ext !== '.ebm') continue;
    const stem = k.slice(0, h), v = k.slice(h + 1, dot);
    if (!m.has(stem)) m.set(stem, new Map());
    const vm = m.get(stem);
    if (!vm.has(v)) vm.set(v, []);
    vm.get(v).push(k);
  }
  const out = new Map();
  for (const [stem, vm] of m) {
    const o = new Map();
    for (const [v, ks] of vm) {
      const st = stem + '#' + v, have = new Set(ks);
      let w = null;
      for (const e of ['.tex', '.ebm']) if (!w && have.has(st + e)) w = st + e;
      if (!w) for (const e of IMAGES) if (have.has(st + e)) w = st + e;
      if (w) o.set(v, w);
    }
    out.set(stem, o);
  }
  return out;
}

function commonIndex(vix) {
  const out = new Map();
  const keys = [...vix.keys()].filter(s => s.startsWith('resource/texture/common/')).sort();
  for (const stem of keys) {
    const b = stem.slice(stem.lastIndexOf('/') + 1);
    if (!out.has(b)) out.set(b, new Map());
    const m = out.get(b);
    for (const [v, k] of vix.get(stem)) if (!m.has(v)) m.set(v, k);
  }
  return out;
}

// a map record's TexMod as the engine reads it: {TexMod "v" {"texture" "variant"} ... {default "d"}}
//   -> {v, d, e:[[title, variant]]} | null (no variant at all). v = the head word, else d; e = per-texture entries.
function texModOf(v, d, e) {
  const V = v == null || v === '' ? null : lc(v), D = d == null || d === '' ? null : lc(d);
  const E = (e || []).filter(x => x && x[0] != null && x[0] !== '').map(x => [titleOf(x[0]), x[1] == null ? '' : lc(x[1])]);
  if (!V && !D && !E.length) return null;
  return { v: V || D, d: D, e: E };
}
// one string per TexMod (geoms[].variant): 'aut' for a plain word, else 'aut{default=x;bark=win}'
function texModKey(tm) {
  if (!tm) return null;
  if (!tm.d && !tm.e.length) return tm.v;
  return (tm.v || '') + '{' + [].concat(tm.d ? ['default=' + tm.d] : [], tm.e.map(x => x[0] + '=' + x[1])).join(';') + '}';
}
// a texture's title: the file name without folder, variant and extension (name PART_TITLE)
function titleOf(name) {
  let n = lc(name).trim();
  n = n.slice(n.lastIndexOf('/') + 1);
  const h = n.indexOf('#');
  if (h >= 0) n = n.slice(0, h);
  return n.replace(/\.(dds|tga|bmp|jpg|png|ebm|tex)$/, '');
}
// the variant a TexMod asks of one texture stem, then the fallback ( [V]): the per-texture
// entry whose title matches, else the head word (or default); when the texture has no such variant, the default.
function wantedOf(tm, stem) {
  if (!tm) return [];
  const t = titleOf(stem);
  const en = tm.e.find(x => x[0] === t);
  const w = en ? en[1] : tm.v;
  if (!w) return [];
  return tm.d && tm.d !== w ? [w, tm.d] : [w];
}

function resolve(io, name, o) {
  o = o || {};
  const list = stems(name, o.mtlKey);
  // o.tm (texModOf form) or o.variant (one word, the same as {TexMod "word"})
  const tm = o.tm !== undefined ? o.tm : texModOf(o.variant, null, null);
  for (const s of list) {
    const base = winnerKey(io, s);
    if (!base) continue;
    for (const variant of o.vix ? wantedOf(tm, s) : []) {
      const vm = o.vix.get(s);
      const vk = vm && vm.get(variant);
      if (vk) { const k = follow(io, vk, 0); if (k) return { key: k, variant, from: 'texmod', stem: s }; }
      if (o.target === 'goh' && o.cix) {
        const b = s.slice(s.lastIndexOf('/') + 1), cm = o.cix.get(b), ck = cm && cm.get(variant);
        if (ck) { const k = follow(io, ck, 0); if (k) return { key: k, variant, from: 'common', stem: s }; }
      }
    }
    const k = follow(io, base, 0);
    if (k) return { key: k, variant: null, from: 'default', stem: s };
  }
  return null;
}

// does a stem have the variant (the TexMod chain checks every texture of a def: RENDER_TEXMOD_MISSING when none has it)
function hasVariant(stem, variant, o) {
  if (!variant || !o || !o.vix) return false;
  const vm = o.vix.get(stem);
  if (vm && vm.has(lc(variant))) return true;
  if (o.target === 'goh' && o.cix) { const cm = o.cix.get(stem.slice(stem.lastIndexOf('/') + 1)); if (cm && cm.has(lc(variant))) return true; }
  return false;
}

module.exports = { ioOf, readMtl, stems, winnerKey, follow, variants, commonIndex, resolve, hasVariant, colorOf, IMAGES,
  texModOf, texModKey, titleOf, wantedOf };
