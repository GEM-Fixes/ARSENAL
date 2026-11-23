// lngstd test: edits in fixture/out, untouched files byte-identical, report rows, second run a no-op
// Author: Imperator_Aug (ARSENAL, ia-dff79dfd)
const fs = require('fs'), path = require('path');
const fx = path.join(__dirname, 'fixture'), inL = path.join(fx, 'mod', 'localization'), out = path.join(fx, 'out'), out2 = path.join(fx, 'out2');
const lngstd = require('../lngstd');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL: ' + m); } };
const rd = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8').split('\r\n');
const C = '<c(c3baae)>';

// unit: glyph / space helpers
ok(lngstd.glyph('a—b').s === 'a - b', 'em dash glued -> " - "');
ok(lngstd.glyph('a — b').s === 'a - b', 'em dash spaced -> "-"');
ok(lngstd.glyph('“x” ’s…').s === '\\"x\\" \'s...', 'curly quotes, ellipsis');
ok(lngstd.space('x<c(ffffff)>\\n  Range  -  1') === 'x<c(ffffff)>\\n  Range - 1', 'space next to \\n kept, others collapsed');

// untouched files
for (const rel of ['desc.lng', 'desc/vanilla/human/mp/ger.inc', '_dropped/desc.inc'])
  ok(fs.readFileSync(path.join(inL, rel)).equals(fs.readFileSync(path.join(out, rel))), rel + ' byte-identical');

const h = rd(out, 'desc/mod/human/ger.inc');
ok(h[4] === `{"at_soldier" "${C}Anti-tank Schütze"}`, 'glyph seeded: ' + h[4]);
ok(h[6] === `{"elite_at" "${C}Fallschirmjäger"}`, 'glyph must-not');
ok(h[10] === `{"sniper_elite" "${C}Scharfschütze"}`, 'case seeded: ' + h[10]);
ok(h[12].startsWith('{"Medic"') && h[13].startsWith('{"medic"'), 'case collision left');
ok(h[15] === `{"ap_miner" "${C}Pionier (AP mines)"}`, 'space seeded: ' + h[15]);
ok(h[17] === `{"radioman" "${C}Funker"}`, 'soldier prefix added: ' + h[17]);
ok(h[19] === `{"tankman" "${C}Panzerbesatzung"}`, 'soldier spacing + capital: ' + h[19]);
ok(h[21] === '{"hero1" "<c(ba38ff)>Otto Carius"}', 'soldier sub-group left');
ok(h[0] === '; desc/human/mp/ger/* : keys this mod changed or added' && h.length === 27, 'comments kept, no lines added');

const w = rd(out, 'desc/mod/weapon.inc');
ok(w[5] === '{"50mm_pak38" "50mm PaK 38<c(ffffff)>\\n Range - <c(ffaf00)>190 m<c(ffffff)>\\n Penetration APC - <c(ffaf00)>97 - 38 mm<c(ffffff)>\\n Muzzle velocity - 835 m/s\\n Accuracy - <c(ffaf00)>Medium"}', 'weapon seeded: ' + w[5]);
ok(w[7] === '{"mp40" "MP 40"}', 'weapon plain name kept');
ok(w[9].includes('Barrage - <c(ffaf00)>1 shell<'), 'barrage singular kept');

const s = rd(out, 'desc/mod/squad/ger/squad1.inc');
ok(s[1].startsWith('; [new] card "grenadiers_44') && s[2] === '; ToE:' && s[3] === '{"grenadiers_44(ger)" "Grenadier squad 1944"}', 'year seeded 44: ' + s.slice(1, 4).join(' | '));
ok(s[5] === '; ToE:' && s[6] === '{"grenadiers_43(ger)" "Grenadier squad 1943"}', 'year seeded 43');
ok(s[8] === '; ToE: 5. Kompanie' && s[9] === '{"fusiliers_44(ger)" "Fusilier squad (late)"}', 'year must-not: existing ToE kept, text kept');
ok(s[11] === '; ToE:' && s[12] === '{"fusiliers_42(ger)" "Fusilier squad"}', 'year group with other texts: ToE only');
ok(s[14] === '{"tiger_crew(ger)" "Tiger crew"}' && s[13].startsWith('; [new] card "tiger'), 'no-year key: no ToE');

// every out file CRLF, UTF-8 no BOM
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const b = fs.readFileSync(p); ok(b[0] !== 0xef && !/(^|[^\r])\n/.test(b.toString('utf8')), 'CRLF/BOM ' + p); } } })(out);

// report rows
const rep = fs.readFileSync(path.join(fx, 'report.tsv'), 'utf8').split('\r\n').filter(Boolean).map(l => l.split('\t'));
ok(rep[0].join(',') === 'file,line,key,pass,before,after', 'report header');
for (const p of ['glyph', 'case', 'space', 'soldier', 'weapon', 'year']) ok(rep.some(r => r[3] === p), 'report has a ' + p + ' row');
ok(rep.some(r => r[3] === 'year' && r[1] === '4' && r[5] === 'Grenadier squad 1944'), 'report line numbers follow the out file');
const sp = fs.readFileSync(path.join(fx, 'spelling.tsv'), 'utf8');
ok(/	velocty	velocity	/.test(sp) && w[10] === '{"flare" "Flare gun, low velocty"}', 'spelling candidate listed, not applied');
ok(sp.startsWith('file\tline\tkey\tword\tsuggestion\twhy'), 'spelling header');

// second run is a no-op
const r2 = lngstd.run({ locDir: out });
ok(r2.outFiles.size === 0 && r2.changes.length === 0, `second run changes ${r2.changes.length}`);
void out2;
console.log(fail ? `${fail} checks failed` : 'checks ok');
process.exit(fail ? 1 : 0);
