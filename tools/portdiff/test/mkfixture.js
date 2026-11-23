// builds test/fixture/{as2,goh}: tiny game dirs (AS2 loose, GoH loose + zip pak). seeded diffs listed in truth.md
// Author: Imperator_Aug (ARSENAL, ia-5eca1c1e)
const fs = require('fs'), path = require('path');
const { writeZip } = require('../../lib/zipwrite');
const root = path.join(__dirname, 'fixture');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
// AS2: loose
put('as2/resource/entity/a.def', '{game_entity "a"\r\n  {foo 1}\r\n  {bar 1}\r\n  {armor {durability 5}}\r\n  {blk {x 1}}\r\n  {same 1 2}\r\n}\r\n');
put('as2/resource/entity/b.def', '{game_entity "b"\r\n  {foo 2}\r\n  {bar 2}\r\n  {same 3 4}\r\n}\r\n');
put('as2/resource/entity/c.mtl', '{material "m"\r\n  {diffuse "x.dds"}\r\n  {layer {bump "y"}}\r\n}\r\n');
put('as2/resource/texture/t.dds', 'DDS ');
// GoH: loose set + pak with defs/binaries
put('goh/resource/set/stuff/w.weapon', '{weapon_bullet "w"\r\n  {from {calibre 7}}\r\n}\r\n');
put('goh/resource/set/stuff/v.weapon', '{weapon_bullet "v"\r\n  {from {calibre 9}}\r\n}\r\n');
writeZip(path.join(root, 'goh/resource/entity.pak'), [
  ['entity/a.def', Buffer.from('{game_entity "a"\r\n  {foo 1 2}\r\n  {bar "s"}\r\n  {perks {component 1}}\r\n  {blk 3}\r\n  {same 5 6}\r\n}\r\n')],
  ['entity/b.def', Buffer.from('{game_entity "b"\r\n  {foo 3 4}\r\n  {bar "t"}\r\n  {perks {component 2}}\r\n  {blk 4}\r\n  {same 7 8}\r\n}\r\n')],
  ['entity/c.mtl', Buffer.from('{material "m"\r\n  {diffuse "x.dds"}\r\n  {lightmap "l"}\r\n}\r\n')],
  ['entity/bad.def', Buffer.from('{game_entity "bad"\r\n  {foo 1\r\n')],
  ['shader/cache/x.pso', Buffer.from([1, 2, 3, 0])],
  ['shader/cache/y.pso', Buffer.from([1, 2, 3, 0])],
  ['entity/s.vso', Buffer.from([1, 2, 0])],
]);
// per-file porting checks (PORT-01/03/05/07/10)
put('as2/resource/set/stuff/gun/g1.weapon', '{weapon_bullet "g1"\r\n  {from "pattern apcbc"}\r\n}\r\n');
put('as2/resource/entity/veh.def', '{game_entity "veh"\r\n  {bone "turret" {limits -5 5} {speed 12}}\r\n  {bone "gun" {limits -5 5} {speed 0.0043}}\r\n  {bone "t2" {limits -5 5} {speed2 0.004}}\r\n  {bone "t3" {limits -5 5} {speed2 8}}\r\n  ("armor_medium" turret(100 90 80 40))\r\n  {volume "body" {thickness 50}}\r\n}\r\n');
put('as2/resource/entity/veh0.def', '{game_entity "veh0"\r\n  ("armor_medium" turret(0 0 0 0))\r\n  {volume "body" {thickness 50}}\r\n}\r\n');
put('goh/resource/entity/gv.def', '{game_entity "gv"\r\n  {volume "body" {CastSteel 0.8}}\r\n  ;{HighHardness 1}\r\n  {HighHardness 1}\r\n  {delay 1\r\n    {##/* if rand\r\n      {call "x"}\r\n    */}\r\n  }\r\n  ("armor health custom" filler(50))\r\n}\r\n');
put('goh/resource/set/stuff/gun/g2.weapon', '{weapon_bullet "g2"\r\n  {parameters "apc"\r\n    {projectileDamageTable {10 100} {100 80}}\r\n  }\r\n  {parameters "apcbc"\r\n    {projectileDamageTable {10 100} {100 80}}\r\n  }\r\n}\r\n');
put('goh/resource/entity/gov.def', '{game_entity "gov"\r\n  ("ap_slope_multipliers" filler(50))\r\n}\r\n');
fs.writeFileSync(path.join(__dirname, 'out.txt'), '');
// PORT-34: GoH pak entries are rooted at the pak's own dir: resource/entity/-vehicle.pak '-vehicle/gx.def' => entity/-vehicle/gx.def
put('as2/resource/entity/-vehicle/gx.def', '{game_entity "gx"\r\n  {zq 1}\r\n}\r\n');
writeZip(path.join(root, 'goh/resource/entity/-vehicle.pak'), [['-vehicle/gx.def', Buffer.from('{game_entity "gx"\r\n  {zq 1}\r\n  {extra 1}\r\n}\r\n')]]);
