// exever: which exe build is this run on. PE version alone can't tell as64 builds apart: sha256 decides. log:
//   identify(exe) -> {name, sha, short, bytes, mtime, pe}   cached per process by path+size+mtime
//   known(logText?) -> Set of sha prefixes the log records   check(exe, logText?) -> identify() + {known: bool}
// Author: Imperator_Aug (ARSENAL, ia-e5aba3b4)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { peVersionBuf } = require('./gamever');
const LOG = path.join(__dirname, '..', '..', 'modweb', 'porting', 'exe-versions.md');
const seen = new Map();

function identify(exe) {
  const st = fs.statSync(exe), key = exe + '|' + st.size + '|' + st.mtimeMs;
  if (seen.has(key)) return seen.get(key);
  const b = fs.readFileSync(exe), sha = crypto.createHash('sha256').update(b).digest('hex');
  const r = { name: path.basename(exe), sha, short: sha.slice(0, 8), bytes: st.size, mtime: st.mtime.toISOString(), pe: peVersionBuf(b) };
  seen.set(key, r);
  return r;
}

// full shas in the current table, 8-char `xxxxxxxx...` in history rows
function known(text) {
  if (text === undefined) { try { text = fs.readFileSync(LOG, 'utf8'); } catch { text = ''; } }
  const s = new Set(); let m;
  const re = /\b([0-9a-f]{64}|[0-9a-f]{8}\.\.\.)/g;
  while ((m = re.exec(text))) s.add(m[1].slice(0, 8));
  return s;
}

function check(exe, text) { const r = identify(exe); return { ...r, known: known(text).has(r.short) }; }

module.exports = { identify, known, check, LOG };
