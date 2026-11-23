// GoH fixture: mini GoH game (binaries/x64/call_to_arms.exe, localizations/default/interface/text/*.pot) + a mod in mods/ and the
// same mod as a loose folder outside the game. Checks the .pot reader (GHLOC-06: key = msgctxt, fuzzy / no msgctxt = no text) and
// that loccover --exe goh reports LOC_FILE_REPLACED and LOC_DAMAGE_KEY from .pot keys. Exits 1 on a difference.
// Author: Imperator_Aug (ARSENAL, ia-3cc5825e)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { potKeys, check } = require('../loccover');
if (!process.env.TEST_WORK) { console.error('mkgoh: TEST_WORK not set (run.sh sets it); a direct run would write into the tracked test/fixture'); process.exit(2); }
const W = process.env.TEST_WORK;
const g = path.join(W, 'goh');
fs.rmSync(g, { recursive: true, force: true });
const put = (rel, text) => { const f = path.join(g, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, '\r\n')); };
const head = '#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n';
put('game/binaries/x64/call_to_arms.exe', '');
put('game/localizations/default/interface/text/desc/desc_x.pot', head +
  'msgctxt "desc/entity/Tank_A"\nmsgid "Tank A"\nmsgstr ""\n\nmsgctxt "desc/entity/tank_b"\nmsgid "Tank B"\nmsgstr ""\n\n' +
  '#, fuzzy\nmsgctxt "desc/entity/fuzzy_one"\nmsgid "Fz"\nmsgstr ""\n\nmsgid "no context"\nmsgstr ""\n');
put('game/resource/set/multiplayer/units/common.set', ';SDL\n{units\n\t{"tank_b"}\n}\n');   // vanilla card whose name key the mod .pot drops
const MOD = 'game/mods/m/';
put(MOD + 'mod.info', '{name "m"}\n');
put(MOD + 'localizations/default/interface/text/desc/desc_x.pot', head + 'msgctxt "desc/entity/tank_a"\nmsgid "Tank A"\nmsgstr ""\n');   // line 1: drops tank_b
put(MOD + 'resource/entity/test/t.def', ';SDL\n{game_entity\n\t{damage_report "x" "desc/entity/tank_a"}\n\t{damage_report "x" "desc/entity/fuzzy_one"}\n\t{damage_report "x" "desc/entity/tank_b"}\n}\n');

let bad = 0;
const eq = (what, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { bad++; console.log(`FAIL ${what}: ${a} want ${b}`); } else console.log('ok ' + what); };
// reader
const km = potKeys(fs.readFileSync(path.join(g, 'game/localizations/default/interface/text/desc/desc_x.pot')));
eq('potKeys keys', [...km.keys()], ['desc/entity/tank_a', 'desc/entity/tank_b']);
// mounted mod (folder under <game>/mods), --exe goh
const lines = rep => rep.toJSON().findings.map(f => `${f.file.replace(/\\/g, '/')}:${f.line} ${f.code}`).sort();
const r1 = check({ folder: path.join(g, MOD), exe: 'goh', noStuff: true });
eq('mounted mod findings', lines(r1.rep), [
  'localizations/default/interface/text/desc/desc_x.pot:1 LOC_FILE_REPLACED',
  'localizations/default/interface/text/desc/desc_x.pot:1 LOC_NAME_MISSING',   // the mod .pot that dropped the key, not localization/desc.lng
  'resource/entity/test/t.def:4 LOC_DAMAGE_KEY',
  'resource/entity/test/t.def:5 LOC_DAMAGE_KEY',
].sort());
// vfs pick: no --exe, the folder sits in a GoH install (call_to_arms.exe) -> same result
const r2 = check({ folder: path.join(g, MOD), noStuff: true });
eq('auto goh (no --exe) findings', lines(r2.rep), lines(r1.rep));
// as64 rules on the same mod: .pot is not text there -> the def's keys are all missing
const r3 = check({ folder: path.join(g, MOD), exe: 'as64', noStuff: true });
eq('as64 rules: .pot not read', lines(r3.rep).filter(x => /LOC_DAMAGE_KEY/.test(x)).length, 3);
// CLI: --exe goh accepted, --exe bogus refused
const cli = path.join(__dirname, '..', 'loccover.js');
const out = execFileSync(process.execPath, [cli, path.join(g, MOD), '--exe', 'goh', '-q', '--no-rc'], { encoding: 'utf8' }).toString();
if (!/LOC_DAMAGE_KEY/.test(out)) { bad++; console.log('FAIL cli --exe goh: ' + out); } else console.log('ok cli --exe goh');
try { execFileSync(process.execPath, [cli, path.join(g, MOD), '--exe', 'bogus'], { stdio: 'pipe' }); bad++; console.log('FAIL --exe bogus accepted'); }
catch (e) { if (e.status === 2 && /^loccover: --exe bogus/.test(String(e.stderr))) console.log('ok --exe bogus refused'); else { bad++; console.log('FAIL --exe bogus exit ' + e.status + ' ' + e.stderr); } }
// the same mod as a loose folder outside any game, --exe goh and no --game: the GoH install (here GOH_GAME = the fixture game) is the base
const LOOSE = path.join(g, 'loose', 'm');
fs.cpSync(path.join(g, MOD), LOOSE, { recursive: true });
const env = Object.assign({}, process.env, { GOH_GAME: path.join(g, 'game') });
const out2 = execFileSync(process.execPath, [cli, LOOSE, '--exe', 'goh', '-q', '--no-rc'], { encoding: 'utf8', env }).toString();
if (!/LOC_FILE_REPLACED/.test(out2) || !/LOC_NAME_MISSING/.test(out2)) { bad++; console.log('FAIL loose folder --exe goh, no --game: install not read: ' + out2); } else console.log('ok loose folder --exe goh reads the GoH install');
// a mod folder in another game's mods/ (here a made-up AS2 game) is not mounted by id into the GoH vfs: its own text is still read
put('as2/mowas_2.exe', '');
fs.cpSync(path.join(g, MOD), path.join(g, 'as2', 'mods', 'm'), { recursive: true });
const out3 = execFileSync(process.execPath, [cli, path.join(g, 'as2', 'mods', 'm'), '--exe', 'goh', '--game', path.join(g, 'game'), '-q', '--no-rc'], { encoding: 'utf8' }).toString();
if (!/LOC_FILE_REPLACED/.test(out3)) { bad++; console.log('FAIL other game mods/ folder: ' + out3); } else console.log('ok other game mods/ folder linted as a loose folder');
// a mod with only localizations/rus/ text, --lang rus: the dropped key names that rus file, not a default file the mod lacks
const RUS = path.join(g, 'loose', 'rus');
put('loose/rus/localizations/rus/interface/text/desc/desc_x.pot', head + 'msgctxt "desc/entity/tank_a"\nmsgid "Tank A"\nmsgstr ""\n');
const r4 = check({ folder: RUS, gameDir: path.join(g, 'game'), exe: 'goh', lang: 'rus', noStuff: true });
eq('--lang rus: findings name the rus file', lines(r4.rep), [
  'localizations/rus/interface/text/desc/desc_x.pot:1 LOC_FILE_REPLACED',
  'localizations/rus/interface/text/desc/desc_x.pot:1 LOC_NAME_MISSING',
]);
// default and rus both in the mod: --lang rus wins
put('loose/rus/localizations/default/interface/text/desc/desc_x.pot', head + 'msgctxt "desc/entity/tank_a"\nmsgid "Tank A"\nmsgstr ""\n\nmsgctxt "desc/entity/tank_b"\nmsgid "B"\nmsgstr ""\n');
const r5 = check({ folder: RUS, gameDir: path.join(g, 'game'), exe: 'goh', lang: 'rus', noStuff: true });
eq('--lang rus over default', lines(r5.rep).filter(x => /LOC_FILE_REPLACED/.test(x)), ['localizations/rus/interface/text/desc/desc_x.pot:1 LOC_FILE_REPLACED']);
eq('no --lang: default file, keeps tank_b', lines(check({ folder: RUS, gameDir: path.join(g, 'game'), exe: 'goh', noStuff: true }).rep), []);
// GoH words: the damage key line, the trailer and the empty-folder line say text file / .pot
const dk = r1.rep.toJSON().findings.find(f => f.code === 'LOC_DAMAGE_KEY');
eq('LOC_DAMAGE_KEY says text file', /not defined in any text file/.test(dk && dk.msg || dk && dk.message || ''), true);
eq('trailer says text files', /\d+ text files/.test(out), true);
const EMP = path.join(g, 'loose', 'empty'); fs.mkdirSync(path.join(EMP, 'resource'), { recursive: true });
const re = require('child_process').spawnSync(process.execPath, [cli, EMP, '--exe', 'goh', '--game', path.join(g, 'game'), '-q', '--no-rc'], { encoding: 'utf8' });
eq('empty folder line names .pot', /no mod text file read \(\.pot\/\.po under localizations/.test(re.stderr), true);
process.exit(bad ? 1 : 0);
