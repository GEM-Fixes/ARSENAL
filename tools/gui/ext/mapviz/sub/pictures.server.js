// Map Viewer pictures part, server side (MV-PG4, builder PG4a): the page-pg4 draft section 4 (routes) and 5 (items).
//   <common> = shell.server.js lib.COMMON (target, game, mods, modDir, map, mode, side, kind, size, phase, at, pose, light)
//   GET pictures?<common>&bases=a,b&size=n   ->{v:1, map, target, mode, items:[item]}: one row per picture base, in the
//                                               order topo, l0, l1, l2, l3, l4, staff, painted, recon, sketch, edshot
//   GET export?<common>&base=b&size=n        -> {v:1, name, w, h, png:'<base64>'}: the whole picture, rows north up, alpha
//                                               kept; the long side is capped at 4096 (MV_USAGE above it)
//   GET export?...&size=L&out=WxH&fit=f      -> {v:1, name, w:W, h:H, png, out:{w, h, fit}, from:[w, h]}: the picture of
//                                               long side L (the job's own size: the page asks the long side previews
//                                               sizes.longSide gives for W x H at that layout) made exactly W x H, north up,
//                                               opaque; fit stretch (default), backdrop (fit with bars) or crop; W and H whole
//                                               pixels 64..8192 and L at most 8192, else 400 MV_USAGE in plain words
// A picture size (size) above 8192 is refused on GET pictures and GET export (the page's sizes stop there).
// Rules held here (tools/mapviz/README.md 6.1, 6.2):
// - A GET never starts a job. A picture not in the cache is state 'need' with need {what, args} (args = map + the job's
//   own key fields, as the shell's needOf); GET export answers 404 MV_NOT_FOUND with params.need.
// - Keys only through jobs/cache.js entryKey with the table.JOBS row; no route builds a key itself.
// - notBuilt: no job row (why 'wave' for edshot: its import is wave E; why 'part' for a row not added yet), the job's part
//   not built (why 'part'), or a paint style whose state in paint styles.list() is not 'built' (why 'style').
// - The same rows and the same rules on as64, mowas2 and goh: nothing here branches on the target. What differs per game
//   (GoH brightness unverified, GoH ocean approx, recon never from the GoH minimap) comes in the sidecars the parts write.
// - Nothing is written: the page saves the export through a Blob link.
// - Errors, arguments, the request (with the wave C and D fields phase, at, pose, light) and the need come from
//   shell.server.js lib (late F9), so this part does not fork them. The l4 row keys `light` (clean, mode; late F7).
// - A render rung whose render index rungs() value is false is notBuilt why 'part' at once; pack false greys l3 and l4
//   (late F6). A render index without rungs(): the old rule.
// Test seam: module.exports._t.use({gridfile, png, paint, render, partState}) replaces the modules (paint null = paint
// index absent; render null = render index absent; partState(part) -> 'built' | 'not built' | 'broken'); _t.reset() puts
// the real ones back. The cache and the table are the shell's (lib.mod): stub them with shell.server.js _t.use.
// Author: Imperator_Aug (ARSENAL, ia-252ecc40)
'use strict';
const fs = require('fs'), path = require('path');
const MV = require('../../../../mapviz/mapviz');
const lib = require('./shell.server').lib;

const { fail, wrap, query } = lib;
const COMMON = lib.COMMON;
const KEYED = ['mode', 'kind', 'side', 'size', 'phase', 'at', 'pose', 'light'];   // dropped for a row that does not key them
const BASES = ['topo', 'l0', 'l1', 'l2', 'l3', 'l4', 'staff', 'painted', 'recon', 'sketch', 'edshot'];
const STYLES = ['staff', 'painted', 'recon', 'sketch'];
const PART = { topo: 'raster', l0: 'render', l1: 'render', l2: 'render', l3: 'render', l4: 'render', staff: 'paint', painted: 'paint',
  recon: 'paint', sketch: 'paint', edshot: 'edshot' };
const PACKED = { l3: 1, l4: 1 };
const MAXSIDE = 4096, MAXOUT = 8192;

// ---- modules: lazy, replaceable in tests (cache and table through the shell's lib.mod) ----
const REAL = {
  cache: () => lib.mod('cache'),
  table: () => lib.mod('table'),
  gridfile: () => lib.mod('gridfile'),
  png: () => MV.opt(() => require('../../../../mapviz/lib/raster/png'), '../../../../mapviz/lib/raster/png', __filename),
  sizes: () => require('../../../../mapviz/previews/sizes'),
  paint: () => MV.opt(() => require('../../../../mapviz/paint/index'), '../../../../mapviz/paint/index', __filename),
  render: () => MV.opt(() => require('../../../../mapviz/render/index'), '../../../../mapviz/render/index', __filename),
};
let STUB = {};
const M = name => (name !== 'cache' && name !== 'table' && Object.prototype.hasOwnProperty.call(STUB, name) ? STUB[name] : REAL[name]());

// ---- arguments: the shell's request (README 6.2 and jobs.md 2 fields); a picture size is above 0 ----
function request(q) {
  const r = lib.request(q, true);
  if (r.size !== undefined && r.size < 1) throw fail('MV_USAGE', 'size must be a whole number above 0, got ' + q.size);
  if (r.size !== undefined && r.size > MAXOUT) throw fail('MV_USAGE', 'size is at most ' + MAXOUT + ' pixels on the long side, got ' + q.size);
  return r;
}
// outOf(q) -> null | {w, h, fit}: the exact size of a saved picture (previews sizes: plain words, MV_USAGE)
function outOf(q) {
  if (q.out === undefined && q.fit === undefined) return null;
  if (q.out === undefined) throw fail('MV_USAGE', 'fit goes with out (the width x height of the saved picture)');
  const Z = M('sizes');
  try { const o = Z.parseOut(q.out); return { w: o.w, h: o.h, fit: Z.checkFit(q.fit) }; } catch (e) { throw fail('MV_USAGE', e && e.message); }
}

// ---- what is built ----
function partState(part) {
  if (typeof STUB.partState === 'function') return STUB.partState(part);
  const p = MV.findPart(part);
  return p ? MV.partState(p) : 'not built';
}
// the paint styles' states from paint styles.list() (the same function `paint styles --json` prints); paint absent: {}
function styleStates() {
  const out = {};
  let P;
  try { P = M('paint'); } catch (e) { return out; }   // a paint index that throws on load: every style is not built here
  if (!P || !P.styles || typeof P.styles.list !== 'function') return out;
  let list;
  try { list = P.styles.list(); } catch (e) { return out; }
  for (const s of Array.isArray(list) ? list : []) if (s && STYLES.includes(s.id)) out[s.id] = typeof s.state === 'string' ? s.state : 'not built';
  return out;
}
const keys = (row, k) => Array.isArray(row.keys) && row.keys.includes(k);
const hasSize = row => keys(row, 'size');
// the request for one row: a field the row does not key is left out (size, light, ...)
function reqFor(row, req) { const r = Object.assign({}, req); for (const k of KEYED) if (!keys(row, k)) delete r[k]; return r; }
// the need (lib.needOf), with the effective size and light of a row that keys them, so the page can tell a running job
// of the default size or light from one of another size or light (table.reduce leaves defaults out)
function needOf(what, row, req, size) {
  const n = lib.needOf(what, req);
  if (hasSize(row) && size != null && n.args.size == null) n.args.size = size;
  if (keys(row, 'light') && n.args.light == null) n.args.light = 'clean';
  return n;
}
// render rungs() once per request (late F6): {l0.., pack, l3, l4} or null when the render index has no rungs()
function rungsOf() {
  let R;
  try { R = M('render'); } catch (e) { return null; }
  if (!R || typeof R.rungs !== 'function') return null;
  try { const r = R.rungs(); return r && typeof r === 'object' ? r : null; } catch (e) { return null; }
}
function rungOff(base, rungs) { return !!rungs && (rungs[base] === false || ((base === 'l3' || base === 'l4') && rungs.pack === false)); }
function open(what, row, req) {
  const C = M('cache');
  return C.open(C.entryKey(Object.assign({}, req, { what, row }))) || null;
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
// the item's side from pic.<base>.json (README 4.4 common sidecar, render.md 3.2, paint.md 3); fields copied as they are,
// the page checks them (a box that is not 4 numbers is "not available" there)
// one sidecar note: {code, text} (render.md 3.2), a string 'CODE: text' (l3 writes its notes so), or plain text (l1,
// l2 and l4 write their notes so): plain text is kept as {code: null, text}; a note with neither code nor text is dropped
const NOTE_MAX = 500;
function noteOf(n) {
  const cut = s => String(s).slice(0, NOTE_MAX);
  if (typeof n === 'string') {
    if (!n.trim()) return null;
    const m = /^([A-Z][A-Z0-9_]+):\s*([\s\S]*)$/.exec(n);
    return m ? { code: m[1], text: cut(m[2]) } : { code: null, text: cut(n) };
  }
  if (!n || typeof n !== 'object') return null;
  const text = typeof n.text === 'string' ? cut(n.text) : '';
  if (typeof n.code === 'string' && n.code) return { code: n.code, text };
  return text.trim() ? { code: null, text } : null;
}
function sideOf(dir, base, part) {
  const s = readJson(path.join(dir, 'pic.' + base + '.json'));
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const b = s.base && typeof s.base === 'object' && part === 'paint' && typeof s.base.from === 'string'
    ? { from: s.base.from, approx: s.base.approx == null ? null : !!s.base.approx } : null;
  return { w: num(s.w), h: num(s.h), size: num(s.size), box: Array.isArray(s.box) ? s.box.slice(0, 8) : null, rung: typeof s.rung === 'string' ? s.rung : null,
    approx: !!s.approx, brightness: typeof s.brightness === 'string' ? s.brightness : null,
    gaps: Array.isArray(s.gaps) ? s.gaps.filter(g => typeof g === 'string').slice(0, 50) : [],
    notes: Array.isArray(s.notes) ? s.notes.map(noteOf).filter(n => n).slice(0, 50) : [],
    made: typeof s.made === 'string' ? s.made : null, base: b };
}
// pack counts of the cached pack.json of the mode (render.md 3.3: the page reads counts only), else null
function packOf(req) {
  const T = M('table'), row = T.JOBS.pack;
  if (!row || partState(row.part) !== 'built') return null;
  let hit;
  try { hit = open('pack', row, T.reduce(req, 'pack')); } catch (e) { return null; }
  if (!hit) return null;
  const j = readJson(path.join(hit.dir, 'pack.json')), c = j && j.counts;
  if (!c || typeof c !== 'object') return null;
  const n = v => (Number.isInteger(v) && v >= 0 ? v : null);
  return { defs: n(c.defs), instances: n(c.instances), failed: n(c.failed) };
}
// one item of GET pictures
// cx = {styles, rungs} read once per request
function itemOf(base, req, cx) {
  const T = M('table'), what = base, row = T.JOBS[what];
  const it = { base, what, part: row ? row.part : PART[base], size: null, state: 'notBuilt', why: null, need: null, side: null, pack: null };
  if (!row) { it.why = base === 'edshot' ? 'wave' : 'part'; return it; }
  if (partState(row.part) !== 'built') { it.why = 'part'; return it; }
  if (row.part === 'render' && rungOff(base, cx.rungs)) { it.why = 'part'; return it; }
  if (STYLES.includes(base) && cx.styles[base] !== 'built') { it.why = 'style'; return it; }
  const r = reqFor(row, req);
  if (hasSize(row)) it.size = r.size != null ? r.size : (T.SIZE && T.SIZE[what] != null ? T.SIZE[what] : null);
  let hit;
  try { hit = open(what, row, r); } catch (e) {
    if (e && e.code === 'MV_NOT_BUILT') { it.why = 'part'; return it; }
    throw e;
  }
  if (!hit) { it.state = 'need'; it.need = needOf(what, row, r, it.size); return it; }
  it.state = 'made';
  it.side = sideOf(hit.dir, base, row.part);
  if (PACKED[base]) it.pack = packOf(req);
  return it;
}
// the export file name: <last map key segment>_<base>[_<size>].png, ASCII
function nameOf(map, base, size) {
  const last = String(map).split('/').filter(Boolean).pop() || 'map';
  const safe = last.replace(/[^A-Za-z0-9_.-]/g, '_');
  return safe + '_' + base + (size != null ? '_' + size : '') + '.png';
}
// the world box of a picture: its sidecar box, else the grid's own frame
function boxOfGrid(g, dir, base) {
  const sc = readJson(path.join(dir, 'pic.' + base + '.json'));
  if (sc && Array.isArray(sc.box) && sc.box.length === 4 && sc.box.every(v => typeof v === 'number' && isFinite(v)) && sc.box[2] > sc.box[0] && sc.box[3] > sc.box[1]) return sc.box.slice();
  const cy = (g.meta && g.meta.cellY) || g.cell;
  return [g.ox, g.oy, g.ox + g.w * g.cell, g.oy + g.h * cy];
}

// ---- routes ----
const R = {};
R['GET /api/x/mapviz/pictures'] = wrap(async u => {
  const q = query(u, COMMON.concat(['bases']));
  const req = request(q);
  let bases = BASES;
  if (q.bases !== undefined) {
    const want = String(q.bases).split(',').filter(Boolean);
    const bad = want.filter(b => !BASES.includes(b));
    if (bad.length) throw fail('MV_USAGE', 'bases must be among ' + BASES.join(', ') + ', got ' + bad.join(', '));
    bases = BASES.filter(b => want.includes(b));
  }
  const cx = { styles: styleStates(), rungs: rungsOf() };
  return { v: 1, map: req.map, target: req.target, mode: req.mode || null, items: bases.map(b => itemOf(b, req, cx)) };
});

R['GET /api/x/mapviz/export'] = wrap(async u => {
  const q = query(u, COMMON.concat(['base', 'out', 'fit']));
  if (!q.base) throw fail('MV_USAGE', 'base is required (a picture name such as topo)');
  if (!BASES.includes(q.base)) throw fail('MV_USAGE', 'base must be one of ' + BASES.join(', ') + ', got ' + q.base);
  const want = outOf(q);
  delete q.out; delete q.fit;
  const req = request(q);
  const cap = want ? MAXOUT : MAXSIDE;
  if (req.size != null && req.size > cap) throw fail('MV_USAGE', 'the saved picture is at most ' + cap + ' pixels on its long side, asked ' + req.size);
  const it = itemOf(q.base, req, { styles: styleStates(), rungs: rungsOf() });
  if (it.state === 'notBuilt') throw fail('MV_NOT_BUILT', 'the picture ' + q.base + ' is not built in this version');
  if (it.state === 'need') throw fail('MV_NOT_FOUND', q.base + ' of this map is not made yet', it.need);
  const P = M('png');
  if (!P || typeof P.encode !== 'function') throw fail('MV_NOT_BUILT', 'the PNG writer is not built yet');
  const row = M('table').JOBS[q.base], hit = open(q.base, row, reqFor(row, req));
  if (!hit) throw fail('MV_NOT_FOUND', q.base + ' of this map is not made yet', needOf(q.base, row, reqFor(row, req), it.size));
  let g;
  try { g = M('gridfile').read(path.join(hit.dir, 'pic.' + q.base + '.mvg')); } catch (e) { throw fail('MV_FAULT', 'picture ' + q.base + ' is not a sound grid file: ' + e.message); }
  if (!g || g.etype !== 'rgba8') throw fail('MV_FAULT', 'picture ' + q.base + ' is not an rgba8 grid');
  if (g.w > cap || g.h > cap) throw fail('MV_USAGE', 'the saved picture is at most ' + cap + ' pixels on its long side; this one is ' + g.w + ' x ' + g.h);
  // grid row 0 = min world y (south); PNG row 0 is the top: north up
  const src = g.data instanceof Uint8Array ? g.data : new Uint8Array(g.data.buffer, g.data.byteOffset, g.data.byteLength);
  if (want) {
    let px;
    try { px = M('sizes').fitTo({ w: g.w, h: g.h, data: src, box: boxOfGrid(g, hit.dir, q.base) }, want.w, want.h, want.fit); } catch (e) { throw fail(e && e.code === 'MV_USAGE' ? 'MV_USAGE' : 'MV_FAULT', e && e.message); }
    const top = new Uint8Array(want.w * want.h * 4), ln = want.w * 4;
    for (let j = 0; j < want.h; j++) top.set(px.subarray((want.h - 1 - j) * ln, (want.h - j) * ln), j * ln);
    const pb = P.encode({ w: want.w, h: want.h, rgba: top });
    return { v: 1, name: nameOf(req.map, q.base, want.w + 'x' + want.h), w: want.w, h: want.h, png: Buffer.from(pb).toString('base64'), out: want, from: [g.w, g.h] };
  }
  const out = new Uint8Array(g.w * g.h * 4), line = g.w * 4;
  for (let j = 0; j < g.h; j++) out.set(src.subarray((g.h - 1 - j) * line, (g.h - j) * line), j * line);
  const buf = P.encode({ w: g.w, h: g.h, rgba: out });
  return { v: 1, name: nameOf(req.map, q.base, req.size), w: g.w, h: g.h, png: Buffer.from(buf).toString('base64') };
});

module.exports = {
  routes: R,
  _t: {
    use(o) { STUB = Object.assign({}, o || {}); },
    reset() { STUB = {}; },
    BASES, STYLES, MAXSIDE, MAXOUT, fail, needOf, nameOf, sideOf, itemOf, outOf,
  },
};
