// Editor shell cases, toolbar version 2: one menu button per group (drop-down menus, keys, aria), the favourites bar (block tb.fav,
// LS ide.fav) and full screen (action fullscreen, block tb.full). The whole page in the fake DOM with the fake editor (env.boot from
// test.js). Run by tools/gui/ext/ide/test.js (hook at its end): module.exports = async function(env){}.
// Author: Imperator_Aug (ARSENAL, ia-9285d34f)
'use strict';

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const EN = {}, LANGS = ['en', 'ru', 'uk', 'zh'], ROWS = require('./lang/core');
  for (const r of ROWS) EN[r[0]] = r[1];
  const cl = (e, c) => !!(e && e.className && (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0);
  const GR = ['file', 'fix', 'jump', 'log', 'other'];
  const FAVDEF = ['save', 'next', 'fixAt', 'gofile', 'findInFiles', 'kitShow'];
  const A = 'resource/set/a.inc', STAR = String.fromCharCode(0x2605);

  async function page(o) {
    o = o || {};
    const P = await boot(Object.assign({ files: { [A]: '{"a"\r\n}\r\n' } }, o));
    P.G = g => P.B('tb.' + g);
    P.mb = g => P.G(g) && P.G(g).all().find(e => cl(e, 'ide-mb'));
    P.menu = g => P.G(g) && P.G(g).all().find(e => cl(e, 'ide-menu'));
    P.items = g => P.menu(g).children.filter(e => e.getAttribute && e.getAttribute('role') === 'menuitem');
    P.item = id => P.sec.all().find(e => cl(e, 'ide-mi') && e.dataset.act === id) || null;
    P.favs = () => P.B('tb.fav').all().filter(e => e.dataset && e.dataset.fav).map(e => e.dataset.fav);
    P.fav = id => P.B('tb.fav').all().find(e => e.dataset && e.dataset.fav === id) || null;
    P.ctx = () => P.sec.all().find(e => cl(e, 'ide-cmenu'));
    P.ctxItems = () => P.ctx().children.filter(e => e.getAttribute && e.getAttribute('role') === 'menuitem');
    P.fsb = () => P.B('tb.full').all().find(e => cl(e, 'ide-fsb'));
    P.ov = () => P.sec.all().find(e => cl(e, 'ide-ov'));
    P.act = () => P.doc.activeElement;
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    return P;
  }
  const dt = () => { const d = { data: {}, setData(k, v) { d.data[k] = v; }, getData(k) { return d.data[k] || ''; }, effectAllowed: '', dropEffect: '' }; return d; };

  // ---- S1. blocks: tb holds the five group blocks and tb.full; tb.fav comes right after tb; blockcheck clean; aria roles
  {
    const P = await page();
    ok(P.kids(P.B('tb')) === 'tb.file,tb.fix,tb.jump,tb.log,tb.other,tb.full', 'shell2 S1: toolbar blocks are the five groups and tb.full', P.kids(P.B('tb')));
    ok(/^tb,tb\.fav,mid,/.test(P.kids(P.B('centre'))), 'shell2 S1: block tb.fav comes right after tb', P.kids(P.B('centre')));
    const probs = P.check();
    ok(Array.isArray(probs) && probs.length === 0, 'shell2 S1: the Editor screen passes blockcheck', JSON.stringify(probs));
    ok(P.B('tb').getAttribute('role') === 'toolbar', 'shell2 S1: tb is role toolbar');
    const bad = GR.filter(g => { const b = P.mb(g), m = P.menu(g);
      return !b || b.getAttribute('aria-haspopup') !== 'menu' || b.getAttribute('aria-expanded') !== 'false' || b.getAttribute('aria-controls') !== m.getAttribute('id') ||
        m.getAttribute('role') !== 'menu' || !m.hidden || m.getAttribute('aria-labelledby') !== b.getAttribute('id'); });
    ok(!bad.length, 'shell2 S1: one menu button per group (aria-haspopup, aria-expanded, aria-controls) and a hidden role=menu', bad.join());
    const loose = P.sec.querySelectorAll('button[data-act]').filter(b => !cl(b.parentNode, 'ide-menu'));
    ok(!loose.length, 'shell2 S1: no action button outside a menu (the bar shows menus only)', loose.map(b => b.dataset.act).join());
    // every action with bar !== false sits in exactly one menu, the others in none; key text and aria-keyshortcuts as the action's
    const acts = P.IDE.actions, cnt = {};
    P.sec.querySelectorAll('button[data-act]').forEach(b => { cnt[b.dataset.act] = (cnt[b.dataset.act] || 0) + 1; });
    const wrong = Object.keys(acts).filter(id => (acts[id].bar !== false ? cnt[id] !== 1 : !!cnt[id]));
    ok(!wrong.length, 'shell2 S1: every bar action is in exactly one menu, bar:false ones in none', wrong.join());
    const keyBad = Object.keys(cnt).filter(id => { const it = P.item(id), k = acts[id].key || acts[id].keyHint || '', ks = it.querySelector('.ide-mi-k');
      return it.getAttribute('role') !== 'menuitem' || (ks ? ks.textContent : '') !== k || (k && !it.getAttribute('aria-keyshortcuts')) || it.getAttribute('tabindex') !== '-1'; });
    ok(!keyBad.length, 'shell2 S1: each item is a menuitem showing its key (aria-keyshortcuts set)', keyBad.join());
    ok(P.item('fullscreen') && P.item('keys') && acts.fullscreen.key === 'Alt+Enter' && acts.keys.key === 'F2', 'shell2 S1: actions fullscreen (Alt+Enter) and keys (F2) are in the More menu');
    // the tip shows on hover over the item's name, not on keyboard focus (it would cover the next items); a screen reader gets it as
    // the description, with "Favourites" first on a favourite; the menu button's tip names the favourites key
    const sv = P.item('save'), tp = (sv.querySelector('.ide-mi-n')._tip || [''])[0];
    ok(tp === EN['ide.a.saveT'] && !sv._tip && sv.getAttribute('aria-keyshortcuts') === 'Control+S', 'shell2 S1: an item keeps its tip (hover on the name, no focus tip) and its key', tp);
    ok(sv.getAttribute('aria-description') === EN['ide.fav.h'] + '. ' + EN['ide.a.saveT'] && P.item('def').getAttribute('aria-description') === EN['ide.a.defT'],
      'shell2 S1: a screen reader hears the tip, and "Favourites" on a favourite', sv.getAttribute('aria-description'));
    ok(/Ctrl\+D/.test((P.mb('file')._tip || [''])[0]), 'shell2 S1: the menu button tip names the favourites key Ctrl+D', (P.mb('file')._tip || [''])[0]);
    ok(EN['ide.a.keys'] === 'Editor keys', 'shell2 S1: the More menu item for F2 says what it shows');
    // one tab stop in the toolbar
    const nav = P.sec.all().filter(e => cl(e, 'ide-tbnav')), stops = nav.filter(e => e.getAttribute('tabindex') === '0');
    ok(nav.length === 6 && stops.length === 1 && stops[0] === P.mb('file'), 'shell2 S1: the toolbar is one tab stop (roving tabindex on the first menu button)', nav.length + '/' + stops.length);
    // a later action shows in its menu after the redraw
    P.IDE.action('zzLate', { label: 'ide.a.save', group: 'log', run() {} }); await P.flush();
    ok(!!P.menu('log').children.find(e => e.dataset && e.dataset.act === 'zzLate'), 'shell2 S1: a later-registered action shows in its menu');
    // a group Arrange moved out of the toolbar still opens its menu
    P.B('centre').appendChild(P.G('fix')); P.IDE.action('zzMoved', { label: 'ide.a.save', group: 'fix', run() {} }); await P.flush();
    P.mb('fix').click();
    ok(!P.menu('fix').hidden && !!P.G('fix').querySelector('button[data-act=zzMoved]'), 'shell2 S1: a moved group still works as a menu button and is refilled');
  }

  // ---- S2. menus: open, keys inside, type-ahead, Esc, click outside, one open at a time, toolbar arrows
  {
    const P = await page();
    await P.open(A);
    const fb = P.mb('file'), fm = P.menu('file');
    fb.click();
    ok(!fm.hidden && fb.getAttribute('aria-expanded') === 'true' && P.act() === P.items('file').find(e => e.getAttribute('aria-disabled') !== 'true'), 'shell2 S2: a click opens the menu, focus on the first item that can run');
    const its = P.items('file');
    fm.fire('keydown', { key: 'End' }); ok(P.act() === its[its.length - 1], 'shell2 S2: End goes to the last item');
    fm.fire('keydown', { key: 'ArrowDown' }); ok(P.act() === its[0], 'shell2 S2: Down wraps to the first item');
    fm.fire('keydown', { key: 'ArrowUp' }); ok(P.act() === its[its.length - 1], 'shell2 S2: Up wraps to the last item');
    fm.fire('keydown', { key: 'Home' }); ok(P.act() === its[0], 'shell2 S2: Home goes to the first item');
    const tgt = its.slice(1).find(e => /^[a-z]/i.test(e.querySelector('.ide-mi-n').textContent));
    const letter = tgt.querySelector('.ide-mi-n').textContent[0].toLowerCase();
    fm.fire('keydown', { key: letter });
    ok(P.act() !== its[0] && P.act().querySelector('.ide-mi-n').textContent.toLowerCase()[0] === letter, 'shell2 S2: a letter jumps to an item that starts with it', letter);
    P.doc.key('Escape');
    ok(fm.hidden && fb.getAttribute('aria-expanded') === 'false' && P.act() === fb, 'shell2 S2: Esc closes and gives focus back to the menu button');
    // Down on the button opens at the first item, Up at the last
    fb.fire('keydown', { key: 'ArrowUp' });
    ok(!fm.hidden && P.act() === its[its.length - 1], 'shell2 S2: Up on the button opens at the last item');
    fm.fire('keydown', { key: 'Escape' }); ok(fm.hidden && P.act() === fb, 'shell2 S2: Esc inside the menu closes it too');
    fb.fire('keydown', { key: 'ArrowDown' }); ok(!fm.hidden, 'shell2 S2: Down on the button opens the menu');
    // Right inside a menu opens the next one; only one open
    fm.fire('keydown', { key: 'ArrowRight' });
    ok(fm.hidden && !P.menu('fix').hidden && P.mb('fix').getAttribute('aria-expanded') === 'true', 'shell2 S2: Right in a menu opens the next menu, the first closes');
    P.mb('jump').click();
    ok(GR.filter(g => !P.menu(g).hidden).join() === 'jump', 'shell2 S2: one menu open at a time', GR.filter(g => !P.menu(g).hidden).join());
    // click outside
    P.doc.fire('mousedown', { target: P.B('editor') });
    ok(P.menu('jump').hidden && P.mb('jump').getAttribute('aria-expanded') === 'false', 'shell2 S2: a mousedown outside closes the menu');
    // a click on the open menu's button toggles it shut
    P.mb('jump').click(); P.doc.fire('mousedown', { target: P.mb('jump') }); P.mb('jump').click();
    ok(P.menu('jump').hidden, 'shell2 S2: a second click on the menu button closes it');
    // toolbar arrows (roving tabindex), End reaches the full screen button
    fb.focus(); fb.fire('keydown', { key: 'ArrowRight' });
    ok(P.act() === P.mb('fix') && P.mb('fix').getAttribute('tabindex') === '0' && fb.getAttribute('tabindex') === '-1', 'shell2 S2: Right moves along the toolbar (one tab stop)');
    P.mb('fix').fire('keydown', { key: 'End' }); ok(P.act() === P.fsb(), 'shell2 S2: End goes to the full screen button');
    P.fsb().fire('keydown', { key: 'ArrowRight' }); ok(P.act() === fb, 'shell2 S2: Right wraps to the first menu button');
    fb.fire('keydown', { key: 'ArrowLeft' }); ok(P.act() === P.fsb(), 'shell2 S2: Left wraps to the last toolbar button');
    // Tab closes the menu
    fb.click(); fm.fire('keydown', { key: 'Tab' }); ok(fm.hidden, 'shell2 S2: Tab closes the menu');
    // an action key with a menu open closes it and runs
    fb.click(); let ran = 0; P.IDE.action('zzKey', { label: 'ide.a.save', group: 'other', key: 'Ctrl+Shift+Y', run() { ran++; } }); await P.flush();
    P.doc.activeElement = P.doc.body; fb.click(); P.doc.key('Y', { ctrlKey: true, shiftKey: true });
    ok(ran === 1 && fm.hidden, 'shell2 S2: an action key with a menu open closes it and runs the action', ran);
    // the same with the focus on an item: the focus goes back to the menu button, not into the hidden menu
    fb.click(); ok(P.items('file').indexOf(P.act()) >= 0, 'shell2 S2: (focus in the menu)');
    P.doc.key('Y', { ctrlKey: true, shiftKey: true });
    ok(ran === 2 && fm.hidden && P.act() === fb, 'shell2 S2: an action key from inside a menu closes it and gives the focus to its button', P.act() && P.act().className);
    // the mouse moves the focus: hover and focus are one item
    fb.click(); const mv = P.items('file')[2]; mv.fire('mousemove', {});
    ok(P.act() === mv, 'shell2 S2: moving the mouse over an item focuses it (one highlighted item)');
    // focus that leaves the menu closes it
    P.B('editor').focus(); fm.fire('focusout', {}); await P.flush();
    ok(fm.hidden && fb.getAttribute('aria-expanded') === 'false', 'shell2 S2: focus leaving the menu closes it');
    // the menu is placed inside the window
    fb.click();
    ok(/px$/.test(String(fm.style.left)) && /px$/.test(String(fm.style.top)), 'shell2 S2: the menu gets a position (fixed, inside the window)', fm.style.left + ',' + fm.style.top);
    P.doc.key('Escape');
    // near the bottom edge it opens upwards; near the right edge it shifts left
    const bx = P.bx, H0 = bx.innerHeight, W0 = bx.innerWidth;
    bx.innerHeight = 300; bx.innerWidth = 400;
    fb.getBoundingClientRect = () => ({ left: 10, right: 60, top: 260, bottom: 280, width: 50, height: 20 });
    fm.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 150, width: 200, height: 150 });
    fb.click();
    ok(fm.style.top === (260 - 150 - 2) + 'px' && fm.style.left === '10px', 'shell2 S2: near the bottom edge the menu opens above its button', fm.style.left + ',' + fm.style.top);
    P.doc.key('Escape');
    fb.getBoundingClientRect = () => ({ left: 350, right: 400, top: 20, bottom: 40, width: 50, height: 20 });
    fb.click();
    ok(fm.style.left === (400 - 200 - 4) + 'px' && fm.style.top === '42px', 'shell2 S2: near the right edge the menu shifts left, inside the window', fm.style.left + ',' + fm.style.top);
    P.doc.key('Escape');
    bx.innerHeight = H0; bx.innerWidth = W0; delete fb.getBoundingClientRect; delete fm.getBoundingClientRect;
  }

  // ---- S3. disabled state follows canRun; a disabled item does not run; a picked item runs, closes, focus back
  {
    const P = await page();
    let can = false, ran = 0;
    P.IDE.action('zzOff', { label: 'ide.a.save', group: 'fix', run() { ran++; }, when: () => can }); await P.flush();
    P.mb('fix').click();
    const it = () => P.item('zzOff');
    ok(it().getAttribute('aria-disabled') === 'true' && !it().disabled, 'shell2 S3: an item that cannot run is aria-disabled (still focusable)');
    ok(P.item('save').getAttribute('aria-disabled') === 'true', 'shell2 S3: Save is off with no file open');
    it().click();
    ok(ran === 0 && !P.menu('fix').hidden, 'shell2 S3: a click on a disabled item does nothing, the menu stays', ran);
    can = true; P.doc.key('Escape'); P.mb('fix').click();
    ok(it().getAttribute('aria-disabled') === null, 'shell2 S3: opening the menu again takes the new state');
    it().click();
    ok(ran === 1 && P.menu('fix').hidden && P.act() === P.mb('fix'), 'shell2 S3: a picked item runs, the menu closes, focus is back on the button', ran);
    await P.open(A);
    P.mb('file').click();
    ok(P.item('save').getAttribute('aria-disabled') === null, 'shell2 S3: Save is on with a file open');
    P.doc.key('Escape');
  }

  // ---- S4. favourites: defaults, add and remove (favourites menu, Ctrl+D), move, keys on the bar, run, persistence, unknown ids
  {
    const P = await page();
    const def = FAVDEF.filter(id => P.IDE.actions[id]);
    ok(P.favs().join() === def.join() && P.ls('ide.fav') === undefined, 'shell2 S4: first run shows the default favourites', P.favs().join());
    ok(P.fav('save').getAttribute('draggable') === 'true' && P.fav('save').classList.contains('ide-tbb'), 'shell2 S4: favourites are toolbar buttons you can drag');
    const star = P.item('save').querySelector('.ide-mi-f');
    ok(star && star.textContent === STAR && P.item('def').querySelector('.ide-mi-f').textContent === '', 'shell2 S4: a favourite shows a star in its menu');
    // add by the favourites menu (right click)
    P.mb('jump').click();
    P.item('def').fire('contextmenu', { clientX: 30, clientY: 40 });
    ok(!P.ctx().hidden && P.ctx().getAttribute('role') === 'menu' && P.ctxItems().length === 1 && P.ctxItems()[0].textContent === EN['ide.fav.add'], 'shell2 S4: right click on a menu item offers Add to favourites', P.ctx().textContent);
    ok(!P.menu('jump').hidden, 'shell2 S4: the menu stays open under the favourites menu');
    P.ctxItems()[0].click();
    ok(P.favs().join() === def.concat(['def']).join() && P.ls('ide.fav').join() === P.favs().join() && P.ctx().hidden, 'shell2 S4: Add puts it at the end of the bar and in LS ide.fav', P.favs().join());
    ok(P.item('def').querySelector('.ide-mi-f').textContent === STAR, 'shell2 S4: its star shows in the menu');
    P.item('def').fire('contextmenu', { clientX: 30, clientY: 40 });
    ok(P.ctxItems()[0].textContent === EN['ide.fav.remove'], 'shell2 S4: on a favourite the menu offers Remove');
    P.doc.key('Escape');
    ok(P.ctx().hidden && !P.menu('jump').hidden && P.act() === P.item('def'), 'shell2 S4: Esc closes only the favourites menu, focus back on the item');
    // Shift+F10 opens it from the keyboard
    P.menu('jump').fire('keydown', { key: 'F10', shiftKey: true });
    ok(!P.ctx().hidden && P.act() === P.ctxItems()[0], 'shell2 S4: Shift+F10 on an item opens the favourites menu, focus inside');
    P.ctx().fire('keydown', { key: 'Escape' }); ok(P.ctx().hidden && P.act() === P.item('def'), 'shell2 S4: Esc in the favourites menu goes back to the item');
    // Ctrl+D toggles
    P.item('refs').focus(); P.menu('jump').fire('keydown', { key: 'd', ctrlKey: true });
    ok(P.favs().indexOf('refs') >= 0, 'shell2 S4: Ctrl+D on a menu item adds it');
    P.menu('jump').fire('keydown', { key: 'd', ctrlKey: true });
    ok(P.favs().indexOf('refs') < 0, 'shell2 S4: Ctrl+D again takes it off');
    P.doc.key('Escape');
    // the bar: Move right / left (favourites menu), the ends disabled
    P.fav('save').fire('contextmenu', { clientX: 5, clientY: 5 });
    const ci = P.ctxItems().map(e => e.textContent + (e.getAttribute('aria-disabled') === 'true' ? '-' : '+')).join('|');
    ok(ci === [EN['ide.fav.remove'] + '+', EN['ide.fav.left'] + '-', EN['ide.fav.right'] + '+'].join('|'), 'shell2 S4: on the bar: Remove, Move left (off at the start), Move right', ci);
    P.ctxItems()[1].click(); ok(P.favs()[0] === 'save' && !P.ctx().hidden, 'shell2 S4: a disabled Move left does nothing');
    P.ctxItems()[2].click(); ok(P.favs()[1] === 'save' && P.ctx().hidden, 'shell2 S4: Move right moves it one place', P.favs().join());
    // keys on the bar
    P.fav('save').focus(); P.fav('save').fire('keydown', { key: 'ArrowLeft', ctrlKey: true });
    ok(P.favs()[0] === 'save' && P.act() === P.fav('save'), 'shell2 S4: Ctrl+Left moves the focused favourite, focus stays on it', P.favs().join());
    P.fav('save').fire('keydown', { key: 'ArrowRight' });
    ok(P.act() === P.fav(P.favs()[1]) && P.fav(P.favs()[1]).getAttribute('tabindex') === '0', 'shell2 S4: Right moves the focus along the bar');
    const gone = P.favs()[1]; P.fav(gone).fire('keydown', { key: 'Delete' });
    ok(P.favs().indexOf(gone) < 0 && P.act() === P.fav(P.favs()[1]), 'shell2 S4: Delete takes the favourite off, focus on the next one', gone);
    // a redraw keeps the bar's tab stop where it was
    const stop = P.favs()[1]; P.doc.activeElement = P.doc.body; P.IDE.fav.add('which'); await P.flush();
    ok(P.fav(stop).getAttribute('tabindex') === '0' && P.favs().filter(id => P.fav(id).getAttribute('tabindex') === '0').length === 1, 'shell2 S4: a redraw keeps the favourites bar tab stop', stop);
    P.IDE.fav.remove('which');
    // click runs, disabled state as in the menu
    let ran = 0, can = false;
    P.IDE.action('zzFav', { label: 'ide.a.save', group: 'other', run() { ran++; }, when: () => can }); await P.flush();
    P.IDE.fav.add('zzFav'); await P.flush();
    ok(P.fav('zzFav') && P.fav('zzFav').getAttribute('aria-disabled') === 'true', 'shell2 S4: a favourite that cannot run is shown off');
    can = true; P.mb('file').click(); P.doc.key('Escape');
    ok(P.fav('zzFav').getAttribute('aria-disabled') === null, 'shell2 S4: the bar follows the state (updBar)');
    P.fav('zzFav').click(); ok(ran === 1, 'shell2 S4: a click on a favourite runs it', ran);
    // persistence across a reload; an unknown id is dropped silently
    const saved = P.ls('ide.fav');
    const Q = await page({ ls: { 'ide.fav': ['zzNope'].concat(saved) } });
    const want = saved.filter(id => Q.IDE.actions[id]);
    ok(Q.favs().join() === want.join() && Q.favs().indexOf('zzNope') < 0, 'shell2 S4: the bar comes back from LS after a reload, unknown ids left out', Q.favs().join() + ' / ' + want.join());
    // empty: one hint line, still a drop target
    const E = await page({ ls: { 'ide.fav': [] } });
    const hint = E.B('tb.fav').all().find(e => cl(e, 'ide-fav-none'));
    ok(!E.favs().length && hint && hint.textContent === EN['ide.fav.empty'], 'shell2 S4: an empty bar shows one hint line', hint && hint.textContent);
    const d1 = dt(); E.mb('jump').click();
    E.item('outline').fire('dragstart', { dataTransfer: d1 });
    ok(d1.data['text/x-ide-act'] === 'outline' && Object.keys(d1.data).length === 1, 'shell2 S4: a drag carries only text/x-ide-act (no text for the editor)', JSON.stringify(d1.data));
    E.B('tb.fav').fire('dragover', { dataTransfer: d1, clientX: 5, clientY: 5 });
    ok(!!E.B('tb.fav').all().find(e => cl(e, 'ide-fav-mark')), 'shell2 S4: the bar marks where the drop lands');
    E.B('tb.fav').fire('drop', { dataTransfer: d1, clientX: 5, clientY: 5 });
    E.item('outline').fire('dragend', {});
    ok(E.favs().join() === 'outline' && !E.B('tb.fav').all().find(e => cl(e, 'ide-fav-mark')) && E.menu('jump').hidden, 'shell2 S4: dropping a menu item on the empty bar adds it (mark gone, menu closed)', E.favs().join());
    ok(E.act() === E.mb('jump'), 'shell2 S4: after a drop from a menu the focus is on the menu button, not in the hidden menu', E.act() && E.act().className);
    // drag to reorder, drag off to remove
    E.IDE.fav.add('def'); E.IDE.fav.add('refs'); await E.flush();
    const d2 = dt(); E.fav('outline').fire('dragstart', { dataTransfer: d2 });
    E.B('tb.fav').fire('dragover', { dataTransfer: d2 }); E.B('tb.fav').fire('drop', { dataTransfer: d2 });
    ok(E.favs().join() === 'def,refs,outline', 'shell2 S4: dragging a favourite along the bar moves it', E.favs().join());
    const d3 = dt(), src = E.fav('def'); src.fire('dragstart', { dataTransfer: d3 });
    E.doc.fire('dragover', { target: E.B('editor'), dataTransfer: d3 }); src.fire('dragend', {});
    ok(E.favs().join() === 'refs,outline' && E.ls('ide.fav').join() === 'refs,outline', 'shell2 S4: dragging a favourite off the bar takes it off', E.favs().join());
    ok(E.IDE.fav.drop('zzNope', 0) === false && E.favs().join() === 'refs,outline', 'shell2 S4: an unknown id cannot be added');
    // a drag that ends on the bar without a drop keeps the favourite
    const d4 = dt(), keep = E.fav('refs'); keep.fire('dragstart', { dataTransfer: d4 });
    E.B('tb.fav').fire('dragover', { dataTransfer: d4 }); keep.fire('dragend', {});
    ok(E.favs().join() === 'refs,outline', 'shell2 S4: a favourite dragged and let go on the bar (no drop) stays', E.favs().join());
    // the same id twice in the store shows once
    const D = await page({ ls: { 'ide.fav': ['save', 'save', 'gofile', 'save'] } });
    ok(D.favs().join() === 'save,gofile', 'shell2 S4: a stored id given twice shows once', D.favs().join());
  }

  // ---- S5. full screen: button, class, aria-pressed, Esc only with nothing open, refresh, browser full screen guarded
  {
    const P = await page();
    await P.open(A);
    const ed = P.ed(); let refreshed = 0; const rf = ed.refresh; ed.refresh = function () { refreshed++; return rf.apply(this, arguments); };
    const b = P.fsb();
    ok(b && b.getAttribute('aria-pressed') === 'false' && b.getAttribute('aria-label') === EN['ide.a.fullscreen'] && cl(P.G('full'), 'ide-tbfs'), 'shell2 S5: the full screen button sits in tb.full, not pressed, named');
    P.doc.activeElement = P.doc.body;
    b.click(); await P.flush();
    ok(cl(P.sec, 'ide-full') && b.getAttribute('aria-pressed') === 'true' && P.IDE.full() === true && refreshed > 0, 'shell2 S5: the button covers the window (class ide-full), aria-pressed, layout refreshed', refreshed);
    ok(P.said.indexOf(EN['ide.fs.on']) >= 0, 'shell2 S5: the status line says how to leave');
    P.doc.key('Escape'); ok(!cl(P.sec, 'ide-full') && b.getAttribute('aria-pressed') === 'false', 'shell2 S5: Esc with nothing open leaves full screen');
    P.doc.key('Enter', { altKey: true }); ok(P.IDE.full() === true, 'shell2 S5: Alt+Enter goes full screen');
    // Esc goes to an open menu, box or list first
    P.mb('file').click(); P.doc.key('Escape');
    ok(P.IDE.full() === true && P.menu('file').hidden, 'shell2 S5: Esc closes an open menu first, full screen stays');
    P.doc.activeElement = P.doc.body; P.doc.key('F2'); await P.flush();
    ok(!P.ov().hidden && !!P.ov().all().find(e => cl(e, 'ide-keys')), 'shell2 S5: F2 shows the key list');
    const kt = P.ov().textContent;
    ok(kt.indexOf('Alt+Enter') >= 0 && kt.indexOf('Ctrl+D') >= 0 && kt.indexOf('F8') >= 0 && kt.indexOf(EN['ide.keys.fav']) >= 0, 'shell2 S5: the key list names the full screen key, the favourites key and the action keys');
    P.doc.key('Escape'); ok(P.ov().hidden && P.IDE.full() === true, 'shell2 S5: Esc closes the box first, full screen stays');
    const hints = P.doc.createElement('div'); hints.className = 'CodeMirror-hints'; P.doc.body.appendChild(hints);
    P.doc.key('Escape'); ok(P.IDE.full() === true, 'shell2 S5: Esc with the completion list open leaves full screen alone');
    hints.remove();
    const ins = ed.inSession; ed.inSession = () => true; P.doc.key('Escape'); ed.inSession = ins;
    ok(P.IDE.full() === true, 'shell2 S5: Esc during a field session leaves full screen alone');
    const inp = P.doc.createElement('input'); P.doc.body.appendChild(inp); inp.value = 'abc'; inp.focus();
    P.doc.key('Escape', { target: inp }); ok(P.IDE.full() === true, 'shell2 S5: Esc in a text field with text leaves full screen alone');
    inp.remove(); P.doc.activeElement = P.doc.body;
    P.doc.key('Escape'); ok(P.IDE.full() === false, 'shell2 S5: then Esc leaves');
    // in the text the first Esc is the editor's (it arms "Tab moves focus once"), the next one leaves
    const host = P.sec.all().find(e => cl(e, 'ide-ed')), inText = P.doc.createElement('textarea'); host.appendChild(inText);
    let armed = false; const tf = ed.tabFocus; ed.tabFocus = function () { return armed; };
    P.IDE.full(true); await P.flush(); inText.focus();
    let stopped = 0; P.doc.key('Escape', { target: inText, stopPropagation() { stopped++; } });
    ok(P.IDE.full() === true && stopped === 0, 'shell2 S5: Esc in the text goes to the editor first (not stopped), full screen stays', stopped);
    armed = true; P.doc.key('Escape', { target: inText });
    ok(P.IDE.full() === false, 'shell2 S5: once the editor took its Esc (Tab moves focus), the next Esc leaves');
    ed.tabFocus = tf; inText.remove();
    // the Code Pieces column and the explorer's filter (empty) take their own Esc first (back to the text, back to the list)
    const kb = P.B('kit');
    if (kb) {
      const kin = P.doc.createElement('button'); kb.appendChild(kin); P.IDE.full(true); kin.focus();
      P.doc.key('Escape', { target: kin }); ok(P.IDE.full() === true, 'shell2 S5: Esc in the Code Pieces column leaves full screen alone');
      kin.remove(); P.IDE.full(false);
    } else env.skip('shell2 S5: Esc in the Code Pieces column', 'no kit column here');
    const xin = P.B('explorer').all().find(e => e.tagName === 'INPUT');
    P.IDE.full(true); xin.value = ''; xin.focus();
    P.doc.key('Escape', { target: xin }); ok(P.IDE.full() === true, 'shell2 S5: Esc in the explorer filter (empty) leaves full screen alone');
    // while Arrange runs, Esc ends Arrange (the page's), not full screen
    P.doc.activeElement = P.doc.body; P.doc.body.classList.add('arranging');
    P.doc.key('Escape'); ok(P.IDE.full() === true, 'shell2 S5: Esc during Arrange leaves full screen alone');
    P.doc.body.classList.remove('arranging'); P.doc.key('Escape'); ok(P.IDE.full() === false, 'shell2 S5: after Arrange Esc leaves');
    // browser full screen: asked for when there is one; a refusal is not an error; leaving it (browser Esc, F11) brings the page back
    const de = P.doc.documentElement; let asked = 0, exited = 0;
    de.requestFullscreen = () => { asked++; return Promise.reject(new Error('refused')); };
    let threw = null; try { P.IDE.full(true); await P.flush(); } catch (e) { threw = e; }
    ok(!threw && asked === 1 && P.IDE.full() === true, 'shell2 S5: a refused browser full screen is not an error, the page stays full', threw && threw.message);
    P.IDE.full(false);
    de.requestFullscreen = () => { asked++; P.doc.fullscreenElement = de; return Promise.resolve(); };
    P.doc.exitFullscreen = () => { exited++; P.doc.fullscreenElement = null; return Promise.resolve(); };
    P.IDE.full(true); await P.flush();
    P.doc.fullscreenElement = null; P.doc.fire('fullscreenchange', {});
    ok(P.IDE.full() === false && !cl(P.sec, 'ide-full') && exited === 0, 'shell2 S5: the browser leaving full screen brings the page back', exited);
    P.IDE.full(true); await P.flush(); b.click();
    ok(P.IDE.full() === false && exited === 1, 'shell2 S5: the button leaves the browser full screen too', exited);
    // Esc is locked where the browser allows it (so a short Esc reaches the page), and let go when full screen ends
    let locked = null, unlocked = 0;
    P.bx.navigator = { keyboard: { lock(k) { locked = k; return Promise.resolve(); }, unlock() { unlocked++; } } };
    P.IDE.full(true); await P.flush();
    ok(JSON.stringify(locked) === '["Escape"]', 'shell2 S5: with the browser full screen granted, Esc is locked for the page', JSON.stringify(locked));
    P.IDE.full(false); ok(unlocked > 0 && exited === 2, 'shell2 S5: leaving lets Esc go and ends the browser full screen', unlocked + '/' + exited);
    delete P.bx.navigator;
    // without the lock the browser takes the Esc: its exit while a menu is open (or right after an Esc a menu took) only closes that
    P.IDE.full(true); await P.flush(); P.mb('file').click();
    P.doc.fullscreenElement = null; P.doc.fire('fullscreenchange', {});
    ok(P.IDE.full() === true && P.menu('file').hidden && P.act() === P.mb('file'), 'shell2 S5: the browser leaving its full screen with a menu open closes the menu, the Editor stays full');
    P.doc.key('Escape'); ok(P.IDE.full() === false, 'shell2 S5: then Esc leaves');
    P.IDE.full(true); await P.flush(); P.mb('file').click(); P.doc.key('Escape');
    P.doc.fullscreenElement = null; P.doc.fire('fullscreenchange', {});
    ok(P.IDE.full() === true && P.menu('file').hidden, 'shell2 S5: the browser exit that comes right after an Esc a menu took keeps the Editor full');
    P.doc.activeElement = P.doc.body; P.doc.key('Escape'); ok(P.IDE.full() === false, 'shell2 S5: and the next Esc leaves');
    // a request granted after the page already went back (two quick presses) is ended at once
    let grant = null; de.requestFullscreen = () => { asked++; return new Promise(r => { grant = () => { P.doc.fullscreenElement = de; r(); }; }); };
    const ex0 = exited; P.IDE.full(true); P.IDE.full(false); grant(); await P.flush();
    ok(P.IDE.full() === false && exited === ex0 + 1 && !P.doc.fullscreenElement, 'shell2 S5: a late grant after going back ends the browser full screen', exited - ex0);
    // a browser full screen the Editor did not ask for (a viewer's own) ending does not end the Editor's
    delete de.requestFullscreen; P.IDE.full(true); P.doc.fullscreenElement = null; P.doc.fire('fullscreenchange', {});
    ok(P.IDE.full() === true, 'shell2 S5: another full screen ending leaves the Editor full');
    P.IDE.full(false);
    delete de.requestFullscreen; delete P.doc.exitFullscreen;
    // the page left: menus close and full screen ends
    P.IDE.full(true); P.mb('file').click(); P.bx.as2Link('page:mods'); await P.flush(); P.IDE.pageVis();
    ok(P.IDE.full() === false && P.menu('file').hidden, 'shell2 S5: leaving the Editor page ends full screen and closes menus');
  }

  // ---- S6. strings: every new key in four languages
  {
    const NEW = ['ide.mbT', 'ide.blk.fav', 'ide.blk.full', 'ide.fav.h', 'ide.fav.empty', 'ide.fav.add', 'ide.fav.remove', 'ide.fav.left', 'ide.fav.right',
      'ide.fav.barT', 'ide.fav.added', 'ide.fav.removed', 'ide.a.fullscreen', 'ide.a.fullscreenT', 'ide.fs.offT', 'ide.fs.on', 'ide.a.keys', 'ide.a.keysT', 'ide.keys.h',
      'ide.keys.tb', 'ide.keys.open', 'ide.keys.mi', 'ide.keys.fav', 'ide.keys.ctx', 'ide.keys.favDel', 'ide.keys.favMove', 'ide.keys.esc'];
    const by = {}; for (const r of ROWS) by[r[0]] = r;
    const miss = NEW.filter(k => !by[k] || by[k].length !== 1 + LANGS.length || by[k].slice(1).some(s => typeof s !== 'string' || !s.trim()));
    ok(!miss.length, 'shell2 S6: the new strings exist in en, ru, uk, zh', miss.join());
    ok(EN['ide.fav.empty'] === 'Right click an action in a menu to keep it here', 'shell2 S6: the empty bar hint reads as asked');
  }
};
