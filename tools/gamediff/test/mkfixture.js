// builds fixture/{as2,goh}: tiny game dirs with seeded differences (see truth.md)
// Author: Imperator_Aug (ARSENAL, ia-4531c3df)
const fs = require('fs'), path = require('path');
const { writeZip } = require('../../lib/zipwrite');
const root = path.join(__dirname, 'fixture');
fs.rmSync(root, { recursive: true, force: true });
const mk = p => fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
const put = (rel, d) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
// AS2: loose + game dir exe + mods
put('as2/resource/entity/a.def', '{game_entity "a"\r\n  {foo 1}\r\n  {gears 1}\r\n  (include "/properties/stuff_small.ext")\r\n}\r\n');
put('as2/resource/entity/b.def', '{actor "b"\r\n  {foo 2}\r\n  {gears 2}\r\n}\r\n');
put('as2/resource/entity/c.ply', Buffer.from('EPLY\x01\0\0\0', 'latin1'));
put('as2/resource/set/stuff/w.weapon', '{weapon "w"\r\n  {rechargetime 1}\r\n}\r\n');
put('as2/resource/map/m1/map', '{map}');
put('as2/resource/map/m1/a.mi', '{mission {zonea 1}}');
put('as2/as64.exe', 'x');
// as64/core layer: read only with --exe as64 (run.sh checks it apart from truth.md)
put('as2/as64/core/resource/entity/core.def', '{game_entity "core"\r\n  {zz_core_key 1}\r\n}\r\n');
put('as2/mods/m/mod.info', '{mod\r\n {name "m"}\r\n {minGameVersion "3.262"}\r\n}\r\n');
put('as2/mods/m/resource/x.txt', 'x');
mk('as2/localization.pak');
writeZip(path.join(root, 'as2/localization.pak'), [['#dlg.lng', Buffer.from('\xEF\xBB\xBF{tags {"a" "b"}}', 'latin1')]]);
// GoH: pak + loose
mk('goh/resource/entity.pak');
writeZip(path.join(root, 'goh/resource/entity.pak'), [
  ['entity/a.def', Buffer.from('{game_entity "a"\r\n  {foo 1}\r\n  {caststeel 1}\r\n  (include "/properties/stuff_weapon.ext")\r\n}\r\n')],
  ['entity/b.def', Buffer.from('{game_entity "b"\r\n  {foo 2}\r\n  {caststeel 2}\r\n}\r\n')],
  ['entity/c.ply', Buffer.from('BPLY\x02\0\0\0', 'latin1')],
  ['entity/m.materials', Buffer.from('{materials {layer {diffuse "x"}}}')],
]);
put('goh/resource/set/stuff/w.weapon', '{weapon "w"\r\n  {calibre 7}\r\n}\r\n');
put('goh/resource/difficulties/e.txt', 'x');
put('goh/mods/m/mod.info', '{mod\r\n {name "m"}\r\n {tags "mod"}\r\n {minGameVersion "1.500"}\r\n}\r\n');
put('goh/mods/m/resource/x.txt', 'x');
fs.mkdirSync(path.join(root, 'goh/binaries'), { recursive: true });
mk('goh/localizations/default.pak');
writeZip(path.join(root, 'goh/localizations/default.pak'), [['default/interface/text/a.pot', Buffer.from('msgctxt "a"\nmsgid "b"\nmsgstr ""\n\nmsgctxt "c"\nmsgid "d"\nmsgstr ""\n')]]);
