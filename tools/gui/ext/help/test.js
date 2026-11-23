// help ext test: every route with fixtures in a scratch dir (no game, no network). node test.js <scratch>
// Author: Imperator_Aug (ARSENAL, ia-6c9dc93f)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'help-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index.js'), R = require('./routes.js'), G = require('./glossary-data.js'), gen = require('./gen-glossary.js');
const call = (k, q, ctx) => X.routes[k](new URL('http://127.0.0.1/x?' + new URLSearchParams(q || {})), null, ctx || {});
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
let n = 0, fails = 0;
async function t(name, fn) { try { await fn(); n++; } catch (e) { fails++; console.log('FAIL ' + name + ': ' + (e.stack || e.message)); } }

(async () => {
  const docs = path.join(work, 'docs'), empty = path.join(work, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  w(path.join(docs, 'guide', '03-mod-folder-and-load-order.md'), '# Mod folder\r\n\r\nIntro [link](04-x.md) and `code`.\r\n\r\n## 1. Layout\r\n\r\n- **one** item\r\n```\r\n{MinGameVersion "3.262"}\r\n```\r\n');
  w(path.join(docs, 'guide', '18-testing-and-logs.md'), '# Testing\r\n\r\n## Loop\r\ntext\r\n');
  w(path.join(docs, 'guide', 'i18n', 'ru', '18-testing-and-logs.md'), '# Тесты\r\n\r\n## Цикл\r\nтекст\r\n');
  w(path.join(docs, 'limits', 'VFS.md'), '# VFS\r\nid | subject | limit | effect / workaround | tag ref\r\nVFS-19 | mod version range | Min/Max digits | empty Min/Max = unsupported | [V] \r\n');
  w(path.join(docs, 'limits', 'VFS2.md'), '# VFS2\r\nid | subject | limit | effect / workaround | tag ref\r\nVFS-47 | require | as64+ | hidden | [V] x\r\n');

  await t('glossary: bundled data matches the guide and has 4 languages', async () => {
    const g = await call('GET /api/x/help/glossary', { lang: 'en' });
    assert.ok(g.guideCount >= 90, 'en terms ' + g.guideCount); assert.ok(g.count > g.guideCount, 'extra terms added');
    assert.ok(g.terms.some(x => x.t === 'donor') && g.terms.some(x => /^MinGameVersion/.test(x.t)));
    for (const c of ['ru', 'uk', 'zh']) { const r = await call('GET /api/x/help/glossary', { lang: c }); assert.equal(r.lang, G[c] ? c : 'en'); assert.equal(r.noloc, !G[c]); }
    const real = path.join(__dirname, '..', '..', '..', '..', 'guide');
    if (fs.existsSync(path.join(real, '22-glossary.md'))) {
      const b = gen.build(real);
      for (const c of ['en', 'ru', 'uk', 'zh']) assert.equal((b[c] || []).length, (G[c] || []).length, 'glossary-data.js stale for ' + c + ': run node tools/gui/ext/help/gen-glossary.js');
    }
    assert.deepEqual(gen.parse('- **Foo**: bar [x](07-units-vehicles-movement.md#a)\n- **Baz**：qux'), [{ t: 'Foo', d: 'bar x', ch: ['07-units-vehicles-movement.md'] }, { t: 'Baz', d: 'qux', ch: [] }]);
  });

  process.env.AS2_HELP_ROOT = empty;
  await t('docs absent: graceful answers', async () => {
    const c = await call('GET /api/x/help/chapters');
    assert.equal(c.found, false); assert.ok(c.looked.length); assert.ok(c.topics.maps);
    assert.equal((await call('GET /api/x/help/chapter', { file: '03-mod-folder-and-load-order.md' })).found, false);
    const l = await call('GET /api/x/help/limit', { id: 'VFS-19' }); assert.equal(l.found, false); assert.equal(l.nofiles, true);
  });

  process.env.AS2_HELP_ROOT = docs;
  await t('guide chapters and plain text', async () => {
    const c = await call('GET /api/x/help/chapters', { lang: 'ru' });
    assert.equal(c.found, true); assert.equal(c.chapters.length, 2);
    assert.equal(c.chapters[0].title, 'Mod folder'); assert.deepEqual(c.chapters[0].sections, ['1. Layout']); assert.equal(c.chapters[1].loc, true);
    const ch = await call('GET /api/x/help/chapter', { file: '03-mod-folder-and-load-order.md' });
    assert.equal(ch.title, 'Mod folder'); assert.match(ch.sections[0].text, /Intro link and code\./);
    assert.match(ch.sections[1].text, /• one item/); assert.match(ch.sections[1].text, /MinGameVersion/); assert.doesNotMatch(JSON.stringify(ch), /```|\*\*/);
    const ru = await call('GET /api/x/help/chapter', { file: '18-testing-and-logs.md', lang: 'ru' }); assert.equal(ru.lang, 'ru'); assert.equal(ru.title, 'Тесты');
    const zh = await call('GET /api/x/help/chapter', { file: '18-testing-and-logs.md', lang: 'zh' }); assert.equal(zh.lang, 'en'); assert.equal(zh.fallback, true);
    for (const f of ['../secret.md', 'x.md', '03-a.md/../../b']) await assert.rejects(call('GET /api/x/help/chapter', { file: f }), e => e.status === 400);
    await assert.rejects(call('GET /api/x/help/chapter', { file: '09-none.md' }), e => e.status === 404);
  });

  await t('limits row lookup', async () => {
    const l = await call('GET /api/x/help/limit', { id: 'vfs-19' });
    assert.equal(l.found, true); assert.equal(l.id, 'VFS-19'); assert.equal(l.file, 'limits/VFS.md'); assert.equal(l.cells[3], 'empty Min/Max = unsupported');
    assert.equal((await call('GET /api/x/help/limit', { id: 'VFS-47' })).file, 'limits/VFS2.md');
    assert.equal((await call('GET /api/x/help/limit', { id: 'VFS-99' })).found, false);
    for (const id of ['', 'VFS', '../x-1', 'VFS-19; rm']) await assert.rejects(call('GET /api/x/help/limit', { id }), e => e.status === 400);
  });

  // game parity: a Gates of Hell ID (GH<AREA>-NN) is read (GoH head has "effect / workaround · base")
  await t('limits row lookup: GoH IDs from gohweb/limits', async () => {
    let l = await call('GET /api/x/help/limit', { id: 'GHVFS-13' });
    assert.equal(l.found, false); assert.equal(l.nofiles, true, 'no gohweb folder: the plain not-here answer');
    w(path.join(docs, 'gohweb', 'limits', 'GHVFS.md'), '# GHVFS\r\nid | subject | limit | effect / workaround · base | tag ref\r\nGHVFS-01 | mod.info tags | new: tag develop | lifts the check | [V] note:eMod\r\nGHVFS-13 | GetUserDir | Documents/My Games/Gates of Hell | probe both roots | [V] note:eGameDirs\r\n');
    w(path.join(docs, 'gohweb', 'limits', 'GHVFS2.md'), '# GHVFS2\r\nid | subject | limit | effect / workaround · base | tag ref\r\nGHVFS-40 | more | x | y | [I] z\r\n');
    l = await call('GET /api/x/help/limit', { id: 'ghvfs-13' });
    assert.equal(l.found, true); assert.equal(l.id, 'GHVFS-13'); assert.equal(l.file, 'gohweb/limits/GHVFS.md'); assert.equal(l.cells[3], 'probe both roots');
    assert.equal((await call('GET /api/x/help/limit', { id: 'GHVFS-1' })).id, 'GHVFS-01');
    assert.equal((await call('GET /api/x/help/limit', { id: 'GHVFS-40' })).file, 'gohweb/limits/GHVFS2.md');
    const miss = await call('GET /api/x/help/limit', { id: 'GHVFS-99' });
    assert.equal(miss.found, false); assert.deepEqual(miss.searched, ['gohweb/limits/GHVFS.md', 'gohweb/limits/GHVFS2.md']);
    assert.equal((await call('GET /api/x/help/limit', { id: 'VFS-19' })).file, 'limits/VFS.md', 'AS2 IDs still from limits/');
  });

  await t('diagnostics text', async () => {
    const game = path.join(work, 'game'), mods = path.join(game, 'mods');
    w(path.join(game, 'as64.exe'), 'MZ');
    w(path.join(mods, 'good', 'mod.info'), '{name "good"}\r\n{MinGameVersion "3.262"}\r\n{MaxGameVersion "3.262"}\r\n');
    w(path.join(mods, 'modern', 'mod.info'), '{name "h"}\r\n{MinGameVersion "3.301"}\r\n{Require "as64+"}\r\n');
    w(path.join(mods, 'legacy', 'mod.info'), '{name "l"}\r\n{MinGameVersion "3.200"}\r\n');
    w(path.join(mods, 'oldmax', 'mod.info'), '{name "o"}\r\n{MinGameVersion "3.200"}\r\n{MaxGameVersion "3.250"}\r\n');
    fs.mkdirSync(path.join(mods, 'notmod'), { recursive: true });
    const my = path.join(work, 'mymod'); w(path.join(my, 'mod.info'), '{name "mine"}\r\n{MinGameVersion "3.262"}\r\n{MaxGameVersion "3.262"}\r\n');
    const ud = path.join(work, 'udocs');
    w(path.join(ud, 'My Games', 'Men of War - Assault Squad 2', 'log', 'game.log'), 'old\r\n');
    const nl = path.join(ud, 'My Games', 'Men of War - Assault Squad 2 - instance 1', 'log', 'game.log');
    w(nl, Array.from({ length: 60 }, (_, i) => 'line ' + i).join('\r\n') + '\r\n');
    fs.utimesSync(nl, new Date(), new Date(Date.now() + 5000));
    process.env.AS2_HELP_DOCS = ud;
    const d = await call('GET /api/x/help/diag', { game, mod: my });
    const s = d.text;
    assert.match(s, /found: .*game \(via picked in the page\)/); assert.match(s, /as64\.exe: present/); assert.match(s, /mowas_2\.exe: missing/);
    assert.match(s, /- good: min "3\.262", max "3\.262"/); assert.match(s, /- modern: .*max \(none\).*require as64\+, modern mod: no Max needed \(VFS-19\)\r/); assert.doesNotMatch(s, /- modern: .*HIDDEN/, 'AS64: a modern mod needs no Max (VFS-19)');
    assert.match(s, /- legacy: min "3\.200", max \(none\), HIDDEN/, 'AS64: a legacy mod needs both keys'); assert.match(s, /- oldmax: min "3\.200", max "3\.250", REFUSED: MaxGameVersion is below the data version 3\.262 \(VFS-19\)\r/, 'AS64: a legacy Max below 3.262 is refused'); assert.match(s, /- notmod: no mod\.info/);
    assert.match(s, /\{name "mine"\}/); assert.match(s, /instance 1/); assert.match(s, /line 59/); assert.doesNotMatch(s, /line 10\r/);
    // no game: resolve() result explains where it looked; home dir masked
    const ctx = { gamedir: { resolve: () => ({ dir: null, looked: [['Steam', 'nothing in ' + os.homedir()]] }) } };
    const d2 = await call('GET /api/x/help/diag', {}, ctx);
    assert.match(d2.text, /\[game folder\]\r\nnot found/); assert.match(d2.text, /%USERPROFILE%/);
    if (os.homedir().length > 3) assert.ok(!d2.text.toLowerCase().includes(os.homedir().toLowerCase()), 'home dir leaked');
    assert.doesNotMatch(s, /^game: /m, 'no game named (AS64): no game line, text as before');
    // MoW:AS2 (the page's game from the header): one game line, the same AS2 install and exe list; mods checked against 3.262 (VFS-19);
    // the newest log of an '- instance N' folder is AS64's (mowas_2 has no -instance, TST-19), so MoW:AS2 reads the base folder's log
    const dm = await call('GET /api/x/help/diag', { game, mod: my }, { kind: () => 'as2', gameId: () => 'mowas2' });
    assert.match(dm.text, /^game: MoW:AS2 \(mowas_2\.exe\)\r$/m); assert.match(dm.text, /mowas_2\.exe: missing/);
    assert.match(dm.text, /- good: min "3\.262", max "3\.262"\r$/m); assert.doesNotMatch(dm.text, /- good: .*REFUSED/);
    assert.match(dm.text, /- modern: .*HIDDEN.*REFUSED: MinGameVersion is above MoW:AS2 3\.262 \(VFS-19\).*require as64\+ cannot be met in MoW:AS2/);
    assert.match(dm.text, /- oldmax: min "3\.200", max "3\.250", REFUSED: MaxGameVersion is below MoW:AS2 3\.262 \(VFS-19\)\r/, 'MoW:AS2: a Max below 3.262 is refused');
    assert.match(dm.text, /- legacy: .*HIDDEN/); assert.doesNotMatch(dm.text, /- (good|legacy): .*REFUSED/);
    assert.doesNotMatch(dm.text, /instance 1/); assert.match(dm.text, /Assault Squad 2\\log\\game\.log/); assert.match(dm.text, /\r\n  old$/);
    assert.doesNotMatch(s, /MoW:AS2|cannot be met/, 'AS64 text: no MoW:AS2 checks'); assert.doesNotMatch(s, /- (good|modern|legacy): .*REFUSED/);
    const noStamp = x => x.replace(/^ARSENAL diagnostics .*\r\n/, '');
    const ds = await call('GET /api/x/help/diag', { game, mod: my }, { kind: () => 'as2', gameId: () => 'as64' });
    assert.equal(noStamp(ds.text), noStamp(s), 'gameId as64 = no game named');
    process.env.AS2_HELP_DOCS = empty;
    assert.match((await call('GET /api/x/help/diag', {}, {})).text, /none found under/);
  });

  // game parity: Gates of Hell diagnostics (GHVFS-13 log folders, GHVFS-02/-27/-36 mod.info rule, binaries/x64/call_to_arms.exe)
  await t('diagnostics text: Gates of Hell', async () => {
    const goh = path.join(work, 'goh'), mods = path.join(goh, 'mods');
    w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
    w(path.join(mods, 'good_mod', 'mod.info'), '{name "g"}\r\n{MinGameVersion "1.067.0"}\r\n{Priority 3}\r\n');
    w(path.join(mods, 'as2mod', 'mod.info'), '{name "a"}\r\n{MinGameVersion "3.262"}\r\n{MaxGameVersion "3.262"}\r\n');
    w(path.join(mods, 'devmod', 'mod.info'), '{name "d"}\r\n{MinGameVersion "3.262"}\r\n{Tags "develop no_delete"}\r\n');
    w(path.join(mods, 'my-mod', 'mod.info'), '{name "m"}\r\n');
    w(path.join(mods, 'future', 'mod.info'), '{name "f"}\r\n{MinGameVersion "1.500"}\r\n{MaxGameVersion "1.510"}\r\n');
    w(path.join(mods, 'anyver', 'mod.info'), '{name "y"}\r\n{MinGameVersion "any"}\r\n{MaxGameVersion "any"}\r\n');
    const ud = path.join(work, 'gdocs'), la = path.join(work, 'glocal');
    w(path.join(ud, 'My Games', 'Gates of Hell', 'log', 'game.log'), '[00:00:01] old docs log\r\n');
    w(path.join(ud, 'My Games', 'Men of War - Assault Squad 2', 'log', 'game.log'), 'as2 log line\r\n');
    const nl = path.join(la, 'Digitalmindsoft', 'Gates of Hell', 'log', 'game.log');
    w(nl, '[00:00:01] Scanning mods in x\r\n[00:00:02] Mod: activate mod good_mod\r\n');
    fs.utimesSync(nl, new Date(), new Date(Date.now() + 5000));
    process.env.AS2_HELP_DOCS = ud; process.env.AS2_HELP_LOCAL = la;
    const ctx = { kind: () => 'goh', gameId: () => 'goh', gohDir: () => goh, game: () => path.join(work, 'game') };
    const s = (await call('GET /api/x/help/diag', {}, ctx)).text;
    assert.match(s, /^game: Gates of Hell \(call_to_arms\.exe\)\r$/m);
    assert.match(s, /found: .*goh \(via GoH setting\)/); assert.match(s, /binaries\/x64\/call_to_arms\.exe: present/); assert.doesNotMatch(s, /as64\.exe|mowas_2\.exe/);
    assert.match(s, /game version: unknown \(mod\.info bounds compare against 1\.067\.x/);
    assert.match(s, /- good_mod: min "1\.067\.0", max \(none\), priority 3\r/); assert.doesNotMatch(s, /good_mod: .*HIDDEN/, 'GoH: a missing max is open');
    assert.match(s, /- as2mod: .*REFUSED: MinGameVersion is above the game version/); assert.match(s, /- devmod: .*tags develop no_delete.*tag develop: any game version/);
    assert.match(s, /- my-mod: .*SKIPPED: the folder name/);
    assert.match(s, /- future: .*REFUSED: MinGameVersion is above the game version 1\.067;/); assert.match(s, /- anyver: min "any", max "any"\r/);
    assert.match(s, /Digitalmindsoft.Gates of Hell.log.game\.log/); assert.match(s, /Mod: activate mod good_mod/); assert.doesNotMatch(s, /as2 log line|old docs log/);
    // the page sends curFolder() (the GoH install) and kind=goh with no ctx kind: the same answer
    const s2 = (await call('GET /api/x/help/diag', { game: goh, kind: 'goh' }, {})).text;
    assert.match(s2, /found: .*goh \(via picked in the page\)/); assert.match(s2, /- my-mod: .*SKIPPED/);
    // the Documents log when it is the newer one; no GoH folder set: a plain not-found line
    fs.utimesSync(path.join(ud, 'My Games', 'Gates of Hell', 'log', 'game.log'), new Date(), new Date(Date.now() + 9000));
    const s3 = (await call('GET /api/x/help/diag', {}, { kind: () => 'goh', gameId: () => 'goh', gohDir: () => null })).text;
    assert.match(s3, /\[game folder\]\r\nnot found\r\n  looked at GoH: no Gates of Hell folder set/); assert.match(s3, /old docs log/);
    process.env.AS2_HELP_DOCS = empty; process.env.AS2_HELP_LOCAL = '';
    assert.match((await call('GET /api/x/help/diag', {}, { kind: () => 'goh', gohDir: () => goh })).text, /none found under Documents\\My Games\\Gates of Hell\\log or %LOCALAPPDATA%/);
  });

  // the page in a fake DOM: the Change step and the Open buttons follow the current game (INGAME is rebuilt per game, read at click time)
  await t('script: Start Here follows the current game (Change step text and target, Open on other pages)', async () => {
    const vm = require('vm'), BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const L = X.lang.en, s = X.script || '';
    assert.ok(!/\x60|\$\{|innerHTML/.test(s), 'script: no backtick, dollar-brace, innerHTML');
    assert.ok(/Tools & Settings > Settings/.test(L['help.advOff']));
    assert.ok(/Generator/.test(L['help.step.change.gen']) && /Upgrade or Port/.test(L['help.step.change.gen']) && !/Units & Balance/.test(L['help.step.change.gen']));
    const ALL = ['help', 'mods', 'units', 'maps', 'mapviz', 'missions', 'modes', 'art', 'bots', 'unitai', 'mapai', 'doctrine', 'ide', 'logs', 'share', 'guides', 'claude', 'docs', 'upgrade', 'make', 'settings', 'files', 'pro', 'goh', 'check', 'play'];
    const set = a => a.reduce((o, k) => (o[k] = 1, o), {});
    const MOW = set(['help', 'docs', 'guides', 'claude', 'mods', 'mapviz', 'upgrade', 'check', 'logs', 'share', 'play', 'make', 'pro', 'settings']);
    const AS64 = set(ALL.filter(k => k !== 'goh'));
    const doc = make(), log = { toast: [], show: [], link: [] };
    const box = {
      document: doc, window: {}, navigator: {}, EXT_SCREENS: {}, NAMES: [['mods', 'Mods'], ['help', 'Start Here']], LANG: 'en', LS: { get: (k, d) => d, set: () => {} },
      setTimeout: () => 0, linkOk: true, INGAME: MOW, NAVK: {}, ADV: {}, S: { sec: set(ALL), mod: '' },
      tx: (k, p) => { const v = L[k]; return v == null ? k : v.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
      toast: m => log.toast.push(m), show: id => log.show.push(id), api: () => new Promise(() => {}),
    };
    box.as2Link = r => { log.link.push(r); return box.linkOk; };
    const GM = { id: 'mowas2', kind: 'as2' }; box.curGame = () => GM;   // the page's game (page.js curGame), switched below
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    vm.runInNewContext(BC.kitSrc() + '\n' + s, box);   // the page's real searchKit in front of the script
    const root = doc.createElement('section'), scr = box.EXT_SCREENS.help(root);
    // three pages (2026-11-22): the views first, around, lookup; each has its own heading; groups.js lists them under Start Here, the first sub-tab
    { const h2 = root.all().find(e => e.tagName === 'H2'), G = require('../../groups');
      assert.equal(h2.textContent, L['help.title']); scr.view('around'); assert.equal(h2.textContent, L['help.view.around']);
      scr.view('lookup'); assert.equal(h2.textContent, L['help.view.lookup']); scr.view('nope'); assert.equal(h2.textContent, L['help.title'], 'unknown view = the first page');
      for (const g of G.GAMES) { const s0 = g.tabs.find(x => x.id === 'help').subs[0]; assert.equal(s0.pages.join(), 'help/first,help/around,help/lookup', g.id + ': Start Here holds the three views'); } }
    const liOf = text => root.all().find(e => e.tagName === 'LI' && e.children[0] && e.children[0].textContent === text + ' ');
    const openIn = li => li.children.find(e => e.tagName === 'BUTTON' && e.textContent === L['help.open']);
    const clear = () => { log.toast.length = 0; log.show.length = 0; log.link.length = 0; };
    const open = id => { clear(); openIn(liOf(L['help.page.' + id])).click(); return log; };
    // MoW:AS2: no Units page. The Change step names the Generator and opens it; Open on a page of another game shows what it is and stays here
    const ch = liOf(L['help.step.change.gen']);
    assert.ok(ch, 'Change step text without a Units page: help.step.change.gen');
    clear(); openIn(ch).click(); assert.deepEqual(log.show, ['make']);
    for (const id of ['units', 'maps', 'art', 'ide', 'files', 'goh']) {
      open(id); assert.deepEqual(log.toast, [L['help.page.' + id]], id + ': description toast'); assert.equal(log.link.length + log.show.length, 0, id + ': no game switch');
    }
    open('share'); assert.deepEqual(log.link, ['page:share']); assert.equal(log.toast.length, 0);
    // MoW:AS2: the Play step is the Classic text (no as64+)
    const pl = liOf(L['help.step.play.mowas2']);
    assert.ok(pl, 'MoW:AS2 Play step text: help.step.play.mowas2'); assert.ok(!/as64\+ above/.test(L['help.step.play.mowas2']));
    // a game switch: refresh() sets the Change text again, INGAME is read at click time
    box.INGAME = AS64; GM.id = 'as64'; scr.refresh();
    assert.equal(ch.children[0].textContent, L['help.step.change'] + ' ', 'Change step text follows the game');
    assert.equal(pl.children[0].textContent, L['help.step.play'] + ' ', 'AS64 Play step: the base text');
    clear(); openIn(ch).click(); assert.deepEqual(log.show, ['units']);
    open('units'); assert.deepEqual(log.link, ['page:units']); assert.equal(log.toast.length, 0);
    open('goh'); assert.deepEqual(log.toast, [L['help.page.goh']]); assert.equal(log.link.length, 0, 'goh under AS64: no game switch');
    // Unit AI and Map Scripts for AI: a line each right after Bots, same shape (text, Open, More), Open goes to the page; four languages
    for (const id of ['bots', 'unitai', 'mapai']) { assert.ok(liOf(L['help.page.' + id]), id + ': a line in the page list'); open(id); assert.deepEqual(log.link, ['page:' + id], id + ': Open opens the page'); assert.equal(log.toast.length, 0); }
    { const lis = root.all().filter(e => e.tagName === 'LI'), at = id => lis.indexOf(liOf(L['help.page.' + id]));
      assert.ok(at('unitai') === at('bots') + 1 && at('mapai') === at('bots') + 2, 'Unit AI and Map Scripts for AI follow Bots');
      assert.equal(liOf(L['help.page.unitai']).children.filter(e => e.tagName === 'BUTTON').length, liOf(L['help.page.bots']).children.filter(e => e.tagName === 'BUTTON').length, 'same buttons as the Bots line'); }
    assert.ok(/^Unit AI: /.test(L['help.page.unitai']) && /^Map Scripts for AI: /.test(L['help.page.mapai']));
    for (const c of ['ru', 'uk', 'zh']) for (const id of ['unitai', 'mapai']) { const v = X.lang[c]['help.page.' + id]; assert.ok(v && v !== L['help.page.' + id] && /[:：]/.test(v) && !/[—–]/.test(v), c + ' help.page.' + id); }
    assert.ok(/карт/.test(X.lang.uk['help.page.unitai']) && /карт/.test(X.lang.uk['help.page.mapai']) && !/мап/i.test(X.lang.uk['help.page.unitai'] + X.lang.uk['help.page.mapai']), 'uk: the word is карта');
    { const T = require('./routes.js'); const tp = T.TOPICS || (T._t && T._t.TOPICS); if (tp) assert.ok(tp.unitai && tp.mapai, 'More: guide chapters for unitai and mapai'); }
    box.linkOk = false; open('files'); assert.deepEqual(log.toast, [L['help.advOff']], 'Advanced page refused by the gate: Advanced-off toast');
    // a page the game lists but the window lacks (an ext missing): description toast
    delete box.S.sec.maps; box.linkOk = true; open('maps'); assert.deepEqual(log.toast, [L['help.page.maps']]); assert.equal(log.link.length, 0);
    box.INGAME = MOW; GM.id = 'mowas2'; scr.refresh(); assert.equal(ch.children[0].textContent, L['help.step.change.gen'] + ' ');
    assert.equal(pl.children[0].textContent, L['help.step.play.mowas2'] + ' ');
    // GoH: it has a Units & Balance tab (the GoH unit page) but no 'units' page: the Change step is its own .goh text (the GoH unit page,
    // the Generator, Upgrade to Gates of Hell) and opens the Generator
    const GOH = set(['help', 'docs', 'guides', 'claude', 'mods', 'mapviz', 'upgrade', 'check', 'goh', 'make', 'pro', 'settings']);
    for (const c of ['en', 'ru', 'uk', 'zh']) assert.ok(!/no Units|нет вкладки юнитов|немає вкладки юнітів|没有单位标签/.test(X.lang[c]['help.step.change.gen']), c + ': Change text makes no claim about a Units tab');
    for (const c of ['en', 'ru', 'uk', 'zh']) assert.ok(!/AS64/.test(X.lang[c]['help.step.change.goh']) && /Gates of Hell/.test(X.lang[c]['help.step.change.goh']), c + ': GoH Change text names Gates of Hell, not AS64');
    box.INGAME = GOH; GM.id = 'goh'; GM.kind = 'goh'; box.S.sec.maps = 1; scr.refresh();
    assert.equal(ch.children[0].textContent, L['help.step.change.goh'] + ' ', 'GoH: Change step is the .goh text');
    clear(); openIn(ch).click(); assert.deepEqual(log.show, ['make'], 'GoH: Change step opens the Generator');
    open('goh'); assert.deepEqual(log.link, ['page:goh'], 'GoH: Open on the GoH unit page goes through as2Link'); assert.equal(log.toast.length, 0);
    open('units'); assert.deepEqual(log.toast, [L['help.page.units']]); assert.equal(log.link.length, 0, 'units under GoH: no game switch');
    // the Play step under GoH (no Play page there): the GoH text, no page opened, no game switch
    assert.equal(pl.children[0].textContent, L['help.step.play.goh'] + ' ', 'GoH Play step text');
    clear(); openIn(pl).click(); assert.deepEqual(log.show, [], 'Play step under GoH opens nothing'); assert.deepEqual(log.toast, [L['help.step.play.goh']]);
    clear(); openIn(liOf(L['help.step.check'])).click(); assert.deepEqual(log.show, ['check'], 'Check step under GoH opens Check');
    // the switch-it-on card, the texture, mod.info and map answers, and the file types follow the game
    const has = t => root.all().some(e => e.textContent === t);
    assert.ok(has(L['help.py.goh.s1']) && has(L['help.py.goh.note']) && !has('py.s1'), 'GoH: the GoH mod list steps');
    assert.ok(has(L['help.ft.tex.goh']) && !has(L['help.ft.tex']), 'GoH: file types texture line');
    const tsel = root.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === L['help.ts.pick']);
    for (const k of ['tex', 'info', 'map']) { tsel.value = k; tsel.fire('change'); assert.ok(has(L['help.ts.' + k + '.t.goh'].split('\n')[0]), 'GoH: not-showing answer ' + k); }
    tsel.value = 'snd'; tsel.fire('change'); assert.ok(has(L['help.ts.snd.t'].split('\n')[0]), 'GoH: no variant = the base answer');
    const lim = root.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === L['help.lm.h']); assert.equal(lim.placeholder, 'GHVFS-13');
    box.INGAME = AS64; GM.id = 'as64'; GM.kind = 'as2'; scr.refresh();
    tsel.value = 'tex'; tsel.fire('change');
    assert.ok(has('py.s1') && !has(L['help.py.goh.s1']) && has(L['help.ft.tex']) && has(L['help.ts.tex.t'].split('\n')[0]) && lim.placeholder === 'VFS-19', 'back to AS64: the AS2 texts');
    // every .goh / .mowas2 variant has its base key (the fallback)
    for (const k of Object.keys(L)) if (/\.(t|tex|play)\.(goh|mowas2)$/.test(k)) assert.ok(L[k.replace(/\.(goh|mowas2)$/, '')], 'base key of ' + k);
    // the diagnostics button sends the current game's folder (curFolder) and its kind
    let asked = ''; box.api = u => { asked = u; return new Promise(() => {}); }; box.curFolder = () => 'G:/goh'; GM.kind = 'goh';
    root.all().find(e => e.tagName === 'BUTTON' && e.textContent === L['help.gh.make']).click();
    assert.match(asked, /&game=G%3A%2Fgoh&kind=goh$/);
  });

  // Map Viewer (tools/gui/ext/mapviz, page-pg4 7.5): 'mapviz' right after 'maps' in "other pages", help.page.mapviz in four
  // languages; the page is on all three games (groups.js: Maps tab, Viewer sub-tab), so Open goes through as2Link on each
  await t('other pages: the Map Viewer entry (mapviz after maps, four languages, Open on every game)', async () => {
    const vm = require('vm'), BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const s = X.script || '';
    assert.ok(/\['units','maps','mapviz',/.test(s), 'script: mapviz right after maps in the other-pages id list');
    for (const c of ['en', 'ru', 'uk', 'zh']) {
      const v = X.lang[c] && X.lang[c]['help.page.mapviz'];
      assert.ok(typeof v === 'string' && v.length > 20 && !/TODO/.test(v), c + ': help.page.mapviz');
      if (c !== 'en') assert.notEqual(v, X.lang.en['help.page.mapviz'], c + ': help.page.mapviz is translated');
    }
    const en = X.lang.en['help.page.mapviz'];
    assert.ok(/AS64/.test(en) && /MoW:AS2/.test(en) && /Gates of Hell/.test(en), 'en: names the three games');
    assert.ok(!/—| - /.test(en), 'en: no em dash, no " - " separator');
    const { GAMES } = require(path.join(__dirname, '..', '..', 'groups'));
    for (const g of GAMES) assert.ok(g.tabs.some(tb => (tb.pages || []).includes('mapviz')), g.id + ': groups list the mapviz page');
    const L = X.lang.en, set = a => a.reduce((o, k) => (o[k] = 1, o), {});
    const doc = make(), log = { toast: [], show: [], link: [] };
    const box = {
      document: doc, window: {}, navigator: {}, EXT_SCREENS: {}, NAMES: [['mods', 'Mods'], ['help', 'Start Here']], LANG: 'en', LS: { get: (k, d) => d, set: () => {} },
      setTimeout: () => 0, INGAME: set(['help', 'mods', 'mapviz']), NAVK: {}, ADV: {}, S: { sec: set(['help', 'mods', 'mapviz']), mod: '' },
      tx: (k, p) => { const v = L[k]; return v == null ? k : v.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
      toast: m => log.toast.push(m), show: id => log.show.push(id), api: () => new Promise(() => {}),
    };
    box.as2Link = r => { log.link.push(r); return true; };
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    vm.runInNewContext(BC.kitSrc() + '\n' + s, box);   // the page's real searchKit in front of the script
    const root = doc.createElement('section'); box.EXT_SCREENS.help(root);
    const li = root.all().find(e => e.tagName === 'LI' && e.children[0] && e.children[0].textContent === L['help.page.mapviz'] + ' ');
    assert.ok(li, 'the Map Viewer row is in the list');
    const open = li.children.find(e => e.tagName === 'BUTTON' && e.textContent === L['help.open']);
    open.click(); assert.deepEqual(log.link, ['page:mapviz']); assert.equal(log.toast.length, 0, 'Open goes to the page');
    // seeded: a window without the page (ext missing) only says what it is
    log.link.length = 0; delete box.S.sec.mapviz; open.click(); assert.deepEqual(log.toast, [L['help.page.mapviz']]); assert.equal(log.link.length, 0);
  });

  // searchKit (owner 2026-11-19): the limits lookup and the glossary each have the kit; index from /limitids and the glossary, a pick
  // looks the ID up or shows the term; the current game's rows come first (GH areas under Gates of Hell)
  await t('search boxes: limits lookup and glossary have browse, index and history', async () => {
    const vm = require('vm'), BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const L = X.lang.en, doc = make(), store = {}, calls = [], GM = { id: 'as64', kind: 'as2' };
    const ROWS = [{ id: 'VFS-19', area: 'VFS', subj: 'pak order' }, { id: 'GHVFS-13', area: 'GHVFS', subj: 'goh mod list', goh: true }];
    const box = {
      document: doc, window: {}, navigator: {}, EXT_SCREENS: {}, NAMES: [['help', 'Start Here']], LANG: 'en', LS: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
      setTimeout: () => 0, requestAnimationFrame: f => f(), INGAME: { help: 1 }, NAVK: {}, ADV: {}, S: { sec: { help: 1 }, mod: '' }, curGame: () => GM,
      tx: (k, p) => { const v = L[k]; return v == null ? k : v.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
      toast: () => {}, show: () => {},
      api: u => { calls.push(u); if (/limitids/.test(u)) return Promise.resolve({ found: true, rows: ROWS, dirs: { as2: 'R/limits', goh: 'R/gohweb/limits' } }); if (/glossary/.test(u)) return Promise.resolve({ dir: 'R/guide', terms: [{ t: 'Entity', d: 'a thing in the game', ch: ['05-units.md'] }, { t: 'Pak', d: 'a zip of data', ch: ['03-mod-folder.md'] }] });
        if (/\/limit\?/.test(u)) return Promise.resolve({ found: true, id: 'VFS-19', file: 'limits/VFS.md', head: ['id', 's'], cells: ['VFS-19', 'pak order'] }); return new Promise(() => {}); },
    };
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    vm.runInNewContext(BC.kitSrc() + '\n' + (X.script || ''), box);
    const root = doc.createElement('section'); box.EXT_SCREENS.help(root);
    const tick = () => new Promise(r => setImmediate(r));
    const keys = root.all().filter(e => e.getAttribute && e.getAttribute('data-sk')).map(e => e.getAttribute('data-sk'));
    assert.ok(keys.includes('help.limit') && keys.includes('help.glossary'), 'kits: ' + keys.join());
    const inp = k => root.all().find(e => e.getAttribute && e.getAttribute('data-sk') === k).children.find(e => e.tagName === 'INPUT');
    const opts = i => i._sk.list.all().filter(e => e.getAttribute && e.getAttribute('data-ski') != null && /sk-index/.test(e.className));   // index rows (history rows come first)
    const lin = inp('help.limit'); lin.value = 'vfs'; lin.fire('input'); await tick(); await tick();
    assert.deepEqual(opts(lin).map(o => o.children[0].textContent), ['VFS-19', 'GHVFS-13'], 'AS2 game: its own rows first');
    lin._sk.list.fire('click', { target: opts(lin)[0] }); await tick();
    assert.ok(calls.some(u => /\/limit\?id=VFS-19/.test(u)) && (store['sk.hist.help.limit'] || [])[0] === 'VFS-19', 'a pick looks the ID up and is kept');
    GM.kind = 'goh'; GM.id = 'goh'; lin.value = 'vfs'; lin.fire('input'); await tick();
    assert.equal(opts(lin)[0].children[0].textContent, 'GHVFS-13', 'Gates of Hell: GH rows first');
    const gq = inp('help.glossary'); gq.value = 'pa'; gq.fire('input'); await tick(); await tick(); gq.fire('input'); await tick();
    assert.ok(opts(gq).some(o => o.children[0].textContent === 'Pak'), 'glossary index: Pak');
    // Browse (owner 2026-11-19: "browse should always be a file directory browse"): the folder picker where the rows are read from
    let pk = null; box.searchKit.picker = (spec, done) => { pk = { spec, done }; };
    lin._sk.browse();
    assert.ok(pk && pk.spec.mode === 'file' && pk.spec.view === 'disk' && pk.spec.start === 'R/gohweb/limits' && pk.spec.exts.join() === 'md', 'limits Browse under Gates of Hell: gohweb/limits ' + JSON.stringify(pk && pk.spec));
    GM.kind = 'as2'; GM.id = 'as64'; pk = null; lin._sk.browse();
    assert.equal(pk && pk.spec.start, 'R/limits', 'limits Browse under the AS2 games: limits/');
    pk.done('R/limits/VFS2.md', { view: 'disk', path: 'R/limits/VFS2.md' }); await tick(); await tick();
    assert.equal(lin.value, 'VFS-', 'a picked area file puts its area in the box');
    assert.ok(opts(lin).some(o => o.children[0].textContent === 'VFS-19'), 'and lists its IDs');
    pk = null; gq._sk.browse();
    assert.ok(pk && pk.spec.start === 'R/guide' && pk.spec.exts.join() === 'md', 'glossary Browse: the guide folder ' + JSON.stringify(pk && pk.spec));
    pk.done('R/guide/03-mod-folder.md', { view: 'disk', path: 'R/guide/03-mod-folder.md' }); await tick();
    const dts = root.all().filter(e => e.tagName === 'DT').map(e => e.textContent);
    assert.ok(gq.value === '03-mod-folder' && dts.includes('Pak') && !dts.includes('Entity'), 'a picked chapter narrows the glossary to its terms ' + gq.value + ' ' + dts.join());
  });

  await t('lang strings: every key in 4 languages, non-English text differs', async () => {
    const L = X.lang, en = Object.keys(L.en);
    for (const c of ['ru', 'uk', 'zh']) { for (const k of en) assert.ok(L[c][k], c + ' ' + k); assert.ok(en.filter(k => L[c][k] === L.en[k]).length < 3, c + ' has English copies'); }
    const T = require('./terms.js'); for (const c of ['ru', 'uk', 'zh']) assert.equal(T[c].length, T.en.length);
  });

  console.log(fails ? 'help FAIL' : 'help ok ' + n);
  process.exit(fails ? 1 : 0);
})();
