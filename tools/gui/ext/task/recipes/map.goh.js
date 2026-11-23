// recipe "map", the Gates of Hell branch (game parity 2026-11-23): copy a GoH multiplayer map into the mod, or change one in place,
// in the forms the GoH install itself uses. Read on the GoH install [V 2026-11-23]: 226 folders under
// map/multi, each with map.net, map, .materials, minimap.dds, preview.dds and one <mode>.info + <mode>.mi per mode (no map.info: 0 of
// 226); a <mode>.info is {game {maxPlayers N} {texMod camo|winter} {minPlayers N} {mission_options ..}} (maxPlayers 363 of 363, texMod
// 318: camo 215, winter 100, Winter 3; minPlayers 29), CRLF; the mode cards set/multiplayer/games/<mode>.set hold {enableBots} (or
// {enableBots 1}) under {settings}; the lobby name is the msgctxt "mission/multi/<map>/name" entry of interface/text/mission.pot;
// every map picture is DXT1 (preview 2560x1440, minimap up to 1500 a side). What this branch writes, in those forms:
//   copy    tools/map-clone --target goh into a fresh temp folder (the map folder byte for byte, its name refs changed), then every file
//           into the mod through lib/modwrite (final file inside the mod, restore point first); no mod.info (the mod step made it)
//   title   localizations/default/interface/text/mission/multi/<map>.pot: one gettext entry msgctxt "mission/multi/<map>/name", msgid the
//           title, msgstr "", the path and form map-clone and the Maps page write (CRLF) [I: the sub folder is read as the game's own
//           interface/text sub folders are; the lobby showing it is T]
//   players maxPlayers and minPlayers in every <mode>.info of the map (set in place, or added under {game})
//   season  texMod camo or winter in every <mode>.info
//   bots    {enableBots} on or off in the mode card of each mode of the map (the card counts for every map of that mode)
//   pictures preview.dds, minimap.dds, preview_small.dds: a DXT1 DDS as it is; a PNG, TGA or other DDS made DXT1 with mipmaps here
//           (lib/model/ddsenc) at the game's sizes: preview 2560x1440, minimap longer side 1500, preview_small its own size (no game
//           map has one; the game falls back to the preview) [T]
//   ranked  {ranked {enabled}} as the last item of {game} in every <mode>.info, or taken out; the game ANDs the card's ranked with the .info's, so it counts only where the mode card has ranked on [I]
//   place   objects: the AS2 place questions, written by place-entity's GoH branch (placeGoh: one {Entity} in the map file, a free uid,
//           milint before and after, own restore point, read back) after the other files [T: the world scale on screen]
//   players a count above the start points is refused unless spawns_later: every game mode file has at least maxPlayers / 2
//           SpawnPoint map points on team a and on team b [V 347 of 347]
//   mode    a game mode the map lacks (goh_addmode, goh_zones): the Missions page's GoH mode maker (missions/gohmode.js): a mode of
//           the same kind byte for byte, or one built from a battle zones mode (ammunition, evacuation, koth, captureflag, guerrilla),
//           new flags with zones, zones re-shaped by numbers; new players and season go into its .info too
// Refused on GoH with a plain line: frontlines, campaign and cooperative modes (gohmode.js says what each lacks) and the AS2 per mode
// settings group. The ground goes to the GoH editor (binaries/x64/call_to_arms_ed.exe), never started here. Nothing of this has been
// tried in game: every effect is [T].
// Author: Imperator_Aug (ARSENAL, ia-567e9ebb)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const lc = s => String(s == null ? '' : s).toLowerCase();
// the mode cards of the GoH install [V: these six .set files under set/multiplayer/games]
const CARDS = ['battle_zones', 'ammunition', 'campaign_capture_the_flag', 'evacuation', 'frontlines', 'cooperative'];
const TEXMOD = ['camo', 'winter'];
const PICS = ['preview', 'minimap', 'preview_small'];
const NAME_RE = /^[A-Za-z0-9_]{1,40}$/;
const TITLE_DIR = 'localizations/default/interface/text/mission/';
const NOGOH = 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the game\'s maps.';

const gohDirOf = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const viewOf = dir => (dir ? { dir, exe: 'goh', gid: 'goh' } : null);
// a flag of a card: {k} or {k <not 0>} is on, {k 0} or none is off [I]
const flagOn = (t, k) => { const m = new RegExp('\\{\\s*' + k + '(?:\\s+(-?\\d+))?\\s*\\}', 'i').exec(t || ''); return !!m && (m[1] == null || +m[1] !== 0); };
const flagHas = (t, k) => new RegExp('\\{\\s*' + k + '(?:\\s+-?\\d+)?\\s*\\}', 'i').test(t || '');
// the <mode>.info files of a map folder: [{mode, key}] (mod and game view)
function infoFiles(H, g, mod, key) {
  return H.keysUnder(g, mod, 'resource/' + key + '/', []).map(k => { const m = new RegExp('^resource/' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([a-z0-9_]+)\\.info$').exec(k); return m ? { mode: m[1], key: k } : null; }).filter(Boolean)
    .sort((a, b) => (a.mode < b.mode ? -1 : 1));
}
// the modes of a map: a <mode>.info with its <mode>.mi (the Maps page list rule), else every .info
function modesOf(H, g, mod, key) {
  const inf = infoFiles(H, g, mod, key).map(x => x.mode), mi = H.modesOf(g, mod, key, [], null);
  const both = inf.filter(m => mi.includes(m)), rank = m => (CARDS.indexOf(m) < 0 ? 99 : CARDS.indexOf(m));
  return (both.length ? both : inf).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
}
function infoVals(buf) {
  const t = buf ? H0().live(buf.toString('latin1')) : '', n = k => { const m = new RegExp('\\{\\s*' + k + '\\s+(-?\\d+)', 'i').exec(t); return m ? +m[1] : null; };
  const tm = /\{\s*texMod\s+([A-Za-z0-9_]+)/i.exec(t);
  return { maxPlayers: n('maxPlayers'), minPlayers: n('minPlayers'), texMod: tm ? lc(tm[1]) : null };
}
const H0 = () => require('./map.recipe')._t;
// the GoH mode maker of the Missions page (one plan for both), its sentences in English for the task's notes and refusals
const GM = () => require('../../missions/gohmode');
function sayEn(s) { if (!s) return ''; const L = require('../../missions/lang.json').en; return String(L[s.k] || s.k).replace(/\{(\w+)\}/g, (m, k) => (s.p && s.p[k] != null ? String(s.p[k]) : m)); }
// a reader for the plan: the map files of gameKey from the game alone (a copy reads the game's map, as map-clone does), the rest
// (cards, texts, the map of a change) with the mod on top
const readOf = (H, g, mod, gameKey) => rel => (gameKey && rel.startsWith('resource/' + gameKey + '/') ? H.readKey(g, '', rel, []) : H.readKey(g, mod, rel, []));
function cardText(H, g, mod, mode) { const b = H.readKey(g, mod, 'resource/set/multiplayer/games/' + mode + '.set', []); return b ? H.live(b.toString('latin1')) : null; }

// a .pot with one entry, the form map-clone writes (header, then msgctxt msgid msgstr), CRLF, UTF-8
const pq = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
const potOf = (ctxKey, title) => Buffer.from(['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', '',
  'msgctxt ' + pq(ctxKey), 'msgid ' + pq(title), 'msgstr ""', ''].join('\r\n'), 'utf8');
const titleRel = key => TITLE_DIR + key.replace(/^map\//, '') + '.pot';
// a DDS in the form of the game's map pictures: DXT1 that the GoH loader takes. -> null | reason
function picWhy(b) {
  if (!b || b.length < 128 || b.toString('latin1', 0, 4) !== 'DDS ') return 'not a DDS file';
  let f = null; try { f = require('../../../../lib/model/picture').facts('dds', b, { game: 'goh' }); } catch (e) { f = null; }
  if (!f || f.error) return 'the DDS header could not be read' + (f && f.error ? ' (' + f.error + ')' : '');
  if (String(f.format || '').toUpperCase() !== 'DXT1') return 'it is ' + (f.format || 'another format') + ', and every Gates of Hell map picture is DXT1';
  if (f.game && f.game.ok === false) return f.game.why || 'the game does not load it';
  return null;
}
// the size a map picture is made at, from the picture's own w x h: preview 2560x1440 (188 of 208 game previews [V]); minimap the
// longer side 1500 (207 of 208 [V]), the other side to scale; preview_small has no game file (the game shows the preview when it is
// missing), so it keeps its own size [T]. Sides a multiple of 4 (DXT1 blocks).
function picSize(q, w, h) {
  const r4 = n => Math.max(4, Math.round(n / 4) * 4);
  if (q === 'preview') return [2560, 1440];
  if (q === 'minimap') { const s = 1500 / Math.max(w, h); return [r4(w * s), r4(h * s)]; }
  const s = Math.min(1, 2560 / Math.max(w, h)); return [r4(w * s), r4(h * s)];
}
// a brought picture -> {buf: DXT1 DDS made here, note} | {buf: null, note} (a DXT1 DDS the game loads, kept) | {why}
function gohPic(b, q) {
  const isDds = b && b.length >= 128 && b.toString('latin1', 0, 4) === 'DDS ';
  if (isDds && !picWhy(b)) return { buf: null, note: 'Picture ' + q + '.dds goes in as you brought it (DXT1) [T].' };
  let img = null, from = '';
  try {
    if (isDds) { const d = require('../../../../lib/model/picture').decode('dds', b); if (d && !d.error && d.rgba) img = { w: d.width, h: d.height, rgba: d.rgba }; from = 'DDS ' + ((d && d.format) || ''); }
    else {
      const A = require('../../../../artport/artport');
      if (b && b.length > 8 && b.readUInt32BE(0) === 0x89504E47) { img = A.decodePng(b); from = 'PNG'; }
      else if (b && b.length > 18 && [2, 10].includes(b[2]) && [24, 32].includes(b[16])) { img = A.decodeTga(b); from = 'TGA'; }
    }
  } catch (e) { img = null; }
  if (!img || !(img.w > 0 && img.h > 0)) return { why: isDds ? (picWhy(b) || 'the DDS could not be read') + ', and it could not be read to make it DXT1' : 'it is not a DDS, PNG (8 bit) or TGA (24 or 32 bit, plain or RLE) file' };
  if (img.w > 16384 || img.h > 16384) return { why: 'it is ' + img.w + 'x' + img.h + ', too big to read here' };
  const [W, Hh] = picSize(q, img.w, img.h), A = require('../../../../artport/artport');
  const px = A.resize({ w: img.w, h: img.h, rgba: img.rgba }, W, Hh);
  let see = false; for (let i = 3; i < px.rgba.length; i += 4) if (px.rgba[i] < 255) { see = true; break; }
  const buf = require('../../../../lib/model/ddsenc').encode(px.rgba, W, Hh, { mips: true });
  return { buf, note: 'Picture ' + q + ': your ' + from.trim() + ' (' + img.w + 'x' + img.h + ') is made a DXT1 DDS with mipmaps at ' + W + 'x' + Hh + ', the form of the game\'s map pictures' + (see ? '; DXT1 keeps no see through parts, so they come out solid' : '') + '. Look at it in the lobby [T].' };
}
// a mode card has ranked on: {ranked {enabled}} (the battle_zones, ammunition and campaign cards [V])
const rankedOn = t => { const L = H0().live(t || ''), m = /\{\s*ranked\b/i.exec(L); if (!m) return false; const e = L.slice(m.index), end = blockEndAt(e, 0); return /\{\s*enabled\s*\}/i.test(e.slice(0, end < 0 ? e.length : end)); };
function blockEndAt(t, at) { let d = 0; for (let i = at; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) return i + 1; } return -1; }
// ranked on a <mode>.info (CRLF text): on adds {ranked {enabled}} as the last item of {game} (the card form, a tab a level), off takes
// every live {ranked ..} block out; commented lines (;{ranked}) stay as the game has them. -> the new text, or the same text
function setRanked(t, on) {
  const NL = t.includes('\r\n') ? '\r\n' : '\n', lines = t.split(NL), live = l => !/^\s*;/.test(l);
  const out = []; let skip = 0;
  for (const l of lines) {
    if (skip) { for (const ch of l) { if (ch === '{') skip++; else if (ch === '}') skip--; } continue; }
    if (live(l) && /^\s*\{\s*ranked\b/i.test(l)) { let d = 0; for (const ch of l) { if (ch === '{') d++; else if (ch === '}') d--; } skip = d; continue; }
    out.push(l);
  }
  let s = out.join(NL);
  if (on) {
    const g = /\{\s*game\b/i.exec(s); if (!g) return null;
    const end = blockEndAt(s, g.index); if (end < 0) return null;
    s = s.slice(0, end - 1).replace(/[ \t]*$/, '') + (/\n$/.test(s.slice(0, end - 1).replace(/[ \t]*$/, '')) ? '' : NL) + ['\t{ranked', '\t\t{enabled}', '\t}', ''].join(NL) + s.slice(end - 1);
  }
  return s;
}
// start points of a mode file: SpawnPoint map points per team
function spawnsOf(buf) { const by = { a: 0, b: 0 }; if (buf) for (const e of GM().entsOf(buf.toString('latin1'))) if (e.spawn && by[e.team] != null) by[e.team]++; return by; }
// the place questions (the AS2 form, map.recipe.js) -> [{entity, pos 'x,y[,z]', dir?, scale?, tex?}]; positions in map units, counted
// from an object the map has or from 0 0, inside the box of the map's own objects
function placeItems(c, H, g, src, base, notes) {
  const T = H, ent = String(c.value('place_entity') || '').replace(/\.def$/i, '').split('/').pop();
  if (!/^[A-Za-z0-9_\-]{1,80}$/.test(ent)) throw bad('Pick the object to place.');
  const objs = T.objectsOf(T.readKey(g, src, 'resource/' + base + '/map', [])), near = String(c.value('place_near') || '').trim().replace(/\.def$/i, '');
  let at = [0, 0];
  if (near) { const o = objs.find(x => x.name.toLowerCase() === near.toLowerCase()); if (!o) throw bad('No object called ' + near + ' stands on this map. Type the name of one that does (the suggested one does), or leave it empty.'); at = [o.x, o.y]; notes.push('Objects are placed from ' + o.name + ' at ' + o.x + ' ' + o.y + ' in map units.'); }
  const box = objs.length ? objs.reduce((b, o) => [Math.min(b[0], o.x), Math.min(b[1], o.y), Math.max(b[2], o.x), Math.max(b[3], o.y)], [Infinity, Infinity, -Infinity, -Infinity]) : null;
  const posOf = (x, y, what) => {
    const p = [Math.round((at[0] + T.num(x, what + ' x')) * 100) / 100, Math.round((at[1] + T.num(y, what + ' y')) * 100) / 100];
    if (box && (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3])) throw bad(what + ' lands at ' + p.join(' ') + ', outside the area where this map\'s own objects stand (x ' + box[0] + ' to ' + box[2] + ', y ' + box[1] + ' to ' + box[3] + '). Use smaller numbers' + (near ? '' : ', or count from an object on the map') + '.');
    return p;
  };
  const it = { entity: ent, pos: posOf(c.value('place_x'), c.value('place_y'), 'The object') };
  const z = String(c.value('place_z') == null ? '' : c.value('place_z')).trim(); if (z) it.pos.push(T.num(z, 'Height'));
  const dir = T.num(c.value('place_dir') == null ? 0 : c.value('place_dir'), 'The turn'); if (dir) it.dir = String(dir);
  const sc = T.num(c.value('place_scale') == null ? 1 : c.value('place_scale'), 'The size'); if (sc <= 0 || sc > 10) throw bad('Size: more than 0, at most 10.'); if (sc !== 1) it.scale = String(sc);
  const tex = String(c.value('place_tex') || '').trim(); if (tex) { if (!/^[A-Za-z0-9_]{1,40}$/.test(tex)) throw bad('Texture variant: English letters, digits and _ only.'); it.tex = tex; }
  const items = [it];
  for (const line of [].concat(c.value('place_more') || []).map(String).filter(s => s.trim())) {
    const m = T.MORE_RE.exec(line); if (!m) throw bad('A line of more objects reads: name x y [turn], in map units, for example: hedge2a 50 -30 90. This one does not: ' + line.slice(0, 80));
    const o = { entity: m[1].replace(/\.def$/i, '').split('/').pop(), pos: posOf(m[2], m[3], 'The line ' + m[1]) };
    if (m[4] != null) o.dir = String(T.num(m[4], 'The turn'));
    items.push(o);
  }
  for (const o of items) o.pos = o.pos.join(',');
  notes.push('Objects (' + items.map(o => o.entity).join(', ') + ') go into the map file, a position with two numbers stands on the ground; the map file is checked before and read back after each one. Which way x and y run on screen is not tested in game [T]. Every player needs the mod.');
  return items;
}

// ---- values on GoH: what the picked map has now
async function values(ctx, base, opt, H, out) {
  const key = H.mapKeyOf(base && base.id), dir = gohDirOf(ctx), g = viewOf(dir), mod = ctx.mod || '';
  out.goh_texmod = 'camo'; out.goh_addmode = ''; out.goh_zones = '';
  if (!key || !g) return out;
  const verb = opt && opt.verb, folder = key.split('/').pop();
  if (!verb) out.copy = !H.inModDir(mod, key);
  out.name = folder.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 34) + '_copy';
  out.title = H.titleOf(base, folder) + (out.copy ? ' (copy)' : '');
  const modes = modesOf(H, g, mod, key);
  for (const m of modes) {
    const v = infoVals(H.readKey(g, mod, 'resource/' + key + '/' + m + '.info', []));
    if (v.maxPlayers && v.maxPlayers > (out._max || 0)) out._max = v.maxPlayers;
    if (v.minPlayers && !out._min) out._min = v.minPlayers;
    if (v.texMod && !out._tex) out._tex = v.texMod;
  }
  if (out._max) out.maxplayers = out._max;
  out.minplayers = out._min || 1;
  if (TEXMOD.includes(out._tex)) out.goh_texmod = out._tex;
  delete out._max; delete out._min; delete out._tex;
  const cards = modes.filter(m => CARDS.includes(m)).map(m => cardText(H, g, mod, m)).filter(t => t != null);
  out.bots = cards.length ? cards.every(t => flagOn(t, 'enableBots')) : false;
  return out;
}

// ---- compile on GoH -> {calls, notes, result}: one call of the recipe's own route, which writes through lib/modwrite
function compile(draft, c, H) {
  const dir = c.gameDir;
  if (!dir) throw badK('task.map.e.nogoh', NOGOH);
  const mod = c.mod;
  if (!mod || !path.isAbsolute(mod)) throw bad('Pick your mod first: the map is written only into the mod you picked.');
  const base = H.mapKeyOf(c.base && c.base.id);
  if (!base || !/^map\/multi\/[a-z0-9_\-./]+$/.test(base) || base.includes('..')) throw bad('Pick the Gates of Hell multiplayer map to start from first.');
  const g = viewOf(dir), V = c.values || {}, notes = [], body = { map: base };
  const changed = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && !H.same(c.value(id), V[id]); };
  const asked = id => { const a = c.answer(id); return !!a && a.src !== 'keep'; };
  const copy = H.yes(c.value('copy') == null ? true : c.value('copy'));
  let key = base;
  if (copy) {
    const name = String(c.value('name') || '');
    if (!NAME_RE.test(name)) throw bad('The new map name may hold English letters, digits and _ only (1 to 40).');
    key = H.parentOf(base) + '/' + name.toLowerCase();
    if (key === base) throw bad('The copy needs a name of its own, not the name of the map it copies.');
    if (H.readKey(g, '', 'resource/' + key + '/map.net', []) || H.inModDir(mod, key)) throw bad('A map called ' + name + ' is already there (in the game or in your mod). Pick another name.');
    body.name = name;
  } else if (c.verb === 'make') notes.push('No copy: the changes go into the picked map itself (' + base + ').');
  const src = copy ? '' : mod;
  const modes = modesOf(H, g, src, base);
  if (!modes.length) throw bad('The map ' + base + ' has no <mode>.info file: nothing to copy or change.');
  // AS2 only steps that a GoH draft may still carry from an earlier answer
  if (asked('mode') && String(c.value('mode') || 'keep') !== 'keep') throw badK('task.map.e.gohmode', 'Not in Gates of Hell: adding the game mode ' + String(c.value('mode')) + ' to this map. Answer the Gates of Hell mode question instead.', { mode: String(c.value('mode')), why: 'the AS2 mode list is not the GoH one.' });
  // a game mode the map lacks (missions/gohmode.js): a mode of the same engine class copied, zones re-shaped by numbers; else refused
  const addTo = asked('goh_addmode') ? String(c.value('goh_addmode') || '').trim().toLowerCase() : '';
  if (addTo) {
    const p = GM().plan({ read: readOf(H, g, mod, copy ? base : ''), srcKey: base, key, modes, to: addTo, zones: asked('goh_zones') ? String(c.value('goh_zones') || '') : '' });
    if (!p.ok) { const why = sayEn(p.why); throw badK('task.map.e.gohmode', 'Not in Gates of Hell: adding the game mode ' + addTo + ' to this map. ' + why, { mode: addTo, why }); }
    body.addMode = { to: addTo, from: p.from, zones: asked('goh_zones') ? String(c.value('goh_zones') || '') : '' };
    notes.push(...p.say.map(sayEn));
  }
  // objects on the map: the AS2 questions, placed by place-entity's GoH branch (one {Entity} block in the map file, the next free uid,
  // checked before and read back after; its own restore point) after the other files are written
  if (H.yes(c.value('place_on'))) body.place = placeItems(c, H, g, src, base, notes);
  // players and season: every <mode>.info of the map
  const set = {};
  if (changed('maxplayers')) {
    const n = Math.round(H.num(c.value('maxplayers'), 'The player count')); if (n < 2 || n > 16 || n % 2) throw bad('Players: an even number from 2 to 16.'); set.maxPlayers = n;
    // start points: every mode file of the game has at least maxPlayers / 2 SpawnPoint map points on team a and on team b [V 347 of 347
    // mode files with a .info, 2026-11-23]; fewer are refused unless the user adds them in the editor
    const short = [];
    for (const m of modes) { const s = spawnsOf(H.readKey(g, src, 'resource/' + base + '/' + m + '.mi', [])); if (Math.min(s.a, s.b) < n / 2) short.push(m + ' (team a ' + s.a + ', team b ' + s.b + ')'); }
    if (short.length && !H.yes(c.value('spawns_later'))) throw badK('task.map.e.gohspawns', 'Not enough start points for ' + n + ' players (' + n / 2 + ' a side): ' + short.join(', ') + '. Pick fewer players, or answer that you will add start points in the game editor.', { n, side: n / 2, modes: short.join(', ') });
    if (short.length) notes.push('Start points for ' + n + ' players: ' + short.join(', ') + ' has fewer than ' + n / 2 + ' a side. After Write start the Gates of Hell editor (binaries/x64/call_to_arms_ed.exe) with this mod on; this task never starts it. Open each mode file, put one start point (map_point, visor SpawnPoint, team a or b, the next order) per player on each side, save [T].');
  }
  if (changed('minplayers')) { const n = Math.round(H.num(c.value('minplayers'), 'The fewest players')); if (n < 1 || n > 16) throw bad('Fewest players: 1 to 16.'); set.minPlayers = n; }
  const mx = set.maxPlayers != null ? set.maxPlayers : V.maxplayers, mn = set.minPlayers != null ? set.minPlayers : V.minplayers;
  if ((set.maxPlayers != null || set.minPlayers != null) && mx != null && mn != null && mn > mx) throw bad('The fewest players (' + mn + ') are more than the most players (' + mx + ').');
  if (changed('goh_texmod')) { const s = lc(c.value('goh_texmod')); if (!TEXMOD.includes(s)) throw bad('Season of the units: camo or winter.'); set.texMod = s; }
  if (Object.keys(set).length) { body.info = set; notes.push('Every mode file of the map (' + modes.map(m => m + '.info').join(', ') + ') gets ' + Object.entries(set).map(([k, v]) => k + ' ' + v).join(', ') + '. Check the lobby in game [T].'); }
  // bots: the cards of the map's modes
  if (changed('bots')) {
    const want = H.yes(c.value('bots')), mine = modes.filter(m => CARDS.includes(m)), go = [];
    for (const m of mine) { const t = cardText(H, g, mod, m); if (t == null) { notes.push('No card for the ' + m + ' mode; bots not changed there.'); continue; } if (flagOn(t, 'enableBots') !== want) go.push(m); }
    if (go.length) { body.bots = { on: want, modes: go }; notes.push('Bots ' + (want ? 'on' : 'off') + ' in the card of ' + go.join(', ') + ': it counts for every map of that mode while the mod is on [T].'); }
  }
  // lobby name: one .pot entry; a copy always gets its own
  const title = String(c.value('title') == null ? V.title || '' : c.value('title')).trim();
  if (copy && title && lc(title) === lc(H.titleOf(c.base, base.split('/').pop()))) throw bad('The copy needs a lobby name of its own: "' + title + '" is the name of the map it copies, so the lobby would list two maps with one name.');
  if (changed('title') || (copy && title)) {
    if (!title || /[\r\n]/.test(title) || title.length > 120) throw bad('The lobby name: one line, 1 to 120 signs.');
    body.title = title;
    notes.push('Lobby name "' + title + '": msgctxt mission/' + key.replace(/^map\//, '') + '/name in ' + titleRel(key) + ' of your mod' + (copy ? '' : '; the game has this key in its own mission.pot, which may win (GHLOC-08 [I])') + '. Check the lobby list in game [T].');
  }
  // ranked: {ranked {enabled}} in every <mode>.info; the game takes it only where the mode card has ranked on too
  if (changed('ranked')) {
    const want = H.yes(c.value('ranked'));
    body.ranked = want;
    const off = modes.filter(m => { const t = cardText(H, g, mod, m); return !t || !rankedOn(t); });
    notes.push('Ranked ' + (want ? 'on' : 'off') + ' in every mode file of the map.' + (want && off.length ? ' The card of ' + off.join(', ') + ' has ranked off, so the game does not list the map as ranked there.' : '') + ' Check the ranked list in game [T].');
  }
  // pictures: a DXT1 DDS goes in as it is; a PNG, a TGA or another DDS is made DXT1 with mipmaps at the size of the game's pictures
  const pics = [];
  for (const q of PICS) {
    const a = c.answer(q);
    if (a && a.src === 'ext') { notes.push('Picture ' + q + ': save it in the outside program as DDS, PNG or TGA, then bring the file back to this step.'); continue; }
    if (!a || a.src !== 'file' || !(a.staged || []).length) continue;
    const f = [].concat(c.value(q) || [])[0];
    let buf = null; try { buf = fs.readFileSync(f); } catch (e) { throw bad('The picture for ' + q + ' could not be read again. Bring it to this step once more.'); }
    const r = gohPic(buf, q);
    if (r.why) throw badK('task.map.e.gohpic', 'The picture for ' + q + ' cannot be used: ' + r.why + '. Bring a DDS, PNG or TGA file.', { q, why: r.why });
    let file = path.resolve(f);
    if (r.buf) { file = path.join(c.staging, 'dds', q + '.dds'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, r.buf); }
    notes.push(r.note);
    pics.push({ file, to: q });
  }
  if (pics.length) body.pics = pics;
  const gr = c.answer('ground');
  if (gr && gr.src === 'ext') notes.push('Ground: after Write start the Gates of Hell editor (binaries/x64/call_to_arms_ed.exe in the game folder) with this mod on; this task never starts it. Open the map ' + key.split('/').pop() + ', draw the ground, save, then come back and press Check.');
  notes.push('Not in Gates of Hell here: the AS2 per mode settings group (the Gates of Hell mode cards hold those settings; the mission task changes them).');
  const calls = (body.name || body.info || body.bots || body.title || body.pics || body.addMode || body.place || body.ranked != null) ? [{ route: 'POST /api/x/task/r/map/goh', body, dryFlag: 'write', ok: r => !!r && r.ok === true }] : [];
  if (!calls.length) notes.push('Nothing to change: every answer is as the map has it.');
  return { calls, notes, result: key };
}

// ---- own route: POST /api/x/task/r/map/goh {mod, map, name?, title?, info?, bots?, pics?, write}
// dry run: the files it would write. write: the files made in memory (the copy through map-clone in a temp folder), each one guarded
// (lib/modwrite: inside the mod also with links followed) and given a restore point first, then written.
async function route(url, b, ctx) {
  b = b || {};
  const H = H0(), mod = require('../../bots/lib').checkMod(ctx, b.mod), dir = gohDirOf(ctx);
  if (!dir) throw badK('task.map.e.nogoh', NOGOH);
  const src = H.mapKeyOf(b.map);
  if (!/^map\/multi\/[a-z0-9_\-./]+$/.test(src) || src.includes('..')) throw bad('Pick the Gates of Hell multiplayer map first.');
  if (b.name != null && !NAME_RE.test(String(b.name))) throw bad('The new map name may hold English letters, digits and _ only (1 to 40).');
  const MW = require('../../../../lib/modwrite'), g = viewOf(dir);
  const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'copy or change a map' });
  if (why) throw bad(why);
  const key = b.name ? H.parentOf(src) + '/' + String(b.name).toLowerCase() : src;
  const files = new Map();   // rel -> Buffer (null in a dry run: named only)
  const stop = () => !!(ctx && ctx.job && ctx.job.cancelled);
  let tmp = null, warn = [];
  try {
    if (b.name) {
      const tr = ctx.tmpRoot || path.join(os.tmpdir(), 'arsenal-gui');
      fs.mkdirSync(tr, { recursive: true });
      tmp = fs.mkdtempSync(path.join(tr, 'task-map-goh-'));
      const args = ['--game', dir, '--map', src, '--name', String(b.name), '--out', tmp, '--target', 'goh', '--no-modinfo', '-q'].concat(b.write ? [] : ['--plan']);
      const r = await ctx.runTool('map-clone', 'map-clone/map-clone.js', args, { timeoutMs: 300000 });
      if (r.cancelled || stop()) return { ok: false, stopped: true };
      // map-clone (-q: findings only) exits 1 on a WARN_ finding too (an include it cannot find), after it wrote the copy; any other
      // finding stops it before a byte is written (a taken name, a map.net it cannot read, another game's terrain)
      const out = String((r.stdout || '') + '\n' + (r.stderr || '')), lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const found = lines.filter(l => /\b(WARN_)?MAPCLONE_[A-Z_]+/.test(l)), hard = found.filter(l => !/\bWARN_MAPCLONE_/.test(l));
      if (r.code !== 0 && (hard.length || !found.length)) throw bad('The map could not be copied: ' + (hard.length ? hard : lines).slice(0, 3).join(' ').slice(0, 400));
      warn = found.filter(l => /\bWARN_MAPCLONE_/.test(l)).slice(0, 5).map(l => l.slice(0, 300));
      if (b.write) {
        (function walk(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r2 = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r2); else files.set(/^resource\//i.test(r2) ? r2.toLowerCase() : r2, fs.readFileSync(path.join(d, e.name))); } })(tmp, '');
        if (!files.size) throw bad('The map copy made no files.');
      } else for (const k of H.keysUnder(g, '', 'resource/' + src + '/', [])) if (k.split('/').length === src.split('/').length + 2) files.set('resource/' + key + '/' + k.split('/').pop(), null);
    }
    const own = rel => { if (files.has(rel) && files.get(rel)) return files.get(rel); const f = path.join(mod, ...rel.split('/')); try { return fs.readFileSync(f); } catch (e) { return null; } };
    const patch = require('../../../../patch-entity/patch-entity');
    const edit = (buf, edits, what) => { for (const e of edits) { const r = patch.applyEdit(buf, e); if (r.err) throw bad(what + ' could not be changed: ' + r.err[1]); buf = r.buf; } return buf; };
    // a game mode the map lacks (missions/gohmode.js plan on the map read: the game's for a copy, the mod's on top for a change)
    let added = null;
    if (b.addMode && typeof b.addMode === 'object') {
      const GMm = GM(), to = String(b.addMode.to || ''), from = b.addMode.from ? String(b.addMode.from) : '';
      if (from && !/^[a-z0-9_]{1,40}$/.test(from)) throw bad('Not a game mode name: ' + from.slice(0, 40));
      const p = GMm.plan({ read: readOf(H, g, mod, b.name ? src : ''), srcKey: src, key, modes: modesOf(H, g, b.name ? '' : mod, src), from, to, zones: String(b.addMode.zones || '') });
      if (!p.ok) throw badK('task.map.e.gohmode', 'Not in Gates of Hell: adding the game mode ' + to.slice(0, 40) + ' to this map. ' + sayEn(p.why), { mode: to.slice(0, 40), why: sayEn(p.why) });
      for (const [rel, buf] of p.files) files.set(rel, buf);
      added = { to, from: p.from };
    }
    // players and season in every <mode>.info
    if (b.info && typeof b.info === 'object') {
      const ed = [];
      for (const [k, v] of Object.entries(b.info)) {
        if (k === 'maxPlayers' || k === 'minPlayers') { if (!(Number.isInteger(v) && v >= 1 && v <= 16)) throw bad(k + ': 1 to 16.'); ed.push({ op: 'add', path: 'game/' + k, value: String(v) }); }
        else if (k === 'texMod') { if (!TEXMOD.includes(v)) throw bad('texMod: camo or winter.'); ed.push({ op: 'add', path: 'game/texMod', value: v }); }
        else throw bad('Not a map setting: ' + k);
      }
      const infos = infoFiles(H, g, b.name ? '' : mod, src);
      if (!infos.length) throw bad('The map has no <mode>.info file to change.');
      if (added) infos.push({ mode: added.to });   // the new mode's .info (in files) gets the same players and season
      for (const x of infos) {
        const rel = 'resource/' + key + '/' + x.mode + '.info';
        const buf = own(rel) || H.readKey(g, b.name ? '' : mod, 'resource/' + src + '/' + x.mode + '.info', []);
        files.set(rel, buf ? edit(buf, ed, rel) : null);
      }
    }
    // ranked: {ranked {enabled}} in every <mode>.info (the new mode's too), or every live {ranked ..} block out
    if (typeof b.ranked === 'boolean') {
      const infos = infoFiles(H, g, b.name ? '' : mod, src);
      if (added) infos.push({ mode: added.to });
      for (const x of infos) {
        const rel = 'resource/' + key + '/' + x.mode + '.info', buf = files.get(rel) || own(rel) || H.readKey(g, b.name ? '' : mod, 'resource/' + src + '/' + x.mode + '.info', []);
        if (!buf) continue;
        const s = buf.toString('latin1'), n = setRanked(s, b.ranked);
        if (n == null) throw bad(rel + ' has no {game} block: ranked not set.');
        if (n !== s) files.set(rel, Buffer.from(n, 'latin1'));
      }
    }
    // bots in the mode cards
    if (b.bots && Array.isArray(b.bots.modes)) {
      for (const m of b.bots.modes) {
        if (!CARDS.includes(m)) throw bad('Not a Gates of Hell mode card: ' + String(m).slice(0, 40));
        const rel = 'resource/set/multiplayer/games/' + m + '.set', buf = H.readKey(g, mod, rel, []);
        if (!buf) throw bad('No card for the ' + m + ' mode (' + rel + ').');
        const t = H.live(buf.toString('latin1')), on = !!b.bots.on;
        let ed = [];
        if (on && !flagHas(t, 'enableBots')) ed = [{ op: 'add', path: 'game/settings/enableBots', value: '' }];
        else if (on && !flagOn(t, 'enableBots')) ed = [{ op: 'add', path: 'game/settings/enableBots', value: '1' }];
        else if (!on && flagHas(t, 'enableBots')) ed = [{ op: 'del', path: 'game/settings/enableBots' }];
        if (ed.length) files.set(rel, edit(buf, ed, rel));
      }
    }
    // lobby name
    if (b.title != null) {
      const title = String(b.title).trim();
      if (!title || /[\r\n]/.test(title) || title.length > 120) throw bad('The lobby name: one line, 1 to 120 signs.');
      const tr = titleRel(key);
      for (const k of [...files.keys()]) if (/^localizations\//.test(k) && k !== tr) files.delete(k);   // map-clone's own title file is replaced
      files.set(tr, potOf('mission/' + key.replace(/^map\//, '') + '/name', title));
    }
    // pictures (DXT1 DDS), only from this task's staging folder
    if (Array.isArray(b.pics)) {
      const root = require('../lib/draft').stageRoot(ctx);
      for (const p of b.pics) {
        if (!p || !PICS.includes(p.to)) throw bad('Pick the picture: preview, minimap or preview_small.');
        const f = path.resolve(String(p.file || ''));
        if (path.relative(root, f).startsWith('..') || path.isAbsolute(path.relative(root, f))) throw bad('A picture must come from this task\'s own files.');
        let buf = null; try { buf = fs.readFileSync(f); } catch (e) { throw bad('The picture for ' + p.to + ' could not be read again. Bring it to this step once more.'); }
        const w = picWhy(buf); if (w) throw badK('task.map.e.gohpic', 'The picture for ' + p.to + ' cannot be used: ' + w + '. Bring a DDS, PNG or TGA file.', { q: p.to, why: w });
        files.set('resource/' + key + '/' + p.to + '.dds', buf);
      }
    }
    // objects on the map (place-entity's GoH branch): every one tried first on the map as it is now (a copy: the game's map), then,
    // after the other files are written, placed one by one in the mod's map file (its own restore point and read back each)
    const items = Array.isArray(b.place) ? b.place : [];
    if (items.length > 50) throw bad('At most 50 objects in one task.');
    const PE = items.length ? require('../../../../place-entity/place-entity') : null;
    const placeOne = (o, mapKey, dry) => {
      if (!o || !/^[A-Za-z0-9_\-]{1,80}$/.test(String(o.entity || '')) || !/^-?[\d.]+,-?[\d.]+(,-?[\d.]+)?$/.test(String(o.pos || ''))) throw bad('An object to place needs a name and a position x,y[,z].');
      const r = PE.placeGoh({ mod, gameDir: dir, map: mapKey.replace(/^map\//, ''), entity: String(o.entity), pos: String(o.pos), dir: o.dir != null ? String(o.dir) : undefined, scale: o.scale != null ? String(o.scale) : undefined, tex: o.tex != null ? String(o.tex) : undefined, dry });
      const found = r.rep.toJSON().findings || [], hard = found.filter(x => !/^WARN_/.test(x.code) && Object.keys(r.rep.counts).includes(x.code));
      if (r.blocked || hard.length) { const why = (hard.length ? hard : found).slice(0, 3).map(x => x.code + ': ' + x.msg).join(' ').slice(0, 400) || 'the placement was refused'; throw badK('task.map.e.gohplace', 'The object ' + o.entity + ' cannot be placed on this map: ' + why, { entity: String(o.entity), why }); }
      return r;
    };
    for (const o of items) placeOne(o, src, true);
    const rels = [...files.keys()].sort();
    if (!rels.length && !items.length) return { ok: true, wrote: false, files: [], warn };
    for (const rel of rels) MW.guardFile(mod, path.join(mod, ...rel.split('/')), { game: dir });
    const mapRel = 'resource/' + key + '/map', all = items.length && !rels.includes(mapRel) ? rels.concat(mapRel).sort() : rels;
    if (!b.write) return { ok: true, wrote: false, files: all, warn };
    if (stop()) return { ok: false, stopped: true };
    if (ctx.job) ctx.job.writes = true;
    for (const rel of rels) if (!files.get(rel)) throw bad('No bytes for ' + rel + ': nothing was written.');
    const restore = rels.length ? MW.restorePoints(mod, rels, 'task-map-goh', { game: dir }) : [];
    if (rels.length) MW.writeFiles(mod, rels.map(r => [r, files.get(r)]), { game: dir });
    const placed = [];
    for (const o of items) { const r = placeOne(o, key, false); for (const w2 of r.written || []) { placed.push({ entity: String(o.entity), pos: String(o.pos), uid: '0x' + w2.uid.toString(16) }); restore.push(w2.restore); } }
    try { ((ctx && ctx.modtree) || require('../../../../lib/modtree')).touch(mod); } catch (e) { /* nothing to forget */ }
    return { ok: true, wrote: true, files: all, restore, undo: MW.restoreRoot(mod), map: key, warn, placed };
  } finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp */ } } }
}

// ---- check on GoH: per mode of the map its players, season, the bots switch of its card, its start points per team and ranked
async function check(draft, ctx, H) {
  const dir = gohDirOf(ctx), g = viewOf(dir), mod = draft.mod || ctx.mod || '', a = draft.answers || {}, v = x => (a[x] && a[x].src === 'value' ? a[x].value : undefined);
  const base = H.mapKeyOf(draft.base && draft.base.id); if (!base || !g) return [];
  const key = v('copy') === false || v('copy') === 'false' ? base : v('name') ? H.parentOf(base) + '/' + lc(v('name')) : base;
  const lines = [], short = [];
  for (const m of modesOf(H, g, mod, key)) {
    const iv = infoVals(H.readKey(g, mod, 'resource/' + key + '/' + m + '.info', [])), t = cardText(H, g, mod, m);
    const sp = spawnsOf(H.readKey(g, mod, 'resource/' + key + '/' + m + '.mi', [])), ib = H.readKey(g, mod, 'resource/' + key + '/' + m + '.info', []);
    const rk = ib && rankedOn(ib.toString('latin1')), side = iv.maxPlayers ? iv.maxPlayers / 2 : 0;
    lines.push(m + ': ' + (iv.maxPlayers || '?') + ' players' + (iv.texMod ? ', season ' + iv.texMod : '') + ', bots ' + (t == null ? 'no card' : flagOn(t, 'enableBots') ? 'on' : 'off')
      + ', start points team a ' + sp.a + ', team b ' + sp.b + (rk ? ', ranked ' + (t && rankedOn(t) ? 'on' : 'on in the map, off in the card') : ''));
    if (side && Math.min(sp.a, sp.b) < side) short.push(m + ' needs ' + side + ' start points a side (team a ' + sp.a + ', team b ' + sp.b + ')');
  }
  if (!lines.length) lines.push('No mode file of ' + key + ' found yet: write the task first.');
  const cards = [{ title: 'Map ' + key + ' (Gates of Hell)', lines, level: 'info' }];
  if (short.length) cards.push({ title: 'Start points', lines: short.concat(['Add them in the Gates of Hell editor (binaries/x64/call_to_arms_ed.exe) with this mod on, then press Check again.']), level: 'warn' });
  return cards;
}

module.exports = { CARDS, TEXMOD, PICS, flagOn, flagHas, infoFiles, modesOf, infoVals, potOf, titleRel, picWhy, values, compile, route, check, gohDirOf, sayEn, _t: { setRanked, rankedOn, picSize, gohPic, spawnsOf } };
