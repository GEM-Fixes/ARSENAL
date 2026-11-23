// gemindex: where the index came from. The sites and archives behind the rows (guides.json field `source`: index / foreign / wayback / discord / added),
// counts per source and per game, the Wayback Machine archives, and the page-text sources the toolkit's Sources list names
// (toolkit.cs Store.BuiltInSources line 129: the built-in fetched pages and the scrape folder; the discord folder needs a bot and stays out).
// Read-only, offline.
// Author: Imperator_Aug (ARSENAL, ia-f31fd147)
'use strict';
const ORIGIN = {
  index: 'Collected for the index (guides, docs, tutorials, tool pages)',
  foreign: 'Sites in other languages (Russian, Chinese and others)',
  wayback: 'Wayback Machine copies of closed forums and sites',
  discord: 'Links posted on Discord servers (hidden unless --discord)',
  added: 'Added by hand (builtin-edits.json)',
};
const bare = h => String(h || '').toLowerCase().replace(/^www\./, '');
function siteOf(r) {
  const u = r.archive && r.archive.original ? r.archive.original : r.url;
  try { return bare(new URL(u).hostname); } catch (e) { return /^text:/.test(r.url) ? '(typed text)' : '(no address)'; }
}
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); return o; };
function tally(list) { const c = {}; for (const x of list) inc(c, x.verdict || '(none)'); return c; }

// sources(idx, {top}) -> {origins, sites, siteCount, archives, discordServers, pageSources, history}
function sources(idx, o) {
  o = o || {};
  const top = Math.max(1, Math.min(1000, +o.top || 40));
  const pages = idx.pages();
  const origins = {}, sites = {}, servers = {};
  for (const r of idx.rows) {
    const k = r.source || '(blank)';
    if (!origins[k]) origins[k] = { source: k, label: ORIGIN[k] || k, rows: 0, withText: 0, games: {} };
    origins[k].rows++; inc(origins[k].games, r.game);
    if (pages.has(r.url)) origins[k].withText++;
    const s = siteOf(r);
    if (!sites[s]) sites[s] = { site: s, rows: 0, archived: 0, withText: 0, games: {} };
    sites[s].rows++; if (r.archive) sites[s].archived++; if (pages.has(r.url)) sites[s].withText++; inc(sites[s].games, r.game);
    if (r.source === 'discord' && r.from) inc(servers, r.from.replace(/^Discord:\s*/, '').replace(/\s+#.*$/, ''));
  }
  const arch = idx.rows.filter(r => r.archive);
  const years = arch.map(r => r.archive.timestamp.slice(0, 4)).filter(y => /^\d{4}$/.test(y)).sort();
  const archives = { rows: arch.length, withText: arch.filter(r => pages.has(r.url)).length, sites: new Set(arch.map(siteOf)).size,
    firstYear: years[0] || '', lastYear: years[years.length - 1] || '', forums: {} };
  for (const r of arch) inc(archives.forums, r.sub || '(none)');
  const pageSources = [];
  const p = idx.pack();
  pageSources.push(p ? { name: idx.files.pack ? '(built into the toolkit) fetched pages' : 'pages shipped with ARSENAL', where: p.kind === 'pack' ? p.file : p.dir, pages: idx.results('builtin').length, verdicts: tally(idx.results('builtin')) }
    : { name: 'built-in pages', where: '', pages: 0, missing: true });
  const own = idx.own();
  pageSources.push(own ? { name: 'your own fetch (gemindex scrape)', where: idx.files.scrape, pages: idx.results('own').length, verdicts: tally(idx.results('own')) }
    : { name: 'your own fetch (gemindex scrape)', where: idx.files.scrape, pages: 0, missing: true });
  const siteList = Object.values(sites).sort((a, b) => b.rows - a.rows || a.site.localeCompare(b.site));
  return { dir: idx.dir, built: idx.built, rows: idx.rows.length, history: idx.rows.filter(r => r.tab === 'history').length,
    origins: Object.values(origins).sort((a, b) => b.rows - a.rows), siteCount: siteList.length, sites: siteList.slice(0, top),
    archives, discordServers: Object.entries(servers).map(([name, rows]) => ({ name, rows })).sort((a, b) => b.rows - a.rows), pageSources };
}

module.exports = { sources, siteOf, ORIGIN };
