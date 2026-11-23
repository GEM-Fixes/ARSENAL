// bots part "buycheck" test. Arg: scratch dir. No game, no network: a fake AS2 install (stock bot list from the botrecipe chainn3 fixture,
// a units set with every card it names) and a fake mod seeded with each of the seven defects. Asserts each is found, each fix preview is
// exact, writes keep CRLF and the bytes around the change, a second check after the writes is clean; GoH runs only 5 and 6; the client
// runs in tools/gui/test/fakedom.js with stub BOTS_PARTS and env. Prints FAIL lines, exit 1 on failure.
// Author: Imperator_Aug (ARSENAL, ia-a5a8c560)
'use strict';
const fs = require('fs'), path = require('path');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'buycheck-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), C = require('./check'), S = require('./scan');
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b));
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };
const crlf = a => a.join('\r\n') + '\r\n';
const R = X.routes, U = q => ({ searchParams: new URLSearchParams(q) });

// ---- fake AS2 install: stock bot list, a units set with every card the stock names (+ the cards the seeds use), stock presets
const STOCK = fs.readFileSync(path.join(T, 'botrecipe', 'test', 'chainn3', 'stock', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
const game = path.join(work, 'game'), GR = (...p) => path.join(game, 'resource', ...p);
W(path.join(game, 'as64.exe'), '');
W(GR('script', 'multiplayer', 'bot.data.lua'), STOCK);
const names = [...new Set([...STOCK.matchAll(/unit = "([^"]+)"/g)].map(m => m[1]))].concat(['t34', 'is2']);
// cards of any army (no _army suffix: the stock lists hold them in every army), German-only cards (the army check), squads by side()
W(GR('set', 'multiplayer', 'units', 'all.set'), crlf(['{units'].concat(names.map(u => { const m = /^(.+)\(([^()]+)\)$/.exec(u); return m ? '\t("squad" name(' + m[1] + ') side(' + m[2] + ') c(30))' : '\t{"' + u + '" (cost 100)}'; }), ['}'])));
const VGEN = crlf(['{easy', '\t{balancingFactorBonus {cp 0.75} {mp 0.75} {payback 0.75} }', '\t{chargeFactors', '\t\t{value "*=0"}', '\t}', '}', '{hard', '\t{balancingFactorBonus {cp 1.25} {mp 1.50} {payback 1.50} }', '\t{chargeFactors', '\t\t{value "*=0.5"}', '\t}', '}']);
W(GR('set', 'multiplayer', 'games', 'bots_generic.inc'), VGEN);
const VPRE = crlf(['(define "test_all"', '\t{common', '\t\t{balancingFactorBonus {cp 1.0} {mp 1.0} }', '\t\t{budgets', '\t\t\t{vehicle {start 100}}', '\t\t\t{infantry {start 100}}', '\t\t}', '\t}', '\t{bots', '\t\t(include "bots_generic.inc")', '\t}', ')']);
W(GR('set', 'multiplayer', 'games', 'presets_test.inc'), VPRE);
const GERONLY = ['tiger', 'tiger_e'].concat(Array.from({ length: 9 }, (_, i) => 'gt' + (i + 1)));
W(GR('set', 'multiplayer', 'units', 'tanks_ger.set'), crlf(['{units'].concat(GERONLY.map(u => '\t{"' + u + '" (cost 100)}'), ['}'])));
W(GR('interface', 'text', 'desc.lng'), crlf(['{tags', '{entity', '{pz4h "Panzer IV H"}', '{tiger_e "Tiger E"}', '}', '}']));   // in-game names (desc/entity/<card>)
// the lobby name of an army: armies/<id>.set {title} worded by #dlg_mp.lng
W(GR('set', 'multiplayer', 'armies', 'eng.set'), crlf(['{army', '\t{title "mp/army/eng"}', '}']));
W(GR('interface', 'text', '#dlg_mp.lng'), crlf(['{tags', '{mp', '{army', '{eng "Commonwealth Forces"}', '}', '}', '}']));
const ctx = { game: () => game, tools: T, tmpRoot: work };
const noGame = { game: () => null, tools: T, tmpRoot: work };

// ---- fake mod, seeded: 1 pz4x (no card, 2 places) 2 rus missing in stage 2 3 AttackBaseTime + period 4 cost key, no Repeat 0 stage
// 5 hard without chargeFactors 6 common budgets without vehicle 7 Subscribe before require of bot.lua
const mod = path.join(work, 'mod'), MR = (...p) => path.join(mod, 'resource', ...p); modInfo(mod);
const L = ['MaxSquadSize = 5', 'AttackBaseTime = 5', 'OrderRotationPeriod = 3 * 60 * 1000 -- 3min (ms)', 'FlagPriority = { Captured = 1, Enemy = 2, Neutral = 3 }',
  'UnitClass = {', '\tInfantry = "infantry",', '\tTank = "tank",', '}', 'Purchases = {',
  '\t{--purchase 1', '\t\tRepeat = 1,', '\t\tUnits = {',
  '\t\t\t["ger"] = {--Germany', '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(ger)"},', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"}', '\t\t\t},',
  '\t\t\t["rus"] = {--Soviet Union', '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(rus)"}, -- \xe0\xe1 cp1251 comment', '\t\t\t\t{priority = 1.0, period = "44", class = UnitClass.Tank, unit = "t34"}', '\t\t\t}',
  '\t\t}', '\t},',
  '\t{--purchase 2', '\t\tRepeat = 1,', '\t\tUnits = {',
  '\t\t\t["ger"] = {--Germany', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"},', '\t\t\t\t{priority = 1.0, cost = 3, class = UnitClass.Tank, unit = "tiger"}', '\t\t\t}',
  '\t\t}', '\t},',
  '\t{--purchase 3', '\t\tRepeat = 2,', '\t\tUnits = {',
  '\t\t\t["ger"] = {--Germany', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tiger"}', '\t\t\t},',
  '\t\t\t["rus"] = {--Soviet Union', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "is2"}', '\t\t\t}',
  '\t\t}', '\t}', '}'];
const BOT = MR('script', 'multiplayer', 'bot.data.lua'), GEN = MR('set', 'multiplayer', 'games', 'bots_generic.inc'), PRE = MR('set', 'multiplayer', 'games', 'presets_test.inc'), SUB = MR('script', 'multiplayer', 'mybot.lua');
W(BOT, crlf(L));
const GEN0 = crlf(['{easy', '\t{balancingFactorBonus {cp 0.75} {mp 0.75} {payback 0.75} }', '\t{chargeFactors', '\t\t{value "*=0"}', '\t}', '}', '{hard', '\t{balancingFactorBonus {cp 1.25} {mp 1.50} {payback 1.50} }', '}']);
W(GEN, GEN0);
W(PRE, VPRE.replace('\t\t\t{vehicle {start 100}}\r\n', ''));
W(SUB, 'BotApi.Events:Subscribe(BotApi.Events.Quant, function()\r\n\tprint("tick")\r\nend)\r\nrequire([[/script/multiplayer/bot]])\r\n');
const ln = s => L.indexOf(s) + 1;   // line of a seed line in the bot list as written
let fixR2 = null, MIXTXT = null;

(async () => {
  // ---- contract
  ok(X.id === 'buycheck' && X.group === 'A' && X.order === 10 && typeof X.script === 'string', 'part shape');
  ok(Object.keys(X.routes).every(k => /^(GET|POST) \/api\/x\/bots\/buycheck\//.test(k)), 'routes under /api/x/bots/buycheck/');
  ok(!/`|\$\{/.test(X.script) && /BOTS_PARTS\.push\(/.test(X.script), 'client page rules (no backtick, no dollar-brace) and BOTS_PARTS.push');
  ok(X.lang.every(r => r.length === 5 && r[0].startsWith('bots.buycheck.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'lang rows [key,en,ru,uk,zh] under bots.buycheck.');
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const r of X.lang) ok(r.slice(2).every(s => ph(s) === ph(r[1])), 'placeholders the same in every language: ' + r[0]);
  ok(new Set(X.lang.map(r => r[0])).size === X.lang.length, 'lang keys unique');

  // ---- first check: each seeded defect found
  const r1 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  const by = id => r1.problems.find(p => p.id === id);
  ok(!r1.clean && !r1.goh && r1.from === 'mod' && !r1.skipped.length, 'first check: problems, AS2, list from the mod, nothing skipped ' + JSON.stringify(r1.skipped));
  const u = by('unit|pz4x');
  ok(u && u.check === 1 && u.lim === 'MIS-32' && u.p.n === 2 && JSON.stringify(u.lines) === JSON.stringify([15, 27]) && u.file === 'resource/script/multiplayer/bot.data.lua', '1 MIS-32 pz4x found in 2 places ' + JSON.stringify(u));
  ok(!r1.problems.some(p => p.id === 'unit|tiger' || p.id === 'unit|smgs(ger)'), '1 real cards (plain and squad name(side)) not flagged');
  const a = by('army|2|rus');
  ok(a && a.check === 2 && a.lim === 'MIS-09' && a.line === ln('\t{--purchase 2') && a.fixes.map(f => f.how).join() === 'copy,empty' && a.fixes[0].p.from === 1, '2 MIS-09 rus missing in stage 2, copy from stage 1 ' + JSON.stringify(a));
  const d = by('dead');
  ok(d && d.check === 3 && d.p.n === 2 && JSON.stringify(d.lines) === JSON.stringify([2, ln('\t\t\t\t{priority = 1.0, period = "44", class = UnitClass.Tank, unit = "t34"}')]) && d.fixes.length === 1, '3 AI-15 dead keys found ' + JSON.stringify(d));
  const k = by('key|cost'), st = by('nostay');
  ok(k && k.check === 4 && k.lim === 'MIS-80' && k.line === ln('\t\t\t\t{priority = 1.0, cost = 3, class = UnitClass.Tank, unit = "tiger"}'), '4 MIS-80 unread entry key found ' + JSON.stringify(k));
  ok(!by('key|period'), '4 period is check 3, not an MIS-80 row too');
  ok(st && st.check === 4 && st.lim === 'MIS-84' && st.line === ln('\t\tRepeat = 2,') && st.fixes[0].how === 'stay', '4 MIS-84 no Repeat 0 stage found ' + JSON.stringify(st));
  const ch = r1.problems.find(p => p.check === 5);
  ok(ch && ch.lim === 'MIS-02' && ch.p.entry === 'hard' && ch.file === 'resource/set/multiplayer/games/bots_generic.inc' && ch.line === 7 && ch.from === 'mod', '5 MIS-02 hard without chargeFactors ' + JSON.stringify(ch));
  const bu = r1.problems.find(p => p.check === 6);
  ok(bu && bu.lim === 'MIS-05' && bu.file === 'resource/set/multiplayer/games/presets_test.inc' && bu.line === 4 && !bu.fixes.length, '6 MIS-05 budgets without vehicle (report) ' + JSON.stringify(bu));
  const sb = r1.problems.find(p => p.check === 7);
  ok(sb && sb.lim === 'AI-22' && sb.code === 'BOT_SUBSCRIBE_BEFORE_REQUIRE' && sb.file === 'resource/script/multiplayer/mybot.lua' && sb.line === 1 && !sb.fixes.length, '7 AI-22 Subscribe before require (report) ' + JSON.stringify(sb));
  eq(r1.problems.map(p => p.check).sort().join(), '1,2,3,4,4,5,6,7', 'exactly the seeded problems');

  // ---- a unit listed twice in the same army list of one stage: a plain row, Remove-duplicate with Preview, Write and Undo
  {
    const md = path.join(work, 'mod-dup'), DB = path.join(md, 'resource', 'script', 'multiplayer', 'bot.data.lua'); modInfo(md);
    const D = L.slice(); D.splice(13, 0, '\t\t\t\t{priority = 2.0, class = UnitClass.Infantry, unit = "smgs(ger)"},');   // smgs(ger) now on lines 14 and 15 of stage 1 ger
    W(DB, crlf(D)); const d0 = fs.readFileSync(DB);
    const rd = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(md)), null, ctx);
    const dr = (rd.problems || []).filter(p => p.msg === 'dup');
    ok(dr.length === 1 && dr[0].code === 'BOT_UNIT_TWICE' && dr[0].p.unit === 'smgs(ger)' && dr[0].p.stage === 1 && dr[0].p.army === 'ger' && dr[0].p.n === 2 && dr[0].lines.join() === '14,15' && dr[0].fixes.length === 1 && dr[0].fixes[0].how === 'dedupe',
      'duplicate: one row for the unit listed twice in stage 1 ger ' + JSON.stringify(dr));
    ok(!(r1.problems || []).some(p => p.msg === 'dup'), 'duplicate: the same unit in two stages (pz4x) is no duplicate');
    const dp = await R['POST /api/x/bots/buycheck/fix'](null, { mod: md, id: dr[0] && dr[0].id, how: 'dedupe' }, ctx);
    eq(dp.hunks, [{ line: 15, was: ['\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(ger)"},'], now: [] }], 'duplicate: the preview removes the second line only');
    eq((dp.plain || []).map(x => x.k + ' ' + x.p.stage + ' ' + x.p.army + ' ' + x.p.n), ['dedupe 1 ger 1'], 'duplicate: one plain sentence');
    ok(fs.readFileSync(DB).equals(d0), 'duplicate: a preview writes nothing');
    const dw = await R['POST /api/x/bots/buycheck/fix'](null, { mod: md, id: dr[0].id, how: 'dedupe', write: true }, ctx);
    const after = fs.readFileSync(DB, 'latin1');
    ok(dw.written && (after.match(/unit = "smgs\(ger\)"/g) || []).length === 1 && /priority = 2\.0, class = UnitClass\.Infantry, unit = "smgs\(ger\)"/.test(after) && !/[^\r]\n/.test(after), 'duplicate: written, the first line kept, CRLF kept');
    const rd2 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(md)), null, ctx);
    ok(!(rd2.problems || []).some(p => p.msg === 'dup'), 'duplicate: gone after the fix');
    await R['POST /api/x/bots/buycheck/undo'](null, { mod: md, rel: C.BOTDATA }, ctx);
    ok(fs.readFileSync(DB).equals(d0), 'duplicate: Undo puts the list back byte for byte');
    for (const k of ['msg.dup', 'fix.dedupe', 'pv.dedupe']) for (let i = 1; i <= 4; i++) ok(require('./lang').some(r => r[0] === 'bots.buycheck.' + k && r[i]), 'duplicate: ' + k + ' worded in language ' + i);
  }

  // ---- previews, exact
  const fixR = (id, how, value, write) => R['POST /api/x/bots/buycheck/fix'](null, { mod, id, how, value, write: !!write }, ctx);
  fixR2 = (m, id, how, write) => R['POST /api/x/bots/buycheck/fix'](null, { mod: m, id, how, write: !!write }, ctx);
  const before = fs.readFileSync(BOT, 'latin1');
  const pr = await fixR('unit|pz4x', 'remove');
  eq(pr.hunks, [{ line: 15, was: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"}'], now: [] }, { line: 27, was: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"},'], now: [] }], '1 remove preview');
  ok(fs.readFileSync(BOT, 'latin1') === before, 'a preview writes nothing');
  const e1 = await fixR('unit|pz4x', 'replace', 'pz4nope');
  ok(e1.ok === false && e1.code === 'noCard' && e1.args.v === 'pz4nope', '1 replace refuses a name that is no card, as a code the page words ' + JSON.stringify(e1));
  eq(pr.plain.map(x => x.k + ' ' + x.p.stage + ' ' + x.p.army), ['remove 1 ger', 'remove 2 ger'], '1 remove: one plain sentence per place (the confirm count = 2)');
  const pe = await fixR('army|2|rus', 'empty');
  eq(pe.hunks, [{ line: 29, was: ['\t\t\t}'], now: ['\t\t\t},'] }, { line: 30, was: ['\t\t}'], now: ['\t\t\t["rus"] = {},', '\t\t}'] }], '2 empty-list preview');

  // ---- writes (each preview checked exact first), in an order where each fix sees the text the last one left
  const step = async (id, how, value, want, label) => {
    const p = await fixR(id, how, value); eq(p.hunks, want, label + ' preview');
    const w = await fixR(id, how, value, true); ok(w.written && (w.target === BOT || w.target === GEN), label + ' written into the mod');
    return w;
  };
  await step('dead', 'dead', null, [{ line: 2, was: ['AttackBaseTime = 5'], now: [] }, { line: 19, was: ['\t\t\t\t{priority = 1.0, period = "44", class = UnitClass.Tank, unit = "t34"}'], now: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "t34"}'] }], '3 dead keys');
  await step('key|cost', 'key', null, [{ line: 27, was: ['\t\t\t\t{priority = 1.0, cost = 3, class = UnitClass.Tank, unit = "tiger"}'], now: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tiger"}'] }], '4 unread key');
  await step('nostay', 'stay', null, [{ line: 32, was: ['\t\tRepeat = 2,'], now: ['\t\tRepeat = 0,'] }], '4 last stage Repeat 0');
  await step('unit|pz4x', 'replace', 'pz4h', [{ line: 14, was: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"}'], now: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4h"}'] }, { line: 26, was: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4x"},'], now: ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "pz4h"},'] }], '1 replace with a real card');
  const b0 = fs.readFileSync(BOT);
  const wc = await step('army|2|rus', 'copy', null, [{ line: 28, was: ['\t\t\t}'], now: ['\t\t\t},'] },
    { line: 29, was: ['\t\t}'], now: ['\t\t\t["rus"] = {--Soviet Union', '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(rus)"}, -- \xe0\xe1 cp1251 comment', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "t34"}', '\t\t\t},', '\t\t}'] }], '2 copy the nearest stage');
  ok(wc.plain.length === 1 && wc.plain[0].k === 'copy' && wc.plain[0].p.n === 2 && wc.rel === C.BOTDATA && wc.undo, '2 copy: one plain sentence (2 units from stage 1), undo offered ' + JSON.stringify(wc.plain));
  // Undo: the exact bytes from before the write; a second Undo has nothing; a file changed by hand since is refused and left alone
  const b1 = fs.readFileSync(BOT), UN = b => R['POST /api/x/bots/buycheck/undo'](null, Object.assign({ mod }, b), ctx);
  const un = await UN({ rel: C.BOTDATA });
  ok(un.ok && un.restored && !un.removed && Buffer.compare(fs.readFileSync(BOT), b0) === 0, 'undo puts back the exact bytes ' + JSON.stringify(un));
  const un2 = await UN({ rel: C.BOTDATA });   // one step (local undo) or the step before (the frame's undo keeps several)
  ok((un2.ok === false && un2.code === 'undoNone') || (un2.ok && un2.restored && typeof un2.left === 'number' && un2.left === un.left - 1), 'a second undo: nothing to undo, or the step before ' + JSON.stringify(un2));
  await fixR('army|2|rus', 'copy', null, true); fs.appendFileSync(BOT, '-- by hand\r\n');
  const un3 = await UN({ rel: C.BOTDATA });
  ok(un3.ok === false && un3.code === 'undoChanged' && fs.readFileSync(BOT, 'latin1').endsWith('-- by hand\r\n'), 'undo refuses a file changed since, and leaves it ' + JSON.stringify(un3));
  fs.writeFileSync(BOT, b1);
  const un4 = await UN({ rel: '../../x.lua' });
  ok(un4.ok === false && un4.code === 'badFile', 'undo only for the files this card writes');
  await step(ch.id, 'charge', null, [{ line: 8, was: ['\t{balancingFactorBonus {cp 1.25} {mp 1.50} {payback 1.50} }'], now: ['\t{balancingFactorBonus {cp 1.25} {mp 1.50} {payback 1.50} }', '\t{chargeFactors', '\t\t{value "*=0.5"}', '\t}'] }], '5 chargeFactors (the game\'s value for that entry)');

  // the whole file after the writes: exactly the seeds undone, CRLF everywhere, the cp1251 byte kept
  const want = L.filter(l => l !== 'AttackBaseTime = 5').map(l => l.replace(', period = "44"', '').replace(', cost = 3', '').replace('Repeat = 2', 'Repeat = 0').replace('"pz4x"', '"pz4h"'));
  const at2 = want.indexOf('\t{--purchase 2'), close = want.indexOf('\t\t}', at2);
  want[close - 1] = '\t\t\t},';
  want.splice(close, 0, '\t\t\t["rus"] = {--Soviet Union', '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(rus)"}, -- \xe0\xe1 cp1251 comment', '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "t34"}', '\t\t\t},');
  const got = fs.readFileSync(BOT, 'latin1');
  ok(got === crlf(want), 'bot list after the writes is the seeds undone, CRLF and bytes kept:\n' + got);
  ok(fs.readFileSync(GEN, 'latin1') === GEN0.replace('{payback 1.50} }\r\n}', '{payback 1.50} }\r\n\t{chargeFactors\r\n\t\t{value "*=0.5"}\r\n\t}\r\n}'), 'bots_generic after the write');
  ok(!/[^\r]\n/.test(got) && !/[^\r]\n/.test(fs.readFileSync(GEN, 'latin1')), 'CRLF kept');

  // ---- second check: only the report-only rows (6, 7) are left; without those seeds the check is clean
  const r2 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  eq(r2.problems.map(p => p.check).sort().join(), '6,7', 'second check: the fixable ones are gone');
  W(PRE, VPRE); fs.rmSync(SUB);
  const r3 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(r3.clean && !r3.problems.length, 'clean after the report-only seeds are gone ' + JSON.stringify(r3.problems));
  const e2 = await fixR('unit|pz4x', 'remove');
  ok(e2.ok === false && e2.code === 'gone', 'a fix of a problem that is gone is refused');

  // ---- the stock list itself (mod copy of the game file) is clean: no false rows on vanilla
  const m2 = path.join(work, 'mod-stock'); W(path.join(m2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK); modInfo(m2);
  const rs = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m2)), null, ctx);
  ok(rs.clean, 'stock bot list clean ' + JSON.stringify(rs.problems.slice(0, 3)));
  // an empty mod reads the game's own list; a fix there copies the whole file into the mod
  const m3 = path.join(work, 'mod-empty'); fs.mkdirSync(m3, { recursive: true }); modInfo(m3);
  const re3 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m3)), null, ctx);
  ok(re3.clean && re3.from === 'game', 'empty mod: the game list, clean');
  // no game folder: unit names are skipped with the reason; a write is refused
  const rn = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m2)), null, noGame);
  ok(rn.skipped.some(s => s.check === 1 && s.why === 'nocards'), 'no game folder: check 1 skipped (nocards) ' + JSON.stringify(rn.skipped));
  W(path.join(m2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK.replace('Repeat = 0,', 'Repeat = 4,'));
  const e3 = await R['POST /api/x/bots/buycheck/fix'](null, { mod: m2, id: 'nostay', how: 'stay', write: true }, noGame);
  ok(e3.ok === false && e3.code === 'noGameDir' && fs.readFileSync(path.join(m2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1').includes('Repeat = 4,'), 'no game folder: write refused (checkWrite)');
  // the mod's own bot.lua that reads a key: not an MIS-80 row, and a dead key it names is not removed
  const m4 = path.join(work, 'mod-own'); modInfo(m4);
  W(path.join(m4, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK.replace('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tank, period = "44", cost = 2, unit = "mk7"'));
  W(path.join(m4, 'resource', 'script', 'multiplayer', 'bot.lua'), 'local P = Purchases\r\nif e.period and e.cost then end\r\n');
  const r4 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m4)), null, ctx);
  const d4 = r4.problems.find(p => p.id === 'dead');
  ok(d4 && d4.refused && d4.refused.why === 'reads' && !d4.fixes.length && !r4.problems.some(p => p.id === 'key|cost'), 'own bot.lua: key it reads is fine, dead key it names is not removed ' + JSON.stringify(r4.problems));
  // a mod bot.lua that never reads Purchases (its own buying): 1, 2, 4 skipped as ownbot; a card only the mod has is a real card
  const m5 = path.join(work, 'mod-ownbot'); modInfo(m5);
  W(path.join(m5, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'BotConfig = { Debug = true }\r\n');
  W(path.join(m5, 'resource', 'script', 'multiplayer', 'bot.lua'), 'require("x")\r\n');
  const r5 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m5)), null, ctx);
  ok(r5.clean && r5.skipped.map(s => s.check + s.why).join() === '1ownbot,2ownbot,4ownbot', 'own bot.lua without Purchases: no rows, 1 2 4 skipped ' + JSON.stringify(r5));
  const m6 = path.join(work, 'mod-card'); modInfo(m6);
  W(path.join(m6, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK.replace('unit = "mk7"', 'unit = "mycard"'));
  W(path.join(m6, 'resource', 'set', 'multiplayer', 'units', 'mine_eng.set'), '{units\r\n\t{"mycard" (cost 1)}\r\n}\r\n');
  const r6 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m6)), null, ctx);
  ok(r6.clean, 'a card only the mod has counts ' + JSON.stringify(r6.problems.slice(0, 2)));
  // many unknown names: one row with one fix; past the "built on another mod" share and no sibling: one plain row, no fix
  const m7 = path.join(work, 'mod-many'), fake = n => Array.from({ length: n }, (_, i) => 'nocard' + i); modInfo(m7);
  let manyI = 0;
  const many = n => { manyI = 0; const F = fake(n); return STOCK.replace(/unit = "([^"]+)"/g, (m, u) => (manyI < n ? 'unit = "' + F[manyI++] + '"' : m)); };
  W(path.join(m7, 'resource', 'script', 'multiplayer', 'bot.data.lua'), many(10));
  const r7 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m7)), null, ctx);
  const g7 = r7.problems.find(p => p.id === 'units');
  ok(r7.problems.length === 1 && g7 && g7.msg === 'unitsMany' && g7.p.n === 10 && g7.fixes.length === 1 && g7.fixes[0].how === 'removeAll', '10 unknown names = one grouped row with one fix ' + JSON.stringify(r7.problems.map(p => p.id)));
  const pg7 = await R['POST /api/x/bots/buycheck/fix'](null, { mod: m7, id: 'units', how: 'removeAll' }, ctx);
  ok(pg7.plain.length === 1 && pg7.plain[0].p.n === 10 && pg7.hunks.length >= 1, 'grouped fix: one plain sentence ' + JSON.stringify(pg7.plain));
  await R['POST /api/x/bots/buycheck/fix'](null, { mod: m7, id: 'units', how: 'removeAll', write: true }, ctx);
  const r7b = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m7)), null, ctx);
  ok(!r7b.problems.some(p => p.check === 1), 'grouped fix written: no unit rows left ' + JSON.stringify(r7b.problems.map(p => p.id)));
  W(path.join(m7, 'resource', 'script', 'multiplayer', 'bot.data.lua'), many(99999));
  const r8 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m7)), null, ctx);
  ok(r8.problems.length === 1 && r8.problems[0].id === 'nobase' && r8.problems[0].p.n === r8.problems[0].p.total && r8.problems[0].p.n > 40 && !r8.problems[0].fixes.length, 'every name unknown, no base mod found: one plain row, no fix ' + JSON.stringify(r8.problems.map(p => p.id)));
  // a mod that needs another (mod.info Require) whose card lives only in its .pak: a real card
  const zw = require(path.join(T, 'lib', 'zipwrite'));
  const base = path.join(game, 'mods', 'basemod'); modInfo(base);
  W(path.join(base, 'mod.info'), crlf(['{Mod', '\t{Name "Base Realism"}', '}']));
  fs.writeFileSync(path.join(base, 'resource.pak'), zw.zip([['set/multiplayer/units/base_eng.set', Buffer.from(crlf(['{units', '\t{"depcard" (cost 1)}', '}']), 'latin1'), true]]));
  const m9 = path.join(work, 'mod-dep'); modInfo(m9);
  W(path.join(m9, 'mod.info'), crlf(['{Mod', '\t{Name "Bots for base"}', '\t{Require "basemod"}', '}']));
  W(path.join(m9, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK.replace('unit = "mk7"', 'unit = "depcard"'));
  const r9 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m9)), null, ctx);
  ok(r9.clean && r9.base && r9.base.how === 'require' && r9.base.title === 'Base Realism', 'a card only in the pak of a required mod counts ' + JSON.stringify([r9.problems.map(p => p.id), r9.base, r9.skipped]));
  W(path.join(m9, 'mod.info'), crlf(['{Mod', '\t{Name "Bots for base"}', '\t{Require "nosuchmod"}', '}']));
  const r10 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(m9)), null, ctx);
  ok(r10.clean && r10.skipped.some(s => s.check === 1 && s.why === 'depmissing' && s.p.names === 'nosuchmod'), 'a required mod not installed: check 1 skipped with one plain line ' + JSON.stringify(r10.skipped));
  // the cards index (searchKit of the card box)
  const cl = await R['GET /api/x/bots/buycheck/cards'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(cl.known && cl.units.some(x => x.unit === 'pz4h' && x.name === 'Panzer IV H') && cl.units.some(x => x.unit === 'tiger' && x.army === 'ger') && cl.units.some(x => x.unit === 'smgs(rus)' && x.army === 'rus'), 'cards: plain and squad names, by army, in-game name ' + JSON.stringify(cl.units.find(x => x.unit === 'pz4h')));
  // mixed line endings: a stage written with LF in a CRLF file; the copied block takes the LF of its neighbours
  const m11 = path.join(work, 'mod-eol'), s2 = L.indexOf('\t{--purchase 2'), s3 = L.indexOf('\t{--purchase 3'); modInfo(m11);
  const mixed = L.map((l, i) => l + (i >= s2 && i < s3 ? '\n' : '\r\n')).join('');
  W(path.join(m11, 'resource', 'script', 'multiplayer', 'bot.data.lua'), mixed);
  const we = await R['POST /api/x/bots/buycheck/fix'](null, { mod: m11, id: 'army|2|rus', how: 'copy', write: true }, ctx);
  const gotE = fs.readFileSync(path.join(m11, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
  const wantE = mixed.replace('\t\t\t\t{priority = 1.0, cost = 3, class = UnitClass.Tank, unit = "tiger"}\n\t\t\t}\n\t\t}\n', '\t\t\t\t{priority = 1.0, cost = 3, class = UnitClass.Tank, unit = "tiger"}\n\t\t\t},\n\t\t\t["rus"] = {--Soviet Union\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(rus)"}, -- \xe0\xe1 cp1251 comment\n\t\t\t\t{priority = 1.0, period = "44", class = UnitClass.Tank, unit = "t34"}\n\t\t\t},\n\t\t}\n');
  ok(we.written && gotE === wantE, 'mixed line endings: inserted lines take the ending of their neighbours\n' + JSON.stringify(we.ok === false ? we : gotE.slice(mixed.indexOf('purchase 2'), mixed.indexOf('purchase 3') + 120)));

  // ---- 1b army check: tiger_e, a German card, in the Commonwealth list: a warning with move / remove fixes, Undo exact bytes
  const MIX = (eng, ger) => crlf(['UnitClass = {', '\tInfantry = "infantry",', '\tTank = "tank",', '}', 'Purchases = {', '\t{', '\t\tRepeat = 0,', '\t\tUnits = {',
    '\t\t\t["ger"] = {--Germany'].concat(ger || ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tiger"}'], ['\t\t\t},', '\t\t\t["eng"] = {--Commonwealth'], eng, ['\t\t\t},', '\t\t}', '\t},', '}']));
  const mx = path.join(work, 'mod-mix'), MX = path.join(mx, 'resource', 'script', 'multiplayer', 'bot.data.lua'); modInfo(mx);
  const PZ6 = '\t\t\t\t{priority = 2.0, class = UnitClass.Tank, unit = "tiger_e"},', MK7 = '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"},';
  W(MX, MIX([PZ6, MK7])); MIXTXT = MIX([PZ6, MK7]);
  const rm = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx);
  const mr = rm.problems.find(p => p.id === 'mix|tiger_e|eng');
  ok(rm.problems.length === 1 && mr && mr.code === 'BOT_UNIT_ARMY' && mr.sev === 'warn' && mr.msg === 'armyMix' && mr.p.home === 'ger' && mr.p.army === 'eng' && mr.p.name === 'Tiger E' && mr.fixes.map(f => f.how).join() === 'move,remove' && mr.fixes[0].p.to === 'ger',
    'army check: a German card in the Commonwealth list is one warning with move and remove ' + JSON.stringify(rm.problems));
  ok(rm.armies && rm.armies.eng === 'Commonwealth Forces', 'run returns the lobby army names ' + JSON.stringify(rm.armies));
  const mb = fs.readFileSync(MX), pm = await fixR2(mx, 'mix|tiger_e|eng', 'move');
  eq(pm.plain, [{ k: 'move', p: { stage: 1, army: 'eng', unit: 'tiger_e', name: 'Tiger E', to: 'ger' } }], 'army check: the move preview says it plainly');
  const wm = await fixR2(mx, 'mix|tiger_e|eng', 'move', true);
  ok(wm.written && fs.readFileSync(MX, 'latin1') === MIX([MK7], ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tiger"},', '\t\t\t\t{priority = 2.0, class = UnitClass.Tank, unit = "tiger_e"},']), 'army check: moved into the German list of the same stage, CRLF kept\n' + fs.readFileSync(MX, 'latin1'));
  const rm2 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx);
  ok(rm2.clean, 'army check: clean after the move ' + JSON.stringify(rm2.problems));
  const um = await R['POST /api/x/bots/buycheck/undo'](null, { mod: mx, rel: C.BOTDATA }, ctx);
  ok(um.ok && Buffer.compare(fs.readFileSync(MX), mb) === 0, 'army check: Undo puts the exact bytes back');
  await fixR2(mx, 'mix|tiger_e|eng', 'remove', true);
  ok(fs.readFileSync(MX, 'latin1') === MIX([MK7]), 'army check: remove takes the line out');
  // nine mixed units: one grouped row; Move all puts each into its own army's list (one comma added), then clean
  W(MX, MIX(Array.from({ length: 9 }, (_, i) => '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "gt' + (i + 1) + '"},').concat([MK7])));
  const rg9 = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx);
  const g9 = rg9.problems.find(p => p.id === 'mixes');
  ok(rg9.problems.length === 1 && g9 && g9.msg === 'armyMixMany' && g9.p.n === 9 && g9.fixes.map(f => f.how).join() === 'moveAll,removeAll', 'army check: 9 units = one grouped row ' + JSON.stringify(rg9.problems.map(p => p.id)));
  await fixR2(mx, 'mixes', 'moveAll', true);
  ok(fs.readFileSync(MX, 'latin1') === MIX([MK7], ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tiger"},'].concat(Array.from({ length: 9 }, (_, i) => '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "gt' + (i + 1) + '"},'))), 'army check: Move all, one comma added, the rows in order\n' + fs.readFileSync(MX, 'latin1'));
  ok((await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx)).clean, 'army check: clean after Move all');
  // a card of any army (no _army file) and a card whose army has no list here are no rows
  W(MX, MIX([MK7], ['\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"}']));
  ok((await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx)).clean, 'army check: a card of any army is fine in every list');
  // S17: a card only in the helper file vehicles_x (x is no army): bots of no army can buy it; one plain row with remove / replace, Undo exact bytes
  const VX = path.join(mx, 'resource', 'set', 'multiplayer', 'units', 'vehicles_x.set');
  W(VX, crlf(['{units', '\t{"veteran_tiger" (cost 1)}', '}']));
  const VT = '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "veteran_tiger"},';
  W(MX, MIX([VT, MK7])); const vb = fs.readFileSync(MX);
  const rv = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx), nb = rv.problems.find(p => p.id === 'nobuy|veteran_tiger|eng');
  ok(!rv.clean && nb && nb.code === 'BOT_UNIT_NO_ARMY_CARD' && nb.msg === 'noBuy' && nb.p.army === 'eng' && nb.p.card === 'x' && nb.fixes.map(f => f.how).join() === 'remove,replace', 'no buy card: a helper-file unit in the Commonwealth list is reported ' + JSON.stringify(rv.problems));
  const rvBad = await R['POST /api/x/bots/buycheck/fix'](null, { mod: mx, id: nb.id, how: 'replace', value: 'tiger' }, ctx);
  ok(rvBad.ok === false && rvBad.code === 'noArmyCard', 'no buy card: replace by a unit of another army is refused ' + JSON.stringify(rvBad));
  const rvOk = await R['POST /api/x/bots/buycheck/fix'](null, { mod: mx, id: nb.id, how: 'replace', value: 'mk7' }, ctx);
  ok(rvOk.ok !== false && Buffer.compare(fs.readFileSync(MX), vb) === 0, 'no buy card: replace by a Commonwealth unit previews, nothing written ' + JSON.stringify(rvOk.plain));
  const rvW = await fixR2(mx, nb.id, 'remove', true);
  ok(rvW.written && fs.readFileSync(MX, 'latin1') === MIX([MK7]) && (await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mx)), null, ctx)).clean, 'no buy card: remove writes the line out, clean after');
  const rvU = await R['POST /api/x/bots/buycheck/undo'](null, { mod: mx, rel: C.BOTDATA }, ctx);
  ok(rvU.ok && Buffer.compare(fs.readFileSync(MX), vb) === 0, 'no buy card: Undo puts the exact bytes back');
  fs.unlinkSync(VX);
  // S13: Undo of a first copy removes the copy and the folders that write made
  const mf = path.join(work, 'mod-fresh'); fs.mkdirSync(mf, { recursive: true }); modInfo(mf);
  W(path.join(mf, 'mod.info'), crlf(['{Mod', '\t{Name "fresh"}', '}']));
  // a second fake game whose own bots_generic has the defect: the fix copies it into the fresh mod
  const g2 = path.join(work, 'game2'), ctx2 = { game: () => g2, tools: T, tmpRoot: work };
  W(path.join(g2, 'as64.exe'), ''); W(path.join(g2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), STOCK);
  W(path.join(g2, 'resource', 'set', 'multiplayer', 'units', 'all.set'), fs.readFileSync(GR('set', 'multiplayer', 'units', 'all.set')));
  W(path.join(g2, 'resource', 'set', 'multiplayer', 'games', 'bots_generic.inc'), GEN0);
  const fr = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(mf)), null, ctx2);
  const fc = fr.problems.find(p => p.check === 5);
  ok(fc && fc.from === 'game' && !fs.existsSync(path.join(mf, 'resource')), 'fresh mod: the game file row, nothing written by a check ' + JSON.stringify(fr.problems.map(p => p.id)));
  const fw = fc && await R['POST /api/x/bots/buycheck/fix'](null, { mod: mf, id: fc.id, how: 'charge', write: true }, ctx2);
  ok(fw && fw.written && fs.existsSync(path.join(mf, 'resource', 'set', 'multiplayer', 'games', 'bots_generic.inc')), 'fresh mod: the fix wrote a copy');
  const fu = await R['POST /api/x/bots/buycheck/undo'](null, { mod: mf, rel: 'set/multiplayer/games/bots_generic.inc' }, ctx2);
  ok(fu.ok && fu.removed && fu.dirsRemoved === 4 && !fs.existsSync(path.join(mf, 'resource')) && fs.existsSync(path.join(mf, 'mod.info')), 'Undo of a first copy: the copy and the 4 folders it made are gone, the mod stays ' + JSON.stringify(fu));

  // ---- GoH: no bot.data.lua (GHMIS-66): only 5 and 6 run, on the mod's own preset files, as info
  const goh = path.join(work, 'goh'), gm = path.join(work, 'goh-mod'); modInfo(gm);
  W(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
  W(path.join(gm, 'resource', 'set', 'multiplayer', 'games', 'presets', 'global_parameters', 'bots_generic.inc'), crlf(['{easy', '\t{balancingFactorBonus', '\t\t{cp 0.80}', '\t}', '}']));
  W(path.join(gm, 'resource', 'script', 'multiplayer', 'bot.data.lua'), crlf(L));
  const hctx = { gameId: () => 'goh', exe: () => 'goh', kind: () => 'goh', game: () => game, gohDir: () => goh, curDir: () => goh, tools: T, tmpRoot: work };
  const rg = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(gm)), null, hctx);
  ok(rg.goh && rg.skipped.map(s => s.check + s.why).join() === '1gohnolist,2goh,3goh,4goh,7goh', 'goh: 2-4 and 7 skipped with the GoH reason, 1 (unit names) with no purchase lists ' + JSON.stringify(rg.skipped));
  ok(rg.problems.length === 1 && rg.problems[0].check === 5 && rg.problems[0].sev === 'info' && rg.problems[0].soft === 'goh' && rg.problems[0].file === 'resource/set/multiplayer/games/presets/global_parameters/bots_generic.inc', 'goh: 5 on the GoH bots_generic, as info ' + JSON.stringify(rg.problems));
  const pg = await R['POST /api/x/bots/buycheck/fix'](null, { mod: gm, id: rg.problems[0].id, how: 'charge' }, hctx);
  eq(pg.hunks, [{ line: 4, was: ['\t}'], now: ['\t}', '\t{chargeFactors', '\t\t{value "*=0"}', '\t}'] }], 'goh: chargeFactors preview (multi-line block)');

  // ---- GoH check 1: the purchase lists against the buy cards (gohcards.js: pricecalc goh read of a tiny game + mod; names from .pot)
  {
    const G = path.join(work, 'gohfx'), M = modInfo(path.join(work, 'gohfx-mod')), UU = 'resource/set/multiplayer/units/';
    const w = (d, rel, s) => W(path.join(d, ...rel.split('/')), s);
    w(G, 'binaries/x64/call_to_arms.exe', '');
    w(G, UU + 'common.set', ';SDL\n{units\n\t(include "settings.set")\n\t(include "mid/units_ger.set")\n\t(include "late/units_ger.set")\n}\n');
    w(G, UU + 'settings.set', ';SDL\n(define "vehicle"\n\t{tags "%t %side %period"}\n\t{button "tank"}\n\t{cost %cost}\n)\n');
    w(G, UU + 'mid/units_ger.set', ';SDL\n{"pz3j"\n\t("vehicle" period(mid) t(tank) side(ger) cost(200))\n}\n');
    w(G, UU + 'late/units_ger.set', ';SDL\n{"pz4h"\n\t("vehicle" period(late) t(tank) side(ger) cost(300))\n}\n');
    w(G, 'resource/set/multiplayer/armies/ger.set', '{title "mp/army/ger"}\n');
    w(G, 'resource/interface/text/game.pot', 'msgctxt "mp/army/ger"\nmsgid "Germany"\nmsgstr ""\n\nmsgctxt "desc/squad/pz3j"\nmsgid "Pz.Kpfw. III J"\nmsgstr ""\n');
    w(G, 'resource/script/multiplayer/units/ger/mid.ger.lua', 'Purchases["mid.ger"] = {\n\t{Repeat = 0,\n\t\tUnits = {\n' +
      '\t\t\t{priority = 1.0, type = {"Class1", "Tank"}, unit = "pz3j"},\n\t\t\t{priority = 1.0, type = {"Class1", "Tank"}, unit = "pz4h"},\n' +
      '\t\t\t{priority = 1.0, type = {"Class1", "Tank"}, unit = "tiger_typo"},\n\t\t},\n\t},\n}\n');
    // the mod: a mid card no list buys, with its own name (where lng-add --exe goh writes)
    w(M, UU + 'mid/units_ger.set', ';SDL\n{"pz3j"\n\t("vehicle" period(mid) t(tank) side(ger) cost(200))\n}\n{"modtank"\n\t("vehicle" period(mid) t(tank) side(ger) cost(250))\n}\n');
    w(M, 'localizations/default/interface/text/units.pot', 'msgctxt "desc/squad/modtank"\nmsgid "Mod Tank"\nmsgstr ""\n');
    const fctx = { gameId: () => 'goh', gohDir: () => G, curDir: () => G, tools: T, tmpRoot: path.join(work, 'gohfx-tmp') };
    const before = fs.readdirSync(M).sort().join();
    const gr = await R['GET /api/x/bots/buycheck/run'](U('mod=' + encodeURIComponent(M)), null, fctx);
    const by = c => gr.problems.find(p => p.code === c) || {};
    ok(gr.goh && gr.skipped.map(s => s.check + s.why).join() === '2goh,3goh,4goh,7goh' && gr.armies.ger === 'Germany', 'goh 1: runs, lobby name from the .pot ' + JSON.stringify([gr.skipped, gr.armies]));
    const u = by('GOH_BOT_UNIT_UNKNOWN'), ns = by('GOH_BOT_UNIT_NOT_SOLD'), nl = by('GOH_CARD_NO_BOT_LIST');
    ok(u.check === 1 && u.lim === 'GHMIS-55' && u.sev === 'warn' && u.p.unit === 'tiger_typo' && u.p.army === 'ger' && u.p.list === 'mid' && u.line === 6 && u.file === 'resource/script/multiplayer/units/ger/mid.ger.lua', 'goh 1: an unknown unit in a list (crash, GHMIS-55) ' + JSON.stringify(u));
    ok(ns.p && ns.p.unit === 'pz4h' && ns.line === 5 && ns.lim === 'GHMIS-55', 'goh 1: a late card in the mid list is not sold there ' + JSON.stringify(ns));
    ok(nl.p && nl.p.unit === 'modtank' && nl.p.name === 'Mod Tank' && nl.sev === 'info' && nl.lim === 'GHMIS-66' && nl.file === 'resource/set/multiplayer/units/mid/units_ger.set' && JSON.stringify(nl.names) === '["Mod Tank (modtank)"]', 'goh 1: the mod card no list buys, with its name from the mod .pot ' + JSON.stringify(nl));
    ok(gr.problems.filter(p => p.check === 1).length === 3 && !gr.problems.some(p => p.p && p.p.unit === 'pz3j') && gr.problems.every(p => Array.isArray(p.fixes) && (p.check !== 1 || !p.fixes.length)), 'goh 1: three rows, the sold unit is clean, no fixes');
    ok(fs.readdirSync(M).sort().join() === before, 'goh 1: nothing written into the mod');
    const gc = await R['GET /api/x/bots/buycheck/cards'](U('mod=' + encodeURIComponent(M)), null, fctx);
    const pz = (gc.units || []).find(x => x.unit === 'pz3j'), mt = (gc.units || []).find(x => x.unit === 'modtank');
    ok(gc.goh && gc.known && gc.units.length === 3 && pz && pz.army === 'ger' && pz.name === 'Pz.Kpfw. III J' && mt && mt.src === 'mod' && mt.name === 'Mod Tank', 'goh cards: the picker list with army and in-game names ' + JSON.stringify(gc));
    const SC = require('../stages').routes['GET /api/x/bots/stages/cards'];
    const sc = SC && await SC(U('mod=' + encodeURIComponent(M) + '&game=goh'), null, fctx);
    ok(sc && sc.goh && sc.known && (sc.cards.ger || []).map(x => x.unit).join() === 'modtank,pz3j,pz4h' && sc.names.pz3j === 'Pz.Kpfw. III J' && sc.armies.ger === 'Germany', 'goh stages/cards: the buy cards per army now read ' + JSON.stringify(sc));
  }

  // ---- scan helpers
  eq(S.hunks('a\r\nb\r\nc\r\n', [{ a: 3, b: 6, t: '' }]), [{ line: 2, was: ['b'], now: [] }], 'hunks: a whole line removed');
  eq(S.hunks('ab\r\n', [{ a: 1, b: 1, t: 'X' }, { a: 2, b: 2, t: 'Y' }]), [{ line: 1, was: ['ab'], now: ['aXbY'] }], 'hunks: two edits on one line are one hunk');

  // ---- client in the fake DOM: stub BOTS_PARTS, env.api on the routes, kit like BOTS_UI
  await client();
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'buycheck ok (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e && e.stack || e)); process.exit(1); });

async function client() {
  // h() taken from page.js by its text (self-contained, gui-blocks brief), so the other exts are not loaded here
  const fakedom = require(path.join(T, 'gui', 'test', 'fakedom')), doc = fakedom.make();
  const hs = /^function h\(.*(?:\n .*)*/m.exec(fs.readFileSync(path.join(T, 'gui', 'page.js'), 'utf8'))[0], h = new Function('document', hs + '\nreturn h;')(doc);
  const EN = {}; X.lang.forEach(r => { EN[r[0]] = r[1]; });
  const missing = new Set();
  // like page.js tx: the n = 1 form when there is one; a missing key comes back as the key (shared frame keys may be absent here)
  const tx = (k, p) => { if (p && String(p.n) === '1' && EN[k + '.1'] != null) k += '.1'; if (!(k in EN)) { if (k.startsWith('bots.buycheck.')) missing.add(k); return k; } return EN[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  const kits = [], parts = [], pend = [], asked = [];
  // like page.js searchKit: the list exists only when the box already sits in the page (parentNode)
  const searchKit = (inp, o) => { kits.push({ inp, o, attached: !!inp.parentNode }); };
  const askDo = o => { asked.push(o.lines.join(' ')); return { then: cb => cb(true) }; };
  const cm = path.join(work, 'client-mod'), CB = path.join(cm, 'resource', 'script', 'multiplayer', 'bot.data.lua'); modInfo(cm);
  W(CB, crlf(L));
  let changed = 0;
  const BOTS_UI = { changed() { changed++; } };
  const env = (gid, c) => ({
    mod: cm, gid, reload() {}, go() {},
    api(method, p, data, cb) {
      const key = method + ' /api/x/bots/' + p.split('?')[0];
      const pr = (method === 'GET' ? R[key](U('mod=' + encodeURIComponent(cm)), null, c) : R[key](null, Object.assign({ mod: cm }, data || {}), c))
        .then(j => cb(null, j), e => cb(e.message));
      pend.push(pr);
    },
    kit: {
      leaf: (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids),
      hint: (id, t) => h('div', { blk: id }, [h('div', { class: 'hint', text: t })]),
      section: (id, title, kids) => h('div', { class: 'card', blk: id, box: 'col', 'data-blkname': title }, [h('div', { blk: id + '.title' }, [h('h3', { text: title })])].concat(kids)),
      errBox: m => h('div', { class: 'err', text: m }),
      qs: o => new URLSearchParams(o).toString(),
      hitsOf: (items, s, done) => { s = String(s || '').toLowerCase(); const a = items.filter(it => it.lo.indexOf(s) >= 0); done(a.slice(0, 30), Math.max(0, a.length - 30)); },
      editor: () => ({ el: h('div'), load() {} }),
    },
  });
  const flush = async () => { for (let i = 0; i < 6; i++) { while (pend.length) await pend.shift(); await new Promise(r => setImmediate(r)); } };
  new Function('BOTS_PARTS', 'BOTS_UI', 'h', 'tx', 'searchKit', 'askDo', 'confirm', 'document', X.script)(parts, BOTS_UI, h, tx, searchKit, askDo, () => true, doc);
  ok(parts.length === 1 && parts[0].id === 'buycheck' && parts[0].group === 'A' && parts[0].order === 10 && parts[0].title() === 'Check the bot buy list', 'client: one part pushed');
  const root = doc.createElement('div');
  parts[0].draw(env('as64', ctx)).forEach(el => root.appendChild(el));
  const ids = root.all().map(e => e.getAttribute && e.getAttribute('data-blk')).filter(Boolean);
  ok(ids.length && ids.every(i => i === 'bots.buycheck' || i.startsWith('bots.buycheck.')), 'client: block ids start bots.buycheck ' + ids.join());
  const btn = () => root.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Check the bot buy list');
  const inEx = e => { for (let p = e; p; p = p.parentNode) if (p.getAttribute && p.getAttribute('data-example') === '1') return true; return false; };
  const button = t => root.all().find(e => e.tagName === 'BUTTON' && e.textContent === t && !inEx(e));
  // the made-up example (S: show what a problem and its fix look like before any check): folded, its buttons off, nothing written
  const exr = root.all().find(e => e.getAttribute && e.getAttribute('data-example') === '1');
  const exFold = root.all().find(e => e.tagName === 'DETAILS' && e.children[0] && e.children[0].textContent === 'Show me an example');
  ok(exr && exFold && !exFold.open && exr.all().filter(e => e.tagName === 'BUTTON').length === 2 && exr.all().filter(e => e.tagName === 'BUTTON').every(b => b.disabled || b.getAttribute('disabled') != null) && exFold.has('nothing is written'), 'client: Show me an example: folded, a made-up row, its buttons off');
  btn().click(); await flush();
  const rows = () => root.all().filter(e => /bc-row/.test(e.className || ''));
  ok(rows().length === 5 && root.has('Bots never buy "pz4x"') && root.has('Checker key BOT_UNIT_NO_CARD') && root.has('lines 15, 27'), 'client: 5 rows, plain sentence first, where and checker key folded ' + rows().map(r => r.getAttribute('data-id')).join());
  const firstB = rows()[0] && rows()[0].all().find(e => e.tagName === 'B');
  ok(firstB && !/MIS-|\.lua|BOT_/.test(firstB.textContent), 'client: the main sentence has no file name, key or limit ID: ' + (firstB && firstB.textContent));
  // the unit box: a searchKit attached after the box is in its row, in-game name first, the id small
  const sk = kits.find(x => x.o.key === 'bots.buycheck.card');
  let hits = null; if (sk) { sk.o.index('panzer', (l) => { hits = l; }); await flush(); }
  ok(sk && sk.attached, 'client: unit box searchKit attached after the box is in its row');
  ok(hits && hits.some(x => x.label === 'Panzer IV H' && x.value === 'pz4h' && /pz4h/.test(x.hint)), 'client: picker shows the in-game name, id small ' + JSON.stringify(hits && hits.slice(0, 3)));
  // S17: the search ignores spaces, dots and case, knows a few common names, and the box's example is a name the box accepts
  if (sk) {
    const find = async q => { let l = null; sk.o.index(q, x => { l = x; }); await flush(); return (l || []).map(x => x.value); };
    ok((await find('PANZER.IV.H'))[0] === 'pz4h' && (await find('panzerivh')).join() === 'pz4h', 'client: search ignores dots, spaces and case ' + JSON.stringify(await find('PANZER.IV.H')));
    ok((await find('PzKpfw 4 H'))[0] === 'pz4h' && (await find('pz iv h'))[0] === 'pz4h', 'client: search knows Panzer = PzKpfw = Pz and 4 = IV ' + JSON.stringify(await find('PzKpfw 4 H')));
    ok((await find('zzz no such unit')).length === 0, 'client: a text that fits nothing finds nothing');
    const ph = sk.inp.getAttribute('placeholder') || '', ex = ph.replace(/^in-game name, e\.g\. /, '');
    ok(/^in-game name, e\.g\. ./.test(ph) && !/Ausf/.test(ph) && (await find(ex)).length >= 1, 'client: the placeholder example is a name the box finds: ' + ph);
    // Enter or leaving the box: a single match becomes that unit's name; several or none = "pick one from the list"
    sk.inp.value = 'panzer iv'; sk.inp.fire('blur'); await flush();
    ok(sk.inp.value === 'Panzer IV H', 'client: one match on leaving the box is accepted: ' + sk.inp.value);
    sk.inp.value = 'gt'; button('Use this unit instead').click(); await flush();
    ok(root.has('that name fits no unit, or more than one. Pick one from the list.') && !rows().some(r => r.all().some(e => e.tagName === 'LI')), 'client: several matches: pick one from the list, no preview');
    sk.inp.value = 'zzz'; button('Use this unit instead').click(); await flush();
    ok(root.has('Pick one from the list.'), 'client: no match: pick one from the list');
  }
  // a typed in-game name is accepted: preview says what the bot buys instead
  if (sk) {
    sk.inp.value = 'Panzer IV H';
    button('Use this unit instead').click(); await flush();
    ok(root.has('bots buy "Panzer IV H" instead of "pz4x"'), 'client: a typed in-game name resolves to its card');
    const rowEl = rows().find(r => r.getAttribute('data-id') === 'unit|pz4x');
    ok(rowEl && rowEl.all().filter(e => e.tagName === 'LI').length === 2, 'client: replace preview lists the 2 places');
  }
  // a fix: plain sentences, the exact change folded with removed lines before added ones, Write asks with the same count
  const fb = button('Remove "cost" (1)');
  ok(!!fb, 'client: fix button of the cost row');
  if (fb) {
    const before = fs.readFileSync(CB);
    fb.click(); await flush();
    const rowEl = rows().find(r => r.getAttribute('data-id') === 'key|cost');
    const pre = rowEl.all().find(e => e.tagName === 'PRE'), lis = rowEl.all().filter(e => e.tagName === 'LI');
    ok(pre && pre.textContent.indexOf('- \t\t\t\t{priority = 1.0, cost = 3,') >= 0 && pre.textContent.indexOf('- ') < pre.textContent.indexOf('+ '), 'client: exact change, removed lines first ' + (pre && pre.textContent));
    ok(lis.length === 1 && rowEl.has('Show the exact file change'), 'client: one plain sentence, the file change folded');
    rowEl.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Write into my mod').click(); await flush();
    ok(asked.length && /^Write this change into your mod/.test(asked[asked.length - 1]), 'client: confirm count matches the 1 sentence: ' + asked[asked.length - 1]);
    ok(rows().length === 4 && !fs.readFileSync(CB, 'latin1').includes('cost = 3'), 'client: written, checked again ' + rows().length);
    const okBox = root.all().find(e => e.className === 'ok' && e.textContent.indexOf('Done: The setting "cost"') === 0);
    ok(okBox && okBox.has('Try a bot match') && okBox.has('Open the log') && changed === 1, 'client: green box "Done: ...", next links, frame told ' + changed);
    ok(okBox && okBox.textContent.split('To see it:').length === 2 && okBox.has('To see it: try a bot match'), 'client: one "To see it" line, bots -> try a bot match');
    // S13: one Undo next to Check, greyed until the write; after Undo the done box goes, Undo greys again, the list is read again
    const ub = button('Undo'), dones = () => root.all().filter(e => e.getAttribute && e.getAttribute('data-done') === '1');
    ok(ub && !ub.disabled && dones().length === 1, 'client: Undo enabled after the write, one done box');
    ub.click(); await flush();
    ok(Buffer.compare(fs.readFileSync(CB), before) === 0 && rows().length === 5 && root.has('Undone:') && !dones().length && ub.disabled && changed === 2, 'client: Undo puts the exact bytes back, the done box goes, Undo greys, the row returns ' + changed);
    // a 2-place fix: the confirm says 2, the list has 2
    button('Remove the line (2)').click(); await flush();
    rows().find(r => r.getAttribute('data-id') === 'unit|pz4x').all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Write into my mod').click(); await flush();
    ok(/these 2 changes/.test(asked[asked.length - 1]), 'client: confirm count 2 = 2 sentences: ' + asked[asked.length - 1]);
    // the green box stays until the next Check
    ok(root.has('Done: 2 changes written into your mod.') && root.has('Stage 1, Germany: the line for "pz4x"'), 'client: the green box stays after the list is checked again');
    btn().click(); await flush();
    ok(!root.has('Done:'), 'client: the next Check clears the green box');
  }
  // clean: one green line
  W(CB, STOCK);
  btn().click(); await flush();
  const okl = root.all().filter(e => e.className === 'ok');
  ok(okl.length === 1 && okl[0].textContent === 'No problems found: bots can buy everything on their list.' && !rows().length, 'client: clean = one green line');
  // a refusal is worded by the page: the code's own sentence
  W(CB, crlf(L));
  btn().click(); await flush();
  fs.writeFileSync(CB, STOCK);   // the row is gone on disk: its fix is refused as "gone"
  button('Remove "cost" (1)').click(); await flush();
  ok(root.has('This problem is no longer there'), 'client: a refusal is a plain sentence from its code');
  // S10: more than 8 rows: 8 shown, then Show all N draws the rest in place
  let kk = 0;
  W(CB, STOCK.replace(/class = UnitClass\.Tank, unit = "/g, m => (kk < 9 ? 'class = UnitClass.Tank, odd' + (++kk) + ' = 1, unit = "' : m)));
  btn().click(); await flush();
  const sa = button('Show all 9');
  ok(rows().length === 8 && !!sa, 'client: 8 rows, then Show all 9 ' + rows().length);
  if (sa) { sa.click(); ok(rows().length === 9 && !button('Show all 9'), 'client: Show all draws the rest'); }
  // the army check on the page: lobby names in the sentence and the buttons, codes only in Details; Move writes, Undo puts it back
  W(CB, MIXTXT); const mb0 = fs.readFileSync(CB);
  btn().click(); await flush();
  const mrow = rows().find(r => r.getAttribute('data-id') === 'mix|tiger_e|eng'), mB = mrow && mrow.all().find(e => e.tagName === 'B');
  ok(mB && mB.textContent.indexOf('Bots of Commonwealth Forces never buy "Tiger E"') === 0 && !/(eng|ger|tiger_e)/.test(mB.textContent), 'client: army row in lobby names, no codes: ' + (mB && mB.textContent));
  ok(mrow && mrow.has('Army codes: this list eng') && !!button('Move it to the Germany list'), 'client: codes in Details, Move button in the army name');
  button('Move it to the Germany list').click(); await flush();
  ok(mrow.has('Stage 1: "Tiger E" moves from the Commonwealth Forces list to the Germany list'), 'client: move preview in plain words ' + (mrow && mrow.textContent.slice(0, 600)));
  mrow.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Write into my mod').click(); await flush();
  ok(fs.readFileSync(CB, 'latin1').includes('unit = "tiger"},\r\n\t\t\t\t{priority = 2.0, class = UnitClass.Tank, unit = "tiger_e"},\r\n') && !rows().length, 'client: moved, the list is clean again');
  button('Undo').click(); await flush();
  ok(Buffer.compare(fs.readFileSync(CB), mb0) === 0 && rows().length === 1 && button('Undo').disabled, 'client: Undo of the move: exact bytes, the row is back, Undo greyed');
  // the two game words explained once on hover
  ok(root.all().some(e => e.getAttribute && /buy card is the entry of a unit/.test(e.getAttribute('title') || '')) && root.all().some(e => e.getAttribute && /^A stage is one step/.test(e.getAttribute('title') || '')), 'client: buy card and stage have a hover text');
  // GoH: the plain line is shown before any check
  const r2 = doc.createElement('div');
  parts[0].draw(env('goh', ctx)).forEach(el => r2.appendChild(el));
  ok(r2.has('In Gates of Hell this card checks the bot purchase lists') && !r2.has('Not available') && !r2.all().some(e => e.getAttribute && e.getAttribute('data-na') === '1'), 'client GoH (S15): the card runs there and says what it checks, not "Not available"');
  { const gb = r2.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Check the bot buy list'); ok(gb && !gb.disabled, 'client GoH: the Check button is on'); }
  const lead2 = r2.all().find(e => e.getAttribute && /\.lead$/.test(e.getAttribute('data-blk') || ''));
  ok(lead2 && lead2.all().some(e => e.getAttribute && e.getAttribute('data-goh') === '1' && /The other checks do not run there: Gates of Hell has no bot.data.lua/.test(e.textContent)) && !r2.all().some(e => e.getAttribute && e.getAttribute('data-example') === '1'), 'client GoH: the line when folded says what runs and what does not, no example');
  // kit.game / kit.army / kit.undone / bots.showChange of the frame are used when it has them; no mod = the frame's no-mod line, Check off
  { const eg = env('goh', ctx); eg.kit.game = g => (g === 'goh' ? 'GoH (frame)' : g); const rg2 = doc.createElement('div'); parts[0].draw(eg).forEach(el => rg2.appendChild(el));
    ok(rg2.has('In GoH (frame) this card checks the bot purchase lists'), 'client: the game name comes from kit.game');
    const en = env('as64', ctx); en.mod = ''; let nm = 0; en.kit.needMod = id => { nm++; return h('div', { blk: id, 'data-needmod': '1' }); };
    const rn = doc.createElement('div'); parts[0].draw(en).forEach(el => rn.appendChild(el));
    const nb = rn.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Check the bot buy list');
    ok(nm === 1 && nb && nb.disabled, 'client: no mod = kit.needMod and Check greyed'); }
  // the no-buy-card row on the page: plain sentence, remove fix
  const VX = path.join(cm, 'resource', 'set', 'multiplayer', 'units', 'vehicles_x.set');
  W(VX, crlf(['{units', '\t{"veteran_tiger" (cost 1)}', '}']));
  W(CB, MIXTXT.replace('unit = "tiger_e"', 'unit = "veteran_tiger"')); const nb0 = fs.readFileSync(CB);
  btn().click(); await flush();
  const nrow = rows().find(r => r.getAttribute('data-id') === 'nobuy|veteran_tiger|eng'), nB = nrow && nrow.all().find(e => e.tagName === 'B');
  ok(nB && /^"veteran_tiger" in the Commonwealth Forces list: bots cannot buy this unit: it has no buy card/.test(nB.textContent) && !root.has('No problems found'), 'client: a unit with no buy card is a row in plain words: ' + (nrow && nrow.textContent.slice(0, 300)));
  const nfix = nrow && nrow.all().find(e => e.tagName === 'BUTTON' && /^Remove/.test(e.textContent));
  if (nfix) { nfix.click(); await flush(); nrow.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Write into my mod').click(); await flush(); }
  ok(nfix && !fs.readFileSync(CB, 'latin1').includes('veteran_tiger') && !rows().some(r => r.getAttribute('data-id') === 'nobuy|veteran_tiger|eng'), 'client: its Remove fix writes the line out');
  button('Undo').click(); await flush();
  ok(Buffer.compare(fs.readFileSync(CB), nb0) === 0 && rows().some(r => r.getAttribute('data-id') === 'nobuy|veteran_tiger|eng') && button('Undo').disabled, 'client: Undo of that fix: exact bytes, the row is back, Undo greyed');
  fs.unlinkSync(VX);

  // S18: with the frame's Undo in the kit (one state per file, read from the server) the card uses it
  const stubs = [], withUB = e => { e.kit.undoBtn = (rels, o) => { const s = h('span', { 'data-stub': '1' }); s.refresh = () => {}; stubs.push({ rels: typeof rels === 'function' ? rels() : rels, o }); return s; }; return e; };
  const r3 = doc.createElement('div'); parts[0].draw(withUB(env('as64', ctx))).forEach(el => r3.appendChild(el));
  ok(stubs.length === 1 && stubs[0].rels.join() === 'script/multiplayer/bot.data.lua' && r3.all().some(e => e.getAttribute && e.getAttribute('data-stub') === '1') && !r3.all().some(e => e.getAttribute && e.getAttribute('data-undo') === '1'), 'client: the frame Undo next to Check when the kit has it');
  // the mod's readme asks for a mod.info edit by hand (a base mod found by its title, no Require): a warning and the exact line in Details
  const e4 = env('as64', ctx); e4.api = (m, p, d, cb) => { if (p.indexOf('buycheck/run') === 0) cb(null, { ok: true, clean: true, problems: [], skipped: [], base: { how: 'guess', title: 'Base Realism', folder: 'basemod' } }); else cb(null, { ok: true, units: [] }); };
  const r4 = doc.createElement('div'); parts[0].draw(e4).forEach(el => r4.appendChild(el));
  r4.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Check the bot buy list').click(); await flush();
  const warn = r4.all().find(e => e.getAttribute && e.getAttribute('data-warn') === 'require'), line = r4.all().find(e => e.getAttribute && e.getAttribute('data-line') === '1');
  ok(warn && /Base Realism/.test(warn.textContent) && line && line.textContent === '	{Require "basemod"}', 'client: Require warning with the exact line to add ' + JSON.stringify([warn && warn.textContent, line && line.textContent]));
  ok(!missing.size, 'client: every text key exists in lang: ' + [...missing].join());
}
