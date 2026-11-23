// recipe "make a mod" test: node mod.test.js <scratch>. The kit checks the recipe, strings, steps, compile and the dry run of the `new`
// command; then the mod is written for real into the scratch folder and mod.info is read back. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Game parity: a MoW:AS2 draft runs newmod --target mowas2 (3.262 range); a GoH draft asks no place (never the GoH install), runs
// newmod --target goh with the GoH install as --game, and a folder inside a GoH install (a made-up one here) gets the write guard's
// refusal at compile. With a real GoH install found, the GoH mod is written into the scratch folder and its range is the exe version.
// Author: Imperator_Aug (ARSENAL, ia-9df3e1d7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const RC = require('../lib/recipe'), D = require('../lib/draft'), CP = require('../lib/compile');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-mod-')));
const where = path.join(scratch, 'mods');
fs.mkdirSync(where, { recursive: true });
const R = require('./mod.recipe'), L = require('./mod.lang');

(async () => {
  await kit.run(R, L, {
    answers: { place: 'other', where, folder: 'tasktest', title: 'Task test', desc: 'Made by the guided task test', deps: [] },
    planFiles: ['mod.info'],
    write: true,
    after: (mod, res, ok) => {
      const info = fs.readFileSync(path.join(mod, 'mod.info'), 'utf8');
      ok(path.basename(mod) === 'tasktest', 'the mod folder is the one asked for', mod);
      ok(/Task test/.test(info), 'mod.info has the title', info);
      ok(/Made by the guided task test/.test(info), 'mod.info has the description', info);
    },
  }, scratch);

  // ---- game parity: MoW:AS2 and GoH ----
  let pass = 0, fail = 0;
  const ok = (c, what, more) => { if (c) pass++; else { fail++; console.log('FAIL ' + what + (more ? ': ' + String(more).slice(0, 600) : '')); } };
  const ctx = kit.ctxFor(scratch, { gameDir: false });
  const draftOf = (game, answers) => {
    const d = { id: D.newId('mod'), recipe: 'mod', verb: 'make', game, mod: '', base: null, answers: {}, kept: [], state: 'open' };
    for (const [k, v] of Object.entries(answers)) d.answers[k] = { src: 'value', value: v };
    D.save(ctx, d); return d;
  };
  const compileOf = async d => { try { return { c: await CP.compile(ctx, d, { mod: R }) }; } catch (e) { return { e }; } };
  const qs = (game, vals) => RC.steps(R, { recipe: 'mod', verb: 'make', game, answers: {}, kept: [] }, vals || {}).filter(s => s.kind === 'q').map(s => s.q);

  ok(R.games.includes('goh') && R.games.includes('mowas2'), 'the mod task is offered for MoW:AS2 and GoH');
  // steps: AS64 and MoW:AS2 ask the place; GoH asks only another folder (its own question)
  const a64 = qs('as64', { place: 'game' }), goh = qs('goh', { place: 'other' });
  ok(a64.includes('place') && a64.includes('folder') && !a64.includes('where_goh'), 'AS64 asks the place and the folder name', a64.join(' '));
  ok(qs('', { place: 'game' }).includes('place'), 'a draft with no game asks as AS64 did');
  ok(!goh.includes('place') && !goh.includes('where') && goh.includes('where_goh') && goh.includes('folder_goh'), 'GoH asks no place, only another folder', goh.join(' '));
  ok(R.values({ game: () => scratch, gameId: 'goh' }, null, { game: 'goh' }).place === 'other', 'GoH values: the place is another folder, never the game');
  ok(R.values({ game: () => scratch, gameId: 'as64' }, null, {}).where === path.join(scratch, 'mods'), 'AS64 values: the game mods folder, as before');

  // MoW:AS2: newmod --target mowas2
  const m2 = await compileOf(draftOf('mowas2', { place: 'other', where, folder: 'tasktest_m2', title: 'M2 test' }));
  const m2c = m2.c && m2.c.calls[0];
  ok(m2c && m2c.tool === 'newmod' && m2c.args.join(' ').includes('--target mowas2'), 'MoW:AS2 runs newmod --target mowas2', JSON.stringify(m2c || m2.e && m2.e.message));

  // GoH in the game files of a (made-up) GoH install: the write guard's refusal is the plain line at compile (a new folder in <GoH>/mods may be written, owner 2026-11-15)
  const fake = path.join(scratch, 'fake_goh_install');
  fs.mkdirSync(path.join(fake, 'binaries', 'x64'), { recursive: true }); fs.mkdirSync(path.join(fake, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'binaries', 'x64', 'call_to_arms.exe'), 'not a real exe');
  const inGoh = await compileOf(draftOf('goh', { where_goh: path.join(fake, 'resource'), folder_goh: 'tasktest_goh', title: 'GoH test' }));
  ok(!inGoh.c && inGoh.e && /Gates of Hell/i.test(inGoh.e.message), 'GoH: a folder in the GoH game files is refused with the guard line', inGoh.e ? inGoh.e.message : 'compiled');

  // GoH outside: newmod --target goh (and --game when the GoH install is known)
  const gw = path.join(scratch, 'goh_mods'); fs.mkdirSync(gw, { recursive: true });
  const gd = draftOf('goh', { where_goh: gw, folder_goh: 'tasktest_goh', title: 'GoH test', desc: 'GoH made by the task test' });
  const g1 = await compileOf(gd), gc = g1.c && g1.c.calls[0];
  ok(gc && gc.tool === 'newmod' && gc.args[0] === path.join(gw, 'tasktest_goh') && gc.args.join(' ').includes('--target goh'), 'GoH runs newmod --target goh into the folder picked', JSON.stringify(gc || g1.e && g1.e.message));
  let gohDir = null; try { gohDir = require('../../../../lib/games').install('goh').dir || null; } catch (e) { gohDir = null; }
  if (gc && gohDir) ok(gc.args.includes('--game') && gc.args[gc.args.indexOf('--game') + 1] === gohDir, 'GoH: --game is the GoH install', gc.args.join(' '));
  // a real GoH install: write it (read-only on the install: newmod reads the exe version) and read the range back
  if (gohDir && gc) {
    let p = null; try { p = await CP.plan(ctx, gd, { mod: R }); } catch (e) { ok(false, 'GoH plan runs', e.message); }
    ok(p && !p.errors.length, 'GoH plan has no errors (newmod dry run)', p && JSON.stringify(p.errors).slice(0, 600));
    let w = {}; try { w = await CP.write(ctx, gd, { mod: R }); } catch (e) { w = { errors: [e.message] }; }
    const info = (() => { try { return fs.readFileSync(path.join(gw, 'tasktest_goh', 'mod.info'), 'utf8'); } catch (e) { return ''; } })();
    const mn = /MinGameVersion\s+"?([0-9.]+)/i.exec(info), mx = /MaxGameVersion\s+"?([0-9.]+)/i.exec(info);
    ok(w.written || info, 'GoH: the mod is written into the folder picked', JSON.stringify(w.errors || []).slice(0, 600));
    ok(mn && mx && mn[1] === mx[1] && /^1\.\d+/.test(mn[1]), 'GoH mod.info: Min and Max are the GoH exe version (PORT-46)', info.slice(0, 400));
    ok(!fs.existsSync(path.join(gohDir, 'mods', 'tasktest_goh')), 'GoH: nothing is written into the GoH install');
  } else console.log('SKIP GoH write: no GoH install found');
  console.log(pass + ' passed, ' + fail + ' failed (game parity)');
  console.log(fail || process.exitCode ? 'FAIL' : 'PASS');
  if (fail) process.exitCode = 1;
})();
