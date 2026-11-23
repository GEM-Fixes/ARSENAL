// builds test/fx: a SYNTHETIC fake GoH tree (loose files) and a tiny fake AS2 dir. No real game data. Seeded defects: truth.md
// Author: Imperator_Aug (ARSENAL, ia-b6151f5e)
const fs = require('fs'), path = require('path');
const FX = path.join(__dirname, 'fx');
fs.rmSync(FX, { recursive: true, force: true });
const put = (rel, text) => { const p = path.join(FX, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text.replace(/\r?\n/g, '\r\n')); };

// fake AS2
put('as2/as64.exe', 'not a pe');
put('as2/resource/entity/vanilla/vanilla_unit.def', '{game_entity\n}\n');

// fake GoH (loose resource/)
const E = 'goh/resource/entity/';
put(E + '-vehicle/ger/tank_a/tank_a.def', '{game_entity "tank_a"\n  {volume "v" {caststeel 1} {able {blockcamera}}}\n  {##place "a" {x 1}}\n}\n');
put(E + '-vehicle/ger/btr/btr_a/btr_a.def', '{game_entity "btr_a"\n  {sequence "s" {events {frame 1}}}\n}\n');
put(E + 'inventory/-weapon/-small_arms/rifle_a/rifle_a.def', '{game_entity "rifle_a"\n  {extension "/properties/p.ext"}\n}\n');
put(E + 'flora/tree_a/tree_a.def', '{game_entity "tree_a"\n  {mdl "tree_a.mdl"}\n}\n');
put(E + 'flora/tree_a/tree_a.mdl', '{model\n  {mesh "tree_a.ply"}\n}\n');
put(E + 'fx/fx_a.def', '{game_entity "fx_a"\n}\n');
put(E + 'misc/odd#name/odd#name.def', '{game_entity "odd"\n}\n');          // special name: not listable in a preload list
put(E + 'vanilla/vanilla_unit.def', '{game_entity "same name as the AS2 one"\n}\n');   // AS2 name collision: excluded
put('goh/resource/properties/p.ext', '{entity\n}\n');
// part B (non-entity files)
put('goh/resource/set/stuff/gun/g1.ammo', '{bullet "b"\n  {possibledamageradius 3}\n}\n');
put('goh/resource/set/stuff/gun/g2.weapon', '{from "x"\n  {calibre 7}\n}\n');
put('goh/resource/set/stuff/gun/g3.weapon', '{weapon\n}\n');
