// node check-sarif.js file.sarif minResults [uriPrefix]  -> validates SARIF 2.1.0 shape
// Author: Imperator_Aug (ARSENAL, ia-786c7ea1)
const j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8')), min = +process.argv[3] || 0, pre = process.argv[4] || '';
const e = m => { console.error('check-sarif: ' + m); process.exit(1); };
if (!/sarif-2\.1\.0/.test(j.$schema || '')) e('$schema');
if (j.version !== '2.1.0') e('version');
if (!Array.isArray(j.runs) || !j.runs.length) e('runs');
let n = 0;
for (const r of j.runs) {
  if (!r.tool || !r.tool.driver || !r.tool.driver.name) e('tool.driver.name');
  for (const x of r.results || []) {
    n++;
    if (!x.ruleId || !x.message || !x.message.text || !['error', 'warning', 'note'].includes(x.level)) e('result shape');
    const u = x.locations[0].physicalLocation.artifactLocation.uri;
    if (pre && !u.startsWith(pre + '/')) e('uri prefix ' + u);
    if (!(x.locations[0].physicalLocation.region.startLine >= 1)) e('startLine');
  }
}
if (n < min) e(`results ${n} < ${min}`);
console.log(`sarif ok: ${j.runs.length} runs, ${n} results`);
