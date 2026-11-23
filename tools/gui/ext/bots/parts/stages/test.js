// Bots page part "stages" test. Arg: scratch dir. No game, no network: the stock 3.262 bot.data.lua of the botrecipe chainn3 fixture, a
// made-up units set and .lng, a fake game folder (as64.exe + loose resource/) for the write gate. Prints FAIL lines, exit 1 on failure.
// Author: Imperator_Aug (ARSENAL, ia-141dfe13)
'use strict';
const fs = require('fs'), path = require('path');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'bots-stages-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), B = require('./botdata'), C = require('./cards');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
const STOCK = fs.readFileSync(path.join(T, 'botrecipe', 'test', 'chainn3', 'stock', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };
const BD = ['resource', 'script', 'multiplayer', 'bot.data.lua'];
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;
const refusal = (f) => { try { f(); return null; } catch (e) { return e instanceof B.Refuse ? e : { code: 'crash:' + e.message }; } };
const once = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? '<<' + a + ' not found>>' : s.slice(0, i) + b + s.slice(i + a.length); };
const last = (s, a, b) => { const i = s.lastIndexOf(a); return i < 0 ? '<<' + a + ' not found>>' : s.slice(0, i) + b + s.slice(i + a.length); };

// buy cards (made up, vanilla forms): s(army) lines, a file-name army, an army-less file ('*'), squad macros name(N) side(S)
const SETS = {
  'tanks.set': '; \xe0\xe1 cards\r\n{"mk7"\t\t\t s(eng) c(1)}\r\n{"pz4h"\t\t s(ger) c(1)}\r\n{"willysmb_eng" s(eng)}\r\n{"kubel_mgun" s(ger)}\r\n',
  'cars_jap.set': '{"type95"\t c(1)}\r\n',
  'common.set': '{"dodgewc55"\t c(1)}\r\n',
  // a hero card of the helper file (the "extra" macro): x is not an army, so no army can buy it (S17)
  'vehicles_x.set': '{"veteran_tiger"\t c(1)}\r\n',
  'squads.inc': '\t("squad" name(smgs) side(eng))\r\n\t("squad" name(smgs) side(ger))\r\n\t("squad" name(riflemans) side(ger))\r\n\t("squad" name(riflemans) side(eng))\r\n',
};
const LNG = '﻿{tags\r\n{entity\r\n{mk7 "Mk VII <c(ffffff)>Tetrarch"}\r\n}\r\n{squad\r\n{smgs(eng) "SMG squad"}\r\n}\r\n}\r\n';
function mkMod(dir, bot) {
  for (const [f, t] of Object.entries(SETS)) W(path.join(dir, 'resource', 'set', 'multiplayer', 'units', f), t);
  fs.mkdirSync(path.join(dir, 'resource', 'localization'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'resource', 'localization', 'desc.lng'), LNG, 'utf8');
  if (bot != null) W(path.join(dir, ...BD), bot);
  modInfo(dir);
  return dir;
}
const cardsMap = () => { const by = C.indexSets(new Map(Object.entries(SETS).map(([f, t]) => ['set/multiplayer/units/' + f, { text: t, src: 'mod' }]))), m = new Map(); for (const [a, s] of by) m.set(a, new Set(s.keys())); return m; };
const CARDS = cardsMap();
const run = (text, ops, opt) => B.apply(text, ops, Object.assign({ cards: CARDS }, opt || {})).text;

// ---- 1. parse and round trip on the stock file form
(function stock() {
  const m = B.model(STOCK);
  ok(!m.odd && m.stages.length === 8 && m.armies.map(a => a.id).join() === 'eng,ger,ger2,usa,rus,jap', 'stock parses: 8 stages, 6 armies ' + m.odd + ' ' + m.stages.length);
  ok(m.stages.map(s => s.repeat).join() === '1,1,1,1,1,1,1,0', 'stock Repeat 1 x7 then 0 ' + m.stages.map(s => s.repeat));
  ok(m.stages.map(s => s.armies.eng.length).join() === '6,10,12,17,21,24,23,23', 'stock eng row counts');
  ok(JSON.stringify(m.move) === JSON.stringify({ flag: { Captured: 1, Enemy: 2, Neutral: 3 }, rotationMs: 180000, rotationText: '3 * 60 * 1000', squad: 5 }), 'stock movement ' + JSON.stringify(m.move));
  ok(B.warnings(STOCK).length === 0, 'stock: no warnings ' + JSON.stringify(B.warnings(STOCK)));
  const r0 = B.apply(STOCK, [], {});
  ok(r0.text === STOCK && r0.changes.length === 0, 'no edit = byte-identical');
  const same = [{ op: 'repeat', stage: 1, value: '1' }, { op: 'repeat', stage: 8, value: '0' }, { op: 'flag', which: 'Enemy', value: '2' }, { op: 'squad', value: '5' }, { op: 'rotation', minutes: '3' },
    { op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'priority', value: '3' }, { op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'cls', value: 'Infantry' },
    { op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'min_income', value: '' }, { op: 'rowSet', stage: 8, army: 'jap', row: 0, field: 'min_team', value: String(m.stages[7].armies.jap[0].min_team == null ? '' : m.stages[7].armies.jap[0].min_team) }];
  const r1 = B.apply(STOCK, same, {});
  ok(r1.text === STOCK && r1.changes.length === 0, 'same-value edits = byte-identical, no changes ' + JSON.stringify(r1.changes));
  // a cp1251 byte in a comment and the CRLF survive an edit elsewhere
  const cp = '-- \xc1\xee\xf2\xfb comment\r\n' + STOCK;
  const r2 = run(cp, [{ op: 'squad', value: '8' }]);
  ok(r2 === '-- \xc1\xee\xf2\xfb comment\r\n' + once(STOCK, 'MaxSquadSize = 5\r\n', 'MaxSquadSize = 8\r\n'), 'cp1251 comment bytes kept, one value changed');
  ok(!/[^\r]\n/.test(r2), 'CRLF kept');
})();

// ---- 2. each action's exact output
(function actions() {
  const E = (ops, want, msg) => { let got; try { got = run(STOCK, ops); } catch (e) { got = 'refused ' + e.code + ' ' + e.message; } ok(got === want, msg + (got === want ? '' : ': ' + JSON.stringify(B.diff(want, got, 12)))); };
  E([{ op: 'repeat', stage: 1, value: '2' }], once(STOCK, '{--purchase 1\r\n\t\tRepeat = 1,', '{--purchase 1\r\n\t\tRepeat = 2,'), 'repeat 1 -> 2');
  E([{ op: 'repeat', stage: 8, value: '3' }], once(STOCK, '\t\tRepeat = 0, --infinite\r\n', '\t\tRepeat = 3,\r\n'), 'repeat 0 -> 3 drops the --infinite note');
  ok(B.apply(STOCK, [{ op: 'repeat', stage: 8, value: '3' }], {}).warnings.some(w => w.code === 'lastNotForever'), 'warning: last stage not forever');
  ok(B.apply(STOCK, [{ op: 'repeat', stage: 3, value: '0' }], {}).warnings.some(w => w.code === 'foreverNotLast' && w.stage === 3 && w.next === 4), 'warning: a forever stage before the last');
  E([{ op: 'rowSet', stage: 1, army: 'eng', row: 4, field: 'priority', value: '2' }], once(STOCK, '{priority = 0.5, class = UnitClass.Vehicle, unit = "dodgewc55"}', '{priority = 2.0, class = UnitClass.Vehicle, unit = "dodgewc55"}'), 'priority 0.5 -> 2');
  E([{ op: 'rowSet', stage: 1, army: 'eng', row: 4, field: 'cls', value: 'ATTank' }], once(STOCK, 'class = UnitClass.Vehicle, unit = "dodgewc55"}', 'class = UnitClass.ATTank, unit = "dodgewc55"}'), 'class Vehicle -> ATTank');
  E([{ op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'min_team', value: '2' }, { op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'min_income', value: '1.5' }],
    once(STOCK, '{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}', '{priority = 3.0, min_income = 1.5, min_team = 2, class = UnitClass.Infantry, unit = "smgs(eng)"}'), 'min_team then min_income added in stock key order');
  E([{ op: 'rowSet', stage: 8, army: 'jap', row: B.model(STOCK).stages[7].armies.jap.findIndex(r => r.unit === 'chi-to'), field: 'min_income', value: '' }],
    last(STOCK, 'min_income = 3.0, min_team = 2, class = UnitClass.HeavyTank, unit = "chi-to"}', 'min_team = 2, class = UnitClass.HeavyTank, unit = "chi-to"}'), 'min_income removed (empty box)');
  E([{ op: 'rowSet', stage: 8, army: 'jap', row: B.model(STOCK).stages[7].armies.jap.findIndex(r => r.unit === 'ha-to'), field: 'min_team', value: '' }],
    last(STOCK, 'min_income = 3.5, min_team = 4, class = UnitClass.ArtilleryTank, unit = "ha-to"}', 'min_income = 3.5, class = UnitClass.ArtilleryTank, unit = "ha-to"}'), 'min_team removed');
  E([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk7', cls: 'Tank', priority: '1.0' }],
    once(STOCK, 'unit = "willysmb_eng"}\r\n', 'unit = "willysmb_eng"},\r\n\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"}\r\n'), 'add at the end: comma on the old last row, none on the new one');
  E([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk7', cls: 'Tank', priority: '2', min_team: '3', after: -1 }],
    once(STOCK, '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}', '\t\t\t\t{priority = 2.0, min_team = 3, class = UnitClass.Tank, unit = "mk7"},\r\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}'), 'add at the top');
  E([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'dodgewc55', cls: 'Vehicle', priority: '1' }].slice(0, 0), STOCK, 'no op');
  E([{ op: 'rowDel', stage: 1, army: 'eng', row: 5 }],
    once(STOCK, 'unit = "dodgewc55"},\r\n\t\t\t\t{priority = 1.0, class = UnitClass.Vehicle, unit = "willysmb_eng"}\r\n', 'unit = "dodgewc55"}\r\n'), 'remove the last row: the comma before goes');
  E([{ op: 'rowDel', stage: 1, army: 'eng', row: 1 }], once(STOCK, '\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(eng)"},\r\n', ''), 'remove a middle row: its whole line');
  E([{ op: 'rowMove', stage: 1, army: 'eng', row: 0, dir: 1 }],
    once(STOCK, 'unit = "smgs(eng)"},\r\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(eng)"}', 'unit = "riflemans(eng)"},\r\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}'), 'move row 1 down');
  E([{ op: 'rowMove', stage: 1, army: 'eng', row: 5, dir: -1 }],
    once(STOCK, '{priority = 0.5, class = UnitClass.Vehicle, unit = "dodgewc55"},\r\n\t\t\t\t{priority = 1.0, class = UnitClass.Vehicle, unit = "willysmb_eng"}\r\n', '{priority = 1.0, class = UnitClass.Vehicle, unit = "willysmb_eng"},\r\n\t\t\t\t{priority = 0.5, class = UnitClass.Vehicle, unit = "dodgewc55"}\r\n'), 'move the last row up: commas stay in place');
  // stages
  const o8 = STOCK.indexOf('{--purchase 8'), c8 = STOCK.lastIndexOf('\t}') + 2, s8 = STOCK.slice(o8, c8);
  E([{ op: 'stageAdd', after: 8 }], STOCK.slice(0, c8) + ',\r\n\t' + s8.replace('--purchase 8', '--purchase 9') + STOCK.slice(c8), 'add a stage after the last (copy, renumbered)');
  const ren = (t, from, d) => t.replace(/--purchase (\d+)/g, (x, k) => '--purchase ' + (Number(k) >= from ? Number(k) + d : Number(k)));
  const l2 = STOCK.indexOf('\t{--purchase 2'), l3 = STOCK.indexOf('\t{--purchase 3'), s1 = STOCK.slice(STOCK.indexOf('\t{--purchase 1'), l2);
  E([{ op: 'stageDel', stage: 2 }], ren(STOCK.slice(0, l2) + STOCK.slice(l3), 3, -1), 'remove stage 2 (whole lines, renumbered)');
  E([{ op: 'stageAdd', after: 1 }], ren(STOCK.slice(0, l2), 99, 0) + s1.replace('--purchase 1', '--purchase 2') + ren(STOCK.slice(l2), 2, 1), 'add a stage after stage 1');
  // copy an army's list
  const gs = STOCK.indexOf('\t\t\t["ger"] = {--Germany\r\n'), ge = STOCK.indexOf('\t\t\t},', gs);
  const gList = '\t\t\t["ger"] = {--Germany\r\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(ger)"},\r\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(ger)"},\r\n\t\t\t\t{priority = 0.5, class = UnitClass.Vehicle, unit = "dodgewc55"}\r\n';
  E([{ op: 'armyCopy', stage: 1, from: 'eng', to: 'ger' }], STOCK.slice(0, gs) + gList + STOCK.slice(ge), 'copy eng -> ger: squads renamed, no-card units left out');
  const rc = B.apply(STOCK, [{ op: 'armyCopy', stage: 1, from: 'eng', to: 'ger' }], { cards: CARDS }).changes[0];
  ok(rc && rc.n === 3 && rc.renamed.join() === 'smgs(eng) -> smgs(ger),riflemans(eng) -> riflemans(ger)' && rc.skipped.join() === 'stormtroopers1(eng),stormtroopers3(eng),willysmb_eng', 'copy change lists ' + JSON.stringify(rc));
  // a stage with no jap list (MIS-09): the copy adds one after the last list
  const js = STOCK.indexOf('\t\t\t["jap"]'), je = STOCK.indexOf('\r\n\t\t}', js) + 2, lastComma = STOCK.lastIndexOf('},', js);
  const noJap = STOCK.slice(0, lastComma + 1) + '\r\n' + STOCK.slice(je);
  const broken = STOCK.slice(0, lastComma + 1) + '\r\n' + STOCK.slice(STOCK.indexOf('\t\t}', js));
  ok(B.model(broken).odd === 'braces' && (refusal(() => run(broken, [{ op: 'squad', value: '6' }])) || {}).code === 'oddFile', 'unbalanced braces: the file is not edited');
  ok(B.warnings(noJap).some(w => w.code === 'armyMissing' && w.stage === 1 && w.army === 'jap'), 'warning: a stage with no list for an army');
  const lab = B.model(STOCK).armies.find(a => a.id === 'jap').label;
  let got; try { got = run(noJap, [{ op: 'armyCopy', stage: 1, from: 'eng', to: 'jap' }]); } catch (e) { got = 'refused ' + e.code; }
  ok(got === noJap.slice(0, lastComma + 1) + ',\r\n\t\t\t["jap"] = {--' + lab + '\r\n\t\t\t\t{priority = 0.5, class = UnitClass.Vehicle, unit = "dodgewc55"}\r\n\t\t\t}' + noJap.slice(lastComma + 1), 'copy into a stage with no list adds one ' + JSON.stringify(B.diff(noJap, got, 12)));
  // where bots go
  E([{ op: 'flag', which: 'Neutral', value: '4' }], once(STOCK, 'Neutral = 3 }', 'Neutral = 4 }'), 'flag Neutral 3 -> 4');
  E([{ op: 'squad', value: '8' }], once(STOCK, 'MaxSquadSize = 5\r\n', 'MaxSquadSize = 8\r\n'), 'MaxSquadSize 5 -> 8');
  E([{ op: 'rotation', minutes: '2.5' }], once(STOCK, 'OrderRotationPeriod = 3 * 60 * 1000 -- 3min (ms)', 'OrderRotationPeriod = 2.5 * 60 * 1000 -- 2.5min (ms)'), 'rotation 3 -> 2.5 min, note follows');
  const plain = once(STOCK, '3 * 60 * 1000 -- 3min (ms)', '180000');
  ok(run(plain, [{ op: 'rotation', minutes: '1' }]) === once(STOCK, '3 * 60 * 1000 -- 3min (ms)', '60000'), 'rotation in a plain-ms file stays plain ms');
  const zf = run(STOCK, [{ op: 'flag', which: 'Captured', value: '0' }, { op: 'flag', which: 'Enemy', value: '0' }, { op: 'flag', which: 'Neutral', value: '0' }]);
  ok(B.warnings(zf).some(w => w.code === 'flagsZero'), 'warning: all flag weights 0');
  // the diff: '-' before '+', line numbers
  const d = B.diff(STOCK, once(STOCK, 'MaxSquadSize = 5\r\n', 'MaxSquadSize = 8\r\n'));
  ok(JSON.stringify(d.filter(x => x.t !== ' ' && x.t !== '@')) === JSON.stringify([{ t: '-', n: 1, s: 'MaxSquadSize = 5' }, { t: '+', n: 1, s: 'MaxSquadSize = 8' }]), 'diff lines ' + JSON.stringify(d));
})();

// ---- 3. refusals
(function refusals() {
  const R1 = (ops, code, msg, opt) => { const e = refusal(() => run(STOCK, ops, opt)); ok(e && e.code === code, msg + ': ' + (e ? e.code : 'not refused')); return e; };
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'pz4h', cls: 'Tank' }], 'notInArmy', 'a unit whose card is in another army');
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'nosuch', cls: 'Tank' }], 'notInArmy', 'a unit with no card');
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'veteran_tiger', cls: 'Tank' }], 'notInArmy', 'a unit whose only card is in the helper file vehicles_x (S17)');
  ok(!CARDS.has('x') && ![...CARDS.values()].some(s => s.has('veteran_tiger')), 'cards: the helper file x is no army, its card is in no list ' + [...CARDS.keys()].join());
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk7', cls: 'Tank' }], 'noCards', 'cards unknown: add refused', { cards: null });
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'smgs(eng)', cls: 'Infantry' }], 'dupRow', 'a unit already in the list');
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk"7', cls: 'Tank' }], 'badUnit', 'a unit name with a quote');
  R1([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk7', cls: 'Spaceship' }], 'badClass', 'an unknown class');
  for (const v of ['x', '-1', '1001', '1.5', '']) R1([{ op: 'repeat', stage: 1, value: v }], 'badRepeat', 'Repeat ' + JSON.stringify(v));
  R1([{ op: 'repeat', stage: 9, value: '1' }], 'noStage', 'no stage 9');
  R1([{ op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'priority', value: '0' }], 'badPriority', 'priority 0');
  R1([{ op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'min_team', value: '2.5' }], 'badMinTeam', 'min_team 2.5');
  R1([{ op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'min_income', value: 'lots' }], 'badMinIncome', 'min_income text');
  R1([{ op: 'rowSet', stage: 1, army: 'eng', row: 0, field: 'cost', value: '3' }], 'badField', 'unknown field');
  R1([{ op: 'rowSet', stage: 1, army: 'xx', row: 0, field: 'priority', value: '3' }], 'noArmy', 'no such army list');
  R1([{ op: 'rowSet', stage: 1, army: 'eng', row: 6, field: 'priority', value: '3' }], 'noRow', 'no row 7');
  R1([{ op: 'rowMove', stage: 1, army: 'eng', row: 0, dir: -1 }], 'noMove', 'first row up');
  const n8 = B.model(STOCK).stages[7].armies.jap.length, del8 = Array.from({ length: n8 }, () => ({ op: 'rowDel', stage: 8, army: 'jap', row: 0 }));
  const e8 = R1(del8, 'lastRowForever', 'the last row of a forever stage');
  ok(e8 && e8.at === n8 - 1, 'refusal names the op index ' + (e8 && e8.at));
  R1([2, 3, 4, 5, 6, 7, 8].map(() => ({ op: 'stageDel', stage: 2 })).concat([{ op: 'stageDel', stage: 1 }]), 'onlyStage', 'the only stage');
  R1(Array.from({ length: 43 }, () => ({ op: 'stageAdd', after: 1 })), 'tooManyStages', 'more than 50 stages');
  R1([{ op: 'armyCopy', stage: 1, from: 'eng', to: 'eng' }], 'copySame', 'copy to itself');
  R1([{ op: 'armyCopy', stage: 1, from: 'usa', to: 'jap' }], 'copyNone', 'copy with no unit that has a card');
  for (const v of ['-1', '1001', 'a']) R1([{ op: 'flag', which: 'Enemy', value: v }], 'badFlag', 'flag ' + v);
  R1([{ op: 'flag', which: 'Mine', value: '1' }], 'badField', 'unknown flag kind');
  for (const v of ['0', '0.1', '121', '1.555', 'x']) R1([{ op: 'rotation', minutes: v }], 'badRotation', 'rotation ' + v);
  for (const v of ['-1', '2.5', '101']) R1([{ op: 'squad', value: v }], 'badSquad', 'squad ' + v);
  R1([{ op: 'nuke' }], 'badOp', 'unknown op');
  // forms this page does not edit: two rows on one line, a computed Repeat, a file with no Purchases
  const two = once(STOCK, '"smgs(eng)"},\r\n\t\t\t\t{priority = 3.0', '"smgs(eng)"}, {priority = 3.0');
  ok((refusal(() => run(two, [{ op: 'rowDel', stage: 1, army: 'eng', row: 0 }])) || {}).code === 'oddLine', 'a row sharing its line: refused');
  ok(run(two, [{ op: 'squad', value: '6' }]) === once(two, 'MaxSquadSize = 5', 'MaxSquadSize = 6'), 'that file still takes other edits');
  const fx = once(STOCK, '{--purchase 2\r\n\t\tRepeat = 1,', '{--purchase 2\r\n\t\tRepeat = 1 + 1,');
  ok(B.model(fx).stages[1].odd && (refusal(() => run(fx, [{ op: 'repeat', stage: 2, value: '3' }])) || {}).code === 'oddStage', 'a computed Repeat: that stage is not edited');
  ok((refusal(() => run('MaxSquadSize = 5\r\n', [{ op: 'squad', value: '6' }])) || {}).code === 'oddFile', 'no Purchases table: refused');
  const st = refusal(() => run(STOCK, [{ op: 'squad', value: '6' }]));
  ok(st === null, 'the botcheck gate passes a plain edit');
})();

// ---- 4. routes: read, cards, preview, write (mod copy and copy from the game), base guard, GoH, write gate
(async function routes() {
  const gameDir = path.join(work, 'game');
  W(path.join(gameDir, 'as64.exe'), ''); W(path.join(gameDir, ...BD), STOCK);
  const ctx = { game: () => null, tools: T, tmpRoot: work }, wctx = Object.assign({}, ctx, { game: () => gameDir });
  const own = mkMod(path.join(work, 'mod-own'), '-- \xc1\xee\xf2 note\r\n' + STOCK);
  const r = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(own)), null, ctx);
  ok(r.from === 'mod' && !r.copiesWholeFile && r.model.stages.length === 8 && r.base && r.names['smgs(eng)'] === 'SMG squad', 'read: the mod copy, names from the mod .lng ' + JSON.stringify({ from: r.from, n: r.names }));
  const c = await R['GET /api/x/bots/stages/cards'](U('mod=' + encodeURIComponent(own)), null, ctx);
  ok(c.known && c.cards.eng.some(x => x.unit === 'mk7') && c.cards['*'].some(x => x.unit === 'dodgewc55') && c.cards.jap.some(x => x.unit === 'type95') && c.cards.ger.some(x => x.unit === 'smgs(ger)') && c.names.mk7 === 'Mk VII Tetrarch', 'cards: s(), file name, army-less, squads, names ' + JSON.stringify(c.cards).slice(0, 300));
  const ops = [{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'mk7', cls: 'Tank', priority: '1.0' }, { op: 'squad', value: '6' }];
  const p = await R['POST /api/x/bots/stages/preview'](null, { mod: own, base: r.base, ops }, ctx);
  ok(p.ok && p.changes.length === 2 && p.changes[0].k === 'rowAdd' && !p.written && p.diff.some(d => d.t === '+' && d.s === '\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"}'), 'preview: change list and diff ' + JSON.stringify(p).slice(0, 300));
  const pr = await R['POST /api/x/bots/stages/preview'](null, { mod: own, base: r.base, ops: ops.concat([{ op: 'rowAdd', stage: 1, army: 'eng', unit: 'pz4h', cls: 'Tank' }]) }, ctx);
  ok(!pr.ok && pr.code === 'notInArmy' && pr.at === 2 && pr.args.unit === 'pz4h', 'preview: refusal as a code with the op index ' + JSON.stringify(pr));
  const we = await R['POST /api/x/bots/stages/write'](null, { mod: own, base: r.base, ops }, ctx);
  ok(we.ok === false && we.code === 'noGameDir' && fs.readFileSync(path.join(own, ...BD), 'latin1') === '-- \xc1\xee\xf2 note\r\n' + STOCK, 'write with no game folder: refused as a code, file untouched ' + JSON.stringify(we));
  const w = await R['POST /api/x/bots/stages/write'](null, { mod: own, base: r.base, ops }, wctx);
  const want = '-- \xc1\xee\xf2 note\r\n' + once(once(STOCK, 'MaxSquadSize = 5', 'MaxSquadSize = 6'), 'unit = "willysmb_eng"}\r\n', 'unit = "willysmb_eng"},\r\n\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"}\r\n');
  ok(w.ok && w.written && w.undo && fs.readFileSync(path.join(own, ...BD)).equals(Buffer.from(want, 'latin1')), 'write: exact bytes (cp1251 comment, CRLF, untouched lines)');
  // Undo: the exact bytes from before; a second Undo has nothing left
  const un = await R['POST /api/x/bots/stages/undo'](null, { mod: own }, wctx);
  ok(un.ok && fs.readFileSync(path.join(own, ...BD)).equals(Buffer.from('-- \xc1\xee\xf2 note\r\n' + STOCK, 'latin1')), 'undo: the exact bytes from before ' + JSON.stringify(un));
  const un2 = await R['POST /api/x/bots/stages/undo'](null, { mod: own }, wctx);
  ok(un2.ok === false && un2.code === 'undoNone', 'undo twice: nothing left, as a code ' + JSON.stringify(un2));
  const w1 = await R['POST /api/x/bots/stages/write'](null, { mod: own, base: r.base, ops }, wctx);
  ok(w1.ok && w1.written && fs.readFileSync(path.join(own, ...BD)).equals(Buffer.from(want, 'latin1')), 'write again after the undo');
  const stale = await R['POST /api/x/bots/stages/write'](null, { mod: own, base: r.base, ops: [{ op: 'squad', value: '7' }] }, wctx);
  ok(!stale.ok && stale.code === 'changed' && fs.readFileSync(path.join(own, ...BD), 'latin1') === want, 'write on a stale base: refused, file untouched');
  const w2 = await R['POST /api/x/bots/stages/write'](null, { mod: own, base: w.base, ops: [{ op: 'squad', value: '6' }] }, wctx);
  ok(w2.ok && w2.same && !w2.written, 'write with no real change: nothing written');
  // a mod with no bot list: read the game's, the write puts the whole edited copy in the mod
  const bare = mkMod(path.join(work, 'mod-bare'), null);
  const rb = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(bare)), null, wctx);
  ok(rb.from === 'game' && rb.copiesWholeFile && rb.stock && rb.stock.move.squad === 5, 'read: the game copy when the mod has none ' + JSON.stringify({ from: rb.from, stock: rb.stock }));
  const wb = await R['POST /api/x/bots/stages/write'](null, { mod: bare, base: rb.base, ops: [{ op: 'flag', which: 'Neutral', value: '4' }] }, wctx);
  ok(wb.ok && wb.written && fs.readFileSync(path.join(bare, ...BD), 'latin1') === once(STOCK, 'Neutral = 3 }', 'Neutral = 4 }'), 'write: the mod gets the whole stock file with the edit');
  // Undo of a write that made the file: the copy goes again
  const ub = await R['POST /api/x/bots/stages/undo'](null, { mod: bare }, wctx);
  ok(ub.ok && !fs.existsSync(path.join(bare, ...BD)), 'undo of a first copy: the file is removed again ' + JSON.stringify(ub));
  const ne = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(bare)), null, ctx);
  ok(ne.ok === false && ne.code === 'noList', 'read with no list anywhere: code noList ' + JSON.stringify(ne));
  // GoH: no bot.data.lua (GHMIS-66): read says so, preview refuses as a code
  const gr = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(own) + '&game=goh'), null, ctx);
  ok(gr.goh === true, 'GoH read: goh');
  const ge = await R['POST /api/x/bots/stages/preview'](null, { mod: own, game: 'goh', ops }, ctx);
  ok(ge.ok === false && ge.code === 'goh', 'GoH preview: refused as code goh');
  // the mod folder must not be the game install
  const gi = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(gameDir)), null, wctx);
  ok(gi.ok === false && gi.code === 'inGame', 'the game folder as the mod: refused as code inGame ' + JSON.stringify(gi));
  const tm = await R['POST /api/x/bots/stages/preview'](null, { mod: own, ops: new Array(501).fill({ op: 'squad', value: '6' }) }, wctx);
  ok(tm.ok === false && tm.code === 'tooMany' && tm.args.max === 500, 'more than 500 edits: tooMany');
  await depCards(gameDir);
  await client(gameDir, wctx);
})().then(() => {
  console.log(bad ? 'stages: ' + bad + ' of ' + n + ' FAILED' : 'stages ok (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
}).catch(e => { console.log('FAIL crash ' + (e && e.stack || e)); process.exit(1); });

// ---- 4b. buy cards from a mod this mod needs (mod.info Require) that live only in its .pak; a not_for_sale card is not offered
async function depCards(gameDir) {
  const zw = require(path.join(T, 'lib', 'zipwrite'));
  const base = path.join(gameDir, 'mods', 'basemod'); modInfo(base);
  W(path.join(base, 'mod.info'), '{Mod\r\n\t{Name "Base Realism"}\r\n}\r\n');
  fs.writeFileSync(path.join(base, 'resource.pak'), zw.zip([
    ['set/multiplayer/units/base.set', Buffer.from('{units\r\n\t{"depcard" s(ger) c(1)}\r\n\t{"oldcard" s(ger) c(1) {not_for_sale}}\r\n}\r\n', 'latin1'), true],
    ['interface/text/desc.lng', Buffer.from('{tags\r\n{entity\r\n{depcard "Dep Panther"}\r\n}\r\n}\r\n', 'utf8'), true]]));
  const m = path.join(work, 'mod-dep');
  W(path.join(m, 'mod.info'), '{Mod\r\n\t{Name "Bots for base"}\r\n\t{Require "basemod"}\r\n}\r\n');
  W(path.join(m, ...BD), STOCK);
  const ctx = { game: () => gameDir, tools: T, tmpRoot: work }, q = U('mod=' + encodeURIComponent(m));
  const c = await R['GET /api/x/bots/stages/cards'](q, null, ctx);
  const ger = (c.cards && c.cards.ger) || [];
  ok(c.ok && ger.some(x => x.unit === 'depcard') && !ger.some(x => x.unit === 'oldcard') && c.names.depcard === 'Dep Panther' && c.base && c.base.how === 'require' && !c.missing.length,
    'cards: a card only in the pak of a required mod, its pak name; the not_for_sale card left out ' + JSON.stringify({ ger, base: c.base, nm: c.names.depcard, missing: c.missing }));
  const r = await R['GET /api/x/bots/stages/read'](q, null, ctx);
  const p = await R['POST /api/x/bots/stages/preview'](null, { mod: m, base: r.base, ops: [{ op: 'rowAdd', stage: 1, army: 'ger', unit: 'depcard', cls: 'Tank' }] }, ctx);
  ok(p.ok && p.changes.length === 1 && p.names.depcard === 'Dep Panther', 'preview: the dependency card can be added ' + JSON.stringify(p).slice(0, 200));
  const p2 = await R['POST /api/x/bots/stages/preview'](null, { mod: m, base: r.base, ops: [{ op: 'rowAdd', stage: 1, army: 'ger', unit: 'oldcard', cls: 'Tank' }] }, ctx);
  ok(p2.ok === false && p2.code === 'notInArmy', 'preview: a not_for_sale card is refused like a missing one ' + JSON.stringify(p2));
  W(path.join(m, 'mod.info'), '{Mod\r\n\t{Name "Bots for base"}\r\n\t{Require "nosuchmod"}\r\n}\r\n');
  const c2 = await R['GET /api/x/bots/stages/cards'](q, null, ctx);
  ok(c2.ok && c2.missing.includes('nosuchmod'), 'cards: a required mod that is not installed is named ' + JSON.stringify(c2.missing));
}

// ---- 5. client in the fake DOM: stub BOTS_PARTS, env.api on the routes, kit like the frame's
async function client(gameDir, wctx) {
  ok(!/`|\$\{/.test(X.script) && /BOTS_PARTS\.push\(/.test(X.script) && !/innerHTML/.test(X.script), 'client page rules (no backtick, no dollar-brace, no innerHTML)');
  const keys = new Set(X.lang.map(r => r[0]));
  ok(X.lang.every(r => r.length === 5 && r.every(x => typeof x === 'string' && x) && r[0].startsWith('bots.stages.')) && keys.size === X.lang.length, 'lang rows: 4 languages, bots.stages. keys, no duplicates');
  ok(X.lang.every(r => { const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(); return ph(r[2]) === ph(r[1]) && ph(r[3]) === ph(r[1]) && ph(r[4]) === ph(r[1]); }), 'lang: the same {placeholders} in every language');
  const fakedom = require(path.join(T, 'gui', 'test', 'fakedom')), doc = fakedom.make();
  const hs = /^function h\(.*(?:\n .*)*/m.exec(fs.readFileSync(path.join(T, 'gui', 'page.js'), 'utf8'))[0], h = new Function('document', hs + '\nreturn h;')(doc);
  const EN = {}; X.lang.forEach(r => { EN[r[0]] = r[1]; });
  const missing = new Set();
  // like page.js tx: the .1 form when n is 1 and it exists; a missing key comes back as itself (only this card's keys are flagged:
  // bots.btn.* / bots.details / bots.kind.* are the frame's, with a local fallback here)
  const tx = (k, p) => { if (p && p.n == 1 && (k + '.1') in EN) k += '.1'; if (!(k in EN)) { if (k.startsWith('bots.stages.')) missing.add(k); return k; } return EN[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  const kits = [], parts = [], pend = [], calls = [], asks = [], goes = [], told = [];
  let reloads = 0;
  const searchKit = (inp, o) => { kits.push({ inp, o, attached: !!inp.parentNode }); };
  const askDo = o => { asks.push(o); return { then: cb => cb(true) }; };
  const cm = mkMod(path.join(work, 'client-mod'), STOCK);
  const env = (gid, mod) => ({
    mod, gid, reload() { reloads++; }, go(id) { goes.push(id); }, changed(w, f) { told.push(w + ' ' + f); return 0; },
    api(method, p, data, cb) {
      calls.push(method + ' ' + p);
      const key = method + ' /api/x/bots/' + p.split('?')[0];
      const pr = (method === 'GET' ? R[key](U('mod=' + encodeURIComponent(mod)), null, wctx) : R[key](null, Object.assign({ mod }, data || {}), wctx)).then(j => cb(null, j), e => cb(e.message));
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
  const flush = async () => { for (let k = 0; k < 8; k++) { while (pend.length) await pend.shift(); await new Promise(r => setImmediate(r)); } };
  new Function('BOTS_PARTS', 'h', 'tx', 'searchKit', 'askDo', 'confirm', 'document', X.script)(parts, h, tx, searchKit, askDo, () => true, doc);
  ok(parts.length === 1 && parts[0].id === 'stages' && parts[0].group === 'A' && parts[0].order === 20 && parts[0].title() === 'Stages and movement', 'client: one part pushed');
  // GoH: greyed up front in both cards, the why (GHMIS-66) under Details, no server call
  const gro = doc.createElement('div');
  parts[0].draw(env('goh', cm)).forEach(el => gro.appendChild(el));
  const nas = gro.all().filter(e => e.getAttribute && e.getAttribute('data-na') === '1');
  ok(gro.children.length === 2 && nas.length === 2 && nas.every(e => /^Not available in Gates of Hell/.test(e.textContent)) && gro.textContent.split('GHMIS-66').length === 3
    && gro.all().filter(e => e.tagName === 'DETAILS').length === 2 && calls.length === 0, 'client GoH: greyed line per card, the why in Details, no call');
  ok(nas.length === 2 && nas[0].textContent !== nas[1].textContent && /flag/.test(nas[1].textContent) && !/buy/i.test(nas[1].textContent), 'client GoH: Where bots go gives its own reason, not the buy list one ' + (nas[1] && nas[1].textContent));
  // no mod picked: both cards say so (round 4: Where bots go was blank)
  const nm0 = doc.createElement('div'); parts[0].draw(env('as64', '')).forEach(el => nm0.appendChild(el));
  ok(nm0.children.length === 2 && [...nm0.children].every(c => /Pick your mod first/.test(c.textContent)) && calls.length === 0, 'client: no mod = both cards ask for one, no call');
  const root = doc.createElement('div');
  parts[0].draw(env('as64', cm)).forEach(el => root.appendChild(el));
  await flush();
  const ids = root.all().map(e => e.getAttribute && e.getAttribute('data-blk')).filter(Boolean);
  ok(ids.length && ids.every(i => i.startsWith('bots.stages.')) && ['bots.stages.buy.table', 'bots.stages.move.squad', 'bots.stages.buy.lead', 'bots.stages.buy.timeline'].every(i => ids.includes(i)), 'client: block ids ' + ids.join());
  const btns = () => root.all().filter(e => e.tagName === 'BUTTON');
  // one army and one stage at a time: a strip of 8 small stage buttons (number, full words in the label), stage 1 pressed
  const tl = () => btns().filter(b => b.getAttribute('data-stage'));
  ok(tl().length === 8 && tl()[0].textContent === '1' && tl()[0].getAttribute('aria-label') === 'Stage 1: 1 buy' && tl()[0].getAttribute('aria-pressed') === 'true'
    && tl()[7].getAttribute('aria-label') === 'Stage 8: until the end', 'client: stage strip ' + tl().map(b => b.textContent + '=' + b.getAttribute('aria-label')).join(' | '));
  ok(root.has('Stage 1 of 8: the bot buys once from this list, then goes to stage 2.'), 'client: the picked stage in a plain sentence');
  const tables = () => root.all().filter(e => e.tagName === 'TABLE');
  const trs = () => tables()[0].all().filter(e => e.tagName === 'TBODY')[0].children;
  ok(trs().length === 6 && root.has('SMG squad') && root.has('smgs(eng)') && tables()[0].all().filter(e => e.tagName === 'TH').length === 4, 'client: stage 1 eng table (unit, kind, priority, buttons), in-game names ' + trs().length);
  // the rest folded: stage settings, limits, copy under More options; file keys only under Details
  const more = root.all().filter(e => e.tagName === 'DETAILS' && e.children[0] && e.children[0].textContent === 'More options');
  ok(more.length === 2 && more[0].textContent.includes('Buys in this stage') && !tables()[0].textContent.includes('Min income') && more[0].textContent.includes('Copy a list') && tables().length === 1, 'client: More options holds stage settings and copy; one table on the page');
  // the limits are two more columns of the same table behind a tick box, not a second list
  const limBox = () => root.all().find(e => e.tagName === 'INPUT' && e.getAttribute('data-lim') === '1');
  ok(limBox() && root.has('Show the income and team limits') && !tables()[0].textContent.includes('Min income'), 'client: limits tick box, off at first');
  limBox().checked = true; limBox().fire('change'); await flush();
  ok(tables().length === 1 && tables()[0].all().filter(e => e.tagName === 'TH').length === 6 && tables()[0].textContent.includes('Min income') && root.has('Empty = no limit'), 'client: limits on = 2 more columns in the one table');
  limBox().checked = false; limBox().fire('change'); await flush();
  ok(tables()[0].all().filter(e => e.tagName === 'TH').length === 4, 'client: limits off again');
  const dets = root.all().filter(e => e.tagName === 'DETAILS' && e.children[0] && e.children[0].textContent === 'Details').map(e => e.textContent), keysTxt = dets.join(' ');
  let outside = root.textContent; dets.forEach(d => { outside = outside.split(d).join(' '); });
  const leak = /.{0,40}(FlagPriority|OrderRotationPeriod|MaxSquadSize|\bRepeat\b|MIS-\d|GHMIS).{0,40}/.exec(outside);
  ok(/FlagPriority\.Captured/.test(keysTxt) && /OrderRotationPeriod/.test(keysTxt) && /MaxSquadSize/.test(keysTxt) && /Repeat/.test(keysTxt) && !leak, 'client: file keys only under Details ' + (leak ? leak[0] : dets.length));
  ok(root.has('Squads larger than') && root.has('Bots re-think their flag every'), 'client: plain setting names');
  ok(root.has('split point, not a maximum') && root.has('picked more often') && root.has('stock: 5') && root.has('stock: 3'), 'client: movement hints and stock values');
  // the stage strip: stage 2 shows its own list
  tl()[1].click(); await flush();
  const showAll = () => btns().find(b => b.getAttribute('data-showall') === '1');
  ok(trs().length === 8 && showAll() && showAll().textContent === 'Show all 10' && tl()[1].getAttribute('aria-pressed') === 'true' && root.has('Stage 2 of 8'), 'client: stage 2 picked from the strip, 8 rows then Show all ' + trs().length);
  showAll().click(); await flush();
  ok(trs().length === 10 && !showAll(), 'client: Show all shows the 10 rows');
  tl()[0].click(); await flush();
  // the unit box: searchKit once in its row, history key, index of the army's cards (in-game name first, id small), Browse
  const sk = kits.find(x => x.o.key === 'bots.stages.unit');
  let hits = null; if (sk) { sk.o.index('tetr', l => { hits = l; }); await flush(); }
  const mk = hits && hits.find(x => x.value === 'mk7');
  ok(sk && sk.attached && sk.o.browse && sk.o.browse.start === 'entity' && mk && mk.label === 'Mk VII Tetrarch' && /^mk7\b/.test(mk.hint) && !hits.some(x => x.value === 'pz4h'), 'client: unit box searchKit (attached, in-game name, Browse) ' + JSON.stringify(hits));
  let vt = null; sk.o.index('veteran', l => { vt = l; }); await flush();
  ok(vt && !vt.some(x => x.value === 'veteran_tiger'), 'client: a unit with no buy card is not offered ' + JSON.stringify(vt));
  const add = btns().find(b => b.textContent === 'Add');
  sk.o.onPick(mk.value, mk); ok(sk.inp.value === 'Mk VII Tetrarch', 'client: a pick puts the in-game name in the box');
  add.click(); await flush();
  const pvb = i => btns().filter(b => b.getAttribute('data-preview') === '1')[i], wOf = i => btns().filter(b => b.textContent === 'Write into my mod')[i];
  const off0 = b => b.disabled || b.getAttribute('disabled') != null;
  ok(root.has('1 edit not written yet. Press "Preview"') && !root.all().find(e => e.tagName === 'PRE') && off0(wOf(0)) && !off0(pvb(0)) && pvb(0).textContent === 'Preview' && /primary/.test(pvb(0).className || pvb(0).getAttribute('class') || ''),
    'client: an edit waits for Preview, Write is off until then ' + JSON.stringify([root.has('1 edit not written yet. Press "Preview"'), !!root.all().find(e => e.tagName === 'PRE'), wOf(0) && off0(wOf(0)), pvb(0) && [pvb(0).disabled, pvb(0).textContent, pvb(0).getAttribute('class')]]));
  const order = btns().filter(b => ['Preview', 'Write into my mod', 'Undo'].includes(b.textContent)).slice(0, 3).map(b => b.textContent).join();
  ok(order === 'Preview,Write into my mod,Undo', 'client: button order Preview, Write, Undo ' + order);
  pvb(0).click(); await flush();
  let pre = root.all().find(e => e.tagName === 'PRE');
  const pt = pre ? pre.textContent : '', im = pt.indexOf('- '), ip = pt.indexOf('+ ');
  ok(pre && pt.includes('+ \t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "mk7"}') && im >= 0 && im < ip && root.has('Stage 1, Commonwealth: add Mk VII Tetrarch') && !root.has('(mk7)') && trs().length === 7, 'client: add -> preview with the change, the diff removed-first, the table follows ' + pt.slice(0, 200));
  sk.inp.value = 'pz4h'; add.click(); await flush();
  ok(root.has('Unit: Commonwealth bots cannot buy pz4h: it has no buy card for Commonwealth') && root.has('What the bots will do differently (1 change):'), 'client: a unit from another army is refused, the earlier edit stays');
  const nPrev = calls.filter(c => c === 'POST stages/preview').length;
  sk.inp.value = 'veteran_tiger'; add.click(); await flush();
  const pone = () => root.all().filter(e => e.getAttribute && e.getAttribute('data-pickone') === '1');
  ok(pone().length === 1 && /Pick one from the list\.$/.test(pone()[0].textContent) && calls.filter(c => c === 'POST stages/preview').length === nPrev && root.has('What the bots will do differently (1 change):'),
    'client: a name that fits no buy card of the army (a helper-file unit, S17) is refused in place: pick one from the list ' + pone().length);
  // round 4: a typed text that fits one card is taken on Enter and on leaving the box; several or none = pick one from the list
  sk.inp.value = 'e'; sk.inp.fire('blur'); await flush();
  ok(pone().length === 1 && sk.inp.value === 'e', 'client: a text that fits several cards is not guessed');
  sk.inp.fire('input'); ok(pone().length === 0, 'client: typing clears the pick-one line');
  sk.inp.value = 'tetr'; sk.inp.fire('blur'); await flush();
  ok(sk.inp.value === 'Mk VII Tetrarch' && pone().length === 0, 'client: leaving the box with a single match puts its in-game name in ' + sk.inp.value);
  sk.inp.value = 'Tetrarch'; sk.inp.fire('keydown', { key: 'Enter' }); await flush();
  ok(root.has('Mk VII Tetrarch is already in this list (stage 1, Commonwealth)'), 'client: Enter adds the single match (here: refused as already in the list)');
  // round 4: the search ignores spaces, dots and case, and knows 7 = VII; the example in the box is a name the box accepts
  const find = async q => { let r = null; sk.o.index(q, l => { r = l; }); await flush(); return (r || []).map(x => x.value).join(); };
  ok(await find('MkVII.tetrarch') === 'mk7' && await find('Mk 7 Tetrarch') === 'mk7' && await find('MK-VII') === 'mk7', 'client: loose search (spaces, dots, case, 7 = VII)');
  const none = () => root.all().filter(e => e.getAttribute && e.getAttribute('data-none') === '1');
  ok(await find('zzzz') === '' && none().length === 1 && /^Nothing found\. Try /.test(none()[0].textContent), 'client: an empty search says so with a hint');
  ok(await find('tetr') === 'mk7' && none().length === 0, 'client: the empty-search line goes with the next hit');
  const ph = sk.inp.getAttribute('placeholder');
  ok(ph === 'in-game name, e.g. Mk VII Tetrarch' && await find(ph.split('e.g. ')[1]) === 'mk7', 'client: the placeholder example is a name the box finds ' + ph);
  const aopts = root.all().filter(e => e.tagName === 'OPTION' && e.getAttribute('value') === 'eng');
  ok(aopts.length && aopts.every(o => o.textContent === 'Commonwealth' && o.getAttribute('title') === 'eng'), 'client: army by its name, the code in the hover text ' + (aopts[0] && aopts[0].textContent));
  ok(!btns().some(b => b.textContent === 'Remove the last edit') && X.lang.every(r => r[1] !== 'Remove the last edit'), 'client: one Undo, no "Remove the last edit"');
  // an in-game name typed in full is taken as its card
  sk.inp.value = 'SMG squad'; add.click(); await flush();
  ok(root.has('SMG squad is already in this list (stage 1, Commonwealth)'), 'client: a typed in-game name resolves to its card');
  // a priority edit on the new table
  const pin = root.all().find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'Priority dodgewc55');
  pin.value = '2'; pin.fire('change'); await flush();
  // stage editor: an edit with no Preview keeps Write greyed, and a click that gets through all the same writes nothing
  { const nw = () => calls.filter(c => c === 'POST stages/write').length, w0 = nw(), a0 = asks.length, b0 = fs.readFileSync(path.join(cm, ...BD));
    ok(off0(wOf(0)) && !off0(pvb(0)), 'client: stage editor: an edit greys Write until Preview');
    wOf(0).disabled = false; wOf(0).click(); await flush();
    ok(nw() === w0 && asks.length === a0 && fs.readFileSync(path.join(cm, ...BD)).equals(b0), 'client: stage editor: Write with no Preview does nothing, even when the click gets through ' + (nw() - w0) + ' ' + (asks.length - a0)); }
  pvb(0).click(); await flush();
  ok(root.has('Stage 1, Commonwealth, dodgewc55: Priority 0.5 -> 2') && root.has('What the bots will do differently (2 changes):'), 'client: priority edit in the change list');
  // where bots go: a flag weight
  const fin = root.all().find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'Free flags');
  fin.value = '4'; fin.fire('input'); fin.fire('change'); await flush();
  ok(off0(wOf(1)) && !off0(pvb(1)) && /Press "Preview" first/.test(wOf(1).getAttribute('title') || ''), 'client: Where bots go: Write is greyed until Preview, and says why');
  // a click that reaches the greyed button all the same (a script, a stale page): nothing asked, nothing sent, nothing written
  { const nw = () => calls.filter(c => c === 'POST stages/write').length, w0 = nw(), a0 = asks.length, b0 = fs.readFileSync(path.join(cm, ...BD));
    wOf(1).disabled = false; wOf(1).click(); await flush(); wOf(1).onclick && wOf(1).onclick(); await flush();
    ok(nw() === w0 && asks.length === a0 && fs.readFileSync(path.join(cm, ...BD)).equals(b0), 'client: Where bots go: Write with no Preview does nothing, even when the click gets through ' + (nw() - w0) + ' ' + (asks.length - a0)); }
  pvb(1).click(); await flush();
  ok(!off0(wOf(1)) && off0(pvb(1)), 'client: Where bots go: Write is on once the preview of these values is shown');
  const en2 = root.all().find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'Enemy flags');
  en2.value = '5'; en2.fire('change'); await flush();
  ok(off0(wOf(1)) && !off0(pvb(1)), 'client: a new edit greys Write again until the next Preview');
  en2.value = '2'; en2.fire('change'); await flush();
  const own = root.all().find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'Own flags');
  own.value = '5000'; own.fire('change'); await flush();
  ok(root.has('Own flags: a number from 0 to 1000 (you typed 5000).') && !root.has('Flag number'), 'client: a refused flag value names its field');
  pvb(1).click(); await flush();
  ok(root.has('Free flags: 3 -> 4') && root.has('own 14%, enemy 29%, free 57%'), 'client: flag edit and the chance line');
  const wbs = btns().filter(b => b.textContent === 'Write into my mod');
  ok(wbs.length === 2 && wbs.every(b => !b.disabled), 'client: one Write per card');
  const unds = () => btns().filter(b => b.getAttribute('data-undo') === '1'), off = b => b.disabled || b.getAttribute('disabled') != null;
  ok(unds().length === 2 && unds().every(b => off(b) && b.textContent === 'Undo' && /greyed while there is nothing to undo/.test(b.getAttribute('title'))), 'client: Undo greyed until something is written');
  wbs[0].click(); await flush();
  const after = fs.readFileSync(path.join(cm, ...BD), 'latin1');
  ok(asks.length === 1 && /^Write 2 changes into your mod/.test(asks[0].lines[0]), 'client: the confirm counts the same 2 changes ' + JSON.stringify(asks[0] && asks[0].lines));
  ok(reloads === 0 && told.length === 1 && told[0] === 'buys stages' && after.includes('unit = "mk7"}') && after.includes('{priority = 2.0, class = UnitClass.Vehicle, unit = "dodgewc55"}') && after.includes('Neutral = 3 }'),
    'client: Write of the buy card writes its edits only, then tells the frame ' + JSON.stringify(told));
  const box = () => root.all().find(e => e.getAttribute && e.getAttribute('data-done') === '1');
  ok(box() && box().textContent.startsWith('Done: 2 changes written into your mod.') && box().textContent.includes('Stage 1, Commonwealth: add Mk VII Tetrarch') && box().textContent.split('To see it:').length === 2 && box().textContent.includes('To see it: try a bot match'), 'client: the green box: Done: <what>, then To see it once ' + (box() && box().textContent.slice(0, 200)));
  ok(trs().length === 7 && root.has('Editing the bot list of your mod.') && calls.filter(c => c === 'GET stages/read').length === 2, 'client: the list is read again after the write');
  const bb = box().all().filter(e => e.tagName === 'BUTTON');
  bb.find(b => b.textContent === 'Try a bot match').click();
  ok(goes.includes('bots.botmatch') && bb.some(b => b.textContent === 'Open the log'), 'client: next buttons ' + JSON.stringify(goes));
  // the flag edit of the other card is still pending, the box stays until the next edit
  ok(root.has('Free flags: 3 -> 4'), 'client: the other card keeps its pending edit');
  ok(!bb.some(b => b.getAttribute('data-undo') === '1') && unds().length === 2 && unds().every(b => !off(b)), 'client: after a write the Undo of both cards is on (one file, one state), none in the done box');
  unds()[0].click(); await flush();
  ok(fs.readFileSync(path.join(cm, ...BD)).equals(Buffer.from(STOCK, 'latin1')) && root.has('Undone: the bot list in your mod is back exactly as it was before the last write.') && told.length === 2 && trs().length === 6,
    'client: Undo puts the exact bytes back, says so, list read again ' + JSON.stringify(told));
  ok(!box() && unds().every(off) && root.all().some(e => e.getAttribute && e.getAttribute('data-undone') === '1'), 'client: after Undo the done box is gone and Undo is greyed again');
  // the two words explained on hover, in place
  const tips = root.all().filter(e => e.getAttribute && e.getAttribute('title') && /^A (stage|buy card) is/.test(e.getAttribute('title')));
  ok(tips.length === 2 && root.has('Words used here:'), 'client: stage and buy card explained once on hover ' + tips.length);
  // S18: with the frame's Undo in the kit (one state per file, read from the server) the card uses it
  const stubs = [], withUB = e => { e.kit.undoBtn = (rels, o) => { const s = h('span', { 'data-stub': '1' }); s.refresh = () => {}; stubs.push({ rels: typeof rels === 'function' ? rels() : rels, o }); return s; }; return e; };
  const r3 = doc.createElement('div'); parts[0].draw(withUB(env('as64', cm))).forEach(el => r3.appendChild(el)); await flush();
  ok(stubs.length === 2 && stubs.every(s => s.rels.join() === 'script/multiplayer/bot.data.lua' && typeof s.o.onDone === 'function') && r3.all().filter(e => e.getAttribute && e.getAttribute('data-stub') === '1').length === 2 && !r3.all().some(e => e.getAttribute && e.getAttribute('data-undo') === '1'),
    'client: the frame Undo on both cards when the kit has it ' + stubs.length);
  ok(missing.size === 0, 'client: every text key exists: ' + [...missing].join(' '));
}
