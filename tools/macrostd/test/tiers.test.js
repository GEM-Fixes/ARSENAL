// macrostd step tiers regression: fixture game + mod with post-breed-step soldier breeds in two sides. Checks plan rows, the created
//   breed_tiers.inc (header table, define headers, CRLF), the include line in breed_macros.inc, tier names (cross-faction map name,
//   faction value name), a moved trailing comment, rare sets left explicit with outline rows (values / text only), a breed without
//   the breed_macros include left alone, verify SAME, re-plan 0 change rows, re-run renames an old tier name and expands a tier
//   that is no longer used enough, undo restores every byte. Prints ok/FAIL lines, exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-4a424865)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite');
const { walkFiles, relPath } = require('../../lib/report');
const breedStep = require('../steps/breed');
const TOOL = path.join(__dirname, '..', 'macrostd.js');

const base = require('../../lib/platform').tmpDir('tiers/test');
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
const tsvRows = f => fs.readFileSync(f, 'latin1').split('\r\n').slice(1).filter(Boolean).map(l => l.split('\t'));

fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [['properties/vanilla.inc', L('(define "armor_light" {armor %0})')]]);

const REG = 'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.9)';     // map: body_regular
const REG_BARE = 'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision(mp_soldier) speed(0.9)';
const TOUGH = 'health(275%) regen_health(100%) stamina(150%) regen_stamina(100%) vision("mp_soldier") speed(0.9)';   // ger only -> value name
const RARE = 'health(150%) regen_health(100%) stamina(125%) regen_stamina(100%) vision("mp_soldier") speed(0.9)';
const DRV = 'tank(0.75) vehicle(1) cannon(0.8)', SK = 'pistol(4) smg(4) mgun(2) rifle(3) rocket(2) melee(4)';
const breed = (b, d, s, opt = {}) => L(...(opt.noInc ? [] : ['(include "/set/breed/breed_macros.inc")']), '{breed', '\t{skin "ger-reg-pioneer"}', '\t{perks',
  `\t\t("breed_body" ${b})${opt.cmt || ''}`, `\t\t("breed_drive" ${d})`, `\t\t("breed_skills" ${s})`, ...(opt.extra || []), '\t}', '\t("breed_vet" kind(1))', '}');

put(mod, 'mod.info', L('{name "fixture"}'));
put(mod, 'resource/set/breed/breed_macros.inc', Buffer.from(breedStep.macroFile('\r\n'), 'latin1'));
for (const side of ['ger', 'rus']) put(mod, `resource/set/breed/mp/${side}/veterancy_generic.inc`, L('(define "veterancy_1"', '\t{"lvl_1" 24}', ')'));
put(mod, 'resource/set/breed/mp/ger/r1.set', breed(REG, DRV, SK, { cmt: ' ; line infantry', extra: ['\t\t{"stealth"}'] }));
put(mod, 'resource/set/breed/mp/ger/r2.set', breed(REG, DRV, SK));
put(mod, 'resource/set/breed/mp/rus/r3.set', breed(REG, DRV, SK));
put(mod, 'resource/set/breed/mp/rus/r4.set', breed(REG, DRV, 'pistol(1) smg(1) mgun(1) rifle(1) rocket(1) melee(1)'));
for (let i = 1; i <= 4; i++) put(mod, `resource/set/breed/mp/ger/t${i}.set`, breed(TOUGH, DRV, SK));
put(mod, 'resource/set/breed/mp/ger/rare.set', breed(RARE, DRV, SK));
put(mod, 'resource/set/breed/mp/rus/bare.set', breed(REG_BARE, DRV, SK));
put(mod, 'resource/set/breed/mp/rus/noinc.set', breed(REG, DRV, SK, { noInc: true }).toString('latin1').replace('{breed', '(include "veterancy_generic.inc")\r\n{breed').replace('\t("breed_vet" kind(1))\r\n', ''));
fs.cpSync(mod, before, { recursive: true });
const h0 = hashTree(mod);

const tsv = path.join(base, 'plan.tsv');
let r = run('plan', mod, ...G, '--only', 'tiers', '--tsv', tsv);
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'plan writes nothing');
let rows = tsvRows(tsv);
const kinds = k => rows.filter(x => x[3] === k).length;
// body_regular 4 + body_ger_h275_s150 4 + drive 10 + skills 9 (SK used by 9 of the 10 included breeds)
ok(kinds('create') === 1 && kinds('include') === 1 && kinds('tier_call') === 27, `plan rows: create 1, include 1, tier_call 27 (${['create', 'include', 'tier_call'].map(kinds)})`);
const out = rows.filter(x => x[3] === 'outline');
ok(out.length === 3, `outline rows 3 (${out.length})`);
ok(out.some(x => /rare\.set/.test(x[1]) && /body near body_regular \(4 breeds\)/.test(x[4]) && x[5] === 'stamina 125% vs 100%' && x[6] === 'values'), 'outline: rare.set body 1 value from body_regular');
ok(out.some(x => /bare\.set/.test(x[1]) && /vision mp_soldier vs "mp_soldier" \(text only, same number\)/.test(x[5]) && /^text only/.test(x[6])), 'outline: bare.set body text only');
ok(out.some(x => /r4\.set/.test(x[1]) && /^skills near skills_4_4_2_3_2_4/.test(x[4]) && /no tier within 2 values/.test(x[5])), 'outline: r4.set skills far');
ok(rows.some(x => x[3] === 'CASE' && /quoting or number form/.test(x[4]) && /body_regular x4/.test(x[6]) && /explicit x1/.test(x[6])), 'case: twin sets listed (body_regular vs bare vision)');
ok(!rows.some(x => /noinc\.set/.test(x[1])), 'breed without the breed_macros include left alone');

r = run('apply', mod, ...G, '--only', 'tiers');
ok(r.rc === 0, 'apply rc 0');
const inc = get('resource/set/breed/breed_tiers.inc');
ok(!/[^\r]\n/.test(inc) && /; body tiers, breed_body: .*\r\n;   tier +values +breeds +sides +typical users[^\r]*\r\n;   body_regular +health\(150%\)[^\r]* 4 +2 +r 4\r\n;   body_ger_h275_s150 /.test(inc), 'breed_tiers.inc: CRLF, table weakest first (body_regular 4 breeds 2 sides, then body_ger_h275_s150)');
ok(inc.includes('; body_regular: breed_body tier, health 150%, regen_health 100%, stamina 100%, regen_stamina 100%, vision "mp_soldier", speed 0.9\r\n;   e.g. ("body_regular")\r\n(define "body_regular"\r\n\t("breed_body" ' + REG + ')\r\n)\r\n'), 'define header + body');
ok(/^; breed_macros\.inc[^\r]*\r\n(;[^\r]*\r\n)*\(include "\/set\/breed\/breed_tiers\.inc"\)\r\n\r\n; breed_body/.test(get('resource/set/breed/breed_macros.inc')), 'breed_macros.inc: include after the header comment');
ok(get('resource/set/breed/mp/ger/r1.set') === ['(include "/set/breed/breed_macros.inc")', '{breed', '\t{skin "ger-reg-pioneer"}', '\t{perks',
  '\t\t("body_regular") ; line infantry', '\t\t("drive_regular")', '\t\t("skills_4_4_2_3_2_4")', '\t\t{"stealth"}', '\t}', '\t("breed_vet" kind(1))', '}', ''].join('\r\n'), 'r1.set: exact output (comment kept, extra perk literal)');
ok(get('resource/set/breed/mp/ger/t1.set').includes('\t\t("body_ger_h275_s150")\r\n') && get('resource/set/breed/mp/ger/rare.set').includes('("breed_body" ' + RARE + ')'), 't1: one-faction value name; rare: explicit');

const vj = path.join(base, 'verify.json');
r = run('verify', mod, ...G, '--before', before, '--json', vj);
const vr = JSON.parse(fs.readFileSync(vj, 'utf8'));
ok(r.rc === 0 && /verify: PASS/.test(r.out) && vr.counts.SAME === vr.roots && Object.keys(vr.counts).every(k => k === 'SAME' || k === 'NEW_FILE'), `verify SAME (${vr.roots} roots, ${JSON.stringify(vr.counts)})`);

r = run('plan', mod, ...G, '--only', 'tiers', '--tsv', tsv);
rows = tsvRows(tsv);
ok(rows.filter(x => x[3] !== 'outline' && x[3] !== 'CASE').length === 0 && kinds('outline') === 3, 're-plan: 0 change rows (3 outline rows stay)');

// re-run: an old tier name is renamed to the map name; a tier written for a rare set is expanded back
const applied = hashTree(mod);
const sub = (rel, a, b) => put(mod, rel, Buffer.from(get(rel).split(a).join(b), 'latin1'));
sub('resource/set/breed/breed_tiers.inc', '"body_regular"', '"body_old"');
for (const f of ['ger/r1', 'ger/r2', 'rus/r3', 'rus/r4']) sub(`resource/set/breed/mp/${f}.set`, '("body_regular")', '("body_old")');
sub('resource/set/breed/breed_tiers.inc', '(define "body_old"', `(define "body_rare"\r\n\t("breed_body" ${RARE})\r\n)\r\n(define "body_old"`);
sub('resource/set/breed/mp/ger/rare.set', `("breed_body" ${RARE})`, '("body_rare")');
r = run('apply', mod, ...G, '--only', 'tiers', '--tsv', tsv, '--undo', path.join(base, 'undo2'));
rows = tsvRows(tsv);
ok(kinds('tier_rename') === 4 && kinds('tier_expand') === 1 && kinds('rewrite') === 1, `re-run: 4 renames, 1 expand, inc rewritten (${['tier_rename', 'tier_expand', 'rewrite'].map(kinds)})`);
ok(sameTree(applied, hashTree(mod)), 're-run gives the same files as the first apply');

r = run('undo', mod, '--step', 'tiers');
ok(r.rc === 0 && sameTree(h0, hashTree(mod)), 'undo restores every byte and deletes breed_tiers.inc');

console.log(fails ? `FAIL ${fails}` : 'ok   tiers PASS');
process.exitCode = fails ? 1 : 0;
