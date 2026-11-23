// macrostd step buylist regression: fixture game (one pak) + mod with multiplayer unit lists built in <ARSENAL_TMP or OS temp>/arsenal/ms-buylist/test
//   Fixture defects, one per line (file:line in the mod, units = resource/set/multiplayer/units):
//   units/ger/vehicles.set:2  old card, plain name, "vs" (generic_v inside)            -> ("unit_vehicle_supporters" ... breed(vehicle_supporter))
//   units/ger/vehicles.set:3  old card, "vs_ita": body differs from "vs" by one breed word -> same macro, breed(axm_ita_vehicle_supporter)
//   units/ger/vehicles.set:4  old card, name(side) "hero_a(ger)" with s(ger)             -> "%name(%side)" macro (_sided)
//   units/ger/vehicles.set:5  old card, name(side) "hero_b(eng)" but s(ger)              -> case buylist-name-side
//   units/ger/vehicles.set:6  old card, "vs_g" without v1: %v1 stays in the card (SDL-21) -> case buylist-unreplaced
//   units/ger/vehicles.set:7  old card, n2 passed twice with other values                 -> case buylist-param-twice
//   units/ger/vehicles.set:8  commented old card                                          -> untouched
//   units/ger/vehicles.set:9  stat card {"mp/ger/x" ("stat" side(ger))} (no level/cost)  -> untouched
//   units/ger/vehicles.set:10 card-macro call ("squad_with2types" ... c1() c2() f())      -> ("squad_2" ... member1() member2() fore())
//   units/ger/vehicles.set:11 card-macro call with level(1) twice, same value             -> converted (engine: last wins, same value)
//   units/ger/vehicles.set:12 old card "v" with n1/n2 crews (two breed words)             -> ("unit_tank" ... crew1() crew2())
//   units/orphan.set:1        old card in a file nothing includes                          -> converted, no include added (verify DIFF)
//   units/units_41.set        root: gets (include "_macros.inc") before the ger/vehicles.set include (SDL-17, TST-108)
// Checks: plan writes nothing, apply, exact lines, _macros.inc header + define, re-plan 0 rows, verify PASS with the orphan allowed,
//   sdlx proof refuses a hand-broken template (none here: proof is exercised by every converted card), undo restores every byte.
// Author: Imperator_Aug (ARSENAL, ia-0305ff74)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-buylist/test');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod'), before = path.join(base, 'before'), cache = path.join(base, 'cache');
process.env.MACROSTD_CACHE = cache;

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };
const L = (...lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const U = 'resource/set/multiplayer/units/';
const lines = rel => fs.readFileSync(path.join(mod, ...rel.split('/')), 'latin1').split('\r\n');
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'latin1', env: process.env }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const G = ['--game', game, '--exe', 'mowas_2'];
const hashTree = dir => { const h = new Map(); for (const f of walkFiles(dir, /./)) { const r = relPath(dir, f); if (!r.startsWith('.arsenal-undo/')) h.set(r, crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } return h; };
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// ---- fake game
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [['set/multiplayer/units/readme.set', L(';SDL', '{readme}')]]);

// ---- mod
put(mod, 'mod.info', L('{name "buylist fixture"}'));
put(mod, U + 'macros.set', L(
  ';SDL',
  '(define "generic_v"',
  '\t{charge %c}',
  '\t{score %sc}',
  '\t{tags "%t"}',
  '\t{group "%g"}',
  '\t{button "%b"}',
  '\t{cw %cw}',
  '\t{cp %cp}',
  ')',
  '(define "vs"',
  '\t("generic_v" c(%c) sc(%sc) t(%t %s) g(%g) b(%b) cw(%cw) cp(%cp))',
  '\t{content "* ( mp/%s/vehicle_supporter:%n )"}',
  ')',
  '(define "vs_ita"',
  '\t("generic_v" c(%c) sc(%sc) t(%t %s) g(%g) b(%b) cw(%cw) cp(%cp))',
  '\t{content "* ( mp/%s/axm_ita_vehicle_supporter:%n )"}',
  ')',
  '(define "v"',
  '\t("generic_v" c(%c) sc(%sc) t(%t %s) g(%g) b(%b) cw(%cw) cp(%cp))',
  '\t{content "* ( mp/%s/tankman:%n1 mp/%s/tankman2:%n2)"}',
  ')',
  '(define "vs_g"',
  '\t{charge %c}',
  '\t{content "%v1 ( mp/%s/vehicle_supporter:%n )"}',
  '\t{info %v1}',
  ')',
  '(define "i2"',
  '\t{charge %c}',
  '\t{content "mp/%s/%n1 mp/%s/%n2"}',
  ')',
  '(define "stat"',
  '\t{tags "level_0 %side soldier"}',
  ')',
  '(define "squad_with2types"',
  '\t{"%name(%side)"',
  '\t\t{charge %c}',
  '\t\t{content "mp/%side/%c1 mp/%side/%c2"}',
  '\t\t{tags "frontline_cp infantry %side %t"}',
  '\t\t{group "%g"}',
  '\t\t{button "%b"}',
  '\t\t{level %level}',
  '\t\t{cost %cost}',
  '\t\t{fore %f}',
  '\t}',
  ')'));
put(mod, U + 'units_41.set', L(
  ';SDL',
  '{units',
  '\t(include "macros.set")',
  '\t(include "/set/multiplayer/units/ger/vehicles.set")',
  '}'));
put(mod, U + 'ger/vehicles.set', L(
  ';----- b1 transport -----',
  '{"willys"      ("vs" c(30) t(all 42) s(ger) n(3) g(b1) sc(125) b(v1) cw(0) cp(0)) {level 1} {cost 125} {fore 0.0}}',
  '{"as423" ("vs_ita" c(60) t(44) s(ger) n(4)  g(b2) sc(120) b(v1) cw(0) cp(6)) {level 1} {cost  120} {fore -2.0}}\t;120',
  '{"hero_a(ger)" ("vs" c(10) t(hero) s(ger) n(2) g(h1) sc(1) b(hero) cw(0) cp(0)) {level 1} {cost 1.0} {fore 0.0}}',
  '{"hero_b(eng)" ("vs" c(10) t(hero) s(ger) n(2) g(h2) sc(1) b(hero) cw(0) cp(0)) {level 1} {cost 1.0} {fore 0.0}}',
  '{"zis5" ("vs_g" c(0) s(ger) n(2)) {level 1} {cost 50} {fore 0.0}}',
  '{"hero_c(ger)" ("i2" c(1) s(ger) n1(a:1) n2(b:1) n2(c:1)) {level 1} {cost 3.0} {fore 0.0}}',
  ';{"old" ("vs" c(30) t(42) s(ger) n(3) g(b1) sc(125) b(v1) cw(0) cp(0)) {level 1} {cost 125} {fore 0.0}}',
  '{"mp/ger/officer" ("stat" side(ger))}',
  '("squad_with2types" side(ger) name(grens) c(0) g(squad_3) c1(sl:1) c2(rifle:6) b(squad1) t(40 41) level(1) cost(161) f(1.0))',
  '("squad_with2types" side(ger) name(grens2) c1(sl:1) c2(rifle:6) c(0) g(squad_3) b(squad1) t(40) level(1) level(1) cost(100) f(1.0))',
  '{"mk7" ("v" c(10) t(40) s(ger) n1(2) n2(1) g(d1) sc(250) b(v3) cw(0) cp(5)) {level 1} {cost 250} {fore -31.0}}'));
put(mod, U + 'orphan.set', L('{"willys2" ("vs" c(30) t(all) s(ger) n(3) g(b1) sc(125) b(v1) cw(0) cp(0)) {level 1} {cost 125} {fore 0.0}}'));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

// ---- plan
const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'buylist', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing to the mod');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').filter(Boolean).slice(1).map(l => l.split('\t'));
const caseRow = id => rows.find(x => x[3] === 'CASE' && x[6].startsWith(id + ':'));
ok(caseRow('buylist-name-side') && /hero_b\(eng\)/.test(caseRow('buylist-name-side')[4] + caseRow('buylist-name-side')[6]), 'case: card name side differs from s()');
ok(caseRow('buylist-unreplaced') && /%v1/.test(caseRow('buylist-unreplaced')[4]), 'case: %v1 left unreplaced by the old call');
ok(caseRow('buylist-param-twice') && /n2 passed twice/.test(caseRow('buylist-param-twice')[4]), 'case: n2 passed twice with other values');
ok(rows.filter(x => x[3] === 'card').length === 5 && rows.filter(x => x[3] === 'card_call').length === 2, 'plan: 5 old cards + 2 card-macro calls');
console.log(r.out.split('\n').filter(l => /^case|^plan/.test(l)).join('\n'));

// ---- apply
r = run('apply', mod, ...G, '--only', 'buylist');
ok(r.rc === 0, 'apply buylist runs' + (r.rc ? ': ' + r.out : ''));
const V = lines(U + 'ger/vehicles.set');
ok(V[0] === ';----- b1 transport -----', 'section line kept');
ok(V[1] === '("unit_vehicle_supporters" side(ger) name(willys) breed(vehicle_supporter) crew(3) charge(30) tags(all 42) group(b1) button(v1) score(125) weight(0) points(0) level(1) cost(125) fore(0.0))', 'vs card -> unit_vehicle_supporters, params in order');
ok(V[2] === '("unit_vehicle_supporters" side(ger) name(as423) breed(axm_ita_vehicle_supporter) crew(4) charge(60) tags(44) group(b2) button(v1) score(120) weight(0) points(6) level(1) cost(120) fore(-2.0))\t;120', 'vs_ita merged by breed word; trailing comment kept');
ok(V[3] === '("unit_vehicle_supporters_sided" side(ger) name(hero_a) crew(2) charge(10) tags(hero) group(h1) button(hero) score(1) weight(0) points(0) level(1) cost(1.0) fore(0.0))', 'name(side) card -> _sided macro, name and side apart');
ok(/^\{"hero_b\(eng\)"/.test(V[4]) && /^\{"zis5"/.test(V[5]) && /^\{"hero_c\(ger\)"/.test(V[6]), 'case cards keep their text');
ok(V[7].startsWith(';{"old"') && V[8] === '{"mp/ger/officer" ("stat" side(ger))}', 'commented card and stat card untouched');
ok(V[9] === '("squad_2" side(ger) name(grens) member1(sl:1) member2(rifle:6) charge(0) tags(40 41) group(squad_3) button(squad1) level(1) cost(161) fore(1.0))', 'squad_with2types call -> squad_2 with whole-word params');
ok(V[10] === '("squad_2" side(ger) name(grens2) member1(sl:1) member2(rifle:6) charge(0) tags(40) group(squad_3) button(squad1) level(1) cost(100) fore(1.0))', 'level(1) twice with one value -> converted once');
ok(V[11] === '("unit_tank" side(ger) name(mk7) crew1(2) crew2(1) charge(10) tags(40) group(d1) button(v3) score(250) weight(0) points(5) level(1) cost(250) fore(-31.0))', 'v card -> unit_tank with crew1/crew2');
ok(lines(U + 'orphan.set')[0].startsWith('("unit_vehicle_supporters" side(ger) name(willys2)'), 'orphan file converted');
const R = lines(U + 'units_41.set');
ok(R[2] === '\t(include "macros.set")' && R[3] === '\t(include "_macros.inc")' && R[4] === '\t(include "/set/multiplayer/units/ger/vehicles.set")', 'root includes _macros.inc before the first changed file');
const M = fs.readFileSync(path.join(mod, ...(U + '_macros.inc').split('/')), 'latin1');
ok(/\r\n; unit_vehicle_supporters: buy card \{"%name" \.\.\.\} \(was "vs" \d, "vs_ita" 1\)\r\n;   side - [^\r\n]+\r\n;   name - /.test(M) && /;   e\.g\. \("unit_vehicle_supporters" side\(ger\)/.test(M), '_macros.inc: header comment, params, e.g. line');
ok(M.includes('(define "unit_vehicle_supporters"\r\n\t{"%name"\r\n\t\t{charge %charge}\r\n\t\t{score %score}\r\n\t\t{tags "%tags %side"}\r\n') && M.includes('\t\t{content "* ( mp/%side/%breed:%crew )"}\r\n\t\t{level %level}\r\n\t\t{cost %cost}\r\n\t\t{fore %fore}\r\n\t}\r\n)\r\n'), '_macros.inc: flattened body, tab indent, CRLF');
ok(!/\n(?!\r)|[^\r]\n/.test(M.replace(/\r\n/g, '')) && !/ \r\n/.test(M), '_macros.inc: CRLF only, no trailing spaces');
ok(!/%(c|sc|t|s|g|b|cw|cp|n|n1|n2|f)\b/.test(M.replace(/^;.*$/gm, '')), '_macros.inc: no short parameter names left');

// ---- re-plan, verify, undo
r = run('plan', mod, ...G, '--only', 'buylist');
ok(/plan buylist: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');
const allow = path.join(base, 'allow.tsv');
fs.writeFileSync(allow, 'root\treason\r\n' + U + 'orphan.set\tnothing includes it\r\n');
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 1 && /orphan\.set: DIFF/.test(r.out) && !/units_41\.set: DIFF/.test(r.out), 'verify: only the orphan differs');
r = run('verify', mod, ...G, '--before', before, '--allow', allow);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS with the orphan allowed' + (r.rc ? ': ' + r.out : ''));
r = run('undo', mod, '--step', 'buylist');
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte and deletes _macros.inc');

if (fails) { console.log(`FAIL ${fails}`); process.exit(1); }
console.log('ok   buylist all');
