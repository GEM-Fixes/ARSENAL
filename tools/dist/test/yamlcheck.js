// Structural check of a composite action.yml / workflow (no yaml dep): node yamlcheck.js action.yml
// Prints extracted `run:` blocks to stdout when --runs DIR is given (run1.sh, run2.sh ...) for local execution.
// Author: Imperator_Aug (ARSENAL, ia-c29cb5f6)
const fs = require('fs'), path = require('path');
const [file, flag, dir] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8'), L = text.split(/\r?\n/);
const err = []; const bad = m => err.push(m);
L.forEach((l, i) => { if (/\t/.test(l)) bad(`${i + 1}: tab`); if (/^\s*[^#\s][^:]*$/.test(l) && !/^\s*(-|\w)/.test(l)) bad(`${i + 1}: odd line`); });
const top = L.filter(l => /^[A-Za-z_-]+:/.test(l)).map(l => l.split(':')[0]);
const isAction = path.basename(file).startsWith('action');
for (const k of isAction ? ['name', 'description', 'runs'] : ['name', 'on', 'jobs']) if (!top.includes(k)) bad(`missing top-level ${k}`);
const steps = []; let cur = null, runBlock = null, runIndent = 0;
L.forEach((l, i) => {
  if (runBlock) {
    const ind = l.length - l.trimStart().length;
    if (!l.trim() || ind > runIndent) { runBlock.push(l.trim() ? l.slice(runIndent + 2) : ''); return; }
    cur.run = runBlock.join('\n'); runBlock = null;
  }
  const m = /^(\s*)(- )?([a-z_-]+):\s*(.*)$/.exec(l);
  if (!m) return;
  if (m[2] && m[1].length >= 4 && m[3] !== 'name' || (m[2] && m[3] === 'name')) { cur = { line: i + 1 }; steps.push(cur); }
  if (!cur) return;
  const ind = m[1].length + (m[2] ? 2 : 0);
  if (m[3] === 'run') { if (/^\|/.test(m[4])) { runBlock = []; runIndent = ind; } else cur.run = m[4]; }
  else if (m[3] === 'uses' || m[3] === 'shell') cur[m[3]] = m[4];
});
if (runBlock) cur.run = runBlock.join('\n');
if (!steps.length) bad('no steps');
if (isAction) {
  if (!/^\s+using:\s*composite\s*$/m.test(text)) bad('runs.using must be composite');
  for (const s of steps) { if (!s.run && !s.uses) bad(`step@${s.line}: needs run or uses`); if (s.run && s.shell !== 'bash') bad(`step@${s.line}: composite run needs shell`); }
  if (!steps.some(s => /upload-sarif/.test(s.uses || ''))) bad('no upload-sarif step');
}
if (err.length) { err.forEach(e => console.error('yamlcheck: ' + e)); process.exit(1); }
if (flag === '--runs') { fs.mkdirSync(dir, { recursive: true }); steps.filter(s => s.run).forEach((s, i) => fs.writeFileSync(path.join(dir, `run${i + 1}.sh`), s.run + '\n')); }
console.log(`yamlcheck: ${path.basename(file)} ok (${steps.length} steps)`);
