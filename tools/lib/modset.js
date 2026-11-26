// modset: read once phase 2). One pass of a check holds one listing of the mod and reads each loose text
// file a linter asks for ONCE from disk, then hands the same bytes to every linter of the pass that asked for it and lets them
// go. Each linter runs in its own worker thread (its parse is CPU work: milint 90 s, humlint 66 s CPU on RobZ, so one thread for
// all would be slower than the child programs). The pass (disk reads, the byte store) lives in the calling thread: only I/O.
//   formOf(tool) -> path of tools/<tool>/ctx.js (the read-once module form: exports run(ctx)) | null
//   const p = pass({ folder, listing = true, window = 32, maxBytes = 256 MB, ahead = 128, own = true, prof = false })
//     folder: the mod folder: listed once (lib/modtree scan, restore points left out); every linter's thread adopts that scan,
//     so its lib/sdlset createSource and lib/gameview list the folder from it (no walk, no stat per file). listing false (or a
//     scan that fails): each linter walks as before (--restore-points: pass listing false). listing = a scan T (or a Promise of
//     one) the caller already has (doctor: wouldload's, tools/check): taken when it is a full scan of folder, else listed here.
//   p.run({ tool, file, argv, fail }) -> Promise<{ out, err, code, ok, why, oom, sec }>   one linter: a worker thread loads
//     file (its ctx.js) and awaits run(ctx); its stdout / stderr are taken as a child program's would be. ok = run resolved and
//     the thread ended with exit code 0; else why (the error, "out of memory", the exit code) and the caller runs it the old way.
//     fail (test hook): 'throw' (run throws), 'oom' (a 16 MB heap: a real out-of-memory end), 'partial' (the last stdout line
//     is held back: ok, but the output is incomplete)
//   p.reader(name) -> ra   a reader in this thread (tests, a host's own use)
//   ra.add(key, file, { start, end })   a range read: only bytes [start, end) of file (cut at its end; headers, 32 KB pages):
//     shared by every reader that adds the same file and range; ra.size(key) -> the whole file's size once the bytes are held
//     (before take; any read), else undefined
//   p.stats -> { readers, files, reads, own, evicted, rereads, shared, bytes, peak, failed, listing }   (listing = handed |
//     scanned | none: where the pass's listing came from, once known; shared = files handed to more than one reader; reads =
//     by the store, own = by a reader itself (counted at its close); evicted = files a full store let go for slower readers;
//     rereads = a file read again because a reader asked after every earlier one had let it go; peak = most bytes held)
//   p.prof() -> (prof: true) this thread's load during the pass: { elu, activeMs, lagP50, lagP99, lagMax, readMsAvg } (doctor
//     DOCTOR_RO_STATS); run() results then carry prof: the linter thread's { wall, cpu, idle, waitMs, waits, heap } + its reads
//   p.close()   after the last run: drop every byte and port
// ctx (what run(ctx) gets): { tool, argv, listing, reader() }   argv = the arguments its CLI would get (parse them the CLI's
//   way); reader() = a lib/sdlset readAhead stand-in (add wait take drop close stats, same meaning) backed by the pass; output
//   = console / process.stdout as in the CLI. A linter that throws, exits or runs out of memory leaves its result to the caller.
// Store rules (RO-E: no reader ever waits for another): a file is read when a reader waits for it (always started, as
//   readAhead), or ahead of the readers, round-robin over them, each in its own add order (= listing order) and at most `ahead`
//   files in front of where it is, window reads at a time, while the bytes held are under maxBytes. Prefetch starts when every
//   reader of the pass has added its files (its first wait, or close); then a file only ONE reader wants is handed back to it
//   ('own': it reads it itself, ahead in its add order, 32 at a time, under 64 MB not taken: milint's 2.4 GB of map.net on
//   RobZ never sits in the shared store), and so is a late add nobody else wants. A read file goes at once to the readers that
//   asked for it or have it within `ahead`; the others get it when they ask. Bytes stay until every reader that added the file
//   took or dropped it, unless the store is full: then the oldest files some reader has taken go and the slower readers read
//   them themselves later (OS cache); a need over 2 x maxBytes is handed back the same way. Bytes cross threads as a
//   SharedArrayBuffer, copied at take (own reads: the reader's Buffer, no copy). own false / ARSENAL_RO_OWN=0: every file
//   through the store, delivered at once (the way before RO-E, for measuring).
// Author: Imperator_Aug (ARSENAL, ia-5df9a363)
const fs = require('fs'), fsp = fs.promises, path = require('path');
const { Worker, MessageChannel, isMainThread, workerData, parentPort } = require('worker_threads');

// T is a full lib/modtree scan (names, sizes, times) of dir: the listing a caller hands over (pass listing: T | Promise<T>)
const fullScanOf = (T, dir) => {
  if (!T || typeof T !== 'object' || !T.dir || T.names || !Array.isArray(T.files) || !Array.isArray(T.left)) return false;
  const A = path.resolve(T.dir), B = path.resolve(dir);
  return process.platform === 'win32' ? A.toLowerCase() === B.toLowerCase() : A === B;
};
const formOf = tool => { const f = path.join(__dirname, '..', String(tool), 'ctx.js'); return /^[a-z0-9_-]+$/i.test(String(tool)) && fs.existsSync(f) ? f : null; };

// the file's bytes, or with range [start, end) only those (cut at the end of the file); size = the whole file's size
async function readSab(file, range) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat(), a = range ? Math.min(range[0], size) : 0, n = range ? Math.max(0, Math.min(range[1], size) - a) : size;
    const sab = new SharedArrayBuffer(n), u = new Uint8Array(sab);
    let off = 0;
    while (off < n) { const { bytesRead } = await fh.read(u, off, n - off, a + off); if (!bytesRead) break; off += bytesRead; }
    return { sab, len: off, size };
  } finally { await fh.close(); }
}
const rangeOf = r => (r && Number.isFinite(+r.start) && Number.isFinite(+r.end) && +r.start >= 0 && +r.end >= +r.start ? [Math.floor(+r.start), Math.floor(+r.end)] : null);

// the same bytes as readSab, into a Buffer of this thread (an own read: no copy at take)
async function readBuf(file, range) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat(), a = range ? Math.min(range[0], size) : 0, n = range ? Math.max(0, Math.min(range[1], size) - a) : size;
    const b = Buffer.allocUnsafeSlow(n);
    let off = 0;
    while (off < n) { const { bytesRead } = await fh.read(b, off, n - off, a + off); if (!bytesRead) break; off += bytesRead; }
    return { buf: off < n ? b.subarray(0, off) : b, size };
  } finally { await fh.close(); }
}

// the reader side (a linter's thread or this one): the readAhead interface over a port to the pass. A file the pass hands back
// ('own': no other reader wants it, or the store is full) this reader reads itself, ahead in its add order (OWN_WIN at a time,
// under OWN_CAP bytes read and not taken), so it never waits behind another reader
const OWN_WIN = 32, OWN_CAP = 64 * 1024 * 1024;
function reader(port) {
  const ents = new Map(), own = [], stats = { added: 0, read: 0, taken: 0, failed: 0, dropped: 0, peak: 0, own: 0, waits: 0, waitMs: 0 };
  let closed = false, held = 0, pending = 0, since = 0, oCur = 0, oFly = 0, oHeld = 0;
  const unwait = () => { if (--pending === 0) stats.waitMs += Date.now() - since; };
  const arrived = e => { if (e.res) { const r = e.res; e.res = null; r(); unwait(); } };
  const readOwn = e => {
    e.st = 1; oFly++;
    readBuf(e.file, e.range).then(({ buf, size }) => {
      oFly--; e.st = 2;
      if (!e.gone) { e.buf = buf; e.len = buf.length; e.size = size; held += e.len; oHeld += e.len; stats.read++; stats.own++; if (held > stats.peak) stats.peak = held; }
      arrived(e); pumpOwn();
    }, () => { oFly--; e.st = 2; if (!e.gone) stats.failed++; arrived(e); pumpOwn(); });
  };
  const pumpOwn = () => {
    while (!closed && oFly < OWN_WIN && oHeld < OWN_CAP && oCur < own.length) { const e = own[oCur++]; if (e.st === 0 && !e.gone) readOwn(e); }
    if (oCur > 4096 && oCur === own.length) { own.length = 0; oCur = 0; }
  };
  port.on('message', m => {
    const e = ents.get(m.key); if (!e || e.st !== 0 || e.own) return;
    if (m.t === 'own') { e.own = true; e.file = m.file; e.range = m.range; if (e.res) readOwn(e); else { own.push(e); pumpOwn(); } return; }
    e.st = 2;
    if (m.t === 'got') { e.sab = m.sab; e.len = m.len; e.size = m.size; held += m.len; stats.read++; if (held > stats.peak) stats.peak = held; } else stats.failed++;
    arrived(e);
  });
  const forget = (key, e) => {
    if (e.sab || e.buf) { held -= e.len; if (e.buf) oHeld -= e.len; e.sab = null; e.buf = null; }
    e.gone = true; ents.delete(key);
    if (e.own) pumpOwn();
  };
  return {
    stats,
    add(key, file, range) { if (closed || ents.has(key) || !file) return; ents.set(key, { st: 0, sab: null, buf: null, len: 0, size: undefined, p: null, res: null, own: false, gone: false }); stats.added++; port.postMessage({ t: 'add', key, file, range: rangeOf(range) }); },
    size(key) { const e = ents.get(key); return e && e.st === 2 && (e.sab || e.buf) ? e.size : undefined; },
    wait(key) {
      const e = ents.get(key);
      if (!e || closed || e.st === 2) return null;
      if (!e.p) {
        e.p = new Promise(r => { e.res = r; }); stats.waits++; if (pending++ === 0) since = Date.now();
        if (!e.own) port.postMessage({ t: 'need', key }); else if (e.st === 0) readOwn(e);
      }
      return e.p;
    },
    take(key) {
      const e = ents.get(key);
      if (!e || e.st !== 2 || !(e.sab || e.buf)) return undefined;
      const b = e.buf || Buffer.from(new Uint8Array(e.sab, 0, e.len));
      forget(key, e); stats.taken++; if (!e.own) port.postMessage({ t: 'took', key });
      return b;
    },
    drop(key) { const e = ents.get(key); if (!e) return; forget(key, e); stats.dropped++; if (!e.own) port.postMessage({ t: 'drop', key }); },
    close() { if (closed) return; closed = true; for (const e of ents.values()) { e.gone = true; if (e.res && e.st !== 2) arrived(e); } ents.clear(); held = 0; oHeld = 0; own.length = 0; port.postMessage({ t: 'close', own: stats.own }); port.unref(); },
  };
}

function pass(o = {}) {
  const AHEAD = o.ahead || 128, win = o.window || +process.env.ARSENAL_READ_WINDOW || 32, cap = o.maxBytes || 256 * 1024 * 1024, hard = 2 * cap;
  const byFile = new Map(), clients = new Map(), needQ = [], limbo = new Set();
  const stats = { readers: 0, files: 0, reads: 0, own: 0, evicted: 0, rereads: 0, shared: 0, bytes: 0, peak: 0, failed: 0, listing: 'none' };
  let flying = 0, held = 0, ids = 0, rr = 0, closed = false, readMs = 0, swept = o.own === false || process.env.ARSENAL_RO_OWN === '0';   // own off: every read through the store (as before RO-E)
  const big = [], ownOff = swept, behind = new Set();   // behind: read, taken by a reader, still wanted by a slower one
  const folder = o.folder ? path.resolve(o.folder) : null;
  const scan = () => require('./modtree').scan(folder).catch(() => null).then(T => { stats.listing = T ? 'scanned' : 'none'; return T; });
  const listingP = !folder || o.listing === false ? Promise.resolve(null)
    : o.listing && o.listing !== true ? Promise.resolve(o.listing).catch(() => null).then(T => (fullScanOf(T, folder) ? (stats.listing = 'handed', T) : scan()))
    : scan();

  const allReady = () => { for (const c of clients.values()) if (!c.closed && !c.ready) return false; return true; };
  const send = (c, m) => { try { c.port.postMessage(m); } catch (x) { /* port gone: the thread ended */ } };
  const deliver = (e, id) => {
    const c = clients.get(id); if (!c || c.closed) return;
    if (e.sent.has(id)) return;
    c.bytes += e.len; e.sent.add(id); e.out++; if (e.sent.size === 2) stats.shared++;
    send(c, { t: 'got', key: e.want.get(id), sab: e.sab, len: e.len, size: e.size });
  };
  const free = e => {
    if (e.counted) { held -= e.len; e.counted = false; }
    e.sab = null; e.dead = true;
    if (byFile.get(e.id) === e) byFile.delete(e.id);
  };
  // nobody wants e now. Until every reader has added its files, read bytes are kept (under maxBytes) for a reader that has not
  // asked yet; the rest go once all are ready
  const unwanted = e => { if (!allReady() && e.st === 2 && e.sab && held < cap) limbo.add(e); else free(e); };
  const release = (e, c) => {
    if (!e.want.has(c.id)) return;
    e.want.delete(c.id); c.used++; if (e.sent.has(c.id)) { e.out--; e.took++; }
    if (!e.want.size) unwanted(e); else if (e.took && e.sab && !ownOff) behind.add(e);
    pump();
  };
  const start = e => {
    e.st = 1; flying++;
    const r0 = Date.now();
    readSab(e.file, e.range).then(({ sab, len, size }) => {
      flying--; e.st = 2; stats.reads++; stats.bytes += len; readMs += Date.now() - r0;
      if (e.dead || !e.want.size || closed) { free(e); return pump(); }
      e.sab = sab; e.len = len; e.size = size; e.counted = true; held += len; if (held > stats.peak) stats.peak = held;
      if (o.prof && len > 4e6 && big.length < 20) big.push([e.file, len, [...e.want.keys()].map(id => clients.get(id) && clients.get(id).name)]);
      for (const id of [...e.want.keys()]) if (ownOff || e.asked.has(id) || near(clients.get(id), e)) deliver(e, id);   // the others get it when they ask (need)
      pump();
    }, () => {
      flying--; e.st = 2; stats.failed++;
      for (const [id, key] of e.want) { const c = clients.get(id); if (c) { c.keys.delete(key); send(c, { t: 'fail', key }); } }
      e.want.clear(); free(e); pump();
    });
  };
  // e is in c's next AHEAD files (its add order, counted from the files it is done with): read for it and handed over at once
  const near = (c, e) => !!c && !c.closed && e.idx.has(c.id) && e.idx.get(c.id) < c.used + AHEAD;
  // the next file to read ahead: round-robin over the readers, each in its own add order, at most AHEAD files in front of it
  const nextAhead = () => {
    const cs = [...clients.values()];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[(rr + i) % cs.length];
      if (c.closed) continue;
      while (c.cur < c.order.length && c.cur < c.used + AHEAD) { const e = c.order[c.cur]; if (e.st === 0 && !e.dead && e.want.has(c.id)) { rr = (rr + i + 1) % cs.length; return e; } c.cur++; }
    }
    return null;
  };
  // c reads e itself (lib/modset reader 'own'): e is no longer the store's business for c
  const handOver = (c, e) => {
    const key = e.want.get(c.id); if (key === undefined) return;
    e.want.delete(c.id); c.keys.delete(key); c.handed++; c.used++;
    send(c, { t: 'own', key, file: e.file, range: e.range });
    if (!e.want.size) unwanted(e);
  };
  function pump() {
    if (closed) return;
    for (let i = 0; i < needQ.length;) {
      const [c, e] = needQ[i];
      needQ.splice(i, 1);
      if (e.st !== 0 || e.dead || !e.want.has(c.id) || c.closed) continue;
      if (held >= hard && !ownOff) { c.pressed++; handOver(c, e); continue; }   // the store is full (slow readers hold bytes): c reads it itself, nobody waits
      start(e);
    }
    if (!allReady()) return;
    if (!swept) {   // every reader has added its files: one only one reader wants, that reader reads itself (ahead, in its own order)
      swept = true;
      for (const e of byFile.values()) if (e.st === 0 && !e.dead && e.want.size === 1) handOver(clients.get(e.want.keys().next().value), e);
    }
    if (limbo.size) { for (const e of limbo) if (!e.want.size) free(e); limbo.clear(); }
    // the store is full: the oldest files a reader has taken and a slower one still wants go; the slower one reads them itself later
    // (OS cache), so the readers in front never wait for it (no head-of-line). A file handed out and not yet taken stays
    if (held >= cap && behind.size) for (const e of behind) {
      if (held < cap * 0.75) break;
      if (e.dead || !e.sab || !e.want.size) { behind.delete(e); continue; }
      if (e.out) continue;
      behind.delete(e); stats.evicted++;
      for (const id of [...e.want.keys()]) { const c = clients.get(id); if (c) { c.evicted++; handOver(c, e); } }
    }
    while (flying < win && held < cap) { const e = nextAhead(); if (!e) break; start(e); }
  }
  const onMsg = (c, m) => {
    if (closed || c.closed) return;
    if (m.t === 'add') {
      if (c.keys.has(m.key)) return;
      const range = m.range || null, id = range ? m.file + '\0' + range[0] + '-' + range[1] : m.file;   // a range is its own entry
      let e = byFile.get(id);
      // the same file under two keys of one reader: the second key reads it itself, told so ('own'); a bare return here left that
      // key unanswered, so its wait never settled and the pass hung (seeded in lib/test/modset.test.js 'one file, two keys')
      if (e && e.want.has(c.id)) { c.handed++; return send(c, { t: 'own', key: m.key, file: m.file, range }); }
      const fresh = !e;
      if (!e) { if (m.file && clients.size && [...clients.values()].some(x => x.seen.has(id))) stats.rereads++; else stats.files++; e = { id, file: m.file, range, st: 0, sab: null, len: 0, size: 0, want: new Map(), sent: new Set(), asked: new Set(), idx: new Map(), out: 0, took: 0, counted: false, dead: false }; byFile.set(id, e); }
      c.seen.add(id);
      e.want.set(c.id, m.key); c.keys.set(m.key, e); limbo.delete(e);
      if (fresh && swept && c.ready && !ownOff) return handOver(c, e);   // a late add nobody else has asked for: c reads it itself
      e.idx.set(c.id, c.order.length); c.order.push(e);
      if (e.st === 2 && e.sab && ownOff) deliver(e, c.id);
      pump();
    } else if (m.t === 'need') {
      c.ready = true;
      const e = c.keys.get(m.key); c.needs++;
      if (e) e.asked.add(c.id);
      if (e && e.st === 0) { c.cold++; needQ.push([c, e]); } else if (e && e.st === 2 && e.sab) deliver(e, c.id);
      pump();
    } else if (m.t === 'took' || m.t === 'drop') {
      const e = c.keys.get(m.key); if (!e) return;
      c.keys.delete(m.key); release(e, c);
    } else if (m.t === 'close') { stats.own += m.own || 0; closeClient(c); }
  };
  const closeClient = c => {
    if (c.closed) return;
    c.closed = true; c.ready = true;
    for (const e of c.keys.values()) { if (e.want.has(c.id)) { e.want.delete(c.id); if (e.sent.has(c.id)) e.out--; if (!e.want.size) unwanted(e); } }
    c.keys.clear(); c.order = [];
    try { c.port.close(); } catch (x) { /* closed */ }
    pump();
  };
  const client = (name, port) => {
    const c = { id: ++ids, name, port, keys: new Map(), order: [], cur: 0, used: 0, ready: false, closed: false, seen: new Set(), handed: 0, pressed: 0, evicted: 0, needs: 0, cold: 0, bytes: 0 };
    clients.set(c.id, c); stats.readers++;
    port.on('message', m => onMsg(c, m));
    return c;
  };

  function run({ tool, file, argv = [], fail } = {}) {
    const t0 = Date.now(), ch = new MessageChannel(), c = client(tool, ch.port1);
    return listingP.then(listing => new Promise(res => {
      let out = '', err = '', code = null, why = null, oom = false, done = false, left = 3, prof = null;
      const end = () => { if (--left) return; closeClient(c); res({ out, err, code, ok: done && code === 0 && !why, why: why || (done ? (code ? `exit ${code}` : null) : `ended before run(ctx) finished (exit ${code})`), oom, sec: (Date.now() - t0) / 1000,
        prof: prof && { ...prof, handed: c.handed, pressed: c.pressed, evicted: c.evicted, needs: c.needs, cold: c.cold, files: c.seen.size, bytes: c.bytes } }); };
      let w;
      try {
        w = new Worker(__filename, { workerData: { modset: { tool, file, argv, listing: listing && folder ? listing : null, port: ch.port2, fail: fail || null } }, transferList: [ch.port2], stdout: true, stderr: true,
          ...(fail === 'oom' ? { resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 } } : {}) });
      } catch (x) { closeClient(c); return res({ out: '', err: '', code: null, ok: false, why: 'no worker thread: ' + x.message, oom: false, sec: 0 }); }
      w.stdout.setEncoding('utf8'); w.stderr.setEncoding('utf8');
      w.stdout.on('data', d => { out += d; }); w.stderr.on('data', d => { err += d; });
      w.stdout.on('end', end); w.stderr.on('end', end);
      // a linter whose run(ctx) has ended but that left a timer, server or watcher open never lets its thread end: 2 s after done or
      // fail the thread is ended (code 1, ok false), so the caller runs that linter as its own program instead of waiting for ever
      const reap = () => setTimeout(() => { w.terminate().catch(() => {}); }, 2000).unref();
      w.on('message', m => { if (m && m.prof) prof = m.prof; if (m && m.t === 'done') { done = true; reap(); } else if (m && m.t === 'fail') { why = m.why || 'run(ctx) failed'; reap(); } });
      w.on('error', x => { oom = oom || x.code === 'ERR_WORKER_OUT_OF_MEMORY'; why = why || (oom ? 'out of memory' : (x && x.message) || String(x)); });
      w.on('exit', k => { code = k; end(); });
    }));
  }
  // o.prof: this thread's load while the pass runs (event loop utilization, loop delay), for DOCTOR_RO_STATS
  const PH = o.prof && require('perf_hooks'), elu0 = PH && PH.performance.eventLoopUtilization(), lag = PH && PH.monitorEventLoopDelay({ resolution: 20 });
  if (lag) lag.enable();
  return {
    stats, run,
    prof() {
      if (!PH) return null;
      const e = PH.performance.eventLoopUtilization(elu0), ms = n => Math.round(n / 1e6);
      return { elu: +e.utilization.toFixed(3), activeMs: Math.round(e.active), lagP50: ms(lag.percentile(50)), lagP99: ms(lag.percentile(99)), lagMax: ms(lag.max), readMsAvg: stats.reads ? +(readMs / stats.reads).toFixed(1) : 0, big };
    },
    reader(name = 'reader') { const ch = new MessageChannel(); client(name, ch.port1); return reader(ch.port2); },
    close() { closed = true; if (lag) lag.disable(); for (const c of clients.values()) { c.closed = true; try { c.port.close(); } catch (x) { /* closed */ } } byFile.clear(); held = 0; },
  };
}

// a linter's thread: adopt the pass's listing, run(ctx), say done
if (!isMainThread && workerData && workerData.modset) {
  const W = workerData.modset;
  if (W.listing) require('./modtree').adopt(W.listing);
  const ra = reader(W.port);
  const ctx = { tool: W.tool, argv: W.argv.slice(), listing: W.listing, reader: () => ra };
  if (W.fail === 'partial') {   // test hook: the "N findings" line is held back (an output cut short)
    const log = console.log;
    console.log = (...a) => { if (!/^\d+ findings$/.test(a.join(' '))) log(...a); };
  }
  // what the pass's stats show per linter: this thread's CPU, its idle time (waiting on the pass or its own I/O), time in ra.wait
  const { performance } = require('perf_hooks'), v8 = require('v8'), t0 = Date.now();
  let heap = 0;
  const hs = setInterval(() => { const h = v8.getHeapStatistics().total_heap_size; if (h > heap) heap = h; }, 500); hs.unref();
  const prof = () => { const u = process.threadCpuUsage ? process.threadCpuUsage() : { user: 0, system: 0 }, e = performance.eventLoopUtilization();
    return { wall: Date.now() - t0, cpu: Math.round((u.user + u.system) / 1000), idle: Math.round(e.idle), waitMs: ra.stats.waitMs, waits: ra.stats.waits, heap: Math.max(heap, v8.getHeapStatistics().total_heap_size) }; };
  (async () => {
    if (W.fail === 'throw') throw new Error('forced failure (test hook)');
    if (W.fail === 'oom') { const a = []; for (;;) a.push(new Array(1e5).fill(a.length)); }
    await require(W.file).run(ctx);
  })().then(() => { ra.close(); W.port.unref(); clearInterval(hs); parentPort.postMessage({ t: 'done', prof: prof() }); },
    e => { ra.close(); W.port.unref(); clearInterval(hs); parentPort.postMessage({ t: 'fail', why: (e && e.message) || String(e) }); process.exitCode = 70; });
}

module.exports = { formOf, pass, reader };
