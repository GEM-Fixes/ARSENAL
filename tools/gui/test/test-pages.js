// T-GUI test: the 5 pages (Mods, Generator, Upgrade or Port, Check, Play) + Advanced (Test run), no game launch, no browser. W5 Make split: new sits
// on Mods, gen on the Generator (page id make), upgrade on Upgrade or Port; Translate is a fold of the GoH unit page (ext/goh).
//   node tools/gui/test/test-pages.js [scratchDir]
// 1. contract.PAGES: 5 pages in order; every action is a contract command; every door word is in tools/as2/menu.js DOOR; ADVANCED_PAGES = test
// 2. en.json: the button of every action carries its door word; page titles are Mods, Generator, Upgrade or Port, Check, Play
// 3. GOLD: for check, new, gen (--sample spec, plan) and play (--dry): the page action through the server (the same call the page button posts) against
//    the front door `node tools/as2/as2.js <door word> ...`: exit code, stdout, stderr. Only run noise is normalised (timings, \ vs /, check overlay folder name).
// (the page under the fake DOM, 4 tabs + Advanced switch: test-gui2.js)
// Author: Imperator_Aug (ARSENAL, ia-d6c83e0f)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const gui = require('../gui'), contract = require('../contract'), gamedir = require('../../lib/gamedir'), menu = require('../../as2/menu');
const TOOLS = path.join(__dirname, '..', '..');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-pages-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };

function post(port, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/run?stream=0', agent: false, headers: { host: '127.0.0.1:' + port, 'content-type': 'application/json', 'content-length': data.length } }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => resolve({ status: res.statusCode, j: JSON.parse(Buffer.concat(ch).toString('utf8')) }));
    });
    r.on('error', reject); r.write(data); r.end();
  });
}
const front = args => {   // the front door as a user runs it: node tools/as2/as2.js <door word> ...
  const r = cp.spawnSync(process.execPath, [path.join(TOOLS, 'as2', 'as2.js'), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  const sp = s => (s || '').split('\n').map(l => l.replace(/\r$/, '')).filter((l, i, a) => l !== '' || i < a.length - 1);
  return { code: r.status, out: sp(r.stdout), err: sp(r.stderr) };
};
const norm = l => l.replace(/check-ov-[A-Za-z0-9]+/g, 'check-ov-X').replace(/"ms": \d+/g, '"ms": <t>').replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/\b\d+(\.\d+)? ?(ms|s)\b/g, '<t>').replace(/^PROGRESS .*$/, '').replace(/^NOTE REUSED_CHECK .*$/, '');   // REUSED_CHECK: the second of two same checks replays the first (tools/check, lib/checkcache)
const lines = (j, s) => j.lines.filter(l => l.s === s).map(l => l.line);
function gold(name, j, c) {
  ok(j.code === c.code, name + ': exit ' + j.code + ' vs front door ' + c.code, lines(j, 'err').join('\n'));
  for (const [k, a, b] of [['stdout', lines(j, 'out'), c.out], ['stderr', lines(j, 'err'), c.err]]) {
    const x = a.map(norm).filter(Boolean), y = b.map(norm).filter(Boolean), i = x.findIndex((l, n) => l !== y[n]);
    ok(x.length === y.length && i < 0, name + ': ' + k + ' differs from the front door', x.length + ' vs ' + y.length + ' lines; first ' + (i < 0 ? 'past end' : x[i] + ' | ' + y[i]));
  }
  return c.out.length;
}

async function main() {
  // ---- 1 + 2: structure
  const P = contract.PAGES, en = require('../lang/en.json'), DOORS = new Set(menu.DOOR.map(d => d[0]));
  ok(P.map(p => p.id + ':' + p.title).join(',') === 'mods:Mods,make:Generator,upgrade:Upgrade or Port,check:Check,play:Play', 'five pages in order Mods, Generator (id make), Upgrade or Port, Check, Play', P.map(p => p.id + ':' + p.title).join());
  ok(P.find(p => p.id === 'mods').actions.map(a => a.id).join() === 'new' && P.find(p => p.id === 'make').actions.map(a => a.id).join() === 'gen-plan,gen' && P.find(p => p.id === 'upgrade').actions.map(a => a.id).join() === 'upgrade-plan,upgrade', 'new on Mods, gen on the Generator, upgrade on Upgrade or Port');
  ok(contract.ADVANCED_PAGES.length === 0, 'Advanced holds no whole page (Test Run is a sub-tab of Test, Share & Play; Translate is on the GoH unit page)');
  ok(en['nav.mods'] === 'Mods' && en['nav.make'] === 'Generator' && en['nav.upgrade'] === 'Upgrade or Port' && !('nav.xlate' in en) && en['nav.check'] === 'Check' && en['nav.play'] === 'Play' && en['nav.settings'] === 'Settings', 'page titles in en.json (the Make page is labelled Generator)');
  const BTN = { new: 'nw.go', 'gen-plan': 'new.plan2', gen: 'new.write', 'upgrade-plan': 'up.preview', upgrade: 'up.write', check: 'check.run', 'fix-plan': 'fix.plan', fix: 'fix.apply',
    'install-dry': 'ins.dry', install: 'ins.install', uninstall: 'rm.remove', 'play-dry': 'pl.dry', play: 'pl.go' };
  for (const p of P) for (const a of p.actions) {
    ok(!!contract.COMMANDS[a.cmd], p.id + '/' + a.id + ': contract command ' + a.cmd + ' exists');
    ok(DOORS.has(a.door), p.id + '/' + a.id + ': door word ' + a.door + ' is in menu.js DOOR');
    ok(BTN[a.id] && en[BTN[a.id]] && en[BTN[a.id]].startsWith(a.door), p.id + '/' + a.id + ': button text starts with the door word', en[BTN[a.id]]);
    for (const l of ['ru', 'uk', 'zh']) ok(require('../lang/' + l + '.json')[BTN[a.id]] === en[BTN[a.id]], l + ': ' + a.id + ' button is the door word, not translated');
  }
  ok(P.flatMap(p => p.actions).length === Object.keys(BTN).length, 'every action has a button entry in this test');

  const src = fs.readFileSync(path.join(__dirname, '..', 'page.js'), 'utf8');
  ok(/nav\.make/.test(src) && /nav\.upgrade/.test(src) && /nav\.play/.test(src) && /function newModCard\(/.test(src) && /function xlateCard\(/.test(src) && !/screenBuild|screenNew|screenXlate/.test(src), 'page.js has the Generator, Upgrade and Play screens, the New Mod and Translate cards, no Build/New/Translate screens');
  const srv = await gui.start({ port: 0 }), port = srv.port;
  try {
    const gd = gamedir.resolve({}), G = gd.dir;
    console.log('scratch ' + S + '; game ' + (G ? 'found' : 'NOT FOUND: check and play GOLD skipped'));
    const mod = path.join(S, 'pgmod');
    fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true });
    fs.writeFileSync(path.join(mod, 'mod.info'), '{Mod\r\n {Name "pgtest"}\r\n {Description "invented mod for the page test"}\r\n {MinGameVersion "3.301"}\r\n}\r\n');
    fs.writeFileSync(path.join(mod, 'resource', 'set', 'note.set'), '{note "x"}\r\n');
    const act = id => P.flatMap(p => p.actions).find(a => a.id === id);
    const go = (id, input) => { const a = act(id); return post(port, { cmd: a.cmd, input: Object.assign({}, input, a.extra || {}) }); };

    // ---- 3: GOLD
    const nd = path.join(S, 'newmod1');
    let r = await go('new', { dir: nd, dryRun: true });
    let n = gold('page Mods/new', r.j, front(['new', nd, '--dry-run']));
    ok(n > 0 && !fs.existsSync(nd), 'new --dry-run printed lines and wrote nothing');

    const samp = front(['gen', '--sample']);
    ok(samp.code === 0 && samp.out.length > 3, 'front door gen --sample prints a sample spec', 'exit ' + samp.code + ' out ' + samp.out.slice(0, 3).join(' / ') + ' err ' + samp.err.slice(0, 3).join(' / '));
    const sp = path.join(S, 'sample-spec.yaml'); fs.writeFileSync(sp, samp.out.join('\n') + '\n');
    const gj = path.join(S, 'gen-out');
    r = await go('gen-plan', { spec: sp, target: 'as64', out: gj, json: true });
    n = gold('page Generator/gen plan', r.j, front(['gen', sp, '--target', 'as64', '--plan', '--out', gj, '--json']));
    ok(n > 0 && !fs.existsSync(gj), 'gen plan printed lines and wrote nothing');

    if (G) {
      const cj = path.join(S, 'cli-check.json');
      r = await go('check', { mod, game: G, fast: true });
      n = gold('page Check/check', r.j, front(['check', mod, '--game', G, '--fast', '--json', cj]));
      ok(n > 0, 'check printed lines');
      r = await go('play-dry', { mod, game: G });
      n = gold('page Play/play --dry', r.j, front(['play', mod, '--dry', '--game', G]));
      ok(r.status === 200, 'play --dry is allowed without --allow-launch', r.status);
    } else console.log('check and play GOLD skipped: no game dir');
    r = await go('play', { mod });
    ok(r.status === 403, 'play without dry is refused by the server (no --allow-launch)');
  } finally { srv.server.close(); }

}
main().then(() => { console.log(failN ? 'FAIL ' + failN + ' of ' + (pass + failN) : 'pages ok: ' + pass + ' checks'); process.exit(failN ? 1 : 0); }, e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
