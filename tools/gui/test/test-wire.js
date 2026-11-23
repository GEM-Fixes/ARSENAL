// The bytes on the wire (tools/gui/PERF.md A4, A5): node tools/gui/test/test-wire.js [scratch]
//  - a loopback answer is written exactly as before: the same header lines in the same order, no content-encoding, the body
//    JSON.stringify of the answer, also when the request accepts gzip;
//  - a socket that is not loopback (a phone on the LAN) whose request accepts gzip gets the same bytes packed (they inflate to the
//    loopback body, content-length = the packed length); small answers, pictures and requests without gzip stay plain;
//  - an answer that carries its own JSON text (__json, the Editor's tree) is byte-equal to JSON.stringify of that answer.
// No LAN is opened: the remote socket is a loopback one whose remoteAddress the test's own server overrides. Made-up fixture only.
// Author: Imperator_Aug (ARSENAL, ia-085e8f80)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), http = require('http'), zlib = require('zlib');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'gui-wire-')));
require('../../lib/testscratch').guard(S);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
const gui = require('../gui.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : ' [' + String(x).slice(0, 500) + ']')); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

// one raw HTTP/1.1 GET -> { head: [lines], body: Buffer (chunks joined), raw }
function raw(port, p, heads) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1'), b = [];
    s.on('data', d => b.push(d)); s.on('error', reject);
    s.on('end', () => {
      const all = Buffer.concat(b), cut = all.indexOf('\r\n\r\n');
      const head = all.subarray(0, cut).toString('latin1').split('\r\n');
      let body = all.subarray(cut + 4);
      if (head.some(h => /^transfer-encoding: chunked$/i.test(h))) {
        const parts = [];
        for (let i = 0; ;) { const e = body.indexOf('\r\n', i), n = parseInt(body.subarray(i, e).toString('latin1'), 16); if (!(n > 0)) break; parts.push(body.subarray(e + 2, e + 2 + n)); i = e + 2 + n + 2; }
        body = Buffer.concat(parts);
      }
      resolve({ head, body, raw: all });
    });
    s.write('GET ' + p + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nConnection: close\r\n' + (heads || []).map(h => h + '\r\n').join('') + '\r\n');
  });
}
const noDate = r => r.head.map(h => (/^date: /i.test(h) ? 'Date: X' : h)).join('\n');
const GZ = ['Accept-Encoding: gzip, deflate, br'];
// the header lines of a JSON answer and of the page as they were before this change (loopback, Connection: close)
const JSON_HEAD = 'HTTP/1.1 200 OK\ncontent-type: application/json; charset=utf-8\ncache-control: no-store\nx-content-type-options: nosniff\nDate: X\nConnection: close\nTransfer-Encoding: chunked';
const PAGE_HEAD = n => 'HTTP/1.1 200 OK\ncontent-type: text/html; charset=utf-8\ncache-control: no-store\nx-content-type-options: nosniff\ncontent-length: ' + n + '\nDate: X\nConnection: close';

(async () => {
  const game = path.join(S, 'game'), mod = path.join(game, 'mods', 'mine');
  wr(path.join(game, 'as64.exe'), 'MZ'); wr(path.join(game, 'resource', 'entity', 'gun.def'), '{entity "gun"}\r\n');
  wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
  for (let i = 0; i < 40; i++) wr(path.join(mod, 'resource', 'set', 'f' + i + ' é.set'), '{x ' + i + '}\r\n');
  const A = await gui.start({ port: 0, cwd: S, tmpRoot: path.join(S, 'tmp'), settingsFile: path.join(S, 'settings.json') });
  const port = A.port;

  // ---------------------------------------------------------------- loopback: exactly as before
  const h1 = await raw(port, '/api/health'), h2 = await raw(port, '/api/health', GZ);
  ok(noDate(h1) === JSON_HEAD && noDate(h2) === JSON_HEAD, 'loopback JSON: the header lines of before, with and without Accept-Encoding', noDate(h2));
  ok(h1.body.equals(h2.body) && h1.body.toString('utf8') === JSON.stringify(JSON.parse(h1.body.toString('utf8'))) && JSON.parse(h1.body.toString('utf8')).ok === true, 'loopback JSON: the body is JSON.stringify of the answer', h1.body.toString('utf8'));
  const c1 = await raw(port, '/api/commands'), c2 = await raw(port, '/api/commands', GZ);
  ok(c1.body.length > 20000 && c1.raw.length === c2.raw.length && noDate(c2) === JSON_HEAD && c1.body.equals(c2.body), 'loopback: a 50 KB answer is not packed when the request accepts gzip', noDate(c2));
  ok(c1.body.equals(Buffer.from(JSON.stringify(JSON.parse(c1.body.toString('utf8'))), 'utf8')), 'loopback: /api/commands is JSON.stringify of its answer');
  const p1 = await raw(port, '/'), p2 = await raw(port, '/', GZ);
  ok(noDate(p1) === PAGE_HEAD(p1.body.length) && noDate(p2) === noDate(p1) && p1.body.equals(p2.body) && p1.body.length > 100000, 'loopback page: the header lines of before, the same bytes with Accept-Encoding', noDate(p2));
  const n1 = await raw(port, '/api/nope', GZ);
  ok(/ 404 /.test(n1.head[0]) && !n1.head.some(h => /^content-encoding/i.test(h)), 'loopback: an error answer is plain');

  // ---------------------------------------------------------------- the Editor's tree: its own JSON text (A4)
  const q = '/api/x/ide/tree?mod=' + encodeURIComponent(mod) + '&game=' + encodeURIComponent(game);
  const same = (r, m) => { const t = r.body.toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* shown below */ } ok(!!j && Array.isArray(j.files) && t === JSON.stringify(j) && noDate(r) === JSON_HEAD, m, t.slice(0, 300)); return j || {}; };
  const t0 = same(await raw(port, q), 'tree, whole list: the bytes are JSON.stringify of the answer');
  ok(t0.files.length >= 41 && t0.done === true && t0.total === t0.files.length && Object.keys(t0).join() === 'mod,files,total,off,next,ver,done,unread,truncated,notes,game,undo' && !('__json' in t0), 'tree, whole list: the fields and their order as before', Object.keys(t0).join());
  ok(t0.files.some(f => /é\.set$/.test(f.rel)), 'tree: a name outside ASCII comes through');
  const t1 = same(await raw(port, q + '&lim=3'), 'tree, first page: JSON.stringify of the answer');
  ok(t1.files.length === 3 && t1.next === 3 && t1.off === 0, 'tree, first page: 3 rows', JSON.stringify([t1.files.length, t1.next]));
  const pg = '&lim=3&off=3&ver=' + encodeURIComponent(t1.ver);
  const a = await raw(port, q + pg); same(a, 'tree, second page of the kept list');
  await new Promise(r => setTimeout(r, 300));   // the walk is over by now: the next two asks meet a finished list (kept row text)
  const b = await raw(port, q + pg), c = await raw(port, q + pg, GZ);
  const jb = same(b, 'tree, the same page of the finished list'); same(c, 'tree, the same page again (kept row text)');
  ok(b.body.equals(c.body) && JSON.stringify(jb.files) === JSON.stringify(t0.files.slice(3, 6)) && jb.ver === t1.ver, 'tree: a page asked again has the same rows as the whole list', JSON.stringify(jb.files).slice(0, 200));
  const all2 = await raw(port, q + '&ver=' + encodeURIComponent(t1.ver)), j2 = same(all2, 'tree, whole kept list');
  ok(JSON.stringify(j2.files) === JSON.stringify(t0.files), 'tree, whole kept list: the rows of the first whole list');
  const bad = await raw(port, '/api/x/ide/tree?mod=zz');
  ok(/ 400 /.test(bad.head[0]) && typeof JSON.parse(bad.body.toString('utf8')).error === 'string', 'tree: a refused ask is a JSON error as before', bad.head[0]);
  await A.close();

  // ---------------------------------------------------------------- a socket that is not loopback (the send functions on a test server)
  const W = gui._wire;
  const big = { rows: [], note: 'hé да 中' }; for (let i = 0; i < 3000; i++) big.rows.push({ rel: 'resource/set/file' + i + '.set', size: i, state: 'new' });
  const bigText = JSON.stringify(big);
  const pre = { a: 1, list: big.rows.slice(0, 200) };
  Object.defineProperty(pre, '__json', { enumerable: false, value: Buffer.from(JSON.stringify(pre), 'utf8') });
  const png = 'P'.repeat(5000);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('far') === '1') Object.defineProperty(res.socket, 'remoteAddress', { value: '192.168.1.77', configurable: true });
    if (u.pathname === '/big') return W.send(res, 200, big);
    if (u.pathname === '/small') return W.send(res, 200, { ok: true });
    if (u.pathname === '/pre') return W.send(res, 200, pre);
    if (u.pathname === '/text') return W.send(res, 200, bigText, 'text/javascript; charset=utf-8', { 'x-extra': '1' });
    if (u.pathname === '/png') return W.send(res, 200, png, 'image/png');
    if (u.pathname === '/zip') return W.send(res, 200, png, 'application/zip');
    if (u.pathname === '/err') return W.send(res, 403, { error: 'e'.repeat(3000) });
    if (u.pathname === '/page') return W.sendPage(res, u.searchParams.get('cfg') ? { remote: true, live: true, dev: false } : null);
    res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const sp = srv.address().port;
  const hd = (r, n) => { const h = r.head.find(x => x.toLowerCase().startsWith(n + ': ')); return h === undefined ? null : h.slice(n.length + 2); };
  const packed = r => hd(r, 'content-encoding') === 'gzip';

  const near = await raw(sp, '/big', GZ), far = await raw(sp, '/big?far=1', GZ), farNo = await raw(sp, '/big?far=1');
  ok(noDate(near) === JSON_HEAD && near.body.equals(Buffer.from(bigText, 'utf8')), 'send, loopback: plain, the header lines of before');
  ok(packed(far) && hd(far, 'vary') === 'accept-encoding' && Number(hd(far, 'content-length')) === far.body.length && far.body.length < near.body.length / 3, 'send, remote + gzip: packed, content-length = the packed length', far.head.join(' | '));
  ok(zlib.gunzipSync(far.body).equals(near.body), 'send, remote + gzip: inflates to the loopback bytes');
  ok(hd(far, 'content-type') === 'application/json; charset=utf-8' && hd(far, 'cache-control') === 'no-store' && hd(far, 'x-content-type-options') === 'nosniff', 'send, remote + gzip: the other headers as before');
  ok(noDate(farNo) === JSON_HEAD && farNo.body.equals(near.body), 'send, remote without Accept-Encoding: plain, as before');
  for (const [h, want] of [['Accept-Encoding: gzip;q=0', false], ['Accept-Encoding: deflate, br', false], ['Accept-Encoding: identity', false], ['Accept-Encoding: br;q=1.0, gzip;q=0.5', true], ['Accept-Encoding: x-gzip', true]]) {
    const r = await raw(sp, '/big?far=1', [h]);
    ok(packed(r) === want && (want ? zlib.gunzipSync(r.body) : r.body).equals(near.body), 'send, remote, ' + h + ': ' + (want ? 'packed' : 'plain'), r.head.join(' | '));
  }
  const sm = await raw(sp, '/small?far=1', GZ);
  ok(!packed(sm) && sm.body.toString() === '{"ok":true}' && noDate(sm) === JSON_HEAD, 'send, remote: an answer under 1 KB stays plain');
  for (const k of ['/png', '/zip']) { const r = await raw(sp, k + '?far=1', GZ); ok(!packed(r) && r.body.toString() === png, 'send, remote: ' + k + ' (packed already) is never packed', r.head.join(' | ')); }
  const tx = await raw(sp, '/text?far=1', GZ), txn = await raw(sp, '/text', GZ);
  ok(packed(tx) && hd(tx, 'x-extra') === '1' && hd(tx, 'content-type') === 'text/javascript; charset=utf-8' && zlib.gunzipSync(tx.body).equals(txn.body) && !packed(txn), 'send, remote: a text answer with its own type and extra header');
  const er = await raw(sp, '/err?far=1', GZ);
  ok(/ 403 /.test(er.head[0]) && packed(er) && JSON.parse(zlib.gunzipSync(er.body).toString()).error.length === 3000, 'send, remote: the status of a packed error answer stays');
  const pr = await raw(sp, '/pre', GZ), prf = await raw(sp, '/pre?far=1', GZ);
  ok(noDate(pr) === JSON_HEAD && pr.body.toString('utf8') === JSON.stringify(pre) && !/__json/.test(pr.body.toString()), 'send, an answer with its own JSON text: the bytes of JSON.stringify, the header lines of before');
  ok(packed(prf) && zlib.gunzipSync(prf.body).equals(pr.body), 'send, remote: the same answer packed');

  const g0 = await raw(sp, '/page', GZ), g1 = await raw(sp, '/page?far=1', GZ), g2 = await raw(sp, '/page?far=1', GZ), g3 = await raw(sp, '/page?far=1');
  ok(noDate(g0) === PAGE_HEAD(g0.body.length) && g0.body.equals(p1.body), 'sendPage, loopback: the page of the server, plain');
  ok(packed(g1) && Number(hd(g1, 'content-length')) === g1.body.length && zlib.gunzipSync(g1.body).equals(g0.body) && g1.body.length < g0.body.length / 2, 'sendPage, remote + gzip: inflates to the same page (' + g0.body.length + ' -> ' + g1.body.length + ' bytes)');
  ok(g2.body.equals(g1.body) && noDate(g3) === PAGE_HEAD(g0.body.length) && g3.body.equals(g0.body), 'sendPage, remote: the packed page is kept; without Accept-Encoding the plain page');
  const v0 = await raw(sp, '/page?cfg=1', GZ), v1 = await raw(sp, '/page?cfg=1&far=1', GZ);
  ok(!v0.body.equals(g0.body) && packed(v1) && zlib.gunzipSync(v1.body).equals(v0.body), 'sendPage, remote: each page variant has its own packed bytes');
  await new Promise(r => srv.close(r));

  console.log(fail ? 'test-wire FAIL ' + fail + ' (' + pass + ' ok)' : 'test-wire PASS ' + pass);
  try { fs.rmSync(S, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch (e) { /* the scratch owner cleans */ }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
