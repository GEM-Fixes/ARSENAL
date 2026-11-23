#!/usr/bin/env node
// misgen: a map's captureflag mission written from a small spec, nothing copied from another mission (MSN-5).
//   node tools/misgen/misgen.js --map <map folder> --spec <spec.json> [--out <map folder>] [--force] [-q]
//   node tools/misgen/misgen.js --check <map folder> [-q]     exit 1 on a missing clip, flag, spawn or key
//   [--exe as64|mowas_2|mowas2|goh]: the game the mission is for. as64 and mowas_2 (mowas2): the same file forms and readers (captureflag,
//     its clips: MIS-62), nothing changes. goh: refused, exit 2: GoH ships no captureflag mode card (no set/multiplayer/games/captureflag.set)
//     and no captureflag.mi to copy the form from, and GoH flags capture in a Helpers zone "poly" named by {zone {zoneId}} (GHMAP-03), not
//     zoneA/zoneB [V data: 0 zoneA in the 363 GoH MP mode files]. No game is read either way.
// spec: { "mode": "captureflag", "sides": ["a","b"],
//         "flags": [{ "x": 0, "y": 0, "name": "captureflag", "zone": 30, "z": 0 }],   exactly one; name, zone, z optional
//         "spawns": { "a": [[x,y],[x,y]], "b": [[x,y],[x,y]] },                        or {x,y,facing}; same count each side
//         "parameters": { "flag_capture_time": 20, "freezeTime": 5, "flag_release_time": 20, "flag_capture_factor": 0.5 },
//         "environment": "multi/multi_01", "prepareMargin": 200 }
// Writes in --out (default --map): captureflag.mi, captureflag.info, and `map` with the clips captureflaga, captureflagb added. No other file.
// Where each key's form comes from. stock = map/multi/2v2_plateau in resource/map.pak, read for form:
//   flag: Entity flag_point_frontlines, name zoneA zoneB phase order show visor Player MID: stock captureflag.mi; zone 30: stock 2v2 value
//   flag_ring at the flag's position: stock captureflag.mi exactly one flag:
//   spawn: Entity map_point, xform zl, name team phase order visor Player MID: stock captureflag.mi; orders 1..n, a and b equal:
//   facing: at the flag; stock a side -94 to -91, b side 86 to 88
//   Environment, Helpers reinforcements, Players count 17 + diplomacy, Fog, EntityManager: stock captureflag.mi
//   Helpers triggers: empty. Stock's environment and music triggers and its speakers are left out
//   clip names captureflaga, captureflagb: ; missing = crash at start (MIS-62)
//   clip keys world camera pather distance viewAngle: , stock `map`; camera 200 past pather: stock `map`
//   the clips hold a team during freezeTime only:
//   parameters: captureflag.info {game {parameters}}: and 426-431; names ; time MIS-63
//   maxPlayers in the .info: stock map/multi/8v8_facility/battle_zones_8x8.info; it overlays map.info
// codes: MISGEN_ARGS MISGEN_IN_INSTALL MISGEN_SPEC MISGEN_EXISTS MISGEN_NO_AUTO_CLIP, --check: MISGEN_MISSING MISGEN_PARSE MISGEN_NO_CLIP MISGEN_BAD_CLIP
//   MISGEN_NO_FLAG MISGEN_FLAG_COUNT MISGEN_FLAG_ZONE MISGEN_FLAG_PLACE MISGEN_FLAG_IN_CLIP MISGEN_NO_RING MISGEN_NO_SPAWN MISGEN_SPAWN_ORDER MISGEN_SPAWN_UNEVEN
//   MISGEN_SPAWN_PLACE MISGEN_SPAWN_CLIP MISGEN_SLOTS MISGEN_KEY; info: MISGEN_STATS MISGEN_TIME MISGEN_WROTE
// Author: Imperator_Aug (ARSENAL, ia-53f0b56e)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdl = require('../lib/sdl'), mapnet = require('../lib/mapnet'), { createReport } = require('../lib/report');
const { inInstall } = require('../mapgen/mapgen');

const TEAMS = ['a', 'b'], PARAMS = ['freezeTime', 'flag_capture_time', 'flag_release_time', 'flag_capture_factor'];
const DEFAULTS = { freezeTime: 5, flag_capture_time: 20, flag_release_time: 20, flag_capture_factor: 0.5 };   // stock set: 30, 300, 90, 0.5
const CAMERA_PAST_PATHER = 200, FIRST_ID = 0xc000;
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
class Refuse extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// ---- reading SDL ----
const tree = (buf, onErr) => sdl.parseLines(buf.toString('latin1').split(/\r?\n/), onErr);
function findBlock(node, name) {   // depth first, name as the engine compares it: exact
  for (const k of node.kids) { if (k.name === name) return k; const r = findBlock(k, name); if (r) return r; }
  return null;
}
const nums = n => (n ? n.vals.map(v => +v.v) : []);
const kid = (n, name) => n.kids.find(k => k.name === name);
function readClips(root) {
  const clips = {}, c = findBlock(root, 'Clips');
  if (c) for (const k of c.kids) {
    clips[k.name] = { world: nums(kid(k, 'world')), camera: nums(kid(k, 'camera')), pather: nums(kid(k, 'pather')), distance: nums(kid(k, 'distance')), viewAngle: nums(kid(k, 'viewAngle')) };
  }
  return clips;
}
// the end of the block opening at text[start] (a `{`), past strings and comments
function blockEnd(text, start) {
  let d = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { i++; while (i < text.length && text[i] !== '"' && text[i] !== '\n') { if (text[i] === '\\') i++; i++; } }
    else if (c === ';') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '{') d++;
    else if (c === '}' && --d === 0) return i + 1;
  }
  return -1;
}

// ---- spec ----
function readSpec(file) {
  let s; try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Refuse('MISGEN_SPEC', `${file}: ${e.message}`); }
  const no = m => { throw new Refuse('MISGEN_SPEC', m); };
  if (s.mode !== 'captureflag') no(`mode ${JSON.stringify(s.mode)}: only captureflag`);
  if (s.sides && JSON.stringify([...s.sides].sort()) !== '["a","b"]') no(`sides ${JSON.stringify(s.sides)}: the mode's teams are a and b (captureflag.set teamSettings)`);
  const fin = v => typeof v === 'number' && isFinite(v);
  if (!Array.isArray(s.flags) || s.flags.length !== 1) no(`flags: exactly one, have ${Array.isArray(s.flags) ? s.flags.length : 'none'}`);
  const f = s.flags[0];
  if (!fin(f.x) || !fin(f.y)) no('flags[0] needs numbers x and y');
  if (f.zone !== undefined && !(fin(f.zone) && f.zone > 1)) no(`flags[0].zone ${f.zone}: want a number over 1`);
  const flag = { name: f.name || 'captureflag', x: f.x, y: f.y, z: f.z, zone: f.zone === undefined ? 30 : f.zone };
  if (!/^[A-Za-z0-9_]+$/.test(flag.name)) no(`flag name ${flag.name}: word characters only`);
  const spawns = {};
  for (const t of TEAMS) {
    const l = s.spawns && s.spawns[t];
    if (!Array.isArray(l) || !l.length) no(`spawns.${t}: at least one`);
    spawns[t] = l.map((p, i) => {
      const o = Array.isArray(p) ? { x: p[0], y: p[1] } : p;
      if (!fin(o.x) || !fin(o.y)) no(`spawns.${t}[${i}] needs numbers x and y`);
      return { x: o.x, y: o.y, facing: fin(o.facing) ? o.facing : +(Math.atan2(flag.y - o.y, flag.x - o.x) * 180 / Math.PI).toFixed(2) };
    });
  }
  if (spawns.a.length !== spawns.b.length) no(`spawns: a has ${spawns.a.length}, b ${spawns.b.length}; they must match`);
  const parameters = Object.assign({}, DEFAULTS);
  for (const [k, v] of Object.entries(s.parameters || {})) {
    if (!PARAMS.includes(k)) no(`parameter ${k}: the mode reads ${PARAMS.join(' ')}; any other is dropped silently`);
    if (!fin(v)) no(`parameter ${k}: want a number`);
    parameters[k] = v;
  }
  const margin = s.prepareMargin === undefined ? 200 : s.prepareMargin;
  if (!fin(margin) || margin < 0) no('prepareMargin: a number, 0 or over');
  if (s.environment !== undefined && !/^[\w/]+$/.test(s.environment)) no(`environment ${s.environment}: a resource name such as multi/multi_01`);
  return { flag, spawns, parameters, margin, environment: s.environment || 'multi/multi_01' };
}

// ---- writing ----
function missionText(sp, usedIds) {
  let id = FIRST_ID, mid = 0;
  const nextId = () => { while (usedIds.has(id)) id++; const r = id++; return '0x' + r.toString(16); };
  const f = sp.flag, at = `{Position ${f.x} ${f.y}${f.z === undefined ? '' : ' ' + f.z}}`;
  let t = `{mission\n\t{Entity "flag_point_frontlines" ${nextId()}\n\t\t${at}\n\t\t{Extender "map_point"\n\t\t\t{name ${f.name}}\n\t\t\t{zoneA ${f.zone}}\n\t\t\t{zoneB ${f.zone}}\n\t\t\t{phase 0}\n\t\t\t{order 1}\n\t\t\t{show All}\n\t\t\t{visor MapPoint}\n\t\t}\n\t\t{Player 0}\n\t\t{MID ${++mid}}\n\t}\n`;
  t += `\t{Entity "flag_ring" ${nextId()}\n\t\t${at}\n\t}\n`;
  for (const team of TEAMS) sp.spawns[team].forEach((s, i) => {
    t += `\t{Entity "map_point" ${nextId()}\n\t\t{Position ${s.x} ${s.y}}\n\t\t{xform zl ${s.facing}}\n\t\t{Extender "map_point"\n\t\t\t{name ${team}${i + 1}}\n\t\t\t{team ${team}}\n\t\t\t{phase 0}\n\t\t\t{order ${i + 1}}\n\t\t\t{visor SpawnPoint}\n\t\t}\n\t\t{Player 0}\n\t\t{MID ${++mid}}\n\t}\n`;
  });
  const row = '\t\t\t0 ' + Array(16).fill(1).join(' ');
  const dip = ['\t\t\t1 ' + Array(16).fill(0).join(' '), ...Array(16).fill(row)].join('\n');
  t += `\t{Environment "${sp.environment}"}\n\t{Helpers\n\t\t{reinforcements\n\t\t\t{scoreTotal 0}\n\t\t\t{scoreCurrent 0}\n\t\t}\n\t\t{triggers\n\t\t}\n\t}\n\t{Players\n\t\t{count 17}\n\t\t{diplomacy\n${dip}\n\t\t}\n\t}\n\t{Fog 1}\n\t{EntityManager {Enabled}\n\t\t{CountScale "x0.5"}\n\t}\n}\n`;
  return t;
}
const infoText = sp => {
  const p = PARAMS.map(k => `${k}=${sp.parameters[k]}`).join(';');
  return `;SDL\n{game\n  {maxPlayers ${sp.spawns.a.length * 2}}\n  {parameters "${p}"}\n}\n`;
};
// a team's band of the [auto] clip: from its spawns back to the map edge, on the axis that parts the teams
function teamClip(auto, sp, team) {
  const mean = (l, k) => l.reduce((s, p) => s + p[k], 0) / l.length;
  const other = team === 'a' ? 'b' : 'a', d = k => mean(sp.spawns[team], k) - mean(sp.spawns[other], k);
  const k = Math.abs(d('y')) >= Math.abs(d('x')) ? 'y' : 'x', i = k === 'x' ? 0 : 1, high = d(k) > 0;
  const vals = sp.spawns[team].map(p => p[k]);
  const pather = [...auto.pather], camera = [...auto.camera];
  if (high) {
    pather[i] = Math.max(auto.pather[i], Math.min(...vals) - sp.margin);
    camera[i] = Math.max(auto.camera[i], pather[i] - CAMERA_PAST_PATHER);
  } else {
    pather[i + 2] = Math.min(auto.pather[i + 2], Math.max(...vals) + sp.margin);
    camera[i + 2] = Math.min(auto.camera[i + 2], pather[i + 2] + CAMERA_PAST_PATHER);
  }
  return { world: auto.world, camera, pather, distance: auto.distance, viewAngle: auto.viewAngle };
}
const clipText = (name, c) => `\t\t{"${name}"\n\t\t\t{world ${c.world.join(' ')}}\n\t\t\t{camera ${c.camera.join(' ')}}\n\t\t\t{pather ${c.pather.join(' ')}}\n\t\t\t{distance ${c.distance.join(' ')}}\n\t\t\t{viewAngle ${c.viewAngle.join(' ')}}\n\t\t}\n`;
function withClips(mapBuf, sp, force) {
  let text = mapBuf.toString('latin1');
  const root = tree(mapBuf), clips = readClips(root), auto = clips['[auto]'];
  if (!auto || auto.world.length !== 4 || auto.camera.length !== 4 || auto.pather.length !== 4) throw new Refuse('MISGEN_NO_AUTO_CLIP', 'map has no whole [auto] clip in {Clips} to cut the team clips from');
  if (!auto.distance.length) auto.distance = [200, 800];
  if (!auto.viewAngle.length) auto.viewAngle = [20, 50];
  for (const t of TEAMS) {
    const nm = 'captureflag' + t;
    if (!clips[nm]) continue;
    if (!force) throw new Refuse('MISGEN_EXISTS', `map already has clip ${nm}; --force replaces it`);
    const s = text.indexOf(`{"${nm}"`), e = blockEnd(text, s);
    let from = s; while (from > 0 && (text[from - 1] === '\t' || text[from - 1] === ' ')) from--;
    let to = e; while (text[to] === '\r' || text[to] === '\n') to++;
    text = text.slice(0, from) + text.slice(to);
  }
  const s = text.indexOf('{Clips'), e = blockEnd(text, s);
  let close = e - 1; while (close > s && (text[close - 1] === '\t' || text[close - 1] === ' ')) close--;
  const add = clipText('captureflaga', teamClip(auto, sp, 'a')) + clipText('captureflagb', teamClip(auto, sp, 'b'));
  return { buf: Buffer.from(text.slice(0, close) + add.replace(/\n/g, '\r\n') + text.slice(close), 'latin1'), clips: readClips(tree(Buffer.from(add))) };
}
function usedIds(root) {
  const ids = new Set();
  for (const k of root.kids.flatMap(n => [n, ...n.kids])) if (k.name === 'Entity' && k.vals[1]) ids.add(parseInt(k.vals[1].v, 16));
  return ids;
}
function generate(o) {
  const out = o.out || o.map, why = inInstall(out);
  if (why) throw new Refuse('MISGEN_IN_INSTALL', `--out is inside an install: ${why}. Build outside and copy into a test mod`);
  const sp = readSpec(o.spec);
  let mapB; try { mapB = fs.readFileSync(path.join(o.map, 'map')); } catch { throw new Refuse('MISGEN_ARGS', `${o.map}: no \`map\` file`); }
  const mi = path.join(out, 'captureflag.mi');
  if (fs.existsSync(mi) && !o.force) throw new Refuse('MISGEN_EXISTS', `${mi} exists; --force overwrites it`);
  const { buf } = withClips(mapB, sp, o.force);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(mi, crlf(missionText(sp, usedIds(tree(mapB)))));
  fs.writeFileSync(path.join(out, 'captureflag.info'), crlf(infoText(sp)));
  fs.writeFileSync(path.join(out, 'map'), buf);
  return { out, sp };
}

// ---- --check ----
function check(dir, rep, netDir) {
  const rd = (f, from = dir) => { try { return fs.readFileSync(path.join(from, f)); } catch { rep.add(f, 0, 'MISGEN_MISSING', `no ${f} in ${from}`); return null; } };
  const miB = rd('captureflag.mi'), mapB = rd('map'), netB = rd('map.net', netDir || dir);
  if (!miB || !mapB) return;
  const parseErr = f => (line, code, msg) => { if (!code.startsWith('WARN')) rep.add(f, line, 'MISGEN_PARSE', `${code} ${msg}`); };
  const mi = tree(miB, parseErr('captureflag.mi')), mp = tree(mapB, parseErr('map'));
  const top = mi.kids.find(k => k.name === 'mission');
  if (!top) { rep.add('captureflag.mi', 0, 'MISGEN_KEY', 'no {mission} block'); return; }
  for (const k of ['Environment', 'Players', 'Fog', 'EntityManager']) if (!kid(top, k)) rep.add('captureflag.mi', 0, 'MISGEN_KEY', `no {${k}}`);
  // clips
  const clips = readClips(mp), teamBox = {};
  for (const t of TEAMS) {
    const nm = 'captureflag' + t, c = clips[nm];
    if (!c) { rep.add('map', 0, 'MISGEN_NO_CLIP', `no clip ${nm} in {Clips}: the game crashes at start (MIS-62)`); continue; }
    const bad = ['world', 'camera', 'pather'].filter(k => c[k].length !== 4 || c[k].some(isNaN) || c[k][0] >= c[k][2] || c[k][1] >= c[k][3]);
    if (bad.length) rep.add('map', 0, 'MISGEN_BAD_CLIP', `${nm}: ${bad.join(', ')} not a box of 4 numbers`); else teamBox[t] = c.pather;
  }
  const auto = clips['[auto]'];
  const isBox = b => b && b.length === 4 && !b.some(isNaN);
  const inBox = (b, x, y) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
  // the grid, when it's readable
  let net = null;
  if (netB) { const m = mapnet.parse(netB); if (m.problems.length) rep.add('map.net', 0, 'MISGEN_MISSING', 'map.net does not parse: ' + m.problems[0].msg); else net = m; }
  const place = (code, what, x, y) => {
    if (net) {
      const c = mapnet.cellAt(net, Math.round((x + net.offX) / net.cell), Math.round((y + net.offY) / net.cell));
      if (!c) return rep.add('captureflag.mi', 0, code, `${what} at ${x},${y} is off the map`);
      if (mapnet.typeName(net, c.type) === 'no_pass') rep.add('captureflag.mi', 0, code, `${what} at ${x},${y} is on no_pass`);
    }
    if (auto && isBox(auto.pather) && !inBox(auto.pather, x, y)) rep.add('captureflag.mi', 0, code, `${what} at ${x},${y} is outside the pather clip`);
  };
  // entities
  const flags = [], spawns = { a: [], b: [] };
  let rings = [], otherTeam = 0;
  for (const e of top.kids.filter(k => k.name === 'Entity')) {
    const def = e.vals[0] ? e.vals[0].v : '', pos = nums(kid(e, 'Position')), ex = e.kids.find(k => k.name === 'Extender' && k.vals[0] && k.vals[0].v === 'map_point');
    if (def === 'flag_ring') { rings.push(pos); continue; }
    if (!ex) continue;
    const word = n => { const b = kid(ex, n); return b && b.vals[0] ? b.vals[0].v : undefined; };
    const team = word('team'), visor = word('visor');
    if (visor === 'SpawnPoint' || team !== undefined) {
      if (spawns[team]) spawns[team].push({ pos, order: +word('order'), name: word('name') });
      else { otherTeam++; rep.add('captureflag.mi', 0, 'MISGEN_NO_SPAWN', `${word('name')}: team ${team} is not a or b`); }
    } else flags.push({ def, pos, name: word('name'), zoneA: +word('zoneA'), zoneB: +word('zoneB') });
  }
  if (!flags.length) rep.add('captureflag.mi', 0, 'MISGEN_NO_FLAG', 'no flag: a map_point entity with no team (nothing to win)');
  else if (flags.length !== 1) rep.add('captureflag.mi', 0, 'MISGEN_FLAG_COUNT', `${flags.length} flags, must be 1`);
  for (const f of flags) {
    if (!(f.zoneA > 1) || !(f.zoneB > 1)) rep.add('captureflag.mi', 0, 'MISGEN_FLAG_ZONE', `flag ${f.name}: zoneA ${f.zoneA}, zoneB ${f.zoneB}; a radius of 1 or none can't be entered`);
    place('MISGEN_FLAG_PLACE', `flag ${f.name}`, f.pos[0], f.pos[1]);
    if (!rings.some(r => r[0] === f.pos[0] && r[1] === f.pos[1])) rep.add('captureflag.mi', 0, 'MISGEN_NO_RING', `no flag_ring at flag ${f.name}'s position (each stock captureflag.mi has one)`);
    for (const t of TEAMS) if (teamBox[t] && inBox(teamBox[t], f.pos[0], f.pos[1])) rep.add('map', 0, 'MISGEN_FLAG_IN_CLIP', `flag ${f.name} is inside captureflag${t}: team ${t} can sit on it during freezeTime`);
  }
  for (const t of TEAMS) {
    if (!spawns[t].length) { if (!otherTeam) rep.add('captureflag.mi', 0, 'MISGEN_NO_SPAWN', `no spawn point of team ${t}`); continue; }
    const orders = spawns[t].map(s => s.order).sort((x, y) => x - y);
    orders.forEach((o, i) => { if (o !== i + 1) rep.add('captureflag.mi', 0, 'MISGEN_SPAWN_ORDER', `team ${t}: orders ${orders.join(',')}, want 1..${orders.length}`); });
    for (const s of spawns[t]) {
      place('MISGEN_SPAWN_PLACE', `spawn ${s.name}`, s.pos[0], s.pos[1]);
      if (teamBox[t] && !inBox(teamBox[t], s.pos[0], s.pos[1])) rep.add('map', 0, 'MISGEN_SPAWN_CLIP', `spawn ${s.name} at ${s.pos[0]},${s.pos[1]} is outside captureflag${t}`);
    }
  }
  if (spawns.a.length && spawns.b.length && spawns.a.length !== spawns.b.length) rep.add('captureflag.mi', 0, 'MISGEN_SPAWN_UNEVEN', `a ${spawns.a.length}, b ${spawns.b.length} spawn points`);
  // overlays, mission file over map file as the card reads them
  let slots = null, params = null;
  for (const f of ['map.info', 'captureflag.info']) {
    let b; try { b = fs.readFileSync(path.join(dir, f)); } catch { continue; }
    const g = tree(b, parseErr(f)).kids.find(k => k.name === 'game'); if (!g) continue;
    const mx = kid(g, 'maxPlayers'), pr = kid(g, 'parameters');
    if (mx && mx.vals[0]) slots = Math.ceil(+mx.vals[0].v / 2) * 2;
    if (pr && pr.vals[0]) params = pr.vals[0].v;
  }
  const most = 2 * Math.min(spawns.a.length, spawns.b.length);
  if (slots !== null && most && slots > most) rep.add('captureflag.info', 0, 'MISGEN_SLOTS', `maxPlayers ${slots} and ${most} spawn points`);
  const t = params && /(?:^|;)flag_capture_time=([\d.]+)/.exec(params);
  rep.info('captureflag.info', 0, 'MISGEN_TIME', t ? `flag_capture_time ${t[1]} s` : 'flag_capture_time not set on this map: the game card\'s applies, stock 300 s (MIS-63)');
  rep.info('captureflag.mi', 0, 'MISGEN_STATS', `${flags.length} flag, spawns a ${spawns.a.length} b ${spawns.b.length}, slots ${slots === null ? 'card default' : slots}`);
}

function main(argv) {
  const opt = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
  const rep = createReport();
  const fin = () => { rep.print({ showInfo: !argv.includes('-q') }); process.exitCode = rep.count ? 1 : 0; };
  if (argv.includes('--exe')) {
    const games = require('../lib/games'), g = games.get(opt('exe'));
    if (!g) { console.error('misgen: --exe as64|mowas_2|mowas2|goh'); process.exitCode = 2; return; }
    if (g.kind === 'goh') return games.refuse('misgen', g, 'GoH ships no captureflag mode card or captureflag mission to copy, and its flags capture in a zone poly (zoneId), not zoneA/zoneB', 'GHMAP-03');
  }
  try {
    if (opt('check')) { check(opt('check'), rep); return fin(); }
    if (!opt('map') || !opt('spec')) { console.error('usage: misgen --map <map folder> --spec <spec.json> [--out <map folder>] [--force] [-q] | --check <map folder> [-q]'); process.exitCode = 2; return; }
    const r = generate({ map: opt('map'), spec: opt('spec'), out: opt('out'), force: argv.includes('--force') });
    check(r.out, rep, opt('map'));
    rep.info(r.out, 0, 'MISGEN_WROTE', 'captureflag.mi captureflag.info map');
  } catch (e) {
    if (!(e instanceof Refuse)) throw e;
    rep.add(opt('spec') || 'misgen', 0, e.code, e.message);
  }
  fin();
}
module.exports = { generate, check, readSpec, Refuse };
if (require.main === module) main(process.argv.slice(2));
