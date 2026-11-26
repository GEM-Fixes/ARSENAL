// 1B/1D: a folder reads only what the game mounts from a mod root; <mod>/.arsenal-undo (restore points)
// only with --restore-points (lib/sdlset keepOf); the read-ahead (ARSENAL_READ_WINDOW) and the threads give the same report
// Author: Imperator_Aug (ARSENAL, ia-3c88be31)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const sdllint = require('../sdllint'), sdlset = require('../../lib/sdlset');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'sdllint-undo-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const BAD = '{game_entity\r\n\t{x 1\r\n';   // BLOCK_UNCLOSED
  put('m/mod.info', '{name "m"}\r\n');
  put('m/resource/entity/a/a.def', '{game_entity\r\n}\r\n');
  put('m/resource/entity/a/b.def', BAD);
  put('m/.arsenal-undo/t1/resource/entity/a/b.def', BAD);
  put('m/resource/set/.arsenal-undo/t2/c.def', BAD);
  put('m/notes/n.def', BAD);
  put('m/localization/x.lng', '{t}\r\n');
  put('loose/entity/a/b.def', BAD);
  put('loose/.arsenal-undo/t1/entity/a/b.def', BAD);
  const m = path.join(w, 'm'), loose = path.join(w, 'loose');
  // files with a finding or an info row (a .def outside resource/entity is info: SDL_DEF_NOT_ENTITY)
  const files = o => { const j = sdllint.lint(o).rep.toJSON({ tool: 'sdllint' }); return [...new Set([...j.findings, ...j.info].map(f => String(f.file).replace(/\\/g, '/')))].sort(); };
  ok(JSON.stringify(files({ folder: m })) === JSON.stringify(['resource/entity/a/b.def']), 'default: only the mounted copy: ' + files({ folder: m }));
  const rp = files({ folder: m, restorePoints: true });
  ok(rp.includes('.arsenal-undo/t1/resource/entity/a/b.def') && rp.includes('resource/set/.arsenal-undo/t2/c.def'), '--restore-points reads the undo copies: ' + rp);
  ok(!rp.some(f => f.startsWith('notes/')), 'a root folder the game does not mount stays unread');
  // keys: the undo copy keeps its old key (resource/.arsenal-undo/...) with restore points, absent without
  const keys = o => [...sdlset.createSource(o).local.keys()];
  ok(keys({ folder: m, restorePoints: true }).includes('resource/.arsenal-undo/t1/resource/entity/a/b.def'), 'restore point key as before');
  ok(!keys({ folder: m }).some(k => k.includes('.arsenal-undo')), 'no undo key by default');
  ok(keys({ folder: m }).includes('resource/mod.info') && keys({ folder: m }).includes('resource/localization/x.lng'), 'root files and localization kept');
  const was = sdlset.restorePoints(true);
  ok(keys({ folder: m }).some(k => k.includes('.arsenal-undo')), 'process default restorePoints(true)');
  sdlset.restorePoints(was);
  // a loose resource tree (no resource/): every folder but .arsenal-undo
  ok(JSON.stringify(files({ folder: loose })) === JSON.stringify(['entity/a/b.def']), 'loose tree: undo left out: ' + files({ folder: loose }));
  // CLI: --restore-points, read window 0 / 1 / default, 1 or 2 threads: same report per mode
  const tool = path.join(__dirname, '..', 'sdllint.js');
  const cli = (args, env) => spawnSync(process.execPath, [tool, m, '--no-rc'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, env) }).stdout;
  const a = cli([]), b = cli(['--restore-points']);
  ok(!/arsenal-undo/.test(a) && /arsenal-undo/.test(b), 'CLI --restore-points');
  for (const env of [{ ARSENAL_READ_WINDOW: '0' }, { ARSENAL_READ_WINDOW: '1' }, { ARSENAL_PROGRESS: '1' }]) ok(cli([], env) === a, 'same report with ' + JSON.stringify(env));
  // many roots: the worker path (PAR_MIN 400) gives the same report as one thread
  for (let i = 0; i < 420; i++) put('m/resource/entity/many/e' + i + '.def', i % 50 ? '{game_entity\r\n}\r\n' : BAD);
  // (file cache off: each run really reads on 1 / 3 threads; filecache.test.js covers the cache)
  const one = cli(['--no-file-cache'], { SDLLINT_THREADS: '1' }), two = cli(['--no-file-cache'], { SDLLINT_THREADS: '3' }), z = cli(['--no-file-cache'], { SDLLINT_THREADS: '3', ARSENAL_READ_WINDOW: '0' });
  ok(one === two && one === z && /e400\.def/.test(one), 'threads / read window change the report');
  // ARSENAL_PROGRESS still names each root before its parse
  const pr = spawnSync(process.execPath, [tool, m, '-q', '--no-rc', '--no-file-cache'], { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_PROGRESS: '1', SDLLINT_THREADS: '1' }) }).stderr;
  ok(/PROGRESS at \d+ \d+ resource\/entity\/many\/e7\.def/.test(pr) && !/arsenal-undo/.test(pr), 'PROGRESS lines');
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('undo ok');
process.exit(bad ? 1 : 0);
