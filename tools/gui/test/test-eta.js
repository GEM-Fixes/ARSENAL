// the mod check's expected wait (gui/checketa.js, GET /api/check/eta, the wizard's wz.eta line, the time left in the prog line and the job row).
// No history -> first guess from the defaults; a finished check -> one row, the estimate from history; past the estimate -> "taking longer".
// Needs no game and no browser; every child is a harmless node -e. Writes only under the scratch folder.
//   node tools/gui/test/test-eta.js [scratchDir]
// Author: Imperator_Aug (ARSENAL, ia-476ddd97)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const gui = require('../gui'), fakedom = require('./fakedom'), E = require('../checketa');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-eta-')));
fs.mkdirSync(S, { recursive: true });
process.env.AS2_NO_STEAM = '1'; delete process.env.AS2_GAME; delete process.env.GOH_GAME;
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), then the caller's check reports what is missing. Backup, never a hang
async function waitFor(cond, what, ms = 15000) { return (await W.until(cond, { who: 'test-eta', what, ms, step: 25 })) || null; }
const NODE = process.execPath, WRITEJSON = "require('fs').writeFileSync(process.argv[1],process.argv[2]);console.log('wrote result')";
function req(port, method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* ndjson */ } resolve({ status: res.statusCode, text: t, j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

function unit() {
  const q = { game: 'as64', kind: 'as2', mode: 'full', files: 93928, drive: 'E:' };
  let e = E.estimate([], q);
  ok(e.basis === 'guess' && e.n === 0 && e.sec === 465, 'no history: first guess, full check of 93,928 walked files = 465 s', JSON.stringify(e));
  ok(E.estimate([], Object.assign({}, q, { files: 10 })).sec === 15, 'a small mod: about the base (15 s)');
  ok(E.estimate([], Object.assign({}, q, { allgames: true })).sec === Math.round(465 * E.F_ALL), 'all games: x 2.2');
  ok(E.estimate([], Object.assign({}, q, { mode: 'fast' })).sec === E.SEC.fast && E.estimate([], Object.assign({}, q, { mode: 'noload' })).sec === E.SEC.noload, 'quick check and skip-load-check have their own defaults');
  ok(E.modeOf({ fast: true }) === 'fast' && E.modeOf({ noload: true }) === 'noload' && E.modeOf({ fast: true, noload: true }) === 'fast-noload' && E.modeOf({}) === 'full', 'modeOf');
  ok(E.driveOf('e:/My Mods/x') === 'E:' && E.driveOf('C:\\a') === 'C:', 'driveOf: the drive letter', E.driveOf('e:/x'));
  const row = (o) => Object.assign({ game: 'as64', kind: 'as2', mode: 'full', allgames: false, restorepoints: false, files: 1000, bytes: 1, sec: 115, drive: 'E:' }, o);
  e = E.estimate([row()], Object.assign({}, q, { files: 2000 }));
  ok(e.basis === 'history' && e.n === 1 && e.sec === 15 + 200, 'with history: rate from the same game + mode + drive (100 s per 1000 files)', JSON.stringify(e));
  e = E.estimate([row({ drive: 'C:', sec: 1015 }), row()], Object.assign({}, q, { files: 1000 }));
  ok(e.n === 1 && e.sec === 115, 'the same drive first', JSON.stringify(e));
  e = E.estimate([row({ game: 'mowas2' })], Object.assign({}, q, { files: 1000 }));
  ok(e.basis === 'history' && e.sec === 115, 'same game kind (MoW:AS2 and AS64) when the game has none', JSON.stringify(e));
  ok(E.estimate([row({ game: 'goh', kind: 'goh' })], q).basis === 'guess', 'GoH rows do not count for AS64');
  ok(E.estimate([row({ mode: 'fast' })], q).basis === 'guess', 'another mode does not count');
  e = E.estimate([row({ allgames: true, sec: Math.round(115 * E.F_ALL) })], Object.assign({}, q, { files: 1000 }));
  ok(Math.abs(e.sec - 115) <= 1, 'an all-games row is made comparable', JSON.stringify(e));
  e = E.estimate([row({ sec: 101 }), row({ sec: 115 }), row({ sec: 135 })], Object.assign({}, q, { files: 1000 }));
  ok(e.n === 3 && e.sec === 115, 'median of the rows', JSON.stringify(e));
  // the store: kept on disk, last 50
  const f = path.join(S, 'unit', 'check-times.json'), st = E.store(f);
  for (let i = 0; i < 55; i++) st.add(row({ sec: 100 + i }));
  ok(!st.add({ files: 0, sec: 1 }) && !st.add(null), 'a row without files or time is not kept');
  const back = E.store(f).rows();
  ok(back.length === E.KEEP && back[0].sec === 105 && back[49].sec === 154, 'the last 50 runs kept, read back from the file', back.length);
  fs.writeFileSync(f, '{bad');
  ok(E.store(f).rows().length === 0, 'a damaged file starts an empty list');
}

function loadPage(port, ls) {
  const doc = fakedom.make(), store = new Map(Object.entries(ls));
  const ctx = { document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: () => true, fetch: (u, o) => fetch('http://127.0.0.1:' + port + u, o) };
  ctx.window = ctx; vm.createContext(ctx);
  return { doc, ctx, run(html) { vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' }); } };
}

async function main() {
  unit();
  const mod = path.join(S, 'mods', 'alpha'), game = path.join(S, 'game'), etaFile = path.join(S, 'state', 'check-times.json');
  fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(etaFile, { force: true });
  fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(mod, 'mod.info'), '{Mod\r\n {Name "Alpha"}\r\n}\r\n');
  fs.writeFileSync(path.join(mod, 'resource', 'set', 'a.set'), '{a}\r\n');
  let exitCode = 0;
  const hook = (cc, info) => {
    const a = cc.args.slice(), i = a.indexOf('--json'), target = a[i + 1];
    if (exitCode) return { file: NODE, args: ['-e', 'process.exit(' + exitCode + ')'] };
    if (info.cmd === 'check' && i >= 0 && target) return { file: NODE, args: ['-e', WRITEJSON, target, JSON.stringify({ mod, findings: [], errors: [], notes: [] })] };
    return { file: NODE, args: ['-e', "console.log('echo')"] };
  };
  const A = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S, etaFile });
  try {
    const q = '/api/check/eta?dir=' + encodeURIComponent(mod);
    let r = await req(A.port, 'GET', q + '&files=93928&bytes=11811160064');
    ok(r.status === 200 && r.j.basis === 'guess' && r.j.sec === 465 && r.j.files === 93928 && r.j.mode === 'full', 'route: no history -> first guess from the defaults', r.text);
    r = await req(A.port, 'GET', q + '&files=93928&fast=1&gid=goh');
    ok(r.j.basis === 'guess' && r.j.sec === E.SEC.fast && r.j.mode === 'fast', 'route: quick check, GoH tab', r.text);
    r = await req(A.port, 'GET', q + '&trunc=1');
    ok(r.status === 200 && r.j.files === 2, 'route: capped count -> the shared walk counts the files', r.text);
    ok((await req(A.port, 'GET', '/api/check/eta?dir=rel/path')).status === 400, 'route: needs an absolute folder');
    // a finished check is recorded (with the counts of the last estimate); a failed one, a re-check with a patch are not
    exitCode = 2; await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod } }); exitCode = 0;
    ok(!fs.existsSync(etaFile), 'a check that failed (exit 2) is not recorded');
    await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod, with: path.join(S, 'patch') } });
    ok(!fs.existsSync(etaFile), 'a re-check with a patch is not recorded');
    const run = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod } });
    ok(run.j && run.j.code === 0, 'check ran', run.text.slice(0, 300));
    const saved = await waitFor(() => fs.existsSync(etaFile) && JSON.parse(fs.readFileSync(etaFile, 'utf8')).runs, 'history file');
    ok(saved && saved.length === 1 && saved[0].game === 'as64' && saved[0].kind === 'as2' && saved[0].mode === 'full' && saved[0].files === 2 && saved[0].sec > 0 && /^[A-Z]:$|^\//.test(saved[0].drive), 'one row: game, mode, files, time, drive', JSON.stringify(saved));
    r = await req(A.port, 'GET', q + '&files=2&bytes=20');
    ok(r.j.basis === 'history' && r.j.n === 1 && r.j.sec < 60, 'route: from history after one check', r.text);
    r = await req(A.port, 'GET', q + '&files=2&gid=goh');
    ok(r.j.basis === 'guess', 'route: the GoH tab has its own history', r.text);

    // ---- the page: the wz.eta line, the texts of the time left
    const html = (await req(A.port, 'GET', '/')).text;
    const P = loadPage(A.port, { 'as2gui.mod': JSON.stringify(mod), 'as2gui.game': JSON.stringify(game), 'as2gui.screen': JSON.stringify('check') });
    P.run(html);
    const el = await waitFor(() => { const x = P.doc.body.all().find(e => e.getAttribute && e.getAttribute('data-eta') === '1'); return x && /Expected wait/.test(x.textContent) ? x : null; }, 'the expected wait line');
    ok(el && /^Expected wait: under a minute \(\d+ files, [\d.]+ (B|KB)\), from your last check$/.test(el.textContent), 'wizard: expected wait beside the check button', el && el.textContent);
    const blk = el && el.parentNode;
    ok(blk && blk.getAttribute('data-blk') === 'wz.eta', 'its own leaf block wz.eta', blk && blk.getAttribute('data-blk'));
    const C = P.ctx.CHECKETA;
    ok(C.text({ sec: 465, basis: 'guess', n: 0, files: 112103, bytes: 11811160064 }) === 'Expected wait: about 8 min (112,103 files, 11 GB), first guess', 'text: first guess', C.text({ sec: 465, basis: 'guess', n: 0, files: 112103, bytes: 11811160064 }));
    ok(C.text({ sec: 30, basis: 'history', n: 4, files: 10, bytes: 2048 }) === 'Expected wait: under a minute (10 files, 2.0 KB), from your last 4 checks', 'text: from history', C.text({ sec: 30, basis: 'history', n: 4, files: 10, bytes: 2048 }));
    const now = Date.now();
    ok(C.left({ sec: 465, t0: now - 65000 }) === 'about 7 min left', 'time left', C.left({ sec: 465, t0: now - 65000 }));
    ok(C.left({ sec: 465, t0: now - 430000 }) === 'under a minute left', 'under a minute left');
    ok(C.left({ sec: 465, t0: now - 600000 }) === 'taking longer than expected, still working', 'past the estimate: "taking longer", no time limit', C.left({ sec: 465, t0: now - 600000 }));
    ok(C.left({ sec: 20000, t0: now }) === 'about 5.6 h left', 'hours for a very long check', C.left({ sec: 20000, t0: now }));
    // the job row of the check says the same
    const j = { id: 'r9', state: 'running', t0: now - 600000, dur: null, total: null, done: null, stage: '' }, row = { sec: {}, prog: {} };
    C.runs.r9 = { sec: 465, t0: now - 600000 }; C.row(j, row);
    ok(row.prog.textContent === 'taking longer than expected, still working', 'job row: the same text', row.prog.textContent);
    C.runs.r9 = { sec: 465, t0: now - 65000 }; j.stage = 'sdllint'; C.row(j, row);
    ok(row.prog.textContent === 'sdllint | about 7 min left', 'job row: stage | time left', row.prog.textContent);
    delete C.runs.r9; C.row(j, row);
    ok(row.prog.textContent === 'sdllint', 'another job: no time left text');
  } finally { await A.close(); }
  console.log((failN ? 'FAIL' : 'PASS') + ' test-eta: ' + pass + ' ok, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
}
main().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
