// macrostd step samedef regression: fixture game + mod in <ARSENAL_TMP or OS temp>/arsenal/ms-defs/test-samedef. exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-a8f300f9)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-defs/test-samedef');
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

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['properties/tank.ext', L('(define "armor" {armor %0})')],
  ['entity/v/m/m_x_body_2.inc', L('{vanilla 1}')],     // vanilla path: the name must not be taken
]);

const body = ['; tank', '(include "/properties/tank.ext")', '{game_entity', '\t{Extension "brandt.mdl"}', '\t(include "parts.inc")', '\t{Volume "body"', '\t\t("armor" args 4)', '\t}'];
for (let i = 0; i < 16; i++) body.push(`\t{bone "b${i}" {x ${i}}}`);
body.push('}');
const big = L(...body);
put(mod, 'resource/entity/v/m/parts.inc', L('{parts 1}'));
for (const n of ['m_x_fin', 'm_x_fr', 'm_x_usa']) put(mod, `resource/entity/v/m/${n}.def`, big);
put(mod, 'resource/entity/v/other/m_pol_x.def', big);                                // same bytes, other folder: cross case
put(mod, 'resource/entity/v/other/parts.inc', L('{parts 2}'));
put(mod, 'resource/entity/v/small/a.def', L('{game_entity', '\t{Extension "a.mdl"}', '}'));   // no gain
put(mod, 'resource/entity/v/small/b.def', L('{game_entity', '\t{Extension "a.mdl"}', '}'));
const cyr = L('{game_entity', '\t{Extension "\u00e0.mdl"}', '\t{x 1}', '\t{y 2}', '\t{z 3}', '}');
put(mod, 'resource/entity/v/cyr/c1.def', cyr); put(mod, 'resource/entity/v/cyr/c2.def', cyr);
const unb = L('{game_entity', '\t{x 1}', '\t{y 2}', '\t{z 3', '}');
put(mod, 'resource/entity/v/unb/u1.def', unb); put(mod, 'resource/entity/v/unb/u2.def', unb);
put(mod, 'resource/entity/v/m/m_x_body.inc', L('{unused 1}'));                     // existing name: next one is _body_2
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'samedef', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
ok(rows.some(x => x[3] === 'CASE' && /4 identical defs \(25 lines\) in 2 folders/.test(x[4])), 'cross-folder group > 20 lines is a case');
ok(rows.some(x => x[3] === 'CASE' && /cyr/.test(x[4]) && /cp1251/.test(x[4])), 'cp1251 byte outside comments: skipped, case');
ok(rows.some(x => x[3] === 'CASE' && /unb/.test(x[4]) && /imbalance/.test(x[4])), '{ } imbalance: skipped, case');
ok(/skipped \{[^}]*"no_gain":1/.test(r.out), 'tiny group: no gain, skipped');

r = run('apply', mod, ...G, '--only', 'samedef');
ok(r.rc === 0, 'apply rc 0');
const inc = 'resource/entity/v/m/m_x_body_3.inc';
ok(has(inc) && get('resource/entity/v/m/m_x_body.inc') === '{unused 1}\r\n', 'body file named <common>_body_3.inc (mod has m_x_body.inc, vanilla m_x_body_2.inc)');
const want = ['; same as the other 2 defs here; body in m_x_body_3.inc', '; tank', '(include "/properties/tank.ext")', '{game_entity', '\t(include "m_x_body_3.inc")', '}', ''].join('\r\n');
ok(['m_x_fin', 'm_x_fr', 'm_x_usa'].every(n => get(`resource/entity/v/m/${n}.def`) === want), 'each def: comment, own top lines, root block with the include');
ok(get(inc).startsWith('{Extension "brandt.mdl"}\r\n(include "parts.inc")\r\n{Volume "body"\r\n\t("armor" args 4)\r\n}\r\n'), 'body: inner lines one tab less, CRLF');
ok(get('resource/entity/v/other/m_pol_x.def') === big.toString('latin1') && get('resource/entity/v/small/a.def').length === 39, 'other folder and tiny group untouched');
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS (expansion identical)');
r = run('plan', mod, ...G, '--only', 'samedef');
ok(/plan samedef: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');
r = run('undo', mod, '--step', 'samedef');
ok(sameTree(h0, hashTree(mod)), 'undo restores every byte');

console.log(fails ? `FAIL ${fails}` : 'ok samedef');
process.exitCode = fails ? 1 : 0;
