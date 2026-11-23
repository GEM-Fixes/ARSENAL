#!/usr/bin/env node
// milint: mission + map + MP-preset linter. rows MIS-02..06,08..10,13,14,17..19,21,24 MAP-01..03,09,10,11,12..15,18
//   node milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q]   mod dir under <game>/mods auto-mounts
//   node milint.js --vfs [--game dir] [--exe ..] [-q]                 whole vanilla index (consistency run); --rc F --no-rc --format F -o FILE
// codes (finding = counted; hints via info):
//   MAP_MODE_UNDEFINED (MAP-01,MIS-24) MAP_NO_MODE (MIS-24) MAP_PLAYERS (MAP-02) MAP_MATERIAL_SHADOWED (MAP-03)
//   MAP_PATCH_MISSING MAP_PATCH_ID (MAP-09) MAP_MOD_FOLDER (MAP-10) info MAP_RANKED_FLAT (MAP-11) MAP_CLIP_OBSOLETE (MAP-12)
//   MI_HELPER_UNKNOWN (MAP-13) MI_PLAYERS (MAP-14) MAP_XFORM_TOKEN (MAP-15) MAP_SLOPE_TABLE (MAP-18)
//   MIS_BALANCE_NO_CHARGE (02) MIS_UNITSET_EXCLUDE_ONLY (03) MIS_LIMITS_FORMAT (04) MIS_BUDGET_NO_VEHICLE (05)
//   MIS_PAYBACK_FORMAT (06) MIS_BUDGET_PARAM (14,17) info MIS_RESTORE_DEAD (14) MIS_TEAMKEY_UNREAD (18) MIS_CLASS_NO_MI (19)
//   MIS_DURATION (21) WARN_MIS_BOT_ORDER (08) MIS_BOT_ARMY_MISSING (09) MIS_BOT_DEAD_KEY (10) MIS_BOT_UNIT_UNKNOWN (13)
//   map.net (lib/mapnet): MAP_TERRAIN_UNKNOWN MAP_NET_ID_RANGE (MAP-04) MAP_WATER_PASSABLE (MAP-05) MAP_NET_FORMAT WARN_MAP_NET_NO_GROUND (MAP-08)
//   WARN_MAP_NET_ID_UNLISTED (cell id missing from the file's name table)
// .mi triggers/scripts (mi.js, vocabulary micommands.json from gen-micommands.js; MIS-01/11 for mission scripts):
//   MI_CMD_UNKNOWN MI_TERM_UNKNOWN MI_TRIGGER_KEY MI_COND_EXPR MI_KEY_CASE WARN_MI_KEY_UNKNOWN WARN_MI_ENTITY_DUP
//   WARN_MI_LINK_REF WARN_MI_MID_REF WARN_MI_{ZONE,EVENT,TRIGGER,WAYPOINT,TASK,VAR}_REF WARN_MI_SPAWN_COUNT
// MIS-01/11 = keylint (KEY_CASE, WARN_UNKNOWN_KEY).
// CHK-MI: MI_MAP_POINT_MISSING (TST-34) MAP_CAPTURE_CLIPS (MIS-62) MIS_BOT_NO_FLAGS (MIS-65) WARN_MIS_UNIT_LEVEL_OFF (MIS-15)
//   MIS_CP_POOL_OVERLAP (MIS-22) MIS_ARMY_ID_NEGATIVE (MIS-07) WARN_MIS_FIX_INVENTORY (MIS-67) WARN_MAP_PATCH_DELETE_OWN (KEY-23)
// INCLUDE_MISSING: a map/.mi (include "..") that resolves nowhere (game, mods, folder): crash at load [V chain-n g1]
// --exe as64|mowas_2|mowas2|goh: the game whose files and rules apply (lib/games). none = as before (vfs picks: as64.exe first).
//   mowas_2: same rules as as64 (same data forms), the vfs view has no as64/core. --exe goh with no --game: the GoH install (games.install).
//   goh (the vfs exe goh, also picked from call_to_arms.exe): own tables, every one cited:
//     bot orders = GoH BotCommands (GHMIS-54 [V]): CaptureFlag SeekAndDestroy Spawn SpawnAt CanSpawn IsUnitAvailable TimeToSpawnUnit SayChat GameOver Income
//     WARN_MIS_BOT_EVENT_NUMBER  BotApi.Events:Subscribe(<number>): GoH numbers differ from as64 (GHMIS-51 [V]); subscribe by name
//     WARN_MIS_BOT_EVENT_UNKNOWN BotApi.Events.<Name> that GoH does not have (GHMIS-51 [V]: Init Done GameStart PrepTimeOver WinnerDecided GameEnd Quant GameSpawn NonQuant Waypoint)
//     map.net version below 2 = MAP_NET_FORMAT: GoH always reads the v2 layout (GHMAP-16 [V])
//     maxPlayers from the mode's own <mode>.info {game {maxPlayers}} (GoH maps have no map.info; vanilla shape [I]); MAP_PLAYERS on GoH reads that <mode>.info:
//     odd maxPlayers rounded up to even, max and ranked clamped to 2..16 (GoH); minPlayers not checked on GoH
//     .mi vocabulary = micommands.json + micommands-goh.json (mi.js; GHMIS-29/30/32/33, modweb mission/goh-*), zoneId rule WARN_MI_ZONEID_REF (GHMAP-03)
//     no bot.data.lua in GoH (GHMIS-66): the bot.data checks find nothing to read; MIS_BOT_NO_FLAGS (MIS-65, AS2 bot.lua) is not run
//     MIS_BALANCE_NO_CHARGE and WARN_MIS_UNIT_LEVEL_OFF are info under GoH (AS2 rules; GoH vanilla ships 672 and 4 of them)
//     the vanilla run (--vfs --exe goh, 2026-11-14) gives no MI_CMD_UNKNOWN / WARN_MI_KEY_UNKNOWN / MAP_NET_FORMAT / WARN_MI_ZONEID_REF
//     GOH_OFF (below): codes that fired on the 2026-11-23 vanilla run or are AS2-only rules are not reported under GoH; each group is one
//     info line GOH_NOT_CHECKED "not checked for GoH: <codes>: <reason>" (with -q on stderr). Vanilla GoH run after that: 0 findings
// Author: Imperator_Aug (ARSENAL, ia-4cfbea66)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const mapnet = require('../lib/mapnet');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx'), pak = require('../lib/pak');
const { createReport, relPath } = require('../lib/report');
const { lintMi } = require('./mi');

const MP_MAX_PLAYERS = 16;                 // console var t mp_maxPlayers default
const PLAYER_COUNT = 18;                   //
const HELPERS = new Set('waypoints zones zone triggers events event edifices cameras tasks reinforcements vars functions mission_options modifiers'.split(' '));
const XFORM = new Set(['zl', 'zw', 'y', 'scale']);
const DURATIONS = new Set(['10 min', '15 min', '20 min', '25 min', '30 min', '40 min', '50 min', '60 min', '90 min', '120 min']);
const BOT_ORDERS = new Set(['spawn', 'captureflag', 'saychat', 'income', 'enemyhastanks'])   // orders + queries (bot-lua.md);
const BOT_ORDERS_GOH = new Set(['captureflag', 'seekanddestroy', 'spawn', 'spawnat', 'canspawn', 'isunitavailable', 'timetospawnunit', 'saychat', 'gameover', 'income']);   // GHMIS-54
const BOT_EVENTS_GOH = new Set(['init', 'done', 'gamestart', 'preptimeover', 'winnerdecided', 'gameend', 'quant', 'gamespawn', 'nonquant', 'waypoint']);   // GHMIS-51
// GoH: checks whose rule is not known to hold for GoH. Not reported under GoH; each group is listed as info GOH_NOT_CHECKED
// "not checked for GoH: <codes>: <reason>" (CLI -q: on stderr). The bar: a GoH check gives no finding on the game's own files; these fired
// on the vanilla run (--vfs --exe goh, 2026-11-23: 353 findings, all of these codes) or are AS2 engine rules with no GoH row. [T] none run in game.
// The undefined-name checks (WARN_MI_*_REF) run under GoH for names the mission itself uses; a name used inside a shared include is not
// checked (mi.js fromInc): vanilla GoH shares one script include between maps that each define only their own lanes. The 85 sites (61 names) the
// vanilla missions use and define nowhere (2026-11-23 run: "[events]/x" where the trigger is "[events]/[part1]/x", task "undefined", ...)
// are in known-vanilla-goh.txt (file, code, the name; no line) and shown as info "[known vanilla defect]"; any other name is reported.
const GOH_OFF = [
  [['WARN_MI_POSE_AT_START', 'WARN_MI_ACTOR_STATE_ALL', 'WARN_MI_NEAR_DISTANCE'], 'AS2 engine behaviour (first-tick pose, actor_state on entities with no brain MIS-40, near distance in metres); vanilla GoH missions do this, the GoH effect is not known'],
  [['MI_COND_EXPR'], 'the GoH condition lexer is not fully known: a vanilla GoH mission has a "$" in its expression and loads'],
  [['MIS_BUDGET_PARAM'], 'GoH budget parameter rules are not known: vanilla GoH frontlines budget_attacker_custom.inc sets a period on a custom budget'],
  [['MIS_BOT_NO_FLAGS', 'MIS_BOT_ARMY_MISSING', 'MIS_BOT_DEAD_KEY', 'MIS_BOT_UNIT_UNKNOWN'], 'AS2 bot.lua / bot.data.lua rules; GoH has no bot.data.lua (GHMIS-66)'],
];
const GOH_OFF_CODES = new Set(GOH_OFF.flatMap(g => g[0]));
// known vanilla GoH faults: "<file>\t<CODE>\t<name, JSON>", name = the first quoted name of the finding, else its first number
let KNOWN_GOH = null;
const knownGoh = () => KNOWN_GOH || (KNOWN_GOH = new Set(fs.readFileSync(path.join(__dirname, 'known-vanilla-goh.txt'), 'utf8').split(/\r?\n/).filter(l => l && l[0] !== ';')));
const knownKey = (rel, code, msg) => { const m = /"([^"]*)"/.exec(msg) || /(\d+)/.exec(msg); return String(rel).replace(/\\/g, '/') + '\t' + code + '\t' + JSON.stringify((m ? m[1] : '').toLowerCase()); };
const games = require('../lib/games');
const NEW_CLASSES = new Set(['armored_warfare', 'combined_arms']);

// ---- light tree: {name, vals:[{k,text,value}], kids:[lite], line, file}; MOD blocks are flattened (content kept)
function lite(b) {
  const o = { name: null, vals: [], kids: [], line: b.line, file: b.file, disabled: !!b.disabled };
  const walk = items => {
    for (const it of items) {
      if (it.k === 'BLOCK') o.kids.push(lite(it));
      else if (it.k === 'MOD') walk(it.items);
      else if (o.name === null && !o.named && (it.k === 'IDENT' || it.k === 'STRING')) { o.name = it.k === 'STRING' ? it.value : it.text; o.named = true; }
      else o.vals.push({ k: it.k, text: it.text, value: it.k === 'STRING' ? it.value : it.value !== undefined ? it.value : it.text });
    }
  };
  walk(b.items);
  return o;
}
const lc = s => (s == null ? '' : String(s)).toLowerCase();
const kid = (n, name) => n.kids.find(k => lc(k.name) === lc(name));
const kidsOf = (n, name) => n.kids.filter(k => lc(k.name) === lc(name));
const str = (n, name) => { const k = kid(n, name); return k && k.vals.length ? String(k.vals[0].value) : null; };
const num = (n, name) => { const k = kid(n, name); if (!k || !k.vals.length) return null; const v = Number(k.vals[0].value); return isNaN(v) ? null : v; };
const ser = ns => ns.map(n => '{' + lc(n.name) + ' ' + n.vals.map(v => v.text).join(' ') + ser(n.kids) + '}').join('');
// library entry e is covered by mtl block m: same layers, every key of e present with equal value in m (library omits defaults)
const covered = (e, m) => {
  const a = e.kids, b = m.kids;
  return a.length === b.length && a.every((x, i) => lc(x.name) === lc(b[i].name) && x.vals.map(v => v.text).join(' ') === b[i].vals.map(v => v.text).join(' ') && x.kids.every(y => b[i].kids.some(z => ser([y]) === ser([z]))));
};
function each(n, f, depth = 0) { f(n, depth); for (const k of n.kids) each(k, f, depth + 1); }

function check(o) {
  const rep = createReport();
  let mods = o.mods;
  if (!mods && o.folder && o.gameDir && path.dirname(path.resolve(o.folder)).toLowerCase() === path.resolve(o.gameDir, 'mods').toLowerCase()) mods = [path.basename(path.resolve(o.folder))];
  const src = sdlset.createSource({ gameDir: o.gameDir, mods, folder: o.folder, exe: games.exeOf(o.exe) || undefined });
  const exe = src.v ? src.v.exe : (games.exeOf(o.exe) || 'as64'), goh = exe === 'goh';   // the game whose rules apply
  const vfsMode = !!o.vfs;
  const all = new Set([...(src.v ? src.v.files.keys() : []), ...src.local.keys()]);
  const inRes = k => !src.hasRes || relPath(src.folder, src.local.get(k)).toLowerCase().startsWith('resource/');   // VFS-26: with resource/ only it is mounted
  const mine = new Set(vfsMode ? all : [...[...src.local.keys()].filter(inRes), ...(src.v ? [...src.v.files.keys()].filter(k => src.isModKey(k)) : [])]);
  const shown = k => (src.local.has(k) ? relPath(src.folder, src.local.get(k)) : k);
  if (goh) {   // GoH: rules not known for GoH are not reported (GOH_OFF); a known vanilla GoH site is info
    const add0 = rep.add;
    rep.add = (rel, line, code, msg) => { if (GOH_OFF_CODES.has(code)) return; if (knownGoh().has(knownKey(rel, code, msg))) rep.info(rel, line, code, msg + ' [known vanilla defect]'); else add0(rel, line, code, msg); };
  }
  const R = {};
  let known = null, defIndex = null, unitInfo = null;
  const add = (k, line, code, msg) => rep.add(shown(k), line, code, msg);
  const addAt = (k, n, code, msg) => rep.add(n.file || shown(k), n.line, code, msg);   // node may come from an include (.inc): cite that file
  const hint = (k, line, code, msg) => rep.info(shown(k), line, code, msg);
  const gohSoft = (k, n, code, msg) => (goh ? rep.info(n.file || shown(k), n.line, code, msg + ' [AS2 rule; GoH vanilla ships this, GoH effect unverified]') : addAt(k, n, code, msg));
  const trees = new Map(), mapIdCache = new Map();
  const incMiss = new Map();                  // map/mission key -> [{file,line,msg}] INCLUDE_MISSING from the sdlx read
  const tree = key => {                       // lite root (children of file root) or null; errors ignored (sdllint's job)
    if (trees.has(key)) return trees.get(key);
    let t = null;
    try {
      const r = src.read({ key, file: key, get: () => src.get(key) }, (file, line, code, msg) => {   // only a missing include is ours: the engine stops the load (chain-n g1)
        if (code === 'INCLUDE_MISSING' && key.startsWith('resource/map/')) (incMiss.get(key) || incMiss.set(key, []).get(key)).push({ file, line, msg });
      });
      if (r) t = lite(r.root);
    } catch (e) { t = null; }
    if (!key.startsWith('resource/map/')) trees.set(key, t);   // map/mission trees are big: not cached
    return t;
  };
  const text = key => { const b = src.get(key); return b ? b.toString('latin1') : ''; };
  const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
  const baseOf = k => k.slice(k.lastIndexOf('/') + 1);

  // ---------- maps: mode files
  const gameSets = new Set();
  for (const k of all) { const m = k.match(/^resource\/set\/multiplayer\/games\/([^/]+)\.set$/); if (m) gameSets.add(m[1].toLowerCase()); }
  const miTitles = new Set();
  const mapDirs = new Map();                   // dir -> {mode:[keys]}
  for (const k of all) {
    if (!k.startsWith('resource/map/multi/')) continue;
    const b = baseOf(k), d = dirOf(k);
    if (b === 'map') (mapDirs.get(d) || mapDirs.set(d, { modes: [] }).get(d));
    if (b.endsWith('.mi')) miTitles.add(b.slice(0, -3));
  }
  for (const k of all) {
    if (!k.startsWith('resource/map/multi/') || !k.endsWith('.mi')) continue;
    const title = baseOf(k).slice(0, -3), d = dirOf(k);
    const md = mapDirs.get(d); if (md && gameSets.has(title)) md.modes.push(k);
  }
  for (const k of all) {
    if (!k.startsWith('resource/map/multi/') || !k.endsWith('.mi') || !mine.has(k)) continue;
    const title = baseOf(k).slice(0, -3), md = mapDirs.get(dirOf(k));
    if (gameSets.has(title)) continue;
    // engine skips only this mission ("game type undefined", ); a folder that still has a valid mode file stays listed -> stray leftover (0.mi, test.mi), harmless
    if (md && md.modes.length) hint(k, 0, 'MAP_MODE_UNDEFINED', `no set/multiplayer/games/${title}.set: this mission file is skipped (stray; other mode files keep the map listed)`);
    else add(k, 0, 'MAP_MODE_UNDEFINED', `no set/multiplayer/games/${title}.set: map is skipped in the lobby (game type undefined)`);
  }
  for (const [d, md] of mapDirs) {
    if (!mine.has(d + 'map')) continue;
    if (!md.modes.length) add(d + 'map', 0, 'MAP_NO_MODE', 'map folder has no <mode>.mi whose mode has a games/*.set: not listed in any mode');
  }

  // ---------- per-file checks
  for (const k of mine) {
    const b = baseOf(k), isMap = k.startsWith('resource/map/');
    if (isMap && (b === 'map' || b.endsWith('.mi'))) mapFile(k, b === 'map');
    if (isMap && (goh ? b.endsWith('.info') && b !== 'map.info' : b === 'map.info')) mapInfo(k);   // GoH: the mode's <mission>.info {game} (no map.info)
    if (isMap && b === 'map.net') mapNet(k);
    if (isMap && b.endsWith('.info') && b !== 'map.info') durations(k);
    if (/^resource\/map\/.*\/mod\//.test(k) && !k.endsWith('/')) add(k, 0, 'MAP_MOD_FOLDER', 'file in map mod/ folder: moved over the game resource dir at load (destructive)');
    if (isMap && b === '.materials' || (isMap && b.endsWith('.materials'))) materials(k);
    if (k.startsWith('resource/set/multiplayer/games/') && /\.(set|inc)$/.test(k)) preset(k);
    if (k === 'resource/set/pather.set' || /\/pather[^/]*\.set$/.test(k)) pather(k);
    if (k.startsWith('resource/script/multiplayer/') && k.endsWith('.lua')) lua(k);
    if (/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/.test(k)) army(k);
    if (k.startsWith('resource/') && k.endsWith('.ext')) fixInventory(k);
  }
  patches();
  botData();
  if (goh) for (const [codes, why] of GOH_OFF) rep.info('-', 0, 'GOH_NOT_CHECKED', 'not checked for GoH: ' + codes.join(' ') + ': ' + why);
  return rep;

  // ---- map / mission files
  function mapFile(k, isMapFile) {
    const t = tree(k);
    for (const e of incMiss.get(k) || []) rep.add(e.file === k ? shown(k) : e.file, e.line, 'INCLUDE_MISSING', `${e.msg}: the engine stops the map load ("file not found"); copy the include into the mod or drop it`);
    if (!t) return;
    const topName = isMapFile ? 'map' : 'mission';
    for (const top of t.kids) {
      if (lc(top.name) !== topName) continue;
      for (const c of top.kids) if (isMapFile && lc(c.name) === 'clip') addAt(k, c, 'MAP_CLIP_OBSOLETE', 'obsolete {Clip} block: engine warns "Obsolete block clip. Resave map"');
      each(top, n => {
        if (lc(n.name) !== 'xform') return;
        const toks = n.vals.filter(v => v.k === 'IDENT' || v.k === 'STRING');
        for (const v of toks) if (!XFORM.has(lc(v.text))) addAt(k, n, 'MAP_XFORM_TOKEN', `xform token '${v.text}' (only zl zw y scale): engine reports unexpected token`);
        for (const c of n.kids) addAt(k, c, 'MAP_XFORM_TOKEN', `xform sub-block {${c.name}}: only tokens zl zw y scale are read`);
      });
      each(top, n => {                         // MAP-25: Entity {Position x y [z]}, third number = fixed height
        if (lc(n.name) !== 'entity') return;
        for (const p of kidsOf(n, 'Position'))
          if (p.vals.length < 2 || p.vals.length > 3 || p.vals.some(v => isNaN(Number(v.value)))) addAt(k, p, 'WARN_MAP_POSITION', `Position has ${p.vals.length} value(s): reader takes 'x y [z]' (3rd = fixed height; omit to snap to terrain)`);
      });
      if (isMapFile) continue;
      modeFlags(k, top);
      const h = kid(top, 'Helpers');
      if (h) for (const c of h.kids) if (c.name !== null && !HELPERS.has(lc(c.name))) addAt(k, c, 'MI_HELPER_UNKNOWN', `Helpers sub-block '${c.name}' unknown: engine reports unexpected token`);
      const pl = kid(top, 'Players'); if (pl) players(k, pl);
      let maxPlayers = null;
      if (k.startsWith('resource/map/multi/')) {   // GoH: no map.info, each mode has its own <mode>.info {game {maxPlayers}}
        const mi = tree(goh ? k.slice(0, -3) + '.info' : dirOf(k) + 'map.info'), g = mi && mi.kids.find(x => lc(x.name) === 'game');
        if (g) maxPlayers = num(g, 'maxPlayers');
      }
      lintMi({ k, top, add, hint, maxPlayers, mapIds: () => mapEntityIds(dirOf(k)), defCat, game: goh ? 'goh' : 'as2' });
      if (maxPlayers && gameSets.has(baseOf(k).slice(0, -3))) mapPoints(k, top, maxPlayers);
      if (baseOf(k) === 'captureflag.mi' && k.startsWith('resource/map/multi/')) captureClips(k);
    }
  }
  // TST-85: def name -> static category (flora, landscape, construction except entourage); null = actor, unknown or ambiguous
  function defCat(name) {
    if (!defIndex) {
      defIndex = new Map();
      const put = (n, c) => { if (!n) return; const p = defIndex.get(n); defIndex.set(n, p === undefined || p === c ? c : null); };
      for (const kk of [...all].sort()) {
        const m = kk.match(/^resource\/entity\/(.+)\.def$/); if (!m) continue;
        const parts = m[1].split('/'), cat = parts[0] === 'construction' && parts[1] === 'entourage' ? 'entourage' : parts[0];
        const c = /^(flora|landscape|construction)$/.test(cat) ? cat : '';
        put(parts[parts.length - 1], c); put(parts.slice(1).join('/'), c); put(parts.slice(1, -1).join('/'), c);
      }
    }
    return defIndex.get(lc(name)) || null;
  }
  // TST-34: each lobby slot needs a map point team(a|b) order(1..maxPlayers/2), or an order-0 point of that team
  function mapPoints(k, top, mx) {
    const pts = { a: new Set(), b: new Set() };
    const scan = t => each(t, n => {
      if (lc(n.name) !== 'extender' || !n.vals.length || lc(n.vals[0].value) !== 'map_point') return;
      const tm = lc(str(n, 'team') || ''), od = num(n, 'order'), vis = lc(str(n, 'visor') || '');
      if ((tm === 'a' || tm === 'b') && !/flag/.test(vis)) pts[tm].add(od === null ? 0 : od);
    });
    scan(top);
    const d = dirOf(k); if (src.get(d + 'map')) { const t = tree(d + 'map'); if (t) scan(t); }
    const need = Math.ceil(mx / 2);
    for (const tm of ['a', 'b']) {
      if (pts[tm].has(0)) continue;
      const miss = []; for (let i = 1; i <= need; i++) if (!pts[tm].has(i)) miss.push(i);
      if (miss.length) addAt(k, top, 'MI_MAP_POINT_MISSING', `map.info maxPlayers ${mx} needs map points team(${tm}) order(1..${need}); order ${miss.join(' ')} missing: fatal "MapPoint not found" when that slot is filled; add map_point entities with {team ${tm}} {order n}`);
    }
  }
  // MIS-62: captureflag needs clippers captureflaga and captureflagb in the map's {Clips}
  function captureClips(k) {
    const d = dirOf(k), mk = d + 'map';
    if (!src.get(mk)) return;
    const t = tree(mk); if (!t) return;
    const names = new Set();
    for (const top of t.kids) if (lc(top.name) === 'map') for (const c of kidsOf(top, 'Clips')) for (const e of c.kids) if (e.name) names.add(lc(e.name));
    const miss = ['captureflaga', 'captureflagb'].filter(n => !names.has(n));
    if (miss.length) (vfsMode ? hint : add)(mk, 0, 'MAP_CAPTURE_CLIPS', `captureflag.mi beside this map, but {Clips} lacks ${miss.join(', ')}: crash at start "Clipper 'captureflaga' is not found!"; add both clip blocks (copy "[auto]", cut to each team's half) or drop captureflag.mi`);
  }
  // MAP-20: mode .mi differences (vanilla 64/64 combat none, 74/74 battle_zones flag_point_N, 21/21 captureflag flag_point_frontlines)
  function modeFlags(k, top) {
    if (!k.startsWith('resource/map/multi/')) return;
    const mode = baseOf(k).slice(0, -3), defs = [];
    for (const e of top.kids) if (lc(e.name) === 'entity' && e.vals.length && /^flag_point/i.test(String(e.vals[0].value))) defs.push(lc(String(e.vals[0].value)));
    const numbered = defs.filter(d => /^flag_point_[0-9]+$/.test(d)).length, front = defs.filter(d => d === 'flag_point_frontlines').length;
    if (mode === 'combat' && defs.length) addAt(k, top, 'WARN_MAP_MODE_FLAGS', `combat.mi has ${defs.length} flag_point entities; vanilla combat maps have spawn map_points only (flags belong to battle_zones.mi)`);
    else if (/^battle_zones/.test(mode) && !numbered) addAt(k, top, 'WARN_MAP_MODE_FLAGS', `${mode}.mi has no flag_point_N entities: vanilla battle_zones maps hand-place maxPlayers+1 flags (MAP-20)`);
    else if (mode === 'captureflag' && !front) addAt(k, top, 'WARN_MAP_MODE_FLAGS', 'captureflag.mi has no flag_point_frontlines entity (vanilla: one, name captureflag)');
    if (!goh && !defs.length && gameSets.has(mode) && botsOn(mode) && !/"flag_point/i.test(text(dirOf(k) + 'map'))) addAt(k, top, 'MIS_BOT_NO_FLAGS', `games/${mode}.set enables bots but ${mode}.mi has no flag_point entity: bots buy units and never give an order; place flag_point entities or turn bots off for this mode`);
  }
  function botsOn(mode) {                      // MIS-65: {enableBots} (bare or non-zero) anywhere in the mode's game set
    const t = tree(`resource/set/multiplayer/games/${mode}.set`); let on = false;
    if (t) each(t, n => { if (lc(n.name) === 'enablebots' && (!n.vals.length || Number(n.vals[0].value) !== 0)) on = true; });
    return on;
  }
  function mapEntityIds(d) {                   // entity ids + MIDs the folder's `map` file defines (missions {Link}/{mids} may point at them)
    if (mapIdCache.has(d)) return mapIdCache.get(d);
    const r = { ids: new Set(), mids: new Set(), has: false };
    const t = src.get(d + 'map') ? tree(d + 'map') : null;
    if (t) for (const top of t.kids) {
      if (lc(top.name) !== 'map') continue;
      r.has = true;
      for (const e of top.kids) {
        if (e.vals.length >= 2 && e.vals[1].k === 'INTEGER' && e.kids.length) r.ids.add(Number(e.vals[1].value));
        const m = kid(e, 'MID'); if (m && m.vals.length) r.mids.add(Number(m.vals[0].value));
      }
    }
    mapIdCache.set(d, r);
    return r;
  }
  function players(k, pl) {
    const cnt = num(pl, 'count');
    if (cnt === null) { return; }
    if (cnt > PLAYER_COUNT || cnt < 0) addAt(k, pl, 'MI_PLAYERS', `Players count ${cnt} outside 0..${PLAYER_COUNT}`);
    const dp = kid(pl, 'diplomacy');
    if (dp) {
      const v = dp.vals.map(x => Number(x.value));
      if (v.length !== cnt * cnt) addAt(k, dp, 'MI_PLAYERS', `diplomacy has ${v.length} values, count ${cnt} needs ${cnt * cnt}`);
      else if (v.some(x => !(x === 0 || x === 1 || x === 2))) addAt(k, dp, 'MI_PLAYERS', 'diplomacy value outside 0 neutral / 1 enemy / 2 ally');
    }
    const u = num(pl, 'user'); if (u !== null && (u < 0 || u >= cnt)) addAt(k, pl, 'MI_PLAYERS', `user ${u} beyond count ${cnt}`);
    for (const a of kidsOf(pl, 'alias')) { const i = Number(a.vals[0] && a.vals[0].value); if (a.vals.length && (i < 0 || i >= cnt)) addAt(k, a, 'MI_PLAYERS', `alias ${i} beyond count ${cnt}`); }
  }
  function mapInfo(k) {
    const t = tree(k); if (!t) return;
    for (const g of t.kids) {
      if (lc(g.name) !== 'game') continue;
      const mx = num(g, 'maxPlayers'), mn = num(g, 'minPlayers');
      if (mx !== null) {
        if (mx % 2) add(k, kid(g, 'maxPlayers').line, 'MAP_PLAYERS', `maxPlayers ${mx} is odd: engine rounds up to ${mx + 1}`);
        if (mx < 2 || mx > MP_MAX_PLAYERS) add(k, kid(g, 'maxPlayers').line, 'MAP_PLAYERS', `maxPlayers ${mx} outside 2..${MP_MAX_PLAYERS}: clamped`);
      }
      if (mn !== null && !goh) {   // GoH rounds minPlayers up to even as well: the AS2 messages do not fit, not checked
        if (mn < 1 || mn > MP_MAX_PLAYERS) add(k, kid(g, 'minPlayers').line, 'MAP_PLAYERS', `minPlayers ${mn} outside 1..${MP_MAX_PLAYERS}: clamped`);
        if (mx !== null && mn > mx) add(k, kid(g, 'minPlayers').line, 'MAP_PLAYERS', `minPlayers ${mn} > maxPlayers ${mx}`);
      }
      if (!goh) { const f = kid(g, 'rankedMinPlayers') || kid(g, 'rankedMaxPlayers'); if (f) hint(k, f.line, 'MAP_RANKED_FLAT', `flat ${f.name}: this build reads {ranked {minPlayers}{maxPlayers}} (3.262 may still read the flat form, [T])`); }
      const rk = kid(g, 'ranked');
      if (rk) {
        const a = num(rk, 'minPlayers'), c = num(rk, 'maxPlayers');
        for (const [nm, x] of [['minPlayers', a], ['maxPlayers', c]]) if (x !== null && (x < 2 || x > MP_MAX_PLAYERS)) addAt(k, rk, 'MAP_PLAYERS', `ranked ${nm} ${x} outside 2..${MP_MAX_PLAYERS}: clamped`);
      }
      each(g, n => { if (lc(n.name) === 'gameduration') duration(k, n); });
    }
  }
  function duration(k, n) {
    if (!n.vals.length || n.vals[0].k !== 'STRING') return;
    if (!DURATIONS.has(lc(n.vals[0].value))) addAt(k, n, 'MIS_DURATION', `gameDuration "${n.vals[0].value}" not in the lobby list (10 15 20 25 30 40 50 60 90 120 min)`);
  }
  function durations(k) { const t = tree(k); if (t) each(t, n => { if (lc(n.name) === 'gameduration') duration(k, n); }); }
  function materials(k) {
    const t = tree(k); if (!t) return;
    for (const m of t.kids) {
      if (lc(m.name) !== 'materials') continue;
      for (const e of m.kids) {
        const mk = e.name && dirOf(k) + lc(e.name) + '.mtl';
        if (!mk || !all.has(mk)) continue;
        const mt = tree(mk), mb = mt && mt.kids.find(x => lc(x.name) === 'material');
        if (mb && covered(e, mb)) hint(k, e.line, 'MAP_MATERIAL_SHADOWED', `library entry "${e.name}" duplicates ${e.name}.mtl (harmless)`);
        else addAt(k, e, 'MAP_MATERIAL_SHADOWED', `library entry "${e.name}" ignored and differs: ${e.name}.mtl exists in the map folder and is read first`);
      }
    }
  }
  function pather(k) {
    const t = tree(k); if (!t) return;
    each(t, n => {
      if (lc(n.name) !== 'height' || !n.vals.length) return;
      const nums = n.vals.filter(v => v.k === 'INTEGER' || v.k === 'FLOAT').length;
      if (nums !== 15) addAt(k, n, 'MAP_SLOPE_TABLE', `Height table has ${nums} entries (15 slope classes of 6 degrees)`);
    });
  }

  // ---- MP game sets / presets
  function preset(k) {
    const t = tree(k); if (!t) return;
    each(t, (n, dep) => {
      const nm = lc(n.name);
      if (nm === 'common') { const bg = kid(n, 'budgets'); if (bg && bg.kids.length && !kid(bg, 'vehicle')) addAt(k, bg, 'MIS_BUDGET_NO_VEHICLE', 'common budgets have no budget named "vehicle" (hard-coded by bot Income(), HUD, KOTH)'); }
      else if (nm === 'budgets') budgets(k, n);
      else if (nm === 'unitset') {
        const v = str(n, 'value');
        if (v !== null && !kid(n, 'include') && v.includes('^') && v.slice(0, v.indexOf('^')).trim() === '') addAt(k, n, 'MIS_UNITSET_EXCLUDE_ONLY', `unitset "${v}" has no include tag: matches nothing (use all^x)`);
      } else if (nm === 'unitlimits' && n.vals.length) {
        const v = String(n.vals[0].value);
        if (v.includes(',')) addAt(k, n, 'MIS_LIMITS_FORMAT', `unitLimits "${v}": ',' breaks the parse: atof stops at ',' so the entry after it (${v.slice(v.indexOf(',') + 1).split(';')[0].trim()}) is lost, and later limits too; separator is ';'`);
        for (const p of v.split(';').map(s => s.trim()).filter(Boolean)) if (!/^[^=,\s]+=\s*-?\d+(\.\d+)?$/.test(p) && !v.includes(',')) addAt(k, n, 'MIS_LIMITS_FORMAT', `unitLimits entry "${p}" is not tag=number`);
      } else if (nm === 'teams' || nm === 'bots') {
        for (const e of n.kids) {
          if (!kid(e, 'balancingFactorBonus')) continue;
          const cf = kid(e, 'chargeFactors');
          if (!cf || !str(cf, 'value')) gohSoft(k, e, 'MIS_BALANCE_NO_CHARGE', `${nm} entry "${e.name}" sets balancingFactorBonus but chargeFactors.value is empty: it falls back to common`);
        }
      } else if (nm === 'teamsettings') {
        for (const key of ['minTeamPlayers', 'maxTeamPlayers']) each(n, c => { if (lc(c.name) === lc(key)) (vfsMode ? hint : add)(k, c.line, 'MIS_TEAMKEY_UNREAD', `${key} is not read; use ${key.replace('Players', 'Slots')}`); });
      } else if (nm === 'class' && n.vals.length && dep === 2) {
        const c = lc(n.vals[0].value);
        if (NEW_CLASSES.has(c) && !miTitles.has(c)) addAt(k, n, 'MIS_CLASS_NO_MI', `class ${c} has no stock rules: needs a map with <mode>.mi (none found)`);
      } else if (nm === 'gameduration') duration(k, n);
      else if (nm === 'useunitlevelrestrictions' && n.vals.length && Number(n.vals[0].value) === 0 && !/\{\s*optionsAdvanced\b[^}]*\buseUnitLevelRestrictions\b/i.test(text(k)) && units().level)
        gohSoft(k, n, 'WARN_MIS_UNIT_LEVEL_OFF', `useUnitLevelRestrictions 0 and the host cannot turn it on (not in optionsAdvanced): every unit {level} (${units().level} in units sets) is ignored; list useUnitLevelRestrictions in optionsAdvanced or set it to 1`);
      else if (nm === 'commandpoints' && n.vals.length) cpPools(k, n, String(n.vals[0].value));
    });
  }
  // MIS-22: a unit is charged to the main pool and only the FIRST pool whose tag it carries
  function cpPools(k, n, v) {
    const keys = v.split(';').map(p => p.split('=')[0].trim().toLowerCase()).filter(x => x && x !== '*' && !x.includes('%'));
    if (keys.length < 2) return;
    for (const u of units().tags) {
      const hit = keys.filter(x => u.tags.has(x));
      if (hit.length >= 2) { addAt(k, n, 'MIS_CP_POOL_OVERLAP', `commandPoints pools ${hit.join(', ')} both match unit "${u.name}": only the first (${hit[0]}) applies to it, ${hit.slice(1).join(', ')} never counts it; give pools tags no unit shares`); return; }
    }
  }
  function units() {                           // units sets, raw text: {level} count and per-unit tags from t(..) macro args or {tags ".."}
    if (unitInfo) return unitInfo;
    unitInfo = { level: 0, tags: [] };
    for (const kk of [...all].sort()) {
      if (!/^resource\/set\/multiplayer\/units\/.+\.set$/.test(kk)) continue;
      for (const ln of text(kk).split('\n')) {
        const l = ln.replace(/;.*$/, '');
        if (/\{level\s|\blevel\(/.test(l)) unitInfo.level++;
        const nm = l.match(/^\s*\{\s*"([^"]+)"/) || l.match(/\bname\(([^)]+)\)/), tg = l.match(/\bt\(([^)]*)\)/) || l.match(/\{tags\s+"([^"]*)"/);
        if (nm && tg) unitInfo.tags.push({ name: nm[1], tags: new Set(tg[1].toLowerCase().split(/[\s,]+/).filter(Boolean)) });
      }
    }
    return unitInfo;
  }
  function budgets(k, b) {
    for (const e of b.kids) budget(k, e);
  }
  function budget(k, e) {
    const mode = lc(str(e, 'mode') || '');
    const r = kid(e, 'resource');
    const g = (name) => (r ? num(r, name) : null);
    const bad = (msg, line) => add(k, line || e.line, 'MIS_BUDGET_PARAM', `budget "${e.name}" mode ${mode}: ${msg}`);
    if (r) {
      const rb = g('restoreBegin'), re = g('restoreEnd'), gt = g('growTime');
      if ((rb || re)) hint(k, r.line, 'MIS_RESTORE_DEAD', `budget "${e.name}": restoreBegin/End are written to restore, which nothing reads (dead keys)`);
      if (mode === 'with_update' || mode === 'without_update') {
        if (rb || re) bad('restoreBegin/restoreEnd must be 0 ("Invalid parameter value")', r.line);
        if (gt !== null && gt !== 1) bad('growTime must stay 1 ("Invalid parameter value")', r.line);
        if (mode === 'without_update' && g('speed')) bad('speed must be 0', r.line);
      } else if (mode === 'standard') {
        for (const key of ['period', 'speed', 'limitmin', 'limitmax']) if (g(key)) bad(`${key} must be 0 ("Invalid parameter value")`, r.line);
      } else if (mode === 'custom' || mode === 'fullpayback') {
        for (const key of ['period', 'speed']) if (g(key)) bad(`${key} must be 0 ("Invalid parameter value")`, r.line);
      }
      const pb = kid(r, 'payback');
      if (pb) {
        const cp = str(pb, 'cp'), rs = str(pb, 'restore');
        const split = s => s.split('\t').map(x => x.trim()).filter(x => x !== '');
        if (cp !== null && rs !== null) {
          const a = split(cp), c = split(rs);
          const spaced = [...a, ...c].some(x => /\s/.test(x));
          if (spaced) addAt(k, pb, 'MIS_PAYBACK_FORMAT', 'payback cp/restore must be TAB-separated: a value contains spaces');
          else if (a.length !== c.length) addAt(k, pb, 'MIS_PAYBACK_FORMAT', `payback cp has ${a.length} values, restore ${c.length}: size mismatch`);
          const nums = a.map(Number);
          if (!spaced && nums.some((x, i) => i && x < nums[i - 1])) addAt(k, pb, 'MIS_PAYBACK_FORMAT', 'payback cp must be ascending');
        }
      }
    }
  }

  // MIS-07: army id < 0 is not selectable
  function army(k) {
    const t = tree(k); if (!t) return;
    for (const a of t.kids) if (lc(a.name) === 'army') { const id = kid(a, 'id'), v = num(a, 'id'); if (v !== null && v < 0) addAt(k, id, 'MIS_ARMY_ID_NEGATIVE', `army id ${v} is negative: the army cannot be picked in the lobby; use an id of 0 or more`); }
  }
  // MIS-67: fix_inventory on human brains skips the breed kit: bot men spawn unarmed
  function fixInventory(k) {
    text(k).split('\n').forEach((ln, i) => {
      const m = ln.replace(/;.*$/, '').match(/\{\s*fix_inventory(\s+(\S+?))?\s*\}/i);
      if (m && !/^(0|false|no|off)$/i.test(m[2] || '1')) add(k, i + 1, 'WARN_MIS_FIX_INVENTORY', 'fix_inventory on a human brain: bot men skip their breed kit and fight unarmed (no firearm kills); remove it');
    });
  }

  // ---- bot lua
  function lua(k) {
    const s = text(k).replace(/--\[\[[\s\S]*?\]\]/g, m => m.replace(/[^\n]/g, ' '));
    const lines = s.split('\n'), dead = { AttackBaseTime: [], period: [] }, seenOrd = new Set();
    lines.forEach((ln, i) => {
      const code = ln.replace(/\r$/, '').replace(/--.*$/, '');
      if (goh) {
        for (const m of code.matchAll(/Commands\s*[:.]\s*(\w+)/g)) if (!BOT_ORDERS_GOH.has(lc(m[1])) && !seenOrd.has(lc(m[1]))) seenOrd.add(lc(m[1])), add(k, i + 1, 'WARN_MIS_BOT_ORDER', `BotApi.Commands:${m[1]} is not a GoH bot command (CaptureFlag SeekAndDestroy Spawn SpawnAt CanSpawn IsUnitAvailable TimeToSpawnUnit SayChat GameOver Income; GHMIS-54): call error${lc(m[1]) === 'enemyhastanks' ? '; count tanks with BotApi.Scene.QueryScene on tag tank' : ''}`);
        for (const m of code.matchAll(/Events\s*:\s*Subscribe\s*\(\s*(\d+)/g)) add(k, i + 1, 'WARN_MIS_BOT_EVENT_NUMBER', `BotApi.Events:Subscribe(${m[1]}): GoH event numbers differ from as64 (GHMIS-51); subscribe by name, BotApi.Events.<Name>`);
        for (const m of code.matchAll(/Events\s*\.\s*(\w+)/g)) if (!BOT_EVENTS_GOH.has(lc(m[1]))) add(k, i + 1, 'WARN_MIS_BOT_EVENT_UNKNOWN', `BotApi.Events.${m[1]} is no GoH bot event (Init Done GameStart PrepTimeOver WinnerDecided GameEnd Quant GameSpawn NonQuant Waypoint; GHMIS-51): Subscribe gets nil`);
      } else
      for (const m of code.matchAll(/Commands\s*[:.]\s*(\w+)/g)) if (!BOT_ORDERS.has(lc(m[1])) && !seenOrd.has(lc(m[1]))) seenOrd.add(lc(m[1])), add(k, i + 1, 'WARN_MIS_BOT_ORDER', `BotApi.Commands:${m[1]} is not an order in this src (Spawn CaptureFlag SayChat; queries Income EnemyHasTanks); 3.262 API may be larger [T]`);
      if (/data\.lua$/.test(k)) {
        if (/\bAttackBaseTime\b/.test(code)) dead.AttackBaseTime.push(i + 1);
        if (/\bperiod\s*=/.test(code)) dead.period.push(i + 1);
      }
    });
    if (dead.AttackBaseTime.length) add(k, dead.AttackBaseTime[0], 'MIS_BOT_DEAD_KEY', `AttackBaseTime is not read by anything (${dead.AttackBaseTime.length}x)`);
    if (dead.period.length) add(k, dead.period[0], 'MIS_BOT_DEAD_KEY', `purchase entry period is ignored by Lua, use unitset/era tags (${dead.period.length} entries)`);
  }
  function botData() {
    const key = 'resource/script/multiplayer/bot.data.lua';
    if (!mine.has(key)) return;
    const s = text(key).split('\n').map(l => l.replace(/\r$/, '').replace(/--.*$/, '')).join('\n');
    const armies = new Set();
    for (const kk of all) { const m = kk.match(/^resource\/set\/multiplayer\/armies\/([^/]+)\.set$/); if (m) armies.add(m[1].toLowerCase()); }
    // units known
    const units = new Map();
    for (const kk of all) {
      if (!/^resource\/set\/multiplayer\/units\/.+\.set$/.test(kk)) continue;
      const t = tree(kk); if (!t) continue;
      for (const u of t.kids) if (lc(u.name) === 'units') for (const e of u.kids) if (e.name) {
        const prev = units.get(lc(e.name));
        units.set(lc(e.name), { nfs: !!kid(e, 'not_for_sale') || (prev && prev.nfs && !e.kids.length) });
      }
    }
    const ps = s.indexOf('Purchases');
    if (ps < 0) return;
    const body = s.slice(ps), lineOf = off => s.slice(0, ps + off).split('\n').length;
    const seenUnit = new Set();
    const used = new Set([...body.matchAll(/\[\s*"(\w+)"\s*\]\s*=\s*\{/g)].map(m => lc(m[1])));   // armies some stage serves
    for (const a of armies) if (!used.has(a)) hint(key, 0, 'MIS_BOT_ARMY_MISSING', `army "${a}" has no Units in any Purchases stage: its bots buy nothing`);
    const stages = [...body.matchAll(/Repeat\s*=/g)].map(m => m.index);
    stages.forEach((st, i) => {
      const seg = body.slice(st, i + 1 < stages.length ? stages[i + 1] : body.length);
      const have = new Set([...seg.matchAll(/\[\s*"(\w+)"\s*\]\s*=\s*\{/g)].map(m => lc(m[1])));
      for (const a of used) if (!have.has(a)) add(key, lineOf(st), 'MIS_BOT_ARMY_MISSING', `Purchases stage ${i + 1} has no Units for army "${a}": that army buys nothing in this stage`);
      for (const m of seg.matchAll(/unit\s*=\s*"([^"]+)"/g)) {
        const u = units.get(lc(m[1]));
        if (units.size && (!u || u.nfs) && !seenUnit.has(lc(m[1]))) seenUnit.add(lc(m[1])), add(key, lineOf(st + m.index), 'MIS_BOT_UNIT_UNKNOWN', `unit "${m[1]}" ${u ? 'is not_for_sale' : 'not found in set/multiplayer/units'}: Spawn returns true silently`);
      }
    });
  }

  // ---- map.net (MAP-04/05/08): names remap by name on load; ids are file-local
  function knownTerrain() {                    //  the game + set/interaction_terrain/terrains.set
    if (known) return known;
    known = { types: new Set(['undef', 'ground', 'no_pass', 'shallow_water', 'water', 'deep_water', 'swamp', 'road', 'no_pass_human']),
      mats: new Set(['undef', 'ground', 'air', 'underwater', 'shallow_water', 'water', 'deep_water', 'bridge', 'bridge_wood']), have: false };
    const t = tree('resource/set/interaction_terrain/terrains.set');
    if (!t) return known;
    for (const top of t.kids) if (lc(top.name) === 'terrains') for (const e of top.kids) if (e.name) {
      known.have = true; known.mats.add(lc(e.name));
      for (const p of (str(e, 'pp') || '').split(/[ \t]+/)) if (p) known.types.add(lc(p));
    }
    return known;
  }
  // MAP-28: world->cell = (pos+off)/cell. vanilla: 99.95% of map entities inside the grid; flag only when most fall outside
  function originCheck(k, m) {
    if (!m.cell || !m.width || !m.height) return;
    const t = src.get(dirOf(k) + 'map') ? tree(dirOf(k) + 'map') : null; if (!t) return;
    let n = 0, out = 0;
    for (const top of t.kids) if (lc(top.name) === 'map') for (const e of top.kids) {
      if (lc(e.name) !== 'entity') continue;
      const p = kid(e, 'Position'); if (!p || p.vals.length < 2) continue;
      const cx = (Number(p.vals[0].value) + m.offX) / m.cell, cy = (Number(p.vals[1].value) + m.offY) / m.cell;
      if (isNaN(cx) || isNaN(cy)) continue;
      n++; if (cx < 0 || cx >= m.width || cy < 0 || cy >= m.height) out++;
    }
    if (n >= 20 && out * 2 > n) add(k, 0, 'WARN_MAP_NET_ORIGIN', `${out} of ${n} map entities lie outside the grid (cells=(pos+off)/${m.cell}, off ${m.offX},${m.offY}, ${m.width}x${m.height}): origin/size header does not match the map`);
  }
  function mapNet(k) {
    const buf = src.get(k); if (!buf) return;
    const m = mapnet.parse(buf);
    for (const p of m.problems) add(k, 0, 'MAP_NET_FORMAT', p.msg);
    if (goh && !m.problems.length && m.version < 2) { add(k, 0, 'MAP_NET_FORMAT', `map.net version ${m.version}: GoH reads every map.net as the v2 layout (tables, GRID, 4-byte cells), so this file reads as garbage; re-save it as v2 (GHMAP-16)`); return; }
    if (m.problems.length || m.version < 1) return;
    const kn = knownTerrain();
    const st = mapnet.stats(m);
    if (m.version >= 2 && kn.have) {
      for (const [list, set, what] of [[m.types, kn.types, 'terrain_pp type'], [m.materials, kn.mats, 'terrain_fx type']])
        for (const e of list) if (!set.has(lc(e.name))) add(k, 0, 'MAP_TERRAIN_UNKNOWN', `${what} '${e.name}' (table id ${e.index}) not built in and not in terrains.set: engine logs "unknown ${what} - ${e.name}", cells become id 0`);
    }
    for (const [what, use, max, list] of [['type', st.typeUse, 15, m.types], ['material', st.matUse, 127, m.materials]]) {
      for (const e of list) if (e.index > max) add(k, 0, 'MAP_NET_ID_RANGE', `${what} table id ${e.index} > ${max} (${what === 'type' ? '4' : '7'}-bit cell field)`);
      for (const [id, n] of use) {
        if (id > max) add(k, 0, 'MAP_NET_ID_RANGE', `${n} cells use ${what} id ${id} > ${max} (${what === 'type' ? '4' : '7'}-bit cell field)`);
        else if (m.version >= 2 && !list.some(e => e.index === id)) add(k, 0, 'WARN_MAP_NET_ID_UNLISTED', `${n} cells use ${what} id ${id} that the file's name table does not list`);
      }
    }
    originCheck(k, m);
    if (st.noGround) add(k, 0, 'WARN_MAP_NET_NO_GROUND', `${st.noGround} cells with height <= ${mapnet.NO_GROUND} (no-ground marker; min ${st.minH})`);
    if (m.version >= 2) for (const [c, n] of st.combo) {
      const [t, mt] = c.split(',').map(Number), tn = mapnet.typeName(m, t), mn = mapnet.materialName(m, mt);
      if ((mn === 'water' || mn === 'deep_water') && (tn === 'ground' || tn === 'undef' || tn === null)) add(k, 0, 'MAP_WATER_PASSABLE', `${n} cells with material ${mn} but movement type ${tn || t}: visible water is passable (use type water/no_pass)`);
      else if (mn === 'shallow_water' && tn === 'ground') hint(k, 0, 'MAP_WATER_PASSABLE', `${n} cells material shallow_water + type ground: passable (normal in vanilla)`);
    }
  }

  // ---- N.pat (MAP-09)
  function patches() {
    const files = [];
    for (const [k, f] of src.local) if (/^\d+\.pat$/.test(baseOf(k))) files.push([k, f]);
    if (vfsMode && o.gameDir) for (const n of fs.readdirSync(o.gameDir)) if (/^\d+\.pat$/.test(n)) files.push(['resource/' + n, path.join(o.gameDir, n)]);
    for (const [k, f] of files) {
      const n = Number(baseOf(k).replace('.pat', ''));
      let ents; try { ents = pak.list(f); } catch (e) { continue; }
      const e = ents.find(x => lc(x.name).endsWith('.patch'));
      const rel = vfsMode ? path.basename(f) : relPath(src.folder, f);
      if (!e) { rep.add(rel, 0, 'MAP_PATCH_MISSING', `${baseOf(k)} has no *.patch: engine reports "Wrong patch ${n}"`); continue; }
      let id = null;
      try {
        const r = sdlx.read(pak.read(ents, e), { file: '.patch', key: '.patch', open: () => null, onError() {} });
        const t = lite(r.root);
        for (const top of t.kids) if (lc(top.name) === 'id' && top.vals.length) id = Number(top.vals[0].value);
        if (id === null) each(t, c => { if (id === null && lc(c.name) === 'id' && c.vals.length) id = Number(c.vals[0].value); });
        each(t, c => {                         // KEY-23: patches run after the mod's resource/ mount, so a delete hits the mod's own file
          if (lc(c.name) !== 'delete' || !c.vals.length) return;
          const p = 'resource/' + lc(String(c.vals[0].value)).replace(/\\/g, '/').replace(/^\/+/, '');
          if (src.local.has(p)) rep.add(rel, 0, 'WARN_MAP_PATCH_DELETE_OWN', `${baseOf(k)} deletes "${c.vals[0].value}", a file this mod ships in resource/: the patch runs after the mount and removes the mod's copy; drop the delete or rename the file`);
        });
      } catch (x) { continue; }
      if (id !== n) rep.add(rel, 0, 'MAP_PATCH_ID', `${baseOf(k)} .patch {id ${id}} must equal the patch number ${n}: "Wrong patch ${n}"`);
    }
  }
}

module.exports = { check, lite };
// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { o.exe = args[++i]; if (!games.get(o.exe)) { console.error('milint: --exe ' + o.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); } }
    else if (a === '--vfs') o.vfs = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (o.exe && !o.gameDir && (games.kindOf(o.exe) === 'goh' || o.vfs)) o.gameDir = games.install(o.exe).dir || undefined;   // --exe goh: the GoH install; --vfs --exe x: that game's install
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: milint <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q] | --vfs --game dir [--exe ..]'); process.exit(2); }
  const rep = check(o);
  if (o.q) for (const f of rep.toJSON().info) if (f.code === 'GOH_NOT_CHECKED') console.error('milint: ' + f.msg);   // -q hides info: the GoH skip list still shows
  rcPrint(rep, o, o.folder || o.gameDir, 'milint', { showInfo: !o.q, byCode: true });
}
