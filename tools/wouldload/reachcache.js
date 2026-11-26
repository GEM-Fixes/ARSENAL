// wouldload/reachcache: the reach scan's facts per mod text file (reach.js factsOf: the names and file tokens it gives) kept between
// runs, so a repeat check reads only the files that changed, job X2). reach.js core takes it as memo.cache.
//   open({dir, modDir, T}) -> cache | null (null: no cache folder can be made)
//     dir = the cache folder (wouldload: toolcache dir('wouldload')/reach, not --cache-dir: tools/check gives a temp one per run);
//     T = the run's lib/modtree scan of modDir (sizes and times, no stat per file) or null.
//   cache.key(k, rec) -> signature | null (null = no signature known: the file is read, as before)
//     loose: real path of its folder (junctions resolved: tools/check mounts the mod through a new overlay folder each run) + entry,
//       size, mtimeMs (from T, else one stat; the stat's size must be rec.size);
//     pak entry: real pak path, pak size + mtimeMs, entry name, size, packed size, offset, crc32.
//     + '|I' for resource/set/interaction*/ files (reach blanks their selectors before the scan). Letter case folded (Windows).
//   cache.get(sig) -> facts | null, cache.put(sig, facts), cache.save() -> {hits, misses, entries, bytes} | null: written as a
//     temp file + rename; holds only the entries this run looked up or stored. cache.stats = {hits, misses}.
//   file <dir>/reach-<sha1 of the mod's real path, 16 hex>.txt: line 1 = JSON {v: RULES, mod}, then one line per file:
//     sig TAB a TAB b TAB c TAB f (facts strings, tokens joined by \n inside facts, stored as spaces: a token has neither).
//     RULES = sha1 of reach.js + this file: any change to the scan's code drops the cache. A file of another version or mod, or
//     unreadable: an empty cache. Not part of any output.
//   limits: a file edited to the same size within the same mtime tick, or its mtime set back by hand, keeps its old facts
//     (the path + size + mtime key of the job; --no-reach-cache reads all).
// Author: Imperator_Aug (ARSENAL, ia-ed87cbac)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const RULES = (() => { const h = crypto.createHash('sha1'); for (const f of ['reach.js', 'reachcache.js']) h.update(fs.readFileSync(path.join(__dirname, f))); return h.digest('hex').slice(0, 16); })();
const fwd = p => String(p).replace(/\\/g, '/');
const real = p => { try { return fwd(fs.realpathSync.native(p)); } catch (e) { return fwd(path.resolve(p)); } };
const isInteraction = k => /^resource\/set\/interaction[^/]*\//.test(k);

function open({ dir, modDir, T } = {}) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return null; }
  const mod = real(modDir).toLowerCase();
  const file = path.join(dir, 'reach-' + crypto.createHash('sha1').update(mod).digest('hex').slice(0, 16) + '.txt');
  const old = load(file, mod), used = new Map(), stats = { hits: 0, misses: 0 };
  // T rows by real path: the listing gives each loose file's size and time without a stat
  const rows = new Map();
  if (T && Array.isArray(T.files) && !T.names) { const base = real(T.dir).toLowerCase(); for (const [rel, size, mt] of T.files) if (size >= 0) rows.set(base + '/' + String(rel).toLowerCase(), [size, mt]); }
  const reals = new Map(), realOf = p => { let r = reals.get(p); if (r === undefined) reals.set(p, r = real(p).toLowerCase()); return r; };
  const paks = new Map();
  const pakSig = c => { let s = paks.get(c); if (s === undefined) { try { const st = fs.statSync(c); s = realOf(c) + '|' + st.size + '|' + st.mtimeMs; } catch (e) { s = null; } paks.set(c, s); } return s; };
  return {
    file, stats,
    key(k, rec) {
      try {
        const I = isInteraction(k) ? '|I' : '';
        if (rec.source === 'loose') {
          const p = realOf(rec.container) + '/' + fwd(rec.entry).toLowerCase();
          let r = rows.get(p);
          if (!r) { const st = fs.statSync(path.join(rec.container, rec.entry)); r = [st.size, st.mtimeMs]; }
          if (r[0] !== rec.size) return null;
          return 'L|' + p + '|' + r[0] + '|' + r[1] + I;
        }
        if (rec.source === 'pak' && rec.ent) {
          const ps = pakSig(rec.container); if (!ps) return null;
          const e = rec.ent;
          return 'P|' + ps + '|' + String(rec.entry).toLowerCase() + '|' + e.size + '|' + e.csize + '|' + e.off + '|' + e.crc + I;
        }
      } catch (e) { /* no signature: read */ }
      return null;
    },
    get(sig) {
      const f = old.get(sig) || used.get(sig);
      if (f) { used.set(sig, f); stats.hits++; return f; }
      stats.misses++; return null;
    },
    put(sig, f) { used.set(sig, f); },
    save() {
      if (!stats.misses && used.size === old.size) return { hits: stats.hits, misses: 0, entries: used.size, bytes: 0 };   // unchanged
      const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      let fd = null, bytes = 0;
      try {
        fd = fs.openSync(tmp, 'w');
        const w = s => { const b = Buffer.from(s, 'utf8'); fs.writeSync(fd, b); bytes += b.length; };
        w(JSON.stringify({ v: RULES, mod }) + '\n');
        let chunk = '';
        for (const [sig, f] of used) {
          chunk += sig + '\t' + sp(f.a) + '\t' + sp(f.b) + '\t' + sp(f.c) + '\t' + sp(f.f) + '\n';
          if (chunk.length > 1 << 22) { w(chunk); chunk = ''; }
        }
        if (chunk) w(chunk);
        fs.closeSync(fd); fd = null;
        fs.renameSync(tmp, file);
        return { hits: stats.hits, misses: stats.misses, entries: used.size, bytes };
      } catch (e) {
        if (fd !== null) try { fs.closeSync(fd); } catch (x) { /* closed */ }
        try { fs.rmSync(tmp, { force: true }); } catch (x) { /* gone */ }
        return null;
      }
    },
  };
}
const sp = s => s.replace(/\n/g, ' '), nl = s => s.replace(/ /g, '\n');
// the cache file -> Map sig -> facts; any fault, another RULES or another mod: empty
function load(file, mod) {
  const out = new Map();
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return out; }
  try {
    let i = buf.indexOf(10); if (i < 0) return out;
    const h = JSON.parse(buf.toString('utf8', 0, i));
    if (!h || h.v !== RULES || h.mod !== mod) return out;
    for (let s = i + 1; s < buf.length; s = i + 1) {
      i = buf.indexOf(10, s); if (i < 0) return new Map();   // cut short: not trusted
      const p = buf.toString('utf8', s, i).split('\t');
      if (p.length !== 5) return new Map();
      out.set(p[0], { a: nl(p[1]), b: nl(p[2]), c: nl(p[3]), f: nl(p[4]) });
    }
  } catch (e) { return new Map(); }
  return out;
}
// on unless --no-reach-cache or env ARSENAL_REACH_CACHE=0; -> the reason it is off, or null
const offWhy = (o = {}, env = process.env) => (o.noReachCache ? '--no-reach-cache' : env.ARSENAL_REACH_CACHE === '0' ? 'ARSENAL_REACH_CACHE=0' : null);
module.exports = { open, offWhy, RULES };
