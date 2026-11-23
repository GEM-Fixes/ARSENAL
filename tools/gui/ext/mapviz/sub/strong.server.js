// Map Viewer strong points, server side (MV-PG3, builder PG3a): GET /api/x/mapviz/strong (page-pg3 freeze draft 3.1).
// Answers the strong points product strong.<kind>.json of job strong for the map, mode, unit kind and phase, as stored
// plus the map and target. A GET never starts a job: a product that is not made answers 404 with params.need
// {what: 'strong', args: {map, mode?, kind, phase?}} and the page shows Make it.
//   query: target, game, mods, modDir (repeatable), map, mode, side, kind (required: inf, mg, at, tank), phase (whole number)
// - Built on the shell's route library (shell.server.js module.exports.lib: fail, wrap, query, request, entry, readJson),
//   so the key, the need and the error codes are the shell's. While the shell gives no lib the route answers 501.
// - Errors: 400 MV_USAGE (unknown argument, kind missing or not a unit kind, phase not a whole number); 404 need;
//   500 MV_FAULT when the file is not JSON, v is not 1, kind is not 'strong' or candidates is not a list.
// Test seam: module.exports._t.use({lib}) puts a lib in place of the shell's; _t.reset() takes it away.
// Author: Imperator_Aug (ARSENAL, ia-081ed44c)
'use strict';
const path = require('path');

const KINDS = ['inf', 'mg', 'at', 'tank'];
const ARGS = ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'side', 'kind', 'phase'];
let STUB = {};

const libOk = L => !!(L && typeof L.entry === 'function' && typeof L.query === 'function' && typeof L.request === 'function' &&
  typeof L.fail === 'function' && typeof L.readJson === 'function');
function shellLib() {
  if (Object.prototype.hasOwnProperty.call(STUB, 'lib')) return libOk(STUB.lib) ? STUB.lib : null;
  let s = null;
  try { s = require('./shell.server'); } catch (e) { return null; }
  return libOk(s && s.lib) ? s.lib : null;
}
function bare(code, status, msg) {
  return Object.assign(new Error(code), { status, key: 'mapviz.err.' + code, params: { msg } });
}

// validate(j, name) -> null when the product is sound, else the reason
function validate(j, name) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return name + ' is not a JSON object';
  if (j.v !== 1) return name + ' is of version ' + j.v + ', this page reads version 1';
  if (j.kind !== 'strong') return name + ' is not a strong points product (kind ' + j.kind + ')';
  if (!Array.isArray(j.candidates)) return name + ': candidates is not a list';
  return null;
}

async function getStrong(L, u) {
  const q = L.query(u, ARGS);
  if (q.kind === undefined) throw L.fail('MV_USAGE', 'kind is required: inf, mg, at or tank');
  if (!KINDS.includes(q.kind)) throw L.fail('MV_USAGE', 'kind must be inf, mg, at or tank, got ' + q.kind);
  let phase = null;
  if (q.phase !== undefined) {
    phase = Number(q.phase);
    if (!/^\s*\d+\s*$/.test(String(q.phase)) || !Number.isInteger(phase) || phase < 0 || phase > 99) throw L.fail('MV_USAGE', 'phase must be a whole number from 0 to 99, got ' + q.phase);
  }
  const req = L.request(Object.assign({}, q, { phase: undefined }), true);
  delete req.side;
  req.kind = q.kind;
  if (phase !== null) req.phase = phase;
  const hit = L.entry('strong', req);
  const name = 'strong.' + q.kind, j = L.readJson(path.join(hit.dir, name + '.json'), name);
  const bad = validate(j, name);
  if (bad) throw L.fail('MV_FAULT', bad);
  return Object.assign({}, j, { map: req.map, target: req.target });
}

const R = {};
R['GET /api/x/mapviz/strong'] = async (u, body, ctx) => {
  const L = shellLib();
  if (!L) throw bare('MV_NOT_BUILT', 501, 'the strong points route waits for the shell route library');
  const run = typeof L.wrap === 'function' ? L.wrap(x => getStrong(L, x)) : x => getStrong(L, x);
  return run(u, body, ctx);
};

module.exports = {
  routes: R,
  _t: { use(o) { STUB = Object.assign({}, o || {}); }, reset() { STUB = {}; }, shellLib, validate, getStrong, KINDS, ARGS },
};
