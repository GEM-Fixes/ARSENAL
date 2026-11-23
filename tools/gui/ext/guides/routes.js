// guides ext: server routes over tools/gemindex (read-only; export writes one file into a folder the user picked).
// The index data stays on the server side (9 MB of page text never goes to the browser in one piece). No link is ever opened here.
// The only network use is "Update the index" (update/start, after a dry run the user saw): public pages into <picked folder>/scrape.
// Author: Imperator_Aug (ARSENAL, ia-de1b1867)
'use strict';
const fs = require('fs'), path = require('path');
const L = require('../../../gemindex/lib/load'), Q = require('../../../gemindex/lib/query'), G = require('../../../gemindex/gaps');

const bad = m => Object.assign(new Error(m), { status: 400 });
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n || 400);
const bool = v => v === true || v === 'true' || v === '1';
function within(child, parent) { if (!parent) return false; const rel = path.relative(path.resolve(parent), path.resolve(child)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }

// dir: the folder the page picked for this session, else the default search order
function dirArg(v) {
  const d = str(v, 2000).trim();
  if (!d) return undefined;
  if (!path.isAbsolute(d)) throw bad('The index folder must be a full path.');
  return d;
}
function open(v) {
  try { return L.load({ data: dirArg(v) }); }
  catch (e) { if (e.code === 'NOT_FOUND') throw Object.assign(new Error('GEM index not found. Pick its folder on the Guides page.'), { status: 404, tried: e.tried }); throw e; }
}
const filt = b => ({ q: str(b.q), tab: str(b.tab, 20), game: str(b.game, 200), comp: str(b.comp, 200), sub: str(b.sub, 200), lang: str(b.lang, 20),
  text: bool(b.text), discord: bool(b.discord), archived: bool(b.archived), limit: Math.min(500, +b.limit || 60) });

// ---- "Update the index": the scraper (tools/gemindex/lib/scrape.js). Only a folder the user picked on the page (b.dir), only after a dry run
// whose token is passed back to start, one run at a time. It goes online only from start. GEMINDEX_TEST_LOCAL=1 = local addresses only (tests).
const S = () => require('../../../gemindex/lib/scrape');
const PLANS = new Map();   // token -> {dir, opt, at}
let JOB = null;            // {token, dir, done, total, log[], result, error, running, scraper, stopAsked, h}
// THE stop of a running update: the page's Stop (update/stop) and the job list's Cancel (JOBS registry) both end here. Asked before the
// scraper exists = it stops as soon as it is made.
function stopUpdate() { if (JOB && JOB.running) { JOB.stopAsked = true; if (JOB.scraper) JOB.scraper.stop(); } }
function testOpts() { return process.env.GEMINDEX_TEST_LOCAL === '1' ? { test: true, wayback: process.env.GEMINDEX_TEST_WAYBACK || undefined, interval: +process.env.GEMINDEX_TEST_INTERVAL || undefined } : {}; }
function upOpt(b) {
  const mode = ['missing', 'filter'].includes(b.mode) ? b.mode : 'missing';
  return { filter: filt(b.filter || {}), missing: mode === 'missing', limit: Math.max(1, Math.min(200, Math.floor(+b.limit) || 25)), mode };
}
function named(b) { const d = dirArg(b && b.dir); if (!d) throw bad('Pick the index folder to update first (pages are saved in its scrape folder).'); return d; }
const jobView = () => JOB ? { running: JOB.running, done: JOB.done, total: JOB.total, log: JOB.log.slice(-12), result: JOB.result, error: JOB.error, dir: JOB.dir } : { running: false };

const routes = {
  // where the index is, what it holds, and the filter values (games, topics, languages)
  'GET /api/x/guides/status': async (u) => {
    const loc = L.locate({ data: dirArg(u.searchParams.get('dir')) });
    if (loc.missing) return { found: false, tried: loc.tried, defaultDir: L.DEFAULT_SRC };
    let idx;
    try { idx = L.load({ data: loc.dir }); } catch (e) { return { found: false, broken: e.message, tried: loc.tried, defaultDir: L.DEFAULT_SRC }; }
    const s = Q.stats(idx);
    return { found: true, dir: idx.dir, from: loc.from, built: idx.built, rows: s.rows, tabs: s.tabs, discordRows: s.discordRows, faq: s.faq,
      pages: s.pack ? s.pack.pages : 0, history: s.history, archivedRows: s.archivedRows, ownPages: s.own ? s.own.pages : 0, facets: Q.facets(idx), preset: L.AS2_PRESET };
  },
  // where the links and saved texts came from (offline)
  'POST /api/x/guides/sources': async (u, b) => { b = b || {}; return require('../../../gemindex/lib/sources').sources(open(b.dir), { top: 30 }); },
  // update, step 1: what would be fetched, from which sites. Offline; returns the token that start needs.
  'POST /api/x/guides/update/plan': async (u, b) => {
    b = b || {};
    const dir = named(b), idx = open(dir), opt = upOpt(b);
    const p = S().plan(idx, Q, opt);
    S().scrapeDir(idx, { named: true });   // refuses a game, Steam or repo folder before anything is promised
    const token = require('crypto').randomBytes(9).toString('hex');
    PLANS.clear(); PLANS.set(token, { dir, opt, at: Date.now() });
    return { token, dir: idx.dir, saveIn: idx.files.scrape, count: p.rows.length, hosts: p.hosts, skipped: p.skipped, minSeconds: p.minSeconds, limit: p.limit,
      rows: p.rows.map(r => ({ url: r.Url, title: r.Title, kind: r.kind, host: r.host })) };
  },
  // update, step 2: start the plan the user just saw (same folder, same choices, under 15 minutes old). Goes online.
  'POST /api/x/guides/update/start': async (u, b, ctx) => {
    b = b || {};
    if (JOB && JOB.running) throw bad('An update is already running.');
    const pl = PLANS.get(str(b.token, 40));
    const dir = named(b);
    if (!pl || pl.dir !== dir || Date.now() - pl.at > 15 * 60000) throw bad('Press "Try it first" again: start runs only what the dry run just showed.');
    PLANS.clear();
    const idx = open(dir);
    const job = JOB = { token: b.token, dir, done: 0, total: 0, log: [], result: null, error: null, running: true, scraper: null, stopAsked: false, h: null };
    const log = s => { job.log.push(String(s)); if (job.log.length > 200) job.log.shift(); };
    // JOBS: a background job of the footer's list for as long as the update runs (it outlives this request); ended on every path
    if (ctx && ctx.jobs) job.h = ctx.jobs.add({ kind: 'bg', what: 'job.w.guides', page: 'guides', game: typeof ctx.gameId === 'function' ? ctx.gameId() : undefined, cancel: stopUpdate });
    const fin = (state) => { job.running = false; job.scraper = null; if (job.h) job.h.end(state); };
    let run;
    try {
      run = S().run(idx, Q, Object.assign({}, pl.opt, { named: true, scraper: testOpts(), log, progress: (d, t) => { job.done = d; job.total = t; if (job.h) job.h.set({ done: d, total: t }); },
        onScraper: s => { job.scraper = s; if (job.stopAsked) s.stop(); } }));
    } catch (e) { job.error = e.message; fin('failed'); throw e; }
    run.then(r => { job.result = { saved: r.saved, later: r.later.length, stopped: r.stopped, requests: r.requests, verdicts: r.rows.reduce((a, x) => { a[x.verdict || '?'] = (a[x.verdict || '?'] || 0) + 1; return a; }, {}) }; L.forget(); return r.stopped ? 'cancelled' : 'done'; },
      e => { job.error = e.message; return 'failed'; })
      .then(fin, e => { job.error = job.error || e.message; fin('failed'); });
    return { started: true };
  },
  'GET /api/x/guides/update/progress': async () => jobView(),
  'POST /api/x/guides/update/stop': async () => { stopUpdate(); return jobView(); },
  'POST /api/x/guides/search': async (u, b) => { b = b || {}; return Q.search(open(b.dir), Object.assign(filt(b), { hasText: true })); },
  'POST /api/x/guides/show': async (u, b) => {
    b = b || {};
    const r = Q.show(open(b.dir), str(b.id, 2000), { around: str(b.around, 200), max: 4000 });
    if (!r) throw bad('That link is not in the index.');
    return r;
  },
  // the searchKit index of the two search boxes (owner 2026-11-19): every row title (with its tab, game, topic, sub-topic, and p = the
  // name its saved page text has on disk, text/<p>.txt, so a text picked with Browse finds its title) and every FAQ question (all games,
  // as the FAQ tab asks), the titles under the game filter the page has (game parity: AS2 games and Gates of Hell differ), asked once per filter
  'POST /api/x/guides/titles': async (u, b) => {
    b = b || {};
    const idx = open(b.dir), o = { game: str(b.game, 200), discord: bool(b.discord) };
    const rows = Q.filterRows(idx, o).map(r => ({ t: str(r.title, 200), tab: r.tab, g: str(r.game, 40), c: str(r.comp, 80), s: str(r.sub, 80), p: L.pageId(String(r.url || '')) }));
    const faq = Q.faq(idx, { discord: o.discord }).map(f => ({ q: str(f.q, 300), c: str(f.comp, 80), g: str(f.game, 80) }));
    return { rows, faq };
  },
  'POST /api/x/guides/faq': async (u, b) => { b = b || {}; return { rows: Q.faq(open(b.dir), { q: str(b.q), game: str(b.game, 200), comp: str(b.comp, 200), lang: str(b.lang, 20), discord: bool(b.discord) }) }; },
  'POST /api/x/guides/tools': async (u, b) => { b = b || {}; return { groups: Q.tools(open(b.dir), { game: str(b.game, 200), discord: bool(b.discord) }) }; },
  // gaps work without the index (urls only)
  'GET /api/x/guides/gaps': async (u) => {
    let idx = null;
    try { idx = L.load({ data: dirArg(u.searchParams.get('dir')) }); } catch (e) { if (e.status === 400) throw e; idx = null; }
    const lang = ['en', 'ru', 'uk', 'zh'].includes(u.searchParams.get('lang')) ? u.searchParams.get('lang') : 'en';
    return Object.assign({ indexed: !!idx }, G.resolve(idx, lang));
  },
  // export: dry (count + file name) first, then write into the picked folder. Never the index, the game, Steam library or Workshop folders.
  'POST /api/x/guides/export': async (u, b, ctx) => {
    b = b || {};
    const idx = open(b.dir);
    const fmt = ['csv', 'md', 'json'].includes(b.fmt) ? b.fmt : 'csv';
    const folder = str(b.folder, 2000).trim();
    const f = filt(b.filter || {});
    if (!folder) { const r = Q.search(idx, Object.assign({}, f, { limit: 1 })); return { dry: true, count: r.total, fmt }; }
    if (!path.isAbsolute(folder)) throw bad('Pick a folder (full path).');
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw bad('That folder does not exist.');
    const game = ctx && typeof ctx.game === 'function' ? ctx.game() : null;
    let gohDir = null; try { gohDir = ctx && typeof ctx.gohDir === 'function' ? ctx.gohDir() : null; } catch (e) { gohDir = null; }
    if (within(folder, game) || within(folder, gohDir)) throw bad('Pick a folder outside the game folder.');   // the AS2 install and the GoH install
    if (/[\\/]steamapps([\\/]|$)/i.test(folder)) throw bad('Pick a folder outside the Steam library (game and Workshop folders).');
    { const why = require('../../../lib/writeguard').refuseWrite(folder, { game, allowGameMods: false, purpose: 'write the export' }); if (why) throw bad(why); }   // I-22: any AS2 install or GoH by content, whatever game is set
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    let out = path.join(folder, 'gem-index-' + stamp + '.' + fmt), n = 2;
    while (fs.existsSync(out)) out = path.join(folder, 'gem-index-' + stamp + '-' + (n++) + '.' + fmt);
    const r = Q.exportRows(idx, f, { out, fmt, dry: !!b.dry });
    return { dry: !r.wrote, count: r.count, out: r.out, fmt };
  },
};

module.exports = { routes };
