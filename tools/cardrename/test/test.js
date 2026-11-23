// cardrename regression: fixture game + mod in test/tmp (CRLF, one cp1251 comment byte), through the CLI.
// Cases (truth.md): plain rename, hero prefix, side token moved, macro name arg, model-named hero card left, collision, reference in
// another file, {info} redirect, commented-out card, key in a vanilla part, new key exists with other text, game file reference.
// Author: Imperator_Aug (ARSENAL, ia-3aaa1b75)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const T = path.join(__dirname, 'tmp'), TOOL = path.join(__dirname, '..', 'cardrename.js');
fs.rmSync(T, { recursive: true, force: true });
const W = (rel, lines, enc) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(lines.join('\r\n') + '\r\n', enc || 'latin1')); };

// game
W('game/resource/entity/-vehicle/tank_medium/pz3_m/pz3_m.def', ['{game_entity}']);
W('game/localization/desc.lng', ['{tags', '\t{entity {"pz3_m" "Panzer III M"}}', '\t{squad {"grenadiers_ger" "G"}}', '}']);
W('game/localization/info.lng', ['{tags', '\t{squad {"van_card" "V"}}', '}']);
W('game/resource/set/multiplayer/bot/vanilla_list.set', ['{"van_ref_jap" 1}']);
W('game/resource/interface/scene/unit_icon/hero1_jap.tga', ['ICON']);
W('mod/resource/map/multi/m1/0.mi', ['{"menu_x" {image hero1_jap}}']);
// mod units
W('mod/resource/set/multiplayer/games/frontline.set', ['{buttons "squad1 v1 hero"}']);
W('mod/resource/set/multiplayer/units/jap/hero.set', [
  '; \xe0 cp1251 comment',
  '(define "squad1t"',
  '\t{"%name(%side)" {content "mp/%side/%c1"} {tags "infantry %side"} {group "%g"} {button "%b"}}',
  ')',
  '{units',
  '\t{"hero1_jap" {content "mp/jap/rifle:4"} {tags "jap"} {group "h1"} {button "hero"}}',
  '\t{"hero_jap_chi_to" {content "chi_to mp/jap/rifle:2"} {tags "jap"} {group "h1"} {button "hero"}}',
  '\t("squad1t" name(banzai) side(jap) c1(rifle:3) g(h2) b(hero))',
  '\t{"pz3_m" {tags "jap"} {button "hero"}}',
  '\t;{"hero2_jap" ("i1" c(30) t(hero) s(jap) n1(rifle:2) g(h1) b(hero)) {cost 1.0}}',
  '\t{"van_ref_jap" {content "mp/jap/rifle:2"} {tags "jap"} {button "squad1"}}',
  '}']);
W('mod/resource/set/multiplayer/units/ger/squads.set', [
  '{units',
  '\t{"Grenadiers_ger" {content "mp/ger/rifle:4"} {tags "ger infantry"} {button "squad1"}}',
  '\t{"pio_ger" {content "mp/ger/rifle:2"} {tags "ger"} {button "squad1"}}',
  '\t{"pio" {content "mp/ger/rifle:3"} {tags "ger"} {button "squad1"}}',
  '\t{"storm_ger" {content "mp/ger/rifle:5"} {tags "ger"} {button "squad1"}}',
  '\t{"assault_ger" {content "mp/ger/rifle:6"} {tags "ger"} {button "squad1"}}',
  '\t{"mg(ger)" {content "mp/ger/rifle:1"} {tags "ger"} {button "squad1"}}',
  '\t{"recon(ger)" {content "mp/ger/rifle:1"} {tags "ger"} {button "squad1"} {info grenadiers_ger}}',
  '}']);
W('mod/resource/set/multiplayer/units/axis_minor/vehicles.set', ['{units', '\t{"Bersaglieri_Motorcycle" {content "bike mp/axis_minor/rifle:2"} {tags "axis_minor"} {button "v1"}}', '}']);
W('mod/resource/set/multiplayer/bot/list.set', ['{"Grenadiers_ger" 2} ; Grenadiers_ger in a comment', '{"mg(ger)" 1}']);
// mod localization (split layout)
W('mod/localization/desc.lng', ['{tags', '\t{entity {"pz3_m" "Panzer III M"}}', '\t{squad', '\t\t(include "desc/vanilla/squad.inc")', '\t\t(include "desc/mod/squad.inc")', '\t}', '}'], 'utf8');
W('mod/localization/desc/vanilla/squad.inc', ['{"storm_ger" "Storm"}'], 'utf8');
W('mod/localization/desc/mod/squad.inc', ['; mod squads', '{"hero1_jap" "Hero one"}', '{"hero_jap_chi_to" "Chi-To \u0430"}', '{"banzai(jap)" "Banzai"}',
  '{"hero2_jap" "Hero two"}', '{"grenadiers_ger" "Grenadiers"}', '{"pio_ger" "Pio"}', '{"pio(ger)" "Pio2"}', '{"assault_ger" "Assault"}', '{"assault(ger)" "Other"}',
  '{"mg(ger)" "MG"}', '{"recon(ger)" "Recon"}', '{"van_ref_jap" "Van"}', '{"bersaglieri_motorcycle" "Bersaglieri"}'], 'utf8');
W('mod/localization/info.lng', ['{tags', '\t{squad', '\t\t(include "info/mod/squad.inc")', '\t}', '}'], 'utf8');
W('mod/localization/info/mod/squad.inc', ['{"hero1_jap" "Info hero one"}', '{"grenadiers_ger" "Info gren"}'], 'utf8');

const MOD = path.join(T, 'mod'), GAME = path.join(T, 'game'), OUT = path.join(T, 'out');
const run = args => { const r = cp.spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' }); return { rc: r.status, out: r.stdout + r.stderr }; };
const snap = () => { const m = new Map(); const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else m.set(p, fs.readFileSync(p).toString('base64')); } }; walk(MOD); return JSON.stringify([...m]); };
const before = snap();
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('ok  ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]); } };

// truth.md: "old -> new status"
const truth = fs.readFileSync(path.join(__dirname, 'truth.md'), 'utf8').split(/\r?\n/).filter(l => /^\S.* -> /.test(l) && !l.startsWith('#'));
let p, rows;
t('plan runs', () => { p = run(['plan', MOD, '--game', GAME, '--map', path.join(T, 'map.tsv'), '-q']); assert.equal(p.rc, 0, p.out); });
t('map rows match truth.md', () => {
  rows = new Map(fs.readFileSync(path.join(T, 'map.tsv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(L => L.split('\t')).map(c => [c[0], c]));
  for (const L of truth) { const m = /^(\S+) -> (\S*) (\S+)(?: \| (.*))?$/.exec(L); assert(m, 'bad truth line ' + L); const c = rows.get(m[1]); assert(c, 'no row ' + m[1]);
    assert.equal(c[7], m[3], `${m[1]} status ${c[7]} (${c[8]})`); if (m[3] === 'ok') assert.equal(c[1], m[2], m[1]); if (m[4]) assert(c[8].includes(m[4]), `${m[1]} reason "${c[8]}" lacks "${m[4]}"`); }
  assert.equal(rows.size, truth.length, 'row count ' + [...rows.keys()].join(','));
});
t('plan writes nothing but the map', () => assert(!fs.existsSync(OUT)));
t('apply writes the changed files', () => { const r = run(['apply', MOD, '--game', GAME, '--out', OUT, '-q']); assert.equal(r.rc, 0, r.out); });
const rd = rel => fs.readFileSync(path.join(OUT, rel)).toString('latin1');
t('units edits, bytes kept', () => {
  const s = rd('resource/set/multiplayer/units/jap/hero.set'), o = fs.readFileSync(path.join(MOD, 'resource/set/multiplayer/units/jap/hero.set')).toString('latin1');
  for (const x of ['{"hero1(jap)"', '{"hero_chi_to(jap)"', 'name(hero_banzai) side(jap)', ';{"hero2(jap)"', '{"pz3_m"', '{"van_ref_jap"', '\xe0 cp1251', '}\r\n']) assert(s.includes(x), x);
  assert.equal(s.replace('hero1(jap)', 'hero1_jap').replace('hero_chi_to(jap)', 'hero_jap_chi_to').replace('name(hero_banzai)', 'name(banzai)').replace('hero2(jap)', 'hero2_jap'), o);
  const g = rd('resource/set/multiplayer/units/ger/squads.set');
  for (const x of ['{"grenadiers(ger)"', '{info "grenadiers(ger)"}', '{"pio_ger"', '{"pio"', '{"storm(ger)"', '{"assault_ger"']) assert(g.includes(x), x);
  assert(rd('resource/set/multiplayer/units/axis_minor/vehicles.set').includes('{"bersaglieri_motorcycle(axis_minor)"'));
});
t('button picture copied, map {image} left', () => {
  assert.equal(fs.readFileSync(path.join(OUT, 'resource/interface/scene/unit_icon/hero1(jap).tga'), 'latin1'), 'ICON\r\n');
  assert(!fs.existsSync(path.join(OUT, 'resource/map/multi/m1/0.mi')));
});
t('reference in another file renamed, comment left', () => assert.equal(rd('resource/set/multiplayer/bot/list.set'), '{"grenadiers(ger)" 2} ; Grenadiers_ger in a comment\r\n{"mg(ger)" 1}\r\n'));
t('keys renamed in place, vanilla key added to the mod part', () => {
  const d = fs.readFileSync(path.join(OUT, 'localization/desc/mod/squad.inc'), 'utf8');
  for (const x of ['{"hero1(jap)" "Hero one"}', '{"hero_chi_to(jap)" "Chi-To \u0430"}', '{"hero_banzai(jap)" "Banzai"}', '{"hero2(jap)" "Hero two"}', '{"grenadiers(ger)" "Grenadiers"}',
    '{"assault_ger" "Assault"}', '{"pio_ger" "Pio"}', '{"grenadiers_ger" "Grenadiers"}\r\n{"grenadiers(ger)" "Grenadiers"}\r\n', '{"bersaglieri_motorcycle(axis_minor)" "Bersaglieri"}', '{"storm(ger)" "Storm"}\r\n']) assert(d.includes(x), x);
  assert(!fs.existsSync(path.join(OUT, 'localization/desc/vanilla/squad.inc')), 'vanilla part written');
  const i = fs.readFileSync(path.join(OUT, 'localization/info/mod/squad.inc'), 'utf8');
  assert.equal(i, '{"hero1(jap)" "Info hero one"}\r\n{"grenadiers(ger)" "Info gren"}\r\n');
});
t('verify on an overlay passes', () => { const r = run(['verify', MOD, '--game', GAME, '--out', OUT, '--overlay', path.join(T, 'overlay')]); assert.equal(r.rc, 0, r.out); assert(/verify: PASS/.test(r.out), r.out); });
t('--out inside the mod refused', () => assert.equal(run(['apply', MOD, '--game', GAME, '--out', path.join(MOD, 'x')]).rc, 2));
t('mod folder untouched', () => assert.equal(snap(), before));
console.log(fails ? `FAIL ${fails}` : 'PASS');
