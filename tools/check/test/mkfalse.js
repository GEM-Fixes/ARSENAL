// check-false fixture, seeded test): <out>/game = tiny game dir (stub exe) + mods/fm, a small mod whose
// only real crash is one missing include in a used unit. every other seed is a false/repeated crash the audit found in RobZ:
//   texture/** .def with a missing include (never an entity), an orphan unit with an unknown weapon + undefined macro,
//   a unit named only by an interaction selector key, a {##on disabled block, an OBJ-style .mtl no .ply names,
//   a standalone .inc with (* 0.50 %scalex), MACRO_UNDEFINED follow-ons of the real missing include,
//   a dashed unit named only by its .tex / a quoted file stem (R1 R2), a losing duplicate def with an unknown weapon (R3)
// usage: node mkfalse.js [out]   (rewrites out, default ./fl)
// Author: Imperator_Aug (ARSENAL, ia-299e9758)
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'fl'));
require('../../lib/testscratch').guard(out);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(out, { recursive: true, force: true });
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const put = (root, k, s) => { const f = path.join(root, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crlf(s)); };
const G = path.join(out, 'game'), M = path.join(G, 'mods', 'fm');
fs.mkdirSync(G, { recursive: true }); fs.writeFileSync(path.join(G, 'mowas_2.exe'), 'stub');
put(G, 'resource/set/stuff/gun/rifle1', '{weapon\n}\n');
put(G, 'resource/interface/font/main10.font', '{font_atlas\n\t{name "main"}\n\t{size 10}\n}\n');
put(M, 'mod.info', '{Mod\n\t{Name "fm"}\n\t{Desc "check-false fixture"}\n\t{MinGameVersion "3.262.1"}\n\t{MaxGameVersion "3.262.1"}\n}\n');
// REAL: used unit, missing include + 2 macros it would have defined (follow-ons fold into the include row)
put(M, 'resource/entity/real/tank_r.def', '{game_entity\n\t(include "/properties/missing.inc")\n\t("nodef" x(1))\n\t("nodef2" x(1))\n}\n');
// used unit with an author-disabled block and an OBJ-style material nothing names
put(M, 'resource/entity/dis/tank_d.def', '{game_entity\n\t{Weaponry {place "gun" {weapon "rifle1"}}}\n\t{##on blast\n\t\t{spawn "nothing"}\n\t}\n}\n');
put(M, 'resource/entity/dis/gunnew.mtl', '# obj material\nnewmtl gunnew\nKd 1 1 1\n');
put(M, 'resource/set/units.set', '{units\n\t{"tank_r"}\n\t{"tank_d"}\n}\n');
// FALSE: never-loaded files
put(M, 'resource/texture/inventory/skin.def', '{texture\n\t(include "missing.inc")\n\t("nodef" x(1))\n}\n');
put(M, 'resource/entity/orph/tank_o.def', '{game_entity\n\t{Weaponry {place "gun" {weapon "nogun"}}}\n\t("nodef" x(1))\n}\n');
put(M, 'resource/entity/sel/tank_s.def', '{game_entity\n\t("nodef" x(1))\n}\n');
put(M, 'resource/set/interaction_entity/sel.inc', '{"tank_s"\n\t{on fire "gun"\n\t\t{spawn "rifle1"}\n\t}\n}\n');
put(M, 'resource/properties/selection/elong.inc', '{scale (* 0.50 %scalex)}\n{size (* 0.50 %scaley)}\n');
// R1 + R2: a dashed unit named only by its own .tex and a quoted file stem elsewhere: unused, so gated
put(M, 'resource/entity/dash/tank-x.def', '{game_entity\n\t("nodef" x(1))\n}\n');
put(M, 'resource/entity/dash/tank-x.tif.tex', '{texture\n\t{Frame "tank-x.dds"}\n}\n');
put(M, 'resource/set/icons.set', '{icons\n\t{icon "tank-x.dds"}\n}\n');
// R3: a used name with two defs; dup/a wins (path order), the losing dup/b copy has an unknown weapon
put(M, 'resource/entity/dup/a/twin.def', '{game_entity\n\t{Weaponry {place "gun" {weapon "rifle1"}}}\n}\n');
put(M, 'resource/entity/dup/b/twin.def', '{game_entity\n\t{Weaponry {place "gun" {weapon "nogun"}}}\n}\n');
put(M, 'resource/set/twin.set', '{units\n\t{"twin"}\n}\n');
console.log('fixture ok');
