// sdllint per-file cache (X3, 5 "Repeat checks"): the result of reading one root file (readRoot: its parse
// findings, the raw checks, the keys its includes opened) is kept between runs in lib/cachestore, section 'sdllint-files', one entry
// per folder + game + options. A later run takes a root's kept result only when, now:
//   - the root is the same file (its report name) with the same size + mtime (the run's listing, else a stat; a vfs root: its record)
//   - every file the read opened (includes, the stuff .presets the loader adds, ones that were missing) resolves to the same layer and
//     the same source: loose = report name + size + mtime; a folder pak = its name + the pak's size + mtime; vfs = layer, container,
//     entry, size, pak entry offset/size/time + the container's size + mtime; an install-root ('//') include its size + mtime;
//     missing stays missing
//   - the code is the same (sha1 of every tools/ module this process loaded) and the game stamp (lib/gameview stamp) is the same
// Anything else is read again, as without the cache. The lint pass after the reads (includers, %param lines, .mtl, GoH ranges) runs
// live on the taken + new reads, so the report is the same; two per-file facts it needs come from here: a .mtl root's OBJ-style
// test (kept with the root) and the include targets of each vfs file findIncluders scans (fc.inc, kept by the file's vfs record
// signature). A root whose read crashed is not kept.
// Off: sdllint --no-file-cache or env ARSENAL_FILE_CACHE=0. Any error here = no cache for that run (the reads happen as before).
//   open(opts, src) -> fc | null
//   fc.hits(todo) -> { got: [[i, result]], miss: [i], included: [keys] }   results as readRoot gives them (with .opens)
//   fc.pack(todo, roots) -> blob      call before lint (lint appends to finding messages)
//   fc.inc { get(key), put(key, targets) }   the findIncluders memo (sdllint lint pre.inc)
//   fc.write(blob)                    best effort
//   fc.stats {kept, read, uncached, ms, incKept, incRead}
// env SDLLINT_FC_DEBUG=1: stderr says whether the entry was found (cachestore state) and why the first 5 kept roots were read again
// Author: Imperator_Aug (ARSENAL, ia-edf6b9f2)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { relPath } = require('../lib/report');

const SECTION = 'sdllint-files', FORMAT = 2;
const WIN = process.platform === 'win32';
const low = s => (WIN ? s.toLowerCase() : s);
const offByEnv = () => process.env.ARSENAL_FILE_CACHE === '0';

// sha1 of every tools/ module loaded now (sdllint, rawchecks, lib/sdlx, lib/sdlset, lib/enc, lib/vfs, ...): a code change = all read again
function codeVer() {
  const tools = path.resolve(__dirname, '..');
  const files = Object.keys(require.cache).filter(f => low(f).startsWith(low(tools + path.sep))).map(f => path.relative(tools, f).split(path.sep).join('/')).sort();
  const h = crypto.createHash('sha1').update('format ' + FORMAT + '\n');
  for (const f of files) h.update(f + '\n').update(fs.readFileSync(path.join(tools, f))).update('\n');
  return h.digest('hex');
}
const realDir = d => { try { return fs.realpathSync.native(path.resolve(d)); } catch (e) { return path.resolve(d); } };
// the install behind a game folder (an overlay of tools/check links its resource/): parent of the real resource/
function realGame(d) {
  try { const r = fs.realpathSync.native(path.join(path.resolve(d), 'resource')); if (path.basename(r).toLowerCase() === 'resource') return path.dirname(r); } catch (e) { /* no resource/ */ }
  return realDir(d);
}

function open(opts, src) {
  if (offByEnv() || opts.fileCache === false || opts.vfs && !opts.gameDir) return null;
  const t0 = Date.now();
  try {
    const S = require('../lib/cachestore').open();
    const folder = opts.folder ? path.resolve(opts.folder) : null, game = opts.gameDir ? path.resolve(opts.gameDir) : null;
    const parts = { v: FORMAT, folder: folder ? low(realDir(folder)) : null, game: game ? low(realGame(game)) : null, exe: opts.exe || null,
      mods: opts.mods || null, scope: opts.scope || null, vfs: !!opts.vfs, gv: opts.gameVersion || null, dvc: !!opts.disableVersionControl,
      rp: opts.restorePoints != null ? !!opts.restorePoints : null };
    let gst = ''; if (game) { try { gst = require('../lib/gameview').stamp({ gameDir: game, exe: opts.exe }); } catch (e) { gst = '?'; } }
    const stamps = { game: gst }, ver = codeVer();
    // sizes + mtimes of the folder's files from the run's listing (lib/modtree scan), else a stat per file
    const L = new Map(), T = opts.listing;
    if (folder && T && Array.isArray(T.files) && !T.names && T.dir) { const D = path.resolve(T.dir); for (const r of T.files) if (r[1] >= 0) L.set(low(path.join(D, r[0])), r[1] + '|' + r[2]); }
    const statMemo = new Map();
    const statSig = p => { let s = statMemo.get(p); if (s === undefined) { try { const st = fs.statSync(p); s = st.size + '|' + st.mtimeMs; } catch (e) { s = '-'; } statMemo.set(p, s); } return s; };
    const fileSig = p => L.get(low(p)) || statSig(p);
    const G = game ? low(game + path.sep) : null, M = folder ? low(folder + path.sep) : null;
    const norm = c => { const r = path.resolve(c), l = low(r); return G && l.startsWith(G) ? 'G' + r.slice(G.length) : M && l.startsWith(M) ? 'M' + r.slice(M.length) : r; };
    const vfsSig = r => 'V' + r.layer + '|' + norm(r.container) + '|' + r.entry + '|' + r.size + '|' + (r.ent ? r.ent.off + ':' + r.ent.size + ':' + r.ent.time : '') +
      '|' + statSig(r.source === 'pak' ? r.container : path.join(r.container, r.entry));
    const memo = new Map();
    // what an open of dep (kind letter + key) gets now
    const depSig = d => {
      let s = memo.get(d); if (s !== undefined) return s;
      const key = d.slice(1);
      if (d[0] === 'f') s = 'F' + statSig(path.join(opts.gameDir || '.', key));
      else {
        const w = src.winner(key);
        if (w === 'local') { const p = src.local.get(key); s = 'L' + relPath(folder, p) + '|' + fileSig(p); }
        else if (w === 'pak') { const r = src.packed().get(key), pf = r.file.slice(0, r.file.indexOf('!')); s = 'P' + r.file + '|' + statSig(path.join(folder, pf)); }
        else if (w === 'vfs') s = vfsSig(src.v.files.get(key));
        else s = '-';
      }
      memo.set(d, s); return s;
    };
    // a root: loose folder file by its path; a vfs item by its record; anything else (a GoH pak read directly) not kept
    const rootSig = t => {
      if (t.path) return 'L' + t.file + '|' + fileSig(t.path);
      const r = src.v && t.file === t.key && src.v.files.get(t.key);
      return r ? vfsSig(r) : null;
    };
    // files a read depends on: what it opened (not '@' user paths: never read) + the .presets the loader would add to a stuff file
    const depsOf = (key, opens) => {
      const out = new Set();
      for (const o of opens) if (o[0] !== 'u') out.add(o);
      if (key.startsWith('resource/set/stuff/')) out.add('v' + key.slice(0, key.lastIndexOf('/') + 1) + '.presets');
      return [...out];
    };
    let old = null;
    try { const g = S.getRaw(SECTION, ver, parts, stamps); if (g && !g.raw) { old = JSON.parse(g.buf.toString('utf8')); if (!old || old.format !== FORMAT) old = null; } } catch (e) { old = null; }
    if (process.env.SDLLINT_FC_DEBUG) console.error('fc open', !!old, JSON.stringify(S.state(SECTION, ver, parts, stamps)), ver.slice(0, 8));
    const stats = { kept: 0, read: 0, uncached: 0, ms: 0, incKept: 0, incRead: 0 };
    const oldInc = old && old.inc && typeof old.inc === 'object' ? old.inc : null, newInc = {};
    const fc = {
      stats,
      hits(todo) {
        const got = [], miss = [], included = [];
        let dbg = 0;
        const t1 = Date.now();
        for (let i = 0; i < todo.length; i++) {
          const t = todo[i], e = old && Object.prototype.hasOwnProperty.call(old.roots, t.key) ? old.roots[t.key] : null;
          let ok = false;
          try {
            const rs = rootSig(t);
            if (rs === null) { stats.uncached++; miss.push(i); continue; }
            ok = !!e && e[0] === t.file && e[1] === rs && e[6].every(j => depSig(old.keys[j]) === old.sigs[j]);
          } catch (x) { ok = false; }
          if (!ok) {
            if (process.env.SDLLINT_FC_DEBUG && e && dbg++ < 5) { const rs = rootSig(t), bd = e[6].filter(j => depSig(old.keys[j]) !== old.sigs[j]).slice(0, 3).map(j => [old.keys[j], old.sigs[j], depSig(old.keys[j])]); console.error('fc miss', t.key, e[1] === rs ? 'root same' : [e[1], rs], JSON.stringify(bd)); }
            miss.push(i); continue;
          }
          const opens = e[5].map(j => old.keys[j]);
          const r = e[2] === 1 ? { skipped: true, opens } : {
            read: true, opens,
            list: e[3].map(j => { const f = old.finds[j]; return { file: f[0], line: f[1], code: f[2], msg: f[3], dk: f[4] }; }),
            extra: e[4].map(j => old.extra[j].slice()),
          };
          if (e[2] !== 1 && e.length > 7) r.mtlObj = !!e[7];
          for (const o of opens) included.push(o.slice(1));
          got.push([i, r]); stats.kept++;
        }
        stats.read = miss.length - stats.uncached;
        stats.ms += Date.now() - t1;
        return { got, miss, included };
      },
      pack(todo, roots) {
        const t1 = Date.now();
        const blob = { format: FORMAT, keys: [], sigs: [], finds: [], extra: [], roots: {} };
        const ki = new Map(), fi = new Map(), xi = new Map();
        const kid = d => { let j = ki.get(d); if (j === undefined) { j = blob.keys.length; blob.keys.push(d); blob.sigs.push(depSig(d)); ki.set(d, j); } return j; };
        const fid = f => { const id = f.dk + '\0' + f.code + '\0' + f.msg; let j = fi.get(id); if (j === undefined) { j = blob.finds.length; blob.finds.push([f.file, f.line, f.code, f.msg, f.dk]); fi.set(id, j); } return j; };
        const xid = x => { const id = x.join('\0'); let j = xi.get(id); if (j === undefined) { j = blob.extra.length; blob.extra.push(x.slice()); xi.set(id, j); } return j; };
        for (let i = 0; i < todo.length; i++) {
          const t = todo[i], r = roots[i];
          if (!r || !r.opens || r.crashed || !(r.skipped || r.read)) continue;
          const rs = rootSig(t); if (rs === null) continue;
          const opens = [...new Set(r.opens)];
          blob.roots[t.key] = [t.file, rs, r.skipped ? 1 : 0, r.skipped ? [] : r.list.map(fid), r.skipped ? [] : r.extra.map(xid), opens.map(kid), depsOf(t.key, opens).map(kid)];
          if (!r.skipped && r.mtlObj !== undefined) blob.roots[t.key].push(r.mtlObj ? 1 : 0);
        }
        stats.ms += Date.now() - t1;
        return blob;
      },
      // include targets of vfs files (sdllint findIncluders), by the file's vfs record: what lint asked this run is kept
      inc: {
        get(key) {
          const e = oldInc && Object.prototype.hasOwnProperty.call(oldInc, key) ? oldInc[key] : null;
          const r = src.v && src.v.files.get(key);
          if (!e || !r || e[0] !== vfsSig(r)) return undefined;
          newInc[key] = e; stats.incKept++;
          return e[1];
        },
        put(key, targets) { const r = src.v && src.v.files.get(key); if (r) newInc[key] = [vfsSig(r), targets]; stats.incRead++; },
      },
      write(blob) {
        const t1 = Date.now();
        blob.inc = newInc;
        try { S.put(SECTION, ver, parts, stamps, blob); } catch (e) { /* best effort: the next run reads again */ }
        stats.ms += Date.now() - t1;
      },
    };
    stats.ms += Date.now() - t0;
    return fc;
  } catch (e) { return null; }
}
module.exports = { open, SECTION };
