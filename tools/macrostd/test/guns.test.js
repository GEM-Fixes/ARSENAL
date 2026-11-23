// macrostd step guns regression: fixture game + mod in a temp dir (<ARSENAL_TMP or OS temp>/arsenal/ms-guns/test). Checks: damage_215 /
//   damage_heat / speed_lowarc parameter renames (define + calls), speed blocked where a live vanilla file calls it (PORT-55/61) and
//   renamed where none does, SDL-56 prefix case, body-shape guard, accuracy table, author design tables (cp1251 byte kept), headers,
//   cumulative table case, verify SAME, re-plan 0 rows, undo restores every byte. Exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-3ce73161)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-guns/test');
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

// ---- game: gun/.presets with speed + a live vanilla gun calling it; rifle/.presets (no live vanilla rifle file)
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['set/stuff/gun/.presets', L('(define "speed"', '\t{speed (* 1.0 %s)}', ')')],
  ['set/stuff/gun/37mm_vanilla', L('{from "gun"', '\t("speed" s(700))', '}')],
  ['set/stuff/rifle/.presets', L('(define "speed"', '\t{speed (* 1.0 %s)}', ')')],
  ['set/stuff/shell/.presets', L('(define "fg" {damage %0})')],
]);

// ---- mod
put(mod, 'mod.info', L('{name "guns fixture"}'));
put(mod, 'resource/set/stuff/gun/.presets', L(
  '{curve "gun_std"}',
  '',
  '(define "speed"',
  '\t{speed (* 1.0 %s)}',
  ')',
  '(define "speed_lowarc"',
  '\t{speed (* 0.33 %s)}',
  ')',
  '(define "damage_215"            ;changed the scale',
  '\t{projectileDamageTable {20 %a} {100 %b} {170 %c} {215 %d} {%range (+ (* (/ (- 250 %range) (- 250 215)) (- %d %e)) %e)} {(+ %range 5) 0} }',
  ')',
  '(define "damage_100"',
  '\t{projectileDamageTable {20 %a} {100 %b} {%range (+ (* (/ (- 170 %range) (- 170 100)) (- %b %c)) %c)} {(+ %range 5) 0} }',
  ')',
  '(define "damage_heat"',
  '\t{projectileDamageTable {0 %a} {%range %a} {(+ %range 5) 0}}',
  ')',
  '(define "damage_170"',
  '\t{projectileDamageTable {20 %a} {100 %b} {170 %c} {999 %d}}',   // not the expected shape: case
  ')',
  '',
  '(define "accuracy_curve_gun"',
  '\t{spreading',
  '\t\t{radiusTable {0 0} {50 (* 0.50 %r1)} {(+ %max_dist_ap 3) (* %ap_acc %r1)} {(+ %max_dist_ap 5) 40}}',
  '\t}',
  '\t{parameters "fg"',
  '\t\t{spreading',
  '\t\t\t{radiusTable {0 0} {50 (* 0.65 %r1)} {(+ %max_dist_fg 3) (* %fg_acc %r1)} {(+ %max_dist_fg 5) 40}}',
  '\t\t}',
  '\t}',
  ')',
  '(define "accuracy_curve_gun_anti_far"',
  '\t{spreading',
  '\t\t{radiusTable {0 0} {50 (* 0.50 %r1)} {(+ %max_dist_ap 3) (* %ap_acc %r1)} {(+ %max_dist_ap 5) 40}}',
  '\t}',
  '\t{parameters "fg"',
  '\t\t{spreading',
  '\t\t\t{radiusTable {0 20} {50 (* 0.65 %r1)} {(+ %max_dist_fg 3) (* %fg_acc %r1)} {(+ %max_dist_fg 5) 40}}',
  '\t\t}',
  '\t}',
  ')',
  '(define "accuracy_curve_250m"',
  '\t("accuracy_curve_gun" max_dist_ap(250) max_dist_fg(230) r1(%r1) ap_acc(3.05) fg_acc(3.08))',
  ')',
  '(define "accuracy_curve_250m_10m_he_anti_far"',
  '\t("accuracy_curve_gun_anti_far" max_dist_ap(250) max_dist_fg(240) r1(%r1) ap_acc(3.05) fg_acc(3.14))',
  ')',
  '(define "accuracy_max"',
  '\t("accuracy_curve_250m" r1(0.875))',
  ')'));
put(mod, 'resource/set/stuff/gun/88mm_kwk', L(
  '{from "gun"',
  '\t("speed" s(810))',
  '\t("speed_lowarc" s(500))',
  '\t("damage_215" a(201) b(179) c(158) d(141) e(125) range(250))',
  '\t("damage_100" a(46) b(33) c(23) d(15) e(11) range(160))',
  '\t("damage_heat" a(110) range(200))',
  '\t("damage_170" a(1) b(2) c(3) d(4))',
  '\t("accuracy_max")',
  '\t("accuracy_curve_250m_10m_he_anti_far" r1(0.9))',
  '}'));
put(mod, 'resource/set/stuff/gun/75mm_kwk', L('{from "gun"', '\t("damage_215" a(1) b(2) c(3) d(4) e(5) range(200))', '}'));
// a second gun folder whose damage_heat caller passes a param that "max" would prefix (SDL-56)
put(mod, 'resource/set/stuff/gun/sp/.presets', L('(define "damage_heat"', '\t{projectileDamageTable {0 %a} {%range %a} {(+ %range 5) 0}}', ')'));
put(mod, 'resource/set/stuff/gun/sp/x', L('{from "gun"', '\t("damage_heat" a(1) range(2) maxx(3))', '}'));
put(mod, 'resource/set/stuff/rifle/.presets', L('(define "speed"', '\t{speed (* 1.0 %s)}', ')', '(define "recoveryTime"', '\t{recoveryTime (/ 60 %r)}', ')'));
put(mod, 'resource/set/stuff/rifle/k98', L('{from "rifle"', '\t("speed" s(760))', '\t("recoveryTime" r(15))', '}'));
put(mod, 'resource/set/stuff/shell/.presets', L(
  '(define "_tr"', '\t{trace {length (* %0 12)}}', ')',
  '(define "fg"', '\t{damage blastwave {energy (* %0 1.15)}}', ')',
  '(define "fg_maximum"', '\t{damage blastwave {energy %0}}', ')'));
put(mod, 'resource/set/stuff/shell/bullet88.fg.ammo', L('{from "shell"', '\t("fg" args 5.3)', '\t("fg_maximum" args 21)', '}'));
put(mod, 'resource/set/stuff/reactive/.presets', L('(define "fg"', '\t{damage blastwave {energy (* %0 1.2)}}', ')'));
put(mod, 'resource/set/stuff/reactive/rkt.ammo', L('{from "reactive"', '\t("fg" args 3)', '}'));
put(mod, 'tings to do.txt', Buffer.from([
  'notes', '', 'recoilless HE\t\t\t\t272g', '\t\t\tdiameter\twarhead\t\tpen\tdamage define', 'PIAT\t\t\t83mm\t\t1100g\t\t100mm\tcumulative', '------',
  '', 'E = highest energy', 'mortar fillers \t\t     fg value|   min - max dist|fg define', '; 8cm wgr = 0.57kg \t\t3.3\t4,15 - 7,47\tfg_min',
  '', 'E = highest energy', '150+ fillers / energy\t\tmid damage', '; 15cm Gr.19 = 5.1kg\t\t12\t11,9 - 18,7\tfg_heavy', '\t\t\t\t1,5\t 45,0- 60,0',
  '', ';rocket damage overall less', 'rocket fillers', '; 28cm wurfk\u00f6pr spr = 49,9kg\t40',
  '', 'fg_maximum max damage = fg_value, area *0,75', '', 'other shell fillers', '75mm HE M48 = 0.67kg\t\t3.5', '', '85mm OF-365 = 0.78kg\t\t5.2', '', '', 'WP speeds.',
].join('\r\n') + '\r\n', 'latin1'));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

// ---- plan
const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'guns', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan rc 0, writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const cases = rows.filter(x => x[3] === 'CASE');
ok(cases.some(x => /gun\/\.presets:3: "speed"/.test(x[4]) && /37mm_vanilla/.test(x[6])), 'case: gun speed called by a live vanilla file (PORT-55/61)');
ok(cases.some(x => /"damage_170"/.test(x[4]) && /expected shape/.test(x[6])), 'case: damage_170 body not the expected shape');
ok(cases.some(x => /sp\/\.presets:1: "damage_heat"/.test(x[4]) && /SDL-56/.test(x[6])), 'case: sp/damage_heat "max" prefixes a caller param (SDL-56)');
ok(cases.some(x => /cumulative/.test(x[4] + x[6])), 'case: cumulative table has no define');

// ---- apply
r = run('apply', mod, ...G, '--only', 'guns');
ok(r.rc === 0, 'apply rc 0');
const gp = get('resource/set/stuff/gun/.presets'), kwk = get('resource/set/stuff/gun/88mm_kwk');
ok(gp.includes('{20 %at20} {100 %at100} {170 %at170} {215 %at215} {%max (+ (* (/ (- 250 %max) (- 250 215)) (- %at215 %at250)) %at250)} {(+ %max 5) 0} }'), 'damage_215 body renamed');
ok(gp.includes('{projectileDamageTable {0 %damage} {%max %damage} {(+ %max 5) 0}}') && gp.includes('{speed (* 0.33 %mps)}'), 'damage_heat and speed_lowarc bodies renamed');
ok(kwk.includes('("damage_215" at20(201) at100(179) at170(158) at215(141) at250(125) max(250))') && kwk.includes('("damage_100" at20(46) at100(33) at170(23) at215(15) at250(11) max(160))'), 'damage calls renamed (unused at215/at250 too)');
ok(kwk.includes('("damage_heat" damage(110) max(200))') && kwk.includes('("speed_lowarc" mps(500))') && get('resource/set/stuff/gun/75mm_kwk').includes('at250(5) max(200)'), 'damage_heat / speed_lowarc calls renamed, second file too');
ok(kwk.includes('("speed" s(810))') && gp.includes('{speed (* 1.0 %s)}') && kwk.includes('("damage_170" a(1) b(2) c(3) d(4))'), 'gun speed and damage_170 untouched');
ok(get('resource/set/stuff/gun/sp/x').includes('("damage_heat" a(1) range(2) maxx(3))'), 'SDL-56 case left untouched');
ok(get('resource/set/stuff/rifle/.presets').includes('{speed (* 1.0 %mps)}') && get('resource/set/stuff/rifle/k98').includes('("speed" mps(760))'), 'rifle speed s -> mps (no live vanilla caller)');
ok(/; damage_215: projectileDamageTable[^\r\n]*\r\n;   at20 - damage \(penetration\) at 20 m\r\n(;[^\r\n]*\r\n){4};   max - [^\r\n]*\r\n;   e\.g\. \("damage_215" at20\(\d+\)[^\r\n]*\r\n\(define "damage_215"/.test(gp), 'damage_215 header: name, params in caller order, e.g.');
ok(/; ---- accuracy curves \(macrostd guns\)/.test(gp) && /;   accuracy_curve_250m\s+accuracy_curve_gun\s+250\s+230\s+3\.08/.test(gp) && /_anti_far .*blocks fg start at spread 20/.test(gp) && /_10m_he\s+HE aimed to R-10/.test(gp), 'accuracy table rows and legend from the bodies');
ok(gp.indexOf('; ---- accuracy curves') < gp.indexOf('; accuracy_curve_gun:') && gp.indexOf('; accuracy_curve_gun:') < gp.indexOf('(define "accuracy_curve_gun"'), 'table above the group, header directly above the define');
ok(/; accuracy_max: "accuracy_curve_250m" with the multiplier r1 0\.875/.test(gp), 'accuracy wrapper header');
const sh = get('resource/set/stuff/shell/.presets'), re = get('resource/set/stuff/reactive/.presets');
ok(sh.indexOf('lines 12-15') < sh.indexOf('lines 23-26') && sh.indexOf('lines 23-26') < sh.indexOf('(define "fg"') && sh.includes('; \t\t\t\t1,5\t 45,0- 60,0') && sh.includes(';\r\n; 85mm OF-365'), 'shell: 150+ and other-shell tables above fg, bytes and blank lines kept');
ok(/line 21\): fg_maximum note[^\r\n]*\r\n; fg_maximum max damage = fg_value, area \*0,75\r\n\r\n; fg_maximum:/.test(sh), 'fg_maximum note above fg_maximum');
ok(re.includes(';rocket damage overall less') && re.includes('; 28cm wurfk\u00f6pr spr') && re.indexOf('mortar fillers') < re.indexOf(';rocket damage'), 'reactive: mortar then rocket table, cp1251 byte kept');
ok(/; fg: HE blast[^\r\n]*\r\n;   args 0 \(positional %0\) - filler value[^\r\n]*\r\n;   e\.g\. \("fg" args 5\.3\)\r\n\(define "fg"/.test(sh), 'fg header with positional arg and real e.g.');
ok(get('resource/set/stuff/rifle/.presets').includes(';   r - rate of fire, rounds per minute'), 'rifle presets headers (touched file)');
ok(!/[^\r]\n/.test(gp + sh + re), 'CRLF kept');

// ---- verify SAME, re-plan 0 rows
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 0 && /verify: PASS/.test(r.out), 'verify PASS');
r = run('plan', mod, ...G, '--only', 'guns');
ok(/plan guns: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');

// ---- undo
r = run('undo', mod, '--step', 'guns');
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte');

console.log(fails ? `FAIL ${fails}` : 'ok   guns: all checks');
process.exitCode = fails ? 1 : 0;
