// LANG-1 test: the GUI strings (tools/gui/lang/<code>.json) and the page in all four languages. No game, no browser.
//   node tools/gui/test/test-lang.js [scratchDir]
// 1. key set identical across en/ru/uk/zh, same {slots} per key, no empty value; every key page.js uses exists; no unused key
// 2. a seeded missing key (and a seeded slot mismatch) FAILS the key check
// 3. the page script runs under node (fake DOM) once per language: tabs, headings, cards, buttons, footer, picker, no raw key shown
// 4. default language follows navigator.languages; the choice is kept (cookie + localStorage) and wins over the OS
// Author: Imperator_Aug (ARSENAL, ia-9f526ecf)
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const gui = require('../gui'), fakedom = require('./fakedom');
const LANGDIR = path.join(__dirname, '..', 'lang'), PAGE_SRC = path.join(__dirname, '..', 'page.js');
const ORDER = ['en', 'ru', 'uk', 'zh'];
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-lang-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The server runs in this process. Every page load also refreshes the hidden screens; the Balance screen asks
// /api/x/balance/table, which builds the whole buy panel from the real game synchronously (first call also reads the
// catalogue, ~14 s cold). Pages left with requests open made the next page's load wait seconds on a blocked event loop
// ("timed out waiting for os ru"). So a page is done only when it has no request open (3 quiet polls cover chained calls);
// its own work is paid by it. The budget is for that cold catalogue read under load; a request that never ends fails here.
// Backup, never a hang: past the budget a WAIT line and once more as long, only then the fail.
async function settle(P, what, ms = 90000) {
  let quiet = 0; const idle = () => { if (P.live.size === 0) return ++quiet >= 3; quiet = 0; return false; };
  for (let k = 0; k < 2; k++) if (await W.until(idle, { who: 'test-lang', what: 'page idle: ' + what + (k ? ' (second wait)' : ''), ms: ms * WAITX, step: 25 })) return true;
  ok(false, 'page did not go idle: ' + what, [...P.live.values()].join(' ')); return false;
}
// AS2GUI_WAIT=N multiplies every wait (a loaded machine, where the first page calls each take seconds)
const WAITX = Math.max(1, Number(process.env.AS2GUI_WAIT) || 1);
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), only then a miss is reported
async function waitFor(cond, what, ms = 15000) { const v = await W.until(cond, { who: 'test-lang', what, ms: ms * WAITX, step: 25 }); if (!v) { ok(false, 'not done after the long wait: ' + what); return null; } return v; }

const slots = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
// the key check, as a function so a seeded fault can be fed to the same code. Returns the list of problems.
function checkSets(langs, pageSrc) {
  const bad = [], en = langs.en, keys = Object.keys(en);
  for (const c of ORDER) {
    const L = langs[c];
    if (!L) { bad.push(c + ': file missing'); continue; }
    for (const k of keys) if (!(k in L)) bad.push(c + ': missing key ' + k);
    for (const k of Object.keys(L)) if (!(k in en)) bad.push(c + ': extra key ' + k);
    for (const k of Object.keys(L)) {
      if (typeof L[k] !== 'string' || !L[k].trim()) bad.push(c + ': empty value ' + k);
      else if (k in en && slots(L[k]) !== slots(en[k])) bad.push(c + ': slots differ at ' + k + ' (' + slots(L[k]) + ' vs ' + slots(en[k]) + ')');
    }
  }
  if (pageSrc) {
    const used = new Set();
    for (const m of pageSrc.matchAll(/'((?:[a-z][A-Za-z0-9]*)(?:\.[A-Za-z0-9]+)+|busy|cancel|foot)'/g)) used.add(m[1]);
    // built names: severities, translate stages, one-form plurals (key.1), folder check codes (game.c.<code>), game titles (game.t.<id>), theme choices
    const dynamic = k => /^(sev\.|x\.stage\.|game\.c\.|game\.t\.|set\.|hd\.v\.|theme\.(auto|light|dark)$)|\.1$/.test(k);
    for (const g of GAMES) for (const t of g.tabs) for (const k of [t.label].concat((t.subs || []).map(s => s.label))) if (k) { used.add(k); if (!(k in en)) bad.push('groups.js asks for unknown key ' + k); }   // GUI-TABS: tab and sub-tab names come from tools/gui/groups.js
    for (const g of GAMES) if (!(('game.t.' + g.id) in en)) bad.push('no title key game.t.' + g.id);
    // game parity: a page a game lists but cannot run names its reason in groups.js game.na (na.<page>.<game>); a core page's reason is a core
    // key (used through groups.js, not page.js), an ext page's reason is in that ext's own lang
    for (const g of GAMES) for (const [p, k] of Object.entries(g.na || {})) { if (k in en) used.add(k); else if (!(k in langsAll.en)) bad.push('groups.js na of ' + g.id + ' asks for unknown key ' + k + ' (page ' + p + ')'); }
    for (const k of keys) if (!used.has(k) && !dynamic(k)) bad.push('en: key not used by page.js: ' + k);
    for (const m of pageSrc.matchAll(/\btx\('([^']+)'/g)) if (!(m[1] in en) && !m[1].endsWith('.')) bad.push('page.js asks for unknown key ' + m[1]);
  }
  return bad;
}
const load = dir => { const o = {}; for (const c of ORDER) { const f = path.join(dir, c + '.json'); if (fs.existsSync(f)) o[c] = JSON.parse(fs.readFileSync(f, 'utf8')); } return o; };

function loadPage(port, opt) {
  opt = opt || {};
  const doc = fakedom.make(), store = new Map(Object.entries(opt.ls || {}));
  let cookie = opt.cookie || '', seq = 0;
  const live = new Map();   // open requests of this page: id -> url
  Object.defineProperty(doc, 'cookie', { get: () => cookie, set: v => { cookie = String(v).split(';')[0]; } });
  for (const id of ['foot', 'footq', 'langbox', 'advbox']) { const e = doc.createElement('span'); e.setAttribute('id', id); doc.body.appendChild(e); }
  const ctx = {
    document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: () => true,
    // every request stays "open" until its whole body has arrived (a clone is read), so settle() knows when the page is idle
    fetch: (u, o) => { const id = ++seq; live.set(id, u); return fetch('http://127.0.0.1:' + port + u, o).then(r => { r.clone().arrayBuffer().catch(() => {}).finally(() => live.delete(id)); return r; }, e => { live.delete(id); throw e; }); },
  };
  if (opt.navLangs) ctx.navigator = { languages: opt.navLangs, language: opt.navLangs[0] };
  if (opt.reload) ctx.location = { reload: opt.reload };
  ctx.window = ctx; vm.createContext(ctx);
  return { doc, ctx, store, live, getCookie: () => cookie, run(html) { vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' }); } };
}
// GX: ext pages add screens (up to 14); the core six are found by data-id
// W5 Make split: make = the Generator, upgrade = Upgrade or Port; Translate is a fold of the GoH unit page (ext), no core page
const CORE = ['mods', 'make', 'upgrade', 'check', 'play', 'test', 'settings'];
const allSecs = doc => doc.getElementById('main').children;
const secs = doc => CORE.map(id => allSecs(doc).find(s => s.dataset.id === id)).filter(Boolean);
const EXTN = require('../ext').filter(x => x.script && x.nav).length;
const { GAMES } = require('../groups');   // W5 GUI-TABS: per game its tabs and their fixed Alt keys
const T64 = GAMES.find(g => g.id === 'as64').tabs;

const langsAll = {}; for (const c of ['en', 'ru', 'uk', 'zh']) langsAll[c] = Object.assign({}, ...require('../ext').map(x => (x.lang && x.lang[c]) || {}));   // ext strings (sub-tab names)
async function main() {
  const langs = load(LANGDIR), src = fs.readFileSync(PAGE_SRC, 'utf8');
  // ===== 1. key sets
  ok(Object.keys(langs).join() === ORDER.join(), 'four language files, order en ru uk zh', Object.keys(langs).join());
  const problems = checkSets(langs, src);
  ok(problems.length === 0, 'key sets identical across 4 languages, slots match, every key used', problems.slice(0, 8).join('\n  '));
  ok(Object.keys(langs.en).length > 150, 'en has the full key set (' + Object.keys(langs.en).length + ' keys)');
  { // the game is written AS64 in visible text: no lang value (core tables and every ext table) has a bare lowercase as64.
    // Left alone: as64.exe, as64_ed, as64+, paths (as64/ x/as64), keys (.as64), anchors (#as64), quoted values, CLI flags (--to as64).
    const BARE = /(?<![\w.\/\\#+$'"`-])as64(?![\w+\/\\"`]|'(?!s\b)|\.\w)/, FLAG = /--(?:to|target|exe|from|game)[ =]as64\b/g;
    const bare = v => typeof v === 'string' && BARE.test(v.replace(FLAG, '--flag'));
    const hits = [];
    for (const c of ORDER) for (const [k, v] of Object.entries(langs[c] || {})) if (bare(v)) hits.push('lang/' + c + '.json ' + k);
    for (const x of require('../ext')) for (const c of Object.keys(x.lang || {})) for (const [k, v] of Object.entries(x.lang[c] || {})) if (bare(v)) hits.push('ext/' + x.id + ' ' + c + ' ' + k);
    const W = 'as' + '64';   // built, so this file's own fixtures are not read as prose by the docs sweep
    ok(bare('an ' + W + ' mod') && bare(W + "'s") && !bare([W + '.exe', W + '_ed', W + '+', 'x/' + W, '--to ' + W, '"' + W + '"'].join(' ')), 'bare game-name rule: catches prose, leaves exe names, paths, flags and quoted values');
    ok(hits.length === 0, 'no lang value has the game name in bare lower case (write AS64): ' + hits.length + ' found', hits.slice(0, 30).join('\n  '));
  }
  for (const c of ['ru', 'uk', 'zh']) { // a translation that is only English copied is a gap: allow few (names, codes)
    // T-GUI: buttons are the front-door words (new gen check fix upgrade install uninstall play), the same in every language
    const DOORBTN = /^(new|gen|check|fix|upgrade|install|uninstall|play)(: [a-z ]+)?$/;
    const same = Object.keys(langs.en).filter(k => langs[c][k] === langs.en[k] && !DOORBTN.test(langs.en[k]));
    ok(same.length <= 6, c + ': at most 6 values identical to English', same.join(','));
  }
  // ===== 2. seeded faults must fail
  const seeded = JSON.parse(JSON.stringify(langs)); delete seeded.uk['check.title'];
  ok(checkSets(seeded, src).some(p => p === 'uk: missing key check.title'), 'seeded missing key (uk check.title) is caught');
  const seeded2 = JSON.parse(JSON.stringify(langs)); seeded2.zh['run.exit'] = '退出码';
  ok(checkSets(seeded2, src).some(p => /^zh: slots differ at run\.exit/.test(p)), 'seeded slot mismatch (zh run.exit) is caught');
  const seeded3 = JSON.parse(JSON.stringify(langs)); seeded3.ru.extra_key = 'x';
  ok(checkSets(seeded3, src).some(p => p === 'ru: extra key extra_key'), 'seeded extra key is caught');
  // the same check on a real folder with one key removed from a copy of ru.json (what the file-level run would see)
  const cp = path.join(S, 'seeded'); fs.mkdirSync(cp, { recursive: true });
  for (const c of ORDER) fs.writeFileSync(path.join(cp, c + '.json'), fs.readFileSync(path.join(LANGDIR, c + '.json')));
  const ru = JSON.parse(fs.readFileSync(path.join(cp, 'ru.json'), 'utf8')); delete ru['pk.go']; fs.writeFileSync(path.join(cp, 'ru.json'), JSON.stringify(ru));
  ok(checkSets(load(cp), src).length === 1, 'seeded copy of a language folder with one key removed: exactly one problem');

  // ===== 3. the page in each language (real server for /api/commands; every child replaced by a harmless echo)
  const hook = (cc, info) => (info.cmd === 'translate' ? gui.demoHook(cc, info) : { file: process.execPath, args: ['-e', "console.log('echo ok')"] });
  const A = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S });
  const mods = path.join(S, 'mods-root'); fs.mkdirSync(path.join(mods, 'alpha', 'resource'), { recursive: true });
  fs.writeFileSync(path.join(mods, 'alpha', 'mod.info'), '{Mod\r\n {Name "Alpha mod"}\r\n}\r\n');
  const html = (await (await fetch('http://127.0.0.1:' + A.port + '/')).text());
  try {
    ok(/<span id=langbox>/.test(html) && html.includes('"lang.name":"Русский"') && html.includes('"lang.name":"Українська"') && html.includes('"lang.name":"中文"'), 'page embeds the four string tables (utf-8)');
    ok(!html.includes('__LANGS__'), 'page template slot filled');
    for (const c of ORDER) {
      const L = langs[c], P = loadPage(A.port, { cookie: 'as2lang=' + c, ls: { 'as2gui.roots': JSON.stringify([mods]), 'as2gui.screen': JSON.stringify('mods') } });
      P.run(html); const doc = P.doc;
      await waitFor(() => P.ctx.__as2gui && allSecs(doc).length === CORE.length + EXTN && secs(doc).length === CORE.length, c + ': page built ' + CORE.length + ' core screens + ' + EXTN + ' ext screens');
      await waitFor(() => doc.getElementById('main').querySelector('tbody') && doc.getElementById('main').querySelector('tbody').children.length === 1, c + ': mod list row');
      const navB = [...doc.getElementById('nav').children], nav = navB.map(b => b.textContent.replace(/^Alt\+\d/, ''));
      const want = T64.map(t => L[t.label]);
      ok(want.every(Boolean) && navB.length === T64.length && navB.every((b, i) => T64[i].key ? b.textContent.startsWith('Alt+' + T64[i].key) : !/^Alt\+/.test(b.textContent)), c + ': AS64 tabs carry their fixed Alt key from groups.js, the rest none', navB.map(b => b.textContent).join('|'));
      ok(doc.getElementById('games').children.map(b => b.textContent).join() === 'MoW:AS2,AS64,GoH' && doc.getElementById('games').children.every(b => b.attrs.title === L['game.t.' + b.dataset.game]) && doc.getElementById('games').attrs['aria-label'] === L['games.aria'], c + ': three games in the header, titles in this language');
      ok(doc.getElementById('modchg').textContent === L['mod.change'] && doc.getElementById('skip').textContent === L['hd.skip'] && doc.getElementById('hdmore').textContent === L['hd.more'], c + ': mod Change, skip link and More in this language');
      { const ts = doc.getElementById('themebox').querySelector('select'); ok(ts && ts.attrs['aria-label'] === L['theme.label'] && ts.children.map(o => o.textContent).join() === [L['theme.auto'], L['theme.light'], L['theme.dark']].join(), c + ': theme switch in this language'); }
      ok(JSON.stringify(nav) === JSON.stringify(want), c + ': tab names in this language (the nine tab labels of groups.js, always the tab label)', nav.join('|'));
      // the Mods tab: sub-tabs Mods and Check & Fix; third row on Mods > Mods: Mods and Upgrade or Port (Mod Files is Advanced)
      ok(doc.getElementById('subnav').children.map(b => b.textContent).join('|') === [L['grp.s.mods'], L['grp.s.check']].join('|') && !doc.getElementById('pagenav').hidden && doc.getElementById('pagenav').children.map(b => b.textContent).join('|') === [L['nav.mods'], L['nav.upgrade']].join('|') && navB.some(b => b.dataset.id === 'ide' && b.textContent.replace(/^Alt\+\d/, '') === L['grp.ide']), c + ': Mods sub-tabs and the Mods, Upgrade or Port row in this language, the IDE tab', doc.getElementById('subnav').textContent + ' / ' + doc.getElementById('pagenav').textContent);
      // Settings: the Advanced switch, the Arrange card, the chip in this language
      { const ab = doc.getElementById('advbox'), go = doc.getElementById('arrgo'), ch = doc.getElementById('advchip');
        ok(ab && ab.textContent.includes(L['stg.adv.sw']) && ab.querySelector('input').attrs['aria-label'] === L['adv.label'] && go && go.textContent === L['blk.title'] && ch && ch.hidden && ch.textContent === L['adv.chip'], c + ': Settings page and the Advanced chip in this language'); }
      const h2 = secs(doc).map(s => s.querySelector('h2').textContent);
      ok(JSON.stringify(h2) === JSON.stringify([L['nav.mods'], L['nav.make'], L['nav.upgrade'], L['nav.check'], L['nav.play'], L['ed.h2'], L['nav.settings']]), c + ': screen headings', h2.join('|'));
      const h3 = new Set(secs(doc).flatMap(s => s.all().filter(e => e.tagName === 'H3').map(e => e.textContent)));
      for (const k of ['check.title', 'fix.title', 'up.title', 'ins.title', 'rm.title', 'nw.title', 'pl.title', 'ed.title', 'pv.title', 'ub.title', 'gi.title', 'new.h1', 'new.h2']) ok(h3.has(L[k]), c + ': card heading ' + k, [...h3].join('|'));
      const btns = new Set(doc.querySelectorAll('button').map(b => b.textContent));
      for (const k of ['check.run', 'fix.plan', 'fix.apply', 'up.preview', 'up.write', 'ins.dry', 'ins.install', 'rm.remove', 'ed.dry', 'ed.run', 'pv.plan', 'tr.go', 'tr.noask', 'new.plan2', 'new.write', 'new.sample', 'mods.add', 'mods.reload', 'game.folder']) ok(btns.has(L[k]), c + ': button ' + k, L[k]);
      ok(doc.getElementById('foot').textContent === L.foot && doc.getElementById('cancel').textContent === L.cancel && doc.getElementById('pkuse').textContent === L['pk.use'] && doc.getElementById('pkup').textContent === L['pk.up'] && doc.getElementById('pkno').textContent === L['pk.cancel'], c + ': footer, cancel and picker buttons');
      ok(doc.getElementById('pkpath').attrs['aria-label'] === L['pk.path'], c + ': picker aria-label');
      ok(doc.getElementById('modchip').textContent === L['mod.none'], c + ': mod chip says no mod chosen', doc.getElementById('modchip').textContent);
      ok(doc.getElementById('gameinfo').has(L['game.folder']), c + ': Settings game folder card in this language');
      ok(secs(doc)[0].has((L['mods.count.1'] || L['mods.count']).replace('{v}', '1').replace('{n}', '1')), c + ': mods count line', secs(doc)[0].textContent.slice(0, 200));
      // the picker: 4 options, this one selected
      const sel = doc.getElementById('langbox').querySelector('select');
      ok(sel && sel.children.length === 4 && sel.children.map(o => o.textContent).join() === ORDER.map(k => langs[k]['lang.name']).join() && sel.value === c, c + ': language picker lists 4, this one selected');
      // no raw key anywhere
      // core screens + top bar only (ext pages have their own tests); file names like mod.info are not keys
      const raw = secs(doc).concat([doc.getElementById('gamebar'), doc.getElementById('gameinfo'), doc.getElementById('runoff'), doc.getElementById('nav'), doc.getElementById('subnav'), doc.getElementById('pagenav')]).flatMap(s => s.all()).filter(e => e.children.length === 0 && /^[a-z]{1,4}\.[A-Za-z0-9]+$|^x\.[a-z.A-Z]+$/.test(e.textContent) && !/^(mod\.info|game\.log)$/.test(e.textContent)).map(e => e.textContent);
      ok(raw.length === 0, c + ': no raw key shown', raw.join());
      // a translate question in this language
      {   // Translate is the Translate numbers fold of the GoH unit page (GoH game, Units & Balance tab; no third row, no Advanced switch needed)
        doc.getElementById('games').children.find(b => b.dataset.game === 'goh').click();
        await waitFor(() => doc.getElementById('gameinfo').querySelector('span[data-gohas2]'), c + ': GoH game on'); await new Promise(r => setTimeout(r, 30));
        await W.until(() => { const b = doc.getElementById('nav').children.find(b => b.dataset.id === 'units'); return b && b.textContent === 'Alt+7' + L['grp.units']; }, { who: 'test-lang', what: c + ': GoH Units & Balance tab', step: 25 });
        const fb = doc.getElementById('nav').children.find(b => b.dataset.id === 'units'); ok(fb && fb.textContent === 'Alt+7' + L['grp.units'], c + ': GoH Units & Balance tab in this language', fb && fb.textContent);
        if (fb) fb.click();
        // where the GoH unit page sits comes from groups.js (its sub-tab, and its item when that sub-tab holds more than one page)
        const gu = GAMES.find(g => g.id === 'goh').tabs.find(t => t.id === 'units'), gs = gu && gu.subs.find(s => s.pages.includes('goh'));
        if (gs && gu.subs.length > 1) { const sb = [...doc.getElementById('subnav').children].find(b => b.dataset.id === gs.id); if (sb) sb.click(); }
        if (gs && gs.pages.length > 1) { const it = [...doc.getElementById('pagenav').children].find(b => b.dataset.id === 'goh'); if (it) it.click(); }
        const pn = doc.getElementById('pagenav');
        ok(P.ctx.__as2gui.cur === 'goh' && (gs && gs.pages.length > 1 ? !pn.hidden : pn.hidden) && ![...pn.children].some(b => b.dataset.id === 'xlate'), c + ': the tab reaches the GoH unit page where groups.js puts it, no Translate item', P.ctx.__as2gui.cur); }
      const trSec = allSecs(doc).find(s => s.dataset.id === 'goh'); let card = trSec.all().find(e => e.tagName === 'H3' && e.textContent === L['tr.title']).parentNode;
      while (card && !card.classList.contains('card')) card = card.parentNode;   // the heading sits in its own block inside the card
      const fld = n => card.all().find(e => e.tagName === 'LABEL' && e.dataset.f === n);
      const inp = n => { const l = fld(n); return l.children[1].tagName === 'SPAN' ? l.children[1].children[0] : l.children[1]; };
      if (fld('goh')) { inp('goh').value = S; inp('out').value = path.join(S, 'tr-out'); inp('entity').value = 'gaz67b'; }
      card.all().find(e => e.tagName === 'BUTTON' && e.textContent === L['tr.go']).click();
      await waitFor(() => card.querySelector('.q-panel'), c + ': translate question appears');
      const qp = card.querySelector('.q-panel');
      if (qp) {
        ok(qp.has(L['x.l.goh']) && qp.has(L['x.l.range']) && qp.has(L['x.donor']) && qp.has(L['x.default']) && qp.has('1. ' + L['x.scale'] + ': 20'), c + ': question panel in this language', qp.textContent.slice(0, 300));
        ok(qp.attrs['aria-label'] === L['x.aria'], c + ': question panel aria-label');
        doc.key('Escape');   // stop the (mock) run; its end clears the panel
      }
      await waitFor(() => doc.getElementById('cancel').hidden, c + ': run finished', 8000);
      await settle(P, c + ' page');
    }

    // ===== 4. default follows the OS; the choice is kept and wins
    const langOf = P => P.doc.getElementById('langbox').querySelector('select').value;
    for (const [nl, want] of [[['uk-UA', 'en-US'], 'uk'], [['zh-CN'], 'zh'], [['ru'], 'ru'], [['de-DE', 'fr'], 'en'], [['de-DE', 'ru-RU'], 'ru'], [['en-GB'], 'en']]) {
      const P = loadPage(A.port, { navLangs: nl }); P.run(html);
      await waitFor(() => P.ctx.__as2gui, 'os ' + nl.join());
      ok(langOf(P) === want, 'default from the OS list ' + nl.join() + ' -> ' + want, langOf(P));
      await settle(P, 'os ' + nl.join());
    }
    { const P = loadPage(A.port, {}); P.run(html); await waitFor(() => P.ctx.__as2gui, 'no navigator'); ok(langOf(P) === 'en', 'no navigator at all -> English'); await settle(P, 'no navigator'); }
    let reloaded = 0;
    const P1 = loadPage(A.port, { navLangs: ['uk-UA'], reload: () => reloaded++ }); P1.run(html); await waitFor(() => P1.ctx.__as2gui, 'picker page');
    const sel = P1.doc.getElementById('langbox').querySelector('select'); sel.value = 'zh'; sel.fire('change');
    ok(P1.getCookie() === 'as2lang=zh' && P1.store.get('as2gui.lang') === '"zh"' && reloaded === 1, 'picking a language saves cookie + localStorage and reloads', P1.getCookie() + ' ' + P1.store.get('as2gui.lang') + ' ' + reloaded);
    await settle(P1, 'picker page');
    // restart: new page, OS says Ukrainian, the saved cookie says zh (a new random port loses localStorage, the cookie stays)
    const P2 = loadPage(A.port, { navLangs: ['uk-UA'], cookie: P1.getCookie() }); P2.run(html); await waitFor(() => P2.ctx.__as2gui, 'restart page');
    ok(langOf(P2) === 'zh' && P2.doc.getElementById('foot').textContent === langs.zh.foot, 'saved choice (cookie) wins over the OS after a restart');
    await settle(P2, 'restart page');
    const P3 = loadPage(A.port, { navLangs: ['uk-UA'], ls: { 'as2gui.lang': '"ru"' } }); P3.run(html); await waitFor(() => P3.ctx.__as2gui, 'ls page');
    ok(langOf(P3) === 'ru', 'saved choice (localStorage only) wins over the OS');
    await settle(P3, 'ls page');
    const P4 = loadPage(A.port, { navLangs: ['ru'], cookie: 'as2lang=xx' }); P4.run(html); await waitFor(() => P4.ctx.__as2gui, 'bad cookie page');
    ok(langOf(P4) === 'ru', 'an unknown saved code is ignored, OS language used');
    await settle(P4, 'bad cookie page');
  } finally { await A.close(); }
  console.log(failN ? failN + ' FAILED, ' + pass + ' passed' : pass + ' passed, 0 failed');
  process.exit(failN ? 1 : 0);
}
main().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
