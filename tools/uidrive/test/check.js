// uidrive pure test: no game, no input. route map shape, scale, log offset, fail fast with a fake driver.
// Author: Imperator_Aug (ARSENAL, ia-c2bac07f)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const U = require('../uidrive');

(async () => {
  const m = U.loadMap('goh');
  const known = ['launch', 'click', 'rclick', 'key', 'wheel', 'wait_log', 'wait_exit'];
  for (const [n, r] of Object.entries(m.routes)) for (const st of r) {
    assert(known.some(k => st[k]), `${n}: step has no action ${JSON.stringify(st)}`);
    assert(st.expect || st.wait_log || st.wait_exit, `${n}: step has no signal ${JSON.stringify(st)}`);
    if (st.click) assert(st.click[0] < m.base[0] && st.click[1] < m.base[1], `${n}: click outside base`);
  }
  assert.deepStrictEqual(U.scale([960, 540], [1920, 1080], { w: 1280, h: 720 }), [640, 360]);

  // per-map game: %GAME% and %USER% follow the map's game (made-up folders through the seams; nothing read from the machine)
  assert.strictEqual(m.game, 'goh');
  const m2 = U.loadMap('mowas2');
  assert.strictEqual(m2.game, 'mowas2');
  for (const r of Object.values(m2.routes)) for (const st of r) if (st.click || st.rclick) assert((st.click || st.rclick)[0] < m2.base[0], 'mowas2 click outside base');
  const seams = { install: id => (id === 'goh' ? 'X:/goh' : 'X:/as2'), userDir: id => (id === 'goh' ? 'U:/goh' : 'U:/as2') };
  assert.strictEqual(U.expand(m2.exe, {}, m2.game, seams), 'X:/as2/mowas_2.exe', 'mowas2 exe lands in the AS2 install, not the GoH one');
  assert.strictEqual(U.expand(m2.log, {}, m2.game, seams), 'U:/as2/log/game.log');
  assert.strictEqual(U.expand(m.exe, {}, m.game, seams), 'X:/goh/binaries/x64/call_to_arms.exe');
  assert.strictEqual(U.expand(m.log, {}, m.game, seams), 'U:/goh/log/game.log');
  assert.strictEqual(U.expand(m2.exe, { AS2_GAME: 'Y:/as2', GOH_GAME: 'Y:/goh' }, m2.game, seams), 'Y:/as2/mowas_2.exe', 'AS2_GAME for mowas2');
  assert.strictEqual(U.expand(m.exe, { AS2_GAME: 'Y:/as2', GOH_GAME: 'Y:/goh' }, m.game, seams), 'Y:/goh/binaries/x64/call_to_arms.exe', 'GOH_GAME for goh (inplay-nopipe sets it)');
  assert.strictEqual(U.expand(m2.exe, {}, m2.game, { ...seams, gameDir: 'Z:/g' }), 'Z:/g/mowas_2.exe', '--game wins');
  assert.throws(() => U.expand(m2.exe, {}, m2.game, { install: () => null }), /no MoW:AS2 install found/);
  assert.strictEqual(U.expand('%GAME%/a', { GOH_GAME: 'Y:/goh' }), 'Y:/goh/a', 'old call (no game): goh as before');
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'uidrive-map-'));
  const mk = (n, extra) => { const f = path.join(tdir, n + '.json'); fs.writeFileSync(f, JSON.stringify({ proc: 'p', exe: 'e', log: 'l', base: [1, 1], routes: {}, ...extra })); return f; };
  assert.strictEqual(U.loadMap(mk('old')).game, 'goh', 'a map without "game" stays goh');
  assert.throws(() => U.loadMap(mk('as64', { game: 'as64' })), /control pipe/);
  assert.throws(() => U.loadMap(mk('bad', { game: 'nope' })), /must be goh or mowas2/);
  {
    // CLI: an AS64 map is refused with the games.notFor line and exit 2; a malformed map stays exit 1
    const cli = p => require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'uidrive.js'), 'where', p], { encoding: 'utf8' });
    const r = cli(mk('as64c', { game: 'as64' }));
    assert.strictEqual(r.status, 2, r.stderr);
    assert.strictEqual(r.stderr.trim(), 'uidrive: not available for AS64: AS64 is driven through its control pipe (testrun), not by window input (TST-17)');
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(cli(mk('badc', { game: 'nope' })).status, 1, 'bad game word: exit 1');
  }
  fs.rmSync(tdir, { recursive: true, force: true });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uidrive-')), f = path.join(dir, 'game.log');
  fs.writeFileSync(f, 'GUI: Activate page page_main\nold\n');
  const w = new U.LogWatch(f);
  // old line must not match: the slip this offset exists for
  await assert.rejects(w.wait('page_main', 0.3), /no \/page_main/);
  fs.appendFileSync(f, 'GUI: Activate page page_main\n');
  assert((await w.wait('page_main', 2)).line.includes('page_main'));
  // restart: file shrinks, offset falls back
  fs.writeFileSync(f, 'x\n');
  fs.appendFileSync(f, 'y\n');
  assert.deepStrictEqual(w.read(), ['x', 'y']);
  // half-written line waits for its newline
  fs.appendFileSync(f, 'par'); assert.deepStrictEqual(w.read(), []);
  fs.appendFileSync(f, 'tial\n'); assert.deepStrictEqual(w.read(), ['partial']);

  // play with a fake driver: each input appends the expected line; a missing line stops the route at that step
  const inputs = [];
  const io = expectFor => ({
    log: new U.LogWatch(f), running: () => true, launch() {}, size: () => ({ w: 1920, h: 1080 }),
    win(op, a) { inputs.push([op, a.X, a.Y]); const l = expectFor(inputs.length); if (l) fs.appendFileSync(f, l + '\n'); },
  });
  const map = { base: [1920, 1080], timeout: 0.3, routes: { r: [{ click: [1, 2], expect: 'one' }, { click: [3, 4], expect: 'two' }, { click: [5, 6], expect: 'three' }] } };
  await U.play(map, ['r'], io(n => ['one', 'two', 'three'][n - 1]), () => {});
  assert.strictEqual(inputs.length, 3);
  inputs.length = 0;
  await assert.rejects(U.play(map, ['r'], io(n => (n === 1 ? 'one' : 'nope')), () => {}), /r\[1\].*no \/two/);
  assert.strictEqual(inputs.length, 2, 'stops after the first missing signal');
  // launch refused when already running
  await assert.rejects(U.play({ ...map, routes: { b: [{ launch: true, expect: 'x' }] } }, ['b'], io(() => null), () => {}), /already running/);
  await assert.rejects(U.play(map, ['nosuch'], io(() => null), () => {}), /no route/);
  fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e.message); process.exit(1); });
