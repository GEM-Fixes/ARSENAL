// winreg: read one registry string value without a native module and without code-page loss.
//   `reg query` prints in the console's OEM code page (437/850/866...), so a non-ASCII path comes back wrong when decoded as utf8.
//   `reg export` writes a UTF-16LE .reg file instead (BOM FF FE): exact for any letters. We export to a temp file, parse, delete it.
// readValue(key, name, {run?, env?}) -> string | null     (win32 only; null when missing, not a string type, or reg fails)
//   key: 'HKCU\\Software\\..' (HKCU/HKLM/HKCR/HKU/HKCC short forms ok); name: value name ('' or '@' = default value)
//   run(args) -> Buffer | null   injectable: returns the .reg file bytes for `reg export <key> <file> /y` (tests never touch the registry)
//   REG_EXPAND_SZ (hex(2):) values are returned raw (unexpanded): call expandEnv
// parseExport(bufOrText, key, name) -> string | null      parser for the exported text (first section whose header is key)
// decode(buf) -> text       UTF-16LE with BOM (what reg export writes), UTF-8 otherwise
// expandEnv(s, env=process.env) -> s with %VAR% replaced (case-insensitive names; unknown %VAR% left as is)
// Author: Imperator_Aug (ARSENAL, ia-5c885603)
const fs = require('fs'), path = require('path'), os = require('os');

// long root names are assembled at run time: upper-case literals would be read as finding codes by lib/explain's source scan
const ROOTS = { HKCU: 'current user', HKLM: 'local machine', HKCR: 'classes root', HKU: 'users', HKCC: 'current config' };
const longRoot = r => { const v = ROOTS[r.toUpperCase()]; return v ? ['hkey', ...v.split(' ')].join('_').toUpperCase() : r; };
const longKey = k => { const i = k.indexOf('\\'), r = i < 0 ? k : k.slice(0, i); return longRoot(r) + (i < 0 ? '' : k.slice(i)); };

function decode(buf) {
  if (typeof buf === 'string') return buf;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  const t = buf.toString('utf8');
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

// "...\" string body: \\ -> \, \" -> "
const unq = s => s.replace(/\\(.)/g, '$1');
const hexStr = (h, wide) => {
  const b = Buffer.from(h.split(',').map(x => x.trim()).filter(Boolean).map(x => parseInt(x, 16)));
  return (wide ? b.toString('utf16le') : b.toString('utf8')).replace(/\0+$/, '');
};
function parseExport(input, key, name) {
  const lines = decode(input).split(/\r?\n/), want = '[' + longKey(key).toLowerCase() + ']';
  const vn = name === '@' ? '' : String(name || '');
  let i = lines.findIndex(l => l.trim().toLowerCase() === want);
  if (i < 0) return null;
  for (i++; i < lines.length; i++) {
    let l = lines[i];
    if (l.startsWith('[')) break;
    while (/\\$/.test(l) && /=hex(\([0-9a-f]+\))?:/i.test(l) && i + 1 < lines.length) l = l.slice(0, -1) + lines[++i].trim();   // hex values wrap
    let m = /^(@|"((?:[^"\\]|\\.)*)")=(.*)$/.exec(l);
    if (!m) continue;
    const n = m[1] === '@' ? '' : unq(m[2]);
    if (n.toLowerCase() !== vn.toLowerCase()) continue;
    const v = m[3];
    if ((m = /^"((?:[^"\\]|\\.)*)"$/.exec(v))) return unq(m[1]);           // REG_SZ
    if ((m = /^hex\((2|7)\):(.*)$/i.exec(v))) return hexStr(m[2], true);       // REG_EXPAND_SZ / REG_MULTI_SZ (UTF-16LE bytes)
    return null;                                                               // dword / binary: not a string
  }
  return null;
}

function defaultRun(args) {
  const f = path.join(os.tmpdir(), 'as2-reg-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.reg');
  try {
    const r = require('child_process').spawnSync('reg', [...args, f, '/y'], { windowsHide: true, stdio: 'ignore' });
    if (r.status !== 0) return null;
    return fs.readFileSync(f);
  } catch (e) { return null; } finally { try { fs.unlinkSync(f); } catch (e) { /* not written */ } }
}
function readValue(key, name, opt = {}) {
  if (!opt.run && process.platform !== 'win32') return null;
  const run = opt.run || defaultRun;
  try { const b = run(['export', key]); return b ? parseExport(b, key, name) : null; } catch (e) { return null; }
}

function expandEnv(s, env = process.env) {
  const low = new Map(Object.entries(env || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return String(s).replace(/%([^%]+)%/g, (all, n) => { const v = low.get(n.toLowerCase()); return v == null ? all : v; });
}

module.exports = { readValue, parseExport, decode, expandEnv, longKey };
