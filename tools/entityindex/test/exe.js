// entityindex exe case: made-up AS2-style install with as64.exe and an as64/core layer holding one entity.
//   the as64 view sees the core entity, the mowas_2 view (and alias mowas2) does not; one cache per exe; load(file, exe) picks it.
//   usage: node exe.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-c5dd5ac8)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ix = require('../index');
const W = process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'eiexe-'));
const G = path.join(W, 'exegame');
const put = (k, t) => { const p = path.join(G, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
fs.rmSync(G, { recursive: true, force: true });
put('as64.exe', 'MZ');
put('resource/entity/base_ent.def', '{Extension "base_ent.mdl"}\r\n');
put('as64/core/resource/entity/core_ent.def', '{Extension "core_ent.mdl"}\r\n');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const cache = path.join(W, 'exe.cache.json');

const a = ix.build({ gameDir: G, exe: 'as64', cache });
const m = ix.build({ gameDir: G, exe: 'mowas_2', cache });
const d = ix.build({ gameDir: G, cache });   // no exe: vfs default (as64.exe present -> as64), today's cache name
if (!a.idx.byName('core_ent').length) fail('as64 index must see the as64/core entity');
if (!a.idx.byName('base_ent').length) fail('as64 index must see the base entity');
if (m.idx.byName('core_ent').length) fail('mowas_2 index must not see the as64/core entity');
if (!m.idx.byName('base_ent').length) fail('mowas_2 index must see the base entity');
if (!d.idx.byName('core_ent').length) fail('default index (as64.exe present) must see the core entity');
if (a.idx.meta.exe !== 'as64' || m.idx.meta.exe !== 'mowas_2' || d.idx.meta.exe !== 'as64') fail('meta.exe ' + [a.idx.meta.exe, m.idx.meta.exe, d.idx.meta.exe]);
// cache files: as64 / none keep the given name, mowas_2 gets its own
if (ix.cachePath(cache) !== cache || ix.cachePath(cache, 'as64') !== cache) fail('as64 / no exe cache name changed');
const mc = path.join(W, 'exe.cache.mowas_2.json');
if (ix.cachePath(cache, 'mowas2') !== mc || ix.cachePath(cache, 'mowas_2') !== mc) fail('mowas_2 cache name ' + ix.cachePath(cache, 'mowas2'));
if (!fs.existsSync(cache) || !fs.existsSync(mc)) fail('both caches written');
if (!ix.load(cache, 'as64').byName('core_ent').length) fail('load as64 cache');
if (ix.load(cache, 'mowas2').byName('core_ent').length) fail('load mowas2 must read the mowas_2 cache');
// warm rebuild of each exe reuses its own cache, never the other's
const m2 = ix.build({ gameDir: G, exe: 'mowas2', cache });
if (m2.stats.parsed !== 0 || m2.idx.byName('core_ent').length) fail('warm mowas2 build: ' + JSON.stringify(m2.stats));
// a cache file holding another exe's index is not reused and load refuses it
fs.copyFileSync(cache, mc);
const m3 = ix.build({ gameDir: G, exe: 'mowas_2', cache });
if (m3.stats.reused !== 0 || m3.idx.byName('core_ent').length) fail('as64 data in the mowas_2 cache file must not be reused: ' + JSON.stringify(m3.stats));
fs.copyFileSync(cache, mc);
let threw = false; try { ix.load(cache, 'mowas_2'); } catch (e) { threw = /built for exe as64/.test(e.message); }
if (!threw) fail('load must refuse a cache built for another exe');
// unknown exe
threw = false; try { ix.build({ gameDir: G, exe: 'nope' }); } catch (e) { threw = e.code === 'BAD_EXE'; }
if (!threw) fail('unknown exe must throw BAD_EXE');
// CLI: --exe in the summary line, own cache file, bad exe exit 2
const cli = args => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'entityindex.js'), ...args], { encoding: 'utf8' });
const c1 = cli([G, '--exe', 'mowas2', '--cache', path.join(W, 'cli.json'), 'core_ent']);
if (c1.status !== 0 || !/^exe mowas_2: \d+ entities/.test(c1.stdout) || !c1.stdout.includes('cli.mowas_2.json') || !/core_ent: no such entity/.test(c1.stdout)) fail('cli mowas2: ' + c1.stdout + c1.stderr);
const c2 = cli([G, '--cache', path.join(W, 'cli.json'), 'core_ent']);
if (c2.status !== 0 || !/^exe as64: /.test(c2.stdout) || !/-> .*cli\.json/.test(c2.stdout) || !/resource\/entity\/core_ent\.def \[mod\/as64\/core\]/.test(c2.stdout)) fail('cli default: ' + c2.stdout + c2.stderr);
const c3 = cli([G, '--exe', 'bogus']);
if (c3.status !== 2 || !/unknown exe/.test(c3.stderr)) fail('cli bad exe: ' + c3.status + ' ' + c3.stderr);
console.log(bad ? `${bad} failed` : 'exe ok');
process.exit(bad ? 1 : 0);
