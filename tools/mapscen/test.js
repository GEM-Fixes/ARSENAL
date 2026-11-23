// mapscen test: seeded fake map + GoH def tree built in code; checks counts, classes, as64 same/near/no, variants (#win), coverage
// Author: Imperator_Aug (ARSENAL, ia-724a416f)
const ms = require('./mapscen');
let seed = 12345;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const defs = ['entity/flora/bush/generic_bush/bush_a/bush_a.def', 'entity/flora/trees/pine7/pine7.def', 'entity/construction/_rural/fences/fence_w1/fence_w1.def',
  'entity/construction/_urban/street/roadway_border_x/roadway_border_x.def', 'entity/construction/_rural/buildings/shed9/shed9.def', 'entity/landscape/stamp/destroy/debris_q.def',
  'entity/construction/_military/fortifications/sandbag_new/sandbag_c/sandbag_c.def', 'entity/construction/_military/boxes/crate4/crate4.def', 'entity/landscape/stamp/_common/detail/leaves2.def'];
const names = defs.map(d => d.slice(d.lastIndexOf('/') + 1, -4));
const want = {}; let text = '{map\r\n';
for (const n of names) want[n] = 0;
for (let i = 0; i < 200; i++) { const n = names[rnd(names.length)]; want[n]++; text += `\t{Entity "${n}" 0x${i.toString(16)}\r\n\t\t{Position 1 2}\r\n\t}\r\n`; }
text += '\t{Entity "sandbag_c#win" 0x1}\r\n\t{Entity "ghost" 0x2}\r\n}';
const entries = [{ key: 'map/multi/tm/map', buf: Buffer.from(text) }, { key: 'map/multi/tm/header.dds', buf: Buffer.from('{Entity "nope" 1}') },
  { key: 'map/multi/other/map', buf: Buffer.from('{Entity "bush_a" 1}') }, ...defs.map(k => ({ key: k, buf: Buffer.alloc(0) }))];
const vanilla = new Set(['crate4', 'pine', 'bush_a']);
const has = n => vanilla.has(n) ? 'same' : vanilla.has(n.replace(/\d+$/, '')) ? 'near:' + n.replace(/\d+$/, '') : 'no';
const r = ms.analyse(['tm'], { entries, defs: ms.defIndex(entries), has });
let bad = 0;
const chk = (c, m) => { if (!c) { console.log('FAIL ' + m); bad++; } };
const row = n => r.rows.find(x => x.name === n);
chk(r.maps[0].files.length === 1, 'only map + .mi of tm are read (dds, other map not)');
for (const n of names) chk(row(n) && row(n).count === want[n], `count ${n} ${row(n) && row(n).count} vs ${want[n]}`);
chk(row('ghost') && row('ghost').cls === 'nodef' && row('ghost').def === null, 'ghost has no def');
chk(row('sandbag_c#win').def.includes('sandbag_c'), 'variant resolves to base def');
const cls = { bush_a: 'bush', pine7: 'tree', fence_w1: 'fence', roadway_border_x: 'road border', shed9: 'building', debris_q: 'debris', sandbag_c: 'trench', crate4: 'prop', leaves2: 'ground stamp' };
for (const n in cls) chk(row(n).cls === cls[n], `class ${n} ${row(n).cls} vs ${cls[n]}`);
chk(row('crate4').as64 === 'same' && row('bush_a').as64 === 'same', 'same');
chk(row('pine7').as64 === 'near:pine', 'near ' + row('pine7').as64);
chk(row('shed9').as64 === 'no', 'no');
chk(r.rows.reduce((a, x) => a + x.count, 0) === 202, 'total records');
const cv = ms.coverage(r.rows, [1, 100]);
chk(Math.abs(cv[1].share - 1) < 1e-9 && cv[0].share > 0 && cv[0].share < 1, 'coverage');
const ct = ms.classTable(r.rows);
chk(ct.total === 202 && ct.table.every(c => c.records === c.recSame + c.recMissing), 'class table sums');
chk(ms.entityNames('{Entity  "A" 1}{Entity "a" 2}').get('a') === 2, 'name parse case-folds');
// game parity: --exe picks the cache of that game (entityindex cachePath/load exe); a missing MoW:AS2 cache is built once with exe mowas_2;
// no --exe loads the given cache with no exe (as before); --exe goh refused with exit 2 and one line
{
  const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'mapscen-')), cache = path.join(t, 'vanilla.json'), calls = [];
  const ix = { cachePath: (f, e) => (e && e !== 'as64' ? f.replace(/\.json$/, '.' + e + '.json') : f),
    load: (f, e) => { calls.push(['load', f, e]); return { entities: {} }; }, build: o => { calls.push(['build', o.exe, o.gameDir, o.cache]); } };
  ms.vanillaIndex({ cache }, ix);
  chk(calls.length === 1 && calls[0][1] === cache && calls[0][2] === undefined, 'no --exe: plain load ' + JSON.stringify(calls));
  calls.length = 0; ms.vanillaIndex({ cache, exe: require('../lib/games').get('mowas2'), game: t }, ix);
  chk(calls[0][0] === 'build' && calls[0][1] === 'mowas_2' && calls[0][2] === t && calls[1][0] === 'load' && calls[1][2] === 'mowas_2', 'mowas2: build missing cache then load ' + JSON.stringify(calls));
  fs.writeFileSync(path.join(t, 'vanilla.mowas_2.json'), '{}'); calls.length = 0;
  ms.vanillaIndex({ cache, exe: require('../lib/games').get('mowas_2'), game: t }, ix);
  chk(calls.length === 1 && calls[0][0] === 'load' && calls[0][2] === 'mowas_2', 'mowas2: existing cache only loaded');
  // a cachePath that depends on the game folder (as in the shared cache folder): the file checked, built and loaded must be the same one
  {
    const files = [], ixd = { cachePath: (f, e, d) => f.replace(/\.json$/, '.' + e + (d ? '.f' + path.basename(d) : '') + '.json'),
      load: (f, e, d) => { files.push(['load', ixd.cachePath(f, e, d)]); return { entities: {} }; },
      build: o => { const c = ixd.cachePath(o.cache, o.exe, o.gameDir); files.push(['build', c]); fs.writeFileSync(c, '{}'); } };
    const gd = path.join(t, 'other');
    ms.vanillaIndex({ cache, exe: require('../lib/games').get('mowas_2'), game: gd }, ixd);
    chk(files.length === 2 && files[0][0] === 'build' && files[1][1] === files[0][1], 'dir-keyed cache: build and load agree ' + JSON.stringify(files));
    files.length = 0; ms.vanillaIndex({ cache, exe: require('../lib/games').get('mowas_2'), game: gd }, ixd);
    chk(files.length === 1 && files[0][0] === 'load', 'dir-keyed cache: second run only loads ' + JSON.stringify(files));
  }
  // no --game: the AS2 install from games.install goes to cachePath, build and load alike (stubbed here with a made-up folder)
  {
    const gm = require('../lib/games'), real = gm.install, inst = path.join(t, 'inst'), seen = [];
    gm.install = () => ({ dir: inst, source: 'test' });
    const ixi = { cachePath: (f, e, d) => { seen.push(['path', d]); return f.replace(/\.json$/, '.' + e + '.i.json'); },
      load: (f, e, d) => { seen.push(['load', d]); return { entities: {} }; }, build: o => { seen.push(['build', o.gameDir]); } };
    try { ms.vanillaIndex({ cache, exe: gm.get('mowas_2') }, ixi); } finally { gm.install = real; }
    chk(seen.length === 3 && seen.every(s => s[1] === inst), 'no --game: install dir passed to cachePath, build and load ' + JSON.stringify(seen));
  }
  const g = cp.spawnSync(process.execPath, [path.join(__dirname, 'mapscen.js'), 'm1', '--exe', 'goh'], { encoding: 'utf8' });
  chk(g.status === 2 && /^mapscen: not available for GoH: .*\(plan\/reports\/game-parity\/t-maps\.md:21\)/.test(g.stderr), 'goh refused: ' + g.status + ' ' + g.stderr);
  // --game <AS2 dir> (parsed since wave 3): a missing MoW:AS2 cache is built from that made-up install, not from the real one
  fs.mkdirSync(path.join(t, 'g', 'resource'), { recursive: true }); fs.mkdirSync(path.join(t, 'gohres'));
  const c2 = path.join(t, 'c2.json');
  const gg = cp.spawnSync(process.execPath, [path.join(__dirname, 'mapscen.js'), 'm1', '--goh', path.join(t, 'gohres'), '--cache', c2, '--exe', 'mowas_2', '--game', path.join(t, 'g')], { encoding: 'utf8' });
  chk(gg.status === 0 && /building the MoW:AS2 vanilla index/.test(gg.stderr) && fs.existsSync(path.join(t, 'c2.mowas_2.json')) && !fs.existsSync(c2), '--game builds the mowas_2 cache: ' + gg.status + ' ' + gg.stderr);
  let mg = null; try { mg = JSON.parse(fs.readFileSync(path.join(t, 'c2.mowas_2.json'), 'utf8')).meta.game; } catch (e) { /* stays null */ }
  chk(mg && path.resolve(mg).toLowerCase() === path.resolve(path.join(t, 'g')).toLowerCase(), '--game: cache built from the made-up install, meta.game ' + mg);
  fs.rmSync(t, { recursive: true, force: true });
}
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
