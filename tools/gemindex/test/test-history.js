// gemindex Historical sources (lib/history.js) on a made-up fixture: the category is the rows marked history (guides.json category,
// builtin-edits.json Added and Changes), never the Wayback copies or Discord rows; groups, paging, search, text, hand, the empty index,
// a missing folder, the import (dry run and write, then the rows load back), the CLI verb; the WW2 sources (list, made-up database:
// three states, lookup order, groups, page search, page reader, CLI, ww2bundle); then is plain words.
// Arg: scratch dir. No network. All rows, addresses and texts below are invented.
// Author: Imperator_Aug (ARSENAL, ia-a2ae9349)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gemhist-')));
require('../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
process.env.ARSENAL_WW2_DIR = '';   // never the machine's own WW2 folder
process.env.ARSENAL_WW2_NODEFAULT = '1';   // nor the real one in the repository (src/ww2sources)
const FX = require('./mkfixture'), L = require('../lib/load'), Q = require('../lib/query'), H = require('../lib/history'), W = require('../lib/ww2');
const CLI = path.join(__dirname, '..', 'gemindex.js');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const run = (...a) => cp.spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: Object.assign({}, process.env, { GEM_INDEX_DIR: '', GEMINDEX_DATA: '', ARSENAL_WW2_DIR: '' }) });
const E = s => 'https://hist.example.invalid/' + s;

const data = FX.make(path.join(work, 'data'), {
  extraRows: [
    FX.R('all', 'Armour', 'Tank armour', 'Fixture tank armour report', E('report-1'), { category: 'history', hand: 'first', kind: 'report', year: 1943 }),
    FX.R('all', 'Armour', 'Tank armour', 'Fixture armour study', E('study-1'), { category: 'history', kind: 'study', year: '1998' }),
    FX.R('all', 'Small arms', 'Primary sources', 'Fixture rifle manual', E('manual-1'), { category: 'history', lang: 'de' }),
    FX.R('all', 'Small arms', '', 'Fixture plain small arms row', E('plain-1')),
    FX.R('all', 'Small arms', 'Discord links', 'Fixture history on Discord', E('disc-1'), { category: 'history', source: 'discord', from: 'x', fromUrl: 'x' }),
  ],
  edits: { Changes: [{ Url: E('plain-1'), Category: 'history' }],
    Added: [{ Url: E('added-1'), Title: 'Fixture added memoir', Comp: 'Memoirs', Sub: 'Crews', Lang: 'ru', Category: 'history', Hand: 'first', Kind: 'memoir', Year: 1965 },
      { Url: E('added-2'), Title: 'Fixture added not history', Comp: 'Other' }] },
  extraPages: [{ id: 'ccccccccccc1', url: E('report-1'), lang: 'en', title: 'r', text: 'Fixture saved text with the word glimmerwort in it.' },
    { id: 'ccccccccccc2', url: E('study-1'), lang: 'en', title: 's', text: 'Fixture wall page glimmerwort', verdict: 'login' }],
});
// 1 available
const av = H.available({ data });
ok(av.ok && av.rows === 5 && av.built === '2026-11-04' && !av.note, '1 available: ' + JSON.stringify(av));
const miss = H.available({ data: path.join(work, 'nothing') });
ok(miss.ok === false && /not found/.test(miss.why) && /gemindex/.test(miss.why) && !/\n\s+at /.test(miss.why), '1 missing folder: plain reason ' + JSON.stringify(miss));
const plain = FX.make(path.join(work, 'plain'));
const av0 = H.available({ data: plain });
ok(av0.ok === true && av0.rows === 0 && /no historical sources yet/.test(av0.note), '1 empty category is ok with rows 0 and a note ' + JSON.stringify(av0));
ok(H.groups({ data: plain }).length === 0 && H.rows({ data: plain }).total === 0, '1 empty: no groups, no rows');

// 2 the view: category rows only
let r = H.rows({ data, limit: 50 });
const titles = r.rows.map(x => x.title);
ok(JSON.stringify(titles) === JSON.stringify(['Fixture armour study', 'Fixture tank armour report', 'Fixture added memoir', 'Fixture plain small arms row', 'Fixture rifle manual']), '2 rows by topic, sub-topic, title: ' + titles.join(' | '));
ok(!titles.some(t => /Discord|archived|not history/.test(t)), '2 Discord, Wayback and other rows left out');
const idx = L.load({ data });
ok(idx.rows.filter(x => x.archive).every(x => !H.isMember(idx, x)), '2 Wayback copies are not historical sources');
const rep = r.rows.find(x => x.title === 'Fixture tank armour report');
ok(['id', 'title', 'url', 'archive', 'captured', 'site', 'lang', 'hasText'].every(k => k in rep), '2 contract fields');
ok(rep.url === E('report-1') && rep.archive === '' && rep.hasText === true && rep.hand === 'first' && rep.kind === 'report' && rep.year === 1943 && rep.site === 'hist.example.invalid', '2 row shape ' + JSON.stringify(rep));
const st = r.rows.find(x => x.title === 'Fixture armour study');
ok(st.hand === null && st.kind === 'study' && st.year === 1998 && st.hasText === false, '2 no hand given = null; a page that did not read well is not saved text');
ok(r.rows.find(x => x.title === 'Fixture rifle manual').hand === 'first', '2 hand from the sub-topic words "Primary sources"');
const mem = r.rows.find(x => x.title === 'Fixture added memoir');
ok(mem.hand === 'first' && mem.kind === 'memoir' && mem.year === 1965 && mem.lang === 'ru', '2 Added row carries Hand, Kind, Year');
ok(r.rows.find(x => x.title === 'Fixture plain small arms row').topic === 'Small arms', '2 a Changes entry moves a row into the category');

// 3 groups
const g = H.groups({ data }), gid = id => g.find(x => x.id === id);
ok(['topic', 'lang', 'hand'].every(k => g.filter(x => x.kind === k).reduce((s, x) => s + x.count, 0) === 5), '3 topic, lang and hand groups each cover all 5 rows');
ok(gid('topic:Armour').count === 2 && gid('topic:Armour').from === 1943 && gid('topic:Armour').to === 1998, '3 topic with years ' + JSON.stringify(gid('topic:Armour')));
ok(gid('sub:Armour/Tank armour').count === 2 && /Armour: Tank armour/.test(gid('sub:Armour/Tank armour').title), '3 sub-topic');
ok(gid('hand:first').count === 3 && gid('hand:none').count === 2 && !gid('hand:second'), '3 hand groups');
ok(gid('lang:ru').count === 1 && gid('lang:de').count === 1 && gid('topic:Small arms').from === null, '3 lang groups; no year = null');
ok(g.every(x => x.title && x.count > 0 && ['topic', 'sub', 'lang', 'hand', 'nation', 'access', 'type', 'issuer', 'year'].includes(x.kind)), '3 every group has a title, count, kind');
ok(g.filter(x => x.kind === 'type').map(x => x.id).sort().join() === 'type:memoir,type:report,type:study' && g.filter(x => x.kind === 'year').map(x => x.id).join() === 'year:1943,year:1965,year:1998' && !g.some(x => x.kind === 'nation'), '3 type and year groups from the guide index rows; no nation group when no row has one');

// 4 filters, paging, search
ok(H.rows({ data, group: 'hand:first' }).total === 3 && H.rows({ data, group: 'topic:Armour' }).total === 2 && H.rows({ data, group: 'lang:de' }).rows[0].title === 'Fixture rifle manual', '4 group filter');
ok(H.rows({ data, hand: 'none' }).total === 2 && H.rows({ data, topic: 'small arms' }).total === 2 && H.rows({ data, sub: 'crews' }).total === 1, '4 hand, topic, sub filters');
const p1 = H.rows({ data, limit: 2 }), p2 = H.rows({ data, limit: 2, offset: 2 }), p3 = H.rows({ data, limit: 2, offset: 5 });
ok(p1.total === 5 && p1.rows.length === 2 && p2.rows[0].id === r.rows[2].id && p3.rows.length === 0, '4 paging');
let thrown = null; try { H.rows({ data, group: 'site:x' }); } catch (e) { thrown = e; } ok(thrown && thrown.status === 400, '4 bad group refused');
ok(H.rows({ data, q: 'armor' }).total === 2, '4 words in titles, armor finds armour');
ok(H.rows({ data, q: 'memoir' }).total === 1, '4 kind is searched');
ok(H.rows({ data, q: 'glimmerwort' }).total === 0, '4 page word not found without --text');
r = H.rows({ data, q: 'glimmerwort', text: true });
ok(r.total === 1 && r.rows[0].inText && /glimmerwort/.test(r.rows[0].snippet), '4 text search uses pages that read well only ' + JSON.stringify(r));

// 5 text
const t = H.text(rep.id, { data });
ok(t && /glimmerwort/.test(t.text) && t.url === E('report-1') && t.title === rep.title, '5 text');
ok(H.text(rep.id, { data, max: 200 }).text.length <= 200, '5 max');
ok(H.text(st.id, { data }) === null && H.text('nope', { data }) === null, '5 no good text or unknown id = null');
const live = idx.rows.find(x => x.title === 'Fixture Editor Map Guide');
ok(H.text(live.id, { data }) === null, '5 a guide is not a historical source');

// 6 search --tab history and stats agree
ok(Q.search(idx, { tab: 'history', limit: 50 }).total === 5 && Q.stats(idx).history === 5, '6 search --tab history and stats = the category');
ok(H.view(idx) === H.view(idx), '6 view built once per loaded index');

// 7 import
const imp = FX.make(path.join(work, 'imp'));
const csv = path.join(work, 'in.csv');
fs.writeFileSync(csv, 'title,url,game,topic,sub-topic,language,note,source,edited,hand,kind,year\r\n' +
  '"Fixture war diary, volume 1",' + E('diary-1') + ',all,Diaries,Units,de,a note,,,first,diary,1942\r\n' +
  'Fixture later history,' + E('book-1') + ',all,Books,,en,,,,secondary,book,2005\r\n' +
  'Fixture moved row,https://example.invalid/as64-crash,,,,,,,,,,\r\n' +
  'Fixture no address,not-a-url,,,,,,,,,,\r\n' +
  'Fixture twice,' + E('diary-1') + ',,,,,,,,,,\r\n');
let x = H.importRows(csv, { data: imp, dry: true });
ok(x.wrote === false && x.add.length === 2 && x.change.length === 1 && x.skip.length === 2 && !fs.existsSync(path.join(imp, 'builtin', 'builtin-edits.json')), '7 dry run lists and writes nothing ' + JSON.stringify(x));
ok(H.available({ data: imp }).rows === 0, '7 still empty after the dry run');
thrown = null; try { H.importRows(csv, {}); } catch (e) { thrown = e; } ok(thrown && /--data/.test(thrown.message), '7 import needs --data');
thrown = null; try { H.importRows(csv, { data: path.join(work, 'nothing') }); } catch (e) { thrown = e; } ok(thrown && /guides\.json/.test(thrown.message), '7 import needs a data folder');
x = H.importRows(csv, { data: imp });
ok(x.wrote === true && x.target === path.join(imp, 'builtin', 'builtin-edits.json'), '7 wrote builtin-edits.json ' + JSON.stringify(x));
const ed = JSON.parse(fs.readFileSync(x.target, 'utf8'));
const d1 = ed.Added.find(a => a.Url === E('diary-1'));
ok(d1 && d1.Category === 'history' && d1.Title === 'Fixture war diary, volume 1' && d1.Comp === 'Diaries' && d1.Sub === 'Units' && d1.Lang === 'de' && d1.Hand === 'first' && d1.Kind === 'diary' && d1.Year === 1942, '7 Added entry in the toolkit shape ' + JSON.stringify(d1));
ok(ed.Changes.some(c => c.Url === 'https://example.invalid/as64-crash' && c.Category === 'history'), '7 a known address becomes a Changes entry');
const ir = H.rows({ data: imp, limit: 50 });
ok(ir.total === 3 && ir.rows.find(y => y.title === 'Fixture later history').hand === 'second' && ir.rows.find(y => y.title === 'Fixture AS64 crash note'), '7 the imported rows load back ' + ir.rows.map(y => y.title).join(' | '));
x = H.importRows(csv, { data: imp });
ok(x.wrote === false && x.add.length === 0 && x.skip.filter(s => /already/.test(s.why)).length === 3, '7 a second import adds nothing ' + JSON.stringify(x));
const js = path.join(work, 'in.json');
fs.writeFileSync(js, JSON.stringify({ rows: [{ Title: 'Fixture json row', Url: E('json-1'), Topic: 'Maps', Hand: 'second' }] }));
x = H.importRows(js, { data: imp });
ok(x.wrote && H.rows({ data: imp, hand: 'second' }).total === 2, '7 json import');

// 8 CLI
let c = run('history', '--groups', '--json', '--data', data);
ok(c.status === 0 && JSON.parse(c.stdout).some(y => y.id === 'hand:first'), '8 cli history --groups --json ' + c.stderr);
c = run('history', '--groups', '--data', data);
ok(c.status === 0 && /Topics:/.test(c.stdout) && /Sub-topics:/.test(c.stdout) && /Languages:/.test(c.stdout) && /First or second hand:/.test(c.stdout), '8 cli history --groups\n' + c.stdout);
c = run('history', 'glimmerwort', '--text', '--data', data);
ok(c.status === 0 && /^1 historical sources/.test(c.stdout) && /Fixture tank armour report/.test(c.stdout) && /first hand/.test(c.stdout), '8 cli history --text\n' + c.stdout + c.stderr);
c = run('history', '--hand', 'first', '--limit', '1', '--data', data);
ok(c.status === 0 && /^3 historical sources, showing 1-1/.test(c.stdout), '8 cli history --hand --limit\n' + c.stdout);
c = run('history', '--data', plain);
ok(c.status === 0 && /^0 historical sources\. The guide index holds no historical sources yet/.test(c.stdout), '8 cli history on an empty category\n' + c.stdout);
c = run('stats', '--data', data);
ok(c.status === 0 && /history 5 historical sources/.test(c.stdout), '8 cli stats\n' + c.stdout);
c = run('history', '--data', path.join(work, 'nothing'));
ok(c.status === 3 && /not found/.test(c.stderr), '8 cli without an index exits 3');
const imp2 = FX.make(path.join(work, 'imp2'));
c = run('history', '--import', csv, '--data', imp2, '--dry');
ok(c.status === 0 && /^would add to /.test(c.stdout) && /add {5}Fixture war diary/.test(c.stdout) && /skip {4}Fixture no address/.test(c.stdout) && !fs.existsSync(path.join(imp2, 'builtin', 'builtin-edits.json')), '8 cli import --dry\n' + c.stdout + c.stderr);
c = run('history', '--import', csv, '--data', imp2);
ok(c.status === 0 && /^added to /.test(c.stdout) && H.available({ data: imp2 }).rows === 3, '8 cli import\n' + c.stdout + c.stderr);
c = run('history', '--import', csv);
ok(c.status === 2 && /--data/.test(c.stderr), '8 cli import without --data refused\n' + c.stderr);

// 10 WW2 sources (lib/ww2.js): a made-up source list and a tiny made-up database with the tables and columns of the real one, in the
// source tool's own layout (<dir>/ww2-source-index.csv, <dir>/app/tool/data/index.sqlite, <dir>/app/tool/*.json). Every word is invented.
const SQL = W.sqlite();
ok(!!SQL, '10 node:sqlite present');
const dev = path.join(work, 'ww2dev'), tool = path.join(dev, 'app', 'tool'), U = s => 'https://ww2.example.invalid/' + s;
fs.mkdirSync(path.join(tool, 'data'), { recursive: true });
fs.writeFileSync(path.join(dev, 'ww2-source-index.csv'), '\ufeffName,URL,Nation,Access,Class,Components,LinkStatus,Note\r\n' +
  'Fixture war archive,' + U('archive') + ',Nowhereland,Free,Primary,W.AFV,ok,\r\n' +
  'Fixture study shelf,' + U('shelf') + ',Elsewhere,Paid,Secondary,A.LAND,ok,"a note, with a comma"\r\n' +
  'Fixture mixed box,' + U('box') + ',Nowhereland,Free,Mixed,X.GEN;W.SA,dead,\r\n' +
  'Fixture no address,,Nowhereland,Free,Primary,W.AFV,,\r\n');
fs.writeFileSync(path.join(tool, 'search-terms.json'), JSON.stringify({ groups: [['quollgun', 'QG-7']], translations: [{ en: ['tank gun'], forms: [['de', 'Panzerkanone']] }] }));
fs.writeFileSync(path.join(tool, 'weapon-names.json'), JSON.stringify({ groups: [{ names: ['zorbish shell', 'ZS round'] }] }));
fs.writeFileSync(path.join(tool, 'translations.json'), '{}'); fs.writeFileSync(path.join(tool, 'config.json'), '{"where":"made-up"}');
const LONG = 'filler words '.repeat(80) + 'zorbish shell weight and quollgun crew ' + 'more filler '.repeat(80);
const PG = [[1, 'd1', 1, 'the quollgun fires a zorbish shell at seven hundred metres', 'en'], [2, 'd1', 2, LONG, 'en'], [3, 'd1', 3, 'the qwollgun was serviced', 'en'],
  [4, 'd2', 1, 'postwar study of the quollgun', 'en'], [5, 'd2', 2, 'nothing to see', 'en'], [6, 'd3', 1, 'ein Panzerkanone Bericht', 'de']];
function mkdb(file) {
  const db = new SQL.DatabaseSync(file);
  db.exec(`CREATE VIRTUAL TABLE pages USING fts5(text, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE page_meta(rowid INTEGER PRIMARY KEY, doc_id TEXT, n INTEGER, printed TEXT, deep_link TEXT);
    CREATE TABLE docs(doc_id TEXT PRIMARY KEY, title TEXT, nation TEXT, components TEXT, source_url TEXT, ia_id TEXT, file_sha256 TEXT, text_source TEXT, n_pages INTEGER, chars INTEGER, thin INTEGER);
    CREATE TABLE doc_cat(doc_id TEXT PRIMARY KEY, designation TEXT, kind TEXT, issuer TEXT, year INTEGER, year_from INTEGER, citation TEXT);
    CREATE TABLE vocab(term TEXT PRIMARY KEY, rev TEXT, len INTEGER, pages INTEGER);
    CREATE TABLE page_lang(rowid INTEGER PRIMARY KEY, lang TEXT);
    CREATE TABLE local_pdf(doc_id TEXT, bag TEXT, rel TEXT, basis TEXT);`);
  for (const [id, doc, n, text, lang] of PG) {
    db.prepare('INSERT INTO pages(rowid, text) VALUES (?, ?)').run(id, text);
    db.prepare('INSERT INTO page_meta VALUES (?, ?, ?, ?, ?)').run(id, doc, n, n === 2 ? 'ii' : String(n), doc === 'd1' ? U('scan/d1.pdf#page=' + n) : '');
    db.prepare('INSERT INTO page_lang VALUES (?, ?)').run(id, lang);
  }
  const doc = db.prepare('INSERT INTO docs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'), cat = db.prepare('INSERT INTO doc_cat VALUES (?, ?, ?, ?, ?, ?, ?)');
  doc.run('d1', 'Fixture gun manual', 'Nowhereland', 'W.AFV', U('archive/d1'), '', '', 'ocr', 3, 100, 0); cat.run('d1', 'FM 0-1', 'manual', 'Fixture office', 1942, 1942, 'Fixture office, FM 0-1 (1942)');
  doc.run('d2', 'Fixture shelf study', 'Elsewhere', 'A.LAND', U('shelf'), '', '', 'ocr', 2, 50, 0); cat.run('d2', '', 'study', 'Fixture press', 1988, 1988, 'Fixture press (1988)');
  doc.run('d3', 'Fixture loose report', 'Elsewhere', 'A.LAND', 'https://other.example.invalid/r3', '', '', 'Q:/made-up/scans/r3.pdf', 1, 20, 0); cat.run('d3', 'R-3', 'report', 'Fixture office', 1944, 1944, '');
  const voc = db.prepare('INSERT INTO vocab VALUES (?, ?, ?, ?)');
  for (const [t, p] of [['quollgun', 10], ['qwollgun', 1], ['zorbish', 2], ['shell', 2], ['study', 1], ['panzerkanone', 1]]) voc.run(t, [...t].reverse().join(''), t.length, p);
  db.prepare('INSERT INTO local_pdf VALUES (?, ?, ?, ?)').run('d1', 'Q:/made-up/bag', 'd1.pdf', 'name');
  db.prepare('INSERT INTO local_pdf VALUES (?, ?, ?, ?)').run('d3', 'Q:/made-up/bag', 'r3.pdf', 'name');
  db.close();
}
const srcDb = path.join(tool, 'data', 'index.sqlite');
mkdb(srcDb);
const shaOf = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const srcSha = shaOf(srcDb);
const WO = { ww2: dev, noWw2Default: true };

// 10a load: the three states
let w = W.load({ ww2: dev, noDefault: true });
ok(w.mode === 'full' && w.sources.length === 3 && w.docs.length === 3 && w.rows.length === 5 && w.pages === 6, '10a full: 3 sources (one without an address left out), 3 documents, one merged into its source ' + JSON.stringify({ m: w.mode, s: w.sources.length, d: w.docs.length, r: w.rows.length, p: w.pages }));
const shelf = w.rows.find(x => x.title === 'Fixture study shelf'), wd1 = w.rows.find(x => x.title === 'Fixture gun manual'), box = w.rows.find(x => x.title === 'Fixture mixed box');
ok(shelf.rec === 'source' && shelf.docId === 'd2' && shelf.kind === 'study' && shelf.hand === 'second' && shelf.pages === 2 && shelf.issuer === 'Fixture press', '10a a document at a source\'s own address is that source');
ok(wd1.rec === 'document' && wd1.parentTitle === 'Fixture war archive' && wd1.hand === 'first' && wd1.access === 'Free' && wd1.designation === 'FM 0-1' && wd1.topic === 'Weapons and equipment specifications' && wd1.sub === 'Armored vehicles', '10a a document under its source ' + JSON.stringify(wd1));
ok(box.hand === null && box.kind === 'mixed' && box.status === 'dead' && box.codes.join() === 'X.GEN,W.SA', '10a Mixed class: no hand, kind mixed');
let av1 = H.available(Object.assign({ data: path.join(work, 'nothing') }, WO));
ok(av1.ok && av1.ww2 === 'full' && av1.rows === 5 && av1.docs === 3 && av1.pages === 6 && /check every figure against the scan/.test(av1.ww2Note), '10a full without the guide index ' + JSON.stringify(av1));
ok(H.available(Object.assign({ data }, WO)).rows === 10, '10a the guide index rows and the WW2 rows together');
const listDir = path.join(work, 'ww2list'); fs.mkdirSync(listDir); fs.copyFileSync(path.join(dev, 'ww2-source-index.csv'), path.join(listDir, 'ww2-source-index.csv'));
const avL = H.available({ data, ww2: listDir, noWw2Default: true });
ok(avL.ok && avL.ww2 === 'list' && avL.docs === 0 && avL.pages === 0 && avL.rows === 8 && /ARSENAL-<version>-ww2/.test(avL.ww2Note) && /ARSENAL_WW2_DIR/.test(avL.ww2Note), '10a list only ' + JSON.stringify(avL));
thrown = null; try { H.search({ q: 'quollgun', ww2: listDir, noWw2Default: true }); } catch (e) { thrown = e; }
ok(thrown && thrown.status === 409 && /larger download/.test(thrown.message), '10a list only: the page search says where the text comes from');
const avN = H.available({ data, ww2: path.join(work, 'nothing'), noWw2Default: true });
ok(avN.ok && avN.ww2 === 'none' && avN.rows === 5 && /ww2sources/.test(avN.ww2Note), '10a none: the guide index rows only');
ok(H.available({ data: path.join(work, 'nothing'), ww2: path.join(work, 'nothing'), noWw2Default: true }).ok === false, '10a nothing at all: not ok');
// the lookup order: --ww2, ARSENAL_WW2_DIR, <exe dir>/ww2sources, <package>/ww2sources
const exeHome = path.join(work, 'exehome'); fs.mkdirSync(path.join(exeHome, 'ww2sources'), { recursive: true }); fs.copyFileSync(path.join(dev, 'ww2-source-index.csv'), path.join(exeHome, 'ww2sources', 'ww2-source-index.csv'));
ok(W.locate({ exeDir: exeHome, pkgDir: path.join(work, 'nothing') }).list.from === 'exe' && W.locate({ exeDir: path.join(work, 'nothing'), pkgDir: exeHome }).list.from === 'package', '10a exe dir, then package root');
process.env.ARSENAL_WW2_DIR = dev;
ok(W.locate({ exeDir: exeHome }).list.from === 'ARSENAL_WW2_DIR' && W.locate({ ww2: listDir, exeDir: exeHome }).list.from === '--ww2' && W.locate({ ww2: listDir, exeDir: exeHome }).db.from === 'ARSENAL_WW2_DIR', '10a --ww2 first, then ARSENAL_WW2_DIR; the two parts are found apart');
process.env.ARSENAL_WW2_DIR = '';

// 10b groups and rows
const g2 = H.groups(WO), gk = k => g2.filter(x => x.kind === k).map(x => x.id).sort().join();
ok(gk('nation') === 'nation:Elsewhere,nation:Nowhereland' && gk('type') === 'type:manual,type:mixed,type:report,type:study' && gk('issuer') === 'issuer:Fixture office,issuer:Fixture press' &&
  gk('year') === 'year:1942,year:1944,year:1988' && gk('access') === 'access:Free,access:Paid,access:none' && gk('hand') === 'hand:first,hand:none,hand:second', '10b group kinds ' + JSON.stringify(g2.map(x => x.id)));
ok(g2.find(x => x.id === 'issuer:Fixture office').count === 2 && g2.find(x => x.id === 'nation:Nowhereland').count === 3, '10b group counts');
ok(H.rows(Object.assign({ nation: 'nowhereland' }, WO)).total === 3 && H.rows(Object.assign({ type: 'manual' }, WO)).rows[0].title === 'Fixture gun manual' && H.rows(Object.assign({ year: '1944' }, WO)).total === 1 &&
  H.rows(Object.assign({ group: 'issuer:Fixture office' }, WO)).total === 2 && H.rows(Object.assign({ access: 'paid' }, WO)).total === 1, '10b filters nation, type, year, issuer group, access');
let wr = H.rows(Object.assign({ q: 'FM 0-1' }, WO));
ok(wr.total === 1 && wr.rows[0].designation === 'FM 0-1' && wr.rows[0].parentTitle === 'Fixture war archive' && wr.rows[0].pages === 3 && wr.rows[0].rec === 'document', '10b words find a designation; row fields');
ok(H.rows(Object.assign({ q: 'quollgun' }, WO)).total === 0, '10b the list words do not search the page text');

// 10c the page search: tiers, aliases, other language, damaged spelling, operators, filters, snippet
const sr = q => H.search(Object.assign({ q }, WO));
let s1 = sr('quollgun');
const tiers = Object.fromEntries(s1.rows.map(x => [x.id, x.tier]));
ok(s1.total === 4 && tiers.wp1 === 'all words' && tiers.wp2 === 'all words' && tiers.wp4 === 'all words' && tiers.wp3 === 'damaged spelling', '10c quollgun: exact pages, then the damaged spelling ' + JSON.stringify(tiers));
const h1 = s1.rows.find(x => x.id === 'wp1');
ok(h1.page === 1 && h1.url === U('scan/d1.pdf#page=1') && h1.doc.designation === 'FM 0-1' && h1.doc.issuer === 'Fixture office' && h1.doc.year === 1942 && h1.source.title === 'Fixture war archive' && /quollgun/.test(h1.snippet) && !/[\u0002\u0003]/.test(h1.snippet),
  '10c a result: page, scan address, document, source, snippet ' + JSON.stringify(h1));
const h4 = s1.rows.find(x => x.id === 'wp4');
ok(h4.url === U('shelf') && h4.source.title === 'Fixture study shelf', '10c no page address: the document address');
const h2 = s1.rows.find(x => x.id === 'wp2');
ok(h2.snippet.length <= 216 && /quollgun/.test(h2.snippet) && h2.printed === 'ii', '10c snippet about 200 characters around the hit (' + h2.snippet.length + ')');
ok(sr('QG-7').rows.some(x => x.id === 'wp1'), '10c a name from the word lists finds its other names');
ok(sr('ZS round').rows.some(x => x.id === 'wp1'), '10c a weapon name finds its other names');
const tg = sr('tank gun');
ok(tg.rows.length === 1 && tg.rows[0].id === 'wp6' && tg.rows[0].tier === 'other language', '10c other language ' + JSON.stringify(tg.rows.map(x => [x.id, x.tier])));
ok(JSON.stringify(sr('quollgun NOT zorbish').rows.map(x => x.id)) === '["wp4"]' && sr('quollg*').total === 3 && sr('"zorbish shell"').total === 2, '10c operators, prefix, phrase');
thrown = null; try { sr('quollgun AND ('); } catch (e) { thrown = e; }
ok(thrown && thrown.status === 400 && /could not be read/.test(thrown.message), '10c words that cannot be read: 400, plain words');
ok(H.search(Object.assign({ q: 'quollgun', filters: { nation: 'Elsewhere' } }, WO)).rows.map(x => x.id).join() === 'wp4' && H.search(Object.assign({ q: 'quollgun', filters: { kind: 'manual', year_to: 1943 } }, WO)).total === 3 &&
  H.search(Object.assign({ q: 'Bericht', filters: { lang: 'de' } }, WO)).total === 1 && H.search(Object.assign({ q: 'quollgun', filters: { lang: 'de' } }, WO)).total === 0 &&
  H.search(Object.assign({ q: 'quollgun', filters: { component: 'A.LAND' } }, WO)).total === 1, '10c filters nation, kind, year, language, component');
ok(sr('').total === 0 && H.search(Object.assign({ q: 'quollgun', limit: 2, offset: 2 }, WO)).rows.length === 2, '10c empty words, paging');

// 10d one page with its citation
const pg = H.text('wp2', WO);
ok(pg && pg.page === 2 && pg.printed === 'ii' && pg.citation === 'Fixture office, FM 0-1 (1942)' && pg.prev === 'wp1' && pg.next === 'wp3' && pg.text === LONG && /FM 0-1, Fixture gun manual, page 2/.test(pg.title) && pg.url === U('scan/d1.pdf#page=2'), '10d page ' + JSON.stringify(Object.assign({}, pg, { text: pg && pg.text.length })));
ok(H.text('wp1', WO).prev === null && H.text('wp99', WO) === null && H.text('wp2', Object.assign({ max: 300 }, WO)).more === true, '10d first page, unknown page, max');
ok(H.text('wp1', { ww2: listDir, noWw2Default: true }) === null, '10d list only: no page text');

// 10e the CLI
c = run('history', '--ww2', dev, '--pages', 'quollgun', '--json', '--data', path.join(work, 'nothing'));
ok(c.status === 0 && JSON.parse(c.stdout).total === 4, '10e cli history --pages --json ' + c.stderr);
c = run('history', '--ww2', dev, '--pages', 'quollgun', '--nation', 'Elsewhere');
ok(c.status === 0 && /^1 pages found\. The text is machine-read/.test(c.stdout) && /Fixture study shelf, page 1/.test(c.stdout) && /id wp4/.test(c.stdout), '10e cli history --pages with a filter\n' + c.stdout + c.stderr);
c = run('history', '--ww2', dev, '--show', 'wp1');
ok(c.status === 0 && /cite as: Fixture office, FM 0-1 \(1942\)/.test(c.stdout) && /next page wp2/.test(c.stdout) && /machine-read/.test(c.stdout) && /seven hundred metres/.test(c.stdout), '10e cli history --show\n' + c.stdout + c.stderr);
c = run('history', '--ww2', dev, '--show', 'wp99');
ok(c.status === 1 && /not found: wp99/.test(c.stderr), '10e cli --show unknown page');
c = run('history', '--ww2', dev, '--groups');
ok(c.status === 0 && /^Topics:/m.test(c.stdout) && /^Nations:/m.test(c.stdout) && /^Document types:/m.test(c.stdout) && /^Issuers:/m.test(c.stdout) && /^Years:/m.test(c.stdout) && /^Access:/m.test(c.stdout), '10e cli --groups heads\n' + c.stdout);
c = run('history', 'FM', '--ww2', dev);
ok(c.status === 0 && /^1 historical sources/.test(c.stdout) && /part of: Fixture war archive/.test(c.stdout) && /3 pages/.test(c.stdout) && /can be searched/.test(c.stdout), '10e cli history words over the WW2 rows\n' + c.stdout + c.stderr);
c = run('history', '--ww2', listDir, '--pages', 'quollgun');
ok(c.status === 3 && /larger download named ARSENAL-<version>-ww2/.test(c.stdout), '10e cli --pages, list only\n' + c.stdout + c.stderr);
c = run('history', '--ww2', dev, '--pages', 'quollgun AND (');
ok(c.status === 2 && /could not be read/.test(c.stderr), '10e cli bad words exit 2');

// 10f ww2bundle: reads the source only; the copy drops local_pdf and blanks a column holding a local path; the manifest has its hash
const out = path.join(work, 'shipped');
let bd = W.bundle({ from: dev, out, dry: true });
ok(!fs.existsSync(out) && bd.wrote === false && bd.dropped.join() === 'local_pdf (all rows)' && bd.blanked.join() === 'docs.text_source (1 rows)' && bd.docs === 3 && bd.pages === 6 &&
  bd.files.map(f => f.name).join() === 'ww2-source-index.csv,search-terms.json,weapon-names.json,index.sqlite', '10f dry run ' + JSON.stringify(bd));
thrown = null; try { W.bundle({ from: dev, out: path.join(dev, 'inside') }); } catch (e) { thrown = e; } ok(thrown && thrown.status === 400 && /outside/.test(thrown.message), '10f --out inside --from refused');
const busy = path.join(work, 'busy'); fs.mkdirSync(busy); fs.writeFileSync(path.join(busy, 'keep.txt'), 'x');
thrown = null; try { W.bundle({ from: dev, out: busy }); } catch (e) { thrown = e; } ok(thrown && /did not write/.test(thrown.message) && fs.readdirSync(busy).join() === 'keep.txt', '10f a folder holding other files refused');
bd = W.bundle({ from: dev, out });
ok(bd.wrote && fs.readdirSync(out).sort().join() === 'index.sqlite,search-terms.json,weapon-names.json,ww2-source-index.csv,ww2sources.json', '10f files written ' + fs.readdirSync(out).join());
ok(shaOf(srcDb) === srcSha && fs.existsSync(path.join(tool, 'translations.json')), '10f the source database is unchanged');
const man = JSON.parse(fs.readFileSync(path.join(out, 'ww2sources.json'), 'utf8'));
ok(man.sqliteSha256 === shaOf(path.join(out, 'index.sqlite')) && man.checked === true && man.docs === 3 && man.tables.includes('pages') && man.dropped.length === 1, '10f manifest with the hash of the copy');
const cpy = new SQL.DatabaseSync(path.join(out, 'index.sqlite'), { readOnly: true });
ok(cpy.prepare('SELECT count(*) AS n FROM local_pdf').get().n === 0 && cpy.prepare("SELECT count(*) AS n FROM docs WHERE text_source IS NOT NULL").get().n === 0 && cpy.prepare('SELECT count(*) AS n FROM page_meta').get().n === 6, '10f the copy: local_pdf empty, the local path blanked, pages kept');
ok(!/made-up\/bag|Q:\//.test(fs.readFileSync(path.join(out, 'index.sqlite')).toString('latin1')), '10f the local paths are not left in the file\'s free pages');
cpy.close();
const sw = W.load({ ww2: out, noDefault: true });
ok(sw.mode === 'full' && H.search({ q: 'quollgun', ww2: out, noWw2Default: true }).total === 4, '10f the shipped folder searches the same');
ok(W.bundle({ from: dev, out }).wrote === true, '10f a second build into its own folder');
c = run('ww2bundle', '--from', dev, '--out', path.join(work, 'shipped2'), '--dry');
ok(c.status === 0 && /^would write /.test(c.stdout) && /left out of the copy: local_pdf \(all rows\); blanked: docs\.text_source/.test(c.stdout) && !fs.existsSync(path.join(work, 'shipped2')), '10f cli ww2bundle --dry\n' + c.stdout + c.stderr);
c = run('ww2bundle', '--from', path.join(work, 'nothing'), '--out', path.join(work, 'shipped3'));
ok(c.status === 2 && /no ww2-source-index\.csv and index\.sqlite/.test(c.stderr), '10f cli ww2bundle without a source folder');
// a list holding a local path is refused before anything is written
const devBad = path.join(work, 'ww2bad'); fs.mkdirSync(path.join(devBad, 'app', 'tool', 'data'), { recursive: true });
fs.writeFileSync(path.join(devBad, 'ww2-source-index.csv'), 'Name,URL\r\nsaved at Q:\\made-up\\x.pdf,' + U('x') + '\r\n'); fs.copyFileSync(srcDb, path.join(devBad, 'app', 'tool', 'data', 'index.sqlite'));
thrown = null; try { W.bundle({ from: devBad, out: path.join(work, 'shipped4') }); } catch (e) { thrown = e; }
ok(thrown && /ww2-source-index\.csv hold a local path/.test(thrown.message) && !fs.existsSync(path.join(work, 'shipped4')), '10f a list with a local path refused');

// 9 plain words
const docDir = path.join(__dirname, '..', '..', '..', 'techdoc', 'history');
const pages = fs.existsSync(docDir) ? fs.readdirSync(docDir).filter(n => /\.md$/.test(n)) : [];
ok(pages.includes('README.md'), '9 techdoc/history/README.md exists');
for (const n of pages) {
  const s = fs.readFileSync(path.join(docDir, n), 'utf8');
  ok(!/\[(V|I|T)\]/.test(s), '9 ' + n + ': no [V]/[I]/[T] marks');
  ok(!/\bPASS\b/.test(s) && !/\btested\b/i.test(s), '9 ' + n + ': no test words');
  ok(!/[–—]| -- | - /.test(s.replace(/^- /gm, '')), '9 ' + n + ': no dashes as punctuation');
}
console.log(bad ? bad + ' failures' : 'gemindex history: PASS');
process.exit(bad ? 1 : 0);
