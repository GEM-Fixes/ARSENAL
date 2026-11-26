// docs ext test. Arg: scratch dir. Builds a small docs tree there; no game, no network. Runs the routes and the page script (fake DOM).
// Author: Imperator_Aug (ARSENAL, ia-8a1f3817)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'docsx-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const root = path.join(work, 'root'), outside = path.join(work, 'outside'), empty = path.join(work, 'empty');
const put = (rel, text, base) => { const p = path.join(base || root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const BT = String.fromCharCode(96), F3 = BT + BT + BT;

put('README.md', '# Fixture docs\nstart page\n');
put('guide/01-getting-started.md', ['# Getting started', '', 'See [chapter two](02-next.md), ' + BT + 'limits/VFS.md' + BT + ' and VFS-02. UTF-8 is not a limit.', 'Web: [site](https://example.org/x) and [top](#getting-started). Dead: [gone](missing-page.md).', '',
  F3, 'code with a | pipe and ' + BT + 'tick' + BT, F3, '', '| name | where |', '|---|---|', '| mount | modweb/vfs/mount.md:3 |', '', '- bullet → vfs/mount', '1. numbered **bold** item', 'home: ' + os.homedir()].join('\r\n'));
put('guide/02-next.md', '# Next chapter\nsecond page, back to [the start page](../tools/START-HERE.md)\n');
put('guide/CHANGELOG.md', '# changes\nquokkaline history\n'); put('guide/PLAN.md', '# plan\nquokkaline plan\n'); put('guide/i18n/ru/01-x.md', '# ru\n');
put('tools/START-HERE.md', '# START HERE\nrun the toolkit, read [chapter one](../guide/01-getting-started.md) and the [tool index](INDEX.md)\n');
put('modweb/INDEX.md', '# L0 modweb\n## Topics\n  vfs   virtual file system\n');
put('modweb/vfs.md', '# vfs: virtual file system\nblocks: modweb/vfs/<b>.md\nmount  Mount scan, pak = zip\n');
put('modweb/vfs/mount.md', '# mount\n## Mount scan\nthird line: mount scan walks the folder [V]\nlim VFS-19\n');
put('limits/INDEX.md', '# limits\nVFS | file system | VFS-01..19\n');
put('limits/VFS.md', '# VFS limits\nid | subject | limit\nVFS-01 | override model | last wins\nVFS-02 | name case | lowercased\n');
put('limits/VFS2.md', '# VFS limits part 2\nVFS-19 | mod version range | Min/Max\n');
put('codemap/INDEX.md', '# L0 src map\n');
// Gates of Hell notes (game parity): a gohweb set with its own limits rows GH<AREA>-NN
put('gohweb/INDEX.md', '# gohweb\nGHVFS | GoH file system | GHVFS-01..13\n');
// local folders never committed batch scratch, game function index): the set skips them (the list check below)
put('gohweb/stage/x.md', '# stage scratch GHVFS-13\n'); put('gohweb/codemap/y.md', '# codemap GHVFS-13\n');
put('gohweb/limits/GHVFS.md','# GHVFS: GoH file system\nid | subject | limit | effect / workaround \u00b7 base | tag ref\nGHVFS-01 | mod.info tags | new: tag develop | lifts the version check | [V] note:eMod\nGHVFS-13 | GetUserDir | Documents/My Games/Gates of Hell | wombleprobe user dir | [V] note:eGameDirs\n');
put('refmods/INDEX.md', '# real mods\n');
fs.mkdirSync(path.join(root, 'techdoc', 'history'), { recursive: true });   // there but empty: a set is listed only when its folder exists
put('tools/INDEX.md', '# tools\nfront | user tools | gui\n');
put('tools/index/front.md', '# front\ngui | node tools/gui/gui.js | - | the GUI\n');
put('tools/gui/README.md', '# not part of the tool index set\n');
put('plan/now.md', '# now\nstate of work\n');
put('plan/private/secret.md', '# secret\nzorkleberry must never be listed\n');
put('plan/big.md', '# big\n' + 'filler line of text\n'.repeat(40000));
put('leak.md', '# outside\nquibblefrotz is outside the root\n', outside);
let linked = false;
try { fs.symlinkSync(outside, path.join(root, 'guide', 'out'), 'junction'); linked = true; } catch (e) { /* no link support: skip that check */ }
fs.mkdirSync(empty, { recursive: true });

process.env.AS2_DOCS_ROOT = root;
const ext = require('./index');
const R = require('./routes');
const call = (k, q) => ext.routes['GET /api/x/docs/' + k](new URL('http://127.0.0.1/api/x/docs/' + k + '?' + new URLSearchParams(q || {})), null, {});
const st = async p => { try { await p; return 0; } catch (x) { return x.status || -1; } };
// tick: 12 turns, then on until every request the page made has its answer (a list rebuild after TTL reads the disk through the
// thread pool, more than 12 turns on a busy PC), then 12 turns more for the draw. Backup, never a hang: a request with no answer
// after 60 s is left out from then on (WAIT on stderr once)
const INFL = new Map(); let inflN = 0;
const live = () => { let n = 0; for (const r of INFL.values()) { if (Date.now() - r.t < 60000) n++; else if (!r.said) { r.said = true; process.stderr.write('WAIT docs test: ' + r.u + ' has no answer after 60 s; tick goes on without it\n'); } } return n; };
const turns = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
const tick = async () => { await turns(); if (!live()) return; while (live()) await new Promise(r => setTimeout(r, 2)); await turns(); };

(async () => {
  // ---- ext shape, script rules, 4 languages
  ok(ext.id === 'docs' && ext.nav === 'docs.nav' && ext.adv === false && ext.after === 'help', 'ext shape');
  ok(!/\x60|\$\{|innerHTML/.test(ext.script), 'script: no backtick, dollar-brace, innerHTML');
  ok(!/[^\x00-\x7f]/.test(ext.script), 'script is ASCII');
  ok(/EXT_SCREENS\.docs=function\(root\)/.test(ext.script), 'script sets EXT_SCREENS.docs');
  try { new vm.Script('(function(){' + ext.script + '})'); } catch (x) { ok(false, 'script parses: ' + x.message); }
  const L = ext.lang;
  for (const k of Object.keys(L.en)) {
    ok(k.startsWith('docs.'), 'lang key prefix ' + k);
    for (const c of ['ru', 'uk', 'zh']) ok(L[c] && L[c][k] && (L[c][k] !== L.en[k] || !/\s/.test(L.en[k])), 'lang ' + c + ' ' + k);
    for (const c of ['ru', 'uk', 'zh']) ok(JSON.stringify((L.en[k].match(/\{\w+\}/g) || []).sort()) === JSON.stringify(((L[c][k] || '').match(/\{\w+\}/g) || []).sort()), 'placeholders ' + c + ' ' + k);
  }
  const used = [...new Set((ext.script.match(/tx\('docs\.[\w.]+'[,)]/g) || []).map(x => x.replace(/^tx\('|'[,)]$/g, '')))];
  ok(used.length > 20 && used.every(k => L.en[k]), 'every tx key exists: ' + used.filter(k => !L.en[k]).join(','));
  for (const s of R.SETS) ok(L.en['docs.set.' + s.id] && L.en['docs.what.' + s.id], 'set label + description ' + s.id);
  // parts: every set and whole document names one; the shell's third-row label of docs/<part> is docs.view.<part> in four languages
  ok(R.PARTS.join() === 'arsenal,modding,engine,project,history' && R.SETS.every(x => R.PARTS.includes(x.part)) && Object.values(R.WHOLE).every(x => R.PARTS.includes(x.part)), 'parts: every set and whole document has a part');
  ok(R.SETS.map(x => x.id + ':' + x.part).join() === 'here:arsenal,guide:modding,engine:engine,history:history,start:project,modweb:modding,limits:engine,codemap:engine,gohweb:engine,refmods:modding,tools:arsenal,plan:project' &&
    Object.keys(R.WHOLE).map(k => k + ':' + R.WHOLE[k].part).join() === 'atlas:modding,guide:modding,engine:engine', 'parts: the set and whole-document map');
  ok(R.SETS.filter(x => x.part === 'project').every(x => x.notes), 'parts: Project Notes holds maintainer notes only (Advanced)');
  for (const p of R.PARTS) for (const c of ['en', 'ru', 'uk', 'zh']) ok(L[c]['docs.view.' + p], 'part label ' + c + ' ' + p);
  ok(L.en['docs.view.arsenal'] === 'ARSENAL' && L.en['docs.view.modding'] === 'Modding' && L.en['docs.view.engine'] === 'Engine' && L.en['docs.view.project'] === 'Project Notes' && L.en['docs.view.history'] === 'Historical Sources' && L.en['docs.set.here'] === 'About ARSENAL', 'parts: English labels');
  ok(/Tools & Settings > Settings/.test(L.en['docs.notes.off']) && !/top of the window/.test(L.en['docs.notes.off']), 'the Advanced hint names Tools & Settings > Settings');
  for (const k of ['heading', 'limit', 'file']) ok(L.en['docs.kind.' + k], 'kind label ' + k);

  // ---- status
  let s = await call('status');
  ok(s.found && s.edition === 'internal' && s.source === false, 'status found, internal, not a source tree');
  ok(s.sets.map(x => x.id).join() === 'here,guide,history,start,modweb,limits,codemap,gohweb,refmods,tools,plan', 'sets ' + s.sets.map(x => x.id).join());
  ok(s.sets.filter(x => !x.notes).map(x => x.id).join() === 'here,guide,history' && s.sets.filter(x => x.notes).length === 8, 'W6: start page and books are the reader sets, the rest are maintainer notes');
  ok(s.pub.join() === 'tools/START-HERE.md,guide/01-getting-started.md,guide/02-next.md' && s.pubTotal === 3, 'W6: reader files ' + s.pub.join());
  ok(s.areas.join() === 'GHVFS,VFS' && s.total === s.sets.reduce((a, x) => a + x.files, 0), 'areas + total');
  ok(s.sets.every(x => x.part === R.SETS.find(y => y.id === x.id).part), 'status: each set carries its part');

  // ---- list
  let l = await call('list', { set: 'guide' });
  ok(l.files.map(x => x.p).join() === 'guide/01-getting-started.md,guide/02-next.md', 'W6: guide set holds the chapters only, no CHANGELOG, PLAN or translations ' + l.files.map(x => x.p).join());
  ok(!linked || !l.files.some(x => /out\//.test(x.p)), 'linked folder not walked');
  ok((await call('list', { set: 'here' })).files.map(x => x.p).join() === 'tools/START-HERE.md', 'W6: start page set');
  l = await call('list', { set: 'tools' });
  ok(l.files.map(x => x.p).join() === 'tools/INDEX.md,tools/index/front.md', 'tool index set only, the start page not twice ' + l.files.map(x => x.p).join());
  l = await call('list', { set: 'plan' });
  ok(l.files.length === 2 && !l.files.some(x => /private/.test(x.p)), 'plan/private never listed');
  ok((await call('list', { set: 'limits' })).files[0].p === 'limits/INDEX.md', 'INDEX.md first');
  ok((await call('list', { set: 'start' })).files.map(x => x.p).join() === 'README.md', 'start set = root md');
  ok(await st(call('list', { set: 'nope' })) === 400, 'unknown set 400');

  // ---- file + link targets
  let f = await call('file', { p: 'guide/01-getting-started.md' });
  ok(f.found && f.set === 'guide' && f.title === 'Getting started' && !f.truncated && f.line === 0, 'file by path');
  ok(!f.text.includes(os.homedir()) && f.text.includes('%USERPROFILE%'), 'home folder masked');
  f = await call('file', { p: '02-next.md', from: 'guide/01-getting-started.md' });
  ok(f.p === 'guide/02-next.md', 'link next to the file');
  f = await call('file', { p: 'vfs/mount', from: 'guide/01-getting-started.md' });
  ok(f.p === 'modweb/vfs/mount.md', 'block ref topic/block');
  f = await call('file', { p: 'modweb/vfs/mount.md:3', from: 'guide/01-getting-started.md' });
  ok(f.p === 'modweb/vfs/mount.md' && f.line === 3, 'path:line');
  f = await call('file', { p: 'limits/VFS.md', line: '4' });
  ok(f.line === 4, 'line param');
  f = await call('file', { p: 'modweb/vfs.md' });
  ok(JSON.stringify(f.kids) === '{"mount":"modweb/vfs/mount.md"}', 'router kids ' + JSON.stringify(f.kids));
  f = await call('file', { p: 'limits/INDEX.md' });
  ok(f.kids.VFS === 'limits/VFS.md' && f.kids.VFS2 === 'limits/VFS2.md', 'index kids');
  f = await call('file', { p: 'tools/INDEX.md' });
  ok(f.kids.front === 'tools/index/front.md', 'tools index kids');
  f = await call('file', { p: 'plan/big.md' });
  ok(f.truncated && f.text.length <= 600 * 1024, 'large file cut');
  for (const p of ['../outside/leak.md', 'guide/../../outside/leak.md', path.join(outside, 'leak.md'), 'plan/private/secret.md', 'private/secret', 'guide/out/leak.md', 'tools/gui/README.md', 'nope.md', ''])
    ok(await st(call('file', { p, from: 'plan/now.md' })) === 404, 'refused: ' + p);

  // ---- search: the reader's documents by default, the maintainers' notes with notes=1
  let q = await call('search', { q: 'mount scan' });
  ok(q.total === 0 && q.notes === false, 'W6: search covers the books by default, not the notes ' + q.total);
  q = await call('search', { q: 'second page' });
  ok(q.total === 1 && q.rows[0].p === 'guide/02-next.md' && q.files === 3, 'W6: default search finds book text, over the 3 reader files ' + q.files);
  ok((await call('search', { q: 'quokkaline' })).total === 0 && (await call('search', { q: 'quokkaline', notes: '1' })).total === 0, 'W6: guide CHANGELOG and PLAN are not searched');
  q = await call('search', { q: 'mount scan', notes: '1' });
  ok(q.total === 3 && q.rows[0].kind === 'heading' && q.rows[0].p === 'modweb/vfs/mount.md' && q.rows[0].line === 2, 'search: notes too, heading first ' + JSON.stringify(q.rows.map(x => x.kind + ':' + x.p + ':' + x.line)));
  q = await call('search', { q: 'lowercased', notes: '1' });
  ok(q.total === 1 && q.rows[0].kind === 'limit' && q.rows[0].line === 4, 'search: limits row');
  q = await call('search', { q: 'vfs', set: 'limits' });
  ok(q.rows.some(x => x.kind === 'file' && x.p === 'limits/VFS.md') && q.rows.every(x => x.p.startsWith('limits/')), 'search: file name hit, set filter');
  ok((await call('search', { q: 'zorkleberry', notes: '1' })).total === 0, 'search: plan/private never read');
  ok((await call('search', { q: 'quibblefrotz', notes: '1' })).total === 0, 'search: nothing outside the root');
  q = await call('search', { q: 'filler line', notes: '1' });
  ok(q.more && q.rows.length === 200 && q.total > 200, 'search: capped');
  ok(await st(call('search', { q: 'a' })) === 400 && await st(call('search', { q: 'ab', set: 'nope' })) === 400, 'search: bad input 400');

  // ---- limit
  let m = await call('limit', { id: 'vfs-2' });
  ok(m.found && m.id === 'VFS-02' && m.p === 'limits/VFS.md' && m.line === 4, 'limit: short id');
  m = await call('limit', { id: 'VFS-19' });
  ok(m.found && m.p === 'limits/VFS2.md' && m.line === 2, 'limit: part file');
  m = await call('limit', { id: 'VFS-99' });
  ok(!m.found && m.searched.length === 2, 'limit: not there');
  ok(await st(call('limit', { id: 'x' })) === 400, 'limit: bad id 400');
  // Gates of Hell IDs (game parity): GH areas are read, as notes of the Engine part
  m = await call('limit', { id: 'ghvfs-13' });
  ok(m.found && m.id === 'GHVFS-13' && m.p === 'gohweb/limits/GHVFS.md' && m.line === 4, 'limit: GoH id from gohweb/limits ' + JSON.stringify(m));
  m = await call('limit', { id: 'GHVFS-1' });
  ok(m.found && m.id === 'GHVFS-01', 'limit: GoH short id');
  m = await call('limit', { id: 'GHVFS-99' });
  ok(!m.found && m.searched.join() === 'gohweb/limits/GHVFS.md', 'limit: GoH id not there, searched gohweb only');
  q = await call('search', { q: 'wombleprobe', notes: '1' });
  ok(q.total === 1 && q.rows[0].kind === 'limit' && q.rows[0].p === 'gohweb/limits/GHVFS.md', 'search: a GoH limits row is a limit hit in the notes');
  ok((await call('search', { q: 'wombleprobe' })).total === 0, 'search: GoH notes stay out of the default search');
  ok((await call('list', { set: 'gohweb' })).files.map(x => x.p).join() === 'gohweb/INDEX.md,gohweb/limits/GHVFS.md', 'list: gohweb set, INDEX first');
  { const lr = /var LIMRX=(\/[^;]+\/);/.exec(ext.script), sr = /var SETRX=(\/[^;]+\/);/.exec(ext.script);
    ok(lr && vm.runInNewContext(lr[1]).test('GHVFS-13') && vm.runInNewContext(lr[1]).test('GHVIS-140'), 'page: a GoH ID is a limits ID for the search jump');
    ok(sr && vm.runInNewContext(sr[1]).test('gohweb/limits/GHVFS.md:4') && /gohweb\|guide/.test(ext.script.split('var TOK=')[1] || ''), 'page: gohweb paths are document links'); }

  // ---- page script in a fake DOM
  const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));   // path form: tests are not embedded in the exe
  const page = (pre, o) => {
    o = o || {};
    const doc = make(), store = Object.assign({}, pre || {}), toasts = [], themeFns = {}, views = [];
    const box = {
      document: doc, EXT_SCREENS: {}, toasts,
      LS: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
      tx: (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? p[b] : a)),
      toast: t => toasts.push(t),
      // the shell's view hook (page.js viewSet): the page reports a part it changed itself
      viewSet: o.noViewSet ? undefined : (pg, v) => views.push(pg + '/' + v),
      onTheme: (fn, key) => { themeFns[key] = fn; return () => {}; },
      api: (u, body) => { const url = new URL('http://127.0.0.1' + u); const fn = ext.routes[(body === undefined ? 'GET ' : 'POST ') + url.pathname]; if (!fn) return Promise.reject(new Error('no route ' + url.pathname));
        const id = ++inflN, p = Promise.resolve(fn(url, body || null, {})); INFL.set(id, { t: Date.now(), u }); p.then(() => INFL.delete(id), () => INFL.delete(id)); return p; },
      h: (tag, attrs, kids) => {
        const e = doc.createElement(tag);
        for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false || k === 'blk' || k === 'box') continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
        if (attrs && attrs.blk != null) mark(e, attrs.blk, attrs.box);
        (kids || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
        return e;
      },
    };
    // the page's block helpers (page.js blk / asBlk / card), same marks: class blk (+ blc box-<kind>), data-blk, data-blkname
    const mark = (e, id, bx) => { e.setAttribute('data-blk', String(id)); e.classList.add('blk'); if (bx) { e.classList.add('blc'); e.classList.add('box-' + bx); } return e; };
    box.asBlk = (e, id, o) => { o = o || {}; if (o.name) e.setAttribute('data-blkname', o.name); return mark(e, id, o.box); };
    box.blk = (id, kids, o) => { o = o || {}; const e = box.h(o.tag || 'div', Object.assign({}, o.attrs || {}, o.class ? { class: o.class } : {}), kids); return box.asBlk(e, id, o); };
    box.card = (id, kids, o) => { o = o || {}; return box.blk(id, kids, { box: 'col', class: 'card' + (o.class ? ' ' + o.class : ''), attrs: o.attrs, name: o.name }); };
    // the page's real searchKit (page.js) in front of the script, frames drawn at once
    box.requestAnimationFrame = f => f();
    vm.runInNewContext(require(path.join(__dirname, '..', '..', 'test', 'blockcheck')).kitSrc() + '\n' + ext.script, box);
    const rootEl = doc.createElement('section');
    const scr = box.EXT_SCREENS.docs(rootEl);
    // the header's Advanced box, as page.js builds it: a checkbox inside label#advbox whose change reaches the document
    // (now on the Settings page; the fake page may hold none: the docs page needs none, it listens on the document)
    if (o.noAdvbox && doc.getElementById('advbox')) doc.ids.delete('advbox');
    let advBox = doc.getElementById('advbox');
    if (!advBox && !o.noAdvbox) { advBox = doc.createElement('label'); advBox.setAttribute('id', 'advbox'); doc.body.appendChild(advBox); }
    const advIn = doc.createElement('input'); if (advBox) advBox.appendChild(advIn);
    const setAdv = on => { store.adv = on; advIn.checked = on; (doc.listeners.change || []).forEach(f => f({ type: 'change', target: advIn })); };
    return { box, rootEl, scr, store, toasts, setAdv, doc, themeFns, views };
  };
  const opts = sel => all(sel, c => c.tagName === 'OPTION');
  const all = (e, f, o = []) => { for (const c of e.children) { if (f(c)) o.push(c); all(c, f, o); } return o; };
  const tag = (e, t) => all(e, c => c.tagName === t);
  const cls = (e, c0) => all(e, c => c.classList.contains(c0));
  const textShown = e => (e.hidden ? '' : !e.children.length ? e.textContent : e.children.map(textShown).join(''));
  // the reading card of a view (climb to the .card) and its "where you are" line (block read.where)
  const cardOf = v => { let n = v; while (n && !(n.classList && n.classList.contains('card'))) n = n.parentNode; return n; };
  const whereOf = v => all(cardOf(v), c => c.dataset && c.dataset.blk === 'read.where')[0].textContent;
  // blocks, the rules of test-blocks.js checkScreen run on a loaded state: every control and text in a leaf
  // ids well formed and unique, a block sits in a container or the screen, a leaf holds no blocks, a control or heading is never a block
  // (the shared tools/gui/test/blockcheck.js)
  const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
  const blockProbs = sec => BC.checkScreen(sec, 'docs');
  // W6: Advanced off (the default): the start page and the books only; a remembered notes page is not reopened
  const P = page({ 'docs.part': 'project', 'docs.last.project': 'plan/now.md' });
  P.scr.refresh(); await tick();
  const view = cls(P.rootEl, 'doc')[0], selects = tag(P.rootEl, 'SELECT'), inputs = tag(P.rootEl, 'INPUT');
  const buttons = () => tag(P.rootEl, 'BUTTON');
  const crumb = () => whereOf(view);
  ok(!blockProbs(P.rootEl).length, 'blocks: the loaded page keeps every control and text in a leaf block\n  ' + blockProbs(P.rootEl).join('\n  '));
  const notesBox = cls(P.rootEl, 'notesbox')[0], notesLbl = cls(P.rootEl, 'notesearch')[0], notesChk = tag(notesLbl, 'INPUT')[0];
  const setBlk = e => all(e, x => x.dataset && x.dataset.blk === 'list.set')[0];
  ok(view && selects.length === 2 && opts(selects[0]).map(o => o.value).join() === 'guide' && setBlk(P.rootEl).hidden && opts(selects[1]).map(o => o.value).join() === 'all,guide', 'W6 default: Modding holds the guide only, one set = no set select, search scope all or the guide ' + opts(selects[0]).map(o => o.value).join());
  ok(tag(selects[0], 'OPTGROUP').map(g => g.getAttribute('label')).join() === 'Books', 'W6 default: no maintainer notes heading in the list');
  ok(notesBox.hidden && notesLbl.hidden && !/Internal edition/.test(textShown(P.rootEl)) && /Docs folder: .* \(3 files\)/.test(P.rootEl.textContent), 'W6 default: notes heading, notes search box and edition note hidden, 3 files counted');
  ok(crumb() === '' && P.store['docs.last.project'] === 'plan/now.md' && /Pick a document/.test(view.textContent), 'W6 default: the last notes page is not reopened');
  ok(P.scr.viewNow() === 'modding' && P.store['docs.part'] === 'modding' && P.views.join() === 'docs/modding', 'parts: Project Notes left with Advanced off falls back to Modding and tells the shell ' + P.views.join());
  const fileBtn = p => buttons().find(b => b.dataset.p === p);
  ok(fileBtn('guide/01-getting-started.md') && fileBtn('guide/02-next.md') && !buttons().some(b => /CHANGELOG|PLAN/.test(b.dataset.p || '')), 'page: guide chapters listed, nothing else of the folder');
  fileBtn('guide/01-getting-started.md').click(); await tick();
  ok(crumb() === 'guide/01-getting-started.md', 'page: crumb ' + crumb());
  ok(tag(view, 'H2').length === 1 && tag(view, 'H2')[0].textContent === 'Getting started', 'page: heading');
  ok(tag(view, 'PRE').length === 1 && /code with a \| pipe and .tick./.test(tag(view, 'PRE')[0].textContent), 'page: code block kept as is');
  ok(tag(view, 'TH').length === 2 && tag(view, 'TD').length === 2, 'page: table');
  ok(tag(view, 'A').length === 1 && tag(view, 'A')[0].getAttribute('href') === 'https://example.org/x' && tag(view, 'A')[0].getAttribute('target') === '_blank', 'page: web link');
  const links = () => tag(view, 'BUTTON').map(b => b.getAttribute('title'));
  ok(links().join() === '02-next.md,#getting-started', 'W6 default: only links into the books are links ' + links().join());
  ok(['limits/VFS.md', 'VFS-02', 'modweb/vfs/mount.md:3', 'vfs/mount', 'gone'].every(t => view.textContent.includes(t)), 'W6 default: links into the notes stay as plain text');
  ok(!/\*\*/.test(view.textContent) && /numbered bold item/.test(view.textContent), 'page: bold marks dropped');
  ok(P.store['docs.last.modding'] === 'guide/01-getting-started.md' && fileBtn('guide/01-getting-started.md').style.fontWeight === 'bold', 'page: last file kept, marked in the list');
  const backBtn = buttons().find(b => b.textContent === 'Back');
  ok(backBtn.disabled, 'page: Back off at the first page');
  // the start page from a chapter, and back
  fileBtn('guide/02-next.md').click(); await tick();
  tag(view, 'BUTTON').find(b => b.getAttribute('title') === '../tools/START-HERE.md').click(); await tick();
  ok(crumb() === 'tools/START-HERE.md' && selects[0].value === 'here' && links().join() === '../guide/01-getting-started.md', 'W6 default: the start page opens, links back to the guide, the tool index link is text ' + links().join());
  ok(P.scr.viewNow() === 'arsenal' && P.views.join() === 'docs/modding,docs/arsenal' && P.store['docs.last.arsenal'] === 'tools/START-HERE.md' && P.store['docs.last.modding'] === 'guide/02-next.md', 'parts: a link into another part moves the page there and tells the shell ' + P.views.join());
  // search: books only, a limits ID does not jump
  const sq = inputs.find(i => /Search words/.test(i.getAttribute('placeholder') || '')), goBtn = buttons().find(b => b.textContent === 'Search');
  sq.value = 'mount scan'; goBtn.click(); await tick();
  ok(/Nothing found for mount scan/.test(crumb()), 'W6 default: a search does not reach the notes ' + crumb());
  sq.value = 'VFS-02'; goBtn.click(); await tick();
  ok(/1 matches for vfs-02/.test(crumb()) && tag(view, 'BUTTON')[0].textContent === 'guide/01-getting-started.md:3', 'W6 default: a limits ID is searched in the books, not opened ' + crumb());
  // links from other pages into the notes
  P.scr.go('limits/VFS.md'); await tick(); P.scr.limit('VFS-02'); await tick();
  ok(P.toasts.length === 2 && P.toasts.every(t => /maintainer notes/.test(t)) && /matches for vfs-02/.test(crumb()), 'W6 default: a notes link from another page says so and stays ' + P.toasts.join(' / '));
  P.toasts.length = 0;

  // W6: Advanced on from the header: the notes come in under their own heading, links into them work
  P.scr.view('modding'); await tick();
  ok(crumb() === 'guide/02-next.md' && P.views.join() === 'docs/modding,docs/arsenal', 'parts: the shell opens Modding: its last document again, nothing reported back');
  fileBtn('guide/01-getting-started.md').click(); await tick();
  P.setAdv(true); await tick();
  ok(opts(selects[0]).map(o => o.value).join() === 'guide,modweb,refmods' && !setBlk(P.rootEl).hidden && tag(selects[0], 'OPTGROUP').map(g => g.getAttribute('label')).join() === 'Books,Maintainer notes', 'W6 adv: Modding sets, notes under their own heading');
  ok(!notesBox.hidden && /working notes/.test(notesBox.textContent) && !notesLbl.hidden && /Internal edition/.test(textShown(P.rootEl)), 'W6 adv: heading sentence, notes search box, edition note');
  ok(['02-next.md', 'limits/VFS.md', 'VFS-02', 'modweb/vfs/mount.md:3', 'vfs/mount', 'missing-page.md'].every(t => links().includes(t)), 'W6 adv: the open chapter is drawn again with every link ' + links().join());
  // a dead link says so and keeps the page
  tag(view, 'BUTTON').find(b => b.getAttribute('title') === 'missing-page.md').click(); await tick();
  ok(P.toasts.length === 1 && /No document for missing-page.md/.test(P.toasts[0]) && crumb() === 'guide/01-getting-started.md' && tag(view, 'H2').length === 1, 'page: dead link keeps the page ' + P.toasts.join(' / '));
  P.toasts.length = 0;
  tag(view, 'BUTTON').find(b => b.getAttribute('title') === 'modweb/vfs/mount.md:3').click(); await tick();
  ok(crumb().startsWith('modweb/vfs/mount.md') && /line 3/.test(crumb()) && cls(view, 'hit').length === 1 && /third line/.test(cls(view, 'hit')[0].textContent), 'page: path:line link marks the line');
  ok(selects[0].value === 'modweb' && fileBtn('modweb/vfs/mount.md') && !backBtn.disabled, 'page: list follows the set, Back on');
  tag(view, 'BUTTON').find(b => b.getAttribute('title') === 'VFS-19').click(); await tick();
  ok(crumb().startsWith('limits/VFS2.md') && cls(view, 'hit').length === 1 && cls(view, 'lim').length === 1 && tag(cls(view, 'lim')[0], 'B')[0].textContent === 'VFS-19', 'page: limits ID link');
  backBtn.click(); await tick(); backBtn.click(); await tick();
  ok(crumb() === 'guide/01-getting-started.md', 'page: Back twice returns to the chapter');
  selects[0].value = 'modweb'; selects[0].fire('change'); await tick();
  fileBtn('modweb/vfs.md').click(); await tick();
  const kid = tag(view, 'BUTTON').find(b => b.getAttribute('title') === 'modweb/vfs/mount.md');
  ok(kid && kid.textContent === 'mount', 'page: router line links its block');
  // search: books by default, the notes when the box is ticked; a limits ID jumps to its row
  sq.value = 'mount scan'; goBtn.click(); await tick();
  ok(/Nothing found for mount scan/.test(crumb()), 'W6 adv: without the box the search still covers the books only');
  notesChk.checked = true; sq.value = 'mount scan'; goBtn.click(); await tick();
  ok(/3 matches for mount scan/.test(crumb()) && cls(view, 'badge').length >= 1 && tag(view, 'BUTTON')[0].textContent === 'modweb/vfs/mount.md:2', 'W6 adv: with the box ticked the notes are searched ' + crumb());
  tag(view, 'BUTTON')[0].click(); await tick();
  ok(crumb().startsWith('modweb/vfs/mount.md') && cls(view, 'hit').length === 1, 'page: result opens at the line');
  sq.value = 'vfs-2'; sq.fire('keydown', { key: 'Enter' }); await tick();
  ok(crumb().startsWith('limits/VFS.md') && /line 4/.test(crumb()), 'page: limits ID in the search box jumps to the row');
  sq.value = 'VFS-99'; goBtn.click(); await tick();
  ok(/Nothing found|matches for/.test(crumb()), 'page: unknown limits ID falls back to a search');
  sq.value = 'xyzzy-not-there'; goBtn.click(); await tick();
  ok(/Nothing found for xyzzy-not-there/.test(crumb()), 'page: nothing found');
  ok(P.toasts.length === 0, 'page: no error toast ' + P.toasts.join(' / '));
  // game parity: a docs: link from another page (the x-limits GoH row button, as2Link docs:<path>#<line>) opens the GoH row
  P.scr.go('gohweb/limits/GHVFS.md', 4); await tick();
  ok(crumb().startsWith('gohweb/limits/GHVFS.md') && /line 4/.test(crumb()) && cls(view, 'hit').length === 1 && /wombleprobe/.test(cls(view, 'hit')[0].textContent) && P.scr.viewNow() === 'engine' && selects[0].value === 'gohweb' && P.toasts.length === 0, 'page: a docs:gohweb link opens the GoH limits row at its line ' + crumb() + ' / ' + P.toasts.join(' / '));
  // Advanced off again while a notes page is open: the page leaves it, the list is the books again
  P.scr.go('limits/VFS.md'); await tick();
  ok(crumb().startsWith('limits/VFS.md'), 'W6 adv: a notes page is open');
  P.setAdv(false); await tick();
  ok(/Pick a document/.test(view.textContent) && P.scr.viewNow() === 'engine' && opts(selects[0]).length === 0 && setBlk(P.rootEl).hidden && notesBox.hidden && !notesChk.checked, 'W6: Advanced off leaves the notes page; Engine without its document holds no set here ' + selects[0].value);
  P.scr.view('modding'); await tick();
  ok(selects[0].value === 'guide' && opts(selects[0]).length === 1, 'W6: Modding with Advanced off: the guide');
  // the Ctrl+K way: the switch flips without a change event, seen when the page shows again
  P.store.adv = true; P.scr.refresh(); await tick();
  ok(opts(selects[0]).length === 3, 'W6: the switch is read again when the page shows');
  P.store.adv = false; P.scr.refresh(); await tick();

  // ---- parts (the shell's third row, docs/<part>): the sets of each part, Historical Sources alone, the last document per part,
  // links and Back across parts, the view hook, Project Notes and Advanced, the page opened with and without a view
  {
    const Q = page({ adv: true }); Q.scr.refresh(); await tick();
    const qs = tag(Q.rootEl, 'SELECT'), qv = cls(Q.rootEl, 'doc')[0], qc = () => whereOf(qv), qb = () => tag(Q.rootEl, 'BUTTON'), qf = p => qb().find(b => b.dataset.p === p);
    ok(Q.scr.viewNow() === 'modding' && Q.views.join() === 'docs/modding' && /Pick a document/.test(qv.textContent), 'parts: no view given and none used before = Modding, told to the shell');
    const PS = { arsenal: 'here,tools', modding: 'guide,modweb,refmods', engine: 'limits,codemap,gohweb', project: 'start,plan', history: 'history' };
    for (const p of Object.keys(PS)) {
      Q.scr.view(p); await tick();
      ok(Q.scr.viewNow() === p && Q.store['docs.part'] === p && opts(qs[0]).map(o => o.value).join() === PS[p] && setBlk(Q.rootEl).hidden === !/,/.test(PS[p]), 'parts: ' + p + ' lists its own sets ' + opts(qs[0]).map(o => o.value).join());
    }
    ok(Q.views.join() === 'docs/modding', 'parts: a view the shell asked for is not reported back ' + Q.views.join());
    // Historical Sources: the history set, its Source index and the search, nothing else
    ok(tag(Q.rootEl, 'H2')[0].textContent === 'Historical Sources' && /for getting units and weapons right/.test(Q.rootEl.textContent) && cls(Q.rootEl, 'wholebox')[0].hidden && cls(Q.rootEl, 'notesbox')[0].hidden && cls(Q.rootEl, 'notesearch')[0].hidden &&
      !/Internal edition/.test(textShown(Q.rootEl)) && opts(qs[1]).map(o => o.value).join() === 'history' && tag(cls(Q.rootEl, 'scroll')[0], 'BUTTON').map(x => x.textContent).join() === 'Source index', 'parts: Historical Sources shows the history set alone');
    Q.scr.view('modding'); await tick();
    ok(tag(Q.rootEl, 'H2')[0].textContent === 'Engine and modding documentation' && opts(qs[1]).map(o => o.value).join() === 'all,guide,modweb,refmods' && !cls(Q.rootEl, 'notesbox')[0].hidden, 'parts: Modding has its title, search scope all and its sets');
    Q.scr.view('arsenal'); await tick();
    ok(qs[0].value === 'here' && opts(qs[0])[0].textContent === 'About ARSENAL (1)', 'parts: ARSENAL starts with About ARSENAL');
    // the last document per part
    Q.scr.view('engine'); await tick(); qf('limits/VFS.md').click(); await tick();
    Q.scr.view('modding'); await tick(); qf('guide/02-next.md').click(); await tick();
    ok(Q.store['docs.last.engine'] === 'limits/VFS.md' && Q.store['docs.last.modding'] === 'guide/02-next.md' && Q.store['docs.set.engine'] === 'limits', 'parts: the last document is kept per part');
    Q.scr.view('engine'); await tick();
    ok(qc() === 'limits/VFS.md' && qs[0].value === 'limits' && qf('limits/VFS.md').style.fontWeight === 'bold', 'parts: going back to Engine opens its last document ' + qc());
    const qback = qb().find(b => b.textContent === 'Back'); qback.click(); await tick();
    ok(qc() === 'guide/02-next.md' && Q.scr.viewNow() === 'modding' && Q.views[Q.views.length - 1] === 'docs/modding', 'parts: Back returns to the other part and tells the shell ' + Q.views.join());
    // a link into another part (the guide links a limits file): the page moves, the shell is told
    qf('guide/01-getting-started.md').click(); await tick();
    tag(qv, 'BUTTON').find(b => b.getAttribute('title') === 'limits/VFS.md').click(); await tick();
    ok(qc() === 'limits/VFS.md' && Q.scr.viewNow() === 'engine' && Q.views[Q.views.length - 1] === 'docs/engine' && Q.store['docs.part'] === 'engine', 'parts: a link into Engine moves the page and tells the shell');
    // a set chosen in a part is kept for that part
    Q.scr.view('arsenal'); await tick(); qs[0].value = 'tools'; qs[0].fire('change'); await tick();
    ok(Q.store['docs.set.arsenal'] === 'tools' && qf('tools/INDEX.md'), 'parts: the set picked in a part is kept');
    // Project Notes: shown with Advanced; Advanced off there falls back to Modding and its last document
    Q.scr.view('project'); await tick(); qs[0].value = 'plan'; qs[0].fire('change'); await tick(); qf('plan/now.md').click(); await tick();
    ok(qc() === 'plan/now.md' && Q.store['docs.last.project'] === 'plan/now.md', 'parts: a Project Notes page');
    const before = Q.views.length;
    Q.setAdv(false); await tick();
    ok(Q.scr.viewNow() === 'modding' && Q.views.length === before + 1 && Q.views[before] === 'docs/modding' && Q.store['docs.part'] === 'modding' && qc() === Q.store['docs.last.modding'] && qc() === 'guide/01-getting-started.md', 'parts: Advanced off on Project Notes falls back to Modding and its last document ' + qc());
    Q.scr.view('project'); await tick();
    ok(Q.scr.viewNow() === 'modding' && Q.views[Q.views.length - 1] === 'docs/modding' && !opts(qs[0]).some(o => o.value === 'plan'), 'parts: Project Notes is refused with Advanced off, the shell is told Modding');
    // a new start: no view = the last part used, its last document; a view given before the status = that part, nothing reported
    const Q2 = page(Object.assign({}, Q.store, { 'docs.part': 'arsenal' })); Q2.scr.refresh(); await tick();
    ok(Q2.scr.viewNow() === 'arsenal' && whereOf(cls(Q2.rootEl, 'doc')[0]) === '' && Q2.views.join() === 'docs/arsenal', 'parts: a new start opens the last part used (its notes page stays closed with Advanced off) ' + Q2.views.join());
    const Q3 = page(Object.assign({}, Q.store, { adv: true })); Q3.scr.view('engine'); Q3.scr.refresh(); await tick();
    ok(Q3.scr.viewNow() === 'engine' && whereOf(cls(Q3.rootEl, 'doc')[0]) === 'limits/VFS.md' && !Q3.views.length, 'parts: a view given before the status opens that part and its last document');
    // the Source index is remembered as the last document of Historical Sources
    Q3.scr.view('history'); await tick(); tag(Q3.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    Q3.scr.view('modding'); await tick(); Q3.scr.view('history'); await tick();
    ok(Q3.store['docs.last.history'] === '@history/source-index' && cls(cls(Q3.rootEl, 'doc')[0], 'srcidx').length === 1, 'parts: Historical Sources opens its Source index again');
    // a bad view is ignored; no view hook and no Advanced box in the page: still works
    Q3.scr.view('nope'); await tick();
    ok(Q3.scr.viewNow() === 'history', 'parts: an unknown view is ignored');
    const Q4 = page({ adv: true, 'docs.part': 'project' }, { noViewSet: true, noAdvbox: true }); Q4.scr.refresh(); await tick();
    ok(Q4.scr.viewNow() === 'project' && opts(tag(Q4.rootEl, 'SELECT')[0]).map(o => o.value).join() === 'start,plan', 'parts: no view hook, no Advanced box: the page still opens Project Notes');
    Q4.store.adv = false; Q4.scr.refresh(); await tick();
    ok(Q4.scr.viewNow() === 'modding' && Q4.toasts.length === 0, 'parts: without the box the switch is read when the page shows, Project Notes falls back');
    ok(!blockProbs(Q.rootEl).length && Q.toasts.length === 0, 'parts: blocks stay leaves, no error toast ' + Q.toasts.join(' / ') + blockProbs(Q.rootEl).join(' '));
  }

  // ---- no docs: plain answer, the page says where it looked
  process.env.AS2_DOCS_ROOT = empty; R.reset();
  s = await call('status');
  ok(s.found === false && s.tried.length === 1 && s.sets.length === 0, 'absent: status');
  ok((await call('list', { set: 'guide' })).found === false && (await call('file', { p: 'guide/01-getting-started.md' })).found === false && (await call('search', { q: 'mount' })).found === false && (await call('limit', { id: 'VFS-01' })).found === false, 'absent: every route answers found false');
  const P2 = page(); P2.scr.refresh(); await tick();
  ok(/No documentation found/.test(P2.rootEl.textContent) && tag(P2.rootEl, 'BUTTON').some(b => b.textContent === 'Look again') && tag(P2.rootEl, 'LI').length === 1, 'absent: page shows the not-found card');
  process.env.AS2_DOCS_ROOT = root; R.reset();
  tag(P2.rootEl, 'BUTTON').find(b => b.textContent === 'Look again').click(); await tick();
  ok(!/No documentation found/.test(P2.rootEl.textContent) && /Docs folder/.test(P2.rootEl.textContent), 'absent: Look again finds the docs');

  // ---- public edition: no the game, no plan
  const pub = path.join(work, 'pub'); put('guide/01-getting-started.md', '# G\n', pub); put('limits/INDEX.md', '# L\n', pub);
  process.env.AS2_DOCS_ROOT = pub; R.reset();
  s = await call('status');
  ok(s.found && s.edition === 'public' && s.sets.map(x => x.id).join() === 'guide,limits', 'public edition: no codemap, techdoc or history folder, so no such sets and no empty rows');
  process.env.AS2_DOCS_ROOT = root; R.reset();

  // ---- G9 GT-32: Enter searches. The old page answered only to keydown with the key name, in the right box; Enter in the
  // filter box (also a search box) did nothing, and neither did an Enter sent by key code or the search box's own search event.
  {
    const P3 = page(); P3.scr.refresh(); await tick();
    const v3 = cls(P3.rootEl, 'doc')[0], c3 = () => whereOf(v3);
    const in3 = tag(P3.rootEl, 'INPUT'), box = in3.find(i => /Search words/.test(i.getAttribute('placeholder') || '')), fbox = in3.find(i => /Filter/.test(i.getAttribute('placeholder') || ''));
    box.value = 'chapter two'; box.fire('keydown', { keyCode: 13, which: 13 }); await tick();
    ok(/1 matches for chapter two/.test(c3()), 'GT-32: Enter by key code searches ' + c3());
    box.value = 'getting started'; box.fire('search'); await tick();
    ok(/matches for getting started/.test(c3()), 'GT-32: the search event searches ' + c3());
    box.value = 'mount scan'; box.fire('keydown', { key: 'Enter', isComposing: true }); await tick();
    ok(/matches for getting started/.test(c3()), 'GT-32: Enter while typing in an input method does not search');
    fbox.value = 'second page'; fbox.fire('keydown', { key: 'Enter' }); await tick();
    ok(/matches for second page/.test(c3()) && box.value === 'second page', 'GT-32: Enter in the filter box searches ' + c3());
    fbox.value = '02-next'; fbox.fire('input'); fbox.fire('keydown', { key: 'Enter' }); await tick();
    ok(c3() === 'guide/02-next.md', 'GT-32: Enter in the filter box opens the single match ' + c3());
  }

  // ---- G9 book view: synthetic guide folder, order from the listing, links, search by part, PDF, engine set
  const bkr = path.join(work, 'bookroot'), gp = (rel, text) => put(rel, text, bkr);
  gp('guide/README.md', '# The book\nIntro text. See [the first step](p01-first.md) and [the range entry](r02-keys.md#range).\n');
  gp('guide/p01-first.md', '# Step one\n## Doing it\nzebrafish in part one\n');
  gp('guide/p9-nine.md', '# Step nine\nnine\n');
  gp('guide/p10-ten.md', '# Step ten\nten\n');
  gp('guide/01-detail.md', '# Detail one\nzebrafish in part two\n');
  gp('guide/02-more.md', '# Detail two\nmore\n');
  gp('guide/r01-ref.md', '# Ref one\n## Area\nref text, see [colliders](#setcolliders.set)\n### set/colliders.set\nprofiles\n');
  gp('guide/r02-keys.md', ['# Ref two', '## Keys', 'zebrafish heading text below', '### range', 'the range key', '### Range', 'second range', '### `armor` block (area)', 'armor text', 'Back to [the first step](p01-first.md#doing-it).', '', '<!-- internal -->', '> a quoted note', '<!-- /internal -->', '<!-- goh: GHX-1 -->', '', '- outer', '  - inner', '    ' + F3, '    nested code', '    ' + F3].join('\r\n'));
  gp('guide/CHANGELOG.md', '# changes\n'); gp('guide/PLAN.md', '# plan\n'); gp('guide/i18n/ru/README.md', '# ru\n');
  process.env.AS2_DOCS_ROOT = bkr; R.reset();
  const order = ['README.md', 'p01-first.md', 'p9-nine.md', 'p10-ten.md', '01-detail.md', '02-more.md', 'r01-ref.md', 'r02-keys.md'].map(x => 'guide/' + x);
  let b = await call('book', { set: 'guide' });
  ok(b.found && b.chapters.map(x => x.p).join() === order.join(), 'book: reading order README, p*, numbered, r* from the listing ' + b.chapters.map(x => x.p).join());
  ok(b.parts.join() === 'intro,process,detail,ref' && b.chapters[1].title === 'Step one' && b.pdf === null, 'book: parts and titles');
  s = await call('status');
  ok(s.found && s.books.guide === 8 && !s.books.engine && !s.sets.some(x => x.id === 'engine') && s.pdf === null, 'book: status counts the book, no engine set, no PDF');
  ok(await st(call('book', { set: 'nope' })) === 400, 'book: unknown book 400');
  const gl = (await call('list', { set: 'guide' })).files.map(x => x.p);
  ok(gl.slice(0, 8).join() === order.join() && gl.length === 8, 'book: the single-file list is the chapters in reading order, CHANGELOG, PLAN and translations left out ' + gl.join());
  // a folder with only a guide/ of book chapters is a docs root (the release zip: guide/ beside the exe)
  const rel = path.join(work, 'release'); put('guide/p01-x.md', '# X\n', rel);
  process.env.AS2_DOCS_ROOT = rel; R.reset();
  ok((await call('status')).found && (await call('book', { set: 'guide' })).chapters.length === 1, 'book: a release folder with only guide chapters is found');
  put('START-HERE.md', '# START HERE\nzip top\n', rel); R.reset();
  { const sr = await call('status'); ok(sr.sets.find(x => x.id === 'here').files === 1 && !sr.sets.some(x => x.id === 'start') && sr.pub[0] === 'START-HERE.md', 'W6: in the release folder the start page is START-HERE.md at the top ' + sr.pub.join()); }
  process.env.AS2_DOCS_ROOT = bkr; R.reset();
  let bs = await call('booksearch', { set: 'guide', q: 'zebrafish' });
  ok(bs.total === 3 && bs.chapters === 3 && bs.groups.map(g => g.part).join() === 'process,detail,ref' && bs.groups[2].hits[0].p === 'guide/r02-keys.md' && bs.groups[2].hits[0].line === 3, 'booksearch: hits grouped by part in reading order ' + JSON.stringify(bs.groups));
  ok(await st(call('booksearch', { set: 'guide', q: 'z' })) === 400, 'booksearch: short query 400');

  const P4 = page(); P4.scr.refresh(); await tick();
  const v4 = cls(P4.rootEl, 'doc')[0], c4 = () => whereOf(v4), b4 = () => tag(P4.rootEl, 'BUTTON');
  const bookB = b4().find(x => x.textContent === 'Read the whole guide'), pdfB = b4().find(x => x.textContent === 'Open the PDF');
  ok(bookB && !bookB.hidden, 'book page: the whole-guide button is offered');
  ok(pdfB && pdfB.hidden, 'book page: no PDF offer without a PDF');
  bookB.click(); await tick();
  const secs = () => tag(v4, 'SECTION'), drawn = () => secs().map(x => !/Loading this chapter/.test(x.textContent));
  ok(secs().length === 8 && drawn().join() === 'true,true,false,false,false,false,false,false', 'book page: one section per chapter, only the first ones drawn ' + drawn().join());
  ok(/chapter 1 of 8, The book/.test(c4()), 'book page: crumb ' + c4());
  const toc = cls(P4.rootEl, 'scroll')[0];
  ok(all(toc, x => x.dataset && x.dataset.part).map(x => x.dataset.part).join() === 'intro,process,detail,ref' && /Part I: Step by step/.test(toc.textContent) && tag(toc, 'BUTTON').filter(x => x.dataset.ci).length === 8, 'book page: contents by part and chapter');
  ok(b4().find(x => x.textContent === 'Open this chapter alone' && !x.hidden && !x.dataset.go) && bookB.hidden, 'book page: single chapter button replaces the book button');
  // cross-chapter link with an anchor lands on the entry
  tag(v4, 'BUTTON').find(x => x.getAttribute('title') === 'r02-keys.md#range').click(); await tick();
  let hit = cls(v4, 'hit');
  ok(hit.length === 1 && hit[0].dataset.slug === 'range' && hit[0].textContent === 'range' && /chapter 8 of 8, Ref two/.test(c4()), 'book page: link r02-keys.md#range lands on the entry ' + c4());
  ok(drawn().join() === 'true,true,false,false,false,false,true,true' && v4.children[0] === secs()[0].parentNode, 'book page: chapters drawn on demand, still one document');
  ok(all(secs()[7], x => x.dataset && x.dataset.slug).map(x => x.dataset.slug).join() === 'ref-two,keys,range,range-1,armor-block-area', 'book page: heading anchors, repeats numbered');
  ok(!blockProbs(P4.rootEl).length, 'blocks: the book page (contents, chapters, chapter ends) stays inside leaf blocks\n  ' + blockProbs(P4.rootEl).join('\n  '));
  ok(tag(toc, 'BUTTON').find(x => x.dataset.ci === '7').style.fontWeight === 'bold' && tag(toc, 'BUTTON').some(x => x.dataset.head === 'keys'), 'book page: contents follow the reader');
  ok(!/<!--|GHX-1/.test(v4.textContent), 'book page: whole-line HTML comments (edition markers, trace lines) are not shown');
  ok(cls(v4, 'quote').length === 1 && tag(secs()[7], 'PRE').length === 1 && /nested code/.test(tag(secs()[7], 'PRE')[0].textContent), 'book page: quote and code inside a nested list');
  // previous / next at chapter ends
  const ends = all(secs()[7], x => x.dataset && x.dataset.go).map(x => x.dataset.go);
  ok(ends.join() === 'prev,alone', 'book page: last chapter ends with previous only ' + ends.join());
  all(secs()[7], x => x.dataset && x.dataset.go === 'prev')[0].click(); await tick();
  ok(/chapter 7 of 8, Ref one/.test(c4()) && all(secs()[6], x => x.dataset && x.dataset.go).map(x => x.dataset.go).join() === 'prev,next,alone', 'book page: previous goes one chapter back');
  tag(secs()[6], 'BUTTON').find(x => x.getAttribute('title') === '#setcolliders.set').click(); await tick();
  hit = cls(v4, 'hit');
  ok(/chapter 7 of 8/.test(c4()) && hit.length === 1 && hit[0].textContent === 'set/colliders.set', 'book page: an anchor in the same chapter, written with its dot kept');
  // link back into Part I with an anchor
  tag(secs()[7], 'BUTTON').find(x => x.getAttribute('title') === 'p01-first.md#doing-it').click(); await tick();
  hit = cls(v4, 'hit');
  ok(/chapter 2 of 8, Step one/.test(c4()) && hit.length === 1 && hit[0].textContent === 'Doing it', 'book page: link to another part lands on its heading');
  // search inside the book: grouped by part, a hit opens the book at its line
  const sel4 = tag(P4.rootEl, 'SELECT')[1], sq4 = tag(P4.rootEl, 'INPUT').find(i => /Search words/.test(i.getAttribute('placeholder') || ''));
  ok(sel4.value === 'book' && sel4.children[0].textContent === 'This book', 'book page: search scope is this book');
  sq4.value = 'zebrafish'; sq4.fire('keydown', { key: 'Enter' }); await tick();
  const groups = cls(v4, 'bgroup');
  ok(groups.map(g => g.dataset.part).join() === 'process,detail,ref' && /Part II: In detail \(1\)/.test(groups[1].textContent) && /3 matches for zebrafish, in 3 chapters/.test(c4()), 'book page: Enter searches the book, hits grouped by part ' + c4());
  tag(groups[2], 'BUTTON')[0].click(); await tick();
  hit = cls(v4, 'hit');
  ok(/chapter 8 of 8/.test(c4()) && hit.length === 1 && /zebrafish heading text/.test(hit[0].textContent), 'book page: a search hit opens the book at its line');
  // contents button, then a chapter alone
  tag(toc, 'BUTTON').find(x => x.dataset.ci === '4').click(); await tick();
  ok(/chapter 5 of 8, Detail one/.test(c4()), 'book page: contents entry opens its chapter');
  all(secs()[4], x => x.dataset && x.dataset.go === 'alone')[0].click(); await tick();
  ok(c4() === 'guide/01-detail.md' && !tag(v4, 'SECTION').length && tag(P4.rootEl, 'SELECT')[1].children[0].value === 'all', 'book page: a chapter opens alone, search scope back to all');
  const backB = b4().find(x => x.textContent === 'Back'); backB.click(); await tick();
  ok(/chapter 5 of 8/.test(c4()) && tag(v4, 'SECTION').length === 8, 'book page: Back returns to the book');
  ok(P4.toasts.length === 0, 'book page: no error toast ' + P4.toasts.join(' / '));

  // PDF: offered only when one exists; the newest by version; opened through the system
  put('guide/dist/AS2-Modding-Guide-v1.2.pdf', '%PDF-1.4 a', bkr); put('guide/dist/AS2-Modding-Guide-v1.10.pdf', '%PDF-1.4 b', bkr); put('guide/dist/AS2-Modding-Guide-v9.html', 'x', bkr);
  R.reset();
  s = await call('status');
  ok(s.pdf && s.pdf.name === 'AS2-Modding-Guide-v1.10.pdf' && (await call('book', { set: 'guide' })).pdf.ver === '1.10', 'pdf: newest by version ' + JSON.stringify(s.pdf));
  const spawned = []; R._setSpawn((cmd, args) => { spawned.push([cmd, args]); return { on() {}, unref() {} }; });
  const P5 = page(); P5.scr.refresh(); await tick();
  const pdf5 = tag(P5.rootEl, 'BUTTON').find(x => x.textContent === 'Open the PDF');
  ok(pdf5 && !pdf5.hidden && /v1\.10\.pdf/.test(pdf5.getAttribute('title')), 'pdf: offered when a PDF exists');
  pdf5.click(); await tick();
  ok(spawned.length === 1 && spawned[0][0] === 'explorer.exe' && spawned[0][1][0] === path.join(bkr, 'guide', 'dist', 'AS2-Modding-Guide-v1.10.pdf') && /opening/.test(P5.toasts.join()), 'pdf: opened in the reader ' + JSON.stringify(spawned));
  P5.scr.view('arsenal'); await tick();
  ok(pdf5.hidden, 'pdf: offered with the guide only');
  R._setSpawn(null);

  // engine document: listed only when its folder exists, read as a book the same way
  ok(!(await call('status')).sets.some(x => x.id === 'engine'), 'engine: not listed without its folder');
  put('techdoc/engine/README.md', '# Engine\nsee [A](A-terms.md)\n', bkr); put('techdoc/engine/02-two.md', '# Two\n', bkr); put('techdoc/engine/01-one.md', '# One\n', bkr); put('techdoc/engine/A-terms.md', '# Terms\n', bkr);
  R.reset();
  s = await call('status');
  ok(s.sets.some(x => x.id === 'engine' && x.files === 4) && s.books.engine === 4, 'engine: listed when the folder exists');
  b = await call('book', { set: 'engine' });
  ok(b.chapters.map(x => x.p.split('/').pop()).join() === 'README.md,01-one.md,02-two.md,A-terms.md' && b.parts.join() === 'intro,main,appendix', 'engine: reading order README, numbered, appendices');
  const P6 = page(); P6.scr.refresh(); await tick();
  P6.scr.view('engine'); await tick();
  const eb = tag(P6.rootEl, 'BUTTON').find(x => x.textContent === 'Read the whole document');
  ok(eb && !eb.hidden, 'engine: whole-document button');
  eb.click(); await tick();
  ok(/Project notes: chapter 1 of 4/.test(cardOf(cls(P6.rootEl, 'doc')[0]).textContent) && /Appendices/.test(P6.rootEl.textContent), 'engine: shown as a book with its parts');
  process.env.AS2_DOCS_ROOT = root; R.reset();

  // ---- whole documents (one self-contained HTML file each, shown in a sandboxed frame): locator, newest version, theme, refusals,
  // status shape with and without the files, the PDFs of guide and engine, the page's block, the frame and its state, the real server
  {
    const wr = path.join(work, 'wholeroot'), wout = path.join(work, 'wholeout'), W = (rel, t) => put(rel, t, wr);
    const HEAD = '<!doctype html><html lang="en">';
    const doc = (id, ver, mark) => HEAD + '<head><meta charset="utf-8"><meta name="arsenal-whole" content="' + id + ' ' + ver + '"><title>' + id + '</title><style>:root{--bg:#fff}</style></head><body>' +
      '<svg viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10"/></svg><p id="top">' + mark + '</p><a href="#top">top</a><script>document.body.setAttribute("data-ok","1")</script></body></html>';
    W('guide/README.md', '# Guide\nintro words\n');
    W('guide/01-one.md', '# One\nchapter words\n');
    W('techdoc/engine/README.md', '# Engine\n');
    ok(R.WHOLE_HEAD === HEAD && R.WHOLE_MAX >= 8 * 1024 * 1024 && Object.keys(R.WHOLE).join() === 'atlas,guide,engine', 'whole: contract ids, start and size cap');
    process.env.AS2_DOCS_ROOT = wr; R.reset();
    s = await call('status');
    ok(s.found && Array.isArray(s.whole) && s.whole.length === 0 && s.wholeAbsent.map(x => x.id).join() === 'atlas,guide,engine' && s.wholeAbsent.every(x => x.make === '' && x.refused === ''), 'whole: none here, all absent, no command without the making scripts ' + JSON.stringify(s.wholeAbsent));
    ok(s.pdf === null && s.pdfs.guide === null && s.pdfs.engine === null, 'whole: no PDFs');
    W('guide/build-pdf.js', '// maker'); W('tools/wholedoc/atlas.js', '// maker'); R.reset();
    s = await call('status');
    ok(s.wholeAbsent.map(x => x.make).join('|') === 'node tools/wholedoc/atlas.js <pack>/atlas.html|node guide/build-pdf.js --html-only|node guide/build-pdf.js --book engine --html-only', 'whole: absent ones carry the command that makes them ' + s.wholeAbsent.map(x => x.make).join('|'));
    // newest by version, HTML and PDF each on its own; the atlas versioned by its meta
    W('guide/dist/AS2-Modding-Guide-v1.2.html', doc('guide', '1.2', 'guide one point two'));
    W('guide/dist/AS2-Modding-Guide-v1.12.html', doc('guide', '1.12', 'guide one point twelve'));
    W('guide/dist/AS2-Modding-Guide-v2.0.html', doc('guide', '2.0', 'guide two point oh'));
    W('guide/dist/AS2-Modding-Guide-v2.0-draft.html', doc('guide', '9', 'not a contract name'));
    W('guide/dist/AS2-Modding-Guide-v1.2.pdf', '%PDF-1.4 a'); W('guide/dist/AS2-Modding-Guide-v1.12.pdf', '%PDF-1.4 b');
    W('techdoc/doctrine/atlas.html', doc('atlas', '1.0', 'atlas words'));
    W('techdoc/dist/AS64-Engine-Technical-Document-v1.0.pdf', '%PDF-1.4 e'); W('techdoc/dist/AS64-Engine-Technical-Document-v1.10.pdf', '%PDF-1.4 e2');
    R.reset();
    s = await call('status');
    const wg = s.whole.find(x => x.id === 'guide'), wa = s.whole.find(x => x.id === 'atlas');
    ok(s.whole.map(x => x.id).join() === 'atlas,guide' && s.wholeAbsent.map(x => x.id).join() === 'engine', 'whole: atlas and guide here, engine absent ' + s.whole.map(x => x.id).join());
    ok(wg.name === 'AS2-Modding-Guide-v2.0.html' && wg.ver === '2.0' && wg.kb >= 1 && JSON.stringify(Object.keys(wg)) === '["id","name","ver","kb","pdf","part"]' && wg.part === 'modding' && s.wholeAbsent.every(x => x.part === 'engine'), 'whole: newest guide HTML is 2.0 (after 1.12 after 1.2) ' + JSON.stringify(wg));
    ok(wg.pdf && wg.pdf.name === 'AS2-Modding-Guide-v1.12.pdf' && wg.pdf.ver === '1.12' && JSON.stringify(Object.keys(wg.pdf)) === '["name","ver","kb"]' && s.pdf.name === wg.pdf.name, 'whole: the PDF picked on its own (1.12 after 1.2), old pdf field kept ' + JSON.stringify(wg.pdf));
    ok(wa.name === 'atlas.html' && wa.ver === '1.0' && wa.pdf === null, 'whole: the atlas, version from its meta, no PDF ' + JSON.stringify(wa));
    ok(s.pdfs.engine && s.pdfs.engine.name === 'AS64-Engine-Technical-Document-v1.10.pdf' && s.pdfs.guide.ver === '1.12', 'whole: engine PDF without its HTML ' + JSON.stringify(s.pdfs));
    ok((await call('book', { set: 'engine' })).pdf.ver === '1.10' && (await call('book', { set: 'guide' })).pdf.ver === '1.12' && (await call('book', { set: 'history' })).pdf === null, 'whole: book outline carries the PDF of guide and engine');
    // the route: theme inserted into the exact start, nothing else changed; no theme = the file as it is
    const raw = id => fs.readFileSync(path.join(wr, ...(id === 'atlas' ? ['techdoc', 'doctrine', 'atlas.html'] : ['guide', 'dist', 'AS2-Modding-Guide-v2.0.html']))).toString('utf8');
    let w = await call('whole', { id: 'atlas', theme: 'dark' });
    ok(w.type === 'text/html; charset=utf-8' && w.sandbox === true && w.__raw === '<!doctype html><html lang="en" data-theme="dark">' + raw('atlas').slice(HEAD.length), 'whole route: dark theme set on the html tag');
    w = await call('whole', { id: 'guide', theme: 'light' });
    ok(w.__raw.startsWith('<!doctype html><html lang="en" data-theme="light"><head>') && /guide two point oh/.test(w.__raw), 'whole route: light theme, newest guide');
    w = await call('whole', { id: 'atlas' });
    ok(w.__raw === raw('atlas'), 'whole route: no theme asked = served unchanged');
    for (const [q0, code, m0] of [[{ id: 'nope' }, 400, 'unknown id'], [{ id: '../guide' }, 400, 'path as id'], [{}, 400, 'no id'], [{ id: 'toString' }, 400, 'prototype name'], [{ id: 'atlas', theme: 'blue' }, 400, 'bad theme'], [{ id: 'engine' }, 404, 'absent']])
      ok(await st(call('whole', q0)) === code, 'whole route: ' + m0 + ' -> ' + code);
    // refusals: bad start, over the size cap, a link on the way, a file outside the root; never served
    W('techdoc/dist/AS64-Engine-Technical-Document-v1.0.html', '<!DOCTYPE html><html lang="en"><body>shouty</body></html>');
    W('techdoc/dist/AS64-Engine-Technical-Document-v0.9.html', doc('engine', '0.9', 'older good one'));
    R.reset(); s = await call('status');
    let ea = s.wholeAbsent.find(x => x.id === 'engine');
    ok(!s.whole.some(x => x.id === 'engine') && ea && /AS64-Engine-Technical-Document-v1\.0\.html: does not start with/.test(ea.refused), 'whole: a newest file with the wrong start is refused, not swapped for an older one ' + JSON.stringify(ea));
    ok(await st(call('whole', { id: 'engine' })) === 409, 'whole route: wrong start refused (409)');
    W('techdoc/dist/AS64-Engine-Technical-Document-v1.0.html', '﻿' + doc('engine', '1.0', 'bom'));
    R.reset(); ok(await st(call('whole', { id: 'engine' })) === 409, 'whole route: a byte order mark before the start is refused');
    const big = path.join(wr, 'techdoc', 'dist', 'AS64-Engine-Technical-Document-v1.0.html');
    fs.writeFileSync(big, doc('engine', '1.0', 'big')); fs.truncateSync(big, R.WHOLE_MAX + 1);
    R.reset(); s = await call('status'); ea = s.wholeAbsent.find(x => x.id === 'engine');
    ok(/over 12 MB/.test(ea.refused) && await st(call('whole', { id: 'engine' })) === 409, 'whole: over the size cap refused ' + ea.refused);
    fs.writeFileSync(big, doc('engine', '1.0', 'engine words')); R.reset();
    ok((await call('status')).whole.some(x => x.id === 'engine' && x.ver === '1.0' && x.pdf.ver === '1.10') && /engine words/.test((await call('whole', { id: 'engine' })).__raw), 'whole: a good engine file is listed and served');
    // a folder on the way that is a link (junction) to a folder outside the root: not followed
    put('atlas.html', doc('atlas', '6.6', 'outside words'), wout);
    fs.rmSync(path.join(wr, 'techdoc', 'doctrine'), { recursive: true, force: true });
    let jl = false; try { fs.symlinkSync(wout, path.join(wr, 'techdoc', 'doctrine'), 'junction'); jl = true; } catch (e) { /* no link support */ }
    if (jl) {
      R.reset(); s = await call('status');
      ok(!s.whole.some(x => x.id === 'atlas') && await st(call('whole', { id: 'atlas' })) === 404, 'whole: a linked folder leading outside the root is not followed');
      fs.rmdirSync(path.join(wr, 'techdoc', 'doctrine'));
    }
    // the file itself a link (needs the right to make one on Windows: skipped without it)
    fs.mkdirSync(path.join(wr, 'techdoc', 'doctrine'), { recursive: true });
    let fl = false; try { fs.symlinkSync(path.join(wout, 'atlas.html'), path.join(wr, 'techdoc', 'doctrine', 'atlas.html'), 'file'); fl = true; } catch (e) { /* no right: skip */ }
    if (fl) {
      R.reset(); s = await call('status');
      ok(!s.whole.some(x => x.id === 'atlas') && /a link/.test(s.wholeAbsent.find(x => x.id === 'atlas').refused) && await st(call('whole', { id: 'atlas' })) === 409, 'whole: a linked file is refused');
      fs.unlinkSync(path.join(wr, 'techdoc', 'doctrine', 'atlas.html'));
    }
    W('techdoc/doctrine/atlas.html', doc('atlas', '1.0', 'atlas words')); R.reset();
    // mask: the user's home never shows in an answer
    ok(R.mask(path.join(os.homedir(), 'x', 'y.html')) === path.join('%USERPROFILE%', 'x', 'y.html') && !JSON.stringify(await call('status')).toLowerCase().includes(os.homedir().toLowerCase()), 'whole: home masked');
    // POST /pdf: no set = the guide, as before; engine; anything else 400
    const sp = []; R._setSpawn((cmd, args) => { sp.push(args[0]); return {}; });
    const pdfPost = b => ext.routes['POST /api/x/docs/pdf'](new URL('http://127.0.0.1/api/x/docs/pdf'), b, {});
    await pdfPost({}); await pdfPost(null); await pdfPost({ set: 'engine' });
    ok(sp.length === 3 && path.basename(sp[0]) === 'AS2-Modding-Guide-v1.12.pdf' && sp[1] === sp[0] && path.basename(sp[2]) === 'AS64-Engine-Technical-Document-v1.10.pdf', 'pdf route: default guide, engine on asking ' + sp.map(x => path.basename(x)).join());
    ok(await st(pdfPost({ set: 'atlas' })) === 400 && await st(pdfPost({ set: '../x' })) === 400, 'pdf route: other sets 400');

    // the page: the Whole documents block with Advanced off, a frame in the reading card, Back, theme, PDF, search
    const WP = page({ theme: 'auto' }); WP.scr.refresh(); await tick();
    const wb = cls(WP.rootEl, 'wholebox')[0], wv = cls(WP.rootEl, 'doc')[0], wc = () => whereOf(wv), wbtn = () => tag(wb, 'BUTTON');
    ok(wb && !wb.hidden && /Whole documents/.test(wb.textContent) && wbtn().map(b => b.textContent).join() === 'Doctrine atlas,Modding guide', 'whole page: one button per document of the part (Modding), Advanced off ' + wbtn().map(b => b.textContent).join());
    ok(!cls(wb, 'hint').some(x => x.dataset.absent), 'whole page: no absent lines with Advanced off');
    ok(!blockProbs(WP.rootEl).length, 'blocks: the whole documents block is a leaf\n  ' + blockProbs(WP.rootEl).join('\n  '));
    tag(WP.rootEl, 'BUTTON').find(b => b.dataset.p === 'guide/01-one.md').click(); await tick();
    ok(wc() === 'guide/01-one.md', 'whole page: a chapter first ' + wc());
    wbtn()[0].click(); await tick();
    let fr = tag(wv, 'IFRAME')[0];
    ok(fr && fr.getAttribute('sandbox') === null && fr.getAttribute('referrerpolicy') === 'no-referrer' && /Doctrine atlas/.test(fr.getAttribute('title')) && fr.getAttribute('src') === '/api/x/docs/whole?id=atlas' && fr.style.width === '100%' && /70vh/.test(fr.style.height), 'whole page: the atlas in a sandboxed frame, theme auto = no theme asked ' + (fr && fr.getAttribute('src')));
    ok(tag(wv, 'IFRAME').length === 1 && wv.children.length === 1, 'whole page: the frame alone in the reading view');
    ok(/^Doctrine atlas, version 1\.0/.test(wc()) && /Ctrl\+F/.test(wc()) && wbtn()[0].style.fontWeight === 'bold', 'whole page: where line names document and version, find hint ' + wc());
    const tab = all(cardOf(wv), x => x.dataset && x.dataset.go === 'wtab')[0];
    ok(tab && tab.tagName === 'A' && tab.getAttribute('href') === '/api/x/docs/whole?id=atlas' && tab.getAttribute('target') === '_blank' && /noopener/.test(tab.getAttribute('rel')) && tab.textContent === 'Open in a new tab', 'whole page: open in a new tab, same address');
    ok(!all(cardOf(wv), x => x.dataset && x.dataset.go === 'wpdf').length, 'whole page: no PDF beside the atlas');
    ok(!blockProbs(WP.rootEl).length, 'blocks: the open whole document stays in leaf blocks\n  ' + blockProbs(WP.rootEl).join('\n  '));
    // theme change from the header: the frame comes again with the theme
    WP.store.theme = 'dark'; WP.themeFns['docs.whole'](); await tick();
    fr = tag(wv, 'IFRAME')[0];
    ok(fr.getAttribute('src') === '/api/x/docs/whole?id=atlas&theme=dark' && all(cardOf(wv), x => x.dataset && x.dataset.go === 'wtab')[0].getAttribute('href') === fr.getAttribute('src'), 'whole page: a theme change reloads the frame in that theme ' + fr.getAttribute('src'));
    const fr1 = fr; WP.themeFns['docs.whole'](); await tick();
    ok(tag(wv, 'IFRAME')[0] === fr1, 'whole page: the same theme again does not reload');
    // the guide: its PDF beside it
    wbtn()[1].click(); await tick();
    ok(/^Modding guide, version 2\.0/.test(wc()) && tag(wv, 'IFRAME')[0].getAttribute('src') === '/api/x/docs/whole?id=guide&theme=dark', 'whole page: the guide ' + wc());
    sp.length = 0;
    all(cardOf(wv), x => x.dataset && x.dataset.go === 'wpdf')[0].click(); await tick();
    ok(sp.length === 1 && path.basename(sp[0]) === 'AS2-Modding-Guide-v1.12.pdf' && /opening/.test(WP.toasts.join()), 'whole page: Open the PDF beside the guide ' + sp.join());
    WP.scr.view('engine'); await tick();
    ok(wbtn().map(b => b.textContent).join() === 'Engine document', 'whole page: the Engine part holds the engine document');
    wbtn()[0].click(); await tick(); sp.length = 0;
    all(cardOf(wv), x => x.dataset && x.dataset.go === 'wpdf')[0].click(); await tick();
    ok(sp.length === 1 && path.basename(sp[0]) === 'AS64-Engine-Technical-Document-v1.10.pdf', 'whole page: the engine PDF beside the engine document');
    // the search box still searches the chapters; Back returns to the document, then to the chapter
    const wsq = tag(WP.rootEl, 'INPUT').find(i => /Search words/.test(i.getAttribute('placeholder') || ''));
    wsq.value = 'chapter words'; wsq.fire('keydown', { key: 'Enter' }); await tick();
    ok(/1 matches for chapter words/.test(wc()) && !tag(wv, 'IFRAME').length, 'whole page: the search box searches the chapters ' + wc());
    const wback = tag(WP.rootEl, 'BUTTON').find(b => b.textContent === 'Back');
    wback.click(); await tick();
    ok(/^Engine document, version 1\.0/.test(wc()) && tag(wv, 'IFRAME').length === 1, 'whole page: Back returns to the document ' + wc());
    wback.click(); await tick(); wback.click(); await tick();
    ok(/^Doctrine atlas, version 1\.0/.test(wc()) && /theme=dark/.test(tag(wv, 'IFRAME')[0].getAttribute('src')), 'whole page: Back through guide to the atlas, in the theme of now ' + wc());
    wback.click(); await tick();
    ok(wc() === 'guide/01-one.md' && !tag(wv, 'IFRAME').length, 'whole page: Back again returns to the chapter ' + wc());
    // the engine set's own PDF button (the book buttons), not only the guide's
    WP.scr.view('engine'); await tick();
    const epdf = tag(WP.rootEl, 'BUTTON').find(b => b.textContent === 'Open the PDF' && !b.dataset.go);
    ok(epdf && !epdf.hidden && /AS64-Engine-Technical-Document-v1\.10\.pdf/.test(epdf.getAttribute('title')) && /whole engine document/.test(epdf.getAttribute('title')), 'whole page: the engine set offers its PDF');
    sp.length = 0; epdf.click(); await tick();
    ok(sp.length === 1 && path.basename(sp[0]) === 'AS64-Engine-Technical-Document-v1.10.pdf', 'whole page: the engine set opens the engine PDF');
    R._setSpawn(null);
    // Advanced on: a missing document shows how to make it
    fs.rmSync(path.join(wr, 'techdoc', 'doctrine'), { recursive: true, force: true }); R.reset();
    const WQ = page(); WQ.scr.refresh(); await tick();
    const wq = cls(WQ.rootEl, 'wholebox')[0];
    ok(tag(wq, 'BUTTON').map(b => b.textContent).join() === 'Modding guide' && !cls(wq, 'hint').some(x => x.dataset.absent), 'whole page: the atlas absent, no line with Advanced off');
    WQ.setAdv(true); await tick();
    const absentL = cls(wq, 'hint').filter(x => x.dataset.absent);
    ok(absentL.length === 1 && absentL[0].dataset.absent === 'atlas' && /Doctrine atlas is not made yet\. Make it with: node tools\/wholedoc\/atlas\.js <pack>\/atlas\.html/.test(absentL[0].textContent), 'whole page: with Advanced on the missing atlas shows its command');
    ok(WQ.toasts.length === 0 && WP.toasts.filter(t => !/opening/.test(t)).length === 0, 'whole page: no error toast ' + WP.toasts.concat(WQ.toasts).join(' / '));
    // nothing here at all: the block is hidden
    process.env.AS2_DOCS_ROOT = bkr; R.reset();
    const WN = page(); WN.scr.refresh(); await tick();
    ok(cls(WN.rootEl, 'wholebox')[0].hidden, 'whole page: no block when no whole document is here (Advanced off)');

    // the real server: the route over HTTP, the CSP sandbox header and the plain refusals
    process.env.AS2_DOCS_ROOT = wr; W('techdoc/doctrine/atlas.html', doc('atlas', '1.0', 'atlas words')); R.reset();
    const gui = require(path.join(__dirname, '..', '..', 'gui'));
    const srv = await gui.start({ port: 0, cwd: work, tmpRoot: path.join(work, 'guitmp') });
    const hget = u => new Promise((res, rej) => { require('http').get({ host: '127.0.0.1', port: srv.port, path: u, agent: false, headers: { host: '127.0.0.1:' + srv.port } }, r => { const ch = []; r.on('data', d => ch.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, text: Buffer.concat(ch).toString('utf8') })); }).on('error', rej); });
    try {
      const a = await hget('/api/x/docs/whole?id=atlas&theme=dark');
      ok(a.status === 200 && a.headers['content-type'] === 'text/html; charset=utf-8' && a.headers['content-security-policy'] === gui.SANDBOX_CSP && /^sandbox allow-scripts;/.test(a.headers['content-security-policy']) &&
        a.headers['x-content-type-options'] === 'nosniff' && a.headers['cache-control'] === 'no-store' && a.text.startsWith('<!doctype html><html lang="en" data-theme="dark">'), 'server: whole document as html under the CSP sandbox ' + JSON.stringify(a.headers));
      const sj = await hget('/api/x/docs/status');
      ok(sj.status === 200 && /application\/json/.test(sj.headers['content-type']) && !sj.headers['content-security-policy'] && JSON.parse(sj.text).whole.length === 3, 'server: JSON answers unchanged, no CSP');
      for (const [u, code] of [['/api/x/docs/whole?id=nope', 400], ['/api/x/docs/whole?id=atlas&theme=x', 400]]) {
        const r = await hget(u); ok(r.status === code && /application\/json/.test(r.headers['content-type']) && JSON.parse(r.text).error, 'server: ' + u + ' -> ' + code + ' plain message');
      }
      fs.writeFileSync(path.join(wr, 'techdoc', 'doctrine', 'atlas.html'), '<html><script>alert(1)</script></html>'); R.reset();
      const rf = await hget('/api/x/docs/whole?id=atlas');
      ok(rf.status === 409 && !/<script>/.test(rf.text) && /does not start with/.test(JSON.parse(rf.text).error), 'server: a file with the wrong start is never served ' + rf.text);
      ok(require(path.join(__dirname, '..', '..', 'remote')).allowed('GET', '/api/x/docs/whole'), 'remote: the phone view may read whole documents');
    } finally { await srv.close(); }
    process.env.AS2_DOCS_ROOT = root; R.reset();
  }

  // ---- the public engine package: a release folder (guide, START-HERE.md, no the game, no plan, no without the engine
  // document says where it comes from; after the package's techdoc folder is copied in, Look again shows the set, the book, the whole
  // document and its PDF, and the set's description is the public one. The internal edition keeps its own text and shows no line.
  {
    const rr = path.join(work, 'pubrelease'), pk = path.join(work, 'enginepkg', 'techdoc'), RP = (rel, t) => put(rel, t, rr), PK = (rel, t) => put(rel, t, pk);
    const HEAD = '<!doctype html><html lang="en">';
    RP('START-HERE.md', '# START HERE\nzip top\n'); RP('guide/README.md', '# Guide\nintro\n'); RP('guide/01-one.md', '# One\nchapter\n');
    PK('engine/README.md', '# The engine\nsee [one](01-arch.md)\n'); PK('engine/01-arch.md', '# 01. Architecture\nkangarooid words\n'); PK('engine/A-faults.md', '# A. Faults\n');
    PK('dist/AS64-Engine-Technical-Document-v1.1.html', HEAD + '<head><meta charset="utf-8"><meta name="arsenal-whole" content="engine 1.1"></head><body>engine whole</body></html>');
    PK('dist/AS64-Engine-Technical-Document-v1.1.pdf', '%PDF-1.4 pub'); PK('CHANGELOG.md', '# changes\n');
    process.env.AS2_DOCS_ROOT = rr; R.reset();
    s = await call('status');
    ok(s.edition === 'public' && s.sets.map(x => x.id).join() === 'here,guide' && !s.books.engine && !s.whole.some(x => x.id === 'engine') && s.wholeAbsent.find(x => x.id === 'engine').make === '', 'pkg absent: public, no engine set, no engine whole, no command offered ' + s.sets.map(x => x.id).join());
    const E = page(); E.scr.refresh(); await tick(); E.scr.view('engine'); await tick();
    const ewb = cls(E.rootEl, 'wholebox')[0], gl0 = () => all(ewb, x => x.dataset && x.dataset.engine === 'get'), again = () => tag(ewb, 'BUTTON').find(b => b.dataset.go === 'eagain');
    ok(!ewb.hidden && gl0().length === 1 && gl0()[0].textContent === 'The engine technical document is a separate download, ARSENAL-engine-docs-public-<version>.zip, published beside the ARSENAL downloads. Unzip it, copy its techdoc folder into the ARSENAL folder, then press Look again.' &&
      again() && again().textContent === 'Look again' && !/https?:/.test(ewb.textContent), 'pkg absent: the Whole documents box names the download and the copy step, with Look again ' + ewb.textContent);
    ok(/^Whole documents/.test(ewb.textContent) && !/single file/.test(ewb.textContent), 'pkg absent: no whole document here, so the box holds the line only');
    ok(!blockProbs(E.rootEl).length, 'blocks: the download line and its button sit in the leaf block\n  ' + blockProbs(E.rootEl).join('\n  '));
    ok(/where it is present, the engine technical document/.test(E.rootEl.textContent) && !/the engine document and/.test(E.rootEl.textContent), 'intro: true without the engine document');
    E.setAdv(true); await tick();
    ok(gl0().length === 1 && !cls(ewb, 'hint').some(x => x.dataset.absent === 'engine'), 'pkg absent: with Advanced on the same line, no command line for the engine');
    E.setAdv(false); await tick();
    // the user copies the package's techdoc folder in; Look again reads the folders at once (no wait for the kept list)
    fs.cpSync(pk, path.join(rr, 'techdoc'), { recursive: true });
    again().click(); await tick();
    s = await call('status');
    ok(s.edition === 'public' && s.sets.some(x => x.id === 'engine' && x.files === 3) && s.books.engine === 3 && s.whole.some(x => x.id === 'engine' && x.ver === '1.1' && x.pdf && x.pdf.ver === '1.1') && s.pdfs.engine.ver === '1.1', 'pkg copied: set, book, whole document and PDF ' + JSON.stringify(s.whole));
    ok(!gl0().length && !again() && tag(ewb, 'BUTTON').map(b => b.textContent).join() === 'Engine document', 'pkg copied: Look again drops the line, the Engine document button is there');
    b = await call('book', { set: 'engine' });
    ok(b.parts.join() === 'intro,main,appendix' && b.chapters.length === 3 && b.pdf.name === 'AS64-Engine-Technical-Document-v1.1.pdf', 'pkg copied: the engine book with its PDF');
    ok(/engine whole/.test((await call('whole', { id: 'engine' })).__raw) && (await call('booksearch', { set: 'engine', q: 'kangarooid' })).total === 1, 'pkg copied: whole route serves it, book search finds its words');
    const esel = tag(E.rootEl, 'SELECT')[0];
    const ewhat = () => all(E.rootEl, x => x.dataset && x.dataset.blk === 'list.what')[0].textContent;
    ok(opts(esel).map(o => o.value).join() === 'engine' && esel.value === 'engine' && ewhat() === L.en['docs.what.engine.public'] && /separate download ARSENAL-engine-docs-public/.test(ewhat()) && !/not part of a release/.test(ewhat()), 'pkg copied: the engine set with the public description ' + ewhat());
    ok(tag(E.rootEl, 'BUTTON').some(x => x.textContent === 'Read the whole document' && !x.hidden) && tag(E.rootEl, 'BUTTON').some(x => x.textContent === 'Open the PDF' && !x.hidden && !x.dataset.go), 'pkg copied: book and PDF buttons for the engine set');
    // the history set in this release: no folder at all
    E.scr.view('history'); await tick();
    ok(tag(cls(E.rootEl, 'scroll')[0], 'BUTTON').map(x => x.textContent).join() === 'Source index' && !/No pages/.test(E.rootEl.textContent), 'pkg: Historical sources without a techdoc/history folder: the Source index alone');
    ok(E.toasts.length === 0, 'pkg: no error toast ' + E.toasts.join(' / '));
    // the internal edition (a plan folder): the project's text for the engine set; without the engine document no download line
    RP('plan/now.md', '# now\n'); R.reset();
    const I = page(); I.scr.refresh(); await tick();
    I.scr.view('engine'); await tick();
    ok((await call('status')).edition === 'internal' && all(I.rootEl, x => x.dataset && x.dataset.blk === 'list.what')[0].textContent === L.en['docs.what.engine'] && /not part of a release/.test(L.en['docs.what.engine']), 'internal: the engine set keeps the project text');
    fs.rmSync(path.join(rr, 'techdoc'), { recursive: true, force: true }); R.reset();
    const I2 = page(); I2.scr.refresh(); await tick();
    ok(!all(I2.rootEl, x => x.dataset && x.dataset.engine === 'get').length && cls(I2.rootEl, 'wholebox')[0].hidden, 'internal: no download line without the engine document, the box stays hidden');
    process.env.AS2_DOCS_ROOT = root; R.reset();
  }

  // ---- W6 historical sources: pages, then the generated Source index from the guide index data.
  // The index module is a made-up stand-in (tools/gemindex/lib/history.js contract): no page text from the real index here.
  {
    const absent = { available: () => ({ ok: false, why: 'the gemindex folder is not there' }), groups: () => [], rows: () => ({ total: 0, rows: [] }), text: () => null };
    const ROWS = [];
    for (let i = 0; i < 120; i++) ROWS.push({ id: 'r' + i, title: 'Old page ' + i, url: 'https://example.org/p' + i, archive: i === 0 ? 'https://web.archive.example/p0' : '', captured: (2008 + (i % 3)) + '-05-01', site: i % 2 ? 'site-a.example' : 'site-b.example', lang: 'en', hasText: i < 3, hand: i === 0 ? 'first' : i === 2 ? 'second' : null, kind: i === 0 ? 'diary' : '' });
    ROWS.splice(5, 0, { id: 'dc1', title: 'chat file', url: 'https://cdn.discordapp.com/attachments/x', captured: '2020-01-01', site: 'discord', hasText: true });
    const seen = [];
    const stub = {
      available: o => { seen.push(['available', o]); return { ok: true, dir: 'x', built: '2026-10-01', rows: 121, sites: 3 }; },
      groups: () => [{ id: 'site:a', title: 'site-a.example', kind: 'site', count: 60 }, { id: 'site:b', title: 'site-b.example', kind: 'site', count: 60 }, { id: 'y:2008', title: '2008', kind: 'year', count: 40 }, { id: 'discord', title: 'Files posted on Discord', kind: 'topic', count: 1 }, { id: 'h:first', title: 'First-hand', kind: 'hand', count: 2 }, { id: 'e:war', title: '1939 to 1945', kind: 'era', count: 120 }],
      rows: o => { seen.push(['rows', o]); let r = ROWS; if (o.group === 'site:a') r = r.filter(x => x.site === 'site-a.example'); if (o.q) r = r.filter(x => x.title.toLowerCase().includes(o.q.toLowerCase())); return { total: r.length, rows: r.slice(o.offset, o.offset + o.limit) }; },
      text: (id, o) => { const r = ROWS.find(x => x.id === id); return r && r.hasText ? { id, title: r.title, url: r.url, archive: r.archive, captured: r.captured, text: 'saved words of ' + r.title } : null; },
    };
    const post = (k, b) => ext.routes['POST /api/x/docs/history/' + k](new URL('http://127.0.0.1/api/x/docs/history/' + k), b || {}, {});
    R._setHistory(absent); R.reset();
    s = await call('status');
    ok(s.sets.some(x => x.id === 'history' && x.files === 0 && !x.notes) && s.history.ok === false && s.books.history === 1, 'history: listed with no pages, index not there ' + JSON.stringify(s.history));
    ok((await post('groups')).ok === false && (await post('rows')).ok === false, 'history: routes answer plainly without the index');
    let H = page(); H.scr.refresh(); await tick();
    let hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick();
    let hv = cls(H.rootEl, 'doc')[0];
    // no pages (a release ships none): the category's description and the Source index, no sentence about missing pages, no book button
    const hBtns = () => tag(H.rootEl, 'BUTTON').filter(b => !b.hidden);
    ok(!/No pages|not here|yet/i.test(cls(H.rootEl, 'scroll')[0].textContent) && hBtns().filter(b => b.dataset.p).map(b => b.textContent).join() === 'Source index' && tag(H.rootEl, 'H2')[0].textContent === 'Historical Sources' &&
      /^First-hand and second-hand sources on the Second World War, from the guide index\.$/.test(all(H.rootEl, x => x.dataset && x.dataset.blk === 'list.what')[0].textContent) && !hBtns().some(b => b.textContent === 'Read all historical sources'),
    'history: no pages = the description and the Source index alone, no missing-pages sentence, no book button ' + cls(H.rootEl, 'scroll')[0].textContent);
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    ok(/not installed here \(the gemindex folder is not there\)/.test(hv.textContent) && H.toasts.length === 0, 'history: Source index says the index is not installed ' + hv.textContent.slice(0, 120));

    put('techdoc/history/README.md', '# Historical sources\nhow it began; see [the first page](01-origins.md)\n');
    put('techdoc/history/02-later.md', '# Later years\nwombatine changes\n'); put('techdoc/history/01-origins.md', '# Origins\nthe first engine\n');
    put('techdoc/history/notes.md', '# scratch\nnot a page of the category\n');
    R._setHistory(stub); R.reset();
    s = await call('status');
    ok(s.history.ok && s.history.rows === 121 && s.pub.includes('techdoc/history/01-origins.md') && !s.pub.includes('techdoc/history/notes.md'), 'history: pages are reader files, the index is there');
    ok((await call('list', { set: 'history' })).files.map(x => x.p.split('/').pop()).join() === 'README.md,01-origins.md,02-later.md', 'history: reading order README, numbered pages');
    b = await call('book', { set: 'history' });
    ok(b.chapters.map(x => x.p.split('/').pop()).join() === 'README.md,01-origins.md,02-later.md,source-index' && b.chapters[3].gen && b.parts.join() === 'intro,main,index', 'history: the Source index is the last chapter ' + b.chapters.map(x => x.p).join());
    ok((await call('search', { q: 'wombatine' })).total === 1, 'history: pages are in the default search');
    let g = await post('groups');
    ok(g.ok && g.groups.map(x => x.kind).join() === 'site,site,year,hand,era' && seen.some(x => x[0] === 'available'), 'history: groups by site and year, the Discord group left out ' + g.groups.map(x => x.id).join());
    let rw = await post('rows', { offset: 0, limit: 50 });
    ok(rw.ok && rw.rows.length === 49 && !rw.rows.some(x => /discord/i.test(x.url + x.site)) && rw.total === 121, 'history: Discord rows never shown ' + rw.rows.length);
    ok((await post('text', { id: 'r1' })).text === 'saved words of Old page 1' && await st(post('text', { id: 'dc1' })) === 404 && await st(post('text', { id: 'r50' })) === 404, 'history: saved text, none for Discord or a row without text');

    H = page(); H.scr.refresh(); await tick();
    hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick();
    hv = cls(H.rootEl, 'doc')[0];
    ok(tag(H.rootEl, 'BUTTON').filter(x => x.dataset.p).map(x => x.textContent).join() === 'README.md,01-origins.md,02-later.md,Source index', 'history: list ends with the Source index');
    ok(tag(H.rootEl, 'BUTTON').some(b => b.textContent === 'Read all historical sources' && !b.hidden), 'history: with pages (source tree) the book button is offered');
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    const srow = () => cls(hv, 'srcrow');
    ok(/First-hand and second-hand sources on the Second World War, from the guide index: 121 in all/.test(hv.textContent) && all(hv, x => x.dataset && x.dataset.kind).map(x => x.dataset.kind).join() === 'hand,site,year,era' && /First or second hand:/.test(hv.textContent) && /era: /.test(hv.textContent) && !/Discord/.test(hv.textContent), 'history page: groups by site and by year, no Discord');
    ok(srow().length === 49 && /1 to 49 of 121/.test(hv.textContent) && tag(srow()[0], 'A')[0].getAttribute('target') === '_blank' && tag(srow()[0], 'A')[0].getAttribute('href') === 'https://example.org/p0' && /site-b\.example/.test(srow()[0].textContent) && /saved 2008-05-01/.test(srow()[0].textContent), 'history page: rows with title link, site and date ' + srow().length);
    ok(tag(srow()[0], 'A').length === 2 && /archived copy/.test(srow()[0].textContent), 'history page: archived copy link');
    ok(cls(srow()[0], 'badge').map(x => x.textContent).join() === 'first-hand,diary' && cls(srow()[1], 'badge').length === 0, 'history page: first-hand and kind labels when present');
    const hb = n => tag(hv, 'BUTTON').find(x => x.dataset.go === n);
    hb('hnext').click(); await tick();
    ok(/51 to 100 of 121/.test(hv.textContent) && srow()[0].dataset.id === 'r49' && !hb('hprev').disabled, 'history page: next page ' + srow()[0].dataset.id);
    hb('hprev').click(); await tick();
    tag(hv, 'BUTTON').find(x => x.dataset.g === 'site:a').click(); await tick();
    ok(seen[seen.length - 1][0] === 'rows' && seen[seen.length - 1][1].group === 'site:a' && srow().every(r => /site-a/.test(r.textContent)), 'history page: a site narrows the list');
    const hq = tag(hv, 'INPUT').find(i => /Search the sources/.test(i.getAttribute('placeholder') || ''));
    tag(hv, 'BUTTON').find(x => x.dataset.g === '').click(); await tick();
    hq.value = 'old page 2'; hq.fire('keydown', { key: 'Enter' }); await tick();
    ok(srow().map(r => r.dataset.id).join().startsWith('r2,r20,r21') && seen[seen.length - 1][1].q === 'old page 2', 'history page: search');
    tag(srow()[0], 'BUTTON').find(x => x.dataset.go === 'htext').click(); await tick();
    const rd = cls(hv, 'srcread')[0];
    ok(!rd.hidden && /saved words of Old page 2/.test(rd.textContent) && cls(hv, 'srclist')[0].hidden, 'history page: saved text read in the page');
    hb('hlist').click(); await tick();
    ok(rd.hidden && srow().length > 0, 'history page: back to the list');
    // the whole category as a book: pages, then the Source index drawn in place
    H.scr.refresh(); H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick();
    tag(H.rootEl, 'BUTTON').find(x => x.textContent === 'Read all historical sources').click(); await tick();
    tag(cls(H.rootEl, 'scroll')[0], 'BUTTON').find(x => x.dataset.ci === '3').click(); await tick();
    const hsec = tag(hv, 'SECTION');
    ok(hsec.length === 4 && cls(hsec[3], 'srcidx').length === 1 && /chapter 4 of 4, Source index/.test(cardOf(hv).textContent) && /Index of sources/.test(H.rootEl.textContent), 'history book: the Source index is its last chapter');
    all(hsec[3], x => x.dataset && x.dataset.go === 'alone')[0].click(); await tick();
    ok(!tag(hv, 'SECTION').length && cls(hv, 'srcidx').length === 1, 'history book: the Source index opens alone');
    ok(H.toasts.length === 0, 'history: no error toast ' + H.toasts.join(' / '));
    // the index is there but holds no historical sources
    R._setHistory(Object.assign({}, stub, { available: () => ({ ok: true, dir: 'x', rows: 0, sites: 0 }) })); R.reset();
    H = page(); H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    ok(/holds no historical sources yet/.test(hv.textContent) && !cls(hv, 'srcrow').length, 'history: an index with no sources says so');

    // ---- the WW2 sources, three states (history.js available().ww2): 'full' = Search inside the documents; 'list' = one sentence
    // instead of the box; 'none' = neither. Made-up rows, documents and page text only.
    const WROWS = [
      { id: 'ws1', rec: 'source', title: 'Made-up archive', url: 'https://example.org/archive', nation: 'Nowhere', topic: 'Weapons', sub: 'Guns', hand: 'first', kind: null, pages: 0, class: 'Primary' },
      { id: 'wd1', rec: 'document', title: 'Made-up manual', url: 'https://example.org/archive/m1', nation: 'Nowhere', topic: 'Weapons', hand: 'first', kind: 'manual', designation: 'M-1', issuer: 'Made-up office', year: 1941, pages: 5, parentTitle: 'Made-up archive' },
      { id: 'ri1', rec: 'index', title: 'Guide row', url: 'https://example.org/g', site: 'example.org', hasText: false }];
    const PAGES = { wp7: { n: 3, next: 'wp8', prev: 'wp6', text: 'quollish words on page three' }, wp8: { n: 4, prev: 'wp7', next: null, text: 'numbatty words on page four' } };
    const wseen = [];
    const full = {
      available: () => ({ ok: true, dir: '', built: '', rows: 3, sites: 2, ww2: 'full', ww2Note: 'searchable', sources: 1, docs: 2, pages: 10 }),
      groups: () => [{ id: 'nation:Nowhere', title: 'Nowhere', kind: 'nation', count: 2 }, { id: 'type:manual', title: 'Manual', kind: 'type', count: 1 }, { id: 'hand:first', title: 'First-hand sources', kind: 'hand', count: 2 }],
      rows: o => ({ total: WROWS.length, rows: WROWS.slice(o.offset, o.offset + o.limit) }),
      search: o => { wseen.push(o); if (/\(/.test(o.q)) throw Object.assign(new Error('The search words could not be read as written'), { status: 400 });
        return { total: 2, capped: false, rows: ['wp7', 'wp8'].map(id => ({ id, page: PAGES[id].n, printed: '', tier: 'all words', snippet: '... ' + PAGES[id].text + ' ...', url: 'https://example.org/scan#page=' + PAGES[id].n,
          doc: { title: 'Made-up manual', designation: 'M-1', issuer: 'Made-up office', year: 1941, nation: 'Nowhere', url: 'https://example.org/archive/m1' }, source: { title: 'Made-up archive', url: 'https://example.org/archive' } })) }; },
      text: id => PAGES[id] ? { id, title: 'M-1, Made-up manual, page ' + PAGES[id].n, url: 'https://example.org/scan#page=' + PAGES[id].n, text: PAGES[id].text, page: PAGES[id].n, printed: '', citation: 'Made-up office, M-1 (1941)',
        prev: PAGES[id].prev, next: PAGES[id].next, doc: { title: 'Made-up manual', designation: 'M-1', url: 'https://example.org/archive/m1', pages: 5 } } : null,
    };
    R._setHistory(full); R.reset();
    s = await call('status');
    ok(s.history.ww2 === 'full' && s.history.pages === 10 && s.history.docs === 2, 'ww2 full: status carries the state ' + JSON.stringify(s.history));
    let ws = await post('search', { q: 'quollish', filters: { nation: 'Nowhere', year_from: '1940', bogus: 1 } });
    ok(ws.ok && ws.total === 2 && ws.rows[0].id === 'wp7' && ws.rows[0].page === 3 && /quollish/.test(ws.rows[0].snippet) && ws.rows[0].url === 'https://example.org/scan#page=3' && ws.rows[0].source.title === 'Made-up archive' &&
      wseen[0].filters.nation === 'Nowhere' && wseen[0].filters.year_from === 1940 && !('bogus' in wseen[0].filters), 'ww2 route: search rows and filters ' + JSON.stringify(ws.rows[0]));
    ok(await st(post('search', { q: 'tank (' })) === 400, 'ww2 route: words that cannot be read = 400');
    const tp = await post('text', { id: 'wp7' });
    ok(tp.ok && tp.citation === 'Made-up office, M-1 (1941)' && tp.next === 'wp8' && tp.page === 3 && /quollish/.test(tp.text), 'ww2 route: a page with its citation');
    rw = await post('rows', { offset: 0, limit: 50 });
    ok(rw.rows[1].rec === 'document' && rw.rows[1].pages === 5 && rw.rows[1].parentTitle === 'Made-up archive' && rw.rows[0].nation === 'Nowhere' && rw.rows[0].topic === 'Weapons', 'ww2 route: row fields');
    H = page(); H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    ok(/Search inside the documents/.test(hv.textContent) && /10 pages of 2 documents can be searched\. The text is machine-read: check every figure against the scan before citing it\./.test(hv.textContent) &&
      /from the guide index and the WW2 source list: 3 in all/.test(hv.textContent), 'ww2 page: the search box and the machine-read sentence');
    ok(/Nowhere/.test(srow()[0].textContent) && /Weapons/.test(srow()[0].textContent) && cls(srow()[0], 'badge').map(x => x.textContent).join() === 'first-hand' &&
      /5 pages/.test(srow()[1].textContent) && /part of Made-up archive/.test(srow()[1].textContent) && /M-1/.test(srow()[1].textContent), 'ww2 page: row meta shows nation, class and topic');
    ok(all(hv, x => x.dataset && x.dataset.kind).map(x => x.dataset.kind).join() === 'hand,nation,type' && /By nation:/.test(hv.textContent) && /By document type:/.test(hv.textContent), 'ww2 page: the new group kinds');
    const pq = tag(hv, 'INPUT').find(i => /Words to find in the page text/.test(i.getAttribute('placeholder') || ''));
    pq.value = 'quollish'; pq.fire('keydown', { key: 'Enter' }); await tick();
    const prow = () => cls(hv, 'srcpage');
    ok(prow().length === 2 && /2 pages found for quollish/.test(hv.textContent) && /quollish words on page three/.test(prow()[0].textContent) && /M-1, Made-up manual/.test(prow()[0].textContent) && /page 3/.test(prow()[0].textContent),
      'ww2 page: results with snippet, document and page');
    const pa = tag(prow()[0], 'A');
    ok(pa.length === 2 && pa[0].getAttribute('href') === 'https://example.org/scan#page=3' && pa[0].getAttribute('target') === '_blank' && /from Made-up archive/.test(pa[1].textContent), 'ww2 page: scan and source links');
    tag(prow()[0], 'BUTTON').find(x => x.dataset.go === 'pread').click(); await tick();
    const prd = cls(hv, 'srcread').find(x => !x.hidden);
    ok(prd && /quollish words on page three/.test(prd.textContent) && /Cite as: Made-up office, M-1 \(1941\)/.test(prd.textContent) && /Machine-read text: check every figure/.test(prd.textContent) && cls(hv, 'srcpagelist')[0].hidden,
      'ww2 page: the page reader with its citation');
    tag(prd, 'BUTTON').find(x => x.dataset.go === 'pafter').click(); await tick();
    ok(/numbatty words on page four/.test(hv.textContent) && !tag(cls(hv, 'srcread').find(x => !x.hidden), 'BUTTON').some(x => x.dataset.go === 'pafter'), 'ww2 page: the next page');
    tag(cls(hv, 'srcread').find(x => !x.hidden), 'BUTTON').find(x => x.dataset.go === 'plist').click(); await tick();
    ok(!cls(hv, 'srcpagelist')[0].hidden && prow().length === 2, 'ww2 page: back to the results');
    // searchKit (owner 2026-11-19) on every search box: the wrapper with its history key, the index (/history/titles, the groups,
    // /heads), Browse, and a pick that searches or opens
    const skKeys = all(H.rootEl, x => !!(x.getAttribute && x.getAttribute('data-sk'))).map(x => x.getAttribute('data-sk'));
    ok(['docs.filter', 'docs.search', 'docs.srcidx.q', 'docs.srcidx.pages.q'].every(k => skKeys.includes(k)), 'searchKit: every search box has the kit ' + skKeys.join());
    const skOpt = (inp, rx) => all(inp._sk.list, x => !!(x.getAttribute && x.getAttribute('data-ski') != null) && rx.test(x.textContent))[0];
    pq.value = 'm-1'; pq.fire('input'); await tick(); await tick();
    let so = skOpt(pq, /M-1, Made-up manual/);
    ok(!!so, 'searchKit: the page search suggests the document M-1 from the titles index ' + pq._sk.list.textContent);
    if (so) { pq._sk.list.fire('click', { target: so }); await tick();
      ok(wseen[wseen.length - 1].q === 'M-1' && (H.store['sk.hist.docs.srcidx.pages.q'] || [])[0] === 'M-1', 'searchKit: a picked document searches the page text and is kept in the history'); }
    const hq2 = tag(hv, 'INPUT').find(i => /Search the sources/.test(i.getAttribute('placeholder') || ''));
    hq2.value = 'nowh'; hq2.fire('input'); await tick(); await tick();
    so = skOpt(hq2, /^Nowhere \(2\)/);
    ok(!!so, 'searchKit: the source search suggests the group Nowhere ' + hq2._sk.list.textContent);
    if (so) { hq2._sk.list.fire('click', { target: so }); await tick(); ok(tag(hv, 'BUTTON').find(x => x.dataset.g === 'nation:Nowhere').style.fontWeight === 'bold', 'searchKit: a picked group narrows the list'); }
    const sqIn = all(H.rootEl, x => x.tagName === 'INPUT' && x.getAttribute('aria-label') === H.box.tx('docs.search'))[0];
    sqIn.value = 'origins'; sqIn.fire('input'); await tick(); await tick();
    so = skOpt(sqIn, /^Origins/);
    ok(!!so, 'searchKit: the document search suggests a title from /heads ' + sqIn._sk.list.textContent);
    if (so) { sqIn._sk.list.fire('click', { target: so }); await tick(); await tick(); ok(/the first engine/.test(hv.textContent), 'searchKit: a picked title opens the document'); }
    ok(H.toasts.length === 0, 'ww2 page: no error toast ' + H.toasts.join(' / '));
    ok(!blockProbs(H.rootEl).length, 'blocks: the Source index and its page search stay inside the document leaf\n  ' + blockProbs(H.rootEl).join('\n  '));
    // Browse (owner 2026-11-19: "browse should always be a file directory browse"): every box opens the folder picker where its documents
    // are read from (/where: real paths); a picked .md opens, a file outside the docs is refused, a Source index pick searches its name
    const wh = await call('where');
    ok(path.resolve(wh.root) === path.resolve(root) && !/%USERPROFILE%/.test(wh.root), 'where: the real document root for the picker ' + wh.root);
    let pk = null; H.box.searchKit.picker = (spec, done) => { pk = { spec, done }; };
    const sameDir = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(b).toLowerCase();
    const fq = all(H.rootEl, x => x.tagName === 'INPUT' && x.getAttribute('aria-label') === H.box.tx('docs.filter'))[0];
    fq._sk.browse();
    ok(pk && pk.spec.mode === 'file' && pk.spec.view === 'disk' && (pk.spec.exts || []).join() === 'md' && sameDir(pk.spec.start, path.join(root, 'techdoc', 'history')), 'browse: the list filter opens the picker on the set folder ' + JSON.stringify(pk && pk.spec));
    if (pk) { pk.done(path.join(root, 'techdoc', 'history', '02-later.md'), { view: 'disk', path: path.join(root, 'techdoc', 'history', '02-later.md') }); await tick(); await tick();
      ok(fq.value === '02-later.md' && /wombatine changes/.test(hv.textContent) && (H.store['sk.hist.docs.filter'] || [])[0] === 'techdoc/history/02-later.md', 'browse: a picked document narrows the list and opens ' + fq.value); }
    pk = null; sqIn._sk.browse();
    ok(pk && pk.spec.mode === 'file' && (pk.spec.exts || []).join() === 'md' && path.resolve(pk.spec.start).toLowerCase().indexOf(path.resolve(root).toLowerCase()) === 0, 'browse: the search box opens the picker under the docs folder ' + JSON.stringify(pk && pk.spec));
    if (pk) { const tn = H.toasts.length; pk.done(path.join(outside, 'x.md'), { view: 'disk', path: path.join(outside, 'x.md') }); await tick();
      ok(H.toasts.length === tn + 1 && /not one of the documents/.test(H.toasts[tn]) && /wombatine changes/.test(hv.textContent), 'browse: a file outside the docs is refused with a toast');
      pk.done(path.join(root, 'techdoc', 'history', '01-origins.md'), { view: 'disk', path: path.join(root, 'techdoc', 'history', '01-origins.md') }); await tick(); await tick();
      ok(/the first engine/.test(hv.textContent), 'browse: a document picked from the search box opens'); }
    pk = null; hq2._sk.browse();
    ok(pk && pk.spec.mode === 'file' && sameDir(pk.spec.start, path.join(root, 'techdoc', 'history')), 'browse: the Source index opens the picker where its sources are read from (no WW2 folder here: the history documents) ' + JSON.stringify(pk && pk.spec));
    H.toasts.length = 0;
    // list only: one sentence where the box would be; the route says so too
    R._setHistory(Object.assign({}, full, { available: () => ({ ok: true, rows: 3, sites: 2, ww2: 'list', ww2Note: 'list only here', sources: 1, docs: 2, pages: 0 }) })); R.reset();
    ws = await post('search', { q: 'quollish' });
    ok(ws.ok === false && ws.why === 'list only here' && ws.ww2 === 'list', 'ww2 list: the search route answers plainly');
    H = page(); H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    ok(/comes with the larger download named ARSENAL-<version>-ww2/.test(hv.textContent) && /ARSENAL_WW2_DIR/.test(hv.textContent) && !tag(hv, 'INPUT').some(i => /page text/.test(i.getAttribute('placeholder') || '')),
      'ww2 list: one sentence instead of the search box');
    // none: the guide index's rows only, no WW2 part
    R._setHistory(Object.assign({}, full, { available: () => ({ ok: true, rows: 3, sites: 2, ww2: 'none', ww2Note: '' }) })); R.reset();
    H = page(); H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
    tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
    ok(!/Search inside the documents/.test(hv.textContent) && /from the guide index: 3 in all/.test(hv.textContent), 'ww2 none: no document search');
    // parts: the database in pieces (git layout). The Source index starts the join, shows one line of progress that updates, the list
    // works meanwhile; once done the search box replaces the line without a reload. A failure shows the reason and Try again.
    {
      const J = { state: 'idle', doneMb: 0, totalMb: 934, why: '', ms: 0 }, calls = [];
      const partsAv = () => J.state === 'done' ? full.available() : { ok: true, rows: 3, sites: 2, ww2: 'parts', ww2Note: 'in pieces', sources: 1, docs: 0, pages: 0, partsMb: 934, join: Object.assign({}, J) };
      let startAs = 'running';
      R._setHistory(Object.assign({}, full, { available: partsAv,
        joinStart: o => { calls.push(['start', o]); if (J.state !== 'running') Object.assign(J, { state: startAs, doneMb: startAs === 'running' ? 412 : 0, why: startAs === 'failed' ? 'The piece index.sqlite.007.gz is missing from ' + os.homedir() : '' }); return Object.assign({}, J); },
        joinStatus: () => { calls.push(['status']); return Object.assign({}, J); } }));
      R.reset();
      s = await call('status');
      ok(s.history.ww2 === 'parts' && s.history.partsMb === 934 && s.history.join.state === 'idle', 'ww2 parts: status carries the state ' + JSON.stringify(s.history));
      ws = await post('search', { q: 'quollish' });
      ok(ws.ok === false && ws.why === 'in pieces', 'ww2 parts: the search route answers plainly before the join');
      let jr = await post('joinstatus');
      ok(jr.state === 'idle' && !calls.some(c => c[0] === 'start'), 'ww2 parts: joinstatus starts nothing');
      H = page(); const timers = []; H.box.setTimeout = (f, ms) => { timers.push(f); return timers.length; };
      H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
      tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
      const jline = () => cls(hv, 'srcjoin')[0];
      ok(calls.filter(c => c[0] === 'start').length === 1 && jline() && jline().textContent === 'Putting the document index together: 412 of 934 MB' && srow().length === 3 && timers.length === 1,
        'ww2 parts: opening the Source index starts the join, one progress line, the source list works at once ' + (jline() && jline().textContent));
      jr = await post('join');
      ok(jr.state === 'running' && jr.doneMb === 412 && jr.totalMb === 934, 'ww2 parts: a second start gets the running job ' + JSON.stringify(jr));
      J.doneMb = 700; timers.shift()(); await tick();
      ok(jline().textContent === 'Putting the document index together: 700 of 934 MB' && timers.length === 1 && calls[calls.length - 1][0] === 'status', 'ww2 parts: the line updates from joinstatus');
      Object.assign(J, { state: 'done', doneMb: 934, ms: 41000 }); timers.shift()(); await tick();
      ok(!jline() && /10 pages of 2 documents can be searched/.test(hv.textContent) && timers.length === 0, 'ww2 parts: done, the search box in place of the line');
      const pq2 = tag(hv, 'INPUT').find(i => /Words to find in the page text/.test(i.getAttribute('placeholder') || ''));
      pq2.value = 'quollish'; pq2.fire('keydown', { key: 'Enter' }); await tick();
      ok(cls(hv, 'srcpage').length === 2 && H.toasts.length === 0, 'ww2 parts: search works without a reload');
      jr = await post('joinstatus');
      ok(jr.state === 'done' && jr.history && jr.history.ww2 === 'full' && jr.seconds === 41, 'ww2 parts: joinstatus done carries the new state ' + JSON.stringify(jr));
      // failure: the reason (home folder masked) and Try again
      Object.assign(J, { state: 'idle', doneMb: 0 }); startAs = 'failed';
      jr = await post('join');
      ok(jr.ok === false && jr.state === 'failed' && /index\.sqlite\.007\.gz is missing/.test(jr.why) && !jr.why.includes(os.homedir()), 'ww2 parts: failure named, paths masked ' + jr.why);
      Object.assign(J, { state: 'idle' });
      H = page(); H.box.setTimeout = (f) => { timers.push(f); return 1; };
      H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
      tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
      const again = tag(hv, 'BUTTON').find(b => b.dataset.go === 'jagain');
      ok(/The document index could not be put together: The piece index\.sqlite\.007\.gz is missing/.test(jline().textContent) && again && !again.hidden && srow().length === 3, 'ww2 parts: failure shows the reason and Try again ' + jline().textContent);
      Object.assign(J, { state: 'idle' }); startAs = 'running'; timers.length = 0;
      again.click(); await tick();
      ok(again.hidden && /412 of 934 MB/.test(jline().textContent) && timers.length === 1, 'ww2 parts: Try again starts it again');
      const nj = { available: full.available, groups: full.groups, rows: full.rows, text: full.text, search: full.search };
      R._setHistory(nj); R.reset();
      jr = await post('join');
      ok(jr.ok === false && jr.state === 'none', 'ww2 parts: a history module without join answers plainly');
      // JOBS: the running join is a background job of the footer's list (real registry, tools/gui/joblist.js); Cancel there and Stop on the
      // page are one stop; the job ends when the join does (done, cancelled, failed), also when the status throws
      {
        const JL = require(path.join(__dirname, '..', '..', 'joblist')).create({ keepMs: 600000 }), jctx = { jobs: JL, gameId: () => 'goh' };
        const postC = (k, b) => ext.routes['POST /api/x/docs/history/' + k](new URL('http://127.0.0.1/api/x/docs/history/' + k), b || {}, jctx);
        // the join is polled every 5 ms: wait for the job state it should reach (by time; 60 s backstop: WAIT, the check after it reports)
        const wait = f => require('../../../lib/test/wait').until(f, { who: 'docs test', what: 'join job: ' + String(f).slice(0, 100) }), bgs = () => JL.list().filter(j => j.kind === 'bg');
        const jst = () => JL.get(run[0].id).state;
        let boom = false;
        const stopMod = Object.assign({}, full, { available: partsAv,
          joinStart: o => { calls.push(['start', o]); if (J.state !== 'running') Object.assign(J, { state: startAs, doneMb: 412, why: '' }); return Object.assign({}, J); },
          joinStatus: () => { calls.push(['status']); if (boom) throw new Error('status broke'); return Object.assign({}, J); },
          joinStop: () => { calls.push(['stop']); if (J.state === 'running') J.state = 'stopped'; return Object.assign({}, J); } });
        R._setJoinTick(5);
        // a module without a stop: listed, not cancellable, the page gets no Stop
        Object.assign(J, { state: 'idle', doneMb: 0 }); startAs = 'running';
        R._setHistory(Object.assign({}, stopMod, { joinStop: undefined })); R.reset();
        jr = await postC('join');
        ok(jr.state === 'running' && jr.canStop === false && bgs().length === 1 && bgs()[0].what === 'job.w.docsjoin' && bgs()[0].page === 'docs' && bgs()[0].game === 'goh' && bgs()[0].canCancel === false && bgs()[0].state === 'running' &&
          bgs()[0].done === 412 && bgs()[0].total === 934, 'jobs: the join is a bg job with MB progress; no stop in the module = no Cancel ' + JSON.stringify(bgs()));
        await postC('join'); await postC('joinstatus');
        ok(bgs().length === 1, 'jobs: one job per join, however often the page asks');
        Object.assign(J, { state: 'done', doneMb: 934 }); await wait(() => bgs()[0].state === 'done');
        ok(bgs()[0].state === 'done', 'jobs: the job ends done when the join does');
        // with a stop: Cancel in the list calls it, the job ends cancelled
        Object.assign(J, { state: 'idle', doneMb: 0 }); R._setHistory(stopMod); R.reset(); calls.length = 0;
        jr = await postC('join');
        let run = bgs().filter(j => j.state === 'running');
        ok(jr.canStop === true && run.length === 1 && run[0].canCancel === true, 'jobs: a join that can be stopped is listed with Cancel');
        J.doneMb = 500; await wait(() => JL.get(run[0].id).done === 500);
        ok(JL.get(run[0].id).done === 500, 'jobs: the progress follows the join');
        ok(JL.cancel(run[0].id) === true && calls.some(c => c[0] === 'stop'), 'jobs: Cancel calls the join stop');
        await wait(() => jst() === 'cancelled');
        ok(JL.get(run[0].id).state === 'cancelled', 'jobs: a stopped join ends its job cancelled');
        jr = await postC('joinstatus');
        ok(jr.ok === true && jr.state === 'stopped' && !jr.canStop && bgs().filter(j => j.state === 'running').length === 0, 'jobs: joinstatus says stopped, no new job ' + JSON.stringify(jr));
        // the page's Stop route: the same stop
        Object.assign(J, { state: 'idle', doneMb: 0 }); calls.length = 0;
        await postC('join'); run = bgs().filter(j => j.state === 'running');
        jr = await postC('joinstop');
        ok(calls.some(c => c[0] === 'stop') && jr.state === 'stopped', 'jobs: joinstop stops the join ' + JSON.stringify(jr));
        await wait(() => run.length !== 1 || jst() === 'cancelled');
        ok(run.length === 1 && JL.get(run[0].id).state === 'cancelled', 'jobs: Stop on the page ends the job cancelled too');
        // failed, and a status that throws: ended failed, never left running
        Object.assign(J, { state: 'idle', doneMb: 0 }); await postC('join'); run = bgs().filter(j => j.state === 'running');
        Object.assign(J, { state: 'failed', why: 'piece gone' }); await wait(() => run.length !== 1 || jst() === 'failed');
        ok(run.length === 1 && JL.get(run[0].id).state === 'failed', 'jobs: a failed join ends its job failed');
        Object.assign(J, { state: 'idle', doneMb: 0, why: '' }); await postC('join'); run = bgs().filter(j => j.state === 'running');
        boom = true; await wait(() => run.length !== 1 || jst() === 'failed'); boom = false;
        ok(run.length === 1 && JL.get(run[0].id).state === 'failed' && bgs().filter(j => j.state === 'running').length === 0, 'jobs: a status that throws ends the job failed');
        const rsrc = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
        ok(rsrc.includes('cancel: stop || undefined') && rsrc.includes('const f = joinStopFn();') && rsrc.includes("require('../../../gemindex/lib/ww2')"), 'jobs: Cancel and Stop go through joinStopFn (the real module: lib/ww2 joinStop)');
        // page: Stop shows while the join runs, stops it, the line says stopped with Try again; opening the Source index again does not
        // start a join the user stopped; Try again does
        Object.assign(J, { state: 'idle', doneMb: 0 }); calls.length = 0; timers.length = 0; R.reset();
        H = page(); H.box.setTimeout = (f) => { timers.push(f); return 1; };
        H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
        tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
        const jb = k => tag(hv, 'BUTTON').find(b => b.dataset.go === k);
        ok(jb('jstop') && !jb('jstop').hidden && jb('jstop').textContent === 'Stop' && jb('jagain').hidden && /412 of 934 MB/.test(jline().textContent), 'page: Stop shows while the join runs');
        jb('jstop').click(); await tick();
        ok(calls.some(c => c[0] === 'stop') && jb('jstop').disabled && jline().textContent === 'Stopping...', 'page: Stop asks the server to stop ' + jline().textContent);
        timers.shift()(); await tick();
        ok(/^Stopped\. Nothing is left half done/.test(jline().textContent) && jb('jstop').hidden && !jb('jagain').hidden && timers.length === 0 && srow().length === 3 && H.toasts.length === 0, 'page: stopped: the plain line, Try again, the list still works ' + jline().textContent);
        calls.length = 0;
        H = page(); H.box.setTimeout = (f) => { timers.push(f); return 1; };
        H.scr.refresh(); await tick(); hs = tag(H.rootEl, 'SELECT')[0]; H.scr.view('history'); await tick(); hs.value = 'history'; hs.fire('change'); await tick(); hv = cls(H.rootEl, 'doc')[0];
        tag(H.rootEl, 'BUTTON').find(b => b.textContent === 'Source index').click(); await tick();
        ok(!calls.some(c => c[0] === 'start') && /^Stopped\./.test(jline().textContent) && !jb('jagain').hidden, 'page: a stopped join is not started again by opening the Source index ' + JSON.stringify(calls.map(c => c[0])));
        jb('jagain').click(); await tick();
        ok(calls.some(c => c[0] === 'start') && /412 of 934 MB/.test(jline().textContent) && jb('jagain').hidden && !jb('jstop').hidden, 'page: Try again after a stop starts the join');
        // a job list Cancel while the page polls: the next poll shows the same stopped state
        J.state = 'stopped'; timers.shift()(); await tick();
        ok(/^Stopped\./.test(jline().textContent) && jb('jstop').hidden && !jb('jagain').hidden, 'page: stopped from the job list reads the same');
        ok(ext.script.includes("start?wn('docs.srcidx.join.name'):{job:false}") && ext.script.includes("api('/api/x/docs/history/joinstop',{},{job:false})"), 'page: the joinstatus poll and the stop call stay out of the job list');
        ok(["undefined,wn('docs.search.go')).then", "limit:PPAGE},wn('docs.srcidx.pages.head')", "limit:HPAGE},wn('docs.srcidx.title')"].every(x => ext.script.includes(x)) && ext.script.split("wn('docs.search.go')").length === 3, 'page: search, book search and the history searches name their request');
        ok(ext.script.includes("function errT(e){return e&&e.cancelled?e.message:tx('docs.err',{m:e.message})}") && ext.script.split('errT(e)').length >= 7, 'page: a stopped request shows the plain word');
        for (const k of ['name', 'stop', 'stopping', 'stopped']) for (const l of ['en', 'ru', 'uk', 'zh']) ok(require('./lang')[l]['docs.srcidx.join.' + k], 'join string ' + l + ' ' + k);
        R._setJoinTick(500);
        // the real history module (no test module set): the stop reaches lib/ww2 joinStop and is harmless with no join running
        R._setHistory(null); R.reset();
        jr = await post('joinstop');
        ok(jr && (jr.state !== 'running' || jr.canStop), 'jobs: joinstop with nothing running does nothing ' + JSON.stringify(jr));
      }
    }
    const L = require('./lang');
    const miss = Object.keys(L.en).filter(k => /^docs\.srcidx\.(pages|what\.ww2|by\.(nation|access|type|issuer)|npages|partof)/.test(k) && ['ru', 'uk', 'zh'].some(l => !L[l][k]));
    ok(!miss.length && Object.keys(L.en).filter(k => /^docs\.srcidx\.pages\./.test(k)).length === 13, 'ww2 strings in en, ru, uk, zh ' + miss.join());
    R._setHistory(null); R.reset();
  }

  // ---- U2 (W6): the packaged GUI. A fake release folder (what zip.js ships beside ARSENAL.exe) and the locator told it runs as
  // that exe (no env override, exe folder = the package, SEA = true). Every set lists, pages render, links resolve, the PDF opens.
  {
    const pkg = path.join(work, 'pkg', 'ARSENAL-0.1.0'), P = (rel, t) => put(rel, t, pkg);
    P('START-HERE.md', '# START HERE\nread [the guide](guide/README.md)\n');
    P('guide/README.md', '# Modding guide\nPart I starts at [first mod](p01-first-mod.md), Part III at [r01](r01-mod-info.md)\n');
    P('guide/p01-first-mod.md', '# First mod\nnext: [chapter one](01-getting-started.md), the [start page](../START-HERE.md)\n');
    P('guide/01-getting-started.md', '# Getting started\nPart II\n');
    P('guide/r01-mod-info.md', '# mod.info\nPart III\n');
    fs.mkdirSync(path.join(pkg, 'guide', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'guide', 'dist', 'AS2-Modding-Guide-v2.0.pdf'), '%PDF-1.4\n%%EOF\n');
    P('techdoc/engine/README.md', '# The engine\nsee [architecture](01-architecture.md) and [faults](A-faults.md)\n');
    P('techdoc/engine/01-architecture.md', '# Architecture\nback to [the start](README.md)\n');
    P('techdoc/engine/A-faults.md', '# Suspected faults\n');
    P('techdoc/history/README.md', '# Historical sources\n');
    put('outside.md', 'x', path.join(work, 'pkg'));   // beside the package folder, not in it
    fs.writeFileSync(path.join(pkg, 'ARSENAL-gui.exe'), '');
    const saveA = process.env.AS2_DOCS_ROOT, saveB = process.env.ARSENAL_DOCS;
    delete process.env.AS2_DOCS_ROOT; delete process.env.ARSENAL_DOCS;
    R._setExeDir({ dir: pkg, sea: true }); R._setHistory(null);
    ok(R.candidates()[0] === pkg, 'pkg: the exe folder is the first place looked ' + R.candidates()[0]);
    let st = null, err = null; try { st = await call('status'); } catch (e) { err = e; }
    ok(st && st.found && !err && R.candidates().indexOf(pkg) === 0, 'pkg: status found the package root ' + (err && err.message));
    const ids = st ? st.sets.map(x => x.id) : [];
    ok(['here', 'guide', 'engine', 'history'].every(i => ids.includes(i)), 'pkg: start page, guide, engine and history listed ' + ids.join());
    ok(!['start', 'modweb', 'limits', 'codemap', 'refmods', 'tools', 'plan'].some(i => ids.includes(i)), 'pkg: maintainer sets absent, no error');
    ok(st && st.pub[0] === 'START-HERE.md' && st.source === false && st.edition === 'public', 'pkg: public edition, start page first');
    const bk = await call('book', { set: 'guide' });
    ok(bk.found && bk.parts.join() === 'intro,process,detail,ref' && bk.chapters.length === 4, 'pkg: guide book has Parts I, II, III ' + bk.parts.join());
    ok(bk.pdf && bk.pdf.name === 'AS2-Modding-Guide-v2.0.pdf', 'pkg: the guide PDF is seen');
    const eb = await call('book', { set: 'engine' });
    ok(eb.found && eb.chapters.map(c => c.p).join() === 'techdoc/engine/README.md,techdoc/engine/01-architecture.md,techdoc/engine/A-faults.md', 'pkg: engine document in reading order');
    let f = await call('file', { p: 'START-HERE.md' });
    ok(f.found && f.title === 'START HERE', 'pkg: start page renders');
    f = await call('file', { p: '01-getting-started.md', from: 'guide/p01-first-mod.md' });
    ok(f.found && f.p === 'guide/01-getting-started.md', 'pkg: a cross-page link inside the guide resolves');
    f = await call('file', { p: '../START-HERE.md', from: 'guide/p01-first-mod.md' });
    ok(f.found && f.p === 'START-HERE.md', 'pkg: a link from the guide back to the start page resolves');
    f = await call('file', { p: '01-architecture.md', from: 'techdoc/engine/README.md' });
    ok(f.found && f.set === 'engine', 'pkg: an engine page renders from its link');
    for (const p of ['../outside.md', 'guide/../../outside.md', path.join(work, 'pkg', 'outside.md'), '../ARSENAL-0.1.0/START-HERE.md/../../outside.md']) {
      let r = null, e = null; try { r = await call('file', { p, from: 'guide/README.md' }); } catch (x) { e = x; }
      ok(e && e.status === 404 && !r, 'pkg: traversal refused ' + p);
    }
    let spawned = null; R._setSpawn((cmd, args) => { spawned = args[0]; return {}; });
    const po = await ext.routes['POST /api/x/docs/pdf'](new URL('http://127.0.0.1/api/x/docs/pdf'), {}, {});
    ok(po.ok && spawned === path.join(pkg, 'guide', 'dist', 'AS2-Modding-Guide-v2.0.pdf') && /\.pdf$/.test(spawned), 'pkg: the PDF route opens the package PDF ' + spawned);
    R._setSpawn(null);
    let hs = null; err = null; try { hs = (await call('status')).history; await call('book', { set: 'history' }); } catch (e) { err = e; }
    ok(!err && hs, 'pkg: no ww2sources folder: history answers without an error ' + (err && err.message));
    // without the engine folder (an older release) the set is simply not there
    fs.rmSync(path.join(pkg, 'techdoc', 'engine'), { recursive: true, force: true }); R.reset();
    st = await call('status');
    ok(st.found && !st.sets.some(x => x.id === 'engine') && st.sets.some(x => x.id === 'guide'), 'pkg: engine absent, no error');
    // an exe built inside the source tree (tools/dist/out/ARSENAL-gui.exe) finds the source tree above it
    const srcT = path.join(work, 'srct');
    put('tools/test-all.sh', '#', srcT); put('guide/01-getting-started.md', '# g\n', srcT); put('modweb/INDEX.md', '# m\n', srcT);
    fs.mkdirSync(path.join(srcT, 'tools', 'dist', 'out'), { recursive: true });
    R._setExeDir({ dir: path.join(srcT, 'tools', 'dist', 'out'), sea: true });
    st = await call('status');
    ok(st.found && R.candidates().includes(srcT) && st.sets.some(x => x.id === 'modweb'), 'pkg: exe in tools/dist/out finds the source tree');
    // ARSENAL_DOCS names the root and nothing else
    process.env.ARSENAL_DOCS = pkg; R.reset();
    ok(R.candidates().length === 1 && R.candidates()[0] === pkg && (await call('status')).found, 'ARSENAL_DOCS: that folder only');
    R._setExeDir(null);
    if (saveA != null) process.env.AS2_DOCS_ROOT = saveA; if (saveB != null) process.env.ARSENAL_DOCS = saveB; else delete process.env.ARSENAL_DOCS;
    R.reset();
  }

  if (linked) { try { fs.rmdirSync(path.join(root, 'guide', 'out')); } catch (e) { /* leave it */ } }
  console.log(bad ? bad + ' failures of ' + n : 'docs ext PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL ' + (x.stack || x)); process.exit(1); });
