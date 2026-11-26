// --listing f (wouldload hands its scan of the mod): the same stdout as a run that lists the mod itself, with worker threads and a
// mounted mod (game + --mods); a listing of another folder or a file that does not read is ignored. The workers take the scan as
// their own (lib/sdlset o.listing -> modtree.adopt), so their view of the mounted mod comes from it, not from a walk.
// Author: Imperator_Aug (ARSENAL, ia-a3c66b5f)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'sdllint-listing-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  put('g/resource/set/base.set', '(define "mm" {v 1})\r\n');
  put('g/mods/m/mod.info', '{Mod\r\n {Name "m"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');
  for (let i = 0; i < 450; i++) put('g/mods/m/resource/entity/many/e' + i + '.def', i % 7 === 0 ? '{game_entity\r\n\t{x 1\r\n' : i % 11 === 0 ? '(include "nope' + i + '.inc")\r\n{game_entity\r\n}\r\n' : '{game_entity\r\n}\r\n');
  put('g/mods/m/.arsenal-undo/t1/resource/entity/x.def', '{game_entity\r\n');
  const G = path.join(w, 'g'), M = path.join(G, 'mods', 'm'), tool = path.join(__dirname, '..', 'sdllint.js'), mt = path.join(__dirname, '..', '..', 'lib', 'modtree.js');
  const scan = (dir, f) => spawnSync(process.execPath, ['-e', `require(${JSON.stringify(mt)}).scan(process.argv[1]).then(T => require('fs').writeFileSync(process.argv[2], JSON.stringify(T)))`, dir, f]);
  const L = path.join(w, 'L.json'), O = path.join(w, 'O.json');
  scan(M, L); scan(path.join(G, 'resource'), O); fs.writeFileSync(path.join(w, 'bad.json'), '{not json');
  const run = extra => spawnSync(process.execPath, [tool, M, '--game', G, '--mods', 'm', '-q', '--no-rc', ...extra], { encoding: 'utf8', env: { ...process.env, SDLLINT_THREADS: '3', ARSENAL_PROGRESS: '' } });
  const base = run([]);
  ok(base.status !== null && /e7\.def/.test(base.stdout) && /e440\.def/.test(base.stdout) && !/x\.def/.test(base.stdout), 'base run lints the mod: ' + base.stdout.slice(0, 300) + base.stderr.slice(0, 300));
  for (const [what, f] of [['its own scan', L], ['a scan of another folder', O], ['a file that does not read', path.join(w, 'bad.json')], ['no such file', path.join(w, 'none.json')]]) {
    const r = run(['--listing', f]);
    ok(r.stdout === base.stdout && r.status === base.status, `--listing ${what}: same stdout`);
  }
  // a worker-like process: createSource with that listing takes it as its fresh scan, so the mounted mod's view is listed from it
  const ss = path.join(__dirname, '..', '..', 'lib', 'sdlset.js');
  const a = spawnSync(process.execPath, ['-e', `const T = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')), mt = require(${JSON.stringify(mt)});
    const s = require(${JSON.stringify(ss)}).createSource({ gameDir: process.argv[2], mods: ['m'], folder: process.argv[3], listing: T });
    console.log(mt.fresh(process.argv[3]) && mt.fresh(process.argv[3]).all === T.all ? 'adopted' : 'walked', s.v.files.has('resource/entity/many/e7.def'))`, L, G, M], { encoding: 'utf8' });
  ok(a.stdout.trim() === 'adopted true', 'createSource adopts its listing for the view: ' + a.stdout + a.stderr);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('listing ok');
process.exit(bad ? 1 : 0);
