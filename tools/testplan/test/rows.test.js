// Author: Imperator_Aug (ARSENAL, ia-b990e37d)
'use strict';
// testplan rows part test: catalog, rows.build, checklist. Items are built by hand; no game, no file read.
//   node tools/testplan/test/rows.test.js [scratch dir]     prints `<n> passed, <m> failed`, exit 1 on a fail
const fs = require('fs');
const os = require('os');
const path = require('path');
const catalog = require('../lib/catalog');
const rows = require('../lib/rows');
const checklist = require('../lib/checklist');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const scratch = process.argv[2] || path.join(os.tmpdir(), 'testplan-rows');

const STACK = {
  as64: { gameDir: 'G', exe: 'as64', gid: 'as64', kind: 'as2', mods: ['m'], folder: 'M', name: 'mymod', canRun: { edrun: 'run', prove: 'run', sweep: 'plan' }, why: { edrun: '', prove: '' } },
  mowas2: { gameDir: 'G', exe: 'mowas_2', gid: 'mowas2', kind: 'as2', mods: ['m'], folder: 'M', name: 'mymod', canRun: { edrun: 'dry', prove: 'plan', sweep: 'plan' },
    why: { edrun: 'mowas_2 has no runner flags (TST-19)', prove: 'mowas_2 has no runner flags (TST-19)' } },
  goh: { gameDir: 'G', exe: 'goh', gid: 'goh', kind: 'goh', mods: ['m'], folder: 'M', name: 'mymod', canRun: { edrun: 'no', prove: 'score', sweep: 'plan' },
    why: { edrun: 'the GoH editor never starts the mission', prove: 'the GoH editor never starts the mission' } },
};
function item(o) {
  return Object.assign({ name: '', cls: null, source: 'changed', why: [{ rel: 'resource/x', state: 'changed' }], via: [], weapons: [], carriers: [], cards: [], file: null }, o);
}
function items() {
  return [
    item({ id: 'entity:tiger', kind: 'entity', key: 'tiger', name: 'Tiger I', cls: 'vehicle', weapons: ['88mm_kwk36', 'mg34_coax'],
      cards: [{ card: 'tiger', army: 'ger', buyable: true }], file: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def' }),
    item({ id: 'entity:pak40', kind: 'entity', key: 'pak40', cls: 'gun', weapons: ['75mm_pak40'], source: 'depends', why: [], via: ['weapon:75mm_pak40'],
      file: 'resource/entity/-vehicle/cannon/pak40/pak40.def' }),
    item({ id: 'entity:rifleman', kind: 'entity', key: 'rifleman', cls: 'human', weapons: ['mauser98k'] }),
    item({ id: 'entity:barn', kind: 'entity', key: 'barn', cls: 'static' }),
    item({ id: 'weapon:75mm_pak40', kind: 'weapon', key: '75mm_pak40', carriers: ['pak40'], file: 'resource/set/stuff/gun/75mm_pak40' }),
    item({ id: 'ammo:ap75', kind: 'ammo', key: 'ap75' }),
    item({ id: 'model:entity/x/x.mdl', kind: 'model', key: 'entity/x/x.mdl', file: 'resource/entity/x/x.mdl' }),
    item({ id: 'card:set/multiplayer/units/ger.set', kind: 'card', key: 'set/multiplayer/units/ger.set', cards: [{ card: 'tiger', army: 'ger', buyable: true }] }),
    item({ id: 'mission:map/single/m1/0.mi', kind: 'mission', key: 'map/single/m1/0.mi', file: 'resource/map/single/m1/0.mi' }),
    item({ id: 'text:interface/text/desc.lng', kind: 'text', key: 'interface/text/desc.lng' }),
    item({ id: 'interface:interface/icon/tiger.dds', kind: 'interface', key: 'interface/icon/tiger.dds' }),
    item({ id: 'sound:sound/gun/88.wav', kind: 'sound', key: 'sound/gun/88.wav' }),
    item({ id: 'script:script/x.lua', kind: 'script', key: 'script/x.lua' }),
  ];
}
const of = (res, check, it) => res.rows.filter(r => r.check === check && (!it || r.item === it));

// ---- catalog
{
  const want = ['refs', 'parse', 'load', 'aim', 'faults', 'card', 'text', 'mission', 'over', 'spawn', 'move', 'fire', 'dmgout', 'dmgin', 'crew', 'log', 'sync',
    'look', 'sound', 'anim', 'icon', 'feel', 'play'];
  eq(catalog.CHECKS.map(c => c.id), want, 'catalog holds the 23 checks of the table in order');
  ok(catalog.CHECKS.every(c => c.title && c.tool && c.proves && c.group && Array.isArray(c.kinds) && Array.isArray(c.limits)
    && ['static', 'run', 'player'].includes(c.how) && ['as64', 'mowas2', 'goh'].every(g => ['static', 'run', 'player', 'no'].includes(c.games[g]))), 'every check has the contract fields');
  ok(catalog.CHECKS.every(c => c.games.as64 === c.how), 'as64 does every check the way the table says');
  ok(catalog.CHECKS.filter(c => c.how === 'run').every(c => c.games.goh === 'player' && c.games.mowas2 === 'player'), 'a run check is player under goh and mowas2');
  eq(catalog.get('sync').games, { as64: 'static', mowas2: 'no', goh: 'no' }, 'sync is as64 only');
  eq([catalog.get('aim').games.goh, catalog.get('faults').games.goh], ['static', 'no'], 'goh: aim static, faults no');
  ok(catalog.get('nosuch') === null && catalog.get('FIRE').id === 'fire', 'catalog.get');
  const known = new Set(['TST-19', 'TST-47', 'TST-59', 'TST-72', 'TST-73', 'TST-74', 'TST-112', 'TST-114', 'TST-121']);
  ok(catalog.CHECKS.every(c => c.limits.every(l => known.has(l))), 'only limits rows that resolve are cited');
  ok(catalog.get('anim').limits.includes('TST-121') && catalog.get('feel').limits.includes('TST-72') && catalog.get('dmgout').limits.includes('TST-47'), 'limits sit on their checks');
  ok(catalog.CHECKS.every(c => c.kinds.every(k => catalog.KINDS.includes(k))), 'check kinds are item kinds');
}

// ---- rows, as64
const A = rows.build(STACK.as64, items());
{
  const ids = A.rows.map(r => r.id), codes = A.rows.map(r => r.code);
  eq(new Set(ids).size, ids.length, 'row ids unique');
  eq(new Set(codes).size, codes.length, 'row codes unique');
  ok(codes.every(c => /^T-[0-9A-HJKMNP-TV-Z]{5}$/.test(c)), 'code form T-xxxxx');
  const B = rows.build(STACK.as64, items());
  eq(B.rows.map(r => r.id + ' ' + r.code), A.rows.map(r => r.id + ' ' + r.code), 'ids and codes stable over two builds');
  const f = of(A, 'fire', 'entity:tiger')[0];
  eq(f.id, 'fire|entity:tiger|88mm_kwk36', 'fire row id form');
  eq(f.code, rows.code(f.id), 'code = rows.code(id)');
  eq(rows.code('fire|entity:tiger|88mm_kwk36'), rows.code('fire|entity:tiger|88mm_kwk36'), 'rows.code is a function of the id');
  ok(rows.code('a') !== rows.code('b'), 'different ids, different codes');
  ok(A.rows.every(r => r.status === 'todo' && r.result === null && r.title && r.expect && typeof r.why === 'string' && r.why && Array.isArray(r.limits)
    && r.target && ['entity', 'weapon', 'ammo', 'card', 'army', 'file'].every(k => k in r.target)), 'row shape');

  eq(of(A, 'fire', 'entity:tiger').map(r => r.target.weapon), ['88mm_kwk36', 'mg34_coax'], 'one fire row per weapon');
  eq(of(A, 'dmgout', 'entity:tiger').map(r => r.target.weapon), ['88mm_kwk36', 'mg34_coax'], 'one dmgout row per weapon');
  eq(of(A, 'fire').length, 4, 'fire rows: 2 tiger + pak40 + rifleman');
  eq(of(A, 'fire', 'entity:barn').length, 0, 'no fire row for an entity with no weapon');
  for (const c of ['dmgin', 'spawn', 'look']) ok(['tiger', 'pak40', 'rifleman', 'barn'].every(k => of(A, c, 'entity:' + k).length === 1), c + ' once per entity');
  eq(of(A, 'move').map(r => r.item), ['entity:tiger'], 'move: vehicles only');
  eq(of(A, 'crew').map(r => r.item), ['entity:tiger', 'entity:pak40'], 'crew: vehicle and gun');
  eq(of(A, 'aim').map(r => r.item), ['entity:tiger', 'entity:pak40'], 'aim: vehicle and gun');
  eq(of(A, 'faults').map(r => r.item), ['entity:tiger', 'entity:pak40', 'entity:rifleman'], 'faults: vehicle, gun, human');
  eq(of(A, 'card').map(r => r.item), ['entity:tiger', 'card:set/multiplayer/units/ger.set'], 'card: entity with a card, and the card');
  eq(of(A, 'feel').map(r => r.item), ['weapon:75mm_pak40', 'ammo:ap75'], 'feel: weapon and ammo');
  eq(of(A, 'icon').map(r => r.item), ['card:set/multiplayer/units/ger.set', 'interface:interface/icon/tiger.dds'], 'icon: card and interface');
  eq(of(A, 'play').map(r => r.item), ['mission:map/single/m1/0.mi', 'script:script/x.lua'], 'play: mission and script');
  eq(of(A, 'sound').length, 6, 'sound: 4 entities, weapon, sound file');
  eq(of(A, 'anim').length, 5, 'anim: 4 entities and the model');
  eq(of(A, 'look').length, 5, 'look: 4 entities and the model');
  eq(of(A, 'mission').length, 1, 'mission check once');
  eq(of(A, 'text').length, 2, 'text: text and card');
  eq(of(A, 'log').map(r => r.id), ['log|run'], 'one log row for the run');
  eq(of(A, 'sync').map(r => r.id), ['sync|mod'], 'one sync row for the mod');
  ok(of(A, 'parse', 'sound:sound/gun/88.wav').length === 0 && of(A, 'parse', 'script:script/x.lua').length === 1, 'parse: text file items, not a sound');

  // how, as64
  ok(['spawn', 'move', 'fire', 'dmgout', 'dmgin', 'crew', 'log'].every(c => of(A, c).every(r => r.how === 'run')), 'as64: run checks run');
  ok(['fire', 'dmgout', 'dmgin', 'crew'].every(c => of(A, c).every(r => r.runner === 'edrun' && r.form === 'run')), 'as64: edrun rows');
  ok(['spawn', 'move'].every(c => of(A, c).every(r => r.runner === 'prove' && r.form === 'run')), 'as64: prove rows');
  ok(['refs', 'parse', 'load', 'aim', 'faults', 'card', 'text', 'mission', 'over', 'sync'].every(c => of(A, c).length && of(A, c).every(r => r.how === 'static' && r.runner === null)), 'as64: static checks');
  ok(['look', 'sound', 'anim', 'icon', 'feel', 'play'].every(c => of(A, c).every(r => r.how === 'player')), 'as64: player checks');

  // depends
  const dep = A.rows.filter(r => r.item === 'entity:pak40');
  ok(dep.length && dep.every(r => r.why.indexOf('depends on weapon:75mm_pak40') === 0 && r.source === 'depends'), 'a depends row names the changed item');
  const cmp = rows.build(STACK.as64, [item({ id: 'entity:pak40', kind: 'entity', key: 'pak40', cls: 'gun', weapons: ['75mm_pak40'] })]).rows.filter(r => r.item === 'entity:pak40');
  eq(dep.map(r => r.check), cmp.map(r => r.check).filter(c => c !== 'over'), 'a depends item gets the rows of a changed one (but for over, the changed file check)');
  ok(of(A, 'entity:tiger') && of(A, 'over', 'entity:tiger')[0].why === 'changed resource/x', 'a changed row names the file');
  eq(of(A, 'fire', 'entity:tiger')[0].foe, 'gaz67b', 'a vehicle fires at the soft foe');
  eq(of(A, 'fire', 'entity:rifleman')[0].foe, 'mp/ger/rifle', 'a man fires at a man');
  ok(/pz6bh/.test(of(A, 'feel')[0].expect), 'feel names its foe in expect');
  eq(of(A, 'fire')[0].target, { entity: 'tiger', weapon: '88mm_kwk36', ammo: null, card: 'tiger', army: 'ger', file: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def' }, 'target');

  // summary
  const s = A.summary;
  eq(s.rows, A.rows.length, 'summary.rows');
  eq(s.byHow.static + s.byHow.run + s.byHow.player, A.rows.length, 'byHow adds up');
  eq(s.byHow.run, A.rows.filter(r => r.how === 'run').length, 'byHow.run');
  eq(Object.values(s.byCheck).reduce((a, b) => a + b, 0), A.rows.length, 'byCheck adds up');
  eq(s.byCheck.fire, 4, 'byCheck.fire');
  eq(s.byStatus.todo, A.rows.length, 'byStatus.todo');
  eq(s.byStatus.fail, 0, 'byStatus.fail starts at 0');
  eq(s.items, 13, 'summary.items');
  const m = A.rows.map(r => Object.assign({}, r)); m[0].status = 'pass'; m[1].status = 'fail';
  const s2 = rows.summarize(m);
  eq([s2.byStatus.pass, s2.byStatus.fail, s2.byStatus.todo], [1, 1, A.rows.length - 2], 'summarize recounts statuses');
}

// ---- only, everything, seeded defects
{
  const O = rows.build(STACK.as64, items(), { only: ['fire', 'look'] });
  eq([...new Set(O.rows.map(r => r.check))].sort(), ['fire', 'look'], 'only keeps the named checks');
  eq(O.rows.length, 9, 'only: 4 fire + 5 look');
  eq(Object.keys(O.summary.byCheck).sort(), ['fire', 'look'], 'only: summary follows');
  const U = rows.build(STACK.as64, items(), { only: ['fire', 'nosuch'] });
  eq(U.summary.unknownChecks, ['nosuch'], 'seeded defect: an unknown check id in only is named');
  // seeded defects: the same item twice and the same weapon twice must not make duplicate rows
  const dup = items(); dup.push(dup[0]); dup[0].weapons = ['88mm_kwk36', '88MM_KWK36', 'mg34_coax'];
  const D = rows.build(STACK.as64, dup);
  eq(new Set(D.rows.map(r => r.id)).size, D.rows.length, 'seeded defect: duplicate item and weapon make no duplicate row id');
  eq(of(D, 'fire', 'entity:tiger').length, 2, 'seeded defect: a weapon listed twice fires once');
  // seeded defect: an item of an unknown kind and a broken item get no rows and do not throw
  const X = rows.build(STACK.as64, [item({ id: 'bogus:x', kind: 'bogus', key: 'x' }), null, { kind: 'entity' }]);
  eq(X.rows.map(r => r.check), ['log', 'sync'], 'seeded defect: unknown kind gets no item rows');
  eq(rows.build(STACK.as64, []).rows.length, 0, 'no items, no rows');
  const dp = [item({ id: 'entity:pak40', kind: 'entity', key: 'pak40', cls: 'gun', weapons: ['75mm_pak40'], source: 'depends', via: ['weapon:75mm_pak40'] })];
  eq(of(rows.build(STACK.as64, dp), 'over').length, 0, 'over: not for a depends item');
  eq(of(rows.build(STACK.as64, dp, { everything: true }), 'over').length, 1, 'everything: every item gets every row');
}

// ---- rows, mowas2
const M = rows.build(STACK.mowas2, items());
{
  ok(['fire', 'dmgout', 'dmgin', 'crew'].every(c => of(M, c).length && of(M, c).every(r => r.how === 'player' && r.runner === 'edrun' && r.form === 'dry')), 'mowas2: edrun rows are player, runner edrun, dry');
  ok(['spawn', 'move'].every(c => of(M, c).length && of(M, c).every(r => r.how === 'player' && r.runner === 'prove' && r.form === 'plan')), 'mowas2: prove rows are player, runner prove, plan');
  ok(of(M, 'fire').every(r => /TST-19/.test(r.why)), 'mowas2: why says why no run');
  eq(of(M, 'sync').length, 0, 'mowas2: no sync row');
  eq(of(M, 'faults').length, 3, 'mowas2: faults stays');
  eq(M.summary.byHow.run, 0, 'mowas2: no run row');
  eq(of(M, 'fire').map(r => r.code), of(A, 'fire').map(r => r.code), 'the code of a row is the same in every game');
}

// ---- rows, goh
const G = rows.build(STACK.goh, items());
{
  ok(['fire', 'dmgout', 'dmgin', 'crew', 'move'].every(c => of(G, c).length && of(G, c).every(r => r.how === 'player' && r.runner === null)), 'goh: run rows are player with no runner');
  ok(of(G, 'spawn').every(r => r.how === 'player' && r.runner === 'sweep' && r.form === 'plan'), 'goh: spawn keeps the sweep plan');
  ok(of(G, 'fire').every(r => /never starts the mission/.test(r.why)), 'goh: why from the stack');
  eq(of(G, 'sync').length, 0, 'goh: no sync row');
  eq(of(G, 'faults').length, 0, 'goh: no faults row');
  ok(of(G, 'aim').length === 2 && of(G, 'aim').every(r => r.how === 'static'), 'goh: aim stays static');
  eq(G.summary.byHow.run, 0, 'goh: no run row');
  eq(of(G, 'fire')[0].foe, null, 'goh: no default foe');
  // no canRun on the stack: the game word decides
  const G2 = rows.build({ gid: 'goh' }, items());
  eq(G2.rows.map(r => r.id + r.how + r.runner), G.rows.map(r => r.id + r.how + r.runner), 'goh without canRun gives the same rows');
  const M2 = rows.build({ exe: 'mowas_2' }, items());
  eq(M2.rows.map(r => r.id + r.how + r.runner), M.rows.map(r => r.id + r.how + r.runner), 'exe word mowas_2 maps to mowas2');
}

// ---- checklist
function planOf(stack, res, its) { return { v: 1, tool: 'testplan', stack, items: its, rows: res.rows, summary: res.summary }; }
const flat = l => l.sessions.reduce((a, s) => a.concat(s.entries), []);
{
  const L = checklist.build(planOf(STACK.as64, A, items()), { lang: 'en' });
  const es = flat(L);
  eq(es.length, A.rows.filter(r => r.how === 'player').length, 'as64: the list is the player rows');
  eq(L.counts.entries, es.length, 'counts.entries');
  eq(L.counts.bySession.editor + L.counts.bySession.skirmish + L.counts.bySession.mission, es.length, 'counts.bySession adds up');
  ok(L.sessions.every(s => ['editor', 'skirmish', 'mission'].includes(s.id) && s.title && s.setup.length && s.setup.every(x => typeof x === 'string') && s.entries.length), 'session shape');
  ok(es.every(e => e.row && /^T-/.test(e.code) && e.item && e.do && e.look && e.key && e.args && 'expect' in e && e.status === 'todo'), 'entry shape');
  ok(es.every(e => checklist.TEXT[e.key + '.do'] && checklist.fill(checklist.TEXT[e.key + '.do'], e.args) === e.do
    && checklist.fill(checklist.TEXT[e.key + '.look'], e.args) === e.look), 'do and look are TEXT[key] filled with args');
  ok(es.every(e => !/\{\w+\}/.test(e.do + e.look)), 'no slot left open');
  ok(L.sessions.every(s => checklist.TEXT[s.titleKey] && s.setupKeys.every((k, i) => checklist.fill(checklist.TEXT[k.key], k.args) === s.setup[i])), 'title and setup carry keys');
  ok(Object.keys(checklist.TEXT).every(k => { const t = checklist.TEXT[k]; return t.length <= 160 && !/ - |--|–|—/.test(t); }), 'TEXT: short sentences, no dash as punctuation');
  ok(es.filter(e => e.check === 'icon').every(e => L.sessions.find(s => s.entries.includes(e)).id === 'skirmish'), 'icon entries sit in a skirmish session');
  ok(es.filter(e => e.check === 'play').every(e => L.sessions.find(s => s.entries.includes(e)).id === 'mission'), 'play entries sit in a mission session');
  ok(es.filter(e => e.check === 'look').every(e => L.sessions.find(s => s.entries.includes(e)).id === 'editor'), 'look entries sit in an editor session');
  const lk = es.find(e => e.row === 'look|entity:tiger');
  eq(lk.do, 'Place Tiger I (tiger) in the editor, look at it from all sides, then destroy it.', 'look sentence with name and id');
  ok(/mymod/.test(L.sessions[0].setup[0]) && !/yourself/.test(L.sessions[0].setup.join(' ')), 'as64 setup names the mod');
  eq(es.filter(e => e.check === 'fire').length, 0, 'as64: a todo run row is not in the list');

  // md
  const md = checklist.md(L);
  const boxes = md.split('\n').filter(l => /^- \[ \] T-[0-9A-Z]{5} \S/.test(l));
  eq(boxes.length, es.length, 'md: one `- [ ] T-xxxxx` line per entry');
  eq(md.split('\n').filter(l => /^## /.test(l)).length, L.sessions.length, 'md: one heading per session');
  ok(md.indexOf('## ' + L.sessions[0].title) < md.indexOf(L.sessions[0].entries[0].code), 'md: entries under their session');
  ok(/^# Test checklist: mymod/.test(md), 'md title');
  ok(/Nothing for a person to check/.test(checklist.md(checklist.build({ rows: [] }))), 'md of an empty list');
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(path.join(scratch, 'checklist.md'), md);
  eq(fs.readFileSync(path.join(scratch, 'checklist.md'), 'utf8'), md, 'md written to scratch reads back');

  // statuses: fail and unproven pull a run row in, pass and void do not
  const rs = A.rows.map(r => Object.assign({}, r));
  const set = (id, st) => { rs.find(r => r.id === id).status = st; };
  set('fire|entity:tiger|88mm_kwk36', 'fail'); set('dmgout|entity:tiger|88mm_kwk36', 'unproven');
  set('fire|entity:tiger|mg34_coax', 'pass'); set('dmgin|entity:tiger', 'void'); set('refs|entity:tiger', 'fail'); set('look|entity:tiger', 'pass');
  const L2 = checklist.build({ stack: STACK.as64, items: items(), rows: rs }, { units: [{ id: 'tiger', name: 'Pz.Kpfw. VI Tiger', army: 'ger', cost: 900, crew: 5 }] });
  const e2 = flat(L2);
  eq(e2.length, es.length + 2, 'fail and unproven run rows join the list, pass, void and a static fail do not');
  const fr = e2.find(e => e.row === 'fire|entity:tiger|88mm_kwk36');
  ok(fr && fr.status === 'fail' && fr.recheck === true, 'the failed fire row is in, as a recheck');
  eq(fr.do, 'Place Pz.Kpfw. VI Tiger (tiger) in the editor and order it to fire 88mm_kwk36 at gaz67b.', 'fire sentence, name from the units list');
  eq(fr.look, 'The gun fires, you hear the shot, the shell leaves the barrel.', 'fire look sentence');
  ok(/crew 5/.test(fr.expect) && /price 900/.test(fr.expect), 'expect holds the numbers of the units list');
  ok(e2.some(e => e.row === 'dmgout|entity:tiger|88mm_kwk36' && e.status === 'unproven'), 'the unproven dmgout row is in');
  ok(!e2.some(e => e.row === 'refs|entity:tiger' || e.row === 'fire|entity:tiger|mg34_coax' || e.row === 'dmgin|entity:tiger'), 'static fail, pass and void stay out');
  const md2 = checklist.md(L2);
  ok(md2.split('\n').some(l => l.indexOf('- [x] ' + e2.find(e => e.row === 'look|entity:tiger').code) === 0), 'md: a passed entry is ticked');
  eq(L2.counts.byStatus.fail, 1, 'counts.byStatus');
}
{
  // mowas2 and goh: the run rows are in the list
  const LM = checklist.build(planOf(STACK.mowas2, M, items()));
  ok(['fire', 'dmgout', 'dmgin', 'crew', 'spawn', 'move'].every(c => flat(LM).some(e => e.check === c)), 'mowas2: edrun and prove rows are in the list');
  eq(flat(LM).length, M.rows.filter(r => r.how === 'player').length, 'mowas2: every player row');
  const LG = checklist.build(planOf(STACK.goh, G, items()));
  ok(flat(LG).some(e => e.check === 'fire') && flat(LG).some(e => e.check === 'log'), 'goh: fire and log rows are in the list');
  ok(LG.sessions.every(s => /yourself/.test(s.setup[0]) && /does not start it/.test(s.setup[0])), 'goh: you start the game yourself');
  ok(/GoH editor/.test(LG.sessions.find(s => s.id === 'editor').setup[1]), 'goh: the GoH editor step');
  ok(!/GoH/.test(LM.sessions.find(s => s.id === 'editor').setup.join(' ')) && /skirmish/.test(LM.sessions.find(s => s.id === 'editor').setup[1]), 'mowas2: editor or a skirmish');
  eq(flat(LG).find(e => e.check === 'fire').args.foe, 'an enemy unit', 'goh: fire names no default foe');
  const le = LG.sessions.filter(s => s.id === 'editor').pop().entries;
  eq(le[le.length - 1].check, 'log', 'the log check is the last entry of the last editor session');
}
{
  // grouping: 30 units of 2 armies, 12 units per editor session, an army kept together
  const many = [];
  for (let i = 0; i < 30; i++) {
    const army = i % 2 ? 'rus' : 'ger';
    many.push(item({ id: 'entity:u' + i, kind: 'entity', key: 'u' + i, cls: 'vehicle', weapons: ['w' + i], cards: [{ card: 'u' + i, army, buyable: true }] }));
  }
  const R = rows.build(STACK.as64, many, { only: ['look', 'sound', 'anim'] });
  const L = checklist.build(planOf(STACK.as64, R, many));
  const ed = L.sessions.filter(s => s.id === 'editor');
  eq(ed.length, 3, '30 units make 3 editor sessions');
  ok(ed.every(s => new Set(s.entries.map(e => e.item)).size <= 12), 'at most 12 units per session');
  eq(ed.map(s => s.title), ['Editor session 1 of 3', 'Editor session 2 of 3', 'Editor session 3 of 3'], 'session titles');
  const order = flat(L).map(e => e.args.army);
  ok(order.lastIndexOf('ger') < order.indexOf('rus'), 'same army together');
  ok(ed.every(s => { const by = {}; for (const e of s.entries) by[e.item] = (by[e.item] || 0) + 1; return Object.values(by).every(n => n === 3); }), 'the entries of a unit stay in one session');
  eq(checklist.build(planOf(STACK.as64, R, many), { perSession: 30 }).sessions.length, 1, 'perSession option');
  const cs = new Set(R.rows.map(r => r.code));
  eq(cs.size, R.rows.length, 'codes unique over 90 rows');
}
{
  // seeded defect: a plan with broken rows does not throw and lists only what is checkable
  const L = checklist.build({ stack: STACK.as64, rows: [null, { id: 'x|y', code: 'T-00000', item: 'y', check: 'nosuch', how: 'player', status: 'todo' }, { id: 'a|b', how: 'static', status: 'fail' }] });
  eq(flat(L).length, 1, 'seeded defect: a row of an unknown check still gets an entry, a null row none');
  eq(flat(L)[0].key, 'generic', 'seeded defect: unknown check falls to the generic text');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
