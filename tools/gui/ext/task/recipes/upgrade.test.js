// recipe "change an old mod to 64-bit" test: node upgrade.test.js <scratch>. An old 3.262 mod is built in the scratch folder; the
// recipe compiles to one {cmd: 'upgrade'} call: Review runs `upgrade --plan` (nothing written), Write runs the real upgrade into the
// new folder. A fake game folder stands in for the AS2 install (the GUI's game folder fills --as2). The old mod must stay byte for
// byte. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-715b086f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./upgrade.recipe'), L = require('./upgrade.lang'), CL = require('./upgrade.client');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-upgrade-')));
fs.rmSync(path.join(scratch, 'upgrade-case'), { recursive: true, force: true });
const root = path.join(scratch, 'upgrade-case'), old = path.join(root, 'old', 'oldmod'), out = path.join(scratch, 'mods', 'oldmod_64');
fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(out + '.arsenal-undo', { recursive: true, force: true });
require('../../../../upgrade/test/fx').build(old);
const fake = path.join(root, 'fakegame');
fs.mkdirSync(path.join(fake, 'resource'), { recursive: true });
const tree = d => { const h = crypto.createHash('sha1'); for (const r of R.ST.walk(d)) h.update(r + '\0').update(fs.readFileSync(path.join(d, r))); return h.digest('hex'); };
const before = tree(old);

let bad = 0, good = 0;
const ok = (c, m, x) => { if (c) good++; else { bad++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 1200) : '')); } };

(async () => {
  const id = 'upgrade-test-' + crypto.randomBytes(3).toString('hex');
  const ctx = kit.ctxFor(scratch, { gameDir: fake });
  fs.mkdirSync(ctx.tmpRoot, { recursive: true });   // compile.js runCmd makes its temp folder in tmpRoot without making tmpRoot first
  const answers = { src: old, from: 'auto', to: 'as64', mode: 'enhanced', out, export: false, only: [], to_build: '', patch: '', as2_dir: '', goh_dir: '' };
  const draft = { id, recipe: 'upgrade', verb: 'change', game: 'as64', mod: out, base: null, answers: {}, kept: [], state: 'open' };
  for (const [k, v] of Object.entries(answers)) draft.answers[k] = { src: 'value', value: v };
  fs.mkdirSync(out, { recursive: true });
  D.save(ctx, draft);

  // the call: one upgrade command into the new folder, the GUI's game folder as --as2, never --then-fix
  const c = await CP.compile(ctx, D.load(ctx, id), { upgrade: R });
  const cl = c.calls[0] || {};
  ok(c.calls.length === 1 && cl.cmd === 'upgrade' && !c.copies.length, 'compile gives one upgrade command and no copies', JSON.stringify(c.calls));
  ok(cl.input && cl.input.mod === old && cl.input.out === out && cl.input.to === 'as64' && cl.input.mode === 'enhanced', 'the command reads the old mod and writes the new folder', JSON.stringify(cl.input));
  ok(cl.input && cl.input.as2 === fake && !('thenFix' in cl.input) && !('from' in cl.input) && !('noLink' in cl.input), 'as2 is the GUI game folder; no then fix, no from for auto', JSON.stringify(cl.input));
  ok(R.groups.every(g => g.q.every(q => q.kind !== 'up-stage')) && !R.routes, 'no staging route or step is left');
  // a goh copy passes the donor and the version; an as64 copy does not
  const gi = R.cmdInput(R.inputs(k => ({ to: 'goh', donor: 'auto', goh_version: '1.050', mode: 'enhanced', src: old })[k], out, fake));
  ok(gi.donor === 'auto' && gi.gohVersion === '1.050' && !gi.mode, 'a Gates of Hell copy passes donor and version, no mode', JSON.stringify(gi));
  // refusals in plain words
  const refuseOf = async (patch, m) => { const d = JSON.parse(JSON.stringify(draft)); Object.assign(d.answers, patch); d.id = id; D.save(ctx, d); let why = null; try { await CP.compile(ctx, D.load(ctx, id), { upgrade: R }); } catch (e) { why = e; } ok(why && m.test(why.message), 'refused: ' + m, why && why.message); };
  await refuseOf({ as2_dir: { src: 'value', value: path.join(root, 'no-such-game') } }, /AS2 game folder is not there/);
  await refuseOf({ src: { src: 'value', value: path.join(root, 'gone') } }, /old mod folder first/);
  fs.writeFileSync(path.join(out, 'x.txt'), 'x');
  await refuseOf({}, /new or empty/);
  fs.rmSync(path.join(out, 'x.txt'));
  D.save(ctx, draft);

  // plan: upgrade --plan runs, nothing is written
  const p = await CP.plan(ctx, D.load(ctx, id), { upgrade: R });
  const pc = p.calls[0] || {};
  ok(!p.errors.length && pc.kind === 'cmd' && pc.args.includes('--plan') && !pc.args.includes('--out'), 'plan runs upgrade --plan without --out', JSON.stringify(p.errors) + ' ' + JSON.stringify(pc.args));
  ok(fs.readdirSync(out).length === 0 && tree(old) === before, 'plan writes nothing');
  // the page script: ES5 only
  ok(!/=>|`|\$\{|innerHTML|\blet |\bconst /.test(CL.script), 'page script is ES5 (no arrow, backtick, dollar-brace, innerHTML, let, const)');
  try { new Function(CL.script); ok(true, 'page script parses'); } catch (e) { ok(false, 'page script parses', e.message); }
  ok(CL.kinds.join() === 'up-out,up-dir', 'the client has the up-out and up-dir kinds');
  // novice round
  const QS = {}; R.groups.forEach(g => g.q.forEach(q => { QS[q.id] = q; }));
  ok(QS.goh_dir.when && QS.goh_dir.when.to === 'goh', 'the Gates of Hell folder is asked only for a Gates of Hell copy');
  ok(['patch', 'as2_dir', 'goh_dir'].every(k => QS[k].kind === 'up-dir') && /pick\('dir'/.test(CL.script) && /data-up-dir-pick/.test(CL.script), 'the folder questions have a Pick button');
  const LK = {}; L.forEach(r => { LK[r[0]] = r; });
  ok(['k.dirPick', 'k.dirAbs', 'k.dirEmpty'].every(k => LK['task.upgrade.' + k]), 'the folder kind strings have rows');
  const flags = L.filter(r => /^task\.upgrade\.h\./.test(r[0]) && r.slice(1).some(t => /\((only|to build|patch|donor|goh version|as2|goh|export|auto)\)/.test(t)));
  ok(!flags.length, 'no command line flag names in brackets in the help', flags.map(r => r[0]).join(', '));
  ok(/58826db6/.test(LK['task.upgrade.h.to_build'][1]) && /game\.log/.test(LK['task.upgrade.h.to_build'][1]), 'the build help gives a typical value and where to find it');
  ok(LK['task.upgrade.t'][4] === '旧模组（改为 64 位）', 'the Chinese title reads after the verb');
  ok(/32-bit$/.test(LK['task.upgrade.v.from.mowas2'][1]) && LK['task.upgrade.v.from.mowas2'][1] === 'Assault Squad 2, 32-bit' && LK['task.upgrade.v.to.mowas2'][1] === 'Assault Squad 2, 32-bit', 'the game labels use one pattern');
  ok(['ru', 'uk', 'zh'].every((x, j) => ['enhanced', 'classic'].every(m => /[^\x00-\x7f]/.test(LK['task.upgrade.v.mode.' + m][j + 2]))), 'Enhanced and Classic are translated next to the English names');
  ok(/32-bit/.test(LK['task.upgrade.h.mode'][1]) && /Classic mode/.test(LK['task.upgrade.h.mode'][1]), 'Classic has one meaning: the old 3.262 rules, loads in the 32-bit game and in Classic mode');
  ok(/32-bit/.test(LK['task.upgrade.h.to'][1]) && /Gates of Hell/.test(LK['task.upgrade.h.to'][1]), 'the to help names the other targets the title does not');
  ok(LK['task.upgrade.h.to'].slice(1).every(t => /Gates of Hell|地狱之门/.test(t) && t.split(/Gates of Hell|地狱之门/).length >= 3), 'the to help says the Gates of Hell tab picks Gates of Hell at first, in the four languages');
  ok(!R.kept.some(r => /\.js|compile|--|\/api\//.test(r[1])), 'kept reasons are in the user\'s words', R.kept.filter(r => /\.js|compile|--|\/api\//.test(r[1])).map(r => r[0]).join(', '));
  ok(!L.some(r => r.slice(1).some(t => / - | — | – /.test(t))), 'no dash punctuation');
  ok(R.title && R.title.change === 'task.upgrade.t' && R.test === 'task.upgrade.test' && /Read Game\.log/.test(LK['task.upgrade.test'][1]) && /old mod off/.test(LK['task.upgrade.test'][1]), 'title per verb; the Test step says how to start the copy and what game.log must not show');

  // ---- game parity: Gates of Hell opens the task with the copy going to GoH and the tab's GoH install; MoW:AS2 keeps the 64-bit target
  ok(R.games.join() === 'as64,mowas2,goh', 'the task is offered on the three tabs', R.games.join());
  const fakeGoh = path.join(root, 'fakegoh');
  fs.mkdirSync(path.join(fakeGoh, 'mods', 'gohmod'), { recursive: true }); fs.mkdirSync(path.join(fakeGoh, 'binaries', 'x64'), { recursive: true });
  fs.writeFileSync(path.join(fakeGoh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');   // a made-up GoH install: writeguard knows it by this file
  fs.writeFileSync(path.join(fakeGoh, 'mods', 'gohmod', 'mod.info'), '{mod\r\n\t{Name "GoH mod"}\r\n\t{MinGameVersion "1.067"}\r\n}\r\n');
  fs.mkdirSync(path.join(fake, 'mods', 'as2mod'), { recursive: true });
  const gctx = gid => Object.assign({}, ctx, { gameId: () => gid, curDir: () => (gid === 'goh' ? fakeGoh : fake), gohDir: () => fakeGoh });
  const vA = R.values(ctx, null, { game: 'as64' }), vM = R.values(gctx('mowas2'), null, { game: 'mowas2' }), vG = R.values(gctx('goh'), null, { game: 'goh' });
  ok(vA.to === 'as64' && vA.goh_dir === '' && JSON.stringify(R.values(ctx, null, {})) === JSON.stringify(vA), 'as64 and no game: copy to AS64, no GoH folder (as before)', JSON.stringify(vA));
  ok(vM.to === 'as64' && vM.goh_dir === '', 'MoW:AS2: copy to AS64 (the 64-bit target kept)', JSON.stringify(vM));
  ok(vG.to === 'goh' && vG.goh_dir === fakeGoh && vG.from === 'auto', 'Gates of Hell: copy to GoH, the GoH folder from the tab', JSON.stringify(vG));
  ok(R.values(Object.assign({}, ctx, { gameId: 'goh', curDir: () => fakeGoh }), null, {}).to === 'goh', 'a game given as a string (compile lookupCtx) works too');
  const lG = await R._t.oldmods(gctx('goh'), '', { game: 'goh' }), lA = await R._t.oldmods(gctx('as64'), '', { game: 'as64' });
  ok(lG.some(x => x.id === path.resolve(fakeGoh, 'mods', 'gohmod') && x.name === 'GoH mod') && lG.some(x => x.sub === 'as2mod'), 'Gates of Hell: the GoH mods and the AS2 mods are offered', JSON.stringify(lG.map(x => x.id)));
  ok(!lA.some(x => /fakegoh/.test(x.id)) && lA.some(x => x.sub === 'as2mod'), 'AS64: the AS2 mods only', JSON.stringify(lA.map(x => x.id)));
  { // compile of a Gates of Hell draft: one upgrade call to goh with the GoH folder and the donor; the out folder is the user's
    const gidd = id + 'g', outG = path.join(scratch, 'mods', 'oldmod_goh'); fs.rmSync(outG, { recursive: true, force: true }); fs.mkdirSync(outG, { recursive: true });
    const dg = { id: gidd, recipe: 'upgrade', verb: 'change', game: 'goh', mod: outG, base: null, answers: {}, kept: [], state: 'open' };
    for (const [k, v] of Object.entries(Object.assign({}, vG, { src: old, out: outG }))) dg.answers[k] = { src: 'value', value: v };
    D.save(ctx, dg);
    const cg = await CP.compile(gctx('goh'), D.load(ctx, gidd), { upgrade: R }), ig = (cg.calls[0] || {}).input || {};
    ok(cg.calls.length === 1 && ig.to === 'goh' && ig.goh === fakeGoh && ig.donor === 'auto' && !ig.mode && ig.as2 === fake && ig.out === outG, 'Gates of Hell draft: upgrade --to goh with the tab GoH folder, no mode', JSON.stringify(ig));
    // a new folder in the game files of a Gates of Hell install: the write guard's refusal in plain words (<GoH>/mods/<new> may be written, owner 2026-11-15)
    const inGoh = path.join(fakeGoh, 'resource', 'oldmod_goh'), dw = JSON.parse(JSON.stringify(dg)); dw.id = gidd + 'w'; dw.mod = inGoh; dw.answers.out = { src: 'value', value: inGoh };
    D.save(ctx, dw); let why = null; try { await CP.write(gctx('goh'), D.load(ctx, dw.id), { upgrade: R }); } catch (e) { why = e; }
    ok(why && /Gates of Hell|GoH|game folder|install/i.test(why.message) && !fs.existsSync(inGoh), 'a new folder in the GoH game files is refused in plain words, nothing written', why && why.message);
    // the real GoH install, read only: upgrade --plan --to goh of the 3.262 fixture mod with it as the GoH folder
    let real = null; try { real = require('../../../../lib/games').install('goh').dir; } catch { real = null; }
    if (!real || !fs.existsSync(real)) console.log('note: SKIP the real GoH plan: no GoH install on this PC');
    else {
      const dr = JSON.parse(JSON.stringify(dg)); dr.id = gidd + 'r'; dr.answers.goh_dir = { src: 'value', value: real }; D.save(ctx, dr);
      const pr = await CP.plan(gctx('goh'), D.load(ctx, dr.id), { upgrade: R }), prc = pr.calls[0] || {};
      ok(!pr.errors.length && prc.args && prc.args.includes('--plan') && prc.args.join(' ').includes('--to goh') || (prc.args && prc.args.indexOf('goh') === prc.args.indexOf('--to') + 1), 'real GoH install: upgrade --plan --to goh runs (read only)', JSON.stringify(pr.errors) + ' ' + JSON.stringify(prc.args));
      ok(fs.readdirSync(outG).length === 0 && tree(old) === before, 'real GoH plan: nothing written');
      fs.writeFileSync(path.join(scratch, 'upgrade-goh-plan.txt'), JSON.stringify(pr, null, 1));
    }
  }

  const res = await kit.run(R, L, {
    id: id + 'k', answers, verb: 'change', game: 'as64', mod: out, gameDir: fake,
    validate: { kinds: CL.kinds },
    write: true,
    after: (mod, w, ok2) => {
      const info = fs.readFileSync(path.join(mod, 'mod.info'), 'latin1'), files = R.ST.walk(mod);
      ok2(path.resolve(mod) === path.resolve(out), 'the write went into the new folder', mod);
      ok2(/MinGameVersion\s+"3\.301/i.test(info), 'mod.info now names 3.301', info);
      ok2(!/FileId/i.test(info), 'the copy has no FileId of the original', info);
      ok2(fs.existsSync(path.join(mod, 'UPGRADE.md')), 'UPGRADE.md is in the new folder');
      ok2(!files.some(f => /\.dll$/i.test(f)), 'no DLL is copied', files.join(', '));
      ok2(w.restore.length === files.length && !w.unguarded.length, 'a restore point per file (' + w.restore.length + ' of ' + files.length + ')');
      ok2(!fs.existsSync(out + '-fixpatch'), 'nothing is written beside the new folder');
      ok2(tree(old) === before, 'the old mod is unchanged after the write');
    },
  }, scratch);
  console.log('recipe extra: ' + good + ' passed, ' + bad + ' failed');
  if (bad || res.fails) { console.log('FAIL'); process.exitCode = 1; } else console.log('PASS');
})().catch(e => { console.log('FAIL crashed ' + (e.stack || e)); process.exitCode = 1; });
