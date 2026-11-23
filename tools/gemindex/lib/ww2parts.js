// ww2parts: the WW2 document database, about 1 GB) kept as pieces small enough for git, and put back together.
//   <dir>/index.sqlite.parts/index.sqlite.NNN.gz   the file cut into pieces of --piece-mb raw bytes, each gzipped (no time stamp, OS byte
//                                                  0xff: the same database gives the same bytes on every machine with the same zlib)
//   <dir>/index.sqlite.parts/parts.json            format, whole file bytes + sha256, piece size, per piece name, raw, stored, sha256 (stored file)
//   <dir>/index.sqlite.joined.json                 stamp beside a joined file: sha256 + bytes of what was joined (a start compares it with
//                                                  parts.json and the file size instead of hashing 1 GB again)
// split(o)  sync, streams the database (one piece in memory at a time). Writes only inside <dir>/index.sqlite.parts; removes old pieces there
//           only when that folder's parts.json was written by ARSENAL.
// join(o)   async, streams the pieces through gunzip into <target>.part (event loop free between chunks), checks each piece, the size and
//           the whole sha256, then renames to the target and writes the stamp. Any mismatch: the .part goes, the pieces stay, the error names
//           the piece. Free space checked first (o.freeSpace(dir) injectable for tests).
// startJoin(o) / joinStatus(): one join per process; a second caller gets the running job.
// resolve(dir) -> { db: file|null, parts: info|null }: which joined file (<dir>/index.sqlite, else the per-user copy) matches the pieces.
// Author: Imperator_Aug (ARSENAL, ia-eebbd2fb)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { pipeline } = require('stream/promises');

const DB = 'index.sqlite', PARTS_DIR = 'index.sqlite.parts', PARTS_JSON = 'parts.json', STAMP = 'index.sqlite.joined.json';
const FORMAT = 1, WRITER = 'ARSENAL gemindex ww2-split';
const MB = 1048576, MAX_STORED = 48 * MB, MARGIN = 64 * MB;
const PIECE_RE = /^index\.sqlite\.(\d{3})\.gz$/;
const pieceName = i => 'index.sqlite.' + String(i + 1).padStart(3, '0') + '.gz';
const isFile = f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } };
const sizeOf = f => { try { return fs.statSync(f).size; } catch (e) { return -1; } };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = (m, extra) => Object.assign(new Error(m), { status: 400 }, extra || {});
const mb = n => (n / MB).toFixed(0);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };

// deterministic gzip: node writes MTIME 0; the OS byte depends on the build (Windows 10, Unix 3): set to 0xff (unknown)
function gz(buf) { const z = zlib.gzipSync(buf, { level: 9 }); z[9] = 0xff; return z; }

// ---- split
// split({dir, pieceMb = 45, dry}) -> {dir, parts, bytes, sha256, pieceBytes, pieces: [{name, raw, stored, sha256, wrote}], removed, wrote}
function split(o) {
  o = o || {};
  if (!o.dir) throw fail('ww2-split needs --dir <the ww2sources folder>');
  const dir = path.resolve(o.dir), file = path.join(dir, DB), pdir = path.join(dir, PARTS_DIR), pj = path.join(pdir, PARTS_JSON);
  if (!isFile(file)) throw fail('no ' + DB + ' in ' + dir);
  const pieceMb = o.pieceMb == null ? 45 : +o.pieceMb;
  const pieceBytes = o.pieceBytes ? Math.floor(+o.pieceBytes) : Math.floor(pieceMb * MB);   // pieceBytes: tests (small pieces)
  if (!(pieceBytes >= 1024) || pieceBytes > MAX_STORED) throw fail('--piece-mb must be more than 0 and at most 48 (a stored piece may not pass 48 MB)');
  const maxStored = o.maxStored || MAX_STORED;
  let old = null;
  if (fs.existsSync(pdir)) {
    old = readJson(pj);
    const ours = old && old.writer === WRITER;
    const foreign = fs.readdirSync(pdir).filter(n => n !== PARTS_JSON && !PIECE_RE.test(n) && !/\.tmp$/.test(n));
    if (!ours && fs.readdirSync(pdir).length) throw fail(pdir + ' holds files ARSENAL did not write (no ' + PARTS_JSON + ' from ww2-split); pick another folder or empty it');
    if (foreign.length) throw fail(pdir + ' holds files that are not pieces: ' + foreign.slice(0, 3).join(', '));
  }
  if (!o.dry) {
    const why = require('../../lib/writeguard').refuseWrite(pdir, { purpose: 'write the WW2 database pieces', allowGameMods: false });
    if (why) throw fail(why);
    fs.mkdirSync(pdir, { recursive: true });
  }
  const total = fs.statSync(file).size, whole = crypto.createHash('sha256'), pieces = [];
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(pieceBytes);
  try {
    for (let i = 0, at = 0; at < total; i++) {
      let n = 0;
      while (n < pieceBytes) { const r = fs.readSync(fd, buf, n, pieceBytes - n, at + n); if (!r) break; n += r; }
      if (!n) break;
      const raw = buf.subarray(0, n); whole.update(raw);
      const z = gz(raw), name = pieceName(i), dest = path.join(pdir, name), h = sha(z);
      if (z.length > maxStored) throw fail('piece ' + name + ' would be ' + (z.length / MB).toFixed(1) + ' MB stored, over the 48 MB limit: use a smaller --piece-mb');
      const p = { name, raw: n, stored: z.length, sha256: h, wrote: false };
      if (!o.dry && !(sizeOf(dest) === z.length && sha(fs.readFileSync(dest)) === h)) {
        fs.writeFileSync(dest + '.tmp', z); fs.renameSync(dest + '.tmp', dest); p.wrote = true;
      }
      pieces.push(p); at += n;
    }
  } finally { fs.closeSync(fd); }
  const res = { dir, parts: pdir, bytes: total, sha256: whole.digest('hex'), pieceBytes, pieces, removed: [], wrote: !o.dry };
  if (o.dry) return res;
  const keep = new Set(pieces.map(p => p.name));
  for (const n of fs.readdirSync(pdir)) if ((PIECE_RE.test(n) && !keep.has(n)) || /\.tmp$/.test(n)) { fs.rmSync(path.join(pdir, n), { force: true }); res.removed.push(n); }
  const json = { format: FORMAT, writer: WRITER, file: DB, bytes: total, sha256: res.sha256, pieceBytes, pieces: pieces.map(p => ({ name: p.name, raw: p.raw, stored: p.stored, sha256: p.sha256 })) };
  const text = JSON.stringify(json, null, 1) + '\n';
  if (!isFile(pj) || fs.readFileSync(pj, 'utf8') !== text) { fs.writeFileSync(pj + '.tmp', text); fs.renameSync(pj + '.tmp', pj); }
  writeStamp(file, json);   // the file just hashed is the pieces' source: it matches them
  return res;
}

// ---- reading parts.json
function readParts(dir) {
  const pj = path.join(dir, PARTS_DIR, PARTS_JSON);
  if (!isFile(pj)) return null;
  const j = readJson(pj);
  const ok = j && j.format === FORMAT && /^[0-9a-f]{64}$/.test(j.sha256 || '') && Number.isSafeInteger(j.bytes) && Array.isArray(j.pieces) && j.pieces.length &&
    j.pieces.every((p, i) => p && p.name === pieceName(i) && Number.isSafeInteger(p.raw) && Number.isSafeInteger(p.stored) && /^[0-9a-f]{64}$/.test(p.sha256 || '')) &&
    j.pieces.reduce((s, p) => s + p.raw, 0) === j.bytes;
  if (!ok) return { bad: true, file: pj, dir: path.resolve(dir) };
  return Object.assign({ file: pj, dir: path.resolve(dir), mtimeMs: fs.statSync(pj).mtimeMs }, j);
}

// ---- where the joined file goes: <dir>/index.sqlite when that folder takes a write, else per user (lib/toolcache: %LOCALAPPDATA%\ARSENAL\cache)
function userTarget(dir) {
  const key = crypto.createHash('sha1').update(path.resolve(dir).toLowerCase()).digest('hex').slice(0, 12);
  return path.join(require('../../lib/toolcache').dir('ww2sources'), key, DB);
}
function writable(dir) {
  if (require('../../lib/writeguard').refuseWrite(dir, { purpose: 'put the WW2 database together', allowGameMods: false })) return false;
  const t = path.join(dir, '.arsenal-write-test-' + process.pid);
  try { fs.writeFileSync(t, ''); fs.rmSync(t, { force: true }); return true; } catch (e) { return false; }
}
function targetFor(dir) { return writable(dir) ? path.join(path.resolve(dir), DB) : userTarget(dir); }

function writeStamp(file, pj) {
  try { fs.writeFileSync(path.join(path.dirname(file), STAMP), JSON.stringify({ sha256: pj.sha256, bytes: pj.bytes, file: path.basename(file) }) + '\n'); } catch (e) { /* read-only: the next start hashes nothing, it joins again */ }
}
// matches(file, pj): the joined file is the pieces' database: its stamp (or the ww2bundle manifest beside it) names the pieces' sha256 and
// the size agrees; or the file is newer than parts.json (a fresh ww2bundle copy: the pieces are the stale side, ww2-split again)
function matches(file, pj) {
  const size = sizeOf(file);
  if (size < 0) return false;
  const st = readJson(path.join(path.dirname(file), STAMP));
  if (st) return st.sha256 === pj.sha256 && st.bytes === size && size === pj.bytes;
  const mf = readJson(path.join(path.dirname(file), 'ww2sources.json'));
  if (mf && mf.sqliteSha256 === pj.sha256 && size === pj.bytes) return true;
  try { return fs.statSync(file).mtimeMs > pj.mtimeMs; } catch (e) { return false; }
}
// resolve(dir) -> null (no pieces here) | { db: matching joined file or null, parts: {dir, file, bytes, sha256, count, stored, bad?} }
function resolve(dir) {
  const pj = readParts(dir);
  if (!pj) return null;
  const info = { dir: pj.dir, file: pj.file, bad: !!pj.bad, bytes: pj.bytes || 0, sha256: pj.sha256 || '', count: pj.pieces ? pj.pieces.length : 0, stored: pj.pieces ? pj.pieces.reduce((s, p) => s + p.stored, 0) : 0 };
  if (pj.bad) return { db: null, parts: info };
  for (const f of [path.join(pj.dir, DB), userTarget(pj.dir)]) if (matches(f, pj)) return { db: f, parts: info };
  return { db: null, parts: info };
}

// ---- free space
async function freeOf(dir) {
  if (typeof fs.promises.statfs !== 'function') return Infinity;
  try { const s = await fs.promises.statfs(dir); return s.bavail * s.bsize; } catch (e) { return Infinity; }
}

// join({dir, out, freeSpace, onProgress, release}) -> {file, bytes, sha256, ms}
//   release(file): called before the rename (the caller closes a database it holds open on that name: Windows will not replace an open file)
async function join(o) {
  o = o || {};
  const t0 = Date.now();
  if (!o.dir) throw fail('ww2-join needs --dir <the ww2sources folder>');
  const dir = path.resolve(o.dir), pj = readParts(dir);
  if (!pj) throw fail('no ' + PARTS_DIR + '/' + PARTS_JSON + ' in ' + dir + ': nothing to put together');
  if (pj.bad) throw fail(PARTS_DIR + '/' + PARTS_JSON + ' in ' + dir + ' cannot be read (wrong format, or the piece list does not add up). Get the ww2sources folder again.');
  const pdir = path.join(dir, PARTS_DIR);
  for (const p of pj.pieces) {
    const s = sizeOf(path.join(pdir, p.name));
    if (s < 0) throw fail('The piece ' + p.name + ' is missing from ' + PARTS_DIR + '. Get the ww2sources folder again.', { piece: p.name });
    if (s !== p.stored) throw fail('The piece ' + p.name + ' has the wrong size (' + s + ' bytes, parts.json says ' + p.stored + '). Get the ww2sources folder again.', { piece: p.name });
  }
  const target = path.resolve(o.out || targetFor(dir)), tdir = path.dirname(target);
  fs.mkdirSync(tdir, { recursive: true });
  // an old joined file of ours that no longer matches: removed first (frees its space; it is not used anyway)
  if (isFile(target) && isFile(path.join(tdir, STAMP)) && !matches(target, pj)) { if (o.release) o.release(target); fs.rmSync(target, { force: true }); fs.rmSync(path.join(tdir, STAMP), { force: true }); }
  const free = await (o.freeSpace || freeOf)(tdir);
  if (free < pj.bytes + MARGIN) throw fail('Not enough free disk space to put the document index together: it needs ' + mb(pj.bytes + MARGIN) + ' MB free where it goes (' + tdir + '), and ' + mb(free) + ' MB are free. Free some space and try again.', { code: 'NO_SPACE' });
  const part = target + '.part';
  fs.rmSync(part, { force: true });
  const whole = crypto.createHash('sha256');
  let done = 0, current = null;
  const out = fs.createWriteStream(part, { flags: 'wx', highWaterMark: 4 * MB });
  const outErr = new Promise((res, rej) => out.on('error', e => { e.fromOut = true; rej(e); }));
  outErr.catch(() => {});
  try {
    for (const p of pj.pieces) {
      current = p.name;
      const stored = crypto.createHash('sha256'), rawHash = { n: 0 };
      try {
        await pipeline(
          fs.createReadStream(path.join(pdir, p.name), { highWaterMark: MB }),
          async function* (src) { for await (const c of src) { stored.update(c); yield c; } },
          zlib.createGunzip({ chunkSize: 256 * 1024 }),
          async function (src) {
            for await (const c of src) {
              whole.update(c); rawHash.n += c.length; done += c.length;
              if (!out.write(c)) await Promise.race([new Promise(r => out.once('drain', r)), outErr]);
              if (o.onProgress) o.onProgress(done, pj.bytes);
            }
          });
      } catch (e) {
        if (/ENOSPC/.test(e.code || '')) throw fail('The disk filled up while putting the document index together (' + tdir + '). Free some space and try again.', { code: 'NO_SPACE' });
        if (e.fromOut) throw fail('Could not write ' + part + ': ' + e.message);
        throw fail('The piece ' + p.name + ' is damaged (' + (e.message || e) + '). Get the ww2sources folder again.', { piece: p.name });
      }
      if (stored.digest('hex') !== p.sha256) throw fail('The piece ' + p.name + ' is damaged: its sha256 differs from parts.json. Get the ww2sources folder again.', { piece: p.name });
      if (rawHash.n !== p.raw) throw fail('The piece ' + p.name + ' unpacked to ' + rawHash.n + ' bytes, parts.json says ' + p.raw + '. Get the ww2sources folder again.', { piece: p.name });
    }
    current = null;
    await new Promise((res, rej) => { out.end(err => (err ? rej(err) : res())); });
    const h = whole.digest('hex');
    if (done !== pj.bytes || sizeOf(part) !== pj.bytes) throw fail('The joined file has ' + sizeOf(part) + ' bytes, parts.json says ' + pj.bytes + '. Get the ww2sources folder again.');
    if (h !== pj.sha256) throw fail('The joined file does not match parts.json (its sha256 differs). Every piece checked out, so parts.json itself is wrong. Get the ww2sources folder again.', { code: 'WHOLE_SHA' });
    if (o.release) o.release(target);
    fs.renameSync(part, target);
    writeStamp(target, pj);
    return { file: target, bytes: pj.bytes, sha256: h, pieces: pj.pieces.length, ms: Date.now() - t0 };
  } catch (e) {
    out.destroy();
    await new Promise(r => (out.closed ? r() : out.once('close', r)));
    fs.rmSync(part, { force: true });
    if (current && !e.piece) e.piece = current;
    throw e;
  }
}

// ---- one join per process
let JOB = null;
const pub = j => (j ? { state: j.state, dir: j.dir, done: j.done, total: j.total, doneMb: +mb(j.done), totalMb: +mb(j.total), why: j.why || '', piece: j.piece || '', ms: (j.end || Date.now()) - j.start, file: j.file || '' }
  : { state: 'idle', dir: '', done: 0, total: 0, doneMb: 0, totalMb: 0, why: '', piece: '', ms: 0, file: '' });
// startJoin({dir, out, freeSpace, release, onDone}) -> status; a running job is returned as it is (whatever dir the caller names)
function startJoin(o) {
  if (JOB && JOB.state === 'running') return pub(JOB);
  const pj = readParts(path.resolve(o.dir)) || {};
  const job = JOB = { state: 'running', dir: path.resolve(o.dir), done: 0, total: pj.bytes || 0, start: Date.now(), end: 0 };
  job.promise = join(Object.assign({}, o, { onProgress: (d, t) => { job.done = d; job.total = t; } }))
    .then(r => { job.state = 'done'; job.file = r.file; job.done = r.bytes; job.end = Date.now(); if (o.onDone) o.onDone(r); return r; },
      e => { job.state = 'failed'; job.why = e.message; job.piece = e.piece || ''; job.end = Date.now(); return null; });
  return pub(job);
}
function joinStatus() { return pub(JOB); }
function joinPromise() { return JOB ? JOB.promise : Promise.resolve(null); }
function _reset() { JOB = null; }

module.exports = { split, join, startJoin, joinStatus, joinPromise, resolve, readParts, matches, targetFor, userTarget, writable, gz, pieceName, _reset,
  DB, PARTS_DIR, PARTS_JSON, STAMP, WRITER, FORMAT, MAX_STORED, MB };
