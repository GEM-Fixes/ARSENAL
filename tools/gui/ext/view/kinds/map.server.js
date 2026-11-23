// view kind map, server side (../README.md): the binary files of a map folder (resource/map/**) open on the Maps page, with that map
// selected. What is text and what is bytes in a map folder (vanilla map.pak, map_dlc_1/2.pak, looked at 2026-11-12) [V]:
//   text (the Editor edits them, not claimed): map (no extension: {map {Land ..}}), *.mi missions, map.info, mtlN.mtl, *.set, *.mod
//   bytes, claimed here: map.grs (grass, 'GRAS' 'PMAP'), map.net (land grid, 'EMAP' inside its header), map.ply (ground mesh, 'BPLY')
//   pictures (the picture kind): preview.dds, preview_small.dds, minimap.dds, *.png
// service/land (entity/e1.pak: land, map.net, map.ply) is no map of the Maps list: not claimed, it opens as bytes.
//   GET /api/x/view/map/info?<ref> -> { map: 'map/multi/<folder>' | null, file: 'grs'|'net'|'ply'|other ext, size, grass: [names] | null }
//     map = the map folder the Maps page selects (from the key, a mod pak entry or a path); grass = the pattern names of map.grs (the
//     'GRAS' 'PMAP' header: i32 count, then count names, each one length byte + the name; [V 113 vanilla].
// Reads only the head of the file (64 KB), never writes.
// Author: Imperator_Aug (ARSENAL, ia-e95d5e34)
'use strict';
const R = require('../ref');

const BIN = ['grs', 'net', 'ply'];
const low = s => String(s == null ? '' : s).replace(/\\/g, '/').toLowerCase();
// a path or key -> its path below resource/ ('map/multi/x/map.grs'), or the path itself
function under(n) {
  const i = n.lastIndexOf('/resource/');
  if (i >= 0) n = n.slice(i + 10); else if (n.startsWith('resource/')) n = n.slice(9);
  return n.replace(/^\/+/, '');
}
// a name, key, path or rel (a mod pak entry '<pak>::<entry>') -> its path below resource/. A pak entry counts from the folder
// the pak sits in when that folder is under resource/ (lib/vfs mountDir: resource/map/multi.pak holds multi/<folder>/map.net,
// the Gates of Hell layout), else from resource/ (resource.pak) [V lib/vfs.js, GoH multi.pak entry names]. Same rule as the page.
function flat(s) {
  const n = low(s);
  if (!n.includes('::')) return under(n);
  const p = n.split('::'), e = p.pop().replace(/^\/+/, ''), pk = p[0], d = pk.slice(0, pk.lastIndexOf('/') + 1);
  const pre = d && (d.startsWith('resource/') || d.includes('/resource/')) ? under(d + 'x').replace(/x$/, '') : '';
  return under(pre + e);
}
// the map folder of a file (the folder that holds it). Every folder part after map/ must be a name: '', '.' and '..' are refused.
// wide (the Map Viewer path, used by match): any folder under map/ but the bare containers multi and single, as the Map Viewer
// list keys maps (tools/mapviz/lib/mapkit/source.js; GoH ships resource/map/1) [V GoH install listing]. Not wide (the Maps page
// form, the info route's map field): map/multi/... and map/single/... only, as that page's server takes (maps/index.js).
function mapOf(s, wide) {
  const p = flat(s).split('/');
  if (p.length < 3 || p[0] !== 'map' || !p[p.length - 1]) return null;
  const d = p.slice(1, -1);
  if (d.some(x => x === '' || x === '.' || x === '..')) return null;
  if (wide) { if (d.length === 1 && (d[0] === 'multi' || d[0] === 'single')) return null; }
  else if (d.length < 2 || (d[0] !== 'multi' && d[0] !== 'single')) return null;
  return 'map/' + d.join('/');
}
const extOf = s => { const b = low(s).split('/').pop().split('::').pop(), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1) : ''; };
function match(name, key) { return [key, name].some(s => s && !!mapOf(s, true) && BIN.includes(extOf(s))); }

function grassNames(b) {
  if (!b || b.length < 12 || b.toString('latin1', 0, 8) !== 'GRASPMAP') return null;
  const n = b.readInt32LE(8), out = []; let o = 12;
  if (n < 0 || n > 4096) return null;
  for (let i = 0; i < n && o < b.length; i++) { const l = b[o++]; if (o + l > b.length) break; out.push(b.toString('latin1', o, o + l)); o += l; }
  return out;
}

async function info(url, body, ctx) {
  const q = R.refOfQuery(url), r = R.resolve(ctx, q), file = extOf(r.name);
  const map = mapOf(r.key || '') || mapOf(r.rel || '') || mapOf(r.entry || '') || mapOf(r.file || '') || null;
  let grass = null;
  if (file === 'grs') grass = grassNames(await R.readRange(r.src, 0, Math.min(r.size, 65536)));
  return { map, file, size: r.size, grass, name: r.name, where: r.where };
}

module.exports = {
  exts: [],
  match,
  routes: { 'GET /api/x/view/map/info': info },
  remote: ['GET /api/x/view/map/info'],
  _t: { mapOf, under, grassNames, match },
};
