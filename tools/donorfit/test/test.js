// donorfit test: invented fixture (test/fixture). seeded variants of ok.def are written to a temp dir, one miss each.
// run: sh tools/donorfit/test/run.sh
// Author: Imperator_Aug (ARSENAL, ia-14991f98)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const fx = path.join(__dirname, 'fixture'), game = path.join(fx, 'game'), tool = path.join(__dirname, '..', 'donorfit.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'donorfit-'));
fs.copyFileSync(path.join(fx, 'ok.mdl'), path.join(tmp, 'ok.mdl'));
const ok = fs.readFileSync(path.join(fx, 'ok.def'), 'latin1').replace(/\r\n/g, '\n');   // LF whatever the checkout gives (core.autocrlf): the seeds below match \n
const variants = [
  // name, replace [from,to], expected miss key + name (null = clean)
  ['clean', null, null],
  ['volume', ['{volume "turret1"', '{volume "turret9"'], ['volume', 'turret9']],
  ['bone-block', ['{bone "turret"', '{bone "turret_x"'], ['bone-block', 'turret_x']],
  ['foresight', ['{foresight "foresight1"', '{foresight "foresight5"'], ['foresight', 'foresight5']],
  ['linkbone', ['{LinkBone "mgun_rot"', '{LinkBone "mgun_rot2"'], ['LinkBone', 'mgun_rot2']],
  ['seat', ['b(seat01)', 'b(seat09)'], ['LinkBone', 'seat09']],
  // T-DONORFIT SEED: a weapon place with no {LinkBone} sits on the mdl bone of its own name; the mdl has no "gun" bone (G-DONORSPAWN: pz4h places mgun/mgun1/mgun2 on a GoH mdl)
  ['place-bone', ['\t\t\t{LinkBone "mgun_rot"}\n', ''], ['DF_BONE_MISSING', 'gun']],
  ['macro-door', null, ['door', 'emit0']],            // mdl without emit0 (see below)
  ['crew-place', ['{gunner "gunner"}', '{gunner "gunner9"}'], ['crew-place', 'gunner9']],
  // FMT-05: {limits}/{speed} under a def bone whose mdl bone is plain = DF_PLAIN_BONE. A bare {limits} on a revolute bone is legal (and turret also has an untyped {Bone} inside a {Volume}, which must not hide its type)
  ['plain-speed', ['{bone "turret"', '{bone "body"\n\t\t{speed 0.1}\n\t}\n\t{bone "turret"'], ['DF_PLAIN_BONE', 'body']],
  ['plain-basis-limits', ['{bone "turret"', '{bone "basis"\n\t\t{limits}\n\t}\n\t{bone "turret"'], ['DF_PLAIN_BONE', 'basis']],
  ['bare-limits-revolute', ['{speed 0.0065}', '{limits}\n\t\t{speed 0.0065}'], null],
  // PORT-129: Extension ending .mdl wins over an earlier {extension "x.ext"}; the .ext's doors are checked like the def's
  ['ext-first-crew', ['{Extension "ok.mdl"}', '{extension "crew.ext"}\n\t{Extension "ok.mdl"}'], ['door', 'emit7'], { 'crew.ext': ';SDL\n{boarder\n\t{door "emit7"}\n}\n{placer\n\t{place "extra"}\n}\n' }],
];
let fail = 0;
function run(name, defText, mdlName, expect, extra) {
  const d = path.join(tmp, name); fs.mkdirSync(d);
  for (const [f, txt] of Object.entries(extra || {})) fs.writeFileSync(path.join(d, f), txt);
  fs.writeFileSync(path.join(d, name + '.def'), defText.replace('"ok.mdl"', '"' + mdlName + '"'));
  fs.copyFileSync(path.join(tmp, mdlName), path.join(d, mdlName));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, name + '.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL ' + name + ': no json: ' + r.stdout + r.stderr); fail++; return; }
  const got = j.misses.map(m => m.key + ':' + m.name);
  let good;
  if (!expect) good = r.status === 0 && got.length === 0 && j.complete && j.warnings.length === 0;
  else good = r.status === 1 && got.length === 1 && got[0] === expect[0] + ':' + expect[1];
  console.log((good ? 'ok   ' : 'FAIL ') + name + '  exit ' + r.status + '  ' + (got.join(',') || 'no miss') + (expect ? '  want ' + expect.join(':') : ''));
  if (!good) { fail++; if (j.unresolved && j.unresolved.length) console.log(JSON.stringify(j.unresolved)); }
  // macro column must name the macro for macro-born misses
  if (good && (name === 'macro-door' || name === 'seat')) {
    const m = j.misses[0].macro; const want = { 'macro-door': 'f_door', seat: 'f_seat' }[name];
    if (!m || !m.split(' < ').includes(want)) { console.log('FAIL ' + name + ': macro column "' + m + '" lacks ' + want); fail++; }
  }
}
// macro-door: same def, mdl lacking emit0
fs.writeFileSync(path.join(tmp, 'noemit0.mdl'), fs.readFileSync(path.join(fx, 'ok.mdl'), 'latin1').replace('{bone "emit0"}', ''));
for (const [name, rep, expect, extra] of variants) {
  const text = rep ? ok.replace(rep[0], rep[1]) : ok;
  if (rep && text === ok) { console.log('FAIL ' + name + ': replace did not apply'); fail++; continue; }
  run(name, text, name === 'macro-door' ? 'noemit0.mdl' : 'ok.mdl', expect, extra);
}
// PORT-128: same missing door on a gun (PatherID cannon.*) is a lead: exit 0, no miss, one lead
{
  const name = 'gun-door-lead', d = path.join(tmp, name); fs.mkdirSync(d);
  const t = ok.replace('{Extension "ok.mdl"}', '{PatherID "cannon.small"}\n\t{Extension "noemit0.mdl"}');
  fs.writeFileSync(path.join(d, name + '.def'), t);
  fs.copyFileSync(path.join(tmp, 'noemit0.mdl'), path.join(d, 'noemit0.mdl'));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, name + '.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  const good = r.status === 0 && j.misses.length === 0 && j.leads.length === 1 && j.leads[0].key === 'door' && j.leads[0].name === 'emit0' && j.gun === true;
  console.log((good ? 'ok   ' : 'FAIL ') + name + '  exit ' + r.status + '  leads ' + j.leads.map(m => m.key + ':' + m.name).join(',')); if (!good) fail++;
  const out = cp.spawnSync(process.execPath, [tool, path.join(d, name + '.def'), '--game', game, '--exe', 'mowas_2'], { encoding: 'utf8' }).stdout;
  const g2 = /^LEAD door "emit0"/m.test(out) && /^PASS/m.test(out);
  console.log((g2 ? 'ok   ' : 'FAIL ') + name + ' text: LEAD line and PASS'); if (!g2) fail++;
}
// unresolved include is reported, not guessed: PASS-INCOMPLETE, complete=false
{
  const name = 'unres', d = path.join(tmp, name); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, name + '.def'), ok.replace('(include "/properties/fcrew.ext")', '(include "/properties/nothere.ext")'));
  fs.copyFileSync(path.join(tmp, 'ok.mdl'), path.join(d, 'ok.mdl'));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, name + '.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  const good = j.complete === false && j.unresolved.some(u => u.what === 'INCLUDE_MISSING') && j.unresolved.some(u => u.what === 'MACRO_UNDEFINED');
  console.log((good ? 'ok   ' : 'FAIL ') + 'unresolved include/macro reported, complete=false'); if (!good) fail++;
}
// ---- warnings (exit stays 0): one seeded defect each, def edited in place, no mod folder
function warnCase(name, rep, extraArgs, wantCodes, mdlText) {
  const d = path.join(tmp, 'w-' + name); fs.mkdirSync(d);
  const text = ok.replace(rep[0], rep[1]);
  if (text === ok) { console.log('FAIL warn ' + name + ': replace did not apply'); fail++; return; }
  fs.writeFileSync(path.join(d, 'w.def'), text);
  fs.writeFileSync(path.join(d, 'ok.mdl'), mdlText || fs.readFileSync(path.join(tmp, 'ok.mdl')));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'w.def'), '--game', game, '--exe', 'mowas_2', '--json', ...extraArgs], { encoding: 'utf8' });
  let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL warn ' + name + ': no json ' + r.stdout + r.stderr); fail++; return; }
  const got = j.warnings.map(w => w.code).sort().join(','), want = wantCodes.slice().sort().join(',');
  const good = r.status === 0 && j.misses.length === 0 && got === want;
  console.log((good ? 'ok   ' : 'FAIL ') + 'warn ' + name + '  exit ' + r.status + '  warnings [' + got + ']  want [' + want + ']' + (good ? '' : '  misses ' + j.misses.map(m => m.key + ':' + m.name))); if (!good) fail++;
  return j;
}
warnCase('crew-seats', ['("f_crew")', '("crew_3_human")'], [], ['DF_CREW_SEATS']);                                 // mdl has seat01 only, 3 crew
warnCase('shooter', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{Barrels 2}'], [], ['DF_SHOOTER']);              // shooter00/01 absent
warnCase('shooter-tag',['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{Barrels 2}\n\t\t\t{Shooter "mgun_rot"}'], [], ['DF_SHOOTER']);   // prefix from {Shooter}: mgun_rot00 absent too
{
  const mdlOk = fs.readFileSync(path.join(tmp, 'ok.mdl'), 'latin1').replace('{bone "emit0"}', '{bone "emit0"}\n{bone "shooter00"}\n{bone "shooter01"}');
  warnCase('shooter-present', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{Barrels 2}'], [], [], mdlOk);
}
warnCase('pivot', ['{Extension "ok.mdl"}', '{Chassis "wheel"}\n\t{Extension "ok.mdl"}'], [], ['DF_PIVOT']);
warnCase('weapon-calibre-and-box', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{weapon "76mm_zis3" filled}'], ['--rep', '128mm_pak44'], ['DF_WEAPON', 'DF_WEAPON']);
warnCase('weapon-no-ap', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{weapon "76mm_zis3" filled}'], ['--rep', '76mm_gun'], ['DF_WEAPON']);
warnCase('weapon-ok', ['{Weaponry', '{extender "inventory"\n\t\t{box\n\t\t\t{item "bullet76 ap" 50}\n\t\t}\n\t}\n\t{Weaponry'], [], []);   // no weapon: nothing to say
{
  const t = ok.replace('{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{weapon "76mm_zis3" filled}').replace('{Weaponry', '{extender "inventory"\n\t\t{box\n\t\t\t{item "bullet76 ap" 50}\n\t\t\t{item "bullet76 fg" 5}\n\t\t}\n\t}\n\t{Weaponry');
  const d = path.join(tmp, 'w-ap-ok'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'w.def'), t); fs.copyFileSync(path.join(tmp, 'ok.mdl'), path.join(d, 'ok.mdl'));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'w.def'), '--game', game, '--exe', 'mowas_2', '--json', '--rep', '76mm_zis3'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout), good = r.status === 0 && j.warnings.length === 0 && j.misses.length === 0;
  console.log((good ? 'ok   ' : 'FAIL ') + 'warn weapon same calibre + AP box: no warning' + (good ? '' : ' ' + JSON.stringify(j.warnings))); if (!good) fail++;
}

// ---- DFIT-3 warnings: each fires on its seeded fixture and stays silent on the clean counterpart
const mdlTxt = fs.readFileSync(path.join(tmp, 'ok.mdl'), 'latin1');
const mdlEdit = (a, b) => { const t = mdlTxt.replace(a, b); if (t === mdlTxt) { console.log('FAIL mdl edit did not apply: ' + a); fail++; } return t; };
const chk = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + name + (good || !extra ? '' : '  ' + extra)); if (!good) fail++; };
// FXD-2: a case that must come out as ONE blocking miss key:name (exit 1); returns the json
function missCase(name, rep, mdlText, key, nm) {
  const d = path.join(tmp, 'm-' + name); fs.mkdirSync(d);
  const text = ok.replace(rep[0], rep[1]);
  if (text === ok) { console.log('FAIL miss ' + name + ': replace did not apply'); fail++; return; }
  fs.writeFileSync(path.join(d, 'w.def'), text); fs.writeFileSync(path.join(d, 'ok.mdl'), mdlText);
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'w.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL miss ' + name + ': no json ' + r.stdout + r.stderr); fail++; return; }
  const got = j.misses.map(m => m.key + ':' + m.name).join(','), good = r.status === 1 && got === key + ':' + nm;
  console.log((good ? 'ok   ' : 'FAIL ') + 'miss ' + name + '  exit ' + r.status + '  ' + got + '  want ' + key + ':' + nm); if (!good) fail++;
  return j;
}
// DF_AIM (PORT-134/84): gun pattern -> foresight1 (the fixture's gun.pattern), bullet pattern -> foresight3. Place's own {foresight} line is swapped for a {weapon}
const AIMGUN = ['{foresight "foresight1"}', '{weapon "tgun" filled}'];
warnCase('aim-gun-present', AIMGUN, [], []);                                                                     // mdl has foresight1: silent
{
  // FXD-2: DF_AIM is now a blocking MISS (exit 1), not a warning: the aimer has no bone
  const j = missCase('aim-gun-missing', AIMGUN, mdlEdit('"foresight1"', '"foresight5"'), 'DF_AIM', 'tgun');        // renamed: foresight5 looks like it
  chk('aim-gun-missing names the default bone and the lookalike', !!j && /"foresight1"/.test(j.misses[0].detail) && /look like one: foresight5/.test(j.misses[0].detail) && /tgun > pattern gun/.test(j.misses[0].detail), j && j.misses[0].detail);
}
{
  const j = missCase('aim-mg-foresight3', AIMGUN.map((x, i) => i ? '{weapon "tmg"}' : x), mdlTxt, 'DF_AIM', 'tmg');   // bullet.pattern default foresight3, mdl has foresight1 only
  chk('aim-mg names foresight3 and offers foresight1', !!j && /"foresight3"/.test(j.misses[0].detail) && /look like one: foresight1/.test(j.misses[0].detail), j && j.misses[0].detail);
}
warnCase('aim-named-by-place', ['{foresight "foresight1"}', '{foresight "foresight1"}\n\t\t\t{weapon "tmg"}'], [], []);   // the place names a {foresight}: silent
{
  const j = warnCase('aim-unreadable', AIMGUN.map((x, i) => i ? '{weapon "nosuchweapon"}' : x), [], []);
  chk('aim-unreadable: a note, no warning', !!j && j.notes.some(n => /DF_AIM: stuff\/pattern chain of weapon "nosuchweapon" not readable/.test(n)));
}
// DF_BARRELS (PORT-135): GoH shot1/shot2 with {Barrels 2}; DF_SHOOTER stays for a mdl with neither
const SHOTS = mdlEdit('{bone "emit0"}', '{bone "emit0"}\n{bone "shot1"}\n{bone "shot2"}');
{
  const j = warnCase('barrels-def', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{Barrels 2}'], [], ['DF_BARRELS'], SHOTS);
  chk('barrels-def: rename text', !!j && /rename shot1 -> shooter00, shot2 -> shooter01/.test(j.warnings[0].detail), j && j.warnings[0].detail);
}
warnCase('barrels-stuff', ['{foresight "foresight1"}', '{weapon "tgun2" filled}'], [], ['DF_BARRELS'], SHOTS);          // {Barrels 2} sits in the weapon stuff
warnCase('barrels-stuff-no-shots', ['{foresight "foresight1"}', '{weapon "tgun2" filled}'], [], ['DF_SHOOTER']);       // stuff barrels, mdl has no shot bones: the old warning
warnCase('barrels-renamed-ok', ['{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{Barrels 2}'], [], [], SHOTS.replace('"shot1"', '"shooter00"').replace('"shot2"', '"shooter01"'));
// DF_GUN_BASIS (PORT-133)
const GUN = ['{Extension "ok.mdl"}', '{PatherID "cannon.small"}\n\t{Extension "ok.mdl"}'];
warnCase('gun-basis-plain', GUN, [], ['DF_GUN_BASIS']);
warnCase('gun-basis-revolute', GUN, [], [], mdlEdit('{bone "basis"', '{bone revolute "basis"'));
warnCase('car-basis-plain', ['{Extension "ok.mdl"}', '{Extension "ok.mdl"}\n'], [], []);                                 // not a gun: a plain basis is normal (tanks and cars fire)
// DF_ARMOUR (PORT-136): armor_* class of the def vs the rep's
const ARM = ['{Weaponry', '("armor_heavy" turret(180 80 80 40))\n\t("armor_engine" t(40))\n\t{Weaponry'];
warnCase('armour-far', ARM, ['--rep-class', 'light'], ['DF_ARMOUR']);
warnCase('armour-same', ARM, ['--rep-class', 'heavy'], []);
warnCase('armour-rep-def-read', ARM, ['--rep', 'repx'], ['DF_ARMOUR']);                                                  // repx.def in the fixture vfs is armor_medium
warnCase('armour-rep-def-same', [ARM[0], ARM[1].replace('armor_heavy', 'armor_medium')], ['--rep', 'repx'], []);
{
  const j = warnCase('armour-class-unreadable', ARM, ['--rep', 'nosuchrep'], []);
  chk('armour-class-unreadable: a note, no warning', !!j && j.notes.some(n => /DF_ARMOUR: rep class not readable/.test(n)));
}
// DF_FG: fg in the box of a tank rep
const FGBOX = ['{Weaponry', '{extender "inventory"\n\t\t{box\n\t\t\t{item "bullet76 ap" 50}\n\t\t\t{item "ammo bullet76 fg" 5}\n\t\t}\n\t}\n\t{Weaponry'];
warnCase('fg-tank', FGBOX, ['--rep-kind', 'tank'], ['DF_FG']);
warnCase('fg-car', FGBOX, ['--rep-kind', 'car'], []);
warnCase('fg-tank-from-rep-def', FGBOX, ['--rep', 'repx'], ['DF_FG']);                                                   // repx sits under -vehicle/tank_medium
warnCase('fg-no-fg', ['{Weaponry', '{extender "inventory"\n\t\t{box\n\t\t\t{item "bullet76 ap" 50}\n\t\t}\n\t}\n\t{Weaponry'], ['--rep-kind', 'tank'], []);
// DF_MACRO: enumerator extender and a shield volume from a macro, no such bone/volume in the mdl
warnCase('macro-enumerator', ['{Weaponry', '{extender "enumerator"}\n\t{Weaponry'], [], ['DF_MACRO']);
warnCase('macro-enumerator-present', ['{Weaponry', '{extender "enumerator"}\n\t{Weaponry'], [], [], mdlEdit('{bone "emit0"}', '{bone "emit0"}\n{bone "enumerator"}'));
warnCase('macro-shield', ['{Weaponry', '("f_shield" v(mgun_shield1))\n\t{Weaponry'], [], ['DF_MACRO']);
warnCase('macro-shield-present', ['{Weaponry', '("f_shield" v(mgun_shield1))\n\t{Weaponry'], [], [], mdlTxt + '{volume "mgun_shield1"\n\t{thickness 5}\n}\n');
// the false DF_WEAPON: "ammo bullet50 ap" is an AP item (car-2)
{
  const t = ok.replace('{gunner "gunner"}', '{gunner "gunner"}\n\t\t\t{weapon "76mm_zis3" filled}').replace('{Weaponry', '{extender "inventory"\n\t\t{box\n\t\t\t{item "ammo bullet50 ap" 50}\n\t\t}\n\t}\n\t{Weaponry');
  const d = path.join(tmp, 'w-ap-ammo'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'w.def'), t); fs.copyFileSync(path.join(tmp, 'ok.mdl'), path.join(d, 'ok.mdl'));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'w.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  chk('DF_WEAPON: "ammo bullet50 ap" counts as an AP item', r.status === 0 && j.warnings.length === 0, JSON.stringify(j.warnings));
  const t2 = t.replace('ammo bullet50 ap', 'ammo bullet50 fg'); fs.writeFileSync(path.join(d, 'w.def'), t2);
  const j2 = JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(d, 'w.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout);
  chk('DF_WEAPON: "ammo bullet50 fg" alone still warns (no AP)', j2.warnings.length === 1 && j2.warnings[0].code === 'DF_WEAPON');
}
// --fit: smallest edits as text; repeats once with a count; writes nothing, the def is untouched
{
  const d = path.join(tmp, 'fit'); fs.mkdirSync(d);
  const t = ok.replace('{Weaponry', '{volume "turret9"}\n\t{volume "turret9"}\n\t{volume "turret9"}\n\t{extender "enumerator"}\n\t{Weaponry').replace('{foresight "foresight1"}', '{weapon "tmg"}');
  fs.writeFileSync(path.join(d, 'f.def'), t); fs.copyFileSync(path.join(tmp, 'ok.mdl'), path.join(d, 'ok.mdl'));
  const before = fs.readdirSync(d).sort().join() + fs.readFileSync(path.join(d, 'f.def'), 'latin1') + fs.statSync(path.join(d, 'f.def')).mtimeMs;
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'f.def'), '--game', game, '--exe', 'mowas_2', '--fit'], { encoding: 'utf8' });
  const after = fs.readdirSync(d).sort().join() + fs.readFileSync(path.join(d, 'f.def'), 'latin1') + fs.statSync(path.join(d, 'f.def')).mtimeMs;
  const lines = r.stdout.split(/\r?\n/);
  chk('fit: exit 1 (volume misses), FIT header', r.status === 1 && lines.some(l => /^FIT \d+ edit\(s\)/.test(l)), r.stdout);
  chk('fit: repeated drop listed once with a count', lines.filter(l => /drop \{volume "turret9"\}/.test(l)).length === 1 && lines.some(l => /drop \{volume "turret9"\}.*\(x3, def lines/.test(l)) && /rename it to "turret1"/.test(r.stdout), r.stdout);
  chk('fit: warning edits listed (DF_AIM foresight, DF_MACRO drop)', /add \{foresight "foresight1"\}/.test(r.stdout) && /drop \{extender "enumerator"\}/.test(r.stdout), r.stdout);
  chk('fit: writes nothing, def untouched', before === after);
  const rc = cp.spawnSync(process.execPath, [tool, path.join(tmp, 'w-aim-gun-present', 'w.def'), '--game', game, '--exe', 'mowas_2', '--fit'], { encoding: 'utf8' });
  chk('fit: clean def says nothing to edit', /^FIT nothing to edit/m.test(rc.stdout) && /^PASS/m.test(rc.stdout), rc.stdout);
}

// ---- DFIT-4 (PORT-137): missing driver door = FAIL; missing visor bone = warning; --fit names a crew macro that fits, or none
{
  const j = warnCase('visor-bone', ['{bone "visor1"', '{bone "visor9"'], [], ['DF_VISOR']);
  chk('visor-bone: warning names visor9, exit 0', !!j && j.warnings[0].name === 'visor9' && !j.misses.length);
  const j2 = warnCase('macro-visor', ['vb(mgun2)', 'vb(mgun7)'], [], ['DF_VISOR']);
  chk('macro-visor: warning names mgun7 and macro f_vis', !!j2 && j2.warnings[0].name === 'mgun7' && /f_vis/.test(j2.warnings[0].detail));
}
const CREWX = ['("f_crew")', '("crew_4_human_extended")\n\t{placer {place "gunner"}}'];
const crewRun = (name, mdlText, extraArgs) => {
  const d = path.join(tmp, 'c-' + name); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'c.def'), ok.replace(CREWX[0], CREWX[1])); fs.writeFileSync(path.join(d, 'ok.mdl'), mdlText);
  return cp.spawnSync(process.execPath, [tool, path.join(d, 'c.def'), '--game', game, '--exe', 'mowas_2', ...extraArgs], { encoding: 'utf8' });
};
{
  const r = crewRun('door-fail', mdlEdit('{bone "emit0"}', ''), []);   // emit1/emit2 stay
  chk('door FAIL: crew_4_human_extended, emit0 absent: exit 1, MISS door "emit0", PORT-137, FAIL line', r.status === 1 && /^MISS door "emit0"/m.test(r.stdout) && /PORT-137/.test(r.stdout) && /^FAIL 1 miss/m.test(r.stdout), r.stdout);
  const f = crewRun('fit-names', mdlEdit('{bone "emit0"}', ''), ['--fit']);
  chk('--fit names crew_4_human (doors emit1, emit2 in the mdl)', /replace the crew macro "crew_4_human_extended" with "crew_4_human"/.test(f.stdout) && /doors emit1, emit2/.test(f.stdout), f.stdout);
  const none = crewRun('fit-none', mdlEdit('{bone "emit0"}', '').replace('{bone "emit1"}', '').replace('{bone "emit2"}', ''), ['--fit']);
  chk('--fit says no crew macro fits when no doors are in the mdl', none.status === 1 && /NO crew macro of the game fits/.test(none.stdout) && !/with "crew_/.test(none.stdout), none.stdout);
  const clean = crewRun('door-ok', mdlTxt, ['--fit']);   // emit0 present: no door miss, no crew-macro fit line
  chk('crew macro with all doors in the mdl: no door miss, no crew fit', !/MISS door/.test(clean.stdout) && !/crew macro/.test(clean.stdout), clean.stdout);
  // T-DONORREADY SEED: GoH-made mdl (door bone {parameters "group=crew;"}), every door present, crew_4_human_extended -> never operatable in game; crew_4_human orders and kills [V g1]
  const gohMdl = mdlTxt.replace('{bone "emit0"}', '{bone "emit0" {parameters "group=crew;"}}');
  const g = crewRun('goh-ext', gohMdl, ['--fit']);
  chk('DF_CREW_EXT: extended crew macro on a GoH mdl FAILs, fit names crew_4_human', g.status === 1 && /^MISS DF_CREW_EXT "crew_4_human_extended"/m.test(g.stdout) && /replace the crew macro "crew_4_human_extended" with "crew_4_human"/.test(g.stdout), g.stdout);
  const rd = (...p) => fs.readFileSync(path.join(...p), 'latin1');
  const gw = crewRun('goh-ext-w', gohMdl, ['--fit', '--write']), gf = path.join(tmp, 'c-goh-ext-w', 'c.fit.def');
  chk('DF_CREW_EXT --write: copy calls crew_4_human, no extended call left', fs.existsSync(gf) && /\("crew_4_human"\)/.test(rd(gf)) && !/_extended/.test(rd(gf)), gw.stdout);
  chk('DF_CREW_EXT: same def on a vanilla mdl (no group= params) does not fire', !/DF_CREW_EXT/.test(clean.stdout), clean.stdout);
  const vd = path.join(tmp, 'c-goh-ext-w'), vr = cp.spawnSync(process.execPath, [tool, path.join(vd, 'c.def'), '--game', game, '--exe', 'mowas_2', '--variants', 'crew,gunner', '--moddir', vd], { encoding: 'utf8' });
  chk('--variants crew,gunner: writes c_crew.def (crew_4_human); no c_gunner.def when place "gun" already has a gunner; input untouched', vr.status === 0 && /^VARIANT c_crew /m.test(vr.stdout) && /\("crew_4_human"\)/.test(rd(vd, 'c_crew.def')) && !fs.existsSync(path.join(vd, 'c_gunner.def')) && /crew_4_human_extended/.test(rd(vd, 'c.def')), vr.stdout + vr.stderr);
}

// ---- PORT-131 folder check: a mod folder <mod>/resource/entity/d/ with the def, mdl, and what the mdl names
const mdlFiles = fs.readFileSync(path.join(tmp, 'ok.mdl'), 'latin1') + '{sequence "run"}\n{sequence "walk" {file "w.anm"}}\n{file "body.ply"}\n{volume "w1" {polyhedron "v.vol"}}\n';
const plyBuf = Buffer.concat([Buffer.from('EPLY'), Buffer.from('MESH'), Buffer.from([0x12, 1, 0, 0]), Buffer.alloc(8), Buffer.from([0x04, 4, 0, 0]), Buffer.from([8]), Buffer.from('body.mtl')]);
function folderCase(name, drop, wantName, opts = {}) {
  const mod = path.join(tmp, 'mod-' + name), d = path.join(mod, 'resource', 'entity', 'd');
  fs.mkdirSync(d, { recursive: true });
  const files = { 'd.def': ok, 'ok.mdl': opts.mdl || mdlFiles, 'run.anm': 'ANM', 'w.anm': 'ANM', 'body.ply': plyBuf, 'body.mtl': '{material}\n', 'v.vol': 'VOL' };
  for (const f of opts.skipLoose || []) delete files[f];
  if (drop) delete files[drop];
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c);
  const args = [path.join(d, 'd.def'), '--game', game, '--exe', 'mowas_2', '--json'];
  if (opts.moddir) args.push('--moddir', mod);
  const r = cp.spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL folder ' + name + ': no json ' + r.stdout + r.stderr); fail++; return; }
  const got = j.misses.map(m => m.key + ':' + m.name);
  const good = wantName ? r.status === 1 && got.length === 1 && got[0] === 'DF_FOLDER:' + wantName : r.status === 0 && got.length === 0 && j.complete;
  console.log((good ? 'ok   ' : 'FAIL ') + 'folder ' + name + '  exit ' + r.status + '  ' + (got.join(',') || 'no miss') + (wantName ? '  want DF_FOLDER:' + wantName : '')); if (!good) fail++;
}
folderCase('clean', null, null);
folderCase('mdl-absent', 'ok.mdl', 'resource/entity/d/ok.mdl');
folderCase('ply-no-mtl', 'body.mtl', 'resource/entity/d/body.mtl');
folderCase('anm-file-absent', 'w.anm', 'resource/entity/d/w.anm');
folderCase('anm-implicit-absent', 'run.anm', 'resource/entity/d/run.anm');
folderCase('vol-in-base-only', 'v.vol', null);                   // game/resource/entity/d/v.vol exists in the fixture vfs: not missing
folderCase('vol-absent-everywhere', null, 'resource/entity/d/gone.vol', { mdl: mdlFiles.replace('"v.vol"', '"gone.vol"') });
folderCase('moddir-flag', 'w.anm', 'resource/entity/d/w.anm', { moddir: true });
{   // no mod folder (def not under resource/): check skipped with a note, no DF_FOLDER
  const d = path.join(tmp, 'nomod'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'd.def'), ok); fs.writeFileSync(path.join(d, 'ok.mdl'), mdlFiles);
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'd.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout), good = r.status === 0 && !j.misses.length && j.notes.some(n => /folder check .* skipped/.test(n));
  console.log((good ? 'ok   ' : 'FAIL ') + 'folder check skipped without a mod folder'); if (!good) fail++;
}
// exit code and text of a plain-bone defect
{
  const d = path.join(tmp, 'txt'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'd.def'), ok.replace('{bone "turret"', '{bone "body"\n\t\t{speed 0.1}\n\t}\n\t{bone "turret"')); fs.copyFileSync(path.join(tmp, 'ok.mdl'), path.join(d, 'ok.mdl'));
  const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'd.def'), '--game', game, '--exe', 'mowas_2'], { encoding: 'utf8' });
  const good = r.status === 1 && /^MISS DF_PLAIN_BONE "body"/m.test(r.stdout);
  console.log((good ? 'ok   ' : 'FAIL ') + 'DF_PLAIN_BONE text line, exit 1'); if (!good) fail++;
}
// ---- FXC-2: --fit --write (gaps 2, 3, 6) and item defs (gap 8). Each case fails without its rule.
const crlf = t => t.replace(/\r?\n/g, '\r\n'), lf = t => t.replace(/\r\n/g, '\n');
const mk = (name, files) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t); return d; };
const runW = (d, def, extra) => cp.spawnSync(process.execPath, [tool, path.join(d, def), '--game', game, '--exe', 'mowas_2', ...(extra || ['--write'])], { encoding: 'utf8' });
const rd = (...p) => fs.readFileSync(path.join(...p), 'latin1');
const fxFit = path.join(fx, 'fit');
const fitMdl = fs.readFileSync(path.join(fxFit, 'fit.mdl'), 'latin1');
// goldens: the type5 one-line shape and the matilda six-line shape, CRLF input, CRLF kept, input untouched
for (const g of ['type5', 'matilda']) {
  const inp = crlf(fs.readFileSync(path.join(fxFit, g + '.def'), 'latin1')), d = mk('g-' + g, { [g + '.def']: inp, 'fit.mdl': fitMdl });
  const r0 = cp.spawnSync(process.execPath, [tool, path.join(d, g + '.def'), '--game', game, '--exe', 'mowas_2'], { encoding: 'utf8' });
  const r = runW(d, g + '.def'), outp = path.join(d, g + '.fit.def'), got = fs.existsSync(outp) ? rd(outp) : '';
  chk(`write ${g}: input FAILs, copy equals the golden, CRLF kept, input untouched, PASS exit 0`,
    r0.status === 1 && r.status === 0 && lf(got) === lf(fs.readFileSync(path.join(fxFit, g + '.golden.def'), 'latin1')) && !/[^\r]\n/.test(got) && rd(d, g + '.def') === inp && /^PASS/m.test(r.stdout), r.stdout + '\n--got--\n' + got);
}
{   // --out naming the input overwrites it; without --out the input is never written
  const inp = crlf(fs.readFileSync(path.join(fxFit, 'matilda.def'), 'latin1')), d = mk('ow', { 'm.def': inp, 'fit.mdl': fitMdl });
  const r = runW(d, 'm.def', ['--write', '--out', path.join(d, 'm.def')]);
  chk('write --out = the input file: input rewritten and PASS', r.status === 0 && rd(d, 'm.def') !== inp && !/"mgun1"/.test(rd(d, 'm.def')) && /^PASS/m.test(r.stdout), r.stdout);
  const d2 = mk('ow2', { 'm.def': inp, 'fit.mdl': fitMdl }), r2 = runW(d2, 'm.def', ['--write', '--out', path.join(d2, 'elsewhere', 'o.def')]);
  chk('write --out in another folder: copy there, input untouched', r2.status === 0 && fs.existsSync(path.join(d2, 'elsewhere', 'o.def')) && rd(d2, 'm.def') === inp, r2.stdout);
}
const XC = '(define "xcrew"\n\t{placer {place "%place" {group "crew"}}}\n\t{boarder\n\t\t{door "%door1"}\n\t\t{door "%door2"}\n\t}\n)\n';
{   // four defects at once: absent volume (renamed to a free lookalike, or dropped), direct door, foresight, placer LinkBone
  const t = XC + '{game_entity\n\t{Extension "fit.mdl"}\n\t{volume "gun9"\n\t\t{tags "gun"}\n\t}\n\t{volume "turret9"\n\t\t{tags "turret"}\n\t}\n\t{volume "turret1"\n\t\t{tags "turret"}\n\t}\n\t{boarder\n\t\t{door "emit1"}\n\t\t{door "emit7"}\n\t}\n\t{placer\n\t\t{place "driver"}\n\t\t{place "seat3" {LinkBone "seat03"}}\n\t}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{type "cannon"}\n\t\t\t{foresight "foresight5"}\n\t\t\t{gunner "driver"}\n\t\t}\n\t}\n}\n';
  const d = mk('four', { 'f.def': t, 'fit.mdl': fitMdl }), r = runW(d, 'f.def'), got = fs.existsSync(path.join(d, 'f.fit.def')) ? rd(d, 'f.fit.def') : '';
  chk('write: volume renamed gun9 -> gun1, volume dropped, door dropped, foresight dropped, placer LinkBone place dropped; PASS',
    r.status === 0 && /\{volume "gun1"/.test(got) && !/turret9|emit7|foresight5|seat3|gun9/.test(got) && /\{volume "turret1"/.test(got) && /^PASS/m.test(r.stdout) && /APPLIED rename/.test(r.stdout), r.stdout + got);
}
{   // a macro-born LinkBone on a base-role call line (vanilla f_seat, no linkbone-free sibling): VOL-B fallback copies f_seat without {linkbone} as f_seat_nolb beside the def (mod folder, so the include resolves), the other defect is fixed too, recheck PASS
  const t = '(include "/properties/fcrew.ext")\n{game_entity\n\t{Extension "fit.mdl"}\n\t{volume "turret9"\n\t\t{tags "turret"}\n\t}\n\t("f_seat" p(driver) b(seat09))\n}\n';
  const d = mk('unapm/resource/entity/u', { 'u.def': t, 'fit.mdl': fitMdl }); fs.writeFileSync(path.join(tmp, 'unapm', 'mod.info'), '{name "x"}\r\n');
  const r = runW(d, 'u.def'), got = fs.existsSync(path.join(d, 'u.fit.def')) ? rd(d, 'u.fit.def') : '', nb = fs.existsSync(path.join(d, 'fit_nolb.inc')) ? rd(d, 'fit_nolb.inc') : '';
  chk('write: vanilla macro-born seat LinkBone -> f_seat_nolb copy (no linkbone), include after the vanilla one, turret9 fixed, recheck PASS',
    r.status === 0 && /^PASS\s*$/m.test(r.stdout) && /\("f_seat_nolb" p\(driver\)\s*\)/.test(got) && /\(include "\/entity\/u\/fit_nolb\.inc"\)/.test(got) && !/turret9/.test(got) && /\(define "f_seat_nolb"/.test(nb) && !/linkbone/i.test(nb), r.stdout + got + nb);
  const r2 = runW(d, 'u.def'), got2 = rd(d, 'u.fit.def'), nb2 = rd(d, 'fit_nolb.inc');
  chk('write again (fit_nolb.inc left from run 1, u.def does not include it): include added again, one define, PASS', r2.status === 0 && /^PASS\s*$/m.test(r2.stdout) && /fit_nolb\.inc/.test(got2) && (nb2.match(/\(define "f_seat_nolb"/g) || []).length === 1, r2.stdout + got2 + nb2);
}
// gap 3: LinkBone miss inside a weapon place removes the place, its secondary crew line and its user item; nothing dangles
const G3 = live => XC + '{game_entity\n\t{Extension "fit.mdl"}\n\t("xcrew" place(driver) door1(emit1) door2(emit1))\n\t("xcrew" place(gunner2) door1(emit1) door2(emit1))\n\t{extender "inventory"\n\t\t{box\n\t\t\t{item "browning" filled {user "mgun"}}\n\t\t\t{item "ammo mgun" 100}\n\t\t}\n\t}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{type "cannon"}\n\t\t\t{gunner "driver"}\n\t\t}\n\t\t{place "mgun"\n\t\t\t{type "mgun_aa"}\n\t\t\t{gunner "gunner2"}\n\t\t\t{charger "gunner2"}\n\t\t\t{LinkBone "mgun_gone"}\n\t\t}\n' + (live ? '\t\t{place "mgun2"\n\t\t\t{type "mgun_aa"}\n\t\t\t{gunner "gunner2"}\n\t\t\t{LinkBone "mgun_rot"}\n\t\t}\n' : '') + '\t}\n}\n';
{
  const d = mk('g3', { 'a.def': G3(false), 'fit.mdl': fitMdl }), r0 = cp.spawnSync(process.execPath, [tool, path.join(d, 'a.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
  const m0 = JSON.parse(r0.stdout).misses.map(m => m.key + ':' + m.name).join(',');
  const r = runW(d, 'a.def'), got = fs.existsSync(path.join(d, 'a.fit.def')) ? rd(d, 'a.fit.def') : '';
  chk('gap 3: only LinkBone misses before; after --write the place, user item and gunner2 crew line are gone, no crew-place miss, PASS',
    m0 === 'LinkBone:mgun_gone' && r.status === 0 && !/place "mgun"/.test(got) && !/user "mgun"/.test(got) && !/place\(gunner2\)/.test(got) && /place\(driver\)/.test(got) && /item "ammo mgun"/.test(got) && /place "gun"/.test(got) && !/crew-place/.test(r.stdout) && /^PASS/m.test(r.stdout), m0 + '\n' + r.stdout + got);
  const dl = mk('g3live', { 'a.def': G3(true), 'fit.mdl': fitMdl }), rl = runW(dl, 'a.def'), gl = fs.existsSync(path.join(dl, 'a.fit.def')) ? rd(dl, 'a.fit.def') : '';
  chk('gap 3: a crew line a live place still uses is kept (place "mgun" gone, place "mgun2" and place(gunner2) stay)', rl.status === 0 && !/place "mgun"/.test(gl) && /place "mgun2"/.test(gl) && /place\(gunner2\)/.test(gl), rl.stdout + gl);
}
// gap 6: a local crew.ext: its placer place (LinkBone absent) and its door are fitted against the mdl; the weapon place left without crew goes in round 2; the input ext is not touched
{
  const ext = ';SDL invented crew.ext\n{placer\n\t{place "driver" {group "crew"}}\n}\n{placer\n\t{place "seat3"\n\t\t{LinkBone "seat03"}\n\t}\n}\n{boarder\n\t{door "emit1"}\n\t{door "emit7"}\n}\n';
  const def = '{game_entity\n\t{Extension "fit.mdl"}\n\t{extension "crew.ext"}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{type "cannon"}\n\t\t\t{gunner "driver"}\n\t\t}\n\t\t{place "mg3"\n\t\t\t{type "mgun_hull"}\n\t\t\t{gunner "seat3"}\n\t\t}\n\t}\n}\n';
  const d = mk('g6', { 'c.def': def, 'crew.ext': ext, 'fit.mdl': fitMdl });
  const r0 = JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(d, 'c.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout);
  const r = runW(d, 'c.def'), gd = fs.existsSync(path.join(d, 'c.fit.def')) ? rd(d, 'c.fit.def') : '', ge2 = fs.existsSync(path.join(d, 'crew.fit.ext')) ? rd(d, 'crew.fit.ext') : '';
  chk('gap 6: crew.ext misses (LinkBone seat03, door emit7) seen before', r0.misses.map(m => m.key + ':' + m.name).sort().join() === 'LinkBone:seat03,door:emit7', JSON.stringify(r0.misses.map(m => m.key + ':' + m.name)));
  chk('gap 6: crew.fit.ext lacks seat3/emit7, def points at it and lost place mg3, input crew.ext untouched, PASS',
    r.status === 0 && ge2 && !/seat0?3|emit7/.test(ge2) && /place "driver"/.test(ge2) && /crew\.fit\.ext/.test(gd) && !/mg3/.test(gd) && rd(d, 'crew.ext') === ext && /^PASS/m.test(r.stdout), r.stdout + gd + ge2);
}
// gap 8: item defs ({actor}) are read as items; their /properties/goh/ includes must exist
{
  const idef = '{actor\n\t(include "/properties/goh/stuff_small.ext")\n\t{extension "x.mdl"}\n\t{extender "stuff"\n\t\t{item "x"}\n\t}\n\t{nogroupmesh 1}\n\t{volume "body"\n\t\t{thickness 1}\n\t}\n}\n';
  const mkItem = (name, withInc) => {
    const mod = path.join(tmp, name), dd = path.join(mod, 'resource', 'entity', 'inventory', 'x'); fs.mkdirSync(dd, { recursive: true });
    fs.writeFileSync(path.join(dd, 'x.def'), idef); fs.writeFileSync(path.join(dd, 'x.mdl'), '{skeleton\n\t{bone "basis"}\n}\n');
    if (withInc) { fs.mkdirSync(path.join(mod, 'resource', 'properties', 'goh'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'properties', 'goh', 'stuff_small.ext'), ';SDL invented\n'); }
    return cp.spawnSync(process.execPath, [tool, path.join(dd, 'x.def'), '--game', game, '--exe', 'mowas_2'], { encoding: 'utf8' });
  };
  const a = mkItem('item-ok', true), b = mkItem('item-noinc', false);
  chk('gap 8: item def with its goh include present: PASS exit 0, not FATAL', a.status === 0 && /^PASS/m.test(a.stdout) && !/FATAL/.test(a.stdout), a.stdout);
  chk('gap 8: item def whose /properties/goh/ include is absent: MISS DF_INCLUDE, exit 1', b.status === 1 && /^MISS DF_INCLUDE "\/properties\/goh\/stuff_small\.ext"/m.test(b.stdout), b.stdout);
}
// FXC-5: vanilla include copied beside the def; secondary seat dropped in the copy, primary seat stays a MISS
{
  const inc = '(include "/properties/vcrew.ext")\n';
  const body = (call, extra) => inc + '{game_entity\n\t{Extension "fit.mdl"}\n\t(' + call + ')\n' + (extra || '') + '}\n';
  const vfsFile = path.join(game, 'resource', 'properties', 'vcrew.ext'), vfsBefore = fs.readFileSync(vfsFile, 'latin1');
  const md = n => path.join(tmp, n), sub = 'resource/entity/u';   // a mod folder: the def sits under resource/ so the fit_ include path resolves
  const d = mk('x5/' + sub, { 'a.def': body('"v_crew"'), 'fit.mdl': fitMdl }), r = runW(d, 'a.def', ['--fit', '--write', '--in-place', '--moddir', md('x5')]);
  const got = rd(d, 'a.def'), cpf = path.join(d, 'fit_vcrew.ext'), c = fs.existsSync(cpf) ? rd(d, 'fit_vcrew.ext') : '';
  chk('FXC-5: secondary seat line dropped in the local fit_ copy, def includes it, PASS',
    r.status === 0 && /^PASS/m.test(r.stdout) && c && !/place\(gunner2\)/.test(c) && /place\(driver\)/.test(c) && /fit_vcrew\.ext/.test(got) && !/\(include "\/properties\/vcrew\.ext"\)/.test(c), r.stdout + got + c);
  chk('FXC-5: vanilla (vfs) file untouched', fs.readFileSync(vfsFile, 'latin1') === vfsBefore);
  chk('FXC-5 --in-place: .def.unfit holds the original (no .unfit.def: Entity redefinition), def replaced', fs.existsSync(path.join(d, 'a.def.unfit')) && rd(d, 'a.def.unfit') === body('"v_crew"') && got !== body('"v_crew"') && !fs.existsSync(path.join(d, 'a.fit.def')) && !fs.existsSync(path.join(d, 'a.unfit.def')), r.stdout);
  const rb = (() => { const dd = mk('x5b/' + sub, { 'b.def': body('"v_crew_bad"'), 'fit.mdl': fitMdl }); return runW(dd, 'b.def', ['--fit', '--write', '--in-place', '--moddir', md('x5b')]); })();
  chk('FXC-5: primary driver seat with no bone stays a MISS with PORT-137, exit 1', rb.status === 1 && /PORT-137/.test(rb.stdout) && /^FAIL/m.test(rb.stdout), rb.stdout);
  // main weapon crewed by the secondary seat: not dropped
  const dm = mk('x5m/' + sub, { 'm.def': body('"v_crew"', '\t{Weaponry\n\t\t{place "gun"\n\t\t\t{type "cannon"}\n\t\t\t{gunner "gunner2"}\n\t\t}\n\t}\n'), 'fit.mdl': fitMdl });
  const rm = runW(dm, 'm.def', ['--fit', '--write', '--in-place', '--moddir', md('x5m')]);
  chk('FXC-5: a seat crewing the main weapon is not dropped (MISS stays, gun place kept)', rm.status === 1 && /place "gun"/.test(rd(dm, 'm.def')) && (!fs.existsSync(path.join(dm, 'fit_vcrew.ext')) || /place\(gunner2\)/.test(rd(dm, 'fit_vcrew.ext'))), rm.stdout);
  // --in-place guards
  const mo = mk('x5mod', {}), de = mk('x5out', { 'o.def': body('"v_crew"'), 'fit.mdl': fitMdl });
  const ro = runW(de, 'o.def', ['--fit', '--write', '--in-place', '--moddir', mo]);
  chk('FXC-5 --in-place: def outside --moddir exits 2, original untouched', ro.status === 2 && rd(de, 'o.def') === body('"v_crew"') && !fs.existsSync(path.join(de, 'o.def.unfit')), ro.stdout + ro.stderr);
  const rn = runW(de, 'o.def', ['--fit', '--write', '--in-place']);
  chk('FXC-5 --in-place: without --moddir exits 2', rn.status === 2, rn.stdout + rn.stderr);
  const rx = runW(de, 'o.def', ['--fit', '--write', '--in-place', '--moddir', de, '--out', path.join(de, 'z.def')]);
  chk('FXC-5 --in-place with --out exits 2', rx.status === 2, rx.stdout + rx.stderr);
  const rw = runW(de, 'o.def', ['--fit', '--in-place', '--moddir', de]);
  chk('FXC-5 --in-place without --write exits 2', rw.status === 2, rw.stdout + rw.stderr);
}
// ---- FXD-2 (w63): tool-built units that ordered and fired 0 shots. Each rule below fails without its code.
{   // rule 1: DF_AIM --write puts the mdl's lookalike aim bone on the place (cckw_m33 plain -> {foresight "foresight14"}; the _a hand fit did that and killed)
  const tmgDef = ok.replace(AIMGUN[0], '{weapon "tmg"}');
  const d = mk('aimw', { 'a.def': tmgDef, 'ok.mdl': mdlTxt });
  const r = runW(d, 'a.def', ['--fit', '--write']), got = fs.existsSync(path.join(d, 'a.fit.def')) ? rd(d, 'a.fit.def') : '';
  chk('DF_AIM --write: {foresight "foresight1"} on the place line, input untouched, PASS', r.status === 0 && /\{place "gun" \{foresight "foresight1"\}/.test(got) && /^PASS/m.test(r.stdout) && rd(d, 'a.def') === tmgDef, r.stdout + got);
  // no aim-like bone left at all (foresight1 renamed to something not aim-like): stays a FAIL, listed UNAPPLIED
  const dn = mk('aimn', { 'a.def': tmgDef, 'ok.mdl': mdlEdit('"foresight1"', '"zzz1"') });
  const rn = runW(dn, 'a.def', ['--fit', '--write']);
  chk('DF_AIM --write: no lookalike in the mdl is UNAPPLIED and stays FAIL exit 1', rn.status === 1 && /UNAPPLIED DF_AIM "tmg"/.test(rn.stdout) && /^FAIL/m.test(rn.stdout), rn.stdout);
}
{   // rule 2: a seat of a base role whose linkbone is absent (uk-aec_mk3 gunner/gunner2, staghound gunner): BreakSeats breaks it. Call line swapped to the macro without the linkbone.
  const defs = '(define "xseat"\n\t{placer\n\t\t{place "%place" {LinkBone "%bone"}}\n\t}\n)\n(define "xseat_inside"\n\t{placer\n\t\t{place "%place"}\n\t}\n)\n';
  const t = defs + '{game_entity\n\t{Extension "fit.mdl"}\n\t("xseat" place(gunner) bone(gunner9))\n\t("xseat" place(driver) bone(mgun_rot))\n}\n';
  const d = mk('seatw', { 's.def': t, 'fit.mdl': fitMdl });
  const r0 = JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(d, 's.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout);
  const r = runW(d, 's.def', ['--fit', '--write']), got = fs.existsSync(path.join(d, 's.fit.def')) ? rd(d, 's.fit.def') : '';
  chk('seat linkbone: gunner9 seen as MISS before; after --write the call is xseat_inside without bone(), driver call (bone present) unchanged, PASS',
    r0.misses.map(m => m.key + ':' + m.name).join() === 'LinkBone:gunner9' && r.status === 0 && /\("xseat_inside" place\(gunner\)\s*\)/.test(got) && /\("xseat" place\(driver\) bone\(mgun_rot\)\)/.test(got) && /^PASS/m.test(r.stdout), r.stdout + got);
  // VOL-B fallback: no macro without a linkbone to swap to: the macro is copied without {LinkBone} as xseat_nolb into fit_nolb.inc, the def includes it first, PASS
  const d2 = mk('seatn', { 's.def': defs.replace('"xseat_inside"', '"other"') + t.slice(defs.length), 'fit.mdl': fitMdl });
  const r2 = runW(d2, 's.def', ['--fit', '--write']), g2 = fs.existsSync(path.join(d2, 's.fit.def')) ? rd(d2, 's.fit.def') : '', n2 = fs.existsSync(path.join(d2, 'fit_nolb.inc')) ? rd(d2, 'fit_nolb.inc') : '';
  chk('seat linkbone fallback: no linkbone-free sibling -> xseat_nolb copy without LinkBone, call swapped, driver unchanged, include on line 1, PASS',
    r2.status === 0 && /^PASS/m.test(r2.stdout) && /^\(include "[^"]*fit_nolb\.inc"\)/.test(g2) && /\("xseat_nolb" place\(gunner\)\s*\)/.test(g2) && /\("xseat" place\(driver\) bone\(mgun_rot\)\)/.test(g2)
    && /\(define "xseat_nolb"/.test(n2) && !/linkbone/i.test(n2) && /\{place "%place"/.test(n2), r2.stdout + g2 + n2);
  // a secondary seat (not a base role) is not handled by the fallback: stays on the older drop rules
  const d4 = mk('seatn2', { 's.def': defs.replace('"xseat_inside"', '"other"') + t.slice(defs.length).replace('place(gunner) bone(gunner9)', 'place(gunner) bone(mgun_rot))\n\t("xseat" place(seat7) bone(gunner9)'), 'fit.mdl': fitMdl });
  const r4 = runW(d4, 's.def', ['--fit', '--write']), g4 = fs.existsSync(path.join(d4, 's.fit.def')) ? rd(d4, 's.fit.def') : '';
  chk('seat linkbone fallback: secondary seat7 call line dropped, no nolb copy', r4.status === 0 && !/seat7/.test(g4) && !fs.existsSync(path.join(d4, 'fit_nolb.inc')), r4.stdout + g4);
  // staghound shape: crew_human_visible -> crew_human (vanilla names, the _visible suffix is the linkbone variant)
  const t3 = '(define "xs_visible"\n\t{placer\n\t\t{place "%place" {LinkBone "%place"}}\n\t}\n)\n(define "xs"\n\t{placer\n\t\t{place "%place"}\n\t}\n)\n{game_entity\n\t{Extension "fit.mdl"}\n\t("xs_visible" place(gunner))\n}\n';
  const d3 = mk('seatv', { 's.def': t3, 'fit.mdl': fitMdl }), r3 = runW(d3, 's.def', ['--fit', '--write']), g3 = fs.existsSync(path.join(d3, 's.fit.def')) ? rd(d3, 's.fit.def') : '';
  chk('seat linkbone: "<macro>_visible" call swapped to "<macro>", PASS', r3.status === 0 && /\("xs" place\(gunner\)\)/.test(g3), r3.stdout + g3);
}
{   // rule 3: kv8s: crew_4_human_extended needs a driver door (emit0) the mdl lacks: --write swaps the call for the crew macro whose doors the mdl has
  const d = mk('crewx', { 'c.def': ok.replace(CREWX[0], CREWX[1]), 'ok.mdl': mdlEdit('{bone "emit0"}', '') });
  const r = runW(d, 'c.def', ['--fit', '--write']), got = fs.existsSync(path.join(d, 'c.fit.def')) ? rd(d, 'c.fit.def') : '';
  chk('door emit0 absent: --write swaps crew_4_human_extended -> crew_4_human, PASS', r.status === 0 && /\("crew_4_human"\)/.test(got) && !/crew_4_human_extended/.test(got) && /^PASS/m.test(r.stdout), r.stdout + got);
}
{   // rule 4: the enumerator warning is log noise, not a cause: it stays a warning (exit 0) and its text says so
  const j = warnCase('macro-enumerator-text', ['{Weaponry', '{extender "enumerator"}\n\t{Weaponry'], [], ['DF_MACRO']);
  chk('DF_MACRO enumerator text says log noise only (UpdateDigits warns and returns)', !!j && /Log noise only/.test(j.warnings[0].detail));
}
{   // BUILD-GATE jobs 1-2: DF_STUFF (BG-2) and DF_MATERIAL (BG-1) need a game-sized data set: copy the fixture game, add 20 stuff files and a set/material.set
  const gg = path.join(tmp, 'gategame');
  (function cpr(a, b) { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) e.isDirectory() ? cpr(path.join(a, e.name), path.join(b, e.name)) : fs.copyFileSync(path.join(a, e.name), path.join(b, e.name)); })(game, gg);
  const sd = path.join(gg, 'resource/set/stuff/gun');
  for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(sd, 'filler' + i), ';SDL\n{stuff}\n');
  fs.writeFileSync(path.join(sd, 'ok_gun.weapon'), ';SDL\n{stuff}\n');                     // file-name tags: ok_gun, weapon
  fs.writeFileSync(path.join(sd, '203mm_gun'), ';SDL\n{stuff {tag "weapon"}}\n');         // like vanilla: "weapon" is only a {tag} string, not a file-name tag
  fs.writeFileSync(path.join(gg, 'resource/set/material.set'), ';SDL\r\n{\r\n\t{"steel"}\r\n\t{"wood"}\r\n}\r\n');
  const gate = (name, edit, expect, g) => {
    const d = path.join(tmp, 'g-' + name); fs.mkdirSync(d);
    fs.copyFileSync(path.join(fx, 'ok.mdl'), path.join(d, 'ok.mdl'));
    const text = edit(ok);
    if (text === ok) { console.log('FAIL gate ' + name + ': edit did not apply'); fail++; return; }
    fs.writeFileSync(path.join(d, 'g.def'), text);
    const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'g.def'), '--game', g || gg, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
    let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL gate ' + name + ': no json ' + r.stdout + r.stderr); fail++; return; }
    const got = j.misses.map(m => m.key + ':' + m.name);
    const good = expect ? r.status === 1 && got.length === 1 && got[0] === expect : r.status === 0 && got.length === 0;
    console.log((good ? 'ok   ' : 'FAIL ') + 'gate ' + name + '  exit ' + r.status + '  ' + (got.join(',') || 'no miss') + (expect ? '  want ' + expect : ''));
    if (!good) { fail++; console.log(JSON.stringify(j.misses.map(m => m.detail))); }
    return j;
  };
  const pr = t => t.replace('\t{Extension', '\t{props "steel"}\n\t{Extension');
  const wp = w => t => t.replace('{type "mgun_rot"}', '{type "mgun_rot"}\n\t\t\t{weapon "' + w + '"}');
  gate('clean', t => wp('weapon ok_gun')(pr(t)), null);
  gate('stuff-no-name-tag', t => wp('weapon 203mm_gun')(pr(t)), 'DF_STUFF:weapon 203mm_gun');   // case 210mm_morser_16: the file name lacks "weapon"
  gate('stuff-no-file', t => wp('weapon nosuch_gun')(pr(t)), 'DF_STUFF:weapon nosuch_gun');
  gate('material-none', t => t + '\n','DF_MATERIAL:no material source');                              // case opel_maultier: volumes, no material source
  gate('material-unknown', t => pr(t).replace('{tags "body"}', '{tags "body"}\n\t\t{material "plutonium"}'), 'DF_MATERIAL:plutonium');
  gate('material-default', t => t.replace('\t{Extension', '\t{volume default_material "wood"}\n\t{Extension'), null);
  const js = gate('small-target', wp('weapon nosuch_gun'), null, game);   // fixture game: under 20 stuff files, skipped with a note, no false refusal
  chk('gate small-target: a note says the {weapon} tags were not checked', !!js && js.notes.some(n => /BG-2: target has \d+ stuff file/.test(n)));
  // DF_PROPS: entity.set blocks {entities {"steel" ..} {"car steel" ..}}; "steel" known, "zzbogus" no block, "car" only via a block whose tags all match
  fs.mkdirSync(path.join(gg, 'resource/set/interaction_entity'), { recursive: true });
  fs.writeFileSync(path.join(gg, 'resource/set/interaction_entity/entity.set'), '{entities\r\n\t(include "steel.inc")\r\n\t{"tank car" {on x}}\r\n}\r\n');
  fs.writeFileSync(path.join(gg, 'resource/set/interaction_entity/steel.inc'), '{"steel" {on x}}\r\n');
  const pj = gate('props-ok', pr, null);
  chk('DF_PROPS: a props word an entity.set block names (via include) gives no warning', !!pj && !pj.warnings.some(w => w.code === 'DF_PROPS'), pj && JSON.stringify(pj.warnings));
  const pb = gate('props-bogus', t => t.replace('\t{Extension', '\t{props "steel" "zzbogus car"}\n\t{Extension'), null);
  const pw = pb && pb.warnings.find(w => w.code === 'DF_PROPS');
  chk('DF_PROPS: "zzbogus" and "car" (its only block needs "tank" too) warn, "steel" does not', !!pw && pw.name === 'zzbogus car', pb && JSON.stringify(pb.warnings));
  // CHK-DONOR: WARN_FILLING_GUN (PORT-156) and WARN_FILLING_FORM (PORT-162). fgun loads bullet76 (AS2 ammo files bullet76.ap.ammo, bullet50.ap.ammo);
  // ggun loads bulletrus_76 (GoH-named ammo file bulletrus_76.aphebc, no "ammo" word in the name)
  fs.writeFileSync(path.join(sd, 'fgun'), ';SDL\n{stuff {filling "bullet76"}}\n');
  fs.writeFileSync(path.join(sd, 'ggun'), ';SDL\n{stuff {filling "bulletrus_76"}}\n');
  fs.writeFileSync(path.join(sd, 'bullet76.ap.ammo'), ';SDL\n{stuff}\n');
  fs.writeFileSync(path.join(sd, 'bullet50.ap.ammo'), ';SDL\n{stuff}\n');
  fs.writeFileSync(path.join(sd, 'bulletrus_76.aphebc'), ';SDL\n{stuff}\n');
  const fw = (w, f) => t => pr(t).replace('{type "mgun_rot"}', '{type "mgun_rot"}\n\t\t\t{weapon "' + w + '" filling "' + f + '" 1}');
  const fcodes = j => j ? j.warnings.filter(w => /^WARN_FILLING_/.test(w.code)).map(w => w.code + ':' + w.name).join(',') : 'no json';
  const fcase = (name, w, f, want) => { const j = gate(name, fw(w, f), null); const got = fcodes(j); chk('filling ' + name + ': ' + (want || 'no WARN_FILLING_*'), got === want, got + (j ? '  ' + JSON.stringify(j.warnings.filter(x => /^WARN_FILLING_/.test(x.code))) : '')); };
  fcase('gun-clean', 'fgun', 'ammo bullet76 ap', '');
  fcase('gun-other-ammo', 'fgun', 'ammo bullet50 ap', 'WARN_FILLING_GUN:fgun');                                 // PORT-156: def fills AS2 bullet50, the gun loads bullet76
  fcase('form-clean', 'ggun', 'bulletrus_76 aphebc', '');
  fcase('form-as2-word', 'ggun', 'ammo bulletrus_76 aphebc', 'WARN_FILLING_FORM:ammo bulletrus_76 aphebc');   // PORT-162: AS2 "ammo " form on GoH-named ammo
  { const j = gate('form-fix-text', fw('ggun', 'ammo bulletrus_76 aphebc'), null), w = j && j.warnings.find(x => x.code === 'WARN_FILLING_FORM');
    chk('WARN_FILLING_FORM fix names the form that matches: filling "bulletrus_76 aphebc"', !!w && /filling "bulletrus_76 aphebc"/.test(w.fix), w && w.fix); }
}
// DF_READER / DF_PAREN_STRAY: the goh2as2 defcheck reader rules on the def text
{
  const j = (name, text) => { const d = mk('rd-' + name, { 'r.def': text, 'ok.mdl': mdlTxt }); const r = cp.spawnSync(process.execPath, [tool, path.join(d, 'r.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }); try { return { s: r.status, j: JSON.parse(r.stdout) }; } catch (e) { return { s: r.status, j: { misses: [], warnings: [] }, out: r.stdout + r.stderr }; } };
  const a = j('zero', ok.replace('{speed 0.0065}', '{speed 0}'));
  chk('DF_READER: {speed 0} on a typed bone is a blocking miss (Zero speed), exit 1', a.s === 1 && a.j.misses.some(m => m.key === 'DF_READER' && /Zero speed/.test(m.detail)), JSON.stringify(a.j.misses));
  const b = j('stray', ok + '\n)\n');
  chk('DF_PAREN_STRAY: a stray ")" is a warning, exit 0 (SDL-16)', b.s === 0 && b.j.warnings.some(w => w.code === 'DF_PAREN_STRAY') && !b.j.misses.length, JSON.stringify(b.j));
}
// DF_LINK: a boarder link to a place no placer defines
{
  const t = '{game_entity\n\t{Extension "fit.mdl"}\n\t{placer\n\t\t{place "driver"}\n\t}\n\t{boarder\n\t\t{door "emit0"}\n\t\t{link "emit0" "driver"}\n\t\t{link "emit0" "gunner5"}\n\t}\n}\n';
  const d = mk('dlink', { 'l.def': t, 'fit.mdl': fitMdl });
  const r = JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(d, 'l.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout);
  chk('DF_LINK: {link "emit0" "gunner5"} with no place gunner5 warns once, driver link does not', r.warnings.filter(w => w.code === 'DF_LINK').map(w => w.name).join() === 'gunner5', JSON.stringify(r.warnings));
}
// DF_MODINFO: a mod folder (def under <mod>/resource/) without mod.info warns; with it, no warning
{
  const sub = 'resource/entity/u';
  const d1 = mk('mi1/' + sub, { 'a.def': ok, 'ok.mdl': mdlTxt }), d2 = mk('mi2/' + sub, { 'a.def': ok, 'ok.mdl': mdlTxt }); fs.writeFileSync(path.join(tmp, 'mi2', 'mod.info'), '{name "x"}\r\n');
  const w = d => JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(d, 'a.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout).warnings.map(x => x.code);
  chk('DF_MODINFO: absent mod.info warns, present does not', w(d1).includes('DF_MODINFO') && !w(d2).includes('DF_MODINFO'));
}
{   // FIX-PORT (port-donors:57, OBS-I2): the nolb fit must reach the def the game loads. Seeded: mbR2A_t toldi2 shape, fit kept as <def>.fit, live def still linkbone
  const t = '(define "xseat"\n\t{placer\n\t\t{place "%place" {LinkBone "%bone"}}\n\t}\n)\n{game_entity\n\t{Extension "fit.mdl"}\n\t("xseat" place(gunner) bone(gunner9))\n}\n';
  const d = mk('notlive', { 's.def': t, 'fit.mdl': fitMdl });
  const r = runW(d, 's.def', ['--fit', '--write']);
  chk('FIX-PORT copy route: --write prints NOT LIVE (def unchanged, fit only in s.fit.def)', /^NOT LIVE .*s\.def is unchanged/m.test(r.stdout) && rd(d, 's.def') === t, r.stdout);
  fs.renameSync(path.join(d, 's.fit.def'), path.join(d, 's.def.fit'));   // what the R2A mod held
  const w = s => JSON.parse(cp.spawnSync(process.execPath, [tool, path.join(s, 's.def'), '--game', game, '--exe', 'mowas_2', '--json'], { encoding: 'utf8' }).stdout).warnings.filter(x => x.code === 'DF_FIT_NOT_LIVE');
  const w1 = w(d);
  chk('FIX-PORT DF_FIT_NOT_LIVE: s.def.fit with *_nolb beside a linkbone def warns', w1.length === 1 && w1[0].name === 's.def.fit' && /_nolb/.test(w1[0].detail) && /--in-place/.test(w1[0].fix), JSON.stringify(w1));
  const m = mk('notlive_mod', { 'mod.info': '{name "x"}\r\n' }), e = path.join(m, 'resource', 'entity', 's'); fs.mkdirSync(e, { recursive: true });
  fs.writeFileSync(path.join(e, 's.def'), t); fs.writeFileSync(path.join(e, 'fit.mdl'), fitMdl);
  const ri = runW(e, 's.def', ['--fit', '--write', '--in-place', '--moddir', m]);
  chk('FIX-PORT --in-place: live def calls xseat_nolb, no NOT LIVE line, no DF_FIT_NOT_LIVE after', ri.status === 0 && /\("xseat_nolb" place\(gunner\)/.test(rd(e, 's.def')) && !/^NOT LIVE/m.test(ri.stdout) && w(e).length === 0, ri.stdout);
}
{ // --exe: goh refused with one plain line (exit 2), a bad word exits 2, the GUI id mowas2 is taken as mowas_2
  const okDef = path.join(fx, 'ok.def');
  const rg = cp.spawnSync(process.execPath, [tool, okDef, '--game', game, '--exe', 'goh'], { encoding: 'utf8' });
  chk('--exe goh refused: exit 2, one line citing the port matrix row', rg.status === 2 && /^donorfit: not available for GoH: .*source of the port.*\(plan\/reports\/game-parity\/t-port-a\.md\)$/.test(rg.stderr.trim()), rg.status + ' ' + rg.stderr);
  const rb = cp.spawnSync(process.execPath, [tool, okDef, '--game', game, '--exe', 'nope'], { encoding: 'utf8' });
  chk('--exe bad word: exit 2 with the exact line', rb.status === 2 && rb.stderr.trim() === '--exe must be one of as64|mowas_2|mowas2|goh', rb.status + ' ' + rb.stderr);
  // made-up shared install (as64.exe + mowas_2.exe): the item def's include lives only in as64/core, so the as64 view finds it and the mowas_2 view does not
  const inst = path.join(tmp, 'exe-inst');
  for (const f of ['as64.exe', 'mowas_2.exe']) { fs.mkdirSync(inst, { recursive: true }); fs.writeFileSync(path.join(inst, f), ''); }
  fs.mkdirSync(path.join(inst, 'resource'), { recursive: true });
  const core = path.join(inst, 'as64', 'core', 'resource', 'properties', 'goh'); fs.mkdirSync(core, { recursive: true });
  fs.writeFileSync(path.join(core, 'stuff_small.ext'), ';SDL invented\r\n');
  const dd = path.join(tmp, 'exe-item', 'resource', 'entity', 'inventory', 'x'); fs.mkdirSync(dd, { recursive: true });
  fs.writeFileSync(path.join(dd, 'x.def'), '{actor\n\t(include "/properties/goh/stuff_small.ext")\n\t{extension "x.mdl"}\n\t{extender "stuff"\n\t\t{item "x"}\n\t}\n}\n');
  fs.writeFileSync(path.join(dd, 'x.mdl'), '{skeleton\n\t{bone "basis"}\n}\n');
  const ex = e => cp.spawnSync(process.execPath, [tool, path.join(dd, 'x.def'), '--game', inst].concat(e ? ['--exe', e] : []), { encoding: 'utf8' });
  const r0 = ex(null), r64 = ex('as64'), r2 = ex('mowas_2'), r2g = ex('mowas2');
  chk('--exe: no --exe and as64 see the as64/core include (exit 0)', r0.status === 0 && r64.status === 0 && !/DF_INCLUDE/.test(r0.stdout + r64.stdout), r0.stdout + r64.stdout);
  chk('--exe mowas_2: no as64/core, MISS DF_INCLUDE (exit 1)', r2.status === 1 && /^MISS DF_INCLUDE "\/properties\/goh\/stuff_small\.ext"/m.test(r2.stdout), r2.stdout);
  chk('--exe mowas2 (GUI id) gives the mowas_2 view, not the default one', r2g.status === 1 && r2g.stdout === r2.stdout && r2g.stdout !== r0.stdout, r2g.stdout);
  // donorfit's own games.get mapping, not the vfs one: --json names the exe it resolved; MOWAS2 (case) only games.get folds; no --exe adds no key
  const jx = e => { const r = cp.spawnSync(process.execPath, [tool, path.join(dd, 'x.def'), '--game', inst, '--json'].concat(e ? ['--exe', e] : []), { encoding: 'utf8' }); try { return JSON.parse(r.stdout); } catch { return {}; } };
  const jg = jx('MOWAS2'), j0 = jx(null);
  chk('--exe MOWAS2: donorfit itself resolves it to mowas_2 (json exe), the mowas_2 view', jg.exe === 'mowas_2' && jg.misses && jg.misses.some(m => /stuff_small/.test(m.name || '')) , JSON.stringify(jg.exe) + ' ' + JSON.stringify(jg.misses));
  chk('no --exe: json has no exe key (as before)', !('exe' in j0), Object.keys(j0).join());
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `${fail} FAILED` : 'PASS');
process.exit(fail ? 1 : 0);
