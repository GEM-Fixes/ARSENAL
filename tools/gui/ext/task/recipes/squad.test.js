// squad recipe test: a new squad copied from riflemans(ger) (members with a new soldier line, card fields, bots, icon frames, text), a
// card block squad, a change of riflemans(ger) itself and taking it off the buy list. node squad.test.js <scratch dir>. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-b54b6f01)
'use strict';
const fs = require('fs'), path = require('path');
const kit = require('../lib/testkit');
const R = require('./squad.recipe'), L = require('./squad.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'task-squad-')));
const rd = (mod, rel) => fs.readFileSync(path.join(mod, rel), 'latin1');

(async () => {
  const a = await kit.run(R, L, {
    base: { id: 'riflemans(ger)', name: 'riflemans' },
    answers: {
      name: 'task_squad', display: 'Task squad', cost: 200,
      // the last line stands in for a soldier made in a branch (its result is army/name:count); a branch child is not compiled by the kit
      members: { src: 'list', items: [{ src: 'value', value: 'squadleader:1' }, { src: 'value', value: 'rifle:4' }, { src: 'branch', result: 'ger/smg:2' }] },
      info: 'Task squad tooltip',
      level: 3, tags: ['all', 'inf_only', 'engineers'], buy: true, priority: 2,
    },
    planFiles: ['resource/set/multiplayer/units/squads.set', 'resource/script/multiplayer/bot.data.lua', 'resource/interface/scene/unit_icon/task_squad(ger)_00.tga'],
    write: true,
    after: (mod, res, ok) => {
      const q = rd(mod, 'resource/set/multiplayer/units/squads.set');
      const l = q.split(/\r?\n/).find(x => /name\(task_squad\)/.test(x)) || '';
      ok(/^\("squad_with3types" side\(ger\)/.test(l), 'a 3 type squad line', l);
      ok(/c1\(squadleader:1\) c2\(rifle:4\) c3\(smg:2\)/.test(l), 'members in order, leader first', l);
      ok(/cost\(200\)/.test(l) && /level\(3\)/.test(l) && /t\(all inf_only engineers\)/.test(l), 'card fields set', l);
      ok(/\("squad_with4types" side\(ger\) name\(riflemans\)/.test(q), 'the base squad is untouched');
      ok(/unit = "task_squad\(ger\)"/.test(rd(mod, 'resource/script/multiplayer/bot.data.lua')) && /priority = 2[,}\s]/.test(rd(mod, 'resource/script/multiplayer/bot.data.lua')), 'bots buy it with priority 2');
      const lng = (function walk(d) { let t = ''; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) t += walk(p); else if (/\.lng$/i.test(e.name)) t += fs.readFileSync(p, 'utf8'); } return t; })(mod);
      ok(/Task squad/.test(lng) && /Task squad tooltip/.test(lng), 'the shown name and tooltip are written to a .lng file');
      ok(['00', '01', '02', '03'].every(n => fs.existsSync(path.join(mod, 'resource/interface/scene/unit_icon/task_squad(ger)_' + n + '.tga'))), 'four icon frames copied');
    },
  }, path.join(scratch, 'make'));
  const b = await kit.run(R, L, {
    verb: 'change',
    base: { id: 'riflemans(ger)', name: 'riflemans' },
    answers: { cost: 175, level: 2, charge: 45, members: ['squadleader:1', 'rifle:4', 'smg:2', 'mgun:1'], display: 'Riflemen two' },
    planFiles: ['resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      const l = rd(mod, 'resource/set/multiplayer/units/squads.set').split(/\r?\n/).find(x => /side\(ger\) name\(riflemans\)/.test(x)) || '';
      ok(/cost\(175\)/.test(l) && /level\(2\)/.test(l) && /\bc\(45\)/.test(l), 'override has the new cost, rank and wait', l);
      ok(/c2\(rifle:4\) c3\(smg:2\) c4\(mgun:1\)/.test(l), 'override has the new counts', l);
      ok(!fs.existsSync(path.join(mod, 'resource/script/multiplayer/bot.data.lua')), 'a change leaves the bots alone');
    },
  }, path.join(scratch, 'change'));
  // card block fields: cp and an icon frame make the squad a card block whose content lists the members
  const c3 = await kit.run(R, L, {
    base: { id: 'riflemans(ger)', name: 'riflemans' },
    answers: { name: 'task_block', ccp: '12.5', cicon: '3', cinfo: '' },
    planFiles: ['resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      const q = rd(mod, 'resource/set/multiplayer/units/squads.set');
      const i = q.indexOf('task_block(ger)'), blk = i < 0 ? '' : q.slice(i, i + 600);
      ok(i >= 0 && /\bcp\s*\(?\s*12\.5/.test(blk), 'card block has cp 12.5', blk.slice(0, 300));
      ok(/\bicon\s*\(?\s*3\b/.test(blk), 'card block has icon frame 3');
      ok(/mp\/ger\/[a-z0-9_]+:\d/.test(blk), 'card block content lists the members as mp/ger/breed:n');
    },
  }, path.join(scratch, 'block'));
  // a change can take the squad off the buy list
  const d = await kit.run(R, L, {
    verb: 'change',
    base: { id: 'riflemans(ger)', name: 'riflemans' },
    answers: { remove: true },
    planFiles: ['resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      const q = rd(mod, 'resource/set/multiplayer/units/squads.set');
      ok(/"riflemans\(ger\)"\s*\{\s*remove\s*\}/.test(q), 'a remove line for riflemans(ger)', q.slice(-200));
    },
  }, path.join(scratch, 'remove'));
  // refusals: a change may not rename or take a type out
  const g = kit.findGame({}), refuse = (ans, re, m) => { let why = null; try { R.compile({}, { verb: 'change', base: { id: 'riflemans(ger)' }, gameDir: g, mod: '', answer: () => null, value: id => ans[id] }); } catch (e) { why = e.message; } const okk = why && re.test(why); console.log((okk ? 'ok: ' : 'FAIL ') + m + (okk ? '' : ': ' + why)); return okk; };
  const r1 = true;
  // members, content, order and not_for_sale on a change: one squad op with change: true (no members beside content)
  const chg = ans => { try { return R.compile({}, { verb: 'change', base: { id: 'riflemans(ger)' }, gameDir: g, mod: '', pass: {}, answer: () => null, value: id => ans[id] }); } catch (e) { return { err: e.message }; } };
  const swc = (ans, m, want) => {
    const x = chg(ans), op = ((x.gen && x.gen.ops) || []).find(o => o.op === 'squad' && o.change);
    const okk = !!op && want(op);
    console.log((okk ? 'ok: ' : 'FAIL ') + m + (okk ? '' : ': ' + (x.err || JSON.stringify(x.gen))));
    return okk;
  };
  const r2 = swc({ members: ['squadleader:1', 'rifle:5'] }, 'a change takes a type out: squad op members', op => op.members.join(' ') === 'squadleader:1 rifle:5');
  const r4 = swc({ content: 'mp/ger/rifle:4' }, 'a change sets content: squad op content, no members', op => op.content === 'mp/ger/rifle:4' && op.members === undefined);
  const r5 = swc({ not_for_sale: true }, 'a change takes it off sale: squad op not_for_sale', op => op.not_for_sale === true && op.members === undefined);
  const r6 = refuse({ content: 'mp/ger/rifle:4', members: ['squadleader:1', 'rifle:5'] }, /either as members or as a content line/, 'members and content together are refused');
  // a type taken out plans with no errors (gen rewrites the line as squad_with2types)
  const e = await kit.run(R, L, {
    verb: 'change',
    base: { id: 'riflemans(ger)', name: 'riflemans' },
    answers: { members: ['squadleader:1', 'rifle:5'] },
    planFiles: ['resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      const l = rd(mod, 'resource/set/multiplayer/units/squads.set').split(/\r?\n/).find(x => /side\(ger\) name\(riflemans\)/.test(x)) || '';
      ok(/squad_with2types/.test(l) && /rifle:5/.test(l) && !/smg:/.test(l), 'the line keeps two types', l);
    },
  }, path.join(scratch, 'typeout'));
  const r3 = refuse({ ccp: '50' }, /new squad only|cp of the card is/, 'card block fields are refused out of range or on a change');
  // novice hazards: one check each
  const RC = require('../lib/recipe'), fails = [], chk = (c, m, x) => { console.log((c ? 'ok: ' : 'FAIL ') + m + (c ? '' : ': ' + (x || ''))); if (!c) fails.push(m); };
  const mk = ans => { try { return R.compile({}, { verb: 'make', base: { id: 'riflemans(ger)' }, gameDir: g, mod: '', pass: {}, answer: () => null, value: id => ans[id] }); } catch (e) { return { err: e.message }; } };
  const opOf = x => ((x.gen && x.gen.ops) || []).find(o => o.op === 'squad') || {};
  { const x = chg({ name: 'riflemans_x', cost: 150 }), o = opOf(x);
    chk(!x.err && !JSON.stringify(x.gen || {}).includes('riflemans_x'), 'a change never renames (the name is not asked on a change)', x.err || JSON.stringify(o)); }
  const ctx = Object.assign({}, kit.ctxFor(path.join(scratch, 'v'), { gameDir: g }), { mod: '' });
  { const v = await R.values(ctx, { id: 'riflemans(ger)', name: 'riflemans' }, { verb: 'make', pass: {} }), nl = await R.lookups.squadname(ctx, v.name, {});
    chk(v.name === 'riflemans_2' && nl.exact === false, 'the name default is a free name, not the copy\'s own', v.name);
    chk(v.display === 'Regular infantry', 'the shown name starts as the copy\'s shown name', JSON.stringify(v.display));
    chk(v.remove === false, 'remove defaults to no');
    chk((await R.lookups.squadname(ctx, 'riflemans', {})).exact === true, 'the name check refuses a name a squad of any army has'); }
  { const bl = await R.lookups.breed(ctx, 'rifle', { in: 'ger' });
    chk(Array.isArray(bl) && bl.some(x => x.id === 'ger/rifle') && bl.every(x => x.where === 'ger'), 'the members list offers soldiers of the squad\'s army', JSON.stringify(bl.slice(0, 3))); }
  { const x = mk({ name: 'pick_sq', members: ['ger/squadleader:1', 'ger/rifle:4'] }), o = opOf(x);
    chk(!x.err && (o.members || []).join(' ') === 'squadleader:1 rifle:4', 'a member picked from the list (army/name:count) is accepted', x.err || JSON.stringify(o));
    const y = mk({ name: 'pick_sq2', members: ['ger/squadleader:1', 'rus/rifle:4'] });
    chk(/army|ger/.test(y.err || ''), 'a member of another army is refused', y.err || JSON.stringify(opOf(y))); }
  { const re = new RegExp(R.groups.flatMap(g => g.q).find(q => q.id === 'ccp').limits.re), ri = new RegExp(R.groups.flatMap(g => g.q).find(q => q.id === 'cicon').limits.re);
    chk(!re.test('50') && !re.test('0.1') && re.test('12.5') && re.test('') && re.test('40') && !ri.test('3.5') && ri.test('3'), 'card fields are range checked at the question'); }
  { const raw = L.filter(r => /\.v\.class\./.test(r[0]) && r[1] === r[0].split('.').pop()).map(r => r[0]);
    chk(L.some(r => /\.v\.class\.ATTank$/.test(r[0])) && !raw.length, 'bot class choices have plain labels', raw.join()); }
  { const st = RC.steps(R, { verb: 'change', answers: { remove: { src: 'value', value: true } } }, {}).filter(s => s.kind === 'q').map(s => s.q);
    chk(st.join() === 'remove', 'on a change, remove yes hides every other question', st.join());
    const s2 = RC.steps(R, { verb: 'change', answers: {} }, { remove: false }).filter(s => s.kind === 'q').map(s => s.q);
    chk(s2[0] === 'remove' && !s2.includes('name') && s2.length > 5, 'on a change, remove is asked first and the name is not asked', s2.slice(0, 4).join()); }
  { const ids = L.filter(r => r.slice(1).some(t => /\b[A-Z]{2,5}-\d+\b/.test(t))).map(r => r[0]); chk(!ids.length, 'no limit ids inside help text', ids.join());
    const cost = L.find(r => /\.h\.cost$/.test(r[0])); chk(cost && /manpower points/.test(cost[1]), 'the price is in manpower points, as on vehicles');
    // the AS2 Quick list (the goh group is asked on the Gates of Hell tab only: card.games.test.js)
    const ess = R.groups.filter(g => g.essential).flatMap(g => g.q.filter(q => !(q.when && q.when.$game && !q.when.$game.includes('as64'))).map(q => q.id)); chk(ess.join() === 'remove,name,display,cost,members', 'Quick asks remove, name, shown name, price and members', ess.join());
    const adv = R.groups.find(g => g.q.some(q => q.id === 'content')); chk(adv && !adv.essential && adv.q.some(q => q.id === 'ccw'), 'content and the card factor sit in the advanced group'); }
  { const keys = new Set(L.map(r => r[0])), qs = R.groups.flatMap(g => g.q), mem = qs.find(q => q.id === 'members');
    chk(mem.picker.sources.join() === 'keep,exist,branch,value', 'member lines: pick, make a soldier, or type a count');
    const need = [R.test].concat(qs.map(q => q.limits && q.limits.reHint).filter(Boolean));
    chk(need.length >= 6 && need.every(k => keys.has(k)), 'the Test step text and the example hints have rows', need.filter(k => !keys.has(k)).join());
    chk(qs.filter(q => q.limits && q.limits.usual).every(q => q.limits.usual[0] >= q.limits.min && q.limits.usual[1] <= q.limits.max), 'usual ranges sit inside min and max');
    const e1 = await R.lookups.breed(ctx, 'zzqx', { in: 'ger' });
    chk(e1.why && keys.has(e1.why) && keys.has(e1.do), 'an empty soldier list says why and what to do', JSON.stringify(e1)); }
  if (!r1 || !r2 || !r3 || !r4 || !r5 || !r6 || fails.length || e.fails || a.fails || b.fails || c3.fails || d.fails) { process.exitCode = 1; console.log('FAIL'); } else console.log('PASS');
})();
