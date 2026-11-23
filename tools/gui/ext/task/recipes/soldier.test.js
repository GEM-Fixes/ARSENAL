// soldier recipe test: a new rifleman copied from ger/rifle (look, kit, skills, card, joins smgs), then a change of ger/rifle itself.
// node soldier.test.js <scratch dir>. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-f0a98a11)
'use strict';
const fs = require('fs'), path = require('path');
const kit = require('../lib/testkit');
const R = require('./soldier.recipe'), L = require('./soldier.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'task-soldier-')));
const rd = (mod, rel) => fs.readFileSync(path.join(mod, rel), 'latin1');

(async () => {
  const a = await kit.run(R, L, {
    base: { id: 'ger/rifle', name: 'rifle' },
    answers: {
      name: 'rifle_task', display: 'Task rifleman',
      skin: { src: 'exist', value: 'ger_com', name: 'ger_com' }, helmet: { src: 'exist', value: 'helmet1_ger', name: 'helmet1_ger' },
      cp: 3, health: '200%', rifle: 'lvl_3', mgun_light: 'lvl_2', melee: 'none', stealth: true, hero: true,
      inventory: ['*mp40 filled', 'ammo pistol 300', 'ammo rifle 100', 'bandage 3', 'grenade m24 1', 'sandbag_kit 1'],
      join: true, joinsquad: { src: 'exist', value: 'smgs(ger)', name: 'smgs' }, joincount: 2,
    },
    planFiles: ['resource/set/breed/mp/ger/rifle_task.set', 'resource/set/multiplayer/units/soldiers.set', 'resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      const b = rd(mod, 'resource/set/breed/mp/ger/rifle_task.set');
      ok(/\{skin "ger_com"\}/.test(b), 'skin set');
      ok(/\{head "helmet1_ger"\}/.test(b), 'helmet set');
      ok(/\{"health" "200%"/.test(b), 'health set');
      ok(/\{"rifle" lvl_3/.test(b), 'rifle skill set');
      ok(/\{"mgun_light" lvl_2/.test(b), 'light machine gun skill added');
      // HUM-15: the first weapon skill that fits the gun counts, so a skill he did not have is written before the ones he had
      ok(b.indexOf('"mgun_light"') >= 0 && b.indexOf('"mgun_light"') < b.indexOf('"rifle"'), 'the new weapon skill is written before his old one', b.slice(b.indexOf('perks'), b.indexOf('perks') + 300));
      ok(!/"melee"/.test(b), 'melee skill taken out');
      ok(/\{"stealth" \}/.test(b), 'stealth added');
      ok(/\{hero \}/.test(b), 'hero added');
      ok(/\{item "mp40" filled\}/.test(b) && /\{item "ammo pistol" 300\}/.test(b) && !/mauzer/.test(b) && !/ammo mgun/.test(b), 'kit changed');
      const items = [...b.matchAll(/\{item "([^"]+)"/g)].map(m => m[1]), hands = +(/\{in_hands (\d+)\}/.exec(b) || [])[1];
      ok(items[hands] === 'mp40', 'the mp40 is in his hands', items.join(',') + ' / ' + hands);
      const s = rd(mod, 'resource/set/multiplayer/units/soldiers.set');
      ok(/"mp\/ger\/rifle_task"/.test(s) && /\{cp\s+3\}/.test(s.slice(s.indexOf('"mp/ger/rifle_task"'))), 'card written with cp 3');
      const q = rd(mod, 'resource/set/multiplayer/units/squads.set');
      ok(/\("squad_with4types" side\(ger\) name\(smgs\)[^\n]*c4\(rifle_task:2\)/.test(q), 'joined smgs as the 4th type');
    },
  }, path.join(scratch, 'make'));
  const b = await kit.run(R, L, {
    verb: 'change',
    base: { id: 'ger/rifle', name: 'rifle' },
    // the mp40 line stands in for a gun made in a branch (its result is the gun name); a branch child is not compiled by the kit
    answers: { health: '250%', field_glass: true, rocketlauncher: 'none', kitx: ['bandage 3 dev 1'], inventory: { src: 'list', items: ['mauzer filled', 'ammo rifle 120', 'bandage 3', 'grenade m24 1', 'sandbag_kit 1', 'ammo mgun 50'].map(value => ({ src: 'value', value })).concat([{ src: 'branch', result: 'mp40' }]) } },
    planFiles: ['resource/set/breed/mp/ger/rifle.set'],
    write: true,
    after: (mod, res, ok) => {
      const t = rd(mod, 'resource/set/breed/mp/ger/rifle.set');
      ok(/\{"health" "250%"/.test(t) && /\{"field_glass" \}/.test(t) && !/rocketlauncher/.test(t), 'override has the changed perks');
      ok(/\{item "ammo rifle" 120\}/.test(t) && /\{item "mauzer" filled\}/.test(t), 'override has the changed count and keeps the rifle');
      const items = [...t.matchAll(/\{item "([^"]+)"/g)].map(m => m[1]), hands = +(/\{in_hands (\d+)\}/.exec(t) || [])[1];
      ok(/\{item "mp40" filled\}/.test(t) && items[hands] === 'mp40', 'the branch gun is in the kit and in his hands', items.join(',') + ' / ' + hands);
      ok(/\{item "bandage" 3 dev 1\}/.test(t) && (t.match(/\{item "bandage"/g) || []).length === 1, 'the spread line replaces his bandage line');
      ok(!fs.existsSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set')), 'a change leaves the cards alone');
    },
  }, path.join(scratch, 'change'));
  // branches through the real draft store: a soldier opens a new squad he joins (joinsquad, written after him), and a squad opens a
  // new soldier on a members line (written before it); both compile with both recipes
  const D = require('../lib/draft'), CP = require('../lib/compile'), RR = { soldier: R, squad: require('./squad.recipe') };
  const fails = [], chk = (c, m, x) => { console.log((c ? 'ok: ' : 'FAIL ') + m + (c ? '' : ': ' + (x || ''))); if (!c) fails.push(m); };
  const gameDir = kit.findGame({});
  try {
    const bs = path.join(scratch, 'branch'), ctx = kit.ctxFor(bs, { gameDir }), mod = path.join(bs, 'mods', 'branch_test');
    fs.mkdirSync(mod, { recursive: true });
    const lk = await R.lookups.veterancy(Object.assign({}, ctx, { mod }), '', { mod, in: 'ger', q: '' });
    const vl = (lk && lk.results) || lk || [];
    chk(vl.some(x => x.id === 'veterancy_1'), 'the veterancy lookup lists veterancy_1', JSON.stringify(vl).slice(0, 200));
    const bl = await R.lookups.breed(Object.assign({}, ctx, { mod }), 'rifle', { mod, in: 'ger', q: 'rifle' });
    chk(bl && bl.exact === true, 'the breed lookup in one army says the name is taken', JSON.stringify(bl).slice(0, 200));
    // soldier -> new squad
    const p = D.save(ctx, { id: D.newId('soldier'), recipe: 'soldier', verb: 'make', game: 'as64', mod, base: { id: 'ger/rifle', name: 'rifle' }, answers: { name: { src: 'value', value: 'rifle_br' }, join: { src: 'value', value: true }, joincount: { src: 'value', value: 3 } }, kept: [], state: 'open' });
    const jq = CP.findQ(R, 'joinsquad');
    const kid = D.child(ctx, p.id, 'joinsquad', 'squad', { pass: Object.assign({}, jq.picker.pass, await R.pass(p, 'joinsquad', ctx)) });
    chk(kid.base && /\(ger\)$/.test(kid.base.id), 'the new squad gets a ger squad to copy (its army)', JSON.stringify(kid.base));
    kid.answers.name = { src: 'value', value: 'br_squad' }; D.save(ctx, kid);
    p.answers.joinsquad = { src: 'branch', child: kid.id }; D.save(ctx, p);
    const c1 = await CP.compile(ctx, D.load(ctx, p.id), RR);
    const ops = (c1.gen && c1.gen.ops) || [], ib = ops.findIndex(o => o.op === 'breed'), iq = ops.findIndex(o => o.op === 'squad');
    chk(ib >= 0 && iq > ib, 'the soldier steps go before the new squad', ops.map(o => o.op).join(','));
    chk(iq >= 0 && (ops[iq].members || []).includes('rifle_br:3') && ops[iq].name === 'br_squad', 'the new squad takes him in with 3 men', JSON.stringify(ops[iq]));
    const pl = await CP.plan(ctx, D.load(ctx, p.id), RR);
    chk(!pl.errors.length, 'the soldier with a new squad plans with no errors', JSON.stringify(pl.errors).slice(0, 400));
    const w = await CP.write(ctx, D.load(ctx, p.id), RR);
    const sq = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/squads.set'), 'latin1');
    chk(/name\(br_squad\)[^\n]*rifle_br:3/.test(sq) || /\{"br_squad\(ger\)"[\s\S]{0,400}mp\/ger\/rifle_br:3/.test(sq),'squads.set has the new squad with him in it', w && w.errors && JSON.stringify(w.errors).slice(0, 300));
    // squad -> new soldier on a members line
    const mod2 = path.join(bs, 'mods', 'branch_test2'); fs.mkdirSync(mod2, { recursive: true });
    const s2 = D.save(ctx, { id: D.newId('squad'), recipe: 'squad', verb: 'make', game: 'as64', mod: mod2, base: { id: 'riflemans(ger)', name: 'riflemans' }, answers: { name: { src: 'value', value: 'br_squad2' } }, kept: [], state: 'open' });
    const mq = CP.findQ(RR.squad, 'members');
    const k2 = D.child(ctx, s2.id, 'members', 'soldier', { line: 2, pass: Object.assign({}, mq.picker.pass, await RR.squad.pass(s2, 'members', ctx, { line: 2 })) });
    chk(k2.base && k2.base.id === 'ger/smg', 'the new soldier copies the soldier of that line', JSON.stringify(k2.base));
    k2.answers.name = { src: 'value', value: 'smg_br' }; k2.answers.joincount = { src: 'value', value: 2 }; D.save(ctx, k2);
    s2.answers.members = { src: 'list', items: [{ src: 'value', value: 'squadleader:1' }, { src: 'value', value: 'rifle:4' }, { src: 'branch', child: k2.id }] }; D.save(ctx, s2);
    const c2 = await CP.compile(ctx, D.load(ctx, s2.id), RR);
    const o2 = (c2.gen && c2.gen.ops) || [], jb = o2.findIndex(o => o.op === 'breed'), jq2 = o2.findIndex(o => o.op === 'squad');
    chk(jb >= 0 && jq2 > jb && (o2[jq2].members || []).includes('smg_br:2'), 'a new soldier on a members line goes first and the squad lists him', o2.map(o => o.op).join(',') + ' ' + JSON.stringify(o2[jq2]));
    const pl2 = await CP.plan(ctx, D.load(ctx, s2.id), RR);
    chk(!pl2.errors.length, 'the squad with a new soldier plans with no errors', JSON.stringify(pl2.errors).slice(0, 400));
  } catch (e) { chk(false, 'the branch drafts compile', e.stack); }
  // the card, macro and kit ops on a change
  const cc = (verb, ans) => R.compile({}, { verb, base: { id: 'ger/rifle' }, gameDir, mod: '', pass: {}, value: id => ans[id], answer: id => (ans[id] === undefined ? null : { src: 'value', value: ans[id] }) });
  const tryC = (verb, ans) => { try { return { r: cc(verb, ans) }; } catch (e) { return { err: e.message }; } };
  const opsOf = x => (x.r && x.r.gen && x.r.gen.ops) || [];
  { const x = tryC('change', { cp: 7 }), o = opsOf(x).find(o => o.op === 'card') || {};
    chk(o.unit === 'mp/ger/rifle' && o.army === 'ger' && String(o.cp) === '7', 'card of an existing soldier: the card op with cp', x.err || JSON.stringify(opsOf(x))); }
  { const x = tryC('change', { veterancy: 'veterancy_2' });
    chk(opsOf(x).some(o => o.op === 'macro' && o.rename === 'veterancy_2' && o.macro === 'veterancy_1'), 'rank table of an existing soldier: macro rename', x.err || JSON.stringify(opsOf(x))); }
  { const x = tryC('change', { inventory: ['mauzer filled', 'ammo rifle 120', 'bandage 3', 'grenade m24 1', 'sandbag_kit 1'] }), k = opsOf(x).find(o => o.op === 'kit') || {};
    const del = (k.del || []).includes('ammo rifle'), add = (k.add || []).some(a => a.item === 'ammo rifle' && a.count === 120);
    chk(add && !del, 'a new count for an item he has: the kit op sets the line', x.err || JSON.stringify(k)); }
  { const was = !!R._lib.readSoldier(gameDir, '', 'ger', 'rifle').values.basic, x = tryC('change', { basic: !was }), o = opsOf(x).find(o => o.op === 'card') || {};
    chk(o.basic === !was && o.unit === 'mp/ger/rifle', 'the basic flag goes on the card op', x.err || JSON.stringify(opsOf(x))); }
  { const x = tryC('change', { cremove: true }), os = opsOf(x);
    chk(os.length === 1 && os[0].op === 'card' && os[0].remove === true, 'taking his card off the list: one card op with remove', x.err || JSON.stringify(os)); }
  { const x = tryC('change', { kitx: ['mp40 3 dev 1'] }); chk(/does not carry as copied/.test(x.err || ''), 'a spread line for an item he does not carry is refused', x.err); }
  { const x = tryC('change', { kitx: ['bandage 3 dev 9'] }); chk(/spread of bandage is 0 to its count/.test(x.err || ''), 'a spread over the count is refused', x.err); }
  // novice hazards: one check each
  const RC = require('../lib/recipe');
  { const x = tryC('change', { name: 'rifle_x', health: '250%' }), o = opsOf(x).find(o => o.op === 'breed') || {};
    chk(!x.err && (o.name || 'rifle') === 'rifle' && !opsOf(x).some(o => JSON.stringify(o).includes('rifle_x')), 'a change never renames (the name is not asked on a change)', x.err || JSON.stringify(opsOf(x))); }
  { const v = await R.values(kit.ctxFor(path.join(scratch, 'v'), { gameDir }), { id: 'ger/rifle', name: 'rifle' }, { verb: 'make', pass: {} });
    const nl = await R.lookups.breedname(Object.assign({}, kit.ctxFor(path.join(scratch, 'v'), { gameDir }), { mod: '' }), v.name, {});
    chk(v.name === 'rifle_2' && nl.exact === false, 'the name default is a free name, not the copy\'s own', v.name + ' ' + JSON.stringify(nl).slice(0, 120));
    chk(typeof v.display === 'string' && v.display.trim() !== '' && !/[<>]/.test(v.display), 'the shown name starts as the copy\'s shown name', JSON.stringify(v.display));
    chk(v.cremove === false && v.join === false, 'remove and join default to no', JSON.stringify({ c: v.cremove, j: v.join }));
    const vs = await R.values(kit.ctxFor(path.join(scratch, 'v'), { gameDir }), { id: 'ger/rifle', name: 'rifle' }, { verb: 'make', pass: { for: 'squad' } });
    chk(vs.join === true, 'a soldier made for a squad line joins by default'); }
  { const ctx = Object.assign({}, kit.ctxFor(path.join(scratch, 'v'), { gameDir }), { mod: '' });
    const t = await R.lookups.breedname(ctx, 'rifle', {}); chk(t.exact === true, 'the name check refuses a name a soldier of any army has');
    const ki = await R.lookups.kititem(ctx, 'ammo rifle', {}); const kl = (ki && ki.results) || ki || [];
    chk(kl.length > 0 && kl.every(x => /^[a-z0-9_ ]+ (filled|\d+)$/i.test(x.id)), 'the kit list offers game kit lines', JSON.stringify(kl.slice(0, 3)));
    const sq = await R.lookups.squad(ctx, '', { in: 'ger' }); chk(Array.isArray(sq) && sq.length > 0 && sq.every(x => /\(ger\)$/.test(x.id)), 'the squad list holds squads of his army only'); }
  { const st = RC.steps(R, { verb: 'change', answers: { cremove: { src: 'value', value: true } } }, {}).filter(s => s.kind === 'q').map(s => s.q);
    chk(st.join() === 'cremove', 'on a change, remove yes hides every other question', st.join());
    const s2 = RC.steps(R, { verb: 'change', answers: {} }, { cremove: false, join: false }).filter(s => s.kind === 'q').map(s => s.q);
    chk(s2[0] === 'cremove' && s2.length > 10 && !s2.includes('name'), 'on a change, remove is asked first and the name is not asked', s2.slice(0, 4).join());
    const s3 = RC.steps(R, { verb: 'make', answers: {} }, { cremove: false, join: false }).filter(s => s.kind === 'q').map(s => s.q);
    chk(!s3.includes('cremove') && !s3.includes('joinsquad') && !s3.includes('joincount') && s3.includes('join'), 'join no hides the squad and count questions', s3.join()); }
  { const x = tryC('make', { name: 'rifle_nojoin', join: false, joinsquad: 'smgs(ger)', joincount: 3 });
    chk(!x.err && !opsOf(x).some(o => o.op === 'squad'), 'a squad answer under join no writes nothing', x.err || JSON.stringify(opsOf(x).map(o => o.op))); }
  { const ids = L.filter(r => r.slice(1).some(t => /\b[A-Z]{2,5}-\d+\b/.test(t))).map(r => r[0]);
    chk(!ids.length, 'no limit ids inside help text', ids.join()); }
  { const ess = R.groups.filter(g => g.essential).flatMap(g => g.q.filter(q => !(q.when && q.when.$game && !q.when.$game.includes('as64'))).map(q => q.id));
    chk(ess.join() === 'cremove,name,display,cp', 'Quick asks remove, name, shown name and the card cp', ess.join()); }
  { const keys = new Set(L.map(r => r[0])), qs = R.groups.flatMap(g => g.q), inv = qs.find(q => q.id === 'inventory');
    chk(inv.picker.sources.join() === 'keep,exist,branch,value', 'kit lines: pick, make a gun, or type a count');
    const need = [R.test].concat(qs.map(q => q.limits && q.limits.reHint).filter(Boolean));
    chk(need.length >= 4 && need.every(k => keys.has(k)), 'the Test step text and the example hints have rows', need.filter(k => !keys.has(k)).join());
    chk(qs.filter(q => q.limits && q.limits.usual).every(q => q.limits.usual[0] >= q.limits.min && q.limits.usual[1] <= q.limits.max), 'usual ranges sit inside min and max');
    const ctx = Object.assign({}, kit.ctxFor(path.join(scratch, 'v'), { gameDir }), { mod: '' }), e1 = await R.lookups.kititem(ctx, 'zzqx', {}), e2 = await R.lookups.squad(ctx, 'zzqx', { in: 'ger' });
    chk(e1.why && keys.has(e1.why) && keys.has(e1.do) && e2.why && keys.has(e2.do), 'an empty kit or squad list says why and what to do', JSON.stringify([e1, e2])); }
  if (a.fails || b.fails || fails.length) { process.exitCode = 1; console.log('FAIL'); } else console.log('PASS');
})();
