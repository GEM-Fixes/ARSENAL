// hdrcache: binhdr's per-file cache, so a repeat check reads only the binaries that changed.
//   One JSON file per check scope (mods, --all, --folder, --paks, --exe; not the game dir: tools/check makes a new overlay game
//   dir each run): <toolcache binhdr>/hdr-<hash>.json   {v, code, head, conts: [container names], e: {key: {s, c, x, d, h, r, m}}}
//     s  the file's identity: loose 'L|<container#>|<entry>|<size>|<mtimeMs>' (container by its real path, links resolved),
//        pak entry 'P|<pak file name#>|<pak size>|<pak mtimeMs>|<entry>|<offset>|<crc>|<size>|<csize>|<method>' (sigOf)
//     c  the check's report calls [['add'|'info', [rel, line, code, msg]]], x the message it threw (CRASH), both before the
//        layer/--strict routing, the reach replay of PLY_MTL_MISSING and the texture-shadow check (those run live every time)
//     d  [[key, s]] other files whose bytes the check read (.def -> .mdl, .mdl -> .anm), '-' = no such file
//     h  [[key, 0|1]] names the check asked about (has: .ply -> .mtl / textures)
//     r  .mdl: the .ply names it loads (plyRefs); m  .def: the .mdl names it loads (defMdls), for the reach set
//   A check record is used only when the code hash (every module binhdr loaded), the head (game forms, map.net on/off) and s
//   match and every d and h still holds: the checks are pure functions of those, so the replay is what a read would give.
//   Not stored: a file or dep whose identity is unknown (no stat), whose mtime is within RACY_MS of the run start or later
//   (a 2 s mtime file system could hide a second edit), any read error, a report argument JSON would change.
//   Off: --no-hdr-cache or env ARSENAL_HDR_CACHE=0 (binhdr then reads as before); a cache file that fails to load or save is
//   ignored (empty cache, nothing written).
// Author: Imperator_Aug (ARSENAL, ia-77a9d189)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const VER = 1, RACY_MS = 3000;
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
const enabled = (argv, env) => !argv.includes('--no-hdr-cache') && env.ARSENAL_HDR_CACHE !== '0';
const fwd = p => p.replace(/\\/g, '/');
const low = p => { const r = fwd(path.resolve(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };

// hash of every file module m loaded (itself and all it requires, transitively), sorted by path
function codeHash(m) {
  const seen = new Set(), walk = x => { if (!x || seen.has(x.filename)) return; seen.add(x.filename); for (const k of x.children || []) walk(k); };
  walk(m);
  const h = crypto.createHash('sha1');
  for (const f of [...seen].sort()) { h.update(f.replace(/^.*[\\/]tools[\\/]/, '') + '\0'); h.update(fs.readFileSync(f)); h.update('\0'); }
  return h.digest('hex');
}
function fileFor(scope) {
  const toolcache = require('../lib/toolcache');
  return path.join(toolcache.dir('binhdr'), 'hdr-' + sha1(JSON.stringify(scope)).slice(0, 20) + '.json');
}

// open({file, code, head, files, mtimes, t0}) -> C. mtimes: Map low(abs path) -> mtimeMs (listings); others are stat'ed once
function open(o) {
  let old = null;
  try {
    const j = JSON.parse(fs.readFileSync(o.file, 'utf8'));
    if (j && j.v === VER && j.code === o.code && JSON.stringify(j.head) === JSON.stringify(o.head) && Array.isArray(j.conts) && j.e && typeof j.e === 'object') old = j;
  } catch (e) { old = null; }
  const conts = old ? old.conts.slice() : [], cidx = new Map(conts.map((c, i) => [c, i]));
  const ci = c => { let i = cidx.get(c); if (i === undefined) { i = conts.length; conts.push(c); cidx.set(c, i); } return i; };
  const ents = new Map(old ? Object.entries(old.e) : []), files = o.files, limit = o.t0 - RACY_MS;
  const memo = new Map(), racy = new Set(), pakSt = new Map();
  let dirty = false;
  // a container by its real path (tools/check builds a new overlay game dir per run, the mod and game folders linked into it)
  const realMemo = new Map(), real = c => { let r = realMemo.get(c); if (r === undefined) { try { r = fwd(fs.realpathSync.native(c)); } catch (e) { r = fwd(c); } realMemo.set(c, r); } return r; };
  const pakStat = c => { if (!pakSt.has(c)) { let s = null; try { s = fs.statSync(c); } catch (e) { s = null; } pakSt.set(c, s); } return pakSt.get(c); };
  function sigOf(key) {
    if (memo.has(key)) return memo.get(key);
    const rec = files.get(key);
    let s;
    if (!rec) s = '-';
    else if (rec.source === 'loose') {
      const abs = path.join(rec.container, rec.entry);
      let mt = o.mtimes && o.mtimes.get(low(abs));
      if (mt === undefined) { try { mt = fs.statSync(abs).mtimeMs; } catch (e) { mt = undefined; } }
      if (typeof mt === 'number' && typeof rec.size === 'number') { s = `L|${ci(real(rec.container))}|${rec.entry}|${rec.size}|${mt}`; if (mt >= limit) racy.add(key); }
    } else if (rec.ent) {
      const c = rec.container || rec.pak, st = c && pakStat(c), e = rec.ent;
      if (st) s = `P|${ci(path.basename(c))}|${st.size}|${st.mtimeMs}|${rec.entry || rec.name}|${e.off}|${e.crc}|${e.size}|${e.csize}|${e.method}`;
    }
    memo.set(key, s);
    return s;
  }
  const okSig = k => { const s = sigOf(k); return s !== undefined && !racy.has(k); };
  // a check record valid for key now, or null
  function hit(key) {
    const e = ents.get(key);
    if (!e || !e.c) return null;
    const s = sigOf(key);
    if (s === undefined || e.s !== s) return null;
    for (const [k, ds] of e.d || []) if (sigOf(k) !== ds) return null;
    for (const [k, b] of e.h || []) if ((files.has(k) ? 1 : 0) !== b) return null;
    return e;
  }
  // a fact ('r' or 'm') stored for key's current bytes, or undefined
  function fact(key, f) {
    const e = ents.get(key), s = sigOf(key);
    return e && s !== undefined && e.s === s && Array.isArray(e[f]) ? e[f] : undefined;
  }
  const entFor = key => { const s = sigOf(key); let e = ents.get(key); if (!e || e.s !== s) ents.set(key, e = { s }); dirty = true; return e; };
  const plain = a => a.every(x => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x) && !Object.is(x, -0)));
  // rec: {calls, thrown, deps: Map key -> sig, has: Map key -> 0|1, bad}; stored only when provably replayable
  function putCheck(key, r) {
    if (r.bad || !okSig(key)) return false;
    if (r.thrown && typeof r.thrown.message !== 'string') return false;
    for (const [, a] of r.calls) if (!plain(a)) return false;
    for (const [k, s] of r.deps) if (s === undefined || s !== sigOf(k) || (s !== '-' && racy.has(k))) return false;
    const e = entFor(key);
    e.c = r.calls; if (r.thrown) e.x = r.thrown.message; else delete e.x;
    e.d = [...r.deps]; e.h = [...r.has];
    return true;
  }
  function putFact(key, f, val) {
    if (!okSig(key) || !Array.isArray(val) || !val.every(x => typeof x === 'string')) return;
    entFor(key)[f] = val;
  }
  function save() {
    if (!dirty && old) return;
    try {
      for (const k of [...ents.keys()]) if (!files.has(k)) ents.delete(k);
      const out = JSON.stringify({ v: VER, code: o.code, head: o.head, conts, e: Object.fromEntries(ents) });
      fs.mkdirSync(path.dirname(o.file), { recursive: true });
      const tmp = o.file + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, o.file);
    } catch (e) { /* best effort: the next check reads again */ }
  }
  return { sigOf, hit, fact, putCheck, putFact, save, loaded: !!old, size: () => ents.size };
}

module.exports = { VER, RACY_MS, enabled, codeHash, fileFor, open, low };
