// Map Viewer rule layers, server side (MV-PG2, builder PG2a): GET /api/x/mapviz/sight/pair (freeze page-pg2.md late G4
// and ruling 12; jobs.md J11 and 5.2). The layers themselves read GET layer and GET json of the shell and post jobs
// through POST job.
//   query: target, game, mods, modDir (repeatable), map, mode, kind (inf, mg, at, tank; default inf), pose (stand, kneel,
//          prone; default stand), from=x,y[,zM], to=x,y[,zM] (world u; zM = metres over the ground, default the pose eye)
//   answer: {v:1, see, visibleHeightM, fire:{clear, block, at}, distM} (= `sight pair --json`)
// - No job row: the answer is worked out in process through rules/sight (cli.js pair, the same code as the CLI) from the
//   cached entries sight (sight.grid, ground, field, fire top and bottom, sight.json profile), grids (height, gtype,
//   grids.json W) and doc (mapdoc.json, for the mode's water level). A GET never starts a job: an entry not made answers
//   404 with params.need (sight first: {what:'sight', args:{map, mode}}).
// - Same on as64, mowas2 and goh: the game branch lives in rules/sight (cell 7 or 5 u, the goh vision rows); this route
//   has no game number.
// - Keys, needs and errors through the shell's route library (shell.server.js module.exports.lib: query, request, entry,
//   fail, wrap, readJson, mod), so no key is built here. 400 MV_USAGE: an unknown argument, from or to not two or three
//   numbers, a kind that is not a unit kind, a bad pose. 501 MV_NOT_BUILT while the shell lib or rules/sight is missing.
// Test seam: module.exports._t.use({lib, pair}) puts a lib and a pair function in place of the real ones; _t.reset().
// Author: Imperator_Aug (ARSENAL, ia-830ff8dd)
'use strict';
const path = require('path');

const ARGS = ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'kind', 'pose', 'from', 'to'];
const KINDS = ['inf', 'mg', 'at', 'tank'];
let STUB = {};
const MEMO = [];   // the last two loaded inputs {k, I}: a drag of the profile tool does not read the grids again

const libOk = L => !!(L && ['entry', 'query', 'request', 'fail', 'readJson'].every(f => typeof L[f] === 'function'));
function shellLib() {
  if (Object.prototype.hasOwnProperty.call(STUB, 'lib')) return libOk(STUB.lib) ? STUB.lib : null;
  let s = null;
  try { s = require('./shell.server'); } catch (e) { return null; }
  return libOk(s && s.lib) ? s.lib : null;
}
function pairFn() {
  if (Object.prototype.hasOwnProperty.call(STUB, 'pair')) return typeof STUB.pair === 'function' ? STUB.pair : null;
  try { const c = require('../../../../mapviz/rules/sight/cli'); return typeof c.pair === 'function' ? c.pair : null; } catch (e) { return null; }
}
function bare(code, status, msg) {
  return Object.assign(new Error(code), { status, key: 'mapviz.err.' + code, params: { msg } });
}

// point(s) -> [x, y] or [x, y, zM]: two or three finite numbers, nothing else; null when it is not
function point(s) {
  const p = String(s === undefined ? '' : s).split(',');
  if (p.length !== 2 && p.length !== 3) return null;
  const n = [];
  for (const t of p) {
    if (!/^\s*[+-]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?\s*$/i.test(t)) return null;
    const v = Number(t);
    if (!Number.isFinite(v)) return null;
    n.push(v);
  }
  return n;
}

// the inputs of pair from the three cache entries; read once per entry pair (manifest made time)
function inputs(L, req) {
  const hs = L.entry('sight', req), hg = L.entry('grids', req), hd = L.entry('doc', req);
  const made = h => (h.manifest && h.manifest.made != null ? h.manifest.made : '');
  const k = [hs.dir, made(hs), hg.dir, made(hg), hd.dir, made(hd), req.mode || ''].join('|');
  const m = MEMO.find(x => x.k === k);
  if (m) return m.I;
  const gf = typeof L.mod === 'function' ? L.mod('gridfile') : require('../../../../mapviz/lib/raster/gridfile');
  const rd = (dir, n) => { try { return gf.read(path.join(dir, n + '.mvg')); } catch (e) { throw L.fail('MV_FAULT', n + ' cannot be read: ' + e.message); } };
  const sj = L.readJson(path.join(hs.dir, 'sight.json'), 'sight.json');
  if (!sj || sj.v !== 1 || !sj.profile || !sj.profile.viewers) throw L.fail('MV_FAULT', 'sight.json has no vision profile');
  let gm = null;
  try { gm = L.readJson(path.join(hg.dir, 'grids.json'), 'grids.json'); } catch (e) { gm = null; }
  const grids = { height: rd(hg.dir, 'height'), gtype: rd(hg.dir, 'gtype'), W: gm && typeof gm.w === 'number' ? gm.w : undefined };
  const doc = L.readJson(path.join(hd.dir, 'mapdoc.json'), 'mapdoc.json');
  let W = grids.W === undefined ? null : grids.W;
  try { W = require('../../../../mapviz/rules/sight/fire').wOf(doc, req.mode, grids); } catch (e) { /* stub pair in tests: the grids W */ }
  const sg = { grid: rd(hs.dir, 'sight.grid'), ground: rd(hs.dir, 'sight.ground'), field: rd(hs.dir, 'sight.field') };
  const fg = { top: rd(hs.dir, 'sight.fire.top'), bottom: rd(hs.dir, 'sight.fire.bottom'), height: grids.height, gtype: grids.gtype || null, W };
  const I = { sg, fg, grids, prof: sj.profile };
  MEMO.unshift({ k, I });
  MEMO.length = Math.min(MEMO.length, 2);
  return I;
}

async function getPair(L, u, fn) {
  const q = L.query(u, ARGS);
  const fa = point(q.from), fb = point(q.to);
  if (!fa) throw L.fail('MV_USAGE', 'from must be x,y or x,y,zM (world u, metres over the ground), got ' + (q.from === undefined ? 'nothing' : q.from));
  if (!fb) throw L.fail('MV_USAGE', 'to must be x,y or x,y,zM (world u, metres over the ground), got ' + (q.to === undefined ? 'nothing' : q.to));
  const kind = q.kind === undefined ? 'inf' : q.kind;
  if (!KINDS.includes(kind)) throw L.fail('MV_USAGE', 'kind must be inf, mg, at or tank, got ' + kind);
  const r0 = Object.assign({}, q);
  delete r0.from; delete r0.to;
  const req = L.request(r0, true);           // checks target, map and pose as every route does
  const pose = req.pose || 'stand';
  const I = inputs(L, req);
  let r;
  try { r = fn(I.sg, I.fg, I.grids, I.prof, fa, fb, { pose, kind }); } catch (e) {
    if (e && e.code === 'MV_USAGE') throw L.fail('MV_USAGE', e.message);
    throw L.fail('MV_FAULT', 'sight pair: ' + (e && e.message));
  }
  if (!r || typeof r.see !== 'boolean' || !r.fire) throw L.fail('MV_FAULT', 'sight pair gave no answer');
  return { v: 1, see: r.see, visibleHeightM: r.visibleHeightM === undefined ? null : r.visibleHeightM,
    fire: { clear: !!r.fire.clear, block: r.fire.block === undefined ? null : r.fire.block, at: r.fire.at === undefined ? null : r.fire.at },
    distM: r.distM };
}

const R = {};
R['GET /api/x/mapviz/sight/pair'] = async (u, body, ctx) => {
  const L = shellLib();
  if (!L) throw bare('MV_NOT_BUILT', 501, 'the sight pair route waits for the shell route library');
  const fn = pairFn();
  const run = async x => { if (!fn) throw L.fail('MV_NOT_BUILT', 'the sight rules are not built yet'); return getPair(L, x, fn); };
  return (typeof L.wrap === 'function' ? L.wrap(run) : run)(u, body, ctx);
};

module.exports = {
  routes: R,
  _t: { use(o) { STUB = Object.assign({}, o || {}); MEMO.length = 0; }, reset() { STUB = {}; MEMO.length = 0; }, point, getPair, shellLib, pairFn, ARGS, KINDS },
};
