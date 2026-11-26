// Map Viewer map list test (MV-PG1): node tools/gui/ext/mapviz/sub/list.test.js [scratch dir]
// The list part on the shell in the fake DOM (harness from shell.test.js): one-line rows (the name without its folder, the full
// key as title, a quiet mod tag), folds (multiplayer by player size read from the name, single player folded), search,
// choosing a map and a mode, recent maps per game and mod (pruned), rows drawn in chunks that reach every map, arrow keys,
// the 'picker' event (and none), empty and failure states in words with the next step; the map list not read yet (refresh
// reads only; the button runs the maps job), a failed read, RMT, no target, thumbnails only when the list gives picture data;
// then the list on the real routes and the fixture map (ARSENAL_CACHE inside the scratch dir); the language file both ways.
// Author: Imperator_Aug (ARSENAL, ia-44c42df2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-list-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const FAKE = require('../../../test/fakedom');
const SHELL = require('./shell.client'), LIST = require('./list.client');
const L = H.mergeLang([require('./shell.lang.json'), require('./list.lang.json')]), LL = require('./list.lang.json');
const PAL = require('../../../../mapviz/palette.json');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz list: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const notFound = need => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need } });
// page.js LS (as2gui. is added by the page; the test keeps the bare names)
global.LS = { m: {}, get(k, d) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };
const RK = 'maps.viewer.recent';
const MAPS = [
  { key: 'multi/alpha', group: 'multi', source: 'pak', container: '<game>', mod: null, modes: ['battle_zones', 'combat'], files: [], pictures: ['preview', 'minimap'] },
  { key: 'multi/bravo', group: 'multi', source: 'loose', container: '<game>', mod: 'x', modes: [], files: [], pictures: [{ stem: 'preview', png: 'iVBORw0KGgo=' }] },
  { key: 'single/c1/m1', group: 'single/c1', source: 'pak', container: '<game>', mod: null, modes: [], files: [], pictures: [] },
  { key: 'test/zed', group: 'test', source: 'pak', container: '<game>', mod: null, modes: [], files: [], pictures: [] },
];
const DOC = { v: 1, key: 'multi/alpha', boxes: { world: [-100, -100, 100, 100] }, modes: [{ id: 'battle_zones', spawns: [], flags: [] }, { id: 'combat', spawns: [], flags: [] }], entities: [] };
function stubRoutes(o) {
  const st = { made: !o.need, jobs: 0 };
  const r = {
    'GET /api/x/mapviz/palette': async () => PAL,
    'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
    'GET /api/x/mapviz/maps': async () => { if (o.fault) throw Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'seeded read fault' } }); if (!st.made) throw notFound({ what: 'maps', args: {} }); return { v: 1, maps: o.maps || MAPS }; },
    'GET /api/x/mapviz/doc': async (u) => Object.assign({}, DOC, { key: u.searchParams.get('map') || DOC.key }),
    'POST /api/x/mapviz/job': async (u, b) => { st.jobs++; st.body = b; return { id: 'jm', shared: false, state: 'queued', queue: 0 }; },
    'GET /api/x/mapviz/job': async () => { st.made = true; return { id: 'jm', what: 'maps', state: 'done', stage: '', done: 1, total: 1, elapsed: 0, queue: 0 }; },
  };
  return { r, st };
}
const page = (S, routes, calls, extra) => H.mkPage(Object.assign({ scripts: [SHELL, LIST], lang: L, S, canvas: false, api: H.routeApi(routes, calls) }, extra || {}));
const buttons = root => H.blk(root, 'mv.list.maps') ? H.blk(root, 'mv.list.maps').all().filter(e => e.tagName === 'BUTTON') : [];
const rowsOf = (root, id) => { const b = H.blk(root, id || 'mv.list.maps'); return b ? b.all().filter(e => e.tagName === 'BUTTON' && e.attrs['data-mvrow'] != null) : []; };
const keys = (root, id) => rowsOf(root, id).map(b => b.attrs['data-key']);
const rowsIn = el => el.all().filter(e => e.tagName === 'BUTTON' && e.attrs['data-mvrow'] != null);
const rowOf = (root, k, id) => rowsOf(root, id).find(b => b.attrs['data-key'] === k);
// what a row shows: its spans that are not hidden, the mod tag left out
const shown = b => b.all().filter(e => e.tagName === 'SPAN' && !e.hidden && !/\bsk-tag\b/.test(e.className)).map(e => e.textContent).join('');
const tagOf = b => b.all().find(e => e.tagName === 'SPAN' && /\bsk-tag\b/.test(e.className));
const folds = root => H.blk(root, 'mv.list.maps').all().filter(e => e.tagName === 'DETAILS');
const fold = (root, id) => folds(root).find(d => d.attrs['data-fold'] === id);
const setFold = (d, on) => { d.open = on; d.fire('toggle'); };
const searchOf = root => root.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'search');
const typeIn = (root, v) => { const s = searchOf(root); s.value = v; s.fire('input'); return s; };
const panelOf = root => H.blk(root, 'mv.list.head').parentNode;
const key = (root, target, k) => panelOf(root).fire('keydown', { key: k, target });
const recent = root => keys(root, 'mv.list.recent');
// scrollIntoView calls of the fake DOM: [element, options]
const SV = []; FAKE.El.prototype.scrollIntoView = function (o) { SV.push([this, o]); };
// an IntersectionObserver stand-in: the test says when the watched row is seen
const IOS = [];
class FakeIO { constructor(cb, o) { this.cb = cb; this.o = o; this.el = null; IOS.push(this); } observe(e) { this.el = e; } unobserve() { this.el = null; } see() { if (this.el) this.cb([{ isIntersecting: true, target: this.el }]); } }

(async () => {
  // rows, folds, search, choose
  { const calls = [], { r } = stubRoutes({}), S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '' };
    const P = page(S, r, calls);
    ok(calls.length === 0, 'building the list makes no call');
    ok(!!H.blk(P.root, 'mv.list.search') && H.blk(P.root, 'mv.list.search').className.split(' ').includes('fld'), 'the search field is a field leaf');
    const head = H.blk(P.root, 'mv.list.head'), bar = H.blk(P.root, 'mv.list.bar'), rel = bar && bar.all().find(e => e.tagName === 'BUTTON');
    ok(head && bar && bar.parentNode === head && H.blk(P.root, 'mv.list.search').parentNode === head, 'the refresh button sits next to the search box (one row block)');
    ok(rel && rel.attrs['aria-label'] === en('mapviz.list.reload') && rel.attrs.title === en('mapviz.list.reloadT') && rel.textContent.length === 1, 'the refresh button is small, with the old aria-label and title', rel && rel.attrs);
    ok(H.blk(P.root, 'mv.list.modes').hidden && !H.blk(P.root, 'mv.list.modes').all().some(e => e.tagName === 'BUTTON'), 'no map open: the modes block is hidden');
    P.screen.refresh(); await H.flush();
    ok(calls.filter(c => c.path === '/api/x/mapviz/maps').length === 1 && calls.every(c => c.method === 'GET'), 'refresh reads the map list (GET only)');
    const mq = new URL(calls.find(c => c.path === '/api/x/mapviz/maps').url, 'http://x').searchParams;
    ok(mq.get('target') === 'mowas2' && mq.get('game') === '<game>' && !mq.get('map'), 'GET maps carries the page target and game, no map');
    const box = H.blk(P.root, 'mv.list.maps');
    ok(box.has(en('mapviz.list.g.multi')) && box.has(en('mapviz.list.g.single')) && box.has(en('mapviz.list.g.other')), 'multiplayer, single-player and other groups');
    ok(JSON.stringify(keys(P.root)) === '["multi/alpha","multi/bravo"]', 'multiplayer open; single player and other folded by default (rows not drawn)', keys(P.root));
    ok(fold(P.root, 'multi').open && !fold(P.root, 'single').open && !fold(P.root, 'other').open, 'fold states: multi open, single and other closed');
    ok(fold(P.root, 'multi').has('(2 maps)') && fold(P.root, 'single').has('(1 map)'), 'each fold has its count, plural form', box.textContent);
    const ra = rowOf(P.root, 'multi/alpha'), rb = rowOf(P.root, 'multi/bravo');
    ok(shown(ra) === 'alpha' && shown(rb) === 'bravo', 'a row shows the name without its folder', [shown(ra), shown(rb)]);
    ok(ra.textContent === 'multi/alpha' && ra.attrs.title.indexOf('multi/alpha') === 0, 'the full key stays the title and the button text (folder part hidden)', [ra.textContent, ra.attrs.title]);
    ok(ra.attrs.title === 'multi/alpha. Pictures: preview, minimap', 'picture names in the title', ra.attrs.title);
    ok(!!tagOf(rb) && tagOf(rb).textContent === en('mapviz.list.mod') && !tagOf(ra) && !box.has('(from the mod)'), 'a map from the mod has a small mod tag, not words', rb.textContent);
    ok(box.all().filter(e => e.tagName === 'IMG').length === 1, 'a thumbnail only where the list gives picture data');
    ok(rowsOf(P.root).every(b => /white-space:nowrap/.test(b.all().map(e => e.attrs.style || '').join(';'))), 'rows are one line (the name does not wrap)');
    setFold(fold(P.root, 'single'), true);
    ok(JSON.stringify(keys(P.root)) === '["multi/alpha","multi/bravo","single/c1/m1"]' && shown(rowOf(P.root, 'single/c1/m1')) === 'c1/m1', 'opening the single-player fold draws its rows', keys(P.root));
    setFold(fold(P.root, 'single'), false);
    const search = typeIn(P.root, 'BRA');
    ok(JSON.stringify(keys(P.root)) === '["multi/bravo"]' && folds(P.root).length === 1, 'search by name, any case: empty groups hide', keys(P.root));
    typeIn(P.root, 'c1/m');
    ok(JSON.stringify(keys(P.root)) === '["single/c1/m1"]' && fold(P.root, 'single').open, 'a search unfolds a folded group that has a match');
    typeIn(P.root, 'single/c1');
    ok(JSON.stringify(keys(P.root)) === '["single/c1/m1"]', 'the search reads the full key (folder too)');
    typeIn(P.root, 'nothing here');
    const clr = buttons(P.root).find(b => b.textContent === en('mapviz.list.clear'));
    ok(box.has(en('mapviz.list.none')) && !!clr, 'no match: told, with a Clear the search button');
    clr.click();
    ok(search.value === '' && keys(P.root).length === 2 && P.doc.activeElement === search, 'Clear the search: the box is empty and focused, the list is back');
    ok(!fold(P.root, 'single').open, 'the fold the user closed stays closed after the search');
    const got = []; P.V.on('map', d => got.push(d));
    rowOf(P.root, 'multi/alpha').click(); await H.flush();
    ok(got.length > 0 && got.every(d => d && d.key === 'multi/alpha' && d.pick === undefined && 'doc' in d) && got.some(d => d.user === true), 'choosing a map: the shell takes the pick and emits its own map form (user: true)', got.map(d => ({ key: d.key, pick: d.pick, user: d.user })));
    ok(P.V.q('map') === 'multi/alpha' && S.mapKey === 'map/multi/alpha' && P.V.doc && P.V.q('mode') === 'battle_zones', 'the shell takes the map, reads its document and first mode');
    ok(rowOf(P.root, 'multi/alpha').attrs['aria-current'] === 'true' && rowOf(P.root, 'multi/bravo').attrs['aria-current'] === undefined, 'the open map is marked aria-current');
    const modes = H.blk(P.root, 'mv.list.modes'), mb = modes.all().filter(e => e.tagName === 'BUTTON');
    ok(!modes.hidden && mb.map(b => b.textContent).join() === 'battle_zones,combat' && modes.attrs.role === 'group', 'a map open: its modes as compact buttons');
    mb[1].click(); await H.flush();
    ok(P.V.q('mode') === 'combat' && H.blk(P.root, 'mv.list.modes').all().filter(e => e.tagName === 'BUTTON')[1].attrs['aria-pressed'] === 'true', 'choosing a mode opens the map in that mode');
    ok(JSON.stringify(recent(P.root)) === '["multi/alpha"]' && JSON.stringify(global.LS.m[RK]['mowas2|<game>|']) === '["multi/alpha"]', 'the picked map is in the recent maps of this game and mod', global.LS.m[RK]);
    typeIn(P.root, 'a'); ok(H.blk(P.root, 'mv.list.recent').hidden, 'a typed search hides the recent maps'); typeIn(P.root, '');
    ok(!H.blk(P.root, 'mv.list.recent').hidden, 'the recent maps come back when the search is empty');
    // without a 'picker' event nothing scrolls by itself
    ok(!SV.some(x => x[1] && x[1].block === 'center'), 'no picker event: nothing is scrolled to');
    const n = calls.length; P.screen.refresh(); await H.flush();
    ok(calls.slice(n).filter(c => c.path === '/api/x/mapviz/maps').length === 0, 'a second refresh with the same game and mod does not read again');
    ok(calls.every(c => c.method === 'GET'), 'nothing posted without a user action');
    // the refresh button runs the maps job and reads the list again
    const n2 = calls.length;
    rel.click(); await H.until(() => calls.slice(n2).some(c => c.path === '/api/x/mapviz/maps'), 5000); await H.flush();
    ok(calls.some(c => c.method === 'POST' && c.body && c.body.what === 'maps') && keys(P.root).length === 2, 'the refresh button runs the maps job and reads the list again', calls.slice(n2).map(c => c.method + ' ' + c.path));
  }
  // player size groups from the name: 1v1, 2vs2, 3x3_, town_4v4, 10v10, names without a size; search, Enter
  { const SZ = ['multi/1v1_b', 'multi/1v1_a', 'multi/2vs2_c', 'multi/3x3_d', 'multi/town_4v4', 'multi/10v10_big', 'multi/bastogne_town', 'multi/x123v1', 'multi/v2_3', 'single/s1']
      .map(k => ({ key: k, group: k.split('/')[0], mod: null, modes: [], files: [], pictures: [] }));
    const calls = [], { r } = stubRoutes({ maps: SZ }), S = { gameId: 'as64', gameOv: '<gs>', mod: '', mapKey: '' };
    const P = page(S, r, calls); P.screen.refresh(); await H.flush();
    const ids = folds(P.root).map(d => d.attrs['data-fold']);
    ok(JSON.stringify(ids) === '["multi.1v1","multi.2v2","multi.3v3","multi.4v4","multi.10v10","multi.none","single"]', 'multiplayer folds by size, smallest first, names without a size last', ids);
    ok(JSON.stringify(rowsIn(fold(P.root, 'multi.1v1')).map(b => b.attrs['data-key'])) === '["multi/1v1_a","multi/1v1_b"]', 'rows sorted by name in a fold');
    ok(fold(P.root, 'multi.3v3').has('3v3') && fold(P.root, 'multi.2v2').has('(1 map)') && fold(P.root, 'multi.none').has(en('mapviz.list.g.nosize')), 'fold labels: 3x3_ shows as 3v3, a count each, the no-size fold named');
    ok(JSON.stringify(rowsIn(fold(P.root, 'multi.none')).map(b => b.attrs['data-key'])) === '["multi/bastogne_town","multi/v2_3","multi/x123v1"]', 'odd names (x123v1, v2_3, no digits) have no size');
    ok(H.blk(P.root, 'mv.list.maps').has(en('mapviz.list.g.multi') + ' (9 maps)'), 'a Multiplayer heading with its count over the size folds');
    ok(!fold(P.root, 'single').open && fold(P.root, 'multi.10v10').open, 'size folds open, single player folded');
    typeIn(P.root, '3x3');
    ok(JSON.stringify(folds(P.root).map(d => d.attrs['data-fold'])) === '["multi.3v3"]', 'search: only the folds with a match show');
    typeIn(P.root, 'single/s');
    ok(JSON.stringify(keys(P.root)) === '["single/s1"]' && !H.blk(P.root, 'mv.list.maps').has(en('mapviz.list.g.multi')), 'search with no multiplayer match: no Multiplayer heading', H.blk(P.root, 'mv.list.maps').textContent);
    typeIn(P.root, 'bastogne town');
    ok(JSON.stringify(keys(P.root)) === '["multi/bastogne_town"]', 'a space in the search matches an underscore in the name');
    const got = []; P.V.on('map', d => got.push(d.key));
    const s = typeIn(P.root, 'town'); s.fire('keydown', { key: 'Enter' }); await H.flush();
    ok(got[0] === 'multi/town_4v4', 'Enter in the search box opens the best match (a name that starts with the text first)', got);
    // a fold the user closed stays closed on the next draw; a closed fold drawn later fills when opened
    typeIn(P.root, ''); setFold(fold(P.root, 'multi.1v1'), false); typeIn(P.root, ' ');
    ok(!fold(P.root, 'multi.1v1').open && !keys(P.root).includes('multi/1v1_a'), 'a fold the user closed stays closed (rows not drawn)');
    setFold(fold(P.root, 'multi.1v1'), true);
    ok(keys(P.root).filter(k => /1v1/.test(k)).length === 2, 'opened again: its rows are drawn');
  }
  // chunks: 316 maps, every one reachable by scrolling alone (the watched "Show the rest" row) or by one press
  { const BIG = [];
    for (let i = 0; i < 265; i++) BIG.push({ key: 'multi/' + ['1v1_', '2v2_', '3x3_', '4v4_', ''][i % 5] + 'm' + String(i).padStart(3, '0'), group: 'multi', mod: i % 7 ? null : 'm', modes: ['combat'], files: [], pictures: [] });
    for (let i = 0; i < 51; i++) BIG.push({ key: 'single/s' + String(i).padStart(3, '0'), group: 'single', mod: null, modes: [], files: [], pictures: [] });
    global.IntersectionObserver = FakeIO;
    const calls = [], { r } = stubRoutes({ maps: BIG }), S = { gameId: 'as64', gameOv: '<gbig>', mod: '', mapKey: '' };
    const P = page(S, r, calls); P.screen.refresh(); await H.flush();
    const moreB = () => H.blk(P.root, 'mv.list.more').all().find(e => e.tagName === 'BUTTON');
    ok(rowsOf(P.root).length === 100 && !moreB().hidden && moreB().textContent === 'Show the rest (165 maps)', 'chunks: the first draw has 100 rows and a Show the rest row (open folds counted)', [rowsOf(P.root).length, moreB().textContent]);
    ok(!H.blk(P.root, 'mv.list.maps').has('Narrow the search'), 'no "narrow the search" wall');
    const io = IOS[IOS.length - 1];
    ok(!!io && io.el === moreB(), 'the Show the rest row is watched while the list scrolls');
    for (let g = 0; g < 20 && !moreB().hidden; g++) io.see();
    const k1 = keys(P.root);
    ok(k1.length === 265 && new Set(k1).size === 265 && moreB().hidden, 'scrolling alone draws every multiplayer row, each once', k1.length);
    setFold(fold(P.root, 'single'), true);
    const all = keys(P.root);
    ok(all.length === 316 && new Set(all).size === 316 && BIG.every(m => all.includes(m.key)), 'every map of the list is reachable (single player fold opened)', all.length);
    typeIn(P.root, '_m');
    ok(rowsOf(P.root).length === 100 && !moreB().hidden, 'a new search starts again at 100 rows', rowsOf(P.root).length);
    typeIn(P.root, '');
    moreB().click();
    ok(rowsOf(P.root).length === 316 && moreB().hidden, 'one press on Show the rest draws all the rest', rowsOf(P.root).length);
    // arrows: Down from the search box goes to the first row; Down on the last drawn row draws more and goes on; Up from the
    // first row goes back to the search box; rows in a closed fold are skipped
    typeIn(P.root, ''); const s = searchOf(P.root);
    s.fire('keydown', { key: 'ArrowDown' });
    const r0 = rowsOf(P.root);
    ok(P.doc.activeElement === r0[0], 'ArrowDown in the search box focuses the first row');
    key(P.root, r0[0], 'ArrowDown'); ok(P.doc.activeElement === r0[1], 'ArrowDown moves to the next row');
    key(P.root, r0[1], 'ArrowUp'); key(P.root, r0[0], 'ArrowUp'); ok(P.doc.activeElement === s, 'ArrowUp from the first row goes back to the search box');
    key(P.root, r0[99], 'ArrowDown');
    ok(rowsOf(P.root).length === 200 && P.doc.activeElement === rowsOf(P.root)[100], 'ArrowDown on the last drawn row draws the next chunk and moves into it', rowsOf(P.root).length);
    const f1 = fold(P.root, 'multi.1v1'), lastOf1 = rowsIn(f1).pop(); setFold(f1, false);
    const firstOf2 = rowsIn(fold(P.root, 'multi.2v2'))[0];
    key(P.root, firstOf2, 'ArrowUp'); ok(P.doc.activeElement === s, 'ArrowUp skips the rows of a closed fold', P.doc.activeElement && P.doc.activeElement.attrs);
    setFold(f1, true); key(P.root, lastOf1, 'ArrowDown'); ok(P.doc.activeElement === firstOf2, 'ArrowDown crosses from one fold into the next');
    // the 'picker' event: the open map (deep in the no-size fold, past the first chunk) is drawn, marked and scrolled to
    typeIn(P.root, '');
    P.V.emit('map', { key: 'multi/m264', pick: true }); await H.until(() => P.V.doc, 5000); await H.flush();
    ok(!rowOf(P.root, 'multi/m264'), 'picker setup: the open map is past the first chunk');
    SV.length = 0; P.V.emit('picker', { open: true });
    const cur = rowOf(P.root, 'multi/m264');
    ok(cur && cur.attrs['aria-current'] === 'true' && SV.some(x => x[0] === cur && x[1] && x[1].block === 'center'), 'picker open: the open map row is drawn, marked and scrolled into view', SV.map(x => x[0].attrs['data-key']));
    P.V.emit('picker', { open: false });
    // a single-player map open, its fold closed by the user: the picker opens the fold and scrolls to it
    setFold(fold(P.root, 'single'), false);
    P.V.emit('map', { key: 'single/s007', pick: true }); await H.until(() => P.V.q('map') === 'single/s007' && P.V.doc, 5000); await H.flush();
    SV.length = 0; P.V.emit('picker', { open: true });
    const c2 = rowOf(P.root, 'single/s007');
    ok(fold(P.root, 'single').open && c2 && c2.attrs['aria-current'] === 'true' && SV.some(x => x[0] === c2 && x[1].block === 'center'), 'picker open: a closed fold that holds the open map opens', [fold(P.root, 'single').open, !!c2]);
    ok(JSON.stringify(recent(P.root)) === '["single/s007","multi/m264"]', 'pick requests of other parts go into the recent maps too', recent(P.root));
    delete global.IntersectionObserver;
  }
  // without an IntersectionObserver (and no picker event): the Show the rest row still reaches every map
  { const BIG = Array.from({ length: 230 }, (_, i) => ({ key: 'multi/n' + String(i).padStart(3, '0'), group: 'multi', mod: null, modes: [], files: [], pictures: [] }));
    const calls = [], { r } = stubRoutes({ maps: BIG }), P = page({ gameId: 'as64', gameOv: '<gnoio>', mod: '', mapKey: '' }, r, calls);
    P.screen.refresh(); await H.flush();
    const mb = H.blk(P.root, 'mv.list.more').all().find(e => e.tagName === 'BUTTON');
    ok(rowsOf(P.root).length === 100 && !mb.hidden, 'no observer: 100 rows and the Show the rest row');
    mb.click(); ok(rowsOf(P.root).length === 230 && mb.hidden, 'no observer: one press shows the rest');
  }
  // recent maps: per game and mod, newest first, 5 at most, a map gone is dropped silently, bad stored values planted
  { const calls = [], { r } = stubRoutes({}), S = { gameId: 'mowas2', gameOv: '<gr>', mod: '', mapKey: '' };
    const keep = { k: 'as64|<gr>|<mod>', v: ['multi/bravo'] };
    global.LS.m[RK] = { 'mowas2|<gr>|': ['multi/gone', 'multi/alpha', 5, null, 'multi/alpha'], [keep.k]: keep.v, junk: 'not a list' };
    const P = page(S, r, calls); P.screen.refresh(); await H.flush();
    ok(JSON.stringify(recent(P.root)) === '["multi/alpha"]', 'recent maps: a map that is gone and bad entries are dropped, no word said', recent(P.root));
    ok(JSON.stringify(global.LS.m[RK]['mowas2|<gr>|']) === '["multi/alpha"]' && !('junk' in global.LS.m[RK]), 'the pruned list is kept (a bad context entry goes)', global.LS.m[RK]);
    const rb = H.blk(P.root, 'mv.list.recent');
    ok(!rb.hidden && rb.has(en('mapviz.list.recent')) && rowsOf(P.root, 'mv.list.recent').every(b => shown(b) === 'alpha'), 'recent maps come first, same one-line rows');
    ok(H.blk(P.root, 'mv.list.recent').parentNode.children.indexOf(rb) < H.blk(P.root, 'mv.list.recent').parentNode.children.indexOf(H.blk(P.root, 'mv.list.maps')), 'the recent block is above the list');
    // ArrowDown from the search box goes to the first recent row
    searchOf(P.root).fire('keydown', { key: 'ArrowDown' }); ok(P.doc.activeElement === rowsOf(P.root, 'mv.list.recent')[0], 'ArrowDown from the search box: the first recent map first');
    key(P.root, rowsOf(P.root, 'mv.list.recent')[0], 'ArrowDown'); ok(P.doc.activeElement === rowsOf(P.root)[0], 'ArrowDown goes on from the recent maps into the list');
    rowOf(P.root, 'multi/bravo').click(); await H.flush();
    ok(JSON.stringify(recent(P.root)) === '["multi/bravo","multi/alpha"]', 'a pick goes first', recent(P.root));
    ok(JSON.stringify(global.LS.m[RK][keep.k]) === '["multi/bravo"]', 'another game and mod keep their own recent maps');
    // as64 with a mod: its own list
    S.gameId = 'as64'; S.mod = '<mod>'; P.screen.refresh(); await H.flush();
    ok(JSON.stringify(recent(P.root)) === '["multi/bravo"]', 'recent maps per game and mod: as64 with the mod shows its own', [recent(P.root), Object.keys(global.LS.m[RK])]);
    // 5 at most; more contexts than 20 are cut, oldest first
    const SIX = Array.from({ length: 7 }, (_, i) => ({ key: 'multi/r' + i, group: 'multi', mod: null, modes: [], files: [], pictures: [] }));
    const c2 = [], { r: r2 } = stubRoutes({ maps: SIX });
    const ctx = {}; for (let i = 0; i < 25; i++) ctx['goh|<old' + i + '>|'] = ['multi/x']; global.LS.m[RK] = ctx;
    const P2 = page({ gameId: 'mowas2', gameOv: '<g6>', mod: '', mapKey: '' }, r2, c2); P2.screen.refresh(); await H.flush();
    for (const m of SIX) { rowOf(P2.root, m.key).click(); await H.flush(); }
    ok(JSON.stringify(recent(P2.root)) === '["multi/r6","multi/r5","multi/r4","multi/r3","multi/r2"]', 'at most 5 recent maps, newest first', recent(P2.root));
    ok(Object.keys(global.LS.m[RK]).length === 20 && global.LS.m[RK]['mowas2|<g6>|'] && !global.LS.m[RK]['goh|<old0>|'], 'at most 20 game and mod contexts are kept, the oldest go', Object.keys(global.LS.m[RK]).length);
    // a stored value that is not an object at all
    global.LS.m[RK] = 'garbage'; const P3 = page({ gameId: 'mowas2', gameOv: '<g6>', mod: '', mapKey: '' }, r2, []); P3.screen.refresh(); await H.flush();
    ok(rowsOf(P3.root).length === 7 && H.blk(P3.root, 'mv.list.recent').hidden, 'seeded: a stored recent value that is not an object is ignored');
  }
  // seeded: a list with bad rows (null, a number key, an empty key, a duplicate, modes and pictures not lists)
  { const BAD = [null, { key: 5 }, { key: '' }, 7, { key: 'multi/ok', modes: 'combat', pictures: 'x', mod: null }, { key: 'multi/ok', modes: ['dup'] }, { key: 'multi/two', modes: [null, 3, 'assault'] }];
    const calls = [], { r } = stubRoutes({ maps: BAD }), P = page({ gameId: 'mowas2', gameOv: '<gbad>', mod: '', mapKey: '' }, r, calls);
    P.screen.refresh(); await H.flush();
    ok(JSON.stringify(keys(P.root)) === '["multi/ok","multi/two"]', 'seeded: bad rows of the list are left out, a duplicate key once', keys(P.root));
    rowOf(P.root, 'multi/two').click(); await H.flush();
    ok(H.blk(P.root, 'mv.list.modes').all().filter(e => e.tagName === 'BUTTON').map(b => b.textContent).join() === 'assault', 'seeded: mode ids that are not words are left out');
  }
  // the list not read yet: refresh reads only; the button runs the maps job
  { const calls = [], { r, st } = stubRoutes({ need: true }), S = { gameId: 'as64', gameOv: '<game>', mod: '<mod>', mapKey: '' };
    const P = page(S, r, calls);
    P.screen.refresh(); await H.flush(); P.screen.refresh(); await H.flush();
    const status = H.blk(P.root, 'mv.list.status');
    ok(status.has(en('mapviz.list.need')) && st.jobs === 0 && calls.every(c => c.method === 'GET'), 'a list not read yet: told, no job on refresh');
    const read = status.all().find(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.list.read'));
    ok(!!read, 'the read button');
    read.click(); await H.until(() => keys(P.root).length > 0, 5000);
    ok(st.jobs === 1 && st.body.what === 'maps' && st.body.target === 'as64' && JSON.stringify(st.body.modDirs) === '["<mod>"]' && st.body.map === undefined, 'the button posts the maps job for the page game and mod', st.body);
    ok(keys(P.root).length === 2 && folds(P.root).length === 3, 'the list is shown after the job');
  }
  // W3 and W1: a maps job started elsewhere on the page runs: its words show, no read button; when it ends the list
  // that was not read asks again once by itself
  { const calls = [], { r, st } = stubRoutes({ need: true }), S = { gameId: 'mowas2', gameOv: '<gw>', mod: '', mapKey: '' };
    let polls = 0; r['GET /api/x/mapviz/job'] = async () => { polls++; if (polls < 3) return { id: 'jm', what: 'maps', state: 'running', stage: 'scan', done: polls, total: 3, queue: 0 }; st.made = true; return { id: 'jm', what: 'maps', state: 'done', stage: '', done: 3, total: 3, queue: 0 }; };
    const P = page(S, r, calls);
    P.screen.refresh(); await H.flush();
    const status = () => H.blk(P.root, 'mv.list.status'), reads = () => calls.filter(c => c.path === '/api/x/mapviz/maps').length;
    ok(status().has(en('mapviz.list.need')), 'W1 setup: the list is not read');
    const r0 = reads(), seen = [];
    // the status is read on every job answer (the list's own 'job' listener runs first), so a fast poll is never missed
    P.V.on('job', d => { if (!d.end) seen.push([status().textContent, status().all().some(e => e.tagName === 'BUTTON')]); });
    const jp = P.V.job('maps', {});
    await H.until(() => polls >= 2, 5000);
    ok(seen.length > 0 && seen.every(s => s[0].indexOf(en('mapviz.list.making').replace('{job}', '')) === 0 && !s[1]), 'W3: while a maps job runs the status shows its words and no read button', seen.slice(-2));
    await jp; await H.until(() => keys(P.root).length > 0, 5000);
    ok(reads() === r0 + 1 && keys(P.root).length === 2, 'W1: the job ended: the list asked again once and is shown', reads() - r0);
    P.V.emit('products', {}); await H.flush();
    ok(reads() === r0 + 1, 'W1: a later products event with the list shown asks nothing');
    // W2: another game: the old list goes at once (no map of the old game offered while the new one is read)
    let hold = null; r['GET /api/x/mapviz/maps'] = () => new Promise(res => { hold = res; });
    S.gameId = 'as64'; P.screen.refresh(); await H.flush();
    ok(keys(P.root).length === 0 && folds(P.root).length === 0 && status().has(en('mapviz.list.loading')), 'W2: a game switch drops the old list while the new one is read; the reading words show', keys(P.root));
    hold({ v: 1, maps: [MAPS[2]] }); await H.flush();
    ok(JSON.stringify(keys(P.root)) === '["single/c1/m1"]' && fold(P.root, 'single').open, 'W2: the new game list is shown (single player open when it is the only group)', keys(P.root));
    ok(!H.blk(P.root, 'mv.list.modes').all().some(e => e.tagName === 'BUTTON'), 'W2: no mode of the old map stays');
  }
  // R2: the page hidden while the maps job runs; the folder changes and the job ends before the GUI's hidden refresh. The
  // list's read is held, then dropped as stale on the show: that is no fault, the list asks once more and is shown
  { const calls = [], { r, st } = stubRoutes({ need: true }), S = { gameId: 'mowas2', gameOv: '<g1>', mod: '', mapKey: '', cur: 'mapviz', sec: {} };
    let fin = false, polls = 0;
    r['GET /api/x/mapviz/job'] = async () => { polls++; if (!fin) return { id: 'jm', what: 'maps', state: 'running', stage: 'read', done: 0, total: 1, queue: 0 }; st.made = true; return { id: 'jm', what: 'maps', state: 'done', stage: '', done: 1, total: 1, queue: 0 }; };
    const P = page(S, r, calls); S.sec.mapviz = P.root;
    const status = () => H.blk(P.root, 'mv.list.status'), reads = n => calls.slice(n).filter(c => c.path === '/api/x/mapviz/maps');
    P.screen.refresh(); await H.flush();
    const read = status().all().find(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.list.read'));
    ok(!!read && status().has(en('mapviz.list.need')), 'R2 setup: the list is not read yet');
    read.click(); await H.until(() => polls >= 1, 5000);
    S.cur = 'mods'; S.gameOv = '<g2>'; let n = calls.length; fin = true;
    await H.until(() => st.made && P.V.q('jobs').length === 0, 5000); await H.flush();
    ok(reads(n).length === 0, 'R2: hidden: the read after the job is held, nothing asked', reads(n).map(c => c.url));
    P.screen.refresh(); await H.flush();
    ok(reads(n).length === 0, 'R2: the hidden refresh takes the folder in and asks nothing');
    S.cur = 'mapviz'; n = calls.length; P.screen.refresh(); await H.until(() => keys(P.root).length > 0, 5000); await H.flush();
    const rq = reads(n);
    ok(rq.length === 1 && new URL(rq[0].url, 'http://x').searchParams.get('game') === '<g2>', 'R2: on the show the stale held read is asked again once, in the new folder', rq.map(c => c.url));
    ok(keys(P.root).length === 2 && !status().textContent && st.jobs === 1, 'R2: the list is shown, with no fault line', [status().textContent, calls.map(c => c.method + ' ' + c.url)]);
    P.V.emit('products', {}); P.screen.refresh(); await H.flush();
    ok(reads(n).length === 1, 'R2: no request loop: a later refresh and products ask nothing more', reads(n).length);
  }
  // seeded: a read that fails (with and without a game folder: the next step in words); an empty list; RMT; no target
  { const calls = [], { r } = stubRoutes({ fault: true });
    const P = page({ gameId: 'mowas2', mapKey: '' }, r, calls);
    P.screen.refresh(); await H.flush();
    const st0 = H.blk(P.root, 'mv.list.status');
    ok(st0.has('seeded read fault') && keys(P.root).length === 0, 'seeded defect: a failed read is told, no list');
    ok(st0.has(en('mapviz.list.noGame')) && /Settings/.test(en('mapviz.list.noGame')), 'no game folder: the failure says where to set it', st0.textContent);
    const P1 = page({ gameId: 'mowas2', gameOv: '<gf>', mapKey: '' }, stubRoutes({ fault: true }).r, []);
    P1.screen.refresh(); await H.flush();
    ok(H.blk(P1.root, 'mv.list.status').has(en('mapviz.list.retry')) && !H.blk(P1.root, 'mv.list.status').has(en('mapviz.list.noGame')), 'a game folder set: the failure points at the refresh button');
    const P0 = page({ gameId: 'mowas2', gameOv: '<ge>', mapKey: '' }, stubRoutes({ maps: [] }).r, []);
    P0.screen.refresh(); await H.flush();
    ok(H.blk(P0.root, 'mv.list.maps').has(en('mapviz.list.empty')) && /refresh button/.test(en('mapviz.list.empty')), 'an empty list: told, with the next step');
    const c2 = []; const P2 = page({ gameId: 'mowas2', mapKey: '' }, stubRoutes({}).r, c2, { rmt: true });
    P2.screen.refresh(); await H.flush();
    ok(c2.length === 0, 'RMT: the list makes no call');
    const c3 = []; const P3 = page({ gameId: 'nogame', mapKey: '' }, stubRoutes({}).r, c3);
    P3.screen.refresh(); await H.flush();
    ok(c3.filter(c => c.path === '/api/x/mapviz/maps').length === 0 && H.blk(P3.root, 'mv.list.status').has(en('mapviz.list.noTarget')), 'no target: no read, told');
  }
  // the real routes and the fixture map
  { const SERVER = require('./shell.server');
    const fx = require('../../../../mapviz/test/fxmake').make(path.join(SCR, 'fx'), { form: 'as2' });
    const calls = [], S = { gameId: 'mowas2', gameOv: fx.gameDir, mod: '', mapKey: '' };
    const P = page(S, SERVER.routes, calls);
    P.screen.refresh(); await H.flush();
    const read = H.blk(P.root, 'mv.list.status').all().find(e => e.tagName === 'BUTTON');
    ok(!!read && calls.every(c => c.method === 'GET'), 'real: an empty cache asks for the read');
    if (read) { read.click(); await H.until(() => keys(P.root).length > 0, 60000); }
    ok(JSON.stringify(keys(P.root)) === '["multi/mv_fixture"]' && shown(rowOf(P.root, 'multi/mv_fixture')) === 'mv_fixture', 'real: the fixture map listed');
    rowsOf(P.root)[0] && rowsOf(P.root)[0].click();
    await H.until(() => P.V.doc || H.blk(P.root, 'mv.say').has(en('mapviz.shell.reading')), 20000);
    await H.until(() => P.V.doc, 60000);
    ok(P.V.doc && S.mapKey === 'map/multi/mv_fixture' && H.blk(P.root, 'mv.list.modes').all().filter(e => e.tagName === 'BUTTON').length === 3, 'real: choosing the map reads it (doc job on the user pick) and lists its 3 modes');
    if (SERVER._t.close) await SERVER._t.close();
  }
  // searchKit (owner 2026-11-19: every search box has Browse, History and an index): the page's real kit in front of the
  // scripts, beside the list (the list under the box is the index view); Enter goes into the history 'mapviz.listSearch' and
  // opens the best match; Browse opens the data picker at map/ and a folder gives the listed map key
  { const KIT = require('../../../test/blockcheck').kitSrc();
    const many = MAPS.concat(Array.from({ length: 150 }, (_, i) => ({ key: 'multi/z' + String(i).padStart(3, '0'), group: 'multi', mod: null, modes: [], files: [], pictures: [] })));
    const calls = [], { r } = stubRoutes({ maps: many });
    const S = { gameId: 'mowas2', gameOv: '<gkit>', mod: '', mapKey: '' };
    global.MVPICK = [];   // the picker stand-in: what a Browse click asks for, and its done()
    const P = H.mkPage({ scripts: [KIT, 'searchKit.picker=function(s,d){MVPICK.push({spec:s,done:d})};', SHELL, LIST], lang: L, S, canvas: false, api: H.routeApi(r, calls) });
    P.screen.refresh(); await H.flush();
    const sk = P.root.all().find(e => e.attrs && e.attrs['data-sk'] === 'mapviz.listSearch');
    ok(!!sk && sk.all().filter(e => e.tagName === 'BUTTON').length >= 2, 'kit: the search box has Browse and History buttons');
    ok(rowsOf(P.root).length === 100, 'kit: the first draw is 100 rows', rowsOf(P.root).length);
    const search = sk.all().find(e => e.tagName === 'INPUT');
    search.value = 'brav'; search.fire('input'); await H.until(() => JSON.stringify(keys(P.root)) === '["multi/bravo"]'); await H.flush();
    ok(JSON.stringify(keys(P.root)) === '["multi/bravo"]' && !sk.all().some(e => / sk-index/.test(' ' + e.className)), 'kit: typing filters the list under the box (no second index list)', keys(P.root));
    const got = []; P.V.on('map', d => got.push(d));
    search.fire('keydown', { key: 'Enter' }); await H.until(() => got.some(d => d.key === 'multi/bravo') && global.LS.m['sk.hist.mapviz.listSearch']); await H.flush();
    ok(got.some(d => d.key === 'multi/bravo') && global.LS.m['sk.hist.mapviz.listSearch'] && global.LS.m['sk.hist.mapviz.listSearch'][0] === 'brav', 'kit: Enter opens the match and the text is in the history', global.LS.m['sk.hist.mapviz.listSearch']);
    search.value = ''; search.fire('input'); await H.flush();
    search.fire('keydown', { key: 'ArrowDown' });
    ok(P.doc.activeElement === rowsOf(P.root, 'mv.list.recent')[0], 'kit: ArrowDown in the box goes to the rows, not to a kit list', P.doc.activeElement && P.doc.activeElement.attrs);
    // Browse = the file picker in the game data at map/ (folders); a folder inside a listed map gives its key and opens it (seeded)
    sk.all().find(e => / sk-browse/.test(' ' + e.className)).click();
    const b0 = global.MVPICK.pop();
    ok(!!b0 && b0.spec.view === 'data' && b0.spec.start === 'map' && b0.spec.mode === 'dir', 'kit: Browse opens the picker in the game data at map/', b0 && b0.spec);
    if (b0) { const got2 = []; P.V.on('map', d => got2.push(d)); b0.done('map/multi/z007/terrain', { view: 'data', path: 'map/multi/z007/terrain', name: 'terrain' }); await H.until(() => search.value === 'multi/z007' && got2.some(d => d.key === 'multi/z007')); await H.flush();
      ok(search.value === 'multi/z007' && got2.some(d => d.key === 'multi/z007'), 'kit: a Browse pick gives the listed map key and opens it', search.value); } }
  // the joined block rules on a list page (blocks, names in words)
  { const BC = require('../../../test/blockcheck'), { r } = stubRoutes({});
    const P = page({ gameId: 'mowas2', gameOv: '<gbc>', mod: '', mapKey: '' }, r, []); P.screen.refresh(); await H.flush();
    rowOf(P.root, 'multi/alpha').click(); await H.flush();
    const lb = P.root.all().filter(e => /^mv\.list\./.test(String(e.attrs['data-blk'] || '')));
    ok(lb.length >= 9 && lb.every(e => e.attrs['data-blkname'] && !/^mapviz\./.test(e.attrs['data-blkname'])), 'every list block has a name in words', lb.map(e => e.attrs['data-blk']));
    const bp = BC.checkScreen(P.root, 'mapviz').filter(p => /mv\.list|list/.test(p));
    ok(!bp.length, 'block rules hold for the list part', bp); }
  // language
  const LIST_SRC = String(LIST), used = new Set();
  for (const m of LIST_SRC.matchAll(/'(mapviz\.list\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
  for (const g of ['multi', 'single', 'other']) used.add('mapviz.list.g.' + g);
  const codes = ['en', 'ru', 'uk', 'zh'], miss = [];
  ok(Object.keys(LL).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
  for (const k of used) for (const c of codes) if (!(LL[c] && LL[c][k])) miss.push(c + ' ' + k);
  ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
  const unused = Object.keys(LL.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
  ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
  ok(codes.every(c => Object.keys(LL[c]).sort().join() === Object.keys(LL.en).sort().join()), 'lang: the same keys in all four languages');
  const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  const bad = []; for (const c of codes) for (const k of Object.keys(LL.en)) { const s = LL[c][k]; if (typeof s !== 'string' || !s || slots(s) !== slots(LL.en[k]) || /^TODO:/.test(s) || /—| - /.test(s)) bad.push(c + ' ' + k); }
  ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
  const same = []; for (const c of ['ru', 'uk', 'zh']) for (const k of Object.keys(LL.en)) if (LL[c][k] === LL.en[k]) same.push(c + ' ' + k);
  ok(!same.length, 'lang: every text is translated', same.join(', '));
  ok(!/\(from the mod\)|Narrow the search/.test(JSON.stringify(LL.en)), 'lang: the old "(from the mod)" and "Narrow the search" words are gone');
  if (failN) { console.log('FAIL mapviz list: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
  console.log('PASS mapviz list (' + pass + ')');
  process.exit(0);
})().catch(e => { console.log('FAIL mapviz list: ' + (e && e.stack || e)); process.exit(1); });
