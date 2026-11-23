// modmove test fixture -> test/work/ (gitignored): fake AS2 + GoH dirs, a user dir with a cp1251 options.set, seeded static mods.
// ASCII-only source; odd bytes are written from escapes. CRLF.
// Author: Imperator_Aug (ARSENAL, ia-bac36ab3)
const fs = require('fs'), path = require('path');
const zip = require('../../lib/zipwrite');
const W = path.join(__dirname, 'work');
fs.rmSync(W, { recursive: true, force: true });
const put = (rel, text, enc) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(text) ? text : Buffer.from(text, enc || 'latin1')); };
const crlf = lines => lines.join('\r\n') + '\r\n';

// ---- fake installs
put('as2/mods/.keep', '');
put('as2/as64/plus/mod.info', crlf(['{Mod', '\t{Name "as64+"}', '}']));
put('as2/mods/e2e_pre/mod.info', crlf(['{Mod {Name "pre"} {MinGameVersion "3.262"} {MaxGameVersion "3.262"}}']));
put('goh/mods/template/mod.info', crlf(['{Mod {Name "template"} {minGameVersion "1.500"} {maxGameVersion "1.510"}}']));
put('goh/mods/mm_stage_taken/mod.info', crlf(['{Mod {Name "taken"}}']));
put('goh/mods/mm_stage_taken/keep.txt', 'do not touch\r\n');

// mini vanilla (loose resource files; the AS2 extension set comes from here): 30 files, kinds .def .set .mdl .ext
for (let i = 0; i < 8; i++) { put('as2/resource/entity/v' + i + '.def', ';SDL\r\n'); put('as2/resource/set/v' + i + '.set', ';SDL\r\n'); put('as2/resource/mdl/v' + i + '.mdl', ';SDL\r\n'); put('as2/resource/props/v' + i + '.ext', ';SDL\r\n'); }
put('goh/resource/entity/g.def', ';SDL\r\n');

// ---- user dir with a profile whose bytes contain cp1251 text (restore must be byte-identical)
const opt = Buffer.concat([Buffer.from('{options\r\n\t{name "'), Buffer.from([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), Buffer.from('"}\r\n\t{mods\r\n\t\t"e2e_pre:0"\r\n\t}\r\n\t{last 1}\r\n}\r\n')]);
put('home/profiles/p1/options.set', opt);
put('gohlog/profiles/g1/options.set', crlf(['{options', '}']));
put('home/log/.keep', '');
// pre-existing stage folder (AS2 stage must be restored byte-identical)
put('as2/mods/e2e_test/mod.info', crlf(['{Mod {Name "previous e2e_test"} {MinGameVersion "3.262"} {MaxGameVersion "3.262"}}']));
put('as2/mods/e2e_test/data.bin', Buffer.from([0, 255, 1, 254, 2, 253]));

// ---- modern fixture mod for live mode tests
put('mods/modern/mod.info', crlf(['{Mod', '\t{Name "modern"}', '\t{MinGameVersion "3.301"}', '}']));

// ---- AS2 assets moved to GoH (as64 -> goh): rule per asset kind
put('togoh/mod.info', crlf(['{Mod', '\t{Name "togoh"}', '\t{minGameVersion "1.500"}', '}']));
put('togoh/resource/entity/inventory/weapon/smg1/smg1.def', crlf(['{actor', '\t(include "/properties/stuff_small.ext")', '\t{extension "smg1.mdl"}', '}']));
put('togoh/resource/entity/inventory/weapon/smg1/smg1.mdl', crlf(['{Skeleton', '\t{bone "foresight3"', '\t}', '}']));
put('togoh/resource/set/stuff/smg/smg1', crlf(['{from "pattern smg"', '\t{entity "smg1"}', '}']));
put('togoh/resource/set/stuff/head/h1', crlf(['{from "helmet pattern"', '\t{entity "h1"}', '}']));
put('togoh/resource/entity/vehicle/usa/truck1/truck1.def', crlf(['{game_entity', '\t{extension "truck1.mdl"}', '}']));
// ---- seeded static mod (goh -> mowas2). truth.md: one defect per line
put('seed/mod.info', crlf(['{Mod', '\t{Name "seed"}', '\t{MinGameVersion "1.500"}', '\t{MaxGameVersion "1.510"}', '\t{Require "as64+"}', '}']));
put('seed/as64/core/resource/shader/x.hlsl', '// x\r\n');
put('seed/localization/as64/english.lng', crlf(['{tags', '\t{"as64/english" {"k" "v"}}', '}']));
put('seed/resource/set/as64/squad_size.set', crlf([';SDL', '{squad_size 12}']));
put('seed/resource/set/utf8.set', Buffer.concat([Buffer.from(';SDL\r\n{text "'), Buffer.from([0xC3, 0xA9]), Buffer.from('"}\r\n')]));   // UTF-8 string: fine on as64 too (ENCFIX)
put('seed/resource/set/cp.set', Buffer.concat([Buffer.from(';SDL\r\n{text "'), Buffer.from([0xCF, 0xF0]), Buffer.from('"}\r\n')]));   // legacy cp1251 string
put('seed/resource/entity/vehicle/tank.def', crlf(['{entity', '\t("armor health custom" 0.5)', '}']));
put('seed/1.pat', zip.zip([['readme.txt', Buffer.from('no .patch entry\r\n')]]));
put('seed/resource/entity/clean.def', crlf(['{entity', '}']));
put('seed/resource/map/a.materials', crlf(['{materials}']));   // GoH-only kind (PORT-31)

// ---- bad mod.info (ENG-24)
put('badinfo/mod.info', crlf(['{Mod', '\t{Name "bad"', '}']));
// ---- clean legacy mod (as64 -> mowas2: nothing to change)
put('clean/mod.info', crlf(['{Mod', '\t{Name "clean"}', '\t{MinGameVersion "3.262"}', '\t{MaxGameVersion "3.262"}', '}']));
put('clean/resource/set/clean.set', crlf([';SDL', '{x 1}']));
// ---- PORT-81: GoH interface/ folder in a mod headed for as64 (uigoh) and its clean twin (uigoh_ok, no interface/)
for (const n of ['uigoh', 'uigoh_ok']) {
  put(n + '/mod.info', crlf(['{Mod', '\t{Name "' + n + '"}', '\t{MinGameVersion "3.301"}', '}']));
  put(n + '/resource/set/clean.set', crlf([';SDL', '{x 1}']));
}
put('uigoh/resource/interface/pages/main.set', crlf([';SDL', '{page 1}']));
console.log('fixture written to ' + W);
