// guides ext test. Arg: scratch dir. Fixture from tools/gemindex/test/mkfixture.js; no game, no network.
// Author: Imperator_Aug (ARSENAL, ia-385f6619)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'guidesx-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const data = require(path.join(__dirname, '..', '..', '..', 'gemindex', 'test', 'mkfixture')).make(path.join(work, 'fx', 'data'));  // path form: tests are not embedded in the exe
const ext = require('./index');
const routes = ext.routes;
const game = path.join(work, 'game'); fs.mkdirSync(game, { recursive: true });
// JOBS: the real registry (tools/gui/joblist.js), as gui.js hands it to every route
const JL = require(path.join(__dirname, '..', '..', 'joblist')).create({ keepMs: 600000 });
const ctx = { game: () => game, allowLaunch: false, jobs: JL, gameId: () => 'mowas2' };
const get = (n, qs) => routes['GET /api/x/guides/' + n](new URL('http://x/api/x/guides/' + n + (qs || '')), null, ctx);
const post = (n, body) => routes['POST /api/x/guides/' + n](new URL('http://x/api/x/guides/' + n), body, ctx);
const st = async p => { try { await p; return 0; } catch (x) { return x.status || -1; } };
const qd = d => '?dir=' + encodeURIComponent(d);
// structure rules of tools/gui/test/blockcheck.js (checkScreen), for the state the page reaches after server replies
const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const checkScreen = sec => (sec.all().filter(isB).length < 10 ? ['fewer than 10 blocks'] : []).concat(BC.checkScreen(sec, 'guides'));

(async () => {
  // ext shape + script rules + 4 languages
  ok(ext.id === 'guides' && ext.nav === 'guides.nav' && ext.adv === false && ext.after === 'help', 'ext shape');
  ok(!/\x60|\$\{|innerHTML/.test(ext.script), 'script: no backtick, dollar-brace, innerHTML');
  ok(/EXT_SCREENS\.guides=function\(root\)/.test(ext.script), 'script sets EXT_SCREENS.guides');
  try { new vm.Script('(function(){' + ext.script + '})'); } catch (x) { ok(false, 'script parses: ' + x.message); }
  const L = ext.lang;
  for (const k of Object.keys(L.en)) {
    ok(k.startsWith('guides.'), 'lang key prefix ' + k);
    for (const c of ['ru', 'uk', 'zh']) ok(L[c] && L[c][k] && (L[c][k] !== L.en[k] || !/\s/.test(L.en[k])), 'lang ' + c + ' ' + k);
  }
  const used = [...new Set((ext.script.match(/tx\('guides\.[\w.]+'\)|tx\('guides\.[\w.]+',/g) || []).map(x => x.replace(/^tx\('|'[,)]$/g, '')))];
  ok(used.length > 40 && used.every(k => L.en[k]), 'every tx key exists: ' + used.filter(k => !L.en[k]).join(','));
  for (const t of ['all', 'guides', 'tools', 'history', 'less']) ok(L.en['guides.f.tab.' + t], 'tab label ' + t);
  for (const t of ['search', 'faq', 'tools', 'gaps', 'sources', 'update']) ok(L.en['guides.tab.' + t], 'pane label ' + t);
  for (const k of ['index', 'foreign', 'wayback', 'discord', 'added', 'other']) ok(L.en['guides.src.o.' + k], 'origin label ' + k);
  for (const k of ['guides.pv.src.own', 'guides.pv.src.builtin']) ok(L.en[k] && ext.script.includes("'" + k + "'"), 'text source label ' + k);
  ok(/value:'history'|\['history',/.test(ext.script) && /archived:fArch/.test(ext.script), 'script: History in the tab filter, archived checkbox');
  ok(/update\/plan/.test(ext.script) && /update\/start',\{dir:G\.dir,token:U\.plan\.token\}/.test(ext.script) && /update\/stop/.test(ext.script), 'script: start sends the dry-run token');

  // status found / not found / broken / relative
  let s = await get('status', qd(data));
  ok(s.found && s.rows === 20 && s.tabs.guides === 6 && s.pages === 3 && s.facets.games.length && s.facets.comps.length && s.facets.langs.includes('ru'), 'status found ' + JSON.stringify([s.rows, s.tabs, s.pages]));
  s = await get('status', qd(path.join(work, 'nothing')));
  ok(s.found === false && s.tried.length >= 1 && s.defaultDir, 'status not found');
  const brk = path.join(work, 'brk'); fs.mkdirSync(brk, { recursive: true }); fs.writeFileSync(path.join(brk, 'guides.json'), '{"rows": [');
  s = await get('status', qd(brk));
  ok(s.found === false && /does not parse/.test(s.broken || ''), 'status broken guides.json');
  ok(await st(get('status', '?dir=relative/x')) === 400, 'status relative dir refused');

  // search / show / faq / tools
  let r = await post('search', { dir: data, q: 'editor' });
  ok(r.total >= 1 && r.rows.every(x => !x.discord) && r.rows.every(x => typeof x.hasText === 'boolean'), 'search: discord hidden, hasText set');
  ok((await post('search', { dir: data, q: 'editor', discord: true })).total === r.total + 1, 'search: include discord');
  r = await post('search', { dir: data, q: 'zorkleberry', text: 'true' });
  ok(r.total === 1 && /zorkleberry/.test(r.rows[0].snippet), 'search: page text');
  ok((await post('search', { dir: data, tab: 'tools', game: 'as2rel' })).total >= 1, 'search: tab+game');
  ok(await st(post('search', { dir: path.join(work, 'nothing') })) === 404, 'search: missing index 404');
  const sh = await post('show', { dir: data, id: 'aaaaaaaaaaa3' });
  ok(sh.hasText && /mono wav/.test(sh.text), 'show page');
  ok(await st(post('show', { dir: data, id: 'nope' })) === 400, 'show unknown 400');
  ok((await post('faq', { dir: data })).rows.length === 2 && (await post('faq', { dir: data, discord: true })).rows.length === 3, 'faq + discord');
  // the searchKit index: each title carries p, the name of its saved page text (text/<p>.txt), so a text picked with Browse finds its title
  const ti = await post('titles', { dir: data });
  ok(ti.rows.length > 0 && ti.rows.every(x => /^[0-9a-f]{12}$/.test(x.p)), 'titles: rows carry their page text name p');
  const tl = await post('tools', { dir: data });
  ok(tl.groups.length === 3 && tl.groups[0].rows.length === 2, 'tools by sub');

  // gaps with and without the index, localized
  let g = await get('gaps', qd(data) + '&lang=ru');
  ok(g.indexed && g.gaps.length === 8 && /[а-я]/.test(g.gaps[0].what) && /ARSENAL/.test(g.linkNote), 'gaps ru with index');
  g = await get('gaps', qd(path.join(work, 'nothing')) + '&lang=xx');
  ok(!g.indexed && g.gaps.length === 8 && /[a-z]/.test(g.gaps[0].what), 'gaps without index, bad lang -> en');
  ok(g.gaps.every(x => x.ai.length && ['art', 'maps', 'units', 'logs', 'models'].includes(x.page)), 'gaps: ai + page');

  // history, archives, sources
  s = await get('status', qd(data));
  ok(s.history === 0 && s.archivedRows === 2 && s.ownPages === 0, 'status: history 0, archived 2 ' + JSON.stringify([s.history, s.archivedRows]));
  ok((await post('search', { dir: data, tab: 'history' })).total === 0, 'search: history tab (category history only)');
  r = await post('search', { dir: data, archived: true });
  ok(r.total === 2 && r.rows.every(x => x.archiveUrl && x.captured), 'search: archived only, rows carry capture date');
  const sa = await post('show', { dir: data, id: 'aaaaaaaaaaa2' });
  ok(sa.archive && sa.archive.original === 'http://example.invalid/t/1' && sa.archive.captured === '2015' && sa.textSource && sa.textSource.which === 'builtin', 'show: archive address, capture date, text source');
  const so = await post('sources', { dir: data });
  ok(so.rows === 20 && so.archives.rows === 2 && so.origins.some(x => x.source === 'wayback') && so.pageSources.length === 2, 'sources');

  // update the index: dry run first (token), start only with it, a picked folder only. Test mode: any non-local host is refused, so nothing goes online.
  process.env.GEMINDEX_TEST_LOCAL = '1';
  ok(await st(post('update/plan', { mode: 'missing' })) === 400, 'update plan: needs a picked folder');
  const pl = await post('update/plan', { dir: data, mode: 'missing', limit: 3 });
  ok(pl.token && pl.count === 3 && pl.skipped.overLimit > 0 && Object.keys(pl.hosts).length >= 1 && pl.rows.length === 3 && !fs.existsSync(path.join(data, 'scrape')), 'update plan: dry, 3 rows, nothing written ' + JSON.stringify([pl.count, pl.hosts]));
  ok(await st(post('update/start', { dir: data })) === 400 && await st(post('update/start', { dir: data, token: 'nope' })) === 400, 'update start: refused without the dry-run token');
  ok(await st(post('update/start', { dir: path.join(work, 'fx2'), token: pl.token })) === 400, 'update start: refused for another folder');
  const pl2 = await post('update/plan', { dir: data, mode: 'missing', limit: 3 });
  ok(await st(post('update/start', { dir: data, token: pl.token })) === 400, 'update start: an older plan is void');
  const sr = await post('update/start', { dir: data, token: pl2.token });
  ok(sr.started, 'update start');
  ok(await st(post('update/start', { dir: data, token: pl2.token })) === 400, 'update start: one run at a time, token used once');
  let pg; for (let i = 0; i < 100; i++) { pg = await get('update/progress'); if (!pg.running) break; await new Promise(z => setTimeout(z, 50)); }
  ok(!pg.running && pg.result && pg.result.saved === 3 && pg.result.requests === 0 && pg.log.length, 'update: finished, no request left this machine ' + JSON.stringify(pg.result || pg.error));
  const files = require(path.join(__dirname, '..', '..', '..', 'gemindex', 'lib', 'bundle')).walk(data, '', []);
  ok(files.filter(f => !f.startsWith('scrape/')).sort().join() === 'builtin/builtin-faq.json,builtin/builtin-pages.pack,guides.json', 'update writes only in <folder>/scrape');
  ok((await post('update/stop', {})).running === false, 'update stop when idle');
  // JOBS: the update is a background job of the footer's list (name key, page, progress), ended when it ends
  let bg = JL.list().filter(j => j.kind === 'bg');
  ok(bg.length === 1 && bg[0].what === 'job.w.guides' && bg[0].page === 'guides' && bg[0].game === 'mowas2' && bg[0].state === 'done' && bg[0].done === 3 && bg[0].total === 3 && bg[0].writes === false,
    'jobs: the update was a bg job, ended done with its progress ' + JSON.stringify(bg));
  ok(JL.cancel(bg[0].id) === false, 'jobs: a finished update cannot be cancelled');
  // Cancel in the job list = the page's Stop: the run ends stopped, the job cancelled; pages saved so far stay
  const pl3 = await post('update/plan', { dir: data, mode: 'missing', limit: 3 });
  ok(pl3.count >= 1, 'update plan: more rows left for a second run');
  await post('update/start', { dir: data, token: pl3.token });
  const run2 = JL.list().filter(j => j.kind === 'bg' && j.state === 'running');
  ok(run2.length === 1 && run2[0].canCancel === true, 'jobs: a running update can be cancelled ' + JSON.stringify(run2));
  ok(run2.length === 1 && JL.cancel(run2[0].id) === true, 'jobs: cancel reaches the update');
  for (let i = 0; i < 100; i++) { pg = await get('update/progress'); if (!pg.running) break; await new Promise(z => setTimeout(z, 50)); }
  ok(!pg.running && pg.result && pg.result.stopped === true && pg.result.saved < pl3.count, 'jobs: the cancelled update ended stopped ' + JSON.stringify(pg.result || pg.error));
  ok(run2.length === 1 && JL.get(run2[0].id).state === 'cancelled', 'jobs: its job ended cancelled');
  // the same stop from the page's own button (update/stop), and a failure: the job ends every time
  const pl4 = await post('update/plan', { dir: data, mode: 'missing', limit: 3 });
  await post('update/start', { dir: data, token: pl4.token });
  ok((await post('update/stop', {})).running === true, 'update stop while running: asked');
  for (let i = 0; i < 100; i++) { pg = await get('update/progress'); if (!pg.running) break; await new Promise(z => setTimeout(z, 50)); }
  ok(pg.result && pg.result.stopped === true && JL.list().filter(j => j.kind === 'bg' && j.state === 'running').length === 0 && JL.list().filter(j => j.state === 'cancelled').length === 2, 'jobs: Stop on the page ends the job cancelled too');
  ok(await post('update/start', { dir: data, token: pl4.token }).then(() => false, x => x.status === 400) && JL.list().filter(j => j.state === 'running').length === 0, 'jobs: a refused start leaves no job');
  const rsrc = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
  ok(rsrc.includes('function stopUpdate()') && rsrc.includes('cancel: stopUpdate') && rsrc.includes("update/stop': async () => { stopUpdate();"), 'jobs: Cancel and Stop are one function');
  // page: chained calls carry a name for the job list; a stopped request is not a red error
  ok(["function wn(k){return {what:tx('guides.nav')", "search',b,wn(", "sources',{dir:G.dir},wn(", "undefined,wn('guides.tab.gaps')", "wn('guides.up.try')"].every(x => ext.script.includes(x)), 'page: search, sources, gaps and the dry run name their request');
  ok(ext.script.includes('if(e&&e.cancelled){note(p,e.message);return}'), 'page: a stopped request shows the plain stopped state');
  delete process.env.GEMINDEX_TEST_LOCAL;

  // export: dry count, write, refusals
  const outDir = path.join(work, 'out'); fs.mkdirSync(outDir, { recursive: true });
  let e = await post('export', { dir: data, fmt: 'md', filter: { tab: 'guides' } });
  ok(e.dry && e.count === 6 && fs.readdirSync(outDir).length === 0, 'export dry count');
  e = await post('export', { dir: data, fmt: 'csv', filter: { tab: 'guides' }, folder: outDir });
  ok(!e.dry && e.count === 6 && fs.existsSync(e.out) && path.dirname(e.out) === outDir, 'export writes');
  const e2 = await post('export', { dir: data, fmt: 'csv', filter: { tab: 'guides' }, folder: outDir });
  ok(e2.out !== e.out && fs.existsSync(e.out) && fs.existsSync(e2.out), 'export never overwrites');
  ok(await st(post('export', { dir: data, folder: 'rel' })) === 400, 'export relative refused');
  ok(await st(post('export', { dir: data, folder: path.join(work, 'nope') })) === 400, 'export missing folder refused');
  ok(await st(post('export', { dir: data, folder: game })) === 400, 'export game folder refused');
  const steam = path.join(work, 'steamapps', 'common'); fs.mkdirSync(steam, { recursive: true });
  ok(await st(post('export', { dir: data, folder: steam })) === 400, 'export steamapps refused');
  // I-22: by content, whatever game is set: another AS2 install, a GoH folder
  const gB = path.join(work, 'gameB'), goh = path.join(work, 'gohx');
  fs.mkdirSync(path.join(gB, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gB, 'as64.exe'), '');
  fs.mkdirSync(path.join(goh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
  for (const d of [path.join(gB, 'resource'), goh]) ok(await st(post('export', { dir: data, folder: d })) === 400 && !fs.readdirSync(d).some(f => /^gem-index-/.test(f)), 'export refused by content: ' + d);
  // game parity: the GoH install set in the GUI (ctx.gohDir) is a game folder too, even a subfolder that holds no exe
  { const gs = path.join(work, 'gohset'), sub = path.join(gs, 'docs'); fs.mkdirSync(sub, { recursive: true });
    const r = await routes['POST /api/x/guides/export'](new URL('http://x/api/x/guides/export'), { dir: data, folder: sub }, Object.assign({}, ctx, { gohDir: () => gs })).then(() => 'wrote', e => e.status + ' ' + e.message);
    ok(/^400 Pick a folder outside the game folder/.test(r) && !fs.readdirSync(sub).length, 'export: a folder inside the GoH install (ctx.gohDir) refused ' + r); }
  ok(await st(post('export', { dir: data, folder: data })) === 400 &&!fs.readdirSync(data).some(f => /^gem-index-/.test(f)), 'export index folder refused');

  // ---- the page in a fake DOM (blocks,: loaded state of every pane follows the rules of test-blocks.js
  {
    const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const REPLY = {
      status: { found: true, dir: 'D:/idx', built: '2026', rows: 20, pages: 3, facets: { games: [{ code: 'as2', name: 'AS2', n: 3 }], comps: [{ comp: 'Maps', subs: ['Editor'] }], langs: ['en', 'ru'] } },
      search: { total: 2, shown: 2, rows: [{ id: 'a', url: 'https://x.invalid/a', title: 'A', tab: 'guides', game: 'as2', comp: 'Maps', discord: true, archiveUrl: 'https://web.archive.org/x', captured: '2015', hasText: true, note: 'n', snippet: 's' }, { id: 'b', url: 'ftp://b', title: 'B', tab: 'tools' }] },
      show: { title: 'A', url: 'https://x.invalid/a', archive: { original: 'o', captured: '2015', archiveUrl: 'https://web.archive.org/x' }, copySnapshot: '20150101', textSource: { which: 'own' }, hasText: true, text: 'page text', more: true },
      export: { count: 2, fmt: 'csv', out: 'D:/out/x.csv' },
      faq: { rows: [{ game: 'as2', q: 'Q', a: 'A', sourceName: 's', sourceUrl: 'https://s.invalid' }] },
      tools: { groups: [{ sub: 'Editor', rows: [{ url: 'https://t.invalid', title: 'T', discord: true, game: 'as2' }] }] },
      gaps: { linkNote: 'n', indexed: true, aiNote: 'ai', gaps: [{ title: 'G', what: 'w', guides: [{ url: 'https://g.invalid', title: 'g', game: 'as2', sub: 's', discord: true }], tools: [], after: 'a', page: 'maps', ai: [{ name: 'n', what: 'w', hint: 'h' }] }] },
      sources: { origins: [{ rows: 3, source: 'index', withText: 1 }], archives: { rows: 1, sites: 1, firstYear: 2010, lastYear: 2015, withText: 1, forums: { f: 1 } }, history: 0, siteCount: 1, sites: [{ rows: 1, site: 's', archived: 1, withText: 1 }], discordServers: [{ name: 'd', rows: 1 }], pageSources: [{ pages: 3, where: 'w' }, { missing: true }] },
      'update/progress': { running: false, result: { saved: 1, later: 0, verdicts: { ok: 1 } }, log: ['l'] },
      'update/plan': { count: 1, hosts: { 'x.invalid': 1 }, minSeconds: 2, skipped: { known: 0, overLimit: 0 }, rows: [{ kind: 'k', url: 'https://x.invalid', title: 't' }], token: 't' },
    };
    const run = (status, S, extra) => {
      const doc = make(), box = Object.assign({
        S: S || { view: {} },
        document: doc, EXT_SCREENS: {}, LANG: 'en', LS: { get: (k, d) => d, set: () => {} }, setTimeout: () => 0, clearTimeout: () => {},
        tx: (k, p) => { const s = L.en[k]; return s == null ? k : s.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
        toast: () => {}, show: () => {}, pick: (kind, cur, cb) => cb('D:/idx'),
        api: u => { const n = String(u).replace(/^\/api\/x\/guides\//, '').split('?')[0]; return Promise.resolve(JSON.parse(JSON.stringify(n === 'status' ? status : REPLY[n] || {}))); },
      }, extra || {});
      const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];   // the real block helpers of page.js, bound to this fake DOM
      box.requestAnimationFrame = f => f();
      vm.runInNewContext(BC.kitSrc() + '\n' + ext.script, box);   // the page's real searchKit in front of the script
      const root = doc.createElement('section'); root.setAttribute('data-id', 'guides');
      const scr = box.EXT_SCREENS.guides(root); scr.focus();   // the first show (show0: refresh, then focus): the index status is asked now, not while the page is built
      return { root, scr, box };
    };
    const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(z => setImmediate(z)); };
    const btn = (root, k) => root.all().filter(e => e.tagName === 'BUTTON' && e.textContent === L.en[k]);
    const blkOf = (root, id) => root.all().find(e => e.dataset && e.dataset.blk === id);
    REPLY.titles = { rows: [{ t: 'Map editor basics', tab: 'guides', g: 'AS2', c: 'Maps', s: 'Editor', p: '0123456789ab' }], faq:[{ q: 'How do I open the map editor?', c: 'Maps', g: 'AS2' }] };
    const A = run(REPLY.status); await tick();
    // searchKit (owner 2026-11-19) on both search boxes: index from /titles, a pick searches
    {
      const keys = A.root.all().filter(e => e.getAttribute && e.getAttribute('data-sk')).map(e => e.getAttribute('data-sk'));
      ok(keys.includes('guides.search') && keys.includes('guides.faq'), 'searchKit: both search boxes have the kit ' + keys.join());
      const w = A.root.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'text');
      w.value = 'map ed'; w.fire('input'); await tick();
      const o = w._sk.list.all().find(e => e.getAttribute && e.getAttribute('data-ski') != null && /Map editor basics/.test(e.textContent));
      ok(!!o, 'searchKit: a title from the index is suggested ' + w._sk.list.textContent);
      if (o) { w._sk.list.fire('click', { target: o }); await tick(); ok(w.value === 'Map editor basics' && blkOf(A.root, 'search.res').has('A'), 'searchKit: a picked title searches'); }
      // Browse (owner 2026-11-19: "browse should always be a file directory browse"): the picker on the guide index folder; a picked
      // saved page text puts its row's title in the box, another file its name
      let pk = null; A.box.searchKit.picker = (spec, done) => { pk = { spec, done }; };
      w.value = ''; w._sk.browse();
      ok(pk && pk.spec.mode === 'file' && pk.spec.view === 'disk' && pk.spec.start === 'D:/idx', 'browse: the search box opens the picker on the index folder ' + JSON.stringify(pk && pk.spec));
      if (pk) { pk.done('D:/idx/pages/text/0123456789ab.txt', { view: 'disk', path: 'D:/idx/pages/text/0123456789ab.txt' }); await tick();
        ok(w.value === 'Map editor basics', 'browse: a picked page text gives its title ' + w.value);
        pk.done('D:/idx/guides.json', { view: 'disk', path: 'D:/idx/guides.json' }); await tick(); ok(w.value === 'guides', 'browse: another file gives its name ' + w.value); }
      const fw = A.root.all().find(e => e.getAttribute && e.getAttribute('data-sk') === 'guides.faq').children[0];
      pk = null; fw._sk.browse();
      ok(pk && pk.spec.start === 'D:/idx', 'browse: the FAQ box opens the same folder');
    }
    A.root.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'text').value = 'editor';
    blkOf(A.root, 'search.q').all().find(e => e.tagName === 'BUTTON').click(); await tick();
    btn(A.root, 'guides.btn.preview')[0].click(); await tick();
    btn(A.root, 'guides.ex.check')[0].click(); await tick();
    ok(!blkOf(A.root, 'search.export').hidden && !btn(A.root, 'guides.ex.pick')[0].disabled && blkOf(A.root, 'search.res').has('page text'), 'page: results, preview inside the results leaf, export counted');
    for (const k of ['faq', 'tools', 'gaps', 'sources']) { btn(A.root, 'guides.tab.' + k)[0].click(); await tick(); }
    btn(A.root, 'guides.dir.change')[0].click(); await tick();
    btn(A.root, 'guides.tab.update')[0].click(); await tick();
    btn(A.root, 'guides.up.try')[0].click(); await tick();
    ok(blkOf(A.root, 'update.need').hidden && !blkOf(A.root, 'update.btns').hidden && !btn(A.root, 'guides.up.start')[0].disabled && blkOf(A.root, 'update.prog').has(L.en['guides.up.results']), 'page: update pane with a folder, dry run lets Start on');
    btn(A.root, 'guides.tab.update')[0].click(); await tick();
    ok(btn(A.root, 'guides.up.start')[0].disabled && blkOf(A.root, 'update.plan').textContent === '', 'page: update pane opens fresh again');
    let pr = checkScreen(A.root);
    ok(!pr.length, 'page blocks, loaded state:\n  ' + pr.slice(0, 20).join('\n  '));
    const B = run({ found: false, tried: ['D:/a'], broken: 'bad json' }); await tick();
    pr = checkScreen(B.root);
    ok(!blkOf(B.root, 'nf').hidden && btn(B.root, 'guides.tab.search')[0].disabled && !blkOf(B.root, 'gaps').hidden && blkOf(B.root, 'update.need').hidden === false, 'page: index not found card, gaps pane open');
    ok(!pr.length, 'page blocks, index not found:\n  ' + pr.slice(0, 20).join('\n  '));
    // view(v): show('guides','tools') lands on that inner tab, on a built page, before the status is in, and when asked before the build
    const onlyPane = (root, k) => ['search', 'faq', 'tools', 'gaps', 'sources', 'update'].every(x => blkOf(root, x).hidden === (x !== k));
    ok(typeof A.scr.view === 'function', 'page: screen has view()');
    A.scr.view('tools'); await tick();
    ok(onlyPane(A.root, 'tools') && btn(A.root, 'guides.tab.tools')[0].className === 'primary', 'page: view(tools) on a built page opens the Tools tab');
    A.scr.view('nope'); ok(onlyPane(A.root, 'tools'), 'page: an unknown view changes nothing');
    const C = run(REPLY.status); C.scr.view('tools'); await tick();
    ok(onlyPane(C.root, 'tools'), 'page: view(tools) before the status is in lands on Tools');
    const D = run(REPLY.status, { view: { guides: 'tools' } }); await tick();
    ok(onlyPane(D.root, 'tools'), 'page: a view asked before the build is honoured');
    B.scr.view('tools'); await tick();
    ok(onlyPane(B.root, 'gaps'), 'page: no index, view(tools) keeps the Gaps pane (Tools needs the index)');
    // game filter default per game (game parity): no game named (AS64 as before) = as2rel; Gates of Hell = gohrel; a switch back brings
    // the other kind's last pick; each kind sets its default once
    const gsel = root => root.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === L.en['guides.f.game']);
    ok(gsel(A.root).value === 'as2rel', 'page: game filter default as2rel with no game named, got ' + gsel(A.root).value);
    ok(gsel(A.root).all().some(e => e.tagName === 'OPTION' && e.attrs.value === 'gohrel'), 'page: gohrel preset offered');
    const store = {}, game = { kind: 'goh' };
    const ls = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
    const E = run(REPLY.status, null, { LS: ls, curGame: () => game }); await tick();
    ok(gsel(E.root).value === 'gohrel' && store['guides.gameSet.goh'] === true && !('guides.gameSet' in store), 'page: GoH first open = gohrel, got ' + gsel(E.root).value);
    game.kind = 'as2'; E.scr.refresh();
    ok(gsel(E.root).value === 'as2rel' && store['guides.gameSet'] === true, 'page: switch to an AS2 game = as2rel, got ' + gsel(E.root).value);
    const pickV = (r, v) => { const s = gsel(r); s.value = v; s.fire('change'); };
    pickV(E.root, 'as2'); ok(store['guides.game.as2'] === 'as2', 'page: a pick is kept per kind');
    game.kind = 'goh'; E.scr.refresh(); ok(gsel(E.root).value === 'gohrel', 'page: back to GoH = gohrel');
    game.kind = 'as2'; E.scr.refresh(); ok(gsel(E.root).value === 'as2', 'page: back to the AS2 game = its last pick, got ' + gsel(E.root).value);
  }

  console.log(bad ? bad + ' failures' : 'guides ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL ' + (x.stack || x)); process.exit(1); });
