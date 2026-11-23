// Close several tabs (ui/core.js, part tabs): the tab menu (right click, menu key, Shift+F10), its rows and disabled states, the File
// menu actions and the Close all key, Ctrl/Shift selection, the unsaved changes card (Save all and close, Close without saving, Cancel),
// and the tab shown after a batch close. The whole page in the fake DOM with the fake editor and a fake server (env.boot from test.js).
// Run by tools/gui/ext/ide/test.js (hook at its end), or alone: IDE_ONLY=tabs node tools/gui/ext/ide/test.js <scratch>.
// module.exports = async function(env){}.
// Author: Imperator_Aug (ARSENAL, ia-55939003)
'use strict';

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const cl = (e, c) => !!(e && e.className && (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0);
  const ROWS = require('./lang/core'), EN = {};
  for (const r of ROWS) EN[r[0]] = r[1];
  const fill = (k, p) => String(EN[k]).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const NAMES = ['a', 'b', 'c', 'd', 'e'], REL = n => 'resource/set/' + n + '.set';

  // page(o): five files open (a..e, e active). o.save(body) -> answer for files/save (default: written); o.ro: names opened read-only
  async function page(o) {
    o = o || {};
    const files = {};
    for (const n of NAMES) files[REL(n)] = (o.ro || []).indexOf(n) >= 0 ? { text: '{' + n + ' 1}\r\n', editable: false, why: 'outside' } : '{' + n + ' 1}\r\n';
    const saves = [];
    const P = await boot({ files, remote: !!o.remote, api: req => {
      if (req.path === '/api/x/files/save') { saves.push(req.body); if (o.save) return o.save(req.body); return req.body.write ? { written: true, hash: 'h' + saves.length, restorePoint: 'r' + saves.length } : { changed: true, hunks: [] }; }
      return undefined;
    } });
    P.saves = saves;
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    P.closed = []; P.IDE.on('closed', x => P.closed.push(x.doc.base));
    for (const n of NAMES) await P.open(REL(n));
    P.doc_ = n => P.IDE.docs.find(d => d.rel === REL(n)) || null;
    P.names = () => P.IDE.docs.map(d => d.base.replace(/\.set$/, '')).join('');
    P.actName = () => { const d = P.IDE.active(); return d ? d.base.replace(/\.set$/, '') : null; };
    P.tabs = () => P.sec.all().filter(e => cl(e, 'ide-tab'));
    P.tab = n => { const d = P.doc_(n); return d ? P.tabs().find(t => t.dataset.doc === d.id) || null : null; };
    P.tm = () => P.sec.all().find(e => cl(e, 'ide-tmenu'));
    P.rows = () => P.tm().children.filter(e => e.getAttribute && e.getAttribute('role') === 'menuitem');
    P.row = k => P.rows().find(e => e.dataset.tclose === k) || null;
    P.off = e => !!e && e.getAttribute('aria-disabled') === 'true';
    P.ov = () => P.sec.all().find(e => cl(e, 'ide-ov'));
    P.card = () => P.ov().all().find(e => cl(e, 'ide-tsc')) || null;
    P.cardBtn = k => { const c = P.card(); return c ? c.all().find(e => e.tagName === 'BUTTON' && e.textContent === EN[k]) || null : null; };
    P.dirty = n => { P.IDE.active() === P.doc_(n) || P.IDE.open({ rel: REL(n) }); };
    P.edit = async n => { await P.IDE.open({ rel: REL(n) }); await P.flush(); P.ed().userEdit([{ line: 1, col: 1, text: '//x ' }]); await P.flush(); };
    P.menuOn = (n, kb) => { const t = P.tab(n); if (kb) t.fire('keydown', { key: 'F10', shiftKey: true }); else t.fire('contextmenu', { clientX: 40, clientY: 12 }); };
    P.pick = async k => { P.row(k).click(); await P.flush(); };
    P.act = () => P.doc.activeElement;
    return P;
  }

  // ---- T1. the actions: File menu, the Close all key, no key clash
  {
    const P = await page();
    const A = P.IDE.actions, ids = ['closeSel', 'closeTab', 'closeOthers', 'closeRight', 'closeLeft', 'closeSaved', 'closeAll'];
    ok(ids.every(id => A[id] && A[id].group === 'file' && A[id].bar !== false), 'tabs T1: the seven close actions are in the File menu', ids.filter(id => !A[id] || A[id].group !== 'file').join());
    const fm = P.B('tb.file');
    ok(ids.every(id => !!fm.querySelector('button[data-act=' + id + ']')), 'tabs T1: the File menu shows them');
    ok(A.closeAll.key === 'Shift+Alt+W', 'tabs T1: Close all has the key Shift+Alt+W', A.closeAll.key);
    const canon = P.IDE.canon, same = Object.keys(A).filter(id => id !== 'closeAll' && A[id].key && canon(A[id].key) === canon('Shift+Alt+W'));
    ok(!same.length, 'tabs T1: no other action uses Shift+Alt+W', same.join());
    ok(['Ctrl+W', 'Ctrl+F4', 'Ctrl+Shift+W', 'Ctrl+T', 'Ctrl+N'].every(k => !Object.keys(A).some(id => A[id].key && canon(A[id].key) === canon(k))), 'tabs T1: no action takes a key the browser keeps (Ctrl+W, Ctrl+F4, Ctrl+Shift+W, Ctrl+T, Ctrl+N)');
    ok(!!P.ed().keyMap['Shift-Alt-W'], 'tabs T1: the key also works inside the text (editor key map)', Object.keys(P.ed().keyMap).join());
    ok(P.names() === 'abcde' && P.actName() === 'e', 'tabs T1: five tabs open, e shown', P.names());
    // when: e is last -> no "to the right"; no selection -> no closeSel
    P.IDE.closeMenus(); P.B('tb.file').querySelector('.ide-mb').click();
    const it = id => fm.querySelector('button[data-act=' + id + ']');
    ok(P.off(it('closeRight')) && P.off(it('closeSel')) && !P.off(it('closeLeft')) && !P.off(it('closeAll')) && !P.off(it('closeOthers')), 'tabs T1: File menu: right and selected disabled on the last tab, the others enabled');
    P.IDE.closeMenus();
  }

  // ---- T2. tab menu: rows, disabled states, the key, opened by right click and by Shift+F10 / menu key
  {
    const P = await page();
    P.menuOn('c');
    ok(!P.tm().hidden && P.rows().map(r => r.dataset.tclose).join() === 'one,others,right,left,saved,all', 'tabs T2: right click on a tab opens the menu: Close, Close others, right, left, saved, all (no selected row without a selection)', P.rows().map(r => r.dataset.tclose).join());
    ok(P.rows().map(r => r.textContent).join('|').indexOf(EN['ide.ts.m.others']) >= 0 && P.row('all').textContent.indexOf('Shift+Alt+W') >= 0, 'tabs T2: rows read as the lang rows; Close all shows its key', P.rows().map(r => r.textContent).join('|'));
    ok(P.rows().every(r => !P.off(r)), 'tabs T2: on a middle tab every row can run');
    ok(P.act() === P.row('one'), 'tabs T2: focus on the first row');
    P.tm().fire('keydown', { key: 'ArrowDown' }); ok(P.act() === P.row('others'), 'tabs T2: Down moves in the menu');
    P.tm().fire('keydown', { key: 'Escape' }); ok(P.tm().hidden && P.act() === P.tab('c'), 'tabs T2: Esc closes the menu, focus back on the tab');
    P.menuOn('a', true);
    ok(!P.tm().hidden && P.off(P.row('left')) && !P.off(P.row('right')), 'tabs T2: Shift+F10 on the first tab opens the menu; "to the left" disabled');
    P.tm().fire('keydown', { key: 'Escape' });
    P.tab('e').fire('keydown', { key: 'ContextMenu' });
    ok(!P.tm().hidden && P.off(P.row('right')) && !P.off(P.row('left')), 'tabs T2: the menu key on the last tab; "to the right" disabled');
    // a disabled row does nothing
    P.row('right').click(); await P.flush();
    ok(P.names() === 'abcde', 'tabs T2: a disabled row closes nothing');
    P.IDE.closeMenus();
    // only one tab: others, right, left disabled; all dirty: saved disabled
    const Q = await page();
    await Q.edit('a'); await Q.edit('b'); await Q.edit('c'); await Q.edit('d'); await Q.edit('e');
    Q.menuOn('c');
    ok(Q.off(Q.row('saved')), 'tabs T2: every tab unsaved: "Close saved tabs" disabled');
    Q.IDE.closeMenus();
    const R = await page();
    for (const n of ['a', 'b', 'c', 'd']) R.IDE.close(R.doc_(n), true);
    await R.flush(); R.menuOn('e');
    ok(R.off(R.row('others')) && R.off(R.row('right')) && R.off(R.row('left')) && !R.off(R.row('one')) && !R.off(R.row('all')), 'tabs T2: one tab: others, right, left disabled');
    R.IDE.closeMenus();
    // a mousedown outside closes the menu
    P.menuOn('b'); P.doc.fire('mousedown', { target: P.sec }); ok(P.tm().hidden, 'tabs T2: a click outside closes the tab menu');
  }

  // ---- T3. each row closes the right tabs, and the tab shown after
  {
    let P = await page(); P.menuOn('c'); await P.pick('right');
    ok(P.names() === 'abc' && P.actName() === 'c' && P.closed.join() === 'd.set,e.set', 'tabs T3: Close tabs to the right on c: d, e closed, c shown', P.names() + ' ' + P.actName() + ' ' + P.closed.join());
    ok(P.said.indexOf(fill('ide.ts.closed', { n: 2 })) >= 0, 'tabs T3: the status says how many closed', P.said.join('|'));
    P = await page(); P.menuOn('c'); await P.pick('left');
    ok(P.names() === 'cde' && P.actName() === 'c', 'tabs T3: Close tabs to the left on c: a, b closed, c shown (the menu tab)', P.names() + ' ' + P.actName());
    P = await page(); P.menuOn('b'); await P.pick('others');
    ok(P.names() === 'b' && P.actName() === 'b', 'tabs T3: Close others on b (e was shown): only b stays, b shown', P.names() + ' ' + P.actName());
    P = await page(); await P.IDE.open({ rel: REL('c') }); await P.flush(); P.menuOn('c'); await P.pick('one');
    ok(P.names() === 'abde' && P.actName() === 'd', 'tabs T3: Close on the shown c: the nearest tab right of it is shown (d)', P.names() + ' ' + P.actName());
    P = await page(); P.menuOn('e'); await P.pick('one');
    ok(P.names() === 'abcd' && P.actName() === 'd', 'tabs T3: Close on the last tab: the one left of it (d)', P.names() + ' ' + P.actName());
    P = await page(); P.menuOn('b'); await P.pick('one');
    ok(P.names() === 'acde' && P.actName() === 'e', 'tabs T3: Close on a tab not shown (b): the shown e stays shown, as with a single close', P.names() + ' ' + P.actName());
    P = await page(); await P.IDE.open({ rel: REL('d') }); await P.flush(); P.menuOn('b'); await P.pick('right');
    ok(P.names() === 'ab' && P.actName() === 'b', 'tabs T3: Close to the right on b while d is shown: d went, b (the menu tab) is shown', P.names() + ' ' + P.actName());
    P = await page(); await P.edit('b'); await P.IDE.open({ rel: REL('e') }); await P.flush(); P.menuOn('e'); await P.pick('saved');
    ok(P.names() === 'b' && P.actName() === 'b' && !P.card(), 'tabs T3: Close saved tabs: only the unsaved b stays and is shown; no question', P.names() + ' ' + P.actName());
    P = await page(); P.menuOn('c'); await P.pick('all');
    ok(P.IDE.docs.length === 0 && P.IDE.active() === null && P.closed.length === 5, 'tabs T3: Close all: no tab left, nothing shown', P.names());
    const empty = P.sec.all().find(e => cl(e, 'ide-empty'));
    ok(!!empty && !empty.hidden && P.tabs().length === 0, 'tabs T3: the empty state is shown');
    ok(P.ed().calls('dropDoc').length === 5, 'tabs T3: every closed text tab dropped its editor buffer', P.ed().calls('dropDoc').length);
    // the File menu actions work on the shown tab; Shift+Alt+W closes all from outside the text
    P = await page(); await P.IDE.open({ rel: REL('b') }); await P.flush(); P.IDE.run('closeRight'); await P.flush();
    ok(P.names() === 'ab' && P.actName() === 'b', 'tabs T3: File menu Close tabs to the right works on the shown tab', P.names());
    P.IDE.run('closeLeft'); await P.flush(); ok(P.names() === 'b', 'tabs T3: File menu Close tabs to the left', P.names());
    P = await page(); P.doc.key('W', { shiftKey: true, altKey: true }); await P.flush();
    ok(P.IDE.docs.length === 0, 'tabs T3: Shift+Alt+W closes all tabs', P.names());
    P = await page(); P.ed().keyMap['Shift-Alt-W'](); await P.flush();
    ok(P.IDE.docs.length === 0, 'tabs T3: Shift+Alt+W in the text closes all tabs', P.names());
    // Close all on a read-only tab works as for one tab
    P = await page({ ro: ['b', 'c'] }); P.menuOn('a'); await P.pick('all');
    ok(P.IDE.docs.length === 0 && !P.card(), 'tabs T3: read-only tabs close with the rest, no question', P.names());
    ok(P.writes().length === 0, 'tabs T3: nothing written by closing');
  }

  // ---- T4. selection: Ctrl+click, Shift+click, visible, cleared by a plain click and Esc; the menu offers Close the N selected tabs
  {
    let P = await page();
    P.tab('a').fire('click', { ctrlKey: true });
    ok(P.IDE.tabs.sel().length === 2 && cl(P.tab('a'), 'ide-tsel') && cl(P.tab('e'), 'ide-tsel') && P.actName() === 'e', 'tabs T4: Ctrl+click a: a and the shown e are selected, e stays shown', P.IDE.tabs.sel().join());
    ok(P.tab('a').all().some(e => cl(e, 'ide-tsm')) && P.tab('a').getAttribute('aria-description') === EN['ide.ts.selD'], 'tabs T4: a selected tab has a check mark and says Selected to a screen reader');
    P.tab('a').fire('click', { ctrlKey: true });
    ok(P.IDE.tabs.sel().length === 1 && !cl(P.tab('a'), 'ide-tsel'), 'tabs T4: Ctrl+click again takes it out', P.IDE.tabs.sel().join());
    P.tab('a').fire('click', { ctrlKey: true }); P.tab('c').fire('click', { shiftKey: true });
    ok(P.IDE.tabs.sel().map(id => P.IDE.docs.find(d => d.id === id).base[0]).join('') === 'abc', 'tabs T4: Shift+click c after a selects the range a..c', P.IDE.tabs.sel().join());
    P.tab('d').fire('click', {});
    ok(P.IDE.tabs.sel().length === 0 && !P.tabs().some(t => cl(t, 'ide-tsel')) && P.actName() === 'd', 'tabs T4: a plain click clears the selection and shows the tab');
    P.tab('a').fire('click', { ctrlKey: true }); P.doc.key('Escape');
    ok(P.IDE.tabs.sel().length === 0, 'tabs T4: Esc clears the selection');
    // keyboard: Ctrl+Space, Shift+Right
    P.tab('b').focus(); P.tab('b').fire('keydown', { key: ' ', ctrlKey: true });
    ok(P.IDE.tabs.sel().length === 2 && cl(P.tab('b'), 'ide-tsel'), 'tabs T4: Ctrl+Space on a tab selects it (with the shown tab)', P.IDE.tabs.sel().join());
    P.tab('b').fire('keydown', { key: 'ArrowRight', shiftKey: true });
    ok(['b', 'c'].every(n => cl(P.tab(n), 'ide-tsel')) && P.IDE.tabs.sel().length === 2, 'tabs T4: Shift+Right extends the selection from b to c', P.IDE.tabs.sel().join());
    P.doc.key('Escape');
    // menu with a selection
    P = await page();
    P.tab('a').fire('click', { ctrlKey: true }); P.tab('b').fire('click', { ctrlKey: true }); P.tab('e').fire('click', { ctrlKey: true });
    ok(P.IDE.tabs.sel().length === 2, 'tabs T4: (a, b selected; e taken out)', P.IDE.tabs.sel().join());
    P.menuOn('b');
    ok(P.rows()[0].dataset.tclose === 'sel' && P.rows()[0].textContent.indexOf(fill('ide.ts.m.sel', { n: 2 })) === 0, 'tabs T4: the menu offers "Close the 2 selected tabs" first', P.rows()[0].textContent);
    ok(!P.off(P.B('tb.file').querySelector('button[data-act=closeSel]')) || P.IDE.actions.closeSel.when(), 'tabs T4: File menu Close the selected tabs can run');
    await P.pick('sel');
    ok(P.names() === 'cde' && P.actName() === 'e' && P.IDE.tabs.sel().length === 0, 'tabs T4: the selected tabs close; the menu tab b went, the shown e stays shown', P.names() + ' ' + P.actName());
    // the shown tab among the selected ones: the nearest one to the menu tab is shown
    P = await page();
    P.tab('d').fire('click', { ctrlKey: true });
    P.menuOn('e'); await P.pick('sel');
    ok(P.names() === 'abc' && P.actName() === 'c', 'tabs T4: selected d and the shown e close: the nearest left (c) is shown', P.names() + ' ' + P.actName());
  }

  // ---- T5. the unsaved changes card: Cancel, Esc, Close without saving, Save all and close (one conflict)
  {
    let P = await page(); await P.edit('b'); await P.edit('d');
    P.menuOn('c'); await P.pick('all');
    const c = P.card();
    ok(!!c && P.names() === 'abcde', 'tabs T5: unsaved tabs in the batch: one card, nothing closed yet', P.names());
    ok(!!c && /b\.set/.test(c.textContent) && /d\.set/.test(c.textContent) && !/a\.set/.test(c.textContent.replace(EN['ide.ts.others'], '')) , 'tabs T5: the card lists the unsaved files only', c && c.textContent);
    ok(!!P.cardBtn('ide.ts.saveClose') && !!P.cardBtn('ide.ts.drop') && !!P.cardBtn('ide.cancel'), 'tabs T5: Save all and close, Close without saving, Cancel');
    ok(c.textContent.indexOf(fill('ide.ts.others', { n: 3 })) >= 0, 'tabs T5: the card says the 3 saved tabs close too');
    ok(P.act() === P.cardBtn('ide.ts.saveClose'), 'tabs T5: focus on Save all and close');
    P.cardBtn('ide.cancel').click(); await P.flush();
    ok(P.names() === 'abcde' && !P.card() && P.IDE.isDirty(P.doc_('b')) && P.saves.length === 0, 'tabs T5: Cancel closes nothing, writes nothing, the changes stay', P.names());
    P.IDE.run('closeAll'); await P.flush(); ok(!!P.card(), 'tabs T5: (card again)');
    P.doc.key('Escape'); await P.flush();
    ok(P.names() === 'abcde' && !P.card(), 'tabs T5: Esc is Cancel', P.names());
    P.IDE.run('closeAll'); await P.flush();
    P.cardBtn('ide.ts.drop').click(); await P.flush();
    ok(P.IDE.docs.length === 0 && P.saves.length === 0 && P.writes().length === 0, 'tabs T5: Close without saving closes all, writes nothing', P.names());
    // Save all and close: both written through files/save (write:true, base hash), then all close
    P = await page(); await P.edit('b'); await P.edit('d');
    const pr = P.IDE.tabs.close('all', P.doc_('c'));
    P.cardBtn('ide.ts.saveClose').click(); await P.flush(); await P.flush();
    const r = await pr;
    ok(r === true && P.IDE.docs.length === 0, 'tabs T5: Save all and close: all tabs closed', P.names());
    ok(P.saves.length === 2 && P.saves.every(s => s.write === true && !!s.base && /^\/\/x /.test(s.text)) && P.saves.map(s => s.rel).join() === REL('b') + ',' + REL('d'), 'tabs T5: Save all wrote each unsaved file once through files/save, with its edit', JSON.stringify(P.saves.map(s => [s.rel, s.write])));
    ok(P.said.indexOf(fill('ide.ts.savedClosed', { s: 2, n: 5 })) >= 0, 'tabs T5: the status says saved 2, closed 5', P.said.join('|'));
    // one file changed on disk (409): it stays open with the reason, the rest close; the tab shown is the menu tab if it stays
    P = await page({ save: b => (b.rel === REL('d') ? Object.assign(new Error('changed on disk'), { status: 409 }) : { written: true, hash: 'hx', restorePoint: 'r' }) });
    await P.edit('b'); await P.edit('d');
    P.menuOn('c'); await P.pick('all');
    P.cardBtn('ide.ts.saveClose').click(); await P.flush(); await P.flush();
    ok(P.names() === 'd' && P.actName() === 'd' && P.IDE.isDirty(P.doc_('d')) && P.doc_('d').conflict === true, 'tabs T5: a file that could not be saved stays open, unsaved, with the conflict bar', P.names());
    ok(P.said.some(t => t === fill('ide.ts.someKept', { n: 4, k: 1, m: 'd.set: ' + EN['ide.ts.conflict'] })), 'tabs T5: the status names the file kept and why', P.said.join('|'));
    // only some of the batch: Close others with an unsaved tab among them, the menu tab stays shown
    P = await page(); await P.edit('a');
    P.menuOn('c'); await P.pick('others'); ok(!!P.card() && P.card().textContent.indexOf('a.set') >= 0, 'tabs T5: Close others asks about the unsaved a');
    P.cardBtn('ide.ts.drop').click(); await P.flush();
    ok(P.names() === 'c' && P.actName() === 'c', 'tabs T5: after the answer the menu tab c is shown', P.names() + ' ' + P.actName());
  }

  // ---- T6. phone (LAN Remote): closing works, the card has no Save button
  {
    const P = await page({ remote: true });
    if (P.IDE.docs.length !== 5) env.skip('tabs T6: phone view', 'the phone page did not open the files (' + P.IDE.docs.length + ')');
    else {
      ok(!!P.IDE.actions.closeAll && !!P.IDE.actions.closeOthers, 'tabs T6: a phone keeps the close actions (view state only)');
      await P.edit('b');
      ok(P.IDE.isDirty(P.doc_('b')), 'tabs T6: (b has unsaved text on the phone)');
      {
        P.IDE.run('closeAll'); await P.flush();
        ok(!!P.card() && !P.cardBtn('ide.ts.saveClose') && !!P.cardBtn('ide.ts.drop'), 'tabs T6: on a phone the card has no Save all');
        P.cardBtn('ide.cancel').click(); await P.flush();
      }
      P.IDE.run('closeAll'); await P.flush(); if (P.card()) { P.cardBtn('ide.ts.drop').click(); await P.flush(); }
      ok(P.IDE.docs.length === 0 && P.writes().length === 0, 'tabs T6: a phone closes all, writes nothing');
    }
  }

  // ---- T7. history: Back after a batch close reopens a closed tab (as after a single close)
  {
    const P = await page();
    await P.IDE.open({ rel: REL('a') }, 1, 1); await P.flush();
    await P.IDE.open({ rel: REL('c') }, 1, 1); await P.flush();
    const before = P.IDE.hist.list().length;
    P.menuOn('c'); await P.pick('others');
    ok(P.IDE.hist.list().length === before, 'tabs T7: a batch close leaves the history as a single close does');
    await P.IDE.hist.back(); await P.flush();
    ok(P.actName() === 'a' && P.names().indexOf('a') >= 0, 'tabs T7: Back opens the closed tab again', P.names() + ' ' + P.actName());
  }

  // ---- T8. strings in four languages; the F2 key list names the tab keys
  {
    const keys = ['ide.a.closeSel', 'ide.a.closeTab', 'ide.a.closeOthers', 'ide.a.closeRight', 'ide.a.closeLeft', 'ide.a.closeSaved', 'ide.a.closeAll'];
    const all = keys.concat(keys.map(k => k + 'T'), ['ide.ts.menu', 'ide.ts.m.sel', 'ide.ts.m.one', 'ide.ts.m.others', 'ide.ts.m.right', 'ide.ts.m.left', 'ide.ts.m.saved', 'ide.ts.m.all',
      'ide.ts.selD', 'ide.ts.selN', 'ide.ts.selNone', 'ide.ts.nothing', 'ide.ts.closed', 'ide.ts.h', 'ide.ts.lead', 'ide.ts.others', 'ide.ts.cantSave', 'ide.ts.saveClose', 'ide.ts.saveCloseT',
      'ide.ts.drop', 'ide.ts.dropT', 'ide.ts.cancelT', 'ide.ts.saving', 'ide.ts.kept', 'ide.ts.savedOnly', 'ide.ts.savedClosed', 'ide.ts.someKept', 'ide.ts.conflict', 'ide.ts.busy',
      'ide.keys.tmenu', 'ide.keys.tsel', 'ide.keys.tselK', 'ide.keys.k.rclick', 'ide.keys.k.click']);
    const by = {}; for (const r of ROWS) { if (by[r[0]]) ok(false, 'tabs T8: key twice in lang/core.js: ' + r[0]); by[r[0]] = r; }
    const miss = all.filter(k => !by[k] || by[k].length !== 5 || by[k].slice(1).some(s => typeof s !== 'string' || !s.trim()));
    ok(!miss.length, 'tabs T8: every new string exists in en, ru, uk, zh', miss.join());
    const slots = all.filter(k => by[k] && by[k].slice(2).some(s => (s.match(/\{\w+\}/g) || []).sort().join() !== (by[k][1].match(/\{\w+\}/g) || []).sort().join()));
    ok(!slots.length, 'tabs T8: every language keeps the same {slots}', slots.join());
    const used = new Set((require('./ui/core').script.match(/'ide\.ts\.[\w.]+'/g) || []).map(s => s.slice(1, -1)));
    const unk = [...used].filter(k => !by[k] && !/\.$/.test(k));
    ok(!unk.length, 'tabs T8: every ide.ts key the page uses has a row', unk.join());
    const P = await page(); P.IDE.run('keys'); await P.flush();
    const kt = P.ov().textContent, kbd = P.ov().all().filter(e => e.tagName === 'KBD').map(e => e.textContent);
    ok(kbd.length === new Set(kbd).size, 'tabs T8: F2: no key shown twice', kbd.join('|'));
    ok(kt.indexOf('Shift+Alt+W') >= 0 && kt.indexOf(EN['ide.keys.tsel']) >= 0 && kt.indexOf(EN['ide.keys.tmenu']) >= 0, 'tabs T8: F2 lists Shift+Alt+W and the tab keys');
    P.IDE.closeOverlay(); P.menuOn('c');
    const probs = P.check();
    P.IDE.closeMenus();
    ok(Array.isArray(probs) && probs.length === 0, 'tabs T8: the Editor screen still passes blockcheck', JSON.stringify(probs));
  }
};
