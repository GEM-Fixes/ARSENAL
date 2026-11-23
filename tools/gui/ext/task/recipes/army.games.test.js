// recipe "army" games test: node army.games.test.js <scratch>. A made-up AS2 install (as64.exe, a stock army rus and an army
// zz that only as64/core has): the as64 reader sees zz, the mowas2 reader does not (the mowas_2 file set has no as64/core), the
// two are cached apart; the game word comes from a draft, a word, ctx.gameId as a function or as the word lookupCtx puts there;
// on GoH the shared AS2 reader stays null. GoH (a made-up install: armies ger and rus, their names in dlg_mp.pot, flags): goh is in
// games with no na, the AS2 only questions are hidden there; values and lookups read the GoH armies; a new name is the lng-add text
// route (.pot), a number a gen set row, a game flag a copy; the AS2 card list refuses with its key; the write lands in the mod. GoH make
// (army.gohmake.js) on a second made-up install shaped like the vanilla army files: plan, refusals, compile, write and read back; then
// unit copies of own-unit cards, soldier blocks over lines, includes out of the folder, roster macros, cards of other armies (make and
// adopt), pictures, the frontlines nation map, the side name and picture and the money tabs.
// Author: Imperator_Aug (ARSENAL, ia-8559699f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-army-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./army.recipe'), L = require('./army.lang'), RD = R._read;
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

const g = fs.mkdtempSync(path.join(scratch, 'as2-'));
w(path.join(g, 'as64.exe'), 'x');
w(path.join(g, 'resource', 'set', 'multiplayer', 'armies', 'rus.set'), '{id 1}\r\n{title "rus"}\r\n');
w(path.join(g, 'as64', 'core', 'resource', 'set', 'multiplayer', 'armies', 'zz.set'), '{id 9}\r\n{title "zz"}\r\n');

(async () => {
await t('gidOf: draft, word, gameId function, gameId word, none', () => {
  assert.equal(RD.gidOf(null, { game: 'mowas2' }), 'mowas2');
  assert.equal(RD.gidOf(null, 'goh'), 'goh');
  assert.equal(RD.gidOf({ gameId: () => 'mowas2' }), 'mowas2');
  assert.equal(RD.gidOf({ gameId: 'goh' }), 'goh');
  assert.equal(RD.gidOf({}), 'as64');
  assert.equal(RD.gidOf(null, null), 'as64');
});
await t('reader: as64 sees as64/core, mowas2 does not', () => {
  const a = RD.reader(g, null, 'as64'), m = RD.reader(g, null, 'mowas2');
  const tags = x => RD.armies(x).map(r => r.tag).sort().join(',');
  assert.equal(tags(a), 'rus,zz');
  assert.equal(tags(m), 'rus');
  assert.notStrictEqual(a, m);
  assert.strictEqual(RD.reader(g, null, 'mowas2'), m);
  assert.strictEqual(RD.reader(g, null), a);
  // the game goes through newCtx: mowas2 is a Ctx of target mowas2 (vfs exe mowas_2), as64 the Ctx as before (no exe)
  assert.equal(m.target, 'mowas2'); assert.equal(m.exe, 'mowas_2');
  assert.equal(a.target, 'as64'); assert.equal(a.exe, undefined);
});
await t('GoH: the shared AS2 reader stays null (prices and bots read through it); naLine as before', () => {
  assert.equal(RD.reader(g, null, 'goh'), null);
  assert.equal(RD.naLine('goh', 'why', 'GHGPL-09'), 'Not available in GoH: why (GHGPL-09)');
});
// ---- Gates of Hell: a made-up install with armies ger (flag_ger) and rus, their names in dlg_mp.pot, two flags ----
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile'), AP = require('../../../../artport/artport');
const gh = fs.mkdtempSync(path.join(scratch, 'goh-')), gmod = path.join(scratch, 'mods', 'army_goh');
const G = (k, b) => w(path.join(gh, ...k.split('/')), b), FL = 'resource/interface/pages/multi/';
G('binaries/x64/call_to_arms.exe', 'x');
G('resource/set/multiplayer/armies/ger.set', '{army\r\n\t{id 0}\r\n\t{title "mp/army/ger"} \r\n\t{icon "/interface/pages/multi/flag_ger"}\r\n}\r\n');
G('resource/set/multiplayer/armies/rus.set', '{army\r\n\t{id 1}\r\n\t{title "mp/army/rus"}\r\n\t{icon "/interface/pages/multi/flag_rus"}\r\n}\r\n');
G('resource/interface/text/dlg_mp.pot', 'msgctxt "mp/army/ger"\r\nmsgid "Germany"\r\nmsgstr ""\r\n\r\nmsgctxt "mp/army/rus"\r\nmsgid "USSR"\r\nmsgstr ""\r\n');
const tga = (wd, h) => { const b = Buffer.alloc(18 + wd * h * 4); b[2] = 2; b.writeUInt16LE(wd, 12); b.writeUInt16LE(h, 14); b[16] = 32; b[17] = 8; return b; };
// the buy lists of ger: mid has a block card (tab and group of its own), a call line and a doctrine card (tab from its macro); early one card
const UL = 'resource/set/multiplayer/units/';
G(UL + 'mid/units_ger.set', ';head\r\n{"pz4h" ("tank" side(ger) period(mid) cost(300) b(tanks) g(tank_m))\r\n\t{tags "tank"}\r\n}\r\n("sq_inf" side(ger) name(gren) d(blitz) period(mid) g(inf_g) b(inf1) c1(rifle))\r\n{"doc1" ("doctrine_t1" side(ger) period(mid) cost(0))\r\n}\r\n');
G(UL + 'early/units_ger.set', '{"pz2c" ("tank" side(ger) period(early) cost(150) b(tanks) g(tank_e))\r\n}\r\n');
G(UL + 'late/units_rus.set', '{"is2" ("tank" side(rus) period(late) cost(500) b(tanks) g(tank_l))\r\n}\r\n');
G(FL + 'flag_ger.tga', tga(32, 20)); G(FL + 'flag_rus.tga', tga(32, 20)); G(FL + 'flag_ita.tga', tga(32, 20));
w(path.join(gmod, 'mod.info'), '{Mod {Name "m"}}\r\n');
const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: gh });
const v = x => ({ src: 'value', value: x });
const mk = (answers, verb, files) => {
  const d = D.newId('army'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
  for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
  return D.save(ctx, { id: d, recipe: 'army', verb: verb || 'change', game: 'goh', mod: gmod, base: { id: 'ger' }, answers, kept: [], state: 'open' });
};
const run = d => CP.compile(ctx, d, { army: R });
const refusedK = async (d, key) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.equal(e && e.key, key, e && e.message); };
await t('GoH: in games, no na; the AS2 only questions are asked on the AS2 games; the new rows in four languages', () => {
  assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
  const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
  assert.deepEqual(Q.alliance.when.$game, ['as64', 'mowas2', 'goh']); assert.deepEqual(Q.gohfirst.when, { $verb: 'make', $game: ['goh'] });
  assert.ok(R.routes['POST /api/x/task/r/army/gohmake'] && R.lookups.gohbase);
  for (const id of ['firstunits', 'unitlist', 'cardtab']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
  for (const id of ['unitremove', 'groupcards', 'cardgroup']) assert.ok(!Q[id].when.$game, id);
  // side, money tabs, prices and bots have their GoH form now: asked on every game
  for (const id of ['prices', 'bots', 'sidename', 'sideflag', 'budgetbuttons']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
  assert.deepEqual(Q.gohother.when, { $game: ['goh'] });
  assert.ok(R.routes['POST /api/x/task/r/army/gohadopt'] && R.routes['POST /api/x/task/r/army/gohbudget'] && R.lookups.gohother);
  for (const k of ['task.army.q.gohother', 'task.army.h.gohother']) { const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !/[‐-―]/.test(s)), k); }
  assert.ok(!L.some(r => r[0] === 'task.army.na.gohside'));
  for (const id of ['gohperiod', 'gohadd', 'gohtab']) assert.deepEqual(Q[id].when.$game, ['goh'], id);
  assert.ok(R.routes['POST /api/x/task/r/army/gohcards'] && R.lookups.gohcard);
  for (const k of ['task.army.q.gohperiod', 'task.army.h.gohperiod', 'task.army.v.gohperiod.early', 'task.army.v.gohperiod.mid', 'task.army.v.gohperiod.late', 'task.army.q.gohadd', 'task.army.h.gohadd', 'task.army.h.gohtab', 'task.army.q.gohfirst', 'task.army.h.gohfirst']) {
    const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !/[\u2010-\u2015]/.test(s)), k);
  }
  for (const id of ['tag', 'title', 'flag', 'armyid']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
  assert.ok(R.routes['POST /api/x/task/r/army/text']);
  for (const k of ['task.army.na.gohmake', 'task.army.na.gohcards', 'task.army.e.nogoh']) {
    const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !/[\u2010-\u2015]/.test(s)), k);
  }
});
await t('GoH: values and lookups read the GoH armies and their .pot names', async () => {
  const vs = await R.values(ctx, { id: 'ger' }, { verb: 'change' });
  assert.equal(vs.tag, 'ger'); assert.equal(vs.armyid, 0); assert.equal(vs.flag, 'ger'); assert.equal(vs.title, 'Germany');
  const a = await R.lookups.army(ctx, '', { mod: gmod });
  assert.deepEqual(a.map(x => x.id + '=' + x.name).sort(), ['ger=Germany', 'rus=USSR']);
  const f = await R.lookups.flag(ctx, 'it', { mod: gmod });
  assert.deepEqual(f.map(x => x.id), ['ita']);
});
await t('GoH: name, number and flag compile to the text route, a gen set row and a copy', async () => {
  const r = await run(mk({ title: v('Reich'), armyid: v(7), flag: { src: 'exist', value: 'ita' } }));
  assert.deepEqual(r.calls.map(c => [c.route, c.body.key, c.body.text, c.dryFlag]), [['POST /api/x/task/r/army/text', 'mp/army/ger', 'Reich', 'write']]);
  assert.deepEqual(r.gen.ops, [{ op: 'set', rows: [{ entity: 'file:resource/set/multiplayer/armies/ger.set', path: 'army/id', value: '7' }] }]);
  assert.deepEqual(r.copies, [{ key: FL + 'flag_ita.tga', to: FL + 'flag_ger.tga' }]);
});
await t('GoH: refusals: make with a missing form names it, cards, side, a taken name or number', async () => {
  let e0 = null; try { await run(mk({ tag: v('zz'), title: v('Zed'), gohfirst: v(['pz2c@early']) }, 'make')); } catch (x) { e0 = x; }
  assert.ok(e0 && /alliances_generic\.inc/.test(e0.message), e0 && e0.message);
  await refusedK(mk({ unitlist: { src: 'value', value: ['pz4h'] } }), 'task.army.na.gohcards');
  // the side name has its GoH form now; this install has no alliances_generic.inc, so ger is on no side
  let es = null; try { await run(mk({ sidename: v('Axis') })); } catch (x) { es = x; }
  assert.ok(es && /on no side \(alliances_generic\.inc\)/.test(es.message), es && es.message);
  for (const [ans, re] of [[{ title: v('USSR') }, /already called USSR/], [{ armyid: v(1) }, /already army rus/], [{}, /Nothing changes/]]) {
    let e = null; try { await run(mk(ans)); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message);
  }
  let e = null; try { await R.compile({ game: 'goh' }, { game: 'goh', verb: 'change', gameDir: null, base: { id: 'ger' }, mod: gmod, value: () => undefined, answer: () => undefined, values: {} }); } catch (x) { e = x; }
  assert.equal(e && e.key, 'task.army.e.nogoh');
});
const K = require('./army.gohcards');
await t('GoH cards: parse finds the block, the call line (name(side)) and the doctrine card with their tabs and groups', () => {
  const xs = K.parse(fs.readFileSync(path.join(gh, ...(UL + 'mid/units_ger.set').split('/')), 'latin1'), 'mid');
  assert.deepEqual(xs.map(x => [x.cat, x.kind, x.tab, x.group, x.tabOwn, x.i, x.j]), [['pz4h', 'block', 'tanks', 'tank_m', true, 1, 3], ['gren(ger)', 'call', 'inf1', 'inf_g', true, 4, 4], ['doc1', 'block', 'doctrine', '', false, 5, 6]]);
  assert.equal(K.newIdOf(xs[0], 'late', new Set()), 'pz4h_late');
  assert.equal(K.newIdOf(xs[1], 'mid', new Set(['gren_mid'])), 'gren_mid_2');
});
await t('GoH cards: edit comments a card out and moves another, line ends and other bytes kept; a doctrine card does not move', () => {
  const s = fs.readFileSync(path.join(gh, ...(UL + 'mid/units_ger.set').split('/')), 'latin1');
  const r = K.edit(s, 'mid', ['gren'], ['pz4h'], 'vehicles', 'tank_x');
  assert.equal(r.text, ';head\r\n{"pz4h" ("tank" side(ger) period(mid) cost(300) b(vehicles) g(tank_x))\r\n\t{tags "tank"}\r\n}\r\n;("sq_inf" side(ger) name(gren) d(blitz) period(mid) g(inf_g) b(inf1) c1(rifle))\r\n{"doc1" ("doctrine_t1" side(ger) period(mid) cost(0))\r\n}\r\n');
  assert.deepEqual(r.rows.map(x => x.op + ':' + x.card), ['move:pz4h', 'remove:gren(ger)']);
  assert.throws(() => K.edit(s, 'mid', [], ['doc1'], 'tanks', ''), /takes its tab from its macro/);
  assert.throws(() => K.edit(s, 'mid', ['nope'], [], '', ''), /no card nope/);
});
await t('GoH cards: lookups read the period of the draft; the card to copy comes from every period of this army', async () => {
  const d = mk({ gohperiod: v('mid') });
  const own = await R.lookups.own(ctx, '', { mod: gmod, draft: d.id, game: 'goh' });
  assert.deepEqual(own.map(x => x.id), ['pz4h', 'gren(ger)', 'doc1']);
  const tab = await R.lookups.tab(ctx, '', { mod: gmod, draft: d.id, game: 'goh' });
  assert.deepEqual(tab.map(x => x.id + '=' + x.sub), ['inf1=1', 'inf2=0', 'empl=0', 'vehicles=0', 'tanks=1', 'doctrine=1']);
  const grp = await R.lookups.group(ctx, '', { mod: gmod, draft: d.id, game: 'goh' });
  assert.deepEqual(grp.map(x => x.id), ['inf_g', 'tank_m']);
  const gc = await R.lookups.gohcard(ctx, 'pz', { mod: gmod, draft: d.id, game: 'goh' });
  assert.deepEqual(gc.map(x => x.id), ['pz2c@early', 'pz4h@mid']);
  const vs = await R.values(ctx, { id: 'ger' }, { verb: 'change', game: 'goh' });
  assert.equal(vs.gohperiod, 'mid');
});
await t('GoH cards: compile gives the cards route call and one Units Add call per copied card; bad picks refuse', async () => {
  const r = await run(mk({ gohperiod: v('mid'), unitremove: v(['gren(ger)']), groupcards: v(['pz4h']), cardgroup: { src: 'exist', value: 'tank_x' }, gohtab: { src: 'exist', value: 'vehicles' }, gohadd: v(['pz2c@early']) }));
  assert.deepEqual(r.calls.map(c => [c.route, c.dryFlag]), [['POST /api/x/task/r/army/gohcards', 'write'], ['POST /api/x/units/add', 'write']]);
  const b0 = Object.assign({}, r.calls[0].body); delete b0.mod;
  assert.deepEqual(b0, { army: 'ger', period: 'mid', remove: ['gren(ger)'], move: ['pz4h'], tab: 'vehicles', group: 'tank_x' });
  const a = r.calls[1].body;
  assert.deepEqual([a.gid, a.like, a.card, a.id, a.period, a.bots], ['goh', 'pz2c', 'pz2c@' + UL + 'early/units_ger.set@early', 'pz2c_mid', 'mid', false]);
  for (const [ans, re] of [[{ gohperiod: v('mid'), unitremove: v(['is2']) }, /no card is2/], [{ gohperiod: v('mid'), groupcards: v(['pz4h']) }, /Pick the cooldown group or the buy tab/],
    [{ gohperiod: v('early'), gohadd: v(['is2@late']) }, /no card is2/], [{ gohperiod: v('mid'), unitremove: v(['pz4h']), groupcards: v(['pz4h']), gohtab: { src: 'exist', value: 'tanks' } }, /picked twice/],
    [{ gohperiod: v('mid'), groupcards: v(['doc1']), gohtab: { src: 'exist', value: 'tanks' } }, /takes its tab from its macro/]]) {
    let e = null; try { await run(mk(ans)); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message);
  }
});
await t('GoH cards: the write puts the changed period list into the mod with a restore point; the game file stays', async () => {
  const d = mk({ gohperiod: v('mid'), unitremove: v(['gren(ger)']), groupcards: v(['pz4h']), gohtab: { src: 'exist', value: 'vehicles' } });
  const r = await CP.write(ctx, d, { army: R });
  assert.ok(r.written, JSON.stringify(r.errors));
  const out = fs.readFileSync(path.join(gmod, ...(UL + 'mid/units_ger.set').split('/')), 'latin1');
  assert.ok(/b\(vehicles\) g\(tank_m\)/.test(out) && /\r\n;\("sq_inf"/.test(out) && !/(^|[^\r])\n/.test(out), out);
  assert.equal(r.restore.length, 1); assert.ok(!(r.notes || []).some(n => /gohcards step did not name/.test(n)), JSON.stringify(r.notes));
  assert.ok(/b\(tanks\)/.test(fs.readFileSync(path.join(gh, ...(UL + 'mid/units_ger.set').split('/')), 'latin1')));
  fs.rmSync(path.join(gmod, 'resource', 'set', 'multiplayer', 'units'), { recursive: true, force: true });
});
await t('GoH cards route: its own restore point (Files page form) before the write; a link in the mod that leads out is refused', async () => {
  const MW = require('../../../../lib/modwrite'), CR = R.routes['POST /api/x/task/r/army/gohcards'], key = UL + 'mid/units_ger.set';
  const ur = MW.restoreRoot(gmod), before = fs.existsSync(ur) ? fs.readdirSync(ur).length : 0;
  const w = await CR(null, { mod: gmod, army: 'ger', period: 'mid', remove: ['gren(ger)'], write: true }, ctx);
  const pt = JSON.parse(fs.readFileSync(path.join(ur, w.restore[0], 'restore-point.json'), 'utf8'));
  assert.ok(w.wrote && w.restore.length === 1 && w.undo === ur && pt.rel === key && pt.existed === false && fs.readdirSync(ur).length === before + 1, JSON.stringify(w));
  fs.rmSync(path.join(gmod, 'resource', 'set', 'multiplayer', 'units'), { recursive: true, force: true });
  // resource/set/multiplayer/units as a junction to an empty throw-away folder outside the mod: refused, nothing written there
  const away = path.join(path.dirname(gmod), 'away_units'); fs.mkdirSync(away, { recursive: true });
  const lnk = path.join(gmod, 'resource', 'set', 'multiplayer', 'units'); fs.mkdirSync(path.dirname(lnk), { recursive: true });
  let linked = true; try { fs.symlinkSync(away, lnk, 'junction'); } catch (x) { linked = false; }
  if (linked) {
    let e = null; try { await CR(null, { mod: gmod, army: 'ger', period: 'mid', remove: ['gren(ger)'], write: true }, ctx); } catch (x) { e = x; }
    fs.unlinkSync(lnk);
    assert.ok(e && /leads out of the mod/.test(e.message) && fs.readdirSync(away).length === 0, e && e.message);
  }
  fs.rmSync(away, { recursive: true, force: true });
});
await t('GoH: the write puts the name (.pot), the number and an uploaded flag into the mod, with restore points', async () => {
  const png = AP.encodePng({ w: 64, h: 40, rgba: Buffer.alloc(64 * 40 * 4, 255) });
  const d = mk({ title: v('Reich'), armyid: v(7), flag: { src: 'file', staged: ['f.png'] } }, 'change', { 'f.png': png });
  const r = await CP.write(ctx, d, { army: R });
  assert.ok(r.written, JSON.stringify(r.errors));
  const pot = fs.readFileSync(path.join(gmod, 'localizations', 'default', 'interface', 'text', 'zz_arsenal_army.pot'), 'utf8');
  assert.ok(/msgctxt "mp\/army\/ger"\r\nmsgid "Reich"\r\nmsgstr ""/.test(pot), pot);
  const set = fs.readFileSync(path.join(gmod, 'resource', 'set', 'multiplayer', 'armies', 'ger.set'), 'utf8');
  assert.ok(/\{id 7\}/.test(set) && !/(^|[^\r])\n/.test(set), set);
  const fl = fs.readFileSync(path.join(gmod, ...(FL + 'flag_ger.tga').split('/')));
  assert.equal(fl.readUInt16LE(12) + 'x' + fl.readUInt16LE(14), '32x20');
  assert.ok(r.restore.length >= 3, JSON.stringify(r.restore.map(x => x && (x.rel || x.file))));
  assert.ok(/\{id 0\}/.test(fs.readFileSync(path.join(gh, 'resource', 'set', 'multiplayer', 'armies', 'ger.set'), 'utf8')));
});
// ---- GoH make: a second made-up install with the forms a new army copies (army.gohmake.js), shaped like the vanilla Finland files ----
const MK = require('./army.gohmake'), GB = require('../../../../botrecipe/gohbuys');
const gh2 = fs.mkdtempSync(path.join(scratch, 'goh2-')), gmod2 = path.join(scratch, 'mods', 'army_goh_make');
const G2 = (k, b) => w(path.join(gh2, ...k.split('/')), b);
G2('binaries/x64/call_to_arms.exe', 'x');
G2('resource/set/multiplayer/armies/ger.set', '{army\r\n\t{id 0}\r\n\t{title "mp/army/ger"} \r\n\t{icon "/interface/pages/multi/flag_ger"}\r\n}\r\n');
G2('resource/set/multiplayer/armies/rus.set', '{army\r\n\t{id 1}\r\n\t{title "mp/army/rus"}\r\n\t{icon "/interface/pages/multi/flag_rus"}\r\n}\r\n');
G2('resource/interface/text/dlg_mp.pot', 'msgctxt "mp/army/ger"\r\nmsgid "Germany"\r\nmsgstr ""\r\n\r\nmsgctxt "mp/army/rus"\r\nmsgid "USSR"\r\nmsgstr ""\r\n');
G2('resource/interface/text/desc/desc_squad_ger.pot', 'msgctxt "desc/squad/sq_rifle(ger)"\nmsgid "Rifle squad"\nmsgstr ""\n');
const ftga = (wd, h) => { const b = tga(wd, h); b[17] = 0x28; return b; };
G2(FL + 'flag_ger.tga', ftga(40, 20)); G2(FL + 'flag_rus.tga', ftga(40, 20));
G2('resource/set/multiplayer/games/presets/alliances_generic.inc', '{"Allies"\r\n\t{title "mp/alliance/allies"}\r\n\t{armies "rus"}\r\n\t{icon "/interface/pages/multi/flag_allies"}\r\n}\r\n{"Axis"\r\n\t{title "mp/alliance/axis"}\r\n\t{armies "ger"}\r\n\t{icon "/interface/pages/multi/flag_axis"}\r\n}');
G2('resource/set/registry/dlc.reg', '{dlc\r\n\t{army\r\n\t\t{fin 1911520}\r\n\t}\r\n}\r\n');
G2(UL + 'settings.set', '(define "unit_base"\r\n\t{tags "all %t"}\r\n\t{button "%b"}\r\n)\r\n(define "squad_with2types"\r\n\t("unit_base" t(%side %period) b(%b))\r\n\t{content "mp/%side/%period/%c1 mp/%side/%period/%c2"}\r\n)\r\n' +
  '(define "squad_vehicle"\r\n\t("unit_base" t(%side %period) b(%b))\r\n\t{content "%vehicle ( mp/%side/%period/%crew )"}\r\n)\r\n(define "vehicle"\r\n\t("unit_base" t(%side %period) b(%b))\r\n\t{content "* ( mp/%side/%period/%crew )"}\r\n)\r\n' +
  '(define "doctrine_t1"\r\n\t{group "doctrine_t1"}\r\n\t{doctrine %d}\r\n\t{cost %cost}\r\n)\r\n');
G2(UL + 'roster_early.set', '(include "settings.set")\r\n(include "early/inf_ger.set")\r\n(include "early/units_ger.set")\r\n(include "early/inf_rus.set")\r\n(include "early/units_rus.set")\r\n');
G2(UL + 'early/inf_ger.set', ';SDL\r\n{"mp/ger/early/leader" ("inf_tier2" side(ger) period(early) cost(8.0))} ; leader\r\n{"mp/ger/early/rifleman" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n{"mp/ger/early/gunner" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n{"mp/ger/early/tankman" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n');
G2(UL + 'early/units_ger.set', ';SDL\r\n{"sq_rifle(ger)"\r\n\t("squad_with2types" side(ger) period(early) c1(leader:1) c2(rifleman:3) b(inf1))\r\n\t("doctrine_t1" d(early_ger_def) cost(5))\r\n}\r\n' +
  '{"pak36_early"\r\n\t("squad_vehicle" side(ger) period(early) vehicle(pak36) crew(gunner:2) b(empl))\r\n}\r\n{"pz2c"\r\n\t("vehicle" side(ger) period(early) crew(tankman:2) b(tanks))\r\n}\r\n');
G2(UL + 'early/units_rus.set', '{"t26"\r\n\t("vehicle" side(rus) period(early) crew(tankman:2) b(tanks))\r\n}\r\n');
for (const cr of ['leader', 'rifleman', 'gunner', 'tankman']) G2('resource/set/breed/mp/ger/early/' + cr + '.set', '(include "ability.inc")\r\n(include "/set/breed/presets/perks/a.inc")\r\n{nationality ger}\r\n{skin "' + cr + '"}\r\n');
G2('resource/set/breed/mp/ger/early/ability.inc', '{ability "x"}\r\n');
G2('resource/script/multiplayer/units/ger/early.ger.lua', 'Purchases["early.ger"] = {\r\n\t{Repeat = 0,\r\n\t\tUnits = {\r\n\t\t\t{priority = 1.0, type = {"Class2", "Infantry", "Squad",}, unit = "sq_rifle(ger)"},\r\n' +
  '\t\t\t{priority = 0.5, type = {"Class1", "Gun",}, unit = "pak36_early"},\r\n\t\t\t{priority = 2.0, type = {"Class1", "Tank",}, unit = "pz2c"},\r\n\t\t},\r\n\t},\r\n}\r\n');
w(path.join(gmod2, 'mod.info'), '{Mod {Name "m2"}}\r\n');
const ctx2 = kit.ctxFor(scratch, { game: 'goh', gohDir: gh2 });
const rd2 = () => require('../../units/server').lib.newCtx(gh2, gmod2, true, 'goh');
const mk2 = answers => { const d = D.newId('army'); fs.mkdirSync(D.stageDir(ctx2, d), { recursive: true }); return D.save(ctx2, { id: d, recipe: 'army', verb: 'make', game: 'goh', mod: gmod2, base: { id: 'ger' }, answers, kept: [], state: 'open' }); };
const PICK = ['sq_rifle(ger)@early', 'pak36_early@early'];
await t('GoH make plan: copies of every form under the new word, line ends kept, read back by the shared readers', () => {
  const r = MK.plan(rd2(), { tag: 'zz', base: 'ger', id: 7, alliance: 'axis', cards: PICK, flag: 'plain' });
  const A = 'resource/set/multiplayer/armies/', B = 'resource/set/breed/mp/zz/early/';
  assert.deepEqual([...r.files.keys()].sort(), [A + 'zz.set', FL + 'flag_zz.tga', 'resource/set/multiplayer/games/presets/alliances_generic.inc', UL + 'roster_early.set',
    B + 'leader.set', B + 'ability.inc', B + 'rifleman.set', B + 'gunner.set', UL + 'early/inf_zz.set', UL + 'early/units_zz.set', 'resource/script/multiplayer/units/zz/early.zz.lua',
    'localizations/default/interface/text/zz_arsenal_army_zz.pot'].sort());
  const s = k => r.files.get(k).toString('latin1'), crlf = x => !/(^|[^\r])\n/.test(x);
  assert.equal(s(A + 'zz.set'), '{army\r\n\t{id 7}\r\n\t{title "mp/army/zz"} \r\n\t{icon "/interface/pages/multi/flag_zz"}\r\n}\r\n');
  const fl = r.files.get(FL + 'flag_zz.tga'); assert.deepEqual([fl[2], fl.readUInt16LE(12), fl.readUInt16LE(14), fl[16], fl[17], fl.length], [2, 40, 20, 32, 0x28, 18 + 40 * 20 * 4]);
  assert.ok(/\{"Axis"[\s\S]*\{armies "ger"\}\r\n\t\{armies "zz"\}\r\n/.test(s('resource/set/multiplayer/games/presets/alliances_generic.inc')));
  assert.ok(s(UL + 'roster_early.set').includes('(include "early/inf_ger.set")\r\n(include "early/inf_zz.set")\r\n(include "early/units_ger.set")\r\n(include "early/units_zz.set")\r\n'));
  const inf = s(UL + 'early/inf_zz.set'); assert.ok(crlf(inf) && /\{"mp\/zz\/early\/gunner" \("inf_tier1" side\(zz\)/.test(inf) && !/ger|tankman/.test(inf.split('\r\n').slice(2).join('')), inf);
  assert.ok(r.files.get(B + 'leader.set').equals(fs.readFileSync(path.join(gh2, 'resource/set/breed/mp/ger/early/leader.set'))));
  const u = s(UL + 'early/units_zz.set'); assert.ok(crlf(u), u);
  const back = require('./army.gohcards').parse(u, 'early');
  assert.deepEqual(back.map(x => x.cat), ['sq_rifle(zz)', 'pak36_early_zz']);
  assert.ok(/side\(zz\) period\(early\) c1\(leader:1\)/.test(u) && /d\(early_ger_def\)/.test(u), u);
  const bl = GB.readList(s('resource/script/multiplayer/units/zz/early.zz.lua'), 'script/multiplayer/units/zz/early.zz.lua');
  assert.deepEqual(bl.stages.map(x => x.units.map(y => y.unit + ':' + y.priority)), [['sq_rifle(zz):1', 'pak36_early_zz:0.5']]);
  assert.ok(/msgctxt "desc\/squad\/sq_rifle\(zz\)"\nmsgid "Rifle squad"/.test(s('localizations/default/interface/text/zz_arsenal_army_zz.pot')));
  assert.deepEqual(r.cards.map(c => c.newId + '=' + c.doctrine), ['sq_rifle(zz)=early_ger_def', 'pak36_early_zz=']);
  assert.equal(r.side, 'axis');
});
await t('GoH make plan refusals: own-unit card with no unit file (key + card), no doctrine, taken word, DLC word, taken number, game flag missing', () => {
  const g2 = rd2(), sp = o => Object.assign({ tag: 'zz', base: 'ger', id: 7, cards: PICK, flag: 'plain' }, o);
  let e = null; try { MK.plan(g2, sp({ cards: ['pz2c@early'] })); } catch (x) { e = x; }
  assert.ok(e && e.key === 'task.army.na.gohmake' && e.params.card === 'pz2c', e && e.message);
  for (const [o, re] of [[{ cards: ['pak36_early@early'] }, /names a doctrine/], [{ tag: 'rus' }, /already has an army rus/], [{ tag: 'fin' }, /DLC army/], [{ id: 1 }, /already army rus/],
    [{ flag: 'game:nope' }, /no flag flag_nope/], [{ cards: ['t26@early'] }, /ger has no card t26/], [{ cards: [] }, /pick at least one card/]]) {
    let x0 = null; try { MK.plan(g2, sp(o)); } catch (x) { x0 = x; } assert.ok(x0 && re.test(x0.message), JSON.stringify(o) + ': ' + (x0 && x0.message));
  }
});
await t('GoH make: values give the side, lookups the base cards; compile gives the make route, then the name', async () => {
  const vs = await R.values(ctx2, { id: 'ger' }, { verb: 'make', game: 'goh' });
  assert.equal(vs.alliance, 'axis'); assert.equal(vs.armyid, 6);
  const d0 = mk2({});
  const lb = await R.lookups.gohbase(ctx2, 'pak', { mod: gmod2, draft: d0.id, game: 'goh' });
  assert.deepEqual(lb.map(x => x.id), ['pak36_early@early']);
  const r = await CP.compile(ctx2, mk2({ tag: v('zz'), title: v('Zedland'), gohfirst: v(PICK) }), { army: R });
  assert.deepEqual(r.calls.map(c => c.route), ['POST /api/x/task/r/army/gohmake', 'POST /api/x/task/r/army/text']);
  const b = r.calls[0].body; assert.deepEqual([b.army, b.base, b.id, b.alliance, b.flag, b.cards], ['zz', 'ger', 6, 'axis', 'plain', PICK]);
  assert.deepEqual([r.calls[1].body.key, r.calls[1].body.text], ['mp/army/zz', 'Zedland']);
  let e = null; try { await CP.compile(ctx2, mk2({ tag: v('zz'), title: v('Zedland'), gohfirst: v(['pz2c@early']) }), { army: R }); } catch (x) { e = x; }
  assert.equal(e && e.key, 'task.army.na.gohmake', e && e.message);
  e = null; try { await CP.compile(ctx2, mk2({ tag: v('zz'), title: v('USSR'), gohfirst: v(PICK) }), { army: R }); } catch (x) { e = x; }
  assert.ok(e && /already called USSR/.test(e.message), e && e.message);
});
await t('GoH make: the write lands in the mod with restore points; the readers see army zz, its side, cards and bots; the game stays', async () => {
  const d = mk2({ tag: v('zz'), title: v('Zedland'), gohfirst: v(PICK), armyid: v(9) });
  const r = await CP.write(ctx2, d, { army: R });
  assert.ok(r.written, JSON.stringify(r.errors));
  assert.ok(r.restore.length >= 12, String(r.restore.length));
  const g3 = rd2(); g3._goh = true;
  const zz = RD.armies(g3).find(a => a.tag === 'zz');
  assert.deepEqual([zz.id, zz.alliance, zz.icon], [9, 'axis', '/interface/pages/multi/flag_zz']);
  assert.equal(RD.textOf(g3, 'mp/army/zz'), 'Zedland');
  assert.deepEqual(require('./army.gohcards').cardsOf(g3, 'zz', '').map(x => x.cat + '@' + x.listPeriod), ['sq_rifle(zz)@early', 'pak36_early_zz@early']);
  const lua = fs.readFileSync(path.join(gmod2, 'resource', 'script', 'multiplayer', 'units', 'zz', 'early.zz.lua'), 'latin1');
  assert.ok(/unit = "sq_rifle\(zz\)"/.test(lua) && !/(^|[^\r])\n/.test(lua), lua);
  assert.ok(!fs.existsSync(path.join(gh2, 'resource', 'set', 'multiplayer', 'armies', 'zz.set')));
  assert.ok(!/zz/.test(fs.readFileSync(path.join(gh2, 'resource/set/multiplayer/games/presets/alliances_generic.inc'), 'latin1')));
  // the route alone: a second make of zz is refused now that the mod has it
  let e = null; try { await R.routes['POST /api/x/task/r/army/gohmake'](null, { mod: gmod2, army: 'zz', base: 'ger', id: 10, cards: PICK }, ctx2); } catch (x) { e = x; }
  assert.ok(e && /already has an army zz/.test(e.message), e && e.message);
});
// ---- the forms refused before: unit copies, soldier blocks over several lines, includes out of the folder, a macro of another
// roster file, cards of other armies, pictures, the frontlines nation map, the side and the money tabs
const ENT = 'resource/entity/vehicle/tank/';
G2(ENT + 'pz2c/pz2c.def', '{from "tank"\r\n\t{extender "chassis"}\r\n}\r\n'); G2(ENT + 'pz2c/pz2c_x.def', '{from "wreck"\r\n}\r\n');
G2(ENT + 't26/t26.def', '{from "tank"\r\n}\r\n');
G2('resource/interface/text/desc/desc_entity.pot', 'msgctxt "desc/entity/pz2c"\nmsgid "Pz.Kpfw. II C"\nmsgstr ""\n');
G2(UL + 'settings_inf.set', '(define "squad_mg"\r\n\t("unit_base" t(%side %period) b(%b))\r\n\t{content "mp/%side/%period/%c1 mp/%side/%period/%c2"}\r\n)\r\n');
G2(UL + 'roster_early.set', '(include "settings.set")\r\n(include "settings_inf.set")\r\n(include "early/inf_ger.set")\r\n(include "early/units_ger.set")\r\n(include "early/inf_rus.set")\r\n(include "early/units_rus.set")\r\n');
// the mod's roster copy (written by the make above) wins over the game's: it gets the same settings_inf.set include
w(path.join(gmod2, ...(UL + 'roster_early.set').split('/')), '(include "settings.set")\r\n(include "settings_inf.set")\r\n(include "early/inf_ger.set")\r\n(include "early/inf_zz.set")\r\n(include "early/units_ger.set")\r\n(include "early/units_zz.set")\r\n(include "early/inf_rus.set")\r\n(include "early/units_rus.set")\r\n');
G2(UL + 'early/inf_ger.set', ';SDL\r\n{"mp/ger/early/leader" ("inf_tier2" side(ger) period(early) cost(8.0))} ; leader\r\n{"mp/ger/early/rifleman" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n{"mp/ger/early/gunner" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n{"mp/ger/early/tankman" ("inf_tier1" side(ger) period(early) cost(6.0))}\r\n' +
  '{"mp/ger/early/mg"\r\n\t("inf_tier2" side(ger) period(early) cost(9.0))\r\n}\r\n');
G2(UL + 'early/units_ger.set', ';SDL\r\n{"sq_rifle(ger)"\r\n\t("squad_with2types" side(ger) period(early) c1(leader:1) c2(rifleman:3) b(inf1))\r\n\t("doctrine_t1" d(early_ger_def) cost(5))\r\n}\r\n' +
  '{"pak36_early"\r\n\t("squad_vehicle" side(ger) period(early) vehicle(pak36) crew(gunner:2) b(empl))\r\n}\r\n{"pz2c"\r\n\t("vehicle" side(ger) period(early) crew(tankman:2) b(tanks))\r\n}\r\n' +
  '{"sq_mg(ger)"\r\n\t("squad_mg" side(ger) period(early) c1(leader:1) c2(mg:2) b(inf2))\r\n}\r\n');
G2('resource/set/breed/mp/ger/early/mg.set', '(include "ability.inc")\r\n(include "../../../presets/mg/kit.inc")\r\n{nationality ger}\r\n');
G2('resource/set/breed/presets/mg/kit.inc', '{weapon "mg34"}\r\n');
G2(FL + 'load_flag_ger.tga', ftga(80, 40)); G2(FL + 'result_player_flag_ger.tga', ftga(80, 40));
G2('resource/interface/skin/game/button/faction/ger.png', AP.encodePng({ w: 16, h: 12, rgba: Buffer.alloc(16 * 12 * 4, 200) }));
G2('resource/script/multiplayer/modes/frontlines.lua', 'local x = 1\n\tlocal nationMap = { rus = 1, ger = 2 }\nreturn x\n');
const BUD = 'resource/set/multiplayer/games/presets/global_parameters/budget.inc';
G2(BUD, '{budgets\r\n\t{vehicle\r\n\t\t{mode "standard"}\r\n\t\t{resource\r\n\t\t\t{start\t\t%s}\r\n\t\t}\r\n\t\t{buttons "inf1 inf2 empl vehicles tanks"}\r\n\t}\r\n\t{hero\r\n\t\t{resource\r\n\t\t\t{start %d}\r\n\t\t}\r\n\t\t{buttons "doctrine"}\r\n\t}\r\n}\r\n');
G2('resource/set/multiplayer/games/ctf.set', '(define "bot_state"\r\n\t{budgets {vehicle {buttons "inf1 inf2 empl vehicles tanks"}}}\r\n)\r\n');
// the task's GoH reader is kept 15 seconds per game and mod: wait it out so compile sees the files just added
await new Promise(res => setTimeout(res, 15500));
await t('GoH make: an own-unit card copies its unit (gen clone op, name of the unit), a soldier block over lines, an include out of the folder, a macro of settings_inf.set', async () => {
  const g4 = rd2(), cards = ['sq_rifle(ger)@early', 'pz2c@early', 'sq_mg(ger)@early', 'rus:t26@early'];
  const r = MK.plan(g4, { tag: 'yy', base: 'ger', id: 11, cards, flag: 'plain' });
  assert.deepEqual(r.clones, [{ entity: 'pz2c', as: 'pz2c_yy' }, { entity: 't26', as: 't26_yy' }]);
  const s = k => r.files.get(k).toString('latin1');
  const u = s(UL + 'early/units_yy.set');
  assert.deepEqual(require('./army.gohcards').parse(u, 'early').map(x => x.cat), ['sq_rifle(yy)', 'pz2c_yy', 'sq_mg(yy)', 't26_yy']);
  assert.ok(/\{"t26_yy"\r\n\t\("vehicle" side\(yy\) period\(early\) crew\(tankman:2\)/.test(u), u);
  assert.ok(s(UL + 'early/inf_yy.set').includes('{"mp/yy/early/mg"\r\n\t("inf_tier2" side(yy) period(early) cost(9.0))\r\n}\r\n'), s(UL + 'early/inf_yy.set'));
  assert.equal(s('resource/set/breed/mp/yy/early/mg.set'), '(include "ability.inc")\r\n(include "/set/breed/presets/mg/kit.inc")\r\n{nationality ger}\r\n');
  assert.ok(/msgctxt "desc\/entity\/pz2c_yy"\nmsgid "Pz.Kpfw. II C"/.test(s('localizations/default/interface/text/zz_arsenal_army_yy.pot')));
  // pictures in the size of the base's own, the faction button a PNG, the nation map line
  const lf = r.files.get(FL + 'load_flag_yy.tga'); assert.deepEqual([lf[2], lf.readUInt16LE(12), lf.readUInt16LE(14), lf[16]], [2, 80, 40, 32]);
  assert.ok(r.files.has(FL + 'result_player_flag_yy.tga') && !r.files.has(FL + 'result_flag_yy.tga'));
  const pg = AP.decodePng(r.files.get('resource/interface/skin/game/button/faction/yy.png')); assert.deepEqual([pg.w, pg.h], [16, 12]);
  assert.equal(s('resource/script/multiplayer/modes/frontlines.lua'), 'local x = 1\n\tlocal nationMap = { rus = 1, ger = 2, yy = 2 }\nreturn x\n');
  // compile: the clone ops run before the make route
  const c = await CP.compile(ctx2, mk2({ tag: v('yy'), title: v('Yland'), armyid: v(11), gohfirst: v(cards.slice(0, 3)), gohother: v(['rus:t26@early']) }), { army: R });
  assert.deepEqual(c.gen.ops, [{ op: 'clone', entity: 'pz2c', as: 'pz2c_yy' }, { op: 'clone', entity: 't26', as: 't26_yy' }]);
  assert.deepEqual(c.calls[0].body.cards, cards);
  // still refused: a macro no roster file defines; a new id that is already a unit file
  G2(UL + 'early/units_rus.set', '{"t26"\r\n\t("vehicle" side(rus) period(early) crew(tankman:2) b(tanks))\r\n}\r\n{"odd"\r\n\t("nomacro" side(rus) period(early))\r\n}\r\n');
  let e = null; try { MK.plan(rd2(), { tag: 'yy', base: 'ger', id: 11, cards: ['sq_rifle(ger)@early', 'rus:odd@early'] }); } catch (x) { e = x; }
  assert.ok(e && /"nomacro" is defined in none of the files/.test(e.message), e && e.message);
  G2(ENT + 'pz2c_yy/pz2c_yy.def', '{from "tank"\r\n}\r\n');
  e = null; try { MK.plan(rd2(), { tag: 'yy', base: 'ger', id: 11, cards: ['sq_rifle(ger)@early', 'pz2c@early'] }); } catch (x) { e = x; }
  assert.ok(e && /pz2c_yy\.def already exists/.test(e.message), e && e.message);
  fs.rmSync(path.join(gh2, ...(ENT + 'pz2c_yy').split('/')), { recursive: true, force: true });
});
await t('GoH make write with a unit copy: the clone lands in the mod before the army files; read back', async () => {
  const d = mk2({ tag: v('yy'), title: v('Yland'), armyid: v(11), gohfirst: v(['sq_rifle(ger)@early', 'pz2c@early']) });
  const r = await CP.write(ctx2, d, { army: R });
  assert.ok(r.written, JSON.stringify(r.errors));
  const g5 = rd2();
  assert.ok(g5.keys(/\/pz2c_yy\.def$/).length === 1, 'clone def');
  assert.deepEqual(require('./army.gohcards').cardsOf(g5, 'yy', '').map(x => x.cat), ['sq_rifle(yy)', 'pz2c_yy']);
  assert.ok(fs.existsSync(path.join(gmod2, ...(FL + 'load_flag_yy.tga').split('/'))) && !fs.existsSync(path.join(gh2, ...(FL + 'load_flag_yy.tga').split('/'))));
});
await t('GoH change: cards of other armies (adopt), the side name and picture, the money tabs; refusals; route writes read back', async () => {
  const g6 = rd2();
  const a = MK.adopt(g6, { tag: 'ger', cards: ['rus:t26@early'] });
  assert.deepEqual([...a.files.keys()], [UL + 'early/units_ger.set', 'localizations/default/interface/text/zz_arsenal_army_ger.pot'].slice(0, a.files.size));
  const u = a.files.get(UL + 'early/units_ger.set').toString('latin1');
  assert.ok(u.startsWith(fs.readFileSync(path.join(gh2, ...(UL + 'early/units_ger.set').split('/')), 'latin1').replace(/(\r\n)*$/, '')) && /\{"t26_ger"\r\n\t\("vehicle" side\(ger\)/.test(u) && !/(^|[^\r])\n/.test(u), u);
  assert.deepEqual(a.clones, [{ entity: 't26', as: 't26_ger' }]);
  assert.throws(() => MK.adopt(g6, { tag: 'ger', cards: ['t26@early'] }), /<army>:<card id>@<period>/);
  // values: the side of ger and its name and picture, the money tabs of budget.inc
  const vs = await R.values(ctx2, { id: 'ger' }, { verb: 'change', game: 'goh' });
  assert.deepEqual([vs.sideflag, vs.budgetbuttons], ['axis', 'inf1 inf2 empl vehicles tanks']);
  const mkc = answers => { const id = D.newId('army'); fs.mkdirSync(D.stageDir(ctx2, id), { recursive: true }); return D.save(ctx2, { id, recipe: 'army', verb: 'change', game: 'goh', mod: gmod2, base: { id: 'ger' }, answers, kept: [], state: 'open' }); };
  const r = await CP.compile(ctx2, mkc({ gohother: v(['rus:t26@early']), sidename: v('Achse'), sideflag: { src: 'exist', value: 'rus' }, budgetbuttons: v('inf1 inf2 empl vehicles tanks extra') }), { army: R });
  assert.deepEqual(r.calls.map(c => c.route), ['POST /api/x/task/r/army/gohadopt', 'POST /api/x/task/r/army/text', 'POST /api/x/task/r/army/gohbudget']);
  assert.deepEqual([r.calls[1].body.key, r.calls[1].body.text, r.calls[2].body.buttons], ['mp/alliance/axis', 'Achse', 'inf1 inf2 empl vehicles tanks extra']);
  assert.deepEqual(r.copies, [{ key: FL + 'flag_rus.tga', to: FL + 'flag_axis.tga' }]);
  assert.deepEqual(r.gen.ops, [{ op: 'clone', entity: 't26', as: 't26_ger' }]);
  let e = null; try { await CP.compile(ctx2, mkc({ budgetbuttons: v('inf1 inf2 empl vehicles') }), { army: R }); } catch (x) { e = x; }
  assert.ok(e && /Cards are bought on tab tanks/.test(e.message), e && e.message);
  // the routes alone: adopt and the money tabs written into the mod with restore points, read back with the GoH reader
  const AR = R.routes['POST /api/x/task/r/army/gohadopt'], BR = R.routes['POST /api/x/task/r/army/gohbudget'];
  const w1 = await AR(null, { mod: gmod2, army: 'ger', cards: ['rus:t26@early'], write: true }, ctx2);
  assert.ok(w1.wrote && w1.restore.length === w1.files.length, JSON.stringify(w1));
  assert.ok(require('./army.gohcards').cardsOf(rd2(), 'ger', '').some(x => x.cat === 't26_ger'));
  const w2 = await BR(null, { mod: gmod2, buttons: 'inf1 inf2 empl vehicles tanks extra', write: true }, ctx2);
  assert.deepEqual(w2.files.sort(), [BUD, 'resource/set/multiplayer/games/ctf.set'].sort());
  const AG = require('./army.goh'), g7 = rd2();
  assert.equal(AG.budgetOf(g7).vehicle, 'inf1 inf2 empl vehicles tanks extra');
  assert.equal(fs.readFileSync(path.join(gmod2, ...BUD.split('/')), 'latin1'), fs.readFileSync(path.join(gh2, ...BUD.split('/')), 'latin1').replace('vehicles tanks"', 'vehicles tanks extra"'));
  assert.ok(/vehicles tanks"/.test(fs.readFileSync(path.join(gh2, ...BUD.split('/')), 'latin1')));
});
fs.rmSync(gh2, { recursive: true, force: true });
fs.rmSync(gh, { recursive: true, force: true });
fs.rmSync(g, { recursive: true, force: true });
console.log(n + ' passed, 0 failed');
console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
