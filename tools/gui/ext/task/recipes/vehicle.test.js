// recipe "vehicle" test: node vehicle.test.js <scratch>. Two fixture drafts on the vanilla T-34 (t34_0): make (clone, wreck, sounds
// block, buy card with a limit tag, name and description through the gen text finish, a speed, two advanced fields and an armour
// line on the copy) and change (set rows, an added PatherID, armour, a machine gun, the inventory and its weight, a mount line and
// card fields). Both are planned, then written into their own scratch mods and read back.
// Author: Imperator_Aug (ARSENAL, ia-6d974dcb)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-vehicle-')));
const recipe = require('./vehicle.recipe'), lang = require('./vehicle.lang');
const fresh = d => { fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(d + '.arsenal-undo', { recursive: true, force: true }); return d; };
const read = (mod, rel) => { try { return fs.readFileSync(path.join(mod, rel), 'latin1'); } catch { return ''; } };
// every .lng of the mod: the gen text finish names the file after the mod
const lngOf = mod => { const d = path.join(mod, 'localization'); try { return fs.readdirSync(d).filter(f => /\.lng$/i.test(f)).map(f => fs.readFileSync(path.join(d, f), 'utf8')).join('\n'); } catch { return ''; } };
const DEF = 'resource/entity/-vehicle/tank_medium/', UNITS = 'resource/set/multiplayer/units/vehicles_rus.set', GER = 'resource/set/multiplayer/units/vehicles_ger.set';

(async () => {
  await kit.run(recipe, lang, {
    verb: 'make', base: { id: 't34_0' }, mod: fresh(path.join(scratch, 'mods', 'vehicle_make')),
    answers: { newid: 'tasktest_t34', title: 'Task T34', info: 'Task info line', sell: true, cost: 400, maxspeed: 40, hearing: 5, gearswitch: 0.6, limit: 2, army: 'ger', wreckobstacle: 'unbreakable',
      mguns: ['mgun2 = dt', 'mgun1 = besa'], load: ['"ammo bullet76 ap" 37', '"ammo bullet76 fg" 40', '"ammo bullet76 apcr" 5', '"ammo mgun" 2500', '"ammo mgun" 500'],
      armour: ['armor_medium turret 60 52 52 20', 'armor_medium body 45 45 45 22', 'armor_engine t 45 45 45 22', 'armor_mantlet t 40'] },
    planFiles: [GER, 'resource/set/interaction_entity/tank.inc'],
    write: true,
    after: (mod, res, ok) => {
      const def = read(mod, DEF + 'tasktest_t34/tasktest_t34.def');
      ok(!!def, 'the copy is written', JSON.stringify(res.files).slice(0, 400));
      ok(/MaxSpeed\s+40\b/i.test(def), 'the copy has the new top speed', def.slice(0, 300));
      ok(/turret\(\s*60 52 52 20\s*\)/.test(def), 'the copy has the new turret armour');
      const wx = read(mod, DEF + 'x/tasktest_t34_x/tasktest_t34_x.def');
      ok(!!wx && !!read(mod, DEF + 'x/tasktest_t34_xx/tasktest_t34_xx.def'), 'the wreck and its last stage are copied');
      ok(/obstacleid\s+"unbreakable"/i.test(wx), 'the wreck has the new obstacle class', wx.slice(0, 300));
      const ger = read(mod, GER);
      ok(/\{\s*"tasktest_t34"[^\n]*s\(ger\)[^\n]*\{cost 400\}/.test(ger), 'the buy card is in the German list with the price', (ger.match(/[^\n]*tasktest_t34[^\n]*/) || [''])[0]);
      ok(/place "mgun1"[\s\S]*?weapon "besa"/.test(def), 'the hull machine gun is swapped by the weapon op');
      ok((def.match(/\{item "ammo mgun"/g) || []).length === 2, 'a second ammo line is appended', def.slice(def.indexOf('{Box'), def.indexOf('{Box') + 300));
      ok(/"tasktest_t34 tank"/.test(read(mod, 'resource/set/interaction_entity/tank.inc')), 'the sound block is copied');
      const lng = lngOf(mod);
      ok(/"tasktest_t34"\s+"Task T34"/.test(lng), 'the name is written by the gen text finish', lng.slice(0, 300));
      ok(/Task info line/.test(lng), 'the description is written');
      ok(/HearingBias\s+5\b/i.test(def), 'the hearing factor is changed', (def.match(/[^\n]*hearingbias[^\n]*/i) || [''])[0]);
      ok(/GearSwitchDelay\s+0\.6\b/i.test(def), 'the gear switch delay is changed', (def.match(/[^\n]*gearswitch[^\n]*/i) || [''])[0]);
      ok(/lim_tasktest_t34/.test(ger), 'the card carries the limit tag');
    },
  }, scratch);
  await kit.run(recipe, lang, {
    verb: 'change', base: { id: 't34_0' }, mod: fresh(path.join(scratch, 'mods', 'vehicle_change')),
    answers: { mass: 30000, maxspeed: 38, pather: 'armored', mguns: ['mgun2 = besa', 'mgun1 = dt'], cost: 380, level: 2,
      armour: ['armor_medium turret 60 52 52 20', 'armor_medium body 45 45 45 22', 'armor_engine t 45 45 45 22', 'armor_mantlet t 45'],
      load: ['"ammo bullet76 ap" 30', '"ammo bullet76 fg" 40', '"ammo mgun" 3000'], boxweight: 4000,
      mounts: ['gun restoreikafteraim yes', 'mgun2 type mgun_coaxial', 'mgun2 foresight foresight5', 'mgun2 basic yes', 'mgun1 type mgun_hull', 'mgun1 foresight foresight5'] },
    planFiles: [DEF + 't34_0/t34_0.def', UNITS],
    write: true,
    after: (mod, res, ok) => {
      const def = read(mod, DEF + 't34_0/t34_0.def');
      ok(/\{mass 30000\}/i.test(def), 'mass is changed');
      ok(/MaxSpeed\s+38\b/i.test(def), 'top speed is changed');
      ok(/\{patherid\s+"armored"\}/i.test(def), 'the pather class is added');
      ok(/turret\(\s*60 52 52 20\s*\)/.test(def) && /"armor_mantlet"\s+t\(\s*45\s*\)/.test(def), 'armour lines are changed');
      ok(/place "mgun2"[\s\S]*?weapon "besa"/.test(def), 'the machine gun is swapped');
      ok(/\{item "ammo bullet76 ap" 30\}/.test(def) && /\{item "ammo bullet76 fg" 40\}/.test(def) && /\{item "ammo mgun" 3000\}/.test(def) && !/apcr/.test(def), 'the inventory is replaced, every item kept', def.slice(def.indexOf('inventory') - 20, def.indexOf('inventory') + 220));
      ok(/\{weight 4000\}/i.test(def), 'the inventory weight is added', def.slice(def.indexOf('inventory') - 20, def.indexOf('inventory') + 220));
      ok(/place "mgun1"[\s\S]*?foresight "foresight5"/i.test(def), 'the mount line is changed');
      ok(/\{\s*"t34_0"[^\n]*\{level 2\}[^\n]*\{cost 380\}/.test(read(mod, UNITS)), 'the card has the new rank and price');
    },
  }, scratch);
  // novice hazards: every question can be answered, every word is a choice with a label, every default passes its own question,
  // a crew whose doors the model lacks is refused (PORT-137)
  let p = 0, f = 0;
  const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  const qs = [].concat(...recipe.groups.map(g => g.q)), L = recipe._lib, rows = new Map(lang.map(r => [r[0], r]));
  const flat = qs.filter(q => q.kind === 'number' && !(q.limits && q.limits.min < q.limits.max));
  ok(!flat.length, 'no number question has min equal to max', flat.map(q => q.id + ' ' + q.limits.min + '..' + q.limits.max).join(', '));
  const silent = qs.filter(q => q.kind === 'text' && q.limits && q.limits.values);
  ok(!silent.length, 'no text question has allowed words it never shows', silent.map(q => q.id).join(', '));
  const unl = [];
  for (const q of qs) if (q.kind === 'choice' || q.kind === 'vcrew') for (const v of q.limits.values) { const r = rows.get('task.vehicle.v.' + q.id + '.' + v); if (!r || r.slice(1).some(s => !s || !s.trim())) unl.push(q.id + '.' + v); }
  ok(!unl.length, 'every choice has a plain label in en, ru, uk and zh', unl.join(', '));
  ok(['pather', 'collider', 'obstacle', 'simulator', 'targetselector', 'abm', 'trackfx', 'locopreset', 'digits', 'supplykind', 'tow', 'button'].every(id => qs.find(q => q.id === id).kind === 'choice') && qs.find(q => q.id === 'crew').kind === 'vcrew' && qs.find(q => q.id === 'army').kind === 'thing', 'game words are choices, the crew is checked, the army is a lookup');
  const client = require('./vehicle.client');
  ok(client.kinds.includes('vcrew') && kit.clientKeys(client.script, 'vehicle').every(k => rows.has(k) || kit.allRows().en[k]), 'the crew question kind and its strings exist');
  ok(!lang.some(r => /^task\.vehicle\.h\./.test(r[0]) && r.slice(1).some(s => /\b[A-Z]{2,5}-\d{2,3}\b/.test(s))), 'no limit id inside a help');
  ok(!new RegExp(L.ARMOUR_RE).test('armor_medium turret 2500 52 52 20') && new RegExp(L.ARMOUR_RE).test('armor_medium turret 60 52 _ 20'), 'an armour line over 250 mm is refused at the question');
  const buyQ = qs.filter(q => ['buy', 'card'].includes(recipe.groups.find(g => g.q.includes(q)).id) && q.id !== 'remove');
  ok(buyQ.every(q => q.when && q.when.remove === false), 'answering remove skips the card questions', buyQ.filter(q => !(q.when && q.when.remove === false)).map(q => q.id).join(', '));
  ok(qs.find(q => q.id === 'digits').when && qs.find(q => q.id === 'digits').when.numbers === true, 'the number style is asked only with turret numbers');
  const usualOut = qs.filter(q => q.kind === 'number' && q.limits.usual && !(q.limits.usual[0] >= q.limits.min && q.limits.usual[1] <= q.limits.max));
  ok(!usualOut.length && qs.find(q => q.id === 'hearing').limits.usual[0] === 4.5, 'the game range is a warning range inside the hard limits', usualOut.map(q => q.id).join(', '));
  ok(['crew', 'gun', 'abm', 'trackfx', 'load', 'slots', 'locopreset', 'wreckarmour'].every(id => qs.find(q => q.id === id).when.$copy), 'parts the copy lacks of its own are not asked');
  ok(qs.find(q => q.id === 'load').picker.sources.includes('value') && !qs.find(q => q.id === 'mguns').picker.sources.includes('value'), 'items may be typed with a count, machine guns are picked');
  ok(recipe.test === 'task.vehicle.test' && rows.has('task.vehicle.test'), 'the Test step says what to check in game');
  const game = kit.findGame();
  if (game) {
    const ctx = kit.ctxFor(scratch, { gameDir: game }), v = await recipe.values(ctx, { id: 't34_0' }, { verb: 'make' });
    ok(v.title === 'T-34/76', 'the name starts as the game name of the copy', v.title);
    ok(v.remove === false, 'remove starts as no');
    const wre = new RegExp(qs.find(q => q.id === 'wreckarmour').limits.re);
    ok(v.wreckarmour && v.wreckarmour.length && v.wreckarmour.every(l => wre.test(l)) && v.wreckarmour.some(l => / auto$/.test(l)), 'every wreck part is preselected, auto where it has no number', (v.wreckarmour || []).join(', '));
    const bad = [];
    for (const q of qs) {
      const x = v[q.id]; if (x === undefined || x === null || x === '') continue;
      if (q.kind === 'number' && (+x < q.limits.min || +x > q.limits.max)) bad.push(q.id + '=' + x);
      if ((q.kind === 'choice' || q.kind === 'vcrew') && !q.limits.values.includes(x)) bad.push(q.id + '=' + x);
      if (q.kind === 'list' && q.limits && q.limits.re) for (const l of [].concat(x)) if (!new RegExp(q.limits.re).test(l)) bad.push(q.id + ': ' + l);
    }
    ok(!bad.length, 'every default of the T-34 passes its own question, so leaving it is safe', bad.join(' | '));
    const R = L.readerFor(game, ''), u = L.unitOf(R, 't34_0'), model = L.modelOfDraft(ctx, { answers: {} }, u);
    const good = L.crewFit(R, u, 'crew_4_human_extended', model), wheel = L.crewFit(R, u, 'crew_wheeled_gun', model);
    ok(good && good.ok, 'the copy\'s own crew fits its model', JSON.stringify(good));
    ok(wheel && wheel.ok === false && wheel.unknown, 'a crew of another kind of vehicle is refused', JSON.stringify(wheel));
    const u2 = L.unitOf(R, 'sdkfz251_1'), f2 = u2 && L.crewFit(R, u2, 'crew_2_human', L.modelOfDraft(ctx, { answers: {} }, u2));
    ok(f2 && f2.ok === false && f2.missing.length, 'a crew whose door the model lacks is refused, naming the bone', JSON.stringify(f2));
    const cardOf = async crew => (await recipe.check({ base: { id: 't34_0' }, mod: '', answers: crew ? { crew: { src: 'value', value: crew } } : {} }, ctx))[0] || {};
    const c1 = await cardOf('crew_wheeled_gun'), c2 = await cardOf(null);
    ok(c1.level === 'error' && /crew/i.test(c1.lines.join(' ')), 'Check refuses the wrong crew in plain words', JSON.stringify(c1));
    ok(c2.level === 'info', 'Check passes the copy\'s own crew', JSON.stringify(c2));
  }
  console.log(p + ' passed, ' + f + ' failed');
  if (f) process.exitCode = 1;
})();
