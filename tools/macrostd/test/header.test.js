// macrostd step header regression: fixture game + mod in a temp dir (<ARSENAL_TMP or OS temp>/arsenal/ms-header/test). Checks: header
//   form (name/what, param key + unit, e.g. = most common call), author trailing comment moved, comment above kept, family group
//   header, existing header left, nested define left, verify SAME, re-plan 0 rows, ASCII only in written lines.
// Author: Imperator_Aug (ARSENAL, ia-91d5b2eb)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { writeZip } = require('../../lib/zipwrite');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-header/test');
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

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [['properties/vanilla.inc', L('(define "armor_light" {armor %0})')]]);

put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, 'resource/properties/hdr.inc', L(
  '(define "vol_plate"',
  '\t{Volume "%name" {thickness %mm}}',
  ')',
  '(define "dmg_215"   ;changed the scale \xe0 close range',
  '\t{damage %0}',
  ')',
  '; author words above',
  '(define "wrapped" ("vol_plate" name(x) mm(%t)))',
  '; done: already headed',
  '(define "done" {d 1})',
  '(define "outer" {o (define "inner" {i 1})})',
  '(define "lvl_1" {cp 1.0} {score 10})',
  '(define "lvl_2" {cp 2.0} {score 20})',
  '(define "lvl_3" {cp 3.0} {score 30})'));
put(mod, 'resource/entity/a/a.def', L(
  '(include "/properties/hdr.inc")',
  '{a ("vol_plate" name(front) mm(40))',
  '\t("vol_plate" name(front) mm(40)) ; plate',
  '\t("vol_plate" name(s) mm(5))',
  '\t("dmg_215" args 3) ("wrapped" t(9)) ("done") ("outer") ("inner")',
  '\t("lvl_1") ("lvl_3") ("lvl_2")}'));
fs.cpSync(mod, before, { recursive: true });

let r = run('plan', mod, ...G, '--only', 'header');
ok(r.rc === 0 && /plan header: 1 files, 5 rows/.test(r.out), 'plan: 1 file, 5 rows (4 headers + 1 group)');
r = run('apply', mod, ...G, '--only', 'header', '--undo', path.join(base, 'undo'));
ok(r.rc === 0, 'apply rc 0');
const s = get('resource/properties/hdr.inc');
const has = (t, msg) => ok(s.includes(t), msg + ': ' + JSON.stringify(t));
has('; vol_plate: {Volume "%name" {thickness}}\r\n;   name - name of {Volume}\r\n;   mm - {thickness}, mm\r\n;   e.g. ("vol_plate" name(front) mm(40))\r\n(define "vol_plate"', 'header form, unit, most common call');
has('; dmg_215: changed the scale \xe0 close range (makes {damage})\r\n;   %0 - {damage}, [?]\r\n;   e.g. ("dmg_215" args 3)\r\n(define "dmg_215"\r\n', 'trailing comment moved, bytes kept, line cleaned');
has('; author words above\r\n; wrapped: calls "vol_plate"\r\n;   t - {thickness}, mm via "vol_plate"\r\n', 'comment above kept, param followed into callee');
has('; done: already headed\r\n(define "done"', 'existing header left');
ok(s.includes('; outer:') && !s.includes('; inner:'),'nested define not headed');
has('; lvl_1 .. lvl_3 (3 defines, same shape): buy-card fields, {cp} {score}\r\n;   e.g. ("lvl_1")\r\n(define "lvl_1"', 'family group header');
ok(!/; lvl_2:/.test(s), 'no single header inside a group');
const mine = s.split('\r\n').filter(l => /^;( |   )/.test(l) && !l.includes('changed the scale'));
ok(mine.every(l => /^[\x20-\x7e]*$/.test(l)), 'written lines ASCII');
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify SAME');
r = run('plan', mod, ...G, '--only', 'header');
ok(r.rc === 0 && /plan header: 0 files, 0 rows/.test(r.out), 're-plan 0 rows');
console.log(fails ? `FAIL ${fails}` : 'header ok');
process.exit(fails ? 1 : 0);
