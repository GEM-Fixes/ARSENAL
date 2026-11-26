// macrostd regression: fixture game (one pak + loose) and mod built here in a temp dir (<ARSENAL_TMP or OS temp>/arsenal/macrostd-core/test)
//  , defects in truth.md. Checks: plan writes nothing, lint codes, apply fmt,indent,dead,names,index,
//   exact indent output, verify SAME, undo restores every byte, a hand edit makes verify DIFF, the step contract guard.
//   last line PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-a283b7be)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('macrostd-core/test');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod'), before = path.join(base, 'before'), cache = path.join(base, 'cache');
process.env.MACROSTD_CACHE = cache;

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };
const L = (...lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const get = rel => fs.readFileSync(path.join(mod, ...rel.split('/')));
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'latin1', env: process.env }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const G = ['--game', game, '--exe', 'mowas_2'];
const hashTree = dir => { const h = new Map(); for (const f of walkFiles(dir, /./)) { const r = relPath(dir, f); if (!r.startsWith('.arsenal-undo/')) h.set(r, crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')); } return h; };
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// ---- fake game: vanilla text in resource/gamelogic.pak + loose entity
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['properties/vanilla.inc', L('(define "armor_light" {armor %0})', '(define "Vanilla_Cap" {vc %0})')],
  ['properties/shared.inc', L('(define "Shared_Cap" {sc 1})')],
  ['set/stuff/rifle/.presets', L('(define "rifle_base" {range %0})')],
  ['set/stuff/rifle/k98', L('{from "x"', '\t("rifle_base" args 50)', '}')],
]);
put(game, 'resource/entity/tank/t1/t1.def', L('(include "/properties/shared.inc")', '{t1 ("Shared_Cap")}'));

// ---- mod
put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, 'resource/properties/shared.inc', L('(define "Shared_Cap" {sc 1})', '(define "Shared_Other" {so 1})'));   // overwrites vanilla: owner vanilla
put(mod, 'resource/properties/mod_macros.inc', L(
  '; plate armor: one plate',
  '(define "Plate-Armor"',
  '\t{armor %0}',
  ')',
  '',
  '; never used',
  '(define "unused_one"',
  '\t{x %0}',
  ')',
  '(define "wrap" {w ("Plate-Armor" args 7)})',
  '(define "pref" {a %c} {b %cw})',
  '(define "dupe" {x 1})',
  '(define "Vanilla_Cap" {vc %0})',
  '(define "gore_piece1" {g 1})',
  '(define "gore_pieceA" {g 2})',
  '(define "gores" ("gore_piece%0"))',
  '(define "Dup_Name" {d 1})',
  '(define "dup_name" {d 2})',
  '(define "spare" {s ("Dup_Name") ("dup_name") ("gores" args 1) ("gores" args A)})'));
put(mod, 'resource/properties/other.inc', L('(define "dupe" {x 2})'));
put(mod, 'resource/entity/a/a.def', L(
  '(include "/properties/mod_macros.inc")',
  '(include "/properties/vanilla.inc")',
  '{a ("Plate-Armor" args 10)',
  '\t("wrap")',
  '\t("pref" c(1))',
  '\t("Vanilla_Cap" args 3)',
  '\t("spare")',
  '}'));
put(mod, 'resource/entity/b/b.def', Buffer.from('(include "/properties/mod_macros.inc")\n{b ("Plate-Armor" args 20)   \n\t{speed 5}\t\n\t("nowhere")\n}', 'latin1'));
put(mod, 'resource/entity/c/c.def', L(
  '; header \u00e0\u00e1\u00e2 cp1251',
  '(include "/properties/mod_macros.inc")',
  '{"perks"',
  '    {"pistol" lvl_4',
  '  }',
  ' \t{x 1}',
  ';\t{commented',
  ';\t\t{y 2}',
  ';\t}',
  '\t; inner comment',
  '    {z 3}',
  '}',
  '(define "nested"',
  '  {a ("Plate-Armor" args 5)',
  '      {b 1}',
  '})',
  '{list ("nested")',
  '}'));
put(mod, 'resource/entity/d/d.def', L('{d', '  {x 1}))', '   }'));                           // unbalanced: stray ')'
put(mod, 'resource/entity/e/e.def', L('(include "/properties/nope.inc")', '{e 1}'));
put(mod, 'resource/set/stuff/rifle/m1', L('{from "x"\t', '\t("rifle_base" args 40)', '}'));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

// ---- scan
let r = run('scan', mod, ...G);
ok(r.rc === 0 && /defines: 16\b/.test(r.out), 'scan: 16 defines');
ok(/modOwned: 12\b/.test(r.out) && /vanillaOwned: 3\b/.test(r.out), 'scan: 12 mod-owned, 3 vanilla-owned names (Shared_Cap, Shared_Other, Vanilla_Cap)');
ok(/rootsVanilla: 1\b/.test(r.out), 'scan: vanilla root t1.def reaches the mod\'s shared.inc');

// ---- lint
r = run('lint', mod, ...G);
const has = (code, re) => r.out.split(/\r?\n/).some(l => l.includes(' ' + code + ' ') && re.test(l));
ok(has('DEFINE_DEAD', /unused_one/), 'lint DEFINE_DEAD unused_one');
ok(!has('DEFINE_DEAD', /gore_piece1|Shared_Other/), 'lint: dynamic-callable and vanilla-owned names not dead');
ok(has('NAME_STYLE', /Plate-Armor/) && !has('NAME_STYLE', /Vanilla_Cap|Shared_Cap/), 'lint NAME_STYLE Plate-Armor, not vanilla-owned names');
ok(has('PARAM_PREFIX', /crash-risk.*%c is a prefix of %cw/), 'lint PARAM_PREFIX crash-risk');
ok(has('DEFINE_DUP_DIFF', /dupe/), 'lint DEFINE_DUP_DIFF dupe');
ok(has('CALL_UNDEFINED', /nowhere/) && r.out.includes('resource/entity/b/b.def:4: CALL_UNDEFINED'), 'lint CALL_UNDEFINED nowhere at b.def:4');
ok(!has('CALL_UNDEFINED', /rifle_base/), 'lint: stuff .presets defines visible (SDL-50)');
ok(has('INCLUDE_MISSING', /nope\.inc/), 'lint INCLUDE_MISSING nope.inc');

// ---- plan writes nothing
const tsv = path.join(base, 'plan.tsv');
r = run('plan', mod, ...G, '--only', 'fmt,indent,dead,names', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)) && !fs.existsSync(path.join(mod, '.arsenal-undo')) && !fs.existsSync(mod + '.arsenal-undo'), 'plan writes nothing to the mod');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
ok(rows.some(x => x[0] === 'fmt' && x[1] === 'resource/entity/b/b.def' && x[3] === 'eol'), 'plan fmt: b.def LF -> CRLF row');
ok(rows.some(x => x[0] === 'indent' && x[3] === 'CASE' && /d\.def/.test(x[4])), 'plan indent: unbalanced d.def is a case');
ok(rows.some(x => x[0] === 'names' && x[3] === 'CASE' && /gore_pieceA/.test(x[4]) && /dynamically/.test(x[6])), 'plan names: gore_pieceA case (dynamic)');
ok(rows.some(x => x[0] === 'names' && x[3] === 'CASE' && /Dup_Name/.test(x[4]) && /already exists/.test(x[6])), 'plan names: Dup_Name case (exists)');
ok(rows.filter(x => x[0] === 'names' && x[4] === 'Plate-Armor').length === 5, 'plan names: Plate-Armor define + 4 calls (2 in macro bodies)');

// ---- exact indent result for c.def
const ind = require('../steps/indent'), fmt = require('../steps/fmt');
const cIn = get('resource/entity/c/c.def').toString('latin1');
const cOut = ind.indentText(fmt.fmtText(cIn).out, []).out;
const cWant = ['; header \u00e0\u00e1\u00e2 cp1251', '(include "/properties/mod_macros.inc")', '{"perks"', '\t{"pistol" lvl_4', '\t}', '\t{x 1}',
  '\t;\t{commented', '\t;\t\t{y 2}', '\t;\t}', '\t; inner comment', '\t{z 3}', '}', '(define "nested"', '\t{a ("Plate-Armor" args 5)', '\t\t{b 1}', '})',
  '{list ("nested")', '}'].join('\r\n') + '\r\n';
ok(cOut === cWant, 'indent: exact output for c.def (spaces, mixed, perk, define, commented block, `})`)');
ok(ind.indentText('{a\r\n}}\r\n', []).error && ind.indentText('{a\r\n', []).error, 'indent: unbalanced text refused');

// ---- apply
r = run('apply', mod, ...G, '--only', 'fmt,indent,dead,names');
ok(r.rc === 0, 'apply rc 0');
const a = get('resource/entity/a/a.def').toString('latin1'), mm = get('resource/properties/mod_macros.inc').toString('latin1');
ok(a.includes('("plate_armor" args 10)') && get('resource/entity/b/b.def').toString('latin1').includes('("plate_armor" args 20)') && mm.includes('(define "plate_armor"') && mm.includes('{w ("plate_armor" args 7)}'), 'names: plate_armor in define, 2 files and a macro body');
ok(a.includes('("Vanilla_Cap" args 3)') && get('resource/properties/shared.inc').toString('latin1').includes('"Shared_Cap"'), 'names: vanilla-owned names kept');
ok(/; ---- unused macros \(macrostd\): defined, never called ----\r\n; ; never used\r\n; \(define "unused_one"\r\n; \t\{x %0\}\r\n; \)\r\n; \(define "dupe" \{x 1\}\)\r\n$/.test(mm) && !/^\(define "unused_one"/m.test(mm), 'dead: unused_one moved under the heading, commented, with its header');
const b = get('resource/entity/b/b.def').toString('latin1');
ok(!/[^\r]\n/.test(b) && !/[ \t]\r\n/.test(b) && b.endsWith('}\r\n'), 'fmt: b.def CRLF, no trailing blanks, final newline');
ok(get('resource/entity/c/c.def').includes(Buffer.from([0xe0, 0xe1, 0xe2])), 'cp1251 comment bytes kept');
ok(get('resource/entity/d/d.def').equals(fs.readFileSync(path.join(before, 'resource/entity/d/d.def'))), 'unbalanced d.def untouched');
ok(fs.existsSync(mod + '.arsenal-undo') && fs.readdirSync(mod + '.arsenal-undo').some(d => /^macrostd-\d{8}$/.test(d)) && !fs.existsSync(path.join(mod, '.arsenal-undo')), 'undo folder made beside the mod (<mod>.arsenal-undo), nothing inside it');

// ---- verify SAME
const vj = path.join(base, 'verify.json');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && /verify: PASS/.test(r.out) && vr.counts.SAME === vr.roots && vr.roots >= 6, `verify SAME after fmt,indent,dead,names (${vr.roots} roots)`);

// ---- index (a created file, undo-able)
r = run('index', mod, ...G);
const md = fs.existsSync(path.join(mod, 'MACROS.md')) ? fs.readFileSync(path.join(mod, 'MACROS.md'), 'latin1') : '';
ok(r.rc === 0 && /\| plate_armor \| %0 \| 4 \| mod \| \d+ \| plate armor: one plate \|/.test(md) && /\| pref \| %c %cw \|/.test(md) && md.includes('\r\n'), 'index: MACROS.md table with params, calls, description');

// ---- hand edit -> DIFF
const cpath = path.join(mod, 'resource/entity/c/c.def');
const cKeep = fs.readFileSync(cpath);
fs.writeFileSync(cpath, Buffer.from(cKeep.toString('latin1').replace('{z 3}', '{z 4}'), 'latin1'));
r = run('verify', mod, ...G, '--before', before);
ok(r.rc === 1 && /resource\/entity\/c\/c\.def: DIFF at "perks"\/z: before "3" after "4"/.test(r.out), 'verify DIFF on a hand-edited number');
const allow = path.join(base, 'allow.tsv'); fs.writeFileSync(allow, 'root\treason\r\nresource/entity/c/c.def\towner approved\r\n');
r = run('verify', mod, ...G, '--before', before, '--allow', allow);
ok(r.rc === 0 && /DIFF_ALLOWED/.test(r.out), 'verify --allow approves it');
fs.writeFileSync(cpath, cKeep);

// ---- undo everything (reverse order) -> bytes identical
for (const s of ['index', 'names', 'dead', 'indent', 'fmt']) { r = run('undo', mod, '--step', s); if (r.rc) console.log(r.out); }
ok(!fs.existsSync(path.join(mod, 'MACROS.md')), 'undo index deleted the created MACROS.md');
ok(sameTree(h0, hashTree(mod)), 'undo restores every byte');

// ---- an old restore point inside the mod (<mod>/.arsenal-undo/macrostd-<day>, written by older versions) is still undone
r = run('apply', mod, ...G, '--only', 'fmt');
{ const day = fs.readdirSync(mod + '.arsenal-undo').find(d => fs.existsSync(path.join(mod + '.arsenal-undo', d, 'fmt')));
  const old = path.join(mod, '.arsenal-undo', 'macrostd-20200101');
  fs.mkdirSync(old, { recursive: true }); fs.renameSync(path.join(mod + '.arsenal-undo', day, 'fmt'), path.join(old, 'fmt'));
  ok(r.rc === 0 && !sameTree(h0, hashTree(mod)), 'legacy: fmt applied again, its copies moved into <mod>/.arsenal-undo (the old form)');
  r = run('undo', mod, '--step', 'fmt');
  ok(r.rc === 0 && sameTree(h0, hashTree(mod)) && fs.readdirSync(old).some(d => /^fmt\.undone-/.test(d)), 'legacy: undo without --undo finds the inside restore point and restores every byte');
}

// ---- contract guard
const core = require('../macrostd');
const bad = f => { try { core.checkChange({ file: f, after: Buffer.from('x'), create: false, rows: [] }, mod, 't'); return false; } catch (e) { return true; } };
ok(bad('resource/script/x.lua') && bad('resource/interface/a.set') && bad('mod.info') && bad('../x') && bad('resource\\set\\a.set') && bad('notes.txt') && !bad('resource/entity/a/a.def'), 'step contract: refused paths');
{ const ids = new Set(core.loadSteps().keys()); ok(['dead', 'fmt', 'indent', 'index', 'names'].every(s => ids.has(s)), 'steps discovered (core five present)'); }

console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exitCode = fails ? 1 : 0;
