// gemindex: search, show, faq, tools, stats, export over a loaded index (lib/load.js). Read-only except export (to a user path).
// Author: Imperator_Aug (ARSENAL, ia-622e8fe1)
'use strict';
const fs = require('fs'), path = require('path');
const { AS2_PRESET, GOH_PRESET, DISCORD_SUB } = require('./load');
const H = () => require('./history');   // lazy: the Historical sources category (lib/history.js), for stats.history

const lc = s => String(s || '').toLowerCase();
// fold: lower case with British and American spellings made one (armour = armor, colour = color), for word matching only
const fold = s => lc(s).replace(/armour/g, 'armor').replace(/colour/g, 'color');
const words = q => fold(q).split(/\s+/).map(w => w.trim()).filter(Boolean);
const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean);
function gameSet(g) {
  const l = list(g).map(lc);
  if (!l.length || l.includes('any')) return null;
  const out = new Set();
  for (const x of l) if (x === 'as2rel' || x === 'as2-relevant') AS2_PRESET.forEach(y => out.add(y));
  else if (x === 'gohrel' || x === 'goh-relevant') GOH_PRESET.forEach(y => out.add(y)); else out.add(x);
  return out;
}
function snippet(text, ws, width) {
  width = width || 220;
  const t = String(text || ''), l = t.toLowerCase();
  let at = -1, w0 = '';
  for (const w of ws) {   // ws are folded; the text is not, so try the British spelling too
    let i = l.indexOf(w); if (i < 0) i = l.indexOf(w.replace(/armor/g, 'armour').replace(/color/g, 'colour'));
    if (i >= 0 && (at < 0 || i < at)) { at = i; w0 = w; }
  }
  if (at < 0) return t.slice(0, width).replace(/\s+/g, ' ').trim();
  const s = Math.max(0, at - Math.floor(width / 3));
  return (s > 0 ? '... ' : '') + t.slice(s, s + width).replace(/\s+/g, ' ').trim() + (s + width < t.length ? ' ...' : '');
}
const pub = (r, extra) => Object.assign({ id: r.id, title: r.title, url: r.url, tab: r.tab, game: r.game, gameName: r.gameName, comp: r.comp, sub: r.sub, lang: r.lang, source: r.source, discord: r.discord, note: r.note, desc: r.desc,
  archiveUrl: r.archive ? r.archive.archiveUrl : undefined, captured: r.archive ? r.archive.captured : undefined, original: r.archive ? r.archive.original : undefined }, extra || {});

// filter rows (no word match): tab, game, comp, sub, lang, discord, archived (a Wayback Machine address)
function filterRows(idx, o) {
  o = o || {};
  const tab = lc(o.tab || 'all'), gs = gameSet(o.game), comp = lc(o.comp), sub = lc(o.sub), lang = lc(o.lang);
  return idx.rows.filter(r => {
    if (!o.discord && r.discord) return false;
    if (o.archived && !r.archive) return false;
    if (tab && tab !== 'all' && r.tab !== (tab === 'guide' ? 'guides' : tab)) return false;
    if (gs && !gs.has(lc(r.game))) return false;
    if (comp && lc(r.comp) !== comp) return false;
    if (sub && lc(r.sub) !== sub) return false;
    if (lang && (lang === 'none' ? r.lang !== '' : lc(r.lang) !== lang)) return false;
    return true;
  });
}

// search(idx, {q, tab, game, comp, sub, lang, text, discord, limit}) -> {total, shown, rows}
function search(idx, o) {
  o = o || {};
  const ws = words(o.q), limit = Math.max(1, Math.min(5000, +o.limit || 50));
  const texts = o.text ? idx.texts() : null, pages = (o.text || o.hasText) ? idx.pages() : null;
  const hits = [];
  for (const r of filterRows(idx, o)) {
    const hay = fold([r.title, r.game, r.gameName, r.comp, r.sub, r.url, r.note, r.desc].join(' \u0001 '));
    let score = 0, inText = false, txt = null;
    if (ws.length) {
      let all = true;
      for (const w of ws) {
        if (hay.includes(w)) { score += fold(r.title).includes(w) ? 3 : 1; continue; }
        if (texts) { if (txt == null) txt = fold(texts.get(r.url) || ''); if (txt.includes(w)) { inText = true; score += 0.5; continue; } }
        all = false; break;
      }
      if (!all) continue;
    }
    hits.push({ r, score, inText });
  }
  const tabRank = { guides: 0, tools: 1, history: 2, less: 3 };   // the toolkit's tab order
  hits.sort((a, b) => b.score - a.score || tabRank[a.r.tab] - tabRank[b.r.tab] || a.r.i - b.r.i);
  const rows = hits.slice(0, limit).map(h => pub(h.r, {
    hasText: pages ? pages.has(h.r.url) : undefined, inText: h.inText || undefined,
    snippet: h.inText ? snippet(idx.texts().get(h.r.url), ws) : undefined }));
  return { total: hits.length, shown: rows.length, rows };
}

// show(idx, key, {around, max}) -> row + text excerpt. key = row id, page id or url
function show(idx, key, o) {
  o = o || {};
  key = String(key || '').trim();
  let r = idx.byId.get(key) || idx.byUrl.get(key);
  if (!r && /^[0-9a-f]{12}$/.test(key)) for (const [url, pg] of idx.pages()) if (pg.pid === key) { r = idx.byUrl.get(url) || { id: key, title: pg.title, url, tab: 'less', game: '', comp: '', sub: '', lang: pg.lang, source: 'page', discord: false, note: '', desc: '' }; break; }
  if (!r) return null;
  const max = Math.max(200, Math.min(20000, +o.max || 4000));
  const full = idx.pack() || idx.own() ? idx.text(r.url) : null;
  let text = null, from = 0;
  if (full != null) {
    if (o.around) { const i = lc(full).indexOf(lc(o.around)); from = i > max / 4 ? i - Math.floor(max / 4) : 0; }
    text = full.slice(from, from + max);
  }
  const pg = idx.pages().get(r.url);
  const textSource = pg ? { from: pg.from === 'own' ? 'your own fetch (scrape folder)' : (idx.files.pack ? 'pages built into the toolkit (builtin-pages.pack)' : 'pages shipped with ARSENAL (pages folder)'),
    which: pg.from, pageId: pg.pid, verdict: pg.verdict, kind: pg.kind, method: pg.method, usable: pg.verdict === 'ok' } : null;
  let snapshot = null;   // a copy rescued from the Wayback Machine for a non-archive row (own fetch: state/<id>.json snapshot)
  if (pg && pg.from === 'own') { try { const stt = JSON.parse(fs.readFileSync(path.join(idx.files.scrape, 'state', pg.pid + '.json'), 'utf8')); if (stt.snapshot) snapshot = stt.snapshot; } catch (e) { /* none */ } }
  if (pg && pg.kind === 'copy' && !snapshot) snapshot = 'unknown';
  return pub(r, { hasText: full != null, textChars: full == null ? 0 : full.length, textFrom: from, text, more: full != null && from + max < full.length,
    archive: r.archive || null, textSource, copySnapshot: snapshot });
}

// faq(idx, {q, game, comp, lang, discord}) -> entries
function faq(idx, o) {
  o = o || {};
  const ws = words(o.q), gs = gameSet(o.game), comp = lc(o.comp), lang = lc(o.lang);
  return idx.faq.filter(f => {
    if (!o.discord && lc(f.Kind) === 'discord') return false;
    if (lc(f.Status) === 'rejected') return false;
    if (gs && !gs.has(lc(f.Game))) return false;
    if (comp && lc(f.Comp) !== comp) return false;
    if (lang && lc(f.Lang) !== lang) return false;
    const hay = lc([f.Q, f.A, f.Game, f.Comp, f.SourceName].join(' '));
    return ws.every(w => hay.includes(w));
  }).sort((a, b) => (+b.Score || 0) - (+a.Score || 0))
    .map(f => ({ id: f.Id, q: f.Q, a: f.A, game: f.Game, comp: f.Comp, lang: f.Lang, kind: f.Kind, sourceName: f.SourceName, sourceUrl: f.SourceUrl, score: f.Score, status: f.Status }));
}

// tools(idx, {discord, game}) -> [{sub, rows}] by sub-topic, biggest first
function tools(idx, o) {
  o = o || {};
  const m = new Map();
  for (const r of filterRows(idx, { tab: 'tools', discord: o.discord, game: o.game })) {
    const k = r.sub || '(other)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(pub(r));
  }
  return [...m].map(([sub, rows]) => ({ sub, rows })).sort((a, b) => b.rows.length - a.rows.length || a.sub.localeCompare(b.sub));
}

const count = (arr, f) => { const c = {}; for (const x of arr) { const k = f(x) || '(blank)'; c[k] = (c[k] || 0) + 1; } return c; };
// stats(idx) -> totals; guides vs the toolkit README figure (934)
function stats(idx) {
  const p = idx.pack();
  const tabs = count(idx.rows, r => r.tab), visible = idx.rows.filter(r => !r.discord);
  return { dir: idx.dir, built: idx.built, rows: idx.rows.length, discordRows: idx.rows.length - visible.length, tabs,
    guidesReadme: 934, guidesGap: (tabs.guides || 0) - 934,
    games: count(idx.rows, r => r.game), langs: count(idx.rows, r => r.lang), comps: count(idx.rows, r => r.comp),
    toolSubs: count(idx.rows.filter(r => r.tab === 'tools'), r => r.sub),
    faq: idx.faq.length, pack: p ? { entries: p.count, pages: idx.pages().size, okPages: [...idx.pages().values()].filter(x => x.verdict === 'ok').length, kind: p.kind } : null,
    history: H().view(idx).rows.length, archivedRows: idx.rows.filter(r => r.archive).length, own: idx.own() ? { pages: idx.results('own').length } : null };
}

// facets for the GUI filters: games (code, name, n), comps -> subs, langs
function facets(idx) {
  const comps = {};
  for (const r of idx.rows) { if (!comps[r.comp]) comps[r.comp] = {}; if (r.sub) comps[r.comp][r.sub] = (comps[r.comp][r.sub] || 0) + 1; }
  const gc = count(idx.rows, r => r.game);
  return { games: Object.keys(idx.games).map(c => ({ code: c, name: idx.games[c], n: gc[c] || 0 })),
    comps: Object.keys(comps).sort().map(c => ({ comp: c, subs: Object.keys(comps[c]).sort() })),
    langs: Object.keys(count(idx.rows, r => r.lang)).filter(l => l !== '(blank)').sort() };
}

// ---- export: csv | md | json of search rows to a file the user names. Never into the index folder.
const COLS = ['title', 'url', 'tab', 'game', 'comp', 'sub', 'lang', 'source', 'note', 'original', 'captured'];   // original/captured: Wayback rows only
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function render(rows, fmt, meta) {
  if (fmt === 'json') return JSON.stringify({ from: 'GEM External Index (links not opened or safety-checked by ARSENAL)', built: meta.built, filter: meta.filter, rows: rows.map(r => { const o = {}; COLS.forEach(c => { o[c] = r[c]; }); return o; }) }, null, 1) + '\n';
  if (fmt === 'md') {
    const esc = s => String(s || '').replace(/[\[\]|]/g, ' ');
    return ['# GEM index export', '', 'Index built ' + (meta.built || '?') + '. Links not opened or safety-checked by ARSENAL.', '',
      ...rows.map(r => '- [' + esc(r.title) + '](' + r.url + ') - ' + [r.game, r.comp, r.sub, r.lang].filter(Boolean).map(esc).join(' / '))].join('\r\n') + '\r\n';
  }
  return '﻿' + [COLS.join(','), ...rows.map(r => COLS.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}
function within(child, parent) { const rel = path.relative(path.resolve(parent), path.resolve(child)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
// exportRows(idx, filter, {out, fmt, dry, refuse:[dirs]}) -> {count, out, fmt, wrote}
function exportRows(idx, filter, o) {
  const out = path.resolve(o.out);
  const fmt = o.fmt || (/\.json$/i.test(out) ? 'json' : /\.md$/i.test(out) ? 'md' : 'csv');
  if (!['csv', 'md', 'json'].includes(fmt)) throw Object.assign(new Error('format must be csv, md or json'), { status: 400 });
  const prot = [idx.dir]; if (path.basename(idx.dir).toLowerCase() === 'work') prot.push(path.dirname(idx.dir));   // toolkit root too
  for (const d of prot.concat(o.refuse || [])) if (d && within(out, d)) throw Object.assign(new Error('will not write inside ' + d + ' (the index or a protected folder); pick another place'), { status: 400 });
  const res = search(idx, Object.assign({}, filter, { limit: 5000 }));
  if (o.dry) return { count: res.total, out, fmt, wrote: false };
  if (!fs.existsSync(path.dirname(out))) throw Object.assign(new Error('folder does not exist: ' + path.dirname(out)), { status: 400 });
  fs.writeFileSync(out, render(res.rows, fmt, { built: idx.built, filter }));
  return { count: res.rows.length, out, fmt, wrote: true };
}

module.exports = { search, show, faq, tools, stats, facets, exportRows, filterRows, render, snippet, DISCORD_SUB };
