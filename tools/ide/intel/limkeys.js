#!/usr/bin/env node
// limkeys: data keys -> limits row IDs for the editor hover, so the single-file exe (which embeds tools/** only, not limits/)
// still shows limits links. `node tools/ide/intel/limkeys.js` scans ../limits/*.md once and writes limkeys.json next to it:
//   { v, built, rule, keys: { key: [ID, ...] } }   (keys lower case; IDs in scan order: file order, then row order)
// Matching rule (same as nav.js limRows, [I]: a key named in a limits row is a hint, not proof the row is about that key):
//   a row `AREA-NN | ...` names key K when K (3+ chars of [A-Za-z0-9_]) follows one of { ` ( and no word char follows K.
//   Taking the maximal word after { ` ( gives exactly the keys that rule matches, so the json and the live scan agree.
// nav.js requires limkeys.json first and calls scan() only when the json is missing (source tree without a built json).
// Re-run after editing limits/*.md. Writes only limkeys.json. Author: Imperator_Aug (ARSENAL)
// `node tools/ide/intel/limkeys.js --goh` does the same over ../*.md (GH<AREA>-NN rows, same row form and rule)
// and writes gohkeys.json: the hover under GoH links those rows instead of the as64 limits rows (nav.js limRows gk 'goh').
// Author: Imperator_Aug (ARSENAL, ia-76dda209)
'use strict';
const fs = require('fs'), path = require('path');
const LIMITS = path.join(__dirname, '..', '..', '..', 'limits');
const OUT = path.join(__dirname, 'limkeys.json');
const GOH = path.join(__dirname, '..', '..', '..', 'gohweb', 'limits'), GOH_OUT = path.join(__dirname, 'gohkeys.json');
const V = 1;

// -> [[ID, rowText]] over limits/<AREA>.md (INDEX.md skipped), in readdir order (sorted for a stable json)
function rows(dir) {
  dir = dir || LIMITS;
  const out = [];
  let ns = [];
  try { ns = fs.readdirSync(dir).filter(n => /^[A-Z][A-Z0-9]*\.md$/.test(n) && n !== 'INDEX.md').sort(); } catch (e) { return out; }
  for (const n of ns) {
    let t = ''; try { t = fs.readFileSync(path.join(dir, n), 'utf8'); } catch (e) { continue; }
    for (const L of t.split('\n')) { const m = /^([A-Z][A-Z0-9]*-\d+) \|/.exec(L); if (m) out.push([m[1], L]); }
  }
  return out;
}
// key (lower) -> [ID] over the rows (one ID per row, rows in order)
function scan(dir) {
  const keys = Object.create(null);
  for (const [id, L] of rows(dir)) {
    const seen = new Set();
    for (const m of L.matchAll(/[{`(]([A-Za-z0-9_]+)/g)) {
      const k = m[1].toLowerCase();
      if (k.length < 3 || seen.has(k)) continue;
      seen.add(k);
      (keys[k] || (keys[k] = [])).push(id);
    }
  }
  return keys;
}
function main(argv) {
  const goh = (argv || []).includes('--goh'), dir = goh ? GOH : LIMITS, out = goh ? GOH_OUT : OUT;
  const t0 = Date.now(), keys = scan(dir);
  const n = Object.keys(keys).length;
  if (!n) { console.error('limkeys: no limits rows found under ' + dir); return 1; }
  const sorted = {};
  for (const k of Object.keys(keys).sort()) sorted[k] = keys[k];
  const doc = { v: V, built: new Date().toISOString().slice(0, 10), rule: 'key follows { ` ( in a ' + (goh ? 'gohweb' : 'limits') + ' row, no word char after [I]', keys: sorted };
  fs.writeFileSync(out, JSON.stringify(doc) + '\n');
  console.log('limkeys: ' + n + ' keys, ' + (Date.now() - t0) + ' ms -> ' + out);
  return 0;
}
module.exports = { scan, rows, V, GOH };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
