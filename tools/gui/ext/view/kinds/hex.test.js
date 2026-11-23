// view kind hex test (the reference kind test: a kind's own fixture, its server route, its page script in a fake DOM). Arg: scratch
// dir. Checks: find (text, bytes, a match across the 1 MB slice, inside a deflated pak entry, not found, bad input), the kind's files
// (exts, routes, remote, strings), the dump (rows, a page that fails, an empty file), cursor keys, go to a byte, find next, the readout.
// Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-db68361a)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'hexk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
async function rejects(fn, status, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === status, m + (e ? ' [' + e.message + ']' : ' [no error]')); }

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const body = Buffer.alloc(2 * 1024 * 1024 + 77, 0x2e);
body.write('EPLY', 0, 'latin1'); body.write('MIDDLE', 1048574, 'latin1'); body.write('ENDMARK', body.length - 7, 'latin1');
wr(path.join(mod, 'resource', 'm.zzbin'), body);
wr(path.join(mod, 'resource.pak'), require('../../../../lib/zipwrite').zip([['set/d.dat', body, true]]));
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const HS = require('./hex.server'), HL = require('./hex.lang'), HC = require('./hex.client');
const U = q => { const u = new URL('http://x/api/x/view/hex/find'); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return u; };
const find = q => HS.routes['GET /api/x/view/hex/find'](U(Object.assign({ mod }, q)), null, ctx);

(async () => {
  // ---- the kind's files
  ok(Array.isArray(HS.exts) && !HS.exts.length && HS.remote.length === 1 && HS.remote[0] === 'GET /api/x/view/hex/find', 'server: hex claims no extension (it is the fallback), its find route is open to a phone');
  ok(HL.every(r => r.length === 5 && r[0].startsWith('view.hex.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.hex.* in en, ru, uk, zh');
  const keys = new Set(HL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...HC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k));
  ok(!miss.length && !/`|\$\{|innerHTML/.test(HC.script), 'client: page-safe, every tx key exists ' + miss.join());

  // ---- find
  const f1 = await find({ rel: 'resource/m.zzbin', text: 'MIDDLE' });
  ok(f1.at === 1048574 && f1.len === 6 && !f1.done, 'find: text across the 1 MB slice');
  const f2 = await find({ rel: 'resource/m.zzbin', hex: '45 4e 44 4d', from: 5 });
  ok(f2.at === body.length - 7, 'find: bytes near the end');
  const f3 = await find({ rel: 'resource.pak:\x3aset/d.dat', text: 'ENDMARK', from: 100 });
  ok(f3.at === body.length - 7, 'find: inside a deflated pak entry');
  const f4 = await find({ rel: 'resource.pak:\x3aset/d.dat', text: 'MIDDLE', from: f3.at - 50000 });
  ok(f4.at < 0 && f4.done, 'find: not found after the start point (from ' + (f3.at - 50000) + ')');
  const f5 = await find({ rel: 'resource/m.zzbin', text: 'EPLY', from: 1 });
  ok(f5.at === -1 && f5.done && f5.next === body.length, 'find: from past a match goes on to the end');
  await rejects(() => find({ rel: 'resource/m.zzbin', hex: '4' }), 400, 'find: odd hex -> 400');
  await rejects(() => find({ rel: 'resource/m.zzbin' }), 400, 'find: nothing to find -> 400');
  await rejects(() => find({ rel: 'resource/m.zzbin', text: 'x'.repeat(300) }), 400, 'find: too long -> 400');

  // ---- the page script in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [], calls = [];
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
  box.window = box;
  const L = {}; for (const r of require('../lang').concat(HL)) L[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, p) => { let s = L[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return s; };
  const SIZE = 200000, file = Buffer.alloc(SIZE); for (let i = 0; i < SIZE; i++) file[i] = i & 0xff; file.write('FINDME', 70000, 'latin1');
  let failPage = -1;
  const api = u => { calls.push(u); const p = u.split('?')[0], q = new URL('http://x' + u).searchParams;
    if (p === '/api/x/view/info') return Promise.resolve({ name: 'f.zzbin', size: SIZE, where: 'vanilla', type: 'data', magic: '00 01 02', key: 'resource/f.zzbin' });
    if (p === '/api/x/view/hex') { const off = +q.get('off'), len = +q.get('len'); if (off / 65536 === failPage) return Promise.reject(Object.assign(new Error('disk gone'), { status: 500 }));
      const b = file.subarray(off, off + len); return Promise.resolve({ off, len: b.length, size: SIZE, b64: b.toString('base64') }); }
    if (p === '/api/x/view/hex/find') { const from = +q.get('from'), t = q.get('text'), i = file.indexOf(Buffer.from(t), from); return Promise.resolve({ at: i, len: t.length, next: SIZE, size: SIZE, done: i < 0 }); }
    return Promise.reject(new Error('unknown ' + u)); };
  Object.assign(box, { h, tx, api, S: { mod: 'C:/m', sec: {} }, show() {}, toast() {} });
  box.LS = { get: (k, d) => d, set() {} }; // searchKit history store stub; the real kit runs below (blockcheck kitSrc)
  vm.createContext(box);
  const css = require('../client').css + '\n' + HC.css;
  vm.runInContext(require('../../../test/blockcheck').kitSrc(), box, { filename: 'searchKit' });
  vm.runInContext(require('../client').script(css) + '\n' + HC.script, box, { filename: 'hex-script' });
  const V = box.VIEW, flush = async () => { for (let i = 0; i < 8; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const hd = V.mount(host, { key: 'resource/f.zzbin' }, 'f.zzbin', { kind: 'hex' });
  await flush();
  const sc = host.querySelector('.vw-hx-sc'), rd = host.querySelector('.vw-hx-rd'), rows = () => host.querySelectorAll('.vw-hx-r');
  const cur = () => { const c = host.querySelector('.vw-hx-b.vw-hx-cur'); return c ? +c.getAttribute('data-o') : -1; };
  ok(rows().length === 24 && rows()[0].textContent.startsWith('00000000000102') && rows()[1].textContent.startsWith('00000010101112'), 'dump: 24 rows from byte 0, offsets and bytes in hex');
  ok(/vanilla|game/.test(host.textContent) && host.querySelector('.vw-head') && /195\.3 KB/.test(host.textContent), 'dump: header with size and where');
  ok(cur() === 0 && /^Byte 0x0 \(0\)   8-bit 0 \(0\)   16-bit 256 \(256\)   32-bit 50462976 /.test(rd.textContent), 'readout: numbers at the cursor, low byte first: ' + rd.textContent);
  const key = (k, extra) => { sc.fire('keydown', Object.assign({ key: k, ctrlKey: false, metaKey: false }, extra || {})); };
  key('ArrowRight'); key('ArrowDown'); await flush();
  ok(cur() === 17, 'keys: right then down -> byte 17');
  key('PageDown'); await flush();
  ok(cur() === 17 + 16 * 23 && host.querySelectorAll('.vw-hx-r')[0].textContent.startsWith('00000') , 'keys: Page Down moves a screen');
  key('End', { ctrlKey: true }); await flush();
  ok(cur() === SIZE - 1 && calls.some(u => /off=196608&len=65536/.test(u)), 'keys: Ctrl+End -> the last byte, its page asked');
  key('Home', { ctrlKey: true }); await flush();
  ok(cur() === 0, 'keys: Ctrl+Home -> byte 0');
  const offIn = host.querySelector('input.vw-hx-in'); offIn.value = '0x1F00'; host.querySelector('button').click(); await flush();
  ok(cur() === 0x1f00, 'go to: 0x1F00 (hex)');
  offIn.value = '7937'; offIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(cur() === 7937, 'go to: 7937 (decimal) by Enter');
  offIn.value = 'zz!'; offIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(cur() === 7937 && /Type a byte number/.test(host.querySelector('.vw-hx-msg').textContent), 'go to: a bad number says how to type it');
  offIn.value = String(SIZE); offIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(/only 200000 bytes/.test(host.querySelector('.vw-hx-msg').textContent), 'go to: past the end says the size');
  ok(host.querySelectorAll('span.sk').some(x => x.getAttribute('data-sk') === 'view.hex.find') && !!host.querySelector('button.sk-browse'), 'find box has the search kit (strings list, history)');
  const fIn = host.querySelector('input.vw-hx-fin'); fIn.value = 'FINDME'; fIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(cur() === 70000 && host.querySelectorAll('.vw-hx-mk').length === 5 && /Found at byte 0x11170/.test(host.querySelector('.vw-hx-msg').textContent), 'find next: cursor on the match, the match marked');
  fIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(/Not found after/.test(host.querySelector('.vw-hx-msg').textContent) && cur() === 70000, 'find next again: not found after it');
  const sel = host.querySelector('select'); sel.value = 'hex'; fIn.value = '4G'; fIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(/pairs/.test(host.querySelector('.vw-hx-msg').textContent), 'find bytes: a bad pair says how to type it');
  { // Browse: the folder picker at the file's folder in the game data; a picked file's name is found as text
    let pk = null; box.searchKit.picker = (spec, done) => { pk = spec; done('set/findme.set', { view: 'data', path: 'set/findme.set', key: 'resource/set/findme.set' }); };
    host.querySelector('button.sk-browse').click(); await flush();
    ok(pk && pk.mode === 'file' && pk.view === 'data' && pk.start === '', 'browse: the data view at the file\'s folder ' + JSON.stringify(pk));
    ok(fIn.value === 'findme' && sel.value === 'text', 'browse: the picked name goes into the find box in text mode (' + fIn.value + ')');
    ok(JSON.stringify(V.browseAt(V.item({ key: 'resource/set/a/b.pak:\x3ax/y.set' }))) === '{"view":"data","start":"set/a"}' && JSON.stringify(V.browseAt(V.item({ mod: 'C:/m', rel: 'resource/set/a.set' }))) === '{"view":"disk","start":"C:/m/resource/set"}', 'browseAt: a key opens its game folder, a mod file its folder in the mod'); }
  // a page that cannot be read shows ?? and says why, the rest still works
  failPage = 2; offIn.value = String(65536 * 2 + 5); offIn.fire('keydown', { key: 'Enter' }); await flush();
  ok(/\?\?/.test(host.textContent) && /disk gone/.test(host.querySelector('.vw-hx-msg').textContent), 'a page that fails: ?? and the reason');
  hd.hide(); hd.show(); hd.close(); ok(!host.children.length, 'hide, show, close');
  // an empty file
  const api0 = api; box.api = u => (u.startsWith('/api/x/view/info') ? Promise.resolve({ name: 'e', size: 0, where: 'mine', type: 'empty', magic: '' }) : api0(u));
  vm.runInContext('api=window.api', box);
  const h2 = doc.createElement('div'); doc.body.appendChild(h2); V.mount(h2, { rel: 'e.zzbin' }, 'e.zzbin', { kind: 'hex' }); await flush();
  ok(/The file is empty/.test(h2.textContent), 'an empty file says so');

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind hex ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
