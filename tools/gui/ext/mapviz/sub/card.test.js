// Map Viewer object card test (MV-PG2, builder PG2b): node tools/gui/ext/mapviz/sub/card.test.js [scratch dir]
// card.server.js on a stubbed cache with the real job table and the entcat catalogue of the fixture map (both forms;
// a planted catalogue when entcat is not built): answers for the wall, the bush and the house, the entry key, props left
// out, volumes counted; seeded: a bad def, a def not in the list, the list not made (need), broken JSON, a failed def, the
// memo size. The card part on a stub V with the objects part and the server route: a click opens the card with the rows
// of the fixture (same rows on mowas2, as64 and goh), the cover pick first, a cover point, nothing at an empty spot,
// a tool in use takes the click, Make and job words, a def not in the list, the Gates of Hell sandbag row, the vault row,
// the Editor and Models buttons only where the page exists; the language file both ways; no colour literal; ES5.
// Author: Imperator_Aug (ARSENAL, ia-1c67c68c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-card-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), OBJ = require('./objects.client'), PART = require('./card.client');
const SRV = require('./card.server');
const LC = require('./card.lang.json');
const lopt = f => { try { return require(f); } catch (e) { return {}; } };
const L = H.mergeLang([require('./shell.lang.json'), require('./objects.lang.json'), lopt('./layers.lang.json'), LC]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz card: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const en = k => (L.en[k] == null ? k : L.en[k]);
const enw = (k, fb) => (L.en[k] == null ? fb : L.en[k]);
const clone = x => JSON.parse(JSON.stringify(x));
const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip: ' + what + ' is not built'); return null; } throw e; } };

// ---------- the fixture: objects items and the catalogue ----------
const VOL = [{ name: 'body', able: { bullet: true, visible: true, obstacle: true, contact: true, contact_ground: true } }];
const PLANTED_CAT = { v: 1, target: 'mowas2', stackHash: 'x', failed: [{ def: 'flag_point_1', code: 'ENTCAT_DEF_MISSING', msg: 'no entity def named flag_point_1' }], entries: {
  fx_wall: { def: 'fx_wall', path: 'resource/entity/fx/fx_wall.def', mdl: 'resource/entity/fx/fx_wall.mdl', category: 'wall', height: 24, volumes: VOL, props: ['construction', 'wall'],
    cover: { hard: true, band: 'kneel', top: 24, conceal: false }, sight: { enters: true, hard: true }, obstacleId: 'small_building', crushBy: { tank: null, tankLight: null, armored: null, car: null }, vaultable: null, notes: [] },
  fx_bush: { def: 'fx_bush', path: 'resource/entity/fx/fx_bush.def', category: 'bush', height: 30, volumes: [], cover: { hard: false, band: 'none', top: 0, conceal: true }, sight: { enters: true, hard: false }, obstacleId: 'nothing', crushBy: { tank: 0, tankLight: 0, armored: 0, car: -1 }, vaultable: null, notes: [] },
  fx_house: { def: 'fx_house', path: 'resource/entity/fx/fx_house.def', category: 'building', height: 120, volumes: VOL, cover: { hard: true, band: 'stand', top: 120, conceal: false }, sight: { enters: true, hard: true }, obstacleId: 'building', crushBy: { tank: -1, tankLight: -1, armored: -1, car: -1 }, vaultable: null, notes: [] },
  fx_tree: { def: 'fx_tree', path: 'resource/entity/fx/fx_tree.def', category: 'tree', height: 200, volumes: [], cover: { hard: true, band: 'stand', top: 40, conceal: false }, sight: { enters: true, hard: true }, obstacleId: 'tree', crushBy: { tank: 0, tankLight: null, armored: null, car: null }, vaultable: null, notes: [] },
  fx_road: { def: 'fx_road', path: 'resource/entity/fx/fx_road.def', category: 'road_decal', height: 0, volumes: [], cover: { hard: false, band: 'none', top: 0, conceal: false }, sight: { enters: false, hard: false }, obstacleId: 'nothing', crushBy: null, vaultable: null, notes: [] } } };
const PLANTED_ITEMS = [
  { kind: 'object', uid: 't1', def: 'fx_tree', category: 'tree', fp: { kind: 'obb', pts: [[-406, 294], [-394, 294], [-394, 306], [-406, 306]] } },
  { kind: 'object', uid: 'w1', def: 'fx_wall', category: 'wall', fp: { kind: 'obb', pts: [[103, -140], [103, -60], [97, -60], [97, -140]] } },
  { kind: 'object', uid: 'h1', def: 'fx_house', category: 'building', fp: { kind: 'obb', pts: [[-490, -392], [-350, -312], [-380, -260], [-520, -340]] } },
  { kind: 'object', uid: 'b1', def: 'fx_bush', category: 'bush', fp: { kind: 'box-proj', pts: [[130, 280], [170, 280], [170, 320], [130, 320]] } },
  { kind: 'object', uid: 'p1', def: 'flag_point_1', category: 'other', fp: { kind: 'none', pts: [[0, 0]] } },
];
const FX = {};
function fixture(form) {
  if (FX[form]) return FX[form];
  const E = opt(() => require(path.join(ROOT, 'entcat')), 'entcat');
  const K = E && opt(() => require(path.join(ROOT, 'lib/mapkit')), 'mapkit');
  const fx = E && opt(() => require(path.join(ROOT, 'test/fxmake')), 'the fixture maker');
  if (!E || !K || !fx) return (FX[form] = { items: clone(PLANTED_ITEMS), cat: clone(PLANTED_CAT), real: false });
  const f = fx.make(path.join(SCR, 'fx-' + form), { form });
  const src = K.source({ target: f.target, game: f.gameDir }), doc = K.doc(src, f.map, {});
  const mode = doc.modes && doc.modes[0] && doc.modes[0].id;
  const sub = E.docForMode(doc, mode), links = E.linksFor(src, f.map, sub, { mode });
  const cat = clone(E.forDoc(src, sub, { loader: E.loaderFor(src), links }));
  const items = E.place(sub, cat, links).map(x => Object.assign({ kind: 'object' }, x));
  return (FX[form] = { items, cat, real: true });
}
let dirN = 0;
function catDir(cat) { const d = path.join(SCR, 'entry' + (dirN++)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'entcat.json'), JSON.stringify(cat)); return d; }
// the stubbed cache: open(key) gives the entry folder of the current catalogue, or null when not made
const CS = { keys: [], hit: null, made: 1 };
const cacheStub = { entryKey(r) { CS.keys.push(r); return 'k' + CS.keys.length; }, open() { return CS.hit ? { dir: CS.hit, manifest: { made: CS.made } } : null; } };
const ROUTE = SRV.routes['GET /api/x/mapviz/card'];
function get(q) { const u = new URL('http://127.0.0.1/api/x/mapviz/card'); for (const k of Object.keys(q)) if (q[k] != null) u.searchParams.set(k, q[k]); return ROUTE(u, null, {}); }
async function err(p) { try { await p; return null; } catch (e) { return e; } }

// ---------- the parts on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make();
  const X = {};
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', 'INGAME', [SHELL, OBJ, PART].join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), o.S || {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined, o.ingame);
  return { X, doc, parts: X.mapviz.parts };
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], says: [], boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'tank', rmt: false, game: '<game>', mod: '', jobs: [] }, o.q || {});
  const items = o.items;
  const V = {
    q: n => q[n], pal: PAL, view: { cx: 0, cy: 0, zoom: 1 },
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() {}, relist() {}, token: n => 'var-' + n, say(k) { rec.says.push(k); },
    api(m, p, b) { rec.calls.push({ m, p, b: clone(b || {}) });
      if (p === 'layer') return Promise.resolve({ v: 1, kind: 'vector', name: 'objects', items: clone(items), pal: 'objects', palette: PAL.objects });
      if (p === 'card') { if (rec.failCard > 0) { rec.failCard--; return Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'busy' } })); } return get(Object.assign(commons(), b)); }
      return Promise.reject(new Error('no route')); },
    // the shell adds the page fields to a card GET (shell QCOM card:1, ALLC); the part sends only def
    job(w, a) { rec.calls.push({ job: w, a }); return new Promise(() => {}); },
  };
  function commons() { return { target: q.target, game: q.game, mods: q.mods, modDir: q.mod, map: q.map, mode: q.mode, side: q.side, kind: q.kind }; }
  rec.V = V; rec.q = q;
  return rec;
}
async function start(o) {
  const L0 = load(o), R = stubV(L0, o);
  for (const p of L0.parts) if (p.id === 'objects' || p.id === 'card') p.init(R.V);
  R.MV = L0.X.mapviz; R.S0 = R.MV.objects.of(R.V); R.box = R.boxes.card;
  R.V.emit('map', {}); await H.flush();
  R.click = async (x, y) => { R.V.emit('cursor', { x, y, px: 0, py: 0, click: true }); await H.flush(); };
  R.rows = () => { const b = H.blk(R.box, 'mv.card.rows'); return b ? b.all().filter(e => /^mv\.card\.r\./.test(e.attrs['data-blk'] || '')).map(e => [e.attrs['data-blk'].slice(10), e.children[1] ? e.children[1].textContent : '']) : []; };
  R.row = id => { const r = R.rows().find(x => x[0] === id); return r ? r[1] : null; };
  R.btns = () => R.box.all().filter(e => e.tagName === 'BUTTON');
  R.status = () => H.blk(R.box, 'mv.card.status').textContent;
  return R;
}
const BAND = id => enw('mapviz.layers.band.' + id, id);

(async () => {
  // ================= server =================
  SRV._t.use({ cache: cacheStub });
  const FA = fixture('as2'), FG = fixture('goh');
  CS.hit = catDir(FA.cat);
  { const a = await get({ target: 'mowas2', game: '<game>', map: 'multi/mv_fixture', mode: 'battle_zones', def: 'fx_wall' });
    const e = a.entry;
    ok(a.kind === 'card' && a.def === 'fx_wall' && a.target === 'mowas2' && e && e.category === 'wall' && e.height === 24, 'server: the wall entry', a);
    ok(a.mode === 'battle_zones' && Object.keys(a).join() === 'v,kind,target,map,mode,def,entry', 'server: the answer carries mode (page-pg2 6.3)', Object.keys(a));
    const k0 = CS.keys[CS.keys.length - 1];
    const nm = await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' });
    ok(nm.mode === null, 'server: no mode in the request gives mode null', nm.mode);
    CS.keys.push(k0);
    ok(e.cover && e.cover.hard === true && e.cover.band === 'kneel' && e.cover.top === 24 && e.cover.conceal === false && e.obstacleId === 'small_building', 'server: the wall cover and obstacle id', e && e.cover);
    ok(e.path === 'resource/entity/fx/fx_wall.def' && e.mdl === 'resource/entity/fx/fx_wall.mdl' && !('props' in e), 'server: the paths, props left out');
    ok(e.volumes && e.volumes.n === 1 && e.volumes.able.bullet === 1 && e.volumes.able.obstacle === 1, 'server: the volumes counted per able key', e.volumes);
    const k = CS.keys[CS.keys.length - 1];
    ok(k && k.what === 'entcat' && k.row && k.row.part === 'entcat' && k.target === 'mowas2' && k.map === 'multi/mv_fixture' && k.mode === 'battle_zones' && k.game === '<game>' && !('def' in k), 'server: the entry key from table.JOBS.entcat with mode, without def', k);
    const b = (await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_bush' })).entry;
    ok(b.cover.conceal === true && b.cover.band === 'none' && b.obstacleId === 'nothing' && b.sight && b.sight.enters === true && b.sight.hard === false, 'server: the bush hides, stops nothing, see-through', b);
    const hz = (await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_house' })).entry;
    ok(hz.category === 'building' && hz.cover.band === 'stand' && hz.sight.hard === true, 'server: the house', hz && hz.cover);
    const ex = await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall', side: 'axis', kind: 'tank', size: '256' });
    ok(ex.entry && ex.entry.def === 'fx_wall', 'server: the shell common fields are taken and not used');
    const f = await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'flag_point_1' });
    ok(f.entry === null && f.failed && f.failed.code === 'ENTCAT_DEF_MISSING', 'server: a failed def gives entry null and the failure code', f); }
  // seeded server faults
  { const bads = ['../x', 'a/../b', 'a\\..\\b', 'x'.repeat(201), 'a\u0001b', 'a\nb', 'a\u007fb'];
    for (const tg of ['as64', 'mowas2', 'goh']) for (const d of bads) { const e = await err(get({ target: tg, map: 'multi/mv_fixture', def: d })); ok(e && e.status === 400 && e.key === 'mapviz.err.MV_USAGE', tg + ': seeded: def ' + JSON.stringify(d.slice(0, 12)) + ' is refused (400)', e && e.message); }
    // vanilla names hold #, (, ) and spaces (MoW:AS2 maps place #stone01, burn_grass1#1; the data has lci(l), plates 2;
    // GoH has #fish, distant explosion): taken as keys; found when the catalogue has them, else 404 without need
    { const keep0 = CS.hit, c2 = clone(FA.cat), names = ['#stone01', 'lci(l)', 'burn_grass1#1', 'plates 2'];
      for (const n of names) c2.entries[n] = Object.assign({}, c2.entries.fx_wall, { def: n });
      CS.hit = catDir(c2);
      for (const tg of ['as64', 'mowas2', 'goh']) for (const n of names) { let a; try { a = await get({ target: tg, map: 'multi/mv_fixture', def: n }); } catch (e) { a = e.message + ' ' + (e.params && e.params.msg); }
        ok(a && a.entry && a.entry.def === n && a.target === tg, tg + ': server: the vanilla name ' + n + ' gives its entry', a); }
      for (const n of ['#fish', 'distant explosion']) { const e = await err(get({ target: 'goh', map: 'multi/mv_fixture', def: n })); ok(e && e.status === 404 && !e.params.need, 'server: ' + n + ' not in the list: 404 without need, not 400', e && e.status); }
      const up = await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'Fx_Wall' });
      ok(up.entry && up.entry.def === 'fx_wall' && up.def === 'Fx_Wall', 'server: a def in another case finds the lower-case key', up.def);
      CS.hit = keep0; }
    let e = await err(get({ target: 'mowas2', map: 'multi/mv_fixture' })); ok(e && e.status === 400, 'seeded: no def (400)');
    e = await err(get({ map: 'multi/mv_fixture', def: 'fx_wall' })); ok(e && e.status === 400, 'seeded: no target (400)');
    e = await err(get({ target: 'aow', map: 'multi/mv_fixture', def: 'fx_wall' })); ok(e && e.status === 400, 'seeded: an unknown target (400)');
    e = await err(get({ target: 'mowas2', def: 'fx_wall' })); ok(e && e.status === 400, 'seeded: no map (400)');
    e = await err(get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall', zoom: '2' })); ok(e && e.status === 400 && /unknown argument zoom/.test(e.params.msg), 'seeded: an unknown argument (400)');
    e = await err(get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_nothere' }));
    ok(e && e.status === 404 && e.key === 'mapviz.err.MV_NOT_FOUND' && !e.params.need, 'seeded: a def not in the catalogue: 404 without need', e && e.params);
    const keep = CS.hit; CS.hit = null;
    e = await err(get({ target: 'goh', game: '<game>', map: 'multi/mv_fixture', mode: 'frontlines', def: 'fx_wall' }));
    ok(e && e.status === 404 && e.params.need && e.params.need.what === 'entcat' && e.params.need.args.map === 'multi/mv_fixture' && e.params.need.args.mode === 'frontlines' && !('target' in e.params.need.args) && !('game' in e.params.need.args),
      'seeded: not made: 404 with need entcat {map, mode}', e && e.params);
    CS.hit = path.join(SCR, 'broken'); fs.mkdirSync(CS.hit, { recursive: true }); fs.writeFileSync(path.join(CS.hit, 'entcat.json'), '{"entries":');
    e = await err(get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' })); ok(e && e.status === 500 && e.key === 'mapviz.err.MV_FAULT', 'seeded: broken JSON (500)');
    CS.hit = catDir({ v: 1, entries: [] }); e = await err(get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' })); ok(e && e.status === 500, 'seeded: entries not an object (500)');
    // memo: the same entry folder is read once; at most two kept
    SRV._t.use({ cache: cacheStub }); CS.hit = keep;
    await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' });
    fs.writeFileSync(path.join(keep, 'entcat.json'), '{"entries":');
    const again = await err(get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' }));
    ok(again === null, 'memo: a second click does not read the file again');
    fs.writeFileSync(path.join(keep, 'entcat.json'), JSON.stringify(FA.cat));
    for (const c of [FA.cat, FG.cat, FA.cat]) { CS.hit = catDir(c); await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' }); }
    ok(SRV._t.memo().length === 2, 'memo: at most two catalogues kept', SRV._t.memo());
    CS.made = 2; CS.hit = keep; await get({ target: 'mowas2', map: 'multi/mv_fixture', def: 'fx_wall' });
    ok(SRV._t.memo()[0].made === 2, 'memo: a newer manifest is read again'); CS.made = 1; }

  // ================= the page =================
  for (const target of ['mowas2', 'as64', 'goh']) {
    const F = target === 'goh' ? FG : FA, T = target + ': ';
    CS.hit = catDir(F.cat);
    const A = await start({ q: { target }, items: F.items });
    ok(A.panels.some(p => p.id === 'card') && A.box.has(en('mapviz.card.hint')), T + 'the card panel with its hint');
    ok(!A.calls.some(c => c.p === 'card'), T + 'no card read before a click');
    await A.click(100, -100); await H.flush();
    const cq = A.calls.filter(c => c.p === 'card');
    ok(cq.length === 1 && Object.keys(cq[0].b).join() === 'def' && cq[0].b.def === 'fx_wall', T + 'a click on the wall reads its card with def only (the shell adds target, map and mode)', cq);
    ok(((A.MV._t && A.MV._t.QCOM) || {}).card === 1, T + 'the shell QCOM adds the page fields to card');
    ok(A.row('def') === 'fx_wall' && A.row('cat') === en('mapviz.objects.cat.wall') && A.row('file') === 'resource/entity/fx/fx_wall.def', T + 'rows: name, kind, file', A.rows());
    ok(A.row('height') === '1.2 m', T + 'row: height 24 u is 1.2 m', A.row('height'));
    ok(A.row('cover') === [BAND('kneel'), 'top at 1.2 m', en('mapviz.card.hard')].join('; '), T + 'row: cover band, top, stops bullets', A.row('cover'));
    ok(A.row('conceal') === 'no', T + 'row: the wall does not hide soldiers', A.row('conceal'));
    ok(A.row('crush') === 'tank: unknown, light tank: unknown, armoured car: unknown, car: unknown', T + 'row: crushable unknown when crushBy is null', A.row('crush'));
    ok(A.row('obst') === 'small_building' && A.row('vault') === null && A.row('gohcover') === null, T + 'rows: obstacle id; no vault row, no sandbag row', A.rows());
    ok(A.S0.sel === String(A.S0.at(100, -100, 1)[0].uid), T + 'the opened object is selected on the map');
    const wallRows = JSON.stringify(A.rows().filter(r => r[0] !== 'file'));
    if (target === 'mowas2') FX.wallRows = wallRows; else ok(wallRows === FX.wallRows, T + 'the wall card has the same rows as on mowas2', [wallRows, FX.wallRows]);
    // bush and house
    await A.click(140, 290); await H.flush();
    ok(A.row('def') === 'fx_bush' && A.row('conceal') === en('mapviz.card.concealYes') && A.row('obst') === en('mapviz.card.none') && A.row('sight') === en('mapviz.card.sightSoft'), T + 'the bush: hides but stops no bullet, see-through, no obstacle', A.rows());
    const hu = A.S0.items.find(i => i.def === 'fx_house');
    await A.click(hu.x, hu.y); await H.flush();
    ok(A.row('def') === 'fx_house' && A.row('cat') === en('mapviz.objects.cat.building') && A.row('sight') === en('mapviz.card.sightHard') && A.row('cover').indexOf(BAND('stand')) === 0, T + 'the house: building, blocks sight, stand cover', A.rows());
    // failed def (a map point without a def)
    await A.click(0, 0); await H.flush();
    ok(A.row('def') === 'flag_point_1' && A.row('failed') === en('mapviz.card.note.ENTCAT_DEF_MISSING') && A.status() === en('mapviz.card.failedNote'), T + 'a def that could not be read: its failure code', A.rows());
    // nothing at an empty spot
    await A.click(0, -300);
    ok(A.status() === en('mapviz.card.nothing') && A.rows().length === 0 && A.S0.sel === null, T + 'an empty spot: nothing to show, selection cleared', A.status());
    // a tool takes the click
    A.q.tool = 'measure'; A.V.emit('tool', { id: 'measure' }); const n0 = A.calls.length; await A.click(100, -100);
    ok(A.calls.length === n0 && A.status() === en('mapviz.card.nothing'), T + 'a tool in use: the click opens no card');
    A.q.tool = null; A.V.emit('tool', { id: null });
    { A.V.emit('tool', { id: 'measure' }); await A.click(100, -100); await H.flush();
      ok(A.row('def') === 'fx_wall', T + 'the tool comes from V.q(tool): a tool event alone does not take the click', A.rows()); A.V.emit('tool', { id: null }); await A.click(0, -300); }
    // late G8: a click whose hit is another part's (strong, checks) opens no card; layers and objects hits do
    for (const part of ['strong', 'checks']) {
      const n1 = A.calls.length; A.V.emit('cursor', { x: 100, y: -100, click: true, hit: [{ part, layer: part + '.x', label: 'a', value: 'b' }] }); await H.flush();
      ok(A.calls.length === n1 && A.status() === en('mapviz.card.nothing') && A.rows().length === 0, T + 'a click on a ' + part + ' hit opens no card and leaves the card as it was', A.rows()); }
    A.V.emit('cursor', { x: 100, y: -100, click: true, hit: { part: 'checks' } }); await H.flush();
    ok(A.rows().length === 0, T + 'a single hit object of another part opens no card');
    for (const part of ['objects', 'layers']) {
      A.V.emit('cursor', { x: 100, y: -100, click: true, hit: [{ part, label: 'a', value: 'b' }] }); await H.flush();
      ok(A.row('def') === 'fx_wall', T + 'a click on a ' + part + ' hit opens the card', A.rows());
      await A.click(0, -300); }
    // a failed card read: the next click on the same object asks once more; so does a products event
    { const n1 = A.calls.filter(c => c.p === 'card').length; A.V.emit('map', {}); await H.flush(); A.failCard = 1;
      await A.click(100, -100); await H.flush();
      ok(/busy/.test(A.status()), T + 'a failed card read shows the fault', A.status());
      await A.click(100, -100); await H.flush();
      ok(A.row('obst') === 'small_building' && A.calls.filter(c => c.p === 'card').length === n1 + 2, T + 'the next click on the same object reads again and shows it', A.rows());
      A.V.emit('map', {}); await H.flush(); A.failCard = 1; await A.click(100, -100); await H.flush();
      A.V.emit('products', {}); await H.flush(); await H.flush();
      ok(A.row('obst') === 'small_building' && A.calls.filter(c => c.p === 'card').length === n1 + 4, T + 'a products event after a failed read reads once more', A.rows());
      A.V.emit('products', {}); await H.flush();
      ok(A.calls.filter(c => c.p === 'card').length === n1 + 4, T + 'a ready card is not read again on products'); }
    // pick from the find list
    A.S0.pick(A.S0.items.find(i => i.def === 'fx_tree')); await H.flush();
    ok(A.row('def') === 'fx_tree', T + 'an object picked in the find list opens its card', A.rows());
    // a cover edge first, then the object; Show the object
    const wall = A.S0.at(100, -100, 1)[0];
    A.MV.picks.push({ id: 'cover', at: () => [{ type: 'coverEdge', item: { kind: 'coverEdge', uid: wall.uid, def: 'fx_wall', a: [100, -140], b: [100, -60], lenM: 4, band: 3, topM: 1.2, side: 1, hard: true } }] });
    await A.click(100, -100);
    const pb = H.blk(A.box, 'mv.card.picks').all().filter(e => e.tagName === 'BUTTON');
    ok(pb.length === 2 && pb[0].attrs['aria-pressed'] === 'true', T + 'two picks here, the cover line first', pb.map(b => b.textContent));
    ok(A.row('len') === '4.0 m' && A.row('band') === BAND('kneel') && A.row('side') === en('mapviz.card.dir.w') && A.row('top') === '1.2 m', T + 'cover line rows: length, band, top, protected side west', A.rows());
    const so = A.btns().find(b => b.textContent === en('mapviz.card.showObject'));
    ok(so, T + 'the cover line card has Show the object');
    so.fire('click'); await H.flush();
    ok(A.row('obst') === 'small_building', T + 'Show the object opens the wall card', A.rows());
    pb[0].fire('click');
    A.MV.picks.pop();
    // a cover point
    A.MV.picks.push({ id: 'cover', at: () => [{ type: 'coverPoint', item: { kind: 'coverPoint', x: 0, y: -300, type: 3, band: 2, uid: null, wall: false, row: 0, look: 'left' } }] });
    await A.click(0, -300);
    ok(A.row('type') === enw('mapviz.layers.ctype.3', '3') && A.row('band') === BAND('low') && A.row('look') === en('mapviz.card.look.left') && !A.btns().some(b => b.textContent === en('mapviz.card.showObject')),
      T + 'cover point rows: kind, band, look; no object to show', A.rows());
    A.MV.picks.pop();
    // a map event empties the card
    A.V.emit('map', {}); await H.flush();
    ok(A.rows().length === 0 && A.status() === en('mapviz.card.hint'), T + 'a map event empties the card');
    // a def not in the list
    const G = await start({ q: { target }, items: F.items.concat([{ kind: 'object', uid: 'g1', def: 'fx_ghost', category: 'other', fp: { kind: 'obb', pts: [[300, -300], [320, -300], [320, -280], [300, -280]] } }]) });
    await G.click(310, -290); await H.flush();
    ok(G.status() === 'fx_ghost is not in the object list.', T + 'a def not in the list says so', G.status());
  }

  // ---- not made: Make, job words ----
  { const keep = CS.hit; CS.hit = null;
    const A = await start({ items: FA.items });
    await A.click(100, -100); await H.flush();
    const mk = A.btns().filter(b => b.textContent === en('mapviz.card.make'));
    ok(A.status().indexOf(en('mapviz.card.notMade')) === 0 && mk.length === 1 && !A.calls.some(c => c.job), 'not made: the line and one Make button, no job yet', A.status());
    mk[0].fire('click');
    const jc = A.calls.filter(c => c.job);
    ok(jc.length === 1 && jc[0].job === 'entcat' && jc[0].a.map === 'multi/mv_fixture' && jc[0].a.mode === 'battle_zones', 'Make: one entcat job with map and mode', jc);
    ok(A.status() === en('mapviz.card.making'), 'while making: the making line, no button', A.status());
    const B = await start({ items: FA.items, q: { jobs: [{ what: 'entcat', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones' }, text: 'Objects 50%' }] } });
    await B.click(100, -100); await H.flush();
    ok(B.status() === 'Making the object list: Objects 50%' && !B.btns().some(b => b.textContent === en('mapviz.card.make')), 'a fitting job runs: its words, no Make button', B.status());
    CS.hit = keep; B.q.jobs = []; B.V.emit('products', {}); await H.flush(); await H.flush();
    ok(B.row('obst') === 'small_building', 'products after the job: the card reads again and shows the wall', B.rows()); }

  // ---- planted: vault row, Gates of Hell sandbag row ----
  { const cat = clone(FA.cat);
    cat.entries.fx_wall = Object.assign({}, cat.entries.fx_wall, { vaultable: true });
    cat.entries.fx_bag = Object.assign({}, cat.entries.fx_wall, { def: 'fx_bag', obstacleId: 'nothing', vaultable: null, cover: { hard: true, band: 'low', top: 16, conceal: false },
      enterable: { places: 4, ports: [1, 2] }, structure: { parts: [1, 2, 3] }, crushBy: { tank: 0, tankLight: 0, armored: -1, car: -1 }, notes: [{ code: 'ENTCAT_VOLUME_NOT_BUILT', msg: 'x' }, { code: 'ENTCAT_NEW_CODE', msg: 'y' }] });
    CS.hit = catDir(cat);
    const items = FA.items.concat([{ kind: 'object', uid: 'bag1', def: 'fx_bag', category: 'emplacement', fp: { kind: 'obb', pts: [[300, -300], [320, -300], [320, -280], [300, -280]] } }]);
    const A = await start({ q: { target: 'goh' }, items });
    await A.click(100, -100); await H.flush();
    ok(A.row('vault') === en('mapviz.card.vaultYes'), 'planted: vaultable true gives the vault row', A.rows());
    await A.click(310, -290); await H.flush();
    ok(A.row('gohcover') === en('mapviz.card.notChecked') && A.row('obst') === en('mapviz.card.none'), 'Gates of Hell: hard cover with obstacle id nothing says not checked yet', A.rows());
    ok(A.row('enter') === '4 places, 2 firing places' && A.row('parts') === '3', 'planted: places inside and parts', A.rows());
    ok(A.row('crush') === 'tank: yes, light tank: yes, armoured car: no, car: no', 'planted: crushable yes and no', A.row('crush'));
    ok(A.row('notes') === en('mapviz.card.note.ENTCAT_VOLUME_NOT_BUILT') + '; ENTCAT_NEW_CODE', 'notes: known codes in words, a new code as it is', A.row('notes'));
    const B = await start({ q: { target: 'mowas2' }, items });
    await B.click(310, -290); await H.flush();
    ok(B.row('gohcover') === null, 'MoW:AS2: no sandbag row (the obstacle id rule is Gates of Hell only)'); }

  // ---- Show the object: a structure part sharing its root's uid (README 1.7) opens the part named by the edge ----
  { CS.hit = catDir(FA.cat);
    const items = [{ kind: 'object', uid: 'r1', def: 'fx_wall', category: 'wall', fp: { kind: 'obb', pts: [[300, -300], [320, -300], [320, -280], [300, -280]] } },
      { kind: 'object', uid: 'r1', def: 'fx_house', category: 'building', fp: { kind: 'obb', pts: [[330, -300], [350, -300], [350, -280], [330, -280]] } }];
    for (const target of ['mowas2', 'as64', 'goh']) {
      const A = await start({ q: { target }, items });
      A.MV.picks.push({ id: 'cover', at: () => [{ type: 'coverEdge', item: { kind: 'coverEdge', uid: 'r1', def: 'fx_house', a: [0, 500], b: [10, 500], lenM: 0.5, band: 5, side: 1 } }] });
      await A.click(0, 500);
      const so = A.btns().find(b => b.textContent === en('mapviz.card.showObject'));
      so.fire('click'); await H.flush();
      ok(A.row('def') === 'fx_house', target + ': Show the object opens the part of that uid and def, not the root', A.rows());
      A.MV.picks.pop(); } }

  // ---- Editor and Models buttons: only where the page is built and listed for the current game ----
  { CS.hit = catDir(FA.cat);
    const A = await start({ items: FA.items });
    await A.click(100, -100); await H.flush();
    ok(!A.btns().some(b => b.textContent === en('mapviz.card.editor') || b.textContent === en('mapviz.card.models')), 'no Editor and no Models button where those pages are not');
    const opened = [];
    globalThis.as2Link = k => { opened.push(['ed', k]); return true; };
    globalThis.VIEW = { modelGo: (r, n) => { opened.push(['mo', r, n]); return true; } };
    const SS = { sec: { ide: true, models: true, mapviz: true }, screens: { models: true } };
    // groups.js: Editor and Models are in the AS64 group only; MoW:AS2 and Gates of Hell list the Map Viewer without them
    for (const target of ['mowas2', 'goh']) {
      const N = await start({ q: { target }, items: FA.items, S: SS, ingame: { mapviz: 1, check: 1 } });
      await N.click(100, -100); await H.flush();
      ok(N.row('def') === 'fx_wall' && !N.btns().some(b => b.textContent === en('mapviz.card.editor') || b.textContent === en('mapviz.card.models')), target + ': no Editor and no Models button (those pages are not in this game)', N.btns().map(b => b.textContent)); }
    ok(!opened.length, 'no page opened from another game');
    const B = await start({ q: { target: 'as64' }, items: FA.items, S: SS, ingame: { mapviz: 1, ide: 1, models: 1 } });
    await B.click(100, -100); await H.flush();
    const ed = B.btns().find(b => b.textContent === en('mapviz.card.editor')), mo = B.btns().find(b => b.textContent === en('mapviz.card.models'));
    ok(ed && mo, 'Editor and Models buttons where those pages are', B.btns().map(b => b.textContent));
    ed.fire('click'); mo.fire('click');
    ok(opened[0][1] === 'key:resource/entity/fx/fx_wall.def' && opened[1][1].key === 'resource/entity/fx/fx_wall.mdl' && opened[1][2] === 'fx_wall', 'Open in Editor gives the def key; Open in Models the model file', opened);
    globalThis.as2Link = () => false; ed.fire('click');
    ok(B.says.indexOf('mapviz.card.noPage') >= 0, 'a page that cannot open the file says so');
    delete globalThis.as2Link; delete globalThis.VIEW; }

  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true }, items: [] });
    for (const p of L0.parts) if (p.id === 'objects' || p.id === 'card') p.init(R.V);
    ok(R.panels.length === 0 && R.calls.length === 0, 'RMT: no panel, no call'); }

  // ---- order and side words (pure) ----
  { const L0 = load(), C = L0.X.mapviz.card;
    const o = C.order([{ type: 'object', item: { a: 1 } }, { type: 'x', item: {} }, { type: 'coverPoint', item: {} }, { type: 'object', item: { a: 2 } }, { type: 'coverEdge', item: {} }, { type: 'object', item: { a: 3 } }]);
    ok(o.length === 4 && o[0].type === 'coverPoint' && o[1].type === 'coverEdge' && o[2].item.a === 1 && o[3].item.a === 2, 'order: cover first, then objects, at most 4', o.map(p => p.type));
    ok(C.dirOf([0, 0], [10, 0], 1) === 'n' && C.dirOf([0, 0], [10, 0], -1) === 's' && C.dirOf([0, 0], [0, 10], -1) === 'e' && C.dirOf([0, 0], [10, 10], 1) === 'nw' && C.dirOf([0, 0], [0, 0], 1) === null, 'protected side words'); }

  // ---- language ----
  { const SRC = String(PART), used = new Set(), codes = ['en', 'ru', 'uk', 'zh'];
    for (const m of SRC.matchAll(/'(mapviz\.card\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    const L0 = load(), C = L0.X.mapviz.card;
    for (const d of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) used.add('mapviz.card.dir.' + d);
    for (const d of ['none', 'left', 'right', 'two']) used.add('mapviz.card.look.' + d);
    for (const d of ['tank', 'tankLight', 'armored', 'car']) used.add('mapviz.card.crush.' + d);
    for (const n of C.NOTES) used.add('mapviz.card.note.' + n);
    ok(Object.keys(LC).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LC[c] && LC[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LC.en).filter(k => !used.has(k));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LC[c])) { const v = LC[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (slots(v) !== slots(LC.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LC.en)) bad.push(c + ' extra ' + k); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
    const E = require(path.join(ROOT, 'entcat')), codesE = new Set();
    // every code file of entcat (index.js, defread.js notes, links.js ENTCAT_LINK_NESTED, ...), not its tests
    const EDIR = path.dirname(require.resolve(path.join(ROOT, 'entcat'))), efiles = fs.readdirSync(EDIR).filter(n => /\.js$/.test(n));
    ok(['index.js', 'defread.js', 'links.js'].every(n => efiles.indexOf(n) >= 0), 'lang: the entcat code scan reads index.js, defread.js and links.js', efiles);
    for (const n of efiles) for (const m of fs.readFileSync(path.join(EDIR, n), 'utf8').matchAll(/'(ENTCAT_[A-Z_]+)'/g)) codesE.add(m[1]);
    ok(['ENTCAT_EXT_MISSING', 'ENTCAT_INCLUDE_MISSING', 'ENTCAT_LINK_NESTED'].every(c => codesE.has(c) && C.NOTES.indexOf(c) >= 0), 'lang: the defread and links note codes have words', [...codesE].join());
    const noWord = [...codesE].filter(c => C.NOTES.indexOf(c) < 0);
    ok(!noWord.length || !E, 'every entcat code has words on the card', noWord.join(', '));
    CS.hit = catDir(FA.cat);
    const zh = await start({ code: 'zh', items: FA.items });
    ok(zh.box.has(LC.zh['mapviz.card.title']) && zh.box.has(LC.zh['mapviz.card.hint']), 'lang: the card speaks Chinese'); }
  { const SRC = String(PART);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const');
    ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]/.test(SRC), 'no drive path in the part'); }

  SRV._t.reset();
  if (failN) { console.log('FAIL mapviz card: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz card (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz card: ' + (e && e.stack || e)); process.exit(1); });
