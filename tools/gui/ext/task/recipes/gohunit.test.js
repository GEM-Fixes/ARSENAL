// recipe "make a unit from Gates of Hell" test: node gohunit.test.js <scratch>. goh2as2 is faked through runTool (no Gates of Hell
// install is read and no game starts): the fake prints two value questions under --ask-json and otherwise writes a small unit into
// --out. The recipe's scan route reads the questions, the stage route runs goh2as2 with the answers file into the task's staging
// folder; compile copies the unit and adds the gen roster op (buy card, price, name text) against the real Assault Squad 2 folder when
// one is found (read only). The kit checks the recipe, strings, census coverage, compile, a plan that writes nothing, and the write:
// the card and the name are read back from the mod. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-9393ff37)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./gohunit.recipe'), L = require('./gohunit.lang'), CL = require('./gohunit.client'), ST = require('./upgrade.recipe').ST;
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-gohunit-')));
const root = path.join(scratch, 'gohunit-case');
fs.rmSync(root, { recursive: true, force: true });
const gohDir = path.join(root, 'fakegoh'), mod = path.join(scratch, 'mods', 'gohunit_test'), log = path.join(root, 'tool.log');
fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(mod + '.arsenal-undo', { recursive: true, force: true });
fs.mkdirSync(path.join(gohDir, 'resource'), { recursive: true });
fs.mkdirSync(mod, { recursive: true });
fs.writeFileSync(path.join(mod, 'mod.info'), '{name "gohunit test"}\r\n{MinGameVersion "3.301"}\r\n');
const real = kit.findGame({});           // the real AS2 folder (read only) for the buy card; none: the card part is skipped
const fakeGame = path.join(root, 'fakeas2'); fs.mkdirSync(path.join(fakeGame, 'resource'), { recursive: true });
const game = real || fakeGame, UNIT = 'goh_t34_test', DONOR = 't34_85';
const tree = d => { const h = crypto.createHash('sha1'); for (const r of ST.walk(d)) h.update(r + '\0').update(fs.readFileSync(path.join(d, r))); return h.digest('hex'); };
const arg = (a, k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const Q = [
  { xlate: 'question', v: 1, id: 'q1', unit: UNIT, class: 'tank_medium', stage: 'scale', key: 'mobility.speed', goh: 55, translated: 70, range: { p5: 30, p95: 50 }, scaled: 48, donor: 45, choices: ['scale', 'translated', 'donor'], default: 'scale', rest_of_class: 1 },
  { xlate: 'question', v: 1, id: 'q2', unit: UNIT, class: 'tank_medium', stage: 'engine', key: 'armor.body', goh: 90, translated: 300, range: { p5: 40, p95: 120 }, scaled: 110, donor: 90, choices: ['scale', 'translated', 'donor'], default: 'donor', rest_of_class: 0 },
];
function fakeTool(tool, entry, a) {
  fs.appendFileSync(log, tool + ' ' + a.join(' ') + '\n');
  if (tool !== 'goh2as2') return { code: 9, stdout: '', stderr: 'unexpected tool ' + tool, timedOut: false };
  const out = arg(a, '--out'), unit = arg(a, '--entity');
  if (a.includes('--ask-json')) return { code: 0, stdout: Q.map(q => JSON.stringify(q)).join('\n') + '\n' + JSON.stringify({ findings: [{ code: 'X_WARN', severity: 'warn', msg: 'w' }], info: [] }) + '\n', stderr: '', timedOut: false };
  const ent = path.join(out, 'resource', 'entity', unit);
  fs.mkdirSync(ent, { recursive: true });
  fs.writeFileSync(path.join(ent, unit + '.def'), '{"vehicle"\r\n\t{extender "inventory"}\r\n}\r\n');
  fs.writeFileSync(path.join(out, 'mod.info'), '{name "made by goh2as2"}\r\n');
  fs.writeFileSync(path.join(out, 'GOH-ORIGIN.tsv'), 'file\tfrom\r\nresource/entity/' + unit + '\tgoh\r\n');
  if (!a.includes('--no-names')) { fs.mkdirSync(path.join(out, 'localization'), { recursive: true }); fs.writeFileSync(path.join(out, 'localization', '#goh2as2_names.lng'), '﻿{desc\r\n}\r\n'); }
  const af = arg(a, '--answers'); if (af) fs.copyFileSync(af, path.join(root, 'answers.seen.json'));
  return { code: 0, stdout: JSON.stringify({ findings: [], info: [] }), stderr: '', timedOut: false };
}

let bad = 0, good = 0;
const ok = (c, m, x) => { if (c) good++; else { bad++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 1200) : '')); } };

(async () => {
  console.log('note: ' + (real ? 'buy card made against ' + real : 'no Assault Squad 2 folder found: the buy card is skipped'));
  const id = 'gohunit-test-' + crypto.randomBytes(3).toString('hex');
  const ctx = kit.ctxFor(scratch, { gameDir: game });
  fs.mkdirSync(ctx.tmpRoot, { recursive: true });
  ctx.gohDir = gohDir; ctx.runTool = async (t, e, a) => fakeTool(t, e, a);
  const buy = real ? { buyable: true, army: 'ger', like: 'r12', cost: 90, name: 'T 34 test', icon_like: '', bots: true } : { buyable: false };
  const answers = Object.assign({ goh_dir: gohDir, unit: UNIT, donor: DONOR, nation: 'rus', no_translate: false, drop_limits: false, fit: true }, buy);
  const draft = { id, recipe: 'gohunit', verb: 'make', game: 'as64', mod, base: null, answers: {}, kept: [], state: 'open' };
  for (const [k, v] of Object.entries(answers)) draft.answers[k] = { src: 'value', value: v };
  D.save(ctx, draft);
  const scan = R.routes['POST /api/x/task/r/gohunit/scan'], stage = R.routes['POST /api/x/task/r/gohunit/stage'];
  const before = tree(mod);

  let why = null; try { await scan(null, { draft }, Object.assign({}, ctx, { session: { remote: true } })); } catch (e) { why = e; }
  ok(why && why.status === 403, 'scan refuses LAN Remote', why && why.message);
  why = null; try { await stage(null, { draft: Object.assign({}, draft, { id: 'gohunit-not-saved' }) }, ctx); } catch (e) { why = e; }
  ok(why && why.status === 404, 'stage refuses a task that is not saved', why && why.message);
  const noDir = JSON.parse(JSON.stringify(draft)); delete noDir.answers.goh_dir; D.save(ctx, noDir);
  why = null; try { await scan(null, { draft: noDir }, Object.assign({}, ctx, { gohDir: path.join(root, 'nope'), game: () => null })); } catch (e) { why = e; }
  ok(why && /Gates of Hell folder .*first question \(Game folders\)/.test(why.message), 'a missing Gates of Hell folder is refused in plain words, pointing at the first question', why && why.message);
  D.save(ctx, draft);

  const s = await scan(null, { draft }, ctx);
  ok(s.ok && s.questions.length === 2 && s.questions[1].def === 'donor', 'scan lists the two value questions with their defaults', JSON.stringify(s).slice(0, 800));
  ok(/--ask-json/.test(fs.readFileSync(log, 'utf8')) && /--dry-run/.test(fs.readFileSync(log, 'utf8')), 'scan runs goh2as2 --ask-json --dry-run');
  ok(/--rep-key --pull-props --mtl-fallback --match-weapon/.test(fs.readFileSync(log, 'utf8')) && /--nation rus/.test(fs.readFileSync(log, 'utf8')), 'the fixed chain flags and the nation are passed');
  ok(tree(mod) === before, 'scan writes nothing into the mod');
  // JOBS: the footer's Cancel kills goh2as2 (ctx.runTool answers cancelled): scan and stage end at once, nothing staged or written
  { const sj = { cancelled: false };
    const sctx = Object.assign({}, ctx, { job: sj, runTool: async () => { sj.cancelled = true; return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } });
    const ss = await scan(null, { draft }, sctx);
    ok(ss && ss.stopped === true && ss.ok === false, 'a stopped scan says stopped, not a failed conversion', JSON.stringify(ss));
    sj.cancelled = false;
    const sg = await stage(null, { draft }, sctx);
    ok(sg && sg.stopped === true && sg.ok === false && !sg.error && tree(mod) === before && !fs.existsSync(path.join(D.stageDir(ctx, id), 'gh-work')) && !fs.existsSync(path.join(D.stageDir(ctx, id), 'gh-map.json')), 'a stopped stage stages nothing, leaves no work folder and writes nothing', JSON.stringify(sg)); }
  // the More choices: a flag turned off is not passed; fit off passes --no-fit-pass
  const off = JSON.parse(JSON.stringify(draft)); off.answers.match_weapon = { src: 'value', value: false }; off.answers.fit = { src: 'value', value: false }; D.save(ctx, off);
  fs.writeFileSync(log, ''); await scan(null, { draft: off }, ctx);
  const offLog = fs.readFileSync(log, 'utf8');
  ok(!/--match-weapon/.test(offLog) && /--rep-key --pull-props --mtl-fallback/.test(offLog) && /--no-fit-pass/.test(offLog), 'a flag answered no is left out; fit no passes --no-fit-pass', offLog);
  const typed = JSON.parse(JSON.stringify(draft)); typed.answers.goh_dir = { src: 'value', value: path.join(root, 'no-goh') }; D.save(ctx, typed);
  why = null; try { await stage(null, { draft: typed }, ctx); } catch (e) { why = e; }
  ok(why && /Gates of Hell folder is not set or not found/.test(why.message), 'a typed Gates of Hell folder that is not there is refused', why && why.message);
  D.save(ctx, draft);
  const nt = JSON.parse(JSON.stringify(draft)); nt.answers.no_translate = { src: 'value', value: true }; D.save(ctx, nt);
  const s2 = await scan(null, { draft: nt }, ctx);
  ok(s2.ok && !s2.questions.length && s2.none === 'no_translate', 'copying the numbers as they are asks nothing');
  D.save(ctx, draft);

  const askV = { sig: s.sig, n: 2, none: '', questions: s.questions, answers: { q1: { choice: 'translated', rest: true }, q2: { choice: 'donor', rest: false } } };
  draft.answers.ask = { src: 'value', value: askV };
  D.save(ctx, draft);
  // compile before the stage step: refused in plain words
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { gohunit: R }); } catch (e) { why = e; }
  ok(why && /Bring the unit over/.test(why.message), 'compile before the stage step asks for it', why && why.message);

  const g = await stage(null, { draft }, ctx);
  ok(g.ok && g.files >= 2 && g.defMade, 'stage brings the unit into staging (' + g.files + ' files)', JSON.stringify(g).slice(0, 1200));
  ok(tree(mod) === before, 'stage writes nothing into the mod');
  const seen = fs.existsSync(path.join(root, 'answers.seen.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'answers.seen.json'), 'utf8')) : {};
  ok(seen.q1 && seen.q1.choice === 'translated' && seen.q1.rest === true && seen.q2.choice === 'donor', 'goh2as2 got the answers file', JSON.stringify(seen));
  const stLog = fs.readFileSync(log, 'utf8').split('\n').filter(l => /--answers/.test(l)).join('\n');
  ok(stLog && !/^donorfit/m.test(fs.readFileSync(log, 'utf8')) && !/--no-fit-pass/.test(stLog), 'goh2as2 runs its own fit pass (no separate donorfit call)', stLog);
  ok(g.unit === UNIT, 'the stage names the unit it made', g.unit);
  const map = ST.load(D.stageDir(ctx, id), 'gh'), rels = map ? map.files.map(f => f.rel) : [];
  ok(map && !rels.some(r => r.toLowerCase() === 'mod.info'), 'the mod keeps its own mod.info', JSON.stringify(rels));
  ok(rels.includes('GOH-ORIGIN.tsv'), 'GOH-ORIGIN.tsv goes with the unit', JSON.stringify(rels));
  ok(!rels.some(r => /\.set$/i.test(r)), 'no buy card is staged: it is a gen op in compile', JSON.stringify(rels));
  if (real) ok(!rels.some(r => /#goh2as2_names/.test(r)), 'a typed name: goh2as2 writes no names file (--no-names)', JSON.stringify(rels));
  ok(map && map.files.every(f => /^[^\\/:*?"<>|]{1,120}$/.test(f.s)), 'staged names are flat');
  draft.answers.stage = { src: 'value', value: { sig: g.sig, files: g.files } };
  D.save(ctx, draft);

  const c0 = await CP.compile(ctx, D.load(ctx, id), { gohunit: R });
  const rop = c0.gen && c0.gen.ops[0];
  if (real) ok(c0.copiesFirst && rop && rop.op === 'roster' && rop.unit === UNIT && rop.like === 'r12' && rop.fields.cost === 90 && rop.name === 'T 34 test', 'compile adds the roster op with price and name, copies first', JSON.stringify(c0.gen));
  else ok(!c0.gen, 'not buyable: no roster op');
  const p = await CP.plan(ctx, D.load(ctx, id), { gohunit: R });
  ok(!p.errors.length && p.copies.length === g.files && !p.calls.length, 'plan lists the unit files and runs no command', JSON.stringify(p.errors));
  if (real) ok(p.genFiles.some(x => /\.set$/i.test(x)) && p.genFiles.some(x => /\.lng$/i.test(x)), 'plan names the card list and the name text', JSON.stringify(p.genFiles));
  ok(tree(mod) === before, 'plan writes nothing');
  const stale = JSON.parse(JSON.stringify(draft)); stale.answers.fit = { src: 'value', value: false }; D.save(ctx, stale);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { gohunit: R }); } catch (e) { why = e; }
  ok(why && /changed after/.test(why.message), 'an answer changed after the unit was made is refused', why && why.message);
  const price = JSON.parse(JSON.stringify(draft)); price.answers.cost = { src: 'value', value: 120 }; D.save(ctx, price);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { gohunit: R }); } catch (e) { why = e; }
  ok(!why, 'a new price needs no new conversion (the card is made at Write)', why && why.message);
  const stale2 = JSON.parse(JSON.stringify(draft)); stale2.answers.donor = { src: 'value', value: 't34_76' }; D.save(ctx, stale2);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { gohunit: R }); } catch (e) { why = e; }
  ok(why && /value questions/.test(why.message), 'a new donor after the value questions asks them again', why && why.message);
  D.save(ctx, draft);

  ok(!/=>|`|\$\{|innerHTML|\blet |\bconst /.test(CL.script), 'page script is ES5 (no arrow, backtick, dollar-brace, innerHTML, let, const)');
  try { new Function(CL.script); ok(true, 'page script parses'); } catch (e) { ok(false, 'page script parses', e.message); }
  const keys = new Set(L.map(r => r[0]));
  const used = (CL.script.match(/task\.gohunit\.[a-zA-Z_.]+/g) || []).filter(k => !/\.$/.test(k));
  ok(used.every(k => keys.has(k)), 'every page string has a row', used.filter(k => !keys.has(k)).join(', '));
  ['scale', 'translated', 'donor'].forEach(c => ok(keys.has('task.gohunit.k.c.' + c), 'choice label ' + c + ' has a row'));

  // novice round: the folder first, checked at the question; the lookup reads it and an empty list says why
  const gs = R.groups.map(x => x.id), wq = R.groups[0].q.map(x => x.id);
  ok(gs[0] === 'where' && R.groups[0].essential && wq.join() === 'goh_dir,game_dir', 'the game folders are the first group, before the unit', gs.join() + ' / ' + wq.join());
  ok(!R.groups.slice(1).some(x => x.q.some(y => y.id === 'goh_dir' || y.id === 'game_dir')), 'the folders are asked once');
  const uq = R.groups[1].q.find(x => x.id === 'unit');
  ok(uq && uq.picker && uq.picker.in === 'goh_dir', 'the unit lookup is given the folder answer (picker.in)');
  ok(R.groups[0].q[0].kind === 'goh-dir' && CL.kinds.includes('goh-dir'), 'the folder question has its own kind with Pick and Check');
  ok(/data-goh-dir-pick/.test(CL.script) && /data-goh-dir-check/.test(CL.script) && /gohDir\(\)/.test(CL.script), 'the folder kind has Pick and Check buttons and starts from the GUI GoH setting');
  ok(/donors\?unit=.*goh=.*game=/.test(CL.script), 'the donor list reads the folders of the first group');
  ok(R.values(ctx).goh_dir === gohDir, 'the folder answer is prefilled from the folder this program finds', R.values(ctx).goh_dir);
  const dirR = R.routes['POST /api/x/task/r/gohunit/dir'];
  const d1 = await dirR(null, { dir: gohDir }), d2 = await dirR(null, { dir: root }), d3 = await dirR(null, { dir: 'goh' }), d4 = await dirR(null, { dir: path.join(root, 'nope') }), d5 = await dirR(null, { dir: '' });
  ok(d1.ok && !d2.ok && d2.why === 'noResource' && d3.why === 'notAbs' && d4.why === 'missing' && d5.why === 'empty', 'the folder check names why a folder is wrong', JSON.stringify([d1, d2, d3, d4, d5]));
  ['empty', 'notAbs', 'missing', 'noResource'].forEach(w => ok(keys.has('task.gohunit.k.dir.' + w), 'the folder answer ' + w + ' has plain words'));
  const look = R.lookups.gohunit, noLook = await look(Object.assign({}, ctx, { gohDir: null }), '', { in: root });
  ok(noLook && !noLook.results.length && noLook.why === 'task.gohunit.k.noFolderWhy' && noLook.do === 'task.gohunit.k.noFolderDo' && keys.has(noLook.why) && keys.has(noLook.do), 'a folder without Gates of Hell: an empty list that says why and what to do', JSON.stringify(noLook));
  ok(/first question \(Game folders\)/.test((L.find(r => r[0] === 'task.gohunit.k.noFolderDo') || [])[1]) && keys.has('task.gohunit.k.noUnitsWhy') && keys.has('task.gohunit.k.noUnitsDo'), 'what to do points at the first question; a folder with no units says so too');
  ok(R.title && R.title.make === 'task.gohunit.t' && R.test === 'task.gohunit.test' && /buy menu/.test((L.find(r => r[0] === 'task.gohunit.test') || [])[1]), 'title per verb; the Test step says where the unit shows in the buy menu and what to check');
  // the army is a choice; a mod's own army is typed
  const aq = R.groups.find(x => x.id === 'buy').q, army = aq.find(x => x.id === 'army'), own = aq.find(x => x.id === 'army_own');
  ok(army.kind === 'choice' && army.limits.values.join() === 'ger,usa,rus,eng,jap,own' && own && own.when.army === 'own', 'the army is a choice with "another army of a mod"');
  army.limits.values.forEach(v => ok(keys.has('task.gohunit.v.army.' + v), 'army ' + v + ' has a label'));
  const iv = (o) => R.inputs(k => o[k], { mod });
  ok(iv({ unit: UNIT, donor: DONOR, buyable: true, army: 'own', army_own: 'fin' }).buy.army === 'fin', 'another army: the typed name is used');
  // the name is asked always; a unit not for sale still gets its name (gen text op)
  ok(R.groups[1].q.some(x => x.id === 'name' && !x.when), 'the name is asked always, in the unit group');
  const nm = JSON.parse(JSON.stringify(draft));
  Object.assign(nm.answers, { buyable: { src: 'value', value: false }, name: { src: 'value', value: 'Test T 34' } }); delete nm.answers.stage; D.save(ctx, nm);
  const gN = await stage(null, { draft: nm }, ctx); nm.answers.stage = { src: 'value', value: { sig: gN.sig, files: gN.files } }; D.save(ctx, nm);
  ok(/--no-names/.test(fs.readFileSync(log, 'utf8').trim().split('\n').pop()), 'a typed name with no buy card: goh2as2 writes no names file');
  const cN = await CP.compile(ctx, D.load(ctx, id), { gohunit: R }), tOp = cN.gen && cN.gen.ops[0];
  ok(tOp && tOp.op === 'text' && tOp.key === 'desc/entity/' + UNIT && tOp.text === 'Test T 34', 'not for sale with a name: a text op names the unit', JSON.stringify(cN.gen));
  ok(!cN.notes.some(n => /goh2as2 --|--entity/.test(n)), 'the notes are plain words, no command line', cN.notes.join(' | '));
  D.save(ctx, draft);
  // words: the donor is the Assault Squad 2 unit everywhere; no raw limit ids in the help; Russian keeps its hyphen
  const en = k => (L.find(r => r[0] === k) || [])[1] || '';
  ok(/donor/.test(en('task.gohunit.q.no_translate')) && /donor, the Assault Squad 2 unit/.test(en('task.gohunit.h.no_translate')) && /donor's number \(the Assault Squad 2 unit/.test(en('task.gohunit.h.ask')), 'donor means the Assault Squad 2 unit in every help');
  ok(!L.some(r => /^task\.gohunit\.h\./.test(r[0]) && /[A-Z]{2,}-\d+/.test(r[1])), 'no raw limit ids inside the help text', L.filter(r => /^task\.gohunit\.h\./.test(r[0]) && /[A-Z]{2,}-\d+/.test(r[1])).map(r => r[0]).join(', '));
  ok(/какого-то/.test((L.find(r => r[0] === 'task.gohunit.q.mtl_fallback') || [])[2] || ''), 'Russian keeps the hyphen in "какого-то"');

  const res = await kit.run(R, L, {
    answers: Object.assign({}, answers, { ask: askV, stage: { sig: g.sig, files: g.files } }),
    id, verb: 'make', game: 'as64', gameDir: game, mod,
    validate: { kinds: CL.kinds },
    planFiles: ['GOH-ORIGIN.tsv', 'resource/entity/' + UNIT + '/' + UNIT + '.def'],
    write: true,
    after: (m, w, ok2) => {
      ok2(fs.existsSync(path.join(m, 'resource', 'entity', UNIT, UNIT + '.def')), 'the unit is in the mod');
      ok2(/gohunit test/.test(fs.readFileSync(path.join(m, 'mod.info'), 'utf8')), 'the mod kept its own mod.info');
      ok2(w.restore.length >= g.files && !w.unguarded.length, 'a restore point per file (' + w.restore.length + ')');
      if (real) {
        // read back: the card in the army list (price 90) and the name text
        const all = ST.walk(m), sets = all.filter(r => /\.set$/i.test(r)).map(r => fs.readFileSync(path.join(m, r), 'latin1'));
        const card = sets.map(s => { const i = s.indexOf('"' + UNIT + '"'); return i < 0 ? '' : s.slice(i, i + 600); }).find(Boolean) || '';
        ok2(card && /\b90\b/.test(card), 'the card for ' + UNIT + ' is in the army list with price 90', card.slice(0, 300) || all.join(', '));
        const lng = all.filter(r => /^localization\/.*\.lng$/i.test(r)).map(r => fs.readFileSync(path.join(m, r), 'utf8')).join('\n');
        ok2(lng.includes('T 34 test') && lng.includes(UNIT), 'the typed name is in the mod text', lng.slice(0, 300) || all.join(', '));
      }
      ok2(fs.existsSync(m + '.arsenal-undo'), 'the restore points sit beside the mod');
    },
  }, scratch);
  console.log('recipe extra: ' + good + ' passed, ' + bad + ' failed');
  if (bad || res.fails) { console.log('FAIL'); process.exitCode = 1; } else console.log('PASS');
})().catch(e => { console.log('FAIL crashed ' + (e.stack || e)); process.exitCode = 1; });
