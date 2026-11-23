// view kind font test. Arg: scratch dir. Synthetic BMFonts built here: a good one (glyphs 'A' and '?', one kerning pair A-A, a 4x4
// TGA page, its .font) and a bad one (version 2, common block 16 bytes, no '?', an id above U+FFFF, channel 15, no page picture).
// Checks: the parse (blocks, info, common, pages, chars, kerning), the engine notes, the .font facts, the page lookup (the engine's
// extension order), the TGA decode (plain and RLE, bottom-up), the PNG writer, the page route, the kind's files; then the page in a fake
// DOM: facts, the typed line's width with kerning, the missing-glyph report, the glyph filter. Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-0c3113ca)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'fntk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const B = require('../../../../lib/bmfont');

// ---- builders
function blk(t, d) { const b = Buffer.alloc(5 + d.length); b[0] = t; b.writeInt32LE(d.length, 1); d.copy(b, 5); return b; }
function bmf(o) {
  o = Object.assign({ ver: 3, commonSize: 15, chars: [[65, 0, 0, 2, 3, 0, 1, 3, 0, 1], [63, 2, 0, 2, 3, 0, 1, 2, 0, 1]], kern: [[65, 65, -1]], pages: ['f_0.tga'] }, o);
  const name = Buffer.from('Test\0', 'latin1'), info = Buffer.alloc(14 + name.length);
  info.writeInt16LE(12, 0); info[2] = 0x80 | 0x10; info.writeUInt16LE(100, 4); info[6] = 1; name.copy(info, 14);
  const common = Buffer.alloc(o.commonSize); common.writeUInt16LE(5, 0); common.writeUInt16LE(4, 2); common.writeUInt16LE(4, 4); common.writeUInt16LE(4, 6); common.writeUInt16LE(o.pages.length, 8);
  const pages = Buffer.from(o.pages.join('\0') + '\0', 'latin1');
  const ch = Buffer.alloc(20 * o.chars.length);
  o.chars.forEach((c, i) => { const q = i * 20; ch.writeUInt32LE(c[0], q); ch.writeUInt16LE(c[1], q + 4); ch.writeUInt16LE(c[2], q + 6); ch.writeUInt16LE(c[3], q + 8); ch.writeUInt16LE(c[4], q + 10); ch.writeInt16LE(c[5], q + 12); ch.writeInt16LE(c[6], q + 14); ch.writeInt16LE(c[7], q + 16); ch[q + 18] = c[8]; ch[q + 19] = c[9]; });
  const parts = [Buffer.from([0x42, 0x4d, 0x46, o.ver]), blk(1, info), blk(2, common), blk(3, pages), blk(4, ch)];
  if (o.kern.length) { const k = Buffer.alloc(10 * o.kern.length); o.kern.forEach((x, i) => { k.writeUInt32LE(x[0], i * 10); k.writeUInt32LE(x[1], i * 10 + 4); k.writeInt16LE(x[2], i * 10 + 8); }); parts.push(blk(5, k)); }
  return Buffer.concat(parts);
}
function tga32(w, h, px, rle) {   // px(x, y) -> [r,g,b,a]; bottom-up rows (the TGA default)
  const hd = Buffer.alloc(18); hd[2] = rle ? 10 : 2; hd.writeUInt16LE(w, 12); hd.writeUInt16LE(h, 14); hd[16] = 32; hd[17] = 8;
  const rows = [];
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) { const c = px(x, y); rows.push(Buffer.from([c[2], c[1], c[0], c[3]])); }
  if (!rle) return Buffer.concat([hd].concat(rows));
  const out = [hd]; rows.forEach(r => { out.push(Buffer.from([0x80])); out.push(r); });   // every pixel a run of 1
  return Buffer.concat(out);
}
const PX = (x, y) => [x * 60, y * 60, 200, x < 2 ? 255 : 128];

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const D = 'resource/interface/font/';
wr(path.join(mod, D + 'f.fnt'), bmf());
wr(path.join(mod, D + 'f.font'), '{font_atlas\r\n\t{name "tst"}\r\n\t{size 12}\r\n\t{height 5}\r\n\t{style 0}\r\n\t{binary_data "f.fnt"}\r\n}\r\n');
wr(path.join(mod, D + 'f_0.tga'), tga32(4, 4, PX, true));
wr(path.join(mod, D + 'f_0.dds'), 'DDS ');   // the .tga is later in the engine's list: it wins
wr(path.join(mod, D + 'g.fnt'), bmf({ ver: 2, commonSize: 16, chars: [[65, 0, 0, 2, 3, 0, 1, 3, 0, 15], [0x1F600, 0, 0, 1, 1, 0, 0, 1, 0, 1]], kern: [], pages: ['g_0.tga'] }));
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const KS = require('./font.server'), KL = require('./font.lang'), KC = require('./font.client'), FS = require('../server');
const route = (p, q) => { const u = new URL('http://x' + p + (q ? '?' + q : '')); const f = KS.routes['GET ' + p] || FS.routes['GET ' + p]; return f(u, null, ctx); };
const q = rel => 'mod=' + encodeURIComponent(mod) + '&rel=' + encodeURIComponent(rel);

(async () => {
  // ---- lib
  const p = B.parse(bmf());
  ok(p.sig === 'BMF' && p.version === 3 && p.blocks.map(b => b.type).join() === '1,2,3,4,5' && p.info.name === 'Test' && p.info.fontSize === 12 && p.info.bold && p.info.smooth && !p.info.italic, 'parse: blocks and info (BMFont bits counted from the top)');
  ok(p.common.lineHeight === 5 && p.common.base === 4 && p.common.pages === 1 && p.pages.join() === 'f_0.tga' && p.chars.length === 2 && p.chars[0][0] === 65 && p.chars[0][7] === 3 && p.kerning.length === 1 && p.kerning[0][2] === -1 && !p.notes.length, 'parse: common, pages, chars, kerning; no notes ' + JSON.stringify(p.notes));
  const g = B.parse(fs.readFileSync(path.join(mod, D + 'g.fnt'))), gc = g.notes.map(x => x.code);
  ok(['version', 'common', 'noQuestion', 'bigId', 'channel'].every(c => gc.includes(c)) && g.notes.every(x => x.src.startsWith(B.SRC + ':') && /:\d+$/.test(x.src)), 'parse: seeded defects noted with source lines: ' + gc.join());
  const ff = B.fontFacts('{font_atlas\r\n\t{name "arial_hq"}\r\n\t{size 10}\r\n\t{height 17}\r\n\t{style 0}\r\n\t{binary_data "arial_hq_10.fnt"}\r\n}');
  ok(ff.type === 'font_atlas' && ff.name === 'arial_hq' && ff.size === 10 && ff.height === 17 && ff.style === 0 && ff.binary === 'arial_hq_10.fnt', 'fontFacts: the .font fields');
  const pk = B.pickPage('a_0', ['x/a_0.dds', 'x/a_0.tga', 'x/a_0.png', 'x/a_01.tga']), pk2 = B.pickPage('a_0', ['a_0.png', 'a_0.ebm', 'a_0.tex']);
  ok(pk.use === 'x/a_0.png' && pk.kind === 'image' && pk.all.length === 3 && pk2.use === 'a_0.tex' && pk2.kind === 'bitmap' && B.pickPage('z', ['a.tga']).use === null, 'pickPage: the engine order (later image wins, a bitmap description first)');
  const t1 = B.tga(tga32(4, 4, PX, false)), t2 = B.tga(tga32(4, 4, PX, true));
  ok(t1.w === 4 && t1.rgba.equals(t2.rgba) && t1.rgba[0] === 0 && t1.rgba[4] === 60 && t1.rgba[(1 * 4 + 0) * 4 + 1] === 60 && t1.rgba[3] === 255 && t1.rgba[(0 * 4 + 3) * 4 + 3] === 128, 'tga: plain and RLE agree, rows top-down, alpha kept');
  const pn = B.png(t1.rgba, 4, 4);
  ok(pn.readUInt32BE(0) === 0x89504e47 && pn.readUInt32BE(16) === 4 && zlib.inflateSync(pn.subarray(41, 41 + pn.readUInt32BE(33))).length === 4 * 17, 'png: header, size, scanlines');

  // ---- routes
  ok(KS.exts.join() === 'fnt' && KS.remote.length === 2 && KS.remote.every(r => KS.routes[r]), 'server: .fnt, two read-only routes open to a phone');
  ok(KL.every(r => r.length === 5 && r[0].startsWith('view.font.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.font.* in en, ru, uk, zh');
  const keys = new Set(KL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...KC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k) && !/\.$/.test(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(KC.script), 'client: page-safe, every tx key exists ' + miss.join());
  const codes = [...fs.readFileSync(require.resolve('../../../../lib/bmfont'), 'utf8').matchAll(/note\('([a-zA-Z]+)'/g)].map(m => m[1]).concat(['noTexture', 'otherBinary']);
  ok(codes.every(c => keys.has('view.font.n.' + c)), 'every note code has a string: ' + codes.filter(c => !keys.has('view.font.n.' + c)).join());
  const fi = await route('/api/x/view/font/info', q(D + 'f.fnt'));
  ok(fi.font && fi.font.name === 'tst' && fi.font.size === 12 && fi.font.file === 'f.font' && fi.pageFiles.length === 1 && fi.pageFiles[0].file === 'resource/interface/font/f_0.tga' && fi.pageFiles[0].all.length === 2, 'info: the .font facts, page 0 = the .tga (it beats the .dds)');
  const gi = await route('/api/x/view/font/info', q(D + 'g.fnt'));
  ok(!gi.font && gi.notes.some(x => x.code === 'noTexture') && !gi.pageFiles[0].ref, 'info: no .font, no page picture');
  const pg = await route('/api/x/view/font/page', q(D + 'f.fnt') + '&i=0');
  ok(pg.drawn && pg.w === 4 && pg.h === 4 && Buffer.from(pg.png, 'base64').readUInt32BE(0) === 0x89504e47, 'page: the TGA as a PNG');
  const pk3 = await route('/api/x/view/font/page', 'mod=' + encodeURIComponent(mod) + '&key=' + encodeURIComponent('interface/font/f.fnt') + '&i=0');
  ok(pk3.drawn && pk3.file === 'resource/interface/font/f_0.tga', 'page: by key, through the game\'s layered view');
  const pf = await route('/api/x/view/font/page', 'path=' + encodeURIComponent(path.join(mod, D + 'f.fnt')) + '&i=0');
  ok(pf.drawn, 'page: by path');

  // ---- the page in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [];
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
  box.window = box;
  const LS = {}; for (const r of require('../lang').concat(KL)) LS[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, pp) => { let s = LS[k] || k; if (pp) s = s.replace(/\{(\w+)\}/g, (m, x) => (pp[x] == null ? m : String(pp[x]))); return s; };
  const api = u => { const i = u.indexOf('?'); return route(u.slice(0, i), u.slice(i + 1)).then(j => JSON.parse(JSON.stringify(j))); };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  box.LS = { get: (k, d) => d, set() {} }; // searchKit history store stub; the real kit runs below (blockcheck kitSrc)
  vm.createContext(box);
  vm.runInContext(require('../../../test/blockcheck').kitSrc(), box, { filename: 'searchKit' });
  vm.runInContext(require('../client').script(require('../client').css + '\n' + KC.css) + '\n' + KC.script, box, { filename: 'font-script' });
  const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  ok(box.VIEW.kindOf('resource/interface/font/arial_hq_10.fnt') === 'font' && box.VIEW.kindOf('a.font') === null, 'page: .fnt is the font kind, .font stays text');
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const hd = box.VIEW.mount(host, { mod, rel: D + 'f.fnt' }, 'f.fnt', { kind: 'font' });
  await flush();
  const t = host.textContent;
  ok(/Test  12 px  bold/.test(t) && /line height 5, baseline 4, atlas 4 x 4, 1 page/.test(t) && /2 characters, 1 kerning pairs/.test(t) && /name tst, size 12, height 5, style 0, binary_data f\.fnt/.test(t), 'page: facts and the .font facts');
  ok(/the game loads resource\/interface\/font\/f_0\.tga/.test(t) && /picture 4 x 4/.test(t), 'page: the page picture the game loads');
  const tin = host.querySelector('input.vw-fn-in'), tcv = host.querySelector('canvas.vw-fn-tc'), tmsg = host.querySelector('.vw-fn-msg');
  tin.value = 'AA'; tin.fire('input');
  ok(tcv.getAttribute('data-w') === '5' && /Every character/.test(tmsg.textContent), 'type: "AA" = 3 + 3 - 1 (kerning) = 5 px');
  tin.value = 'AЖ?'; tin.fire('input');
  ok(tcv.getAttribute('data-w') === '7' && /1 character\(s\) are not in this font/.test(tmsg.textContent) && /Ж U\+0416/.test(tmsg.textContent), 'type: a missing Cyrillic letter drawn as "?" and reported');
  const rows = () => host.querySelectorAll('tbody')[0].children.length;
  ok(rows() === 2, 'table: both glyphs');
  ok(host.querySelectorAll('span.sk').some(x => x.getAttribute('data-sk') === 'view.font.filter') && !!host.querySelector('button.sk-hist'), 'table: the glyph filter has the search kit (list, history)');
  const fin = host.querySelectorAll('input.vw-fn-in')[1]; fin.value = 'U+003F'; fin.fire('input');
  ok(rows() === 1 && /63/.test(host.querySelectorAll('tbody')[0].textContent), 'table: the filter by U+ code');
  fin.value = 'A'; fin.fire('input'); ok(rows() === 1, 'table: the filter by character');
  { // Browse: the folder picker on the game's font pictures; a picked atlas page shows that page's glyphs
    let pk = null; box.searchKit.picker = (spec, done) => { pk = spec; done('interface/font/f_0.tga', { view: 'data', path: 'interface/font/f_0.tga', key: 'resource/interface/font/f_0.tga' }); };
    host.querySelector('button.sk-browse').click(); await flush();
    ok(pk && pk.mode === 'file' && pk.view === 'data' && pk.start === 'interface/font' && (pk.exts || []).indexOf('tga') >= 0, 'browse: the data view at interface/font ' + JSON.stringify(pk));
    ok(fin.value === 'f_0' && rows() === 2, 'browse: a picked page picture shows its glyphs (' + fin.value + ', ' + rows() + ')'); }
  hd.close(); ok(!host.children.length, 'close');
  const h2 = doc.createElement('div'); doc.body.appendChild(h2);
  box.VIEW.mount(h2, { mod, rel: D + 'g.fnt' }, 'g.fnt', { kind: 'font' }); await flush();
  ok(/Version 2/.test(h2.textContent) && /No "\?" glyph/.test(h2.textContent) && /no picture named g_0/.test(h2.textContent) && /No \.font of the same name/.test(h2.textContent) && !/\.cpp\b/.test(h2.textContent), 'page bad font: the notes, no source lines, no picture, no .font');

  // ---- optional sweep of the game's fonts
  const G = process.env.AS2_SWEEP_GAME;
  if (G && fs.existsSync(G)) {
    const pak = require('../../../../lib/pak'), pf2 = path.join(G, 'resource', 'interface.pak'), L = pak.list(pf2);
    let k = 0, f = 0, tg = 0, tf = 0;
    for (const e of L.filter(x => /\.fnt$/i.test(x.name))) {
      k++; let o;
      try { o = B.parse(pak.read(L, e)); } catch (x) { f++; console.log('sweep fail ' + e.name + ' ' + x.message); continue; }
      const lost = o.pages.filter(pp => !B.pickPage(pp.replace(/\.[^.]+$/, ''), L.map(x => x.name.split('/').pop())).use);
      console.log('sweep ' + e.name + ' ' + o.info.name + ' ' + o.chars.length + ' glyphs ' + o.kerning.length + ' kern pages ' + o.pages.join('|') + (lost.length ? ' LOST ' + lost.join() : '') + ' notes ' + o.notes.map(x => x.code).join(','));
      for (const pp of o.pages) { const te = L.find(x => x.name === 'interface/font/' + pp); if (!te) continue; tg++; try { B.tga(pak.read(L, te)); } catch (x) { tf++; console.log('sweep tga fail ' + pp + ' ' + x.message); } }
    }
    console.log('sweep: ' + k + ' fnt, ' + f + ' failed; ' + tg + ' page tga, ' + tf + ' failed to decode');
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind font ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
