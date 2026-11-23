// macrostd step params regression: fixture game + mod in <ARSENAL_TMP or OS temp>/arsenal/ms-share/test-params. exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-27cdfac4)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-share/test-params');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod'), before = path.join(base, 'before'), mod2 = path.join(base, 'mod2');
process.env.MACROSTD_CACHE = path.join(base, 'cache');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };
const L = (...lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const get = rel => fs.readFileSync(path.join(mod, ...rel.split('/'))).toString('latin1');
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'latin1', env: Object.assign({}, process.env, { MACROSTD_PARAMS_UNITS: '1' }) }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const G = ['--game', game, '--exe', 'mowas_2'];
const hashTree = dir => { const h = new Map(); for (const f of walkFiles(dir, /./)) { const r = relPath(dir, f); if (!r.startsWith('.arsenal-undo/')) h.set(r, crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } return h; };
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['properties/vanilla.ext', L('(define "armor_v" {a %t} {b %tt})')],
  ['entity/v/live/live.def', L('(include "/properties/vanilla.ext")', '{e ("armor_v" t(1) tt(2))}')],   // live vanilla caller
]);

put(mod, 'resource/properties/m.inc', L(
  '(define "armor_x"',
  '\t{armor {setting "track" {thickness %t}} {setting "turret" {thickness %tur}}}',
  ')',
  '(define "paste" {x %c} {y %cw})',
  '(define "lit" {x %s} {y %sc})',
  '(define "armor_v" {a %t} {b %tt})',
  '(define "wrap" ("armor_x" t(%t) tur(%tur)))'));
put(mod, 'resource/entity/v/a/a.def', L('(include "/properties/m.inc")', '{e ("armor_x" t(5) tur(7)) ("paste" c(1) cw(2)) ("paste" c(3))', '\t("lit" s(1) sc(2)) ("lit" sc(4)) ("armor_v" t(1) tt(2)) ("wrap" t(8) tur(9))}'));
put(mod, 'resource/set/multiplayer/units/u.set', L(
  '(define "v" {"%c %sc %cw %cp %t %s %g %b %n1 %n2"})',
  '{units', '\t("v" c(1) sc(2) cw(3) cp(4) t(5) s(ger) g(d1) b(v3) n1(2) n2(1))', '}'));
fs.cpSync(mod, before, { recursive: true });
fs.cpSync(mod, mod2, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'params', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const cas = rows.filter(x => x[3] === 'CASE');
ok(cas.some(x => /"paste".*c, cw kept/.test(x[4]) && /params-paste/.test(x[6])), 'call passing c without cw (sdlx pastes): kept, case');
ok(cas.some(x => /"lit".*s kept/.test(x[4]) && /params-unpassed/.test(x[6])), 'call not passing s (%s stays literally): kept, case');
ok(cas.some(x => /"armor_v"/.test(x[4]) && /live vanilla/.test(x[6])), 'name a live vanilla file calls: kept, case');

r = run('apply', mod, ...G, '--only', 'params');
ok(r.rc === 0, 'apply rc 0');
const m = get('resource/properties/m.inc'), a = get('resource/entity/v/a/a.def'), u = get('resource/set/multiplayer/units/u.set');
ok(/\{thickness %track_mm\}\} \{setting "turret" \{thickness %tur\}/.test(m), 'only the short name of a clash: {thickness %t} in setting "track" -> track_mm, tur kept');
ok(/\("armor_x" track_mm\(5\) tur\(7\)\)/.test(a), 'call site renamed');
ok(/\("wrap" track_mm\(8\) tur\(9\)\)/.test(a) && /\("armor_x" track_mm\(%track_mm\) tur\(%tur\)\)/.test(m), 'call inside a macro body renamed; wrap takes the word of the parameter it feeds (second pass)');
ok(/\{x %c\} \{y %cw\}/.test(m) && /\{x %s\} \{y %sc\}/.test(m), 'paste / unpassed defines unchanged');
ok(/"%charge %score %weight %points %tags %side %group %button %crew1 %crew2"/.test(u) && /\("v" charge\(1\) score\(2\) weight\(3\) points\(4\) tags\(5\) side\(ger\) group\(d1\) button\(v3\) crew1\(2\) crew2\(1\)\)/.test(u), 'buy-list map applied to define + call');
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS');
if (r.rc) console.log(r.out);
r = run('plan', mod, ...G, '--only', 'params');
ok(/plan params: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');

r = cp.spawnSync(process.execPath, [TOOL, 'plan', mod2, ...G, '--only', 'params'], { encoding: 'latin1', env: process.env });
ok(/params-buylist/.test(r.stdout) && /plan params: 2 files/.test(r.stdout), 'default: buy-list macros left to buylist (case), other files still done');
// step buylist done (units/_macros.inc has unit_* macros): buy-list macros are left to it
put(mod2, 'resource/set/multiplayer/units/_macros.inc', L('(define "unit_tank" {"%name"})'));
put(mod2, 'resource/set/multiplayer/units/u.set', L('(include "_macros.inc")', '(define "v" {"%c %cw"})', '{units', '\t("v" c(1) cw(3))', '\t("unit_tank" name(x))', '}'));
r = run('plan', mod2, ...G, '--only', 'params', '--tsv', tsv);
const rows2 = fs.readFileSync(tsv, 'latin1');
ok(!/u\.set\t\d+\tparam_/.test(rows2) && /params-buylist/.test(rows2), 'after buylist: buy-list macros left to buylist (case)');

console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exit(fails ? 1 : 0);
