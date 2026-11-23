// recipe "make a unit from Gates of Hell": pick the GoH unit and the AS2 donor, answer the out of line values one by one (goh2as2
// --ask-json, run read only by POST /api/x/task/r/gohunit/scan), then the step "Bring the unit over" (POST /api/x/task/r/gohunit/stage)
// runs goh2as2 with your answers (its own fit pass included) into this task's staging folder. compile copies those files into your
// mod and, when the unit is to be bought, adds the gen roster op (the card copied from a vanilla one, price, icon, bot advice, the
// name text): copiesFirst, so the card op sees the unit at Write. Why goh2as2 stays on staging: contract.js COMMANDS.gohport has no
// answers, nation, dropLimits, noTranslate or noNames field, so {cmd: 'goh2as2'} cannot run the answered chain. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-ab16e66d)
'use strict';
const fs = require('fs'), path = require('path');
const ST = require('./upgrade.recipe').ST;

const NAME = /^[A-Za-z0-9_.-]{1,80}$/;
const FACTION = /^[a-z0-9_]+$/;
const ARMIES = ['ger', 'usa', 'rus', 'eng', 'jap', 'own'];
const NATIONS = ['auto', 'ger', 'usa', 'rus', 'eng', 'jap'];
const CHOICES = ['scale', 'translated', 'donor'];
// the tested chain (guide/19) as the GoH page runs it: each flag is a question in "More choices", on by default
const FLAGS = { rep_key: '--rep-key', pull_props: '--pull-props', mtl_fallback: '--mtl-fallback', match_weapon: '--match-weapon' };

const GM = () => require('../../../../lib/games');
// the page's or the draft's game word (as64 | mowas2 | goh): a word given, else ctx.gameId (the gui.js function, or the word
// lib/compile.js lookupCtx puts there), else as64
function gidOf(ctx, game) {
  let x = game && typeof game === 'string' ? game : null;
  if (!x && ctx) { try { x = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch { x = null; } }
  return GM().idOf(x) || 'as64';
}
// the AS2 game the unit is made for: MoW:AS2 on its own tab (goh2as2 --exe mowas_2: no as64/core in the view); AS64 on the AS64 and
// the Gates of Hell tabs (the GoH tab is where the unit comes from, not a target)
const targetOf = game => (gidOf(null, game) === 'mowas2' ? 'mowas2' : 'as64');
const val = (ctx, k) => { try { const f = ctx && ctx[k]; return (typeof f === 'function' ? f.call(ctx) : f) || null; } catch { return null; } };
// the two installs: GoH (read only) and the AS2 game the unit is made for; a typed folder comes first. gui.js: ctx.gohDir() is the
// GoH install (null when none) and ctx.game() the AS2 install on every tab; a ctx.game() that holds call_to_arms.exe is taken as
// the GoH folder, never as the AS2 one; the task's GoH folder (ctx.task.gohDir, lib/game.js) before ctx.gohDir. Else the finders (games.install: as2.json, env, Steam)
function dirs(ctx, game, i) {
  const ok = p => !!p && ST.isAbs(p) && fs.existsSync(p);
  const g = val(ctx, 'game'), gIsGoh = ok(g) && GM().detect(g) === 'goh';
  let goh = (i && i.gohDir) || val(ctx && ctx.task, 'gohDir') || val(ctx, 'gohDir') || (gIsGoh ? g : null), as2 = (i && i.gameDir) || (gIsGoh ? null : g);
  if (!goh) { try { goh = GM().install('goh').dir; } catch { goh = null; } }
  if (!as2) { try { as2 = GM().install('as64').dir; } catch { as2 = null; } }
  return { goh: ok(goh) ? goh : null, as2: ok(as2) ? as2 : null };
}
// a Gates of Hell game folder: a full path that is there and holds resource (the GoH page reads the units from it)
function gohWhy(p) {
  p = String(p || '').trim();
  if (!p) return 'empty';
  if (!ST.isAbs(p)) return 'notAbs';
  if (!fs.existsSync(p)) return 'missing';
  if (!fs.existsSync(path.join(p, 'resource'))) return 'noResource';
  return null;
}
// game: the task's game (compile: c.game = tg.id; a route: the ctx's game); the draft's own word wins, as lib/game.js of() has it,
// so a draft saved with game '' takes the tab's game in the stage route and in compile alike
function inputs(v, draft, game) {
  const s = x => String(x == null ? '' : x).trim();
  const ask = v('ask') || {}, ans = {};
  for (const [k, a] of Object.entries((ask && ask.answers) || {})) if (a && CHOICES.includes(a.choice) && k.length < 200) ans[k] = { choice: a.choice, rest: !!a.rest };
  const buyable = v('buyable') !== false, donor = s(v('donor')), name = s(v('name'));
  const army = v('army') === 'own' ? s(v('army_own')) : s(v('army'));
  return {
    mod: s(draft.mod), unit: s(v('unit')), donor, nation: NATIONS.includes(v('nation')) && v('nation') !== 'auto' ? v('nation') : '',
    noTranslate: v('no_translate') === true, dropLimits: v('drop_limits') === true, answers: ans, fit: v('fit') !== false,
    flags: Object.keys(FLAGS).filter(k => v(k) !== false), gohDir: s(v('goh_dir')), gameDir: s(v('game_dir')), name, target: targetOf((draft && draft.game) || game),
    buy: buyable ? { army, like: s(v('like')) || donor, cost: +v('cost') > 0 ? Math.round(+v('cost')) : null, name, icon: s(v('icon_like')) || s(v('like')) || donor, bots: v('bots') === true } : null,
  };
}
function refuse(i) {
  if (!NAME.test(i.unit)) return 'Pick the Gates of Hell unit first.';
  if (!NAME.test(i.donor)) return 'Pick the donor unit first.';
  if (i.buy && !FACTION.test(i.buy.army)) return 'Type the short name of the mod\'s army (small letters, digits and underscore), for example fin.';
  if (i.buy && !NAME.test(i.buy.like)) return 'Pick the card the new card is copied from.';
  for (const [k, p] of [['Gates of Hell', i.gohDir], ['Assault Squad 2', i.gameDir]]) if (p && (!ST.isAbs(p) || !fs.existsSync(p))) return 'The ' + k + ' folder you typed is not there: ' + p;
  return null;
}
// a MoW:AS2 target joins the signatures (an AS64 draft keeps the signature it had); the stage depends on what goh2as2 is given,
// not on the buy answers (those are gen ops in compile)
const tgt = i => (i.target === 'mowas2' ? ['mowas2'] : []);
const scanSig = i => ST.sig(['gohunit-scan', i.unit, i.donor, i.nation, i.noTranslate, i.dropLimits].concat(tgt(i)));
const sigOf = i => ST.sig(['gohunit', i.unit, i.donor, i.nation, i.noTranslate, i.dropLimits, i.answers, i.fit, i.flags, i.gohDir, i.gameDir, !!i.name].concat(tgt(i)));
function chainArgs(i, d, out) {
  const a = ['--goh', d.goh, '--entity', i.unit, '--donor', i.donor].concat(i.flags.map(k => FLAGS[k]), ['--game', d.as2, '--out', out, '--format', 'json']);
  // MoW:AS2: the donor and its files from the mowas_2 view (no as64/core); AS64 keeps its argument list as it was
  if (i.target === 'mowas2') a.push('--exe', 'mowas_2');
  if (i.nation) a.push('--nation', i.nation);
  if (i.dropLimits) a.push('--drop-limits');
  if (i.noTranslate) a.push('--no-translate');
  if (!i.fit) a.push('--no-fit-pass');
  return a;
}
// the unit goh2as2 made: --rep-key puts it under the rep's name (resource/entity/<rep>/<rep>.def), so the staged files name it
function unitMade(rels, unit) {
  const defs = rels.map(r => /^resource\/entity\/([^/]+)\/\1\.def$/i.exec(r)).filter(Boolean).map(m => m[1]);
  return defs.find(n => n.toLowerCase() === unit.toLowerCase()) || defs[0] || unit;
}
function findingsOf(stdout) {
  const lines = String(stdout || '').split(/\r?\n/), qs = [];
  let j = null;
  for (const l of lines) { const t = l.trim(); if (!t.startsWith('{')) continue; try { const o = JSON.parse(t); if (o && o.xlate === 'question') qs.push(o); else if (o && (o.findings || o.info)) j = o; } catch { /* part of a longer JSON */ } }
  if (!j) { const s = String(stdout || ''), at = s.lastIndexOf('\n{'); try { j = JSON.parse(at >= 0 ? s.slice(at + 1) : s); } catch { j = null; } }
  return { qs, j };
}
async function prep(ctx, body) {
  ST.remote(ctx);
  const R = module.exports, d = ST.draftOf(ctx, body, 'gohunit');
  const vals = (await R.values(Object.assign({}, ctx, { mod: d.mod, gameId: d.game }))) || {};
  const i = inputs(ST.getter(d, vals), d, gidOf(ctx, d.game)), dd = dirs(ctx, d.game, i);
  if (!dd.goh) throw ST.bad('The Gates of Hell folder is not set or not found. Go back to the first question (Game folders) and pick it.');
  if (!dd.as2) throw ST.bad('No Assault Squad 2 folder found. Set the game folder first (the Game folder button at the top).');
  return { d, i, dd };
}

// the out of line values goh2as2 would ask about (a dry run with --ask-json; stdin is closed, so each takes its default)
async function scanRoute(url, body, ctx) {
  const { d, i, dd } = await prep(ctx, body);
  if (!NAME.test(i.unit) || !NAME.test(i.donor)) throw ST.bad('Pick the Gates of Hell unit and the donor first.');
  if (i.noTranslate) return { ok: true, sig: scanSig(i), questions: [], none: 'no_translate' };
  const work = ST.work(ctx, d.id, 'gh-scan');
  const r = await ctx.runTool('goh2as2', 'goh2as2/goh2as2.js', chainArgs(i, dd, path.join(work, 'out')).concat(['--ask-json', '--dry-run']), { timeoutMs: 300000 });
  fs.rmSync(work, { recursive: true, force: true });
  if (ST.stopped(ctx, r)) return Object.assign({}, ST.STOPPED);
  const { qs, j } = findingsOf(r.stdout);
  if (r.timedOut || (r.code !== 0 && !qs.length)) return { ok: false, code: r.code, lines: ST.tail(r.stderr, 8) };
  const questions = qs.slice(0, 200).map(q => ({ id: String(q.id), unit: q.unit, class: q.class, stage: q.stage, key: q.key, goh: q.goh, translated: q.translated, range: q.range || null, scaled: q.scaled, donor: q.donor, def: CHOICES.includes(q.default) ? q.default : 'scale' }));
  const errors = ((j && j.findings) || []).filter(f => f.severity === 'error').slice(0, 10).map(f => f.code + ': ' + String(f.msg || '').slice(0, 160));
  return { ok: true, sig: scanSig(i), questions, errors };
}

// goh2as2 into staging, with the answers (its own fit pass unless fit is off); the buy card and the name are gen ops in compile
async function stageRoute(url, body, ctx) {
  const { d, i, dd } = await prep(ctx, body);
  const why = refuse(i); if (why) throw ST.bad(why);
  if (!ST.isAbs(i.mod) || !fs.existsSync(i.mod)) throw ST.bad('Pick your mod first.');
  const work = ST.work(ctx, d.id, 'gh-work'), out = path.join(work, 'out'), af = path.join(work, 'answers.json'), steps = [];
  const fail = (m, lines) => { fs.rmSync(work, { recursive: true, force: true }); return { ok: false, error: m, lines: lines || [] }; };
  const a = chainArgs(i, dd, out);
  if (!i.noTranslate) { fs.writeFileSync(af, JSON.stringify(i.answers)); a.push('--answers', af); }
  if (i.name) a.push('--no-names');   // the typed name is the one text for desc/entity/<unit> (the gen roster or text op writes it)
  const r = await ctx.runTool('goh2as2', 'goh2as2/goh2as2.js', a, { timeoutMs: 300000 });
  // stopped: the half made conversion is thrown away, the staged files of an earlier run stay as they were
  if (ST.stopped(ctx, r)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
  const { j } = findingsOf(r.stdout);
  if (r.timedOut || r.code !== 0 || !fs.existsSync(out)) return fail('The conversion did not work (code ' + r.code + ').', ST.tail(r.stderr, 8));
  const errs = ((j && j.findings) || []).filter(f => f.severity === 'error');
  steps.push('goh2as2: ' + ((j && j.findings) || []).length + ' findings, ' + errs.length + ' errors' + (i.fit ? ', fit pass on' : ''));
  // the mod keeps its own mod.info
  const pairs = ST.walk(out).filter(rel => rel.toLowerCase() !== 'mod.info').map(rel => ({ from: path.join(out, ...rel.split('/')), rel }));
  const made = unitMade(pairs.map(p => p.rel), i.unit);
  const map = ST.stage(ctx, d.id, 'gh', pairs, i.mod, { sig: sigOf(i), code: r.code, unit: made });
  fs.rmSync(work, { recursive: true, force: true });
  return { ok: true, sig: map.sig, files: map.files.length, bytes: map.files.reduce((s, f) => s + f.size, 0), errors: errs.slice(0, 8).map(f => f.code + ': ' + String(f.msg || '').slice(0, 160)), steps, unit: made, defMade: map.files.some(f => f.rel.toLowerCase() === ('resource/entity/' + made + '/' + made + '.def').toLowerCase()) };
}

async function dirRoute(url, body) {
  const p = String((body && body.dir) || '').trim(), why = gohWhy(p);
  return why ? { ok: false, why, dir: p } : { ok: true, dir: path.resolve(p) };
}

// lookups: the GoH units (through the GoH page's own list) and the AS2 units for the card to copy (core entity lookup)
async function gohUnits(ctx, words, opt) {
  const typed = String((opt && opt.in) || '').trim(), goh = require('../../goh');
  const dd = typed ? { goh: gohWhy(typed) ? null : typed } : dirs(ctx, opt && opt.game, null);
  // an empty list says why and what to do (lang keys; the core page shows both)
  if (!dd.goh) return { results: [], why: 'task.gohunit.k.noFolderWhy', do: 'task.gohunit.k.noFolderDo' };
  const u = new URL('http://127.0.0.1/api/x/goh/units?' + new URLSearchParams({ q: String(words || ''), goh: dd.goh }));
  const r = await goh.routes['GET /api/x/goh/units'](u, null, ctx);
  if (!(r.units || []).length && !String(words || '').trim()) return { results: [], why: 'task.gohunit.k.noUnitsWhy', do: 'task.gohunit.k.noUnitsDo' };
  return (r.units || []).map(x => ({ id: x.name, name: x.name, where: [x.nation, x.cls].filter(Boolean).join(' '), ref: null, sub: x.key }));
}

// the AS2 cards to copy (like, icon_like): the Units search of the target game, also on the Gates of Hell tab (there the page's
// game is goh, but the card is an AS64 one); the same answer form as the core entity lookup
async function as2Units(ctx, words, opt) {
  const t = targetOf(gidOf(ctx, opt && opt.game)), dir = val(ctx, 'game');
  const c2 = Object.assign({}, ctx, { gameId: () => t, exe: () => GM().exeOf(t), kind: () => 'as2', curDir: () => dir });
  const U = require('../../units/server');
  const r = await U.routes['POST /api/x/units/search'](null, { q: String(words || ''), mod: (opt && opt.mod) || undefined, all: true, limit: 200 }, c2);
  return (r.results || []).map(x => ({ id: x.id, name: x.name || x.id, where: x.army || '', ref: { entity: x.id }, sub: [x.kind, x.cost != null ? x.cost : ''].filter(v => v !== '' && v != null).join(' ') }));
}

module.exports = {
  id: 'gohunit',
  verbs: ['make'],
  // AS64 and MoW:AS2: the unit is made for that game; Gates of Hell: the tab the unit comes from, made for AS64
  games: ['as64', 'mowas2', 'goh'],
  // the game the task writes for (lib/compile.js writeDraft, lib/recipe.js writesOf): the unit goes into an AS2 mod, so a goh draft
  // writes for as64 (gen, copy/new marks, mod guard, the page's mod step); mowas2 stays mowas2. A draft saved with game '' (before
  // this batch, AS64 only) writes for as64
  genGame: d => targetOf(d && d.game),
  needs: ['mod'],
  order: 220,
  title: { make: 'task.gohunit.t' },
  test: 'task.gohunit.test',   // the Test step: where to look in the game
  census: 'gohunit',
  // the four groups that lead to the files are essential (steps() asks essential groups first); "More choices" comes after them with
  // the tested defaults preselected: a change there after "Bring the unit over" asks for that step again (the stage sig)
  groups: [
    // first: the unit list of the next question is read from the Gates of Hell folder (picker.in), and the stage reads both
    { id: 'where', title: 'task.gohunit.g.where', essential: true, q: [
      { id: 'goh_dir', kind: 'goh-dir', ask: 'task.gohunit.q.goh_dir', help: 'task.gohunit.h.goh_dir', covers: ['pick.goh'] },
      { id: 'game_dir', kind: 'text', ask: 'task.gohunit.q.game_dir', help: 'task.gohunit.h.game_dir', covers: ['pick.game'], optional: true },
    ] },
    { id: 'pick', title: 'task.gohunit.g.pick', essential: true, q: [
      { id: 'unit', kind: 'thing', ask: 'task.gohunit.q.unit', help: 'task.gohunit.h.unit', covers: ['pick.unit'], picker: { sources: ['exist'], lookup: 'gohunit', in: 'goh_dir' } },
      { id: 'donor', kind: 'goh-donor', ask: 'task.gohunit.q.donor', help: 'task.gohunit.h.donor', covers: ['pick.donor'], limits: { limit: 'PORT-46' } },
      // asked always: a unit for maps shows its name in the game too (a gen text op when it is not bought)
      { id: 'name', kind: 'text', ask: 'task.gohunit.q.name', help: 'task.gohunit.h.name', covers: ['roster.name'], optional: true },
    ] },
    { id: 'values', title: 'task.gohunit.g.values', essential: true, q: [
      { id: 'nation', kind: 'choice', ask: 'task.gohunit.q.nation', help: 'task.gohunit.h.nation', covers: ['ask.nation'], limits: { values: NATIONS } },
      { id: 'no_translate', kind: 'yesno', ask: 'task.gohunit.q.no_translate', help: 'task.gohunit.h.no_translate', covers: ['ask.no_translate'] },
      { id: 'drop_limits', kind: 'yesno', ask: 'task.gohunit.q.drop_limits', help: 'task.gohunit.h.drop_limits', covers: ['ask.drop_limits'] },
      { id: 'ask', kind: 'goh-ask', ask: 'task.gohunit.q.ask', help: 'task.gohunit.h.ask', covers: ['ask.values', 'stat.class', 'stat.mobility', 'stat.thresholds', 'stat.armor_body', 'stat.armor_turret'] },
    ] },
    { id: 'buy', title: 'task.gohunit.g.buy', essential: true, q: [
      { id: 'buyable', kind: 'yesno', ask: 'task.gohunit.q.buyable', help: 'task.gohunit.h.buyable', covers: ['roster.card'] },
      { id: 'army', kind: 'choice', ask: 'task.gohunit.q.army', help: 'task.gohunit.h.army', covers: ['roster.card'], limits: { values: ARMIES }, when: { buyable: true } },
      { id: 'army_own', kind: 'id', ask: 'task.gohunit.q.army_own', help: 'task.gohunit.h.army_own', covers: ['roster.card'], limits: { re: '^[a-z0-9_]{1,20}$' }, when: { army: 'own' } },
      { id: 'like', kind: 'thing', ask: 'task.gohunit.q.like', help: 'task.gohunit.h.like', covers: ['roster.card'], picker: { sources: ['keep', 'exist'], lookup: 'as2unit' }, when: { buyable: true } },
      { id: 'cost', kind: 'number', ask: 'task.gohunit.q.cost', help: 'task.gohunit.h.cost', covers: ['roster.card'], limits: { min: 1, max: 5000, step: 5 }, when: { buyable: true } },
      { id: 'icon_like', kind: 'thing', ask: 'task.gohunit.q.icon_like', help: 'task.gohunit.h.icon_like', covers: ['roster.icon'], picker: { sources: ['keep', 'exist'], lookup: 'as2unit' }, when: { buyable: true } },
      { id: 'bots', kind: 'yesno', ask: 'task.gohunit.q.bots', help: 'task.gohunit.h.bots', covers: ['roster.bots'], when: { buyable: true } },
    ] },
    { id: 'make', title: 'task.gohunit.g.make', essential: true, q: [
      { id: 'fit', kind: 'yesno', ask: 'task.gohunit.q.fit', help: 'task.gohunit.h.fit', covers: ['run.fit'] },
      { id: 'stage', kind: 'goh-stage', ask: 'task.gohunit.q.stage', help: 'task.gohunit.h.stage', covers: ['run.dry'] },
    ] },
    { id: 'more', title: 'task.gohunit.g.more', essential: false, q: [
      { id: 'rep_key', kind: 'yesno', ask: 'task.gohunit.q.rep_key', help: 'task.gohunit.h.rep_key', covers: ['run.fixed_flags'] },
      { id: 'pull_props', kind: 'yesno', ask: 'task.gohunit.q.pull_props', help: 'task.gohunit.h.pull_props', covers: ['run.fixed_flags'] },
      { id: 'mtl_fallback', kind: 'yesno', ask: 'task.gohunit.q.mtl_fallback', help: 'task.gohunit.h.mtl_fallback', covers: ['run.fixed_flags'] },
      { id: 'match_weapon', kind: 'yesno', ask: 'task.gohunit.q.match_weapon', help: 'task.gohunit.h.match_weapon', covers: ['run.fixed_flags'] },
    ] },
  ],
  kept: [
    ['pick.out', 'no tool step yet as a question: the built in mod step picks the mod the unit goes into'],
    ['run.show', 'not safe: a task never starts the game; GET /api/x/goh/show only prints commands and the built in Test step hands over to the Play page'],
    ['ask.keys', 'no tool step yet: one unit per task (goh2as2 --keys takes a list); run the task again for the next unit'],
    ['stat.weapon', 'no tool step yet: the gun numbers come from --match-weapon; the weapon sheet (goh2as2 --wpn-answers, tools/wpn) has no task step that asks its rows'],
    ['test.prove', 'not safe: prove starts the game and a task never does; the checklist says what to try'],
  ],
  checklist: ['task.gohunit.c.buy', 'task.gohunit.c.look', 'task.gohunit.c.drive', 'task.gohunit.c.fire', 'task.gohunit.c.origin'],
  lookups: { gohunit: gohUnits, as2unit: as2Units },
  // the Gates of Hell folder: the one this program finds (env, as2.json, Steam); the page puts the GUI's own GoH setting first
  values: (ctx) => ({ goh_dir: (ctx && dirs(ctx, gidOf(ctx), null).goh) || '', nation: 'auto', no_translate: false, drop_limits: false, ask: { answers: {} }, buyable: true, army: 'ger', like: '', cost: 150, name: '', icon_like: '', bots: true, fit: true,
    army_own: '', game_dir: '', rep_key: true, pull_props: true, mtl_fallback: true, match_weapon: true }),
  compile: (draft, c) => {
    const i = inputs(c.value, draft, c.game), why = refuse(i);
    if (why) throw ST.bad(why);
    const ask = c.value('ask');
    if (!i.noTranslate && ask && ask.sig && ask.sig !== scanSig(i)) throw ST.bad('The unit, donor or value choices changed after the value questions. Answer them again.');
    const st = ST.copies(c, 'gh', sigOf(i), 'Bring the unit over');
    if (!st.copies.length) throw ST.bad('The conversion made no files. Look at the step "Bring the unit over".');
    const unit = st.map.unit || i.unit;
    // plain notes: what was brought over and how (the command line is in the stage step's own lines)
    const notes = st.notes.concat(['Brought over: the Gates of Hell unit ' + i.unit + ', with ' + i.donor + ' as the donor. ' + (i.noTranslate ? 'The numbers are the donor\'s.' : 'The numbers are turned into Assault Squad 2 numbers (' + Object.keys(i.answers).length + ' of them answered by you).'),
      'This mod now carries Gates of Hell files (GOH-ORIGIN.tsv): do not publish it without the owners\' yes.']);
    const out = { copies: st.copies, notes, result: unit, copiesFirst: true };
    // the same ops on every tab; gen runs as the game genGame names (as64 for a goh draft, lib/compile.js writeDraft)
    const gen = genOf(i, unit, c.game || (draft && draft.game), notes);
    if (gen) out.gen = gen;
    return out;
  },
  routes: { 'POST /api/x/task/r/gohunit/dir': dirRoute, 'POST /api/x/task/r/gohunit/scan': scanRoute, 'POST /api/x/task/r/gohunit/stage': stageRoute },
  inputs, dirs, unitMade, gohWhy, chainArgs, gidOf, targetOf, genOf,
};
// the gen ops of the buy card or the name (pushes their notes), the same on the three tabs: on the Gates of Hell tab genGame (above)
// makes lib/compile.js writeDraft run gen, the copy/new marks and the mod guard as AS64, so the card is an AS2 one (never the GoH
// roster form). game is kept in the signature for the callers; the ops do not depend on it
function genOf(i, unit, game, notes) {
  if (i.buy) {
    // the buy card: gen roster (card copied from a vanilla one, price, icon, bot advice, the name text); it reads the unit the copies bring
    const op = { op: 'roster', unit, like: i.buy.like, army: i.buy.army, bots: i.buy.bots, icon_like: i.buy.icon };
    if (i.buy.cost) op.fields = { cost: i.buy.cost };
    if (i.buy.name) op.name = i.buy.name;
    notes.push('Buy card: ' + unit + ' in the ' + i.buy.army + ' list, card copied from ' + i.buy.like + (i.buy.cost ? ', price ' + i.buy.cost : '') + (i.buy.name ? ', name "' + i.buy.name + '"' : '') + '.');
    return { ops: [op] };
  }
  if (i.name) {
    // not bought: the name still shows in the game (gen text op, desc/entity/<unit>)
    notes.push('Name in the game: "' + i.name + '".');
    return { ops: [{ op: 'text', key: 'desc/entity/' + unit, text: i.name }] };
  }
  return null;
}
