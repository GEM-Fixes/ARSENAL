// gemindex: find and load the GEM External Index data. Read-only, offline, zlib only.
// A data folder holds guides.json, the FAQ (builtin-faq.json), the built-in page texts and, after `gemindex scrape`, the user's own fetch:
//   built-in pages: builtin/builtin-pages.pack (the toolkit's GEMPACK1) or pages/ (the same crawl unpacked: results.json + text/<id>.txt, what `bundle` ships)
//   own fetch:      scrape/ (the toolkit's own crawl layout, scrape.cs line 4: state/ raw/ text/ robots/ results.json), read on top of the built-in pages
//   edits:          builtin/builtin-edits.json (category/topic changes and added rows, applied as toolkit.cs LinkList.Build does)
// Search order: --data, env GEM_INDEX_DIR (or GEMINDEX_DATA), <exe dir>/gemindex (the shipped copy), <package root>/gemindex (the same
// copy found from this file's place, for the small package), then the toolkit on the Desktop.
// Author: Imperator_Aug (ARSENAL, ia-1cad3d39)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

// default place: the toolkit unzipped on the user's Desktop (OneDrive or plain), built from the home folder, no fixed user name
const DEFAULT_SRC = (() => { const h = require('os').homedir(), t = path.join('GEM_External_Index_and_Scrape_Toolkit', 'GEM External Index and Scraper Toolkit');
  const c = [path.join(h, 'OneDrive', 'Desktop', t), path.join(h, 'Desktop', t)]; return c.find(d => fs.existsSync(d)) || c[0]; })();
const DISCORD_SUB = 'Files posted on Discord';
const AS2_PRESET = ['as2', 'as64', 'gem2', 'all'];
// the Gates of Hell preset (game filter gohrel): GoH, its predecessor Call to Arms (same engine branch), the shared GEM 2 rows, all games
const GOH_PRESET = ['goh', 'cta', 'gem2', 'all'];

function isFile(f) { try { return fs.statSync(f).isFile(); } catch (e) { return false; } }
function first(list) { for (const f of list) if (isFile(f)) return f; return null; }

// one folder: the toolkit root (data in work/), work/ itself, or a flat/bundled folder
function probe(dir) {
  if (!dir) return null;
  for (const d of [dir, path.join(dir, 'work')]) {
    const guides = path.join(d, 'guides.json');
    if (!isFile(guides)) continue;
    return { dir: path.resolve(d), guides,
      faq: first([path.join(d, 'builtin', 'builtin-faq.json'), path.join(d, 'builtin-faq.json')]),
      edits: first([path.join(d, 'builtin', 'builtin-edits.json'), path.join(d, 'builtin-edits.json')]),
      pack: first([path.join(d, 'builtin', 'builtin-pages.pack'), path.join(d, 'builtin-pages.pack')]),
      pagesDir: isFile(path.join(d, 'pages', 'results.json')) ? path.join(d, 'pages') : null,
      scrapeDir: path.join(d, 'scrape') };
  }
  return null;
}

// order: --data, env, <exe dir>/gemindex (the copy shipped beside ARSENAL.exe), the toolkit's default place
function candidates(opt) {
  opt = opt || {};
  const c = [];
  if (opt.data) c.push(['--data', opt.data]);
  if (process.env.GEM_INDEX_DIR) c.push(['GEM_INDEX_DIR', process.env.GEM_INDEX_DIR]);
  if (process.env.GEMINDEX_DATA) c.push(['GEMINDEX_DATA', process.env.GEMINDEX_DATA]);
  if (!opt.data && !opt.noDefault) {
    c.push(['exe', path.join(opt.exeDir || path.dirname(process.execPath), 'gemindex')]);
    // the package root, from this file (<package>/tools/gemindex/lib): the small package runs plain files under a node that is not
    // beside the package, so <exe dir> misses it there. In a repo checkout <repo>/gemindex does not exist and this changes nothing.
    c.push(['package', path.join(opt.pkgDir || path.join(__dirname, '..', '..', '..'), 'gemindex')]);
    c.push(['default', opt.defaultDir || DEFAULT_SRC]);
  }
  return c;
}

function locate(opt) {
  const tried = [];
  for (const [from, dir] of candidates(opt)) {
    tried.push(dir);
    const p = probe(dir);
    if (p) return Object.assign(p, { from, tried });
    if (opt && opt.data) break;   // an explicit folder that is wrong is an error, no silent fallback
  }
  return { missing: true, tried };
}

function notFoundMessage(tried) {
  return 'GEM index not found. Looked in:\n' + tried.map(t => '  ' + t).join('\n') +
    '\nThe index is the GEM External Index toolkit folder (it holds guides.json and builtin/builtin-pages.pack), or the gemindex folder shipped beside ARSENAL.exe.\n' +
    'Point at it with:  node tools/gemindex/gemindex.js stats --data "<folder>"\n' +
    'or set GEM_INDEX_DIR=<folder>, or put the folder made by `gemindex bundle` next to the ARSENAL exe, named gemindex.';
}

// ---- GEMPACK1: magic(8) | int64 LE index offset | gzip streams | index: int32 count, {7-bit-len UTF-8 name, int64 offset, int32 length}
function readPack(file) {
  const b = fs.readFileSync(file);
  if (b.length < 16 || b.toString('latin1', 0, 8) !== 'GEMPACK1') throw new Error('not a GEMPACK1 pack: ' + file);
  let off = Number(b.readBigInt64LE(8));
  if (!(off >= 16 && off + 4 <= b.length)) throw new Error('pack index offset out of range: ' + file);
  const n = b.readInt32LE(off); off += 4;
  if (n < 0 || n > 1e6) throw new Error('pack entry count bad: ' + n);
  const ents = new Map();
  for (let i = 0; i < n; i++) {
    let len = 0, sh = 0, x;
    do { if (off >= b.length) throw new Error('pack index truncated'); x = b[off++]; len |= (x & 127) << sh; sh += 7; } while (x & 128);
    const name = b.toString('utf8', off, off + len); off += len;
    if (off + 12 > b.length) throw new Error('pack index truncated');
    const o = Number(b.readBigInt64LE(off)); off += 8;
    const l = b.readInt32LE(off); off += 4;
    if (o < 16 || o + l > b.length || l < 0) throw new Error('pack entry out of range: ' + name);
    ents.set(name, { o, l });
  }
  const bytes = name => { const e = ents.get(name); if (!e) return null;
    // Z_SYNC_FLUSH: some streams lack a clean end; plain gunzip throws "unexpected end of file"
    return zlib.gunzipSync(b.subarray(e.o, e.o + e.l), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); };
  return { kind: 'pack', file, count: n, names: () => [...ents.keys()], has: name => ents.has(name), bytes, get: name => { const x = bytes(name); return x && x.toString('utf8'); } };
}
// a crawl folder (results.json, guides.snapshot.json, text/<id>.txt): the same entries as the pack, as plain files
function readCrawl(dir) {
  const f = name => path.join(dir, ...name.split('/'));
  const names = () => { const out = []; for (const n of ['results.json', 'guides.snapshot.json']) if (isFile(f(n))) out.push(n);
    try { for (const t of fs.readdirSync(path.join(dir, 'text'))) if (/\.txt$/.test(t)) out.push('text/' + t); } catch (e) { /* none */ } return out; };
  const has = name => /^[\w./-]+$/.test(name) && !name.includes('..') && isFile(f(name));
  const bytes = name => has(name) ? fs.readFileSync(f(name)) : null;
  return { kind: 'crawl', dir, get count() { return names().length; }, names, has, bytes, get: name => { const x = bytes(name); return x && x.toString('utf8'); } };
}

// ---- tabs, same rules as the toolkit (toolkit.cs LinkList.Load line 808, CategoryFrom 653, IsGuide 661):
// a category on the row (or from builtin-edits.json) wins; else Steam guide / Best Way docs / ModDB tutorial = guides; everything else = less.
// History holds exactly the rows whose category is history/historical: the toolkit ships it empty ("being added later", toolkit.cs 838, README "Historical (0)").
function categoryFrom(s) {
  s = String(s || '').trim().toLowerCase();
  return ['guide', 'guides'].includes(s) ? 'guides' : ['tools', 'tool', 'plugins', 'plugin', 'tools-and-plugins'].includes(s) ? 'tools'
    : ['less', 'less-useful', 'link', 'links'].includes(s) ? 'less' : ['history', 'historical'].includes(s) ? 'history' : null;
}
const STEAM = /^https?:\/\/(www\.)?steamcommunity\.com\/sharedfiles\/filedetails/i;
const DOCS = /^https?:\/\/(docs\.bestway\.com\.ua|gem-2-modding-community\.gitbook\.io|bestway-1\.gitbook\.io)(\/|$)/i;
const TUT = /^https?:\/\/(www\.)?moddb\.com\/.+\/tutorials\/[^/?#]+/i;
function isGuide(r) {
  if (r.less !== undefined || r.source === 'discord') return false;
  if (STEAM.test(r.url)) return r.comp !== 'Community and hubs' && r.sub !== 'Mod lists and collections';
  return (DOCS.test(r.url) && !/llms\.txt$/i.test(r.url)) || TUT.test(r.url);
}
function tabOf(r) { return categoryFrom(r.category) || (isGuide(r) ? 'guides' : 'less'); }
const rowId = url => crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
const pageId = url => crypto.createHash('sha1').update(Buffer.from(url, 'utf8')).digest('hex').slice(0, 12);   // scrape.cs IdOf
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
function readable(t) { if (/%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/.test(t)) { try { return decodeURIComponent(t); } catch (e) { } } return t; }
// a Wayback Machine address: original page, capture time (scrape.cs WaybackParts: /web/<digits>[flags]/<original>)
function archiveOf(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if (u.hostname.replace(/^www\./, '') !== 'web.archive.org') return null;
  const m = /\/web\/(\d+)[a-z_]*\/(.*)$/.exec(url);
  if (!m) return { archiveUrl: url, original: '', timestamp: '', captured: '' };
  const t = m[1], p = (a, b) => t.slice(a, b);
  const captured = t.length >= 4 ? [p(0, 4), p(4, 6), p(6, 8)].filter(Boolean).join('-') + (t.length >= 12 ? ' ' + [p(8, 10), p(10, 12), p(12, 14)].filter(Boolean).join(':') + ' UTC' : '') : t;
  return { archiveUrl: url, original: m[2].replace(/^(https?:\/\/[^/:]+):80\//, '$1/'), timestamp: t, captured };
}
function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { throw new Error(what + ' does not parse: ' + e.message); }
}
function results(src) { if (!src) return []; let r; try { r = JSON.parse((src.get('results.json') || '[]').replace(/^﻿/, '')); } catch (e) { r = []; } return Array.isArray(r) ? r : []; }

const CACHE = new Map();
const stamp = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
// load(opt) -> index object; throws Error with .code 'NOT_FOUND' and .tried when nothing is found
function load(opt) {
  const loc = locate(opt);
  if (loc.missing) throw Object.assign(new Error(notFoundMessage(loc.tried)), { code: 'NOT_FOUND', tried: loc.tried });
  const ownRes = path.join(loc.scrapeDir, 'results.json');
  const key = loc.dir + '|' + stamp(loc.guides) + '|' + stamp(ownRes) + '|' + stamp(loc.edits || '') + '|' + loc.from;
  if (CACHE.has(key)) return CACHE.get(key);
  const g = readJson(loc.guides, 'guides.json');
  if (!g || !Array.isArray(g.rows)) throw new Error('guides.json has no rows array');
  const games = g.games || {};
  const mk = (r, i) => {
    const url = clean(r.url);
    const row = { id: rowId(url || String(i)), i, game: clean(r.game) || 'all', gameName: '', comp: clean(r.comp), sub: clean(r.sub),
      title: readable(clean(r.title)) || url, url, note: clean(r.note), desc: clean(r.description), lang: clean(r.lang), source: clean(r.source),
      from: clean(r.from), fromUrl: clean(r.fromUrl), category: r.category, less: r.less, discord: false, tab: '' };
    return row;
  };
  const rows = g.rows.map(mk);
  // builtin-edits.json, as LinkList.Apply(rows, Builtin.Edits(), built: true)
  let edits = { Changes: [], Added: [] };
  if (loc.edits) { const e = readJson(loc.edits, 'builtin-edits.json'); if (e && typeof e === 'object') edits = e; }
  const byUrl0 = new Map(); for (const r of rows) if (!byUrl0.has(r.url)) byUrl0.set(r.url, r);
  for (const a of Array.isArray(edits.Added) ? edits.Added : []) {
    if (!a || !(/^https?:\/\//i.test(a.Url || '') || /^text:[0-9a-f]{12}$/.test(a.Url || '')) || byUrl0.has(a.Url)) continue;
    const r = mk({ url: a.Url, title: a.Title, game: a.Game || 'all', comp: a.Comp || 'Added by hand', sub: a.Sub, lang: a.Lang, note: a.Note, source: 'added', category: categoryFrom(a.Category) || 'less' }, rows.length);
    rows.push(r); byUrl0.set(r.url, r);
  }
  for (const ch of Array.isArray(edits.Changes) ? edits.Changes : []) {
    const r = ch && byUrl0.get(ch.Url); if (!r || r.source === 'added') continue;
    if (categoryFrom(ch.Category)) r.category = categoryFrom(ch.Category);
    if (ch.Game && String(ch.Game).trim()) r.game = clean(ch.Game);
    if (ch.Comp && String(ch.Comp).trim()) r.comp = clean(ch.Comp);
    if (ch.Sub != null) r.sub = clean(ch.Sub);
  }
  for (const r of rows) { r.gameName = games[r.game] || r.game || ''; r.discord = r.source === 'discord' || r.sub === DISCORD_SUB; r.tab = tabOf(r); r.archive = archiveOf(r.url); }
  let faq = [];
  if (loc.faq) { faq = readJson(loc.faq, 'builtin-faq.json'); if (!Array.isArray(faq)) faq = []; }
  const idx = { dir: loc.dir, from: loc.from, files: { guides: loc.guides, faq: loc.faq, pack: loc.pack, pages: loc.pagesDir, edits: loc.edits, scrape: loc.scrapeDir }, built: g.built || '', games, rows, faq,
    byId: new Map(rows.map(r => [r.id, r])), byUrl: new Map(rows.map(r => [r.url, r])), _pack: null, _own: undefined, _pages: null, _texts: null };
  // built-in pages: the toolkit's pack, else the bundled pages/ folder
  idx.pack = () => { if (!idx._pack) { if (loc.pack) idx._pack = readPack(loc.pack); else if (loc.pagesDir) idx._pack = readCrawl(loc.pagesDir); else return null; } return idx._pack; };
  idx.own = () => { if (idx._own === undefined) idx._own = isFile(ownRes) ? readCrawl(loc.scrapeDir) : null; return idx._own; };
  // pages: url -> the copy shown for it. As scrape.cs TextFor/UsablePage: own fetch first, then built-in; a copy that read "ok" wins over one that did not.
  idx.pages = () => {
    if (idx._pages) return idx._pages;
    const m = new Map();
    for (const [from, src] of [['own', idx.own()], ['builtin', idx.pack()]]) {
      if (!src) continue;
      const seen = new Set();
      for (const x of results(src)) {
        if (!x || !x.id || !x.url || !/^[0-9a-f]+$/.test(x.id) || seen.has(x.id) || !src.has('text/' + x.id + '.txt')) continue;
        seen.add(x.id);
        const pg = { pid: x.id, title: x.title || '', lang: x.lang || '', verdict: x.verdict || '', kind: x.kind || '', method: x.method || '', status: x.status || 0, from, src };
        const had = m.get(x.url);
        if (!had || (had.verdict !== 'ok' && pg.verdict === 'ok')) m.set(x.url, pg);
      }
    }
    idx._pages = m; return m;
  };
  idx.text = url => { const pg = idx.pages().get(url); return pg ? pg.src.get('text/' + pg.pid + '.txt') : null; };
  // texts for --text search: only pages that read "ok" count (scrape.cs LoadPageText: a site's "access denied" page must not match)
  idx.texts = () => { if (idx._texts) return idx._texts; const m = new Map(); for (const [url, pg] of idx.pages()) if (pg.verdict === 'ok') m.set(url, pg.src.get('text/' + pg.pid + '.txt') || ''); idx._texts = m; return m; };
  idx.results = which => results(which === 'own' ? idx.own() : idx.pack());
  CACHE.set(key, idx);
  return idx;
}
function forget() { CACHE.clear(); }

module.exports = { DEFAULT_SRC, DISCORD_SUB, AS2_PRESET, GOH_PRESET, locate, probe, load, forget, readPack, readCrawl, tabOf, categoryFrom, archiveOf, pageId, rowId, notFoundMessage };
