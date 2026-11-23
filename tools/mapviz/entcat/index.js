// entcat (MV-ENT): what an object is. One catalog entry per entity def (category, footprint, volumes and heights) and the
// objects of a map (tools/mapviz/README.md 1.7, 5.3; section 4). All sync.
//   VERSION, CATEGORIES
//   catalog(src, {defs?, loader?, progress?, release?, stage?}) -> {v:1, target, stackHash, entries:{def: entry}, failed:[{def, code, msg}]}
//     src = mapkit source; loader = a scenecache L (opened on src.vfs when not given); defs = entity names (as mapdoc
//     writes entities[].def: lower case, no folder, no extension) or vfs keys; none = every def name of the stack.
//     A failing def gets a failed[] row with a code and never stops the catalog. Entries and failed are sorted by def.
//     release = n: drop the loader's scenes after every n defs built (the stack command; memory stays bounded).
//   entry(src, def, loader?) -> entry   (throws Error .code ENTCAT_DEF_MISSING | ENTCAT_DEF_PARSE | ENTCAT_MDL_MISSING |
//     ENTCAT_VOLUME_BAD | ENTCAT_MODEL_LOAD)
//   footprintOf(entry, placed{x, y, yaw, scale}?) -> {kind, pts:[[x,y]..]}   world polygon, scale then yaw then position;
//     placed defaults to the origin, yaw 0, scale 1; a fit is decided again at the placed scale (IsObstacleShape)
//   place(doc, catalog, links?) -> [{uid, def, category, fp, zMin, zMax}]  README 5.3 objects items (without kind)
//     zMin/zMax: u above the entity origin, scale applied (a structure part adds its bone height); null when unknown.
//     links: a mapdoc from mapkit carries them (entities[].link, entities[].seats) and links is left out; an old doc
//     needs links = links.js linksOf(src, key, {mode}) (linksFor gives it). Parts go on their {Link} seats, {Unlinked}
//     seats stay empty; notes (ENTCAT_PART_UNPLACED, ENTCAT_BAD_POSITION) on the array's non-enumerable `notes`
//   forDoc(src, doc, {loader?, progress?, links?}) -> catalog of the defs a mapdoc names plus the part defs of structure
//     roots and the swapped seat defs (of the doc's seats and of links)
//   linksFor(src, key, doc, {mode?}) -> null when the doc carries its links, else links.js linksOf (reads the map file)
//   docHasLinks(doc) -> true when some entities[] row has link or seats
//   loaderFor(src) -> scenecache L on src.vfs (one per src); entries are remembered per L (a second catalog is warm)
//   readsOf(L) -> every file read through L, the reads before a release included; release(L) drops L's scenes
//   solids(src, def, loader?) -> [{name, able, zMin, zMax, pts:[[x,y,z]..], box:{center, half, yaw}|null}] entity space u
//   placeSolids(doc, catalog, loader, grids?, {links}?) -> [{uid, def, category, solids:[{name, able, zMin, zMax, hull,
//     box}]}] world u (rules.md 2.0 of waves C and D; notes on the array's non-enumerable `notes`)
//   docForMode(doc, mode?) -> the doc with the map file's records plus that mode's .mi records (what `entcat map --mode` places)
// entry = { def, path (vfs key of the winning .def), mdl, category, categoryRule, footprint, height, box, volumes, cover,
//   sight, obstacleId, crushBy, vaultable, enterable, structure, heights, traverse, depression, notes }
//   traverse = {bone, min, max, full} | null, depression = {bone, min, max} | null (mdl Limits, vehicles and guns) [I];
//   vaultable = obstacles.reg flag_vaultable of obstacleId (GoH) | null when the id is not in the table
//   footprint (entity space, u) = null | {kind:'obb'|'circle'|'poly'|'box-proj'|'decal', source:'authored'|'fit'|'volumes'|
//     'decal', rotate, zones:[zone]} ; zone = {kind:'obb', center, half, axis} | {kind:'circle', center, radius} |
//     {kind:'poly', pts} | (fit) the same plus hull + mean, refitted in world space when placed (the engine fits world points)
//   Footprint order (design 4): authored {Obstacle} zones -> engine fit (OBB of 9 steps or circle, the smaller, around the
//   mesh points of `able obstacle` volumes whose lowest point <= 24 u and highest >= 8 u, unless tag
//   obstacle_ignore_height; CompoundObstacles = one fit per volume) -> projected volume box. Decal-only defs -> 'decal'.
//   Authored obstacle coordinates are entity space: they equal the volumes' world points (fence_stone3: Obstacle Center
//   y +8.079, Volume Position y -8.079 under a bone with Orientation y -1) [V test].
// Author: Imperator_Aug (ARSENAL, ia-40ff1637)
'use strict';
const D = require('./defread'), G = require('./geom'), C = require('./category'), K = require('./crush');

const VERSION = 2;   // 2: rules stamp-patch, line-wire, sfx; a sound emitter's missing model is a note, not a failure
const CATEGORIES = C.CATEGORIES;
const UPM = 20;
const STAMP_U_PER_PX = 0.5859375;          // r_stampResolutionScale
const OBST_LOW = UPM * 1.2, OBST_HIGH = UPM * 0.4;   // IsObstacleShape
const BAND_PROBES = [0.3, 0.4, 0.7, 0.85, 1.26, 1.35, 1.64];
const BANDS = ['none', 'lie', 'low', 'kneel', 'squat', 'stand'];
const ABLE_OUT = ['bullet', 'visible', 'obstacle', 'contact', 'contact_ground', 'nolook', 'window', 'hole', 'holed', 'touch'];

const lc = s => String(s == null ? '' : s).toLowerCase();
const fail = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const r4 = G.r4;

// ---------------------------------------------------------------- loader and per-loader tables
const LOADERS = new WeakMap(), CTX = new WeakMap();
function loaderFor(src) {
  if (LOADERS.has(src)) return LOADERS.get(src);
  const L = require('../../lib/model/scenecache').open({ target: src.target, game: src.game, mods: src.mods, modDirs: src.modDirs, vfs: src.vfs });
  LOADERS.set(src, L);
  return L;
}
function ctxOf(L) {
  let c = CTX.get(L);
  if (!c) {
    c = { io: { read: k => L.read(k), has: k => L.vfs().files.has(k) }, crush: undefined, mtl: null, defNames: null, saved: new Map() };
    CTX.set(L, c);
  }
  if (c.crush === undefined) c.crush = K.table(c.io);
  return c;
}
function defNames(L, pr) {
  const c = ctxOf(L);
  if (c.defNames) return c.defNames;
  const s = new Set();
  let i = 0;
  for (const k of L.vfs().files.keys()) {
    if (pr && (++i & 4095) === 0) pr.check();
    if (k.startsWith('resource/entity/') && k.endsWith('.def')) s.add(k.slice(k.lastIndexOf('/') + 1, -4));
  }
  c.defNames = [...s].sort();
  return c.defNames;
}
// every file read through L, including the reads of the rounds before a release (L.invalidate forgets its own list)
function readsOf(L) {
  const m = new Map(ctxOf(L).saved);
  for (const r of L.reads()) m.set((r.kind === 'pak' ? 'p|' : 'l|') + String(r.file).toLowerCase(), r);
  return [...m.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
// drop the loader's scenes (a whole GoH stack does not fit in memory otherwise); keeps the entries and the reads
function release(L) {
  const c = ctxOf(L);
  c.saved = new Map(readsOf(L).map(r => [(r.kind === 'pak' ? 'p|' : 'l|') + String(r.file).toLowerCase(), r]));
  L.invalidate();
  c.releases = (c.releases || 0) + 1;
}

// ---------------------------------------------------------------- decal size (design 7 L2a) [I]
function mtlKey(L, defKey, sprite) {
  const c = ctxOf(L);
  const near = defKey.slice(0, defKey.lastIndexOf('/') + 1) + lc(sprite).replace(/\\/g, '/');
  if (c.io.has(near)) return near;
  if (!c.mtl) {
    c.mtl = new Map();
    for (const k of [...L.vfs().files.keys()].sort()) {
      if (!k.endsWith('.mtl') || !k.startsWith('resource/')) continue;
      const b = k.slice(k.lastIndexOf('/') + 1);
      if (!c.mtl.has(b)) c.mtl.set(b, k);
    }
  }
  const base = lc(sprite).replace(/\\/g, '/');
  return c.mtl.get(base.slice(base.lastIndexOf('/') + 1)) || null;
}
function spritePx(L, mk) {
  const c = ctxOf(L);
  const buf = c.io.read(mk);
  if (!buf) return null;
  let root;
  try { root = D.parse(c.io, mk, buf).root; } catch (e) { return null; }
  const mat = D.kids(root)[0];
  if (!mat) return null;
  const dif = D.kids(mat).find(b => lc(D.nameOf(b)) === 'diffuse');
  if (!dif) return null;
  const ax = D.kids(dif).find(b => lc(D.nameOf(b)) === 'axis');
  if (ax) { const n = D.nums(ax); if (n.length >= 2 && n[0] > 0 && n[1] > 0) return [n[0], n[1]]; }
  const tex = D.str0(dif);
  if (!tex) return null;
  // the picture the game loads for that name (picture.js winner: .tex > .ebm > the last image extension); a .tex/.ebm
  // descriptor is not sized here, so the image winner is read instead [I]
  const P = require('../../lib/model/picture');
  const stem = (mk.slice(0, mk.lastIndexOf('/') + 1) + lc(tex).replace(/\\/g, '/')).replace(/\.[a-z0-9]{2,4}$/, '');
  const imgs = ['.dds', '.tga', '.bmp', '.jpg', '.png'].map(e => stem + e).filter(k => c.io.has(k));
  const tk = imgs.length ? P.winner(imgs[0], imgs) : null;
  if (!tk) return null;
  const t = c.io.read(tk);
  if (!t) return null;
  const type = P.typeOf(tk);
  const f = type === 'dds' ? require('../../lib/model/dds').parse(t) : P.facts(type, t);
  return f && f.width > 0 && f.height > 0 ? [f.width, f.height] : null;
}

// ---------------------------------------------------------------- footprint pieces
function zoneOf(o) {
  const s = o.shape;
  if (!s) return { bad: 'no shape' };
  if (s.kind === 'obb2') {
    const c = s.center && s.center.length >= 2 ? s.center : [0, 0];
    const h = s.extent && s.extent.length >= 2 ? s.extent : [5, 5];
    let a = s.axis && s.axis.length >= 2 ? s.axis : [1, 0];
    const n = Math.hypot(a[0], a[1]);
    if (!(n > 0) || !(h[0] > 0) || !(h[1] > 0)) return { bad: 'Obb2 with a zero axis or extent' };
    a = [a[0] / n, a[1] / n];
    return { kind: 'obb', center: c.map(r4), half: h.map(r4), axis: a.map(r4) };
  }
  if (s.kind === 'circle2') {
    const c = s.center && s.center.length >= 2 ? s.center : [0, 0];
    if (!(s.radius > 0)) return { bad: 'Circle2 without a radius' };
    return { kind: 'circle', center: c.map(r4), radius: r4(s.radius) };
  }
  if (s.kind === 'polygon2') {
    const v = s.vertices.filter(p => p.length >= 2 && p.every(Number.isFinite));
    if (v.length < 3) return { bad: 'Polygon2 with ' + v.length + ' vertices' };
    return { kind: 'poly', pts: G.rpts(v) };
  }
  if (s.kind === 'box2') {
    const a = s.origin || [0, 0], b = s.destination || [0, 0];
    const h = [Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2];
    if (!(h[0] > 0) || !(h[1] > 0)) return { bad: 'Box2 with no area' };
    return { kind: 'obb', center: [r4((a[0] + b[0]) / 2), r4((a[1] + b[1]) / 2)], half: h.map(r4), axis: [1, 0] };
  }
  if (s.kind === 'capsule2') {   // the segment origin..destination grown by the radius, as a box [I]
    const a = s.origin || [0, 0], b = s.destination || [0, 0], r = Number(s.radius) || 0;
    const dx = b[0] - a[0], dy = b[1] - a[1], L0 = Math.hypot(dx, dy);
    if (!(r > 0)) return { bad: 'Capsule2 without a radius' };
    const ax = L0 > 0 ? [dx / L0, dy / L0] : [1, 0];
    return { kind: 'obb', center: [r4((a[0] + b[0]) / 2), r4((a[1] + b[1]) / 2)], half: [r4(L0 / 2 + r), r4(r)], axis: ax.map(r4) };
  }
  return { bad: 'shape ' + s.kind + ' is not read' };
}
function zonePoly(z) {
  if (z.kind === 'obb') return G.obbCorners(z.center, z.half, z.axis);
  if (z.kind === 'circle') return G.circlePoly(z.center, z.radius);
  return z.pts.map(p => p.slice());
}
function fitZone(pts3) {
  const p2 = pts3.map(p => [p[0], p[1]]);
  const f = G.fit(p2);
  if (!f) return null;
  let mx = 0, my = 0;
  for (const [x, y] of p2) { mx += x; my += y; }
  const mean = [r4(mx / p2.length), r4(my / p2.length)];
  const hull = G.rpts(G.hull(p2));
  return f.kind === 'obb'
    ? { kind: 'obb', center: f.center.map(r4), half: f.half.map(r4), axis: f.axis.map(r4), hull, mean }
    : { kind: 'circle', center: f.center.map(r4), radius: r4(f.radius), hull, mean };
}

// ---------------------------------------------------------------- entry
function resolveDef(L, def) {
  const s = lc(def).replace(/\\/g, '/');
  if (s.includes('/') || s.endsWith('.def')) {
    let k = s.endsWith('.def') ? s : s + '.def';
    if (!k.startsWith('resource/')) k = (k.startsWith('entity/') ? 'resource/' : 'resource/entity/') + k;
    if (!ctxOf(L).io.has(k)) return null;
    return { name: k.slice(k.lastIndexOf('/') + 1, -4), key: k };
  }
  const e = L.entity(s);
  return e ? { name: e.name, key: e.key } : null;
}

function entry(src, def, loader) { return build(src, def, loader).en; }

// one entry plus the measured volumes it was built from (solids reads them; entry() drops the points)
function build(src, def, loader) {
  const L = loader || loaderFor(src);
  const c = ctxOf(L);
  const r = resolveDef(L, def);
  if (!r) throw fail('ENTCAT_DEF_MISSING', 'no entity def named ' + def + ' in the game or the stack');
  const desc = D.readDef(c.io, r.key);
  const notes = desc.notes.slice();
  // geometry from the model (scenecache), ables from the merged def
  let scene = null, model = null;
  if (desc.mdl) {
    let res;
    try { res = L.load(desc.mdl); } catch (e) { throw fail('ENTCAT_MODEL_LOAD', desc.mdl + ': ' + e.message); }
    if (!res || res.error || !res.scene) throw fail('ENTCAT_MODEL_LOAD', desc.mdl + ': ' + (res && res.error || 'no scene'));
    scene = res.scene;
    model = res.model || null;
    if (scene.missing && scene.missing.length) notes.push({ code: 'ENTCAT_MODEL_FILES_MISSING', msg: scene.missing.slice(0, 5).join(', ') });
  }
  const sv = new Map();
  if (scene) for (const v of scene.volumes) { const n = lc(v.name); if (!sv.has(n)) sv.set(n, v); }
  const vols = [], all3 = [];
  for (const v of desc.volumes) {
    if (v.disabled) continue;
    const s = sv.get(v.name);
    const pts = s ? G.meshPoints(s) : [];
    if (!pts.length) notes.push({ code: 'ENTCAT_VOLUME_NOT_BUILT', msg: 'volume ' + v.name + (s ? ' has no shape the model builds' : v.shape ? ' has its shape in the def only' : ' is not in the model') + '; not measured' });
    let z0 = null, z1 = null;
    for (const p of pts) { if (z0 === null || p[2] < z0) z0 = p[2]; if (z1 === null || p[2] > z1) z1 = p[2]; }
    const able = {};
    for (const a of ABLE_OUT) able[a] = !!v.able[a];
    vols.push({ name: v.name, shape: s ? s.kind : v.shape, able, zMin: z0 === null ? null : r4(z0), zMax: z1 === null ? null : r4(z1), tags: v.tags.slice(), pts, sv: s || null });
    all3.push(...pts);
  }
  // box and height: volume points (GetVolumeBounds); a model with no volume takes its mesh bounds [I]
  let box = null;
  if (all3.length) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of all3) for (let i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i]; }
    box = { min: mn.map(r4), max: mx.map(r4), from: 'volumes' };
  } else if (scene && scene.meshBounds) {
    box = { min: scene.meshBounds.min.map(r4), max: scene.meshBounds.max.map(r4), from: 'meshes' };
  }
  const height = box ? box.max[2] : null;
  // footprint
  let footprint = null;
  const zones = [];
  for (const o of desc.obstacles) {
    const z = zoneOf(o);
    if (z.bad) { notes.push({ code: 'ENTCAT_OBSTACLE_DEGENERATE', msg: 'obstacle "' + o.name + '": ' + z.bad + '; skipped' }); continue; }
    zones.push(Object.assign(z, { rotate: o.rotate }));
  }
  // the engine tests IsObstacleShape per volume on world points, after the entity scale (,
  // 773-791): `scaled` keeps each obstacle volume's heights, hull and mean so footprintOf can decide again at the placed
  // scale (height above ground taken as entity-space z x scale: the entity stands on the ground [I])
  const ignore = desc.tags.includes('obstacle_ignore_height');
  const obVols = vols.filter(v => v.able.obstacle && v.pts.length);
  const okAt = (v, s) => ignore || (v.zMin * s <= OBST_LOW && v.zMax * s >= OBST_HIGH);
  const boxZone = box ? { kind: 'obb', center: [r4((box.min[0] + box.max[0]) / 2), r4((box.min[1] + box.max[1]) / 2)],
    half: [r4((box.max[0] - box.min[0]) / 2), r4((box.max[1] - box.min[1]) / 2)], axis: [1, 0] } : null;
  if (zones.length) {
    footprint = { kind: zones.length === 1 ? zones[0].kind : 'poly', source: 'authored', rotate: zones.every(z => z.rotate), zones };
  } else {
    const okVol = obVols.filter(v => okAt(v, 1));
    const clouds = desc.compound ? okVol.map(v => v.pts) : (okVol.length ? [[].concat(...okVol.map(v => v.pts))] : []);
    const fz = clouds.map(fitZone).filter(Boolean);
    if (fz.length) footprint = { kind: fz.length === 1 ? fz[0].kind : 'poly', source: 'fit', rotate: true, zones: fz };
  }
  if (!footprint && desc.decal && !desc.mdl) {
    const mk = desc.decal.sprite ? mtlKey(L, r.key, desc.decal.sprite) : null;
    const px = mk ? spritePx(L, mk) : null;
    if (px) {
      // design 7 L2a: px x r_stampResolutionScale, unless the sprite has a scale channel: then the channels scale the
      // sprite and the resolution scale is skipped [V]; sprite corner size = px [I]
      const dc = desc.decal, k = dc.scaleChannel ? 1 : STAMP_U_PER_PX;
      const sx = px[0] * k * dc.preScale[0] * dc.scale * dc.scaleXY[0], sy = px[1] * k * dc.preScale[1] * dc.scale * dc.scaleXY[1];
      footprint = { kind: 'decal', source: 'decal', rotate: dc.useDirection, zones: [{ kind: 'obb', center: [0, 0], half: [r4(Math.abs(sx) / 2), r4(Math.abs(sy) / 2)], axis: [1, 0] }],
        sprite: { mtl: mk, px, scale: dc.scale, scaleXY: dc.scaleXY.slice(), preScale: dc.preScale.slice(), scaleChannel: dc.scaleChannel, uPerPx: k } };
    } else notes.push({ code: 'ENTCAT_DECAL_SIZE', msg: 'decal sprite ' + desc.decal.sprite + ': no size (mtl or texture not found)' });
  }
  if (!footprint && boxZone) footprint = { kind: 'box-proj', source: box.from, rotate: true, zones: [boxZone] };
  if (footprint && footprint.source !== 'authored' && footprint.kind !== 'decal' && obVols.length && !ignore) {
    footprint.scaled = { compound: !!desc.compound, ok1: obVols.map(v => okAt(v, 1)), box: boxZone, source: box ? box.from : null,
      vols: obVols.map(v => {
        const p2 = v.pts.map(p => [p[0], p[1]]);
        let mx = 0, my = 0;
        for (const [x, y] of p2) { mx += x; my += y; }
        return { zMin: v.zMin, zMax: v.zMax, n: p2.length, mean: [r4(mx / p2.length), r4(my / p2.length)], hull: G.rpts(G.hull(p2)) };
      }) };
  }
  // category
  const size = box ? { w: box.max[0] - box.min[0], d: box.max[1] - box.min[1], h: box.max[2] } : null;
  const cat = C.categorize({ key: r.key, name: r.name, desc, size, has: c.io.has });
  if (cat.category === 'road_decal' && footprint && footprint.kind !== 'decal' && desc.decal) footprint.kind = 'decal';
  // cover: band from the contiguous run of bullet volumes (no window) from the ground
  const bullet = vols.filter(v => v.able.bullet && !v.able.window && v.zMin !== null);
  let top = null;
  if (bullet.length) {
    const iv = bullet.map(v => [v.zMin, v.zMax]).sort((a, b) => a[0] - b[0]);
    if (iv[0][0] <= BAND_PROBES[0] * UPM) {
      top = iv[0][1];
      for (const [a, b] of iv.slice(1)) { if (a <= top + 1e-6) top = Math.max(top, b); }
    }
  }
  const tm = top === null ? 0 : top / UPM;
  const band = tm < 0.3 ? 0 : tm < 0.4 ? 1 : tm < 0.85 ? 2 : tm < 1.35 ? 3 : tm < 1.64 ? 4 : 5;
  const conceal = vols.some(v => v.able.visible && !v.able.bullet && !v.able.obstacle && v.zMax !== null && v.zMax >= 0.7 * UPM);
  const cover = { hard: bullet.length > 0, band: BANDS[band], top: top === null ? null : r4(top), conceal };
  const sight = { enters: vols.some(v => v.able.visible), hard: vols.some(v => v.able.visible && (v.able.bullet || v.able.obstacle)) };
  const obstacleId = desc.obstacleIds[''] || null;
  const crushBy = K.crushBy(c.crush, obstacleId);
  // bones (scene world matrices: row vectors, t at 9..11)
  const bones = new Map();
  if (scene) for (const b of scene.bones) { const n = lc(b.name); if (!bones.has(n)) bones.set(n, b); }
  const boneAt = n => { const b = bones.get(lc(n)); return b && b.world ? b : null; };
  // enterable [I]: placer places + hole volumes
  let enterable = null;
  const holes = vols.filter(v => v.able.hole);
  if (desc.placer || desc.boarder || holes.length) {
    const ports = [];
    for (const p of (desc.placer ? desc.placer.places : [])) {
      if (p.attach !== 'snipe_cover') continue;
      const b = p.name ? boneAt(p.name) : null;
      ports.push({ bone: p.name, z: b ? r4(b.world[11]) : null, attach: p.attach });
    }
    for (const v of holes) ports.push({ bone: v.name, z: v.zMax, attach: 'hole' });
    enterable = { places: desc.placer ? desc.placer.places.length : 0, ports };
  }
  // structure parts on the root's bones (place id = bone name) [I]
  let structure = null;
  if (desc.structure && desc.structure.length) {
    structure = { parts: desc.structure.map(p => {
      const b = boneAt(p.place);
      if (!b) return { place: p.place, def: p.def, x: null, y: null, z: null, yaw: 0 };
      const w = b.world;
      return { place: p.place, def: p.def, x: r4(w[9]), y: r4(w[10]), z: r4(w[11]), yaw: r4(Math.atan2(w[1], w[0]) * 180 / Math.PI) };
    }) };
  }
  // vehicles and guns [I]
  let heights = null;
  if (cat.category === 'placed_unit' || cat.category === 'wreck') {
    const topOf = re => { let t = null; for (const v of vols) if (re.test(v.name) && v.zMax !== null) t = t === null ? v.zMax : Math.max(t, v.zMax); return t; };
    const boneZ = re => { if (!scene) return null; const b = scene.bones.find(x => re.test(lc(x.name)) && x.world); return b ? r4(b.world[11]) : null; };
    heights = { hullTop: topOf(/body|hull/), gunBone: boneZ(/^(gun|barrel|cannon)/), turretTop: topOf(/turret/), visor: boneZ(/visor/) };
  }
  // traverse and depression [I]: the mdl {Limits a b} (degrees) of the turret bone (named "turret", else the bone whose
  // Parameters say ID=turret; no Limits = turns all round) and of the gun bone (named "gun_rot", else ID=gun). The
  // limits are given as stored: which end is down is not traced (REPORT.json fixRows)
  let traverse = null, depression = null;
  if ((cat.category === 'placed_unit' || cat.category === 'wreck') && model && model.bones) {
    const idOf = b => { for (const [k, v] of Object.entries(b.paramMap || {})) if (lc(k) === 'id') return lc(v); return null; };
    const pick = (name, id) => model.bones.find(b => lc(b.name) === name) || model.bones.find(b => idOf(b) === id) || null;
    const lim = b => (b && Array.isArray(b.limits) && b.limits.length >= 2 && b.limits.slice(0, 2).every(Number.isFinite) ? b.limits.slice(0, 2) : null);
    const tb = pick('turret', 'turret'), gb = pick('gun_rot', 'gun');
    if (tb) { const l = lim(tb); traverse = l ? { bone: lc(tb.name), min: l[0], max: l[1], full: false } : { bone: lc(tb.name), min: -180, max: 180, full: true }; }
    if (gb) { const l = lim(gb); if (l) depression = { bone: lc(gb.name), min: l[0], max: l[1] }; }
  }
  // GoH obstacles.reg flag_vaultable of the obstacle id (soldiers path over it); null when the id is not in the table
  const orec = c.crush && obstacleId ? c.crush.ids[obstacleId] : null;
  const vaultable = orec ? orec.flags.includes('flag_vaultable') : null;
  const en = {
    def: r.name, path: r.key, mdl: desc.mdl, category: cat.category, categoryRule: cat.rule, footprint, height, box,
    volumes: vols.map(v => ({ name: v.name, shape: v.shape, able: v.able, zMin: v.zMin, zMax: v.zMax })),
    cover, sight, obstacleId, crushBy, vaultable, enterable, structure, heights, traverse, depression,
    props: desc.props.slice().sort(), notes,
  };
  return { en, vols };
}

// ---------------------------------------------------------------- solids (rules.md 2.0: sight, cover, obstacle masks)
// A box volume as a 2D box, when its own z axis stands upright (a tilted box has pts only): centre = the box origin,
// half = size / 2 along its x and y axes (axis scale applied), yaw = degrees of its x axis from +x
function boxOf(s) {
  const sh = s && s.shape;
  if (!sh || sh.kind !== 'box' || !sh.matrix) return null;
  const m = sh.matrix, size = (sh.size || [0, 0, 0]).map(Number);
  const lx = Math.hypot(m[0], m[1], m[2]), ly = Math.hypot(m[3], m[4], m[5]), lz = Math.hypot(m[6], m[7], m[8]);
  if (!(lx > 0 && ly > 0 && lz > 0) || Math.abs(m[8]) / lz < 0.999) return null;
  return { center: [r4(m[9]), r4(m[10])], half: [r4(Math.abs(size[0]) / 2 * lx), r4(Math.abs(size[1]) / 2 * ly)], yaw: r4(Math.atan2(m[1], m[0]) * 180 / Math.PI) };
}
// solids(src, def, loader?) -> [{name, able, zMin, zMax, pts:[[x,y,z]..], box|null}] entity space, u. The volumes of
// entry() (disabled ones left out) that the model builds; a volume with no points (entry note ENTCAT_VOLUME_NOT_BUILT) is
// left out. Same rule on every game: the GoH 17th able (blockcamera) is not one of the entry able keys. Remembered per
// loader. Throws as entry() does.
function solids(src, def, loader) {
  const L = loader || loaderFor(src);
  const c = ctxOf(L);
  const memo = c.solids || (c.solids = new Map());
  const k = lc(def).replace(/\\/g, '/');
  if (memo.has(k)) return memo.get(k);
  const { en, vols } = build(src, def, L);
  const out = vols.filter(v => v.pts.length).map(v => ({ name: v.name, able: Object.assign({}, v.able), zMin: v.zMin, zMax: v.zMax,
    pts: G.rpts(v.pts), box: boxOf(v.sv) }));
  memo.set(k, out);
  memo.set(en.def, out);
  return out;
}

// ---------------------------------------------------------------- placing
const fin = v => typeof v === 'number' && Number.isFinite(v);
const numOr = (v, d) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };

// the footprint of a fit (or volume-box) entry at scale s: IsObstacleShape decided again on the scaled heights
function atScale(fp, s) {
  const S = fp && fp.scaled;
  if (!S || s === 1 || fp.kind === 'decal') return fp;
  const ok = S.vols.map(v => v.zMin * s <= OBST_LOW && v.zMax * s >= OBST_HIGH);
  if (ok.every((x, i) => x === S.ok1[i])) return fp;
  const sel = S.vols.filter((v, i) => ok[i]);
  if (!sel.length) return S.box ? { kind: 'box-proj', source: S.source, rotate: true, zones: [S.box] } : null;
  const groups = S.compound ? sel.map(v => [v]) : [sel];
  const zones = groups.map(g => {
    let n = 0, mx = 0, my = 0;
    for (const v of g) { n += v.n; mx += v.mean[0] * v.n; my += v.mean[1] * v.n; }
    return { kind: 'fit', hull: G.rpts(G.hull([].concat(...g.map(v => v.hull)))), mean: [r4(mx / n), r4(my / n)] };
  });
  return { kind: zones.length === 1 ? 'fit' : 'poly', source: 'fit', rotate: true, zones };
}

function footprintOf(e, placed) {
  const p = placed || {};
  const sc = numOr(p.scale, 1);
  const at = { x: numOr(p.x, 0), y: numOr(p.y, 0), yaw: numOr(p.yaw, 0), scale: sc };
  const fp = atScale(e && e.footprint, sc);
  if (!fp) return { kind: 'none', pts: [[r4(at.x), r4(at.y)]] };
  let polys;
  if (fp.source === 'fit') {
    polys = fp.zones.map(z => {
      const hullW = G.transform(z.hull, at, true), mean = G.transform([z.mean], at, true)[0];
      const f = G.fitFromHull(hullW, mean);
      return { kind: f.kind, pts: f.kind === 'obb' ? G.obbCorners(f.center, f.half, f.axis) : G.circlePoly(f.center, f.radius) };
    });
  } else {
    polys = fp.zones.map(z => ({ kind: z.kind, pts: G.transform(zonePoly(z), at, z.rotate === undefined ? fp.rotate : z.rotate) }));
  }
  if (fp.kind === 'decal') return { kind: 'decal', pts: G.rpts(polys[0].pts) };
  if (fp.kind === 'box-proj') return { kind: 'box-proj', pts: G.rpts(polys[0].pts) };
  if (polys.length === 1) return { kind: polys[0].kind, pts: G.rpts(polys[0].pts) };
  return { kind: 'poly', pts: G.rpts(G.hull([].concat(...polys.map(q => q.pts)))) };
}

// a structure part on the root's bone (place id = bone name), else at the root [I]
function partAt(root, p) {
  const sc = numOr(root.scale, 1), yaw = numOr(root.yaw, 0);
  if (!p || p.x === null) return { at: { x: root.x, y: root.y, yaw, scale: sc }, dz: 0 };
  const a = yaw * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
  return { at: { x: root.x + (c * p.x - n * p.y) * sc, y: root.y + (n * p.x + c * p.y) * sc, yaw: yaw + p.yaw, scale: sc }, dz: p.z * sc };
}

// links of a map. A mapdoc from mapkit carries them on its rows (mapdoc/1 additive, lib/mapkit/links.js): entities[].link
// {root, place} on a part, entities[].seats {place: {unlinked, entity: uid | null, def}} on a root. An old doc has neither:
// then links.js linksOf(src, key) {parts:{uid: {root, place}}, seats:{rootUid: {place: {unlinked, entity: def}}}} is passed
// in. Both are read when both are given (the links arg first). Seat states inside: {unlinked, entity: swapped def | null}.
function docHasLinks(doc) {
  for (const e of (doc && doc.entities) || []) if (e && (e.link !== undefined || e.seats !== undefined)) return true;
  return false;
}
// a mapdoc's seat states as links.js gives them: {rootUid: {place: {unlinked, entity: def}}}; rows in file order, a later
// row's state of the same root and place replaces the earlier one (the .mi after the map file, as links.js)
function docSeats(doc) {
  const out = {};
  for (const e of (doc && doc.entities) || []) {
    if (!e || !e.seats || typeof e.seats !== 'object' || !fin(Number(e.uid))) continue;
    const s = out[e.uid] || (out[e.uid] = {});
    for (const [pl, st] of Object.entries(e.seats)) s[lc(pl)] = { unlinked: !!(st && st.unlinked), entity: st && st.def ? lc(st.def) : null };
  }
  return out;
}
function linkTables(doc, links) {
  const parts = new Map(), seats = new Map();
  const L = links || {};
  for (const [u, l] of Object.entries(L.parts || {})) if (l && fin(Number(u))) parts.set(Number(u), { root: Number(l.root), place: lc(l.place) });
  for (const e of (doc && doc.entities) || []) if (e && e.link && e.link.root != null && !parts.has(e.uid)) parts.set(e.uid, { root: Number(e.link.root), place: lc(e.link.place) });
  for (const src of [docSeats(doc), L.seats || {}]) {
    for (const [u, s] of Object.entries(src)) {
      const m = seats.get(Number(u)) || new Map();
      for (const [pl, st] of Object.entries(s || {})) m.set(lc(pl), st || {});
      seats.set(Number(u), m);
    }
  }
  return { parts, seats };
}
// the links arg place() and forDoc() need for a doc: null when the doc carries its own, else links.js read of the map file
function linksFor(src, key, doc, o) {
  if (docHasLinks(doc)) return null;
  return require('./links').linksOf(src, key, { mode: (o && o.mode) || undefined });
}

// objects of a map: every placed record, plus the parts a structure root spawns (its `structure` places). A record with
// no Position is a part only through its {Link} (links arg or entities[].link): it sits on that seat and keeps its own
// uid and def. A seat with no linked record spawns its default part (the seat's {Entity} when swapped) under the root's
// uid [I], unless the seat is {Unlinked}. A record linked to a seat that is not a
// structure place (a crew seat, a gun on a vehicle) sits at its host's origin [I]. A record with no Position and no
// placed host is left out with note ENTCAT_PART_UNPLACED; a Position that is not a finite number: ENTCAT_BAD_POSITION.
// The notes are on the returned array's non-enumerable `notes` [{code, uid, def, msg}].
function place(doc, cat, links) {
  const out = [];
  const entries = (cat && cat.entries) || {};
  const notes = walk(doc, links, (uid, def, at, dz) => {
    const en = entries[lc(def)] || null;
    const sc = numOr(at.scale, 1);
    let z0 = null, z1 = null;
    if (en && en.footprint && en.footprint.kind === 'decal') { z0 = 0; z1 = 0; }
    else if (en && en.box) { z0 = r4(en.box.min[2] * sc + dz); z1 = r4(en.box.max[2] * sc + dz); }
    out.push({ uid, def: lc(def), category: en ? en.category : 'other', fp: footprintOf(en, at), zMin: z0, zMax: z1 });
  }, entries);
  Object.defineProperty(out, 'notes', { value: notes, enumerable: false });
  return out;
}

// the placing walk of place() and placeSolids(): emit(uid, def, at{x, y, yaw, scale}, dz, root) for every object, in
// place() order; root = the placed record the object stands on (itself, or the structure root). Returns the notes.
function walk(doc, links, emit, entries) {
  const notes = [];
  const ents = (doc && doc.entities) || [];
  const T = linkTables(doc, links);
  const absent = v => v === null || v === undefined;
  const placed = new Map(), byRoot = new Map();
  for (const e of ents) {
    if (absent(e.x) && absent(e.y)) continue;
    if (!fin(e.x) || !fin(e.y)) { notes.push({ code: 'ENTCAT_BAD_POSITION', uid: e.uid, def: lc(e.def), msg: 'position ' + e.x + ', ' + e.y + ' is not a number; left out' }); continue; }
    if (!placed.has(e.uid)) placed.set(e.uid, e);
  }
  for (const e of ents) {
    if (!(absent(e.x) && absent(e.y))) continue;
    const l = T.parts.get(e.uid);
    if (!l || !placed.has(l.root)) {
      notes.push({ code: 'ENTCAT_PART_UNPLACED', uid: e.uid, def: lc(e.def), msg: l ? 'linked to ' + l.root + ', which is not placed' : 'no position and no link to a root' });
      continue;
    }
    const list = byRoot.get(l.root) || [];
    list.push({ e, place: l.place });
    byRoot.set(l.root, list);
  }
  for (const e of ents) {
    if (placed.get(e.uid) !== e) continue;
    emit(e.uid, e.def, e, 0, e);
    const recs = byRoot.get(e.uid) || [];
    const seats = T.seats.get(e.uid) || new Map();
    const en = entries[lc(e.def)];
    const parts = en && en.structure ? en.structure.parts : [];
    const used = new Set();
    for (const p of parts) {
      const r = recs.find(x => !used.has(x) && x.place === p.place);
      const st = seats.get(p.place);
      const pa = partAt(e, p);
      if (r) { used.add(r); emit(r.e.uid, r.e.def, pa.at, pa.dz, e); continue; }
      if (st && st.unlinked) continue;
      emit(e.uid, st && st.entity ? st.entity : p.def, pa.at, pa.dz, e);
    }
    for (const r of recs) if (!used.has(r)) { const pa = partAt(e, null); emit(r.e.uid, r.e.def, pa.at, pa.dz, e); }
  }
  return notes;
}

// the doc of one mode: the map file's records plus that mode's .mi records (mode null: the map file's only). The entcat
// map command and every part that places objects for a mode use it, so they see the same objects.
function docForMode(doc, mode) {
  const ents = ((doc && doc.entities) || []).filter(e => e && (e.src === 'map' || e.src === undefined || (mode && e.src === 'mi' && e.mode === mode)));
  return Object.assign({}, doc, { entities: ents });
}

// placeSolids(doc, catalog, loader, grids?, o?) -> [{uid, def, category, solids:[{name, able, zMin, zMax, hull, box}]}]
// World u, in place() order (same walk: scale, yaw, position, structure part bones). hull = convex hull of the volume's
// world points (counter-clockwise); box = the volume box in world (centre, half x scale, yaw + entity yaw) or null.
// zMin/zMax world z = base + dz + z x scale; base = the root record's z, else ground height (grids.height, bilinear) at
// the root's x, y. Ground nodata or outside the grid: the object is left out with note ENTCAT_SOLID_NO_GROUND. No grids
// given: base 0 for records without z (heights above the entity origin), one note ENTCAT_SOLID_NO_GROUND with uid null.
// A def that is not in catalog.entries is left out with its catalog failed code (else ENTCAT_DEF_MISSING); a def whose
// volumes fail to load: its error code. A def with no volume points (decals): a row with solids []. Notes on the array's
// non-enumerable `notes` [{code, uid, def, msg}]. o.links as place(). Same on every game (no game branch).
function placeSolids(doc, cat, loader, grids, o) {
  if (!loader || typeof loader.load !== 'function') throw fail('ENTCAT_FAULT', 'placeSolids needs a loader (entcat.loaderFor(src))');
  o = o || {};
  const out = [], notes = [];
  const entries = (cat && cat.entries) || {};
  const failed = new Map(((cat && cat.failed) || []).map(f => [f.def, f.code]));
  const hg = grids && grids.height ? grids.height : null;
  const heightAt = hg ? require('../lib/mapkit').heightAt : null;
  let noGrids = false;
  const baseOf = new Map();
  const wnotes = walk(doc, o.links, (uid, def, at, dz, root) => {
    const d = lc(def), en = entries[d];
    if (!en) { notes.push({ code: failed.get(d) || 'ENTCAT_DEF_MISSING', uid, def: d, msg: 'def not in the catalogue; no solids' }); return; }
    let base = baseOf.get(root);
    if (base === undefined) {
      if (fin(root.z)) base = root.z;
      else if (!hg) { base = 0; noGrids = true; }
      else { const h = heightAt(hg, root.x, root.y); base = h === null || !Number.isFinite(h) ? null : h; }
      baseOf.set(root, base);
    }
    if (base === null) { notes.push({ code: 'ENTCAT_SOLID_NO_GROUND', uid, def: d, msg: 'no ground height at ' + root.x + ', ' + root.y + '; left out' }); return; }
    let list;
    try { list = solids(null, d, loader); } catch (e) {
      notes.push({ code: e && /^ENTCAT_/.test(e.code || '') ? e.code : 'ENTCAT_FAULT', uid, def: d, msg: String(e && e.message || e) });
      return;
    }
    const sc = numOr(at.scale, 1), yaw = numOr(at.yaw, 0);
    const pl = { x: numOr(at.x, 0), y: numOr(at.y, 0), yaw, scale: sc };
    const z0 = base + dz;
    out.push({ uid, def: d, category: en.category, solids: list.map(s => {
      let box = null;
      if (s.box) {
        const c = G.transform([s.box.center], pl, true)[0];
        box = { center: c.map(r4), half: s.box.half.map(h => r4(h * Math.abs(sc))), yaw: r4(s.box.yaw + yaw) };
      }
      return { name: s.name, able: Object.assign({}, s.able), zMin: r4(z0 + s.zMin * sc), zMax: r4(z0 + s.zMax * sc),
        hull: G.rpts(G.hull(G.transform(s.pts, pl, true))), box };
    }) });
  }, entries);
  if (noGrids) notes.push({ code: 'ENTCAT_SOLID_NO_GROUND', uid: null, def: null, msg: 'no height grid given: z of records without z is above the entity origin' });
  Object.defineProperty(out, 'notes', { value: wnotes.concat(notes), enumerable: false });
  return out;
}

// the catalog of a map: every def its records name, plus the part defs of structure roots (to any depth) and the
// swapped seat defs of the links (o.links = links.js linksOf)
function forDoc(src, doc, o) {
  o = o || {};
  const L = o.loader || loaderFor(src);
  const want = new Set(((doc && doc.entities) || []).map(e => lc(e.def)));
  for (const seats of [docSeats(doc), (o.links && o.links.seats) || {}]) {
    for (const s of Object.values(seats)) for (const st of Object.values(s || {})) if (st && st.entity) want.add(lc(st.entity));
  }
  let cat = catalog(src, { defs: [...want], loader: L, progress: o.progress });
  for (let round = 0; round < 4; round++) {
    const more = new Set();
    for (const en of Object.values(cat.entries)) for (const p of (en.structure ? en.structure.parts : [])) if (!want.has(p.def)) more.add(p.def);
    if (!more.size) break;
    for (const d of more) want.add(d);
    cat = catalog(src, { defs: [...want], loader: L, progress: o.progress, stage: 'parts' });   // entries memoized by the loader
  }
  return cat;
}

// ---------------------------------------------------------------- catalog
// o.release = n: after every n defs built, the loader's scenes are dropped (release); the entries stay remembered
function catalog(src, o) {
  o = o || {};
  const L = o.loader || loaderFor(src);
  const pr = o.progress || null;
  if (pr) pr.check();
  const names = o.defs ? [...new Set(o.defs.map(d => lc(d)))].sort() : defNames(L, pr);
  const entries = {}, failed = [];
  if (pr) pr.stage(o.stage || 'defs', names.length);
  const memo = ctxOf(L).memo || (ctxOf(L).memo = new Map());
  const every = o.release > 0 ? Math.floor(o.release) : 0;
  let built = 0;
  for (const d of names) {
    let m = memo.get(d);
    if (!m) {
      try { m = { en: entry(src, d, L) }; }
      catch (e) { m = { fail: { def: d, code: e && e.code && /^ENTCAT_/.test(e.code) ? e.code : 'ENTCAT_FAULT', msg: String(e && e.message || e) } }; }
      memo.set(d, m);
      if (every && ++built % every === 0) release(L);
    }
    if (m.en) { if (!entries[m.en.def]) entries[m.en.def] = m.en; }
    else failed.push(m.fail);
    if (pr) pr.step();
  }
  return { v: 1, target: src.target, stackHash: src.stackHash, entries, failed };
}

module.exports = { VERSION, CATEGORIES, catalog, entry, footprintOf, place, forDoc, linksFor, docHasLinks, loaderFor, defNames, readsOf, release, BANDS,
  solids, placeSolids, docForMode };
