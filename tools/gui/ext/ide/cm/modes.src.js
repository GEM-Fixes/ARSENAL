// ide cm modes: sdl, lng, po, log, text for CodeMirror 5 (served raw in ide.js; also loaded by selfcheck.js in node
// through addon/runmode/runmode.node.js). ES5 only. Rules ported from the retired as2-sdl.tmLanguage.json and
// tools/lib/sdl.js tokenize: ';' comment to end of line (not inside a string), strings never span lines.
// Author: Imperator_Aug (ARSENAL, ia-77f246a9)
function ideModes(CodeMirror, cfg) {
  var ATOMS = {}, aw = (cfg && cfg.atoms) || [], i;
  for (i = 0; i < aw.length; i++) ATOMS[String(aw[i]).toLowerCase()] = true;
  var FORMS = { include: 1, define: 1, mod: 1, args: 1 };
  var NUM = /^-?(?:0[xX][0-9A-Fa-f]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/;
  var WORD = /^[^\s{}";()]+/;

  // index of the quote that closes a string opened before `from`, or -1 (escapes skip one char)
  function closeQuote(s, from) {
    for (var k = from; k < s.length; k++) {
      var c = s.charAt(k);
      if (c === '\\') { k++; continue; }
      if (c === '"') return k;
    }
    return -1;
  }

  function sdlMode(config, lng) {
    var unit = config.indentUnit || 4;

    function inString(stream, state) {
      if (stream.match(/^\\./)) return 'string strsub';
      if (stream.match(/^%[A-Za-z0-9_]+/)) return 'string strsub';
      if (lng && stream.match(/^\{[^{}"]*\}/)) return 'string strsub';
      while (!stream.eol()) {
        var c = stream.peek();
        if (c === '"') { stream.next(); state.str = false; return 'string'; }
        if (c === '\\' || (c === '%' && /[A-Za-z0-9_]/.test(stream.string.charAt(stream.pos + 1))) || (lng && c === '{')) {
          if (stream.current().length) return 'string';
        }
        stream.next();
      }
      state.str = false;
      return 'string';
    }

    return {
      startState: function () { return { depth: 0, afterBrace: false, form: false, str: false }; },
      copyState: function (s) { return { depth: s.depth, afterBrace: s.afterBrace, form: s.form, str: s.str }; },
      blankLine: function (state) { state.str = false; },
      token: function (stream, state) {
        if (stream.sol()) state.str = false; // strings never span lines
        if (state.str) return inString(stream, state);
        if (stream.eatSpace()) return null;
        var c = stream.peek();
        if (c === ';') { stream.skipToEnd(); return 'comment'; }
        if (c === '"') {
          state.afterBrace = false; state.form = false;
          if (closeQuote(stream.string, stream.pos + 1) < 0) { stream.skipToEnd(); return 'error'; }
          stream.next(); state.str = true;
          return 'string';
        }
        if (c === '{') { stream.next(); state.depth++; state.afterBrace = true; state.form = false; return 'bracket'; }
        if (c === '}') { stream.next(); if (state.depth > 0) state.depth--; state.afterBrace = false; state.form = false; return 'bracket'; }
        if (c === '(') { stream.next(); state.form = true; state.afterBrace = false; return 'bracket'; }
        if (c === ')') { stream.next(); state.form = false; return 'bracket'; }
        var m = stream.match(WORD);
        if (!m) { stream.next(); return null; }
        var w = m[0], wasForm = state.form, wasKey = state.afterBrace;
        state.form = false; state.afterBrace = false;
        if (wasForm && FORMS.hasOwnProperty(w)) return 'meta';
        if (wasKey && w === '+') { state.afterBrace = true; return 'operator'; }
        if (wasKey) return 'keyword';
        if (w.charAt(0) === '%') return 'variable-2';
        if (NUM.test(w)) return 'number';
        if (w === 'args') return 'variable-2';
        if (!lng && ATOMS.hasOwnProperty(w.toLowerCase())) return 'atom';
        return null;
      },
      indent: function (state, textAfter) {
        var d = state.depth;
        if (/^\}/.test(textAfter)) d--;
        return Math.max(0, d) * unit;
      },
      electricChars: '}',
      lineComment: ';',
      fold: 'brace'
    };
  }

  CodeMirror.defineMode('sdl', function (config) { return sdlMode(config, false); });
  CodeMirror.defineMode('lng', function (config) { return sdlMode(config, true); });

  // game.log: severity per line (error red, warning yellow), file/line references as links, timestamps dim
  var LOG_ERR = /\b(?:error|errors|exception|assert|assertion|failed|failure|fatal|crash)\b/i;
  var LOG_WARN = /\b(?:warn|warning|warnings)\b/i;
  CodeMirror.defineMode('log', function () {
    return {
      startState: function () { return { sev: '' }; },
      token: function (stream, state) {
        if (stream.sol()) {
          var s = stream.string;
          state.sev = LOG_ERR.test(s) ? 'lerr' : (LOG_WARN.test(s) ? 'lwarn' : '');
          if (stream.match(/^\s*\[\d{1,3}:\d{2}:\d{2}(?:[.,]\d+)?\]/) ||
              stream.match(/^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/)) return 'ldim';
        }
        var sev = state.sev;
        if (stream.match(/^file\s*[:=]?\s*"[^"]*"/i) || stream.match(/^line\s*[:=]?\s*\d+/i) ||
            stream.match(/^\((?:[A-Za-z]:)?[^(),\s]*\.[A-Za-z0-9]{1,5}, ?\d+\)/)) return sev ? 'link ' + sev : 'link';
        if (!stream.match(/^\w+/)) stream.next();
        return sev || null;
      },
      lineComment: null
    };
  });

  // GoH text (.pot / .po, gettext; GHLOC-01, GHLOC-06): '#' comment lines ('#,' flags, '#:' places, '#.' notes), the words msgctxt,
  // msgid, msgid_plural, msgstr and msgstr[n], one "..." string per line (a string goes on in the next line's own "..."), escapes
  // \n \t \" \\ and {tags} inside strings. An unclosed string is an error to the end of the line. AS2 has no .pot or .po file.
  CodeMirror.defineMode('po', function () {
    return {
      startState: function () { return { str: false }; },
      copyState: function (s) { return { str: s.str }; },
      blankLine: function (state) { state.str = false; },
      token: function (stream, state) {
        if (stream.sol()) state.str = false;
        if (state.str) {
          if (stream.match(/^\\./)) return 'string strsub';
          if (stream.match(/^\{[^{}"]*\}/)) return 'string strsub';
          while (!stream.eol()) {
            var c = stream.peek();
            if (c === '"') { stream.next(); state.str = false; return 'string'; }
            if (c === '\\' || c === '{') { if (stream.current().length) return 'string'; }
            stream.next();
          }
          state.str = false;
          return 'string';
        }
        if (stream.eatSpace()) return null;
        if (stream.sol() || /^\s*$/.test(stream.string.slice(0, stream.pos))) {
          if (stream.peek() === '#') { stream.skipToEnd(); return /^\s*#[,:.|]/.test(stream.string) ? 'meta' : 'comment'; }
        }
        if (stream.peek() === '"') {
          if (closeQuote(stream.string, stream.pos + 1) < 0) { stream.skipToEnd(); return 'error'; }
          stream.next(); state.str = true;
          return 'string';
        }
        if (stream.match(/^(?:msgctxt|msgid_plural|msgid|msgstr)(?:\[\d+\])?(?=\s|"|$)/)) return 'keyword';
        if (stream.match(/^[^\s"]+/)) return 'error';
        stream.next();
        return null;
      },
      lineComment: '#'
    };
  });

  CodeMirror.defineMode('text', function () {
    return { token: function (stream) { stream.skipToEnd(); return null; } };
  });
}
