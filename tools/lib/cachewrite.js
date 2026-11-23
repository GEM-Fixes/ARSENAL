// cachewrite: best-effort tool-cache writes. In the single exe the caches live under the exe's folder, which may be read-only
// (Program Files): a failed cache mkdir/write says one line on stderr, at most once per process, and the command goes on.
//   mkdir(dir) -> bool          fs.mkdirSync(dir, {recursive}) or warn
//   write(file, data, enc?) -> bool   mkdir(dirname) + fs.writeFileSync, or warn
//   warn(err, path)              the one line: "cache not written (<code>): <path>"
// Author: Imperator_Aug (ARSENAL, ia-f4e78b4c)
const fs = require('fs'), path = require('path');
let said = false;
function warn(e, p) {
  if (said) return;
  said = true;
  console.error(`cache not written (${(e && e.code) || 'ERR'}): ${p}`);
}
function mkdir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true; } catch (e) { warn(e, dir); return false; }
}
function write(file, data, enc) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data, enc); return true; } catch (e) { warn(e, file); return false; }
}
module.exports = { mkdir, write, warn, _reset: () => { said = false; } };
