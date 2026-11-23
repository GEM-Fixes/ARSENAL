// Map Viewer checks, server side (MV-PG3, builder PG3b): GET /api/x/mapviz/checks, one answer for the map, mode and phase,
// joined from three products of the cache (page-pg3 freeze draft 3.2): water.checks.json (job water), strong.checks.json
// (job checks) and the FAIR_FLAG items of strong.<kind>.json for the four unit kinds (job strong). A source that is not
// made is told inside the 200 answer as state 'need' with its need {what, args}, so one source can show while another is
// not made. A GET never starts a job.
//   answer {v:1, kind:'checks', target, map, mode, phase, sources:[{src, what, unit?, state, need?, notes?}], notes:[{code, msg}],
//           items:[{src, code, x, y, region, side?, unit?, flag?, value?, limit?, file?, cls?, area?, box?}]}
//   phase is the resolved phase the products write (strong.checks.json, else the first made strong.<kind>.json), else the
//   request phase. notes join strong.checks.json notes (when it has them) and strong.<kind>.json notes, one per code.
//   The strong source carries notes: true when strong.checks.json holds a notes list (so the page can judge PICTURE_REFUSED).
// - Built on the shell's route library (shell.server.js module.exports.lib: fail, wrap, query, request, entry, needOf,
//   readJson, COMMON): the key and need code is never forked here. While the shell gives no lib the route answers
//   501 MV_NOT_BUILT.
// - A job row that the job table does not hold yet (the coordinator adds checks and strong) answers as a need built from
//   the request (what, map, mode, kind, phase); posting it gives the runner's own refusal on the page.
// - Errors: 400 MV_USAGE (unknown argument, phase not a whole number from 0 to 99); 500 MV_FAULT when a made product is
//   not sound.
// Test seam: module.exports._t.use({lib}) puts a lib in place of the shell's; _t.reset() takes it away.
// Author: Imperator_Aug (ARSENAL, ia-aa73199e)
'use strict';
const path = require('path');

const UNITS = ['inf', 'mg', 'at', 'tank'];
const FIELDS = ['side', 'unit', 'flag', 'value', 'limit', 'file', 'cls', 'area', 'box'];
// the arguments of GET checks (page-pg3 draft 3.2): a fixed list, not the shell's COMMON (which also holds at, pose, light)
const QUERY0 = ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'side', 'kind', 'phase'];
let STUB = {};

function shellLib() {
  if (STUB.lib) return STUB.lib;
  let s = null;
  try { s = require('./shell.server'); } catch (e) { return null; }
  const L = s && s.lib;
  return L && typeof L.entry === 'function' && typeof L.query === 'function' ? L : null;
}
function bare(code, status, msg) {
  return Object.assign(new Error(code), { status, key: 'mapviz.err.' + code, params: { msg } });
}

// one source: the cache entry of a job, or its need. A table without the job's row answers a need built from the request.
function source(L, what, req, base) {
  try { return { hit: L.entry(what, req) }; } catch (e) {
    const p = e && e.params;
    if (e && e.status === 404 && p && p.need && p.need.what) return { need: p.need };
    if (e && p && /^no job named /.test(String(p.msg || ''))) {
      const args = { map: req.map };
      for (const k of ['mode', 'kind', 'phase']) if (req[k] !== undefined && req[k] !== null) args[k] = req[k];
      return { need: { what, args } };
    }
    throw e;
  }
}
function vector(L, dir, name, v0) {
  const v = v0 !== undefined ? v0 : L.readJson(path.join(dir, name + '.json'), name);
  if (!v || v.kind !== 'vector' || !Array.isArray(v.items)) throw L.fail('MV_FAULT', name + ' is not a vector product');
  return v.items;
}
// one item of a product -> the answer's item; an item without a code is not sound
function item(L, it, src, unit, name) {
  if (!it || typeof it !== 'object' || Array.isArray(it) || typeof it.code !== 'string' || !it.code) throw L.fail('MV_FAULT', name + ' holds an item without a code');
  const o = { src, code: it.code, x: typeof it.x === 'number' && isFinite(it.x) ? it.x : null, y: typeof it.y === 'number' && isFinite(it.y) ? it.y : null,
    region: typeof it.region === 'number' ? it.region : 0 };
  for (const k of FIELDS) if (it[k] !== undefined && it[k] !== null) o[k] = it[k];
  if (o.x === null || o.y === null) { o.x = null; o.y = null; }
  if (unit) o.unit = unit;
  return o;
}

async function checks(L, u) {
  const q = L.query(u, QUERY0);
  let phase = null;
  if (q.phase !== undefined) {
    if (!/^\d{1,2}$/.test(String(q.phase))) throw L.fail('MV_USAGE', 'phase must be a whole number from 0 to 99, got ' + q.phase);
    phase = Number(q.phase);
  }
  const req = L.request(q, true);
  const ids = { target: req.target, game: req.game, mods: req.mods, modDirs: req.modDirs, map: req.map };
  const mode = req.mode === undefined ? null : req.mode;
  const withPhase = o => (phase === null ? o : Object.assign(o, { phase }));
  const sources = [], items = [], notes = [], seen = {};
  const addNotes = (list, name) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) throw L.fail('MV_FAULT', name + ': notes is not a list');
    for (const n of list) if (n && typeof n.code === 'string' && !seen[n.code]) { seen[n.code] = 1; notes.push({ code: n.code, msg: String(n.msg == null ? '' : n.msg) }); }
  };
  // the resolved phase the products write (late T2): strong.checks.json first, else the first made strong.<kind>.json
  let resolved = null;
  const take = p => { if (resolved === null && Number.isInteger(p) && p >= 0) resolved = p; };

  // water: water.checks.json of the water job (key mode)
  const w = source(L, 'water', Object.assign({}, ids, { mode: req.mode }));
  if (w.hit) { vector(L, w.hit.dir, 'water.checks').forEach(it => items.push(item(L, it, 'water', null, 'water.checks'))); sources.push({ src: 'water', what: 'water', state: 'made' }); }
  else sources.push({ src: 'water', what: 'water', state: 'need', need: w.need });

  // strong: strong.checks.json of the checks job (keys mode, phase); its notes (STRONG_PREVIEWS_ABSENT) when it has them.
  // notes: true on the source tells the page the file carries its own notes, so PICTURE_REFUSED can be judged from it
  const s = source(L, 'checks', withPhase(Object.assign({}, ids, { mode: req.mode })));
  if (s.hit) {
    const v = L.readJson(path.join(s.hit.dir, 'strong.checks.json'), 'strong.checks');
    vector(L, s.hit.dir, 'strong.checks', v).forEach(it => items.push(item(L, it, 'strong', null, 'strong.checks')));
    addNotes(v.notes, 'strong.checks');
    take(v.phase);
    const o = { src: 'strong', what: 'checks', state: 'made' };
    if (Array.isArray(v.notes)) o.notes = true;
    sources.push(o);
  } else sources.push({ src: 'strong', what: 'checks', state: 'need', need: s.need });

  // fair: the checks (FAIR_FLAG) of strong.<kind>.json for each unit kind (job strong, keys mode, kind, phase)
  for (const k of UNITS) {
    const f = source(L, 'strong', withPhase(Object.assign({}, ids, { mode: req.mode, kind: k })));
    if (!f.hit) { sources.push({ src: 'fair', what: 'strong', unit: k, state: 'need', need: f.need }); continue; }
    const name = 'strong.' + k, j = L.readJson(path.join(f.hit.dir, name + '.json'), name);
    if (!j || j.v !== 1 || j.kind !== 'strong') throw L.fail('MV_FAULT', name + ' is not a strong points product of version 1');
    if (j.checks !== undefined && !Array.isArray(j.checks)) throw L.fail('MV_FAULT', name + ': checks is not a list');
    (j.checks || []).forEach(it => items.push(item(L, it, 'fair', k, name)));
    addNotes(j.notes, name);
    take(j.phase);
    sources.push({ src: 'fair', what: 'strong', unit: k, state: 'made' });
  }
  return { v: 1, kind: 'checks', target: req.target, map: req.map, mode, phase: resolved !== null ? resolved : phase, sources, notes, items };
}

const R = {};
R['GET /api/x/mapviz/checks'] = async (u, body, ctx) => {
  const L = shellLib();
  if (!L) throw bare('MV_NOT_BUILT', 501, 'the map checks route waits for the shell route library');
  const run = typeof L.wrap === 'function' ? L.wrap(x => checks(L, x)) : x => checks(L, x);
  return run(u, body, ctx);
};

module.exports = {
  routes: R,
  _t: { use(o) { STUB = Object.assign({}, o || {}); }, reset() { STUB = {}; }, UNITS, shellLib },
};
