// view kind picture test. Arg: scratch dir. A fixture game + mod (a DXT1 .dds with 2 mips and a .tga of the same name, a .tga in
// a pak, a .ebm that names the .dds, a DX10 .dds, a .png, a .tga beside a .mdl), then: the kind's files (exts, routes, remote,
// strings), GET /api/x/view/picture/info and /image on rel, key and pak refs (pixels, mip, max, verdicts, frame, mdl, refusals), and
// the page script in tools/gui/test/fakedom.js with a stubbed canvas (header card, notes, mip picker, channels, zoom, pan, readout,
// Show bytes, Open the model, a picture that cannot be shown, close). Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-42de1011)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'pick-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
async function rejects(fn, status, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === status, m + (e ? ' [' + e.status + ' ' + e.message + ']' : ' [no error]')); }

// ---- fixture files
function dds(w, h, mips, four, data) {
  const hd = Buffer.alloc(124);
  hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007, 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(w, 12); hd.writeUInt32LE(mips, 24); hd.writeUInt32LE(32, 72);
  hd.writeUInt32LE(4, 76); hd.write(four, 80, 'latin1');
  return Buffer.concat([Buffer.from('DDS ', 'latin1'), hd, data || Buffer.alloc(0)]);
}
const blk = c => { const b = Buffer.alloc(8); b.writeUInt16LE(c, 0); return b; };   // a DXT1 block of one colour (index 0 everywhere)
const RED = 0xf800, BLUE = 0x001f;
// 8x8: mip 0 = 4 blocks (red, blue / red, red), mip 1 = 4x4 one blue block
const DDS = dds(8, 8, 2, 'DXT1', Buffer.concat([blk(RED), blk(BLUE), blk(RED), blk(RED), blk(BLUE)]));
function tga(w, h, f) {   // 32-bit, top row first
  const hd = Buffer.alloc(18); hd[2] = 2; hd.writeUInt16LE(w, 12); hd.writeUInt16LE(h, 14); hd[16] = 32; hd[17] = 8 | 32;
  const px = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a] = f(x, y), o = (y * w + x) * 4; px[o] = b; px[o + 1] = g; px[o + 2] = r; px[o + 3] = a; }
  return Buffer.concat([hd, px]);
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 3, 0, 0, 0, 2, 8, 2, 0, 0, 0, 1, 2, 3, 4]), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82])]);

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine'), res = path.join(mod, 'resource');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(res, 'texture', 'a.dds'), DDS);
wr(path.join(res, 'texture', 'a.tga'), tga(4, 2, (x, y) => [x * 60, y * 200, 9, x === 3 ? 0 : 255]));
wr(path.join(res, 'texture', 'd.ebm'), '{bitmap\r\n\t{Filtering 1}\r\n\t{Frame "a.dds"}\r\n\t{Frame "a.dds" 50}\r\n}\r\n');
wr(path.join(res, 'texture', 'lost.ebm'), '{bitmap {Frame "nothere.dds"}}\r\n');
wr(path.join(res, 'texture', 'dx.dds'), dds(4, 4, 1, 'DX10', Buffer.alloc(40)));
wr(path.join(res, 'texture', 'odd.dds'), dds(4, 4, 1, 'ATI1', Buffer.alloc(16)));
wr(path.join(res, 'interface', 'p.png'), PNG);
wr(path.join(res, 'entity', 'tank', 'tank.mdl'), '{Skeleton}\r\n');
wr(path.join(res, 'entity', 'tank', 'skin.tga'), tga(3, 3, () => [1, 2, 3, 255]));
wr(path.join(mod, 'resource.pak'), require('../../../../lib/zipwrite').zip([['texture/inpak.tga', tga(2, 2, () => [200, 100, 50, 255]), true]]));

const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const PS = require('./picture.server'), PL = require('./picture.lang'), PC = require('./picture.client'), FS = require('../server');
const U = (route, q) => { const u = new URL('http://x' + route); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return u; };
const info = q => PS.routes['GET /api/x/view/picture/info'](U('/api/x/view/picture/info', Object.assign({ mod }, q)), null, ctx);
const image = q => PS.routes['GET /api/x/view/picture/image'](U('/api/x/view/picture/image', Object.assign({ mod }, q)), null, ctx);
const pix = (j, x, y) => Array.from(Buffer.from(j.rgba, 'base64').subarray((y * j.width + x) * 4, (y * j.width + x) * 4 + 4));

(async () => {
  // ---- the kind's files
  ok(PS.exts.includes('dds') && PS.exts.includes('tga') && !PS.exts.includes('ebm') && !PS.exts.includes('tex'), 'server: claims the pictures, not the text descriptions');
  ok(PS.remote.length === 2 && PS.remote.every(r => PS.routes[r] && r.startsWith('GET /api/x/view/picture/')), 'server: info and image are open to a phone');
  ok(PL.every(r => r.length === 5 && r[0].startsWith('view.picture.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.picture.* in en, ru, uk, zh');
  const keys = new Set(PL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...PC.script.matchAll(/tx\('([a-z0-9.\-]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(PC.script), 'client: page-safe, every tx key exists ' + miss.join());
  const MSG = require('../../../../lib/model/picture').MSG, noWord = Object.keys(MSG).filter(k => !keys.has('view.picture.n.' + k));
  ok(!noWord.length, 'strings: every verdict is worded ' + noWord.join());

  // ---- info
  let o = await info({ rel: 'resource/texture/a.dds' });
  ok(o.ok && o.format === 'DXT1' && o.width === 8 && o.mips === 2 && o.mipSizes[1][0] === 4 && o.alpha === '1-bit' && o.game.ok, 'info: a DXT1 dds, mips, alpha ' + JSON.stringify(o).slice(0, 200));
  ok(o.notes.some(x => x.code === 'shadow' && /a\.tga/.test(x.msg) && x.level === 'warn'), 'info: the .tga of the same name wins: said ' + JSON.stringify(o.notes));
  o = await info({ key: 'resource/texture/a.tga' });
  ok(o.format === 'TGA 32-bit' && o.notes.some(x => x.code === 'wins'), 'info: the key form; the .tga wins over the .dds');
  o = await info({ rel: 'resource/texture/dx.dds' });
  ok(!o.game.ok && o.notes.some(x => x.code === 'dx10' && x.level === 'bad'), 'info: DX10 cannot be loaded by the game');
  o = await info({ rel: 'resource/entity/tank/skin.tga' });
  ok(o.mdl === 'resource/entity/tank/tank.mdl' && o.notes.some(x => x.code === 'npot'), 'info: a model in the same folder; 3x3 not a power of two');
  o = await info({ rel: 'resource/texture/d.ebm' });
  ok(o.frame === 'resource/texture/a.dds' && o.format === 'DXT1' && o.notes.some(x => x.code === 'frame') && o.notes.some(x => x.code === 'frames' && x.p.n === 2), 'info: a .ebm shows its frame');
  o = await info({ rel: 'resource/texture/lost.ebm' });
  ok(!o.game.ok && o.notes.some(x => x.code === 'noframe' && x.level === 'bad'), 'info: a frame that is not there');
  await rejects(() => info({ rel: 'mod.info' }), 415, 'info: not a picture -> 415');
  await rejects(() => info({ rel: 'resource/texture/none.dds' }), 404, 'info: no file -> 404');

  // ---- image
  let j = await image({ rel: 'resource/texture/a.dds' });
  ok(j.width === 8 && j.height === 8 && j.mip === 0 && !j.scaled && Buffer.from(j.rgba, 'base64').length === 8 * 8 * 4, 'image: 8x8 RGBA');
  ok(JSON.stringify(pix(j, 0, 0)) === '[255,0,0,255]' && JSON.stringify(pix(j, 5, 1)) === '[0,0,255,255]' && JSON.stringify(pix(j, 6, 6)) === '[255,0,0,255]', 'image: blocks in place');
  j = await image({ rel: 'resource/texture/a.dds', mip: '1' });
  ok(j.width === 4 && j.mip === 1 && JSON.stringify(pix(j, 3, 3)) === '[0,0,255,255]', 'image: mip 1');
  j = await image({ rel: 'resource/texture/a.dds', max: '4' });
  ok(j.width === 8 && !j.scaled, 'image: max is at least 16, so 8x8 is sent whole (' + j.width + ')');
  j = await image({ rel: 'resource/texture/a.tga' });
  ok(j.format === 'TGA 32-bit' && j.hasAlpha && JSON.stringify(pix(j, 1, 1)) === '[60,200,9,255]' && pix(j, 3, 0)[3] === 0, 'image: a tga, alpha used');
  j = await image({ rel: 'resource.pak:\x3atexture/inpak.tga' });
  ok(j.width === 2 && JSON.stringify(pix(j, 1, 1)) === '[200,100,50,255]', 'image: a tga inside a pak of the mod');
  j = await image({ rel: 'resource/texture/d.ebm' });
  ok(j.frame === 'resource/texture/a.dds' && j.width === 8, 'image: a .ebm shows its frame');
  j = await image({ rel: 'resource/interface/p.png' });
  ok(j.pass === 'image/png' && Buffer.from(j.b64, 'base64').equals(PNG) && j.width === 3, 'image: a png is passed through');
  await rejects(() => image({ rel: 'resource/texture/odd.dds' }), 422, 'image: a format not read -> 422');
  await rejects(() => image({ rel: 'resource/texture/lost.ebm' }), 404, 'image: a frame not there -> 404');
  await rejects(() => image({ rel: 'resource/texture/a.dds', mip: '-1' }), 400, 'image: a bad mip -> 400');

  // ---- the page script in a fake DOM, the api answered by the real routes
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [], opened = [], puts = [];
  const mkEl = doc.createElement;
  doc.createElement = t => { const e = mkEl(t); if (String(t).toLowerCase() === 'canvas') { e.width = 0; e.height = 0;
    e.getContext = () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: id => puts.push(id), drawImage() {}, getImageData() { return { width: 1, height: 1, data: new Uint8ClampedArray(4) }; } }); }
    return e; };
  doc.removeEventListener = (tp, f) => { const a = doc.listeners[tp] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
  const box = { document: doc, console, Promise, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1'), innerWidth: 1400 };
  box.window = box;
  const L = {}; for (const r of require('../lang').concat(PL)) L[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, p) => { let s = L[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return s; };
  const calls = [];
  const api = u => { calls.push(u); const url = new URL('http://x' + u), route = 'GET ' + url.pathname, f = PS.routes[route] || FS.routes[route];
    if (!f) return Promise.reject(new Error('unknown ' + u));
    return Promise.resolve().then(() => f(url, null, ctx)); };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  vm.createContext(box);
  vm.runInContext(require('../client').script(require('../client').css + '\n' + PC.css) + '\n' + PC.script, box, { filename: 'picture-script' });
  const V = box.VIEW, flush = async () => { for (let i = 0; i < 12; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  V.reg('model', { where: 'tab', exts: ['mdl'], open() { return {}; } });
  V.open = (ref, name, opt) => { opened.push([ref, name, opt]); return true; };
  ok(V.kindOf('x.dds') === 'picture' && V.kindOf('a/b.TGA') === 'picture' && V.kindOf('x.ebm') === null, 'page: .dds and .tga open as pictures, .ebm stays text');

  const host = doc.createElement('div'); doc.body.appendChild(host);
  let hd = V.mount(host, { rel: 'resource/texture/a.dds' }, 'a.dds', { kind: 'picture' });
  await flush();
  const t0 = host.textContent;
  ok(host.querySelector('.vw-head') && /DXT1/.test(t0) && /8 x 8/.test(t0) && /1-bit/.test(t0) && /loads it/.test(t0), 'page: the card says format, size, alpha, the game: ' + t0.slice(0, 300));
  ok(/loads a\.tga instead/.test(host.querySelector('.vw-pic-notes').textContent) && host.querySelector('.vw-pic-n-warn'), 'page: the verdict is shown, as a warning');
  const mipSel = host.querySelectorAll('select')[2];
  ok(mipSel && mipSel.children.length === 2 && mipSel.children[1].textContent === '1: 4 x 4' && !mipSel.parentNode.hidden, 'page: the mip picker lists 2 levels');
  const cv = host.querySelector('canvas');
  ok(cv.width === 8 && cv.height === 8 && puts.length >= 1 && puts[puts.length - 1].data[0] === 255 && puts[puts.length - 1].data[4 * 5 + 2] === 255, 'page: the canvas holds the pixels');
  ok(/scale\(/.test(cv.style.transform) && cv.style.imageRendering === 'pixelated' && /Zoom 6000 %|Zoom 60 %/.test(host.querySelector('.vw-pic-zl').textContent), 'page: fit zooms the 8x8 picture up, sharp pixels: ' + host.querySelector('.vw-pic-zl').textContent);
  const btn = t => host.querySelectorAll('button').find(b => b.textContent === t);
  btn('100 %').click(); ok(/Zoom 100 %/.test(host.querySelector('.vw-pic-zl').textContent) && /translate\(316px,236px\) scale\(1\)/.test(cv.style.transform), 'page: 100 % centres it: ' + cv.style.transform);
  btn('+').click(); ok(/Zoom 125 %/.test(host.querySelector('.vw-pic-zl').textContent), 'page: + zooms in');
  const stage = host.querySelector('.vw-pic-stage');
  btn('100 %').click();
  stage.fire('mousemove', { clientX: 316 + 5.5, clientY: 236 + 1.5 });
  ok(/x 5, y 1 +R 0 +G 0 +B 255 +A 255/.test(host.querySelector('.vw-pic-rd').textContent), 'page: the pixel under the mouse: ' + host.querySelector('.vw-pic-rd').textContent);
  stage.fire('mousemove', { clientX: 5, clientY: 5 }); ok(/Point at the picture/.test(host.querySelector('.vw-pic-rd').textContent), 'page: off the picture');
  stage.fire('wheel', { deltaY: -100, clientX: 320, clientY: 240 }); ok(/Zoom 125 %/.test(host.querySelector('.vw-pic-zl').textContent), 'page: the wheel zooms');
  stage.fire('mousedown', { button: 0, clientX: 100, clientY: 100 }); doc.fire('mousemove', { clientX: 130, clientY: 90 }); doc.fire('mouseup', {});
  ok(/translate\(\d+px,\d+px\)/.test(cv.style.transform) && (cv.style.transform.match(/translate\((\d+)px,(\d+)px/) || [])[1] !== '316', 'page: drag moves it: ' + cv.style.transform);
  const chSel = host.querySelectorAll('select')[1]; chSel.value = 'a'; chSel.fire('change');
  ok(puts[puts.length - 1].data[0] === 255 && puts[puts.length - 1].data[1] === 255, 'page: alpha only shows the alpha as grey');
  chSel.value = 'b'; chSel.fire('change'); ok(puts[puts.length - 1].data[0] === 0 && puts[puts.length - 1].data[4 * 5] === 255, 'page: blue only');
  const bgSel = host.querySelectorAll('select')[0]; bgSel.value = 'black'; bgSel.fire('change'); ok(/vw-pic-bg-black/.test(stage.className), 'page: the background switch');
  mipSel.value = '1'; mipSel.fire('change'); await flush();
  ok(cv.width === 4 && calls.some(u => /mip=1/.test(u)) && /mipmap 1/.test(host.textContent), 'page: mip 1 asked and shown');
  btn('Show bytes').click(); ok(opened.some(x => x[2] && x[2].kind === 'hex' && x[0].rel === 'resource/texture/a.dds'), 'page: Show bytes opens the hex kind');
  ok(btn('Open the model').hidden, 'page: no model button without a model next to it');
  hd.close(); ok(!host.children.length && cv.width === 0 && !(doc.listeners.mousemove || []).length, 'page: close frees the canvas and the listeners');

  // a texture beside a model; a picture that cannot be shown; a .ebm opened as a picture
  const h2 = doc.createElement('div'); doc.body.appendChild(h2);
  hd = V.mount(h2, { key: 'resource/entity/tank/skin.tga' }, 'skin.tga'); await flush();
  const mb = h2.querySelectorAll('button').find(b => b.textContent === 'Open the model');
  ok(mb && !mb.hidden, 'page: Open the model shows beside a .mdl');
  mb.click(); ok(opened.some(x => x[2] && x[2].kind === 'model' && x[0].key === 'resource/entity/tank/tank.mdl'), 'page: it opens the model kind on the .mdl key');
  hd.close();
  const h3 = doc.createElement('div'); doc.body.appendChild(h3);
  hd = V.mount(h3, { rel: 'resource/texture/odd.dds' }, 'odd.dds'); await flush();
  ok(/cannot be shown/.test(h3.textContent) && /ATI1/.test(h3.textContent) && h3.querySelector('.vw-head'), 'page: a format not read says so, the card stays');
  hd.close();
  const h4 = doc.createElement('div'); doc.body.appendChild(h4);
  hd = V.mount(h4, { rel: 'resource/texture/d.ebm' }, 'd.ebm', { kind: 'picture' }); await flush();
  const fb = h4.querySelectorAll('button').find(b => b.textContent === 'Open the frame');
  ok(fb && !fb.hidden && /describes a picture/.test(h4.textContent) && h4.querySelector('canvas').width === 8, 'page: a .ebm opened as a picture shows its frame');
  fb.click(); ok(opened.some(x => x[2] && x[2].kind === 'picture' && x[0].key === 'resource/texture/a.dds'), 'page: Open the frame');
  hd.close();

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind picture ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
