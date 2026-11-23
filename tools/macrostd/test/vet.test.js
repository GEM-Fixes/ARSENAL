// macrostd step vet regression: fixture game + mod with breed_vet breeds in two sides, a shared robz_vet.inc, a side-only table,
//   and a VANILLA breed (in the pak, not overridden) that includes the side's veterancy_generic.inc and calls ("veterancy_1")
//   (PORT-55/61). Checks: plan writes nothing, renames + breed calls, the alias for the vanilla-called name only, headers, outline
//   rows (pattern break, mp differs, literal block, name heuristic), verify SAME incl. the vanilla breed, verify FAILS once the
//   alias is removed (the nested alias call is what keeps the vanilla breed identical), re-plan 0 files, undo restores every byte.
//   Prints ok/FAIL lines, exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-36a1bb3b)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('vet/test');
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

const lv = (ind, ...n) => n.flatMap((v, i) => [`${ind}{"lvl_${i + 1}" ${v}`, `${ind}}`]);
const table = (name, outer, mp) => [`(define "${name}"`, ...lv('\t', ...outer), ...(mp ? ['\t(mod "mp"', ...lv('\t\t', ...mp), '\t)'] : []), ')'];
const breed = (skin, vet) => L('(include "/set/breed/breed_macros.inc")', '{breed', `\t{skin "${skin}"}`, '\t{perks', '\t\t{"tank" 1}', '\t}', ...vet, '\t{inventory', '\t\t{item "mp40" filled}', '\t}', '}');
const call = k => [`\t("breed_vet" kind(${k}))`];

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['set/breed/mp/ger/veterancy_generic.inc', L(...table('veterancy_1', [4, 8, 24, 48, 80], [2, 4, 12, 24, 40]))],
  ['set/breed/mp/ger/vanilla_rifle.set', L('{breed', '\t{skin "ger-reg"}', '\t{veterancy', '\t\t(include "veterancy_generic.inc")', '\t\t("veterancy_1")', '\t}', '}')],
]);

put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, 'resource/set/ability/veterancy.set', L('{"lvl_1" from veterancy', '\t{"health" 0.10}\t;+%', '\t{"weapon_skill" 1}', '}', '', '{"lvl_2" from veterancy', '\t{"health" 0.20}', '\t{"weapon_skill" 1}', '}'));
put(mod, 'resource/set/breed/breed_macros.inc', L('; breed_macros.inc: shared blocks', '',
  '; breed_vet: the veterancy block', ';   kind - name after "veterancy_"', ';   e.g. ("breed_vet" kind(1))',
  '(define "breed_vet"', '\t{veterancy', '\t\t(include "veterancy_generic.inc")', '\t\t("veterancy_%kind")', '\t}', ')'));
put(mod, 'resource/set/breed/mp/robz_vet.inc', L('; robz shared macros (macrostd share): one define per name', '; defines: veterancy_1', '',
  '; veterancy_1: {"lvl_1"} x', ';   e.g. ("veterancy_1")', ...table('veterancy_1', [24, 60, 108, 168, 240], [24, 60, 108, 168, 240]), '',
  ...table('veterancy_elite', [60, 132, 216, 312, 420], [60, 132, 216, 312, 420]), '',
  ...table('veterancy_lvl2', [-1, 0, 84, 180, 288]), '',
  ...table('veterancy_1_lvl2', [-1, 0, 48, 120, 192]), '',
  ...table('veterancy_tankcrew_lvl3', [-1, -1, 0, 96, 204], [-1, -1, 0, 180, 360])));
put(mod, 'resource/set/breed/mp/ger/veterancy_generic.inc', L('(include "/set/breed/mp/robz_vet.inc")'));
put(mod, 'resource/set/breed/mp/ger_ss/veterancy_generic.inc', L('(include "/set/breed/mp/robz_vet.inc")',
  '; veterancy_lvl3: copied header', ...table('veterancy_lvl3', [-1, -1, 0, 108, 180]), '', ...table('veterancy_1_old', [48, 96, 288, 576, 960], [24, 60, 108, 168, 240]),
  '', '; (define "veterancy_lvl4"', '; )'));
put(mod, 'resource/set/breed/mp/ger/a.set', breed('ger-reg', call('1')));
put(mod, 'resource/set/breed/mp/ger/elite_x.set', breed('ger-elite', call('1')));
put(mod, 'resource/set/breed/mp/ger/b.set', breed('ger-reg', call('lvl2')));
put(mod, 'resource/set/breed/mp/ger/e.set', breed('ger-reg', call('elite')));
put(mod, 'resource/set/breed/mp/ger/f.set', breed('ger-reg', call('1_lvl2')));
put(mod, 'resource/set/breed/mp/ger/tank.set', breed('ger-tank', call('tankcrew_lvl3')));
put(mod, 'resource/set/breed/mp/ger_ss/c.set', breed('ss', call('lvl3')));
put(mod, 'resource/set/breed/mp/ger_ss/d.set', breed('ss', ['\t{veterancy', ...lv('\t\t', 2, 5, 9, 14, 20), '\t}']));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'vet', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const kinds = k => rows.filter(x => x[3] === k).length;
ok(kinds('vet_call') === 7 && kinds('rename') === 7 && kinds('breed_vet') === 1, `plan rows: vet_call 7, rename 7, breed_vet 1 (${['vet_call', 'rename', 'breed_vet'].map(kinds)})`);
const out = rows.filter(x => x[3] === 'outline');
ok(out.some(x => /vet_standard_start2 lvl_4: expected 108/.test(x[4]) && x[5] === '120'), 'outline: vet_standard_start2 lvl_4 120, expected 108');
ok(out.some(x => /vet_crew_start3 outer/.test(x[4]) && /180\/360/.test(x[5])), 'outline: vet_crew_start3 (mod "mp") differs');
ok(out.some(x => /d\.set$/.test(x[1]) && /literal \{veterancy\} block 2\/5\/9\/14\/20/.test(x[4])), 'outline: literal veterancy block (d.set)');
ok(out.some(x => /ger: 1 breeds .*\[I\]/.test(x[4]) && /elite_x\.set \(elite name on vet_standard\)/.test(x[5])), 'outline: elite name on vet_standard [I]');
ok(!out.some(x => /vet_elite_start2 lvl_/.test(x[4])), 'no outline for vet_elite_start2 (= vet_elite minus 132)');
ok(rows.some(x => x[3] === 'CASE' && /vet_standard_old .* no breed/.test(x[4])) && rows.some(x => x[3] === 'CASE' && /veterancy_lvl4/.test(x[4])), 'cases: unused vet_standard_old, commented-out veterancy_lvl4');

r = run('apply', mod, ...G, '--only', 'vet');
ok(r.rc === 0, 'apply rc 0');
const rv = get('resource/set/breed/mp/robz_vet.inc');
ok(/^; robz_vet\.inc: veterancy score tables/.test(rv) && !rv.includes('macrostd share') && !/[^\r]\n/.test(rv), 'robz_vet.inc: new top header replaces the share header, CRLF');
ok(/\r\n\(define "vet_standard"\r\n/.test(rv) && /\r\n\(define "vet_elite_start2"\r\n/.test(rv) && /\r\n\(define "vet_crew_start3"\r\n/.test(rv), 'robz_vet.inc: tables renamed');
ok(rv.includes('(define "veterancy_1" ("vet_standard"))') && !rv.includes('(define "veterancy_elite"') && !rv.includes('(define "veterancy_lvl2"'), 'alias only for veterancy_1 (the vanilla breed calls it)');
ok(/;   vet_elite_start2 +-1 +0 +84 +180 +288 +no mp set +1 breed\r\n/.test(rv), 'table listing line for vet_elite_start2');
ok(/;   numbers = vet_elite minus 132\r\n/.test(rv) && /;   rank +health +w_skill\r\n;   lvl_1 +0\.10 +1\r\n/.test(rv), 'derivation line + effects table from veterancy.set');
const ss = get('resource/set/breed/mp/ger_ss/veterancy_generic.inc');
ok(/^; veterancy_generic\.inc \(ger_ss\): includes \/set\/breed\/mp\/robz_vet\.inc \(shared tables\), plus 2 own tables below\.\r\n;   Keep it/.test(ss) && ss.includes('(define "vet_ss_start3"') && ss.includes('(define "vet_standard_old"') && !ss.includes('copied header') && ss.includes('; (define "veterancy_lvl4"'), 'ger_ss: 2-line header, side tables renamed, commented block kept');
ok(/; veterancy_generic\.inc \(ger\): .* and nothing else\.\r\n;   Keep it under this name: breed_vet and this folder's vanilla breeds include/.test(get('resource/set/breed/mp/ger/veterancy_generic.inc')), 'ger: header names the vanilla breeds');
const bm = get('resource/set/breed/breed_macros.inc');
ok(bm.startsWith('; breed_macros.inc: shared blocks\r\n\r\n; breed_vet: ') && bm.includes('\t\t("vet_%table")\r\n') && /;   table - /.test(bm) && /ss_start3 \(ger_ss only\)/.test(bm) && !bm.includes('kind'), 'breed_macros.inc: breed_vet table(word), word list, rest kept');
ok(get('resource/set/breed/mp/ger/a.set').includes('\r\n\t("breed_vet" table(standard))\r\n') && get('resource/set/breed/mp/ger_ss/c.set').includes('table(ss_start3)'), 'breed calls rewritten');

const vj = path.join(base, 'verify.json');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && /verify: PASS/.test(r.out) && vr.counts.SAME === vr.roots && /[1-9]\d* vanilla/.test(r.out), `verify SAME incl. the vanilla breed (${vr.roots} roots)`);

const rvAbs = path.join(mod, 'resource/set/breed/mp/robz_vet.inc');
fs.writeFileSync(rvAbs, rv.replace('(define "veterancy_1" ("vet_standard"))', ''), 'latin1');
r = run('verify', mod, ...G, '--before', before);
ok(/verify: FAIL/.test(r.out), 'without the alias the vanilla breed differs (verify FAIL): the alias is what keeps it');
fs.writeFileSync(rvAbs, rv, 'latin1');

r = run('plan', mod, ...G, '--only', 'vet', '--tsv', tsv);
const rows2 = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
ok(/plan vet: 0 files/.test(r.out) && rows2.every(x => x[3] === 'outline' || x[3] === 'CASE'), 're-plan: 0 files, only outline rows and cases');

r = run('undo', mod, '--step', 'vet');
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte');

console.log(fails ? `FAIL ${fails}` : 'ok   vet PASS');
process.exitCode = fails ? 1 : 0;
