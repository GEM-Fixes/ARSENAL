// mapkit mapdoc: the mapdoc/1 document of one map (tools/mapviz/README.md section 3.2; design section 2).
//   loadNet(src, key) -> {net (mapnet.parse), rec}        throws MV_NOT_FOUND (no map.net) or MV_NOT_FOUND detail.broken
//   readMap(src, key) -> {root, map block, clips, ocean, entities records}
//   readMode(src, key, id) -> parsed .mi {id, root, mission, water, env, records}
//   waterOf(src, key, mode) -> W of the mode (README 3.2 field rules)
//   entityRecord(block) -> {def, uid, x, y, z, zl, yr, zw, scale, color, decalOrder, opacity, texmod, unlinked, player, ext:[...]}
//   doc(src, key, o) -> mapdoc/1. entities[] rows carry, only where the map has them (links.js, additive in mapdoc/1):
//     link {root, place} on a part a {Link} puts on a root's seat; seats {place: {unlinked, entity: uid | null, def}} on a
//     root with {Placer {State ..}} records (def = the seat's {Entity} swap, lower case, or null)
//   typeUnknownNote(target, t), parseNote(name, errors) -> note | null, isSingle(key)   (shared with grids.js)
// Author: Imperator_Aug (ARSENAL, ia-b14f2eea)
'use strict';
const S = require('./sdl'), tables = require('./tables');
const mv = require('../../mapviz');
const { MAP_ROOT, PICTURE_STEMS, modOf } = require('./source');

const KNOWN_MODES = {
  as2: ['combat', 'battle_zones', 'captureflag', 'frontline', 'battle_zones_8x8'],
  goh: ['battle_zones', 'ammunition', 'evacuation', 'campaign_capture_the_flag', 'frontlines'],
};
const OUTSIDE_NOTES_MAX = 50;
const lc = s => String(s == null ? '' : s).toLowerCase();
const isInt = v => typeof v === 'number' && Number.isInteger(v);
const intOr = v => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);

function mapKeyOk(key) { return typeof key === 'string' && key.length > 0 && !/\\/.test(key); }

function loadNet(src, key) {
  if (!mapKeyOk(key)) throw new mv.MvError('MV_USAGE', 'map key must be the folder under resource/map/ with forward slashes, got ' + JSON.stringify(key));
  const k = MAP_ROOT + key + '/map.net';
  if (!src.has(k)) throw new mv.MvError('MV_NOT_FOUND', 'no map ' + key + ' (no map.net)', { map: key });
  const mapnet = require('../../../lib/mapnet');
  const net = mapnet.parse(src.read(k));
  const bad = net.problems.filter(p => p.code !== 'NET_VERSION' || net.version > 2);
  if (bad.length || !(net.cell > 0) || net.width <= 0 || net.height <= 0) {
    const codes = bad.map(p => p.code);
    if (!(net.cell > 0)) codes.push('NET_CELL');
    throw new mv.MvError('MV_NOT_FOUND', 'map.net of ' + key + ' cannot be read: ' + (bad.map(p => p.code + ' ' + p.msg).join('; ') || 'cell size 0'),
      { map: key, broken: true, problems: codes });
  }
  return { net, rec: src.rec(k) };
}

// ---------------------------------------------------------------- records
function extOf(b) {   // {Extender "name" {k v}...} -> {name, fields:{k: [words]}, blocks:{k: block}, block}
  const w = S.words(b), e = { name: lc(w[1]), fields: {}, blocks: {}, block: b };
  for (const c of S.blocks(b)) {
    const cw = S.words(c), k = lc(cw[0]);
    if (!k) continue;
    if (!(k in e.fields)) e.fields[k] = cw.slice(1);
    if (!(k in e.blocks)) e.blocks[k] = c;
  }
  return e;
}
function entityRecord(b) {
  const w = S.words(b);
  const r = { def: lc(w[1]).replace(/\.def$/, '').split('/').pop(), uid: isInt(w[2]) ? w[2] : null, x: null, y: null, z: null,
    zl: 0, yr: 0, zw: 0, scale: null, color: null, decalOrder: null, opacity: null, texmod: null, unlinked: false, player: null, ext: [], block: b };
  for (const c of S.blocks(b)) {
    const cw = S.words(c), k = lc(cw[0]);
    if (k === 'position') { r.x = S.num(cw[1]); r.y = S.num(cw[2]); r.z = S.num(cw[3]); }
    else if (k === 'xform') {
      for (let i = 1; i < cw.length; i += 2) {
        const kk = lc(cw[i]), vv = S.num(cw[i + 1]);
        if (vv === null) continue;
        if (kk === 'zl') r.zl = vv; else if (kk === 'zw') r.zw = vv; else if (kk === 'y') r.yr = vv; else if (kk === 'scale') r.scale = vv;
      }
    } else if (k === 'scale') r.scale = S.num(cw[1]);
    else if (k === 'color') r.color = S.num(cw[1]);
    else if (k === 'decalorder') r.decalOrder = intOr(cw[1]);
    else if (k === 'opacity') r.opacity = S.num(cw[1]);
    else if (k === 'texmod') r.texmod = cw[1] === undefined ? null : String(cw[1]);
    else if (k === 'unlinked') r.unlinked = true;
    else if (k === 'player') r.player = intOr(cw[1]);
    else if (k === 'extender') r.ext.push(extOf(c));
  }
  return r;
}
const extNamed = (r, name) => r.ext.find(e => e.name === name) || null;
const f1 = (e, k) => (e && e.fields[k] ? e.fields[k][0] : undefined);

// ---------------------------------------------------------------- map and mode files
function clipsOf(block) {
  const out = [];
  if (!block) return out;
  for (const c of S.kids(block, 'clips')) {
    for (const b of S.blocks(c)) {
      const w = S.words(b);
      const box = name => {
        const x = S.kid(b, name);
        if (!x) return null;
        const v = S.words(x).slice(1, 5).map(S.num);
        if (v.length < 4 || v.some(n => n === null)) return null;
        return [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
      };
      const waters = S.kids(b, 'water').map(x => S.num(S.words(x)[1])).filter(n => n !== null);
      out.push({ name: w[0] === undefined ? null : String(w[0]), world: box('world'), camera: box('camera'), pather: box('pather'),
        water: waters.length ? waters[waters.length - 1] : null });
    }
  }
  return out;
}

function readMap(src, key) {
  const k = MAP_ROOT + key + '/map';
  if (!src.has(k)) return { root: null, map: null, clips: [], ocean: null, records: [], errors: [], missing: true };
  const { root, errors } = S.parse(src, k);
  const m = S.kid(root, 'map') || root;
  const records = S.kids(m, 'entity').map(entityRecord);
  let ocean = null;
  const ob = S.kid(m, 'ocean');
  if (ob) {
    const act = S.kid(ob, 'active');
    const av = act ? S.words(act)[1] : undefined;
    const kind = lc(S.val(ob, 'ww_environment_mode'));
    ocean = { zlevel: S.num(S.val(ob, 'zlevel')), kind: ['lake', 'sea', 'river'].includes(kind) ? kind : null,
      active: !!act && (av === undefined || (typeof av === 'number' ? av !== 0 : lc(av) !== 'false')) };
  }
  return { root, map: m, clips: clipsOf(m), ocean, records, errors, missing: false };
}

function readMode(src, key, id) {
  const k = MAP_ROOT + key + '/' + id + '.mi';
  if (!src.has(k)) return null;
  const { root, errors } = S.parse(src, k);
  const mi = S.kid(root, 'mission') || root;
  const clips = clipsOf(mi);
  const waters = clips.map(c => c.water).filter(w => w !== null);
  const env = S.val(mi, 'environment');
  return { id, key: k, root, mission: mi, clips, water: waters.length ? waters[waters.length - 1] : null,
    env: env === undefined ? null : String(env), records: S.kids(mi, 'entity').map(entityRecord), errors };
}

function modeIds(src, key) {
  const p = MAP_ROOT + key + '/';
  return src.keys(p).map(k => k.slice(p.length)).filter(n => !n.includes('/') && /\.mi$/.test(n)).map(n => n.slice(0, -3)).sort();
}

function mapWater(map) {
  const ws = map.clips.map(c => c.water).filter(w => w !== null);
  return ws.length ? { level: ws[ws.length - 1], source: 'map' } : { level: 0, source: 'none' };
}
function waterOf(src, key, mode, cache) {
  const map = (cache && cache.map) || readMap(src, key);
  const W = mapWater(map).level;
  if (!mode) return W;
  const m = (cache && cache.modes && cache.modes[mode]) || readMode(src, key, mode);
  if (!m) throw new mv.MvError('MV_NOT_FOUND', 'map ' + key + ' has no mode ' + mode, { map: key, mode });
  return m.water !== null ? m.water : W;
}

// ---------------------------------------------------------------- modes
const yawOf = r => r.zl + r.zw;
function spawnOf(r, mp) {
  return { name: f1(mp, 'name') === undefined ? null : String(f1(mp, 'name')), uid: r.uid, team: teamOf(f1(mp, 'team')),
    order: intOr(f1(mp, 'order')), x: r.x, y: r.y, z: r.z, yaw: yawOf(r), player: r.player, phase: intOr(f1(mp, 'phase')) };
}
function teamOf(t) { return t === undefined || t === null || t === '' ? null : String(t); }
function zoneAs2(mp) {
  const a = S.num(f1(mp, 'zonea')), b = S.num(f1(mp, 'zoneb'));
  return { kind: 'circle', rA: Math.max(1, a === null ? 0 : a) * 20, rB: Math.max(1, b === null ? 0 : b) * 20 };
}
function polysOf(mission) {
  const out = new Map();
  for (const h of S.kids(mission, 'helpers')) {
    for (const z of S.kids(h, 'zone')) {
      const w = S.words(z);
      if (lc(w[1]) !== 'poly') continue;
      const name = S.val(z, 'name');
      if (name === undefined || out.has(String(name))) continue;
      const pw = S.kid(z, 'position') ? S.words(S.kid(z, 'position')).slice(1).map(S.num) : [0, 0];
      const px = pw[0] || 0, py = pw[1] || 0;
      const pts = S.kids(z, 'point').map(p => { const q = S.words(p).slice(1).map(S.num); return [px + (q[0] || 0), py + (q[1] || 0)]; });
      out.set(String(name), pts);
    }
  }
  return out;
}
// GoH circle zone: {zone {radius r}} in world u as written, no 1 m minimum, no g_unitsPerMeter scaling (gohweb GHMAP-04 [V]:
// ); AS2 zoneA/zoneB are metres x 20 with a 1 m floor
function zoneGoh(mp, polys) {
  const zb = mp.blocks.zone;
  const zoneId = zb ? S.val(zb, 'zoneid') : undefined;
  const radius = zb ? S.num(S.val(zb, 'radius')) : null;
  const id = zoneId === undefined ? null : String(zoneId);
  if (id && polys.has(id)) return { zoneId: id, zone: { kind: 'poly', pts: polys.get(id).map(p => p.slice()) } };
  if (radius !== null && radius > 0) return { zoneId: id, zone: { kind: 'circle', rA: radius, rB: radius } };
  return { zoneId: id, zone: null };
}
// GoH fortification slots: every {manual {i  9 rotation numbers  x y z}} of every level, placed from the flag [I: offsets
// local to the flag entity, rotated by its yaw]
function fortOf(r) {
  const f = extNamed(r, 'fortification');
  if (!f) return [];
  const out = [];
  const a = (r.zl + r.zw) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  for (const lv of S.kids(f.block, 'level')) {
    const kind = S.val(lv, 'entity');
    for (const man of S.kids(lv, 'manual')) {
      for (const slot of S.blocks(man)) {
        const n = S.words(slot).map(S.num);
        if (n.length < 13 || n.some(v => v === null)) continue;
        const tx = n[10], ty = n[11];
        const yaw = Math.atan2(n[2], n[1]) * 180 / Math.PI + (r.zl + r.zw);
        out.push({ x: r.x + tx * c - ty * s, y: r.y + tx * s + ty * c, yaw: Math.round(yaw * 1000) / 1000, kind: kind === undefined ? null : String(kind) });
      }
    }
  }
  return out;
}
function pointKind(def) {
  if (/ammo/.test(def)) return 'ammo';
  if (/base/.test(def)) return 'base';
  if (/evac/.test(def)) return 'evac';
  return 'other';
}
const isFlagDef = def => /^flag/.test(def);

// a .mi under a single-player map (key 'single/...') is that mission's own file, not a multiplayer mode (ruling R4): id =
// the file stem as written, generic points, no MAPKIT_MODE_UNKNOWN
const isSingle = key => typeof key === 'string' && /^single\//.test(key);
function modeOf(src, target, m, mapClips, notes, key) {
  const goh = target === 'goh';
  const known = !isSingle(key) && (goh ? KNOWN_MODES.goh : KNOWN_MODES.as2).includes(m.id);
  const out = { id: m.id, file: m.id + '.mi', env: m.env, water: m.water, spawns: [], flags: [], points: [], clipsBySide: [] };
  if (!known && !isSingle(key)) notes.push({ code: 'MAPKIT_MODE_UNKNOWN', text: 'mode ' + m.id + ' is not a known mode of this game: its points are listed without roles', at: null });
  const polys = goh ? polysOf(m.mission) : new Map();
  const mpByName = new Map();
  for (const r of m.records) {
    const mp = extNamed(r, 'map_point');
    if (mp && f1(mp, 'name') !== undefined && !mpByName.has(String(f1(mp, 'name')))) mpByName.set(String(f1(mp, 'name')), mp);
  }
  const flagsByName = new Map();
  for (const r of m.records) {
    const mp = extNamed(r, 'map_point'), sp = extNamed(r, 'spawn_point');
    if (mp) {
      const name = f1(mp, 'name') === undefined ? null : String(f1(mp, 'name'));
      const point = () => out.points.push({ kind: known ? pointKind(r.def) : 'other', name, uid: r.uid, x: r.x, y: r.y, z: r.z,
        team: teamOf(f1(mp, 'team')), phase: intOr(f1(mp, 'phase')) });
      if (!known) { point(); continue; }
      const spawn = lc(f1(mp, 'visor')) === 'spawnpoint';
      const flag = isFlagDef(r.def);
      if (spawn) out.spawns.push(spawnOf(r, mp));
      if (flag) {
        const z = goh ? zoneGoh(mp, polys) : { zoneId: null, zone: zoneAs2(mp) };
        const fl = { name, def: r.def, uid: r.uid, team: teamOf(f1(mp, 'team')), order: intOr(f1(mp, 'order')), x: r.x, y: r.y, z: r.z,
          phase: intOr(f1(mp, 'phase')), slaveOf: null, zoneId: z.zoneId, zone: z.zone, fort: goh ? fortOf(r) : [] };
        out.flags.push(fl);
        if (name !== null && !flagsByName.has(name)) flagsByName.set(name, fl);
      }
      if (!spawn && !flag) point();
    } else if (sp) {
      const ref = f1(sp, 'mappoint'), pos = intOr(f1(sp, 'pos'));
      const target0 = ref === undefined ? null : mpByName.get(String(ref)) || null;
      if (known && target0) {
        out.spawns.push({ name: null, uid: r.uid, team: teamOf(f1(target0, 'team')), order: pos, x: r.x, y: r.y, z: r.z, yaw: yawOf(r),
          player: r.player, phase: intOr(f1(target0, 'phase')) });
      } else {
        out.points.push({ kind: known ? 'spawn_ext' : 'other', name: null, uid: r.uid, x: r.x, y: r.y, z: r.z, team: null, phase: null });
      }
    }
  }
  // flag_slave: the master flag is the name before the last '_' (f11_1 -> f11) when that flag exists [I]
  for (const f of out.flags) {
    if (!/slave/.test(f.def) || !f.name) continue;
    const i = f.name.lastIndexOf('_');
    const master = i > 0 ? f.name.slice(0, i) : null;
    if (master && flagsByName.has(master) && master !== f.name) f.slaveOf = master;
  }
  // clips by side: captureflag<team>, frontline(s)<phase><team> among the map's and the mode's clips
  if (known) {
    const names = mapClips.concat(m.clips).map(c => c.name).filter(n => n !== null);
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      let x;
      if (/^captureflag/.test(m.id) && (x = /^captureflag([ab])$/i.exec(n))) out.clipsBySide.push({ team: x[1].toLowerCase(), phase: null, clip: n });
      else if (/^frontline/.test(m.id) && (x = /^frontlines?(\d+)([ab])$/i.exec(n))) out.clipsBySide.push({ team: x[2].toLowerCase(), phase: Number(x[1]), clip: n });
    }
  }
  return out;
}

// ---------------------------------------------------------------- entities, covers, pictures
function docEntity(r, srcKind, modeId) {
  const mp = extNamed(r, 'map_point');
  const name = mp && f1(mp, 'name') !== undefined ? String(f1(mp, 'name')) : null;
  let decal = null;
  if (r.decalOrder !== null || r.color !== null) {
    const c = r.color === null ? null : r.color >>> 0;
    decal = { order: r.decalOrder, color: c === null ? null : [(c >>> 16) & 255, (c >>> 8) & 255, c & 255, (c >>> 24) & 255],
      opacity: r.opacity !== null ? r.opacity : c === null ? null : ((c >>> 24) & 255) / 255 };
  }
  return { uid: r.uid, name, def: r.def, x: r.x, y: r.y, z: r.z, yaw: yawOf(r), scale: r.scale === null ? 1 : r.scale, texmod: r.texmod,
    unlinked: r.unlinked, player: r.player, src: srcKind, mode: modeId, decal };
}
function coversOf(m) {
  const out = [];
  for (const cv of S.kids(m.mission, 'covers')) {
    for (const sec of S.kids(cv, 'sector')) {
      const au = S.kid(sec, 'automatic');
      const aw = au ? S.words(au) : [];
      const name = S.val(sec, 'name');
      out.push({ mode: m.id, sector: name === undefined ? null : String(name), x: S.num(aw[2]), y: S.num(aw[3]), raw: S.text(sec) });
    }
  }
  return out;
}

function pictureOf(src, key, stem, names, notes) {
  const pic = require('../../../lib/model/picture');
  const dir = MAP_ROOT + key + '/';
  const cands = names.filter(n => n.slice(0, n.lastIndexOf('.')) === stem && pic.typeOf(n));
  if (!cands.length) return null;
  const sib = cands.map(n => dir + n);
  const win = pic.winner(sib[0], sib);
  if (!win) return null;
  const file = win.slice(dir.length), ext = file.slice(file.lastIndexOf('.') + 1);
  const rec = src.rec(win);
  const P = { file, ext, size: null, bytes: rec ? rec.size : null, format: null, mips: null, shownAs: ext,
    mount: rec && modOf(rec.layer) ? 'mod' : 'pak', shadowed: cands.filter(n => n !== file).sort() };
  const type = pic.typeOf(file);
  if (type === 'desc') return P;   // .tex / .ebm: a description that names the image; not followed here [I]
  let bad = null;
  try {
    const buf = src.read(win);
    const f = pic.facts(type, buf);
    if (f.error) bad = f.error;
    else {
      P.size = [f.width, f.height]; P.format = f.format || null; P.mips = f.mips || (type === 'dds' ? 1 : null);
      if (type === 'dds' || type === 'tga' || type === 'bmp') {
        const d = pic.decode(type, buf, { mip: type === 'dds' ? Math.max(0, (f.mips || 1) - 1) : 0, maxSize: 64 });
        if (d && d.error) bad = d.error;
      }
    }
  } catch (e) { bad = e.message; }
  if (bad) {
    P.size = null;
    notes.push({ code: 'MAPKIT_PICTURE_UNREAD', text: 'picture ' + file + ' cannot be read: ' + bad, at: null });
  }
  return P;
}

// ---------------------------------------------------------------- the document
function terrainNames(src) {
  const k = 'resource/set/interaction_terrain/terrains.set';
  if (!src.has(k)) return [];
  const { root } = S.parse(src, k);
  const t = S.kid(root, 'terrains') || root;
  return S.blocks(t).map(b => S.words(b)[0]).filter(w => w !== undefined).map(String);
}
// README 3.2 (ruling R2): a v2 type name outside the tables -> 0 (undef, blocked) on as64 and mowas2, 15 (other) on goh
function typeUnknownNote(target, t) {
  const e = tables.unknownTypeId(target);
  return { code: 'MAPKIT_TYPE_UNKNOWN', text: 'ground type "' + t.name + '" (id ' + t.index + ') is not an engine type: ' +
    (e === 0 ? 'the engine reads it as 0 (undef), blocked ground' : 'shown as other (15)'), at: null };
}
// README 3.2 (ruling R3): one note per map or .mi file the strict reader refuses; what could be read is still given
function parseNote(name, errors) {
  if (!errors || !errors.length) return null;
  const e = errors[0];
  return { code: 'MAPKIT_PARSE_ERROR', text: 'the game cannot read ' + name + ': ' + e.file + ' line ' + e.line + ' ' + e.code +
    (errors.length > 1 ? ' (' + errors.length + ' errors)' : '') + '; what could be read is shown', at: null };
}
function netTables(src, net, target, notes, mt) {
  const types = [], materials = [];
  if (net.version < 2) return { types, materials };
  for (const t of net.types) {
    let e = tables.netTypeId(target, t.index, t.name);   // AS2 by name, GoH the index as read (README 3.2)
    if (e === null) {
      e = tables.unknownTypeId(target);
      notes.push(typeUnknownNote(target, t));
    }
    types.push({ id: t.index, name: t.name, engine: e });
  }
  for (const m of net.materials) {
    const n = lc(m.name);
    const e = mt.byName.has(n) ? mt.byName.get(n) : null;
    if (e === null) notes.push({ code: 'MAPKIT_MATERIAL_UNKNOWN', text: 'ground material "' + m.name + '" (id ' + m.index + ') is the game has no such key table or terrains.set', at: null });
    materials.push({ id: m.index, name: m.name, engine: e });
  }
  return { types, materials };
}

function doc(src, key, o) {
  o = o || {};
  const { net } = loadNet(src, key);
  const target = src.target, notes = [];
  const map = readMap(src, key);
  const ids = modeIds(src, key);
  let want = ids;
  if (o.mode) {
    if (!ids.includes(o.mode)) throw new mv.MvError('MV_NOT_FOUND', 'map ' + key + ' has no mode ' + o.mode, { map: key, mode: o.mode });
    want = [o.mode];
  }
  const mt = tables.materialTable(terrainNames(src));
  const nt = netTables(src, net, target, notes, mt);
  const pn = parseNote('map', map.errors);
  if (pn) notes.push(pn);
  const cell = net.cell;
  // boxes
  const grid = [-net.offX, -net.offY, (net.width - 1) * cell - net.offX, (net.height - 1) * cell - net.offY];
  const named = map.clips.map(c => ({ name: c.name, world: c.world, camera: c.camera, pather: c.pather, water: c.water }));
  const worlds = named.map(c => c.world).filter(Boolean);
  const auto = named.find(c => c.name === '[auto]') || null;
  let world;
  if (!worlds.length) {
    world = grid.slice();
    notes.push({ code: 'MAPKIT_NO_CLIPS', text: map.missing ? 'the map has no map file: the world box is the height grid' : 'the map file has no Clips world box: the world box is the height grid', at: null });
  } else {
    world = [Math.min(...worlds.map(b => b[0])), Math.min(...worlds.map(b => b[1])), Math.max(...worlds.map(b => b[2])), Math.max(...worlds.map(b => b[3]))];
  }
  const autoWorld = auto && auto.world ? auto.world.slice() : null;
  if (autoWorld && autoWorld.some((v, i) => v !== world[i])) {
    notes.push({ code: 'MAPKIT_WORLD_UNION_DIFFERS', text: 'the union of the Clips world boxes differs from the [auto] clip box', at: null });
  }
  const water = mapWater(map);
  // modes
  // structure links (links.js): each container's {Link} records and its roots' seats, on that container's rows only. A .mi
  // Link to a record of the map file is not carried over: on vanilla MoW:AS2 none links a map-file entity row (10 of
  // 8115 .mi links have a map-file root, their parts are crew, not entity rows), on the GoH sample none at all [I data]
  const L = require('./links');
  const linked = (rows, records, container, name) => {
    const l = L.linksIn(container);
    for (const n of l.nested) notes.push({ code: 'MAPKIT_LINK_NESTED', text: name + ': ' + (n.seats === null ? 'link ' + n.text + ' is not a plain part uid with one host'
      : 'link of ' + n.part + ' goes through ' + n.seats + ' seats') + '; no entities[].link given', at: null });
    return L.attach(rows, records, l);
  };
  const modes = [], entities = linked(map.records.map(r => docEntity(r, 'map', null)), map.records, map.map, 'map'), covers = [];
  for (const id of want) {
    const m = readMode(src, key, id);
    const mn = parseNote(id + '.mi', m.errors);
    if (mn) notes.push(mn);
    modes.push(modeOf(src, target, m, map.clips, notes, key));
    entities.push(...linked(m.records.map(r => docEntity(r, 'mi', id)), m.records, m.mission, id + '.mi'));
    covers.push(...coversOf(m));
  }
  // entities outside the height grid
  let outside = 0;
  for (const e of entities) {
    if (e.x === null || e.y === null) continue;
    if (e.x < grid[0] || e.y < grid[1] || e.x > grid[2] || e.y > grid[3]) {
      outside++;
      if (outside <= OUTSIDE_NOTES_MAX) notes.push({ code: 'MAPKIT_ENTITY_OUTSIDE', text: 'entity ' + e.def + (e.uid === null ? '' : ' ' + e.uid) + (e.mode ? ' (' + e.mode + ')' : '') + ' is outside the height grid', at: [e.x, e.y] });
    }
  }
  if (outside > OUTSIDE_NOTES_MAX) notes.push({ code: 'MAPKIT_ENTITY_OUTSIDE', text: (outside - OUTSIDE_NOTES_MAX) + ' more entities are outside the height grid', at: null });
  // pictures
  const dir = MAP_ROOT + key + '/';
  const names = src.keys(dir).map(k => k.slice(dir.length)).filter(n => !n.includes('/'));
  const pictures = {};
  for (const stem of PICTURE_STEMS) pictures[stem] = pictureOf(src, key, stem, names, notes);
  const d = {
    v: 1, game: target, key, stack: { mods: src.mods.slice(), hash: src.stackHash }, cell, upm: 20,
    net: { w: net.width, h: net.height, offX: net.offX, offY: net.offY, cell, version: net.version, types: nt.types, materials: nt.materials },
    boxes: { world, auto: autoWorld, camera: auto && auto.camera ? auto.camera.slice() : null, pather: auto && auto.pather ? auto.pather.slice() : null, named },
    water: { level: water.level, source: water.source, ocean: map.ocean },
    modes,
    entities: o.entities === false ? [] : entities,
    covers,
    pictures,
    notes,
  };
  return d;
}

module.exports = { doc, loadNet, readMap, readMode, modeIds, mapWater, waterOf, entityRecord, terrainNames, KNOWN_MODES, clipsOf,
  typeUnknownNote, parseNote, isSingle };
