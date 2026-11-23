// Map Viewer game marks, server side: GET places, the named places of a map's mission files, for the game layers of the
// viewer and for the place picker other pages open (MAPVIZ_PICK, game.client.js).
//   GET /api/x/mapviz/places ? target, game, mods, modDir, map, mode (side, kind, size, phase, at, pose, light: taken and
//   not used, so the shell may add its common fields)
//   -> {v:1, kind:'places', target, map, mode (null: every .mi of the map), modes:[ids], upm:20, bounds:[x0,y0,x1,y1]|null,
//       play:[x0,y0,x1,y1]|null (the playable area: the first Clips world box, spmis's rule), places:[{id, kind, lab:{k, n}, x, y, team?, r?, pts?, group?, mode, dup?}], more}
//   kind: zone (a Helpers zone: circle r or poly pts, absolute world u), flag, start (map_point visor SpawnPoint), point
//   (another map_point), waypoint (a Helpers waypoints item; id "group/name", or the name when the block has no group).
//   lab = the words of a readable label (k = the label form, n = the words): the page turns it into its own language.
//   dup: a zone X_capture beside a zone X (the capture ring of a flag, the same spot): drawn, never listed or searched.
// Why this route: mapdoc/1 (tools/mapviz/lib/mapkit/mapdoc.js) reads a mode's entities only. A single-player mission
// keeps its places in {Helpers {zone ...} {waypoints ...}} (vanilla MoW:AS2: 53 single-player missions, 898 zones and
// 12000 waypoints, none as map_point entities), so the viewer drew none of them ("Flags: 0"). A multiplayer combat mode
// holds start points and no flag at all, and frontline modes keep zones in Helpers too. The places are read here with the
// viewer's own readers (mapdoc readMode: the strict SDL reader with includes, entityRecord), not added to mapdoc, so no
// cached mapdoc or the mapkit part version changes.
// Units: world u as the files hold them, 20 u = 1 m, x east, y north (tools/mapviz/README.md 3.1).
// Reads only (the game's files through vfs, the doc entry of the cache when there for its world box); never starts a job.
// One file source per game, stack and mod folder is kept 20 s (a picker and the viewer ask close together), at most 4.
// Author: Imperator_Aug (ARSENAL, ia-57c6879d)
'use strict';
const path = require('path');
const SH = () => require('./shell.server').lib;
const MAPKIT = { source: () => require('../../../../mapviz/lib/mapkit/source'), doc: () => require('../../../../mapviz/lib/mapkit/mapdoc'),
  sdl: () => require('../../../../mapviz/lib/mapkit/sdl') };
let STUB = {};
const K = name => (STUB[name] !== undefined ? STUB[name] : MAPKIT[name]());

const MAX_PLACES = 4000, KEEP_MS = 20000, KEEP_MAX = 4;
const MODE_RE = /^[A-Za-z0-9_.-]{1,80}$/;
let SRC = [];   // [{k, t, src}], newest first

function sourceOf(req) {
  if (STUB.sourceOf) return STUB.sourceOf(req);
  const k = [req.target, req.game || '', req.mods || '', (req.modDirs || []).join(';')].join('|'), now = Date.now();
  const hit = SRC.find(x => x.k === k && now - x.t < KEEP_MS);
  if (hit) return hit.src;
  const src = K('source').source({ target: req.target, game: req.game, mods: req.mods ? String(req.mods).split(',').filter(Boolean) : [], modDirs: req.modDirs || [] });
  SRC = [{ k, t: now, src }].concat(SRC.filter(x => x.k !== k)).slice(0, KEEP_MAX);
  return src;
}

// ---- a readable label (the words; the page turns the form k into its own language): the rules of the single-player
// mission card (tools/gui/ext/missions/sp.js labelOf), so both pages name a place alike
const words = s => String(s).replace(/[_\-:/]+/g, ' ').replace(/\s+/g, ' ').trim();
function labOf(name, kind, group) {
  const s = String(name).toLowerCase();
  if (kind === 'waypoint') return { k: 'path', n: words((group ? group + ' ' : '') + name) };
  if (kind === 'start') return { k: 'start', n: words(name) };
  if (/^flag_?playerbase$|(^|_)player_?base$|^(player|my)_?(base|start)$/.test(s)) return { k: 'pbase', n: '' };
  if (/^flag_?enemybase$|(^|_)enemy_?base$/.test(s)) return { k: 'ebase', n: '' };
  let m = /^flag_?([a-z])_?0*(\d+)$/.exec(s);
  if (m) return { k: 'flag', n: m[1].toUpperCase() + m[2] };
  if ((m = /^flag_?0*(\d+)$/.exec(s))) return { k: 'flag', n: m[1] };
  if ((m = /^flag_?(.+)$/.exec(s))) return { k: 'flag', n: words(m[1]) };
  if (kind === 'flag') return { k: 'flag', n: words(s) };
  const w = words(s);
  if (!/[a-z]/.test(w)) return { k: kind === 'point' ? 'pointn' : 'arean', n: w };
  return { k: kind === 'point' ? 'point' : 'area', n: w };
}

const r2 = v => Math.round(v * 100) / 100;
const fin = v => typeof v === 'number' && Number.isFinite(v);
// placesOfMode(m) -> the places of one parsed .mi (mapdoc readMode): map_point entities, then Helpers zones and waypoints
function placesOfMode(m) {
  const S = K('sdl'), out = [];
  for (const r of m.records) {
    const mp = r.ext.find(e => e.name === 'map_point');
    if (!mp || !fin(r.x) || !fin(r.y)) continue;
    const f = k => (mp.fields[k] ? mp.fields[k][0] : undefined);
    const name = f('name') === undefined ? null : String(f('name'));
    if (!name) continue;
    const visor = String(f('visor') || '').toLowerCase(), team = f('team') === undefined ? null : String(f('team')).toLowerCase();
    const kind = visor === 'spawnpoint' ? 'start' : (/^flag/.test(r.def) || visor === 'mappoint') ? 'flag' : 'point';
    out.push({ id: name, kind, x: r2(r.x), y: r2(r.y), team: team || null, mode: m.id });
  }
  for (const h of S.kids(m.mission, 'helpers')) {
    for (const z of S.kids(h, 'zone')) {
      const name = S.val(z, 'name');
      if (name === undefined || name === null || name === '') continue;
      const pw = S.kid(z, 'position') ? S.words(S.kid(z, 'position')).slice(1).map(S.num) : [];
      if (!fin(pw[0]) || !fin(pw[1])) continue;
      const shape = String(S.words(z)[1] || '').toLowerCase(), it = { id: String(name), kind: 'zone', x: r2(pw[0]), y: r2(pw[1]), mode: m.id };
      if (shape === 'poly') {
        const pts = S.kids(z, 'point').map(p => S.words(p).slice(1).map(S.num)).filter(q => fin(q[0]) && fin(q[1])).map(q => [r2(pw[0] + q[0]), r2(pw[1] + q[1])]);
        if (pts.length >= 3) it.pts = pts;
      } else {
        const r = S.num(S.val(z, 'radius'));
        if (r !== null && r > 0) it.r = r;
      }
      out.push(it);
    }
    for (const wb of S.kids(h, 'waypoints')) {
      const g = S.words(wb)[1], group = g === undefined || g === null ? '' : String(g);
      for (const w of S.blocks(wb)) {
        const n = S.words(w)[0];
        if (n === undefined || n === null || n === '') continue;
        const p = S.kid(w, 'position') ? S.words(S.kid(w, 'position')).slice(1).map(S.num) : [];
        if (!fin(p[0]) || !fin(p[1])) continue;
        out.push({ id: group ? group + '/' + n : String(n), name: String(n), group, kind: 'waypoint', x: r2(p[0]), y: r2(p[1]), mode: m.id });
      }
    }
  }
  return out;
}

// boundsOf(src, key, req) -> the world box [x0, y0, x1, y1]: the doc entry's when it is in the cache (no job), else the
// union of the map file's Clips {world} boxes (a text scan: the whole map is not parsed for a picker), else null
const NUM = '(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)';
const WORLD = new RegExp('\\{\\s*world\\s+' + NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s*\\}', 'gi');
function boundsOf(src, key, req) { return boxesOf(src, key, req).bounds; }
// boxesOf(src, key, req) -> {bounds, play}: bounds as above; play = the playable area, the FIRST Clips world box (the rule
// tools/spmis uses for SPMIS_POINT_OUTSIDE, spmis.js readBase: clips.kids, the first with a world box), so a spot the
// picker takes is one the mission writer takes; null when the map file has no Clips world box
const okB = b => Array.isArray(b) && b.length === 4 && b.every(fin) && b[2] > b[0] && b[3] > b[1];
const norm4 = v => [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
function boxesOf(src, key, req) {
  try {
    const L = SH(), hit = L.entry('doc', { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: key });
    const d = L.readJson(path.join(hit.dir, 'mapdoc.json'), 'the map document');
    const B = d && d.boxes, b = B && B.world;
    if (okB(b)) {
      const first = (Array.isArray(B.named) ? B.named : []).find(c => c && Array.isArray(c.world) && c.world.length === 4 && c.world.every(fin));
      const p = first ? norm4(first.world) : okB(B.auto) ? B.auto.slice() : null;
      return { bounds: b.slice(), play: okB(p) ? p : null };
    }
  } catch (e) { /* not made: read the map file */ }
  const k = 'resource/map/' + key + '/map';
  if (!src.has(k)) return { bounds: null, play: null };
  const t = src.read(k).toString('latin1');
  let b = null, play = null, m;
  WORLD.lastIndex = 0;
  while ((m = WORLD.exec(t))) {
    const v = norm4(m.slice(1, 5).map(Number));
    if (!play) play = v;
    if (!(v[2] > v[0] && v[3] > v[1])) continue;
    b = b ? [Math.min(b[0], v[0]), Math.min(b[1], v[1]), Math.max(b[2], v[2]), Math.max(b[3], v[3])] : v;
  }
  return { bounds: b, play: okB(play) ? play : null };
}

// placesOf(src, key, mode, req) -> the answer without v and kind
function placesOf(src, key, mode, req) {
  const D = K('doc');
  if (!src.has('resource/map/' + key + '/map') && !src.has('resource/map/' + key + '/map.net')) {
    throw Object.assign(new Error('no map ' + key), { code: 'MV_NOT_FOUND' });
  }
  const modes = D.modeIds(src, key);
  let want = modes;
  if (mode) {
    const lm = String(mode).toLowerCase(), hit = modes.find(x => x.toLowerCase() === lm);
    if (!hit) throw Object.assign(new Error('map ' + key + ' has no mode ' + mode), { code: 'MV_NOT_FOUND' });
    want = [hit];
  }
  const all = [], seen = new Set();
  for (const id of want) {
    const m = D.readMode(src, key, id);
    if (!m) continue;
    for (const p of placesOfMode(m)) {
      const k2 = p.kind + '|' + p.id;
      if (seen.has(k2)) continue;
      seen.add(k2);
      all.push(p);
    }
  }
  const zoneNames = new Set(all.filter(p => p.kind === 'zone').map(p => p.id.toLowerCase()));
  for (const p of all) {
    p.lab = labOf(p.kind === 'waypoint' ? p.name : p.id, p.kind, p.group);
    if (p.kind === 'zone' && /_capture$/i.test(p.id) && zoneNames.has(p.id.toLowerCase().replace(/_capture$/, ''))) p.dup = true;
    delete p.name;
  }
  const rank = { flag: 0, zone: 1, start: 2, point: 3, waypoint: 4 };
  all.sort((a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const bx = boxesOf(src, key, req);
  return { target: req.target, map: key, mode: mode ? want[0] : null, modes, upm: 20, bounds: bx.bounds, play: bx.play,
    places: all.slice(0, MAX_PLACES), more: Math.max(0, all.length - MAX_PLACES) };
}

// the map key as the missions and bots pages name it ('map/single/...', 'resource/map/multi/...') or as the viewer does
function keyOf(s) {
  const k = String(s || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^resource\//i, '').replace(/^map\//i, '').replace(/\/+$/, '').toLowerCase();
  if (!k || k.split('/').some(p => p === '..' || p === '.' || p === '') || /[\x00-\x1f]/.test(k)) return null;
  return k;
}

const R = {};
R['GET /api/x/mapviz/places'] = (...a) => SH().wrap(async u => {
  const L = SH(), q = L.query(u, L.COMMON);
  const key = keyOf(q.map);
  if (!key) throw L.fail('MV_USAGE', 'map is required (a map key such as multi/1v1_road or map/single/<campaign>/<mission>)');
  if (q.mode !== undefined && !MODE_RE.test(q.mode)) throw L.fail('MV_USAGE', 'mode ' + JSON.stringify(String(q.mode).slice(0, 40)) + ' is not a mission file name');
  const req = L.request(Object.assign({}, q, { map: key }), true);
  const src = sourceOf(req);
  return Object.assign({ v: 1, kind: 'places' }, placesOf(src, key, q.mode || null, req));
})(...a);

module.exports = {
  routes: R,
  _t: { labOf, placesOfMode, placesOf, boundsOf, boxesOf, keyOf, sourceOf, use(o) { STUB = Object.assign({}, o || {}); SRC = []; }, reset() { STUB = {}; SRC = []; } },
};
