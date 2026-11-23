// Map Viewer style part, server side (MV-PG4, builder PG4b): GET /api/x/mapviz/styles (contract draft page-pg4 section 4).
// Answer {v:1, styles:[{id, state, version, palette, needs, wants}]} = the body of `mapviz paint styles --json`, from
// styles.list() of tools/mapviz/paint/index.js in process. Paint index absent: each of the four styles as not built.
// A paint index that throws on load or whose list() throws: each of the four as broken (the route never fails for it).
// A GET never starts a job and writes nothing. The same answer for every game: styles do not branch on the game.
// Test seam: module.exports._t.use({paint}) (paint = a module object, null for absent, or a function that throws),
// _t.reset() puts the real one back.
// Author: Imperator_Aug (ARSENAL, ia-d843ead0)
'use strict';
const MV = require('../../../../mapviz/mapviz');

const STATUS = { MV_USAGE: 400, MV_FAULT: 500 };
// the four styles and their palette entries when the paint index is not there (paint.md 4.1 STYLES, PALETTE_KEY)
const FALLBACK = [['staff', 'staff'], ['painted', 'painted'], ['recon', 'recon'], ['sketch', 'field_sketch']];
const STATES = ['built', 'not built', 'broken'];

let STUB;   // undefined: real module
function paintIndex() {
  if (STUB !== undefined) { if (typeof STUB === 'function') return STUB(); return STUB; }
  return MV.opt(() => require('../../../../mapviz/paint/index'), '../../../../mapviz/paint/index', __filename);
}
function fail(code, msg) {
  const c = STATUS[code] ? code : 'MV_FAULT';
  return Object.assign(new Error(c), { status: STATUS[c], key: 'mapviz.err.' + c, params: { msg: String(msg || c) } });
}
function fallback(state, P) {
  const keys = P && P.PALETTE_KEY && typeof P.PALETTE_KEY === 'object' ? P.PALETTE_KEY : null;
  const ids = P && Array.isArray(P.STYLES) && P.STYLES.length ? P.STYLES : FALLBACK.map(r => r[0]);
  return ids.map(id => {
    const fk = FALLBACK.find(r => r[0] === id);
    const pk = keys && typeof keys[id] === 'string' ? keys[id] : (fk ? fk[1] : id);
    return { id, state, version: null, palette: 'styles.' + pk, needs: [], wants: [] };
  });
}
const strs = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string') : []);
// one row as paint styles --json prints it; a row the page cannot read keeps its id with state not built
function row(r) {
  if (!r || typeof r.id !== 'string' || !r.id) return null;
  return {
    id: r.id,
    state: STATES.includes(r.state) ? r.state : 'not built',
    version: Number.isInteger(r.version) ? r.version : null,
    palette: typeof r.palette === 'string' ? r.palette : null,
    needs: strs(r.needs),
    wants: strs(r.wants),
  };
}
function styles() {
  let P;
  try { P = paintIndex(); } catch (e) { return fallback('broken', null); }
  if (!P) return fallback('not built', null);
  let list;
  try { list = P.styles && typeof P.styles.list === 'function' ? P.styles.list() : null; } catch (e) { return fallback('broken', P); }
  if (!Array.isArray(list)) return fallback('broken', P);
  return list.map(row).filter(Boolean);
}

const R = {};
R['GET /api/x/mapviz/styles'] = async u => {
  for (const [k] of u.searchParams) throw fail('MV_USAGE', 'unknown argument ' + k + ' (this route takes none)');
  try { return { v: 1, styles: styles() }; } catch (e) { throw fail('MV_FAULT', e && e.message); }
};

module.exports = {
  routes: R,
  _t: {
    use(o) { STUB = o && Object.prototype.hasOwnProperty.call(o, 'paint') ? o.paint : undefined; },
    reset() { STUB = undefined; },
    styles, row, fallback,
  },
};
