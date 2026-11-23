// Lazy pages (tools/gui/page.js refreshAll / show0 / scrInit): a page loads when it is first shown. No server, no browser,
// no game: the page script (page.js with every ext script) runs in the fake DOM with a fake fetch that records every call.
// Checks: at start only the shell and the visible page ask the server (no /api/x/<ext>/ call of a page that was never shown: bots,
// unitai, mapai, ide, files, share, doctrine, missions, help, goh); showing a page calls its refresh once; a mod change refreshes the
// visible page now and marks the others out of date, each gets one refresh when it is next shown; a game change does the same; a
// screen with eager:true is refreshed while hidden; the Bots pages draw nothing before their first show and an Undo button of a
// hidden page does not ask.
// usage: node test-lazy.js [--calls]   (--calls prints the requests of the start)
// Author: Imperator_Aug (ARSENAL, ia-lazy1121)
'use strict';
const path = require('path'), vm = require('vm');
const GUI = path.join(__dirname, '..');
const fakedom = require('./fakedom'), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('ok ' + m); } else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 900) : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));
const GAMEP = 'F:\\Games\\Men of War Assault Squad 2', MODA = GAMEP + '\\mods\\lazy_a', MODB = GAMEP + '\\mods\\lazy_b';
const GOOD = { dir: GAMEP, source: 'steam', ok: true, exes: ['as64.exe', 'mowas_2.exe'], hasMods: true, codes: [] };
const LAZY = ['bots', 'unitai', 'mapai', 'ide', 'files', 'share', 'doctrine', 'missions', 'help', 'goh', 'claude'];
const extOf = p => { const m = /^\/api\/x\/([^/]+)/.exec(p); return m ? m[1] : ''; };

// one page with a clock the test drives and a fetch that answers the shell and leaves the rest waiting. ls = localStorage at start
async function load(ls, ans) {
  const doc = fakedom.make(), store = new Map(Object.entries(ls || {})), timers = []; let now = 0, seq = 0;
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));
  for (const id of ['langbox', 'foot', 'footq']) { const e = doc.createElement('span'); e.setAttribute('id', id); doc.body.appendChild(e); }
  const mk = (x, status) => ({ ok: !status || status < 400, status: status || 200, json: () => Promise.resolve(clone(x)), body: null });
  const resp = (x, status) => Promise.resolve(mk(x, status));
  const P = { doc, calls: [], ans: ans || {} };   // ans: path -> the answer of a page request (default: never answered)
  const w = {
    document: doc, console, TextDecoder, WeakMap, setInterval: () => 0,
    setTimeout: (f, ms) => { const id = ++seq; timers.push({ id, f, at: now + (ms > 0 ? ms : 0) }); return id; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    AS2CFG: {}, scrollY: 0, innerHeight: 800,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => true,
    fetch: (u, op) => {
      const m = (op && op.method) || 'GET', url = new URL(String(u), 'http://127.0.0.1'), p = url.pathname;
      P.calls.push({ m, p, q: url.search, cur: w.__as2gui ? w.__as2gui.cur : '' });
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
      if (p === '/api/game') return resp(url.searchParams.get('kind') === 'goh' ? { codes: ['none'] } : GOOD);
      if (p === '/api/mods') return resp({ mods: [], roots: [] });
      if (p === '/api/jobs') return resp({ jobs: [] });
      if (P.ans[p]) return resp(P.ans[p]);
      return new Promise(() => {});   // a page's own request: never answered, the test only counts it
    },
  };
  w.scrollTo = (x, y) => { w.scrollY = y; };
  const adv = ms => { const end = now + ms; for (let n = 0; n < 5000; n++) { const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); now = Math.max(now, due.at); try { due.f(); } catch (e) { console.log('timer threw: ' + (e && e.stack || e)); } } now = end; };
  const settle = async ms => { for (let i = 0; i < 6; i++) { await tick(); adv(i ? 0 : (ms || 0)); } await tick(); };
  w.window = w; vm.createContext(w);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' });
  w.JOBS.tune({ wait: 1e12 });
  for (let i = 0; i < 800 && !w.__as2gui; i++) { await tick(); adv(20); }
  await settle(3000);
  Object.assign(P, { w, adv, settle, S: w.__as2gui });
  P.show = async id => { w.__as2in.show(id); await settle(400); };
  P.setMod = async p => { w.__as2in.setMod(p); await settle(400); };
  P.all = async () => { w.__as2in.refreshAll(); await settle(400); };
  // the header's game button, as a click
  P.game = async gid => { const b = [].find.call(doc.getElementById('games').querySelectorAll('button'), x => x.getAttribute('data-game') === gid); if (!b) return false; b.click(); await settle(400); return true; };
  P.ext = id => P.calls.filter(c => extOf(c.p) === id);
  // count the refresh() calls of every page from now on
  P.count = {};
  P.spy = () => Object.keys(P.S.screens).forEach(k => { const s = P.S.screens[k]; P.count[k] = 0; if (!s || typeof s.refresh !== 'function' || s._spied) return; const f = s.refresh; s._spied = true; s.refresh = function () { P.count[k]++; return f.apply(this, arguments); }; });
  P.zero = () => Object.keys(P.count).forEach(k => { P.count[k] = 0; });
  return P;
}

(async () => {
  // ---- 1. the start: the mod is known, the start page is Mods; nothing of a page that was never shown ----
  let P = await load({ 'as2gui.mod': JSON.stringify(MODA) });
  if (process.argv.includes('--calls')) P.calls.forEach(c => console.log('  ' + c.m + ' ' + c.p + c.q.slice(0, 80)));
  const S = P.S;
  const START = S.cur;
  ok(!!START && !LAZY.includes(START) || START === 'help', 'the page starts on a page (' + START + ')', START);
  ok(S.mod === MODA, 'the mod of the last visit is the current mod at start', S.mod);
  ok(P.calls.filter(c => c.p === '/api/mod').length === 1, 'start: the mod folder is read once (the Mods card and the check card share the request in flight)', P.calls.filter(c => c.p === '/api/mod').length);
  const has = id => !!S.screens[id];
  ok(LAZY.filter(has).length >= 6 && ['bots', 'ide', 'files', 'share', 'doctrine', 'missions'].every(has), 'the pages under test are built', LAZY.filter(id => !has(id)).join(' '));
  for (const id of LAZY) if (has(id) && id !== START) ok(P.ext(id).length === 0, 'start: no /api/x/' + id + '/ request while ' + id + ' was never shown', P.ext(id).map(c => c.p + c.q).join('\n  '));
  const other = P.calls.filter(c => extOf(c.p) && S.screens[extOf(c.p)] && extOf(c.p) !== S.cur);   // Guides and Expert Tools ask at their first show too
  ok(!P.calls.some(c => c.p === '/api/commands') && Object.keys(S.cmds).length === contract.describe().length && JSON.stringify(Object.keys(S.cmds).map(k => S.cmds[k])) === JSON.stringify(contract.describe()), 'start: the command list is in the page (no /api/commands request) and equals contract.describe()');
  ok(other.length === 0, 'start: no request of any page that is not on screen', other.map(c => c.p + c.q).join('\n  '));
  ok(P.calls.some(c => c.p === '/api/mods' || c.p === '/api/game'), 'start: the shell asked for the game and the mods');
  ok(typeof S.stale === 'object' && LAZY.filter(has).every(id => id === START || S.stale[id] === true), 'start: every page that was not shown is marked out of date', JSON.stringify(S.stale));
  ok(!S.stale[S.cur], 'start: the page on screen is not out of date');

  // ---- 2. showing a page: its refresh runs once, and its own requests are made then ----
  P.spy();
  for (const id of ['files', 'share', 'doctrine', 'missions', 'bots', 'ide']) {
    P.zero(); const n0 = P.ext(id).length;
    await P.show(id);
    ok(S.cur === id, 'show(' + id + ') puts it on screen', S.cur);
    ok(P.count[id] === 1, 'show(' + id + '): its refresh ran once', P.count[id]);
    ok(Object.keys(P.count).every(k => k === id || P.count[k] === 0), 'show(' + id + '): no other page refreshed', JSON.stringify(P.count));
    ok(P.ext(id).length > n0, 'show(' + id + '): the page asked the server now', P.ext(id).length - n0);
    ok(!S.stale[id], 'show(' + id + '): no longer out of date');
    const strange = P.calls.filter(c => extOf(c.p) && LAZY.includes(extOf(c.p)) && has(extOf(c.p)) && c.cur && extOf(c.p) !== c.cur && !(extOf(c.p) === 'bots' && /^(unitai|mapai)$/.test(c.cur)));
    ok(strange.length === 0, 'show(' + id + '): every request of a lazy page was made while that page was on screen', strange.map(c => c.cur + ': ' + c.p).join('\n  '));
  }

  // ---- 3. a mod change: the page on screen now, the others when shown, once ----
  await P.show('share'); P.zero();
  const b0 = P.ext('missions').length, f0 = P.ext('share').length;
  await P.setMod(MODB);
  ok(S.mod === MODB, 'setMod changed the mod');
  ok(P.count.share === 1, 'mod change: the page on screen (share) refreshed now, once', P.count.share);
  ok(P.ext('share').slice(f0).some(c => decodeURIComponent(c.q).includes('lazy_b')), 'mod change: Share asked the server for the new mod');
  ok(Object.keys(P.count).every(k => k === 'share' || P.count[k] === 0), 'mod change: no hidden page refreshed', JSON.stringify(P.count));
  ok(P.ext('missions').length === b0, 'mod change: the hidden Missions page asked nothing');
  ok(S.stale.missions === true && S.stale.bots === true && S.stale.files === true && !S.stale.share, 'mod change: hidden pages are marked out of date, the visible one is not', JSON.stringify(S.stale));
  P.zero(); await P.show('missions');
  ok(P.count.missions === 1, 'mod change: Missions refreshed once when shown', P.count.missions);
  ok(P.ext('missions').slice(b0).some(c => decodeURIComponent(c.q).includes('lazy_b')), 'mod change: Missions asked with the new mod when shown');
  ok(!S.stale.missions, 'mod change: Missions is up to date after the show');
  P.zero(); await P.show('files'); await P.show('share');
  ok(P.count.share === 1 && P.count.files === 1, 'coming back to a page refreshes it once per show (as before)', JSON.stringify([P.count.share, P.count.files]));

  // ---- 4. "refresh every page" from anywhere else, and a game change: the same rule ----
  await P.show('files'); P.zero(); const s1 = P.ext('share').length;
  await P.all();
  ok(P.count.files === 1, 'refreshAll(): the page on screen refreshed now, once', P.count.files);
  ok(Object.keys(P.count).every(k => k === 'files' || P.count[k] === 0), 'refreshAll(): no hidden page refreshed', JSON.stringify(P.count));
  ok(S.stale.share === true && S.stale.doctrine === true, 'refreshAll(): hidden pages are marked out of date');
  ok(P.ext('share').length === s1, 'refreshAll(): the hidden Share page asked nothing');
  P.zero(); await P.show('share');
  ok(P.count.share === 1 && !S.stale.share, 'refreshAll(): Share refreshed once when shown', P.count.share);
  const IN = P.w.__as2in, gidNow = () => { const b = [].find.call(P.doc.getElementById('games').querySelectorAll('button'), x => x.getAttribute('aria-selected') === 'true'); return b ? b.getAttribute('data-game') : ''; };
  const G0 = gidNow(), otherG = IN.GAMES.map(g => g.id).find(g => g !== G0);
  ok(!!otherG, 'there is another game to switch to', IN.GAMES.map(g => g.id).join(' '));
  await P.show('files'); P.spy(); P.zero(); for (const k of Object.keys(S.stale)) S.stale[k] = false;
  const sw = otherG && await P.game(otherG);
  ok(sw && gidNow() === otherG, 'the game button switched the game', gidNow());
  const curG = S.cur;
  ok(P.count[curG] >= 1, 'game change: the page on screen (' + curG + ') refreshed', P.count[curG]);
  const hid = Object.keys(P.count).filter(k => k !== curG && k !== 'files' && P.count[k] > 0);
  ok(hid.length === 0, 'game change: no hidden page refreshed', hid.join(' '));
  const notStale = Object.keys(S.screens).filter(k => k !== curG && S.screens[k].refresh && S.stale[k] !== true);
  ok(notStale.length === 0, 'game change: every hidden page is marked out of date', notStale.join(' '));
  const nxt = ['share', 'doctrine', 'missions', 'bots', 'make', 'check', 'play'].find(k => k !== curG && S.screens[k] && IN.INGAME[k] && !IN.NA[k]);
  if (nxt) { P.zero(); await P.show(nxt); ok(S.cur === nxt && P.count[nxt] === 1 && !S.stale[nxt], 'game change: ' + nxt + ' refreshed once when shown', S.cur + ' ' + P.count[nxt]); }
  else ok(true, 'game change: no second page in this game to show');

  // ---- 5. eager:true keeps a hidden page current ----
  S.screens.doctrine.eager = true; P.zero();
  await P.all();
  ok(S.cur !== 'doctrine' && P.count.doctrine === 1 && !S.stale.doctrine, 'a screen with eager:true is refreshed while hidden', P.count.doctrine);
  delete S.screens.doctrine.eager;
  const eager = Object.keys(S.screens).filter(k => S.screens[k] && S.screens[k].eager);
  ok(eager.length === 0, 'no page of the product is eager', eager.join(' '));

  // ---- 6. the Bots pages: nothing before the first show; an Undo button of a hidden page does not ask ----
  P = await load({ 'as2gui.mod': JSON.stringify(MODA) });
  const undo = () => P.calls.filter(c => c.p === '/api/x/bots/undo' && c.m === 'GET');
  ok(P.ext('bots').length === 0 || P.S.cur === 'bots', 'start: Bots, Unit AI and Map Scripts made no bots request');
  for (const id of ['bots', 'unitai', 'mapai']) if (P.S.screens[id] && P.S.cur !== id) ok(P.S.sec[id].querySelectorAll('[data-cardundo]').length === 0, 'start: ' + id + ' drew no card yet');
  await P.show('bots');
  const u1 = undo();
  ok(u1.length > 0, 'show(bots): its Undo buttons asked the server', u1.length);
  ok(P.S.sec.bots.querySelectorAll('[data-cardundo]').length > 0, 'show(bots): the cards are drawn');
  const rels = [...new Set(u1.map(c => new URLSearchParams(c.q).getAll('rel')).flat())];
  P.w.BOTS_UI.kit.undoSync(rels); await P.settle(400);
  const u2 = undo().length;
  ok(u2 > u1.length, 'on screen: a file change asks the Undo buttons of that file again', u2 - u1.length);
  await P.show('files');
  P.w.BOTS_UI.kit.undoSync(rels); await P.settle(400);
  ok(undo().length === u2, 'hidden: the Undo buttons of the Bots page do not ask', undo().length - u2);
  const b3 = P.ext('bots').length;
  await P.show('bots');
  ok(P.ext('bots').length > b3 && undo().length > u2, 'shown again: the Bots page is drawn again and its Undo buttons ask');
  // the parts of a folded group read at the unfold, each once; the parts of the open group read at the show (as before)
  {
    const grp = () => P.S.sec.bots.querySelectorAll('details').filter(d => /\bbots-grp\b/.test(String(d.className || '')));
    const FOLDED = ['/api/x/bots/recipes/state', '/api/x/bots/modeready/list', '/api/x/bots/botmatch/form'], n0 = P.calls.length;
    const since = () => P.calls.slice(n0).map(c => c.p);
    await P.show('files'); await P.show('bots');
    ok(grp().length === 4 && grp().filter(d => d.open).length === 1, 'show(bots): four groups, the first open', grp().map(d => d.open).join());
    ok(since().includes('/api/x/bots/stages/read') && since().includes('/api/x/bots/table'), 'show(bots): the open group read its data at the show', since().join(' '));
    ok(FOLDED.every(p => !since().includes(p)), 'show(bots): the parts of the folded groups read nothing yet', since().filter(p => FOLDED.includes(p)).join(' '));
    for (const d of grp().filter(x => !x.open)) { d.open = true; d.fire('toggle'); }
    await P.settle(50);
    ok(FOLDED.every(p => since().filter(x => x === p).length === 1), 'unfolding the groups: each held read is sent, once', since().filter(p => FOLDED.includes(p)).join(' '));
    for (const d of grp()) { d.open = false; d.fire('toggle'); d.open = true; d.fire('toggle'); }
    await P.settle(50);
    ok(FOLDED.every(p => since().filter(x => x === p).length === 1), 'folding and unfolding again sends nothing more');
    // an unfolded group is remembered: the next draw of the page reads all of them at the show, as it always did
    const n1 = P.calls.length; await P.show('files'); await P.show('bots');
    ok(FOLDED.every(p => P.calls.slice(n1).filter(c => c.p === p).length === 1), 'groups left open: every part reads at the show', P.calls.slice(n1).map(c => c.p).join(' '));
    // go() to a block inside a folded group unfolds it and sends the held reads
    for (const d of grp().slice(1)) { d.open = false; d.fire('toggle'); }
    const n2 = P.calls.length; await P.show('files'); await P.show('bots');
    ok(FOLDED.every(p => !P.calls.slice(n2).some(c => c.p === p)), 'groups folded again: held again at the next show');
    P.w.BOTS_UI.go('group.f'); await P.settle(50);
    ok(P.calls.slice(n2).some(c => c.p === '/api/x/bots/botmatch/form') && !P.calls.slice(n2).some(c => c.p === '/api/x/bots/recipes/state'), 'go(group.f): its held read is sent, the other folded groups stay held', P.calls.slice(n2).map(c => c.p).join(' '));
  }
  if (P.S.screens.unitai) { const b4 = P.ext('bots').length; await P.show('unitai'); ok(P.ext('bots').length > b4, 'show(unitai): its parts asked the server now'); }

  // ---- 7. Guides and Expert Tools: asked at the first show, once; not again on a plain return ----
  for (const [id, re] of [['guides', '/api/x/guides/status'], ['pro', '/api/x/pro/tools']]) {
    if (!P.S.screens[id]) continue;
    const n = () => P.calls.filter(c => c.p === re).length;
    ok(n() === 0, 'start: ' + id + ' asked nothing while it was built', n());
    await P.show(id); ok(n() === 1, 'show(' + id + '): asked once at the first show', n());
    await P.show('files'); await P.show(id);
    ok(n() === 1, 'show(' + id + ') again: a request still in flight is not sent twice', n());
  }

  // ---- 8. pollLater: a page's poll sends nothing while its page or the window is hidden; one read on return ----
  {
    const W = P.w; let runs = 0; const fn = () => { runs++; };
    await P.show('files');
    W.pollLater('files', fn, 1000); await P.settle(1100);
    ok(runs === 1, 'pollLater: on screen, window seen: runs after the time', runs);
    W.pollLater('files', fn, 1000); await P.show('share'); await P.settle(5000);
    ok(runs === 1, 'pollLater: its page is hidden: does not run', runs);
    await P.show('doctrine'); ok(runs === 1, 'pollLater: another page shown: still parked', runs);
    await P.show('files'); ok(runs === 2, 'pollLater: its page shown again: runs once', runs);
    await P.show('share'); await P.show('files'); ok(runs === 2, 'pollLater: not run twice', runs);
    P.doc.hidden = true; W.pollLater('files', fn, 1000); await P.settle(5000);
    ok(runs === 2, 'pollLater: the window is hidden: does not run', runs);
    const j0 = P.calls.filter(c => c.p === '/api/jobs').length;
    P.doc.hidden = false; P.doc.fire('visibilitychange'); await P.settle(50);
    ok(runs === 3, 'pollLater: the window is seen again: runs once', runs);
    ok(P.calls.filter(c => c.p === '/api/jobs').length > j0, 'the window is seen again: the job list is read at once');
    const hnd = W.pollLater('files', fn, 1000); W.pollStop(hnd); await P.settle(2000);
    ok(runs === 3, 'pollStop: a stopped poll does not run', runs);
    P.doc.hidden = true; const h2 = W.pollLater('files', fn, 1000); await P.settle(2000); W.pollStop(h2); P.doc.hidden = false; P.w.__as2in.show('files'); await P.settle(50);
    ok(runs === 3, 'pollStop: a parked poll that was stopped does not run on return', runs);
  }

  // ---- 9. GoH unit page: a plain return does not ask the status again; a refresh of every page does ----
  if (P.S.screens.goh && P.w.__as2in.gameFor) {
    const gg = P.w.__as2in.gameFor('goh'); if (gg) await P.game(gg);
    const st = () => P.calls.filter(c => c.p === '/api/x/goh/status').length, txt = () => P.S.sec.goh.textContent;
    await P.show('goh');
    if (P.S.cur === 'goh' && !P.w.__as2in.NA.goh) {
      const a = st(); ok(a >= 1, 'show(goh): the status is asked', a);
      await P.show('files'); await P.show('goh');
      ok(st() === a + 1, 'show(goh) again while the first status never came: asked again', st() - a);
      P.ans['/api/x/goh/status'] = { goh: 'E:/Games/GoH', game: GAMEP, ok: true };
      await P.show('files'); await P.show('goh'); const b = st(), t1 = txt();
      ok(b === a + 2, 'show(goh): asked, and this time answered', b - a);
      await P.show('files'); await P.show('goh');
      ok(st() === b, 'show(goh) again, nothing changed: the status is not asked again', st() - b);
      ok(txt() === t1 && t1.length > 0, 'show(goh) again: the page reads the same as after the asked status');
      await P.all(); ok(st() === b + 1, 'refreshAll() with the GoH page on screen: the status is asked', st() - b);
      await P.show('files'); await P.setMod(MODA); await P.show('goh');
      ok(st() === b + 2, 'a mod change while hidden: the status is asked at the next show', st() - b);
      ok(txt() === t1, 'the page reads the same after the asked status');
    } else ok(true, 'goh page not shown in this game');
  }

  console.log(failN ? 'FAIL ' + failN + ' (' + pass + ' ok)' : 'PASS ' + pass);
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
