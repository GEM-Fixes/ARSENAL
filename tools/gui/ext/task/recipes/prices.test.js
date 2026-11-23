// recipe "prices" test: node prices.test.js <scratch>. Direct checks first, one per novice hazard: the questions of this army and the
// money rules of every army are apart and say so, the card filter is asked only for a rule, a filter that picks nothing is refused in
// plain words, the set value and the table start as the cards have them (a table left as it is changes nothing), command points and the
// cooldown factor are one number, the highest money is at least the lowest, and Review names every army for the money rules.
// Then five fixture drafts on the stock army rus, each written for real into its own scratch mod and read back: 10% dearer on every
// card (units page armyprice, one call), 10% dearer on manpower cards to a step of 10 (Balance page), a co-op list rank plus a money
// rule (gen card list and preset ops), a table (gen card op and the Balance page), cooldown by percent on one tab (Balance page).
// Author: Imperator_Aug (ARSENAL, ia-734e4e49)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-prices-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./prices.recipe'), L = require('./prices.lang');
const U = 'resource/set/multiplayer/units/';
const rd = (mod, rel) => { try { return fs.readFileSync(path.join(mod, rel), 'latin1'); } catch (e) { return ''; } };
const line = (t, re) => (t.split(/\r?\n/).find(l => re.test(l)) || '');

(async () => {
  const r = [];
  // direct checks
  {
    let fails = 0, passes = 0;
    const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } else passes++; };
    const G = id => R.groups.find(g => g.id === id), Q = id => { for (const g of R.groups) for (const q of g.q) if (q.id === id) return q; return null; };
    const en = k => (L.find(x => x[0] === k) || [])[1] || '';
    ok(/every army/i.test(en(G('economy').title)) && G('economy').essential === false, 'the money rules group says every army and is not essential', en(G('economy').title));
    ok(/this army only/i.test(en(G('how').title)) && /this army only/i.test(en(G('points').title)), 'the card groups say this army only');
    for (const q of G('economy').q) ok(/^This changes every army/.test(en(q.help)), q.id + ': the help says every army', en(q.help));
    for (const g of ['how', 'points']) for (const q of G(g).q) ok(/^Only this army/.test(en(q.help)), q.id + ': the help says only this army', en(q.help));
    for (const id of ['kind', 'tab', 'res']) ok(Array.isArray(Q(id).when.how) && !Q(id).when.how.includes('table'), id + ': not asked for a table (the table names its cards)');
    ok(Q('commandpoints').kind === 'number' && Q('chargefactors').kind === 'number', 'command points and the cooldown factor are one number, not a tag list');
    ok(Q('setfore').help === 'task.prices.h.setfore' && /first purchase/.test(en('task.prices.h.setfore')) && /first purchase/.test(en('task.prices.h.addfore')), 'the head start says what its numbers mean');
    ok(R.test === 'task.prices.test' && /buy menu/.test(en('task.prices.test')), 'the Test step says what to look at in the buy menu');
    ok(['round', 'percent', 'factor', 'cppct', 'commandpoints', 'chargefactors', 'growtime'].every(id => Array.isArray(Q(id).limits.usual)), 'soft ranges on the numbers that have a usual range');
    ok(!L.some(r => r.slice(1).some(s => /\b(bots|units|maps|doctrine|logs|art|files|help|fix) page\b/.test(s))), 'page names as the GUI shows them');
    ok(!Q('table') &&['cost', 'level', 'charge', 'fore', 'wait'].every(f => Q('table' + f)), 'one table per field');
    const gameDir = kit.findGame({}), dctx = kit.ctxFor(path.join(scratch, 'direct'), { gameDir });
    if (!gameDir) console.log('note: SKIP direct game checks: no game folder');
    else {
      const mod = path.join(scratch, 'direct', 'mods', 'prices_direct'); fs.mkdirSync(mod, { recursive: true });
      const v = x => ({ src: 'value', value: x });
      const save = answers => { const a = {}; for (const [k, x] of Object.entries(answers)) a[k] = v(x); return D.save(dctx, { id: D.newId('prices'), recipe: 'prices', verb: 'change', game: 'as64', mod, base: { id: 'rus' }, answers: a, kept: [], state: 'open' }); };
      const comp = answers => CP.compile(dctx, save(answers), { prices: R });
      const refuse = async (answers, re, m) => { let e = null; try { await comp(answers); } catch (x) { e = x; } ok(e && re.test(e.message), m, e ? e.message : 'no refusal'); };
      const vals = await R.values(dctx, { id: 'rus' });
      ok(typeof vals.setcost === 'number' && vals.setcost > 0, 'set starts at the price most rus cards have', vals.setcost);
      ok(Array.isArray(vals.tablecost) && vals.tablecost.some(s => /^m72 \d+$/.test(s)) && vals.tablecost.some(s => /^smgs\(rus\) \d+$/.test(s)), 'the price table starts with every rus card and its price', (vals.tablecost || []).slice(0, 4).join(' | '));
      ok(vals.commandpoints === undefined, 'command points start at keep (the stock "*=%cp" is the lobby\'s own number)', vals.commandpoints);
      ok(vals.chargefactors === undefined || typeof vals.chargefactors === 'number', 'the cooldown factor starts as one number or keep', vals.chargefactors);
      const same = await comp({ how: 'table', tablecost: vals.tablecost });
      ok(!same.gen && !same.calls.length && same.notes.some(n => /nothing to change/i.test(n)), 'a table left as it was filled changes nothing', JSON.stringify(same.notes));
      await refuse({ kind: 'squad', tab: 'v1', how: 'pct', percent: 10 }, /v1 tab holds no squads/, 'squads on a vehicle tab are refused in plain words');
      await refuse({ kind: 'vehicle', tab: 'squad1', how: 'pct', percent: 10 }, /squad1 tab holds no vehicles/, 'vehicles on an infantry tab are refused in plain words');
      await refuse({ limitmin: 5000, limitmax: 1000 }, /at least the lowest/, 'a highest money below the lowest is refused');
      const money = await comp({ growtime: 1800 });
      const every = money.notes.find(n => /^Every army \(/.test(n)) || '';
      ok(/\bger\b/.test(every) && /\brus\b/.test(every) && /\busa\b/.test(every) && /presets_all\.inc/.test(every), 'Review names every army and the file for a money rule', every);
      ok(!money.notes.some(n => /^Only rus/.test(n)), 'a money rule alone says nothing about rus cards');
      const cards = await comp({ how: 'pct', percent: 10 });
      ok(cards.notes.some(n => /^Only rus/.test(n)) && !cards.notes.some(n => /^Every army/.test(n)), 'a price change says only rus', JSON.stringify(cards.notes));
      const cp = await comp({ commandpoints: 150 });
      const op = cp.gen && cp.gen.ops.find(o => o.op === 'preset');
      ok(op && op.set.commandPoints === '=*=150' && cp.notes.some(n => /lobby's own number/.test(n)), 'command points 150 for every unit, Review says the lobby number is replaced', JSON.stringify(op) + ' ' + JSON.stringify(cp.notes));
    }
    console.log(passes + ' passed, ' + fails + ' failed');
    r.push({ passes, fails });
  }
  r.push(await kit.run(R, L, {
    base: { id: 'rus' }, answers: { field: 'cost', how: 'pct', percent: 10 }, write: true,
    after: (mod, res, ok) => {
      const ap = (res.calls || []).filter(x => x.route === 'POST /api/x/units/armyprice');
      ok(ap.length === 1 && ap[0].ok === true && !(res.calls || []).some(x => x.route === 'POST /api/x/balance/change'), 'one army wide units page call, no Balance page call', JSON.stringify((res.calls || []).map(x => [x.route, x.ok])));
      const ids = ap[0] && ap[0].result && ap[0].result.rows ? ap[0].result.rows.map(x => x.id) : [];
      ok(ids.includes('storm_mech_rus') && ids.includes('how_a(rus)'), 'storm_mech_rus and how_a(rus) are priced too', ids.slice(0, 40).join(' '));
      ok(/\{cost 90\}/.test(line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/)), 'm72 costs 90 (80 and 10%, to a step of 5)', line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/));
    },
  }, path.join(scratch, 'wide')));
  r.push(await kit.run(R, L, {
    base: { id: 'rus' }, answers: { res: 'mp', field: 'cost', round: 10, how: 'pct', percent: 10 }, write: true,
    after: (mod, res, ok) => {
      ok(/\{cost 90\}/.test(line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/)), 'm72 costs 90 (80 and 10%, to a step of 10)', line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/));
      ok(/cost\(70\)/.test(line(rd(mod, U + 'squads.set'), /side\(rus\)[^\r\n]*name\(home_guards\)/)), 'home_guards cost 70 (60 and 10%, to a step of 10)', line(rd(mod, U + 'squads.set'), /side\(rus\)[^\r\n]*name\(home_guards\)/));
    },
  }, path.join(scratch, 'pct')));
  r.push(await kit.run(R, L, {
    base: { id: 'rus' }, answers: { tab: 'v1', list: 'cooperative', field: 'level', how: 'set', setlevel: 3, scope: 'standard_all', growtime: 1800, commandpoints: 150 },
    planFiles: [U + 'cooperative.set', 'resource/set/multiplayer/games/presets_all.inc'], write: true,
    after: (mod, res, ok) => {
      ok(/\{level 3\}/.test(line(rd(mod, U + 'cooperative.set'), /\{\s*"m72"/)), 'the co-op list has m72 at rank 3', line(rd(mod, U + 'cooperative.set'), /\{\s*"m72"/));
      ok(!fs.existsSync(path.join(mod, U + 'vehicles_rus.set')), 'the multiplayer list is not touched');
      const p = rd(mod, 'resource/set/multiplayer/games/presets_all.inc');
      ok(/growTime\s+1800/.test(p) && /growTime\s+1500/.test(p), 'standard_all grows in 1800 s, custom_all stays 1500');
      ok(/commandPoints\s+"\*=150"/.test(p) && /commandPoints\s+"\*=%cp"/.test(p), 'standard_all has 150 command points, custom_all keeps the lobby\'s own number');
    },
  }, path.join(scratch, 'coop')));
  r.push(await kit.run(R, L, {
    base: { id: 'rus' }, answers: { field: 'cost', how: 'table', tablecost: ['m72 95', 'smgs(rus) 120'] }, write: true,
    after: (mod, res, ok) => {
      ok(/\{cost 95\}/.test(line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/)), 'm72 costs 95 from the table');
      ok(/cost\(120\)/.test(line(rd(mod, U + 'squads.set'), /side\(rus\)[^\r\n]*name\(smgs\)/)), 'smgs(rus) costs 120 from the table', line(rd(mod, U + 'squads.set'), /side\(rus\)[^\r\n]*name\(smgs\)/));
    },
  }, path.join(scratch, 'table')));
  r.push(await kit.run(R, L, {
    base: { id: 'rus' }, answers: { kind: 'vehicle', tab: 'v1', field: 'charge', how: 'pct', percent: 50, cppct: 0 }, write: true,
    after: (mod, res, ok) => {
      ok(/c\(90\)/.test(line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/)), 'm72 cooldown 90 s (60 and 50%)', line(rd(mod, U + 'vehicles_rus.set'), /\{\s*"m72"/));
    },
  }, path.join(scratch, 'charge')));
  const f = r.reduce((n, x) => n + x.fails, 0);
  console.log('prices: ' + r.map(x => x.passes + '/' + (x.passes + x.fails)).join(', '));
  console.log(f ? 'FAIL' : 'PASS');
  if (f) process.exitCode = 1;
})();
