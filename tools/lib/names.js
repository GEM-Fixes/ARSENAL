// names: resource-name normalisation + forms, lim VFS-02/03/05)
// Author: Imperator_Aug (ARSENAL, ia-a148e4fb)

const MAX_NAME = 4096;        // bytes; longer = fatal "path is too long" (VFS-03)
const ZIP_NAME_MAX = 1023;    // zip entry names are read into a 0x400 buffer: longer truncated

// VFS-02: lowercase whole string (Unicode aware), '\' -> '/'. every index key goes through this
const normalize = p => String(p).toLowerCase().replace(/\\/g, '/');

// zip entry name as the engine sees it: truncated to 1023 bytes, then normalised
function zipEntryName(name) {
  const b = Buffer.from(name, 'latin1');
  return normalize(b.length > ZIP_NAME_MAX ? b.toString('latin1', 0, ZIP_NAME_MAX) : name);
}

// name forms (names.md). rootDir = virtual dir of the including file/mount, e.g. 'resource/entity/'.
// → { kind: 'resource'|'game'|'user'|'relative', key }  (key = normalised index key)
function resolve(name, rootDir = '') {
  const n = normalize(name);
  if (n.startsWith('//')) return { kind: 'game', key: n.slice(2) };
  if (n.startsWith('/')) return { kind: 'resource', key: 'resource' + n };
  if (n.startsWith('@')) return { kind: 'user', key: n.slice(1).replace(/^\//, '') };
  const root = normalize(rootDir).split('/').filter(Boolean);
  let rest = n;
  while (rest.startsWith('../')) { root.pop(); rest = rest.slice(3); }
  return { kind: 'relative', key: (root.length ? root.join('/') + '/' : '') + rest };
}

// extension from LAST '.' unless a '/' follows; title stops at FIRST '.' after last slash
function ext(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 && name.indexOf('/', i) < 0 ? name.slice(i) : '';
}
function title(name) {
  const base = name.slice(name.lastIndexOf('/') + 1), i = base.indexOf('.');
  return i < 0 ? base : base.slice(0, i);
}

// VFS-05: ASCII letters+digits and `[](){}@$%^-+._ !` PLUS `#` `&` (5.5k vanilla names use them: spec issue VFS-05); separators '/' '\' are path syntax.
// non-ASCII letters/digits: engine uses IsCharAlphaNumericW (accepts them) -> WARN_ only
const OK = /^[A-Za-z0-9\[\](){}@$%^\-+._ !#&\/\\]$/;
const UNI = /^[\p{L}\p{N}\u0080-ÿ]$/u; // \u0080-ÿ: cp1251 zip names read as latin1

// → [{ code, msg }] ; codes NAME_TOO_LONG NAME_BAD_CHAR NAME_SPACE_EDGE WARN_NAME_NONASCII
function validate(name) {
  const out = [], bytes = Buffer.byteLength(name, 'utf8');
  if (bytes > MAX_NAME) out.push({ code: 'NAME_TOO_LONG', msg: `name is ${bytes} bytes (> ${MAX_NAME}): fatal "path is too long"` });
  if (name.startsWith(' ') || name.endsWith(' ')) out.push({ code: 'NAME_SPACE_EDGE', msg: 'name starts/ends with a space' });
  const bad = new Set(); let uni = false;
  for (const ch of name) {
    if (OK.test(ch)) continue;
    if (UNI.test(ch)) uni = true; else bad.add(ch);
  }
  if (bad.size) out.push({ code: 'NAME_BAD_CHAR', msg: 'invalid char(s): ' + [...bad].map(c => JSON.stringify(c)).join(' ') });
  if (uni) out.push({ code: 'WARN_NAME_NONASCII', msg: 'non-ASCII letters; spec says ASCII only, engine uses IsCharAlphaNumericW [I]' });
  return out;
}

module.exports = { normalize, zipEntryName, resolve, ext, title, validate, MAX_NAME, ZIP_NAME_MAX };
