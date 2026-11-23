// rule table: rules/<target game>/<from>--<to>.json. row = id, kind, from, to, scope, action rewrite|warn|block, evidence, tag, origin, test
// modmove reads the include rows from here, so check and fix cannot disagree about a rename
// Author: Imperator_Aug (ARSENAL, ia-ddde1acf)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'rules');
const KINDS = new Set(['version', 'include', 'as2togoh', 'encoding', 'lng_pot', 'pot_lng', 'require_drop', 'path_drop', 'block', 'warn']);
const NEED = ['id', 'kind', 'from', 'to', 'scope', 'action', 'evidence', 'tag', 'origin', 'test'];
const game = t => (t === 'goh' ? 'goh' : 'as2');
function validate(rows, file) {
  const seen = new Set();
  for (const r of rows) {
    for (const k of NEED) if (r[k] === undefined) throw new Error(`${file}: row ${r.id || '?'} has no ${k}`);
    if (!KINDS.has(r.kind)) throw new Error(`${file}: row ${r.id} unknown kind ${r.kind}`);
    if (!['rewrite', 'warn', 'block'].includes(r.action)) throw new Error(`${file}: row ${r.id} unknown action ${r.action}`);
    if (seen.has(r.id)) throw new Error(`${file}: duplicate row ${r.id}`);
    seen.add(r.id);
    if (r.action === 'warn' && (r.origin !== 'auto' || r.detect)) require('./detect').validateDetect(r, file);
  }
  return rows;
}
function load(from, to) {
  const f = path.join(ROOT, game(to), `${from}--${to}.json`);
  if (!fs.existsSync(f)) throw new Error(`no rule table for ${from} -> ${to} (${path.relative(ROOT, f)})`);
  return validate(JSON.parse(fs.readFileSync(f, 'utf8')), path.basename(f));
}
// [name that dangles on the target, path to include instead]
const includePairs = (from, to) => { try { return load(from, to).filter(r => r.kind === 'include').map(r => [r.name, r.path]); } catch { return []; } };
module.exports = { load, validate, includePairs, KINDS };
