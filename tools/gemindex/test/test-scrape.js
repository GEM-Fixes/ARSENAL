// gemindex scrape against a local fixture server only (127.0.0.1 / localhost): never the internet. The scraper's test mode refuses any
// other host ('test-local-only'), so a mistake here cannot go online. Arg: scratch dir.
// Covers: dry run (no request, no write), refusal when the data folder was not named, pages, same-site redirect, off-site redirect,
// robots.txt disallow and crawl-delay, slow page timeout, oversized page cap, 404 then the newest good copy from a fake Wayback CDX,
// --limit, resume (a second run skips what is saved), pace between requests, honest User-Agent and no cookies, writes only in <data>/scrape,
// the CLI (GEMINDEX_TEST_LOCAL=1) dry run and wayback listing, and the bundle merging the own fetch.
// Author: Imperator_Aug (ARSENAL, ia-5bdacca9)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gemidx-s-')));
require('../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const L = require('../lib/load'), Q = require('../lib/query'), S = require('../lib/scrape'), B = require('../lib/bundle');
const CLI = path.join(__dirname, '..', 'gemindex.js');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

const para = (t, n) => Array.from({ length: n }, (_, i) => '<p>' + t + ' paragraph ' + i + ' explains how the fixture unit gets its armour values, its weapons and the order of the mod folders in a careful way.</p>').join('\n');
const page = (title, body) => '<!doctype html><html><head><title>' + title + '</title></head><body><nav><a href="/">home</a></nav><article><h1>' + title + '</h1>' + body + '</article></body></html>';
const hits = [];
let port = 0;
const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0], u = req.url;
  hits.push({ host, url: u, at: Date.now(), ua: req.headers['user-agent'], cookie: req.headers.cookie || null });
  const html = (code, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); };
  if (u === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(host === 'localhost' ? 'User-agent: *\nCrawl-delay: 0.4\n' : 'User-agent: *\nDisallow: /private\n'); }
  if (u === '/a') return html(200, page('Fixture scrape article A', para('Alpha', 12)));
  if (u === '/r1') { res.writeHead(302, { Location: '/a2' }); return res.end(); }
  if (u === '/a2') return html(200, page('Fixture redirected article', para('Bravo', 12)));
  if (u === '/slow') { setTimeout(() => { if (!res.destroyed) html(200, page('late', para('Late', 3))); }, 1500); return; }
  if (u === '/big') return html(200, page('Fixture big page', para('Big', 2500)));
  if (u === '/gone') return html(404, page('Not found', '<p>nothing</p>'));
  if (u === '/off') { res.writeHead(302, { Location: 'http://localhost:' + port + '/elsewhere' }); return res.end(); }
  if (u === '/b' || u === '/c' || u === '/private/x') return html(200, page('Fixture page ' + u, para('Page ' + u, 10)));
  if (u === '/h1' || u === '/h2') return html(200, page('Fixture other host ' + u, para('Host ' + u, 10)));
  if (u.startsWith('/cdx/search/cdx?')) {
    const orig = decodeURIComponent(u.split('&url=')[1] || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(orig.endsWith('/gone') ? [['timestamp', 'statuscode', 'mimetype'], ['20120304050607', '200', 'text/html'], ['20150101000000', '200', 'text/html']] : [['timestamp', 'statuscode', 'mimetype']]));
  }
  if (u === '/web/20150101000000id_/http://127.0.0.1:' + port + '/gone') return html(200, page('Fixture gone page', para('Rescued WAYBACKMARK', 10)));
  if (u.startsWith('/web/')) return html(404, 'no');
  html(404, 'no');
});

function spawnCli(args, env) {
  return new Promise(resolve => {
    const p = cp.spawn(process.execPath, [CLI, ...args], { env: Object.assign({}, process.env, { GEM_INDEX_DIR: '', GEMINDEX_DATA: '' }, env || {}) });
    let out = '', err = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', status => resolve({ status, stdout: out, stderr: err }));
  });
}
const list = d => fs.existsSync(d) ? B.walk(d, '', []) : [];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  const base = 'http://127.0.0.1:' + port, other = 'http://localhost:' + port;
  const T = (title, url, x) => Object.assign({ game: 'as2', comp: 'Editor', sub: 'Fixture', title, url, note: '', lang: 'en', source: 'index', category: 'guides' }, x || {});
  const rows = [T('Fixture scrape article A', base + '/a'), T('Fixture redirected article', base + '/r1'), T('Fixture slow page', base + '/slow'), T('Fixture big page', base + '/big'),
    T('Fixture gone page', base + '/gone'), T('Fixture robots page', base + '/private/x'), T('Fixture off-site redirect', base + '/off'), T('Fixture page b', base + '/b'),
    T('Fixture page c', base + '/c'), T('Fixture other host 1', other + '/h1'), T('Fixture other host 2', other + '/h2'),
    T('Fixture discord link', 'https://discord.com/channels/1/2/3', { source: 'discord' }), T('Fixture less row', base + '/less', { category: 'less' })];
  const data = path.join(work, 'data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'guides.json'), JSON.stringify({ built: '2026-11-04', games: { as2: 'AS2' }, rows }));
  const before = list(data);
  const sopt = { test: true, interval: 150, timeoutMs: 400, cap: 64 * 1024, wayback: base };
  const idx0 = L.load({ data });

  // 1 dry run: the plan, no request, nothing written
  let r = await S.run(idx0, Q, { dry: true, scraper: sopt });
  ok(r.dry && r.plan.rows.length === 11 && r.plan.skipped.discord === 1 && hits.length === 0 && !fs.existsSync(path.join(data, 'scrape')), '1 dry: 11 rows (guides tab), discord skipped, no request ' + JSON.stringify([r.plan.rows.length, r.plan.skipped, hits.length]));
  ok(r.plan.rows[0].Url === base + '/a' && r.plan.rows[9].host === 'localhost' && r.plan.hosts['127.0.0.1'] === 9, '1 dry: grouped by site, index order');
  ok((await S.run(idx0, Q, { dry: true, limit: 3 })).plan.skipped.overLimit === 8, '1 dry: --limit 3 leaves 8 over the limit');
  ok((await S.run(idx0, Q, { dry: true, all: true })).plan.rows.length === 12, '1 dry: --all takes the less row too (discord never)');
  let c = await spawnCli(['scrape', '--data', data, '--dry', '--limit', '4'], { GEMINDEX_TEST_LOCAL: '1' });
  ok(c.status === 0 && /Would fetch 4 pages/.test(c.stdout) && /Goes online to: 127\.0\.0\.1 \(4\)/.test(c.stdout) && hits.length === 0 && !fs.existsSync(path.join(data, 'scrape')), '1 cli dry\n' + c.stdout + c.stderr);

  // 2 refusal: a data folder that was found, not named, is never written
  const exeDir = path.join(work, 'exe'); fs.mkdirSync(path.join(exeDir, 'gemindex'), { recursive: true }); fs.copyFileSync(path.join(data, 'guides.json'), path.join(exeDir, 'gemindex', 'guides.json'));
  const saveEnv = [process.env.GEM_INDEX_DIR, process.env.GEMINDEX_DATA]; delete process.env.GEM_INDEX_DIR; delete process.env.GEMINDEX_DATA;
  const idxExe = L.load({ exeDir });
  if (saveEnv[0] != null) process.env.GEM_INDEX_DIR = saveEnv[0]; if (saveEnv[1] != null) process.env.GEMINDEX_DATA = saveEnv[1];
  let thrown = null; try { await S.run(idxExe, Q, { scraper: sopt }); } catch (e) { thrown = e; }
  ok(idxExe.from === 'exe' && thrown && thrown.status === 400 && /--data/.test(thrown.message) && !fs.existsSync(path.join(exeDir, 'gemindex', 'scrape')) && hits.length === 0, '2 refuses an unnamed data folder: ' + (thrown && thrown.message));
  thrown = null; try { await S.run(idx0, Q, { limit: 1, rescue: false }); } catch (e) { thrown = e; }
  ok(!thrown || hits.length === 0, '2 outside test mode a local address is refused (private), no request: ' + hits.length);
  fs.rmSync(path.join(data, 'scrape'), { recursive: true, force: true });
  const realScr = new S.Scraper(null, {}); ok(realScr.forbidden('http://127.0.0.1/x') === 'private' && new S.Scraper(null, { test: true }).forbidden('https://example.com/') === 'test-local-only', '2 test mode never leaves this machine; normal mode never fetches local addresses');

  // 3 first run, --limit 3: article, same-site redirect, slow page (timeout: busy, not saved, comes back next run)
  let scr = null;
  r = await S.run(L.load({ data }), Q, { limit: 3, scraper: sopt, onScraper: s => { scr = s; }, rescue: true });
  const st = id => { try { return JSON.parse(fs.readFileSync(path.join(data, 'scrape', 'state', id + '.json'), 'utf8')); } catch (e) { return null; } };
  const res = () => JSON.parse(fs.readFileSync(path.join(data, 'scrape', 'results.json'), 'utf8'));
  const id = u => S.idOf(u), v = u => (res().find(x => x.id === id(u)) || {}).verdict;
  ok(r.saved === 2 && r.later.length === 1 && r.later[0] === base + '/slow' && !st(id(base + '/slow')), '3 limit 3: 2 saved, slow page left for later ' + JSON.stringify([r.saved, r.later]));
  ok(v(base + '/a') === 'ok' && fs.readFileSync(path.join(data, 'scrape', 'text', id(base + '/a') + '.txt'), 'utf8').includes('Alpha paragraph 3'), '3 article text ok');
  const sr = st(id(base + '/r1'));
  ok(sr && sr.pages[0].finalUrl === base + '/a2' && v(base + '/r1') === 'ok', '3 same-site redirect followed');
  const slowNet = scr.requests.filter(q => q.url === base + '/slow').length;
  ok(slowNet === 3, '3 slow page: 3 tries, each cut at the timeout: ' + slowNet);
  // pacing: strict on the scraper's own send times (requests[].at); the server's arrival times jitter on a loaded machine,
  // so they only have to show the requests were not sent in a burst
  const gaps = a => a.map((t, i) => i ? t - a[i - 1] : 0);
  const sent = scr.requests.filter(q => q.url.indexOf(base + '/') === 0 && !q.url.endsWith('/robots.txt')).map(q => q.at);
  ok(sent.length > 2 && gaps(sent).every((g, i) => i === 0 || g >= 145), '3 pace: at least the interval between sends to one site ' + gaps(sent).join(','));
  const loc = hits.filter(h => h.host === '127.0.0.1' && h.url !== '/robots.txt').map(h => h.at);
  ok(gaps(loc).every((g, i) => i === 0 || g >= 75), '3 pace: arrivals at the server are spread out ' + gaps(loc).join(','));
  ok(hits.every(h => h.ua === S.UA && h.cookie === null) && /GemIndex-fetch/.test(S.UA), '3 honest User-Agent, no cookies');

  // 4 second run resumes: what is saved is skipped; big page capped, 404 rescued from the Wayback copy, robots, off-site redirect, crawl-delay
  const h0 = hits.length;
  r = await S.run(L.load({ data }), Q, { limit: 25, scraper: sopt, onScraper: s => { scr = s; } });
  ok(r.plan.skipped.known === 2 && r.plan.rows.length === 9 && r.plan.rows[0].Url === base + '/slow', '4 resume: 2 known skipped, slow page tried again ' + JSON.stringify(r.plan.skipped));
  const big = st(id(base + '/big'));
  ok(big && big.pages[0].truncated && big.pages[0].bytes === 64 * 1024, '4 oversized page capped at the size limit');
  const gone = st(id(base + '/gone'));
  ok(gone && gone.snapshot === '20150101000000' && v(base + '/gone') === 'ok' && fs.readFileSync(path.join(data, 'scrape', 'text', id(base + '/gone') + '.txt'), 'utf8').includes('WAYBACKMARK'), '4 404 rescued: newest capture from the fake CDX ' + JSON.stringify(gone && [gone.snapshot, v(base + '/gone')]));
  ok(hits.some(h => /^\/cdx\/search\/cdx\?output=json&fl=timestamp,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text\/html&collapse=timestamp:4&url=/.test(h.url)), '4 CDX query as the toolkit');
  ok((st(id(base + '/private/x')).pages[0] || {}).blocked === 'robots' && !hits.some(h => h.url === '/private/x'), '4 robots.txt disallow: never requested');
  ok((st(id(base + '/off')).pages[0] || {}).blocked === 'offhost' && !hits.some(h => h.url === '/elsewhere'), '4 off-site redirect not followed');
  const lh = scr.requests.filter(q => q.url.indexOf(other + '/h') === 0).map(q => q.at);
  ok(lh.length === 2 && lh[1] - lh[0] >= 395, '4 robots crawl-delay 0.4 s honoured (send times): ' + (lh[1] - lh[0]));
  ok(v(base + '/b') === 'ok' && v(other + '/h2') === 'ok' && hits.length > h0, '4 the rest read ok');
  // 5 a third run has nothing new to do (only the slow page, which keeps timing out)
  r = await S.run(L.load({ data }), Q, { dry: true });
  ok(r.plan.rows.length === 1 && r.plan.rows[0].Url === base + '/slow', '5 third run: only the page that never answered ' + r.plan.rows.map(x => x.Url).join());
  // 6 writes only in <data>/scrape
  const added = list(data).filter(f => !before.includes(f));
  ok(added.length > 10 && added.every(f => f.startsWith('scrape/')) && list(data).filter(f => !f.startsWith('scrape/')).join() === 'guides.json', '6 only <data>/scrape written: ' + added.filter(f => !f.startsWith('scrape/')).join());
  ok(fs.existsSync(path.join(data, 'scrape', 'guides.snapshot.json')) && fs.existsSync(path.join(data, 'scrape', 'raw')) && fs.existsSync(path.join(data, 'scrape', 'robots', '_notes.txt')), '6 toolkit crawl layout (state, raw, text, robots, results.json, guides.snapshot.json)');
  // 7 the index reads the own fetch: show says where the text came from; sources lists it
  const idx2 = L.load({ data });
  const sg = Q.show(idx2, base + '/gone');
  ok(sg.hasText && sg.textSource && /own fetch/.test(sg.textSource.from) && sg.copySnapshot === '20150101000000', '7 show: own fetch, Wayback copy date ' + JSON.stringify([sg.textSource, sg.copySnapshot]));
  ok(Q.search(idx2, { q: 'WAYBACKMARK', text: true }).total === 1, '7 text search finds the fetched text');
  const so = require('../lib/sources').sources(idx2, {});
  ok(!so.pageSources[1].missing && so.pageSources[1].pages === 10, '7 sources: own fetch pages ' + JSON.stringify(so.pageSources[1]));
  // 8 CLI wayback listing (nothing written) and extract
  const nb = list(data).length;
  c = await spawnCli(['wayback', base + '/gone', '--data', data], { GEMINDEX_TEST_LOCAL: '1', GEMINDEX_TEST_WAYBACK: base });
  ok(c.status === 0 && /2 captures/.test(c.stdout) && /2015-01-01/.test(c.stdout) && list(data).length === nb, '8 cli wayback lists captures, writes nothing\n' + c.stdout + c.stderr);
  const guard = new S.Scraper(null, {}); let calls = 0; guard.http = async () => { calls++; throw new Error('no network in tests'); };
  const gc = await guard.cdx(base + '/gone');
  ok(!gc.ok && gc.r.blocked === 'private' && calls === 0, '8 outside test mode no archive lookup for a local address (no request made)');
  c = await spawnCli(['extract', '--data', data]);
  ok(c.status === 0 && /10 pages read again/.test(c.stdout), '8 cli extract\n' + c.stdout + c.stderr);
  // 9 bundle takes the own fetch
  const bo = path.join(work, 'bundle');
  const b = B.bundle({ from: data, out: bo });
  ok(b.manifest.ownMerged === 10 && b.manifest.pages === 10 && Q.search(L.load({ data: bo }), { q: 'WAYBACKMARK', text: true }).total === 1, '9 bundle merges the own fetch ' + JSON.stringify([b.manifest.ownMerged, b.manifest.pages]));
})().catch(e => { bad++; console.log('FAIL exception ' + (e && e.stack || e)); }).finally(() => {
  server.closeAllConnections(); server.close();
  console.log(bad ? bad + ' scrape failures' : 'gemindex scrape: PASS');
  process.exitCode = bad ? 1 : 0;
});
