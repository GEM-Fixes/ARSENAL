// ide cm editor: window.IDE_ED per tools/ide/README.md "IDE_ED" (served raw in ide.js after cm.js). ES5 only,
// public CodeMirror 5 API only, DOM built with createElement + textContent.
// Positions: 1-based line/col outside, 0-based CodeMirror Pos inside (converted here only).
// Author: Imperator_Aug (ARSENAL, ia-8ded09a2)
var CM = window.CodeMirror;
// Every English text the editor can show, as CodeMirror phrase keys: the bundle's own dialogs (search, replace, jump to
// line) and ours (labels, Tab mode, fold marks, odd spaces). create(host, {phrases:{key: translation}}) translates them.
// selfcheck.js proves the bundle has no phrase() call missing from this list.
var IDE_PHRASES = [
  // addon/search/search.js
  'Search:', '(Use /re/ syntax for regexp search)', 'With:', 'Replace?', 'Yes', 'No', 'All', 'Stop',
  'Replace all:', 'Replace:', 'Replace with:',
  // addon/search/jump-to-line.js
  'Jump to line:', '(Use line:column or scroll% syntax)',
  // ours
  'Code editor', 'Compare',
  'Tab moves focus (Ctrl+M to change)', 'Tab types a tab (Ctrl+M to change)', 'Next Tab moves focus',
  'Folded lines. Click to open.', 'Fold block', 'Open folded block',
  'No-break space', 'Full-width space', 'Zero-width no-break space (BOM)', 'Hidden character',
  'No differences', 'Changed lines: {left} on the left, {right} on the right', '(long files: lines compared by position)',
  // ours: the find / replace bar (findBar)
  'Find in this file', 'Find', 'Replace with', 'Match case (Alt+C)', 'Whole word', 'Regular expression (Alt+R)',
  'Previous match (Shift+Enter)', 'Next match (Enter)', 'Show replace (Ctrl+H)', 'Close (Esc)', 'Replace', 'Replace all',
  'Replace this match (Enter)', 'Replace every match (Ctrl+Alt+Enter)', '{i} of {n}', 'No results', 'Bad pattern',
  'Replaced {n}', 'This text is read-only.', 'Wrapped around', '{n} times'
];
var NO_CM = 'The text engine (CodeMirror, cm.js) did not load, so the editor cannot start.';
var ED = window.IDE_ED = {
  ready: false,
  PHRASES: IDE_PHRASES.slice(),
  create: function () { throw new Error(NO_CM); },
  compare: function () { throw new Error(NO_CM); }
};

if (CM) {
  ideModes(CM, { atoms: IDE_ATOMS });

  // syntax palette by the page's effective theme (the shell tells us: IDE_THEME); surfaces are page tokens in the CSS
  var THEMES = { gem2: 'gem2', dark: 'gem2', light: 'idelight', idelight: 'idelight' };
  var MODES = { sdl: 'sdl', lng: 'lng', po: 'po', log: 'log', lua: 'lua', text: 'text' };
  var SEV = { error: 3, warn: 2, info: 1 };
  var curTheme = 'gem2';
  // every live editor and compare view registers a re-theme function here; ED.theme() runs them all
  var LIVE = [];
  var normTheme = function (name) { return name === 'light' || name === 'idelight' ? 'light' : 'gem2'; };

  var modeOf = function (kind) { return MODES.hasOwnProperty(kind) ? MODES[kind] : 'text'; };
  var themeOf = function (name) { return THEMES.hasOwnProperty(name) ? THEMES[name] : 'gem2'; };
  var unlive = function (f) { for (var i = LIVE.length - 1; i >= 0; i--) if (LIVE[i] === f) LIVE.splice(i, 1); };
  ED.theme = function (name) {
    curTheme = normTheme(name);
    var l = LIVE.slice();
    for (var i = 0; i < l.length; i++) { try { l[i](curTheme); } catch (e) { logErr(e); } }
    return curTheme;
  };
  var mk = function (tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  };
  var hasClass = function (el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0; };
  var addClass = function (el, c) { if (!hasClass(el, c)) el.className = (el.className ? el.className + ' ' : '') + c; };
  var rmClass = function (el, c) { el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); };
  var inside = function (el, root) { while (el) { if (el === root) return true; el = el.parentNode; } return false; };
  var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  var logErr = function (e) { if (window.console && console.error) console.error(e); };
  var later = window.requestAnimationFrame ? function (f) { return window.requestAnimationFrame(f); } : function (f) { return setTimeout(f, 16); };
  var watchSize = function (el, cms) {
    if (!window.ResizeObserver) return null;
    var pending = false;
    var ro = new window.ResizeObserver(function () {
      if (pending) return;
      pending = true;
      later(function () { pending = false; for (var i = 0; i < cms.length; i++) cms[i].refresh(); });
    });
    ro.observe(el);
    return ro;
  };

  // phrase lookup before (and outside) a CodeMirror instance; same rule as cm.phrase()
  var trIn = function (map, s) { return map && Object.prototype.hasOwnProperty.call(map, s) && map[s] ? String(map[s]) : s; };
  var lastPhrases = null;
  // odd spaces and hidden characters: CodeMirror's default list plus U+00A0 and U+3000, drawn as a faint box
  var SPECIAL = /[\u0000-\u001f\u007f-\u009f\u00a0\u00ad\u061c\u200b\u200e\u200f\u2028\u2029\u202d\u202e\u2066\u2067\u2069\u3000\ufeff\ufff9-\ufffc]/;
  var ODD = { '\u00a0': 'No-break space', '\u3000': 'Full-width space', '\ufeff': 'Zero-width no-break space (BOM)' };
  var oddMark = function (phrases) {
    return function (ch) {
      var code = ch.charCodeAt(0).toString(16).toUpperCase(), wide = ch === '\u00a0' || ch === '\u3000';
      while (code.length < 4) code = '0' + code;
      // spaces keep their own width (the box shows where they are); zero-width ones get a dot
      var el = mk('span', wide ? 'ide-odd' : 'ide-odd cm-invalidchar', wide ? ch : '\u2022');
      el.title = trIn(phrases, ODD.hasOwnProperty(ch) ? ODD[ch] : 'Hidden character') + ' U+' + code;
      el.setAttribute('aria-label', el.title);
      return el;
    };
  };
  var BIG = 1000000; // characters: a doc over ~1 MB gets viewport-only limits
  var P_ON = 'Tab moves focus (Ctrl+M to change)', P_OFF = 'Tab types a tab (Ctrl+M to change)', P_ONCE = 'Next Tab moves focus';

  // ---- find / replace bar: our own, in place of the bundle's search dialog (addon/search/search.js). That dialog closes as soon as
  // the focus leaves its box, so no Browse or History button can sit next to it. One bar per CodeMirror instance (the editor, each
  // include window, each compare pane), made on first use: cm.state.ideFind. CodeMirror's search keys reach it through
  // CodeMirror.commands (find, findPersistent, findNext, findPrev, replace, replaceAll, clearSearch). Matching: the whole text once per
  // query (offsets, at most FMAX), again a frame after typing and 120 ms after an edit; the matches in view are painted by an overlay.
  // The box carries the page's searchKit (window.searchKit) when there is one: history 'ide.find' / 'ide.replace', index = the words of
  // the text (made once per text version), Browse = the file picker on the game data (the mod on top) at the folder of the Editor's
  // open file: the picked file's name goes into the box (where this text names that file).
  var FMAX = 20000;
  var reEsc = function (s) { return String(s).replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'); };
  var findBar = function (cm) {
    if (cm.state.ideFind) return cm.state.ideFind;
    var tr = function (s) { return typeof cm.phrase === 'function' ? cm.phrase(s) : s; };
    var F = { q: '', cs: false, ww: false, rx: false, starts: [], ends: [], cur: -1, capped: false, re: null, bad: '', ov: null, mark: null,
      from: 0, open: false, rep: false, ver: 0, note: '', pt: null, et: null, words: null };
    cm.state.ideFind = F;
    var wrapEl = cm.getWrapperElement();
    var bar = mk('div', 'ide-find'), row1 = mk('div', 'ide-find-r'), row2 = mk('div', 'ide-find-r ide-find-rr');
    bar.setAttribute('role', 'search'); bar.setAttribute('aria-label', tr('Find in this file')); bar.hidden = true; row2.hidden = true;
    var box = function (label) {
      var i = mk('input', 'ide-find-q'); i.type = 'text'; i.setAttribute('aria-label', label); i.placeholder = label;
      i.setAttribute('autocomplete', 'off'); i.setAttribute('spellcheck', 'false'); return i;
    };
    var inp = box(tr('Find')), rin = box(tr('Replace with'));
    var btn = function (text, title, fn, toggle) {
      var b = mk('button', 'ide-find-b', text); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
      if (toggle) b.setAttribute('aria-pressed', 'false');
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { try { fn(); } catch (e) { logErr(e); } });
      return b;
    };
    var cnt = mk('span', 'ide-find-n'); cnt.setAttribute('role', 'status'); cnt.setAttribute('aria-live', 'polite');
    var bCase = btn('Aa', tr('Match case (Alt+C)'), function () { toggle('cs'); }, true);
    var bWord = btn('W', tr('Whole word'), function () { toggle('ww'); }, true);
    var bRe = btn('.*', tr('Regular expression (Alt+R)'), function () { toggle('rx'); }, true);
    var bPrev = btn('↑', tr('Previous match (Shift+Enter)'), function () { step(-1); });
    var bNext = btn('↓', tr('Next match (Enter)'), function () { step(1); });
    var bRep = btn('⇆', tr('Show replace (Ctrl+H)'), function () { setRep(!F.rep); (F.rep ? rin : inp).focus(); }, true);
    var bClose = btn('×', tr('Close (Esc)'), function () { close(true); });
    var bOne = btn(tr('Replace'), tr('Replace this match (Enter)'), function () { replaceOne(); });
    var bAll = btn(tr('Replace all'), tr('Replace every match (Ctrl+Alt+Enter)'), function () { replaceAll(); });
    // the words of the text, most used first, per doc and edit count (the kit's index and Browse)
    var words = function () {
      var d = cm.getDoc(), w = F.words;
      if (w && w.doc === d && w.ver === F.ver) return w.a;
      var t = d.getValue('\n'), m = {}, a = [], re = /[A-Za-z_À-￿][A-Za-z0-9_.\-À-￿]*/g, x;
      while ((x = re.exec(t))) {
        var s = x[0].replace(/[.\-]+$/, '');
        if (s.length < 2) continue;
        var e = m['$' + s];
        if (e) { e.n++; continue; }
        if (a.length >= 20000) continue;
        e = m['$' + s] = { w: s, n: 1, lo: s.toLowerCase() }; a.push(e);
      }
      a.sort(function (p, q) { return q.n - p.n || (p.lo < q.lo ? -1 : p.lo > q.lo ? 1 : 0); });
      F.words = { doc: d, ver: F.ver, a: a };
      return a;
    };
    var times = function (n) { return tr('{n} times').replace('{n}', String(n)); };
    // the game folder of the Editor's open file ('' = the top of the game files)
    var browseAt = function () {
      var I = window.IDE, d = null;
      try { d = I && typeof I.active === 'function' ? I.active() : null; } catch (e) { d = null; }
      var p = String((d && (d.key || (d.ref && (d.ref.key || d.ref.rel)))) || '').replace(/\\/g, '/').replace(/^resource\//i, '');
      return p.slice(0, Math.max(0, p.lastIndexOf('/')));
    };
    var kitOpts = function (key) {
      return { key: key,
        index: function (q, done) {
          var lo = String(q).toLowerCase(), a = words(), pre = [], sub = [], n = 0;
          for (var i = 0; i < a.length; i++) {
            var k = a[i].lo.indexOf(lo);
            if (k < 0) continue;
            n++;
            var it = { label: a[i].w, value: a[i].w, hint: times(a[i].n) };
            if (k === 0) { if (pre.length < 30) pre.push(it); } else if (sub.length < 30) sub.push(it);
          }
          var out = pre.concat(sub).slice(0, 30);
          done(out, n - out.length);
        },
        browse: { mode: 'file', view: 'data', start: browseAt, toValue: function (p, e) { return (e && e.name) || String(p).split('/').pop(); } } };
    };
    var SK = window.searchKit, kq = null, kr = null;
    if (typeof SK === 'function') {
      try { kq = SK(inp, kitOpts('ide.find')); } catch (e) { logErr(e); kq = null; }
      try { kr = SK(rin, kitOpts('ide.replace')); } catch (e) { logErr(e); kr = null; }
    }
    row1.appendChild(kq ? kq.el : inp);
    [cnt, bCase, bWord, bRe, bPrev, bNext, bRep, bClose].forEach(function (b) { row1.appendChild(b); });
    row2.appendChild(kr ? kr.el : rin); row2.appendChild(bOne); row2.appendChild(bAll);
    bar.appendChild(row1); bar.appendChild(row2);
    wrapEl.appendChild(bar);

    var build = function () {
      F.bad = '';
      if (!F.q) return null;
      var src = F.rx ? F.q : reEsc(F.q);
      if (F.ww) src = '\\b(?:' + src + ')\\b';
      try { return new RegExp(src, 'g' + (F.cs ? '' : 'i') + 'm'); } catch (e) { F.bad = String(e && e.message || e); return null; }
    };
    var paint = function () {
      if (F.ov) { cm.removeOverlay(F.ov); F.ov = null; }
      if (!F.open || !F.re || !F.starts.length) return;
      var r2 = new RegExp(F.re.source, F.cs ? 'g' : 'gi');
      F.ov = { token: function (s) {
        r2.lastIndex = s.pos;
        var m = r2.exec(s.string);
        while (m && !m[0].length) {
          if (r2.lastIndex >= s.string.length) { m = null; break; }
          r2.lastIndex++; m = r2.exec(s.string);
        }
        if (!m) { s.skipToEnd(); return null; }
        if (m.index === s.pos) { s.pos += m[0].length; return 'searching'; }
        s.pos = m.index; return null;
      } };
      cm.addOverlay(F.ov);
    };
    var compute = function () {
      F.pt = null;
      var re = build();
      F.re = re; F.starts = []; F.ends = []; F.capped = false;
      if (re) {
        var t = cm.getValue('\n'), m;
        while ((m = re.exec(t))) {
          if (!m[0].length) { re.lastIndex++; if (re.lastIndex > t.length) break; continue; }
          F.starts.push(m.index); F.ends.push(m.index + m[0].length);
          if (F.starts.length >= FMAX) { F.capped = true; break; }
        }
        re.lastIndex = 0;
      }
      paint();
    };
    // first match starting at or after offset off (binary search); -1 when none
    var atOrAfter = function (off) {
      var a = F.starts, lo = 0, hi = a.length;
      while (lo < hi) { var md = (lo + hi) >> 1; if (a[md] < off) lo = md + 1; else hi = md; }
      return lo < a.length ? lo : -1;
    };
    var count = function () {
      var t = '';
      if (F.bad) t = tr('Bad pattern');
      else if (F.q && !F.starts.length) t = tr('No results');
      else if (F.q) t = tr('{i} of {n}').replace('{i}', F.cur >= 0 ? String(F.cur + 1) : '?').replace('{n}', F.starts.length + (F.capped ? '+' : ''));
      if (F.note) t += (t ? '  ' : '') + F.note;
      if (cnt.textContent !== t) cnt.textContent = t;
      if (F.bad || (F.q && !F.starts.length)) addClass(inp, 'ide-find-bad'); else rmClass(inp, 'ide-find-bad');
      inp.setAttribute('aria-invalid', F.bad ? 'true' : 'false');
    };
    var unmark = function () { if (F.mark) { F.mark.clear(); F.mark = null; } };
    var show = function (i, wrapped, keepSel) {
      unmark();
      F.cur = i;
      F.note = wrapped ? tr('Wrapped around') : '';
      if (i >= 0 && i < F.starts.length) {
        var a = cm.posFromIndex(F.starts[i]), b = cm.posFromIndex(F.ends[i]);
        if (F.open) F.mark = cm.markText(a, b, { className: 'ide-find-cur' });
        if (!keepSel) { cm.setSelection(a, b, { scroll: false }); cm.scrollIntoView({ from: a, to: b }, 80); }
      }
      count();
    };
    var step = function (dir) {
      if (F.pt || !F.open) compute();
      if (!F.starts.length) { show(-1); return; }
      var f = cm.indexFromPos(cm.getCursor('from')), t = cm.indexFromPos(cm.getCursor('to')), i, w = false;
      if (dir > 0) { i = atOrAfter(f === t ? f : f + 1); if (i < 0) { i = 0; w = true; } }
      else { i = atOrAfter(f) - 1; if (i === -2) i = F.starts.length - 1; if (i < 0) { i = F.starts.length - 1; w = true; } }
      show(i, w);
    };
    // the text typed: matches again, the first one from where the bar was opened
    var retype = function () {
      F.q = inp.value; compute();
      if (!F.starts.length) { unmark(); F.cur = -1; F.note = ''; count(); return; }
      var i = atOrAfter(F.from), w = false;
      if (i < 0) { i = 0; w = true; }
      show(i, w);
    };
    var later2 = function () {
      if (F.pt) return;
      F.pt = true;
      later(function () { if (F.pt) retype(); });
    };
    // after an edit: matches again, the current one = the match the selection holds (nothing moves)
    var resync = function () {
      F.et = null;
      if (!F.open || !F.q) return;
      compute();
      var f = cm.indexFromPos(cm.getCursor('from')), i = atOrAfter(f);
      show(i >= 0 && F.starts[i] === f ? i : -1, false, true);
    };
    cm.on('changes', function () { F.ver++; if (F.open && F.q) { clearTimeout(F.et); F.et = setTimeout(resync, 120); } });
    cm.on('swapDoc', function () { F.ver++; unmark(); if (F.open) { F.from = cm.indexFromPos(cm.getCursor('from')); retype(); } });
    var toggle = function (k) {
      F[k] = !F[k];
      var b = k === 'cs' ? bCase : k === 'ww' ? bWord : bRe;
      b.setAttribute('aria-pressed', F[k] ? 'true' : 'false');
      retype();
    };
    var setRep = function (on) { F.rep = !!on; row2.hidden = !F.rep; bRep.setAttribute('aria-pressed', F.rep ? 'true' : 'false'); };
    var ro = function () { return !!cm.getOption('readOnly'); };
    var repText = function (i) {
      if (!F.rx) return rin.value;
      var s = cm.getValue('\n').slice(F.starts[i], F.ends[i]);
      try { return s.replace(new RegExp(F.re.source, F.cs ? '' : 'i'), rin.value); } catch (e) { return rin.value; }
    };
    var replaceOne = function () {
      if (ro()) { F.note = tr('This text is read-only.'); count(); return; }
      if (F.pt) compute();
      var f = cm.indexFromPos(cm.getCursor('from')), t = cm.indexFromPos(cm.getCursor('to')), i = atOrAfter(f);
      if (i < 0 || F.starts[i] !== f || F.ends[i] !== t) { step(1); return; }
      var txt = repText(i), a = cm.posFromIndex(f), b = cm.posFromIndex(t);
      cm.replaceRange(txt, a, b, 'ideReplace');
      clearTimeout(F.et); F.et = null;
      compute();
      var j = atOrAfter(f + txt.length), w = false;
      if (!F.starts.length) { show(-1); return; }
      if (j < 0) { j = 0; w = true; }
      show(j, w);
    };
    var replaceAll = function () {
      if (ro()) { F.note = tr('This text is read-only.'); count(); return; }
      compute();
      var n = F.starts.length;
      if (!n) { show(-1); return; }
      var reps = [];
      for (var i = 0; i < n; i++) reps.push(repText(i));
      var st = F.starts.slice(), en = F.ends.slice();
      cm.operation(function () {
        for (var k = n - 1; k >= 0; k--) cm.replaceRange(reps[k], cm.posFromIndex(st[k]), cm.posFromIndex(en[k]), 'ideReplace');
      });
      clearTimeout(F.et); F.et = null;
      compute(); unmark(); F.cur = -1;
      F.note = tr('Replaced {n}').replace('{n}', String(n));
      count();
    };
    var open = function (rep) {
      var sel = cm.getSelection();
      if (sel && sel.indexOf('\n') < 0 && sel.length < 200) inp.value = sel;
      else if (!inp.value && F.q) inp.value = F.q;
      F.from = cm.indexFromPos(cm.getCursor('from'));
      F.open = true; bar.hidden = false; addClass(wrapEl, 'ide-finding');
      if (rep != null) setRep(rep);
      var tgt = F.rep && rep ? rin : inp, kit = tgt === rin ? kr : kq;
      if (kit) kit.focus(); else tgt.focus();
      if (inp.select && tgt === inp) inp.select();
      F.q = inp.value; compute();
      if (F.starts.length) { var i = atOrAfter(F.from); show(i < 0 ? 0 : i, i < 0, true); } else { F.cur = -1; F.note = ''; count(); }
    };
    var close = function (focusEd) {
      F.open = false; bar.hidden = true; rmClass(wrapEl, 'ide-finding');
      if (kq) kq.close(); if (kr) kr.close();
      if (F.ov) { cm.removeOverlay(F.ov); F.ov = null; }
      unmark(); clearTimeout(F.et); F.et = null; F.pt = null;
      if (focusEd) cm.focus();
    };
    var common = function (e) {
      var k = e.keyCode;
      if (k === 27) { e.preventDefault(); close(true); return true; }
      if (e.altKey && !e.ctrlKey && (k === 67 || k === 82)) { e.preventDefault(); toggle(k === 67 ? 'cs' : 'rx'); return true; }
      if (e.ctrlKey && !e.altKey && k === 70 && !e.shiftKey) { e.preventDefault(); inp.focus(); if (inp.select) inp.select(); return true; }
      if (e.ctrlKey && !e.altKey && k === 72) { e.preventDefault(); setRep(!F.rep); (F.rep ? rin : inp).focus(); return true; }
      if (k === 114) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return true; }
      return false;
    };
    // set after the kit: a key it took (e._sk: its list was open) is its own
    inp.addEventListener('input', function () { later2(); });
    inp.addEventListener('keydown', function (e) {
      if (e._sk || e.isComposing || e.keyCode === 229) return;
      if (common(e)) return;
      if (e.keyCode === 13) { e.preventDefault(); if (F.pt) retype(); step(e.shiftKey ? -1 : 1); }
    });
    rin.addEventListener('keydown', function (e) {
      if (e._sk || e.isComposing || e.keyCode === 229) return;
      if (common(e)) return;
      if (e.keyCode === 13) { e.preventDefault(); if (e.ctrlKey && e.altKey) replaceAll(); else replaceOne(); }
    });
    // Esc in the text closes the bar (an editor of ED.create closes it before its Tab-mode Esc; this covers the others)
    cm.on('keydown', function (c, e) {
      if (e.keyCode === 27 && F.open && !c.state.completionActive && !e.ideFindClosed) { close(false); e.ideFindClosed = true; }
    });
    F.open = false;
    F.el = bar; F.input = inp; F.replaceInput = rin; F.kit = kq; F.replaceKit = kr;
    F.show = open; F.close = close; F.next = function (dir) { if (!F.q && !inp.value) { open(false); return; } if (!F.q) F.q = inp.value; step(dir); };
    F.isOpen = function () { return F.open; };
    F.replaceOne = replaceOne; F.replaceAll = replaceAll; F.toggle = toggle; F.flush = function () { if (F.pt) retype(); if (F.et) { clearTimeout(F.et); resync(); } };
    F.state = function () { return { open: F.open, q: F.q, n: F.starts.length, cur: F.cur, capped: F.capped, bad: F.bad, note: F.note, rep: F.rep }; };
    return F;
  };
  CM.commands.find = CM.commands.findPersistent = function (cm) { findBar(cm).show(false); };
  CM.commands.replace = CM.commands.replaceAll = function (cm) { findBar(cm).show(true); };
  CM.commands.findNext = CM.commands.findPersistentNext = function (cm) { findBar(cm).next(1); };
  CM.commands.findPrev = CM.commands.findPersistentPrev = function (cm) { findBar(cm).next(-1); };
  CM.commands.clearSearch = function (cm) { if (cm.state.ideFind) cm.state.ideFind.close(false); };
  ED.findBar = findBar;

  ED.create = function (host, opts) {
    if (!host || typeof host.appendChild !== 'function' || !host.nodeType) throw new Error('IDE_ED.create: the editor host element is missing.');
    opts = opts || {};
    if (opts.theme) curTheme = normTheme(opts.theme);
    var phrases = opts.phrases && typeof opts.phrases === 'object' ? opts.phrases : null;
    if (phrases) lastPhrases = phrases;
    var tr = function (s) { return trIn(phrases, s); };
    addClass(host, 'ide-cm-host');

    var ed = {}, ev = {}, docs = {}, cur = null, silent = 0;
    var hoverFn = null, hintFn = null, userKeys = {};
    var sess = null; // (kit) the running field session, or null
    var emit = function (name, data) {
      var l = ev[name];
      if (!l) return;
      for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { logErr(e); } }
    };

    var hintSource = function (cmi, callback) {
      if (!hintFn || !cur) { callback(null); return; }
      var c = cmi.getCursor(), text = cmi.getLine(c.line), a = c.ch, lineNo = c.line, docAt = cur;
      while (a > 0 && /[^\s{}"();]/.test(text.charAt(a - 1))) a--;
      var prefix = text.slice(a, c.ch), before = text.slice(0, a).replace(/\s+$/, '');
      var req = { line: c.line + 1, col: c.ch + 1, prefix: prefix, afterBrace: before.charAt(before.length - 1) === '{' };
      try {
        hintFn(req, function (list) {
          if (cur !== docAt) { callback(null); return; }
          var p = prefix.toLowerCase(), out = [];
          for (var i = 0; list && i < list.length && out.length < 300; i++) {
            var it = list[i], w = it && (it.w != null ? String(it.w) : (typeof it === 'string' ? it : ''));
            if (!w || w.toLowerCase().indexOf(p) !== 0) continue;
            out.push({ text: w, ideSub: it.hint || '', render: renderHint });
          }
          callback({ list: out, from: CM.Pos(lineNo, a), to: CM.Pos(lineNo, c.ch) });
        });
      } catch (e) { logErr(e); callback(null); }
    };
    hintSource.async = true;
    var renderHint = function (el, data, item) {
      el.appendChild(document.createTextNode(item.text));
      if (item.ideSub) el.appendChild(mk('span', 'ide-hint-sub', item.ideSub));
    };
    var showHints = function () {
      if (!hintFn || !cur || sess) return; // quiet during a field session: its Tab / Enter / Esc never compete
      cm.showHint({ hint: hintSource, completeSingle: false, closeCharacters: /[\s()\[\]{};"]/ });
    };

    var baseKeys = {
      'Ctrl-Space': function () { showHints(); },
      'Ctrl-S': function () { emit('save', { id: cur && cur.id }); },
      'Ctrl-/': 'toggleComment',
      'Ctrl-Q': function (c) { c.foldCode(c.getCursor()); },
      'Alt-G': 'jumpToLine',
      'F3': 'findNext',
      'Shift-F3': 'findPrev',
      'Ctrl-M': function () { setTab(!tabOn, false); },
      'Shift-Tab': 'indentLess'
    };
    var keyMap = function () {
      var o = {}, k;
      for (k in baseKeys) if (baseKeys.hasOwnProperty(k)) o[k] = baseKeys[k];
      for (k in userKeys) if (userKeys.hasOwnProperty(k)) o[k] = userKeys[k];
      return o;
    };

    var foldMark = function (cls, title) {
      var el = mk('div', cls);
      el.title = tr(title);
      return el;
    };
    var FOLD_GUTTER = {
      indicatorOpen: foldMark('CodeMirror-foldgutter-open', 'Fold block'),
      indicatorFolded: foldMark('CodeMirror-foldgutter-folded', 'Open folded block')
    };
    var HSM = { minChars: 2, showToken: false, annotateScrollbar: false };
    var baseLabel = opts.label ? String(opts.label) : tr('Code editor');
    var cm = CM(host, {
      value: '',
      mode: 'text',
      theme: themeOf(curTheme),
      readOnly: 'nocursor',
      lineNumbers: true,
      gutters: ['ide-marks', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'ide-incg'],
      foldGutter: FOLD_GUTTER,
      foldOptions: {
        widget: function () {
          var el = mk('span', 'CodeMirror-foldmarker', '\u2194');
          el.title = tr('Folded lines. Click to open.');
          el.setAttribute('aria-label', el.title);
          return el;
        }
      },
      specialChars: SPECIAL,
      specialCharPlaceholder: oddMark(phrases),
      indentWithTabs: true,
      tabSize: 4,
      indentUnit: 4,
      smartIndent: true,
      electricChars: true,
      lineWrapping: false,
      matchBrackets: true,
      styleActiveLine: true,
      highlightSelectionMatches: HSM,
      undoDepth: 2000,
      lineSeparator: null,
      spellcheck: false,
      autocorrect: false,
      autocapitalize: false,
      inputStyle: 'textarea',
      screenReaderLabel: baseLabel,
      phrases: phrases,
      extraKeys: keyMap()
    });
    var wrap = cm.getWrapperElement();
    addClass(wrap, 'ide-cm');
    var blank = cm.getDoc();
    var ro = watchSize(host, [cm]);
    ed.cm = cm;

    // ---- Tab mode: off = Tab types a tab; on = Tab / Shift+Tab move focus (Ctrl+M); once = Esc armed it for one Tab ----
    var tabOn = !!opts.tabFocus, tabOnce = false;
    var live = mk('div', 'ide-sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    wrap.appendChild(live);
    var tabText = function () { return tr(tabOn ? P_ON : (tabOnce ? P_ONCE : P_OFF)); };
    var setTab = function (on, once) {
      on = !!on; once = !!once && !on;
      if (on === tabOn && once === tabOnce) return;
      tabOn = on; tabOnce = once;
      var msg = tabText();
      cm.setOption('screenReaderLabel', tabOn || tabOnce ? baseLabel + '. ' + msg : baseLabel);
      live.textContent = msg;
      if (tabOn || tabOnce) addClass(wrap, 'ide-tabfocus'); else rmClass(wrap, 'ide-tabfocus');
      emit('tabmode', { on: tabOn || tabOnce, once: tabOnce, text: msg });
    };
    if (tabOn) { tabOn = false; setTab(true, false); }
    cm.on('keydown', function (c, e) {
      var k = e.keyCode;
      // (kit) a field session takes Tab, Shift+Tab, Enter and Esc before the Tab-mode and Esc code below
      if (sess && sessKey(e)) return;
      if (k === 9) {
        if ((tabOn || tabOnce) && !e.ctrlKey && !e.altKey && !e.metaKey && !c.state.completionActive) {
          e.codemirrorIgnore = true; // CodeMirror leaves the key alone: the browser moves focus
          if (tabOnce) setTab(false, false);
        }
        return;
      }
      if (k === 27) {
        if (card) { closeCard(); return; }
        if (e.ideClosedCard) return; // the card's own Esc handler ran first
        if (c.state.completionActive || c.listSelections().length > 1) return;
        var fb = c.state.ideFind;
        if (fb && fb.isOpen()) { fb.close(false); e.ideFindClosed = true; return; }
        if (!tabOn) setTab(false, true);
        return;
      }
      if (tabOnce && k !== 16 && k !== 17 && k !== 18 && k !== 91 && k !== 93) setTab(false, false);
    });
    cm.on('blur', function () { if (tabOnce) setTab(false, false); });
    ed.tabFocus = function (on) {
      if (arguments.length && on != null) setTab(!!on, false);
      return tabOn || tabOnce;
    };

    // ---- big docs: viewport-only limits so typing stays smooth ----
    var bigMode = false;
    var applyPerf = function (r) {
      var big = !!(r && r.big);
      if (big === bigMode) return;
      bigMode = big;
      cm.setOption('maxHighlightLength', big ? 2000 : 10000);
      cm.setOption('workTime', big ? 20 : 100);
      cm.setOption('workDelay', big ? 300 : 100);
      cm.setOption('highlightSelectionMatches', big ? false : HSM);
      cm.setOption('matchBrackets', big ? { maxScanLines: 200 } : true);
      // brace-fold scans to the block end for every visible line: off for big docs (Ctrl+Q still folds by hand)
      cm.setOption('foldGutter', big ? false : FOLD_GUTTER);
    };

    // ---- change throttle (150 ms, trailing), cursor, focus. Every 'change' names its doc and the lowest changed line
    // since the last 'change' (1-based): {id, from} ----
    var chTimer = null, chId = null, chFrom = null;
    var flushChange = function () {
      if (!chTimer) return;
      clearTimeout(chTimer); chTimer = null;
      var id = chId, from = chFrom == null ? 1 : chFrom;
      chId = null; chFrom = null;
      emit('change', { id: id, from: from });
    };
    ed.flush = function () { flushChange(); };
    cm.on('changes', function (c, list) {
      if (silent || !cur) return;
      closeCard();
      if (chTimer && chId !== cur.id) flushChange();
      chId = cur.id;
      for (var i = 0; list && i < list.length; i++) {
        var l = list[i].from.line + 1;
        if (chFrom == null || l < chFrom) chFrom = l;
      }
      if (!chTimer) chTimer = setTimeout(flushChange, 150);
    });
    cm.on('cursorActivity', function (c) {
      if (!cur || silent || swapping) return;
      var p = c.getCursor();
      emit('cursor', { id: cur.id, line: p.line + 1, col: p.ch + 1 });
    });
    cm.on('focus', function () { emit('focus', { id: cur && cur.id }); });
    cm.on('scroll', function () { closeCard(); });
    cm.on('inputRead', function (c, ch) {
      if (!hintFn || !cur || (cur.kind !== 'sdl' && cur.kind !== 'lng')) return;
      if (ch.origin !== '+input' || ch.text.length !== 1 || ch.text[0].length !== 1 || !/[A-Za-z_#]/.test(ch.text[0])) return;
      if (c.getLine(ch.from.line).charAt(ch.from.ch - 1) === '{') showHints();
    });

    // ---- hover card ----
    var card = null, cardKey = null, hoverTimer = null, hoverSeq = 0, lastMouse = null;
    var onDocKey = function (e) { if (e.keyCode === 27 && card) { e.ideClosedCard = true; closeCard(); } };
    var closeCard = function () {
      hoverSeq++;
      clearTimeout(hoverTimer); hoverTimer = null;
      if (!card) return;
      if (card.parentNode) card.parentNode.removeChild(card);
      card = null; cardKey = null;
      document.removeEventListener('keydown', onDocKey, true);
    };
    var worstMark = function (pos) {
      var ms = cm.findMarksAt(pos), best = null;
      for (var i = 0; i < ms.length; i++) {
        var f = ms[i].ideFinding;
        if (f && (!best || (SEV[f.sev] || 0) > (SEV[best.ideFinding.sev] || 0))) best = ms[i];
      }
      return best;
    };
    // what is under the mouse: a marked range or a word, and only when the pointer is really over its text
    var hitAt = function (x, y) {
      if (!cur) return null;
      var pos = cm.coordsChar({ left: x, top: y }, 'window');
      if (pos.outside) return null;
      var text = cm.getLine(pos.line), range = null, mark = worstMark(pos);
      if (mark) {
        var fr = mark.find();
        if (fr && fr.from.line === pos.line && fr.to.line === pos.line && fr.to.ch > fr.from.ch) range = { from: fr.from.ch, to: fr.to.ch };
      }
      if (!range) range = ideWordRange(text, pos.ch, cur.kind === 'sdl' || cur.kind === 'lng');
      if (!range) return null;
      var l = cm.charCoords(CM.Pos(pos.line, range.from), 'window'), r = cm.charCoords(CM.Pos(pos.line, range.to), 'window');
      if (x < l.left - 1 || x > r.left + 1 || y < l.top || y > l.bottom) return null;
      return {
        line: pos.line, ch: clamp(pos.ch, range.from, Math.max(range.from, range.to - 1)), from: range.from, to: range.to,
        mark: mark ? mark.ideFinding : null, key: pos.line + ':' + range.from + ':' + range.to
      };
    };
    var placeCard = function (el, hit, anchor) {
      var x, y, topEdge;
      if (anchor) {
        var r = anchor.getBoundingClientRect();
        x = r.right + 4; y = r.bottom + 2; topEdge = r.top;
      } else {
        var cc = cm.charCoords(CM.Pos(hit.line, hit.from), 'window');
        x = cc.left; y = cc.bottom + 2; topEdge = cc.top;
      }
      el.style.left = '0px'; el.style.top = '0px';
      var w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      if (y + h > vh - 4) y = Math.max(4, topEdge - h - 2);
      if (x + w > vw - 4) x = Math.max(4, vw - w - 4);
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    };
    var showCard = function (c, hit, anchor) {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      var el = mk('div', 'ide-hover' + (curTheme === 'light' ? ' ide-hover-light' : ' ide-hover-dark'));
      el.setAttribute('role', 'tooltip');
      if (c.title) el.appendChild(mk('div', 'ide-hover-t', c.title));
      if (c.lead) el.appendChild(mk('div', 'ide-hover-l', c.lead));
      var rows = c.rows || [], i;
      if (rows.length) {
        var tb = mk('div', 'ide-hover-rows');
        for (i = 0; i < rows.length; i++) {
          var row = rows[i] || [], k = row.length != null ? row[0] : row.k, v = row.length != null ? row[1] : row.v;
          var rEl = mk('div', 'ide-hover-r');
          rEl.appendChild(mk('span', 'ide-hover-k', k == null ? '' : k));
          rEl.appendChild(mk('span', 'ide-hover-v', v == null ? '' : v));
          tb.appendChild(rEl);
        }
        el.appendChild(tb);
      }
      var acts = (c.links || []).slice();
      if (c.fix) acts.push({ text: c.fix.label, run: c.fix.run, fix: true });
      if (acts.length) {
        var bar = mk('div', 'ide-hover-acts');
        for (i = 0; i < acts.length; i++) {
          (function (a) {
            var b = mk('button', 'ide-hover-a' + (a.fix ? ' ide-hover-fix' : ''), a.text || '');
            b.type = 'button';
            b.addEventListener('click', function (e) {
              e.preventDefault();
              closeCard();
              if (typeof a.run === 'function') { try { a.run(); } catch (err) { logErr(err); } }
            });
            bar.appendChild(b);
          })(acts[i]);
        }
        el.appendChild(bar);
      }
      el.addEventListener('mouseleave', function (e) {
        if (e.relatedTarget && inside(e.relatedTarget, wrap)) return;
        closeCard();
      });
      document.body.appendChild(el);
      card = el; cardKey = hit.key;
      placeCard(el, hit, anchor);
      document.addEventListener('keydown', onDocKey, true);
    };
    var requestHover = function (hit, anchor) {
      if (!hoverFn || !cur) return;
      var seq = ++hoverSeq, docAt = cur, req = { line: hit.line + 1, col: hit.ch + 1 };
      if (hit.mark) req.mark = hit.mark;
      try {
        hoverFn(req, function (c) {
          if (seq !== hoverSeq || cur !== docAt || !c) return;
          showCard(c, hit, anchor);
        });
      } catch (e) { logErr(e); }
    };

    // ---- Ctrl held over a token: underline affordance ----
    var ctrlMark = null, ctrlKey = null;
    var clearCtrl = function () {
      if (ctrlMark) { ctrlMark.clear(); ctrlMark = null; }
      ctrlKey = null;
      rmClass(wrap, 'ide-ctrl');
    };
    var ctrlTrack = function (x, y, held) {
      if (!held || !cur) { clearCtrl(); return; }
      var hit = hitAt(x, y);
      if (!hit) { clearCtrl(); return; }
      if (hit.key === ctrlKey) return;
      clearCtrl();
      ctrlKey = hit.key;
      ctrlMark = cur.doc.markText(CM.Pos(hit.line, hit.from), CM.Pos(hit.line, hit.to), { className: 'ide-ctrl-link' });
      addClass(wrap, 'ide-ctrl');
    };
    var inGutter = function (t) { return inside(t, cm.getGutterElement()); };
    // (inc) an inline include window (a line widget holding an editor of its own): its pointer events are its own business
    var inWidget = function (t) {
      for (var n = t; n && n !== wrap; n = n.parentNode) if (n.nodeType === 1 && n.className && hasClass(n, 'ide-inl')) return true;
      return false;
    };

    wrap.addEventListener('mousemove', function (e) {
      lastMouse = { x: e.clientX, y: e.clientY, over: true };
      if (inWidget(e.target)) { clearCtrl(); clearTimeout(hoverTimer); hoverTimer = null; if (card) closeCard(); return; }
      if (inGutter(e.target)) { clearCtrl(); return; }
      ctrlTrack(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
      if (!hoverFn) return;
      var hit = hitAt(e.clientX, e.clientY);
      if (card && hit && hit.key === cardKey) return;
      if (hoverTimer && hit && hit.key === hoverKey) return;
      closeCard();
      if (!hit) return;
      hoverKey = hit.key;
      hoverTimer = setTimeout(function () { hoverTimer = null; requestHover(hit, null); }, 350);
    });
    var hoverKey = null;
    wrap.addEventListener('mouseleave', function (e) {
      if (lastMouse) lastMouse.over = false;
      clearCtrl();
      clearTimeout(hoverTimer); hoverTimer = null;
      if (card && e.relatedTarget && inside(e.relatedTarget, card)) return;
      closeCard();
    });
    var onCtrlKey = function (e) {
      if (e.keyCode !== 17 && e.keyCode !== 91 && e.keyCode !== 93) return;
      if (!lastMouse || !lastMouse.over) return;
      ctrlTrack(lastMouse.x, lastMouse.y, e.type === 'keydown');
    };
    document.addEventListener('keydown', onCtrlKey, false);
    document.addEventListener('keyup', onCtrlKey, false);
    window.addEventListener('blur', function () { clearCtrl(); closeCard(); }, false);

    cm.on('mousedown', function (c, e) {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || e.altKey || e.shiftKey || !cur) return;
      if (inGutter(e.target) || inWidget(e.target)) return;
      var pos = c.coordsChar({ left: e.clientX, top: e.clientY }, 'window');
      e.preventDefault(); // tells CodeMirror to skip its own handling (no extra cursor)
      clearCtrl(); closeCard();
      c.focus();
      c.setCursor(pos);
      emit('ctrlclick', { id: cur.id, line: pos.line + 1, col: pos.ch + 1 });
    });

    // ---- docs ----
    var setDepth = function (r) {
      if (r.depth) return;
      // a new Doc starts with unlimited undo; the option handler only applies to the attached doc
      cm.setOption('undoDepth', 2001);
      cm.setOption('undoDepth', 2000);
      r.depth = true;
    };
    var get = function (id) { return id == null ? cur : (docs.hasOwnProperty(id) ? docs[id] : null); };

    ed.addDoc = function (id, text, kind, readOnly) {
      var old = docs.hasOwnProperty(id) ? docs[id] : null;
      if (old && sess && sess.r === old) sessEnd('reload');
      if (old && old.kind === kind) {
        old.ro = !!readOnly;
        ed.setText(id, text);
        if (cur === old) cm.setOption('readOnly', old.ro);
        return true;
      }
      var s = text == null ? '' : String(text);
      var d = new CM.Doc(s, modeOf(kind));
      var r = { id: id, doc: d, kind: kind, ro: !!readOnly, gen: d.changeGeneration(true), marks: [], depth: false, big: s.length > BIG };
      docs[id] = r;
      if (old && cur === old) { cur = null; ed.swap(id); }
      return true;
    };
    var swapping = false;
    ed.swap = function (id) {
      var r = get(id);
      if (!r) return false;
      // the old doc's pending change goes out first, synchronously, still named by its own id
      flushChange(); closeCard(); clearCtrl();
      if (cm.closeHint) cm.closeHint();
      if (cur !== r) {
        if (sess) sessEnd('swap');
        ed.gapMarker(null);
        swapping = true;
        try {
          cm.operation(function () {
            applyPerf(r);
            cm.swapDoc(r.doc);
          });
        } finally { swapping = false; }
        cur = r;
      }
      cm.setOption('readOnly', r.ro);
      setDepth(r);
      return true;
    };
    ed.dropDoc = function (id) {
      var r = get(id);
      if (!r) return false;
      if (sess && sess.r === r) sessEnd('swap');
      if (cur === r) {
        ed.gapMarker(null);
        flushChange(); closeCard(); clearCtrl();
        if (cm.closeHint) cm.closeHint();
        blank = new CM.Doc('', 'text');
        cm.swapDoc(blank);
        cm.setOption('readOnly', 'nocursor');
        cur = null;
      }
      for (var i = 0; i < r.marks.length; i++) r.marks[i].clear();
      // (inc) a buffer shared with an include window: let go of the link (each side keeps its own copy of the history)
      var links = [];
      try { r.doc.iterLinkedDocs(function (o) { links.push(o); }); } catch (e) { links = []; }
      for (var j = 0; j < links.length; j++) { try { r.doc.unlinkDoc(links[j]); } catch (e) { logErr(e); } }
      delete docs[r.id];
      return true;
    };
    ed.current = function () { return cur ? cur.id : null; };
    ed.text = function (id) { var r = get(id); return r ? r.doc.getValue('\n') : null; };
    ed.setText = function (id, text) {
      var r = get(id);
      if (!r) return false;
      if (sess && sess.r === r) sessEnd('reload');
      var d = r.doc, c = d.getCursor(), top = cur === r ? cm.getScrollInfo().top : d.scrollTop;
      silent++;
      r.big = text != null && String(text).length > BIG;
      if (cur === r) applyPerf(r);
      try {
        d.setValue(text == null ? '' : String(text));
        d.clearHistory();
        d.setCursor(CM.Pos(Math.min(c.line, d.lastLine()), c.ch));
      } finally { silent--; }
      r.gen = d.changeGeneration(true);
      if (cur === r) cm.scrollTo(null, top);
      return true;
    };
    ed.clean = function (id) { var r = get(id); if (r) r.gen = r.doc.changeGeneration(true); return !!r; };
    ed.isClean = function (id) { var r = get(id); return r ? r.doc.isClean(r.gen) : true; };

    // ---- marks: squiggle per finding, one gutter dot per line (worst severity) ----
    var dotFor = function (f) {
      var sev = SEV[f.sev] ? f.sev : 'info';
      var el = mk('span', 'ide-dot ide-dot-' + sev);
      el.setAttribute('aria-label', f.msg ? String(f.msg) : sev);
      var t = null;
      el.addEventListener('mouseenter', function () {
        clearTimeout(t);
        if (!hoverFn) return;
        t = setTimeout(function () {
          var ln = Math.max(0, (f.line || 1) - 1);
          requestHover({ line: ln, ch: Math.max(0, (f.col || 1) - 1), from: Math.max(0, (f.col || 1) - 1), mark: f, key: 'dot:' + ln }, el);
        }, 350);
      });
      el.addEventListener('mouseleave', function (e) {
        clearTimeout(t);
        if (card && e.relatedTarget && inside(e.relatedTarget, card)) return;
        closeCard();
      });
      return el;
    };
    ed.marks = function (findings) {
      var r = cur;
      if (!r) return false;
      cm.operation(function () {
        var i;
        for (i = 0; i < r.marks.length; i++) r.marks[i].clear();
        r.marks = [];
        cm.clearGutter('ide-marks');
        var d = r.doc, last = d.lastLine(), worst = {};
        for (i = 0; findings && i < findings.length; i++) {
          var f = findings[i];
          if (!f) continue;
          var ln = clamp((f.line || 1) - 1, 0, last), text = d.getLine(ln);
          var a = Math.max(0, (f.col || 1) - 1), len = f.len > 0 ? f.len : 0;
          var b = len ? Math.min(text.length, a + len) : text.length;
          if (b <= a) { a = Math.max(0, text.search(/\S/)); b = text.length; }
          if (b > a) {
            var sev = SEV[f.sev] ? f.sev : 'info';
            var m = d.markText(CM.Pos(ln, a), CM.Pos(ln, b), {
              className: 'ide-mark ide-mark-' + sev + (f.exact === false ? ' ide-mark-inexact' : '')
            });
            m.ideFinding = f;
            r.marks.push(m);
          }
          if (!worst[ln] || (SEV[f.sev] || 0) > (SEV[worst[ln].sev] || 0)) worst[ln] = f;
        }
        for (var k in worst) if (worst.hasOwnProperty(k)) cm.setGutterMarker(+k, 'ide-marks', dotFor(worst[k]));
      });
      return true;
    };

    // edits: [{ line, col, endCol, text }] 1-based, endCol exclusive; col 0 = insert a whole line before `line`.
    // All or nothing, in one operation (one undo step): when a beforeChange filter cancels one change, the changes
    // already made are taken back and the result is false. The doc then holds its old text; the taken-back changes stay
    // in the undo history as one step with no net change, and a doc clean before stays clean. (No filter here rewrites
    // an 'ide' change; one that did would also give false, its rewritten change is not taken back.)
    ed.applyEdits = function (edits) {
      if (!cur || !edits || !edits.length) return false;
      var list = edits.slice().sort(function (p, q) { return (q.line - p.line) || ((q.col || 0) - (p.col || 0)); });
      var r = cur, d = r.doc, done = [], good = true, wasClean = d.isClean(r.gen);
      // replace [A, B] with t; true when the doc now holds exactly that (a cancelled change leaves it as it was)
      var put = function (t, A, B) {
        A = d.clipPos(A); B = d.clipPos(B);
        var ls = d.splitLines(t), n0 = d.lineCount(), was = d.getRange(A, B);
        if (ls.length === 1 && ls[0] === '' && CM.cmpPos(A, B) === 0) return true; // nothing to do
        var want = ls.slice(), endCh = (ls.length === 1 ? A.ch : 0) + ls[ls.length - 1].length;
        want[0] = d.getLine(A.line).slice(0, A.ch) + want[0];
        want[want.length - 1] += d.getLine(B.line).slice(B.ch);
        d.replaceRange(t, A, B, 'ide');
        var same = d.lineCount() === n0 - (B.line - A.line) + (want.length - 1);
        for (var j = 0; same && j < want.length; j++) same = d.getLine(A.line + j) === want[j];
        if (same) done.push({ a: A, z: CM.Pos(A.line + want.length - 1, endCh), was: was });
        return same;
      };
      cm.operation(function () {
        for (var i = 0; good && i < list.length; i++) {
          var e = list[i], t = e.text == null ? '' : String(e.text), last = d.lastLine();
          if (e.col === 0) {
            var at = e.line - 1;
            if (at > last && d.getLine(last) !== '') good = put('\n' + t.replace(/\n$/, ''), CM.Pos(last, d.getLine(last).length), CM.Pos(last, d.getLine(last).length));
            else if (at > last) good = put(/\n$/.test(t) ? t : t + '\n', CM.Pos(last, 0), CM.Pos(last, 0));
            else good = put(/\n$/.test(t) ? t : t + '\n', CM.Pos(Math.max(0, at), 0), CM.Pos(Math.max(0, at), 0));
            continue;
          }
          var ln = clamp(e.line - 1, 0, last), a = Math.max(0, e.col - 1);
          var b = Math.max(a, (e.endCol == null ? e.col : e.endCol) - 1);
          good = put(t, CM.Pos(ln, a), CM.Pos(ln, b));
          // dropEol: the line is now empty (blanks only) -> remove it with its line end (last line: the one before)
          if (good && e.dropEol && /^\s*$/.test(d.getLine(ln))) {
            if (ln < d.lastLine()) good = put('', CM.Pos(ln, 0), CM.Pos(ln + 1, 0));
            else if (ln > 0) good = put('', CM.Pos(ln - 1, d.getLine(ln - 1).length), CM.Pos(ln, d.getLine(ln).length));
            else good = put('', CM.Pos(0, 0), CM.Pos(0, d.getLine(0).length));
          }
        }
        if (good) return;
        // take back what went in, last change first: each one's place is right again once the ones after it are gone
        for (var k = done.length - 1; k >= 0; k--) d.replaceRange(done[k].was, done[k].a, done[k].z, 'ide');
      });
      if (!good && done.length && wasClean) r.gen = d.changeGeneration(true);
      return good;
    };
    ed.goto = function (line, col) {
      if (!cur) return false;
      cm.operation(function () {
        var d = cur.doc, ln = clamp((line || 1) - 1, 0, d.lastLine()), ch = Math.max(0, (col || 1) - 1);
        cm.setCursor(CM.Pos(ln, ch));
        var h = cm.getScrollInfo().clientHeight, top = cm.heightAtLine(ln, 'local');
        cm.scrollTo(null, Math.max(0, top - h / 2 + cm.defaultTextHeight() / 2));
      });
      cm.focus();
      return true;
    };
    ed.cursor = function () { var p = cm.getCursor(); return { line: p.line + 1, col: p.ch + 1 }; };
    ed.wordAt = function (pos) {
      if (!cur || !pos) return null;
      var ln = (pos.line || 1) - 1;
      if (ln < 0 || ln > cm.lastLine()) return null;
      var text = cm.getLine(ln), w = ideWordRange(text, Math.max(0, (pos.col || 1) - 1), cur.kind === 'sdl' || cur.kind === 'lng');
      if (!w) return null;
      return { word: text.slice(w.from, w.to), line: ln + 1, col: w.from + 1, len: w.to - w.from, quoted: w.quoted };
    };
    ed.focus = function () { cm.focus(); };
    // one theme for every view: this editor, others, open compare views (the hint list closes; it reopens in the new colours)
    var retheme = function (t) {
      if (cm.getOption('theme') !== themeOf(t)) cm.setOption('theme', themeOf(t));
      closeCard();
      if (typeof cm.closeHint === 'function') { try { cm.closeHint(); } catch (e) { logErr(e); } }
    };
    LIVE.push(retheme);
    ed.theme = function (name) { return ED.theme(name); };
    ed.fold = function (what) { cm.execCommand(what === 'none' ? 'unfoldAll' : 'foldAll'); };
    ed.find = function () { cm.execCommand('find'); };
    ed.on = function (name, fn) { (ev[name] || (ev[name] = [])).push(fn); return ed; };
    ed.hoverProvider = function (fn) { hoverFn = typeof fn === 'function' ? fn : null; if (!hoverFn) closeCard(); };
    ed.hints = function (fn) { hintFn = typeof fn === 'function' ? fn : null; };
    ed.keys = function (map) {
      for (var k in map) {
        if (!map.hasOwnProperty(k)) continue;
        (function (key, fn) {
          if (typeof fn === 'function') userKeys[key] = function () { return fn(); };
          else if (fn == null) delete userKeys[key];
          else userKeys[key] = fn;
        })(k, map[k]);
      }
      cm.setOption('extraKeys', keyMap());
    };
    // ==== (kit) calls for the Code Pieces pane (tools/ide/README.md "IDE_ED", lines marked kit) ====

    // ---- lines of the doc shown now (1-based) ----
    ed.lineCount = function () { return cur ? cur.doc.lineCount() : 0; };
    ed.line = function (n) {
      if (!cur || typeof n !== 'number' || n !== Math.floor(n) || n < 1 || n > cur.doc.lineCount()) return null;
      return cur.doc.getLine(n - 1);
    };

    // ---- pointer to a line gap, fold aware ----
    // the folded range (collapsed mark) that hides the start of 0-based line ln: {from, to} or null (outermost)
    var foldOver = function (d, ln) {
      if (ln <= 0 || ln >= d.lineCount()) return null;
      var ms = d.findMarks(CM.Pos(ln - 1, 0), CM.Pos(ln, 0)), best = null;
      for (var i = 0; i < ms.length; i++) {
        if (!ms[i].collapsed) continue;
        var f = ms[i].find();
        if (!f || !f.from || f.from.line >= ln || f.to.line < ln) continue;
        if (!best || f.from.line < best.from.line || f.to.line > best.to.line) best = f;
      }
      return best;
    };
    // a gap (1-based: the line a new line goes before) that is not inside a fold: move to the first line after it
    var openGap = function (d, g) {
      var n = d.lineCount();
      for (var guard = 0; guard < 200 && g >= 2 && g <= n; guard++) {
        var f = foldOver(d, g - 1);
        if (!f) break;
        g = f.to.line + 2;
      }
      return clamp(g, 1, n + 1);
    };
    ed.rect = function () {
      var b = wrap.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    };
    // client pixels -> { line, col, gap } (upper half of a line = before it, lower half = before the next); null off the editor
    ed.posAt = function (x, y) {
      if (!cur || typeof x !== 'number' || typeof y !== 'number') return null;
      var b = wrap.getBoundingClientRect();
      if (x < b.left || x >= b.right || y < b.top || y >= b.bottom) return null;
      var d = cur.doc, n = d.lineCount(), last = n - 1;
      var endBox = cm.charCoords(CM.Pos(last, 0), 'window');
      if (y >= endBox.bottom) return { line: n, col: d.getLine(last).length + 1, gap: n + 1 };
      var p = cm.coordsChar({ left: x, top: y }, 'window'), ln = p.line;
      var box = cm.charCoords(CM.Pos(ln, p.ch), 'window');
      if (y < box.top + (box.bottom - box.top) / 2) {
        // upper half: before the visual line (a folded line starts where its fold starts)
        var v = ln, f, guard = 0;
        while (guard++ < 200 && (f = foldOver(d, v))) v = f.from.line;
        return { line: ln + 1, col: p.ch + 1, gap: v + 1 };
      }
      return { line: ln + 1, col: p.ch + 1, gap: openGap(d, ln + 2) };
    };
    ed.autoScroll = function (dy) {
      dy = +dy || 0;
      if (!dy) return false;
      var s = cm.getScrollInfo(), to = clamp(s.top + dy, 0, Math.max(0, s.height - s.clientHeight));
      if (to === s.top) return false;
      cm.scrollTo(null, to);
      return true;
    };
    // a 2 px bar before line `gap`: an absolutely placed element in the text's sizer (scrolls with the text; no line class)
    var gapEl = null, gapAt = null;
    ed.gapMarker = function (gap, state) {
      if (gap == null || !cur) {
        gapAt = null;
        if (gapEl && gapEl.parentNode) gapEl.parentNode.removeChild(gapEl);
        return false;
      }
      var d = cur.doc, n = d.lineCount(), g = clamp(Math.floor(+gap) || 1, 1, n + 1);
      if (!gapEl) {
        gapEl = mk('div', 'ide-gap');
        gapEl.setAttribute('aria-hidden', 'true');
      }
      gapEl.className = 'ide-gap ' + (state === 'no' ? 'ide-gap-no' : 'ide-gap-ok');
      var y = g <= n ? cm.heightAtLine(g - 1, 'local') : cm.charCoords(CM.Pos(n - 1, 0), 'local').bottom;
      if (!gapEl.parentNode) cm.addWidget(CM.Pos(0, 0), gapEl, false);
      gapEl.style.top = Math.round(y) + 'px';
      gapEl.style.left = '0px';
      gapEl.style.right = '0px';
      gapAt = g;
      return true;
    };

    // ---- bookmark, flash ----
    ed.bookmark = function (line, col) {
      var d = cur ? cur.doc : null, bm = null;
      if (d) bm = d.setBookmark(d.clipPos(CM.Pos(Math.max(0, (line || 1) - 1), Math.max(0, (col || 1) - 1))));
      return {
        pos: function () { var p = bm ? bm.find() : null; return p ? { line: p.line + 1, col: p.ch + 1 } : null; },
        clear: function () { if (bm) { bm.clear(); bm = null; } }
      };
    };
    var reducedMotion = function () {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    };
    // one tint at a time: a new flash (or swap, destroy) takes the old one off first, so its timer never cuts the new one short
    var flashT = null, flashOn = null;
    var unflash = function () {
      clearTimeout(flashT); flashT = null;
      var f = flashOn;
      flashOn = null;
      if (!f) return;
      for (var i = 0; i < f.hs.length; i++) { try { f.d.removeLineClass(f.hs[i], 'background', 'ide-flash'); } catch (e) { logErr(e); } }
    };
    ed.flash = function (fromLine, toLine) {
      unflash();
      if (!cur || reducedMotion()) return false;
      var d = cur.doc, last = d.lastLine(), p = Math.floor(+fromLine) || 1, q = toLine == null ? p : (Math.floor(+toLine) || p);
      if (q < p) { var t = p; p = q; q = t; }
      var a = clamp(p - 1, 0, last), z = clamp(q - 1, a, last);
      if (z - a > 5000) z = a + 5000;
      var hs = [];
      cm.operation(function () { for (var i = a; i <= z; i++) hs.push(d.addLineClass(i, 'background', 'ide-flash')); });
      flashOn = { d: d, hs: hs };
      flashT = setTimeout(unflash, 700);
      return true;
    };

    // ---- field session: tab stops over text just inserted ----
    // s = { r: doc record, list:[{ f, mark, dot: widget bookmark of an empty field, cls, msg }], i: active index,
    //       caret: bookmark|null, opts, bar, deny, ended, own, cmpAt: bookmark where an IME composition started,
    //       pend: the end reason found in beforeChange, run from the 'change' event }
    var fieldRange = function (s, k) {
      var fr = s.list[k], m = fr && fr.mark ? fr.mark.find() : null;
      return m && m.from ? m : null;
    };
    // the field holding [from, to] (the active one first), or -1
    var fieldOf = function (s, from, to) {
      var order = [s.i], k;
      for (k = 0; k < s.list.length; k++) if (k !== s.i) order.push(k);
      for (var j = 0; j < order.length; j++) {
        k = order[j];
        var rg = k >= 0 ? fieldRange(s, k) : null;
        if (rg && CM.cmpPos(rg.from, from) <= 0 && CM.cmpPos(to, rg.to) <= 0) return k;
      }
      return -1;
    };
    var fieldValue = function (s, k) { var rg = fieldRange(s, k); return rg ? s.r.doc.getRange(rg.from, rg.to) : ''; };
    var fieldTest = function (s, k) {
      var fr = s.list[k], msg = '';
      if (typeof fr.f.test === 'function') {
        try { msg = fr.f.test(fieldValue(s, k)) || ''; } catch (e) { logErr(e); msg = ''; }
      }
      fr.msg = msg ? String(msg) : '';
    };
    // (re)mark a field when its class changes: active, value does not fit
    // an empty field draws nothing through its mark (CodeMirror paints no span for an empty range), so it gets a thin
    // widget with the same classes at its place; gone again once the field has text
    var fieldDot = function (s, fr, rg) {
      var empty = !!rg && CM.cmpPos(rg.from, rg.to) === 0, at = fr.dot ? fr.dot.find() : null;
      if (fr.dot && (!empty || fr.dotCls !== fr.cls || !at || CM.cmpPos(at, rg.from) !== 0)) { fr.dot.clear(); fr.dot = null; }
      if (!empty || fr.dot) return;
      var el = mk('span', fr.cls + ' ide-field-empty');
      el.setAttribute('aria-hidden', 'true');
      fr.dot = s.r.doc.setBookmark(rg.from, { widget: el, handleMouseEvents: true });
      fr.dotCls = fr.cls;
    };
    var fieldMark = function (s, k, rg) {
      var fr = s.list[k];
      var cls = 'ide-field' + (k === s.i ? ' ide-field-on' : '') + (fr.msg ? ' ide-field-bad' : '');
      rg = rg || fieldRange(s, k);
      if (!(fr.mark && fr.cls === cls)) {
        if (!rg) return;
        if (fr.mark) fr.mark.clear();
        fr.mark = s.r.doc.markText(rg.from, rg.to, { className: cls, inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false });
        fr.cls = cls;
      }
      fieldDot(s, fr, rg);
    };
    // opts.denied (optional, translated by the caller): the message for a refused character, {ch} = that character
    var denyText = function (s) { return s.opts.denied ? String(s.opts.denied).replace('{ch}', s.deny) : '\u2298 ' + s.deny; };
    // the live region: label, hint and message when a field gets focus; only = 'deny' | 'msg' speaks just that news
    var announce = function (s, only) {
      var fr = s.list[s.i];
      if (!fr) return;
      var t = only === 'deny' ? denyText(s) : only === 'msg' ? fr.msg : [fr.f.label, fr.f.hint, fr.msg].filter(function (x) { return x; }).join('. ');
      if (t) live.textContent = t;
    };
    var barButton = function (text, cls, run) {
      var b = mk('button', 'ide-fbar-b ' + cls, text);
      b.type = 'button';
      b.tabIndex = -1;
      // focus stays in the text: the press is cancelled, the click does the work
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); run(); });
      return b;
    };
    var MAX_WORDS = 40;
    var drawBar = function (s, scroll) {
      if (s.bar && s.bar.parentNode) s.bar.parentNode.removeChild(s.bar);
      var fr = s.list[s.i], rg = fieldRange(s, s.i);
      if (!fr || !rg) return;
      var bar = mk('div', 'ide-fbar' + (s.deny ? ' ide-fbar-deny' : ''));
      bar.setAttribute('aria-hidden', 'true'); // never focused; the live region speaks label, hint and message
      bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
      var top = mk('div', 'ide-fbar-top');
      top.appendChild(mk('span', 'ide-fbar-n', (s.i + 1) + '/' + s.list.length));
      if (fr.f.label) top.appendChild(mk('span', 'ide-fbar-l', fr.f.label));
      bar.appendChild(top);
      if (fr.f.hint) bar.appendChild(mk('div', 'ide-fbar-h', fr.f.hint));
      var words = fr.f.words && fr.f.words.length ? fr.f.words : null;
      if (words) {
        var wl = mk('div', 'ide-fbar-w');
        for (var i = 0; i < words.length && i < MAX_WORDS; i++) {
          (function (w) {
            var sp = mk('span', 'ide-fbar-word', w);
            sp.addEventListener('mousedown', function (e) { e.preventDefault(); });
            sp.addEventListener('click', function (e) { e.preventDefault(); pickWord(s, w); });
            wl.appendChild(sp);
          })(String(words[i]));
        }
        if (words.length > MAX_WORDS) wl.appendChild(mk('span', 'ide-fbar-more', '\u2026'));
        bar.appendChild(wl);
      }
      if (s.deny) {
        bar.appendChild(mk('div', 'ide-fbar-msg', denyText(s)));
      } else if (fr.msg) bar.appendChild(mk('div', 'ide-fbar-msg', fr.msg));
      var acts = mk('div', 'ide-fbar-acts');
      if (s.i < s.list.length - 1) acts.appendChild(barButton(s.opts.next || '\u2192', 'ide-fbar-next', function () { if (sess === s) sessMove(s, 1); }));
      acts.appendChild(barButton(s.opts.done || '\u2713', 'ide-fbar-done', function () { if (sess === s) sessEnd('done'); }));
      bar.appendChild(acts);
      s.bar = bar;
      var at = rg.to.line === rg.from.line ? rg.from : CM.Pos(rg.to.line, 0);
      cm.addWidget(at, bar, !!scroll, 'near');
    };
    var sessFocus = function (s, k, select) {
      var prev = s.i;
      s.i = k;
      fieldTest(s, k);
      cm.operation(function () {
        if (prev >= 0 && prev !== k && prev < s.list.length) fieldMark(s, prev);
        fieldMark(s, k);
        var rg = fieldRange(s, k);
        if (select && rg) cm.setSelection(rg.from, rg.to);
      });
      s.deny = '';
      drawBar(s, select);
      announce(s);
    };
    var sessMove = function (s, dir) {
      var n = s.list.length;
      sessFocus(s, ((s.i + dir) % n + n) % n, true);
    };
    var pickWord = function (s, w) {
      if (sess !== s) return;
      var rg = fieldRange(s, s.i);
      if (!rg) return;
      s.own++;
      try { s.r.doc.replaceRange(w, rg.from, rg.to, '+kit'); } finally { s.own--; }
      if (sess === s) sessFocus(s, s.i, true);
      cm.focus();
    };
    // stay: the cursor stays where it is even for 'esc' (the key came with the cursor off every field)
    var sessEnd = function (why, stay) {
      var s = sess;
      if (!s || s.ended) return;
      s.ended = true;
      sess = null;
      clearTimeout(s.denyT);
      if (s.cmpAt) { s.cmpAt.clear(); s.cmpAt = null; }
      for (var i = 0; i < s.list.length; i++) {
        if (s.list[i].mark) { s.list[i].mark.clear(); s.list[i].mark = null; }
        if (s.list[i].dot) { s.list[i].dot.clear(); s.list[i].dot = null; }
      }
      if (s.bar && s.bar.parentNode) s.bar.parentNode.removeChild(s.bar);
      rmClass(wrap, 'ide-insession');
      cm.setOption('electricChars', s.elec);
      var cp = s.caret ? s.caret.find() : null;
      if (s.caret) s.caret.clear();
      // a key or button that ends the session puts the cursor on the piece's caret spot; other ends leave it alone
      if (cp && !stay && (why === 'esc' || why === 'done') && cur === s.r) cm.setCursor(cp);
      if (typeof s.opts.onEnd === 'function') { try { s.opts.onEnd(why); } catch (e) { logErr(e); } }
    };
    // keys of a session; true = handled (the editor's own Tab-mode and Esc code does not run)
    var sessKey = function (e) {
      var s = sess, k = e.keyCode;
      if (!s || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || k === 229) return false;
      // the cursor was moved off every field (arrows, Home, End): the session is over and the cursor stays. Tab and Enter
      // then do their own work (a tab, a new line); Esc only ends it (it does not arm Tab mode)
      var h = cm.getCursor('head');
      if ((k === 9 || (k === 13 && !e.shiftKey) || k === 27) && fieldOf(s, h, h) < 0) {
        if (k === 27 && (card || e.ideClosedCard)) return false;
        sessEnd(k === 27 ? 'esc' : 'edit', true);
        if (k !== 27) return false;
        e.preventDefault();
        return true;
      }
      if (k === 9) {
        e.preventDefault();
        sessMove(s, e.shiftKey ? -1 : 1);
        return true;
      }
      if (k === 13 && !e.shiftKey) {
        e.preventDefault();
        if (s.i >= s.list.length - 1) sessEnd('done'); else sessMove(s, 1);
        return true;
      }
      if (k === 27) {
        if (card || e.ideClosedCard) return false; // this Esc closes the hover card first
        e.preventDefault();
        sessEnd('esc');
        return true;
      }
      return false;
    };
    // typed or pasted text: refused characters cancel the change; an edit outside every field, an undo or redo ends.
    // CodeMirror allows no mark or doc work inside beforeChange, so an end found here runs from the 'change' event right
    // after (still inside the same call, so callers see it at once); a change another filter cancels ends a frame later.
    var pendEnd = function (s, why) {
      s.pend = why;
      later(function () { if (sess === s) sessEnd(why); });
    };
    cm.on('change', function () { var s = sess; if (s && s.pend) sessEnd(s.pend); });
    cm.on('beforeChange', function (c, ch) {
      var s = sess;
      if (!s || s.ended || s.pend || s.own || c.getDoc() !== s.r.doc) return;
      if (ch.origin === 'undo' || ch.origin === 'redo') { pendEnd(s, 'undo'); return; }
      if (ch.origin === 'setValue') { pendEnd(s, 'reload'); return; }
      var k = fieldOf(s, ch.from, ch.to);
      if (k < 0) { pendEnd(s, 'edit'); return; }
      // an IME composition is never refused while it runs: CodeMirror replaces the composing text by count of characters,
      // so a cancelled step would make the commit eat real text. Refused characters are taken out when it ends (cmpClean).
      // an 'ide' change (applyEdits: a kit insert, a quick fix) is the tool's own text, never a typed character: never refused
      if (ch.origin === '*compose' || ch.origin === 'ide') return;
      var deny = s.list[k].f.deny, text = ch.text ? ch.text.join('\n') : '';
      if (!deny || !text) return;
      deny = String(deny);
      for (var i = 0; i < text.length; i++) {
        if (deny.indexOf(text.charAt(i)) < 0) continue;
        ch.cancel();
        denied(s, text.charAt(i));
        return;
      }
    });
    // show (bar, later) and speak (live region, now) a refused character
    // a held key repeats the same refusal: it is spoken once while the bar still shows it (each repeat restarts the
    // bar's 1.6 s), not on every repeat; another character, the same one after the bar cleared, or the same one after
    // the live region took other news (a test message) is spoken again
    var denied = function (s, c) {
      var was = s.deny;
      s.deny = c === '\n' ? '\u21b5' : (c === '\t' ? '\u21e5' : (c === ' ' ? '\u2423' : c));
      clearTimeout(s.denyT);
      s.denyT = setTimeout(function () { if (sess === s) { s.deny = ''; drawBar(s, false); } }, 1600);
      later(function () { if (sess === s) drawBar(s, false); });
      if (s.deny !== was || live.textContent !== denyText(s)) announce(s, 'deny');
    };
    // a composition ended: take refused characters out of what it put in [a, b] with an own edit
    var cmpClean = function (s, a, b) {
      if (CM.cmpPos(b, a) < 0) { var t = a; a = b; b = t; }
      var k = fieldOf(s, a, b), deny = k >= 0 ? s.list[k].f.deny : '';
      if (!deny) return;
      deny = String(deny);
      var d = s.r.doc, text = d.getRange(a, b), keep = '', first = '';
      for (var i = 0; i < text.length; i++) {
        if (deny.indexOf(text.charAt(i)) < 0) keep += text.charAt(i);
        else if (!first) first = text.charAt(i);
      }
      if (!first) return;
      // the composition's own origin: CodeMirror merges it into the composition's undo step, so one Ctrl+Z takes out both
      // (a step of its own would let Ctrl+Z bring the refused characters back)
      s.own++;
      try { d.replaceRange(keep, a, b, '*compose'); } finally { s.own--; }
      if (sess === s) denied(s, first);
    };
    var inp = cm.getInputField();
    inp.addEventListener('compositionstart', function () {
      var s = sess;
      if (!s || s.ended || cur !== s.r) return;
      if (s.cmpAt) s.cmpAt.clear();
      s.cmpAt = s.r.doc.setBookmark(cm.getCursor('from'));
    }, false);
    // CodeMirror's own compositionend handler (added first) has already put the committed text in
    inp.addEventListener('compositionend', function () {
      var s = sess;
      if (!s || s.ended || !s.cmpAt) return;
      var a = s.cmpAt.find();
      s.cmpAt.clear(); s.cmpAt = null;
      if (a && cur === s.r) cmpClean(s, a, cm.getCursor('head'));
    }, false);
    cm.on('changes', function () {
      var s = sess;
      if (!s || s.ended || cur !== s.r) return;
      for (var i = 0; i < s.list.length; i++) if (!fieldRange(s, i)) { sessEnd('lost'); return; }
      var on = s.list[s.i], was = on ? on.msg : '';
      cm.operation(function () {
        for (var k = 0; k < s.list.length; k++) { fieldTest(s, k); fieldMark(s, k); }
      });
      drawBar(s, false);
      if (on && on.msg && on.msg !== was) announce(s, 'msg'); // a new test message is spoken, not only drawn
    });
    cm.on('cursorActivity', function (c) {
      var s = sess;
      if (!s || s.ended || swapping) return;
      var h = c.getCursor('head'), k = fieldOf(s, h, h);
      if (k >= 0 && k !== s.i) sessFocus(s, k, false);
    });
    cm.on('mousedown', function (c, e) {
      var s = sess;
      if (!s || (s.bar && inside(e.target, s.bar)) || inWidget(e.target)) return;
      if (inGutter(e.target)) { sessEnd('click'); return; }
      var p = c.coordsChar({ left: e.clientX, top: e.clientY }, 'window');
      if (fieldOf(s, p, p) < 0) sessEnd('click');
    });
    // fields = [{ name, k, line, col, len, label, hint?, words?, deny?, test? }] in tab order; caret = {line, col}|null
    ed.fieldSession = function (fields, caret, opts) {
      if (sess) sessEnd('lost');
      opts = opts || {};
      if (!cur || cur.ro) return null;
      var r = cur, d = r.doc, list = [], i;
      for (i = 0; fields && i < fields.length; i++) {
        var f = fields[i];
        if (!f || f.k === 'list') continue; // a fixed list the kit writes is not a tab stop
        var a = d.clipPos(CM.Pos(Math.max(0, (f.line || 1) - 1), Math.max(0, (f.col || 1) - 1)));
        var z = d.posFromIndex(d.indexFromPos(a) + Math.max(0, Math.floor(+f.len) || 0));
        list.push({ f: f, a: a, z: z, mark: null, dot: null, dotCls: '', cls: '', msg: '' });
      }
      var cb = caret ? d.setBookmark(d.clipPos(CM.Pos(Math.max(0, (caret.line || 1) - 1), Math.max(0, (caret.col || 1) - 1)))) : null;
      if (!list.length) {
        var cp = cb ? cb.find() : null;
        if (cb) cb.clear();
        if (cp) cm.setCursor(cp);
        cm.focus();
        return null;
      }
      var s = { r: r, list: list, i: -1, caret: cb, opts: opts, bar: null, deny: '', denyT: null, ended: false, own: 0, pend: '', cmpAt: null,
        elec: cm.getOption('electricChars') };
      closeCard();
      if (cm.closeHint) cm.closeHint();
      if (tabOnce) setTab(false, false); // an Esc armed before the session must not make a later Tab leave the text
      // no electric input while fields are filled: a '}' typed in a text or comment field would re-indent the whole line,
      // an edit off every field that ends the session and rewrites the indent the piece got (sessEnd puts it back)
      cm.setOption('electricChars', false);
      sess = s;
      cm.operation(function () {
        for (var k = 0; k < list.length; k++) {
          var fr = list[k];
          fr.cls = 'ide-field';
          fr.mark = d.markText(fr.a, fr.z, { className: fr.cls, inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false });
          fieldDot(s, fr, fieldRange(s, k));
        }
      });
      addClass(wrap, 'ide-insession');
      cm.focus();
      sessFocus(s, 0, true);
      return { end: function (why) { if (sess === s) sessEnd(why || 'done'); } };
    };
    ed.inSession = function () { return !!sess; };

    // ==== (inc) inline include windows (tools/ide/README.md "Inline include windows") ====
    // the CodeMirror doc behind an id, for linkDoc of another editor (not for callers outside the cm layer)
    ed.cmDoc = function (id) { var r = get(id); return r ? { doc: r.doc, gen: r.gen, big: r.big } : null; };
    // one buffer in two views: the new doc `id` is a linked copy of src = { ed, id } (CodeMirror linkedDoc, shared history), so text,
    // undo and the clean mark are one. The clean mark of `id` starts as src's.
    ed.linkDoc = function (id, src, kind, readOnly) {
      var s = src && src.ed && typeof src.ed.cmDoc === 'function' ? src.ed.cmDoc(src.id) : null;
      if (!s || id == null) return false;
      if (docs.hasOwnProperty(id)) ed.dropDoc(id);
      var d = s.doc.linkedDoc({ sharedHist: true });
      docs[id] = { id: id, doc: d, kind: kind, ro: !!readOnly, gen: s.gen, marks: [], depth: true, big: !!s.big };
      return true;
    };
    // a block under host line `line` of the doc shown now (CodeMirror line widget): it moves with its line, adds no text and no line
    // number. -> { line() -> 1-based line now | null (the line is gone), changed() (height changed), clear(), doc: id } | null
    ed.inline = function (line, node, opts) {
      if (!cur || !node || !node.nodeType) return null;
      opts = opts || {};
      var r = cur, d = r.doc, ln = clamp((Math.floor(+line) || 1) - 1, 0, d.lastLine());
      addClass(node, 'ide-inl');
      var w = d.addLineWidget(ln, node, { coverGutter: false, noHScroll: true, above: false, handleMouseEvents: false });
      // the wheel scrolls the window's text, never the host's handler too
      node.addEventListener('wheel', function (e) { if (e.stopPropagation) e.stopPropagation(); }, false);
      return {
        doc: r.id,
        line: function () { var h = w.line, n = h ? d.getLineNumber(h) : null; return n == null ? null : n + 1; },
        changed: function () { try { w.changed(); } catch (e) { logErr(e); } },
        clear: function () { try { w.clear(); } catch (e) { logErr(e); } }
      };
    };
    // the arrows in the include gutter of the doc shown now: list = [{ line, open, title }], fn(line) on a click
    var incFn = null;
    ed.incGutter = function (list, fn) {
      if (!cur) return false;
      incFn = typeof fn === 'function' ? fn : null;
      cm.operation(function () {
        cm.clearGutter('ide-incg');
        var last = cur.doc.lastLine();
        for (var i = 0; list && i < list.length; i++) {
          var it = list[i], ln = (Math.floor(+it.line) || 0) - 1;
          if (ln < 0 || ln > last) continue;
          var el = mk('span', 'ide-incm' + (it.open ? ' ide-incm-on' : ''), it.open ? '▾' : '▸');
          if (it.title) el.title = String(it.title);
          el.setAttribute('aria-hidden', 'true');
          cm.setGutterMarker(ln, 'ide-incg', el);
        }
      });
      return true;
    };
    cm.on('gutterClick', function (c, ln, gutter, e) {
      if (gutter !== 'ide-incg' || !incFn) return;
      if (e && e.preventDefault) e.preventDefault();
      try { incFn(ln + 1); } catch (err) { logErr(err); }
    });
    // scroll place (the jump trail): { top, left } in px; setView puts it back
    ed.view = function () { var s = cm.getScrollInfo(); return { top: s.top, left: s.left }; };
    ed.setView = function (v) { if (!v) return false; cm.scrollTo(v.left == null ? null : v.left, v.top == null ? null : v.top); return true; };
    ed.hasFocus = function () { return cm.hasFocus(); };
    ed.wrapper = function () { return wrap; };

    ed.refresh = function () { cm.refresh(); };
    ed.destroy = function () {
      if (sess) sessEnd('lost');
      ed.gapMarker(null);
      unflash();
      unlive(retheme);
      closeCard(); clearCtrl();
      if (ro) ro.disconnect();
      document.removeEventListener('keydown', onCtrlKey, false);
      document.removeEventListener('keyup', onCtrlKey, false);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    return ed;
  };

  ED.compare = function (host, o) {
    o = o || {};
    var L0 = o.left || {}, R0 = o.right || {};
    if (!host || typeof host.appendChild !== 'function' || !host.nodeType) throw new Error('IDE_ED.compare: the host element is missing.');
    var phrases = o.phrases && typeof o.phrases === 'object' ? o.phrases : lastPhrases;
    var tr = function (s) { return trIn(phrases, s); };
    addClass(host, 'ide-cmp-host');
    // class prefix ide-cv: the shell already styles .ide-cmp (its overlay box), so nothing here reuses that name
    var box = mk('div', 'ide-cv' + (curTheme === 'light' ? ' ide-cv-light' : '')), sum = mk('div', 'ide-cv-sum'), row = mk('div', 'ide-cv-row'), cms = [];
    sum.setAttribute('role', 'status');
    box.appendChild(sum); box.appendChild(row);
    var pane = function (side, cls) {
      var p = mk('div', 'ide-cv-pane ' + cls), t = mk('div', 'ide-cv-title', side.title || ''), b = mk('div', 'ide-cv-body');
      p.appendChild(t); p.appendChild(b); row.appendChild(p);
      return b;
    };
    var lb = pane(L0, 'ide-cv-left'), rb = pane(R0, 'ide-cv-right');
    host.appendChild(box);
    // two equal columns when the host is at least 560 px wide, stacked below that
    var NARROW = 560;
    var layout = function () {
      var w = host.clientWidth || 0;
      if (w && w < NARROW) addClass(box, 'ide-cv-narrow'); else rmClass(box, 'ide-cv-narrow');
    };
    layout();
    var make = function (where, side) {
      var c = CM(where, {
        value: side.text == null ? '' : String(side.text), mode: modeOf(o.kind), theme: themeOf(curTheme), readOnly: true,
        lineNumbers: true, gutters: ['ide-cv-sign', 'CodeMirror-linenumbers'], tabSize: 4, indentUnit: 4, lineWrapping: false,
        lineSeparator: null, spellcheck: false, matchBrackets: true, screenReaderLabel: side.title || tr('Compare'),
        phrases: phrases, specialChars: SPECIAL, specialCharPlaceholder: oddMark(phrases)
      });
      addClass(c.getWrapperElement(), 'ide-cm');
      cms.push(c);
      return c;
    };
    var L = make(lb, L0), R = make(rb, R0);
    var recv = function (t) {
      if (t === 'light') addClass(box, 'ide-cv-light'); else rmClass(box, 'ide-cv-light');
      for (var i = 0; i < cms.length; i++) if (cms[i].getOption('theme') !== themeOf(t)) cms[i].setOption('theme', themeOf(t));
    };
    LIVE.push(recv);
    var diff = ideLineDiff(L.getValue('\n').split('\n'), R.getValue('\n').split('\n'));
    // changed lines: tinted background + a '-' / '+' sign in the gutter (readable without colour)
    var sign = function (ch, cls) { return mk('span', 'ide-cv-mark ' + cls, ch); };
    L.operation(function () {
      for (var i = 0; i < diff.left.length; i++) {
        L.addLineClass(diff.left[i], 'background', 'ide-cmp-del');
        L.setGutterMarker(diff.left[i], 'ide-cv-sign', sign('-', 'ide-cv-del'));
      }
    });
    R.operation(function () {
      for (var i = 0; i < diff.right.length; i++) {
        R.addLineClass(diff.right[i], 'background', 'ide-cmp-add');
        R.setGutterMarker(diff.right[i], 'ide-cv-sign', sign('+', 'ide-cv-add'));
      }
    });
    var nl = diff.left.length, nr = diff.right.length;
    var summary = nl + nr === 0 ? tr('No differences')
      : tr('Changed lines: {left} on the left, {right} on the right').replace('{left}', String(nl)).replace('{right}', String(nr));
    if (!diff.exact) summary += ' ' + tr('(long files: lines compared by position)');
    sum.textContent = summary;
    // scroll lock both ways; the echo from the other pane is ignored for a short while
    var src = null, srcT = 0;
    var follow = function (a, b) {
      return function () {
        var now = new Date().getTime();
        if (src === b && now - srcT < 150) return;
        src = a; srcT = now;
        var s = a.getScrollInfo();
        b.scrollTo(s.left, s.top);
      };
    };
    var fL = follow(L, R), fR = follow(R, L);
    L.on('scroll', fL); R.on('scroll', fR);
    var ro = null;
    if (window.ResizeObserver) {
      var pend = false;
      ro = new window.ResizeObserver(function () {
        if (pend) return;
        pend = true;
        later(function () { pend = false; layout(); L.refresh(); R.refresh(); });
      });
      ro.observe(host);
    }
    return {
      left: L, right: R, changed: nl + nr, counts: { left: nl, right: nr }, exact: diff.exact, summary: summary,
      close: function () {
        unlive(recv);
        L.off('scroll', fL); R.off('scroll', fR);
        if (ro) ro.disconnect();
        if (box.parentNode) box.parentNode.removeChild(box);
        rmClass(host, 'ide-cmp-host');
      }
    };
  };

  ED.ready = true;
}
