// PORTREV: seeded tests for the rev-port fixes (#2 translate none-mode, #3 GoH-origin ledger, #5 SKILL_KINDS + merge, #6 scale default,
// #11 --keys normalisation, gohfix gap resupply defines). Invented fixtures; each check has a seeded-defect twin. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-82954c9b)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const TR = require('../translate.js'), S = require('../stuffport.js'), G = require('../goh2as2.js'), O = require('../origin.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'portrev: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 400))); if (!good) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portrev-'));

// ---- #2 translate: a class row with mode none must not crash, the donor value stays, WARN_XL_NO_FACTOR
const T = TR.loadTable();
t('usable: none/missing are not usable, const is', !TR.usable({ mode: 'none' }) && !TR.usable(undefined) && TR.usable({ mode: 'const', value: 1 }));
t('predict: none -> null, copy -> value', TR.predict({ mode: 'none' }, 5) === null && TR.predict({ mode: 'copy' }, 5) === 5);
t('pickClass: trailer (speed none) falls to the donor class car', TR.pickClass(T, 'trailer', 'car') === 'car');
t('seeded defect: pickClass with two none classes -> null', TR.pickClass(T, 'trailer', 'special') === null);
const adds = [], infos = [];
let xr, err = null;
try {
  xr = TR.translate({
    text: '{game_entity\r\n\t{Locomotion\r\n\t\t{MaxSpeed 30}\r\n\t\t{TurnTime 2}\r\n\t}\r\n\t{mass 900}\r\n}\r\n', repAll: '', repKey: 'entity/-vehicle/ger/trailer/x/x.def',
    donorKey: 'resource/entity/-vehicle/car/x/x.def', vf: { files: new Map() }, vfsLib: { readRec: () => Buffer.from('') }, types: new Map(), unit: 'x',
    opt: { ask: 'off', answers: {} }, extract: () => ({ k: { speed: 25, turn_time: 4, mass: 800 } }),
    add: (c, m) => adds.push(c + ' ' + m), info: (c, m) => infos.push(c + ' ' + m),
  });
} catch (e) { err = e; }
t('translate: car turn_time mode none does not crash', !err, err && err.stack);
t('translate: none row -> WARN_XL_NO_FACTOR, TurnTime donor value kept', !err && adds.some(a => /^WARN_XL_NO_FACTOR turn_time/.test(a)) && /\{TurnTime 2\}/.test(xr.text), JSON.stringify({ adds, text: xr && xr.text }));

// ---- #5 SKILL_KINDS: veterancy / specialvision accepted, medic refused; merge keeps the AS2 blocks the GoH file lacks
const vet = n => `{"lvl_${n}" from veterancy\n\t{level "1" {default {accuracy 0.${n}}}}\n}\n`;
const as2Ab = new Map([['set/ability/veterancy.set', vet(1) + '\n' + vet(2) + '\n' + vet(3)]]);
let sk = S.portSkill('{"lvl_2" from Veterancy\n\t{level "1" {default {accuracy 0.9}}}\n}\n', as2Ab, []);
t('skill: veterancy kind accepted (case-insensitive)', sk.outs.length === 1 && !sk.log.some(l => l.code === 'WARN_SP_SKILL_KIND'), JSON.stringify(sk.log));
t('skill: merge replaces lvl_2 in place, keeps lvl_1 and lvl_3', sk.outs[0] && /"lvl_1"/.test(sk.outs[0].text) && /"lvl_3"/.test(sk.outs[0].text) && /accuracy 0\.9/.test(sk.outs[0].text) && !/accuracy 0\.2/.test(sk.outs[0].text) && sk.log.some(l => l.code === 'SP_SKILL_KEEP'), sk.outs[0] && sk.outs[0].text);
sk = S.portSkill('{"nv" from specialvision {level "1" {default {range 10}}}}', new Map(), []);
t('skill: specialvision kind accepted', sk.outs.length === 1, JSON.stringify(sk.log));
sk = S.portSkill('{"doc" from medic {level "1" {default {heal 1}}}}', new Map(), []);
t('seeded defect: medic (id, no prototype) refused', sk.outs.length === 0 && sk.log.some(l => l.code === 'WARN_SP_SKILL_KIND' && /no prototype/.test(l.msg)), JSON.stringify(sk.log));
t('SKILL_KINDS has no medic, SKILL_NO_PROTO has it', !S.SKILL_KINDS.includes('medic') && S.SKILL_NO_PROTO.includes('medic'));

// ---- gohfix gap: resupply.inc -> resupply_generic.inc drops supply_ammo; call mapped, unknown define commented, comments untouched
const gohDefs = G.definesOf('(define "supply_ammo" {a %supply})\r\n(define "supply_medic" {b})\r\n(define "truck_ammo" {c})');
const as2Defs = G.definesOf('(define "para_ammo" {x})\r\n(define "truck_ammo" {y})\r\n(define "truck_ammo_art" {z})');
const src = '{extender "inventory"\r\n\t("supply_ammo" supply(500))\r\n\t("supply_medic")\r\n\t("truck_ammo")\r\n\t; ("supply_ammo" supply(1))\r\n}\r\n';
const fx = G.fixRenamedDefines(src, [{ goh: 'resupply.inc', as2: 'resupply_generic.inc', gohDefs, as2Defs }]);
t('supply_ammo supply(500) -> ("para_ammo")', /\t\("para_ammo"\)\r\n/.test(fx.text) && !/\t\("supply_ammo"/.test(fx.text), fx.text);
t('supply_medic (no AS2 twin) commented out on its own line', /\t; \("supply_medic"\) ; PORTREV: define not in AS2 resupply_generic\.inc\r\n/.test(fx.text), fx.text);
t('truck_ammo (both sides) kept; commented call untouched', /\t\("truck_ammo"\)/.test(fx.text) && /; \("supply_ammo" supply\(1\)\)/.test(fx.text) && fx.fixes.length === 2, JSON.stringify(fx.fixes));
t('seeded defect: no AS2 defines (no --game) -> nothing changed', G.fixRenamedDefines(src, [{ goh: 'resupply.inc', as2: 'resupply_generic.inc', gohDefs, as2Defs: null }]).text === src);

// ---- #3 GoH-origin ledger
const mod = path.join(tmp, 'mod');
fs.mkdirSync(path.join(mod, 'resource'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'a.def'), 'x');
const lp = O.record(mod, [{ file: path.join(mod, 'resource', 'a.def'), tool: 'goh2as2', src: 'entity/a.def' }, { file: 'resource/b.def', buf: Buffer.from('y'), tool: 't', src: 'b' }]);
const L = O.read(mod), raw = fs.readFileSync(lp, 'latin1');
t('ledger: two rows, sha1 of x, CRLF', L.size === 2 && L.get('resource/a.def').sha1 === '11f6ad8ec52a2984abaafd7c3b516503785c2072' && /\r\n/.test(raw) && !/[^\r]\n/.test(raw), raw);
t('seeded defect: a path outside the mod is not recorded; no rows -> null', O.record(mod, [{ file: path.join(tmp, 'out.def'), buf: Buffer.from('z') }]) && O.read(mod).size === 2 && O.record(mod, []) === null);

// ---- #3 + #11 via the CLI on the run.sh fixture: --keys with Windows-style keys, ledger written
const fx0 = path.join(__dirname, 'fixture', 'goh'), keys = path.join(tmp, 'keys.txt'), out = path.join(tmp, 'out');
fs.writeFileSync(keys, 'Resource\\Set\\Vision.set\r\n');
const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' }); delete env.AS2_GAME;
const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'goh2as2.js'), '--goh', fx0, '--keys', keys, '--out', out, '--no-keylint', '--no-rc', '-q'], { encoding: 'utf8', env });
t('--keys: "Resource\\Set\\Vision.set" -> resource/set/vision.set written', fs.existsSync(path.join(out, 'resource', 'set', 'vision.set')), r.stdout + r.stderr);
t('ledger: goh2as2 writes GOH-ORIGIN.tsv listing the ported file', O.read(out).has('resource/set/vision.set'), [...O.read(out).keys()].join(','));
t('#4: no AS2 dir -> WARN_PORT_NO_GAME on stderr', /WARN_PORT_NO_GAME/.test(r.stderr), r.stderr);
const r2 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'goh2as2.js'), '--goh', fx0, '--keys', keys, '--out', out, '--game', tmp, '--no-game', '-q'], { encoding: 'utf8', env });
t('seeded defect: --game with --no-game refused', r2.status !== 0, r2.status);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `portrev: ${fail} FAIL` : 'portrev: all ok');
process.exit(fail ? 1 : 0);
