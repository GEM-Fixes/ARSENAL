// GUI-EXT prep test. Arg: scratch dir. No game, no network, no server: fake sections, a store and a fixture mod under the scratch dir.
// 1 contract (shape, script rules, four languages, colours, settings key, second sub page of Help & Docs in every game)
// 2 collect (ids unique, needs exist, bad sections left out)   3 the runner (needs first, stale, a failing section, stop, na by game,
// no mod, clear, state shape, the job record)   4 the own sections on a real modtree walk   5 the page in a fake DOM.
// Author: Imperator_Aug (ARSENAL, ia-a0c29053)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'prep-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), lib = require('./lib'), collect = require('./collect');
const GUI = path.join(__dirname, '..', '..');
let bad = 0, n = 0;
const ok = (c, m, more) => { n++; if (!c) { bad++; console.log('FAIL ' + m + (more ? '\n  ' + more : '')); } };
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;
const tick = async (k = 6) => { for (let i = 0; i < k; i++) await new Promise(z => setImmediate(z)); };
const throws = async (f, re, m) => { try { await f(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message) && e.status === 400, m + ': ' + e.message); } };

// colourProblems: tools/gui/test/test-theme.js section 4 on one text (as ext/mapviz/test.js)
const NAMED = 'white|black|red|green|blue|gray|grey|yellow|orange|silver|navy|maroon|purple|teal|lime|pink|gold|brown|cyan|magenta|olive|aqua|fuchsia|darkgray|lightgray|darkgrey|lightgrey';
const LIT = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const NAMEDRE = new RegExp('(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline|fillStyle|strokeStyle|box-shadow)[\'"]?\\s*[:=,]\\s*[\'"]?[^;\'"]*?\\b(' + NAMED + ')\\b', 'gi');
function colourProblems(text, name) {
  const out = [];
  String(text).split('\n').forEach((l, i) => { for (const hit of (l.match(LIT) || []).concat(l.match(NAMEDRE) || [])) out.push(name + ':' + (i + 1) + ' ' + hit.slice(0, 60)); });
  return out;
}

// a fake section: st = its state now (changed by run), log = the order things ran in
function fakeSec(id, o, log) {
  const s = Object.assign({ id, title: 't.' + id, needs: [], areas: [], st: 'none',
    state() { return { state: s.st, why: s.st === 'stale' ? ['mod', 'release'] : [], at: s.st === 'ready' ? 1700000000000 : null, bytes: s.st === 'ready' ? 2048 : 0, note: 'note ' + id }; },
    async run(ctx, q, job) { log.push(id); job.set({ stage: 'stage ' + id, done: 1, total: 2 }); await tick(2); if (s.fail) throw new Error('boom ' + id); if (!job.cancelled) s.st = 'ready'; } }, o || {});
  return s;
}
const fakeLang = ids => { const L = { en: {}, ru: {}, uk: {}, zh: {} }; for (const id of ids) { L.en['t.' + id] = 'Title ' + id; L.ru['t.' + id] = 'Название ' + id; L.uk['t.' + id] = 'Назва ' + id; L.zh['t.' + id] = '标题 ' + id; } return L; };
function mkCtx(secs, o) {
  const c = collect([{ id: 'fake', lang: fakeLang(secs.map(s => s.id)), prep: secs }]);
  return Object.assign({ jobs: require('../../joblist').create({ keepMs: 0 }), prepSections: c.prep, problems: c.problems, cacheSwept: 0,
    cache: null, modtree: require('../../../lib/modtree'), gameview: { stamp: () => 's1', get: () => ({}), drop() {} },
    gameId: () => 'as64', exe: () => 'as64', curDir: () => path.join(work, 'game'), game: () => path.join(work, 'game') }, o || {});
}
const stateOf = async (ctx, mod) => R['GET /api/x/prep/state'](U(mod ? 'mod=' + encodeURIComponent(mod) : ''), null, ctx);
const rowOf = (st, id) => st.sections.find(s => s.id === id);

(async () => {
  const mod = path.join(work, 'mod'), W = (rel, b) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
  W('mod.info', 'x'); W('resource/set/a.set', 'a'); W('resource/entity/b.def', 'b');
  fs.mkdirSync(path.join(work, 'game'), { recursive: true });

  // ===== 1. contract
  ok(X.id === 'prep' && X.nav === 'prep.nav' && X.adv === false && Array.isArray(X.prep), 'shape');
  ok(!/`|\$\{/.test(X.script) && !/innerHTML|insertAdjacentHTML|document\.write/.test(X.script) && /EXT_SCREENS\.prep\s*=/.test(X.script), 'script rules: no backtick, no dollar-brace, no HTML writes');
  try { new vm.Script(X.script); } catch (e) { ok(false, 'script parses: ' + e.message); }
  const L = X.lang, core = require('../../lang/en.json');
  for (const c of ['ru', 'uk', 'zh']) for (const k of Object.keys(L.en)) {
    ok(L[c][k] && typeof L[c][k] === 'string', 'lang ' + c + ' ' + k);
    ok((L.en[k].match(/\{\w+\}/g) || []).sort().join() === ((L[c][k] || '').match(/\{\w+\}/g) || []).sort().join(), 'placeholders ' + c + ' ' + k);
  }
  for (const m of X.script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.')) ok(L.en[m[1]] || core[m[1]], 'tx key ' + m[1]);
  for (const k of ['ready', 'none', 'stale', 'staleW', 'na', 'run', 'runP', 'wait']) ok(L.en['prep.st.' + k], 'state word ' + k);
  for (const k of ['mod', 'game', 'release', 'version']) ok(L.en['prep.why.' + k], 'why word ' + k);
  for (const k of ['what', 'state', 'size', 'when', 'note', 'do']) ok(L.en['prep.col.' + k], 'column ' + k);
  for (const s of X.prep) ok(L.en[s.title] && L.en[s.note] !== '', 'own section title ' + s.id);
  ok(L.en['prep.job.run'].includes('{s}') && L.en['prep.job.check'], 'job names');
  ok(!/cache entr/i.test(Object.values(L.en).join(' ')), 'plain words: no "cache entry" in the texts');
  for (const k of Object.keys(R)) ok(/^(GET|POST) \/api\/x\/prep\/[a-z]+$/.test(k), 'route ' + k);
  ok(Object.keys(R).sort().join() === ['GET /api/x/prep/state', 'POST /api/x/prep/check', 'POST /api/x/prep/clear', 'POST /api/x/prep/run', 'POST /api/x/prep/stop'].join(), 'the five routes of the contract');
  { const files = ['index.js', 'lib.js', 'collect.js', 'lang.js'], cp = colourProblems(X.script, 'script');
    for (const f of files) cp.push(...colourProblems(fs.readFileSync(path.join(__dirname, f), 'utf8'), f));
    ok(!cp.length, 'no colour literal in the script or the page files', cp.join('\n  '));
    ok(colourProblems("h('div',{style:'color:#f00'})", 'x').length === 1 && colourProblems("style:'border:1px solid red'", 'x').length === 1, 'seeded: a colour literal is caught'); }
  { const S = require('../../settings');
    ok(S.okKey('as2gui.prep.open') && !S.okKey('as2gui.prep') && !S.okKey('as2gui.zzprep.open'), 'settings: prep.* keys are kept by the server');
    ok(/LS\.get\('prep\.open',true\)!==false/.test(X.script) && /LS\.set\('prep\.open'/.test(X.script), 'the tick box reads and writes prep.open, default true'); }
  { const G = require('../../groups');
    for (const g of G.GAMES) { const t = g.tabs.find(x => x.id === 'help'), s = t && t.subs[1];   // Start Here first, Prepare second (owner 2026-11-22)
      ok(s && s.id === 'prep' && s.pages.join() === 'prep' && s.label === 'grp.s.prep' && !(g.na || {}).prep, g.id + ': Prepare is the second sub page of Help & Docs, after Start Here'); }
    for (const c of ['en', 'ru', 'uk', 'zh']) ok(typeof require('../../lang/' + c + '.json')['grp.s.prep'] === 'string', 'core lang ' + c + ' grp.s.prep'); }
  { const E = require('../index');
    ok(E.some(x => x.id === 'prep'), 'registered in ext/index.js');
    ok(Array.isArray(E.prep) && E.prep[0].id === 'game.view' && E.prep[0].ext === 'prep' && E.prep.some(s => s.id === 'mod.tree'), 'ext/index.js collects the sections: ' + (E.prep || []).map(s => s.id).join(' '));
    ok(Array.isArray(E.prepProblems) && E.prepProblems.length === 0, 'every ext prep section is well formed', (E.prepProblems || []).join('\n  '));
    ok(new Set(E.prep.map(s => s.id)).size === E.prep.length && E.prep.every(s => s.needs.every(x => E.prep.some(z => z.id === x))), 'collected: ids unique, needs exist');
    ok(E.prep.every(s => ['en', 'ru', 'uk', 'zh'].every(c => s.titles[c] && s.titles[c] !== s.title)), 'collected: every section title is in its ext lang, four languages', E.prep.filter(s => s.titles.en === s.title).map(s => s.id).join(' '));
    ok(/prepSections: require\('\.\/ext'\)\.prep/.test(fs.readFileSync(path.join(GUI, 'gui.js'), 'utf8')), 'gui.js hands the list to routes as ctx.prepSections'); }

  // ===== 2. collect
  { const f = () => {}, okS = { id: 'a.b', title: 't', state: f, run: f };
    const c = collect([{ id: 'one', lang: { en: { t: 'T' }, ru: { t: 'Т' } }, prep: [okS, { id: 'a.b', title: 't', state: f, run: f }, { id: 'Bad Id', title: 't', state: f, run: f }, { id: 'c', title: 't', state: f }, { id: 'd', title: 't', state: f, run: f, areas: ['nope'] },
      { id: 'e', title: 't', state: f, run: f, needs: ['a.b', 'ghost', 'e'], areas: ['set'], games: ['goh'] }, null] }, { id: 'two' }, { id: 'three', prep: [{ id: 'f', title: 'k', state: f, run: f, needs: ['e'] }] }]);
    ok(c.prep.map(s => s.id + '<' + s.ext).join() === 'a.b<one,e<one,f<three', 'collect keeps the good ones in order, each with its ext', c.prep.map(s => s.id).join());
    ok(c.problems.length === 7 && /used twice/.test(c.problems.join()) && /ghost/.test(c.problems.join()) && /needs itself/.test(c.problems.join()), 'collect names every problem (' + c.problems.length + ')', c.problems.join('\n  '));
    ok(c.prep[1].needs.join() === 'a.b' && c.prep[0].titles.ru === 'Т' && c.prep[0].titles.zh === 'T' && c.prep[2].titles.en === 'k', 'collect: a missing need is dropped; titles from the ext lang, en else the key');
    ok(c.prep[0] !== okS && okS.ext === undefined, 'collect copies: the ext own object is not changed'); }

  // ===== 3. the runner
  { // needs first, a need that is ready is not run again, the job record, state shape
    const log = [], a = fakeSec('a', { needs: ['b'] }, log), b = fakeSec('b', {}, log), c = fakeSec('c', { needs: ['a'] }, log);
    const ctx = mkCtx([a, b, c]);
    ok(!ctx.problems.length, 'fake sections are well formed', ctx.problems.join());
    const s0 = await stateOf(ctx);
    ok(Object.keys(s0).sort().join() === 'checking,mod,release,sections,store,updated' && s0.updated === false && s0.checking === false && s0.store === null, 'state shape', Object.keys(s0).sort().join());
    ok(Object.keys(s0.sections[0]).sort().join() === 'areas,at,bytes,done,error,ext,id,needs,note,queued,running,stage,state,title,total,why', 'section row shape', Object.keys(s0.sections[0]).sort().join());
    ok(s0.sections.map(s => s.id + ':' + s.state + ':' + s.ext).join() === 'a:none:fake,b:none:fake,c:none:fake' && rowOf(s0, 'a').needs.join() === 'b' && rowOf(s0, 'a').title === 't.a', 'rows: id, ext, title key, needs, state');
    const r1 = await R['POST /api/x/prep/run'](null, { sections: ['c'], lang: 'ru' }, ctx);
    ok(r1.queued.join() === 'b,a,c', 'run [c]: its needs first (b, a, c)', r1.queued.join());
    const j = ctx.jobs.list();
    ok(j.length === 1 && j[0].kind === 'bg' && j[0].what === 'prep.job.run' && j[0].whatP.s === 'Название b' && j[0].page === 'prep' && j[0].game === 'as64' && j[0].canCancel === true, 'one background job at a time, named by prep.job.run with the title text', JSON.stringify(j));
    await tick(1);
    const s1 = await stateOf(ctx);
    ok(rowOf(s1, 'b').running && !rowOf(s1, 'b').queued && rowOf(s1, 'a').queued && rowOf(s1, 'c').queued && rowOf(s1, 'b').stage === 'stage b' && rowOf(s1, 'b').done === 1 && rowOf(s1, 'b').total === 2, 'state while running: running, queued, progress', JSON.stringify(s1.sections.map(s => [s.id, s.running, s.queued, s.stage])));
    const again = await R['POST /api/x/prep/run'](null, { sections: 'all' }, ctx);
    ok(again.queued.length === 0, 'what runs or waits is not queued twice', again.queued.join());
    await lib.settle(ctx);
    ok(log.join() === 'b,a,c' && ctx.jobs.list().length === 0, 'ran in order b, a, c, one after another', log.join());
    const s2 = await stateOf(ctx);
    ok(s2.sections.every(s => s.state === 'ready' && !s.running && !s.queued && s.stage === null) && rowOf(s2, 'a').bytes === 2048 && rowOf(s2, 'a').at === 1700000000000 && rowOf(s2, 'a').note === 'note a', 'after the run: ready, size, time, note');
    log.length = 0; c.st = 'stale';
    const r2 = await R['POST /api/x/prep/run'](null, { sections: ['c'] }, ctx); await lib.settle(ctx);
    ok(r2.queued.join() === 'c' && log.join() === 'c', 'a need that is ready is not made again', r2.queued.join());
    log.length = 0; a.st = 'stale';
    const r3 = await R['POST /api/x/prep/run'](null, { sections: 'stale' }, ctx); await lib.settle(ctx);
    ok(r3.queued.join() === 'a' && log.join() === 'a', "'stale' takes what is stale or not made", r3.queued.join());
    ok((await R['POST /api/x/prep/run'](null, { sections: 'stale' }, ctx)).queued.length === 0, "'stale' with everything ready queues nothing");
    log.length = 0;
    const r4 = await R['POST /api/x/prep/run'](null, { sections: 'all' }, ctx); await lib.settle(ctx);
    ok(r4.queued.join() === 'b,a,c' && log.join() === 'b,a,c', "'all' runs every section, needs first", r4.queued.join());
    await throws(() => R['POST /api/x/prep/run'](null, { sections: ['nope'] }, ctx), /No such prepared data: nope/, 'run: unknown section');
    await throws(() => R['POST /api/x/prep/run'](null, {}, ctx), /sections/, 'run: no sections');
    await throws(() => R['POST /api/x/prep/run'](null, { sections: 'all', mod: path.join(work, 'missing') }, ctx), /does not exist/, 'run: a mod folder that does not exist');
    await throws(() => R['POST /api/x/prep/run'](null, { sections: 'all', mod: 'relative/mod' }, ctx), /full path/, 'run: a mod path that is not a full path');
  }
  { // a failing section: reported, the rest still runs; the error goes on the next run
    const log = [], a = fakeSec('a', { fail: true }, log), b = fakeSec('b', { needs: ['a'] }, log), c = fakeSec('c', {}, log);
    const ctx = mkCtx([a, b, c]);
    const r = await R['POST /api/x/prep/run'](null, { sections: 'all' }, ctx); await lib.settle(ctx);
    const s = await stateOf(ctx);
    ok(r.queued.join() === 'a,b,c' && log.join() === 'a,b,c', 'a failed section does not stop the rest', log.join());
    ok(rowOf(s, 'a').error === 'boom a' && rowOf(s, 'a').state === 'none' && rowOf(s, 'b').state === 'ready' && !rowOf(s, 'b').error && rowOf(s, 'c').state === 'ready', 'the failure is in its row (error), the others are ready', JSON.stringify(rowOf(s, 'a')));
    a.fail = false; await R['POST /api/x/prep/run'](null, { sections: ['a'] }, ctx); await lib.settle(ctx);
    ok(rowOf(await stateOf(ctx), 'a').error === '' && a.st === 'ready', 'the error is gone after a run that worked');
    // a state function that throws: the row says so, the page still lists
    ctx.prepSections.find(x => x.id === 'a').state = () => { throw new Error('state broke'); };
    const s2 = await stateOf(ctx);
    ok(rowOf(s2, 'a').state === 'none' && rowOf(s2, 'a').error === 'state broke' && rowOf(s2, 'c').state === 'ready', 'a state() that throws is one row with an error');
  }
  { // stop: the running job is cancelled, the queue is emptied
    const log = []; let release;
    const a = fakeSec('a', { async run(ctx, q, job) { log.push('a'); await new Promise(z => { release = z; if (job.onCancel) job.onCancel(z); }); if (!job.cancelled) a.st = 'ready'; } }, log), b = fakeSec('b', {}, log), c = fakeSec('c', {}, log);
    const ctx = mkCtx([a, b, c]);
    await R['POST /api/x/prep/run'](null, { sections: 'all' }, ctx); await tick(2);
    const s1 = await stateOf(ctx);
    ok(rowOf(s1, 'a').running && rowOf(s1, 'b').queued && rowOf(s1, 'c').queued, 'stop: one runs, two wait');
    const st = await R['POST /api/x/prep/stop'](null, {}, ctx); await lib.settle(ctx);
    const s2 = await stateOf(ctx);
    ok(st.stopped === true && log.join() === 'a' && s2.sections.every(s => !s.running && !s.queued && s.state === 'none' && !s.error) && ctx.jobs.list().length === 0, 'stop cancels the running one and empties the queue; a stopped section is no error', log.join() + ' ' + JSON.stringify(s2.sections.map(s => [s.state, s.error])));
    ok((await R['POST /api/x/prep/stop'](null, {}, ctx)).stopped === false, 'stop with nothing running');
    // the job list's own Cancel stops only the running section: the next one runs
    log.length = 0;
    await R['POST /api/x/prep/run'](null, { sections: ['a', 'b'] }, ctx); await tick(2);
    ok(ctx.jobs.cancel(ctx.jobs.list()[0].id) === true, 'the running section can be cancelled from the job list');
    await lib.settle(ctx);
    ok(log.join() === 'a,b' && a.st === 'none' && b.st === 'ready', 'cancel from the job list: that section stops, the next still runs', log.join());
    void release;
  }
  { // na by game, sections that read the mod without a mod, tools started by a section belong to its job
    const log = []; let seen = null;
    const g = fakeSec('g', { games: ['goh'] }, log), m = fakeSec('m', { areas: ['set'] }, log), a = fakeSec('a', { async run(ctx, q, job) { seen = { q, job: ctx.job === job, tool: await ctx.runTool('t', 'e', ['x'], { timeoutMs: 5 }) }; a.st = 'ready'; } }, log);
    const calls = [], ctx = mkCtx([g, m, a], { runTool: async (tool, entry, args, o) => { calls.push(o); return { code: 0 }; } });
    const s = await stateOf(ctx);
    ok(rowOf(s, 'g').state === 'na' && rowOf(s, 'g').why.length === 0 && rowOf(s, 'm').state === 'na' && rowOf(s, 'm').why.join() === 'nomod' && rowOf(s, 'a').state === 'none' && s.mod === '', 'na: a section of another game; a mod section with no mod picked (why nomod)');
    const r = await R['POST /api/x/prep/run'](null, { sections: 'all' }, ctx); await lib.settle(ctx);
    ok(r.queued.join() === 'a' && log.length === 0 && seen && seen.q.mod === '' && seen.q.game.id === 'as64' && seen.q.game.exe === 'as64' && seen.q.game.dir === path.join(work, 'game'), 'all without a mod under AS64: only the usable section runs; q = {mod, game: {id, dir, exe}}', r.queued.join());
    ok(seen.job && calls.length === 1 && calls[0].job && calls[0].job.id && calls[0].timeoutMs === 5, 'a tool a section starts belongs to its background job');
    ok((await R['POST /api/x/prep/run'](null, { sections: ['g', 'm'] }, ctx)).queued.length === 0, 'asked by id: a section that cannot run here is left out');
    const s2 = await stateOf(ctx, mod);
    ok(rowOf(s2, 'm').state === 'none' && s2.mod === path.resolve(mod), 'with a mod the mod section has a state');
    ok((await stateOf(ctx, path.join(work, 'missing'))).mod === '', 'state: a mod folder that is not there counts as no mod');
    const r2 = await R['POST /api/x/prep/run'](null, { sections: 'all', mod }, ctx); await lib.settle(ctx);
    ok(r2.queued.join() === 'm,a' && log.join() === 'm', 'all with a mod: the mod section too', r2.queued.join());
    const goh = Object.assign({}, ctx, { gameId: () => 'goh', exe: () => 'goh' });
    ok(rowOf(await stateOf(goh, mod), 'g').state !== 'na', 'under GoH the GoH section applies');
  }
  { // clear: one section (its clear(), its store names, else its id) and everything; updated once
    const store = require('../../../lib/cachestore').open({ root: path.join(work, 'store'), release: 't1' });
    const log = [], cleared = [];
    const a = fakeSec('a.x', {}, log), b = fakeSec('b', { store: ['bb.one', 'bb.two'] }, log), c = fakeSec('c', { clear(ctx, q) { cleared.push(q.mod); return { removed: 3, bytes: 30 }; } }, log);
    const ctx = mkCtx([a, b, c], { cache: store, cacheSwept: 2 });
    const fill = () => { for (const s of ['a.x', 'bb.one', 'bb.two', 'other']) store.put(s, 1, { k: 1 }, {}, { v: s }); };
    const has = s => !!store.get(s, 1, { k: 1 }, {});
    fill();
    const s0 = await stateOf(ctx), s1 = await stateOf(ctx);
    ok(s0.updated === true && s1.updated === false && s0.release === 't1', 'updated: true on the first read after a start that swept, false after');
    ok(s0.store && s0.store.root === store.root && s0.store.cap > 0 && typeof s0.store.bytes === 'number', 'state carries the store stats (folder, size, cap)');
    const c1 = await R['POST /api/x/prep/clear'](null, { section: 'a.x' }, ctx);
    ok(c1.removed === 1 && !has('a.x') && has('bb.one') && has('other'), 'clear one: the store section named like it', JSON.stringify(c1));
    const c2 = await R['POST /api/x/prep/clear'](null, { section: 'b' }, ctx);
    ok(c2.removed === 2 && !has('bb.one') && !has('bb.two') && has('other'), 'clear one: its store names', JSON.stringify(c2));
    const c3 = await R['POST /api/x/prep/clear'](null, { section: 'c', mod }, ctx);
    ok(c3.removed === 3 && c3.bytes === 30 && cleared.join() === path.resolve(mod) && has('other'), 'clear one: its own clear(ctx, q)', JSON.stringify(c3));
    await throws(() => R['POST /api/x/prep/clear'](null, { section: 'zz' }, ctx), /No such prepared data/, 'clear: unknown section');
    fill(); cleared.length = 0; b.fail = true;
    await R['POST /api/x/prep/run'](null, { sections: ['b'] }, ctx); await lib.settle(ctx);
    ok(rowOf(await stateOf(ctx), 'b').error === 'boom b', 'clear all: an error is listed before');
    await R['POST /api/x/prep/run'](null, { sections: ['a.x'] }, ctx);
    const c4 = await R['POST /api/x/prep/clear'](null, {}, ctx); await lib.settle(ctx);
    ok(c4.removed === 4 + 3 && !has('a.x') && !has('other') && cleared.length === 1 && ctx.jobs.list().length === 0, 'clear all: the whole store, every clear(), what ran is stopped', JSON.stringify(c4));
    ok(rowOf(await stateOf(ctx), 'b').error === '', 'clear all: errors are gone');
  }

  // ===== 4. the own sections: a real walk of the fixture mod, a stand-in game view
  { const modtree = require('../../../lib/modtree'), store = require('../../../lib/cachestore').open({ root: path.join(work, 'store2'), release: 't1' });
    modtree._reset({ store });
    let stampNow = 's1', built = 0, dropped = 0;
    const gameview = { stamp: () => stampNow, get: () => { built++; return {}; }, drop() { dropped++; } };
    // only the two own sections here: the other pages' sections are theirs to test
    const ctx = { jobs: require('../../joblist').create({ keepMs: 0 }), prepSections: collect([{ id: 'prep', lang: X.lang, prep: lib.OWN }]).prep, cache: store, cacheSwept: 0, modtree, gameview, gameId: () => 'mowas2', exe: () => 'mowas_2', curDir: () => path.join(work, 'game') };
    ok(lib.sectionsOf({}) === require('../index').prep && lib.sectionsOf(ctx) === ctx.prepSections, 'the list is ctx.prepSections; without it the one of ext/index.js');
    const s0 = await stateOf(ctx, mod);
    ok(rowOf(s0, 'game.view').state === 'none' && rowOf(s0, 'game.view').note === 'prep.note.view' && rowOf(s0, 'mod.tree').state === 'none' && rowOf(s0, 'mod.tree').areas.join() === 'all' && rowOf(s0, 'game.view').areas.length === 0, 'own sections: not made at first');
    ok(rowOf(await stateOf(ctx), 'mod.tree').why.join() === 'nomod' && rowOf(await stateOf(ctx), 'game.view').state === 'none', 'no mod: mod.tree is not offered, game.view is');
    const r = await R['POST /api/x/prep/run'](null, { sections: ['game.view', 'mod.tree'], mod }, ctx); await lib.settle(ctx);
    const s1 = await stateOf(ctx, mod), mt = rowOf(s1, 'mod.tree'), gv = rowOf(s1, 'game.view');
    ok(r.queued.join() === 'game.view,mod.tree' && built === 1 && gv.state === 'ready' && gv.at > 0 && !gv.error, 'game.view: built once, ready', JSON.stringify(gv));
    ok(mt.state === 'ready' && mt.note && mt.note.key === 'prep.note.files' && mt.note.p.n === 3 && mt.at >= lib.BOOT && !mt.error, 'mod.tree: ready with the file count in the note', JSON.stringify(mt));
    stampNow = 's2';
    ok(rowOf(await stateOf(ctx, mod), 'game.view').state === 'stale' && rowOf(await stateOf(ctx, mod), 'game.view').why.join() === 'game', 'game.view: out of date when the game stamp moves (why game)');
    stampNow = 's1';
    // a walk kept from before this start: only the stored one is known -> stale, why mod
    const T = modtree.last(mod); modtree._reset({ store });
    store.put('modtree', modtree.VER, { mod: path.resolve(mod).replace(/\\/g, '/').toLowerCase() }, {}, Object.assign({}, T, { at: lib.BOOT - 60000 }));
    const s2 = rowOf(await stateOf(ctx, mod), 'mod.tree');
    ok(s2.state === 'stale' && s2.why.join() === 'mod' && s2.note.key === 'prep.note.kept' && s2.note.p.n === 3, 'mod.tree: only the walk kept from before the start is known -> stale, why mod', JSON.stringify(s2));
    const rs = await R['POST /api/x/prep/run'](null, { sections: 'stale', mod }, ctx);
    ok(rs.queued.join() === 'mod.tree', "'stale' picks the kept walk", rs.queued.join()); await lib.settle(ctx);
    ok(rowOf(await stateOf(ctx, mod), 'mod.tree').state === 'ready', 'mod.tree: ready again after the walk');
    // check: touch + walk as a background job; a new file shows in the count
    W('resource/set/new.set', 'n');
    const ck = await R['POST /api/x/prep/check'](null, { mod }, ctx);
    const during = await stateOf(ctx, mod), cj = ctx.jobs.list();
    ok(ck.started === true && during.checking === true && cj.length === 1 && cj[0].kind === 'bg' && cj[0].what === 'prep.job.check' && cj[0].page === 'prep' && cj[0].game === 'mowas2', 'check: a background job, state says checking', JSON.stringify(cj));
    ok((await R['POST /api/x/prep/check'](null, { mod }, ctx)).started === false, 'check: one at a time');
    await lib.settle(ctx);
    const s3 = await stateOf(ctx, mod);
    ok(s3.checking === false && rowOf(s3, 'mod.tree').note.p.n === 4 && ctx.jobs.list().length === 0, 'check: after it the states are fresh (4 files)', JSON.stringify(rowOf(s3, 'mod.tree').note));
    await throws(() => R['POST /api/x/prep/check'](null, {}, ctx), /Pick a mod/, 'check: no mod');
    // clear of the own sections
    await R['POST /api/x/prep/clear'](null, { section: 'mod.tree', mod }, ctx);
    ok(rowOf(await stateOf(ctx, mod), 'mod.tree').state === 'none' && !store.get('modtree', modtree.VER, { mod: path.resolve(mod).replace(/\\/g, '/').toLowerCase() }, {}), 'clear mod.tree: not made, the kept walk is gone');
    await R['POST /api/x/prep/run'](null, { sections: ['mod.tree'], mod }, ctx); await lib.settle(ctx);
    ok(rowOf(await stateOf(ctx, mod), 'mod.tree').state === 'ready', 'mod.tree: ready after Prepare that follows a Clear');
    await R['POST /api/x/prep/clear'](null, { section: 'game.view', mod }, ctx);
    ok(dropped === 1 && rowOf(await stateOf(ctx, mod), 'game.view').state === 'none', 'clear game.view: dropped, not made');
    const noGame = Object.assign({}, ctx, { curDir: () => null });
    ok(rowOf(await stateOf(noGame, mod), 'game.view').note === 'prep.note.nogame', 'game.view without a game folder: the note says so');
    await R['POST /api/x/prep/run'](null, { sections: ['game.view'] }, noGame); await lib.settle(noGame);
    ok(/game folder is not set/.test(rowOf(await stateOf(noGame, mod), 'game.view').error), 'game.view without a game folder: the run fails with a plain reason');
    modtree._reset();
  }

  // ===== 5. the page in a fake DOM
  { const { make } = require(path.join(GUI, 'test', 'fakedom')), BC = require(path.join(GUI, 'test', 'blockcheck'));
    const sec = (id, o) => Object.assign({ id, ext: 'fake', title: 't.' + id, needs: [], areas: [], state: 'ready', why: [], at: 1700000000000, bytes: 2048, note: '', running: false, queued: false, error: '', stage: null, done: null, total: null }, o);
    const SECS = () => [
      sec('game.view', { title: 'prep.s.view', bytes: null, at: null, note: 'prep.note.view' }),
      sec('mod.tree', { title: 'prep.s.tree', areas: ['all'], note: { key: 'prep.note.files', p: { n: 12 } } }),
      sec('u.stale', { state: 'stale', why: ['mod', 'game', 'release', 'version', 'odd'], note: 'free text' }),
      sec('u.none', { state: 'none', at: null, bytes: 0, error: 'boom' }),
      sec('u.na', { state: 'na', at: null, bytes: 0 }),
      sec('u.run', { state: 'none', running: true, stage: 'prep.st.tree', done: 5, total: 9 }),
      sec('u.wait', { state: 'none', queued: true }),
      sec('u.nomod', { state: 'na', why: ['nomod'] }),
    ];
    const mk = (o) => {
      o = o || {};
      const doc = make(), calls = [], timers = [], ls = Object.assign({}, o.ls);
      const P = { reply: { release: 'dev', updated: false, checking: false, mod: 'D:/mods/m', store: { root: 'D:/cache/store', bytes: 3 * 1048576, cap: 2 * 1073741824, entries: 4, sections: {} }, sections: SECS() }, post: {} };
      const LL = Object.assign({}, core, X.lang.en, { 't.u.stale': 'Stale one', 't.u.none': 'None one', 't.u.na': 'Na one', 't.u.run': 'Run one', 't.u.wait': 'Wait one', 't.u.nomod': 'Nomod one' });
      const box = { document: doc, EXT_SCREENS: {}, LANG: 'uk', S: { mod: o.mod === undefined ? 'D:/mods/m' : o.mod, cur: 'prep' },
        LS: { get: (k, d) => (k in ls ? ls[k] : d), set: (k, v) => { ls[k] = v; } },
        setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: i => { if (timers[i - 1]) timers[i - 1].off = true; },
        tx: (k, p) => { const s = LL[k]; return s == null ? k : s.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
        api: (u, b, opt) => { calls.push({ u: String(u), b, opt });
          const name = String(u).replace(/^\/api\/x\/prep\//, '').split('?')[0];
          if (P.fail && P.fail[name]) return Promise.reject(Object.assign(new Error(P.fail[name]), { text: P.fail[name] }));
          return Promise.resolve(JSON.parse(JSON.stringify(name === 'state' ? P.reply : P.post[name] || {}))); } };
      const F = BC.pageFns(doc); for (const k of BC.NAMES) box[k] = F[k];
      vm.runInNewContext(X.script, box);
      const root = doc.createElement('section'); root.setAttribute('data-id', 'prep');
      const scr = box.EXT_SCREENS.prep(root);
      const live = () => timers.filter(t => !t.off && !t.ran);
      return { doc, root, scr, box, calls, timers, live, ls, P,
        act: a => root.querySelector('button[data-act=' + a + ']'), rows: () => root.querySelectorAll('tr[data-sec]'),
        row: id => root.querySelectorAll('tr[data-sec]').find(r => r.dataset.sec === id), rb: (id, a) => root.querySelectorAll('button[data-row=' + a + ']').find(b => b.dataset.sec === id),
        posts: () => calls.filter(c => c.b !== undefined), states: () => calls.filter(c => /\/state\?/.test(c.u)),
        fire: async () => { const t = live()[0]; if (!t) return false; t.ran = true; t.f(); await tick(); return true; } };
    };
    const E = X.lang.en;

    // draws rows and states
    const p = mk(); await p.scr.refresh(); await tick();
    ok(typeof p.scr.refresh === 'function' && typeof p.scr.focus === 'function', 'screen returns refresh and focus');
    ok(p.states().length === 1 && p.states()[0].u === '/api/x/prep/state?mod=' + encodeURIComponent('D:/mods/m') && p.states()[0].b === undefined && p.states()[0].opt && p.states()[0].opt.job === false, 'reads state?mod= with {job:false}', JSON.stringify(p.calls[0]));
    ok(p.rows().length === 7 && !p.row('u.nomod'), 'one row per section; a section that needs a mod it does not have is not listed', String(p.rows().length));
    const cell = (id, i) => p.row(id).children[i].textContent;
    ok(cell('game.view', 0) === E['prep.s.view'] && cell('game.view', 1) === 'Ready' && cell('game.view', 2) === '' && cell('game.view', 3) === '' && cell('game.view', 4) === E['prep.note.view'], 'row: title, Ready, a note that is a key', cell('game.view', 1) + '|' + cell('game.view', 4));
    ok(cell('mod.tree', 2) === '2.0 KB' && cell('mod.tree', 3) === new Date(1700000000000).toLocaleString() && cell('mod.tree', 4) === '12 files', 'row: size, time made in the local form, a note with a number', cell('mod.tree', 2) + '|' + cell('mod.tree', 3) + '|' + cell('mod.tree', 4));
    ok(cell('u.stale', 1) === 'Out of date: mod changed, game updated, ARSENAL updated, new version of this data, odd' && cell('u.stale', 4) === 'free text', 'row: Out of date with the reasons in words; a free text note', cell('u.stale', 1));
    ok(cell('u.none', 1) === 'Not made' + 'Did not work: boom' && p.row('u.none').querySelector('.err'), 'row: Not made, and why the last try did not work', cell('u.none', 1));
    ok(cell('u.na', 1) === 'Not for this game' && p.rb('u.na', 'run').disabled && p.rb('u.na', 'clear').disabled, 'row: Not for this game, its buttons off');
    ok(cell('u.run', 1) === 'Working… ' + E['prep.st.tree'] + ' 5 / 9' && p.rb('u.run', 'run').disabled && !p.rb('u.run', 'clear').disabled, 'row: Working with progress, Prepare off', cell('u.run', 1));
    ok(cell('u.wait', 1) === 'Waiting' && p.rb('u.wait', 'run').disabled, 'row: Waiting');
    ok(p.rb('u.stale', 'run').textContent === 'Prepare' && p.rb('u.stale', 'clear').textContent === 'Clear' && p.rb('u.stale', 'run').getAttribute('aria-label') === 'Prepare: Stale one', 'row buttons Prepare and Clear, named for the row');
    ok(p.root.has('Cache folder: D:/cache/store. Used: 3.0 MB of 2.00 GB.'), 'the folder line: folder, total size against the cap');
    ok(p.root.has(E['prep.intro']) && p.root.has('Mod: D:/mods/m') && !p.root.has(E['prep.nomod']), 'intro and the mod line');
    ok(['all', 'stale', 'check', 'stop', 'clear'].map(a => p.act(a).textContent).join('|') === 'Prepare everything|Prepare what is out of date|Check the mod for changes|Stop|Clear all', 'the five top buttons');
    ok(p.root.querySelector('div.wzstat').parentNode.hidden === true, 'no update notice when updated is false');
    const bp = BC.checkScreen(p.root, 'prep');
    ok(bp.length === 0, 'blocks: every control and text is in a leaf block', bp.join('\n  '));

    // the poll: every 1.5 s while something runs or waits, stops when idle
    ok(p.live().length === 1 && p.live()[0].ms === 1500, 'something runs: the list is read again in 1.5 s');
    await p.fire();
    ok(p.states().length === 2 && p.states()[1].opt.job === false && p.live().length === 1, 'the poll reads state with {job:false} and goes on while busy');
    p.P.reply.sections.forEach(s => { s.running = false; s.queued = false; });
    await p.fire();
    ok(p.states().length === 3 && p.live().length === 0 && p.act('stop').disabled === true, 'idle: the poll stops, Stop is off');
    ok(!(await p.fire()) && p.states().length === 3, 'no read without a refresh after that');
    p.P.reply.checking = true; await p.scr.refresh(); await tick();
    ok(p.live().length === 1 && p.root.has(E['prep.checking']) && p.act('check').disabled && !p.act('stop').disabled, 'checking: polls, says so, Check off, Stop on');
    p.box.S.cur = 'mods'; await p.fire();
    ok(p.live().length === 0, 'another page on show: the poll stops');
    p.box.S.cur = 'prep'; p.scr.focus(); await tick();
    ok(p.live().length === 1, 'focus reads again and the poll resumes');
    p.P.reply.checking = false; await p.fire();

    // buttons post the right bodies
    const last = () => { const a = p.posts(); return a[a.length - 1]; };
    p.P.post.run = { queued: ['game.view'] };
    p.act('all').click(); await tick();
    ok(last().u === '/api/x/prep/run' && JSON.stringify(last().b) === JSON.stringify({ mod: 'D:/mods/m', sections: 'all', lang: 'uk' }), 'Prepare everything -> run {mod, sections: all}', JSON.stringify(last()));
    const nState = p.states().length;
    p.act('stale').click(); await tick();
    ok(last().u === '/api/x/prep/run' && last().b.sections === 'stale' && last().b.mod === 'D:/mods/m' && p.states().length === nState + 1, 'Prepare what is out of date -> run {sections: stale}, then the list is read again');
    p.P.post.run = { queued: [] }; p.act('stale').click(); await tick();
    ok(p.root.has(E['prep.nothing']), 'nothing out of date: the page says so');
    p.act('check').click(); await tick();
    ok(last().u === '/api/x/prep/check' && JSON.stringify(last().b) === JSON.stringify({ mod: 'D:/mods/m' }) && !p.root.has(E['prep.nothing']), 'Check the mod for changes -> check {mod}');
    p.act('stop').disabled = false; p.act('stop').click(); await tick();
    ok(last().u === '/api/x/prep/stop' && JSON.stringify(last().b) === '{}', 'Stop -> stop {}');
    p.rb('u.stale', 'run').click(); await tick();
    ok(last().u === '/api/x/prep/run' && JSON.stringify(last().b.sections) === '["u.stale"]', 'row Prepare -> run {sections: [id]}', JSON.stringify(last().b));
    p.rb('u.stale', 'clear').click(); await tick();
    ok(last().u === '/api/x/prep/clear' && JSON.stringify(last().b) === JSON.stringify({ mod: 'D:/mods/m', section: 'u.stale' }), 'row Clear -> clear {section}', JSON.stringify(last().b));
    // Clear all asks once more
    const nPost = p.posts().length;
    p.act('clear').click(); await tick();
    ok(p.posts().length === nPost && p.act('clear').textContent === E['prep.b.clear2'], 'Clear all: the first press only asks');
    p.P.post.clear = { removed: 4, bytes: 5 * 1048576 };
    p.act('clear').click(); await tick();
    ok(p.posts().length === nPost + 1 && last().u === '/api/x/prep/clear' && last().b.section === undefined && p.act('clear').textContent === 'Clear all' && p.root.has('Removed 5.0 MB of prepared data.'), 'Clear all: the second press clears everything and says how much', JSON.stringify(last().b));
    p.act('clear').click(); const arm = p.live().find(t => t.ms === 6000); ok(!!arm, 'Clear all: the question goes away by itself'); arm.ran = true; arm.f();
    ok(p.act('clear').textContent === 'Clear all', 'Clear all: back to its name after the wait');
    p.act('clear').click(); await tick();
    ok(p.posts().length === nPost + 1 && p.act('clear').textContent === E['prep.b.clear2'], 'Clear all: asks again after that');
    // a failed post is shown
    p.P.fail = { run: 'no such thing' }; p.act('all').click(); await tick();
    ok(p.root.querySelector('div.err') && p.root.has('no such thing'), 'a refused request is shown on the page');
    p.P.fail = { state: 'server gone' }; await p.scr.refresh(); await tick();
    ok(p.root.has('The list could not be read: server gone') && p.live().filter(t => t.ms === 1500).length === 0, 'a state read that fails is shown and does not poll');

    // the tick box
    const cb = p.root.querySelector('input[data-act=open]');
    ok(cb.checked === true && p.root.has('Open here at start'), 'Open here at start: on by default');
    cb.checked = false; cb.fire('change');
    ok(p.ls['prep.open'] === false, 'unticked -> LS prep.open false');
    cb.checked = true; cb.fire('change');
    ok(p.ls['prep.open'] === true, 'ticked -> LS prep.open true');
    ok(mk({ ls: { 'prep.open': false } }).root.querySelector('input[data-act=open]').checked === false, 'a saved false is kept');

    // the update notice stays once seen
    const u = mk(); u.P.reply.updated = true; u.P.reply.sections.forEach(s => { s.running = false; s.queued = false; });
    await u.scr.refresh(); await tick();
    ok(u.root.querySelector('div.wzstat').parentNode.hidden === false && u.root.has(E['prep.updated']), 'updated: the notice shows');
    u.P.reply.updated = false; await u.scr.refresh(); await tick();
    ok(u.root.querySelector('div.wzstat').parentNode.hidden === false && u.live().length === 0, 'the notice stays after the next read; idle page does not poll');

    // no mod selected
    const m = mk({ mod: '' }); m.P.reply.mod = ''; m.P.reply.sections = [sec('game.view', { title: 'prep.s.view' }), sec('mod.tree', { title: 'prep.s.tree', state: 'na', why: ['nomod'] })];
    await m.scr.refresh(); await tick();
    ok(m.states()[0].u === '/api/x/prep/state?mod=' && m.root.has(E['prep.nomod']) && m.rows().length === 1 && m.rows()[0].dataset.sec === 'game.view' && m.act('check').disabled === true && !m.act('all').disabled, 'no mod: the page says so, lists only the game sections, Check is off');
    m.act('all').click(); await tick();
    ok(m.posts()[0].b.mod === '' && m.posts()[0].b.sections === 'all', 'no mod: Prepare everything still posts (the game sections)');
  }

  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'prep ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
