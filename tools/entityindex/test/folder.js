// entityindex folder case: a cache is tied to the game folder it was built from.
//   Seeded: the shared cache folder (ARSENAL_CACHE=<work>/tc) holds vanilla.json built for a made-up "fixture" game with 0 entities
//   (as a fixture test once left it). The installed game (AS2_GAME=<work>/home, no Steam) must not reuse it: build rebuilds cold and
//   writes over it, load without gameDir refuses it. A build for another folder in the shared folder gets its own .f<hash> file and
//   leaves the installed game's vanilla.json as it is. Outside the shared folder the given cache name stays (caller's file), and a
//   build for another folder there still never reuses the first folder's records.
//   A no-exe build over a made-up GoH install (GOH_GAME) writes <cache>.goh.json, never the plain name, and load of the shared plain
//   name with no exe refuses a cache built for GoH.
//   usage: node folder.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-9c8b8456)
const fs = require('fs'), path = require('path'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eifold-'));
const TC = path.join(W, 'tc'), HOME = path.join(W, 'home'), FX = path.join(W, 'fixture'), OTHER = path.join(W, 'other');
process.env.ARSENAL_CACHE = TC; process.env.AS2_GAME = HOME; process.env.AS2_NO_STEAM = '1'; const GOH = path.join(W, 'gohhome'); process.env.GOH_GAME = GOH;
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
for (const g of [HOME, FX, OTHER, GOH]) fs.rmSync(g, { recursive: true, force: true });
put(GOH, 'binaries/x64/call_to_arms.exe', 'MZ'); put(GOH, 'resource/entity/goh_ent.def', '{game_entity}\r\n');   // made-up GoH install
fs.rmSync(TC, { recursive: true, force: true });
put(HOME, 'mowas_2.exe', 'MZ'); put(HOME, 'resource/entity/home_ent.def', '{Extension "home_ent.mdl"}\r\n');
put(FX, 'mowas_2.exe', 'MZ'); fs.mkdirSync(path.join(FX, 'resource'), { recursive: true });           // 0 entities
put(OTHER, 'mowas_2.exe', 'MZ'); put(OTHER, 'resource/entity/other_ent.def', '{Extension "other_ent.mdl"}\r\n');
const ix = require('../index');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const shared = path.join(__dirname, '..', 'cache', 'vanilla.json');   // the default every caller names; redirected to TC/entityindex
const plain = path.join(TC, 'entityindex', 'vanilla.json');
if (ix.cachePath(shared) !== plain) fail('shared default should redirect to ' + plain + ', got ' + ix.cachePath(shared));
if (ix.cachePath(shared, undefined, HOME) !== plain) fail('installed game keeps the plain name: ' + ix.cachePath(shared, undefined, HOME));
const fxFile = ix.cachePath(shared, undefined, FX);
if (fxFile === plain || !/vanilla\.f[0-9a-f]{8}\.json$/.test(fxFile)) fail('another folder gets its own file: ' + fxFile);
if (ix.cachePath(shared, 'mowas_2', FX) !== fxFile.replace(/vanilla\.f/, 'vanilla.mowas_2.f')) fail('exe and folder parts: ' + ix.cachePath(shared, 'mowas_2', FX));
// seed: the fixture cache sits under the plain name (the old bug), meta.game = the fixture folder, 0 entities
fs.mkdirSync(path.dirname(plain), { recursive: true });
ix.build({ folder: undefined, gameDir: FX, cache: path.join(W, 'seed.json') });
fs.copyFileSync(path.join(W, 'seed.json'), plain);
const seeded = JSON.parse(fs.readFileSync(plain, 'utf8'));
if (path.resolve(seeded.meta.game) !== path.resolve(FX) || Object.keys(seeded.entities).length) fail('seed is not the 0-entity fixture cache');
// load without gameDir: refused (built for another folder than the installed game)
let msg = '';
try { ix.load(shared); } catch (e) { msg = e.message; }
if (!/built for the game folder/.test(msg)) fail('load of a cache built for another folder must throw: ' + (msg || 'no throw'));
// load with the fixture folder named: the fixture's own file (none yet) -> throws bad cache
try { ix.load(shared, undefined, HOME); fail('load(home) must refuse the fixture cache'); } catch (e) { if (!/game folder/.test(e.message)) fail('load(home) reason: ' + e.message); }
// build for the installed game: cold rebuild, writes over the seeded file with its own entities
const h = ix.build({ gameDir: HOME, cache: shared });
if (!h.idx.byName('home_ent').length) fail('installed game index must see home_ent');
if (h.stats.reused !== 0) fail('records of another folder must not be reused: reused ' + h.stats.reused);
const after = JSON.parse(fs.readFileSync(plain, 'utf8'));
if (path.resolve(after.meta.game) !== path.resolve(HOME)) fail('plain cache now holds the installed game: ' + after.meta.game);
if (!ix.load(shared).byName('home_ent').length) fail('load without gameDir after the rebuild');
// a fixture build now goes to its own file and leaves the installed game's cache alone
const before = fs.readFileSync(plain);
const f = ix.build({ gameDir: FX, cache: shared });
if (f.stats.entities !== 0) fail('fixture has 0 entities');
if (!fs.existsSync(fxFile)) fail('fixture cache file not written: ' + fxFile);
if (!fs.readFileSync(plain).equals(before)) fail('a fixture build must not touch the installed game cache');
if (!ix.load(shared, undefined, FX).meta.game) fail('load(fixture) gives the fixture cache');
// outside the shared folder: the caller's name is kept, but another folder's records are never reused
const own = path.join(W, 'own.json');
ix.build({ gameDir: OTHER, cache: own });
if (ix.cachePath(own, undefined, HOME) !== own) fail('a cache outside the shared folder keeps its name');
const o2 = ix.build({ gameDir: HOME, cache: own });
if (o2.stats.reused !== 0 || o2.idx.byName('other_ent').length || !o2.idx.byName('home_ent').length) fail('own cache: another folder reused ' + JSON.stringify(o2.stats));
try { ix.load(own, undefined, OTHER); fail('load(own, OTHER) must refuse a cache now built for HOME'); } catch (e) { if (!/game folder/.test(e.message)) fail('own load reason: ' + e.message); }
const o3 = ix.build({ gameDir: HOME, cache: own });
if (o3.stats.parsed !== 0) fail('same folder warm build should parse nothing: ' + JSON.stringify(o3.stats));
// GoH install with no exe named: keyed goh (the same file as --exe goh), never the plain name of the AS2 install
const gohFile = ix.cachePath(shared, 'goh');
if (ix.cachePath(shared, undefined, GOH) !== gohFile) fail('no-exe GoH folder gets the goh name: ' + ix.cachePath(shared, undefined, GOH));
const plainBefore = fs.readFileSync(plain);
const g = ix.build({ gameDir: GOH, cache: shared });
if (!g.idx.byName('goh_ent').length || g.idx.meta.exe !== 'goh') fail('no-exe GoH build: ' + JSON.stringify(g.idx.meta));
if (!fs.existsSync(gohFile)) fail('no-exe GoH build must write ' + gohFile);
if (!fs.readFileSync(plain).equals(plainBefore)) fail('a no-exe GoH build must not touch the plain name');
if (!ix.load(shared, 'goh').byName('goh_ent').length) fail('load(shared, goh) gives the GoH cache');
// a plain cache seeded with a GoH build (the old state): load with no exe and no gameDir refuses it. The copy gets meta.game = the
// installed AS2 game, so the game-folder check passes and only the meta.exe check (built for exe goh) can refuse it
const gohCopy = JSON.parse(fs.readFileSync(gohFile, 'utf8'));
gohCopy.meta.game = path.resolve(HOME);
fs.writeFileSync(plain, JSON.stringify(gohCopy));
msg = '';
try { ix.load(shared); } catch (e) { msg = e.message; }
if (!/built for exe goh, not the AS2 install/.test(msg)) fail('load(shared) must refuse a plain cache built for GoH by its meta.exe: ' + (msg || 'no throw'));
// the same without meta.game (an old no-exe GoH build had it, a hand copy may not): still refused by meta.exe
delete gohCopy.meta.game; fs.writeFileSync(plain, JSON.stringify(gohCopy));
msg = '';
try { ix.load(shared); } catch (e) { msg = e.message; }
if (!/built for exe goh, not the AS2 install/.test(msg)) fail('load(shared) refuses a GoH plain cache with no meta.game: ' + (msg || 'no throw'));
// a build with no gameDir and no folder makes an empty index: it never writes the shared plain name, and load with no exe refuses an
// empty sourceless cache there (meta.exe, meta.game and meta.folder all null)
ix.build({ gameDir: HOME, cache: shared, force: true });
const homeBytes = fs.readFileSync(plain);
const e0 = ix.build({ cache: shared });
if (e0.stats.entities !== 0) fail('sourceless build has no entities: ' + JSON.stringify(e0.stats));
if (!fs.readFileSync(plain).equals(homeBytes)) fail('a sourceless build must not write the shared plain name');
const empty = JSON.parse(fs.readFileSync(plain, 'utf8')); empty.meta.exe = null; empty.meta.game = null; empty.meta.folder = null; empty.entities = {};
fs.writeFileSync(plain, JSON.stringify(empty));
msg = '';
try { ix.load(shared); } catch (e) { msg = e.message; }
if (!/built with no game folder and no folder/.test(msg)) fail('load(shared) must refuse a sourceless plain cache: ' + (msg || 'no throw'));
fs.writeFileSync(plain, homeBytes);
if (!ix.load(shared).byName('home_ent').length) fail('the installed game cache loads again');
console.log(bad ? `folder: ${bad} failed` : 'folder ok');
process.exit(bad ? 1 : 0);
