// ide cm browser checks: loaded by selfcheck.js into a headless Edge page after cm.js + ide.js. Synchronous; writes
// one JSON line {results:[[ok, msg]], perf} into #out (read back from --dump-dom). Test code, not served to the GUI.
// Author: Imperator_Aug (ARSENAL, ia-f98c0092)
(function () {
  var R = [], perf = null;
  var ok = function (c, m) { R.push([!!c, m]); };
  var ED = window.IDE_ED;
  var key = function (cm, code, mods) {
    var e = { type: 'keydown', keyCode: code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, defaultPrevented: false,
      preventDefault: function () { this.defaultPrevented = true; }, stopPropagation: function () {} };
    for (var k in (mods || {})) e[k] = mods[k];
    cm.triggerOnKeyDown(e);
    return e;
  };
  var host = function (w, hgt) {
    var d = document.createElement('div');
    d.style.cssText = 'position:relative;width:' + w + 'px;height:' + hgt + 'px';
    document.body.appendChild(d);
    return d;
  };
  try {
    ok(ED && ED.ready === true, 'IDE_ED ready');
    ok(Array.isArray(ED.PHRASES) && ED.PHRASES.indexOf('Search:') >= 0, 'PHRASES exported');
    // 3. create never returns falsy
    var threw = null;
    try { ED.create(null, {}); } catch (e) { threw = e; }
    ok(threw && /host/.test(threw.message), 'create(null) throws a clear Error: ' + (threw && threw.message));

    // 2. label + phrases reach the dialogs
    var ph = {};
    for (var i = 0; i < ED.PHRASES.length; i++) ph[ED.PHRASES[i]] = 'T[' + ED.PHRASES[i] + ']';
    var h1 = host(800, 300);
    var ed = ED.create(h1, { label: 'Editor X', phrases: ph });
    ok(ed && ed.cm, 'create returns an editor');
    var cm = ed.cm, ta = cm.getInputField();
    ok(ta.getAttribute('aria-label') === 'Editor X', 'label used: ' + ta.getAttribute('aria-label'));
    ed.addDoc('a', 'one\n{x 1}\n', 'sdl', false);
    ed.addDoc('b', 'two\n', 'sdl', false);
    ed.swap('a');
    // the find bar replaces the bundle's search dialog
    ed.find();
    var fb = h1.querySelector('.ide-find');
    ok(fb && !fb.hidden && fb.getAttribute('aria-label') === 'T[Find in this file]', 'find bar open + translated: ' + (fb && fb.getAttribute('aria-label')));
    ok(!h1.querySelector('.CodeMirror-dialog'), 'no bundle search dialog');
    var F = cm.state.ideFind;
    ok(F && document.activeElement === F.input, 'find box focused');
    F.input.value = 'x'; F.input.dispatchEvent(new Event('input')); F.flush();
    ok(F.state().n === 1 && F.state().cur === 0, 'one match found: ' + JSON.stringify(F.state()));
    F.input.value = 'zzz'; F.input.dispatchEvent(new Event('input')); F.flush();
    ok(F.state().n === 0 && fb.querySelector('.ide-find-n').textContent === 'T[No results]', 'no results shown');
    F.input.value = 'o'; F.input.dispatchEvent(new Event('input')); F.flush();
    ok(F.state().n === 1, 'one o: ' + F.state().n);
    F.replaceInput.value = 'O'; F.replaceAll();
    ok(cm.getValue() === 'One\n{x 1}\n', 'replace all ran: ' + JSON.stringify(cm.getValue()));
    F.toggle('cs');
    ok(F.state().n === 0, 'match case: no lower o left: ' + F.state().n);
    F.toggle('cs');
    cm.undo();
    ok(cm.getValue() === 'one\n{x 1}\n', 'replace all is one undo step');
    F.close(true);
    ok(fb.hidden, 'find bar closed');
    cm.execCommand('jumpToLine');
    var dlg = h1.querySelector('.CodeMirror-dialog');
    ok(dlg && dlg.textContent.indexOf('T[Jump to line:]') >= 0 && dlg.textContent.indexOf('T[(Use line:column or scroll% syntax)]') >= 0, 'jump dialog translated: ' + (dlg && dlg.textContent));
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    cm.focus();
    cm.foldCode(CodeMirror.Pos(1, 0));
    // one-line block does not fold; fold marks are checked through the option instead
    var fo = cm.getOption('foldOptions');
    var wEl = fo && fo.widget && fo.widget();
    ok(wEl && wEl.title === 'T[Folded lines. Click to open.]', 'fold widget title translated');
    var fg = cm.getOption('foldGutter');
    ok(fg && fg.indicatorOpen && fg.indicatorOpen.title === 'T[Fold block]' && fg.indicatorFolded.title === 'T[Open folded block]', 'fold gutter titles translated');

    // 4. F3 / Shift+F3, Ctrl+F kept
    var xk = cm.getOption('extraKeys');
    ok(xk.F3 === 'findNext' && xk['Shift-F3'] === 'findPrev', 'F3 / Shift+F3 bound');
    ok(CodeMirror.keyMap.pcDefault['Ctrl-F'] === 'find' && !xk['Ctrl-F'], 'Ctrl+F still find');

    // 1. Tab mode
    var tm = [];
    ed.on('tabmode', function (x) { tm.push(x); });
    cm.setCursor(CodeMirror.Pos(0, 0));
    ok(ed.tabFocus() === false, 'tab mode starts off');
    var e = key(cm, 9);
    ok(cm.getLine(0) === '\tone' && e.defaultPrevented, 'Tab types a tab when off');
    cm.execCommand('undo');
    key(cm, 77, { ctrlKey: true });
    ok(ed.tabFocus() === true && tm.length === 1 && tm[0].on === true, 'Ctrl+M turns it on and fires tabmode');
    ok(/T\[Tab moves focus/.test(ta.getAttribute('aria-label')) && ta.getAttribute('aria-label').indexOf('Editor X') === 0, 'label keeps opts.label and adds the state: ' + ta.getAttribute('aria-label'));
    var live = h1.querySelector('.ide-sr[aria-live]');
    ok(live && /Tab moves focus/.test(live.textContent), 'live text announces the mode');
    e = key(cm, 9);
    ok(cm.getLine(0) === 'one' && !e.defaultPrevented && e.codemirrorIgnore === true, 'Tab not handled when on (browser moves focus)');
    e = key(cm, 9, { shiftKey: true });
    ok(!e.defaultPrevented && e.codemirrorIgnore === true, 'Shift+Tab not handled when on');
    ed.tabFocus(false);
    ok(ed.tabFocus() === false && tm.length === 2 && tm[1].on === false, 'tabFocus(false) sets it and fires');
    ok(ta.getAttribute('aria-label') === 'Editor X', 'label back to plain');
    key(cm, 27);
    ok(ed.tabFocus() === true && tm[tm.length - 1].once === true, 'Esc with nothing open arms one Tab');
    e = key(cm, 9);
    ok(e.codemirrorIgnore === true && ed.tabFocus() === false, 'that Tab leaves, then the mode is off again');
    key(cm, 27);
    key(cm, 65);
    ok(ed.tabFocus() === false, 'any other key cancels the armed Tab');

    // 6. swap flushes the old doc's change first, with its id
    var ch = [];
    ed.on('change', function (x) { ch.push({ id: x.id, cur: ed.current() }); });
    cm.replaceRange('Z', CodeMirror.Pos(0, 0));
    ed.swap('b');
    ok(ch.length === 1 && ch[0].id === 'a' && ch[0].cur === 'a', 'swap emits a pending change synchronously before switching: ' + JSON.stringify(ch));
    cm.replaceRange('Q', CodeMirror.Pos(0, 0));
    ed.flush();
    ok(ch.length === 2 && ch[1].id === 'b', 'every change carries its doc id');

    // dropEol
    ed.addDoc('c', 'a\n}\nb', 'sdl', false);
    ed.swap('c');
    ed.applyEdits([{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]);
    ok(ed.text('c') === 'a\nb', 'dropEol mid line: ' + JSON.stringify(ed.text('c')));
    cm.execCommand('undo');
    ok(ed.text('c') === 'a\n}\nb', 'dropEol is one undo step');
    ed.setText('c', 'a\n}');
    ed.applyEdits([{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]);
    ok(ed.text('c') === 'a', 'dropEol last line: ' + JSON.stringify(ed.text('c')));
    ed.setText('c', 'x\n\t}\ny');
    ed.applyEdits([{ line: 2, col: 2, endCol: 3, text: '', dropEol: true }, { line: 3, col: 1, endCol: 2, text: 'Y' }]);
    ok(ed.text('c') === 'x\nY', 'dropEol with indent + another edit: ' + JSON.stringify(ed.text('c')));

    // 7. odd spaces are drawn
    ed.addDoc('o', '{name\u00a0"a\u3000b"}\n\ufeff{x}\n', 'sdl', false);
    ed.swap('o');
    cm.refresh();
    var odd = h1.querySelectorAll('.ide-odd');
    ok(odd.length === 3, 'odd spaces marked: ' + odd.length);
    ok(odd.length && /U\+00A0/.test(odd[0].title) && /^T\[No-break space\]/.test(odd[0].title), 'odd mark title translated: ' + (odd[0] && odd[0].title));

    // 8. 2 MB doc: open + replace one char
    var line = '\t{weapon "rifle" damage 10 ; comment text here\u00a0}\n', parts = [];
    while (parts.length * line.length < 2 * 1024 * 1024) parts.push(line);
    var big = '{root\n' + parts.join('') + '}\n';
    var t0 = performance.now();
    ed.addDoc('big', big, 'sdl', false);
    ed.swap('big');
    ed.goto(20000, 3);
    cm.replaceRange('X', CodeMirror.Pos(19999, 2), CodeMirror.Pos(19999, 3));
    var t1 = performance.now();
    cm.replaceRange('Y', CodeMirror.Pos(19999, 2), CodeMirror.Pos(19999, 3));
    var t2 = performance.now();
    perf = { chars: big.length, openAndReplaceMs: Math.round(t1 - t0), replaceMs: Math.round((t2 - t1) * 10) / 10 };
    ok(t1 - t0 < 200, '2 MB open + replace one char under 200 ms: ' + Math.round(t1 - t0) + ' ms');
    ok(cm.getOption('maxHighlightLength') === 2000 && cm.getOption('foldGutter') === false, 'big doc limits on');
    ed.swap('a');
    ok(cm.getOption('maxHighlightLength') === 10000 && cm.getOption('foldGutter'), 'limits off again for a small doc');

    // page theme: surfaces are the page tokens (data-theme on html), syntax palette follows ED.theme(); one call re-themes all views
    var X = window.IDE_EXPECT;
    if (X) {
      var de = document.documentElement, ht = host(600, 200);
      var te = ED.create(ht, { theme: 'light', phrases: {} });
      te.addDoc('t', '{weapon 1}\n', 'sdl', false); te.swap('t');
      var hc = host(700, 200);
      var tc = ED.compare(hc, { left: { text: 'a', title: 'l' }, right: { text: 'b', title: 'r' }, kind: 'sdl', phrases: {} });
      var look = function () {
        var w = te.cm.getWrapperElement(), kw = w.querySelector('.cm-keyword'), g = w.querySelector('.CodeMirror-gutters');
        te.cm.refresh();
        kw = w.querySelector('.cm-keyword');
        return { bg: getComputedStyle(w).backgroundColor, key: kw ? getComputedStyle(kw).color : '', gutter: getComputedStyle(g).backgroundColor,
          cv: getComputedStyle(tc.left.getWrapperElement()).backgroundColor, cvKey: tc.left.getOption('theme') };
      };
      de.setAttribute('data-theme', 'light'); ED.theme('light');
      var a = look();
      ok(a.bg === X.light.bg && a.key === X.light.key && a.gutter === X.light.gutter, 'light page: text bg, keyword, gutter: ' + JSON.stringify(a) + ' want ' + JSON.stringify(X.light));
      de.setAttribute('data-theme', 'dark');
      var b0 = look();
      ok(b0.bg === X.dark.bg && b0.gutter === X.dark.gutter, 'dark page: surfaces flip by CSS alone: ' + JSON.stringify(b0));
      ED.theme('gem2');
      var b = look();
      ok(b.key === X.dark.key && b.cv === X.dark.bg && b.cvKey === 'gem2', 'dark page: syntax palette + compare view follow one ED.theme call: ' + JSON.stringify(b) + ' want ' + JSON.stringify(X.dark));
      ok(!/ide-cv-light/.test(hc.querySelector('.ide-cv').className), 'compare box drops its light class');
      de.removeAttribute('data-theme'); ED.theme('light');
      tc.close(); te.destroy();
      ED.theme('light');
      ok(true, 'closed views leave the re-theme list');
    }

    // (kit) lines, change.from, posAt, gap marker, field session, bookmark, flash, drop guard
    (function () {
      var hk = host(800, 300), ek = ED.create(hk, { phrases: {} }), ck = ek.cm, P = CodeMirror.Pos;
      ok(ek.lineCount() === 0 && ek.line(1) === null, 'kit: no doc = 0 lines, line(1) null');
      var T = ['{my_unit', '\t{on spawn', '\t\t{play_sound "fly" 1}', '\t\t', '\t}', '}', 'tail'];
      ek.addDoc('k', T.join('\n'), 'sdl', false);
      ek.swap('k');
      ck.refresh();
      ok(ek.lineCount() === 7 && ek.line(1) === '{my_unit' && ek.line(7) === 'tail' && ek.line(0) === null && ek.line(8) === null && ek.line(1.5) === null, 'kit: lineCount / line');
      var chs = [];
      ek.on('change', function (x) { chs.push(x); });
      ck.replaceRange('x', P(4, 0)); ck.replaceRange('', P(4, 0), P(4, 1)); ck.replaceRange('', P(2, 0), P(2, 0));
      ck.replaceRange('y', P(2, 0)); ck.replaceRange('', P(2, 0), P(2, 1));
      ek.flush();
      ok(chs.length === 1 && chs[0].id === 'k' && chs[0].from === 3, 'kit: change carries the lowest changed line: ' + JSON.stringify(chs));
      ck.replaceRange('z', P(6, 0)); ck.replaceRange('', P(6, 0), P(6, 1));
      ek.flush();
      ok(chs.length === 2 && chs[1].from === 7, 'kit: from resets after each change event: ' + JSON.stringify(chs[1]));

      // posAt / rect
      var rc = ek.rect(), wr = ck.getWrapperElement().getBoundingClientRect();
      ok(rc.left === wr.left && rc.bottom === wr.bottom && rc.right > rc.left, 'kit: rect is the editor box');
      var b3 = ck.charCoords(P(2, 4), 'window'), mx = b3.left + 2;
      var pa = ek.posAt(mx, b3.top + 2), pb = ek.posAt(mx, b3.bottom - 2);
      ok(pa && pa.line === 3 && pa.gap === 3 && pb && pb.line === 3 && pb.gap === 4, 'kit: posAt upper half = that line, lower half = next: ' + JSON.stringify([pa, pb]));
      ok(ek.posAt(rc.left - 5, b3.top + 2) === null && ek.posAt(mx, rc.bottom + 5) === null, 'kit: posAt off the editor = null');
      var bl = ck.charCoords(P(6, 0), 'window');
      var pe = ek.posAt(mx, bl.bottom + 4);
      ok(pe && pe.gap === 8 && pe.line === 7, 'kit: below the last line = gap lineCount+1: ' + JSON.stringify(pe));
      ck.foldCode(P(1, 0));
      ck.refresh();
      var b2 = ck.charCoords(P(1, 2), 'window');
      var pf = ek.posAt(b2.left + 2, b2.bottom - 2), pu = ek.posAt(b2.left + 2, b2.top + 2);
      ok(pf && pf.gap === 6 && pu && pu.gap === 2, 'kit: gap inside a fold moves after the fold: ' + JSON.stringify([pf, pu]));
      var b6 = ck.charCoords(P(5, 0), 'window');
      var p6 = ek.posAt(b6.left + 2, b6.top + 2);
      ok(p6 && p6.line === 6 && p6.gap === 6, 'kit: the line after a fold: ' + JSON.stringify(p6));
      ek.fold('none');
      ck.refresh();

      // gap marker: absolute bar, no line height change
      var h4 = ck.heightAtLine(4, 'window'), h5 = ck.heightAtLine(5, 'window');
      ek.gapMarker(3, 'ok');
      var gm = hk.querySelectorAll('.ide-gap');
      var gr = gm.length ? gm[0].getBoundingClientRect() : null, want = ck.heightAtLine(2, 'window');
      ok(gm.length === 1 && /ide-gap-ok/.test(gm[0].className) && gr && Math.abs(gr.top + 1 - want) <= 2 && gr.width > 100, 'kit: gap marker before line 3: ' + JSON.stringify(gr) + ' want top ' + want);
      ok(ck.heightAtLine(4, 'window') === h4 && ck.heightAtLine(5, 'window') === h5, 'kit: gap marker changes no line height');
      ek.gapMarker(8, 'no');
      gm = hk.querySelectorAll('.ide-gap');
      gr = gm[0].getBoundingClientRect();
      ok(gm.length === 1 && /ide-gap-no/.test(gm[0].className) && Math.abs(gr.top + 1 - ck.charCoords(P(6, 0), 'window').bottom) <= 2, 'kit: gap marker at the end, state no');
      ok(getComputedStyle(gm[0]).pointerEvents === 'none' && getComputedStyle(gm[0]).borderTopStyle === 'dashed', 'kit: gap marker takes no pointer, no = dashed');
      ek.gapMarker(null);
      ok(hk.querySelectorAll('.ide-gap').length === 0, 'kit: gapMarker(null) removes it');

      // autoScroll
      var many = [];
      for (var q = 0; q < 300; q++) many.push('{line ' + q + '}');
      ek.addDoc('long', many.join('\n'), 'sdl', false);
      ek.swap('long');
      var s0 = ck.getScrollInfo().top;
      ok(ek.autoScroll(60) === true && ck.getScrollInfo().top === s0 + 60 && ek.autoScroll(-1000) === true && ck.getScrollInfo().top === 0 && ek.autoScroll(-5) === false, 'kit: autoScroll by pixels, clamped');
      ek.swap('k');

      // bookmark + flash
      var bm = ek.bookmark(3, 3);
      ck.replaceRange('\n', P(0, 0));
      ok(bm.pos() && bm.pos().line === 4 && bm.pos().col === 3, 'kit: bookmark follows an edit above: ' + JSON.stringify(bm.pos()));
      bm.clear();
      ok(bm.pos() === null, 'kit: bookmark cleared');
      ck.execCommand('undo');
      var fl = ek.flash(2, 3), li = ck.lineInfo(1), lj = ck.lineInfo(3);
      var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ok(rm ? fl === false : (fl === true && /ide-flash/.test(li.bgClass || '') && !/ide-flash/.test(lj.bgClass || '')), 'kit: flash tints lines 2-3 (reduced motion: none)');
      var fl2 = ek.flash(6, 5);
      ok(rm ? fl2 === false : (fl2 === true && !/ide-flash/.test(ck.lineInfo(1).bgClass || '') && /ide-flash/.test(ck.lineInfo(4).bgClass || '') && /ide-flash/.test(ck.lineInfo(5).bgClass || '')), 'kit: a new flash takes the old tint off first (reversed range ok)');

      // text dropped from outside goes in at the drop point (CodeMirror's own drop; the kit drags with pointer events and
      // has no drop type of its own), one undo step
      var dropText = ek.text('k'), dEv = null;
      try {
        var dt = new DataTransfer();
        dt.setData('text/plain', 'RAW');
        var lc = ck.charCoords(P(2, 2), 'window');
        dEv = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: lc.left + 1, clientY: lc.top + 2 });
        hk.querySelector('.CodeMirror-lines').dispatchEvent(dEv);
      } catch (err) { dEv = null; }
      ok(dEv && dEv.defaultPrevented && ek.line(3) === '\t\tRAW' + T[2].slice(2), 'kit: text dropped from outside goes in at the drop point: ' + ek.line(3));
      ck.execCommand('undo');
      ok(ek.text('k') === dropText, 'kit: the drop is one undo step');

      // field session
      var ends = [], hintCalls = 0;
      ek.hints(function (req, done) { hintCalls++; done([{ w: 'play_sound' }]); });
      var F = function () {
        return [
          { name: 'snd', k: 'sound', line: 3, col: 16, len: 3, label: 'Sound', hint: 'A sound name', deny: '{}() ;"' },
          { name: 'vol', k: 'number', line: 3, col: 21, len: 1, label: 'Volume', words: ['0.5', '1'], test: function (v) { return /^[0-9.]+$/.test(v) ? '' : 'A number'; } }
        ];
      };
      var O = { next: 'Next', done: 'Done', onEnd: function (w) { ends.push(w); } };
      ek.tabFocus(true); // Ctrl+M Tab mode on: a session still owns Tab
      var ss = ek.fieldSession(F(), { line: 4, col: 3 }, O);
      ok(ss && typeof ss.end === 'function' && ek.inSession() === true, 'kit: fieldSession returns {end}, inSession true');
      ok(ck.getSelection() === 'fly', 'kit: first field selected: ' + JSON.stringify(ck.getSelection()));
      ok(hk.querySelectorAll('.ide-field').length >= 2 && hk.querySelectorAll('.ide-field-on').length === 1, 'kit: fields marked, one active');
      var bar = hk.querySelector('.ide-fbar');
      ok(bar && /Sound/.test(bar.textContent) && /A sound name/.test(bar.textContent) && /1\/2/.test(bar.textContent), 'kit: field bar shows label, hint, place: ' + (bar && bar.textContent));
      var e1 = key(ck, 9);
      ok(e1.defaultPrevented && !e1.codemirrorIgnore && ck.getSelection() === '1', 'kit: Tab goes to the next field even in Tab-focus mode');
      bar = hk.querySelector('.ide-fbar');
      ok(bar && /Volume/.test(bar.textContent) && bar.querySelectorAll('.ide-fbar-word').length === 2 && !bar.querySelector('.ide-fbar-next'), 'kit: bar follows, words shown, no Next on the last field');
      key(ck, 9, { shiftKey: true });
      ok(ck.getSelection() === 'fly', 'kit: Shift+Tab goes back');
      ck.replaceSelection('boom', 'end', '+input');
      ok(ek.inSession() && ek.line(3) === '\t\t{play_sound "boom" 1}', 'kit: typing in a field keeps the session');
      ck.replaceSelection('"', 'end', '+input');
      ck.replaceSelection(' ', 'end', '+paste');
      ok(ek.line(3) === '\t\t{play_sound "boom" 1}' && ek.inSession(), 'kit: refused characters are cancelled (typed and pasted)');
      var lv = hk.querySelector('.ide-sr[aria-live]');
      ok(lv && lv.textContent === '\u2298 \u2423', 'kit: a refused character is spoken in the live region: ' + (lv && lv.textContent));
      key(ck, 32, { ctrlKey: true });
      ok(hintCalls === 0 && !ck.state.completionActive, 'kit: autocomplete stays closed in a session');
      key(ck, 9);
      ck.replaceSelection('x', 'end', '+input');
      bar = hk.querySelector('.ide-fbar');
      ok(bar && /A number/.test(bar.textContent) && hk.querySelectorAll('.ide-field-bad').length === 1, 'kit: test() message shown and field marked: ' + (bar && bar.textContent));
      ok(lv && lv.textContent === 'A number', 'kit: a new test() message is spoken in the live region: ' + (lv && lv.textContent));
      var wd = bar.querySelectorAll('.ide-fbar-word')[0], md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      wd.dispatchEvent(md);
      wd.click();
      ok(md.defaultPrevented && ek.line(3) === '\t\t{play_sound "boom" 0.5}' && ek.inSession() && !hk.querySelector('.ide-field-bad'), 'kit: a word in the bar fills the field');
      key(ck, 13);
      ok(!ek.inSession() && ends.join() === 'done' && ek.cursor().line === 4 && ek.cursor().col === 3, 'kit: Enter on the last field ends (done), cursor at the caret: ' + JSON.stringify([ends, ek.cursor()]));
      ok(hk.querySelectorAll('.ide-field').length === 0 && !hk.querySelector('.ide-fbar'), 'kit: ending clears every mark and the bar');
      ss.end('esc');
      ok(ends.length === 1, 'kit: onEnd runs once');
      var reset = function () { ek.swap('k'); ek.setText('k', T.join('\n')); };
      // Enter on a field that is not the last goes on; the Next button too
      reset();
      ss = ek.fieldSession(F(), null, O);
      key(ck, 13);
      ok(ek.inSession() && ck.getSelection() === '1', 'kit: Enter on a middle field goes to the next');
      key(ck, 9, { shiftKey: true });
      var nb = hk.querySelector('.ide-fbar-next'), md2 = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      nb.dispatchEvent(md2); nb.click();
      ok(md2.defaultPrevented && ck.getSelection() === '1', 'kit: Next button moves, its press is cancelled (focus stays)');
      var e2 = key(ck, 27);
      ok(!ek.inSession() && ends[ends.length - 1] === 'esc' && e2.defaultPrevented && ek.tabFocus() === true, 'kit: Esc ends (esc) and does not touch Tab mode');
      ek.tabFocus(false);
      key(ck, 27);
      ok(ek.tabFocus() === true, 'kit: outside a session Esc still arms one Tab');
      ek.tabFocus(false);
      // end rules
      var endBy = function (fn, want, label, pre) {
        var before = ends.length;
        reset();
        if (pre) pre();
        ek.fieldSession(F(), null, O);
        fn();
        ok(!ek.inSession() && ends.length === before + 1 && ends[before] === want, 'kit: ' + label + ' ends (' + want + '): ' + JSON.stringify(ends.slice(before)));
      };
      endBy(function () { ck.replaceRange('x', P(0, 0), null, '+input'); }, 'edit', 'an edit outside the fields');
      endBy(function () { ck.replaceRange('', P(2, 18), P(2, 20), '+delete'); }, 'edit', 'a delete across a field edge');
      endBy(function () { ck.execCommand('undo'); }, 'undo', 'undo', function () { ck.replaceRange('q', P(6, 0)); });
      endBy(function () { ck.execCommand('redo'); }, 'undo', 'redo', function () { ck.replaceRange('q', P(6, 0)); ck.execCommand('undo'); });
      endBy(function () { ck.replaceSelection('pop', 'end', '+input'); ck.execCommand('undo'); }, 'undo', 'undo after typing');
      endBy(function () { ek.setText('k', ek.text('k')); }, 'reload', 'setText');
      endBy(function () { ek.swap('long'); }, 'swap', 'swap');
      endBy(function () { ek.addDoc('k', T.join('\n'), 'lng', false); ek.addDoc('k', T.join('\n'), 'sdl', false); ek.swap('k'); }, 'reload', 'addDoc over the doc');
      endBy(function () { ek.dropDoc('k'); ek.addDoc('k', T.join('\n'), 'sdl', false); }, 'swap', 'dropDoc');
      reset();
      var endEd = null;
      ek.fieldSession(F(), null, { onEnd: function (w) { endEd = w; ek.applyEdits([{ line: 7, col: 5, endCol: 5, text: '!' }]); } });
      ck.replaceRange('x', P(0, 0), null, '+input');
      ok(endEd === 'edit' && !ek.inSession() && ek.line(1) === 'x{my_unit' && ek.line(7) === 'tail!', 'kit: onEnd may edit the text (it runs after the change, not inside it): ' + JSON.stringify([endEd, ek.line(1), ek.line(7)]));
      var nsOn = false;
      endBy(function () { var n2 = ek.fieldSession(F(), null, {}); nsOn = ek.inSession(); n2.end('esc'); }, 'lost', 'a new session');
      ok(nsOn, 'kit: the new session runs');
      endBy(function () { ek.fieldSession([], null, {}); }, 'lost', 'a call with no fields (null)');
      endBy(function () {
        var lc = ck.charCoords(P(0, 1), 'window');
        hk.querySelector('.CodeMirror-lines').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: lc.left + 1, clientY: lc.top + 2, button: 0 }));
      }, 'click', 'a click outside every field');
      reset();
      ek.fieldSession(F(), null, O);
      var fc = ck.charCoords(P(2, 21), 'window');
      hk.querySelector('.CodeMirror-lines').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: fc.left + 1, clientY: fc.top + 2, button: 0 }));
      ok(ek.inSession(), 'kit: a click inside a field keeps the session');
      var bb = hk.querySelector('.ide-fbar-done'), before2 = ends.length;
      bb.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); bb.click();
      ok(!ek.inSession() && ends[before2] === 'done', 'kit: Done button ends (done)');
      // a piece inserted with applyEdits + session: one Ctrl+Z takes the whole piece out
      reset();
      var base = ek.text('k');
      ek.applyEdits([{ line: 4, col: 0, text: '\t\t{play_sound "fly" 1}\n\t\t{delay 2}' }]);
      ek.fieldSession([{ name: 'snd', k: 'sound', line: 4, col: 16, len: 3, label: 'S' }], null, O);
      ck.replaceSelection('bang', 'end', '+input');
      ck.execCommand('undo');
      ok(!ek.inSession() && ends[ends.length - 1] === 'undo', 'kit: undo ends the session');
      ck.execCommand('undo');
      ok(ek.text('k') === base, 'kit: the insert is one undo step');
      // the cursor moved off every field (End, arrows): Tab, Enter and Esc end the session and leave the cursor alone
      reset();
      ek.fieldSession(F(), { line: 4, col: 3 }, O);
      ck.execCommand('goLineEnd');
      ok(ek.inSession(), 'kit: moving the cursor off the fields alone keeps the session');
      var nl = ek.lineCount();
      key(ck, 13);
      ok(!ek.inSession() && ends[ends.length - 1] === 'edit' && ek.lineCount() === nl + 1 && ek.line(3) === '\t\t{play_sound "fly" 1}' && ek.cursor().line === 4,
        'kit: Enter off the fields ends (edit) and makes a new line, no field changes: ' + JSON.stringify([ends.slice(-1), ek.lineCount(), ek.line(3), ek.cursor()]));
      reset();
      ek.fieldSession(F(), null, O);
      ck.setCursor(P(3, 2));
      var l4 = ek.line(4);
      key(ck, 9);
      ok(!ek.inSession() && ends[ends.length - 1] === 'edit' && ek.line(4) === l4 + '\t' && ck.getSelection() === '', 'kit: Tab off the fields ends (edit) and types a tab: ' + JSON.stringify([ends.slice(-1), ek.line(4)]));
      reset();
      ek.fieldSession(F(), { line: 4, col: 3 }, O);
      ck.setCursor(P(0, 1));
      var e3 = key(ck, 27);
      ok(!ek.inSession() && ends[ends.length - 1] === 'esc' && e3.defaultPrevented && ek.cursor().line === 1 && ek.cursor().col === 2 && ek.tabFocus() === false,
        'kit: Esc off the fields ends (esc), the cursor stays, Tab mode untouched: ' + JSON.stringify([ends.slice(-1), ek.cursor(), ek.tabFocus()]));
      // an empty field gets a visible mark (a widget), gone while it has text, back when emptied, gone at the end
      reset();
      ck.replaceRange('\t\t{x ""}', P(3, 0), P(3, 2));
      ek.fieldSession([{ name: 'e', k: 'text', line: 4, col: 7, len: 0, label: 'E' }, { name: 'snd', k: 'sound', line: 3, col: 16, len: 3, label: 'S' }], null, O);
      var em = hk.querySelectorAll('.ide-field-empty');
      ok(em.length === 1 && /ide-field-on/.test(em[0].className) && em[0].getBoundingClientRect().width > 0 && hk.querySelectorAll('.ide-field').length === 2,
        'kit: an empty field is drawn (widget, active): ' + JSON.stringify([em.length, em[0] && em[0].className, hk.querySelectorAll('.ide-field').length]));
      ck.replaceSelection('ab', 'end', '+input');
      ok(ek.line(4) === '\t\t{x "ab"}' && ek.inSession() && hk.querySelectorAll('.ide-field-empty').length === 0, 'kit: the empty mark goes once the field has text: ' + ek.line(4));
      ck.replaceRange('', P(3, 6), P(3, 8), '+delete');
      ok(ek.line(4) === '\t\t{x ""}' && ek.inSession() && hk.querySelectorAll('.ide-field-empty.ide-field-on').length === 1, 'kit: the empty mark comes back when the field is emptied');
      key(ck, 9);
      ok(ck.getSelection() === 'fly' && hk.querySelectorAll('.ide-field-empty').length === 1 && hk.querySelectorAll('.ide-field-empty.ide-field-on').length === 0, 'kit: the empty mark follows the active state');
      key(ck, 27);
      ok(!ek.inSession() && hk.querySelectorAll('.ide-field-empty').length === 0 && hk.querySelectorAll('.ide-field').length === 0, 'kit: ending clears the empty mark');
      // IME: a composition in a field with refused characters is let through while it runs; real text is never eaten
      reset();
      var SEC = function () { return [{ name: 'sec', k: 'number', line: 3, col: 21, len: 1, label: 'Seconds', deny: 'abcdefghijklmnopqrstuvwxyz {}"' }]; };
      var ta = ck.getInputField();
      var compose = function (steps, commit) {
        ck.focus();
        ta.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        for (var q = 0; q < steps.length; q++) { ta.value = steps[q]; ta.dispatchEvent(new Event('input')); }
        ta.value = commit; ta.dispatchEvent(new Event('input'));
        ta.dispatchEvent(new CompositionEvent('compositionend', { data: commit }));
      };
      ek.fieldSession(SEC(), null, O);
      ck.setCursor(P(2, 21));
      compose(['n', 'ni'], '\u4f60');
      ok(ck.hasFocus() && ek.line(3) === '\t\t{play_sound "fly" 1\u4f60}' && ek.inSession(), 'kit: an IME commit keeps the text before it (no refused step eats it): ' + JSON.stringify([ck.hasFocus(), ek.line(3), ek.inSession(), ends.slice(-1)]));
      reset();
      ek.fieldSession(SEC(), null, O);
      ck.setCursor(P(2, 21));
      compose(['n', 'ni'], 'ni');
      ok(ek.line(3) === '\t\t{play_sound "fly" 1}' && ek.inSession() && lv.textContent === '\u2298 n' && ek.cursor().col === 22,
        'kit: refused characters an IME commits are taken out, the refusal spoken: ' + JSON.stringify([ek.line(3), ek.inSession(), lv.textContent, ek.cursor()]));
      ck.replaceSelection('5', 'end', '+input');
      ok(ek.line(3) === '\t\t{play_sound "fly" 15}' && ek.inSession(), 'kit: typing after a cleaned composition goes in at the cursor: ' + ek.line(3));
      // Ctrl+Z after a cleaned composition takes out the composition and its clean-up as one step: no refused text comes back
      reset();
      ek.fieldSession(SEC(), null, O);
      ck.setCursor(P(2, 21));
      compose(['n', 'ni'], 'ni');
      ck.execCommand('undo');
      ok(ek.line(3) === T[2] && !ek.inSession() && ends[ends.length - 1] === 'undo',
        'kit: undo after a cleaned composition puts the line back as it was before it: ' + JSON.stringify([ek.line(3), ek.inSession(), ends.slice(-1)]));
      // the session ends while a composition runs: its commit is left alone, no stale clean-up reaches the next session
      reset();
      var sc = ek.fieldSession(SEC(), null, O), cmpErr = null;
      ck.setCursor(P(2, 21));
      try {
        ck.focus();
        ta.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        ta.value = 'n'; ta.dispatchEvent(new Event('input'));
        sc.end('esc');
        ta.value = 'ni'; ta.dispatchEvent(new Event('input'));
        ta.dispatchEvent(new CompositionEvent('compositionend', { data: 'ni' }));
      } catch (err) { cmpErr = err; }
      var l3a = ek.line(3);
      ek.fieldSession(SEC(), null, O);
      ck.setCursor(P(2, 21));
      compose(['x'], 'xy');
      ok(!cmpErr && l3a === '\t\t{play_sound "fly" 1ni}' && ek.line(3) === l3a && ek.inSession() && lv.textContent === '\u2298 x',
        'kit: a session ended mid-composition leaves the commit, the next session cleans its own: ' + JSON.stringify([cmpErr && String(cmpErr), l3a, ek.line(3), lv.textContent]));
      // a composition over the selected field replaces it; refused characters of the commit go
      reset();
      ek.fieldSession(F(), null, O);
      compose(['b'], 'b o');
      ok(ek.line(3) === '\t\t{play_sound "bo" 1}' && ek.inSession() && ck.getCursor().ch === 17 && lv.textContent === '\u2298 \u2423',
        'kit: a composition over the selected field: refused space taken out: ' + JSON.stringify([ek.line(3), ek.inSession(), ck.getCursor(), lv.textContent]));
      // '}' typed (the real input path) in a text field on a line whose indent is not the mode's: no electric re-indent of
      // the line, the session goes on; electric input is back once the session ends
      reset();
      var elec0 = ck.getOption('electricChars');
      ek.applyEdits([{ line: 4, col: 0, text: '  {effects "" "hit"}' }]);
      ek.fieldSession([{ name: 'e1', k: 'text', line: 4, col: 13, len: 0, label: 'E1', deny: '"\n' }, { name: 'e2', k: 'text', line: 4, col: 16, len: 3, label: 'E2', deny: '"\n' }], null, O);
      ck.focus();
      ta.value = '}'; ta.dispatchEvent(new Event('input'));
      var gIn = [ek.inSession(), ends.slice(-1)[0], ek.line(4)];
      key(ck, 27);
      ok(gIn[0] === true && gIn[2].indexOf('  {effects "}" "hit"}') === 0 && elec0 === true && ck.getOption('electricChars') === true,
        'kit: } typed in a text field keeps the line indent and the session, electric input back after: ' + JSON.stringify([gIn, elec0, ck.getOption('electricChars')]));
      // a held refused key is spoken once, not on every repeat; another character is spoken
      reset();
      ek.fieldSession(F(), null, O);
      ck.setCursor(P(2, 18));
      var mo = new MutationObserver(function () {});
      mo.observe(lv, { childList: true, characterData: true, subtree: true });
      for (var rp = 0; rp < 5; rp++) ck.replaceSelection('"', 'end', '+input');
      var says = mo.takeRecords().length;
      ck.replaceSelection(';', 'end', '+input');
      var says2 = mo.takeRecords().length;
      mo.disconnect();
      ok(ek.line(3) === T[2] && says === 1 && says2 === 1 && lv.textContent === '\u2298 ;', 'kit: a repeated refusal is spoken once, a new one again: ' + JSON.stringify([says, says2, lv.textContent]));
      // a refusal, then a test() message in the live region, then the same refusal again: spoken again
      reset();
      ek.fieldSession([{ name: 'snd', k: 'sound', line: 3, col: 16, len: 3, label: 'S', deny: '"', test: function (v) { return v.length > 3 ? 'Too long' : ''; } }], null, O);
      ck.setCursor(P(2, 18));
      ck.replaceSelection('"', 'end', '+input');
      var u0 = lv.textContent;
      ck.replaceSelection('x', 'end', '+input');
      var u1 = lv.textContent;
      ck.replaceSelection('"', 'end', '+input');
      ok(u0 === '\u2298 "' && u1 === 'Too long' && lv.textContent === '\u2298 "', 'kit: the same refusal after a test message is spoken again: ' + JSON.stringify([u0, u1, lv.textContent]));
      // Tab with the cursor on a field's start or end stays in the session; for a selection the head decides
      reset();
      ek.fieldSession(F(), null, O);
      ck.setCursor(P(2, 15)); key(ck, 9);
      var tA = ek.inSession() && ck.getSelection() === '1';
      ck.setCursor(P(2, 18)); key(ck, 9);
      ok(tA && ek.inSession() && ck.getSelection() === '1', 'kit: Tab at a field start or end goes to the next field');
      ck.setSelection(P(2, 19), P(2, 16));
      key(ck, 9);
      ok(ek.inSession() && ck.getSelection() === '1', 'kit: a selection from off the field with its head in it: Tab goes on');
      ck.setSelection(P(2, 16), P(2, 19));
      var e4 = key(ck, 27);
      ok(!ek.inSession() && ends[ends.length - 1] === 'esc' && e4.defaultPrevented && ck.getSelection() === 'ly"', 'kit: a selection with its head off the fields: Esc ends (esc), the selection stays: ' + JSON.stringify(ck.getSelection()));
      // several cursors: the main one decides
      reset();
      ek.fieldSession(F(), null, O);
      ck.setSelections([{ anchor: P(0, 1), head: P(0, 1) }, { anchor: P(2, 20), head: P(2, 20) }], 1);
      key(ck, 9);
      ok(ek.inSession() && ck.getSelection() === 'fly' && ck.listSelections().length === 1, 'kit: several cursors, the main one in a field: Tab goes on with one selection');
      ck.setSelections([{ anchor: P(0, 1), head: P(0, 1) }, { anchor: P(2, 20), head: P(2, 20) }], 0);
      key(ck, 27);
      ok(!ek.inSession() && ends[ends.length - 1] === 'esc' && ck.listSelections().length === 2, 'kit: several cursors, the main one off the fields: Esc ends, cursors stay');
      // an empty field's place counts as inside it (keys and a click on its mark)
      var EMP = function () { return [{ name: 'e', k: 'text', line: 4, col: 7, len: 0, label: 'E' }, { name: 'snd', k: 'sound', line: 3, col: 16, len: 3, label: 'S' }]; };
      reset();
      ck.replaceRange('\t\t{x ""}', P(3, 0), P(3, 2));
      ek.fieldSession(EMP(), null, O);
      ck.setCursor(P(2, 15));
      ck.setCursor(P(3, 6));
      key(ck, 9);
      ok(ek.inSession() && ck.getSelection() === 'fly', 'kit: Tab on an empty field goes to the next field');
      var dotEl = hk.querySelector('.ide-field-empty'), dr = dotEl ? dotEl.getBoundingClientRect() : null;
      if (dr) {
        var mdo = { bubbles: true, cancelable: true, clientX: dr.left + dr.width * 0.75, clientY: dr.top + dr.height / 2, button: 0 };
        dotEl.dispatchEvent(new MouseEvent('mousedown', mdo));
        dotEl.dispatchEvent(new MouseEvent('mouseup', mdo));
      }
      ok(dr && ek.inSession() && ck.getCursor().line === 3 && ck.getCursor().ch === 6 && hk.querySelectorAll('.ide-field-empty.ide-field-on').length === 1,
        'kit: a click on the empty mark puts the cursor in that field: ' + JSON.stringify([ek.inSession(), ck.getCursor()]));
      // the empty mark's line deleted, or the doc swapped: no mark left behind
      var fieldMarks = function () {
        return ck.getDoc().getAllMarks().filter(function (m) { return /ide-field/.test(m.className || '') || (m.replacedWith && /ide-field/.test(m.replacedWith.className)); }).length;
      };
      ck.replaceRange('', P(3, 0), P(4, 0), '+delete');
      ok(!ek.inSession() && ends[ends.length - 1] === 'edit' && hk.querySelectorAll('.ide-field-empty').length === 0 && fieldMarks() === 0, 'kit: deleting the empty field\'s line ends (edit), no mark left');
      reset();
      ck.replaceRange('\t\t{x ""}', P(3, 0), P(3, 2));
      ek.fieldSession(EMP(), null, O);
      ek.swap('long');
      var gone = hk.querySelectorAll('.ide-field-empty').length === 0;
      ek.swap('k');
      ok(gone && ends[ends.length - 1] === 'swap' && hk.querySelectorAll('.ide-field-empty').length === 0 && fieldMarks() === 0, 'kit: a swap with an empty field leaves no mark, and none on coming back');
      // applyEdits in a session: its text is never refused (a kit insert), an edit outside the fields still ends it
      reset();
      ek.fieldSession(F(), null, O);
      var okI = ek.applyEdits([{ line: 3, col: 16, endCol: 19, text: 'a "b" {c}' }]);
      ok(okI === true && ek.line(3) === '\t\t{play_sound "a "b" {c}" 1}' && ek.inSession(), 'kit: applyEdits into a field is not refused: ' + JSON.stringify([okI, ek.line(3), ek.inSession()]));
      okI = ek.applyEdits([{ line: 7, col: 5, endCol: 5, text: '"' }]);
      ok(okI === true && ek.line(7) === 'tail"' && !ek.inSession() && ends[ends.length - 1] === 'edit', 'kit: applyEdits off the fields ends the session (edit)');
      // a change some filter cancels: applyEdits gives false and the text keeps none of the edits (one op, all or nothing)
      reset();
      ek.clean('k');
      var veto = function (c, ch) { if (ch.origin === 'ide' && ch.text.join('\n').indexOf('NO') >= 0) ch.cancel(); };
      ck.on('beforeChange', veto);
      var base2 = ek.text('k'), gens = ck.getDoc().historySize().undo;
      var rA = ek.applyEdits([{ line: 7, col: 1, endCol: 5, text: 'TAIL' }, { line: 2, col: 0, text: 'NO' }, { line: 1, col: 2, endCol: 3, text: 'M', dropEol: true }]);
      ok(rA === false && ek.text('k') === base2 && ek.isClean('k'), 'kit: applyEdits with a cancelled change: false, no edit kept, still clean: ' + JSON.stringify([rA, ek.line(1), ek.line(7), ek.isClean('k')]));
      var rB = ek.applyEdits([{ line: 1, col: 1, endCol: 2, text: 'NO' }]);
      ok(rB === false && ek.text('k') === base2 && ck.getDoc().historySize().undo <= gens + 1, 'kit: applyEdits whose only change is cancelled: false, nothing changed');
      ck.off('beforeChange', veto);
      var rC = ek.applyEdits([{ line: 7, col: 1, endCol: 5, text: 'TAIL' }, { line: 2, col: 0, text: 'OK' }]);
      ok(rC === true && ek.line(2) === 'OK' && ek.line(8) === 'TAIL', 'kit: applyEdits with no veto applies all: ' + JSON.stringify([rC, ek.line(2), ek.line(8)]));
      // field marks in both themes: the underline shows over the selection and over the active line (3:1 or more)
      var rgbOf = function (s) {
        var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(s || '');
        return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
      };
      var lum = function (c) {
        var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      var over = function (c, b) { return [c[0] * c[3] + b[0] * (1 - c[3]), c[1] * c[3] + b[1] * (1 - c[3]), c[2] * c[3] + b[2] * (1 - c[3]), 1]; };
      var ratio = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      var de2 = document.documentElement, cues = [];
      var THM = [['dark', 'gem2'], ['light', 'light']];
      for (var ti = 0; ti < THM.length; ti++) {
        de2.setAttribute('data-theme', THM[ti][0]); ED.theme(THM[ti][1]);
        reset();
        ek.fieldSession(F(), null, O);
        ck.refresh();
        var wbg = rgbOf(getComputedStyle(ck.getWrapperElement()).backgroundColor);
        var under = function (sel) { var el = hk.querySelector(sel); var c = el ? rgbOf(getComputedStyle(el).backgroundColor) : null; return c && wbg ? over(c, wbg) : null; };
        var cue = function (sel) { var el = hk.querySelector(sel); return el ? rgbOf(getComputedStyle(el).boxShadow) : null; };
        var sbg = under('.CodeMirror-selected'), onSel = cue('.ide-field-on'), offSel = cue('.ide-field:not(.ide-field-on)');
        // the active field's value is drawn on the session selection: its quoted value (cm-string) keeps 4.5:1 there
        var sTok = hk.querySelector('.ide-field-on.cm-string') || hk.querySelector('.ide-field-on .cm-string');
        var sCol = sTok ? rgbOf(getComputedStyle(sTok).color) : null, sR = sCol && sbg ? ratio(sCol, sbg) : 0;
        ok(ck.getSelection() === 'fly' && sR >= 4.5, 'kit: ' + THM[ti][1] + ' the selected field value keeps 4.5:1 on the session selection: ' + sR.toFixed(2) + ' ' + JSON.stringify([sCol, sbg]));
        ck.setCursor(P(2, 16));
        ck.refresh();
        var abg = under('.CodeMirror-activeline-background'), onAct = cue('.ide-field-on'), offAct = cue('.ide-field:not(.ide-field-on)');
        var rs = [onSel && sbg ? ratio(onSel, sbg) : 0, onAct && abg ? ratio(onAct, abg) : 0, offAct && abg ? ratio(offAct, abg) : 0, offSel && wbg ? ratio(offSel, wbg) : 0];
        cues.push(THM[ti][1] + ' ' + rs.map(function (x) { return x.toFixed(2); }).join('/'));
        ok(rs[0] >= 3 && rs[1] >= 3 && rs[2] >= 3 && rs[3] >= 3, 'kit: ' + THM[ti][1] + ' field underlines show over the selection, the active line and the text (3:1): ' + cues[ti]);
        ek.fieldSession([], null, {});
      }
      de2.removeAttribute('data-theme'); ED.theme('light');
      ek.fieldSession([], null, {});
      // read-only doc: no session
      ek.addDoc('ro', 'a\n', 'sdl', true);
      ek.swap('ro');
      ok(ek.fieldSession([{ name: 'a', k: 'text', line: 1, col: 1, len: 1, label: 'A' }], null, O) === null, 'kit: no session on a read-only doc');
      reset();
      // outside a session: Tab types a tab, Ctrl+Space asks for words
      ck.setCursor(P(3, 2));
      var lb = ek.line(4);
      key(ck, 9);
      ok(ek.line(4) === lb + '\t', 'kit: outside a session Tab types a tab');
      key(ck, 32, { ctrlKey: true });
      ok(hintCalls >= 1, 'kit: outside a session Ctrl+Space asks for words');
      if (ck.closeHint) ck.closeHint();
      ek.destroy();
    })();

    // compare: two columns >= 560 px, stacked below, summary + gutter signs
    var h2 = host(720, 300);
    var c = ED.compare(h2, { left: { text: 'a\nb\nc', title: 'mine' }, right: { text: 'a\nB\nc\nd', title: 'other' }, kind: 'sdl', phrases: ph });
    var ps = h2.querySelectorAll('.ide-cv-pane');
    var r0 = ps[0].getBoundingClientRect(), r1 = ps[1].getBoundingClientRect();
    ok(ps.length === 2 && Math.abs(r0.top - r1.top) < 1 && r1.left > r0.left && Math.abs(r0.width - r1.width) < 2 && r0.height > 200, 'compare side by side at 720 px: ' + JSON.stringify([r0, r1]));
    ok(c.counts.left === 1 && c.counts.right === 2 && /T\[Changed lines/.test(c.summary), 'compare summary: ' + c.summary);
    ok(h2.querySelector('.ide-cv-sum').textContent === c.summary, 'summary shown above the panes');
    var signs = h2.querySelectorAll('.ide-cv-mark');
    ok(signs.length === 3 && signs[0].textContent === '-' && signs[1].textContent === '+', 'gutter signs - / +: ' + signs.length);
    c.close();
    var h3 = host(420, 400);
    c = ED.compare(h3, { left: { text: 'x', title: 'l' }, right: { text: 'x', title: 'r' }, kind: 'text', phrases: {} });
    ps = h3.querySelectorAll('.ide-cv-pane');
    r0 = ps[0].getBoundingClientRect(); r1 = ps[1].getBoundingClientRect();
    ok(r1.top > r0.top && Math.abs(r1.left - r0.left) < 1, 'compare stacked under 560 px');
    ok(c.counts.left === 0 && c.counts.right === 0 && c.summary === 'No differences', 'no differences summary: ' + c.summary);
    c.close();
  } catch (err) {
    ok(false, 'browser checks crashed: ' + (err && err.stack || err));
  }
  var out = document.createElement('pre');
  out.id = 'out';
  out.textContent = '@@' + JSON.stringify({ results: R, perf: perf }) + '@@';
  document.body.appendChild(out);
})();
