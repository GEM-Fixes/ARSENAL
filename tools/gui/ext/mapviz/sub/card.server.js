// Map Viewer object card, server side (MV-PG2, builder PG2b; freeze page-pg2.md 6.3): GET card answers one catalogue
// entry of the map's entcat product.
//   GET /api/x/mapviz/card ? target, game, mods, modDir, map, mode, def (+ side, kind, size, phase, at, pose, light: taken
//   and not used, so the shell may add its common fields)
//   -> {v:1, kind:'card', target, map, mode (null when none), def, entry}; entry = the entry as entcat.json stores it with props left out and
//   volumes replaced by {n, able:{<able key>: count}}; a def in catalog.failed -> entry null, failed {code, msg}.
//   Errors: 400 MV_USAGE (no target, no map, no def, def over 200 characters, holding a control character or a
//   .. part; any other name is taken: vanilla maps place #stone01, burn_grass1#1, lci(l), plates 2), 404 MV_NOT_FOUND need {what:'entcat', args} (the entcat entry is not made), 404 MV_NOT_FOUND without need (the
//   def is not in the catalogue), 500 MV_FAULT (entcat.json unreadable).
// Rules: the key only through jobs/cache.js entryKey with table.JOBS.entcat (README 6.2); the need is the request reduced
// through table.reduce. Reads only; writes nothing; never starts a job. One parsed entcat.json is kept per entry folder and
// manifest time, at most two, so clicks do not read a large GoH catalogue again.
// Test seam: module.exports._t.use({cache, table}) replaces the modules, _t.reset() puts the real ones back.
// Author: Imperator_Aug (ARSENAL, ia-c044db45)
'use strict';
const fs = require('fs'), path = require('path');
const MV = require('../../../../mapviz/mapviz');

const STATUS = { MV_USAGE: 400, MV_NOT_FOUND: 404, MV_BUSY: 409, MV_CANCELLED: 409, MV_REFUSED: 403, MV_NOT_BUILT: 501, MV_FAULT: 500 };
const ALLOWED = ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'side', 'kind', 'size', 'phase', 'at', 'pose', 'light', 'def'];
// the def is only a key into catalog.entries, never a file path: any printable name (vanilla has #, (, ) and spaces)
const DEF_RE = /^[^\x00-\x1f\x7f]{1,200}$/;
const MEMO_MAX = 2;

const REAL = {
  cache: () => require('../../../../mapviz/jobs/cache'),
  table: () => require('../../../../mapviz/jobs/table'),
};
let STUB = {};
const M = name => (STUB[name] !== undefined ? STUB[name] : REAL[name]());
let MEMO = [];   // [{dir, made, cat}], newest first

function fail(code, msg, need) {
  const c = STATUS[code] ? code : 'MV_FAULT';
  const params = { msg: String(msg || c) };
  if (need) params.need = need;
  return Object.assign(new Error(c), { status: STATUS[c], key: 'mapviz.err.' + c, params });
}
const isOurs = e => e && typeof e.key === 'string' && /^mapviz\.err\./.test(e.key) && e.params;
function wrap(fn) {
  return async (u, body, ctx) => {
    try { return await fn(u, body, ctx || {}); } catch (e) {
      if (isOurs(e)) throw e;
      if (e && typeof e.code === 'string' && STATUS[e.code]) throw fail(e.code, e.message);
      throw fail('MV_FAULT', e && e.message);
    }
  };
}
function query(u) {
  const o = {};
  for (const [k, v] of u.searchParams) {
    if (!ALLOWED.includes(k)) throw fail('MV_USAGE', 'unknown argument ' + k + ' (this route takes ' + ALLOWED.join(', ') + ')');
    if (k === 'modDir') { if (v) (o.modDirs = o.modDirs || []).push(v); } else if (v !== '') o[k] = v;
  }
  return o;
}
function checkDef(d) {
  if (!d) throw fail('MV_USAGE', 'def is required (an object name as the objects layer gives it)');
  if (!DEF_RE.test(d) || d.split(/[\\/]/).some(p => p === '..'))
    throw fail('MV_USAGE', 'def ' + JSON.stringify(d.slice(0, 80)) + ' is not an object name (1 to 200 characters, no control character, no .. part)');
  return d;
}
// the entcat request (README 6.2): identity fields and mode; the row's Keys column decides what enters the key
function request(q) {
  if (!q.target) throw fail('MV_USAGE', 'target is required: the page gives it (as64, mowas2 or goh)');
  if (!MV.TARGETS[q.target]) throw fail('MV_USAGE', 'target must be as64, mowas2 or goh, got ' + q.target);
  if (!q.map) throw fail('MV_USAGE', 'map is required (a map key such as multi/1v1_road)');
  const r = { target: q.target, map: q.map };
  for (const k of ['game', 'mods', 'mode']) if (q[k] !== undefined) r[k] = q[k];
  if (q.modDirs) r.modDirs = q.modDirs;
  return r;
}
const NEED_DROP = ['what', 'target', 'game', 'mods', 'modDirs', 'map'];
function needOf(req) {
  const r = M('table').reduce(req, 'entcat'), args = {};
  if (r.map) args.map = r.map;
  for (const k of Object.keys(r)) if (!NEED_DROP.includes(k) && r[k] !== undefined && r[k] !== null) args[k] = r[k];
  return { what: 'entcat', args };
}
function catalogOf(hit) {
  const dir = hit.dir, made = hit.manifest && hit.manifest.made != null ? hit.manifest.made : null;
  const i = MEMO.findIndex(m => m.dir === dir && m.made === made);
  if (i >= 0) { const m = MEMO[i]; MEMO.splice(i, 1); MEMO.unshift(m); return m.cat; }
  let cat;
  try { cat = JSON.parse(fs.readFileSync(path.join(dir, 'entcat.json'), 'utf8')); } catch (e) { throw fail('MV_FAULT', 'the object catalogue cannot be read: ' + e.message); }
  if (!cat || typeof cat !== 'object' || !cat.entries || typeof cat.entries !== 'object' || Array.isArray(cat.entries))
    throw fail('MV_FAULT', 'the object catalogue holds no entries');
  MEMO = [{ dir, made, cat }].concat(MEMO.filter(m => m.dir !== dir)).slice(0, MEMO_MAX);
  return cat;
}
// the entry as the card shows it: props left out, volumes counted per able key
function cardEntry(e) {
  const out = {};
  for (const k of Object.keys(e)) if (k !== 'props' && k !== 'volumes') out[k] = e[k];
  const vols = Array.isArray(e.volumes) ? e.volumes : [];
  const able = {};
  for (const v of vols) for (const [k, on] of Object.entries((v && v.able) || {})) if (on) able[k] = (able[k] || 0) + 1;
  out.volumes = { n: vols.length, able };
  return out;
}

const R = {};
R['GET /api/x/mapviz/card'] = wrap(async u => {
  const q = query(u);
  const def = checkDef(q.def);
  const req = request(q);
  const T = M('table'), row = T.JOBS.entcat;
  if (!row) throw fail('MV_FAULT', 'no job named entcat');
  const key = M('cache').entryKey(Object.assign({}, req, { what: 'entcat', row }));
  const hit = M('cache').open(key);
  if (!hit) throw fail('MV_NOT_FOUND', 'the object list of this map is not made yet', needOf(req));
  const cat = catalogOf(hit);
  const base = { v: 1, kind: 'card', target: req.target, map: req.map, mode: req.mode == null ? null : req.mode, def };
  // the catalogue keys are lower-case def names (README 1.7): the def as given first, then lower-case
  const lo = def.toLowerCase(), has = k => Object.prototype.hasOwnProperty.call(cat.entries, k);
  const e = has(def) ? cat.entries[def] : has(lo) ? cat.entries[lo] : null;
  if (e && typeof e === 'object') return Object.assign(base, { entry: cardEntry(e) });
  const f = Array.isArray(cat.failed) ? cat.failed.find(x => x && (x.def === def || x.def === lo)) : null;
  if (f) return Object.assign(base, { entry: null, failed: { code: String(f.code || 'MV_FAULT'), msg: String(f.msg || '') } });
  throw fail('MV_NOT_FOUND', 'object ' + def + ' is not in the catalogue of this map');
});

module.exports = {
  routes: R,
  _t: {
    use(o) { STUB = Object.assign({}, o || {}); MEMO = []; },
    reset() { STUB = {}; MEMO = []; },
    memo() { return MEMO.map(m => ({ dir: m.dir, made: m.made })); },
    cardEntry, checkDef, needOf, STATUS,
  },
};
