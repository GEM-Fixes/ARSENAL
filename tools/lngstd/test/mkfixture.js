// lngstd fixture: fixture/mod/localization (split layout) + truth.md (findings = items left unchanged).
// put(rel, lines): line = text | [text, CODE...] -> truth "rel:line: CODE". Each pass: one seeded case + one must-not-change case.
// Author: Imperator_Aug (ARSENAL, ia-5d7ff71a)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (items lngstd leaves and reports; edits are checked by check.js)'];
const loc = path.join(dir, 'mod', 'localization');
function put(rel, lines) {
  const f = path.join(loc, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'utf8');   // UTF-8 no BOM, CRLF
}
const C = '<c(c3baae)>', H = '<c(ba38ff)>', W = '<c(ffffff)>';
const stat = (rng, pen, vel, acc) => `${W}\\n Range - <c(ffaf00)>${rng} m${W}\\n Penetration APCBC - <c(ffaf00)>${pen} mm${W}\\n Muzzle velocity - ${vel} m/s\\n Accuracy - <c(ff0000)>${acc}`;

put('desc.lng', [
  '; parent',
  '{tags',
  '\t{"human"',
  '\t\t{"mp"',
  '\t\t\t{"ger"',
  '\t\t\t\t(include "desc/vanilla/human/mp/ger.inc")',
  '\t\t\t\t(include "desc/mod/human/ger.inc")',
  '\t\t\t}',
  '\t\t}',
  '\t}',
  '\t{"squad"',
  '\t\t(include "desc/mod/squad/ger/squad1.inc")',
  '\t}',
  '\t{"weapon"',
  '\t\t(include "desc/mod/weapon.inc")',
  '\t}',
  '}',
]);
put('desc/vanilla/human/mp/ger.inc', [
  '; vanilla part',
  `{"rifleman" "${C}Schütze — vanilla‑text  kept "}`,
]);
put('desc/mod/human/ger.inc', [
  '; desc/human/mp/ger/* : keys this mod changed or added',                       // 1
  '; [new] not in any buy-list card',
  `{"grenadier" "${C}Grenadier"}`,
  '; [new] glyph seeded: U+2011',
  `{"at_soldier" "${C}Anti‑tank Schütze"}`,                               // 5
  '; [new] glyph must-not: diacritics',
  `{"elite_at" "${C}Fallschirmjäger"}`,
  '; [new] glyph other: macron left',
  [`{"super_officer" "${C}Rikugun-shōshō"}`, 'WARN_LNGSTD_GLYPH_OTHER'],
  '; [new] case seeded',                                                            // 10
  `{"Sniper_Elite" "${C}Scharfschütze"}`,
  '; [new] case collision',
  [`{"Medic" "${C}Sanitäter"}`, 'LNGSTD_CASE_COLLISION'],
  `{"medic" "${C}Sanitäter"}`,
  '; [new] space seeded',                                                           // 15
  `{"ap_miner" "${C}Pionier  (AP mines) "}`,
  '; [new] soldier seeded: no prefix',
  `{"radioman" "Funker"}`,
  '; [new] soldier seeded: space after tag, lower first letter',
  `{"tankman" "${C} panzerbesatzung"}`,                                             // 20
  '; [new] soldier must-not: hero colour sub-group',
  [`{"hero1" "${H}Otto Carius"}`, 'WARN_LNGSTD_SOLDIER_SUBGROUP'],
  [`{"hero2" "${H}Michael Wittmann"}`, 'WARN_LNGSTD_SOLDIER_SUBGROUP'],
  `{"mg" "${C}MG Schütze"}`,
  `{"mg_asst" "${C}MG Schütze asst."}`,                                         // 25
  `{"sl" "${C}Gruppenführer"}`,
]);
put('desc/mod/weapon.inc', [
  '; desc/weapon/*',
  `{"75mm_pak40" "75mm PaK 40${stat(200, '146 - 93', 792, 'High')}"}`,
  `{"75mm_kwk40" "75mm KwK 40${stat(200, '133 - 84', 740, 'High')}"}`,
  `{"88mm_flak36" "88mm FlaK 36${stat(230, '161 - 109', 810, 'Very high')}"}`,
  '; weapon seeded: label wording, unit spacing, stat order',                        // 5
  `{"50mm_pak38" "50mm PaK 38${W}\\n Effective range - <c(ffaf00)>190m${W}\\n Muzzle velocity - 835 m/s\\n Penetration APC - <c(ffaf00)>97 - 38 mm${W}\\n Accuracy - <c(ffaf00)>Medium"}`,
  '; weapon must-not: plain name',
  `{"mp40" "MP 40"}`,
  [`{"skoda_75mm" "75mm Gebirgskanone<s(4)><c(white)>\\n\\n - Max range, m  : 180 - Penetration, mm : 26</c>"}`, 'WARN_LNGSTD_WEAPON_UNPARSED'],
  `{"barrage_gun" "203-mm mortar${W}\\n Range - <c(00ff04)>600 m${W}\\n Barrage - <c(ffaf00)>1 shell${W}\\n Muzzle velocity - 600 m/s\\n Accuracy - <c(ff0000)>Low"}`, // 10
  `{"flare" "Flare gun, low velocty"}`,                                            // spelling seeded (not applied)
]);
put('desc/mod/squad/ger/squad1.inc', [
  '; ger squad1',
  '; [new] card "grenadiers_44(ger)" year seeded',
  `{"grenadiers_44(ger)" "Grenadier squad"}`,
  '; [new] card "grenadiers_43(ger)"',
  `{"grenadiers_43(ger)" "Grenadier squad"}`,                                        // 5
  '; [new] card "fusiliers_44(ger)" year must-not: texts differ (ToE comment only)',
  '; ToE: 5. Kompanie',
  `{"fusiliers_44(ger)" "Fusilier squad (late)"}`,
  '; [new] card "fusiliers_42(ger)"',
  `{"fusiliers_42(ger)" "Fusilier squad"}`,                                          // 10
  '; [new] card "tiger_crew(ger)" no year',
  `{"tiger_crew(ger)" "Tiger crew"}`,
]);
put('_dropped/desc.inc', [`{"old" "parked ‘text’ — kept"}`]);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
