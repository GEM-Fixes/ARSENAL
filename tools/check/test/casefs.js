// casefs: test helpers that make a file system strict about letter case on Windows too (what Linux / a case-sensitive macOS
// volume does), so the W6 P4 tests can prove a tool finds `Mods/MyMod/Mod.info` when its data says `mods/mymod/mod.info`.
//   fakeFs(list)      in-memory { readdirSync, statSync, existsSync, readFileSync } (cipath's opt.fs seam); list = paths, 'dir/' = folder
//   strict(root)      patch node's fs in place: below root a path must match the on-disk names exactly, else ENOENT / false.
//                     returns restore(). cipath and the tools use require('fs'), so they see the strict view.
//   env CASEFS_ROOT   preload form: node -r <this file> tool.js ...  (CASEFS_ROOT=root) for tools that run on require
// Used by: check, clone-entity, testrun, edrun, modmove, map-clone, portfix, doctrine, place-entity, mapgen, misgen, as2 tests.
// Author: Imperator_Aug (ARSENAL, ia-73569da8)
const fs = require('fs'), path = require('path');

const norm = p => String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '') || '/';
function fakeFs(list, data = {}) {
  const dirs = new Map(), files = new Set();
  const addDir = d => { if (!dirs.has(d)) { dirs.set(d, new Set()); const p = path.posix.dirname(d); if (p !== d) { addDir(p); dirs.get(p).add(path.posix.basename(d)); } } };
  for (const f of list) {
    if (f.endsWith('/')) { addDir(norm(f)); continue; }
    const p = norm(f); addDir(path.posix.dirname(p)); dirs.get(path.posix.dirname(p)).add(path.posix.basename(p)); files.add(p);
  }
  const enoent = p => Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' });
  const F = {
    statSync(p) { const k = norm(p); if (dirs.has(k)) return { isDirectory: () => true, isFile: () => false }; if (files.has(k)) return { isDirectory: () => false, isFile: () => true }; throw enoent(p); },
    readdirSync(p) { const k = norm(p); if (!dirs.has(k)) throw enoent(p); return [...dirs.get(k)]; },
    existsSync(p) { try { F.statSync(p); return true; } catch { return false; } },
    readFileSync(p) { const k = norm(p); if (!files.has(k)) throw enoent(p); return Buffer.from(data[k] || ''); },
  };
  return F;
}

// strict view of the real disk below root
function strict(root) {
  const R = path.resolve(root), RL = R.toLowerCase() + path.sep, orig = {};
  const listing = d => { try { return orig.readdirSync(d); } catch { return null; } };
  const ok = p => {
    if (typeof p !== 'string' && !(p instanceof URL)) return true;   // fds, buffers: leave alone
    const a = path.resolve(String(p));
    if (a.toLowerCase() === R.toLowerCase()) return a === R;
    if (!a.toLowerCase().startsWith(RL)) return true;
    if (!a.startsWith(R + path.sep)) return false;
    let cur = R;
    for (const s of a.slice(R.length + 1).split(path.sep).filter(Boolean)) {
      const L = listing(cur); if (!L || !L.includes(s)) return false;
      cur = path.join(cur, s);
    }
    return true;
  };
  const enoent = p => Object.assign(new Error('ENOENT (case-strict): ' + p), { code: 'ENOENT' });
  const wrap = (n, onBad) => { orig[n] = fs[n]; fs[n] = function (p, ...a) { return ok(p) ? orig[n].call(fs, p, ...a) : onBad(p, a); }; };
  orig.readdirSync = fs.readdirSync;
  for (const n of ['statSync', 'lstatSync', 'readFileSync', 'readdirSync', 'openSync', 'accessSync'])
    wrap(n, (p, a) => { if (a[0] && a[0].throwIfNoEntry === false) return undefined; throw enoent(p); });
  wrap('existsSync', () => false);
  return () => { for (const n of Object.keys(orig)) fs[n] = orig[n]; };
}

if (process.env.CASEFS_ROOT && require.main !== module) strict(process.env.CASEFS_ROOT);

module.exports = { fakeFs, strict, norm };
