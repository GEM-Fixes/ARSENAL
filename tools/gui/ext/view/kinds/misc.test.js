// view kind misc test. Arg: scratch dir. Synthetic archives built here (tools/lib/zipwrite): a mod pak (files, a folder entry, a
// zip64 archive packed inside it), a mod 1.pat, a mod .zip, and a game pak beside a loose file that shadows one of its entries.
// Checks: the list (counts, totals, methods, folder rows), the nested listing through readRange (zip64 too), the ref of an entry
// (rel form in the mod, path form in the game, shadowed, .zip, nested), the kind's files; then the page in a fake DOM: facts, rows,
// filter, sort, a click that calls VIEW.open, a click that says why not. Optional sweep: AS2_SWEEP_GAME=<game folder>. Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-6c2c8a43)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'mik-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const Z = require('../../../../lib/zipwrite'), pak = require('../../../../lib/pak');

const T = { date: (45 << 9) | (6 << 5) | 15, time: (13 << 11) | (37 << 5) };   // 2025-06-15 13:37
const inner = Z.zip([['x.txt', Buffer.from('hello'), false], ['deep/y.txt', Buffer.alloc(3000, 65), true]], { zip64: true, date: T });
const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(mod, 'resource', 'gamelogic.pak'), Z.zip([['set/', Buffer.alloc(0), false], ['set/a.set', Buffer.from('{a}\r\n'), false], ['set/big.set', Buffer.alloc(5000, 32), true], ['inner.zip', inner, true]], { date: T }));
wr(path.join(mod, '1.pat'), Z.zip([['set/p.set', Buffer.from('{p}\r\n'), false]], { date: T }));
wr(path.join(mod, 'stuff.zip'), Z.zip([['x.txt', Buffer.from('x'), false]], { date: T }));
wr(path.join(game, 'resource', 'vanilla.pak'), Z.zip([['set/b.set', Buffer.from('{b}\r\n'), false], ['units/c.set', Buffer.from('{c}\r\n'), false]], { date: T }));
wr(path.join(game, 'resource', 'units', 'c.set'), '{loose}\r\n');
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const KS = require('./misc.server'), KL = require('./misc.lang'), KC = require('./misc.client'), FS = require('../server'), R = require('../ref');
const route = (p, q) => { const u = new URL('http://x' + p + (q ? '?' + q : '')); const f = KS.routes['GET ' + p] || FS.routes['GET ' + p]; return f(u, null, ctx); };
const q = rel => 'mod=' + encodeURIComponent(mod) + '&rel=' + encodeURIComponent(rel);
const qp = f => 'mod=' + encodeURIComponent(mod) + '&path=' + encodeURIComponent(f);
const code = async p => { try { await p; return 0; } catch (e) { return e.status || 500; } };

(async () => {
  // ---- server
  ok(KS.exts.join() === 'pak,pat,zip' && KS.remote.length === 2 && KS.remote.every(r => KS.routes[r]), 'server: pak/pat/zip, two read-only routes open to a phone');
  ok(KL.every(r => r.length === 5 && r[0].startsWith('view.misc.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.misc.* in en, ru, uk, zh');
  const keys = new Set(KL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...KC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k) && !/\.$/.test(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(KC.script) && ['nested', 'zip', 'shadow', 'none', 'dir'].every(w => keys.has('view.misc.why.' + w)), 'client: page-safe, every tx key and every why exists ' + miss.join());
  const L = await route('/api/x/view/misc/list', q('resource/gamelogic.pak'));
  ok(L.count === 4 && L.files === 3 && L.dirs === 1 && L.total === 5 + 5000 + inner.length && L.methods[0] === 1 && L.methods[8] === 2 && L.open === 'ask' && !L.nested && !L.cut, 'list: counts, totals, methods ' + JSON.stringify(L.methods));
  ok(L.entries.length === 4 && L.entries[1][0] === 'set/a.set' && L.entries[1][1] === 5 && L.entries[2][2] < 5000 && L.entries[1][4] === ((T.date << 16) | T.time) >>> 0, 'list: rows name, size, packed, time');
  const N = await route('/api/x/view/misc/list', q('resource/gamelogic.pak:\x3ainner.zip'));
  ok(N.nested && N.open === null && N.why === 'nested' && N.count === 2 && N.zip64 && N.entries[1][0] === 'deep/y.txt' && N.entries[1][1] === 3000, 'list nested: through readRange, zip64');
  const cd = await KS.cdList(async (o, l) => inner.subarray(o, o + l), inner.length), pl = pak.list(path.join(mod, 'resource', 'gamelogic.pak'));
  ok(cd.length === 2 && cd[1].csize < 3000 && cd.zip64 && pl.length === 4, 'cdList agrees with the zip64 records');
  ok(await code(route('/api/x/view/misc/list', q('mod.info'))) === 415, 'list: not an archive = 415');
  const P = await route('/api/x/view/misc/list', qp(path.join(game, 'resource', 'vanilla.pak')));
  ok(P.count === 2 && P.open === 'ask', 'list: a game pak by path');

  // ---- refs
  const r1 = await route('/api/x/view/misc/ref', q('resource/gamelogic.pak') + '&entry=set/a.set');
  ok(r1.ref && r1.ref.rel === 'resource/gamelogic.pak:\x3aset/a.set' && R.resolve(ctx, r1.ref).entry === 'set/a.set', 'ref: a mod pak entry = the rel form');
  const r2 = await route('/api/x/view/misc/ref', q('1.pat') + '&entry=set/p.set');
  ok(r2.ref && r2.ref.rel === '1.pat:\x3aset/p.set', 'ref: a mod .pat entry');
  const r3 = await route('/api/x/view/misc/ref', qp(path.join(game, 'resource', 'vanilla.pak')) + '&entry=set/b.set');
  const t3 = r3.ref && R.resolve(ctx, r3.ref);
  ok(r3.ref && r3.ref.path && t3.entry === 'set/b.set' && /vanilla\.pak$/.test(t3.file), 'ref: a game pak entry = the path form, resolved back to that pak');
  const r4 = await route('/api/x/view/misc/ref', qp(path.join(game, 'resource', 'vanilla.pak')) + '&entry=units/c.set');
  const t4 = r4.ref && R.resolve(ctx, r4.ref);
  ok(r4.ref && r4.ref.key === 'resource/units/c.set' && r4.ref.idx != null && /vanilla\.pak$/.test(t4.file) && t4.entry === 'units/c.set', 'ref: a loose file shadows the entry: the key form names the layer of the pak');
  const r4b = await route('/api/x/view/misc/ref', 'path=' + encodeURIComponent(path.join(game, 'resource', 'vanilla.pak')) + '&entry=units/c.set');
  ok(!r4b.ref && r4b.why === 'shadow', 'ref: shadowed and no mod for the layered view = why shadow');
  const r5 = await route('/api/x/view/misc/ref', q('stuff.zip') + '&entry=x.txt');
  ok(!r5.ref && r5.why === 'zip', 'ref: a .zip entry cannot be opened by name');
  const r6 = await route('/api/x/view/misc/ref', q('resource/gamelogic.pak:\x3ainner.zip') + '&entry=x.txt');
  ok(!r6.ref && r6.why === 'nested', 'ref: nested');
  const r7 = await route('/api/x/view/misc/ref', q('resource/gamelogic.pak') + '&entry=set/');
  ok(!r7.ref && r7.why === 'dir' && await code(route('/api/x/view/misc/ref', q('resource/gamelogic.pak') + '&entry=nope')) === 404, 'ref: a folder, a missing entry = 404');

  // ---- the page in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [];
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
  box.window = box;
  const LS = {}; for (const r of require('../lang').concat(KL)) LS[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, pp) => { let s = LS[k] || k; if (pp) s = s.replace(/\{(\w+)\}/g, (m, x) => (pp[x] == null ? m : String(pp[x]))); return s; };
  const api = u => { const i = u.indexOf('?'); return route(u.slice(0, i), u.slice(i + 1)).then(j => JSON.parse(JSON.stringify(j)), e => { throw Object.assign(new Error(e.message), { text: e.message }); }); };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  box.LS = { get: (k, d) => d, set() {} }; // searchKit history store stub; the real kit runs below (blockcheck kitSrc)
  vm.createContext(box);
  vm.runInContext(require('../../../test/blockcheck').kitSrc(), box, { filename: 'searchKit' });
  vm.runInContext(require('../client').script(require('../client').css + '\n' + KC.css) + '\n' + KC.script, box, { filename: 'misc-script' });
  const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  ok(box.VIEW.kindOf('resource/gamelogic.pak') === 'misc' && box.VIEW.kindOf('1.pat') === 'misc' && box.VIEW.kindOf('a.zip') === 'misc', 'page: pak/pat/zip are the misc kind');
  const opened = []; box.VIEW.open = (ref, name) => { opened.push([ref, name]); };
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const hd = box.VIEW.mount(host, { mod, rel: 'resource/gamelogic.pak' }, 'gamelogic.pak', { kind: 'misc' });
  await flush();
  const t = host.textContent, rows = () => host.querySelectorAll('tbody')[0].children;
  ok(/4 \(3 files, 1 folders\)/.test(t) && /stored 1/.test(t) && /deflate 2/.test(t) && /Click a file to open it/.test(t) && /2025-06-15 13:37/.test(t), 'page: facts, methods, time');
  ok(rows().length === 4 && /4 entries/.test(host.querySelector('span.vw-mi-cnt').textContent), 'page: every row, the count');
  ok(host.querySelectorAll('span.sk').some(x => x.getAttribute('data-sk') === 'view.misc.filter') && !!host.querySelector('button.sk-browse'), 'page: the filter box has the search kit (browse, history)');
  const fin = host.querySelector('input.vw-mi-in'); fin.value = 'SET/'; fin.fire('input');
  ok(rows().length === 3, 'page: the filter ignores case');
  { // Browse: the game's data view; a picked file's game path filters the archive to that entry
    let pk = null; box.searchKit.picker = (spec, done) => { pk = spec; done('set/a.set', { view: 'data', path: 'set/a.set', key: 'resource/set/a.set' }); };
    host.querySelector('button.sk-browse').click(); await flush();
    ok(pk && pk.mode === 'file' && pk.view === 'data' && pk.start === '' && fin.value === 'set/a.set' && rows().length === 1, 'page: Browse picks a game file and filters to it ' + JSON.stringify(pk)); }
  fin.value = ''; fin.fire('input');
  host.querySelectorAll('th')[1].fire('click');
  ok(rows()[0].textContent.indexOf('set/big.set') === 0, 'page: sort by size, biggest first');
  const go = host.querySelectorAll('tr.vw-mi-go');
  ok(go.length === 3, 'page: files can be clicked, the folder cannot');
  go.filter(x => x.textContent.indexOf('set/a.set') === 0)[0].fire('click'); await flush();
  ok(opened.length === 1 && opened[0][0].rel === 'resource/gamelogic.pak:\x3aset/a.set' && opened[0][1] === 'a.set', 'page: a click opens the entry through VIEW.open');
  hd.close(); ok(!host.children.length, 'close');
  const h2 = doc.createElement('div'); doc.body.appendChild(h2);
  box.VIEW.mount(h2, { mod, rel: 'stuff.zip' }, 'stuff.zip', { kind: 'misc' }); await flush();
  h2.querySelectorAll('tr.vw-mi-go')[0].fire('click'); await flush();
  ok(/does not read \.zip/.test(h2.querySelector('div.vw-mi-msg').textContent) && opened.length === 1, 'page: a .zip entry says why it cannot open');
  const h3 = doc.createElement('div'); doc.body.appendChild(h3);
  box.VIEW.mount(h3, { mod, rel: 'resource/gamelogic.pak:\x3ainner.zip' }, 'inner.zip', { kind: 'misc' }); for (let i = 0; i < 20 && !/inside a pak/.test(h3.textContent); i++) { await flush(); await new Promise(r => setTimeout(r, 20)); }
  ok(/inside a pak/.test(h3.textContent) && !h3.querySelectorAll('tr.vw-mi-go').length && /zip64/.test(h3.textContent), 'page nested: listed, not clickable, zip64 shown');

  // ---- optional sweep of the game's paks (the list only, plus a few refs)
  const G = process.env.AS2_SWEEP_GAME;
  if (G && fs.existsSync(G)) {
    const dir = path.join(G, 'resource'), gctx = Object.assign({}, ctx, { game: () => G }), gm = fs.readdirSync(path.join(G, 'mods')).map(x => path.join(G, 'mods', x)).find(x => fs.existsSync(path.join(x, 'mod.info')));
    let k = 0, ents = 0, refOk = 0, refTry = 0; const why = {};
    for (const f of fs.readdirSync(dir).filter(x => /\.(pak|pat)$/i.test(x))) {
      const u = new URL('http://x/?' + (gm ? 'mod=' + encodeURIComponent(gm) + '&' : '') + 'path=' + encodeURIComponent(path.join(dir, f)));
      let o; try { o = await KS.routes['GET /api/x/view/misc/list'](u, null, gctx); } catch (e) { console.log('sweep fail ' + f + ' ' + e.message); continue; }
      k++; ents += o.count;
      for (const e of o.entries.filter(x => !x[0].endsWith('/')).filter((x, i, a) => i % Math.max(1, Math.floor(a.length / 5)) === 0).slice(0, 5)) {
        refTry++;
        const v = new URL(u.href + '&entry=' + encodeURIComponent(e[0]));
        try { const r = await KS.routes['GET /api/x/view/misc/ref'](v, null, gctx); if (r.ref) refOk++; else why[r.why] = (why[r.why] || 0) + 1; } catch (x) { why.err = (why.err || 0) + 1; }
      }
      console.log('sweep ' + f + ' ' + o.count + ' entries, ' + o.files + ' files, ' + (o.total / 1048576).toFixed(1) + ' MB, methods ' + JSON.stringify(o.methods) + (o.zip64 ? ' zip64' : ''));
    }
    console.log('sweep: ' + k + ' paks, ' + ents + ' entries; refs ' + refOk + ' of ' + refTry + ' open, not: ' + JSON.stringify(why));
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind misc ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
