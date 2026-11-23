// BUILD-GATE job 5: edrun --dry on old-pairs.json is byte-identical before/after the retry change.
// "Before" = a temp copy of edrun.js with the job-5 text undone. Not in run.sh (it knows the exact job-5 text); a one-time proof.
// Author: Imperator_Aug (ARSENAL, ia-114979f1)
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const D = path.join(__dirname, '..') + path.sep, S = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-dry-')) + path.sep;
let t = fs.readFileSync(D + 'edrun.js', 'utf8').replace(/\r\n/g, '\n');
const old = "function runSwitch(G, extra) {\n  return cp.spawnSync(process.execPath, [path.join(R, 'tools/modswitch/modswitch.js'), '--game', G, '--inst', String(INST), '--bak', 'options.set.edrun', ...extra, '--write', '--force'], { encoding: 'utf8' });\n}\n";
const a0 = t.indexOf('// BUILD-GATE job 5'), a1 = t.indexOf('function runSwitch'), a2 = t.indexOf('\n}\n', a1) + 3;
t = t.slice(0, a0) + old + t.slice(a2);
t = t.replace('  lastGameEnd = Date.now();\n', '').replace(' runSwitch, markGameEnd: ms => { lastGameEnd = ms; },', '');
fs.writeFileSync(D + 'edrun.head.js', t);
const norm = s => s.replace(/EDRUN \S+ /g, 'EDRUN RUNID ');   // the run id is clock-made: the only text that differs between any two runs
const run = (s, o) => {
  const r = cp.spawnSync('node', [s, '--pairs', 'test/old-pairs.json', '--dry', '--out', S + o], { encoding: 'utf8', cwd: D });
  return r.status + '\n' + (r.stdout + r.stderr).split(S + o).join('OUT');
};
try {
  const a = run('edrun.head.js', 'd1'), b = run('edrun.js', 'd2');
  console.log('undo removed job-5 text:', !t.includes('lastGameEnd'), '| stdout+code same:', a === b, '| code', a.split('\n')[0]);
  const ls = d => fs.readdirSync(d, { recursive: true }).filter(f => fs.statSync(d + '/' + f).isFile());
  const f1 = ls(S + 'd1'), f2 = ls(S + 'd2');
  let same = JSON.stringify(f1) === JSON.stringify(f2);
  for (const f of f1) if (same && norm(fs.readFileSync(S + 'd1/' + f, 'latin1')) !== norm(fs.readFileSync(S + 'd2/' + f, 'latin1'))) {
    const x = norm(fs.readFileSync(S + 'd1/' + f, 'latin1')).split('\n'), y = norm(fs.readFileSync(S + 'd2/' + f, 'latin1')).split('\n');
    const dl = x.map((l, i) => l === y[i] ? null : i + 1 + ': ' + l.trim() + ' | ' + (y[i] || '').trim()).filter(Boolean);
    console.log('differs', f, x.length === y.length ? '' : 'LENGTH', dl.slice(0, 6));
    same = false;
  }
  console.log('files', f1.length, '| byte-identical tree:', same);
  process.exitCode = a === b && same ? 0 : 1;
} finally { fs.rmSync(D + 'edrun.head.js', { force: true }); fs.rmSync(S, { recursive: true, force: true }); }
