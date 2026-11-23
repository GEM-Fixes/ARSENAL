// recipe "fix my mod's problems" test: node fixmod.test.js <scratch>. The fix tool's own fixture (tiny game + loose mod m1) is built
// in the scratch folder; the recipe's scan route runs check and fix plan (read only), the stage route runs fix apply into the task's
// staging folder; then the kit checks the recipe, strings, census coverage, compile, a plan that writes nothing, and the write in
// place with restore points. The Gates of Hell path writes nothing. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-42eb24fe)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./fixmod.recipe'), L = require('./fixmod.lang'), CL = require('./fixmod.client'), ST = require('./upgrade.recipe').ST;
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-fixmod-')));
const fxd = path.join(scratch, 'fixmod-case');
fs.rmSync(fxd, { recursive: true, force: true });
const mk = cp.spawnSync(process.execPath, [path.join(__dirname, '..', '..', '..', '..', 'fix', 'test', 'mkfixture.js'), fxd], { encoding: 'utf8' });
const game = path.join(fxd, 'game'), mod = path.join(game, 'mods', 'm1');
const tree = d => { const h = crypto.createHash('sha1'); for (const r of ST.walk(d)) h.update(r + '\0').update(fs.readFileSync(path.join(d, r))); return h.digest('hex'); };

let bad = 0, good = 0;
const ok = (c, m, x) => { if (c) good++; else { bad++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 1200) : '')); } };

(async () => {
  ok(mk.status === 0 && fs.existsSync(mod), 'the fix fixture is built', mk.stderr);
  const before = tree(mod);
  const id = 'fixmod-test-' + crypto.randomBytes(3).toString('hex'), newId = D.newId;
  D.newId = r => (r === 'fixmod' ? id : newId(r));
  const ctx = kit.ctxFor(scratch, { gameDir: game });
  const draft = { id, recipe: 'fixmod', verb: 'change', game: 'as64', mod, base: null, answers: { target: { src: 'value', value: 'as64' }, mods: { src: 'value', value: [] } }, kept: [], state: 'open' };
  D.save(ctx, draft);
  const scan = R.routes['POST /api/x/task/r/fixmod/scan'], stage = R.routes['POST /api/x/task/r/fixmod/stage'];

  let why = null; try { await scan(null, { draft }, Object.assign({}, ctx, { session: { remote: true } })); } catch (e) { why = e; }
  ok(why && why.status === 403, 'scan refuses LAN Remote', why && why.message);

  const s = await scan(null, { draft }, ctx);
  ok(s.ok && s.fixRan, 'scan runs fix plan', JSON.stringify(s).slice(0, 800));
  ok(s.check && typeof s.check.verdict === 'string', 'scan reports the check verdict (' + (s.check && s.check.verdict) + ')');
  ok(s.safe.some(x => x.kind === 'lng'), 'the lng fix is in the safe group', JSON.stringify(s.safe));
  ok(s.items.length > 0 && s.items.every(it => it.id && (it.code || it.fix)), 'the walk list has items (' + s.items.length + ')', JSON.stringify(s.items).slice(0, 600));
  ok(s.items.every(it => !it.fix || !R.KINDS.includes(it.fix) || !require('../../../../lib/explain').FIXERS[it.fix] || !require('../../../../lib/explain').FIXERS[it.fix].safe), 'no safe fixer is in the walk');
  ok(tree(mod) === before, 'scan writes nothing into the mod');

  draft.answers.scan = { src: 'value', value: s };
  draft.answers.safe = { src: 'value', value: true };
  draft.answers.sets = { src: 'value', value: [] };
  D.save(ctx, draft);
  const walkDraft = JSON.parse(JSON.stringify(draft)); walkDraft.answers.walk = { src: 'value', value: { picks: {} } };
  const g = await stage(null, { draft: walkDraft }, ctx);
  ok(g.ok && g.files > 0 && g.kinds.includes('lng'), 'stage runs fix apply with the safe fixers (' + (g.kinds || []).join(',') + ', ' + g.files + ' files)', JSON.stringify(g).slice(0, 800));
  ok(tree(mod) === before, 'stage writes nothing into the mod');
  const map = ST.load(D.stageDir(ctx, id), 'fx');
  // JOBS: the footer's Cancel kills the tool (ctx.runTool answers cancelled): the route ends at once, stages nothing, writes nothing
  { const sj = { cancelled: false }; let runs = 0;
    const sctx = Object.assign({}, ctx, { job: sj, runTool: async () => { runs++; sj.cancelled = true; return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } });
    const ss = await scan(null, { draft }, sctx);
    ok(ss && ss.stopped === true && ss.ok === false && runs === 1, 'a stopped scan ends after the killed check: fix plan is not started', JSON.stringify(ss) + ' runs ' + runs);
    sj.cancelled = false; runs = 0;
    const sg = await stage(null, { draft: walkDraft }, sctx), map2 = ST.load(D.stageDir(ctx, id), 'fx');
    ok(sg && sg.stopped === true && sg.ok === false && JSON.stringify(map2) === JSON.stringify(map) && tree(mod) === before, 'a stopped stage keeps the fixes staged before and writes nothing', JSON.stringify(sg));
    ok(!fs.existsSync(path.join(D.stageDir(ctx, id), 'fx-work')) && !fs.existsSync(path.join(D.stageDir(ctx, id), 'fx-scan')), 'a stopped scan or stage leaves no work folder'); }
  ok(map && !map.files.some(f => f.rel === 'mod.info' && false) && map.files.every(f => f.rel.toLowerCase() !== 'mod.info.fixed'), 'the patch\'s own files are mapped (mod.info.fixed becomes mod.info)', map && JSON.stringify(map.files.map(f => f.rel)));
  draft.answers.walk = { src: 'value', value: { picks: {}, sig: g.sig, files: g.files } };
  D.save(ctx, draft);

  const p = await CP.plan(ctx, D.load(ctx, id), { fixmod: R });
  ok(!p.errors.length && p.files.length === g.files && !p.calls.length, 'plan lists the fixed files, runs no command', JSON.stringify(p.errors));
  ok(tree(mod) === before, 'plan writes nothing');
  const stale = JSON.parse(JSON.stringify(draft)); stale.answers.safe = { src: 'value', value: false }; D.save(ctx, stale);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { fixmod: R }); } catch (e) { why = e; }
  ok(why && /changed after/.test(why.message), 'an answer changed after the fixes were made is refused', why && why.message);
  // More choices: a typed game folder that is not there is refused; the same folder typed out keeps the scan; another one asks for it again
  const nogd = JSON.parse(JSON.stringify(draft)); nogd.answers.game_dir = { src: 'value', value: path.join(scratch, 'no-such-game') }; D.save(ctx, nogd);
  why = null; try { await scan(null, { draft: nogd }, ctx); } catch (e) { why = e; }
  ok(why && /folder you typed is not there/.test(why.message), 'a typed game folder that is not there is refused', why && why.message);
  const samegd = JSON.parse(JSON.stringify(draft)); samegd.answers.game_dir = { src: 'value', value: game }; D.save(ctx, samegd);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { fixmod: R }); } catch (e) { why = e; }
  ok(!why, 'typing the same game folder keeps the scan', why && why.message);
  const othergd = JSON.parse(JSON.stringify(draft)); othergd.answers.game_dir = { src: 'value', value: fxd }; D.save(ctx, othergd);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { fixmod: R }); } catch (e) { why = e; }
  ok(why && /game folder.*changed after/.test(why.message), 'another game folder after the scan asks for it again', why && why.message);
  D.save(ctx, draft);

  // novice round: the stage route's same mode (the values step) keeps the fixes the walk made when nothing changed
  const sm = await stage(null, { draft: D.load(ctx, id), same: true }, ctx);
  ok(sm.ok && sm.same === true && sm.sig === g.sig, 'the values step keeps the walk\'s fixes when the values change nothing', JSON.stringify(sm).slice(0, 300));
  const pc = await CP.compile(ctx, D.load(ctx, id), { fixmod: R });
  ok(!pc.notes.some(n => /fix apply|--only|--target/.test(n)) && pc.notes.some(n => /^Makes \d+ file\(s\) with these fixes: .*keep the game texts/.test(n)), 'Review notes say the fixes in plain words, no command line', pc.notes.join(' | '));
  // novice round: the question order and groups
  const qOf = gid => R.groups.find(x => x.id === gid).q.map(q => q.id);
  ok(qOf('look').join() === 'target,mods,game_dir,scan', 'the game folder is asked in the first group, before the scan', qOf('look').join());
  ok(qOf('fix').join() === 'safe,walk' && qOf('more').join() === 'sets' && !R.groups.find(x => x.id === 'more').essential, 'the expert values (file:path=value) are in More choices, not in an essential group');
  ok(R.groups.find(x => x.id === 'more').q[0].kind === 'fix-sets' && CL.kinds.includes('fix-sets'), 'the values step has its own kind that makes the fixes again');
  const en = k => (L.find(r => r[0] === k) || [])[1] || '';
  ok(/IDE tab, Restore points panel \(or the Mod Files page, Undo tab, with Advanced on\)/.test(en('task.fixmod.c.undo')), 'the undo line names the IDE tab, Restore points panel, or Mod Files, Undo tab');
  ok(R.title && R.title.change === 'task.fixmod.t' && R.test === 'task.fixmod.test' && /Read Game\.log page/.test(en('task.fixmod.test')) && /Читать game\.log/.test((L.find(r => r[0] === 'task.fixmod.test') || [])[2]), 'title per verb; the Test step says how to start the game and what game.log must not show');
  ok(!L.some(r => /Fix page|Logs page|(?<!Mod )Files page/.test(r[1])) && !R.kept.some(k => /Fix page|Logs page/.test(k[1])), 'no string or kept reason names a page that does not exist');
  ok(/Nothing changes in your mod until the Write step/.test(en('task.fixmod.h.walk')), 'the walk help says the mod is not changed before Write');
  ok(/\{n\}/.test(en('task.fixmod.k.next')) && /Problems you did not open stay/.test(en('task.fixmod.k.mainNext')) && /data-fix-mainnext/.test(CL.script), 'card buttons say Show problem n; a line above the main Next says what it does');
  ok(/page:check/.test(CL.script) && /fixLines/.test(CL.script) && /Check page/.test(en('task.fixmod.k.fixFail')) && /Check page/.test(en('task.fixmod.k.makeFail')) && !/\{c\}/.test(en('task.fixmod.k.makeFail')), 'a failed fixer shows its last lines and a button to the Check page, no bare code');
  ok(/'lim:'/.test(CL.script) && /task\.q\.limit/.test(CL.script) && !/limits\.slice\(0, 3\)\.join/.test(CL.script), 'limit ids are small why links, not text in the card');
  ok(/TASK\.close\(\)\.then/.test(CL.script) && !/task\.fixmod\.k\.saved/.test(CL.script) && /Continue/.test(en('task.fixmod.k.editHint')), 'leaving for the Editor saves the task (the core says so) and the hint says how to come back');
  ok(/64-bit/.test(en('task.fixmod.v.target.as64')) && /32-bit/.test(en('task.fixmod.v.target.mowas2')) && /Classic mode \(the old 3\.262 rules\)/.test(en('task.fixmod.v.target.classic')), 'one spelling of 64-bit and 32-bit; Classic is the 3.262 rules');
  ok(!L.some(r => /какого то/.test(r[2])), 'no broken ru hyphen word');

  // Gates of Hell: no fixes, nothing written
  const gd = JSON.parse(JSON.stringify(draft)); gd.game = 'goh';
  const gc = await CP.compile(ctx, gd, { fixmod: R });
  ok(!gc.copies.length && !gc.calls.length && /Gates of Hell/.test(gc.notes.join(' ')), 'Gates of Hell compiles to nothing written');

  ok(!/=>|`|\$\{|innerHTML|\blet |\bconst /.test(CL.script), 'page script is ES5 (no arrow, backtick, dollar-brace, innerHTML, let, const)');
  try { new Function(CL.script); ok(true, 'page script parses'); } catch (e) { ok(false, 'page script parses', e.message); }

  const lngBefore = fs.readFileSync(path.join(mod, 'localization', 'desc.lng'), 'utf8');
  const res = await kit.run(R, L, {
    answers: { target: 'as64', mods: [], scan: s, safe: true, sets: [], walk: { picks: {}, sig: g.sig, files: g.files } },
    verb: 'change', game: 'as64', gameDir: game, mod,
    validate: { kinds: CL.kinds },
    write: true,
    after: (m, w, ok2) => {
      const lng = fs.readFileSync(path.join(m, 'localization', 'desc.lng'), 'utf8');
      ok2(lng !== lngBefore && /Okay|two/i.test(lng), 'desc.lng now keeps the game texts', lng.slice(0, 300));
      ok2(w.restore.length === g.files, 'a restore point per file (' + w.restore.length + ')');
      ok2(fs.existsSync(m + '.arsenal-undo'), 'the restore points sit beside the mod (the Mod Files page, Undo tab lists them)');
    },
  }, scratch);
  D.newId = newId;
  console.log('recipe extra: ' + good + ' passed, ' + bad + ' failed');
  if (bad || res.fails) { console.log('FAIL'); process.exitCode = 1; } else console.log('PASS');
})().catch(e => { console.log('FAIL crashed ' + (e.stack || e)); process.exitCode = 1; });
