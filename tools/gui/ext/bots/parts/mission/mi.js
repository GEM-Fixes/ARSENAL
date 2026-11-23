// Text work of the mission part, no game and no server: read a <mode>.mi (tools/lib/sdlx, the repo's strict SDL reader), list its named
// places and the teams' start areas, build a recipe's text, put it in, list and take out what this page put in.
// Bytes: the file is handled as latin1 (one char = one byte), so cp1251 comments and strings come back unchanged; what this page adds is
// ASCII. Every addition is whole lines between two marker comments (MARK), at a line start, with the file's own line end (stock: CRLF),
// so taking it out gives back the very bytes that were there before. Up to three spots per addition: placed entities before the mission's
// {Environment line (else its {Helpers line; report gen.js puts them before Environment), Helpers items before the {triggers line,
// triggers before the line of its closing brace.
// Bot sides: never a fixed number (the side number moves between matches, "Side numbers move" [V]).
// Each addition finds the side at run time: a zone around the team's start points (map_point visor SpawnPoint, team a|b) and one detecting
// trigger per side 1..16 (recipes.js find).
// Author: Imperator_Aug (ARSENAL, ia-8802f4d4)
'use strict';
const sdlx = require('../../../../../lib/sdlx');
const { RECIPES, zoneDef, waypointsDef, varsDef, entityDef, humanDef, tagsDef } = require('./recipes');

const MARK = '; ARSENAL bots.mission';
const BEGIN = /^[ \t]*; ARSENAL bots\.mission begin ([a-e]\d+) ([a-z]+) (entities|helpers|triggers)(?: \| ([^\r\n]*))?\r?\n?$/;
const END = /^[ \t]*; ARSENAL bots\.mission end ([a-e]\d+) (entities|helpers|triggers)\r?\n?$/;
// a refusal the page words: message "<lang key>" or "<lang key> {json}" (f = the field's label key on the page, lo/hi = the allowed range)
const bad = (msg, params) => { const p = params && typeof params === 'object' && Object.keys(params).length ? params : null;
  return Object.assign(new Error(msg + (p ? ' ' + JSON.stringify(p) : '')), { status: 400, key: msg, params: p || {} }); };

// ---- reading: lite tree {name, vals, kids, line, endLine} as milint's lite (MOD blocks flattened)
function lite(b) {
  const o = { name: null, vals: [], kids: [], line: b.line, endLine: b.endLine };
  (function walk(items) {
    for (const it of items) {
      if (it.k === 'BLOCK') o.kids.push(lite(it));
      else if (it.k === 'MOD') walk(it.items);
      else if (o.name === null && !o.named && (it.k === 'IDENT' || it.k === 'STRING')) { o.name = it.k === 'STRING' ? it.value : it.text; o.named = true; }
      else o.vals.push({ k: it.k, text: it.text, value: it.k === 'STRING' ? it.value : it.value !== undefined ? it.value : it.text });
    }
  })(b.items);
  return o;
}
const lc = s => (s == null ? '' : String(s)).toLowerCase();
const kid = (n, name) => n && n.kids.find(c => lc(c.name) === lc(name));
const v0 = n => (n && n.vals.length ? n.vals[0].value : null);
const nums = n => (n ? n.vals.map(v => Number(v.value)).filter(x => isFinite(x)) : []);
// the {mission} block of a .mi (Buffer or latin1 text), or null; errors = the reader's complaints (code line msg)
function parse(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'latin1'), errors = [];
  let r = null;
  try { r = sdlx.read(b, { file: 'mission.mi', key: 'resource/map/multi/x/mission.mi', open: () => null, onError: (f, l, c, m) => errors.push({ line: l, code: c, msg: String(m || '').slice(0, 200) }) }); } catch (e) { errors.push({ line: 0, code: 'READ', msg: String(e.message || e) }); }
  const top = r ? r.root.items.filter(i => i.k === 'BLOCK').map(lite).find(n => lc(n.name) === 'mission') : null;
  return { top, errors };
}

// ---- the named places of a mission: flags and start points (map_point entities), Helpers zones and waypoints
function placesOf(buf) {
  const { top } = parse(buf), out = { mapPoints: [], zones: [], waypoints: [] };
  if (!top) return out;
  for (const e of top.kids) {
    const x = kid(e, 'Extender'), pos = nums(kid(e, 'Position'));
    if (!x || lc(v0(x)) !== 'map_point' || pos.length < 2) continue;
    const vis = lc(v0(kid(x, 'visor'))), name = v0(kid(x, 'name'));
    out.mapPoints.push({ name: name == null ? '' : String(name), entity: String(v0(e) || ''), kind: vis === 'spawnpoint' ? 'start' : vis === 'mappoint' ? 'flag' : 'point',
      team: lc(v0(kid(x, 'team'))) || '', order: Number(v0(kid(x, 'order'))) || 0, x: pos[0], y: pos[1], line: e.line });
  }
  const hel = kid(top, 'Helpers');
  if (hel) for (const h of hel.kids) {
    const n = lc(h.name);
    if (n === 'zone') {
      const nm = v0(kid(h, 'Name')), p = nums(kid(h, 'position')), r = nums(kid(h, 'Radius'));
      if (nm != null) out.zones.push({ name: String(nm), shape: lc(v0(h)) || '', x: p[0] || 0, y: p[1] || 0, z: p[2] || 0, r: r[0] || 0, line: h.line });
    } else if (n === 'waypoints') {
      for (const w of h.kids) { if (w.name == null) continue; const p = nums(kid(w, 'position')), r = nums(kid(w, 'radius'));
        out.waypoints.push({ name: String(w.name), group: String(v0(h) || ''), x: p[0] || 0, y: p[1] || 0, z: p[2] || 0, r: r[0] || 0, line: w.line }); }
    }
  }
  return out;
}

// ---- each team's start area: a circle around its start points (centre = their mean; radius = the farthest one + 600, at least 900 as the
// report's team b corner, at most 0.45 of the distance between the two teams' centres so the areas never overlap). -> {a, b} (null = none)
const round = x => Math.round(x * 10) / 10;
function startAreas(places, ground) {
  const out = { a: null, b: null };
  for (const t of ['a', 'b']) {
    const ps = (places.mapPoints || []).filter(m => m.kind === 'start' && m.team === t);
    if (!ps.length) continue;
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    out[t] = { x: round(x), y: round(y), far: Math.max(...ps.map(p => Math.hypot(p.x - x, p.y - y))), names: ps.map(p => p.name).filter(Boolean) };
  }
  const d = out.a && out.b ? Math.hypot(out.a.x - out.b.x, out.a.y - out.b.y) : 0;
  for (const t of ['a', 'b']) {
    const A = out[t]; if (!A) continue;
    let r = Math.max(A.far + 600, 900);
    if (d) r = Math.min(r, Math.max(A.far + 100, 0.45 * d));
    A.r = Math.round(r); A.z = gz(ground, A.x, A.y); delete A.far;
  }
  return out;
}
const gz = (ground, x, y) => { let h = null; try { h = ground ? ground(x, y) : null; } catch (e) { h = null; } return typeof h === 'number' && isFinite(h) && h > -1000 ? Math.round(h) : 0; };

// ---- where an addition goes
function lineStarts(text) { const s = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) s.push(i + 1); return s; }
function spots(text) {
  const { top, errors } = parse(text);
  if (!top) return { ok: false, why: 'bots.mission.e.nomission', errors };
  const hel = kid(top, 'Helpers');
  if (!hel) return { ok: false, why: 'bots.mission.e.nohelpers' };
  const trg = hel.kids.find(c => c.name === 'triggers');
  if (!trg) return { ok: false, why: 'bots.mission.e.notriggers' };
  const ls = lineStarts(text), lineOf = n => text.slice(ls[n - 1], n < ls.length ? ls[n] : text.length);
  const open = lineOf(trg.line), close = lineOf(trg.endLine);
  if (!/^[ \t]*\{\s*triggers\b/.test(open) || trg.line === trg.endLine || !/^[ \t]*\}/.test(close)) return { ok: false, why: 'bots.mission.e.layout' };
  const env = kid(top, 'Environment'), entAt = env && /^[ \t]*\{\s*Environment\b/.test(lineOf(env.line)) ? env : hel;
  const entLine = lineOf(entAt.line);
  if (!/^[ \t]*\{\s*(Environment|Helpers)\b/.test(entLine) || entAt.line >= trg.line) return { ok: false, why: 'bots.mission.e.layout' };
  const base = /^[ \t]*/.exec(open)[0], eol = /\r\n/.test(text) ? '\r\n' : '\n';
  return { ok: true, entsAt: ls[entAt.line - 1], entBase: /^[ \t]*/.exec(entLine)[0], helpersAt: ls[trg.line - 1], triggersAt: ls[trg.endLine - 1], base,
    inner: base + (base.indexOf('\t') >= 0 || !base ? '\t' : '    '), eol };
}

// ---- what this page put in a file: [{id, recipe, key, summary, p (the summary's values), parts}]
function splitLines(text) { return text.match(/[^\n]*\n|[^\n]+$/g) || []; }
const unpack = s => { const p = {}; String(s || '').split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }); return p; };
function added(text) {
  const out = new Map();
  for (const l of splitLines(text)) { const m = BEGIN.exec(l); if (!m) continue;
    const a = out.get(m[1]) || { id: m[1], recipe: m[1][0], key: m[2], summary: '', p: {}, parts: [] };
    a.parts.push(m[3]); if (m[4]) { a.summary = m[4].trim(); a.p = unpack(a.summary); } out.set(m[1], a); }
  return [...out.values()].sort((x, y) => x.recipe.localeCompare(y.recipe) || Number(x.id.slice(1)) - Number(y.id.slice(1)));
}
function nextId(text, letter) {
  let n = 0; for (const a of added(text)) if (a.recipe === letter) n = Math.max(n, Number(a.id.slice(1)) || 0);
  return letter + (n + 1);
}
// take one addition out (all its parts): {text, removed}
function remove(text, id) {
  const lines = splitLines(text), keep = [], gone = []; let inside = null, removed = 0;
  for (const l of lines) {
    if (inside) { gone.push(l); const e = END.exec(l); if (e && e[1] === id && e[2] === inside) { inside = null; removed++; } continue; }
    const b = BEGIN.exec(l);
    if (b && b[1] === id) { inside = b[3]; gone.push(l); continue; }
    keep.push(l);
  }
  if (inside) throw bad('bots.mission.e.markbroken');
  return { text: keep.join(''), removed, gone: gone.join('') };
}

// ---- build one recipe's text. places = placesOf(file) (+ .ground(x, y) -> map height or null); p = the request's values (checked here)
// -> {id, recipe, key, entities, helpers, triggers, summary, p (plain values for the page's sentence), made}
const clean = s => String(s == null ? '' : s).replace(/[^\x20-\x7e]/g, '?').replace(/[|;=]/g, '/').slice(0, 80);
const UNIT = /^[A-Za-z0-9_\-.()/]{1,80}$/;
// f = the field's label key on the page (bots.mission.<f>), so the refusal names the field by its label with the allowed range (S12)
const int = (v, lo, hi, f) => { const x = Number(v); if (!Number.isInteger(x) || x < lo || x > hi) throw bad('bots.mission.e.range', { f, lo, hi }); return x; };
const real = (v, lo, hi, f) => { const x = Number(String(v == null ? '' : v).replace(',', '.')); if (String(v == null ? '' : v).trim() === '' || !isFinite(x) || x < lo || x > hi) throw bad('bots.mission.e.range', { f, lo, hi }); return x; };
const dflt = (v, d) => (v == null || String(v).trim() === '' ? d : v);
const blank = v => v == null || String(v).trim() === '';
// a picked place: {kind:'zone'|'waypoint'|'mappoint'|'xy', name, x, y}. Named ones are read from the file again (the client's numbers are
// not trusted); xy = a spot picked on the map or typed (map units). z = the place's own height, else the map's ground there (map.net), else 0
function place(pl, places, f) {
  pl = pl || {};
  const nm = String(pl.name || '');
  if (pl.kind === 'zone') { const z = places.zones.find(x => x.name === nm); if (!z) throw bad('bots.mission.e.noplace', { f }); return { kind: 'zone', name: z.name, x: z.x, y: z.y, z: z.z || gz(places.ground, z.x, z.y), r: z.r }; }
  if (pl.kind === 'waypoint') { const w = places.waypoints.find(x => x.name === nm); if (!w) throw bad('bots.mission.e.noplace', { f }); return { kind: 'waypoint', name: w.name, x: w.x, y: w.y, z: w.z || gz(places.ground, w.x, w.y), r: w.r }; }
  if (pl.kind === 'mappoint') { const m = places.mapPoints.find(x => x.name === nm); if (!m) throw bad('bots.mission.e.noplace', { f }); return { kind: 'mappoint', name: m.name, x: m.x, y: m.y, z: gz(places.ground, m.x, m.y) }; }
  if (pl.kind === 'xy') {
    if (blank(pl.x) || blank(pl.y)) throw bad('bots.mission.e.noxy', { f });   // empty coordinates: their own plain refusal
    const x = real(pl.x, -100000, 100000, 'place.x'), y = real(pl.y, -100000, 100000, 'place.y'); return { kind: 'xy', name: '', x, y, z: gz(places.ground, x, y) };
  }
  throw bad('bots.mission.e.noplace', { f });
}
const where = pl => (pl.kind === 'xy' ? 'xy:' + round(pl.x) + ' ' + round(pl.y) : pl.kind + ':' + clean(pl.name));
function teamsOf(who, both) {
  const w = String(who || 'b').toLowerCase();
  if (w === 'a' || w === 'b') return [w];
  if (w === 'ab' && both) return ['a', 'b'];
  throw bad('bots.mission.e.who', { f: 'who' });
}
// repeats of an order: every s seconds from the first order until minute `until` (at most 30)
function againOf(p, minute) {
  const every = Number(dflt(p.every, 0));
  if (!every) return { every: 0, until: 0, again: [] };
  const e = int(every, 20, 900, 'rep.every'), until = real(dflt(p.until, minute + 15), 0, 240, 'rep.until');
  if (until <= minute) throw bad('bots.mission.e.until', { f: 'rep.until', min: minute });
  const k = Math.min(30, Math.floor((until - minute) * 60 / e));
  return { every: e, until, again: Array(k).fill(e) };
}

// opt.crewOf(unit) -> {breed, army} | null: the crew of a vehicle from its own army (index.js crewTable, recipes.crewPick); needed for c
// with a crew, refused (e.nocrew) when it gives none
function build(recipe, p, places, text, opt) {
  const R = RECIPES[recipe]; if (!R) throw bad('bots.mission.e.recipe');
  p = p || {};
  const id = nextId(text, recipe), zones = [], wps = [], vars = [], ents = [];
  const usedWp = new Set(places.waypoints.map(w => w.name)), usedZone = new Set(places.zones.map(z => z.name));
  let nextWp = 9101; const wpName = () => { while (usedWp.has(String(nextWp))) nextWp++; usedWp.add(String(nextWp)); return String(nextWp++); };
  const newZone = (tag, x, y, z, r) => { const name = 'arsenal_' + id + '_' + tag; if (usedZone.has(name)) throw bad('bots.mission.e.taken'); usedZone.add(name); zones.push({ name, x, y, z, r }); return name; };
  // a zone: a picked zone by its name; any other place gets a new round zone of radius r around it
  const zoneOf = (pl, r, tag) => (pl.kind === 'zone' ? pl.name : newZone(tag, pl.x, pl.y, pl.z, r));
  // a waypoint: a picked waypoint by its name (keep: its own radius), else a new one at the place (lift = above the ground, for spawns)
  const wpOf = (pl, r, keep, lift) => { if (pl.kind === 'waypoint' && keep) return pl.name; const name = wpName(); wps.push({ name, x: pl.x, y: pl.y, z: pl.z + (lift || 0), r }); return name; };
  const areas = () => startAreas(places, places.ground);
  const teams = list => { const A = areas(); return list.map(t => { if (!A[t]) throw bad('bots.mission.e.nostart' + t.toUpperCase());
    const v = 'arsenal_' + id + '_team' + t; vars.push(v); return { t, v, start: newZone('start' + t, A[t].x, A[t].y, A[t].z, A[t].r) }; }); };
  // the whole map (report btp_all: a circle at 0 0 0, radius 12000; larger when the map's places reach farther)
  const allZone = () => { const far = Math.max(0, ...places.mapPoints.map(m => Math.max(Math.abs(m.x), Math.abs(m.y))), ...places.zones.map(m => Math.max(Math.abs(m.x), Math.abs(m.y)))); return newZone('all', 0, 0, 0, Math.max(12000, Math.ceil(far * 1.5))); };
  // free entity ids: the report's placed id 0xe2e0, else the next ones no 0x token of the file uses
  const used = new Set((String(text).match(/\b0x[0-9a-f]+\b/gi) || []).map(h => parseInt(h, 16)));
  const uid = () => { let u = 0xe2e0; while (used.has(u)) u++; used.add(u); return '0x' + u.toString(16); };
  let o, say, crewOut = null;
  const minute = (d) => real(dflt(p.minute, d), 0, 180, 'minute');
  if (recipe === 'a') {
    const who = String(p.who || 'b'), tl = teamsOf(who, true), m = minute(1), tp = place(p.to, places, 'a.to'), rep = againOf(p, m);
    o = { id, teams: teams(tl), all: allZone(), to: wpOf(tp, 100, true), minute: m, again: rep.again };
    say = { who, min: m, to: where(tp), every: rep.again.length ? rep.every : 0, until: rep.again.length ? rep.until : 0 };
  } else if (recipe === 'b') {
    const who = String(p.who || 'b'), tl = teamsOf(who, true), zp = place(p.zone, places, 'b.at'), r = real(dflt(p.radius, 400), 20, 5000, 'radius');
    const secs = int(dflt(p.seconds, 120), 10, 3600, 'b.seconds'), every = Number(dflt(p.every, 0)), e = every ? int(every, 20, 900, 'rep.every') : 0;
    const segs = []; for (let left = secs; left > 0; left -= e || secs) segs.push(Math.min(left, e || secs));
    if (segs.length > 40) throw bad('bots.mission.e.range', { f: 'rep.every', lo: Math.ceil(secs / 40), hi: 900 });
    o = { id, teams: teams(tl), zone: zoneOf(zp, r, 'zone'), segs };
    say = { who, at: where(zp), sec: secs, every: segs.length > 1 ? e : 0 };
  } else if (recipe === 'c') {
    const who = String(p.who || 'b'), tl = teamsOf(who, false), m = minute(5), ap = place(p.at, places, 'c.at');
    const units = (Array.isArray(p.units) ? p.units : []).map(u => ({ unit: String((u && u.unit) || '').trim(), n: int(dflt(u && u.n, 1), 1, 20, 'c.count') })).filter(u => u.unit);
    if (!units.length || units.length > 12) throw bad('bots.mission.e.units');
    for (const u of units) if (!UNIT.test(u.unit) || /[()]/.test(u.unit)) throw bad('bots.mission.e.unit', { v: clean(u.unit) });
    const total = units.reduce((s, u) => s + u.n, 0), crewOn = !(p.crew === false || String(p.crew) === 'false' || String(p.crew) === '0');
    if (total > (crewOn ? 10 : 40)) throw bad('bots.mission.e.units');
    const team = teams(tl);
    let crew = null, at = '', drop;
    if (!crewOn) {
      const wr = Math.min(400, 60 + 40 * (total - 1));   // room for every new unit (report: one car, radius 20)
      at = wpOf(ap, wr, false, 4); drop = newZone('drop', ap.x, ap.y, ap.z, wr + 100);   // the new units are found again by the zone
    } else {
      // a crew: k men of the vehicle's own army (its buy card's crew, else the army's basic infantry) placed at the spot (inactive from the
      // start, report T3c), copied next to each vehicle; one group of men (own tag) per crew kind. Each vehicle has its own point and zone on
      // a ring around the spot (280 apart; zones of 120 touch neither each other nor the men in the middle)
      const k = int(dflt(p.crewN, 4), 1, 6, 'c.crewN'), R = Math.max(300, Math.ceil(total * 280 / (2 * Math.PI))), slots = [], groups = [];
      const crewOf = opt && typeof opt.crewOf === 'function' ? opt.crewOf : null;
      const gOf = unit => {
        let g = groups.find(x => x.units.indexOf(unit) >= 0); if (g) return g;
        const c = crewOf ? crewOf(unit) : null;
        if (!c || !c.breed || !UNIT.test(c.breed) || /[()]/.test(c.breed)) throw bad('bots.mission.e.nocrew', { v: clean(unit) });
        g = groups.find(x => x.breed === c.breed);
        if (!g) { g = { breed: c.breed, army: String(c.army || ''), tag: 'arsenal_' + id + '_crew' + (groups.length ? groups.length + 1 : ''), units: [] }; groups.push(g); }
        g.units.push(unit); return g;
      };
      for (const u of units) gOf(u.unit);
      for (const g of groups) for (let i = 0; i < k; i++) { const u = uid(); ents.push(humanDef(g.breed, u, ap.x, ap.y), tagsDef(g.tag, u)); }
      let i = 0;
      for (const u of units) for (let j = 0; j < u.n; j++, i++) {
        const a = 2 * Math.PI * i / total, x = round(ap.x + R * Math.cos(a)), y = round(ap.y + R * Math.sin(a)), z = gz(places.ground, x, y);
        slots.push({ unit: u.unit, tag: gOf(u.unit).tag, w: wpOf({ kind: 'xy', x, y, z }, 20, false, 4), z: newZone('v' + (i + 1), x, y, z, 120) });
      }
      crew = { k, groups, slots };
      crewOut = groups.map(g => ({ breed: g.breed, army: g.army, units: g.units.slice() }));
      drop = newZone('drop', ap.x, ap.y, ap.z, R + 220);
    }
    const then = p.then && p.then.kind ? place(p.then, places, 'c.then') : null;
    o = { id, teams: team, minute: m, at, drop, units, crew, spawned: 'arsenal_' + id + '_spawned', then: then ? wpOf(then, 100, true) : '' };
    vars.push(o.spawned);
    say = { who, min: m, units: units.map(u => u.n + 'x ' + u.unit).join(', '), at: where(ap), crew: crew ? crew.k : 0, then: then ? where(then) : '' };
  } else if (recipe === 'd') {
    const m = minute(8), ap = place(p.at, places, 'd.at'), spread = real(dflt(p.spread, ap.kind === 'zone' && ap.r ? ap.r : 200), 10, 3000, 'd.spread');
    o = { id, minute: m, at: wpOf(ap, spread, false), shells: int(dflt(p.shells, 8), 1, 40, 'd.shells') };
    say = { min: m, shells: o.shells, at: where(ap) };
  } else {
    const who = String(p.who || 'b'), tl = teamsOf(who, false), m = minute(4), ap = place(p.at, places, 'e.at'), unit = String(p.unit || '').trim();
    if (!unit) throw bad('bots.mission.e.novehicle', { f: 'e.vehicle' });
    if (!UNIT.test(unit) || /[()]/.test(unit)) throw bad('bots.mission.e.unit', { v: clean(unit) });
    const u = uid(), tag = 'arsenal_' + id + '_veh';
    ents.push(entityDef(unit, u, ap.x, ap.y), tagsDef(tag, u));
    o = { id, teams: teams(tl), all: allZone(), minute: m, amount: int(dflt(p.amount, 3), 1, 12, 'e.amount'), tag };
    say = { who, min: m, n: o.amount, unit, at: where(ap) };
  }
  const triggers = R.build(o);
  const helpers = [].concat(zones.map(zoneDef), wps.length ? [waypointsDef('arsenal_' + id, wps)] : [], vars.length ? [varsDef(vars)] : []);
  const summary = Object.keys(say).filter(k => say[k] !== '' && say[k] !== 0).map(k => k + '=' + clean(say[k])).join(';');
  return { id, recipe, key: R.key, entities: ents, helpers, triggers, summary, p: unpack(summary), crew: crewOut,
    made: { zones: zones.map(z => z.name), waypoints: wps.map(w => w.name), vars, entities: ents.length / 2 } };
}

// ---- put a built recipe into the text: -> {text, added (only the new lines, as they go in)}
function insert(text, b) {
  const sp = spots(text);
  if (!sp.ok) throw bad(sp.why);
  const E = sp.eol, wrap = (pre, part, lines, sum) => (lines.length ? [pre + MARK + ' begin ' + b.id + ' ' + b.key + ' ' + part + (sum ? ' | ' + sum : '')].concat(lines.map(l => pre + l), [pre + MARK + ' end ' + b.id + ' ' + part]).join(E) + E : '');
  const el = wrap(sp.entBase, 'entities', b.entities || [], ''), hl = wrap(sp.base, 'helpers', b.helpers, ''), tl = wrap(sp.inner, 'triggers', b.triggers, b.summary);
  // entsAt < helpersAt < triggersAt: the later spot first, so the earlier offsets still hold
  let out = text.slice(0, sp.triggersAt) + tl + text.slice(sp.triggersAt);
  if (hl) out = out.slice(0, sp.helpersAt) + hl + out.slice(sp.helpersAt);
  if (el) out = out.slice(0, sp.entsAt) + el + out.slice(sp.entsAt);
  return { text: out, added: el + hl + tl };
}
// include lines of a mission (they come from the game: the mod's copy sits at the same path, so a relative include still finds them)
const includesOf = text => [...String(text).replace(/;[^\n]*/g, '').matchAll(/\binclude\s+"([^"]+)"/gi)].map(m => m[1]);

module.exports = { MARK, parse, placesOf, startAreas, spots, added, nextId, remove, build, insert, includesOf, lite, unpack };
