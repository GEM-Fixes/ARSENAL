// Code Pieces page cases (design 12.2, cases 16 to 24): the whole page in the fake DOM with the fake editor
// (env.boot, env.fakeEd from test.js). Run by tools/gui/ext/ide/test.js (hook at its end): module.exports = async function(env){}.
// Author: Imperator_Aug (ARSENAL, ia-ec35bc9b)
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const IA = 'resource/set/interaction_entity/mine.inc', IA2 = 'resource/set/interaction_entity/other.inc';
  const BLOCK = ['{"my_unit"', '\t', '}'].join('\n');                                  // line 2: blank, inside the block
  const HANDLER = ['{"my_unit"', '\t{on spawn', '\t\t', '\t}', '}'].join('\n');       // line 3: inside a reaction
  const DUP = ['{"my_unit"', '\t{on spawn', '\t\t{tags add "x"}', '\t}', '\t', '}'].join('\n');   // line 5: in the block, spawn taken
  const LS0 = { 'ide.kit.open': true, 'ide.kit.seen': true };
  const EN = {}; for (const r of require('./lang/kit')) EN[r[0]] = r[1];
  const fill = (k, p) => String(EN[k] || k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));
  const cl = (e, c) => !!(e && e.className && (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0);

  // the fake editor, made closer to the cm code where the kit depends on it: an applyEdits change (origin 'ide') is never refused by
  // a field's characters, and an edit outside every field ends the session with 'edit' right after it is applied (editor.src.js
  // beforeChange / change). The cm applyEdits is all or nothing: a change another filter cancels gives false and the old text
  // (a case below sets that up)
  const inF = (e, f) => e.col > 0 && e.line === f.line && e.col >= f.col && (e.endCol == null ? e.col : e.endCol) <= f.col + f.len;
  function edFake() {
    const F = env.fakeEd(), mk = F.create;
    F.create = function (host, opts) {
      const ed = mk.call(F, host, opts), ap = ed.applyEdits;
      ed.applyEdits = function (edits) {
        const s = ed.inSession() ? ed.sessions.filter(x => !x.ended).pop() : null;
        const r = ap.call(this, edits);
        if (r && s && ed.inSession() && (edits || []).some(e => !s.fields.some(f => inF(e, f)))) ed.endSession('edit');
        return r;
      };
      return ed;
    };
    return F;
  }

  async function page(o) {
    o = o || {};
    const files = o.files || { [IA]: BLOCK };
    const P = await boot(Object.assign({ ed: edFake() }, o, { files, ls: Object.assign({}, o.fresh ? {} : LS0, o.ls || {}) }));
    P.K = () => P.B('kit');
    P.row = id => P.K() && P.K().all().find(e => e.dataset && e.dataset.piece === id) || null;
    P.rows = () => (P.K() ? P.K().all().filter(e => cl(e, 'idk-row')).map(e => e.dataset.piece) : []);
    P.find = async text => { const q = P.K().querySelector('input.idk-q'); q.value = text; q.fire('input'); await P.flush(); };
    // the status line fades on a timer (flush runs every timer): keep what was said
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    P.msg = () => P.said.length ? P.said[P.said.length - 1] : '';
    P.nextBtns = () => { const n = P.sec.all().find(e => cl(e, 'ide-next')); return n && !n.hidden ? n.all().filter(e => e.tagName === 'BUTTON') : []; };
    P.edits = () => P.ed().calls('applyEdits');
    P.at = async (line, col) => { P.ed().goto(line, col || 1); await P.flush(); };
    // the boxes the pane opens (IDE.pick: Alt+Insert, the row menu) and the links it follows, kept instead of shown
    P.picks = []; const pk = P.IDE.pick; P.IDE.pick = (title, items, opt) => { P.picks.push({ title, items, opt }); return pk(title, items, opt); };
    P.gone = []; P.IDE.go = l => { P.gone.push(l); return Promise.resolve(null); };
    P.q = () => P.K().querySelector('input.idk-q');
    P.pv = () => P.K().all().find(e => cl(e, 'idk-pv'));
    P.ghost = () => P.doc.body.all().find(e => cl(e, 'idk-ghost')) || null;
    P.secRow = id => P.K().all().find(e => cl(e, 'idk-sec') && e.dataset.sec === id) || null;
    // a row by piece id through the search box (its title)
    P.get = async id => { await P.find(BY[id] ? BY[id].title : id); return P.row(id); };
    return P;
  }
  const ALL = await env.kit('ia-entity', 'en'), BY = {}; ALL.pieces.forEach(p => { BY[p.id] = p; });

  // ---- 16. a leaf block `kit` after `centre`, blockcheck clean; on a phone (LAN Remote) no column, no part, no kit action
  {
    const P = await page();
    const K = P.K();
    ok(!!K && !K.all().some(P.isB), 'kit 16: the Code Pieces column is a leaf block kit');
    ok(!!K && /centre,kit$/.test(P.kids(K.parentNode)), 'kit 16: block kit comes after centre', K && P.kids(K.parentNode));
    const probs = P.check();
    ok(Array.isArray(probs) && probs.length === 0, 'kit 16: the Editor screen with the kit column passes blockcheck', JSON.stringify(probs).slice(0, 400));
    ok(!!P.IDE.actions.kitShow && P.IDE.actions.kitShow.key === 'Alt+K' && !!P.IDE.actions.kitAdd && P.IDE.actions.kitAdd.key === 'Alt+Insert', 'kit 16: actions kitShow (Alt+K) and kitAdd (Alt+Insert) on the PC');
    const R = await page({ remote: true });
    const kitActs = Object.keys(R.IDE.actions || {}).filter(k => /^kit/.test(k));
    ok(!R.K() && !R.IDE.parts.kit && !kitActs.length, 'kit 16: phone view: no kit block, no kit part, no kit* action', kitActs.join());
  }

  // ---- 17. click inserts (one applyEdits, status, nothing written); Enter starts a field session; Shift+Enter inserts without one
  {
    const P = await page();
    const d = await P.open(IA, 2, 1); await P.flush();
    ok(P.rows().length > 0 && P.rows().indexOf('b.start.inflammation') >= 0, 'kit 17: the tree lists pieces for an interaction file (Getting started open)', P.rows().length);
    const fitTxt = P.K().all().find(e => cl(e, 'idk-fitn'));
    ok(!!fitTxt && /fit here/.test(fitTxt.textContent), 'kit 17: the fit count shows for the cursor scope', fitTxt && fitTxt.textContent);
    await P.find('When it appears');
    const r = P.row('b.event.spawn');
    ok(!!r && !cl(r, 'idk-dim'), 'kit 17: "When it appears" is found and fits in the block');
    r.click(); await P.flush();
    const e1 = P.edits();
    ok(e1.length === 1 && P.ed().doc().lines.some(l => /^\t\{on spawn$/.test(l)), 'kit 17: click: one applyEdits, the reaction in the block', JSON.stringify(e1) + ' ' + P.ed().doc().lines.join('|'));
    ok(P.msg().indexOf(fill('ide.kit.added')) === 0, 'kit 17: status says the piece was added', P.msg());
    ok(P.writes().length === 0, 'kit 17: nothing written to disk, no POST to the kit route');
    ok(P.ed().undoDepth() === 1, 'kit 17: one undo step');
    P.ed().undo(); await P.flush(); await P.at(2, 1);
    await P.find('');
    const inf = P.row('b.start.inflammation');
    inf.fire('keydown', { key: 'Enter' }); await P.flush();
    const s = P.ed().sessions;
    ok(P.edits().length === 2 && s.length === 1 && s[0].fields.length === 1 && s[0].fields[0].k === 'seconds', 'kit 17: Enter inserts and starts a field session', JSON.stringify(s.map(x => x.fields)));
    const f = s[0] && s[0].fields[0];
    ok(f && f.label === 'Seconds' && typeof f.deny === 'string' && f.deny.indexOf('a') >= 0 && f.deny.indexOf('5') < 0 && typeof s[0].opts.onEnd === 'function',
      'kit 17: the field carries its label, the characters it refuses and the end hook', f && JSON.stringify(f));
    ok(s[0].opts.next === fill('ide.kit.f.next') && s[0].opts.done === fill('ide.kit.f.done') && s[0].opts.denied === EN['ide.kit.f.deny'], 'kit 17: session words translated, {ch} left for the editor');
    P.ed().undo(); await P.flush(); await P.at(2, 1);
    const inf2 = P.row('b.start.inflammation');
    inf2.fire('keydown', { key: 'Enter', shiftKey: true }); await P.flush();
    ok(P.edits().length === 3 && P.ed().calls('fieldSession').length === 1 && P.ed().doc().lines.some(l => /inflammation_time 10/.test(l)), 'kit 17: Shift+Enter inserts the defaults without a session');
    ok(d.ver >= 3, 'kit 17: the doc version moved with each edit', d.ver);
  }

  // field tests per kind (the session's test functions, taken from the live call: the log copy drops functions)
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    const ed = P.ed(); let got = null; const fsOrig = ed.fieldSession;
    ed.fieldSession = function (fields, caret, so) { got = fields; return fsOrig.call(this, fields, caret, so); };
    P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush();
    const t = got && got[0] && got[0].test;
    ok(typeof t === 'function' && t('abc') === fill('ide.kit.f.bad.min', { min: 0 }) && t('-1') !== '' && t('12') === '' && t('2.5') === '', 'kit 17: seconds field test: a number of 0 or more', t && [t('abc'), t('-1'), t('12')].join('|'));
  }

  // after-insert check: new problems -> the count and a flash over the new lines; none -> Save and How to try it as next steps
  {
    const lint = body => ({ findings: /{on spawn/.test(String(body && body.text || '')) ? [{ line: 2, col: 2, code: 'X1', msg: 'bad', sev: 'error' }] : [], fixes: [], multi: [], ms: 0 });
    const P = await page({ lint });
    await P.open(IA, 2, 1); await P.flush(); await P.find('appears');
    P.row('b.event.spawn').click(); await P.flush(); await P.flush();
    ok(P.said.indexOf(fill('ide.kit.probs.1', { n: 1 })) >= 0 && P.ed().flashes.length === 1 && P.ed().flashes[0][0] === 2, 'kit after-check: one new problem is counted and the new lines flash', P.said.join(' / ') + ' ' + JSON.stringify(P.ed().flashes));
    const Q = await page();
    await Q.open(IA, 2, 1); await Q.flush(); await Q.find('appears');
    Q.row('b.event.spawn').click(); await Q.flush(); await Q.flush();
    const nb = Q.nextBtns().map(b => b.textContent);
    ok(nb[0] === 'Save' && nb.indexOf(fill('ide.kit.tryIt')) > 0 && !Q.ed().flashes.length, 'kit after-check: no new problem: Save and How to try it in game', nb.join('|'));
  }

  // ---- 18. read-only: why layer -> refusal and a Copy into my mod button; why lonecr -> refusal, no button; nothing inserted
  {
    for (const [why, button] of [['layer', true], ['lonecr', false]]) {
      const P = await page({ files: { [IA]: { text: BLOCK, editable: false, why } } });
      const d = await P.open(IA, 2, 1); await P.flush();
      ok(d && d.editable === false && d.why === why, 'kit 18: ' + why + ' doc opens read-only', d && d.why);
      const r = P.row('b.start.inflammation'); r.click(); await P.flush();
      const ro = P.IDE.roWhy(d);
      ok(P.edits().length === 0 && P.msg() === fill('ide.kit.x.ro', { why: ro }), 'kit 18: ' + why + ': nothing inserted, the reason in the status', P.msg());
      const btn = P.nextBtns().find(b => b.textContent === fill('ide.kit.copyIn'));
      ok(!!btn === button, 'kit 18: ' + why + (button ? ': a Copy into my mod button' : ': no copy-in button'), P.nextBtns().map(b => b.textContent).join('|'));
    }
  }

  // ---- 19. pointer drag: past 6 px, over the text the marker is ok, the drop inserts once; Esc: none; Arrange on: no drag;
  //          a box over the text: marker no, no insert
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush(); await P.find('appears');
    const doc = P.doc, ed = P.ed();
    const drag = async (id, line, end) => {
      const r = P.row(id);
      r.fire('pointerdown', { clientX: 900, clientY: 100, button: 0, pointerType: 'mouse', pointerId: 1 });
      doc.fire('pointermove', { clientX: 903, clientY: 101 }); await P.flush();
      const early = !!doc.body.all().find(e => cl(e, 'idk-ghost'));
      doc.fire('pointermove', { clientX: 920, clientY: 110 });
      const pt = ed.pointAt(line, 'upper');
      doc.fire('pointermove', { clientX: pt.x, clientY: pt.y }); await P.flush();
      const mid = { gap: ed.gap && Object.assign({}, ed.gap), ghost: doc.body.all().find(e => cl(e, 'idk-ghost')) || null, early };
      if (end === 'esc') doc.key('Escape');
      const said = P.said.length;
      doc.fire('pointerup', { clientX: pt.x, clientY: pt.y });
      r.click();   // the click a browser sends right after the release (the row holds the pointer capture) is eaten
      mid.said = P.said.slice(said);
      await P.flush();
      return mid;
    };
    const m1 = await drag('b.event.spawn', 2);
    ok(!m1.early && !!m1.ghost && m1.gap && m1.gap.gap === 2 && m1.gap.state === 'ok', 'kit 19: no drag under 6 px; then a ghost and the gap marker ok at line 2', JSON.stringify(m1.gap));
    ok(m1.ghost && /^Line 2: inside a unit or object block$/.test(m1.ghost.all().find(e => cl(e, 'idk-gl')).textContent), 'kit 19: the ghost says where it goes', m1.ghost && m1.ghost.textContent);
    ok(P.edits().length === 1 && !ed.gap && !doc.body.all().some(e => cl(e, 'idk-ghost')), 'kit 19: the drop inserts once, marker and ghost gone, the trailing click adds nothing', P.edits().length);
    ok(m1.said.length === 1 && m1.said[0].indexOf(fill('ide.kit.added')) === 0, 'kit 19: the drop says added once; the trailing click says nothing', m1.said.join(' / '));
    ed.undo(); await P.flush();
    const m2 = await drag('b.event.spawn', 2, 'esc');
    ok(m2.gap && m2.gap.state === 'ok' && P.edits().length === 1 && !ed.gap && P.msg() === fill('ide.kit.notAdded'), 'kit 19: Esc during a drag: nothing inserted, status Not added', P.msg());
    const on = P.bx.as2Blocks.on; P.bx.as2Blocks.on = () => true;
    const nGap = ed.calls('gapMarker').length;
    const r = P.row('b.event.spawn');
    r.fire('pointerdown', { clientX: 900, clientY: 100, button: 0, pointerType: 'mouse', pointerId: 2 });
    doc.fire('pointermove', { clientX: 40, clientY: 25 }); await P.flush(); doc.fire('pointerup', { clientX: 40, clientY: 25 }); await P.flush();
    P.bx.as2Blocks.on = on;
    ok(ed.calls('gapMarker').length === nGap && !doc.body.all().some(e => cl(e, 'idk-ghost')), 'kit 19: Arrange on: no drag starts');
    P.IDE.pick('box', [{ label: 'a', run() {} }]); await P.flush();
    ok(P.IDE.ovOpen(), 'kit 19: a box is open over the text');
    const nEd = P.edits().length;
    const m3 = await drag('b.event.spawn', 2);
    ok(m3.gap && m3.gap.state === 'no' && P.edits().length === nEd && P.msg() === fill('ide.kit.x.cover'), 'kit 19: a box over the text: marker no, no insert, status says close it', JSON.stringify(m3.gap) + ' ' + P.msg());
    P.IDE.closeOverlay();
    // a drop where the piece does not fit: marker no, the reason and the nearest line as next step
    await P.open(IA, 2, 1); await P.find('handler');
    const m4 = await drag('b.start.inherited', 2);
    ok(m4.gap && m4.gap.state === 'no' && P.edits().length === nEd && /^This piece goes inside a reaction\./.test(P.msg()), 'kit 19: a drop outside the piece\'s scope: marker no, reason in the status', P.msg());
  }

  // ---- 20. duplicate reaction: refusal, no edit, a Go to button that calls IDE.go
  {
    const P = await page({ files: { [IA]: DUP } });
    await P.open(IA, 5, 1); await P.flush();
    await P.find('When it appears');
    P.row('b.event.spawn').click(); await P.flush();
    ok(P.edits().length === 0 && P.msg() === fill('ide.kit.x.dup', { ev: 'spawn' }), 'kit 20: a second {on spawn in the block is refused', P.msg());
    const gone = []; const go = P.IDE.go; P.IDE.go = l => { gone.push(l); return Promise.resolve(null); };
    const b = P.nextBtns().find(x => x.textContent === fill('ide.kit.x.goThere'));
    if (b) b.click();
    P.IDE.go = go;
    ok(!!b && gone.length === 1 && gone[0] === 'ide:' + IA + ':2', 'kit 20: Go to the existing reaction calls IDE.go with its line', gone.join());
  }

  // ---- 21. stale: the doc changed while planning, or another tab became active: the old plan is not applied
  {
    const P = await page({ files: { [IA]: BLOCK, [IA2]: BLOCK } });
    const d = await P.open(IA, 2, 1); await P.flush();
    const ed = P.ed(), line = ed.line;
    ed.line = function (n) { d.ver = (d.ver || 0) + 1; return line.call(this, n); };
    P.row('b.start.inflammation').click(); await P.flush();
    ed.line = line;
    ok(P.edits().length === 0 && P.msg() === fill('ide.kit.x.stale'), 'kit 21: version moved during the plan: no applyEdits, status says drop again', P.msg());
    const other = await P.open(IA2, 2, 1); await P.open(IA, 2, 1);
    const act = P.IDE.active;
    ed.line = function (n) { P.IDE.active = () => other; return line.call(this, n); };
    P.row('b.start.inflammation').click(); await P.flush();
    ed.line = line; P.IDE.active = act;
    ok(P.edits().length === 0 && P.msg() === fill('ide.kit.x.stale'), 'kit 21: another tab active during the plan: no applyEdits', P.msg());
  }

  // ---- 22. the field session ends with the doc: reload (setText), tab switch (swap), undo, closed
  {
    const P = await page({ files: { [IA]: BLOCK, [IA2]: BLOCK } });
    const d = await P.open(IA, 2, 1); await P.flush();
    const ed = P.ed();
    const start = async () => { await P.open(IA, 2, 1); await P.at(2, 1); P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush(); return ed.sessions[ed.sessions.length - 1]; };
    let s = await start(); ed.setText(d.id, BLOCK); await P.flush();
    ok(s && s.ended === 'reload' && s.ends === 1, 'kit 22: reload ends the session once', s && s.ended);
    s = await start(); await P.open(IA2, 1, 1);
    ok(s && s.ended === 'swap' && s.ends === 1, 'kit 22: another tab ends the session', s && s.ended);
    s = await start(); ed.undo(); await P.flush();
    ok(s && s.ended === 'undo' && s.ends === 1, 'kit 22: undo ends the session', s && s.ended);
    s = await start(); P.IDE.emit('closed', { doc: d }); await P.flush();
    ok(s && s.ended === 'closed' && s.ends === 1, 'kit 22: the doc closed: the pane calls end()', s && s.ended);
    s = await start(); const n = ed.sessions.length; await start();
    // the pane ends it ('lost') before its applyEdits; ended by the edit itself it would say 'edit'
    ok(ed.sessions.length === n + 1 && s.ends === 1 && s.ended === 'lost', 'kit 22: a new insert ends the running session once, before its edit', s.ended);
    s = await start(); P.IDE.emit('mod', { mod: 'C:/g/mods/other' }); await P.flush();
    ok(s && s.ended === 'mod' && s.ends === 1, 'kit 22: a mod change ends the session', s && s.ended);
  }

  // ---- 23. search ranking, zh 'delay', favourites and used lately in LS only, loading and error rows, Retry
  {
    const P = await page({ files: { [IA]: BLOCK, [IA2]: HANDLER } });
    await P.open(IA, 2, 1); await P.flush();
    await P.find('handler');
    let r = P.rows(), a = r.indexOf('b.start.overload'), b = r.indexOf('b.start.inherited');
    ok(a >= 0 && b >= 0 && a < b, 'kit 23: in a block, the fitting "Replace the game\'s handler" ranks above "Run the game\'s handler too"', r.slice(0, 8).join());
    await P.open(IA2, 3, 1); await P.flush(); await P.find('handler');
    r = P.rows(); a = r.indexOf('b.start.overload'); b = r.indexOf('b.start.inherited');
    ok(a >= 0 && b >= 0 && b < a, 'kit 23: inside a reaction the order turns', r.slice(0, 8).join());
    await P.find('no-such-piece-word');
    ok(P.rows().length === 0 && P.K().has(fill('ide.kit.none')), 'kit 23: no match: the hint row');
    // favourite and used lately: ids in LS, nothing written
    await P.find('When it appears');
    P.row('b.event.spawn').fire('focus'); await P.flush();
    const starB = P.K().all().find(e => e.tagName === 'BUTTON' && e.textContent === fill('ide.kit.star'));
    if (starB) starB.click(); await P.flush();
    ok(!!starB && JSON.stringify(P.ls('ide.kit.fav')) === '["b.event.spawn"]', 'kit 23: Add to favourites keeps the id in LS', JSON.stringify(P.ls('ide.kit.fav')));
    await P.open(IA, 2, 1); P.row('b.event.spawn').click(); await P.flush();
    ok(JSON.stringify(P.ls('ide.kit.recent')) === '["b.event.spawn"]' && P.writes().length === 0, 'kit 23: used lately in LS, nothing written', JSON.stringify(P.ls('ide.kit.recent')));
    await P.find('');
    const heads = P.K().all().filter(e => cl(e, 'idk-sec')).map(e => e.dataset.sec);
    ok(heads[0] === 'fav' && heads[1] === 'recent', 'kit 23: Favourites and Used lately head the tree', heads.slice(0, 3).join());
  }
  {
    const P = await page({ ls: { lang: 'zh' } });
    await P.open(IA, 2, 1); await P.flush();
    ok(P.bx.LANG === 'zh' || P.K().has('代码片段'), 'kit 23: page in Chinese');
    await P.find('delay');
    const zh = await env.kit('ia-entity', 'zh'), by = {}; zh.pieces.forEach(p => { by[p.id] = p; });
    const hits = P.rows().map(id => by[id]).filter(Boolean);
    ok(hits.length > 0 && hits.every(p => !/delay/i.test(p.title)) && hits.some(p => /delay/i.test(p.titleEn) || /delay/.test(JSON.stringify(p.parts))),
      'kit 23: zh: "delay" finds pieces through the English title or the code words', hits.slice(0, 4).map(p => p.id + ' ' + p.title).join(' | '));
  }
  {
    let mode = 'wait', gets = 0;
    // counted: the asks for the open file's kind (with no file open the pane asks once for kind none, for the kind names)
    const P = await page({ api: req => { if (req.path === '/api/x/ide/kit' && req.q.kind !== 'none') { gets++; if (mode === 'wait') return env.PENDING; if (mode === 'fail') return Object.assign(new Error('disk on fire'), { status: 500 }); } return undefined; } });
    await P.open(IA, 2, 1); await P.flush();
    ok(P.K().has(fill('ide.kit.loading')) && P.rows().length === 0 && gets === 1, 'kit 23: loading row while the route has not answered', gets);
    mode = 'fail';
    const P2 = await page({ api: req => { if (req.path === '/api/x/ide/kit' && req.q.kind !== 'none') { gets++; if (mode === 'fail') return Object.assign(new Error('disk on fire'), { status: 500 }); } return undefined; } });
    gets = 0;
    await P2.open(IA, 2, 1); await P2.flush();
    const retry = P2.K().all().find(e => e.tagName === 'BUTTON' && e.textContent === fill('ide.kit.retry'));
    ok(P2.K().has(fill('ide.kit.loadErr', { m: 'disk on fire' })) && !!retry && gets === 1, 'kit 23: error row with Retry', P2.K().textContent.slice(0, 200));
    mode = 'ok'; if (retry) retry.click(); await P2.flush();
    ok(gets === 2 && P2.rows().length > 0, 'kit 23: Retry asks again and the tree fills', gets);
  }

  // T pieces and the Advanced section only with Advanced on
  {
    const all = await env.kit('ia-entity', 'en'), by = {}; all.pieces.forEach(p => { by[p.id] = p; });
    const hidden = id => by[id] && (by[id].tag === 'T' || by[id].adv);
    const P = await page({ ls: { 'ide.kit.fold': { 'ia.adv': true } } });
    await P.open(IA, 2, 1); await P.flush(); await P.find('a');
    const offRows = P.rows(), offSecs = P.K().all().filter(e => cl(e, 'idk-sec')).map(e => e.dataset.sec);
    await P.find('');
    const offTree = P.K().all().filter(e => cl(e, 'idk-sec')).map(e => e.dataset.sec);
    const Q = await page({ ls: { adv: true, 'ide.kit.fold': { 'ia.adv': true } } });
    await Q.open(IA, 2, 1); await Q.flush(); await Q.find('a');
    const onRows = Q.rows(); await Q.find('');
    const onTree = Q.K().all().filter(e => cl(e, 'idk-sec')).map(e => e.dataset.sec);
    ok(offRows.length > 0 && !offRows.some(hidden) && offTree.indexOf('ia.adv') < 0 && !offSecs.length, 'kit adv: Advanced off: no T piece, no advanced piece, no Advanced section', offRows.filter(hidden).join());
    ok(onRows.some(hidden) && onTree.indexOf('ia.adv') >= 0, 'kit adv: Advanced on: they show', onTree.join());
  }

  // integration: the pane draws as soon as the Editor screen is up, before any file is open (the "open a file" line)
  {
    const P = await page();
    ok(P.K() && P.K().has(fill('ide.kit.noFile')), 'kit integ: with no file open the pane shows its open-a-file line', P.K() && P.K().textContent.slice(0, 200));
  }

  // integration: a typed change the editor has not sent yet (its 150 ms throttle) is sent before the plan, so the scope cache
  // (a checkpoint every 200 lines) never plans on lines that are gone
  {
    const big = ['{"my_unit"'].concat(new Array(448).fill('\t'), ['}']).join('\n');
    const P = await page({ files: { [IA]: big } });
    await P.open(IA, 300, 1); await P.flush(); await P.find('When it appears');
    ok(P.row('b.event.spawn') && !cl(P.row('b.event.spawn'), 'idk-dim'), 'kit integ: line 300 of a long block: the reaction fits');
    const n0 = P.edits().length;
    P.ed().userEdit([{ line: 1, col: 1, endCol: 11, text: '' }]);   // the block opener is gone; no timer has run yet
    P.row('b.event.spawn').click();
    ok(P.edits().length === n0 && /^This piece goes /.test(P.msg()), 'kit integ: an edit not yet sent is seen by the plan: refused at the top level', P.msg() + ' ' + P.ed().doc().lines.slice(298, 302).join('|'));
    await P.flush();
  }

  // integration: Ctrl+Z during the field session right after an insert: the after-insert check (which waits for the session) does not
  // report the problems of a piece that was taken out, nor flash its old lines, nor offer Save and How to try it
  {
    const lint = body => ({ findings: /inflammation_time/.test(String(body && body.text || '')) ? [{ line: 2, col: 2, code: 'X1', msg: 'bad', sev: 'error' }] : [], fixes: [], multi: [], ms: 0 });
    const P = await page({ lint });
    await P.open(IA, 2, 1); await P.flush();
    P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush(); await P.flush();
    const s = P.ed().sessions[0], said = P.said.length;
    ok(!!s && !s.ended && !P.ed().flashes.length, 'kit integ: the check waits while the field session runs', s && s.ended);
    P.ed().undo();
    const nb = []; for (let i = 0; i < 3; i++) { await P.flush(); P.nextBtns().forEach(b => nb.push(b.textContent)); }
    const after = P.said.slice(said);
    ok(s && s.ended === 'undo' && !after.some(t => /new problem/.test(t)) && !P.ed().flashes.length && nb.indexOf(fill('ide.kit.tryIt')) < 0,
      'kit integ: undo during the session: no new-problem count, no flash, no Save / How to try it', after.join(' / ') + ' ' + JSON.stringify(P.ed().flashes) + ' ' + nb.join('|'));
  }

  // ---- review fixes review): each case fails without its fix
  const W = k => fill('ide.kit.w.' + k);
  const dragTo = async (P, row, lines, o) => {   // press on a row (or its grip), move past 6 px, then over each line; returns the ghost texts
    o = o || {}; const doc = P.doc, ed = P.ed(), out = [];
    row.fire('pointerdown', Object.assign({ clientX: 900, clientY: 100, button: 0, pointerType: 'mouse', pointerId: 7 }, o.down || {}));
    doc.fire('pointermove', { clientX: 920, clientY: 110 }); await P.flush();
    for (const ln of lines) { const pt = ed.pointAt(ln, 'upper'); doc.fire('pointermove', { clientX: pt.x, clientY: pt.y }); await P.flush();
      const g = P.ghost(); out.push(g ? g.all().find(e => cl(e, 'idk-gl')).textContent : null); }
    return out;
  };
  const dropAt = async (P, row, line) => { const pt = P.ed().pointAt(line, 'upper'); P.doc.fire('pointerup', { clientX: pt.x, clientY: pt.y }); if (row) row.click(); await P.flush(); };

  // fit ranking at the gap a click uses: the cursor at the end of '{on spawn' ranks for the reaction, as a click then inserts there
  {
    const P = await page({ files: { [IA]: ['{"my_unit"', '\t{on spawn', '\t}', '}'].join('\n') } });
    await P.open(IA, 2, 11); await P.flush();
    const act = await P.get('b.act.link_sound');
    ok(!!act && !cl(act, 'idk-dim'), 'kit fit: cursor at the end of a reaction opener: an action piece is not dimmed', act && act.title);
    const ev = await P.get('b.event.spawn');
    ok(!!ev && cl(ev, 'idk-dim'), 'kit fit: and a reaction piece is dimmed (a click there refuses it)');
    act && (await P.get('b.act.link_sound')).click(); await P.flush();
    ok(P.edits().length === 1 && /^\t\t\{link_sound /.test(P.ed().doc().lines[2]), 'kit fit: the click puts the action inside the reaction', P.ed().doc().lines.join('|'));
    // Alt+Insert: the picker lists what fits here first, with the same reading of the cursor
    P.ed().undo(); await P.flush(); await P.at(2, 11);
    P.IDE.run('kitAdd'); await P.flush();
    const pk = P.picks[P.picks.length - 1], ids = pk ? pk.items.map(i => i.id) : [];
    const firstNo = ids.findIndex(id => BY[id] && BY[id].scope.indexOf('handler') < 0 && BY[id].scope.indexOf('top') < 0);
    ok(!!pk && ids.indexOf('b.act.link_sound') >= 0 && firstNo > ids.indexOf('b.act.link_sound') && ids.slice(0, firstNo).every(id => BY[id].scope.indexOf('handler') >= 0 || BY[id].scope.indexOf('top') >= 0),
      'kit pick: Alt+Insert lists the pieces that fit the reaction first', ids.slice(0, 5).join());
    ok(!ids.some(id => BY[id] && (BY[id].tag === 'T' || BY[id].adv)), 'kit pick: with Advanced off no T or advanced piece is offered');
    const fl = pk ? pk.opt.filter('link_sound', pk.items).map(i => i.id) : [];
    ok(fl.indexOf('b.act.link_sound') >= 0 && fl.indexOf('b.event.spawn') < 0, 'kit pick: its filter searches the pieces', fl.slice(0, 4).join());
    const it = pk && pk.items.find(i => i.id === 'b.act.link_sound');
    P.IDE.closeOverlay(); if (it) it.run(); await P.flush();   // the picker closes its box, then runs the item
    ok(P.edits().length === 2 && /^\t\t\{link_sound /.test(P.ed().doc().lines[2]), 'kit pick: choosing an item inserts it', P.ed().doc().lines.join('|'));
  }
  {
    const Q = await page({ ls: { adv: true } });
    await Q.open(IA, 2, 1); await Q.flush(); Q.IDE.run('kitAdd'); await Q.flush();
    const ids = Q.picks.length ? Q.picks[0].items.map(i => i.id) : [];
    ok(ids.some(id => BY[id] && BY[id].tag === 'T'), 'kit pick: with Advanced on the T pieces are offered');
    let rel = null; const R = await page({ api: req => (req.path === '/api/x/ide/kit' && req.q.kind === 'ia-entity' && !rel ? new Promise(r => { rel = () => r(undefined); }) : undefined) });
    await R.open(IA, 2, 1); await R.flush();
    R.IDE.run('kitAdd'); await R.flush();
    const n0 = R.picks.length, said = R.msg();
    if (rel) rel(); await R.flush(); await R.flush();
    ok(n0 === 0 && said === fill('ide.kit.loading') && R.picks.length === 1, 'kit pick: before the pieces are loaded it says so, then opens the picker', n0 + ' ' + said + ' ' + R.picks.length);
  }

  // Alt+K: opens and focuses the search, again goes back to the text and closes; hidden by Arrange: the note and its next step
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    P.doc.activeElement = P.doc.body;
    P.IDE.run('kitShow'); await P.flush();
    ok(P.IDE.kitCol() && P.doc.activeElement === P.q(), 'kit Alt+K: focuses the search box');
    P.IDE.run('kitShow'); await P.flush();
    ok(!P.IDE.kitCol(), 'kit Alt+K: again from inside the pane: closes it');
    P.IDE.run('kitShow'); await P.flush();
    ok(P.IDE.kitCol() && P.doc.activeElement === P.q(), 'kit Alt+K: on a closed pane: opens it and focuses the search');
    P.K().classList.add('blkoff'); P.doc.activeElement = P.doc.body;
    P.IDE.run('kitShow'); await P.flush();
    ok(P.msg() === fill('ide.kit.hidden') && P.nextBtns().some(b => b.textContent === fill('ide.kit.arrange')), 'kit Alt+K: hidden by Arrange: says so with the Arrange the page step', P.msg());
    P.K().classList.remove('blkoff');
  }

  // first visit: unset ide.kit.open, 1100 px or wider and an editable interaction file: the pane opens with its card; Got it
  {
    const P = await page({ fresh: true });
    ok(!P.IDE.kitCol(), 'kit first: closed before a file is open');
    await P.open(IA, 2, 1); await P.flush();
    const card = P.K().all().find(e => cl(e, 'idk-card')), got = card && card.all().find(e => cl(e, 'idk-got'));
    ok(P.IDE.kitCol() && !!card && !card.hidden && !!got, 'kit first: 1200 px: the pane opens by itself with the first-visit card');
    if (got) got.click(); await P.flush();
    ok(P.ls('ide.kit.seen') === true && card.hidden, 'kit first: Got it hides the card for good', P.ls('ide.kit.seen'));
    const N = await page({ fresh: true, width: 1000 });
    await N.open(IA, 2, 1); await N.flush();
    ok(!N.IDE.kitCol() && N.ls('ide.kit.open') === undefined, 'kit first: 1000 px: it stays closed');
  }

  // narrow window: the column starts hidden; a touch tap previews (no insert), Add here inserts and closes the drawer;
  // a finger on the grip drags
  {
    const P = await page({ width: 800 });
    ok(!P.IDE.kitCol(), 'kit narrow: below 900 px the drawer starts closed');
    P.IDE.kitCol(true); await P.open(IA, 2, 1); await P.flush();
    const r = await P.get('b.event.spawn');
    r.fire('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 700, clientY: 100, button: 0 });
    P.doc.fire('pointermove', { clientX: 700, clientY: 160 }); await P.flush();
    ok(!P.ghost(), 'kit touch: a finger on the row body starts no drag');
    P.doc.fire('pointerup', { clientX: 700, clientY: 160 }); r.click(); await P.flush();
    ok(P.edits().length === 0 && P.pv() && !P.pv().hidden && P.pv().has(BY['b.event.spawn'].title), 'kit touch: a tap previews and inserts nothing');
    const addB = P.pv().all().find(e => cl(e, 'idk-add'));
    if (addB) addB.click(); await P.flush();
    ok(P.edits().length === 1 && !P.IDE.kitCol(), 'kit touch: Add here inserts and closes the drawer', P.edits().length);
    P.ed().undo(); await P.flush(); P.IDE.kitCol(true); await P.at(2, 1);
    const r2 = await P.get('b.event.spawn'), grip = r2.all().find(e => cl(e, 'idk-grip'));
    const gl = await dragTo(P, r2, [2], { down: { pointerType: 'touch', target: grip } });
    await dropAt(P, r2, 2);
    ok(!!gl[0] && P.edits().length === 2, 'kit touch: a finger on the grip drags and drops the piece', gl.join() + ' ' + P.edits().length);
  }

  // the row menu and the preview with no game folder: no See the original in the menu, the preview button off
  {
    for (const game of [false, true]) {
      const P = await page({ game });
      await P.open(IA, 2, 1); await P.flush();
      const r = await P.get('b.act.set');
      r.fire('contextmenu'); await P.flush();
      const labels = P.picks.length ? P.picks[P.picks.length - 1].items.map(i => i.label) : [];
      ok(labels[0] === fill('ide.kit.add') && (labels.indexOf(fill('ide.kit.orig')) >= 0) === game, 'kit menu: game ' + game + ': See the original ' + (game ? 'listed' : 'left out'), labels.join('|'));
      P.IDE.closeOverlay(); r.fire('focus'); await P.flush();
      const ob = P.pv().all().find(e => cl(e, 'idk-orig'));
      ok(!!ob && ob.disabled === !game, 'kit menu: game ' + game + ': the preview button is ' + (game ? 'on' : 'off'));
    }
  }

  // refusals with their next step: x.unknown goes to the helper's line; x.scope "Add it at line {n} instead" adds it there
  {
    const P = await page({ files: { [IA]: ['{"my_unit"', '\t("my_helper_zz")', '\t', '}'].join('\n') } });
    await P.open(IA, 3, 1); await P.flush();
    (await P.get('b.event.spawn')).click(); await P.flush();
    ok(P.edits().length === 0 && P.msg() === fill('ide.kit.x.unknown', { name: 'my_helper_zz', ev: 'spawn' }), 'kit unknown: a block with an unknown helper: refused with the reason', P.msg());
    const b = P.nextBtns().find(x => x.textContent === fill('ide.kit.x.goLine', { n: 2 }));
    if (b) b.click();
    ok(!!b && P.gone[P.gone.length - 1] === 'ide:' + IA + ':2', 'kit unknown: Go to line 2 opens the helper line', P.gone.join());
    const Q = await page({ files: { [IA]: HANDLER } });
    await Q.open(IA, 3, 1); await Q.flush();
    (await Q.get('b.event.contact')).click(); await Q.flush();
    ok(Q.edits().length === 0 && Q.msg() === fill('ide.kit.x.scope', { where: W('block'), n: 2 }), 'kit near: a reaction inside a reaction: refused, with the nearest line', Q.msg());
    const nb = Q.nextBtns().find(x => x.textContent === fill('ide.kit.nearN', { n: 2 }));
    if (nb) nb.click(); await Q.flush();
    const L = Q.ed().doc().lines;
    ok(!!nb && Q.edits().length === 1 && L[1] === '\t{on contact' && L.indexOf('\t{on spawn') > 1, 'kit near: Add it at line 2 instead adds it at line 2', L.join('|'));
  }

  // what the insert says: the planner's warnings (a call nothing reacts to), added after the block, a file over 1 MB
  {
    const P = await page({ files: { [IA]: HANDLER } });
    await P.open(IA, 3, 1); await P.flush();
    (await P.get('b.act.call')).click(); await P.flush();
    ok(P.msg().indexOf(fill('ide.kit.w.call', { name: 'my_event' })) > 0, 'kit warn: the status carries the warning', P.msg());
    const Q = await page();
    await Q.open(IA, 2, 1); await Q.flush();
    (await Q.get('b.start.block')).click(); await Q.flush();
    ok(Q.msg().indexOf(fill('ide.kit.addedAfter', { n: 1 })) > 0, 'kit warn: a whole block clicked inside a block: added after it', Q.msg());
    const big = ['{"my_unit"', '\t'].concat(new Array(11000).fill('\t; ' + 'x'.repeat(96)), ['}']).join('\n');
    const B = await page({ files: { [IA]: big } });
    await B.open(IA, 2, 1); await B.flush();
    ok(B.K().has(fill('ide.kit.big')) && !B.edits().length, 'kit big: a file over 1 MB: the pane says checks are off before any piece is added', B.K().textContent.slice(0, 300));
    ok(!Q.K().has(fill('ide.kit.big')), 'kit big: a small file: no such note');
    (await B.get('b.event.spawn')).click(); await B.flush();
    ok(big.length > 1000000 && B.msg().indexOf(fill('ide.kit.big')) > 0, 'kit warn: a file over 1 MB: says checks are off', B.msg().slice(0, 200));
  }

  // the context warning is checked again when the field session ends, with the value typed: 'left' in a contact reaction
  {
    const F = ['{"my_unit"', '\t{on contact', '\t\t', '\t}', '}'].join('\n');
    const P = await page({ files: { [IA]: F } });
    await P.open(IA, 3, 1); await P.flush();
    (await P.get('b.if.hit_side')).fire('keydown', { key: 'Enter' }); await P.flush();
    const s = P.ed().sessions[0], f = s && s.fields[0];
    const noCtx = fill('ide.kit.w.noCtx', { what: EN['ide.kit.ctx.bullet'] });
    ok(!!f && f.name === 'side' && P.msg().indexOf(noCtx) < 0, 'kit recheck: front in a contact reaction: no warning at the insert', P.msg());
    P.ed().endSession('esc'); await P.flush();
    ok(P.said.every(t => t.indexOf(noCtx) < 0), 'kit recheck: ended with the default: still no warning');
    P.ed().undo(); await P.flush(); await P.at(3, 1);
    (await P.get('b.if.hit_side')).fire('keydown', { key: 'Enter' }); await P.flush();
    const s2 = P.ed().sessions[1], f2 = s2 && s2.fields[0];
    if (f2) P.ed().userEdit([{ line: f2.line, col: f2.col, endCol: f2.col + f2.len, text: 'left' }]); await P.flush();
    ok(s2 && s2.ended === 'edit' && P.said.some(t => t.indexOf(noCtx) >= 0), 'kit recheck: left typed in: the session end says a contact reaction carries no bullet', P.said.slice(-3).join(' / '));
    ok(EN['ide.kit.w.noCtx'].indexOf('{what}') > 0 && P.said.every(t => !/carry bullet\b/.test(t)), 'kit recheck: the context word is shown in words, not the engine word');
  }

  // a second insert while a session runs: the old session and the old check end before the edit (no old flash, no old count);
  // the old session has ended ('lost') when the new piece's applyEdits runs; an editor that changes nothing, or cancels the change
  // (false, old text): Not added, no session, no kit event
  {
    const lint = body => ({ findings: /inflammation_time/.test(String(body && body.text || '')) ? [{ line: 2, col: 2, code: 'X1', msg: 'bad', sev: 'error' }] : [], fixes: [], multi: [], ms: 0 });
    const P = await page({ lint });
    await P.open(IA, 2, 1); await P.flush();
    P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush(); await P.flush();
    const s = P.ed().sessions[0], said = P.said.length;
    (await P.get('a.sdl.comment')).fire('keydown', { key: 'Enter' }); await P.flush(); await P.flush();
    ok(s && s.ended === 'lost' && !P.ed().flashes.length && !P.said.slice(said).some(t => /new problem/.test(t)), 'kit order: the old piece\'s check does not run partway through the new insert', (s && s.ended) + ' ' + P.said.slice(said).join(' / '));
    const C = await page({ files: { [IA]: ['{"my_unit"', '}'].join('\n') } });
    await C.open(IA, 2, 2); await C.flush();
    let kits = 0; C.IDE.on('kit', () => { kits++; });
    (await C.get('a.sdl.comment')).fire('keydown', { key: 'Enter' }); await C.flush();
    const c1 = C.ed().sessions[0], L1 = C.ed().doc().lines.length;
    C.ed().goto(3, C.ed().doc().lines[2].length + 1); await C.flush();   // the cursor at the end of the comment field, as the session leaves it
    const cap = C.ed().applyEdits; let endedAt = 'none';
    C.ed().applyEdits = function (e) { endedAt = c1 ? c1.ended : 'none'; return cap.apply(this, arguments); };
    (await C.get('a.sdl.comment')).fire('keydown', { key: 'Enter' }); await C.flush();
    C.ed().applyEdits = cap;
    ok(L1 === 3 && C.ed().doc().lines.length === 4 && endedAt === 'lost' && c1.ended === 'lost' && c1.ends === 1 && kits === 2, 'kit order: the old session ended (lost) before the new piece\'s edit, which goes in', C.ed().doc().lines.join('|') + ' ' + endedAt + ' ' + kits);
    for (const [how, fn] of [['changed nothing', () => true], ['cancelled the change', () => false]]) {
      const N = await page();
      await N.open(IA, 2, 1); await N.flush();
      let nk = 0; N.IDE.on('kit', () => { nk++; });
      const t0 = N.ed().doc().lines.join('\n');
      N.ed().applyEdits = fn;
      (await N.get('b.start.inflammation')).fire('keydown', { key: 'Enter' }); await N.flush();
      ok(N.msg() === fill('ide.kit.notAdded') && !N.ed().sessions.length && nk === 0 && N.ed().doc().lines.join('\n') === t0 && JSON.stringify(N.ls('ide.kit.recent') || []) === '[]',
        'kit order: an editor that ' + how + ': Not added, no session, no kit event, not in used lately', N.msg());
    }
  }

  // the names of the file are scanned once per version, not once per drag gap
  {
    const F = ['{"my_unit"', '\t{on spawn'].concat(new Array(12).fill('\t\t{tags add "x"}'), ['\t}', '}'], new Array(600).fill('{"other" {on die {tags add "y"}}}')).join('\n');
    const P = await page({ files: { [IA]: F } });
    await P.open(IA, 3, 1); await P.flush();
    // a whole-file pass reads the last line; nothing else in a plan near the top does
    const r = await P.get('b.act.set'), ed = P.ed(), ln = ed.line, last = ed.lineCount(); let passes = 0;
    ed.line = function (n) { if (n === last) passes++; return ln.call(this, n); };
    const gl = await dragTo(P, r, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    ed.line = ln; P.doc.key('Escape'); P.doc.fire('pointerup', { clientX: 0, clientY: 0 }); await P.flush();
    ok(gl.every(t => /^Line \d+: inside a reaction$/.test(t || '')) && passes === 1, 'kit names: a drag over 10 lines plans 10 times but reads the whole file once (' + passes + ' passes)', gl.join('|'));
  }

  // the drag label names the place at the gap: inside a timer; a data-file piece inside a block
  {
    const P = await page({ files: { [IA]: ['{"my_unit"', '\t{on spawn', '\t\t{delay 2', '\t\t\t', '\t\t}', '\t}', '}'].join('\n') } });
    await P.open(IA, 1, 1); await P.flush();
    const r = await P.get('b.act.link_sound');
    const g1 = await dragTo(P, r, [4]); await dropAt(P, r, 4);
    ok(g1[0] === fill('ide.kit.d.ok', { line: 4, where: W('timer') }), 'kit where: an action dropped inside a delay says inside a timer', g1[0]);
    const Q = await page();
    await Q.open(IA, 1, 1); await Q.flush();
    const c = await Q.get('a.sdl.comment');
    const g2 = await dragTo(Q, c, [2]); await dropAt(Q, c, 2);
    ok(g2[0] === fill('ide.kit.d.ok', { line: 2, where: W('block') }), 'kit where: a data-file piece dropped in a block says inside a block', g2[0]);
  }

  // a drag whose release was lost: a move with no button held, or the window losing focus, ends it; a later click adds nothing
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    const blur = []; P.bx.addEventListener = (t, f) => { if (t === 'blur') blur.push(f); };
    let r = await P.get('b.event.spawn');
    await dragTo(P, r, [2]);
    const had = !!P.ghost();
    P.doc.fire('pointermove', { clientX: 40, clientY: 25, buttons: 0 }); await P.flush();
    const after = !!P.ghost();
    const pt = P.ed().pointAt(2, 'upper'); P.doc.fire('pointerup', { clientX: pt.x, clientY: pt.y }); await P.flush();
    ok(had && !after && P.edits().length === 0, 'kit stuck: a move with no button ends the drag; a click in the text adds nothing', had + ' ' + after + ' ' + P.edits().length);
    r = await P.get('b.event.spawn');
    await dragTo(P, r, [2]);
    const had2 = !!P.ghost(); blur.forEach(f => f({ type: 'blur' })); await P.flush();
    P.doc.fire('pointerup', { clientX: pt.x, clientY: pt.y }); await P.flush();
    ok(blur.length === 1 && had2 && !P.ghost() && P.edits().length === 0, 'kit stuck: the window losing focus ends the drag', blur.length + ' ' + P.edits().length);
  }

  // clicks: a double-click adds once; Shift+click adds the defaults with no field session
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    const r = await P.get('b.start.inflammation');
    r.fire('click', { detail: 1 }); (P.row('b.start.inflammation') || r).fire('click', { detail: 2 }); await P.flush();
    ok(P.edits().length === 1, 'kit click: a double-click adds the piece once', P.edits().length);
    P.ed().undo(); await P.flush(); await P.at(2, 1);
    const n = P.ed().calls('fieldSession').length;
    (await P.get('b.start.inflammation')).fire('click', { detail: 1, shiftKey: true }); await P.flush();
    ok(P.edits().length === 2 && P.ed().calls('fieldSession').length === n && P.ed().doc().lines.some(l => /inflammation_time 10/.test(l)), 'kit click: Shift+click adds the defaults with no field session');
  }

  // keyboard in the tree: Right opens a section, Left closes it, Home and End; Space shows and hides the preview
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    let s = P.secRow('ia.when'); s.fire('focus'); s.fire('keydown', { key: 'ArrowRight' }); await P.flush();
    ok(P.secRow('ia.when').getAttribute('aria-expanded') === 'true', 'kit keys: Right opens a section');
    P.secRow('ia.when').fire('keydown', { key: 'ArrowLeft' }); await P.flush();
    ok(P.secRow('ia.when').getAttribute('aria-expanded') === 'false', 'kit keys: Left closes it');
    const rows = () => P.K().all().filter(e => e.getAttribute && e.getAttribute('role') === 'treeitem');
    P.secRow('ia.when').fire('keydown', { key: 'End' });
    ok(P.doc.activeElement === rows()[rows().length - 1], 'kit keys: End goes to the last row');
    P.doc.activeElement.fire('keydown', { key: 'Home' });
    ok(P.doc.activeElement === rows()[0], 'kit keys: Home goes to the first row');
    const r = await P.get('b.event.spawn');
    r.fire('keydown', { key: ' ' }); const open = !P.pv().hidden;
    r.fire('keydown', { key: ' ' });
    ok(open && P.pv().hidden && P.edits().length === 0, 'kit keys: Space shows the preview, Space again hides it, nothing added');
  }

  // a stored fold value of the wrong type: sections still open and close; Advanced switched on after the page loaded
  {
    const P = await page({ ls: { 'ide.kit.fold': 'abc' } });
    await P.open(IA, 2, 1); await P.flush();
    let err = null; try { P.secRow('ia.when').click(); await P.flush(); } catch (e) { err = e.message; }
    ok(!err && P.secRow('ia.when').getAttribute('aria-expanded') === 'true' && JSON.stringify(P.ls('ide.kit.fold')) === '{"ia.when":true}', 'kit fold: a damaged fold setting is replaced, sections open', err || JSON.stringify(P.ls('ide.kit.fold')));
    const tp = ALL.pieces.find(p => p.tag === 'T');
    const before = !!(await P.get(tp.id));
    P.store.set('as2gui.adv', 'true'); const root = [P.sec].concat(P.sec.all()).find(e => cl(e, 'ide-root')); root.fire('focusin'); await P.flush();
    const now = !!(await P.get(tp.id));
    ok(!before && now, 'kit adv: Advanced switched on after the page loaded: the T pieces show', before + ' ' + now);
  }

  // the chance field: 0 is refused with words that say so
  {
    const P = await page({ files: { [IA]: HANDLER } });
    await P.open(IA, 3, 1); await P.flush();
    const ed = P.ed(); let got = null; const fsOrig = ed.fieldSession;
    ed.fieldSession = function (fields, caret, so) { got = fields; return fsOrig.call(this, fields, caret, so); };
    (await P.get('b.if.rand')).fire('keydown', { key: 'Enter' }); await P.flush();
    const f = got && got.find(x => x.k === 'chance');
    ok(!!f && f.test('0') === fill('ide.kit.f.bad.chance') && f.test('0.5') === '' && f.test('1') === '', 'kit chance: 0 is refused as "More than 0, up to 1"', f && f.test('0'));
  }

  // screen readers: one live fit count that is not rebuilt on a cursor move; the preview is not a live region
  {
    const P = await page({ files: { [IA]: ['{"my_unit"', '\t', '\t', '}'].join('\n') } });
    await P.open(IA, 2, 1); await P.flush();
    const fit = () => P.K().all().find(e => cl(e, 'idk-fitn'));
    const a = fit(), ta = a && a.textContent;
    await P.at(3, 1); await P.flush();
    const lives = P.K().all().filter(e => e.getAttribute && e.getAttribute('aria-live'));
    ok(!!a && fit() === a && a.textContent === ta && /fit here/.test(ta) && a.getAttribute('role') === 'status', 'kit a11y: the fit count is one node, kept across a cursor move', ta);
    ok(lives.length === 1 && lives[0] === a, 'kit a11y: the fit count is the only live region (not the notes, not the preview)', lives.map(e => e.className).join());
  }

  // read-only tab: the bar with the reason and Copy into my mod (layer only); Add off in the preview and the menu; no drag
  {
    for (const [why, button] of [['layer', true], ['lonecr', false]]) {
      const P = await page({ files: { [IA]: { text: BLOCK, editable: false, why } } });
      const d = await P.open(IA, 2, 1); await P.flush();
      const bar = P.K().all().find(e => cl(e, 'idk-ro'));
      ok(!!bar && bar.has(fill('ide.kit.ro', { why: P.IDE.roWhy(d) })) && !!bar.all().find(e => cl(e, 'idk-cpin')) === button, 'kit ro: ' + why + ': the read-only bar' + (button ? ' with Copy into my mod' : ', no copy-in'));
      const r = await P.get('b.event.spawn'); r.fire('focus'); await P.flush();
      const addB = P.pv().all().find(e => cl(e, 'idk-add'));
      r.fire('contextmenu'); await P.flush();
      const labels = P.picks.length ? P.picks[P.picks.length - 1].items.map(i => i.label) : [];
      P.IDE.closeOverlay();
      ok(!!addB && addB.disabled && labels.length > 0 && labels.indexOf(fill('ide.kit.add')) < 0, 'kit ro: ' + why + ': Add is off in the preview and gone from the menu', labels.join('|'));
      await dragTo(P, r, [2]);
      ok(!P.ghost(), 'kit ro: ' + why + ': no drag starts'); P.doc.fire('pointerup', { clientX: 0, clientY: 0 }); await P.flush();
    }
  }

  // no file: the kinds that have pieces; the ? beside the kind line opens the guide; the badge tooltip cites the game's file; css
  {
    const P = await page();
    await P.flush();
    ok(P.K().has(fill('ide.kit.kinds', { list: (ALL.withPieces || ['ia-entity', 'sdl']).map(function (k) { return ALL.kinds[k] || k; }).join(', ') })), 'kit none: with no file open the pane lists the kinds that have pieces', P.K().textContent.slice(0, 300));
    await P.open(IA, 2, 1); await P.flush();
    const q1 = P.K().all().find(e => cl(e, 'idk-q1'));
    if (q1) q1.click();
    ok(!!q1 && !q1.hidden && P.gone.indexOf('docs:guide/11-interaction-scripts.md') >= 0, 'kit help: the ? beside "For this file" opens the interaction guide', P.gone.join());
    const ip = ALL.pieces.find(p => p.tag === 'I' && p.src && !p.adv);
    const r = await P.get(ip.id), badge = r && r.all().find(e => cl(e, 'idk-b'));
    ok(!!badge && badge.getAttribute('title') === fill('ide.kit.t.I') + ' (' + ip.src + ')', 'kit badge: the tooltip gives the tag and the game file it comes from', badge && badge.getAttribute('title'));
    const css = require('./ui/kit').css;
    ok(/\.idk-sec,\.idk-row,\.idk-pv\{user-select:none/.test(css), 'kit css: rows and the preview cannot be selected (no native text drag)');
  }

  // ---- review round 2 (browser walk and the fixers' needs): each case fails without its fix
  const lintHeld = () => { const pend = []; return { pend, api: req => (req.path === '/api/x/ide/lint' && req.method === 'POST' ? new Promise(r => pend.push(() => r({ findings: [], fixes: [], multi: [], ms: 0 }))) : undefined) }; };
  const answerLints = async (P, L) => { const l = L.pend.splice(0); l.forEach(f => f()); await P.flush(); return l.length; };
  const hint = fill('ide.kit.f.session');

  // W2: a value typed in the field and the session ended with Enter before the editor sent that change: the after-insert check
  // waits for the lint of the final text; the lint of the inserted text (an older version) never sets Save / How to try it
  {
    const L = lintHeld(), P = await page({ api: L.api });
    const d = await P.open(IA, 2, 1); await answerLints(P, L);
    const nexts = [], nx = P.IDE.next; P.IDE.next = items => { nexts.push((items || []).map(i => i.label).join(',')); return nx(items); };
    const lints = []; P.IDE.on('lint', e => lints.push(e.ver));
    P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush();
    const vIns = d.ver, n1 = await answerLints(P, L);           // the lint of the inserted text comes in while the session runs
    const s = P.ed().sessions[0], f = s && s.fields[0];
    const defer = P.F.defer; P.F.defer = () => {};                // the typed change waits in the editor (its 150 ms throttle)
    if (f) P.ed().applyEdits([{ line: f.line, col: f.col, endCol: f.col + f.len, text: '25' }]);
    P.F.defer = defer;
    const typedOn = s && !s.ended;
    P.ed().endSession('done'); await P.flush(); await P.flush();
    const stale = nexts.filter(x => /ide\.kit\.tryIt/.test(x)).length;
    const n2 = await answerLints(P, L); await P.flush();
    const btns = P.nextBtns().map(b => b.textContent);
    ok(n1 === 1 && typedOn && lints[0] === vIns && stale === 0, 'kit W2: the lint of the inserted text (before the typed value was sent) does not set the next steps', [n1, typedOn, lints.join('/'), stale, nexts.join(' ; ')].join(' | '));
    ok(n2 === 1 && lints.length === 2 && lints[1] > vIns && /ide\.a\.save,ide\.kit\.tryIt$/.test(nexts[nexts.length - 1] || '') && btns[0] === 'Save' && btns.indexOf(fill('ide.kit.tryIt')) > 0,
      'kit W2: after the lint of the final text the strip holds Save and How to try it in game', [n2, lints.join('/'), nexts.join(' ; '), btns.join('|')].join(' | '));
  }

  // W3: the status loses "Tab goes to the next value. Esc ends." when the session ends: Enter, Esc, a click away, an edit keep the
  // added line; undo, the doc closed and a mod change leave the status empty
  {
    const P = await page({ files: { [IA]: BLOCK, [IA2]: BLOCK } });
    const d = await P.open(IA, 2, 1); await P.flush();
    const start = async () => { await P.open(IA, 2, 1); await P.at(2, 1); P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush(); return P.ed().sessions[P.ed().sessions.length - 1]; };
    for (const why of ['done', 'esc', 'click']) {
      const s = await start(); const during = P.msg();
      P.ed().endSession(why);
      await P.flush();
      ok(during.indexOf(hint) > 0 && s.ended === why && P.msg() === fill('ide.kit.added'), 'kit W3: ended by ' + why + ': the added line without the session keys', during + ' -> ' + P.msg());
      P.ed().undo(); await P.flush();
    }
    // P5: once the text changed after the insert (a value typed, an edit elsewhere) one Ctrl+Z takes out that change, not the piece:
    // the session end does not say "Ctrl+Z takes it out"
    for (const how of ['edit', 'typed+done', 'typed+esc']) {
      const s = await start(); const during = P.msg(), f = s.fields[0];
      if (how === 'edit') P.ed().userEdit([{ line: 1, col: 11, text: ' ; my note' }]);
      else { P.ed().applyEdits([{ line: f.line, col: f.col, endCol: f.col + f.len, text: '12' }]); P.ed().endSession(how.slice(6)); }
      await P.flush();
      ok(during.indexOf(hint) > 0 && s.ended === (how === 'edit' ? 'edit' : how.slice(6)) && P.msg().indexOf(fill('ide.kit.added')) < 0 && P.msg().indexOf(hint) < 0,
        'kit W3: ' + how + ': the session end does not say Ctrl+Z takes the piece out', during + ' -> ' + P.msg());
      P.ed().undo(); await P.flush();
      ok(P.ed().doc().lines.some(l => /inflammation_time/.test(l)), 'kit W3: ' + how + ': (one Ctrl+Z leaves the piece in)');
      P.ed().undo(); await P.flush();
    }
    let s = await start(); P.ed().undo(); await P.flush();
    ok(s.ended === 'undo' && P.msg() === '', 'kit W3: ended by undo: the status is cleared', P.msg());
    s = await start(); P.IDE.emit('closed', { doc: d }); await P.flush();
    ok(s.ended === 'closed' && P.msg() === '', 'kit W3: the doc closed: the status is cleared', P.msg());
    s = await start(); P.IDE.emit('mod', { mod: 'C:/g/mods/other' }); await P.flush();
    ok(s.ended === 'mod' && P.msg() === '', 'kit W3: a mod change: the status is cleared', P.msg());
  }

  // W4: while the pieces load, after an error and on a 501, the kind line never shows the kind's id; with the kind names known
  // (any answer in this language) it shows the translated name while the open file's pieces still load
  {
    for (const mode of ['wait', 'fail', 'none']) {
      const P = await page({ api: req => { if (req.path !== '/api/x/ide/kit') return undefined; if (mode === 'wait') return env.PENDING;
        return Object.assign(new Error(mode === 'none' ? 'Code Pieces is not installed' : 'disk on fire'), { status: mode === 'none' ? 501 : 500 }); } });
      await P.open(IA, 2, 1); await P.flush();
      const t = P.K().textContent, fe = P.K().all().find(e => cl(e, 'idk-for'));
      ok(t.indexOf('ia-entity') < 0 && !!fe && fe.hidden && P.K().has(mode === 'wait' ? fill('ide.kit.loading') : fill('ide.kit.loadErr', { m: mode === 'none' ? 'Code Pieces is not installed' : 'disk on fire' })),
        'kit W4: ' + mode + ': no raw kind id, the kind line hidden, the ' + (mode === 'wait' ? 'loading' : 'error') + ' row shown', t.slice(0, 300));
    }
    const Q = await page({ api: req => (req.path === '/api/x/ide/kit' && req.q.kind === 'ia-entity' ? env.PENDING : undefined) });
    await Q.flush(); await Q.open(IA, 2, 1); await Q.flush();
    const fe = Q.K().all().find(e => cl(e, 'idk-for'));
    ok(!!fe && !fe.hidden && fe.has(fill('ide.kit.forFile', { kind: ALL.kinds['ia-entity'] })) && Q.K().textContent.indexOf('ia-entity') < 0 && Q.K().has(fill('ide.kit.loading')),
      'kit W4: kind names known, pieces still loading: the translated kind name and the loading row', Q.K().textContent.slice(0, 300));
  }

  // Advanced switched off: an open preview of a T piece closes, and no way in adds it (preview button, row menu, Alt+Insert item)
  {
    const P = await page({ ls: { adv: true } });
    await P.open(IA, 2, 1); await P.flush();
    const tp = ALL.pieces.find(p => p.tag === 'T' && !p.adv && (p.scope || []).indexOf('block') >= 0) || ALL.pieces.find(p => p.tag === 'T');
    const r = await P.get(tp.id); r.fire('focus'); await P.flush();
    const open = !!P.pv() && !P.pv().hidden && P.pv().has(tp.title), addB = P.pv().all().find(e => cl(e, 'idk-add'));
    r.fire('contextmenu'); await P.flush();
    const mi = P.picks.length ? P.picks[P.picks.length - 1].items.find(i => i.label === fill('ide.kit.add')) : null; P.IDE.closeOverlay();
    P.IDE.run('kitAdd'); await P.flush();
    const pi = P.picks.length ? P.picks[P.picks.length - 1].items.find(i => i.id === tp.id) : null; P.IDE.closeOverlay();
    P.store.set('as2gui.adv', 'false'); const root = [P.sec].concat(P.sec.all()).find(e => cl(e, 'ide-root')); root.fire('focusin'); await P.flush();
    ok(open && P.pv().hidden && !P.row(tp.id), 'kit adv off: the open preview of a T piece closes', open + ' ' + P.pv().hidden);
    const said = P.said.length;
    if (addB) addB.click(); if (mi) mi.run(); if (pi) pi.run(); await P.flush();
    ok(!!addB && !!mi && !!pi && P.edits().length === 0 && P.said.slice(said).every(t => t === fill('ide.kit.notAdded')), 'kit adv off: a held preview button, menu item or Alt+Insert item adds nothing', P.edits().length + ' ' + P.said.slice(said).join(' / '));
  }

  // w.quoted: a game event word typed into the name of {on "..." overload}: the session end says so in words, never the key
  {
    const P = await page();
    await P.open(IA, 2, 1); await P.flush();
    (await P.get('b.start.overload')).fire('keydown', { key: 'Enter' }); await P.flush();
    const s = P.ed().sessions[0], f = s && s.fields[0];
    ok(!!f && f.name === 'name' && P.said.every(t => t.indexOf('"contact"') < 0), 'kit quoted: the default name: no note at the insert', P.msg());
    if (f) P.ed().userEdit([{ line: f.line, col: f.col, endCol: f.col + f.len, text: 'contact' }]); await P.flush();
    const want = fill('ide.kit.w.quoted', { name: 'contact' });
    ok(s && s.ended === 'edit' && P.said.some(t => t.indexOf(want) >= 0) && P.said.every(t => t.indexOf('ide.kit.') < 0),
      'kit quoted: "contact" typed in: the session end gives the quoted-name note as text (needs the route words to carry the game event names)', P.said.slice(-2).join(' / '));
    P.ed().undo(); await P.flush(); await P.at(2, 1);
    (await P.get('b.start.overload')).fire('keydown', { key: 'Enter' }); await P.flush();
    const n = P.said.length; P.ed().endSession('done'); await P.flush();
    ok(P.said.slice(n).every(t => t.indexOf(want) < 0 && t.indexOf('"update_moveable"') < 0), 'kit quoted: the default kept: no note', P.said.slice(n).join(' / '));
  }

  // fit: the planner's places: the top level of a fragment file (top-level reactions, no quoted block) takes block pieces
  {
    const FR = 'resource/set/interaction_entity/frag.inc';
    const P = await page({ files: { [FR]: ['{on spawn', '\t{tags add "x"}', '}', ''].join('\n') } });
    await P.open(FR, 4, 1); await P.flush();
    const r = await P.get('b.event.contact');
    ok(!!r && !cl(r, 'idk-dim'), 'kit fit: the top level of a fragment file: a reaction piece is not dimmed (a click adds it there)');
    r.click(); await P.flush();
    ok(P.edits().length === 1 && P.ed().doc().lines.indexOf('{on contact') >= 0, 'kit fit: and the click adds it there', P.ed().doc().lines.join('|'));
  }

  // a touch drag from the grip: a mouse moving with no button pressed (another pointer) neither ends nor moves it
  {
    const P = await page({ width: 800 });
    P.IDE.kitCol(true); await P.open(IA, 2, 1); await P.flush();
    const r = await P.get('b.event.spawn'), grip = r.all().find(e => cl(e, 'idk-grip'));
    const gl = await dragTo(P, r, [2], { down: { pointerType: 'touch', target: grip, pointerId: 11 } });
    P.doc.fire('pointermove', { clientX: 5, clientY: 590, buttons: 0, pointerId: 1, pointerType: 'mouse' }); await P.flush();
    const still = !!P.ghost() && P.ed().gap && P.ed().gap.gap === 2;
    await dropAt(P, r, 2);
    ok(!!gl[0] && still && P.edits().length === 1, 'kit drag: a mouse move of another pointer does not end a touch drag', gl.join() + ' ' + still + ' ' + P.edits().length);
  }

  // ---- review round 3 (independent check after round 2): each case fails without its fix
  // P2: "Add it at line N instead" adds once: a second click (a double-click, or before the lint answered) adds nothing and says the
  // file changed; the strip loses the step after the insert
  {
    const F = ['{"my_unit"', '\t{on spawn', '\t}', '\t', '}'].join('\n');
    const L = lintHeld(), P = await page({ files: { [IA]: F }, api: L.api });
    await P.open(IA, 4, 1); await answerLints(P, L);
    (await P.get('b.act.link_sound')).fire('click', { detail: 1, shiftKey: true }); await P.flush();
    const near = fill('ide.kit.nearN', { n: 3 }), nb = P.nextBtns().find(x => x.textContent === near);
    if (nb) nb.click();
    const strip = P.nextBtns().map(b => b.textContent);
    if (nb) nb.click(); await P.flush();
    const n = P.ed().doc().lines.filter(l => /link_sound/.test(l)).length;
    ok(!!nb && P.edits().length === 1 && n === 1 && P.msg() === fill('ide.kit.x.stale') && strip.indexOf(near) < 0,
      'kit P2: Add it at line 3 instead clicked twice (lint not answered): added once, the second says the file changed, the step is gone', [P.edits().length, n, P.msg(), strip.join('|')].join(' | '));
  }
  // P3: a session ended by opening another tab: the new-problem count waits for the file it is about, then shows there
  {
    const lint = body => ({ findings: /inflammation_time/.test(String(body && body.text || '')) ? [{ line: 2, col: 2, code: 'X1', msg: 'bad', sev: 'error' }] : [], fixes: [], multi: [], ms: 0 });
    const P = await page({ lint, files: { [IA]: BLOCK, [IA2]: BLOCK } });
    await P.open(IA, 2, 1); await P.flush();
    P.row('b.start.inflammation').fire('keydown', { key: 'Enter' }); await P.flush(); await P.flush();
    const n = P.said.length, s = P.ed().sessions[0];
    await P.open(IA2, 2, 1); await P.flush(); await P.flush();
    const away = P.said.slice(n), fl = P.ed().flashes.length;
    await P.open(IA, 2, 1); await P.flush(); await P.flush();
    const back = P.said.slice(n + away.length);
    ok(s && s.ended === 'swap' && !away.some(t => /new problem/.test(t)) && fl === 0, 'kit P3: while the other tab is open the status says nothing about the first file\'s problems', away.join(' / '));
    ok(back.indexOf(fill('ide.kit.probs.1', { n: 1 })) >= 0 && P.ed().flashes.length === 1, 'kit P3: back on the file the new-problem count shows and the piece flashes', back.join(' / ') + ' ' + JSON.stringify(P.ed().flashes));
  }
  // P4: Alt+Insert with the column closed while the pieces fail to load: the status says why no list opens
  {
    const P = await page({ api: req => (req.path === '/api/x/ide/kit' && req.q.kind === 'ia-entity' ? Object.assign(new Error('disk on fire'), { status: 500 }) : undefined) });
    P.IDE.kitCol(false); await P.open(IA, 2, 1); await P.flush();
    P.IDE.run('kitAdd'); await P.flush(); await P.flush();
    ok(P.picks.length === 0 && P.said.indexOf(fill('ide.kit.loading')) >= 0 && P.msg() === fill('ide.kit.loadErr', { m: 'disk on fire' }), 'kit P4: Alt+Insert, pieces fail to load: the status gives the error', JSON.stringify(P.said));
  }

  // every refusal and warning key the planner can return has a lang row, and the pane lists it for its computed lookups
  {
    const psrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ide', 'kit', 'plan.js'), 'utf8');
    const L = {}; for (const r of require('./lang/kit')) L[r[0]] = 1;
    const usrc = fs.readFileSync(path.join(__dirname, 'ui', 'kit.js'), 'utf8'), dyn = /var KIT_KEYS=\[([^\]]*)\]/.exec(usrc);
    const listed = new Set(dyn ? dyn[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : []);
    const keys = [...new Set([...psrc.matchAll(/'(ide\.kit\.[A-Za-z0-9_.]+)'/g)].map(m => m[1]))];
    const bad = keys.filter(k => !L[k] || !listed.has(k));
    ok(keys.length >= 15 && !bad.length, 'kit keys: every ide.kit. key in plan.js has a lang row and is in KIT_KEYS (' + keys.length + ')', bad.join());
  }

  // ---- round 2 (643 new pieces for new file kinds): number, size and multiplayer marks, the filters, the two new refusals and the new
  //      scope words, a 400-line piece, and a catalog of 400 pieces in 60 sections. A fake mission catalog (the route answer shape) and
  //      the planner seam window.IDE_KITPLAN (a wrapper over the shipped planner, run here in node) so the cases do not wait for the core
  {
    const MI = 'resource/map/single/m1/mission.mi', MIF = ['{mission', '\t', '}'].join('\n');
    const SZ = ['line', 'small', 'medium', 'large'], LN = { line: 1, small: 4, medium: 20, large: 60 }, MP = ['yes', 'no', 'unknown'];
    const mk = (o) => Object.assign({ titleEn: o.title, what: 'What ' + o.title, kinds: ['mi'], scope: ['any'], role: 'act', wrap: false, needs: [], event: null,
      tag: 'V', short: false, lim: [], src: 'fake.mi:1', adv: false, task: null }, o, { parts: [o.code] });
    const lines = (n, w) => Array.from({ length: n }, (_, j) => '\t{' + w + '_' + j + '}').join('\n') + '\n';
    // 6 tops with 9 sub-sections each = 60 sections; 394 numbered pieces over the 54 subs + 6 special ones = 400
    function fakeCat(o) {
      o = o || {};
      const secs = [], pieces = [];
      for (let t = 0; t < 6; t++) {
        const tid = t === 0 ? 'mi.start' : 'mi.t' + t;
        secs.push({ id: tid, parent: null, title: 'Top ' + t, order: t });
        for (let s = 0; s < 9; s++) secs.push({ id: tid + '.s' + s, parent: tid, title: 'Sub ' + t + '.' + s, order: s });
      }
      const subs = secs.filter(s => s.parent);
      for (let i = 0; i < 394; i++) {
        const no = i + 1, size = o.only || SZ[i % 4];
        pieces.push(mk({ id: 'mi.f.' + no, no, sec: subs[i % subs.length].id, size, mp: MP[i % 3], title: 'Fake piece ' + no, code: lines(LN[size], 'cmd' + no), tag: i % 50 === 9 ? 'T' : 'V' }));
      }
      pieces.push(mk({ id: 'mi.x.big', no: 600, sec: 'mi.t1.s0', size: 'large', mp: 'yes', title: 'Big system', code: lines(400, 'big_line') }));
      pieces.push(mk({ id: 'mi.x.whole', no: 601, sec: 'mi.t1.s0', size: 'large', mp: 'yes', whole: true, scope: ['empty'], title: 'Whole mission file', code: lines(50, 'whole_line') }));
      pieces.push(mk({ id: 'mi.x.mpno', no: 602, sec: 'mi.t1.s0', size: 'small', mp: 'no', title: 'Single player only', code: lines(3, 'sp') }));
      pieces.push(mk({ id: 'mi.x.inm', no: 603, sec: 'mi.t1.s0', size: 'line', mp: 'yes', scope: ['in:mission'], title: 'Mission line', code: lines(1, 'ml') }));
      pieces.push(mk({ id: 'mi.x.inn', no: 604, sec: 'mi.t1.s0', size: 'line', mp: 'yes', scope: ['in:*'], title: 'Named line', code: lines(1, 'nl') }));
      pieces.push(mk({ id: 'mi.x.top', no: 605, sec: 'mi.t1.s0', size: 'small', mp: 'unknown', scope: ['top'], title: 'Top block', code: lines(3, 'tb') }));
      return { v: 1, kind: 'mi', lang: 'en', game: true, kinds: Object.assign({ mi: 'Mission' }, ALL.kinds), sections: secs, views: {}, pieces, words: ALL.words };
    }
    const CAT = fakeCat(), CBY = {}; CAT.pieces.forEach(p => { CBY[p.id] = p; });
    const REF = { 'mi.x.whole': { k: 'ide.kit.x.whole', p: {} }, 'mi.x.mpno': { k: 'ide.kit.x.mp', p: {} },
      'mi.x.inm': { k: 'ide.kit.x.scope', p: { where: 'in:mission' } }, 'mi.x.inn': { k: 'ide.kit.x.scope', p: { where: 'in:*' } },
      'mi.x.top': { k: 'ide.kit.x.scope', p: { where: 'top' }, near: 1 } };
    const seam = (P) => {
      const real = require('../../../ide/kit/plan')(), seen = { plan: [], fits: [] };
      P.bx.IDE_KITPLAN = Object.assign({}, real, {
        plan(src, at, p, v, op) { seen.plan.push(op && op.rel); const r = REF[p.id];
          return r ? { edits: [], fields: [], caret: null, from: 0, to: 0, warn: [], refuse: r, ver: op && op.ver } : real.plan(src, at, p, v, op); },
        fits(src, s, p, op) { seen.fits.push(op && op.rel); return real.fits(src, s, p, op); } });
      return seen;
    };
    const miPage = async (o) => {
      o = o || {}; const cat = o.cat || CAT;
      const P = await page(Object.assign({ files: { [MI]: MIF }, api: req => (req.path === '/api/x/ide/kit' && req.q.kind === 'mi' ? cat : undefined) }, o.page || {}));
      P.seen = seam(P);
      P.mark = (el, c) => el && el.all().find(e => cl(e, c));
      P.szSel = () => P.K().all().find(e => cl(e, 'idk-fsz'));
      P.mpCb = () => P.K().all().find(e => cl(e, 'idk-fmpc'));
      P.mpLab = () => P.K().all().find(e => cl(e, 'idk-fmp'));
      P.setSz = async v => { const s = P.szSel(); s.value = v; s.fire('change'); await P.flush(); };
      P.setMp = async on => { const c = P.mpCb(); c.checked = on; c.fire('change'); await P.flush(); };
      await P.open(MI, 2, 1); await P.flush();
      return P;
    };

    // 400 pieces in 60 sections: rows are built only for open sections (Start here open, its sub-sections closed)
    {
      const P = await miPage();
      const secs = () => P.K().all().filter(e => cl(e, 'idk-sec')).map(e => e.dataset.sec);
      const s0 = secs(), r0 = P.rows();
      ok(CAT.pieces.length === 400 && CAT.sections.length === 60, 'kit r2 big: the fake catalog has 400 pieces in 60 sections');
      ok(s0.length === 6 + 9 && r0.length === 0, 'kit r2 big: closed sub-sections: 6 tops + the 9 sub-sections of Start here, no piece row', s0.length + ' ' + r0.length);
      ok(P.K().all().filter(e => e.dataset && e.dataset.piece).length === 0 && P.K().all().filter(e => cl(e, 'idk-code')).length === 0, 'kit r2 big: no piece element and no code in the DOM while every section is closed');
      P.secRow('mi.start.s0').click(); await P.flush();
      const want = CAT.pieces.filter(p => p.sec === 'mi.start.s0' && p.tag !== 'T').map(p => p.id).sort().join();
      ok(P.rows().slice().sort().join() === want && P.rows().length > 0 && P.rows().length < 12, 'kit r2 big: opening one sub-section builds the rows of that section only', P.rows().length + ' of ' + want.split(',').length);
      const nf = P.seen.fits.length; await P.at(1, 1); await P.flush();
      const per = P.seen.fits.length - nf;
      ok(per > 0 && per <= 400, 'kit r2 big: a cursor move asks fits at most once per piece (' + per + ')');
      ok(P.seen.fits.length > 0 && P.seen.fits.every(r => r === MI), 'kit r2 rel: every fits call carries opts.rel, the doc\'s path in the mod', [...new Set(P.seen.fits)].join());
      const t0 = Date.now(); P.secRow('mi.t1').click(); await P.flush(); P.secRow('mi.t1.s0').click(); await P.flush();
      // 5 s is the real bound (a slow build of all 60 sections takes far longer); a busy PC gets five times that with a WAIT line, never a timing-only FAIL
      const ms = Date.now() - t0; if (ms >= 5000) require('../../../lib/test/wait').say('ide test-kit', 'opening a top and a sub-section (' + ms + ' ms)', 5000);
      ok(ms < 25000, 'kit r2 big: opening a top and a sub-section of 60 sections stays fast (' + ms + ' ms in the fake DOM)');
    }

    // the number, the size badge and the multiplayer mark on a row and in the preview; v1 rows: size from the line count, no number
    {
      const P = await miPage();
      await P.find('Fake piece 7');
      const p7 = CBY['mi.f.7'], r = P.row('mi.f.7');
      const no = P.mark(r, 'idk-no'), sz = P.mark(r, 'idk-sz'), mp = P.mark(r, 'idk-mp');
      ok(!!no && no.textContent === '#7' && no.getAttribute('title') === fill('ide.kit.noT', { n: 7 }), 'kit r2 mark: the row shows the number as #7', no && no.textContent);
      ok(!!sz && sz.textContent === fill('ide.kit.sz.' + p7.size) && cl(sz, 'idk-sz-' + p7.size) && sz.getAttribute('title') === fill('ide.kit.szT.' + p7.size), 'kit r2 mark: the row shows the size badge', sz && sz.textContent);
      ok(!!mp && mp.textContent === fill('ide.kit.mp.' + p7.mp) && cl(mp, 'idk-mp-' + p7.mp) && mp.getAttribute('title') === fill('ide.kit.mpT.' + p7.mp), 'kit r2 mark: the row shows the multiplayer mark', mp && mp.textContent);
      const mpOf = id => { const e = P.mark(P.row(id), 'idk-mp'); return e ? e.textContent : null; };
      await P.find('Fake piece 8'); const m8 = mpOf('mi.f.8'); await P.find('Fake piece 9'); const m9 = mpOf('mi.f.9');
      ok(p7.mp === 'yes' && m8 === fill('ide.kit.mp.no') && m9 === fill('ide.kit.mp.unknown') && new Set([mp && mp.textContent, m8, m9]).size === 3, 'kit r2 mark: safe, not safe and unknown read apart in words', [mp && mp.textContent, m8, m9].join('|'));
      await P.find('Fake piece 7'); P.row('mi.f.7').fire('focus'); await P.flush();
      const head = P.pv().all().find(e => cl(e, 'idk-pvh'));
      ok(!!head && P.mark(head, 'idk-no').textContent === '#7' && P.mark(head, 'idk-sz').textContent === fill('ide.kit.sz.' + p7.size) && P.mark(head, 'idk-mp').textContent === fill('ide.kit.mp.' + p7.mp), 'kit r2 mark: the preview shows the number, size and multiplayer mark', head && head.textContent);
      const css = require('./ui/kit').css;
      ok(/\.idk-mp-yes\{color:var\(--ik\)/.test(css) && /\.idk-mp-no\{color:var\(--ie\)/.test(css) && /\.idk-sz,\.idk-mp\{[^}]*var\(--il\)/.test(css), 'kit r2 mark: the marks use theme tokens');
      const Q = await page(); await Q.open(IA, 2, 1); await Q.flush(); await Q.find('When it appears');
      const v1 = Q.row('b.event.spawn');
      ok(!!v1 && !v1.all().some(e => cl(e, 'idk-no')) && !v1.all().some(e => cl(e, 'idk-mp')) && !!v1.all().find(e => cl(e, 'idk-sz')), 'kit r2 mark: a v1 piece: no number, no multiplayer mark, a size from its lines');
      const fe = Q.K().all().find(e => cl(e, 'idk-fmp'));
      ok(!!fe && fe.hidden, 'kit r2 filter: a catalog with no multiplayer mark hides "Multiplayer safe only"');
    }

    // the filters: size (All, Small = line + small, Medium, Large) and Multiplayer safe only; with the search, with Advanced; kept in LS
    {
      const P = await miPage();
      ok(!!P.szSel() && P.szSel().value === 'all' && !!P.mpLab() && !P.mpLab().hidden && P.mpCb().checked === false, 'kit r2 filter: size select and the multiplayer box shown for a mission catalog');
      const shown = () => P.rows().map(id => CBY[id]).filter(Boolean);
      await P.find('Fake piece');
      const all = shown().length;
      for (const [v, okz] of [['small', ['line', 'small']], ['medium', ['medium']], ['large', ['large']]]) {
        await P.setSz(v);
        const l = shown();
        ok(l.length > 0 && l.length < all && l.every(p => okz.indexOf(p.size) >= 0), 'kit r2 filter: size ' + v + ' with the search shows only ' + okz.join(' and ') + ' pieces', l.length + ' of ' + all + ' ' + [...new Set(l.map(p => p.size))].join());
      }
      await P.setSz('all'); await P.setMp(true);
      const m = shown();
      ok(m.length > 0 && m.every(p => p.mp === 'yes'), 'kit r2 filter: Multiplayer safe only hides not safe and unknown', [...new Set(m.map(p => p.mp))].join());
      await P.setSz('large');
      const lm = shown();
      ok(lm.length > 0 && lm.every(p => p.mp === 'yes' && p.size === 'large'), 'kit r2 filter: size and multiplayer combine', lm.length);
      const t160 = CBY['mi.f.160'];
      await P.find('Fake piece 160');
      ok(t160.tag === 'T' && t160.size === 'large' && t160.mp === 'yes' && !P.row('mi.f.160') && !shown().some(p => p.tag === 'T'), 'kit r2 filter: Advanced off: a T piece that fits the filters stays hidden');
      ok(JSON.stringify(P.ls('ide.kit.flt')) === '{"sz":"large","mp":true}' && P.writes().length === 0, 'kit r2 filter: kept in this browser\'s localStorage, nothing written', JSON.stringify(P.ls('ide.kit.flt')));
      const Q = await miPage({ page: { ls: { 'ide.kit.flt': { sz: 'medium', mp: true } } } });
      await Q.find('Fake piece');
      const ql = Q.rows().map(id => CBY[id]).filter(Boolean);
      ok(Q.szSel().value === 'medium' && Q.mpCb().checked === true && ql.length > 0 && ql.every(p => p.size === 'medium' && p.mp === 'yes'), 'kit r2 filter: a new page reads the kept filters', Q.szSel().value + ' ' + ql.length);
      const A2 = await miPage({ page: { ls: { 'ide.kit.flt': { sz: 'large', mp: true }, adv: true } } });
      await A2.find('Fake piece 160');
      ok(!!A2.row('mi.f.160'), 'kit r2 filter: Advanced on: the T piece shows under the same filters');
      await A2.find('Fake piece 2');
      ok(!A2.row('mi.f.2'), 'kit r2 filter: and a small piece stays out under Large');
      // a broken stored value falls back to All, off
      const B = await miPage({ page: { ls: { 'ide.kit.flt': 'abc' } } });
      ok(B.szSel().value === 'all' && B.mpCb().checked === false, 'kit r2 filter: a damaged stored filter falls back to all sizes, box off');
      // the tree emptied by the filters: one plain line with Show all pieces
      const S = await miPage({ cat: fakeCat({ only: 'small' }) });
      await S.setSz('medium');
      const fn = S.K().all().find(e => cl(e, 'idk-fnone')), clr = fn && fn.all().find(e => cl(e, 'idk-fclr'));
      ok(!!fn && fn.has(fill('ide.kit.fNone')) && !!clr && clr.textContent === fill('ide.kit.fClear'), 'kit r2 filter: nothing left: the note and Show all pieces', S.K().textContent.slice(0, 200));
      // (the six special pieces keep their own sizes: only line, small and large are there besides the small ones)
      if (clr) clr.click(); await S.flush();
      ok(S.szSel().value === 'all' && !S.K().all().some(e => cl(e, 'idk-fnone')) && S.K().all().filter(e => cl(e, 'idk-sec')).length > 0, 'kit r2 filter: Show all pieces resets the filters');
      await S.setSz('medium'); await S.find('Fake piece 1');
      ok(S.rows().length === 0 && S.K().has(fill('ide.kit.fNoneQ')), 'kit r2 filter: a search with nothing left under the filters says so');
    }

    // the two new refusals and the new scope words, each a plain sentence; opts.rel goes with every plan
    {
      const P = await miPage();
      const click = async id => { await P.find(CBY[id].title); const r = P.row(id); if (r) r.click(); await P.flush(); return !!r; };
      ok(await click('mi.x.whole') && P.msg() === EN['ide.kit.x.whole'] && P.edits().length === 0, 'kit r2 refuse: a whole-file piece in a file with text: the whole-file sentence', P.msg());
      ok(EN['ide.kit.x.whole'] === 'This piece is a whole file. Open an empty file to add it.', 'kit r2 refuse: the whole-file sentence reads as the brief');
      ok(await click('mi.x.mpno') && P.msg() === EN['ide.kit.x.mp'] && EN['ide.kit.x.mp'] === 'This piece is not for multiplayer maps.', 'kit r2 refuse: not for multiplayer maps', P.msg());
      ok(await click('mi.x.inm') && P.msg() === 'This piece goes inside a mission block.', 'kit r2 scope: in:mission reads "inside a mission block"', P.msg());
      ok(await click('mi.x.inn') && P.msg() === 'This piece goes inside a named block.', 'kit r2 scope: in:* reads "inside a named block"', P.msg());
      ok(await click('mi.x.top') && P.msg() === fill('ide.kit.x.scope', { where: W('top'), n: 1 }), 'kit r2 scope: top with a near line', P.msg());
      ok(P.seen.plan.length >= 5 && P.seen.plan.every(r => r === MI), 'kit r2 rel: every plan call carries opts.rel', [...new Set(P.seen.plan)].join());
      P.row('mi.x.top').fire('focus'); await P.flush();
      ok(P.pv().has(fill('ide.kit.goes', { where: W('top') })), 'kit r2 scope: the preview says where it goes');
      await P.find('Mission line'); P.row('mi.x.inm').fire('focus'); await P.flush();
      ok(P.pv().has(fill('ide.kit.goes', { where: fill('ide.kit.w.in', { word: 'mission' }) })), 'kit r2 scope: the preview words in:mission');
      await P.find('Whole mission file'); P.row('mi.x.whole').fire('focus'); await P.flush();
      ok(P.pv().has(fill('ide.kit.goes', { where: W('empty') })) && P.pv().has(fill('ide.kit.wholeN')), 'kit r2 scope: a whole-file piece: goes into an empty file');
      const L = {}; for (const r of require('./lang/kit')) L[r[0]] = r;
      ok(['ide.kit.x.whole', 'ide.kit.x.mp', 'ide.kit.w.any', 'ide.kit.w.empty', 'ide.kit.w.in', 'ide.kit.w.inName'].every(k => L[k] && L[k].length === 5 && L[k].every(Boolean)), 'kit r2 lang: the refusals and the scope words in en, ru, uk, zh');
    }

    // a 400-line piece: nothing of it is built until its preview opens; then its line count and its code scroll inside the preview
    {
      const P = await miPage();
      P.secRow('mi.t1').click(); await P.flush(); P.secRow('mi.t1.s0').click(); await P.flush();
      const r = P.row('mi.x.big');
      ok(!!r && P.K().textContent.indexOf('big_line_') < 0 && P.pv().hidden, 'kit r2 large: the row is there, none of its code is in the DOM before the preview');
      r.fire('focus'); await P.flush();
      const pre = P.pv().all().find(e => cl(e, 'idk-code')), ln = P.pv().all().find(e => cl(e, 'idk-lines'));
      ok(!!pre && cl(pre, 'idk-code-l') && pre.textContent.indexOf('big_line_399') >= 0 && pre.getAttribute('tabindex') === '0', 'kit r2 large: the preview holds the whole code in a scrolling block', pre && pre.className);
      ok(!!ln && ln.textContent === fill('ide.kit.linesN', { n: 400 }), 'kit r2 large: the preview gives its line count', ln && ln.textContent);
      const kids = P.pv().children.map(e => e.className || ''), ip = kids.findIndex(c => /idk-code/.test(c)), ib = kids.findIndex(c => /idk-btns/.test(c));
      ok(ip >= 0 && ib > ip && !!P.pv().all().find(e => cl(e, 'idk-add')), 'kit r2 large: the buttons stay below the scrolling code', kids.join(' / '));
      const css = require('./ui/kit').css;
      ok(/\.idk-code-l\{max-height:[^;]+;overflow:auto\}/.test(css) && /\.idk-pv\{[^}]*overflow:auto/.test(css), 'kit r2 large: the code block scrolls inside the preview (max-height, overflow auto)');
      await P.find('Fake piece 2'); P.row('mi.f.2').fire('focus'); await P.flush();
      const p2 = P.pv().all().find(e => cl(e, 'idk-code'));
      ok(CBY['mi.f.2'].size === 'small' && !!p2 && !cl(p2, 'idk-code-l') && !P.pv().all().some(e => cl(e, 'idk-lines')), 'kit r2 large: a smaller piece: no line count, no scroll block', CBY['mi.f.2'].size);
    }
  }

  // ---- 24. page rules: script (with the injected planner) has no backtick, no dollar-brace, no HTML writes; every key in 4 languages;
  //          every lang/kit.js key used in ui/kit.js (as T('name'), 'ide.kit.name', or in the declared KIT_KEYS list)
  {
    const UI = require('./ui/kit'), rows = require('./lang/kit'), src = fs.readFileSync(path.join(__dirname, 'ui', 'kit.js'), 'utf8');
    const s = UI.script;
    ok(typeof s === 'string' && s.length > 0 && s.indexOf('function kitPlan()') >= 0 && s.indexOf('function kitKinds()') >= 0, 'kit 24: script carries kitPlan and kitKinds by toString');
    ok(!/`|\$\{/.test(s) && !/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(s), 'kit 24: no backtick, no dollar-brace, no HTML writes in the page script');
    const nonAscii = src.split('\n').map((l, i) => /[^\x00-\x7f]/.test(l) ? i + 1 : 0).filter(Boolean);
    ok(!nonAscii.length, 'kit 24: ui/kit.js source is ASCII (other characters as \\u escapes)', nonAscii.join());
    let parsed = true; try { new Function(s); } catch (e) { parsed = e.message; }
    ok(parsed === true, 'kit 24: the page script parses', parsed);
    ok(typeof UI.css === 'string' && !/#[0-9a-f]{3,6}\b/i.test(UI.css) && !/rgba?\((?!0,0,0,)/.test(UI.css), 'kit 24: css uses theme tokens only (neutral shadow allowed)');
    const L = {}; let shape = true;
    for (const r of rows) { if (!(Array.isArray(r) && r.length === 5 && r.every(x => typeof x === 'string' && x.length))) shape = false; L[r[0]] = r; }
    ok(shape && rows.length === Object.keys(L).length, 'kit 24: lang rows [key, en, ru, uk, zh], none empty, no doubled key');
    const slots = t => (t.match(/\{\w+\}/g) || []).sort().join();
    const badSlots = rows.filter(r => r.slice(2).some(t => slots(t) !== slots(r[1]))).map(r => r[0]);
    ok(!badSlots.length, 'kit 24: the same {slots} in every language', badSlots.join());
    const style = rows.filter(r => r.slice(1).some(t => /—| - |\bas64\b/.test(t))).map(r => r[0]);
    ok(!style.length, 'kit 24: no em dash, no spaced hyphen, AS64 in capitals', style.join());
    const body = src.slice(src.indexOf('String.raw'));
    const used = new Set();
    for (const m of body.matchAll(/\bT\('([A-Za-z0-9_.]+)'/g)) used.add('ide.kit.' + m[1]);
    for (const m of body.matchAll(/(ls(?:Get|Set)\()?'(ide\.kit\.[A-Za-z0-9_.]+)'/g)) if (!m[1] && !m[2].endsWith('.')) used.add(m[2]);   // not the LS names
    const missing = [...used].filter(k => !L[k]);
    ok(!missing.length, 'kit 24: every key the pane uses has a lang row', missing.join());
    const core = require('./lang/core'), en = require('../../lang/en.json'), CK = new Set(core.map(r => r[0]));
    const txKeys = [...body.matchAll(/\btx\('([A-Za-z0-9_.]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('.'));
    ok(txKeys.every(k => L[k] || CK.has(k) || en[k]), 'kit 24: every literal tx key exists', txKeys.filter(k => !(L[k] || CK.has(k) || en[k])).join());
    const unused = rows.map(r => r[0]).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
    ok(!unused.length, 'kit 24: every lang/kit.js key is used', unused.join());
    const dyn = /var KIT_KEYS=\[([^\]]*)\]/.exec(body);
    ok(!!dyn && dyn[1].split(',').every(x => L[x.trim().replace(/^'|'$/g, '')]), 'kit 24: the declared dynamic key list names real keys only');
  }
};
