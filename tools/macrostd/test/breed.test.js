// macrostd step breed regression: fixture game + mod with soldier breeds in two sides (each with its own veterancy_generic.inc,
//   different bodies: proves the breed_vet include resolves from the CALLING breed's folder). Checks plan, the created
//   breed_macros.inc, exact output of one breed, literal leftovers (quoted melee, inline veterancy, nested perk, perk inside a run),
//   verify SAME, re-plan 0 rows, undo restores every byte. Prints ok/FAIL lines, exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-9dc09666)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('ms-breed/test');
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
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [['properties/vanilla.inc', L('(define "armor_light" {armor %0})')]]);

const P = (n, v) => [`\t\t{"${n}"${v === undefined ? '' : ' ' + v}`, '\t\t}'];
const body = (vis, sp) => [...P('health', '"150%"'), ...P('health_regeneration', '"100%"'), ...P('stamina', '"100%"'), ...P('stamina_regeneration', '"100%"'), ...P('vision', vis), ...(sp ? P('speed', sp) : [])];
const drive = ['\t\t{"tank"\t0.75', '\t\t}', ...P('vehicle', 1), ...P('cannon', 0.8)];
const skills = m => [...P('pistol', 'lvl_4'), ...P('smg', 'lvl_4'), ...P('mgun', 'lvl_2'), ...P('rifle', 'lvl_3'), ...P('rocketlauncher', 'lvl_2'), ...P('melee', m)];
const vet = k => ['\t{veterancy', '\t\t(include "veterancy_generic.inc")', `\t\t("veterancy_${k}")`, '\t}'];
const breed = (perks, v) => L('{breed', '\t{skin "ger-reg-pioneer"}', '\t{nationality ger}', '\t{perks', ...perks, '\t}', ...v, '\t{inventory', '\t\t{item "mp40" filled}', '\t}', '}');

put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, 'resource/set/breed/mp/ger/veterancy_generic.inc', L('(define "veterancy_1"', '\t{"lvl_1" 24', '\t}', ')', '(define "veterancy_elite"', '\t{"lvl_1" 5}', ')'));
put(mod, 'resource/set/breed/mp/rus/veterancy_generic.inc', L('(define "veterancy_1"', '\t{"lvl_1" 99}', ')', '(define "veterancy_elite"', '\t{"lvl_1" 7}', ')'));
put(mod, 'resource/set/breed/mp/ger/a.set', breed([...body('"mp_soldier"', '0.9'), ...P('stealth'), ...drive, '', ...skills('lvl_4'), ...P('tankgun', 'lvl_3')], vet('1')));
put(mod, 'resource/set/breed/mp/rus/b.set', breed([...body('mp_sniper', '1'), ...drive, ...skills('lvl_5')], ['\t{veterancy', '\t\t(include "veterancy_generic.inc")', '\t\t("veterancy_elite")', '', '\t}']));
put(mod, 'resource/set/breed/mp/rus/c.set', breed([...body('"mp_soldier"', '0.9'), ...drive, ...skills('"lvl_4"')], ['\t{veterancy', '\t\t{"lvl_1" 2', '\t\t}', '\t}']));
put(mod, 'resource/set/breed/mp/ger/d.set', breed([...body('"mp_soldier"'), '\t\t{"speed" 1.0', '\t\t\t{"stealth"', '\t\t\t}', '\t\t}', ...drive, ...skills('lvl_4')], vet('1')));
put(mod, 'resource/set/breed/mp/ger/e.set', breed([...body('mp_soldier').slice(0, 10), '\t\t{"telescope"}', ...P('speed', '0.9'), ...drive, ...skills('lvl_4')], vet('elite')));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'breed', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
const rows = fs.readFileSync(tsv, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const kinds = k => rows.filter(x => x[3] === k).length;
ok(kinds('create') === 1 && kinds('include') === 5 && kinds('vet_macro') === 4 && kinds('perks_macro') === 4, `plan rows: create 1, include 5, vet 4, perks_macro 4 (${['create', 'include', 'vet_macro', 'perks_macro'].map(kinds)})`);
ok(rows.some(x => x[3] === 'CASE' && /breed_skills/.test(x[4]) && /c\.set/.test(x[6])), 'case: quoted melee keeps the skills literal (c.set)');
ok(rows.some(x => x[3] === 'CASE' && /veterancy block literal/.test(x[4]) && /c\.set/.test(x[6])), 'case: inline veterancy kept (c.set)');
ok(rows.some(x => x[3] === 'CASE' && /perks block as it is/.test(x[4]) && /d\.set/.test(x[6])), 'case: nested perk block kept (d.set)');
ok(rows.some(x => x[3] === 'CASE' && /breed_body/.test(x[4]) && /e\.set/.test(x[6])), 'case: telescope inside the body run keeps it literal (e.set)');

r = run('apply', mod, ...G, '--only', 'breed');
ok(r.rc === 0, 'apply rc 0');
const inc = get('resource/set/breed/breed_macros.inc');
ok(!/[^\r]\n/.test(inc) && /^; breed_body: .*\r\n;   health - [^\r]*\r\n(;[^\r]*\r\n)*\(define "breed_body"\r\n/m.test(inc) && inc.includes('\t\t("veterancy_%kind")'), 'breed_macros.inc: CRLF, header comments, breed_vet body');
const aWant = ['(include "/set/breed/breed_macros.inc")', '{breed', '\t{skin "ger-reg-pioneer"}', '\t{nationality ger}', '\t{perks',
  '\t\t("breed_body" health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.9))',
  '\t\t{"stealth"}', '\t\t("breed_drive" tank(0.75) vehicle(1) cannon(0.8))', '\t\t("breed_skills" pistol(4) smg(4) mgun(2) rifle(3) rocket(2) melee(4))',
  '\t\t{"tankgun" lvl_3}', '\t}', '\t("breed_vet" kind(1))', '\t{inventory', '\t\t{item "mp40" filled}', '\t}', '}', ''].join('\r\n');
ok(get('resource/set/breed/mp/ger/a.set') === aWant, 'a.set: exact output (optional perks between and after the calls)');
ok(get('resource/set/breed/mp/rus/b.set').includes('vision(mp_sniper) speed(1))') && get('resource/set/breed/mp/rus/b.set').includes('\t("breed_vet" kind(elite))\r\n'), 'b.set: bare vision passed as written, blank line in veterancy ok');
const c = get('resource/set/breed/mp/rus/c.set');
ok(c.includes('\t\t{"melee" "lvl_4"}\r\n') && c.includes('\t\t{"pistol" lvl_4}\r\n') && c.includes('{"lvl_1" 2'), 'c.set: skills one per line, inline veterancy kept');
ok(get('resource/set/breed/mp/ger/d.set').includes('\t\t{"speed" 1.0\r\n\t\t\t{"stealth"'), 'd.set: nested perk block untouched');

const vj = path.join(base, 'verify.json');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && /verify: PASS/.test(r.out) && vr.counts.SAME === vr.roots, `verify SAME (${vr.roots} roots; rus vet values differ from ger)`);

r = run('plan', mod, ...G, '--only', 'breed');
ok(/plan breed: 0 files, 0 rows/.test(r.out), 're-plan: 0 rows');

r = run('undo', mod, '--step', 'breed');
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte and deletes breed_macros.inc');

console.log(fails ? `FAIL ${fails}` : 'ok   breed PASS');
process.exitCode = fails ? 1 : 0;
