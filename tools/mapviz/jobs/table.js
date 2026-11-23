// jobs table: what the job runner can run (tools/mapviz/README.md section 6.2, copied row for row). Sync, no state.
//   JOBS                    {what: {part, cmd, heavy, timeoutS, needs:[what], keys:[field], products:[name], argv?:[string], also?:[pattern]}}
//                           argv = words put right after `<part> <cmd>` (the paint rows: --style <id>); also = products
//                           written beside the listed ones, not checked when the job ends, but found by whatOfName
//                           (`<kind>` filled, `*` = one or more name characters)
//   FIELDS                  request fields a Keys column may name: mode, kind, side, size, phase, at, pose, light
//   DEFAULTS                the value a key field takes when the request leaves it out (mode null = the map file's W)
//   SIZE                    per-what size default (section 12: l1 2048 px; topo and l0 at the map's cell size = null, the part decides)
//   defaults(what) -> {mode, kind, side, size, phase, at, pose, light}   the filled defaults of one job
//   reduce(c, what, jobs?) -> request            a need's request: the same request reduced to that job's own keys. A key
//                           field (not mode) that the asking job (c.what) does not key takes the need's default, so the
//                           asking job's key decides its needs (checks of any kind reads travel of kind inf)
//   productFiles(row, req) -> [{name, dir:bool, alt:[file]}]   what a finished job must hold (<kind> filled; a layer name
//                           is <name>.mvg or <name>.json, a name ending .json is that file, tiles/<base> is a folder)
//   tilesOf(row) -> [base]  the tile sets the runner cuts after the part's command (products tiles/<base>)
//   alsoMatch(row, name, kind?) -> bool    name matches one of the row's `also` patterns
//   whatOfName(name, kind?, jobs?) -> what | null   the job that makes a layer or JSON product (products, then also)
//   whatOfTiles(base, jobs?) -> what | null          the job whose products hold tiles/<base>
//   check(jobs?) -> [problem text]   a bad row: unknown part field, a need that is not a job, a need cycle, a bad key,
//                           a bad argv or also
// Products are the table's names; tiles/<base> means the runner cuts pic.<base>.mvg into tiles/<base>/ (section 5.2).
// Author: Imperator_Aug (ARSENAL, ia-2daa014a)
'use strict';

const PAINT = style => ({ part: 'paint', cmd: 'draw', argv: ['--style', style], heavy: true });

const JOBS = {
  maps: { part: 'mapkit', cmd: 'list', heavy: false, timeoutS: 120, needs: [], keys: [], products: ['maps.json'] },
  doc: { part: 'mapkit', cmd: 'doc', heavy: false, timeoutS: 120, needs: [], keys: [], products: ['mapdoc.json'] },
  grids: { part: 'mapkit', cmd: 'grids', heavy: false, timeoutS: 120, needs: [], keys: ['mode'], products: ['height', 'gtype', 'gtype.stored', 'material'] },
  terrain: { part: 'raster', cmd: 'terrain', heavy: true, timeoutS: 120, needs: ['grids'], keys: [], products: ['slopecls', 'shade', 'landform.r10', 'landform.r50'] },
  topo: { part: 'raster', cmd: 'topo', heavy: true, timeoutS: 600, needs: ['doc', 'grids'], keys: ['size'], products: ['pic.topo', 'tiles/topo'] },
  water: { part: 'water', cmd: 'masks', heavy: true, timeoutS: 120, needs: ['doc', 'grids'], keys: ['mode'], products: ['water.band', 'water.drown', 'water.depth', 'water.labels', 'water.checks'] },
  pass: { part: 'pass', cmd: 'terrain', heavy: true, timeoutS: 120, needs: ['grids', 'terrain'], keys: ['mode', 'kind'], products: ['pass.<kind>', 'cost.<kind>'] },
  entcat: { part: 'entcat', cmd: 'map', heavy: true, timeoutS: 600, needs: ['doc'], keys: ['mode'], products: ['entcat.json', 'objects.json'] },
  l0: { part: 'render', cmd: 'l0', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'terrain', 'water'], keys: ['mode', 'size'], products: ['pic.l0', 'tiles/l0'] },
  l1: { part: 'render', cmd: 'l1', heavy: true, timeoutS: 600, needs: ['doc'], keys: ['mode', 'size'], products: ['pic.l1', 'tiles/l1'] },
  c0: { part: 'render', cmd: 'c0', heavy: true, timeoutS: 600, needs: ['l1'], keys: ['mode', 'size'], products: ['c0.json'] },
  // waves C and D (jobs.md 1.2)
  sight: { part: 'sight', cmd: 'grid', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'entcat'], keys: ['mode'],
    products: ['sight.grid', 'sight.ground', 'sight.field', 'sight.fire.top', 'sight.fire.bottom', 'sight.json'] },
  // view: the vector is sight.rings (file sight.rings.json; late J1, ruling R-a), the grid sight.view keeps its name;
  // entcat is a need because the seen items (P(seen)) read entcat.json from --in (late J2)
  view: { part: 'sight', cmd: 'view', heavy: false, timeoutS: 120, needs: ['doc', 'grids', 'entcat', 'sight'], keys: ['mode', 'kind', 'at', 'pose'],
    products: ['sight.view', 'sight.vis', 'sight.fire', 'sight.rings.json'] },
  cover: { part: 'cover', cmd: 'map', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'water', 'entcat'], keys: ['mode'],
    products: ['cover.edges.json', 'cover.points.json', 'cover.band', 'cover.lip', 'cover.conceal'] },
  obstacles: { part: 'pass', cmd: 'obstacles', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'terrain', 'pass', 'entcat'], keys: ['mode', 'kind'],
    products: ['obst.<kind>', 'move.<kind>', 'mcost.<kind>'] },
  // travel, routes: grids is a need because pass travel|routes read gtype.mvg from --in (the ground type K), else they
  // rebuild the mapkit grids in process (rules/pass/cli.js moveOf). phase null = the lowest phase of the mode (late J3,
  // ruling R-f): buildArgv passes no --phase, the part resolves it and writes the phase it used.
  travel: { part: 'pass', cmd: 'travel', heavy: true, timeoutS: 120, needs: ['doc', 'grids', 'obstacles'], keys: ['mode', 'kind', 'phase'],
    products: ['travel.a.<kind>', 'travel.b.<kind>', 'travel.json'] },
  routes: { part: 'pass', cmd: 'routes', heavy: true, timeoutS: 300, needs: ['doc', 'grids', 'obstacles', 'travel'], keys: ['mode', 'kind', 'phase'],
    products: ['routes.json', 'route.a.<kind>', 'route.b.<kind>'] },
  strong: { part: 'strong', cmd: 'points', heavy: true, timeoutS: 600,
    needs: ['doc', 'grids', 'terrain', 'water', 'entcat', 'sight', 'cover', 'obstacles', 'travel', 'routes'], keys: ['mode', 'kind', 'phase'],
    products: ['strong.<kind>.json', 'strong.a.<kind>.score', 'strong.b.<kind>.score', 'strong.a.<kind>.gate', 'strong.b.<kind>.gate', 'strong.contact.<kind>'],
    also: ['strong.a.<kind>.*', 'strong.b.<kind>.*'] },
  checks: { part: 'strong', cmd: 'checks', heavy: true, timeoutS: 300, needs: ['doc', 'grids', 'terrain', 'water', 'entcat', 'sight', 'obstacles', 'travel'], keys: ['mode', 'phase'],
    products: ['strong.checks.json'] },
  l2: { part: 'render', cmd: 'l2', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'entcat', 'l1'], keys: ['mode', 'size'], products: ['pic.l2', 'l2.n', 'l2.z', 'tiles/l2'] },
  pack: { part: 'render', cmd: 'pack', heavy: true, timeoutS: 1200, needs: ['doc', 'entcat'], keys: ['mode'], products: ['pack.json'] },
  l3: { part: 'render', cmd: 'l3', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'l2', 'pack'], keys: ['mode', 'size'], products: ['pic.l3', 'l3.n', 'l3.z', 'tiles/l3'] },
  l4: { part: 'render', cmd: 'l4', heavy: true, timeoutS: 600, needs: ['doc', 'grids', 'l3', 'pack'], keys: ['mode', 'size', 'light'], products: ['pic.l4', 'tiles/l4'] },
  staff: Object.assign(PAINT('staff'), { timeoutS: 600, needs: ['doc', 'grids', 'terrain', 'water', 'entcat'], keys: ['mode', 'size'], products: ['pic.staff', 'tiles/staff'] }),
  painted: Object.assign(PAINT('painted'), { timeoutS: 900, needs: ['doc', 'grids', 'terrain', 'water', 'entcat'], keys: ['mode', 'size'], products: ['pic.painted', 'tiles/painted'] }),
  recon: Object.assign(PAINT('recon'), { timeoutS: 600, needs: ['doc', 'l4'], keys: ['mode', 'size'], products: ['pic.recon', 'tiles/recon'] }),
  sketch: Object.assign(PAINT('sketch'), { timeoutS: 600, needs: ['doc', 'grids', 'terrain', 'water', 'entcat'], keys: ['mode', 'size'], products: ['pic.sketch', 'tiles/sketch'] }),
};

const FIELDS = ['mode', 'kind', 'side', 'size', 'phase', 'at', 'pose', 'light'];
const DEFAULTS = Object.freeze({ mode: null, kind: 'inf', side: 'both', size: null, phase: null, at: null, pose: 'stand', light: 'clean' });
const SIZE = Object.freeze({ l1: 2048, c0: 2048, l2: 2048, l3: 2048, l4: 2048, staff: 2048, painted: 2048, recon: 2048, sketch: 2048 });
const POSES = ['stand', 'kneel', 'prone'];
const LIGHTS = ['clean', 'mode'];

function defaults(what) {
  const d = Object.assign({}, DEFAULTS);
  if (SIZE[what] !== undefined) d.size = SIZE[what];
  return d;
}

// a need's request: identity fields kept (target, game, mods, modDirs, map), key fields only those of the need's row.
// When the asking job is known (c.what is a row) a key field it does not key, other than mode, takes the need's
// default: the asking job's key must decide what its needs are. mode keeps the wave B rule (passed down).
function reduce(c, what, jobs) {
  const J = jobs || JOBS, row = J[what];
  const parent = c && typeof c.what === 'string' && Object.prototype.hasOwnProperty.call(J, c.what) ? J[c.what] : null;
  const d = defaults(what);
  const r = { what, target: c.target, game: c.game, mods: c.mods, modDirs: c.modDirs, map: c.map };
  if (row) for (const k of row.keys) {
    if (c[k] === undefined) continue;
    r[k] = parent && k !== 'mode' && Array.isArray(parent.keys) && !parent.keys.includes(k) ? d[k] : c[k];
  }
  return r;
}

function productFiles(row, req) {
  const kind = req && req.kind ? req.kind : DEFAULTS.kind;
  return row.products.map(p => {
    const name = p.replace(/<kind>/g, kind);
    if (/^tiles\//.test(name)) return { name, dir: true, alt: [name] };
    if (/\.json$/.test(name)) return { name, dir: false, alt: [name] };
    return { name, dir: false, alt: [name + '.mvg', name + '.json'] };
  });
}

function tilesOf(row) { return row.products.filter(p => /^tiles\/[a-z0-9_]+$/.test(p)).map(p => p.slice(6)); }

const ALSO_RE = /^[a-z0-9_.<>*]+$/;
function alsoMatch(row, name, kind) {
  if (!row || !Array.isArray(row.also) || typeof name !== 'string') return false;
  const k = kind || DEFAULTS.kind;
  for (const p of row.also) {
    const src = p.replace(/<kind>/g, k).split('*').map(s => s.replace(/[.]/g, '\\.')).join('[a-z0-9_.]+');
    if (new RegExp('^' + src + '$').test(name)) return true;
  }
  return false;
}

// whatOfName(name, kind): the job whose products name a layer or JSON product `name` (<name>.mvg or <name>.json, or a
// product ending .json named in full), else whose `also` matches it; table order, first match
function whatOfName(name, kind, jobs) {
  const J = jobs || JOBS;
  if (typeof name !== 'string' || !name) return null;
  for (const w of Object.keys(J)) for (const f of productFiles(J[w], { kind })) {
    if (!f.dir && (f.name === name || f.alt.some(a => a === name + '.mvg' || a === name + '.json'))) return w;
  }
  for (const w of Object.keys(J)) if (alsoMatch(J[w], name, kind)) return w;
  return null;
}
function whatOfTiles(base, jobs) {
  const J = jobs || JOBS;
  for (const w of Object.keys(J)) if (J[w].products.indexOf('tiles/' + base) >= 0) return w;
  return null;
}

function check(jobs) {
  const J = jobs || JOBS, out = [];
  for (const [what, r] of Object.entries(J)) {
    if (!/^[a-z0-9_]+$/.test(what)) out.push('job ' + what + ': the name is not lower case letters, digits and _');
    if (!r || typeof r !== 'object') { out.push('job ' + what + ': the row is not an object'); continue; }
    if (typeof r.part !== 'string' || !r.part) out.push('job ' + what + ': part is missing');
    if (typeof r.cmd !== 'string' || !r.cmd) out.push('job ' + what + ': cmd is missing');
    if (typeof r.heavy !== 'boolean') out.push('job ' + what + ': heavy is not true or false');
    if (!(r.timeoutS > 0)) out.push('job ' + what + ': timeoutS is not above 0');
    if (!Array.isArray(r.needs)) out.push('job ' + what + ': needs is not a list');
    else for (const n of r.needs) if (!J[n]) out.push('job ' + what + ': need ' + n + ' is not a job');
    if (!Array.isArray(r.keys)) out.push('job ' + what + ': keys is not a list');
    else for (const k of r.keys) if (!FIELDS.includes(k)) out.push('job ' + what + ': key ' + k + ' is not a request field (' + FIELDS.join(', ') + ')');
    if (!Array.isArray(r.products) || !r.products.length) out.push('job ' + what + ': products is empty');
    if (r.argv !== undefined) {
      if (!Array.isArray(r.argv) || r.argv.some(a => typeof a !== 'string' || !a)) out.push('job ' + what + ': argv is not a list of words');
      else for (const a of r.argv) if (/^--(target|game|out|in)(=|$)/.test(a)) out.push('job ' + what + ': argv may not give ' + a + ' (the runner gives it)');
    }
    if (r.also !== undefined) {
      if (!Array.isArray(r.also) || r.also.some(a => typeof a !== 'string' || !ALSO_RE.test(a))) out.push('job ' + what + ': also is not a list of name patterns ([a-z0-9_.<>*])');
    }
  }
  // need cycles: depth-first walk
  const state = {};
  function walk(w, trail) {
    if (state[w] === 2 || !J[w] || !Array.isArray(J[w].needs)) return;
    if (state[w] === 1) { out.push('job ' + w + ': need cycle ' + trail.concat(w).join(' -> ')); return; }
    state[w] = 1;
    for (const n of J[w].needs) walk(n, trail.concat(w));
    state[w] = 2;
  }
  for (const w of Object.keys(J)) walk(w, []);
  return out;
}

module.exports = { JOBS, FIELDS, DEFAULTS, SIZE, POSES, LIGHTS, defaults, reduce, productFiles, tilesOf, alsoMatch, whatOfName, whatOfTiles, check };
