// bots part "brain" test. Arg: scratch dir. No game, no network: a fake AS2 install with properties/human.ext in the stock form (CRLF, the
// stock Sensor and brain blocks, a cp1251 comment byte) and a fake GoH install (LF, the GoH brain with its Properties block), plus set/stuff
// files for the guns list. Asserts: the parser round trip is byte-identical; every catalog key of each game is found in the stock form or
// goes in exactly where the engine reads it; each edit is exact (value replaced, Sensor key added, Properties block made, switch on/off,
// pair); range refusals (400); writes copy the game file in and keep CRLF/LF and the cp1251 byte; reset puts the game's values back and
// removes a copy equal to the game's file; guns list (a mod file replaces the game's of the same path); sight range (set/vision: metres
// shown, r(N) and the multiplier written, GoH and unknown forms refused); the frame's one Undo (lib.undoRoute) puts back the exact bytes
// of every file of a write, refused once a file changed since; the part contract (parts/index.js check); the client in
// tools/gui/test/fakedom.js with the page's own h() and the block rules (blockcheck): one block per setting, More options and Details
// folds, counts that match, the green box and its Undo, the GoH sight line with its Editor link. Prints FAIL lines, exit 1.
// Author: Imperator_Aug (ARSENAL, ia-b8426054)
'use strict';
const fs = require('fs'), path = require('path');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'brain-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), B = require('./brainfile'), CAT = require('./catalog.json');
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
const SW = require(path.join(T, 'lib', 'sdlwrite'));
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b));
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };
const RD = p => fs.readFileSync(p, 'latin1');
const R = X.routes, U = q => ({ searchParams: new URLSearchParams(q) });
const crlf = a => a.join('\r\n') + '\r\n', lf = a => a.join('\n') + '\n';

// ---- the stock form of AS2 properties/human.ext (the blocks this part reads, as the game has them) + a cp1251 comment byte
const FA = crlf([';SDL', 'human', ';\xcf\xf0\xe8\xec\xe5\xf0 cp1251', '',
  '{extender "stuff"', '\t{item "human"}', '}', '',
  '{Sensor', '\t{Visor "eyes"', '\t\t{vision "human"}', '\t\t{bone "visor"}', '\t}', '\t{Visor "telescope"}', '\t{AttackZone 2.5}', '\t{RecognizeTime 0.25}',
  '\t{InformRange 40 40}\t\t;first - AI ;second - USER', '}', '',
  '{brain "human"',
  '\t{const "bomb/detect_explosives" 7}\t\t;detect explosives inside 7 meter radius',
  '\t{const "bomb/detect_grenades" \t5}\t\t;detect grenades inside 5 meter radius',
  '\t{const "bomb/danger_zone_run" \t3}\t\t;run away if danger is inside 0 - 2 meter radius',
  '\t{const "bomb/danger_zone_jump" \t4}\t\t;jump away if danger is inside 2 - 4 meter radius',
  '\t{const "bomb/danger_zone_hide" \t6}\t\t;hide if danger is inside 4 - 6 meter radius',
  '\t{const "fight/distance"\t\t\t1.5}', '}', '', '{lodclass "human"}']);
// GoH: LF, its brain consts and Properties block, its Sensor values
const FG = lf([';SDL', '', '{Sensor', '\t{Visor "eyes"', '\t\t{vision "human"}', '\t\t{bone "visor"}', '\t}', '\t{Visor "telescope"}', '\t{AttackZone 2.5}',
  '\t{MinRecognizeTime 0.01}', '\t{RecognizeTime 0.01}', '\t{InformRange 80 100}\t\t;// first = AI , second = USER', '}', '',
  '{brain "human"',
  '\t{const "bomb/detect_explosives"\t7}\t\t;// detect explosives inside 7 meter radius',
  '\t{const "bomb/detect_grenades"\t5}\t\t;// detect grenades inside 5 meter radius',
  '\t{const "bomb/danger_zone"\t\t7}\t\t;// hide if danger is more than "x" meters away, otherwise run away',
  '\t{const "fight/distance"\t\t\t2} \t\t;// was at 1.5', '\t{const "weapon/change_time"\t\t5}', '', '',
  '\t{Properties', '\t\t{advance_ratio 0.5}', '\t\t{retreat_ratio 4}', '\t}', '}']);

const game = path.join(work, 'game'), GR = (...p) => path.join(game, 'resource', ...p);
W(path.join(game, 'as64.exe'), '');
W(GR('properties', 'human.ext'), FA);
W(GR('set', 'stuff', 'mg', 'mg42.ext'), crlf(['{burst 5 10}', '{AimingTolerance 3}', ';{PrepareTime 2}']));
W(GR('set', 'stuff', 'rifle', 'sniper.ext'), crlf(['{special', '\t{PrepareTime 2}', '}', '{RelaxationTime 0.5 1}']));
// the stock form of set/vision: the radius macro (x 0.75) and the vision_* presets with ("radius" r(N))
const VSET = crlf(['{visions', '', '(define "radius"', '\t{radius (* 0.75 %r)}', ')', '(include "vision_generic.inc")', '}']);
const VGEN = crlf([';vision presets', ...[['vision_human', 70], ['vision_humancrew', 40], ['vision_optic', 90], ['vision_gunner', 40], ['vision_turret', 40]]
  .map(([n, r]) => ['(define "' + n + '"', '    ("radius" r(' + r + '))', '    ("angle" 120)', ')'].join('\r\n'))]);
W(GR('set', 'vision', 'vision.set'), VSET);
W(GR('set', 'vision', 'vision_generic.inc'), VGEN);
const goh = path.join(work, 'goh');
W(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
W(path.join(goh, 'resource', 'properties', 'human.ext'), FG);
const ctx = { game: () => game, tools: T, tmpRoot: work };
const noGame = { game: () => null, tools: T, tmpRoot: work };
const hctx = { gameId: () => 'goh', exe: () => 'goh', kind: () => 'goh', game: () => game, gohDir: () => goh, curDir: () => goh, tools: T, tmpRoot: work };
const newMod = name => { const m = path.join(work, name); fs.rmSync(m, { recursive: true, force: true }); modInfo(m); return m; };
const HX = m => path.join(m, 'resource', 'properties', 'human.ext');
const val = (txt, id) => { const it = CAT.items.find(x => x.id === id); return B.valueOf(B.nodeOf(SW.parse(Buffer.from(txt, 'latin1')), it), it); };
const editR = (c, mod, changes, write) => R['POST /api/x/bots/brain/edit'](null, { mod, changes, write: !!write }, c);
const resetR = (c, mod, ids) => R['POST /api/x/bots/brain/reset'](null, { mod, ids, write: true }, c);
const valuesR = (c, mod) => R['GET /api/x/bots/brain/values'](U('mod=' + encodeURIComponent(mod)), null, c);
const status = async f => { try { await f(); return 0; } catch (e) { return e.status || -1; } };

(async () => {
  // ---- contract (parts/index.js check: routes, lang rows, page rules of the script)
  const PI = require('../index');
  eq(PI.check('brain', X), '', 'part contract');
  ok(PI.some(p => p.id === 'brain'), 'parts/index.js loads the part ' + JSON.stringify(PI.skipped));
  ok(X.group === 'D' && X.order === 10, 'group D, order 10');
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const r of X.lang) ok(r.slice(2).every(s => ph(s) === ph(r[1])), 'placeholders the same in every language: ' + r[0]);
  ok(new Set(X.lang.map(r => r[0])).size === X.lang.length, 'lang keys unique');
  const LK = new Set(X.lang.map(r => r[0]));
  for (const it of CAT.items) ok(LK.has('bots.brain.k.' + it.id + '.n') && LK.has('bots.brain.k.' + it.id + '.e'), 'name and effect text: ' + it.id);
  for (const g of CAT.guns) ok(LK.has('bots.brain.g.' + g.id + '.n') && LK.has('bots.brain.g.' + g.id + '.e'), 'gun text: ' + g.id);
  for (const l of CAT.leftOut) ok(LK.has('bots.brain.lo.' + l.id), 'left-out text: ' + l.id);
  for (const it of CAT.items) for (const s of ['as2', 'goh']) if (it[s]) ok(/^(V|I|T)$/.test(it[s].tag) && typeof it[s].reader === 'string', 'catalog reader field and tag: ' + it.id + ' ' + s);
  ok(!/\.(cpp|h):\d/.test(JSON.stringify(CAT)), 'catalog: no source-file cites');

  // ---- parser round trip: byte-identical with no change
  ok(SW.serialize(SW.parse(Buffer.from(FA, 'latin1'))).equals(Buffer.from(FA, 'latin1')), 'round trip AS2 byte-identical');
  ok(SW.serialize(SW.parse(Buffer.from(FG, 'latin1'))).equals(Buffer.from(FG, 'latin1')), 'round trip GoH byte-identical');

  // ---- values: the game's file through the vfs (no mod copy)
  const m0 = newMod('mod-empty');
  const v0 = await valuesR(ctx, m0);
  ok(v0.from === 'game' && v0.kind === 'as2' && v0.key === 'resource/properties/human.ext', 'values: AS2, from the game ' + v0.from);
  eq(v0.rows.map(r => r.id), CAT.items.filter(it => it.as2).map(it => it.id), 'values: every AS2 catalog row, in order');
  const sv = id => v0.rows.find(r => r.id === id);
  eq(['detect-explosives', 'detect-grenades', 'danger-run', 'danger-jump', 'danger-hide', 'fight-distance', 'attack-zone', 'recognize-time', 'inform-range'].map(id => sv(id).stock),
    ['7', '5', '3', '4', '6', '1.5', '2.5', '0.25', '40 40'], 'values: the stock values found in the stock form');
  eq(['retreat-ratio', 'advance-ratio', 'move-radius', 'threat-zone', 'remember-time'].map(id => sv(id).stock), [null, null, null, null, null], 'values: keys the stock form leaves out are not set');
  eq([sv('no-retreat').stock, sv('no-advance').stock], ['off', 'off'], 'values: switches off in the stock form');
  ok(sv('recognize-time').line === 16 && sv('fight-distance').line === 26 && sv('retreat-ratio').line === null, 'values: line numbers ' + sv('recognize-time').line + ' ' + sv('fight-distance').line);
  ok(sv('recognize-time').tag === 'V' && sv('recognize-time').reader === '', 'values: tag, no reader cite');
  eq(v0.notOffered, ['danger-zone', 'min-recognize-time'], 'values: GoH-only rows not offered under AS2');
  ok(Array.isArray(v0.leftOut) && v0.leftOut.length === CAT.leftOut.length, 'values: left-out list');
  ok(await status(() => valuesR(noGame, m0)) === 404, 'values: no game folder and no mod copy = 404');

  // ---- preview with no change: nothing listed, nothing written
  const p0 = await editR(ctx, m0, { 'recognize-time': '0.25', 'inform-range': '40  40', 'no-retreat': 'off', 'detect-grenades': '5.0' });
  ok(!p0.changes.length && !p0.diff.length && !fs.existsSync(HX(m0)), 'preview: the stock values = no change ' + JSON.stringify(p0.changes));
  const p00 = await editR(ctx, m0, {}, true);
  ok(!p00.written && !fs.existsSync(HX(m0)), 'write of nothing writes nothing');

  // ---- each edit exact (preview: list and diff; write: the bytes)
  const exact = async (label, changes, want, c, from) => {
    const m = newMod('mod-x');
    const p = await editR(c || ctx, m, changes);
    ok(!p.written && !fs.existsSync(HX(m)) && p.copiesWholeFile, label + ': preview writes nothing, copies the whole file');
    const w = await editR(c || ctx, m, changes, true);
    const got = fs.existsSync(HX(m)) ? RD(HX(m)) : null;
    ok(w.written && got === want, label + ': written bytes exact\n' + JSON.stringify(got) + '\nwant\n' + JSON.stringify(want));
    return p;
  };
  const FL = '\t{const "fight/distance"\t\t\t1.5}\r\n', INF = '\t{InformRange 40 40}\t\t;first - AI ;second - USER\r\n';
  let p = await exact('existing value replaced', { 'recognize-time': '0.5' }, FA.replace('{RecognizeTime 0.25}', '{RecognizeTime 0.5}'));
  eq(p.changes, [{ id: 'recognize-time', key: 'RecognizeTime', was: '0.25', now: '0.5' }], 'existing value: change list');
  eq(p.diff, [{ op: '-', n: 16, text: '\t{RecognizeTime 0.25}' }, { op: '+', n: 16, text: '\t{RecognizeTime 0.5}' }], 'existing value: diff');
  await exact('pair', { 'inform-range': '60 80' }, FA.replace('{InformRange 40 40}', '{InformRange 60 80}'));
  await exact('const', { 'danger-run': '2.5' }, FA.replace('"bomb/danger_zone_run" \t3}', '"bomb/danger_zone_run" \t2.5}'));
  await exact('.5 written as 0.5', { 'attack-zone': '.5' }, FA.replace('{AttackZone 2.5}', '{AttackZone 0.5}'));
  p = await exact('missing Sensor key added at the end of Sensor', { 'threat-zone': '20' }, FA.replace(INF, INF + '\t{ThreatZone 20}\r\n'));
  eq(p.diff, [{ op: '+', n: 18, text: '\t{ThreatZone 20}' }], 'missing Sensor key: diff');
  await exact('Properties block made after the brain\'s last line', { 'retreat-ratio': '3' }, FA.replace(FL, FL + '\t{Properties\r\n\t\t{retreat_ratio 3}\r\n\t}\r\n'));
  await exact('switch on', { 'no-retreat': 'on' }, FA.replace(FL, FL + '\t{Properties\r\n\t\t{no_retreat 1}\r\n\t}\r\n'));
  const ALL = FA.replace(INF, INF + '\t{ThreatZone 20}\r\n').replace(FL, FL + '\t{Properties\r\n\t\t{retreat_ratio 3}\r\n\t\t{no_retreat 1}\r\n\t\t{move_radius 25}\r\n\t}\r\n');
  await exact('several at once', { 'retreat-ratio': '3', 'no-retreat': 'on', 'move-radius': '25', 'threat-zone': '20' }, ALL);

  // ---- every AS2 catalog key: found in the stock form, or goes in where the reader looks (value read back)
  for (const it of CAT.items.filter(x => x.as2)) {
    const m = newMod('mod-cat'), v = it.kind === 'switch' ? 'on' : it.kind === 'pair' ? it.max + ' ' + it.max : String(it.max);
    const w = await editR(ctx, m, { [it.id]: v }, true);
    const got = w.written ? val(RD(HX(m)), it.id) : null;
    ok(got === v, 'catalog AS2 ' + it.id + ': ' + v + ' read back as ' + got);
  }

  // ---- range refusals (400) and unknown keys
  const m1 = newMod('mod-r');
  for (const [id, v] of [['retreat-ratio', '25'], ['retreat-ratio', '-1'], ['retreat-ratio', 'abc'], ['recognize-time', '0'], ['inform-range', '50'], ['inform-range', '50 2000'],
    ['no-retreat', 'maybe'], ['move-radius', '1e3'], ['nope', '1'], ['danger-zone', '3']])
    ok(await status(() => editR(ctx, m1, { [id]: v }, true)) === 400, 'refused: ' + id + ' = ' + v);
  ok(!fs.existsSync(HX(m1)), 'refusals write nothing');
  ok(await status(() => editR(noGame, m1, { 'retreat-ratio': '3' }, true)) === 400 && !fs.existsSync(HX(m1)), 'no game folder: write refused');
  ok(await status(() => editR(ctx, path.join(game, 'resource'), { 'retreat-ratio': '3' }, true)) === 400, 'the game install is no mod folder');

  // ---- write into a mod, change the mod's copy, reset: CRLF and the cp1251 byte kept, the copy goes when it equals the game's file
  const m2 = newMod('mod-w');
  await editR(ctx, m2, { 'retreat-ratio': '3', 'no-retreat': 'on', 'move-radius': '25', 'threat-zone': '20' }, true);
  let txt = RD(HX(m2));
  ok(txt === ALL && !/[^\r]\n/.test(txt) && txt.includes('\xcf\xf0\xe8\xec\xe5\xf0'), 'write: CRLF and cp1251 byte kept');
  const v2 = await valuesR(ctx, m2);
  ok(v2.from === 'mod' && v2.rows.find(r => r.id === 'retreat-ratio').mod === '3' && v2.rows.find(r => r.id === 'retreat-ratio').stock === null, 'values: from the mod, the game value beside it');
  const e2 = await editR(ctx, m2, { 'no-retreat': 'off', 'retreat-ratio': '2.5' }, true);
  ok(!e2.copiesWholeFile, 'second write changes the mod\'s copy in place');
  txt = RD(HX(m2));
  eq(txt, ALL.replace('\t\t{no_retreat 1}\r\n', '').replace('{retreat_ratio 3}', '{retreat_ratio 2.5}'), 'switch off (the game has no such line) = the line goes; value replaced in the mod copy');
  const r1 = await resetR(ctx, m2, CAT.items.filter(it => it.card === 'courage').map(it => it.id));
  ok(r1.had && !r1.fileRemoved && fs.existsSync(HX(m2)), 'reset courage: the copy stays (a seeing change is left)');
  eq(RD(HX(m2)), FA.replace(INF, INF + '\t{ThreatZone 20}\r\n'), 'reset courage: the empty Properties block goes too');
  const r2 = await resetR(ctx, m2, ['threat-zone']);
  ok(r2.fileRemoved && !fs.existsSync(HX(m2)), 'reset: copy equal to the game\'s file is removed');
  const r3 = await resetR(ctx, m2, null);
  ok(!r3.had && !r3.removed, 'reset with no copy: nothing to do');
  // a mod copy with its own other change: reset keeps it
  const m3 = newMod('mod-own');
  W(HX(m3), FA.replace('{lodclass "human"}', '{lodclass "human2"}').replace('{AttackZone 2.5}', '{AttackZone 9}'));
  const r4 = await resetR(ctx, m3, null);
  eq(RD(HX(m3)), FA.replace('{lodclass "human"}', '{lodclass "human2"}'), 'reset: catalog key back, the mod\'s other change kept');
  ok(!r4.fileRemoved && r4.changes.length === 1 && r4.changes[0].now === '2.5', 'reset: one change listed');
  // a switch the game has: off = 0 kept (GoH below)

  // ---- GoH: same path, LF kept, only its catalog rows
  const g0 = newMod('goh-mod');
  const vg = await valuesR(hctx, g0);
  ok(vg.kind === 'goh' && vg.from === 'game', 'GoH values from the GoH install');
  eq(vg.rows.map(r => r.id), CAT.items.filter(it => it.goh).map(it => it.id), 'GoH: only the rows with a GoH reader');
  eq(['retreat-ratio', 'advance-ratio', 'danger-zone', 'recognize-time', 'min-recognize-time', 'threat-zone'].map(id => vg.rows.find(r => r.id === id).stock), ['4', '0.5', '7', '0.01', '0.01', null], 'GoH stock values');
  ok(await status(() => editR(hctx, g0, { 'move-radius': '9' })) === 400, 'GoH: a key without a GoH reader row is refused');
  const GW = FG.replace('{retreat_ratio 4}', '{retreat_ratio 6}\n\t\t{no_advance 1}').replace('second = USER\n', 'second = USER\n\t{ThreatZone 30}\n');
  await exact('GoH: value, switch into the existing Properties, Sensor key', { 'retreat-ratio': '6', 'no-advance': 'on', 'threat-zone': '30' }, GW, hctx);
  for (const it of CAT.items.filter(x => x.goh)) {
    const m = newMod('goh-cat'), v = it.kind === 'switch' ? 'on' : String(it.max);
    const w = await editR(hctx, m, { [it.id]: v }, true);
    const got = w.written ? RD(HX(m)) : '';
    ok(val(got, it.id) === v && !got.includes('\r'), 'catalog GoH ' + it.id + ': read back, LF kept');
  }
  await editR(hctx, g0, { 'retreat-ratio': '6', 'no-advance': 'on' }, true);
  const rg = await resetR(hctx, g0, null);
  ok(rg.fileRemoved && !fs.existsSync(HX(g0)), 'GoH reset removes the copy equal to the game');
  // a switch the game has (a second GoH install, the game text is cached per folder): off writes 0, reset gives the game's line back
  const FG2 = FG.replace('{retreat_ratio 4}', '{retreat_ratio 4}\n\t\t{no_retreat on}'), goh2 = path.join(work, 'goh2');
  W(path.join(goh2, 'binaries', 'x64', 'call_to_arms.exe'), '');
  W(path.join(goh2, 'resource', 'properties', 'human.ext'), FG2);
  const hctx2 = Object.assign({}, hctx, { gohDir: () => goh2, curDir: () => goh2 });
  const g1 = newMod('goh-sw');
  await editR(hctx2, g1, { 'no-retreat': 'off' }, true);
  eq(fs.existsSync(HX(g1)) ? RD(HX(g1)) : null, FG2.replace('{no_retreat on}', '{no_retreat 0}'), 'switch the game has: off = 0, the line stays');
  ok(fs.existsSync(HX(g1)) && val(RD(HX(g1)), 'no-retreat') === 'off', 'switch 0 reads as off');
  const rg1 = await resetR(hctx2, g1, null);
  ok(rg1.fileRemoved, 'switch reset: the game\'s own text comes back ("on"), copy removed ' + JSON.stringify(rg1.changes));

  // ---- guns: read only, where the keys sit; a mod file replaces the game's of the same path; comments do not count
  const mg = newMod('mod-guns');
  W(path.join(mg, 'resource', 'set', 'stuff', 'mg', 'mg42.ext'), crlf(['{burst 7 12}']));
  const gu = await R['GET /api/x/bots/brain/guns'](U('mod=' + encodeURIComponent(mg)), null, ctx);
  const gr = id => gu.rows.find(r => r.id === id);
  ok(gu.gameRead && gu.rows.length === CAT.guns.length, 'guns: game read, one row per key');
  ok(gr('burst').count === 1 && gr('burst').hits[0].from === 'mod' && gr('burst').hits[0].text === '{burst 7 12}' && gr('burst').hits[0].key === 'resource/set/stuff/mg/mg42.ext', 'guns: the mod\'s file wins ' + JSON.stringify(gr('burst')));
  ok(gr('aiming-tolerance').count === 0, 'guns: the game file the mod replaced is not listed');
  ok(gr('prepare-time').count === 1 && gr('prepare-time').hits[0].line === 2 && gr('relaxation-time').count === 1, 'guns: commented line skipped, others found ' + JSON.stringify(gr('prepare-time')));
  const gn = await R['GET /api/x/bots/brain/guns'](U('mod=' + encodeURIComponent(mg)), null, noGame);
  ok(!gn.gameRead && gn.rows.find(r => r.id === 'burst').count === 1 && gn.rows.find(r => r.id === 'prepare-time').count === 0,'guns: no game folder = the mod only');

  // ---- diff helper
  eq(B.diff(Buffer.from('a\r\nb\r\nc\r\n'), Buffer.from('a\r\nB\r\nc\r\n')), [{ op: '-', n: 2, text: 'b' }, { op: '+', n: 2, text: 'B' }], 'diff: one line changed');

  // ---- sight range (set/vision): metres = r(N) x the multiplier; a change writes r = metres / multiplier, or the multiplier
  const VSP = m => path.join(m, 'resource', 'set', 'vision', 'vision.set'), VGP = m => path.join(m, 'resource', 'set', 'vision', 'vision_generic.inc');
  const sg = v0.sight || {}, srow = id => (sg.rows || []).find(r => r.id === id) || {};
  ok(sg.ok && sg.mult === '0.75', 'sight: the stock form read, multiplier 0.75 ' + JSON.stringify(sg.na || sg.mult));
  eq(['sight-human', 'sight-crew', 'sight-optic', 'sight-gunner', 'sight-turret', 'sight-all'].map(id => [srow(id).mod, srow(id).stock]),
    [['52.5', '52.5'], ['30', '30'], ['67.5', '67.5'], ['30', '30'], ['30', '30'], ['0.75', '0.75']], 'sight: metres in the stock form');
  ok(srow('sight-human').file === 'set/vision/vision_generic.inc' && srow('sight-human').line === 3 && srow('sight-all').file === 'set/vision/vision.set' && srow('sight-all').line === 4, 'sight: file and line ' + srow('sight-human').line + ' ' + srow('sight-all').line);
  const ms = newMod('mod-sight');
  const ps = await editR(ctx, ms, { 'sight-human': '60' });
  eq(ps.changes, [{ id: 'sight-human', key: CAT.sight[0].key, was: '52.5', now: '60' }], 'sight: preview change');
  ok(ps.files.length === 1 && ps.files[0].rel === 'set/vision/vision_generic.inc' && ps.files[0].copiesWholeFile && !fs.existsSync(VGP(ms)), 'sight: preview names the file, writes nothing');
  eq(ps.files[0].diff.map(d => d.op), ['-', '+'], 'sight diff: the removed line first, then the added one');
  const ws = await editR(ctx, ms, { 'sight-human': '60' }, true);
  ok(ws.written && RD(VGP(ms)) === VGEN.replace('r(70)', 'r(80)') && !fs.existsSync(VSP(ms)), 'sight: r(70) -> r(80) (60 m / 0.75), CRLF kept, vision.set untouched');
  ok((await valuesR(ctx, ms)).sight.rows.find(r => r.id === 'sight-human').mod === '60', 'sight: 60 read back');
  const ms2 = newMod('mod-sight2');
  const pm = await editR(ctx, ms2, { 'sight-all': '1', 'sight-human': '70' }, true);
  ok(pm.changes.length === 1 && pm.changes[0].id === 'sight-all' && RD(VSP(ms2)) === VSET.replace('0.75', '1') && !fs.existsSync(VGP(ms2)), 'sight: multiplier 1 and 70 m = the multiplier only ' + JSON.stringify(pm.changes));
  ok(await status(() => editR(ctx, ms2, { 'sight-human': '4' })) === 400 && await status(() => editR(ctx, ms2, { 'sight-all': '9' })) === 400, 'sight: out of range refused');
  const rsx = await resetR(ctx, ms, ['sight-human']);
  ok(rsx.fileRemoved && !fs.existsSync(VGP(ms)) && rsx.undo && rsx.undo.length === 1, 'sight reset: the copy equal to the game\'s file removed, undo listed');
  // a mod copy not in the stock form: reported, never guessed
  const mf = newMod('mod-form');
  W(VSP(mf), crlf(['{visions', '{radius 50}', '}']));
  ok((await valuesR(ctx, mf)).sight.na === 'form', 'sight: unknown form = na form');
  let ef = null; try { await editR(ctx, mf, { 'sight-human': '60' }); } catch (e) { ef = e; }
  ok(ef && ef.status === 400 && ef.key === 'bots.brain.e.sight.form', 'sight: unknown form refused with its key ' + (ef && ef.key));
  // GoH: another form, not offered
  ok((await valuesR(hctx, newMod('goh-s'))).sight.na === 'goh' && await status(() => editR(hctx, newMod('goh-s'), { 'sight-human': '60' })) === 400, 'sight GoH: na goh, an edit refused');

  // ---- the frame's one Undo: a write of two files and its undo list; exact bytes back; refused once a file changed since
  const LIB = require('../../lib'), undoR = (c, mod, list) => LIB.undoRoute(c, { mod, undo: list });
  const mu = newMod('mod-undo');
  const wu = await editR(ctx, mu, { 'recognize-time': '0.5', 'sight-human': '60' }, true);
  ok(wu.changes.length === 2 && wu.files.length === 2 && wu.undo && wu.undo.length === 2, 'mixed write: 2 changes, 2 files, an undo list of 2');
  ok(fs.existsSync(HX(mu)) && fs.existsSync(VGP(mu)), 'mixed write: both files in the mod');
  undoR(ctx, mu, wu.undo);
  ok(!fs.existsSync(HX(mu)) && !fs.existsSync(VGP(mu)), 'undo: files the mod did not have are removed again');
  W(HX(mu), FA.replace('{lodclass "human"}', '{lodclass "mine"}'));
  const before = fs.readFileSync(HX(mu));
  const wu2 = await editR(ctx, mu, { 'retreat-ratio': '3' }, true);
  ok(!fs.readFileSync(HX(mu)).equals(before), 'write over the mod\'s own copy');
  undoR(ctx, mu, wu2.undo);
  ok(fs.readFileSync(HX(mu)).equals(before), 'undo: the mod\'s own copy back byte for byte');
  const wu3 = await editR(ctx, mu, { 'retreat-ratio': '4' }, true);
  W(HX(mu), RD(HX(mu)) + ';later edit\r\n');
  let eu = null; try { undoR(ctx, mu, wu3.undo); } catch (e) { eu = e; }
  ok(eu && eu.status === 409 && eu.key === 'bots.e.undoChanged' && RD(HX(mu)).endsWith(';later edit\r\n'), 'undo refused after the file changed since, nothing touched ' + (eu && eu.key));
  let en2 = null; try { undoR(ctx, mu, wu2.undo); } catch (e) { en2 = e; }
  ok(en2 && en2.status === 409, 'undo of an entry already used: refused');
  ok(!R['POST /api/x/bots/brain/undo'], 'no own undo route: the frame\'s one Undo only');

  await client();
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'brain ok (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e && e.stack || e)); process.exit(1); });

// ---- client in the fake DOM: the page's own h(), stub tx/askDo, env.api on the routes (undo = lib.undoRoute), a kit with the frame's
// basic helpers only (the part's own fallbacks for details/more/done/na are what is drawn); block rules checked
async function client() {
  const fakedom = require(path.join(T, 'gui', 'test', 'fakedom')), BC = require(path.join(T, 'gui', 'test', 'blockcheck'));
  const LIB = require('../../lib'), FRAME = require('../../lang');
  const doc = fakedom.make(), h = BC.pageFns(doc).h;
  const EN = Object.assign({}, FRAME.en); X.lang.forEach(r => { EN[r[0]] = r[1]; });
  const missing = new Set();
  const tx = (k, p) => { if (!(k in EN)) { if (k.indexOf('bots.brain.') === 0) missing.add(k); return k; } return EN[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  const B_ = k => tx('bots.brain.' + k);
  const parts = [], pend = [], asked = [];
  const askDo = o => { asked.push(o); return { then: y => y(true) }; };
  const cm = newMod('client-mod');
  const leaf = (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids);
  const emsg = e => (e && typeof e === 'object' ? (e.key && e.key in EN ? tx(e.key, e.params) : String(e.message || e)) : String(e || ''));
  const env = (gid, c, mod) => ({
    mod, gid, reload() {},
    api(method, p, data, cb) {
      const key = method + ' /api/x/bots/' + p.split('?')[0];
      const run = key === 'POST /api/x/bots/undo' ? () => Promise.resolve().then(() => LIB.undoRoute(c, Object.assign({ mod }, data || {})))
        : () => (method === 'GET' ? R[key](U('mod=' + encodeURIComponent(mod)), null, c) : R[key](null, Object.assign({ mod }, data || {}), c));
      pend.push(run().then(j => cb(null, j), e => cb(emsg(e), undefined, e)));
    },
    kit: {
      leaf, hint: (id, t) => leaf(id, [h('div', { class: 'hint', text: t })]),
      section: (id, title, kids) => h('div', { class: 'card', blk: id, box: 'col', 'data-blkname': title }, [leaf(id + '.title', [h('h3', { text: title })])].concat(kids)),
      errBox: m => h('div', { class: 'err', text: emsg(m) }), qs: o => new URLSearchParams(o).toString(), hitsOf() {}, editor() {}, go() {},
    },
  });
  const flush = async () => { for (let i = 0; i < 6; i++) { while (pend.length) await pend.shift(); await null; } };
  new Function('BOTS_PARTS', 'h', 'tx', 'askDo', 'confirm', 'document', X.script)(parts, h, tx, askDo, () => true, doc);
  ok(parts.length === 1 && parts[0].id === 'brain' && parts[0].group === 'D' && parts[0].order === 10 && parts[0].title() === B_('title'), 'client: one part pushed');
  const draw = (gid, c, mod) => { const root = doc.createElement('div'); parts[0].draw(env(gid, c, mod)).forEach(el => root.appendChild(el)); return root; };
  const blk = (r, id) => r.all().find(e => e.getAttribute && e.getAttribute('data-blk') === id);
  const inFold = e => { for (let n = e && e.parentNode; n; n = n.parentNode) if (n.tagName === 'DETAILS') return true; return false; };
  const btn = (r, id, label) => { const b = blk(r, id); return b && b.all().find(e => e.tagName === 'BUTTON' && e.textContent === label); };
  const rowId = it => 'bots.brain.' + it.card + '.k.' + it.id;
  const AS2 = CAT.sight.concat(CAT.items).filter(it => it.as2), GOH = CAT.items.filter(it => it.goh);

  // no mod: one greyed line
  const r0 = draw('as64', ctx, '');
  // round 4 item 1: no mod picked: each of the three cards keeps its title and one line and shows the pick-a-mod line; nothing is read
  const needs0 = e => e.all().filter(x => x.getAttribute && x.getAttribute('data-needmod'));
  ok(['courage', 'seeing', 'guns'].every(c => { const e = blk(r0, 'bots.brain.' + c); return e && e.has(B_(c)) && e.has(B_(c + '.lead')) && blk(r0, 'bots.brain.' + c + '.needmod') && needs0(e).length === 1 && e.has(EN['bots.needmod'] || B_('needMod')); }) && !pend.length, 'client: no mod = the pick-a-mod line on each of the three cards, no request');
  ok(!r0.all().some(e => /^(INPUT|SELECT)$/.test(e.tagName)) && !r0.has(B_('e.read')), 'client: no mod = no empty boxes, no read error');
  eq(BC.checkScreen(r0, 'unitai'), [], 'client: no mod = block rules');
  {
    const e2 = env('as64', ctx, ''); e2.kit.needMod = id => h('div', { 'data-needmod': '1', text: 'KITNEEDMOD' });
    const rk = doc.createElement('div'); parts[0].draw(e2).forEach(el => rk.appendChild(el));
    ok(['courage', 'seeing', 'guns'].every(c => blk(rk, 'bots.brain.' + c).has('KITNEEDMOD')), 'client: kit.needMod draws the line when the frame has it');
  }
  // no game folder (and the mod has no copy): the set-the-game-folder line on both editable cards, the rows hidden, every button greyed
  // with that reason; a file that is merely missing while the game folder is set keeps the plain read error
  {
    const rn = draw('as64', noGame, newMod('client-nogame')); await flush();
    const ng = e => e.all().filter(x => x.getAttribute && x.getAttribute('data-needgame'));
    ok(['courage', 'seeing'].every(c => { const e = blk(rn, 'bots.brain.' + c); return ng(e).length === 1 && e.has(B_('needGame')) && !e.has(B_('e.read')); }), 'client: no game folder = the set-the-game-folder line on both cards, no generic read error');
    const bs = ['courage', 'seeing'].flatMap(c => blk(rn, 'bots.brain.' + c + '.btns').all().filter(e => e.tagName === 'BUTTON'));
    ok(bs.length === 8 && bs.every(b => b.disabled && (b.title !== undefined ? b.title : b.getAttribute('title')) === B_('needGame.tip')), 'client: no game folder = Preview, Write, Undo and Reset greyed with the reason in the tooltip');
    ok(blk(rn, 'bots.brain.courage.k.retreat-ratio').hidden && !blk(rn, 'bots.brain.guns').has(B_('e.read')), 'client: no game folder = the setting rows are hidden');
    const e3 = env('as64', noGame, newMod('client-nogame2')); e3.kit.needGame = id => h('div', { 'data-needgame': '1', text: 'KITNEEDGAME' });
    const rk = doc.createElement('div'); parts[0].draw(e3).forEach(el => rk.appendChild(el)); await flush();
    ok(blk(rk, 'bots.brain.courage').has('KITNEEDGAME') && blk(rk, 'bots.brain.seeing').has('KITNEEDGAME'), 'client: kit.needGame draws the line when the frame has it');
  }
  const root = draw('as64', ctx, cm); await flush();
  const ids = root.all().map(e => e.getAttribute && e.getAttribute('data-blk')).filter(Boolean);
  ok(ids.length && ids.every(i => i.startsWith('bots.brain.')), 'client: block ids start bots.brain. ' + ids.join());
  ok(!ids.includes('bots.brain.notice') && !root.has('every computer-controlled unit'), 'client: no "every computer-controlled unit" notice on the cards (the frame says it once)');
  eq(BC.checkScreen(root, 'unitai'), [], 'client: block rules');
  // one block per setting (the symptom picker jumps to it); rare ones under More options, the main ones not folded
  for (const it of AS2) {
    const b = blk(root, rowId(it));
    ok(b && inFold(b) === !!it.more, 'client: setting block ' + rowId(it) + (it.more ? ' under More options' : ' shown first'));
  }
  ok(!GOH.filter(it => !it.as2).some(it => blk(root, rowId(it))), 'client: GoH-only settings not drawn under AS2');
  for (const g of CAT.guns) ok(blk(root, 'bots.brain.guns.g.' + g.id), 'client: gun block ' + g.id);
  // tags only in Details, no source-file cites; no [V]/[I] text; tag words
  ok(!/\[[VIT]\]/.test(root.textContent), 'client: no [V]/[I] tags shown as text');
  const tags = root.all().filter(e => e.getAttribute && e.getAttribute('data-tag'));
  ok(tags.length >= AS2.length && tags.every(inFold), 'client: tag words inside Details (' + tags.length + ')');
  ok(tags.some(e => e.textContent === B_('tagw.I')) && tags.some(e => e.textContent === B_('tagw.V')), 'client: tag words "checked in the game" / "not yet tried in the game"');
  const refs = root.all().filter(e => (!e.children || !e.children.length) && /\.cpp:\d/.test(e.textContent || ''));
  ok(!refs.length, 'client: no source-file cites on the page (' + refs.length + ')');
  const kc = root.all().filter(e => e.tagName === 'CODE');
  ok(kc.length && kc.every(inFold), 'client: keys only inside Details');
  // a row: name, effect, slider + number box + range, game and mod values, "Raise it"
  const rr = blk(root, 'bots.brain.courage.k.retreat-ratio');
  ok(rr.has(B_('k.retreat-ratio.n')) && rr.has(B_('k.retreat-ratio.e')), 'client row: plain name and effect');
  ok(rr.all().some(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'range') && rr.all().some(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'number'), 'client row: a slider and a number box');
  ok(rr.has('allowed 0 to 20') && rr.has(tx('bots.brain.upPre', { w: B_('k.retreat-ratio.up') })), 'client row: the range and "Raise it"');
  const rt = blk(root, 'bots.brain.seeing.k.recognize-time');
  ok(rt.has('Game: 0.25 s') && rt.has('Your mod: same as the game'), 'client row: the game\'s value and the mod\'s ' + rt.textContent.slice(0, 200));
  const link = rt.all().find(e => e.tagName === 'A' && e.textContent === 'properties/human.ext:16');
  ok(link && inFold(link) && link.getAttribute('href') === '#go=' + encodeURIComponent('key:resource/properties/human.ext:16'), 'client row: #go= link to the line, in Details');
  const sh = blk(root, 'bots.brain.seeing.k.sight-human');
  ok(sh && sh.has('Game: 52.5 m') && sh.all().some(e => e.tagName === 'A' && e.getAttribute('href') === '#go=' + encodeURIComponent('key:resource/set/vision/vision_generic.inc:3')), 'client: sight range row, metres, its file link');
  ok(blk(root, 'bots.brain.guns.det') && root.has(B_('guns.arty')) && root.has(B_('leftOut')), 'client: guns: the artillery line, the left-out list in Details');
  // round 3 item 1: "Sharing what he sees" (a pair): each box hints the game's own number (40, not the engine default 20), each number
  // with its unit and what it is for, never "40 40 m"; units through the lang tables
  const ir = blk(root, 'bots.brain.seeing.k.inform-range');
  const irBoxes = ir.all().filter(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'number');
  const irGame = tx('bots.brain.pairPart', { p: B_('k.inform-range.p1'), v: '40 ' + B_('u.m') }) + '; ' + tx('bots.brain.pairPart', { p: B_('k.inform-range.p2'), v: '40 ' + B_('u.m') });
  ok(irBoxes.length === 2 && irBoxes.every(b => b.getAttribute('placeholder') === '40') && ir.has('Game: ' + irGame) && !ir.has('40 40') && ir.has(B_('k.inform-range.p1') + ':') && ir.has('allowed 0 to 1000 m') && !ir.has('m m'), 'client: pair row: game value hints, each number named with its unit once: ' + ir.textContent.slice(0, 260));
  ok(X.lang.filter(r => r[0] === 'bots.brain.u.m')[0][4] === '米' && X.lang.filter(r => r[0] === 'bots.brain.u.m')[0][2] === 'м', 'lang: metres translated (zh 米, ru м)');
  // item 1: Reset greyed with a plain tooltip while the mod has no copy; Undo greyed with its tooltip
  const TT = e => (e.title !== undefined ? e.title : e.getAttribute('title'));
  const rB = c => btn(root, 'bots.brain.' + c + '.btns', EN['bots.btn.reset']), uB = c => btn(root, 'bots.brain.' + c + '.btns', EN['bots.btn.undo']);
  ok(rB('courage').disabled && TT(rB('courage')) === B_('reset.no') && rB('seeing').disabled && uB('courage').disabled && TT(uB('courage')) === B_('undo.no'), 'client: no mod copy: Reset and Undo greyed with plain tooltips');
  ok(['courage', 'seeing'].every(c => !/^(To see it|Как увидеть|Як побачити|如何查看)/.test(X.lang.filter(r => r[0] === 'bots.brain.' + c + '.see')[0].slice(1).join('|')) && /^Play a match yourself/.test(B_(c + '.see'))), 'S19: the see texts start with the action (the frame adds "How to see it"), and say a match of your own counts');
  // edit retreat ratio: out of range warns; 3 -> preview sentence; write asks with the same count; the green box; its Undo
  const inp = rr.all().find(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'number');
  inp.value = '99'; inp.fire('input');
  ok(rr.has(tx('bots.brain.bad', { name: B_('k.retreat-ratio.n'), a: 0, b: 20, u: '' })), 'client: out-of-range warning');
  inp.value = '3'; inp.fire('input');
  btn(root, 'bots.brain.courage.btns', EN['bots.btn.preview']).click(); await flush();
  const res = () => blk(root, 'bots.brain.courage.res');
  const s1 = tx('bots.brain.line', { name: B_('k.retreat-ratio.n'), a: B_('notSetShort'), b: '3' }) + ' ' + B_('k.retreat-ratio.up');
  ok(s1 === 'Holding ground under fire: not set -> 3. Soldiers hold their ground longer under fire.' && res().has(s1), 'client: preview = a plain sentence ' + res().textContent.slice(0, 200));
  const pre = res().all().find(e => e.tagName === 'PRE');
  ok(pre && inFold(pre) && pre.textContent.includes('+ 28  \t\t{retreat_ratio 3}'), 'client: the exact file change folded ' + (pre && pre.textContent));
  const nli = res().all().filter(e => e.tagName === 'LI' && !inFold(e)).length;
  const wb = btn(root, 'bots.brain.courage.btns', EN['bots.btn.write']);
  ok(wb && !wb.disabled, 'client: Write on after a preview');
  wb.click(); await flush();
  const a1 = asked[asked.length - 1];
  ok(a1 && a1.lines[0] === tx('bots.brain.ask.one', { n: nli }) && nli === 1 && a1.lines.length === 2 && a1.lines[1] === tx('bots.brain.copyN.one', { n: 1 }), 'client: the confirm count = the changes listed ' + JSON.stringify(a1 && a1.lines));
  ok(fs.existsSync(HX(cm)) && val(RD(HX(cm)), 'retreat-ratio') === '3', 'client: written into the mod');
  const dn = blk(root, 'bots.brain.courage.res.done');
  ok(dn && dn.has(B_('doneH')) && dn.has(s1) && dn.has(B_('courage.see')) && dn.has(B_('next.match')), 'client: green box: what changes, how to see it, next steps');
  ok(blk(root, 'bots.brain.courage.k.retreat-ratio').has('Your mod: 3'), 'client: the card reloads with the mod value');
  ok(dn.has(B_('seeH')) && !rB('courage').disabled && TT(rB('courage')) === B_('reset.tip') && !uB('courage').disabled && TT(uB('courage')) === B_('undo.tip'), 'client: after a write: "How to see it" once, Reset and Undo on with their tooltips');
  btn(root, 'bots.brain.courage.res.done', EN['bots.btn.undo']).click(); await flush();
  ok(!fs.existsSync(HX(cm)) && blk(root, 'bots.brain.courage.res.done').has(B_('undone')), 'client: the green box\'s Undo puts the exact state back');
  ok(uB('courage').disabled && TT(uB('courage')) === B_('undo.no') && rB('courage').disabled, 'S18: after the green box Undo the card Undo greys with its tooltip; Reset greys (no copy again)');
  ok(blk(root, 'bots.brain.courage.k.retreat-ratio').has('Your mod: same as the game'), 'client: the card reloads after Undo');
  // seeing: two changes in two files, the count matches; the card's own Undo button
  const nb = (id, v) => { const e = blk(root, 'bots.brain.seeing.k.' + id).all().find(x => x.tagName === 'INPUT' && x.getAttribute('type') === 'number'); e.value = v; e.fire('input'); };
  nb('recognize-time', '0.5'); nb('sight-human', '60');
  btn(root, 'bots.brain.seeing.btns', EN['bots.btn.preview']).click(); await flush();
  const sr = blk(root, 'bots.brain.seeing.res');
  const n2 = sr.all().filter(e => e.tagName === 'LI' && !inFold(e)).length;
  ok(n2 === 2 && sr.has(tx('bots.brain.will.other', { n: 2 })) && sr.has('How far a soldier can see: 52.5 m -> 60 m.'), 'client: seeing preview lists 2 ' + sr.textContent.slice(0, 300));
  const pres = sr.all().filter(e => e.tagName === 'PRE').map(e => e.textContent);
  ok(pres.length === 2 && pres.every(p => p.indexOf('- ') === 0), 'client: each file diff shows the removed line first');
  btn(root, 'bots.brain.seeing.btns', EN['bots.btn.write']).click(); await flush();
  const a2 = asked[asked.length - 1];
  ok(a2.lines[0] === tx('bots.brain.ask.other', { n: 2 }) && a2.lines.length === 2 && a2.lines[1] === tx('bots.brain.copyN.other', { n: 2 }), 'client: confirm says 2 and counts both files with the right plural ' + JSON.stringify(a2.lines));
  ok(fs.existsSync(HX(cm)) && fs.existsSync(path.join(cm, 'resource', 'set', 'vision', 'vision_generic.inc')), 'client: both files written');
  const ub = btn(root, 'bots.brain.seeing.btns', EN['bots.btn.undo']);
  ok(ub && !ub.disabled, 'client: Undo on after a write');
  ub.click(); await flush();
  ok(!fs.existsSync(HX(cm)) && !fs.existsSync(path.join(cm, 'resource', 'set', 'vision', 'vision_generic.inc')) && blk(root, 'bots.brain.seeing.res').has(B_('undone')), 'client: the card\'s Undo puts both files back');
  // reset: back to the game's values, the copy removed
  const inp2 = blk(root, 'bots.brain.courage.k.retreat-ratio').all().find(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'number');
  inp2.value = '3'; inp2.fire('input');
  btn(root, 'bots.brain.courage.btns', EN['bots.btn.preview']).click(); await flush();
  btn(root, 'bots.brain.courage.btns', EN['bots.btn.write']).click(); await flush();
  ok(fs.existsSync(HX(cm)), 'client: written again');
  btn(root, 'bots.brain.courage.btns', EN['bots.btn.reset']).click(); await flush();
  ok(!fs.existsSync(HX(cm)) && blk(root, 'bots.brain.courage.res').has(B_('resetGone')), 'client: reset removes the copy');
  ok(!fs.existsSync(path.join(cm, 'resource', 'properties')), 'client: reset leaves no empty properties folder');
  // a switch (under More options)
  const cb = blk(root, 'bots.brain.courage.k.no-advance').all().find(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'checkbox');
  cb.checked = true; cb.fire('change');
  btn(root, 'bots.brain.courage.btns', EN['bots.btn.preview']).click(); await flush();
  ok(blk(root, 'bots.brain.courage.res').has(tx('bots.brain.line', { name: B_('k.no-advance.n'), a: B_('off'), b: B_('on') })), 'client: switch preview');
  eq(BC.checkScreen(root, 'unitai'), [], 'client: block rules after the writes');
  // GoH: its rows, the sight line greyed with its Editor link, the GoH note first
  const rg = draw('goh', hctx, newMod('client-goh')); await flush();
  const gids = rg.all().map(e => e.getAttribute && e.getAttribute('data-blk')).filter(Boolean);
  ok(gids[0] === 'bots.brain.goh', 'client GoH: the GoH line first');
  for (const it of GOH) ok(blk(rg, rowId(it)), 'client GoH: setting block ' + rowId(it));
  ok(!CAT.sight.some(it => blk(rg, rowId(it))), 'client GoH: no sight boxes');
  const gs = blk(rg, 'bots.brain.seeing.sight');
  const GN = { game: 'Gates of Hell' };
  ok(gs && gs.has(tx('bots.brain.sight.goh', GN)) && gs.all().some(e => e.tagName === 'A' && e.getAttribute('href') === '#go=' + encodeURIComponent('key:resource/set/vision/vision.set')), 'client GoH: sight line greyed with the Editor link');
  const gb = gs && gs.all().find(e => e.tagName === 'BUTTON' && e.getAttribute('data-go'));
  ok(gb && gb.textContent === B_('openEd') && !inFold(gb) && !/[/.](set|inc|ext)\b/.test(B_('sight.goh')) && /^Not available in Gates of Hell/.test(tx('bots.brain.sight.goh', GN)), 'client GoH: S15 line, no path in the main text, a button that opens the file');
  // round 4 item 6 (S15): only a thing that cannot work is "Not available". The Guns list can work in Gates of Hell and was only not tried
  // there, and the settings cards work apart from the one sight row: none of them carries the frame's "not available" mark (data-na), so
  // no card folds as "Not available"
  const gg = blk(rg, 'bots.brain.guns.goh');
  ok(gg && gg.has(tx('bots.brain.guns.goh', GN)) && /^Not yet tried in Gates of Hell/.test(gg.textContent) && !/Not available/.test(gg.textContent), 'client GoH: the Guns line says "Not yet tried in Gates of Hell"');
  ok(!rg.all().some(e => e.getAttribute && e.getAttribute('data-na')) && !/\{game\}/.test(rg.textContent) && blk(rg, 'bots.brain.goh').has(tx('bots.brain.gohNote', GN)), 'client GoH: no card is marked not available; the game is named in every line');
  {
    const e4 = env('goh', hctx, newMod('client-goh2')); e4.kit.game = () => 'GoH-Name'; e4.kit.na = () => { throw new Error('kit.na must not be used for a row'); };
    const rk = doc.createElement('div'); parts[0].draw(e4).forEach(el => rk.appendChild(el)); await flush();
    ok(blk(rk, 'bots.brain.guns.goh').has(tx('bots.brain.guns.goh', { game: 'GoH-Name' })) && blk(rk, 'bots.brain.seeing.sight').has(tx('bots.brain.sight.goh', { game: 'GoH-Name' })), 'client GoH: the game is named by kit.game when the frame has it');
  }
  // round 4 item 8 (S20): nothing in the catalog is an English sentence the page shows: the sight keys are code only, their "times the
  // radius multiplier" note is a lang row in four languages, and the row's Details shows it
  ok(CAT.sight.every(it => !/ x the | the /.test(it.key)) && CAT.sight.filter(it => it.keyX).length === 5 && X.lang.filter(r => r[0] === 'bots.brain.sight.keyX').every(r => new Set(r.slice(1)).size === 4), 'catalog: no English in the sight keys; the note is a lang row');
  ok(blk(root, 'bots.brain.seeing.k.sight-human').has(B_('sight.keyX')) && !root.has('x the radius multiplier'), 'client: the sight Details line comes from the lang table');
  // round 4 item 4: the Guns rows say what happens in a match; the engine's words (accuracy-by-motion, engine default) sit in Details
  ok(CAT.guns.every(g => !/accuracy-by-motion|Engine default/i.test(B_('g.' + g.id + '.e'))) && /accuracy-by-motion/.test(B_('g.spread-tolerance.det')) && /10 degrees/.test(B_('g.aiming-tolerance.e')), 'lang: Guns texts in plain words, engine words under Details');
  const sdet = blk(root, 'bots.brain.guns.g.spread-tolerance').all().find(e => e.textContent === B_('g.spread-tolerance.det'));
  ok(sdet && inFold(sdet), 'client: the engine wording of a Guns row is folded in Details');
  // round 4 item 9: one fold label and one Undone sentence
  ok(B_('undone') === 'Undone: ' + B_('undone.w') + '.' && /L\('bots\.showChange','exact'\)/.test(X.script) && !/text:t\('exact'\)/.test(X.script), 'one Undone sentence; the fold label is the frame\'s bots.showChange');
  // round 4 item 10: one word per thing in zh (the frame's words for a bot match and the games' own names), uk карта only
  ok(!X.lang.some(r => /机器人对战|《战争之门》|《突击小队2》/.test(r[4]) || /мап[аиуіо]/i.test(r[3])), 'lang: zh and uk words follow the frame');
  for (const k of ['e.num', 'e.range', 'e.pair']) ok(/\{name\}.*\{a\}.*\{b\}/.test(EN['bots.brain.' + k]) && !/\{id\}/.test(EN['bots.brain.' + k]),'lang: ' + k + ' names the field and the range');
  ok(blk(rg, 'bots.brain.guns.goh'), 'client GoH: the guns line');
  eq(BC.checkScreen(rg, 'unitai'), [], 'client GoH: block rules');
  ok(!missing.size, 'client: every text key exists in lang: ' + [...missing].join());
}
