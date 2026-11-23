// gemindex regression on the made-up fixture (mkfixture.js). Arg: scratch dir. No network, no real index needed.
// If the real index is present (default place or GEM_INDEX_DIR), also checks its known counts (9346 rows, 160 tools, 934 guides, 1729 pages).
// Author: Imperator_Aug (ARSENAL, ia-bdd27916)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gemidx-')));
require('../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
process.env.ARSENAL_WW2_DIR = '';   // never the machine's own WW2 folder
const FX = require('./mkfixture');
const L = require('../lib/load'), Q = require('../lib/query'), G = require('../gaps');
const CLI = path.join(__dirname, '..', 'gemindex.js');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const run = (...a) => cp.spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: Object.assign({}, process.env, { GEM_INDEX_DIR: '', ARSENAL_WW2_DIR: '' }) });

const data = FX.make(path.join(work, 'fx', 'data'));
const idx = L.load({ data });
// 1 load + tabs (toolkit rules)
ok(idx.rows.length === 20, '1 rows 20, got ' + idx.rows.length);
const st = Q.stats(idx);
ok(st.tabs.guides === 6 && st.tabs.tools === 6 && st.tabs.less === 8, '1 tabs ' + JSON.stringify(st.tabs));
ok(st.discordRows === 4, '1 discord rows 4, got ' + st.discordRows);
ok(st.faq === 3 && st.pack && st.pack.pages === 3 && st.pack.entries === 5, '1 faq/pack ' + JSON.stringify([st.faq, st.pack]));
ok(idx.rows.some(r => r.title.startsWith('Fixture тест')), '1 url-encoded title decoded');
// toolkit root layout: <root>/work/guides.json
const root = path.join(work, 'fx2'); FX.make(path.join(root, 'work'));
ok(L.load({ data: root }).rows.length === 20, '1 toolkit root layout (work/)');
// 2 search
let r = Q.search(idx, { q: 'editor' });
ok(r.rows.every(x => !x.discord), '2 discord hidden by default');
ok(r.rows[0].tab === 'guides' && /Editor Map/.test(r.rows[0].title), '2 title match ranks first: ' + (r.rows[0] && r.rows[0].title));
ok(Q.search(idx, { q: 'editor', discord: true }).total === r.total + 1, '2 --discord shows the discord guide');
{ // British and American spellings find the same rows (armour = armor), in titles and in page text, with a snippet
  const row = (id, title) => ({ id, title, url: 'u/' + id, tab: 'guides', game: 'as2', gameName: '', comp: '', sub: '', lang: 'en', note: '', desc: '' });
  const mini = { rows: [row('a', 'Armour values explained'), row('b', 'Armor thickness'), row('c', 'Sound')], texts: () => new Map([['u/c', 'a note on the colour of armour plates']]), pages: () => new Map() };
  const n = q => Q.search(mini, { q, text: true });
  ok(n('armor').total === 3 && n('armour').total === 3 && n('ARMOUR').total === 3, '2 armor / armour find the same rows: ' + n('armor').total + ' ' + n('armour').total);
  ok(n('color').total === 1 && /armour plates/.test(n('armor').rows.find(x => x.id === 'c').snippet || ''), '2 folded word still gives a text snippet');
}
ok(Q.search(idx, { tab: 'tools' }).total === 4 && Q.search(idx, { tab: 'tools', discord: true }).total === 6, '2 tools tab 4 (6 with discord)');
ok(Q.search(idx, { tab: 'guides', game: 'as2rel' }).total === 4, '2 as2rel preset guides 4, got ' + Q.search(idx, { tab: 'guides', game: 'as2rel' }).total);
{ // gohrel preset (the Guides search default under Gates of Hell): goh, cta, gem2, all; as2 and as64 rows stay out
  const g = Q.search(idx, { game: 'gohrel', discord: true, limit: 100 }), games = new Set(g.rows.map(x => x.game));
  ok(g.total > 0 && [...games].every(x => ['goh', 'cta', 'gem2', 'all'].includes(x)) && games.has('goh'), '2 gohrel preset games ' + [...games].join(','));
  ok(Q.search(idx, { tab: 'guides', game: 'gohrel' }).total === 2, '2 gohrel preset guides 2 (GoH skin, gem2 voice), got ' + Q.search(idx, { tab: 'guides', game: 'gohrel' }).total);
  ok(Q.search(idx, { game: 'goh-relevant' }).total === Q.search(idx, { game: 'gohrel' }).total, '2 goh-relevant = gohrel');
}
ok(Q.search(idx, { lang: 'ru' }).total === 3, '2 lang ru 3, got ' + Q.search(idx, { lang: 'ru' }).total);
ok(Q.search(idx, { comp: 'editor', sub: 'minimaps' }).total === 1, '2 comp/sub');
ok(Q.search(idx, { q: 'zorkleberry' }).total === 0, '2 page-only word not found without --text');
r = Q.search(idx, { q: 'zorkleberry', text: true });
ok(r.total === 1 && r.rows[0].inText && /zorkleberry/.test(r.rows[0].snippet), '2 --text finds page word with snippet');
ok(Q.search(idx, { q: 'quixotic flange', text: true }).total === 1, '2 --text all words');
ok(Q.search(idx, { q: 'quixotic nothere', text: true }).total === 0, '2 every word must match');
ok(Q.search(idx, { limit: 2 }).shown === 2, '2 limit');
// 3 show
let s = Q.show(idx, 'https://steamcommunity.com/sharedfiles/filedetails/?id=426525938', { max: 500 });
ok(s && s.hasText && s.text.length === 500 && s.more, '3 show by url, excerpt 500');
ok(Q.show(idx, s.id).url === s.url, '3 show by row id');
ok(Q.show(idx, 'aaaaaaaaaaa1').url === s.url, '3 show by page id');
ok(/END-OF-PAGE/.test(Q.show(idx, s.id, { around: 'END-OF-PAGE', max: 400 }).text), '3 --around');
ok(Q.show(idx, 'nope') === null, '3 unknown id');
ok(Q.show(idx, 'https://example.invalid/as64-crash').hasText === false, '3 row without text');
// 4 faq / tools
ok(Q.faq(idx, {}).length === 2 && Q.faq(idx, { discord: true }).length === 3, '4 faq hides discord kind');
ok(Q.faq(idx, { q: 'stripes' }).length === 1 && Q.faq(idx, { lang: 'ru' }).length === 1, '4 faq filter');
const tl = Q.tools(idx, {});
ok(tl.length === 3 && tl[0].sub === 'Blender add-ons' && tl[0].rows.length === 2, '4 tools by sub ' + JSON.stringify(tl.map(t => t.sub)));
ok(!Q.tools(idx, {}).some(t => t.sub === L.DISCORD_SUB) && Q.tools(idx, { discord: true }).some(t => t.sub === L.DISCORD_SUB), '4 discord tool sub hidden');
// 5 gaps
const gp = G.resolve(idx, 'uk');
ok(gp.gaps.length === 8 && gp.gaps.map(g => g.id).join() === 'models,textures,sound,maps,animation,icons,objects,managers', '5 eight kinds');
ok(gp.gaps.every(g => g.what && g.after && g.ai.length && g.page && g.ai.every(a => a.tag === '[I]')), '5 every gap has text, page, AI');
ok(/ARSENAL/.test(gp.linkNote) && /[а-яі]/.test(gp.gaps[0].what), '5 localized uk');
ok(gp.gaps[0].tools.some(t => t.inIndex && /Blender/.test(t.title)), '5 url joined to index row');
ok(G.resolve(null, 'zh').gaps[0].tools.every(t => !t.inIndex), '5 gaps without index');
for (const g of G.GAPS) for (const k of ['title', 'what', 'after']) for (const c of ['en', 'ru', 'uk', 'zh']) ok(g[k][c], '5 gap ' + g.id + ' ' + k + ' ' + c);
const ext = ['art', 'maps', 'units', 'logs', 'models'];
ok(G.GAPS.find(g => g.id === 'objects').page === 'models' && /SOEdit/.test(G.GAPS.find(g => g.id === 'objects').what.en), '5 objects gap points at the Models tab');
ok(G.GAPS.every(g => ext.includes(g.page)), '5 page ids are real ext pages');
// 6 export
const o1 = path.join(work, 'out', 'a.csv'); fs.mkdirSync(path.dirname(o1), { recursive: true });
let e = Q.exportRows(idx, { tab: 'guides' }, { out: o1, dry: true });
ok(e.count === 6 && !e.wrote && !fs.existsSync(o1), '6 dry run writes nothing');
e = Q.exportRows(idx, { tab: 'guides' }, { out: o1 });
const csv = fs.readFileSync(o1, 'utf8');
ok(e.wrote && csv.split('\r\n').filter(Boolean).length === 7 && /^﻿title,url/.test(csv), '6 csv rows+header');
Q.exportRows(idx, { q: 'editor' }, { out: path.join(work, 'out', 'b.md') });
ok(/safety-checked/.test(fs.readFileSync(path.join(work, 'out', 'b.md'), 'utf8')), '6 md has the link note');
Q.exportRows(idx, {}, { out: path.join(work, 'out', 'c.json') });
ok(JSON.parse(fs.readFileSync(path.join(work, 'out', 'c.json'), 'utf8')).rows.length === 16, '6 json visible rows');
let thrown = null; try { Q.exportRows(idx, {}, { out: path.join(data, 'x.csv') }); } catch (x) { thrown = x; }
ok(thrown && thrown.status === 400 && !fs.existsSync(path.join(data, 'x.csv')), '6 refuses the index folder');
thrown = null; try { Q.exportRows(L.load({ data: root }), {}, { out: path.join(root, 'x.csv') }); } catch (x) { thrown = x; }
ok(thrown && !fs.existsSync(path.join(root, 'x.csv')), '6 refuses the toolkit root');
thrown = null; try { Q.exportRows(idx, {}, { out: path.join(work, 'out', 'x.txt'), fmt: 'txt' }); } catch (x) { thrown = x; }
ok(thrown && thrown.status === 400, '6 bad format');
// 7 seeded defects: bad pack magic, missing folder, broken guides.json
const badDir = FX.make(path.join(work, 'bad', 'data'), { badMagic: true });
thrown = null; try { L.load({ data: badDir }).pack(); } catch (x) { thrown = x; }
ok(thrown && /GEMPACK1/.test(thrown.message), '7 bad magic refused');
thrown = null; try { L.load({ data: path.join(work, 'nothing') }); } catch (x) { thrown = x; }
ok(thrown && thrown.code === 'NOT_FOUND' && /GEM_INDEX_DIR/.test(thrown.message), '7 not found message');
const brk = path.join(work, 'brk'); fs.mkdirSync(brk, { recursive: true }); fs.writeFileSync(path.join(brk, 'guides.json'), '{"rows": [');
thrown = null; try { L.load({ data: brk }); } catch (x) { thrown = x; }
ok(thrown && /does not parse/.test(thrown.message), '7 broken guides.json');
// 8 CLI
let c = run('stats', '--data', data, '--json');
ok(c.status === 0 && JSON.parse(c.stdout).tabs.tools === 6, '8 cli stats');
c = run('search', 'zorkleberry', '--text', '--data', data);
ok(c.status === 0 && /Fixture Editor Map Guide/.test(c.stdout) && /safety-checked/.test(c.stdout), '8 cli search --text');
c = run('show', 'aaaaaaaaaaa3', '--data', data);
ok(c.status === 0 && /mono wav/.test(c.stdout), '8 cli show');
c = run('tools', '--data', data); ok(c.status === 0 && /## Blender add-ons \(2\)/.test(c.stdout), '8 cli tools');
c = run('faq', '--data', data, '--json'); ok(c.status === 0 && JSON.parse(c.stdout).length === 2, '8 cli faq');
c = run('gaps', '--data', path.join(work, 'nothing')); ok(c.status === 0 && /3D models/.test(c.stdout), '8 cli gaps without index');
c = run('export', 'tank', '--text', '--data', data, '--out', path.join(work, 'out', 'd.md'));
ok(c.status === 0 && /wrote 1 rows/.test(c.stdout), '8 cli export ' + c.stdout + c.stderr);
c = run('export', '--data', data, '--out', path.join(data, 'z.csv')); ok(c.status === 2, '8 cli export into index refused');
c = run('stats', '--data', path.join(work, 'nothing')); ok(c.status === 3 && /not found/.test(c.stderr), '8 cli not found exit 3');
c = run('bogus', '--data', data); ok(c.status === 2, '8 unknown command');
// 10 history tab (toolkit.cs LinkList.Load 808: category "history" only, from the row or builtin-edits.json), sources, archive details
const hdir = FX.make(path.join(work, 'hist', 'data'), {
  extraRows: [FX.R('as2', 'History', 'Old versions', 'Fixture history row', 'https://example.invalid/history-1', { category: 'history' })],
  edits: { Changes: [{ Url: 'https://example.invalid/as64-crash', Category: 'historical' }], Added: [{ Url: 'https://example.invalid/added-1', Title: 'Fixture added history', Category: 'history' }, { Url: 'https://example.invalid/added-2', Title: 'Fixture added plain' }] } });
const hi = L.load({ data: hdir });
const hrows = Q.search(hi, { tab: 'history', limit: 50 }).rows.map(x => x.title).sort();
ok(JSON.stringify(hrows) === JSON.stringify(['Fixture AS64 crash note', 'Fixture added history', 'Fixture history row']), '10 history = category history/historical only: ' + hrows.join(' | '));
ok(Q.search(idx, { tab: 'history' }).total === 0 && Q.stats(idx).history === 0 && Q.stats(hi).history === 3, '10 no category = no history (wayback rows stay in less)');
ok(hi.rows.find(r => r.title === 'Fixture added plain').tab === 'less', '10 added row without category is less');
ok(Q.search(idx, { archived: true, limit: 50 }).total === 2 && Q.stats(idx).archivedRows === 2, '10 --archived = the 2 Wayback rows');
s = Q.show(idx, 'aaaaaaaaaaa2');
ok(s && s.archive && s.archive.original === 'http://example.invalid/t/1' && s.archive.captured === '2015' && /builtin-pages\.pack/.test(s.textSource.from), '10 show: archive address, capture date, text source ' + JSON.stringify([s && s.archive, s && s.textSource]));
const SRC = require('../lib/sources');
const so = SRC.sources(idx, { top: 5 });
ok(so.rows === 20 && so.origins.find(x => x.source === 'wayback').rows === 2 && so.archives.rows === 2 && so.archives.sites === 1 && so.archives.firstYear === '2015' && so.archives.lastYear === '2016', '10 sources origins/archives ' + JSON.stringify(so.archives));
ok(so.sites.length === 5 && so.sites[0].site === 'steamcommunity.com' && so.sites.some(x => x.site === 'example.invalid' && x.archived === 2), '10 sources sites (wayback under original site)');
ok(so.pageSources[0].pages === 3 && !so.pageSources[0].missing && so.pageSources[1].missing, '10 page sources: built-in, own fetch none');
c = run('sources', '--data', data); ok(c.status === 0 && /Wayback Machine/.test(c.stdout) && /Historical sources \(first-hand and second-hand WW2 sources\): 0 rows, the index holds none yet/.test(c.stdout), '10 cli sources\n' + c.stdout + c.stderr);
c = run('show', 'aaaaaaaaaaa2', '--data', data); ok(c.status === 0 && /captured: 2015/.test(c.stdout) && /original address: http:\/\/example\.invalid\/t\/1/.test(c.stdout), '10 cli show archive');
c = run('search', '--tab', 'history', '--data', data); ok(c.status === 0 && /0 found/.test(c.stdout) && /--archived/.test(c.stdout), '10 cli history empty explains\n' + c.stdout);
// 11 locate: <exe dir>/gemindex comes before the toolkit's default place
const exeDir = path.join(work, 'exe'); FX.make(path.join(exeDir, 'gemindex'));
const saveEnv = [process.env.GEM_INDEX_DIR, process.env.GEMINDEX_DATA]; delete process.env.GEM_INDEX_DIR; delete process.env.GEMINDEX_DATA;
let lc = L.locate({ exeDir, defaultDir: root });
ok(lc.from === 'exe' && lc.dir === path.join(exeDir, 'gemindex'), '11 exe dir first: ' + lc.from + ' ' + lc.dir);
lc = L.locate({ exeDir: path.join(work, 'noexe'), defaultDir: root });
ok(lc.from === 'default' && lc.dir === path.join(root, 'work'), '11 falls back to the toolkit default: ' + lc.from);
{ // small package layout: <pkg>/tools/gemindex/lib/load.js and <pkg>/gemindex, node elsewhere; found from the code's own place
  const pkg = path.join(work, 'pkg'), lib = path.join(pkg, 'tools', 'gemindex', 'lib');
  fs.mkdirSync(lib, { recursive: true }); fs.copyFileSync(path.join(__dirname, '..', 'lib', 'load.js'), path.join(lib, 'load.js'));
  FX.make(path.join(pkg, 'gemindex'));
  const PL = require(path.join(lib, 'load.js'));
  lc = PL.locate({ exeDir: path.join(work, 'noexe'), defaultDir: root });
  ok(lc.from === 'package' && lc.dir === path.join(pkg, 'gemindex'), '11 small package: <package>/gemindex found from the code: ' + lc.from + ' ' + lc.dir);
  ok(PL.load({ exeDir: path.join(work, 'noexe'), defaultDir: root }).rows.length === FX.ROWS.length, '11 small package: loads');
  lc = PL.locate({ exeDir, defaultDir: root });
  ok(lc.from === 'exe', '11 exe dir still comes first');
  lc = L.locate({ exeDir: path.join(work, 'noexe'), defaultDir: root, pkgDir: path.join(work, 'nopkg') });
  ok(lc.from === 'default', '11 no package folder: toolkit default as before');
}
if (saveEnv[0] != null) process.env.GEM_INDEX_DIR = saveEnv[0]; if (saveEnv[1] != null) process.env.GEMINDEX_DATA = saveEnv[1];
// 12 bundle: manifest, loads alone, same bytes twice, refuses a foreign folder and the source folder
const B = require('../lib/bundle');
const bo = path.join(work, 'bundle', 'gemindex'), bo2 = path.join(work, 'bundle2', 'gemindex');
let br = B.bundle({ from: root, out: bo, dry: true });
ok(!br.wrote && !fs.existsSync(bo) && br.files === 9, '12 dry writes nothing, 9 files: ' + br.files);
br = B.bundle({ from: root, out: bo });
const man = JSON.parse(fs.readFileSync(path.join(bo, 'manifest.json'), 'utf8'));
ok(br.wrote && man.rows === 20 && man.pages === 3 && man.okPages === 3 && man.faq === 3 && man.built === '2026-11-04' && man.layout === 'pages', '12 manifest counts ' + JSON.stringify(man));
const crypto = require('crypto');
ok(man.files.every(f => { const b = fs.readFileSync(path.join(bo, ...f.file.split('/'))); return b.length === f.bytes && crypto.createHash('sha256').update(b).digest('hex') === f.sha256; }) && man.files.length === 8, '12 manifest bytes + sha256');
ok(/Where the text came from/.test(fs.readFileSync(path.join(bo, 'README.md'), 'utf8')), '12 README says where the text came from');
const bi = L.load({ data: bo }), bs = Q.stats(bi);
ok(bs.rows === 20 && bs.pack.pages === 3 && bs.pack.kind === 'crawl' && Q.search(bi, { q: 'zorkleberry', text: true }).total === 1, '12 bundle loads alone with text search ' + JSON.stringify(bs.pack));
B.bundle({ from: root, out: bo2 });
const same = B.walk(bo, '', []).every(f => fs.readFileSync(path.join(bo, f)).equals(fs.readFileSync(path.join(bo2, f))));
ok(same && B.walk(bo, '', []).length === B.walk(bo2, '', []).length, '12 deterministic: same bytes twice');
B.bundle({ from: root, out: bo }); ok(fs.readFileSync(path.join(bo, 'manifest.json')).equals(fs.readFileSync(path.join(bo2, 'manifest.json'))), '12 rebuild over its own bundle');
const foreign = path.join(work, 'foreign'); fs.mkdirSync(foreign, { recursive: true }); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'x');
thrown = null; try { B.bundle({ from: root, out: foreign }); } catch (x) { thrown = x; }
ok(thrown && fs.readFileSync(path.join(foreign, 'keep.txt'), 'utf8') === 'x' && fs.readdirSync(foreign).length === 1, '12 refuses a non-empty folder that is not a bundle');
thrown = null; try { B.bundle({ from: root, out: path.join(root, 'work', 'out') }); } catch (x) { thrown = x; }
ok(thrown && thrown.status === 400, '12 refuses --out inside the source');
const bp = B.bundle({ from: root, out: path.join(work, 'bundle3'), pack: true });
ok(bp.manifest.layout === 'pack' && L.load({ data: path.join(work, 'bundle3') }).pages().size === 3, '12 --pack layout loads');
const sc = B.scan(bo, { ids: ['Zorkleberry'] });
ok(sc.files === 9 && sc.gateRefused >= 1 && sc.findings['local/git user name'] && sc.notText.length === 0, '12 scan: gate rules see a planted name ' + JSON.stringify(sc.findings));
const sc3 = B.scan(path.join(work, 'bundle3'), { ids: [] });
ok(sc3.notText.length === 1 && sc3.gateRefused >= 1, '12 scan: a .pack is refused by the gate (not text)');
c = run('bundle', '--from', root, '--out', path.join(work, 'bundle4'), '--dry'); ok(c.status === 0 && /would write 9 files/.test(c.stdout) && !fs.existsSync(path.join(work, 'bundle4')), '12 cli bundle --dry\n' + c.stdout + c.stderr);
// 9 real index (optional, local only)
const real = L.locate({});
if (!real.missing && !process.env.GEMINDEX_SKIP_REAL) {
  const ri = L.load({ data: real.dir }), rs = Q.stats(ri);
  ok(rs.rows === 9346 && rs.tabs.tools === 160 && Math.abs(rs.tabs.guides - 934) <= 15 && rs.pack.pages === 1729 && rs.faq === 40, '9 real index counts ' + JSON.stringify([rs.rows, rs.tabs, rs.pack, rs.faq]));
  ok(G.resolve(ri, 'en').gaps.every(g => g.guides.concat(g.tools).every(u => u.inIndex)), '9 every gaps url is in the real index');
  console.log('real index checked: ' + real.dir + ' guides ' + rs.tabs.guides + ' (README 934)');
} else console.log('real index not present: skipped its counts');
console.log(bad ? bad + ' failures' : 'gemindex: PASS');
process.exit(bad ? 1 : 0);
