// ww2: the WW2 sources behind the Historical sources category. Read-only, offline, plain node (node:sqlite for the documents).
// Two parts, found apart (a release ships the list in every zip and the database only in the -ww2 zips):
//   list      ww2-source-index.csv: first-hand and second-hand source collections (Name, URL, Nation, Access, Class, Components, LinkStatus, Note)
//   database  index.sqlite: catalogue of the documents (docs + doc_cat) and their page text (FTS5 table pages, page_meta), plus the
//             search word lists beside it (search-terms.json or aliases.json, weapon-names.json)
// Where: --ww2 <dir> (opt.ww2), env ARSENAL_WW2_DIR, <exe dir>/ww2sources, <package root>/ww2sources. A folder may hold both parts or one;
// In git the database lives as pieces (index.sqlite.parts/, lib/ww2parts.js): state 'parts' until joinStart() puts it together.
// the dev layout of the source tool (<dir>/ww2-source-index.csv, <dir>/app/tool/data/index.sqlite, <dir>/app/tool/*.json) is read too.
// The search is a port of the source tool's own engine (app/tool/engine.mjs: tiers exact, other language, OCR variants, all but one
// word, any word; FTS5 operators passed through as written), without its meaning helper, scans and local PDFs.
// The page text is machine-read: figures must be checked against the scan before citing.
// Author: Imperator_Aug (ARSENAL, ia-868312f9)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// ---- component codes (legend of ww2-source-index.html): group letter, then code -> plain words
const GROUPS = { W: 'Weapons and equipment specifications', A: 'Action reports and accounts', O: 'Organization', T: 'Tactics and doctrine', X: 'Cross-cutting', D: 'Direct files: raw PDFs and scans' };
const LEGEND = {
  'W.SA': 'Small arms', 'W.ART': 'Artillery, ammunition, and ballistics', 'W.AFV': 'Armored vehicles', 'W.AIR': 'Aircraft', 'W.NAV': 'Ships and naval weapons',
  'W.ELEC': 'Radar, communications, and fire control', 'W.ENEMY': 'Enemy equipment intelligence', 'W.TECHINT': 'Postwar technical intelligence',
  'A.LAND': 'Land operations', 'A.NAVAL': 'Naval operations', 'A.AIR': 'Air operations', 'A.CMD': 'High command and intelligence', 'A.ACCOUNT': 'Memoirs and oral history',
  'A.INTERROG': 'Interrogations and postwar studies', 'A.OFFICIAL': 'Official histories',
  'O.TOE': 'Tables of organization and equipment', 'O.OOB': 'Orders of battle', 'O.STAT': 'Strength, losses, and production',
  'T.LAND': 'Land doctrine and field manuals', 'T.NAVAL': 'Naval doctrine', 'T.AIR': 'Air doctrine', 'T.LESSONS': 'Combat lessons', 'T.ENEMY': 'Enemy tactics', 'T.STUDY': 'Staff and school studies',
  'X.GEN': 'National archives and catalogs', 'X.LIB': 'Digital libraries', 'X.FIND': 'Finding aids and guides',
  'D.SA': 'Small arms files', 'D.ART': 'Artillery, ammunition, and explosives files', 'D.AFV': 'Armored and motor vehicle files', 'D.AIR': 'Aircraft files', 'D.NAV': 'Naval files',
  'D.ELEC': 'Radar, radio, and fire control files', 'D.ENEMY': 'Axis, Soviet, and other foreign files', 'D.RES': 'NDRC, OSRD, and DTIC research reports',
  'D.DOC': 'Doctrine and field manuals', 'D.CARL': 'Archived CARL manuals',
};
const codesOf = s => String(s || '').split(/[;,]/).map(x => x.trim()).filter(x => /^[A-Z]\.[A-Z]+$/.test(x));
function topicOf(codes) {
  const c = codes[0];
  if (!c) return { topic: '', sub: '' };
  return { topic: GROUPS[c[0]] || 'Other', sub: LEGEND[c] || c };
}
const HAND = { primary: 'first', secondary: 'second' };
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim();
const siteOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

// ---- csv (RFC 4180, BOM, CRLF); header names lower-cased
function parseCsv(s) {
  const out = []; let row = [], cell = '', q = false;
  s = String(s).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) out.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) out.push(row); }
  if (!out.length) return [];
  const head = out[0].map(h => h.toLowerCase().trim());
  return out.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i]; }); return o; });
}

// ---- finding the two parts
const isFile = f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } };
const first = l => l.find(isFile) || null;
// A folder with index.sqlite.parts/parts.json (the git layout, lib/ww2parts.js) uses the joined file that matches the pieces (<dir>/index.sqlite,
// else the per-user copy); without one it is in state 'parts' (p.parts set, p.db null) until ww2-join or the Documents page puts it together.
function probe(dir) {
  if (!dir) return null;
  const tool = path.join(dir, 'app', 'tool');
  const csv = first([path.join(dir, 'ww2-source-index.csv')]);
  const pr = require('./ww2parts').resolve(dir);
  const db = pr ? pr.db : first([path.join(dir, 'index.sqlite'), path.join(tool, 'data', 'index.sqlite')]);
  const parts = pr && !pr.db ? pr.parts : null;
  if (!csv && !db && !parts) return null;
  const at = db && path.dirname(db) === path.join(tool, 'data') ? tool : dir;
  return { dir: path.resolve(dir), csv, db, parts, terms: first([path.join(at, 'search-terms.json'), path.join(at, 'aliases.json')]), weapons: first([path.join(at, 'weapon-names.json')]) };
}
function candidates(opt) {
  opt = opt || {};
  const c = [];
  if (opt.ww2) c.push(['--ww2', opt.ww2]);
  if (process.env.ARSENAL_WW2_DIR) c.push(['ARSENAL_WW2_DIR', process.env.ARSENAL_WW2_DIR]);
  // ARSENAL_WW2_NODEFAULT=1 (tests): the folders beside the exe and in the package are not looked at unless the caller names them,
  // so a test never reads the real WW2 folder that now ships in the repository
  const noDef = process.env.ARSENAL_WW2_NODEFAULT === '1';
  if (!opt.noDefault) {
    if (!noDef || opt.exeDir) c.push(['exe', path.join(opt.exeDir || path.dirname(process.execPath), 'ww2sources')]);
    if (!noDef || opt.pkgDir) c.push(['package', path.join(opt.pkgDir || path.join(__dirname, '..', '..', '..'), 'ww2sources')]);
  }
  return c;
}
// locate(opt) -> { list: {dir, csv, from} | null, db: {dir, file, terms, weapons, from} | null, parts: {dir, file, bytes, sha256, count, stored, from} | null, tried }
// the first folder with a database or pieces decides (a named folder in state 'parts' is joined, not passed over for a later one)
function locate(opt) {
  const tried = []; let list = null, db = null, parts = null;
  for (const [from, dir] of candidates(opt)) {
    tried.push(dir);
    const p = probe(dir); if (!p) continue;
    if (!list && p.csv) list = { dir: p.dir, csv: p.csv, from };
    if (!db && !parts && p.db) db = { dir: p.dir, file: p.db, terms: p.terms, weapons: p.weapons, from };
    else if (!db && !parts && p.parts) parts = Object.assign({ from }, p.parts);
    if (list && (db || parts)) break;
  }
  if (db && (!db.terms || !db.weapons) && list) { const p = probe(list.dir); db.terms = db.terms || p.terms; db.weapons = db.weapons || p.weapons; }
  return { list, db, parts, tried };
}

// ---- node:sqlite, once per process per file
let SQL;
function sqlite() {
  if (SQL !== undefined) return SQL;
  try { SQL = require('node:sqlite'); } catch (e) { SQL = null; }
  return SQL;
}
const NO_SQLITE = 'This Node.js has no built-in SQLite (node:sqlite, Node.js 22.5 or newer), so the text inside the documents cannot be searched. The list of sources still works.';
const DBS = new Map();
function openDb(file) {
  if (DBS.has(file)) return DBS.get(file);
  const S = sqlite();
  if (!S) throw Object.assign(new Error(NO_SQLITE), { code: 'NO_SQLITE' });
  const db = new S.DatabaseSync(file, { readOnly: true });
  try { db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-32000;'); } catch (e) { /* older builds */ }
  DBS.set(file, db);
  return db;
}
function closeDb(file) {
  const db = DBS.get(file);
  if (db) { try { db.close(); } catch (e) { /* already closed */ } DBS.delete(file); }
  ENGINES.delete(file); CACHE.clear();
}
const hasTable = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(t);

// ---- the rows: sources from the list, documents from the catalogue; a document at a source's own address is that source
const CACHE = new Map();
const stamp = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
function norm(u) { return String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[/?#]+$/, '').toLowerCase(); }
function load(opt) {
  const loc = locate(opt);
  const key = JSON.stringify([loc.list && loc.list.csv, loc.list && stamp(loc.list.csv), loc.db && loc.db.file, loc.db && stamp(loc.db.file), loc.parts && loc.parts.file, loc.parts && loc.parts.sha256]);
  if (CACHE.has(key)) return CACHE.get(key);
  const st = { loc, sources: [], docs: [], rows: [], byId: new Map(), pages: 0, dbError: null, mode: 'none', parts: loc.parts };
  if (loc.list) {
    for (const r of parseCsv(fs.readFileSync(loc.list.csv, 'utf8'))) {
      const url = clean(r.url), codes = codesOf(r.components), t = topicOf(codes), cls = clean(r.class);
      if (!/^https?:\/\//i.test(url)) continue;
      const hand = HAND[cls.toLowerCase()] || null;
      st.sources.push({ id: 'ws' + sha(url), rec: 'source', title: clean(r.name) || url, url, site: siteOf(url), nation: clean(r.nation), access: clean(r.access), status: clean(r.linkstatus),
        class: cls, hand, kind: hand ? null : (cls ? cls.toLowerCase() : null), codes, topic: t.topic, sub: t.sub, note: clean(r.note), year: null, issuer: '', designation: '', parent: '', pages: 0, docId: '' });
    }
  }
  if (loc.db) {
    try {
      const db = openDb(loc.db.file), cat = hasTable(db, 'doc_cat');
      const q = `SELECT d.doc_id, d.title, d.nation, d.components, d.source_url, d.n_pages${cat ? ', c.designation, c.kind, c.issuer, c.year, c.citation' : ''} FROM docs d${cat ? ' LEFT JOIN doc_cat c ON c.doc_id = d.doc_id' : ''}`;
      st.docs = db.prepare(q).all();
      st.pages = st.docs.reduce((s, d) => s + (+d.n_pages || 0), 0);
    } catch (e) { st.dbError = e.code === 'NO_SQLITE' ? NO_SQLITE : 'The document database could not be read: ' + e.message; st.docs = []; }
  }
  const srcBy = new Map(st.sources.map(s => [norm(s.url), s]));
  const parentOf = u => {   // the source whose address is the longest leading part of this one
    let n = norm(u);
    while (n) { const s = srcBy.get(n); if (s) return s; const i = Math.max(n.lastIndexOf('/'), n.lastIndexOf('?'), n.lastIndexOf('#')); if (i < 0) break; n = n.slice(0, i); }
    return null;
  };
  const docRows = [];
  for (const d of st.docs) {
    const url = clean(d.source_url), codes = codesOf(d.components), t = topicOf(codes);
    const info = { docId: d.doc_id, designation: clean(d.designation), issuer: clean(d.issuer), year: +d.year || null, pages: +d.n_pages || 0, citation: clean(d.citation) };
    const same = srcBy.get(norm(url));
    if (same && !same.docId) { Object.assign(same, info, { kind: clean(d.kind) || same.kind }); continue; }
    const p = same || parentOf(url);
    docRows.push(Object.assign({ id: 'wd' + sha(d.doc_id), rec: 'document', title: clean(d.title) || info.designation || url, url: /^https?:\/\//i.test(url) ? url : '', site: siteOf(url), nation: clean(d.nation),
      access: p ? p.access : '', status: '', class: p ? p.class : '', hand: p ? p.hand : null, kind: clean(d.kind) || null, codes, topic: t.topic, sub: t.sub, note: '', parent: p ? p.id : '', parentTitle: p ? p.title : '' }, info));
  }
  st.rows = st.sources.concat(docRows);
  st.byId = new Map(st.rows.map(r => [r.id, r]));
  st.byDoc = new Map(st.rows.filter(r => r.docId).map(r => [r.docId, r]));
  // 'parts': the database is in pieces (index.sqlite.parts) and not put together yet; the list works meanwhile
  st.mode = loc.list && loc.db && !st.dbError ? 'full' : loc.parts ? 'parts' : loc.list ? 'list' : loc.db && !st.dbError ? 'db' : 'none';
  CACHE.set(key, st);
  return st;
}
function forget() { CACHE.clear(); }

// ---- page search (port of engine.mjs, plain node)
const STOP = new Set('a an and are as at be by for from in is it of on or that the this to was with'.split(' '));
const CJK_RANGE = '぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ';
const CJK = new RegExp(`[${CJK_RANGE}]`), CJK_PARTS = new RegExp(`[${CJK_RANGE}]|[^${CJK_RANGE}]+`, 'g');
const BAD = /["\u0000-\u001f]/g;
const OPS = /\b(AND|OR|NOT|NEAR)\b|\*/;
function tokenize(s) {
  return String(s).normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    .map(t => (CJK.test(t) ? t : t.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')));
}
const phrase = toks => `"${toks.flatMap(t => (CJK.test(t) ? t.match(CJK_PARTS) : [t])).join(' ').replace(BAD, '')}"`;
function formToks(form) {
  return form.trim().split(/\s+/).flatMap(w => {
    const star = w.endsWith('*');
    const toks = tokenize(w.replace(/\*+$/, '')).flatMap(t => (CJK.test(t) ? t.match(CJK_PARTS) : [t]));
    if (star && toks.length) toks[toks.length - 1] += '*';
    return toks;
  });
}
function ftsForm(form) {
  const toks = formToks(form);
  if (!toks.some(t => t.endsWith('*'))) return phrase(toks);
  return toks.map(t => `"${t.replace(/\*$/, '').replace(BAD, '')}"${t.endsWith('*') ? '*' : ''}`).join(' + ');
}
const operatorText = text => text.replace(new RegExp(`"[^"]*"|[${CJK_RANGE}]+`, 'g'), m => (CJK.test(m) ? phrase([m.replace(/"/g, '').replace(/\s+/g, '')]) : m));
function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < low) low = cur[j]; }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const readJson = f => { try { return f ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : null; } catch (e) { return null; } };

const ENGINES = new Map();
function engine(st) {
  const file = st.loc.db.file;
  if (ENGINES.has(file)) return ENGINES.get(file);
  const db = openDb(file), e = { db, aliases: new Map(), translations: new Map(), longestKey: 1, variantCache: new Map() };
  e.hasVocab = hasTable(db, 'vocab'); e.hasLang = hasTable(db, 'page_lang'); e.hasCat = hasTable(db, 'doc_cat');
  const terms = readJson(st.loc.db.terms) || {}, weapons = readJson(st.loc.db.weapons) || {};
  const addGroup = (names, extra) => {
    const group = names.map(tokenize).filter(t => t.length);
    group.forEach((toks, i) => {
      if (!e.aliases.has(toks[0])) e.aliases.set(toks[0], []);
      const l = e.aliases.get(toks[0]);
      if (extra && l.some(a => a.toks.join(' ') === toks.join(' '))) return;
      l.push({ toks, group, written: names, own: names[i] });
    });
  };
  for (const g of Array.isArray(terms.groups) ? terms.groups : []) if (Array.isArray(g)) addGroup(g, false);
  for (const w of Array.isArray(weapons.groups) ? weapons.groups : []) if (w && Array.isArray(w.names)) addGroup(w.names, true);
  for (const l of e.aliases.values()) l.sort((a, b) => b.toks.length - a.toks.length);
  for (const t of Array.isArray(terms.translations) ? terms.translations : []) for (const w of t.en || []) {
    const k = tokenize(w).join(' '); if (!k) continue;
    if (!e.translations.has(k)) e.translations.set(k, []);
    const l = e.translations.get(k);
    for (const f of t.forms || []) if (!l.some(x => x[0] === f[0] && x[1] === f[1])) l.push(f);
  }
  e.longestKey = Math.max(1, ...[...e.translations.keys()].map(k => k.split(' ').length));
  if (e.hasVocab) {
    e.pagesOf = db.prepare('SELECT pages FROM vocab WHERE term=?');
    e.fwd = db.prepare('SELECT term, pages FROM vocab WHERE term>=? AND term<? AND len BETWEEN ? AND ? LIMIT 4000');
    e.bwd = db.prepare('SELECT term, pages FROM vocab WHERE rev>=? AND rev<? AND len BETWEEN ? AND ? LIMIT 4000');
  }
  ENGINES.set(file, e);
  return e;
}
function wordConcept(e, toks) {
  const label = toks.join(' ');
  if (toks.length === 1 && CJK.test(toks[0])) return { label, kind: 'cjk', toks, alts: [phrase(toks)] };
  if (toks.length > 1) return { label, kind: 'phrase', toks, alts: [phrase(toks)] };
  const t = toks[0], alts = [phrase([t])];
  if (/^\p{L}{4,}$/u.test(t) && e.hasVocab) { const other = t.endsWith('s') ? t.slice(0, -1) : t + 's'; if (e.pagesOf.get(other)) alts.push(phrase([other])); }
  return { label, kind: 'word', toks, alts, stop: STOP.has(t) };
}
function parse(e, text) {
  const concepts = [], quotedRe = /"([^"]+)"/g;
  for (const m of text.matchAll(quotedRe)) { const toks = tokenize(m[1]); if (toks.length) concepts.push({ label: m[1], alts: [phrase(toks)], kind: 'quoted', toks }); }
  const chunks = text.replace(quotedRe, ' ').split(/\s+/).filter(Boolean).map(tokenize).filter(c => c.length);
  const flat = [];
  chunks.forEach((c, i) => c.forEach((t, j) => flat.push({ t, start: j === 0, end: j === c.length - 1 })));
  for (let i = 0; i < flat.length;) {
    let hit = null;
    if (flat[i].start) for (const a of e.aliases.get(flat[i].t) || []) {
      const end = i + a.toks.length - 1;
      if (end < flat.length && flat[end].end && a.toks.every((t, k) => flat[i + k].t === t)) { hit = a; break; }
    }
    if (hit) { concepts.push({ label: hit.toks.join(' '), alts: hit.group.map(phrase), kind: 'alias', toks: hit.toks }); i += hit.toks.length; continue; }
    let j = i; while (!flat[j].end) j++;
    concepts.push(wordConcept(e, flat.slice(i, j + 1).map(f => f.t)));
    i = j + 1;
  }
  let useful = concepts.filter(c => !c.stop); if (!useful.length) useful = concepts;
  const seen = new Set();
  return useful.filter(c => !seen.has(c.label) && seen.add(c.label));
}
function variants(e, word) {
  if (!e.hasVocab || !/^\p{L}{5,}$/u.test(word) || CJK.test(word)) return [];
  if (e.variantCache.has(word)) return e.variantCache.get(word);
  const max = word.length >= 8 ? 2 : 1, half = Math.ceil(word.length / 2), own = (e.pagesOf.get(word) || {}).pages || 0;
  const lo = word.length - max, hi = word.length + max, rev = [...word].reverse().join(''), pre = word.slice(0, half), suf = rev.slice(0, half);
  const seen = new Map();
  for (const r of [...e.fwd.all(pre, pre + '\u{10ffff}', lo, hi), ...e.bwd.all(suf, suf + '\u{10ffff}', lo, hi)]) seen.set(r.term, r.pages);
  const out = [];
  for (const [term, pages] of seen) {
    if (term === word || term === word + 's' || term + 's' === word) continue;
    if (own && pages > own * 0.2) continue;
    const d = levenshtein(word, term, max); if (d <= max) out.push({ term, pages, d });
  }
  out.sort((a, b) => a.d - b.d || b.pages - a.pages);
  const top = out.slice(0, 12); e.variantCache.set(word, top); return top;
}
function translate(e, concepts) {
  if (!e.translations.size) return null;
  const group = alts => (alts.length > 1 ? `(${alts.join(' OR ')})` : alts[0]);
  const units = []; let used = 0;
  for (let i = 0; i < concepts.length;) {
    let hit = null, len = 0;
    for (let n = Math.min(e.longestKey, concepts.length - i); n >= 1 && !hit; n--) {
      const span = concepts.slice(i, i + n);
      const keys = n === 1 && span[0].kind === 'alias' ? [span[0].toks.join(' '), ...span[0].alts.map(a => a.replace(/"/g, ''))] : [span.map(c => c.toks.join(' ')).join(' ')];
      for (const k of keys) if (e.translations.has(k)) { hit = e.translations.get(k); len = n; break; }
    }
    if (!hit) { units.push(group(concepts[i].alts)); i++; continue; }
    const own = concepts.slice(i, i + len).map(c => group(c.alts)).join(' AND ');
    units.push(`(${len > 1 ? `(${own})` : own} OR ${hit.map(f => ftsForm(f[1])).join(' OR ')})`);
    used++; i += len;
  }
  return used ? units.join(' AND ') : null;
}
// filters: nation, component (code), kind, issuer, year_from, year_to, lang (two letters or "other")
function filterSql(e, f) {
  const where = [], args = [];
  if (f.nation) { where.push('nation = ?'); args.push(String(f.nation)); }
  if (f.component) { where.push("(';' || components || ';') LIKE ?"); args.push(`%;${String(f.component)};%`); }
  if (e.hasCat) {
    const cat = [];
    if (f.kind) { cat.push('kind = ?'); args.push(String(f.kind)); }
    if (f.issuer) { cat.push('issuer = ?'); args.push(String(f.issuer)); }
    if (+f.year_from) { cat.push('year >= ?'); args.push(+f.year_from); }
    if (+f.year_to) { cat.push('year <= ?'); args.push(+f.year_to); }
    if (cat.length) where.push(`doc_id IN (SELECT doc_id FROM doc_cat WHERE ${cat.join(' AND ')})`);
  }
  let sql = where.length ? `AND m.doc_id IN (SELECT doc_id FROM docs WHERE ${where.join(' AND ')})` : '';
  if (f.lang && e.hasLang && /^(other|[a-z]{2})$/.test(f.lang)) {
    if (f.lang === 'other') sql += " AND m.rowid IN (SELECT rowid FROM page_lang WHERE lang NOT IN ('en', ''))";
    else { sql += ' AND m.rowid IN (SELECT rowid FROM page_lang WHERE lang = ?)'; args.push(f.lang); }
  }
  return { sql, args };
}
function rankRows(e, expr, f, limit) {
  const { sql, args } = filterSql(e, f);
  return e.db.prepare(`SELECT pages.rowid AS id, m.doc_id, bm25(pages) AS score FROM pages JOIN page_meta m ON m.rowid = pages.rowid WHERE pages MATCH ? ${sql} ORDER BY score LIMIT ?`).all(expr, ...args, limit);
}
const TOP = 300;
function rank(e, text, f) {
  const out = [], seen = new Set();
  const take = (rows, tier, expr) => { for (const r of rows) if (!seen.has(r.id) && out.length < TOP) { seen.add(r.id); out.push({ id: r.id, doc_id: r.doc_id, tier, expr }); } };
  if (OPS.test(text)) { const w = operatorText(text); take(rankRows(e, w, f, TOP), 1, w); return { rows: out, mode: 'operators', terms: tokenize(text.replace(/\b(AND|OR|NOT|NEAR)\b/g, ' ')).filter(t => !STOP.has(t)) }; }
  const concepts = parse(e, text);
  if (!concepts.length) return { rows: [], mode: 'empty', terms: [] };
  const group = alts => (alts.length > 1 ? `(${alts.join(' OR ')})` : alts[0]);
  const exact = concepts.map(c => group(c.alts)).join(' AND ');
  take(rankRows(e, exact, f, TOP), 1, exact);
  const tr = f.strict ? null : translate(e, concepts);
  if (f.strict) return { rows: out, mode: 'strict', terms: concepts.map(c => c.label) };
  if (tr && out.length < TOP) take(rankRows(e, tr, f, TOP), 5, tr);
  let any = false;
  const wide = concepts.map(c => {
    if (c.kind !== 'word' && !(c.kind === 'alias' && c.toks.length === 1)) return group(c.alts);
    const v = variants(e, c.toks[0]); if (v.length) any = true;
    return group([...c.alts, ...v.map(x => phrase([x.term]))]);
  }).join(' AND ');
  if (any && out.length < TOP) take(rankRows(e, wide, f, TOP), 2, wide);
  if (concepts.length >= 3 && concepts.length <= 10 && out.length < TOP) {
    const merged = concepts.map((_, skip) => concepts.filter((__, i) => i !== skip).map(c => group(c.alts)).join(' AND '))
      .flatMap(expr => rankRows(e, expr, f, 60).map(r => ({ ...r, expr }))).sort((a, b) => a.score - b.score);
    for (const r of merged) if (!seen.has(r.id) && out.length < TOP) { seen.add(r.id); out.push({ id: r.id, doc_id: r.doc_id, tier: 3, expr: r.expr }); }
  }
  if (concepts.length > 1 && out.length < TOP) { const anyExpr = concepts.map(c => group(c.alts)).join(' OR '); take(rankRows(e, anyExpr, f, TOP), 4, anyExpr); }
  return { rows: out, mode: 'normal', terms: concepts.map(c => c.label) };
}
// a snippet of at most `width` characters around the first hit (FTS marks \u0002 \u0003 cut out; `hits` = the marked words)
function cutSnippet(s, width) {
  s = String(s || '').replace(/\s+/g, ' ');
  const at = s.indexOf('\u0002'), hits = [...s.matchAll(/\u0002([^\u0003]*)\u0003/g)].map(m => m[1]);
  let t = s;
  if (t.replace(/[\u0002\u0003]/g, '').length > width) {
    const from = Math.max(0, at - Math.floor(width / 3));
    t = (from > 0 ? '... ' : '') + s.slice(from, from + width + 8).trim() + ' ...';
  }
  t = t.replace(/[\u0002\u0003]/g, '');
  if (t.length > width + 8) t = t.slice(0, width + 4) + ' ...';
  return { snippet: t, hits: [...new Set(hits.map(h => h.toLowerCase()))] };
}
const TIER = { 1: 'all words', 5: 'other language', 2: 'damaged spelling', 3: 'all but one word', 4: 'some words' };
// search(st, {q, offset, limit, filters}) -> {total, capped, offset, mode, terms, rows: [{id, page, printed, tier, snippet, hits, doc, url, source}]}
function search(st, o) {
  o = o || {};
  if (!st.loc.db) throw Object.assign(new Error('no database'), { code: 'NO_DB' });
  if (st.dbError) throw Object.assign(new Error(st.dbError), { code: 'NO_DB' });
  const e = engine(st), text = String(o.q || '').slice(0, 500).trim();
  if (!text) return { total: 0, capped: false, offset: 0, mode: 'empty', terms: [], rows: [] };
  const f = Object.assign({}, o.filters || {});
  let r;
  try { r = rank(e, text, f); }
  catch (err) {
    if (/fts5|syntax|unterminated|no such column|malformed MATCH/i.test(err.message)) throw Object.assign(new Error('The search words could not be read as written: check the quotes and the AND, OR, NOT, NEAR words.'), { status: 400 });
    throw err;
  }
  const offset = Math.max(0, +o.offset || 0), limit = Math.max(1, Math.min(100, +o.limit || 50));
  const slice = r.rows.slice(offset, offset + limit);
  const snips = new Map();
  const byExpr = new Map(); for (const x of slice) { if (!byExpr.has(x.expr)) byExpr.set(x.expr, []); byExpr.get(x.expr).push(x.id); }
  for (const [expr, ids] of byExpr) for (const s of e.db.prepare(`SELECT rowid AS id, snippet(pages, 0, char(2), char(3), ' ... ', 32) AS snip FROM pages WHERE pages MATCH ? AND rowid IN (${ids.map(Number).join(',')})`).all(expr)) snips.set(s.id, s.snip);
  const meta = slice.length ? new Map(e.db.prepare(`SELECT rowid AS id, n, printed, deep_link FROM page_meta WHERE rowid IN (${slice.map(x => Number(x.id)).join(',')})`).all().map(m => [m.id, m])) : new Map();
  const rows = slice.map(x => {
    const m = meta.get(x.id) || {}, d = st.byDoc.get(x.doc_id) || {}, s = cutSnippet(snips.get(x.id), 200);
    const src = d.rec === 'source' ? d : d.parent ? st.byId.get(d.parent) : null;
    return { id: 'wp' + x.id, page: m.n == null ? null : +m.n, printed: clean(m.printed), tier: TIER[x.tier] || '', snippet: s.snippet, hits: s.hits,
      url: /^https?:\/\//i.test(m.deep_link || '') ? m.deep_link : (d.url || ''),
      doc: { id: d.id || '', title: d.title || x.doc_id, designation: d.designation || '', issuer: d.issuer || '', year: d.year || null, nation: d.nation || '', kind: d.kind || null, hand: d.hand || null, url: d.url || '' },
      source: src ? { id: src.id, title: src.title, url: src.url } : null };
  });
  return { total: r.rows.length, capped: r.rows.length >= TOP, offset, limit, mode: r.mode, terms: r.terms, rows };
}
// page(st, 'wp<rowid>', {max}) -> {id, title, url, archive, captured, text, page, printed, doc, citation, prev, next, chars, more} | null
function page(st, id, o) {
  o = o || {};
  const m = /^wp(\d{1,12})$/.exec(String(id || ''));
  if (!m || !st.loc.db || st.dbError) return null;
  const e = engine(st), rowid = +m[1];
  const pm = e.db.prepare('SELECT rowid AS id, doc_id, n, printed, deep_link FROM page_meta WHERE rowid = ?').get(rowid);
  if (!pm) return null;
  const full = String((e.db.prepare('SELECT text FROM pages WHERE rowid = ?').get(rowid) || {}).text || '');
  const max = Math.max(200, Math.min(200000, +o.max || 50000));
  const d = st.byDoc.get(pm.doc_id) || {};
  const near = e.db.prepare('SELECT rowid AS id FROM page_meta WHERE doc_id = ? AND n = ?');
  const nb = n => { const r = near.get(pm.doc_id, n); return r ? 'wp' + r.id : null; };
  const title = (d.designation && !String(d.title || '').includes(d.designation) ? d.designation + ', ' : '') + (d.title || pm.doc_id) + ', page ' + pm.n;
  return { id: 'wp' + rowid, title, url: /^https?:\/\//i.test(pm.deep_link || '') ? pm.deep_link : (d.url || ''), archive: '', captured: '', text: full.slice(0, max), chars: full.length, more: full.length > max,
    page: +pm.n, printed: clean(pm.printed), citation: d.citation || '', doc: { id: d.id || '', title: d.title || pm.doc_id, designation: d.designation || '', issuer: d.issuer || '', year: d.year || null, url: d.url || '', pages: d.pages || 0 },
    prev: nb(pm.n - 1), next: nb(pm.n + 1) };
}

// ---- ww2bundle: the shipped folder (list + database + word lists), from the source tool's folder. Never writes under --from.
const SHIP_JSON = ['search-terms.json', 'aliases.json', 'weapon-names.json'];   // what the search reads (engine.mjs, server.mjs); translations.json is their source, not read
const LOCAL_TABLES = ['local_pdf'];   // rows that point into this machine's downloads: never shipped
const MANIFEST = 'ww2sources.json';
const DRIVE = /(^|[^A-Za-z])[A-Za-z]:[\\/](?!\/)/;
function localHits(db, ids) {   // small tables: drive paths and the user's name, per table.column (counts only)
  const out = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'pages%' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).filter(t => !LOCAL_TABLES.includes(t) && t !== 'vocab');
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all().filter(c => !/INT|REAL|BLOB/i.test(c.type || '')).map(c => c.name);
    for (const c of cols) {
      let n = 0;
      for (const r of db.prepare(`SELECT "${c}" AS v FROM "${t}"`).iterate()) {
        const v = String(r.v == null ? '' : r.v); if (!v) continue;
        if (DRIVE.test(v.replace(/https?:\/\/\S+/g, '')) || ids.some(id => new RegExp('(^|[^A-Za-z0-9])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)', 'i').test(v))) n++;
      }
      if (n) out.push({ table: t, column: c, rows: n });
    }
  }
  return out;
}
function userIds() { const ids = []; try { const u = require('os').userInfo().username; if (u && u.length >= 3) ids.push(u); } catch (e) { /* none */ } if (process.env.ZIP_EXTRA_ID) ids.push(process.env.ZIP_EXTRA_ID); return ids; }
// bundle({from, out, dry, scanText}) -> {out, files: [{name, bytes}], dropped, localHits, textHits, docs, pages, wrote}
function bundle(o) {
  o = o || {};
  if (!o.from || !o.out) throw Object.assign(new Error('ww2bundle needs --from <the WW2 sources folder> and --out <folder>'), { status: 400 });
  const p = probe(path.resolve(o.from));
  if (!p || !p.csv || !p.db) throw Object.assign(new Error('no ww2-source-index.csv and index.sqlite under ' + o.from + ' (or its app/tool/data folder)'), { status: 400 });
  const out = path.resolve(o.out), from = p.dir;
  const rel = path.relative(from, out);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw Object.assign(new Error('--out must be outside the source folder ' + from), { status: 400 });
  const S = sqlite(); if (!S) throw Object.assign(new Error(NO_SQLITE), { status: 400 });
  const ids = userIds();
  const src = new S.DatabaseSync(p.db, { readOnly: true });
  let docs, pages, tables;
  try {
    tables = src.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all().map(r => r.name);
    for (const t of ['docs', 'page_meta', 'pages']) if (!tables.includes(t)) throw Object.assign(new Error('index.sqlite has no ' + t + ' table: not the WW2 sources database'), { status: 400 });
    docs = src.prepare('SELECT count(*) AS n, sum(n_pages) AS p FROM docs').get(); pages = +docs.p || 0; docs = +docs.n;
  } catch (e) { src.close(); throw e; }
  const hits = localHits(src, ids);
  const json = SHIP_JSON.map(n => path.join(path.dirname(p.terms || p.weapons || p.db), n)).filter(isFile);
  const textHits = [];
  for (const f of [p.csv, ...json]) {
    const t = fs.readFileSync(f, 'utf8');
    if (DRIVE.test(t.replace(/https?:\/\/\S+/g, '')) || ids.some(id => new RegExp('(^|[^A-Za-z0-9])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)', 'i').test(t))) textHits.push(path.basename(f));
  }
  const res = { out, from, files: [{ name: 'ww2-source-index.csv', bytes: fs.statSync(p.csv).size }, ...json.map(f => ({ name: path.basename(f), bytes: fs.statSync(f).size })), { name: 'index.sqlite', bytes: fs.statSync(p.db).size }],
    tables, dropped: LOCAL_TABLES.filter(t => tables.includes(t)).map(t => t + ' (all rows)'), blanked: hits.map(h => h.table + '.' + h.column + ' (' + h.rows + ' rows)'), textHits, docs, pages, wrote: false };
  if (textHits.length) { src.close(); throw Object.assign(new Error('refused: ' + textHits.join(', ') + ' hold a local path or the user name; fix them at the source first'), { status: 400, result: res }); }
  if (o.dry) { src.close(); return res; }
  const why = require('../../lib/writeguard').refuseWrite(out, { purpose: 'write the WW2 sources folder', allowGameMods: false });
  if (why) { src.close(); throw Object.assign(new Error(why), { status: 400 }); }
  if (fs.existsSync(out) && fs.readdirSync(out).length && !isFile(path.join(out, MANIFEST))) { src.close(); throw Object.assign(new Error(out + ' holds files ARSENAL did not write (no ' + MANIFEST + '); pick a new or empty folder'), { status: 400 }); }
  fs.mkdirSync(out, { recursive: true });
  const part = path.join(out, 'index.sqlite.part');
  fs.rmSync(part, { force: true });
  try { src.exec(`VACUUM INTO '${part.replace(/'/g, "''")}'`); } finally { src.close(); }
  const cp = new S.DatabaseSync(part);
  try {
    cp.exec('PRAGMA secure_delete=ON');
    for (const t of LOCAL_TABLES) if (tables.includes(t)) cp.exec(`DELETE FROM "${t}"`);
    for (const h of hits) cp.exec(`UPDATE "${h.table}" SET "${h.column}" = NULL`);   // a column holding a local path or the user's name: blanked in the copy
    cp.exec('PRAGMA journal_mode=DELETE');
  } finally { cp.close(); }
  closeDb(path.join(out, 'index.sqlite'));   // this process may have the old copy open (Windows will not replace an open file)
  fs.renameSync(part, path.join(out, 'index.sqlite'));
  fs.rmSync(path.join(out, require('./ww2parts').STAMP), { force: true });   // a new copy: the old pieces' stamp no longer speaks for it (ww2-split writes a new one)
  fs.copyFileSync(p.csv, path.join(out, 'ww2-source-index.csv'));
  for (const f of json) fs.copyFileSync(f, path.join(out, path.basename(f)));
  const dbHash = crypto.createHash('sha256');
  const fd = fs.openSync(path.join(out, 'index.sqlite'), 'r'), buf = Buffer.alloc(8 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) dbHash.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  const manifest = { what: 'WW2 sources for the ARSENAL Historical sources category', docs, pages, tables, dropped: res.dropped, blanked: res.blanked,
    files: res.files.map(f => ({ name: f.name, bytes: fs.statSync(path.join(out, f.name)).size })), sqliteSha256: dbHash.digest('hex'), checked: true };
  fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify(manifest, null, 1) + '\n');
  res.files = manifest.files; res.sha256 = manifest.sqliteSha256; res.wrote = true;
  forget();
  return res;
}

// ---- the pieces (lib/ww2parts.js): put the database together in the background, one job per process
// joinStart(opt) -> status {state: 'idle'|'running'|'done'|'failed', done, total, doneMb, totalMb, why, piece, ms} ; state 'done' at once when
// the database is already there; 'none' when the folder found has neither pieces nor a database
// The job is kept here (ww2parts.join does the work, its startJoin is not used) so that it can be stopped:
// joinStop() -> status. Asks the running join to stop; it stops at its next chunk of unpacked bytes (256 KB, so well inside a piece)
//   through the join's own failure path: the unfinished index.sqlite.part is removed, nothing is renamed to index.sqlite and no stamp
//   (index.sqlite.joined.json) is written, the pieces stay. State 'stopped'; the folder is still 'parts' and the next joinStart does it
//   all again. A stop that comes after the last byte is too late: the join ends 'done'.
// joinPromise() -> the running (or last) join's promise: resolves when it ended, whatever the end (tests)
let JJOB = null;
const jmb = n => +(n / 1048576).toFixed(0);
const jpub = j => ({ state: j.state, dir: j.dir, done: j.done, total: j.total, doneMb: jmb(j.done), totalMb: jmb(j.total), why: j.why || '', piece: j.piece || '', ms: (j.end || Date.now()) - j.start, file: j.file || '' });
function joinStart(opt) {
  opt = opt || {};
  const P = require('./ww2parts'), cur = joinStatus();
  if (cur.state === 'running') return cur;
  const loc = locate(opt);
  if (!loc.parts) return Object.assign(P.joinStatus(), { state: loc.db ? 'done' : 'none', why: loc.db ? '' : 'no pieces and no database found' });
  if (loc.parts.bad) return Object.assign(P.joinStatus(), { state: 'failed', why: 'index.sqlite.parts/parts.json cannot be read (wrong format, or the piece list does not add up). Get the ww2sources folder again.' });
  const dir = path.resolve(loc.parts.dir), pj = P.readParts(dir) || {};
  const job = JJOB = { state: 'running', dir, done: 0, total: pj.bytes || 0, start: Date.now(), end: 0, stop: false };
  const halt = () => { if (job.stop) throw new Error('stopped'); };
  job.promise = P.join({ dir, freeSpace: opt.freeSpace, release: f => { halt(); closeDb(f); }, onProgress: (d, t) => { job.done = d; job.total = t; halt(); } })
    .then(r => { job.state = 'done'; job.file = r.file; job.done = r.bytes; job.end = Date.now(); forget(); return r; },
      e => { job.state = job.stop ? 'stopped' : 'failed'; job.why = job.stop ? '' : e.message; job.piece = job.stop ? '' : e.piece || ''; job.end = Date.now(); return null; });
  return jpub(job);
}
function joinStatus() { const p = require('./ww2parts').joinStatus(); return p.state === 'running' || !JJOB ? p : jpub(JJOB); }
function joinStop() { if (JJOB && JJOB.state === 'running') JJOB.stop = true; return joinStatus(); }
function joinPromise() { return JJOB ? JJOB.promise : require('./ww2parts').joinPromise(); }

module.exports = { GROUPS, LEGEND, codesOf, topicOf, parseCsv, probe, locate, load, forget, search, page, bundle, tokenize, cutSnippet, joinStart, joinStatus, joinStop, joinPromise, closeDb, SHIP_JSON, LOCAL_TABLES, MANIFEST, NO_SQLITE, sqlite };
