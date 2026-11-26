// node sarif-all.js : every registry linter with format+rc runs once on a tiny fixture with `--format sarif --no-rc`;
// stdout must parse as JSON with runs[0].tool.driver.name. Tools lacking format/rc are listed SKIP (not a failure).
// Author: Imperator_Aug (ARSENAL, ia-370c995c)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const reg = require('../../lib/registry');
const tools = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sarifall-'));
const mod = path.join(tmp, 'game', 'mods', 'm'), game = path.join(tmp, 'game');
fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true });
fs.mkdirSync(path.join(game, 'resource'), { recursive: true });
fs.writeFileSync(path.join(mod, 'resource', 'set', 'x.def'), '{a1 # c}\r\n');
fs.writeFileSync(path.join(mod, 'mod.info'), '{mod\r\n {name "m"}\r\n {minGameVersion "3.262"}\r\n {maxGameVersion "3.262"}\r\n}\r\n');
const logf = path.join(tmp, 'game.log');
fs.writeFileSync(logf, 'hello\r\n');
const mpA = path.join(tools, 'mpsync', 'test', 'fixture', 'A');
// per-tool argv; default = [mod]
const args = {
  refcheck: [mod], conflicts: ['--game', game, '--mods', 'm'], overdiff: [mod, '--game', game],
  mpsync: ['--mod', path.join(mpA, 'mods', 'm'), '--game', mpA], logtriage: [logf],
};
let fail = 0;
for (const t of reg.TOOLS) {
  if (!t.format || !t.rc) { console.log(`SKIP ${t.name} (${!t.format ? 'no --format' : 'no --no-rc'})`); continue; }
  const r = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(tools, t.entry), ...(args[t.name] || [mod]), '--format', 'sarif', '--no-rc'], { encoding: 'utf8' }, 'dist sarif-all ' + t.name);
  let ok = false, why = '';
  const s = r.stdout || '', i = s.indexOf('{\n');
  const e0 = s.indexOf('\n}', i); // tolerate pre/post text lines around the JSON object
  try { const j = JSON.parse(s.slice(Math.max(i, 0), e0 < 0 ? undefined : e0 + 2)); ok = !!(j.runs && j.runs[0] && j.runs[0].tool.driver.name); if (!ok) why = 'no runs[0].tool.driver.name'; }
  catch (e) { why = 'not JSON: ' + (r.stderr || s).slice(0, 120).replace(/\s+/g, ' '); }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.name}${why ? ' ' + why : ''}`);
  if (!ok) fail = 1;
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail);
