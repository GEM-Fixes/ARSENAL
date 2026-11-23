// testrun scenarios test: every tools/testrun/scenarios/*.json has valid schema, cited src, known pipe commands, existing fixtures
// (valid mod.info shape, cp1251+CRLF text, UTF-8 .lng), and its --dry plan renders (no exe). install.js dry plan writes nothing.
// Author: Imperator_Aug (ARSENAL, ia-aa293969)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const D = path.join(__dirname, '..', 'scenarios'), T = path.join(__dirname, '..', 'testrun.js');
const SRC = path.resolve(__dirname, '..', '..', '..');
let bad = 0;
const fail = m => { console.log('FAIL scenarios: ' + m); bad++; };

// pipe commands that exist: engine RegisterCommand table
//     ) + pipe_events
const CMDS = new Set(['q', 'exec', 'mod_list', 'mod_set', 'mod_on', 'mod_off', 'sp_mission', 's_mods', 's_version', 'pipe_events',
  'mp_lan', 'mp_steam', 'mp_maps', 'mp_host', 'mp_join', 'mp_back', 'mp_ready', 'mp_start', 'mp_status', 'mp_result', 'mp_state',
  'mp_settings', 'mp_set', 'mp_slots', 'mp_army', 'mp_team', 'mp_slot', 'mp_kick', 'mp_chat', 'mp_game_set_score', 'mp_game_over',
  'mp_checkSpawnPoints', 'mp_checkCompetitive', 'mp_checkCaptureFlag', 'mp_userUnits']);
const REAL_LINES = ['', '', ''];
const ROWS = 'MAP-27 MAP-26 MAP-22 MAP-11 MAP-16 LOC-19 STR-14 KEY-12 KEY-23 VFS-08 VFS-21 SDL-15 MIS-08 AI-13 TST-16'.split(' ');

const files = fs.readdirSync(D).filter(f => /\.json$/.test(f)).sort();
const covered = new Set();
for (const f of files) {
  const file = path.join(D, f);
  let sc;
  try { sc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(f + ': ' + e.message); continue; }
  if (['modlist.json', 'sp-load.json'].includes(f)) continue; // earlier scenarios, no src field
  for (const r of sc.rows || []) covered.add(r);
  if (!Array.isArray(sc.rows) || !sc.rows.length) fail(f + ': rows');
  if (!Array.isArray(sc.src) || !sc.src.length || !sc.src.every(s => /\.(cpp|h|js|md):\d+/.test(s))) fail(f + ': src needs file:line cites');
  if (!sc.manual && !(sc.verdict || []).length) fail(f + ': needs verdict or manual');
  if (sc.manual && typeof sc.manual !== 'string') fail(f + ': manual must be a string');
  for (const st of sc.steps || []) {
    if (st.cmd !== undefined && !CMDS.has(st.cmd.split(/\s+/)[0])) fail(f + ': unknown pipe command ' + st.cmd);
  }
  // cited engine files exist (the mod/tool cites are checked as plain files too)
  for (const s of sc.src || []) {
    const p = (s.match(/^(\S+?):\d/) || [])[1];
    if (p && !fs.existsSync(path.join(SRC, p))) fail(f + ': src file missing ' + p);
  }
  // fixtures: dir exists, mod.info one quoted Name, text files CRLF
  for (const m of sc.fixture || []) {
    const dir = path.join(D, 'mods', m);
    if (!fs.existsSync(path.join(dir, 'mod.info'))) { fail(f + ': fixture ' + m + ' missing or no mod.info'); continue; }
    const info = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1');
    if (!/\{Name "[^"]+"\}/.test(info) || !/^\{Mod\r?\n/.test(info) || /""/.test(info)) fail(f + ': ' + m + '/mod.info shape');
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const x of walk(dir)) {
      const t = fs.readFileSync(x, 'latin1');
      if (/[^\r]\n/.test(t) || /^\n/.test(t)) fail(f + ': ' + path.relative(D, x) + ' has LF without CR');
      if (/\.lng$/.test(x) && !Buffer.from(t, 'latin1').equals(Buffer.from(Buffer.from(t, 'latin1').toString('utf8'), 'utf8'))) fail(f + ': lng not valid UTF-8');
    }
  }
  const modNames = (sc.mods || []).map(m => m.split(':')[0]);
  for (const m of modNames) if (!(sc.fixture || []).includes(m)) fail(f + ': mods ' + m + ' not in fixture');
  // --dry plan renders
  const r = cp.spawnSync(process.execPath, [T, '--scenario', file, '--dry', '--logdir', path.join(process.env.TEST_WORK || __dirname, 'fixture', 'log')], { encoding: 'utf8' });
  if (r.status !== 0 || !/testrun plan \(dry/.test(r.stdout)) fail(f + ': dry plan failed: ' + (r.stdout + r.stderr).slice(0, 300));
  for (const st of sc.steps || []) if (st.cmd && r.stdout && !r.stdout.includes(JSON.stringify(st.cmd.replace(/\{(\w+)\}/g, (m0, k) => (sc.params || {})[k] || m0)).slice(1, -1))) fail(f + ': plan lacks step ' + st.cmd);
}
for (const id of ROWS) if (!covered.has(id)) fail('row ' + id + ' has no scenario');

// install.js: dry plan prints every fixture, writes nothing, refuses --write without --game
const tmp = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'instgame');
fs.rmSync(tmp, { recursive: true, force: true });
const r = cp.spawnSync(process.execPath, [path.join(D, 'install.js'), '--game', tmp], { encoding: 'utf8' });
if (r.status !== 0 || !/install plan \(dry/.test(r.stdout)) fail('install dry: ' + (r.stdout + r.stderr).slice(0, 300));
for (const m of ['map-27', 'vfs-08', 'vfs-21a', 'vfs-21b', 'key-23', 'mis-08', 'loc-19']) if (!r.stdout.includes('mod ' + m + ' ->')) fail('install plan lacks ' + m);
if (!/zip .*resource\.pak\.zipsrc -> .*resource\.pak/.test(r.stdout)) fail('install plan lacks pak zip');
if (!/prepare \[.*\] node tools\/place-entity/.test(r.stdout)) fail('install plan lacks prepare');
if (fs.existsSync(tmp)) fail('install dry wrote the game dir');
if (cp.spawnSync(process.execPath, [path.join(D, 'install.js')], { encoding: 'utf8' }).status === 0) fail('install without --game must fail');

// --write into a scratch dir (never a real game): mods land, pak/pat are zips
{
  const w = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'instw');
  fs.rmSync(w, { recursive: true, force: true });
  const rw = cp.spawnSync(process.execPath, [path.join(D, 'install.js'), '--game', w, '--scenario', 'vfs-08.json,key-23.json', '--write'], { encoding: 'utf8' });
  const pak = require('../../lib/pak.js');
  if (rw.status !== 0) fail('install --write: ' + (rw.stdout + rw.stderr).slice(0, 300));
  else {
    const p = path.join(w, 'mods', 'vfs-08', 'resource.pak');
    try { const l = pak.list(p); if (!l.find(e => e.name === 'at/vfs08.cfg')) fail('pak lacks at/vfs08.cfg'); } catch (e) { fail('resource.pak: ' + e.message); }
    try { const l = pak.list(path.join(w, 'mods', 'key-23', '1.pat')); if (!l.find(e => e.name === 'key23.patch')) fail('1.pat lacks key23.patch'); } catch (e) { fail('1.pat: ' + e.message); }
    if (!fs.existsSync(path.join(w, 'mods', 'vfs-08', 'resource', 'at', 'vfs08.cfg'))) fail('loose file missing');
    if (cp.spawnSync(process.execPath, [path.join(D, 'install.js'), '--game', w, '--scenario', 'vfs-08.json', '--write'], { encoding: 'utf8' }).status === 0) fail('re-install must refuse without --force');
  }
  fs.rmSync(w, { recursive: true, force: true });
}
console.log(bad ? bad + ' scenario failures' : 'scenarios ok (' + files.length + ' files)');
process.exit(bad ? 1 : 0);
