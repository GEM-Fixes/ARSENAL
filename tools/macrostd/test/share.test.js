// macrostd step share regression: fixture game + mod in <ARSENAL_TMP or OS temp>/arsenal/ms-share/test-share. exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-4d769583)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-share/test-share');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod'), before = path.join(base, 'before');
process.env.MACROSTD_CACHE = path.join(base, 'cache');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };
const L = (...lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const get = rel => fs.readFileSync(path.join(mod, ...rel.split('/'))).toString('latin1');
const has = rel => fs.existsSync(path.join(mod, ...rel.split('/')));
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'latin1', env: process.env }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const G = ['--game', game, '--exe', 'mowas_2'];
const hashTree = dir => { const h = new Map(); for (const f of walkFiles(dir, /./)) { const r = relPath(dir, f); if (!r.startsWith('.arsenal-undo/')) h.set(r, crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } return h; };
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// ---- game: tank_crew.ext defines crew_human, a live vanilla .def calls it; glass_volume in vanilla volumes
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['properties/tank_crew.ext', L('(define "crew_human" {placer {place "%place"}})')],
  ['properties/glass.ext', L('(define "glass_volume" {glass 99})')],
  ['entity/v/live/live.def', L('(include "/properties/tank_crew.ext")', '{e ("crew_human" place(p0))}')],
  ['set/breed/mp/ger/veterancy_generic.inc', L('(define "veterancy_1" {lvl 0})')],
]);

// ---- mod
put(mod, 'resource/properties/tank_crew.ext', L('(define "crew_human" {placer {place "%place"} {group "crew"}})'));   // overwrite, vanilla live.def calls it: keeps the name
const A = ['(define "crew_human"', '\t{placer {place "%place"} {visor "%visor"}}', ')'];
const B = ['(define "crew_human"', '\t{placer {place "%place"} {visor "%visor"}}', '\t{boarder {door "%door1"} {door "%door2"}}', ')'];
put(mod, 'resource/entity/v/a/a.def', L('(include "/properties/tank_crew.ext")', ...A, '{e ("crew_human" place(p1) visor(v1))}'));
put(mod, 'resource/entity/v/b/b.def', L('(include "/properties/tank_crew.ext")', '', '\t; a header', ...A, '{e ("crew_human" place(p2) visor(v2)) ("crew_human" place(p3) visor(v3))}'));
put(mod, 'resource/entity/v/c/c.def', L(...B, '{e ("crew_human" place(p4) visor(v4) door1(d1) door2(d2))}'));
put(mod, 'resource/entity/v/d/d.def', L(...B, '{e ("crew_human" place(p5) visor(v5) door1(d3) door2(d4))}'));
put(mod, 'resource/entity/v/k/k.def', L('(include "/properties/tank_crew.ext")', '{e ("crew_human" place(p6))}'));
// volume: same body in 2 files -> volumes.inc; glass_volume same body in 2 files -> volumes.inc too; t.def uses the vanilla
// glass_volume and defines volume after it: including volumes.inc there would bring another glass_volume -> proof leaves glass_volume
const V = '(define "volume" {Volume %0 {thickness 20}})', GV = '(define "glass_volume" {glass 1})';
put(mod, 'resource/entity/f/p/p.def', L(V, GV, '{e ("volume" args "a") ("glass_volume")}'));
put(mod, 'resource/entity/f/q/q.def', L(V, GV, '{e ("volume" args "b") ("glass_volume")}'));
put(mod, 'resource/entity/f/t/t.def', L('(include "/properties/glass.ext")', V, '{e ("volume" args "c") ("glass_volume")}'));
// breeds: every side the same body -> robz_vet.inc
for (const side of ['ger', 'rus']) {
  put(mod, `resource/set/breed/mp/${side}/veterancy_generic.inc`, L('(define "veterancy_1" {lvl 24} {lvl 60})', '(define "veterancy_x" {x 1})'));
  put(mod, `resource/set/breed/mp/${side}/soldier`, L('(include "veterancy_generic.inc")', '{breed ("veterancy_1") ("veterancy_x")}'));
}
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'share', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
ok(rows.some(x => x[3] === 'CASE' && /glass_volume/.test(x[4]) && /share-proof/.test(x[6])), 'shared file would redefine glass_volume in t.def: proof leaves glass_volume (case)');

r = run('apply', mod, ...G, '--only', 'share');
ok(r.rc === 0, 'apply rc 0');
ok(/\(define "crew_human"/.test(get('resource/properties/tank_crew.ext')), 'overwritten tank_crew.ext keeps crew_human (live vanilla call)');
const crew = has('resource/properties/robz/crew.inc') ? get('resource/properties/robz/crew.inc') : '';
ok(/^; robz shared macros/.test(crew) && /; defines: crew_human_visor, crew_human_visor_boarder/.test(crew), 'crew.inc starts with the list of its defines');
ok(/; crew_human_visor: .*\r\n;   place - .*\r\n;   visor - .*\r\n;   e\.g\. \("crew_human_visor" place\(p1\) visor\(v1\)\)\r\n\(define "crew_human_visor"\r\n\t\{placer/.test(crew), 'shared define has header + e.g. + tab indent');
ok(get('resource/entity/v/a/a.def') === ['(include "/properties/tank_crew.ext")', '(include "/properties/robz/crew.inc")', '{e ("crew_human_visor" place(p1) visor(v1))}', ''].join('\r\n'), 'a.def: define replaced by the include, call renamed');
ok(!/a header/.test(get('resource/entity/v/b/b.def')) && /\("crew_human_visor" place\(p3\)/.test(get('resource/entity/v/b/b.def')), 'b.def: header goes with the define, both calls renamed');
ok(/\(include "\/properties\/robz\/crew.inc"\)\r\n\{e \("crew_human_visor_boarder" place\(p4\)/.test(get('resource/entity/v/c/c.def')), 'c.def: third body -> crew_human_visor_boarder (words it adds), shared');
ok(/\("crew_human" place\(p6\)\)/.test(get('resource/entity/v/k/k.def')), 'k.def call of the kept body untouched');
ok(/\(define "volume"/.test(get('resource/properties/robz/volumes.inc')) && !/glass_volume/.test(get('resource/properties/robz/volumes.inc')), 'volumes.inc has volume, not glass_volume');
ok(/^\(include "\/properties\/robz\/volumes.inc"\)\r\n\(define "glass_volume"/.test(get('resource/entity/f/p/p.def')), 'p.def: volume via include, glass_volume stays');
ok(/\(define "veterancy_1"/.test(has('resource/set/breed/mp/robz_vet.inc') ? get('resource/set/breed/mp/robz_vet.inc') : '') && /^\(include "\/set\/breed\/mp\/robz_vet.inc"\)\r\n/.test(get('resource/set/breed/mp/ger/veterancy_generic.inc')), 'breeds: identical on every side -> robz_vet.inc');

r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS');
if (r.rc) console.log(r.out);
r = run('plan', mod, ...G, '--only', 'share');
ok(/plan share: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');
const ud = fs.readdirSync(mod + '.arsenal-undo')[0];   // restore points beside the mod
r = run('undo', mod, '--step', 'share', '--undo', path.join(mod + '.arsenal-undo', ud));
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte, created files gone');

console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exit(fails ? 1 : 0);
