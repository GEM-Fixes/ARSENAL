// GoH mode maker: add a game mode a Gates of Hell multiplayer map lacks, in the forms the GoH install itself uses. Shared by the
// Missions page (index.js addRoute, game goh) and the guided map and mission tasks (task/recipes/map.goh.js, mission.goh.js).
// Learned from the GoH install (vfs exe goh, read only) [V 2026-11-23]:
//   - a mode of a map = resource/map/multi/<map>/<mode>.mi + <mode>.info (no map.info in 226 of 226 map folders); the lobby card
//     is set/multiplayer/games/<mode>.set, the .info overlays it; MAP-01: a .mi with no card is no mode).
//     The cards carry no class key: the card's file name is the mode name the engine registers.
//   - 363 of 363 .mi and 363 of 363 .info: CRLF only, ASCII, no BOM; no .info names its own mode; no battle_zones, ammunition,
//     evacuation or campaign .mi names its own mode (only frontlines, in the entity name obstacle_frontlines)
//   - every vanilla mode has its own includes in resource/map/multi/ (bz_events bz_vars bz_triggers for battle_zones 118 maps;
//     am_* ammunition 111; ev_* evacuation 29; dcg_* campaign 89; <N>v<N>_script frontlines 16). Between the battle_zones and the
//     ammunition mission of one map (83 maps have both) the text after the zones differs only in the three include names; bz_triggers
//     and am_triggers differ in one line. Each mode has its own objective entities:
//       battle_zones: flag_point_N (N 1..9) map points, 696 of 696 with {Tags "flag" uid}, zoneId, visor MapPoint, a fortification
//         extender (309 of 947 extenders hold no {manual} block); children by {Link child {flag "ammo"|"sandbags"}}: flagpoint_ammo
//         (supply_zone {enabled}{current 0}, TexMod optional) and flagpoint_sandbags
//       ammunition: ammo_point (1195 of 1195 order 0, visor MapPoint, no Placer, no fortification, tagged flag, each linked to one
//         ammo2 supply_zone {enabled}{current 0}), and 2 flag_point_base (213 of 222 untagged) named base_flag_a / base_flag_b,
//         zones base_a / base_b, order 0, no show / visor, a fortification whose first level is flagpoint_ammo
//         (steps 0 radius 0 angle "90" elementAngle "180" buildTime 60) in 222 of 222; 25 of them have no xform
//       evacuation: 1 evacuation_point base_flag_a, zone base_a, order 1, show All, visor MapPoint, tagged flag; ammo_point with
//         {Placer {State "ammo" {Unlinked}}}, orders 1..N, no show / visor, no links, tagged flag; .info minPlayers 8 maxPlayers 8
//         (29 of 29); the ev triggers name zone "base_a" (16 times)
//       campaign: Human crews, planes, mines, spawn_point and map_point_conquest entities and a per-map script of ~25k lines;
//       frontlines: obstacle lines per phase, flag_slave per main flag, spawn_point entities and mines
//   - every .mi and .info "global" zone: 111 of 111 ammunition, 29 of 29 evacuation (the shared triggers name zone "global")
//   - top-level uids of the .mi lie in 0x8000..0xfc00, are unique in the file and never one of the map file's (0 of 363 clash);
//     MIDs are unique in a file, max 354, with gaps in 338 files. New uid = the first free from 0x8000, new MID = above the highest.
//   - a Position with two values puts the entity on the ground (610 of 696 battle_zones flags, 1405 of 1446 ammo points): a new flag
//     needs no height (engine entity serialize Position: two values = keepHeight off). Zone polygons use x y only.
//   - zone polygons (GHMAP-03): 3661 of 3661 {zone "poly"} blocks under {Helpers} are {position x y z} {Name "n"} {Point x y} x 4..30,
//     points relative to position; every map point's {zone {radius 0} {zoneId "n"}} names one (2364 of 2364).
//   - mode families [I, not run in game]: battle_zones, armored_warfare, battle_zones_8x8, combined_arms, heroes are one family (battle zones);
//     koth is a battle zones game whose hill is the flag of the lowest order; captureflag puts a capture
//     on every map point tagged "flag"; guerrilla needs two teams and reads no map point; ammunition reads
//     base_flag_a and base_flag_b (both needed: it reads them without a check); evacuation needs two teams, base_flag_a, and team b
//     start points whose order matches each player's team position. cooperative plays a scripted mission. Defaults of every
//     parameter these read are set in the engine, so the battle_zones card serves them [I].
// Built here, in the forms above: a mode of the same class (byte copy), koth and captureflag (byte copy of a battle zones mode),
// guerrilla (a battle zones mode without its flags), ammunition and evacuation (from a battle zones mode: flags become ammo points,
// bases at numbers or at a flag), new flags with their zones (battle zones forms). Refused with the reason: frontlines, campaign,
// cooperative. Nothing here was run in game: [T].
// Author: Imperator_Aug (ARSENAL, ia-552fa278)
'use strict';

// GoH registered mode names -> engine class kind
const KIND = { battle_zones: 'bz', armored_warfare: 'bz', battle_zones_8x8: 'bz', combined_arms: 'bz', heroes: 'bz', ammunition: 'am',
  evacuation: 'ev', frontlines: 'fl', campaign_capture_the_flag: 'dcg', koth: 'koth', guerrilla: 'guerrilla', captureflag: 'captureflag', cooperative: 'cooperative' };
const NAMES = Object.keys(KIND);
const BUILT = new Set(['am', 'ev', 'koth', 'guerrilla', 'captureflag']);   // kinds built from a battle zones mode of the map
const REFUSED = { fl: 'fl', dcg: 'dcg', cooperative: 'coop' };              // kinds with no form to build (the refusal says what is missing)
const MODE_RE = /^[a-z0-9_]{1,40}$/;
const ZONE_MIN = 4, ZONE_MAX = 30, COORD_MAX = 100000;   // vanilla point counts 4..30 [V]
const cardRel = m => 'resource/set/multiplayer/games/' + m + '.set';
const sameKind = (a, b) => !!KIND[a] && KIND[a] === KIND[b];
// the mode pairs whose two modes use the same form (from, to): every ordered pair inside one class with more than one name
function pairs() { const o = []; for (const a of NAMES) for (const b of NAMES) if (a !== b && sameKind(a, b)) o.push([a, b]); return o; }

// zones text, one line each (or split by |):
//   'f1: x y, x y, x y, x y'          a new outline for a zone the mode has
//   'f5 @ x y: x y, x y, x y, x y'    a new flag at x y with its new zone f5
//   'base_a @ x y: x y, ...'          a base (ammunition: base_a and base_b; evacuation: base_a) at x y with its zone
//   'base_a = f1'                     a base at the flag of zone f1, with that zone's outline (the flag stops being a flag)
// -> [{name, pts: [[x, y]], at?: [x, y], as?: zone}] | {bad: line}
const NUM = '-?\\d+(?:\\.\\d+)?';
function parseZones(s) {
  const out = [];
  if (s == null) return out;
  if (Array.isArray(s)) s = s.join('\n');
  for (const raw of String(s).split(/[|\r\n]+/)) {
    const line = raw.trim(); if (!line) continue;
    const bad = { bad: line.slice(0, 80) };
    const as = /^([A-Za-z0-9_]{1,40})\s*=\s*([A-Za-z_][A-Za-z0-9_]{0,39})$/.exec(line);
    const m = as ? null : new RegExp('^([A-Za-z0-9_]{1,40})\\s*(?:@\\s*(' + NUM + ')\\s+(' + NUM + ')\\s*)?[:=]\\s*(.+)$').exec(line);
    if (!as && !m) return bad;
    const z = { name: (as || m)[1], pts: [] };
    if (as) z.as = as[2];
    else {
      if (m[2] != null) z.at = [+m[2], +m[3]];
      for (const p of m[4].split(/[,;]/)) {
        const xy = p.trim().split(/\s+/);
        if (xy.length !== 2 || !xy.every(v => /^-?\d+(\.\d+)?$/.test(v))) return bad;
        z.pts.push([+xy[0], +xy[1]]);
      }
    }
    if (out.some(x => x.name.toLowerCase() === z.name.toLowerCase())) return bad;
    out.push(z);
    if (out.length > 40) return bad;
  }
  return out;
}
const fmt = n => { const r = Math.round(n * 10000) / 10000; return String(Object.is(r, -0) ? 0 : r); };
function inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
// the end of the block that opens at t[i] === '{' (strings skipped), -1 if none
function blockEnd(t, i) { let d = 0; for (let j = i; j < t.length; j++) { const c = t[j]; if (c === '"') { const k = t.indexOf('"', j + 1); if (k < 0) return -1; j = k; continue; } if (c === '{') d++; else if (c === '}' && --d === 0) return j; } return -1; }
// every {zone "poly"} block: {name, at, end, pos [x y z], ind (its indentation), form (the verified form), pts}
function zonesOf(t) {
  const out = [], re = /\{zone "poly"/g; let m;
  while ((m = re.exec(t))) {
    const end = blockEnd(t, m.index); if (end < 0) break;
    const body = t.slice(m.index + m[0].length, end), lines = body.split(/\r\n/).map(s => s.trim()).filter(Boolean);
    const nm = /\{Name "([^"]*)"\}/.exec(body), pos = /\{position (-?[\d.e+-]+) (-?[\d.e+-]+) (-?[\d.e+-]+)\}/.exec(body);
    const pts = lines.filter(l => /^\{Point -?[\d.e+-]+ -?[\d.e+-]+\}$/.test(l)).length;
    const form = !!nm && !!pos && pts >= 3 && !/[^\r]\n/.test(body) && lines.every(l => /^\{(position|Name|Point) [^{}]*\}$/.test(l))
      && /^\{position /.test(lines[0] || '') && /^\{Name /.test(lines[1] || '') && lines.slice(2).every(l => /^\{Point /.test(l));
    const ls = t.lastIndexOf('\n', m.index), ind = t.slice(ls + 1, m.index);
    const P = [...body.matchAll(/\{Point (-?[\d.e+-]+) (-?[\d.e+-]+)\}/g)].map(x => [+x[1] + (pos ? +pos[1] : 0), +x[2] + (pos ? +pos[2] : 0)]);
    out.push({ name: nm ? nm[1] : null, at: m.index, end, pos: pos ? [+pos[1], +pos[2], +pos[3]] : null, form, pts, ind: /^\s*$/.test(ind) ? ind : '\t\t', abs: P });
    re.lastIndex = end;
  }
  return out;
}
// map points of the mission that name a zone: [{zone, x, y, name}]
function zonePoints(t) {
  const out = [];
  for (const s of t.split(/\r?\n\t\{Entity /).slice(1)) {
    const e = s.slice(0, 6000), z = /\{zone\r?\n\t+\{radius [\d.]+\}\r?\n\t+\{zoneId "([^"]*)"\}/.exec(e), p = /\{Position (-?[\d.e+-]+) (-?[\d.e+-]+)/.exec(e);
    if (z && p) out.push({ zone: z[1], x: +p[1], y: +p[2], name: (/^"([^"]*)"/.exec(e) || [])[1] || '' });
  }
  return out;
}
// one zone re-shaped: the Point lines of the block replaced by the new points (relative to the zone's own position), CRLF, the
// indentation of the block's first Point line
function reshape(t, z, pts) {
  const blk = t.slice(z.at, z.end), lines = blk.split('\r\n');
  const first = lines.findIndex(l => /^\s*\{Point /.test(l)), ind = /^(\s*)/.exec(lines[first])[1];
  const kept = lines.filter(l => !/^\s*\{Point /.test(l));
  const add = pts.map(([x, y]) => ind + '{Point ' + fmt(x - z.pos[0]) + ' ' + fmt(y - z.pos[1]) + '}');
  kept.splice(first, 0, ...add);
  return t.slice(0, z.at) + kept.join('\r\n') + t.slice(z.end);
}

// ---- mission text: top-level entities, links, tags, new ids (all on the .mi as latin1, CRLF)
function entsOf(t) {
  const out = [], re = /\r\n\t\{Entity "([^"]+)" (0x[0-9a-fA-F]+)/g; let m;
  while ((m = re.exec(t))) {
    const at = m.index + 2, end = blockEnd(t, at + 1); if (end < 0) break;
    const body = t.slice(at, end + 1), team = /\{team (\w+)\}/.exec(body), order = /\{order (-?\d+)\}/.exec(body), pos = /\{Position (-?[\d.e+-]+) (-?[\d.e+-]+)/.exec(body);
    out.push({ def: m[1], hex: m[2].toLowerCase(), at, end: end + 1, body, team: team ? team[1] : '', order: order ? +order[1] : null,
      zone: (/\{zoneId "([^"]*)"\}/.exec(body) || [])[1] || '', pos: pos ? [+pos[1], +pos[2]] : null, spawn: /\{visor SpawnPoint\}/.test(body) });
    re.lastIndex = end;
  }
  return out;
}
const lineRe = w => new RegExp('\\r\\n\\t\\{' + w + ' [^\\r]*', 'g');
function linksOf(t) { return [...t.matchAll(lineRe('Link'))].map(m => { const s = /^\t\{Link (0x[0-9a-fA-F]+) \{(0x[0-9a-fA-F]+) "([^"]*)"\}\}$/.exec(m[0].slice(2)); return { at: m.index, end: m.index + m[0].length, text: m[0], child: s && s[1].toLowerCase(), parent: s && s[2].toLowerCase(), kind: s && s[3] }; }); }
function tagsOf(t) { return [...t.matchAll(lineRe('Tags'))].map(m => { const s = /^\t\{Tags "([^"]*)" (0x[0-9a-fA-F]+)\}$/.exec(m[0].slice(2)); return { at: m.index, end: m.index + m[0].length, text: m[0], tag: s && s[1], uid: s && s[2].toLowerCase() }; }); }
function idsOf(t, mapTxt) {
  const used = new Set(), num = re => s => [...String(s || '').matchAll(re)].map(m => m[1]);
  for (const h of num(/\r\n\t\{\w+ "[^"]*" (0x[0-9a-fA-F]+)/g)(t).concat(num(/"[^"\r\n]*" (0x[0-9a-fA-F]+)/g)(mapTxt))) used.add(parseInt(h, 16));
  const mids = new Set(num(/\{MID (\d+)\}/g)(t).map(Number)), mapMids = new Set(num(/\{MID (\d+)\}/g)(mapTxt).map(Number));
  let u = 0x8000, mid = mids.size ? Math.max(...mids) : 0;
  return {
    uid() { while (used.has(u)) u++; if (u > 0xffff) return null; used.add(u); return '0x' + (u++).toString(16); },
    mid() { do mid++; while (mids.has(mid) || mapMids.has(mid)); mids.add(mid); return mid; }
  };
}
// a sub-block of an entity body by its opening text ('{Extender "fortification"', '{Placer'), with its own line: [from, to) or null
function subBlock(b, open) { const i = b.indexOf(open); if (i < 0) return null; const e = blockEnd(b, i); if (e < 0) return null; const ls = b.lastIndexOf('\r\n', i); return [ls, e + 1]; }
const cut = (b, r) => (r ? b.slice(0, r[0]) + b.slice(r[1]) : b);
// the fortification extender of a flag, every {manual ...} block left out (the procedural vanilla form)
function fortOf(b) {
  const r = subBlock(b, '{Extender "fortification"'); if (!r) return '';
  let f = b.slice(r[0] + 2, r[1]), k;
  while ((k = /\r\n\t+\{manual\b/.exec(f))) { const e = blockEnd(f, f.indexOf('{manual', k.index)); if (e < 0) return ''; f = f.slice(0, k.index) + f.slice(e + 1); }
  return f;
}
const MP_LINES = (name, zone, order, show) => ['\t\t{Extender "map_point"', '\t\t\t{name ' + name + '}', '\t\t\t{zone', '\t\t\t\t{radius 0}', '\t\t\t\t{zoneId "' + zone + '"}', '\t\t\t}',
  '\t\t\t{phase 0}', '\t\t\t{order ' + order + '}'].concat(show ? ['\t\t\t{show All}', '\t\t\t{visor MapPoint}'] : [], ['\t\t\t{allow', '\t\t\t\t{enableCapture}', '\t\t\t\t{enableRelease}', '\t\t\t}', '\t\t}']);
function entBlock(o) {
  return ['\t{Entity "' + o.def + '" ' + o.hex, '\t\t{Position ' + fmt(o.x) + ' ' + fmt(o.y) + '}'].concat(o.placer ? ['\t\t{Placer', '\t\t\t{State "ammo" {Unlinked}}', '\t\t}'] : [],
    MP_LINES(o.name, o.zone, o.order, o.show), o.fort ? [o.fort] : [], ['\t\t{Player 0}', '\t\t{MID ' + o.mid + '}', '\t}']).join('\r\n');
}
const baseFort = (angle, ent) => ['\t\t{Extender "fortification"', '\t\t\t{level', '\t\t\t\t{steps 0}', '\t\t\t\t{radius 0}', '\t\t\t\t{angle "' + angle + '"}', '\t\t\t\t{elementAngle "180"}',
  '\t\t\t\t{buildTime 60}', '\t\t\t\t{entity "' + ent + '"}', '\t\t\t}', '\t\t}'].join('\r\n');
const supply = (def, hex, tex) => ['\t{Entity "' + def + '" ' + hex].concat(tex ? ['\t\t{TexMod "' + tex + '"}'] : [], ['\t\t{Extender "supply_zone"', '\t\t\t{enabled}', '\t\t\t{current 0}', '\t\t}', '\t}']).join('\r\n');
function zoneBlock(ind, name, x, y, pts) {
  return [ind + '{zone "poly"', ind + '\t{position ' + fmt(x) + ' ' + fmt(y) + ' 0}', ind + '\t{Name "' + name + '"}'].concat(pts.map(([px, py]) => ind + '\t{Point ' + fmt(px - x) + ' ' + fmt(py - y) + '}'), [ind + '}']).join('\r\n');
}
// .info: set {key n} in the {game} block (replace, else add after '{game')
function setInfo(buf, key, val) {
  let t = buf.toString('latin1'); const re = new RegExp('(\\r\\n\\t+)\\{' + key + ' [^{}\\r\\n]*\\}');
  if (re.test(t)) return Buffer.from(t.replace(re, '$1{' + key + ' ' + val + '}'), 'latin1');
  const g = /\{game\r\n/.exec(t); if (!g) return null;
  t = t.slice(0, g.index + g[0].length) + '\t{' + key + ' ' + val + '}\r\n' + t.slice(g.index + g[0].length);
  return Buffer.from(t, 'latin1');
}
// apply text edits [{at, end?, s}] from the end (same position: the cut or replace first, then the inserts in the order given)
function apply(t, ops) {
  ops.forEach((o, i) => { o.i = i; });
  const span = o => (o.end != null && o.end > o.at ? 1 : 0);
  ops.sort((a, b) => b.at - a.at || span(b) - span(a) || b.i - a.i);
  let lim = Infinity;
  for (const o of ops) { const e = o.end == null ? o.at : o.end; if (e > lim) throw new Error('gohmode: overlapping edits at ' + o.at); lim = o.at; t = t.slice(0, o.at) + o.s + t.slice(e); }
  return t;
}
const INC = { am: 'am', ev: 'ev' };

// build the mission of kind `kind` (bz, am, ev, guerrilla) from a battle zones mission text with new flags `adds` and bases `bases`
// -> { t, n (flags made), why: {k, p} }
function build(t, mapTxt, kind, adds, bases) {
  const E = entsOf(t), T = tagsOf(t), L = linksOf(t), Z = zonesOf(t), ids = idsOf(t, mapTxt);
  const no = (k, p) => ({ why: { k, p: p || {} } });
  const tagged = new Set(T.filter(x => x.tag === 'flag').map(x => x.uid));
  const flags = E.filter(e => tagged.has(e.hex) && !/^base_flag_/.test((/\{name (\S+)\}/.exec(e.body) || [])[1] || ''));
  if (!E.length || !Z.length) return no('missions.s.gohform', { what: !E.length ? 'Entity' : 'zone "poly"' });
  const fset = new Set(flags.map(f => f.hex));
  if (L.some(l => !l.child && fset.size && [...fset].some(h => l.text.toLowerCase().includes(h)))) return no('missions.s.gohform', { what: 'Link' });
  const kids = h => L.filter(l => l.parent === h).map(l => ({ l, e: E.find(e => e.hex === l.child) }));
  const ops = [], entEnd = E[E.length - 1].end, linkEnd = L.length ? L[L.length - 1].end : entEnd, tagEnd = T.length ? T[T.length - 1].end : linkEnd;
  const zEnd = Z[Z.length - 1].end + 1, zInd = Z[Z.length - 1].ind;
  const newEnts = [], newLinks = [], newTags = [], newZones = [];
  const uid = () => ids.uid();
  const win = /TexMod "win"/.test(L.map(l => (E.find(e => e.hex === l.child) || {}).body || '').join(''));
  const drop = e => { ops.push({ at: e.at - 2, end: e.end, s: '' }); };
  const dropKids = h => { for (const k of kids(h)) { if (k.e) drop(k.e); ops.push({ at: k.l.at, end: k.l.end, s: '' }); } };
  // bases: 'as' at a flag (its zone outline copied, the flag and its children and tag left out)
  const baseAt = {};
  for (const b of bases) {
    if (b.as) {
      const f = flags.find(x => x.zone.toLowerCase() === b.as.toLowerCase()), z = Z.find(x => x.name && x.name.toLowerCase() === b.as.toLowerCase());
      if (!f || !z || !f.pos) return no('missions.s.gohbaseref', { base: b.name, zone: b.as });
      baseAt[b.name] = { x: f.pos[0], y: f.pos[1], pts: z.abs, from: f };
    } else baseAt[b.name] = { x: b.at[0], y: b.at[1], pts: b.pts };
  }
  const gone = new Set(Object.values(baseAt).filter(b => b.from).map(b => b.from.hex));
  for (const h of gone) { const f = flags.find(x => x.hex === h); drop(f); dropKids(h); for (const x of T.filter(x => x.uid === h)) ops.push({ at: x.at, end: x.end, s: '' }); }
  const live = flags.filter(f => !gone.has(f.hex));
  // new flags in the battle zones form: the next free flag_point_N (1..9), fortification and supply child like a sibling flag
  if (adds.length) {
    const sib = live.find(f => fortOf(f.body)) || live[0];
    const usedDefs = new Set(E.map(e => e.def));
    let order = Math.max(0, ...live.map(f => f.order || 0));
    for (const a of adds) {
      let n = 1; while (n <= 9 && usedDefs.has('flag_point_' + n)) n++;
      if (n > 9) return no('missions.s.gohzmax', { zone: a.name });
      usedDefs.add('flag_point_' + n);
      const hex = uid(); if (!hex) return no('missions.s.gohzmax', { zone: a.name });
      newEnts.push(entBlock({ def: 'flag_point_' + n, hex, x: a.at[0], y: a.at[1], name: a.name, zone: a.name, order: ++order, show: true, fort: sib ? fortOf(sib.body) : '', mid: ids.mid() }));
      newTags.push('\t{Tags "flag" ' + hex + '}');
      const ammo = sib && kids(sib.hex).find(k => k.e && /^flagpoint_ammo/.test(k.e.def));
      if (ammo) { const c = uid(); newEnts.push(ammo.e.body.replace(/^\t\{Entity "([^"]+)" 0x[0-9a-fA-F]+/, '\t{Entity "$1" ' + c)); newLinks.push('\t{Link ' + c + ' {' + hex + ' "' + ammo.l.kind + '"}}'); }
      newZones.push(zoneBlock(zInd, a.name, a.at[0], a.at[1], a.pts));
      live.push({ hex, body: '', isNew: true, kind: 'bz' });
    }
  }
  let n = live.length;
  if (kind === 'guerrilla') {
    // guerrilla reads no map point: the flags, their children, links and tags are left out (their zones stay, unused)
    for (const f of live) { if (f.isNew) continue; drop(f); dropKids(f.hex); for (const x of T.filter(x => x.uid === f.hex)) ops.push({ at: x.at, end: x.end, s: '' }); }
    if (newEnts.length) return no('missions.s.gohnoflags', { to: 'guerrilla' });
    n = 0;
  }
  if (kind === 'am' || kind === 'ev') {
    if (newEnts.length) return no('missions.s.gohnoflags', { to: kind === 'am' ? 'ammunition' : 'evacuation' });
    let ord = 0;
    for (const f of live.slice().sort((a, b) => (a.order || 0) - (b.order || 0))) {
      let b = f.body.replace(/^\t\{Entity "[^"]+"/, '\t{Entity "ammo_point"');
      b = cut(b, subBlock(b, '{Extender "fortification"')); b = cut(b, subBlock(b, '{Placer'));
      b = b.replace(/(\{order )-?\d+\}/, '$1' + (kind === 'am' ? 0 : ++ord) + '}');
      if (kind === 'am' && !/\{visor MapPoint\}/.test(b)) b = b.replace(/(\r\n\t\t\t\{order [^\r]*)/, '$1\r\n\t\t\t{show All}\r\n\t\t\t{visor MapPoint}');
      if (kind === 'ev') { b = b.replace(/\r\n\t+\{show [^\r]*/, '').replace(/\r\n\t+\{visor [^\r]*/, ''); b = b.replace(/(\r\n\t\t\{Extender "map_point")/, '\r\n\t\t{Placer\r\n\t\t\t{State "ammo" {Unlinked}}\r\n\t\t}$1'); }
      ops.push({ at: f.at, end: f.end, s: b });
      const ks = kids(f.hex); let has = false;
      for (const k of ks) {
        if (kind === 'am' && k.e && /^flagpoint_ammo/.test(k.e.def) && !has) { has = true; ops.push({ at: k.e.at, end: k.e.end, s: k.e.body.replace(/^\t\{Entity "[^"]+"/, '\t{Entity "ammo2"') }); }
        else { if (k.e) drop(k.e); ops.push({ at: k.l.at, end: k.l.end, s: '' }); }
      }
      if (kind === 'am' && !has) { const c = uid(); newEnts.push(supply('ammo2', c, win ? 'win' : '')); newLinks.push('\t{Link ' + c + ' {' + f.hex + ' "ammo"}}'); }
    }
    // the bases
    const need = kind === 'am' ? ['base_a', 'base_b'] : ['base_a'];
    for (const nm of need) {
      const b = baseAt[nm]; const hex = uid();
      if (!hex) return no('missions.s.gohzmax', { zone: nm });
      const isEv = kind === 'ev';
      newEnts.push(entBlock({ def: isEv ? 'evacuation_point' : 'flag_point_base', hex, x: b.x, y: b.y, name: 'base_flag_' + nm.slice(5), zone: nm, order: isEv ? 1 : 0, show: isEv,
        fort: baseFort(isEv ? '0' : '90', win ? 'flagpoint_ammo#win' : 'flagpoint_ammo'), mid: ids.mid() }));
      if (isEv) newTags.push('\t{Tags "flag" ' + hex + '}');
      newZones.push(zoneBlock(zInd, nm, b.x, b.y, b.pts));
    }
    // the includes of the kind
    for (const w of ['events', 'vars', 'triggers']) {
      const re = new RegExp('\\(include "\\.\\./bz_' + w + '\\.inc"\\)', 'g'), hits = [...t.matchAll(re)];
      if (hits.length !== 1) return no('missions.s.gohinc', { file: 'bz_' + w + '.inc' });
      ops.push({ at: hits[0].index, end: hits[0].index + hits[0][0].length, s: '(include "../' + INC[kind] + '_' + w + '.inc")' });
    }
  }
  const ins = (at, arr) => { if (arr.length) ops.push({ at, s: '\r\n' + arr.join('\r\n') }); };
  // the same point for entities, links and tags when the mission has none of the later ones: in that order
  ins(entEnd, newEnts); ins(linkEnd, newLinks); ins(tagEnd, newTags); ins(zEnd, newZones);
  return { t: apply(t, ops), n };
}
const baseTxt = (bs, n) => { const b = bs.find(x => x.name === n); return !b ? '' : b.as || b.at.map(fmt).join(' '); };
const flagsSeen = t => (t.match(/\{\s*visor\s+"?MapPoint"?\s*\}/gi) || []).length;
const spawnsSeen = t => (t.match(/\{\s*visor\s+"?SpawnPoint"?\s*\}/gi) || []).length;

// ---- the plan: o = { read(rel) -> Buffer|null (the mod first, then the game), srcKey (the map read), key (the map written; default
// srcKey), modes (the map's modes), from ('' = a mode the target is built from), to, zones (text or parsed list), edit (true: change
// the mode `to` the map has: new flags and outlines) }
// -> { ok, from, to, files: [[rel, Buffer]], card: bool, say: [{k, p}], why: {k, p} (the refusal), expect: {flags, spawns} }
function plan(o) {
  const say = [], out = { ok: false, from: '', to: String(o.to || ''), files: [], card: false, say };
  const no = (k, p) => Object.assign(out, { ok: false, why: { k, p: p || {} } }, { say: [{ k, p: p || {} }] });
  const to = out.to, modes = o.modes || [], srcKey = o.srcKey, key = o.key || srcKey, edit = !!o.edit;
  if (!MODE_RE.test(to) || !KIND[to]) return no('missions.s.gohname', { to: to.slice(0, 40), names: NAMES.join(', ') });
  if (modes.includes(to) && !edit) return no('missions.s.hasmode', { mode: to });
  if (edit && !modes.includes(to)) return no('missions.s.gohnofrom', { from: to, have: modes.join(', ') || '-' });
  const kTo = KIND[to], have = modes.join(', ') || '-';
  if (REFUSED[kTo]) return no('missions.s.gohneed.' + REFUSED[kTo], { to, from: '-', have });
  if (edit && !['bz', 'koth', 'captureflag'].includes(kTo)) return no('missions.s.gohedit', { to });
  // the source: the mode itself (edit), a mode of the same class, else a battle zones mode for the kinds built from one
  const can = m => edit ? m === to : (sameKind(m, to) || (BUILT.has(kTo) && KIND[m] === 'bz'));
  let from = edit ? to : String(o.from || '');
  if (from && !modes.includes(from)) return no('missions.s.gohnofrom', { from: from.slice(0, 40), have });
  if (from && !can(from)) return no(needKey(to), { to, from, have });
  if (!from) from = modes.find(m => sameKind(m, to)) || modes.find(can) || '';
  if (!from) return no(needKey(to), { to, from: '-', have });
  out.from = from;
  const mi = o.read('resource/' + srcKey + '/' + from + '.mi'), info = o.read('resource/' + srcKey + '/' + from + '.info');
  if (!mi) return no('missions.s.gohnofile', { file: from + '.mi' });
  if (!info) return no('missions.s.gohnofile', { file: from + '.info' });
  let t = mi.toString('latin1'), infoOut = info;
  let zs = o.zones;
  if (typeof zs === 'string' || zs == null) zs = parseZones(zs);
  if (zs && zs.bad != null) return no('missions.s.gohzbad', { line: zs.bad });
  const isBase = z => /^base_[ab]$/i.test(z.name);
  const shapes = zs.filter(z => !z.at && !z.as && !isBase(z)), adds = zs.filter(z => z.at && !isBase(z)), bases = zs.filter(isBase).map(z => Object.assign(z, { name: z.name.toLowerCase() }));
  if (zs.some(z => z.as && !isBase(z))) return no('missions.s.gohzbad', { line: zs.find(z => z.as && !isBase(z)).name });
  // zones given as numbers: only zones the template has and a map point names, in the verified block form
  const Z0 = zonesOf(t), P0 = zonePoints(t), zHave = [...new Set(P0.map(p => p.zone).filter(Boolean))].join(', ') || '-';
  const ptsOk = z => {
    if (z.pts.length < ZONE_MIN || z.pts.length > ZONE_MAX) return ['missions.s.gohzpts', { zone: z.name, n: z.pts.length, min: ZONE_MIN, max: ZONE_MAX }];
    if (z.pts.concat(z.at ? [z.at] : []).some(([x, y]) => !isFinite(x) || !isFinite(y) || Math.abs(x) > COORD_MAX || Math.abs(y) > COORD_MAX)) return ['missions.s.gohzbad', { line: z.name }];
    if (z.at && !inPoly(z.at[0], z.at[1], z.pts)) return ['missions.s.gohzout', { zone: z.name, point: z.name, x: fmt(z.at[0]), y: fmt(z.at[1]) }];
    return null;
  };
  for (const z of shapes) {
    const at = Z0.filter(x => x.name != null && x.name.toLowerCase() === z.name.toLowerCase());
    if (!at.length || !P0.some(p => p.zone.toLowerCase() === z.name.toLowerCase())) return no('missions.s.gohznone', { zone: z.name, have: zHave });
    if (at.length > 1 || !at[0].form) return no('missions.s.gohzform', { zone: z.name });
    const bad = ptsOk(z); if (bad) return no(bad[0], bad[1]);
    const out2 = P0.filter(p => p.zone.toLowerCase() === z.name.toLowerCase() && !inPoly(p.x, p.y, z.pts));
    if (out2.length) return no('missions.s.gohzout', { zone: z.name, point: out2[0].name, x: fmt(out2[0].x), y: fmt(out2[0].y) });
  }
  for (const z of adds.concat(bases.filter(b => !b.as))) {
    if (Z0.some(x => x.name && x.name.toLowerCase() === z.name.toLowerCase())) return no('missions.s.gohzhas', { zone: z.name });
    const bad = ptsOk(z); if (bad) return no(bad[0], bad[1]);
  }
  // bases: ammunition needs base_a and base_b, evacuation base_a, the others none
  const needB = kTo === 'am' ? ['base_a', 'base_b'] : kTo === 'ev' ? ['base_a'] : [];
  const extra = bases.find(b => !needB.includes(b.name));
  if (extra) return no('missions.s.gohbasenot', { to, base: extra.name });
  const miss = needB.filter(b => !bases.some(x => x.name === b));
  if (miss.length) return no('missions.s.gohbase', { to, need: miss.join(', ') });
  // re-shape from the end so earlier offsets stay right
  const todo = shapes.map(z => ({ z, b: zonesOf(t).find(x => x.name && x.name.toLowerCase() === z.name.toLowerCase()) })).sort((a, b) => b.b.at - a.b.at);
  for (const { z, b } of todo) t = reshape(t, b, z.pts);
  for (const z of shapes) say.push({ k: 'missions.s.gohzone', p: { zone: z.name, n: z.pts.length } });
  const kBuild = edit ? 'bz' : KIND[from] === kTo ? 'same' : kTo;
  if (kBuild !== 'same' || adds.length) {
    const mapBuf = o.read('resource/' + srcKey + '/map');
    if (!mapBuf) return no('missions.s.gohnofile', { file: 'map' });
    if (kTo === 'ev') {
      // evacuation: team b waves start at the team b start point whose order is the player's team position (1..4 for 8 players)
      const sp = entsOf(t).filter(e => e.spawn), bo = new Set(sp.filter(e => e.team === 'b').map(e => e.order)), na = sp.filter(e => e.team === 'a').length;
      if (![1, 2, 3, 4].every(i => bo.has(i)) || na < 4) return no('missions.s.gohevspawn', { a: na, b: [...bo].filter(x => x != null).sort((x, y) => x - y).join(' ') || '-' });
    }
    const b = build(t, mapBuf.toString('latin1'), kBuild === 'koth' || kBuild === 'captureflag' || kBuild === 'same' ? 'bz' : kBuild, adds, bases);
    if (b.why) return no(b.why.k, b.why.p);
    t = b.t;
    for (const a of adds) say.push({ k: 'missions.s.gohflag', p: { zone: a.name, x: fmt(a.at[0]), y: fmt(a.at[1]), n: a.pts.length } });
    if (kBuild !== 'same' && kBuild !== 'bz') say.push({ k: 'missions.s.gohbuild.' + kTo, p: { from, to, n: b.n, a: baseTxt(bases, 'base_a'), b: baseTxt(bases, 'base_b') } });
    if (kTo === 'ev') { infoOut = setInfo(info, 'minPlayers', 8); infoOut = infoOut && setInfo(infoOut, 'maxPlayers', 8); if (!infoOut) return no('missions.s.gohform', { what: from + '.info {game}' }); }
    if (b.n === 0 && kTo === 'koth') return no('missions.s.gohnoflags', { to });
  }
  const changed = shapes.length || adds.length || kBuild !== 'same';
  out.files.push(['resource/' + key + '/' + to + '.mi', changed ? Buffer.from(t, 'latin1') : mi]);
  if (!edit) out.files.push(['resource/' + key + '/' + to + '.info', infoOut]);
  out.expect = kBuild !== 'same' || adds.length ? { flags: flagsSeen(t), spawns: spawnsSeen(t) } : null;
  if (edit) { say.push({ k: 'missions.s.gohtest', p: { to } }); out.ok = true; return out; }
  if (kBuild === 'same') say.unshift({ k: 'missions.s.gohcopy', p: { from, to } });
  // the card: a mode with no set/multiplayer/games/<to>.set is no mode (MAP-01); the game's own or the mod's is kept, else the
  // card of the mode copied from goes in under the new name, byte for byte (the cards carry no class key, only generic keys) [I]
  if (!o.read(cardRel(to))) {
    const c = o.read(cardRel(from)) || o.read(cardRel('battle_zones'));
    if (!c) return no('missions.s.gohnocard', { from, to });
    out.files.push([cardRel(to), c]); out.card = true;
    say.push({ k: 'missions.s.gohcard', p: { from, to } });
  }
  // the lobby name of the mode: msgctxt "mp/game/<mode>" in interface/text/dlg_mp.pot
  const pot = o.read('resource/interface/text/dlg_mp.pot');
  if (pot && !pot.toString('utf8').includes('msgctxt "mp/game/' + to + '"')) say.push({ k: 'missions.s.gohnotitle', p: { to } });
  say.push({ k: 'missions.s.gohtest', p: { to } });
  out.ok = true;
  return out;
}
// the refusal when the map has no mode to build from: what the kind needs
const needKey = to => 'missions.s.gohneed.' + (REFUSED[KIND[to]] || (KIND[to] === 'bz' ? 'bz' : 'bzsrc'));

// read back after a write: the new mode's row of the Missions page facts against what the plan wrote (expect) or the mode it came from
function readBack(f, from, to, expect) {
  const a = f && f.modes.find(m => m.mode === from), b = f && f.modes.find(m => m.mode === to);
  if (!b || !b.mi) return { ok: false, say: { k: 'missions.s.gohbackbad', p: { mode: to } } };
  const same = expect ? b.flags === expect.flags && b.spawns === expect.spawns : !!a && a.flags === b.flags && a.spawns === b.spawns && a.players === b.players;
  return { ok: same, say: { k: same ? (expect ? 'missions.s.gohback2' : 'missions.s.gohback') : 'missions.s.gohbackbad', p: { mode: to, flags: b.flags, spawns: b.spawns, players: b.players == null ? '?' : b.players } } };
}

module.exports = { KIND, NAMES, BUILT, pairs, sameKind, parseZones, zonesOf, zonePoints, entsOf, linksOf, tagsOf, idsOf, build, plan, readBack, needKey, cardRel, fmt, inPoly, ZONE_MIN, ZONE_MAX };
