// Bots part "targets" test. Arg: scratch dir. No game, no network: a made-up AS2 install and a made-up GoH install in the scratch dir,
// both with files in the stock forms (CRLF, tabs, comments, a cp1251 byte), plus the browser side in the fake DOM: the brain part, the
// symptom picker and the two cards drawn into one page, every symptom jump must land on a block that exists (opened and marked), the
// counts in Write's question match the list, the green box after a write and its Undo (the frame's one Undo, lib.undoRoute).
// Author: Imperator_Aug (ARSENAL, ia-09a0f3fa)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'bots-targets-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), T = require('./tparse'), LANG = require('./lang'), CAT = require('./catalog.json');
const GUI = path.join(__dirname, '..', '..', '..', '..');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };
const R = X.routes, U = q => ({ searchParams: new URLSearchParams(q) });
const C = s => s.replace(/\n/g, '\r\n');   // stock files are CRLF

// ---- fixtures in the stock forms (AS2)
const SELECT = C('{selectors\n\t(include "human_bullet.inc")\n\t(include "human_ap.inc")\n\t(include "tank.inc")\n}\n ');
const HB = C('{selector\n\t{unit "human" "bullet"}\n\n\t{group\n\t\t{sort \t{in_range 10}}\n\t\t{sort\t{attacking}}\n\t\t{sort\t{class human} {weapon "bullet"}}\n\t\t{sort\tdistance}\n\t}\n}\n');
const HAP = C('{selector\n\t{unit "human" "ap"}\n\n\t{group\n\t\t{sort {class tank}}\n\t\t{sort {class armoredcar}}\n\t\t{sort distance}\n    }\n}\n');
const TANK = C('{selector\n\t{type "tank"}\n\t{group\n\t\t{ignore {class airborne}}\n\t\t{select {weapon "ap"}}\n\t\t{select {weapon "fg"}}\t\t\n\n\t\t{sort {weapon "ap"} {attacking} {class tank}}\n\t\t{sort time_to_aim}\n\t}\n\t{group\n\t\t{sort {class tank}}\n\t\t{sort {class armoredcar}}\n\t\t{sort time_to_aim}\n\t}\n\n}\n');
const AMMO = C(';;; Select best weapon and ammo \xe0\xe1 ;;;\n;;{ready_for_shot}\t- ammo charged\n\n{select_ammo\n\t{human in_cover\n\t\t{"grenade fg" {check_grenade}}\n\t\t{"bullet"}\n\t\t{"ammo rocketlauncher" {enable_for_user 0}}\n\t\t{"light"}\n\t}\n\t{human\n\t\t{"shell fg" {ground} {ready_for_shot}}\n;\t\t{"ptr" {enable_for_human_user 0}}\n\t\t{"zenite" {enable_for_human_user 0}} ; prohibit the usage (for player infantry)\n\t\t{"hmgun"}\n\t\t{"bullet"}\n\t\t{"ammo rocketlauncher" {enable_for_user 0}}\n\t\t{"light"}\n\t}\n\t{light_tank\n\t\t{"hmgun" {volume "body"}}\n\t\t{"shell ap"}\n\t}\n\t{tank\n\t\t{"size3 fg" {volume "body"} {ready_for_shot}}\n\t\t{"shell ap" {volume "body"}}\n\t\t{"shell ap"}\n\t\t{"grenade ap" {volume "body"}}\n\t\t{"shell fg"}\n\t\t{"light"}\n\t}\n\n;\t{unknown\n;\t}\n}\n');
const as2 = path.join(work, 'as2'), goh = path.join(work, 'goh'), mod = path.join(work, 'mod'), gmod = path.join(work, 'gmod'); modInfo(mod); modInfo(gmod);
const TD = d => path.join(d, 'resource', 'set', 'target');
W(path.join(as2, 'as64.exe'), '');
for (const [f, t] of [['select.set', SELECT], ['human_bullet.inc', HB], ['human_ap.inc', HAP], ['tank.inc', TANK], ['ammo.set', AMMO]]) W(path.join(TD(as2), f), t);
fs.mkdirSync(mod, { recursive: true }); fs.mkdirSync(gmod, { recursive: true });
const ctx = { game: () => as2, gameId: () => 'as64', tools: path.join(GUI, '..'), tmpRoot: work };
const noGame = { game: () => null, gameId: () => 'as64' };

// ---- GoH fixtures in the GoH stock forms (;// comments, several selectors per file, tank_* classes, small_arms)
const GSEL = C('{selectors\n\t(include "human_ap.inc")\n\t(include "tank_medium.inc")\n}\n');
const GAP = C('{selector\n\t{unit "human" "rocketlauncher"}\t;// "unit tag" or "unit type"\n\n\t{group\t;// priority\n\t\t{select {class tank_heavy} {in_range 150}}\n\t\t{select {class tank_medium} {in_range 150}}\n\t\t{sort distance}\n\t}\n}\n\n{selector\n\t{unit "human" "at_rifle"}\n\n\t{group\n\t\t{sort {class armoredcar}}\n\t}\n}\n');
const GTM = C('{selector\n\t{type "tank_medium"}\t;// "unit tag"\n\n\t{group\n\t\t{ignore {class airborne}}\n\t\t{select {class tank_medium}}\n\t\t{sort {attacking}}\n\t\t{sort distance}\n\t}\n\t\n\t{group\n\t\t{sort {class human}}\n\t\t{sort distance}\n\t}\n}\n');
const GAM = C('{select_ammo\n\t{human\t\t\t\t; -TARGET CLASS-\n\t\t{"small_arms" {ready_for_shot}}\t\t; bullet ammo\n\t\t{"small_arms"}\n;//\t\t{"ammo rocketlauncher" {ground}}\n\t\t{"light"}\n\t}\n\t{tank_light\n\t\t{"shell ap"}\n\t\t{"ammo rocketlauncher" {volume "body"}}\n\t}\n\t{tank_medium\n\t\t{"shell ap"}\n\t}\n\t{unknown}\n}\n');
W(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
for (const [f, t] of [['select.set', GSEL], ['human_ap.inc', GAP], ['tank_medium.inc', GTM], ['ammo.set', GAM]]) W(path.join(TD(goh), f), t);
const gctx = { game: () => as2, gameId: () => 'goh', exe: () => 'goh', kind: () => 'goh', curDir: () => goh, gohDir: () => goh, tools: path.join(GUI, '..'), tmpRoot: work };

const act = (kind, text, a) => T.applyAll(kind, text, [a]).text;
const throwsT = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
async function rej(p, re, status) { try { await p; return 'no error'; } catch (e) { return (re.test(e.message) && (!status || e.status === status)) ? '' : 'got ' + e.status + ' ' + e.message; } }

async function server() {
  // ---- reading: stock forms, round trip
  ok(JSON.stringify(T.includes(SELECT)) === '["human_bullet.inc","human_ap.inc","tank.inc"]', 'select.set include order');
  const S = T.selectors(TANK)[0];
  ok(S.type === 'tank' && S.groups.length === 2 && S.groups[0].select.length === 2 && S.groups[0].ignore[0][0].v === 'airborne' && S.groups[0].key === 'time_to_aim', 'tank list read: 2 groups, select x2, ignore airborne, key');
  ok(T.selectors(HB)[0].groups[0].ranges.length === 1 && T.selectors(HB)[0].groups[0].ranges[0].v === '10', 'in_range read from a sort term (metres)');
  const A = T.ammo(AMMO);
  ok(A.map(b => b.cls + (b.cond ? '/' + b.cond : '') + ':' + b.rules.length).join() === 'human/in_cover:4,human:6,light_tank:2,tank:6', 'ammo blocks read, commented rule and block skipped: ' + A.map(b => b.cls + ':' + b.rules.length).join());
  ok(A[1].rules[1].tags === 'zenite' && A[1].rules[1].human === false && A[1].rules[1].user === true && A[1].rules[4].user === false && A[1].rules[4].ai === true, 'switches read: enable_for_human_user 0, enable_for_user 0');
  ok(T.ammo(GAM)[3].cls === 'unknown' && T.ammo(GAM)[3].rules.length === 0, 'GoH empty {unknown} block read');
  for (const [k, t, a] of [['sel', TANK, { op: 'moveGroup', sel: 0, group: 0, dir: 1 }], ['ammo', AMMO, { op: 'moveRule', block: 1, rule: 1, dir: 1 }],
    ['ammo', AMMO, { op: 'switch', block: 1, rule: 4, key: 'enable_for_user', on: true }], ['sel', GTM, { op: 'moveGroup', sel: 0, group: 1, dir: -1 }]]) {
    const once = act(k, t, a), inv = a.op === 'switch' ? Object.assign({}, a, { on: !a.on }) : Object.assign({}, a, { group: a.group != null ? a.group + a.dir : undefined, rule: a.rule != null ? a.rule + a.dir : undefined, dir: -a.dir });
    ok(once !== t && act(k, once, inv) === t, 'round trip byte-identical: ' + a.op + ' then back');
  }
  // ---- each action exact
  ok(act('sel', TANK, { op: 'moveGroup', sel: 0, group: 1, dir: -1 }) === C('{selector\n\t{type "tank"}\n\t{group\n\t\t{sort {class tank}}\n\t\t{sort {class armoredcar}}\n\t\t{sort time_to_aim}\n\t}\n\t{group\n\t\t{ignore {class airborne}}\n\t\t{select {weapon "ap"}}\n\t\t{select {weapon "fg"}}\t\t\n\n\t\t{sort {weapon "ap"} {attacking} {class tank}}\n\t\t{sort time_to_aim}\n\t}\n\n}\n'), 'moveGroup: whole lines swap, text between kept');
  ok(act('sel', HB, { op: 'setRange', sel: 0, group: 0, term: 0, value: '25' }) === HB.replace('{in_range 10}', '{in_range 25}'), 'setRange: only the number changes');
  ok(act('sel', HAP, { op: 'addGroup', sel: 0, cls: 'tank', range: '300' }) === HAP.replace('    }\r\n}', '    }\r\n\t{group\r\n\t\t{select {class tank} {in_range 300}}\r\n\t}\r\n}'), 'addGroup at the end: indent of the neighbour, CRLF');
  ok(act('sel', TANK, { op: 'addGroup', sel: 0, cls: ['human'], range: '30', at: 0 }).startsWith(C('{selector\n\t{type "tank"}\n\t{group\n\t\t{select {class human} {in_range 30}}\n\t}\n\t{group\n\t\t{ignore')), 'addGroup at the top');
  ok(act('sel', TANK, { op: 'removeGroup', sel: 0, group: 1 }) === C('{selector\n\t{type "tank"}\n\t{group\n\t\t{ignore {class airborne}}\n\t\t{select {weapon "ap"}}\n\t\t{select {weapon "fg"}}\t\t\n\n\t\t{sort {weapon "ap"} {attacking} {class tank}}\n\t\t{sort time_to_aim}\n\t}\n\n}\n'), 'removeGroup: its lines go');
  ok(act('ammo', AMMO, { op: 'moveRule', block: 1, rule: 1, dir: 1 }).includes(C('\t\t{"hmgun"}\n\t\t{"zenite" {enable_for_human_user 0}} ; prohibit the usage (for player infantry)\n\t\t{"bullet"}')), 'moveRule: the line moves with its comment');
  ok(act('ammo', AMMO, { op: 'switch', block: 1, rule: 3, key: 'enable_for_ai', on: false }).includes('\t\t{"bullet" {enable_for_ai 0}}\r\n\t\t{"ammo rocketlauncher"'), 'switch off: {enable_for_ai 0} added after the tags');
  ok(act('ammo', AMMO, { op: 'switch', block: 1, rule: 0, key: 'enable_for_user', on: false }).includes('{"shell fg" {ground} {ready_for_shot} {enable_for_user 0}}'), 'switch off: added after the last option');
  ok(act('ammo', AMMO, { op: 'switch', block: 1, rule: 4, key: 'enable_for_user', on: true }).includes('\t\t{"bullet"}\r\n\t\t{"ammo rocketlauncher"}\r\n\t\t{"light"}\r\n\t}\r\n\t{light_tank'), 'switch on: the {enable_for_user 0} option goes');
  ok(act('ammo', 'x {select_ammo {tank {"a" {enable_for_ai 1}}}}', { op: 'switch', block: 0, rule: 0, key: 'enable_for_ai', on: false }) === 'x {select_ammo {tank {"a" {enable_for_ai 0}}}}', 'switch off: an option set to 1 becomes 0');
  ok(T.applyAll('ammo', AMMO, [{ op: 'switch', block: 1, rule: 4, key: 'enable_for_user', on: false }]).did.length === 0, 'switch to the state it has = no change');
  ok(act('ammo', AMMO, { op: 'addRule', block: 3, tags: 'bullet' }).includes(C('\t\t{"shell fg"}\n\t\t{"light"}\n\t\t{"bullet"}\n\t}\n\n;\t{unknown')), 'addRule at the end of the tank block');
  ok(act('ammo', AMMO, { op: 'addRule', block: 2, tags: 'bullet', at: 0 }).includes(C('\t{light_tank\n\t\t{"bullet"}\n\t\t{"hmgun" {volume "body"}}')), 'addRule at the top');
  ok(act('ammo', AMMO, { op: 'removeRule', block: 2, rule: 1 }).includes(C('\t{light_tank\n\t\t{"hmgun" {volume "body"}}\n\t}\n\t{tank')), 'removeRule');
  ok(act('sel', '{selector {type "t"} {group {sort distance}} {group {sort {class tank}}}}', { op: 'moveGroup', sel: 0, group: 0, dir: 1 }) === '{selector {type "t"} {group {sort {class tank}}} {group {sort distance}}}', 'one-line file: the brace blocks swap');
  ok(act('sel', '{selector {type "t"} {group {sort distance}}}', { op: 'addGroup', sel: 0, cls: 'tank' }) === '{selector {type "t"} {group {sort distance}} {group {select {class tank}}}}', 'one-line file: a group added on the line');
  // ---- refusals
  ok(throwsT(() => act('sel', TANK, { op: 'moveGroup', sel: 0, group: 0, dir: -1 }), /already first/), 'refused: first group up');
  ok(throwsT(() => act('sel', HB, { op: 'removeGroup', sel: 0, group: 0 }), /at least one group/), 'refused: removing the last group');
  ok(throwsT(() => act('sel', HB, { op: 'setRange', sel: 0, group: 0, term: 0, value: '-5' }), /metres above 0/) && throwsT(() => act('sel', HB, { op: 'setRange', sel: 0, group: 0, term: 0, value: '20000' }), /up to 10000/), 'refused: bad range');
  ok(throwsT(() => T.applyAll('sel', HAP, [{ op: 'addGroup', sel: 0, cls: 'panzer' }], { classes: ['tank', 'human'] }), /Unknown target class/), 'refused: class the files do not use');
  ok(throwsT(() => act('sel', HAP, { op: 'addGroup', sel: 0, cls: 'tank}{x' }), /one word/), 'refused: class with braces');
  ok(throwsT(() => T.applyAll('ammo', AMMO, [{ op: 'addRule', block: 3, tags: 'laser' }], { tags: ['bullet'] }), /Unknown ammo tags/) && throwsT(() => act('ammo', AMMO, { op: 'addRule', block: 3, tags: 'a"b' }), /words separated/), 'refused: unknown or bad ammo tags');
  ok(throwsT(() => act('ammo', AMMO, { op: 'switch', block: 1, rule: 0, key: 'enable_for_all', on: false }), /Unknown switch/), 'refused: unknown switch key');
  ok(throwsT(() => act('ammo', 'x {select_ammo {tank {"a" {disable}}}}', { op: 'switch', block: 0, rule: 0, key: 'enable_for_ai', on: true }), /switched off for everyone/), 'refused: a {disable} rule');
  ok(throwsT(() => act('ammo', GAM, { op: 'addRule', block: 3, tags: 'shell ap' }), /no rule to place/), 'refused: add into an empty block');
  ok(throwsT(() => act('sel', TANK, { op: 'explode', sel: 0 }), /Unknown change/) && throwsT(() => T.applyAll('sel', TANK, []), /No change/), 'refused: unknown op, empty list');
  ok(throwsT(() => T.tree('{a {b}'), /never closed/) && throwsT(() => T.tree('{a}}'), /no \{ before/), 'refused: unbalanced braces');

  // ---- presets: each seeded symptom fixture -> the fixed form
  const info = X._.infoOf(ctx, mod, ['human_bullet.inc', 'human_ap.inc', 'tank.inc']);
  ok(info.bulletTag === 'bullet' && info.tankClasses.join() === 'light_tank,tank' && info.classes.includes('human') && info.tags.includes('shell ap'), 'what actions may name, from the files: ' + JSON.stringify(info).slice(0, 200));
  const mg = T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'mgTank' }], info).text;
  ok(mg.includes(C('\t\t{"shell ap"}\n\t\t{"bullet"}\n\t}\n\t{tank')) && mg.includes(C('\t\t{"light"}\n\t\t{"bullet"}\n\t}\n\n;\t{unknown')), 'preset mgTank: a last bullet rule in light_tank and tank');
  ok(throwsT(() => T.applyAll('ammo', mg, [{ op: 'preset', id: 'mgTank' }], info), /Nothing to fix/), 'preset mgTank on the fixed form: nothing to fix');
  const off = T.applyAll('ammo', mg, [{ op: 'preset', id: 'mgTankOff' }], info);
  ok(off.text === AMMO && off.did.length === 2, 'preset mgTankOff (the other direction): the bullet rules of the tank blocks go, the stock form back');
  ok(throwsT(() => T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'mgTankOff' }], info), /Nothing to fix/), 'preset mgTankOff on stock (no bullet rule in a tank block): nothing to fix');
  const twoB = AMMO.replace(C('\t\t{"light"}\n\t}\n\n;'), C('\t\t{"bullet"}\n\t\t{"light"}\n\t\t{"bullet" {volume "body"}}\n\t}\n\n;'));
  ok(twoB !== AMMO && T.applyAll('ammo', twoB, [{ op: 'preset', id: 'mgTankOff' }], info).text === AMMO, 'preset mgTankOff: two bullet rules in one block both go (last first)');
  const ri = T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'rocketInf' }], info).text;
  ok(ri === AMMO.split('{"ammo rocketlauncher" {enable_for_user 0}}').join('{"ammo rocketlauncher"}'), 'preset rocketInf: both human launcher rules switched on for player units, nothing else');
  const seededAP = C('{selector\n\t{unit "human" "ap"}\n\n\t{group\n\t\t{select {class tank} {in_range 150}}\n\t\t{sort distance}\n\t}\n}\n');
  const ft = T.applyAll('sel', seededAP, [{ op: 'preset', id: 'farTanks' }], info).text;
  ok(ft === C('{selector\n\t{unit "human" "ap"}\n\n\t{group\n\t\t{select {class tank} {in_range 150}}\n\t\t{sort distance}\n\t}\n\t{group\n\t\t{select {class light_tank}}\n\t\t{select {class tank}}\n\t}\n}\n'), 'preset farTanks: a last group takes every tank: ' + JSON.stringify(ft));
  ok(throwsT(() => T.applyAll('sel', HAP, [{ op: 'preset', id: 'farTanks' }], info), /Nothing to fix/), 'preset farTanks on stock (a group takes the rest): nothing to fix');
  const ci = T.applyAll('sel', TANK, [{ op: 'preset', id: 'closeInf' }], info).text;
  ok(ci === TANK.replace(C('\t{type "tank"}\n'), C('\t{type "tank"}\n\t{group\n\t\t{select {class human} {in_range 30}}\n\t}\n')) && throwsT(() => T.applyAll('sel', ci, [{ op: 'preset', id: 'closeInf' }], info), /Nothing to fix/), 'preset closeInf: first group close infantry, once');
  ok(throwsT(() => T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'farTanks' }], info), /belongs to a shooter list/) && throwsT(() => T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'nope' }], info), /Unknown preset/), 'refused: preset on the wrong file, unknown preset');

  // ---- routes: state, preview, write (mod copy from the game), reset
  const st = await R['GET /api/x/bots/targets/state'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(st.kind === 'as2' && st.files.map(f => f.file + ':' + f.from).join() === 'human_bullet.inc:game,human_ap.inc:game,tank.inc:game,ammo.set:game', 'state: files in select.set order, from the game');
  ok(st.selectors.length === 3 && st.selectors[1].launcher && st.selectors[2].tankList && st.ammo.length === 4 && !st.errors.length, 'state: lists and blocks');
  const pr = id => st.presets.find(p => p.id === id) || {};
  ok(pr('mgTank').needed && pr('rocketInf').needed && pr('closeInf').needed && pr('closeInf').file === 'tank.inc' && pr('farTanks').needed === false && pr('farTanks').file === 'human_ap.inc', 'state: which preset is needed where: ' + JSON.stringify(st.presets));
  const pv = await R['POST /api/x/bots/targets/change'](null, { mod, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: false }, ctx);
  ok(!pv.written && pv.copiesWholeFile && pv.did.length === 2 && pv.diff.filter(d => d.t === '+').length === 2 && pv.diff.every(d => d.t !== '-') && !fs.existsSync(pv.target), 'preview: plain list and diff, nothing written');
  ok(pv.model[3].rules.slice(-1)[0].tags === 'bullet', 'preview: the model after the change');
  const mod2 = path.join(work, 'mod2'); modInfo(mod2);   // a mod with its own copies: readable with no game folder, but not writable
  for (const f of ['select.set', 'human_bullet.inc', 'human_ap.inc', 'tank.inc']) W(path.join(TD(mod2), f), fs.readFileSync(path.join(TD(as2), f), 'latin1'));
  W(path.join(TD(mod2), 'ammo.set'), AMMO);
  ok(await rej(R['POST /api/x/bots/targets/change'](null, { mod: mod2, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: true }, noGame), /game folder is not set/) === '', 'refused: write with no game folder set');
  const wr = await R['POST /api/x/bots/targets/change'](null, { mod, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: true }, ctx);
  const got = fs.readFileSync(wr.target, 'latin1');
  ok(wr.written && got === mg && got.includes('\xe0\xe1') && !/[^\r]\n/.test(got), 'write: the mod copy = game file + change, CRLF and the cp1251 byte kept');
  const st2 = await R['GET /api/x/bots/targets/state'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(st2.files.find(f => f.file === 'ammo.set').from === 'mod' && !st2.presets.find(p => p.id === 'mgTank').needed, 'state after write: from the mod, preset no longer needed');
  // the frame's one Undo: the write replies an undo list; lib.undoRoute puts the exact bytes back
  const LIB = require('../../lib');
  ok(Array.isArray(wr.undo) && wr.undo.length === 1 && wr.undo[0].rel === 'set/target/ammo.set' && !R['POST /api/x/bots/targets/undo'], 'write: an undo list for the frame\'s one Undo, no own undo route');
  LIB.undoRoute(ctx, { mod, undo: wr.undo });
  ok(!fs.existsSync(wr.target), 'undo: the mod had no copy before, so it goes again');
  await R['POST /api/x/bots/targets/change'](null, { mod, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: true }, ctx);
  ok(fs.readFileSync(wr.target, 'latin1') === mg, 'written again');
  const w2 = await R['POST /api/x/bots/targets/change'](null, { mod, file: 'tank.inc', actions: [{ op: 'moveGroup', sel: 0, group: 0, dir: 1 }, { op: 'setRange', sel: 0, group: 0, term: 0, value: '5' }], write: false }, ctx).catch(e => e);
  ok(w2 instanceof Error && /No range number 0/.test(w2.message), 'actions see the text of the ones before (tank.inc group 1 has no range): ' + w2.message);
  ok(await rej(R['POST /api/x/bots/targets/change'](null, { mod, file: '../ammo.set', actions: [{ op: 'moveRule', block: 0, rule: 0, dir: 1 }] }, ctx), /Unknown file/, 400) === '', 'refused: a path as file');
  ok(await rej(R['POST /api/x/bots/targets/change'](null, { mod, file: 'moto.inc', actions: [{ op: 'moveGroup', sel: 0, group: 0, dir: 1 }] }, ctx), /does not include it/) === '', 'refused: a file select.set does not include');
  ok(await rej(R['POST /api/x/bots/targets/change'](null, { mod: path.join(work, 'none'), file: 'ammo.set', actions: [] }, ctx), /does not exist/) === '', 'refused: missing mod folder');
  ok(await rej(R['POST /api/x/bots/targets/change'](null, { mod: as2, file: 'ammo.set', actions: [{ op: 'moveRule', block: 0, rule: 0, dir: 1 }], write: true }, ctx), /part of the game install/) === '', 'refused: the game install as mod');
  ok(await rej(R['GET /api/x/bots/targets/state'](U('mod=' + encodeURIComponent(mod)), null, noGame), /select\.set/, 404) === '', 'refused: no game and no mod copy = cannot read');
  const rs0 = await R['POST /api/x/bots/targets/reset'](null, { mod, file: 'ammo.set', write: false }, ctx);
  const rs = await R['POST /api/x/bots/targets/reset'](null, { mod, file: 'ammo.set', write: true }, ctx);
  ok(rs0.had && !rs0.removed && fs.existsSync(rs.target) === false && rs.removed, 'reset: dry run keeps, write removes the mod copy');
  ok(!fs.existsSync(path.join(mod, 'resource')), 'reset leaves no empty folders (set/target, set, resource); the mod folder stays: ' + fs.existsSync(mod));
  LIB.undoRoute(ctx, { mod, undo: rs.undo });
  ok(fs.readFileSync(rs.target, 'latin1') === mg, 'undo of a reset: the mod copy back byte for byte');
  const rs2 = await R['POST /api/x/bots/targets/reset'](null, { mod, file: 'ammo.set', write: true }, ctx);
  W(rs2.target, 'later');
  let eu = null; try { LIB.undoRoute(ctx, { mod, undo: rs2.undo }); } catch (e) { eu = e; }
  ok(eu && eu.status === 409 && eu.key === 'bots.e.undoChanged' && fs.readFileSync(rs2.target, 'latin1') === 'later', 'undo refused once the file changed since, nothing touched');
  fs.unlinkSync(rs2.target); fs.rmSync(path.join(mod, 'resource'), { recursive: true, force: true });   // the mod as new again (the client checks folder pruning)
  ok(await rej(R['POST /api/x/bots/targets/reset'](null, { mod, file: 'select.set', write: true }, ctx), /Unknown file/) === '', 'refused: reset of a file this part does not edit');

  // ---- GoH: same code path on the GoH files
  const gs = await R['GET /api/x/bots/targets/state'](U('mod=' + encodeURIComponent(gmod)), null, gctx);
  ok(gs.kind === 'goh' && gs.selectors.length === 3 && gs.bulletTag === 'small_arms' && gs.tankClasses.join() === 'tank_light,tank_medium', 'goh: lists, bullet tag and tank classes from the GoH files: ' + JSON.stringify([gs.kind, gs.bulletTag, gs.tankClasses]));
  const gp = id => gs.presets.find(p => p.id === id) || {};
  ok(gp('farTanks').needed && gp('farTanks').file === 'human_ap.inc' && gp('mgTank').needed && !gp('rocketInf').needed && gp('closeInf').needed, 'goh: presets needed: ' + JSON.stringify(gs.presets));
  const gf = await R['POST /api/x/bots/targets/change'](null, { mod: gmod, file: 'human_ap.inc', actions: [{ op: 'preset', id: 'farTanks' }], write: false }, gctx);
  ok(gf.did.length === 1 && T.selectors(GAP)[0].groups.length + 1 === gf.model[0].groups.length && gf.model[0].groups[1].select.map(s => s[0].v).join() === 'tank_light,tank_medium' && gf.model[1].groups.length === 1, 'goh: farTanks adds the group to the launcher list only');
  const gm = await R['POST /api/x/bots/targets/change'](null, { mod: gmod, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: false }, gctx);
  ok(gm.model[1].rules.slice(-1)[0].tags === 'small_arms' && gm.model[2].rules.slice(-1)[0].tags === 'small_arms', 'goh: mgTank adds small_arms to tank_light and tank_medium');
}

// ---- browser side in the fake DOM: page rules; one page = the brain part + the symptom picker + the two cards (as the Unit AI page draws
// them), env.go finds the block like BOTS_UI.go (exact id, opens its folds); picker -> card -> preset preview -> write -> green box -> Undo;
// every symptom jump lands on a block that exists (a missing block fails here), opened and marked
async function client() {
  const src = X.script;
  ok(typeof src === 'string' && !/`|\$\{/.test(src) && !/innerHTML|insertAdjacentHTML|document\.write/.test(src), 'page rules: no backtick, no dollar-brace, no HTML writes');
  const parts = require('../index');
  ok(typeof parts.check === 'function' && parts.check('targets', X) === '', 'frame contract check: ' + (parts.check && parts.check('targets', X)));
  ok(X.id === 'targets' && X.group === 'D' && X.order === 20 && Object.keys(X.routes).every(k => /^(GET|POST) \/api\/x\/bots\/targets\//.test(k)), 'part shape');
  const fakedom = require(path.join(GUI, 'test', 'fakedom')), BC = require(path.join(GUI, 'test', 'blockcheck'));
  const BR = require('../brain'), LIB = require('../../lib'), FRAME = require('../../lang');
  const en = Object.assign({}, FRAME.en); BR.lang.forEach(r => { en[r[0]] = r[1]; }); LANG.forEach(r => { en[r[0]] = r[1]; });
  const tx = (k, p) => { const s = en[k]; if (s == null) return k; return p ? s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))) : s; };
  const tick = () => new Promise(r => setImmediate(r)), settle = async () => { for (let i = 0; i < 40; i++) await tick(); };
  const RT = Object.assign({}, R, BR.routes);
  const isB = e => !!(e && e.getAttribute && e.getAttribute('data-blk'));
  const find = (r, id) => r.all().find(e => e.getAttribute && e.getAttribute('data-blk') === id) || null;
  const folds = e => { const a = []; for (let n = e && e.parentNode; n; n = n.parentNode) if (n.tagName === 'DETAILS') a.push(n); return a; };
  // the page: the scripts in one sandbox, the parts drawn in group D order into one root under body
  function page(gid, c, m, o) {
    o = o || {};
    const doc = fakedom.make(), F = BC.pageFns(doc), kits = [], asked = [], goes = [], calls = [];
    const leaf = (id, kids, name) => F.h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids);
    const go = id => { goes.push(id); const e = find(doc.body, id); if (e) { folds(e).forEach(d => { d.open = true; }); if (e.tagName === 'DETAILS') e.open = true; } };   // like the frame's reveal: the block itself too
    const kit = { leaf, hint: (id, t) => leaf(id, [F.h('div', { class: 'hint', text: t })]),
      errBox: x => F.h('div', { class: 'err', text: x && typeof x === 'object' ? (x.key && x.key in en ? tx(x.key, x.params) : String(x.message)) : String(x) }),
      section: (id, title, kids) => F.h('div', { class: 'card', blk: id, box: 'col', 'data-blkname': title }, [leaf(id + '.title', [F.h('h3', { text: title })])].concat(kids)),
      ...(o.kitMore || {}), qs: () => '', hitsOf: (items, s, done) => { const f = String(s || '').toLowerCase(); const a = items.filter(i => i.lo.indexOf(f) >= 0); done(a.slice(0, 30), Math.max(0, a.length - 30)); }, go };
    const api = (method, p, data, cb) => {
      const d = Object.assign({ mod: m }, data || {}); calls.push([method, p, d]);
      const run = () => (p === 'undo' ? LIB.undoRoute(c, d) : method === 'GET' ? RT['GET /api/x/bots/' + p](U('mod=' + encodeURIComponent(d.mod)), null, c) : RT['POST /api/x/bots/' + p](null, d, c));
      Promise.resolve().then(run).then(j => cb(null, JSON.parse(JSON.stringify(j))), e => cb(e.key && e.key in en ? tx(e.key, e.params) : e.message, undefined, e));
    };
    const BOTS_PARTS = [];
    const sb = { document: doc, h: F.h, tx, BOTS_PARTS, console, confirm: () => true,
      setTimeout: (f, ms) => { if (!(ms >= 1000)) setImmediate(f); return 0; },   // the 4 s mark stays on
      searchKit: (inp, so) => { if (!so.key || typeof so.index !== 'function' || !so.browse) throw new Error('searchKit needs key, index and browse'); kits.push({ inp, so, parent: !!inp.parentNode }); },
      askDo: x => { asked.push(x); return { then: f => f(true) }; } };
    vm.createContext(sb);
    if (!o.noBrain) vm.runInContext(BR.script, sb, { filename: 'brain/client.js' });
    vm.runInContext(src, sb, { filename: 'targets/client.js' });
    const env = { mod: m, gid, api, reload() {}, kit, go };
    const root = F.h('div', { 'data-blkroot': 'unitai' }); doc.body.appendChild(root);
    BOTS_PARTS.slice().sort((a, b) => a.order - b.order).forEach(p => p.draw(env).forEach(e => root.appendChild(e)));
    return { doc, F, root, kits, asked, goes, calls, BOTS_PARTS, go };
  }

  const P1 = page('as64', ctx, mod); await settle();
  const root = P1.root, kits = P1.kits, calls = P1.calls, asked = P1.asked, goes = P1.goes;
  ok(P1.BOTS_PARTS.filter(p => /^targets/.test(p.id)).map(p => p.id + ':' + p.group + ':' + p.order).join() === 'targets.symptom:D:5,targets:D:20' && P1.BOTS_PARTS.find(p => p.id === 'targets.symptom').title() === en['bots.targets.sym.title'], 'two entries pushed (picker first in group D)');
  const probs = BC.checkScreen(root, 'unitai');
  ok(probs.length === 0, 'block rules (brain + picker + cards): ' + probs.slice(0, 5).join(' | '));
  ok(root.all().filter(isB).every(e => /^bots\.(targets|brain)\./.test(e.getAttribute('data-blk'))), 'every block id starts bots.targets. or bots.brain.');
  ok(!root.has(en['bots.targets.notice'] || 'every computer-controlled unit') && !root.has('every computer-controlled unit'), 'no "every computer-controlled unit" notice in the part (the page says it once)');
  ok(kits.length === 1 && kits[0].so.key === 'bots.targets.sym' && kits[0].parent, 'the symptom box is a searchKit (history key, index, Browse), attached once the box is in the page');
  // the symptoms: one per catalog row, each with a label and a cause
  const TS = JSON.parse(/^var TSYM=(.*);\n/.exec(src)[1]), keys = new Set(LANG.map(r => r[0]));
  ok(TS.length === 14 && TS.length === Object.keys(CAT.symptoms).length && TS.every(s => keys.has('bots.targets.sym.' + s.id) && keys.has('bots.targets.sym.' + s.id + '.why') && s.blk), 'fourteen symptoms, each with a label, a cause and a target block: ' + TS.length);
  ok(['mgtank', 'mgwaste', 'spotfar', 'blind'].every(i => TS.some(s => s.id === i)) && TS.find(s => s.id === 'mgwaste').preset === 'mgTankOff', 'both directions for machine guns and tanks; too far and blind');
  // S10: the six most common symptoms open on the list, the other eight under "Show all 14"; each symptom is its own folded block
  const symList = find(root, 'bots.targets.sym.list'), symAll = find(root, 'bots.targets.sym.all');
  const symB = id => find(root, 'bots.targets.sym.' + id);
  const TOP = TS.filter(s => s.top).sort((a, b) => a.top - b.top).map(s => s.id);
  ok(TOP.join() === 'rocketinf,spotfar,mgtank,waves,noretreat,tankmg', 'six top symptoms, most common first: ' + TOP.join());
  ok(TS.filter(s => !s.link).every(s => { const e = symB(s.id); return e && e.tagName === 'DETAILS' && !e.open && e.has(en['bots.targets.sym.' + s.id]); }), 'every symptom is a folded block bots.targets.sym.<id>');
  // item 5: attack waves belong to the Bots page habits: one link line (no symptom fold, no fix) that opens bots.recipes
  const wv = symB('waves');
  ok(TS.find(s => s.id === 'waves').link && TS.find(s => s.id === 'waves').blk === 'bots.recipes' && wv && wv.tagName !== 'DETAILS' && wv.has(en['bots.targets.sym.waves.link']) && wv.has(en['bots.targets.sym.link.go']) && fs.existsSync(path.join(__dirname, '..', 'recipes', 'client.js')) && /ID='bots\.recipes'/.test(fs.readFileSync(path.join(__dirname, '..', 'recipes', 'client.js'), 'utf8')), 'waves: a link line to the Bots page habit card bots.recipes (that card exists)');
  // item 3: the two opposite machine-gun symptoms name each other; AS2 greys nothing
  ok(symB('mgtank').has(tx('bots.targets.sym.opp', { o: en['bots.targets.sym.mgwaste'] })) && symB('mgwaste').has(tx('bots.targets.sym.opp', { o: en['bots.targets.sym.mgtank'] })) && !root.all().some(e => e.getAttribute && e.getAttribute('data-nogoh')), 'mgtank and mgwaste name each other as opposites; nothing greyed on AS2');
  // S20: the Details "where" line is a lang row, not the catalog's English
  ok(TS.every(s => keys.has('bots.targets.sym.' + s.id + '.lever')) && symB('mgtank').has(en['bots.targets.sym.mgtank.lever']), 'every symptom\'s Details line comes from the lang tables');
  ok(symList && symAll && symAll.tagName === 'DETAILS' && !symAll.open && symAll.has(tx('bots.targets.all', { n: 14 })) && TOP.every(i => !folds(symB(i)).includes(symAll)) && TS.filter(s => !s.top).every(s => folds(symB(s.id)).includes(symAll)) && TS.filter(s => !s.top).length === 8, 'top 6 shown, 8 under "Show all 14"');
  ok(!find(root, 'bots.targets.sym.res'), 'no separate "Cause" box: each symptom holds its own');
  // a page task points straight at one symptom (T5): go opens that block
  P1.go('bots.targets.sym.rocketinf');
  ok(symB('rocketinf').open && symB('rocketinf').has(en['bots.targets.sym.rocketinf.why']), 'go(bots.targets.sym.rocketinf) opens T5 right on its symptom');
  symB('rocketinf').open = false;
  // the text box narrows the list
  const sin = find(root, 'bots.targets.sym.find').all().find(e => e.tagName === 'INPUT');
  sin.value = 'retreat'; sin.fire('input');
  ok(!symB('noretreat').hidden && symB('rocketinf').hidden, 'typing narrows the symptom list');
  sin.value = ''; sin.fire('input');
  ok(TS.every(s => !symB(s.id).hidden), 'an empty box shows every symptom again');
  let hits = null; kits[0].so.index('tank', h => { hits = h; });
  ok(hits && hits.some(i => i.value === 'mgtank') && hits.some(i => i.value === 'fartanks') && hits.some(i => i.value === 'mgwaste'), 'symptom index finds tank symptoms');
  const symBtn = (id, fix) => root.all().find(e => e.tagName === 'BUTTON' && e.getAttribute(fix ? 'data-symfix' : 'data-sym') === id);
  kits[0].so.onPick('mgtank', null, 'index');
  const mgB = symB('mgtank');
  ok(mgB.open && mgB.has(en['bots.targets.sym.mgtank.why']) && mgB.has('ammo.set') && folds(mgB.all().find(e => e.tagName === 'CODE')).length > 1, 'a pick opens that symptom: the cause; the engine key folded in Details');
  // S13 on a fresh page: Preview and Undo greyed (nothing to show or undo)
  const amSave = find(root, 'bots.targets.ammo.save'), selSave = find(root, 'bots.targets.sel.save');
  const B = (box, w) => box.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.' + w]);
  const TT = e => (e.title !== undefined ? e.title : e.getAttribute('title'));   // a tooltip set as a property or an attribute
  const order = box => box.all().filter(e => e.tagName === 'BUTTON').map(e => e.textContent).join('|');
  ok(order(amSave) === [en['bots.btn.preview'], en['bots.btn.write'], en['bots.btn.undo'], en['bots.btn.reset']].join('|') && order(selSave) === order(amSave), 'S13 buttons: Preview, Write into my mod, Undo, Reset (no other list buttons) ' + order(amSave));
  // round 4 item 3: Preview is never greyed; pressed with nothing changed it says what to do first. Write and Undo are greyed with a reason
  const openRow = li => { const d = li.children[0]; if (!d.open) { d.open = true; d.fire('toggle'); } return d; };   // a folded row makes its controls when first opened
  const dropB = box => box.all().find(e => e.tagName === 'BUTTON' && e.getAttribute('data-drop'));
  ok(B(amSave, 'undo').disabled && B(selSave, 'undo').disabled && B(amSave, 'write').disabled && TT(B(amSave, 'write')) === en['bots.targets.write.no'] && !B(amSave, 'preview').disabled && TT(B(amSave, 'preview')) === en['bots.targets.prev.no'], 'fresh page: Undo and Write greyed with their reason; Preview is not greyed');
  B(amSave, 'preview').click(); await settle();
  ok(amSave.has(en['bots.targets.prev.no']) && B(amSave, 'write').disabled && !calls.some(c => c[1] === 'targets/change'), 'Preview with nothing changed says what to do first and sends nothing');
  // round 4 item 3: the change list (preview, buttons, result) sits right under the card's lead, above the picker, the fixes and the rules;
  // a folded rule or group is only its line: no control inside until it is opened
  const kidsOf = id => find(root, id).children.filter(isB).map(e => e.getAttribute('data-blk'));
  ok(kidsOf('bots.targets.ammo').slice(0, 5).join() === 'bots.targets.ammo.title,bots.targets.ammo.lead,bots.targets.ammo.save,bots.targets.ammo.pick,bots.targets.ammo.presets' && kidsOf('bots.targets.sel').slice(1, 3).join() === 'bots.targets.sel.lead,bots.targets.sel.save', 'the preview is at the top of both cards: ' + kidsOf('bots.targets.ammo').join());
  const ctl = e => e.all().filter(x => /^(INPUT|BUTTON|SELECT)$/.test(x.tagName)).length;
  ok(ctl(find(root, 'bots.targets.ammo.rules')) === 0 && ctl(find(root, 'bots.targets.sel.groups')) === 0 && find(root, 'bots.targets.ammo.rules').all().filter(e => e.tagName === 'LI').length > 1, 'folded rule and group lists hold no controls: ' + ctl(find(root, 'bots.targets.ammo.rules')) + ', ' + ctl(find(root, 'bots.targets.sel.groups')));
  ok(ctl(find(root, 'bots.targets.ammo')) <= 14, 'the ammo card opens with few controls: ' + ctl(find(root, 'bots.targets.ammo')));
  ok(TT(B(amSave, 'undo')) === en['bots.targets.undo.no'] && B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.no'] && B(selSave, 'reset').disabled, 'item 1: no mod copy: Reset greyed with its plain tooltip; Undo greyed with its tooltip');
  // item 3: the Fixes list: each fix says when to choose it; the two opposite machine-gun fixes are one either/or box
  const pairBox = find(root, 'bots.targets.ammo.presets').all().find(e => e.getAttribute && e.getAttribute('data-pair') === 'mgTank|mgTankOff');
  ok(pairBox && pairBox.has(en['bots.targets.pair.h']) && pairBox.all().filter(e => e.getAttribute && e.getAttribute('data-or')).length === 1 && pairBox.has(en['bots.targets.preset.mgtank.when']) && pairBox.has(en['bots.targets.preset.mgtankoff.when']), 'mgTank and mgTankOff shown as one either/or pair, each with "Choose this if"');
  ok(root.all().filter(e => e.getAttribute && /^p\./.test(e.getAttribute('data-tg') || '')).every(p => p.all().some(e => e.getAttribute && e.getAttribute('data-when') && /^Choose this if/.test(e.textContent))), 'every fix line says when to choose it');
  const need = id => { const p = root.all().find(e => e.getAttribute && e.getAttribute('data-tg') === 'p.' + id); const d = p && p.all().find(e => e.getAttribute && e.getAttribute('data-need') != null); return d && d.getAttribute('data-need'); };
  ok(need('mgTank') === '1', 'the mgTank fix is needed on the stock file');
  symBtn('mgtank', true).click(); await settle();
  const ammoCard = find(root, 'bots.targets.ammo');
  ok(calls.some(c => c[1] === 'targets/change' && c[2].actions[0].op === 'preset' && c[2].actions[0].id === 'mgTank' && c[2].write === false), 'Preview the fix sends the preset as a dry run');
  const dpre = amSave.all().find(e => e.tagName === 'PRE');
  ok(amSave.has('{"bullet"}') && dpre && folds(dpre).length && amSave.has(tx('bots.targets.write.copy')), 'the fix shows its preview at once: the diff folded, the copy note');
  ok(B(amSave, 'undo').disabled && TT(B(amSave, 'undo')) === en['bots.targets.undo.no'] && !B(amSave, 'write').disabled && TT(B(amSave, 'write')) === en['bots.targets.write.tip'] && dropB(amSave), 'a previewed fix: Write on; Undo stays greyed (nothing written yet); "Drop these changes" offered');
  ok(amSave.has(en['bots.showChange'] || en['bots.targets.exact']) && folds(dpre)[0].children[0].textContent === (en['bots.showChange'] || en['bots.targets.exact']), 'the one fold label: Show the exact file change');
  const pick = ammoCard.all().find(e => e.tagName === 'SELECT');
  ok(pick && pick.value === '3', 'the tank block is picked: ' + (pick && pick.value));
  ok(ammoCard.has(en['bots.targets.atag.bullet']), 'the card shows the model after the change');
  // S11: plain sentences, no tags or files in the preview lines
  const pl1 = amSave.all().filter(e => e.tagName === 'LI' && !folds(e).length).map(e => e.textContent);
  ok(pl1.length === 2 && pl1.every(x => x.indexOf(en['bots.targets.atag.bullet']) === 0 && !/bullet|light_tank|ammo\.set|\{/.test(x)), 'preview lines are plain sentences with in-game names: ' + JSON.stringify(pl1));
  // write: asks with the same count as the list (plural right), then writes; the green box; Undo
  const nl = pl1.length;
  B(amSave, 'write').click(); await settle();
  const a1 = asked[asked.length - 1];
  ok(a1 && nl === 2 && a1.lines[0] === tx('bots.targets.write.ask.other', { n: nl }) && a1.lines[0] === 'Write 2 changes into your mod?' && a1.lines.length === 1 + nl + 1, 'Write asks with the count of the list (' + nl + '): ' + JSON.stringify(a1 && a1.lines));
  const AM = path.join(TD(mod), 'ammo.set'), mgText = T.applyAll('ammo', AMMO, [{ op: 'preset', id: 'mgTank' }], X._.infoOf(ctx, mod, ['human_bullet.inc', 'human_ap.inc', 'tank.inc'])).text;
  ok(fs.existsSync(AM) && fs.readFileSync(AM, 'latin1') === mgText, 'Write writes the previewed change');
  ok(amSave.has(en['bots.targets.doneH']) && amSave.has(en['bots.targets.see.ammo.both']) && amSave.has(en['bots.targets.seeH']) && amSave.has(en['bots.targets.next.match']), 'green box: what changes, how to see it (a new rule reaches every unit: yourself or a bot match), next steps');
  ok(!/^To see it/.test(en['bots.targets.see.ammo.both']) && ['sel', 'ammo'].every(c => ['ai', 'own', 'both'].every(w => LANG.filter(r => r[0] === 'bots.targets.see.' + c + '.' + w).every(r => !/^(To see it|Как увидеть|Як побачити|如何查看)/.test(r.slice(1).join('|')) && !r.slice(2).some(x => /^(Как увидеть|Як побачити|如何查看)/.test(x))))), 'S19: "To see it" once (the frame adds it), never inside the text, in any language');
  ok(need('mgTank') === '0', 'after the write the fix list reads "nothing to fix"');
  ok(!B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.tip'] && TT(B(amSave, 'undo')) === en['bots.targets.undo.tip'], 'item 1: the mod has its copy now: Reset on with its tooltip; Undo says what it puts back');
  const ub = amSave.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.undo']);
  ok(ub.length === 2 && !ub[0].disabled, 'Undo in the row (on after a write) and in the green box');
  ub[1].click(); await settle();
  ok(!fs.existsSync(AM) && !amSave.has(en['bots.targets.doneH']), 'Undo in the green box: the mod had no copy, so it goes again; the green box goes away');
  ok(!fs.existsSync(path.join(mod, 'resource')), 'Undo of a first write leaves no empty folders (resource/set/target): ' + (fs.existsSync(path.join(mod, 'resource')) ? fs.readdirSync(path.join(mod, 'resource')).join() : ''));
  ok(need('mgTank') === '1' && B(amSave, 'undo').disabled && TT(B(amSave, 'undo')) === en['bots.targets.undo.no'] && B(amSave, 'reset').disabled, 'S18: after the green box Undo every list re-reads, the card Undo greys with its plain tooltip, Reset greys (no copy again)');
  // S19 / T5: the rocket launcher fix reaches only the player's own units: "play a match yourself with these units", not a bot match
  symBtn('rocketinf', true).click(); await settle();
  B(amSave, 'write').click(); await settle();
  ok(amSave.has(en['bots.targets.see.ammo.own']) && !amSave.has(en['bots.targets.see.ammo.both']) && /^Play a match yourself with these units/.test(en['bots.targets.see.ammo.own']), 'T5 written: how to see it says play a match yourself with these units');
  // round 4 item 5 (S19): the next-step buttons match that text: no "Try a bot match" (there the player only watches), the log stays
  ok(!amSave.all().some(e => e.tagName === 'BUTTON' && e.textContent === en['bots.targets.next.match']) && amSave.all().some(e => e.tagName === 'BUTTON' && e.textContent === en['bots.targets.next.log']), 'T5 written: no bot match button beside "play a match yourself"');
  // a pending change after a write clears the old done text; Undo takes the pending change back first, then the write; then all greyed
  // round 4 item 3: Undo has one meaning (my last write of this file); a change not yet written is taken back with "Drop these changes"
  const sw0 = openRow(find(root, 'bots.targets.ammo.rules').all().find(e => e.tagName === 'LI')).all().find(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'checkbox');
  sw0.checked = !sw0.checked; sw0.fire('change'); await settle();
  ok(!amSave.has(en['bots.targets.doneH']) && !B(amSave, 'undo').disabled && TT(B(amSave, 'undo')) === en['bots.targets.undo.tip'] && dropB(amSave), 'a new change clears the old green box; Undo still means the last write (same tooltip)');
  dropB(amSave).click(); await settle();
  ok(amSave.has(en['bots.targets.pend.none']) && !dropB(amSave) && !B(amSave, 'undo').disabled && TT(B(amSave, 'undo')) === en['bots.targets.undo.tip'] && fs.existsSync(AM), 'Drop these changes: the pending change gone, the mod file untouched, Undo still holds the last write');
  // round 4 item 2: Reset follows the file's state after every write and undo: on while the mod has its copy, greyed at once after the Undo
  ok(!B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.tip'], 'before the Undo: the mod has its copy, Reset on');
  B(amSave, 'undo').click(); await settle();
  ok(!fs.existsSync(AM) && amSave.has(en['bots.targets.undone']) && B(amSave, 'undo').disabled && B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.no'] && amSave.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.undo']).length === 1, 'S18: Undo of the write: one Undone line, every Undo for the file greyed, Reset greyed with its reason, no old box left');
  ok(en['bots.targets.undone'] === 'Undone: ' + en['bots.targets.undone.w'] + '.', 'the Undone sentence: "Undone: <what>."');
  // write, Reset (the copy goes: Reset greys), Undo of the reset (the copy is back: Reset on again), Undo cannot be pressed twice
  symBtn('mgtank', true).click(); await settle();
  B(amSave, 'write').click(); await settle();
  ok(fs.existsSync(AM) && !B(amSave, 'reset').disabled, 'written again: Reset on');
  B(amSave, 'reset').click(); await settle();
  ok(!fs.existsSync(AM) && B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.no'] && !B(amSave, 'undo').disabled, 'after Reset: no copy, Reset greyed; Undo holds the reset');
  B(amSave, 'undo').click(); await settle();
  ok(fs.existsSync(AM) && !B(amSave, 'reset').disabled && TT(B(amSave, 'reset')) === en['bots.targets.reset.tip'] && B(amSave, 'undo').disabled, 'after Undo of the reset: the copy is back, Reset on again, Undo greyed');
  // a stale page state must not leave Reset on: the reply of the file list still says "mod" once, the button stays right
  B(amSave, 'reset').click(); await settle();
  ok(!fs.existsSync(AM) && B(amSave, 'reset').disabled, 'reset once more: gone, greyed');
  B(amSave, 'undo').click(); await settle();
  fs.unlinkSync(AM);   // the file goes behind the page's back; the next write shows the truth again
  ok(!B(amSave, 'reset').disabled, 'the page still believes its last undo (the copy came back)');
  B(amSave, 'reset').click(); await settle();
  ok(B(amSave, 'reset').disabled && amSave.has(en['bots.targets.reset.nothing']), 'Reset with no copy left: it says so and greys, never a silent nothing');
  // shooter card: symptom tankmg jumps to the tank list; a move waits for Preview; Undo takes the pending change back
  kits[0].so.onPick('tankmg', null, 'index');
  symBtn('tankmg').click(); await settle();
  const selCard = find(root, 'bots.targets.sel');
  const sp = selCard.all().find(e => e.tagName === 'SELECT');
  ok(sp.value === 'tank.inc#0' && selCard.has(en['bots.targets.who.t.tank']), 'Show the setting picks the tank list: ' + sp.value);
  const gl = find(root, 'bots.targets.sel.groups');
  ok(gl.all().filter(e => e.tagName === 'LI').every(li => li.children[0] && li.children[0].tagName === 'DETAILS' && !li.children[0].open), 'each target group folds to its one line');
  ok(!/select.set/.test(en['bots.targets.sel.rank']) && selCard.has(tx('bots.targets.sel.rank', { n: 3, all: 3 })), 'the list rank in plain words, no file name');
  ok(folds(find(root, 'bots.targets.sel.add')).some(d => d.getAttribute('data-blk') === 'bots.targets.sel.more') && folds(find(root, 'bots.targets.ammo.add')).some(d => d.getAttribute('data-blk') === 'bots.targets.ammo.more'), 'adding a group or a rule sits under More options');
  openRow(gl.all().find(e => e.tagName === 'LI')).all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.targets.down']).click(); await settle();
  ok(selSave.has(tx('bots.targets.pend.wait.one', { n: 1 })) && !B(selSave, 'preview').disabled && B(selSave, 'write').disabled, 'a change waits for Preview (Write greyed until then)');
  { const a0 = asked.length, w0 = calls.length, bw = B(selSave, 'write');
    bw.disabled = false; bw.click(); await settle();
    ok(asked.length === a0 && calls.length === w0, 'Write with no Preview does nothing, even when the click gets through ' + (asked.length - a0) + ' ' + (calls.length - w0)); }
  B(selSave, 'preview').click(); await settle();
  const downS = tx('bots.targets.say.down', { n: 1, who: en['bots.targets.who.t.tank'] });
  ok(selSave.has(downS) && selSave.has(tx('bots.targets.pend.h.one', { n: 1 })) && !B(selSave, 'write').disabled, 'Preview: the move in plain words ' + downS);
  dropB(selSave).click(); await settle();
  ok(selSave.has(en['bots.targets.pend.none']) && B(selSave, 'undo').disabled && B(selSave, 'write').disabled, 'Drop these changes takes back the change not yet written');
  // a range: the diff shows the removed line first, then the added one; a refused value names the field and adds nothing
  sp.value = 'human_bullet.inc#0'; sp.fire('change'); await settle();
  const rinOf = () => openRow(find(root, 'bots.targets.sel.groups').all().find(e => e.tagName === 'LI')).all().find(e => e.tagName === 'INPUT' && e.value === '10');
  let rin = rinOf();
  // round 4 item 4: a number box shows its label, the game's own value and the allowed range
  const rhint = rin.parentNode.all().find(e => e.getAttribute && e.getAttribute('data-stock') != null);
  ok(rhint && rhint.getAttribute('data-stock') === '10' && rhint.textContent === tx('bots.targets.range.game', { v: '10' }) + ' ' + en['bots.targets.range.hint'] && /10000/.test(en['bots.targets.range.hint']) && /^Group 1, range/.test(rin.parentNode.children[0].textContent), 'a range box: label, the game\'s value, the allowed range: ' + (rhint && rhint.textContent));
  rin.value = '25'; rin.fire('change'); await settle();
  B(selSave, 'preview').click(); await settle();
  const rows = selSave.all().filter(e => e.tagName === 'DIV' && e.parentNode && e.parentNode.tagName === 'PRE').map(e => e.textContent);
  const im = rows.findIndex(x => x.indexOf('- ') === 0), ip = rows.findIndex(x => x.indexOf('+ ') === 0);
  ok(im >= 0 && ip > im && rows[im].includes('{in_range 10}') && rows[ip].includes('{in_range 25}'), 'diff: "-" old line before "+" new line ' + JSON.stringify(rows));
  // the changed box still shows the game's value (10), not the mod's
  const r25 = openRow(find(root, 'bots.targets.sel.groups').all().find(e => e.tagName === 'LI')).all().find(e => e.tagName === 'INPUT' && e.value === '25');
  ok(r25 && r25.parentNode.all().some(e => e.getAttribute && e.getAttribute('data-stock') === '10'), 'after a change the box keeps naming the game\'s value');
  dropB(selSave).click(); await settle();
  rin = rinOf();
  rin.value = '0'; rin.fire('change'); await settle();
  const rlab = rin.getAttribute('aria-label');
  ok(selSave.has(tx('bots.targets.e.rangeOf', { name: rlab, v: '0' })) && /^Group 1, range/.test(rlab) && selSave.has(en['bots.targets.pend.none']), 'a refused range names the field by its label with the range, adds nothing: ' + rlab);

  // every symptom jump: the target block exists, env.go got its id, its folds are open and it is marked (a missing block fails here)
  const frameSrc = fs.readFileSync(path.join(GUI, 'ext', 'bots', 'script.js'), 'utf8');
  for (const s of TS) {
    root.all().forEach(e => { if (e.tagName === 'DETAILS') e.open = false; if (e.classList) e.classList.remove('arrflash'); });
    kits[0].so.onPick(s.id, null, 'index');
    const b = symBtn(s.id);
    ok(b, 'symptom ' + s.id + ': a Show the setting button');
    if (!b) continue;
    b.click(); await settle();
    ok(goes[goes.length - 1] === s.blk, 'symptom ' + s.id + ': env.go(' + s.blk + ') got ' + goes[goes.length - 1]);
    if (s.link) { ok(/PAGE_OF=\{A:'bots',B:'bots'/.test(frameSrc) && s.grp === 'b', 'symptom ' + s.id + ': its card is on the Bots page (group B)'); continue; }
    const el = find(root, s.blk);
    ok(el, 'symptom ' + s.id + ': its block ' + s.blk + ' exists on the page');
    if (!el) continue;
    ok(el.classList.contains('arrflash') && folds(el).every(d => d.open), 'symptom ' + s.id + ': its block opened and marked');
    if (s.preset) ok(find(root, 'bots.targets.' + (s.card === 'sel' ? 'sel' : 'ammo') + '.presets').all().some(e => e.getAttribute && e.getAttribute('data-tg') === 'p.' + s.preset), 'symptom ' + s.id + ': its preset ' + s.preset + ' shown in the block');
  }
  // the other direction (mgwaste): on a mod with bullet rules in the tank blocks the fix removes them
  W(AM, mgText);
  const P2 = page('as64', ctx, mod); await settle();
    P2.kits[0].so.onPick('mgwaste', null, 'index');
  P2.root.all().find(e => e.tagName === 'BUTTON' && e.getAttribute('data-symfix') === 'mgwaste').click(); await settle();
  const s2 = find(P2.root, 'bots.targets.ammo.save');
  const lines2 = s2.all().filter(e => e.tagName === 'DIV' && e.parentNode && e.parentNode.tagName === 'PRE').map(e => e.textContent);
  ok(s2.all().filter(e => e.tagName === 'LI' && !folds(e).length).length === 2 && lines2.filter(x => x.indexOf('- ') === 0).length === 2 && !lines2.some(x => x.indexOf('+ ') === 0), 'mgwaste: the fix removes the two bullet rules ' + JSON.stringify(lines2));
  fs.unlinkSync(AM);
  // a symptom whose part is not loaded: env.go to its group
  const P3 = page('as64', ctx, mod, { noBrain: true }); await settle();
  P3.kits[0].so.onPick('noretreat', null, 'index');
  P3.root.all().find(e => e.getAttribute && e.getAttribute('data-sym') === 'noretreat').click(); await settle();
  ok(P3.goes[P3.goes.length - 1] === 'group.d', 'brain part not loaded: the jump goes to group D ' + P3.goes.join());
  // Gates of Hell: the GoH block of each symptom exists (sight range = the greyed line with its Editor link)
  const PG = page('goh', gctx, gmod); await settle();
  const pg = BC.checkScreen(PG.root, 'unitai');
  ok(!pg.length, 'GoH block rules: ' + pg.slice(0, 5).join(' | '));
  for (const s of TS) { const id = s.gohBlk || s.blk; if (!s.link) ok(find(PG.root, id), 'GoH symptom ' + s.id + ': its block ' + id + ' exists'); }
  // S15 / item 5: on Gates of Hell the symptoms whose setting cannot be changed there are greyed with one line, no buttons, at the end
  const gS = id => find(PG.root, 'bots.targets.sym.' + id), offIds = TS.filter(s => s.noGoh).map(s => s.id);
  ok(offIds.join() === 'spotfar,blind,spotnone' && offIds.every(i => gS(i) && gS(i).all().some(e => e.getAttribute && e.getAttribute('data-nogoh') && e.textContent === tx('bots.targets.sym.noGoh', { game: 'Gates of Hell' })) && !gS(i).all().some(e => e.tagName === 'BUTTON') && gS(i).has(tx('bots.targets.sym.offName', { s: en['bots.targets.sym.' + i], game: 'Gates of Hell' }))), 'GoH: sight symptoms greyed "Not available in Gates of Hell", no buttons: ' + offIds.join());
  ok(offIds.every(i => folds(gS(i)).some(d => d.getAttribute('data-blk') === 'bots.targets.sym.all')) && TS.filter(s => !s.noGoh && !s.link).every(s => gS(s.id).all().some(e => e.getAttribute && e.getAttribute('data-sym') === s.id)), 'GoH: the greyed ones sit under "Show all"; every other symptom keeps its buttons');
  // round 4 item 6 (S15): on Gates of Hell the attack-waves line does not send people to the habits card (not available there): it names
  // the Bot difficulty card and opens it; per-game wording comes from the game's one name
  const gW = gS('waves'), gWb = gW && gW.all().find(e => e.tagName === 'BUTTON');
  ok(TS.find(s => s.id === 'waves').gohBlk === 'diff' && gW && gW.has(tx('bots.targets.sym.waves.gohLink', { game: 'Gates of Hell' })) && !gW.has(en['bots.recipes.title'] || 'Teach the bot new habits') && gWb && gWb.textContent === en['bots.targets.sym.link.goGoh'], 'GoH: the waves line names "Bot difficulty", not the habits card');
  gWb.click(); await settle();
  ok(PG.goes[PG.goes.length - 1] === 'diff' && /id:'diff'/.test(frameSrc), 'GoH: the waves button opens the Bot difficulty card (that card exists): ' + PG.goes[PG.goes.length - 1]);
  ok(find(PG.root, 'bots.targets.stat').has(tx('bots.targets.goh', { game: 'Gates of Hell' })) && !/\{game\}/.test(PG.root.textContent), 'GoH: the note names the game; no unfilled {game}');
  const PK = page('goh', gctx, gmod, { kitMore: { game: () => 'GoH-Name' } }); await settle();
  ok(find(PK.root, 'bots.targets.stat').has(tx('bots.targets.goh', { game: 'GoH-Name' })) && find(PK.root, 'bots.targets.sym.spotfar').has(tx('bots.targets.sym.offName', { s: en['bots.targets.sym.spotfar'], game: 'GoH-Name' })), 'the game is named by kit.game when the frame has it');
  // round 4 item 7: a search that finds nothing shows "Nothing found. Try ..." instead of an empty list; it goes when something matches
  const noneRow = () => find(root, 'bots.targets.sym.none');
  ok(noneRow() && noneRow().hidden, 'no "Nothing found" line while the list shows');
  sin.value = 'zzzz'; sin.fire('input');
  ok(!noneRow().hidden && noneRow().has(tx('bots.targets.none', { hint: en['bots.targets.sym.noneHint'] })) && TS.every(s => symB(s.id).hidden), 'an empty symptom search: Nothing found, with a hint: ' + noneRow().textContent);
  sin.value = 'tank'; sin.fire('input');
  ok(noneRow().hidden, 'the line goes when something matches');
  sin.value = ''; sin.fire('input');
  const PN2 = page('as64', ctx, mod, { kitMore: { none: hint => P1.F.h('div', { class: 'hint', text: 'KITNONE ' + hint }) } }); await settle();
  ok(find(PN2.root, 'bots.targets.sym.none').has('KITNONE ' + en['bots.targets.sym.noneHint']), 'kit.none words the line when the frame has it');
  // round 4 item 1: no mod picked: each card says so in one line (the pick-a-mod line) instead of empty lists and a read error; the symptom
  // buttons are greyed with the reason in their tooltip; nothing is asked from the server
  const P0 = page('as64', ctx, ''); await settle();
  const c0 = id => find(P0.root, id), needs = e => e.all().filter(x => x.getAttribute && x.getAttribute('data-needmod'));
  ok(['bots.targets.sym', 'bots.targets.sel', 'bots.targets.ammo'].every(id => c0(id) && needs(c0(id)).length === 1 && c0(id).has(en['bots.needmod'])), 'no mod: the pick-a-mod line on the symptom card and both rule cards');
  ok(!P0.root.has(en['bots.targets.e.read']) && !P0.calls.some(c => /^targets\//.test(c[1])), 'no mod: no "could not be read" error, no request sent');
  const hid = id => { const e = c0(id); return e && (e.hidden || folds(e).length > 0 || (function up(n) { return !!n && (n.hidden || up(n.parentNode)); })(e)); };
  ok(['bots.targets.sel.pick', 'bots.targets.sel.save', 'bots.targets.sel.groups', 'bots.targets.ammo.pick', 'bots.targets.ammo.save', 'bots.targets.ammo.rules'].every(hid), 'no mod: the empty Shooter and Target selects, lists and buttons are not shown');
  const sb0 = P0.root.all().filter(e => e.tagName === 'BUTTON' && (e.getAttribute('data-symfix') || (e.getAttribute('data-sym') && e.getAttribute('data-sym') !== 'waves')));
  ok(sb0.length >= 13 && sb0.every(b => b.disabled && TT(b) === en['bots.targets.needMod.tip']), 'no mod: every symptom button greyed with a tooltip that says why (' + sb0.length + ')');
  const P0k = page('as64', ctx, '', { kitMore: { needMod: id => P1.F.h('div', { 'data-needmod': '1', text: 'KITNEEDMOD' }) } }); await settle();
  ok(['bots.targets.sym', 'bots.targets.sel', 'bots.targets.ammo'].every(id => find(P0k.root, id).has('KITNEEDMOD')), 'kit.needMod draws the line when the frame has it');
  // no game folder (and the mod has no target rules of its own): the set-the-game-folder line on each card, the buttons greyed
  const emod = path.join(work, 'emptymod'); fs.mkdirSync(emod, { recursive: true }); modInfo(emod);
  const P9 = page('as64', noGame, emod); await settle();
  const c9 = id => find(P9.root, id);
  ok(['bots.targets.sym', 'bots.targets.sel', 'bots.targets.ammo'].every(id => c9(id).all().filter(x => x.getAttribute && x.getAttribute('data-needgame')).length === 1 && c9(id).has(en['bots.targets.needGame'])) && !P9.root.has(en['bots.targets.e.read']), 'no game folder: the set-the-game-folder line on all three cards, no generic read error');
  const sb9 = P9.root.all().filter(e => e.tagName === 'BUTTON' && e.getAttribute('data-symfix'));
  ok(sb9.length && sb9.every(b => b.disabled && TT(b) === en['bots.targets.needGame.tip']) && c9('bots.targets.ammo.pick').hidden && c9('bots.targets.sel.save').hidden, 'no game folder: fix buttons greyed with the reason, the empty selects hidden');
  const P9k = page('as64', noGame, emod, { kitMore: { needGame: id => P1.F.h('div', { 'data-needgame': '1', text: 'KITNEEDGAME' }) } }); await settle();
  ok(find(P9k.root, 'bots.targets.ammo').has('KITNEEDGAME') && find(P9k.root, 'bots.targets.sym').has('KITNEEDGAME'), 'kit.needGame draws the line when the frame has it');
  // a page with a mod and a game greys nothing
  ok(root.all().filter(e => e.tagName === 'BUTTON' && e.getAttribute('data-sym')).every(b => !b.disabled) && !root.all().some(e => e.getAttribute && (e.getAttribute('data-needmod') || e.getAttribute('data-needgame'))) && !find(root, 'bots.targets.ammo.pick').hidden, 'mod and game set: nothing greyed, no line: ' + root.all().filter(e => e.tagName === 'BUTTON' && e.getAttribute('data-sym') && e.disabled).length + ' ' + root.all().filter(e => e.getAttribute && (e.getAttribute('data-needmod') || e.getAttribute('data-needgame'))).map(e => e.textContent).join() + ' ' + find(root, 'bots.targets.ammo.pick').hidden);
  // item 6: a target state that cannot be read: one plain sentence with the next step, the raw reason in Details
  const PE = page('as64', noGame, path.join(work, 'nomod-' + Date.now())); await settle();
  const stE = find(PE.root, 'bots.targets.stat');
  ok(stE && stE.has(en['bots.targets.e.read']) && stE.has(tx('bots.targets.e.why', { m: '' }).trim()) && !stE.has('Could not read the target files'), 'state error: plain sentence and next step, no raw "Could not read" line: ' + (stE && stE.textContent));
  // Browse pick of ammo.set opens the ammo card
  kits[0].so.onPick('ammo.set', null, 'browse'); await settle();
  ok(goes[goes.length - 1] === 'bots.targets.ammo', 'browse pick of ammo.set: the ammo card');
  // S10 rule lists: a target with 12 rules shows 8, each folded to its one plain line, the rest under "Show all 12"
  const m12 = path.join(work, 'mod12'), many = ['"shell fg"', '"hmgun"', '"bullet"', '"light"', '"zenite"', '"ptr"', '"shell ap"', '"grenade ap"', '"size3 fg"', '"grenade fg"', '"ammo rocketlauncher"', '"bullet" {enable_for_ai 0}']; modInfo(m12);
  W(path.join(TD(m12), 'ammo.set'), C('{select_ammo\n\t{human\n' + many.map(r => '\t\t{' + r + '}\n').join('') + '\t}\n}\n'));
  const PM = page('as64', ctx, m12); await settle();
  const rl = find(PM.root, 'bots.targets.ammo.rules');
  const shownLi = rl.all().filter(e => e.tagName === 'LI' && folds(e).every(d => d.open));
  const allF = rl.all().find(e => e.tagName === 'DETAILS' && e.getAttribute('data-all'));
  ok(shownLi.length === 8 && allF && !allF.open && allF.has(tx('bots.targets.all', { n: 12 })) && rl.all().filter(e => e.tagName === 'LI').length === 12, 'rules: 8 shown, 4 under "Show all 12" (' + shownLi.length + ')');
  const li0 = rl.all().filter(e => e.tagName === 'LI');
  ok(li0.every(li => li.children[0].tagName === 'DETAILS' && !li.children[0].open && !li.children[0].all().some(e => e.tagName === 'INPUT')) && openRow(li0[0]).all().filter(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'checkbox').length === 3, 'each rule folds to one line; its three switches are made when it is opened');
  li0[0].children[0].open = false;
  const sums = li0.map(li => li.children[0].children[0].textContent);
  ok(sums[0] === tx('bots.targets.rl.all', { t: en['bots.targets.atag.shell_fg'] }) && sums[11] === tx('bots.targets.rl.user', { t: en['bots.targets.atag.bullet'] }), 'rule lines in plain words: ' + sums[0] + ' / ' + sums[11]);
  ok(sums.every(x => !/[{}"]|_/.test(x)), 'no tags or code in the rule lines');
  // item 1: the same ammo twice in one block (a "ready" rule, then a plain one, as the game's own human/in_cover) reads as two different
  // lines: each line names its options; a rule exactly like an earlier one says which; vehicle parts by their names
  const m13 = path.join(work, 'mod13'); modInfo(m13);
  W(path.join(TD(m13), 'ammo.set'), C('{select_ammo\n\t{human\n\t\t{"shell fg" {ready_for_shot}}\n\t\t{"shell fg"}\n\t\t{"hmgun" {volume "body"}}\n\t\t{"shell fg"}\n\t}\n}\n'));
  const PO = page('as64', ctx, m13); await settle();
  const s13 = find(PO.root, 'bots.targets.ammo.rules').all().filter(e => e.tagName === 'LI').map(li => li.children[0].children[0].textContent);
  const he = en['bots.targets.atag.shell_fg'];
  ok(s13.length === 4 && s13[0] === tx('bots.targets.rl.all', { t: he }) + ' (' + en['bots.targets.opt.ready_for_shot'] + ')' && s13[1] === tx('bots.targets.rl.all', { t: he })
    && s13[2] === tx('bots.targets.rl.all', { t: en['bots.targets.atag.hmgun'] }) + ' (' + tx('bots.targets.opt.volume', { v: en['bots.targets.vol.body'] }) + ')'
    && s13[3] === tx('bots.targets.rl.all', { t: he }) + ' ' + tx('bots.targets.rl.again', { n: 2 }) && new Set(s13).size === 4, 'rule lines: options named, repeats marked, no line twice: ' + JSON.stringify(s13));
  ok(LANG.filter(r => r[0] === 'bots.targets.opt.disable').every(r => !/\(disable\)/.test(r.join('|'))), 'the switched-off line has no code word');
  // plural rows exist in every form for the client's pl() keys
  const plk = [...src.matchAll(/\bpl\('([a-zA-Z0-9_.]+)'/g)].map(m => m[1]);
  ok(plk.length >= 3 && plk.every(k => ['one', 'few', 'many', 'other'].every(f => keys.has('bots.targets.' + k + '.' + f))), 'plural keys in all four forms: ' + plk.join());
  ok(tx('bots.targets.write.ask.one', { n: 1 }) === 'Write 1 change into your mod?', 'one change, singular');
  // every key the client asks for exists
  const used = [...src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map(m => 'bots.targets.' + m[1]).concat([...src.matchAll(/tx\('(bots\.targets\.[a-zA-Z0-9_.]+)'/g)].map(m => m[1]));
  const miss = used.filter(k => !k.endsWith('.') && !keys.has(k));
  ok(!miss.length, 'every client key has a lang row: ' + miss.join());
  // round 4 item 10: one word per thing, as the frame words them (uk карта, zh 人机对战 and the game's own name)
  const FR = Object.keys(FRAME.en).length ? FRAME : null, col = i => LANG.map(r => r[i]).join('\n');
  ok(!/мап[аиуіо]/i.test(col(3)) && !/机器人对战|《战争之门》|详情/.test(col(4)) && (!FR || !FR.zh['bots.next.match'] || LANG.find(r => r[0] === 'bots.targets.next.match')[4] === FR.zh['bots.next.match']), 'uk: карта only; zh: the frame\'s words for a bot match, Details and the game');
  ok(Object.keys(T.PRESETS).every(id => keys.has('bots.targets.preset.' + id.toLowerCase()) && keys.has('bots.targets.preset.' + id.toLowerCase() + '.d') && CAT.presets[id]), 'each preset has a name, a line and a catalog row');
}

function lang() {
  const seen = new Set(), probs = [];
  for (const r of LANG) {
    if (!Array.isArray(r) || r.length !== 5 || r.some(s => typeof s !== 'string' || !s.trim())) { probs.push('row ' + (r && r[0])); continue; }
    if (r[0].indexOf('bots.targets.') !== 0) probs.push('key ' + r[0]);
    if (seen.has(r[0])) probs.push('twice ' + r[0]); seen.add(r[0]);
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    for (let i = 2; i < 5; i++) if (ph(r[i]) !== ph(r[1])) probs.push('placeholders ' + r[0] + ' [' + i + ']');
    if (r.slice(1).some(s => /(^|[^A-Za-z])as64([^A-Za-z]|$)/.test(s))) probs.push('bare as64 in ' + r[0]);
  }
  ok(!probs.length, 'lang rows: 4 languages, keys bots.targets., placeholders kept: ' + probs.slice(0, 6).join(' | '));
  // the catalog: every key written has a trust tag; no source-file cites
  const wr = [];
  for (const sec of ['selector', 'terms', 'ammo']) for (const [k, v] of Object.entries(CAT[sec])) if (v.write && !/^[VIT]$/.test(v.tag)) wr.push(k);
  ok(!wr.length && CAT.terms.in_range.write && /metres/.test(CAT.terms.in_range.unit), 'catalog: written keys carry a trust tag; in_range in metres: ' + wr.join());
  ok(!/\.(cpp|h):\d/.test(JSON.stringify(CAT)), 'catalog: no source-file cites');
}

(async () => {
  await server();
  await client();
  lang();
  console.log(bad ? bad + ' failures of ' + n : 'bots part targets PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
