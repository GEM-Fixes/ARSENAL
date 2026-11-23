// fxmake: the mapviz fixture map (tools/mapviz/README.md section 10). Builds a fake install that the real shared libs read
// (vfs, mapnet, sdlx, mdl, sceneload), in the AS2 form (target mowas2) or the GoH form (target goh), and computes the
// page-test answers (fxanswers.json) from the fixture's own definition.
//   make(dir, {form:'as2'|'goh'}) -> {gameDir, target, map:'multi/mv_fixture', mods:[], modDirs:[<dir>/mods/mvfx]}
//     deterministic (same bytes every run), loose files, text data CRLF. One form per dir (the mod folder is per form).
//   verify(dir, form) -> [problem text]   reads a made dir back through mapnet and sdlx and compares it with the spec
//   answers() -> the fxanswers.json object;  check(scratch, {answersFile}) -> {ok, problems}
//   SPEC, cellRecord(form, i, j), retype(stored, h, W), slopeClass(hAt, w, h, cell, i, j), netBuffer(form), netWrite(o)
// CLI: node tools/mapviz/test/fxmake.js <dir> [--form as2|goh]    builds, prints the returned object as JSON
//      node tools/mapviz/test/fxmake.js --check <scratch>           fresh make() of both forms, verify, compare fxanswers.json
//      node tools/mapviz/test/fxmake.js --write                     rewrites fxanswers.json from answers() (coordinator only)
// Record forms copied from vanilla data read through tools/lib/vfs.js [V data]: MoW:AS2 multi/1v1_road (map, map.net,
// battle_zones.mi, combat.mi), a_frontlines/1v1_icy_village/frontline.mi, set/interaction_terrain/terrains.set, a tree,
// bush and stone fence def + mdl + ply + mtl, a road stamp def + mtl; GoH multi/1v1_balzerweg (map head with Ocean,
// battle_zones.mi with {zone {radius}{zoneId}} and Helpers {zone "poly"}).
// Author: Imperator_Aug (ARSENAL, ia-15d13cd4)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const MAP = 'multi/mv_fixture';
const CRLF = '\r\n';
const SPEC = {
  map: MAP,
  upm: 20,
  offX: 640, offY: 480,
  forms: {
    as2: { form: 'as2', target: 'mowas2', exe: 'mowas_2', game: 'as2', exeFile: 'mowas_2.exe', cell: 10, w: 128, h: 96,
      modes: ['battle_zones', 'combat', 'frontline'], distance: [200, 800], viewAngle: [20, 50], ocean: null,
      env: 'multi/multi_01' },
    goh: { form: 'goh', target: 'goh', exe: 'goh', game: 'goh', exeFile: 'binaries/x64/call_to_arms.exe', cell: 5, w: 256, h: 192,
      modes: ['battle_zones', 'frontlines'], distance: [0, 0], viewAngle: [0, 0], ocean: { zlevel: -20, kind: 'lake', active: true },
      env: 'goh/multi/mv_fixture/var1' },
  },
  clip: { name: '[auto]', world: [-600, -440, 600, 440], camera: [-560, -400, 560, 400], pather: [-580, -420, 580, 420], water: -20 },
  ridge: { x: -200, top: 60, half: 100 },
  // pond rings by distance r (u) from the centre to the lattice point: r < rMax, the first ring that holds r [I: lower bound in]
  pond: { x: 300, y: -200, rings: [{ rMax: 60, h: -200, type: 5 }, { rMax: 90, h: -80, type: 4 }, { rMax: 120, h: -50, type: 4 },
    { rMax: 160, h: -28, type: 3 }, { rMax: 180, h: -10, type: 3 }] },
  road: { y0: 190, y1: 220 },                       // lattice rows with y0 <= y < y1: type road, material road
  // map.net tables in AS2 order (file-local id = engine id, as every vanilla AS2 map.net) [V data 3v3_river_bank]
  types: [[1, 'ground'], [3, 'shallow_water'], [4, 'water'], [5, 'deep_water'], [7, 'road']],
  materials: [[1, 'ground'], [4, 'shallow_water'], [5, 'water'], [6, 'deep_water'], [9, 'road']],
  matOfType: { 1: 1, 3: 4, 4: 5, 5: 6, 7: 9 },
  terrains: ['ground', 'road', 'country_road'],    // terrains.set: road = engine material 9, country_road 10 (built-ins 0..8 skipped)
  entities: [
    { uid: 0x1001, def: 'fx_tree', x: -400, y: 300 },
    { uid: 0x1002, def: 'fx_tree', x: -420, y: 340 },
    { uid: 0x1003, def: 'fx_tree', x: -380, y: 360 },
    { uid: 0x1004, def: 'fx_wall', x: 100, y: -100, yaw: 90 },
    { uid: 0x1005, def: 'fx_house', x: -450, y: -300, yaw: 30 },
    { uid: 0x1006, def: 'fx_road', x: 0, y: 200, scale: 2, color: 0xff9c8a6e, decalOrder: 1 },
    { uid: 0x1007, def: 'fx_bush', x: 150, y: 300 },
    { uid: 0x1008, def: 'fx_bush', x: 170, y: 320 },
  ],
  spawns: [
    { name: 'a1', uid: 0xc007, team: 'a', x: -503.7, y: 12.2, yaw: 0, order: 1, phase: 0 },
    { name: 'b1', uid: 0xc000, team: 'b', x: 497.5, y: -15.5, yaw: 179.5, order: 1, phase: 0 },
  ],
  modSpawnA1: { x: -503.7, y: 52.2 },
  flags: [
    { name: 'f1', def: 'flag_point_1', uid: 0x8001, x: 0, y: 0, scale: 0.75, zoneA: 12, zoneB: 12, order: 1,
      goh: { radius: 240, zoneId: '' } },
    { name: 'f2', def: 'flag_point_2', uid: 0x8002, x: -200, y: 300, scale: 0.75, zoneA: 8, zoneB: 8, order: 2,
      goh: { radius: 0, zoneId: 'zf2' } },
    { name: 'f3', def: 'flag_point_3', uid: 0x8003, x: 300, y: 200, scale: 2, zoneA: 10, zoneB: 6, order: 3,
      goh: { radius: 200, zoneId: '' } },
  ],
  poly: { name: 'zf2', position: [-180, 260, 0], points: [[-100, -80], [100, -80], [140, 40], [0, 120], [-120, 40]] },
  frontline: {
    point: { name: 'fa1', uid: 0x8011, team: 'a', x: -400, y: 0, yaw: 0, order: 1, phase: 1 },
    spawn: { uid: 0x8012, mapPoint: 'fa1', pos: 1, x: -450, y: 20, yaw: 90 },
  },
  // entity defs: one box volume each (sizes in u, 20 u = 1 m), Obstacle Obb2 extent = half the box footprint
  defs: {
    fx_tree: { vol: 'trunk', box: [12, 12, 160], obstacle: true, able: { visible: 1, bullet: 1, obstacle: 1 }, props: ['tree'], obstacleID: 'tree', rgb: [96, 72, 48] },
    fx_wall: { vol: 'body', box: [80, 6, 24], obstacle: true, able: { visible: 1, bullet: 1, obstacle: 1 }, props: ['wall', 'construction'], obstacleID: 'small_building', rgb: [150, 150, 140] },
    fx_house: { vol: 'body', box: [160, 120, 120], obstacle: true, able: { visible: 1, bullet: 1, obstacle: 1 }, props: ['construction'], obstacleID: 'construction', rgb: [150, 90, 70] },
    fx_bush: { vol: 'crown', box: [40, 40, 24], obstacle: false, able: { visible: 1, bullet: 0, obstacle: 0 }, props: ['tree', 'bush'], obstacleID: 'nothing', rgb: [70, 110, 50] },
  },
  roadDecal: { def: 'fx_road', sprite: 64, scale: 1 },   // {Sprite "fx_road.mtl" {Scale 1}} (vanilla aerostrip.def form)
};
const OFF = { x: SPEC.offX, y: SPEC.offY };
const W_LEVEL = SPEC.clip.water;

// ---------------------------------------------------------------- terrain rules (the fixture's own definition)
function ridgeH(x) {   // 60 x max(0, 1 - |x + 200| / 100), exact integer on the 5 u and 10 u lattices
  const d = Math.abs(x - SPEC.ridge.x);
  return d >= SPEC.ridge.half ? 0 : Math.round(SPEC.ridge.top * (SPEC.ridge.half - d) / SPEC.ridge.half);
}
function cellRecord(form, i, j) {   // map.net record (i, j) = lattice point (i, j): {x, y, h, type, material} (stored)
  const F = SPEC.forms[form], x = i * F.cell - OFF.x, y = j * F.cell - OFF.y;
  const r = Math.hypot(x - SPEC.pond.x, y - SPEC.pond.y);
  const ring = SPEC.pond.rings.find(g => r < g.rMax);
  if (ring) return { x, y, h: ring.h, type: ring.type, material: SPEC.matOfType[ring.type] };
  const road = y >= SPEC.road.y0 && y < SPEC.road.y1;
  return { x, y, h: ridgeH(x), type: road ? 7 : 1, material: road ? 9 : 1 };
}
// load re-type (design 2): stored 3..5 -> by d' = W - h + 1
function retype(stored, h, W) {
  if (stored < 3 || stored > 5) return stored;
  const d = W - h + 1;
  return d > 100 ? 5 : d > 14 ? 4 : d > 0 ? 3 : 1;
}
// slope class (port , + , float32 maths
// FloatToInt = truncation, cells clamped to the level). hAt(i, j) -> stored height (u).
function slopeClass(hAt, w, h, cell, i, j) {
  const f = Math.fround, OFFS = [[-3, 0], [-2, 2], [0, 3], [2, 2], [3, 0], [2, -2], [0, -3], [-2, -2], [0, 0]];
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const inv = f(1 / cell), h0 = hAt(i, j);
  let n = 0, sX = 0, sY = 0, sXX = 0, sYY = 0, sXY = 0, sXZ = 0, sYZ = 0, sZ = 0;
  for (const [dx, dy] of OFFS) {
    const px = dx, py = dy, pz = f(f(hAt(cl(i + dx, 0, w - 1), cl(j + dy, 0, h - 1)) - h0) * inv);
    sX = f(px + sX); sXX = f(f(px * px) + sXX); sY = f(sY + py); sYY = f(f(py * py) + sYY); sXY = f(f(py * px) + sXY);
    sZ = f(pz + sZ); sXZ = f(f(pz * px) + sXZ); sYZ = f(sYZ + f(pz * py)); n++;
  }
  let cosine = 1;
  if (n >= 3) {
    const N = f(n), sxy = sXY, nSxy = f(sxy * N), sxSy = f(sX * sY), sySxy = f(sY * sxy), sySy = f(sY * sY), sxySxy = f(sxy * sxy),
      sxSxy = f(sX * sxy), sxSx = f(sX * sX);
    const det = f(f(f(f(f(sxSxy + sxSxy) * sY) - f(N * sxySxy)) + f(f(sYY * N) * sXX) - f(sYY * sxSx)) - f(sXX * sySy));
    if (Math.abs(det) >= 1e-5) {
      const iv = f(1 / det);
      const a = f(f(f(f(f(f(f(sXZ * N) * sYY) - f(sYZ * nSxy)) + f(sYZ * sxSy)) - f(f(sZ * sX) * sYY)) + f(sZ * sySxy) - f(sXZ * sySy)) * iv);
      const b = f(-f(f(f(f(f(f(sXZ * nSxy) - f(sZ * sxSxy)) - f(sXZ * sxSy)) + f(f(sZ * sY) * sXX)) - f(f(sYZ * N) * sXX) + f(sYZ * sxSx)) * iv));
      const len = Math.sqrt(a * a + b * b + 1);
      cosine = f(1 / len);
    }
  }
  const v = f(Math.acos(cosine) * f(9.5492964));
  return cl(Math.trunc(v), 0, 14);
}

// ---------------------------------------------------------------- binary writers
// map.net (layout of tools/lib/mapnet.js): u8 cell, u8 version 2, i16 w, i16 h, f32 offX, f32 offY, 'MAP0' + 'MAP1'
// tables {u8 n; n x {u8 index; count-string}}, 'GRID', w*h x {i16 h, u8 type, u8 material}, row-major j*w+i.
function netWrite(o) {
  const head = Buffer.alloc(14);
  head.writeUInt8(o.cell, 0); head.writeUInt8(o.version, 1); head.writeInt16LE(o.w, 2); head.writeInt16LE(o.h, 4);
  head.writeFloatLE(o.offX, 6); head.writeFloatLE(o.offY, 10);
  const parts = [head];
  for (const [tag, list] of [['MAP0', o.types], ['MAP1', o.materials]]) {
    parts.push(Buffer.from(tag, 'latin1'), Buffer.from([list.length]));
    for (const [id, name] of list) {
      const s = Buffer.from(name, 'latin1');
      if (s.length >= 255) throw new Error('netWrite: name too long');
      parts.push(Buffer.from([id, s.length]), s);
    }
  }
  parts.push(Buffer.from('GRID', 'latin1'));
  const cells = Buffer.alloc(o.w * o.h * 4);
  for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) {
    const c = o.cellAt(i, j), p = (j * o.w + i) * 4;
    cells.writeInt16LE(c.h, p); cells[p + 2] = c.type; cells[p + 3] = c.material;
  }
  parts.push(cells);
  return Buffer.concat(parts);
}
function netBuffer(form) {
  const F = SPEC.forms[form];
  return netWrite({ cell: F.cell, version: 2, w: F.w, h: F.h, offX: OFF.x, offY: OFF.y, types: SPEC.types, materials: SPEC.materials,
    cellAt: (i, j) => cellRecord(form, i, j) });
}
// uncompressed 32-bit DDS (A8R8G8B8, no mips): rgba(x, y) -> [r, g, b, a], row 0 first
function ddsWrite(w, h, rgba) {
  const b = Buffer.alloc(128 + w * h * 4);
  b.write('DDS ', 0, 'latin1');
  const u = (o, v) => b.writeUInt32LE(v >>> 0, o);
  u(4, 124); u(8, 0x100f); u(12, h); u(16, w); u(20, w * 4); u(76, 32); u(80, 0x41); u(88, 32);
  u(92, 0x00ff0000); u(96, 0x0000ff00); u(100, 0x000000ff); u(104, 0xff000000); u(108, 0x1000);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, bl, a] = rgba(x, y), p = 128 + (y * w + x) * 4;
    b[p] = bl; b[p + 1] = g; b[p + 2] = r; b[p + 3] = a;
  }
  return b;
}
// EPLY box mesh as vanilla static props are stored (BNDS MESH VERT INDX; fvf 0x152 position normal colour uv, part flags
// 0x404 normals + material name, VERT flags 1) [V data fence_stone3.ply]. Box centred on x, y; z from 0 to sz.
function plyBox(sx, sy, sz, mtl) {
  const hx = sx / 2, hy = sy / 2;
  const faces = [   // normal, 4 corners
    [[1, 0, 0], [[hx, -hy, 0], [hx, hy, 0], [hx, hy, sz], [hx, -hy, sz]]],
    [[-1, 0, 0], [[-hx, hy, 0], [-hx, -hy, 0], [-hx, -hy, sz], [-hx, hy, sz]]],
    [[0, 1, 0], [[hx, hy, 0], [-hx, hy, 0], [-hx, hy, sz], [hx, hy, sz]]],
    [[0, -1, 0], [[-hx, -hy, 0], [hx, -hy, 0], [hx, -hy, sz], [-hx, -hy, sz]]],
    [[0, 0, 1], [[-hx, -hy, sz], [hx, -hy, sz], [hx, hy, sz], [-hx, hy, sz]]],
    [[0, 0, -1], [[-hx, hy, 0], [hx, hy, 0], [hx, -hy, 0], [-hx, -hy, 0]]],
  ];
  const stride = 36, nv = 24, vb = Buffer.alloc(nv * stride), ix = [];
  const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
  faces.forEach(([nrm, cs], fi) => {
    cs.forEach((c, k) => {
      const o = (fi * 4 + k) * stride;
      vb.writeFloatLE(c[0], o); vb.writeFloatLE(c[1], o + 4); vb.writeFloatLE(c[2], o + 8);
      vb.writeFloatLE(nrm[0], o + 12); vb.writeFloatLE(nrm[1], o + 16); vb.writeFloatLE(nrm[2], o + 20);
      vb.writeUInt32LE(0xffffffff, o + 24); vb.writeFloatLE(uv[k][0], o + 28); vb.writeFloatLE(uv[k][1], o + 32);
    });
    const q = fi * 4; ix.push(q, q + 1, q + 2, q, q + 2, q + 3);
  });
  // written by the shared EPLY writer (tools/lib/model/ply.js write): the vertex bytes go in as raw (position f3 at 0,
  // normal f3 at 12, colour at 24, uv0 f2 at 28), no decoded arrays, so the writer copies them as they are
  return require(path.join(LIB, 'model/ply')).write({
    magic: 'EPLY',
    bounds: Float32Array.from([-hx, -hy, 0, hx, hy, sz]),
    parts: [{ tag: 'MESH', fvf: 0x152, firstFace: 0, faceCount: 12, flags: 0x404, material: mtl }],
    vertices: { count: nv, stride, flags: 1, raw: vb },
    indices: Uint16Array.from(ix),
  });
}

// ---------------------------------------------------------------- SDL text (tabs, CRLF, ASCII)
// node = string (a one-line block or a bare line) | [head, ...kids] (a block over several lines)
const num = n => { if (!Number.isFinite(n)) throw new Error('fxmake: bad number ' + n); return String(n); };
const hex = n => '0x' + n.toString(16);
const q = s => '"' + s + '"';
function sdl(nodes, depth = 0) {
  const t = '\t'.repeat(depth);
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += t + n + CRLF; continue; }
    out += t + '{' + n[0] + CRLF + sdl(n.slice(1), depth + 1) + t + '}' + CRLF;
  }
  return out;
}
const textBuf = s => {
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(s)) throw new Error('fxmake: non-ASCII text');
  return Buffer.from(s, 'latin1');
};
const xformOf = (yaw, scale) => {
  const p = [];
  if (yaw) p.push('zl ' + num(yaw));
  if (scale != null && scale !== 1) p.push('scale ' + num(scale));
  return p.length ? ['{xform ' + p.join(' ') + '}'] : [];
};

function mapText(form) {
  const F = SPEC.forms[form], c = SPEC.clip;
  const box = b => b.map(num).join(' ');
  const head = [
    ['map',
      ['Land', '{Position 0 0}'],
      ['Clips', [q(c.name), '{world ' + box(c.world) + '}', '{camera ' + box(c.camera) + '}', '{pather ' + box(c.pather) + '}',
        '{distance ' + F.distance.join(' ') + '}', '{viewAngle ' + F.viewAngle.join(' ') + '}', '{water ' + num(c.water) + '}']],
    ],
  ];
  const root = head[0];
  if (F.ocean) root.push(['Ocean', '{ww_environment_mode ' + F.ocean.kind + '}', '{active}', '{zlevel ' + num(F.ocean.zlevel) + '}',
    '{state calm}', '{waveamount 8}', '{wavedir 50}']);
  for (const e of SPEC.entities) {
    const b = ['Entity ' + q(e.def) + ' ' + hex(e.uid), '{Position ' + num(e.x) + ' ' + num(e.y) + '}', ...xformOf(e.yaw, e.scale)];
    if (e.color != null) b.push('{Color ' + hex(e.color) + '}');
    if (e.decalOrder != null) b.push('{DecalOrder ' + e.decalOrder + '}');
    root.push(b);
  }
  return sdl(head);
}

function spawnRec(form, s) {
  const ext = ['Extender "map_point"', '{name ' + s.name + '}', '{team ' + s.team + '}'];
  if (form === 'goh') ext.push(['zone', '{radius 0}', '{zoneId ""}']);
  ext.push('{phase ' + s.phase + '}', '{order ' + s.order + '}', '{visor SpawnPoint}');
  if (form === 'goh') ext.push(['allow', '{enableCapture}', '{enableRelease}']);
  return ['Entity "map_point" ' + hex(s.uid), '{Position ' + num(s.x) + ' ' + num(s.y) + '}', ...xformOf(s.yaw), ext, '{Player 0}'];
}
function flagRec(form, f, o = {}) {
  const ext = ['Extender "map_point"', '{name ' + f.name + '}'];
  if (form === 'goh') ext.push(['zone', '{radius ' + num(f.goh.radius) + '}', '{zoneId ' + q(f.goh.zoneId) + '}']);
  else {
    if (!(o.drop === f.name + '.zoneA')) ext.push('{zoneA ' + num(f.zoneA) + '}');
    ext.push('{zoneB ' + num(f.zoneB) + '}');
  }
  ext.push('{phase 0}', '{order ' + f.order + '}', '{show All}', '{visor MapPoint}');
  if (form === 'goh') ext.push(['allow', '{enableCapture}', '{enableRelease}']);
  return ['Entity ' + q(f.def) + ' ' + hex(f.uid), '{Position ' + num(f.x) + ' ' + num(f.y) + '}', ...xformOf(0, f.scale), ext, '{Player 0}'];
}
function miTail(form, helpers) {
  return ['{Environment ' + q(SPEC.forms[form].env) + '}', ['Helpers', ...helpers, ['reinforcements', '{scoreTotal 0}', '{scoreCurrent 0}']], '{Fog 1}'];
}
// mode file text. o.spawnA1 = moved a1 (mod), o.noPoly = leave the Helpers poly out (seeded defect), o.drop = 'f1.zoneA'
function miText(form, mode, o = {}) {
  const ents = [], helpers = [];
  const spawns = SPEC.spawns.map(s => (s.name === 'a1' && o.spawnA1 ? Object.assign({}, s, o.spawnA1) : s));
  if (mode === 'combat') ents.push(...spawns.map(s => spawnRec(form, s)));
  else if (mode === 'battle_zones') {
    ents.push(...SPEC.flags.map(f => flagRec(form, f, o)), ...spawns.map(s => spawnRec(form, s)));
    if (form === 'goh' && !o.noPoly) {
      const p = SPEC.poly;
      helpers.push(['zone "poly"', '{position ' + p.position.map(num).join(' ') + '}', '{Name ' + q(p.name) + '}',
        ...p.points.map(([dx, dy]) => '{Point ' + num(dx) + ' ' + num(dy) + '}')]);
    }
  } else if (mode === 'frontline' || mode === 'frontlines') {
    const p = SPEC.frontline.point, s = SPEC.frontline.spawn;
    ents.push(spawnRec(form, p));
    ents.push(['Entity "spawn_point" ' + hex(s.uid), '{Position ' + num(s.x) + ' ' + num(s.y) + '}', ...xformOf(s.yaw),
      ['Extender "spawn_point"', '{mapPoint ' + s.mapPoint + '}', '{pos ' + s.pos + '}'], '{Player 0}']);
  } else throw new Error('fxmake: no mode ' + mode);
  return sdl([['mission', ...ents, ...miTail(form, helpers)]]);
}

function terrainsText() {
  const pp = { ground: 'ground no_pass', road: 'ground road no_pass', country_road: 'ground road no_pass' };
  const phys = { ground: 'ground', road: 'rock', country_road: 'rock' };
  return sdl([['terrains', ...SPEC.terrains.map(t => [q(t), '{effect ' + q(t) + '}', '{physics ' + q(phys[t]) + '}', '{pp ' + q(pp[t]) + '}'])]]);
}
function defText(name) {
  const d = SPEC.defs[name], a = d.able;
  return sdl([['game_entity',
    '{Extension ' + q(name + '.mdl') + '}',
    '{obstacleID ' + q(d.obstacleID) + '}',
    '{props ' + d.props.map(q).join(' ') + '}',
    ['Volume ' + q(d.vol), '{Tags "body"}', '{able {visible ' + a.visible + '} {bullet ' + a.bullet + '} {obstacle ' + a.obstacle + '}}'],
  ]]);
}
function mdlText(name) {
  const d = SPEC.defs[name], [bx, by, bz] = d.box, nodes = [];
  nodes.push(['Skeleton', ['bone ' + q(name), ['Orientation', '1\t0\t0', '0\t1\t0', '0\t0\t1'], '{VolumeView ' + q(name + '.ply') + '}']]);
  if (d.obstacle) nodes.push(['Obstacle ' + q(d.vol), ['Obb2', '{Center 0 0}', '{Extent ' + num(bx / 2) + ' ' + num(by / 2) + '}', '{Axis 1 0}'], '{Rotate}']);
  nodes.push(['Volume ' + q(d.vol), '{Box ' + [bx, by, bz].map(num).join(' ') + '}', '{Bone ' + q(name) + '}', '{Position 0\t0\t' + num(bz / 2) + '}']);
  return sdl(nodes);
}
const mtlText = (tex, blend) => sdl([['material simple', '{diffuse ' + q(tex) + '}', '{blend ' + blend + '}']]);
function roadDefText() {
  const r = SPEC.roadDecal;
  return sdl([['entity', ['DecalView', ['Sprite ' + q(r.def + '.mtl'), '{Scale ' + num(r.scale) + '}'],
    '{orientation normal}', '{UseDirection }', '{layer grounddecal }']]]);
}
const roadMtlText = () => sdl([['material bump', ['diffuse ' + q(SPEC.roadDecal.def), '{Axis ' + SPEC.roadDecal.sprite + ' ' + SPEC.roadDecal.sprite + '}', '{AlphaChannel 1}'], '{Blend blend}']]);
const modInfoText = () => sdl([['mod', '{name "mvfx"}', '{desc "mapviz fixture mod"}', '{MinGameVersion "1.000"}', '{MaxGameVersion "9.999"}']]);

// every file of one form: [rel path under dir, Buffer], sorted
function files(form, o = {}) {
  const F = SPEC.forms[form];
  if (!F) throw new Error('fxmake: form must be as2 or goh');
  const G = F.game + '/', M = G + 'resource/map/' + MAP + '/', out = [];
  const add = (rel, buf) => out.push([rel, buf]);
  add(G + F.exeFile, Buffer.alloc(0));
  add(M + 'map', textBuf(mapText(form)));
  add(M + 'map.net', netBuffer(form));
  for (const m of F.modes) add(M + m + '.mi', textBuf(miText(form, m, o)));
  add(G + 'resource/set/interaction_terrain/terrains.set', textBuf(terrainsText()));
  const E = G + 'resource/entity/fx/';
  for (const name of Object.keys(SPEC.defs)) {
    const d = SPEC.defs[name];
    add(E + name + '.def', textBuf(defText(name)));
    add(E + name + '.mdl', textBuf(mdlText(name)));
    add(E + name + '.ply', plyBox(d.box[0], d.box[1], d.box[2], name + '.mtl'));
    add(E + name + '.mtl', textBuf(mtlText(name, 'none')));
    add(E + name + '.dds', ddsWrite(8, 8, () => d.rgb.concat(255)));
  }
  const R = G + 'resource/entity/landscape/stamp/road/', rs = SPEC.roadDecal.sprite;
  add(R + 'fx_road.def', textBuf(roadDefText()));
  add(R + 'fx_road.mtl', textBuf(roadMtlText()));
  add(R + 'fx_road.dds', ddsWrite(rs, rs, (x) => { const e = Math.min(x, rs - 1 - x); return [110, 100, 90, e < 8 ? e * 32 : 255]; }));
  const D = 'mods/mvfx/';
  add(D + 'mod.info', textBuf(modInfoText()));
  // the mod shadows the first mode's spawns file: AS2 combat.mi, GoH battle_zones.mi (GoH has no combat mode) [I]
  const modMode = form === 'goh' ? 'battle_zones' : 'combat';
  add(D + 'resource/map/' + MAP + '/' + modMode + '.mi', textBuf(miText(form, modMode, { spawnA1: SPEC.modSpawnA1 })));
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function make(dir, o = {}) {
  const form = o.form || 'as2', F = SPEC.forms[form];
  if (!F) throw new Error('fxmake: form must be as2 or goh, got ' + form);
  dir = path.resolve(dir);
  const other = form === 'as2' ? 'goh' : 'as2';
  if (fs.existsSync(path.join(dir, SPEC.forms[other].game))) throw new Error('fxmake: ' + dir + ' already holds the ' + other + ' form; make each form in its own dir');
  fs.rmSync(path.join(dir, 'mods', 'mvfx'), { recursive: true, force: true });
  fs.rmSync(path.join(dir, F.game), { recursive: true, force: true });
  for (const [rel, buf] of files(form, o)) {
    const p = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  return { gameDir: path.join(dir, F.game), target: F.target, map: MAP, mods: [], modDirs: [path.join(dir, 'mods', 'mvfx')] };
}

// ---------------------------------------------------------------- read back (verify) through the real libs
const LIB = path.resolve(__dirname, '../../lib');
function readSdl(buf, file) {
  const sdlx = require(path.join(LIB, 'sdlx'));
  const errs = [];
  const r = sdlx.read(buf, { file, key: file, open: () => null, onError: (f, l, c, m) => errs.push(c + ' ' + f + ':' + l + ' ' + m) });
  return { root: r.root, errs };
}
// generic SDL tree helpers (sdlx node kinds): a block's head words, its child blocks by first word
const words = b => b.items.filter(x => x.k !== 'BLOCK').map(x => (x.k === 'STRING' ? x.value : x.k === 'IDENT' ? x.text : x.value));
const kids = (b, name) => b.items.filter(x => x.k === 'BLOCK' && x.items.length && String(words(x)[0]).toLowerCase() === name.toLowerCase());
const kid = (b, name) => kids(b, name)[0] || null;
const val = (b, name, k = 1) => { const x = kid(b, name); return x ? words(x)[k] : undefined; };
// map_point and spawn_point records of a mission root: [{def, uid, x, y, yaw, scale, ext:{...}, zone}]
function missionRecords(root) {
  const mi = kid(root, 'mission') || root;
  return kids(mi, 'Entity').map(e => {
    const w = words(e), pos = kid(e, 'Position'), xf = kid(e, 'xform');
    const xw = xf ? words(xf).slice(1) : [];
    const rec = { def: w[1], uid: w[2], x: pos && words(pos)[1], y: pos && words(pos)[2], yaw: 0, scale: 1, ext: null, extName: null,
      color: kid(e, 'Color') ? val(e, 'Color') : null, decalOrder: kid(e, 'DecalOrder') ? val(e, 'DecalOrder') : null };
    for (let k = 0; k < xw.length; k += 2) { if (xw[k] === 'zl') rec.yaw = xw[k + 1]; if (xw[k] === 'scale') rec.scale = xw[k + 1]; }
    const ex = kid(e, 'Extender');
    if (ex) {
      rec.extName = words(ex)[1]; rec.ext = {};
      for (const b of ex.items.filter(x => x.k === 'BLOCK')) {
        const bw = words(b);
        if (bw[0] === 'zone') rec.ext.zone = { radius: val(b, 'radius'), zoneId: val(b, 'zoneId') };
        else rec.ext[bw[0]] = bw[1];
      }
    }
    return rec;
  });
}
function helperPolys(root) {
  const mi = kid(root, 'mission') || root, h = kid(mi, 'Helpers');
  if (!h) return [];
  return kids(h, 'zone').filter(z => words(z)[1] === 'poly').map(z => ({
    name: val(z, 'Name'), position: words(kid(z, 'position')).slice(1), points: kids(z, 'Point').map(p => words(p).slice(1)) }));
}
function clipsOf(root) {
  const m = kid(root, 'map') || root, c = kid(m, 'Clips');
  if (!c) return [];
  return c.items.filter(x => x.k === 'BLOCK').map(b => ({ name: words(b)[0], world: words(kid(b, 'world') || { items: [] }).slice(1),
    camera: words(kid(b, 'camera') || { items: [] }).slice(1), pather: words(kid(b, 'pather') || { items: [] }).slice(1),
    water: kid(b, 'water') ? words(kid(b, 'water'))[1] : null }));
}

function verify(dir, form) {
  const mapnet = require(path.join(LIB, 'mapnet'));
  const F = SPEC.forms[form], P = [], bad = s => P.push(s);
  const M = path.join(dir, F.game, 'resource', 'map', ...MAP.split('/'));
  const rd = p => { try { return fs.readFileSync(p); } catch (e) { bad('missing ' + path.relative(dir, p).replace(/\\/g, '/')); return null; } };
  // map.net
  const nb = rd(path.join(M, 'map.net'));
  if (nb) {
    const n = mapnet.parse(nb);
    for (const p of n.problems) bad('map.net ' + p.code + ': ' + p.msg);
    const want = { cell: F.cell, version: 2, width: F.w, height: F.h, offX: OFF.x, offY: OFF.y };
    for (const k of Object.keys(want)) if (n[k] !== want[k]) bad('map.net ' + k + ' ' + n[k] + ', want ' + want[k]);
    const tl = l => JSON.stringify(l.map(t => [t.index, t.name]));
    if (tl(n.types) !== JSON.stringify(SPEC.types)) bad('map.net types ' + tl(n.types));
    if (tl(n.materials) !== JSON.stringify(SPEC.materials)) bad('map.net materials ' + tl(n.materials));
    if (!n.problems.length && n.width === F.w && n.height === F.h) {
      let diff = 0;
      for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) {
        const c = mapnet.cellAt(n, i, j), s = cellRecord(form, i, j);
        if (!c || c.height !== s.h || c.type !== s.type || c.material !== s.material) diff++;
      }
      if (diff) bad('map.net ' + diff + ' cells differ from the spec');
    }
  }
  // map
  const mb = rd(path.join(M, 'map'));
  if (mb) {
    const { root, errs } = readSdl(mb, 'map');
    errs.forEach(e => bad('map: ' + e));
    const cl = clipsOf(root);
    const c = SPEC.clip;
    if (cl.length !== 1 || cl[0].name !== c.name || JSON.stringify(cl[0].world) !== JSON.stringify(c.world) || JSON.stringify(cl[0].camera) !== JSON.stringify(c.camera)
      || JSON.stringify(cl[0].pather) !== JSON.stringify(c.pather) || cl[0].water !== c.water) bad('map Clips ' + JSON.stringify(cl));
    const m = kid(root, 'map');
    // def, uid, position, xform yaw and scale, Color, DecalOrder of every map entity
    const ents = m ? missionRecords(m).map(e => [e.def, e.uid, e.x, e.y, e.yaw, e.scale, e.color, e.decalOrder]) : [];
    const want = SPEC.entities.map(e => [e.def, e.uid, e.x, e.y, e.yaw || 0, e.scale == null ? 1 : e.scale,
      e.color == null ? null : e.color, e.decalOrder == null ? null : e.decalOrder]);
    if (JSON.stringify(ents) !== JSON.stringify(want)) bad('map entities ' + JSON.stringify(ents));
    if (!!(m && kid(m, 'Ocean')) !== !!F.ocean) bad('map Ocean block ' + (F.ocean ? 'missing' : 'present'));
  }
  // mode files
  for (const mode of F.modes) {
    const b = rd(path.join(M, mode + '.mi'));
    if (!b) continue;
    const { root, errs } = readSdl(b, mode + '.mi');
    errs.forEach(e => bad(mode + '.mi: ' + e));
    const recs = missionRecords(root);
    if (mode === 'battle_zones') {
      for (const f of SPEC.flags) {
        const r = recs.find(x => x.ext && x.ext.name === f.name);
        if (!r) { bad(mode + '.mi: no flag ' + f.name); continue; }
        if (r.x !== f.x || r.y !== f.y || r.def !== f.def) bad(mode + '.mi: flag ' + f.name + ' at ' + r.x + ',' + r.y);
        if (form === 'as2') {
          if (r.ext.zoneA !== f.zoneA || r.ext.zoneB !== f.zoneB) bad(mode + '.mi: flag ' + f.name + ' zone ' + r.ext.zoneA + '/' + r.ext.zoneB + ', want ' + f.zoneA + '/' + f.zoneB);
        } else {
          const z = r.ext.zone;
          if (!z || z.radius !== f.goh.radius || z.zoneId !== f.goh.zoneId) bad(mode + '.mi: flag ' + f.name + ' zone ' + JSON.stringify(z));
          if (f.goh.zoneId && !helperPolys(root).some(p => p.name === f.goh.zoneId)) bad(mode + '.mi: zone "poly" ' + f.goh.zoneId + ' missing (flag ' + f.name + ')');
        }
      }
    }
    if (mode === 'battle_zones' || mode === 'combat') {
      for (const s of SPEC.spawns) {
        const r = recs.find(x => x.ext && x.ext.name === s.name);
        if (!r || r.x !== s.x || r.y !== s.y || r.yaw !== s.yaw || r.ext.team !== s.team) bad(mode + '.mi: spawn ' + s.name + ' ' + JSON.stringify(r));
      }
    }
    if (mode === 'frontline' || mode === 'frontlines') {
      const s = SPEC.frontline.spawn, r = recs.find(x => x.extName === 'spawn_point');
      if (!r || r.x !== s.x || r.y !== s.y || r.yaw !== s.yaw || r.ext.mapPoint !== s.mapPoint || r.ext.pos !== s.pos) bad(mode + '.mi: spawn_point ' + JSON.stringify(r));
      const p = recs.find(x => x.ext && x.ext.name === SPEC.frontline.point.name);
      if (!p || p.ext.phase !== SPEC.frontline.point.phase || p.ext.team !== SPEC.frontline.point.team) bad(mode + '.mi: map_point fa1 ' + JSON.stringify(p));
    }
  }
  // the mod's mode file: a1 moved to modSpawnA1, the other spawns as the spec
  const modMode = form === 'goh' ? 'battle_zones' : 'combat';
  const modRel = 'mods/mvfx/resource/map/' + MAP + '/' + modMode + '.mi';
  const xb = rd(path.join(dir, ...modRel.split('/')));
  if (xb) {
    const { root, errs } = readSdl(xb, modMode + '.mi');
    errs.forEach(e => bad(modRel + ': ' + e));
    const recs = missionRecords(root);
    for (const s of SPEC.spawns) {
      const w = s.name === 'a1' ? Object.assign({}, s, SPEC.modSpawnA1) : s, r = recs.find(x => x.ext && x.ext.name === s.name);
      if (!r || r.x !== w.x || r.y !== w.y || r.yaw !== w.yaw || r.ext.team !== w.team) bad(modRel + ': spawn ' + s.name + ' ' + JSON.stringify(r));
    }
  }
  // the other files (exe, terrains.set, mod.info, entity def / mdl / ply / mtl / dds, road stamp) hold exactly the spec bytes
  for (const [rel, buf] of files(form)) {
    if (/\/resource\/map\//.test('/' + rel)) continue;   // map folders: read and compared above
    const p = path.join(dir, ...rel.split('/'));
    if (!fs.existsSync(p)) bad('missing ' + rel);
    else if (!fs.readFileSync(p).equals(buf)) bad(rel + ': differs from the spec');
  }
  // text files are CRLF, ASCII
  for (const [rel, buf] of files(form)) {
    if (/\.(net|ply|dds|exe)$/.test(rel)) continue;
    const p = path.join(dir, ...rel.split('/'));
    let b; try { b = fs.readFileSync(p); } catch (e) { continue; }
    const s = b.toString('latin1');
    if (/[^\r]\n/.test(s) || /\r(?!\n)/.test(s)) bad(rel + ': not CRLF');
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(s)) bad(rel + ': not ASCII');
  }
  return P;
}

// ---------------------------------------------------------------- answers (README 5, 6.1) from the definition
const sha16 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const STACK_HASH = sha16('');   // vanilla stack [I]: mapkit's own stack hash formula is its own; page tests do not compare it
function flagZone(form, f) {
  if (form === 'as2') return { kind: 'circle', rA: Math.max(1, f.zoneA) * 20, rB: Math.max(1, f.zoneB) * 20 };
  if (f.goh.zoneId) {
    const p = SPEC.poly;
    return { kind: 'poly', pts: p.points.map(([dx, dy]) => [p.position[0] + dx, p.position[1] + dy]) };
  }
  return f.goh.radius > 0 ? { kind: 'circle', rA: f.goh.radius, rB: f.goh.radius } : null;
}
function modeOf(form, id) {
  const F = SPEC.forms[form];
  const sp = s => ({ name: s.name, uid: s.uid, team: s.team, order: s.order, x: s.x, y: s.y, z: null, yaw: s.yaw, player: 0, phase: s.phase });
  const mode = { id, file: id + '.mi', env: F.env, water: null, spawns: [], flags: [], points: [], clipsBySide: [] };
  const ents = [];
  const ent = (uid, name, def, x, y, yaw, scale) => ents.push({ uid, name, def, x, y, z: null, yaw, scale, texmod: null, unlinked: false,
    player: 0, src: 'mi', mode: id, decal: null });
  if (id === 'battle_zones') {
    for (const f of SPEC.flags) {
      mode.flags.push({ name: f.name, def: f.def, uid: f.uid, team: null, order: f.order, x: f.x, y: f.y, z: null, phase: 0, slaveOf: null,
        zoneId: form === 'goh' ? f.goh.zoneId : null, zone: flagZone(form, f), fort: [] });
      ent(f.uid, f.name, f.def, f.x, f.y, 0, f.scale);
    }
  }
  if (id === 'battle_zones' || id === 'combat') for (const s of SPEC.spawns) { mode.spawns.push(sp(s)); ent(s.uid, s.name, 'map_point', s.x, s.y, s.yaw, 1); }
  if (id === 'frontline' || id === 'frontlines') {
    const p = SPEC.frontline.point, s = SPEC.frontline.spawn;
    mode.spawns.push(sp(p));
    mode.spawns.push({ name: null, uid: s.uid, team: p.team, order: s.pos, x: s.x, y: s.y, z: null, yaw: s.yaw, player: 0, phase: p.phase });
    ent(p.uid, p.name, 'map_point', p.x, p.y, p.yaw, 1);
    ent(s.uid, null, 'spawn_point', s.x, s.y, s.yaw, 1);
  }
  return { mode, ents };
}
function docOf(form) {
  const F = SPEC.forms[form], c = SPEC.clip;
  const modes = [], miEnts = [];
  for (const id of F.modes) { const m = modeOf(form, id); modes.push(m.mode); miEnts.push(...m.ents); }
  const mapEnts = SPEC.entities.map(e => {
    const col = e.color;
    return { uid: e.uid, name: null, def: e.def, x: e.x, y: e.y, z: null, yaw: e.yaw || 0, scale: e.scale == null ? 1 : e.scale, texmod: null,
      unlinked: false, player: null, src: 'map', mode: null,
      decal: e.decalOrder == null ? null : { order: e.decalOrder, color: [(col >>> 16) & 255, (col >>> 8) & 255, col & 255, (col >>> 24) & 255], opacity: ((col >>> 24) & 255) / 255 } };
  });
  return {
    v: 1, game: F.target, key: MAP, stack: { mods: [], hash: STACK_HASH }, cell: F.cell, upm: SPEC.upm,
    net: { w: F.w, h: F.h, offX: OFF.x, offY: OFF.y, cell: F.cell, version: 2,
      types: SPEC.types.map(([id, name]) => ({ id, name, engine: id })),
      materials: SPEC.materials.map(([id, name]) => ({ id, name, engine: id })) },
    boxes: { world: c.world.slice(), auto: c.world.slice(), camera: c.camera.slice(), pather: c.pather.slice(),
      named: [{ name: c.name, world: c.world.slice(), camera: c.camera.slice(), pather: c.pather.slice(), water: c.water }] },
    water: { level: c.water, source: 'map', ocean: F.ocean ? Object.assign({}, F.ocean) : null },
    modes,
    entities: mapEnts.concat(miEnts),
    covers: [],
    pictures: { minimap: null, preview: null, preview_small: null, header: null, header_interface: null },   // README 3.2: always the five stems, null when the map ships no such picture (the fixture ships none)
    notes: [],
  };
}
// per-cell layers after the load re-type with W of the map (every fixture mode has no {water} of its own)
function layersOf(form) {
  const F = SPEC.forms[form], n = F.w * F.h;
  const height = new Int16Array(n), gtype = new Uint8Array(n), material = new Uint8Array(n), band = new Uint8Array(n), slope = new Uint8Array(n);
  const rec = [];
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) rec.push(cellRecord(form, i, j));
  const hAt = (i, j) => rec[j * F.w + i].h;
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) {
    const k = j * F.w + i, r = rec[k], edge = i === F.w - 1 || j === F.h - 1;
    const t = edge ? r.type : retype(r.type, r.h, W_LEVEL);
    height[k] = r.h; gtype[k] = t;
    material[k] = t === 1 && r.type !== 1 ? 1 : r.material;
    band[k] = t === 4 || t === 5 ? 2 : t === 3 ? 1 : 0;
    slope[k] = slopeClass(hAt, F.w, F.h, F.cell, i, j);
  }
  return { height, gtype, material, band, slope };
}
const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
function answers() {
  const pal = require(path.join(__dirname, '..', 'palette.json'));
  const out = {
    v: 1,
    about: 'Route answers for page tests (README 5, 6.1), computed by tools/mapviz/test/fxmake.js from the fixture definition. ' +
      'Each entry is {q: the request, a: the answer}. Not compared by page tests: stack.hash (vanilla stack, sha1 of an empty ' +
      'string here), maps[].container. Regenerate with: node tools/mapviz/test/fxmake.js --write',
    as2: {}, goh: {},
  };
  const A = SPEC.forms.as2, base = { target: A.target, map: MAP };
  const docA = docOf('as2'), docG = docOf('goh');
  out.as2.maps = { q: { route: 'maps', target: A.target }, a: { v: 1, maps: [{ key: MAP, group: 'multi', source: 'loose', container: '<game>',
    mod: null, modes: A.modes.slice(), files: A.modes.map(m => m + '.mi').concat(['map', 'map.net']).sort(), pictures: [] }] } };
  out.as2.doc = { q: Object.assign({ route: 'doc', entities: 1 }, base), a: docA };
  const vec = (doc, form, name, items, palKey) => ({ v: 1, kind: 'vector', name, map: MAP, target: SPEC.forms[form].target, items, pal: palKey, palette: pal[palKey] });
  const spawnItems = doc => [].concat(...doc.modes.map(m => m.spawns.map(s => ({ kind: 'spawn', mode: m.id, name: s.name, team: s.team, order: s.order, x: s.x, y: s.y, z: s.z, yaw: s.yaw }))));
  const flagItems = doc => [].concat(...doc.modes.map(m => m.flags.map(f => ({ kind: 'flag', mode: m.id, name: f.name, team: f.team, x: f.x, y: f.y, z: f.z, zone: f.zone, phase: f.phase }))));
  const boxItems = doc => {
    const it = [{ kind: 'box', box: 'world', clip: null, b: doc.boxes.world }, { kind: 'box', box: 'auto', clip: '[auto]', b: doc.boxes.auto }];
    for (const c of doc.boxes.named) it.push({ kind: 'box', box: 'camera', clip: c.name, b: c.camera }, { kind: 'box', box: 'pather', clip: c.name, b: c.pather });
    return it;
  };
  out.as2.layer = {
    spawns: { q: Object.assign({ route: 'layer', name: 'spawns' }, base), a: vec(docA, 'as2', 'spawns', spawnItems(docA), 'sides') },
    flags: { q: Object.assign({ route: 'layer', name: 'flags' }, base), a: vec(docA, 'as2', 'flags', flagItems(docA), 'sides') },
    boxes: { q: Object.assign({ route: 'layer', name: 'boxes' }, base), a: vec(docA, 'as2', 'boxes', boxItems(docA), 'masks') },
  };
  const L = layersOf('as2');
  out.as2.layer['water.band'] = { q: Object.assign({ route: 'layer', name: 'water.band', mode: 'battle_zones' }, base), a: {
    v: 1, kind: 'grid', name: 'water.band', map: MAP, target: A.target, w: A.w, h: A.h, cell: A.cell, ox: -OFF.x, oy: -OFF.y,
    etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: b64(L.band), pal: 'water.bands', palette: pal.water.bands } };
  let k = 1;
  while (Math.ceil(A.w / k) * Math.ceil(A.h / k) > (1 << 21)) k++;
  const names = {};
  for (const [id, name] of SPEC.materials) names[id] = name;
  out.as2.hover = { q: Object.assign({ route: 'hover', mode: 'battle_zones' }, base), a: {
    v: 1, kind: 'hover', map: MAP, target: A.target, mode: 'battle_zones', step: k, w: A.w, h: A.h, cell: A.cell * k, ox: -OFF.x, oy: -OFF.y,
    waterLevel: W_LEVEL, layers: { height: { etype: 'i16', scale: 1, nodata: null, data: b64(L.height) }, slopecls: { etype: 'u8', data: b64(L.slope) },
      gtype: { etype: 'u8', data: b64(L.gtype) }, material: { etype: 'u8', data: b64(L.material), names }, 'water.band': { etype: 'u8', data: b64(L.band) } } } };
  const G = SPEC.forms.goh, gb = { target: G.target, map: MAP };
  out.goh.doc = { q: Object.assign({ route: 'doc', entities: 1 }, gb), a: docG };
  out.goh.layer = { flags: { q: Object.assign({ route: 'layer', name: 'flags' }, gb), a: vec(docG, 'goh', 'flags', flagItems(docG), 'sides') } };
  return out;
}
const ANSWERS = path.join(__dirname, 'fxanswers.json');
const answersText = () => JSON.stringify(answers(), null, 1) + '\n';

function check(scratch, o = {}) {
  const problems = [];
  scratch = path.resolve(scratch);
  for (const form of ['as2', 'goh']) {
    const d = path.join(scratch, 'fxcheck-' + form);
    fs.rmSync(d, { recursive: true, force: true });
    make(d, { form });
    for (const p of verify(d, form)) problems.push(form + ': ' + p);
  }
  let have = null;
  try { have = fs.readFileSync(o.answersFile || ANSWERS, 'utf8'); } catch (e) { problems.push('fxanswers.json missing'); }
  if (have !== null && have.replace(/\r\n/g, '\n') !== answersText()) {
    let where = '';
    try {
      const a = JSON.parse(have), b = answers();
      const walk = (x, y, p) => {
        if (where) return;
        if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y) || (x && typeof x === 'object') !== (y && typeof y === 'object')) { where = p; return; }
        if (x && typeof x === 'object') { for (const k of new Set(Object.keys(x).concat(Object.keys(y)))) walk(x[k], y[k], p + '.' + k); }
        else if (x !== y) where = p;
      };
      walk(a, b, '');
    } catch (e) { where = ' (not JSON: ' + e.message + ')'; }
    problems.push('fxanswers.json differs from a fresh computation at ' + (where || '(formatting)'));
  }
  return { ok: !problems.length, problems };
}

module.exports = { SPEC, MAP, make, verify, check, answers, files, cellRecord, retype, slopeClass, ridgeH, netWrite, netBuffer,
  plyBox, ddsWrite, miText, mapText, readSdl, missionRecords, helperPolys, clipsOf, docOf, layersOf, STACK_HASH };

if (require.main === module) {
  const a = process.argv.slice(2);
  try {
    if (a[0] === '--check') {
      if (!a[1]) { console.error('usage: node tools/mapviz/test/fxmake.js --check <scratch>'); process.exit(2); }
      const r = check(a[1]);
      for (const p of r.problems) console.log('FAIL fxmake: ' + p);
      console.log(r.ok ? 'PASS fxmake check' : 'FAIL fxmake check (' + r.problems.length + ')');
      process.exit(r.ok ? 0 : 1);
    } else if (a[0] === '--write') {
      fs.writeFileSync(ANSWERS, answersText());
      console.log('wrote tools/mapviz/test/fxanswers.json');
    } else if (a[0] && !a[0].startsWith('-')) {
      let form = 'as2';
      const i = a.indexOf('--form');
      if (i >= 0 && (!a[i + 1] || a[i + 1].startsWith('-'))) { console.error('usage: node tools/mapviz/test/fxmake.js <dir> [--form as2|goh]'); process.exit(2); }
      if (i >= 0) form = a[i + 1];
      console.log(JSON.stringify(make(a[0], { form })));
    } else {
      console.log('usage: node tools/mapviz/test/fxmake.js <dir> [--form as2|goh] | --check <scratch> | --write');
      process.exit(a.length ? 2 : 0);
    }
  } catch (e) { console.error('fxmake: ' + e.message); process.exit(2); }
}
