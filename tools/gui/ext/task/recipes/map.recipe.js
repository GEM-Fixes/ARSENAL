// recipe "make or change a map": copy a multiplayer map (gen map-clone) or change one in place: its lobby name (gen text), players,
// season and ranked (gen mapinfo), settings of one mode on this map (gen mapinfo mode:, or a new <mode>.info), a game mode it lacks
// (gen mission-clone), bots of its modes (gen set on the mode cards), objects placed on it (gen place) and its pictures (DDS copies).
// The ground itself is a hand-off to the game's map editor. recipe.check counts start points against the players (MAP-23).
// Contract: ../README.md. Author: Imperator_Aug (ARSENAL, RECIPE-MAP)
// Author: Imperator_Aug (ARSENAL, ia-55b9d7b7)
'use strict';
const fs = require('fs'), path = require('path');

const NAME_RE = /^[A-Za-z0-9_]{1,40}$/;                   // map-clone --name / maps/clone nameOk (MAP-01)
const ENT_RE = /^[A-Za-z0-9_.\-/]{1,80}$/;                // maps/place entity check (MAP-26)
const NUM = '-?\\d+(?:[.,]\\d+)?';
const MORE_RE = new RegExp('^\\s*([A-Za-z0-9_.\\-/]{1,80})\\s+(' + NUM + ')\\s+(' + NUM + ')(?:\\s+(' + NUM + '))?\\s*$');
const PARAMS_RE = /^([A-Za-z0-9_]{1,40}=[^;"\r\n]{0,200})(;[A-Za-z0-9_]{1,40}=[^;"\r\n]{0,200})*;?$/;
// positions are asked in map units, the units of the map file's {Position x y} (MAP-16: units per metre, origin and y direction
// on screen are [T]), so nothing here turns metres into units. A position counts from an object already on the map (place_near),
// or, without one, it must lie inside the box of the map's own objects.
const POS_MAX = 20000;
// the lobby pictures: a PNG or TGA is turned into a 32 bit A8R8G8B8 DDS with mip maps (a format the game loads
// [V]) at the size of the picture the map has now; the game maps use 1920x1080 and
// 400x300 [V vfs census 2026-11-12, 126 of 126], the minimap size differs per map
const PIC_SIZE = { preview: [1920, 1080], preview_small: [400, 300] };
const PICS = ['preview', 'preview_small', 'minimap'];
const STOCK = ['combat', 'battle_zones', 'captureflag', 'battle_zones_8x8', 'frontline', 'cooperative'];
const ADDABLE = ['combat', 'battle_zones', 'captureflag'];
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const yes = v => v === true || v === 'true' || v === 1 || v === '1';

// ---- the game of the page (game parity): as64 | mowas2 | goh --------------------------------------------------------------------
// AS64 and MoW:AS2 share one install, and the vfs mounts the AS64 set (as64/core) whenever as64.exe is there and no exe is named, so
// a MoW:AS2 task names exe mowas_2. AS64 names none (the vfs picks as64 as before). Under GoH the folder is the GoH install.
const GM = require('../../../../lib/games');
// the game id of a step: x (draft.game, opt.game), else ctx.task.id (the task's game, README "The game of a task"), else ctx.gameId
// (a function on a route ctx, a string in values and check), else as64
function gidOf(ctx, x) {
  let v = x;
  if (!v && ctx && ctx.task && ctx.task.id) v = ctx.task.id;
  if (!v && ctx) { try { v = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { v = null; } }
  return GM.idOf(v) || 'as64';
}
const exeFor = gid => (gid && gid !== 'as64' ? GM.exeOf(gid) || undefined : undefined);
// the game editor of each game (a hand-off only: no task starts it)
const EDITOR = { as64: 'as64_ed.exe', mowas2: 'mowas_2_ed.exe', goh: 'binaries/x64/call_to_arms_ed.exe' };
// the GoH branch (map.goh.js): values, compile, check and its own write route
const GOH = () => require('./map.goh');
const AS2 = ['as64', 'mowas2'];
const editorOf = gid => EDITOR[gid] || EDITOR.as64;
// the game view a reader takes: {dir, exe, gid}. dir: ctx.task.dir when the task gives it, else the AS2 install (ctx.game()), under
// GoH the GoH install (ctx.curDir() / ctx.gohDir())
function gameView(ctx, x) {
  const gid = gidOf(ctx, x), call = f => { try { const v = ctx && ctx[f]; return (typeof v === 'function' ? v() : typeof v === 'string' ? v : null) || null; } catch (e) { return null; } };
  const t = ctx && ctx.task && ctx.task.id === gid ? ctx.task : null;
  const dir = (t && t.dir) || (gid === 'goh' ? (call('curDir') || call('gohDir')) : call('game'));
  return dir ? { dir, exe: exeFor(gid), gid } : null;
}
// a reader's game: a folder (as before: the vfs picks the exe) or {dir, exe}
const dirOfG = g => (!g ? null : typeof g === 'string' ? g : g.dir || null);
const exeOfG = g => (g && typeof g === 'object' && g.exe ? String(g.exe) : undefined);

// ---- reading: the mod's loose files first, then the game (vfs, cached per game folder, game and source mods) --------------------
// The view is the shared one of tools/lib/gameview (PERF A2: no copy kept here, where one stayed until the restart; a moved game
// or mod is seen by stamp and signature). vfsOf is sync (the readers are, and other pages call them): by signature once the source
// mods have a scan, which warmView awaits first on the paths that can wait; else lib/vfs walks them as before and the scan starts
// in the background. A list that cannot be built falls back to the game alone, as before.
function vfsOpt(game, mods) {
  const dir = dirOfG(game), exe = exeOfG(game);
  if (!dir) return null;
  const o = { gameDir: dir, list: (mods || []).map(String) }; if (exe) o.exe = exe;
  return o;
}
function vfsOf(game, mods) {
  const o = vfsOpt(game, mods), GV = require('../../../../lib/gameview');
  if (!o) return null;
  try { return GV.withModsSync(o, { revalidate: true }); } catch (e) { try { return GV.get(o); } catch (e2) { return null; } }
}
// before the readers on a path that can wait: the source mods' shared scan and the view, awaited. Never throws; no mods: nothing
async function warmView(game, mods) {
  const o = vfsOpt(game, mods);
  if (o && o.list.length) { try { await require('../../../../lib/gameview').withMods(o); } catch (e) { /* vfsOf falls back */ } }
}
// exe (optional): the vfs exe for a plain folder game (the Maps page: readKey(folder, mod, key, mods, exeOf(ctx))); a {dir, exe} game
// keeps its own exe
function readKey(game, mod, key, mods, exe) {
  if (exe && typeof game === 'string') game = { dir: game, exe: String(exe) };
  key =String(key).toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  if (mod) { const f = path.join(mod, ...key.split('/')); try { if (fs.statSync(f).isFile()) return fs.readFileSync(f); } catch (e) { /* not in the mod */ } }
  const v = vfsOf(game, mods); if (!v) return null;
  const rec = v.files.get(key); if (!rec) return null;
  try { return require('../../../../lib/vfs').readRec(rec); } catch (e) { return null; }
}
// keys under a prefix: mod loose files + game view
function keysUnder(game, mod, prefix, mods) {
  const out = new Set(), p = prefix.toLowerCase();
  const v = vfsOf(game, mods);
  if (v) for (const k of v.files.keys()) if (k.startsWith(p)) out.add(k);
  if (mod) {
    const root = path.join(mod, ...p.split('/').filter(Boolean));
    (function walk(d, rel, depth) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const r = rel + e.name.toLowerCase(); if (e.isDirectory()) { if (depth < 8) walk(path.join(d, e.name), r + '/', depth + 1); } else out.add(r); } })(root, p.endsWith('/') ? p : p + '/', 0);
  }
  return [...out];
}
// SDL text with ; comments blanked (strings kept)
function live(s) {
  let o = '', q = false;
  for (let j = 0; j < s.length; j++) { const c = s[j]; if (q) { if (c === '"' || c === '\n') q = false; o += c; continue; } if (c === '"') { q = true; o += c; continue; } if (c === ';') { while (j < s.length && s[j] !== '\n') { o += ' '; j++; } j--; continue; } o += c; }
  return o;
}
const mapKeyOf = id => { const s = String(id || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/^resource\//i, '').toLowerCase(); return /^map\//.test(s) ? s : s ? 'map/' + s : ''; };
const parentOf = k => k.split('/').slice(0, -1).join('/');
const modsOf = base => (base && base.ref && Array.isArray(base.ref.mods) ? base.ref.mods.map(String).filter(m => /^[^\\/:*?"<>|,]+$/.test(m)) : []);
const inModDir = (mod, key) => { try { return !!mod && fs.statSync(path.join(mod, 'resource', ...key.split('/'))).isDirectory(); } catch (e) { return false; } };
// the modes of a map: <mode>.mi files of its folder (mod and game), else the list's modes
function modesOf(game, mod, key, mods, base) {
  const ks = keysUnder(game, mod, 'resource/' + key + '/', mods), m = [];
  for (const k of ks) { const x = /\/([a-z0-9_]+)\.mi$/.exec(k); if (x && k.split('/').length === key.split('/').length + 2) m.push(x[1]); }
  if (!m.length && base && base.ref && Array.isArray(base.ref.modes)) return base.ref.modes.map(String);
  return [...new Set(m)].sort((a, b) => (STOCK.indexOf(a) < 0 ? 99 : STOCK.indexOf(a)) - (STOCK.indexOf(b) < 0 ? 99 : STOCK.indexOf(b)));
}
// map.info (or <mode>.info) {game ..} values
function infoOf(buf) {
  const t = buf ? live(buf.toString('latin1')) : '', n = k => { const m = new RegExp('\\{\\s*' + k + '\\s+(-?\\d+)', 'i').exec(t); return m ? +m[1] : null; };
  const tm = /\{\s*texMod\s+([0-9d])/i.exec(t), pm = /\{\s*parameters\s+"([^"]*)"/i.exec(t);
  return { maxPlayers: n('maxPlayers'), minPlayers: n('minPlayers'), texMod: tm ? tm[1].toLowerCase() : null, ranked: /\{\s*ranked\b/i.test(t),
    rankedMin: n('rankedMinPlayers'), rankedMax: n('rankedMaxPlayers'), parameters: pm ? pm[1] : null };
}
// a mode card: does it allow bots
function cardBots(game, mod, mode) { const b = readKey(game, mod, 'resource/set/multiplayer/games/' + mode + '.set'); return b ? /\{\s*enableBots\b/i.test(live(b.toString('latin1'))) : null; }
// start points of a mission (map_point extenders shown as SpawnPoint, MAP-23)
const spawnsOf = buf => (buf ? (live(buf.toString('latin1')).match(/\{\s*visor\s+"?SpawnPoint"?\s*\}/gi) || []).length : 0);
// the objects of a map file: [{name, x, y}] from {Entity "name" 0x.. {Position x y}}
function objectsOf(buf) {
  const out = [], t = buf ? buf.toString('latin1') : '', re = /\{Entity\s+"([^"]+)"[^{}]*\{Position\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  let m; while ((m = re.exec(t))) out.push({ name: m[1], x: +m[2], y: +m[3] });
  return out;
}
// the size of a DDS file (its header), or null
// why the game cannot load a DDS (picture.facts: an error, or game.ok false with its reason), or null
const ddsWhy = b => { const p = require('../../../../lib/model/picture').facts('dds', b); return !p ? 'unknown' : p.error ? String(p.error) : p.game && !p.game.ok ? (p.format || 'DDS') + ', ' + p.game.why : null; };
const ddsSize = b => (b && b.length >= 128 && b.toString('latin1', 0, 4) === 'DDS ' ? [b.readUInt32LE(16), b.readUInt32LE(12)] : null);
// the upload check of a picture: a DDS the game loads, or a PNG or TGA this task can read (it makes the DDS); anything else is
// refused at once, with what to do
function picCheck(f) {
  const b = f && f.bytes;
  if (ddsSize(b)) { const why = ddsWhy(b); return why ? { key: 'task.map.e.picDds', params: { why } } : null; }
  let img = null;
  try { const A = require('../../../../artport/artport'); if (b && b.length > 8 && b.readUInt32BE(0) === 0x89504E47) img = A.decodePng(b); else if (b && b.length > 18 && [2, 10].includes(b[2]) && [24, 32].includes(b[16])) img = A.decodeTga(b); } catch (e) { img = null; }
  return img && img.w > 0 && img.h > 0 ? null : 'task.map.e.picBad';
}
// a picture (PNG or TGA bytes) as a 32 bit A8R8G8B8 DDS with every mip map, at w x h
function toDds(buf, w, h) {
  const A = require('../../../../artport/artport');
  let img;
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504E47) img = A.decodePng(buf);
  else if (buf.length > 18 && [2, 10].includes(buf[2]) && [24, 32].includes(buf[16])) img = A.decodeTga(buf);
  else return null;
  const W = w || img.w, H = h || img.h, levels = [];
  for (let lw = W, lh = H; ; lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) { levels.push(A.resize(img, lw, lh)); if (lw === 1 && lh === 1) break; }
  const hd = Buffer.alloc(128);
  hd.write('DDS ', 0, 'latin1'); hd.writeUInt32LE(124, 4); hd.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | 0x20000, 8);
  hd.writeUInt32LE(H, 12); hd.writeUInt32LE(W, 16); hd.writeUInt32LE(W * 4, 20); hd.writeUInt32LE(levels.length, 28);
  hd.writeUInt32LE(32, 76); hd.writeUInt32LE(0x41, 80); hd.writeUInt32LE(32, 88);
  hd.writeUInt32LE(0xff0000, 92); hd.writeUInt32LE(0xff00, 96); hd.writeUInt32LE(0xff, 100); hd.writeUInt32LE(0xff000000, 104);
  hd.writeUInt32LE(0x1000 | 0x8 | 0x400000, 108);
  const parts = [hd];
  for (const l of levels) { const o = Buffer.alloc(l.w * l.h * 4); for (let i = 0; i < l.w * l.h; i++) { o[i * 4] = l.rgba[i * 4 + 2]; o[i * 4 + 1] = l.rgba[i * 4 + 1]; o[i * 4 + 2] = l.rgba[i * 4]; o[i * 4 + 3] = l.rgba[i * 4 + 3]; } parts.push(o); }
  return { buf: Buffer.concat(parts), from: [img.w, img.h], to: [W, H] };
}

// lookup "map": the Maps page list job, with a look at the map's lobby picture (preview.dds), its mods and modes. While the job
// still reads the game the lookup says state running and the page asks again (README Changes 30)
async function lookupMap(ctx, words, opt) {
  // the Maps page route reads the game from its ctx (ctx.gameId(), ctx.exe(): a function each) and ?gid=; the task's lookup ctx
  // may carry the id as a plain string, so the route gets a ctx with functions and the game in the URL
  const gid = gidOf(ctx, opt && opt.game), u = new URL('http://127.0.0.1/api/x/maps/list');
  if (gid !== 'as64') u.searchParams.set('gid', gid);
  const rctx = typeof (ctx && ctx.routeCtx) === 'function' ? ctx.routeCtx() : Object.assign({}, ctx, { gameId: () => gid, exe: () => GM.exeOf(gid), kind: () => GM.kindOf(gid) });
  let r; try { r = await require('../../maps').routes['GET /api/x/maps/list'](u, null, rctx); } catch (e) { return { results: [], state: 'error', why: e.message }; }
  if (!r || r.state !== 'done') return { results: [], state: (r && r.state) || 'error', why: r && r.error };
  const ws = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const results = (r.maps || []).filter(m => m.copy !== false).filter(m => ws.every(w => String(m.key).toLowerCase().includes(w) || String(m.name || '').toLowerCase().includes(w)))
    .map(m => ({ id: m.key, name: (m.name || m.folder || m.key.split('/').pop()) + (m.players ? ' (' + m.players + ')' : ''), where: (m.mods && m.mods.length ? m.mods.join(', ') : 'game'),
      ref: { key: 'resource/' + m.key + '/preview.dds', mods: m.mods || [], modes: m.modes || [] }, sub: (m.modes || []).join(' ') }));
  return { results, state: 'done' };
}
// lookup "object": any entity def a map can hold (place-entity --entity), from the mod and the game
async function lookupObject(ctx, words, opt) {
  const g = gameView(ctx, opt && opt.game); if (!g) return { results: [], state: 'nogame' };
  const ws = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean), out = [];
  for (const k of keysUnder(g, (opt && opt.mod) || ctx.mod || '', 'resource/entity/', [])) {
    const m = /^resource\/entity\/(.*)\/([^/]+)\.def$/.exec(k); if (!m) continue;
    if (!ws.every(w => k.includes(w))) continue;
    out.push({ id: m[2], name: m[2], where: m[1], ref: { key: k }, sub: m[1] });
    if (out.length > 3000) break;
  }
  return out.sort((a, c) => a.id.length - c.id.length || (a.id < c.id ? -1 : 1));
}
// the game view of a compile ctx: c.gameDir (the task's install) with the exe of c.game (the draft's game)
const compView = c => { const gid = gidOf(c, c && c.game); return c && c.gameDir ? { dir: c.gameDir, exe: exeFor(gid), gid } : null; };
const titleOf = (base, folder) => (base && base.name ? String(base.name).replace(/\s*\(\d+\)$/, '') : folder);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || String(a) === String(b);
const num = (v, what) => { const x = Number(String(v).replace(',', '.')); if (!isFinite(x)) throw bad(what + ' must be a number.'); return x; };
const placeQ = (id, kind, extra) => Object.assign({ id, kind, ask: 'task.map.q.' + id, help: 'task.map.h.' + id, when: { place_on: true } }, extra);
const miQ = (id, kind, extra) => Object.assign({ id, kind, ask: 'task.map.q.' + id, help: 'task.map.h.' + id, when: { mi_on: true } }, extra);

module.exports = {
  id: 'map',
  verbs: ['make', 'change'],
  // GoH (map.goh.js): copy, lobby name, players, season, bots and pictures in the GoH forms through the recipe's own route; adding a
  // mode, the per mode group, ranked, the small preview, objects and start points are hidden there ($game) and refused by compile
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 130,
  title: { make: 'task.map.t', change: 'task.map.tc' },
  test: 'task.map.test',
  census: 'map',
  base: { lookup: 'map' },
  groups: [
    { id: 'name', title: 'task.map.g.name', essential: true, q: [
      { id: 'copy', kind: 'yesno', ask: 'task.map.q.copy', help: 'task.map.h.copy' },
      { id: 'name', kind: 'id', ask: 'task.map.q.name', help: 'task.map.h.name', covers: ['copy.name', 'copy.folder'], limits: { re: '^[A-Za-z0-9_]{1,40}$', limit: 'MAP-01' }, when: { copy: true } },
      { id: 'title', kind: 'text', ask: 'task.map.q.title', help: 'task.map.h.title', covers: ['copy.title'], limits: { re: '^[^\\r\\n]{1,120}$', limit: 'LOC-24' } },
    ] },
    { id: 'players', title: 'task.map.g.players', essential: false, q: [
      { id: 'maxplayers', kind: 'number', ask: 'task.map.q.maxplayers', help: 'task.map.h.maxplayers', covers: ['info.maxplayers'], limits: { min: 2, max: 16, step: 2, limit: 'MAP-02' } },
      { id: 'minplayers', kind: 'number', ask: 'task.map.q.minplayers', help: 'task.map.h.minplayers', covers: ['info.minplayers'], limits: { min: 1, max: 16, step: 1, limit: 'MAP-02' } },
      { id: 'ranked', kind: 'yesno', ask: 'task.map.q.ranked', help: 'task.map.h.ranked', covers: ['info.ranked'], limits: { limit: 'MAP-11' } },
    ] },
    { id: 'modes', title: 'task.map.g.modes', essential: false, q: [
      { id: 'mode', kind: 'choice', ask: 'task.map.q.mode', help: 'task.map.h.mode', covers: ['copy.mode'], limits: { values: ['keep', 'combat', 'battle_zones', 'captureflag'], limit: 'MIS-62' } },
      { id: 'flags', kind: 'number', ask: 'task.map.q.flags', help: 'task.map.h.flags', covers: ['points.flags'], limits: { min: 1, max: 9, step: 1, limit: 'MAP-34' }, when: { mode: 'battle_zones' } },
      // GoH: a game mode the map lacks, made from one of the same kind (map.goh.js -> missions/gohmode.js), and new zone outlines
      { id: 'goh_addmode', kind: 'text', ask: 'task.map.q.goh_addmode', help: 'task.map.h.goh_addmode', covers: ['copy.mode'], optional: true, when: { $game: ['goh'] }, limits: { re: '^[A-Za-z0-9_]{0,40}$', limit: 'GHMAP-03' } },
      { id: 'goh_zones', kind: 'text', ask: 'task.map.q.goh_zones', help: 'task.map.h.goh_zones', covers: ['points.flags'], optional: true, when: { $game: ['goh'] }, limits: { re: '^[A-Za-z0-9_:=.,;| \\-]{0,4000}$', limit: 'GHMAP-03' } },
      { id: 'bots', kind: 'yesno', ask: 'task.map.q.bots', help: 'task.map.h.bots', covers: ['copy.bots'], limits: { limit: 'MIS-65' } },
    ] },
    { id: 'modeinfo', title: 'task.map.g.modeinfo', essential: false, q: [
      { id: 'mi_on', kind: 'yesno', ask: 'task.map.q.mi_on', help: 'task.map.h.mi_on' },
      miQ('mi_mode', 'choice', { limits: { values: STOCK } }),
      miQ('mi_maxplayers', 'number', { covers: ['info.mode.maxplayers'], limits: { min: 2, max: 16, step: 2, limit: 'MIS-69' } }),
      miQ('mi_texmod', 'choice', { covers: ['info.mode.texmod'], limits: { values: ['keep', '0', '1', '2', 'd'] } }),
      miQ('mi_parameters', 'text', { covers: ['info.mode.parameters'], optional: true, limits: { re: PARAMS_RE.source, limit: 'MIS-69' } }),
    ] },
    { id: 'look', title: 'task.map.g.look', essential: false, q: [
      { id: 'season', kind: 'choice', ask: 'task.map.q.season', help: 'task.map.h.season', covers: ['info.texmod'], limits: { values: ['0', '1', '2', 'd'] } },
      // GoH: texMod of every <mode>.info, camo or winter (the two the game's maps use)
      { id: 'goh_texmod', kind: 'choice', ask: 'task.map.q.goh_texmod', help: 'task.map.h.goh_texmod', covers: ['info.texmod'], when: { $game: ['goh'] }, limits: { values: ['camo', 'winter'] } },
      // upload takes .dds, .png and .tga only (the three this task can use); PNG and TGA become DDS at Review (toDds)
      { id: 'preview', kind: 'file', ask: 'task.map.q.preview', help: 'task.map.h.preview', covers: ['picture.preview'], picker: { sources: ['keep', 'file', 'ext'], kinds: ['.dds', '.png', '.tga'], ext: ['dds-editor'], check: picCheck } },
      { id: 'preview_small', kind: 'file', ask: 'task.map.q.preview_small', help: 'task.map.h.preview_small', covers: ['picture.preview_small'], picker: { sources: ['keep', 'file', 'ext'], kinds: ['.dds', '.png', '.tga'], ext: ['dds-editor'], check: picCheck } },
      { id: 'minimap', kind: 'file', ask: 'task.map.q.minimap', help: 'task.map.h.minimap', covers: ['picture.minimap'], picker: { sources: ['keep', 'file', 'ext'], kinds: ['.dds', '.png', '.tga'], ext: ['dds-editor'], check: picCheck } },
    ] },
    { id: 'things', title: 'task.map.g.things', essential: false, q: [
      { id: 'place_on', kind: 'yesno', ask: 'task.map.q.place_on', help: 'task.map.h.place_on' },
      placeQ('place_entity', 'thing', { covers: ['place.entity'], limits: { re: '^[A-Za-z0-9_.\\-/]{1,80}$', limit: 'MAP-26' }, picker: { sources: ['keep', 'exist'], lookup: 'object' } }),
      placeQ('place_near', 'text', { covers: ['place.x'], optional: true, limits: { re: '^[A-Za-z0-9_.\\-/]{0,80}$', limit: 'MAP-16' } }),
      placeQ('place_x', 'number', { covers: ['place.x'], limits: { min: -POS_MAX, max: POS_MAX, step: 1, limit: 'MAP-16' } }),
      placeQ('place_y', 'number', { covers: ['place.y'], limits: { min: -POS_MAX, max: POS_MAX, step: 1, limit: 'MAP-16' } }),
      placeQ('place_z', 'text', { covers: ['place.z'], optional: true, limits: { re: '^(-?\\d+([.,]\\d+)?)?$', limit: 'MAP-25' } }),
      placeQ('place_dir', 'number', { covers: ['place.dir'], limits: { min: -180, max: 360, step: 1, unit: 'deg', limit: 'MAP-15' } }),
      placeQ('place_scale', 'number', { covers: ['place.scale'], limits: { min: 0.1, max: 10, step: 0.1, limit: 'MAP-15' } }),
      placeQ('place_tex', 'text', { covers: ['place.tex'], optional: true, limits: { re: '^[A-Za-z0-9_]{0,40}$' } }),
      placeQ('place_more', 'list', { covers: ['place.items'], optional: true, limits: { re: MORE_RE.source, limit: 'MAP-16' } }),
    ] },
    { id: 'ground', title: 'task.map.g.ground', essential: false, q: [
      { id: 'spawns_later', kind: 'yesno', ask: 'task.map.q.spawns_later', help: 'task.map.h.spawns_later', covers: ['points.spawns'], limits: { limit: 'MAP-23' } },
      { id: 'ground', kind: 'handoff', ask: 'task.map.q.ground', help: 'task.map.h.ground', limits: { limit: 'MAP-17' }, picker: { sources: ['keep', 'ext'], ext: ['game-editor'] },
        covers: ['terrain.editor', 'terrain.net.heights', 'terrain.net.type', 'terrain.net.material', 'terrain.ply', 'terrain.mtl', 'terrain.grass', 'file.map.ocean', 'file.map.links_tags_helpers'] },
    ] },
  ],
  kept: [
    // built in steps and values the core fills in
    ['pick.map', 'built in: the "what to copy" step (the base)'],
    ['pick.from_mods', 'built in: taken from the maps list; the copy searches the mods the picked map lives in'],
    ['pick.filter_players', 'built in: the base step searches by words and shows the players in each name'],
    ['pick.filter_mode', 'built in: the base step shows the modes of every map beside it'],
    ['pick.refresh', 'built in: the base step reads the Maps page list job and asks again while it runs'],
    ['copy.mod', 'built in: the mod picked in the first step'],
    ['copy.target', 'built in: set from the game in the header'],
    ['copy.write', 'built in: the Review step runs the plan, the Write step writes'],
    ['place.map', 'built in: the map this task makes or changes'],
    ['place.mods', 'built in: the core runs gen with the mod\'s own dependencies (mod.info Require)'],
    ['place.uid', 'built in: place-entity picks the next free id below 0x8000 (MAP-24)'],
    ['place.write', 'built in: the Review step runs the dry run, the Write step writes'],
    ['picture.terrain_view', 'built in: the look pane shows the map (its lobby picture)'],
    ['check.mod', 'built in: the Check step runs the checker on the mod; this recipe\'s check counts start points (MAP-23)'],
    ['test.map', 'built in: the Test step starts a match on the map'],
    ['test.inst', 'built in: the Test step hands over to the Play page'],
    ['test.dry', 'built in: the Test step hands over to the Play page'],
    ['file.map.land', 'fixed: Position 0 0 on all 75 vanilla maps; the engine places the terrain there'],
    // meaning not proven
    ['info.other_card_keys', '[I] which card keys map.info may override is not proven (census tag I); gen mapinfo writes them unchecked'],
    ['picture.header', '[I] no vanilla map has one, so its file name and format are not known'],
    // no tool step yet
    ['copy.no_mission', 'no tool step yet: gen map-clone has no no_mission (map-clone --no-mission is CLI only)'],
    ['copy.game_version', 'no tool step yet: gen map-clone has no game_version (map-clone --game-version is CLI only)'],
    ['copy.no_modinfo', 'no tool step yet: gen map-clone has no no_modinfo (map-clone --no-modinfo is CLI only)'],
    ['place.remove', 'no tool step yet: place-entity has no --remove or --move'],
    ['file.map.clips.auto.world', 'no tool step yet: no op writes {Clips} (map bounds); the game editor draws them'],
    ['file.map.clips.auto.camera', 'no tool step yet: no op writes {Clips} (camera limits)'],
    ['file.map.clips.auto.pather', 'no tool step yet: no op writes {Clips} (path finder bounds)'],
    ['file.map.clips.auto.distance', 'no tool step yet: no op writes {Clips} (camera distance)'],
    ['file.map.clips.auto.viewangle', 'no tool step yet: no op writes {Clips} (camera angle)'],
    ['file.map.clips.captureflag', 'no tool step yet: only misgen (CLI) writes them; the mode question refuses captureflag on a map without them (MIS-62)'],
    ['file.map.clips.named', 'no tool step yet: no op writes {Clips}; only missions that call set_clip use them'],
    ['terrain.remap', 'no tool step yet: no op writes remap.set rows'],
    ['picture.layer', 'no tool step yet: mapview --layer is CLI only (GET /api/x/maps/picture has no layer)'],
    // a new terrain from nothing: one planned step (a route or gen op for mapgen); until then a new map starts as a copy
    ...['height', 'layers', 'size', 'zmin', 'zmax', 'raw_size', 'clone', 'slots', 'name', 'force'].map(k => ['make.' + k, 'planned: new terrain from nothing needs a route or gen step for mapgen; a new map starts as a copy of a game map']),
    // the 64 bit game skips them; MoW:AS2 likely reads them, and a copy keeps them (MAP-11)
    ['info.ranked_flat', 'not asked: the 64 bit game skips the flat rankedMinPlayers and rankedMaxPlayers (MAP-11); MoW:AS2 3.262 likely reads them [T]; a copy keeps the ones its map.info has'],
  ],
  checklist: ['task.map.c.lobby', 'task.map.c.load', 'task.map.c.players', 'task.map.c.modes', 'task.map.c.things', 'task.map.c.pictures'],
  lookups: { map: lookupMap, object: lookupObject },
  // preselected answers: what the picked map has now; make copies, change works on the map itself
  values: async (ctx, base, opt) => {
    const verb = opt && opt.verb;
    const out = { copy: verb !== 'change', mode: 'keep', bots: false, ranked: false, season: '0', maxplayers: 2, minplayers: 1, flags: 3,
      mi_on: false, mi_mode: 'battle_zones', mi_maxplayers: 2, mi_texmod: 'keep', mi_parameters: '', spawns_later: false,
      place_on: false, place_entity: 'bush8', place_near: '', place_x: 0, place_y: 0, place_z: '', place_dir: 0, place_scale: 1, place_tex: '', place_more: [] };
    if (gidOf(ctx, opt && opt.game) === 'goh') return GOH().values(ctx, base, opt, module.exports._t, out);
    const key = mapKeyOf(base && base.id), g = gameView(ctx, opt && opt.game), mod = ctx.mod || '';
    if (!key || !g) return out;
    const mods = modsOf(base), folder = key.split('/').pop();
    if (!verb) out.copy = !inModDir(mod, key);
    out.name = (folder.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 34) + '_copy');
    // the lookup's name is the lobby name; a copy gets " (copy)" so the lobby never lists two maps with one name
    out.title = titleOf(base, folder) + (out.copy ? ' (copy)' : '');
    await warmView(g, mods);   // SPEED: compile runs right after values with the same game and mods, so it is warm too
    const inf = infoOf(readKey(g, mod, 'resource/' + key + '/map.info', mods));
    if (inf.maxPlayers) out.maxplayers = inf.maxPlayers;
    out.minplayers = inf.minPlayers || 1;
    if (inf.texMod != null) out.season = inf.texMod;
    out.ranked = inf.ranked;
    out.flags = Math.max(1, Math.min(9, out.maxplayers + 1));
    const modes = modesOf(g, mod, key, mods, base), cards = modes.filter(m => STOCK.includes(m)).map(m => cardBots(g, mod, m)).filter(x => x !== null);
    out.bots = cards.length ? cards.every(Boolean) : false;
    out.mi_mode = ['battle_zones', 'combat', 'captureflag'].find(m => modes.includes(m)) || modes[0] || 'battle_zones';
    const mi = infoOf(readKey(g, mod, 'resource/' + key + '/' + out.mi_mode + '.info', mods));
    out.mi_maxplayers = mi.maxPlayers || out.maxplayers;
    out.mi_parameters = mi.parameters || '';
    const mp = readKey(g, mod, 'resource/' + key + '/map', mods);
    if (mp) { const c = {}; for (const m of mp.toString('latin1').matchAll(/\{Entity\s+"([^"]+)"/g)) c[m[1]] = (c[m[1]] || 0) + 1; const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; if (top && ENT_RE.test(top[0])) out.place_entity = out.place_near = top[0]; }
    // the default place: right beside an object the map has (50 map units along x), so a skipped answer still lands on the map
    if (out.place_near) out.place_x = 50;
    return out;
  },
  compile: (draft, c) => {
    if (gidOf(c, c && c.game) === 'goh') return GOH().compile(draft, c, module.exports._t);
    const base = mapKeyOf(c.base && c.base.id);
    if (!base || !/^map\/(multi|single)\/[a-z0-9_\-./]+$/.test(base) || base.includes('..')) throw bad('Pick the map to start from first.');
    const V = c.values || {}, ops = [], copies = [], notes = [], mods = modsOf(c.base), g = compView(c), mod = c.mod;
    const changed = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && !same(c.value(id), V[id]); };
    const copy = yes(c.value('copy') == null ? true : c.value('copy'));
    let key = base;
    if (copy) {
      const name = String(c.value('name') || '');
      if (!NAME_RE.test(name)) throw bad('The new map name may hold English letters, digits and _ only (1 to 40).');
      key = parentOf(base) + '/' + name.toLowerCase();
      if (key === base) throw bad('The copy needs a name of its own, not the name of the map it copies.');
      const op = { op: 'map-clone', map: base, name }; if (mods.length) op.mods = mods;
      ops.push(op);
    } else if (c.verb === 'make') notes.push('No copy: the changes go into the picked map itself (' + base + ').');
    const src = copy ? '' : mod;   // where the map's files are read now: a copy reads the source map
    // a game mode the map does not have yet (mission-clone derives it from one it has)
    const modes = modesOf(g, src, base, mods, c.base), mode = String(c.value('mode') || 'keep'), finalModes = modes.slice();
    if (mode !== 'keep') {
      if (!ADDABLE.includes(mode)) throw bad('That game mode cannot be added here: ' + mode);
      if (modes.includes(mode)) notes.push('The map already has the ' + mode + ' mode; nothing to add.');
      else {
        if (mode === 'captureflag') { const mp = readKey(g, src, 'resource/' + base + '/map', mods), t = mp ? mp.toString('latin1') : ''; if (!/"captureflaga"/i.test(t) || !/"captureflagb"/i.test(t)) throw bad('This map has no captureflag start areas (captureflaga and captureflagb); the game crashes when the mode starts (MIS-62). Pick another mode or another map.'); }
        const from = ADDABLE.find(m => modes.includes(m)) || modes[0] || 'combat';
        const op = { op: 'mission-clone', map: key, from, to: mode };
        if (mode === 'battle_zones' && changed('flags')) op.flags = String(Math.round(num(c.value('flags'), 'The flag count')));
        if (mods.length) op.mods = mods;
        ops.push(op); finalModes.push(mode);
      }
    }
    // map.info: players, season, ranked, the old ranked counts
    const set = {};
    if (changed('maxplayers')) { const n = Math.round(num(c.value('maxplayers'), 'The player count')); if (n < 2 || n > 16 || n % 2) throw bad('Players: an even number from 2 to 16 (the game rounds odd counts up, MAP-02).'); set.maxPlayers = n; }
    if (changed('minplayers')) { const n = Math.round(num(c.value('minplayers'), 'The fewest players')); if (n < 1 || n > 16) throw bad('Fewest players: 1 to 16.'); set.minPlayers = n; }
    const mx = set.maxPlayers != null ? set.maxPlayers : V.maxplayers, mn = set.minPlayers != null ? set.minPlayers : V.minplayers;
    if ((set.maxPlayers != null || set.minPlayers != null) && mx != null && mn != null && mn > mx) throw bad('The fewest players (' + mn + ') are more than the most players (' + mx + ').');
    if (changed('season')) { const s = String(c.value('season')).toLowerCase(); if (!/^([0-9]|d)$/.test(s)) throw bad('Season: 0, 1, 2 or d.'); set.texMod = s; }
    if (changed('ranked')) set.ranked = yes(c.value('ranked'));
    if (Object.keys(set).length) ops.push({ op: 'mapinfo', map: key, set });
    // start points: this task cannot add them (MAP-23). More players than the fewest start points of a mode is refused, unless the
    // user says they add them in the game editor (spawns_later); then the steps go into the notes
    const later = yes(c.value('spawns_later'));
    const spawns = modes.map(m => ({ m, n: spawnsOf(readKey(g, src, 'resource/' + base + '/' + m + '.mi', mods)) })).filter(x => x.n > 0);
    const fewest = spawns.length ? spawns.reduce((a, b) => (b.n < a.n ? b : a)) : null;
    const tooMany = (n, what) => { if (fewest && n > fewest.n && !later) throw bad(what + ' ' + n + ' is more than the start points the map has (' + fewest.n + ' in its ' + fewest.m + ' mode), and this task cannot add start points. Pick ' + fewest.n + ' or fewer, or answer yes to "I will add start points in the game editor" (group Ground and start points) and add them there after Write (MAP-23).'); };
    if (set.maxPlayers != null) tooMany(set.maxPlayers, 'Players:');
    // settings of one mode on this map: <mode>.info. gen mapinfo edits one that is there; a new one is map.info with the edits, staged
    if (yes(c.value('mi_on'))) {
      const mm = String(c.value('mi_mode') || '');
      if (!STOCK.includes(mm)) throw bad('Pick the mode whose settings change on this map.');
      if (!finalModes.includes(mm)) throw bad('This map has no ' + mm + ' mode. It has: ' + (finalModes.join(', ') || 'none') + '.');
      const ms = {};
      if (changed('mi_maxplayers')) {
        const n = Math.round(num(c.value('mi_maxplayers'), 'Players in this mode')); if (n < 2 || n > 16 || n % 2) throw bad('Players in this mode: an even number from 2 to 16 (MAP-02).'); ms.maxPlayers = n;
        const sp = spawns.find(x => x.m === mm); if (sp && n > sp.n && !later) throw bad('Players in ' + mm + ': ' + n + ' is more than its ' + sp.n + ' start points, and this task cannot add start points. Pick ' + sp.n + ' or fewer, or answer yes to "I will add start points in the game editor" (group Ground and start points) (MAP-23).');
      }
      const tm = String(c.value('mi_texmod') == null ? 'keep' : c.value('mi_texmod')).toLowerCase();
      if (tm !== 'keep') { if (!/^([0-9]|d)$/.test(tm)) throw bad('Season of this mode: 0, 1, 2 or d.'); ms.texMod = tm; }
      if (changed('mi_parameters')) { const p = String(c.value('mi_parameters') || '').trim(); if (p && !PARAMS_RE.test(p)) throw bad('Mode rules read name=value;name=value, for example flag_capture_time=40;freezeTime=20 (MIS-69).'); if (p) ms.parameters = p; }
      if (Object.keys(ms).length) {
        const has = !!readKey(g, src, 'resource/' + base + '/' + mm + '.info', mods);
        if (has) ops.push({ op: 'mapinfo', map: key, mode: mm, set: ms });
        else {
          // no <mode>.info yet: start from the map's map.info (with this run's map.info edits) and write it whole
          const patch = require('../../../../patch-entity/patch-entity');
          let buf = readKey(g, src, 'resource/' + base + '/map.info', mods);
          if (!buf) throw bad('The map has no map.info to start the ' + mm + ' settings from.');
          const edits = Object.assign({}, set, ms);
          for (const [k, v] of Object.entries(edits)) {
            if (k === 'ranked') { const r = patch.applyEdit(buf, v ? { op: 'add', path: 'game/ranked', value: '' } : { op: 'del', path: 'game/ranked' }); if (!r.err) buf = r.buf; continue; }
            const r = patch.applyEdit(buf, { op: 'add', path: 'game/' + k, value: k === 'parameters' ? '"' + v + '"' : String(v) });
            if (r.err) throw bad('The ' + mm + ' settings could not be written: ' + r.err[1]);
            buf = r.buf;
          }
          const nm = 'modeinfo_' + mm + '.info';
          fs.mkdirSync(c.staging, { recursive: true }); fs.writeFileSync(path.join(c.staging, nm), buf);
          copies.push({ staged: nm, to: 'resource/' + key + '/' + mm + '.info' });
          notes.push('The map had no ' + mm + '.info: one is made from its map.info with your settings (MIS-69).');
        }
      }
    }
    // objects on the map
    if (yes(c.value('place_on'))) {
      const items = [], ent = String(c.value('place_entity') || '').replace(/\.def$/i, '');
      if (!ENT_RE.test(ent)) throw bad('Pick the object to place.');
      // where positions count from: an object the map has (place_near), else the map's own numbers inside the box of its objects
      const objs = objectsOf(readKey(g, src, 'resource/' + base + '/map', mods)), near = String(c.value('place_near') || '').trim().replace(/\.def$/i, '');
      let at = [0, 0];
      if (near) { const o = objs.find(x => x.name.toLowerCase() === near.toLowerCase()); if (!o) throw bad('No object called ' + near + ' stands on this map. Type the name of one that does (the suggested one does), or leave it empty.'); at = [o.x, o.y]; notes.push('Objects are placed from ' + o.name + ' at ' + o.x + ' ' + o.y + ' in map units; how many units make a metre is not tested in game yet (MAP-16).'); }
      const box = objs.length ? objs.reduce((b, o) => [Math.min(b[0], o.x), Math.min(b[1], o.y), Math.max(b[2], o.x), Math.max(b[3], o.y)], [Infinity, Infinity, -Infinity, -Infinity]) : null;
      const posOf = (x, y, what) => {
        const p = [Math.round((at[0] + num(x, what + ' x')) * 100) / 100, Math.round((at[1] + num(y, what + ' y')) * 100) / 100];
        if (box && (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3])) throw bad(what + ' lands at ' + p.join(' ') + ', outside the area where this map\'s own objects stand (x ' + box[0] + ' to ' + box[2] + ', y ' + box[1] + ' to ' + box[3] + '). Use smaller numbers' + (near ? '' : ', or count from an object on the map') + '.');
        return p;
      };
      const it = { map: key.replace(/^map\//, ''), entity: ent, pos: posOf(c.value('place_x'), c.value('place_y'), 'The object') };
      const z = String(c.value('place_z') == null ? '' : c.value('place_z')).trim(); if (z) it.pos.push(num(z, 'Height'));
      const dir = num(c.value('place_dir') == null ? 0 : c.value('place_dir'), 'The turn'); if (dir) it.dir = String(dir);
      const sc = num(c.value('place_scale') == null ? 1 : c.value('place_scale'), 'The size'); if (sc <= 0 || sc > 10) throw bad('Size: more than 0, at most 10.'); if (sc !== 1) it.scale = String(sc);
      const tex = String(c.value('place_tex') || '').trim(); if (tex) { if (!/^[A-Za-z0-9_]{1,40}$/.test(tex)) throw bad('Texture variant: English letters, digits and _ only.'); it.tex = tex; }
      items.push(it);
      for (const line of [].concat(c.value('place_more') || []).map(String).filter(s => s.trim())) {
        const m = MORE_RE.exec(line); if (!m) throw bad('A line of more objects reads: name x y [turn], in map units, for example: hedge2a 50 -30 90. This one does not: ' + line.slice(0, 80));
        const o = { map: it.map, entity: m[1].replace(/\.def$/i, ''), pos: posOf(m[2], m[3], 'The line ' + m[1]) };
        if (m[4] != null) o.dir = String(num(m[4], 'The turn'));
        items.push(o);
      }
      ops.push({ op: 'place', items });
      notes.push('Objects are placed in map units, the units of the map file; which way x and y run on screen is not tested in game yet (MAP-16). Every player needs the mod (VFS-29).');
    }
    // bots on the modes of the map (the mode card: every map of that mode while the mod is on)
    if (changed('bots')) {
      const want = yes(c.value('bots')), rows = [];
      for (const m of finalModes.filter(x => STOCK.includes(x))) {
        const has = cardBots(g, mod, m);
        if (has === null) { notes.push('No card for the ' + m + ' mode; bots not changed there.'); continue; }
        if (want && !has) rows.push({ entity: 'file:resource/set/multiplayer/games/' + m + '.set', path: 'game/settings/enableBots', value: '', op: 'add' });
        if (!want && has) rows.push({ entity: 'file:resource/set/multiplayer/games/' + m + '.set', path: 'game/settings/enableBots', op: 'del' });
      }
      if (rows.length) { ops.push({ op: 'set', rows }); notes.push('Bots: the mode card changes for every map of that mode while the mod is on.'); }
      if (want && finalModes.includes('combat') && finalModes.length === 1) notes.push('Bots on combat buy units but give no orders: combat has no flags (MIS-65).');
    }
    // lobby name: gen text. A copy names its own mission/<map>.lng (LOC-24); a game map changed in place leaves the file to gen,
    // which writes the key into a mod copy of the game's own file (a game key wins over a mod '#' file, LOC-19)
    // a copy always gets its lobby name (the default ends in " (copy)"); the name of the map it copies is refused
    const title = String(c.value('title') == null ? V.title || '' : c.value('title')).trim();
    if (copy && title && title.toLowerCase() === titleOf(c.base, base.split('/').pop()).toLowerCase()) throw bad('The copy needs a lobby name of its own: "' + title + '" is the name of the map it copies, so the lobby would list two maps with one name.');
    if (changed('title') || (copy && title)) {
      if (!title || /[\r\n]/.test(title) || title.length > 120) throw bad('The lobby name: one line, 1 to 120 signs.');
      const rel = key.replace(/^map\//, ''), t = { op: 'text', key: 'mission/' + rel + '/name', text: title };
      if (copy || inModDir(mod, base)) t.file = 'mission/' + rel + '.lng';
      ops.push(t);
    }
    // pictures: a DDS goes in as it is; a PNG or TGA becomes a 32 bit DDS at the size of the picture the map has now
    for (const q of PICS) {
      const a = c.answer(q);
      if (a && a.src === 'ext') { notes.push('Picture ' + q + ': save it in the outside program as DDS, PNG or TGA, then bring the file back to this step.'); continue; }
      if (!a || a.src !== 'file' || !(a.staged || []).length) continue;
      const f = [].concat(c.value(q) || [])[0];
      let buf = null; try { buf = fs.readFileSync(f); } catch (e) { throw bad('The picture for ' + q + ' could not be read again. Bring it to this step once more.'); }
      const to = 'resource/' + key + '/' + q + '.dds';
      if (ddsSize(buf)) {
        const why = ddsWhy(buf);
        if (why) throw bad('The DDS picture for ' + q + ' is in a form the game cannot load (' + why + '). Save it again as DXT1, DXT5 or 32 bit DDS, or bring a PNG or TGA.');
        copies.push({ staged: String(a.staged[0]), to }); continue;
      }
      const now = ddsSize(readKey(g, src, 'resource/' + base + '/' + q + '.dds', mods)), size = now || PIC_SIZE[q] || null;
      let d = null; try { d = toDds(buf, size && size[0], size && size[1]); } catch (e) { throw bad('The picture for ' + q + ' could not be read: ' + e.message + '. Save it again as PNG or TGA (24 or 32 bit) and bring it back.'); }
      if (!d) throw bad('The picture for ' + q + ' is not a DDS, PNG or TGA file. Save it as one of those and bring it back.');
      const nm = 'picture_' + q + '.dds';
      fs.mkdirSync(c.staging, { recursive: true }); fs.writeFileSync(path.join(c.staging, nm), d.buf);
      copies.push({ staged: nm, to });
      const stretched = d.from[0] * d.to[1] !== d.from[1] * d.to[0];
      notes.push('Picture ' + q + ': made into a 32 bit DDS at ' + d.to.join('x') + (d.from.join('x') !== d.to.join('x') ? ' from ' + d.from.join('x') + (stretched ? ' (stretched: the sides do not keep their ratio)' : '') : '') + '.');
    }
    const steps = what => 'After Write: 1. Start the game editor (' + editorOf(gidOf(null, c.game)) + ' in the game folder) with this mod on; this task never starts it. 2. Open the map ' + key.split('/').pop() + '. 3. ' + what + ' 4. Come back to this task and press Check.';
    if (later) notes.push('Start points: ' + steps('Open each mode file (.mi) and put one start point per player on each side; save.') + ' Check counts the start points of each mode (MAP-23).');
    const gr = c.answer('ground');
    if (gr && gr.src === 'ext') notes.push('Ground: ' + steps('Draw the ground and save after every change to the land; land changed and not saved is lost (MAP-17).'));
    return { gen: ops.length ? { ops } : null, copies, notes, result: key };
  },
  // after the check view: start points of each mode against the players (MAP-23), and bots on modes without flags (MIS-65)
  check: async (draft, ctx) => {
    if (gidOf(ctx, draft.game) === 'goh') return GOH().check(draft, ctx, module.exports._t);
    const g = gameView(ctx, draft.game), mod = draft.mod || ctx.mod || '', a = draft.answers || {}, v = x => (a[x] && a[x].src === 'value' ? a[x].value : undefined);
    const base = mapKeyOf(draft.base && draft.base.id); if (!base || !g) return [];
    const key = v('copy') === false || v('copy') === 'false' ? base : v('name') ? parentOf(base) + '/' + String(v('name')).toLowerCase() : base;
    const mods = modsOf(draft.base); await warmView(g, mods);
    const inf = infoOf(readKey(g, mod, 'resource/' + key + '/map.info', mods)), players = inf.maxPlayers || 2, cards = [];
    const lines = [], warn = [];
    for (const m of modesOf(g, mod, key, mods, draft.base)) {
      const mi = readKey(g, mod, 'resource/' + key + '/' + m + '.mi', mods), n = spawnsOf(mi);
      lines.push(m + ': ' + n + ' start points for ' + players + ' players');
      if (n && n < players) warn.push(m + ': fewer start points (' + n + ') than players (' + players + '); some players start on top of others (MAP-23)');
      if (mi && cardBots(g, mod, m) && !/"flag_point/i.test(mi.toString('latin1'))) warn.push(m + ': bots are on but the mission has no flags; bots buy units and give no orders (MIS-65)');
    }
    cards.push({ title: 'Start points (' + key + ')', lines, level: 'info' });
    if (warn.length) cards.push({ title: 'Start points and bots', lines: warn, level: 'warn' });
    return cards;
  },
  // own route: the GoH write (map.goh.js route: lib/modwrite, restore point first)
  routes: { 'POST /api/x/task/r/map/goh': (u, b, ctx) => GOH().route(u, b, ctx) },
  _t: { MORE_RE, picCheck, ddsWhy, readKey, keysUnder, live, mapKeyOf, modsOf, modesOf, infoOf, cardBots, spawnsOf, objectsOf, toDds, ddsSize, lookupMap, vfsOf, warmView, same, num, inModDir, STOCK, gidOf, exeFor, editorOf, gameView, compView, titleOf, parentOf, yes },
};
// GoH: the AS2 only questions are hidden there (map.goh.js refuses them too)
for (const g of module.exports.groups) for (const x of g.q) if (['mode', 'mi_on', 'season'].includes(x.id)) x.when = Object.assign({}, x.when, { $game: AS2 });
