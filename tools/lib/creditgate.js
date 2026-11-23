// creditgate: release gate for author credit + ownership marks. used by dist/zip.js, relscrub and release-check --publish
// (patch:. Never reveals the private mark registry; it only checks that it does not ship.
//   gate(entries [{rel, file}]) -> [problem strings]   rel = path under the toolkit root ('NOTICE', 'tools/x/x.js')
//   treeEntries(dir) -> entries of every file under dir;  privateHit(rel) -> reason | ''
// problems: CREDIT_PRIVATE**, the mark registry/manifest/patch, maintainer-only credit + markcheck tools)
// CREDIT_FILE_MISSING (CREDITS.md / NOTICE at the root, only when requireRoot), CREDIT_MISSING (a tool source without
// the Author stamp line), MARK_MISSING (a shipped carrier file lost its mark).
// Author: Imperator_Aug (ARSENAL, ia-ca82fff5)
const fs = require('fs'), path = require('path');
const credit = require('./credit');

const PRIVATE = [
  [/(^|\/)plan\/private(\/|$)/i, 'private plan folder'],
  [/(^|\/)(marks\.md|marks-manifest\.tsv|credit-release\.patch)$/i, 'private mark registry file'],
  [/(^|\/)tools\/(credit|markcheck)\//i, 'maintainer-only credit tool'],
  [/^(credit|markcheck)\//i, 'maintainer-only credit tool'],
];
// carrier file (rel suffix) -> what it must still hold. public rows = visible credit only; hidden-mark rows load from
// ([[suffix, regexSource, what]..], maintainer checkout only) so the shipped gate names no hidden mark
const CARRIERS = [
  ['QUICKSTART.md', /Imperator_Aug/, 'author line'],
  ['START-HERE.md', /Imperator_Aug/, 'author line'],
  ['NOTICE', /Imperator_Aug/, 'author line'],
  ['CREDITS.md', /Imperator_Aug/, 'author line'],
  ['guide/README.md', /Imperator_Aug/, 'author line'],
];
try { for (const [suf, re, what] of JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'plan', 'private', 'carriers.json'), 'utf8'))) CARRIERS.push([suf, new RegExp(re), what]); } catch (e) { /* not a maintainer checkout */ }
const SRC_RE = /(^|\/)tools\/.+\.(js|mjs|cjs|sh|ps1)$/i;
const DATA_DIR = /\/(test\/(.+\/)?(fixture|fixtures|fx|stub|rl)|cache|out|work|_retired|node_modules)\//i;

const privateHit = rel => { for (const [re, why] of PRIVATE) if (re.test(rel)) return why; return ''; };

function treeEntries(dir) {
  const out = [];
  (function w(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) w(path.join(d, e.name), rel + e.name + '/');
      else out.push({ rel: rel + e.name, file: path.join(d, e.name) });
    }
  })(dir, '');
  return out;
}

function gate(entries, o = {}) {
  const P = [], rels = entries.map(e => e.rel.replace(/\\/g, '/'));
  entries.forEach((e, i) => {
    const rel = rels[i], why = privateHit(rel);
    if (why) { P.push(`CREDIT_PRIVATE ${rel}: ${why} must not ship`); return; }
    const read = () => { try { return fs.readFileSync(e.file, 'latin1'); } catch (x) { return ''; } };
    if (SRC_RE.test(rel) && !DATA_DIR.test('/' + rel) && !credit.STAMP_RE.test(read())) P.push(`CREDIT_MISSING ${rel}: no Author stamp line (node tools/credit/credit.js stamp)`);
    for (const [suf, re, what] of CARRIERS) if ((rel === suf || rel.endsWith('/' + suf)) && !re.test(read())) P.push(`MARK_MISSING ${rel}: ${what} gone`);
  });
  if (o.requireRoot) for (const n of ['CREDITS.md', 'NOTICE']) if (!rels.some(r => r === n || r.endsWith('/' + n) && r.split('/').length === 2)) P.push(`CREDIT_FILE_MISSING ${n} at the toolkit root`);
  return P;
}

module.exports = { gate, treeEntries, privateHit, CARRIERS };
