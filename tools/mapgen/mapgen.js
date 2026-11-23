#!/usr/bin/env node
// mapgen: a new multiplayer map from a height image and painted masks (HI-1). Nothing of a game is needed to run it.
//   node tools/mapgen/mapgen.js --height <h.pgm|h.raw> [--layers <dir>] --name <n> --out <mod> [--size WxH] [--zmin 0] [--zmax 300]
//        [--raw-size WxH] [--clone <map folder>] [--slots N] [--target|--exe as64|mowas2] [--force] [-q]
//   --target (game parity): the game the mod.info range is for. --exe as64|mowas_2|mowas2|goh (the common game word) means the same
//     when no --target is given. as64 (default, as before): MinGameVersion 3.301. mowas2: the Classic
//     range 3.262.0..3.262.1 (tools/newmod RANGE, the one source); the map files are the same AS2 form for both [I: MoW:AS2 reads cell 10 v2].
//     goh: refused (exit 2, one line): a GoH map is cell 5 with a .materials layer file and map.omask, whose forms no note covers
//     (gohweb maps/goh-map-net-scene "not covered"); GHMAP-06, GHMAP-16 give only the map.net part.
//   --slots N: map.info maxPlayers N (even, 2-16, default 2); without --clone, N/2 spawn points a team (a1..aN, b1..bN, order 1..N as stock 2v2)
//   node tools/mapgen/mapgen.js --check <map folder> [-q]     reads a written map back; exit 1 when it is broken
// height: PGM P5 8/16-bit (16-bit big endian, as PGM says) or P2, or .raw u16 little endian (--raw-size, square assumed without it).
//   Image row 0 = net row 0 = lowest world y; column 0 = lowest world x. z = zmin + value/max*(zmax-zmin), map units, bilinear onto the cells.
// layers: <dir>/<ground>.pgm, any size, stretched over the map; value >= half = painted. Later wins: grass (the base), sand, mud, rock, road, no_pass.
// cell 10 only (PORT-70). Cells round up to 6k+1, so the render mesh (one quad per 6 cells = 60 units, stock 59.06) ends on a net vertex.
// map.ply: Y is the NEGATIVE of the map.net world y [V on 2 stock maps: mean |dz| 0.95 and 0.13 flipped, 25.47 and 1.94 not]; normals in mesh space,
//   winding, vertex layout, flags, BAS2 and uv signs as stock. A quad's part = the ground most of its 6x6 cells have, so seams are hard, 60 units wide steps.
// mtlN.mtl: 2 equal layers (MAP-29), so vertex alpha (the stock layer blend) has nothing to choose between. Texture names as stock 1v1_reloading_point uses them.
// --clone <folder of a stock cell-10 map, unpacked>: combat.mi taken from its combat.mi with spawn points and speakers moved, all other keys kept
//   and Tags of objects that are not in the .mi dropped. Without it a minimal mission of the same keys. A clone of another cell is refused.
// Writes <out>/resource/map/multi/<name>/{map map.net map.ply map.info combat.mi mtlN.mtl}, <out>/localization/mission/multi/<name>.lng,
//   <out>/mod.info if none, <out>/mapgen.<name>.json = what was generated, taken from a clone, copied unchanged, and never written.
// codes: MAPGEN_ARGS MAPGEN_IN_INSTALL MAPGEN_BAD_IMAGE MAPGEN_BAD_LAYER MAPGEN_BAD_CLONE MAPGEN_EXISTS MAPGEN_NO_SPAWN, --check: MAPGEN_MISSING MAPGEN_NET MAPGEN_PLY
//   MAPGEN_MTL MAPGEN_MESH_OFF MAPGEN_MESH_UNFLIPPED MAPGEN_CLIP MAPGEN_SPAWN; info: MAPGEN_STATS MAPGEN_STEEP MAPGEN_WROTE MAPGEN_NOT_REACHED
// Author: Imperator_Aug (ARSENAL, ia-7c639b9c)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const mapnet = require('../lib/mapnet'), plylib = require('../lib/ply'), { createReport } = require('../lib/report');

const CELL = 10, QUAD = 6, TEX = 300, MAX_DIM = 4000;
const TYPES = { ground: 1, no_pass: 2, road: 7 }, MATS = { ground: 1, road: 9, rock: 11, sand: 14, mud: 16, grass: 18 };
const GROUNDS = {   // order = paint order
  grass: { type: 'ground', mat: 'grass', tex: '/texture/land/grass/gramma_8' },
  sand: { type: 'ground', mat: 'sand', tex: '/texture/land/sand/floor_sand2b' },
  mud: { type: 'ground', mat: 'mud', tex: '/texture/land/fields/stubble_field3a' },
  rock: { type: 'ground', mat: 'rock', tex: '/texture/land/rock/pebble_derkgray' },
  road: { type: 'road', mat: 'road', tex: '/texture/land/town/asfalt_road2' },
  no_pass: { type: 'no_pass', mat: 'rock', tex: '/texture/land/rock/pebble_derkgray' },
};
const NOT_REACHED = ['objects: `map` holds no Entity (no tree, house, fence)', 'grass: no map.grs', 'water: no {Ocean}', 'preview.dds, preview_small.dds: not written (minimap.dds is: flat colour per ground, no objects)',
  'soft ground seams: no vertex-alpha layer blend', 'battle_zones and other modes: combat.mi only'];

const tag = s => Buffer.from(s, 'latin1');
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const f32s = l => { const b = Buffer.alloc(l.length * 4); l.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
class Refuse extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// ---- images ----
function parsePgm(buf, label) {
  let p = 0;
  const tok = () => {
    for (;;) {
      while (p < buf.length && /\s/.test(String.fromCharCode(buf[p]))) p++;
      if (buf[p] !== 0x23) break;
      while (p < buf.length && buf[p] !== 10) p++;
    }
    const s = p; while (p < buf.length && !/\s/.test(String.fromCharCode(buf[p]))) p++;
    return buf.toString('latin1', s, p);
  };
  const magic = tok();
  if (magic !== 'P5' && magic !== 'P2') throw new Refuse('MAPGEN_BAD_IMAGE', `${label}: not a PGM (P5/P2), starts ${JSON.stringify(magic.slice(0, 4))}`);
  const w = +tok(), h = +tok(), max = +tok();
  if (!(w > 0 && h > 0 && max > 0 && max <= 65535)) throw new Refuse('MAPGEN_BAD_IMAGE', `${label}: bad PGM header ${w} ${h} ${max}`);
  const px = new Float64Array(w * h);
  if (magic === 'P2') { for (let i = 0; i < w * h; i++) { const t = tok(); if (t === '') throw new Refuse('MAPGEN_BAD_IMAGE', `${label}: ${i} of ${w * h} values`); px[i] = +t / max; } return { w, h, px }; }
  p++;   // one whitespace byte after maxval
  const bpp = max > 255 ? 2 : 1;
  if (buf.length - p !== w * h * bpp) throw new Refuse('MAPGEN_BAD_IMAGE', `${label}: ${buf.length - p} pixel bytes, header says ${w * h * bpp}`);
  for (let i = 0; i < w * h; i++) px[i] = (bpp === 2 ? buf.readUInt16BE(p + i * 2) : buf[p + i]) / max;
  return { w, h, px };
}
function parseRaw(buf, size, label) {
  let w, h;
  if (size) [w, h] = size;
  else { w = h = Math.round(Math.sqrt(buf.length / 2)); }
  if (buf.length !== w * h * 2) throw new Refuse('MAPGEN_BAD_IMAGE', `${label}: ${buf.length} bytes is not ${w}x${h} u16; give --raw-size WxH`);
  const px = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) px[i] = buf.readUInt16LE(i * 2) / 65535;
  return { w, h, px };
}
function readImage(file, rawSize) {
  let buf; try { buf = fs.readFileSync(file); } catch (e) { throw new Refuse('MAPGEN_BAD_IMAGE', `${file}: can't read`); }
  return /\.raw$/i.test(file) ? parseRaw(buf, rawSize, file) : parsePgm(buf, file);
}
const lerp = (img, u, v) => {   // u,v 0..1
  const fx = u * (img.w - 1), fy = v * (img.h - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1), tx = fx - x0, ty = fy - y0;
  const P = (x, y) => img.px[y * img.w + x];
  return (P(x0, y0) * (1 - tx) + P(x1, y0) * tx) * (1 - ty) + (P(x0, y1) * (1 - tx) + P(x1, y1) * tx) * ty;
};
const near = (img, u, v) => img.px[Math.min(img.h - 1, Math.floor(v * img.h)) * img.w + Math.min(img.w - 1, Math.floor(u * img.w))];

// ---- the model: heights and a ground index per cell ----
function buildGrid(o) {
  const img = o.image;
  const round = n => { const k = Math.ceil((n - 1) / QUAD); return k * QUAD + 1; };
  const w = round(o.size ? o.size[0] : img.w), h = round(o.size ? o.size[1] : img.h);
  if (w > MAX_DIM || h > MAX_DIM || w < QUAD * 4 + 1 || h < QUAD * 4 + 1) throw new Refuse('MAPGEN_ARGS', `map ${w}x${h} cells: need ${QUAD * 4 + 1}..${MAX_DIM} a side`);
  const hs = new Int16Array(w * h), gs = new Uint8Array(w * h), names = Object.keys(GROUNDS);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hs[y * w + x] = Math.round(o.zmin + lerp(img, x / (w - 1), y / (h - 1)) * (o.zmax - o.zmin));
  for (const [gi, nm] of names.entries()) {
    const m = o.masks[nm]; if (!m) continue;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(m, x / w, y / h) >= 0.5) gs[y * w + x] = gi;
  }
  return { w, h, hs, gs, names, offX: (w - 1) * CELL / 2, offY: (h - 1) * CELL / 2 };
}

// ---- map.net ----
function netBuf(g) {
  const usedT = new Set(), usedM = new Set();
  const gUsed = new Set(g.gs);
  for (const gi of gUsed) { const d = GROUNDS[g.names[gi]]; usedT.add(d.type); usedM.add(d.mat); }
  const tab = (t, used, ids) => {
    const list = [...used].sort((a, b) => ids[a] - ids[b]), out = [tag(t), Buffer.from([list.length])];
    for (const n of list) out.push(Buffer.from([ids[n], n.length]), tag(n));
    return Buffer.concat(out);
  };
  const hd = Buffer.alloc(14);
  hd[0] = CELL; hd[1] = 2; hd.writeInt16LE(g.w, 2); hd.writeInt16LE(g.h, 4); hd.writeFloatLE(g.offX, 6); hd.writeFloatLE(g.offY, 10);
  const cells = Buffer.alloc(g.w * g.h * 4);
  for (let i = 0, o = 0; i < g.w * g.h; i++, o += 4) {
    const d = GROUNDS[g.names[g.gs[i]]];
    cells.writeInt16LE(g.hs[i], o); cells[o + 2] = TYPES[d.type]; cells[o + 3] = MATS[d.mat];
  }
  return Buffer.concat([hd, tab('MAP0', usedT, TYPES), tab('MAP1', usedM, MATS), tag('GRID'), cells]);
}

// ---- map.ply: same chunks, declaration and flags as stock ----
const DECL = Buffer.from('02000012000026000031' + '0000ffff', 'hex'), PART_FLAGS = 0x1404, STRIDE = 36, COLOUR = 0xff7f7f7f;
function plyBuf(g) {
  const nx = (g.w - 1) / QUAD, ny = (g.h - 1) / QUAD, vw = nx + 1, vc = vw * (ny + 1);
  const netRow = jm => g.h - 1 - jm * QUAD;       // mesh rows run up mesh y = down net rows
  const H = (i, jm) => g.hs[netRow(Math.max(0, Math.min(ny, jm))) * g.w + Math.max(0, Math.min(nx, i)) * QUAD];
  const vert = Buffer.alloc(vc * STRIDE);
  const qSize = QUAD * CELL;
  let zlo = Infinity, zhi = -Infinity, p = 0;
  for (let jm = 0; jm <= ny; jm++) for (let i = 0; i <= nx; i++, p += STRIDE) {
    const x = i * qSize - g.offX, y = jm * qSize - g.offY, z = H(i, jm);
    const dx = (H(i + 1, jm) - H(i - 1, jm)) / ((Math.min(nx, i + 1) - Math.max(0, i - 1)) * qSize);
    const dy = (H(i, jm + 1) - H(i, jm - 1)) / ((Math.min(ny, jm + 1) - Math.max(0, jm - 1)) * qSize);
    const l = Math.hypot(dx, dy, 1);
    vert.writeFloatLE(x, p); vert.writeFloatLE(y, p + 4); vert.writeFloatLE(z, p + 8);
    vert.writeFloatLE(-dx / l, p + 12); vert.writeFloatLE(-dy / l, p + 16); vert.writeFloatLE(1 / l, p + 20);
    vert.writeUInt32LE(COLOUR, p + 24);
    vert.writeFloatLE(x / TEX, p + 28); vert.writeFloatLE(-y / TEX, p + 32);   // stock: u with x, v against y
    if (z < zlo) zlo = z; if (z > zhi) zhi = z;
  }
  // which ground has most of the quad's cells
  const byPart = new Map();
  for (let jm = 0; jm < ny; jm++) for (let i = 0; i < nx; i++) {
    const cnt = new Map();
    const r1 = netRow(jm), c0 = i * QUAD;
    for (let r = r1 - QUAD + 1; r <= r1; r++) for (let c = c0; c < c0 + QUAD; c++) { const k = g.gs[r * g.w + c]; cnt.set(k, (cnt.get(k) || 0) + 1); }
    let best = 0, bn = -1; for (const [k, n] of cnt) if (n > bn || (n === bn && k < best)) { bn = n; best = k; }
    if (!byPart.has(best)) byPart.set(best, []);
    const a = jm * vw + i, b = a + 1, c = a + vw, d = c + 1;
    byPart.get(best).push(a, c, b, b, c, d);   // clockwise from above in mesh space, as stock
  }
  const parts = [...byPart.keys()].sort((a, b) => a - b);
  const faces = (nx * ny) * 2, ind = Buffer.alloc(faces * 12), subs = [];
  let ip = 0, first = 0;
  parts.forEach((gi, n) => {
    const idx = byPart.get(gi), name = tag(`mtl${n}.mtl`);
    for (const v of idx) { ind.writeUInt32LE(v, ip); ip += 4; }
    subs.push(tag('SUBM'), DECL, i32(first), i32(idx.length / 3), i32(0), i32(0), i32(PART_FLAGS), Buffer.from([name.length]), name);
    first += idx.length / 3;
  });
  const ply = Buffer.concat([
    tag('BPLY'), tag('BNDS'), f32s([-g.offX, -g.offY, zlo, g.offX, g.offY, zhi]), ...subs,
    tag('BAS2'), f32s([0, 0, qSize, 0, 0, qSize, 0, 0, qSize / TEX, 0, 0, -qSize / TEX]),
    tag('VERT'), i32(vc), i32(STRIDE), vert, tag('IND4'), i32(faces * 3), ind,
  ]);
  return { ply, parts: parts.map(gi => g.names[gi]) };
}
function mtlText(name) {
  const t = GROUNDS[name].tex, L = `\t{layer bump\n\t\t{diffuse "${t}"}\n\t\t{bump "${t}_nm"}\n\t\t{color 0xffffffff}\n\t\t{parallax_scale 0}\n\t}\n`;
  return crlf(`{material\n${L}${L}}\n`);
}

// ---- text ----
function clipsOf(g) {
  const ins = (n, f) => Math.min(n, Math.round(Math.min(g.offX, g.offY) * f));
  const c = ins(330, 0.16), pa = ins(530, 0.26);
  const box = d => `${-g.offX + d} ${-g.offY + d} ${g.offX - d} ${g.offY - d}`;
  return { c, pa, text: `\t\t{"[auto]"\n\t\t\t{world ${box(0)}}\n\t\t\t{camera ${box(c)}}\n\t\t\t{pather ${box(pa)}}\n\t\t\t{distance 200 800}\n\t\t\t{viewAngle 20 50}\n\t\t}\n` };
}
const mapText = g => crlf(`{map\n\t{Land\n\t\t{Position 0 0}\n\t\t{TexMod ""}\n\t}\n\t{Clips\n${clipsOf(g).text}\t}\n}\n`);

// a flat passable spot near a world point, inside the pather clip
function findSpot(g, wx, wy) {
  const { pa } = clipsOf(g), R = 8;   // +-80 units
  const range = (x, y) => {   // height range of the spot's box, null = can't stand there
    if (x < R || y < R || x >= g.w - R || y >= g.h - R) return null;
    const wxx = x * CELL - g.offX, wyy = y * CELL - g.offY;
    if (Math.abs(wxx) > g.offX - pa - 20 || Math.abs(wyy) > g.offY - pa - 20) return null;
    let lo = 1e9, hi = -1e9;
    for (let j = y - R; j <= y + R; j += 2) for (let i = x - R; i <= x + R; i += 2) {
      if (GROUNDS[g.names[g.gs[j * g.w + i]]].type === 'no_pass') return null;
      const z = g.hs[j * g.w + i]; if (z < lo) lo = z; if (z > hi) hi = z;
    }
    return hi - lo;
  };
  const cx = Math.round((wx + g.offX) / CELL), cy = Math.round((wy + g.offY) / CELL);
  let best = null, bestR = Infinity;   // first spot flat enough, else the flattest passable one
  for (let r = 0; r < Math.max(g.w, g.h); r += 2) for (let a = 0; a < 16; a++) {
    const x = Math.round(cx + r * Math.cos(a * Math.PI / 8)), y = Math.round(cy + r * Math.sin(a * Math.PI / 8)), v = range(x, y);
    if (v === null) continue;
    if (v <= 16) return [x * CELL - g.offX, y * CELL - g.offY];
    if (v < bestR) { bestR = v; best = [x * CELL - g.offX, y * CELL - g.offY]; }
  }
  if (best) return best;
  throw new Refuse('MAPGEN_NO_SPAWN', `no passable spot near ${wx},${wy} inside the pather clip`);
}
function pointText(id, name, team, x, y, z, order = 1) {
  return `\t{Entity "map_point" 0x${id.toString(16)}\n\t\t{Position ${x} ${y}}\n\t\t{xform zl ${z}}\n\t\t{Extender "map_point"\n\t\t\t{name ${name}}\n\t\t\t{team ${team}}\n\t\t\t{phase 0}\n\t\t\t{order ${order}}\n\t\t\t{visor SpawnPoint}\n\t\t}\n\t\t{Player 0}\n\t\t{MID ${id - 0xc000 + 1}}\n\t}\n`;
}
// slots players: slots/2 spawn points a team, named a1..aN / b1..bN with order 1..N like stock 2v2 (2v2_canyon), 150 units apart along x
function plainMission(a, b, slots = 2) {
  const row = '\t\t\t0 ' + Array(16).fill(1).join(' ');
  const dip = ['\t\t\t1 ' + Array(16).fill(0).join(' '), ...Array(16).fill(row)].join('\n');
  let pts = '', id = 0xc000;
  for (let i = 0; i < slots / 2; i++) pts += pointText(id++, 'b' + (i + 1), 'b', b[0] + i * 150, b[1], 90, i + 1) + pointText(id++, 'a' + (i + 1), 'a', a[0] + i * 150, a[1], -90, i + 1);
  return `{mission\n${pts}\t{Environment "multi/multi_01"}\n\t{Helpers\n\t\t{reinforcements\n\t\t\t{scoreTotal 0}\n\t\t\t{scoreCurrent 0}\n\t\t}\n\t\t{triggers\n\t\t}\n\t}\n\t{Players\n\t\t{count 17}\n\t\t{diplomacy\n${dip}\n\t\t}\n\t}\n\t{Fog 1}\n\t{EntityManager {Enabled}\n\t\t{CountScale "x0.5"}\n\t}\n}\n`;
}
// a clone's combat.mi: every map_point goes to its team's spot (spread along x), speakers to the map centre, Tags of absent objects dropped, the rest untouched
function cloneMission(text, a, b) {
  const t = text.replace(/\r\n/g, '\n'), seen = { a: 0, b: 0 }, have = new Set();
  let n = 0;
  const out = t.replace(/\{Entity "([^"]+)" (0x[0-9a-f]+)\n(\s*)\{Position [^}]*\}(\n\s*\{xform zl [^}]*\})?/gi, (m, def, uid, ws, xf) => {
    have.add(uid.toLowerCase());
    if (def !== 'map_point') { const k = (n++ % 8) * 10; return `{Entity "${def}" ${uid}\n${ws}{Position ${k} ${k}}${xf || ''}`; }
    const after = t.slice(t.indexOf(m) + m.length, t.indexOf(m) + m.length + 200), tm = /\{team ([ab])\}/.exec(after);
    const team = tm ? tm[1] : 'a', s = team === 'a' ? a : b, off = seen[team]++ * 150;
    return `{Entity "map_point" ${uid}\n${ws}{Position ${s[0] + off} ${s[1]}}\n${ws}{xform zl ${team === 'a' ? -90 : 90}}`;
  });
  const lines = out.split('\n').filter(l => { const m = /^\s*\{Tags "[^"]*" (0x[0-9a-f]+)\}/i.exec(l); return !m || have.has(m[1].toLowerCase()); });
  return lines.join('\n');
}

// ---- refuse an install ----
function inInstall(p) {
  let d = path.resolve(p);
  const parts = d.toLowerCase().split(/[\\/]+/);
  if (parts.includes('steamapps')) return 'a steamapps folder';
  for (;;) {
    for (const mark of ['as64_ed.exe', 'as64.exe', 'mowas_2.exe', 'binaries/x64/call_to_arms.exe', 'resource/map.pak', 'resource/entity.pak']) if (fs.existsSync(path.join(d, mark))) return `${d} (has ${mark})`;
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}

// ---- generate ----
// minimap.dds: loads <map dir>/minimap, else the default grey. Stock is DXT1 with mips
// (1v1_vierville 904x912, 10 levels); this writes A8R8G8B8 (a loader format) with a full box-filtered mip chain
// since a 1-level file warns "No MIP levels!" (:408). Ground colour per cell, shaded by height; at most 512 a side. Row 0 = grid row 0:
// north/south orientation against the game view not checked [T]
const MINI_RGB = { grass: [92, 112, 62], sand: [186, 168, 118], mud: [118, 96, 70], rock: [112, 112, 108], road: [72, 72, 72], no_pass: [58, 54, 50] };
function minimapDds(g) {
  const names = Object.keys(GROUNDS), st = Math.max(1, Math.ceil(Math.max(g.w, g.h) / 512)), w = Math.ceil(g.w / st), h = Math.ceil(g.h / st);
  let lo = Infinity, hi = -Infinity; for (const v of g.hs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  let px = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.min(g.w - 1, x * st), cy = Math.min(g.h - 1, y * st), i = cy * g.w + cx;
    const c = MINI_RGB[names[g.gs[i]]] || MINI_RGB.grass, k = 0.7 + 0.45 * (hi > lo ? (g.hs[i] - lo) / (hi - lo) : 0.5);
    for (let j = 0; j < 3; j++) px[(y * w + x) * 3 + j] = Math.min(255, c[j] * k);
  }
  const levels = []; let lw = w, lh = h;
  for (;;) {
    const b = Buffer.alloc(lw * lh * 4);
    for (let i = 0; i < lw * lh; i++) { b[i * 4] = px[i * 3 + 2]; b[i * 4 + 1] = px[i * 3 + 1]; b[i * 4 + 2] = px[i * 3]; b[i * 4 + 3] = 255; }   // BGRA bytes = A8R8G8B8
    levels.push(b);
    if (lw === 1 && lh === 1) break;
    const nw = Math.max(1, lw >> 1), nh = Math.max(1, lh >> 1), n = new Float64Array(nw * nh * 3);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let j = 0; j < 3; j++) {
      let s = 0, c = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const sx = x * 2 + dx, sy = y * 2 + dy; if (sx < lw && sy < lh) { s += px[(sy * lw + sx) * 3 + j]; c++; } }
      n[(y * nw + x) * 3 + j] = s / c;
    }
    px = n; lw = nw; lh = nh;
  }
  const hd = Buffer.alloc(128);
  hd.write('DDS ', 0, 'latin1'); hd.writeUInt32LE(124, 4); hd.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | 0x20000, 8);   // CAPS HEIGHT WIDTH PITCH PIXELFORMAT MIPMAPCOUNT
  hd.writeUInt32LE(h, 12); hd.writeUInt32LE(w, 16); hd.writeUInt32LE(w * 4, 20); hd.writeUInt32LE(levels.length, 28);
  hd.writeUInt32LE(32, 76); hd.writeUInt32LE(0x41, 80); hd.writeUInt32LE(32, 88);   // pixel format: RGB | ALPHAPIXELS, 32 bit
  hd.writeUInt32LE(0x00ff0000, 92); hd.writeUInt32LE(0x0000ff00, 96); hd.writeUInt32LE(0x000000ff, 100); hd.writeUInt32LE(0xff000000, 104);
  hd.writeUInt32LE(0x1000 | 0x8 | 0x400000, 108);   // TEXTURE COMPLEX MIPMAP
  return Buffer.concat([hd, ...levels]);
}

function generate(o) {
  const why = inInstall(o.out); if (why) throw new Refuse('MAPGEN_IN_INSTALL', `--out is inside an install: ${why}. Build outside and copy into a test mod`);
  if (!/^[a-z0-9_]+$/.test(o.name)) throw new Refuse('MAPGEN_ARGS', '--name must be [a-z0-9_]+ (it becomes a folder and a loc key)');
  if (o.slots !== undefined && o.slots !== null && !(Number.isInteger(o.slots) && o.slots >= 2 && o.slots <= 16 && o.slots % 2 === 0)) throw new Refuse('MAPGEN_ARGS', `--slots ${o.slots}: want an even player count 2-16 (stock 1v1 2, 2v2 4)`);
  if (!(o.zmax > o.zmin && o.zmin > mapnet.NO_GROUND && o.zmax < 32000)) throw new Refuse('MAPGEN_ARGS', `--zmin ${o.zmin} --zmax ${o.zmax}: need ${mapnet.NO_GROUND} < zmin < zmax < 32000 (-1000 and under = no ground)`);
  const image = readImage(o.height, o.rawSize), masks = {};
  if (o.layers) {
    let fsn; try { fsn = fs.readdirSync(o.layers); } catch { throw new Refuse('MAPGEN_BAD_LAYER', `${o.layers}: can't read`); }
    for (const f of fsn) {
      const nm = path.basename(f, path.extname(f)).toLowerCase();
      if (!GROUNDS[nm] || !/\.pgm$/i.test(f)) throw new Refuse('MAPGEN_BAD_LAYER', `${f}: layers are ${Object.keys(GROUNDS).join(', ')} as .pgm`);
      masks[nm] = readImage(path.join(o.layers, f));
    }
  }
  let cloneMi = null;
  if (o.clone) {
    let net; try { net = fs.readFileSync(path.join(o.clone, 'map.net')); cloneMi = fs.readFileSync(path.join(o.clone, 'combat.mi'), 'latin1'); } catch { throw new Refuse('MAPGEN_BAD_CLONE', `${o.clone}: needs map.net and combat.mi`); }
    if (net[0] !== CELL) throw new Refuse('MAPGEN_BAD_CLONE', `${o.clone}: cell ${net[0]}, only a cell-10 map can be the reference (PORT-70)`);
  }
  const g = buildGrid({ image, masks, size: o.size, zmin: o.zmin, zmax: o.zmax });
  const q = (g.h - 1) * CELL / 4;
  const a = findSpot(g, 0, q), b = findSpot(g, 0, -q);
  const { ply, parts } = plyBuf(g);
  const slots = o.slots || 2;
  const files = { 'map.net': netBuf(g), 'map.ply': ply, map: mapText(g), 'map.info': crlf(`;SDL\n{game\n  {maxPlayers ${slots}}\n  {texMod 2}\n}\n`),
    'combat.mi': crlf(cloneMi ? cloneMission(cloneMi, a, b) : plainMission(a, b, slots)) };
  parts.forEach((nm, i) => { files[`mtl${i}.mtl`] = mtlText(nm); });
  files['minimap.dds'] = minimapDds(g);
  const dest = path.join(o.out, 'resource', 'map', 'multi', o.name);
  if (fs.existsSync(dest) && !o.force) throw new Refuse('MAPGEN_EXISTS', `${dest} exists; --force overwrites its files`);
  fs.mkdirSync(dest, { recursive: true });
  for (const [f, b2] of Object.entries(files)) fs.writeFileSync(path.join(dest, f), b2);
  const loc = path.join(o.out, 'localization', 'mission', 'multi', o.name + '.lng');
  fs.mkdirSync(path.dirname(loc), { recursive: true });
  fs.writeFileSync(loc, Buffer.from(`{tags\r\n\t{"name" "${o.name}"}\r\n}\r\n`, 'utf8'));
  const mi = path.join(o.out, 'mod.info');
  const rng = o.target === 'mowas2' ? (R => `\t{MinGameVersion "${R.min}"}\n\t{MaxGameVersion "${R.max}"}\n`)(require('../newmod/newmod').RANGE.mowas2) : '\t{MinGameVersion "3.301"}\n';
  if (!fs.existsSync(mi)) fs.writeFileSync(mi, crlf(`{Mod\n\t{Name "map ${o.name}"}\n\t{Desc "made by mapgen"}\n${rng}}\n`));
  const man = { name: o.name, cells: [g.w, g.h], world: [g.w * CELL, g.h * CELL], parts, spawn: { a, b },
    generated: Object.keys(files).filter(f => !(f === 'combat.mi' && cloneMi)),
    fromClone: cloneMi ? [`combat.mi: keys and triggers of ${path.basename(o.clone)}, spawn points and speakers moved`] : [],
    copiedUnchanged: [], notReached: NOT_REACHED };
  fs.writeFileSync(path.join(o.out, `mapgen.${o.name}.json`), JSON.stringify(man, null, 1) + '\n');
  return { dest, man, g };
}

// ---- --check: read a written map back ----
function walkPly(b) {
  const out = { parts: [], vc: 0, vs: 0, vo: 0, ic: 0, io: 0, bad: null };
  if (b.toString('latin1', 0, 4) !== 'BPLY') { out.bad = 'magic not BPLY'; return out; }
  let p = 4;
  while (p < b.length) {
    const t = b.toString('latin1', p, p + 4); p += 4;
    if (p > b.length) { out.bad = 'truncated chunk tag'; return out; }
    if (t === 'BNDS') p += 24;
    else if (t === 'BAS2') p += 48;
    else if (t === 'InfG') { const n = b.readInt32LE(p + 24); p += 28 + n * 2; }
    else if (t === 'SUBM') {
      for (let run = 0; run < 2; run++) for (;;) { const c = b[p++]; if (c === 0xff) break; p += 2; }
      const first = b.readInt32LE(p), count = b.readInt32LE(p + 4); p += 20;
      const l = b[p++]; out.parts.push({ first, count, mtl: b.toString('latin1', p, p + l) }); p += l;
    } else if (t === 'VERT') { out.vc = b.readInt32LE(p); out.vs = b.readInt32LE(p + 4); p += 8; out.vo = p; p += out.vc * out.vs; }
    else if (t === 'IND4') { out.ic = b.readInt32LE(p); p += 4; out.io = p; p += out.ic * 4; }
    else { out.bad = `unknown chunk ${JSON.stringify(t)} at ${p - 4}`; return out; }
    if (p > b.length) { out.bad = `${t} runs past the end`; return out; }
  }
  if (!out.vc || !out.ic) out.bad = 'no VERT or IND4';
  return out;
}
function check(dir, rep) {
  const rd = f => { try { return fs.readFileSync(path.join(dir, f)); } catch { rep.add(f, 0, 'MAPGEN_MISSING', `no ${f} in ${dir}`); return null; } };
  const netB = rd('map.net'), plyB = rd('map.ply'), mapB = rd('map'), miB = rd('combat.mi'); rd('map.info');
  if (!netB || !plyB || !mapB || !miB) return;
  const m = mapnet.parse(netB);
  for (const pr of m.problems) rep.add('map.net', 0, 'MAPGEN_NET', `${pr.code} ${pr.msg}`);
  if (m.problems.length) return;
  if (m.cell !== CELL) rep.add('map.net', 0, 'MAPGEN_NET', `cell ${m.cell}, only cell 10 works (PORT-70)`);
  const s = mapnet.stats(m);
  for (const k of s.typeUse.keys()) if (!mapnet.typeName(m, k)) rep.add('map.net', 0, 'MAPGEN_NET', `cells use type id ${k}, not in MAP0 (MAP-19)`);
  for (const k of s.matUse.keys()) if (!mapnet.materialName(m, k)) rep.add('map.net', 0, 'MAPGEN_NET', `cells use material id ${k}, not in MAP1 (MAP-19)`);
  if (s.noGround) rep.add('map.net', 0, 'MAPGEN_NET', `${s.noGround} cells with no ground (height <= -1000)`);
  const lp = plylib.parse(plyB); if (lp.error) rep.add('map.ply', 0, 'MAPGEN_PLY', 'lib/ply: ' + lp.error);
  const w = walkPly(plyB);
  if (w.bad) { rep.add('map.ply', 0, 'MAPGEN_PLY', w.bad); return; }
  if (w.ic % 3) rep.add('map.ply', 0, 'MAPGEN_PLY', `${w.ic} indices is not whole faces`);
  let next = 0;
  for (const pt of w.parts) {
    if (pt.first !== next) rep.add('map.ply', 0, 'MAPGEN_PLY', `${pt.mtl}: starts at face ${pt.first}, expected ${next}`);
    next = pt.first + pt.count;
    let t = null; try { t = fs.readFileSync(path.join(dir, pt.mtl), 'latin1'); } catch { rep.add(pt.mtl, 0, 'MAPGEN_MTL', 'named by map.ply, not in the folder (FMT-03: crash)'); continue; }
    const layers = (t.match(/\{layer /g) || []).length;
    if (layers !== 2) rep.add(pt.mtl, 0, 'MAPGEN_MTL', `${layers} layers; exactly 2 (MAP-29: else a crash at the first crater)`);
  }
  if (next !== w.ic / 3) rep.add('map.ply', 0, 'MAPGEN_PLY', `parts cover ${next} faces of ${w.ic / 3}`);
  for (let i = 0; i < w.ic; i++) if (plyB.readUInt32LE(w.io + i * 4) >= w.vc) { rep.add('map.ply', 0, 'MAPGEN_PLY', `index ${i} past ${w.vc} vertices`); break; }
  // mesh z against net height, both ways of reading y
  let flip = 0, same = 0, n = 0, worst = 0;
  for (let v = 0; v < w.vc; v++) {
    const o = w.vo + v * w.vs, x = plyB.readFloatLE(o), y = plyB.readFloatLE(o + 4), z = plyB.readFloatLE(o + 8);
    const at = yy => mapnet.cellAt(m, Math.round((x + m.offX) / m.cell), Math.round((yy + m.offY) / m.cell));
    const a = at(-y), b = at(y);
    if (!a || !b) { rep.add('map.ply', 0, 'MAPGEN_MESH_OFF', `vertex ${v} at ${x},${y} is off the net`); return; }
    const e = Math.abs(a.height - z); flip += e; same += Math.abs(b.height - z); n++; if (e > worst) worst = e;
  }
  if (worst > 1) rep.add('map.ply', 0, flip > same ? 'MAPGEN_MESH_UNFLIPPED' : 'MAPGEN_MESH_OFF', `mesh z against the net: mean ${(flip / n).toFixed(2)}, worst ${worst.toFixed(1)} units; with y not negated mean ${(same / n).toFixed(2)}. Units would float or sink`);
  // clips
  const clip = k => { const r = new RegExp(`\\{${k}\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\}`).exec(mapB.toString('latin1')); return r ? r.slice(1, 5).map(Number) : null; };
  const W = clip('world'), C = clip('camera'), P = clip('pather');
  if (!W || !C || !P) rep.add('map', 0, 'MAPGEN_CLIP', 'world, camera or pather clip missing');
  else {
    const inside = (i, o) => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3];
    if (!inside(W, [-m.offX, -m.offY, m.width * m.cell - m.offX, m.height * m.cell - m.offY])) rep.add('map', 0, 'MAPGEN_CLIP', `world ${W} is outside the terrain`);
    if (!inside(C, W) || !inside(P, C)) rep.add('map', 0, 'MAPGEN_CLIP', 'need pather inside camera inside world');
  }
  // spawn points
  const mi = miB.toString('latin1'), seen = new Set();
  for (const e of mi.matchAll(/\{Entity "map_point" 0x[0-9a-f]+\s*\{Position (-?[\d.]+) (-?[\d.]+)\}[\s\S]*?\{team ([ab])\}/gi)) {
    seen.add(e[3]);
    const c = mapnet.cellAt(m, Math.round((+e[1] + m.offX) / m.cell), Math.round((+e[2] + m.offY) / m.cell));
    if (!c) { rep.add('combat.mi', 0, 'MAPGEN_SPAWN', `team ${e[3]} point ${e[1]},${e[2]} is off the net`); continue; }
    if (mapnet.typeName(m, c.type) === 'no_pass') rep.add('combat.mi', 0, 'MAPGEN_SPAWN', `team ${e[3]} point ${e[1]},${e[2]} is on no_pass`);
    if (P && (+e[1] < P[0] || +e[2] < P[1] || +e[1] > P[2] || +e[2] > P[3])) rep.add('combat.mi', 0, 'MAPGEN_SPAWN', `team ${e[3]} point ${e[1]},${e[2]} is outside the pather clip`);
  }
  for (const t of ['a', 'b']) if (!seen.has(t)) rep.add('combat.mi', 0, 'MAPGEN_SPAWN', `no spawn point of team ${t}`);
  const use = [...s.combo].sort((x, y) => y[1] - x[1]).map(([k, c]) => { const [t, mt] = k.split(','); return `${mapnet.typeName(m, +t)}/${mapnet.materialName(m, +mt)} ${c}`; }).join(', ');
  rep.info('map.net', 0, 'MAPGEN_STATS', `${m.width}x${m.height} cells, height ${s.minH}..${s.maxH}, ${use}`);
  rep.info('map.ply', 0, 'MAPGEN_STATS', `${w.parts.length} parts, ${w.vc} vertices, ${w.ic / 3} faces, mesh to net worst ${worst.toFixed(1)}`);
}

function main(argv) {
  const opt = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
  const dims = (k) => { const v = opt(k); if (!v) return null; const r = /^(\d+)x(\d+)$/.exec(v); if (!r) throw new Refuse('MAPGEN_ARGS', `--${k} ${v}: want WxH`); return [+r[1], +r[2]]; };
  const rep = createReport();
  const fin = () => { rep.print({ showInfo: !argv.includes('-q') }); process.exitCode = rep.count ? 1 : 0; };
  try {
    if (opt('check')) { check(opt('check'), rep); return fin(); }
    if (!opt('height') || !opt('name') || !opt('out')) { console.error('usage: mapgen --height <image> [--layers dir] --name n --out mod [--size WxH] [--zmin 0] [--zmax 300] [--raw-size WxH] [--clone folder] [--target|--exe as64|mowas2] [--force] | --check <map folder>'); process.exitCode = 2; return; }
    const tw = opt('target') !== null ? opt('target') : opt('exe');   // --exe (common game word) = --target when no --target is given
    const target = tw === null ? 'as64' : require('../lib/games').idOf(tw);
    if (!target) throw new Refuse('MAPGEN_ARGS', `--target/--exe ${tw}: want as64 or mowas2`);
    if (target === 'goh') { require('../lib/games').refuse('mapgen', 'goh', 'a GoH map is cell 5 with a .materials layer file and map.omask, and no note gives those forms (gohweb maps/goh-map-net-scene); map.net alone is known', 'GHMAP-06'); return; }
    const r = generate({ height: opt('height'), layers: opt('layers'), name: opt('name'), out: opt('out'), size: dims('size'), rawSize: dims('raw-size'), zmin: opt('zmin') === null ? 0 : +opt('zmin'), zmax: opt('zmax') === null ? 300 : +opt('zmax'), clone: opt('clone'), target, force: argv.includes('--force'), slots: opt('slots') === null ? null : Number(opt('slots')) });
    check(r.dest, rep);
    rep.info(r.dest, 0, 'MAPGEN_WROTE', `${r.man.generated.join(' ')}; parts ${r.man.parts.join(' ')}; from clone: ${r.man.fromClone.join('; ') || 'nothing'}; copied unchanged: ${r.man.copiedUnchanged.join(' ') || 'nothing'}`);
    for (const t of r.man.notReached) rep.info(r.dest, 0, 'MAPGEN_NOT_REACHED', t);
  } catch (e) {
    if (!(e instanceof Refuse)) throw e;
    rep.add(opt('name') || 'mapgen', 0, e.code, e.message);
  }
  fin();
}
module.exports = { generate, check, readImage, parsePgm, parseRaw, walkPly, inInstall, GROUNDS, Refuse };
if (require.main === module) main(process.argv.slice(2));
