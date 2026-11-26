// ext view test. Arg: scratch dir. Fixture game + mod made here (no real game). Checks: readRef on a mod file, a pak entry (stored and
// deflated) and a game key (loose and packed), the 413 cap, a phone refused outside its roots, slices of a deflated entry (forward,
// back, two at once), the framework routes (bytes, info, hex), readKey/listKeys, the magic table, the ext's shape and strings, the
// remote ALLOW list, the page kind table (VIEW.kindOf, VIEW.open, VIEW.mount) in a fake DOM; then every kinds/*.test.js.
// Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-015b3d21)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'viewx-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
async function rejects(fn, status, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === status, m + (e ? ' [' + e.status + ' ' + e.message + ']' : ' [no error]')); }

// ---- fixture
const game = path.join(work, 'game'), goh = path.join(work, 'goh'), home = path.join(work, 'home');
process.env.GOH_GAME = goh; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home;
wr(path.join(game, 'as64.exe'), 'MZ');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
const pat = (len, seed) => { const b = Buffer.alloc(len); let x = seed >>> 0; for (let i = 0; i < len; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = (x >>> 16) & 0x3f; } return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.alloc(40)]);
wr(path.join(game, 'resource', 'sound', 'v.wav'), wav);
const zw = require('../../../lib/zipwrite');
const pk = Buffer.from('{pk\r\n  {a 1}\r\n}\r\n');
wr(path.join(game, 'resource', 'logic.pak'), zw.zip([['set/pk.set', pk, true]]));
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const bin = Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(12), pat(300000, 7)]);
wr(path.join(mod, 'resource', 'a.zzbin'), bin);
wr(path.join(mod, 'resource', 'set', 't.set'), '{t 1}\r\n');
const big = pat(3 * 1024 * 1024 + 123, 11); big.write('NEEDLEX', 1048573, 'latin1');   // straddles the 1 MB slice of find
const small = Buffer.from('stored bytes here');
wr(path.join(mod, 'resource.pak'), zw.zip([['set/big.dat', big, true], ['set/small.dat', small, false]]));
const huge = path.join(mod, 'resource', 'huge.zzbin');
wr(huge, 'HUGE'); fs.truncateSync(huge, 33 * 1024 * 1024 + 5);
const outside = path.join(work, 'elsewhere', 'x.zzbin'); wr(outside, 'outside');

const ctx = { tools: path.join(__dirname, '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false, runTool: async () => ({ code: 1 }) };
const ext = require('./index'), R = require('./ref'), SV = require('./server');
const U = (p, q) => { const u = new URL('http://x' + p); for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]); return u; };
const get = (name, q, c) => ext.routes['GET /api/x/view/' + name](U('/api/x/view/' + name, q), null, c || ctx);

(async () => {
  // ---- readRef: a mod file, a pak entry (deflated, stored), a game key (loose, packed)
  const a = R.readRef(ctx, { mod, rel: 'resource/a.zzbin' });
  ok(a.buf.equals(bin) && a.where === 'mine' && a.key === 'resource/a.zzbin' && a.rel === 'resource/a.zzbin' && !a.inPak, 'readRef: a mod file');
  const e1 = R.readRef(ctx, { mod, rel: 'resource.pak:\x3aset/big.dat' });
  ok(e1.buf.equals(big) && e1.inPak === 'resource.pak' && e1.entry === 'set/big.dat' && e1.key === 'resource/set/big.dat', 'readRef: a deflated entry of the mod\'s pak');
  ok(R.readRef(ctx, { mod, rel: 'resource.pak:\x3aset/small.dat' }).buf.equals(small), 'readRef: a stored entry');
  const g1 = R.readRef(ctx, { mod, key: 'resource/sound/v.wav' });
  ok(g1.buf.equals(wav) && g1.where === 'vanilla', 'readRef: a game key (loose)');
  const g2 = R.readRef(ctx, { mod, key: 'set/pk.set' });
  ok(g2.buf.equals(pk) && g2.inPak === 'logic.pak', 'readRef: a game key inside a game pak (resource/ added)');
  ok(R.readRef(ctx, { mod, path: path.join(mod, 'resource', 'a.zzbin') }).rel === 'resource/a.zzbin', 'readRef: a path inside the mod is the rel form');
  ok(R.readRef(ctx, { path: outside }).where === 'outside', 'readRef: a path outside');
  await rejects(() => R.readRef(ctx, { mod, rel: 'resource/a.zzbin' }, { max: 1000 }), 413, 'readRef: above max -> 413');
  await rejects(() => get('bytes', { mod, rel: 'resource/huge.zzbin' }), 413, 'bytes: above 32 MB -> 413');
  await rejects(() => R.readRef(ctx, { mod, rel: '../x' }), 400, 'readRef: an escape is refused');
  await rejects(() => R.readRef(ctx, { mod, rel: 'resource/none.bin' }), 404, 'readRef: a missing file -> 404');
  await rejects(() => R.readRef(ctx, { mod, key: 'resource/none/x.bin' }), 404, 'readRef: a missing key -> 404');
  await rejects(() => R.readRef(ctx, {}), 400, 'readRef: no ref -> 400');
  ok(JSON.stringify(R.refOfQuery(U('/x', { mod: 'm', rel: 'r', key: '', idx: '2' }))) === '{"mod":"m","rel":"r","idx":"2"}', 'refOfQuery keeps the ref fields, drops empty ones');

  // ---- a phone: every file is asked through ctx.pathOk
  const inMod = p => path.resolve(p).toLowerCase().startsWith(path.resolve(mod).toLowerCase());
  const phone = Object.assign({}, ctx, { session: { remote: true }, pathOk: inMod });
  ok(R.readRef(phone, { mod, rel: 'resource/a.zzbin' }).buf.length === bin.length, 'phone: a file inside the roots is read');
  await rejects(() => R.readRef(phone, { mod, key: 'resource/sound/v.wav' }), 403, 'phone: a game file outside its roots -> 403');
  await rejects(() => R.readRef(phone, { path: outside }), 403, 'phone: a path outside its roots -> 403');
  await rejects(() => get('hex', { path: outside }, phone), 403, 'phone: hex page outside its roots -> 403');
  const RM = require('../../remote');
  ok(['GET /api/x/view/bytes', 'GET /api/x/view/info', 'GET /api/x/view/hex', 'GET /api/x/view/hex/find'].every(r => RM.ALLOW.has(r)) && !RM.ALLOW.has('POST /api/x/view/info'), 'remote ALLOW: the view GET routes, nothing else');

  // ---- slices of a deflated entry: forward, a step back, a jump back, two at once, past the end
  const src = R.resolve(ctx, { mod, rel: 'resource.pak:\x3aset/big.dat' }).src;
  const at = async (o, l) => (await R.readRange(src, o, l)).equals(big.subarray(o, Math.min(big.length, o + l)));
  ok(await at(0, 65536) && await at(65536, 65536) && await at(2000000, 4096), 'readRange: forward slices of a deflated entry');
  ok(await at(2000000 + 100, 4096), 'readRange: a step back inside the last slice (no restart)');
  ok(await at(10, 100), 'readRange: a jump back to the start (restart)');
  const two = await Promise.all([R.readRange(src, 500000, 1000), R.readRange(src, 900000, 1000)]);
  ok(two[0].equals(big.subarray(500000, 501000)) && two[1].equals(big.subarray(900000, 901000)), 'readRange: two slices of one entry at once');
  ok((await R.readRange(src, big.length - 10, 100)).length === 10 && (await R.readRange(src, big.length + 5, 10)).length === 0, 'readRange: short at the end, empty past it');
  R._dropCursors(); ok(R._cursors() === 0, 'cursors can be dropped');

  // ---- routes
  const by = await get('bytes', { mod, rel: 'resource.pak:\x3aset/small.dat' });
  ok(by.size === small.length && Buffer.from(by.b64, 'base64').equals(small), 'bytes: the whole file as base64');
  const inf = await get('info', { mod, rel: 'resource/a.zzbin' });
  ok(inf.size === bin.length && inf.type === 'ply' && inf.kind === 'hex' && inf.text === false && /^45 50 4c 59 00/.test(inf.magic) && inf.where === 'mine' && inf.ext === 'zzbin', 'info: size, type, kind, magic, where');
  const it2 = await get('info', { mod, rel: 'resource/set/t.set' });
  ok(it2.kind === null && it2.text === true && it2.type === 'text', 'info: a text file has no viewer kind');
  const iw = await get('info', { mod, key: 'resource/sound/v.wav' });
  ok(iw.type === 'wav' && iw.kind !== null && iw.where === 'vanilla' && iw.key === 'resource/sound/v.wav', 'info: a game sound (kind ' + iw.kind + ')');
  const hp = await get('hex', { mod, rel: 'resource.pak:\x3aset/big.dat', off: 2 * 1024 * 1024, len: 65536 });
  ok(hp.off === 2097152 && hp.len === 65536 && hp.size === big.length && Buffer.from(hp.b64, 'base64').equals(big.subarray(2097152, 2097152 + 65536)), 'hex: a 64 KB page of a deflated entry');
  const hh = await get('hex', { mod, rel: 'resource/huge.zzbin', off: 33 * 1024 * 1024 - 2, len: 100 });
  ok(hh.len === 7 && hh.size === 33 * 1024 * 1024 + 5, 'hex: the last bytes of a file over the bytes cap');
  await rejects(() => get('hex', { mod, rel: 'resource/a.zzbin', len: 65537 }), 400, 'hex: a page over 64 KB -> 400');
  await rejects(() => get('hex', { mod, rel: 'resource/a.zzbin', off: -1 }), 400, 'hex: a negative offset -> 400');
  await rejects(() => get('hex', { mod, rel: 'resource/a.zzbin', off: bin.length + 1 }), 416, 'hex: past the end -> 416');

  // ---- neighbours in the layered view
  ok(R.readKey(ctx, mod, 'resource/set/pk.set').equals(pk) && R.readKey(ctx, mod, 'resource/none.x') === null, 'readKey: the copy the game loads, or null');
  const ks = R.listKeys(ctx, mod, 'resource/set/');
  ok(ks.includes('resource/set/pk.set') && ks.includes('resource/set/t.set') && ks.every(k => k.startsWith('resource/set/')), 'listKeys: game and mod keys under a prefix (' + ks.length + ')');

  // ---- no mod picked: the key form, readKey and listKeys read the game as it ships; the rel form and a climb out are refused
  const n1 = R.readRef(ctx, { key: 'resource/sound/v.wav' });
  ok(n1.buf.equals(wav) && n1.where === 'vanilla', 'no mod: readRef by key reads the game file');
  ok(R.readRef(ctx, { key: 'set/pk.set' }).buf.equals(pk), 'no mod: a key inside a game pak');
  ok((await get('info', { key: 'resource/sound/v.wav' })).size === wav.length, 'no mod: the info route by key');
  ok(R.readKey(ctx, '', 'resource/set/pk.set').equals(pk) && R.readKey(ctx, null, 'resource/set/t.set') === null, 'no mod: readKey reads the game alone (a mod file is not in it)');
  const nk = R.listKeys(ctx, '', 'resource/set/');
  ok(nk.includes('resource/set/pk.set') && !nk.includes('resource/set/t.set'), 'no mod: listKeys lists the game keys only (' + nk.join(',') + ')');
  await rejects(() => R.readRef(ctx, { key: 'resource/../../elsewhere/x.zzbin' }), 400, 'no mod: a key that climbs out of the game -> 400');
  await rejects(() => R.listKeys(ctx, '', '../elsewhere/'), 400, 'no mod: a list prefix that climbs out -> 400');
  await rejects(() => R.readRef(ctx, { rel: 'resource/a.zzbin' }), 400, 'no mod: the rel form (a file of the mod) still needs a mod');
  await rejects(() => R.readRef(Object.assign({}, ctx, { game: () => null }), { key: 'resource/sound/v.wav' }), 400, 'no mod and no game folder -> 400');
  const inGame = p => { const a = path.resolve(p).toLowerCase(), g = path.resolve(game).toLowerCase(); return a === g || a.startsWith(g + path.sep); };
  const gphone = Object.assign({}, ctx, { session: { remote: true }, pathOk: inGame });
  ok(R.readRef(gphone, { key: 'resource/sound/v.wav' }).buf.equals(wav), 'no mod, a phone that is shown the game folder: a game key is read');
  await rejects(() => R.readRef(gphone, { path: outside }), 403, 'no mod, a phone: a path outside the game root -> 403');
  await rejects(() => R.readRef(phone, { key: 'resource/sound/v.wav' }), 403, 'no mod, a phone not shown the game folder -> 403');

  // ---- magic table
  const G = (s, e) => SV.guess(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'), e || '');
  ok(G('DDS |') === 'dds' && G('\x89PNG\r\n\x1a\n') === 'png' && G(wav) === 'wav' && G('EANM..\x00') === 'anm' && G('Fps[PS]\x00') === 'pso' && G('Yvs[VS]\x00') === 'vso' &&
    G('BMF\x03\x00') === 'bmfont' && G('GRASPMAP\x00') === 'grs' && G('8BPS\x00') === 'psd' && G('PK\x03\x04\x00') === 'zip' && G('{a 1}') === 'text' && G('ab\x00') === 'data' && G('') === 'empty', 'guess: the game\'s magic bytes');

  // ---- the ext: shape and strings
  ok(ext.id === 'view' && ext.tab === false && !ext.nav && typeof ext.script === 'string' && !/`|\$\{/.test(ext.script) && !/innerHTML|insertAdjacentHTML|document\.write/.test(ext.script), 'ext: no tab, a page-safe script');
  ok(Object.keys(ext.routes).every(k => /^(GET|POST) \/api\/x\/view\/[a-z0-9/_-]+$/.test(k)) && ext.KINDS.length === 9 && ext.kinds.includes('hex'), 'ext: routes under /api/x/view, the kind list');
  const L = ext.lang, keys = Object.keys(L.en);
  ok(keys.length > 40 && keys.every(k => k.startsWith('view.') && ['ru', 'uk', 'zh'].every(c => typeof L[c][k] === 'string' && L[c][k].length > 0)), 'ext: every string in en, ru, uk, zh');
  const used = [...ext.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !L.en[k]);
  ok(!used.length, 'ext: every tx key used exists: ' + used.join());
  ok(SV.guess(Buffer.from('x'), '') === 'text' && /^GET \/api\/x\/view\/hex\/find$/.test(ext.remote.find(r => r.includes('find')) || ''), 'ext: a kind\'s remote list is collected');

  // ---- the page side in a fake DOM: kind table, open, mount
  {
    const fakedom = require('../../test/fakedom'), doc = fakedom.make(), timers = [], calls = [];
    const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
    box.window = box;
    const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
    const tx = (k, p) => { let s = L.en[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return s; };
    const api = u => { calls.push(u); const p = u.split('?')[0];
      if (p === '/api/x/view/info') return Promise.resolve({ name: 'a.zzbin', size: 40, where: 'mine', type: 'ply', magic: '45 50 4c 59', key: 'resource/a.zzbin' });
      if (p === '/api/x/view/hex') return Promise.resolve({ off: 0, len: 40, size: 40, b64: Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(36, 0x41)]).toString('base64') });
      return Promise.reject(Object.assign(new Error('no'), { status: 404 })); };
    const S = { mod: 'C:/g/mods/mine', sec: {} };
    Object.assign(box, { h, tx, api, S, show: id => calls.push('show:' + id), toast: m => calls.push('toast:' + m) });
    vm.createContext(box);
    vm.runInContext(ext.script, box, { filename: 'view-script' });
    const V = box.VIEW, flush = async () => { for (let i = 0; i < 6; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
    ok(V && V.specs.hex && V.specs.hex.where === 'tab', 'page: VIEW and the hex kind are registered');
    ok(V.kindOf('resource/set/t.set') === null && V.kindOf('a.lng') === null && V.kindOf('resource/set/units/x') === null && V.kindOf('a.unknownext') === null, 'kindOf: text and unknown names are text (null)');
    ok(V.kindOf('resource.pak') !== null && V.kindOf('a.exe') === 'hex' && V.kindOf('x.pak:\x3aset/a.zzz') === null, 'kindOf: bytes are a viewer, a pak entry by its own name');
    V.reg('zzt', { where: 'tab', exts: ['zzt'], open: () => ({}) });
    V.reg('zzm', { where: 'tab', exts: [], match: name => /special\.def$/.test(name), open: () => ({}) });
    let went = null; V.reg('zzp', { where: 'page', exts: ['zzp'], go: it => { went = it; return true; } });
    ok(V.kindOf('a.ZZT') === 'zzt' && V.kindOf('resource/special.def') === 'zzm' && V.kindOf('b.zzp') === 'zzp', 'kindOf: a kind\'s exts and match (match first, over the text table)');
    let threw = 0; try { V.reg('bad', { where: 'tab' }); } catch { threw++; } try { V.reg('Bad Kind', { open() {} }); } catch { threw++; }
    ok(threw === 2, 'reg: a tab kind needs open(), a kind needs a plain name');
    ok(V.open({ rel: 'models/x.zzp' }) === true && went && went.kind === 'zzp' && went.ref.mod === 'C:/g/mods/mine' && /rel=models%2Fx.zzp/.test(went.q), 'open: a page kind goes to its page with an item');
    calls.length = 0; ok(V.open({ rel: 'resource/a.zzbin' }, null, { kind: 'hex' }) === true && doc.body.querySelector('dialog') && calls.indexOf('show:ide') < 0, 'open: no Editor on this page -> a box');
    S.sec.ide = true; box.IDE_PENDING = [];
    ok(V.open({ rel: 'resource/b.zzt' }) && box.IDE_PENDING.length === 1 && box.IDE_PENDING[0].view === 'zzt' && calls.indexOf('show:ide') >= 0, 'open: with the Editor -> a pending viewer tab');
    const host = doc.createElement('div'); doc.body.appendChild(host);
    const hd = V.mount(host, { rel: 'resource/a.zzbin' }, 'a.zzbin', { kind: 'hex' });
    await flush();
    const txt = host.textContent;
    ok(hd.kind === 'hex' && /a\.zzbin/.test(txt) && /40 bytes/.test(txt) && /45 50 4c 59/.test(txt) && /EPLYAAAA/.test(txt.replace(/\s/g, '')), 'mount: hex header and dump');
    ok(calls.some(u => /^\/api\/x\/view\/hex\?mod=.*&rel=resource%2Fa.zzbin&off=0&len=65536$/.test(u)), 'mount: pages asked by ref, offset and length');
    hd.close(); ok(!host.children.length, 'mount: close removes the viewer');
    ok(Buffer.from(V.b64(Buffer.from([1, 2, 255]).toString('base64'))).equals(Buffer.from([1, 2, 255])), 'b64 -> bytes');
    ok(V.size(10) === '10 B' && V.size(2048) === '2.0 KB' && /MB$/.test(V.size(5e6)), 'size words');
    // no mod picked: a key goes through (the game view), a rel (a file of the mod) does not
    S.mod = '';
    const nk = V.norm({ key: 'Resource/Sound/V.wav', idx: 0 }), ni = V.item({ key: 'resource/sound/v.wav' }, 'v.wav', 'hex');
    ok(nk && nk.key === 'resource/sound/v.wav' && nk.idx === 0 && !('mod' in nk) && ni && /key=resource%2Fsound%2Fv.wav/.test(ni.q) && !/mod=/.test(ni.q), 'no mod: a key is kept, with no mod in the query');
    ok(V.norm({ rel: 'resource/a.zzbin' }) === null && V.item({ rel: 'resource/a.zzbin' }, 'a', 'hex') === null, 'no mod: a rel is still dropped');
    calls.length = 0;
    const host2 = doc.createElement('div'); doc.body.appendChild(host2);
    const hk = V.mount(host2, { key: 'resource/a.zzbin' }, 'a.zzbin', { kind: 'hex' });
    await flush();
    ok(hk && calls.some(u => /^\/api\/x\/view\/hex\?key=resource%2Fa.zzbin/.test(u)) && /40 bytes/.test(host2.textContent), 'no mod: the look pane mounts a game key ' + calls.join(' '));
    hk.close(); S.mod = 'C:/g/mods/mine';
  }

  // ---- each kind's own test
  const kdir = path.join(__dirname, 'kinds');
  for (const f of fs.readdirSync(kdir).filter(x => x.endsWith('.test.js')).sort()) {
    const r = require('../../../lib/test/wait').spawnSync(process.execPath, [path.join(kdir, f), path.join(work, 'k-' + f.replace(/\W+/g, '_'))], { encoding: 'utf8', shell: false, timeout: 300000 }, 'view test');   // killed: once more with twice the limit
    const lines = String(r.stdout || '').trim().split(/\r?\n/), last = lines[lines.length - 1];
    ok(r.status === 0 && /PASS$/.test(last || ''), 'kind test ' + f + ': ' + (last || '') + (r.status ? '\n' + lines.slice(-12).join('\n') + String(r.stderr || '').slice(-800) : ''));
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view ext ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
