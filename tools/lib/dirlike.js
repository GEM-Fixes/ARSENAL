// dirlike: folder tests that also accept junctions and symlinks to folders.
// Node 26 on Windows: a junction Dirent has isDirectory()=false, isSymbolicLink()=true, so `e.isDirectory()` alone skips
// junction-installed mods (as2 install --link) and junctioned game dirs.
//   isDirLike(dirent, parentDir) -> true for a real folder or a link whose target is a folder (a broken link -> false)
//   real(p)          -> realpath, or path.resolve when it does not exist
//   samePath(a, b)   -> same folder after realpath, case-insensitive (Windows)
//   overlap(a, b)    -> 'same' | 'a-in-b' | 'b-in-a' | null, after realpath, case-insensitive
// Author: Imperator_Aug (ARSENAL, ia-2f2eb847)
const fs = require('fs'), path = require('path');

function isDirLike(e, parent) {
  if (e.isDirectory()) return true;
  if (!e.isSymbolicLink()) return false;
  try { return fs.statSync(path.join(parent, e.name)).isDirectory(); } catch { return false; }
}
function real(p) {
  const r = path.resolve(p);
  try { return fs.realpathSync.native(r); } catch { /* missing: resolve the nearest existing parent */ }
  const up = path.dirname(r);
  if (up === r) return r;
  return path.join(real(up), path.basename(r));
}
const key = p => real(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
const samePath = (a, b) => key(a) === key(b);
function overlap(a, b) {
  const x = key(a), y = key(b);
  if (x === y) return 'same';
  if (x.startsWith(y + '/')) return 'a-in-b';
  if (y.startsWith(x + '/')) return 'b-in-a';
  return null;
}
module.exports = { isDirLike, real, samePath, overlap };
