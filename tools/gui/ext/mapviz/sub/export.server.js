// Map Viewer export part, server side (MV-PG4c, page-pg4.md 4 and 7): the routes behind "Use as map previews" and the
// editor shot plan. Every route under /api/x/mapviz/. The same routes and rules for target as64, mowas2 and goh: the game
// differences live in the previews part (targets, guard) and in edshot (EXES); nothing here switches an ability off by game.
//   GET  previews/targets   target, map, mode?        -> {v:1, target, map, kind, rows:[{id, file, size, format, mips, state,
//                           why, tag, source, marks, compose, notes}]} from previews targets(); GoH minimap: sketch when the
//                           sketch style is built, else real + note PRV_FALLBACK_SOURCE. The minimap size is filled from
//                           the cached map document when there is one (else null)
//   POST previews/plan      common + mod, targets?, source?, marks?, compose?, set?, title?, minimapSize?, all?  -> plan JSON
//   POST previews/write     plan body + planHash (required), best?, renameStronger?   -> {id, state:'running'}
//   POST previews/deploy-list  common + mod, source?, marks?, compose?, set?, title?, minimapSize?  -> what a deploy of
//                           every file writes, read only (stats the mod, starts nothing): {v:1, target, map, kind, size,
//                           files:[{id, file, path, size, format, mips, action:'new'|'replace', source, marks, compose,
//                           problem}], skipped:[{id, file, path, why}], needs:[{what, args}]}. size = the long side the
//                           source pictures are made at (previews sizes.matchLong over the files); needs = the pictures to
//                           make first (the page posts each as a job); problem = a source that cannot be made here (code)
// all: true (plan, write) = the deploy: every file the game reads (targets refused with it), CLI write --all (a failing file
// is reported in failed and the rest land in one journal entry, undone as one step); the source pictures are looked up at
// a cached size of at least the deploy's long side (that size, 2048, 4096), else the need names that long side.
//   GET  previews/run       id                        -> {id, what, map, state, stage, done, total, elapsed, result?, error?}
//   POST previews/cancel    {id}                      -> {id, state}
//   POST previews/check     common + mod, targets?    -> the check answer (previews.md 11)
//   POST previews/undo      common + mod, n?, confirm:true  -> {id, state:'running'} (polled as a write)
//   POST edshot/plan        {target, game?, root?, map}  -> the dry editor shot plan (starts: false); `start` -> 501
// Rules held here:
// - The one page route that writes outside the cache: previews write and undo, into the mod folder the page picked, after
//   the page's confirm (planHash or confirm:true). No planHash or no confirm -> 403 PRV_CONFIRM and no child starts.
// - Children only through jobs/pool.js spawnRun (process.execPath running mapviz.js). Plan, check 120 s; write 600 s,
//   undo 120 s. One write or undo at a time (409 MV_BUSY). Run files under <cache root>/runs/prv-<id>/; the last 5 kept.
// - --in = the cache entry folders of doc, grids, terrain, water, entcat (when cached) and of the chosen sources; a source
//   that is not cached answers 404 with params.need (real: the best cached of l4, l3, l2, l1 at size 2048, else need l1).
// - The mod folder comes in the body only, never in a URL, and is never echoed: answers and messages name '<mod>'.
// - edshot plan reads the process list (tasklist, through edshot preflight) and stats the folder; it starts nothing.
// - JOBS (tools/gui/README.md "JOBS"): a write, undo or deploy run is one 'bg' job of the GUI job list (what
//   job.w.previews {map}, page mapviz, writes: true; stage, done and total read from the run's progress file twice a
//   second; ended on every path). The footer's Cancel and POST previews/cancel both end in stopRun(). The child of
//   plan and check lives inside its request: that request can be stopped while the child lives (ctx.job.onCancel), and it
//   dies too when the page goes away. deploy-list and edshot/plan start no child of their own, so they cannot be stopped.
// Test seam: module.exports._t.use({run, edshot, edshotIo, previews, styles, cache, table, jobs, game, partBuilt, now})
// replaces the modules, _t.reset() puts the real ones back.
// Author: Imperator_Aug (ARSENAL, ia-af2e5181)
'use strict';
const fs = require('fs'), path = require('path');
const MV = require('../../../../mapviz/mapviz');

const STATUS = { MV_USAGE: 400, MV_NOT_FOUND: 404, MV_BUSY: 409, MV_CANCELLED: 409, MV_REFUSED: 403, MV_NOT_BUILT: 501, MV_FAULT: 500 };
const TIDS = ['preview', 'small', 'minimap', 'header', 'header_interface'];
const SET_KEYS = ['source', 'marks', 'compose', 'strong', 'danger'];
const SOURCES = ['real', 'l0', 'l1', 'l2', 'l3', 'l4', 'topo', 'edshot', 'staff', 'painted', 'recon', 'sketch'];
const PAINT_STYLES = ['staff', 'painted', 'recon', 'sketch'];
const RUNGS = ['l4', 'l3', 'l2', 'l1'];
const REAL_SIZE = 2048;
const COMMON_BODY = ['target', 'game', 'mods', 'modDirs', 'map', 'mode', 'kind'];
const PLAN_BODY = COMMON_BODY.concat(['mod', 'targets', 'source', 'marks', 'compose', 'set', 'title', 'minimapSize', 'all']);
const LIST_BODY = COMMON_BODY.concat(['mod', 'source', 'marks', 'compose', 'set', 'title', 'minimapSize']);
const TIMEOUT = { plan: 120, check: 120, undo: 120, write: 600 };
const KEEP_RUNS = 5;
// editor per target (edshot EXES ids); time span per editor (design 8 [I]); as64 always -instance 1 (ruling)
const EDITOR = { as64: 'as64_ed', mowas2: 'mowas_2_ed', goh: 'goh_ed' };
const SECS = { as64_ed: [35, 50], mowas_2_ed: [25, 40], goh_ed: [150, 270] };
const ED_FILES = ['minimap_render.png', 'minimap_render.png.temp'];

// ---- modules: lazy, replaceable in tests ----
const REAL = {
  previews: () => MV.opt(() => require('../../../../mapviz/previews/index'), '../../../../mapviz/previews/index', __filename),
  sizes: () => require('../../../../mapviz/previews/sizes'),
  paint: () => MV.opt(() => require('../../../../mapviz/paint/index'), '../../../../mapviz/paint/index', __filename),
  edshot: () => require('../../../../mapviz/edshot/index'),
  cache: () => require('../../../../mapviz/jobs/cache'),
  table: () => require('../../../../mapviz/jobs/table'),
  jobs: () => require('../../../../mapviz/jobs/index'),
  run: () => require('../../../../mapviz/jobs/pool').spawnRun(),
  game: () => o => MV.gameFolder(o),
  partBuilt: () => name => { const p = MV.findPart(name); return !!p && MV.partState(p) === 'built'; },
  now: () => () => Date.now(),
};
let STUB = {}, RUNFN = null;
const M = name => {
  if (STUB[name] !== undefined) return STUB[name];
  if (name === 'run') { if (!RUNFN) RUNFN = REAL.run(); return RUNFN; }
  return REAL[name]();
};

// ---- errors ----
// fail(code, msg, extra) -> the error shape of README 6.1; extra = {need?, code? (the part's own code, PRV_* or EDSHOT_*)}
function fail(code, msg, extra) {
  const c = STATUS[code] ? code : 'MV_FAULT';
  const params = { msg: String(msg || c) };
  if (extra && extra.need) params.need = extra.need;
  if (extra && extra.code) params.code = String(extra.code);
  return Object.assign(new Error(c), { status: STATUS[c], key: 'mapviz.err.' + c, params });
}
const isOurs = e => e && typeof e.key === 'string' && /^mapviz\.err\./.test(e.key) && e.params;
function wrap(fn) {
  return async (u, body, ctx) => {
    try { return await fn(u, body, ctx || {}); } catch (e) {
      if (isOurs(e)) throw e;
      const dc = e && e.detail && typeof e.detail.code === 'string' ? e.detail.code : null;
      if (e && typeof e.code === 'string' && MV.CODES[e.code] !== undefined) throw fail(e.code, e.message, dc ? { code: dc } : null);
      throw fail('MV_FAULT', e && e.message);
    }
  };
}

// ---- arguments ----
function query(u, allowed) {
  const o = {};
  for (const [k, v] of u.searchParams) {
    if (!allowed.includes(k)) throw fail('MV_USAGE', 'unknown argument ' + k + ' (this route takes ' + allowed.join(', ') + ')');
    if (k === 'modDir') { if (v) (o.modDirs = o.modDirs || []).push(v); } else if (v !== '') o[k] = v;
  }
  return o;
}
function bodyOf(b, allowed) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw fail('MV_USAGE', 'the body must be a JSON object');
  for (const k of Object.keys(b)) if (!allowed.includes(k)) throw fail('MV_USAGE', 'unknown field ' + k + ' (this route takes ' + allowed.join(', ') + ')');
  return b;
}
function needTarget(q) {
  if (!q.target) throw fail('MV_USAGE', 'target is required: the page gives it (as64, mowas2 or goh)');
  if (!MV.TARGETS[q.target]) throw fail('MV_USAGE', 'target must be as64, mowas2 or goh, got ' + q.target);
}
function needMap(q) { if (typeof q.map !== 'string' || !q.map) throw fail('MV_USAGE', 'map is required (a map key such as multi/1v1_road)'); }
const kindOf = map => (/^single\//.test(String(map)) ? 'sp' : 'mp');
const str = (v, what) => { if (v !== undefined && v !== null && typeof v !== 'string') throw fail('MV_USAGE', what + ' must be text'); return v; };
// the common request of a body: target, game, mods, modDirs, map, mode, kind (kind only for strong and danger)
function common(b) {
  needTarget(b); needMap(b);
  const r = { target: b.target, map: b.map };
  if (b.game !== undefined && b.game !== null) r.game = str(b.game, 'game');
  if (b.mods !== undefined && b.mods !== null) r.mods = str(b.mods, 'mods');
  if (b.mode !== undefined && b.mode !== null) r.mode = str(b.mode, 'mode');
  if (b.kind !== undefined && b.kind !== null) { if (MV.KINDS.indexOf(b.kind) < 0) throw fail('MV_USAGE', 'kind must be one of ' + MV.KINDS.join(', ')); r.kind = b.kind; }
  if (b.modDirs !== undefined && b.modDirs !== null) {
    if (!Array.isArray(b.modDirs) || b.modDirs.some(d => typeof d !== 'string' || !d)) throw fail('MV_USAGE', 'modDirs must be a list of folders');
    r.modDirs = b.modDirs.slice();
  }
  return r;
}
function modOf(b) {
  if (typeof b.mod !== 'string' || !b.mod) throw fail('MV_USAGE', 'mod is required: the mod folder the page picked', { code: 'PRV_MOD_MISSING' });
  return path.resolve(b.mod);
}
function targetsOf(b) {
  if (b.targets === undefined || b.targets === null) return null;
  if (b.all === true) throw fail('MV_USAGE', 'all writes every file the game reads for the map; leave targets out', { code: 'PRV_SET' });
  if (!Array.isArray(b.targets) || !b.targets.length || b.targets.some(t => TIDS.indexOf(t) < 0)) throw fail('MV_USAGE', 'targets must be a list of ' + TIDS.join(', '), { code: 'PRV_SET' });
  return b.targets.slice();
}
// set: {'<target>.<key>': value}; keys of SET_KEYS; values text or 0/1 (strong, danger)
function setOf(b) {
  if (b.set === undefined || b.set === null) return {};
  if (typeof b.set !== 'object' || Array.isArray(b.set)) throw fail('MV_USAGE', 'set must be an object of target.key: value', { code: 'PRV_SET' });
  const out = {};
  for (const k of Object.keys(b.set)) {
    const m = /^([a-z_]+)\.([a-z]+)$/.exec(k), v = b.set[k];
    if (!m || TIDS.indexOf(m[1]) < 0 || SET_KEYS.indexOf(m[2]) < 0) throw fail('MV_USAGE', 'set key ' + k + ' is not target.key (' + SET_KEYS.join(', ') + ')', { code: 'PRV_SET' });
    if (m[2] === 'strong' || m[2] === 'danger') {
      if (!(v === 1 || v === 0 || v === true || v === false || v === '1' || v === '0')) throw fail('MV_USAGE', 'set ' + k + ' must be 1 or 0', { code: 'PRV_SET' });
      out[k] = (v === 1 || v === true || v === '1') ? '1' : '0';
    } else {
      if (typeof v !== 'string' || !/^[a-z0-9_]+$/.test(v)) throw fail('MV_USAGE', 'set ' + k + ' must be a word', { code: 'PRV_SET' });
      if (m[2] === 'source' && SOURCES.indexOf(v) < 0) throw fail('MV_USAGE', 'source ' + v + ' is not one of ' + SOURCES.join(', '), { code: 'PRV_SET' });
      out[k] = v;
    }
  }
  return out;
}
// a message from a child or a lib, with the mod and game folders named, never spelled out
function clean(msg, dirs) {
  let s = String(msg || '');
  for (const [d, name] of dirs) if (d) { const a = String(d), b = a.replace(/\\/g, '/'), j = a.replace(/\\/g, '\\\\'); for (const x of [j, a, b]) if (x.length > 2) s = s.split(x).join(name); }
  return s;
}

// ---- previews and styles ----
function previews() { const P = M('previews'); return P || null; }
function needPreviews() {
  const P = previews();
  if (!P || typeof P.targets !== 'function') throw fail('MV_NOT_BUILT', 'map previews are not built yet');
  return P;
}
function cliBuilt() { return !!M('partBuilt')('previews'); }
// the style list (paint styles.list() in process); paint absent: every style not built
function styleList() {
  const s = STUB.styles;
  if (Array.isArray(s)) return s;
  if (typeof s === 'function') return s();
  const P = M('paint');
  if (P && P.styles && typeof P.styles.list === 'function') { try { return P.styles.list(); } catch (e) { return []; } }
  return [];
}
const sketchBuilt = () => styleList().some(r => r && r.id === 'sketch' && r.state === 'built');
// the default source of a target (previews.md 3, design 11): real; GoH minimap sketch, or real with PRV_FALLBACK_SOURCE
function defaults(target, id) {
  if (id === 'minimap') {
    if (target === 'goh') return sketchBuilt() ? { source: 'sketch', marks: 'none', compose: 'stretch', notes: [] } : { source: 'real', marks: 'none', compose: 'stretch', notes: ['PRV_FALLBACK_SOURCE'] };
    return { source: 'real', marks: 'none', compose: 'stretch', notes: [] };
  }
  return { source: 'real', marks: 'flags', compose: 'stretch', notes: [] };
}

// ---- cache entries (keys only through cache.entryKey with the table row, README 6.2) ----
function rowOf(what) { const J = M('table').JOBS; return J && J[what] ? J[what] : null; }
function needOf(what, req) {
  const r = M('table').reduce(req, what), args = {};
  if (r.map) args.map = r.map;
  for (const k of Object.keys(r)) if (['what', 'target', 'game', 'mods', 'modDirs', 'map'].indexOf(k) < 0 && r[k] !== undefined && r[k] !== null) args[k] = r[k];
  return { what, args };
}
function open(what, req) {
  const row = rowOf(what);
  if (!row) return null;
  const C = M('cache');
  const key = C.entryKey(Object.assign({}, req, { what, row }));
  return C.open(key) || null;
}
function must(what, req) {
  if (!rowOf(what)) throw fail('MV_NOT_BUILT', 'the ' + what + ' picture is not built yet');
  const hit = open(what, req);
  if (!hit) throw fail('MV_NOT_FOUND', what + ' of this map is not made yet', { need: needOf(what, req) });
  return hit;
}
function sizeFor(what) { const S = M('table').SIZE || {}; return S[what] !== undefined ? S[what] : undefined; }
// inDirs(req, sources, strong, full) -> [dir]; the first missing need -> 404 need (previews.md 13, page-pg4.md 4)
// real and recon: the best cached rung at 2048, else need l1 (late F3: paint recon takes a base picture, not pic.recon).
// strong or danger tick: the strong entry of kind inf, phase null (late F4). marks full: the routes entry of kind inf,
// phase null when cached, never a need (late F4).
const TICK_REQ = { kind: 'inf', phase: null };
// o = {all: long side L of a deploy | undefined, collect: {needs:[], problems:[]} | undefined}. all: a sized source is
// taken at a cached size >= L (L, 2048, 4096 in that order; real: rung before size), else its need names size L. collect:
// a need or a source that cannot be made is gathered (problems [{source, code, msg}]) instead of thrown (deploy-list).
function inDirs(req, sources, strong, full, o) {
  o = o || {};
  const dirs = [], add = h => { if (h && h.dir && dirs.indexOf(h.dir) < 0) dirs.push(h.dir); };
  const base = { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map };
  const withMode = Object.assign({}, base, req.mode ? { mode: req.mode } : {});
  const L = o.all, sizes = L ? [L, REAL_SIZE, 4096].filter((z, i, a) => z >= L && a.indexOf(z) === i) : null;
  const sized = (what, z) => Object.assign({}, withMode, z !== undefined ? { size: z } : {});
  const keep = (src, fn) => {
    if (!o.collect) return fn();
    try { return fn(); } catch (e) {
      const nd = e && e.params && e.params.need;
      if (nd) { if (!o.collect.needs.some(x => JSON.stringify(x) === JSON.stringify(nd))) o.collect.needs.push(nd); return null; }
      o.collect.problems.push({ source: src, code: (e && e.params && e.params.code) || (e && e.message) || 'MV_FAULT', msg: e && e.params ? e.params.msg : String(e && e.message) });
      return null;
    }
  };
  add(must('doc', base));
  for (const w of ['grids', 'terrain', 'water', 'entcat']) { try { add(open(w, withMode)); } catch (e) { /* not cached, or no row: optional */ } }
  for (const s of sources) keep(s, () => {
    if (s === 'real' || s === 'recon') {
      let hit = null;
      for (const r of RUNGS) {
        if (!rowOf(r)) continue;
        for (const z of sizes || [REAL_SIZE]) { try { hit = open(r, sized(r, z)); } catch (e) { hit = null; } if (hit) break; }
        if (hit) break;
      }
      if (!hit) {
        if (!rowOf('l1')) throw fail('MV_NOT_BUILT', 'the realistic picture is not built yet');
        throw fail('MV_NOT_FOUND', 'no realistic picture of this map is made yet', { need: needOf('l1', sized('l1', L || REAL_SIZE)) });
      }
      add(hit);
    } else if (s === 'edshot') {
      throw fail('MV_NOT_BUILT', 'the editor shot picture comes in a later version');
    } else if (PAINT_STYLES.indexOf(s) >= 0) {
      for (const w of ['grids', 'terrain', 'water', 'entcat']) add(must(w, withMode));
    } else if (sizes && rowOf(s)) {
      const sz = sizeFor(s);
      let hit = null;
      for (const z of sizes.concat(sz !== undefined && sizes.indexOf(sz) < 0 && sz >= L ? [sz] : [])) { try { hit = open(s, sized(s, z)); } catch (e) { hit = null; } if (hit) break; }
      if (!hit) throw fail('MV_NOT_FOUND', s + ' of this map is not made yet', { need: needOf(s, sized(s, L)) });
      add(hit);
    } else {
      const sz = sizeFor(s);
      add(must(s, sized(s, sz)));
    }
  });
  if (strong) keep('strong', () => add(must('strong', Object.assign({}, withMode, TICK_REQ))));
  if (full) { try { add(open('routes', Object.assign({}, withMode, TICK_REQ))); } catch (e) { /* not cached, or no row: never a need */ } }
  return dirs;
}
// the cached map document (mapdoc.json of the doc entry) or null; the minimap size and the deploy's long side need its box
function docOf(req) {
  let h = null;
  try { h = open('doc', { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map }); } catch (e) { h = null; }
  if (!h || !h.dir) return null;
  try { const d = JSON.parse(fs.readFileSync(path.join(h.dir, 'mapdoc.json'), 'utf8')); return d && typeof d === 'object' ? d : null; } catch (e) { return null; }
}
const boxOf = doc => { const b = doc && doc.boxes && doc.boxes.world; return Array.isArray(b) && b.length === 4 && b[2] > b[0] && b[3] > b[1] ? b : null; };
// the deploy's long side: sizes.matchLong over the files written (2048 when the document or its box is not there)
function deployLong(doc, rows) {
  const b = boxOf(doc);
  if (!b) return REAL_SIZE;
  return M('sizes').matchLong(b, rows.filter(r => r && r.state !== 'none').map(r => r.size));
}
// the chosen targets and their sources (set, then the common flag, then the default)
function chosen(req, b, set) {
  const P = needPreviews();
  const rows = P.targets(req.target, req.map) || [];
  const want = targetsOf(b);
  const ids = rows.filter(r => r && TIDS.indexOf(r.id) >= 0 && r.state !== 'none' && (!want || want.indexOf(r.id) >= 0)).map(r => r.id);
  const sources = [], pick = {};
  let strong = false, full = false;
  for (const id of ids) {
    const mk = set[id + '.marks'] || (typeof b.marks === 'string' ? b.marks : null) || defaults(req.target, id).marks;
    if (mk === 'full') full = true;
    let s = set[id + '.source'] || (typeof b.source === 'string' ? b.source : null) || defaults(req.target, id).source;
    if (s === 'sketch' && !set[id + '.source'] && !b.source && !sketchBuilt()) s = 'real';
    if (SOURCES.indexOf(s) < 0) throw fail('MV_USAGE', 'source ' + s + ' is not one of ' + SOURCES.join(', '), { code: 'PRV_SET' });
    if (sources.indexOf(s) < 0) sources.push(s);
    if (set[id + '.strong'] === '1' || set[id + '.danger'] === '1') strong = true;
    const cp = set[id + '.compose'] || (typeof b.compose === 'string' ? b.compose : null) || defaults(req.target, id).compose;
    pick[id] = { source: s, marks: mk, compose: id === 'minimap' ? 'stretch' : cp };
  }
  return { ids, sources, strong, full, rows, pick };
}

// ---- the child (previews <cmd>) ----
// game folder of the request: the page's, else the target's default install (cache.canon does the same for jobs)
function gameDir(req) {
  if (req.game) return path.resolve(req.game);
  try { return M('game')({ target: req.target }); } catch (e) { throw fail('MV_NOT_FOUND', 'no ' + req.target + ' install found; pick the game folder first'); }
}
function argvOf(cmd, req, mod, b, set, dirs, extra) {
  const a = ['previews', cmd, '--target', req.target, '--game', gameDir(req)];
  if (req.mods) a.push('--mods', req.mods);
  const md = (req.modDirs || []).slice();
  if (md.map(d => path.resolve(d)).indexOf(mod) < 0) md.push(mod);   // the same folder goes as --mod and --mod-dir
  for (const d of md) a.push('--mod-dir', path.resolve(d));
  a.push('--map', req.map);
  if (req.mode) a.push('--mode', req.mode);
  if (req.kind) a.push('--kind', req.kind);
  a.push('--mod', mod);
  const t = targetsOf(b);
  if (t) a.push('--targets', t.join(','));
  if (cmd === 'plan' || cmd === 'write') {
    if (b.all === true) a.push('--all');
    for (const k of ['source', 'marks', 'compose']) if (typeof b[k] === 'string' && b[k]) a.push('--' + k, b[k]);
    for (const k of Object.keys(set).sort()) a.push('--set', k + '=' + set[k]);
    if (typeof b.title === 'string' && b.title.trim()) a.push('--title', b.title.trim());
    if (b.minimapSize !== undefined && b.minimapSize !== null) {
      const n = Number(b.minimapSize);
      if (!Number.isInteger(n) || n < 256 || n > 4096 || n % 4) throw fail('MV_USAGE', 'minimapSize must be a multiple of 4 from 256 to 4096', { code: 'PRV_SET' });
      a.push('--minimap-size', String(n));
    }
  }
  for (const d of dirs || []) a.push('--in', d);
  for (const x of extra || []) a.push(x);
  a.push('--json', '-q');
  return a;
}
// run(argv, timeoutS, ctl?) -> Promise<{code, stdout, stderr, timedOut}>
function runChild(argv, timeoutS, ctl) {
  const c = ctl || {};
  const p = Promise.resolve(M('run')(argv, { ctl: c, cwd: process.cwd() }));
  let timer = null, timedOut = false;
  const t = new Promise(res => {
    timer = setTimeout(() => { timedOut = true; try { if (typeof c.kill === 'function') c.kill(); } catch (e) { /* gone */ } res({ code: 2, stdout: '', stderr: 'timed out after ' + timeoutS + ' s', timedOut: true }); }, timeoutS * 1000);
    if (timer && timer.unref) timer.unref();
  });
  return Promise.race([p, t]).then(r => { clearTimeout(timer); return Object.assign({}, r, { timedOut: timedOut || !!(r && r.timedOut) }); });
}
// the --json body: the whole stdout, else its last JSON object line that is not an error line
function bodyOfOut(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { /* lines */ }
  const lines = t.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l[0] !== '{') continue;
    try { const j = JSON.parse(l); if (j && !j.error) return j; } catch (e) { /* next */ }
  }
  return null;
}
// runReq(ctx, argv, timeoutS): runChild for a child that lives inside one request (plan, check). While it lives the
// request can be stopped from the job list, and the child is killed when the page goes away. The caller looks at
// ctx.job.cancelled after it: the dispatcher answers 499 for a stopped request whatever the route returns.
async function runReq(ctx, argv, timeoutS) {
  const ctl = {}, job = ctx && ctx.job;
  let live = true;
  const kill = () => { if (!live) return; try { if (typeof ctl.kill === 'function') ctl.kill(); } catch (e) { /* gone */ } };
  if (job && typeof job.onCancel === 'function') { job.onCancel(kill); job.canCancel = true; }
  if (ctx && typeof ctx.onClose === 'function') ctx.onClose(kill);
  try { return await runChild(argv, timeoutS, ctl); } finally { live = false; if (job) job.canCancel = false; }
}
const stopped = ctx => !!(ctx && ctx.job && ctx.job.cancelled);
// errorOf(res, dirs) -> {code, msg, detail}; code = the part's own code (detail.code, PRV_*) when the child names one
function errorOf(res, dirs) {
  const J = M('jobs');
  const je = J.jsonError(res.stdout);
  const mvCode = res.timedOut ? 'MV_FAULT' : J.codeOf(res);
  const detail = je && je.detail && typeof je.detail === 'object' ? je.detail : null;
  const own = detail && typeof detail.code === 'string' ? detail.code : null;
  const last = String(res.stderr || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).pop() || '';
  const msg = clean(je && je.msg ? je.msg : (res.timedOut ? 'the run took too long' : last || mvCode), dirs);
  return { code: own || mvCode, mv: mvCode, msg, detail: own ? { code: own } : null };
}
function throwRun(res, dirs) {
  const e = errorOf(res, dirs);
  throw fail(e.mv, e.msg, e.code !== e.mv ? { code: e.code } : null);
}
// the previews guard on the mod folder (README 9.1: never a game install, vanilla data or a workshop folder)
function guardMod(P, mod, req, game, hide) {
  if (typeof P.guard !== 'function') return;
  let g = null;
  try { g = P.guard(mod, req.target, { game }); } catch (e) { g = { code: (e && e.detail && e.detail.code) || 'PRV_MOD_REFUSED', why: e && e.message }; }
  if (g && g.code) throw fail(g.code === 'PRV_MOD_MISSING' ? 'MV_NOT_FOUND' : 'MV_REFUSED', clean(g.why || g.code, hide), { code: g.code });
}
// prepare(b, cmd) -> {req, mod, dirs, argv, hide}: arguments, guard, the needs and the command line
function prepare(b, cmd, extra) {
  const req = common(b);
  const mod = modOf(b);
  const set = cmd === 'plan' || cmd === 'write' ? setOf(b) : {};
  const P = needPreviews();
  if (!cliBuilt()) throw fail('MV_NOT_BUILT', 'map previews are not built yet');
  const game = gameDir(req);
  const hide = [[mod, '<mod>'], [game, '<game>']];
  guardMod(P, mod, req, game, hide);
  // plan, write: the needs. check: the CLI opens the doc itself, so the cached doc goes only when it is there. undo:
  // reads the mod's journal only, no --in at all.
  let dirs = [], strong = false;
  if (b.all !== undefined && b.all !== null && b.all !== true && b.all !== false) throw fail('MV_USAGE', 'all must be true or false', { code: 'PRV_SET' });
  if (cmd === 'plan' || cmd === 'write') {
    const c = chosen(req, b, set); strong = c.strong;
    let L;
    if (b.all === true) { const doc = docOf(req); L = deployLong(doc, P.targets(req.target, req.map, doc || undefined, { minimapSize: b.minimapSize }) || []); }
    dirs = inDirs(req, c.sources, c.strong, c.full, L ? { all: L } : null);
  }
  else if (cmd === 'check') { let h = null; try { h = open('doc', { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map }); } catch (e) { h = null; } if (h && h.dir) dirs = [h.dir]; }
  const argv = argvOf(cmd, Object.assign({}, req, { kind: strong ? TICK_REQ.kind : undefined }), mod, b, set, dirs, extra);
  return { req, mod, dirs, argv, hide };
}

// ---- run records (write, undo) ----
const RUNS = {};
let SEQ = 0;
function runsRoot() { return path.join(M('cache').root(), 'runs'); }
function prune(keep) {
  let list = [];
  try { list = fs.readdirSync(runsRoot()).filter(n => /^prv-/.test(n)).map(n => { let t = 0; try { t = fs.statSync(path.join(runsRoot(), n)).mtimeMs; } catch (e) { t = 0; } return { n, t }; }); } catch (e) { return; }
  list.sort((a, b) => b.t - a.t || (a.n < b.n ? 1 : -1));
  for (const x of list.slice(KEEP_RUNS)) if (x.n !== keep) { try { fs.rmSync(path.join(runsRoot(), x.n), { recursive: true, force: true }); } catch (e) { /* held */ } }
}
const busy = () => Object.keys(RUNS).some(id => RUNS[id].state === 'running');
// stopRun(rec): the one stop of a write or undo run (POST previews/cancel, the page's Cancel, the footer's Cancel): the
// cancel flag, and the kill 15 s later when the child still runs
function stopRun(rec) {
  if (!rec || rec.state !== 'running') return;
  rec.cancelled = true;
  try { fs.writeFileSync(rec.flag, 'cancel'); } catch (e) { /* the kill below still stops it */ }
  const t = setTimeout(() => { if (rec.state === 'running' && rec.ctl && typeof rec.ctl.kill === 'function') rec.ctl.kill(); }, STUB.killWaitMs >= 0 ? STUB.killWaitMs : 15000);
  if (t.unref) t.unref();
}
// a stage as the job list shows it: the part's own stage text (a language key) when there is one, else the word itself
let STAGES = null;
function stageKey(s) {
  if (!s) return '';
  if (STAGES === null) { try { STAGES = require('./export.lang.json').en || {}; } catch (e) { STAGES = {}; } }
  const k = 'mapviz.export.stage.' + s;
  return STAGES[k] !== undefined ? k : String(s);
}
// listRun(rec, ctx) -> end(state): the run as a bg job of the GUI job list; no registry (a test, an old server) -> a no-op
function listRun(rec, ctx) {
  const reg = ctx && ctx.jobs && typeof ctx.jobs.add === 'function' ? ctx.jobs : null;
  if (!reg) return () => {};
  let h = null;
  try {
    h = reg.add({ kind: 'bg', what: 'job.w.previews', whatP: { map: String(rec.map) }, page: 'mapviz', game: MV.TARGETS[rec.target] ? rec.target : 'as64',
      writes: true, cancel() { stopRun(rec); } });
  } catch (e) { return () => {}; }
  const show = () => { const v = runView(rec); h.set({ stage: stageKey(v.stage), done: v.total > 0 ? v.done : null, total: v.total > 0 ? v.total : null }); };
  const tick = setInterval(() => { try { show(); } catch (e) { /* the next tick */ } }, 500);
  if (tick.unref) tick.unref();
  return state => { clearInterval(tick); try { show(); } catch (e) { /* the last line stays */ } h.end(state); };
}
function startRun(what, p, ctx) {
  if (busy()) throw fail('MV_BUSY', 'a write or undo of map previews runs now');
  const now = M('now')();
  const id = 'prv-' + now.toString(36) + '-' + (++SEQ);
  const dir = path.join(runsRoot(), id);
  fs.mkdirSync(dir, { recursive: true });
  const prog = path.join(dir, 'progress.jsonl'), flag = path.join(dir, 'cancel');
  const argv = p.argv.slice(0, -2).concat(['--progress', prog, '--cancel-flag', flag], p.argv.slice(-2));
  const rec = { id, what, map: p.req.map, target: p.req.target, state: 'running', t0: now, dir, prog, flag, ctl: {}, st: null, result: null, error: null, hide: p.hide };
  RUNS[id] = rec;
  prune(id);
  const end = listRun(rec, ctx);
  let child, timedOut = false;
  try { child = runChild(argv, TIMEOUT[what], rec.ctl); }
  catch (e) { rec.end = M('now')(); rec.state = 'failed'; rec.error = { code: 'MV_FAULT', msg: clean(e && e.message, p.hide), detail: null }; end('failed'); throw e; }
  child.then(res => {
    timedOut = !!res.timedOut;
    try { fs.writeFileSync(path.join(dir, 'stdout.txt'), clean(res.stdout, p.hide)); } catch (e) { /* best effort */ }
    rec.end = M('now')();
    // the exit code decides, not the cancel ask: the CLI looks at the flag only while it composes, so a cancel pressed
    // during encode or commit still ends 0 or 1 with the files written; that is a done run with its result
    if (res.code === 5) { rec.state = 'cancelled'; rec.error = { code: 'MV_CANCELLED', msg: 'stopped: nothing in the mod changed', detail: null }; return; }
    if (res.code === 0 || res.code === 1) { rec.state = 'done'; rec.result = bodyOfOut(res.stdout); return; }
    if (rec.cancelled) { rec.state = 'cancelled'; rec.error = { code: 'MV_CANCELLED', msg: 'stopped by force: the mod may hold part of the run; press Check', detail: null, forced: true }; return; }
    rec.state = 'failed'; rec.error = errorOf(res, p.hide); delete rec.error.mv;
  }, e => { rec.end = M('now')(); rec.state = 'failed'; rec.error = { code: 'MV_FAULT', msg: clean(e && e.message, p.hide), detail: null }; })
    .then(() => end(rec.state === 'failed' && timedOut ? 'timeout' : rec.state), () => { if (rec.state === 'running') rec.state = 'failed'; end('failed'); });
  return { id, state: 'running' };
}
function runView(rec) {
  let st = rec.st;
  try { st = rec.st = M('jobs').readProgress(rec.prog, rec.st || undefined); } catch (e) { /* no file yet */ }
  const last = st && st.last ? st.last : null;
  const o = { id: rec.id, what: rec.what, map: rec.map, target: rec.target, state: rec.state, stage: last && typeof last.stage === 'string' ? last.stage : '',
    done: last && Number.isFinite(last.done) ? last.done : 0, total: last && Number.isFinite(last.total) ? last.total : 0,
    elapsed: Math.max(0, Math.round(((rec.end || M('now')()) - rec.t0) / 1000)) };
  if (rec.result) o.result = rec.result;
  if (rec.error) o.error = rec.error;
  return o;
}

// ---- edshot plan (dry: starts nothing) ----
function folderName(p) { const s = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/); return s[s.length - 1] || ''; }
function edPlan(b) {
  needTarget(b); needMap(b);
  const E = M('edshot');
  const editor = EDITOR[b.target];
  const x = E && E.EXES ? E.EXES[editor] : null;
  if (!x) throw fail('MV_NOT_BUILT', 'the editor shot is not built yet');
  const as64 = !!x.instance;
  let root = null;
  if (as64) root = typeof b.root === 'string' && b.root.trim() ? b.root.trim() : null;
  else if (typeof b.game === 'string' && b.game) root = b.game;
  else { try { root = M('game')({ target: b.target }); } catch (e) { root = null; } }
  const plan = { v: 1, target: b.target, editor, exe: x.file, root: root ? folderName(root) : '', map: b.map, instance: as64 ? 1 : null,
    routes: b.target === 'goh' ? ['editor', 'console'] : ['editor'],
    profile: as64 ? { kind: 'instance', yes: true } : { kind: 'own', yes: false },
    files: ED_FILES.slice(), size: 4096, secs: SECS[editor].slice(), ok: false, refuse: [], notes: [], starts: false };
  if (!root) { plan.refuse = ['EDSHOT_NO_ROOT']; return plan; }
  let rec;
  try { rec = E.preflight({ exe: editor, root, instance: as64 ? 1 : undefined }, STUB.edshotIo); } catch (e) {
    if (e && e.code === 'MV_NOT_FOUND') { plan.refuse = ['EDSHOT_NO_ROOT']; plan.notes = ['EDSHOT_NO_ROOT']; return plan; }
    throw e;
  }
  plan.ok = !!rec.ok;
  plan.refuse = Array.isArray(rec.refuse) ? rec.refuse.slice() : [];
  plan.notes = (Array.isArray(rec.notes) ? rec.notes : []).map(n => n && n.code).filter(c => typeof c === 'string' && plan.refuse.indexOf(c) < 0);
  if (!plan.profile.yes) plan.ok = false;   // the own profile needs the owner's yes first (design 8)
  return plan;
}

// ---- routes ----
const R = {};
R['GET /api/x/mapviz/previews/targets'] = wrap(async u => {
  const q = query(u, ['target', 'game', 'mods', 'modDir', 'map', 'mode']);
  needTarget(q); needMap(q);
  const P = needPreviews();
  const doc = docOf(q);
  const rows = (P.targets(q.target, q.map, doc || undefined) || []).filter(r => r && TIDS.indexOf(r.id) >= 0).map(r => {
    const d = defaults(q.target, r.id);
    return { id: r.id, file: r.file, size: r.size || null, format: r.format || null, mips: r.mips === undefined ? null : r.mips, state: r.state,
      why: r.why || null, tag: r.tag || null, source: d.source, marks: d.marks, compose: d.compose, notes: r.state === 'none' ? [] : d.notes };
  });
  return { v: 1, target: q.target, map: q.map, kind: kindOf(q.map), rows };
});

R['POST /api/x/mapviz/previews/plan'] = wrap(async (u, b, ctx) => {
  query(u, []);
  bodyOf(b, PLAN_BODY);
  const p = prepare(b, 'plan');
  const res = await runReq(ctx, p.argv, TIMEOUT.plan);
  if (stopped(ctx)) return null;   // stopped from the job list: the dispatcher answers 499
  if (res.code === 0 || res.code === 1) {
    const j = bodyOfOut(res.stdout);
    if (!j) throw fail('MV_FAULT', 'the plan answer is not JSON');
    return j;
  }
  throwRun(res, p.hide);
});

R['POST /api/x/mapviz/previews/write'] = wrap(async (u, b, ctx) => {
  query(u, []);
  bodyOf(b, PLAN_BODY.concat(['planHash', 'best', 'renameStronger']));
  if (typeof b.planHash !== 'string' || !/^[0-9a-f]{8,64}$/.test(b.planHash)) throw fail('MV_REFUSED', 'confirm the plan first: planHash is required', { code: 'PRV_CONFIRM' });
  if (busy()) throw fail('MV_BUSY', 'a write or undo of map previews runs now');
  const extra = ['--plan-hash', b.planHash];
  if (b.best === true) extra.push('--best');
  if (b.renameStronger === true) extra.push('--rename-stronger');
  const p = prepare(b, 'write', extra);
  return startRun('write', p, ctx);
});

R['GET /api/x/mapviz/previews/run'] = wrap(async u => {
  const q = query(u, ['id']);
  if (!q.id) throw fail('MV_USAGE', 'id is required');
  const rec = RUNS[q.id];
  if (!rec) throw fail('MV_NOT_FOUND', 'no previews run ' + q.id);
  return runView(rec);
});

R['POST /api/x/mapviz/previews/cancel'] = wrap(async (u, b) => {
  query(u, []);
  bodyOf(b, ['id']);
  const rec = typeof b.id === 'string' ? RUNS[b.id] : null;
  if (!rec) throw fail('MV_NOT_FOUND', 'no previews run ' + b.id);
  stopRun(rec);
  return { id: rec.id, state: rec.state };
});

R['POST /api/x/mapviz/previews/deploy-list'] = wrap(async (u, b) => {
  query(u, []);
  bodyOf(b, LIST_BODY);
  const req = common(b);
  const mod = modOf(b);
  if (req.map.split(/[\\/]/).some(x => x === '..' || x === '.') || /^([a-z]:|[\\/])/i.test(req.map)) throw fail('MV_USAGE', 'map must be a map key such as multi/1v1_road', { code: 'PRV_PATH' });
  const set = setOf(b);
  const P = needPreviews();
  if (!cliBuilt()) throw fail('MV_NOT_BUILT', 'map previews are not built yet');
  const game = gameDir(req), hide = [[mod, '<mod>'], [game, '<game>']];
  guardMod(P, mod, req, game, hide);
  if (b.minimapSize !== undefined && b.minimapSize !== null) {
    const n = Number(b.minimapSize);
    if (!Number.isInteger(n) || n < 256 || n > 4096 || n % 4) throw fail('MV_USAGE', 'minimapSize must be a multiple of 4 from 256 to 4096', { code: 'PRV_SET' });
  }
  must('doc', { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map });
  const doc = docOf(req);
  const c = chosen(req, Object.assign({}, b, { targets: null }), set);
  const rows = (P.targets(req.target, req.map, doc || undefined, { minimapSize: b.minimapSize }) || []).filter(r => r && TIDS.indexOf(r.id) >= 0);
  const L = deployLong(doc, rows);
  const collect = { needs: [], problems: [] };
  inDirs(req, c.sources, c.strong, c.full, { all: L, collect });
  const dir = 'resource/map/' + req.map + '/', files = [], skipped = [];
  for (const r of rows) {
    const p = dir + r.file;
    if (r.state === 'none') { skipped.push({ id: r.id, file: r.file, path: p, why: r.why || 'PRV_NO_FILE_IN_GAME' }); continue; }
    const k = c.pick[r.id] || defaults(req.target, r.id);
    const there = fs.existsSync(path.join(mod, 'resource', 'map', ...req.map.split('/'), r.file));
    const pr = collect.problems.find(x => x.source === k.source);
    files.push({ id: r.id, file: r.file, path: p, size: r.size ? r.size.slice() : null, format: r.format || null, mips: r.mips === undefined ? null : r.mips,
      action: there ? 'replace' : 'new', source: k.source, marks: k.marks, compose: k.compose, problem: pr ? String(pr.code) : null });
  }
  return { v: 1, target: req.target, map: req.map, kind: kindOf(req.map), size: L, files, skipped, needs: collect.needs };
});

R['POST /api/x/mapviz/previews/check'] = wrap(async (u, b, ctx) => {
  query(u, []);
  bodyOf(b, COMMON_BODY.concat(['mod', 'targets']));
  const p = prepare(b, 'check');
  const res = await runReq(ctx, p.argv, TIMEOUT.check);
  if (stopped(ctx)) return null;   // stopped from the job list: the dispatcher answers 499
  if (res.code === 0 || res.code === 1) {
    const j = bodyOfOut(res.stdout);
    if (!j) throw fail('MV_FAULT', 'the check answer is not JSON');
    return j;
  }
  throwRun(res, p.hide);
});

R['POST /api/x/mapviz/previews/undo'] = wrap(async (u, b, ctx) => {
  query(u, []);
  bodyOf(b, COMMON_BODY.concat(['mod', 'n', 'confirm']));
  if (b.confirm !== true) throw fail('MV_REFUSED', 'confirm the undo first', { code: 'PRV_CONFIRM' });
  if (busy()) throw fail('MV_BUSY', 'a write or undo of map previews runs now');
  const extra = [];
  if (b.n !== undefined && b.n !== null) { const n = Number(b.n); if (!Number.isInteger(n) || n < 1) throw fail('MV_USAGE', 'n must be a write number from 1'); extra.push('--n', String(n)); }
  const p = prepare(b, 'undo', extra);
  return startRun('undo', p, ctx);
});

R['POST /api/x/mapviz/edshot/plan'] = wrap(async (u, b) => {
  query(u, []);
  bodyOf(b, ['target', 'game', 'root', 'map', 'start']);
  if (b.start !== undefined) throw fail('MV_NOT_BUILT', 'the editor shot run comes in a later version: this is the plan only');
  return edPlan(b);
});

module.exports = {
  routes: R,
  _t: {
    use(o) { STUB = Object.assign({}, o || {}); },
    reset() { STUB = {}; RUNFN = null; for (const k of Object.keys(RUNS)) delete RUNS[k]; },
    runs: RUNS, stopRun, stageKey, fail, defaults, inDirs, argvOf, setOf, edPlan, folderName, clean, STATUS, EDITOR, SECS, deployLong, docOf,
  },
};
