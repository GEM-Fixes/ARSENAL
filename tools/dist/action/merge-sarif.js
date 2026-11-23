#!/usr/bin/env node
// merge-sarif.js out.sarif [--prefix dir] [--fail-on error|warning|none] in1.sarif in2.sarif ...
// Merges runs of several SARIF 2.1.0 files; --prefix prepends the mod folder (repo-relative) to every artifact uri so
// GitHub code scanning resolves paths from the repo root. Exit 1 if any result at/above --fail-on level (default error).
// Author: Imperator_Aug (ARSENAL, ia-1bf387ef)
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
let prefix = '', failOn = 'error'; const pos = [];
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--prefix') prefix = a[++i] || '';
  else if (a[i] === '--fail-on') failOn = a[++i] || 'error';
  else pos.push(a[i]);
}
const [out, ...ins] = pos;
if (!out || !['error', 'warning', 'none'].includes(failOn)) { console.error('usage: merge-sarif.js out.sarif [--prefix dir] [--fail-on error|warning|none] in.sarif...'); process.exit(2); }
prefix = prefix.split('\\').join('/').replace(/^\.\/?/, '').replace(/\/+$/, '');
const merged = { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [] };
const n = { error: 0, warning: 0, note: 0 };
for (const f of ins) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.version !== '2.1.0' || !Array.isArray(j.runs)) { console.error(`error: ${f}: not SARIF 2.1.0`); process.exit(2); }
  for (const run of j.runs) {
    for (const r of run.results || []) {
      n[r.level] = (n[r.level] || 0) + (r.suppressions ? 0 : 1);
      if (prefix) for (const l of r.locations || []) { const al = l.physicalLocation && l.physicalLocation.artifactLocation; if (al && al.uri) al.uri = prefix + '/' + al.uri; }
    }
    merged.runs.push(run);
  }
}
fs.writeFileSync(out, JSON.stringify(merged, null, 1));
console.log(`merged ${ins.length} file(s): ${n.error} error, ${n.warning} warning, ${n.note} note`);
const bad = failOn === 'none' ? 0 : failOn === 'warning' ? n.error + n.warning : n.error;
if (bad) { console.error(`::error::${bad} finding(s) at level ${failOn}${failOn === 'warning' ? '+' : ''}`); process.exit(1); }
