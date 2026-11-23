// builds test/fx: a fake AS2 install, a fake GoH install, mods with one seeded defect each (truth.md). no real game needed
// Author: Imperator_Aug (ARSENAL, ia-324c84af)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const FX = path.join(__dirname, 'fx');
fs.rmSync(FX, { recursive: true, force: true });
const put = (rel, text) => { const p = path.join(FX, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const info = (min, max, extra = '') => '{Mod\r\n\t{Name "fixture"}\r\n' + (min ? `\t{MinGameVersion "${min}"}\r\n` : '') + (max ? `\t{MaxGameVersion "${max}"}\r\n` : '') + extra + '}\r\n';
const CLEAN = '{game_entity\r\n\t{Weaponry {place "gun" {weapon "rifle1"}}}\r\n}\r\n';
const MACRO = '{game_entity\r\n\t("nodef" x(1))\r\n}\r\n';
const INCLUDE = '{game_entity\r\n\t(include "/properties/missing.inc")\r\n}\r\n';
const WEAPON = '{game_entity\r\n\t{Weaponry {place "gun" {weapon "nogun"}}}\r\n}\r\n';

// store-only zip (paks are zip, vfs/mount)
function zip(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name), d = Buffer.from(text), crc = zlib.crc32(d);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt32LE(crc, 14); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locals.push(l, n, d); central.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(entries).length, 8); e.writeUInt16LE(Object.keys(entries).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

// ---- fake AS2
put('game/as64.exe', 'not a pe'); put('game/mowas_2.exe', 'not a pe');
put('game/resource/set/stuff/gun/rifle1', '{weapon\r\n}\r\n');
put('game/resource/entity/base/base.def', CLEAN);
put('game/as64/plus/mod.info', info('3.301'));
const mod = (name, mi, files = {}) => { if (mi !== null) put(`game/mods/${name}/mod.info`, mi); for (const [f, t] of Object.entries(files)) put(`game/mods/${name}/${f}`, t); };
const OK = info('3.262', '3.262');
mod('clean', OK, { 'resource/entity/a/a.def': CLEAN });
mod('nomax', info('3.262'), { 'resource/entity/a/a.def': CLEAN });
mod('nomin', info('', '3.262'), { 'resource/entity/a/a.def': CLEAN });
mod('range_low', info('3.100', '3.200'), { 'resource/entity/a/a.def': CLEAN });
mod('modern_ok', info('3.301'), { 'resource/entity/a/a.def': CLEAN });
mod('modern_high', info('3.999'), { 'resource/entity/a/a.def': CLEAN });
mod('crash_macro', OK, { 'resource/entity/m/tank_m.def': MACRO, 'resource/map/m.mi': '(spawn tank_m)' });
mod('crash_inc', OK, { 'resource/entity/i/tank_i.def': INCLUDE, 'resource/map/m.mi': '(spawn tank_i)' });
mod('crash_via', OK, { 'resource/entity/v/tank_v.def': '{game_entity\r\n\t(include "shared.inc")\r\n}\r\n', 'resource/entity/v/shared.inc': '("nodef" x(1))\r\n', 'resource/map/m.mi': '(spawn tank_v)' });
mod('crash_weapon', OK, { 'resource/entity/w/tank_w.def': WEAPON, 'resource/map/m.mi': '(spawn tank_w)' });
// reachability: same defect, different reachability
mod('orph_macro', OK, { 'resource/entity/o/tank_o.def': MACRO });
mod('orph_word', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/map/m.mi': '(spawn tank_oo tank_o2 xtank_o)' });
mod('orph_pak_ref', OK, { 'resource/entity/o/tank_o.def': MACRO }); fs.writeFileSync(path.join(FX, 'game/mods/orph_pak_ref/resource.pak'), zip({ 'map/m.mi': '(Spawn TANK_O)' }));
mod('orph_override', OK, { 'resource/entity/base/base.def': MACRO });
mod('orph_mixed', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/entity/o/tank_r.def': MACRO, 'resource/set/s.set': '{tank_r}\r\n' });
// check-false B: selector key in an interaction file is not a reference; a {spawn} value inside one is
mod('orph_selector', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/set/interaction_entity/t.inc': '{"tank_o"\r\n\t{on fire "gun" {spawn "shell1"}}\r\n}\r\n' });
mod('reach_selector_val', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/set/interaction_entity/t.inc': '{"tank_x"\r\n\t{on fire "gun" {spawn "tank_o"}}\r\n}\r\n' });
// check-false R1: dashed names are scanned (edge also stops at '-'); R2: .lng/.tex/thumbs.db hits and quoted file stems ("tank_o.dds") are no refs
mod('reach_dash', OK, { 'resource/entity/d/tank-d.def': MACRO, 'resource/map/m.mi': '(spawn tank-d)' });
mod('orph_dash', OK, { 'resource/entity/d/tank-d.def': MACRO, 'resource/map/m.mi': '(spawn x-tank-d tank-d2 tank_d tank-dd)' });
mod('orph_filestem', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/entity/o/tank_o.tif.tex': '{texture\r\n\t{Frame "tank_o.dds"}\r\n}\r\n',
  'resource/entity/o/thumbs.db': 'bin TANK_O bin', 'resource/interface/text/desc.lng': '{tags\r\n\t{"tank_o" "Tank O"}\r\n}\r\n',
  'resource/map/m.mi': '{mission\r\n\t{file "/entity/o/tank_o.mdl"}\r\n\t{icon "tank_o.dds"}\r\n}\r\n' });
mod('reach_filestem_plain', OK, { 'resource/entity/o/tank_o.def': MACRO, 'resource/map/m.mi': '{mission\r\n\t{icon "tank_o.dds"}\r\n\t{spawn "tank_o"}\r\n}\r\n' });
mod('silent_only', OK, { 'resource/texture/t/skin.def': MACRO, 'resource/entity/a/a.def': CLEAN });
mod('dup_loser', OK, { 'resource/entity/a/twin.def': CLEAN, 'resource/entity/b/twin.def': MACRO });
// row 166 (TF-15): the loser reaches its defect through an include (root = loser def); winner clean -> silent. Mirror: winner carries the include -> counts
const VIA = '{game_entity\r\n\t(include "shared.inc")\r\n}\r\n';
mod('dup_loser_via', OK, { 'resource/entity/a/twin.def': CLEAN, 'resource/entity/b/twin.def': VIA, 'resource/entity/b/shared.inc': '("nodef" x(1))\r\n', 'resource/map/m.mi': '(spawn twin)' });
mod('dup_winner_via', OK, { 'resource/entity/a/twin.def': VIA, 'resource/entity/a/shared.inc': '("nodef" x(1))\r\n', 'resource/entity/b/twin.def': CLEAN, 'resource/map/m.mi': '(spawn twin)' });
// row 210 (TF-15): HARD code under a set/ root = LOAD class, counted, no reach question
mod('crash_set', OK, { 'resource/set/s.set': MACRO });
mod('pak_ok', OK); fs.writeFileSync(path.join(FX, 'game/mods/pak_ok/resource.pak'), zip({ 'entity/p/p_ok.def': CLEAN }));
mod('pak_crash', OK); fs.writeFileSync(path.join(FX, 'game/mods/pak_crash/resource.pak'), zip({ 'entity/p/tank_p.def': MACRO, 'map/m.mi': '(spawn tank_p)' }));
mod('pak_bad', OK); fs.writeFileSync(path.join(FX, 'game/mods/pak_bad/resource.pak'), 'this is not a zip at all, the central directory is missing, padding padding');
mod('stray_pak', OK, { 'resource/entity/a/a.def': CLEAN }); fs.writeFileSync(path.join(FX, 'game/mods/stray_pak/extra.pak'), zip({ 'entity/p/never.def': MACRO }));
mod('patched', OK, { 'resource/entity/a/a.def': CLEAN }); fs.writeFileSync(path.join(FX, 'game/mods/patched/1.pat'), zip({ 'entity/p/p_ok.def': CLEAN }));
mod('req_missing', info('3.262', '3.262', '\t{Require "nosuchmod"}\r\n'), { 'resource/entity/a/a.def': CLEAN });
mod('req_skipped', info('3.262', '3.262', '\t{Require "nomax"}\r\n'), { 'resource/entity/a/a.def': CLEAN });   // vfs names nomax first (MOD_VERSION), then this mod
mod('req_ok',info('3.262', '3.262', '\t{Require "clean"}\r\n'), { 'resource/entity/r/r_ok.def': CLEAN });
mod('plus_on_legacy', info('3.262', '3.262', '\t{Require "as64+"}\r\n'), { 'resource/entity/a/a.def': CLEAN });
mod('bad_info', '{Mod\r\n\t{Name "un"escaped"}\r\n\t{Desc "x\r\n}\r\n', { 'resource/entity/a/a.def': CLEAN });
mod('no_info', null, { 'resource/entity/a/a.def': CLEAN });
// game parity: as64/core holds an include and a weapon only as64.exe mounts; the mowas2 pass (--exe mowas_2) must not see them
put('game/as64/core/resource/properties/core_only.inc', '{Mass 1}\r\n');
put('game/as64/core/resource/set/stuff/gun/core_gun', '{weapon\r\n}\r\n');
mod('core_inc', OK, { 'resource/entity/c/tank_c.def': '{game_entity\r\n\t(include "/properties/core_only.inc")\r\n}\r\n', 'resource/map/m.mi': '(spawn tank_c)' });
mod('core_weapon', OK, { 'resource/entity/c/tank_cw.def': '{game_entity\r\n\t{Weaponry {place "gun" {weapon "core_gun"}}}\r\n}\r\n', 'resource/map/m.mi': '(spawn tank_cw)' });

// ---- outside the game's mods folder
put('outside/packed/mod.info', OK); fs.writeFileSync(path.join(FX, 'outside/packed/resource.pak'), zip({ 'entity/p/p_ok.def': CLEAN }));
put('outside/loose/mod.info', OK); put('outside/loose/resource/entity/a/a.def', CLEAN);

// ---- fake GoH
put('goh/binaries/x64/call_to_arms.exe', 'not a pe');
put('goh/resource/set/stuff/gun/rifle1', '{weapon\r\n}\r\n');
const gmod = (name, mi) => { put(`goh/mods/${name}/mod.info`, mi); put(`goh/mods/${name}/resource/entity/a/a.def`, CLEAN); };
gmod('g_ok', info('1.035', '1.99'));
gmod('g_high', info('1.500', '1.510'));
gmod('g_scale', info('3.262', '3.262'));
gmod('g_low', info('1.000', '1.050'));
gmod('g_any', info('any', 'any'));
gmod('g_minonly', info('1.067'));
gmod('g_none', info());
// GHVFS-02: Tags "develop" lifts the GoH version check (the shape of a real develop-tagged GoH mod: Min above the exe version); "developer" is not the word
gmod('g_develop', info('1.105', '1.110', '\t{Tags "no_delete DEVELOP"}\r\n'));
gmod('g_developer', info('1.105', '1.110', '\t{Tags "developer"}\r\n'));
// two Tags lines, develop in the first: every line counts, as lib/vfs reads them (gate and mount must agree)
gmod('g_develop2', info('1.105', '1.110', '\t{Tags "develop"}\r\n\t{Tags "no_delete"}\r\n'));
// AS2 ignores the key (GHVFS-02 "as64 ignores key silently"): the legacy range still decides
mod('tag_develop', info('3.100', '3.200', '\t{Tags "develop"}\r\n'), { 'resource/entity/a/a.def': CLEAN });
put('goh/mods/g_pak/mod.info', info('1.035', '1.99')); fs.writeFileSync(path.join(FX, 'goh/mods/g_pak/resource.pak'), zip({ 'entity/p/p_ok.def': CLEAN }));
put('goh/mods/g_crash/mod.info', info('1.035', '1.99')); put('goh/mods/g_crash/resource/entity/m/tank_g.def', MACRO); put('goh/mods/g_crash/resource/map/m.mi', '(spawn tank_g)'); // a ref keeps tank_g reachable (not ORPHAN) now vfs mounts the GoH fixture as goh
// a GoH folder with no binaries/x64/call_to_arms.exe (exe named by --exe-goh): the goh pass names exe goh to the vfs, so the mod
// mounts on the GoH version rule; picked by its exe files it would be read as mowas_2 (AS2 range 1.035-1.99 refused)
put('goh_noexe/resource/set/stuff/gun/rifle1', '{weapon\r\n}\r\n');
put('goh_noexe/mods/g_named/mod.info', info('1.035', '1.99')); put('goh_noexe/mods/g_named/resource/entity/a/a.def', CLEAN);
// GOHMOD-3: Workshop-style GoH mod outside <goh>/mods, all paks (resource/*.pak + localizations/<lang>.pak)
put('outside/g_ws/mod.info', info('1.035', '1.99')); put('outside/g_ws/localizations/ru.pak', zip({ 'ru/interface/text/a.po': 'msgid ""\nmsgstr ""\n' }));
fs.mkdirSync(path.join(FX, 'outside/g_ws/resource'), { recursive: true }); fs.writeFileSync(path.join(FX, 'outside/g_ws/resource/a.pak'), zip({ 'entity/p/p_ok.def': CLEAN }));
put('outside/g_ws_crash/mod.info', info('1.035', '1.99'));
fs.mkdirSync(path.join(FX, 'outside/g_ws_crash/resource'), { recursive: true }); fs.writeFileSync(path.join(FX, 'outside/g_ws_crash/resource/a.pak'), zip({ 'entity/m/tank_w.def': MACRO }));
