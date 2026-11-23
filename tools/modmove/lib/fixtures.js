// modmove fixtures: minimal mods, one per known difference, + manifest.json (what `static` should show per direction).
//   write(outDir) -> manifest. Usable as `static` inputs and as `live --mod <dir>`. ASCII only (cp1251 == utf8), CRLF.
// Author: Imperator_Aug (ARSENAL, ia-64e4b4af)
const fs = require('fs'), path = require('path');
const CANARY = path.resolve(__dirname, '..', 'fixtures', 'canary');

const info = (name, min, max) => '{Mod\r\n\t{Name "' + name + '"}\r\n' + (min ? '\t{MinGameVersion "' + min + '"}\r\n' : '') + (max ? '\t{MaxGameVersion "' + max + '"}\r\n' : '') + '}\r\n';
const MODS = {
  mm_legacy_nomin: {
    why: 'legacy mod: no MinGameVersion', files: { 'mod.info': info('mm_legacy_nomin') },
    expect: { 'any->as64': ['MOVE_VERSION_RANGE'], 'any->mowas2': ['MOVE_VERSION_RANGE_MOWAS2'] },
  },
  mm_modern_3301: {
    why: 'modern mod: MinGameVersion 3.301 (needs as64+ in {mods})', files: { 'mod.info': info('mm_modern_3301', '3.301') },
    expect: { 'any->as64': [], 'any->mowas2': ['MOVE_VERSION_ABOVE_TARGET'], 'any->goh': ['MOVE_GOH_VERSION_SCALE'] },
  },
  mm_as64_core: {
    why: 'as64/core override + as64 .lng (VFS-46, LOC-23)',
    files: {
      'mod.info': info('mm_as64_core', '3.262', '3.262'),
      'as64/core/resource/shader/mm_probe.hlsl': '// probe\r\n',
      'localization/as64/english.lng': '{tags\r\n\t{"as64/english" {"mm" "x"}}\r\n}\r\n',
    },
    expect: { 'any->mowas2': ['MOVE_AS64_CORE_ONLY', 'MOVE_AS64_LNG'], 'any->goh': ['MOVE_AS64_CORE_ONLY', 'MOVE_AS64_LNG'], 'any->as64': [] },
  },
  mm_as64_key: {
    why: 'as64-only key: set/as64/squad_size.set (AS64+ config, read only in Enhanced)',
    files: { 'mod.info': info('mm_as64_key', '3.301'), 'resource/set/as64/squad_size.set': ';SDL\r\n{squad_size 12}\r\n' },
    expect: { 'any->mowas2': ['MOVE_AS64_PLUS_SET', 'MOVE_VERSION_ABOVE_TARGET'], 'any->as64': [] },
  },
  mm_as2_data: {
    why: 'AS2 data GoH names differently (tools/gamediff): .lng, include, map .mtl layer, set/breed',
    files: {
      'mod.info': info('mm_as2_data', '3.262', '3.262'),
      'localization/desc.lng': '{tags\r\n\t{"desc" {"mm" "x"}}\r\n}\r\n',
      'resource/entity/-vehicle/mm_t.def': '{game_entity\r\n\t(include "/properties/veterancy_generic.inc")\r\n}\r\n',
      'resource/map/mm_m/mm_m.mtl': '{material terrain\r\n\t{layer "a"}\r\n}\r\n',
      'resource/set/breed/mm_b.set': '{breed}\r\n',
    },
    expect: { 'any->goh': ['WARN_MOVE_LNG_GOH', 'MOVE_INCLUDE_RENAME', 'WARN_MOVE_MAP_MTL_LAYER', 'WARN_MOVE_SET_NEW_FILE'], 'any->as64': [] },
  },
  mm_goh_data: {
    why: 'GoH include names AS2 does not have',
    files: { 'mod.info': info('mm_goh_data', '1.067'), 'resource/entity/-vehicle/mm_g.def': '{game_entity\r\n\t(include "/properties/resupply.inc")\r\n}\r\n' },
    expect: { 'goh->as64': ['MOVE_INCLUDE_RENAME'], 'goh->mowas2': ['MOVE_INCLUDE_RENAME'] },
  },
  mm_goh_armor: {
    why: 'GoH-only armor key "armor health custom" (PORT-03)',
    files: {
      'mod.info': info('mm_goh_armor', '1.067'),
      'resource/entity/vehicle/mm_goh_tank.def': '{entity\r\n\t(  "armor health custom" 0.5 )\r\n}\r\n',
    },
    expect: { 'goh->mowas2': ['WARN_MOVE_PORT_ARMOR_HEALTH_CUSTOM'], 'goh->as64': ['WARN_MOVE_PORT_ARMOR_HEALTH_CUSTOM'] },
  },
};

function write(out) {
  fs.mkdirSync(out, { recursive: true });
  const manifest = { generated: 'tools/modmove fixtures', mods: {} };
  for (const [name, m] of Object.entries(MODS)) {
    const dir = path.join(out, name);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(m.files)) {
      const f = path.join(dir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text, 'latin1');
    }
    manifest.mods[name] = { why: m.why, expect: m.expect };
  }
  const cd = path.join(out, 'modmove_canary');
  fs.rmSync(cd, { recursive: true, force: true });
  fs.cpSync(CANARY, cd, { recursive: true });
  manifest.mods.modmove_canary = {
    why: 'canary [T]: duplicated .lng key -> "Localization key redefinition ... zz_modmove_canary" in game.log at boot; legacy range so it loads on mowas_2 and Classic as64',
    expect: { 'any->as64': [], live: 'mod run log must contain the canary line; baseline must not' },
  };
  manifest.note = 'expect lists codes static emits for that direction ("any" = from either side). live: as64 legacy mods run without as64+, modern with as64+ first; mowas_2 only legacy.';
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}
module.exports = { write, MODS };
