// recipe "armour" test: node armour.test.js <scratch>. Changes the armour of two vanilla units in their own scratch mods: the T-34
// (t34_0: armour lines and a repair time) and the BA-64 (ba64: its args factor, the own thickness of its body volume, a side through
// the Models page armour edit route, a volume flag and a part flag).
// Author: Imperator_Aug (ARSENAL, ia-b6856ad7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-armour-')));
const recipe = require('./armour.recipe'), lang = require('./armour.lang');
const fresh = d => { fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(d + '.arsenal-undo', { recursive: true, force: true }); return d; };
const read = (mod, rel) => { try { return fs.readFileSync(path.join(mod, rel), 'latin1'); } catch { return ''; } };
const T34 = 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.def', BA = 'resource/entity/-vehicle/btr/ba64/ba64.def';

(async () => {
  await kit.run(recipe, lang, {
    verb: 'change', base: { id: 't34_0' }, mod: fresh(path.join(scratch, 'mods', 'armour_t34')),
    answers: { parts: ['armor_medium turret 70 52 52 20', 'armor_medium body 60 45 45 22', 'armor_engine t 45 45 45 22', 'armor_mantlet t 40'] },
    planFiles: [T34],
    write: true,
    after: (mod, res, ok) => {
      const def = read(mod, T34);
      ok(/"armor_medium"\s+turret\(\s*70 52 52 20\s*\)\s+body\(\s*60 45 45 22\s*\)/.test(def), 'both areas of the armour line are changed', def.slice(0, 1200));
      ok(/"armor_mantlet"\s+t\(\s*40\s*\)/.test(def), 'an unchanged line stays as it was');
    },
  }, scratch);
  await kit.run(recipe, lang, {
    verb: 'change', base: { id: 'ba64' }, mod: fresh(path.join(scratch, 'mods', 'armour_ba64')),
    answers: { parts: ['armor_medium args 1.1'], volumes: ['body 12'], repair: ['turret 30'], preset: 'armor_light', sides: ['turret front 20'],
      volx: ['crew able.contact_ground 0', 'body1 density 0.05'], partx: ['turret break_by_pierce 0'] },
    planFiles: [BA],
    write: true,
    after: (mod, res, ok) => {
      const def = read(mod, BA);
      ok(/"armor_light"\s+args\s+1\.1/.test(def), 'the factor is changed and the preset swapped', def.slice(0, 800));
      ok(/\{volume\s+"body"\s*(\{(tags|component)[^{}]*\}\s*)*\{thickness\s+12\}/i.test(def), 'the body volume is 12 mm', def.slice(0, 800));
      ok(/\{component\s+"turret"\s*\{RepairTime\s+30\}/i.test(def), 'the turret repair time is 30 s');
      ok(/\{volume\s+"turret"[^]*?\{thickness\s+9\s*\{front\s+20\s*\}/i.test(def), 'the turret front side is 20 mm (armour edit route)', def.slice(def.indexOf('{volume "turret"'), def.indexOf('{volume "turret"') + 200));
      ok(/\{volume\s+"body1"[^]*?\{density\s+0\.05\}/i.test(def), 'the body1 density is set');
      ok(/\{component\s+"turret"[^]*?break_by_pierce\s+0/i.test(def), 'the turret part does not break by pierce');
    },
  }, scratch);
  // every volume and part of the T-34 is preselected (most come from an include): a non own one gets a block of its own, auto drops an own thickness
  const game = kit.findGame(), ctx = kit.ctxFor(scratch, { gameDir: game }), base = game ? await recipe.values(ctx, { id: 't34_0' }) : null;
  if (base) await kit.run(recipe, lang, {
    verb: 'change', base: { id: 't34_0' }, mod: fresh(path.join(scratch, 'mods', 'armour_t34b')),
    answers: { volumes: base.volumes.map(l => /^trackleft /i.test(l) ? 'trackleft 25' : /^gun /i.test(l) ? 'gun auto' : /^body1 /i.test(l) ? 'body1 8' : l),
      repair: base.repair.map(l => /^turret /i.test(l) ? 'turret 40' : l) },
    planFiles: [T34],
    write: true,
    after: (mod, res, ok) => {
      const def = read(mod, T34);
      ok(/\{volume\s+"trackleft"\s*\{thickness\s+25\}\s*\}/i.test(def), 'an included volume gets its own block with the new thickness', def.slice(-600));
      ok(/\{volume\s+"body1"[^]*?\{thickness\s+8\}/i.test(def), 'an own volume without a thickness gets one');
      ok(!/\{volume\s+"Gun"[^]*?\{thickness\s+30\}/i.test(def), 'auto drops the own thickness of the gun volume');
      ok(/\{component\s+"turret"\s*\{RepairTime\s+40\}\s*\}/i.test(def), 'an included part gets its own block with the new repair time', def.slice(-600));
    },
  }, scratch);
  // novice hazards: the answer is refused at the question, the defaults are filled, the words are plain
  let p = 0, f = 0;
  const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  const q = id => [].concat(...recipe.groups.map(g => g.q)).find(x => x.id === id), re = id => new RegExp(q(id).limits.re);
  ok(!re('parts').test('armor_medium turret 2500 52 52 20') && re('parts').test('armor_medium turret 60 52 52 20 2') && re('parts').test('armor_medium body _ 45 45 22'), 'an armour line over 250 mm is refused at the question');
  ok(re('volumes').test('turret hollow 3') && re('volumes').test('turret auto') && re('volumes').test('turret 45 0.3') && !re('volumes').test('turret 2000') && !re('volumes').test('turret hollow'), 'volume lines: auto, hollow N and 0 to 1500 mm');
  ok(!re('repair').test('turret 900') && !re('repair').test('turret 0') && re('repair').test('turret 62.5'), 'repair seconds 1 to 600');
  ok(!re('volx').test('body density 0.5') && !re('volx').test('body able.fly 1') && re('volx').test('body1 density 0.05'), 'volume settings: density 0 to 0.1 and known flags only');
  ok(!re('sides').test('body front 5000') && re('sides').test('body front 20'), 'side millimetres 0 to 1000');
  if (base) {
    ok(base.volumes.includes('turret auto') && base.volumes.some(l => /^trackleft 20$/i.test(l)), 'every hit volume is preselected, auto where it has no number', base.volumes.join(', '));
    ok(base.repair.some(l => /^turret 62\.5$/i.test(l)), 'every part is preselected with its repair time', base.repair.join(', '));
  }
  ok(/vehicle/.test(lang.find(r => r[0] === 'task.armour.t')[1]), 'the title says vehicle');
  ok(!recipe.kept.some(k => /meaning not proven/.test(k[1])), 'kept reasons are plain sentences');
  ok(!lang.some(r => /^task\.armour\.h\./.test(r[0]) && r.slice(1).some(s => /\b[A-Z]{2,5}-\d{2,3}\b/.test(s))), 'no limit id inside a help');
  console.log(p + ' passed, ' + f + ' failed');
  if (f) process.exitCode = 1;
})();
