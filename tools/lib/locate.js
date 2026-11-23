// locate: a finding path -> the file that holds it, loose or inside a pak. Tools print paths relative to their root (mod folder,
// localization dir, game dir) and a packed mod's files exist only as pak entries (resource/entity.pak holds entity/...; N.pat in the
// mod root holds paths under resource/). find(abs) answers for a virtual absolute path, read(abs) returns its bytes. read-only.
//   find(abs)  -> {path, loose:true} | {path, pak, entry, ent} | null      (N.pat beats the .pak, VFS order; dirs -> null)
//   read(abs)  -> Buffer | null
//   resolve(rel, bases[]) -> first find(join(base, rel)) that answers, else null
// Author: Imperator_Aug (ARSENAL, ia-a64149a9)
const fs = require('fs'), path = require('path'), pak = require('./pak');

const LISTS = new Map();   // container -> {mtimeMs, map: lowercase entry -> ent}
function entries(file) {
  let st; try { st = fs.statSync(file); } catch (e) { return null; }
  if (!st.isFile()) return null;
  const c = LISTS.get(file);
  if (c && c.mtimeMs === st.mtimeMs) return c.map;
  let map = new Map();
  try { for (const e of pak.list(file)) if (!e.name.endsWith('/')) map.set(e.name.toLowerCase(), e); } catch (e) { map = new Map(); }
  if (LISTS.size > 64) LISTS.clear();
  LISTS.set(file, { mtimeMs: st.mtimeMs, map });
  return map;
}
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const pats = dir => { try { return fs.readdirSync(dir).filter(f => /^\d+\.pat$/i.test(f)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)); } catch (e) { return []; } };

function find(abs) {
  if (typeof abs !== 'string' || !abs) return null;
  const full = path.resolve(abs);
  if (isFile(full)) return { path: full, loose: true };
  const segs = full.split(/[\\/]+/);
  // walk up to the deepest existing folder, then try the containers that can hold the rest
  for (let k = segs.length - 1; k >= 1; k--) {
    const dir = segs.slice(0, k).join(path.sep) || path.sep, rest = segs.slice(k);
    if (!isDir(dir.endsWith(':') ? dir + path.sep : dir)) continue;
    const d = dir.endsWith(':') ? dir + path.sep : dir;
    // N.pat in a mod root: entries relative to resource/
    if (rest.length > 1 && rest[0].toLowerCase() === 'resource') {
      for (const p of pats(d)) { const m = entries(path.join(d, p)), name = rest.slice(1).join('/').toLowerCase(), e = m && m.get(name); if (e) return { path: full, pak: path.join(d, p), entry: e.name, ent: e }; }
    }
    // <dir>/<first>.pak holding <first>/... (resource/entity.pak) or the rest without <first> (mod-root resource.pak holding entity/...)
    if (rest.length > 1) { const pf = path.join(d, rest[0] + '.pak'), m = entries(pf), e = m && (m.get(rest.join('/').toLowerCase()) || m.get(rest.slice(1).join('/').toLowerCase())); if (e) return { path: full, pak: pf, entry: e.name, ent: e }; }
    // any other pak in that folder holding the rest (RobZ resource/gamelogic.pak holds set/..., script/..., properties/...)
    let paks = []; try { paks = fs.readdirSync(d).filter(f => /\.pak$/i.test(f)).sort(); } catch (e) { /* unreadable dir */ }
    for (const p of paks) { const m = entries(path.join(d, p)), e = m && m.get(rest.join('/').toLowerCase()); if (e) return { path: full, pak: path.join(d, p), entry: e.name, ent: e }; }
    return null;   // deepest existing folder reached: nothing else can hold it
  }
  return null;
}
function read(abs) {
  const f = find(abs);
  if (!f) return null;
  if (f.loose) return fs.readFileSync(f.path);
  return pak.read({ file: f.pak }, f.ent);
}
function resolve(rel, bases) {
  if (!rel || /^[-.]$/.test(rel)) return null;
  if (path.isAbsolute(rel)) return find(rel);
  for (const b of bases || []) { if (!b) continue; const f = find(path.join(b, rel)); if (f) return f; }
  return null;
}
module.exports = { find, read, resolve };
