// entityindex byte memo case (made-up game folder + loose mod folder): a file that many files include is read once per build;
//   the index is the same, byte for byte (but meta.built), as a build without the memo (byteMemo: false = the old reads);
//   nothing is kept after build returns: a file changed after the build is read from the disk again, and the next build sees it.
//   usage: node memo.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-2b2676e4)
const fs = require('fs'), path = require('path'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eimemo-'));
const GAME = path.join(W, 'memogame'), FOLD = path.join(W, 'memofolder'), TC = path.join(W, 'tcm');
process.env.ARSENAL_CACHE = TC; process.env.AS2_NO_STEAM = '1';
for (const d of [GAME, FOLD, TC]) fs.rmSync(d, { recursive: true, force: true });
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); return p; };
const N = 12;
put(GAME, 'mowas_2.exe', 'MZ');
put(GAME, 'resource/properties/shared.ext', '{boarder {anm "d" {forward {begin "anm_game"}}}}\r\n');
for (let i = 0; i < N; i++) put(GAME, `resource/entity/g${i}.def`, `{game_entity\r\n\t(include "/properties/shared.ext")\r\n\t{Extension "g${i}.mdl"}\r\n}\r\n`);
// the folder: its own include used by every one of its files, and files that include the game's one
const INC = put(FOLD, 'resource/properties/mine.ext', '{boarder {anm "d" {forward {begin "anm_mine"}}}}\r\n');
for (let i = 0; i < N; i++) put(FOLD, `resource/entity/m${i}.def`, `{game_entity\r\n\t(include "/properties/mine.ext")\r\n\t(include "/properties/shared.ext")\r\n\t{Extension "m${i}.mdl"}\r\n}\r\n`);
put(FOLD, 'resource/set/stuff/gun/.presets', '{presetblock {tag "p"}}\r\n');
for (let i = 0; i < 4; i++) put(FOLD, `resource/set/stuff/gun/w${i}`, '(include "/properties/mine.ext")\r\n{from "pattern base" {entity "m0"}}\r\n');

const ix = require('../index');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
// reads of one loose file, counted at fs.readFileSync (the folder's files are read that way)
const reads = new Map(), rf = fs.readFileSync;
fs.readFileSync = function (p) { if (typeof p === 'string') { const k = path.resolve(p).toLowerCase(); reads.set(k, (reads.get(k) || 0) + 1); } return rf.apply(fs, arguments); };
const count = p => reads.get(path.resolve(p).toLowerCase()) || 0;
const text = c => { const d = JSON.parse(rf(c, 'utf8')); d.meta.built = ''; return JSON.stringify(d); };

const cOld = path.join(W, 'memo-old.json'), cNew = path.join(W, 'memo-new.json');
reads.clear();
const a = ix.build({ gameDir: GAME, folder: FOLD, cache: cOld, byteMemo: false });
const nOld = count(INC);
reads.clear();
const b = ix.build({ gameDir: GAME, folder: FOLD, cache: cNew });
const nNew = count(INC);
if (a.stats.parsed !== b.stats.parsed || a.stats.entities !== 2 * N) fail('both builds parse the same files: ' + JSON.stringify([a.stats, b.stats]));
if (nOld < N) fail('without the memo the include is read for every file that names it: ' + nOld);
if (nNew !== 1) fail('with the memo the include is read once per build: ' + nNew);
if (text(cOld) !== text(cNew)) fail('the cache file differs between memo and no memo');
if (JSON.stringify(b.idx.entities) !== JSON.stringify(a.idx.entities) || JSON.stringify(b.idx.stuff) !== JSON.stringify(a.idx.stuff)) fail('the index object differs');
if (b.src.bytes !== null || a.src.bytes !== null) fail('nothing is kept after build returns');
// after the build: the returned source reads the disk (a changed file is seen), every time
reads.clear();
fs.writeFileSync(INC, '{boarder {anm "d" {forward {begin "anm_changed"}}}}\r\n');
const now = b.src.get('resource/properties/mine.ext'); b.src.get('resource/properties/mine.ext');
if (!/anm_changed/.test(String(now)) || count(INC) !== 2) fail('a read after the build asks the disk: ' + count(INC) + ' ' + String(now).slice(0, 40));
// a build that throws leaves nothing kept either
const src2 = ix.openSource({ gameDir: GAME, folder: FOLD });
if (src2.bytes !== null) fail('openSource alone keeps nothing');
// the next build sees the change (the files that include it are parsed again, from the disk)
const future = new Date(Date.now() + 5000); fs.utimesSync(INC, future, future);
const c = ix.build({ gameDir: GAME, folder: FOLD, cache: cNew });
const m0 = c.idx.byName('m0')[0];
if (c.stats.parsed !== N + 4 || !m0 || !/anm_changed/.test(JSON.stringify(m0.refs))) fail('the next build reads the changed include: ' + JSON.stringify(c.stats));
const d = ix.build({ gameDir: GAME, folder: FOLD, cache: cOld, byteMemo: false });
if (text(cOld) !== text(cNew) || d.stats.parsed !== N + 4) fail('after the change: memo and no memo still give the same cache');
fs.readFileSync = rf;
if (bad) { console.log('memo.js FAIL ' + bad); process.exit(1); }
console.log('memo.js ok');
