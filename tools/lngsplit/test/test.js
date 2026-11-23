// lngsplit regression: fixture mod + fixture vanilla game written to test/tmp (CRLF, UTF-8), then lib/lnginc unit checks and the CLI.
// one defect per line in truth.md. prints PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-21f22f66)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const lnginc = require('../../lib/lnginc');
const T = path.join(__dirname, 'tmp'), TOOL = path.join(__dirname, '..', 'lngsplit.js');
fs.rmSync(T, { recursive: true, force: true });
const W = (rel, lines) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines); };
// vanilla game
W('game/localization/desc.lng', ['{tags', '\t{human {mp {ger', '\t\t{"rifle" "Rifleman"}', '\t\t{"mg" "MG"}', '\t}}}', '\t{ammo {"7_92x57 ger" "7.92mm"}}', '}']);
W('game/localization/#dlg.lng', ['{tags', '\t{mp {"title" "T"} {scene {"hint_squad1" "Infantry squads"}}}', '}']);
W('game/resource/set/breed/mp/ger/rifle.set', ['{breed}']);
W('game/localization/info.lng', ['{tags', '\t{squad {"van_card" "Vanilla van"}}', '}']);
W('game/resource/set/breed/mp/ger/mg.set', ['{breed}']);
W('game/resource/entity/-vehicle/tank_medium/tank_a/tank_a.def', ['{game_entity}']);
W('game/resource/entity/-vehicle/moto/bike/bike.def', ['{game_entity}']);
// mod
W('mod/localization/desc.lng', ['{tags', '\t{human {mp {ger',
  '\t\t{"rifle" "Rifleman"}', '\t\t{"Ghost" "Ghost"}  ; no breed', '\t\t{"mg" "MG gunner"}', '\t}}}',
  '\t{entity', '\t\t{"tank_a" "Tank A"}', '\t\t{"Tank_A" "Tank A2"}', '\t\t{"bike" "Bike"}', '\t\t{"ghost2" "G2"}', '\t}',
  '\t{squad', '\t\t{"inf_a(ger)" "Inf A"}', '\t\t{"hero1(ger)" "H1"}', '\t\t{"moto_grp(ger)" "Bikes"}', '\t\t{"bare_two" "T"}', '\t\t{"bare_two(ger)" "T"}',
  '\t\t{"bare_four(ger)" "G"}', '\t\t{"bare_four(eng)" "E"}', '\t}',
  '\t(include "parts/extra.inc")', '\t(include "/interface/text/parts/rooted.inc")', '\t(include "parts/missing.inc")', '}']);
W('mod/localization/parts/extra.inc', ['{squad (include "nested.inc")}']);
W('mod/localization/parts/nested.inc', ['{"x(ger)" "X squad"}']);
W('mod/localization/parts/rooted.inc', ['{weapon {"w1" "W1" " two"} {"w2" "W2"}}']);
W('mod/localization/parts/cyc.inc', ['(include "cyc.inc")', '{"c" "C"}']);
W('mod/localization/#dlg.lng', ['{tags', '\t{mp {"title" "T"} {"newui" "N"}}', '}']);
W('mod/localization/mission/single/a/b.lng', ['{tags {"name" "B"}}']);
W('mod/resource/set/dummy.set', ['{x "unused"}']);
// buy list: infantry, vehicle on two sides (one via {info}), hero, vehicle-grouping card, commented-out hero card
W('mod/resource/set/multiplayer/games/frontline.set', ['{buttons "squad1 v1 v2 v3"}', '{buttons "hero"}']);
W('mod/resource/set/multiplayer/units/units_44-45.set', ['{units',
  '\t{"inf_a(ger)" {button squad1} {group squad_1} {cost 80} {content "mp/ger/rifle:4 mp/ger/mg"} {tags "infantry 44"}}',
  '\t{"tank_a" {button v2} {group t1} {cost 300} {content "tank_a ( mp/ger/rifle:2 )"} {tags "ger 44"}}',
  '\t{"tank_b(eng)" {button v3} {group t2} {cost 310} {info "tank_a"} {content "tank_a ( mp/ger/rifle:2 )"}}',
  '\t{"hero1(ger)" {button hero} {group h1} {cost 1} {content "mp/ger/rifle"}}',
  '\t{"moto_grp(ger)" {button squad1} {group squad_mot} {cost 150} {content "bike ( mp/ger/rifle ) bike ( mp/ger/mg )"}}',
  '\t;{"hero2(ger)" ("hero" b(hero) g(h2) cost(2))}',
  '\t{"Bare_Gun" {button v2} {group b1} {cost 50} {content "mp/ger/rifle"} {tags "ger"}}',
  '\t{"bare_two" {button squad1} {group b2} {content "mp/ger/rifle"} {tags "ger"}}',
  '\t{"bare_three" {button squad1} {group b3} {content "mp/ger/rifle"} {tags "ger"}}',
  '\t{"bare_four" {button squad1} {group b4} {content "mp/ger/rifle"} {tags "ger"}}',
  '\t{"van_card" {button squad1} {group b5} {content "mp/ger/rifle"} {tags "ger"}}',
  '}']);
W('mod/localization/info.lng', ['{tags', '\t{squad', '\t\t{"inf_a(ger)" "Inf A"}', '\t\t{"hero1(ger)" "Hero 1"}', '\t\t{"hero2(ger)" "Hero 2"}',
  '\t\t{"moto_grp(ger)" "Bikes"}', '\t\t{"nobody(ger)" "Nobody"}',
  '\t\t{"bare_gun(ger)" "BG"}', '\t\t{"bare_three(ger)" "X1"}', '\t\t{"bare_three" "X2"}', '\t\t{"van_card" "Vanilla van"}', '\t\t{"van_card(ger)" "Mod van"}', '\t}', '\t{entity', '\t\t{"tank_a" "Tank A"}', '\t\t{"ghost_tank" "Ghost"}', '\t}', '}']);

let n = 0, fail = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } };
const run = args => { const r = cp.spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' }); return { rc: r.status, out: r.stdout + r.stderr }; };

// ---- lib/lnginc ----
const L = path.join(T, 'mod/localization');
t('includes: relative, rooted, nested, missing', () => {
  const errs = []; const k = lnginc.readLngKeys(path.join(L, 'desc.lng'), 'desc.lng', { textDir: L, onError: (c, m, at) => errs.push(c + ':' + path.basename(at.file) + ':' + at.line) });
  assert.equal(k.get('desc/squad/x(ger)').txt, 'X squad');                  // nested relative (parts/extra.inc -> parts/nested.inc)
  assert.equal(path.basename(k.get('desc/squad/x(ger)').file), 'nested.inc');
  assert.equal(k.get('desc/weapon/w1').txt, 'W1 two');                      // rooted /interface/text/
  assert.equal(k.get('desc/entity/tank_a').txt, 'Tank A2');                 // later duplicate wins (LOC-04), case-insensitive (LOC-03)
  assert.deepEqual(errs, ['INCLUDE_MISSING:desc.lng:24']);
});
t('include cycle reported, not thrown', () => {
  const errs = []; const k = lnginc.readLngKeys(path.join(L, 'parts/cyc.inc'), 'parts/cyc.inc', { textDir: L, onError: c => errs.push(c) });
  assert.deepEqual(errs, ['INCLUDE_CYCLE']); assert.equal(k.get('parts/cyc/c').txt, 'C');
});
t('# file: no title prefix (LOC-10); subfolder prefix', () => {
  assert.ok(lnginc.readLngKeys(path.join(L, '#dlg.lng'), '#dlg.lng').has('mp/newui'));
  assert.ok(lnginc.readLngKeys(path.join(L, 'mission/single/a/b.lng'), 'mission/single/a/b.lng').has('mission/single/a/b/name'));
  assert.equal(lnginc.keyPrefix('sub/#x.lng'), 'sub/');
});
t('no include: same as lnglint readKeys (key, txt, line)', () => {
  const k = lnginc.readLngKeys(path.join(L, '#dlg.lng'), '#dlg.lng');
  assert.deepEqual([...k].map(([lk, e]) => [lk, e.key, e.txt, e.line]), [['mp/title', 'mp/title', 'T', 2], ['mp/newui', 'mp/newui', 'N', 2]]);
});

// ---- CLI ----
const MOD = path.join(T, 'mod'), GAME = path.join(T, 'game'), C = ['--min-keys', '0', '--cache', path.join(T, 'cache'), '--no-stuff'];
t('plan counts', () => {
  const r = run(['plan', MOD, '--game', GAME, ...C, '-q']);
  assert.match(r.out, /desc\.lng: 15 keys, 1 same as vanilla, 1 changed, 13 mod-only, 1 duplicates/);
  assert.match(r.out, /#dlg\.lng: 2 keys, 1 same as vanilla, 0 changed, 1 mod-only/);
  assert.match(r.out, /desc\.lng:24: INCLUDE_MISSING/);
});
const TSV = path.join(T, 'report.tsv');
t('dead verdicts', () => {
  run(['dead', MOD, '--game', GAME, ...C, '--out', TSV, '-q']);
  const v = Object.fromEntries(fs.readFileSync(TSV, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split('\t')).map(c => [c[1], c[3]]));
  assert.deepEqual(v, { 'desc/human/mp/ger/Ghost': 'dead', 'desc/entity/Tank_A': 'kept', 'desc/squad/x(ger)': 'dead', 'desc/weapon/w1': 'unsure', 'desc/weapon/w2': 'unsure', 'mp/newui': 'unsure',
    'info/entity/ghost_tank': 'dead', 'info/entity/tank_a': 'kept', 'info/squad/hero1(ger)': 'kept', 'info/squad/hero2(ger)': 'dead',   // hero2 card commented out
    'info/squad/inf_a(ger)': 'kept', 'info/squad/moto_grp(ger)': 'kept', 'info/squad/nobody(ger)': 'dead',
    'desc/entity/bike': 'kept', 'desc/entity/ghost2': 'dead', 'desc/squad/inf_a(ger)': 'kept', 'desc/squad/hero1(ger)': 'kept', 'desc/squad/moto_grp(ger)': 'kept',
    'desc/squad/bare_two': 'kept', 'info/squad/bare_three': 'kept',
    // MISKEYED (kept): name(side) keys of bare-named cards
    'desc/squad/bare_two(ger)': 'kept', 'desc/squad/bare_four(ger)': 'kept', 'desc/squad/bare_four(eng)': 'kept',
    'info/squad/bare_gun(ger)': 'kept', 'info/squad/bare_three(ger)': 'kept', 'info/squad/van_card(ger)': 'kept' });
  assert.equal((fs.readFileSync(TSV, 'utf8').match(/	MISKEYED:/g) || []).length, 6);
});
const OUT = path.join(T, 'out'), R0 = path.join(T, 'renames0.tsv');
t('split: parts, park, changed key only in mod part', () => {
  const r = run(['split', MOD, '--game', GAME, ...C, '--out', OUT, '--renames-out', R0, '-q']);
  assert.match(r.out, /6 key\(s\) parked/); assert.match(r.out, /round trip 0 difference/);
  const rd = f => fs.readFileSync(path.join(OUT, f), 'utf8');
  assert.ok(!/MG/.test(rd('desc/vanilla/human/mp/ger.inc')) && /Rifleman/.test(rd('desc/vanilla/human/mp/ger.inc')));
  assert.match(rd('desc/mod/human/ger.inc'), /; changed from vanilla\r\n; \[changed\] first in card "inf_a\(ger\)" ger\/squad1 cost 80[^\r]*\r\n\{"mg" "MG gunner"\}\r\n; new\r\n/);
  assert.equal((rd('desc/mod/entity/ger/v2.inc').match(/\{"tank_a/gi) || []).length, 1);
  assert.match(rd('desc/mod/entity/ger/v2.inc'), /card "tank_a"[^\r]*\r\n\{"Tank_A" "Tank A2"\}/);
  assert.match(rd('desc/mod/entity/ger/squad1.inc'), /in \{content\} of card "moto_grp\(ger\)"[^\r]*\r\n\{"bike" "Bike"\}/);
  assert.match(rd('_dropped/desc.inc'), /\{"ghost2" "G2"\}/);
  assert.match(rd('desc/mod/squad/ger/squad1.inc'), /card "inf_a\(ger\)"[^\r]*\r\n\{"inf_a\(ger\)" "Inf A"\}/);
  assert.match(rd('desc/mod/hero/ger.inc'), /\{"hero1\(ger\)" "H1"\}/);
  assert.match(rd('desc/mod/vehicle_group/ger.inc'), /\{"moto_grp\(ger\)" "Bikes"\}/);
  assert.match(rd('desc/mod/weapon.inc'), /\{"w1" "W1" " two"\}/);
  assert.match(rd('_dropped/desc.inc'), /\{"Ghost" "Ghost"\}/);
  assert.match(rd('desc.lng'), /\(include "desc\/vanilla\/human\/mp\/ger.inc"\)\r\n\t+\(include "desc\/mod\/human\/ger.inc"\)/);
  assert.ok(!/"Rifleman"/.test(rd('desc.lng')));
  assert.ok(fs.existsSync(path.join(OUT, 'mission/single/a/b.lng')));
});
t('join compare: 0 with --minus, seeded diff + lost key caught', () => {
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), OUT, '--minus', TSV, '--renames', R0, '-q']).rc, 0);
  const B = path.join(T, 'out2'); fs.cpSync(OUT, B, { recursive: true });
  const f = path.join(B, 'desc/vanilla/human/mp/ger.inc'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Rifleman', 'Rifle man'));
  const g = path.join(B, 'desc/mod/weapon.inc'); fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace(/\{"w1"[^\r]*\r\n/, ''));
  const r = run(['join', '--compare', path.join(MOD, 'localization'), B, '--minus', TSV, '--renames', R0, '-q']);
  assert.equal(r.rc, 1); assert.match(r.out, /JOIN_TEXT_DIFF desc\/human\/mp\/ger\/rifle/); assert.match(r.out, /JOIN_ONLY_A desc\/weapon\/w1/); assert.match(r.out, /2 differences/);
});
t('--no-park keeps every key; --out inside the mod refused', () => {
  const r = run(['split', MOD, '--game', GAME, ...C, '--out', path.join(T, 'outnp'), '--no-park', '--no-fix-miskeyed', '-q']);
  assert.match(r.out, /0 key\(s\) parked/);
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), path.join(T, 'outnp'), '-q']).rc, 0);
  assert.equal(run(['split', MOD, '--game', GAME, ...C, '--out', path.join(MOD, 'x'), '-q']).rc, 2);
});
t('buy-list layout of info.lng mod parts', () => {
  const O = path.join(T, 'outbl'), r = run(['split', MOD, '--game', GAME, ...C, '--out', O, '--no-park', '--no-fix-miskeyed', '-q']);
  assert.match(r.out, /round trip 0 difference/);
  const rd = f => fs.readFileSync(path.join(O, 'info/mod', f), 'utf8');
  assert.match(rd('squad/ger/squad1.inc'), /^; info\.lng mod part: .*side ger, button squad1 "Infantry squads"/);
  assert.match(rd('squad/ger/squad1.inc'), /; -- group squad_1 --\r\n; \[new\] card "inf_a\(ger\)" cost 80 \| soldiers rifle x4, mg \|.*units\/units_44-45\.set:2\r\n\{"inf_a\(ger\)" "Inf A"\}/);
  assert.match(rd('hero/ger.inc'), /card "hero1\(ger\)"[^\r]*\r\n\{"hero1\(ger\)"/);
  assert.match(rd('hero/ger.inc'), /card "hero2\(ger\)"[^\r]*card commented out\r\n\{"hero2\(ger\)"/);
  assert.match(rd('vehicle_group/ger.inc'), /vehicles bike x2[^\r]*\r\n\{"moto_grp\(ger\)" "Bikes"\}/);
  assert.match(rd('entity/ger/v2.inc'), /card "tank_a"[^\r]*also under eng\/v3[^\r]*\r\n\{"tank_a" "Tank A"\}/);
  assert.match(rd('squad/unlisted.inc'), /no buy-list card names this key\r\n\{"nobody\(ger\)"/);
  assert.match(fs.readFileSync(path.join(O, 'desc/mod/entity/unlisted/misc.inc'), 'utf8'), /\{"ghost2" "G2"\}/);
  assert.match(rd('entity/unlisted.inc'), /\{"ghost_tank" "Ghost"\}/);
  assert.ok(!fs.existsSync(path.join(O, 'info/mod/squad/ger/v3.inc')));
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), O, '-q']).rc, 0);
  const N = path.join(T, 'outold'); run(['split', MOD, '--game', GAME, ...C, '--out', N, '--no-park', '--no-buylist', '--no-fix-miskeyed', '-q']);
  assert.ok(!fs.existsSync(path.join(N, 'info/mod/hero')));
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), N, '-q']).rc, 0);
});
t('mis-keyed name(side) keys renamed; join --compare --renames proves the round trip', () => {
  const O = path.join(T, 'outmk'), R = path.join(T, 'renames.tsv');
  const r = run(['split', MOD, '--game', GAME, ...C, '--out', O, '--dead-tsv', TSV, '--renames-out', R, '-q']);
  assert.match(r.out, /round trip 0 difference/);
  const rows = Object.fromEntries(fs.readFileSync(R, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split('\t')).map(c => [c[1], c[3] + ' ' + c[2]]));
  assert.deepEqual(rows, {
    'info/squad/bare_gun(ger)': 'renamed info/squad/Bare_Gun', 'info/squad/bare_three(ger)': 'not_renamed_other_text info/squad/bare_three',
    'info/squad/van_card(ger)': 'renamed_changes_vanilla info/squad/van_card', 'desc/squad/bare_two(ger)': 'dropped_identical desc/squad/bare_two',
    'desc/squad/bare_four(ger)': 'renamed desc/squad/bare_four', 'desc/squad/bare_four(eng)': 'not_renamed_side desc/squad/bare_four' });
  const rd = f => fs.readFileSync(path.join(O, f), 'utf8');
  assert.match(rd('info/mod/squad/ger/v2.inc'), /renamed from "info\/squad\/bare_gun\(ger\)"[^\r]*\r\n\{"Bare_Gun" "BG"\}/);
  assert.match(rd('info/mod/squad/ger/squad1.inc'), /MISKEYED, not renamed: bare key exists with other text[^\r]*\r\n\{"bare_three\(ger\)" "X1"\}/);
  assert.match(rd('info/mod/squad/ger/squad1.inc'), /\[changed\][^\r]*renamed from "info\/squad\/van_card\(ger\)"[^\r]*\r\n\{"van_card" "Mod van"\}/);
  assert.ok(!/bare_two\(ger\)/.test(rd('desc/mod/squad/ger/squad1.inc')));
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), O, '--minus', TSV, '--renames', R, '-q']).rc, 0);
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), O, '--minus', TSV, '-q']).rc, 1);
  const N = path.join(T, 'outnofix'); run(['split', MOD, '--game', GAME, ...C, '--out', N, '--dead-tsv', TSV, '--no-fix-miskeyed', '-q']);
  assert.equal(run(['join', '--compare', path.join(MOD, 'localization'), N, '--minus', TSV, '-q']).rc, 0);
});
// ---- mod2: stuff grouping, vanilla context, re-split of a split folder, expectedParts ----
const M2 = path.join(T, 'mod2');
W('mod2/resource/set/stuff/ammo/7_92x57.ger.ammo', ['{bullet {tag "bullet"} {inventory {weight 0.5}}}']);
W('mod2/resource/set/stuff/ammo/9x19.ger.ammo', ['{bullet {tag "bullet"}}']);
W('mod2/resource/set/stuff/rifle/kar98.ger.weapon', ['{rifle {filling "ammo 7_92x57" 5}}']);
W('mod2/resource/set/stuff/smg/mp40.ger.weapon', ['{smg {filling "ammo 9x19" 32}}']);
W('mod2/resource/set/stuff/head/helmet.ger.stuff', ['{item {inventory {weight 1.2}}}']);
W('mod2/resource/set/multiplayer/units/units_44-45.set', ['{units', '\t{"inf_a(ger)" {button squad1} {group squad_1} {cost 80} {content "mp/ger/rifle:4 mp/ger/mg"} {tags "infantry 44"}}', '}']);
W('mod2/localization/desc.lng', ['{tags', '\t{human {mp {ger {"rifle" "Rifleman"} {"mg" "MG"}}}}',
  '\t{ammo', '\t\t{"7_92x57 ger" "7.92mm"}', '\t\t{"9x19 ger" "9mm"}', '\t\t{"zz ghost" "Z"}', '\t}',
  '\t{weapon', '\t\t{"kar98 ger" "Kar98k"}', '\t\t{"mp40 ger" "MP 40"}', '\t}', '\t{stuff {"helmet ger" "Helmet"}}',
  '\t{squad', '\t\t; ToE: checked', '\t\t{"inf_a(ger)" "Inf A"}', '\t}', '}']);
const C2 = ['--min-keys', '0', '--cache', path.join(T, 'cache2'), '--stuff-min', '1'], O2 = path.join(T, 'out2a');
t('stuff grouping + vanilla context lines', () => {
  const r = run(['split', M2, '--game', GAME, ...C2, '--out', O2, '--no-park', '-q']);
  assert.match(r.out, /round trip 0 difference/);
  const rd = f => fs.readFileSync(path.join(O2, f), 'utf8');
  assert.match(rd('desc/mod/ammo/ger/ammo.inc'), /; \[new\] stuff ammo\/9x19\.ger\.ammo \| cal 9x19 \| used by mp40[^\r]*\r\n\{"9x19 ger" "9mm"\}/);
  assert.match(rd('desc/mod/weapon/ger/rifle.inc'), /stuff rifle\/kar98\.ger\.weapon[^\r]*takes 7_92x57[^\r]*\r\n\{"kar98 ger" "Kar98k"\}/);
  assert.match(rd('desc/mod/weapon/ger/smg.inc'), /takes 9x19/);
  assert.match(rd('desc/mod/stuff/head.inc'), /weight 1\.2[^\r]*\r\n\{"helmet ger" "Helmet"\}/);
  assert.match(rd('desc/mod/ammo/unlisted.inc'), /no stuff file gives this key\r\n\{"zz ghost" "Z"\}/);
  assert.match(rd('desc/vanilla/ammo.inc'), /vanilla part: do not edit\r\n; \[vanilla\] stuff ammo\/7_92x57\.ger\.ammo[^\r]*used by kar98[^\r]*\r\n\{"7_92x57 ger" "7\.92mm"\}/);
  assert.match(rd('desc/vanilla/human/mp/ger.inc'), /; \[vanilla\] first in card "inf_a\(ger\)" ger\/squad1[^\r]*\r\n\{"rifle" "Rifleman"\}/);
  assert.match(rd('desc/mod/squad/ger/squad1.inc'), /card "inf_a\(ger\)"[^\r]*\r\n; ToE: checked\r\n\{"inf_a\(ger\)" "Inf A"\}/);
});
t('expectedParts agrees with what split wrote', () => {
  const m = require('../lngsplit').expectedParts(M2, { game: GAME, cache: path.join(T, 'cache2'), minKeys: 0, stuffMin: 1 });
  const J = require('../lngsplit').joinFolder(O2);
  let n2 = 0; for (const [lk, e] of J) { if (!/\.inc$/.test(e.file)) continue; n2++; assert.equal((m.get(lk) || {}).part, e.file, lk); }
  assert.ok(n2 >= 9, 'keys checked ' + n2);
});
t('re-split of a split folder: _dropped carried + appended, ToE kept, own parts folder reused', () => {
  const M3 = path.join(T, 'mod3'); fs.cpSync(path.join(M2, 'resource'), path.join(M3, 'resource'), { recursive: true });
  const L3 = path.join(M3, 'localization'); fs.cpSync(O2, L3, { recursive: true });
  fs.mkdirSync(path.join(L3, '_dropped'), { recursive: true });
  fs.writeFileSync(path.join(L3, '_dropped/desc.inc'), '; old parked\r\n{ammo\r\n{"old_dead" "x"}\r\n}\r\n');
  fs.writeFileSync(path.join(L3, '_dropped/dead-keys.tsv'), 'file\tkey\tgroup\tverdict\treason\r\ndesc.lng\tdesc/ammo/old_dead\tdesc/ammo\tdead\told\r\n');
  fs.writeFileSync(path.join(L3, 'README.md'), 'readme\r\n');
  const sq = path.join(L3, 'desc/mod/stuff/head.inc'); fs.writeFileSync(sq, fs.readFileSync(sq, 'utf8').replace('{"helmet ger"', '; ToE: helmet note\r\n{"helmet ger"'));
  const O3 = path.join(T, 'out3'), r = run(['split', M3, '--game', GAME, ...C2, '--out', O3]);
  assert.match(r.out, /1 key\(s\) parked/); assert.match(r.out, /round trip 0 difference/); assert.match(r.out, /newly parked: desc\.lng desc\/ammo\/zz ghost/);
  const rd = f => fs.readFileSync(path.join(O3, f), 'utf8');
  assert.match(rd('_dropped/desc.inc'), /^; old parked\r\n\{ammo\r\n\{"old_dead" "x"\}\r\n\}\r\n; ---- added by lngsplit re-split: 1 newly dead[^\r]*\r\n[\s\S]*\{"zz ghost" "Z"\}/);
  assert.match(rd('_dropped/dead-keys.tsv'), /desc\/ammo\/old_dead\tdesc\/ammo\tdead\told\r\ndesc\.lng\tdesc\/ammo\/zz ghost\tdesc\/ammo\tdead\t/);
  assert.equal(rd('README.md'), 'readme\r\n');
  assert.match(rd('desc/mod/stuff/head.inc'), /weight 1\.2[^\r]*\r\n; ToE: helmet note\r\n\{"helmet ger" "Helmet"\}/);
  assert.match(rd('desc/mod/squad/ger/squad1.inc'), /\r\n; ToE: checked\r\n\{"inf_a\(ger\)"/);
  assert.equal((rd('desc/mod/squad/ger/squad1.inc').match(/inf_a\(ger\)" cost/g) || []).length, 1);   // context line regenerated, not doubled
  assert.ok(!fs.existsSync(path.join(O3, 'desc_parts')));
  assert.ok(!/old_dead/.test(rd('desc.lng')) && !fs.existsSync(path.join(O3, 'desc/mod/ammo/unlisted.inc')));
});
console.log(`${n} ok, ${fail} failed`);
if (!fail) console.log('PASS'); else process.exitCode = 1;
