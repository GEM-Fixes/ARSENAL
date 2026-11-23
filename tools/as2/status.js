// ARSENAL status: print the milestones, read at run time (nothing typed in here).
// is the maintainers' folder: the public exe has none, then say so and exit 1.
//   ARSENAL status [--plan <PLAN.md>]
// Author: Imperator_Aug (ARSENAL, ia-32564618)
const fs = require('fs'), path = require('path');

const cells = l => l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
const isSep = l => /^\|?\s*:?-{2,}/.test(l.trim());

// section body of "## <name>" up to the next "## " (null if absent)
function section(lines, name) {
  const i = lines.findIndex(l => /^##\s/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === name.toLowerCase());
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) out.push(lines[j]);
  return out;
}

// -> {head:[cells], rows:[[cells]]} for the first table in the lines, or null
function table(lines) {
  const t = lines.filter(l => l.trim().startsWith('|'));
  if (t.length < 3 || !isSep(t[1])) return null;
  return { head: cells(t[0]), rows: t.slice(2).map(cells) };
}

function wrap(s, w, ind) {
  const out = []; let cur = '';
  for (const word of s.split(/\s+/)) {
    if (cur && (cur + ' ' + word).length > w) { out.push(cur); cur = word; } else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) out.push(cur);
  return out.map(x => ind + x).join('\n');
}

function main(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') { console.log('usage: ARSENAL status [--plan <PLAN.md>]'); return 0; }
  let file = path.join(__dirname, '..', '..', 'plan', 'PLAN.md');
  const i = argv.indexOf('--plan');
  if (i >= 0) { if (!argv[i + 1]) { console.error('error: --plan needs a file'); return 2; } file = path.resolve(argv[i + 1]); }
  else if (argv.length) { console.error('usage: ARSENAL status [--plan <PLAN.md>]'); return 2; }
  if (!fs.existsSync(file)) {
    console.log('ARSENAL status: no ' + (i >= 0 ? file : 'plan/PLAN.md') + ' here. Milestones come from the maintainers\' plan/ folder, which is not shipped with the exe; nothing to show.');
    return 1;
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const sec = section(lines, 'Milestones'), t = sec && table(sec);
  if (!t) { console.log('ARSENAL status: ' + file + ' has no "## Milestones" table; nothing to show.'); return 1; }
  console.log('milestones (read from ' + path.basename(file) + ', Milestones section)');
  const [h0, h1] = [t.head[1] || 'pass test', t.head[2] || 'state'];
  for (const r of t.rows) {
    const name = r[0] || '(unnamed)', test = r[1] || '', state = r[2] || '';
    console.log('\n' + name);
    if (test) console.log(wrap(h0 + ': ' + test, 100, '  '));
    console.log(wrap(h1 + ': ' + state, 100, '  '));
  }
  console.log('\ncoverage: the rows above (M5 is the coverage milestone); per-group cells are in PLAN.md "## Coverage table".');
  console.log('Tags in PLAN.md: [V] seen in a run or file, [I] inferred, [T] needs a game test.');
  return 0;
}

module.exports = { main, section, table, cells };
