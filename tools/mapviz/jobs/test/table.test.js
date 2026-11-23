// jobs table test, waves C and D (jobs.md): the new rows row for row, the paint rows' argv, the `also` patterns,
// whatOfName / whatOfTiles, reduce (sizes passed down, a field the asking job does not key falls to the default), the
// request fields phase, at, pose, light in canon (defaults, refusals), keys that change with them, needs lines, buildArgv
// of every new row, a row whose part is not built (MV_NOT_BUILT, nothing queued), the view and travel chains run on
// as64, mowas2 and goh (sight.rings.json, the entcat and grids needs, phase null passes no --phase), and no runOnce
// (ruling R-c). Seeded defects: bad argv and also rows, bad field values, a view part that writes the old vector name.
// usage: node tools/mapviz/jobs/test/table.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-79cde3fb)
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness')('jobs-table');
const table = require('../table');
const cache = require('../cache');
const index = require('../index');
const { W, ok, eq, throwsCode, until } = h;
const J = table.JOBS;

const G = path.join(W, 'game');
fs.mkdirSync(G, { recursive: true });
const req = (what, o) => Object.assign({ what, target: 'goh', game: G, map: 'multi/x' }, o || {});
const V = { mapkit: 2, raster: 3, water: 2, pass: 3, entcat: 1, render: 5, sight: 1, cover: 1, strong: 1, paint: 1 };
const reader = over => p => (Object.prototype.hasOwnProperty.call(over || {}, p) ? over[p] : V[p]);
const key = (what, o, over) => cache.entryKey(Object.assign(req(what, o), { versionOf: reader(over) }));

// ---- 1. the rows of jobs.md 1.2, row for row ----
{
  eq(table.check(), [], 'table.check() is clean with the wave C and D rows');
  const ROWS = {
    sight: ['sight grid', true, 600, 'doc, grids, entcat', 'mode', 'sight.grid, sight.ground, sight.field, sight.fire.top, sight.fire.bottom, sight.json'],
    view: ['sight view', false, 120, 'doc, grids, entcat, sight', 'mode, kind, at, pose', 'sight.view, sight.vis, sight.fire, sight.rings.json'],
    cover: ['cover map', true, 600, 'doc, grids, water, entcat', 'mode', 'cover.edges.json, cover.points.json, cover.band, cover.lip, cover.conceal'],
    obstacles: ['pass obstacles', true, 600, 'doc, grids, terrain, pass, entcat', 'mode, kind', 'obst.<kind>, move.<kind>, mcost.<kind>'],
    travel: ['pass travel', true, 120, 'doc, grids, obstacles', 'mode, kind, phase', 'travel.a.<kind>, travel.b.<kind>, travel.json'],
    routes: ['pass routes', true, 300, 'doc, grids, obstacles, travel', 'mode, kind, phase', 'routes.json, route.a.<kind>, route.b.<kind>'],
    strong: ['strong points', true, 600, 'doc, grids, terrain, water, entcat, sight, cover, obstacles, travel, routes', 'mode, kind, phase',
      'strong.<kind>.json, strong.a.<kind>.score, strong.b.<kind>.score, strong.a.<kind>.gate, strong.b.<kind>.gate, strong.contact.<kind>'],
    checks: ['strong checks', true, 300, 'doc, grids, terrain, water, entcat, sight, obstacles, travel', 'mode, phase', 'strong.checks.json'],
    l2: ['render l2', true, 600, 'doc, grids, entcat, l1', 'mode, size', 'pic.l2, l2.n, l2.z, tiles/l2'],
    pack: ['render pack', true, 1200, 'doc, entcat', 'mode', 'pack.json'],
    l3: ['render l3', true, 600, 'doc, grids, l2, pack', 'mode, size', 'pic.l3, l3.n, l3.z, tiles/l3'],
    l4: ['render l4', true, 600, 'doc, grids, l3, pack', 'mode, size, light', 'pic.l4, tiles/l4'],
    staff: ['paint draw --style staff', true, 600, 'doc, grids, terrain, water, entcat', 'mode, size', 'pic.staff, tiles/staff'],
    painted: ['paint draw --style painted', true, 900, 'doc, grids, terrain, water, entcat', 'mode, size', 'pic.painted, tiles/painted'],
    recon: ['paint draw --style recon', true, 600, 'doc, l4', 'mode, size', 'pic.recon, tiles/recon'],
    sketch: ['paint draw --style sketch', true, 600, 'doc, grids, terrain, water, entcat', 'mode, size', 'pic.sketch, tiles/sketch'],
  };
  for (const [w, [runs, heavy, t, needs, keys, products]] of Object.entries(ROWS)) {
    const r = J[w];
    if (!ok(!!r, 'row ' + w + ' is in the table')) continue;
    eq([[r.part, r.cmd].concat(r.argv || []).join(' '), r.heavy, r.timeoutS, r.needs.join(', '), r.keys.join(', '), r.products.join(', ')],
      [runs, heavy, t, needs, keys, products], 'row ' + w + ' as jobs.md 1.2');
  }
  eq(J.entcat.keys, ['mode'], 'entcat keys mode (jobs.md 1.1)');
  eq(J.strong.also, ['strong.a.<kind>.*', 'strong.b.<kind>.*'], 'strong also');
  eq(table.FIELDS, ['mode', 'kind', 'side', 'size', 'phase', 'at', 'pose', 'light'], 'FIELDS');
  eq(table.defaults('view'), { mode: null, kind: 'inf', side: 'both', size: null, phase: null, at: null, pose: 'stand', light: 'clean' }, 'defaults of view');
  for (const w of ['l1', 'c0', 'l2', 'l3', 'l4', 'staff', 'painted', 'recon', 'sketch']) ok(table.defaults(w).size === 2048, 'size default 2048 for ' + w);
  eq(table.tilesOf(J.recon), ['recon'], 'tilesOf recon');
  eq(table.productFiles(J.travel, { kind: 'tank' }).map(p => p.name), ['travel.a.tank', 'travel.b.tank', 'travel.json'], 'productFiles of travel tank');
  eq(table.productFiles(J.pack, {}).map(p => p.alt), [['pack.json']], 'pack.json alone is checked (pack.bin is kept, not checked)');
}

// ---- 2. seeded defects in rows: argv and also ----
{
  const bad = {
    a: { part: 'p', cmd: 'a', heavy: true, timeoutS: 1, needs: [], keys: ['light', 'colour'], products: ['a'], argv: ['--style', '--out'] },
    b: { part: 'p', cmd: 'b', heavy: true, timeoutS: 1, needs: [], keys: [], products: ['b'], argv: '--style x' },
    c: { part: 'p', cmd: 'c', heavy: true, timeoutS: 1, needs: [], keys: [], products: ['c'], also: ['C/x'] },
    d: { part: 'p', cmd: 'd', heavy: true, timeoutS: 1, needs: [], keys: [], products: ['d'], argv: ['--in=x', '--inner'] },
  };
  const pr = table.check(bad);
  ok(pr.some(p => /job a: argv may not give --out/.test(p)), 'check: argv giving --out is caught');
  ok(pr.some(p => /job a: key colour/.test(p)) && !pr.some(p => /key light/.test(p)), 'check: light is a field, colour is not');
  ok(pr.some(p => /job b: argv is not a list/.test(p)), 'check: argv that is not a list is caught');
  ok(pr.some(p => /job c: also is not a list of name patterns/.test(p)), 'check: a bad also pattern is caught');
  ok(pr.some(p => /job d: argv may not give --in=x/.test(p)) && !pr.some(p => /--inner/.test(p)), 'check: --in=x caught, --inner allowed');
}

// ---- 3. whatOfName, whatOfTiles, alsoMatch ----
{
  eq(table.whatOfName('strong.a.inf.threat', 'inf'), 'strong', 'whatOfName strong.a.inf.threat (through also)');
  eq(table.whatOfName('strong.b.at.danger', 'at'), 'strong', 'whatOfName strong.b.at.danger, kind at');
  eq(table.whatOfName('strong.a.at.threat', 'inf'), null, 'a strong layer of another kind is not found');
  eq(table.whatOfName('strong.a.inf.', 'inf'), null, 'the also star needs a name character');
  eq(table.whatOfName('sight.vis'), 'view', 'whatOfName sight.vis');
  eq(table.whatOfName('sight.fire'), 'view', 'whatOfName sight.fire (not sight.fire.top)');
  eq(table.whatOfName('sight.fire.top'), 'sight', 'whatOfName sight.fire.top');
  eq(table.whatOfName('sight.rings'), 'view', 'whatOfName sight.rings: the viewshed vector (ruling R-a)');
  eq(table.whatOfName('sight.rings.json'), 'view', 'whatOfName sight.rings.json');
  eq(table.whatOfName('sight.view'), 'view', 'whatOfName sight.view: the grid keeps its name');
  eq(table.productFiles(J.view, { kind: 'inf' }).map(p => p.alt), [['sight.view.mvg', 'sight.view.json'], ['sight.vis.mvg', 'sight.vis.json'], ['sight.fire.mvg', 'sight.fire.json'], ['sight.rings.json']],
    'productFiles of view: the vector is checked as sight.rings.json');
  eq(table.whatOfName('strong.contact.tank', 'tank'), 'strong', 'whatOfName strong.contact.tank');
  eq(table.whatOfName('mcost.at', 'at'), 'obstacles', 'whatOfName mcost.at');
  eq(table.whatOfName('route.b.inf', 'inf'), 'routes', 'whatOfName route.b.inf');
  eq(table.whatOfName('routes'), 'routes', 'whatOfName routes (vector)');
  eq(table.whatOfName('strong.checks'), 'checks', 'whatOfName strong.checks');
  eq(table.whatOfName('cover.points'), 'cover', 'whatOfName cover.points');
  eq(table.whatOfName('pack'), 'pack', 'whatOfName pack');
  eq(table.whatOfName('pic.l4'), 'l4', 'whatOfName pic.l4');
  eq(table.whatOfName('l3.z'), 'l3', 'whatOfName l3.z');
  eq(table.whatOfName('objects'), 'entcat', 'whatOfName objects');
  eq(table.whatOfName('nope'), null, 'whatOfName of an unknown name');
  for (const b of ['l2', 'l3', 'l4', 'staff', 'painted', 'recon', 'sketch']) eq(table.whatOfTiles(b), b, 'whatOfTiles ' + b);
  ok(table.alsoMatch(J.strong, 'strong.b.mg.howitzer', 'mg') && !table.alsoMatch(J.sight, 'strong.b.mg.howitzer', 'mg'), 'alsoMatch');
}

// ---- 4. reduce ----
{
  const r1 = table.reduce({ what: 'recon', target: 'goh', game: G, map: 'm', mode: 'combat', size: 1024, light: 'clean' }, 'l4');
  eq([r1.mode, r1.size, r1.light], ['combat', 1024, 'clean'], 'reduce recon -> l4 keeps mode, size 1024, light');
  const r1b = table.reduce({ what: 'recon', target: 'goh', game: G, map: 'm', mode: 'combat', size: 1024, light: 'mode' }, 'l4');
  eq(r1b.light, 'clean', 'reduce recon -> l4: recon does not key light, so its l4 is the clean one');
  const r2 = table.reduce({ what: 'strong', target: 'goh', game: G, map: 'm', mode: 'combat', kind: 'at', phase: 2, size: null }, 'cover');
  eq(Object.keys(r2).filter(k => !['what', 'target', 'game', 'mods', 'modDirs', 'map'].includes(k)), ['mode'], 'reduce strong -> cover keeps mode only');
  const r3 = table.reduce({ what: 'strong', target: 'goh', game: G, map: 'm', mode: null, kind: 'at', phase: 2 }, 'travel');
  eq([r3.kind, r3.phase], ['at', 2], 'reduce strong -> travel keeps kind and phase');
  const r4 = table.reduce({ what: 'checks', target: 'goh', game: G, map: 'm', mode: null, kind: 'tank', phase: 3 }, 'travel');
  eq([r4.kind, r4.phase], ['inf', 3], 'reduce checks -> travel: kind inf (checks does not key kind), phase kept');
  const r5 = table.reduce({ what: 'view', target: 'goh', game: G, map: 'm', mode: 'm1', kind: 'mg', at: '1,2', pose: 'prone' }, 'sight');
  eq([r5.mode, r5.at, r5.pose, r5.kind], ['m1', undefined, undefined, undefined], 'reduce view -> sight keeps mode only');
  const r5e = table.reduce({ what: 'view', target: 'goh', game: G, map: 'm', mode: 'm1', kind: 'mg', at: '1,2', pose: 'prone' }, 'entcat');
  eq(Object.keys(r5e).filter(k => !['what', 'target', 'game', 'mods', 'modDirs', 'map'].includes(k)).map(k => [k, r5e[k]]), [['mode', 'm1']], 'reduce view -> entcat keeps mode only');
  const r7 = table.reduce({ what: 'routes', target: 'goh', game: G, map: 'm', mode: 'm1', kind: 'tank', phase: null }, 'grids');
  eq([r7.mode, r7.kind, r7.phase], ['m1', undefined, undefined], 'reduce routes -> grids keeps mode only');
  const r6 = table.reduce({ target: 'goh', map: 'm', kind: 'tank' }, 'travel');
  eq(r6.kind, 'tank', 'reduce without an asking job (a page request) keeps the fields as given');
}

// ---- 5. canon: the new fields ----
{
  const c = cache.canon(req('view', { at: '105.004,-100' }));
  eq([c.at, c.pose, c.light, c.phase], ['105,-100', 'stand', 'clean', null], 'canon fills pose stand, light clean, phase null; at to 2 decimals');
  eq(c.variant, { at: '105,-100', kind: 'inf', mode: null, pose: 'stand' }, 'variant of view');
  eq(cache.sortedJson(c.variant), '{"at":"105,-100","kind":"inf","mode":null,"pose":"stand"}', 'variant JSON of view (jobs.md 3)');
  eq(cache.sortedJson(cache.canon(req('l4')).variant), '{"light":"clean","mode":null,"size":2048}', 'variant JSON of l4 (jobs.md 3)');
  eq(cache.canon(req('view', { at: [-0.001, 2.5] })).at, '0,2.5', 'at as a list; -0 written 0');
  eq(cache.canon(req('view', { at: ' 7 , 8.125 ' })).at, '7,8.13', 'at with spaces, rounded');
  eq(cache.canon(req('travel', { phase: '2' })).phase, 2, 'phase as a string');
  eq(cache.canon(req('travel', { args: { phase: 4 } })).phase, 4, 'phase through args');
  const cc = cache.canon(c);
  ok(cc.at === c.at && cc.pose === c.pose && cache.sortedJson(cc.variant) === cache.sortedJson(c.variant), 'canon is idempotent with the new fields');
  for (const [n, o] of [['view with at null', { what: 'view' }], ['pose crouch', { what: 'view', at: '1,1', pose: 'crouch' }],
    ['light dusk', { what: 'l4', light: 'dusk' }], ['phase 1.5', { what: 'travel', phase: 1.5 }], ['phase 100', { what: 'travel', phase: 100 }],
    ['phase -1', { what: 'travel', phase: -1 }], ['phase "1.5"', { what: 'travel', phase: '1.5' }], ['phase true', { what: 'travel', phase: true }],
    ['at one number', { what: 'view', at: '5' }], ['at not a number', { what: 'view', at: '1,x' }], ['at Infinity', { what: 'view', at: [1, Infinity] }],
    ['at three numbers', { what: 'view', at: '1,2,3' }], ['at empty part', { what: 'view', at: '1,' }],
    ['phase given twice', { what: 'travel', phase: 1, args: { phase: 2 } }]])
    throwsCode(() => cache.canon(req(o.what, Object.assign({}, o, { what: undefined }))), 'MV_USAGE', 'canon refuses ' + n);
  ok(cache.canon(req('grids', { pose: 'kneel', light: 'mode', phase: 3, at: '1,1' })).variant.mode === null, 'a job not keying the new fields takes them without complaint');
}

// ---- 6. keys: the new fields enter the keys of the rows that key them, and only those ----
{
  const v0 = key('view', { at: '105,-100' });
  for (const [n, o] of Object.entries({ at: { at: '105,-99' }, pose: { pose: 'kneel' }, kind: { kind: 'tank' }, mode: { mode: 'combat' } }))
    ok(key('view', Object.assign({ at: '105,-100' }, o)) !== v0, 'view key changes with ' + n);
  ok(key('view', { at: '105.001,-100.002' }) === v0, 'view: two at values equal at 2 decimals share a key');
  ok(key('view', { at: '105,-100', phase: 3, light: 'mode', size: 99 }) === v0, 'view key does not change with phase, light, size');
  const l4 = key('l4');
  ok(key('l4', { light: 'mode' }) !== l4 && key('l4', { light: 'clean' }) === l4, 'l4 key changes with light, default clean filled');
  ok(key('l3', { light: 'mode' }) === key('l3'), 'l3 key does not change with light');
  for (const w of ['travel', 'routes', 'strong', 'checks']) ok(key(w, { phase: 2 }) !== key(w) && key(w, { phase: 0 }) !== key(w), w + ' key changes with phase');
  ok(key('obstacles', { phase: 2 }) === key('obstacles'), 'obstacles key does not change with phase');
  ok(key('checks', { kind: 'tank' }) === key('checks'), 'checks key does not change with kind');
  ok(key('strong', { kind: 'tank' }) !== key('strong'), 'strong key changes with kind');
  ok(key('entcat', { mode: 'combat' }) !== key('entcat'), 'entcat key changes with mode (jobs.md 1.1)');
  ok(key('staff') !== key('sketch') && key('staff', { size: 1024 }) !== key('staff'), 'paint rows: own keys, size enters');
  // part versions: a bump below a job changes its key
  for (const [p, w] of [['sight', 'strong'], ['cover', 'strong'], ['pass', 'checks'], ['render', 'recon'], ['entcat', 'pack'], ['sight', 'view'], ['paint', 'sketch']])
    ok(key(w, { at: '1,1' }, { [p]: V[p] + 1 }) !== key(w, { at: '1,1' }), 'a bump of ' + p + ' changes the key of ' + w);
  ok(key('cover', {}, { sight: 9 }) === key('cover'), 'a bump of sight leaves cover');
}

// ---- 7. needs lines (jobs.md 3) ----
{
  const NL = {
    entcat: 'mapkit', pass: 'mapkit,raster', sight: 'entcat,mapkit', view: 'entcat,mapkit,sight', cover: 'entcat,mapkit,water',
    obstacles: 'entcat,mapkit,pass,raster', travel: 'entcat,mapkit,pass,raster', routes: 'entcat,mapkit,pass,raster',
    strong: 'cover,entcat,mapkit,pass,raster,sight,water', checks: 'entcat,mapkit,pass,raster,sight,water',
    l0: 'mapkit,raster,water', l1: 'mapkit', c0: 'mapkit,render', l2: 'entcat,mapkit,render', pack: 'entcat,mapkit',
    l3: 'entcat,mapkit,render', l4: 'entcat,mapkit,render', staff: 'entcat,mapkit,raster,water', painted: 'entcat,mapkit,raster,water',
    sketch: 'entcat,mapkit,raster,water', recon: 'entcat,mapkit,render',
  };
  for (const [w, l] of Object.entries(NL)) eq(cache.needParts(J[w]).join(','), l, 'needParts of ' + w);
  const lines = cache.keyLines(cache.canon(req('strong')), 'strong', 1, cache.needVersions(J.strong, null, reader()));
  eq(lines[2], 'needs:cover@1,entcat@1,mapkit@2,pass@3,raster@3,sight@1,water@2', 'needs line of strong');
}

// ---- 8. buildArgv of every new row ----
{
  const prefix = { sight: 'sight grid', view: 'sight view', cover: 'cover map', obstacles: 'pass obstacles', travel: 'pass travel', routes: 'pass routes',
    strong: 'strong points', checks: 'strong checks', l2: 'render l2', pack: 'render pack', l3: 'render l3', l4: 'render l4',
    staff: 'paint draw --style staff', painted: 'paint draw --style painted', recon: 'paint draw --style recon', sketch: 'paint draw --style sketch' };
  for (const [w, p] of Object.entries(prefix)) {
    const c = cache.canon(req(w, { at: '105,-100', phase: 2, mode: 'combat' }));
    const a = index.buildArgv(J[w], c, 'O', ['I'], 'P', 'F');
    const n = p.split(' ').length;
    ok(a.slice(0, n).join(' ') === p && a[n] === '--target' && a[n + 1] === 'goh', 'buildArgv ' + w + ' starts ' + p + ' --target (' + a.slice(0, n + 2).join(' ') + ')');
    const flags = a.filter(x => /^--(mode|kind|size|phase|at|pose|light)$/.test(x)).map(x => x.slice(2));
    eq(flags, J[w].keys.filter(k => c[k] !== null), 'buildArgv ' + w + ' passes its key fields: ' + J[w].keys.join(', '));
  }
  const cv = cache.canon(req('view', { at: '105,-100' }));
  const av = index.buildArgv(J.view, cv, 'O', [], 'P', 'F').join(' ');
  ok(/ --kind inf --at 105,-100 --pose stand --out O /.test(av), 'buildArgv view holds --at 105,-100 --pose stand (' + av + ')');
  const at = index.buildArgv(J.travel, cache.canon(req('travel', { phase: 0, kind: 'tank' })), 'O', [], 'P', 'F').join(' ');
  ok(/ --kind tank --phase 0 --out /.test(at), 'buildArgv travel passes --phase 0 (' + at + ')');
  // the paint rows: the job's cancel flag reaches paint draw as o.cancelFlag (paint/cli.js hands it to picture()), every target
  const M = require('../../mapviz');
  for (const target of ['as64', 'mowas2', 'goh']) for (const w of ['staff', 'painted', 'recon', 'sketch']) {
    const a = index.buildArgv(J[w], cache.canon(req(w, { target })), 'O', ['I'], 'P', 'F');
    const o = M.parseArgs(a.slice(2), { style: 'str' });
    ok(o.cancelFlag === 'F' && o.extra.style === w && o.target === target, target + ' ' + w + ': paint draw gets --cancel-flag as cancelFlag and --style ' + w);
  }
  const at2 = index.buildArgv(J.travel, cache.canon(req('travel')), 'O', [], 'P', 'F');
  ok(!at2.includes('--phase'), 'buildArgv travel with phase null gives no --phase');
  const a4 = index.buildArgv(J.l4, cache.canon(req('l4')), 'O', [], 'P', 'F').join(' ');
  ok(/ --size 2048 --light clean --out /.test(a4), 'buildArgv l4 passes --light clean (' + a4 + ')');
  const ae = index.buildArgv(J.entcat, cache.canon(req('entcat', { mode: 'combat' })), 'O', [], 'P', 'F').join(' ');
  ok(/ --mode combat /.test(ae), 'buildArgv entcat passes --mode');
}

// ---- 9. a row whose part is not built: MV_NOT_BUILT, nothing queued; then runOnce ----
const fakeCli = v => ({ version: v, run() { return 0; }, commands: {} });
const partsWith = built => Object.keys(V).map(p => ({ part: p, id: 'MV-' + p, wave: 'C', dir: p, load: () => (built.includes(p) ? fakeCli(V[p]) : null) }));
function makeFake() {
  const f = { calls: [] };
  f.run = (argv, opt) => new Promise(resolve => {
    const c = { argv, opt, done: false };
    f.calls.push(c);
    c.end = (code, stdout, stderr) => { if (c.done) return; c.done = true; clearInterval(c.watch); resolve({ code, stdout: stdout || '', stderr: stderr || '', timedOut: false }); };
    opt.ctl.kill = () => { c.killed = true; c.end(null, '', 'killed'); };
    if (f.honour) c.watch = setInterval(() => { if (fs.existsSync(opt.cancelFlag)) c.end(5, '', 'mapviz previews: cancelled'); }, 10);
  });
  return f;
}
const mk = (f, o) => index.create(Object.assign({ root: path.join(W, 'root-' + Math.random().toString(36).slice(2, 8)), run: f.run, killWaitMs: 100, pollMs: 20, lockPollMs: 40 }, o || {}));

(async () => {
  {
    const f = makeFake();
    const r = mk(f, { parts: partsWith(['mapkit', 'raster', 'water', 'entcat', 'render']) });
    eq(r.problems, [], 'the runner with the real table has no problems');
    throwsCode(() => r.submit(req('sight')), 'MV_NOT_BUILT', 'sight with rules/sight not built: MV_NOT_BUILT');
    throwsCode(() => r.submit(req('view', { at: '1,1' })), 'MV_NOT_BUILT', 'view with sight not built: MV_NOT_BUILT');
    throwsCode(() => r.submit(req('strong')), 'MV_NOT_BUILT', 'strong with its part and parts below not built: MV_NOT_BUILT');
    throwsCode(() => r.submit(req('staff')), 'MV_NOT_BUILT', 'staff with paint not built: MV_NOT_BUILT');
    const r2 = mk(f, { parts: partsWith(['mapkit', 'raster', 'water', 'entcat', 'render', 'strong', 'pass']) });
    throwsCode(() => r2.submit(req('strong')), 'MV_NOT_BUILT', 'strong built, sight and cover not: MV_NOT_BUILT');
    throwsCode(() => r2.submit(req('view')), 'MV_USAGE', 'view without at is refused before the parts are read');
    await h.sleep(60);
    eq([f.calls.length, r.list().queued.length, r2.list().queued.length], [0, 0, 0], 'nothing ran or stays queued after the refusals');
    await r.close(); await r2.close();
  }

  // ---- the view and travel chains on the three games (rulings R-a, R-c, R-f; late J1, J2, J3) ----
  // autoFake: a part run that writes the products of its row into --out (tiles none on these chains); `swap` maps a file
  // name to the one written instead (a seeded defect)
  function autoFake(swap) {
    const f = { calls: [] };
    f.run = (argv, opt) => {
      f.calls.push({ argv, opt });
      const out = argv[argv.indexOf('--out') + 1], ki = argv.indexOf('--kind');
      const row = Object.values(J).find(r => r.part === argv[0] && r.cmd === argv[1] && (r.argv || []).every((a, i) => argv[2 + i] === a));
      fs.mkdirSync(out, { recursive: true });
      if (row) for (const p of table.productFiles(row, { kind: ki >= 0 ? argv[ki + 1] : 'inf' })) {
        if (p.dir) continue;
        const name = swap && swap[p.alt[0]] ? swap[p.alt[0]] : p.alt[0];
        fs.writeFileSync(path.join(out, name), '{}');
      }
      return Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false });
    };
    return f;
  }
  const ins = a => a.filter(x => x === '--in').length;
  const callOf = (f, words) => f.calls.find(c => c.argv.slice(0, 2).join(' ') === words);
  for (const target of ['as64', 'mowas2', 'goh']) {
    const f = autoFake();
    const r = mk(f, { parts: partsWith(Object.keys(V)) });
    ok(typeof r.runOnce === 'undefined' && !('jsonBody' in index), target + ': the runner has no runOnce and index no jsonBody (ruling R-c)');
    const s = r.submit(req('view', { target, at: '105,-100', pose: 'kneel', mode: 'combat' }));
    const d = await r.wait(s.id);
    ok(d && d.state === 'done' && d.result.products.includes('sight.rings.json') && !d.result.products.includes('sight.view.json'),
      target + ': the view job ends done with sight.rings.json (' + JSON.stringify(d && (d.error || d.result.products)) + ')');
    const vc = callOf(f, 'sight view'), ec = callOf(f, 'entcat map');
    ok(!!vc && !!ec && f.calls.indexOf(ec) < f.calls.indexOf(vc) && ins(vc.argv) === 4, target + ': entcat runs before sight view and view gets 4 --in (doc, grids, entcat, sight)');
    ok(!!vc && / --at 105,-100 --pose kneel /.test(vc.argv.join(' ')), target + ': view passes --at and --pose');
    const t = r.submit(req('routes', { target, kind: 'tank', mode: 'combat' }));
    const dt = await r.wait(t.id);
    ok(dt && dt.state === 'done', target + ': the routes job (phase null) ends done (' + JSON.stringify(dt && dt.error) + ')');
    const tc = callOf(f, 'pass travel'), rc = callOf(f, 'pass routes');
    ok(!!tc && !!rc && ins(tc.argv) === 3 && ins(rc.argv) === 4, target + ': travel gets 3 --in (doc, grids, obstacles), routes 4 (doc, grids, obstacles, travel)');
    ok(!!tc && !!rc && !tc.argv.includes('--phase') && !rc.argv.includes('--phase'), target + ': phase null passes no --phase (the part takes the lowest phase)');
    const gm = f.calls.filter(c => c.argv.slice(0, 2).join(' ') === 'mapkit grids' && c.argv.includes('combat'));
    ok(gm.length === 1, target + ': grids of mode combat runs once for view, travel and routes (the travel need shares the view need)');
    await r.close();
    // seeded defect: a view part that still writes the old vector name sight.view.json (same cache root: the needs are hits)
    const fb = autoFake({ 'sight.rings.json': 'sight.view.json' });
    const rb = mk(fb, { root: r.cache.root, parts: partsWith(Object.keys(V)) });
    const db = await rb.wait(rb.submit(req('view', { target, at: '1,1', mode: 'combat' })).id);
    ok(db && db.state === 'failed' && db.error.code === 'MV_FAULT' && /sight\.rings\.json/.test(db.error.msg) && fb.calls.length === 1,
      target + ': seeded defect: a view part writing sight.view.json fails MV_FAULT naming sight.rings.json (' + JSON.stringify(db && db.error) + ')');
    await rb.close();
  }
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-table: ' + (e && e.stack || e)); process.exit(1); });
