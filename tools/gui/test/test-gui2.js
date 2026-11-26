// GUI-2 test: what the server serves, how the page calls the back end, and the GUI-1 rows (cancel, timeout, 409 lock, prove argv).
//   node tools/gui/test/test-gui2.js [scratchDir]       needs no game and no browser; never starts a game.
// The page script (tools/gui/page.js) runs under node against a fake DOM (fakedom.js) and the real server over HTTP.
// Every child process is replaced through the server's in-process spawnHook by a harmless `node -e`; the hook records the REAL argv first.
// So prove, edrun and the as2 flow commands are never spawned here, only their argv and the server's reaction are checked.
// Author: Imperator_Aug (ARSENAL, ia-36e08fce)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const gui = require('../gui'), contract = require('../contract'), fakedom = require('./fakedom');
const TOOLS = path.join(__dirname, '..', '..');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui2-test-')));
fs.mkdirSync(S, { recursive: true });
// no game, as the header says: without this the server finds a real Steam install, and the first mod pick makes the page's ext calls
// (ide/tree, files/tree) build that game's layered view, a synchronous 13-14 s job that holds the server and outlasts the 15 s waits
process.env.AS2_NO_STEAM = '1'; delete process.env.AS2_GAME; delete process.env.GOH_GAME;
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// AS2GUI_WAIT=N multiplies every wait (a loaded machine, where the first page calls each take seconds)
const WAITX = Math.max(1, Number(process.env.AS2GUI_WAIT) || 1);
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), only then a miss is reported. Backup, never a hang
async function waitFor(cond, what, ms = 15000) { const v = await W.until(cond, { who: 'test-gui2', what, ms: ms * WAITX, step: 25 }); if (!v) { ok(false, 'not done after the long wait: ' + what); return null; } return v; }
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const NODE = process.execPath;
const SLEEPER = "console.log('pid '+process.pid);setInterval(function(){},1000)";
const ECHO = "console.log('echo ok')";
const WRITEJSON = "require('fs').writeFileSync(process.argv[1],process.argv[2]);console.log('wrote result')";
const cp1251 = s => Buffer.from([...s].map(c => { const n = c.charCodeAt(0); return n >= 0x410 && n <= 0x44F ? n - 0x410 + 0xC0 : n; }));

// ---- HTTP helpers
function req(port, method, url, body, hdr) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, hdr) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } resolve({ status: res.statusCode, text: t, j, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
// streaming run: events as they arrive; abort() drops the connection (a browser tab closing)
function streamRun(port, cmd, input, timeoutSec) {
  const events = []; let status = 0, req_;
  const done = new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify({ cmd, input, timeoutSec }));
    req_ = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/run', agent: false, headers: { host: '127.0.0.1:' + port, 'content-type': 'application/json', 'content-length': data.length } }, res => {
      status = res.statusCode; let buf = '', whole = ''; res.setEncoding('utf8');
      res.on('data', d => { whole += d; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l && status === 200) events.push(JSON.parse(l)); } });
      res.on('end', () => resolve({ status, events, whole })); res.on('close', () => resolve({ status, events, whole }));
    });
    req_.on('error', e => { if (e.code === 'ECONNRESET' || e.message === 'socket hang up') resolve({ status, events, aborted: true }); else reject(e); });
    req_.write(data); req_.end();
  });
  return { events, done, abort: () => req_.destroy(), get status() { return status; } };
}
const endOf = r => r.events.find(e => e.t === 'end');

// ---- the page under node
function loadPage(port, ls) {
  const doc = fakedom.make(), urls = [], confirms = [];
  const store = new Map(Object.entries(ls || {}));
  const ctx = {
    document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: m => { confirms.push(m); return true; },
    fetch: (u, o) => { const rec = { url: u, method: (o && o.method) || 'GET', body: o && o.body ? JSON.parse(o.body) : null, headers: Object.assign({}, (o && o.headers) || {}), status: 0 }; urls.push(rec); return fetch('http://127.0.0.1:' + port + u, o).then(r => { rec.status = r.status; return r; }); },
  };
  ctx.window = ctx; vm.createContext(ctx);
  return gui.start === undefined ? null : { doc, ctx, urls, confirms, store, run(html) {
    const m = /<script>([\s\S]*)<\/script>/.exec(html); if (!m) throw new Error('no script in page');
    vm.runInContext(m[1], ctx, { filename: 'page.js:script' });
  } };
}
// GX: ext pages add screens; the core seven by data-id.
// W5 GUI-TABS, nine-tab layout: tools/gui/groups.js GAMES = per game its tabs (fixed Alt key each) > sub-tabs > refs (a page id or page/view).
// A page opens by its tab in the current game (Alt+key from the table), then by its sub-tab (#subnav), then by its item (#pagenav, the third
// row); a page the current game does not show opens by first picking the game that has it. Ids with no page yet are never shown.
// W5 Make split: make = the Generator, upgrade = Upgrade or Port (its own page), the New Mod card on Mods; Translate is a fold of the GoH unit page
const CORE = ['mods', 'make', 'upgrade', 'check', 'play', 'test', 'settings'];
const allSecs = doc => doc.getElementById('main').children;
const secs = doc => CORE.map(id => allSecs(doc).find(s => s.dataset.id === id)).filter(Boolean);
const EXTN = require('../ext').filter(x => x.script && x.nav).length;
const { GAMES, DEFAULT: GDEF, ADVREF } = require('../groups');
const EN = require('../lang/en.json');
const ALLP = [...new Set(GAMES.flatMap(g => g.tabs.flatMap(t => t.pages)))];
const NOPAGE = [];   // ids listed in groups.js for pages not built yet (never shown); none left since upgrade, missions and modes have their pages
const pgOf = r => String(r).split('/')[0];
const hasSec = (doc, p) => allSecs(doc).some(s => s.dataset.id === p);
const curG = doc => { const b = doc.getElementById('games').children.find(x => x.attrs['aria-selected'] === 'true'); return b ? b.dataset.game : ''; };
const gameBtn = (doc, id) => doc.getElementById('games').children.find(b => b.dataset.game === id);
const gOf = gid => GAMES.find(x => x.id === gid);
// where a page sits in a game's table, as the page finds it: its first tab, there the plain ref before a view ref
const locIn = (gid, page) => { const g = gOf(gid); if (!g) return null; const t = g.tabs.find(x => x.pages.includes(page)); if (!t) return null; let best = null;
  for (const s of t.subs) for (const r of s.pages) { if (pgOf(r) !== page) continue; const sc = r === page ? 2 : 1; if (!best || sc > best.sc) best = { t, s, r, sc }; }
  return best; };
const tabIn = (gid, page) => { const L = locIn(gid, page); return L ? L.t : null; };
// the tabs a game shows on a built page: a tab with at least one ref whose page exists
const tabsOn = (doc, g) => g.tabs.filter(t => t.subs.some(s => s.pages.some(r => hasSec(doc, pgOf(r)))));
const navOf = (doc, id) => { const t = tabIn(curG(doc), id); return t ? doc.getElementById('nav').children.find(b => b.dataset.id === t.id) : null; };
const navIds = doc => [...doc.getElementById('nav').children].map(b => b.dataset.id).join();
const visTabs = doc => doc.getElementById('nav').children.filter(b => !b.hidden).map(b => b.dataset.id).join();
const itemOf = (doc, ref) => doc.getElementById('pagenav').children.find(b => b.dataset.id === ref);
const items = doc => doc.getElementById('pagenav').children.map(b => b.dataset.id).join();
const subIds = doc => doc.getElementById('subnav').children.map(b => b.dataset.id).join();
// pick a game in the header and wait until its folder check is back (the screens refresh then)
async function toGame(doc, id) { const was = curG(doc); gameBtn(doc, id).click();
  // a switch blanks the game line at once (no text of the game before), the reply for the new game fills it
  if (was && was !== id) ok(!!doc.getElementById('gameinfo').querySelector('span[data-gamewait]') && !doc.getElementById('gameinfo').querySelector('span[data-gohas2]'), 'game line greyed at once on the switch ' + was + ' -> ' + id, doc.getElementById('gameinfo').textContent);
  await waitFor(() => curG(doc) === id && !doc.getElementById('gameinfo').querySelector('span[data-gamewait]') && (id === 'goh' ? doc.getElementById('gameinfo').querySelector('span[data-gohas2]') : !doc.getElementById('gameinfo').querySelector('span[data-gohas2]')), 'game ' + id + ' on'); await sleep(30); }
const subOf = (doc, id) => [...doc.getElementById('subnav').children].find(b => b.dataset.id === id);
const tabText = b => b.textContent.replace(/^Alt\+\d/, '');
// open a page as a user does: Alt+key for its tab (only when that tab is not open: on the open tab Alt+key steps on), then its sub-tab, then its item
const altKey = (doc, id) => {
  const L = locIn(curG(doc), id), b = navOf(doc, id);
  if (!L || !b) return;   // the current game does not show it
  if (b.attrs['aria-selected'] !== 'true') { if (L.t.key) doc.key(L.t.key, { altKey: true }); else b.click(); }   // GT-27: Alt+key from groups.js
  const s = subOf(doc, L.s.id); if (s && s.attrs['aria-selected'] !== 'true') s.click();
  const it = itemOf(doc, L.r); if (it && it.attrs['aria-selected'] !== 'true') it.click();
};
const field = (el, name) => { const l = el.all().find(e => e.tagName === 'LABEL' && e.dataset.f === name); return l ? l.children[1].tagName === 'SPAN' ? l.children[1].children[0] : l.children[1] : null; };
const cardOf = (sec, title) => { const h3 = sec.all().find(e => e.tagName === 'H3' && e.textContent === title); let c = h3 ? h3.parentNode : null; while (c && !c.classList.contains('card')) c = c.parentNode; return c; };   // the heading sits in its own block inside the card
const statOf = el => { const s = el.all().find(e => e.tagName === 'SPAN' && /^(exit \d+|cancelled|timed out|Fill in first:|not run)/.test(e.textContent)); return s ? s.textContent : ''; };

// W5 shell: three games in the header, tabs per game from groups.js, fixed Alt keys, game/mod/tab remembered, theme switch, picker message
async function shellChecks(P, port, root) {
  const doc = P.doc, St = P.ctx.__as2gui, sec = id => allSecs(doc).find(x => x.dataset.id === id);
  await toGame(doc, 'as64'); altKey(doc, 'mods');
  ok(doc.getElementById('games').children.map(b => b.textContent).join() === 'MoW:AS2,AS64,GoH' && doc.getElementById('games').children.every(b => b.attrs.role === 'tab'), 'header: three games MoW:AS2, AS64, GoH in that order', doc.getElementById('games').textContent);
  // a tab has the same Alt key and label in every game that shows it (GT-27: by the table, never by the place)
  { const by = {}; for (const g of GAMES) for (const t of g.tabs) (by[t.id] = by[t.id] || new Set()).add(t.key + '|' + t.label);
    ok(Object.values(by).every(s => s.size === 1) && Object.keys(by).length === 9, 'groups.js: nine tabs, each with one Alt key and one label in every game', JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v]])))); }
  const keys = [];
  for (const g of GAMES) {
    await toGame(doc, g.id);
    const want = tabsOn(doc, g).map(t => t.id).join();
    ok(curG(doc) === g.id && navIds(doc) === want && P.store.get('as2gui.gameId') === JSON.stringify(g.id), g.name + ': tabs come from groups.js (' + want + ')', navIds(doc));
    keys.push(g.id + ':' + g.tabs.filter(t => t.key).map(t => t.key + t.id).join(' '));
    // every tab, sub-tab and item on show leads only to pages this game lists; ids with no page are never reached
    const shown = new Set(g.tabs.flatMap(t => t.pages)), seen = new Set(), adv0 = P.store.get('as2gui.adv');
    for (const b of doc.getElementById('nav').children.filter(x => !x.hidden)) { b.click(); seen.add(St.cur);
      for (const sb of [...doc.getElementById('subnav').children]) { sb.click(); seen.add(St.cur); for (const it of doc.getElementById('pagenav').children) seen.add(pgOf(it.dataset.id)); } }
    ok([...seen].every(p => shown.has(p) && hasSec(doc, p)) && seen.size > 3, g.name + ': tabs, sub-tabs and items lead only to its own pages (' + [...seen].join() + ')');
    ok(visTabs(doc) === want && P.store.get('as2gui.adv') === adv0, g.name + ': every tab shows (Advanced on adds no tab)', visTabs(doc));
    for (const t of tabsOn(doc, g)) { const b = doc.getElementById('nav').children.find(x => x.dataset.id === t.id), kb = b.children.find(x => x.tagName === 'KBD');
      ok(t.key ? kb && kb.textContent === 'Alt+' + t.key && b.attrs['aria-keyshortcuts'] === 'Alt+' + t.key && tabText(b) === EN[t.label] : !kb, g.name + ' tab ' + t.id + ': shortcut ' + (t.key ? 'Alt+' + t.key : 'none') + ' and label from the table'); }
  }
  // GT-27: the key does not move with the position. The tabs each game shows come from groups.js (game parity: MoW:AS2 and GoH list the
  // tabs of AS64; a page a game cannot run keeps its place through game.na), never from a list written here
  await toGame(doc, 'mowas2');
  { const want = tabsOn(doc, gOf('mowas2')).map(t => t.id).join(), w64 = tabsOn(doc, gOf('as64')).map(t => t.id).join(), wg = tabsOn(doc, gOf('goh')).map(t => t.id).join();
    ok(navIds(doc) === want, 'MoW:AS2: the tabs of groups.js (' + want + ')', navIds(doc));
    ok(want === w64 && wg === w64, 'game parity: MoW:AS2 and GoH show the same tabs as AS64 in groups.js', want + ' / ' + wg + ' / ' + w64); }
  doc.key('2', { altKey: true }); if (subOf(doc, 'check').attrs['aria-selected'] !== 'true') subOf(doc, 'check').click();
  ok(['check', 'logs'].includes(St.cur) && navOf(doc, 'check').attrs['aria-selected'] === 'true', 'MoW:AS2: Alt+2 then the Check & Fix sub-tab reaches Check', St.cur);
  altKey(doc, 'check'); ok(sec('check').hidden === false, 'MoW:AS2: Check shown');
  doc.key('8', { altKey: true }); ok(['testplan', 'test', 'share', 'play'].includes(St.cur) && navOf(doc, 'share').attrs['aria-selected'] === 'true' && subIds(doc) === 'test,share,play', 'MoW:AS2: Alt+8 opens Test, Share & Play (sub-tabs Test Run, Share, Play), by the table not the place', St.cur + ' ' + subIds(doc));
  altKey(doc, 'check'); doc.key('0', { altKey: true }); ok(sec('check').hidden === false, 'MoW:AS2: Alt+0 does nothing (no tab has it)');
  { const chk = cardOf(sec('check'), 'Check a mod (static, nothing is run)'), fx = cardOf(sec('check'), 'Fix: plan, then apply into a patch mod'), pl = sec('play'); altKey(doc, 'check');
    ok(field(chk, 'exe').value === 'mowas2' && field(fx, 'target').value === 'mowas2', 'MoW:AS2: check gets --exe mowas2, fix gets --target mowas2', field(chk, 'exe').value + ' ' + field(fx, 'target').value);
    ok(!pl || !field(pl, 'exe') || /mowas_2.exe$/.test(field(pl, 'exe').value) || !field(pl, 'exe').value, 'MoW:AS2: play gets mowas_2.exe when the game folder is known'); }
  // GoH: Alt+8 opens Test, Share & Play when groups.js gives GoH that tab (else it does nothing); check gets --exe goh; fix --target goh (fix.js takes it)
  await toGame(doc, 'goh'); altKey(doc, 'check');
  { const gShare = gOf('goh').tabs.some(t => t.id === 'share');
    doc.key('8', { altKey: true });
    if (gShare) ok(navOf(doc, 'share') && navOf(doc, 'share').attrs['aria-selected'] === 'true' && sec('check').hidden === true, 'GoH: Alt+8 opens Test, Share & Play (groups.js gives GoH that tab)', St.cur);
    else ok(sec('check').hidden === false && sec('play').hidden === true && sec('share').hidden === true, 'GoH: Alt+8 (Test, Share & Play) does nothing, GoH has no such tab');
    altKey(doc, 'check'); }
  { const chk = cardOf(sec('check'), 'Check a mod (static, nothing is run)'), fx = cardOf(sec('check'), 'Fix: plan, then apply into a patch mod');
    ok(field(chk, 'exe').value === 'goh' && fx.hidden === false && field(fx, 'target').value === 'goh', 'GoH: check gets --exe goh; the Fix card is on show with --target goh', field(fx, 'target').value + ' hidden=' + fx.hidden); }
  // one mod per game, each game keeps its own mod and tab
  const gm = path.join(root, 'beta'); St.mod = gm; ok(St.mod === gm && JSON.parse(P.store.get('as2gui.games')).goh.mod === gm, 'GoH: its own mod (S.mod writes the current game\'s mod)');
  await toGame(doc, 'as64');
  ok(St.mod === path.join(root, 'alpha') && doc.getElementById('modchip').title === path.join(root, 'alpha') && doc.getElementById('modchip').textContent.endsWith('alpha') && P.store.get('as2gui.mod') === JSON.stringify(path.join(root, 'alpha')), 'as64: back to its own mod, shown in the header; the old mod key still holds it');
  // a game switch keeps the page when the other game has it (owner 2026-11-20); the game's own mod comes back
  altKey(doc, 'units'); await toGame(doc, 'goh'); ok(sec('units').hidden === false && sec('check').hidden === true && St.cur === 'units' && St.mod === gm, 'GoH: the same page (Units) stays, not the Check page GoH was left on; its own mod comes back', St.cur);
  await toGame(doc, 'as64'); ok(sec('units').hidden === false, 'as64: still Units');
  // a page the other game does not have: that game's own last page
  if (!gOf('as64').tabs.some(t => t.pages.indexOf('goh') >= 0)) { altKey(doc, 'check'); await toGame(doc, 'goh'); P.ctx.__as2in.show('goh'); ok(St.cur === 'goh', 'GoH: on the GoH unit page');
    await toGame(doc, 'as64'); ok(St.cur === 'check' && sec('check').hidden === false, 'as64 has no GoH unit page: the page as64 was left on (Check) comes back', St.cur); altKey(doc, 'units'); }
  // a link to a page of another game switches the game
  ok(P.ctx.as2Link('page:xlate') === true && curG(doc) === 'goh' && St.cur === 'goh', 'page:xlate (the old Translate page) opens the GoH unit page, switching to GoH', St.cur);
  await toGame(doc, 'as64');
  // a link to one view of a page (page/view): the page opens with that view, its item selected in the third row
  ok(P.ctx.as2Link('page:docs/engine') === true && St.cur === 'docs' && St.view.docs === 'engine' && navOf(doc, 'docs').attrs['aria-selected'] === 'true' && subOf(doc, 'docs').attrs['aria-selected'] === 'true'
    && itemOf(doc, 'docs/engine') && itemOf(doc, 'docs/engine').attrs['aria-selected'] === 'true' && items(doc) === 'docs/arsenal,docs/modding,docs/engine,docs/project', 'page:docs/engine opens Docs on its Engine item (Project Notes on show with Advanced)', items(doc));
  ok(P.ctx.as2Link('page:nosuch/x') === false && ALLP.filter(p => !hasSec(doc, p)).every(p => P.ctx.as2Link('page:' + p) === false) && St.cur === 'docs', 'page: links to a page with no section are refused');
  // Settings remembers the page it was opened from (S.prev) and its Arrange picker starts there
  altKey(doc, 'check'); altKey(doc, 'settings');
  { const pick = doc.getElementById('arrpage'), opts = pick.children.map(o => o.attrs.value);
    ok(St.cur === 'settings' && St.prev === 'check' && pick.value === 'check' && opts.includes('check') && opts.includes('pro') && !opts.includes('xlate') && opts.every(o => hasSec(doc, o) && gOf('as64').tabs.some(t => t.pages.includes(o))), 'Settings: opened from Check, the Arrange picker starts on Check; it lists the pages of this game only', St.prev + ' ' + pick.value + ' ' + opts.join());
    ok(pick.children.find(o => o.attrs.value === 'logs').textContent === 'Mods > Check & Fix > Read Game.log', 'Settings: the picker names a page by its path in the tabs', pick.children.find(o => o.attrs.value === 'logs').textContent);
    const adds = doc.getElementById('main').querySelector('ul[data-advadds]');
    ok(adds && adds.has('Tools & Settings > Other Tools > Expert Tools') && adds.has('Mods > Mod Files') && !adds.has('Test Run') && !adds.has(EN['grp.share']), 'Settings: lists what Advanced adds under this game by path; Test Run is not among them (it is shown without Advanced)', adds && adds.textContent); }
  // Ctrl+K: every item on show by its path, then Settings, Advanced and Arrange This Page
  doc.key('k', { ctrlKey: true });
  { const kp = doc.getElementById('kpal'), lab = kp ? kp.querySelector('.list').children.map(e => e.textContent) : [];
    ok(kp && kp.open && lab.includes('Page: Mods > Check & Fix > Read Game.log') && lab.some(l => l.startsWith('Page: Help & Docs > Docs > ')) && lab.includes(EN['kp.settings']) && lab.includes(EN['kp.adv']) && lab.includes(EN['kp.arr']) && !lab.some(l => /Translate/.test(l)),
      'Ctrl+K: pages by their path in the tabs, Settings, Advanced, Arrange This Page', lab.join(' | '));
    const inp = kp.querySelector('input'); inp.value = 'read game'; inp.fire('input'); inp.onkeydown({ key: 'Enter', preventDefault() {} });
    ok(St.cur === 'logs' && !kp.open, 'Ctrl+K: typing and Enter opens the page', St.cur);
    // an item whose own name is not the last part of its path carries it: the IDE tab holds the Editor, so "editor" finds it
    ok(lab.includes('Page: IDE (Editor)') && lab.includes('Page: Mods > Check & Fix > Read Game.log') && !lab.some(l => /^Page: .*\(Read Game\.log\)$/.test(l)), 'Ctrl+K: the IDE item also names the Editor, items named by their path are left as they are', lab.filter(l => /^Page: /.test(l)).join(' | '));
    doc.key('k', { ctrlKey: true }); inp.value = 'editor'; inp.fire('input');
    const first = kp.querySelector('.list').children[0]; ok(first && first.textContent === 'Page: IDE (Editor)', 'Ctrl+K: typing "editor" finds the IDE page', first && first.textContent);
    inp.onkeydown({ key: 'Enter', preventDefault() {} }); ok(St.cur === 'ide', 'Ctrl+K: Enter on it opens the IDE page', St.cur); }
  // show(id, view) hands the view to the page's view(v) hook although the nav has no page/view ref for it (hand-overs to an inner tab of
  // Guides and Mod Files), and the tab, sub-tab and item marked stay those of the page itself (a fake view hook stands in for the page's)
  { const marks = () => ['nav', 'subnav', 'pagenav'].map(id => doc.getElementById(id).children.filter(b => b.attrs['aria-selected'] === 'true').map(b => b.dataset.id).join('+')).join(' / ');
    for (const [pg, vw] of [['guides', 'tools'], ['files', 'tree']]) {
      const scr = St.screens[pg], own = Object.prototype.hasOwnProperty.call(scr, 'view'), old = scr.view, got = [];
      altKey(doc, pg); const m0 = marks(); scr.view = v => got.push(v);
      altKey(doc, 'check'); const r = P.ctx.as2Link('page:' + pg + '/' + vw), m1 = marks();
      if (own) scr.view = old; else delete scr.view;
      ok(r === true && St.cur === pg && got.join() === vw && m1 === m0 && sec(pg).hidden === false, 'show(' + pg + ', ' + vw + '): the page\'s view hook gets "' + vw + '" (no nav ref for it); the marked tab, sub-tab and item stay the page\'s own', got.join() + ' | ' + m0 + ' vs ' + m1); } }
  // per game (Advanced on): the Arrange picker names a whole page, never the view opened last (docs: Help & Docs > Docs, not > Historical
  // Sources); the What Advanced adds list names the upgrade fold where it sits behind Advanced; the guided fix goes on to Test Run only where
  // the game has it; the Generator explainer names the Units page only where the game has it
  for (const g of GAMES) { await toGame(doc, g.id);
    ok(P.ctx.as2Link('page:docs/history') === true && St.view.docs === 'history', g.name + ': Historical Sources opened (the last docs view)');
    altKey(doc, 'settings');
    const os = doc.getElementById('arrpage').children, lb = os.map(o => o.textContent), dc = os.find(o => o.attrs.value === 'docs');
    ok(dc && dc.textContent === 'Help & Docs > Docs' && new Set(lb).size === lb.length && lb.every(l => l && !/undefined|>\s*$|\.nav\b|\bgrp\./.test(l)), g.name + ': the Arrange picker names Docs "Help & Docs > Docs" and every page by a label of its own', lb.join(' | '));
    const adds = doc.getElementById('main').querySelector('ul[data-advadds]'), fk = g.kind === 'goh' ? 'stg.adv.folds' : 'stg.adv.foldsU';
    ok(adds && adds.has(EN[fk]) && (g.kind === 'goh') === !adds.has('every upgrade setting on Upgrade or Port'), g.name + ': What Advanced adds names ' + (g.kind === 'goh' ? 'the folds without the upgrade one (always open here)' : 'the upgrade fold on Upgrade or Port'), adds && adds.textContent);
    // Test, Share & Play: the sub-tabs are Test Run (Test Plan, then the Test Run page), Share, Play, in that order, in every game
    { const sh = gOf(g.id).tabs.find(t => t.id === 'share'), tItems = ['testplan', 'test'].filter(p => hasSec(doc, p));
      ok(sh && sh.subs.map(x => x.id + ':' + x.pages.join('+')).join() === 'test:testplan+test,share:share,play:play' && sh.subs[0].label === 'grp.s.test' && EN['grp.s.test'] === 'Test Run', g.name + ': groups.js lists Test Run (testplan, test), Share, Play under Test, Share & Play', sh && JSON.stringify(sh.subs.map(x => [x.id, x.pages])));
      altKey(doc, 'share'); ok(subIds(doc) === 'test,share,play' && doc.getElementById('subnav').children.map(b => b.textContent).join() === 'Test Run,Share,Play', g.name + ': the sub-tab row reads Test Run, Share, Play', subIds(doc));
      altKey(doc, 'test'); ok(St.cur === 'test' && sec('test').hidden === false && subOf(doc, 'test').attrs['aria-selected'] === 'true' && (tItems.length > 1 ? items(doc) === tItems.join() : doc.getElementById('pagenav').hidden === true) && doc.getElementById('nabox').hidden !== false,
        g.name + ': the Test Run page opens under the Test Run sub-tab (third row: ' + tItems.join() + '), no "not available" line', St.cur + ' ' + items(doc)); }
    // step 7 goes on to Test Run in every game that lists it, with or without Advanced: to the Test Plan page where the game has it, else to the Test Run page
    const T7 = gid => (hasSec(doc, 'testplan') && gOf(gid).tabs.some(t => t.pages.includes('testplan')) ? 'testplan' : 'test');
    altKey(doc, 'check'); St.wz.upd(); const nb = sec('check').querySelector('button[data-wznext]'), hasT = gOf(g.id).tabs.some(t => t.pages.includes('test'));
    ok(hasT && nb && nb.hidden === false && nb.textContent === EN['wz.toTest'] && nb.attrs.title === EN['wz.toTestT'] && nb.dataset.go === T7(g.id), g.name + ': guided fix step 7 offers Go to Test Run (target ' + T7(g.id) + ')', nb && nb.textContent + ' hidden=' + nb.hidden + ' go=' + nb.dataset.go);
    nb.click(); ok(St.cur === T7(g.id) && curG(doc) === g.id && sec(T7(g.id)).hidden === false, g.name + ': the step 7 button opens ' + T7(g.id) + ' in this game', St.cur + ' ' + curG(doc));
    // AS64: the step 7 button does not follow the Advanced switch any more (Test Run left Advanced): flipping Advanced through Ctrl+K while
    // Check is open (turning it on asks first) leaves its label, title and click target (data-go) on Test Run, both ways
    if (g.id === 'as64') {
      const kpRun = want => { doc.key('k', { ctrlKey: true }); const kp = doc.getElementById('kpal'), inp = kp.querySelector('input'); inp.value = want; inp.fire('input');
        const f = kp.querySelector('.list').children[0]; ok(f && f.textContent === want, 'Ctrl+K: "' + want + '" is the first item', f && f.textContent); inp.onkeydown({ key: 'Enter', preventDefault() {} }); };
      const b7 = () => sec('check').querySelector('button[data-wznext]'), s7 = () => { const b = b7(); return b ? [b.textContent, b.attrs.title, b.dataset.go, b.hidden].join('|') : 'none'; };
      const w7 = () => [EN['wz.toTest'], EN['wz.toTestT'], T7('as64'), false].join('|');
      altKey(doc, 'check'); St.wz.upd();
      ok(St.cur === 'check' && P.store.get('as2gui.adv') === 'true' && s7() === w7(true), 'AS64, Advanced on: step 7 reads Go to Test Run, its title and target Test Run', s7());
      const nc = P.confirms.length;
      for (const on of [false, true, false, true]) {
        const c0 = P.confirms.length; kpRun(EN['kp.adv']);
        ok(St.cur === 'check' && P.store.get('as2gui.adv') === String(on) && P.confirms.length === c0 + (on ? 1 : 0) && s7() === w7(on),
          'AS64: Advanced ' + (on ? 'on (the warning accepted)' : 'off') + ' through Ctrl+K while Check is open: step 7 still reads ' + EN['wz.toTest'] + ', with its title and target', s7());
        b7().click(); ok(St.cur === T7('as64'), 'AS64, Advanced ' + (on ? 'on' : 'off') + ': the step 7 button opens exactly ' + T7('as64'), St.cur);
        altKey(doc, 'check'); }
      ok(P.confirms.length === nc + 2 && P.store.get('as2gui.adv') === 'true', 'AS64: each turn on through Ctrl+K asked first (twice), Advanced is on again', P.confirms.length - nc);
      // a refused warning: Advanced stays off and step 7 stays on Test Run (label, title and target together); then on again for the rest
      kpRun(EN['kp.adv']); ok(P.store.get('as2gui.adv') === 'false' && s7() === w7(false), 'AS64: Advanced off again through Ctrl+K', s7());
      const cf = P.ctx.confirm, c1 = P.confirms.length; P.ctx.confirm = m => { P.confirms.push(m); return false; };
      kpRun(EN['kp.adv']);
      ok(St.cur === 'check' && P.store.get('as2gui.adv') !== 'true' && P.confirms.length === c1 + 1 && s7() === w7(false),
        'AS64: the Advanced warning refused through Ctrl+K while Check is open: Advanced stays off, step 7 keeps Go to Test Run, its title and target', s7());
      P.ctx.confirm = cf; kpRun(EN['kp.adv']);
      ok(P.store.get('as2gui.adv') === 'true' && s7() === w7(true), 'AS64: Advanced on again (warning accepted), step 7 still on Test Run', s7());
    }
    // Ctrl+K: a one-item sub-tab whose page has another name carries that name too (not only the IDE): under GoH, Mods > Check & Fix holds only Check
    // (game parity: whether GoH's Check & Fix holds one page or more comes from groups.js; the label follows it)
    if (g.kind === 'goh') { altKey(doc, 'make'); doc.key('k', { ctrlKey: true });
      const cs = gOf('goh').tabs.find(t => t.id === 'mods').subs.find(s => s.id === 'check'), one = cs.pages.filter(r => hasSec(doc, pgOf(r))).length === 1;
      const kp = doc.getElementById('kpal'), lab = kp.querySelector('.list').children.map(e => e.textContent), want = one ? 'Page: Mods > Check & Fix (Check)' : 'Page: Mods > Check & Fix > Check';
      ok(lab.includes(want) && (!one || !lab.some(l => /^Page: Mods > Check & Fix > /.test(l))), 'GoH, Ctrl+K: Check & Fix names its page Check (' + (one ? 'one-item sub-tab: in brackets' : 'by its path') + ')', lab.filter(l => /^Page: /.test(l)).join(' | '));
      const inp = kp.querySelector('input'); inp.value = one ? '(check)' : 'check & fix > check'; inp.fire('input'); const f = kp.querySelector('.list').children[0];
      ok(f && f.textContent === want, 'GoH, Ctrl+K: typing finds it', f && f.textContent);
      inp.onkeydown({ key: 'Enter', preventDefault() {} }); ok(St.cur === 'check' && !kp.open, 'GoH, Ctrl+K: Enter on it opens Check', St.cur); }
    altKey(doc, 'make'); const gw = sec('make').all().find(e => e.dataset && e.dataset.blk === 'gi.when'), gs = sec('make').all().find(e => e.dataset && e.dataset.blk === 'gi.samples'), hasU = gOf(g.id).tabs.some(t => t.pages.includes('units'));
    ok(gw && gw.textContent === EN[hasU ? 'gi.when' : 'gi.whenG'] && gs && gs.textContent === EN['gi.samples'].replace('{b}', EN['new.sample']) && sec('make').all().some(e => e.tagName === 'BUTTON' && e.textContent === EN['new.sample']), g.name + ': the Generator explainer ' + (hasU ? 'names the Units page' : 'leaves out the Units page') + ' and names the real sample button', gw && gw.textContent + ' / ' + (gs && gs.textContent)); }
  // reload: game, mod and tab remembered
  await toGame(doc, 'mowas2'); altKey(doc, 'share');
  const P2 = loadPage(port, Object.fromEntries(P.store)); P2.run(P.html);
  await waitFor(() => P2.ctx.__as2gui && allSecs(P2.doc).find(x => x.dataset.id === 'share') && allSecs(P2.doc).find(x => x.dataset.id === 'share').hidden === false, 'reloaded page on share');
  ok(curG(P2.doc) === 'mowas2' && navIds(P2.doc) === GAMES.find(g => g.id === 'mowas2').tabs.map(t => t.id).join(), 'reload: MoW:AS2 still the game, its tabs shown, Share still open');
  // GT-37: theme switch
  const ts = doc.getElementById('themebox').querySelector('select');
  ok(ts && ts.children.map(o => o.attrs.value).join() === 'auto,light,dark' && ts.value === 'auto' && doc.documentElement.getAttribute('data-theme') === null, 'theme: auto by default (follows the OS), no data-theme');
  ts.value = 'dark'; ts.fire('change'); ok(doc.documentElement.getAttribute('data-theme') === 'dark' && P.store.get('as2gui.theme') === JSON.stringify('dark'), 'theme: Dark sets data-theme=dark and is remembered');
  ts.value = 'auto'; ts.fire('change'); ok(doc.documentElement.getAttribute('data-theme') === null, 'theme: back to auto');
  ok(/prefers-color-scheme:dark/.test(P.html) && /:root\[data-theme=dark\]/.test(P.html), 'CSS: dark colours for the OS setting and for the switch');
  // GT-31: the folder picker says "folder not found"
  await toGame(doc, 'as64');
  doc.getElementById('modchg').click(); ok(doc.getElementById('pk').open, 'mod Change opens the folder picker');
  doc.getElementById('pkpath').value = path.join(root, 'no-such-folder'); doc.getElementById('pkgo').click();
  await waitFor(() => doc.getElementById('pkerr').hidden === false && doc.getElementById('pkerr').textContent, 'picker error shown');
  ok(doc.getElementById('pkerr').has('Folder not found') && doc.getElementById('pkerr').has('no-such-folder') && /<div id=pkerr class=err role=alert hidden>/.test(P.html), 'picker: a missing folder says "Folder not found" in the dialog', doc.getElementById('pkerr').textContent);
  doc.getElementById('pkpath').value = root; doc.getElementById('pkgo').click(); await waitFor(() => doc.getElementById('pkerr').hidden === true, 'picker error cleared');
  doc.getElementById('pk').close();
  // GT-39 / GT-38: skip link, header fold, labelled checkboxes, one-form plural
  ok(doc.getElementById('skip').textContent === 'Skip to the page' && /<a id=skip class=skip href=#main>/.test(P.html), 'skip link to the page');
  { const cl = doc.getElementById('community').children[0];
    ok(cl && cl.tagName === 'A' && cl.attrs.href === 'https://discord.gg/pgmfaaBVbf' && cl.attrs.target === '_blank' && cl.attrs.rel === 'noopener noreferrer' && cl.textContent === 'Join The AS64 Community!' && /<span id=community><\/span>/.test(P.html) && !/<span class=hx>[^\n]*id=community/.test(P.html),
      'header: community link (owner 2026-11-10) with href, new tab, noopener noreferrer; outside the More fold', cl && JSON.stringify(cl.attrs)); }
  const hm = doc.getElementById('hdmore'); hm.click(); ok(doc.getElementById('hdr').classList.contains('more') && hm.attrs['aria-expanded'] === 'true', 'narrow header: More unfolds the rest'); hm.click();
  ok(secs(doc).every(x => x.all().filter(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox').every(e => e.attrs['aria-label'] || e.attrs.id === 'xrest')), 'every checkbox on the core pages has a label');
  ok(P.ctx.as2Progress && typeof P.ctx.as2Progress().start === 'function', 'GT-17: one progress helper for pages (window.as2Progress)');
  console.log('alt keys: ' + keys.join(' | '));
  // GET /api/game?kind=goh: the GoH folder check
  const r = await req(port, 'GET', '/api/game?kind=goh&game=' + encodeURIComponent(root));
  ok(r.status === 200 && r.j.ok === false && r.j.codes.join() === 'notgoh', '/api/game?kind=goh: a folder without call_to_arms.exe gives code notgoh', r.text);
}

async function main() {
  // ===== fixtures: a mod root with two invented mods, one with a cp1251 name
  const root = path.join(S, 'mods-root');
  for (const [dir, name, desc] of [['alpha', 'Alpha mod', 'first test mod'], ['beta', 'Тест мод', 'second']]) {
    fs.mkdirSync(path.join(root, dir, 'resource'), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'mod.info'), Buffer.concat([Buffer.from('{Mod\r\n {Name "'), cp1251(name), Buffer.from('"}\r\n {Description "' + desc + '"}\r\n}\r\n')]));
    fs.writeFileSync(path.join(root, dir, 'resource', 'x.set'), '{x}\r\n');
  }
  fs.mkdirSync(path.join(root, 'plain'), { recursive: true });
  const specDir = path.join(S, 'spec'); fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'a.yaml'), 'name: x\n');
  fs.writeFileSync(path.join(specDir, 'b.exe'), 'MZ');

  // ===== servers. A: no launch. B: --allow-launch. Both replace every child (hook records the real argv first).
  const calls = []; let mode = 'echo', sample = null;
  const hook = (cc, info) => {
    calls.push({ cmd: info.cmd, launches: info.launches, args: cc.args.slice() });
    if (info.cmd === 'translate') return gui.demoHook(cc, info);
    if (mode === 'sleep') return { file: NODE, args: ['-e', SLEEPER] };
    if (mode === 'json') {
      const i = cc.args.indexOf('--json'), target = cc.args[i + 1];
      // write only to the server's own temp result file (as2gui-* under the OS temp dir); anything else = echo, never a path of the repo
      if (i >= 0 && target && path.basename(path.dirname(target)).startsWith('as2gui-') && path.basename(target) === 'result.json') return { file: NODE, args: ['-e', WRITEJSON, target, JSON.stringify(sample)] };
    }
    return { file: NODE, args: ['-e', ECHO] };
  };
  const A = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S });
  const B = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S, allowLaunch: true });
  const last = () => calls[calls.length - 1];
  try {
    // ===== 1. what serves: page, console, static properties of the page
    const pg = await req(A.port, 'GET', '/');
    ok(pg.status === 200 && /^<!doctype html>/i.test(pg.text) && pg.text.includes('<title>A.R.S.E.N.A.L</title>'), 'GET / serves the page');
    // whole documents (docs ext): the page frames its own /api/x/docs/whole, so / sets no frame-ancestors, X-Frame-Options or CSP
    ok(!pg.headers['x-frame-options'] && !pg.headers['content-security-policy'], 'GET / does not forbid framing its own routes', JSON.stringify(pg.headers));
    // a route's text answer {__raw, type}: js, css, plain as asked; html only with sandbox: true and then always under the CSP sandbox
    {
      const CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
      const H = 'text/html; charset=utf-8', rh = o => gui.rawHead(Object.assign({ __raw: 'x' }, o));
      ok(gui.SANDBOX_CSP === CSP, 'raw answer: the sandbox CSP string is exact (opaque origin, nothing loaded from outside)', gui.SANDBOX_CSP);
      ok(rh({ type: H, sandbox: true }).type === H && rh({ type: H, sandbox: true }).extra['content-security-policy'] === CSP, 'raw answer: html with sandbox: true is html under the CSP');
      ok(['text/javascript; charset=utf-8', 'text/css; charset=utf-8', 'text/plain; charset=utf-8'].every(t => rh({ type: t }).type === t && !rh({ type: t }).extra), 'raw answer: js, css, plain unchanged, no CSP');
      ok([{ type: H }, { type: H, sandbox: 'yes' }, { type: 'text/html', sandbox: true }, { type: 'application/xhtml+xml; charset=utf-8', sandbox: true }, { type: 'image/svg+xml', sandbox: true }].every(o => rh(o).type === 'text/plain; charset=utf-8' && !rh(o).extra),
        'raw answer: html without the marker (or another type with it) is plain text');
    }
    // The owner's decision (2026-11-10): the header links the AS64 community Discord. That one exact address is allowed (a link the
    // user clicks, never fetched); any other outside address still fails.
    const COMMUNITY = 'https://discord.gg/pgmfaaBVbf';
    ok(pg.text.split(COMMUNITY).length === 2, 'page holds the community link exactly once');
    const pgOwn = pg.text.split(COMMUNITY).join('');
    ok(!/<script[^>]*\ssrc=|<link\b|https?:\/\/|@import/i.test(pgOwn) && !/url\(/.test(pgOwn),'page loads nothing from outside (no src, link, http, import)');
    ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]|\/(home|Users|usr)\//.test(pg.text.replace(/'\\\\'/g, '')), 'page holds no fixed drive or user path');
    const sm = /<script>([\s\S]*)<\/script>/.exec(pg.text);
    let syntax = null; try { new vm.Script(sm[1], { filename: 'page.js:script' }); } catch (e) { syntax = e.message; }
    ok(!syntax, 'page script parses', syntax);
    ok(!/innerHTML|outerHTML|document\.write|eval\(/.test(sm[1]), 'page never uses innerHTML, document.write or eval');
    {  // E-30: runCard's "Copy as command" asks the server (pro ext /api/x/pro/cmdline = contract.buildArgv), so the line matches what Run does
      ok(sm[1].includes("'/api/x/pro/cmdline'") && sm[1].includes("'data-copycmd'"), 'E-30 runCard has the copy-as-command button on the cmdline route');
      let n = 0; const bad = [];
      for (const d of contract.describe()) {
        if (!d.entry) continue;
        const input = {};
        for (const f of d.fields) if (f.required || f.type === 'bool' && !f.after) input[f.name] = f.type === 'bool' ? true : f.type === 'int' ? (f.min != null ? f.min + 1 : 2) : f.values ? f.values[0] : f.type === 'list' ? ['a', 'b c'] : f.type === 'path' ? path.resolve(os.tmpdir(), 'm x') : 'v w';
        for (const f of d.fields) if (f.after && input[f.after] === true) input[f.name] = 'all';
        let want; try { want = contract.buildArgv(d.id, input).args; } catch (e) { continue; }
        const r = await req(A.port, 'POST', '/api/x/pro/cmdline', { cmd: d.id, input });
        if (r.status === 400 && /unknown command/i.test(JSON.stringify(r.j))) continue;   // in-process commands have no CLI line
        n++; if (r.status !== 200 || !r.j || JSON.stringify(r.j.argv) !== JSON.stringify(want) || r.j.node.indexOf('node tools/' + d.entry) !== 0) bad.push(d.id + ': ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 200));
        if (n >= 12) break;
      }
      ok(n >= 10 && !bad.length, 'E-30 cmdline route gives buildArgv for each command (' + n + ')', bad.slice(0, 3).join('\n  '));
    }
    for (const n of ['Mods', 'Generator', 'Check', 'Play', 'Test Run', 'Translate', 'Advanced', 'Settings']) ok(pg.text.includes('"' + n + '"'), 'screen named: ' + n);   // LANG-1: the names live in the embedded string table (en first), not as literals in the script
    ok((await req(A.port, 'GET', '/console')).text.includes('as2 gui console'), 'GUI-1 console still at /console');
    ok(!(await req(A.port, 'GET', '/console')).text.includes('come in GUI-2'), '/console: no stale "come in GUI-2" text');
    ok(/\.scroll th\{top:0\}/.test(pg.text) && /td\.nw,th\.nw\{white-space:nowrap\}/.test(pg.text), 'CSS: header sticks at 0 inside the scrolling table (did cover row 1 at 34px); date cells do not wrap');
    ok((await req(A.port, 'GET', '/', undefined, { host: 'evil.example' })).status === 403, 'page: bad Host refused');
    const h = (await req(A.port, 'GET', '/api/health')).j; ok(h.ok && h.allowLaunch === false && h.demo === false, 'health reports allowLaunch and demo');

    // ===== 2. argv: prove exact, translate, instance 0 refused
    const proveBase = [path.join(TOOLS, 'prove', 'prove.js')];
    let r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 't34_0', army: 'rus', plan: true } });
    ok(r.status === 200 && r.j.code === 0, 'prove --plan request ran (child replaced by the hook)', r.text);
    ok(JSON.stringify(last().args) === JSON.stringify([...proveBase, '--game', S, '--unit', 't34_0', '--army', 'rus', '--plan']) && last().launches === false, 'prove plan: exact argv, not a launch', JSON.stringify(last()));
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, units: 'a,b:human', army: 'rus', kind: 'vehicle', mods: 'm1,m2', side: 1, map: 'm:coop', hold: 5, inst: 2, depth: 'fire', games: 3, enemy: 'x', tiny: true, addCards: true, plan: true } });
    ok(JSON.stringify(last().args) === JSON.stringify([...proveBase, '--game', S, '--units', 'a,b:human', '--army', 'rus', '--kind', 'vehicle', '--mods', 'm1,m2', '--side', '1', '--map', 'm:coop', '--hold', '5', '--inst', '2', '--depth', 'fire', '--games', '3', '--enemy', 'x', '--tiny', '--add-cards', '--plan']), 'prove with every flag: exact argv in contract order', JSON.stringify(last()));
    const n0 = calls.length;
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 't34_0', army: 'rus', inst: 0, plan: true } });
    ok(r.status === 400 && /at least 1/.test(r.j.error) && calls.length === n0, 'prove inst 0 refused with 400, no child', r.text);
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'edrun', input: { pairs: path.join(S, 'p.json'), out: S, dry: true, inst: 0 } });
    ok(r.status === 400 && calls.length === n0, 'edrun inst 0 refused with 400');
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus' } });
    ok(r.status === 403 && calls.length === n0, 'prove without plan: 403 on a server without --allow-launch, hook never reached');
    ok(JSON.stringify(contract.buildArgv('translate', { goh: S, entity: ['a', 'b'], out: path.join(S, 'o'), askJson: true }, { base: S }).args) === JSON.stringify(['--goh', S, '--entity', 'a', '--entity', 'b', '--out', path.join(S, 'o'), '--ask-json']), 'translate argv: repeated --entity, --ask-json');
    ok(contract.describe().find(c => c.id === 'translate').interactive === true && contract.describe().find(c => c.id === 'check').interactive === false, 'listing marks translate interactive');
    ok(contract.describe().find(c => c.id === 'edrun').fields.find(f => f.name === 'inst').min === 1, 'listing carries min for inst');
    {  // Map Viewer editor shot (mapviz README 1.6, design 8): command mapshot, launch 'dry', a confirm whose strings are the export part's
      const ms = contract.COMMANDS.mapshot, d = contract.describe().find(c => c.id === 'mapshot');
      ok(ms && ms.launch === 'dry' && ms.entry === 'mapviz/edshot/edshot.js' && JSON.stringify(ms.lead) === '["shot"]' && ms.tool === 'mapviz', 'mapshot: edshot entry, lead shot, launch dry');
      ok(fs.existsSync(path.join(TOOLS, ms.entry)), 'mapshot: its entry file exists');
      const base = { target: 'mowas2', map: 'multi/1v1_road', exe: 'mowas_2_ed', root: path.join(S, 'inst x') };
      const bd = contract.buildArgv('mapshot', Object.assign({ dry: true, json: true }, base), { base: S });
      ok(JSON.stringify(bd.args) === JSON.stringify(['shot', '--target', 'mowas2', '--map', 'multi/1v1_road', '--exe', 'mowas_2_ed', '--root', path.join(S, 'inst x'), '--json', '--dry']) && bd.launches === false, 'mapshot dry: exact argv, not a launch', JSON.stringify(bd));
      ok(contract.buildArgv('mapshot', base, { base: S }).launches === true, 'mapshot without dry starts an editor (launch)');
      const refused = (i, re) => { try { contract.buildArgv('mapshot', i, { base: S }); return false; } catch (e) { return e instanceof contract.InputError && re.test(e.message); } };
      ok(refused(Object.assign({}, base, { exe: 'as64_ed', dry: true }), /instance is required for exe as64_ed/), 'mapshot: as64_ed without instance refused');
      ok(refused(Object.assign({}, base, { exe: 'as64_ed', instance: 0, dry: true }), /at least 1/), 'mapshot: instance 0 refused');
      ok(contract.buildArgv('mapshot', Object.assign({}, base, { exe: 'as64_ed', instance: 1, dry: true }), { base: S }).args.join(' ').includes('--instance 1'), 'mapshot: as64_ed takes --instance 1');
      ok(refused(Object.assign({}, base, { exe: 'game.exe', dry: true }), /one of/), 'seeded: an exe outside the three editors refused');
      ok(refused(Object.assign({}, base, { target: 'as2', dry: true }), /one of/), 'seeded: a target outside as64, mowas2, goh refused');
      ok(refused({ target: 'goh', exe: 'goh_ed', dry: true }, /map is required/), 'mapshot: map required');
      // every game the same way: one command, three editors, the console route a value for GoH (owner rule 2026-11-14)
      ok(['as64', 'mowas2', 'goh'].every(t => d.fields.find(f => f.name === 'target').values.includes(t)) && ['as64_ed', 'mowas_2_ed', 'goh_ed'].every(e => d.fields.find(f => f.name === 'exe').values.includes(e)), 'mapshot: three games, three editors');
      // the confirm: names the install folder, the exe, the run files and the profile; strings from the export part's lang file
      const cf = d.confirm;
      ok(cf && cf.key === 'mapviz.export.edConfirm' && cf.lang === 'ext/mapviz/sub/export.lang.json', 'mapshot confirm: key and lang file in the listing', JSON.stringify(cf));
      ok(cf && ['folder', 'exe', 'files', 'profile'].every(k => cf.names[k]) && ['folder', 'files', 'profile', 'editor'].every(a => cf.args.includes(a)), 'mapshot confirm names folder, exe, files, profile');
      ok(cf && JSON.stringify(cf.files) === '["minimap_render.png","minimap_render.png.temp"]' && Object.keys(cf.exes).join() === 'as64_ed,mowas_2_ed,goh_ed', 'mapshot confirm: the run files and the three exes');
      ok(cf && !/(^|[^\w])[A-Za-z]:[\\/]|\/(home|Users)\//.test(JSON.stringify(cf)), 'mapshot confirm holds no drive or user path');
      const LF = path.join(TOOLS, 'gui', cf ? cf.lang : 'x');
      if (fs.existsSync(LF)) {
        let L = null; try { L = JSON.parse(fs.readFileSync(LF, 'utf8')); } catch (e) { L = null; }
        const miss = ['en', 'ru', 'uk', 'zh'].filter(c => !(L && L[c] && typeof L[c][cf.key] === 'string' && cf.args.filter(a => ['editor', 'folder', 'files', 'profile'].includes(a)).every(a => L[c][cf.key].includes('{' + a + '}'))));
        ok(!miss.length, 'mapshot confirm text in the export lang file, four languages, with {editor} {folder} {files} {profile}', miss.join(','));
      } else console.log('# skip mapshot confirm text: ' + cf.lang + ' not written yet');
      r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'mapshot', input: base });
      ok(r.status === 403, 'mapshot without dry: 403 on a server without --allow-launch, no child', r.text);
    }
    // GX: launch switch (session only), installed list, game check, gen sample by name
    r = await req(A.port, 'POST', '/api/launch', { on: 'yes' }); ok(r.status === 400, 'launch switch: a non-boolean is refused');
    r = await req(A.port, 'POST', '/api/launch', { on: true }); ok(r.status === 200 && r.j.allowLaunch === true && (await req(A.port, 'GET', '/api/health')).j.allowLaunch === true, 'launch switch on: health says allowLaunch', r.text);
    r = await req(A.port, 'POST', '/api/launch', { on: false }); ok(r.status === 200 && r.j.allowLaunch === false && (await req(A.port, 'GET', '/api/health')).j.allowLaunch === false, 'launch switch off again');
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus' } }); ok(r.status === 403, 'after the switch is off a launch is refused again');
    r = await req(A.port, 'GET', '/api/installed?game=' + encodeURIComponent(S)); ok(r.status === 200 && Array.isArray(r.j.mods), 'installed: a list of mods in <game>/mods', r.text);
    r = await req(A.port, 'GET', '/api/game?game=' + encodeURIComponent(S)); ok(r.status === 200 && typeof r.j.ok === 'boolean' && Array.isArray(r.j.problems), 'game: ok flag and problems list', r.text);
    ok(JSON.stringify(contract.buildArgv('gen', { sample: true, sampleName: 'armor' }, { base: S }).args) === JSON.stringify(['--sample', 'armor']), 'gen sample by name: --sample armor');
    let sErr = null; try { contract.buildArgv('gen', { sampleName: 'armor' }, { base: S }); } catch (e) { sErr = e.message; } ok(!!sErr, 'gen sampleName without sample is refused', sErr);
    { const C = await gui.start({ port: 0, cwd: S, tmpRoot: S });   // the real gen: --sample only prints (GX N13: the buffered body is not empty)
      try { const g = await req(C.port, 'POST', '/api/run?stream=0', { cmd: 'gen', input: { sample: true, sampleName: 'rename-unit' } });
        ok(g.status === 200 && g.j.code === 0 && g.j.stdout.trim().length > 20 && g.j.lines.length > 2, 'gen --sample rename-unit with stream=0: full body', g.text.slice(0, 200)); } finally { await C.close(); } }

    // ===== 3. read routes for the page
    r = await req(A.port, 'GET', '/api/mods?dir=' + encodeURIComponent(root));
    ok(r.status === 200 && r.j.mods.length === 2 && !r.j.mods.some(m => m.folder === 'plain'), 'mods: two mod folders, the plain folder is left out', r.text);
    ok(r.j.mods.some(m => m.name === 'Тест мод'), 'mods: cp1251 mod.info name decodes');
    r = await req(A.port, 'GET', '/api/mod?dir=' + encodeURIComponent(path.join(root, 'alpha')));
    ok(r.j.name === 'Alpha mod' && r.j.desc === 'first test mod' && r.j.files === 2 && r.j.hasInfo, 'mod: name, description, file count', r.text);
    // GUI-LOC: UTF-8 mod.info name (no BOM) decodes as UTF-8, not cp1251; /api/peek reads a file:line inside resource/entity.pak
    const root2 = path.join(S, 'mods-root2'), gam = path.join(root2, 'gamma');
    fs.mkdirSync(path.join(gam, 'resource'), { recursive: true });
    fs.writeFileSync(path.join(gam, 'mod.info'), '{Mod\r\n {Name "Мод утф-8 ü"}\r\n}\r\n');
    fs.writeFileSync(path.join(gam, 'resource', 'entity.pak'), require('../../lib/zipwrite').zip([['entity/v/a.def', Buffer.from('{game_entity\r\n {weapon "zz"}\r\n}\r\n'), true]]));
    r = await req(A.port, 'GET', '/api/mods?dir=' + encodeURIComponent(root2));
    ok(r.status === 200 && r.j.mods.length === 1 && r.j.mods[0].name === 'Мод утф-8 ü', 'mods: UTF-8 mod.info name decodes as UTF-8', r.text);
    r = await req(A.port, 'GET', '/api/peek?path=' + encodeURIComponent(path.join(gam, 'resource', 'entity', 'v', 'a.def')) + '&line=2');
    ok(r.status === 200 && r.j.entry === 'entity/v/a.def' && /entity\.pak$/.test(r.j.pak) && r.j.lines.some(l => l.n === 2 && /weapon "zz"/.test(l.text)), 'peek: file:line inside a pak', r.text);
    ok((await req(A.port, 'GET', '/api/peek?path=' + encodeURIComponent(path.join(gam, 'resource', 'entity', 'v', 'none.def')))).status >= 400, 'peek: missing pak entry is an error');
    fs.writeFileSync(path.join(gam, 'resource', 'gamelogic.pak'), require('../../lib/zipwrite').zip([['set/pather.set', Buffer.from('{a}\r\n{"snow" 0.8}\r\n'), true]]));
    r = await req(A.port, 'GET', '/api/peek?path=' + encodeURIComponent(path.join(gam, 'resource', 'set', 'pather.set')) + '&line=2');
    ok(r.status === 200 && r.j.entry === 'set/pather.set' && /gamelogic\.pak$/.test(r.j.pak) && r.j.lines.some(l => l.n === 2 && /snow/.test(l.text)), 'peek: set/ found in a pak not named after it (RobZ gamelogic.pak)', r.text);
    ok((await req(A.port, 'GET', '/api/mods?dir=relative')).status === 400, 'mods: relative path refused');
    ok((await req(A.port, 'GET', '/api/mods?dir=' + encodeURIComponent(path.join(S, 'nope')))).status === 404, 'mods: missing folder 404');
    r = await req(A.port, 'GET', '/api/ls?dir=' + encodeURIComponent(root) + '&files=1');
    ok(r.j.entries.map(e => e.name).join() === 'alpha,beta,plain' && r.j.entries[0].isMod && !r.j.entries[2].isMod && r.j.parent === path.dirname(root), 'ls: folders sorted, mods marked, parent given', r.text);
    r = await req(A.port, 'GET', '/api/ls'); ok(r.j.dir === null && r.j.roots.some(x => x.name === 'working dir') && r.j.roots.some(x => x.name === 'home'), 'ls without dir: roots (home, working dir, drives) from the machine, none fixed');
    r = await req(A.port, 'GET', '/api/ls?files=1&dir=' + encodeURIComponent(specDir)); ok(r.j.files.join() === 'a.yaml,b.exe', 'ls files=1 lists files');
    r = await req(A.port, 'GET', '/api/text?path=' + encodeURIComponent(path.join(specDir, 'a.yaml'))); ok(r.j.text === 'name: x\n', 'text: reads a spec');
    ok((await req(A.port, 'GET', '/api/text?path=' + encodeURIComponent(path.join(specDir, 'b.exe')))).status === 400, 'text: other extensions refused');
    r = await req(A.port, 'POST', '/api/spec', { name: 'my-spec', text: 'x: 1\n' });
    ok(r.status === 200 && r.j.path.startsWith(path.join(S, 'as2gui-specs')) && fs.readFileSync(r.j.path, 'utf8') === 'x: 1\n', 'spec: saved under the temp root, not a path the page picks', r.text);
    for (const bad of [{ name: '../evil', text: 'x' }, { name: 'a b', text: 'x' }, { name: 'ok', text: 5 }]) ok((await req(A.port, 'POST', '/api/spec', bad)).status === 400, 'spec: refused ' + JSON.stringify(bad));
    ok((await req(A.port, 'POST', '/api/answer', { id: 'nope', answer: {} })).status === 404, 'answer: unknown job 404');
    ok((await req(A.port, 'GET', '/api/jobs')).j.jobs.length === 0, 'jobs: empty when idle');

    // ===== 4. cancel, timeout, disconnect, 409 lock, answers (GUI-1 rows). Children are sleepers that print their pid.
    mode = 'sleep';
    const pidOf = ev => { const l = ev.find(e => e.t === 'out' && /^pid \d+$/.test(e.line)); return l ? Number(l.line.slice(4)) : 0; };
    let s1 = streamRun(A.port, 'check', { mod: root, fast: true });
    await waitFor(() => pidOf(s1.events), 'sleeper pid (cancel test)');
    const pid1 = pidOf(s1.events), id1 = s1.events[0].id;
    ok(alive(pid1), 'cancel: child is running');
    const jl = (await req(A.port, 'GET', '/api/jobs')).j.jobs; ok(jl.length === 1 && jl[0].id === id1 && jl[0].cmd === 'check', 'jobs: lists the running job', JSON.stringify(jl));
    r = await req(A.port, 'POST', '/api/answer', { id: id1, answer: { a: 1 } }); ok(r.status === 400, 'answer: a non-interactive job takes none');
    const tc = Date.now(); r = await req(A.port, 'POST', '/api/cancel', { id: id1 }); ok(r.status === 200, 'cancel: 200');
    let e1 = endOf(await s1.done);
    ok(e1 && e1.cancelled === true && e1.timedOut === undefined && Date.now() - tc < 60000, 'cancel: end event says cancelled, quickly (under 60 s; the sleeper never ends by itself)', JSON.stringify(e1));
    await waitFor(() => !alive(pid1), 'cancelled child gone'); ok(!alive(pid1), 'cancel: the child process is dead');
    ok((await req(A.port, 'POST', '/api/cancel', { id: id1 })).status === 404, 'cancel: finished job 404');
    ok((await req(A.port, 'GET', '/api/jobs')).j.jobs.length === 0, 'jobs: empty after cancel');

    let s2 = streamRun(A.port, 'check', { mod: root, fast: true }, 1);
    const t0 = Date.now(); const e2 = endOf(await s2.done); const pid2 = pidOf(s2.events);
    ok(e2 && e2.timedOut === true && !e2.cancelled && Date.now() - t0 < 60000, 'timeout: 1 s limit stops the run and says timedOut (well before 60 s; the sleeper never ends by itself)', JSON.stringify(e2));
    ok(pid2 > 0 && s2.events.some(ev => ev.t === 'err' && /timed out after 1 s/.test(ev.line)), 'timeout: stderr line tells why');
    await waitFor(() => !alive(pid2), 'timed-out child gone'); ok(!alive(pid2), 'timeout: the child process is dead');
    r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod: root, fast: true }, timeoutSec: 1 });
    ok(r.status === 200 && r.j.timedOut === true, 'timeout: buffered reply carries timedOut');
    // check has no time limit unless the request names one (contract noTimeout); the start event says which limit the run has
    const lim = s => (s.events.find(ev => ev.t === 'start') || {}).limitSec;
    ok(lim(s1) === 0, 'check: no time limit by default (start event limitSec 0)', String(lim(s1)));
    ok(lim(s2) === 1, 'check: a limit named in the request is kept', String(lim(s2)));

    let s3 = streamRun(A.port, 'check', { mod: root, fast: true });
    await waitFor(() => pidOf(s3.events), 'sleeper pid (disconnect test)'); const pid3 = pidOf(s3.events);
    s3.abort(); await waitFor(() => !alive(pid3), 'child gone after client left', 10000);
    ok(!alive(pid3), 'disconnect: closing the connection kills the child');
    await W.until(async () => (await req(A.port, 'GET', '/api/jobs')).j.jobs.length === 0, { who: 'test-gui2', what: 'jobs empty after disconnect', step: 25 });
    ok((await req(A.port, 'GET', '/api/jobs')).j.jobs.length === 0, 'jobs: empty after disconnect');

    // 409 lock on B (launching allowed): a held edrun blocks prove, not check; released after cancel
    const hold = streamRun(B.port, 'edrun', { pairs: path.join(S, 'p.json'), out: path.join(S, 'ed-out') });
    await waitFor(() => pidOf(hold.events), 'held launching run'); const pidH = pidOf(hold.events);
    ok(last().launches === true, 'lock: the held run counts as a launch (hook saw launches true)');
    r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus' } });
    ok(r.status === 409 && /one game at a time/.test(r.j.error), '409: second launching run refused while one is active', r.text);
    r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'edrun', input: { pairs: path.join(S, 'p.json'), out: path.join(S, 'ed-out2') } });
    ok(r.status === 409, '409: same for edrun');
    mode = 'echo'; r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'check', input: { mod: root, fast: true } });
    ok(r.status === 200 && r.j.code === 0, 'lock: a run that does not start the game is still allowed');
    r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus', plan: true } });
    ok(r.status === 200, 'lock: prove --plan is not a launch, allowed meanwhile');
    await req(B.port, 'POST', '/api/cancel', { id: hold.events[0].id }); await hold.done; await waitFor(() => !alive(pidH), 'held child gone');
    mode = 'echo'; r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus' } });
    ok(r.status === 200 && r.j.code === 0, 'lock: released after cancel, next launching run goes', r.text);
    mode = 'sleep'; const h2 = streamRun(B.port, 'edrun', { pairs: path.join(S, 'p.json'), out: path.join(S, 'ed-out3'), dry: false });
    await waitFor(() => pidOf(h2.events), 'second held run'); const pidH2 = pidOf(h2.events);
    h2.abort(); await waitFor(() => !alive(pidH2), 'second held child gone', 10000);
    await W.until(async () => (await req(B.port, 'GET', '/api/jobs')).j.jobs.length === 0, { who: 'test-gui2', what: 'the launch lock released after the client left', step: 25 }); mode = 'echo';
    r = await req(B.port, 'POST', '/api/run?stream=0', { cmd: 'prove', input: { game: S, unit: 'u', army: 'rus' } });
    ok(r.status === 200, 'lock: released when the client disconnects too', r.text);
    mode = 'echo';

    // ===== 5. the page under node, server A: how it calls the back end
    const P = loadPage(A.port, { 'as2gui.roots': JSON.stringify([root]), 'as2gui.screen': JSON.stringify('mods') });
    P.run(pg.text); P.html = pg.text;
    const doc = P.doc, St0 = () => P.ctx.__as2gui;
    await waitFor(() => P.ctx.__as2gui && allSecs(doc).length === CORE.length + EXTN && secs(doc).length === CORE.length, 'page built ' + CORE.length + ' core screens + ext screens');
    await waitFor(() => doc.getElementById('main').querySelector('tbody') && doc.getElementById('main').querySelector('tbody').children.length === 2, 'mod list rows');
    for (const u of ['/api/health', '/api/settings', '/api/game']) ok(P.urls.some(x => x.url.startsWith(u) && x.status === 200), 'page fetched ' + u);
    // game parity: api() sends the page's game with every request (GET and POST); under AS64 no GoH folder header
    ok(P.urls.filter(x => x.url.startsWith('/api/mods') || x.url.startsWith('/api/game')).every(x => x.headers['x-arsenal-game'] === 'as64' && !('x-arsenal-goh' in x.headers)), 'api(): x-arsenal-game as64 on the page\'s GET calls, no x-arsenal-goh', JSON.stringify(P.urls.slice(0, 4).map(x => x.headers)));
    ok(P.urls.some(x => x.url === '/api/mods?dir=' + encodeURIComponent(root) && x.status === 200), 'page asked /api/mods for the saved folder', P.urls.map(x => x.status + ' ' + x.url).join(' | '));
    ok(P.urls.every(x => x.status < 400 || x.status === 0), 'every page request so far answered < 400', JSON.stringify(P.urls.filter(x => x.status >= 400)));
    { const g64 = GAMES.find(g => g.id === 'as64');
      ok(GDEF === 'as64' && curG(doc) === 'as64' && navIds(doc) === tabsOn(doc, g64).map(t => t.id).join(), 'as64 is the default game; its ' + tabsOn(doc, g64).length + ' tabs in groups.js order', navIds(doc));
      ok(allSecs(doc).every(sc => ALLP.includes(sc.dataset.id)) && ALLP.filter(p => !hasSec(doc, p)).every(p => NOPAGE.includes(p)), 'every page (' + CORE.length + ' core + ' + EXTN + ' ext) is in some game\'s table; the ids without a page are only ' + NOPAGE.join(), ALLP.filter(p => !hasSec(doc, p)).join() + ' / ' + allSecs(doc).filter(sc => !ALLP.includes(sc.dataset.id)).map(sc => sc.dataset.id).join());
      ok(navIds(doc) === 'help,mods,ide,models,maps,bots,units,share,tools' && doc.getElementById('nav').children.map(tabText).join() === 'Help & Docs,Mods,IDE,Models & Sim,Maps & Missions,Game Modes & AI,Units & Balance,Test, Share & Play,Tools & Settings', 'as64: the nine tabs by their labels', doc.getElementById('nav').children.map(tabText).join()); }
    // Mods tab: two sub-tabs (Mods, Check & Fix); the Mods sub-tab holds Mods and Upgrade or Port (Mod Files is Advanced) in the third row
    ok(subIds(doc) === 'mods,check' && doc.getElementById('subnav').hidden === false && doc.getElementById('pagenav').hidden === false && items(doc) === 'mods,upgrade' && doc.getElementById('pagenav').children.map(b => b.textContent).join() === 'Mods,Upgrade or Port' && doc.getElementById('nav').children.some(b => b.dataset.id === 'ide' && tabText(b) === 'IDE'), 'Mods tab: sub-tabs Mods and Check & Fix, third row Mods and Upgrade or Port; the IDE has its own tab', subIds(doc) + ' / ' + items(doc));
    ok(doc.getElementById('gameinfo').has('game') && doc.getElementById('runoff').textContent !== '', 'game line drawn (Settings card) and the game runs chip in the header');
    const sc = id => allSecs(doc).find(x => x.dataset.id === id);   // a section by its page id
    const rows = [...sc('mods').querySelector('tbody').children];
    ok(rows.some(x => x.has('Тест мод')) && rows.some(x => x.has('Alpha mod')), 'mod list shows both names incl. cp1251 one');
    // keyboard: filter, then choose with the list
    rows.find(x => x.has('Alpha mod')).click();
    await waitFor(() => doc.getElementById('modchip').title === path.join(root, 'alpha') && doc.getElementById('modchip').textContent.endsWith('alpha'), 'modchip shows chosen mod');
    ok(P.store.get('as2gui.mod') === JSON.stringify(path.join(root, 'alpha')), 'chosen mod remembered');
    await waitFor(() => sc('mods').has('2 files'), 'mod details shown'); ok(sc('mods').has('first test mod'), 'details: description');
    {   // W5 Make split: the New Mod card (ARSENAL new) sits on Mods under as64, folded while the list has mods; the info Make button opens it here
      const ms = sc('mods'), nf = ms.all().find(e => e.dataset && e.dataset.blk === 'new.fold'), nwc = cardOf(ms, EN['nw.title']);
      ok(nf && nf.tagName === 'DETAILS' && nf.hidden === false && nf.open === false && nwc && nf.all().includes(nwc) && !cardOf(sc('make'), EN['nw.title']), 'Mods (as64): the New Mod card sits folded under the list, not on the Generator');
      ms.byText(EN['mods.goBuild'], 'button').click();
      ok(St0().cur === 'mods' && nf.open === true, 'Mods: the mod info Make button opens the New Mod card on this page'); nf.open = false; }
    altKey(doc, 'check'); ok(sc('check').hidden === false && sc('mods').hidden === true, 'the Check & Fix sub-tab opens Check');
    {   // GUI-TABS: tab > sub-tab > item. The third row picks the item, Alt+N on the open tab steps through its sub-tabs, tab and sub-tab remember their item
      const sn = doc.getElementById('subnav'), pn = doc.getElementById('pagenav'), logs = allSecs(doc).find(s => s.dataset.id === 'logs'), nb = navOf(doc, 'check'), n = tabIn('as64', 'check').key;
      ok(tabText(nb) === 'Mods' && nb === navOf(doc, 'logs') && nb.attrs['aria-selected'] === 'true' && subOf(doc, 'check').attrs['aria-selected'] === 'true', 'Check and Read Game.log sit in the Mods tab under Check & Fix', tabText(nb));
      ok(pn.hidden === false && pn.children.map(b => b.textContent).join() === 'Check,Read Game.log' && items(doc) === 'check,logs' && /<div id=pagenav role=tablist hidden><\/div>\s*<\/header>/.test(P.html), 'third row above the page: Check, Read Game.log', pn.textContent);
      itemOf(doc, 'logs').click(); ok(logs.hidden === false && sc('check').hidden === true && itemOf(doc, 'logs').attrs['aria-selected'] === 'true' && subOf(doc, 'check').attrs['aria-selected'] === 'true' && nb.attrs['aria-selected'] === 'true', 'the item opens Read Game.log; tab and sub-tab stay selected');
      ok(P.store.get('as2gui.sub.mods') === JSON.stringify('logs') && P.store.get('as2gui.sub.mods-check') === JSON.stringify('logs') && P.store.get('as2gui.screen') === JSON.stringify('logs'), 'the tab and the sub-tab remember their item (sub.mods, sub.mods-check)');
      doc.key(n, { altKey: true }); ok(sc('mods').hidden === false && logs.hidden === true && subOf(doc, 'mods').attrs['aria-selected'] === 'true', 'Alt+N on the open tab steps to its next sub-tab (Mods)');
      doc.key(n, { altKey: true }); ok(logs.hidden === false && subOf(doc, 'check').attrs['aria-selected'] === 'true', 'and round again: Check & Fix opens the item last used in it');
      altKey(doc, 'ide'); ok(sn.hidden === true && sn.children.length === 0 && pn.hidden === true && pn.children.length === 0 && allSecs(doc).find(s => s.dataset.id === 'ide').hidden === false, 'a tab with one sub-tab of one item on show shows neither the sub-tab row nor the third row');
      nb.click(); ok(logs.hidden === false, 'a click on the tab opens the item last used in it');
      altKey(doc, 'check'); ok(sc('check').hidden === false, 'back on Check');
    }
    const chk = cardOf(sc('check'), 'Check a mod (static, nothing is run)');
    ok(field(chk, 'mod').value === path.join(root, 'alpha'), 'Check: mod field prefilled from the chosen mod');
    ok(field(chk, 'fast').checked === true, 'Check: quick check ticked by default');

    // check runs: argv from the page
    mode = 'json';
    sample = { mod: root, read: { as64: { files: 3, paks: 0, mounted: true } }, verdicts: { as64: { verdict: 'LOADS_STATIC', text: 'no crash class found' } }, findings: [{ tool: 'keylint', code: 'KEY_X', n: 3, sev: 'crash', samples: ['a.def', { file: 'resource/entity/b.def', line: 7, msg: 'bad key', path: path.join(root, 'alpha', 'resource', 'x.set') }] }, { tool: 'milint', code: 'MIL_Y', n: 2, sev: 'review' }], errors: [] };
    const c0 = calls.length;
    chk.querySelector('button[data-primary]').click();
    ok(doc.getElementById('cancel').hidden === false, 'run state: Cancel button shown while running');
    await waitFor(() => statOf(chk).startsWith('exit'), 'check finished');
    ok(calls.length === c0 + 1 && last().cmd === 'check' && last().args.includes(path.join(root, 'alpha')) && last().args.includes('--fast') && last().args.includes('--json') && !last().args.includes('--game'), 'Check click -> POST run with mod, --fast, --json, no game path invented', JSON.stringify(last()));
    ok(statOf(chk).startsWith('exit 0'), 'Check: exit shown', statOf(chk));
    ok(chk.has('5 findings') && chk.has('KEY_X') && chk.has('MIL_Y') && chk.has('LOADS_STATIC') && chk.has('a.def'), 'Check: result view shows verdict, counts, codes, examples');
    ok(chk.has('b.def:7'), 'Check: object sample shown as file:line (GUI-LOC)');
    ok(doc.getElementById('cancel').hidden === true, 'run state: Cancel hidden again');
    const filt = chk.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === 'filter findings'); filt.value = 'zzz'; filt.fire('input');
    ok(!chk.has('KEY_X') && chk.has('no match'), 'Check: filter hides rows');
    filt.value = 'mil'; filt.fire('input'); ok(chk.has('MIL_Y') && !chk.has('KEY_X'), 'Check: filter by code');
    // missing required field is caught in the page, no request
    const fixc = cardOf(sc('check'), 'Fix: plan, then apply into a patch mod');
    // I-18: out is needed for apply only (plan writes nothing)
    const c1 = calls.length; P.confirms.length = 0; fixc.byText('fix: apply', 'button').click(); await W.until(() => /^Fill in first: /.test(statOf(fixc)), { who: 'test-gui2', what: 'Fix apply: the missing field line', step: 10 });
    ok(calls.length === c1 && P.confirms.length === 0 && /^Fill in first: /.test(statOf(fixc)), 'Fix apply: missing out folder caught before any request or confirm', statOf(fixc));
    // the game is a folder of its own: out inside the game folder is refused by the write guard (I-3)
    const fixGame = path.join(S, 'fixgame'); fs.mkdirSync(fixGame, { recursive: true });
    field(fixc, 'out').value = path.join(S, 'patch-out'); field(fixc, 'game').value = fixGame; mode = 'json'; sample = { actions: [{ fixer: 'lng', n: 2 }] };
    fixc.byText('fix: plan', 'button').click();
    ok(fixc.byText('fix: plan', 'button').disabled && fixc.byText('fix: apply', 'button').disabled, 'I-30: card buttons disabled while its run goes');
    await waitFor(() => statOf(fixc).startsWith('exit'), 'fix plan done');
    ok(!fixc.byText('fix: plan', 'button').disabled && !fixc.byText('fix: apply', 'button').disabled, 'I-30: card buttons enabled again after the run');
    ok(last().cmd === 'fix' && last().args.slice(1, 3).join() === path.join(root, 'alpha') + ',plan' && last().args.includes('--out') && last().args.includes('--game'), 'Fix plan argv: mod, plan, --out, --game', JSON.stringify(last()));
    ok(fixc.has('Fix result') && fixc.has('fixer'), 'Fix: result tree shown');
    const rtab = fixc.all().find(e => e.tagName === 'TABLE' && e.attrs['data-key'] === 'actions');
    ok(rtab && rtab.has('fixer') && rtab.has('lng') && fixc.has('actions (1)'), 'Fix: array of rows shown as a table above the tree (GUI-2 table view)');
    P.confirms.length = 0; mode = 'echo';
    fixc.byText('fix: apply', 'button').click(); await waitFor(() => statOf(fixc).startsWith('exit'), 'fix apply done');
    ok(P.confirms.length === 1 && last().args[2] === 'apply', 'Fix apply: asks first, then sends apply', JSON.stringify(last()));

    // Upgrade or Port (W5 Make split: its own page in Mods > Mods): the easy card on show, every upgrade setting (upadv) only with Advanced
    altKey(doc, 'upgrade'); const upS = sc('upgrade'), upadv = upS.all().find(e => e.dataset && e.dataset.blk === 'upadv'), up = cardOf(upS, 'Port to another target (upgrade)');
    ok(St0().cur === 'upgrade' && upS.hidden === false && upS.querySelector('h2').textContent === 'Upgrade or Port' && cardOf(upS, EN['ub.title']) && cardOf(upS, EN['ub.title']).hidden === false && itemOf(doc, 'upgrade').attrs['aria-selected'] === 'true', 'Upgrade or Port: its own page in Mods > Mods, the easy card on show');
    ok(upadv && up && upadv.all().includes(up) && upadv.classList.contains('adv') && !upadv.classList.contains('advkeep') && !doc.body.classList.contains('advon') && !cardOf(sc('make'), 'Port to another target (upgrade)'), 'Upgrade or Port: every upgrade setting sits in a fold hidden while Advanced is off (as64)');
    { const um = cardOf(upS, EN['ub.title']).all().find(e => e.dataset && e.dataset.blk === 'ub.more');
      ok(um && um.textContent === EN['ub.more'] && um.classList.contains('advoff') && /body\.advon \.advoff\{display:none\}/.test(P.html), 'Upgrade or Port: a line under the easy card says more settings come with Advanced (Tools & Settings > Settings); it hides while Advanced is on', um && um.textContent); }
    altKey(doc, 'play');   // lazy pages: a page follows the mod when it is shown, not while hidden
    const ins = cardOf(sc('play'), 'Install into the game'); mode = 'echo';
    ins.byText('install: dry run', 'button').click(); await waitFor(() => statOf(ins).startsWith('exit'), 'install dry');
    ok(last().cmd === 'install' && last().args.includes('install') && last().args.includes('--dry'), 'Install dry run sends --dry');
    P.confirms.length = 0; ins.byText('install', 'button').click(); await waitFor(() => P.confirms.length === 1, 'install confirm'); await waitFor(() => doc.getElementById('cancel').hidden, 'install done');
    ok(!last().args.includes('--dry') && last().args.includes('install'), 'Install proper sends no --dry', JSON.stringify(last()));

    // T-GUI: Advanced switch. Default: Expert Tools and Mod Files are hidden; ticking shows them and is remembered. Translate and GoH unit are GoH's (W5)
    // Advanced lives on the Settings page (Tools & Settings > Settings). Off: Expert Tools and Mod Files are not on show; it never adds or hides a tab.
    // Test Run is not behind it any more: it is the first sub-tab of Test, Share & Play (Test Plan where built, then the Test Run page)
    const advIn = doc.getElementById('advbox').querySelector('input'), chip = doc.getElementById('advchip'), tabs0 = visTabs(doc);
    ok(advIn && advIn.checked === false && chip.hidden === true && !doc.body.classList.contains('advon') && !doc.getElementById('hdr').all().some(e => e.attrs && (e.attrs.id === 'advbox' || e.attrs.id === 'arrbox')), 'Advanced off by default: switch on Settings (not in the header), no chip', chip.hidden);
    altKey(doc, 'make'); ok(St0().cur === 'make' && doc.getElementById('pagenav').hidden === true && !itemOf(doc, 'pro'), 'Advanced off: Tools & Settings > Other Tools shows the Generator only (Expert Tools is Advanced)', items(doc));
    const tItems = ['testplan', 'test'].filter(p => hasSec(doc, p)), t7 = tItems[0];
    altKey(doc, 'test'); ok(St0().cur === 'test' && sc('test').hidden === false && subIds(doc) === 'test,share,play' && subOf(doc, 'test').attrs['aria-selected'] === 'true' && (tItems.length > 1 ? items(doc) === tItems.join() : doc.getElementById('pagenav').hidden === true),
      'Advanced off: Test, Share & Play > Test Run shows the Test Run page (sub-tabs Test Run, Share, Play)', St0().cur + ' ' + subIds(doc) + ' ' + items(doc));
    altKey(doc, 'play'); ok(St0().cur === 'play' && sc('play').hidden === false && !itemOf(doc, 'test') && doc.getElementById('pagenav').hidden === true, 'Advanced off: the Play sub-tab holds Play only (Test Run is not under it)', items(doc));
    // the guided fix goes on to Test Run without Advanced: step 7 opens the Test Plan page where it is built, else the Test Run page
    altKey(doc, 'check'); St0().wz.upd(); { const nb = sc('check').querySelector('button[data-wznext]');
      ok(nb && nb.hidden === false && nb.textContent === EN['wz.toTest'] && nb.attrs.title === EN['wz.toTestT'] && nb.dataset.go === t7, 'Advanced off (AS64): guided fix step 7 offers Go to Test Run', nb && nb.textContent + ' go=' + nb.dataset.go);
      nb.click(); ok(St0().cur === t7 && sc(t7).hidden === false && subOf(doc, 'test').attrs['aria-selected'] === 'true', 'Advanced off: the step 7 button opens ' + t7 + ' under the Test Run sub-tab', St0().cur); }
    altKey(doc, 'models'); ok(items(doc) === 'models,art' && doc.getElementById('pagenav').children.map(b => b.textContent).join().includes('Look & Sound'), 'Models & Sim holds Models and Look & Sound', items(doc));
    ok(!navOf(doc, 'xlate') && !navOf(doc, 'goh') && !doc.getElementById('pagenav').children.some(b => ['goh', 'xlate'].includes(pgOf(b.dataset.id))) && !hasSec(doc, 'xlate'), 'as64: the GoH unit page (with Translate numbers) is not shown, not even greyed; no Translate page');
    // turning it on asks first; No keeps it off
    P.confirms.length = 0; P.ctx.confirm = m => { P.confirms.push(m); return false; };
    advIn.checked = true; advIn.fire('change');
    ok(P.confirms.length === 1 && P.confirms[0].includes(EN['adv.warnT']) && P.confirms[0].includes(EN['adv.warn2']) && P.store.get('as2gui.adv') !== 'true' && advIn.checked === false && chip.hidden === true, 'Advanced: turning it on asks first with what it can do; No keeps it off', P.confirms.join(' / '));
    P.ctx.confirm = m => { P.confirms.push(m); return true; };
    advIn.checked = true; advIn.fire('change');
    ok(P.confirms.length === 2 && P.store.get('as2gui.adv') === 'true' && advIn.checked === true && doc.body.classList.contains('advon'), 'Advanced: Yes turns it on, the choice is remembered, body gets advon');
    ok(chip.hidden === false && chip.textContent === EN['adv.chip'] && chip.title === EN['adv.chipT'], 'Advanced on: the header chip shows it', chip.textContent);
    ok(visTabs(doc) === tabs0, 'Advanced on: the same tabs as off (it never adds a tab)', visTabs(doc) + ' vs ' + tabs0);
    altKey(doc, 'make'); ok(items(doc) === 'make,pro' && doc.getElementById('pagenav').children.map(b => b.textContent).join() === 'Generator,Expert Tools', 'Advanced on: Other Tools holds Generator and Expert Tools', items(doc));
    altKey(doc, 'mods'); ok(items(doc) === 'mods,upgrade,files', 'Advanced on: the Mods sub-tab holds Mods, Upgrade or Port and Mod Files', items(doc));
    // upgrade, every setting (the upadv fold shows now that Advanced is on)
    altKey(doc, 'upgrade'); ok(doc.body.classList.contains('advon') && upadv.classList.contains('adv'), 'Upgrade or Port: Advanced on shows every upgrade setting');
    let c2 = calls.length; up.byText('upgrade: plan', 'button').click(); await W.until(() => /^Fill in first: /.test(statOf(up)), { who: 'test-gui2', what: 'Upgrade: the missing target line', step: 10 });
    ok(calls.length === c2 && /^Fill in first: /.test(statOf(up)), 'Upgrade: upgrade needs a target, caught in the page');
    field(up, 'to').value = 'as64'; mode = 'json'; sample = { rows: [] };
    up.byText('upgrade: plan', 'button').click(); await waitFor(() => statOf(up).startsWith('exit'), 'upgrade preview');
    ok(last().cmd === 'upgrade' && last().args.includes('--plan') && last().args.includes('--to') && last().args[last().args.indexOf('--to') + 1] === 'as64', 'Upgrade: Preview sends --plan --to as64', JSON.stringify(last()));
    P.confirms.length = 0;
    up.byText('upgrade: write', 'button').click(); await waitFor(() => P.confirms.length === 1 && statOf(up).startsWith('exit') && calls[calls.length - 1].cmd === 'upgrade' && !last().args.includes('--plan'), 'upgrade write');
    ok(!last().args.includes('--plan'), 'Upgrade: Write sends no --plan although the box is ticked (plan:false overrides)'); mode = 'echo';
    altKey(doc, 'play'); ok(subIds(doc) === 'test,share,play' && !itemOf(doc, 'test') && doc.getElementById('pagenav').hidden === true, 'Advanced on: the same sub-tabs Test Run, Share, Play; Play still holds Play only (Advanced adds nothing to this tab)', subIds(doc) + ' ' + items(doc));
    altKey(doc, 'test'); ok(St0().cur === 'test' && (tItems.length > 1 ? items(doc) === tItems.join() : doc.getElementById('pagenav').hidden === true), 'Advanced on: the Test Run sub-tab holds the same items as with Advanced off', items(doc)); altKey(doc, 'play');
    chip.click(); ok(St0().cur === 'settings', 'the chip opens Settings'); altKey(doc, 'play');
    // test run (A cannot launch)
    altKey(doc, 'test'); const ed = cardOf(sc('test'), 'Test run in the editor build (pairs file)');
    const real = ed.byText('Run in game', 'button'); ok(real.disabled === true, 'Test: Run in game is disabled when the server has no --allow-launch');
    const c3 = calls.length; real.click(); await sleep(30); ok(calls.length === c3, 'Test: a click on the disabled button sends nothing');
    field(ed, 'pairs').value = path.join(S, 'pairs.json'); field(ed, 'out').value = path.join(S, 'ed-dry');
    mode = 'json'; sample = { n: 1 };   // edrun reads out/report.json itself; the hook writes nothing for it
    ed.byText('Dry run (no game)', 'button').click(); await waitFor(() => statOf(ed).startsWith('exit'), 'edrun dry');
    ok(last().cmd === 'edrun' && last().launches === false && last().args.includes('--dry') && last().args.includes('--pairs'), 'Test: dry run sends --dry, is not a launch', JSON.stringify(last()));
    ok(!last().args.includes('--game'), 'Test: no game path invented for the dry run');
    const pr = cardOf(sc('test'), 'Prove one unit (plan only here)'); field(pr, 'game').value = S; field(pr, 'army').value = 'rus'; field(pr, 'unit').value = 't34_0'; mode = 'echo';
    pr.byText('Plan', 'button').click(); await waitFor(() => statOf(pr).startsWith('exit'), 'prove plan');
    ok(last().cmd === 'prove' && last().args.includes('--plan') && last().launches === false, 'Test: prove Plan sends --plan');
    const inst = field(pr, 'inst'); ok(inst === null || inst.attrs.min === '1', 'Test: instance box has min 1');

    // translate: demo mock behind the hook (the real goh2as2 has no question flags yet)
    // W5: Translate numbers is a fold in step 3 of the GoH unit page (GoH game, Units & Balance, Alt+7; no Advanced needed); the shell passes keys to it
    await toGame(doc, 'goh'); altKey(doc, 'goh'); const tr = cardOf(sc('goh'), 'Translate GoH units'), trf = sc('goh').all().find(e => e.dataset && e.dataset.blk === 's3.xlate');
    // where the GoH unit page sits comes from groups.js: the sub-tab row shows when its tab has two or more sub-tabs, the third row when its sub-tab holds two or more pages
    { const L = locIn('goh', 'goh'), subs = L ? L.t.subs.length : 0, its = L ? L.s.pages.filter(r => hasSec(doc, pgOf(r))).map(String).join() : '';
      ok(sc('goh').hidden === false && navOf(doc, 'goh').attrs['aria-selected'] === 'true' && tabText(navOf(doc, 'goh')) === 'Units & Balance' && navOf(doc, 'goh').attrs['aria-keyshortcuts'] === 'Alt+7' && doc.getElementById('subnav').hidden === (subs < 2) && doc.getElementById('pagenav').hidden === (its.split(',').length < 2) && items(doc) === (its.split(',').length < 2 ? '' : its), 'GoH: the Units & Balance tab (Alt+7) reaches the GoH unit page where groups.js puts it (no Advanced needed)', items(doc)); }
    ok(tr && trf && trf.tagName === 'DETAILS' && trf.all().includes(tr) && !tr.querySelector('button[data-primary]'), 'GoH unit page: Translate numbers is a fold holding the translate card (its buttons leave Ctrl+Enter to the page)');
    for (const [n, v] of [['goh', S], ['out', path.join(S, 'tr-out')]]) { field(tr, n).value = v; field(tr, n).fire('input'); }   // typed: kept over what the steps fill in
    field(tr, 'entity').value = 'gaz67b\npz4h';
    const c4 = calls.length; tr.byText('Translate', 'button').click();
    await waitFor(() => tr.querySelector('.q-panel'), 'first question');
    ok(last().cmd === 'translate' && last().args.includes('--ask-json') && last().args.filter(a => a === '--entity').length === 2 && calls.length === c4 + 1, 'Translate: argv has --ask-json and each entity', JSON.stringify(last()));
    const qp = tr.querySelector('.q-panel');
    ok(qp.has('gaz67b') && qp.has('speed') && qp.has('car') && qp.has('scale'), 'Translate: question panel shows unit, key, class, stage');
    ok(qp.has('GoH value') && qp.has('42') && qp.has('6 .. 22') && qp.has('5th to 95th percentile') && qp.has('Donor') && qp.has('14'), 'Translate: each value is shown with what it means (goh 42, range 6 .. 22, donor 14)');
    ok(qp.has('1. AS2 scale: 20') && qp.has('2. Translated: 42') && qp.has('3. Donor: 14') && qp.has('(default)'), 'Translate: the three choices numbered, scale is the default');
    ok(!/assumed/i.test(pg.text.slice(pg.text.indexOf('function xlateCard'))) && !/ASSUMED/.test(JSON.stringify(contract.commands || contract)), 'Translate: the word ASSUMED is gone from the screen and the contract');
    doc.key('r'); ok(doc.getElementById('xrest').checked === true, 'Translate: R toggles "rest of the class"');
    const a0 = P.urls.length; doc.key('1');
    await waitFor(() => tr.querySelector('.q-panel') && tr.querySelector('.q-panel').has('pz4h'), 'third question after the class answer');
    const ans = P.urls.slice(a0).find(x => x.url === '/api/answer');
    ok(ans && ans.status === 200 && ans.body.answer.id === 'gaz67b:speed' && ans.body.answer.choice === 'scale' && ans.body.answer.rest === true && !('xlate' in ans.body.answer) && Object.keys(ans.body.answer).sort().join() === 'choice,id,rest', 'Translate: key 1 posted {id, choice, rest:true} and nothing else', JSON.stringify(ans));
    ok(tr.has('sdkfz251:speed: scale by the class answer'), 'Translate: the tool applied the class answer to the second car (no question shown)');
    ok(tr.querySelector('.q-panel').has('engine') && tr.querySelector('.q-panel').has('not a number, negative, or zero'), 'Translate: an engine-stage question says why');
    doc.activeElement = doc.body; doc.key('Enter');
    await waitFor(() => statOf(tr).startsWith('exit'), 'translate finished');
    ok(statOf(tr).startsWith('exit 0') && tr.has('pz4h:turn_time: scale') && tr.has('"xlate":"summary"') && !tr.querySelector('.q-panel'), 'Translate: Enter took the default, run ended, panel gone', statOf(tr));
    const c5 = calls.length; tr.byText('Translate, never ask', 'button').click(); await waitFor(() => statOf(tr).startsWith('exit') && calls.length === c5 + 1 && doc.getElementById('cancel').hidden, 'translate no-ask');
    ok(last().args.includes('--no-ask') && !last().args.includes('--ask-json') && !tr.querySelector('.q-panel'), 'Translate never ask: --no-ask, no question');
    await shellChecks(P, A.port, root);
    // ===== game parity (wave 1, GUI client): game headers, gq, naCard, the New Mod card and the core pages under MoW:AS2 and GoH
    {
      const C = P.ctx.__as2in, gohS = path.join(S, 'gohfake'); fs.mkdirSync(gohS, { recursive: true });
      const argAfter = (a, f) => { const i = a.indexOf(f); return i < 0 ? undefined : a[i + 1]; };
      // gq: ?gid=<id> (and goh=<dir> under GoH), ? or & as needed, a #hash kept at the end
      await toGame(doc, 'as64');
      ok(C.gq('/api/x/a') === '/api/x/a?gid=as64' && C.gq('/api/x/a?b=1') === '/api/x/a?b=1&gid=as64' && C.gq('/x?') === '/x?gid=as64' && C.gq('/x#h') === '/x?gid=as64#h', 'gq under AS64: gid only, ? or &', [C.gq('/api/x/a'), C.gq('/api/x/a?b=1'), C.gq('/x?'), C.gq('/x#h')].join(' '));
      // naCard: a made-up na entry for AS64 (Upgrade or Port); the page keeps its place, its screen is not shown, the line says why
      const g64 = C.GAMES.find(g => g.id === 'as64');
      g64.na = { upgrade: 'game.notSet' }; C.buildNav(); altKey(doc, 'mods');
      ok(items(doc).split(',').includes('upgrade') && !C.INGAME.upgrade && C.NA.upgrade === 'game.notSet' && C.gameFor('upgrade') === 'mowas2', 'na: the page keeps its item in the third row; not in INGAME, in NA; gameFor skips the game where it is na', items(doc) + ' ' + C.gameFor('upgrade'));
      itemOf(doc, 'upgrade').click(); const nab = doc.getElementById('nabox');
      ok(St0().cur === 'upgrade' && curG(doc) === 'as64' && sc('upgrade').hidden === true && sc('mods').hidden === true && nab.hidden === false && nab.textContent === 'Not available in AS64: ' + EN['game.notSet'] && itemOf(doc, 'upgrade').attrs['aria-selected'] === 'true', 'na: the item opens the na card in place of the page (no game switch)', nab.textContent);
      C.show('upgrade'); ok(curG(doc) === 'as64' && nab.hidden === false, 'na: show() of an na page stays in the game');
      ok(C.naCard('mods.wGoh').textContent === 'Not available in AS64: GoH' && C.naCard('mods.wGoh').classList.contains('card'), 'naCard(key): one card with the line "Not available in <game>: <reason>"');
      itemOf(doc, 'mods').click(); ok(nab.hidden === true && nab.children.length === 0 && sc('mods').hidden === false, 'na: another page hides the na box again');
      delete g64.na.upgrade; C.buildNav(); altKey(doc, 'upgrade'); ok(C.INGAME.upgrade && sc('upgrade').hidden === false && nab.hidden === true, 'na: without the entry the page is back');
      // the New Mod card under AS64: the old argv (no --target)
      altKey(doc, 'mods'); const ms = sc('mods'), nwc = cardOf(ms, EN['nw.title']), nf = ms.all().find(e => e.dataset && e.dataset.blk === 'new.fold'), ng = nwc.all().find(e => e.dataset && e.dataset.nwgame);
      mode = 'echo'; field(nwc, 'dir').value = path.join(S, 'np_as64'); let cn = calls.length; nwc.byText(EN['nw.dry'], 'button').click(); await waitFor(() => statOf(nwc).startsWith('exit') && calls.length === cn + 1, 'new dry as64');
      ok(last().cmd === 'new' && last().args.includes('--dry-run') && !last().args.includes('--target') && !last().args.includes('--game') && ng.hidden === true, 'New Mod (AS64): ARSENAL new <dir> --dry-run as before, no target line', JSON.stringify(last().args));
      // MoW:AS2: the card is there, says the game, sends --target mowas2; headers say mowas2
      await toGame(doc, 'mowas2'); altKey(doc, 'mods');
      ok(nf.hidden === false && ng.hidden === false && ng.textContent === EN['nw.forG'].replace(/\{g\}/g, 'MoW:AS2').replace('{t}', 'mowas2'), 'New Mod (MoW:AS2): the card sits under the list with a line naming the game', ng.textContent);
      field(nwc, 'dir').value = path.join(S, 'np_mow'); cn = calls.length; const u0 = P.urls.length; nwc.byText(EN['nw.dry'], 'button').click(); await waitFor(() => statOf(nwc).startsWith('exit') && calls.length === cn + 1, 'new dry mowas2');
      ok(last().cmd === 'new' && argAfter(last().args, '--target') === 'mowas2' && last().args.includes('--dry-run') && !last().args.includes('--game'), 'New Mod (MoW:AS2): --target mowas2', JSON.stringify(last().args));
      ok(P.urls.slice(u0).some(x => x.url === '/api/run' && x.method === 'POST' && x.headers['x-arsenal-game'] === 'mowas2' && x.headers['content-type'] === 'application/json'), 'the run POST carries x-arsenal-game mowas2 next to its content type');
      ok(C.gq('/a') === '/a?gid=mowas2', 'gq under MoW:AS2');
      // Test Run under MoW:AS2 (its page is AS64's for now: the cards run from the current game): edrun gets the MoW:AS2 editor, prove the MoW:AS2 game (argv only)
      { const ed = cardOf(sc('test'), 'Test run in the editor build (pairs file)'), pr = cardOf(sc('test'), 'Prove one unit (plan only here)');
        field(ed, 'pairs').value = path.join(S, 'pairs.json'); field(ed, 'out').value = path.join(S, 'ed-dry2'); mode = 'json'; sample = { n: 1 };
        cn = calls.length; ed.byText('Dry run (no game)', 'button').click(); await waitFor(() => statOf(ed).startsWith('exit') && calls.length === cn + 1, 'edrun dry mowas2');
        ok(last().cmd === 'edrun' && argAfter(last().args, '--exe') === 'mowas_2_ed.exe' && last().args.includes('--dry') && last().launches === false, 'Test Run (MoW:AS2): edrun --exe mowas_2_ed.exe, dry', JSON.stringify(last().args));
        field(pr, 'game').value = S; field(pr, 'army').value = 'rus'; field(pr, 'unit').value = 't34_0'; mode = 'echo';
        cn = calls.length; pr.byText('Plan', 'button').click(); await waitFor(() => statOf(pr).startsWith('exit') && calls.length === cn + 1, 'prove plan mowas2');
        ok(last().cmd === 'prove' && argAfter(last().args, '--exe') === path.join(S, 'mowas_2.exe') && last().args.includes('--plan') && last().launches === false, 'Test Run (MoW:AS2): prove --exe <game>/mowas_2.exe, plan', JSON.stringify(last().args)); }
      // GoH: headers carry the GoH folder; the New Mod card sends --target goh and the GoH folder as --game, the GoH name rule stops a bad name in the page
      const gohWas = C.GS.goh.dir; C.GS.goh.dir = gohS; await toGame(doc, 'goh');
      ok(C.gq('/a?b=1') === '/a?b=1&gid=goh&goh=' + encodeURIComponent(gohS), 'gq under GoH: gid and the encoded GoH folder', C.gq('/a?b=1'));
      const u1 = P.urls.length; await C.api('/api/health'); const hr = P.urls.slice(u1).find(x => x.url === '/api/health');
      ok(hr && hr.method === 'GET' && hr.headers['x-arsenal-game'] === 'goh' && hr.headers['x-arsenal-goh'] === encodeURIComponent(gohS), 'api() under GoH: x-arsenal-game goh and x-arsenal-goh = the encoded GoH folder', JSON.stringify(hr && hr.headers));
      const ac = new AbortController(), u2 = P.urls.length; await C.api('/api/health', undefined, { signal: ac.signal }); ok(P.urls.slice(u2).some(x => x.url === '/api/health' && x.headers['x-arsenal-game'] === 'goh'), 'api() keeps the headers when a signal is passed');
      altKey(doc, 'mods');
      ok(nf.hidden === false && ng.textContent === EN['nw.forGoh'].replace(/\{g\}/g, 'GoH').replace('{t}', 'goh'), 'New Mod (GoH): the card is there with the GoH line (name rule)', ng.textContent);
      const dirIn = field(nwc, 'dir'); dirIn.value = path.join(S, 'my-goh mod'); dirIn.fire('input'); const pv = nwc.all().find(e => e.dataset && e.dataset.preview);
      ok(pv.textContent === EN['nw.badGoh'] && pv.className === 'err', 'New Mod (GoH): a "-" in the folder name is refused in the preview', pv.textContent);
      cn = calls.length; nwc.byText(EN['nw.dry'], 'button').click(); await sleep(60);
      ok(calls.length === cn && statOf(nwc) === '' && nwc.has(EN['nw.badGoh']), 'New Mod (GoH): the run stops in the page on a bad GoH folder name', statOf(nwc));
      dirIn.value = path.join(S, 'my goh mod'); dirIn.fire('input'); ok(pv.className === 'ok' && pv.textContent.includes('my_goh_mod'), 'New Mod (GoH): spaces still become _', pv.textContent);
      nwc.byText(EN['nw.dry'], 'button').click(); await waitFor(() => statOf(nwc).startsWith('exit') && calls.length === cn + 1, 'new dry goh');
      ok(last().cmd === 'new' && argAfter(last().args, '--target') === 'goh' && argAfter(last().args, '--game') === gohS, 'New Mod (GoH): --target goh --game <GoH folder>', JSON.stringify(last().args));
      // Generator under GoH: --goh <GoH folder>; Upgrade full card: goh filled, donor and gohVersion on show (AS64: hidden)
      altKey(doc, 'make'); { const mk = sc('make'), bl = l => mk.all().find(e => e.attrs && e.attrs['aria-label'] === l);
        bl('parent folder').value = S; bl('mod folder name').value = 'gen_goh'; mk.all().find(e => e.tagName === 'TEXTAREA').value = 'name: gen goh\nops: []\n';
        cn = calls.length; mk.byText('gen: plan', 'button').click(); await waitFor(() => calls.length === cn + 1 && doc.getElementById('cancel').hidden, 'gen plan goh');
        ok(last().cmd === 'gen' && argAfter(last().args, '--goh') === gohS && argAfter(last().args, '--target') === 'goh', 'Generator (GoH): --target goh --goh <GoH folder>', JSON.stringify(last().args)); }
      altKey(doc, 'upgrade'); { const up = cardOf(sc('upgrade'), 'Port to another target (upgrade)');
        ok(field(up, 'goh').value === gohS && field(up, 'to').value === 'goh' && field(up, 'donor').parentNode.hidden === false && field(up, 'gohVersion').parentNode.hidden === false, 'Upgrade (GoH): goh from the header folder, to goh, donor and gohVersion on show');
        await toGame(doc, 'as64'); altKey(doc, 'upgrade');
        ok(field(up, 'goh').value === '' && field(up, 'donor').parentNode.hidden === true && field(up, 'gohVersion').parentNode.hidden === true, 'Upgrade (AS64): no goh filled, donor and gohVersion hidden'); }
      // ===== game parity (wave 3, shell): na pages from groups.js, the cards that cannot run under a game say why, GoH fix, GoH mod roots
      {
        const EXTEN = Object.assign({}, ...require('../ext').map(x => (x.lang && x.lang.en) || {})), why = k => EN[k] || EXTEN[k];
        const naOf = (el, k) => el.all().find(e => e.dataset && e.dataset.na === k), btn = (el, t) => el.all().find(e => e.tagName === 'BUTTON' && e.textContent === t);
        const rowOf = (el, n) => el.all().find(e => e.tagName === 'LABEL' && e.dataset.f === n), tpOf = () => sc('play').all().find(e => e.dataset && e.dataset.card === 'testprofile');
        // every na entry of groups.js: the page keeps its tab, shows the plain line with its reason key, never switches game; the other pages run
        for (const g of GAMES) { await toGame(doc, g.id);
          const na = g.na || {}, listed = [...new Set(g.tabs.flatMap(t => t.pages))].filter(p => hasSec(doc, p));
          ok(listed.every(p => na[p] ? !C.INGAME[p] && C.NA[p] === na[p] : C.INGAME[p] && !C.NA[p]), g.name + ': INGAME and NA follow groups.js na (' + Object.keys(na).join() + ')', JSON.stringify(C.NA));
          for (const [p, k] of Object.entries(na)) { if (!hasSec(doc, p)) continue; C.show(p); const nb = doc.getElementById('nabox');
            ok(why(k) && curG(doc) === g.id && St0().cur === p && sc(p).hidden === true && nb.hidden === false && nb.textContent === 'Not available in ' + g.name + ': ' + why(k), g.name + ': ' + p + ' shows "Not available in ' + g.name + '" with ' + k, nb.textContent); } }
        // Unit pairs (Test Run): the picker's routes are stubbed in front of the server (tools/testplan/README.md, GUI routes; the real ones
        // belong to the testplan page). gone = route names that answer 404 here
        const PPS = (() => { const real = P.ctx.fetch, sent = [], gone = new Set(['lib']), lib = new Map(), mt = new Map();
          const UN = [{ id: 't34_0', name: 'T-34', army: 'rus', kind: 'tank', buyable: true }, { id: 't34_85', name: 'T-34', army: 'rus', kind: 'tank', names: { ru: 'Т-34-85' } }, { id: 'gaz67b', name: 'GAZ-67', army: 'rus', kind: 'car' }, { id: 'pz4h', name: 'Pz.Kpfw. IV', army: 'ger', kind: 'tank' }];
          const nm = id => { const u = UN.find(x => x.id === id); return u ? u.name + ' (' + id + ')' : id; };
          const pid = p => 'P-' + require('crypto').createHash('sha1').update([p.shooter, p.foe, p.dist, !!p.foeFire, !!p.watch].join('|')).digest('hex').slice(0, 5).toUpperCase();
          const file = n => path.join(S, 'pp-state', 'pairs', n + '.json');
          const answer = (k, b, get) => {
            if (k === 'index') return { units: UN, armies: ['rus', 'ger'] };
            if (k === 'suggest') { const p = { name: 'fo_' + b.shooter + '__' + (b.foe || 'gaz67b'), shooter: b.shooter, foe: b.foe || 'gaz67b', crew: 'mp/rus/tankman', dist: 300, watch: true }; p.id = pid(p); return p; }
            if (k === 'describe') return { pairs: b.pairs.map(p => ({ id: pid(p), name: p.name, text: nm(p.shooter) + ' fires at ' + nm(p.foe) + ' from ' + p.dist / 20 + ' m', dist: p.dist })) };
            if (k === 'check') return { pairs: b.pairs.map(p => ({ id: pid(p), status: p.foe === 'pz4h' ? 'NOAMMO' : 'OK', notes: p.foe === 'pz4h' ? ['no ammunition'] : [], warns: [] })) };
            if (get) return { dir: path.join(S, 'pp-state', 'pairs'), files: [...lib].map(([name, ps]) => ({ name, path: file(name), count: ps.length, mtimeMs: mt.get(name) || 0 })) };
            if (b.op === 'save') { lib.set(b.name, JSON.parse(JSON.stringify(b.pairs))); return { name: b.name, path: file(b.name) }; }
            if (b.op === 'get') return { name: b.name, path: file(b.name), pairs: lib.get(b.name) || [] };
            if (b.op === 'remove') { lib.delete(b.name); return { ok: true }; }
            return {}; };
          P.ctx.fetch = (u, o) => { const base = String(u).split('?')[0]; if (base !== '/api/x/units/index' && !base.startsWith('/api/x/testplan/pairs/')) return real(u, o);
            const k = base.split('/').pop(), b = o && o.body ? JSON.parse(o.body) : null, get = !o || !o.method || o.method === 'GET', rec = { k, url: String(u), body: b, get, hdr: Object.assign({}, (o && o.headers) || {}) }; sent.push(rec);
            const st = gone.has(k) ? 404 : 200, j = st === 404 ? { error: 'not found' } : answer(k, b, get);
            return Promise.resolve({ ok: st === 200, status: st, headers: { get: () => null }, json: () => Promise.resolve(JSON.parse(JSON.stringify(j))) }); };
          return { sent, gone, lib, mt, file, pid, of: k => sent.filter(x => x.k === k), restore: () => { P.ctx.fetch = real; } }; })();
        // MoW:AS2 Play: only the dry run (no -instance, -control on mowas_2.exe: TST-19), no --inst sent; the test game copy is a plain line
        await toGame(doc, 'mowas2'); C.show('play'); C.show('test'); { const pl = cardOf(sc('play'), EN['pl.title']);   // lazy pages: a hidden page follows the game when it is shown
          ok(btn(pl, EN['pl.go']).hidden === true && rowOf(pl, 'inst').hidden === true && naOf(pl, 'na.play.go.mowas2').textContent === 'Not available in MoW:AS2: ' + EN['na.play.go.mowas2'], 'Play (MoW:AS2): no real run button, no instance field, the TST-19 line', pl.textContent.slice(0, 200));
          ok(tpOf().hidden === true && naOf(sc('play'), 'na.play.tp.mowas2') && naOf(sc('play'), 'na.play.tp.mowas2').parentNode.hidden === false, 'Play (MoW:AS2): the test game copy card is the TST-19 line');
          field(pl, 'mod').value = path.join(root, 'alpha'); field(pl, 'inst').value = '2'; mode = 'echo'; const c0 = calls.length; btn(pl, EN['pl.dry']).click();
          await waitFor(() => calls.length === c0 + 1 && statOf(pl).startsWith('exit'), 'play dry mowas2');
          ok(last().cmd === 'play' && last().args.includes('--dry') && !last().args.includes('--inst') && last().launches === false, 'Play (MoW:AS2): the dry run sends --dry and no --inst', JSON.stringify(last().args));
          // Test Run: the dry run and the plan only, one TST-19 line on each card
          const ed = cardOf(sc('test'), 'Test run in the editor build (pairs file)'), pr = cardOf(sc('test'), 'Prove one unit (plan only here)');
          ok(btn(ed, EN['ed.run']).hidden === true && btn(pr, EN['ed.run']).hidden === true && btn(ed, EN['ed.dry']).hidden !== true && naOf(ed, 'na.test.edrun.mowas2') && naOf(pr, 'na.test.prove.mowas2').textContent === 'Not available in MoW:AS2: ' + EN['na.test.prove.mowas2'], 'Test Run (MoW:AS2): no real run buttons, the dry run and the plan stay, each card says why (TST-19)'); }
        // AS64: all of it as before (no line, buttons and the copy card on show)
        await toGame(doc, 'as64'); C.show('play'); C.show('test'); { const pl = cardOf(sc('play'), EN['pl.title']), ed = cardOf(sc('test'), 'Test run in the editor build (pairs file)');
          ok(btn(pl, EN['pl.go']).hidden !== true && rowOf(pl, 'inst').hidden !== true && !pl.all().some(e => e.dataset && e.dataset.na) && tpOf().hidden !== true && btn(ed, EN['ed.run']).hidden !== true && !ed.all().some(e => e.dataset && e.dataset.na), 'Play and Test Run (AS64): every button and the test game copy as before, no line'); }
        // ----- the unit pair picker (AS64), then the same card under MoW:AS2 and GoH
        { const mod0 = St0().mod; St0().mod = path.join(root, 'alpha'); C.refreshAll(); C.show('test');
          const T = sc('test'), pc = T.all().find(e => e.dataset && e.dataset.card === 'pairs'), ed = cardOf(T, EN['ed.title']), pr = cardOf(T, EN['pv.title']);
          const q = k => pc.all().find(e => e.dataset && e.dataset.pp === k), one = a => pc.all().find(e => e.dataset && e.dataset[a] != null), lines = () => pc.all().filter(e => e.dataset && e.dataset.pair != null);
          const stat = () => one('ppstat'), part = (ln, a) => ln.all().find(e => e.dataset && e.dataset[a] != null), txt = ln => part(ln, 'pptext').textContent, idOf = ln => part(ln, 'ppid').textContent;
          const noRoute = k => EN['pp.noRoute'].replace('{what}', EN['pp.r.' + k]);
          ok(pc && T.children.indexOf(pc) >= 0 && T.children.indexOf(pc) < T.children.indexOf(ed) && T.children.indexOf(ed) < T.children.indexOf(pr) && pc.querySelector('h3').textContent === 'Unit pairs' && pc.hidden !== true, 'Test Run: the Unit pairs card sits above the editor run card and the prove card');
          ok(T.querySelector('h2').textContent === EN['ed.h2'] && T.has(EN['ed.who']) && !/Advanced/.test(EN['ed.who'] + EN['ed.intro']) && /Unit pairs/.test(EN['ed.intro']), 'Test Run: the "who needs this page" text and the editor run intro name the picker, not Advanced');
          // a route that is not built answers 404: one plain line, the rest of the card works
          await waitFor(() => one('ppsaved').dataset.gone === 'lib', 'saved pairs files: 404 line');
          ok(one('ppsaved').textContent === noRoute('lib') && PPS.of('lib').length >= 1 && PPS.of('lib').every(x => x.get && /[?&]mod=/.test(x.url)), 'Unit pairs: the saved files list asks GET pairs/lib?mod= at the first show; a 404 gives the plain line', one('ppsaved').textContent);
          ok(PPS.of('index').length === 0, 'Unit pairs: the unit index is not asked before a box is used', PPS.of('index').length);
          // the two unit boxes: searchKit (history key, Browse, History), the index asked once at the first use
          const sh = q('shooter'), tg = q('target'), flt = q('filter');
          ok([[sh, 'test.pair.shooter'], [tg, 'test.pair.target'], [flt, 'test.pairs.filter']].every(([i, k]) => i && i._sk && i._sk.el.dataset.sk === k && i._sk.browseButton && i._sk.historyButton), 'Unit pairs: Shooter, Target and the filter are searchKit boxes (Browse, History, a history key each)');
          sh.value = 't-34'; sh.fire('input'); await waitFor(() => { sh._sk.flush(); return PPS.of('index').length === 1 && sh._sk.items().filter(x => x.k === 'index').length === 2; }, 'shooter index rows');
          { const rows = sh._sk.items().filter(x => x.k === 'index');
            ok(rows.map(x => x.label).join() === 'T-34,T-34' && rows.map(x => x.value).join() === 't34_0,t34_85' && rows.every(x => /^t34_\w+\s+rus /.test(x.hint) && /tank/i.test(x.hint)), 'Shooter box: two units with one name are told apart by id; each row shows name, id, army and kind', JSON.stringify(rows.map(x => [x.label, x.hint])));
            ok(PPS.of('index')[0].body.mod === path.join(root, 'alpha'), 'Shooter box: the index is asked for the picked mod', JSON.stringify(PPS.of('index')[0].body)); }
          const find = async (inp, text) => { inp.value = text; inp.fire('input'); await sleep(20); await W.until(() => { inp._sk.flush(); return inp._sk.items().some(x => x.k === 'index'); }, { who: 'test-gui2', what: 'index rows for ' + text, step: 10 }); return inp._sk.items().filter(x => x.k === 'index').map(x => x.value).join(); };
          ok(await find(sh, 'ger') === 'pz4h' && await find(sh, 'gaz67b') === 'gaz67b' && await find(sh, 'rus t-34') === 't34_0,t34_85' && await find(sh, 'т-34-85') === 't34_85' && await find(tg, 'gaz') === 'gaz67b' && PPS.of('index').length === 1,
            'unit boxes: an army, an id, a name (also one in another language the index sends) narrow; the index was asked once for both boxes', PPS.of('index').length);
          sh.value = 't34_0'; sh.fire('input'); tg.value = 'gaz67b'; tg.fire('input'); sh._sk.close(); tg._sk.close();
          ok(/^T-34, rus /.test(pc.all().find(e => e.dataset && e.dataset.ppwho === 'shooter').textContent) && /^GAZ-67, rus /.test(pc.all().find(e => e.dataset && e.dataset.ppwho === 'target').textContent), 'unit boxes: an id the index knows is named beside the box (name, army, kind)');
          // Add pair: the route gives the full pair; the line shows identifier, sentence, distance in metres, the two switches, Remove
          ok(lines().length === 0 && one('pplist').textContent === EN['pp.empty'], 'Unit pairs: an empty list says what to do');
          one('ppadd').click(); await waitFor(() => lines().length === 1 && PPS.of('describe').length === 1 && /from 15 m$/.test(txt(lines()[0])), 'pair added');
          { const b = PPS.of('suggest')[0].body, ln = lines()[0], d = part(ln, 'ppdist'), sws = ln.all().filter(e => e.dataset && e.dataset.ppsw);
            ok(Object.keys(b).sort().join() === 'foe,mod,shooter' && b.shooter === 't34_0' && b.foe === 'gaz67b' && b.mod === path.join(root, 'alpha'), 'Add pair: POST pairs/suggest {mod, shooter, foe}', JSON.stringify(b));
            ok(/^P-[0-9A-Z]{5}$/.test(idOf(ln)) && ln.dataset.pair === idOf(ln) && txt(ln) === 'T-34 (t34_0) fires at GAZ-67 (gaz67b) from 15 m', 'pair line: the identifier P-xxxxx and the plain sentence from pairs/describe', idOf(ln) + ' ' + txt(ln));
            ok(d.value === '15' && sws.map(c => c.dataset.ppsw + '=' + c.checked).join() === 'foeFire=false,watch=true' && ln.has(EN['pp.foeFire']) && ln.has(EN['pp.watch']) && part(ln, 'pprm').textContent === EN['pp.remove'], 'pair line: distance in metres (300 map units = 15 m), "the target shoots back" off, "watch for damage" on, Remove', d.value);
            // the distance is typed in metres and kept in map units; the identifier and the sentence follow it
            const id0 = idOf(ln); d.value = '25'; d.fire('change'); await waitFor(() => PPS.of('describe').length === 2 && /from 25 m$/.test(txt(lines()[0])) && idOf(lines()[0]) !== id0, 'distance changed');
            ok(PPS.of('describe')[1].body.pairs[0].dist === 500 && idOf(lines()[0]) !== id0 && idOf(lines()[0]) === PPS.pid(PPS.of('describe')[1].body.pairs[0]), 'pair line: 25 m is sent as 500 map units; the identifier is the new one from the route', idOf(lines()[0])); }
          // the reverse pair: shooter and target swapped (damage in)
          one('pprev').click(); await waitFor(() => lines().length === 2 && PPS.of('describe').length === 3, 'reverse pair');
          { const b = PPS.of('suggest')[1].body; ok(b.shooter === 'gaz67b' && b.foe === 't34_0' && txt(lines()[1]) === 'GAZ-67 (gaz67b) fires at T-34 (t34_0) from 15 m' && idOf(lines()[1]) !== idOf(lines()[0]), 'Add the reverse pair: the target fires at the shooter, a pair with its own identifier', JSON.stringify(b) + ' ' + txt(lines()[1])); }
          { const c = lines()[0].all().find(e => e.dataset && e.dataset.ppsw === 'foeFire'); c.checked = true; c.fire('change'); await waitFor(() => PPS.of('describe').length === 4, 'switch');
            ok(PPS.of('describe')[3].body.pairs.length === 1 && PPS.of('describe')[3].body.pairs[0].foeFire === true && lines()[0].all().find(e => e.dataset && e.dataset.ppsw === 'foeFire').checked === true, 'pair line: "the target shoots back" sets foeFire on that pair'); }
          // the filter over the list: identifier, unit name, unit id
          flt.value = 'gaz-67 (gaz67b) fires'; flt.fire('input');
          ok(lines().length === 1 && /^GAZ-67/.test(txt(lines()[0])) && one('ppcount').textContent === '1 of 2 pairs shown', 'filter: a unit name narrows the list', one('ppcount').textContent);
          { const id2 = idOf(lines()[0]); flt.value = id2.toLowerCase(); flt.fire('input'); ok(lines().length === 1 && idOf(lines()[0]) === id2, 'filter: an identifier finds its pair');
            flt.value = 'nosuch'; flt.fire('input'); ok(lines().length === 0 && one('pplist').textContent === EN['pp.none'], 'filter: no match says so');
            flt.fire('change'); flt.value = ''; flt.fire('input'); ok(lines().length === 2 && one('ppcount').textContent === '2 pairs' && flt._sk.history().includes('nosuch'), 'filter: cleared, both pairs back; the text typed is in the history', flt._sk.history().join()); }
          // Check pairs: status word and note beside each pair, no game
          tg.value = 'pz4h'; tg.fire('input'); one('ppadd').click(); await waitFor(() => lines().length === 3 && PPS.of('describe').length === 5, 'third pair');
          { const c0 = calls.length; one('ppcheck').click(); await waitFor(() => lines().every(l => part(l, 'ppst')), 'pairs checked');
            ok(PPS.of('check').length === 1 && PPS.of('check')[0].body.pairs.length === 3 && lines().map(l => part(l, 'ppst').textContent).join('|') === 'OK|OK|NOAMMO: no ammunition' && part(lines()[2], 'ppst').className === 'err' && part(lines()[0], 'ppst').className === 'ok'
              && stat().textContent === '1 of 3 pairs have a problem. See the note beside each.' && calls.length === c0, 'Check pairs: POST pairs/check, the status word and the note beside each pair, no tool and no game started', lines().map(l => part(l, 'ppst').textContent).join('|')); }
          // pairs/describe gone (404): the plain line, the sentence is built in the page, Remove still works
          PPS.gone.add('describe'); { const d = part(lines()[0], 'ppdist'); d.value = '30'; d.fire('change'); await waitFor(() => stat().dataset.gone === 'describe', 'describe 404');
            ok(stat().textContent === noRoute('describe') && stat().className === 'err' && txt(lines()[0]) === 'T-34 (t34_0) fires at GAZ-67 (gaz67b) from 30 m', 'pairs/describe answers 404: one plain line, the sentence comes from the unit index', stat().textContent + ' | ' + txt(lines()[0]));
            part(lines()[2], 'pprm').click(); ok(lines().length === 2 && !lines().some(l => /pz4h/.test(txt(l))), 'Remove takes the pair off the list (the card stays usable)'); } PPS.gone.delete('describe');
          // Save as: a name is needed; the saved file's path goes into the edrun card, the dry run works at once
          const pairsIn = field(ed, 'pairs'); pairsIn.value = ''; one('ppsave').click();
          ok(stat().textContent === EN['pp.needName'] && PPS.of('lib').every(x => x.get), 'Save as: a name is asked for first, nothing is sent', stat().textContent);
          PPS.gone.delete('lib'); q('name').value = 'guns'; one('ppsave').click(); await waitFor(() => pairsIn.value === PPS.file('guns') && pc.all().some(e => e.dataset && e.dataset.ppfile === 'guns'), 'pairs saved');
          { const sv = PPS.of('lib').find(x => !x.get), row = pc.all().find(e => e.dataset && e.dataset.ppfile === 'guns');
            ok(sv.body.op === 'save' && sv.body.name === 'guns' && sv.body.mod === path.join(root, 'alpha') && sv.body.pairs.length === 2 && sv.body.pairs[0].dist === 600 && sv.body.pairs[0].foeFire === true && sv.body.pairs[0].shooter === 't34_0' && sv.body.pairs[0].crew === 'mp/rus/tankman', 'Save as: POST pairs/lib {op save, name, pairs} with the pairs as edited (map units, switches, the crew the route gave)', JSON.stringify(sv.body).slice(0, 300));
            ok(pairsIn.value === PPS.file('guns') && stat().className === 'ok' && stat().has('guns') && row.has('2 pairs') && part(row, 'ppload') && part(row, 'ppdel'), 'Save as: the edrun card\'s pairs field holds the saved file\'s path; the file is listed with Load and Delete', pairsIn.value);
            field(ed, 'out').value = path.join(S, 'pp-dry'); mode = 'json'; sample = { n: 1 }; const c0 = calls.length; ed.byText(EN['ed.dry'], 'button').click(); await waitFor(() => calls.length === c0 + 1 && statOf(ed).startsWith('exit'), 'edrun dry with the saved pairs');
            ok(last().cmd === 'edrun' && argAfter(last().args, '--pairs') === PPS.file('guns') && last().args.includes('--dry') && last().launches === false, 'Dry run works at once with the saved pairs file', JSON.stringify(last().args)); mode = 'echo'; }
          // Load puts a saved file back into the list; Delete removes the file (asked first)
          lines().slice().forEach(l => part(l, 'pprm').click()); ok(lines().length === 0, 'both pairs removed'); pairsIn.value = '';
          part(pc.all().find(e => e.dataset && e.dataset.ppfile === 'guns'), 'ppload').click(); await waitFor(() => lines().length === 2 && pairsIn.value === PPS.file('guns') && /from 30 m$/.test(txt(lines()[0])), 'pairs loaded');
          ok(q('name').value === 'guns' && PPS.of('lib').some(x => x.body && x.body.op === 'get' && x.body.name === 'guns') && /^P-[0-9A-Z]{5}$/.test(idOf(lines()[0])), 'Load: the saved pairs are back in the list with their identifiers, the pairs field is filled again', txt(lines()[0]));
          { const n0 = P.confirms.length; part(pc.all().find(e => e.dataset && e.dataset.ppfile === 'guns'), 'ppdel').click(); await waitFor(() => one('ppsaved').textContent === EN['pp.noSaved'], 'saved file deleted');
            ok(P.confirms.length === n0 + 1 && PPS.of('lib').some(x => x.body && x.body.op === 'remove' && x.body.name === 'guns') && lines().length === 2, 'Delete: asked first, POST pairs/lib {op remove}; the list above is left alone'); }
          // ----- the pairs file field fills itself and says what file it wants (owner 2026-11-21)
          { const edp = a => ed.all().find(e => e.dataset && e.dataset[a] != null), srcOf = () => edp('pairsrc'), outIn = field(ed, 'out'), st = path.join(S, 'pp-state'), gdir = path.join(st, 'run', 'edrun');
            const SRC = (k, n) => EN['ed.src.' + k].replace('{name}', n || ''), again = async () => { const m = St0().mod; St0().mod = ''; C.refreshAll(); St0().mod = m; C.refreshAll(); };
            ok(EN['fl.pairs'] === 'Unit pairs file' && /\.json/.test(EN['fl.pairsT']) && rowOf(ed, 'pairs').parentNode.parentNode.tagName !== 'DETAILS' && rowOf(ed, 'out').parentNode.parentNode.tagName !== 'DETAILS', 'pairs file field: named as a file, on the card itself (not in the fold), and so is the out folder');
            ok(edp('pairdesc').textContent === EN['ed.pairsDesc'] + ' ' + EN['ed.pairsDir'].replace('{dir}', path.join(st, 'pairs')) && /\.json/.test(EN['ed.pairsDesc']) && /my-pairs\.json/.test(EN['ed.pairsDesc']) && /Unit pairs/.test(EN['ed.pairsDesc']) && /Test Plan/.test(EN['ed.pairsDesc']),
              'pairs file field: the line under it says what file it wants, who makes it, an example name and the folder of the saved files', edp('pairdesc').textContent);
            ok(edp('outdesc').textContent === EN['ed.outDesc'] && /report/.test(EN['ed.outDesc']) && /log/.test(EN['ed.outDesc']), 'out folder: the line under it says the report and the log go there');
            // 4 nothing saved, no game file: empty, with the plain empty line
            await waitFor(() => pairsIn.value === '' && srcOf().dataset.src === 'none', 'pairs field empty');
            ok(srcOf().textContent === EN['ed.src.none'] && pairsIn.dataset.manual !== '1', 'auto fill 4: nothing saved and no game file leaves the field empty and says how to make a pairs file', srcOf().textContent);
            // 3 the game file Test Plan wrote: <state>/run/edrun/g1.json (the first of them)
            fs.mkdirSync(gdir, { recursive: true }); for (const n of ['g2', 'g1', 'g10']) fs.writeFileSync(path.join(gdir, n + '.json'), JSON.stringify([{ name: 'fo_a__b', shooter: 't34_0', foe: 'gaz67b', dist: 300 }], null, 1) + '\n'); fs.writeFileSync(path.join(gdir, 'run-list.md'), '# list\n');
            C.refreshAll(); await waitFor(() => pairsIn.value === path.join(gdir, 'g1.json'), 'pairs field from the plan');
            ok(srcOf().dataset.src === 'plan' && srcOf().textContent === SRC('plan', 'g1.json') && pairsIn.dataset.auto === '1' && pairsIn.dataset.manual !== '1', 'auto fill 3: with no saved pairs the first game file Test Plan wrote is taken, and the line names it', srcOf().textContent);
            ok(outIn.value === path.join(st, 'run', 'test-run') || outIn.value === path.join(S, 'pp-dry'), 'out folder: filled with a folder under the test state of the mod', outIn.value);
            outIn.value = ''; delete outIn.dataset.manual; C.refreshAll(); ok(outIn.value === path.join(st, 'run', 'test-run') && edp('outsrc').textContent === EN['ed.outSrc'], 'out folder: an empty box is filled with <state>/run/test-run and says so', outIn.value);
            // 2 the newest saved pairs file of the mod beats the game file
            PPS.lib.set('old', [{ shooter: 'a', foe: 'b' }]); PPS.mt.set('old', 1000); PPS.lib.set('new', [{ shooter: 'a', foe: 'b' }]); PPS.mt.set('new', 2000); PPS.lib.set('mid', [{ shooter: 'a', foe: 'b' }]); PPS.mt.set('mid', 1500);
            await again(); await waitFor(() => pairsIn.value === PPS.file('new'), 'pairs field from the saved list');
            ok(srcOf().dataset.src === 'lib' && srcOf().textContent === SRC('lib', 'new') && /saved pairs "new"/.test(srcOf().textContent), 'auto fill 2: the newest saved pairs file of the mod is taken before the game file, and the line names it', srcOf().textContent);
            ok(pairsIn._start() === path.join(st, 'pairs'), 'pairs file field: Browse starts in the saved pairs folder of the mod', pairsIn._start());
            // a typed value is never replaced; the picker's file is offered beside it
            pairsIn.value = path.join(S, 'mine.json'); pairsIn.fire('input'); ok(srcOf().dataset.src === 'typed' && srcOf().textContent === EN['ed.src.typed'] && pairsIn.dataset.manual === '1' && pairsIn.dataset.auto == null, 'a typed pairs file: the line says it stays');
            await again(); await waitFor(() => PPS.of('lib').length && srcOf().dataset.src === 'typed', 'typed kept'); ok(pairsIn.value === path.join(S, 'mine.json'), 'a typed pairs file is never replaced by the auto fill', pairsIn.value);
            q('name').value = 'guns2'; one('ppsave').click(); await waitFor(() => srcOf().dataset.src === 'keep', 'saved beside a typed value');
            ok(pairsIn.value === path.join(S, 'mine.json') && srcOf().has('guns2.json') && edp('pairuse'), 'Save as with a typed pairs file: the typed value stays, the saved file is offered', srcOf().textContent);
            edp('pairuse').click(); ok(pairsIn.value === PPS.file('guns2') && srcOf().dataset.src === 'saved' && srcOf().textContent === SRC('saved', 'guns2.json'), '"Use the saved file" puts the saved file in', pairsIn.value);
            // 1 the file the picker just saved beats a newer saved file
            PPS.mt.set('guns2', 500); await again(); await waitFor(() => pairsIn.value === PPS.file('guns2') && srcOf().dataset.src === 'saved', 'saved first');
            ok(pairsIn.value === PPS.file('guns2'), 'auto fill 1: the pairs file just saved by the picker comes first, before a newer saved file', pairsIn.value);
            // a file that is not a pairs file: one plain line at once
            const badF = path.join(st, 'notpairs.json'), bads = () => edp('pairbad'); fs.writeFileSync(badF, JSON.stringify({ unit: 't34_0', army: 'rus' }));
            ok(bads().hidden === true, 'wrong-file line: hidden while the file is fine');
            pairsIn.value = badF; pairsIn.fire('input'); pairsIn.fire('change'); await waitFor(() => bads().hidden === false, 'wrong-file line');
            ok(bads().textContent === EN['ed.pairsBad'].replace('{file}', badF) && /shooter/.test(bads().textContent) && /foe/.test(bads().textContent) && bads().className === 'err', 'a picked file that is not a pairs file: one plain line says so and shows what a pairs file looks like', bads().textContent);
            fs.writeFileSync(badF, JSON.stringify([{ shooter: 't34_0' }])); pairsIn.fire('change'); await waitFor(() => bads().hidden === false, 'wrong-file line (no foe)'); ok(/not a unit pairs file/.test(bads().textContent), 'a list whose entries have no foe is not a pairs file either');
            pairsIn.value = path.join(st, 'readme.txt'); pairsIn.fire('change'); ok(bads().hidden === false && bads().textContent === EN['ed.pairsBad'].replace('{file}', path.join(st, 'readme.txt')), 'a file that is not .json gets the line without asking the server');
            pairsIn.value = path.join(st, 'gone.json'); pairsIn.fire('change'); await waitFor(() => bads().hidden === false && bads().textContent === EN['ed.pairsMissing'].replace('{file}', path.join(st, 'gone.json')), 'missing-file line');
            pairsIn.value = path.join(gdir, 'g1.json'); pairsIn.fire('input'); pairsIn.fire('change'); await new Promise(r => setImmediate(r)); await waitFor(() => bads().hidden === true, 'good file'); await new Promise(r => setTimeout(r, 150));   // a gap: no late line comes back
            await W.until(() => srcOf().dataset.src === 'typed', { who: 'test-gui2', what: 'pairs source typed', step: 10 });
            ok(bads().hidden === true && srcOf().dataset.src === 'typed', 'a real pairs file (a list of shooter and foe) gets no line');
            // leave the field free again for the checks below
            for (const n of ['old', 'new', 'mid', 'guns2']) PPS.lib.delete(n); fs.rmSync(gdir, { recursive: true, force: true }); pairsIn.value = ''; pairsIn.fire('input'); await again(); await waitFor(() => srcOf().dataset.src === 'none' && pairsIn.value === '', 'pairs field free again'); }
          // pairs/suggest gone (404): the plain line; the list, the filter and the rest stay usable
          PPS.gone.add('suggest'); one('ppadd').click(); await waitFor(() => stat().dataset.gone === 'suggest', 'suggest 404');
          ok(stat().textContent === noRoute('suggest') && /404/.test(stat().textContent) && lines().length === 2, 'pairs/suggest answers 404: one plain line, no pair added, the list stays', stat().textContent);
          flt.value = 't34_0) fires'; flt.fire('input'); ok(lines().length === 1, 'with a route missing the filter still works'); flt.value = ''; flt.fire('input'); PPS.gone.delete('suggest');
          // MoW:AS2: the picker is there with a list of its own (a pair names units of one game)
          await toGame(doc, 'mowas2'); C.show('test');
          ok(sc('test').hidden === false && pc.hidden !== true && lines().length === 0 && pc.all().find(e => e.dataset && e.dataset.blk === 'pairs.goh').hidden === true && one('ppadd').hidden !== true, 'Unit pairs (MoW:AS2): the card is on show with its own empty list');
          // GoH: the page is shown (not an na page); the picker works; the editor run card and the prove card say why they cannot run, without buttons
          await toGame(doc, 'goh'); const gm0 = St0().mod; St0().mod = path.join(root, 'alpha'); C.show('test');
          { const btn = (el, t) => el.all().find(e => e.tagName === 'BUTTON' && e.textContent === t), naOf = (el, k) => el.all().find(e => e.dataset && e.dataset.na === k);
            ok(C.INGAME.test === 1 && !C.NA.test && St0().cur === 'test' && sc('test').hidden === false && doc.getElementById('nabox').hidden !== false && !(gOf('goh').na || {}).test, 'Test Run (GoH): the page is shown, it is not a "not available" page');
            ok(naOf(ed, 'na.test.edrun.goh') && naOf(ed, 'na.test.edrun.goh').textContent === 'Not available in GoH: ' + EN['na.test.edrun.goh'] && naOf(pr, 'na.test.prove.goh') && naOf(pr, 'na.test.prove.goh').textContent === 'Not available in GoH: ' + EN['na.test.prove.goh']
              && !naOf(ed, 'na.test.edrun.mowas2') && [btn(ed, EN['ed.dry']), btn(ed, EN['ed.run']), btn(pr, EN['pv.plan']), btn(pr, EN['ed.run'])].every(b => b && b.hidden === true), 'Test Run (GoH): the editor run card and the prove card each say why in one line, their buttons are hidden');
            ok(pc.hidden !== true && pc.all().find(e => e.dataset && e.dataset.blk === 'pairs.goh').hidden === false && pc.has(EN['pp.goh']) && lines().length === 0, 'Unit pairs (GoH): the card is on show, with the line that the saved file is the list for the player');
            const s0 = PPS.of('suggest').length; sh.value = 't34_0'; tg.value = ''; one('ppadd').click(); await waitFor(() => lines().length === 1, 'pair under GoH');
            ok(PPS.of('suggest').length === s0 + 1 && !('foe' in PPS.of('suggest')[s0].body) && /^P-[0-9A-Z]{5}$/.test(idOf(lines()[0])) && /fires at GAZ-67 \(gaz67b\)/.test(txt(lines()[0])), 'Unit pairs (GoH): Add pair works; with no target the route picks one', txt(lines()[0]));
            q('name').value = 'gohlist'; one('ppsave').click(); await waitFor(() => field(ed, 'pairs').value === PPS.file('gohlist'), 'pairs saved under GoH');
            ok(pc.all().some(e => e.dataset && e.dataset.ppfile === 'gohlist'), 'Unit pairs (GoH): Save as keeps the list as a pairs file'); St0().mod = gm0; }
          await toGame(doc, 'as64'); C.show('test');
          ok(lines().length === 2 && pc.all().find(e => e.dataset && e.dataset.blk === 'pairs.goh').hidden === true && ed.byText(EN['ed.dry'], 'button').hidden !== true && pr.byText(EN['pv.plan'], 'button').hidden !== true && !ed.all().some(e => e.dataset && e.dataset.na), 'back under AS64: its own two pairs, the run buttons on show again, no line');
          PPS.restore(); St0().mod = mod0; C.refreshAll(); }
        // GoH: fix --target goh with the GoH folder as --game (fix.js takes it); an output folder inside the GoH install is refused in the page
        fs.mkdirSync(path.join(gohS, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(gohS, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
        const gm = path.join(gohS, 'mods', 'gm'); fs.mkdirSync(gm, { recursive: true }); fs.writeFileSync(path.join(gm, 'mod.info'), '{mod\r\n {name "GoH dev mod"}\r\n {Tags "develop"}\r\n}\r\n');
        C.GS.goh.dir = gohS; C.GS.goh.roots = null; await toGame(doc, 'goh'); St0().mod = gm; altKey(doc, 'check');
        { const fx = cardOf(sc('check'), 'Fix: plan, then apply into a patch mod'); St0().screens.check.refresh();
          ok(fx.hidden === false && field(fx, 'target').value === 'goh' && field(fx, 'game').value === gohS, 'Fix (GoH): the card is on show, --target goh, --game = the GoH folder', field(fx, 'target').value + ' ' + field(fx, 'game').value);
          const c0 = calls.length; btn(fx, EN['fix.plan']).click(); await waitFor(() => calls.length === c0 + 1 && statOf(fx).startsWith('exit'), 'fix plan goh');
          ok(last().cmd === 'fix' && argAfter(last().args, '--target') === 'goh' && argAfter(last().args, '--game') === gohS, 'Fix (GoH): fix --target goh --game <GoH folder>', JSON.stringify(last().args));
          const wo = sc('check').all().find(e => e.tagName === 'INPUT' && e.attrs && e.attrs['aria-label'] === EN['wz.out']);
          if (wo) { delete wo.dataset.manual; St0().wz.upd(); const dv = wo.value.trim(), rel = path.relative(gohS, dv);
            ok(!dv || rel.startsWith('..') || path.isAbsolute(rel), 'Fix (GoH): the default output folder is not inside the GoH install (mod in <GoH>/mods)', dv); }
          // 5ad4d92cc (owner 2026-11-15): one mod folder under <GoH>/mods may be written; elsewhere in the install (or the mods folder itself) still not
          if (wo) { wo.value = path.join(gohS, 'resource', 'gm_fixed'); wo.dataset.manual = '1'; St0().wz.upd(); ok(sc('check').has(EN['wz.outInGoh']), 'Fix (GoH): an output folder inside the GoH install, outside its mods folder, gets the plain line', '');
            wo.value = path.join(gohS, 'mods', 'gm_fixed'); St0().wz.upd(); ok(!sc('check').has(EN['wz.outInGoh']), 'Fix (GoH): a mod folder <GoH>/mods/<name> is accepted (no plain line)', ''); } }
        // GoH Upgrade: the easy card is the plain line; the full card stays
        altKey(doc, 'upgrade'); { const un = naOf(sc('upgrade'), 'na.upgrade.easy.goh'), ec = sc('upgrade').all().find(e => e.dataset && e.dataset.card === 'upgrade-easy');
          ok(un && un.textContent === 'Not available in GoH: ' + EN['na.upgrade.easy.goh'] && ec.hidden === true, 'Upgrade (GoH): the easy card is one plain line pointing at upgrade --to goh', un && un.textContent); }
        // GoH Mods: the default roots come from /api/ls for the GoH folder; a mod's info line names the GoH range (Tags develop = any version)
        { C.GS.goh.roots = null; const u0 = P.urls.length; St0().screens.mods.init(); altKey(doc, 'mods');
          await waitFor(() => P.urls.slice(u0).some(x => x.url === '/api/ls?game=' + encodeURIComponent(gohS)) && (St0().roots || []).includes(path.join(gohS, 'mods')), 'GoH roots from /api/ls');
          ok((St0().roots || []).includes(path.join(gohS, 'mods')), 'Mods (GoH): the roots come from /api/ls with the GoH folder', JSON.stringify(St0().roots));
          const row = await waitFor(() => sc('mods').all().find(e => e.tagName === 'TR' && e.children[1] && e.children[1].textContent === 'gm'), 'GoH mod row');
          if (row) { row.click(); const gv = await waitFor(() => sc('mods').all().find(e => e.dataset && e.dataset.gohver), 'GoH version line');
            ok(gv && gv.textContent.startsWith('GoH version') && gv.textContent.includes('"develop"') && row.children[2].textContent === EN['mods.wGoh'], 'Mods (GoH): Works on GoH, the info line names Tags "develop"', gv && gv.textContent); } }
      }
      C.GS.goh.dir = gohWas; C.GS.goh.roots = null; mode = 'echo';
    }

    // the mock emits exactly the real question line (XLATE-2): keys and types, and takes the real answer line
    const mk = require('child_process').spawnSync(NODE, [path.join(__dirname, 'mock-xlate.js'), '--ask-json'], { encoding: 'utf8', input: '{"id":"gaz67b:speed","choice":"translated","rest":true}\n{"id":"pz4h:turn_time","choice":"donor","rest":false}\n' });
    const ql = mk.stdout.split('\n').filter(l => l.startsWith('{"xlate":"question"')).map(l => JSON.parse(l));
    const KEYS = 'choices,class,default,donor,goh,id,key,range,rest_of_class,scaled,stage,translated,unit,v,xlate';
    ok(ql.length === 2 && ql.every(q => Object.keys(q).sort().join() === KEYS && q.v === 1 && Array.isArray(q.choices) && q.choices.join() === 'scale,translated,donor' && q.rest_of_class === true && q.default === 'scale' && typeof q.range.p5 === 'number' && typeof q.range.p95 === 'number' && q.id === q.unit + ':' + q.key && (q.stage === 'engine' || q.stage === 'scale')), 'mock-xlate: question lines have exactly the real shape (2 asked, 1 by the class answer)', mk.stdout.slice(0, 500));
    ok(/pz4h:turn_time: donor/.test(mk.stdout) && /sdkfz251:speed: translated by the class answer/.test(mk.stdout), 'mock-xlate: reads {id,choice,rest}, rest is kept per class and stage');

    // New mod: Plan passes out (the tool resolves it, writes nothing) and the label does not claim a write
    altKey(doc, 'make'); const nm = sc('make'), byLabel = l => nm.all().find(e => e.attrs && e.attrs['aria-label'] === l);
    byLabel('parent folder').value = S; byLabel('parent folder').oninput && byLabel('parent folder').oninput(); byLabel('mod folder name').value = 'gui_try'; byLabel('mod folder name').oninput && byLabel('mod folder name').oninput();
    nm.all().find(e => e.tagName === 'TEXTAREA').value = 'name: gui try\nops: []\n'; byLabel('target').value = 'as64';   // a real select starts on its first option; the fake one has no value
    ok(nm.has('Plan writes nothing') && nm.has(path.join(S, 'gui_try')), 'New mod: the label says Plan writes nothing and names where Write would go');
    mode = 'echo'; const cn = calls.length; nm.byText('gen: plan', 'button').click(); await waitFor(() => nm.has('plan: exit') || nm.has('not run') || nm.has('empty') || nm.has('Error'), 'new mod plan');
    ok(calls.length === cn + 1 && last().cmd === 'gen' && last().args.includes('--plan') && last().args[last().args.indexOf('--out') + 1] === path.join(S, 'gui_try'), 'New mod: Plan sends --plan and --out <parent>/<name>', JSON.stringify(last()));

    // cancel from the page with Esc
    mode = 'sleep'; altKey(doc, 'check');
    chk.querySelector('button[data-primary]').click();
    await waitFor(() => chk.has('pid '), 'page run started'); const pidP = Number(/pid (\d+)/.exec(chk.textContent)[1]);
    ok(alive(pidP) && doc.getElementById('cancel').hidden === false, 'Esc test: child running, Cancel shown');
    // a button on another screen during that run says why it does nothing (it used to be disabled and silent)
    altKey(doc, 'make'); const cbusy = calls.length, pb = nm.byText('gen: plan', 'button');
    ok(pb.disabled === false, 'busy: run buttons stay clickable (not silently disabled) while another screen runs');
    pb.click(); await W.until(() => /busy: check is still running/.test(doc.getElementById('toast').textContent) && nm.has('busy: check is still running'), { who: 'test-gui2', what: 'the busy line', step: 10 });
    ok(calls.length === cbusy && /busy: check is still running/.test(doc.getElementById('toast').textContent) && nm.has('busy: check is still running'), 'busy: a click on another screen starts nothing and says what is running', doc.getElementById('toast').textContent);
    await toGame(doc, 'goh'); altKey(doc, 'goh'); const trb = sc('goh').byText('Translate', 'button'); doc.getElementById('toast').textContent = ''; trb.click(); await W.until(() => /busy:/.test(doc.getElementById('toast').textContent), { who: 'test-gui2', what: 'the busy line (Translate)', step: 10 });
    ok(calls.length === cbusy && /busy:/.test(doc.getElementById('toast').textContent), 'busy: the Translate button says it too');
    await toGame(doc, 'as64'); altKey(doc, 'check');
    doc.key('Escape'); await waitFor(() => statOf(chk).startsWith('cancelled'), 'page shows cancelled');
    await waitFor(() => !alive(pidP), 'esc: child gone'); ok(!alive(pidP), 'Esc: cancels the run and kills the child');
    // timeout shown by the page is the server's: covered above. 409 as the page shows it, on server B
    mode = 'echo';
    const Pb = loadPage(B.port, { 'as2gui.roots': JSON.stringify([root]), 'as2gui.screen': JSON.stringify('test'), 'as2gui.adv': 'true' });
    Pb.run(pg.text); const dB = Pb.doc;
    await waitFor(() => Pb.ctx.__as2gui && secs(dB).length === CORE.length, 'page B built');
    const edB = cardOf(allSecs(dB).find(x => x.dataset.id === 'test'), 'Test run in the editor build (pairs file)'), realB = edB.byText('Run in game', 'button');
    ok(realB.disabled === false, 'Test: Run in game enabled on a server with --allow-launch');
    field(edB, 'pairs').value = path.join(S, 'pairs.json'); field(edB, 'out').value = path.join(S, 'ed-real');
    Pb.confirms.length = 0; const cb = calls.length; realB.click(); await waitFor(() => statOf(edB).startsWith('exit'), 'edrun real (replaced child)');
    ok(Pb.confirms.length === 1 && /starts the game/.test(Pb.confirms[0]) && last().launches === true && !last().args.includes('--dry') && calls.length === cb + 1, 'Test: Run in game asks first and sends no --dry', JSON.stringify([Pb.confirms, last()]));
    mode = 'sleep'; const hold2 = streamRun(B.port, 'edrun', { pairs: path.join(S, 'p.json'), out: path.join(S, 'ed-out4') });
    await waitFor(() => pidOf(hold2.events), 'held run for the page 409'); const pidH3 = pidOf(hold2.events);
    const prB = cardOf(allSecs(dB).find(x => x.dataset.id === 'test'), 'Prove one unit (plan only here)'); field(prB, 'game').value = S; field(prB, 'army').value = 'rus'; field(prB, 'unit').value = 'u';
    prB.byText('Run in game', 'button').click(); await waitFor(() => statOf(prB) === 'not run', 'page shows the refusal');
    ok(prB.has('busy:') && prB.has('one game at a time'), 'Page shows the 409 message', prB.textContent);
    await req(B.port, 'POST', '/api/cancel', { id: hold2.events[0].id }); await hold2.done; await waitFor(() => !alive(pidH3), 'held gone');
  } finally {
    await A.close(); await B.close();
  }
  console.log(`gui2 test: ${pass} passed, ${failN} failed`);
  process.exitCode = failN ? 1 : 0;
}
main().catch(e => { console.log('gui2 test crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
