// entityindex stock index keyed by the game, not the folder 1A). A made-up AS2 install INST (as64.exe
// mowas_2.exe, resource.pak + loose resource/entity, mods/m1, no as64/core; not the installed game: AS2_GAME points elsewhere) and
// two overlay game folders built as tools/check overlay() builds them (W/check-ov-A/game, W/check-ov-B/game: the install's folders
// junctioned, its root exes and paks copied, mods/m1 junctioned):
//   - realGame of each overlay is INST; the fingerprint is the same; cachePath of vanilla.json gives one file for both overlays and
//     the install: vanilla.mowas_2.<12 hex>.json
//   - the first build (overlay A) parses every file and writes meta.game = INST, meta.fp; the second (overlay B) parses no file
//   - the same build also wrote the as64 stock file (the twin: no as64/core): an as64 build on overlay B parses no file either
//   - a mods index on overlay B seeds from that fingerprint file and parses only the mod's file
//   - cleanup: the first build into the shared folder removed stock files of check-ov folders that are gone, and kept a stock file
//     of an overlay that still exists, a mods index of a gone overlay and a stock file of a gone non-overlay folder
//   usage: node overlay.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-1c927714)
const fs = require('fs'), path = require('path'), os = require('os');
const W = path.join(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eiov-')), 'ovcase');
fs.rmSync(W, { recursive: true, force: true });
const TC = path.join(W, 'tco'), INST = path.join(W, 'inst'), HOME = path.join(W, 'home');
process.env.ARSENAL_CACHE = TC; process.env.AS2_GAME = HOME; process.env.AS2_NO_STEAM = '1'; process.env.GOH_GAME = path.join(W, 'nogoh');
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const zw = require('../../lib/zipwrite');
put(HOME, 'mowas_2.exe', 'MZ'); put(HOME, 'resource/entity/home_ent.def', '{Extension "home_ent.mdl"}\r\n');
put(INST, 'as64.exe', 'MZ'); put(INST, 'mowas_2.exe', 'MZ');
const P = 4, L = 3;
fs.writeFileSync(path.join(INST, 'resource.pak'), zw.zip([...Array(P)].map((_, i) => [`entity/pak_e${i}.def`, Buffer.from(`{Extension "pak_e${i}.mdl"}\r\n`)])));
for (let i = 0; i < L; i++) put(INST, `resource/entity/loose_e${i}.def`, `{Extension "loose_e${i}.mdl"}\r\n`);
put(INST, 'mods/m1/mod.info', '{mod\r\n\t{name "m1"}\r\n\t{minGameVersion "3.260"}\r\n\t{maxGameVersion "3.262"}\r\n}\r\n');
put(INST, 'mods/m1/resource/entity/loose_e1.def', '{Extension "mod_e1.mdl"}\r\n');
// tools/check overlay(): game dirs junctioned, root .exe/.pak/.pat copied (new mtime), each mod junctioned under a real mods/
function overlay(name) {
  const ov = path.join(W, name, 'game');
  fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  for (const e of fs.readdirSync(INST, { withFileTypes: true })) {
    if (e.name === 'mods') continue;
    const p = path.join(INST, e.name);
    if (e.isDirectory()) fs.symlinkSync(p, path.join(ov, e.name), 'junction');
    else fs.copyFileSync(p, path.join(ov, e.name));
  }
  fs.symlinkSync(path.join(INST, 'mods', 'm1'), path.join(ov, 'mods', 'm1'), 'junction');
  return ov;
}
const A = overlay('check-ov-A'), B = overlay('check-ov-B');
const ix = require('../index');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const shared = n => path.join(__dirname, '..', 'cache', n);   // redirected to TC/entityindex, as every caller names it
const van = shared('vanilla.json'), EI = path.join(TC, 'entityindex');

// old stock files for the cleanup: two of gone overlays (removed), one of a live overlay, a mods index of a gone overlay and a
// stock file of a gone plain folder (all three kept)
fs.mkdirSync(EI, { recursive: true });
const fake = (nm, game) => { const f = path.join(EI, nm); fs.writeFileSync(f, JSON.stringify({ meta: { version: ix.VERSION, game, folder: null, mods: [], exe: 'mowas_2' }, files: [], aux: {}, entities: {}, stuff: {}, models: {} })); return f; };
const gone1 = fake('vanilla.mowas_2.f11111111.json', path.join(W, 'check-ov-gone1', 'game'));
const gone2 = fake('vanilla.f22222222.json', path.join(W, 'check-ov-gone2', 'game'));
const live = fake('vanilla.mowas_2.f33333333.json', A);
const modsGone = fake('mods-4444.f44444444.json', path.join(W, 'check-ov-gone3', 'game'));
const plainGone = fake('vanilla.mowas_2.f55555555.json', path.join(W, 'gone-plain', 'game'));
if ((ix.metaHead(gone1) || {}).game !== path.join(W, 'check-ov-gone1', 'game')) fail('metaHead reads meta.game: ' + JSON.stringify(ix.metaHead(gone1)));

// the overlay maps to its install; one key for all three
if (!same(ix.realGame(A), INST) || !same(ix.realGame(B), INST)) fail('realGame of an overlay is the install: ' + ix.realGame(A) + ' ' + ix.realGame(B));
if (!same(ix.realGame(INST), INST) || !same(ix.realGame(HOME), HOME)) fail('realGame of a plain folder is itself');
const fp = ix.gameFp(INST, 'mowas_2');
if (!fp || ix.gameFp(ix.realGame(A), 'mowas_2') !== fp) fail('fingerprint of the install: ' + fp);
if (ix.gameFp(HOME, 'mowas_2') !== null) fail('a folder with no pak has no fingerprint');
const vA = ix.cachePath(van, 'mowas_2', A), vB = ix.cachePath(van, 'mowas_2', B), vI = ix.cachePath(van, 'mowas_2', INST);
if (vA !== vB || vA !== vI || path.basename(vA) !== 'vanilla.mowas_2.' + fp.slice(0, 12) + '.json') fail('one stock file for both overlays and the install: ' + [vA, vB, vI].join(' | '));
if (path.basename(ix.cachePath(van, 'as64', A)) !== 'vanilla.' + ix.gameFp(INST, 'as64').slice(0, 12) + '.json') fail('as64 stock name: ' + ix.cachePath(van, 'as64', A));
if (ix.cachePath(shared('mods-9.json'), 'mowas_2', A) === ix.cachePath(shared('mods-9.json'), 'mowas_2', B)) fail('a mods index keeps its folder key');

// first build on overlay A: cold, meta.game = the install, the as64 twin written; the cleanup ran first
const b1 = ix.build({ gameDir: A, exe: 'mowas_2', cache: van });
if (b1.stats.parsed !== P + L || b1.stats.reused !== 0 || b1.stats.entities !== P + L) fail('first build parses every file: ' + JSON.stringify(b1.stats));
const m1 = ix.metaHead(vA) || {};
if (!same(m1.game || '', INST) || m1.fp !== fp || m1.exe !== 'mowas_2') fail('stock meta: game = the install, fp: ' + JSON.stringify(m1));
const v64 = ix.cachePath(van, 'as64', A);
if (b1.stats.twin !== v64 || (ix.metaHead(v64) || {}).exe !== 'as64' || (ix.metaHead(v64) || {}).partial) fail('the as64 twin is written whole: ' + JSON.stringify(b1.stats) + ' ' + JSON.stringify(ix.metaHead(v64)));
if (fs.existsSync(gone1) || fs.existsSync(gone2)) fail('stock files of gone overlays are removed');
if (!fs.existsSync(live) || !fs.existsSync(modsGone) || !fs.existsSync(plainGone)) fail('the cleanup keeps a live overlay, mods indexes and non-overlay folders');

// second build on overlay B: nothing parsed; as64 on B: nothing parsed (the twin)
const b2 = ix.build({ gameDir: B, exe: 'mowas_2', cache: van });
if (b2.stats.parsed !== 0 || b2.stats.reused !== P + L) fail('second overlay reuses the stock index: ' + JSON.stringify(b2.stats));
const b3 = ix.build({ gameDir: B, exe: 'as64', cache: van });
if (b3.stats.parsed !== 0 || b3.stats.reused !== P + L) fail('as64 on the second overlay reuses the twin: ' + JSON.stringify(b3.stats));
if (!ix.load(van, 'mowas_2', B).byName('pak_e2').length || !ix.load(van, 'as64', A).byName('loose_e0').length) fail('load through an overlay');
// the same install through its own folder: the same file, nothing parsed
const b4 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (b4.stats.parsed !== 0) fail('the install itself reuses the overlay-built stock index: ' + JSON.stringify(b4.stats));

// a mods index on overlay B seeds from the fingerprint file
const mc = shared('mods-5678.json');
const s1 = ix.build({ gameDir: B, exe: 'mowas_2', mods: ['m1'], cache: mc });
if (!s1.stats.seeded || !same(s1.stats.seeded, vA) || s1.stats.parsed !== 1) fail('mods index on an overlay seeds from the stock file: ' + JSON.stringify(s1.stats));
const e1 = s1.idx.byName('loose_e1')[0];
if (!e1 || e1.source !== 'mod' || !/mod_e1/.test(JSON.stringify(e1.refs))) fail('the mod file wins: ' + JSON.stringify(e1));
const s0 = ix.build({ gameDir: B, exe: 'mowas_2', mods: ['m1'], cache: shared('mods-cold.json'), seed: false });
const view = r => JSON.stringify(Object.values(r.idx.entities).map(e => [e.key, e.layer, e.source, e.model, e.refs]).sort());
if (view(s0) !== view(s1)) fail('a seeded overlay mods index answers the same as a cold one');

// an as64/core file the index reads: the twin of an as64 build leaves those records out and is a checkpoint (meta.partial)
put(INST, 'as64/core/resource/entity/loose_e2.def', '{Extension "core_e2.mdl"}\r\n');
for (const ov of [A, B]) fs.symlinkSync(path.join(INST, 'as64'), path.join(ov, 'as64'), 'junction');
fs.rmSync(vA); fs.rmSync(v64);
const c1 = ix.build({ gameDir: A, exe: 'as64', cache: van, force: true });
const tw = fs.existsSync(vA) ? JSON.parse(fs.readFileSync(vA, 'utf8')) : null;
if (!c1.stats.twin || !tw || !tw.meta.partial || tw.meta.exe !== 'mowas_2' || tw.entities['resource/entity/loose_e2.def'] || Object.keys(tw.entities).length !== P + L - 1) fail('as64/core twin is partial without the core record: ' + JSON.stringify(c1.stats) + ' ' + (tw ? JSON.stringify(tw.meta) + ' ' + Object.keys(tw.entities).length : 'none'));
let msg = ''; try { ix.load(van, 'mowas_2', A); } catch (e) { msg = e.message; }
if (!/did not finish/.test(msg)) fail('load refuses a partial twin: ' + (msg || 'no throw'));
const c2 = ix.build({ gameDir: B, exe: 'mowas_2', cache: van });
if (c2.stats.parsed !== 1 || c2.stats.reused !== P + L - 1 || /core_e2/.test(JSON.stringify(c2.idx.byName('loose_e2')))) fail('mowas_2 build finishes the partial twin: ' + JSON.stringify(c2.stats));
console.log(bad ? `overlay: ${bad} failed` : 'overlay ok');
process.exit(bad ? 1 : 0);
