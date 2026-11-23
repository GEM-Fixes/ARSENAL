// JUMPS, the jump back bar (tools/gui/page.js; tools/gui/README.md "JUMPS"; owner 2026-11-20): a floating bar at the bottom centre that
// shows once a click took the user somewhere else, and walks back through the jumps, newest first. No server, no browser, no game: the
// page script (page.js with every ext script) runs in the fake DOM with a clock the test drives (setTimeout is queued, adv(ms) runs it).
// Checks: hidden at the start; a page change through a button is kept and named; the second jump shows the count 2; two clicks on the bar
// go back to the two places in reverse order and hide it; a same-page scroll jump is kept (window and inner container) and its position
// comes back; the user's wheel, a small move, a log that follows its end and a shortened list are not jumps; the x clears; going back is
// not kept; a game change is a jump; JUMPS.mark / back / clear / size; no two equal in a row; 30 at most; the CSS and the four languages.
// usage: node test-jumps.js
// Author: Imperator_Aug (ARSENAL, ia-jmp1120)
'use strict';
const path = require('path'), vm = require('vm');
const GUI = path.join(__dirname, '..');
const fakedom = require('./fakedom'), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
const LANG = c => require(path.join(GUI, 'lang', c + '.json'));
const ORDER = ['en', 'ru', 'uk', 'zh'];
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('ok ' + m); } else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 600) : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));
const GAMEP = 'F:\\Games\\Men of War Assault Squad 2';
const GOOD = { dir: GAMEP, source: 'steam', ok: true, exes: ['as64.exe', 'mowas_2.exe'], hasMods: true, codes: [] };

// one page with a clock: timers wait in a queue; adv(ms) moves the clock and runs what came due, in order
async function load() {
  const doc = fakedom.make(), store = new Map(), timers = []; let now = 0, seq = 0;
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));
  for (const id of ['langbox', 'foot', 'footq']) { const e = doc.createElement('span'); e.setAttribute('id', id); doc.body.appendChild(e); }
  const resp = x => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(clone(x)), body: null });
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
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
      if (p === '/api/game') return resp(url.searchParams.get('kind') === 'goh' ? { codes: ['none'] } : GOOD);
      if (p === '/api/mods') return resp({ mods: [], roots: [] });
      return new Promise(() => {});
    },
  };
  w.scrollTo = (x, y) => { w.scrollY = y; };
  const adv = ms => { const end = now + ms; for (let n = 0; n < 5000; n++) { const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); now = Math.max(now, due.at); try { due.f(); } catch (e) { console.log('timer threw: ' + (e && e.stack || e)); } } now = end; };
  const settle = async ms => { for (let i = 0; i < 6; i++) { await tick(); adv(i ? 0 : (ms || 0)); } };
  w.window = w; vm.createContext(w);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' });
  // the bar is shared with JOBS (test-jobs.js): the requests this fake server never answers would be listed as jobs and keep the bar up,
  // so here no request is ever old enough to be listed and the bar shows jumps only
  w.JOBS.tune({ wait: 1e12 });
  for (let i = 0; i < 800 && !w.__as2gui; i++) { await tick(); adv(20); }
  await settle(3000);
  doc.documentElement.scrollHeight = 6000;
  const P = { doc, w, adv, settle, S: () => w.__as2gui };
  P.bar = () => doc.getElementById('jmpbar');
  P.shown = () => { const b = P.bar(); return !!b && !b.hidden; };
  P.text = () => { const b = P.bar(), l = b && b.querySelector('.jl'); return l ? l.textContent : ''; };
  P.count = () => { const b = P.bar(), c = b && b.querySelector('.jn'); return c && !c.hidden ? c.textContent : ''; };
  // a user's click as the browser gives it: the capture listeners of the document first, then the element's own
  P.click = el => { doc.fire('mousedown', { target: el }); doc.fire('click', { target: el }); el.click(); };
  // the window (el omitted) or a container moves to y and says so
  P.scroll = (y, el) => { if (el) el.scrollTop = y; else w.scrollY = y; doc.fire('scroll', { target: el || doc.documentElement }); };
  P.tabs = () => doc.getElementById('nav').querySelectorAll('button');
  return P;
}

(async () => {
  const EN = LANG('en');
  const PRE = EN['jmp.to'].replace('{p}', '');

  // ===== 1. page jumps through the tab buttons
  {
    const P = await load(), S = P.S(), d = P.doc;
    ok(!!S && !!S.cur, 'the page built', S && S.cur);
    ok(!P.shown() && !d.body.classList.contains('jmpon'), 'no jump yet: the bar is hidden (not even made) and the page has no extra bottom room');
    ok(P.w.JUMPS && ['mark', 'back', 'clear', 'size'].every(k => typeof P.w.JUMPS[k] === 'function') && P.w.JUMPS.size() === 0, 'window.JUMPS has mark, back, clear, size; size 0 at the start');
    const p0 = S.cur, tabs = P.tabs();
    ok(tabs.length >= 3, 'the tab row has buttons to jump with (' + tabs.length + ')');
    // which tab button leads to which page (found by trying them; then back to the first page with a clean list)
    const lead = []; for (const b of tabs) { P.click(b); await P.settle(0); lead.push(S.cur); }
    const b0 = tabs[lead.indexOf(p0)], b1 = tabs.find((b, i) => lead[i] !== p0), b2 = tabs.find((b, i) => lead[i] !== p0 && lead[i] !== lead[tabs.indexOf(b1)]);
    if (b0) { P.click(b0); await P.settle(0); } P.w.JUMPS.clear();
    ok(b0 && b1 && b2 && S.cur === p0 && !P.shown(), 'three tab buttons lead to three pages; back on the first page with an empty list', lead.join(' '));
    P.click(b1); await P.settle(0);
    const p1 = S.cur;
    ok(b1 && p1 !== p0, 'a tab button changed the page (' + p0 + ' to ' + p1 + ')');
    ok(P.shown() && P.w.JUMPS.size() === 1, 'the page change is a jump: the bar shows', P.w.JUMPS.size());
    const t1 = P.text();
    ok(t1.indexOf(PRE) === 0 && t1.length > PRE.length && !/jmp\./.test(t1), 'the bar says Back to: and names the place left', t1);
    ok(P.count() === '', 'one jump: no count');
    ok(d.body.classList.contains('jmpon'), 'while the bar shows the page gets bottom room (body.jmpon)');
    const back = d.getElementById('jmpback'), x = d.getElementById('jmpx');
    ok(back && back.tagName === 'BUTTON' && back.getAttribute('aria-label') && back.getAttribute('aria-label').indexOf(PRE) === 0, 'the bar is a real button with an aria-label', back && back.getAttribute('aria-label'));
    ok(x && x.tagName === 'BUTTON' && x.getAttribute('aria-label') === EN['jmp.clear'], 'the x is a button named in words');
    // second jump
    P.click(b2); await P.settle(0);
    const p2 = S.cur;
    ok(b2 && p2 !== p1 && p2 !== p0, 'a second tab button changed the page again (' + p2 + ')', p2);
    ok(P.w.JUMPS.size() === 2 && P.count() === '2', 'second jump: the count shows 2', P.count() + ' / ' + P.w.JUMPS.size());
    ok(P.text() !== t1 && P.text().indexOf(PRE) === 0, 'the bar now names the newer place left', P.text());
    ok(back.getAttribute('aria-label').indexOf(EN['jmp.left'].replace('{n}', '2')) > 0, 'the aria-label says how many jumps are left', back.getAttribute('aria-label'));
    // back twice: reverse order
    P.click(P.doc.getElementById('jmpback')); await P.settle(0);
    ok(S.cur === p1, 'first click on the bar: back on the page of the second jump (' + p1 + ')', S.cur);
    ok(P.shown() && P.w.JUMPS.size() === 1 && P.count() === '' && P.text() === t1, 'the bar now shows the older place, no count', P.text());
    P.click(P.doc.getElementById('jmpback')); await P.settle(0);
    ok(S.cur === p0, 'second click: back on the first page (' + p0 + ')', S.cur);
    ok(!P.shown() && P.w.JUMPS.size() === 0 && !d.body.classList.contains('jmpon'), 'the list is empty: the bar hides and the bottom room goes; going back was not kept as a jump');
    await P.settle(3000);
    ok(P.w.JUMPS.size() === 0, 'nothing turns up later either');

    // ===== 2. the x clears
    P.click(b1); await P.settle(0); P.click(b2); await P.settle(0);
    ok(P.w.JUMPS.size() === 2 && P.shown(), 'two jumps again');
    P.click(d.getElementById('jmpx')); await P.settle(0);
    ok(P.w.JUMPS.size() === 0 && !P.shown() && S.cur === p2, 'the x forgets the jumps and hides the bar; the page stays', S.cur);

    // ===== 3. position jumps on the same page
    const sec = d.querySelectorAll('section').find(s => s.dataset.id === S.cur);
    const card = d.createElement('div'), hd = d.createElement('h3'), go = d.createElement('button'); hd.textContent = 'Flag orders'; card.appendChild(hd); card.appendChild(go); sec.appendChild(card);
    P.w.scrollY = 100; P.scroll(100);
    P.click(go); P.scroll(2600); P.adv(100);
    ok(P.w.JUMPS.size() === 0, 'a scroll jump is not judged while the view may still be moving');
    P.adv(200);
    ok(P.w.JUMPS.size() === 1 && P.shown(), 'a click that moved the window by more than half its height is a jump', P.w.JUMPS.size());
    ok(P.text().indexOf('(Flag orders)') > 0, 'the bar names the block the click was in', P.text());
    P.click(d.getElementById('jmpback')); await P.settle(200);
    ok(P.w.scrollY === 100 && !P.shown() && S.cur === p2, 'back: the window is where the click was made (100), same page, bar hidden', P.w.scrollY);
    await P.settle(3000);
    ok(P.w.JUMPS.size() === 0, 'the scroll of going back is not a jump');
    // smooth scroll: many small steps count from the place of the click
    P.click(go); for (let y = 200; y <= 1800; y += 200) { P.scroll(y); P.adv(30); } P.adv(200);
    ok(P.w.JUMPS.size() === 1, 'a smooth scroll in steps is one jump');
    P.w.JUMPS.back(); await P.settle(200);
    ok(P.w.scrollY === 100 && P.w.JUMPS.size() === 0, 'JUMPS.back() goes back the same way', P.w.scrollY);
    // a late jump (the page fetched first) inside 1.5 s
    P.click(go); P.adv(900); P.scroll(3000); P.adv(200);
    ok(P.w.JUMPS.size() === 1, 'a jump that comes 0.9 s after the click (the page fetched first) is still kept');
    P.w.JUMPS.clear(); P.w.scrollY = 100; P.scroll(100);
    ok(P.w.JUMPS.size() === 0 && !P.shown(), 'JUMPS.clear() empties the list');
    // not jumps
    P.click(go); d.fire('wheel', { target: go }); P.scroll(2600); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'the user wheel scrolling after a click is not a jump');
    P.w.scrollY = 100; P.scroll(100);
    P.click(go); d.key('PageDown'); P.scroll(900); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'Page Down after a click is not a jump');
    P.w.scrollY = 100; P.scroll(100);
    P.click(go); d.fire('touchmove', { target: go }); P.scroll(2600); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'a touch drag after a click is not a jump');
    P.w.scrollY = 100; P.scroll(100);
    P.click(go); P.scroll(300); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'a small move (a fold opening, a focus) is not a jump');
    P.w.scrollY = 100; P.scroll(100);
    P.scroll(4000); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'a scroll with no click before it is not a jump');
    P.click(go); d.documentElement.scrollHeight = 2000; P.scroll(1200); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'a page that got shorter and pulled the view up to its end is not a jump');
    d.documentElement.scrollHeight = 6000; P.w.scrollY = 100; P.scroll(100);
    // an inner scroll container
    const box = d.createElement('div'); box.clientHeight = 300; box.scrollHeight = 3000; box.scrollTop = 0; sec.appendChild(box);
    P.click(go); P.scroll(1200, box); P.adv(400);
    ok(P.w.JUMPS.size() === 1, 'a container that jumped (a list scrolled to a row) is a jump');
    P.click(d.getElementById('jmpback')); await P.settle(200);
    ok(box.scrollTop === 0 && P.w.scrollY === 100 && P.w.JUMPS.size() === 0, 'back sets the container where it was', box.scrollTop);
    P.click(go); P.scroll(2700, box); P.adv(2000);
    ok(P.w.JUMPS.size() === 0, 'a log that follows its end after a click is not a jump');
    box.scrollTop = 0; P.scroll(0, box);
    // Enter in a search box (a result picked with the keyboard)
    const inp = d.createElement('input'); sec.appendChild(inp);
    d.key('Enter', { target: inp }); P.scroll(2000); P.adv(400);
    ok(P.w.JUMPS.size() === 1, 'Enter in a box that jumps (a search result) is a jump');
    P.w.JUMPS.clear(); P.w.scrollY = 100; P.scroll(100);

    // ===== 4. JUMPS.mark, no two equal in a row, 30 at most
    P.w.JUMPS.mark('Zone A');
    ok(P.w.JUMPS.size() === 1 && P.text().indexOf('(Zone A)') > 0, 'JUMPS.mark(label) keeps the current place with the label', P.text());
    P.w.JUMPS.mark('Zone A'); P.w.JUMPS.mark();
    ok(P.w.JUMPS.size() === 1, 'the same place twice in a row is kept once');
    P.click(b1); await P.settle(0);
    ok(P.w.JUMPS.size() === 1 && S.cur === p1, 'mark and then the page change it announced: one entry, not two', P.w.JUMPS.size());
    for (let i = 0; i < 40; i++) { P.w.scrollY = 1000 + i * 10; P.w.JUMPS.mark('n' + i); }
    ok(P.w.JUMPS.size() === 30 && P.count() === '30' && P.text().indexOf('(n39)') > 0, 'the list holds 30 places at most, the newest on top', P.w.JUMPS.size() + ' ' + P.text());
    P.w.JUMPS.back(); await P.settle(200);
    ok(P.w.JUMPS.size() === 29 && P.w.scrollY === 1390 && P.text().indexOf('(n38)') > 0, 'back takes the newest (n39, scroll 1390) and shows the next (n38)', P.w.scrollY + ' ' + P.text());
    P.w.JUMPS.clear();
    ok(P.w.JUMPS.back() === false && !P.shown(), 'back on an empty list does nothing');

    // ===== 5. the page not drawn yet: the scroll waits until the page is tall enough
    P.w.scrollY = 2500; P.w.JUMPS.mark(); P.w.scrollY = 0; d.documentElement.scrollHeight = 900;
    P.w.JUMPS.back(); P.adv(100);
    ok(P.w.scrollY === 0, 'back to a place further down than the page is tall yet: it waits');
    d.documentElement.scrollHeight = 6000; P.adv(100);
    ok(P.w.scrollY === 2500, 'the page grew: the scroll lands (2500)', P.w.scrollY);
    P.w.scrollY = 0;

    // ===== 6. a game change is a jump too
    const gb = d.getElementById('games').querySelectorAll('button'), cur = gb.find(b => b.getAttribute('aria-selected') === 'true'), other = gb.find(b => b !== cur);
    ok(gb.length >= 2 && cur && other, 'the header has the game buttons (' + gb.length + ')');
    if (cur && other) {
      const name0 = cur.textContent, pg = S.cur; P.click(other); await P.settle(0);
      const sel = () => { const b = d.getElementById('games').querySelectorAll('button').find(q => q.getAttribute('aria-selected') === 'true'); return b ? b.textContent : ''; };
      ok(sel() !== name0 && P.w.JUMPS.size() === 1, 'another game: one jump kept', sel() + ' ' + P.w.JUMPS.size());
      ok(P.text().indexOf(name0) > 0, 'the bar names the game left', P.text());
      P.click(d.getElementById('jmpback')); await P.settle(0);
      ok(sel() === name0 && S.cur === pg && P.w.JUMPS.size() === 0 && !P.shown(), 'back: the first game and its page again, the bar hidden', sel() + ' ' + S.cur);
    }

    // ===== 6b. a game change keeps the page (and its sub-tab / view) when the other game has it; else that game's own last page, then its first
    {
      const IN = P.w.__as2in, gbtn = id => d.getElementById('games').querySelectorAll('button').find(b => b.getAttribute('data-game') === id);
      const gid = () => { const b = d.getElementById('games').querySelectorAll('button').find(q => q.getAttribute('aria-selected') === 'true'); return b ? b.getAttribute('data-game') : ''; };
      const go = async id => { P.click(gbtn(id)); await P.settle(0); };
      const G0 = gid(), has = {}, ids = IN.GAMES.map(g => g.id); for (const g of IN.GAMES) has[g.id] = new Set(g.tabs.flatMap(t => t.pages).filter(p => !(g.na && g.na[p])));
      // A, B = two games that share the Map Viewer, Docs and Upgrade, where A has a page B lacks
      let A = '', B = '', only = '';
      for (const a of ids) for (const b of ids) { if (A || a === b || !['mapviz', 'docs', 'upgrade'].every(p => has[a].has(p) && has[b].has(p))) continue; const o = [...has[a]].find(p => !has[b].has(p) && S.sec[p]); if (o) { A = a; B = b; only = o; } }
      ok(!!B, 'two games that share the Map Viewer, Docs and Upgrade, one with a page the other lacks', JSON.stringify(ids));
      if (B) {
        if (gid() !== A) await go(A);
        await go(B); IN.show('upgrade'); await P.settle(0);
        ok(gid() === B && S.cur === 'upgrade', 'setup: ' + B + ' is left on Upgrade', gid() + ' ' + S.cur);
        await go(A); ok(gid() === A && S.cur === 'upgrade', 'back to ' + A + ': the same page (Upgrade), not the page ' + A + ' was left on', gid() + ' ' + S.cur);
        IN.show('mapviz'); await P.settle(0); P.w.JUMPS.clear();
        await go(B);
        ok(gid() === B && S.cur === 'mapviz', 'game tab ' + A + ' -> ' + B + ' on the Map Viewer: still the Map Viewer, not the remembered Upgrade', gid() + ' ' + S.cur);
        ok(P.w.JUMPS.size() === 1 && P.shown(), 'the switch is one jump', String(P.w.JUMPS.size()));
        P.click(d.getElementById('jmpback')); await P.settle(0);
        ok(gid() === A && S.cur === 'mapviz' && P.w.JUMPS.size() === 0, 'back: ' + A + ' and the Map Viewer again', gid() + ' ' + S.cur);
        // the view (page pill) stays too
        IN.show('docs', 'modding'); await P.settle(0); const v0 = S.view.docs;
        await go(B);
        ok(v0 === 'modding' && gid() === B && S.cur === 'docs' && S.view.docs === 'modding', 'a page with views: the same view after the switch (docs/modding)', gid() + ' ' + S.cur + '/' + S.view.docs);
        const pill = d.getElementById('pagenav') && d.getElementById('pagenav').querySelectorAll('button').find(b => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-current'));
        ok(!d.getElementById('pagenav') || !d.getElementById('pagenav').querySelectorAll('button').length || !!pill, 'the page pill row marks a current item after the switch');
        await go(A); ok(gid() === A && S.cur === 'docs' && S.view.docs === 'modding', 'and back by the game tab: the same page and view', gid() + ' ' + S.cur + '/' + S.view.docs);
        // a page the other game does not have: that game's remembered page; Back restores the old game and page
        if (only) {
          await go(B); IN.show('upgrade'); await P.settle(0); await go(A); IN.show(only); await P.settle(0); P.w.JUMPS.clear();
          ok(gid() === A && S.cur === only, 'setup: ' + A + ' on ' + only + ' (not in ' + B + ')', gid() + ' ' + S.cur);
          await go(B);
          ok(gid() === B && S.cur === 'upgrade', B + ' has no ' + only + ': the page ' + B + ' was last on before (Upgrade)', gid() + ' ' + S.cur);
          P.click(d.getElementById('jmpback')); await P.settle(0);
          ok(gid() === A && S.cur === only, 'back: ' + A + ' and ' + only + ' again', gid() + ' ' + S.cur);
          // nothing remembered that the game can show: its first page
          IN.GS[B].screen = 'nosuchpage'; await go(B);
          const first = IN.INGAME.mods ? 'mods' : '';
          ok(gid() === B && S.cur !== only && !!IN.INGAME[S.cur] && (!first || S.cur === first), B + ' with nothing remembered: its first page', gid() + ' ' + S.cur);
        } else ok(false, 'a page of ' + A + ' that ' + B + ' lacks');
        if (gid() !== G0) await go(G0);
        P.w.JUMPS.clear();
      }
    }
  }

  // ===== 7. the page source: CSS in theme tokens, under the dialogs and pickers, strings in four languages
  {
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1], rule = (/#jmpbar\{[^}]*\}/.exec(css) || [''])[0];
    ok(/position:fixed/.test(rule) && /left:50%/.test(rule) && /bottom:\d+px/.test(rule), 'the bar is fixed at the bottom centre', rule);
    const z = +(/z-index:(\d+)/.exec(rule) || [0, 0])[1];
    ok(z > 20 && z < 1000, 'z-index (' + z + ') over the page and the toast, under the search lists (1000) and the map place picker (2000); dialogs are in the top layer');
    ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css.split('\n').filter(l => /jmp/.test(l)).join('\n').replace(/#jmp\w+/g, '')), 'the bar rules use theme tokens only');
    ok(/body\.jmpon\{padding-bottom:\d+px\}/.test(css) && /body\.jmpon #toast\{bottom:\d+px\}/.test(css), 'the page gets bottom room and the toast moves up while the bar shows');
    ok(/@media \(max-width:700px\)\{#jmpbar/.test(css), 'the phone width rule covers the bar');
    const keys = ['jmp.to', 'jmp.toB', 'jmp.left', 'jmp.tip', 'jmp.clear', 'jmp.bar'], miss = [];
    for (const c of ORDER) for (const k of keys) { const v = LANG(c)[k]; if (!v || (c !== 'en' && v === EN[k])) miss.push(c + ' ' + k); }
    ok(miss.length === 0, 'the six strings are in en, ru, uk, zh', miss.join(', '));
    ok(ORDER.every(c => /\{p\}/.test(LANG(c)['jmp.to']) && /\{p\}.*\{b\}/.test(LANG(c)['jmp.toB']) && /\{n\}/.test(LANG(c)['jmp.left'])), 'the slots are in every language');
  }

  console.log(failN ? 'FAIL ' + failN + ' of ' + (pass + failN) : 'PASS ' + pass + ' checks');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
