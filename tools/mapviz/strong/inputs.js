// strong inputs (MV-STR): every input of rules.md 6.1 read from --in folders by file name (README 2.2), and the missing
// ones computed in process through their owners' exports (o.rules = {sight, cover, pass, water}; default the real
// modules, loaded at first use), each with note STRONG_INPUT_COMPUTED. An input that is absent and cannot be computed
// (no game source, or the owner's export is not built yet) throws MvError MV_NOT_FOUND (code STRONG_INPUT_ABSENT).
// Per-kind inputs (move, travel, routes) load lazily: kindInputs(I, kind, want) for the kind, its THREAT kind and the
// kinds the checks need.
// Author: Imperator_Aug (ARSENAL, ia-1dd2123c)
'use strict';
const fs = require('fs');

function mv() { return require('../mapviz'); }
function gf() { return require('../lib/raster/gridfile'); }
const gameOf = t => t === 'goh' ? 'goh' : 'as2';

// the real rule modules, each loaded once at first use; a module not built yet is null
function defaultRules() {
  const load = (name) => { try { return require('../rules/' + name); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).includes('rules/' + name)) return null; if (e && e.code === 'MODULE_NOT_FOUND') return null; throw e; } };
  const cache = {};
  const get = n => (n in cache ? cache[n] : (cache[n] = load(n)));
  return { get sight() { return get('sight'); }, get cover() { return get('cover'); }, get pass() { return get('pass'); }, get water() { return get('water'); } };
}
const has = (mod, fn) => !!(mod && typeof mod[fn] === 'function');

function inputs(dirs, o) {
  const M = mv();
  o = o || {};
  dirs = dirs || [];
  if (!o.target || !M.TARGETS[o.target]) throw new M.MvError('MV_USAGE', 'strong: --target as64|mowas2|goh is needed');
  const I = { v: 1, dirs, target: o.target, game: gameOf(o.target), map: o.map || null, mode: o.mode || null, phase: o.phase === undefined ? null : o.phase,
    kind: o.kind || 'inf', rules: o.rules || defaultRules(), notes: [], computed: [], kinds: {}, srcFn: o.srcFn || null, src: o.src || null };
  const absent = (what, why) => { throw new M.MvError('MV_NOT_FOUND', 'strong: input ' + what + ' is absent and cannot be computed (' + why + ')', { code: 'STRONG_INPUT_ABSENT', input: what }); };
  I.absent = absent;
  I.source = (what) => {
    if (I.src) return I.src;
    if (I.srcFn) return (I.src = I.srcFn());
    return absent(what, 'no game source');
  };
  I.computedNote = (name) => { if (!I.computed.includes(name)) { I.computed.push(name); I.notes.push({ code: 'STRONG_INPUT_COMPUTED', msg: name + ' was computed in process' }); } };
  I.grid = (name) => { const f = M.findIn(dirs, name + '.mvg'); return f ? gf().read(f) : null; };
  I.json = (name) => { const f = M.findIn(dirs, name); return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };

  // doc
  let doc = o.doc || I.json('mapdoc.json');
  if (doc && I.map && doc.key !== I.map) doc = null;
  if (!doc) {
    if (!I.map) absent('mapdoc.json', 'no --map');
    doc = require('../lib/mapkit').doc(I.source('mapdoc.json'), I.map, { mode: I.mode || undefined });
    I.computedNote('mapdoc.json');
  }
  I.doc = doc; I.map = I.map || doc.key;
  const F = require('./frame');
  const m = F.pickMode(doc, I.mode);
  I.mode = m.id; I.m = m;
  // one phase for strong and its pass inputs: rules/pass resolvePhase when built, else the same rule locally
  const Pp = I.rules.pass;
  I.phase = has(Pp, 'resolvePhase') ? Pp.resolvePhase(doc, m.id, I.phase) : F.phaseOf(m, I.phase);
  // base grids
  let height = o.grids && o.grids.height || I.grid('height'), gtype = o.grids && o.grids.gtype || I.grid('gtype');
  if (!height || !gtype) {
    const g = require('../lib/mapkit').grids(I.source('height.mvg'), I.map, { mode: I.mode || undefined });
    height = g.height; gtype = g.gtype; I.computedNote('height, gtype');
  }
  const R = require('../lib/raster');
  let slopecls = o.grids && o.grids.slopecls || I.grid('slopecls');
  if (!slopecls) { slopecls = R.slopeClass(height); I.computedNote('slopecls'); }
  let landform = o.grids && o.grids.landform || I.grid('landform.r50');
  if (!landform) { landform = R.landform(height, 50); I.computedNote('landform.r50'); }
  I.grids = { height, gtype, slopecls, landform };
  // water
  let band = I.grid('water.band'), drown = I.grid('water.drown'), depth = I.grid('water.depth');
  if (o.water) ({ band, drown, depth } = o.water);
  if (!band || !drown || !depth) {
    const W = I.rules.water;
    if (!has(W, 'masks') || !has(W, 'profile')) absent('water.band', 'rules.water not built');
    const m = W.masks(doc, I.grids, W.profile(I.source('water.band')), I.mode || undefined);
    band = m.band; drown = m.drown; depth = m.depth; I.computedNote('water');
  }
  I.water = { band, drown, depth };
  I.W = drown.meta && Number.isFinite(drown.meta.W) ? drown.meta.W : (doc.modes.find(m => m.id === I.mode) || {}).water ?? doc.water.level;
  return I;
}

// objects and catalog (entcat): objects.json, entcat.json, else entcat in process
function objects(I) {
  if (I.objects) return I.objects;
  const oj = I.json('objects.json'), cj = I.json('entcat.json');
  let cat = cj, objs = oj ? oj.items : null;
  const E = require('../entcat');
  if (!cat) { cat = E.forDoc(I.source('entcat.json'), I.doc, {}); I.computedNote('entcat.json'); }
  if (!objs) { objs = E.place(I.doc, cat); I.computedNote('objects.json'); }
  I.catalog = cat; I.objects = objs;
  return objs;
}

function placed(I) {
  if (I.placed) return I.placed;
  objects(I);
  const E = require('../entcat');
  if (typeof E.placeSolids !== 'function') I.absent('solids', 'entcat.placeSolids not built');
  I.placed = E.placeSolids(I.doc, I.catalog, E.loaderFor(I.source('solids')), I.grids);
  return I.placed;
}

// sight products: sg {grid, ground, field}, fg {top, bottom, height, gtype, W}, vprof
function sight(I) {
  if (I.sight) return I.sight;
  const S = I.rules.sight;
  let grid = I.grid('sight.grid'), ground = I.grid('sight.ground'), field = I.grid('sight.field');
  let top = I.grid('sight.fire.top'), bottom = I.grid('sight.fire.bottom');
  const sj = I.json('sight.json');
  if (!grid || !ground) {
    if (!has(S, 'grid')) I.absent('sight.grid', 'rules.sight not built');
    const r = S.grid(I.doc, I.grids, S.needsPlaced === false ? null : placed(I), { target: I.target });
    grid = r.grid; ground = r.ground; field = r.field; I.computedNote('sight.grid');
  }
  if (!top || !bottom) {
    if (!has(S, 'fireGrid')) I.absent('sight.fire.top', 'rules.sight not built');
    const r = S.fireGrid(I.doc, I.grids, S.needsPlaced === false ? null : placed(I), { mode: I.mode, target: I.target });
    top = r.top; bottom = r.bottom; I.computedNote('sight.fire');
  }
  let vprof = sj && sj.profile;
  if (!vprof) {
    if (!has(S, 'profile')) I.absent('sight.json', 'rules.sight not built');
    vprof = S.profile(I.source('sight.json')); I.computedNote('sight.json');
  }
  for (const fn of ['canSee', 'fireLine', 'rangeM']) if (!has(S, fn)) I.absent('sight rules', 'rules.sight.' + fn + ' not built');
  I.sight = { sg: { grid, ground, field }, fg: { top, bottom, height: I.grids.height, gtype: I.grids.gtype, W: I.W }, vprof,
    stepU: grid.meta && grid.meta.stepU || grid.scale || 2.1875 };
  return I.sight;
}

// cover products: points (coverPoint items), lip, conceal
function cover(I) {
  if (I.cover) return I.cover;
  const C = I.rules.cover;
  const pj = I.json('cover.points.json');
  let lip = I.grid('cover.lip'), conceal = I.grid('cover.conceal');
  let points = pj ? pj.items : null;
  if (!points || !lip) {
    if (!has(C, 'points') || !has(C, 'lip')) I.absent('cover.points.json', 'rules.cover not built');
    objects(I);
    const pl = C.needsPlaced === false ? null : placed(I);
    const cpts = C.points(I.doc, Object.assign({}, I.grids, { band: I.water.band }), I.catalog, I.objects, pl, { target: I.target });
    const l = C.lip(I.grids, { target: I.target, objects: I.objects, near: cpts });
    lip = l.lip;
    let cc = { points: [], conceal };
    if (has(C, 'conceal')) cc = C.conceal(I.doc, I.grids, pl, { target: I.target, objects: I.objects, catalog: I.catalog, near: cpts.concat(l.points || []) });
    points = cpts.concat(l.points || [], cc.points || []);
    conceal = cc.conceal || conceal;
    I.computedNote('cover.points.json');
  }
  for (const fn of ['shields', 'terrainShields']) if (!has(C, fn)) I.absent('cover rules', 'rules.cover.' + fn + ' not built');
  if (!C.VALUE) I.absent('cover rules', 'rules.cover.VALUE not built');
  I.cover = { points: points.filter(p => p && p.kind === 'coverPoint'), lip, conceal, VALUE: C.VALUE,
    lipUsed: I.game !== 'goh' && !(lip && lip.meta && lip.meta.used === false) };
  return I.cover;
}

// per-kind inputs: move, mcost, travel {a, b}, route {a, b}, routes items. want = {travel, routes}
function kindInputs(I, k, want) {
  want = want || { travel: true, routes: true };
  const P = I.rules.pass;
  const K = I.kinds[k] || (I.kinds[k] = { kind: k });
  const prof = () => {
    if (K.prof) return K.prof;
    if (!has(P, 'profiles') || !has(P, 'kindProfile')) I.absent('pass profile', 'rules.pass not built');
    const src = I.source('pass profile of ' + k);
    K.prof = P.kindProfile(P.profiles(src), k, src);
    return K.prof;
  };
  const box = side => has(P, 'activeBox') ? P.activeBox(I.doc, I.mode, side, I.phase) : (I.doc.boxes.pather || I.doc.boxes.auto || I.doc.boxes.world);
  if (!K.move) {
    K.move = I.grid('move.' + k); K.mcost = I.grid('mcost.' + k);
    if (!K.move) {
      if (!has(P, 'obstacles')) I.absent('move.' + k, 'rules.pass.obstacles not built');
      objects(I);
      const r = P.obstacles(I.grids, I.objects, I.catalog, prof(), { box: has(P, 'activeBox') ? P.activeBox(I.doc, I.mode, null, null) : box('a'), target: I.target });
      K.move = r.move; K.mcost = r.mcost; I.computedNote('move.' + k);
    }
  }
  const mvv = () => ({ move: K.move, mcost: K.mcost, gtype: I.grids.gtype });
  const speedOf = () => K.speed !== undefined ? K.speed : (K.speed = has(P, 'speed') ? P.speed(I.source('speed of ' + k), k, prof()) : null);
  if (want.travel && !K.travel) {
    let a = I.grid('travel.a.' + k), b = I.grid('travel.b.' + k);
    if (!a || !b) {
      if (!has(P, 'travel') || !has(P, 'spawnsOf')) I.absent('travel.a.' + k, 'rules.pass.travel not built');
      const one = s => {
        const sources = P.spawnsOf(I.doc, I.mode, s, I.phase);
        if (!sources.length) throw new (mv().MvError)('MV_NOT_FOUND', 'strong: side ' + s + ' has no spawn in mode ' + I.mode, { code: 'PASS_NO_SPAWN', side: s });
        return P.travel(mvv(), prof(), speedOf(), sources, { name: 'travel.' + s + '.' + k, box: box(s), target: I.target }).t;
      };
      a = one('a'); b = one('b');
      I.computedNote('travel.' + k);
    }
    K.travel = { a, b };
  }
  if (want.routes && !K.routes) {
    const rj = I.json('routes.json');
    let items = rj && Array.isArray(rj.items) ? rj.items.filter(r => r.unit === k) : null;
    let da = I.grid('route.a.' + k), db = I.grid('route.b.' + k);
    if (!items || !items.length || !da || !db) {
      if (!has(P, 'routes')) I.absent('routes.json', 'rules.pass.routes not built');
      kindInputs(I, k, { travel: true, routes: false });
      const r = P.routes(I.doc, mvv(), K.travel.a, K.travel.b, { mode: I.mode, phase: I.phase, unit: k, seed: I.seed || 1, k: 8, prof: prof(), speed: speedOf(), target: I.target });
      items = r.items.filter(x => x.unit === k || x.unit === undefined).map(x => Object.assign({ unit: k }, x));
      da = r.density && r.density.a; db = r.density && r.density.b;
      I.computedNote('routes.' + k);
    }
    K.routes = items; K.route = { a: da || null, b: db || null };
  }
  return K;
}

module.exports = { inputs, objects, placed, sight, cover, kindInputs, defaultRules };
