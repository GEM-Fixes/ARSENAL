// entityindex shipped stock index 6). A made-up AS2 install INST (as64.exe, mowas_2.exe, resource.pak + loose
// resource/entity, mods/m1; not the installed game) and an empty per-user cache folder:
//   - ship.js (refcheck build) writes <out>/vanilla.mowas_2.<fp12>.json.gz: no meta.game, meta.fp, meta.paks, no install path;
//     --no-build --exe as64 takes the twin cache as it is
//   - with no local stock cache, a build takes the shipped file of the same fingerprint: nothing parsed, the cache written under
//     its normal name with meta.game = the install; load() writes it out the same way
//   - a shipped file of another game (other fingerprint, other paks) is ignored: the build parses every file
//   - a near one (the same paks with another file time, then one pak entry changed) seeds the build: only changed records parsed
//   - a mods index with no stock cache seeds from the shipped file and parses only the mod's file
//   usage: node ship.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-34e897e0)
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { spawnSync } = require('child_process');
const W = path.join(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eiship-')), 'shipcase');
fs.rmSync(W, { recursive: true, force: true });
const TC = path.join(W, 'tc'), INST = path.join(W, 'inst'), HOME = path.join(W, 'home'), OUT = path.join(W, 'shipped'), OTHER = path.join(W, 'other');
process.env.ARSENAL_CACHE = TC; process.env.AS2_GAME = HOME; process.env.AS2_NO_STEAM = '1'; process.env.GOH_GAME = path.join(W, 'nogoh');
delete process.env.ARSENAL_SHIPPED_INDEX;
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const zw = require('../../lib/zipwrite');
put(HOME, 'mowas_2.exe', 'MZ'); put(HOME, 'resource/entity/home_ent.def', '{Extension "home_ent.mdl"}\r\n');
put(INST, 'as64.exe', 'MZ'); put(INST, 'mowas_2.exe', 'MZ');
const P = 4, L = 3, PAK = path.join(INST, 'resource.pak');
const pak = last => zw.zip([...Array(P)].map((_, i) => [`entity/pak_e${i}.def`, Buffer.from(`{Extension "pak_e${i}${i === P - 1 ? last : ''}.mdl"}\r\n`)]));
fs.writeFileSync(PAK, pak(''));
// two more fingerprint rows that stay the same through the "update" below (near = at least half the rows the same)
fs.writeFileSync(path.join(INST, 'localization.pak'), zw.zip([['eng/a.txt', Buffer.from('a\r\n')]]));
put(INST, 'localization/b.txt', 'b\r\n');
for (let i = 0; i < L; i++) put(INST, `resource/entity/loose_e${i}.def`, `{Extension "loose_e${i}.mdl"}\r\n`);
put(INST, 'mods/m1/mod.info', '{mod\r\n\t{name "m1"}\r\n\t{minGameVersion "3.260"}\r\n\t{maxGameVersion "3.262"}\r\n}\r\n');
put(INST, 'mods/m1/resource/entity/loose_e1.def', '{Extension "mod_e1.mdl"}\r\n');
const ix = require('../index');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const van = path.join(__dirname, '..', 'cache', 'vanilla.json'), EI = path.join(TC, 'entityindex');
const clear = () => fs.rmSync(EI, { recursive: true, force: true });
const SHIP = path.join(__dirname, '..', 'ship.js');
const ship = a => spawnSync(process.execPath, [SHIP, ...a], { encoding: 'utf8', env: process.env });

// ---- ship.js
const fp = ix.gameFp(INST, 'mowas_2'), name = `vanilla.mowas_2.${fp.slice(0, 12)}.json.gz`;
const r1 = ship(['--game', INST, '--exe', 'mowas_2', '--out', OUT]);
if (r1.status !== 0 || !r1.stdout.includes(name) || !/ \d+ bytes /.test(r1.stdout)) fail('ship.js writes and names the file with its size: ' + r1.status + ' ' + r1.stdout + r1.stderr);
const gzf = path.join(OUT, name), d = fs.existsSync(gzf) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(gzf)).toString('utf8')) : null;
if (!d || 'game' in d.meta || d.meta.fp !== fp || d.meta.exe !== 'mowas_2' || !Array.isArray(d.meta.paks) || !d.meta.paks.includes('resource.pak|' + fs.statSync(PAK).size)) fail('shipped meta: no game, fp, exe, paks: ' + (d ? JSON.stringify(d.meta) : 'no file'));
if (d && Object.keys(d.entities).length !== P + L) fail('shipped file holds every record: ' + Object.keys(d.entities).length);
if (d && Object.keys(d.aux || {}).length === 0) fail('shipped file keeps refcheck\'s per-file tables');
if (d && JSON.stringify(d).toLowerCase().includes(INST.toLowerCase().split('\\').join('\\\\'))) fail('shipped file holds the install path');
const r2 = ship(['--game', INST, '--exe', 'as64', '--out', OUT, '--no-build']);
if (r2.status !== 0 || !r2.stdout.includes(`vanilla.as64.${ix.gameFp(INST, 'as64').slice(0, 12)}.json.gz`)) fail('--no-build ships the as64 twin as it is: ' + r2.stdout + r2.stderr);
fs.rmSync(path.join(OUT, `vanilla.as64.${ix.gameFp(INST, 'as64').slice(0, 12)}.json.gz`));
if (ship(['--game', HOME, '--out', OUT]).status !== 1) fail('a folder with no pak is not shipped');
if (ship(['--out', OUT]).status !== 2) fail('no --game: exit 2');

// ---- exact: used as the cache, nothing parsed
process.env.ARSENAL_SHIPPED_INDEX = OUT;
clear();
const cf = ix.cachePath(van, 'mowas_2', INST);
const b1 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (!b1.stats.shipped || !b1.stats.shipped.exact || b1.stats.parsed !== 0 || b1.stats.reused !== P + L) fail('a shipped file of the same fingerprint is used, nothing parsed: ' + JSON.stringify(b1.stats));
const m1 = ix.metaHead(cf) || {};
if (!same(m1.game || '', INST) || m1.fp !== fp || 'paks' in m1) fail('written under the normal name with meta.game = the install: ' + JSON.stringify(m1));
const b2 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (b2.stats.shipped || b2.stats.parsed !== 0) fail('the next build uses the local cache: ' + JSON.stringify(b2.stats));
clear();
if (!ix.load(van, 'mowas_2', INST).byName('pak_e2').length || !fs.existsSync(cf)) fail('load writes out the exact shipped file');
clear();
const off = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van, shipped: false });
if (off.stats.shipped || off.stats.parsed !== P + L) fail('shipped: false builds cold: ' + JSON.stringify(off.stats));

// ---- another game: ignored
fs.mkdirSync(OTHER, { recursive: true });
const o = JSON.parse(JSON.stringify(d)); o.meta.fp = 'f'.repeat(40); o.meta.paks = ['resource.pak|1', 'localization.pak|2'];
fs.writeFileSync(path.join(OTHER, 'vanilla.mowas_2.ffffffffffff.json.gz'), zlib.gzipSync(JSON.stringify(o)));
process.env.ARSENAL_SHIPPED_INDEX = OTHER;
clear();
const b3 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (b3.stats.shipped || b3.stats.parsed !== P + L) fail('a shipped file of another game is ignored: ' + JSON.stringify(b3.stats));

// ---- near: the same pak with another time (another PC), then one entry changed (a small update)
process.env.ARSENAL_SHIPPED_INDEX = OUT;
clear();
// fpForget / gameview drop: the 5 s fingerprint and view memos of this process forget the pak at once
const t = new Date(Date.now() - 86400000); fs.utimesSync(PAK, t, t); ix.fpForget(); require('../../lib/gameview').drop();
if (ix.gameFp(INST, 'mowas_2') === fp) fail('a new pak time gives a new fingerprint');
const b4 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (!b4.stats.shipped || b4.stats.shipped.exact || b4.stats.parsed !== 0 || b4.stats.reused !== P + L) fail('a near shipped file seeds the build, nothing parsed: ' + JSON.stringify(b4.stats));
clear();
fs.writeFileSync(PAK, pak('_v2')); ix.fpForget(); require('../../lib/gameview').drop();
const b5 = ix.build({ gameDir: INST, exe: 'mowas_2', cache: van });
if (!b5.stats.shipped || b5.stats.shipped.exact || b5.stats.parsed !== 1 || !/_v2/.test(JSON.stringify(b5.idx.byName(`pak_e${P - 1}`)))) fail('after a small update only the changed record is parsed: ' + JSON.stringify(b5.stats));

// ---- mods index with no stock cache: seeds from the shipped file
clear();
const s1 = ix.build({ gameDir: INST, exe: 'mowas_2', mods: ['m1'], cache: path.join(__dirname, '..', 'cache', 'mods-5678.json') });
if (!s1.stats.seeded || !same(s1.stats.seeded, gzf) || s1.stats.parsed !== 2) fail('a mods index seeds from the shipped file (mod file + updated pak entry parsed): ' + JSON.stringify(s1.stats));
const e1 = s1.idx.byName('loose_e1')[0];
if (!e1 || e1.source !== 'mod' || !/mod_e1/.test(JSON.stringify(e1.refs))) fail('the mod file wins: ' + JSON.stringify(e1));
// ---- twin of an install WITH as64/core (every real AS2 install): the two exes have other fingerprints, and each stock file must
// carry its own exe's (the twin once kept the building exe's, so ship.js refused the other exe: "built for another fingerprint")
clear();
const I2 = path.join(W, 'inst2');
put(I2, 'as64.exe', 'MZ'); put(I2, 'mowas_2.exe', 'MZ');
fs.writeFileSync(path.join(I2, 'resource.pak'), pak(''));
fs.mkdirSync(path.join(I2, 'as64', 'core', 'resource'), { recursive: true });
fs.writeFileSync(path.join(I2, 'as64', 'core', 'resource', 'core.pak'), zw.zip([['texts/core.txt', Buffer.from('c\r\n')]]));
ix.fpForget(); require('../../lib/gameview').drop();
const f64 = ix.gameFp(I2, 'as64'), f2 = ix.gameFp(I2, 'mowas_2');
if (!f64 || !f2 || f64 === f2) fail('as64/core gives the as64 view its own fingerprint');
const t1 = ix.build({ gameDir: I2, exe: 'as64', cache: van });
const tw = t1.stats.twin ? ix.metaHead(t1.stats.twin) : null;
if (!tw || tw.exe !== 'mowas_2' || tw.fp !== f2) fail('the twin written by the as64 build carries the mowas_2 fingerprint: ' + JSON.stringify(tw && { exe: tw.exe, fp: tw.fp, f2 }));
const own = ix.metaHead(ix.cachePath(van, 'as64', I2));
if (!own || own.fp !== f64) fail('the as64 stock file keeps the as64 fingerprint');
console.log(bad ? `ship: ${bad} failed` : 'ship ok');
process.exit(bad ? 1 : 0);
