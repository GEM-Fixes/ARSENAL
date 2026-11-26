// fastread: faster reads for the folder linters strlint, movlint, fxlint, uilint 1D). Same findings.
//   listFolder(root, rp) -> Promise<T>   the mod folder listed through the thread pool, names only (lib/modtree scan shape,
//     what lib/sdlset createSource takes as o.listing); .arsenal-undo not entered unless rp. Copy of keylint's listFolder.
//   readWindow()   ARSENAL_READ_WINDOW (files read at once ahead of the walk), default 32; 0 = none (as sdllint)
//   wrap(src, ra) -> { src, item(t), done(t) }   src: the source with
//     open   each include opened once per run (a kept answer still marks the key included)
//     read   src.read over that open
//     get    the bytes of the item being walked, or of an include already opened, else src.get
//   item(t): t whose get reads the file once (from the read-ahead ra when it holds it); done(t): the walk has passed t
//   drive(gen) / driveAsync(gen)   run a check written as a generator that yields a Promise while a read-ahead file is not in
// Moves to lib/sdlset when that file is free.
// Author: Imperator_Aug (ARSENAL, ia-174076fc)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const { bomKind } = require('../lib/enc'), { relPath } = require('../lib/report');

const UNDO = '.arsenal-undo', WALK_WIN = 32;
async function listFolder(root, rp) {
  const files = [], left = [], queue = [''];
  let flying = 0, failed = false;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (failed) return;
      if (!queue.length && !flying) return resolve();
      while (queue.length && flying < WALK_WIN) {
        const rel = queue.pop(); flying++;
        fs.promises.readdir(rel ? path.join(root, rel) : root, { withFileTypes: true }).then(ents => {
          for (const e of ents) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) { if (rp || e.name.toLowerCase() !== UNDO) queue.push(r); }
            else if (e.isFile()) files.push([r]);
            else left.push(r);
          }
          flying--; pump();
        }, err => { failed = true; reject(err); });
      }
    };
    pump();
  });
  return { dir: root, files, left: left.sort() };
}

function readWindow() {
  const v = process.env.ARSENAL_READ_WINDOW;
  if (v === undefined || v === '') return 32;
  const n = Math.floor(+v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1024) : 32;
}

const VIRT = k => 'virtual\0' + k;
function wrap(src, ra) {
  const incs = new Map();
  let cur = null;   // the item being walked: { t, got, b, err }
  const curBytes = () => {
    if (!cur.got) {
      cur.got = true;
      const t = cur.t;
      try {
        let b;
        if (t.path && src.loosePath(t.key) === t.path) { const f = incs.get(VIRT(t.key)); if (f && f.buf) b = f.buf; }
        if (b === undefined && ra && t.path) b = ra.take(t.key);
        cur.b = b !== undefined ? b : t.get();
      } catch (e) { cur.err = e; }
    }
    if (cur.err) throw cur.err;
    return cur.b;
  };
  const open = (r, from) => {
    const k = r.kind + '\0' + r.key;
    if (incs.has(k)) { src.included.add(r.key); return incs.get(k); }
    let f = null;
    const p = r.kind !== 'fs' && r.kind !== 'user' ? src.loosePath(r.key) : null;
    if (p) {   // a loose folder file: the walked item's bytes, or the read-ahead's
      let b;
      if (cur && cur.t.path === p) b = curBytes();
      else if (ra) b = ra.take(r.key);
      if (b !== undefined) { src.included.add(r.key); f = { buf: b, file: relPath(src.folder, p), key: r.key }; }
    }
    if (!f) f = src.open(r, from);
    incs.set(k, f);
    return f;
  };
  const read = (t, onError) => {
    const b = t.get();
    if (b.includes(0) && !bomKind(b)) return null;
    return sdlx.read(b, { file: t.file, key: t.key, open, onError, preInclude: src.preInclude(t.key) });
  };
  const get = key => {
    if (cur && cur.t.path && src.loosePath(key) === cur.t.path) return curBytes();
    const f = incs.get(VIRT(key));
    if (f && f.buf && src.winner(key) !== 'pak') return f.buf;
    return src.get(key);
  };
  return {
    src: Object.assign({}, src, { open, read, get }),
    item(t) { cur = { t, got: false, b: undefined, err: null }; return Object.assign({}, t, { get: curBytes }); },
    done(t) { if (cur && cur.t === t) cur = null; if (ra) ra.drop(t.key); },
  };
}

function drive(g) { for (;;) { const r = g.next(); if (r.done) return r.value; } }
async function driveAsync(g) { let r = g.next(); while (!r.done) { await r.value; r = g.next(); } return r.value; }

// opts for the async run: the folder listed once (opts.listing) unless --vfs or already given; a folder that cannot be
// listed is walked by the source as before. -> { opts, ra } (ra null when the window is 0)
// ra0 (lib/modset read-once pass, the linter's ctx.js): read through it instead of an own read-ahead, and take the pass's scan
// of the folder (adopted by the thread: modtree fresh) instead of listing it again; with restore points the folder is listed
// here as before (the pass's scan leaves .arsenal-undo out)
async function prepare(opts, ra0) {
  let o = opts;
  if (opts.folder && !opts.vfs && !opts.listing) {
    const rp = opts.restorePoints != null ? !!opts.restorePoints : (() => { const was = sdlset.restorePoints(false); sdlset.restorePoints(was); return was; })();
    let T = null;
    if (ra0 && !rp) { try { T = require('../lib/modtree').fresh(path.resolve(opts.folder)); } catch (e) { T = null; } }
    if (T) o = { ...opts, listing: T };
    else try { const d = path.resolve(opts.folder); if (fs.statSync(d).isDirectory()) o = { ...opts, listing: await listFolder(d, rp) }; } catch (e) { /* walk */ }
  }
  if (ra0) return { opts: o, ra: ra0 };
  const win = readWindow();
  return { opts: o, ra: win ? sdlset.readAhead({ window: win }) : null };
}
// createSource options a linter passes on: restorePoints and listing only when given
const srcOpts = opts => ({ ...(opts.restorePoints != null ? { restorePoints: !!opts.restorePoints } : {}), ...(opts.listing ? { listing: opts.listing } : {}) });

module.exports = { listFolder, readWindow, wrap, drive, driveAsync, prepare, srcOpts };
