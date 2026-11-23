// render mats (MV-R1): the ground materials of a map.ply and the texture files they name (design 7 L1;
// render.md; F1-F3). Parent side of L1 only: reads the game through a mapkit src.
//   materials(src, key, parts) -> {parts:[{material, from, layers:[{diffuse, color:[r,g,b,a]}] | null, bad?}], files:{name: sha1},
//       global:{diffuse, normal} | null, notes:[text]}
//     A part's material 'mtlN.mtl' is read as the file resource/map/<key>/mtlN.mtl first (AS2, AS64), else as the entry
//     "mtlN" of the map folder's .materials library (GoH; the engine order , render.md:25). A part
//     no material name but an inline layered material (ply) uses that. layers = the 'layer' blocks in file order (the L1
//     rule uses the first two: layer 0 weighted by vertex alpha, layer 1 by 1 - alpha); diffuse = the texture name as
//     written (no extension), color = the layer {color 0xAARRGGBB} (white when absent). layers null = no material found.
//     global = the {GlobalTexture {Diffuse ..}{Normalmap ..}} block of the map head (GoH), names as written.
//   texture(src, name) -> {key, buf, via:[key]} | {key, buf: null, via, error} | null   resource key of a texture name: name.dds, else name.ebm followed:
//     {reference "x"} names another texture (absolute from resource/ when it starts with '/', else beside the .ebm),
//     {bitmap {frame "x.dds"}} names a frame file beside the .ebm; at most 6 steps (this follower is MV-R1's own, README 12)
//   strip(text) -> text without ';' comments outside strings; tree(text) -> the brace tree of tools/mapport/carry.js parse,
//     or null when its first block holds a quote that is never closed (carry.js parse would loop forever on it; safeEnd
//     walks the text the way that parse does, without recursion, and finds it first)
//   A text that cannot be read (unclosed quote, a throw while reading) never throws out of here: materials() gives the part
//   layers null with bad true and a note (l1: gap RENDER_MATERIAL_BAD); globalOf() gives null and a note; texture() gives
//   {key, buf: null, via, error} for an .ebm it cannot read (l1: gap RENDER_TEXTURE_BAD).
// Author: Imperator_Aug (ARSENAL, ia-df659195)
'use strict';
const crypto = require('crypto');

const MAX_HOPS = 6;
let CARRY = null;
function carry() { if (!CARRY) CARRY = require('../../mapport/carry'); return CARRY; }

function strip(s) {
  let t = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    if (!q && c === ';') { while (i < s.length && s[i] !== '\n') i++; t += '\n'; continue; }
    t += c;
  }
  return t;
}
// index after the first top-level block as carry.js parse reads it (same token rules: a quote opens a string only where a
// token starts), or -1 when that parse would meet a quote with no closing quote
function safeEnd(t) {
  let i = 0;
  while (i < t.length && t[i] !== '{') i++;
  let d = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '{') { d++; i++; continue; }
    if (c === '}') { d--; i++; if (d <= 0) return i; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { const j = t.indexOf('"', i + 1); if (j < 0) return -1; i = j + 1; continue; }
    while (i < t.length && !/[\s{}]/.test(t[i])) i++;
  }
  return t.length;
}
function tree(text) {
  const s = strip(String(text));
  return safeEnd(s) < 0 ? null : carry().parse(s);
}
const unq = v => String(v == null ? '' : v).replace(/^"|"$/g, '');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const lower = s => String(s).replace(/\\/g, '/').toLowerCase();

function colorOf(v) {
  const m = /^0x([0-9a-f]{1,8})$/i.exec(String(v || ''));
  if (!m) return [255, 255, 255, 255];
  const n = parseInt(m[1], 16) >>> 0;
  return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, (n >>> 24) & 255];
}

// the layers of a material node (its 'layer' kids; a 'layered' layer nests: its own layers are taken in order)
function layersOf(node) {
  const out = [];
  const walk = n => {
    for (const k of n.kids || []) {
      if (lower(k.k) !== 'layer') continue;
      const kinds = (k.v || []).map(lower);
      if (kinds.includes('layered')) { walk(k); continue; }
      let diffuse = null, color = [255, 255, 255, 255];
      for (const c of k.kids || []) {
        const nm = lower(c.k);
        if (nm === 'diffuse' && c.v && c.v.length) diffuse = unq(c.v[0]);
        else if (nm === 'color' && c.v && c.v.length) color = colorOf(c.v[0]);
      }
      out.push({ diffuse, color });
    }
  };
  walk(node);
  return out;
}

function inlineLayers(im) {
  if (!im || !Array.isArray(im.layers)) return null;
  const out = [];
  const walk = list => {
    for (const L of list) {
      if (L && Array.isArray(L.layers) && L.layers.length) { walk(L.layers); continue; }
      const d = (L && L.textures || []).find(t => lower(t.layer) === 'diffuse');
      out.push({ diffuse: d ? d.texture : null, color: [255, 255, 255, 255] });
    }
  };
  walk(im.layers);
  return out.length ? out : null;
}

function globalOf(src, key, notes) {
  const k = 'resource/map/' + key + '/map';
  const b = src.has(k) ? src.read(k) : null;
  if (!b) return null;
  const t = b.toString('latin1');
  const i = t.search(/\{\s*GlobalTexture\b/i);
  if (i < 0) return null;
  const n = tree(t.slice(i));
  if (!n) { if (notes) notes.push('map head GlobalTexture block: a quote is never closed, the block is not read'); return null; }
  let diffuse = null, normal = null;
  for (const c of n.kids || []) {
    const nm = lower(c.k);
    if (nm === 'diffuse' && c.v && c.v.length) diffuse = unq(c.v[0]);
    if (nm === 'normalmap' && c.v && c.v.length) normal = unq(c.v[0]);
  }
  return diffuse || normal ? { diffuse, normal } : null;
}

function materials(src, key, parts) {
  const dir = 'resource/map/' + key + '/';
  const files = {}, notes = [];
  let lib = null, libRead = false, libBad = false;
  const library = () => {
    if (libRead) return lib;
    libRead = true;
    const k = dir + '.materials';
    if (!src.has(k)) return null;
    try {
      const b = src.read(k);
      if (!b) return null;
      files['.materials'] = sha1(b);
      const root = tree(b.toString('latin1'));
      if (!root) { libBad = true; notes.push('.materials: a quote is never closed, the library is not read'); return null; }
      lib = new Map();
      for (const e of root.kids || []) if (e.k) lib.set(lower(unq(e.k)), e);
    } catch (e) {
      libBad = true; lib = null;
      notes.push('.materials cannot be read: ' + (e && e.message || e));
    }
    return lib;
  };
  const cache = new Map();
  const out = (parts || []).map(p => {
    const name = p && p.material ? String(p.material) : '';
    if (!name) {
      const il = inlineLayers(p && p.inlineMaterial);
      return { material: null, from: il ? 'inline' : null, layers: il };
    }
    const lk = lower(name);
    if (cache.has(lk)) return Object.assign({ material: name }, cache.get(lk));
    let r = { from: null, layers: null };
    const fk = dir + lk;
    try {
      if (src.has(fk)) {
        const b = src.read(fk);
        files[lk] = sha1(b);
        const n = tree(b.toString('latin1'));
        if (n) r = { from: lk, layers: layersOf(n) };
        else { r = { from: lk, layers: null, bad: true }; notes.push('part material ' + name + ': a quote is never closed in ' + lk + ', the part is drawn flat'); }
      } else {
        const L = library();
        const e = L && L.get(lk.replace(/\.mtl$/, ''));
        if (e) r = { from: '.materials', layers: layersOf(e) };
        else if (libBad) r = { from: '.materials', layers: null, bad: true };
        else notes.push('part material ' + name + ': no ' + lk + ' in the map folder' + (L ? ' and no entry in .materials' : ''));
      }
    } catch (e) {
      r = { from: r.from, layers: null, bad: true };
      notes.push('part material ' + name + ' cannot be read: ' + (e && e.message || e));
    }
    cache.set(lk, r);
    return Object.assign({ material: name }, r);
  });
  let global = null;
  try { global = globalOf(src, key, notes); } catch (e) { notes.push('map head GlobalTexture block cannot be read: ' + (e && e.message || e)); }
  if (global && src.has(dir + 'map')) files.map = sha1(src.read(dir + 'map'));
  return { parts: out, files, global, notes };
}

// texture name -> resource key candidates
function candidates(name, base) {
  let n = lower(name).trim();
  if (!n) return [];
  let root;
  if (n[0] === '/') root = 'resource' + n;
  else if (/^resource\//.test(n)) root = n;
  else if (base) root = base + n;
  else root = 'resource/' + n;
  if (/\.(dds|ebm)$/.test(root)) return [root];
  return [root + '.dds', root + '.ebm'];
}

function texture(src, name, base, hops, via) {
  hops = hops || 0; via = via || [];
  if (!name || hops > MAX_HOPS) return null;
  for (const k of candidates(name, base)) {
    if (!src.has(k)) continue;
    const buf = src.read(k);
    if (!buf) continue;
    if (/\.dds$/.test(k)) return { key: k, buf, via: via.concat(k) };
    // .ebm: a reference or a bitmap frame
    const folder = k.slice(0, k.lastIndexOf('/') + 1);
    let n = null, why = 'a quote is never closed';
    try { n = tree(buf.toString('latin1')); } catch (e) { n = null; why = String(e && e.message || e); }
    if (!n) return { key: k, buf: null, via: via.concat(k), error: k + ': ' + why };
    const head = lower(n.k);
    if (head === 'reference' && n.v && n.v.length) return texture(src, unq(n.v[0]), folder, hops + 1, via.concat(k));
    for (const c of n.kids || []) {
      if (lower(c.k) === 'reference' && c.v && c.v.length) return texture(src, unq(c.v[0]), folder, hops + 1, via.concat(k));
      if (lower(c.k) === 'frame' && c.v && c.v.length) return texture(src, unq(c.v[0]), folder, hops + 1, via.concat(k));
    }
    if (head === 'bitmap' || head === 'frame') {
      const f = (n.kids || []).find(c => lower(c.k) === 'frame');
      if (f && f.v && f.v.length) return texture(src, unq(f.v[0]), folder, hops + 1, via.concat(k));
    }
    return null;
  }
  return null;
}

module.exports = { materials, texture, strip, tree, safeEnd, layersOf, colorOf, globalOf, candidates };
