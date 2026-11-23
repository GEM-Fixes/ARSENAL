// LAN Remote test (remote.js, qr.js, gui.js --remote). Loopback only: a test hook marks a request as a remote device's; the LAN is never opened.
//   node tools/gui/test/test-remote.js [scratchDir]
// 1. QR: Reed-Solomon, format and version bits against the ISO tables; every mask decodes back (own reader); a 120 character link fits
// 2. key: needed, cookie set (HttpOnly, SameSite=Lax) and the key stripped by a redirect; wrong key refused; 20 bad tries = locked
// 3. Host/Origin strict for remote devices; the local checks unchanged
// 4. every route not on remote.ALLOW answers 403 "view only" to a remote device (walks the route table); folders the PC page does not show refused
// 5. the local session token never reaches a remote device; switch and new link only from the PC; the new link kills the old one; follow events
// 6. the PC follows a remote device: follow/remote strict body, dropped while the PC switch is off, sent to PC pages only
// 7. fake DOM: header button LAN Remote + dialog (PC), Follow the PC on any remote page, no ping-pong; 0. no old feature name in the lang files
// Author: Imperator_Aug (ARSENAL, ia-b0d4ccb9)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const gui = require('../gui'), qr = require('../qr'), remote = require('../remote');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-remote-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 500) : '')); } };

// ---- 0. the feature is LAN Remote: no visible text in en, ru, uk, zh calls it a phone view or speaks of the phone as the device
{
  const OLD = /view on a phone|phone view|\bthe phone\b|\ba phone on this\b|просмотр с телефона|телефон (может|не может)|телефону в этой|камеру телефона|перегляд із телефона|телефон (може|не може)|телефону в цій|камеру телефона|在手机上查看|手机(可以|不能)|此网络中的手机|手机链接|手机相机/i;
  for (const l of ['en', 'ru', 'uk', 'zh']) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', l + '.json'), 'utf8')), bad = Object.keys(j).filter(k => OLD.test(j[k]));
    ok(bad.length === 0, l + ': no text names the old phone view', bad.map(k => k + ' = ' + j[k]).join('\n  '));
    ok(j['rmt.title'] === 'LAN Remote', l + ': the feature name LAN Remote, untranslated');
  }
}
// ---- 1. QR
function readBack(q) {
  // format bits from the first copy -> mask; unmask; read the zig-zag; deinterleave; check each block's EC; decode the byte segment
  const m = q.modules, n = q.size, at = (x, y) => (m[y][x] ? 1 : 0);
  let f = 0; const pos = [];
  for (let i = 0; i <= 5; i++) pos.push([8, i]); pos.push([8, 7], [8, 8], [7, 8]); for (let i = 9; i < 15; i++) pos.push([14 - i, 8]);
  pos.forEach(([x, y], i) => { f |= at(x, y) << i; });
  let mask = -1; for (let k = 0; k < 8; k++) if (qr.formatBits(k) === f) mask = k;
  if (mask < 0) return { error: 'format bits unknown' };
  const g = qr.grid(q.version), order = qr.dataOrder(g), bits = order.map(([x, y]) => at(x, y) ^ (qr.MASKS[mask](x, y) ? 1 : 0));
  const cw = []; for (let i = 0; i + 8 <= bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
  const T = qr.M_TABLE[q.version];
  if (!T) return { error: 'no table for v' + q.version };
  const [ec, n1, d1, n2] = T, nb = n1 + n2, blocks = [];
  for (let b = 0; b < nb; b++) blocks.push({ d: [], e: [] });
  let k = 0;
  for (let i = 0; i <= d1; i++) for (let b = 0; b < nb; b++) if (i < d1 + (b < n1 ? 0 : 1)) blocks[b].d.push(cw[k++]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) blocks[b].e.push(cw[k++]);
  const div = qr.rsDivisor(ec);
  for (const b of blocks) if (qr.rsRemainder(b.d, div).join() !== b.e.join()) return { error: 'EC mismatch' };
  const data = [].concat(...blocks.map(b => b.d)), dbits = [];
  for (const b of data) for (let i = 7; i >= 0; i--) dbits.push((b >> i) & 1);
  const rd = (o, l) => { let v = 0; for (let i = 0; i < l; i++) v = (v << 1) | dbits[o + i]; return v; };
  if (rd(0, 4) !== 4) return { error: 'not byte mode' };
  const cl = q.version < 10 ? 8 : 16, len = rd(4, cl), out = [];
  for (let i = 0; i < len; i++) out.push(rd(4 + cl + 8 * i, 8));
  return { mask, text: Buffer.from(out).toString('utf8') };
}
{
  ok(qr.rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], qr.rsDivisor(10)).join(' ') === '196 35 39 119 235 215 231 226 93 23', 'qr: Reed-Solomon of the HELLO WORLD 1-M codewords (ISO 18004 annex example)');
  const FM = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  ok(FM.every((s, i) => qr.formatBits(i).toString(2).padStart(15, '0') === s), 'qr: format bits of level M, masks 0..7 (ISO table)');
  ok(qr.versionBits(7).toString(2).padStart(18, '0') === '000111110010010100' && qr.versionBits(10).toString(2).padStart(18, '0') === '001010010011010011', 'qr: version bits 7 and 10 (ISO table)');
  ok(qr.capacity(7) === 122 && qr.capacity(10) === 213 && qr.capacity(1) === 14, 'qr: byte capacity at level M (v1 14, v7 122, v10 213)');
  const url = 'http://192.168.100.100:65535/?k=' + 'A'.repeat(88);
  ok(url.length === 120, 'a 120 character link');
  const q = qr.encode(url);
  ok(q.version === 7 && q.size === 45, 'qr: a 120 character link is version 7 (45 modules)', q.version);
  let all = true;
  for (let m = 0; m < 8; m++) { const r = readBack(qr.encode(url, { mask: m })); if (r.text !== url || r.mask !== m) { all = false; console.log('  mask ' + m + ': ' + JSON.stringify(r).slice(0, 200)); } }
  ok(all, 'qr: each of the 8 masks reads back to the link (format, unmask, zig-zag, interleave, EC all agree)');
  for (const t of ['HELLO', 'http://10.0.0.2:4000/?k=' + remote.newKey(), 'x'.repeat(150), '\u043a\u043b\u044e\u0447 \u5bc6\u94a5 ' + 'z'.repeat(170)]) {
    const e = qr.encode(t), r = readBack(e);
    ok(r.text === t, 'qr: reads back (' + t.length + ' chars, v' + e.version + ')', JSON.stringify(r).slice(0, 200));
  }
  // finder corners and timing row
  const md = q.modules; ok(md[0][0] && md[0][6] && md[6][0] && !md[1][1] && md[2][2] && md[6][8] && !md[6][9] && md[q.size - 8][8], 'qr: finders, timing and the dark module in place');
  let threw = false; try { qr.encode('y'.repeat(300)); } catch (e) { threw = true; } ok(threw, 'qr: a text over version 10 is refused');
}

// ---- unit parts of remote.js
{
  let t = 1000; const th = remote.throttle(() => t);
  for (let i = 0; i < 19; i++) th.bad('a'); ok(!th.locked('a'), 'throttle: 19 bad tries do not lock');
  th.bad('a'); ok(th.locked('a') && !th.locked('b'), 'throttle: the 20th locks that address only');
  t += remote.BAD_MS - 1; ok(th.locked('a'), 'throttle: still locked just before 10 minutes');
  t += 2; ok(!th.locked('a'), 'throttle: free after 10 minutes');
  ok(remote.keyEq('abc', 'abc') && !remote.keyEq('abc', 'abd') && !remote.keyEq('', '') && !remote.keyEq(null, 'x'), 'keyEq: equal, unequal, empty, missing');
  const k = remote.newKey(); ok(/^[A-Za-z0-9_-]{32}$/.test(k) && Buffer.from(k, 'base64url').length * 8 >= 128, 'key: 192 bits, URL safe', k);
  const R = [path.join(S, 'mods')];
  ok(remote.pathRefusal([path.join(S, 'mods', 'a', 'b.txt')], R) === null && remote.pathRefusal(['C:\\Windows\\win.ini'], R) === 'path'
    && remote.pathRefusal([path.join(S, 'mods', '..', 'x')], R) === 'path' && remote.pathRefusal(['plain', 'rel/x.txt'], R) === null && remote.pathRefusal(['\\\\host\\share\\x'], R) === 'path', 'pathRefusal: inside, outside, .., relative, UNC');
  ok(remote.settingsRoots({ 'as2gui.games': { as64: { dir: 'F:\\G', roots: ['D:\\mods'], mod: 'D:\\mods\\m' } }, 'as2gui.theme': 'C:\\x', 'as2gui.roots': ['C:\\'] }).join('|') === 'F:\\G|D:\\mods|D:\\mods\\m',
    'settingsRoots: game, roots and mod paths; not other keys; never a drive root');
}

// ---- server
function req(port, method, p, o = {}) {
  return new Promise(resolve => {
    const headers = Object.assign({ host: o.host || '127.0.0.1:' + port }, o.headers || {});
    if (o.remote) headers['x-test-remote'] = '1';
    if (o.cookie) headers.cookie = o.cookie;
    let body = null; if (method === 'POST') { body = JSON.stringify(o.body || {}); headers['content-type'] = 'application/json'; }
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      if (o.stream) return resolve({ status: res.statusCode, headers: res.headers, res });
      let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* text */ } resolve({ status: res.statusCode, headers: res.headers, text: t, j }); });
    });
    r.on('error', e => resolve({ status: 0, text: e.message }));
    if (body) r.write(body); r.end();
  });
}
const events = res => { const evs = []; let buf = ''; res.setEncoding('utf8'); res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.*)$/m.exec(blk), da = /^data: (.*)$/m.exec(blk); if (ev) evs.push({ ev: ev[1], data: da ? JSON.parse(da[1]) : null }); } }); return evs; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(f, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(30); } return false; }

(async () => {
  const LAN = '10.9.8.7', setFile = path.join(S, 'settings.json');
  fs.mkdirSync(path.join(S, 'tmp'), { recursive: true }); fs.writeFileSync(path.join(S, 'tmp', 'seen.txt'), 'shown');
  const A = await gui.start({ port: 0, cwd: S, tmpRoot: path.join(S, 'tmp'), settingsFile: setFile, remoteHook: q => q.headers['x-test-remote'] === '1', lan: [LAN] });
  const P = A.port, H = LAN + ':' + P;
  try {
    ok(!fs.existsSync(setFile), 'a plain start writes no settings file (the key is made when the phone view is first used)');
    let r = await req(P, 'GET', '/', { remote: true, host: H });
    ok(r.status === 403 && r.text === 'Forbidden', 'phone view off: a phone gets 403', r.status + ' ' + r.text);
    r = await req(P, 'GET', '/api/remote');
    const key = r.j && r.j.link && /\?k=([A-Za-z0-9_-]+)$/.exec(r.j.link)[1];
    ok(r.status === 200 && r.j.on === false && r.j.link === 'http://' + H + '/?k=' + key && key.length >= 22 && r.j.qr && r.j.qr.rows.length === r.j.qr.size, 'GET /api/remote (PC): off, link with the key, QR rows', r.text);
    const saved = JSON.parse(fs.readFileSync(setFile, 'utf8'));
    ok(saved.__priv && saved.__priv.remoteKey === key, 'the key is kept in the settings file (server only part)');
    r = await req(P, 'GET', '/api/settings'); ok(r.status === 200 && !r.text.includes(key) && !r.text.includes('__priv'), 'GET /api/settings never shows the key');
    r = await req(P, 'POST', '/api/settings', { body: { set: { __priv: { remoteKey: 'x'.repeat(30) } } } }); ok(r.status === 400, 'a page cannot set the key through the settings', r.status);
    r = await req(P, 'POST', '/api/remote', { body: { on: true } });
    ok(r.status === 200 && r.j.on === true, 'switch on from the PC', r.text);

    // ---- 2. key
    r = await req(P, 'GET', '/', { remote: true, host: H }); ok(r.status === 403 && r.text === 'Forbidden', 'no key: 403 without detail', r.text);
    r = await req(P, 'GET', '/?k=' + key, { remote: true, host: H });
    const ck = String((r.headers['set-cookie'] || [])[0] || '');
    ok(r.status === 303 && r.headers.location === '/' && /HttpOnly/.test(ck) && /SameSite=Lax/.test(ck) && ck.startsWith(remote.COOKIE + '=' + key + ';'), 'key in the link: cookie set, redirect to the clean address', r.status + ' ' + r.headers.location + ' ' + ck);
    r = await req(P, 'GET', '/?x=1&k=' + key, { remote: true, host: H }); ok(r.status === 303 && r.headers.location === '/?x=1', 'the redirect keeps other query values and drops k', r.headers.location);
    const C = remote.COOKIE + '=' + key;
    r = await req(P, 'GET', '/', { remote: true, host: H, cookie: C });
    ok(r.status === 200 && /window\.AS2CFG=\{"remote":true/.test(r.text), 'with the cookie: the page, marked remote', r.text.slice(0, 80));
    ok(!r.text.includes(A.token) && !r.text.includes(key), 'the phone page holds neither the local session token nor the key');
    for (const p of ['/api/health', '/api/settings', '/api/commands', '/api/jobs']) { const x = await req(P, 'GET', p, { remote: true, host: H, cookie: C }); ok(x.status === 200 && !x.text.includes(A.token) && !x.text.includes(key), 'phone ' + p + ': 200, no token, no key', x.status); }
    r = await req(P, 'GET', '/', { remote: true, host: H, cookie: remote.COOKIE + '=' + key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A') }); ok(r.status === 403, 'a wrong cookie: 403');
    r = await req(P, 'GET', '/?k=nope', { remote: true, host: H }); ok(r.status === 403 && r.text === 'Forbidden' && !r.headers['set-cookie'], 'a wrong key: 403, no cookie');

    // ---- 3. Host / Origin
    for (const h of ['127.0.0.1:' + P, 'evil.example:' + P, LAN + ':1', LAN, 'localhost:' + P]) { const x = await req(P, 'GET', '/', { remote: true, host: h, cookie: C }); ok(x.status === 403, 'phone with Host ' + h + ': 403', x.status); }
    r = await req(P, 'GET', '/api/health', { remote: true, host: H, cookie: C, headers: { origin: 'http://evil.example' } }); ok(r.status === 403, 'phone with a foreign Origin: 403');
    r = await req(P, 'GET', '/api/health', { remote: true, host: H, cookie: C, headers: { origin: 'http://' + H } }); ok(r.status === 200, 'phone with its own Origin: 200');
    r = await req(P, 'GET', '/api/health', { host: H }); ok(r.status === 403 && /bad Host/.test(r.text), 'the PC side still takes only 127.0.0.1 / localhost as Host');

    // ---- 4. view only: walk every route
    const deny = [], open = [];
    for (const rt of gui.routeTable()) {
      const [m, p] = rt.split(' ');
      if (remote.allowed(m, p)) { open.push(rt); continue; }
      const x = await req(P, m, p, { remote: true, host: H, cookie: C, body: { on: true, set: { 'as2gui.theme': 'dark' }, cmd: 'game', input: {}, screen: 'mods' } });
      if (!(x.status === 403 && x.j && x.j.key === 'rmt.viewOnly')) deny.push(rt + ' -> ' + x.status + ' ' + String(x.text).slice(0, 60));
    }
    ok(deny.length === 0, 'every route not on the allow list answers 403 view only to a phone (' + (gui.routeTable().length - open.length) + ' routes)', deny.join('\n  '));
    ok(open.every(rt => /^GET /.test(rt) || /^POST \/api\/x\/(units\/(search|stats|describe|compare|index|weapons)|balance\/table|guides\/(search|show|faq|sources|tools|titles)|files\/search|ide\/symbols|missions\/diff|docs\/history\/(groups|rows|text|search|titles))$/.test(rt) || rt === 'POST /api/follow/remote'), 'the allow list holds GETs, a few named read POSTs and the remote screen (follow/remote) only', open.filter(x => !/^GET /.test(x)).join());
    ok(['POST /api/x/docs/history/groups', 'POST /api/x/docs/history/rows', 'POST /api/x/docs/history/text', 'POST /api/x/docs/history/search', 'POST /api/x/guides/sources', 'POST /api/x/guides/tools', 'GET /api/x/guides/update/progress'].every(rt => open.includes(rt)),
      'Historical Sources and the Guides reads (sources, tools, update progress) are on the allow list', open.filter(x => /docs\/history|guides/.test(x)).join());
    ok(!open.some(rt => /^POST \/api\/x\/(maps\/check|guides\/(update\/(plan|start|stop)|export)|docs\/pdf)$/.test(rt)), 'maps/check (milint reads a .lintrc above the roots), the Guides update and export, and docs/pdf stay closed', open.filter(x => /maps\/check|guides\/(update|export)|docs\/pdf/.test(x)).join());
    ok(['GET /api/x/missions/facts', 'GET /api/x/missions/mine', 'GET /api/x/modes/list', 'POST /api/x/missions/diff'].every(rt => open.includes(rt)) && !open.some(rt => /^POST \/api\/x\/(missions\/add|modes\/bots)$/.test(rt)),
      'Missions and Game Modes: the read routes are on the allow list, add a mode and allow bots are not', open.filter(x => /missions|modes/.test(x)).join());
    ok(open.includes('POST /api/follow/remote') && !open.includes('POST /api/follow'), 'a remote device may tell its screen (follow/remote), never the PC screen (follow)');
    ok(!open.some(rt => /\/api\/x\/(files\/(save|copy|restore|undo)|ide\/(lint|hover|def|refs|words|log|extopen|npp|inbox))$/.test(rt)), 'no write, launch, index build or user folder route of the Editor and Mod files on the allow list');
    ok(!open.some(rt => /\/api\/(ls|remote|launch|run|spec|settings|follow|cancel|answer)$/.test(rt) && !/^GET \/api\/settings$/.test(rt)), 'no picker, switch, launch, run or settings write on the allow list');
    r = await req(P, 'GET', '/api/settings', { remote: true, host: H, cookie: C }); ok(r.j && !r.j.settings['as2gui.theme'], 'the refused settings POST changed nothing');
    r = await req(P, 'GET', '/api/text?path=' + encodeURIComponent(path.join(S, 'tmp', 'seen.txt')), { remote: true, host: H, cookie: C }); ok(r.status === 200 && r.j.text === 'shown', 'phone reads a file under a folder the PC page shows', r.text);
    for (const p of [process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/hosts', path.join(S, 'settings.json'), path.join(S, 'tmp', '..', 'settings.json')]) {
      const x = await req(P, 'GET', '/api/text?path=' + encodeURIComponent(p), { remote: true, host: H, cookie: C }); ok(x.status === 403, 'phone cannot read ' + p, x.status);
    }
    r = await req(P, 'GET', '/api/mods?dir=' + encodeURIComponent('C:\\'), { remote: true, host: H, cookie: C }); ok(r.status === 403, 'phone cannot list a drive');

    // ---- 6. browsing files read only (Editor, Mod files): inside a mod root yes, outside it no, links out no, writes no
    {
      const MR = path.join(S, 'mods'), M = path.join(MR, 'm1'), OUT = path.join(S, 'outside'), wr = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
      wr(path.join(M, 'mod.info'), '{name "m1"}\r\n'); wr(path.join(M, 'resource', 'set', 'a.set'), '{unit "tiger"\r\n {hp 5}\r\n}\r\n');
      wr(path.join(M, 'resource.pak'), require('../../lib/zipwrite').zip([['set/p.set', Buffer.from('{p tiger}\r\n'), false]]));
      wr(path.join(OUT, 'secret.txt'), 'tiger secret'); wr(path.join(OUT, 'mod.info'), '{name "out"}\r\n');
      let jn = null; try { fs.symlinkSync(OUT, path.join(M, 'resource', 'lnk'), 'junction'); jn = path.join(M, 'resource', 'lnk'); } catch (e) { console.log('note: no junction or symlink here (' + e.code + '): the link-out cases are skipped'); }
      r = await req(P, 'POST', '/api/settings', { body: { set: { 'as2gui.roots': [MR] } } }); ok(r.status === 200, 'PC: a mod root in the settings', r.text);
      const G = (p, o = {}) => req(P, 'GET', p, Object.assign({ remote: true, host: H, cookie: C }, o)), Po = (p, body) => req(P, 'POST', p, { remote: true, host: H, cookie: C, body });
      const q = o => Object.keys(o).map(k => k + '=' + encodeURIComponent(o[k])).join('&');
      r = await G('/api/x/files/tree?' + q({ mod: M }));
      ok(r.status === 200 && r.j.files.some(f => f.rel === 'resource/set/a.set') && r.j.files.some(f => f.rel === 'resource.pak::set/p.set'), 'phone: the mod tree with pak entries', r.text);
      ok(r.status === 200 && !r.j.files.some(f => /secret/.test(f.rel)), 'phone: the tree does not follow a link out of the mod');
      r = await G('/api/x/files/open?' + q({ mod: M, rel: 'resource/set/a.set' }));
      ok(r.status === 200 && /tiger/.test(r.j.text) && r.j.editable === false && r.j.why === 'remote', 'phone: opens a mod file read only (editable false, why remote)', r.text);
      r = await req(P, 'GET', '/api/x/files/open?' + q({ mod: M, rel: 'resource/set/a.set' })); ok(r.status === 200 && r.j.editable === true, 'PC: the same file opens editable as before', r.text);
      r = await G('/api/x/files/open?' + q({ mod: M, rel: 'resource.pak::set/p.set' })); ok(r.status === 200 && /tiger/.test(r.j.text) && r.j.editable === false, 'phone: opens a pak entry read only', r.text);
      r = await G('/api/x/files/open?' + q({ path: path.join(M, 'resource', 'set', 'a.set') })); ok(r.status === 200 && r.j.editable === false, 'phone: opens a file by its full path inside a root', r.text);
      r = await G('/api/x/files/which?' + q({ mod: M, rel: 'resource/set/a.set' })); ok(r.status === 200 && r.j.key === 'resource/set/a.set', 'phone: which copy wins', r.text);
      r = await G('/api/x/ide/vdir?' + q({ mod: M, dir: 'set' })); ok(r.status === 200 && Array.isArray(r.j.files), 'phone: a folder of the game view', r.text);
      r = await G('/api/x/ide/copies?' + q({ mod: M, rel: 'resource/set/a.set' })); ok(r.status === 200 && Array.isArray(r.j.copies), 'phone: every copy of one game file', r.text);
      r = await Po('/api/x/files/search', { mod: M, q: 'tiger', sid: 's1' }); ok(r.status === 200 && r.j.hits.some(x => x.rel === 'resource/set/a.set') && !r.j.hits.some(x => /secret/.test(x.file || '')), 'phone: search in the mod (a link out is not walked)', r.text);
      r = await Po('/api/x/ide/symbols', { mod: M, rel: 'resource/set/a.set' }); ok(r.status === 200 && Array.isArray(r.j.symbols), 'phone: the outline of a file', r.text);
      // refused: outside, .., drive-relative, UNC, nested body value, relative game override, a mod outside every root
      const outs = [['absolute path outside', path.join(OUT, 'secret.txt')], ['..', path.join(M, '..', '..', 'outside', 'secret.txt')], ['drive-relative', 'C:secret.txt'],
        ['UNC', '\\\\127.0.0.1\\c$\\Windows\\win.ini'], ['forward UNC', '//127.0.0.1/c$/Windows/win.ini']];
      for (const [what, p] of outs) {
        r = await G('/api/x/files/open?' + q({ path: p })); ok(r.status === 403, 'phone: files/open refuses ' + what, r.status + ' ' + r.text);
        r = await Po('/api/x/files/search', { mod: M, q: 'tiger', other: p }); ok(r.status === 403, 'phone: search refuses other = ' + what, r.status);
        r = await Po('/api/x/ide/symbols', { mod: M, path: p }); ok(r.status === 403, 'phone: symbols refuses ' + what, r.status);
      }
      r = await Po('/api/x/files/search', { mod: M, q: 'tiger', opts: { deep: [path.join(OUT, 'secret.txt')] } }); ok(r.status === 403, 'phone: a path nested in the body is refused', r.status);
      r = await G('/api/x/files/tree?' + q({ mod: OUT })); ok(r.status === 403, 'phone: a mod folder outside every root is refused', r.status);
      r = await G('/api/installed?game=mods'); ok(r.status === 403, 'phone: a relative game folder is refused (it would be read from the server working folder)', r.status);
      r = await Po('/api/x/files/search', { mod: M, q: 'tiger', game: 'mods', vanilla: true }); ok(r.status === 403, 'phone: a relative game folder in the body is refused', r.status);
      if (jn) {
        r = await G('/api/x/files/open?' + q({ path: path.join(jn, 'secret.txt') })); ok(r.status === 403, 'phone: a junction inside a root that leads out is refused (real path)', r.status + ' ' + r.text);
        r = await req(P, 'GET', '/api/x/files/open?' + q({ path: path.join(jn, 'secret.txt') })); ok(r.status === 200 && /secret/.test(r.j.text), 'PC: the same path opens as before', r.status);
        r = await G('/api/x/files/open?' + q({ mod: M, rel: 'resource/lnk/secret.txt' })); ok(r.status >= 400 && !/tiger secret/.test(r.text), 'phone: a mod path through the link is refused', r.status);
        r = await Po('/api/x/files/search', { mod: M, q: 'tiger', other: jn }); ok(r.status === 403, 'phone: search refuses other = a junction out', r.status);
        r = await G('/api/x/files/tree?' + q({ mod: jn })); ok(r.status === 403, 'phone: a mod folder reached through a junction out is refused', r.status);
        ok(remote.pathRefusal([path.join(jn, 'x', 'y.txt')], [MR]) === 'path' && remote.pathRefusal([path.join(M, 'resource', 'set', 'a.set')], [MR]) === null, 'pathRefusal: a not yet existing file below a junction out is refused; a real file inside passes');
      }
      // the write routes of Mod files and the Editor stay closed to a phone, with good arguments too
      for (const [p, body] of [['/api/x/files/save', { mod: M, rel: 'resource/set/a.set', text: 'x', write: true }], ['/api/x/files/copy', { mod: M, rel: 'resource/set/b.set', path: path.join(M, 'resource', 'set', 'a.set'), write: true }],
        ['/api/x/files/restore', { mod: M, id: '20260101-000000', write: true }], ['/api/x/ide/extopen', { mod: M, rel: 'resource/set/a.set', app: 'npp' }], ['/api/x/ide/lint', { mod: M, rel: 'resource/set/a.set', text: '{}' }],
        ['/api/x/ide/npp', { action: 'plan' }], ['/api/x/ide/inbox', { file: path.join(M, 'mod.info') }]]) {
        r = await Po(p, body); ok(r.status === 403 && r.j && r.j.key === 'rmt.viewOnly', 'phone: ' + p + ' refused (view only)', r.status);
      }
      for (const p of ['/api/x/files/undo?' + q({ mod: M }), '/api/x/ide/words?' + q({ mod: M, kind: 'sdl' }), '/api/x/ide/log?' + q({ mod: M }), '/api/x/ide/inbox?wait=1', '/api/ls?dir=' + encodeURIComponent(MR)]) {
        r = await G(p); ok(r.status === 403, 'phone: GET ' + p.split('?')[0] + ' refused', r.status);
      }
      // Missions and Game Modes on a phone: the reads get through (no game folder here, so facts, list and diff answer 400, never view only),
      // add a mode and allow bots are refused with good arguments too, a mod outside every root is refused
      r = await G('/api/x/missions/mine?' + q({ mod: M })); ok(r.status === 200 && Array.isArray(r.j.maps), 'phone: Missions, my mod\'s loose maps', r.status + ' ' + r.text);
      for (const [m, p, body] of [['GET', '/api/x/missions/facts?' + q({ map: 'map/multi/m1', mod: M })], ['GET', '/api/x/modes/list?' + q({ mod: M })], ['POST', '/api/x/missions/diff', { mod: M, map: 'map/multi/m1' }]]) {
        r = m === 'GET' ? await G(p) : await Po(p, body); ok(r.status !== 403 && !(r.j && r.j.key === 'rmt.viewOnly'), 'phone: ' + m + ' ' + p.split('?')[0] + ' is not refused', r.status + ' ' + r.text);
      }
      for (const [p, body] of [['/api/x/missions/add', { mod: M, map: 'map/multi/m1', from: 'combat', to: 'battle_zones', write: true }], ['/api/x/modes/bots', { mod: M, mode: 'combat', write: true }]]) {
        r = await Po(p, body); ok(r.status === 403 && r.j && r.j.key === 'rmt.viewOnly', 'phone: ' + p + ' refused (view only)', r.status);
      }
      r = await G('/api/x/missions/mine?' + q({ mod: OUT })); ok(r.status === 403, 'phone: Missions refuses a mod folder outside every root', r.status);
      // missions/mine asks ctx.pathOk for each walked folder: a mod whose resource folder is a junction out of every root lists nothing to a
      // phone (the PC lists it as before); a plain mod with a loose map lists it to the phone
      {
        const M2 = path.join(MR, 'm2'), M3 = path.join(MR, 'm3');
        wr(path.join(M2, 'resource', 'map', 'multi', 'real1', 'combat.mi'), '{mission}\r\n');
        wr(path.join(OUT, 'res', 'map', 'multi', 'away1', 'combat.mi'), '{mission}\r\n'); fs.mkdirSync(M3, { recursive: true });
        r = await G('/api/x/missions/mine?' + q({ mod: M2 })); ok(r.status === 200 && r.j.maps.some(m => m.key === 'map/multi/real1'), 'phone: Missions lists a loose map inside a root', r.status + ' ' + r.text);
        let j3 = null; try { fs.symlinkSync(path.join(OUT, 'res'), path.join(M3, 'resource'), 'junction'); j3 = path.join(M3, 'resource'); } catch (e) { console.log('note: no junction here (' + e.code + '): the missions/mine link-out case is skipped'); }
        if (j3) {
          r = await G('/api/x/missions/mine?' + q({ mod: M3 })); ok(r.status === 200 && r.j.maps.length === 0, 'phone: Missions does not list maps behind a junction out of every root (ctx.pathOk)', r.status + ' ' + r.text);
          r = await req(P, 'GET', '/api/x/missions/mine?' + q({ mod: M3 })); ok(r.status === 200 && r.j.maps.some(m => m.key === 'map/multi/away1'), 'PC: the same mod lists that map as before', r.status + ' ' + r.text);
          try { fs.rmdirSync(j3); } catch (e) { /* left in the scratch folder */ }
        }
      }
      // read-only routes opened for a phone: Historical Sources and the Guides reads get through (200 or the route's own answer, never
      // view only); Check my missions (maps/check) stays closed with good arguments
      for (const [m, p, body] of [['POST', '/api/x/docs/history/groups', {}], ['POST', '/api/x/docs/history/rows', { q: 'tank', limit: 5 }], ['POST', '/api/x/docs/history/text', { id: 'x1' }],
        ['POST', '/api/x/docs/history/search', { q: 'tank' }], ['POST', '/api/x/guides/sources', {}], ['POST', '/api/x/guides/tools', {}], ['GET', '/api/x/guides/update/progress']]) {
        // what the folders hold before (the scratch folder, and the guide index folder once guides/sources names it): nothing may change
        const snap = d => { const o = []; const w = (x, k) => { if (k > 6) return; let es = []; try { es = fs.readdirSync(x, { withFileTypes: true }); } catch (e) { return; }
          for (const e of es) { const f = path.join(x, e.name); if (e.isDirectory()) w(f, k + 1); else { try { const st = fs.statSync(f); o.push(f + ' ' + st.size + ' ' + st.mtimeMs); } catch (er) { o.push(f); } } } };
          w(d, 0); return o.sort().join('\n'); };
        const s0 = snap(S);
        r = m === 'GET' ? await G(p) : await Po(p, body); ok(r.status !== 403 && !(r.j && r.j.key === 'rmt.viewOnly'), 'phone: ' + m + ' ' + p + ' is not refused', r.status + ' ' + String(r.text).slice(0, 120));
        // the answer: JSON, and on 200 the shape the page reads (an index or folder missing on this machine = the route's own error, still JSON)
        const j = r.j, shape = { '/api/x/docs/history/groups': () => typeof j.ok === 'boolean', '/api/x/docs/history/rows': () => !j.ok || Array.isArray(j.rows),
          '/api/x/docs/history/text': () => typeof j === 'object', '/api/x/docs/history/search': () => typeof j.ok === 'boolean',
          '/api/x/guides/sources': () => Array.isArray(j.origins) || typeof j.error === 'string', '/api/x/guides/tools': () => Array.isArray(j.groups),
          '/api/x/guides/update/progress': () => typeof j.running === 'boolean' }[p];
        ok(j && typeof j === 'object' && (r.status !== 200 ? typeof j.error === 'string' : shape()), 'phone: ' + p + ' answers a JSON body the page reads', r.status + ' ' + String(r.text).slice(0, 160));
        ok(snap(S) === s0, 'phone: ' + p + ' wrote nothing in the scratch folder');
        if (p === '/api/x/guides/sources' && r.status === 200 && j.dir) { const g0 = snap(j.dir); await Po(p, body); ok(snap(j.dir) === g0, 'phone: guides/sources wrote nothing in the guide index folder'); }
      }
      r = await Po('/api/x/maps/check', { mod: M, only: 'missions' }); ok(r.status === 403 && r.j && r.j.key === 'rmt.viewOnly', 'phone: maps/check stays closed (view only)', r.status);
      r = await Po('/api/x/missions/diff', { mod: OUT, map: 'map/multi/m1' }); ok(r.status === 403, 'phone: missions/diff refuses a mod folder outside every root', r.status);
      ok(fs.readFileSync(path.join(M, 'resource', 'set', 'a.set'), 'utf8') === '{unit "tiger"\r\n {hp 5}\r\n}\r\n' && !fs.existsSync(path.join(M, 'resource', 'set', 'b.set')) && !fs.existsSync(M + '.arsenal-undo') && !fs.existsSync(path.join(M, 'resource', 'map')), 'nothing in the mod was written');
      if (jn) try { fs.rmdirSync(jn); } catch (e) { /* left in the scratch folder */ }
    }
    r = await req(P, 'POST', '/api/remote', { remote: true, host: H, cookie: C, body: { on: false } }); ok(r.status === 403, 'the switch refuses a phone');

    // ---- 5. follow + live stream for a phone; local stream off without --dev
    const pst = await req(P, 'GET', '/api/live', { stream: true });
    ok(pst.status === 200, 'PC page: an event stream while LAN Remote is on (to follow a remote device), also without --dev', pst.status);
    const pevs = events(pst.res);
    const st = await req(P, 'GET', '/api/live', { remote: true, host: H, cookie: C, stream: true });
    ok(st.status === 200 && /text\/event-stream/.test(st.headers['content-type']), 'phone: event stream', st.status);
    const evs = events(st.res);
    await until(() => evs.some(e => e.ev === 'hello'));
    r = await req(P, 'POST', '/api/follow', { body: { screen: 'make' } });
    ok(r.status === 200 && await until(() => evs.some(e => e.ev === 'follow' && e.data.screen === 'make')), 'the PC page screen reaches the phone (follow)');
    r = await req(P, 'POST', '/api/follow', { body: { screen: '../x' } }); ok(r.status === 400, 'follow takes page ids only');
    r = await req(P, 'GET', '/'); ok(/window\.AS2CFG=\{"live":false,"dev":false,"rOn":true\}/.test(r.text) && !r.text.includes(key), 'PC page while on: told to post its screen, no key in the page');
    const pcHtml = r.text;
    await until(() => pevs.some(e => e.ev === 'hello'));
    ok(!pevs.some(e => e.ev === 'follow'), 'the PC screen goes to remote pages only, never back to a PC page');

    // ---- 6. the PC follows a remote device: POST /api/follow/remote (remote only, strict body, dropped while the PC switch is off)
    const RP = (body, o = {}) => req(P, 'POST', '/api/follow/remote', Object.assign({ remote: true, host: H, cookie: C, body, headers: { 'content-length': Buffer.byteLength(JSON.stringify(body)) } }, o));
    const FK = 'as2gui.share.rmtFollowPc';
    r = await RP({ screen: 'check' }); await sleep(250);
    ok(r.status === 200 && !pevs.some(e => e.ev === 'follow'), 'PC switch off: the remote screen is taken (200) and dropped, no event to the PC page', r.status + ' ' + JSON.stringify(pevs));
    r = await req(P, 'POST', '/api/settings', { body: { set: { [FK]: true } } }); ok(r.status === 200, 'the PC switch Follow the remote device is a settings key the server accepts', r.text);
    const nRem = evs.filter(e => e.ev === 'follow').length;
    r = await RP({ screen: 'check' });
    ok(r.status === 200 && await until(() => pevs.some(e => e.ev === 'follow' && e.data.screen === 'check' && e.data.from === 'remote')), 'PC switch on: the remote screen reaches the PC page (from remote)', JSON.stringify(pevs));
    await sleep(150); ok(evs.filter(e => e.ev === 'follow').length === nRem, 'the remote screen does not go to remote pages (no ping-pong, other devices unchanged)');
    const ext1 = [...gui.SCREEN_IDS].find(x => !['mods', 'make', 'check', 'play', 'test', 'settings', 'upgrade'].includes(x));
    if (ext1) { r = await RP({ screen: ext1 }); ok(r.status === 200 && await until(() => pevs.some(e => e.ev === 'follow' && e.data.screen === ext1)), 'an ext screen id is taken too: ' + ext1); }
    for (const [what, body] of [['an unknown screen', { screen: 'nosuch' }], ['a path', { screen: '../x' }], ['a number', { screen: 5 }], ['an extra key', { screen: 'make', x: 1 }],
      ['no screen', {}], ['an array', ['make']], ['a long id', { screen: 'a'.repeat(41) }], ['a big body', { screen: 'make', pad: 'x'.repeat(4000) }]]) {
      r = await RP(body); ok(r.status === 400, 'follow/remote refuses ' + what + ' (400)', r.status + ' ' + r.text);
    }
    const NAMES_PAGE = (/var NAMES=\[(.*?)\];/.exec(require('../page')) || [])[1] || '';
    ok([...NAMES_PAGE.matchAll(/\['([a-z]+)'/g)].map(m => m[1]).every(id => gui.SCREEN_IDS.has(id)) && NAMES_PAGE.length > 0, 'the server screen list holds every core screen of the page');
    r = await req(P, 'POST', '/api/follow/remote', { body: { screen: 'make' } }); ok(r.status === 403, 'follow/remote refuses the PC page itself (remote devices only)', r.status);

    // ---- 7. the pages under a fake DOM: the LAN Remote button and dialog (PC), the follow switch on any remote page, no ping-pong
    {
      const vm = require('vm'), fakedom = require('./fakedom');
      const boot = (html, ls) => {
        const doc = fakedom.make(), urls = [], ESs = [], store = new Map(Object.entries(ls || {}));
        const b = doc.createElement('button'); b.setAttribute('id', 'rmbtn'); b.hidden = true; doc.body.appendChild(b);
        const ban = doc.createElement('div'); ban.setAttribute('id', 'rmban'); ban.hidden = true; doc.body.appendChild(ban);
        const lv = doc.createElement('span'); lv.setAttribute('id', 'livest'); lv.hidden = true; doc.body.appendChild(lv);
        class ES { constructor(u) { this.u = u; this.l = {}; this.readyState = 1; ESs.push(this); } addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); } fire(t, d) { (this.l[t] || []).forEach(f => f({ data: JSON.stringify(d) })); } close() {} }
        const ctx = { document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, EventSource: ES, navigator: {},
          localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
          confirm: () => true,
          fetch: (u, o) => { urls.push({ url: u, method: (o && o.method) || 'GET', body: o && o.body ? JSON.parse(o.body) : null }); return fetch('http://127.0.0.1:' + P + u, o); } };
        ctx.window = ctx; vm.createContext(ctx);
        const cfg = /<script>(window\.AS2CFG=[^<]*)<\/script>/.exec(html), m = /<script>\r?\n\(function\(\)\{([\s\S]*)<\/script>/.exec(html);
        vm.runInContext((cfg ? cfg[1] : '') + '\n(function(){' + m[1], ctx, { filename: 'page.js:script' });
        return { doc, ctx, urls, ESs, store };
      };
      const waitFor = f => until(f, 8000);
      const posts = (pg, u) => pg.urls.filter(x => x.method === 'POST' && x.url === u);
      // the PC page
      const pc = boot(pcHtml);
      ok(await waitFor(() => pc.ctx.__as2gui), 'PC page built in the fake DOM');
      const rb = pc.doc.getElementById('rmbtn'), shareSec = pc.doc.getElementById('main').children.find(s => s.dataset.id === 'share');
      ok(rb && rb.hidden === false && /^LAN Remote/.test(rb.textContent) && rb.querySelector('span.rmmark') && rb.querySelector('span.rmmark').textContent === 'on, follows', 'PC page: the header button LAN Remote with its state mark (on, follows: the setting above)', rb && rb.textContent);
      ok(!shareSec || !shareSec.all().some(e => /^phone/.test(e.dataset.blk || '') || e.className === 'qrbox'), 'the Share screen no longer holds the card');
      rb.click();
      const dl = pc.doc.getElementById('rmdlg');
      ok(dl && dl.open && dl.parentNode === pc.doc.body && !dl.all().some(e => /\bblk\b/.test(e.className)), 'the button opens the LAN Remote dialog (on body, no blocks inside)');
      ok(await waitFor(() => dl.querySelector('code.rmlink') && /\?k=/.test(dl.querySelector('code.rmlink').textContent)), 'the dialog shows the link');
      const cbs = dl.querySelectorAll('input[type=checkbox]'), btxt = dl.querySelectorAll('button').map(x => x.textContent);
      ok(cbs.length === 2 && cbs[0].checked === true && cbs[0].attrs['aria-label'] === 'Let another device on this network view the page' && cbs[1].attrs['aria-label'] === 'Follow the remote device' && cbs[1].checked === true,
        'the dialog holds the on/off switch and Follow the remote device (on: the setting above)', cbs.map(c => c.attrs['aria-label'] + '=' + c.checked).join());
      ok(['Copy link', 'New link', 'Close'].every(t => btxt.includes(t)) && dl.querySelector('div.qrbox') && dl.querySelector('div.qrbox').children.length === 1 && /Addresses of this PC: 10\.9\.8\.7/.test(dl.textContent) && /The other device can:/.test(dl.textContent) && /The other device cannot:/.test(dl.textContent),
        'the dialog holds QR code, Copy link, New link, Close, the addresses, can and cannot', btxt.join('|'));
      ok(rb.querySelector('span.rmmark').textContent === 'on, follows', 'the header mark says the PC follows', rb.textContent);
      pc.doc.key('Escape');
      ok(!dl.open && pc.doc.activeElement === rb, 'Esc closes the dialog, the focus goes back to the header button');
      rb.click(); ok(dl.open, 'opens again'); pc.doc.getElementById('rmclose').click(); ok(!dl.open && pc.doc.activeElement === rb, 'Close closes it, the focus goes back to the header button');
      // follow the remote device: quiet (never told back), only from:"remote"
      ok(await waitFor(() => pc.ESs.length === 1), 'PC page opens the event stream while LAN Remote is on');
      const cur = () => pc.ctx.__as2gui.cur, before = posts(pc, '/api/follow').length, to = cur() === 'make' ? 'check' : 'make';
      pc.ESs[0].fire('follow', { screen: to, from: 'remote' });
      ok(cur() === to && posts(pc, '/api/follow').length === before, 'PC page follows the remote device to ' + to + ' and does not tell it on (no ping-pong)', cur() + ' ' + posts(pc, '/api/follow').length);
      pc.ESs[0].fire('follow', { screen: 'mods' }); ok(cur() === to, 'PC page ignores the PC screen events (not from a remote device)');
      // the remote page: follow switch whatever the device, no header button, follows the PC quietly, tells its own screen
      r = await req(P, 'GET', '/', { remote: true, host: H, cookie: C });
      const rp = boot(r.text);
      ok(await waitFor(() => rp.ctx.__as2gui), 'remote page built in the fake DOM');
      const rban = rp.doc.getElementById('rmban'), fo = rban.querySelector('input[type=checkbox]');
      ok(rban.hidden === false && fo && fo.checked === true && /Follow the PC/.test(rban.textContent), 'remote page: the Follow the PC switch in the banner, on by default (no size, touch or device check)');
      ok(rp.doc.getElementById('rmbtn').hidden === true && !rp.doc.getElementById('rmdlg'), 'remote page: no LAN Remote button or dialog');
      ok(posts(rp, '/api/follow/remote').length === 0, 'remote page does not tell the screen it opened with');
      const rto = rp.ctx.__as2gui.cur === 'make' ? 'check' : 'make';
      rp.ESs[0].fire('follow', { screen: rto });
      ok(rp.ctx.__as2gui.cur === rto && posts(rp, '/api/follow/remote').length === 0, 'remote page follows the PC and does not tell it back (no ping-pong)');
      const nb2 = rp.doc.getElementById('nav').children.find(x => x.attrs['aria-selected'] !== 'true');
      if (nb2) { nb2.click(); ok(posts(rp, '/api/follow/remote').length >= 1 && posts(rp, '/api/follow/remote')[0].body.screen === rp.ctx.__as2gui.cur, 'a user page change on the remote page is told (follow/remote)', JSON.stringify(posts(rp, '/api/follow/remote'))); }
      fo.checked = false; fo.fire('change'); ok(rp.store.get('as2gui.rfollow') === '0', 'the Follow the PC state is kept on this device');
      const was = rp.ctx.__as2gui.cur; rp.ESs[0].fire('follow', { screen: was === 'mods' ? 'make' : 'mods' }); ok(rp.ctx.__as2gui.cur === was, 'switch off: the remote page stays');
      const src = require('fs').readFileSync(path.join(__dirname, '..', 'page.js'), 'utf8'), fnTxt = /function rmtInit\(\)[\s\S]*?\n\/\//.exec(src);
      ok(fnTxt && !/innerWidth|matchMedia|maxTouchPoints|ontouch|userAgent|screen\.width/.test(fnTxt[0]), 'the banner has no screen size, touch or device condition');
    }
    pst.res.destroy();

    // new link kills the old one
    let closed = false; st.res.on('end', () => { closed = true; }); st.res.on('close', () => { closed = true; });
    r = await req(P, 'POST', '/api/remote/newkey', {});
    const key2 = r.j && /\?k=([A-Za-z0-9_-]+)$/.exec(r.j.link)[1];
    ok(r.status === 200 && key2 && key2 !== key, 'New link: a new key', r.text);
    r = await req(P, 'GET', '/api/health', { remote: true, host: H, cookie: C }); ok(r.status === 403, 'the old cookie dies at once');
    ok(await until(() => closed), 'the old phone stream is closed');
    r = await req(P, 'GET', '/?k=' + key, { remote: true, host: H }); ok(r.status === 403, 'the old link dies at once');
    r = await req(P, 'GET', '/?k=' + key2, { remote: true, host: H }); ok(r.status === 303, 'the new link works');
    ok(JSON.parse(fs.readFileSync(setFile, 'utf8')).__priv.remoteKey === key2, 'the new key is saved');

    // switch off
    r = await req(P, 'POST', '/api/remote', { body: { on: false } }); ok(r.status === 200 && r.j.on === false, 'switch off from the PC');
    r = await req(P, 'GET', '/api/live'); ok(r.status === 404, 'off and no --dev: no event stream for the PC page');
    r = await req(P, 'GET', '/api/health', { remote: true, host: H, cookie: remote.COOKIE + '=' + key2 }); ok(r.status === 403, 'off: the phone is refused even with the right cookie');
    r = await req(P, 'GET', '/'); ok(!/window\.AS2CFG=\{/.test(r.text) && r.text === require('../page'), 'off and no --dev: the PC page is the plain page again');

    // throttle last (it locks 127.0.0.1 for this server)
    await req(P, 'POST', '/api/remote', { body: { on: true } });
    for (let i = 0; i < remote.BAD_MAX; i++) await req(P, 'GET', '/?k=bad' + i, { remote: true, host: H });
    r = await req(P, 'GET', '/?k=' + key2, { remote: true, host: H }); ok(r.status === 403 && !r.headers['set-cookie'], 'after 20 bad tries the right key is refused too (locked 10 minutes)');
    r = await req(P, 'GET', '/api/health'); ok(r.status === 200, 'the PC page is not locked out');
  } finally { await A.close(); }

  // --remote at start: on from the start (the hook keeps it off the LAN)
  const B = await gui.start({ port: 0, tmpRoot: path.join(S, 'tmp'), remote: true, remoteHook: () => false, lan: [LAN] });
  try { const r = await req(B.port, 'GET', '/api/remote'); ok(r.j && r.j.on === true, '--remote: on at start'); } finally { await B.close(); }

  console.log('remote test: ' + pass + ' passed, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e.stack || e)); process.exit(1); });
