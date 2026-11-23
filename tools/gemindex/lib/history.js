// gemindex history: the Historical sources category: first-hand and second-hand sources on the Second World War.
// Rows come from two places, read together:
//   1 the guide index (GEM External Index): rows whose category is history, read the way the toolkit reads them (toolkit.cs LinkList:
//     a guides.json row's "category"; builtin-edits.json Changes[].Category and Added[].Category; lib/load.js tabOf). Discord rows never
//     count; the archived forum copies are not part of it (they stay under `search --archived`).
//   2 the WW2 sources (lib/ww2.js): the source list (ww2-source-index.csv) in every release, and the documents of the database
//     (index.sqlite: catalogue + page text) in the larger -ww2 release or wherever ARSENAL_WW2_DIR points.
// States, said by available().ww2: 'full' (list + database: the text inside the documents can be searched), 'parts' (the database is in
// pieces, index.sqlite.parts, not put together yet: joinStart() does it, available().join says how far), 'list' (list only), 'none'. Without the WW2 folder the category shows the guide index's own rows.
// Per row: hand ('first'|'second'|null), kind (document type, 'mixed' for a collection of both, or null), nation, access, status (link
// check), class (the list's own word), codes (component codes), issuer, designation, year, parent (the source a document belongs to).
// Contract (the Documents page codes against it; add, never rename):
//   available(opt) -> { ok: true, dir, built, rows, sites, ww2: 'full'|'list'|'none', ww2Note, pages, docs, sources, note? } | { ok: false, why }
//   groups(opt) -> [{ id, title, kind: 'topic'|'sub'|'lang'|'hand'|'nation'|'access'|'type'|'issuer'|'year', count, from, to }]
//   rows({ group, q, offset, limit, data, ww2, topic, sub, lang, hand, nation, access, type, issuer, year }) -> { total, offset, rows }
//   text(id, { max, data, ww2 }) -> { id, title, url, archive, captured, text, ... } | null   (a guide index row's saved text, or a page 'wp<n>')
//   search({ q, offset, limit, filters, ww2 }) -> { total, capped, rows: [{ id, page, snippet, doc, url, source }] }   the text inside the documents
//   importRows(file, { data, dry }) -> { file, add, change, skip, wrote }   rows into a guide index data folder you name
//   opt.data names a guide index folder (else lib/load.js finds the shipped one); opt.ww2 names a WW2 folder (else lib/ww2.js finds it).
// Author: Imperator_Aug (ARSENAL, ia-3d8b94a5)
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./load'), S = require('./sources'), W = require('./ww2');

const HAND_TITLE = { first: 'First-hand sources', second: 'Second-hand sources', none: 'Not marked first or second hand' };
const lc = s => String(s || '').toLowerCase();
const fold = s => lc(s).replace(/armour/g, 'armor').replace(/colour/g, 'color');
const words = q => fold(q).split(/\s+/).filter(Boolean);
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim();
function handFrom(v) {
  const s = lc(v);
  if (/^(first|1|first-hand|firsthand|primary)$/.test(s)) return 'first';
  if (/^(second|2|second-hand|secondhand|secondary)$/.test(s)) return 'second';
  return null;
}
function handWords(s) {
  s = lc(s);
  if (/\b(first[- ]?hand|primary)\b/.test(s)) return 'first';
  if (/\b(second[- ]?hand|secondary)\b/.test(s)) return 'second';
  return null;
}
const yearOf = v => { const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(v || '')); return m ? +m[1] : null; };

// extra fields the toolkit's own rows do not carry, by url: from guides.json rows (lower-case names) and Added rows (the same names
// with a capital first letter). The toolkit ignores members it does not know.
const EXTRA = ['hand', 'kind', 'year', 'nation', 'access', 'status', 'class', 'codes', 'issuer', 'designation', 'parent'];
const cap = k => k[0].toUpperCase() + k.slice(1);
function extras(idx, hist) {
  const out = new Map();
  if (!hist.length) return out;
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
  const pickX = (x, name) => { const o = {}; for (const k of EXTRA) if (x[name(k)] != null) o[k] = x[name(k)]; return o; };
  if (hist.some(r => r.source !== 'added')) {
    const g = readJson(idx.files.guides), want = new Set(hist.map(r => r.url));
    for (const x of (g && Array.isArray(g.rows) ? g.rows : [])) if (x && want.has(clean(x.url))) out.set(clean(x.url), pickX(x, k => k));
  }
  if (idx.files.edits) {
    const e = readJson(idx.files.edits);
    for (const a of (e && Array.isArray(e.Added) ? e.Added : [])) if (a && a.Url) out.set(a.Url, Object.assign(out.get(a.Url) || {}, pickX(a, cap)));
  }
  return out;
}
const list = v => (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map(s => clean(s)).filter(Boolean);

const NO_IDX = { rows: [], files: {}, texts: () => new Map(), dir: '', built: '' };   // the guide index not found: WW2 rows only
const VIEWS = new WeakMap();
// view(idx, st) -> { rows, byId, ids, groups } once per loaded index and WW2 state
function view(idx, st) {
  idx = idx || NO_IDX;
  const c = VIEWS.get(idx);
  if (c && c.st === (st || null)) return c.v;
  const hist = idx.rows.filter(r => r.tab === 'history' && !r.discord);
  const ex = extras(idx, hist), texts = hist.length ? idx.texts() : new Map();
  const rows = hist.map(r => {
    const x = ex.get(r.url) || {}, a = r.archive;
    const hand = handFrom(x.hand) || handWords(r.comp) || handWords(r.sub);
    return { id: r.id, rec: 'index', title: r.title, url: a && a.original ? a.original : (/^text:/.test(r.url) ? '' : r.url), archive: a ? a.archiveUrl : '', captured: a && a.captured ? a.captured.slice(0, 10) : '',
      site: S.siteOf(r), lang: r.lang || '', hasText: texts.has(r.url), hand, kind: clean(x.kind) || null, year: yearOf(x.year), topic: r.comp || '', sub: r.sub || '', note: r.note || '', game: r.game,
      nation: clean(x.nation), access: clean(x.access), status: clean(x.status), class: clean(x.class), codes: list(x.codes), issuer: clean(x.issuer), designation: clean(x.designation), parent: clean(x.parent),
      pages: 0, _row: r, _hay: fold([r.title, r.comp, r.sub, r.note, r.url, x.kind, x.nation, x.issuer, x.designation, list(x.codes).join(' ')].join(' \u0001 ')) };
  });
  const have = new Set(rows.map(r => r.url));
  for (const w of st ? st.rows : []) {
    if (have.has(w.url) && w.rec === 'source') continue;   // the guide index already lists it
    rows.push({ id: w.id, rec: w.rec, title: w.title, url: w.url, archive: '', captured: '', site: w.site, lang: '', hasText: w.pages > 0 && st.mode === 'full', hand: w.hand, kind: w.kind, year: w.year,
      topic: w.topic, sub: w.sub, note: w.note, game: 'all', nation: w.nation, access: w.access, status: w.status, class: w.class, codes: w.codes, issuer: w.issuer, designation: w.designation,
      parent: w.parent, parentTitle: w.parentTitle || '', pages: w.pages, docId: w.docId,
      _row: { i: 1e9 + rows.length }, _hay: fold([w.title, w.topic, w.sub, w.note, w.url, w.kind, w.nation, w.issuer, w.designation, w.codes.join(' '), w.class].join(' \u0001 ')) });
  }
  rows.sort((a, b) => a.topic.localeCompare(b.topic) || a.sub.localeCompare(b.sub) || a.title.localeCompare(b.title) || a._row.i - b._row.i);
  const g = new Map();
  const add = (id, title, kind, row) => {
    let x = g.get(id);
    if (!x) { x = { id, title, kind, count: 0, from: null, to: null }; g.set(id, x); }
    x.count++;
    if (row.year) { if (x.from == null || row.year < x.from) x.from = row.year; if (x.to == null || row.year > x.to) x.to = row.year; }
  };
  const some = k => rows.some(r => r[k]);
  for (const r of rows) {
    add('topic:' + (r.topic || '(none)'), r.topic || 'No topic', 'topic', r);
    if (r.sub) add('sub:' + r.topic + '/' + r.sub, (r.topic ? r.topic + ': ' : '') + r.sub, 'sub', r);
    if (some('lang')) add('lang:' + (r.lang || 'none'), r.lang || 'Language not given', 'lang', r);
    add('hand:' + (r.hand || 'none'), HAND_TITLE[r.hand || 'none'], 'hand', r);
    if (some('nation')) add('nation:' + (r.nation || 'none'), r.nation || 'Nation not given', 'nation', r);
    if (some('access')) add('access:' + (r.access || 'none'), r.access ? 'Access: ' + r.access : 'Access not given', 'access', r);
    if (r.kind) add('type:' + r.kind, r.kind[0].toUpperCase() + r.kind.slice(1), 'type', r);
    if (r.issuer) add('issuer:' + r.issuer, r.issuer, 'issuer', r);
    if (r.year) add('year:' + r.year, String(r.year), 'year', r);
  }
  const order = ['topic', 'sub', 'lang', 'hand', 'nation', 'access', 'type', 'issuer', 'year'];
  const groups = [...g.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.kind === 'year' ? a.id.localeCompare(b.id) : b.count - a.count || a.id.localeCompare(b.id)));
  const v = { rows, byId: new Map(rows.map(r => [r.id, r])), ids: new Set(rows.filter(r => r.rec === 'index').map(r => r.id)), groups };
  VIEWS.set(idx, { st: st || null, v });
  return v;
}
// isMember(idx, row): a guide index row of the category (for stats and search --tab history)
const isMember = (idx, r) => r.tab === 'history' && !r.discord && !!idx.byId && idx.byId.get(r.id) === r;

// open(opt) -> { idx (or null), idxError, st (WW2 state, or null) }
function open(opt) {
  opt = opt || {};
  let idx = opt.idx || null, idxError = null;
  if (!idx) { try { idx = L.load({ data: opt.data, exeDir: opt.exeDir, defaultDir: opt.defaultDir, noDefault: opt.noDefault }); } catch (e) { idxError = e; } }
  let st = null;
  if (opt.ww2 !== false) { st = W.load({ ww2: opt.ww2, exeDir: opt.exeDir, pkgDir: opt.pkgDir, noDefault: opt.noWw2Default }); if (st.mode === 'none') st = null; }
  return { idx, idxError, st };
}
function need(opt) {
  const o = open(opt);
  if (!o.idx && !o.st) throw Object.assign(new Error(whyNot(o.idxError)), { status: 404, code: 'NOT_FOUND' });
  return o;
}
function whyNot(e) {
  if (e && e.code === 'NOT_FOUND') return 'The guide index was not found, and no WW2 sources folder either. ARSENAL looks for folders named gemindex and ww2sources next to ARSENAL.exe or in the package folder, ' +
    'then for the GEM External Index toolkit on the Desktop. Put the gemindex and ww2sources folders from the release back next to ARSENAL, or set GEM_INDEX_DIR and ARSENAL_WW2_DIR to them.';
  return 'The guide index could not be read: ' + (e && e.message ? e.message : String(e));
}
const PARTS_NOTE = 'The text inside the documents is stored in pieces in the ww2sources folder. ARSENAL puts them together once (Historical sources on the Documents page, or gemindex ww2-join); the list of sources works meanwhile.';
const LIST_ONLY = 'The text inside the documents comes with the larger download named ARSENAL-<version>-ww2. If you have it, or a folder holding index.sqlite, put index.sqlite into the ww2sources folder beside ARSENAL, or name its folder with ARSENAL_WW2_DIR.';

// available(opt) -> { ok: true, dir, built, rows, sites, ww2, ww2Note, docs, pages, sources, note? } | { ok: false, why }
function available(opt) {
  const o = open(opt);
  if (!o.idx && !o.st) return { ok: false, why: whyNot(o.idxError) };
  const v = view(o.idx, o.st), st = o.st;
  const mode = st ? (st.mode === 'full' ? 'full' : st.mode === 'parts' ? 'parts' : 'list') : 'none';
  const res = { ok: true, dir: o.idx ? o.idx.dir : '', built: o.idx ? o.idx.built : '', rows: v.rows.length, sites: new Set(v.rows.map(r => r.site)).size, ww2: mode,
    sources: st ? st.sources.length : 0, docs: st ? st.docs.length : 0, pages: st && mode === 'full' ? st.pages : 0, ww2Dir: st ? (st.loc.db || st.loc.parts || st.loc.list).dir : '' };
  if (mode === 'full') res.ww2Note = 'The text inside the documents can be searched. It is machine-read: check every figure against the scan before citing it.';
  else if (mode === 'parts') { res.ww2Note = PARTS_NOTE; res.partsMb = Math.round(st.parts.bytes / 1048576); res.join = W.joinStatus(); }
  else if (mode === 'list') res.ww2Note = (st.dbError ? st.dbError + ' ' : '') + LIST_ONLY;
  else res.ww2Note = 'The WW2 sources folder (ww2sources) was not found, so only the guide index\'s own historical rows show. It ships beside ARSENAL in every release; ARSENAL_WW2_DIR can name it.';
  if (!v.rows.length) res.note = 'The guide index holds no historical sources yet. They come with the index when its historical sources list is added.';
  return res;
}

// groups(opt) -> [{ id, title, kind, count, from, to }]
function groups(opt) { const o = need(opt); return view(o.idx, o.st).groups.map(x => Object.assign({}, x)); }

const GROUP_RE = /^(topic|sub|lang|hand|nation|access|type|issuer|year):./;
function inGroup(r, g) {
  const i = g.indexOf(':'), k = g.slice(0, i), v = g.slice(i + 1);
  if (k === 'topic') return (r.topic || '(none)') === v;
  if (k === 'sub') return r.topic + '/' + r.sub === v;
  if (k === 'lang') return (r.lang || 'none') === v;
  if (k === 'hand') return (r.hand || 'none') === v;
  if (k === 'nation') return (r.nation || 'none') === v;
  if (k === 'access') return (r.access || 'none') === v;
  if (k === 'type') return r.kind === v;
  if (k === 'issuer') return r.issuer === v;
  return String(r.year) === v;
}
const pubRow = (r, extra) => Object.assign({ id: r.id, title: r.title, url: r.url, archive: r.archive, captured: r.captured, site: r.site, lang: r.lang, hasText: r.hasText,
  hand: r.hand, kind: r.kind, year: r.year, topic: r.topic, sub: r.sub, note: r.note, game: r.game, rec: r.rec, nation: r.nation, access: r.access, status: r.status, class: r.class,
  codes: r.codes, issuer: r.issuer, designation: r.designation, parent: r.parent, parentTitle: r.parentTitle || '', pages: r.pages }, extra || {});
function snippet(text, ws, width) {
  width = width || 220;
  const l = lc(text); let at = -1;
  for (const w of ws) { const i = l.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return '';
  const s = Math.max(0, at - Math.floor(width / 3));
  return (s > 0 ? '... ' : '') + text.slice(s, s + width).replace(/\s+/g, ' ').trim() + (s + width < text.length ? ' ...' : '');
}
const eqi = (a, b) => b == null || b === '' || lc(a) === lc(b);

// rows({ group, q, offset, limit, ... }) -> { total, offset, rows }; q = words in titles, topics, notes, issuers, designations (not the page text: search())
function rows(o) {
  o = o || {};
  const { idx, st } = need(o), v = view(idx, st);
  const g = String(o.group || '');
  if (g && !GROUP_RE.test(g)) throw Object.assign(new Error('group must look like topic:<name>, sub:<topic>/<sub>, lang:<code>, hand:first|second|none, nation:<name>, access:<word>, type:<kind>, issuer:<name> or year:<yyyy>'), { status: 400 });
  const ws = words(o.q), texts = o.text && idx ? idx.texts() : null;
  const offset = Math.max(0, +o.offset || 0), limit = Math.max(1, Math.min(5000, +o.limit || 50));
  const hits = [];
  for (const r of v.rows) {
    if (g && !inGroup(r, g)) continue;
    if (!eqi(r.topic, o.topic) || !eqi(r.sub, o.sub) || !eqi(r.lang, o.lang) || !eqi(r.hand || 'none', o.hand) || !eqi(r.nation, o.nation) || !eqi(r.access, o.access) ||
      !eqi(r.kind, o.type) || !eqi(r.issuer, o.issuer) || !eqi(r.year == null ? '' : String(r.year), o.year)) continue;
    let inText = false;
    if (ws.length) {
      let ok = true, t = null;
      for (const w of ws) {
        if (r._hay.includes(w)) continue;
        if (texts && r.rec === 'index' && r.hasText) { if (t == null) t = fold(texts.get(r._row.url) || ''); if (t.includes(w)) { inText = true; continue; } }
        ok = false; break;
      }
      if (!ok) continue;
    }
    hits.push({ r, inText });
  }
  const page = hits.slice(offset, offset + limit).map(h => pubRow(h.r, h.inText ? { inText: true, snippet: snippet(texts.get(h.r._row.url) || '', ws) } : undefined));
  return { total: hits.length, offset, rows: page };
}

// search({ q, offset, limit, filters, ww2 }) -> the page text search of the WW2 database (lib/ww2.js); status 409 + plain why without it
function search(o) {
  o = o || {};
  const st = W.load({ ww2: o.ww2, exeDir: o.exeDir, pkgDir: o.pkgDir, noDefault: o.noWw2Default });
  if (st.mode !== 'full' && st.mode !== 'db') throw Object.assign(new Error(st.dbError || (st.mode === 'parts' ? PARTS_NOTE : st.mode === 'list' ? LIST_ONLY : 'The WW2 sources folder (ww2sources) was not found.')), { status: 409 });
  return W.search(st, { q: o.q, offset: o.offset, limit: o.limit, filters: o.filters });
}

// joinStart({ ww2, freeSpace }) / joinStatus(): put the pieces of the document database together (lib/ww2parts.js), in the background,
// one job per process -> { state: 'idle'|'running'|'done'|'failed'|'none', done, total, doneMb, totalMb, why, piece, ms }
function joinStart(o) { o = o || {}; return W.joinStart({ ww2: o.ww2, exeDir: o.exeDir, pkgDir: o.pkgDir, noDefault: o.noWw2Default, freeSpace: o.freeSpace }); }
function joinStatus() { return W.joinStatus(); }

// text(id, { max, data, ww2 }) -> a guide index row's saved text, or one page of a WW2 document ('wp<n>'), or null
function text(id, o) {
  o = o || {};
  id = String(id || '').trim();
  if (/^wp\d+$/.test(id)) { const st = W.load({ ww2: o.ww2, exeDir: o.exeDir, pkgDir: o.pkgDir, noDefault: o.noWw2Default }); return W.page(st, id, { max: o.max }); }
  const { idx, st } = need(o), r = view(idx, st).byId.get(id);
  if (!r || r.rec !== 'index' || !r.hasText) return null;
  const full = idx.texts().get(r._row.url) || '';
  const max = Math.max(200, Math.min(200000, +o.max || 20000));
  return { id: r.id, title: r.title, url: r.url, archive: r.archive, captured: r.captured, text: full.slice(0, max), chars: full.length, more: full.length > max };
}

// summary(idx, opt) for `gemindex sources` / stats: the guide index's own rows, plus the WW2 counts when found
function summary(idx, opt) {
  const st = opt && opt.ww2 === false ? null : W.load(Object.assign({}, opt || {}));
  const v = view(idx, null), hand = {};
  for (const r of v.rows) hand[r.hand || 'none'] = (hand[r.hand || 'none'] || 0) + 1;
  return { rows: v.rows.length, hand, withText: v.rows.filter(r => r.hasText).length, topics: v.groups.filter(x => x.kind === 'topic').length,
    ww2: st ? { mode: st.mode, sources: st.sources.length, docs: st.docs.length, pages: st.mode === 'full' ? st.pages : 0 } : null };
}

// ---- import: rows from a csv (the toolkit's own history.csv export shape) or json, into <data>/builtin/builtin-edits.json
const parseCsv = W.parseCsv;
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null && String(o[k]).trim() !== '') return clean(o[k]); return ''; };
function readImport(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let list;
  if (/\.json$/i.test(file)) {
    let j; try { j = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { throw Object.assign(new Error(file + ' does not parse as JSON: ' + e.message), { status: 400 }); }
    list = Array.isArray(j) ? j : j && Array.isArray(j.rows) ? j.rows : null;
    if (!list) throw Object.assign(new Error(file + ': want a JSON list of rows, or {"rows": [...]}'), { status: 400 });
    list = list.map(x => { const o = {}; for (const k of Object.keys(x || {})) o[lc(k)] = x[k]; return o; });
  } else if (/\.csv$/i.test(file)) list = parseCsv(raw);
  else throw Object.assign(new Error('import takes a .csv or .json file'), { status: 400 });
  return list.map(o => ({ url: pick(o, 'url', 'address'), title: pick(o, 'title'), game: pick(o, 'game'), comp: pick(o, 'topic', 'comp'), sub: pick(o, 'sub-topic', 'sub', 'subtopic'),
    lang: pick(o, 'language', 'lang'), note: pick(o, 'note'), hand: pick(o, 'hand'), kind: pick(o, 'kind', 'type'), year: pick(o, 'year', 'date') }));
}
// importRows(file, { data, dry }) -> { file, target, add: [titles], change: [titles], skip: [{title, why}], wrote }
function importRows(file, o) {
  o = o || {};
  if (!o.data) throw Object.assign(new Error('history --import needs --data <folder>: the data folder the rows go into'), { status: 400 });
  if (!file || !fs.existsSync(file)) throw Object.assign(new Error('no such file: ' + (file || '(none)')), { status: 400 });
  const loc = L.probe(o.data);
  if (!loc) throw Object.assign(new Error('no guides.json in ' + o.data + ' (or its work/ folder): not a guide index data folder'), { status: 400 });
  const idx = L.load({ data: loc.dir });
  const target = loc.edits || (fs.existsSync(path.join(loc.dir, 'builtin')) ? path.join(loc.dir, 'builtin', 'builtin-edits.json') : path.join(loc.dir, 'builtin-edits.json'));
  let edits = { Changes: [], Added: [] };
  if (fs.existsSync(target)) {
    try { edits = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^﻿/, '')); } catch (e) { throw Object.assign(new Error(target + ' does not parse; fix or remove it first: ' + e.message), { status: 400 }); }
    if (!edits || typeof edits !== 'object') edits = {};
    if (!Array.isArray(edits.Changes)) edits.Changes = [];
    if (!Array.isArray(edits.Added)) edits.Added = [];
  }
  const res = { file: path.resolve(file), target, add: [], change: [], skip: [], wrote: false };
  const seen = new Set();
  for (const r of readImport(file)) {
    const name = r.title || r.url || '(no title)';
    if (!/^https?:\/\/\S+$/i.test(r.url) || r.url.length >= 2000) { res.skip.push({ title: name, why: 'needs a web address (http or https)' }); continue; }
    if (seen.has(r.url)) { res.skip.push({ title: name, why: 'twice in the file' }); continue; }
    seen.add(r.url);
    const had = idx.byUrl.get(r.url);
    if (had && had.tab === 'history') { res.skip.push({ title: name, why: 'already a historical source' }); continue; }
    if (had && had.source !== 'added') {   // a row of the list moves to the category, as the toolkit's Add does for a known address
      const ch = edits.Changes.find(c => c && c.Url === r.url);
      if (ch) ch.Category = 'history'; else edits.Changes.push({ Url: r.url, Category: 'history', Game: null, Comp: null, Sub: null });
      res.change.push(name); continue;
    }
    const a = { Url: r.url, Title: r.title, Game: r.game || 'all', Comp: r.comp || 'Historical sources', Sub: r.sub, Lang: r.lang, Note: r.note, Category: 'history' };
    if (handFrom(r.hand)) a.Hand = handFrom(r.hand);
    if (r.kind) a.Kind = r.kind;
    if (yearOf(r.year)) a.Year = yearOf(r.year);
    const i = edits.Added.findIndex(x => x && x.Url === r.url);
    if (i >= 0) edits.Added[i] = a; else edits.Added.push(a);
    res.add.push(name);
  }
  if (o.dry || (!res.add.length && !res.change.length)) return res;
  const why = require('../../lib/writeguard').refuseWrite(path.dirname(target), { purpose: 'add historical sources to the guide index', allowGameMods: false });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.part', JSON.stringify(edits));
  fs.renameSync(target + '.part', target);
  L.forget();
  res.wrote = true;
  return res;
}


module.exports = { available, groups, rows, text, search, joinStart, joinStatus, view, isMember, summary, importRows, readImport, parseCsv, handFrom, HAND_TITLE, LIST_ONLY, PARTS_NOTE };
