// macrostd step volumes regression (runs samedef,volumes in one go so a new _body.inc gets the macros too): fixture game + mod in
//   <ARSENAL_TMP or OS temp>/arsenal/ms-defs/test-volumes. exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-eaddf9f7)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-defs/test-volumes');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod'), before = path.join(base, 'before');
process.env.MACROSTD_CACHE = path.join(base, 'cache');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };
const L = (...lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const get = rel => fs.readFileSync(path.join(mod, ...rel.split('/'))).toString('latin1');
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'latin1', env: process.env }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const G = ['--game', game, '--exe', 'mowas_2'];
const hashTree = dir => { const h = new Map(); for (const f of walkFiles(dir, /./)) { const r = relPath(dir, f); if (!r.startsWith('.arsenal-undo/')) h.set(r, crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } return h; };
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [['properties/tank.ext', L('(define "armor" {armor %0})')]]);

// 52 defs with the common plate shape (spread over lines, thickness varies), 52 with a lowercase body part shape
for (let i = 0; i < 52; i++) put(mod, `resource/entity/t/t${i}/t${i}.def`, L('; t' + i, '{game_entity', '\t{Extension "t.mdl"}',
  '\t{Volume "hull ' + i + '"', '\t\t{thickness ' + (10 + i) + '}', '\t\t{able {touch} {bullet} {blast}}', '\t}',
  '\t{volume "part"' + ' {tags "body"} {component "body"}}', '}'));
// a pair of identical defs (samedef makes a _body.inc that then gets the volume calls)
const pair = L('{game_entity', '\t{Volume "a" {thickness 5} {able {touch} {bullet} {blast}}}', '\t{Volume "b" {thickness 6.5} {able {touch} {bullet} {blast}}}',
  '\t{Volume "c" ; keep me', '\t\t{thickness 7} {able {touch} {bullet} {blast}}}', '\t{Volume "rare" {thickness 3}}', '\t{volume 470}', '}');
put(mod, 'resource/entity/p/p_one.def', pair); put(mod, 'resource/entity/p/p_two.def', pair);
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

let r = run('plan', mod, ...G, '--only', 'samedef,volumes');
ok(r.rc === 0 && /plan volumes: 54 files/.test(r.out) && sameTree(h0, hashTree(mod)), 'plan samedef,volumes: 54 files (52 defs, the new _body.inc, volumes.inc), writes nothing');
r = run('apply', mod, ...G, '--only', 'samedef,volumes');
ok(r.rc === 0, 'apply samedef,volumes rc 0');
const vi = 'resource/properties/robz/volumes.inc';
const inc = fs.existsSync(path.join(mod, vi)) ? get(vi) : '';
ok(inc.includes('; vol_plate_hit: armor plate that takes touch, bullet and blast hits\r\n;   name - volume name in the model (text, without quotes)\r\n;   mm - armor thickness, mm\r\n;   e.g. ("vol_plate_hit" name(body) mm(10))\r\n(define "vol_plate_hit"\r\n\t{Volume "%name" {thickness %mm} {able {touch} {bullet} {blast}}}\r\n)\r\n'), 'volumes.inc: vol_plate_hit with header comment');
ok(inc.includes('(define "vol_body_part_lower"\r\n\t{volume "%name" {tags "body"} {component "body"}}\r\n)') && !/;   mm -[^\r]*\r\n;   e.g. \("vol_body_part_lower"/.test(inc), 'volumes.inc: vol_body_part_lower (key case kept, no mm)');
ok(!/\{Volume "%name" \{thickness %mm\}\}/.test(inc), 'rare shape: no macro');
const t3 = get('resource/entity/t/t3/t3.def');
ok(t3 === ['; t3', '(include "/properties/robz/volumes.inc")', '{game_entity', '\t{Extension "t.mdl"}', '\t("vol_plate_hit" name(hull 3) mm(13))', '\t("vol_body_part_lower" name(part))', '}', ''].join('\r\n'), 'def: include after the leading comment, multi-line block -> one call');
const body = get('resource/entity/p/p_body.inc');
ok(body.startsWith('(include "/properties/robz/volumes.inc")\r\n("vol_plate_hit" name(a) mm(5))\r\n("vol_plate_hit" name(b) mm(6.5))\r\n{Volume "c" ; keep me\r\n'), 'samedef body .inc gets the include and the calls; block with a comment stays');
ok(body.includes('{Volume "rare" {thickness 3}}\r\n{volume 470}\r\n') && !get('resource/entity/p/p_one.def').includes('volumes.inc'), 'rare shape and {volume 470} literal; the def itself has no include');
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS (expansion identical)');
r = run('plan', mod, ...G, '--only', 'samedef,volumes');
ok(/plan samedef: 0 files, 0 rows/.test(r.out) && /plan volumes: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');
run('undo', mod, '--step', 'volumes'); run('undo', mod, '--step', 'samedef');
ok(sameTree(h0, hashTree(mod)), 'undo restores every byte (created files deleted)');

console.log(fails ? `FAIL ${fails}` : 'ok volumes');
process.exitCode = fails ? 1 : 0;
