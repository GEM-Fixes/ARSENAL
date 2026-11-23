// macrostd step kit regression: fixture game (one vanilla stuff: a molotov with {damage fire}) + mod with stuff files (classes from
//   the folders, {filling} tags) and breeds in two sides that already include breed_macros.inc. Checks: class macros
//   (rifle_/smg_), kit_<class> generic with an ammo name holding a space, grenade kinds (frag, at, smoke, fire from vanilla data),
//   comment moved to the call line, second ammo line literal, foreign ammo literal, outline rows (only with --tsv), the include
//   added after breed_macros.inc's header comment, verify SAME, re-plan 0 rows, undo restores every byte. ok/FAIL, exit 1 on FAIL.
// Author: Imperator_Aug (ARSENAL, ia-dcd86bb0)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('kit/test');
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
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['set/stuff/grenade/02 grenade_at/molotov.grenade', L('{tag "ic"}', '{damage fire', '\t{radius 4}', '}')],
  ['properties/vanilla.inc', L('(define "armor_light" {armor %0})')]]);

const S = 'resource/set/stuff/';
put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, S + 'rifle/mauzer', L('{filling "ammo mauser_clip mauser" 5}'));
put(mod, S + 'smg/mp40', L('{filling "ammo mp40_mag" 32}'));
put(mod, S + 'pistol/valter', L('{filling "ammo walther_mag" 8}'));
put(mod, S + 'mgun/mg34', L('{filling "ammo mg_mauser" 50}'));
put(mod, S + 'ammo/mauser_clip.mauser.ammo', L('{mass 1}'));
put(mod, S + 'ammo/mp40_mag.ammo', L('{mass 1}'));
put(mod, S + 'ammo/walther_mag.ammo', L('{mass 1}'));
put(mod, S + 'ammo/mg_mauser.drum.ammo', L('{mass 1}'));
put(mod, S + 'grenade/01 grenade_ap/m24.grenade', L('{damage blastwave', '\t{energy 3}', '}'));
put(mod, S + 'grenade/02 grenade_at/hohlladung.grenade', L('{damage cumulative', '\t{damage 15}', '}'));
put(mod, S + 'grenade/00 grenade_smoke/smoke.grenade', L('{mass 1}'));
put(mod, 'resource/set/breed/breed_macros.inc', L('; breed_macros.inc: header', ';   second header line', '', '(define "breed_x"', '\t{"speed" 1}', ')'));
const INC = '(include "/set/breed/breed_macros.inc")';
const breed = (...inv) => L(INC, '{breed', '\t{nationality ger}', '\t{perks', '\t\t("breed_x")', '\t}', '\t{inventory', ...inv.map(l => '\t\t' + l), '\t\t{in_hands 0}', '\t}', '}');
const MZ = ['{item "mauzer" filled}', '{item "ammo mauser_clip" 60}'], MP = ['{item "mp40" filled}', '{item "ammo mp40_mag" 192}'];
const M24 = '{item "grenade m24" 2}', HL = '{item "hohlladung grenade"}', SM = '{item "smoke grenade" 1}', MO = '{item "grenade molotov" 0 1}';
put(mod, 'resource/set/breed/mp/ger/a.set', breed(...MZ, '{item "ammo mg_mauser drum" 50}', M24, HL, SM));
put(mod, 'resource/set/breed/mp/ger/b.set', breed(MZ[0], MZ[1] + ' ; clip', M24, HL, SM, '{item "bandage" 3}'));
put(mod, 'resource/set/breed/mp/ger/c.set', breed(...MP, M24, HL, SM, MO));
put(mod, 'resource/set/breed/mp/rus/d.set', breed(...MP, ...MZ, M24, HL, SM, MO));
put(mod, 'resource/set/breed/mp/rus/e.set', breed(...MP, '{item "valter" filled}', '{item "ammo mp40_mag" 64}', MO, '{item "grenade m24" 1}'));
put(mod, 'resource/set/breed/mp/rus/f.set', breed(...MP, ...MZ, MO, '{item "mp40" filled}', '{item "ammo mp40_mag" 96}', '{item "mg34" filled}', '{item "ammo mg_mauser drum" 300}'));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'kit', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const kinds = k => rows.filter(x => x[3] === k).length;
ok(kinds('create') === 1 && kinds('include') === 1 && kinds('kit_gun') === 8 && kinds('kit_generic') === 2 && kinds('kit_grenade') === 16,
  `plan rows: create 1, include 1, kit_gun 8, kit_generic 2, kit_grenade 16 (${['create', 'include', 'kit_gun', 'kit_generic', 'kit_grenade'].map(kinds)})`);
ok(rows.some(x => x[3] === 'outline' && /e\.set/.test(x[1]) && /grenade m24" 1\} \(1 breed\), nearest frag_m24_x2 = count 2/.test(x[5])), 'outline: m24 count 1, nearest frag_m24_x2 (e.set)');
ok(rows.some(x => x[3] === 'outline' && /f\.set/.test(x[1]) && /mp40 with mp40_mag 96 \(1 breed\), standard is 192 \(-96\)/.test(x[5]) && /\(4 uses\)/.test(x[6])), 'outline: kit_smg mp40 96 vs standard 192 (f.set)');
ok(rows.some(x => x[3] === 'CASE' && /kit-foreign-ammo/.test(x[6]) && /valter/.test(x[6])), 'case: valter + mp40_mag kept literal');

r = run('apply', mod, ...G, '--only', 'kit');
ok(r.rc === 0, 'apply rc 0');
const kit = get('resource/set/breed/breed_kit.inc');
ok(!/[^\r]\n/.test(kit) && kit.includes('(define "rifle_mauzer"\r\n\t{item "mauzer" filled}\r\n\t{item "ammo mauser_clip" 60}\r\n)')
  && kit.includes('(define "kit_smg"\r\n\t{item "%gun" filled}\r\n\t{item "ammo %ammo" %rounds}\r\n)')
  && /; ==== grenades: fire ====[\s\S]*fire_molotov_x0_1/.test(kit) && /\(define "at_grenade_hohlladung"/.test(kit) && /\(define "smoke_x1"/.test(kit) && /\(define "frag_m24_x2"/.test(kit),
  'breed_kit.inc: CRLF, class sections, generic, grenade kinds (fire from the vanilla stuff)');
ok(/^; rifle_mauzer: [^\r]*\r\n;   e\.g\. \("rifle_mauzer"\)\r\n\(define "rifle_mauzer"/m.test(kit), 'header comment above each define');
ok(get('resource/set/breed/breed_macros.inc').startsWith('; breed_macros.inc: header\r\n;   second header line\r\n(include "/set/breed/breed_kit.inc")\r\n\r\n(define'), 'breed_macros.inc: include after the header comment');
const aWant = [INC, '{breed', '\t{nationality ger}', '\t{perks', '\t\t("breed_x")', '\t}', '\t{inventory', '\t\t("rifle_mauzer")', '\t\t{item "ammo mg_mauser drum" 50}',
  '\t\t("frag_m24_x2")', '\t\t("at_grenade_hohlladung")', '\t\t("smoke_x1")', '\t\t{in_hands 0}', '\t}', '}', ''].join('\r\n');
ok(get('resource/set/breed/mp/ger/a.set') === aWant, 'a.set: exact output (second ammo line literal)');
ok(get('resource/set/breed/mp/ger/b.set').includes('\t\t("rifle_mauzer") ; clip\r\n'), 'b.set: end-of-line comment moved to the call');
const f = get('resource/set/breed/mp/rus/f.set');
ok(f.includes('\t\t("kit_smg" gun(mp40) ammo(mp40_mag) rounds(96))\r\n') && f.includes('\t\t("kit_mgun" gun(mg34) ammo(mg_mauser drum) rounds(300))\r\n'), 'f.set: kit_<class> generic, ammo name with a space');
ok(get('resource/set/breed/mp/rus/e.set').includes('\t\t{item "valter" filled}\r\n\t\t{item "ammo mp40_mag" 64}\r\n'), 'e.set: foreign ammo literal');

const vj = path.join(base, 'verify.json');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && /verify: PASS/.test(r.out) && vr.counts.SAME === vr.roots, `verify SAME (${vr.roots} roots: ${JSON.stringify(vr.counts)})`);

r = run('plan', mod, ...G, '--only', 'kit');
ok(/plan kit: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');

// upgrade: three more breeds give mp40 + 96 a 4th use -> smg_mp40_96, f.set's kit_smg call becomes the named macro, kit rewritten
for (const n of ['g', 'h', 'i']) for (const root of [mod, before]) put(root, `resource/set/breed/mp/ger/${n}.set`, breed('{item "mp40" filled}', '{item "ammo mp40_mag" 96}', M24));
for (const root of [mod, before]) put(root, 'resource/set/breed/mp/ger/j.set', breed(...MP));   // 5 x 192 stays the standard (no tie)
const h1 = hashTree(before);
r = run('plan', mod, ...G, '--only', 'kit', '--tsv', tsv);
const rows2 = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
ok(rows2.some(x => x[3] === 'rewrite') && rows2.some(x => x[3] === 'CASE' && /smg_mp40_96: 4 breeds, standard is 192/.test(x[6])), 'upgrade plan: kit rewrite, case kit-nonstandard smg_mp40_96');
r = run('apply', mod, ...G, '--only', 'kit');
const kit2 = get('resource/set/breed/breed_kit.inc');
ok(r.rc === 0 && get('resource/set/breed/mp/rus/f.set').includes('\t\t("smg_mp40_96")\r\n') && get('resource/set/breed/mp/ger/g.set').includes('\t\t("smg_mp40_96")\r\n')
  && /;   smg_mp40_96 +mp40 +mp40_mag +96 +4 +ger rus +non-standard load, standard is 192/.test(kit2) && kit2.includes('(define "smg_mp40_96"'), 'upgrade: kit_smg call -> smg_mp40_96, table note');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr2 = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && vr2.counts.SAME === vr2.roots, `upgrade verify SAME (${vr2.roots} roots)`);
r = run('plan', mod, ...G, '--only', 'kit');
ok(/plan kit: 0 files, 0 rows/.test(r.out), 'upgrade re-plan: 0 rows');

r = run('undo', mod, '--step', 'kit');
ok(r.rc === 0 && sameTree(h1, hashTree(mod)), 'undo restores every byte and deletes breed_kit.inc');

console.log(fails ? `FAIL ${fails}` : 'ok   kit PASS');
process.exitCode = fails ? 1 : 0;
