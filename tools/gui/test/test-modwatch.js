// X8: the GUI keeps the listing of the picked mod warm (tools/gui/modwatch.js). Proves on a scratch mod (never a real one):
//   the handed listing is byte-equal to a fresh lib/modtree scan, and after every kind of change (edit, new file, delete, case-only
//   rename, new folder) it is withheld until the changes settle, then equal to a fresh scan again (invalidation); events that cannot move
//   the scan (a read, restore points, an empty folder) do not count as a change; overflow (no name) = rescan; off switch (enable false,
//   ARSENAL_MODWATCH=0, setting as2gui.modwatch false) = no listing. Server: POST /api/modwatch, GET /api/modwatch/status, a check run
//   gets --listing <file> with the current scan (and none when off or stale), prio low = the child below normal priority.
//   check.js: --listing is taken, checked and dropped unless wouldload takes it (report identical with and without).
//   node tools/gui/test/test-modwatch.js [scratchDir]
// Author: Imperator_Aug (ARSENAL, ia-10249a1e)
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), EventEmitter = require('events');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-mw-')));
fs.mkdirSync(S, { recursive: true });
process.env.AS2_NO_STEAM = '1'; delete process.env.AS2_GAME; delete process.env.GOH_GAME; delete process.env.ARSENAL_MODWATCH;
const mt = require('../../lib/modtree');
mt._reset({ store: null });
const MW = require('../modwatch');
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), only then a miss is reported. Backup, never a hang
async function waitFor(cond, what, ms = 20000) { const v = await W.until(cond, { who: 'test-modwatch', what, ms, step: 30 }); if (!v) { ok(false, 'not done after the long wait: ' + what); return null; } return v; }
const strip = T => T && JSON.stringify({ dir: T.dir, count: T.count, bytes: T.bytes, all: T.all, areas: T.areas, files: T.files, left: T.left });
function req(port, method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* ndjson */ } resolve({ status: res.statusCode, text: t, j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function mkMod(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const w = (rel, t) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  w('mod.info', '{Mod\r\n\t{Name "mw"}\r\n}\r\n');
  w('resource/set/a.set', '{a 1}\r\n');
  w('resource/entity/x/y.def', '{y}\r\n');
  w('Resource/Map/M1/map.info', '{m}\r\n');
  w('.arsenal-undo/old/a.set', 'old');
  return dir;
}
// equal to a fresh scan made now (the proof the handed listing is the one the check would make itself)
async function same(w, dir, what) {
  const T = w.listing(dir), F = await mt.scan(dir, { names: false, restorePoints: false }).then(x => x);
  ok(!!T && strip(T) === strip(F), what + ': the listing equals a fresh scan', T ? T.all + ' vs ' + F.all : 'no listing');
  return T;
}

async function unit() {
  const dir = mkMod(path.join(S, 'mods', 'mw1'));
  const w = MW.create({ modtree: mt, settleMs: 250 });
  ok(w.listing(dir) === null && !w.status(dir).watching, 'nothing picked: no listing');
  w.set(dir);
  await waitFor(() => w.status(dir).ready, 'first scan');
  let T0 = await same(w, dir, 'first scan');
  ok(w.status(dir).gen === 0 && w.status(dir).sid >= 1, 'first scan: gen 0', JSON.stringify(w.status(dir)));
  ok(w.listing(path.join(S, 'mods', 'other')) === null && w.listing(dir.toUpperCase()) === T0, 'another folder: none; the same folder in other letter case: the same');
  // a read only (last access may move) and restore points: no change
  fs.readFileSync(path.join(dir, 'resource/set/a.set'));
  fs.writeFileSync(path.join(dir, '.arsenal-undo/old/b.set'), 'new restore point');
  await sleep(600);   // "nothing changes": no event to wait on; then any lstat still open is let finish
  await W.until(() => w.listing(dir) !== null, { who: 'test-modwatch', what: 'a read: lstat done', step: 30 });
  ok(w.status(dir).ready && w.status(dir).gen === 0 && w.listing(dir) === T0, 'a read and a restore point write: the listing stays, no change counted', JSON.stringify(w.status(dir)));
  // each kind of change: withheld at once, current again after the settle, gen + 1, equal to a fresh scan
  const steps = [
    ['an edit (size + time)', () => fs.appendFileSync(path.join(dir, 'resource/set/a.set'), '{b 2}\r\n')],
    ['a new file', () => fs.writeFileSync(path.join(dir, 'resource/set/new.set'), '{n}\r\n')],
    ['a deleted file', () => fs.rmSync(path.join(dir, 'resource/set/new.set'))],
    ['a case-only rename', () => fs.renameSync(path.join(dir, 'resource/entity/x/y.def'), path.join(dir, 'resource/entity/x/Y.def'))],
    ['a folder moved in', () => { const t = path.join(S, 'outside'); fs.rmSync(t, { recursive: true, force: true }); fs.mkdirSync(path.join(t, 'deep'), { recursive: true }); fs.writeFileSync(path.join(t, 'deep', 'z.set'), 'z'); fs.renameSync(t, path.join(dir, 'resource', 'moved')); }],
    ['a folder renamed', () => fs.renameSync(path.join(dir, 'resource', 'moved'), path.join(dir, 'resource', 'moved2'))],
    ['the same time, other size', () => { const f = path.join(dir, 'mod.info'), st = fs.statSync(f); fs.writeFileSync(f, '{Mod\r\n\t{Name "mw2"}\r\n}\r\n'); fs.utimesSync(f, st.atime, st.mtime); }],
  ];
  let gen = 0;
  for (const [what, fn] of steps) {
    fn();
    await waitFor(() => w.listing(dir) === null, what + ': listing withheld', 5000);
    await waitFor(() => w.status(dir).ready, what + ': settled');
    gen++;
    ok(w.status(dir).gen === gen, what + ': one change counted', JSON.stringify(w.status(dir)));
    await same(w, dir, what);
  }
  // an empty folder: rescanned once, no change counted, and its later events do not start another walk
  const Tpre = w.listing(dir);
  fs.mkdirSync(path.join(dir, 'empty'));
  await waitFor(() => w.status(dir).ready && w.listing(dir) !== Tpre, 'empty folder: rescanned and settled');
  ok(w.status(dir).gen === gen, 'an empty folder: no change counted');
  const T1 = w.listing(dir);
  fs.readdirSync(path.join(dir, 'empty')); fs.utimesSync(path.join(dir, 'empty'), new Date(), new Date());
  await sleep(600);   // "nothing changes": no event to wait on; then any lstat still open is let finish
  await W.until(() => w.listing(dir) !== null, { who: 'test-modwatch', what: 'empty folder events: lstat done', step: 30 });
  ok(w.listing(dir) === T1, 'events of a known empty folder: the listing stays');
  // off: enable(false) = none; on again = a new watch
  w.enable(false);
  ok(w.listing(dir) === null && !w.status(dir).watching && w.status(dir).enabled === false, 'enable(false): no watch, no listing');
  w.enable(true);
  await waitFor(() => w.status(dir).ready, 'enabled again');
  await same(w, dir, 'enabled again');
  // listingFile: the JSON the check gets; drop removes it
  const lf = await w.listingFile(dir, path.join(S, 'tmp'));
  ok(lf && JSON.stringify(JSON.parse(fs.readFileSync(lf, 'utf8'))) === JSON.stringify(w.listing(dir)), 'listingFile: the scan as JSON');
  MW.drop(lf); ok(!fs.existsSync(lf), 'drop removes it');
  fs.appendFileSync(path.join(dir, 'mod.info'), '\r\n');
  await waitFor(() => w.listing(dir) === null, 'stale before listingFile', 5000);
  ok(await w.listingFile(dir, path.join(S, 'tmp')) === null, 'listingFile while stale: none');
  // no mod: stops
  w.set('');
  ok(!w.status(dir).watching && w.listing(dir) === null, 'no mod picked: the watch stops');
  w.close();
  // the folder gone: the watch stops, no listing
  const dir2 = mkMod(path.join(S, 'mods', 'mw2'));
  const w2 = MW.create({ modtree: mt, settleMs: 150 });
  w2.set(dir2);
  await waitFor(() => w2.status(dir2).ready, 'second mod');
  fs.rmSync(dir2, { recursive: true, force: true });
  await waitFor(() => w2.listing(dir2) === null && !w2.status(dir2).ready, 'folder gone: no listing', 8000);
  w2.close();
  // overflow (an event without a name) and a watch error, with a fake watch
  const dir3 = mkMod(path.join(S, 'mods', 'mw3'));
  let fire = null; const fake = new EventEmitter();
  fake.close = () => {};
  const w3 = MW.create({ modtree: mt, settleMs: 150, watch: (d, o, cb) => { fire = cb; return fake; } });
  w3.set(dir3);
  await waitFor(() => w3.status(dir3).ready, 'fake watch: first scan');
  fire('change', null);
  ok(w3.listing(dir3) === null, 'overflow (no name): listing withheld at once');
  await waitFor(() => w3.status(dir3).ready, 'overflow: rescanned');
  const T3 = w3.listing(dir3);
  fire('change', 'resource/set/a.set');                         // same size and time: not a change
  await W.until(() => w3.listing(dir3) !== null, { who: 'test-modwatch', what: 'fake event: lstat done', step: 30 });
  ok(w3.status(dir3).ready && w3.listing(dir3) === T3, 'an event that moves nothing: the listing stays');
  fake.emit('error', Object.assign(new Error('x'), { code: 'EPERM' }));
  ok(!w3.status(dir3).watching && w3.listing(dir3) === null && w3.status(dir3).err === 'EPERM', 'watch error: stops, says why', JSON.stringify(w3.status(dir3)));
  w3.close();
  // env off
  process.env.ARSENAL_MODWATCH = '0';
  const w4 = MW.create({ modtree: mt });
  w4.set(dir3);
  ok(!w4.status(dir3).watching && !w4.status(dir3).enabled, 'ARSENAL_MODWATCH=0: no watch');
  w4.close(); delete process.env.ARSENAL_MODWATCH;
  // a watch that cannot start (folder missing)
  const w5 = MW.create({ modtree: mt });
  w5.set(path.join(S, 'mods', 'nothere'));
  ok(!w5.status(path.join(S, 'mods', 'nothere')).watching && !!w5.status(path.join(S, 'mods', 'nothere')).err, 'a folder that cannot be watched: no watch, an error');
  w5.close();
}

async function server() {
  const gui = require('../gui');
  const dir = mkMod(path.join(S, 'mods', 'mws'));
  const seen = [];
  const NODE = process.execPath;
  // the check child: records its argv, the listing file it was given (content) and its own priority after a moment
  const hook = (cc, info) => {
    if (info.cmd !== 'check') return cc;
    const a = cc.args, li = a.indexOf('--listing'), lf = li >= 0 ? a[li + 1] : '', jf = a[a.indexOf('--json') + 1], rec = path.join(S, 'rec-' + seen.length + '.json');
    seen.push(rec);
    const js = "const fs=require('fs'),os=require('os');setTimeout(()=>{const lf=process.argv[1];fs.writeFileSync(process.argv[2],JSON.stringify({args:JSON.parse(process.argv[4]),listing:lf&&fs.existsSync(lf)?fs.readFileSync(lf,'utf8'):null,prio:os.getPriority()}));fs.writeFileSync(process.argv[3],JSON.stringify({findings:[],errors:[],notes:[]}))},400)";
    return { file: NODE, args: ['-e', js, lf, rec, jf, JSON.stringify(a)] };
  };
  const A = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S, modwatchSettleMs: 250 });
  try {
    let r = await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir));
    ok(r.status === 200 && r.j.watching === false && r.j.enabled === true, 'status before a pick: not watching, enabled', r.text);
    ok((await req(A.port, 'POST', '/api/modwatch', { dir: 'rel/x' })).status === 400, 'POST /api/modwatch: a relative folder refused');
    r = await req(A.port, 'POST', '/api/modwatch', { dir });
    ok(r.status === 200 && r.j.watching === true, 'POST /api/modwatch: watching', r.text);
    await waitFor(async () => (await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir))).j.ready, 'server: ready');
    const run = async (extra) => {
      const n = seen.length, rr = await req(A.port, 'POST', '/api/run?stream=0', Object.assign({ cmd: 'check', input: { mod: dir } }, extra || {}));
      if (!seen[n] || !fs.existsSync(seen[n])) throw new Error('the check run did not record: ' + rr.text.slice(0, 600));
      return JSON.parse(fs.readFileSync(seen[n], 'utf8'));
    };
    let x = await run();
    const F = await mt.scan(dir);
    ok(x.args.includes('--listing') && x.listing && strip(JSON.parse(x.listing)) === strip(F), 'a check of the watched mod gets --listing with the current scan', JSON.stringify(x.args));
    ok(!fs.existsSync(x.args[x.args.indexOf('--listing') + 1]), 'the listing file is removed after the run');
    const normal = x.prio;
    x = await run({ prio: 'low' });
    ok(x.prio > normal || (process.platform !== 'win32' && x.prio >= 10), 'prio low: the child runs below normal priority', normal + ' -> ' + x.prio);
    // stale: a change not yet settled = no listing
    fs.appendFileSync(path.join(dir, 'resource/set/a.set'), 'x');
    await waitFor(async () => !(await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir))).j.ready, 'server: stale', 5000);
    x = await run();
    const ok1 = !x.args.includes('--listing');
    await waitFor(async () => (await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir))).j.ready, 'server: ready again');
    r = await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir));
    ok(r.j.gen === 1, 'status: one change counted', r.text);
    // (the run while stale may land after the settle on a slow PC: then it had the new scan, which is right too)
    if (!ok1) ok(strip(JSON.parse(x.listing)) === strip(await mt.scan(dir)), 'a run after the settle has the new scan');
    x = await run();
    ok(x.listing && strip(JSON.parse(x.listing)) === strip(await mt.scan(dir)), 'after the settle: the new scan is handed on');
    // another mod checked: no listing
    const other = mkMod(path.join(S, 'mods', 'mwo'));
    const n = seen.length; await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod: other } });
    ok(!JSON.parse(fs.readFileSync(seen[n], 'utf8')).args.includes('--listing'), 'a check of another folder: no listing');
    // the setting off: no watch, no listing; on again: watched again
    r = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.modwatch': false } });
    ok(r.status === 200, 'the setting as2gui.modwatch is a window setting', r.text);
    r = await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir));
    ok(r.j.enabled === false && r.j.watching === false, 'setting off: the watch stops', r.text);
    x = await run();
    ok(!x.args.includes('--listing'), 'setting off: the check lists the mod itself (no --listing)');
    await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.modwatch': true } });
    await waitFor(async () => (await req(A.port, 'GET', '/api/modwatch/status?dir=' + encodeURIComponent(dir))).j.ready, 'setting on: watched again');
    ok((await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.modwatch.auto': true } })).status === 200, 'the setting as2gui.modwatch.auto is a window setting');
    r = await req(A.port, 'POST', '/api/modwatch', { dir: '' });
    ok(r.status === 200 && !r.j.watching, 'no mod picked: the watch stops', r.text);
  } finally { await A.close(); }
}

// check.js: --listing is read and handed to wouldload only when wouldload takes it; the report is the same either way
function checkCli() {
  const CHECK = path.join(__dirname, '..', '..', 'check', 'check.js');
  const dir = mkMod(path.join(S, 'cli', 'mwc'));
  const lf = path.join(S, 'cli-listing.json');
  return mt.scan(dir).then(T => {
    fs.writeFileSync(lf, JSON.stringify(T));
    const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' });
    const go = (extra, ta) => W.spawnSync(NODEX, [CHECK, dir, '--no-load-check', '--only', 'modinfo', ...extra], { encoding: 'utf8', env: Object.assign({}, env, ta ? { CHECK_TEST_ARGS: ta } : {}), timeout: 300000 }, 'test-modwatch');
    const a = go([]), b = go(['--listing', lf]);
    ok(a.status === b.status && a.stdout === b.stdout, 'check: the report is the same with --listing', a.stdout.slice(-300) + '\n---\n' + b.stdout.slice(-300));
    const bad = go(['--listing']);
    ok(bad.status === 2 && /--listing needs a value/.test(bad.stderr), 'check: --listing needs a value', bad.stderr);
    const ta = path.join(S, 'cli-ta'), wl = fs.readFileSync(path.join(__dirname, '..', '..', 'wouldload', 'wouldload.js'), 'utf8');
    const takes = (/function parseArgs\([\s\S]*?\n}/.exec(wl) || [''])[0].includes("'--listing'");
    fs.rmSync(ta, { recursive: true, force: true });
    go(['--listing', lf, '--fast'].filter(x => x !== '--fast'), ta);
    // --no-load-check: wouldload does not run, so no wouldload.args at all
    ok(!fs.existsSync(path.join(ta, 'wouldload.args')), 'check --no-load-check: wouldload not started');
    return takes;
  });
}
const NODEX = process.execPath;

(async () => {
  await unit();
  await server();
  const takes = await checkCli();
  console.log(`${failN ? 'FAIL' : 'PASS'} test-modwatch: ${pass} ok, ${failN} failed${takes ? '' : ' (wouldload does not take --listing yet: check drops it)'}`);
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
