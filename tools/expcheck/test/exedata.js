// --exe reaches the data: a made-up game (as64.exe + the fixture's files under as64/core/, which the vfs mounts only for as64).
// usage: node exedata.js <tool.js> <fixture folder> [extra tool args]. Runs <tool> --vfs --game <made-up game> --format json:
// no --exe and --exe as64 must give the same findings (not none); --exe mowas_2 must give none in resource/ (no as64/core).
// Then a copy in <game>/other/mods/x (a mods/ folder of no game) linted with --game: its own findings must show.
// Exits 1 on a difference. The made-up game lives in the temp folder and is removed.
// Author: Imperator_Aug (ARSENAL, ia-38ef8c70)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const [tool, src, ...extra] = process.argv.slice(2);
const G = fs.mkdtempSync(path.join(os.tmpdir(), 'exedata-'));
fs.writeFileSync(path.join(G, 'as64.exe'), '');
fs.mkdirSync(path.join(G, 'resource'), { recursive: true });
fs.cpSync(src, path.join(G, 'as64', 'core'), { recursive: true });
const run = exe => {
  const r = spawnSync(process.execPath, [tool, '--vfs', '--game', G, '--format', 'json', ...extra, ...(exe ? ['--exe', exe] : [])], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1));
  return (j.findings || []).concat(j.info || []).map(f => `${f.file}:${f.line} ${f.code}`).sort();
};
let bad = 0;
const ok = (what, cond, got) => { if (cond) console.log('ok ' + what); else { bad++; console.log('FAIL ' + what + ': ' + JSON.stringify(got).slice(0, 400)); } };
try {
  const base = run(), a = run('as64'), m = run('mowas_2');
  ok('as64/core findings with no --exe', base.some(l => l.startsWith('resource/')), base);
  ok('--exe as64 = no --exe', JSON.stringify(a) === JSON.stringify(base), a);
  ok('--exe mowas_2 mounts no as64/core', !m.some(l => l.startsWith('resource/')), m);
  // a folder in a mods/ that is not <game>/mods is linted as a loose folder, not mounted by its name (which the game lacks)
  const O = path.join(G, 'other', 'mods', 'x'); fs.cpSync(src, O, { recursive: true });
  const r = spawnSync(process.execPath, [tool, O, '--game', G, '--exe', 'mowas_2', '--format', 'json', ...extra], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)), l = (j.findings || []).concat(j.info || []);
  ok('folder in another mods/ is linted, not mounted by id', l.some(f => f.file.startsWith('resource/')), l.slice(0, 3));
} catch (e) { bad++; console.log('FAIL ' + e.message); }
fs.rmSync(G, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
