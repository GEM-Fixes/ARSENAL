// jobs/cache: the mapviz cache (tools/mapviz/README.md section 8). Sync, node built-ins + the mapviz helpers only.
// Root = toolcache.dir('mapviz') (ARSENAL_CACHE replaces it, every test sets it). Tree:
//   index.json {v:1, cap, entries:{key:{what, part, target, map, bytes, made, used}}}   rebuilt from the manifests when lost
//   e/<key>/manifest.json (written last), products, tiles/<base>/<z>/<x>_<y>.png
//   jobs/<id>/{job.json, progress.jsonl, cancel, stdout.txt, stderr.txt, out/}   runs/<run id>/ (edshot, never touched here)
//   locks/heavy, locks/<key>  mkdir locks with owner.json; older than 10 min = stale and taken over
//   locks/index               a short mkdir lock around every read-change-write of index.json (between processes; 2 s
//                             wait, 10 s stale). index.json lags the disk at worst: evict, clear, size and stats merge
//                             the complete entries on disk that it lacks, and an index failure never fails a commit.
// Exports (README 8.5; the module-level functions work on root()):
//   root(o) -> folder;  entryKey(o) -> 16 hex;  open(key) -> {dir, manifest} | null (absent, incomplete, corrupt or stale)
//   commit(key, outDir, manifest) -> dir   rename out into e/<key>, write manifest.json last, update the index, evict
//   use(key);  size() -> bytes;  evict(cap?, {keep}) -> [key removed];  clear('all' | {scope:'all'|'map', target?, map})
//     -> {removed, bytes} (MV_BUSY while a job holds a lock on what it would remove);  fresh(manifest) -> bool;  CAP
// Also: at(root, {now, cap}) -> the same functions bound to one root and clock (the runner and the tests use it);
//   canon(req, row) -> canonical request;  keyLines(c, part, version, needs?) -> [line];  partVersion(part, parts?) -> integer;
//   needParts(row, jobs?) -> [part];  needVersions(row, jobs?, versionOf?) -> {part: version};
//   lock(name, owner) -> {release, refresh} | null;  locked(name);  stats() -> {v:1, root, bytes, cap, entries, jobs};
//   at(...) also gives readIndex(), merged() (index + complete entries on disk it lacks), writeIndex(idx), withIndex(fn).
// Key (README 8.2): sha1 of mapviz/<CONTRACT>, <part>@<part version>, for a job with needs 'needs:<part>@<version>,...'
// (the parts of every job below it in the job table, sorted, each once), what, target, game (resolved, lower case,
// forward slashes), mods joined by ',', modDirs joined by ';', map key or '-', canonical JSON of the Keys-column fields
// (defaults filled), joined by "\n"; the first 16 hex. Nothing else enters it. So a bump of mapkit or raster alone
// changes the key of every job built on their grids (water, pass, topo, l0, ...). `made` and `used` are ms since 1970 (Date.now()).
// Author: Imperator_Aug (ARSENAL, ia-9b090194)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const mv = require('../mapviz');
const table = require('./table');

const CAP = 2 * 1024 * 1024 * 1024;
const STALE_MS = 10 * 60 * 1000;
const INDEX_WAIT_MS = 2000, INDEX_STALE_MS = 10000;   // locks/index: the short lock around an index.json update
const KEY_RE = /^[0-9a-f]{16}$/;
const LOCK_RE = /^(heavy|[0-9a-f]{16})$/;
const MODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const MOD_RE = /^[A-Za-z0-9_.() -]+(:[A-Za-z0-9_.-]+)?$/;
const MAP_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

const usage = msg => new mv.MvError('MV_USAGE', msg);
const SAB = new Int32Array(new SharedArrayBuffer(4));
function sleep(ms) { Atomics.wait(SAB, 0, 0, ms); }
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (e) { /* gone or held: the next clear tries again */ } }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function slash(p) { return String(p).replace(/\\/g, '/'); }

function root(o) {
  if (o && o.root) return path.resolve(o.root);
  return require('../../lib/toolcache').dir('mapviz');
}

// ---- requests and keys ----
// canon(req, row): {what, target, game (absolute), mods, modDirs (absolute), map|null, mode, kind, side, size, phase, at,
// pose, light, variant}. phase null or 0..99; at null or "x,y" (2 decimals at most, not snapped; a row keying at
// refuses null); pose stand|kneel|prone; light clean|mode.
// Throws MV_USAGE on a bad field, MV_NOT_FOUND when no --game is given and the target has no install. Idempotent.
function canon(req, row) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw usage('a job request is an object');
  const what = req.what;
  row = row || table.JOBS[what];
  if (!row) throw usage('no job named ' + what + '; jobs: ' + Object.keys(table.JOBS).join(', '));
  if (!mv.TARGETS[req.target]) throw usage('target must be as64, mowas2 or goh, got ' + req.target);
  if (req.game !== undefined && req.game !== null && (typeof req.game !== 'string' || !req.game)) throw usage('game must be a folder');
  const game = mv.gameFolder({ target: req.target, game: req.game || undefined });
  let mods = req.mods === undefined || req.mods === null ? [] : req.mods;
  if (typeof mods === 'string') mods = mods.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(mods) || mods.some(m => typeof m !== 'string' || !MOD_RE.test(m))) throw usage('mods must be a list of mod names');
  let modDirs = req.modDirs === undefined || req.modDirs === null ? [] : req.modDirs;
  if (typeof modDirs === 'string') modDirs = [modDirs];
  if (!Array.isArray(modDirs) || modDirs.some(d => typeof d !== 'string' || !d)) throw usage('modDirs must be a list of folders');
  modDirs = modDirs.map(d => path.resolve(d));
  let map = null;
  if (what !== 'maps') {
    map = req.map;
    if (typeof map !== 'string' || !MAP_RE.test(map) || map.split('/').some(s => s === '..' || s === '.') || /^map\//.test(map))
      throw usage('map must be a map key such as multi/1v1_road, got ' + map);
  }
  const args = req.args === undefined || req.args === null ? {} : req.args;
  if (typeof args !== 'object' || Array.isArray(args)) throw usage('args must be an object');
  for (const k of Object.keys(args)) {
    if (!table.FIELDS.includes(k)) throw usage('args.' + k + ' is not a job field (' + table.FIELDS.join(', ') + ')');
    if (req[k] !== undefined && req[k] !== null && req[k] !== args[k]) throw usage(k + ' is given twice with two values');
  }
  const d = table.defaults(what), f = {};
  for (const k of table.FIELDS) {
    let v = req[k] !== undefined && req[k] !== null ? req[k] : args[k];
    if (v === undefined || v === null || v === '') v = d[k];
    f[k] = v;
  }
  if (f.mode !== null && (typeof f.mode !== 'string' || !MODE_RE.test(f.mode))) throw usage('mode must be a mode id such as battle_zones, got ' + f.mode);
  if (!mv.KINDS.includes(f.kind)) throw usage('kind must be ' + mv.KINDS.join(', ') + ', got ' + f.kind);
  if (!mv.SIDES.includes(f.side)) throw usage('side must be ' + mv.SIDES.join(', ') + ', got ' + f.side);
  if (f.size !== null) {
    const n = Number(f.size);
    if (!Number.isInteger(n) || n < 16 || n > 16384) throw usage('size must be a whole number of pixels from 16 to 16384, got ' + f.size);
    f.size = n;
  }
  if (f.phase !== null) {
    const n = typeof f.phase === 'number' ? f.phase : typeof f.phase === 'string' && /^\s*\d+\s*$/.test(f.phase) ? Number(f.phase) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 99) throw usage('phase must be a whole number from 0 to 99, got ' + f.phase);
    f.phase = n;
  }
  if (f.at !== null) f.at = canonAt(f.at);
  if (!table.POSES.includes(f.pose)) throw usage('pose must be ' + table.POSES.join(', ') + ', got ' + f.pose);
  if (!table.LIGHTS.includes(f.light)) throw usage('light must be ' + table.LIGHTS.join(' or ') + ', got ' + f.light);
  if (row.keys.includes('at') && f.at === null) throw usage('at is required for ' + what + ' (a spot x,y in world units)');
  const variant = {};
  for (const k of row.keys.slice().sort()) variant[k] = f[k];
  return { what, target: req.target, game, mods, modDirs, map, mode: f.mode, kind: f.kind, side: f.side, size: f.size,
    phase: f.phase, at: f.at, pose: f.pose, light: f.light, variant };
}

// canonAt(v): "x,y" (or [x, y]) of two finite numbers in world units -> "x,y" with at most 2 decimals, no -0. No snap.
function canonAt(v) {
  let p = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!p || p.length !== 2) throw usage('at must be x,y in world units, got ' + v);
  p = p.map(s => (typeof s === 'number' ? s : typeof s === 'string' && !/^\s*$/.test(s) ? Number(s) : NaN));
  if (!p.every(Number.isFinite)) throw usage('at must be two finite numbers x,y, got ' + v);
  return p.map(n => { const r = Math.round(n * 100) / 100; return String(r === 0 ? 0 : r); }).join(',');
}

function sortedJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(sortedJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + sortedJson(v[k])).join(',') + '}';
}

// keyLines(c, part, version, needs?): needs = {part: version} of the parts below the job (needVersions); when it is not
// empty a line 'needs:<part>@<version>,...' (parts sorted) follows the part line. A job with no needs keeps the old lines.
function keyLines(c, part, version, needs) {
  const lines = ['mapviz/' + mv.CONTRACT, part + '@' + version];
  const np = needs ? Object.keys(needs).sort() : [];
  if (np.length) lines.push('needs:' + np.map(p => p + '@' + needs[p]).join(','));
  return lines.concat([c.what, c.target, slash(c.game).toLowerCase(), c.mods.join(','),
    c.modDirs.map(slash).join(';'), c.map === null ? '-' : c.map, sortedJson(c.variant)]);
}
function keyOf(lines) { return crypto.createHash('sha1').update(lines.join('\n')).digest('hex').slice(0, 16); }

// the version of a part's cli.js (README 8.2). parts = a parts table (tests); default mapviz.PARTS.
function partVersion(part, parts) {
  const p = mv.findPart(part, parts);
  if (!p) throw new mv.MvError('MV_FAULT', 'the job table names part ' + part + ', which is not in the parts table');
  let cli;
  try { cli = p.load(); } catch (e) { throw new mv.MvError('MV_FAULT', 'part ' + part + ' is broken: ' + (e && e.message)); }
  if (!cli) throw new mv.MvError('MV_NOT_BUILT', 'part ' + part + ' is not built (' + p.id + ', wave ' + p.wave + ')', { id: p.id, wave: p.wave });
  if (!Number.isInteger(cli.version)) throw new mv.MvError('MV_FAULT', 'part ' + part + ' is broken: its cli has no integer version');
  return cli.version;
}

// needParts(row, jobs?): the parts of every job below row in the job table (its needs, their needs, ...), sorted, each
// once (the row's own part too when a need runs it). A need that is not a job is left out (the runner fails that job
// with MV_FAULT); a need cycle is walked once (the runner refuses it at submit).
function needParts(row, jobs) {
  const J = jobs || table.JOBS, seen = new Set(), parts = new Set();
  (function walk(r) {
    if (!r || !Array.isArray(r.needs)) return;
    for (const n of r.needs) {
      if (seen.has(n) || !Object.prototype.hasOwnProperty.call(J, n) || !J[n]) continue;
      seen.add(n);
      if (typeof J[n].part === 'string' && J[n].part) parts.add(J[n].part);
      walk(J[n]);
    }
  })(row);
  return [...parts].sort();
}

function intVersion(part, v) {
  if (!Number.isInteger(v)) throw new mv.MvError('MV_FAULT', 'part ' + part + ' is broken: its version ' + v + ' is not an integer');
  return v;
}

// needVersions(row, jobs?, versionOf?) -> {part: version} of needParts; versionOf(part) -> integer, default partVersion
function needVersions(row, jobs, versionOf) {
  const read = typeof versionOf === 'function' ? versionOf : p => partVersion(p);
  const out = {};
  for (const p of needParts(row, jobs)) out[p] = intVersion(p, read(p));
  return out;
}

// entryKey(o): o = a request (section 6.2 body, or a canonical one) + optional row (the table.JOBS row; else looked up by
// o.what in o.jobs or table.JOBS), jobs (the job table the needs are followed in; default table.JOBS), version (else the
// part's cli version), needVersions ({part: version}, else read for needParts), versionOf(part) -> integer (the version reader;
// default partVersion(part, o.parts)) and parts (a parts table, tests). A need run by the job's own part takes o.version.
function entryKey(o) {
  const row = o && (o.row || (o.jobs || table.JOBS)[o.what]);
  if (!row) throw usage('no job named ' + (o && o.what));
  const c = canon(o, row);
  const read = typeof o.versionOf === 'function' ? o.versionOf : p => partVersion(p, o.parts);
  const version = Number.isInteger(o.version) ? o.version : intVersion(row.part, read(row.part));
  const needs = o.needVersions && typeof o.needVersions === 'object' ? o.needVersions : needVersions(row, o.jobs, p => (p === row.part ? version : read(p)));
  return keyOf(keyLines(c, row.part, version, needs));
}

// ---- files ----
function listFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) out.push({ name: r, bytes: fs.statSync(p).size });
    }
  })(dir, '');
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function renameRetry(a, b) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(a, b); return; } catch (e) {
      if (e.code === 'EXDEV') { fs.cpSync(a, b, { recursive: true }); rmrf(a); return; }
      if (i >= 20 || !/^(EPERM|EBUSY|EACCES|ENOTEMPTY)$/.test(e.code)) throw e;
      sleep(50);   // Windows: a scanner or indexer may hold a file for a moment
    }
  }
}

// ---- one root ----
function at(rootDir, o) {
  o = o || {};
  const R = path.resolve(rootDir);
  const now = o.now || Date.now;
  const capDefault = o.cap > 0 ? o.cap : CAP;
  const E = path.join(R, 'e'), J = path.join(R, 'jobs'), L = path.join(R, 'locks'), IDX = path.join(R, 'index.json');
  const entryDir = key => path.join(E, key);
  const jobDir = id => path.join(J, id);

  function rebuild() {
    const idx = { v: 1, cap: capDefault, entries: {} };
    let names = [];
    try { names = fs.readdirSync(E); } catch (e) { return idx; }
    for (const k of names) {
      if (!KEY_RE.test(k)) continue;
      const m = readJson(path.join(E, k, 'manifest.json'));
      if (!m || m.complete !== true || !Array.isArray(m.files)) continue;
      const bytes = m.files.reduce((s, f) => s + (f.bytes || 0), 0);
      idx.entries[k] = { what: m.what, part: m.part, target: m.target, map: m.map, bytes, made: m.made, used: m.made };
    }
    return idx;
  }
  function readIndex() {
    const j = readJson(IDX);
    if (!j || j.v !== 1 || !j.entries || typeof j.entries !== 'object' || Array.isArray(j.entries)) return rebuild();
    if (!(j.cap > 0)) j.cap = capDefault;
    return j;
  }
  // merged(): the index plus every complete entry on disk it lacks (a lost update, a crash between manifest and index);
  // evict, clear, size and stats work on it, so an entry missing from index.json is still counted, evicted and cleared
  function merged() {
    const idx = readIndex();
    let names = [];
    try { names = fs.readdirSync(E); } catch (e) { return idx; }
    for (const k of names) {
      if (!KEY_RE.test(k) || idx.entries[k]) continue;
      const m = readManifest(k);
      if (!m || m.complete !== true || !Array.isArray(m.files)) continue;
      idx.entries[k] = { what: m.what, part: m.part, target: m.target, map: m.map, bytes: m.files.reduce((s, f) => s + (f.bytes || 0), 0), made: m.made, used: m.made };
    }
    return idx;
  }
  // index.json is written through a unique tmp file and a retried rename (Windows: a reader holding it makes rename fail
  // for a moment). Every read-change-write runs under withIndex: a short mkdir lock locks/index between processes.
  function writeIndex(idx) {
    fs.mkdirSync(R, { recursive: true });
    const tmp = IDX + '.tmp' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
    try { fs.writeFileSync(tmp, JSON.stringify(idx) + '\n'); renameRetry(tmp, IDX); } catch (e) { rmrf(tmp); throw e; }
  }
  // withIndex(fn): fn() under locks/index. Waits up to INDEX_WAIT_MS; a lock older than INDEX_STALE_MS (a holder that
  // died: an index update takes milliseconds) is taken over; when the wait runs out fn runs anyway, because merged()
  // heals a lost update from the manifests. The lock name is not heavy or a key, so clear and heldLocks never see it.
  function withIndex(fn) {
    const d = path.join(L, 'index');
    let got = false;
    try {
      fs.mkdirSync(L, { recursive: true });
      const end = Date.now() + INDEX_WAIT_MS;
      for (;;) {
        try { fs.mkdirSync(d); got = true; break; } catch (e) {
          if (e.code !== 'EEXIST') break;
          let st = null;
          try { st = fs.statSync(d); } catch (e2) { continue; }   // released between the two calls
          if (Date.now() - st.mtimeMs > INDEX_STALE_MS) { rmrf(d); continue; }
          if (Date.now() > end) break;
          sleep(5 + Math.floor(Math.random() * 20));
        }
      }
    } catch (e) { /* no locks folder: run unlocked */ }
    try { return fn(); } finally { if (got) { try { fs.rmdirSync(d); } catch (e) { rmrf(d); } } }
  }

  function readManifest(key) { return KEY_RE.test(key) ? readJson(path.join(E, key, 'manifest.json')) : null; }

  // fresh(m): complete, every input has the same size and mtime, every dep exists, was not made after m and is fresh itself
  function fresh(m, seen) {
    if (!m || typeof m !== 'object' || m.v !== 1 || m.complete !== true || !Array.isArray(m.inputs) || !Array.isArray(m.deps) || !Array.isArray(m.files)) return false;
    if (typeof m.made !== 'number') return false;
    for (const i of m.inputs) {
      if (!i || typeof i.file !== 'string') return false;
      let st;
      try { st = fs.statSync(i.file); } catch (e) { return false; }
      if (st.size !== i.size || st.mtimeMs !== i.mtimeMs) return false;
    }
    seen = seen || new Set();
    for (const d of m.deps) {
      if (!d || !KEY_RE.test(d.key)) return false;
      const dm = readManifest(d.key);
      if (!dm || typeof dm.made !== 'number' || dm.made > m.made) return false;
      if (typeof d.made === 'number' && dm.made !== d.made) return false;
      if (!seen.has(d.key)) { seen.add(d.key); if (!fresh(dm, seen)) return false; }
    }
    return true;
  }

  // use(key): marks the entry used now; an entry on disk that the index lacks is added. false when there is no entry.
  function use(key) {
    if (!KEY_RE.test(String(key))) return false;
    return withIndex(() => {
      const idx = readIndex();
      if (!idx.entries[key]) {
        const m = readManifest(key);
        if (!m || m.complete !== true || !Array.isArray(m.files)) return false;
        idx.entries[key] = { what: m.what, part: m.part, target: m.target, map: m.map, bytes: m.files.reduce((s, f) => s + (f.bytes || 0), 0), made: m.made, used: m.made };
      }
      idx.entries[key].used = now();
      writeIndex(idx);
      return true;
    });
  }

  function open(key, oo) {
    if (!KEY_RE.test(String(key))) return null;
    const dir = entryDir(key), m = readManifest(key);
    if (!m || !fresh(m)) return null;
    for (const f of m.files) if (f && typeof f.name === 'string' && f.name.indexOf('/') < 0 && !fs.existsSync(path.join(dir, f.name))) return null;
    if (!(oo && oo.touch === false)) { try { use(key); } catch (e) { /* the LRU mark is best effort; the entry is good */ } }
    return { dir, manifest: m };
  }

  function commit(key, outDir, manifest) {
    if (!KEY_RE.test(String(key))) throw new mv.MvError('MV_FAULT', 'cache key ' + key + ' is not 16 hex');
    if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) throw new mv.MvError('MV_FAULT', 'nothing to commit: ' + outDir + ' is not a folder');
    fs.mkdirSync(E, { recursive: true });
    rmrf(path.join(outDir, 'manifest.json'));                 // a part never writes one; the entry is complete only when we do
    const files = listFiles(outDir);
    const dir = entryDir(key);
    if (fs.existsSync(dir)) { const old = path.join(E, '.old-' + key + '-' + process.pid + '-' + now()); renameRetry(dir, old); rmrf(old); }
    renameRetry(outDir, dir);
    const t = now();
    const m = Object.assign({ v: 1, part: null, partVersion: null, needVersions: {}, contract: mv.CONTRACT, what: null, variant: {}, target: null, game: null,
      mods: [], modDirs: [], map: null, made: t, inputs: [], deps: [], files: [], notes: [] }, manifest || {}, { files, complete: true });
    mv.writeAtomic(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 1) + '\n');
    // the entry is complete now: an index or eviction failure must not fail the commit (merged() heals the index)
    let cap = capDefault;
    try {
      withIndex(() => {
        const idx = readIndex();
        cap = idx.cap;
        idx.entries[key] = { what: m.what, part: m.part, target: m.target, map: m.map, bytes: files.reduce((s, f) => s + f.bytes, 0), made: m.made, used: t };
        writeIndex(idx);
      });
    } catch (e) {
      try { withIndex(() => { const idx = merged(); cap = idx.cap; writeIndex(idx); }); } catch (e2) { rmrf(IDX); }   // gone = rebuilt on the next read
    }
    try { evict(cap, { keep: [key] }); } catch (e) { /* the next commit or jobs cache --evict tries again */ }
    return dir;
  }

  function size() {
    const idx = merged();
    return Object.values(idx.entries).reduce((s, e) => s + (e.bytes || 0), 0);
  }

  // ---- locks ----
  function lockFresh(name) {
    let st;
    try { st = fs.statSync(path.join(L, name)); } catch (e) { return false; }
    return now() - st.mtimeMs <= STALE_MS;
  }
  function lock(name, owner) {
    if (!LOCK_RE.test(String(name))) throw new mv.MvError('MV_FAULT', 'lock name ' + name + ' is not heavy or a key');
    const d = path.join(L, name);
    fs.mkdirSync(L, { recursive: true });
    const token = crypto.randomBytes(8).toString('hex');
    for (let i = 0; i < 3; i++) {
      try { fs.mkdirSync(d); } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let st;
        try { st = fs.statSync(d); } catch (e2) { continue; }          // released between the two calls: try again
        if (now() - st.mtimeMs <= STALE_MS) return null;
        rmrf(d);                                                      // stale: take it over
        continue;
      }
      try { fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify(Object.assign({ pid: process.pid, token, at: now() }, owner || {}))); } catch (e) { /* the lock is the folder */ }
      return {
        name, dir: d,
        release() { const ow = readJson(path.join(d, 'owner.json')); if (!ow || ow.token === token) rmrf(d); },
        refresh() { const t = new Date(); try { fs.utimesSync(d, t, t); } catch (e) { /* released */ } },
      };
    }
    return null;
  }
  function locked(name) { return LOCK_RE.test(String(name)) && lockFresh(name); }
  function heldLocks() {
    let names = [];
    try { names = fs.readdirSync(L); } catch (e) { return []; }
    return names.filter(n => LOCK_RE.test(n) && lockFresh(n)).map(n => ({ name: n, owner: readJson(path.join(L, n, 'owner.json')) }));
  }

  // evict(cap, {keep}): least recently used first, never a locked entry nor one in keep, until the total is at most cap
  function evict(cap, oo) {
    return withIndex(() => {
      const idx = merged();
      const limit = cap > 0 ? cap : idx.cap;
      const keep = new Set((oo && oo.keep) || []);
      let total = Object.values(idx.entries).reduce((s, e) => s + (e.bytes || 0), 0);
      const removed = [];
      if (total <= limit) return removed;
      const order = Object.keys(idx.entries).sort((a, b) => {
        const x = idx.entries[a], y = idx.entries[b];
        return (x.used || 0) - (y.used || 0) || (x.made || 0) - (y.made || 0) || (a < b ? -1 : 1);
      });
      for (const k of order) {
        if (total <= limit) break;
        if (keep.has(k) || lockFresh(k)) continue;
        rmrf(entryDir(k));
        total -= idx.entries[k].bytes || 0;
        delete idx.entries[k];
        removed.push(k);
      }
      writeIndex(idx);
      return removed;
    });
  }

  function jobRunning(id) {
    const j = readJson(path.join(J, id, 'job.json'));
    return !!(j && (j.state === 'queued' || j.state === 'running') && KEY_RE.test(String(j.key)) && lockFresh(j.key));
  }

  // clear: 'all' removes e/, index.json and finished jobs/ (runs/ and running jobs kept); 'map' removes that map's entries
  function clear(scope) {
    const s = typeof scope === 'string' ? { scope } : (scope || {});
    if (s.scope !== 'all' && s.scope !== 'map') throw usage('clear scope must be all or map');
    if (s.scope === 'map' && (typeof s.map !== 'string' || !s.map)) throw usage('clear map needs a map key');
    for (const l of heldLocks()) {
      if (l.name === 'heavy') continue;
      const ow = l.owner;
      if (s.scope === 'all' || !ow || (ow.map === s.map && (!s.target || ow.target === s.target)))
        throw new mv.MvError('MV_BUSY', 'a job is running on ' + (ow && ow.what ? ow.what + ' ' + (ow.map || '') : 'the cache') + '; clear it when the job ends', { lock: l.name });
    }
    return withIndex(() => {
      const idx = merged();
      let removed = 0, bytes = 0;
      if (s.scope === 'all') {
        for (const e of Object.values(idx.entries)) { removed++; bytes += e.bytes || 0; }
        rmrf(E);
        rmrf(IDX);
        let ids = [];
        try { ids = fs.readdirSync(J); } catch (e) { /* none */ }
        for (const id of ids) if (!jobRunning(id)) rmrf(path.join(J, id));
        return { removed, bytes };
      }
      for (const [k, e] of Object.entries(idx.entries)) {
        if (e.map !== s.map || (s.target && e.target !== s.target)) continue;
        rmrf(entryDir(k));
        removed++; bytes += e.bytes || 0;
        delete idx.entries[k];
      }
      writeIndex(idx);
      return { removed, bytes };
    });
  }

  // pruneJobs(maxAgeMs): finished job folders not changed for that long (the runner calls it when it starts)
  function pruneJobs(maxAgeMs) {
    let ids = [];
    try { ids = fs.readdirSync(J); } catch (e) { return 0; }
    let n = 0;
    for (const id of ids) {
      let st;
      try { st = fs.statSync(path.join(J, id)); } catch (e) { continue; }
      if (now() - st.mtimeMs > maxAgeMs && !jobRunning(id)) { rmrf(path.join(J, id)); n++; }
    }
    return n;
  }

  function stats() {
    const idx = merged();
    let jobs = 0;
    try { jobs = fs.readdirSync(J).length; } catch (e) { /* none */ }
    return { v: 1, root: R, bytes: Object.values(idx.entries).reduce((s, e) => s + (e.bytes || 0), 0), cap: idx.cap, entries: Object.keys(idx.entries).length, jobs };
  }

  return { root: R, entryDir, jobDir, readIndex, merged, writeIndex, withIndex, readManifest, fresh: m => fresh(m), open, commit, use, size, evict, clear,
    lock, locked, heldLocks, pruneJobs, stats, now };
}

// module-level: the default root, read on every call (ARSENAL_CACHE may change in a test)
const here = () => at(root());
module.exports = {
  CAP, STALE_MS, KEY_RE, root, at, canon, keyLines, keyOf, sortedJson, partVersion, needParts, needVersions, entryKey, listFiles,
  open: (k, o) => here().open(k, o),
  commit: (k, d, m) => here().commit(k, d, m),
  use: k => here().use(k),
  size: () => here().size(),
  evict: (cap, o) => here().evict(cap, o),
  clear: s => here().clear(s),
  fresh: m => here().fresh(m),
  lock: (n, o) => here().lock(n, o),
  locked: n => here().locked(n),
  stats: () => here().stats(),
};
