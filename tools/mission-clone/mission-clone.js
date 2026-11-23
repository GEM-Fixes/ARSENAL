#!/usr/bin/env node
// mission-clone: add an MP game mode to an existing map by cloning its mode file (<mode>.mi). MIS-24 MIS-19 MAP-01
// usage: node tools/mission-clone/mission-clone.js --game G --map map/multi/<name> --from <mode> --to <mode> --out <mod dir>
//        [--src GOH_ROOT (loose + paks in resource/<dir>/, for includes)] [--flags N] [--flag-zone M (GoH zoneId flags -> zoneA/zoneB M m, default 12)] [--with-mode NEW [--from-mode M] [--title T] [--no-bots]] [--obs-fix [new=base,..]] [--dry-run] [--list] [--no-lint] [--no-modinfo] [--target as64|mowas2|goh] [--game-version min[,max]] [--exe as64|mowas_2|mowas2|goh] [-q]
// --list: modes per map (all MP maps, or --map only). source = G/resource loose files + paks (map*.pak, gamelogic.pak) [+ --src dir]
// --exe as64|mowas_2|mowas2|goh: the game whose files are read (lib/games). The index is then lib/vfs with that exe (as64: + as64/core; mowas_2:
//   none; goh: the GoH paks in resource/ sub-folders and localizations/), plus --mods through the vfs (its mod.info range filter applies) and,
//   AS2 only, the top-level paks of the other mods for the [mod: x] tag. No --game: the install of that game (games.install). No --exe: the
//   index as before, to the byte. Default --target = the --exe game.
// --exe goh (GoH to GoH, [I]): GoH mode table (goh-game-mode-registry [V]): battle_zones armored_warfare battle_zones_8x8 combined_arms heroes are
//   one class (battle zones game), so a clone inside that family is the file as is; combat and frontline are not GoH modes (refused, exit 2
//   MC_GOH_NO_MODE: use frontlines); the new mode's .set keeps one {order 100} (the base's own {order N} is dropped); every other pair = verbatim copy + MC_NEEDS_MANUAL (GoH flags = {zone {radius 0}{zoneId "fN"}} + {Tags "flag"} + a
//   Helpers {zone "poly"}, GHMAP-03; not auto-placed). The map's <from>.info is copied to <to>.info (GoH map folders hold <mode>.info, no
//   map.info [V data]). --with-mode title = localizations/default/interface/text/mc_<mode>.pot msgctxt mp/game/<mode> (GHLOC-01, GHLOC-06;
//   key as vanilla dlg_mp.pot [V]). mod.info range = the GoH exe version, Min = Max (as newmod --target goh, GHNET-22, PORT-46). milint and
//   the AS2 zoneA/zoneB flag fix are skipped. --out inside the GoH install: refused (lib/writeguard). --src and --obs-fix: AS2 targets only.
//   --exe with --list: a --mods mod the vfs dropped is said on stderr (info: MC_MOD_DROPPED); a listed mod's maps carry no [mod: x] tag.
// --src-map map/multi/<vanilla>: read the mode file from that map, write the clone to --map (a map-clone output in the mod); --mods a,b: mod maps visible
// --with-mode NEW: NEW is {class base} (--from-mode, default --from) so a verbatim copy of the base mode is complete: exit 0, nothing manual.
// Exit 1 = errors only; WARN_ findings (WARN_MC_FLAGS_AUTOPLACED, WARN_MC_INCLUDE_DROPPED) print and leave exit 0.
// Derived: combat<->battle_zones (add/strip flag_point_N), ->captureflag (flag_point_frontlines + flag_ring).
// Everything else (frontline phases/chains, custom modes) = verbatim copy + MC_NEEDS_MANUAL.
// Author: Imperator_Aug (ARSENAL, ia-3bffa7d6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const pak = require('../lib/pak'), { createReport } = require('../lib/report');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1]; };
const has = k => args.includes('--' + k);
const quiet = args.includes('-q');
const withMode = opt('with-mode'), fromMode = opt('from-mode'), modeTitle = opt('title');
const mapArg = opt('map'), from = opt('from'), to = opt('to') || withMode, out = opt('out'), srcDir = opt('src');
const games = require('../lib/games');
const exeArg = opt('exe'), G = exeArg ? games.get(exeArg) : null;
if (exeArg && !G) { console.error('--exe as64|mowas_2|mowas2|goh'); process.exit(2); }
const VEXE = G ? G.exe : null, isGoh = VEXE === 'goh';
let game = opt('game');
if (!game && G) { try { game = games.install(G.id).dir; } catch (e) { game = null; } }
{
  const tg = opt('target');
  if (tg && !games.get(tg)) { console.error('--target as64|mowas2|mowas_2|goh'); process.exit(2); }
  if (tg && (games.idOf(tg) === 'goh') !== isGoh) { console.error(`--target ${tg} needs ${games.idOf(tg) === 'goh' ? '--exe goh' : 'an AS2 game (--exe as64|mowas_2)'}: mission-clone writes a mode for the game it reads`); process.exit(2); }
  if (isGoh && srcDir) { console.error('mission-clone: --src is for AS2 targets (a GoH tree as the include source of an AS2 map); with --exe goh the game itself is GoH: drop --src'); process.exit(2); }
  if (isGoh && has('obs-fix')) games.refuse('mission-clone --obs-fix', 'goh', 'it adds the AS2 obstacle classes GoH-ported objects name; a GoH mod has them', '');
  if (isGoh && out) { const why = require('../lib/writeguard').refuseWrite(out, { game }); if (why) { console.error('mission-clone: ' + why); process.exit(2); } }
}
const rep = createReport();
const R = game && path.join(game, 'resource');

// ---- source index: vfs key (lowercase, '/') -> {read()} ----
function buildIndex() {
  const idx = new Map();
  const put = (k, rec) => { k = k.toLowerCase(); if (!idx.has(k)) idx.set(k, rec); };
  const loose = (root, origin, paks) => {
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name), k = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(p, k);
        else if (paks && /\.pak$/i.test(e.name)) {   // --src tree (GoH): a pak in resource/<dir>/ mounts at <dir>/ (map/multi.pak holds multi/bz_*.inc)
          let ents; try { ents = pak.list(p); } catch (x) { continue; }
          for (const en of ents) if (!en.name.endsWith('/')) put((rel ? rel + '/' : '') + en.name, { read: () => pak.read(ents, en), origin });
        } else put(k, { read: () => fs.readFileSync(p), origin });
      }
    };
    if (fs.existsSync(root)) walk(root, '');
  };
  if (VEXE) return buildVfsIndex(idx, put, loose);
  return buildOwnIndex(idx, put);
}
// --exe: the game's own view through lib/vfs (as64/core for as64, none for mowas_2, GoH sub-folder paks and localizations for goh).
// Key form as the own index: no 'resource/' prefix. A key a listed mod supplies is origin 'mod' with its id (includes copied, [mod: x] tag).
function buildVfsIndex(idx, put, loose) {
  if (out) loose(path.join(out, 'resource'), 'out');
  const vfs = require('../lib/vfs');
  const list = (opt('mods') || '').split(',').map(s => s.trim()).filter(Boolean);
  const v = vfs.build({ gameDir: game, exe: VEXE, mods: list });
  for (const l of vfs.dropped(v)) rep.info('mods', 0, 'MC_MOD_DROPPED', l);
  const modOf = layer => v.mods.find(id => layer === id || String(layer).startsWith(id + ' patch ')) || null;
  for (const [k, r] of v.files) {
    if (!k.startsWith('resource/')) continue;
    // a listed (mounted) mod's file is origin 'mod' but carries no [mod: x] tag, as the own index (the tag = a mode only an unlisted mod has)
    put(k.slice(9), { read: () => vfs.readRec(r), origin: modOf(r.layer) ? 'mod' : 'game' });
  }
  // AS2: the other mods' top-level paks, as the own index reads them, only for the [mod: x] tag of --list (a mode the game lacks).
  // GoH: not scanned (loose GoH mods hold whole trees; name them with --mods).
  const mods = path.join(game, 'mods');
  if (!isGoh && fs.existsSync(mods)) for (const m of fs.readdirSync(mods).sort()) {
    if (list.some(x => x.split(':')[0].toLowerCase() === m.toLowerCase())) continue;
    const d = path.join(mods, m, 'resource'); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(f => /\.pak$/i.test(f)).sort()) {
      let ents; try { ents = pak.list(path.join(d, f)); } catch (e) { continue; }
      for (const e of ents) if (!e.name.endsWith('/')) put(e.name, { read: () => pak.read(ents, e), mod: m, origin: 'mod' });
    }
  }
  if (srcDir) loose(path.join(srcDir, 'resource'), 'src', true);
  return idx;
}
function buildOwnIndex(idx, put) {   // no --exe: as before, to the byte
  const loose = (root, origin, paks) => {
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name), k = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(p, k);
        else if (paks && /\.pak$/i.test(e.name)) {   // --src tree (GoH): a pak in resource/<dir>/ mounts at <dir>/ (map/multi.pak holds multi/bz_*.inc)
          let ents; try { ents = pak.list(p); } catch (x) { continue; }
          for (const en of ents) if (!en.name.endsWith('/')) put((rel ? rel + '/' : '') + en.name, { read: () => pak.read(ents, en), origin });
        } else put(k, { read: () => fs.readFileSync(p), origin });
      }
    };
    if (fs.existsSync(root)) walk(root, '');
  };
  if (out) loose(path.join(out, 'resource'), 'out');
  // --mods a,b: loose files (and paks) of named mods under G/mods, last listed first; a map living in a mod folder (b9m_t) is found
  for (const id of (opt('mods') || '').split(',').map(s => s.trim()).filter(Boolean).reverse()) loose(path.join(game, 'mods', id, 'resource'), 'mod', true);
  if (R && fs.existsSync(R)) {
    loose(R, 'game');
    const dirs = [R];
    const mods = path.join(game, 'mods');
    if (fs.existsSync(mods)) for (const m of fs.readdirSync(mods)) dirs.push(path.join(mods, m, 'resource'));
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d).filter(f => /\.pak$/i.test(f)).sort()) {
        let ents; try { ents = pak.list(path.join(d, f)); } catch (e) { continue; }
        const mod = d === R ? null : path.basename(path.dirname(d));
        for (const e of ents) if (!e.name.endsWith('/')) put(e.name, { read: () => pak.read(ents, e), mod, origin: mod ? 'mod' : 'game' });
      }
    }
  }
  // --src last: it only fills what the game and mods lack (the bz_*.inc); before, GoH's battle_zones.set shadowed the AS2 one (chain-n2 gen1)
  if (srcDir) loose(path.join(srcDir, 'resource'), 'src', true);
  return idx;
}

if (!game || !fs.existsSync(game)) { console.error('usage: mission-clone --game G [--map map/multi/<name> --from m --to m --out dir] [--list] [--dry-run]'); process.exit(2); }
const idx = buildIndex();
const MODE_RE = /^(map\/multi\/.+)\/([^/]+)\.mi$/;

// ---- --list ----
if (has('list')) {
  // a mode only a mod's pak supplies is tagged [mod: name]: the game has it only while that mod is enabled (live 2026-11-03:
  // mp_host "no map" for a map from a mod folder not in options.set {mods})
  const maps = {}, from = {};
  for (const [k, rec] of idx) {
    const m = MODE_RE.exec(k); if (!m) continue;
    (maps[m[1]] = maps[m[1]] || []).push(m[2]);
    if (rec.mod) (from[m[1]] = from[m[1]] || new Set()).add(rec.mod);
  }
  const want = mapArg && mapArg.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  for (const m of Object.keys(maps).sort()) if (!want || m === want) console.log(`${m}: ${maps[m].sort().join(' ')}${from[m] ? `  [mod: ${[...from[m]].join(', ')}]` : ''}`);
  // --exe: a --mods mod the vfs dropped (range or mode filter) is said on stderr; the list form on stdout stays as it is
  for (const x of rep.toJSON().info.filter(x => x.code === 'MC_MOD_DROPPED')) console.error(`info: MC_MOD_DROPPED ${x.msg}`);
  process.exit(0);
}
// ---- --obs-fix [new=base,...]: obstacle classes GoH-ported objects name but AS2 lacks (folds run/chainn3/obsfix.js).
// A missing name: FindObstacleId gives 0xff, GetObstacleDesc(0xff) reads past g_obstacleDescs (:340)
//  dies. Each new class = copy of the base block, all added after the first base
// block in set/registry/obstacles.reg (out's own copy first, else game). cp1251 bytes + CRLF kept. Alone (no --map) or with a clone.
if (has('obs-fix')) {
  const v = opt('obs-fix'), spec = v && !v.startsWith('--') && v.includes('=') ? v : 'small_building_vaultable=small_building,unbreakable_vaultable=unbreakable,construction_vaultable=construction,post=tree';
  if (!out) { console.error('--obs-fix needs --out'); process.exit(2); }
  const key = 'set/registry/obstacles.reg', r = idx.get(key), relO = 'resource/' + key;
  if (!r) { rep.add(relO, 0, 'MC_OBS_NO_REG', `no ${key} in out, game or mods`); finish(); }
  const t = r.read().toString('latin1');
  const block = name => { const m = new RegExp('\\t\\{' + name + '\\r\\n[\\s\\S]*?\\r\\n    \\}\\r\\n').exec(t); return m && m[0]; };
  let add = '', anchor = null; const did = [], have = [];
  for (const [nw, base] of spec.split(',').map(p => p.split('=').map(s => s.trim()))) {
    if (block(nw)) { have.push(nw); continue; }
    const b = block(base);
    if (!b) { rep.add(relO, 0, 'MC_OBS_NO_BLOCK', `no {${base} ...} block to copy for ${nw}`); continue; }
    anchor = anchor || b; add += b.replace('{' + base, '{' + nw); did.push(`${nw}=${base}`);
  }
  if (rep.count) finish();
  console.log(`${key}: added [${did.join(' ')}] already [${have.join(' ')}]`);
  if (add && !has('dry-run')) { const d = path.join(out, relO); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, Buffer.from(t.replace(anchor, anchor + add), 'latin1')); }
  if (add) rep.info(relO, 0, 'MC_OBS_ADDED', `${did.length} obstacle classes added (${did.join(' ')}) [T: ported objects crush/vault in game]`);
  if (!mapArg) finish();
}
if (!mapArg || !from || !to || !out) { console.error('need --map --from --to --out (or --list)'); process.exit(2); }
// GoH mode table (gohweb [V]): combat and frontline are AS2 modes; refused before any check or write
const GOH_AS2_ONLY = { combat: 'battle_zones or frontlines', frontline: 'frontlines' };
{ const tc0 = (withMode ? (fromMode || from) : to).toLowerCase();
  if (isGoh && GOH_AS2_ONLY[tc0]) games.refuse('mission-clone', 'goh', `MC_GOH_NO_MODE ${tc0} is not a GoH game mode: use ${GOH_AS2_ONLY[tc0]}`, 'goh-game-mode-registry'); }

const mapKey = mapArg.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
// --src-map <map>: the mode file is read from that map (vanilla or any mod's), the clone is written to --map (T-MCFIX: a map-clone output
// in the mod, e.g. chain_map, has no .mi of its own with --no-mission). Without it source = target = --map. The vfs sees out, --mods, game, game mods.
const srcKey = (opt('src-map') || mapArg).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const rec = idx.get(`${srcKey}/${from.toLowerCase()}.mi`);
const relOut = `resource/${mapKey}/${to}.mi`;
if (!rec) {
  const modes = [...idx.keys()].filter(k => k.startsWith(srcKey + '/') && k.endsWith('.mi')).map(k => path.basename(k, '.mi'));
  let dym = '';
  if (!modes.length) {   // wrong map name: did-you-mean from the maps that have a mode file
    const old = srcKey.split('/').pop(), maps = new Set();
    for (const k of idx.keys()) { const m = MODE_RE.exec(k); if (m) maps.add(m[1]); }
    const lev = (x, y) => { const d = []; for (let i = 0; i <= x.length; i++) d[i] = [i]; for (let j = 1; j <= y.length; j++) d[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; };
    const score = k => { const l = k.split('/').pop(); return (l.includes(old) || old.includes(l)) ? 0 : lev(l, old); };
    const c = [...maps].sort((x, y) => score(x) - score(y) || x.localeCompare(y)).filter(k => score(k) <= Math.max(3, Math.ceil(old.length / 2))).slice(0, 5);
    if (c.length) dym = `. Did you mean: ${c.join(', ')}?`;
  }
  rep.add(`${srcKey}/${from}.mi`, 0, 'MC_NO_SOURCE', `no ${from}.mi for map ${srcKey} (modes: ${modes.join(' ') || 'none'})${dym}`); finish();
}
if (opt('src-map') && ![...idx.keys()].some(k => k.startsWith(mapKey + '/'))) rep.add(mapKey, 0, 'MC_NO_TARGET_MAP', `--map ${mapKey}: no files of that map in out, --mods, game or mods (map-clone it into the mod first, or the mode lands on a map folder that does not exist)`);
if (from.toLowerCase() === to.toLowerCase()) { rep.add(relOut, 0, 'MC_SAME_MODE', '--from equals --to'); finish(); }
if (idx.has(`${mapKey}/${to.toLowerCase()}.mi`) && !fs.existsSync(path.join(out, relOut))) rep.info(relOut, 0, 'MC_TARGET_EXISTS', `map already has ${to}.mi; the clone in the mod overrides it`);
if (withMode && withMode.toLowerCase() !== to.toLowerCase()) { rep.add(relOut, 0, 'MC_MODE_MISMATCH', '--with-mode must equal --to (the .mi title is the game type)'); finish(); }
if (!withMode && !idx.has(`set/multiplayer/games/${to.toLowerCase()}.set`)) rep.add(relOut, 0, 'MC_NO_MODE_SET', `no set/multiplayer/games/${to}.set in game or mods: map would be skipped (game type undefined, MAP-01); add the .set to the mod`);

const buf = rec.read();
let txt = buf.toString('latin1');
const eol = txt.includes('\r\n') ? '\r\n' : '\n';

// ---- tiny block scanner: top-level entities inside {mission ...} ----
function matchEnd(s, i) { // s[i]=='{' -> index after matching '}', skipping strings/comments
  let d = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { i++; while (i < s.length && s[i] !== '"' && s[i] !== '\n') i++; }
    else if (c === ';') { while (i < s.length && s[i] !== '\n') i++; }
    else if (c === '{') d++;
    else if (c === '}' && --d === 0) return i + 1;
  }
  return -1;
}
function entities(s) { // [{name, uid, start, end, text}] for blocks `{Entity "name" 0xUID` at depth 1
  const res = [], re = /^[ \t]*\{Entity\s+"([^"]*)"\s+(0x[0-9a-fA-F]+)/gm;
  let m;
  while ((m = re.exec(s))) {
    const st = s.indexOf('{', m.index), en = matchEnd(s, st);
    if (en < 0) continue;
    res.push({ name: m[1], uid: m[2], start: m.index, end: en, text: s.slice(st, en) });
    re.lastIndex = en;
  }
  return res;
}
const num = (t, k) => { const m = new RegExp('\\{' + k + '\\s+(-?[0-9.]+)').exec(t); return m ? +m[1] : null; };
const word = (t, k) => { const m = new RegExp('\\{' + k + '\\s+"?([^\\s}"]+)').exec(t); return m ? m[1] : null; };
const isFlag = e => /^flag_/i.test(e.name) || /\{Extender\s+"map_point"/.test(e.text) && /\{zone[AB]\s/.test(e.text);
const isSpawn = e => /\{Extender\s+"map_point"/.test(e.text) && /\{visor\s+SpawnPoint/.test(e.text) && !isFlag(e);

const ents = entities(txt);
const flagsIn = ents.filter(isFlag), spawns = ents.filter(isSpawn);
const usedUids = new Set((txt.match(/0x[0-9a-fA-F]+/g) || []).map(x => parseInt(x, 16)));
const newUid = () => { let u = 0x8100; while (usedUids.has(u)) u++; usedUids.add(u); return '0x' + u.toString(16); };
let maxMid = 0; for (const m of txt.matchAll(/\{MID\s+(\d+)/g)) maxMid = Math.max(maxMid, +m[1]);
const newMid = () => ++maxMid;
const NL = eol, T = '\t';

function maxPlayers() {
  const r = idx.get(`${mapKey}/map.info`);
  if (r) { const m = /maxPlayers\s+(\d+)/.exec(r.read().toString('latin1')); if (m) return +m[1]; }
  return spawns.length;
}
function centroid(team) {
  const ps = spawns.filter(e => word(e.text, 'team') === team).map(e => {
    const m = /\{Position\s+(-?[0-9.]+)\s+(-?[0-9.]+)/.exec(e.text); return m && [+m[1], +m[2]];
  }).filter(Boolean);
  if (!ps.length) return null;
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}
const f2 = x => String(Math.round(x * 100) / 100);

// flag positions: centre flag at the midpoint of the team spawn centroids, others alternate toward A/B along the line
function flagPositions(n) {
  const a = centroid('a'), b = centroid('b');
  if (!a || !b) return null;
  const pos = [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]], m = (n - 1) >> 1;
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let k = 1; k <= m; k++) { pos.push(at(0.5 - 0.5 * k / (m + 1))); pos.push(at(0.5 + 0.5 * k / (m + 1))); }
  return pos.slice(0, n);
}
const insertAfterMission = (s, add) => {
  const m = /^\{mission[^\n]*\n/m.exec(s);
  return m ? s.slice(0, m.index + m[0].length) + add + s.slice(m.index + m[0].length) : null;
};
const manual = (code, msg) => rep.add(relOut, 0, code, msg);
const warn = (code, msg) => rep.add(relOut, 0, code, msg);   // WARN_: shown, does not fail the exit code (placed by heuristic, check by eye)
const notes = [];
const lc = x => x.toLowerCase();
const f = lc(from), t = lc(to);
const FLAGMODES = ['battle_zones'], SIMPLE = ['combat', 'battle_zones', 'captureflag'];
const GOH_BZ = ['battle_zones', 'armored_warfare', 'battle_zones_8x8', 'combined_arms', 'heroes'];

function stripFlags() {
  let s = txt;
  for (const e of flagsIn.slice().reverse()) {
    let st = e.start; while (st > 0 && s[st - 1] !== '\n') st--;
    let en = e.end; if (s[en] === '\r') en++; if (s[en] === '\n') en++;
    s = s.slice(0, st) + s.slice(en);
  }
  return s;
}

// --with-mode: the new mode is registered as {class <base>} (writeMode), so it plays as its base mode: base = source mode -> the verbatim
// copy IS complete (nothing manual); else derive for the base class, not for the new name (T-MCFIX: chain_mode from combat was MC_NEEDS_MANUAL for nothing)
const tc = withMode ? (fromMode || from).toLowerCase() : t;
let outTxt = txt;
if (withMode && tc === f) {
  notes.push(`new mode ${to} = {class ${f}}: mode file copied as is, nothing mode-specific to change`);
} else if (isGoh) {
  // GoH mode table (gohweb [V]): no combat, frontline is frontlines; the battle zones names are one class
  if (GOH_BZ.includes(f) && GOH_BZ.includes(tc)) notes.push(`${from} and ${tc} are one GoH class (battle zones game): mode file copied as is`);
  else manual('MC_NEEDS_MANUAL', `${to}: GoH ${from} -> ${tc}: copied verbatim; flags and mode entities are not derived on GoH. A GoH flag = Entity flag_point_N with Extender "map_point" {zone {radius 0} {zoneId "fN"}} {allow {enableCapture} {enableRelease}}, a {Tags "flag" <uid>} line and a Helpers {zone "poly" {Name "fN"} ...} (GHMAP-03, as vanilla battle_zones.mi); check against set/multiplayer/games/${tc}.set [T]`);
} else if (SIMPLE.includes(f) && SIMPLE.includes(tc)) {
  // 1) drop source-mode flags
  const srcHasFlags = flagsIn.length > 0;
  if (srcHasFlags) { outTxt = stripFlags(); notes.push(`removed ${flagsIn.length} ${from} flag entities`); }
  // also drop flag_ring (captureflag decoration)
  outTxt = outTxt.replace(/^[ \t]*\{Entity\s+"flag_ring"[^\n]*\n(?:[^\n]*\n)*?[ \t]*\}\r?\n/m, '');
  // 2) add target flags
  if (FLAGMODES.includes(tc)) {
    const n0 = opt('flags') ? +opt('flags') : maxPlayers() + 1, n = n0 % 2 ? n0 : n0 + 1;
    const pos = flagPositions(n);
    if (!pos) manual('MC_NEEDS_MANUAL', `${to}: no team a/b spawn map_points found to derive flag positions; add ${n} flag_point_N entities (map_point extender: name fN, zoneA/zoneB 12, order N, show All, visor MapPoint, Player 0, unique MID)`);
    else {
      let add = '';
      pos.forEach((p, i) => {
        const k = i + 1;
        add += [`${T}{Entity "flag_point_${k}" ${newUid()}`, `${T}${T}{Position ${f2(p[0])} ${f2(p[1])}}`, `${T}${T}{xform scale 0.75}`,
          `${T}${T}{Placer`, `${T}${T}${T}{State "side_pointer" {Broken}}`, `${T}${T}}`, `${T}${T}{Extender "map_point"`,
          `${T}${T}${T}{name f${k}}`, `${T}${T}${T}{zoneA 12}`, `${T}${T}${T}{zoneB 12}`, `${T}${T}${T}{phase 0}`, `${T}${T}${T}{order ${k}}`,
          `${T}${T}${T}{show All}`, `${T}${T}${T}{visor MapPoint}`, `${T}${T}}`, `${T}${T}{Player 0}`, `${T}${T}{MID ${newMid()}}`, `${T}}`].join(NL) + NL;
      });
      const r = insertAfterMission(outTxt, add);
      if (r) { outTxt = r; notes.push(`added ${pos.length} flag_point entities`); warn('WARN_MC_FLAGS_AUTOPLACED', `${to}: ${pos.length} flags auto-placed on the line between team a/b spawn centroids (heuristic, vanilla layouts are hand placed); move them in the editor/by hand to sensible terrain, check zoneA/zoneB 12 m radius, flag count vs set parameter flag_count (maxPlayers ${maxPlayers()} -> ${n})`); }
      else manual('MC_NEEDS_MANUAL', `${to}: no {mission block found; add ${n} flag_point entities by hand`);
    }
  } else if (tc === 'captureflag') {
    const a = centroid('a'), b = centroid('b');
    if (!a || !b) manual('MC_NEEDS_MANUAL', `${to}: add flag_point_frontlines (map_point name captureflag, zoneA/zoneB 25, order 1, show All, visor MapPoint) + flag_ring entity at the map centre`);
    else {
      const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const add = [`${T}{Entity "flag_point_frontlines" ${newUid()}`, `${T}${T}{Position ${f2(p[0])} ${f2(p[1])}}`, `${T}${T}{Extender "map_point"`,
        `${T}${T}${T}{name captureflag}`, `${T}${T}${T}{zoneA 25}`, `${T}${T}${T}{zoneB 25}`, `${T}${T}${T}{phase 0}`, `${T}${T}${T}{order 1}`,
        `${T}${T}${T}{show All}`, `${T}${T}${T}{visor MapPoint}`, `${T}${T}}`, `${T}${T}{Player 0}`, `${T}${T}{MID ${newMid()}}`, `${T}}`,
        `${T}{Entity "flag_ring" ${newUid()}`, `${T}${T}{Position ${f2(p[0])} ${f2(p[1])}}`, `${T}}`].join(NL) + NL;
      const r = insertAfterMission(outTxt, add);
      if (r) { outTxt = r; notes.push('added captureflag flag + ring at spawn midpoint'); warn('WARN_MC_FLAGS_AUTOPLACED', `${to}: capture flag auto-placed at the spawn midpoint; move it to the intended objective`); }
    }
  }
  if (!srcHasFlags && !FLAGMODES.includes(tc) && tc !== 'captureflag') notes.push('no mode-specific entities to change');
  // captureflag needs clips captureflaga/b in the map's {Clips}: without them the game crashes at start, "Clipper 'captureflaga' is not
  // found!" (MIS-62 [V], ). Stock census 2026-11-08: 20 of 21 maps with captureflag.mi have both; 2v2_colleville lacks them [V data, I crash]
  if (tc === 'captureflag') {
    const mr = idx.get(`${mapKey}/map`), names = new Set();
    if (mr) {
      const ms = mr.read().toString('latin1'), ci = ms.search(/\{Clips\b/);
      if (ci >= 0) { const body = ms.slice(ci, matchEnd(ms, ci)); for (const m of body.matchAll(/\{\s*"([^"]+)"/g)) names.add(m[1].toLowerCase()); }
      const miss = ['captureflaga', 'captureflagb'].filter(n => !names.has(n));
      if (miss.length) rep.add(`resource/${mapKey}/map`, 0, 'MC_NO_CAPTURE_CLIPS', `captureflag needs clips ${miss.join(', ')} in the map's {Clips} (has: ${[...names].join(' ') || 'none'}); without them the game crashes at start "Clipper 'captureflaga' is not found!" (MIS-62). Add {"captureflaga" ..} and {"captureflagb" ..} blocks (copy "[auto]", cut camera/pather to each team's half, as stock 1v1_vierville), or clone from a map that has them`);
    } else rep.info(`resource/${mapKey}/map`, 0, 'MC_CAPTURE_CLIPS_UNREAD', `no ${mapKey}/map file found: captureflaga/b clips not checked (MIS-62)`);
  }
} else {
  // frontline / custom: verbatim copy + report what the target needs
  const phases = new Set((txt.match(/\{phase\s+(\d+)/g) || []).map(x => +x.replace(/\D/g, ''))).size;
  const slaves = ents.filter(e => /^flag_slave$/i.test(e.name)).length, sp = ents.filter(e => /^spawn_point$/i.test(e.name)).length;
  if (tc === 'frontline') {
    manual('MC_NEEDS_MANUAL', 'frontline: needs phase chain: per phase N a team-a/b spawn map_point (name a<N>1/b<N>1, {phase N}), a flag_point_frontlines per boundary with {allow {capture a}{release a}} and {phase N}, flag_slave children (zone 7.5), spawn_point entities ({mapPoint <name>}{pos 1..3}), plus the second {mission} block of vanilla frontline.mi; 1 combat-style phase-0 layout is NOT a working frontline. Frontline maps live in map/multi/a_frontlines/<map>/ in vanilla [T lobby needs the dir]');
  } else {
    manual('MC_NEEDS_MANUAL', `${to}: mode-specific parts unknown to this tool (${f === 'frontline' ? `source has ${phases} phases, ${slaves} flag_slave, ${sp} spawn_point` : `source ${from}`}); copied verbatim, review map_point/flag entities against set/multiplayer/games/${to}.set`);
  }
}

// ---- includes: (include "../bz_events.inc") etc. A missing include stops the map load (chain-n g1: GoH battle_zones.mi
// includes ../bz_*.inc, which AS2 lacks). Found in --src or a mod pak: copied into the mod at the same key. Found in game: kept.
// Found nowhere: the include is dropped with WARN_MC_INCLUDE_DROPPED (the mode logic in it is lost).
const incCopied = [];
function includes(text, fromKey, depth) {
  const re = /\(\s*include\s+"([^"]+)"[^)]*\)/gi;
  return text.replace(re, (m, p) => {
    const base = fromKey.split('/'); base.pop();
    const segs = []; for (const g of base.concat(p.toLowerCase().replace(/\\/g, '/').split('/'))) { if (g === '..') segs.pop(); else if (g && g !== '.') segs.push(g); }
    const key = p.startsWith('/') ? p.slice(1).toLowerCase() : segs.join('/');
    const r = idx.get(key);
    if (!r) { rep.add(relOut, 0, 'WARN_MC_INCLUDE_DROPPED', `include "${p}" (${key}) found in no source (game, mod paks, --src): dropped, or the map load stops "file not found"; the mode logic it held is lost (copy it by hand, or pass --src <GoH root>)`); return '; ' + m.replace(/[\r\n]/g, ' ') + ' ; dropped by mission-clone: file not found\r\n'; }
    if (r.origin === 'src' || r.origin === 'mod') {
      if (!incCopied.some(c => c.key === key) && depth < 8) {
        const body = includes(r.read().toString('latin1'), key, depth + 1);
        incCopied.push({ key, body, from: r.origin });
      }
    }
    return m;
  });
}
outTxt = includes(outTxt, `${mapKey}/${to}.mi`.toLowerCase(), 0);

// ---- GoH flag zones: GoH flags capture in a {zone "poly" {Name fN}} helper named by {zone {radius 0} {zoneId "fN"}} inside the
// map_point extender. AS2 reads only zoneA/zoneB (metres); unset = 0 -> GetZoneRadius clamps to 1 m
// (:179-184) = 20 units, so no flag ever flips (chain-n2 r2: 8 min, AI3 CaptureFlag orders, f1..f5 empty).
// Fix: flags with a GoH zoneId and no zoneA/zoneB get {zoneA R}{zoneB R}. R comes from the GoH {zone "poly" {Name id} {position x y z}
// {Point dx dy}..} helper when present (points are relative to the zone position [V 1v1_balzerweg: f2 flag 3178,-2507, zone 3180,-2502]):
// the circle of equal area, sqrt(area/pi) / 20 units per m, rounded to 0.5 m, at least 1 m. No poly -> --flag-zone (default 12 m, vanilla).
// AS2 checks a circle round the flag (GetZoneRadius), so a long thin GoH poly is only matched in area, not shape [I].
function polyRadii(txt) {
  const out = new Map();
  for (const m of txt.matchAll(/\{zone\s+"poly"((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    const nm = /\{Name\s+"([^"]*)"\}/.exec(m[1]); if (!nm) continue;
    const pts = [...m[1].matchAll(/\{Point\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\}/g)].map(p => [+p[1], +p[2]]);
    if (pts.length < 3) continue;
    let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    const r = Math.max(1, Math.round(Math.sqrt(Math.abs(a) / 2 / Math.PI) / 20 * 2) / 2);
    if (isFinite(r)) out.set(nm[1], r);
  }
  return out;
}
if (!isGoh) {   // GoH target: its own zoneId flags stay as they are
  const R = opt('flag-zone') ? +opt('flag-zone') : 12; let nz = 0;
  const fixed = [], polys = polyRadii(outTxt);
  for (const e of entities(outTxt).reverse()) {
    if (!isFlag(e) || /\{zone[AB]\s/.test(e.text)) continue;
    const z = /\{zoneId\s+"([^"]+)"\}/.exec(e.text); if (!z) continue;
    const nm = /^([ \t]*)\{name\s+[^}\r\n]*\}\r?\n/m.exec(e.text); if (!nm) continue;
    const at = e.start + outTxt.slice(e.start).indexOf(nm[0]) + nm[0].length;
    const r = polys.has(z[1]) ? polys.get(z[1]) : R;
    outTxt = outTxt.slice(0, at) + `${nm[1]}{zoneA ${r}}${NL}${nm[1]}{zoneB ${r}}${NL}` + outTxt.slice(at);
    nz++; fixed.unshift(`${z[1]}=${r}${polys.has(z[1]) ? 'poly' : ''}`);
  }
  const np = fixed.filter(f => /poly$/.test(f)).length;
  if (nz) { notes.push(`${nz} GoH flag zones -> zoneA/zoneB (${np} from poly, ${nz - np} at ${R})`); rep.info(relOut, 0, 'MC_FLAG_ZONE_SET', `${nz} flags had only a GoH zoneId and no zoneA/zoneB: AS2 capture radius would be 1 m; set zoneA/zoneB m: ${fixed.join(' ')} (poly = equal-area circle of the GoH zone "poly", else --flag-zone ${R}) [T: flags flip in game]`); }
}
for (const c of incCopied) rep.info(`resource/${c.key}`, 0, 'MC_INCLUDE_COPIED', `included by the clone; copied from ${c.from === 'src' ? '--src' : 'a mod pak'} so the map loads without that mod [T: its triggers run in AS2]`);

// ---- output ----
console.log(`${mapKey}: ${from} -> ${to}: ${notes.join('; ') || 'verbatim copy'} (${relOut})`);
if (!has('dry-run')) {
  const dst = path.join(out, relOut);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(outTxt, 'latin1'));
  for (const c of incCopied) { const d = path.join(out, 'resource', ...c.key.split('/')); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, Buffer.from(c.body, 'latin1')); }
  { const gs = incCopied.filter(c => c.from === 'src'); const lp = gs.length && require('../goh2as2/origin').record(out, gs.map(c => ({ file: path.resolve(out, 'resource', ...c.key.split('/')), buf: Buffer.from(c.body, 'latin1'), tool: 'mission-clone', src: c.key }))); if (lp) console.log(`GoH-origin ledger: ${lp}`); }
  if (withMode) writeMode(false);
  else if (isGoh) gohInfo(false);
  writeModInfo();
  if (isGoh) rep.info(relOut, 0, 'MC_LINT_SKIPPED', 'milint checks AS2 missions; not run on a GoH mode');
  else if (!has('no-lint')) lint();
} else if (withMode) writeMode(true);
else if (isGoh) gohInfo(true);
finish();

// GoH: a map folder holds <mode>.info per mode and no map.info [V data: 224 of 224 vanilla MP maps]; the new mode gets a copy of the
// source mode's .info (maxPlayers, texMod, mission options) unless the map has one [I: the lobby reads <mode>.info for the mode's card]
function gohInfoSrc() { return idx.get(`${mapKey}/map.info`) || idx.get(`${mapKey}/${f}.info`) || idx.get(`${srcKey}/${f}.info`); }
function gohInfo(dry) {
  const rel = `resource/${mapKey}/${t}.info`;
  if (idx.has(`${mapKey}/${t}.info`)) return rep.info(rel, 0, 'MC_INFO_KEPT', `map already has ${t}.info`);
  const r = gohInfoSrc();
  if (!r) return rep.add(rel, 0, 'MC_NEEDS_MANUAL', `no ${f}.info or map.info for ${mapKey}: write ${t}.info ({game {maxPlayers N}}) by hand`);
  console.log(`${dry ? 'plan' : 'wrote'}: ${rel} (copy of ${f}.info)  [I: GoH mode card reads <mode>.info]`);
  if (!dry) { const d = path.join(out, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, r.read()); }
}

// T-CHAINFIX: .set text with ; comments blanked to spaces outside "strings" (a ; inside {parameters "a;b"} is data), and the index of the } closing the block at i
function setLive(s) {
  let o = '', q = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; o += c; continue; }
    if (c === '"') { q = true; o += c; continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\r' && s[j] !== '\n') { o += ' '; j++; } j--; continue; }
    o += c;
  }
  return o;
}
function setBlockEnd(live, i) {
  let d = 0, q = false;
  for (let j = i; j < live.length; j++) { const c = live[j]; if (q) { if (c === '"' || c === '\n') q = false; continue; } if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) return j; }
  return -1;
}
// ---- --with-mode: everything a new MP mode needs to show in the lobby ----
function writeMode(dry) {
  const base = (fromMode || from).toLowerCase(), nm = withMode.toLowerCase();
  const say = m => console.log((dry ? 'plan: ' : 'wrote: ') + m);
  const wr = (rel, data) => { if (dry) return; const d = path.join(out, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, data); };
  // 1) mode .set: copy of the base mode's set (vanilla registers modes as set/multiplayer/games/<mode>.set, MAP-01)
  const setRel = `resource/set/multiplayer/games/${nm}.set`, brec = idx.get(`set/multiplayer/games/${base}.set`);
  if (idx.has(`set/multiplayer/games/${nm}.set`) && !fs.existsSync(path.join(out, setRel))) rep.info(setRel, 0, 'MC_MODE_EXISTS', `mode ${nm} already registered by game/mods; not overwritten`);
  else if (!brec) rep.add(setRel, 0, 'MC_NO_BASE_SET', `no set/multiplayer/games/${base}.set to copy (--from-mode)`);
  else {
    let st = brec.read().toString('latin1'); const e = st.includes('\r\n') ? '\r\n' : '\n';
    // a base that has its own {order N} (GoH battle_zones.set {order 0} [V data]) loses it: one {order} key, ours (AS2 bases have none)
    st = st.replace(/^\t\{order[ \t]+-?[\d.]+\}[ \t]*\r?\n/m, '');
    st = st.replace(/^(\{game[^\n]*?)(\r?\n)/, (m, a, nl) => a + nl + `\t{class ${base}}${e}\t{order 100}${e}`);
    // T-CHAINFIX (TST-03 [V]): a lobby slot takes an AI only when the mode's {settings} holds {enableBots}; vanilla combat.set has none (G-CHAIN2 read), so the
    // clone gets it: kept when the source has it, else added at the end of {settings} (or a {settings {enableBots}} block when the source has none [I]). --no-bots: verbatim.
    let bots = 'kept off (--no-bots)';
    if (!has('no-bots')) {
      const live = setLive(st);   // comments blanked (same length), strings kept: indices match st
      if (/\{\s*enableBots\b/i.test(live)) bots = `{enableBots} kept from ${base}.set`;
      else {
        const sm = /\{\s*settings\b/i.exec(live), end = sm ? setBlockEnd(live, sm.index) : -1;
        if (end > 0) { const ls = st.lastIndexOf('\n', end - 1) + 1, pre = /^[ \t]*$/.test(st.slice(ls, end)) ? ls : end;
          st = st.slice(0, pre) + (pre === end ? ' {enableBots}' : `\t\t{enableBots}${e}`) + st.slice(pre); bots = '{enableBots} added to {settings} (TST-03: a bot slot needs it)'; }
        else { st = st.replace(/(\{order 100\})(\r?\n)/, `$1$2\t{settings${e}\t\t{enableBots}${e}\t}${e}`); bots = '{settings {enableBots}} added: the base has no {settings} [I]'; }
      }
    }
    say(`${setRel} (copy of ${base}.set + {class ${base}} {order 100}; ${bots})  ${isGoh ? '[I: GoH {class} form as vanilla set/multiplayer/games/gamemode.template; hosts + loads [T]]' : '[V: mode registers, hosts + loads; testrun scenario mc-mode; bot slot [T]]'}`);
    wr(setRel, Buffer.from(st, 'latin1'));
  }
  // 2) <mode>.info for the target map (MAP-22: map.info/<mode>.info override only; stub = copy of map.info)
  const mi = isGoh ? gohInfoSrc() : idx.get(`${mapKey}/map.info`), infoRel = `resource/${mapKey}/${nm}.info`;
  if (mi && isGoh) { say(`${infoRel} (copy of ${f}.info)  [I: GoH mode card reads <mode>.info]`); wr(infoRel, mi.read()); }
  else if (mi) { say(`${infoRel} (copy of map.info)  [T: per-mode .info name/override, MAP-22]`); wr(infoRel, mi.read()); }
  else say(`no map.info for ${mapKey}: no ${nm}.info stub written`);
  // 3) mode name: lobby key mp/game/<mode> (vanilla #dlg_mp.lng {"mp" {"game" {"combat" "Combat"}}}), UTF-8 per LOC-05
  const title = modeTitle || withMode, lngRel = `localization/#${nm}.lng`;
  if (isGoh) {   // GoH text: .pot under localizations/default/interface/text (GHLOC-01, mods/template layout [V]); key = msgctxt (GHLOC-06), empty msgstr shows msgid
    const potRel = `localizations/default/interface/text/mc_${nm}.pot`, esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    say(`${potRel} msgctxt mp/game/${nm} = "${title}"  (UTF-8, as vanilla dlg_mp.pot)  [T: key resolves in lobby]`);
    wr(potRel, Buffer.from(['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '', `msgctxt "mp/game/${nm}"`, `msgid "${esc(title)}"`, 'msgstr ""', ''].join('\n'), 'utf8'));
    say('bot scripts: GoH has script/multiplayer/bot.main.lua + modes/*.lua, no bot.data.lua (GHMIS-66); a {class ' + base + '} mode uses the base mode\'s; no stub written [T]');
    return;
  }
  say(`${lngRel} key mp/game/${nm} = "${title}"  (UTF-8; via lng-add)  [T: key resolves in lobby]`);
  if (!dry) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'lng-add', 'lng-add.js'), out, '--file', '#' + nm + '.lng', '--key', 'mp/game/' + nm, '--text', title, '--game', game, '--force', ...(VEXE && VEXE !== 'as64' ? ['--exe', VEXE] : [])], { encoding: 'utf8' });
    if (r.status !== 0) rep.add(lngRel, 0, 'MC_LNG_FAIL', ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/)[0]);
  }
  // 4) bot.data.lua: vanilla has one global script/multiplayer/bot.data.lua, no per-mode file -> nothing written
  say('bot.data.lua: vanilla has a single script/multiplayer/bot.data.lua (no per-mode file); no stub written [T: bots in new mode use it unchanged]');
}
// T-CLONEFIX: the game only sees a mod folder with mod.info (G-MAPS: edrun MOD_NOT_INSTALLED on a bare output). Same form as map-clone:
// as64 install (as64.exe in --game) or --target as64 -> MinGameVersion 3.301; else Classic 3.262.0..3.262.1; --game-version min[,max]; --no-modinfo opts out.
function writeModInfo() {
  if (has('no-modinfo')) return;
  // --exe names the game: default target = that game (--exe mowas_2 on the shared install = Classic range, not as64 from as64.exe)
  const target = opt('target') ? games.idOf(opt('target')) : (G ? G.id : null), gvOpt = opt('game-version');
  let gv = gvOpt ? gvOpt.split(',') : null;
  if (!gv && target === 'goh') {   // GoH: Min = Max = the exe's own version, 1.067 scale (newmod --target goh, GHNET-22, PORT-46)
    const v = require('../modmove/lib/common').dataVersion('goh', path.join(game, ...games.get('goh').file.split('/'))).ver;
    if (!v) { rep.add('mod.info', 0, 'MC_MODINFO_NO_VERSION', 'GoH exe version not readable: pass --game-version'); return; }
    gv = [v, v];
  }
  const as64 = target ? target === 'as64' : fs.existsSync(path.join(game, 'as64.exe'));
  const rng = gv ? [`MinGameVersion "${gv[0]}"`, ...(gv[1] ? [`MaxGameVersion "${gv[1]}"`] : [])] : as64 ? ['MinGameVersion "3.301"'] : ['MinGameVersion "3.262.0"', 'MaxGameVersion "3.262.1"'];
  const q = s => '"' + s + '"', p = path.join(out, 'mod.info');
  const info = ['{Mod', `\t{Name ${q('mode ' + to)}}`, `\t{Desc ${q('clone of ' + from + ' on ' + mapKey.split('/').pop())}}`, ...rng.map(r => `\t{${r}}`), '}', ''].join('\r\n');
  const had = fs.existsSync(p);
  if (!had) fs.writeFileSync(p, Buffer.from(info, 'latin1'));
  rep.info('mod.info', 0, 'MC_MODINFO', had ? 'kept' : `written (${target === 'goh' ? 'GoH ' + gv[0] : as64 ? 'as64' : 'Classic'} range)`);
}
function lint() {
  const exe = path.join(__dirname, '..', 'milint', 'milint.js');
  const run = d => {
    const r = cp.spawnSync(process.execPath, [exe, d, '--game', game, '-q', ...(VEXE && VEXE !== 'as64' ? ['--exe', VEXE] : [])], { encoding: 'utf8', maxBuffer: 1 << 28 });
    return (r.stdout || '').split('\n').filter(l => /: [A-Z_]+ /.test(l) && !/^info:/.test(l));
  };
  const mine = relOut.replace(/\\/g, '/');
  const noSet = !withMode && !idx.has(`set/multiplayer/games/${to.toLowerCase()}.set`);   // already reported as MC_NO_MODE_SET
  const mineK = [mapKey + '/' + to.toLowerCase() + '.mi', ...incCopied.map(c => c.key)];
  const lines = run(out).filter(l => mineK.some(m => l.toLowerCase().includes(m)) && !(noSet && /MAP_MODE_UNDEFINED|MAP_NO_MODE/.test(l)));
  for (const l of lines) rep.add(relOut, 0, 'MC_MILINT', l);
}
function finish() {
  rep.print({ showInfo: !quiet });
  // exit 1 only for errors; WARN_ findings (include dropped, flags auto-placed) are printed but leave exit 0 (T-MCFIX)
  process.exit(rep.toJSON().findings.some(x => x.severity === 'error') ? 1 : 0);
}
