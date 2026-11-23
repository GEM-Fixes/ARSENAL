// game.test: the Editor intel per game (game parity: AS64, MoW:AS2, GoH). arg 1 = scratch dir. last line PASS.
// Made-up fixtures only (built in the scratch dir): an AS2 install with as64.exe, mowas_2.exe and an as64/core file, a GoH folder
// with binaries/x64/call_to_arms.exe, a stand-in entity index child. Real installs are never read here.
//   intel/game.js gameOf/keyPart; fixes view per game (as64/core in or out), def() of an include per game; entity index child
//   gets --exe and one cache per game (AS64 arguments unchanged); GoH hover: vocab.goh.json, gohweb rows, no as64 engine row;
//   words per game; check(): .pot kind (po.js rules, GHLOC-06), mi findings as info under GoH, keylint gets the exe; fixes
//   parsers on GoH keylint output; kit catalog by game id (GoH words, hidden pieces); words.js hiddenFor; CLI --exe.
// Author: Imperator_Aug (ARSENAL, ia-aa4791bd)
'use strict';
const fs = require('fs'), path = require('path');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'ide-game-test'));
require('../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });
process.env.ARSENAL_CACHE = path.join(scratch, 'cache');   // index copies of this test stay in the scratch dir

let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ': got ' + A + ' want ' + B); }
const put = (root, rel, text) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

// ---- fixtures
const AS2 = path.join(scratch, 'as2');
put(AS2, 'as64.exe', ''); put(AS2, 'mowas_2.exe', '');
put(AS2, 'resource/set/base_only.inc', '(define "base_m" 1)\r\n');
put(AS2, 'as64/core/resource/set/core_only.inc', '(define "core_m" 1)\r\n');
const GOH = path.join(scratch, 'goh');
put(GOH, 'binaries/x64/call_to_arms.exe', '');
put(GOH, 'resource/set/base_only.inc', '(define "base_m" 1)\r\n');

const GAME = require('../intel/game');
const fixes = require('../intel/fixes'), N = require('../intel/nav'), check = require('../intel/check'), po = require('../intel/po');

// ---- intel/game.js
eq(GAME.gameOf({ gameDir: AS2, game: 'mowas2' }), { id: 'mowas2', exe: 'mowas_2', kind: 'as2', named: true }, 'gameOf: id mowas2');
eq(GAME.gameOf({ gameDir: AS2, exe: 'mowas_2' }).id, 'mowas2', 'gameOf: exe mowas_2');
eq(GAME.gameOf({ gameDir: AS2 }), { id: null, exe: undefined, kind: 'as2', named: false }, 'gameOf: nothing named on the AS2 install = vfs default');
eq(GAME.gameOf({ gameDir: GOH }), { id: 'goh', exe: undefined, kind: 'goh', named: false }, 'gameOf: a GoH folder without a name is GoH');
eq(GAME.gameOf({ gameDir: AS2, game: 'nonsense' }).named, false, 'gameOf: an unknown word counts as nothing named');
eq([GAME.keyPart(GAME.gameOf({})), GAME.keyPart(GAME.gameOf({ game: 'as64' })), GAME.keyPart(GAME.gameOf({ game: 'mowas2' })), GAME.keyPart(GAME.gameOf({ game: 'goh' }))],
  ['', '', '|mowas_2', '|goh'], 'keyPart: AS64 and none keep the old keys');

// ---- fixes view (also check's include view): as64/core in the AS64 view only
{
  const has = ictx => { const v = fixes._layer.viewOf(ictx); return v ? [v.exe, v.files.has('resource/set/core_only.inc'), v.files.has('resource/set/base_only.inc')] : null; };
  eq(has({ gameDir: AS2 }), ['as64', true, true], 'view, no game: as64 with as64/core (as before)');
  eq(has({ gameDir: AS2, game: 'as64' }), ['as64', true, true], 'view, as64');
  eq(has({ gameDir: AS2, game: 'mowas2' }), ['mowas_2', false, true], 'view, mowas2: no as64/core');
  eq(has({ gameDir: GOH, exe: 'goh' }), ['goh', false, true], 'view, goh');
  ok(fixes._layer.viewOf({ gameDir: AS2, game: 'mowas2' }) !== fixes._layer.viewOf({ gameDir: AS2 }), 'view cache: MoW:AS2 and AS64 never share a view');
  // the include check through that view: core_only.inc is missing for MoW:AS2 only
  const doc = { key: 'resource/set/x.set', text: '(include "core_only.inc")\n{a 1}\n' };
  const miss = ictx => check.check(doc, Object.assign({ maxChars: Infinity }, ictx)).filter(f => f.code === 'INCLUDE_MISSING').length;
  eq([miss({ gameDir: AS2 }), miss({ gameDir: AS2, game: 'mowas2' })], [0, 1], 'check: include of an as64/core file is missing under MoW:AS2 only');
}

// ---- nav: go to definition of an include per game (own view, cache per game)
{
  const doc = { key: 'resource/set/x.set', text: '(include "core_only.inc")\n' };
  const d = ictx => N.def(doc, { line: 1, col: 13 }, ictx).map(x => x.label);
  eq(d({ gameDir: AS2 }), ['resource/set/core_only.inc'], 'def include, no game: found in as64/core');
  eq(d({ gameDir: AS2, game: 'mowas2' }), [], 'def include, mowas2: not in the MoW:AS2 view');
  eq(d({ gameDir: AS2, game: 'as64' }), ['resource/set/core_only.inc'], 'def include, as64');
  eq(N._gameOf({ gameDir: GOH }).gk, 'goh', 'nav: a GoH folder reads the GoH tables');
  // MoW:AS2 named: its own vocab file (keylint vocab.mowas2.json) when present, as keylint --exe mowas_2 picks; AS64 and none: vocab.json
  eq([N._gameOf({ gameDir: AS2 }).gk, N._gameOf({ gameDir: AS2, game: 'as64' }).gk, N._gameOf({ gameDir: AS2, game: 'mowas2' }).gk, N._gameOf({ gameDir: AS2, exe: 'mowas_2' }).gk],
    ['as2', 'as2', 'mowas2', 'mowas2'], 'nav: gk per game');
  const vf = gk => path.basename(N._vocabFile(gk)), has = f => fs.existsSync(path.join(__dirname, '..', '..', 'keylint', f));
  eq([vf('as2'), vf('mowas2'), vf('goh')], ['vocab.json', has('vocab.mowas2.json') ? 'vocab.mowas2.json' : 'vocab.json', has('vocab.goh.json') ? 'vocab.goh.json' : 'vocab.json'],
    'nav: vocab file per game (keylint pick)');
  ok(Array.isArray(N.words('set/multiplayer/x.inc', { gameDir: AS2, game: 'mowas2' })), 'nav: MoW:AS2 words read');
  // touch after a save: the copies of both AS2 games on the shared install get stale, with or without an exe; the GoH copy not
  ok(N.touch({ gameDir: AS2, exe: 'mowas_2' }, 'resource/set/x.set') === true, 'touch: mowas2 copies marked');
  ok(N.touch({ gameDir: GOH }, 'resource/set/x.set') === false, 'touch: no GoH copy built yet, nothing of the AS2 install marked for GoH');
}

// ---- entity index child per game: --exe and the cache file for that exe; AS64 arguments as before
async function ixCases() {
  const stub = path.join(scratch, 'ixstub.js'), log = path.join(scratch, 'ixargs.log');
  const IXP = path.join(__dirname, '..', '..', 'entityindex', 'index.js');
  fs.writeFileSync(stub, [
    "// stand-in for entityindex.js: logs its arguments, writes a one-entity cache for the exe it is given",
    "const fs = require('fs'), ix = require(" + JSON.stringify(IXP) + ");",
    "const a = process.argv.slice(2), at = k => { const i = a.indexOf(k); return i < 0 ? undefined : a[i + 1]; };",
    "fs.appendFileSync(" + JSON.stringify(log) + ", JSON.stringify(a) + '\\n');",
    "const exe = at('--exe'), file = ix.cachePath(at('--cache'), exe, a[0]), name = 'tank_' + (exe || 'default');",
    "const key = 'resource/entity/' + name + '.def', used = exe || (fs.existsSync(a[0] + '/binaries/x64/call_to_arms.exe') ? 'goh' : 'as64');",
    "fs.writeFileSync(file, JSON.stringify({ meta: { version: ix.VERSION, game: a[0], folder: null, mods: [], exe: used }, entities: { [key]: { key, name, refs: [], inherits: [], layer: 'base' } }, stuff: {}, models: {} }));",
    "console.log('stub index ' + file);",
  ].join('\n'));
  N._ixTest({ script: stub });
  const doc = name => ({ key: 'resource/set/x.set', text: '{entity ' + name + '}\n' });
  const def = (name, ictx) => N.def(doc(name), { line: 1, col: 10 }, ictx).map(x => x.label);
  const A = { gameDir: AS2 }, M = { gameDir: AS2, game: 'mowas2' };
  N.warm(A); N.warm(M);
  await N._ready(A, 15000); await N._ready(M, 15000);
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const la = lines.find(l => !l.includes('--exe')), lm = lines.find(l => l.includes('--exe'));
  ok(la && la[0] === path.resolve(AS2) && la[la.length - 2] === '--cache', 'index child, no game: game folder and --cache only (as before) ' + JSON.stringify(la));
  ok(lm && lm[lm.indexOf('--exe') + 1] === 'mowas_2', 'index child, mowas2: --exe mowas_2 ' + JSON.stringify(lm));
  ok(lm && la && lm[lm.length - 1] !== la[la.length - 1], 'index child: each game its own --cache base');
  eq(def('tank_default', A), ['resource/entity/tank_default.def'], 'def entity, no game: the as64 index');
  eq(def('tank_mowas_2', M), ['resource/entity/tank_mowas_2.def'], 'def entity, mowas2: the MoW:AS2 index');
  eq(def('tank_default', M), [], 'def entity, mowas2: never the as64 index');
  const sm = N._ixTest(null, M), sa = N._ixTest(null, A);
  ok(sm && sa && sm !== sa && /\.mowas_2\.json$/.test(sm.tmp) && !/\.mowas_2\./.test(sa.tmp), 'index state per game, cache file per exe ' + (sm && sm.tmp));
  // a GoH folder with no game named: the child (no --exe) writes <base>.goh.json (entityindex keys a GoH folder goh); the IDE reads that file
  const Gq = { gameDir: GOH };
  N.warm(Gq); await N._ready(Gq, 15000);
  const sg = N._ixTest(null, Gq);
  ok(sg && /\.goh\.json$/.test(sg.tmp) && sg.from === sg.tmp, 'index, GoH folder unnamed: reads the .goh cache the child wrote ' + (sg && sg.tmp));
  eq(def('tank_default', Gq), ['resource/entity/tank_default.def'], 'def entity, GoH folder unnamed: the GoH index');
  // the entityindex tool's own cache in the shared folder: for a game folder that is not the installed game it is
  // <name>[.<exe>].f<hex>.json (entityindex cachePath(file, exe, gameDir)); the IDE finds it there before any child has run
  const IXM = require(IXP), TC = require('../../lib/toolcache'), AS2B = path.join(scratch, 'as2b');
  put(AS2B, 'as64.exe', ''); put(AS2B, 'mowas_2.exe', '');
  const pre = IXM.cachePath(path.join(TC.dir('entityindex'), 'vanilla.json'), 'mowas_2', AS2B), pk = 'resource/entity/tank_pre.def';
  ok(/\.mowas_2\.f[0-9a-f]{8}\.json$/.test(pre), 'shared cache name of a fixture game folder ' + pre);
  fs.mkdirSync(path.dirname(pre), { recursive: true });
  fs.writeFileSync(pre, JSON.stringify({ meta: { version: IXM.VERSION, game: path.resolve(AS2B), folder: null, mods: [], exe: 'mowas_2' }, entities: { [pk]: { key: pk, name: 'tank_pre', refs: [], inherits: [], layer: 'base' } }, stuff: {}, models: {} }));
  const Bm = { gameDir: AS2B, game: 'mowas2' };
  eq(def('tank_pre', Bm), [pk], 'def entity: the shared entityindex cache of that game folder and exe is read at once');
  const sb = N._ixTest(null, Bm);
  ok(sb && sb.from === pre, 'index loaded from the shared cache file ' + (sb && sb.from));
  await N._ready(Bm, 15000);
  N._ixTest({ script: null });
}

// ---- GoH hover: vocab.goh.json facts, gohweb rows, no as64 engine field row
{
  const sq = { key: 'resource/set/squads.set', text: '{squads\n\t{competitive\n\t\t{placermin 4}\n\t}\n}\n' };
  const hg = N.hover(sq, { line: 3, col: 5 }, { gameDir: GOH });
  ok(hg && hg.links.some(l => l.link === 'lim:GHKEY-02'), 'hover goh: gohweb row GHKEY-02 for placermin ' + JSON.stringify(hg && hg.links));
  const ha = N.hover(sq, { line: 3, col: 5 }, { gameDir: AS2 });
  ok(!ha || !ha.links.some(l => /^lim:GH/.test(l.link)), 'hover as64: no gohweb rows');
  if (require('fs').existsSync(require('path').join(__dirname, '..', '..', '..', 'gohweb', 'limits'))) eq(N._limRows('placermin', 'scan', 'goh').includes('GHKEY-02'), true, 'gohweb rows: live scan of gohweb/limits agrees');
  if (require('fs').existsSync(require('path').join(__dirname, '..', '..', '..', 'gohweb', 'limits'))) eq(N._limRows('placermin', 'json', 'goh'), N._limRows('placermin', 'scan', 'goh'), 'gohkeys.json = live scan');
  // engine field row (fieldtypes/fields.json, the as64 engine) only for the AS2 games
  const md = { key: 'resource/entity/x/a.def', text: '{game_entity\n\t{mass 10}\n}\n' };
  const eng = h => !!(h && h.rows.some(r => r.k === 'ide.h.r.engine'));
  const e2 = N.hover(md, { line: 2, col: 4 }, { gameDir: AS2 }), eg = N.hover(md, { line: 2, col: 4 }, { gameDir: GOH, game: 'goh' });
  ok(!eg || !eng(eg), 'hover goh: no as64 engine field row');
  ok(!!e2, 'hover as2: mass has a card');
  // words per game: the GoH vocab has kinds the AS2 one has not (and the other way round)
  const wa = N.words('set/multiplayer/x.inc', { gameDir: AS2 }), wg = N.words('set/multiplayer/x.inc', { gameDir: GOH, game: 'goh' });
  ok(JSON.stringify(wa) !== JSON.stringify(wg), 'words: GoH words differ from the AS2 ones (' + wa.length + ' / ' + wg.length + ')');
}

// ---- po.js: GoH gettext rules (GHLOC-06), lenient reading of what vanilla GoH holds
{
  const c = t => po.poCheck(t).map(f => f.code + ':' + f.line);
  eq(c('#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgctxt "a/b"\nmsgid "x"\nmsgstr ""\n'), [], 'po: header entry and a good entry');
  eq(c('msgid "x"\nmsgstr ""\n'), ['WARN_PO_NO_CTXT:1'], 'po: no msgctxt');
  eq(c('#, fuzzy\nmsgctxt "a"\nmsgid "x"\nmsgstr ""\n'), ['WARN_PO_FUZZY:2'], 'po: fuzzy entry');
  eq(c('msgctxt "a"\nmsgid "x"\nmsgstr ""\n\nmsgctxt "A"\nmsgid "y"\nmsgstr ""\n'), ['WARN_PO_DUP_CTXT:5', 'PO_CTXT_CASE:5'], 'po: same key again (first wins), upper case');
  eq(c('msgctxt "a"\nmsgid "two\nlines"\nmsgstr """"\n'), [], 'po: a string over two lines and msgstr """" read as vanilla GoH writes them');
  eq(c('msgctxt "a"\nmsgid "x"\nmsgstr ""\n; a comment line\n'), ['PO_UNREAD:4'], 'po: a ; line is only an info');
  eq(c('msgctxt "a"\nmsgid "x"\n\n'), ['WARN_PO_NO_MSGSTR:1'], 'po: no msgstr');
  ok(c('msgctxt "a"\nmsgid "x\nmsgstr ""\n').some(x => /^WARN_PO_STRING/.test(x)), 'po: an unclosed string is reported (it swallows the next quote)');
  eq(c('msgctxt "a"\nmsgid "x\n'), ['WARN_PO_STRING:2', 'WARN_PO_NO_MSGSTR:1'], 'po: a string open at the end of the file');
  eq(po.poCheck('﻿msgctxt "a"\nmsgid "x"\nmsgstr ""\n'), [], 'po: BOM skipped');
  eq([check.kindOf('a.pot'), check.kindOf('resource/interface/text/a.po'), check.kindOf('a.lng')], ['po', 'po', 'lng'], 'check kindOf: .pot and .po');
  const f = check.check({ key: 'resource/interface/text/a.pot', text: 'msgid "x"\nmsgstr ""\n' }, {});
  ok(f.length === 1 && f[0].code === 'WARN_PO_NO_CTXT' && f[0].source === 'lng' && f[0].sev === 'warn', 'check: a .pot buffer gets the po checks ' + JSON.stringify(f));
}

// ---- check: keylint gets the exe (stand-in keylint), mi findings are info under GoH
{
  const kp = require.resolve('../../keylint/keylint'), real = require.cache[kp];
  const seen = [];
  require.cache[kp] = { id: kp, filename: kp, loaded: true, exports: { lintBuffer: o => { seen.push(o); return []; } } };
  const doc = { key: 'resource/entity/x/a.def', text: '{game_entity\n}\n' };
  check.check(doc, { gameDir: AS2 }); check.check(doc, { gameDir: AS2, game: 'mowas2' }); check.check(doc, { gameDir: GOH, game: 'goh' });
  if (real) require.cache[kp] = real; else delete require.cache[kp];
  eq(seen.map(o => ['exe' in o, o.exe]), [[false, undefined], [true, 'mowas_2'], [true, 'goh']], 'check: keylint gets exe only when a game is named (AS64 call as before)');
  // two entities with the same id and MID: lintMi gives WARN_MI_ENTITY_DUP twice (a rule that needs no vocabulary)
  const mi = { key: 'resource/map/x/0.mi', text: '{Mission\n\t{Entity "a" 0x10\n\t\t{MID 1}\n\t}\n\t{Entity "b" 0x10\n\t\t{MID 1}\n\t}\n}\n' };
  const ma = check.check(mi, {}).filter(x => x.source === 'mi'), mg = check.check(mi, { gameDir: GOH, game: 'goh' }).filter(x => x.source === 'mi');
  ok(ma.length > 0 && ma.every(x => x.sev === 'warn'), 'check as64: the made-up mission gives warn findings ' + JSON.stringify(ma));
  eq(mg.map(x => x.sev + ' ' + x.code), ma.map(x => x.sev + ' ' + x.code), 'check goh: the same mission findings, same severity (GoH mi rules of milint)');
  // lintMi gets game 'goh' under GoH only (milint/mi.js GoH vocabulary); the AS2 call has no game word, as before
  const mp = require.resolve('../../milint/mi'), mreal = require.cache[mp], got = [];
  require.cache[mp] = { id: mp, filename: mp, loaded: true, exports: { lintMi: o => got.push('game' in o ? o.game : '-') } };
  check.check(mi, {}); check.check(mi, { gameDir: AS2, game: 'mowas2' }); check.check(mi, { gameDir: GOH, game: 'goh' }); check.check(mi, { gameDir: GOH });
  if (mreal) require.cache[mp] = mreal; else delete require.cache[mp];
  eq(got, ['-', '-', 'goh', 'goh'], 'check: lintMi gets game goh for GoH (named or a GoH folder), nothing for the AS2 games');
}

// ---- fixes: the parsers read keylint output made with the GoH vocabulary (made-up GoH folder: vocab.goh.json is picked)
{
  const { lintBuffer } = require('../../keylint/keylint');
  const doc = { key: 'resource/entity/x/a.def', text: '{game_entity\n\t{masss 10}\n}\n' };
  const fl = lintBuffer({ key: doc.key, text: doc.text, gameDir: GOH });
  const fx = fixes.fixes(doc, fl, { gameDir: GOH });
  ok(fl.some(f => /UNKNOWN_KEY/.test(f.code)), 'keylint goh: unknown key found ' + JSON.stringify(fl));
  ok(fx.length === 1 && fx[0].edits[0].text === 'mass', 'fixes goh: the did-you-mean fix is read from GoH keylint output ' + JSON.stringify(fx));
  eq(fixes.apply(doc.text, fx[0] ? fx[0].edits : []), '{game_entity\n\t{mass 10}\n}\n', 'fixes goh: applied');
}

// ---- kit: catalog by game id
{
  const kit = require('../kit'), W = require('../kit/words');
  const f = kit.catalog('ia-entity', 'en', { game: true }), m = kit.catalog('ia-entity', 'en', { game: 'mowas2' }), a = kit.catalog('ia-entity', 'en', { game: 'as64' });
  const g = kit.catalog('ia-entity', 'en', { game: 'goh' });
  eq([f.game, 'gameId' in f, m.game, m.gameId, g.gameId], [true, false, true, 'mowas2', 'goh'], 'kit: game flag kept (flag answer as before), game id added');
  eq([m.v, m.pieces.map(p => p.id)], [f.v, f.pieces.map(p => p.id)], 'kit: MoW:AS2 gets the AS64 pieces 1:1');
  eq(a.pieces.length, f.pieces.length, 'kit: as64 the same');
  const G = W.goh();
  ok(G && G.game === 'goh' && G.events.includes('destroy') && G.events.includes('bullet_hit_effect') && G.events.includes('pierce_effect'), 'words.goh.json: GoH reactions GHINT-15, GHINT-17');
  const hid = Object.keys(G.hidden || {});
  ok(g.v !== f.v && g.words.events.includes('destroy') && !f.words.events.includes('destroy'), 'kit goh: GoH words, own v');
  ok(hid.every(id => !g.pieces.some(p => p.id === id)) && g.hidden.length === hid.filter(id => f.pieces.some(p => p.id === id)).length, 'kit goh: hidden pieces left out and named');
  ok(g.pieces.length + g.hidden.length === f.pieces.length, 'kit goh: every other piece stays');
  // the Editor route's form: the has-game flag plus gameId (tools/gui/ext/ide/routes.js)
  const r = kit.catalog('ia-entity', 'en', { game: true, gameId: 'goh' }), r2 = kit.catalog('ia-entity', 'en', { game: true, gameId: 'mowas2' });
  eq([r.game, r.gameId, r.v, r.pieces.length, r.hidden.length], [true, 'goh', g.v, g.pieces.length, g.hidden.length], 'kit: { game:true, gameId:goh } gives the GoH catalog');
  eq([r2.gameId, r2.v], ['mowas2', f.v], 'kit: { game:true, gameId:mowas2 } gives the AS64 pieces');
  // hiddenFor over made-up files and pieces
  const pieces = [{ id: 'p1', kinds: ['ia-entity'], code: '{take_off "@x@"}' }, { id: 'p2', kinds: ['ia-entity'], code: '{add_view "a"}' },
    { id: 'p3', kinds: ['ia-entity'], code: '{never_seen}' }, { id: 'p4', kinds: ['sdl'], code: '{take_off}' }, { id: 'p5', kinds: ['ia-entity'], code: '{x}', event: '"stunned"' }];
  const ws = t => W.headWords(t);
  eq(W.hiddenFor(pieces, ws('{take_off}\n{add_view}\n{on "stunned"}{stunned}'), ws('{add_view} ; {take_off} in a comment')), { p1: ['take_off'], p5: ['stunned'] },
    'hiddenFor: only words the AS2 files have and the GoH files have not; sdl pieces and unknown words stay');
}

// ---- CLI --exe
{
  const cli = require('../intel/cli');
  eq(cli.parse(['check', 'a.def', '--exe', 'mowas_2']).exe, 'mowas_2', 'cli: --exe parsed');
  const f = put(scratch, 'm/resource/set/x.set', '{a 1}\r\n');
  const errs = [], ce = console.error; console.error = s => errs.push(String(s));
  const done = cli.run(['check', f, '--exe', 'wrong']).then(code => { console.error = ce; eq(code, 2, 'cli: an unknown --exe exits 2'); ok(/no game/.test(errs.join(' ')), 'cli: says it is no game'); });
  module.exports = done;
}

(async () => {
  try { await module.exports; } catch (e) { ok(false, 'cli run threw ' + e.message); }
  try { await ixCases(); } catch (e) { ok(false, 'index cases threw ' + (e && e.stack || e)); }
  console.log(n + ' checks, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  process.exit(fails ? 1 : 0);
})();
