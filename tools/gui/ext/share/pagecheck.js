// Share page in the fake DOM (tools/gui/test/fakedom.js), whole page.js with a fetch that answers /api/x/share/* from the real routes on a
// fixture game: every section built and its later parts drawn (after the server replies, after clicks) sits in blocks by the rules of
// tools/gui/test/blockcheck.js (checkScreen); a profile is applied after a section is drawn again; the uploader's
// install asks first and Cancel sends nothing. No server, no game, nothing written outside the scratch dir. Called by test.js.
// Author: Imperator_Aug (ARSENAL, ia-b825e344)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = path.join(__dirname, '..', '..');
const fakedom = require(path.join(G, 'test', 'fakedom')), contract = require(path.join(G, 'contract')), html = require(path.join(G, 'page.js'));
const L = require('./lang').en, routes = require('./routes').routes;
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));
if (!fakedom.El.prototype.remove) fakedom.El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };   // browsers have it; the fake DOM not

// ---- the structure rules: the shared tools/gui/test/blockcheck.js
const { checkScreen } = require(path.join(G, 'test', 'blockcheck'));
const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const isBox = e => isB(e) && e.classList.contains('blc');

module.exports = async function run(work, ok) {
  // fixture game: the conflicts fixture (mods ma, mb) plus two mods of our own and the files the uploader status looks for
  const game = path.join(work, 'game');
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(G, '..', 'conflicts', 'test', 'fixture', 'game'), game, { recursive: true });
  fs.writeFileSync(path.join(game, 'as64.exe'), 'x'); fs.writeFileSync(path.join(game, 'steam_api64.dll'), 'the game dll');
  const mk = (f, n) => { const d = path.join(game, 'mods', f); fs.mkdirSync(path.join(d, 'resource', 'set'), { recursive: true });
    fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{Name "' + n + '"}\r\n\t{Desc "d"}\r\n\t{Version "1.0"}\r\n\t{FileId "777"}\r\n}\r\n'); fs.writeFileSync(path.join(d, 'resource', 'set', 'a.set'), '{x 1}\r\n'); fs.writeFileSync(path.join(d, 'UPGRADE.md'), 'n'); return d; };
  const md = mk('mine', 'Mine'), md2 = mk('mine2', 'Mine Two');
  const cp = require('child_process');
  const ctx = {
    gamedir: game, tools: path.join(G, '..'), tmpRoot: path.join(work, 'tmp'), allowLaunch: false, game: () => game,
    runTool: async (tool, entry, args) => {
      if (tool === 'modinfo') return { code: 1, stdout: args[0] + '/mod.info: WARN_DESC_SHORT the description is short\n', stderr: '' };
      if (tool === 'check') { const j = args.indexOf('--json'); if (j >= 0) fs.writeFileSync(args[j + 1], JSON.stringify({ target: 'as64', overall: { target: 'as64', verdict: 'crash', crash: 2, text: 'x' }, plain: ['x', 'Can crash the game: one.', 'Can crash the game: two.'] })); return { code: 0, stdout: 'VERDICT as64: LOADS_STATIC\n', stderr: '' }; }
      const r = cp.spawnSync(process.execPath, [path.join(G, '..', entry)].concat(args), { encoding: 'utf8', timeout: 90000 }); return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!r.error };
    },
  };
  fs.mkdirSync(ctx.tmpRoot, { recursive: true });
  // a profile for the share screen: in Ready to share, the main card after the mod line, its intro hidden; a block of About moved into it
  const layout = { v: 1, active: 'P', profiles: { P: { screens: { share: { o: { gate: ['gate.main', 'gate.mod', 'about.credit'] }, hid: ['gate.main.intro'] } } } } };
  const server = { 'as2gui.layout': layout, 'as2gui.modByPage': { share: md }, 'as2gui.share.sec': 'about' }, sent = [], confirms = [];
  const resp = (o, st) => Promise.resolve({ ok: !st, status: st || 200, json: () => Promise.resolve(clone(o)), body: null });
  const doc = fakedom.make();
  const P = {
    document: doc, console, TextDecoder, URL, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: () => null, setItem: () => {} }, answer: false, confirm: m => { confirms.push(m); return P.answer; },
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', p = String(u).split('?')[0];
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings' && m === 'GET') return resp({ settings: server, empty: false, file: '' });
      if (p === '/api/settings') { Object.assign(server, JSON.parse(o.body).set); return resp({ ok: true }); }
      if (p === '/api/game') return resp({ dir: game, tried: [], ok: true, codes: [] });
      const fn = routes[m + ' ' + p];
      if (!fn) return new Promise(() => {});   // other screens: their calls stay pending
      const body = o && o.body ? JSON.parse(o.body) : null; sent.push({ k: m + ' ' + p, body });
      return Promise.resolve().then(() => fn(m === 'GET' ? new URL('http://x' + u) : null, body, ctx)).then(j => resp(j), e => resp({ error: e.message }, 400));
    },
  };
  P.window = P; vm.createContext(P);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], P, { filename: 'page.js:script' });
  for (let i = 0; i < 400 && !P.__as2gui; i++) await tick();
  ok(!!P.__as2gui, 'page built');
  const S = P.__as2gui, sec = doc.getElementById('main').children.find(s => s.dataset.id === 'share');
  P.as2Link('page:share'); S.mod = S.mod || md;
  const settle = async (cond, n) => { for (let i = 0; i < (n || 300); i++) { await tick(); if (cond && cond()) return true; } return !cond; };
  const B = id => sec.all().find(e => isB(e) && e.dataset.blk === id);
  const btn = (box, key) => box.all().find(e => e.tagName === 'BUTTON' && e.textContent === L['share.' + key]);
  const check = what => { P.as2Blocks.apply(sec); const pr = checkScreen(sec); ok(!pr.length, 'blocks: ' + what + (pr.length ? '\n  ' + pr.slice(0, 12).join('\n  ') : '')); };
  const tab = async id => { btn(B('tabs'), 't.' + id).click(); await settle(() => B(id)); };
  const panes = () => sec.children.filter(e => isB(e) && ['about', 'gate', 'pack', 'ws', 'ver', 'play', 'tog', 'upd', 'perm'].includes(e.dataset.blk));

  ok(['title', 'intro', 'tabs', 'about'].every(k => B(k) && B(k).parentNode === sec) && isBox(B('about')), 'title, intro, tabs and the About section are blocks of the screen');
  await settle(() => B('about.info'));
  ok(B('about.info') && B('about.credit') && B('about.pic') && !B('about.st'), 'About: drawn after the server reply, the waiting line gone');
  btn(B('about.info'), 'about.preview').click(); B('about.info.name').all().find(e => e.tagName === 'INPUT').value = 'Mine';
  await settle(() => B('about.info.out').textContent);
  check('About after Preview');

  await tab('gate');
  ok(panes().filter(p => !p.hidden).map(p => p.dataset.blk).join() === 'gate', 'one section shown at a time (the others hidden, kept)');
  btn(B('gate.main'), 'gate.run').click();
  await settle(() => B('gate.main.res').all().some(e => e.tagName === 'TABLE'));
  ok(B('gate.main.res').all().some(e => e.tagName === 'TABLE') && B('gate.main.res').all().some(e => e.tagName === 'DETAILS'), 'Ready to share: the result table with its Details fold sits in one leaf');
  await settle(() => B('gate.mod'));
  const gk = B('gate').children.filter(isB).map(b => b.dataset.blk);
  ok(gk.indexOf('gate.main') < gk.indexOf('gate.mod') && B('gate.main.intro').classList.contains('blkoff') && B('about.credit').parentNode === B('gate'), 'profile applied to blocks drawn later (order, hidden, moved in from another section)', gk.join());
  check('Ready to share after Check');

  await tab('pack');
  btn(B('pack.main'), 'pack.plan').click();
  await settle(() => B('pack.main.res').textContent);
  check('Package after Plan');

  await tab('ws');
  // the uploader program (third_party/workshop_gui) is left out of the public copy on purpose: there the page says so, no install button
  if (!require('../../../workshop/workshop').packageDir().dir) {
    await settle(() => B('ws.up') && B('ws.up').textContent.includes(L['share.up.nopack']) && B('ws.make.res').textContent);
    ok(B('ws.up').textContent.includes(L['share.up.nopack']) && !btn(B('ws.up'), 'up.install'), 'uploader without the program: the page says the files are missing, no install button');
    console.log('skip uploader install confirm on the page: the uploader program is not in this copy (left out of the public copy on purpose)');
  } else {
  await settle(() => B('ws.up.btns') && btn(B('ws.up'), 'up.install') && B('ws.make.res').textContent);
  const nPost = sent.length, nAsk = confirms.length;
  btn(B('ws.up'), 'up.install').click(); await settle(null, 20);
  ok(confirms.length === nAsk + 1 && confirms[nAsk].includes(L['share.up.install']) && sent.length === nPost && !fs.existsSync(path.join(game, 'workshop_gui.exe')), 'uploader install asks first; Cancel sends nothing and writes nothing');
  }
  check('Workshop with the uploader status');

  await tab('ver');
  btn(B('ver.main'), 'ver.show').click();
  await settle(() => B('ver.main.res').textContent);
  check('New version after Show');
  // search boxes (searchKit): the out folder (Package, Workshop), the uploader's game folder, the previous version, the credited mod
  const kits = sec.all().filter(e => e.dataset && e.dataset.sk).map(e => e.dataset.sk);
  ok(['share.out', 'share.upGame', 'share.verPrev', 'share.creditMod'].every(k => kits.includes(k)) && kits.filter(k => k === 'share.out').length === 2
    && !btn(B('ver.main'), 'choose') && B('ver.main.prev').all().some(e => e.dataset && e.dataset.sk === 'share.verPrev'), 'search boxes: out, upGame, verPrev, creditMod kits, no old Choose button', kits.join());
  // Browse = the folder picker (seeded: the spec a Browse click sends, what a pick puts in the box)
  { const PK = [], was = P.searchKit.picker; P.searchKit.picker = (spec, done) => PK.push({ spec, done });
    const kitOf = k => sec.all().find(e => e.dataset && e.dataset.sk === k), inOf = k => kitOf(k).all().find(e => e.tagName === 'INPUT');
    const browse = k => { kitOf(k).all().find(e => e.classList && e.classList.contains('sk-browse')).click(); return PK.pop(); };
    const vp = browse('share.verPrev');
    ok(vp && vp.spec.mode === 'dir' && vp.spec.view === 'disk' && vp.spec.start === S.mod, 'verPrev Browse: the folder picker on the disk at the mod ' + JSON.stringify(vp && vp.spec));
    vp.done(md2, { view: 'disk', path: md2 });
    ok(inOf('share.verPrev').value === md2, 'verPrev Browse pick puts the folder in the box');
    const cm = browse('share.creditMod');
    ok(cm && cm.spec.mode === 'dir' && /[\\/]mods$/.test(cm.spec.start) && cm.spec.start.indexOf(path.basename(game)) >= 0, 'creditMod Browse: the game mods folder ' + JSON.stringify(cm && cm.spec));
    cm.done(md2, { view: 'disk', path: md2 }); for (let i = 0; i < 5; i++) await tick();
    ok(inOf('share.creditMod').value === 'Mine Two', 'creditMod Browse pick gives the mod name from its mod.info ' + inOf('share.creditMod').value);
    const so = browse('share.out');
    ok(so && so.spec.mode === 'dir' && so.spec.out === true, 'out Browse: a folder to write to ' + JSON.stringify(so && so.spec));
    inOf('share.verPrev').value = ''; inOf('share.creditMod').value = ''; P.searchKit.picker = was; }

  await tab('play');
  await settle(() => B('play.main.list').all().some(e => e.tagName === 'INPUT'));
  btn(B('play.main'), 'play.make').click();
  await settle(() => B('play.main.res').all().some(e => e.tagName === 'TEXTAREA'));
  check('Play together after Make');

  // mb without {Require "ma"}: two mods side by side, so the fixture's clashes are clashes (with it mb is a patch mod over ma)
  // both with the Classic range: the fixture game holds as64.exe, and AS64 does not load a mod without a range that fits (VFS-48)
  for (const m of ['ma', 'mb']) fs.writeFileSync(path.join(game, 'mods', m, 'mod.info'), '{mod\r\n {Name "' + m + '"}\r\n {MinGameVersion "3.262.0"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n');
  await tab('tog');
  await settle(() => B('tog.main.list').all().some(e => e.tagName === 'INPUT'));
  for (const r of B('tog.main.list').all().filter(e => e.tagName === 'DIV' && e.classList.contains('row') && e.children[1] && /^m[ab]$/.test(e.children[1].textContent))) { const cb = r.children[0]; cb.checked = true; cb.fire('change'); }
  btn(B('tog.main'), 'tog.run').click();
  await settle(() => B('tog.main.res').textContent);
  ok(B('tog.main.res').textContent.length > 0, 'Mods together answers (' + (B('tog.main.res').textContent || B('tog.main').textContent).slice(0, 60) + ')');
  check('Mods together after Check');
  {   // guided fix: groups with counts, a way out per clash, progress, then Preview, Write into a new folder and the check again with it
    const res = B('tog.main.res'), at = (e, k) => e.getAttribute && e.getAttribute(k);
    const items = () => res.all().filter(e => at(e, 'data-clash')), kinds = res.all().filter(e => at(e, 'data-kind')).map(e => at(e, 'data-kind'));
    const lbl = (k, p) => L['share.' + k].replace(/\{(\w+)\}/g, (m, n) => (p && n in p ? p[n] : m));
    ok(kinds.join() === 'lost,value,file,order' && items().length === 5 && items().every(e => e.all().some(b => b.tagName === 'BUTTON' && b.textContent === L['share.tog.b.leave'])), 'Mods together: clashes grouped by kind, most harmful first, each with its ways out (' + kinds + ')');
    const prog = () => (res.all().find(e => at(e, 'data-prog')) || {}).textContent;
    ok(prog() === lbl('tog.prog', { n: 0, m: 5 }), 'Mods together: progress line (' + prog() + ')');
    btn(B('tog.fix'), 'tog.fix.preview').click();
    ok(B('tog.fix.stat').textContent === L['share.tog.fix.none'], 'patch mod: Preview with nothing picked says so');
    let n = 0; for (const e of items()) { const b = e.all().find(x => x.tagName === 'BUTTON' && (x.textContent === L['share.tog.b.both'] || x.textContent === lbl('tog.b.take', { m: 'ma' }))); if (b) { b.click(); n++; } else btn(e, 'tog.b.leave').click(); }
    ok(n === 4 && prog() === lbl('tog.prog', { n: 5, m: 5 }) && items().every(e => at(e, 'data-done')), 'Mods together: every clash handled (' + prog() + ')');
    const wr = btn(B('tog.fix'), 'tog.fix.write'), out = B('tog.fix.out').all().find(e => e.tagName === 'INPUT'), po = path.join(work, 'pagepatch');
    btn(B('tog.fix'), 'tog.fix.preview').click();
    ok(B('tog.fix.stat').textContent === L['share.tog.fix.needOut'] && wr.disabled, 'patch mod: no folder named says so, Write is off before a Preview');
    out.value = po; btn(B('tog.fix'), 'tog.fix.preview').click();
    await settle(() => B('tog.fix.res').textContent);
    ok(B('tog.fix.res').all().some(e => at(e, 'data-plan') === 'plan') && !fs.existsSync(po) && !wr.disabled && sent.slice(-1)[0].k === 'POST /api/x/share/clashfix' && !sent.slice(-1)[0].body.write, 'patch mod: Preview lists the files, writes nothing, turns Write on');
    wr.click(); await settle(() => B('tog.fix.res').all().some(e => at(e, 'data-plan') === 'wrote'));
    ok(fs.existsSync(path.join(po, 'mod.info')) && B('tog.fix.res').all().some(e => at(e, 'data-move')), 'patch mod: Write makes the new folder and says to move it into the mods folder');
    check('Mods together after the patch mod write');
    btn(B('tog.fix'), 'tog.fix.again').click();
    await settle(() => res.all().some(e => at(e, 'data-patch')));
    ok(res.all().some(e => at(e, 'data-patch')) && items().length === 1 && sent.slice(-1)[0].body.patch === po, 'Mods together: the check again with the patch mod shows what is left (' + items().length + ' of 5)');
    const last = items()[0].all().find(b => b.tagName === 'BUTTON' && b.textContent === L['share.tog.b.leave']);
    ok(!!last && res.all().some(e => at(e, 'data-hand')), 'Mods together: what a patch cannot mend says what to do by hand');
  }

  await tab('upd');
  btn(B('upd.main'), 'upd.run').click();
  await settle(() => B('upd.main.stat').textContent);
  check('Game updated after Check');
  await tab('perm');
  check('Before you share');
  ok(panes().length === 9 && panes().filter(p => !p.hidden).length === 1, 'all nine sections are containers, one shown');

  // another mod: the section shown is built again in the same place; the profile goes on
  S.mod = md2; S.screens.share.refresh();
  await tab('gate'); await settle(() => B('gate.mod') && /Mine Two/.test(B('gate.mod').textContent));
  const ids = sec.all().filter(isB).map(b => b.dataset.blk);
  ok(ids.filter(k => k === 'gate.main').length === 1 && ids.filter(k => k === 'about.credit').length === 1 && B('gate.main.intro').classList.contains('blkoff'), 'section drawn again: no doubled ids, profile kept');
  check('Ready to share for another mod');
  // Arrange (started from the Settings page for this page): bars on the blocks of the shown section; Esc ends it
  doc.getElementById('arrpage').value = 'share'; doc.getElementById('arrgo').click();
  ok(B('gate.main.run').children.some(k => k.classList && k.classList.contains('blkbar')), 'Arrange: a bar on the run button block');
  doc.key('Escape');
  ok(!sec.all().some(e => e.classList && e.classList.contains('blkbar')), 'Arrange off: bars gone');
};
