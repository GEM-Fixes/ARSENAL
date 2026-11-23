#!/usr/bin/env node
// spmis: a playable single-player mission in a mod from a small spec, nothing typed in the mission file. Model: the stock SP missions.
//   node tools/spmis/spmis.js --spec <spec.json> --out <mod folder> [--game G] [--exe as64|mowas_2] [--dry-run] [--force] [-q]
//   node tools/spmis/spmis.js --check <mod folder> --mission <name> [--game G] [--exe ..] [--no-milint] [-q]   exit 1 on a finding
//   node tools/spmis/spmis.js --list-templates | --template <name> (prints the spec)   --learn [--game G] [--exe ..] (rewrites model.json)
//   node tools/spmis/spmis.js --list-generated <mod folder>   |   --remove <mod folder> --mission <name>   (only what spmis.json says it made)
// A write leaves spmis.json in the mission folder: the spec (to open it again and regenerate with --force), the files and folders
//   the run made that were not there before. --remove deletes exactly those; a campaign file stays while another mission of the
//   campaign is left (and passes to that one's spmis.json). The game reads no .json in a mission folder [I].
// Game: --game or the Steam install (lib/games). --exe goh: refused, exit 2 (SPMIS_GOH, below). --out: lib/writeguard refuseWrite (game
//   files refused; <install>/mods/<name> allowed, where the game enables a mod).
//
// STOCK FORM (model.json = --learn over resource/map/single/** through lib/vfs, 51 missions in as64 and mowas_2; counts there) [V stock]:
//   files of a mission folder: map map.net map.ply mtlN.mtl map.grs(50/51) minimap.dds preview.dds preview_small.dds 0.mi interface.set
//   menu: loads /map/ as a location tree: every folder under map/single/<campaign>/<mission>/
//     with a `map` file is a mission, its scene = alphabetically first .mi = 0.mi; interface.set
//     {location ..} adds fields. Campaign button text mission/single/<c>/campaign/name + /title
//     = localization/mission/single/<c>/campaign.lng {"title"}{"name"}
//     (stock 51/51 name,title). Mission button = mission/single/<c>/<m>/name; loading page reads name_big
//     date, place, story (story = the briefing, read when present). Location appid 0 = installed
// level 0 = unlocked (:191-207). Stock mission interface.set {location {level 0}{level_set 1}{achievements}}
//     51/51 (achievements = Steam names, left out); campaign interface.set {location {side usa|ger|eng|rus|jap}{background}{appid 244450}} 5/5
//     (side kept: it sets the scene army, ; appid and background left out).
//   SP runs as a cooperative MP game (cooperative.set). Players {user 0}{alias 0 "player"}{alias 1 "enemy"}
//     {alias 2 "allied"}{alias 3 "neutral"}{diplomacy 8x8} 50/50 (45 the exact matrix written here). Player units: {Player 2} 2762 of
//     2776 units tagged player; enemies {Player 1} 8492/8905. Player units carry Brain {Properties {control user}{move_mode hold}} (2821).
//     They reach the human by `autoassign` in a start trigger (818 commands; EVENT_AUTOASSIGN) [V form, T run].
//   start: trigger "start" with empty condition: fade {time 5}{color 0xff000000}, delay 0.01, scenario {message {text "$/start"}}
//     {camera {name "startview"}..}{event_on_next "start"}{force_auto_complete} (stock overlord form, cmd sig 45); cameras "startview"
//     one key {position}{look_at}{fov 65} (60 one-key cameras). Event "start" gates the rest (13468 event terms).
//   objectives = Helpers tasks {"id" {desc "$/key"}{primary}{state hidden}} (187); shown by {"task" {name id}} + sound mission/task_new
//     (415), done by {"task" {name id}{state complete}} + mission/task_fulfilled (330), failed by state fail + mission/task_failed (265);
//     term {"n.task" {name id}} = completed (default), {state shown|failed}.
//   goal order (spec objectives[].after = an earlier goal's id): the goal's show trigger waits on {"1.task" {name prev}} (completed)
//     instead of the start event, so its text, sound and any hold / survive timer start only when the earlier goal is done.
//   In-game proof: proven.json {inGame, date, note} next to this file; false until a generated mission was played (the GUI card says
//     "Not yet tried in the game" while it is false).
//   win/lose: gameover {result win|loose}{message ""} 50/50 (names: "", "loose", "win"); stock sets the
//     events start_won / start_lost and a trigger on the event ends the game (go.* terms {event start_won|start_lost}); all-dead =
//     entities {tag player}{type human}{state "not dead"} count == 0 (5 missions, they add {zone gamezone}). count ops seen:
//     == << <<= > != (no >=: "some" is written > 0).
//   timed: {"event" {event x}{mode set}{delay N}} delay = seconds; timer {time "N"}{title "$/key"} seconds (175).
//   reinforcement / wave pattern: units placed with the tag "hidden" (9218 in stock) are made inactive at mission begin
// entity_state {tag_remove hidden}{inactive off} brings them in (940); player ones then autoassign.
//   moves: actor_to_waypoint {selector}{waypoint "N"} (193; mi-forms run: a tank moved) for waves; patrols: waypoint {who {type actor}
//     {actors {tag t}}}{action {type start}{waypoint "N"}} (166) along a waypoints block whose points chain by {transition} (7300) back
//     to the first [I loop, T run]. crews: board {selector {tag c}{type human}}{vehicle {tag v}} (205; placed vehicles start empty, MIS-39).
//   difficulty: term {"n.difficulty" {level easy|normal|hard|heroic}} (233); a group with a minimum level is deleted below it.
// Every emitted command, term, selector key and state, Helpers block and entity key set is checked against model.json before writing;
// a form stock never shows is refused with SPMIS_UNCONFIRMED, not guessed.
// Positions: a name (zone Name, map_point name, waypoint id or block/id from any .mi of the base map), [x,y], {x,y}, "start" (the player
//   start point), "auto" (player: start; enemy: the first objective's point). A group of n units fills a grid around its point, 6 per row,
//   humans 100 units apart (5 m), vehicles 300 apart in rows behind; later groups at the same point take the next free slots.
//   Facing: toward the first objective (player) or the player start (enemy) [I the angle convention follows misgen].
// Where units can walk: the pather box of the map file's default clip ("[auto]", else the first), cut to that clip's world box: the
//   pathfinding network covers only that rectangle (modweb maps/mapfile, maps/grids:14) [V data, T a unit outside it stuck in game].
//   Read with the Map Viewer's clip reader (tools/mapviz/lib/mapkit/mapdoc clipsOf). Every place a mission uses (start, group places,
//   patrol and wave points, goals) is moved to the nearest spot inside it, 100 units from the edge (SPMIS_MOVED), and every unit of a
//   group stands inside it and off every unit placed before (SPMIS_UNIT_MOVED). No such box readable: nothing is moved and
//   SPMIS_AREA_UNKNOWN says so. Not looked at: ground a unit cannot cross inside the box (water, no_pass ground, houses) [T].
//   --check: a unit, waypoint or generated goal zone outside the box is the finding SPMIS_OUTSIDE.
// Base map: a stock or mod map folder (map/single/.. or map/multi/..), read through vfs, terrain files copied byte-equal into the new
//   folder (map-clone rule: `map` text gets map/<old dir> paths renamed; binaries untouched); the source is never edited.
// GoH (gohweb): the SP mission list reads header_interface and minimap previews (GHUI-113), appid is not read (GHUI-114), game over box
//   differs (GHUI-155); no GoH SP mission was read for form here, so --exe goh is refused (SPMIS_GOH, exit 2).
// codes: generate: SPMIS_ARGS SPMIS_GOH SPMIS_IN_INSTALL SPMIS_SPEC SPMIS_NO_MAP SPMIS_POINT SPMIS_POINT_OUTSIDE SPMIS_DEF SPMIS_EXISTS
//   SPMIS_NO_LOSE SPMIS_UNCONFIRMED SPMIS_MODEL; info SPMIS_WROTE SPMIS_PLAN SPMIS_HOWTO SPMIS_EMPTY_VEHICLE SPMIS_NO_MODINFO
//   SPMIS_MOVED SPMIS_UNIT_MOVED SPMIS_AREA_UNKNOWN (generate and check)
//   remove: SPMIS_NOT_GENERATED; info SPMIS_REMOVED SPMIS_KEPT
//   check: SPMIS_MISSING SPMIS_PARSE SPMIS_TEXT_KEY SPMIS_MENU SPMIS_DEF SPMIS_REF SPMIS_OBJ_NO_TRIGGER SPMIS_NO_WIN SPMIS_WIN_UNREACHABLE
//   SPMIS_NO_LOSE SPMIS_LOSE_UNREACHABLE SPMIS_NO_PLAYER_UNITS SPMIS_FORM SPMIS_OUTSIDE SPMIS_MILINT (a milint finding on the mission)
// [T]: the mission loading and playing in game (menu entry, autoassign of units, waves, patrol loop, board crews, win/lose ends).
// Author: Imperator_Aug (ARSENAL, ia-484ddc5a)
'use strict';
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), cp = require('child_process');
const sdl = require('../lib/sdl'), vfs = require('../lib/vfs'), games = require('../lib/games');
const { createReport } = require('../lib/report');
const { refuseWrite } = require('../lib/writeguard');

const HERE = __dirname, MODEL_FILE = path.join(HERE, 'model.json'), TPL_DIR = path.join(HERE, 'templates');
const LEVELS = ['easy', 'normal', 'hard', 'heroic'];
const P_PLAYER = 2, P_ENEMY = 1, FIRST_ID = 0xd000;
const SP_H = 100, SP_V = 300, ZONE_R = 300;
// AREA_M: how far a place keeps from the edge of the walkable box; UNIT_M: the same for one unit; GAP_H / GAP_V: the least distance
// between two soldiers / between a vehicle or gun and anything else
const AREA_M = 100, UNIT_M = 40, GAP_H = 50, GAP_V = 200;
const AREA_UNKNOWN = 'could not read where units can walk on this map; positions were not checked';
const OBJ_TYPES = ['capture', 'destroy', 'hold', 'reach', 'survive', 'escort'];
class Refuse extends Error { constructor(code, msg, exit = 1) { super(msg); this.code = code; this.exit = exit; } }
const no = (code, msg) => { throw new Refuse(code, msg); };
const ID_RE = /^[A-Za-z0-9_-]+$/;
const exeKey = e => (e === 'mowas2' ? 'mowas_2' : e || 'as64');
const fin = x => typeof x === 'number' && isFinite(x);
const r2 = x => Math.round(x * 100) / 100;

// ---- reading
const tree = t => sdl.parseLines(String(t).split(/\r?\n/), () => {});
const val = n => n.vals.map(x => x.v).join(' ');
const kid = (n, name) => n.kids.find(k => k.name === name);
const sig = n => [...new Set(n.kids.map(k => k.name))].sort().join(',');
function walk(n, f) { for (const k of n.kids) { f(k, n); walk(k, f); } }
function gameDirOf(o) {
  if (o.game) return o.game;
  const i = games.install(exeKey(o.exe)); return i && i.dir;
}
function openGame(o, modDir) {
  const gameDir = gameDirOf(o);
  if (!gameDir || !fs.existsSync(gameDir)) no('SPMIS_ARGS', `no game folder (--game): ${gameDir || 'none found'}`);
  const v = vfs.build({ gameDir, exe: exeKey(o.exe), mods: [], modDirs: modDir && fs.existsSync(modDir) ? [modDir] : [] });
  v.has = k => v.files.has(k.toLowerCase());
  v.read = k => vfs.readRec(v.files.get(k.toLowerCase()));
  v.gameDir = gameDir;
  return v;
}
let DEFS = null;
function defIndex(v) {
  if (DEFS && DEFS.v === v) return DEFS;
  const breed = new Set(), ent = new Map();
  for (const k of v.files.keys()) {
    let m = /^resource\/set\/breed\/(.+)\.set$/.exec(k); if (m) { breed.add(m[1]); continue; }
    m = /^resource\/entity\/.+\/([^/]+)\.def$/.exec(k); if (m && !ent.has(m[1])) ent.set(m[1], k);
  }
  return (DEFS = { v, breed, ent });
}
function resolveDef(v, def) {
  const d = defIndex(v), k = String(def).toLowerCase();
  if (d.breed.has(k)) return 'human';
  if (d.ent.has(k)) return 'entity';
  return null;
}

// ---- model (stock forms)
function loadModel(exe) {
  let m; try { m = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8')); } catch (e) { no('SPMIS_MODEL', `model.json unreadable (${e.message}); run --learn`); }
  const r = m[exeKey(exe)] || m.as64;
  if (!r) no('SPMIS_MODEL', 'model.json has no as64 section; run --learn');
  return r;
}
// every block of the .mi text against the stock forms; returns a list of "what" strings not seen in stock
function unconfirmed(miText, model) {
  const out = [], c = model.counts, seen = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  const top = tree(miText).kids[0];
  const keysOf = name => new Set(Object.keys(c[name] || {}).flatMap(s => s.split(',')));
  const hk = keysOf('HumanKeys'), ek = keysOf('EntityKeys');
  for (const n of top.kids) {
    if (n.name === 'Human' && n.kids.some(k => !hk.has(k.name))) out.push(`Human key set ${sig(n)}`);
    if (n.name === 'Entity' && n.kids.some(k => !ek.has(k.name))) out.push(`Entity key set ${sig(n)}`);
    if (n.name === 'Brain') { const f = n.kids.map(p => p.name + '{' + p.kids.map(x => x.name + ' ' + val(x)).join(';') + '}').join(''); if (!seen(c.brainForm, f)) out.push(`Brain ${f}`); }
    if (n.name === 'Players' && !seen(c.playersSig, sig(n))) out.push(`Players ${sig(n)}`);
    if (!seen(c.topBlocks, n.name)) out.push(`top block ${n.name}`);
    if (n.name !== 'Helpers') continue;
    for (const h of n.kids) {
      if (!seen(c.helpersBlocks, h.name)) out.push(`Helpers block ${h.name}`);
      if (h.name === 'zone' && !seen(c.zoneSig, val(h) + ':' + sig(h))) out.push(`zone ${val(h)}:${sig(h)}`);
      if (h.name === 'tasks') for (const t of h.kids) if (!seen(c.taskSig, sig(t))) out.push(`task ${sig(t)}`);
      if (h.name === 'cameras') for (const cam of h.kids) for (const key of cam.kids) if (!seen(c.cameraKeySig, sig(key))) out.push(`camera key ${sig(key)}`);
      if (h.name === 'waypoints') for (const w of h.kids) if (!seen(c.waypointSig, sig(w))) out.push(`waypoint ${sig(w)}`);
      if (h.name !== 'triggers') continue;
      for (const tr of h.kids) {
        if (!seen(c.triggerSig, sig(tr))) out.push(`trigger ${sig(tr)}`);
        for (const part of tr.kids) {
          if (part.name === 'condition') {
            if (!seen(c.condSig, sig(part))) out.push(`condition ${sig(part)}`);
            for (const terms of part.kids.filter(x => x.name === 'terms')) for (const t of terms.kids) {
              const kind = t.name.replace(/^\d+\./, '');
              if (!/^\d+\./.test(t.name)) out.push(`term name ${t.name} (MIS-35)`);
              if (!seen(model.termSig[kind], sig(t))) out.push(`term ${kind} {${sig(t)}}`);
            }
          }
          if (part.name === 'actions') for (const a of part.kids) if (!seen(model.cmdSig[a.name], sig(a))) out.push(`command ${a.name} {${sig(a)}}`);
        }
        walk(tr, x => {
          if (!['selector', 'vehicle', 'actors'].includes(x.name)) return;
          for (const f of x.kids) {
            if (!seen(c.selectorKeys, f.name)) out.push(`selector key ${f.name}`);
            if (f.name === 'state' && !f.kids.length && !seen(c.selectorState, val(f))) out.push(`selector state ${val(f)}`);
          }
        });
      }
    }
  }
  return [...new Set(out)];
}

// ---- base map
// areaOf(map file text, its name) -> {area: [x0, y0, x1, y1] | null, clip, why}: the box units can walk in (header: Where units can walk)
function areaOf(mapText, key) {
  try {
    const i = mapText.search(/\{\s*Clips\b/i);
    if (i < 0) return { area: null, why: 'the map file has no Clips block' };
    let d = 0, j = i;
    for (; j < mapText.length; j++) { if (mapText[j] === '{') d++; else if (mapText[j] === '}' && !--d) break; }
    const S = require('../mapviz/lib/mapkit/sdl'), D = require('../mapviz/lib/mapkit/mapdoc');
    const { root } = S.parse(null, key, Buffer.from('{map ' + mapText.slice(i, j + 1) + '}', 'latin1'));
    const clips = D.clipsOf(S.kid(root, 'map') || root), c = clips.find(x => x.name === '[auto]') || clips[0];
    if (!c || !c.pather) return { area: null, why: 'the default clip has no pather box' };
    const p = c.pather, w = c.world || p, a = [Math.max(p[0], w[0]), Math.max(p[1], w[1]), Math.min(p[2], w[2]), Math.min(p[3], w[3])];
    if (!a.every(fin) || !(a[2] > a[0] && a[3] > a[1])) return { area: null, why: 'the pather box of the default clip is empty' };
    return { area: a, clip: c.name };
  } catch (e) { return { area: null, why: String((e && e.message) || e) }; }
}
const inBox = (a, x, y, m = 0) => x >= a[0] + m && x <= a[2] - m && y >= a[1] + m && y <= a[3] - m;
function baseIndex(v, mapRef) {
  const rel = String(mapRef).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^resource\//i, '').replace(/\/+$/, '');
  const dir = 'resource/' + (rel.toLowerCase().startsWith('map/') ? rel : 'map/' + rel);
  const ldir = dir.toLowerCase();
  if (!v.has(ldir + '/map')) no('SPMIS_NO_MAP', `${rel}: no ${dir}/map in the game or mod (a map folder holds a file named map)`);
  const files = [...v.files.keys()].filter(k => k.startsWith(ldir + '/') && !k.slice(ldir.length + 1).includes('/'));
  const points = new Map(), zones = new Map();
  let env = null;
  const put = (name, p) => { if (!points.has(name)) points.set(name, p); };
  for (const k of files.filter(f => f.endsWith('.mi')).sort()) {
    const top = tree(v.read(k).toString('latin1')).kids[0];
    if (!top) continue;
    for (const n of top.kids) {
      if (n.name === 'Environment' && !env) env = val(n);
      const x = kid(n, 'Extender'), pos = kid(n, 'Position');
      if (x && pos) { const nm = kid(x, 'name'); if (nm) put(val(nm), { x: +pos.vals[0].v, y: +pos.vals[1].v, from: 'map_point' }); }
      if (n.name !== 'Helpers') continue;
      for (const h of n.kids) {
        if (h.name === 'zone') {
          const nm = kid(h, 'Name'), p = kid(h, 'position'); if (!nm || !p) continue;
          const z = { shape: val(h), name: val(nm), x: +p.vals[0].v, y: +p.vals[1].v, z: +(p.vals[2] ? p.vals[2].v : 0),
            radius: kid(h, 'Radius') ? +val(kid(h, 'Radius')) : null, poly: h.kids.filter(q => q.name === 'Point').map(q => [+q.vals[0].v, +q.vals[1].v]) };
          if (!zones.has(z.name)) zones.set(z.name, z);
          put(z.name, { x: z.x, y: z.y, from: 'zone', zone: z.name });
        }
        if (h.name === 'waypoints') for (const w of h.kids) {
          const p = kid(w, 'position'); if (!p) continue;
          const pt = { x: +p.vals[0].v, y: +p.vals[1].v, from: 'waypoint' };
          if (val(h)) put(val(h) + '/' + w.name, pt);
          put(w.name, pt);
        }
      }
    }
  }
  const mapText = v.read(ldir + '/map').toString('latin1');
  const used = new Set((mapText.match(/\b0x[0-9a-fA-F]+\b/g) || []).map(s => parseInt(s, 16)));
  let bounds = null;
  const clips = (function find(n) { for (const k of n.kids) { if (k.name === 'Clips') return k; const r = find(k); if (r) return r; } return null; })(tree(mapText));
  if (clips) for (const c of clips.kids) { const w = kid(c, 'world'); if (w && w.vals.length >= 4) { bounds = w.vals.slice(0, 4).map(q => +q.v); break; } }
  const ar = areaOf(mapText, ldir + '/map');
  return { rel: dir.slice('resource/'.length), dir: ldir, files, points, zones, env, used, bounds, area: ar.area, areaWhy: ar.area ? '' : ar.why };
}

// ---- spec → plan
function readSpec(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { no('SPMIS_SPEC', `${file}: ${e.message}`); }
}
// model.vehOut (GoH callers): a vehicle group may be the escort or the lose.unit; its test is {state "not operatable"} / {state "operatable"}
// (stock GoH: 81 and 1428 selector uses). Without it (AS2, AS64) a vehicle group is refused as before (MIS-42).
function plan(spec, v, model) {
  const vehOut = !!(model && model.vehOut);
  if (!spec || typeof spec !== 'object') no('SPMIS_SPEC', 'spec: a JSON object');
  const name = spec.name, campaign = spec.campaign || 'spmis_custom';
  if (!name || !ID_RE.test(name)) no('SPMIS_SPEC', `name ${JSON.stringify(name)}: letters, digits, _ and - only (it is the folder and text key)`);
  if (!ID_RE.test(campaign)) no('SPMIS_SPEC', `campaign ${JSON.stringify(campaign)}: letters, digits, _ and - only`);
  if (!spec.map) no('SPMIS_SPEC', 'map: the base map folder, e.g. map/single/01_usa-skirmish/01_usa-overlord');
  const base = baseIndex(v, spec.map);
  const pl = spec.player || {}, en = spec.enemy || {};
  const objs = (spec.objectives || []).map((o, i) => ({ ...o, id: o.id || `obj_${i + 1}` }));
  if (!objs.length) no('SPMIS_SPEC', 'objectives: at least one (capture, destroy, hold, reach, survive, escort)');
  const P = { name, campaign, base, groups: [], zones: new Map(), objs, waves: [], patrols: [], reinf: [], lose: {}, texts: {}, moved: [], unitsMoved: 0, pointer: v.has('resource/entity/service/skirmish/skirmish_pointer/skirmish_pointer.def') };
  // points
  const pointOf = (ref, what, fallback) => {
    if (ref === undefined || ref === null || ref === 'auto') { if (fallback) return fallback; no('SPMIS_POINT', `${what}: "auto" has no point to spread around`); }
    if (ref === 'start') return P.start;
    if (Array.isArray(ref) && fin(ref[0]) && fin(ref[1])) return { x: ref[0], y: ref[1], from: 'xy' };
    if (ref && typeof ref === 'object' && fin(ref.x) && fin(ref.y)) return { x: ref.x, y: ref.y, from: 'xy' };
    if (typeof ref === 'string') {
      const p = base.points.get(ref) || [...base.points.entries()].find(([k]) => k.toLowerCase() === ref.toLowerCase())?.[1];
      if (p) return { ...p, name: ref };
      no('SPMIS_POINT', `${what}: "${ref}" is no zone, map_point or waypoint in ${base.rel} (${[...base.points.keys()].filter(k => !/^\d+$/.test(k)).slice(0, 12).join(' ')} ..)`);
    }
    no('SPMIS_POINT', `${what}: ${JSON.stringify(ref)} is not a name, [x,y], {x,y}, "start" or "auto"`);
  };
  const firstWp = base.points.get('player/0');
  // the walkable box (header: Where units can walk). A place outside it, or nearer its edge than the margin, goes to the nearest spot
  // inside (a zone of the map is then no longer that zone: the goal gets its own circle). Typed numbers outside the world clip are
  // refused as before, and so is any place when the box could not be read
  const A = base.area, mA = A ? Math.min(AREA_M, (A[2] - A[0]) / 4, (A[3] - A[1]) / 4) : 0, mU = Math.min(UNIT_M, mA);
  const clampA = (p, m) => ({ x: r2(Math.min(Math.max(p.x, A[0] + m), A[2] - m)), y: r2(Math.min(Math.max(p.y, A[1] + m), A[3] - m)) });
  const inside = (p, what, quiet) => {
    const b = base.bounds;
    if (b && (!A || p.from === 'xy') && (p.x < Math.min(b[0], b[2]) || p.x > Math.max(b[0], b[2]) || p.y < Math.min(b[1], b[3]) || p.y > Math.max(b[1], b[3])))
      no('SPMIS_POINT_OUTSIDE', `${what}: ${r2(p.x)},${r2(p.y)} lies outside the map's world clip ${b.join(' ')}`);
    if (!A || p.fit || inBox(A, p.x, p.y, mA)) return p;
    const c = clampA(p, mA), q = { ...p, x: c.x, y: c.y, fit: true };
    delete q.zone;
    if (!quiet) P.moved.push({ what, name: p.name || '', from: [r2(p.x), r2(p.y)], to: [c.x, c.y] });
    return q;
  };
  P.start = inside(pointOf(pl.start || (firstWp ? 'player/0' : undefined), 'player.start'), 'player.start');
  // zones an objective needs: a base zone is copied, any other point gets a circle
  const zoneFor = (o, ref, what) => {
    const p = inside(pointOf(ref, what), what);
    if (p.zone) { const z = base.zones.get(p.zone); P.zones.set(z.name, z); return { name: z.name, x: z.x, y: z.y }; }
    const z = { shape: 'circle', name: `spmis_${o.id}`, x: p.x, y: p.y, z: 0, radius: fin(o.radius) ? o.radius : ZONE_R, poly: [] };
    P.zones.set(z.name, z); return { name: z.name, x: z.x, y: z.y };
  };
  // groups
  const slots = new Map(), taken = [];
  // a unit's spot: its grid slot; when that lies outside the walkable box or on a unit placed before (any group), the nearest free
  // spot inside the box, looked for in rings of one grid step around the slot pulled into the box
  const freeAt = (p, kind) => taken.every(t => Math.hypot(t.x - p.x, t.y - p.y) >= (kind === 'human' && t.kind === 'human' ? GAP_H : GAP_V));
  const okAt = (p, kind) => (!A || inBox(A, p.x, p.y, mU)) && freeAt(p, kind);
  const place = (center, kind, i, what) => {
    const key = `${r2(center.x)},${r2(center.y)}:${kind}`, k = (slots.get(key) || 0); slots.set(key, k + 1);
    const sp = kind === 'human' ? SP_H : SP_V, col = k % 6, row = Math.floor(k / 6);
    const want = { x: r2(center.x + (col - 2.5) * sp), y: r2(center.y + (kind === 'human' ? row * sp : -(row + 1) * SP_V - 200)) };
    let at = want;
    if (!okAt(want, kind)) {
      const c = A ? clampA(want, mU) : want;
      let best = null, bd = Infinity;
      for (let r = 0; r <= 60 && !best; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q = { x: r2(c.x + dx * sp), y: r2(c.y + dy * sp) }, d = Math.hypot(q.x - want.x, q.y - want.y);
        if (d < bd && okAt(q, kind)) { best = q; bd = d; }
      }
      if (!best) no('SPMIS_POINT_OUTSIDE', `${what}: no free spot for the unit${A ? ' inside the area where units can walk' : ''} near ${want.x},${want.y}`);
      at = best; P.unitsMoved++;
    }
    taken.push({ x: at.x, y: at.y, kind });
    return at;
  };
  const gnames = new Set();
  const group = (g, side, i, extra = {}) => {
    const what = `${side}.${extra.list || 'units'}[${i}]`;
    if (!g || typeof g !== 'object' || !g.def) no('SPMIS_SPEC', `${what}: needs def (a breed such as mp/usa/rifle or an entity such as m4a3e8)`);
    const kind = resolveDef(v, g.def);
    if (!kind) no('SPMIS_DEF', `${what}: def "${g.def}" is neither set/breed/${g.def}.set nor an entity .def in the game or mod`);
    const count = g.count === undefined ? 1 : g.count;
    if (!Number.isInteger(count) || count < 1 || count > 60) no('SPMIS_SPEC', `${what}: count ${g.count}: 1 to 60`);
    const gname = g.name || `${side === 'player' ? 'p' : 'e'}${extra.list ? extra.list[0] : 'u'}${i + 1}`;
    if (!ID_RE.test(gname) || gnames.has(gname)) no('SPMIS_SPEC', `${what}: name "${gname}" must be unique, letters digits _ -`);
    gnames.add(gname);
    if (g.difficulty !== undefined && !LEVELS.includes(g.difficulty)) no('SPMIS_SPEC', `${what}: difficulty "${g.difficulty}": the lowest level the group is in, one of ${LEVELS.join(' ')}`);
    let crew = null;
    if (g.crew) {
      if (kind !== 'entity') no('SPMIS_SPEC', `${what}: crew is for an entity def (vehicle or gun)`);
      const c = typeof g.crew === 'string' ? { def: g.crew } : g.crew;
      if (resolveDef(v, c.def) !== 'human') no('SPMIS_DEF', `${what}: crew def "${c.def}" is no set/breed/<def>.set`);
      crew = { def: c.def, count: c.count || 3 };
    }
    const center = inside(extra.center || pointOf(g.at, `${what}.at`, extra.auto), `${what}.at`);
    const units = [];
    for (let n = 0; n < count; n++) {
      const u = { def: g.def, kind, ...place(center, kind, n, what) };
      units.push(u);
      if (crew) for (let c = 0; c < crew.count; c++) units.push({ def: crew.def, kind: 'human', crewOf: true, ...place(center, 'human', c, what) });
    }
    const G = { name: gname, tag: `spmis_${gname}`, side, kind, units, crew, difficulty: g.difficulty, hidden: !!extra.hidden, start: !!extra.start, role: extra.list || 'units', center };
    P.groups.push(G);
    return G;
  };
  for (const [k, list] of [['player.army', pl.army], ['enemy.army', en.army]]) if (list !== undefined && !/^[a-z]+$/.test(list)) no('SPMIS_SPEC', `${k} "${list}": an army word such as usa ger eng rus jap`);
  P.army = pl.army || 'usa';
  if (!Array.isArray(pl.units) || !pl.units.length) no('SPMIS_SPEC', 'player.units: at least one group {def, count, at}');
  // objective points first: enemy "auto" uses the first one
  const o0 = objs[0];
  const firstRef = o0.zone || o0.at || o0.to;
  P.focus = firstRef ? inside(pointOf(firstRef, 'objectives[0]'), 'objectives[0]', true) : null;
  pl.units.forEach((g, i) => group(g, 'player', i, { auto: P.start, start: true, list: 'units' }));
  (en.defenders || []).forEach((g, i) => group(g, 'enemy', i, { auto: P.focus, list: 'defenders' }));
  (en.patrols || []).forEach((g, i) => {
    if (!Array.isArray(g.route) || g.route.length < 2) no('SPMIS_SPEC', `enemy.patrols[${i}].route: two or more points`);
    const route = g.route.map((r, j) => inside(pointOf(r, `enemy.patrols[${i}].route[${j}]`), `enemy.patrols[${i}].route[${j}]`));
    const G = group({ ...g, at: undefined }, 'enemy', i, { center: route[0], list: 'patrols' });
    P.patrols.push({ group: G, route });
  });
  (en.waves || []).forEach((g, i) => {
    if (!fin(g.time) || g.time < 0) no('SPMIS_SPEC', `enemy.waves[${i}].time: seconds after the start, a number`);
    const from = inside(pointOf(g.from, `enemy.waves[${i}].from`), `enemy.waves[${i}].from`), to = inside(pointOf(g.to === undefined ? 'start' : g.to, `enemy.waves[${i}].to`), `enemy.waves[${i}].to`);
    const G = group({ ...g, at: undefined }, 'enemy', i, { center: from, hidden: true, list: 'waves' });
    P.waves.push({ group: G, to, time: g.time });
  });
  // objectives
  const pgroup = n => P.groups.find(G => G.name === n && G.side === 'player');
  for (const o of objs) {
    if (!ID_RE.test(o.id)) no('SPMIS_SPEC', `objective id "${o.id}": letters digits _ -`);
    if (!OBJ_TYPES.includes(o.type)) no('SPMIS_SPEC', `objective ${o.id}: type "${o.type}", one of ${OBJ_TYPES.join(' ')}`);
    o.primary = o.primary !== false;
    if (['capture', 'hold', 'reach'].includes(o.type)) o.z = zoneFor(o, o.zone || o.at, `objective ${o.id}.zone`);
    if (o.type === 'escort') {
      const G = pgroup(o.unit); if (!G) no('SPMIS_SPEC', `objective ${o.id}: unit "${o.unit}" is no player group name`);
      if (G.kind !== 'human' && !vehOut) no('SPMIS_UNCONFIRMED', `objective ${o.id}: escort of a vehicle group: vehicles never read dead (MIS-42), the fail test has no stock form`);
      o.g = G; o.z = zoneFor(o, o.to, `objective ${o.id}.to`);
    }
    if (['hold', 'survive'].includes(o.type) && !(fin(o.minutes) && o.minutes > 0)) no('SPMIS_SPEC', `objective ${o.id}: minutes, a number over 0`);
    if (o.type === 'destroy') {
      const names = [].concat(o.target || []);
      if (!names.length) no('SPMIS_SPEC', `objective ${o.id}: target, an enemy group name or a list`);
      o.targets = names.map(n => { const G = P.groups.find(x => x.name === n && x.side === 'enemy'); if (!G) no('SPMIS_SPEC', `objective ${o.id}: target "${n}" is no enemy group`); return G; });
      for (const G of o.targets) if (G.kind === 'entity' && !G.crew) no('SPMIS_SPEC', `objective ${o.id}: target "${G.name}" is an empty vehicle; it reads "not moveable" from placement (MIS-42), give it a crew`);
    }
    for (const G of o.targets || []) if (G.kind === 'entity' && G.difficulty && LEVELS.indexOf(G.difficulty) > 0)
      no('SPMIS_SPEC', `objective ${o.id}: target "${G.name}" is a vehicle group that is left out below ${G.difficulty}; on the lower levels the goal could never be done`);
    // a goal with no text of its own: a plain sentence with no place code in it (the goal marker shows the place)
    const mins = `${o.minutes} minute${o.minutes === 1 ? '' : 's'}`;
    o.text = o.text || ({ capture: 'Take the marked point', destroy: `Destroy ${[].concat(o.target).join(', ')}`, hold: `Hold the marked point for ${mins}`,
      reach: 'Reach the marked point', survive: `Hold out for ${mins}`, escort: `Bring ${o.unit} to the marked point` })[o.type];
  }
  // goal order: "after" = the id of an earlier goal; the goal is shown (and a hold or survive timer starts) only once that one is done
  objs.forEach((o, i) => {
    if (o.after === undefined || o.after === null || o.after === '') { delete o.after; return; }
    const j = objs.findIndex(x => x.id === o.after);
    if (j < 0 || j >= i) no('SPMIS_SPEC', `objective ${o.id}: after "${o.after}" is no earlier objective id (a goal starts at once or after an earlier goal)`);
    o.prev = objs[j];
  });
  (spec.reinforcements || []).forEach((g, i) => {
    const after = g.after;
    if (after !== undefined && !objs.some(o => o.id === after)) no('SPMIS_SPEC', `reinforcements[${i}].after: "${after}" is no objective id`);
    if (after === undefined && !(fin(g.time) && g.time >= 0)) no('SPMIS_SPEC', `reinforcements[${i}]: time (seconds) or after (an objective id)`);
    const G = group(g, 'player', i, { auto: P.start, hidden: true, list: 'reinforcements' });
    P.reinf.push({ group: G, time: g.time, after });
  });
  // lose
  const L = spec.lose || {};
  P.lose = { allDead: L.allDead !== false, unit: L.unit, minutes: L.minutes };
  if (P.lose.unit !== undefined) { const G = pgroup(P.lose.unit); if (!G) no('SPMIS_SPEC', `lose.unit "${P.lose.unit}" is no player group`); if (G.kind !== 'human' && !vehOut) no('SPMIS_UNCONFIRMED', `lose.unit "${G.name}": a vehicle group never reads dead (MIS-42)`); }
  if (P.lose.minutes !== undefined && !(fin(P.lose.minutes) && P.lose.minutes > 0)) no('SPMIS_SPEC', 'lose.minutes: a number over 0');
  if (P.lose.allDead && !P.groups.some(G => G.side === 'player' && G.start && G.units.some(u => u.kind === 'human'))) no('SPMIS_SPEC', 'lose.allDead needs a human player unit at the start (else it fires at once)');
  const failable = objs.some(o => o.primary && ['hold', 'escort'].includes(o.type));
  if (!P.lose.allDead && P.lose.unit === undefined && P.lose.minutes === undefined && !failable) no('SPMIS_NO_LOSE', 'lose: no way to lose (allDead false, no unit, no minutes, no primary hold/escort objective)');
  // texts
  const title = spec.title || name;
  P.texts = { name: title, name_big: title, date: spec.date || '', place: spec.place || '', story: spec.briefing || '', start: spec.start || 'Press "Continue" to start the battle!',
    outro_completed: spec.won || 'Mission accomplished!', outro_failed: spec.lost || 'You have been defeated!' };
  for (const o of objs) P.texts[o.id] = o.text;
  if (P.lose.minutes !== undefined) P.texts.lose_timer = spec.timerText || 'Time left';
  P.campaignTitle = spec.campaignTitle || 'Custom missions';
  P.environment = spec.environment || base.env || 'multi/multi_01';
  if (!/^[\w/.-]+$/.test(P.environment)) no('SPMIS_SPEC', `environment ${P.environment}: a set/environment name such as multi/multi_01`);
  return P;
}

// ---- writing the mission
const B = (head, ...kids) => ({ head, kids: kids.flat().filter(Boolean) });
function render(n, d = 0) {
  const t = '\t'.repeat(d);
  if (typeof n === 'string') return t + n + '\n';
  if (!n.kids.length) return `${t}{${n.head}}\n`;
  return `${t}{${n.head}\n${n.kids.map(k => render(k, d + 1)).join('')}${t}}\n`;
}
const q = s => `"${s}"`;
const term = (i, kind, ...f) => B(`"${i}.${kind}"`, ...f);
const cnt = (op, v) => B('count', `{op "${op}"}`, `{value ${v}}`);
const sel = (...f) => B('selector', ...f);
const evSet = (e, delay = 0) => B('"event"', `{event "${e}"}`, '{mode set}', `{delay ${delay}}`);
const trig = (name, cond, actions) => B(q(name), cond, B('actions', ...actions));
const cond = (terms, expr) => (terms.length ? B('condition', expr ? `{expression "${expr}"}` : null, B('terms', ...terms)) : B('condition'));
const delay = t => B('"delay"', `{time ${t}}`);
const notDeadHumans = tag => sel(`{tag ${tag}}`, '{type human}', '{state "not dead"}');
// a group is gone: no soldier of it alive; a vehicle group (GoH only, plan vehOut): every vehicle of it reads "not operatable" [T]
const goneTerm = (i, G) => (G.kind === 'human' ? term(i, 'entities', notDeadHumans(G.tag), cnt('==', 0))
  : term(i, 'entities', sel(`{tag ${G.tag}}`, '{state "not operatable"}'), cnt('==', G.units.filter(u => !u.crewOf).length)));

function missionText(P) {
  let id = FIRST_ID, mid = 0;
  const nextId = () => { while (P.base.used.has(id)) id++; return id++; };
  const ents = [], tags = [], brains = [];
  const face = (u, to) => r2(Math.atan2(to.y - u.y, to.x - u.x) * 180 / Math.PI);
  const enemyLook = P.start, playerLook = P.focus || P.start;
  for (const G of P.groups) {
    for (const u of G.units) {
      const hex = '0x' + nextId().toString(16), side = G.side === 'player' ? P_PLAYER : P_ENEMY;
      const look = G.side === 'player' ? playerLook : enemyLook;
      const fz = (look.x === u.x && look.y === u.y) ? 0 : face(u, look);
      ents.push(B(`${u.kind === 'human' ? 'Human' : 'Entity'} "${u.def}" ${hex}`, `{Position ${u.x} ${u.y}}`, `{xform zl ${fz}}`, `{Player ${side}}`, `{MID ${++mid}}`));
      const t = [];
      if (G.hidden) t.push('hidden');
      if (G.side === 'player' && G.start) t.push('player', 'player_start');
      if (G.side === 'enemy') t.push('enemy');
      t.push(u.crewOf ? G.tag + '_crew' : G.tag);
      tags.push(`{Tags ${t.map(q).join(' ')} ${hex}}`);
      if (u.kind === 'human') brains.push(B(`Brain ${hex}`, B('Properties', G.side === 'player' ? '{control user}' : null, '{move_mode hold}')));
      u.hex = hex;
    }
  }
  // goal markers, the stock form (193 in 46 stock single-player missions, e.g. 00b_usa-hurtgen): an Entity "skirmish_pointer" with only a
  // Position, tagged "pointer" + a name, and {point <name>} in the task; the game shows the marker of the goal that is current (the game
  // ). Only goals with a place get one: a marker on a unit group would hide those units. [T] not yet run
  // in the game from this tool; left out when the game or mod view has no such entity (P.pointer false)
  const ptOf = new Map();
  if (P.pointer !== false) for (const o of P.objs) if (o.z && ['capture', 'hold', 'reach', 'escort'].includes(o.type)) {
    const hex = '0x' + nextId().toString(16), nm = 'spmis_pt_' + String(o.id).replace(/[^A-Za-z0-9_]/g, '_');
    ents.push(B(`Entity "skirmish_pointer" ${hex}`, `{Position ${r2(o.z.x)} ${r2(o.z.y)}}`));
    tags.push(`{Tags "pointer" ${q(nm)} ${hex}}`); ptOf.set(o.id, nm);
  }
  // Helpers
  const events = new Set(['start', 'start_won', 'start_lost']);
  const zones = [...P.zones.values()].map(z => z.shape === 'poly'
    ? B('zone "poly"', `{position ${z.x} ${z.y} ${z.z || 0}}`, `{Name "${z.name}"}`, ...z.poly.map(p => `{Point ${p[0]} ${p[1]}}`))
    : B('zone "circle"', `{position ${z.x} ${z.y} ${z.z || 0}}`, `{Name "${z.name}"}`, `{Radius ${z.radius || ZONE_R}}`));
  const tasks = B('tasks', ...P.objs.map(o => B(q(o.id), `{desc "$/${o.id}"}`, o.primary ? '{primary}' : null, '{state hidden}', ptOf.has(o.id) ? `{point ${ptOf.get(o.id)}}` : null)));
  // camera: behind the start, looking toward the first objective; an objective at the start looks toward the first enemy group
  const s = P.start, away = p => p && Math.hypot(p.x - s.x, p.y - s.y) > 1;
  const enemyG = P.groups.find(G => G.side === 'enemy');
  const f = [P.focus, enemyG && enemyG.center].find(away) || { x: s.x, y: s.y + 1 };
  let dx = f.x - s.x, dy = f.y - s.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const cameras = B('cameras', B('"startview"', B('"key000"', `{position ${r2(s.x - dx * 500)} ${r2(s.y - dy * 500)} 500}`, `{look_at ${r2(s.x)} ${r2(s.y)} 0}`, '{fov 65}')));
  const T = [];
  T.push(trig('start', cond([]), [
    B('"fade"', '{time 5}', '{color 0xff000000}'), delay(0.01),
    B('"scenario"', B('message', '{text "$/start"}'), B('camera', '{name "startview"}', '{smooth_begin 0}', '{smooth_end 0}'), '{event_on_next "start"}', '{force_auto_complete}')]));
  const onStart = [term(1, 'event', '{id "start"}')];
  const crews = P.groups.filter(G => G.crew && !G.hidden);
  T.push(trig('reinforcements:player/start', cond(onStart), [
    delay(2),
    ...crews.map(G => B('"board"', sel(`{tag ${G.tag}_crew}`, '{type human}'), B('vehicle', `{tag ${G.tag}}`))),
    crews.length ? delay(1) : null,
    B('"autoassign"', sel('{tag player_start}')),
    B('"actor_state"', sel('{tag player_start}'), '{control user}', '{move_mode hold}', '{weapon_prepare on}')]));
  // difficulty: a group with a minimum level is deleted on the levels below it
  for (const G of P.groups.filter(x => x.difficulty && LEVELS.indexOf(x.difficulty) > 0)) {
    const below = LEVELS.slice(0, LEVELS.indexOf(G.difficulty));
    T.push(trig(`spmis:difficulty/${G.name}`, cond(below.map((l, i) => term(i + 1, 'difficulty', `{level ${l}}`)), below.length > 1 ? below.map((l, i) => i + 1).join(' | ') : null),
      [B('"delete"', sel(`{tag ${G.tag}}`)), G.crew ? B('"delete"', sel(`{tag ${G.tag}_crew}`)) : null]));
  }
  // patrols
  const wps = [];
  let wpId = 100;
  const patrolBlock = [];
  for (const p of P.patrols) {
    const ids = p.route.map(() => String(wpId++));
    p.route.forEach((pt, i) => patrolBlock.push(B(q(ids[i]), `{position ${r2(pt.x)} ${r2(pt.y)} 0}`, `{transition "${ids[(i + 1) % ids.length]}"}`)));
    const crewBoard = p.group.crew ? [B('"board"', sel(`{tag ${p.group.tag}_crew}`, '{type human}'), B('vehicle', `{tag ${p.group.tag}}`)), delay(2)] : [];
    T.push(trig(`spmis:patrol/${p.group.name}`, cond(onStart), [delay(1), ...crewBoard,
      B('"waypoint"', B('who', '{type actor}', B('actors', `{tag ${p.group.tag}}`)), B('action', '{type start}', `{waypoint "${ids[1]}"}`))]));
  }
  if (patrolBlock.length) wps.push(B('waypoints "enemy:patrol"', ...patrolBlock));
  // waves
  const attackBlock = [];
  wpId = Math.max(wpId, 500);
  for (const w of P.waves) {
    const wid = String(wpId++);
    attackBlock.push(B(q(wid), `{position ${r2(w.to.x)} ${r2(w.to.y)} 0}`));
    const G = w.group;
    T.push(trig(`spmis:wave/${G.name}`, cond(onStart), [
      delay(w.time),
      B('"entity_state"', sel(`{tag ${G.tag}}`), '{tag_remove hidden}', '{inactive off}'),
      G.crew ? B('"entity_state"', sel(`{tag ${G.tag}_crew}`), '{tag_remove hidden}', '{inactive off}') : null,
      G.crew ? delay(0.5) : null,
      G.crew ? B('"board"', sel(`{tag ${G.tag}_crew}`, '{type human}'), B('vehicle', `{tag ${G.tag}}`)) : null,
      delay(1),
      B('"actor_to_waypoint"', sel(`{tag ${G.tag}}`), `{waypoint "${wid}"}`)]));
  }
  if (attackBlock.length) wps.push(B('waypoints "enemy:attack"', ...attackBlock));
  // player reinforcements
  for (const r of P.reinf) {
    const G = r.group;
    const c = r.after ? cond([term(1, 'task', `{name "${r.after}"}`)]) : cond(onStart);
    const acts = [r.after ? delay(r.time || 1) : delay(r.time),
      B('"entity_state"', sel(`{tag ${G.tag}}`), '{tag_add player}', '{tag_remove hidden}', '{inactive off}'),
      G.crew ? B('"entity_state"', sel(`{tag ${G.tag}_crew}`), '{tag_add player}', '{tag_remove hidden}', '{inactive off}') : null,
      delay(0.5),
      G.crew ? B('"board"', sel(`{tag ${G.tag}_crew}`, '{type human}'), B('vehicle', `{tag ${G.tag}}`)) : null,
      G.crew ? delay(1) : null,
      B('"autoassign"', sel(`{tag ${G.tag}}`)),
      G.crew ? B('"autoassign"', sel(`{tag ${G.tag}_crew}`)) : null,
      B('"actor_state"', sel(`{tag ${G.tag}}`), '{control user}', '{move_mode hold}', '{weapon_prepare on}')];
    T.push(trig(`reinforcements:player/${G.name}`, c, acts));
  }
  // objectives
  const shown = (i, o) => term(i, 'task', `{name "${o.id}"}`, '{state shown}');
  for (const o of P.objs) {
    const show = [delay(3), B('"task"', `{name "${o.id}"}`), B('"sound"', '{name "mission/task_new"}')];
    if (o.type === 'hold' || o.type === 'survive') {
      const secs = Math.round(o.minutes * 60);
      events.add(`${o.id}_time`);
      show.push(B('"timer"', `{time "${secs}"}`, `{title "$/${o.id}"}`), evSet(`${o.id}_time`, secs));
    }
    // chained: the show trigger waits for the earlier goal completed (stock term task, default state completed)
    T.push(trig(`mission:objectives/${o.id}: show`, o.prev ? cond([term(1, 'task', `{name "${o.prev.id}"}`)]) : cond(onStart), show));
    const done = [B('"task"', `{name "${o.id}"}`, '{state complete}'), B('"sound"', '{name "mission/task_fulfilled"}')];
    const failA = [B('"task"', `{name "${o.id}"}`, '{state fail}'), B('"sound"', '{name "mission/task_failed"}')];
    const inZone = (i, tag, op, v) => term(i, 'entities', sel(`{tag ${tag}}`, `{zone "${o.z.name}"}`, '{type human}', '{state "not dead"}'), cnt(op, v));
    if (o.type === 'capture')
      T.push(trig(`mission:objectives/${o.id}: comp`, cond([shown(1, o), inZone(2, 'player', '>', 0),
        term(3, 'entities', sel('{player "1"}', `{zone "${o.z.name}"}`, '{type human}', '{state "not dead"}'), cnt('==', 0))], '1 & 2 & 3'), done));
    if (o.type === 'reach') T.push(trig(`mission:objectives/${o.id}: comp`, cond([shown(1, o), inZone(2, 'player', '>', 0)], '1 & 2'), done));
    if (o.type === 'escort') {
      T.push(trig(`mission:objectives/${o.id}: comp`, cond([shown(1, o), o.g.kind === 'human' ? inZone(2, o.g.tag, '>', 0)
        : term(2, 'entities', sel(`{tag ${o.g.tag}}`, `{zone "${o.z.name}"}`, '{state "operatable"}'), cnt('>', 0))], '1 & 2'), done));
      T.push(trig(`mission:objectives/${o.id}: fail`, cond([shown(1, o), goneTerm(2, o.g)], '1 & 2'), failA));
    }
    if (o.type === 'survive') T.push(trig(`mission:objectives/${o.id}: comp`, cond([shown(1, o), term(2, 'event', `{id "${o.id}_time"}`)], '1 & 2'), [B('"timer"', '{hide}', `{title "$/${o.id}"}`), ...done]));
    if (o.type === 'hold') {
      T.push(trig(`mission:objectives/${o.id}: comp`, cond([shown(1, o), term(2, 'event', `{id "${o.id}_time"}`), inZone(3, 'player', '>', 0)], '1 & 2 & 3'), [B('"timer"', '{hide}', `{title "$/${o.id}"}`), ...done]));
      T.push(trig(`mission:objectives/${o.id}: fail`, cond([shown(1, o), term(2, 'event', `{id "${o.id}_time"}`), inZone(3, 'player', '==', 0)], '1 & 2 & 3'), [B('"timer"', '{hide}', `{title "$/${o.id}"}`), ...failA]));
    }
    if (o.type === 'destroy') {
      const terms = [shown(1, o)];
      for (const G of o.targets) {
        const n = terms.length + 1;
        if (G.kind === 'human') terms.push(term(n, 'entities', sel(`{tag ${G.tag}}`, '{type human}', '{state "not dead"}'), cnt('==', 0)));
        else terms.push(term(n, 'entities', sel(`{tag ${G.tag}}`, '{state "not moveable"}'), cnt('==', G.units.filter(u => !u.crewOf).length)));
      }
      T.push(trig(`mission:objectives/${o.id}: comp`, cond(terms, terms.map((t, i) => i + 1).join(' & ')), done));
    }
  }
  // win: every primary objective done
  const prim = P.objs.filter(o => o.primary);
  const winTerms = prim.map((o, i) => term(i + 1, 'task', `{name "${o.id}"}`));
  winTerms.push(term(winTerms.length + 1, 'event', '{id "start_lost"}'));
  T.push(trig('spmis:win', cond(winTerms, [...prim.map((o, i) => String(i + 1)), '!' + winTerms.length].join(' & ')), [evSet('start_won')]));
  T.push(trig('spmis:won', cond([term(1, 'event', '{id "start_won"}')]), [delay(5), B('"gameover"', '{result win}', '{message ""}')]));
  // lose
  const loseWith = (name, terms, expr, pre = []) => T.push(trig(name, cond([...terms, term(terms.length + 1, 'event', '{id "start_won"}')], `${expr} & !${terms.length + 1}`), [...pre, evSet('start_lost')]));
  if (P.lose.allDead) loseWith('spmis:lose/all_dead', [term(1, 'event', '{id "start"}'), term(2, 'entities', notDeadHumans('player'), cnt('==', 0))], '1 & 2');
  if (P.lose.unit !== undefined) { const G = P.groups.find(x => x.name === P.lose.unit && x.side === 'player'); loseWith(`spmis:lose/unit_${G.name}`, [term(1, 'event', '{id "start"}'), goneTerm(2, G)], '1 & 2'); }
  if (P.lose.minutes !== undefined) {
    const secs = Math.round(P.lose.minutes * 60);
    events.add('spmis_timeout');
    T.push(trig('spmis:lose/timer: show', cond(onStart), [B('"timer"', `{time "${secs}"}`, '{title "$/lose_timer"}'), evSet('spmis_timeout', secs)]));
    loseWith('spmis:lose/timer', [term(1, 'event', '{id "spmis_timeout"}')], '1');
  }
  for (const o of prim.filter(x => ['hold', 'escort'].includes(x.type))) loseWith(`spmis:lose/${o.id}`, [term(1, 'task', `{name "${o.id}"}`, '{state failed}')], '1');
  T.push(trig('spmis:lost', cond([term(1, 'event', '{id "start_lost"}')]), [delay(5), B('"gameover"', '{result loose}', '{message ""}')]));
  const helpers = B('Helpers', ...[...events].map(e => `{event "${e}"}`), ...zones, tasks, cameras, B('triggers', ...T), ...wps);
  const dipl = ['1 1 2 0 1 1 1 1', '1 1 1 0 1 1 1 1', '2 1 1 0 1 1 1 1', '0 0 0 1 1 1 1 1', ...Array(4).fill('1 1 1 1 1 1 1 1')];
  const players = B('Players', '{user 0}', '{alias 0 "player"}', '{alias 1 "enemy"}', '{alias 2 "allied"}', '{alias 3 "neutral"}', B('diplomacy', ...dipl));
  const mission = B('mission', ...ents, ...tags, ...brains, `{Environment "${P.environment}"}`, helpers, players, '{Fog 1}', B('EntityManager {Enabled}'));
  // EntityManager stock is `{EntityManager {Enabled}\n}`: render gives `{EntityManager {Enabled}}`, same tree
  return render(mission);
}
const lngEsc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
const lngText = obj => `{tags\n${Object.entries(obj).map(([k, v]) => `\t{"${k}" "${lngEsc(v)}"}\n`).join('')}}\n`;
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'utf8');
// Voice files the game looks up by the mission's text path (mission/single/<c>/<m>/): "story" when Continue is pressed after loading
// (every mission, logs `Media file ".../story" not found` when absent; stock overlord has none either)
// "start" = the start message's key, said as a voice line ( SayLine), and "outro_completed" / "outro_failed"
// the game-over (stock missions ship these per mission). A generated mission has no recorded voice, so it
// gets a quarter second of silence under each name: the game finds a file and the log stays clean. [T] silent wav in game.
const VOICES = ['story', 'start', 'outro_completed', 'outro_failed'];
function silentWav(ms = 250, rate = 22050) {
  const n = Math.round(rate * ms / 1000) * 2, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36, 'ascii'); b.writeUInt32LE(n, 40);
  return b;
}

function outputs(P, v) {
  const dir = `resource/map/single/${P.campaign}/${P.name}`, out = [];
  const mi = missionText(P);
  for (const k of P.base.files) {
    const n = k.slice(P.base.dir.length + 1);
    if (n.endsWith('.mi') || n === 'interface.set' || /\.(info|mod)$/.test(n)) continue;
    if (!/^(map|map\.net|map\.ply|map\.grs|\.materials|mtl\d+\.mtl|minimap\.dds|preview\.dds|preview_small\.dds|header\.\w+|remap\.set)$/.test(n)) continue;
    let buf = v.read(k);
    if (n === 'map') {
      const t = buf.toString('latin1'), re = new RegExp(P.base.rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'gi');
      buf = Buffer.from(t.replace(re, `map/single/${P.campaign}/${P.name}`), 'latin1');
    }
    out.push({ rel: `${dir}/${n}`, buf, copied: true });
  }
  out.push({ rel: `${dir}/0.mi`, buf: crlf(mi), mi });
  out.push({ rel: `${dir}/interface.set`, buf: crlf('{location\n\t{level 0}\n\t{level_set 1}\n}\n') });
  out.push({ rel: `resource/map/single/${P.campaign}/interface.set`, buf: crlf(`{location\n\t{side ${P.army}}\n}\n`), shared: true });
  out.push({ rel: `localization/mission/single/${P.campaign}/campaign.lng`, buf: crlf(lngText({ title: '', name: P.campaignTitle })), shared: true });
  out.push({ rel: `localization/mission/single/${P.campaign}/${P.name}.lng`, buf: crlf(lngText(P.texts)) });
  const hush = silentWav();
  for (const k of VOICES) out.push({ rel: `sound/mission/single/${P.campaign}/${P.name}/${k}.wav`, buf: hush, voice: true });
  return out;
}

// the enemy groups that stand, walk or arrive at the player's start place: the player's units begin among them
function startShared(spec) {
  const pl = (spec && spec.player) || {}, en = (spec && spec.enemy) || {};
  const st = typeof pl.start === 'string' && pl.start ? pl.start.toLowerCase() : 'player/0';
  const same = r => typeof r === 'string' && (r.toLowerCase() === st || r === 'start'), out = [];
  (en.defenders || []).forEach((g, i) => { if (g && same(g.at)) out.push(g.name || `enemy.defenders[${i}]`); });
  (en.patrols || []).forEach((g, i) => { if (g && (g.route || []).some(same)) out.push(g.name || `enemy.patrols[${i}]`); });
  (en.waves || []).forEach((g, i) => { if (g && same(g.from)) out.push(g.name || `enemy.waves[${i}]`); });
  return { start: pl.start || 'player/0', groups: out };
}
const startEnemyMsg = s => `player.start "${s.start}" is also the place of enemy ${s.groups.join(', ')}: your units begin among them; pick another start`;

function generate(o, rep) {
  if (exeKey(o.exe) === 'goh') throw new Refuse('SPMIS_GOH', 'GoH single-player missions: the menu and game-over forms differ (GHUI-113, GHUI-114, GHUI-155) and no GoH SP mission was read for form; not generated', 2);
  if (!o.out) no('SPMIS_ARGS', '--out <mod folder> is needed');
  // lib/writeguard: no game files; <install>/mods/<name> is a mod folder and allowed (the game enables mods there)
  const where = refuseWrite(o.out, { game: gameDirOf(o) || undefined });
  if (where) no('SPMIS_IN_INSTALL', `--out ${o.out}: ${where}`);
  const model = loadModel(o.exe);
  // o.view (library callers): a game view of this game and mod opened before (openGame), kept by the caller; a large loose mod takes
  // half a minute to open, so the GUI card opens it once
  const v = o.view || openGame(o, o.out);
  const spec = o.specObj || readSpec(o.spec);
  const P = plan(spec, v, model);
  const files = outputs(P, v);
  const mi = files.find(f => f.mi).mi;
  const bad = unconfirmed(mi, model);
  if (bad.length) no('SPMIS_UNCONFIRMED', `forms stock never shows: ${bad.join('; ')}`);
  for (const G of P.groups) if (G.kind === 'entity' && !G.crew) rep.info(G.name, 0, 'SPMIS_EMPTY_VEHICLE', `${G.units[0].def}: placed with no crew, it starts empty (MIS-39); add "crew": "<breed>"`);
  { const sh = startShared(spec); if (sh.groups.length) rep.info('player.start', 0, 'SPMIS_START_ENEMY', startEnemyMsg(sh)); }
  if (!P.base.area) rep.info(P.base.rel + '/map', 0, 'SPMIS_AREA_UNKNOWN', `${AREA_UNKNOWN} (${P.base.areaWhy})`);
  for (const m of P.moved) rep.info(m.what, 0, 'SPMIS_MOVED', `${m.name ? '"' + m.name + '" ' : ''}${m.from.join(',')} lies outside the area where units can walk (${P.base.area.join(' ')}); moved to ${m.to.join(',')}`);
  if (P.unitsMoved) rep.info('units', 0, 'SPMIS_UNIT_MOVED', `${P.unitsMoved} unit${P.unitsMoved === 1 ? '' : 's'} moved to the nearest free spot${P.base.area ? ' inside the area where units can walk' : ''}`);
  const missionDir = path.join(o.out, 'resource', 'map', 'single', P.campaign, P.name);
  if (!o.dryRun && fs.existsSync(missionDir) && !o.force) no('SPMIS_EXISTS', `${missionDir} exists; --force to replace`);
  if (!fs.existsSync(path.join(o.out, 'mod.info'))) rep.info('mod.info', 0, 'SPMIS_NO_MODINFO', `${o.out} has no mod.info: the game lists no mod in that folder (make one with tools/newmod, or write into a mod that has one)`);
  // the manifest (MANIFEST in the mission folder): the spec, and the files and folders this generator made that were not there
  // before, so --remove takes away exactly those (a --force run over an earlier one keeps the earlier lists)
  const prev = o.dryRun ? null : readManifest(missionDir);
  const created = new Set(prev ? prev.created : []), dirs = new Set(prev ? prev.dirs : []), written = [];
  let bytes = 0;
  for (const f of files) {
    const target = path.join(o.out, f.rel);
    // never a file outside the mod folder (the names are checked letters; this is the last gate before a write)
    if (!path.resolve(target).startsWith(path.resolve(o.out) + path.sep)) no('SPMIS_ARGS', `${f.rel}: outside the mod folder, not written`);
    bytes += f.buf.length;
    if (f.shared && fs.existsSync(target) && !o.force) { rep.info(f.rel, 0, 'SPMIS_PLAN', 'kept (exists; shared by the campaign)'); continue; }
    if (o.dryRun) { rep.info(f.rel, 0, 'SPMIS_PLAN', `${f.buf.length} bytes${f.copied ? ' (copied from ' + P.base.rel + ')' : ''}`); continue; }
    if (!fs.existsSync(target)) created.add(f.rel);
    for (let d = path.posix.dirname(f.rel); d && d !== '.'; d = path.posix.dirname(d)) if (!fs.existsSync(path.join(o.out, d))) dirs.add(d);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.buf);
    written.push(f.rel);
    rep.info(f.rel, 0, 'SPMIS_WROTE', `${f.buf.length} bytes`);
  }
  if (!o.dryRun) {
    const mrel = `resource/map/single/${P.campaign}/${P.name}/${MANIFEST}`;
    if (!fs.existsSync(path.join(o.out, mrel))) created.add(mrel);
    const man = { tool: 'spmis', v: 1, mission: P.name, campaign: P.campaign, title: P.texts.name, map: P.base.rel, exe: exeKey(o.exe),
      spec, written, created: [...created].sort(), dirs: [...dirs].sort() };
    fs.writeFileSync(path.join(o.out, mrel), crlf(JSON.stringify(man, null, 1) + '\n'));
  }
  rep.info(`map/single/${P.campaign}/${P.name}`, 0, 'SPMIS_HOWTO', `[T] enable the mod, start the game: Single player > campaign "${P.campaignTitle}" > "${P.texts.name}" (scene single/${P.campaign}/${P.name}:0); then read game.log`);
  return { P, files, bytes, mi };
}

// ---- generated missions: manifest, list, remove
const MANIFEST = 'spmis.json';
function readManifest(missionDir) {
  try { const m = JSON.parse(fs.readFileSync(path.join(missionDir, MANIFEST), 'utf8')); return m && m.tool === 'spmis' && Array.isArray(m.created) ? m : null; } catch (e) { return null; }
}
// every mission of the mod this generator wrote (a manifest in resource/map/single/<campaign>/<mission>/)
function generated(mod) {
  const root = path.join(mod, 'resource', 'map', 'single'), out = [];
  let camps = []; try { camps = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch (e) { return out; }
  for (const c of camps) {
    let ms = []; try { ms = fs.readdirSync(path.join(root, c), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch (e) { continue; }
    for (const m of ms) { const man = readManifest(path.join(root, c, m)); if (man) out.push({ campaign: c, mission: m, title: man.title || m, map: man.map || '', exe: man.exe || '', spec: man.spec || null }); }
  }
  return out;
}
// takes away only what the manifest says this generator made; a campaign file (interface.set, campaign.lng) stays while another
// mission folder of that campaign is left, and passes to a generated one's manifest so its own remove takes it later
function remove(o, rep) {
  const mod = o.remove, name = o.mission;
  if (!name || !ID_RE.test(name)) no('SPMIS_ARGS', '--remove needs --mission <name>');
  const hit = generated(mod).find(g => g.mission === name);
  if (!hit) no('SPMIS_NOT_GENERATED', `${name}: no mission folder with ${MANIFEST} in ${mod}; only missions this tool wrote are removed`);
  const campDir = path.join(mod, 'resource', 'map', 'single', hit.campaign), dir = path.join(campDir, name), man = readManifest(dir);
  const others = fs.readdirSync(campDir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== name).map(d => d.name);
  const shared = new Set([`resource/map/single/${hit.campaign}/interface.set`, `localization/mission/single/${hit.campaign}/campaign.lng`]);
  const heir = others.map(m => ({ m, man: readManifest(path.join(campDir, m)) })).find(x => x.man);
  const pass = [];
  for (const rel of man.created) {
    if (!/^(resource|localization|sound)\//.test(rel) || rel.split('/').includes('..')) continue;
    if (shared.has(rel) && others.length) { pass.push(rel); rep.info(rel, 0, 'SPMIS_KEPT', 'kept: another mission of the campaign uses it'); continue; }
    const f = path.join(mod, rel);
    if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); rep.info(rel, 0, 'SPMIS_REMOVED', 'removed'); }
  }
  if (heir && pass.length) {
    const hm = heir.man, hf = path.join(campDir, heir.m, MANIFEST);
    hm.created = [...new Set(hm.created.concat(pass))].sort(); hm.dirs = [...new Set((hm.dirs || []).concat(man.dirs.filter(d => !d.startsWith(`resource/map/single/${hit.campaign}/${name}`))))].sort();
    fs.writeFileSync(hf, crlf(JSON.stringify(hm, null, 1) + '\n'));
  }
  // folders this generator made, deepest first, when empty
  for (const d of [...man.dirs].sort((a, b) => b.length - a.length)) {
    const p = path.join(mod, d);
    try { if (fs.readdirSync(p).length === 0) { fs.rmdirSync(p); rep.info(d, 0, 'SPMIS_REMOVED', 'empty folder removed'); } } catch (e) { /* gone or not empty */ }
  }
  return hit;
}

// ---- check
function check(o, rep) {
  const out = o.check, name = o.mission;
  if (!name) no('SPMIS_ARGS', '--check needs --mission <name>');
  const singles = path.join(out, 'resource', 'map', 'single');
  const camp = fs.existsSync(singles) ? fs.readdirSync(singles).find(c => fs.existsSync(path.join(singles, c, name))) : null;
  if (!camp) { rep.add(`resource/map/single/*/${name}`, 0, 'SPMIS_MISSING', 'no such mission folder in the mod'); return; }
  const rel = `resource/map/single/${camp}/${name}`, dir = path.join(out, rel);
  for (const f of ['map', '0.mi', 'interface.set', 'map.net', 'map.ply']) if (!fs.existsSync(path.join(dir, f))) rep.add(`${rel}/${f}`, 0, f === 'map' ? 'SPMIS_MENU' : 'SPMIS_MISSING', f === 'map' ? 'no map file: the folder is no mission and never shows in the menu' : 'missing');
  if (!fs.existsSync(path.join(dir, '0.mi'))) return;
  const miRel = `${rel}/0.mi`, miText = fs.readFileSync(path.join(dir, '0.mi')).toString('latin1');
  const errs = [];
  const root = sdl.parseLines(miText.split(/\r?\n/), (line, code, msg) => errs.push({ line, code, msg }));
  for (const e of errs) rep.add(miRel, e.line, 'SPMIS_PARSE', `${e.code} ${e.msg}`);
  const top = root.kids[0];
  if (!top || top.name !== 'mission') { rep.add(miRel, 1, 'SPMIS_PARSE', 'no {mission} block'); return; }
  // texts
  const lngRel = `localization/mission/single/${camp}/${name}.lng`, keys = new Set();
  const lngFile = path.join(out, lngRel);
  if (!fs.existsSync(lngFile)) rep.add(lngRel, 0, 'SPMIS_MENU', 'no mission text file: the menu shows the folder name');
  else { const r = tree(fs.readFileSync(lngFile, 'utf8')).kids[0]; if (r) for (const k of r.kids) keys.add(k.name); if (!keys.has('name')) rep.add(lngRel, 0, 'SPMIS_MENU', 'no "name" key (mission button text)'); }
  const cl = path.join(out, `localization/mission/single/${camp}/campaign.lng`);
  if (!fs.existsSync(cl) || !/\{"name"/.test(fs.readFileSync(cl, 'utf8'))) rep.add(`localization/mission/single/${camp}/campaign.lng`, 0, 'SPMIS_MENU', 'no campaign "name" key (campaign button)');
  // model forms
  try { const model = loadModel(o.exe); for (const b of unconfirmed(miText, model)) rep.add(miRel, 0, 'SPMIS_FORM', `form not seen in stock: ${b}`); } catch (e) { rep.info(miRel, 0, 'SPMIS_MODEL', e.message); }
  // ids and refs
  const H = kid(top, 'Helpers') || { kids: [] };
  const declared = { zone: new Set(), event: new Set(), task: new Set(), waypoint: new Set(), trigger: new Set() };
  for (const h of H.kids) {
    if (h.name === 'zone') { const n = kid(h, 'Name'); if (n) declared.zone.add(val(n)); }
    if (h.name === 'event') declared.event.add(val(h));
    if (h.name === 'tasks') for (const t of h.kids) declared.task.add(t.name);
    if (h.name === 'waypoints') for (const w of h.kids) declared.waypoint.add(w.name);
    if (h.name === 'triggers') for (const t of h.kids) declared.trigger.add(t.name);
  }
  const triggers = (kid(H, 'triggers') || { kids: [] }).kids;
  const setEvents = new Set();
  walk(top, (n, parent) => {
    const ref = (kind, v) => { if (!declared[kind].has(v)) rep.add(miRel, n.line, 'SPMIS_REF', `${kind} "${v}" is not defined in Helpers`); };
    if (n.name === 'zone' && parent.name !== 'Helpers' && n.vals.length && !n.kids.length) ref('zone', val(n));
    if (n.name === 'waypoint' && !n.kids.length && n.vals.length) ref('waypoint', val(n));
    if (/^\d+\.event$/.test(n.name)) { const i = kid(n, 'id'); if (i) ref('event', val(i)); }
    if (parent && parent.name === 'event' && n.name === 'event') { ref('event', val(n)); const m = kid(parent, 'mode'); if (!m || val(m) === 'set') setEvents.add(val(n)); }
    if (n.name === 'name' && parent && (parent.name === 'task' || /^\d+\.task$/.test(parent.name))) ref('task', val(n));
    if (n.name === 'text' || n.name === 'title' || n.name === 'desc') { const v = val(n); if (v.startsWith('$/') && !keys.has(v.slice(2))) rep.add(miRel, n.line, 'SPMIS_TEXT_KEY', `"${v}": no key "${v.slice(2)}" in ${lngRel}`); }
  });
  // scenario event_on_next sets its event
  walk(top, n => { if (n.name === 'event_on_next') setEvents.add(val(n)); });
  // objectives: a task some condition waits on as completed needs a trigger that completes it; a task shown needs one that ends it
  // (complete, fail or hide). Stock also uses tasks only shown then hidden, or only failed (02b_usa-bastogne sniperNN, 00b_usa-hurtgen
  // stay_alive): those are no finding (self-test over the 51 stock missions, 2026-11-20)
  const setStates = new Map(), waited = new Set();
  for (const tr of triggers) walk(tr, n => {
    const nm = n.kids.find(k => k.name === 'name'); if (!nm) return;
    const st = n.kids.find(k => k.name === 'state');
    if (n.name === 'task') { const s = setStates.get(val(nm)) || new Set(); s.add(st ? val(st) : 'show'); setStates.set(val(nm), s); }
    if (/^\d+\.task$/.test(n.name) && (!st || val(st) === 'complete' || val(st) === 'completed')) waited.add(val(nm));
  });
  for (const t of declared.task) {
    const s = setStates.get(t) || new Set();
    if (s.has('complete')) continue;
    if (waited.has(t)) rep.add(miRel, 0, 'SPMIS_OBJ_NO_TRIGGER', `task "${t}": a condition waits for it to be completed, and no trigger sets it complete`);
    else if (s.has('show') && !s.has('fail') && !s.has('hide')) rep.add(miRel, 0, 'SPMIS_OBJ_NO_TRIGGER', `task "${t}" is shown and no trigger completes, fails or hides it`);
  }
  // ends
  const ends = { win: [], loose: [] };
  for (const tr of triggers) walk(tr, n => { if (n.name === 'gameover') { const r = kid(n, 'result'); if (r) (ends[val(r)] || []).push(tr); } });
  const eventsOf = tr => { const c = kid(tr, 'condition'), e = []; if (c) walk(c, n => { if (/^\d+\.event$/.test(n.name)) { const i = kid(n, 'id'); if (i) e.push({ id: val(i), neg: false, term: n.name }); } }); return e; };
  const reach = (list, code, what) => {
    if (!list.length) { rep.add(miRel, 0, code[0], `no trigger ends the mission with gameover {result ${what}}`); return; }
    const ok = list.some(tr => { const c = kid(tr, 'condition'); const ex = c && kid(c, 'expression') ? val(kid(c, 'expression')) : '';
      return eventsOf(tr).every(e => { const num = e.term.split('.')[0]; return new RegExp('!\\s*' + num + '\\b').test(ex) || setEvents.has(e.id); }); });
    if (!ok) rep.add(miRel, 0, code[1], `the gameover ${what} trigger waits for an event no command sets`);
  };
  reach(ends.win, ['SPMIS_NO_WIN', 'SPMIS_WIN_UNREACHABLE'], 'win');
  reach(ends.loose, ['SPMIS_NO_LOSE', 'SPMIS_LOSE_UNREACHABLE'], 'loose');
  if (ends.loose.length && !setEvents.has('start_lost') && ends.loose.every(tr => eventsOf(tr).some(e => e.id === 'start_lost'))) rep.add(miRel, 0, 'SPMIS_NO_LOSE', 'nothing sets start_lost: the mission cannot be lost');
  // player units
  const tagsById = new Map();
  for (const n of top.kids) if (n.name === 'Tags') { const vs = n.vals.map(x => x.v); tagsById.set(vs[vs.length - 1], vs.slice(0, -1)); }
  const pu = top.kids.filter(n => (n.name === 'Human' || n.name === 'Entity') && n.vals[1] && (tagsById.get(n.vals[1].v) || []).includes('player'));
  let assign = false; walk(top, n => { if (n.name === 'autoassign') assign = true; });
  if (!pu.length || !assign) rep.add(miRel, 0, 'SPMIS_NO_PLAYER_UNITS', pu.length ? 'no autoassign: player units never reach the human (cooperative game)' : 'no unit tagged player');
  // positions: every unit, waypoint and generated goal zone inside the walkable box of the mission's own map file
  {
    let ar = { area: null, why: 'no map file' };
    try { ar = areaOf(fs.readFileSync(path.join(dir, 'map')).toString('latin1'), `${rel}/map`); } catch (e) { /* no map file: said above */ }
    const a = ar.area, out = (x, y) => !(fin(x) && fin(y)) || !inBox(a, x, y, -0.01);
    const xy = n => (n && n.vals.length >= 2 ? [+n.vals[0].v, +n.vals[1].v] : null);
    const bad = (line, what, p) => rep.add(miRel, line, 'SPMIS_OUTSIDE', `${what} at ${p[0]},${p[1]} is outside the area where units can walk (${a.join(' ')}): it cannot move there`);
    if (!a) rep.info(`${rel}/map`, 0, 'SPMIS_AREA_UNKNOWN', `${AREA_UNKNOWN} (${ar.why})`);
    else {
      for (const n of top.kids) if (n.name === 'Human' || n.name === 'Entity') { const p = xy(kid(n, 'Position')); if (p && out(p[0], p[1])) bad(n.line, `${n.name} "${n.vals[0] ? n.vals[0].v : ''}"`, p); }
      for (const h of H.kids) {
        if (h.name === 'waypoints') for (const w of h.kids) { const p = xy(kid(w, 'position')); if (p && out(p[0], p[1])) bad(w.line, `waypoint "${w.name}"`, p); }
        if (h.name === 'zone') { const nm = kid(h, 'Name'), p = xy(kid(h, 'position')); if (nm && /^spmis_/.test(val(nm)) && p && out(p[0], p[1])) bad(h.line, `goal zone "${val(nm)}"`, p); }
      }
    }
  }
  // the start shared with an enemy group (the spec in the manifest)
  { const man = readManifest(dir); if (man && man.spec) { const sh = startShared(man.spec); if (sh.groups.length) rep.add(`${rel}/${MANIFEST}`, 0, 'SPMIS_START_ENEMY', startEnemyMsg(sh)); } }
  // defs
  let v = null;
  try { v = o.view || openGame(o, out); } catch (e) { rep.info(miRel, 0, 'SPMIS_DEF', `defs not checked: ${e.message}`); }
  if (v) for (const n of top.kids) if ((n.name === 'Human' || n.name === 'Entity') && n.vals[0]) {
    const want = n.name === 'Human' ? 'human' : 'entity', got = resolveDef(v, n.vals[0].v);
    if (got !== want) rep.add(miRel, n.line, 'SPMIS_DEF', `${n.name} "${n.vals[0].v}": no ${want === 'human' ? 'set/breed/' + n.vals[0].v + '.set' : 'entity .def of that name'} in the game or mod`);
  }
  // milint on the mod
  if (!o.noMilint && v) {
    const args = [path.join(HERE, '..', 'milint', 'milint.js'), out, '--game', v.gameDir, '-q'];
    if (o.exe) args.push('--exe', exeKey(o.exe));
    const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 });
    const lines = String(r.stdout || '').split(/\r?\n/);
    for (const l of lines) {
      const m = /^(.+?):(\d+): ([A-Z][A-Z0-9_]+) (.*)$/.exec(l);
      if (m && m[1].replace(/\\/g, '/').toLowerCase().includes(`/${name.toLowerCase()}/`)) rep.add(m[1], +m[2], 'SPMIS_MILINT', `${m[3]} ${m[4]}`);
    }
    const tail = lines.filter(Boolean).pop() || '';
    rep.info(rel, 0, 'SPMIS_MILINT', `milint: ${tail}`);
  }
}

// ---- cli
function parseArgs(a) {
  const o = { q: false };
  for (let i = 0; i < a.length; i++) {
    const x = a[i], nx = () => a[++i];
    if (x === '--game') o.game = nx(); else if (x === '--exe') o.exe = nx(); else if (x === '--spec') o.spec = nx();
    else if (x === '--out') o.out = nx(); else if (x === '--dry-run') o.dryRun = true; else if (x === '--force') o.force = true;
    else if (x === '-q') o.q = true; else if (x === '--check') o.check = nx(); else if (x === '--mission') o.mission = nx();
    else if (x === '--list-templates') o.list = true; else if (x === '--template') o.template = nx(); else if (x === '--learn') o.learn = true;
    else if (x === '--model-out') o.modelOut = nx(); else if (x === '--no-milint') o.noMilint = true;
    else if (x === '--remove') o.remove = nx(); else if (x === '--list-generated') o.listGen = nx();
    else throw new Refuse('SPMIS_ARGS', `unknown argument ${x}`);
  }
  if (o.exe && !['as64', 'mowas_2', 'mowas2', 'goh'].includes(o.exe)) throw new Refuse('SPMIS_ARGS', `--exe ${o.exe}: as64, mowas_2 or goh`, 2);
  return o;
}
function templates() { return fs.readdirSync(TPL_DIR).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f.slice(0, -5), file: path.join(TPL_DIR, f), spec: JSON.parse(fs.readFileSync(path.join(TPL_DIR, f), 'utf8')) })); }
function main(argv) {
  const rep = createReport();
  let o;
  try {
    o = parseArgs(argv);
    if (o.list) { for (const t of templates()) console.log(`${t.name.padEnd(13)} ${t.spec.title} | ${t.spec.map} | ${t.spec.objectives.map(x => x.type).join(', ')} | ${t.file}`); return 0; }
    if (o.template) { const t = templates().find(x => x.name === o.template); if (!t) throw new Refuse('SPMIS_ARGS', `no template ${o.template}`); process.stdout.write(JSON.stringify(t.spec, null, 2) + '\n'); return 0; }
    if (o.learn) {
      if (exeKey(o.exe) === 'goh') throw new Refuse('SPMIS_GOH', 'GoH: not learned (see header)', 2);
      const { learn } = require('./learn');
      const gameDir = gameDirOf(o), file = o.modelOut || MODEL_FILE;
      let m = {}; try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { m = {}; }
      for (const exe of o.exe ? [exeKey(o.exe)] : ['as64', 'mowas_2']) { m[exe] = learn({ gameDir, exe }); console.log(`learned ${exe}: ${m[exe].missions} missions, ${m[exe].ms} ms`); }
      fs.writeFileSync(file, JSON.stringify(m, null, 1) + '\n');
      return 0;
    }
    if (o.check) { check(o, rep); rep.print({ showInfo: !o.q }); return rep.count ? 1 : 0; }
    if (o.listGen) { for (const g of generated(o.listGen)) console.log(`${g.campaign}/${g.mission} | ${g.title} | ${g.map}`); return 0; }
    if (o.remove) { const g = remove(o, rep); rep.print({ showInfo: !o.q }); if (!o.q) console.log(`removed mission single/${g.campaign}/${g.mission}`); return 0; }
    if (!o.spec && !o.specObj) throw new Refuse('SPMIS_ARGS', 'need --spec <json> (see --list-templates), --check, --learn or --list-templates');
    const r = generate(o, rep);
    rep.print({ showInfo: !o.q });
    if (!o.q) console.log(`${o.dryRun ? 'would write' : 'wrote'} ${r.files.length} files, ${r.bytes} bytes; mission single/${r.P.campaign}/${r.P.name}`);
    return 0;
  } catch (e) {
    if (!(e instanceof Refuse)) throw e;
    console.log(`${e.code} ${e.message}`);
    return e.exit;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, plan, missionText, unconfirmed, generate, check, baseIndex, areaOf, AREA_UNKNOWN, AREA_M, Refuse, templates, generated, remove, readManifest, openGame, defIndex, MANIFEST, OBJ_TYPES, LEVELS, exeKey, startShared };
