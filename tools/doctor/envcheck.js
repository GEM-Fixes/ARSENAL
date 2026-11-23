// doctor env checks (in-process, no sub-tool): VFS-13 / VFS-33 / MAP-27
//   envcheck(folder, game, { options, modsList, gameId }) -> report (rep.add counted, rep.info not)
//   gameId (lib/games id, from doctor): as64+ counts as installed for as64 only; goh: Workshop items count (GHVFS-31), game map paks are
//   read from every resource/**/*.pak keyed at their folder (root paks such as dlc1.pak: no prefix), maps may sit deeper, map mod/ rows carry [I] (VFS-33 not confirmed for GoH)
//   DOC_MOD_NOT_INSTALLED options.set {mods} line with no mods/<name>/mod.info or with capitals ( ApplyMods FindMod; VFS-13)
//   DOC_MAPMOD_SHADOWS     resource/map/**/mod/<rel> overlays resource/<rel> that the mod also ships elsewhere (VFS-33, ReadSceneFiles)
//   DOC_MAPMOD_OVERLAY     info: a map's mod/ folder lists its overlay files (they beat all mods until CloseScene, and are MOVED)
//   DOC_MAP_LOOSE_SHADOWS_PAK info [T]: loose resource/map/<kind>/<map>/map beside a pak copy (MAP-27, unverified in game)
//   CRASH_OBSTACLE_UNKNOWN / CRASH_TERRAIN_LAYERS / CRASH_FLAG_CLIPS: crashrules.js (o.deps = mounted mod folders, for obstacles.reg)
// Author: Imperator_Aug (ARSENAL, ia-b3f932c8)
const fs = require('fs'), path = require('path');
const { createReport, walkFiles, relPath } = require('../lib/report'), pak = require('../lib/pak'), { discover } = require('../lib/vfs'), { readModList } = require('../lib/vfs');

function pakKeys(files) {
  const keys = new Map(); // lowercased key -> pak basename
  for (const f of files) { try { for (const e of pak.list(f)) if (!e.name.endsWith('/')) { const k = e.name.toLowerCase(); if (!keys.has(k)) keys.set(k, path.basename(f)); } } catch (e) { /* unreadable pak: skip */ } }
  return keys;
}

function envcheck(folder, game, o = {}) {
  const rep = createReport();
  // VFS-13
  let list = o.modsList || null, where = 'mods list';
  if (!list && o.options) { const r = readModList(o.options); list = r.mods; where = path.basename(o.options); for (const p of r.problems) rep.add(where, 0, 'DOC_' + p.code, p.msg); }
  // o.gameId (doctor, lib/games): as64+ is installed only for as64 (no game id: as before, the folder decides); GoH lists Workshop items
  // too (lib/vfs discover items) and has the same {mods} line form: names, optional :ver, unknown skipped (GHVFS-31 [V], base VFS-13)
  const gid = o.gameId || null, goh = gid === 'goh';
  if (list && game) {
    const found = discover(game, [], { items: goh });
    for (const s of list) {
      const name = s.split(':')[0];
      if (name === 'as64+' && (!gid || gid === 'as64') && fs.existsSync(path.join(game, 'as64', 'plus', 'mod.info'))) continue;
      if (!found.has(name) || name !== name.toLowerCase())
        rep.add(where, 0, 'DOC_MOD_NOT_INSTALLED', `"${s}": engine skips it and drops it from options (no mods/${name}/mod.info, or capitals; game.log "was disabled: Not installed")`);
    }
  }
  // T-CRASH: obstacleID not in obstacles.reg (STR-29), terrain .mtl layers (MAP-29), captureflag clips (MIS-62): crashrules.js
  require('./crashrules').crashRules(folder, game, o.deps, rep);
  // VFS-33 / MAP-27
  const res = path.join(folder, 'resource'), mapRoot = path.join(res, 'map');
  if (!fs.existsSync(mapRoot)) return rep;
  const all = walkFiles(folder, /./);
  const modPaks = all.filter(f => /\.pak$/i.test(f));
  const loose = new Set(all.filter(f => !/\.pak$/i.test(f)).map(f => relPath(res, f).replace(/\\/g, '/').toLowerCase()));
  let modKeys = null;
  const mkeys = () => modKeys || (modKeys = pakKeys(modPaks));
  const overlays = new Map(); // mod dir rel -> [rels]
  // GoH: exists (gohweb the game scene manager) but no gohweb row says whether it still moves map mod/ files: as64 rule assumed
  const GOH_MAPMOD = goh ? ' [I GoH: as64 rule VFS-33 assumed, no gohweb row]' : '';
  for (const f of all) {
    const r = relPath(folder, f).replace(/\\/g, '/');
    const m = r.match(/^resource\/(map\/.+?\/)mod\/(.+)$/i);
    if (m) { const k = 'resource/' + m[1] + 'mod/'; (overlays.get(k) || overlays.set(k, []).get(k)).push(m[2]); }
  }
  for (const [dir, rels] of overlays) {
    let n = 0;
    for (const rel of rels) {
      const key = rel.toLowerCase();
      const at = loose.has(key) ? 'loose resource/' + rel : mkeys().has(key) ? 'pak ' + mkeys().get(key) : null;
      if (at) { n++; rep.add(dir + rel, 0, 'DOC_MAPMOD_SHADOWS', `overlays resource/${rel}, which the mod also ships (${at}): the map's mod/ copy wins for the whole match (moved over it until CloseScene)${GOH_MAPMOD}`); }
    }
    rep.info(dir, 0, 'DOC_MAPMOD_OVERLAY', `${rels.length} overlay file(s) beat all active mods during a match${n ? `, ${n} shadow own files` : ''}: ${rels.slice(0, 4).join(', ')}${rels.length > 4 ? ', ...' : ''}${GOH_MAPMOD}`);
  }
  // MAP-27: loose map file next to a pak copy (mounted game paks or own paks)
  const maps = all.map(f => relPath(res, f).replace(/\\/g, '/')).filter(r => (goh ? /^map\/.+\/map$/i : /^map\/[^/]+\/[^/]+\/map$/i).test(r));   // GoH nests maps a level deeper (map/multi/0_frontlines/<map>/map)
  if (maps.length) {
    // GoH keeps paks in resource/ and its subfolders (resource/dlc1.pak holds map/multi/..., resource/map/<n>/multi.pak), each keyed at
    // its own folder (lib/vfs.js GoH mount): walk every resource/**/*.pak, not only resource/map/ (that one may be absent)
    const gp = !game || !fs.existsSync(path.join(game, 'resource')) ? [] : goh ? walkFiles(path.join(game, 'resource'), /\.pak$/i)
      : fs.readdirSync(path.join(game, 'resource')).filter(f => /\.pak$/i.test(f)).map(f => path.join(game, 'resource', f));
    const gk = goh ? new Map() : pakKeys(gp);
    // GoH: a pak at resource/<dir>/x.pak holds keys relative to resource/<dir>/; a root pak resource/x.pak has no prefix
    if (goh) for (const p of gp) { const pre = path.relative(path.join(game, 'resource'), path.dirname(p)).replace(/\\/g, '/').toLowerCase(); for (const [k, v] of pakKeys([p])) { const gkey = pre ? pre + '/' + k : k; if (!gk.has(gkey)) gk.set(gkey, v); } }
    for (const r of maps) {
      const k = r.toLowerCase(), src = gk.has(k) ? gk.get(k) : mkeys().has(k) ? mkeys().get(k) : null;
      if (src) rep.info('resource/' + r, 0, 'DOC_MAP_LOOSE_SHADOWS_PAK', `loose map file shadows pak copy in ${src} (assumed to win by VFS order, MAP-27 untested in game)`);
    }
  }
  return rep;
}
module.exports = { envcheck };
