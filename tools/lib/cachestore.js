// cachestore: the one shared store for everything the GUI has already made (tools/gui/README.md, "CACHE", contract 1).
// Rule: an entry whose stamps differ from the asked stamps is never served.
//   open({root, cap, release, now}) -> S   root default toolcache.dir('store') (ARSENAL_CACHE redirects it), cap 2 GB,
//     release default credit.version(), now default Date.now. One S per root in a process: a second open of the same
//     root gives the first S back and its options are not applied (_reset() forgets them, for tests).
//     Tests never get the user's store: when no root is given and ARSENAL_CACHE is not set, a process whose main script is
//     a test (a test/ folder inside tools, test.js, test-x.js, x.test.js, guardtest.js, cachetest.js, testgames.js), and
//     every process it starts after this file was loaded (env ARSENAL_TEST_STORE, set here), opens a scratch store
//     <temp>/arsenal-test-store-<pid> instead; the test process removes it when it ends. testRoot() -> that folder | null.
// An entry is named by its identity: section (a-z0-9.-) + parts (plain JSON, key order does not matter, no times).
//   <root>/e/<sha1 of [section, parts]>/meta.json {section, parts, ver, release, stamps, at, bytes, raw, sum}
//                                      /value.json | value.bin (a Buffer), use (empty; its mtime = the last use)
//   <root>/index.json + <root>/j.log   what the whole-store calls (stats, sweep, clear, evict, the total a put keeps) read
//     instead of every meta.json: index.json {v, j, e: {key: [section, bytes, release, at, mod?]}} and j.log, one line per
//     put ([key, section, bytes, release, at, mod?]) or removal ([key]) since byte j, appended under the entry's lock. They
//     are trusted only for keys the e/ folder listing has: a key in the listing and not in the index is read from its
//     meta.json (and dropped when damaged), a key not in the listing is forgotten, and each scan checks the next 8 entries
//     against their meta.json in turn, so a row written by something else is put right within a few scans. They only
//     count: get and state read the entry's own meta.json and value, so a damaged or foreign entry is never served.
//   <root>/t/ temp files of writes in flight, <root>/l/<key>/ a mkdir lock held only around the two renames of a put
//     and around a removal (milliseconds; older than 10 s = left by a dead process and taken over).
//   sum = sha1 of the value bytes: it ties meta.json to its value file, so a reader that meets the meta of one write
//     and the value of another (two processes, one root) sees a miss, never a value under the wrong stamps.
//   S.get(section, ver, parts, stamps) -> {value, at, bytes} | null   null: no entry, or ver, the release or any stamp
//     differs (a stamp name on one side only differs too), or the entry is damaged (then it is removed)
//   S.getRaw(section, ver, parts, stamps) -> {buf, at, bytes, raw} | null   get without the parse: buf = the stored bytes,
//     for JSON data exactly JSON.stringify(value) in UTF-8 (raw false), for a Buffer the Buffer (raw true). Same misses as get
//   S.put(section, ver, parts, stamps, value) -> {bytes}   value JSON data or a Buffer; replaces the entry. Best effort:
//     a failed write warns once (lib/cachewrite) and gives {bytes: 0}; so does a value JSON cannot hold (undefined)
//   S.wrap(section, ver, parts, stamps, make) -> Promise<value>   get, else await make() then put. Calls for one
//     identity + ver + stamps at a time share one make; a make that throws stores nothing and rejects every sharer
//   S.state(section, ver, parts, stamps) -> {state: 'ready'|'none'|'stale', why, at, bytes}   reads no value. why:
//     'release', 'version', then the first word of each differing stamp name ('mod:set' -> 'mod'), each once
//   S.clear(section?) -> {removed, bytes}   S.sweep() -> {removed} (entries of another release, 'modtree' entries whose
//     mod folder {mod} is gone (such a T can never be served as fresh), temp files over 1 h old)
//   S.evict(keep?) -> {removed, bytes}   least recently used first until under the cap; runs after a put that takes
//     the known total over the cap and never removes the entry just written (keep = its key)
//   S.stats() -> {bytes, entries, cap, root, sections: {name: {bytes, entries}}}   metas only, cached 1.5 s
//   S.key(section, parts) -> 40 hex;  S.root, S.cap, S.release
//   S.warm() -> Promise<{bytes, entries}>   the known total, without a blocking pass: a store whose index lacks more than
//     SLICE (50) entries (no index.json yet, or deleted) has their meta.json read SLICE at a time from a timer, the index
//     saved every SLICE_SAVE rows (a stopped process goes on from there next time). The timer keeps the process alive only
//     when warm() was called (someone waits). A put that meets such a store starts the same work and skips its size check until it is done (the
//     cap may be passed meanwhile by the bytes of those puts; the check and evict run when the total is known, and the
//     last entry put meanwhile is the one that evict keeps). stats,
//     sweep, clear and evict stay synchronous and complete: called meanwhile they read what is left in one pass.
// Last use: get sets the mtime of the entry's `use` file, at most once a minute per entry and process.
// Author: Imperator_Aug (ARSENAL, ia-c1f3dbc6)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const toolcache = require('./toolcache'), cw = require('./cachewrite'), credit = require('./credit');

const CAP = 2 * 1024 * 1024 * 1024;
const SECTION_RE = /^[a-z0-9.-]+$/, KEY_RE = /^[0-9a-f]{40}$/;
const USE_MS = 60 * 1000;                      // a get refreshes the last-use time at most this often
const STATS_MS = 1500;                         // stats() answer kept this long
const RESCAN_MS = 10 * 60 * 1000;              // the known total is re-read from disk after this long
const LOCK_WAIT_MS = 2000, LOCK_STALE_MS = 10000;
const TMP_OLD_MS = 60 * 60 * 1000;
const SLICE = 50, SLICE_SAVE = 500;            // metas one timer turn reads while a missing index is built (warm); rows between saves
const VERIFY_N = 8;                            // entries a scan checks against their meta.json, in turn
const J_SAVE = 64 * 1024, J_MAX = 512 * 1024;  // journal bytes past the index before it is saved again / before it is folded in
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);   // Windows: the target is open in another process just now

const SAB = new Int32Array(new SharedArrayBuffer(4));
const sleep = ms => { Atomics.wait(SAB, 0, 0, ms); };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
// canonical JSON: object keys sorted at every depth, so {a, b} and {b, a} are one identity
function canon(v) {
  if (v === undefined) return 'null';
  return JSON.stringify(v, (k, x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Buffer.isBuffer(x)) return x;
    const o = {};
    for (const n of Object.keys(x).sort()) o[n] = x[n];
    return o;
  }) || 'null';
}
function cleanStamps(st) {
  const o = {};
  for (const n of Object.keys(st || {}).sort()) if (st[n] !== undefined && st[n] !== null) o[n] = String(st[n]);
  return o;
}
function retry(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) { if (!BUSY.has(e.code) || i >= 200) throw e; sleep(2 + (i & 7)); }
  }
}
function okMeta(m) {
  return !!m && typeof m === 'object' && typeof m.section === 'string' && SECTION_RE.test(m.section) &&
    typeof m.release === 'string' && !!m.stamps && typeof m.stamps === 'object' && !Array.isArray(m.stamps) &&
    Number.isFinite(m.at) && Number.isFinite(m.bytes) && m.bytes >= 0 && typeof m.raw === 'boolean' && typeof m.sum === 'string';
}

// the row the index keeps of a meta: what stats, sweep, clear and evict need
function mini(m) {
  const r = { section: m.section, bytes: m.bytes, release: m.release, at: m.at };
  if (m.section === 'modtree' && m.parts && typeof m.parts === 'object' && typeof m.parts.mod === 'string') r.mod = m.parts.mod;
  return r;
}
const rowOf = (key, r) => (r.mod === undefined ? [key, r.section, r.bytes, r.release, r.at] : [key, r.section, r.bytes, r.release, r.at, r.mod]);
// [key, section, bytes, release, at, mod?] -> row | null
function ofRow(a) {
  if (!Array.isArray(a) || a.length < 5 || typeof a[1] !== 'string' || !SECTION_RE.test(a[1]) || !Number.isFinite(a[2]) || a[2] < 0 ||
    typeof a[3] !== 'string' || !Number.isFinite(a[4])) return null;
  const r = { section: a[1], bytes: a[2], release: a[3], at: a[4] };
  if (typeof a[5] === 'string') r.mod = a[5];
  return r;
}
const statOf = f => { try { return fs.statSync(f); } catch (e) { return null; } };

// ---- tests never open the user's store (see open)
const TOOLS = path.resolve(__dirname, '..');
const TEST_BASE = /^(?:test(?:[-.].*)?|.*[.-]test|(?:guard|cache)test|testgames)\.js$/i;
function isTestMain(file) {
  if (!file) return false;
  if (TEST_BASE.test(path.basename(file))) return true;
  const rel = path.relative(TOOLS, path.resolve(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /(?:^|[\\/])tests?[\\/]/i.test(rel);
}
let TEST_ROOT;
function testRoot() {
  const env = process.env;
  if (env.ARSENAL_CACHE && path.isAbsolute(env.ARSENAL_CACHE)) return null;
  if (TEST_ROOT !== undefined) return TEST_ROOT;
  if (env.ARSENAL_TEST_STORE && path.isAbsolute(env.ARSENAL_TEST_STORE)) return (TEST_ROOT = env.ARSENAL_TEST_STORE);
  if (!isTestMain(require.main && require.main.filename)) return (TEST_ROOT = null);
  const d = path.join(os.tmpdir(), 'arsenal-test-store-' + process.pid);
  env.ARSENAL_TEST_STORE = d;                  // the processes this test starts share it
  process.on('exit', () => { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }); } catch (e) { /* the temp folder's owner cleans */ } });
  return (TEST_ROOT = d);
}
testRoot();

let seq = 0;
class Store {
  constructor(o) {
    this.root = o.root;
    this.cap = o.cap > 0 ? o.cap : CAP;
    this.release = String(o.release === undefined || o.release === null ? credit.version() : o.release);
    this.now = typeof o.now === 'function' ? o.now : Date.now;
    this._used = new Map();        // key -> clock time of the last `use` touch by this process
    this._flight = new Map();      // wrap: identity + ver + stamps -> the running make
    this._stats = null;            // {t, v}
    this._est = null;              // total bytes as far as this process knows; null = unknown
    this._estAt = 0;
    this._idx = null;              // key -> row (mini) as index.json + j.log give it
    this._idxSig = '';             // size:mtime of the index.json this._idx came from
    this._j = 0;                   // j.log bytes already applied
    this._jSaved = 0;              // ... and how many of them index.json holds
    this._cur = 0;                 // where the next scan's check of VERIFY_N entries starts
    this._fill = null;             // warm: {keys, i, p, hold, t} while a missing index is built in slices
    this._idxNew = false;          // rows added to this._idx by warm that index.json does not hold yet
  }

  key(section, parts) {
    if (typeof section !== 'string' || !SECTION_RE.test(section)) throw new TypeError('cachestore: bad section name: ' + section);
    return sha1('[' + JSON.stringify(section) + ',' + canon(parts) + ']');
  }
  _dir(key) { return path.join(this.root, 'e', key); }
  _dirty() { this._stats = null; }

  // ---- the short lock (between processes) ----
  _lock(key, wait = LOCK_WAIT_MS) {
    const d = path.join(this.root, 'l', key), end = Date.now() + wait;
    for (;;) {
      try { fs.mkdirSync(d); return d; } catch (e) {
        if (e.code === 'ENOENT') { try { fs.mkdirSync(path.dirname(d), { recursive: true }); } catch (e2) { return null; } }
        else if (e.code === 'EEXIST') {
          try { if (Date.now() - fs.statSync(d).mtimeMs > LOCK_STALE_MS) { fs.rmdirSync(d); continue; } } catch (e2) { /* gone meanwhile */ }
        } else if (!BUSY.has(e.code)) return null;
      }
      if (Date.now() >= end) return null;
      sleep(3);
    }
  }
  _unlock(d) { try { fs.rmdirSync(d); } catch (e) { /* taken over as stale */ } }
  _locked(key) {
    try { return Date.now() - fs.statSync(path.join(this.root, 'l', key)).mtimeMs <= LOCK_STALE_MS; } catch (e) { return false; }
  }

  // ---- reading ----
  // -> {st: 'none'} | {st: 'bad'} | {st: 'ok', meta}
  _meta(key) {
    let txt;
    try { txt = fs.readFileSync(path.join(this._dir(key), 'meta.json'), 'utf8'); } catch (e) {
      if (e.code !== 'ENOENT') return { st: 'bad' };
      return { st: fs.existsSync(this._dir(key)) ? 'bad' : 'none' };     // a folder without a meta: half written or left over
    }
    let meta = null;
    try { meta = JSON.parse(txt); } catch (e) { return { st: 'bad' }; }
    if (!okMeta(meta)) return { st: 'bad' };
    try { if (this.key(meta.section, meta.parts) !== key) return { st: 'bad' }; } catch (e) { return { st: 'bad' }; }
    return { st: 'ok', meta };
  }
  _valueFile(key, meta) { return path.join(this._dir(key), meta.raw ? 'value.bin' : 'value.json'); }
  // the value bytes when they are the ones meta describes, else null
  _value(key, meta) {
    let buf;
    try { buf = fs.readFileSync(this._valueFile(key, meta)); } catch (e) { return null; }
    return buf.length === meta.bytes && sha1(buf) === meta.sum ? buf : null;
  }
  _why(meta, ver, stamps) {
    const why = [];
    if (meta.release !== this.release) why.push('release');
    if (meta.ver !== ver) why.push('version');
    const want = cleanStamps(stamps);
    for (const n of Object.keys(Object.assign({}, meta.stamps, want)).sort()) {
      if (meta.stamps[n] === want[n]) continue;
      const w = n.split(':')[0];
      if (!why.includes(w)) why.push(w);
    }
    return why;
  }
  // remove the entry when, with every writer shut out, it is still damaged. wait 0 = skip when a writer is busy.
  _dropBad(key, wait) {
    const l = this._lock(key, wait);
    if (!l) return false;
    try {
      const m = this._meta(key);
      if (m.st === 'none' || (m.st === 'ok' && this._value(key, m.meta))) return false;
      this._rmDir(key);
      return true;
    } finally { this._unlock(l); }
  }
  // one journal line, written while the entry's lock is held so the lines of a key stand in the order of its writes
  _note(key, meta) {
    try { fs.appendFileSync(path.join(this.root, 'j.log'), JSON.stringify(meta ? rowOf(key, mini(meta)) : [key]) + '\n'); } catch (e) { /* read-only root or no store yet: a scan reads the meta */ }
  }
  _rmDir(key) {
    try { fs.rmSync(this._dir(key), { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); } catch (e) { /* held: the next reader tries again */ }
    this._note(key, null);
    this._used.delete(key);
    this._dirty();
  }
  // remove a whole entry under its lock -> bool
  _remove(key) {
    const l = this._lock(key);
    if (!l) return false;
    try { this._rmDir(key); } finally { this._unlock(l); }
    return !fs.existsSync(this._dir(key));
  }
  _touch(key) {
    const t = this.now();
    if (Math.abs(t - (this._used.get(key) || -Infinity)) < USE_MS) return;
    this._used.set(key, t);
    const f = path.join(this._dir(key), 'use');
    try { fs.utimesSync(f, t / 1000, t / 1000); } catch (e) {
      try { fs.writeFileSync(f, ''); fs.utimesSync(f, t / 1000, t / 1000); } catch (e2) { /* read-only root: no last use */ }
    }
  }

  get(section, ver, parts, stamps) { return this._read(section, ver, parts, stamps, false); }
  getRaw(section, ver, parts, stamps) { return this._read(section, ver, parts, stamps, true); }
  // the entry of these parts whatever its stamps say (same release and version only): the last answer, for a caller that shows it
  // marked as old while it makes the new one. Never a substitute for get: what it returns may describe files that have changed
  getLast(section, ver, parts) { return this._read(section, ver, parts, null, false, true); }
  _read(section, ver, parts, stamps, asBytes, anyStamps) {
    const key = this.key(section, parts);
    for (let bad = 0, waits = 0; ;) {
      const m = this._meta(key);
      if (m.st === 'none') return null;
      if (m.st === 'ok') {
        if (anyStamps ? (m.meta.release !== this.release || m.meta.ver !== ver) : this._why(m.meta, ver, stamps).length) return null;
        const buf = this._value(key, m.meta);
        if (buf && asBytes) { this._touch(key); return { buf, at: m.meta.at, bytes: m.meta.bytes, raw: m.meta.raw }; }
        if (buf) {
          let value = buf, ok = true;
          if (!m.meta.raw) { try { value = JSON.parse(buf.toString('utf8')); } catch (e) { ok = false; } }
          if (ok) { this._touch(key); return { value, at: m.meta.at, bytes: m.meta.bytes }; }
        }
      }
      // meta and value do not fit: a put of another process is between its two renames, or the entry is damaged
      // while the writer holds the lock, keep the files closed: on Windows an open meta.json blocks its rename
      if (this._locked(key)) {
        if (++waits > 3) return null;
        for (const end = Date.now() + LOCK_WAIT_MS; this._locked(key) && Date.now() < end;) sleep(2);
        continue;
      }
      if (++bad < 3) continue;
      this._dropBad(key);
      return null;
    }
  }

  state(section, ver, parts, stamps) {
    const key = this.key(section, parts), none = { state: 'none', why: [], at: null, bytes: 0 };
    const m = this._meta(key);
    if (m.st === 'none') return none;
    if (m.st === 'ok' && fs.existsSync(this._valueFile(key, m.meta))) {
      const why = this._why(m.meta, ver, stamps);
      return { state: why.length ? 'stale' : 'ready', why, at: m.meta.at, bytes: m.meta.bytes };
    }
    if (!this._locked(key)) this._dropBad(key, 0);
    return none;
  }

  put(section, ver, parts, stamps, value) {
    const key = this.key(section, parts), dir = this._dir(key);
    let buf, raw = false;
    if (Buffer.isBuffer(value)) { buf = value; raw = true; }
    else if (value instanceof Uint8Array) { buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength); raw = true; }
    else {
      let s;
      try { s = JSON.stringify(value); } catch (e) { s = undefined; }
      if (s === undefined) return { bytes: 0 };
      buf = Buffer.from(s, 'utf8');
    }
    const meta = { section, parts: parts === undefined ? null : JSON.parse(canon(parts)), ver, release: this.release,
      stamps: cleanStamps(stamps), at: this.now(), bytes: buf.length, raw, sum: sha1(buf) };
    const tdir = path.join(this.root, 't'), tag = key + '.' + process.pid + '.' + (++seq) + '.' + crypto.randomBytes(4).toString('hex');
    const tv = path.join(tdir, tag + '.v.tmp'), tm = path.join(tdir, tag + '.m.tmp');
    let l = null;
    try {
      fs.mkdirSync(tdir, { recursive: true });
      fs.writeFileSync(tv, buf);
      fs.writeFileSync(tm, JSON.stringify(meta));
      l = this._lock(key);
      if (!l) throw Object.assign(new Error('cache entry is locked'), { code: 'ELOCKED' });
      fs.mkdirSync(dir, { recursive: true });
      retry(() => fs.renameSync(tv, path.join(dir, raw ? 'value.bin' : 'value.json')));
      retry(() => fs.renameSync(tm, path.join(dir, 'meta.json')));
      try { fs.unlinkSync(path.join(dir, raw ? 'value.json' : 'value.bin')); } catch (e) { /* the entry had the same kind */ }
      this._note(key, meta);
    } catch (e) {
      for (const f of [tv, tm]) { try { fs.unlinkSync(f); } catch (e2) { /* never made or already moved */ } }
      cw.warn(e, dir);
      return { bytes: 0 };
    } finally { if (l) this._unlock(l); }
    this._used.delete(key);
    this._dirty();
    if (this._fill) { this._fill.keep = key; return { bytes: buf.length }; }   // the total is on its way (warm): the check runs when it is known
    if (this._est === null || Date.now() - this._estAt > RESCAN_MS) {
      if (this._lacking().length > SLICE) { this._est = null; this._warm(false).catch(() => {}); if (this._fill) this._fill.keep = key; return { bytes: buf.length }; }
      this._scan(false);
    } else this._est += buf.length;            // counts a replaced entry twice: at worst one scan too early
    if (this._est > this.cap) this.evict(key);
    return { bytes: buf.length };
  }

  wrap(section, ver, parts, stamps, make) {
    let fk;
    try { fk = this.key(section, parts) + '|' + JSON.stringify(ver) + '|' + JSON.stringify(cleanStamps(stamps)); } catch (e) { return Promise.reject(e); }
    const running = this._flight.get(fk);
    if (running) return running;
    const hit = this.get(section, ver, parts, stamps);
    if (hit) return Promise.resolve(hit.value);
    const p = (async () => {
      await null;                              // make starts after the call is registered, also when it throws at once
      try {
        const value = await make();
        this.put(section, ver, parts, stamps, value);
        return value;
      } finally { this._flight.delete(fk); }
    })();
    this._flight.set(fk, p);
    return p;
  }

  // ---- the whole store: index rows and sizes only ----
  // this._idx brought up to date: index.json when it is new to this process or another process saved it (or folded the
  // journal in), then the journal lines since
  _index() {
    const fi = path.join(this.root, 'index.json'), fj = path.join(this.root, 'j.log');
    const si = statOf(fi), sig = si ? si.size + ':' + si.mtimeMs : '', sj = statOf(fj), size = sj ? sj.size : 0;
    if (!this._idx || sig !== this._idxSig || size < this._j) {
      const idx = new Map(); let j = 0;
      try {
        const o = si ? JSON.parse(fs.readFileSync(fi, 'utf8')) : null;
        if (o && o.v === 1 && o.e && typeof o.e === 'object' && Number.isFinite(o.j) && o.j >= 0) {
          for (const k of Object.keys(o.e)) { const r = KEY_RE.test(k) && Array.isArray(o.e[k]) ? ofRow([k].concat(o.e[k])) : null; if (r) idx.set(k, r); }
          j = o.j <= size ? o.j : 0;           // a shorter journal was emptied since: all of it is newer than these rows
        }
      } catch (e) { idx.clear(); j = 0; }
      this._idx = idx; this._idxSig = sig; this._j = this._jSaved = j;
    }
    if (size > this._j) {
      let buf = null, fd = null;
      try { fd = fs.openSync(fj, 'r'); buf = Buffer.alloc(size - this._j); buf = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, this._j)); } catch (e) { buf = null; }
      finally { if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* closed */ } } }
      const end = buf ? buf.lastIndexOf(10) + 1 : 0;       // whole lines only: the last one may still be on its way
      if (end > 0) {
        for (const line of buf.toString('utf8', 0, end).split('\n')) {
          if (!line) continue;
          let a = null; try { a = JSON.parse(line); } catch (e) { continue; }
          if (!Array.isArray(a) || typeof a[0] !== 'string' || !KEY_RE.test(a[0])) continue;
          const r = a.length > 1 ? ofRow(a) : null;
          if (r) this._idx.set(a[0], r); else this._idx.delete(a[0]);
        }
        this._j += end;
      }
    }
    return this._idx;
  }
  // index.json again (best effort), and the journal emptied once it is long and nothing was added to it meanwhile
  _saveIndex() {
    const fi = path.join(this.root, 'index.json'), fj = path.join(this.root, 'j.log');
    const tdir = path.join(this.root, 't'), tmp = path.join(tdir, 'index.' + process.pid + '.' + (++seq) + '.tmp');
    const sj = statOf(fj), fold = this._j > J_MAX && !!sj && sj.size === this._j;
    const e = {};
    for (const [k, r] of this._idx) e[k] = rowOf(k, r).slice(1);
    try {
      fs.mkdirSync(tdir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, j: fold ? 0 : this._j, e }));
      retry(() => fs.renameSync(tmp, fi));
      if (fold) { fs.truncateSync(fj, 0); this._j = 0; }
      this._jSaved = this._j;
      const si = statOf(fi); this._idxSig = si ? si.size + ':' + si.mtimeMs : '';
    } catch (x) { try { fs.unlinkSync(tmp); } catch (e2) { /* never made */ } }
  }
  // -> [{key, meta: {section, bytes, release, at, mod?}, use}] of the complete entries, in the order of the folder
  // listing. The listing says which entries there are; their rows come from the index, and from meta.json for a key the
  // index does not have and for the VERIFY_N entries whose turn it is (a damaged one that no writer holds is removed).
  _scan(withUse) {
    let names = [];
    try { names = fs.readdirSync(path.join(this.root, 'e')); } catch (e) { /* no store yet */ }
    names = names.filter(n => KEY_RE.test(n));
    const idx = this._index(), out = [], n = names.length, have = new Set();
    const from = n ? this._cur % n : 0;
    this._cur = n ? (from + VERIFY_N) % n : 0;
    let total = 0, changed = false;
    for (let i = 0; i < n; i++) {
      const key = names[i];
      let r = idx.get(key);
      if (!r || (i - from + n) % n < VERIFY_N) {
        const m = this._meta(key);
        if (m.st !== 'ok') {
          if (m.st === 'bad' && !this._locked(key)) this._dropBad(key, 0);
          continue;                            // not counted; its row goes below and it is read again next time
        }
        const now = mini(m.meta);
        if (!r || r.section !== now.section || r.bytes !== now.bytes || r.release !== now.release || r.at !== now.at || r.mod !== now.mod) changed = true;
        idx.set(key, r = now);
      }
      let use = r.at;
      if (withUse) { try { use = Math.max(use, fs.statSync(path.join(this._dir(key), 'use')).mtimeMs); } catch (e) { /* never read */ } }
      total += r.bytes;
      have.add(key);
      out.push({ key, meta: r, use });
    }
    if (idx.size > out.length) { for (const k of [...idx.keys()]) if (!have.has(k)) idx.delete(k); changed = true; }
    if (this._idxNew) { changed = true; this._idxNew = false; }
    if ((n || this._idxSig) && (changed || this._j - this._jSaved > J_SAVE || this._j > J_MAX)) this._saveIndex();
    this._est = total; this._estAt = Date.now();
    return out;
  }

  // the listed keys the index has no row for (a scan would read each one's meta.json)
  _lacking() {
    let names = [];
    try { names = fs.readdirSync(path.join(this.root, 'e')); } catch (e) { /* no store yet */ }
    const idx = this._index();
    return names.filter(n => KEY_RE.test(n) && !idx.has(n));
  }
  warm() { return this._warm(true); }
  // hold: a caller waits for the answer, so the timer keeps the process alive; a put's own start does not
  _warm(hold) {
    if (this._fill) { if (hold && !this._fill.hold) { this._fill.hold = true; if (this._fill.t && this._fill.t.ref) this._fill.t.ref(); } return this._fill.p; }
    const sum = () => { let bytes = 0; const list = this._scan(false); for (const e of list) bytes += e.meta.bytes; return { bytes, entries: list.length }; };
    const keys = this._lacking();
    if (keys.length <= SLICE) { try { return Promise.resolve(sum()); } catch (e) { return Promise.reject(e); } }
    const fill = this._fill = { keys, i: 0, p: null, hold, t: null, fresh: 0, keep: undefined };   // keep: the key of the last put meanwhile
    const later = fn => { fill.t = setTimeout(fn, 1); if (!fill.hold && fill.t.unref) fill.t.unref(); };
    fill.p = new Promise((resolve, reject) => {
      const step = () => {
        try {
          const idx = this._index();
          for (let n = 0; n < SLICE && fill.i < keys.length; fill.i++) {
            const key = keys[fill.i];
            if (idx.has(key)) continue;        // a put, or a whole scan asked meanwhile, has it
            n++;
            const m = this._meta(key);
            if (m.st === 'ok') { idx.set(key, mini(m.meta)); this._idxNew = true; fill.fresh++; }
            else if (m.st === 'bad' && !this._locked(key)) this._dropBad(key, 0);
          }
          if (fill.i < keys.length) {
            if (this._idxNew && fill.fresh >= SLICE_SAVE) { this._saveIndex(); this._idxNew = false; fill.fresh = 0; }
            later(step);
            return;
          }
          this._fill = null;
          const r = sum();                     // every row is known now: a scan reads no more than its VERIFY_N metas
          if (this._est > this.cap) this.evict(fill.keep);   // as the put's own check would have: never the entry just written
          resolve(r);
        } catch (e) { this._fill = null; reject(e); }
      };
      later(step);
    });
    return fill.p;
  }

  stats() {
    if (!this._stats || Math.abs(Date.now() - this._stats.t) > STATS_MS) {
      const v = { bytes: 0, entries: 0, cap: this.cap, root: this.root, sections: {} };
      for (const e of this._scan(false)) {
        const s = v.sections[e.meta.section] || (v.sections[e.meta.section] = { bytes: 0, entries: 0 });
        s.bytes += e.meta.bytes; s.entries++;
        v.bytes += e.meta.bytes; v.entries++;
      }
      this._stats = { t: Date.now(), v };
    }
    return JSON.parse(JSON.stringify(this._stats.v));
  }

  _removeAll(list) {
    let removed = 0, bytes = 0;
    for (const e of list) if (this._remove(e.key)) { removed++; bytes += e.meta.bytes; }
    if (this._est !== null) this._est = Math.max(0, this._est - bytes);
    return { removed, bytes };
  }
  clear(section) {
    return this._removeAll(this._scan(false).filter(e => section === undefined || section === null || e.meta.section === section));
  }
  sweep() {
    // a kept mod walk whose folder is gone: nothing can ask for it as fresh again (lib/modtree walks before it trusts one)
    const gone = e => e.meta.section === 'modtree' && typeof e.meta.mod === 'string' && path.isAbsolute(e.meta.mod) && !fs.existsSync(e.meta.mod);
    const r = this._removeAll(this._scan(false).filter(e => e.meta.release !== this.release || gone(e)));
    const tdir = path.join(this.root, 't');
    let tmp = [];
    try { tmp = fs.readdirSync(tdir); } catch (e) { /* none */ }
    for (const n of tmp) {
      const f = path.join(tdir, n);
      try { if (Date.now() - fs.statSync(f).mtimeMs > TMP_OLD_MS) fs.unlinkSync(f); } catch (e) { /* in use or gone */ }
    }
    return { removed: r.removed };
  }
  // Order: last use (the newer of `at` and the mtime of the `use` file), then key. A last use is never older than `at`, so
  // the rows are walked by `at` and a `use` file is looked at only while a row not yet looked at could still be the
  // oldest: its `at` is not newer than the oldest last use found so far. Same entries, same order as a stat of every one.
  evict(keep) {
    const rows = this._scan(false);
    let total = this._est, removed = 0, bytes = 0;
    if (total <= this.cap) return { removed, bytes };
    rows.sort((a, b) => a.meta.at - b.meta.at || (a.key < b.key ? -1 : 1));
    const heap = [], less = (a, b) => a.use < b.use || (a.use === b.use && a.key < b.key);
    const push = e => { let i = heap.push(e) - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; const x = heap[i]; heap[i] = heap[p]; heap[p] = x; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; const x = heap[i]; heap[i] = heap[m]; heap[m] = x; i = m; }
      }
      return top;
    };
    for (let i = 0; total > this.cap;) {
      while (i < rows.length && (!heap.length || rows[i].meta.at <= heap[0].use)) {
        const e = rows[i++];
        try { e.use = Math.max(e.use, fs.statSync(path.join(this._dir(e.key), 'use')).mtimeMs); } catch (x) { /* never read */ }
        push(e);
      }
      if (!heap.length) break;
      const e = pop();
      if (e.key === keep || !this._remove(e.key)) continue;
      total -= e.meta.bytes; removed++; bytes += e.meta.bytes;
    }
    this._est = Math.max(0, total);
    return { removed, bytes };
  }
}

const opened = new Map();
function open(o = {}) {
  const root = path.resolve(o.root || testRoot() || toolcache.dir('store'));
  const k = process.platform === 'win32' ? root.toLowerCase() : root;
  let s = opened.get(k);
  if (!s) { s = new Store(Object.assign({}, o, { root })); opened.set(k, s); }
  return s;
}

module.exports = { open, CAP, canon, testRoot, isTestMain, _reset: () => { opened.clear(); } };
