#!/usr/bin/env node
// gemindex: search the GEM External Index offline (9k links to guides and tools, 1.7k saved page texts, FAQ). Read-only, with writers that each
// write only where you say: export (one file), bundle and ww2bundle (one folder each), ww2-split (<dir>/index.sqlite.parts), ww2-join (<dir>/index.sqlite or --out), history --import (the data folder you name), and scrape/wayback --save (<data>/scrape of the data folder you name with --data).
// Only scrape and wayback go online (public pages, robots.txt obeyed, one request at a time); everything else is offline. Never runs the toolkit exe.
// Data folder: --data <dir>, env GEM_INDEX_DIR, <exe dir>/gemindex (the bundle shipped beside ARSENAL), the toolkit's default place.
// Author: Imperator_Aug (ARSENAL, ia-ec87a55a)
'use strict';
const path = require('path');
const L = require('./lib/load'), Q = require('./lib/query'), G = require('./gaps');

const USAGE = `gemindex: search the GEM External Index (guides and tools for GEM games), offline.
  search <words> [--tab guides|tools|history|less|all] [--game as2,gem2|as2rel|gohrel] [--comp X] [--sub X] [--lang en] [--archived] [--text] [--discord] [--limit n] [--json]
  show <id|url> [--around word] [--max chars] [--json]   row, archive address and capture date, page text excerpt and where it came from
  history [words] [--topic X] [--sub X] [--lang X] [--hand first|second|none] [--nation X] [--access X] [--type X] [--issuer X] [--year yyyy]
         [--group id] [--text] [--offset n] [--limit n] [--json]
         the Historical sources category: first-hand and second-hand WW2 sources (the guide index's history rows, the WW2 source list
         and its documents); words match titles, topics, issuers, designations; --text searches the guide index's saved texts too
  history --pages <words> [--nation X] [--component code] [--type X] [--issuer X] [--year-from yyyy] [--year-to yyyy] [--lang xx|other]
         [--offset n] [--limit n] [--json]   the text inside the documents (needs index.sqlite: the -ww2 release); best 300 pages,
         AND OR NOT NEAR "phrase" word* work; the text is machine-read, check every figure against the scan
  history --show <page id> [--max chars]                  one page (wp123) with its citation, or a guide index row's saved text
  history --groups [--json]                               topics, sub-topics, languages, hand, nations, access, types, issuers, years, with counts
         history takes --ww2 <folder> (else ARSENAL_WW2_DIR, <exe dir>/ww2sources, <package>/ww2sources)
  ww2bundle --from <WW2 sources folder> --out <folder> [--dry]   the ww2sources folder for the release (list, word lists, database
         copy without local download paths); reads --from only
  ww2-split --dir <ww2sources folder> [--piece-mb 45] [--dry-run]   cut index.sqlite into gzipped pieces of at most 48 MB for git
         (<dir>/index.sqlite.parts/index.sqlite.NNN.gz + parts.json); the same database gives the same pieces
  ww2-join --dir <ww2sources folder> [--out <file>]   put the pieces back together (checks every piece and the whole sha256);
         default target <dir>/index.sqlite, or a per-user copy when that folder cannot be written
  history --import <file.csv|json> --data <folder> [--dry]   add historical sources to that data folder (builtin/builtin-edits.json,
         the shape the toolkit reads); csv columns as the toolkit's history.csv export, plus hand, kind, year; --dry lists and writes nothing
  sources [--top n] [--json]                              the sites, archives and page sources behind the index
  faq [words] [--game X] [--comp X] [--lang X] [--json]
  tools [--game X] [--discord] [--json]                   the 160 tools by sub-topic
  gaps [--lang en|ru|uk|zh] [--json]                      what ARSENAL makes itself and what needs another program
  export [words] [filters as search] --out <file.csv|md|json> [--dry]
  stats [--json]
  ONLINE (public pages; only these two; --data names the folder, pages are saved in <data>/scrape):
  scrape [words] [filters as search] [--all] [--missing] [--url <id|url>] [--limit 25] [--dry] [--force] [--max-pages 3] [--no-rescue] [--timeout s] [--delay s]
         one page at a time, robots.txt obeyed; nothing chosen = the guides tab; --dry lists what it would fetch and goes nowhere
  wayback <id|url> [--save]                               the Wayback Machine captures of a row's page; --save keeps the newest good one
  extract                                                 re-read <data>/scrape raw pages into text (offline)
  bundle --from <toolkit folder> --out <folder> [--dry] [--pack]   the data folder that ships beside ARSENAL.exe as gemindex/
  scan [<folder>] [--json]                                the release zip gate's text rules over a data folder (changes nothing)
  common: --data <folder> (else GEM_INDEX_DIR, <exe dir>/gemindex, the toolkit folder)
Rows posted on Discord are hidden unless --discord, and never fetched. Links are not opened or safety-checked.`;

const FLAGS = new Set(['text', 'discord', 'json', 'dry', 'dry-run', 'help', 'archived', 'all', 'missing', 'force', 'no-rescue', 'save', 'pack', 'groups', 'pages']);
function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (FLAGS.has(k)) o[k] = true; else { if (i + 1 >= argv.length) throw new Error('missing value for ' + a); o[k] = argv[++i]; } }
    else o._.push(a);
  }
  return o;
}
const line = r => '[' + r.tab + '] ' + r.title + '\n    ' + [r.game, r.comp, r.sub, r.lang].filter(Boolean).join(' / ') + (r.discord ? ' / Discord' : '') + '\n    ' + r.url +
  (r.archiveUrl ? '\n    archived copy of ' + r.original + ', captured ' + r.captured : '') + (r.snippet ? '\n    text: ' + r.snippet : '');
// test mode for the scraper: local addresses only, short waits (GEMINDEX_TEST_LOCAL=1, fake archive GEMINDEX_TEST_WAYBACK=http://127.0.0.1:port; like scrape.cs GEMFAQ_TEST_*)
function testOpts() {
  if (process.env.GEMINDEX_TEST_LOCAL !== '1') return {};
  return { test: true, wayback: process.env.GEMINDEX_TEST_WAYBACK || undefined, interval: +process.env.GEMINDEX_TEST_INTERVAL || undefined };
}
function scraperOpts(o) {
  const s = testOpts();
  if (o.timeout) s.timeoutMs = Math.round(+o.timeout * 1000);
  if (o.delay) s.interval = Math.round(+o.delay * 1000);   // the CLI can only make it slower (lib/scrape.js keeps the 1.1 s floor outside test mode)
  return s;
}

// history: the Historical sources category (lib/history.js). Works without the guide index when the WW2 sources folder is found.
const GROUP_HEADS = [['topic', 'Topics'], ['sub', 'Sub-topics'], ['lang', 'Languages'], ['hand', 'First or second hand'], ['nation', 'Nations'], ['access', 'Access'],
  ['type', 'Document types'], ['issuer', 'Issuers'], ['year', 'Years']];
function history(o, out) {
  const H = require('./lib/history');
  const base = { data: o.data, ww2: o.ww2 };
  if (o.import) {
    const r = H.importRows(o.import, { data: o.data, dry: !!o.dry });
    if (o.json) return out(r), 0;
    console.log((r.wrote ? 'added to ' : o.dry ? 'would add to ' : 'nothing to add to ') + r.target + ': ' + r.add.length + ' new historical sources, ' + r.change.length + ' rows of the index moved to the category, ' + r.skip.length + ' skipped');
    r.add.forEach(t => console.log('  add     ' + t));
    r.change.forEach(t => console.log('  move    ' + t));
    r.skip.forEach(s => console.log('  skip    ' + s.title + ' (' + s.why + ')'));
    return 0;
  }
  if (o.show) {
    const r = H.text(o.show, Object.assign({ max: o.max }, base));
    if (!r) { console.error('not found: ' + o.show + ' (a page id from history --pages, like wp123, or a row id with saved text)'); return 1; }
    if (o.json) return out(r), 0;
    console.log(r.title + '\n    ' + (r.url || '(no address)') + (r.citation ? '\n    cite as: ' + r.citation : '') + (r.prev || r.next ? '\n    ' + [r.prev ? 'previous page ' + r.prev : '', r.next ? 'next page ' + r.next : ''].filter(Boolean).join(', ') : ''));
    if (/^wp\d+$/.test(r.id)) console.log('    The text is machine-read: check every figure against the scan before citing it.');
    console.log('--- text (' + r.chars + ' chars) ---\n' + r.text + (r.more ? '\n...' : ''));
    return 0;
  }
  if (o.pages) {
    const filters = { nation: o.nation, component: o.component, kind: o.type, issuer: o.issuer, year_from: o['year-from'], year_to: o['year-to'], lang: o.lang };
    for (const k of Object.keys(filters)) if (filters[k] == null) delete filters[k];
    let r;
    try { r = H.search(Object.assign({ q: o._.join(' '), offset: o.offset, limit: o.limit, filters }, base)); }
    catch (e) { if (e.status === 409) { console.log(e.message); return 3; } throw e; }
    if (o.json) return out(r), 0;
    console.log(r.total + (r.capped ? '+' : '') + ' pages found' + (r.total > r.rows.length ? ', showing ' + (r.offset + 1) + '-' + (r.offset + r.rows.length) : '') + '. The text is machine-read: check every figure against the scan before citing it.');
    r.rows.forEach(x => console.log((x.doc.designation ? x.doc.designation + ', ' : '') + x.doc.title + ', page ' + x.page + (x.printed && x.printed !== String(x.page) ? ' (printed ' + x.printed + ')' : '') + '  (id ' + x.id + ', ' + x.tier + ')' +
      '\n    ' + x.snippet + '\n    ' + x.url + (x.source && x.source.url !== x.doc.url ? '\n    from: ' + x.source.title : '')));
    return 0;
  }
  if (o.groups) {
    const g = H.groups(base);
    if (o.json) return out(g), 0;
    const span = x => x.from && x.kind !== 'year' ? (x.from === x.to ? ' ' + x.from : ' ' + x.from + '-' + x.to) : '';
    for (const [k, head] of GROUP_HEADS) {
      const list = g.filter(x => x.kind === k);
      if (!list.length) continue;
      console.log(head + ':');
      list.forEach(x => console.log('  ' + String(x.count).padStart(5) + '  ' + x.title + span(x) + '  [' + x.id + ']'));
    }
    return 0;
  }
  const a = H.available(base);
  if (!a.ok) { console.error(a.why); return 3; }
  const r = H.rows(Object.assign({ q: o._.join(' '), topic: o.topic, sub: o.sub, lang: o.lang, hand: o.hand, nation: o.nation, access: o.access, type: o.type, issuer: o.issuer, year: o.year,
    group: o.group, text: !!o.text, offset: o.offset, limit: o.limit }, base));
  if (o.json) return out(Object.assign({ ww2: a.ww2, ww2Note: a.ww2Note }, r)), 0;
  if (!a.rows) { console.log('0 historical sources. ' + (a.note || '') + ' ' + a.ww2Note); return 0; }
  console.log(r.total + ' historical sources' + (r.total > r.rows.length ? ', showing ' + (r.offset + 1) + '-' + (r.offset + r.rows.length) : '') + '. Links not opened or safety-checked by ARSENAL.');
  r.rows.forEach(x => console.log(x.title + '\n    ' + [x.topic, x.sub, x.nation, x.lang, x.hand ? x.hand + ' hand' : '', x.kind, x.issuer, x.year, x.access].filter(Boolean).join(' / ') +
    (x.pages ? ' / ' + x.pages + ' pages' : '') + (x.hasText && x.rec === 'index' ? ' / saved text' : '') + '  (id ' + x.id + ')' + (x.parentTitle ? '\n    part of: ' + x.parentTitle : '') +
    '\n    ' + x.url + (x.archive ? '\n    copy: ' + x.archive + (x.captured ? ', captured ' + x.captured : '') : '') + (x.snippet ? '\n    text: ' + x.snippet : '')));
  console.log(a.ww2Note);
  return 0;
}

async function main(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(e.message); return 2; }
  const cmd = o._.shift();
  if (!cmd || o.help || cmd === 'help' || cmd === '-h') { console.log(USAGE); return (cmd || o.help) ? 0 : 2; }
  const out = x => console.log(o.json ? JSON.stringify(x, null, 1) : x);
  try {
    if (cmd === 'bundle') {
      const B = require('./lib/bundle');
      const r = B.bundle({ from: o.from, out: o.out, dry: !!o.dry, pack: !!o.pack });
      if (o.json) return out(Object.assign({}, r, { manifest: o.dry ? r.manifest : undefined })), 0;
      console.log((r.wrote ? 'wrote ' : 'would write ') + r.files + ' files, ' + (r.bytes / 1048576).toFixed(1) + ' MB to ' + r.out + '\n  ' + r.manifest.rows + ' links, ' + r.manifest.pages + ' page texts (' + r.manifest.okPages +
        ' read well), ' + r.manifest.faq + ' FAQ entries' + (r.manifest.ownMerged ? ', ' + r.manifest.ownMerged + ' from your own fetch' : '') + ', layout ' + r.manifest.layout);
      return 0;
    }
    if (cmd === 'scan') {
      const B = require('./lib/bundle');
      const dir = o._[0] || o.data || path.join(__dirname, '..', 'dist', 'out', 'gemindex');
      const r = B.scan(dir);
      if (o.json) return out(r), 0;
      console.log(r.dir + ': ' + r.files + ' files, ' + r.text + ' text; the release gate would refuse ' + r.gateRefused + (r.notText.length ? ' (' + r.notText.length + ' not text: ' + r.notText.slice(0, 3).join(', ') + ')' : ''));
      for (const [k, v] of Object.entries(r.findings)) console.log('  ' + k + ': ' + v.matches + ' in ' + v.files + ' files ' + JSON.stringify(v.where) + '\n    e.g. ' + v.examples.join('\n    e.g. '));
      return r.gateRefused ? 1 : 0;
    }
    if (cmd === 'ww2bundle') {
      const r = require('./lib/ww2').bundle({ from: o.from, out: o.out, dry: !!o.dry });
      if (o.json) return out(r), 0;
      console.log((r.wrote ? 'wrote ' : 'would write ') + r.out + ' from ' + r.from + ': ' + r.docs + ' documents, ' + r.pages + ' pages');
      r.files.forEach(f => console.log('  ' + f.name.padEnd(24) + ' ' + (f.bytes / 1048576).toFixed(1) + ' MB'));
      console.log('  tables: ' + r.tables.join(', '));
      console.log('  left out of the copy: ' + (r.dropped.length ? r.dropped.join(', ') : 'nothing') + (r.blanked.length ? '; blanked: ' + r.blanked.join(', ') : '; no local paths or user name found in the other tables'));
      return 0;
    }
    if (cmd === 'ww2-split') {
      const P = require('./lib/ww2parts');
      const r = P.split({ dir: o.dir, pieceMb: o['piece-mb'], dry: !!(o['dry-run'] || o.dry) });
      if (o.json) return out(r), 0;
      const stored = r.pieces.reduce((s, p) => s + p.stored, 0), big = Math.max(...r.pieces.map(p => p.stored));
      console.log((r.wrote ? 'wrote ' : 'would write ') + r.pieces.length + ' pieces to ' + r.parts + ': ' + (r.bytes / P.MB).toFixed(1) + ' MB -> ' + (stored / P.MB).toFixed(1) +
        ' MB stored, largest ' + (big / P.MB).toFixed(1) + ' MB; sha256 ' + r.sha256);
      if (r.wrote) console.log('  ' + r.pieces.filter(p => p.wrote).length + ' pieces changed, ' + r.removed.length + ' old pieces removed' + (r.removed.length ? ': ' + r.removed.join(', ') : ''));
      return 0;
    }
    if (cmd === 'ww2-join') {
      const P = require('./lib/ww2parts');
      let last = -1;
      const r = await P.join({ dir: o.dir, out: o.out, release: f => require('./lib/ww2').closeDb(f),
        onProgress: (d, t) => { const p = Math.floor(d * 10 / t); if (p !== last && !o.json) { last = p; process.stdout.write('  ' + (d / P.MB).toFixed(0) + ' of ' + (t / P.MB).toFixed(0) + ' MB\n'); } } });
      if (o.json) return out(r), 0;
      console.log('joined ' + r.pieces + ' pieces into ' + r.file + ': ' + r.bytes + ' bytes, sha256 ' + r.sha256 + ', ' + (r.ms / 1000).toFixed(1) + ' s');
      return 0;
    }
    if (cmd === 'history') return history(o, out);
  } catch (e) { console.error(e.message); return e.status === 400 ? 2 : e.code === 'NOT_FOUND' ? 3 : 1; }

  let idx = null;   // gaps works without the index (urls only); with it, rows get titles
  try { idx = L.load({ data: o.data }); }
  catch (e) { if (cmd === 'gaps' && e.code === 'NOT_FOUND') idx = null; else { console.error(e.message); return e.code === 'NOT_FOUND' ? 3 : 1; } }
  const filt = { q: o._.join(' '), tab: o.tab, game: o.game, comp: o.comp, sub: o.sub, lang: o.lang, text: !!o.text, discord: !!o.discord, archived: !!o.archived, limit: o.limit };
  try {
    switch (cmd) {
      case 'search': case 'find': {
        const r = Q.search(idx, filt);
        if (o.json) return out(r), 0;
        console.log(r.total + ' found' + (r.total > r.shown ? ', first ' + r.shown : '') + '. Links not opened or safety-checked by ARSENAL.');
        r.rows.forEach(x => console.log(line(x)));
        if (!r.total && o.tab === 'history' && !require('./lib/history').view(idx).rows.length) console.log('The Historical sources category (first-hand and second-hand WW2 sources) is empty in this index. Old forum copies: --archived.');
        return 0;
      }
      case 'show': case 'page': {
        const r = Q.show(idx, o._[0], { around: o.around, max: o.max });
        if (!r) { console.error('not found: ' + (o._[0] || '(give an id or url)')); return 1; }
        if (o.json) return out(r), 0;
        console.log(line(r));
        if (r.note) console.log('    note: ' + r.note);
        if (r.archive) console.log('    archive: ' + r.archive.archiveUrl + '\n    original address: ' + r.archive.original + '\n    captured: ' + r.archive.captured + ' (Wayback Machine ' + r.archive.timestamp + ')');
        if (r.copySnapshot) console.log('    text from a Wayback Machine copy' + (r.copySnapshot !== 'unknown' ? ' captured ' + r.copySnapshot : ''));
        if (r.textSource) console.log('    text source: ' + r.textSource.from + ' (page ' + r.textSource.pageId + ', ' + r.textSource.verdict + ', ' + r.textSource.kind + ')');
        console.log(r.hasText ? '--- saved page text (' + r.textChars + ' chars' + (r.textFrom ? ', from ' + r.textFrom : '') + ') ---\n' + r.text + (r.more ? '\n...' : '') : '(no saved page text)');
        return 0;
      }
      case 'sources': {
        const r = require('./lib/sources').sources(idx, { top: o.top });
        if (o.json) return out(r), 0;
        console.log('index ' + r.dir + ' (built ' + r.built + '), ' + r.rows + ' links from ' + r.siteCount + ' sites');
        console.log('\nWhere the links came from:');
        r.origins.forEach(x => console.log('  ' + String(x.rows).padStart(5) + '  ' + x.label + ' [' + x.source + '], ' + x.withText + ' with saved text'));
        console.log('\nArchives (Wayback Machine): ' + r.archives.rows + ' links to ' + r.archives.sites + ' closed sites, captured ' + r.archives.firstYear + '-' + r.archives.lastYear + ', ' + r.archives.withText + ' with saved text');
        Object.entries(r.archives.forums).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + String(n).padStart(5) + '  ' + k));
        const hs = require('./lib/history').summary(idx);
        console.log('\nHistorical sources (first-hand and second-hand WW2 sources): ' + hs.rows + ' rows' + (hs.rows ? ' (' + (hs.hand.first || 0) + ' first hand, ' + (hs.hand.second || 0) + ' second hand, ' + hs.withText + ' with saved text)' : ', the index holds none yet') + '; gemindex history');
        if (hs.ww2 && hs.ww2.mode !== 'none') console.log('WW2 sources folder: ' + hs.ww2.sources + ' sources, ' + hs.ww2.docs + ' documents' + (hs.ww2.pages ? ', ' + hs.ww2.pages + ' pages of searchable text' : ', list only (no index.sqlite)'));
        console.log('\nTop sites (Wayback rows counted under the original site):');
        r.sites.forEach(x => console.log('  ' + String(x.rows).padStart(5) + '  ' + x.site + (x.archived ? ' (' + x.archived + ' archived)' : '') + ', ' + x.withText + ' with text'));
        if (r.discordServers.length) console.log('\nDiscord servers (rows hidden unless --discord, never fetched): ' + r.discordServers.map(x => x.name + ' ' + x.rows).join(', '));
        console.log('\nPage texts:');
        r.pageSources.forEach(x => console.log('  ' + x.name + ': ' + (x.missing ? 'none yet' : x.pages + ' pages ' + JSON.stringify(x.verdicts)) + (x.where ? '\n    ' + x.where : '')));
        return 0;
      }
      case 'faq': {
        const r = Q.faq(idx, filt);
        if (o.json) return out(r), 0;
        console.log(r.length + ' FAQ entries (other people\'s answers, rule-picked, not verified)');
        r.forEach(f => console.log('\nQ [' + [f.game, f.comp, f.lang].join(' / ') + '] ' + f.q + '\nA ' + f.a + '\n  source: ' + (f.sourceName || '') + ' ' + (f.sourceUrl || '')));
        return 0;
      }
      case 'tools': {
        const r = Q.tools(idx, { game: o.game, discord: !!o.discord });
        if (o.json) return out(r), 0;
        r.forEach(g => { console.log('\n## ' + g.sub + ' (' + g.rows.length + ')'); g.rows.forEach(x => console.log('  ' + x.title + '  [' + x.game + ']\n    ' + x.url)); });
        return 0;
      }
      case 'gaps': {
        const r = G.resolve(idx, o.lang || 'en');
        if (o.json) return out(r), 0;
        console.log(r.linkNote + '\n' + r.aiNote);
        r.gaps.forEach(g => {
          console.log('\n## ' + g.title + '\n' + g.what + '\n' + g.after);
          g.guides.forEach(x => console.log('  guide: ' + x.title + (x.discord ? ' (Discord)' : '') + '\n    ' + x.url));
          g.tools.forEach(x => console.log('  tool:  ' + x.title + (x.discord ? ' (Discord)' : '') + '\n    ' + x.url));
          g.ai.forEach(a => console.log('  AI:    ' + a.name + ' - ' + a.what + ' (' + a.hint + ')'));
        });
        return 0;
      }
      case 'export': {
        if (!o.out) { console.error('export needs --out <file.csv|md|json>'); return 2; }
        const r = Q.exportRows(idx, filt, { out: path.resolve(o.out), fmt: o.format, dry: !!o.dry });
        if (o.json) return out(r), 0;
        console.log((r.wrote ? 'wrote ' : 'would write ') + r.count + ' rows as ' + r.fmt + ' to ' + r.out);
        return 0;
      }
      case 'stats': {
        const s = Q.stats(idx);
        if (o.json) return out(s), 0;
        console.log('index ' + s.dir + ' (built ' + s.built + ')\nrows ' + s.rows + ' (' + s.discordRows + ' from Discord, hidden by default)\ntabs ' + JSON.stringify(s.tabs) +
          '\nguides ' + (s.tabs.guides || 0) + ' vs toolkit README ' + s.guidesReadme + ' (gap ' + s.guidesGap + ')\nhistory ' + s.history + ' historical sources (gemindex history), archived (Wayback) rows ' + s.archivedRows + '\nFAQ ' + s.faq +
          '\npages ' + (s.pack ? s.pack.pages + ' saved texts, ' + s.pack.okPages + ' read well (' + s.pack.kind + ', ' + s.pack.entries + ' entries)' : 'none') + (s.own ? '\nyour own fetch ' + s.own.pages + ' pages' : ''));
        return 0;
      }
      case 'scrape': {
        const S = require('./lib/scrape');
        const opt = { filter: filt, all: !!o.all, missing: !!o.missing, url: o.url, force: !!o.force, limit: o.limit || 25, dry: !!o.dry, maxPages: o['max-pages'], rescue: !o['no-rescue'],
          scraper: scraperOpts(o), log: s => console.log(s) };
        if (!opt.dry) process.on('SIGINT', () => { console.log('Stopping after this request...'); if (opt.s) opt.s.stop(); });
        opt.onScraper = s => { opt.s = s; };
        const r = await S.run(idx, Q, opt);
        if (o.json) return out(r), 0;
        const p = r.plan;
        console.log((r.dry ? 'Would fetch ' : 'Fetched ') + p.rows.length + ' pages from ' + Object.keys(p.hosts).length + ' sites' + (p.skipped.overLimit ? ' (' + p.skipped.overLimit + ' more over --limit ' + p.limit + ')' : '') +
          '; skipped ' + p.skipped.known + ' already fetched, ' + p.skipped.discord + ' Discord/not a web page.');
        if (r.dry) {
          console.log('Goes online to: ' + Object.entries(p.hosts).map(([h, n]) => h + ' (' + n + ')').join(', ') + '. At least ' + p.minSeconds + ' s at the polite pace. Nothing fetched yet.');
          p.rows.forEach(x => console.log('  ' + x.kind.padEnd(8) + ' ' + x.Url));
          return 0;
        }
        console.log('Saved in ' + r.dir + ': ' + r.saved + ' pages, ' + r.requests + ' requests' + (r.later.length ? ', ' + r.later.length + ' for a later run (busy site)' : '') + (r.stopped ? ', stopped early' : ''));
        r.rows.forEach(x => console.log('  ' + (x.verdict || '?').padEnd(10) + ' ' + x.url));
        return 0;
      }
      case 'wayback': {
        const S = require('./lib/scrape');
        const r = await S.wayback(idx, o._[0], { save: !!o.save, scraper: scraperOpts(o), log: s => console.log(s) });
        if (o.json) return out(r), 0;
        if (!r.ok) { console.log('No list from the Wayback Machine for ' + r.original + ' (' + (r.blocked || r.netError || r.status) + ').'); return 1; }
        console.log(r.captures.length + ' captures of ' + r.original + ' (one per year, newest first):');
        r.captures.forEach(c => console.log('  ' + c.captured + '  ' + c.archiveUrl));
        if (o.save) console.log(r.saved ? 'Saved the copy captured ' + r.snapshot + '.' : 'None of the newest 3 read well; nothing saved.');
        return 0;
      }
      case 'extract': {
        const S = require('./lib/scrape');
        const dir = S.scrapeDir(idx, {});
        const r = S.extract(dir, s => console.log(s));
        if (o.json) return out({ dir, pages: r.length }), 0;
        console.log(r.length + ' pages read again in ' + dir);
        return 0;
      }
      default: console.error('unknown command ' + cmd + '\n' + USAGE); return 2;
    }
  } catch (e) { console.error(e.message); return e.status === 400 ? 2 : 1; }
}

if (require.main === module) main(process.argv.slice(2)).then(c => { process.exitCode = c; }, e => { console.error(e && e.stack || e); process.exitCode = 1; });
module.exports = { main, load: L.load, locate: L.locate, query: Q, gaps: G };
