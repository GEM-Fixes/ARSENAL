// workshop tests: fixture game folders and a fixture package in a temp dir. Nothing is started (spawn is a stub), no real game
// folder is read or written. Last line PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-5752d11a)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const W = require('../workshop');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-'));
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = f => fs.readFileSync(f, 'utf8');
try {
  const pk = path.join(root, 'pk');
  put(path.join(pk, W.EXE), 'uploader v2'); put(path.join(pk, W.DLL), 'package dll'); put(path.join(pk, W.APPID), '244450');
  const o = { env: { ARSENAL_WORKSHOP_GUI: pk }, execPath: 'C:/x/node.exe', repo: path.join(root, 'norepo') };

  // ---- which game, which folder
  const as2 = path.join(root, 'as2'); put(path.join(as2, 'mowas_2.exe'), 'x');
  const a64 = path.join(root, 'a64'); put(path.join(a64, 'as64.exe'), 'x'); put(path.join(a64, 'mowas_2.exe'), 'x');
  const goh = path.join(root, 'goh'); put(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'x');
  put(path.join(goh, 'binaries', 'x64', W.DLL), 'the game dll'); put(path.join(goh, 'binaries', 'x64', W.APPID), '400750');
  assert.deepStrictEqual([W.target(as2).kind, W.target(as2).dir, W.target(as2).appid], ['as2', as2, '244450']);
  assert.strictEqual(W.target(a64).kind, 'as64');
  assert.deepStrictEqual([W.target(goh).kind, W.target(goh).dir, W.target(goh).appid], ['goh', path.join(goh, 'binaries', 'x64'), '400750']);
  ok('Assault Squad 2 and the 64-bit build: the game folder; Gates of Hell: binaries/x64, its own Steam id');
  const none = path.join(root, 'none'); fs.mkdirSync(none);
  let r = W.plan(none, o); assert.strictEqual(r.code, 2); assert.ok(/not a game folder/.test(r.msg));
  r = W.install(none, o); assert.strictEqual(r.code, 2); assert.deepStrictEqual(fs.readdirSync(none), []);
  ok('a folder that is not a game: refused, nothing written');

  // ---- a game folder that has nothing yet
  r = W.plan(as2, o);
  assert.deepStrictEqual([r.installed, r.todo, r.steps.map(s => s.action).join()], [false, 3, 'copy,copy,write']); ok('status: not installed, three files to place');
  r = W.install(as2, Object.assign({ dry: true }, o));
  assert.strictEqual(r.written, false); assert.deepStrictEqual(fs.readdirSync(as2), ['mowas_2.exe']); ok('install --dry writes nothing');
  r = W.install(as2, o);
  assert.deepStrictEqual([r.code, r.done.join(), r.installed, r.upToDate, r.todo], [0, [W.EXE, W.DLL, W.APPID].join(), true, true, 0]);
  assert.deepStrictEqual([read(path.join(as2, W.EXE)), read(path.join(as2, W.DLL)), read(path.join(as2, W.APPID))], ['uploader v2', 'package dll', '244450']);
  assert.deepStrictEqual(fs.readdirSync(as2).sort(), ['mowas_2.exe', W.APPID, W.DLL, W.EXE].sort()); ok('install places the three files and nothing else');
  r = W.install(as2, o); assert.deepStrictEqual([r.code, r.done.length], [0, 0]); ok('installing again changes nothing');

  // ---- Gates of Hell: the dll that is there stays
  r = W.plan(goh, o);
  assert.deepStrictEqual(r.steps.map(s => s.file + ':' + s.action), [W.EXE + ':copy', W.DLL + ':keep', W.APPID + ':keep']); ok('Gates of Hell status: only the uploader is copied');
  r = W.install(goh, o);
  const gx = path.join(goh, 'binaries', 'x64');
  assert.deepStrictEqual([r.done.join(), read(path.join(gx, W.DLL)), read(path.join(gx, W.APPID)), read(path.join(gx, W.EXE))], [W.EXE, 'the game dll', '400750', 'uploader v2']);
  assert.ok(!fs.existsSync(path.join(goh, W.EXE))); ok('Gates of Hell install: steam_api64.dll and steam_appid.txt are not overwritten');

  // ---- an older uploader and the game's own dll in an Assault Squad 2 folder
  put(path.join(a64, W.EXE), 'uploader v1'); put(path.join(a64, W.DLL), 'the game dll'); put(path.join(a64, W.APPID), '244450\n');
  r = W.plan(a64, o);
  assert.deepStrictEqual([r.installed, r.upToDate, r.steps.map(s => s.action).join()], [true, false, 'replace,keep,keep']);
  r = W.install(a64, o);
  assert.deepStrictEqual([r.done.join(), read(path.join(a64, W.EXE)), read(path.join(a64, W.DLL)), read(path.join(a64, W.APPID)), r.upToDate], [W.EXE, 'uploader v2', 'the game dll', '244450\n', true]);
  ok('an older uploader is replaced; the dll already there is kept in every game');

  // ---- no package
  const bare = { env: {}, execPath: 'C:/x/node.exe', repo: path.join(root, 'norepo') };
  const g2 = path.join(root, 'g2'); put(path.join(g2, 'as64.exe'), 'x');
  r = W.install(g2, bare); assert.strictEqual(r.code, 2); assert.ok(/not part of this copy/.test(r.msg)); assert.deepStrictEqual(fs.readdirSync(g2), ['as64.exe']);
  ok('no package: plain refusal, nothing written');
  const side = path.join(root, 'app'); put(path.join(side, 'workshop_gui', W.EXE), 'x');
  assert.strictEqual(W.packageDir({ env: {}, execPath: path.join(side, 'ARSENAL.exe'), repo: path.join(root, 'norepo') }).dir, path.join(side, 'workshop_gui'));
  ok('the package is found in the workshop_gui folder beside ARSENAL.exe');
  const real = W.packageDir({ env: {} });
  assert.ok(real.dir && [W.EXE, W.DLL, W.APPID, 'README.md'].every(f => fs.existsSync(path.join(real.dir, f)))); ok('this copy of ARSENAL holds the package');

  // ---- start
  const calls = [], spawn = (exe, args, opt) => { calls.push({ exe, args, opt }); return { pid: 9, unref() {}, on() {} }; };
  r = W.start(g2, Object.assign({ spawn }, o)); assert.strictEqual(r.code, 2); assert.ok(/Install it first/.test(r.msg)); assert.strictEqual(calls.length, 0); ok('start before install: refused, nothing started');
  r = W.start(goh, Object.assign({ spawn, dry: true }, o)); assert.deepStrictEqual([r.code, r.started, calls.length], [0, false, 0]); ok('start --dry starts nothing');
  r = W.start(goh, Object.assign({ spawn }, o));
  assert.deepStrictEqual([r.started, calls[0].exe, calls[0].opt.cwd, calls[0].opt.detached, calls[0].args.length], [true, path.join(gx, W.EXE), gx, true, 0]); ok('start runs the uploader from the folder it is in');
  fs.rmSync(path.join(as2, W.DLL));
  r = W.start(as2, Object.assign({ spawn }, o)); assert.strictEqual(r.code, 2); assert.strictEqual(calls.length, 1); ok('start without steam_api64.dll beside it: refused');
  assert.ok(/never overwritten/.test(W.text(W.plan(goh, o), 'status'))); ok('the status text says the dll is never overwritten');
  console.log('PASS workshop (' + n + ')');
} catch (e) { console.error(e); console.log('FAIL'); process.exitCode = 1; } finally { fs.rmSync(root, { recursive: true, force: true }); }
