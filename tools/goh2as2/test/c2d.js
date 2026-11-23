// Author: Imperator_Aug (ARSENAL, ia-313aa4de)
// C2d (MB-R13 port fixes): seeded tests. (1) --mod writes localization/#goh2as2_names.lng with desc/entity/<unit>, --no-names writes none;
// (2) crew places + cap (crewPlaces, crewCap, translate WARN_PORT_CREW_CAPPED) and entity redefinition by a <t>.unfit.def side copy (WARN_PORT_ENTITY_REDEF).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const TR = require('../translate.js'), G = require('../goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'c2d: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 500))); if (!good) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c2d-'));
const d = __dirname, gtool = path.join(d, '..', 'goh2as2.js'), gohFx = path.join(d, 'fixture', 'goh');
const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' }); delete env.AS2_GAME;
const run = args => cp.spawnSync(process.execPath, [gtool, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
if (!fs.existsSync(gohFx)) cp.spawnSync(process.execPath, [path.join(d, 'mkfixture.js')], { stdio: 'inherit' });

// ---- (1) unit names
const m1 = path.join(tmp, 'mods', 'names_t');
const r1 = run(['--goh', gohFx, '--entity', 'tank', '--mod', m1, '--no-game', '--no-keylint', '--no-rc']);
const lng = path.join(m1, 'localization', '#goh2as2_names.lng');
const lt = fs.existsSync(lng) ? fs.readFileSync(lng, 'utf8') : '';
t('--mod writes #goh2as2_names.lng', !!lt, r1.stdout + r1.stderr);
t('names file holds desc/entity tank, CRLF', /\{"desc"\r\n\t\t\{"entity"\r\n\t\t\t\{"tank" "[^"]+"\}/.test(lt), JSON.stringify(lt));
t('summary line names the stage', /unit names \(C2d\): 1 unit/.test(r1.stdout), r1.stdout.slice(-600));
t('a name from the key is info, not a finding', /info: .*PORT_UNIT_NAME_FALLBACK/.test(r1.stdout) && !/^\S+: PORT_UNIT_NAME_FALLBACK/m.test(r1.stdout), r1.stdout.slice(-900));
const m2 = path.join(tmp, 'mods', 'nonames_t');
run(['--goh', gohFx, '--entity', 'tank', '--mod', m2, '--no-game', '--no-keylint', '--no-rc', '--no-names']);
t('seeded: --no-names writes no names file', fs.existsSync(path.join(m2, 'mod.info')) && !fs.existsSync(path.join(m2, 'localization')));
const o3 = path.join(tmp, 'plainout');
run(['--goh', gohFx, '--entity', 'tank', '--out', o3, '--no-game', '--no-keylint', '--no-rc']);
t('plain --out (no --mod/--donor) writes no names file', !fs.existsSync(path.join(o3, 'localization')));

// ---- (2a) entity redefinition: a <t>.unfit.def side copy next to <t>.def
const m4 = path.join(tmp, 'mods', 'redef_t'), zz = path.join(m4, 'resource', 'entity', 'zz');
fs.mkdirSync(zz, { recursive: true });
fs.writeFileSync(path.join(zz, 'zz.def'), '{game_entity\r\n}\r\n'); fs.writeFileSync(path.join(zz, 'zz.unfit.def'), '{game_entity\r\n}\r\n');
fs.mkdirSync(path.join(m4, 'resource', 'entity', '-vehicle', 'car', 'yy'), { recursive: true });
fs.writeFileSync(path.join(m4, 'resource', 'entity', '-vehicle', 'car', 'yy', 'yy.def'), '{game_entity\r\n}\r\n');
fs.mkdirSync(path.join(m4, 'resource', 'entity', 'yy'), { recursive: true }); fs.writeFileSync(path.join(m4, 'resource', 'entity', 'yy', 'yy.def'), '{game_entity\r\n}\r\n');
const rd = G.entityRedefs(path.join(m4, 'resource', 'entity'));
t('entityRedefs: side copy named, plain def kept', rd.some(x => x.file === 'resource/entity/zz/zz.unfit.def' && x.other === 'resource/entity/zz/zz.def'), JSON.stringify(rd));
t('entityRedefs: same title in two folders (one under -vehicle)', rd.some(x => x.title === 'yy'), JSON.stringify(rd));
t('entityRedefs: tank alone is clean', G.entityRedefs(path.join(m1, 'resource', 'entity')).length === 0);
const r4 = run(['--goh', gohFx, '--entity', 'tank', '--mod', m4, '--no-game', '--no-keylint', '--no-rc', '--no-names']);
t('seeded: --mod into a mod with zz.unfit.def -> WARN_PORT_ENTITY_REDEF', /resource\/entity\/zz\/zz\.unfit\.def: WARN_PORT_ENTITY_REDEF entity "zz"/.test(r4.stdout), r4.stdout.slice(-900));

// ---- (2b) crew places and cap
const stag = ['{placer', '\t{place "driver" {visor "driver"}}', '\t{place "gunner" {visor "main"}}', '\t{place "commander" {visor "main"}}', '}',
  '("crew_human_inside"\tplace(driver)\t\tdoor(emit0)\tanimation(driver)\tgroup(crew))',
  '("crew_human"\t\t\tplace(gunner)\t\tdoor(emit0)\tbone(gunner)\tanimation(gunner)\tgroup(crew))',
  '("crew_human"\t\t\tplace(commander)\tdoor(emit1)\tbone(gunner2)\tanimation(commander)\tgroup(crew))'].join('\r\n');
const pl = TR.crewPlaces(stag);
t('crewPlaces: staghound crew.ext -> 3 (driver, gunner, commander)', pl.n === 3 && pl.names.join() === 'driver,gunner,commander', JSON.stringify(pl));
t('crewPlaces: crew_4_human macro + one crew_human_visible -> 5', TR.crewPlaces('("crew_4_human")\r\n("crew_human_visible" place(mg) door(emit3))').n === 5);
t('crewPlaces: define bodies are not places', TR.crewPlaces('(define "crew_human"\r\n {placer {place "%place"}})').n === 0);
const bones = new Map([['emit1', ''], ['emit2', '']]);
t('crewCap: doors present -> GoH count', TR.crewCap(4, 3, false, bones) === 4);
t('seeded: crewCap: crew_4_human_extended needs emit0, mdl lacks it -> donor count', TR.crewCap(4, 3, true, bones) === 3);
t('crewCap: unknown mdl bones -> GoH count', TR.crewCap(4, 3, true, null) === 4);
// translate end to end: GoH crew 4 (crew_4_human), donor keeps 3 places in its crew.ext -> WARN_PORT_CREW_CAPPED, places 3
const crewKey = 'resource/entity/-vehicle/car/x/crew.ext';
const xl = (text, repAll, types, files) => { const adds = [], infos = []; let r, err = null; try { r = TR.translate({
  text, repAll, repKey: 'entity/-vehicle/uk/car/x/x.def', donorKey: 'resource/entity/-vehicle/car/x/x.def', vf: { files }, vfsLib: { readRec: b => Buffer.from(b) }, types, unit: 'x',
  opt: { ask: 'off', answers: {} }, extract: () => ({ k: {} }), add: (c, m) => adds.push(c + ' ' + m), info: (c, m) => infos.push(c + ' ' + m) }); } catch (e) { err = e; }
  return { r, err, adds }; };
const x1 = xl('{game_entity\r\n\t{extension "crew.ext"}\r\n}\r\n', '{game_entity\r\n\t("crew_4_human")\r\n}\r\n', new Map(), new Map([[crewKey, stag]]));
t('translate: GoH crew 4 on a 3-place donor -> WARN_PORT_CREW_CAPPED, places 3', !x1.err && x1.r.crew.places === 3 && x1.adds.some(a => /^WARN_PORT_CREW_CAPPED GoH crew 4, the port has 3 crew place\(s\) \(driver, gunner, commander\)/.test(a)), x1.err ? x1.err.stack : JSON.stringify(x1.adds));
const x2 = xl('{game_entity\r\n\t("crew_3_human")\r\n}\r\n', '{game_entity\r\n\t("crew_4_human")\r\n}\r\n', new Map([['emit1', '']]), new Map());
t('seeded: translate: crew_3 -> crew_4 on an mdl without emit2 stays crew_3, capped', !x2.err && /\("crew_3_human"\)/.test(x2.r.text) && x2.adds.some(a => /^WARN_PORT_CREW_CAPPED .*emit2.*capped at 3/.test(a)), x2.err ? x2.err.stack : JSON.stringify({ a: x2.adds, t: x2.r.text }));
const x3 = xl('{game_entity\r\n\t("crew_3_human")\r\n}\r\n', '{game_entity\r\n\t("crew_4_human")\r\n}\r\n', bones, new Map());
t('translate: crew_3 -> crew_4 with the doors present is written, no cap', !x3.err && /\("crew_4_human"\)/.test(x3.r.text) && !x3.adds.some(a => /CREW_CAPPED/.test(a)), x3.err ? x3.err.stack : JSON.stringify({ a: x3.adds, t: x3.r.text }));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `c2d: ${fail} FAIL` : 'c2d: all ok');
process.exit(fail ? 1 : 0);
