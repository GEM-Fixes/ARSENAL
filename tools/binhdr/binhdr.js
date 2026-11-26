#!/usr/bin/env node
// binhdr: binary/format header validator over the mounted resource index (lib/vfs). rows FMT-01..10,12..17 (FMT-16: WARN_PLY_INLINE_TEX_MISSING)
//   node binhdr.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--all] [--ext ply,anm,...] [--strict] [--time] [--folder DIR] [--sample N] [-q] [--summary] [--format text|json|sarif|csv|html] [-o FILE] [--rc FILE] [--no-rc] | --help
//   binhdr.js --paks <root> [--ext ..] [--sample N] ...: walk every *.pak under root (lib/pakset, no vfs/mods; e.g. GoH resource/). rel = pak entry name.
//     cross-file checks (def->mdl volumes, mdl->anm bones, texture ext shadow) use a name map of ALL pak entries (later pak wins); only checked files are sampled
//     map.net (up to ~90 MB each in GoH) is skipped in --paks mode unless --ext is given
//   --sample N: per extension, N files spread evenly over the file list (deterministic)
//   --strict: engine-tolerated defects (SOFT) count as findings in mod files too (default: info everywhere)
//   gameDir with --mods: checks only files provided by the listed mods (--all: every mounted file). no --mods: vanilla.
//   --folder DIR: overlay DIR/resource (loose files, layer 'folder') on the game vfs (gameDir optional: '-' = no game); only those files are checked (build stage)
//   --restore-points: accepted, no effect: binhdr reads only what the game mounts (resource/, resource.pak, localization*, N.pat), never <mod>/.arsenal-undo
//   reading: each mounted mod folder is listed once, async (list.js listMounted -> lib/vfs opts.listings); files are read
//     ARSENAL_READ_WINDOW (default 32) at a time ahead of the checks, which run in file order (same findings, same order);
//     .dds reads its 128-byte header only, .wav its chunk headers only, .tga/.bmp/.jpg/.png/.mp3 nothing
//   gameDir may also be a fixture dir (no mods). paks are read in place, nothing extracted.
//   header cache (hdrcache.js): each file's check result + header facts kept by path + size + mtime (pak entry: pak + offset +
//     crc), so a repeat check reads only changed binaries; pak entries read in offset order, 32 MB groups; the reach set's
//     .mdl/.def read once (facts from the check pass, buffers handed on). Off: --no-hdr-cache / ARSENAL_HDR_CACHE=0 (as before)
//   --exe as64|mowas_2|mowas2|goh: the game (vfs exe; no --exe: as before, as64.exe first, a GoH install found by its exe). The AS2 install
//     holds AS64 and MoW:AS2: --exe mowas_2 mounts it without as64/core. --exe goh with no gameDir: the GoH install (lib/games).
//     GoH forms (--exe goh or a GoH install; --paks: also a paks root at or under a GoH install, e.g. <GoH>/resource; --folder: --exe goh): map.net cell 5 is valid (GHMAP-06),
//     the version byte is ignored and every map.net is read as version 2 (GHMAP-16)
// Author: Imperator_Aug (ARSENAL, ia-164f69c6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
// header cache mode: as many file reads in flight as the read window (libuv runs 4 at a time by default), set before the first
if (!process.env.UV_THREADPOOL_SIZE && !process.argv.includes('--no-hdr-cache') && process.env.ARSENAL_HDR_CACHE !== '0')
  process.env.UV_THREADPOOL_SIZE = String(Math.min(64, Math.max(4, parseInt(process.env.ARSENAL_READ_WINDOW, 10) || 32)));
const path = require('path'), L = require('./list');
const H = require('./hdrcache');
const { build, listed, readRec: vfsRead, readRecsOrdered, closeRecs } = require('../lib/vfs'), pakset = require('../lib/pakset'), names = require('../lib/names'), { createReport } = require('../lib/report');
const { checkPly } = require('./ply'), M = require('./misc'), D = require('./mdl');

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
const args = process.argv.slice(2), pos = [], o = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mods') o.mods = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--all') o.all = true;
  else if (a === '--ext') o.ext = new Set((args[++i] || '').split(',').map(s => '.' + s.replace(/^\./, '').toLowerCase()));
  else if (a === '--time') o.time = true;
  else if (a === '--strict') o.strict = true;
  else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true;
  else if (a === '--summary') o.summary = true;
  else if (a === '--sample') o.sample = Math.max(1, parseInt(args[++i], 10) || 0);
  else if (a === '--paks') o.paks = args[++i];
  else if (a === '--folder') o.folder = args[++i];
  else if (a === '--restore-points') o.restorePoints = true;   // accepted (doctor/check pass it): binhdr reads only mounted roots, where no restore point lives
  else if (a === '--no-hdr-cache') o.noHdrCache = true;
  else if (a === '--exe') { const x = args[++i], g = require('../lib/games').get(x); if (!g || /\.exe$/i.test(String(x))) { console.error('binhdr: --exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
  else pos.push(a);
}
// --exe goh with no gameDir (and no --paks / --folder only run): the GoH install (lib/games install)
if (!pos.length && !o.paks && o.exe === 'goh' && !o.folder) { const d = require('../lib/games').install('goh').dir; if (d) pos.push(d); }
if (!pos.length && !o.paks && !o.folder) { if (o.exe === 'goh') console.error('binhdr: no GoH install found (set GOH_GAME or give <gameDir>)'); console.error('usage: binhdr.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--all] [--ext ply,anm,..] [--strict] [--time] [-q] [--summary] [--sample N] | binhdr.js --paks <root> ...'); process.exit(2); }

main().catch(err => { console.error('binhdr: ' + (err && err.stack || err)); process.exit(1); });
async function main() {
const t0 = Date.now();
let ps = null, readRec = vfsRead, v, listMs = 0;
const hcOn = !o.noHdrCache && H.enabled(args, process.env), mtimes = new Map();   // low(abs path) -> mtimeMs, for the header cache
if (o.paks) {
  ps = pakset.open(o.paks, null);
  for (const er of ps.errors) console.error('pak skipped: ' + er.file + ': ' + er.message);
  const files = new Map();
  for (const e of ps.entries) files.set(e.name, e);
  v = { files, mods: [], ms: Date.now() - t0 };
  readRec = pakset.read;
} else {
  if (pos[0] && pos[0] !== '-') {
    // each mounted mod folder listed once, async, mounted roots only (no stat per file in vfs)
    const bo = { gameDir: pos[0], mods: o.mods, exe: o.exe };
    const dirs = o.mods && o.mods.length ? listed(bo) : [];
    const tl = Date.now();
    bo.listings = await Promise.all(dirs.map(d => L.listMounted(d.dir).catch(() => null))).then(a => a.filter(Boolean));
    listMs = Date.now() - tl;
    if (hcOn) for (const T of bo.listings) { const b = H.low(T.dir) + '/'; for (const r of T.files) mtimes.set(b + (process.platform === 'win32' ? r[0].toLowerCase() : r[0]), r[2]); }
    v = build(bo);
  } else v = { files: new Map(), mods: [], ms: 0 };
  if (o.folder) {
    const fs = require('fs'), path = require('path'), root = path.resolve(o.folder), res = path.join(root, 'resource');
    if (fs.existsSync(res)) {
      const croot = root.replace(/\\/g, '/'), rname = path.relative(root, res).replace(/\\/g, '/');
      for (const [r, st] of await L.walkLoose(res)) {
        if (st instanceof Error) throw st;
        if (hcOn) mtimes.set(H.low(path.join(res, r)), st.mtimeMs);
        v.files.set('resource/' + r.split('/').map(s => names.normalize(s)).join('/'), { source: 'loose', container: croot, entry: rname + '/' + r, layer: 'folder', size: st.size });
      }
    }
    o.folderLayer = true;
  }
}
// the game whose file forms apply: --exe, else the vfs exe (a GoH install is found by its exe); --paks: --exe, else a GoH install found
// by its exe at the paks root or one folder up (<GoH>/resource); '-': only --exe
const pakGoh = () => { const path = require('path'), G = require('../lib/games'), r = path.resolve(o.paks); return [r, path.dirname(r)].some(d => G.detect(d) === 'goh') ? 'goh' : null; };
const game = o.exe || v.exe || (o.paks ? pakGoh() : null);
const base = createReport();
// findings the engine tolerates (warns/falls back/drops silently) are info: on vanilla-layer files always (bar is
// "vanilla 0 findings"), on mod files unless --strict (robz: ~950 of 958 findings were these)
const SOFT = new Set(['DEF_VOLUME_NO_SHAPE', 'MDL_VOLUME_BONE', 'DDS_FORMAT', 'DDS_VOLUME', 'TEX_EXT_SHADOW', 'WARN_EBM_MIPMAP', 'WARN_SOUND_MP3', 'WARN_ANM_BONE_MISSING']);
const soft = { add: (rel, line, code, msg) => (SOFT.has(code) ? base.info : base.add).call(base, rel, line, code, msg), info: (...a) => base.info(...a) };
const isBase = l => !l || l === 'base' || /^patch \d+$/.test(l);
let rep = base;
const modIds = new Set(v.mods);
const layerMod = l => l.replace(/ patch \d+$/, '');
const selected = rec => o.folderLayer ? rec.layer === 'folder' : o.all || !modIds.size || modIds.has(layerMod(rec.layer));
const extOf = k => { const i = k.lastIndexOf('.'); return i > k.lastIndexOf('/') ? k.slice(i) : ''; };
const wanted = e => !o.ext || o.ext.has(e);
const has = k => v.files.has(k);
const lcs = s => s.toLowerCase();
const sink = { add() {}, info() {} };

// header cache: cur = what the check running now depends on (other files' bytes, names asked for); null when the cache is off
let HC = null, cur = null;
const dep = k => { if (cur) cur.deps.set(k, HC.sigOf(k)); };
const hasRec = k => { const r = has(k); if (cur) cur.has.set(k, r ? 1 : 0); return r; };
const depRead = rec => { try { return readRec(rec); } catch (x) { if (cur) cur.bad = true; throw x; } };
const mdlCache = new Map(), anmCache = new Map();
function mdlInfo(key) {
  dep(key);
  if (mdlCache.has(key)) return mdlCache.get(key);
  const rec = v.files.get(key);
  let info = null;
  if (rec) info = D.scanMdl({ buf: depRead(rec), rep: sink, rel: key });
  mdlCache.set(key, info);
  return info;
}
function anmInfo(key) {
  dep(key);
  if (anmCache.has(key)) return anmCache.get(key);
  const rec = v.files.get(key);
  const info = rec ? M.parseAnm({ buf: depRead(rec), rep: sink, rel: key }) : null;
  anmCache.set(key, info);
  return info;
}

// FMT-03 severity by reachability: a missing .mtl crashes on load, but only when something loads the mesh.
// reached = an enabled (selected) .def/.mdl names the .ply (def {Extension} -> .mdl -> {VolumeView}/{View}, paths relative to the file, FMT-22)
// built once, on the first .ply with a missing .mtl (ensureReach): every selected .mdl/.def read WINDOW at a time, then the .mdl
// keys the .def files name that were not among them (any layer); the set is the union, so read order does not matter
let reachSet = null;
// pre: .mdl/.def bytes the reach build read for files the check pass has not reached yet (handed on, read once); pakPre: pak
// entries read in offset order a group ahead (header cache on only; both empty otherwise)
const pre = new Map(), pakPre = new Map(), PRE_CAP = 67108864;
let preBytes = 0;
const preTake = rec => { const b = pre.get(rec); if (b !== undefined) { pre.delete(rec); preBytes -= b.length; } return b; };
const pakTake = rec => { const b = pakPre.get(rec); if (b !== undefined) { pakPre.delete(rec); return b; } return readRec(rec); };
const readAsync = rec => { const b = preTake(rec); if (b) return Promise.resolve(b); return rec.source === 'loose' ? L.readWhole(path.join(rec.container, rec.entry)) : Promise.resolve().then(() => pakTake(rec)); };
const runFacts = new Map(), todo = new Set();   // key -> plyRefs / defMdls of this run's check pass (null: threw); recs not read yet
async function ensureReach() {
  if (HC) return ensureReachHC();
  if (reachSet) return;
  const set = reachSet = new Set(), seen = new Set(), more = [];   // a read error leaves the set as far as it got (as before)
  const addMdl = (mkey, buf) => { const dir = mkey.slice(0, mkey.lastIndexOf('/')); for (const p of D.plyRefs(buf)) set.add(names.resolve(p, dir).key); };
  const first = [];
  for (const [k, r] of v.files) { if (!selected(r)) continue; const e = extOf(k); if (e === '.mdl') { seen.add(k); first.push([k, r]); } else if (e === '.def') first.push([k, r]); }
  for await (const [[k], buf] of L.ahead(first, ([, r]) => readAsync(r))) {
    if (buf instanceof Error) throw buf;
    if (extOf(k) === '.mdl') addMdl(k, buf);
    else { const dir = k.slice(0, k.lastIndexOf('/')); for (const m of D.defMdls(buf)) more.push(names.resolve(m, dir).key); }
  }
  const rest = [];
  for (const mk of more) { if (seen.has(mk)) continue; seen.add(mk); const r = v.files.get(mk); if (r) rest.push([mk, r]); }
  for await (const [[k], buf] of L.ahead(rest, ([, r]) => readAsync(r))) { if (buf instanceof Error) throw buf; addMdl(k, buf); }
}
// the same set, same order: each file's names from this run's check pass or the cache when its bytes are unchanged, else read
// (and the bytes kept for the check pass when it has not read that file yet)
async function ensureReachHC() {
  if (reachSet) return;
  const set = reachSet = new Set(), seen = new Set(), more = [];
  const factOf = (k, f) => runFacts.get(k) || HC.fact(k, f);
  const walk = async (items, fOf) => {
    const need = items.filter(([k]) => factOf(k, fOf(k)) === undefined), it = L.ahead(need, ([, r]) => readAsync(r));
    for (const [k, r] of items) {
      const f = fOf(k);
      let names_ = factOf(k, f);
      if (names_ === undefined) {
        const { value: [, buf] } = await it.next();
        if (buf instanceof Error) throw buf;
        if (todo.has(r) && preBytes + buf.length <= PRE_CAP) { pre.set(r, buf); preBytes += buf.length; }
        names_ = f === 'r' ? D.plyRefs(buf) : D.defMdls(buf);
        HC.putFact(k, f, names_);
      }
      const dir = k.slice(0, k.lastIndexOf('/'));
      if (f === 'r') for (const p of names_) set.add(names.resolve(p, dir).key);
      else for (const m of names_) more.push(names.resolve(m, dir).key);
    }
  };
  const first = [];
  for (const [k, r] of v.files) { if (!selected(r)) continue; const e = extOf(k); if (e === '.mdl') { seen.add(k); first.push([k, r]); } else if (e === '.def') first.push([k, r]); }
  await walk(first, k => extOf(k) === '.mdl' ? 'r' : 'm');
  const rest = [];
  for (const mk of more) { if (seen.has(mk)) continue; seen.add(mk); const r = v.files.get(mk); if (r) rest.push([mk, r]); }
  await walk(rest, () => 'r');
}
const reached = plyKey => reachSet.has(plyKey);

const TEX = ['.dds', '.tga', '.bmp', '.jpg', '.png'];
const counts = {};
const stat = (e, ms) => { const c = counts[e] || (counts[e] = { n: 0, ms: 0 }); c.n++; c.ms += ms; };

let work = [...v.files].filter(([k, r]) => selected(r) && wanted(extOf(k)));
if (o.sample) {
  const keep = new Set(pakset.sample(work.map(([k]) => ({ name: k })), o.sample).map(x => x.name));
  work = work.filter(([k]) => keep.has(k));
}
// what each file needs read: whole file, the 128-byte DDS header, the WAV chunk headers, or nothing (same cases as the checks below)
const SPARSE_MIN = process.env.BINHDR_SPARSE_MIN !== undefined ? +process.env.BINHDR_SPARSE_MIN : 262144;   // tests: 0 = every .ply/map.net; smaller files: one whole read costs less than the extra seeks of a range walk on a hard disk
const WHOLE = new Set(['.ply', '.anm', '.vol', '.ebm', '.tex', '.mdl', '.def']);
const needOf = (key, e) => WHOLE.has(e) || (e === '.net' && /(^|\/)map\.net$/.test(key) && (!o.paks || o.ext)) ? 'whole' : e === '.dds' ? 'dds' : e === '.wav' ? 'wav' : null;
// header cache (hdrcache.js): a file whose bytes and dependencies are unchanged replays its stored check record and is not read
const hitOf = new Map(), pakGrp = new Map(), groups = [], GROUP = 33554432;
if (hcOn) {
  try {
    const head = { game: game || null, net: !o.paks || !!o.ext };
    const scope = { mods: o.mods || null, all: !!o.all, folder: o.folder ? path.resolve(o.folder) : null, paks: o.paks ? path.resolve(o.paks) : null, exe: o.exe || null };
    HC = H.open({ file: H.fileFor(scope), code: H.codeHash(module), head, files: v.files, mtimes, t0 });
    for (const [k, r] of work) {
      if (!needOf(k, extOf(k))) continue;
      const h = HC.hit(k);
      if (h) hitOf.set(k, h);
      else {
        if (extOf(k) === '.mdl' || extOf(k) === '.def') todo.add(r);
        if (r.source !== 'loose' && r.ent) {   // pak entries to read: groups of <= 32 MB, each read in offset order when its first entry is due
          let g = groups[groups.length - 1];
          if (!g || (g.bytes + (r.size || 0) > GROUP && g.recs.length)) groups.push(g = { bytes: 0, recs: [] });
          g.recs.push(r); g.bytes += r.size || 0; pakGrp.set(r, groups.length - 1);
        }
      }
    }
  } catch (x) { HC = null; hitOf.clear(); todo.clear(); pakGrp.clear(); groups.length = 0; }   // the old way
}
const pakFetch = rec => {
  const gi = pakGrp.get(rec), g = gi === undefined ? null : groups[gi];
  if (g) {
    groups[gi] = null;
    try { for (const _ of readRecsOrdered(g.recs.map(r => ({ r, rec: r.source === 'pak' ? r : { source: 'pak', container: r.pak, ent: r.ent } })), (it, buf) => pakPre.set(it.r, buf), { maxBytes: GROUP * 2 })) void _; } catch (x) { /* the rest read one by one */ }
  }
  return pakTake(rec);
};
const readFor = ([key, rec]) => {
  const n = needOf(key, extOf(key));
  if (!n || hitOf.has(key)) return null;
  todo.delete(rec);
  if (extOf(key) === '.def') return readDef(key, rec);
  const b = preTake(rec);
  if (b) return b;
  if (rec.source !== 'loose') return HC ? pakFetch(rec) : readRec(rec);   // pak entry: inflated whole, in place
  const p = path.join(rec.container, rec.entry), e = extOf(key);
  // big .ply / map.net: only the ranges the check reads (VERT data and heightmap cells are skipped, never looked at)
  if (n === 'whole' && rec.size > SPARSE_MIN && (e === '.ply' || e === '.net'))
    return L.sparse(p, e === '.ply' ? (buf, mkReader) => checkPly({ key, buf, mkReader, rep: sink, rel: key, has })
      : (buf, mkReader) => M.checkNet({ buf, mkReader, rep: sink, rel: key, game }));
  return n === 'dds' ? L.readHead(p, 128) : n === 'wav' ? L.wavHead(p) : L.readWhole(p);
};
const isSparse = g => g && !Buffer.isBuffer(g) && g.mkReader;
// a .def with the .mdl it compares with read ahead too (it sits before the .mdl in name order: one read at a time otherwise)
async function readDef(key, rec) {
  const own = preTake(rec), buf = own || (HC && rec.source !== 'loose' ? pakFetch(rec) : await readAsync(rec)), found = D.defMdlKey(buf, key);
  let dep;
  const mr = found && !mdlCache.has(found.mkey) && v.files.get(found.mkey);
  if (mr) { try { dep = await readAsync(mr); } catch (x) { dep = undefined; } }   // a failing read fails again in mdlInfo, as before
  return { buf, found, dep };
}
// one file's checks, report calls recorded in order ([['add'|'info', args]]) and what it threw; with the cache on, cur records
// the other files and names they used
function compute(key, e, got) {
  const calls = [], R = { add: (...a) => calls.push(['add', a]), info: (...a) => calls.push(['info', a]) };
  const c = cur = HC ? { deps: new Map(), has: new Map(), bad: false } : null;
  let thrown = null, tree;
  try {
    if (got instanceof Error) { if (c) c.bad = true; throw got; }
    if (e === '.ply') checkPly({ key, buf: isSparse(got) ? got.buf : got, mkReader: isSparse(got) ? got.mkReader : undefined, rep: R, rel: key, has: hasRec });
    else if (e === '.anm') {
      const buf = got, a = M.parseAnm({ buf, rep: R, rel: key });
      anmCache.set(key, a);
    }
    else if (e === '.vol') M.checkVol({ buf: got, rep: R, rel: key });
    else if (e === '.dds') M.checkDds({ buf: got, rep: R, rel: key });
    else if (e === '.ebm' || e === '.tex') M.checkEbm({ buf: got, rep: R, rel: key });
    else if (e === '.net' && /(^|\/)map\.net$/.test(key) && (!o.paks || o.ext)) M.checkNet(isSparse(got) ? { buf: got.buf, mkReader: got.mkReader, rep: R, rel: key, game } : { buf: got, rep: R, rel: key, game });
    else if (e === '.wav') M.checkWav(Buffer.isBuffer(got) ? { buf: got, rep: R, rel: key } : { len: got.len, at: got.at, rep: R, rel: key });
    else if (e === '.mp3' && /^resource\/sound\//.test(key)) R.add(key, 0, 'WARN_SOUND_MP3', '.mp3 inside a sound folder: only *.wav are registered as folder samples (ignored) [T]');
    else if (e === '.mdl') {
      const ctx = { buf: got, rep: R, rel: key };
      let info;
      try { info = D.scanMdl(ctx); } finally { tree = ctx.tree; }
      mdlCache.set(key, info);
      if (info) {
        D.checkMdlVolumes(ctx, info);
        crossAnm(key, info, R);
      }
    }
    else if (e === '.def') {
      if (got.found) dep(got.found.mkey);
      if (got.dep && got.found && !mdlCache.has(got.found.mkey)) mdlCache.set(got.found.mkey, D.scanMdl({ buf: got.dep, rep: sink, rel: got.found.mkey }));
      D.checkDef({ buf: got.buf, found: got.found, rep: R, rel: key, key }, mdlInfo);
    }
  } catch (x) { thrown = x; }
  cur = null;
  return { calls, thrown, c, tree };
}
// the reach facts of a .mdl/.def the check pass read (cache on): ensureReach needs no second read of it
// (.mdl: from the tree its check parsed; a parse that threw leaves it to ensureReach, which then throws the same)
function keepFacts(key, e, got, tree) {
  const buf = e === '.mdl' ? got : got && got.buf, f = e === '.mdl' ? 'r' : 'm';
  if (!Buffer.isBuffer(buf) || (f === 'r' && tree === undefined)) return;
  let names_ = null;
  try { names_ = f === 'r' ? D.plyRefsOf(tree) : D.defMdls(buf); } catch (x) { names_ = null; }
  runFacts.set(key, names_);
  if (names_) HC.putFact(key, f, names_);
}
const weight = ([key, rec]) => { const n = needOf(key, extOf(key)); return hitOf.has(key) ? 0 : n === 'whole' || (n && rec.source !== 'loose') ? rec.size || 0 : 0; };
for await (const [[key, rec], got] of L.ahead(work, readFor, L.WINDOW, { weight })) {
  rep = isBase(rec.layer) || !o.strict ? soft : base;
  const e = extOf(key);
  if (!wanted(e)) continue;
  const t = Date.now();
  try {
    const h = hitOf.get(key);
    let res;
    if (h) res = { calls: h.c, thrown: h.x !== undefined ? new Error(h.x) : null };
    else {
      res = compute(key, e, got);
      if (HC && needOf(key, e)) {
        try { HC.putCheck(key, { calls: res.calls, thrown: res.thrown, deps: res.c.deps, has: res.c.has, bad: res.c.bad }); if (e === '.mdl' || e === '.def') keepFacts(key, e, got, res.tree); } catch (x) { /* not stored */ }
      }
    }
    if (e === '.ply') {
      const prep = { add: (rel, line, code, msg) => code !== 'PLY_MTL_MISSING' ? rep.add(rel, line, code, msg)
        : (!isBase(rec.layer) && (o.strict || reached(key)) ? base.add : base.info).call(base, rel, line, code, msg + (reached(key) ? ' (reached by an enabled .def/.mdl)' : ' (no enabled .def/.mdl loads it)')), info: (...a) => rep.info(...a) };
      // calls kept in order and replayed once the reach set is known (it is read only when a .mtl is missing)
      let calls = res.calls, thrown = res.thrown;
      const miss = calls.some(([k, a]) => k === 'add' && a[2] === 'PLY_MTL_MISSING');
      if (miss && !reachSet) { try { await ensureReach(); } catch (x) { thrown = thrown || x; calls = []; } }
      for (const [k, a] of calls) prep[k](...a);
      if (thrown) throw thrown;
    } else {
      for (const [k, a] of res.calls) rep[k](...a);
      if (res.thrown) throw res.thrown;
    }
    if (TEX.includes(e)) texOrder(key, e);
  } catch (err) {
    rep.add(key, 0, 'CRASH', err.message);
  }
  stat(e, Date.now() - t);
}
if (HC) HC.save();

// FMT-09: .anm bone absent from the owning .mdl skeleton -> track skipped
function crossAnm(mkey, info, rep) {
  if (info.dotted || !info.bones.size) return;
  const dir = mkey.slice(0, mkey.lastIndexOf('/'));
  const done = new Set();
  for (const s of info.seqs) {
    const f = s.file || (s.name + '.anm');
    const akey = names.resolve(f, dir).key;
    if (done.has(akey)) continue;
    done.add(akey);
    const a = anmInfo(akey);
    if (!a || !a.ok) continue;
    const miss = [...new Set(a.bones.map(b => b.replace(/_lod\d+$/i, '')).filter(b => !info.bones.has(lcs(b))))];
    const all = new Set(a.bones.map(b => b.replace(/_lodd+$/i, '')));
    if (miss.length) (miss.length === all.size ? rep.add : rep.info).call(rep, mkey, s.line, 'WARN_ANM_BONE_MISSING', `${akey}: bone${miss.length > 1 ? 's' : ''} ${miss.slice(0, 4).join(', ')}${miss.length > 4 ? ` (+${miss.length - 4})` : ''} not in this skeleton: track skipped silently`);
  }
}

// FMT-04: several image formats for one texture name; the LAST in .dds .tga .bmp .jpg .png wins
function texOrder(key, e) {
  const stem = key.slice(0, key.length - e.length);
  const idx = TEX.indexOf(e);
  const later = TEX.slice(idx + 1).filter(x => has(stem + x));
  if (later.length) rep.add(key, 0, 'TEX_EXT_SHADOW', `${stem + later[later.length - 1]} also exists and wins (order .dds .tga .bmp .jpg .png, last wins): this ${e} is never used`);
}

if (o.time) {
  for (const [e, c] of Object.entries(counts).sort((a, b) => b[1].ms - a[1].ms)) base.info('.', 0, 'STATS', `${e}: ${c.n} files ${c.ms} ms`);
  base.info('.', 0, 'STATS', `total ${Date.now() - t0} ms (list ${listMs} ms, index ${v.ms} ms), mods: ${v.mods.join(', ') || 'none'}`);
  base.info('.', 0, 'STATS', HC ? `header cache: ${hitOf.size} replayed, ${work.filter(([k]) => needOf(k, extOf(k)) && !hitOf.has(k)).length} read, ${HC.size()} stored` : 'header cache: off');
}
closeRecs();
if (ps) ps.close();
// no-data notice (COV-LINT: was silent on an empty folder) + loose-folder hint (`binhdr <mod dir> --all` read nothing, said nothing)
if (!work.length) {
  const fs = require('fs'), path = require('path'), d = pos[0] && pos[0] !== '-' ? path.resolve(pos[0]) : null;
  const notGame = d && !fs.existsSync(path.join(d, 'as64.exe')) && !fs.existsSync(path.join(d, 'mowas_2.exe')) && !fs.existsSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe')) && !fs.existsSync(path.join(d, 'resource', 'gamelogic.pak'));
  console.error(`binhdr: 0 files read${o.folder ? ' (no resource/ files in the --folder dir)' : ''}` +
    (!o.folder && !o.paks && notGame ? `\nbinhdr: ${pos[0]} does not look like a game dir; for a loose mod folder use: binhdr - --folder ${pos[0]}  (or <gameDir> --mods <name> for an installed mod)` : ''));
}
rcPrint(base, o, pos[0] || o.paks || o.folder, 'binhdr', { byCode: true, showInfo: !o.q, summary: o.summary });
}
