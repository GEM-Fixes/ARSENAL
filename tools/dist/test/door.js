// G-DOOR: a new user's first run on this machine, on the UNZIPPED release, with a PATH that has no node.exe.
// phase pre : zip.js builds the zip locally (never published), unzip into a fresh scratch folder, then with the unzipped ARSENAL.exe:
//             game, new t_door_1, check t_door_1, play t_door_1 --dry --inst N, install t_door_1 (the real game folder; only mods/t_door_1 is written),
//             then ARSENAL.exe gui --no-open (page + /api/health + /api/game), killed after. The game itself is NOT started here.
//             (the real play: testrun starts the game, not edrun, and needs tools/bootcheck/base/<map>.json (default map now has one: T-DOORFIX);
// phase post: uninstall t_door_1 --yes through the exe, confirm the folder is gone, and that `where node` still fails in the test env.
// The real game folder is read-only except mods/t_door_1, which this tool's install creates (and uninstall removes). Refuses if it already exists.
// usage: node tools/dist/test/door.js pre|post --game <game folder> --scratch <dir> [--inst 2] [--port 47931]
// Author: Imperator_Aug (ARSENAL, ia-722f4245)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), http = require('http'), { spawnSync, spawn } = require('child_process');
const ZIP = path.join(__dirname, '..', 'zip.js');
const argv = process.argv.slice(2), phase = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
if (!['pre', 'post'].includes(phase) || !opt('--game') || !opt('--scratch')) { console.log('usage: node tools/dist/test/door.js pre|post --game <game folder> --scratch <dir> [--inst 2] [--port 47931]'); process.exit(2); }
const G = path.resolve(opt('--game')), root = path.resolve(opt('--scratch')), inst = opt('--inst', '2'), port = Number(opt('--port', '47931'));
const MOD = 't_door_1', modPath = path.join(G, 'mods', MOD), work = path.join(root, 'work');
const top = path.join(root, 'release', 'ARSENAL-' + require('../sea.js').buildVersion()), exe = path.join(top, 'ARSENAL.exe'), guiExe = exe   /* one exe since W6 U1 */;
// the env of a first-time user without node: Windows folders only. HOME stays the real one (instance N logs and options live there).
const sysRoot = process.env.SystemRoot || 'C:\\Windows';
const PATH = [path.join(sysRoot, 'System32'), sysRoot].join(path.delimiter);
const env = { ...process.env, PATH, Path: PATH, AS2_GAME: G };
delete env.AS2_HOME; delete env.AS2_NO_STEAM; delete env.NODE_OPTIONS; delete env.NODE_PATH;
const rows = []; let fails = 0;
const rec = (step, cmd, exit, result, ok) => { rows.push([step, cmd, exit, result]); if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} | ${step} | ${cmd} | exit ${exit} | ${result}`); };
const first = s => (String(s).split(/\r?\n/).find(l => l.trim()) || '(no output)').trim().slice(0, 150);
const run = (args, cwd) => {
  const r = spawnSync(exe, args, { cwd: cwd || work, env, encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, windowsHide: true });
  try { fs.mkdirSync(path.join(root, 'logs'), { recursive: true }); fs.writeFileSync(path.join(root, 'logs', phase + '-' + args[0] + '.txt'), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`); } catch (e) { /* log only */ }
  return r;
};
function whereNode() { const r = spawnSync(path.join(sysRoot, 'System32', 'where.exe'), ['node'], { env, encoding: 'utf8', windowsHide: true }); return r; }
function unzip(f, dest) {
  const buf = fs.readFileSync(f), e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])), n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8'), cs = buf.readUInt32LE(p + 20);
    const lo = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = zlib.inflateRawSync(buf.slice(lo, lo + cs));
    if (zlib.crc32(data) !== buf.readUInt32LE(p + 16)) throw new Error('crc ' + name);
    const out = path.join(dest, name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, data);
    p += 46 + nl + xl + cl;
  }
}
const get = p => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p }, s => { const b = []; s.on('data', d => b.push(d)); s.on('end', () => res({ status: s.statusCode, text: Buffer.concat(b).toString('utf8') })); });
  r.on('error', rej); r.setTimeout(30000, () => r.destroy(new Error('timeout'))); r.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pre() {
  if (fs.existsSync(modPath)) { console.log('REFUSED: ' + modPath + ' already exists (not made by this run); nothing written'); process.exit(2); }
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const outDir = path.join(root, 'zipout');
  const b = spawnSync(process.execPath, [ZIP, '--out-dir', outDir], { encoding: 'utf8', maxBuffer: 1 << 26 });
  rec('1 build zip', 'node tools/dist/zip.js --out-dir <scratch>/zipout', b.status, first((b.stdout || '').trim().split('\n').slice(-1)[0] || b.stderr), b.status === 0);
  if (b.status !== 0) return;
  unzip(path.join(outDir, 'ARSENAL-' + require('../sea.js').buildVersion() + '.zip'), path.join(root, 'release'));
  rec('1 unzip', 'unzip ARSENAL-0.1.0.zip -> <scratch>/release', 0, 'ARSENAL.exe ' + fs.existsSync(exe) + ', ARSENAL-gui.cmd ' + fs.existsSync(path.join(top, 'ARSENAL-gui.cmd')) + ', START-HERE.md ' + fs.existsSync(path.join(top, 'START-HERE.md')), fs.existsSync(exe) && fs.existsSync(path.join(top, 'ARSENAL-gui.cmd')));
  const w = whereNode();
  rec('2 no node', 'where node   (PATH = ' + PATH + ')', w.status, w.status === 0 ? 'FOUND ' + first(w.stdout) : 'not found: ' + first(w.stderr || w.stdout), w.status !== 0);
  if (w.status === 0) return;
  let r = run(['game']);
  rec('2 game', 'ARSENAL.exe game  (AS2_GAME set)', r.status, first(r.stdout || r.stderr), r.status === 0);
  r = run(['new', MOD, '--name', 'Door Test']);
  rec('2 new', `ARSENAL.exe new ${MOD} --name "Door Test"`, r.status, first(r.stdout || r.stderr), r.status === 0 && fs.existsSync(path.join(work, MOD, 'mod.info')));
  r = run(['check', MOD]);
  const v = /^VERDICT as64: .*/m.exec(r.stdout || '');
  rec('2 check', `ARSENAL.exe check ${MOD}`, r.status, (v ? v[0].slice(0, 40) : first(r.stdout || r.stderr)) + '', r.status === 0 && !!v && /LOADS_STATIC/.test(v[0]));
  r = run(['play', MOD, '--dry', '--inst', inst]);
  rec('2 play --dry', `ARSENAL.exe play ${MOD} --dry --inst ${inst}`, r.status, first(r.stdout || r.stderr) + ' | ' + ((/^BOOT.*$/m.exec(r.stdout || '') || [''])[0]), r.status === 0 && !fs.existsSync(modPath));
  r = run(['install', MOD]);
  const marked = fs.existsSync(modPath) && fs.readdirSync(modPath).some(n => /as2|arsenal|install|marker/i.test(n));
  rec('2 install', `ARSENAL.exe install ${MOD}`, r.status, first(r.stdout || r.stderr) + ' | folder ' + fs.existsSync(modPath) + ', marker file ' + marked, r.status === 0 && fs.existsSync(modPath));
  // gui, headless: --no-open serves the page without a browser
  const child = spawn(guiExe, ['gui', '--no-open', '--port', String(port)], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let o = '', e = ''; child.stdout.on('data', d => o += d); child.stderr.on('data', d => e += d);
  let gone = null; child.on('exit', c => gone = c);
  try {
    for (let i = 0; i < 100 && !/gui: http/.test(o) && gone === null; i++) await sleep(200);
    const h = JSON.parse((await get('/api/health')).text), pg = await get('/'), g = JSON.parse((await get('/api/game')).text);
    rec('4 gui', 'ARSENAL.exe gui --no-open --port ' + port, 0, `${first(o)} | /api/health sea=${h.sea} | page ${pg.status} ${pg.text.length} bytes | /api/game dir found ${!!g.dir}`, h.sea === true && pg.status === 200 && pg.text.length > 20000 && !!g.dir);
  } catch (x) { rec('4 gui', 'ARSENAL.exe gui --no-open', 'n/a', 'exception: ' + x.message + ' ' + e.slice(0, 200), false); }
  child.kill(); spawnSync(path.join(sysRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  await sleep(500);
}
function post() {
  if (!fs.existsSync(exe)) { console.log('no unzipped release in ' + root + ' (run pre first)'); process.exit(2); }
  const had = fs.existsSync(modPath);
  let r = run(['uninstall', MOD, '--yes']);
  rec('5 uninstall', `ARSENAL.exe uninstall ${MOD} --yes`, r.status, first(r.stdout || r.stderr) + ' | existed before ' + had, r.status === 0 && /^removed: /m.test(r.stdout || '') && !/would remove/.test(r.stdout || ''));
  rec('5 gone', 'folder check', '-', 'mods/' + MOD + ' exists: ' + fs.existsSync(modPath), !fs.existsSync(modPath));
  const w = whereNode();
  rec('5 no node', 'where node', w.status, w.status === 0 ? 'FOUND' : 'not found', w.status !== 0);
}
(async () => {
  if (phase === 'pre') await pre(); else post();
  console.log(fails ? `door ${phase}: ${fails} failed` : `door ${phase}: PASS (${rows.length} steps)`);
  process.exit(fails ? 1 : 0);
})();
