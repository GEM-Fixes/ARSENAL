// balance ext test: module shape and script rules, then both routes on the units fixture game: the table (columns, rows,
// resource and wait at start per unit), a change preview that writes nothing, the same change written into the fixture mod,
// and the refusals (no mod, no units, mixed-up column, unknown ids). No game, no network.
// usage: node test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-a4fcf2e8)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const ext = require('./index');
const WT = require('../../../lib/test/wait');
const TOOLS = path.resolve(__dirname, '..', '..', '..');
const scratch = path.resolve(process.argv[2] || path.join(__dirname, 'work'));
fs.mkdirSync(scratch, { recursive: true });
const { game, mod } = require('../units/fixture').make(scratch);
const tmpRoot = path.join(scratch, 'tmp'); fs.rmSync(tmpRoot, { recursive: true, force: true }); fs.mkdirSync(tmpRoot, { recursive: true });
const ctx = {
  gamedir: game, tools: TOOLS, tmpRoot, allowLaunch: false, modAgeMs: 0, game: () => game,
  runTool: async (tool, entry, args, o) => {
    const r = WT.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: (o && o.timeoutMs) || 60000 }, 'balance test');
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
  },
};
const call = async (name, body) => ext.routes['POST /api/x/balance/' + name]('/api/x/balance/' + name, body, ctx);
const refuses = async (name, body, re) => { try { await call(name, body); } catch (e) { assert.strictEqual(e.status, 400, name + ': status ' + e.status + ' ' + e.message); assert.ok(re.test(e.message), name + ': ' + e.message); return; } assert.fail(name + ' was not refused'); };
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

// blocks: the page's own block helpers on the stand-in DOM and the rules of test-blocks.js (blockcheck.js)
const { SHIM, checkBlocks } = require('./blockcheck');
function blocksPage(m) {
  const FD = require('../units/fakedom');
  const P = FD.runPage('balance', SHIM + ext.script, ext.lang, { route: (url, body) => ext.routes['POST ' + url](url, body, ctx), S: { mod: m } });
  P.env.applied = () => P.env.window.blkN || 0; return P;
}

(async () => {
  assert.strictEqual(ext.id, 'balance'); assert.ok(/EXT_SCREENS\.balance\s*=/.test(ext.script));
  assert.ok(!/[`]|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(ext.script), 'script rules');
  for (const c of require('../../../balance/lib').COLS) for (const l of ['en', 'ru', 'uk', 'zh']) assert.ok(ext.lang[l]['balance.c.' + c.id], 'label ' + l + ' ' + c.id);
  for (const f of Object.keys(require('../../../balance/lib').EDIT)) assert.ok(ext.lang.en['balance.fh.' + f], 'hint for ' + f);
  ok('module shape, script rules, a label for every column and a hint for every changeable one');

  let t = await call('table', {});
  assert.strictEqual(t.mod, null); assert.ok(t.rows.length >= 4 && t.cols.some(c => c.id === 'res') && t.cols.some(c => c.id === 'wait') && t.edit.wait);
  const t3 = t.rows.find(r => r.id === 't34_3'); assert.deepStrictEqual([t3.res, t3.cost, t3.charge, t3.fore, t3.wait, t3.again, t3.src], ['mp', 450, 120, 0.5, 60, 120, 'game']);
  assert.ok(!('_k' in t3) && Array.isArray(t.odd) && t.economy); ok('table: rows with the resource and the wait at start, no mod');

  await refuses('change', { ids: ['t34_3'], field: 'cost', op: 'pct', value: 10 }, /mod folder/);
  await refuses('change', { mod, ids: [], field: 'cost', op: 'pct', value: 10 }, /No units/);
  await refuses('change', { mod, ids: ['t34_3'], field: 'name', op: 'set', value: 1 }, /cannot be changed/);
  await refuses('change', { mod, ids: ['nope'], field: 'cost', op: 'pct', value: 10 }, /Reload/);
  await refuses('change', { mod, ids: ['t34_3'], field: 'cost', op: 'pct', value: 'x' }, /number/); ok('change: refusals');

  let c = await call('change', { mod, ids: ['t34_0', 't34_3'], field: 'cost', op: 'pct', value: 10 });
  assert.strictEqual(c.written, false); assert.deepStrictEqual(c.rows.map(r => [r.id, r.old, r.new]), [['t34_0', 350, 385], ['t34_3', 450, 495]]); assert.ok(c.files.length === 1 && !fs.existsSync(path.join(mod, 'resource')));
  ok('change: preview lists old and new, writes nothing');
  c = await call('change', { mod, ids: ['t34_0', 't34_3'], field: 'cost', op: 'pct', value: 10, write: true });
  assert.strictEqual(c.written, true); assert.ok(/"t34_3"[^\n]*\{cost 495\}/.test(fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/vehicles_rus.set'), 'latin1')));
  c = await call('change', { mod, ids: ['t34_3'], field: 'wait', op: 'set', value: 90, write: true });
  assert.deepStrictEqual([c.rows[0].field, c.rows[0].new, c.rows[0].waitOld, c.rows[0].waitNew], ['fore', 0.25, 60, 90]);
  t = await call('table', { mod }); const m3 = t.rows.find(r => r.id === 't34_3'); assert.deepStrictEqual([m3.cost, m3.dcost, m3.fore, m3.wait, m3.src], [495, 45, 0.25, 90, 'mod']);
  c = await call('change', { mod, ids: ['t34_3'], field: 'wait', op: 'set', value: 90 }); assert.ok(c.nothing && !c.rows.length);
  ok('change: written into the mod, the wait at start set through fore, the table shows the mod against the game');

  // ---------- one build per stamp: concurrent identical requests share it, a repeat is served from memory, any mod edit rebuilds
  const SV = require('./server'), st = () => Object.assign({}, SV.stats);
  let s0 = st(); const k0 = SV.stampOf(game, null), km = SV.stampOf(game, mod); const tb = await call('table', {});
  assert.strictEqual(SV.stats.builds - s0.builds, 0, 'game table already built at the start, game unchanged: memo');
  const ta = await call('table', { mod });
  assert.strictEqual(SV.stats.builds - s0.builds, 0, 'mod table built after the last write, mod unchanged: memo ' + JSON.stringify([k0 === SV.stampOf(game, null), km]));
  s0 = st(); const par = await Promise.all([1, 2, 3].map(() => call('table', { mod })));
  assert.strictEqual(SV.stats.builds - s0.builds, 0, 'memo hit, no build'); assert.strictEqual(SV.stats.hits - s0.hits, 3);
  assert.ok(par.every(x => JSON.stringify(x) === JSON.stringify(ta)) && tb.mod === null && ta.mod === mod);
  const setF = path.join(mod, 'resource/set/multiplayer/units/vehicles_rus.set'), txt0 = fs.readFileSync(setF, 'latin1');
  // an edit outside the GUI with the same file size (495 -> 505): only the mtime tells, the table must not be stale
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(setF, txt0.replace('{cost 495}', '{cost 505}'), 'latin1');
  s0 = st(); const [e1, e2] = await Promise.all([call('table', { mod }), call('table', { mod })]);
  assert.strictEqual(SV.stats.builds - s0.builds, 1, 'one build for two requests in flight'); assert.strictEqual(SV.stats.merged - s0.merged, 1);
  assert.deepStrictEqual([e1, e2].map(x => x.rows.find(r => r.id === 't34_3').cost), [505, 505], 'edited cost seen');
  // a new file in the mod (an add) and its removal also give new stamps
  const extra = path.join(mod, 'resource', 'set', 'note.txt'); fs.writeFileSync(extra, 'x');
  s0 = st(); await call('table', { mod }); assert.strictEqual(SV.stats.builds - s0.builds, 1, 'file added: rebuild');
  fs.rmSync(extra); s0 = st(); await call('table', { mod }); assert.strictEqual(SV.stats.builds - s0.builds, 0, 'file removed: the files are as they were before the add, so the table kept for that state is served');
  fs.writeFileSync(setF, txt0, 'latin1');
  assert.strictEqual((await call('table', { mod })).rows.find(r => r.id === 't34_3').cost, 495, 'edit back seen');
  // CACHE: a file in an area the table does not read (a map, a file outside resource/) leaves the stamp alone: no rebuild
  const far = [path.join(mod, 'resource', 'map', 'm1', 'note.txt'), path.join(mod, 'readme.txt')];
  for (const p of far) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }
  s0 = st(); const tf = await call('table', { mod }); assert.strictEqual(SV.stats.builds - s0.builds, 0, 'a map file and a root file: no rebuild'); assert.strictEqual(SV.stats.hits - s0.hits, 1);
  // CACHE: after a restart (memory empty) the table comes from the shared store, equal to the built one, with no build
  SV._forget(); s0 = st(); const ts = await call('table', { mod }), tg = await call('table', {});
  assert.deepStrictEqual([SV.stats.builds - s0.builds, SV.stats.stored - s0.stored], [0, 2], 'mod table and game table from the store');
  assert.deepStrictEqual(ts, tf, 'stored table = built table'); assert.deepStrictEqual(tg, tb, 'stored game table = built game table');
  for (const p of far) fs.rmSync(p, { force: true }); fs.rmSync(path.join(mod, 'resource', 'map'), { recursive: true, force: true });
  // Prepare section: ready for this mod, stale (why mod) once a card file moved and the tree was walked again, ready after run
  const MTL = require('../../../lib/modtree'), PT = ext.prep.find(p => p.id === 'balance.table'), q = { mod, game: { id: 'as64', dir: game } };
  assert.deepStrictEqual([PT.needs, PT.title, typeof ext.lang.en[PT.title]], [['units.catalogue'], 'balance.prep.table', 'string']);
  await MTL.ensure(mod, { maxAgeMs: 0 }); assert.strictEqual(PT.state(ctx, q).state, 'ready', JSON.stringify(PT.state(ctx, q)));
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(setF, txt0.replace('{cost 495}', '{cost 506}'), 'latin1'); await MTL.ensure(mod, { maxAgeMs: 0 });
  let ps = PT.state(ctx, q); assert.deepStrictEqual([ps.state, ps.why], ['stale', ['mod']], JSON.stringify(ps));
  const seen = []; s0 = st(); await PT.run(ctx, q, { set: o => seen.push(o.stage), cancelled: false });
  assert.strictEqual(SV.stats.builds - s0.builds, 1); assert.ok(seen.includes('done')); assert.strictEqual(PT.state(ctx, q).state, 'ready');
  s0 = st(); assert.strictEqual((await call('table', { mod })).rows.find(r => r.id === 't34_3').cost, 506); assert.strictEqual(SV.stats.builds - s0.builds, 0, 'the page hits what Prepare made');
  fs.writeFileSync(setF, txt0, 'latin1'); await call('table', { mod });
  // a write through change drops the memo even when the stamp could not tell
  s0 = st(); await call('change', { mod, ids: ['t34_3'], field: 'cost', op: 'set', value: 500, write: true });
  assert.strictEqual((await call('table', { mod })).rows.find(r => r.id === 't34_3').cost, 500, 'written cost seen');
  assert.strictEqual(SV.stats.builds - s0.builds, 1, 'write through change: rebuild');
  ok('table: concurrent identical requests share one build, a repeat is memoized, an edit of the card files (same size too, add, remove, write) rebuilds, a file in another area does not; after a restart the table comes from the store; Prepare section balance.table');

  // ---------- the page script in a stand-in browser ----------
  const FD = require('../units/fakedom'), en = ext.lang.en;
  const route = (url, body) => ext.routes['POST ' + url](url, body, ctx);
  const other = path.join(game, 'mods', 'other'); fs.mkdirSync(other, { recursive: true });
  const P = FD.runPage('balance', SHIM + ext.script, ext.lang, { route, S: { mod: other } });
  assert.strictEqual(P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['balance.mod']).length, 0, 'no mod folder box on the page: the header has it');
  const lastTable = () => P.sent.filter(s => s.url === '/api/x/balance/table').pop();
  P.screen.focus(); await FD.settle();
  assert.strictEqual(lastTable().body.mod, other);
  // GT-15: the shared mod is set elsewhere (Units, the header): this page follows it (the old page kept the folder it showed first)
  P.S.mod = mod; P.screen.refresh(); await FD.settle();
  assert.strictEqual(lastTable().body.mod, mod);
  // a write on another page (Units) is seen: the table is read again when the page is shown
  const n0 = P.sent.length; P.screen.refresh(); await FD.settle(); assert.strictEqual(P.sent.length, n0, 'no reload without a change');
  P.S.modWrites = 1; P.screen.focus(); await FD.settle(); assert.ok(P.sent.length > n0, 'reload after a write elsewhere');
  // Reload reads the shared mod again
  P.S.mod = other; FD.userClick(P.doc, P.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.reload'])[0]);
  await FD.settle(); assert.strictEqual(lastTable().body.mod, other);
  ok('GT-15 the page follows the shared mod, has no mod box of its own, and reads again after a write elsewhere');
  // hidden page: a refresh of every page load asks nothing; shown again, it reads the new mod and the new write stamp
  await FD.settle(); P.S.cur = 'units'; const n1 = P.sent.length;
  P.S.mod = mod; P.screen.refresh(); P.S.modWrites = 2; P.screen.refresh(); await FD.settle();
  assert.strictEqual(P.sent.filter(s => s.url === '/api/x/balance/table').length, P.sent.slice(0, n1).filter(s => s.url === '/api/x/balance/table').length, 'hidden: no table request');
  P.S.cur = 'balance'; P.screen.refresh(); P.screen.focus(); await FD.settle();
  assert.ok(P.sent.length === n1 + 1 && lastTable().body.mod === mod, 'shown: one table request, for the mod set while hidden');
  ok('the table is read only while the page is shown, and is fresh when shown after a mod change or a write');
  // the free filter words: armour = armor, Panzer 4 = PzKpfw IV (the fixture: PzKpfw VI Tiger)
  P.S.mod = mod; P.screen.refresh(); await FD.settle(); await FD.settle();
  const qIn = P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['balance.q'])[0];
  const count = () => P.root.all(c => c.tagName === 'SPAN' && /^\d+ /.test(c.textContent))[0];
  const tigers = () => P.root.all(c => c.tagName === 'TD' && c.textContent === 'PzKpfw VI Tiger');
  FD.type(P.doc, qIn, 'panzer 6'); await WT.until(() => tigers().length === 1, { who: 'balance test', what: 'the filter "panzer 6" drawn' });
  const shown = tigers();
  assert.ok(shown.length === 1, 'Panzer 6 finds the Tiger; ' + (count() && count().textContent));
  ok('free filter: "panzer 6" finds "PzKpfw VI Tiger"');
  {   // Browse = the file picker (owner 2026-11-19): game data at entity/, .def; a pick puts the unit's name in as a free word
    const sent = []; P.picker((spec, done) => { sent.push(spec); done('entity/vehicle/tank/tiger_x/tiger_x.def', { view: 'data', name: 'tiger_x.def' }); });
    FD.type(P.doc, qIn, ''); qIn._sk.browseButton.click();
    assert.ok(sent.length === 1 && sent[0].view === 'data' && sent[0].start === 'entity' && sent[0].mode === 'file' && sent[0].exts.join() === 'def', 'balance.q Browse spec ' + JSON.stringify(sent[0]));
    assert.strictEqual(qIn.value.trim(), 'tiger_x', 'balance.q: a picked .def gives its name');
    FD.type(P.doc, qIn, ''); await new Promise(r => setTimeout(r, 200));
  }
  ok('filter Browse: the game data at entity/, a pick gives the unit name');

  // ---------- blocks: the loaded page, every view, through the rules of tools/gui/test/test-blocks.js
  const B = blocksPage(mod);
  const tab = v => B.root.all(c => c.getAttribute('role') === 'tab' && c.textContent === en['balance.v.' + v])[0];
  const selBy = k => B.root.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en[k])[0];
  const blkById = id => B.root.all(c => c.dataset.blk === id);
  B.screen.focus(); await FD.settle(); await FD.settle();
  assert.ok(B.root.all(c => c.tagName === 'TBODY').length, 'table drawn');
  let probs = checkBlocks(B.root); assert.deepStrictEqual(probs, [], 'sheet');
  const seed = [B.doc.createElement('button'), B.doc.createElement('span')]; seed[0].textContent = 'bare'; seed[1].textContent = 'loose';
  blkById('views.body')[0].appendChild(seed[0]); blkById('views.sheet.tools')[0].appendChild(blkById('mod.say')[0].parentNode.removeChild(blkById('mod.say')[0])); B.root.appendChild(seed[1]);
  probs = checkBlocks(B.root).join('\n');
  assert.ok(/button "bare" sits in the container "views\.body"/.test(probs) && /leaf block "views\.sheet\.tools" holds blocks/.test(probs) && /block "mod\.say" sits in .*not directly in a container/.test(probs) && /span "loose" is not inside a block/.test(probs), 'seeded faults caught: ' + probs);
  seed.forEach(s => s.parentNode.removeChild(s)); blkById('mod')[0].appendChild(blkById('mod.say')[0]);
  assert.deepStrictEqual(checkBlocks(B.root), [], 'seeds removed');
  // a profile moved the table into the filter card: the next draw takes it away there, so its id is not doubled
  blkById('filter')[0].appendChild(blkById('views.sheet.table')[0]);
  const ap0 = B.env.applied(); FD.userClick(B.doc, tab('sheet')); assert.strictEqual(blkById('views.sheet.table').length, 1, 'moved block replaced, not doubled');
  assert.ok(B.env.applied() > ap0, 'a redraw puts the screen back in the profile (blkApply)');
  for (const v of ['groups', 'graph', 'compare', 'odd', 'change']) {
    FD.userClick(B.doc, tab(v)); await FD.settle();
    probs = checkBlocks(B.root); assert.deepStrictEqual(probs, [], v);
    assert.ok(!B.root.all(c => c.dataset.blk && c.dataset.blk.startsWith('views.') && !c.dataset.blk.startsWith('views.' + v + '.') && !/^views\.(tabs|body)$/.test(c.dataset.blk)).length, v + ': only its own blocks');
  }
  const vIn = B.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['balance.ch.value'])[0];
  FD.type(B.doc, vIn, '10'); FD.userClick(B.doc, B.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.ch.preview'])[0]); await FD.settle();
  assert.ok(B.root.all(c => c.dataset.blk === 'views.change.res')[0].all(c => c.tagName === 'TABLE').length, 'preview drawn');
  assert.deepStrictEqual(checkBlocks(B.root), [], 'change preview');
  FD.userClick(B.doc, tab('graph')); await FD.settle(); const om = selBy('balance.odd.mode'); om.value = 'point'; om.fire('change'); await FD.settle();
  assert.ok(blkById('views.graph.odd.px').length === 1 && blkById('views.graph.odd.use').length === 1, 'graph point mode fields');
  assert.deepStrictEqual(checkBlocks(B.root), [], 'graph point mode');
  ok('blocks: every view (and the change preview) puts each control and text in a leaf block, ids unique, a redraw never doubles a moved block');

  // ---------- price calculator (prices.js, tools/pricecalc as a library): states, edit in place, save, comment lines, undo
  const U = 'resource/set/multiplayer/units/', MK = U + 'price_model.inc';
  const PSV = require('./prices');
  let pr = await call('prices/calc', {});
  assert.ok(pr.state.includes('vanilla') && pr.state.includes('noModel') && pr.mod === null, 'game only: ' + pr.state);
  assert.ok(pr.breeds.length === 8 && pr.cards.length >= 2 && pr.rows === 8 && pr.outline.numbers.length && pr.outline.lists.length, 'game rows and cards read');
  const rif = pr.breeds.find(b => b.side === 'rus' && b.breed === 'rifle'); assert.ok(rif && Array.isArray(rif.items) && rif.mod.mp === 0.5, 'breed row with its item breakdown');
  const sq = pr.cards.find(c => c.side === 'rus' && c.rule !== 'hand'); assert.ok(sq && sq.list.some(m => m.who === 'rus/rifle' && m.count === 5), 'card members with counts');
  await refuses('prices/save', { text: pr.text }, /mod folder/);
  await refuses('prices/plan', {}, /mod folder/);
  // Gates of Hell (tools/pricecalc/goh.js): a made-up GoH install; the same answer shape plus the fitted model; its model text edited in
  // memory (try), offered as a starting model (seed); writes need a mod
  const gg = require('../units/testgames').gohGame(scratch);
  const gpr = await call('prices/calc', { gid: 'goh', game: gg });
  assert.ok(gpr.goh && gpr.breeds.length === 4 && gpr.cards.some(c => c.name === 'grenadiers(ger)' && c.cost === 70 && c.rule === 'squad') && gpr.quality && gpr.gohModel && gpr.state.includes('vanilla') && !gpr.state.includes('noModel'), JSON.stringify(gpr.cards.map(c => [c.name, c.cost, c.rule])));
  const GK = require('../../../pricecalc/goh').MODEL_KEY, gw = gpr.gohModel.specials[0];   // the made-up game prices its men as one fixed-price class
  assert.ok(gpr.modelFrom === 'fit' && !gpr.model.file && gpr.model.rel === GK && /\{goh_price_model/.test(gpr.text) && !gpr.outline, 'GoH: the fitted terms as a model text');
  const gtr = await call('prices/try', { gid: 'goh', game: gg, text: gpr.text, ops: [{ op: 'term', group: 'specials', key: String(gw.key), price: gw.price + 5 }] });
  assert.ok(gtr.goh && gtr.edits === 1 && gtr.modelFrom === 'try' && gtr.model.edited && gtr.gohModel.specials.find(x => x.key === gw.key).price === gw.price + 5 && gtr.moved.breeds > 0, JSON.stringify([gw, gtr.edits, gtr.errs, gtr.moved]));
  const gsd = await call('prices/seed', { gid: 'goh', game: gg });
  assert.ok(/\{goh_price_model/.test(gsd.preview) && gsd.items > 0 && gsd.fit, 'GoH seed preview');
  await refuses('prices/save', { gid: 'goh', game: gg, text: gtr.text }, /Pick your mod folder/);
  await refuses('prices/seed', { gid: 'goh', game: gg, write: true }, /Pick your mod folder/);
  for (const r of ['plan', 'apply', 'check', 'undo']) await refuses('prices/' + r, { gid: 'goh', game: gg }, /Pick your mod folder/);
  const gnm = await call('prices/names', { gid: 'goh', game: gg }); assert.ok(gnm.cards && gnm.breeds, 'GoH names answer');
  // GoH price write: a mod with its own copy of late/inf_ger.set, rifleman 30 (the game's "soldier" class sells at a median of 9)
  const gpmod = path.join(scratch, 'gohpricemod'); fs.rmSync(gpmod, { recursive: true, force: true });
  const ginf = path.join(gpmod, U, 'late', 'inf_ger.set'), gameInf = fs.readFileSync(path.join(gg, U, 'late', 'inf_ger.set'));
  fs.mkdirSync(path.dirname(ginf), { recursive: true }); fs.writeFileSync(ginf, gameInf.toString('latin1').replace('rifleman" ("soldier" side(ger) cost(8))', 'rifleman" ("soldier" side(ger) cost(30))'), 'latin1');
  const ginf0 = fs.readFileSync(ginf); assert.ok(!ginf0.equals(gameInf), 'the mod row differs');
  const gck = await call('prices/check', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(gck.goh && gck.count === 2 && gck.findings.some(f => f.code === 'GOH_PRICE_FAR' && /rifleman: 30 MP/.test(f.msg)), JSON.stringify(gck.findings));
  const gpl = await call('prices/plan', { gid: 'goh', game: gg, mod: gpmod });
  assert.deepStrictEqual(gpl.rows.map(x => [x.id, x.old, x.new]).sort(), [['mp/ger/late/rifleman', 30, 9], ['mp/ger/late/tankman', 6, 9]], JSON.stringify(gpl));
  assert.ok(gpl.files.length === 1 && gpl.files[0].rewritten === 2 && fs.readFileSync(ginf).equals(ginf0), 'GoH plan: a preview, nothing written');
  const gap = await call('prices/apply', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(gap.changed.length === 1 && gap.check && gap.check.count === 0 && gap.points.length === 1 && gap.undo, JSON.stringify(gap));
  assert.ok(/rifleman" \("soldier" side\(ger\) cost\(9\)\)/.test(fs.readFileSync(ginf, 'latin1')) && fs.readFileSync(path.join(gg, U, 'late', 'inf_ger.set')).equals(gameInf), 'GoH: the mod file changed, the game file not');
  assert.ok(fs.existsSync(path.join(gap.undo, gap.points[0], 'restore-point.json')), 'GoH: restore point');
  assert.ok((await call('prices/apply', { gid: 'goh', game: gg, mod: gpmod })).nothing && (await call('prices/check', { gid: 'goh', game: gg, mod: gpmod })).count === 0, 'GoH: a second write changes nothing, check clean');
  assert.ok((await call('prices/calc', { gid: 'goh', game: gg, mod: gpmod })).undo, 'GoH: Undo offered after a write');
  // GoH Undo last: the write taken back from its restore points, byte for byte; then nothing left to undo
  const gud = await call('prices/undo', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(gud.changed.length === 1 && fs.readFileSync(ginf).equals(ginf0), 'GoH undo: ' + JSON.stringify(gud));
  await refuses('prices/undo', { gid: 'goh', game: gg, mod: gpmod }, /Nothing to undo/);
  // GoH model: seed writes the fitted terms, the saved model is then the measure, a second seed is refused, save keeps an edit, Undo each
  const gmf = path.join(gpmod, ...GK.split('/'));
  const gsw = await call('prices/seed', { gid: 'goh', game: gg, mod: gpmod, write: true });
  assert.ok(gsw.saved && gsw.rel === GK && fs.existsSync(gmf) && /\r\n/.test(fs.readFileSync(gmf, 'latin1')), 'GoH seed write: ' + JSON.stringify(gsw));
  const gc2 = await call('prices/calc', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(gc2.modelFrom === 'saved' && gc2.model.file && gc2.undo, 'GoH: the saved model read back');
  await refuses('prices/seed', { gid: 'goh', game: gg, mod: gpmod, write: true }, /already has a price model/);
  await refuses('prices/save', { gid: 'goh', game: gg, mod: gpmod, text: '{price_model}' }, /goh_price_model/);
  const gt2 = await call('prices/try', { gid: 'goh', game: gg, mod: gpmod, text: gc2.text, ops: [{ op: 'term', group: 'specials', key: String(gw.key), price: 77 }] });
  const gs2 = await call('prices/save', { gid: 'goh', game: gg, mod: gpmod, text: gt2.text });
  assert.ok(gs2.saved && fs.readFileSync(gmf, 'latin1') === gt2.text && (await call('prices/calc', { gid: 'goh', game: gg, mod: gpmod })).gohModel.specials.find(x => x.key === gw.key).price === 77, 'GoH save: the edit written and measured on');
  await call('prices/undo', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(fs.readFileSync(gmf, 'latin1') === gc2.text, 'GoH undo: the seeded model back');
  await call('prices/undo', { gid: 'goh', game: gg, mod: gpmod });
  assert.ok(!fs.existsSync(gmf) && fs.readFileSync(ginf).equals(ginf0), 'GoH undo: the model gone, the price row untouched');
  // GoH change box: speed and armour offered (tools/balance/gohbody.js), rank and fore not (GoH does not read them); a def without a
  // speed of its own: the row is skipped with goharmour's reason, nothing planned
  const gtb = await call('table', { gid: 'goh', game: gg });
  assert.ok(gtb.edit.speed && gtb.edit.armor && gtb.edit.reload && !gtb.edit.rank && !gtb.edit.fore, 'GoH edit columns ' + Object.keys(gtb.edit));
  const gmod = path.join(scratch, 'gohbalmod'); fs.mkdirSync(gmod, { recursive: true });
  const gsp = await call('change', { gid: 'goh', game: gg, mod: gmod, ids: ['pz4h'], field: 'speed', op: 'set', value: 50 });
  assert.ok(!gsp.rows.length && gsp.skipped.some(s => s.id === 'pz4h' && /No top speed of its own/.test(s.why)) && !fs.readdirSync(gmod).length, 'GoH speed refusal: ' + JSON.stringify(gsp.skipped));
  ok('prices: game only (no mod) reads the game rows and cards, says so, refuses every write; Gates of Hell: fair and game price of every breed and card; the model edited in memory, seeded and saved into the mod, check / plan / write of the mod own breed prices with restore points, Undo last for each write');

  // a mod of its own with the game's soldiers.set and squads.set copied in (the comment lines go there); the game stays as it is
  const pmod = path.join(game, 'mods', 'pricemod'); for (const d of [pmod, pmod + '.arsenal-undo']) fs.rmSync(d, { recursive: true, force: true });
  const undoAt = require('../../../lib/modwrite').restoreRoot(pmod);   // undo copies beside the mod (<mod>.arsenal-undo), never inside it
  for (const f of ['soldiers.set', 'squads.set']) { fs.mkdirSync(path.join(pmod, U), { recursive: true }); fs.copyFileSync(path.join(game, U, f), path.join(pmod, U, f)); }
  const gameSold = fs.readFileSync(path.join(game, U, 'soldiers.set')), modSold = fs.readFileSync(path.join(pmod, U, 'soldiers.set'));
  pr = await call('prices/calc', { mod: pmod });
  assert.ok(pr.state.includes('noModel') && !pr.state.includes('vanilla') && !pr.state.includes('rowsFromGame') && pr.rowsInMod, 'mod state ' + pr.state);
  let o0 = PSV.stats.opens; await call('prices/calc', { mod: pmod }); assert.strictEqual(PSV.stats.opens, o0, 'same stamp: no second read');
  // CACHE: after a restart (no session in memory) the calc answer comes from the shared store, equal to the read one, no read;
  // a file in an area the calculator does not read keeps it; a price file edit reads again
  PSV._forget(); let st0 = PSV.stats.stored; const pr2 = await call('prices/calc', { mod: pmod });
  assert.deepStrictEqual([PSV.stats.opens - o0, PSV.stats.stored - st0], [0, 1], 'calc from the store'); assert.deepStrictEqual(pr2, pr, 'stored calc = read calc');
  const pfar = path.join(pmod, 'resource', 'entity', 'note.txt'); fs.mkdirSync(path.dirname(pfar), { recursive: true }); fs.writeFileSync(pfar, 'x');
  st0 = PSV.stats.stored; await call('prices/calc', { mod: pmod }); assert.deepStrictEqual([PSV.stats.opens - o0, PSV.stats.stored - st0], [0, 1], 'an entity file: still from the store');
  fs.rmSync(path.join(pmod, 'resource', 'entity'), { recursive: true, force: true });
  const PP = ext.prep.find(p => p.id === 'balance.prices'), pq = { mod: pmod, game: { id: 'as64', dir: game } };
  assert.deepStrictEqual([PP.needs, PP.games, typeof ext.lang.en[PP.title]], [['units.catalogue'], ['as64', 'mowas2', 'goh'], 'string']);
  await require('../../../lib/modtree').ensure(pmod, { maxAgeMs: 0 }); assert.strictEqual(PP.state(ctx, pq).state, 'ready', JSON.stringify(PP.state(ctx, pq)));
  { // GoH: the calc answer is kept in the store like AS64's; Prepare warms it (game alone: stored by the GoH calc above; a mod: run, then ready, then no read)
    const og = PSV.stats.opens, gq = { game: { id: 'goh', dir: gg } }, gpm = path.join(scratch, 'gohprepmod'); fs.mkdirSync(path.join(gpm, U), { recursive: true });
    assert.strictEqual(PP.state(ctx, gq).state, 'ready', 'GoH game alone: ' + JSON.stringify(PP.state(ctx, gq)));
    const gmq = { mod: gpm, game: { id: 'goh', dir: gg } };
    await require('../../../lib/modtree').ensure(gpm, { maxAgeMs: 0 }); assert.strictEqual(PP.state(ctx, gmq).state, 'none', 'GoH mod not prepared yet');
    await PP.run(ctx, gmq, null); assert.strictEqual(PP.state(ctx, gmq).state, 'ready', 'GoH mod prepared: ' + JSON.stringify(PP.state(ctx, gmq)));
    PSV._forget(); const o1 = PSV.stats.opens, gp = await call('prices/calc', { gid: 'goh', game: gg, mod: gpm });
    assert.ok(gp.goh && PSV.stats.opens === o1, 'GoH: the page opens from the prepared entry, no read');
    o0 += PSV.stats.opens - og;
  }
  const soldF = path.join(pmod, U, 'soldiers.set'), sold0 = fs.readFileSync(soldF);
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(soldF, Buffer.concat([sold0, Buffer.from('\r\n; note\r\n', 'latin1')]));
  await call('prices/calc', { mod: pmod }); assert.strictEqual(PSV.stats.opens - o0, 1, 'a price file edit: read again');
  fs.writeFileSync(soldF, sold0); await call('prices/calc', { mod: pmod }); o0 = PSV.stats.opens;
  const sd = await call('prices/seed', { mod: pmod });
  assert.ok(/\{price_model/.test(sd.preview) && sd.fit && sd.fit.breeds && /fitted from the mod's price rows/.test(sd.source), 'seed preview: ' + sd.source);
  assert.ok(!fs.existsSync(path.join(pmod, MK)), 'preview writes nothing');
  ok('prices: a mod without a model says so; the starting model preview is fitted from its rows and writes nothing; a repeat is served from memory, after a restart from the store; Prepare section balance.prices');

  // edit in place: one table, one item moved; comments stay, nothing written
  const tbl = pr.outline.numbers.find(x => x.path[1].startsWith('weapon_group:') && x.path[x.path.length - 1] === 'mp');
  let tr = await call('prices/try', { mod: pmod, text: pr.text, ops: [{ op: 'set', path: tbl.path, values: tbl.values.map(v => v + 1) }] });
  assert.strictEqual(tr.edits, 1); assert.ok(tr.model.edited && tr.state.includes('noModel'));
  const cmt = s => s.split('\n').filter(l => /^\s*;/.test(l)).join('\n');
  assert.strictEqual(cmt(tr.text), cmt(pr.text), 'comment lines kept'); assert.strictEqual(tr.text.split('\n').length, pr.text.split('\n').length);
  assert.ok(tr.moved && typeof tr.moved.breeds === 'number' && tr.fit, 'moved counts');
  const L0 = pr.outline.lists.find(l => l.items.length), L1 = pr.outline.lists.find(l => l !== L0 && l.path[1] === L0.path[1]) || pr.outline.lists.find(l => l !== L0);
  const it = L0.items[0].name;
  tr = await call('prices/try', { mod: pmod, text: tr.text, ops: [{ op: 'move', item: it, to: L1.path }] });
  assert.ok(tr.outline.lists.find(l => JSON.stringify(l.path) === JSON.stringify(L1.path)).items.some(x => x.name === it), 'item moved');
  assert.ok(!tr.outline.lists.find(l => JSON.stringify(l.path) === JSON.stringify(L0.path)).items.some(x => x.name === it), 'item gone from the old list');
  tr = await call('prices/try', { mod: pmod, text: tr.text, ops: [{ op: 'set', path: ['price_model', 'nope'], values: [1] }] });
  assert.ok(tr.errs.length && tr.edits === 0, 'unknown path: an error, no edit');
  assert.ok(!fs.existsSync(path.join(pmod, MK)), 'try writes nothing');
  ok('prices: an edit changes only its numbers (comments, line count kept), an item moves between lists, every edit prices again in memory and writes nothing');

  // save: only price_model.inc, undo copy first, hand comments kept on the next save
  let sv = await call('prices/save', { mod: pmod, text: tr.text });
  assert.ok(sv.saved && sv.created && sv.rel === MK); assert.strictEqual(fs.readFileSync(path.join(pmod, MK), 'latin1'), tr.text);
  let man = JSON.parse(fs.readFileSync(path.join(undoAt, sv.tag, 'manifest.json'), 'utf8')); assert.deepStrictEqual(man.created, [MK]);
  assert.ok(!fs.existsSync(path.join(pmod, '.arsenal-undo')), 'the undo copy is not inside the mod');
  assert.ok(fs.readFileSync(path.join(pmod, U, 'soldiers.set')).equals(modSold), 'save touches no other file');
  pr = await call('prices/calc', { mod: pmod }); assert.ok(!pr.state.includes('noModel') && pr.model.file, 'model read back');
  const hand = pr.text.replace('\r\n{price_model\r\n', '\r\n; my own note\r\n{price_model\r\n');
  sv = await call('prices/save', { mod: pmod, text: hand }); pr = await call('prices/calc', { mod: pmod });
  tr = await call('prices/try', { mod: pmod, text: pr.text, ops: [{ op: 'set', path: tbl.path, values: tbl.values }] });
  assert.ok(/; my own note\r\n\{price_model/.test(tr.text), 'hand comment kept through an edit');
  await refuses('prices/save', { mod: pmod, text: 'nothing' }, /price_model/);
  // undo last: the second save goes back to the first saved text
  let ud = await call('prices/undo', { mod: pmod }); assert.strictEqual(ud.tag, sv.tag);
  assert.ok(!/my own note/.test(fs.readFileSync(path.join(pmod, MK), 'latin1')), 'undo restored the earlier model');
  ok('prices: save writes only price_model.inc with an undo copy, the model is read back, a hand comment survives edits, Undo last restores');

  // comment lines: plan -> apply (undo tag) -> check -> undo; prices themselves never change
  const pl = await call('prices/plan', { mod: pmod });
  assert.ok(pl.files.some(f => f.rel === U + 'soldiers.set' && f.added > 0) && !pl.files.some(f => f.rewritten), 'plan: comment lines only ' + JSON.stringify(pl.files.map(f => [f.rel, f.added, f.rewritten])));
  assert.ok(pl.files.every(f => f.preview.every(x => /^\s*;\{price/.test(x.text))), 'preview lines are price comments');
  const ap = await call('prices/apply', { mod: pmod, tag: 'pricecalc-test' });
  assert.strictEqual(ap.tag, 'pricecalc-test'); assert.ok(ap.changed.includes(U + 'soldiers.set') && ap.check && ap.check.count === 0, 'apply + check ' + JSON.stringify(ap.check));
  const after = fs.readFileSync(path.join(pmod, U, 'soldiers.set'), 'latin1');
  assert.ok(/;\{price /.test(after) && after.replace(/^[ \t]*;\{price [^\r\n]*\r\n/gm, '') === modSold.toString('latin1'), 'only comment lines added');
  assert.ok(fs.readFileSync(path.join(game, U, 'soldiers.set')).equals(gameSold), 'game files untouched');
  const again = await call('prices/apply', { mod: pmod }); assert.ok(again.nothing, 'second apply: nothing to write');
  ud = await call('prices/undo', { mod: pmod }); assert.strictEqual(ud.tag, 'pricecalc-test');
  assert.ok(fs.readFileSync(path.join(pmod, U, 'soldiers.set')).equals(modSold), 'undo: byte for byte');
  ok('prices: comment lines planned, previewed, written with an undo tag, checked (comments only, idempotent), undone byte for byte; game files untouched');
  // an old undo copy inside the mod (<mod>/.arsenal-undo/<tag>, where older versions wrote them) is still found by Undo last
  const ap2 = await call('prices/apply', { mod: pmod, tag: 'pricecalc-old' });
  assert.ok(ap2.tag === 'pricecalc-old' && fs.existsSync(path.join(undoAt, 'pricecalc-old', 'manifest.json')) && !fs.existsSync(path.join(pmod, '.arsenal-undo')), 'apply: undo copy beside the mod');
  fs.mkdirSync(path.join(pmod, '.arsenal-undo'), { recursive: true }); fs.renameSync(path.join(undoAt, 'pricecalc-old'), path.join(pmod, '.arsenal-undo', 'pricecalc-old'));
  ud = await call('prices/undo', { mod: pmod }); assert.strictEqual(ud.tag, 'pricecalc-old');
  assert.ok(fs.readFileSync(path.join(pmod, U, 'soldiers.set')).equals(modSold), 'old inside undo: byte for byte');
  await refuses('prices/apply', { mod: pmod, tag: 'pricecalc-old' }, /older undo copy inside the mod/);
  assert.ok(fs.readFileSync(path.join(pmod, U, 'soldiers.set')).equals(modSold) && !fs.existsSync(path.join(undoAt, 'pricecalc-old')), 'refused before a byte is written');
  assert.ok(JSON.parse(fs.readFileSync(path.join(pmod, '.arsenal-undo', 'pricecalc-old', 'manifest.json'), 'utf8')).undone, 'the old copy stays where it is, marked undone');
  fs.rmSync(path.join(pmod, '.arsenal-undo'), { recursive: true, force: true });   // the scratch mod only: the later views read a mod without it
  ok('prices: an old undo copy inside the mod is still undone (Undo last finds it); its tag is not reused for a write');

  // the card on the page, every price view through the block rules
  const PB = blocksPage(pmod);
  PB.screen.focus(); await FD.settle(); await FD.settle();
  const ptab = v => PB.root.all(c => c.getAttribute('role') === 'tab' && c.textContent === en['balance.pr.v.' + v])[0];
  assert.ok(!PB.sent.some(s => /prices\//.test(s.url)), 'prices read only when asked');
  assert.deepStrictEqual(checkBlocks(PB.root), [], 'price card before load');
  FD.userClick(PB.doc, ptab('breeds')); await FD.settle(); await FD.settle();
  assert.ok(PB.sent.some(s => s.url === '/api/x/balance/prices/calc'), 'calc asked');
  for (const v of ['breeds', 'model', 'cards']) {
    FD.userClick(PB.doc, ptab(v)); await FD.settle();
    assert.deepStrictEqual(checkBlocks(PB.root), [], 'prices ' + v);
    assert.ok(PB.root.all(c => c.dataset.blk && c.dataset.blk.startsWith('prices.' + v + '.')).length, v + ': drawn');
    assert.ok(!PB.root.all(c => c.dataset.blk && /^prices\.(breeds|model|cards)\./.test(c.dataset.blk) && !c.dataset.blk.startsWith('prices.' + v + '.')).length, v + ': only its own blocks');
  }
  // a breed's breakdown, a card's members, a model edit, the comment-line preview
  FD.userClick(PB.doc, ptab('breeds')); await FD.settle();
  FD.userClick(PB.doc, PB.root.all(c => c.tagName === 'BUTTON' && c.textContent === 'rifle')[0]); await FD.settle();
  assert.strictEqual(PB.root.all(c => c.dataset.blk === 'prices.breeds.detail').length, 1); assert.deepStrictEqual(checkBlocks(PB.root), [], 'breed detail');
  FD.userClick(PB.doc, ptab('cards')); await FD.settle();
  FD.userClick(PB.doc, PB.root.all(c => c.tagName === 'BUTTON' && /riflemans/.test(c.textContent))[0]); await FD.settle();
  assert.strictEqual(PB.root.all(c => c.dataset.blk === 'prices.cards.detail').length, 1); assert.deepStrictEqual(checkBlocks(PB.root), [], 'card detail');
  {   // the filter boxes' Browse (owner 2026-11-19): the game data where the rows come from; a pick narrows to that file's rows
    const sent = []; let ans = ''; PB.picker((spec, done) => { sent.push(spec); done(ans, { view: 'data' }); });
    const kin = k => PB.root.all(c => c.className === 'sk' && c.dataset.sk === k)[0].children[0];
    ans = 'set/multiplayer/units/rus/x.set'; kin('balance.cards.q')._sk.browseButton.click();
    assert.ok(sent[0].view === 'data' && sent[0].start === 'set/multiplayer/units' && kin('balance.cards.q').value === 'rus/x.set', 'cards Browse ' + JSON.stringify(sent[0]) + ' ' + kin('balance.cards.q').value);
    FD.type(PB.doc, kin('balance.cards.q'), '');
    FD.userClick(PB.doc, ptab('breeds')); await FD.settle();
    const brows = () => { const t = PB.root.all(c => c.dataset.blk === 'prices.breeds.table')[0]; return t ? t.all(c => c.tagName === 'TR').slice(1) : []; };
    ans = 'set/breed/mp/rus/rifle.set'; kin('balance.breeds.q')._sk.browseButton.click(); await WT.until(() => brows().length === 1, { who: 'balance test', what: 'breeds narrowed to the picked file' });
    assert.ok(sent[1].view === 'data' && sent[1].start === 'set/breed/mp' && sent[1].exts.join() === 'set' && kin('balance.breeds.q').value === 'rus/rifle', 'breeds Browse ' + JSON.stringify(sent[1]));
    const trs = brows();
    assert.ok(trs.length === 1 && /^russ*rifle/.test(trs[0].textContent), 'breeds: the picked file narrows the table to its breed ' + trs.map(r => r.textContent.slice(0, 30)).join(' / '));
    FD.type(PB.doc, kin('balance.breeds.q'), ''); await WT.until(() => brows().length > 1, { who: 'balance test', what: 'breeds back to all rows' });
    FD.userClick(PB.doc, ptab('cards')); await FD.settle();
  }
  FD.userClick(PB.doc, ptab('model')); await FD.settle();
  const inp = PB.root.all(c => c.dataset.blk === 'prices.model.nums')[0].all(c => c.tagName === 'INPUT')[0];
  FD.type(PB.doc, inp, inp.value.split(' ').map(x => +x + 2).join(' ')); inp.fire('change'); await FD.settle(); await FD.settle();
  assert.ok(PB.sent.some(s => s.url === '/api/x/balance/prices/try'), 'edit sent');
  assert.ok(PB.root.all(c => c.tagName === 'DIV' && /price differently from the saved model/.test(c.textContent)).length, 'moved counts shown');
  assert.deepStrictEqual(checkBlocks(PB.root), [], 'model after an edit');
  FD.userClick(PB.doc, PB.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.pr.m.discard'])[0]); await FD.settle(); await FD.settle();
  FD.userClick(PB.doc, PB.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.pr.a.plan'])[0]); await FD.settle();
  assert.ok(PB.root.all(c => c.tagName === 'SUMMARY' && /soldiers\.set/.test(c.textContent)).length, 'plan drawn');
  assert.deepStrictEqual(checkBlocks(PB.root), [], 'comment-line preview');
  assert.ok(!PB.root.all(c => c.tagName === 'BUTTON' && /set.prices/i.test(c.textContent)).length && !/set-prices/.test(ext.script), 'no --set-prices anywhere on the page');
  assert.ok(fs.readFileSync(path.join(pmod, U, 'soldiers.set')).equals(modSold), 'the page wrote nothing');
  ok('prices card: read only when asked, Breeds / Model / Cards views and details pass the block rules, an edit shows what moves, the preview lists comment lines, no set-prices');

  // the same card under Gates of Hell: no "not available" line, fair / game / difference columns, the fitted model, write buttons off
  {
    const FDg = require('../units/fakedom');
    const GP = FDg.runPage('balance', SHIM + ext.script, ext.lang, { route: (url, body) => ext.routes['POST ' + url](url, Object.assign({}, body, { gid: 'goh', game: gg }), ctx), S: { mod: null, gameId: 'goh' } });
    GP.screen.focus(); await FD.settle(); await FD.settle();
    const gtab = v => GP.root.all(c => c.getAttribute('role') === 'tab' && c.textContent === en['balance.pr.v.' + v])[0];
    FD.userClick(GP.doc, gtab('breeds')); await FD.settle(); await FD.settle();
    assert.ok(!GP.root.all(c => c.dataset && c.dataset.na === '1').length && GP.root.textContent.includes(en['balance.pr.goh.qb']), 'GoH: fit quality said, no na line');
    for (const v of ['breeds', 'model', 'cards']) {
      FD.userClick(GP.doc, gtab(v)); await FD.settle();
      assert.deepStrictEqual(checkBlocks(GP.root), [], 'GoH prices ' + v);
      if (v === 'model') assert.ok(GP.root.textContent.includes(en['balance.pr.goh.t.tiers']) && GP.root.all(c => c.tagName === 'INPUT' && /^Fixed-price classes/.test(c.getAttribute('aria-label') || '')).length, 'GoH model: fitted terms, a price box each');
      else for (const k of ['gfair', 'ggame', 'gdiff']) assert.ok(GP.root.textContent.includes(en['balance.pr.c.' + k]), v + ': column ' + k);
    }
    assert.ok(GP.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.pr.goh.aplan'])[0].disabled, 'GoH without a mod: plan off');
    assert.ok(!['en', 'ru', 'uk', 'zh'].some(l => ext.lang[l]['balance.pr.na.goh']), 'the GoH na string is gone');
    // with a mod: Preview new prices lists the rows and the file, Write new prices writes and says the check passed; Undo last then on
    // and takes the write back; a price box in the Model view prices again in memory and turns Save on
    const GM = FDg.runPage('balance', SHIM + ext.script, ext.lang, { route: (url, body) => ext.routes['POST ' + url](url, Object.assign({}, body, { gid: 'goh', game: gg }), ctx), S: { mod: gpmod, gameId: 'goh' } });
    GM.screen.focus(); await FD.settle(); await FD.settle();
    const gbtn = k => GM.root.all(c => c.tagName === 'BUTTON' && c.textContent === en[k])[0];
    FD.userClick(GM.doc, GM.root.all(c => c.tagName === 'BUTTON' && c.textContent === en['balance.pr.go'])[0] || gbtn('balance.pr.goh.aplan')); await FD.settle(); await FD.settle();
    assert.ok(!gbtn('balance.pr.goh.aplan').disabled && gbtn('balance.pr.goh.aapply').disabled && gbtn('balance.pr.a.undo').disabled, 'GoH with a mod: preview on, write after a preview, undo off');
    FD.userClick(GM.doc, gbtn('balance.pr.goh.aplan')); await FD.settle(); await FD.settle();
    assert.ok(GM.root.textContent.includes('mp/ger/late/rifleman: 30 -> 9 MP') && !gbtn('balance.pr.goh.aapply').disabled, 'GoH preview drawn: ' + GM.root.textContent.slice(-600));
    assert.deepStrictEqual(checkBlocks(GM.root), [], 'GoH preview blocks');
    FD.userClick(GM.doc, gbtn('balance.pr.goh.aapply')); await FD.settle(); await FD.settle();
    assert.ok(GM.root.textContent.includes(en['balance.pr.goh.checkOk']), 'GoH write: check passed said');
    assert.ok(/cost\(9\)/.test(fs.readFileSync(ginf, 'latin1')), 'GoH write from the page');
    await FD.settle(); await FD.settle();
    assert.ok(!gbtn('balance.pr.a.undo').disabled, 'GoH: Undo last on after a write');
    FD.userClick(GM.doc, gbtn('balance.pr.a.undo')); await FD.settle(); await FD.settle();
    assert.ok(fs.readFileSync(ginf).equals(ginf0), 'GoH undo from the page');
    FD.userClick(GM.doc, GM.root.all(c => c.getAttribute('role') === 'tab' && c.textContent === en['balance.pr.v.model'])[0]); await FD.settle(); await FD.settle();
    const pin = GM.root.all(c => c.tagName === 'INPUT' && /^Fixed-price classes/.test(c.getAttribute('aria-label') || ''))[0];
    pin.value = '55'; pin.fire('change'); await FD.settle(); await FD.settle();
    assert.ok(!gbtn('balance.pr.m.save').disabled && GM.root.textContent.includes(en['balance.pr.goh.mhint']), 'GoH model edit: Save on');
    assert.deepStrictEqual(checkBlocks(GM.root), [], 'GoH model view blocks');
    ok('prices card under Gates of Hell: fair, game price and difference per breed and card, the model with a price box per term, block rules; with a mod: preview, write, check, Undo last');
  }

  // ---------- hero button cards, the point values (MP per SP / DP), in-game names: a mod with a hero card, game mode budgets and its own texts
  const hmod = path.join(game, 'mods', 'heromod'); for (const d of [hmod, hmod + '.arsenal-undo']) fs.rmSync(d, { recursive: true, force: true });
  const putH = (rel, t) => { const f = path.join(hmod, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(t.replace(/\r?\n/g, '\r\n'), 'utf8')); };
  putH(U + 'soldiers.set', fs.readFileSync(path.join(game, U, 'soldiers.set'), 'latin1'));
  putH(U + 'squads.set', fs.readFileSync(path.join(game, U, 'squads.set'), 'latin1') + '("squad_with2types" side(rus) name(hero_guards) c(30) g(h1) c1(squadleader:1) c2(rifle:2) b(hero) t(all hero) level(1) cost(2) f(-0.5))\n');
  putH('resource/set/multiplayer/games/presets.inc', '{budgets\n\t{vehicle\n\t\t{resource\n\t\t\t{start 500}\n\t\t}\n\t\t{buttons "squad1 v4"}\n\t}\n\t{hero\n\t\t{resource\n\t\t\t{start 20}\n\t\t}\n\t\t{buttons "hero"}\n\t\t{tag "special"}\n\t}\n}\n');
  putH('localization/desc.lng', '{tags\n\t{"squad"\n\t\t{"hero_guards(rus)" "<c(ffcc00)>Guards Heroes"}\n\t}\n\t{"human"\n\t\t{"mp"\n\t\t\t{"rus"\n\t\t\t\t{"rifle" "Strelok"}\n\t\t\t}\n\t\t}\n\t}\n}\n');
  pr = await call('prices/calc', { mod: hmod });
  const hc = pr.cards.find(c => c.name === 'hero_guards(rus)'), rc = pr.cards.find(c => c.name === 'riflemans(rus)');
  assert.ok(hc && hc.hero && hc.unit === 'sp' && hc.button === 'hero' && hc.tags.includes('hero') && hc.fore === -0.5 && hc.cost === 2 && hc.fit === 'n/a' && hc.costMp === null && hc.pointValue === null, 'hero card fields ' + JSON.stringify(hc));
  assert.ok(rc && !rc.hero && rc.unit === 'mp' && rc.costMp === rc.cost && rc.pointValue === 1, 'manpower card fields');
  assert.ok(pr.pointValue === null && pr.economy.budgets.some(b => b.name === 'hero' && b.res === 'sp' && b.start === 20) && pr.fit.hero === 1, 'no point values yet, the hero budget read ' + JSON.stringify(pr.economy));
  tr = await call('prices/try', { mod: hmod, text: pr.text, ops: [{ op: 'point', kind: 'sp', value: 40 }] });
  assert.ok(tr.edits === 1 && /\r\n\t\{point_value \{sp 40\}\}\r\n\}\r\n$/.test(tr.text) && tr.text.split('\n').length === pr.text.split('\n').length + 1, 'point_value block added before the closing brace');
  assert.deepStrictEqual(tr.pointValue, { sp: 40, dp: null }); assert.strictEqual(tr.cards.find(c => c.name === 'hero_guards(rus)').costMp, 80);
  tr = await call('prices/try', { mod: hmod, text: tr.text, ops: [{ op: 'point', kind: 'dp', value: 7.5 }, { op: 'point', kind: 'sp', value: 30 }] });
  assert.ok(/\{point_value \{sp 30\} \{dp 7\.5\}\}/.test(tr.text) && tr.cards.find(c => c.name === 'hero_guards(rus)').costMp === 60, 'second kind added, first changed in place');
  tr = await call('prices/try', { mod: hmod, text: tr.text, ops: [{ op: 'point', kind: 'sp', value: null }, { op: 'point', kind: 'xp', value: 1 }] });
  assert.ok(/\{point_value \{dp 7\.5\}\}/.test(tr.text) && tr.pointValue.sp === null && tr.cards.find(c => c.name === 'hero_guards(rus)').costMp === null && tr.errs.some(e => /xp/.test(e)), 'kind removed = not set; unknown kind refused');
  assert.ok(!fs.existsSync(path.join(hmod, MK)), 'point edits write nothing');
  const nm = await call('prices/names', { mod: hmod });
  assert.strictEqual(nm.cards['hero_guards(rus)'], 'Guards Heroes'); assert.strictEqual(nm.breeds['rus/rifle'], 'Strelok');
  assert.ok(!nm.cards['riflemans(rus)'], 'the mod desc.lng replaces the game one: no text, internal name kept');
  ok('prices: hero button cards carry button, tags, fore, their resource (sp from the game modes\' budgets) and no fit; {point_value} is added, changed and removed in place; in-game names read from the mod texts');

  // the page: Model first and default, hero cards hidden until ticked, in-game names on request and searchable, the point values edited in the Model view
  const HB = blocksPage(hmod);
  HB.screen.focus(); await FD.settle(); await FD.settle();
  const htabs = HB.root.all(c => c.dataset.blk === 'prices.tabs')[0].all(c => c.getAttribute('role') === 'tab');
  assert.deepStrictEqual(htabs.map(c => c.textContent), ['model', 'breeds', 'cards'].map(v => en['balance.pr.v.' + v]), 'Model, Breeds, Cards');
  assert.strictEqual(htabs[0].getAttribute('aria-selected'), 'true', 'Model is the default view');
  const htab = v => htabs.filter(c => c.textContent === en['balance.pr.v.' + v])[0];
  const cbx = k => HB.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en[k])[0];
  const btnTxt = re => HB.root.all(c => c.tagName === 'BUTTON' && re.test(c.textContent));
  FD.userClick(HB.doc, htab('cards')); await FD.settle(); await FD.settle();
  assert.ok(HB.root.all(c => c.dataset.blk === 'prices.cards.opts.hero').length === 1 && HB.root.all(c => c.dataset.blk === 'prices.cards.opts.loc').length === 1, 'both boxes in the Cards filter row');
  assert.ok(btnTxt(/^riflemans\(rus\)$/).length && !btnTxt(/hero_guards/).length, 'hero card hidden by default');
  const hx = cbx('balance.pr.f.hero'); hx.checked = true; hx.fire('change'); await FD.settle();
  assert.ok(btnTxt(/^hero_guards\(rus\)$/).length === 1, 'hero card shown when ticked');
  assert.ok(HB.root.all(c => c.tagName === 'TD' && c.textContent === '2 SP ' + en['balance.pr.noPv']).length === 1, 'hero cost in SP, MP worth not set');
  assert.deepStrictEqual(checkBlocks(HB.root), [], 'cards with hero cards');
  const lx = cbx('balance.pr.f.loc'); lx.checked = true; lx.fire('change'); await FD.settle(); await FD.settle();
  assert.ok(HB.sent.some(s => s.url === '/api/x/balance/prices/names'), 'names asked when ticked');
  assert.ok(btnTxt(/^Guards Heroes$/).length === 1 && btnTxt(/^riflemans\(rus\)$/).length, 'in-game name shown, a card with no text keeps its internal name');
  const hq = HB.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['balance.pr.f.q'])[0];
  FD.type(HB.doc, hq, 'guards heroes'); await WT.until(() => btnTxt(/^Guards Heroes$/).length === 1 && !btnTxt(/^riflemans/).length, { who: 'balance test', what: 'search "guards heroes" drawn' }); await FD.settle();
  assert.ok(btnTxt(/^Guards Heroes$/).length === 1 && !btnTxt(/^riflemans/).length, 'search finds the in-game name');
  // clear first so the next search has something to take away (riflemans): its result is then visible, not a time
  FD.type(HB.doc, hq, ''); await WT.until(() => btnTxt(/^riflemans/).length, { who: 'balance test', what: 'cards back without a search' });
  FD.type(HB.doc, hq, 'hero_guards'); await WT.until(() => btnTxt(/^Guards Heroes$/).length === 1 && !btnTxt(/^riflemans/).length, { who: 'balance test', what: 'search "hero_guards" drawn' }); await FD.settle();
  assert.ok(btnTxt(/^Guards Heroes$/).length === 1, 'search finds the internal name too');
  FD.userClick(HB.doc, btnTxt(/^Guards Heroes$/)[0]); await FD.settle();
  assert.ok(HB.root.all(c => c.tagName === 'TD' && c.textContent === 'Strelok (rus/rifle)').length === 1, 'member breed named in the card detail');
  assert.deepStrictEqual(checkBlocks(HB.root), [], 'cards with names and the detail');
  FD.type(HB.doc, hq, ''); await WT.until(() => btnTxt(/^riflemans\(rus\)$/).length || btnTxt(/^riflemans/).length, { who: 'balance test', what: 'cards back without a search' });
  FD.userClick(HB.doc, htab('breeds')); await FD.settle();
  assert.ok(cbx('balance.pr.f.loc').checked && btnTxt(/^Strelok$/).length, 'breeds view: the same box, the in-game breed name');
  FD.userClick(HB.doc, htab('model')); await FD.settle();
  assert.ok(HB.root.all(c => c.dataset.blk === 'prices.model.points').length === 1 && !HB.root.all(c => c.tagName === 'OPTION' && /point_value/.test(c.textContent)).length, 'point values box, not in the block picker');
  const spIn = cbx('balance.pr.pv.sp'); assert.strictEqual(spIn.value, ''); assert.strictEqual(spIn.getAttribute('placeholder'), en['balance.pr.pv.unset']);
  FD.type(HB.doc, spIn, '25'); spIn.fire('change'); await FD.settle(); await FD.settle();
  const lastTry = HB.sent.filter(s => s.url === '/api/x/balance/prices/try').pop();
  assert.deepStrictEqual(lastTry.body.ops, [{ op: 'point', kind: 'sp', value: 25 }]);
  assert.strictEqual(cbx('balance.pr.pv.sp').value, '25'); assert.deepStrictEqual(checkBlocks(HB.root), [], 'model with point values');
  FD.userClick(HB.doc, htab('cards')); await FD.settle();
  assert.ok(HB.root.all(c => c.tagName === 'TD' && c.textContent === '2 SP ' + en['balance.pr.costMp'].replace('{m}', '50')).length === 1, 'hero cost with its MP worth');
  assert.ok(!fs.existsSync(path.join(hmod, MK)), 'the page wrote nothing');
  ok('prices page: Model first and default; hero cards hidden by default, shown with SP cost and MP worth; in-game names shown and searchable (cards, members, breeds); point values edited in place');
  console.log('PASS balance ext (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL balance ext'); process.exit(1); });
