// exestr: ASCII + UTF-16LE NUL-delimited strings of an exe -> identifier set (SDL keys the exe knows) + dir hints (user-dir names).
//   info(exe) -> {idents:Set(lowercase), hints:[string], cached}   cache: <per-user cache>/modmove/<name>-<size>-<mtimeMs>.json
// A whole-string match is only candidate evidence: [I] (an exe string list is not proof the key is read).
// Author: Imperator_Aug (ARSENAL, ia-e9e53d98)
const fs = require('fs'), path = require('path');
const CACHE = path.resolve(__dirname, '..', 'cache');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{1,47}$/, TAIL = /[A-Za-z_][A-Za-z0-9_]{1,47}$/;
const HINT = /gates of hell|call to arms|my games|men of war|documents/i;

function scan(buf) {
  const idents = new Set(), hints = new Set();
  const take = s => {
    if (s.length < 2) return;
    if (IDENT.test(s)) idents.add(s.toLowerCase());
    else if (HINT.test(s) && s.length <= 120) hints.add(s);
    else { const m = TAIL.exec(s); if (m && !/\s/.test(s)) idents.add(m[0].toLowerCase()); } // code bytes can run into a string with no NUL: mowas_2 `PwV=weapon_bullet`
  };
  // ASCII runs
  let st = -1;
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0;
    if (c >= 0x20 && c < 0x7f) { if (st < 0) st = i; }
    else { if (st >= 0 && c === 0 && i - st >= 2) take(buf.toString('latin1', st, i)); st = -1; }
  }
  // UTF-16LE runs (char, 0, char, 0 ... 0, 0)
  st = -1;
  for (let i = 0; i + 1 <= buf.length; i += 1) {
    const c = buf[i], z = i + 1 < buf.length ? buf[i + 1] : 1;
    if (c >= 0x20 && c < 0x7f && z === 0) { if (st < 0) st = i; i++; }
    else {
      if (st >= 0 && (i - st) / 2 >= 3 && c === 0 && z === 0) {
        let s = ''; for (let k = st; k < i; k += 2) s += String.fromCharCode(buf[k]);
        take(s);
      }
      st = -1;
    }
  }
  return { idents, hints: [...hints].slice(0, 200) };
}

function info(exe) {
  const st = fs.statSync(exe), key = path.basename(exe).replace(/\W+/g, '_') + '-' + st.size + '-' + Math.floor(st.mtimeMs) + '-v2';
  const cf = require('../../lib/toolcache').file('modmove', key + '.json', CACHE);   // per-user cache; old file in CACHE copied over
  if (fs.existsSync(cf)) {
    try { const j = JSON.parse(fs.readFileSync(cf, 'utf8')); return { idents: new Set(j.idents), hints: j.hints, cached: true }; } catch { /* rebuild */ }
  }
  const r = scan(fs.readFileSync(exe));
  require('../../lib/cachewrite').write(cf, JSON.stringify({ v: 1, idents: [...r.idents], hints: r.hints }));   // best effort: one stderr line on failure
  return { idents: r.idents, hints: r.hints, cached: false };
}

// candidate user-dir folder names under My Games from the exe's own strings (goh live). order: strings mentioning the title, shortest first
function userDirCandidates(exe) {
  const h = info(exe).hints, out = [];
  for (const s of h) {
    if (/[\\/]|x64|\(|%|\.log/i.test(s) || /^my games$/i.test(s)) continue;
    if (/gates of hell|call to arms/i.test(s) && !out.includes(s)) out.push(s);
  }
  return out.sort((a, b) => a.length - b.length);
}
module.exports = { info, scan, userDirCandidates };
