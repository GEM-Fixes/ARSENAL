// mapviz page shell, server side (MV-PG1): every wave A and B route of tools/mapviz/README.md 6.1 under /api/x/mapviz/, on
// tools/mapviz/jobs/index.js (the runner) and jobs/cache.js. Answers and errors as README 5 and 6.
//   GET palette | parts | maps | job?id | jobs | doc | layer | hover | tiles | json | cache      POST job | cancel | cache/clear
// Waves C and D (jobs.md 2, 4, 5): the request fields phase, at, pose and light (COMMON, BODY_JOB, checked as canon checks
// them); GET layer finds a name through a row's products and its `also` patterns; GET json; module.exports.lib for the
// routes of the other parts.
// Rules held here:
// - The target is always given by the page (query or body `target`); a route never guesses it (MV_USAGE without it).
//   `game` is the install folder of that target when the page knows it, else the default of README 2.1 (canon).
//   The picked mod folder comes as `modDir` (GET, repeatable) or `modDirs` (POST body); `mods` is a comma list of names.
// - A GET never starts a job: a product that is not in the cache answers 404 MV_NOT_FOUND with params.need = {what, args}
//   (args = map + the job's own key fields); the page shows a button that POSTs that job.
// - Keys only through jobs/cache.js entryKey with the table.JOBS row (README 6.2); no route builds a key itself.
// - An argument a route does not know is refused (MV_USAGE). Nothing is written by a route except through the runner
//   and cache.clear, both inside the cache.
// - Error answer: Object.assign(new Error(code), {status, key:'mapviz.err.<code>', params:{msg, need?}}) (README 6.1);
//   statuses MV_USAGE 400, MV_NOT_FOUND 404, MV_BUSY 409, MV_CANCELLED 409, MV_REFUSED 403, MV_NOT_BUILT 501, MV_FAULT 500.
// - Layer names spawns, flags and boxes are built here from mapdoc.json, filtered by mode and phase (README 5.3, 6.1).
//   Other layers: the job whose products hold the name (pass.<kind>, cost.<kind> with the asked kind; contours -> topo).
// - Hover pack (README 5.6) from grids (mode), terrain and water (mode); water.band is left out only while the water
//   part is not built.
// - JOBS (tools/gui/README.md "JOBS"): every queued or running job of the runner is one 'bg' job of the GUI job list
//   (what job.w.mapviz {map}, job.w.mapslist for the map list; page mapviz; game = the job's target). The runner tells
//   each change (runner.watch), so stage, done and total follow it; a queued job shows the stage "waiting for another
//   job". The registry comes with a request (ctx.jobs) and is kept from the last route that saw one. The footer's Cancel
//   and POST cancel both end in cancelJob().
// Test seam: module.exports._t.use({runner, cache, table, tiles, gridfile, tileLevels, palette, styles}) replaces the
// modules (stubs), _t.reset() puts the real ones back; the real runner is made on first use (jobs.create({})).
// Author: Imperator_Aug (ARSENAL, ia-d8d73df7)
'use strict';
const fs = require('fs'), path = require('path');
const MV = require('../../../../mapviz/mapviz');

const STATUS = { MV_USAGE: 400, MV_NOT_FOUND: 404, MV_BUSY: 409, MV_CANCELLED: 409, MV_REFUSED: 403, MV_NOT_BUILT: 501, MV_FAULT: 500 };
// waves C and D (jobs.md 2): phase (int 0..99 or null), at ("x,y" world u), pose (stand, kneel, prone), light (clean, mode)
const COMMON = ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'side', 'kind', 'size', 'phase', 'at', 'pose', 'light'];
const BODY_JOB = ['what', 'target', 'game', 'mods', 'modDirs', 'map', 'mode', 'side', 'kind', 'size', 'phase', 'at', 'pose', 'light', 'args'];
const KINDS = ['inf', 'mg', 'at', 'tank'], POSES = ['stand', 'kneel', 'prone'], LIGHTS = ['clean', 'mode'];
const DOC_LAYERS = ['spawns', 'flags', 'boxes'];
const EXTRA_LAYERS = { contours: 'topo' };           // vector products written beside a job's listed products
// palette part of each layer (README 5.1 pal, 4.4 and jobs.md 7): a path into palette.json, or null
const PAL = { height: 'height', gtype: 'ground.types', 'gtype.stored': 'ground.types', material: 'ground.materials',
  slopecls: 'slope.classes', shade: 'height.shade', 'water.band': 'water.bands', 'water.drown': 'water.drown',
  'water.labels': 'water.label', 'water.checks': 'water.check', contours: 'height.contour', spawns: 'sides', flags: 'sides',
  boxes: 'masks',
  'sight.grid': 'height', 'sight.ground': 'height', 'sight.field': 'sight', 'sight.fire.top': 'height', 'sight.fire.bottom': 'height',
  'sight.view': 'sight', 'sight.vis': 'sight', 'sight.fire': 'sight.fire', 'sight.rings': 'sight',
  'cover.band': 'cover.bands', 'cover.lip': 'cover.lip', 'cover.conceal': 'cover.conceal', 'cover.edges': 'cover', 'cover.points': 'cover',
  routes: 'pass.route', 'strong.checks': 'checks', objects: 'objects',
  'l2.n': null, 'l3.n': null, 'l2.z': null, 'l3.z': null };
// by name pattern, first match wins (strong danger and howitzer bands before the other strong grids)
const PAL_PREFIX = [[/^pass\./, 'pass.codes'], [/^cost\./, 'pass.travel'], [/^obst\./, 'pass.codes'], [/^move\./, 'pass.codes'],
  [/^mcost\./, 'pass.travel'], [/^travel\./, 'pass.travel'], [/^route\./, 'pass.route'],
  [/^strong\.[ab]\.[a-z]+\.(danger|howitzer)$/, 'danger'], [/^strong\./, 'strong']];
const STYLES = [   // README 1.11 paint styles; a style without index.js lists as not built
  { id: 'staff', load: () => MV.opt(() => require('../../../../mapviz/paint/staff/index'), '../../../../mapviz/paint/staff/index', __filename) },
  { id: 'painted', load: () => MV.opt(() => require('../../../../mapviz/paint/painted/index'), '../../../../mapviz/paint/painted/index', __filename) },
  { id: 'recon', load: () => MV.opt(() => require('../../../../mapviz/paint/recon/index'), '../../../../mapviz/paint/recon/index', __filename) },
  { id: 'sketch', load: () => MV.opt(() => require('../../../../mapviz/paint/sketch/index'), '../../../../mapviz/paint/sketch/index', __filename) },
];

// ---- modules: lazy, replaceable in tests ----
const REAL = {
  jobs: () => require('../../../../mapviz/jobs/index'),
  cache: () => require('../../../../mapviz/jobs/cache'),
  table: () => require('../../../../mapviz/jobs/table'),
  tiles: () => require('../../../../mapviz/jobs/tiles'),
  gridfile: () => require('../../../../mapviz/lib/raster/gridfile'),
  tileLevels: () => { const r = MV.opt(() => require('../../../../mapviz/lib/raster/index'), '../../../../mapviz/lib/raster/index', __filename); return r && r.tileLevels; },
  palette: () => require('../../../../mapviz/palette.json'),
};
let STUB = {}, RUNNER = null;
const M = name => (STUB[name] !== undefined ? STUB[name] : REAL[name]());
function runner() {
  const r = STUB.runner || RUNNER || (RUNNER = M('jobs').create({}));
  if (r && typeof r.watch === 'function' && !WATCHED.has(r)) { WATCHED.add(r); r.watch(ev => onJob(r, ev)); }
  return r;
}

// ---- the GUI job list (README JOBS): one bg job per queued or running runner job ----
const WATCHED = new WeakSet(), BG = new Map(), ENDS = new Set(['done', 'failed', 'cancelled', 'timeout']);
let REG = null, STAGES = null;
function keepJobs(ctx) { if (ctx && ctx.jobs && typeof ctx.jobs.add === 'function') REG = ctx.jobs; }
// a stage as the job list shows it: the page's own stage text (a language key) when there is one, else the word itself
function stageKey(s) {
  if (!s) return '';
  if (STAGES === null) { try { STAGES = require('./shell.lang.json').en || {}; } catch (e) { STAGES = {}; } }
  const k = 'mapviz.shell.stage.' + s;
  return STAGES[k] !== undefined ? k : String(s);
}
// cancelJob(id, r?): the one stop of a runner job (POST cancel, the page's Stop, the footer's Cancel)
function cancelJob(id, r) { return (r || runner()).cancel(id); }
function onJob(r, ev) {
  if (!ev || typeof ev.id !== 'string') return;
  let h = BG.get(ev.id);
  const end = ENDS.has(ev.state);
  if (!h) {
    if (end || !REG) return;
    const list = ev.what === 'maps' || !ev.map;
    try {
      h = REG.add({ kind: 'bg', what: list ? 'job.w.mapslist' : 'job.w.mapviz', whatP: list ? null : { map: String(ev.map) }, page: 'mapviz',
        game: MV.TARGETS[ev.target] ? ev.target : 'as64', cancel() { cancelJob(ev.id, r); } });
    } catch (e) { return; }
    BG.set(ev.id, h);
  }
  h.set({ stage: stageKey(ev.state === 'queued' ? 'wait' : ev.stage), done: ev.total > 0 ? ev.done : null, total: ev.total > 0 ? ev.total : null });
  if (end) { BG.delete(ev.id); h.end(ev.state); }
}

// ---- errors ----
function fail(code, msg, need) {
  const c = STATUS[code] ? code : 'MV_FAULT';
  const params = { msg: String(msg || c) };
  if (need) params.need = need;
  return Object.assign(new Error(c), { status: STATUS[c], key: 'mapviz.err.' + c, params });
}
const isOurs = e => e && typeof e.key === 'string' && /^mapviz\.err\./.test(e.key) && e.params;
function wrap(fn) {
  return async (u, body, ctx) => {
    keepJobs(ctx);
    try { return await fn(u, body, ctx || {}); } catch (e) {
      if (isOurs(e)) throw e;
      if (e && typeof e.code === 'string' && MV.CODES[e.code] !== undefined) throw fail(e.code, e.message);
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
// request(q) -> the job request of README 6.2 (without what); target required
function request(q, needMap) {
  if (!q.target) throw fail('MV_USAGE', 'target is required: the page gives it (as64, mowas2 or goh)');
  if (!MV.TARGETS[q.target]) throw fail('MV_USAGE', 'target must be as64, mowas2 or goh, got ' + q.target);
  if (needMap && !q.map) throw fail('MV_USAGE', 'map is required (a map key such as multi/1v1_road)');
  const r = { target: q.target };
  for (const k of ['game', 'mods', 'map', 'mode', 'side', 'kind']) if (q[k] !== undefined) r[k] = q[k];
  if (q.modDirs) r.modDirs = q.modDirs;
  if (q.size !== undefined) { const n = Number(q.size); if (!Number.isInteger(n)) throw fail('MV_USAGE', 'size must be a whole number, got ' + q.size); r.size = n; }
  Object.assign(r, fieldsOf(q));
  return r;
}
// fieldsOf(q) -> the wave C and D request fields of a query or body, checked as jobs/cache.js canon checks them
// (jobs.md 2); a field left out or null is not in the answer. at is written back as x,y with at most 2 decimals.
function fieldsOf(q) {
  const r = {};
  if (q.phase !== undefined && q.phase !== null && q.phase !== '') {
    const n = Number(q.phase);
    if (!Number.isInteger(n) || n < 0 || n > 99) throw fail('MV_USAGE', 'phase must be a whole number from 0 to 99, got ' + q.phase);
    r.phase = n;
  }
  if (q.at !== undefined && q.at !== null && q.at !== '') {
    const p = String(q.at).split(',');
    const n = p.map(s => (/^\s*-?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?\s*$/i.test(s) ? Number(s) : NaN));
    if (p.length !== 2 || !n.every(Number.isFinite)) throw fail('MV_USAGE', 'at must be two numbers x,y in world units, got ' + q.at);
    r.at = n.map(v => String(Math.round(v * 100) / 100)).join(',');
  }
  if (q.pose !== undefined && q.pose !== null && q.pose !== '') {
    if (!POSES.includes(q.pose)) throw fail('MV_USAGE', 'pose must be stand, kneel or prone, got ' + q.pose);
    r.pose = q.pose;
  }
  if (q.light !== undefined && q.light !== null && q.light !== '') {
    if (!LIGHTS.includes(q.light)) throw fail('MV_USAGE', 'light must be clean or mode, got ' + q.light);
    r.light = q.light;
  }
  return r;
}
// a need = the request reduced to the job's own keys (table.reduce, README 6.2); args leave out what the page adds back
// (target, game, mods, modDirs) and null values
const NEED_DROP = ['what', 'target', 'game', 'mods', 'modDirs', 'map'];
function needOf(what, req) {
  const r = M('table').reduce(req, what), args = {};
  if (what !== 'maps' && r.map) args.map = r.map;
  for (const k of Object.keys(r)) if (!NEED_DROP.includes(k) && r[k] !== undefined && r[k] !== null) args[k] = r[k];
  return { what, args };
}
// entry(what, req) -> {dir, manifest}; not in the cache -> 404 need
function entry(what, req) {
  const T = M('table'), row = T.JOBS[what];
  if (!row) throw fail('MV_FAULT', 'no job named ' + what);
  const key = M('cache').entryKey(Object.assign({}, req, { what, row }));
  const hit = M('cache').open(key);
  if (!hit) throw fail('MV_NOT_FOUND', what + ' of this map is not made yet', needOf(what, req));
  return hit;
}
function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw fail('MV_FAULT', what + ' cannot be read: ' + e.message); }
}
function palOf(name) {
  if (Object.prototype.hasOwnProperty.call(PAL, name)) return PAL[name];
  for (const [p, v] of PAL_PREFIX) if (p.test(name)) return v;
  return null;
}
function palPart(pal) {
  if (!pal) return null;
  let v = M('palette');
  for (const k of pal.split('.')) { if (!v || typeof v !== 'object' || !(k in v)) return null; v = v[k]; }
  return v === undefined ? null : v;
}
// a row's `also` patterns (jobs.md 1.3) as regular expressions: <kind> filled, * = one or more name characters
function alsoOf(row, kind) {
  return (Array.isArray(row.also) ? row.also : []).map(p => new RegExp('^' + String(p).replace(/<kind>/g, kind)
    .replace(/[.]/g, '\\.').replace(/\*/g, '[a-z0-9_]+') + '$'));
}
// the job that makes a layer (README 4.4, 6.2; jobs.md 4): a product of the row with <kind> filled, or a name its `also`
// patterns match (strong.<side>.<kind>.<factor>); contours by its own table. The viewshed vector sight.rings is the view
// job's product sight.rings.json (ruling R-a), found like any other product; the grid sight.view keeps its name
function whatOfLayer(name, kind) {
  if (EXTRA_LAYERS[name]) return EXTRA_LAYERS[name];
  kind = kind || 'inf';
  const T = M('table'), J = T.JOBS;
  for (const w of Object.keys(J)) for (const f of T.productFiles(J[w], { kind })) {
    if (!f.dir && f.alt.some(a => a === name + '.mvg' || a === name + '.json')) return w;
  }
  for (const w of Object.keys(J)) if (alsoOf(J[w], kind).some(re => re.test(name))) return w;
  return null;
}
// a layer name that belongs to another unit kind than the asked one (obst.tank asked with kind inf) -> that kind, else null
function kindOfLayer(name, kind) {
  for (const k of KINDS) if (k !== (kind || 'inf') && whatOfLayer(name, k)) return k;
  return null;
}
// the job whose products hold the JSON file <name>.json (jobs.md 5.2 GET json): a listed product or an `also` name
function whatOfJson(name, kind) {
  kind = kind || 'inf';
  const T = M('table'), J = T.JOBS;
  for (const w of Object.keys(J)) for (const f of T.productFiles(J[w], { kind })) if (!f.dir && f.alt.includes(name + '.json')) return w;
  for (const w of Object.keys(J)) if (alsoOf(J[w], kind).some(re => re.test(name))) return w;
  return null;
}
function whatOfTiles(base) {
  const J = M('table').JOBS;
  for (const w of Object.keys(J)) if (J[w].products.indexOf('tiles/' + base) >= 0) return w;
  return null;
}

// ---- envelopes ----
function gridEnvelope(file, name, req) {
  const gf = M('gridfile');
  let buf, H;
  try { buf = fs.readFileSync(file); H = gf.decodeHeader(buf); } catch (e) { throw fail('MV_FAULT', 'layer ' + name + ' is not a sound grid file: ' + e.message); }
  const g = H.grid, pal = palOf(name);
  return { v: 1, kind: 'grid', name, map: req.map, target: req.target, w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy,
    etype: g.etype, sample: g.sample, scale: g.scale, offset: g.offset, nodata: g.nodata, meta: g.meta,
    data: buf.subarray(H.hdrBytes, H.hdrBytes + H.dataBytes).toString('base64'), pal, palette: palPart(pal) };
}
function vectorEnvelope(name, items, req) {
  const pal = palOf(name);
  return { v: 1, kind: 'vector', name, map: req.map, target: req.target, items, pal, palette: palPart(pal) };
}
const phaseOk = (item, ph) => ph === null || item.phase === null || item.phase === undefined || item.phase === ph;
function docItems(doc, name, mode, phase) {
  const items = [];
  const modes = (doc.modes || []).filter(m => !mode || m.id === mode);
  if (name === 'spawns') {
    for (const m of modes) for (const s of m.spawns || []) if (phaseOk(s, phase))
      items.push({ kind: 'spawn', mode: m.id, name: s.name, team: s.team, order: s.order, x: s.x, y: s.y, z: s.z, yaw: s.yaw });
  } else if (name === 'flags') {
    for (const m of modes) for (const f of m.flags || []) if (phaseOk(f, phase))
      items.push({ kind: 'flag', mode: m.id, name: f.name, team: f.team, x: f.x, y: f.y, z: f.z, zone: f.zone, phase: f.phase });
  } else {
    const b = doc.boxes || {}, named = b.named || [];
    const auto = named.find(n => n.name === '[auto]');
    const autoName = auto ? auto.name : null;
    if (b.world) items.push({ kind: 'box', box: 'world', clip: null, b: b.world });
    if (b.auto) items.push({ kind: 'box', box: 'auto', clip: autoName, b: b.auto });
    if (b.camera) items.push({ kind: 'box', box: 'camera', clip: autoName, b: b.camera });
    if (b.pather) items.push({ kind: 'box', box: 'pather', clip: autoName, b: b.pather });
    for (const n of named) {
      if (n.name === autoName) continue;
      if (n.world) items.push({ kind: 'box', box: 'world', clip: n.name, b: n.world });
      if (n.camera) items.push({ kind: 'box', box: 'camera', clip: n.name, b: n.camera });
      if (n.pather) items.push({ kind: 'box', box: 'pather', clip: n.name, b: n.pather });
    }
  }
  return items;
}
// every k-th cell from 0 of a grid file's data block (README 5.6)
function sampled(buf, H, k) {
  const g = H.grid, es = H.dataBytes / (g.w * g.h), block = buf.subarray(H.hdrBytes, H.hdrBytes + H.dataBytes);
  if (k === 1) return block;
  const w2 = Math.ceil(g.w / k), h2 = Math.ceil(g.h / k), out = Buffer.alloc(w2 * h2 * es);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) block.copy(out, (j * w2 + i) * es, (j * k * g.w + i * k) * es, (j * k * g.w + i * k) * es + es);
  return out;
}
// the material names of the ids present in the sampled block (u8 or u16 ids)
function namesIn(block, g) {
  const all = (g.meta || {}).names || {}, seen = new Set(), es = g.etype === 'u16' ? 2 : 1, out = {};
  for (let i = 0; i + es <= block.length; i += es) seen.add(es === 2 ? block.readUInt16LE(i) : block[i]);
  for (const k of Object.keys(all)) if (seen.has(Number(k))) out[k] = all[k];
  return out;
}
function stepOf(w, h) { let k = 1; while (Math.ceil(w / k) * Math.ceil(h / k) > 2097152) k++; return k; }
function partBuilt(part) {
  const p = MV.findPart(part);
  return !!p && MV.partState(p) === 'built';
}

// ---- routes ----
const R = {};
R['GET /api/x/mapviz/palette'] = wrap(async u => { query(u, []); return M('palette'); });

R['GET /api/x/mapviz/parts'] = wrap(async u => {
  query(u, []);
  const parts = MV.PARTS.map(p => ({ part: p.part, id: p.id, wave: p.wave, state: MV.partState(p) }));
  const styles = (STUB.styles || STYLES).map(s => {
    let state;
    try { state = s.load() ? 'built' : 'not built'; } catch (e) { state = 'broken'; }
    return { id: s.id, state };
  });
  return { v: 1, parts, styles };
});

R['GET /api/x/mapviz/maps'] = wrap(async u => {
  const req = request(query(u, ['target', 'game', 'mods', 'modDir']), false);
  const hit = entry('maps', req);
  const j = readJson(path.join(hit.dir, 'maps.json'), 'the map list');
  return { v: 1, maps: Array.isArray(j.maps) ? j.maps : [] };
});

R['POST /api/x/mapviz/job'] = wrap(async (u, b) => {
  query(u, []);
  const body = bodyOf(b, BODY_JOB);
  if (!body.what) throw fail('MV_USAGE', 'what is required (a job such as maps, doc, topo)');
  if (!body.target) throw fail('MV_USAGE', 'target is required: the page gives it (as64, mowas2 or goh)');
  // phase, at, pose, light checked here as canon checks them; a sound value goes on in its canonical form
  Object.assign(body, fieldsOf(body));
  const s = runner().submit(body);
  return { id: s.id, shared: !!s.shared, state: s.state, queue: s.queue };
});

R['GET /api/x/mapviz/job'] = wrap(async u => {
  const q = query(u, ['id']);
  if (!q.id) throw fail('MV_USAGE', 'id is required');
  const j = runner().status(q.id);
  if (!j) throw fail('MV_NOT_FOUND', 'no job ' + q.id);
  return j;
});

R['POST /api/x/mapviz/cancel'] = wrap(async (u, b) => {
  query(u, []);
  const body = bodyOf(b, ['id']);
  if (!body.id || typeof body.id !== 'string') throw fail('MV_USAGE', 'id is required');
  const r = runner();
  if (!r.status(body.id)) throw fail('MV_NOT_FOUND', 'no job ' + body.id);
  cancelJob(body.id, r);
  return { id: body.id, state: r.status(body.id).state };
});

R['GET /api/x/mapviz/jobs'] = wrap(async u => { query(u, []); return runner().list(); });

R['GET /api/x/mapviz/doc'] = wrap(async u => {
  const q = query(u, COMMON.concat(['entities']));
  if (q.entities !== undefined && q.entities !== '0' && q.entities !== '1') throw fail('MV_USAGE', 'entities must be 0 or 1');
  const req = request(q, true);
  const hit = entry('doc', req);
  const doc = readJson(path.join(hit.dir, 'mapdoc.json'), 'the map document');
  if (q.entities === '0') doc.entities = [];
  return doc;
});

R['GET /api/x/mapviz/layer'] = wrap(async u => {
  const q = query(u, COMMON.concat(['name']));
  if (!q.name) throw fail('MV_USAGE', 'name is required (a layer name such as water.band)');
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(q.name)) throw fail('MV_USAGE', 'layer name ' + q.name + ' is not a layer name');
  const req = request(q, true), phase = req.phase === undefined ? null : req.phase;
  if (DOC_LAYERS.includes(q.name)) {
    const hit = entry('doc', { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map });
    const doc = readJson(path.join(hit.dir, 'mapdoc.json'), 'the map document');
    return vectorEnvelope(q.name, docItems(doc, q.name, req.mode || null, phase), req);
  }
  if (/^pic\./.test(q.name)) throw fail('MV_USAGE', 'pictures come as tiles (GET tiles), not as a layer');
  const what = whatOfLayer(q.name, req.kind);
  if (!what) {
    const other = kindOfLayer(q.name, req.kind);
    if (other) throw fail('MV_USAGE', 'layer ' + q.name + ' is of unit kind ' + other + ', the request asks kind ' + (req.kind || 'inf'));
    throw fail('MV_USAGE', 'no job makes a layer named ' + q.name);
  }
  const hit = entry(what, req);
  const mvg = path.join(hit.dir, q.name + '.mvg'), js = path.join(hit.dir, q.name + '.json');
  if (fs.existsSync(mvg)) return gridEnvelope(mvg, q.name, req);
  const jsFile = fs.existsSync(js) ? js : null;
  if (jsFile) {
    const v = readJson(jsFile, 'layer ' + q.name);
    if (!v || v.kind !== 'vector' || !Array.isArray(v.items)) throw fail('MV_FAULT', 'layer ' + q.name + ' is not a vector product');
    return vectorEnvelope(q.name, v.items, req);
  }
  throw fail('MV_NOT_FOUND', 'the ' + what + ' entry holds no layer ' + q.name);
});

// GET json (jobs.md 5.2): a JSON product as stored (sight, travel, strong.<kind>, pack, routes ...) or a picture sidecar
// pic.<base> (the job that cuts tiles/<base>). Never starts a job: not cached -> 404 need.
R['GET /api/x/mapviz/json'] = wrap(async u => {
  const q = query(u, COMMON.concat(['name']));
  if (!q.name) throw fail('MV_USAGE', 'name is required (a JSON product such as sight or pic.l2)');
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(q.name)) throw fail('MV_USAGE', 'name ' + q.name + ' is not a product name');
  const req = request(q, true);
  let what, file;
  if (/^pic\.[a-z0-9_]+$/.test(q.name)) { what = whatOfTiles(q.name.slice(4)); file = q.name + '.json'; }
  else { what = whatOfJson(q.name, req.kind); file = q.name + '.json'; }
  if (!what) {
    const other = /^pic\./.test(q.name) ? null : KINDS.find(k => k !== (req.kind || 'inf') && whatOfJson(q.name, k));
    if (other) throw fail('MV_USAGE', 'product ' + q.name + ' is of unit kind ' + other + ', the request asks kind ' + (req.kind || 'inf'));
    throw fail('MV_USAGE', 'no job makes a JSON product named ' + q.name);
  }
  const hit = entry(what, req);
  const f = path.join(hit.dir, file);
  if (!fs.existsSync(f)) throw fail('MV_NOT_FOUND', 'the ' + what + ' entry holds no ' + file);
  return readJson(f, q.name);
});

R['GET /api/x/mapviz/hover'] = wrap(async u => {
  const req = request(query(u, COMMON), true);
  const ids = { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map };
  const grids = entry('grids', Object.assign({}, ids, { mode: req.mode }));
  const terrain = entry('terrain', Object.assign({}, ids, { mode: req.mode }));
  let water = null;
  if (STUB.waterBuilt !== undefined ? STUB.waterBuilt : partBuilt('water')) water = entry('water', Object.assign({}, ids, { mode: req.mode }));
  const gf = M('gridfile'), files = {};
  const load = (dir, name) => {
    let buf, H;
    try { buf = fs.readFileSync(path.join(dir, name + '.mvg')); H = gf.decodeHeader(buf); } catch (e) { throw fail('MV_FAULT', 'layer ' + name + ' is not a sound grid file: ' + e.message); }
    files[name] = { buf, H };
  };
  load(grids.dir, 'height'); load(grids.dir, 'gtype'); load(grids.dir, 'material'); load(terrain.dir, 'slopecls');
  if (water) load(water.dir, 'water.band');
  const h0 = files.height.H.grid;
  for (const n of Object.keys(files)) { const g = files[n].H.grid; if (g.w !== h0.w || g.h !== h0.h) throw fail('MV_FAULT', 'layer ' + n + ' is ' + g.w + ' x ' + g.h + ', height is ' + h0.w + ' x ' + h0.h); }
  const k = stepOf(h0.w, h0.h);
  const gj = (() => { try { return JSON.parse(fs.readFileSync(path.join(grids.dir, 'grids.json'), 'utf8')); } catch (e) { return null; } })();
  const data = n => sampled(files[n].buf, files[n].H, k).toString('base64');
  const layers = {
    height: { etype: h0.etype, scale: h0.scale, nodata: h0.nodata, data: data('height') },
    slopecls: { etype: files.slopecls.H.grid.etype, data: data('slopecls') },
    gtype: { etype: files.gtype.H.grid.etype, data: data('gtype') },
    material: { etype: files.material.H.grid.etype, data: data('material'), names: namesIn(sampled(files.material.buf, files.material.H, k), files.material.H.grid) },
  };
  if (water) layers['water.band'] = { etype: files['water.band'].H.grid.etype, data: data('water.band') };
  return { v: 1, kind: 'hover', map: req.map, target: req.target, mode: req.mode || null, step: k, w: Math.ceil(h0.w / k), h: Math.ceil(h0.h / k),
    cell: h0.cell * k, ox: h0.ox, oy: h0.oy, waterLevel: gj && typeof gj.w === 'number' ? gj.w : null, layers };
});

R['GET /api/x/mapviz/tiles'] = wrap(async u => {
  const q = query(u, COMMON.concat(['base', 'z', 't']));
  if (!q.base || !/^[a-z0-9_]+$/.test(q.base)) throw fail('MV_USAGE', 'base is required (a picture name such as topo)');
  const z = Number(q.z);
  if (q.z === undefined || !Number.isInteger(z) || z < 0 || z > 30) throw fail('MV_USAGE', 'z must be a level from 0');
  const list = String(q.t || '').split(',').filter(Boolean);
  if (!list.length) throw fail('MV_USAGE', 't is required (tiles as x.y,x.y)');
  if (list.length > 16) throw fail('MV_USAGE', 'at most 16 tiles per answer, asked ' + list.length);
  const req = request(q, true);
  const what = whatOfTiles(q.base);
  if (!what) throw fail('MV_USAGE', 'no job makes the picture ' + q.base);
  const hit = entry(what, req);
  const pic = path.join(hit.dir, 'pic.' + q.base + '.mvg');
  let g;
  try { g = M('gridfile').readHeader(pic); } catch (e) { throw fail('MV_FAULT', 'picture ' + q.base + ' is not a sound grid file: ' + e.message); }
  const side = (() => { try { return JSON.parse(fs.readFileSync(path.join(hit.dir, 'pic.' + q.base + '.json'), 'utf8')); } catch (e) { return null; } })();
  const levels = M('tileLevels');
  if (typeof levels !== 'function') throw fail('MV_NOT_BUILT', 'the tile levels are not built yet');
  const L = levels(g.w, g.h);
  if (z > L.zmax) throw fail('MV_USAGE', 'z must be a level from 0 to ' + L.zmax + ', got ' + z);
  const tiles = M('tiles').batch(path.join(hit.dir, 'tiles', q.base), z, list);
  return { v: 1, kind: 'tiles', base: q.base, z, zmax: L.zmax, w: g.w, h: g.h, ox: g.ox, oy: g.oy, cell: g.cell,
    box: side && Array.isArray(side.box) ? side.box : [g.ox, g.oy, g.ox + g.w * g.cell, g.oy + g.h * g.cell], tiles };
});

R['GET /api/x/mapviz/cache'] = wrap(async u => { query(u, []); return M('cache').stats(); });

R['POST /api/x/mapviz/cache/clear'] = wrap(async (u, b) => {
  query(u, []);
  const body = bodyOf(b, ['scope', 'target', 'map']);
  if (body.scope !== 'all' && body.scope !== 'map') throw fail('MV_USAGE', "scope must be 'all' or 'map'");
  if (body.scope === 'map' && (typeof body.map !== 'string' || !body.map)) throw fail('MV_USAGE', 'map is required for scope map');
  if (body.target !== undefined && !MV.TARGETS[body.target]) throw fail('MV_USAGE', 'target must be as64, mowas2 or goh');
  const s = body.scope === 'all' ? { scope: 'all' } : { scope: 'map', map: body.map };
  if (body.scope === 'map' && body.target) s.target = body.target;
  const r = M('cache').clear(s);
  return { removed: r.removed, bytes: r.bytes };
});

module.exports = {
  routes: R,
  // lib (page-pg3 N6): the functions the shell routes use, for the route of another part (GET card, strong, checks,
  // pictures ...), so no part forks the key, need or error code. They read the modules through M(), so a stub put in
  // with _t.use reaches them too. mod(name) gives one of those modules (jobs, cache, table, tiles, gridfile, palette).
  lib: { fail, wrap, query, bodyOf, request, fieldsOf, entry, needOf, readJson, palOf, palPart, whatOfLayer, whatOfJson,
    whatOfTiles, gridEnvelope, vectorEnvelope, runner, cancelJob, keepJobs, mod: M, partBuilt, COMMON, BODY_JOB, STATUS },
  _t: {
    use(o) { STUB = Object.assign({}, o || {}); },
    reset() { STUB = {}; REG = null; for (const h of BG.values()) h.end('cancelled'); BG.clear(); },
    onJob, stageKey, bg: BG,
    close() { const r = RUNNER; RUNNER = null; return r ? r.close() : Promise.resolve(); },
    fail, docItems, stepOf, sampled, palOf, whatOfLayer, whatOfTiles, whatOfJson, kindOfLayer, fieldsOf, needOf, STATUS,
  },
};
