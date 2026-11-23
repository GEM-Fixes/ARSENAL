// credit: author credit + per-file build tag shared by every tool (lib/help prints it on --help and --version).
// AUTHOR = the toolkit author. tag(rel) = 'ia-' + 8 hex: seeded FNV-1a 32 over 'AUTHOR|rel' (rel = path under the
// toolkit root, '/' separators, lower case). The seed is part of the tag format: tests pin tag('tools/lib/credit.js').
// line(rel) -> one footer line;  stamp(rel, style) -> the header line a tool source carries ('//' or '#').
// version() -> 'ARSENAL <package.json version>' ('ARSENAL dev' when no package.json is found). ARSENAL = A.R.S.E.N.A.L.
// Stamps: the new form is `(ARSENAL, ia-..)`; STAMP_RE also accepts the old `(as64 toolkit, ia-..)` (old copies exist in the wild).
// Author: Imperator_Aug (ARSENAL, ia-b4995424)
const fs = require('fs'), path = require('path');

const AUTHOR = 'Imperator_Aug';
const SEED = 0x1A06A115;      // FNV-1a offset basis of the tag hash (not the standard 0x811c9dc5)
const PRIME = 0x01000193;

const norm = rel => String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

function fnv(s, seed = SEED) {
  let h = seed >>> 0;
  for (const b of Buffer.from(String(s), 'utf8')) { h ^= b; h = Math.imul(h, PRIME) >>> 0; }
  return h >>> 0;
}

const tag = rel => 'ia-' + fnv(AUTHOR + '|' + norm(rel)).toString(16).padStart(8, '0');

// path of a file under the toolkit root (the folder holding tools/), for tag(); '' when not under one
function relOf(file) {
  const p = path.resolve(String(file || '')).replace(/\\/g, '/');
  const i = p.toLowerCase().lastIndexOf('/tools/');
  return i < 0 ? path.basename(p) : p.slice(i + 1);
}

function version() {
  if (process.env.ARSENAL_VERSION) return 'ARSENAL ' + process.env.ARSENAL_VERSION; // set by the exe launcher (dist/sea-main.js)
  for (const p of [path.join(__dirname, '..', '..', 'package.json'), path.join(__dirname, '..', 'package.json')]) {
    try { const v = JSON.parse(fs.readFileSync(p, 'utf8')).version; if (v) return 'ARSENAL ' + v; } catch (e) { }
  }
  return 'ARSENAL dev';
}

const line = rel => `${version()} - author ${AUTHOR} - build ${tag(rel)}`;
const stamp = (rel, style = '//') => style === '<!--' ? `<!-- Author: ${AUTHOR} (ARSENAL, ${tag(rel)}) -->` : `${style} Author: ${AUTHOR} (ARSENAL, ${tag(rel)})`;
const STAMP_RE = /Author: Imperator_Aug \((?:ARSENAL|as64 toolkit), (ia-[0-9a-f]{8})\)/;

module.exports = { AUTHOR, SEED, fnv, tag, relOf, version, line, stamp, STAMP_RE, norm };
