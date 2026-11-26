// entityindex checkpoint and seed case (made-up installs, shared cache folder ARSENAL_CACHE=<work>/tcs):
//   checkpoint: a cold build that stops after its first checkpoint leaves a meta.partial cache; load() refuses it; the next build
//     reuses its records and parses only the rest, and its finished cache is no longer partial. A warm build that parses nothing
//     writes no checkpoint. checkpointEvery 0 writes none.
//   seed: a folder index (GoH, exe goh, game + --folder as the Units page reads it) and a mods index (AS2, exe as64 and exe mowas_2)
//     with no cache of their own start from vanilla.<exe>.json of the same exe and game folder: only the files the folder or mod
//     replaces are parsed again, the answer is the same as a cold build without a seed (seed: false), and an exe seeds only from
//     its own exe's vanilla file (here the twin the as64 stock build wrote: no as64/core in this install).
//   usage: node seed.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-9812e7cd)
const fs = require('fs'), path = require('path'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eiseed-'));
const TC = path.join(W, 'tcs'), AS2 = path.join(W, 'as2home'), GOH = path.join(W, 'gohhome2'), FOLD = path.join(W, 'gohfolder');
process.env.ARSENAL_CACHE = TC; process.env.AS2_GAME = AS2; process.env.AS2_NO_STEAM = '1'; process.env.GOH_GAME = GOH;
for (const d of [TC, AS2, GOH, FOLD]) fs.rmSync(d, { recursive: true, force: true });
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const N = 9;
put(GOH, 'binaries/x64/call_to_arms.exe', 'MZ');
for (let i = 0; i < N; i++) put(GOH, `resource/entity/goh_e${i}.def`, `{Extension "goh_e${i}.mdl"}\r\n`);
put(FOLD, 'resource/entity/goh_e3.def', '{Extension "folder_e3.mdl"}\r\n');
put(AS2, 'as64.exe', 'MZ'); put(AS2, 'mowas_2.exe', 'MZ');
for (let i = 0; i < N; i++) put(AS2, `resource/entity/as2_e${i}.def`, `{Extension "as2_e${i}.mdl"}\r\n`);
put(AS2, 'mods/m1/mod.info', '{mod\r\n\t{name "m1"}\r\n\t{minGameVersion "3.260"}\r\n\t{maxGameVersion "3.262"}\r\n}\r\n');
put(AS2, 'mods/m1/resource/entity/as2_e5.def', '{Extension "mod_e5.mdl"}\r\n');
const ix = require('../index');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const shared = n => path.join(__dirname, '..', 'cache', n);   // redirected to TC/entityindex, as every caller names it
const view = r => JSON.stringify(Object.values(r.idx.entities).map(e => [e.key, e.layer, e.source, e.model, e.refs]).sort());

// ---- checkpoint (GoH, exe goh)
const van = shared('vanilla.json'), vgoh = ix.cachePath(van, 'goh');
if (path.basename(vgoh) !== 'vanilla.goh.json') fail('GoH vanilla cache name: ' + vgoh);
let msg = '';
try { ix.build({ gameDir: GOH, exe: 'goh', cache: van, checkpointEvery: 3, checkpointMs: 0, onCheckpoint: () => { throw new Error('stopped'); } }); } catch (e) { msg = e.message; }
if (msg !== 'stopped') fail('the stopped build should stop at its first checkpoint: ' + (msg || 'no stop'));
const cp = fs.existsSync(vgoh) ? JSON.parse(fs.readFileSync(vgoh, 'utf8')) : null;
if (!cp || !cp.meta.partial || Object.keys(cp.entities).length !== 3) fail('checkpoint: partial cache with 3 entities: ' + (cp ? JSON.stringify(cp.meta) + ' ' + Object.keys(cp.entities).length : 'no file'));
if (fs.readdirSync(path.dirname(vgoh)).some(f => f.endsWith('.part'))) fail('no .part file left beside the cache');
msg = ''; try { ix.load(van, 'goh'); } catch (e) { msg = e.message; }
if (!/did not finish/.test(msg)) fail('load refuses a checkpoint: ' + (msg || 'no throw'));
const g2 = ix.build({ gameDir: GOH, exe: 'goh', cache: van, checkpointEvery: 0 });
if (g2.stats.reused !== 3 || g2.stats.parsed !== N - 3 || g2.stats.checkpoints !== 0) fail('resume after a checkpoint: ' + JSON.stringify(g2.stats));
const fin = JSON.parse(fs.readFileSync(vgoh, 'utf8'));
if (fin.meta.partial || Object.keys(fin.entities).length !== N) fail('finished cache is whole and not partial: ' + JSON.stringify(fin.meta));
if (ix.load(van, 'goh').byName('goh_e8').length !== 1) fail('load after the finished build');
const g3 = ix.build({ gameDir: GOH, exe: 'goh', cache: van, checkpointEvery: 1, checkpointMs: 0 });
if (g3.stats.parsed !== 0 || g3.stats.checkpoints !== 0) fail('warm build: nothing parsed, no checkpoint: ' + JSON.stringify(g3.stats));
// a resumed build whose checkpoint is complete (all records reused) still writes the cache whole (drops meta.partial)
try { ix.build({ gameDir: GOH, exe: 'goh', cache: van, force: true, checkpointEvery: N, checkpointMs: 0, onCheckpoint: () => { throw new Error('stopped'); } }); } catch (e) {}
const g4 = ix.build({ gameDir: GOH, exe: 'goh', cache: van });
if (g4.stats.parsed !== 0 || JSON.parse(fs.readFileSync(vgoh, 'utf8')).meta.partial) fail('a full checkpoint is written whole on the next build: ' + JSON.stringify(g4.stats));

// ---- seed: GoH folder index from vanilla.goh.json
const fc = shared('folder-0123abcd.json');
const f1 = ix.build({ gameDir: GOH, exe: 'goh', folder: FOLD, cache: fc });
if (!f1.stats.seeded || path.basename(f1.stats.seeded) !== 'vanilla.goh.json') fail('GoH folder index seeded from vanilla.goh.json: ' + f1.stats.seeded);
if (f1.stats.parsed !== 1 || f1.stats.reused !== N - 1) fail('GoH folder index parses only the replaced file: ' + JSON.stringify(f1.stats));
const e3 = f1.idx.byName('goh_e3')[0];
if (!e3 || e3.layer !== 'folder' || e3.source !== 'mod' || !/folder_e3/.test(JSON.stringify(e3.refs))) fail('folder file wins: ' + JSON.stringify(e3));
const f0 = ix.build({ gameDir: GOH, exe: 'goh', folder: FOLD, cache: shared('folder-noseed.json'), seed: false });
if (f0.stats.seeded || f0.stats.reused !== 0) fail('seed: false builds cold: ' + JSON.stringify(f0.stats));
if (view(f0) !== view(f1)) fail('a seeded GoH index answers the same as a cold one');
const f2 = ix.build({ gameDir: GOH, exe: 'goh', folder: FOLD, cache: fc });
if (f2.stats.seeded || f2.stats.parsed !== 0) fail('second folder build uses its own cache: ' + JSON.stringify(f2.stats));

// ---- seed: AS2 mods index, as64 and mowas_2, each from its own exe's vanilla cache
const a = ix.build({ gameDir: AS2, exe: 'as64', cache: van });
if (a.stats.entities !== N || ix.cachePath(van, 'as64') !== ix.cachePath(van)) fail('as64 vanilla: ' + JSON.stringify(a.stats));
const mc = shared('mods-11112222.json');
const m64 = ix.build({ gameDir: AS2, exe: 'as64', mods: ['m1'], cache: mc });
if (!m64.stats.seeded || path.basename(m64.stats.seeded) !== 'vanilla.json' || m64.stats.parsed !== 1) fail('as64 mods index seeded from vanilla.json: ' + JSON.stringify(m64.stats));
const mod5 = m64.idx.byName('as2_e5')[0];
if (!mod5 || mod5.source !== 'mod' || !/mod_e5/.test(JSON.stringify(mod5.refs))) fail('as64: the mod file wins: ' + JSON.stringify(mod5));
// no as64/core here: the as64 stock build also wrote vanilla.mowas_2.json (meta.exe mowas_2, the twin); a mowas_2 mods index seeds
// from that file (never from the as64 vanilla.json itself) and answers as a cold build does
const twin = ix.cachePath(van, 'mowas_2');
if (!a.stats.twin || a.stats.twin !== twin || JSON.parse(fs.readFileSync(twin, 'utf8')).meta.exe !== 'mowas_2') fail('as64 stock build writes the mowas_2 twin: ' + JSON.stringify(a.stats));
const mw0 = ix.build({ gameDir: AS2, exe: 'mowas_2', mods: ['m1'], cache: mc });
if (!mw0.stats.seeded || path.basename(mw0.stats.seeded) !== 'vanilla.mowas_2.json' || mw0.stats.parsed !== 1) fail('mowas_2 seeds from its own (twin) stock file: ' + JSON.stringify(mw0.stats));
const mwc = ix.build({ gameDir: AS2, exe: 'mowas_2', mods: ['m1'], cache: shared('mods-cold.json'), seed: false });
if (view(mwc) !== view(mw0)) fail('a mowas_2 index seeded from the twin answers the same as a cold one');
fs.rmSync(ix.cachePath(mc, 'mowas_2')); fs.rmSync(twin);
ix.build({ gameDir: AS2, exe: 'mowas_2', cache: van });
const mw = ix.build({ gameDir: AS2, exe: 'mowas_2', mods: ['m1'], cache: mc });
if (!mw.stats.seeded || path.basename(mw.stats.seeded) !== 'vanilla.mowas_2.json' || mw.stats.parsed !== 1) fail('mowas_2 mods index seeded from vanilla.mowas_2.json: ' + JSON.stringify(mw.stats));
if (view(mw) !== view(mw0)) fail('a seeded mowas_2 index answers the same as a cold one');
// outside the shared folder there is no seed (the caller's own file)
const own = ix.build({ gameDir: AS2, exe: 'as64', mods: ['m1'], cache: path.join(W, 'own-mods.json') });
if (own.stats.seeded) fail('no seed outside the shared folder');
console.log(bad ? `seed: ${bad} failed` : 'seed ok');
process.exit(bad ? 1 : 0);
