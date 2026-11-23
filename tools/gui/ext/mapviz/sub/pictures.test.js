// Map Viewer pictures part test (MV-PG4, PG4a): node tools/gui/ext/mapviz/sub/pictures.test.js [scratch dir]
// 1 the routes GET pictures and GET export on stubbed cache, table, paint and part states (pictures.server.js _t.use):
//   states made / need / notBuilt (why part, style, wave), the need args, the sidecar fields, the pack counts, the export
//   PNG north up with its name, refusals; the same answers for target as64, mowas2 and goh
// 2 the panel on a stub V in the fake DOM (water.test.js form), no canvas: the blocks, rows for need, made, notBuilt and
//   job words; Make posts once; 'products' asks once; Show and the 'picture' event; a context change drops the shown
//   picture; Save with and without Blob; the picture layer draws tiles of the shown picture only
// 3 the part on the shell page (mkPage), with and without a canvas: block names, the GUI block rule
// 4 the real job runner on the fixture map, both forms (AS2 and GoH): topo made, its side, GET export, Make l1 fails
// 5 language: four languages, the same keys, every key used, no TODO, no dash separator, AS64 in capitals; script rules
// Seeded defects: an item with an unknown base (not listed), a tiles answer for another base (not drawn), a sidecar box of
// 3 numbers ("not available"), GET export over 4096 (refused), a lang file missing one zh key (caught).
// Author: Imperator_Aug (ARSENAL, ia-5f90d5c9)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-pictures-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./pictures.client'), SRV = require('./pictures.server'), SHS = require('./shell.server');
const LP = require('./pictures.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LP]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const GF = require(path.join(ROOT, 'lib/raster/gridfile')), PNG = require(path.join(ROOT, 'lib/raster/png'));
const TABLE = require(path.join(ROOT, 'jobs/table'));
const SZ = require(path.join(ROOT, 'previews/sizes'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz pictures: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MAP = 'multi/mv_fixture';

// ---------- 1 stubbed server modules ----------
const ROW = (part, keys, products) => ({ part, cmd: 'x', heavy: true, timeoutS: 600, needs: ['doc'], keys, products });
const JOBS = {
  doc: ROW('mapkit', [], ['mapdoc.json']),
  topo: ROW('raster', ['size'], ['pic.topo', 'tiles/topo']),
  l0: ROW('render', ['mode', 'size'], ['pic.l0', 'tiles/l0']), l1: ROW('render', ['mode', 'size'], ['pic.l1', 'tiles/l1']),
  l2: ROW('render', ['mode', 'size'], ['pic.l2', 'tiles/l2']), pack: ROW('render', ['mode'], ['pack.json']),
  l3: ROW('render', ['mode', 'size'], ['pic.l3', 'tiles/l3']), l4: ROW('render', ['mode', 'size', 'light'], ['pic.l4', 'tiles/l4']),
  staff: ROW('paint', ['mode', 'size'], ['pic.staff', 'tiles/staff']), painted: ROW('paint', ['mode', 'size'], ['pic.painted', 'tiles/painted']),
  recon: ROW('paint', ['mode', 'size'], ['pic.recon', 'tiles/recon']), sketch: ROW('paint', ['mode', 'size'], ['pic.sketch', 'tiles/sketch']),
};
const SIZE = { l1: 2048, l2: 2048, l3: 2048, l4: 2048, staff: 2048, painted: 2048, recon: 2048, sketch: 2048 };
const stubTable = { JOBS, SIZE, reduce: (c, w) => TABLE.reduce(c, w, JOBS) };
const keyOf = o => [o.target, o.what, o.mode || '', o.size == null ? '' : o.size, o.light || ''].join('|');
const ENT = {};   // key -> dir
// like the real entryKey: the row's own keys only, the table size when no size is asked, light clean when not asked
const stubKey = o => { const ks = (o.row && o.row.keys) || [];
  return keyOf({ target: o.target, what: o.what, mode: ks.includes('mode') ? o.mode : null, size: ks.includes('size') ? (o.size != null ? Number(o.size) : (SIZE[o.what] != null ? SIZE[o.what] : null)) : null,
    light: ks.includes('light') ? (o.light || 'clean') : null }); };
const stubCache = { entryKey: stubKey, open: k => (ENT[k] ? { dir: ENT[k], manifest: {} } : null) };
let STY = [{ id: 'staff', state: 'built' }, { id: 'painted', state: 'not built' }, { id: 'recon', state: 'broken' }, { id: 'sketch', state: 'built' }];
const PARTS = { mapkit: 'built', raster: 'built', render: 'built', paint: 'built' };
// cache and table go to the shell's seam (pictures reads them through shell lib.mod, late F9); the rest to the part's
function useStubs(o) {
  o = Object.assign({ cache: stubCache, table: stubTable, paint: { styles: { list: () => STY } }, render: null, partState: p => PARTS[p] || 'not built' }, o || {});
  SHS._t.use({ cache: o.cache, table: o.table });
  const own = Object.assign({}, o); delete own.cache; delete own.table;
  SRV._t.use(own);
}
function resetStubs() { SRV._t.reset(); SHS._t.reset(); }
// a made entry: pic.<base>.mvg (rgba8 w x h, row j filled with value j + 1) and its sidecar; light only for a row keying it
function entry(target, base, mode, size, side, wh, light) {
  const dir = path.join(SCR, 'ent', [target, base, mode || 'none', size || 'def', light || 'clean'].join('-'));
  fs.mkdirSync(dir, { recursive: true });
  const w = (wh && wh[0]) || 4, h = (wh && wh[1]) || 3, data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data.set([j + 1, i + 1, 7, 255], (j * w + i) * 4);
  GF.write(path.join(dir, 'pic.' + base + '.mvg'), { name: 'pic.' + base, w, h, cell: 10, ox: -20, oy: -15, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data });
  if (side !== null) fs.writeFileSync(path.join(dir, 'pic.' + base + '.json'), JSON.stringify(Object.assign({ v: 1, layer: 'pic.' + base, w, h, box: [-20, -15, 20, 15], cell: 10, rowOrder: 'minY-first',
    target, stackHash: null, mapHashes: {}, rung: null, env: null, gaps: [], approx: false, brightness: 'fitted', made: '2026-11-14T00:00:00Z' }, side || {})));
  const sz = JOBS[base].keys.includes('size') ? (size != null ? size : (SIZE[base] != null ? SIZE[base] : null)) : null;
  ENT[keyOf({ target, what: base, mode: JOBS[base].keys.includes('mode') ? mode : null, size: sz, light: JOBS[base].keys.includes('light') ? (light || 'clean') : null })] = dir;
  return dir;
}
function packEntry(target, mode, counts) {
  const dir = path.join(SCR, 'ent', target + '-pack-' + (mode || 'none'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify({ v: 1, kind: 'scenepack', counts }));
  ENT[keyOf({ target, what: 'pack', mode })] = dir;
}
const R = SRV.routes;
async function call(method, p, body) {
  const r = R[method + ' /api/x/mapviz/' + p.split('?')[0]];
  if (!r) return { e: { message: 'no route ' + p } };
  try { return { v: await r(new URL('/api/x/mapviz/' + p, 'http://x'), body === undefined ? null : body, {}) }; } catch (e) { return { e }; }
}
const qs = o => Object.keys(o).filter(k => o[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
const shape = (e, st, code) => !!e && e.status === st && e.key === 'mapviz.err.' + code && e.params && typeof e.params.msg === 'string';

async function serverTests() {
  useStubs();
  for (const target of ['as64', 'mowas2', 'goh']) {
    const T = target, base = { target: T, game: '<game>', map: MAP, mode: 'combat' };
    entry(T, 'topo', null, null, { gaps: [] }, [4, 3]);
    entry(T, 'l1', 'combat', null, { rung: 'l1', size: 2048, approx: T === 'goh', brightness: T === 'goh' ? 'unverified' : 'fitted', gaps: T === 'goh' ? ['RENDER_GLOBAL_NORMAL'] : [] });
    entry(T, 'l3', 'combat', null, { rung: 'l3', size: 2048, notes: [{ code: 'RENDER_OBJ_TEXTURE', text: 'x' }, { bad: 1 }, 'RENDER_NO_GROUND: 2 objects have no z', 'free text with no code'] });
    packEntry(T, 'combat', { defs: 5, geoms: 6, verts: 1, tris: 1, instances: 7, drawn: 6, skipped: {}, failed: 0 });
    entry(T, 'staff', 'combat', null, { base: null });
    entry(T, 'sketch', 'combat', 1024, { size: 1024 });
    let r = await call('GET', 'pictures?' + qs(base));
    const items = r.v && r.v.items, by = {};
    (items || []).forEach(x => { by[x.base] = x; });
    ok(r.v && r.v.v === 1 && r.v.map === MAP && r.v.target === T && r.v.mode === 'combat', T + ': GET pictures envelope', r.v || r.e);
    ok(items && same(items.map(x => x.base), SRV._t.BASES), T + ': eleven rows in the frozen order', items && items.map(x => x.base));
    ok(by.topo && by.topo.state === 'made' && by.topo.part === 'raster' && by.topo.size === null && by.topo.side && by.topo.side.w === 4 && by.topo.side.h === 3 && same(by.topo.side.box, [-20, -15, 20, 15]), T + ': topo made, side from its sidecar, default size null', by.topo);
    ok(by.l1 && by.l1.state === 'made' && by.l1.size === 2048 && by.l1.side.rung === 'l1' && by.l1.side.approx === (T === 'goh') && by.l1.side.brightness === (T === 'goh' ? 'unverified' : 'fitted'), T + ': l1 made at the table size 2048; GoH approx and brightness unverified come from the sidecar', by.l1);
    ok(by.l0 && by.l0.state === 'need' && same(by.l0.need, { what: 'l0', args: { map: MAP, mode: 'combat' } }), T + ': l0 need {what, args: map, mode}', by.l0);
    ok(by.l2 && by.l2.state === 'need' && by.l2.need.what === 'l2', T + ': l2 need', by.l2);
    ok(by.l3 && by.l3.state === 'made' && same(by.l3.pack, { defs: 5, instances: 7, failed: 0 }) && by.l3.side.notes.length === 3 && by.l3.side.notes[0].code === 'RENDER_OBJ_TEXTURE', T + ': l3 made with the pack counts; a note with neither code nor text is dropped', by.l3);
    ok(by.l3 && same(by.l3.side.notes[1], { code: 'RENDER_NO_GROUND', text: '2 objects have no z' }), T + ': an l3 string note "CODE: text" is read as {code, text}', by.l3 && by.l3.side.notes);
    ok(by.l3 && same(by.l3.side.notes[2], { code: null, text: 'free text with no code' }), T + ': a plain text note (l1, l2, l4 write them) is kept as {code: null, text}', by.l3 && by.l3.side.notes);
    ok(by.l4 && by.l4.state === 'need' && by.l4.pack === null, T + ': l4 need, no pack on a need row', by.l4);
    // the need carries the effective size and light (the real table.reduce leaves the defaults out)
    ok(by.l2 && same(by.l2.need.args, { map: MAP, mode: 'combat', size: 2048 }) && by.l4 && same(by.l4.need.args, { map: MAP, mode: 'combat', size: 2048, light: 'clean' }), T + ': need args hold the default size, l4 also light clean', [by.l2 && by.l2.need, by.l4 && by.l4.need]);
    // late F7: the l4 picture in the mode's light; GoH modes with a black preset carry RENDER_ENV_PLACEHOLDER
    entry(T, 'l4', 'combat', null, { rung: 'l4', size: 2048, gaps: T === 'goh' ? ['RENDER_ENV_PLACEHOLDER'] : [] }, null, 'mode');
    r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { light: 'mode' })));
    const lm = r.v && r.v.items.find(x => x.base === 'l4'), tm = r.v && r.v.items.find(x => x.base === 'topo');
    ok(lm && lm.state === 'made' && same(lm.side.gaps, T === 'goh' ? ['RENDER_ENV_PLACEHOLDER'] : []) && tm && tm.state === 'made', T + ': light=mode accepted: l4 made in the mode light (GoH gap RENDER_ENV_PLACEHOLDER), topo unchanged', r.v ? lm : r.e);
    r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { light: 'clean', bases: 'l4' })));
    ok(r.v && r.v.items[0].state === 'need' && r.v.items[0].need.args.light === 'clean', T + ': light=clean: l4 need with light clean', r.v || r.e);
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'l4', light: 'mode' })));
    ok(r.v && r.v.name === 'mv_fixture_l4.png' && r.v.w === 4, T + ': GET export l4 with light=mode', r.v ? { name: r.v.name } : r.e);
    r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { light: 'dusk' })));
    ok(shape(r.e, 400, 'MV_USAGE'), T + ': light dusk refused 400 (shell fieldsOf)', r.e && r.e.params);
    ok(by.staff && by.staff.state === 'made' && by.staff.part === 'paint', T + ': staff (style built) made', by.staff);
    ok(by.painted && by.painted.state === 'notBuilt' && by.painted.why === 'style' && by.recon.state === 'notBuilt' && by.recon.why === 'style', T + ': painted (not built) and recon (broken) are notBuilt, why style', [by.painted, by.recon]);
    ok(by.sketch && by.sketch.state === 'need' && by.sketch.size === 2048, T + ': sketch at the default size is not made (only 1024 is)', by.sketch);
    ok(by.edshot && by.edshot.state === 'notBuilt' && by.edshot.why === 'wave' && by.edshot.part === 'edshot', T + ': edshot notBuilt, why wave', by.edshot);
    r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { size: 1024, bases: 'sketch,topo' })));
    ok(r.v && same(r.v.items.map(x => x.base), ['topo', 'sketch']) && r.v.items[1].state === 'made' && r.v.items[1].size === 1024 && r.v.items[0].state === 'need' && same(r.v.items[0].need.args, { map: MAP, size: 1024 }), T + ': bases and size: sketch 1024 made, topo 1024 need with the size in its args', r.v || r.e);
    // export: north up, the name, the size cap
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'topo' })));
    let img = null; try { img = r.v && PNG.decode(Buffer.from(r.v.png, 'base64')); } catch (e) { img = null; }
    ok(r.v && r.v.name === 'mv_fixture_topo.png' && r.v.w === 4 && r.v.h === 3 && img && img.w === 4 && img.h === 3, T + ': GET export name and size', r.v ? { name: r.v.name, w: r.v.w, h: r.v.h } : r.e);
    ok(img && img.rgba[0] === 3 && img.rgba[(2 * 4) * 4] === 1 && img.rgba[3] === 255 && img.rgba[1] === 1, T + ': export rows north up (PNG row 0 = the max y grid row), alpha kept', img && Array.from(img.rgba.slice(0, 8)));
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'sketch', size: 1024 })));
    ok(r.v && r.v.name === 'mv_fixture_sketch_1024.png', T + ': export name carries the asked size', r.v || r.e);
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'topo', size: 8192 })));
    ok(shape(r.e, 400, 'MV_USAGE'), T + ': export size 8192 refused 400', r.e && r.e.params);
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'l0' })));
    ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need && r.e.params.need.what === 'l0', T + ': export of a picture not made: 404 need', r.e && r.e.params);
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'edshot' })));
    ok(shape(r.e, 501, 'MV_NOT_BUILT'), T + ': export of edshot: 501', r.e && r.e.params);
    r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'painted' })));
    ok(shape(r.e, 501, 'MV_NOT_BUILT'), T + ': export of a style not built: 501');
    // late F11: a game use size (the loading screen 1920 x 1080): the picture is made at the long side previews sizes gives
    // (its own cache entry: 2160 is made, 2161 and the default are not) and saved exactly W x H at each layout
    { const BOX = [-2000, -1000, 2000, 1000], L1 = SZ.longSide(BOX, 1920, 1080, 'stretch');
      entry(T, 'sketch', 'combat', L1, { size: L1, box: BOX }, [8, 4]);
      r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { size: L1, bases: 'sketch' })));
      const m1 = r.v && r.v.items[0];
      r = await call('GET', 'pictures?' + qs(Object.assign({}, base, { size: L1 + 1, bases: 'sketch' })));
      const m2 = r.v && r.v.items[0];
      ok(L1 === 2160 && m1 && m1.state === 'made' && m1.size === L1 && m2 && m2.state === 'need' && m2.need.args.size === L1 + 1, T + ': the cache entry differs per size: ' + L1 + ' made, ' + (L1 + 1) + ' a need with its own size', [m1, m2]);
      for (const fit of ['stretch', 'backdrop', 'crop']) {
        r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'sketch', size: L1, out: '1920x1080', fit })));
        let im = null; try { im = r.v && PNG.decode(Buffer.from(r.v.png, 'base64')); } catch (e) { im = null; }
        const hd = r.v && Buffer.from(r.v.png, 'base64');
        ok(r.v && r.v.w === 1920 && r.v.h === 1080 && same(r.v.out, { w: 1920, h: 1080, fit }) && same(r.v.from, [8, 4]) && r.v.name === 'mv_fixture_sketch_1920x1080.png' &&
          hd.readUInt32BE(16) === 1920 && hd.readUInt32BE(20) === 1080 && im && im.w === 1920 && im.h === 1080 && im.rgba[3] === 255,
          T + ': a game use size gives exactly 1920 x 1080 (PNG header read back), layout ' + fit, r.v ? { w: r.v.w, h: r.v.h, name: r.v.name, out: r.v.out } : r.e);
      }
      // north up: the top PNG row is the max y grid row (value 4), the bottom the min y row (value 1)
      r = await call('GET', 'export?' + qs(Object.assign({}, base, { base: 'sketch', size: L1, out: '64x64', fit: 'stretch' })));
      let im = null; try { im = r.v && PNG.decode(Buffer.from(r.v.png, 'base64')); } catch (e) { im = null; }
      ok(im && im.rgba[0] === 4 && im.rgba[(63 * 64) * 4] === 1, T + ': exact size export is north up', im && [im.rgba[0], im.rgba[(63 * 64) * 4]]);
    }
  }
  // late F11: a custom size is refused in plain words (0, negative, text, not whole, over 8192), a layout that is not one of
  // the three, a layout with no size, a picture size over 8192
  { const b0 = { target: 'mowas2', game: '<game>', map: MAP, mode: 'combat', base: 'topo' };
    for (const [out, word] of [['0x100', 'at least 64'], ['-3x100', 'whole number'], ['abcx100', 'whole number'], ['12.5x100', 'whole number'], ['9000x100', 'at most 8192'], ['100x63', 'at least 64'], ['100', 'width x height']]) {
      const r = await call('GET', 'export?' + qs(Object.assign({}, b0, { out })));
      ok(shape(r.e, 400, 'MV_USAGE') && r.e.params.msg.indexOf(word) >= 0, 'custom size ' + out + ' refused 400 in plain words (' + word + ')', r.e ? r.e.params : r.v && { w: r.v.w }); }
    let r = await call('GET', 'export?' + qs(Object.assign({}, b0, { out: '640x480', fit: 'zoom' })));
    ok(shape(r.e, 400, 'MV_USAGE') && /stretch, backdrop, crop/.test(r.e.params.msg), 'a layout that is not stretch, backdrop or crop refused', r.e && r.e.params);
    r = await call('GET', 'export?' + qs(Object.assign({}, b0, { fit: 'crop' })));
    ok(shape(r.e, 400, 'MV_USAGE'), 'a layout with no size refused', r.e && r.e.params);
    r = await call('GET', 'pictures?' + qs({ target: 'mowas2', map: MAP, size: 9000 }));
    ok(shape(r.e, 400, 'MV_USAGE') && /8192/.test(r.e.params.msg), 'a picture size over 8192 refused', r.e && r.e.params);
    r = await call('GET', 'export?' + qs(Object.assign({}, b0, { out: '640x480' })));
    ok(r.v && r.v.w === 640 && r.v.h === 480 && r.v.out.fit === 'stretch', 'no layout: stretch (as the previews write by default)', r.v ? r.v.out : r.e);
  }
  // seeded: a picture over 4096 on a side is refused
  entry('mowas2', 'l2', 'combat', null, {}, [4097, 1]);
  let r = await call('GET', 'export?' + qs({ target: 'mowas2', map: MAP, mode: 'combat', base: 'l2' }));
  ok(shape(r.e, 400, 'MV_USAGE') && /4096/.test(r.e.params.msg), 'seeded: GET export of a picture 4097 wide is refused 400', r.e && r.e.params);
  r = await call('GET', 'pictures?' + qs({ target: 'mowas2', map: MAP, bogus: 1 })); ok(shape(r.e, 400, 'MV_USAGE'), 'unknown argument refused');
  r = await call('GET', 'pictures?' + qs({ map: MAP })); ok(shape(r.e, 400, 'MV_USAGE'), 'no target refused');
  r = await call('GET', 'pictures?' + qs({ target: 'mowas2', map: MAP, bases: 'topo,nope' })); ok(shape(r.e, 400, 'MV_USAGE'), 'an unknown base in bases refused');
  r = await call('GET', 'pictures?' + qs({ target: 'mowas2', map: MAP, size: 'x' })); ok(shape(r.e, 400, 'MV_USAGE'), 'a size that is not a number refused');
  r = await call('GET', 'export?' + qs({ target: 'mowas2', map: MAP })); ok(shape(r.e, 400, 'MV_USAGE'), 'export without base refused');
  // paint absent: every style notBuilt why part (the part state says it), why style when the part is built but the index is absent
  useStubs({ paint: null, partState: p => (p === 'paint' ? 'not built' : 'built') });
  r = await call('GET', 'pictures?' + qs({ target: 'goh', map: MAP, mode: 'combat' }));
  ok(r.v && r.v.items.filter(x => SRV._t.STYLES.includes(x.base)).every(x => x.state === 'notBuilt' && x.why === 'part'), 'paint not built: the four styles notBuilt, why part', r.v && r.v.items.map(x => x.base + ':' + x.state + ':' + x.why));
  // late F6: render rungs(); pack false greys l3 and l4; one rung false greys that rung; no rungs(): the old rule
  for (const target of ['as64', 'mowas2', 'goh']) {
    const all = { l0: true, l1: true, c0: true, l2: true, pack: true, l3: true, l4: true };
    const st = async rg => { useStubs({ render: rg }); const a = await call('GET', 'pictures?' + qs({ target, map: MAP, mode: 'combat' })); const o = {}; ((a.v && a.v.items) || []).forEach(x => { o[x.base] = x.state + ':' + (x.why || ''); }); return o; };
    let s = await st({ rungs: () => Object.assign({}, all, { pack: false }) });
    ok(s.l3 === 'notBuilt:part' && s.l4 === 'notBuilt:part' && s.l2 !== 'notBuilt:part' && s.l1 !== 'notBuilt:part', target + ': rungs pack false: l3 and l4 notBuilt why part at once', s);
    s = await st({ rungs: () => Object.assign({}, all, { l4: false }) });
    ok(s.l4 === 'notBuilt:part' && s.l3 !== 'notBuilt:part', target + ': rungs l4 false: only l4 notBuilt', s);
    s = await st({});
    ok(s.l4 !== 'notBuilt:part' && s.l3 !== 'notBuilt:part', target + ': render index without rungs(): the old rule', s);
  }
  useStubs();
  // the real table: rows with no job row are notBuilt (why part), edshot why wave; the real l4 row keys light
  useStubs({ table: TABLE });
  r = await call('GET', 'pictures?' + qs({ target: 'mowas2', map: MAP, mode: 'combat' }));
  ok(r.v && r.v.items.filter(x => !TABLE.JOBS[x.base]).every(x => x.state === 'notBuilt' && x.why === (x.base === 'edshot' ? 'wave' : 'part')), 'real table: rows without a job row are notBuilt', r.v && r.v.items.map(x => x.base + ':' + x.state + ':' + x.why));
  for (const target of ['as64', 'mowas2', 'goh']) {
    r = await call('GET', 'pictures?' + qs({ target, map: MAP, mode: 'night', light: 'mode', bases: 'l1,l4' }));
    const b = {}; ((r.v && r.v.items) || []).forEach(x => { b[x.base] = x; });
    const sorted = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
    ok(b.l1 && b.l1.state === 'need' && sorted(b.l1.need.args) === sorted({ map: MAP, mode: 'night', size: 2048 }) && b.l4 && b.l4.state === 'need' && sorted(b.l4.need.args) === sorted({ map: MAP, mode: 'night', size: TABLE.SIZE.l4, light: 'mode' }),
      target + ': real table: l1 need has the default size and no light; l4 need carries light mode', r.v ? [b.l1 && b.l1.need, b.l4 && b.l4.need] : r.e);
  }
  resetStubs();
  // known helpers
  ok(SRV._t.nameOf('multi/1v1 road', 'topo', null) === '1v1_road_topo.png' && SRV._t.nameOf('mv_fixture', 'l4', 4096) === 'mv_fixture_l4_4096.png', 'export name is ASCII, last key segment, size when asked');
}

// ---------- 2 the panel on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), log = [];
  const X = {};
  const win = Object.assign({ requestAnimationFrame: f => f() }, o.win || {});
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', [SHELL, PART].join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    win, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'pictures') };
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], jobs: [], emits: [], redraws: 0, boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: MAP, mode: 'combat', side: 'both', kind: 'inf', rmt: false, game: '<game>', mod: null, docBusy: false, jobs: [] }, o.q || {});
  const V = {
    q: n => q[n], doc: null, pal: PAL,
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { rec.emits.push([e, d]); (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, token: n => 'var-' + n, say() {}, addTool() {}, addHover() {}, relist() {},
    api(m, p, b) { rec.calls.push({ m, p, b: JSON.parse(JSON.stringify(b || {})) }); return (o.api ? o.api(m, p, b) : Promise.reject(new Error('no route'))); },
    job(w, a) { rec.jobs.push({ w, a }); return o.job ? o.job(w, a) : new Promise(() => {}); },
  };
  rec.V = V; rec.q = q;
  return rec;
}
function start(o) { const L0 = load(o); const Rc = stubV(L0, o); L0.part.init(Rc.V); return Object.assign(Rc, { L0 }); }
const blkIn = (box, id) => box.all().find(e => e.attrs['data-blk'] === id) || null;
const rowsOf = rc => { const l = blkIn(rc.boxes.pictures, 'mv.pictures.list'); return l ? l.children.filter(e => e.attrs['data-base']) : []; };
const rowOf = (rc, b) => rowsOf(rc).find(e => e.attrs['data-base'] === b) || null;
const btnOf = (row, key) => row && row.all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en[key]);
const statusOf = rc => (blkIn(rc.boxes.pictures, 'mv.pictures.status') || { textContent: '' }).textContent;
function mkView() { const v = { cx: 0, cy: 0, zoom: 1, w: 800, h: 600 }; v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom]; return v; }
const SIDE = (w, h, more) => Object.assign({ w, h, size: null, box: [-640, -480, 640, 480], rung: null, approx: false, brightness: 'fitted', gaps: [], notes: [], made: 'x', base: null }, more || {});
function answer(items) { return { v: 1, map: MAP, target: 'mowas2', mode: 'combat', items }; }
const IT = {
  topo: { base: 'topo', what: 'topo', part: 'raster', size: null, state: 'made', why: null, need: null, side: SIDE(128, 96), pack: null },
  l0: { base: 'l0', what: 'l0', part: 'render', size: null, state: 'need', why: null, need: { what: 'l0', args: { map: MAP, mode: 'combat' } }, side: null, pack: null },
  l1: { base: 'l1', what: 'l1', part: 'render', size: 2048, state: 'need', why: null, need: { what: 'l1', args: { map: MAP, mode: 'combat', size: 2048 } }, side: null, pack: null },
  l2: { base: 'l2', what: 'l2', part: 'render', size: 2048, state: 'made', why: null, need: null, side: SIDE(2048, 1536, { rung: 'l2', approx: true, brightness: 'unverified', gaps: ['RENDER_WATER_APPROX', 'RENDER_ZZZ_NEW'], notes: [{ code: null, text: 'water plane at z 0' }, { code: null, text: 'decal x: no sprite mtl' }] }), pack: null },
  l3: { base: 'l3', what: 'l3', part: 'render', size: 2048, state: 'made', why: null, need: null, side: SIDE(2048, 1536, { box: [1, 2, 3] }), pack: { defs: 5, instances: 7, failed: 0 } },
  l4: { base: 'l4', what: 'l4', part: 'render', size: 2048, state: 'made', why: null, need: null, side: SIDE(2048, 1536), pack: { defs: 5, instances: 7, failed: 1 } },
  painted: { base: 'painted', what: 'painted', part: 'paint', size: null, state: 'notBuilt', why: 'style', need: null, side: null, pack: null },
  edshot: { base: 'edshot', what: 'edshot', part: 'edshot', size: null, state: 'notBuilt', why: 'wave', need: null, side: null, pack: null },
  bogus: { base: 'bogus', what: 'bogus', part: 'paint', size: null, state: 'made', why: null, need: null, side: SIDE(1, 1), pack: null },
};
const listAns = () => answer(['topo', 'l0', 'l1', 'l2', 'l3', 'l4', 'painted', 'edshot', 'bogus'].map(k => JSON.parse(JSON.stringify(IT[k]))));

async function panelTests() {
  // RMT: nothing at all
  { const L0 = load(), Rc = stubV(L0, { q: { rmt: true } }); L0.part.init(Rc.V);
    ok(Rc.layers.length === 0 && Rc.panels.length === 0 && Rc.calls.length === 0, 'RMT: no layer, no panel, no call'); }
  // the panel and the layer, no call at build
  const tilesAsk = [];
  let tileAns = null;
  const api = (m, p, b) => {
    if (p === 'pictures') return Promise.resolve(listAns());
    if (p === 'tiles') { tilesAsk.push(b); return tileAns ? Promise.resolve(tileAns(b)) : Promise.reject(Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: b.base, args: {} } } })); }
    return Promise.reject(new Error('no route ' + p));
  };
  const A = start({ api });
  { const l = A.layers[0];
    ok(A.layers.length === 1 && l.id === 'picture' && l.group === 'base' && l.label === 'mapviz.pictures.layer' && l.engineTrue === false && l.defaultOn === false && typeof l.draw === 'function', 'layer picture: group base, off by default, draws itself');
    ok(A.panels.length === 1 && A.panels[0].id === 'pictures' && A.panels[0].side === 'right', 'panel pictures on the right');
    ok(['mv.pictures.title', 'mv.pictures.size', 'mv.pictures.light', 'mv.pictures.list', 'mv.pictures.status'].every(id => { const b = blkIn(A.boxes.pictures, id); return b && b.attrs['data-blkname'] && !/^mapviz\./.test(b.attrs['data-blkname']); }), 'the five blocks with names in words');
    const lsel = blkIn(A.boxes.pictures, 'mv.pictures.light'), lo = lsel && lsel.all().find(e => e.tagName === 'SELECT');
    ok(lo && same(lo.children.map(o => o.attrs.value), ['', 'mode']) && lo.children[0].textContent === L.en['mapviz.pictures.lightClean'], 'light picker: clean daylight (default), the mode light');
    const sel = A.boxes.pictures.all().find(e => e.tagName === 'SELECT');
    ok(sel && same(sel.children.map(o => o.attrs.value), ['', '1024', '2048', '4096', 'custom']), 'size picker: default, 1024, 2048, 4096, custom (the game uses come with the map)');
    ok(A.calls.length === 0, 'building makes no call');
    const st = blkIn(A.boxes.pictures, 'mv.pictures.status');
    ok(st.attrs.role === 'status' && st.attrs['aria-live'] === 'polite', 'status: role status, aria-live'); }
  // docBusy: no fetch; the doc event asks once with the mode
  A.q.docBusy = true; A.V.emit('map', { key: MAP, mode: 'combat', doc: null, user: true }); await H.flush();
  ok(A.calls.length === 0, 'document being read: no GET pictures');
  A.q.docBusy = false; A.V.emit('doc', { key: MAP, ok: true }); await H.flush();
  const pc = A.calls.filter(c => c.p === 'pictures');
  const CTXF = ['target', 'game', 'modDir', 'map', 'mode'];
  ok(pc.length === 1 && CTXF.every(k => !(k in pc[0].b)) && !('size' in pc[0].b), 'doc event: GET pictures once; the part sends no context field (the shell adds them) and no size at default', pc);
  ok(/QCOM=\{[^}]*\bpictures:1\b/.test(SHELL) && /QCOM=\{[^}]*'export':1\b/.test(SHELL), 'the shell adds the context to GET pictures and GET export (QCOM pictures:1, export:1)');
  // rows
  ok(same(rowsOf(A).map(r => r.attrs['data-base']), ['topo', 'l0', 'l1', 'l2', 'l3', 'l4', 'painted', 'edshot']), 'seeded: the item with an unknown base is not listed', rowsOf(A).map(r => r.attrs['data-base']));
  ok(rowOf(A, 'topo').has('made, 128 x 96') && btnOf(rowOf(A, 'topo'), 'mapviz.pictures.show') && btnOf(rowOf(A, 'topo'), 'mapviz.pictures.save') && !btnOf(rowOf(A, 'topo'), 'mapviz.pictures.make'), 'made row: size, Show, Save');
  ok(rowOf(A, 'l0').has(L.en['mapviz.pictures.notMade']) && btnOf(rowOf(A, 'l0'), 'mapviz.pictures.make') && !btnOf(rowOf(A, 'l0'), 'mapviz.pictures.show'), 'need row: not made, Make');
  ok(rowOf(A, 'painted').has(L.en['mapviz.pictures.notBuilt']) && !rowOf(A, 'painted').all().some(e => e.tagName === 'BUTTON') && /hint/.test(rowOf(A, 'painted').className), 'notBuilt row: greyed, no button');
  ok(rowOf(A, 'edshot').has(L.en['mapviz.pictures.notBuilt']), 'edshot row not built (wave E)');
  ok(rowOf(A, 'l3').has(L.en['mapviz.pictures.na']) && !btnOf(rowOf(A, 'l3'), 'mapviz.pictures.show') && !btnOf(rowOf(A, 'l3'), 'mapviz.pictures.save'), 'seeded: a sidecar box of 3 numbers: row not available, no Show or Save');
  ok(rowOf(A, 'l4').has('Objects: 5 kinds, 7 placed, 1 failed.'), 'l4 row: pack counts', rowOf(A, 'l4').textContent);
  // job words in place of Make: a job of what l1 with the need's args runs
  A.q.jobs = [{ id: 'j1', what: 'l1', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'combat', size: 2048 }, text: 'Drawing 3 of 9' }];
  A.V.emit('job', A.q.jobs[0]);
  ok(rowOf(A, 'l1').has('Drawing 3 of 9') && !btnOf(rowOf(A, 'l1'), 'mapviz.pictures.make'), 'a running job of the need: its words, no Make');
  A.q.jobs = [{ id: 'j2', what: 'l1', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'combat', size: 1024 }, text: 'other size' }];
  A.V.emit('job', A.q.jobs[0]);
  ok(btnOf(rowOf(A, 'l1'), 'mapviz.pictures.make') && !rowOf(A, 'l1').has('other size'), 'a job of another size leaves the Make button');
  A.q.jobs = [{ id: 'j3', what: 'l1', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'combat', size: 4096 }, text: 'JOB4096' }];
  A.V.emit('job', A.q.jobs[0]);
  ok(btnOf(rowOf(A, 'l1'), 'mapviz.pictures.make') && !rowOf(A, 'l1').has('JOB4096'), 'a 4096 job is not the default-size row\'s job (the need holds the default size)');
  A.q.jobs = [{ id: 'j4', what: 'l1', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'combat' }, text: 'default job' }];
  A.V.emit('job', A.q.jobs[0]);
  ok(rowOf(A, 'l1').has('default job') && !btnOf(rowOf(A, 'l1'), 'mapviz.pictures.make'), 'a job with no size (the default) is the default-size row\'s job');
  // brightness: a made l1..l4 row whose sidecar says unverified (GoH) says so in the row
  ok(rowOf(A, 'l2').has(L.en['mapviz.pictures.bright']) && !rowOf(A, 'l4').has(L.en['mapviz.pictures.bright']) && !rowOf(A, 'topo').has(L.en['mapviz.pictures.bright']), 'row l2 (brightness unverified) says brightness not checked; l4 (fitted) and topo do not');
  A.q.jobs = [];
  // Make posts once
  let endJob = null;
  const B = start({ api, job: () => new Promise((res) => { endJob = res; }) });
  B.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
  btnOf(rowOf(B, 'l0'), 'mapviz.pictures.make').click();
  ok(B.jobs.length === 1 && B.jobs[0].w === 'l0' && same(B.jobs[0].a, { map: MAP, mode: 'combat' }), 'Make posts the need: what and args', B.jobs);
  ok(rowOf(B, 'l0').has(L.en['mapviz.pictures.making']) && !btnOf(rowOf(B, 'l0'), 'mapviz.pictures.make'), 'while it is posted: making words, no button');
  const n0 = B.calls.filter(c => c.p === 'pictures').length;
  endJob({ state: 'done' }); await H.flush();
  ok(B.jobs.length === 1 && B.calls.filter(c => c.p === 'pictures').length === n0 + 1, 'a second press posted nothing; the end asks the list again once');
  // products: one ask while not made rows are there; a second products while it is in flight asks nothing more
  { let hold = null; const C = start({ api: (m, p, b) => (p === 'pictures' ? (hold ? new Promise(r => { hold = r; }) : Promise.resolve(listAns())) : api(m, p, b)) });
    C.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    const a0 = C.calls.length; hold = true;
    C.V.emit('products', {}); C.V.emit('products', {}); await H.flush();
    ok(C.calls.length === a0 + 1, 'products: the not made rows ask once', C.calls.length - a0);
    if (typeof hold === 'function') hold(listAns()); await H.flush(); }
  // Show: the picture event, the status, the layer draws the shown picture's tiles
  tileAns = b => ({ v: 1, kind: 'tiles', base: b.base, z: b.z, zmax: 0, w: 128, h: 96, ox: -640, oy: -480, cell: 10, box: [-640, -480, 640, 480], tiles: String(b.t).split(',').map(t => ({ t, png: 'iVBORw0KGgo=' })) });
  A.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
  btnOf(rowOf(A, 'topo'), 'mapviz.pictures.show').click();
  const pe = A.emits.filter(e => e[0] === 'picture');
  ok(pe.length === 1 && same(pe[0][1], { base: 'topo', size: null, from: 'pictures' }), 'Show emits picture {base, size, from pictures}', pe);
  ok(statusOf(A).indexOf('Shown: Topographic.') >= 0 && statusOf(A).indexOf(L.en['mapviz.pictures.tickLayer']) >= 0, 'status names the shown picture and asks for the layer tick', statusOf(A));
  A.V.emit('layers', { visible: ['base', 'picture'] });
  ok(statusOf(A).indexOf(L.en['mapviz.pictures.tickLayer']) < 0, 'layer visible: no tick hint');
  const log = [], ctx = H.stubCtx(log, { _id: 'main' }), view = mkView(), layer = A.layers[0];
  layer.draw(ctx, view); await H.flush(); layer.draw(ctx, view); await H.flush();
  ok(tilesAsk.length >= 1 && tilesAsk[0].base === 'topo' && log.some(x => x.op === 'drawImage'), 'the layer asks topo tiles and draws them', { asks: tilesAsk, ops: log.map(x => x.op) });
  // style shows l2 (made, approx, GoH-like notes): status notes, unknown code as "another gap" with the code as title
  A.V.emit('picture', { base: 'l2', size: null, from: 'style' });
  const stx = statusOf(A);
  ok(stx.indexOf('Shown: ' + L.en['mapviz.pictures.base.l2']) >= 0 && stx.indexOf(L.en['mapviz.pictures.approx']) >= 0 && stx.indexOf(L.en['mapviz.pictures.bright']) >= 0 && stx.indexOf(L.en['mapviz.pictures.gap.RENDER_WATER_APPROX']) >= 0 && stx.indexOf(L.en['mapviz.pictures.gapOther']) >= 0, 'picture event from style: shown, approximate, brightness, gap words, unknown gap', stx);
  ok(blkIn(A.boxes.pictures, 'mv.pictures.status').all().some(e => e.attrs.title === 'RENDER_ZZZ_NEW'), 'unknown gap code in the title attribute');
  { const sp = blkIn(A.boxes.pictures, 'mv.pictures.status').all().find(e => e.attrs.title === 'water plane at z 0\ndecal x: no sprite mtl');
    ok(sp && sp.textContent.indexOf(L.en['mapviz.pictures.notesMore'].replace('{n}', '2')) >= 0, 'plain text notes: one count in the status, the texts in the title', sp && sp.textContent); }
  // seeded: a tiles answer for another base is not drawn
  tilesAsk.length = 0; tileAns = b => ({ v: 1, kind: 'tiles', base: 'l1', z: 0, zmax: 0, w: 128, h: 96, ox: -640, oy: -480, cell: 10, box: [], tiles: [{ t: '0.0', png: 'AAAA' }] });
  const log2 = [], ctx2 = H.stubCtx(log2, { _id: 'main' });
  layer.draw(ctx2, view); await H.flush(); layer.draw(ctx2, view); await H.flush();
  ok(tilesAsk.length === 1 && tilesAsk[0].base === 'l2' && !log2.some(x => x.op === 'drawImage'), 'seeded: a tiles answer for another base is not drawn', { asks: tilesAsk, ops: log2.map(x => x.op) });
  // a context change drops the shown picture: the layer asks and draws nothing, no "Shown" line
  A.q.map = 'multi/other'; A.V.emit('map', { key: 'multi/other', mode: 'combat', doc: null, user: true }); await H.flush();
  tilesAsk.length = 0; const log3 = [];
  layer.draw(H.stubCtx(log3, { _id: 'main' }), view); await H.flush();
  ok(tilesAsk.length === 0 && !log3.length && statusOf(A).indexOf('Shown') < 0, 'context change: shown picture dropped, the layer draws nothing', statusOf(A));
  ok(rowsOf(A).length === 0, 'context change: the old list is dropped');
  A.q.map = null; A.V.emit('map', { key: null }); await H.flush();
  ok(blkIn(A.boxes.pictures, 'mv.pictures.list').has(L.en['mapviz.pictures.noMap']), 'map closed: the open-a-map line');
  // size picker: the list asks with the size
  { const D = start({ api }); D.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    const sel = D.boxes.pictures.all().find(e => e.tagName === 'SELECT'); sel.value = '4096'; sel.fire('change'); await H.flush();
    const last = D.calls.filter(c => c.p === 'pictures').pop();
    ok(last && last.b.size === 4096, 'size 4096: GET pictures with size', last);
    btnOf(rowOf(D, 'topo'), 'mapviz.pictures.show').click();
    ok(same(D.emits.filter(e => e[0] === 'picture').pop()[1], { base: 'topo', size: 4096, from: 'pictures' }), 'Show at size 4096 emits the size'); }
  // a failed list read: status line, rows stay as last known with "not read"
  { let failNow = false; const E = start({ api: (m, p, b) => (p === 'pictures' ? (failNow ? Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'disk' } })) : Promise.resolve(listAns())) : api(m, p, b)) });
    E.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    failNow = true; E.V.emit('products', {}); await H.flush();
    ok(rowsOf(E).length === 8 && rowOf(E, 'topo').has(L.en['mapviz.pictures.notRead']) && statusOf(E).length > 0, 'a failed GET pictures: rows stay with not read, a status line', statusOf(E)); }
  // a stale answer asks once more at once
  { let n = 0; const F = start({ api: (m, p) => (p === 'pictures' ? (++n === 1 ? Promise.reject({ stale: true, key: 'mapviz.err.MV_CANCELLED' }) : Promise.resolve(listAns())) : Promise.reject(new Error('x'))) });
    F.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    ok(n === 2 && rowsOf(F).length === 8 && statusOf(F) === '', 'stale: asked again at once, no fault line'); }
  // Save: no Blob or URL -> the line, no request
  { const G = start({ api }); G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    btnOf(rowOf(G, 'topo'), 'mapviz.pictures.save').click(); await H.flush();
    ok(!G.calls.some(c => c.p === 'export') && statusOf(G).indexOf(L.en['mapviz.pictures.noSave']) >= 0, 'Save with no Blob: the cannot save line, no request', statusOf(G)); }
  // Save with Blob and URL: GET export, a link clicked with the name
  { const made = [], clicks = [];
    const win = { URL: { createObjectURL: b => { made.push(b); return 'blob:x'; }, revokeObjectURL() {} }, Blob: function (parts, o) { this.parts = parts; this.type = o && o.type; } };
    const G = start({ win, api: (m, p, b) => (p === 'export' ? Promise.resolve({ v: 1, name: 'mv_fixture_topo.png', w: 128, h: 96, png: 'iVBORw0KGgo=' }) : api(m, p, b)) });
    G.L0.doc.body.addEventListener = G.L0.doc.body.addEventListener || (() => {});
    const mk = G.L0.doc.createElement; G.L0.doc.createElement = t => { const e = mk(t); if (String(t).toLowerCase() === 'a') e.click = () => clicks.push(e.attrs); return e; };
    G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    btnOf(rowOf(G, 'topo'), 'mapviz.pictures.save').click(); await H.flush();
    const ex = G.calls.find(c => c.p === 'export');
    ok(ex && ex.b.base === 'topo' && !('map' in ex.b) && !('target' in ex.b), 'Save asks GET export with the base (the shell adds the context)', ex);
    ok(made.length === 1 && made[0].type === 'image/png' && made[0].parts[0] instanceof Uint8Array && made[0].parts[0][1] === 0x50, 'the PNG bytes go into a Blob', made[0] && made[0].type);
    ok(clicks.length === 1 && clicks[0].download === 'mv_fixture_topo.png' && clicks[0].href === 'blob:x', 'a download link is clicked with the name', clicks);
    ok(statusOf(G).indexOf('Saved mv_fixture_topo.png (128 x 96).') >= 0, 'status: saved line', statusOf(G)); }
  // Save refused by the server (over 4096): the error line
  { const win = { URL: { createObjectURL: () => 'blob:x' }, Blob: function () {} };
    const G = start({ win, api: (m, p, b) => (p === 'export' ? Promise.reject(Object.assign(new Error('MV_USAGE'), { status: 400, key: 'mapviz.err.MV_USAGE', params: { msg: 'too big' } })) : api(m, p, b)) });
    G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    btnOf(rowOf(G, 'topo'), 'mapviz.pictures.save').click(); await H.flush();
    ok(statusOf(G).indexOf('too big') >= 0, 'a refused export: the error line', statusOf(G)); }
  // late F11: the size kit; its maths equals previews sizes (the server's), its faults are plain words
  { const KIT = load().X.mapviz.sizeKit, diff = [];
    const boxes = [[-2000, -1000, 2000, 1000], [0, 0, 1500, 1500], [-300, -900, 300, 900], [10, 20, 1033, 797]];
    const whs = [[1920, 1080], [400, 300], [960, 256], [1024, 600], [1500, 1500], [64, 8192], [8192, 64], [2560, 1440]];
    for (const b of boxes) for (const wh of whs) for (const f of SZ.FITS) { const a = KIT.longSide(b, wh[0], wh[1], f), c = SZ.longSide(b, wh[0], wh[1], f); if (a !== c) diff.push([b, wh, f, a, c]); }
    for (const b of boxes) for (const n of [64, 333, 1920, 8192]) { if (KIT.shapeH(b, n) !== SZ.shapeH(b, n) || KIT.shapeW(b, n) !== SZ.shapeW(b, n)) diff.push([b, n, 'shape']); }
    ok(!diff.length && KIT.MIN === SZ.MIN && KIT.MAX === SZ.MAX && same(KIT.FITS, SZ.FITS), 'size kit: long side and shape equal previews sizes on ' + boxes.length * whs.length * 3 + ' cases', diff.slice(0, 4));
    const kinds = [['0', 'badSmall'], ['-3', 'badWhole'], ['abc', 'badWhole'], ['12.5', 'badWhole'], ['9000', 'badBig'], ['', 'badEmpty'], ['63', 'badSmall']].map(([v, k]) => { const f = KIT.check(v, '100'); return f && f.k === 'mapviz.pictures.' + k; });
    ok(kinds.every(Boolean) && KIT.check('1920', '1080') === null && KIT.check(' 64 ', '8192') === null, 'size kit: 0, -3, abc, 12.5, 9000, empty and 63 are faults with their words; 1920 x 1080 and 64 x 8192 are good', kinds); }
  // the panel: game uses from GET previews/targets; a use asks the picture at its long side, Save asks exactly W x H
  { const made = [], tq = [];
    const win = { URL: { createObjectURL: b => { made.push(b); return 'blob:x'; }, revokeObjectURL() {} }, Blob: function (parts, o) { this.parts = parts; this.type = o && o.type; } };
    const TG = { v: 1, rows: [{ id: 'preview', state: 'write', size: [1920, 1080] }, { id: 'small', state: 'none', size: [400, 300] }, { id: 'minimap', state: 'write', size: [1500, 750] }, { id: 'header', state: 'write', size: [960, 256] }, { id: 'bogus', state: 'write', size: [10, 10] }] };
    const G = start({ win, api: (m, p, b) => (p === 'previews/targets' ? (tq.push(b), Promise.resolve(TG)) : p === 'export' ? Promise.resolve({ v: 1, name: 'mv_fixture_topo_1920x1080.png', w: 1920, h: 1080, png: 'iVBORw0KGgo=' }) : api(m, p, b)) });
    G.L0.doc.createElement = (mk => t => { const e = mk(t); if (String(t).toLowerCase() === 'a') e.click = () => {}; return e; })(G.L0.doc.createElement);
    G.V.doc = { boxes: { world: [-2000, -1000, 2000, 1000] } };
    G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    const sel = blkIn(G.boxes.pictures, 'mv.pictures.size').all().find(e => e.tagName === 'SELECT');
    ok(tq.length === 1 && same(sel.children.map(o => o.attrs.value), ['', '1024', '2048', '4096', 'use:preview', 'use:minimap', 'use:header', 'custom']), 'the game uses of the map are options (a file the game does not read and an unknown use are not)', sel.children.map(o => o.attrs.value));
    ok(sel.children[4].textContent === 'Loading screen: 1920 x 1080 px', 'a use option says its use and pixel size', sel.children[4].textContent);
    sel.value = 'use:preview'; sel.fire('change'); await H.flush();
    let last = G.calls.filter(c => c.p === 'pictures').pop();
    ok(last && last.b.size === 2160, 'use loading screen: GET pictures at the long side 2160 (previews sizes)', last && last.b);
    const note = () => blkIn(G.boxes.pictures, 'mv.pictures.size').all().find(e => e.tagName === 'P').textContent;
    ok(note().indexOf('stretched') >= 0 && note().indexOf('1920 x 1080') >= 0, 'the shape differs (2.00 against 1.78): the words say the map is stretched', note());
    const fitSel = blkIn(G.boxes.pictures, 'mv.pictures.size').all().filter(e => e.tagName === 'SELECT')[1];
    fitSel.value = 'crop'; fitSel.fire('change'); await H.flush();
    last = G.calls.filter(c => c.p === 'pictures').pop();
    ok(last && last.b.size === SZ.longSide([-2000, -1000, 2000, 1000], 1920, 1080, 'crop') && note().indexOf('cut off') >= 0, 'layout crop: its long side and its words', [last && last.b, note()]);
    btnOf(rowOf(G, 'topo'), 'mapviz.pictures.save').click(); await H.flush();
    const ex = G.calls.filter(c => c.p === 'export').pop();
    ok(ex && ex.b.out === '1920x1080' && ex.b.fit === 'crop' && ex.b.size === last.b.size, 'Save PNG asks exactly 1920 x 1080 with the layout', ex && ex.b);
    // custom: a fault keeps the last good size and says why; keep the map's shape fills the other side
    sel.value = 'custom'; sel.fire('change'); await H.flush();
    const ins = blkIn(G.boxes.pictures, 'mv.pictures.size').all().filter(e => e.tagName === 'INPUT');
    const [wIn, hIn, keepIn] = ins;
    ok(ins.length === 3 && wIn.value === '2048' && hIn.value === '1024' && keepIn.checked === true, 'custom: starts 2048 x 1024 (the map shape), keep the shape ticked', ins.map(e => e.value));
    wIn.value = '1000'; wIn.fire('change'); await H.flush();
    ok(hIn.value === '500', 'keep the shape: width 1000 fills height 500', hIn.value);
    last = G.calls.filter(c => c.p === 'pictures').pop();
    const n0 = G.calls.filter(c => c.p === 'pictures').length;
    for (const [v, k] of [['12.5', 'badWhole'], ['0', 'badSmall'], ['-3', 'badWhole'], ['9000', 'badBig'], ['abc', 'badWhole']]) {
      keepIn.checked = false; keepIn.fire('change');
      wIn.value = v; wIn.fire('change'); await H.flush();
      const words = L.en['mapviz.pictures.' + k].replace('{side}', 'width').replace('{n}', k === 'badBig' ? '8192' : '64').replace('{v}', v);
      ok(note().indexOf(words) >= 0 && note().indexOf(L.en['mapviz.pictures.keepLast']) >= 0, 'custom width ' + v + ': plain words, the last good size stays', note()); }
    ok(G.calls.filter(c => c.p === 'pictures').length === n0, 'a fault asks nothing new');
    wIn.value = '640'; wIn.fire('change'); hIn.value = '480'; hIn.fire('change'); await H.flush();
    last = G.calls.filter(c => c.p === 'pictures').pop();
    ok(last && last.b.size === SZ.longSide([-2000, -1000, 2000, 1000], 640, 480, 'crop'), 'custom 640 x 480: GET pictures at its long side', last && last.b); }
  // Make that ends 501 (a render rung not built): the row turns greyed
  { const G = start({ api, job: () => Promise.reject(Object.assign(new Error('MV_NOT_BUILT'), { status: 501, key: 'mapviz.err.MV_NOT_BUILT', params: { msg: 'RENDER_NOT_BUILT' } })) });
    G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    btnOf(rowOf(G, 'l1'), 'mapviz.pictures.make').click(); await H.flush();
    ok(rowOf(G, 'l1').has(L.en['mapviz.pictures.notBuilt']) && !btnOf(rowOf(G, 'l1'), 'mapviz.pictures.make'), 'Make ending 501: the row is greyed not built'); }
  // late F7: the light picker; the l4 row only; GoH mode light comes back with gap RENDER_ENV_PLACEHOLDER
  { const tl = [];
    const l4need = { base: 'l4', what: 'l4', part: 'render', size: 2048, state: 'need', why: null, need: { what: 'l4', args: { map: MAP, mode: 'combat', size: 2048, light: 'clean' } }, side: null, pack: null };
    const l4mode = { base: 'l4', what: 'l4', part: 'render', size: 2048, state: 'made', why: null, need: null, side: SIDE(128, 96, { rung: 'l4', gaps: ['RENDER_ENV_PLACEHOLDER'] }), pack: null };
    const win = { URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: function () {} };
    const G = start({ win, q: { target: 'goh' }, api: (m, p, b) => {
      if (p === 'pictures') return Promise.resolve(answer([JSON.parse(JSON.stringify(IT.topo)), JSON.parse(JSON.stringify(b.light === 'mode' ? l4mode : l4need))]));
      if (p === 'tiles') { tl.push(b); return Promise.resolve({ v: 1, kind: 'tiles', base: b.base, z: b.z, zmax: 0, w: 128, h: 96, ox: -640, oy: -480, cell: 10, box: [-640, -480, 640, 480], tiles: String(b.t).split(',').map(t => ({ t, png: 'iVBORw0KGgo=' })) }); }
      if (p === 'export') return Promise.resolve({ v: 1, name: 'mv_fixture_' + b.base + '.png', w: 128, h: 96, png: 'iVBORw0KGgo=' });
      return Promise.reject(new Error('no route ' + p)); } });
    G.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    ok(!('light' in G.calls.filter(c => c.p === 'pictures').pop().b), 'clean daylight: GET pictures with no light');
    btnOf(rowOf(G, 'l4'), 'mapviz.pictures.make').click();
    ok(G.jobs.length === 1 && G.jobs[0].w === 'l4' && G.jobs[0].a.light === 'clean', 'Make l4 posts the need with light clean', G.jobs);
    const lsel = blkIn(G.boxes.pictures, 'mv.pictures.light').all().find(e => e.tagName === 'SELECT');
    lsel.value = 'mode'; lsel.fire('change'); await H.flush();
    const lp = G.calls.filter(c => c.p === 'pictures').pop();
    ok(lp && lp.b.light === 'mode' && rowOf(G, 'l4') && rowOf(G, 'l4').has('made, 128 x 96'), 'the mode light: GET pictures with light mode, l4 made', lp);
    btnOf(rowOf(G, 'l4'), 'mapviz.pictures.show').click();
    ok(statusOf(G).indexOf(L.en['mapviz.pictures.gap.RENDER_ENV_PLACEHOLDER']) >= 0, 'GoH l4 in the mode light: the gap RENDER_ENV_PLACEHOLDER shows on the status line', statusOf(G));
    const lay = G.layers[0]; lay.draw(H.stubCtx([], { _id: 'main' }), mkView()); await H.flush();
    ok(tl.length >= 1 && tl.every(b => b.base === 'l4' && b.light === 'mode'), 'the l4 tiles are asked with light mode', tl);
    btnOf(rowOf(G, 'l4'), 'mapviz.pictures.save').click(); btnOf(rowOf(G, 'topo'), 'mapviz.pictures.save').click(); await H.flush();
    const ex = G.calls.filter(c => c.p === 'export');
    ok(ex.length === 2 && ex[0].b.base === 'l4' && ex[0].b.light === 'mode' && ex[1].b.base === 'topo' && !('light' in ex[1].b), 'Save l4 sends light mode; Save topo sends no light', ex.map(c => c.b));
    btnOf(rowOf(G, 'topo'), 'mapviz.pictures.show').click(); tl.length = 0; lay.draw(H.stubCtx([], { _id: 'main' }), mkView()); await H.flush();
    ok(tl.length >= 1 && tl.every(b => b.base === 'topo' && !('light' in b)), 'topo tiles: no light', tl); }
  // a failed first read: "not read" in place of "reading", 'products' asks again
  { let n = 0; const E = start({ api: (m, p) => (p === 'pictures' ? (++n === 1 ? Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'boom' } })) : Promise.resolve(listAns())) : Promise.reject(new Error('x'))) });
    E.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    const lb = blkIn(E.boxes.pictures, 'mv.pictures.list');
    ok(n === 1 && lb.has(L.en['mapviz.pictures.notRead']) && !lb.has(L.en['mapviz.pictures.reading']) && statusOf(E).indexOf('boom') >= 0, 'first read failed: not read line, the error on the status line', lb.textContent);
    E.V.emit('products', {}); await H.flush();
    ok(n === 2 && rowsOf(E).length === 8, 'products after a failed first read: asked again, rows shown', n); }
  // a tile header that failed is asked again on 'products'
  { let tn = 0; const tl = [];
    const T2 = start({ api: (m, p, b) => {
      if (p === 'pictures') return Promise.resolve(listAns());
      if (p === 'tiles') { tl.push(b); if (++tn === 1) return Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'blip' } }));
        return Promise.resolve({ v: 1, kind: 'tiles', base: b.base, z: b.z, zmax: 0, w: 128, h: 96, ox: -640, oy: -480, cell: 10, box: [-640, -480, 640, 480], tiles: String(b.t).split(',').map(t => ({ t, png: 'iVBORw0KGgo=' })) }); }
      return Promise.reject(new Error('x')); } });
    T2.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    btnOf(rowOf(T2, 'topo'), 'mapviz.pictures.show').click();
    const lay = T2.layers[0], lg = [];
    lay.draw(H.stubCtx(lg, { _id: 'main' }), mkView()); await H.flush(); lay.draw(H.stubCtx(lg, { _id: 'main' }), mkView()); await H.flush();
    const k1 = tl.length;
    T2.V.emit('products', {}); await H.flush();
    lay.draw(H.stubCtx(lg, { _id: 'main' }), mkView()); await H.flush(); lay.draw(H.stubCtx(lg, { _id: 'main' }), mkView()); await H.flush();
    ok(k1 === 1 && tl.length > k1 && lg.some(x => x.op === 'drawImage'), 'a failed tile header is asked again after products and then drawn', { k1, asks: tl.length, ops: lg.map(x => x.op) }); }
  // the panel speaks Chinese
  { const Z = start({ code: 'zh', api }); Z.V.emit('map', { key: MAP, mode: 'combat', doc: {}, user: true }); await H.flush();
    ok(Z.boxes.pictures.has(LP.zh['mapviz.pictures.title']) && rowOf(Z, 'topo').has(LP.zh['mapviz.pictures.base.topo']), 'zh: the panel in Chinese'); }
}

// ---------- 3 on the shell page ----------
async function pageTests() {
  for (const canvas of [false, true]) {
    const calls = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }) };
    let P = null, err = null;
    try { P = H.mkPage({ scripts: [SHELL, PART], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas, api: H.routeApi(routes, calls) }); } catch (e) { err = e; }
    const how = canvas ? 'with a canvas' : 'with no canvas';
    ok(!err && P && P.screen, 'shell page ' + how + ': builds', err && err.stack);
    if (!P) continue;
    P.screen.refresh(); await H.flush();
    ok(['mv.pictures.title', 'mv.pictures.size', 'mv.pictures.light', 'mv.pictures.list', 'mv.pictures.status'].every(id => H.blk(P.root, id)), 'shell page ' + how + ': the pictures blocks are there');
    ok(!calls.some(c => /pictures|export/.test(c.path)), 'shell page ' + how + ': no pictures call with no map');
    const BC = require('../../../test/blockcheck'), bp = BC.checkScreen(P.root, 'mapviz');
    ok(!bp.length, 'shell page ' + how + ': the GUI block rule holds', bp.slice(0, 6));
    const mvb = P.root.all().filter(e => /^mv\.pictures/.test(String(e.attrs['data-blk'] || '')));
    ok(mvb.length === 5 && mvb.every(e => e.attrs['data-blkname'] && !/^mapviz\./.test(e.attrs['data-blkname'])), 'shell page ' + how + ': block names in words');
  }
}

// ---------- 4 the real runner on the fixture ----------
async function realTests() {
  const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip: ' + what + ' is not built'); return null; } throw e; } };
  const fxmake = opt(() => require(path.join(ROOT, 'test/fxmake')), 'the fixture maker');
  const ST = opt(() => require('./shell.server'), 'the shell routes');
  if (!fxmake || !ST) return;
  SRV._t.reset(); ST._t.reset();
  const ALL = Object.assign({}, ST.routes, SRV.routes);
  const call2 = async (method, p, body) => { const r = ALL[method + ' /api/x/mapviz/' + p.split('?')[0]]; try { return { v: await r(new URL('/api/x/mapviz/' + p, 'http://x'), body === undefined ? null : body, {}) }; } catch (e) { return { e }; } };
  const WANT = { as2: { w: 128, h: 96 }, goh: { w: 256, h: 192 } };
  try {
    for (const form of ['as2', 'goh']) {
      const fx = fxmake.make(path.join(SCR, 'fx-' + form), { form });
      const ident = { target: fx.target, game: fx.gameDir };
      async function runJob(body) {
        const s = await call2('POST', 'job', Object.assign({}, ident, body));
        if (!s.v) return { e: s.e };
        let j = null; const end = Date.now() + 240000;
        while (Date.now() < end) { const g = await call2('GET', 'job?id=' + s.v.id); j = g.v; if (!j || ['done', 'failed', 'cancelled', 'timeout'].includes(j.state)) break; await new Promise(r => setTimeout(r, 30)); }
        return { v: j };
      }
      const q0 = qs({ target: fx.target, game: fx.gameDir, map: MAP });
      let r = await call2('GET', 'pictures?' + q0);
      const by0 = {}; ((r.v && r.v.items) || []).forEach(x => { by0[x.base] = x; });
      ok(r.v && r.v.items.length === 11 && r.v.items.every(x => x.state === 'need' || x.state === 'notBuilt') && by0.edshot.why === 'wave', 'real ' + form + ': empty cache: every row need or notBuilt, edshot why wave', r.v ? r.v.items.map(x => x.base + ':' + x.state) : r.e);
      ok(by0.topo && by0.topo.state === 'need' && by0.topo.need.what === 'topo', 'real ' + form + ': topo need', by0.topo);
      const jt = await runJob(Object.assign({ what: 'topo' }, by0.topo && by0.topo.need ? by0.topo.need.args : { map: MAP }));
      if (jt.e && /MV_NOT_BUILT/.test(String(jt.e.message))) { console.log('skip real ' + form + ' topo: raster topo not built'); continue; }
      ok(jt.v && jt.v.state === 'done', 'real ' + form + ': topo job done', jt.v || jt.e);
      r = await call2('GET', 'pictures?' + q0 + '&bases=topo');
      const t = r.v && r.v.items[0];
      ok(t && t.state === 'made' && t.side && t.side.w === WANT[form].w && t.side.h === WANT[form].h && Array.isArray(t.side.box) && t.side.box.length === 4, 'real ' + form + ': topo made, side ' + WANT[form].w + ' x ' + WANT[form].h, t);
      r = await call2('GET', 'export?' + q0 + '&base=topo');
      let img = null; try { img = r.v && PNG.decode(Buffer.from(r.v.png, 'base64')); } catch (e) { img = null; }
      ok(r.v && r.v.name === 'mv_fixture_topo.png' && t && r.v.w === t.side.w && r.v.h === t.side.h && img && img.w === r.v.w, 'real ' + form + ': GET export topo: name, w x h = the topo side', r.v ? { name: r.v.name, w: r.v.w, h: r.v.h } : r.e);
      r = await call2('GET', 'export?' + q0 + '&base=topo&size=8192');
      ok(shape(r.e, 400, 'MV_USAGE'), 'real ' + form + ': export size 8192 refused');
      const l1 = (await call2('GET', 'pictures?' + q0 + '&bases=l1')).v;
      if (l1 && l1.items[0].state === 'need') {
        const jl = await runJob(Object.assign({ what: 'l1' }, l1.items[0].need.args));
        ok(jl.v && jl.v.state === 'failed' && jl.v.error && jl.v.error.code === 'MV_NOT_FOUND', 'real ' + form + ': Make l1 ends failed MV_NOT_FOUND (the fixture has no ground mesh)', jl.v || jl.e);
      } else console.log('skip real ' + form + ' l1: ' + JSON.stringify(l1 && l1.items[0] && l1.items[0].state));
    }
  } finally { await ST._t.close(); }
}

// ---------- 5 language and script rules ----------
const CODES = ['en', 'ru', 'uk', 'zh'];
function langProblems(LW, used) {
  const bad = [];
  if (Object.keys(LW).sort().join() !== CODES.slice().sort().join()) bad.push('languages ' + Object.keys(LW).join());
  for (const k of used) for (const c of CODES) if (!(LW[c] && LW[c][k])) bad.push(c + ' missing ' + k);
  const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const c of CODES) for (const k of Object.keys(LW[c] || {})) {
    const v = LW[c][k];
    if (!/^mapviz\.pictures\./.test(k)) bad.push(c + ' prefix ' + k);
    if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k + ' TODO or dash');
    if (/\bas64\b/.test(v)) bad.push(c + ' ' + k + ' lower case as64');
    if (slots(v) !== slots(LW.en[k])) bad.push(c + ' ' + k + ' slots');
    if (!(k in LW.en)) bad.push(c + ' extra ' + k);
    if (c !== 'en' && v === LW.en[k] && !/^\{n\}/.test(v)) bad.push(c + ' ' + k + ' not translated');
  }
  return bad;
}
function langTests() {
  const SRC = String(PART), used = new Set();
  for (const m of SRC.matchAll(/'(mapviz\.pictures\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
  for (const b of SRV._t.BASES) used.add('mapviz.pictures.base.' + b);
  for (const k of ['saved', 'noSave', 'notMadeSave']) used.add('mapviz.pictures.' + k);
  // the size kit's keys built from a name: the sides, the game uses, the layouts and their shape words
  for (const k of ['side.w', 'side.h', 'use.preview', 'use.small', 'use.minimap', 'use.header', 'use.header_interface', 'fit.stretch', 'fit.backdrop', 'fit.crop', 'shape.stretch', 'shape.backdrop', 'shape.crop']) used.add('mapviz.pictures.' + k);
  const GAPS = ['RENDER_MATERIAL_MISSING', 'RENDER_MATERIAL_BAD', 'RENDER_TEXTURE_MISSING', 'RENDER_TEXTURE_BAD', 'RENDER_LAYERS_SHORT', 'RENDER_NO_VCOLOR',
    'RENDER_GLOBAL_MISSING', 'RENDER_GLOBAL_NORMAL', 'RENDER_UNCOVERED', 'RENDER_NO_SHADE', 'RENDER_DECAL_SIZE', 'RENDER_DECAL_TEXTURE', 'RENDER_WATER_PLANE',
    'RENDER_WATER_APPROX', 'RENDER_MODEL_MISSING', 'RENDER_MODEL_BAD', 'RENDER_OBJ_TEXTURE', 'RENDER_TEXMOD_MISSING', 'RENDER_LIGHTMAP_MISSING', 'RENDER_ENV_MISSING',
    'RENDER_ENV_PLACEHOLDER', 'RENDER_GRASS_MISSING', 'RENDER_GRASS_BAD', 'PAINT_NO_WATER_MASKS', 'PAINT_NO_OBJECTS', 'PAINT_NO_LANDFORM', 'PAINT_BASE_SCHEMATIC',
    'PAINT_BASE_MINIMAP', 'PAINT_BASE_APPROX', 'PAINT_NO_MATERIAL', 'PAINT_BASE_UNREAD', 'PAINT_INPUT_MADE', 'PAINT_MARKS_DROPPED',
    'RENDER_PART_UNPLACED', 'RENDER_NO_GROUND', 'RENDER_BAD_POSITION', 'PAINT_INPUT_ABSENT', 'PAINT_DROWN_VEHICLE_ONLY', 'RENDER_BASE_REDRAWN'];
  for (const g of GAPS) used.add('mapviz.pictures.gap.' + g);
  // every gap or sidecar note code the render and paint code writes (gaps.add/push, pack note(), notes.push({code})) has words
  const srcCodes = new Set(), walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test') walk(p); } else if (/\.js$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      for (const m of t.matchAll(/(?:gaps\.(?:add|push)\(|\bnote\(|notes\.push\(\{ code: )'((?:RENDER|PAINT)_[A-Z0-9_]+)'/g)) srcCodes.add(m[1]); } } };
  walk(path.join(ROOT, 'render')); walk(path.join(ROOT, 'paint'));
  const wordless = [...srcCodes].filter(c => !LP.en['mapviz.pictures.gap.' + c]);
  ok(srcCodes.size >= 20 && !wordless.length, 'lang: every gap and note code that render and paint write has words (' + srcCodes.size + ' codes scanned)', wordless);
  const bad = langProblems(LP, used);
  ok(!bad.length, 'lang: four languages, every used key (' + used.size + '), prefix, slots, no TODO, no dash, AS64 in capitals, translated', bad.slice(0, 10));
  const unused = Object.keys(LP.en).filter(k => !used.has(k));
  ok(!unused.length, 'lang: every key in the file is used', unused);
  const cut = JSON.parse(JSON.stringify(LP)); delete cut.zh['mapviz.pictures.base.sketch'];
  ok(langProblems(cut, used).some(p => /zh missing mapviz\.pictures\.base\.sketch/.test(p)), 'seeded: a lang file missing one zh key is caught');
  ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC) && !/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(fs.readFileSync(path.join(__dirname, 'pictures.server.js'), 'utf8')), 'no colour literal in the part');
  ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const');
  ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]|\/(home|Users|usr)\//.test(SRC), 'no drive or user path pattern in the page script');
  ok(!/target\s*===?\s*'(as64|mowas2|goh)'|'as64'|'goh'|'mowas2'/.test(SRC), 'the page has no game branch (owner rule: the same abilities on the three games)');
  for (const f of ['pictures.client.js', 'pictures.server.js']) { const s = fs.readFileSync(path.join(__dirname, f), 'utf8'); ok(!s.includes('\r') && !/[^\x00-\x7f]/.test(s), f + ' is ASCII with LF'); }
}

(async () => {
  await serverTests();
  await panelTests();
  await pageTests();
  langTests();
  await realTests();
  if (OWN) try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { /* a child may still hold a file */ }
  if (failN) { console.log('FAIL mapviz pictures: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz pictures (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz pictures: ' + (e && e.stack || e)); process.exit(1); });
