// docs ext routes: reader and search over the documentation sets. The reader's documents: the start page (tools/START-HERE.md),
// the guide book and the internal book when present. The maintainers' notes (root pages, modweb, limits, internal notes when present, gohweb, refmods, tools index, plan) are
// sets marked notes: the page shows them only with Advanced on, and a search covers them only with notes=1.
// Read-only; never writes a file. The docs are read at run time: from the source tree (live webs), or from a docgen edition
// next to the exe (docs/internal, docs/public, docs). Absent = a plain "not here" answer with the places looked at.
// Only .md files found by the walk are served: no path outside the root, no links followed, never listed.
// The release zip ships guide/ beside the exe (tools/dist/zip.js): the exe's own folder is a root when its guide/ holds a book
// chapter (README.md, p*, numbered, r*), so the guide works there without a docs folder. Books (G9): /book (outline in reading order),
// /booksearch (hits grouped by part), POST /pdf opens guide/dist/AS2-Modding-Guide-<ver>.pdf (newest; {set:'engine'} the engine's)
// in the user's PDF reader. Whole documents (WHOLE below): GET /whole serves one self-contained HTML file for a sandboxed frame.
// Test hook: ARSENAL_DOCS or AS2_DOCS_ROOT (the folder that holds guide/,, limits/ ...); candidates below is the one locator.
// Author: Imperator_Aug (ARSENAL, ia-850316dd)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });

// id, folder under the root ('' = md files of the root itself), optional path filter.
// The reader's documents come first: the start page, the two books. notes: true = the maintainers' working notes (check marks,
// test results, work records). The page lists those only with its Advanced switch on, and a search covers them only when asked (notes=1).
// A file belongs to the first set that lists it (tools/START-HERE.md is the start page, not part of the tool index set).
// part: the Docs part the page shows the set under (the shell's third row, docs/<part>): arsenal (about the toolkit), modding, engine,
// project (maintainer notes only, Advanced), history (its own sub-tab, Historical Sources).
const SETS = [
  { id: 'here', part: 'arsenal', dir: 'tools', file: ['tools/START-HERE.md', 'START-HERE.md'] },   // source tree, or the release zip's top folder
  { id: 'guide', part: 'modding', dir: 'guide' },             // book chapters only: CHANGELOG, PLAN, build script, dist, i18n are not in it
  // the engine technical document: listed when the folder exists (source tree; a release once the user copies in the techdoc folder of
  // the separate download ARSENAL-engine-docs-public-<ver>.zip; the page names that download in a public edition while it is absent)
  { id: 'engine', part: 'engine', dir: 'techdoc/engine' },
  // historical sources: pages (README, then numbered; source tree only, a release ships none), then the generated
  // Source index (listed when its folder exists, even with no pages)
  { id: 'history', part: 'history', dir: 'techdoc/history', always: true },
  { id: 'start', part: 'project', dir: '', notes: true },
  { id: 'modweb', part: 'modding', dir: 'modweb', notes: true },
  { id: 'limits', part: 'engine', dir: 'limits', notes: true },
  { id: 'codemap', part: 'engine', dir: 'codemap', notes: true },
  // Gates of Hell notes (game parity): the GoH engine as differences from as64, rows GH<AREA>-NN, blocks
  // (batch scratch) and game (the local function index) are never committed and never read here
  { id: 'gohweb', part: 'engine', dir: 'gohweb', skip: /^gohweb\/(?:stage|codemap)(?:\/|$)/, notes: true },
  { id: 'refmods', part: 'modding', dir: 'refmods', notes: true },
  // flat: only these folders are read (no walk of the whole tools tree, about 17,000 entries: it made every index rebuild take seconds)
  { id: 'tools', part: 'arsenal', dir: 'tools', only: /^tools\/(?:[^/]+|index\/[^/]+)\.md$/, flat: ['tools', 'tools/index'], notes: true },
  { id: 'plan', part: 'project', dir: 'plan', skip: /^plan\/private(?:\/|$)/, notes: true },
];
// the parts in the shell's order (docs/<part> in groups.js); project = Advanced only (the page falls back to modding without it)
const PARTS = ['arsenal', 'modding', 'engine', 'project', 'history'];
// BOOKS (G9): a set read as one document. Reading order comes from the folder listing, never from a fixed list of names:
// each part is a name pattern, files inside a part go by their number (or letter), then by name. Files matching no part are not in the book.
const BOOKS = {
  guide: { dir: 'guide', parts: [['intro', /^README\.md$/i], ['process', /^p(\d+)-.*\.md$/i], ['detail', /^(\d+)-.*\.md$/], ['ref', /^r(\d+)-.*\.md$/i]] },
  engine: { dir: 'techdoc/engine', parts: [['intro', /^README\.md$/i], ['main', /^(\d+)-.*\.md$/], ['appendix', /^([A-Z])-.*\.md$/]] },
  // the last part, 'index', is the generated Source index (SRCIDX): not a file, drawn by the page from the guide index data
  history: { dir: 'techdoc/history', parts: [['intro', /^README\.md$/i], ['main', /^(\d+)-.*\.md$/]], extra: 'index' },
};
const SRCIDX = '@history/source-index';
// a docs root holds one of these, or a guide folder with at least one book chapter (the release zip ships guide/ beside the exe)
const MARK = ['modweb/INDEX.md', 'limits/INDEX.md', 'GUIDE.md'];
const PDFRX = /^AS2-Modding-Guide-v?(\d+(?:\.\d+)*)[^/\\]*\.pdf$/i;
const MAX_FILE = 600 * 1024, MAX_ROWS = 200, MAX_KIDS = 3000, TTL = 30000;
// whole documents (one self-contained HTML file each, read in a sandboxed frame; pdf beside it). Contract shared with the makers
// (guide/build-pdf.js, tools/wholedoc) and the editions: the place under the docs root, the name with its version, the first bytes.
// dir/rx: newest by version number (2.0 after 1.12 after 1.2); file: one fixed name (version from its arsenal-whole meta).
// make: the command that makes the file, offered only where its script is under the root (a source tree). part: the Docs part whose
// whole-document buttons hold it (the atlas and the guide under Modding, the engine document under Engine).
const WHOLE = {
  atlas: { part: 'modding', file: 'techdoc/doctrine/atlas.html', make: ['tools/wholedoc/atlas.js', 'node tools/wholedoc/atlas.js <pack>/atlas.html'] },
  guide: { part: 'modding', dir: 'guide/dist', rx: /^AS2-Modding-Guide-v(\d+(?:\.\d+)*)\.html$/i, pdf: PDFRX, make: ['guide/build-pdf.js', 'node guide/build-pdf.js --html-only'] },
  engine: { part: 'engine', dir: 'techdoc/dist', rx: /^AS64-Engine-Technical-Document-v(\d+(?:\.\d+)*)\.html$/i, pdf: /^AS64-Engine-Technical-Document-v?(\d+(?:\.\d+)*)[^/\\]*\.pdf$/i, make: ['guide/build-pdf.js', 'node guide/build-pdf.js --book engine --html-only'] },
};
const WHOLE_HEAD = '<!doctype html><html lang="en">', WHOLE_MAX = 12 * 1024 * 1024;

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const home = () => { try { return os.homedir(); } catch (e) { return ''; } };
// show the user's home as %USERPROFILE% so a copied text carries no user name
function mask(s) {
  const h = home();
  if (!h || h.length < 4) return String(s);
  return String(s).split(new RegExp(h.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'), 'gi')).join('%USERPROFILE%');
}
// candidates(): THE locator of the document root, for every set (start page, guide, engine, history, the notes). In order:
//   1. ARSENAL_DOCS (or the older AS2_DOCS_ROOT): that folder only (tests, a user who keeps the documents elsewhere)
//   2. the package: the folder of the running exe (ARSENAL.exe / ARSENAL-gui.exe) and its docs/ folders. Inside the exe this file's
//      own __dirname is the virtual <exe dir>/__as2_sea__/tools/... tree, which holds no documents on disk, so the exe's folder comes first
//   3. an exe built into the source tree (tools/dist/out/ARSENAL-gui.exe): the nearest parent of the exe's folder that is a source tree
//   4. the source tree this file sits in (node tools/gui/gui.js), then the working folder and its docs/ folders
// Every page is read under the root found; nothing outside it (resolve() below refuses '..' past the root and serves listed files only).
let _exeDir = null;   // test seam: {dir, sea}, the packaged case without building an exe
function exeInfo() {
  if (_exeDir) return _exeDir;
  let dir = '', sea = false;
  try { dir = path.dirname(process.execPath); } catch (e) { /* none */ }
  try { sea = require('node:sea').isSea(); } catch (e) { /* older node: not an exe */ }
  return { dir, sea };
}
const isSrcTree = d => fs.existsSync(path.join(d, 'tools', 'test-all.sh')) && isDir(path.join(d, 'guide'));
function candidates() {
  const over = process.env.ARSENAL_DOCS || process.env.AS2_DOCS_ROOT;
  if (over) return [path.resolve(over)];
  const r = [], { dir: exe, sea } = exeInfo(), sub = b => [path.join(b, 'docs', 'internal'), path.join(b, 'docs', 'public'), path.join(b, 'docs')];
  if (exe && sea) {
    r.push(exe, ...sub(exe));
    for (let d = path.dirname(exe), i = 0; i < 4 && d !== path.dirname(d); d = path.dirname(d), i++) if (isSrcTree(d)) { r.push(d); break; }
  }
  if (!sea) { try { r.push(path.resolve(__dirname, '..', '..', '..', '..')); } catch (e) { /* none */ } }
  if (exe && !sea) r.push(...sub(exe), exe);
  r.push(...sub(process.cwd()), process.cwd());
  return [...new Set(r)];
}
function bookNames(root, id) {
  const b = BOOKS[id], dir = path.join(root, ...b.dir.split('/'));
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    const pi = b.parts.findIndex(x => x[1].test(n));
    if (pi < 0) continue;
    let st; try { st = fs.lstatSync(path.join(dir, n)); } catch (e) { continue; }
    if (!st.isFile()) continue;
    const m = b.parts[pi][1].exec(n), k = m && m[1] != null ? m[1] : '';
    out.push({ n, pi, part: b.parts[pi][0], key: /^\d+$/.test(k) ? +k : k, size: st.size });
  }
  const cmp = (a, c) => (a < c ? -1 : a > c ? 1 : 0);
  return out.sort((a, c) => a.pi - c.pi || cmp(a.key, c.key) || cmp(a.n, c.n));
}
const isRoot = d => isDir(d) && (MARK.some(m => fs.existsSync(path.join(d, m))) || bookNames(d, 'guide').length > 0);
function findRoot() {
  const tried = candidates();
  for (const d of tried) if (isRoot(d)) return { root: d, tried };
  return { root: null, tried };
}

// ---- file list (cached a short time: the source tree changes while the page is open)
// One build for both ways of reading the disk: the steps below ask for a folder's names or for the lstat of some paths (yield),
// and a driver answers them. index() answers with the sync calls, as it always did; warm() (the routes await it first) answers
// through the thread pool, so a rebuild after TTL does not hold the server's loop for the walk. Same steps, same order, same list.
let CACHE = null, WARM = null, GEN = 0;
const drop = () => { CACHE = null; WARM = null; GEN++; };   // forget the list, and a build that is running now
const askSync = q => {
  if (q[0] === 'names') { try { return fs.readdirSync(q[1]); } catch (e) { return null; } }
  return q[1].map(p => { try { return fs.lstatSync(p); } catch (e) { return null; } });
};
const askAsync = q => {
  if (q[0] === 'names') return fs.promises.readdir(q[1]).catch(() => null);
  return Promise.all(q[1].map(p => fs.promises.lstat(p).catch(() => null)));
};
function* walk(root, rel, out, skip) {
  const names = (yield ['names', path.join(root, rel)]);
  if (!names) return out;
  names.sort();
  const sts = yield ['lstat', names.map(n => path.join(root, rel ? rel + '/' + n : n))];
  for (let i = 0; i < names.length; i++) {
    const n = names[i], r = rel ? rel + '/' + n : n, st = sts[i];
    if (!st) continue;
    if (st.isSymbolicLink()) continue;
    if (skip && skip.test(r)) continue;   // never entered, never read
    if (st.isDirectory()) { if (n !== 'node_modules' && n[0] !== '.') yield* walk(root, r, out, skip); }
    else if (/\.md$/i.test(n)) out.push({ p: r, size: st.size });
  }
  return out;
}
function* build(f) {
  const c = { root: f.root, tried: f.tried, at: Date.now(), sets: {}, by: new Map(), text: new Map() };
  if (f.root) for (const s of SETS) {
    let files;
    if (s.file) {
      files = [];
      for (const p of s.file) {   // the first one there
        const st = (yield ['lstat', [path.join(f.root, ...p.split('/'))]])[0];
        if (st && st.isFile()) { files.push({ p, size: st.size }); break; }
      }
    } else if (!s.dir) {
      files = [];
      const names = ((yield ['names', f.root]) || []).sort().filter(n => /\.md$/i.test(n));
      const sts = yield ['lstat', names.map(n => path.join(f.root, n))];
      names.forEach((n, i) => { if (sts[i] && sts[i].isFile()) files.push({ p: n, size: sts[i].size }); });
    } else if (s.flat) {
      files = [];
      for (const d of s.flat) {
        const all = yield ['names', path.join(f.root, d)];
        if (!all) continue;
        const names = all.sort().filter(n => /\.md$/i.test(n));
        const sts = yield ['lstat', names.map(n => path.join(f.root, d, n))];
        names.forEach((n, i) => { if (sts[i] && sts[i].isFile()) files.push({ p: d + '/' + n, size: sts[i].size }); });
      }
    } else files = isDir(path.join(f.root, s.dir)) ? yield* walk(f.root, s.dir, [], s.skip) : [];
    if (s.only) files = files.filter(x => s.only.test(x.p));
    if (s.skip) files = files.filter(x => !s.skip.test(x.p));
    files = files.filter(x => !c.by.has(x.p));   // a file listed by an earlier set stays there
    const first = x => (/(^|\/)INDEX\.md$/.test(x.p) ? 0 : /(^|\/)(README|GUIDE|TECH)\.md$/.test(x.p) ? 1 : 2);
    files.sort((a, b) => first(a) - first(b) || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
    if (BOOKS[s.id]) {   // a book set holds its chapters only, in reading order (notes, change lists, build files and translations stay out)
      const at = new Map(bookNames(f.root, s.id).map((x, i) => [BOOKS[s.id].dir + '/' + x.n, i]));
      files = files.filter(x => at.has(x.p)).sort((a, b) => at.get(a.p) - at.get(b.p));
    }
    c.sets[s.id] = files;
    for (const x of files) c.by.set(x.p, { set: s.id, size: x.size });
  }
  return c;
}
function index() {
  const f = findRoot();
  if (CACHE && CACHE.root === f.root && Date.now() - CACHE.at < TTL) return CACHE;
  const g = build(f);
  let r = g.next();
  while (!r.done) r = g.next(askSync(r.value));
  CACHE = r.value;
  return CACHE;
}
// the rebuild index() would do after TTL, done without holding the loop: afterwards index() finds the new list kept. Only a
// list that is there and too old (or has under 2 s left, so the sync call that follows does not walk) is built again here;
// with no list at all (the first ask, after a reset or fresh=1, another root) index() builds it at once, as before. Calls
// made while one build runs share it; after a reset or fresh=1 (drop) a build that was running is not kept.
function warm() {
  const f = findRoot();
  if (!CACHE || CACHE.root !== f.root) return Promise.resolve(null);
  if (Date.now() - CACHE.at < TTL - 2000) return Promise.resolve(CACHE);
  if (WARM && WARM.root === f.root) return WARM.p;
  const gen = GEN, w = { root: f.root, p: null };
  w.p = (async () => {
    try {
      const g = build(f);
      let r = g.next();
      while (!r.done) r = g.next(await askAsync(r.value));
      const c = r.value;
      if (gen === GEN && (!CACHE || CACHE.root !== c.root || CACHE.at < c.at)) CACHE = c;   // not over a reset, nor over a newer sync build
      return CACHE;
    } finally { if (WARM === w) WARM = null; }
  })();
  WARM = w;
  return w.p;
}
function readText(c, p) {
  let t = c.text.get(p);
  if (t != null) return t;
  const full = path.join(c.root, p);
  const st = fs.lstatSync(full);
  if (st.isSymbolicLink() || !st.isFile()) throw bad('not a file: ' + p, 404);
  const fd = fs.openSync(full, 'r');
  try { const len = Math.min(st.size, MAX_FILE), buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, 0); t = buf.toString('utf8'); } finally { fs.closeSync(fd); }
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  c.text.set(p, t);
  return t;
}

// ---- status
function status() {
  const c = index();
  if (!c.root) return { found: false, tried: c.tried.map(mask), sets: [] };
  const has = d => isDir(path.join(c.root, d)), wi = wholeInfo(c);
  const source = fs.existsSync(path.join(c.root, 'tools', 'test-all.sh'));
  const sets = SETS.map(s => ({ id: s.id, dir: s.dir, part: s.part, notes: !!s.notes, files: c.sets[s.id].length, kb: Math.round(c.sets[s.id].reduce((a, x) => a + x.size, 0) / 1024) })).filter(s => s.files || (SETS.find(x => x.id === s.id).always && isDir(path.join(c.root, s.dir))));   // a set whose folder is not in this copy is not listed
  // pub: every file a reader sees with Advanced off (the start page and the book chapters); the page links only to these then
  const pub = [];
  for (const s of SETS) if (!s.notes) for (const x of c.sets[s.id]) pub.push(x.p);
  let areas = [];
  for (const x of c.sets.limits || []) { const m = /^limits\/([A-Z]+)\d*\.md$/.exec(x.p); if (m && m[1] !== 'INDEX' && !areas.includes(m[1])) areas.push(m[1]); }
  for (const x of c.sets.gohweb || []) { const m = /^gohweb\/limits\/(GH[A-Z]+)\d*\.md$/.exec(x.p); if (m && !areas.includes(m[1])) areas.push(m[1]); }
  return {
    found: true, root: mask(c.root), source, edition: has('codemap') || has('plan') ? 'internal' : 'public',
    sets, total: sets.reduce((a, s) => a + s.files, 0), pubTotal: pub.length, pub, areas: areas.sort(),
    books: Object.fromEntries(Object.keys(BOOKS).map(id => [id, bookOf(c, id).length]).filter(x => x[1])),
    pdf: pdfInfo(c), pdfs: { guide: pdfInfo(c, 'guide'), engine: pdfInfo(c, 'engine') }, srcidx: SRCIDX, history: histAvailable(),
    // whole documents: the ones here (each with its PDF or null), and the ones not here with the command that makes them ('' = not in this edition)
    whole: wi.whole, wholeAbsent: wi.absent,
  };
}

// ---- historical sources: the Source index page reads the guide index data through tools/gemindex/lib/history.js (written by
// another part of the project; contract: available, groups, rows, text, search: the WW2 sources' list and document text). Required late: without it the page says the index is not
// installed. Rows that came from Discord are never passed on. Test hooks: _setHistory(module), AS2_HISTORY_DATA (opt.data).
let _hist = null;
function histMod() {
  if (_hist) return _hist;
  try { return require('../../../gemindex/lib/history'); } catch (e) { return null; }
}
// AS2_HISTORY_WW2 (tests): the WW2 sources folder (opt.ww2); else history.js finds it (ARSENAL_WW2_DIR, <exe dir>/ww2sources, ...)
const histOpt = () => Object.assign(process.env.AS2_HISTORY_DATA ? { data: process.env.AS2_HISTORY_DATA } : {}, process.env.AS2_HISTORY_WW2 ? { ww2: process.env.AS2_HISTORY_WW2 } : {});
// ww2: 'full' (the text inside the documents can be searched), 'parts' (the database is in pieces, as git holds it: the page starts
// /history/join and shows its progress; the list works meanwhile), 'list' (the source list only: ww2Note says how to get the text), 'none'
function histAvailable() {
  const h = histMod();
  if (!h) return { ok: false, why: 'not installed' };
  try {
    const a = h.available(histOpt()) || {};
    if (!a.ok) return { ok: false, why: String(a.why || 'not found') };
    const res = { ok: true, built: a.built || '', rows: a.rows || 0, sites: a.sites || 0, ww2: ['full', 'list', 'parts'].includes(a.ww2) ? a.ww2 : 'none', ww2Note: String(a.ww2Note || ''),
      sources: +a.sources || 0, docs: +a.docs || 0, pages: +a.pages || 0 };
    if (res.ww2 === 'parts') { res.partsMb = +a.partsMb || 0; res.join = joinPub(a.join); }
    return res;
  } catch (e) { return { ok: false, why: String(e.message || e) }; }
}
// the join of the pieces (history.js joinStart / joinStatus): state idle|running|done|failed|stopped|none, MB done of MB in all, why (paths masked)
function joinPub(j) {
  j = j || {};
  return { state: ['idle', 'running', 'done', 'failed', 'stopped', 'none'].includes(j.state) ? j.state : 'idle', doneMb: +j.doneMb || 0, totalMb: +j.totalMb || 0,
    why: mask(String(j.why || '')).slice(0, 600), seconds: Math.round((+j.ms || 0) / 100) / 10 };
}
// THE stop of a running join: the page's Stop (history/joinstop) and the job list's Cancel (JOBS registry) both call this one function.
// The join runs in this process (gemindex lib/ww2parts.js join: the pieces streamed through gunzip into index.sqlite.part, the event loop
// free between chunks; no child, no worker). lib/ww2.js joinStop() stops it at its next chunk through the join's own failure path: the
// .part is removed, nothing is renamed to index.sqlite, no stamp is written, the pieces stay, so the next start does it all again.
// null = this history module cannot stop a join (the job is then listed without Cancel, the page shows no Stop).
function joinStopFn() {
  const h = histMod();
  if (h && typeof h.joinStop === 'function') return () => h.joinStop();
  if (h && !_hist) { try { const w = require('../../../gemindex/lib/ww2'); if (typeof w.joinStop === 'function') return () => w.joinStop(); } catch (e) { /* no stop here */ } }
  return null;
}
// JOBS: the running join as a background job of the footer's list (README.md JOBS): name job.w.docsjoin, page docs, MB done of MB in all.
// The join has no end callback on this side, so the job follows joinStatus on a timer and ends when the join does: done, cancelled
// (stopped) or failed, on every path (a status that throws ends it failed). One job per join.
let JOINJOB = null, JOINTICK = 500;
function joinWatch(ctx) {
  if (JOINJOB || !ctx || !ctx.jobs || typeof ctx.jobs.add !== 'function') return;
  const stop = joinStopFn();
  const jh = ctx.jobs.add({ kind: 'bg', what: 'job.w.docsjoin', page: 'docs', game: typeof ctx.gameId === 'function' ? ctx.gameId() : undefined, cancel: stop || undefined });
  const jj = JOINJOB = { h: jh, timer: null };
  const tick = () => {
    let j;
    try { j = histMod().joinStatus() || {}; } catch (e) { j = { state: 'failed' }; }
    if (j.state === 'running') { jh.set({ done: +j.doneMb || 0, total: +j.totalMb || 0 }); return; }
    clearInterval(jj.timer); if (JOINJOB === jj) JOINJOB = null;
    jh.end(j.state === 'done' ? 'done' : j.state === 'stopped' ? 'cancelled' : 'failed');
  };
  jj.timer = setInterval(tick, JOINTICK); if (jj.timer.unref) jj.timer.unref();
  tick();
}
// start=true: start the join (or get the running one); the answer carries the Historical sources state once it is done.
// canStop: a running join that the page may offer Stop for
function histJoin(start, ctx) {
  const h = histMod();
  if (!h || typeof h.joinStatus !== 'function') return { ok: false, why: 'not installed', state: 'none' };
  let j;
  try { j = joinPub(start ? h.joinStart(histOpt()) : h.joinStatus()); }
  catch (e) { return Object.assign({ ok: false }, joinPub({ state: 'failed', why: e.message || String(e) })); }
  const res = Object.assign({ ok: j.state !== 'failed' }, j);
  if (j.state === 'running') { joinWatch(ctx); res.canStop = !!joinStopFn(); }
  if (j.state === 'done' || j.state === 'none') res.history = histAvailable();
  return res;
}
function histJoinStop(ctx) {
  const f = joinStopFn();
  if (f) { try { f(); } catch (e) { /* the status below says how it stands */ } }
  return histJoin(false, ctx);
}
const web = u => (/^https?:\/\//i.test(u || '') ? String(u) : '');
const s60 = v => (v == null ? '' : String(v).slice(0, 120));
const discord = r => /discord/i.test(String((r && (r.site || '')) + ' ' + (r && (r.url || '')) + ' ' + (r && (r.archive || ''))));
function histGroups() {
  const a = histAvailable();
  if (!a.ok) return { ok: false, why: a.why, groups: [] };
  const groups = (histMod().groups(histOpt()) || []).filter(g => g && !/discord/i.test(String(g.id) + ' ' + String(g.title)))
    .map(g => ({ id: String(g.id), title: String(g.title || g.id), kind: g.kind, count: +g.count || 0, from: g.from || '', to: g.to || '' }));
  return { ok: true, available: a, groups };
}
function histRows(b) {
  b = b || {};
  const a = histAvailable();
  if (!a.ok) return { ok: false, why: a.why, total: 0, rows: [] };
  const limit = Math.max(1, Math.min(100, +b.limit || 50)), offset = Math.max(0, +b.offset || 0);
  const r = histMod().rows(Object.assign(histOpt(), { group: b.group ? String(b.group) : '', q: String(b.q || '').slice(0, 200), offset, limit })) || {};
  // hasText: a guide index row's saved text (the reader); a WW2 document's pages are searched with /history/search instead
  const rows = (r.rows || []).filter(x => x && !discord(x)).map(x => ({ id: String(x.id), title: String(x.title || x.url || x.id), url: web(x.url),
    archive: web(x.archive), captured: x.captured || '', site: x.site || '', lang: x.lang || '', hasText: !!x.hasText && (!x.rec || x.rec === 'index'),
    hand: x.hand === 'first' || x.hand === 'second' ? x.hand : null, kind: x.kind ? String(x.kind).slice(0, 60) : '',
    rec: ['index', 'source', 'document'].includes(x.rec) ? x.rec : 'index', nation: s60(x.nation), topic: s60(x.topic), sub: s60(x.sub), access: s60(x.access), issuer: s60(x.issuer),
    designation: s60(x.designation), year: +x.year || null, pages: +x.pages || 0, parentTitle: s60(x.parentTitle), status: s60(x.status) }));
  return { ok: true, total: +r.total || 0, offset, limit, rows };
}
// the text inside the WW2 documents (history.js search): best 300 pages, snippet, document, page, source address. 409 = no database here.
function histSearch(b) {
  b = b || {};
  const a = histAvailable();
  if (!a.ok) return { ok: false, why: a.why, total: 0, rows: [] };
  if (a.ww2 !== 'full') return { ok: false, why: a.ww2Note, ww2: a.ww2, total: 0, rows: [] };
  const q = String(b.q || '').slice(0, 500).trim();
  if (!q) return { ok: true, total: 0, offset: 0, rows: [] };
  const f = b.filters && typeof b.filters === 'object' ? b.filters : {}, filters = {};
  for (const k of ['nation', 'component', 'kind', 'issuer', 'lang']) if (f[k]) filters[k] = String(f[k]).slice(0, 80);
  for (const k of ['year_from', 'year_to']) if (+f[k]) filters[k] = +f[k];
  const limit = Math.max(1, Math.min(100, +b.limit || 20)), offset = Math.max(0, Math.min(300, +b.offset || 0));
  let r;
  try { r = histMod().search(Object.assign(histOpt(), { q, offset, limit, filters })) || {}; }
  catch (e) { if (e.status === 400 || e.status === 409) throw bad(e.message, e.status); throw e; }
  const rows = (r.rows || []).map(x => ({ id: String(x.id), page: x.page == null ? null : +x.page, printed: s60(x.printed), tier: s60(x.tier), snippet: mask(String(x.snippet || '')).slice(0, 400),
    url: web(x.url), doc: { title: s60((x.doc || {}).title), designation: s60((x.doc || {}).designation), issuer: s60((x.doc || {}).issuer), year: +(x.doc || {}).year || null, nation: s60((x.doc || {}).nation), url: web((x.doc || {}).url) },
    source: x.source ? { title: s60(x.source.title), url: web(x.source.url) } : null }));
  return { ok: true, total: +r.total || 0, capped: !!r.capped, offset, limit, rows };
}
function histText(b) {
  b = b || {};
  const a = histAvailable();
  if (!a.ok) return { ok: false, why: a.why };
  const t = histMod().text(String(b.id || ''), Object.assign(histOpt(), { max: Math.min(+b.max || 200000, 600000) }));
  if (!t || discord(t)) throw bad('no saved text for this source', 404);
  const res = { ok: true, id: String(t.id), title: String(t.title || t.url || t.id), url: web(t.url), archive: web(t.archive), captured: t.captured || '', text: mask(String(t.text || '')) };
  if (/^wp\d+$/.test(res.id)) Object.assign(res, { page: +t.page || null, printed: s60(t.printed), citation: String(t.citation || '').slice(0, 600), prev: /^wp\d+$/.test(t.prev || '') ? t.prev : null,
    next: /^wp\d+$/.test(t.next || '') ? t.next : null, doc: { title: s60((t.doc || {}).title), designation: s60((t.doc || {}).designation), url: web((t.doc || {}).url), pages: +(t.doc || {}).pages || 0 } });
  return res;
}

// ---- books (G9): the chapters of a set in reading order. Only the outline: chapter text comes one file at a time (/file),
// so the page draws a chapter when the reader gets near it, never the whole book at once.
function bookOf(c, id) {
  if (!c.root || !BOOKS[id]) return [];
  const dir = BOOKS[id].dir;
  const out = bookNames(c.root, id).map(x => ({ p: dir + '/' + x.n, part: x.part, size: x.size })).filter(x => c.by.has(x.p));
  if (BOOKS[id].extra) out.push({ p: SRCIDX, part: BOOKS[id].extra, size: 1024, gen: true });   // generated page, always last
  return out;
}
function titleOf(c, p) {
  let t = ''; try { t = readText(c, p); } catch (e) { return path.posix.basename(p); }
  const m = /^# (.+)$/m.exec(t);
  return m ? m[1].replace(/[`*]/g, '').trim() : path.posix.basename(p);
}
function book(id) {
  const c = index();
  if (!c.root) return { found: false, chapters: [] };
  if (!BOOKS[id]) throw bad('book must be one of ' + Object.keys(BOOKS).join(', '));
  const chapters = bookOf(c, id).map(x => (x.gen ? { p: x.p, part: x.part, title: 'Source index', gen: true, kb: 1 } : { p: x.p, part: x.part, title: titleOf(c, x.p), kb: Math.max(1, Math.round(x.size / 1024)) }));
  const parts = BOOKS[id].parts.map(x => x[0]).concat(BOOKS[id].extra ? [BOOKS[id].extra] : []);
  return { found: true, set: id, parts: parts.filter(pt => chapters.some(ch => ch.part === pt)), chapters, pdf: WHOLE[id] && WHOLE[id].pdf ? pdfInfo(c, id) : null };
}
// search over one book: every word in the line; hits in reading order, grouped by part
function booksearch(id, qIn) {
  const c = index();
  if (!c.root) return { found: false, groups: [] };
  if (!BOOKS[id]) throw bad('book must be one of ' + Object.keys(BOOKS).join(', '));
  const words = String(qIn || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length || words.join('').length < 2) throw bad('type at least two characters');
  const groups = [], seen = new Set();
  let total = 0, rows = 0;
  for (const x of bookOf(c, id)) {
    let t; try { t = readText(c, x.p); } catch (e) { continue; }
    if (!words.every(w => t.toLowerCase().includes(w))) continue;
    const lines = t.split(/\r?\n/), title = (/^# (.+)$/m.exec(t) || [0, path.posix.basename(x.p)])[1].replace(/[`*]/g, '').trim();
    let g = groups.find(y => y.part === x.part);
    for (let i = 0; i < lines.length; i++) {
      const ll = lines[i].toLowerCase();
      if (!words.every(w => ll.includes(w))) continue;
      total++; seen.add(x.p);
      if (rows >= MAX_ROWS) continue;
      if (!g) { g = { part: x.part, hits: [] }; groups.push(g); }
      g.hits.push({ p: x.p, title, line: i + 1, kind: /^#{1,6} /.test(lines[i]) ? 'heading' : 'text', text: mask(lines[i].trim().slice(0, 260)) });
      rows++;
    }
  }
  return { found: true, set: id, q: words.join(' '), total, chapters: seen.size, groups, more: total > rows };
}

// ---- whole documents and their PDFs: one locator. A folder under the root (every part of the path a real folder, no link or
// junction on the way), names matching the pattern, the newest by version; a regular non-empty file. Never outside the root.
function plainDir(root, rel) {
  let d = root;
  for (const s of rel.split('/')) {
    d = path.join(d, s);
    let st; try { st = fs.lstatSync(d); } catch (e) { return null; }
    if (st.isSymbolicLink() || !st.isDirectory()) return null;
  }
  return d;
}
const cmpv = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function newest(root, rel, rx) {
  const dir = root && plainDir(root, rel);
  if (!dir) return null;
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const ver = n => rx.exec(n)[1].split('.').map(Number), size = {};
  const list = names.filter(n => rx.test(n)).filter(n => { try { const st = fs.lstatSync(path.join(dir, n)); size[n] = st.size; return st.isFile() && st.size > 0; } catch (e) { return false; } });
  if (!list.length) return null;
  list.sort((a, b) => cmpv(ver(b), ver(a)) || (a < b ? 1 : -1));
  return { name: list[0], ver: rx.exec(list[0])[1], full: path.join(dir, list[0]), size: size[list[0]], kb: Math.max(1, Math.round(size[list[0]] / 1024)) };
}
function pdfFile(c, id) { const w = WHOLE[id || 'guide']; return c.root && w && w.pdf ? newest(c.root, w.dir, w.pdf) : null; }
function pdfInfo(c, id) { const f = pdfFile(c, id); return f ? { name: f.name, ver: f.ver, kb: f.kb } : null; }
// the HTML of one whole document: {name, ver, full, size, kb} or {refused: why} (a file that is there but breaks the contract)
function wholeFile(c, id) {
  const w = WHOLE[id];
  if (!c.root || !w) return null;
  let f;
  if (w.file) {
    const parts = w.file.split('/'), name = parts.pop(), dir = plainDir(c.root, parts.join('/'));
    if (!dir) return null;
    let st; try { st = fs.lstatSync(path.join(dir, name)); } catch (e) { return null; }
    if (st.isSymbolicLink()) return { refused: 'a link, not a file' };
    if (!st.isFile() || !st.size) return null;
    f = { name, ver: '', full: path.join(dir, name), size: st.size, kb: Math.max(1, Math.round(st.size / 1024)) };
  } else {
    f = newest(c.root, w.dir, w.rx);
    if (!f) return null;
  }
  if (f.size > WHOLE_MAX) return { name: f.name, refused: 'over ' + (WHOLE_MAX >> 20) + ' MB' };
  // the first bytes: the exact contract start, and the version from <meta name="arsenal-whole" content="<id> <ver>"> in the head
  const fd = fs.openSync(f.full, 'r'), head = Buffer.alloc(Math.min(f.size, 65536));
  try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
  const t = head.toString('utf8');
  if (!t.startsWith(WHOLE_HEAD)) return { name: f.name, refused: 'does not start with ' + WHOLE_HEAD };
  const m = /<meta\s+name="arsenal-whole"\s+content="([a-z]+)\s+([^"\s]+)"/i.exec(t.slice(0, t.search(/<\/head>|$/i)));
  if (!f.ver && m && m[1] === id) f.ver = m[2].slice(0, 20);
  return f;
}
function wholeInfo(c) {
  const whole = [], absent = [];
  for (const id of Object.keys(WHOLE)) {
    const f = wholeFile(c, id), w = WHOLE[id];
    if (f && !f.refused) { whole.push({ id, name: f.name, ver: f.ver, kb: f.kb, pdf: pdfInfo(c, id), part: w.part }); continue; }
    const canMake = !!c.root && fs.existsSync(path.join(c.root, ...w.make[0].split('/')));
    absent.push({ id, make: canMake ? w.make[1] : '', refused: f && f.refused ? mask(f.name + ': ' + f.refused) : '', part: w.part });
  }
  return { whole, absent };
}
// GET /whole: the file as text with the GUI's theme set on its <html> tag. gui.js serves {sandbox: true} html only under the CSP
// sandbox header (opaque origin, nothing loaded from outside), so the document's own script never runs as the GUI.
function whole(id, theme) {
  if (!Object.prototype.hasOwnProperty.call(WHOLE, id)) throw bad('id must be one of ' + Object.keys(WHOLE).join(', '));
  if (theme && theme !== 'light' && theme !== 'dark') throw bad('theme must be light or dark');
  const c = index();
  if (!c.root) throw bad('no documentation found here', 404);
  const f = wholeFile(c, id);
  if (!f) throw bad('the ' + id + ' document is not here', 404);
  if (f.refused) throw bad('not shown: ' + mask(f.name + ': ' + f.refused), 409);
  const st = fs.lstatSync(f.full);   // again at read time: still a plain file of an allowed size
  if (st.isSymbolicLink() || !st.isFile() || st.size > WHOLE_MAX) throw bad('not shown: ' + f.name + ' changed while it was read', 409);
  let t = fs.readFileSync(f.full).toString('utf8');
  if (!t.startsWith(WHOLE_HEAD)) throw bad('not shown: ' + f.name + ' does not start with ' + WHOLE_HEAD, 409);
  if (theme) t = WHOLE_HEAD.slice(0, -1) + ' data-theme="' + theme + '">' + t.slice(WHOLE_HEAD.length);
  return { __raw: t, type: 'text/html; charset=utf-8', sandbox: true };
}
let _spawn = null;   // test seam: (cmd, args, opts) => child
// POST /pdf {set}: the newest PDF of the guide (no set, as before) or of the engine document, in the user's PDF reader
function pdfOpen(b) {
  const id = b && b.set != null && b.set !== '' ? String(b.set) : 'guide';
  if (id !== 'guide' && id !== 'engine') throw bad('set must be guide or engine');
  const c = index(), f = pdfFile(c, id);
  if (!f) throw bad('no PDF of the ' + id + ' document here', 404);
  if (!_spawn) {   // lib/platform: explorer.exe / open / xdg-open with the default PDF viewer
    const r = require('../../../lib/platform').openPath(f.full);
    if (!r.ok) throw bad('could not open the PDF: ' + mask(f.full), 500);
    return { ok: true, name: f.name };
  }
  const ch = _spawn('explorer.exe', [f.full], { shell: false, detached: true, stdio: 'ignore' });
  if (ch && ch.on) ch.on('error', () => {});
  if (ch && ch.unref) ch.unref();
  return { ok: true, name: f.name };
}

// ---- list
function list(setId) {
  const c = index();
  if (!c.root) return { found: false, files: [] };
  if (!SETS.some(s => s.id === setId)) throw bad('set must be one of ' + SETS.map(s => s.id).join(', '));
  return { found: true, set: setId, files: c.sets[setId].map(x => ({ p: x.p, kb: Math.max(1, Math.round(x.size / 1024)) })) };
}

// ---- file: p is a path of the list; with `from`, p may be a link target written in the file `from`
function norm(p) {
  const out = [];
  for (const s of String(p).replace(/\\/g, '/').split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') { if (!out.length) return null; out.pop(); continue; }
    out.push(s);
  }
  return out.join('/');
}
function resolve(c, target, from) {
  let t = String(target || '').trim().replace(/[#?].*$/, ''), line = 0;
  const m = /^(.*?\.md):(\d+)(?:-\d+)?$/i.exec(t);
  if (m) { t = m[1]; line = +m[2]; }
  if (!t || /^[a-z]+:/i.test(t) || t.length > 400) return null;
  const tries = [];
  const add = b => { for (const x of [t, t + '.md']) { const n = norm(b ? b + '/' + x : x); if (n && !tries.includes(n)) tries.push(n); } };
  if (from && c.by.has(from)) {
    add(path.posix.dirname(from) === '.' ? '' : path.posix.dirname(from));
    const set = SETS.find(s => s.id === c.by.get(from).set);
    if (set && set.dir) add(set.dir);
  }
  add('');
  for (const s of SETS) if (s.dir) add(s.dir);
  for (const n of tries) if (c.by.has(n)) return { p: n, line };
  return null;
}
function file(pIn, from, lineIn) {
  const c = index();
  if (!c.root) return { found: false, nodocs: true };
  const r = resolve(c, pIn, from);
  if (!r) throw bad('no such document: ' + String(pIn || '').slice(0, 120), 404);
  const info = c.by.get(r.p);
  const text = readText(c, r.p);
  const t = /^# (.+)$/m.exec(text);
  // kids: names this file can link by the first word of a line (block files under <file>/, siblings of an INDEX)
  const kids = {}, base = r.p.replace(/\.md$/i, ''), dir = path.posix.dirname(r.p) === '.' ? '' : path.posix.dirname(r.p);
  const isIndex = /(^|\/)INDEX$/.test(base);
  let nk = 0;
  for (const k of c.by.keys()) {
    if (nk >= MAX_KIDS) break;
    let m = null;
    if (k.startsWith(base + '/')) m = /^([^/]+)\.md$/i.exec(k.slice(base.length + 1));
    else if (isIndex && dir && k.startsWith(dir + '/') && k !== r.p) {
      const rest = k.slice(dir.length + 1);
      m = /^(?:index\/)?([^/]+)\.md$/i.exec(rest) || /^([^/]+)\/INDEX\.md$/.exec(rest);
    }
    if (m && !kids[m[1]]) { kids[m[1]] = k; nk++; }
  }
  return {
    found: true, p: r.p, set: info.set, size: info.size, truncated: info.size > MAX_FILE,
    line: +lineIn > 0 ? +lineIn : r.line, title: t ? t[1].replace(/`/g, '').trim() : path.posix.basename(r.p), text: mask(text), kids,
  };
}

// ---- search: every word must be in the line (or in the file path); headings and limits rows first.
// 'all' covers the reader's documents; the maintainers' notes only with notes (one named set is searched as asked).
function search(qIn, setId, notes) {
  const c = index();
  if (!c.root) return { found: false, rows: [] };
  const words = String(qIn || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length || words.join('').length < 2) throw bad('type at least two characters');
  const sets = setId && setId !== 'all' ? SETS.filter(s => s.id === setId) : SETS.filter(s => notes || !s.notes);
  if (!sets.length) throw bad('unknown set ' + setId);
  const top = [], rest = [];
  let total = 0, files = 0, hitFiles = 0;
  for (const s of sets) for (const x of c.sets[s.id]) {
    files++;
    let n = 0;
    const pl = x.p.toLowerCase();
    if (words.every(w => pl.includes(w))) { n++; total++; top.push({ p: x.p, line: 0, kind: 'file', text: x.p }); }
    let t; try { t = readText(c, x.p); } catch (e) { continue; }
    const low = t.toLowerCase();
    if (!words.every(w => low.includes(w))) { if (n) hitFiles++; continue; }
    const lines = t.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], ll = l.toLowerCase();
      if (!words.every(w => ll.includes(w))) continue;
      n++; total++;
      const head = /^#{1,4} /.test(l), lim = /^[A-Z]{2,6}\d?-\d+ \| /.test(l);
      const row = { p: x.p, line: i + 1, kind: head ? 'heading' : lim ? 'limit' : 'text', text: mask(l.trim().slice(0, 260)) };
      if (head || lim) { if (top.length < MAX_ROWS) top.push(row); } else if (rest.length < MAX_ROWS) rest.push(row);
    }
    if (n) hitFiles++;
  }
  const rows = top.concat(rest).slice(0, MAX_ROWS);
  return { found: true, q: words.join(' '), set: setId || 'all', notes: !!notes, total, files, hitFiles, rows, more: total > rows.length };
}

// ---- limits row by ID
function limit(idIn) {
  const m = /^([A-Za-z][A-Za-z]*)(\d?)-(\d{1,4})$/.exec(String(idIn || '').trim());
  if (!m) throw bad('a limits ID looks like VFS-19 (area, dash, number)');
  const c = index();
  if (!c.root) return { found: false, nodocs: true };
  const area = m[1].toUpperCase(), ids = [area + m[2] + '-' + m[3], area + m[2] + '-' + m[3].padStart(2, '0')];
  // a GH area (Gates of Hell) is read, every other area from limits/
  const gh = /^GH/.test(area), files = ((gh ? c.sets.gohweb : c.sets.limits) || []).filter(x => new RegExp('^' + (gh ? 'gohweb/' : '') + 'limits/' + area + '\\d*\\.md$').test(x.p));
  for (const x of files) {
    const lines = readText(c, x.p).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const id = lines[i].split('|')[0].trim().toUpperCase();
      if (ids.includes(id)) return { found: true, id, p: x.p, line: i + 1, text: mask(lines[i]) };
    }
  }
  return { found: false, id: ids[1], searched: files.map(x => x.p) };
}

// ---- heads (searchKit index of the search boxes, owner 2026-11-19): one set's documents (path, title) and their headings (# to ###,
// path, line, text), read once and kept while the set's file list (paths and sizes) stays the same, so the page asks once per set
const HEADS = new Map(), MAX_HEADS = 20000;
function heads(setId) {
  const c = index();
  if (!c.root) return { found: false, files: [], heads: [] };
  if (!SETS.some(s => s.id === setId)) throw bad('set must be one of ' + SETS.map(s => s.id).join(', '));
  const files = c.sets[setId], sig = c.root + '|' + files.map(x => x.p + ':' + x.size).join('|'), k = setId;
  const kept = HEADS.get(k);
  if (kept && kept.sig === sig) return kept.out;
  const fl = [], hs = [];
  for (const x of files) {
    let t; try { t = readText(c, x.p); } catch (e) { fl.push({ p: x.p, t: path.posix.basename(x.p) }); continue; }
    const lines = t.split(/\r?\n/);
    let title = '', fence = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
      if (fence) continue;
      const m = /^(#{1,3}) +(.+?)\s*#*\s*$/.exec(l);
      if (!m) continue;
      const text = m[2].replace(/[`*]/g, '').trim();
      if (!text) continue;
      if (!title && m[1].length === 1) title = text;
      if (hs.length < MAX_HEADS) hs.push({ p: x.p, l: i + 1, v: m[1].length, t: text.slice(0, 160) });
    }
    fl.push({ p: x.p, t: title || path.posix.basename(x.p) });
  }
  const out = { found: true, set: setId, files: fl, heads: hs, more: hs.length >= MAX_HEADS };
  HEADS.set(k, { sig, out });
  return out;
}
// the Source index rows by title (id, title, designation, kind, nation, topic, year, rec): the index of its two search boxes, sent once
function histTitles() {
  const a = histAvailable();
  if (!a.ok) return { ok: false, why: a.why, rows: [] };
  const out = [];
  for (let off = 0; off < 50000; off += 5000) {
    const r = histMod().rows(Object.assign(histOpt(), { offset: off, limit: 5000 })) || {};
    const rs = (r.rows || []).filter(x => x && !discord(x));
    for (const x of rs) out.push({ id: String(x.id), t: s60(x.title || x.url || x.id), d: s60(x.designation), k: s60(x.kind), n: s60(x.nation), tp: s60(x.topic), y: +x.year || null, rec: ['index', 'source', 'document'].includes(x.rec) ? x.rec : 'index' });
    if (!(r.rows || []).length || off + 5000 >= (+r.total || 0)) break;
  }
  return { ok: true, rows: out };
}
// where (searchKit Browse, owner 2026-11-19: "browse should always be a file directory browse"): the folders the page's documents are
// read from, as real paths for the folder picker on this PC (status masks the home; this answer is only a picker start, not shown as
// text). root = the document root, history = the WW2 sources folder (else the guide index folder) the Source index reads. Not on the
// phone's allow list (a phone has no disk browser).
function where() {
  const c = index();
  let history = '';
  const h = histMod();
  if (h) { try { const a = h.available(histOpt()) || {}; history = String(a.ww2Dir || a.dir || ''); } catch (e) { history = ''; } }
  return { root: c.root || '', history };
}

const routes = {
  'GET /api/x/docs/where': async () => where(),
  'GET /api/x/docs/heads': async url => heads(url.searchParams.get('set') || 'guide'),
  'POST /api/x/docs/history/titles': async () => histTitles(),
  // fresh=1 (the page's Look again): read the folders again now, not the list kept for TTL (files copied in a moment ago)
  'GET /api/x/docs/status': async url => { if (url && url.searchParams.get('fresh') === '1') drop(); return status(); },
  'GET /api/x/docs/list': async url => list(url.searchParams.get('set') || 'guide'),
  'GET /api/x/docs/file': async url => file(url.searchParams.get('p'), url.searchParams.get('from') || '', url.searchParams.get('line') || 0),
  'GET /api/x/docs/search': async url => search(url.searchParams.get('q'), url.searchParams.get('set') || 'all', url.searchParams.get('notes') === '1'),
  'GET /api/x/docs/limit': async url => limit(url.searchParams.get('id')),
  'GET /api/x/docs/book': async url => book(url.searchParams.get('set') || 'guide'),
  'GET /api/x/docs/booksearch': async url => booksearch(url.searchParams.get('set') || 'guide', url.searchParams.get('q')),
  'POST /api/x/docs/pdf': async (u, b) => pdfOpen(b),
  'GET /api/x/docs/whole': async url => whole(url.searchParams.get('id') || '', url.searchParams.get('theme') || ''),
  'POST /api/x/docs/history/groups': async () => histGroups(),
  'POST /api/x/docs/history/rows': async (u, b) => histRows(b),
  'POST /api/x/docs/history/text': async (u, b) => histText(b),
  'POST /api/x/docs/history/search': async (u, b) => histSearch(b),
  // the document database in pieces (git layout): join starts putting it together in the background (a running join is returned as it
  // is), joinstatus only reads how far it is; both return {state, doneMb, totalMb, why, seconds} and, once done, history (the new state)
  // While it runs the join is a background job of the job list (joinWatch). joinstop asks it to stop (the same function as the job list's
  // Cancel) and answers like joinstatus: still running until the join reaches its next chunk, then state stopped.
  'POST /api/x/docs/history/join': async (u, b, ctx) => histJoin(true, ctx),
  'POST /api/x/docs/history/joinstatus': async (u, b, ctx) => histJoin(false, ctx),
  'POST /api/x/docs/history/joinstop': async (u, b, ctx) => histJoinStop(ctx),
};
// every route that reads the file list builds it off the loop first (warm); its handler then finds it kept
for (const k of ['where', 'heads', 'status', 'list', 'file', 'search', 'limit', 'book', 'booksearch', 'pdf', 'whole']) {
  const key = Object.keys(routes).find(r => r.endsWith(' /api/x/docs/' + k)), fn = routes[key];
  routes[key] = async (...a) => { if (!(k === 'status' && a[0] && a[0].searchParams && a[0].searchParams.get('fresh') === '1')) await warm(); return fn(...a); };
}
module.exports = { routes, status, warm, where, list, file, search, limit, heads, histTitles, book, booksearch, whole, norm, mask, SETS, PARTS, BOOKS, WHOLE, WHOLE_HEAD, WHOLE_MAX, SRCIDX, reset: () => { drop(); }, candidates, _setExeDir: x => { _exeDir = x; drop(); }, _setSpawn: f => { _spawn = f; }, _setHistory: m => { _hist = m; }, _setJoinTick: ms => { JOINTICK = ms; } };
