// header test (the owner's four header changes, 2026-11-19): no server, no browser, no game. The page script (page.js with every ext
// script) runs in the fake DOM with a fake fetch that answers the few calls the header needs.
// 1. game folder: the header holds no game path and no "Game folder..." while the folder is fine; a missing or wrong folder shows a short
//    warning and a "Game folder..." button that opens Settings at the Game folder card; that card holds the path, where it was found and
//    the buttons; the "game runs" note is a short chip by the game buttons; a LAN Remote page hides the change buttons and pick refuses
// 2. mod pill: the last folder name only; the full path in title and aria-label, and in the pill while the Change picker is open
// 3. Quick Guided Task: Hide folds the row to one button (aria-expanded), kept in the window settings (as2gui.task.min goes to the
//    server), a waiting task still shows with Continue; Show opens it again; a new page load starts folded
// 4. header rows: a line in a theme token between rows, the tab band set off, the phone width rules; the new strings in en, ru, uk, zh
// usage: node test-header.js
// Author: Imperator_Aug (ARSENAL, ia-hdr1119)
'use strict';
const path = require('path'), vm = require('vm');
const GUI = path.join(__dirname, '..');
const fakedom = require('./fakedom'), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
const SETTINGS = require(path.join(GUI, 'settings'));
const LANG = c => require(path.join(GUI, 'lang', c + '.json'));
const TASKL = require(path.join(GUI, 'ext', 'task', 'lang.js'));
const ORDER = ['en', 'ru', 'uk', 'zh'];
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('ok ' + m); } else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 600) : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const W = require('../../lib/test/wait');
const clone = o => JSON.parse(JSON.stringify(o));
const MODP = 'C:\\Games\\MyMod';
const GAMEP = 'C:\\Games\\Men of War Assault Squad 2';
const GOOD = { dir: GAMEP, source: 'steam', ok: true, exes: ['as64.exe', 'mowas_2.exe'], hasMods: true, codes: [] };
const NONE = { dir: '', tried: ['C:\\Games\\AS2'], ok: false, codes: ['none'] };
const CAT = { verbs: ['make', 'change', 'explore'], recipes: [{ id: 'mod', built: true, games: ['as64', 'mowas2', 'goh'], verbs: ['make'], title: 'task.row.label', needs: [] }] };
const DRAFT = { id: 'd1', recipe: 'mod', verb: 'make', at: '2026-11-19T10:00:00.000Z', state: 'open' };

// one page: o.game (the /api/game reply), o.ls (window settings before the load), o.drafts, o.remote, o.lang
async function load(o) {
  o = o || {};
  const doc = fakedom.make(), store = new Map(Object.entries(o.ls || {})), posts = [], toasts = [];
  if (o.lang) doc.cookie = 'as2lang=' + o.lang;
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));
  doc.body.appendChild((() => { const e = doc.createElement('span'); e.setAttribute('id', 'langbox'); return e; })());
  doc.body.appendChild((() => { const e = doc.createElement('span'); e.setAttribute('id', 'hdlockhd'); return e; })());
  const resp = (x, status) => Promise.resolve({ ok: !status, status: status || 200, json: () => Promise.resolve(clone(x)), body: null });
  const w = {
    document: doc, console, TextDecoder, setTimeout: f => { setImmediate(f); return 0; }, clearTimeout: () => {}, setInterval: () => 0,
    AS2CFG: o.remote ? { remote: true } : {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => true,
    fetch: (u, op) => {
      const m = (op && op.method) || 'GET', url = new URL(String(u), 'http://127.0.0.1'), p = url.pathname;
      if (m === 'POST') posts.push({ p, body: op.body ? JSON.parse(op.body) : null });
      if (p === '/api/health') return resp({ ok: true, allowLaunch: !!o.launch, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings') return resp(m === 'GET' ? { settings: o.srv || {}, empty: !o.srv || !Object.keys(o.srv).length, file: '' } : { ok: true });
      if (p === '/api/game') return resp(url.searchParams.get('kind') === 'goh' ? (o.goh || { codes: ['none'] }) : (o.game || GOOD));
      if (p === '/api/mods') return resp({ mods: [], roots: [] });
      if (p === '/api/x/task/catalogue') return resp(CAT);
      if (p === '/api/x/task/drafts') return resp({ drafts: o.drafts || [] });
      return new Promise(() => {});
    },
  };
  w.window = w; vm.createContext(w);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' });
  { const t0 = Date.now(); while (!w.__as2gui && Date.now() - t0 < W.COND_MS) await tick(); if (!w.__as2gui) W.say('test-header', 'page build', W.COND_MS); }
  // a toast is the #toast element's text
  return { doc, w, store, posts, toasts, row, S: () => w.__as2gui, toast: () => doc.getElementById('toast').textContent };
}
// by time, not by count (a busy PC needs more ticks): at least 60 s, then a WAIT line and null; the check after it reports
const until = async (f, ms = W.COND_MS) => { const t0 = Date.now(); for (;;) { let v; try { v = f(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 >= ms) { W.say('test-header', String(f).slice(0, 120), ms); return null; } await tick(); } };

(async () => {
  const EN = LANG('en'), TEN = {}; for (const r of TASKL) TEN[r[0]] = r[1];

  // ===== 1. game folder
  {
    const P = await load({ ls: { 'as2gui.mod': JSON.stringify(MODP) } }), d = P.doc;
    ok(!!P.S(), 'the page built (game folder found)');
    const gb = d.getElementById('gamebar'), gi = d.getElementById('gameinfo');
    ok(gb && gb.textContent === '' && !gb.has(GAMEP), 'game fine: the header holds no game path and no warning', gb && gb.textContent);
    ok(gi && gi.has(GAMEP) && gi.has('(steam)'), 'Settings, Game folder card: the path and where it was found', gi && gi.textContent);
    const card = gi && (function up(e) { while (e && !(e.dataset && e.dataset.blk === 'game')) e = e.parentNode; return e; })(gi);
    ok(card && card.querySelector('h3') && card.querySelector('h3').textContent === EN['stg.game.h'].replace('{g}', 'AS64'), 'the card is block "game" with its heading naming the game', card && card.textContent.slice(0, 120));
    const sec = card && (function up(e) { while (e && e.tagName !== 'SECTION') e = e.parentNode; return e; })(card);
    ok(sec && sec.dataset.id === 'settings', 'the Game folder card is on the Settings page');
    const chg = gi && gi.querySelector('button[data-gamechg]');
    ok(chg && chg.textContent === EN['game.folder'], 'the card has the Game folder... button');
    const ro = d.getElementById('runoff'), rs = ro && ro.querySelector('span[data-runoff]');
    ok(rs && rs.dataset.runoff === 'off' && rs.textContent === EN['game.offS'] && rs.attrs.title === EN['game.off'], 'the game runs note: a short chip by the game buttons, the full words in its title', ro && ro.textContent);
    // 2. the mod pill
    const mc = d.getElementById('modchip');
    ok(mc.textContent === EN['mod.chip'].replace('{p}', 'MyMod'), 'mod pill: the last folder name only', mc.textContent);
    ok(mc.title === MODP && mc.attrs['aria-label'] === EN['mod.chipAria'].replace('{p}', MODP), 'mod pill: the full path in title and aria-label', JSON.stringify(mc.attrs));
    d.getElementById('modchg').click(); await tick();
    ok(d.getElementById('pk').open && mc.textContent === EN['mod.chip'].replace('{p}', MODP) && mc.dataset.full === '1', 'mod pill: the full path while the Change picker is open', mc.textContent);
    d.getElementById('pk').close(); d.getElementById('pk').fire('close');
    ok(mc.textContent === EN['mod.chip'].replace('{p}', 'MyMod') && mc.dataset.full === '0', 'mod pill: short again when the picker closes', mc.textContent);
    // 3. Quick Guided Task: no saved task, Hide and Show
    await until(() => P.row.querySelector('button[data-task-min]'));
    const hide = P.row.querySelector('button[data-task-min]');
    ok(hide && hide.textContent === TEN['task.row.hide'] && hide.attrs['aria-expanded'] === 'true' && hide.attrs['aria-controls'] === 'taskrow', 'task row: a Hide button with aria-expanded=true');
    hide.click();
    const show = P.row.querySelector('button[data-task-show]');
    ok(show && show.attrs['aria-expanded'] === 'false' && show.textContent === TEN['task.row.label'] && !P.row.querySelector('select[data-task-recipe]') && !P.row.querySelector('button[data-task-start]'), 'task row folded: one Quick Guided Task button, aria-expanded=false, no task list', P.row.textContent);
    ok(d.activeElement === show, 'the focus stays on the toggle after folding');
    ok(P.store.get('as2gui.task.min') === 'true', 'the fold is kept in the window settings (as2gui.task.min)');
    await until(() => P.posts.some(x => x.p === '/api/settings' && x.body && x.body.set && x.body.set['as2gui.task.min'] === true));
    ok(P.posts.some(x => x.p === '/api/settings' && x.body.set['as2gui.task.min'] === true), 'as2gui.task.min goes to the server settings file', JSON.stringify(P.posts.map(x => x.body)));
    ok(SETTINGS.okKey('as2gui.task.min') && SETTINGS.okKey('as2gui.task.verb'), 'settings.js takes the task keys');
    ok(!P.row.querySelector('[data-task-wait]'), 'folded with no saved task: no waiting mark');
    show.click();
    ok(P.row.querySelector('select[data-task-recipe]') && P.row.querySelector('button[data-task-min]') && P.store.get('as2gui.task.min') === 'false' && d.activeElement === P.row.querySelector('button[data-task-min]'), 'Show opens the row again, focus on Hide');
    // the Settings button in the header warning is not there while the game is fine
    ok(!gb.querySelector('button'), 'game fine: no Game folder... button in the header');
  }
  {   // no game folder: the warning and the button that opens the setting
    const P = await load({ game: NONE }), d = P.doc, gb = d.getElementById('gamebar');
    const wn = gb.querySelector('span[data-gamewarn]'), b = gb.querySelector('button[data-gameopen]');
    ok(wn && wn.dataset.gamewarn === 'none' && wn.textContent === EN['game.none'] && wn.attrs.title === EN['game.notSet'], 'no game folder: a short warning in the header, the long help in its title', gb.textContent);
    ok(b && b.textContent === EN['game.folder'] && b.attrs.title === EN['game.hdT'], 'no game folder: the header has a Game folder... button');
    ok(!gb.has('C:\\Games\\AS2'), 'the places tried are not in the header');
    b.click(); await tick();
    const gi = d.getElementById('gameinfo');
    ok(P.S().cur === 'settings' && d.activeElement === gi.querySelector('button[data-gamechg]'), 'the header button opens Settings and puts the focus on the card\'s Game folder... button', P.S().cur);
    ok(gi.has(EN['game.none']) && gi.querySelector('details') && gi.querySelector('details').has('C:\\Games\\AS2'), 'the card says no game found and lists the places tried', gi.textContent);
    ok(d.getElementById('modchip').textContent === EN['mod.none'] && d.getElementById('modchip').title === EN['mod.chipTitle'], 'no mod: the pill keeps its wording');
  }
  {   // a folder that is not the game, and a missing GoH folder under GoH
    const P = await load({ game: { dir: 'D:\\x', source: 'saved', ok: false, codes: ['noexe'] } }), gb = P.doc.getElementById('gamebar');
    const wn = gb.querySelector('span[data-gamewarn]');
    ok(wn && wn.dataset.gamewarn === 'bad' && wn.textContent === EN['game.hdBad'] && wn.attrs.title.includes(EN['game.c.noexe']) && !gb.has('D:\\x'), 'a wrong folder: a short warning, the reason in its title, no path', gb.textContent);
    const Q = await load({ ls: { 'as2gui.gameId': JSON.stringify('goh') }, goh: { codes: ['none'] } }), gq = Q.doc.getElementById('gamebar');
    const wq = gq.querySelector('span[data-gamewarn]');
    ok(wq && wq.dataset.gamewarn === 'gohnone' && gq.querySelector('button[data-gameopen]'), 'GoH with no GoH folder: the warning and the button', gq.textContent);
    ok(Q.doc.getElementById('gameinfo').querySelector('span[data-gohas2]') && Q.doc.getElementById('gameinfo').has(GAMEP), 'GoH: the card says where results go (the AS2 folder)');
    const T = await load({ launch: true }), rt = T.doc.getElementById('runoff').querySelector('span[data-runoff]');
    ok(rt && rt.dataset.runoff === 'on' && rt.textContent === EN['game.onS'] && rt.attrs.title === EN['game.on'], 'game runs on: the chip says so');
  }
  {   // LAN Remote: the card shows the folder, its buttons are hidden by CSS and pick refuses
    const P = await load({ remote: true }), d = P.doc, gi = d.getElementById('gameinfo');
    ok(gi && gi.has(GAMEP), 'LAN Remote: the Settings card shows the game folder');
    ok(/body\.remote \[data-gamechg\]/.test(html), 'LAN Remote: CSS hides the change buttons (data-gamechg)');
    gi.querySelector('button[data-gamechg]').click();
    ok(!d.getElementById('pk').open && P.toast() === EN['rmt.viewOnly'], 'LAN Remote: the game folder cannot be changed (view only)', P.toast());
    d.getElementById('modchg').click();
    ok(d.getElementById('modchip').dataset.full !== '1', 'LAN Remote: Change does not open the picker, the pill stays short');
  }
  {   // a saved task waits: the folded row still says so and has Continue; a new load starts folded
    const P = await load({ drafts: [DRAFT], ls: { 'as2gui.task.min': 'true' } });
    await until(() => P.row.querySelector('button[data-task-show]'));
    const wt = P.row.querySelector('[data-task-wait]'), cb = P.row.querySelector('button[data-task-continue]');
    ok(P.row.querySelector('button[data-task-show]') && !P.row.querySelector('select[data-task-recipe]'), 'a new page load starts folded (the kept setting)');
    ok(wt && wt.textContent === TEN['task.row.waiting.1'].replace('{n}', '1') && cb && cb.textContent === TEN['task.row.continue'], 'folded with a saved task: "1 saved task waiting" and Continue', P.row.textContent);
    ok(P.row.classList.contains('tk-min'), 'the folded row has class tk-min (the thin line)');
  }
  {   // another language: the header strings come from the tables
    for (const c of ORDER.slice(1)) {
      const L = LANG(c), TL = {}; const ix = ORDER.indexOf(c) + 1; for (const r of TASKL) TL[r[0]] = r[ix];
      const P = await load({ lang: c, game: NONE, ls: { 'as2gui.mod': JSON.stringify(MODP) } }), d = P.doc;
      ok(d.getElementById('gamebar').querySelector('button[data-gameopen]').textContent === L['game.folder'] && d.getElementById('gamebar').querySelector('span[data-gamewarn]').textContent === L['game.none'], c + ': header warning in this language');
      ok(d.getElementById('modchip').attrs['aria-label'] === L['mod.chipAria'].replace('{p}', MODP), c + ': mod pill aria-label in this language');
      await until(() => P.row.querySelector('button[data-task-min]'));
      ok(P.row.querySelector('button[data-task-min]').textContent === TL['task.row.hide'], c + ': task Hide in this language');
      ok(d.getElementById('runoff').textContent === L['game.offS'], c + ': game runs chip in this language');
    }
    const keys = ['mod.chipAria', 'game.hdGoh', 'game.hdBad', 'game.hdNoExe', 'game.hdBadGoh', 'game.hdT', 'game.offS', 'game.onS', 'stg.game.h', 'stg.game.p'];
    ok(ORDER.every(c => keys.every(k => typeof LANG(c)[k] === 'string' && LANG(c)[k].trim())), 'the new core strings are in en, ru, uk, zh');
    const tk = ['task.row.hide', 'task.row.hideT', 'task.row.showT', 'task.row.waiting', 'task.row.waiting.1'];
    ok(tk.every(k => { const r = TASKL.find(x => x[0] === k); return r && r.length === 5 && r.slice(1).every(s => s && !/[\u2010-\u2015]/.test(s)); }), 'the new task strings are in en, ru, uk, zh, no dash characters');
  }
  // ===== 4. header rows: CSS in theme tokens
  {
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
    ok(/header>#taskrow\{border-top:1px solid var\(--hdl\)\}/.test(css) && /header>nav\{border-top:1px solid var\(--hdl\);background:var\(--tab\)/.test(css), 'rows: a line in --hdl above the task row and above the tab band; the tab band has its own background (--tab)');
    ok(/header>#taskrow,header>nav,header>#subnav,header>#pagenav\{flex:0 0 calc\(100% \+ 20px\);max-width:none;margin:0 -10px;padding:5px 10px\}/.test(css), 'rows: each lower row spans the header from edge to edge with the same padding');
    ok(/@media \(max-width:700px\)\{[^\n]*header>#taskrow,header>nav,header>#subnav,header>#pagenav\{flex:0 0 calc\(100% \+ 12px\);margin:0 -6px;padding:4px 6px\}/.test(css), 'rows at phone width: the same lines with the phone padding');
    ok(/nav button\{background:var\(--hd\)/.test(css) && /#subnav button\{background:var\(--hd\)/.test(css), 'tabs and sub-tabs on the band are drawn in --hd (tested contrast pair tabfg on hd)');
    const hdr = /<header id=hdr>([\s\S]*?)<\/header>/.exec(html)[1];
    ok(/<span id=gamebar><\/span>/.test(hdr) && !/<span class=hx><span id=gamebar>/.test(hdr) && /<span class=hx><span id=hdlockhd><\/span><span id=themebox><\/span><span id=langbox><\/span><\/span>/.test(hdr), 'header: the game warning sits outside the More fold; the header lock, theme and language stay in it');
    ok(/<div id=games role=tablist><\/div><span id=runoff><\/span>/.test(hdr), 'header: the game runs chip right after the game buttons');
  }
  // ===== 5. the header lock is a window setting: the server file keeps it (a new port keeps it), this origin's value is the instant fallback
  {
    ok(SETTINGS.okKey('as2gui.hdlock'), 'settings.js takes as2gui.hdlock');
    const free = P => P.doc.body.classList.contains('hdfree');
    const sent = (P, v) => P.posts.some(x => x.p === '/api/settings' && x.body && x.body.set && x.body.set['as2gui.hdlock'] === v);
    // nothing kept anywhere: locked
    let P = await load({});
    ok(!free(P), 'default: the header is locked (no body class hdfree)');
    // switched off with the Floating Header box in the header: the browser copy and the server both get it
    P.w.__as2in.show('settings'); await tick();
    const box = await until(() => P.doc.getElementById('hdlockhd')), cb = box && box.querySelector('input');
    ok(!!cb && cb.checked === true, 'header: the Floating Header box, ticked');
    if (cb) { cb.checked = false; cb.fire('change'); }
    ok(free(P) && P.store.get('as2gui.hdlock') === 'false', 'off: body class hdfree at once, kept in this origin');
    await until(() => sent(P, false));
    ok(sent(P, false), 'off: as2gui.hdlock = false goes to the server settings file', JSON.stringify(P.posts.map(x => x.body)));
    // a new port: an empty origin, the server says off
    P = await load({ srv: { 'as2gui.hdlock': false, 'as2gui.theme': 'dark' } });
    ok(free(P), 'new port (empty browser storage), server says off: the header is free');
    ok(P.store.get('as2gui.hdlock') === 'false', 'the server value is copied to this origin for the next load');
    ok(!sent(P, false) && !sent(P, true), 'nothing sent back for a value the server already has');
    // the server wins over an old browser value
    P = await load({ srv: { 'as2gui.hdlock': true }, ls: { 'as2gui.hdlock': 'false' } });
    ok(!free(P) && P.store.get('as2gui.hdlock') === 'true', 'server on, browser off: on (the server file wins)');
    // a server file from before this key: the browser value stands and goes up once
    P = await load({ srv: { 'as2gui.theme': 'dark' }, ls: { 'as2gui.hdlock': 'false' } });
    ok(free(P), 'server file without the key, browser off: off');
    await until(() => sent(P, false));
    ok(sent(P, false), 'and that value goes to the server once');
    // the browser value applies before the settings arrive (no jump on load): the page script calls applyHdLock right after applyStatic
    ok(/\napplyStatic\(\);applyHdLock\(\);/.test(html) && /setLoad\(a\[2\]\);applyHdLock\(\);/.test(html), 'applied from this origin at script start, again when the server settings arrive');
    P = await load({ ls: { 'as2gui.hdlock': 'false' } });
    ok(free(P), 'browser off, empty server: off');
    await until(() => sent(P, false));
    ok(sent(P, false), 'an empty server file takes the browser value (first start)');
  }
  console.log((failN ? 'FAIL' : 'PASS') + ' header: ' + pass + ' ok, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL header test crashed: ' + (e && e.stack)); process.exit(1); });
