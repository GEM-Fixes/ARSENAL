// ide cm selfcheck: compiles ide.js, rough ES5 pass, runs the sdl/lng/log modes in node through CodeMirror's
// addon/runmode/runmode.node.js on fx/ fixtures and asserts token classes, brace folding, indent, wordAt, line diff.
// usage: node tools/gui/ext/ide/cm/selfcheck.js [<codemirror package dir>]   last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-3be4c94b)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TMPROOT = process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : require('os').tmpdir();
const PKG = process.argv[2] || path.join(TMPROOT, 'ide', 'cm5pkg', 'package');
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else { fails++; console.log('FAIL ' + msg); } };

// 1. build + compile
const out = require('./index.js');
ok(typeof out.js === 'string' && typeof out.css === 'string', 'index exports {js, css} strings');
try { new vm.Script(out.js, { filename: 'ide.js' }); ok(true); } catch (e) { ok(false, 'ide.js compiles: ' + e.message); }

// 2. rough ES5 pass: strip strings, comments and regex literals, then look for ES6+ syntax
function strip(src) {
  let o = '', i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; o += ' '; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++; o += '""'; prev = '"'; continue;
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\breturn$/.test(o))) {
      i++; let cls = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        else if (src[i] === '/' && !cls) break;
        i++;
      }
      i++; while (i < n && /[gimy]/.test(src[i])) i++;
      o += '/r/'; prev = '/'; continue;
    }
    o += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return o;
}
// the stripper must still see code after a division, a regex with a quote and a string with a slash
ok(/let q/.test(strip('var a = b / 2; var r = /"[^"]*"/; var s = "x//y"; let q = 1')), 'ES5 pass sees code after / and regex');
ok(!/=>/.test(strip('var s = "() => 1"; // x => y')), 'ES5 pass ignores strings and comments');
const bare = strip(out.js);
const bad = [[/=>/, 'arrow'], [/`/, 'backtick'], [/\blet\s/, 'let'], [/\bconst\s/, 'const'], [/\bclass\s+\w/, 'class'],
  [/\.\.\.\w/, 'spread'], [/\$\{/, 'dollar-brace'], [/innerHTML|insertAdjacentHTML|document\.write/, 'html sink'], [/\bfor\s*\([^)]*\bof\b/, 'for-of']];
for (const [re, what] of bad) {
  const m = re.exec(bare);
  ok(!m, 'ES5: no ' + what + (m ? ' near: ' + bare.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') : ''));
}
ok(/\bwindow\.IDE_ED\b/.test(out.js), 'js defines window.IDE_ED');

// 3. without CodeMirror the script still defines IDE_ED (ready:false) and create() throws a clear Error, never null
let PHR = [];
{
  const sb = { window: {}, document: {}, console };
  vm.runInNewContext(out.js, sb);
  const E = sb.window.IDE_ED;
  ok(E && E.ready === false && typeof E.create === 'function', 'IDE_ED stub without CodeMirror');
  let msg = null;
  try { const r = E.create({ nodeType: 1, appendChild() {} }, {}); msg = 'returned ' + r; } catch (e) { msg = e.message; }
  ok(/CodeMirror/.test(msg) && /cannot start/.test(msg), 'create() without CodeMirror throws: ' + msg);
  msg = null;
  try { E.compare({}, {}); } catch (e) { msg = e.message; }
  ok(/CodeMirror/.test(msg || ''), 'compare() without CodeMirror throws');
  PHR = Array.from(E.PHRASES || []);
  ok(PHR.length > 20, 'IDE_ED.PHRASES exported (' + PHR.length + ')');
}

// 3b. phrases: every phrase() call in the vendored bundle and every text the editor shows is in PHRASES
{
  const bundle = require('../../../vendor/cm5/cm5.bundle.json');
  const used = new Set();
  for (const m of bundle.js.matchAll(/\.phrase\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\)/g)) used.add(JSON.parse(m[1].replace(/^'|'$/g, '"')));
  ok(used.size >= 13, 'bundle phrase() calls found (' + used.size + ')');
  for (const p of used) ok(PHR.includes(p), 'PHRASES has bundle phrase ' + JSON.stringify(p));
  // a phrase() call with a non-literal argument would escape this list
  ok(!/\.phrase\(\s*[^"'\s)]/.test(bundle.js.replace(/phrase: function\(phraseText\)/, '')), 'bundle: no phrase() with a computed key');
  const esrc = fs.readFileSync(path.join(__dirname, 'editor.src.js'), 'utf8');
  const mine = new Set();
  for (const m of esrc.matchAll(/\btr(?:In)?\((?:phrases,\s*)?'([^']+)'\)/g)) mine.add(m[1]);
  for (const m of esrc.matchAll(/\bP_(?:ON|OFF|ONCE) = '([^']+)'/g)) mine.add(m[1]);
  for (const m of esrc.matchAll(/foldMark\('[^']+', '([^']+)'\)/g)) mine.add(m[1]);
  for (const m of esrc.matchAll(/\? ODD\[ch\] : '([^']+)'/g)) mine.add(m[1]);
  const odd = /var ODD = \{([^}]*)\}/.exec(esrc);
  for (const m of (odd ? odd[1] : '').matchAll(/:\s*'([^']+)'/g)) mine.add(m[1]);
  ok(mine.size >= 15, 'editor texts found (' + mine.size + ')');
  for (const p of mine) ok(PHR.includes(p), 'PHRASES has editor text ' + JSON.stringify(p));
  for (const p of PHR) ok(used.has(p) || mine.has(p), 'PHRASES entry is used: ' + JSON.stringify(p));
  // English text the editor passes to the DOM must go through tr(): no bare string literal in title/aria/textContent
  ok(!/\.title = '[A-Za-z]/.test(esrc) && !/'aria-label', '[A-Za-z]/.test(esrc), 'editor: no untranslated title / aria-label literal');
}

// 3c. contrast: every text colour against its background, both themes (4.5 text, 3.0 wavy marks / dots / icons)
{
  const th = require('./theme.js');
  for (const name of ['gem2', 'light']) {
    const v = th.themeVars(name);
    let n = 0;
    for (const [f, bs, min] of th.CHECKS) for (const b of bs) {
      const r = th.contrast(v[f], v[b]);
      n++;
      ok(r >= min, name + ' contrast ' + f + ' #' + v[f] + ' on ' + b + ' #' + v[b] + ' = ' + r.toFixed(2) + ' < ' + min);
    }
    const s = th.SHELL[name];
    for (const [k, min] of th.SHELL_CHECKS) for (const b of ['ip', 'ib']) {
      const r = th.contrast(s[k], s[b]);
      ok(r >= min, name + ' shell --' + k + ' #' + s[k] + ' on --' + b + ' = ' + r.toFixed(2));
    }
    console.log('contrast ' + name + ': ' + n + ' pairs checked');
  }
  // (kit) field and flash marks sit under syntax text: whatever background they get (a tint over the text bg or the active
  // line, or a solid colour) must keep every syntax colour and plain text at 4.5; each still draws a visible cue
  {
    const TXT = ['key', 'type', 'number', 'string', 'operator', 'preproc', 'error', 'warn', 'brace', 'comment', 'fg'];
    const blend = (fg, bg, a) => {
      const x = parseInt(fg, 16), y = parseInt(bg, 16);
      const c = (s) => Math.round(((x >> s) & 255) * a + ((y >> s) & 255) * (1 - a));
      return ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1).toUpperCase();
    };
    for (const [cls, name, pg] of [['gem2', 'gem2', 'dark'], ['idelight', 'light', 'light']]) {
      const v = th.themeVars(name);
      for (const mark of ['ide-field', 'ide-field-on', 'ide-field-bad', 'ide-field-empty', 'ide-flash']) {
        const rule = new RegExp('\\.cm-s-' + cls + ' \\.' + mark + '\\{([^}]*)\\}').exec(out.css);
        const body = rule ? rule[1] : '';
        if (mark !== 'ide-field-bad' && mark !== 'ide-field-empty') ok(/box-shadow:inset/.test(body), cls + ' .' + mark + ' draws a visible cue: ' + body);
        const bgm = /background(?:-color)?:\s*([^;]+)/.exec(body);
        if (!bgm) continue;
        const val = bgm[1].trim();
        const under = ['bg', 'currentLine'].map((b) => {
          const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(val.replace(/\s+/g, ''));
          if (m) return [b, blend(((1 << 24) | (+m[1] << 16) | (+m[2] << 8) | +m[3]).toString(16).slice(1).toUpperCase(), v[b], +m[4])];
          const hx = /^#([0-9a-fA-F]{6})$/.exec(val), tv = /^var\(--([a-z0-9]+)\)$/.exec(val);
          return [b, hx ? hx[1].toUpperCase() : tv ? th.PAGE[pg][tv[1]] : null];
        });
        for (const [b, col] of under) {
          ok(!!col, cls + ' .' + mark + ' background readable: ' + val);
          if (col) for (const k of TXT) {
            const r = th.contrast(v[k], col);
            ok(r >= 4.5, cls + ' .' + mark + ' ' + k + ' #' + v[k] + ' on ' + val + ' over ' + b + ' = ' + r.toFixed(2) + ' < 4.5');
          }
        }
      }
      // the cue itself (underline, left bar, wavy line) is a non-text mark: 3:1 against the text bg, the active line and
      // the selection, any of which it can sit on
      for (const [mark, prop] of [['ide-field', 'box-shadow'], ['ide-field-on', 'box-shadow'], ['ide-flash', 'box-shadow'], ['ide-field-bad', 'text-decoration-color']]) {
        const rule = new RegExp('\\.cm-s-' + cls + ' \\.' + mark + '\\{([^}]*)\\}').exec(out.css);
        const m = rule ? new RegExp(prop + ':[^;]*?(#[0-9A-Fa-f]{6}|var\\(--[a-z0-9]+\\))').exec(rule[1]) : null;
        const val = m ? m[1] : '', tv = /^var\(--([a-z0-9]+)\)$/.exec(val);
        const cue = /^#/.test(val) ? val.slice(1).toUpperCase() : tv ? th.PAGE[pg][tv[1]] : null;
        ok(!!cue, cls + ' .' + mark + ' cue colour found in ' + (rule ? rule[1] : 'no rule'));
        if (cue) for (const b of ['bg', 'currentLine', 'selection', 'sessSel']) {
          const r = th.contrast(cue, v[b]);
          ok(r >= 3, cls + ' .' + mark + ' cue #' + cue + ' on ' + b + ' #' + v[b] + ' = ' + r.toFixed(2) + ' < 3');
        }
      }
      // the active field is selected (first field, Tab, Enter): its value is drawn on the session selection, which the CSS
      // gives for a focused and an unfocused editor; every syntax colour and plain text keeps 4.5 on it
      const sesRule = (sel) => new RegExp('\\.cm-s-' + cls + '\\.ide-insession' + sel + ' div\\.CodeMirror-selected[,{][^}]*?background:([^;}]+)').exec(out.css);
      for (const [sel, nm] of [['', 'unfocused'], ['\\.CodeMirror-focused', 'focused']]) {
        const m = sesRule(sel), val = m ? m[1].trim() : '', tv = /^var\(--([a-z0-9]+)\)$/.exec(val);
        const bgc = /^#[0-9a-fA-F]{6}$/.test(val) ? val.slice(1).toUpperCase() : tv ? th.PAGE[pg][tv[1]] : null;
        ok(!!bgc, cls + ' session selection rule (' + nm + ') found and readable: ' + val);
        if (bgc) for (const k of TXT) {
          const r = th.contrast(v[k], bgc);
          ok(r >= 4.5, cls + ' session selection (' + nm + ') ' + k + ' #' + v[k] + ' on ' + val + ' = ' + r.toFixed(2) + ' < 4.5');
        }
      }
    }
  }
  ok(th.contrast('6B7280', 'F3F4F6') < 4.5 && th.contrast('9A6700', 'F3F4F6') < 4.5, 'contrast math agrees the old light --ih/--iw were under 4.5');
  ok(Math.abs(th.contrast('000000', 'FFFFFF') - 21) < 0.01, 'contrast black/white = 21');
}

// 4. css sanity
{
  const o = (out.css.match(/\{/g) || []).length, c = (out.css.match(/\}/g) || []).length;
  ok(o === c && o > 50, 'css braces balanced (' + o + '/' + c + ')');
  for (const s of ['.cm-s-gem2', '.cm-s-idelight', '.ide-mark-error', '.ide-mark-inexact', '.ide-hover', '.CodeMirror-hints.gem2', '.CodeMirror-dialog', '.ide-cmp-del'])
    ok(out.css.indexOf(s) >= 0, 'css has ' + s);
  ok(!/height:\s*\d+px/.test(out.css.replace(/(?:width|height):8px/g, '')), 'css: no fixed pixel height');
}

// 5. modes in node through runmode.node.js (needs the CodeMirror 5 npm package; without it these checks are skipped, not
// failed, and the browser checks below still run)
const HAVE_PKG = fs.existsSync(path.join(PKG, 'addon/runmode/runmode.node.js'));
if (!HAVE_PKG) console.log('SKIP node mode checks: CodeMirror package not found at ' + PKG + ' (pass its folder as argument 1)');
if (HAVE_PKG) {
const CM = require(path.join(PKG, 'addon/runmode/runmode.node.js'));
if (!CM.Pos) CM.Pos = function (line, ch) { return { line, ch }; };
const helpers = {};
CM.registerHelper = function (type, name, fn) { helpers[type + ':' + name] = fn; };
require(path.join(PKG, 'addon/fold/brace-fold.js'));
const src = ['util.src.js', 'modes.src.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
const lib = vm.runInThisContext('(function(){' + src + '\nreturn { ideModes: ideModes, ideWordRange: ideWordRange, ideLineDiff: ideLineDiff };})()', { filename: 'modes.src.js' });
lib.ideModes(CM, { atoms: require('./theme.js').atoms() });

function styles(text, mode) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(() => []);
  CM.runMode(text, mode, function (tok, style, ln, start) {
    if (tok === '\n' || ln == null) return;
    for (let k = 0; k < tok.length; k++) lines[ln][start + k] = style || null;
  });
  return lines;
}
const fx = (f) => fs.readFileSync(path.join(__dirname, 'fx', f), 'utf8').replace(/\r\n/g, '\n');
function expectAt(name, text, map, line, sub, want, nth) {
  const L = text.split('\n')[line - 1];
  let idx = -1;
  for (let k = 0; k <= (nth || 0); k++) idx = L.indexOf(sub, idx + 1);
  if (idx < 0) { ok(false, name + ':' + line + ' substring ' + JSON.stringify(sub) + ' missing'); return; }
  for (let k = idx; k < idx + sub.length; k++) {
    const st = map[line - 1][k] || null;
    const good = want === null ? st === null : (st !== null && want.split(' ').every((w) => st.split(' ').indexOf(w) >= 0));
    if (!good) { ok(false, name + ':' + line + ' ' + JSON.stringify(sub) + ' want ' + want + ' got ' + st + ' at col ' + (k + 1)); return; }
  }
  ok(true);
}

const def = fx('a.def'), dm = styles(def, 'sdl');
const D = (line, sub, want, nth) => expectAt('a.def', def, dm, line, sub, want, nth);
D(1, '{', 'bracket'); D(1, 'weapon', 'keyword'); D(1, '"rifle"', 'string'); D(1, '; comment after code', 'comment');
D(2, 'damage', 'keyword'); D(2, '10', 'number'); D(2, '-5', 'number'); D(2, '0x1F', 'number'); D(2, '1.5', 'number'); D(2, 'on', 'atom');
D(3, '"semi;inside"', 'string'); D(3, 'off', 'atom'); D(3, '}', 'bracket');
D(4, '#tag', 'keyword'); D(4, '"a', 'string'); D(4, '\\"', 'string strsub'); D(4, '%count', 'variable-2');
D(5, '(', 'bracket'); D(5, 'include', 'meta'); D(5, '"base.inc"', 'string'); D(5, ')', 'bracket');
D(6, 'define', 'meta'); D(6, '1', 'number');
D(7, 'bad', 'keyword'); D(7, '"unterminated ; not a comment', 'error');
D(8, '}', 'bracket');
D(9, 'fold', 'keyword'); D(9, '"a{"', 'string'); D(9, '; {', 'comment');

const lng = fx('a.lng'), lm = styles(lng, 'lng');
const G = (line, sub, want) => expectAt('a.lng', lng, lm, line, sub, want);
G(1, 'text_hello', 'keyword'); G(1, '{b}', 'string strsub'); G(1, '%s', 'string strsub'); G(1, '{/b}', 'string strsub');
G(1, ' world', 'string'); G(1, '; tag', 'comment'); G(2, '\\"', 'string strsub'); G(2, 'text_esc', 'keyword');

const log = fx('game.log'), gm = styles(log, 'log');
const Lg = (line, sub, want) => expectAt('game.log', log, gm, line, sub, want);
Lg(1, '[00:00:14]', 'ldim'); Lg(1, 'Error', 'lerr'); Lg(1, '(/units/a.def, 188)', 'link lerr');
Lg(2, 'warning', 'lwarn'); Lg(2, 'file "set/b.set"', 'link lwarn'); Lg(2, 'line 12', 'link'); Lg(3, 'Phase', null);

// odd spaces: U+00A0, U+3000, U+FEFF never stall a mode (every token call advances) and are in specialChars
{
  const ODD = ['\u00a0', '\u3000', '\ufeff'];
  const shapes = (c) => [c, c + c, c + '{x 1}', '{name' + c + '"a' + c + 'b"}', '{a ' + c + '; c' + c, '"' + c, '"a\\' + c + '"',
    '(include' + c + '"x")', '%p' + c + '1', '{' + c + '}' + c, 'text' + c + '"{b}' + c + '{/b}"', '[00:00:01]' + c + 'Error' + c + '(a.def, 1)',
    '\t' + c + '\t', c + ';', '"\\'];
  let calls = 0, bad = null;
  for (const mname of ['sdl', 'lng', 'log', 'text']) {
    const mode = CM.getMode({ indentUnit: 4 }, mname);
    for (const c of ODD) {
      const state = mode.startState ? CM.startState(mode) : true;
      for (const L of shapes(c)) {
        const st = new CM.StringStream(L, 4);
        let guard = 0;
        while (!st.eol()) {
          const before = st.pos;
          mode.token(st, state);
          calls++;
          if (st.pos <= before) { bad = bad || (mname + ' stalls on ' + JSON.stringify(L) + ' at ' + before); break; }
          st.start = st.pos;
          if (++guard > L.length + 2) { bad = bad || (mname + ' loops on ' + JSON.stringify(L)); break; }
        }
      }
    }
  }
  ok(!bad, 'odd spaces: every token call advances (' + calls + ' calls)' + (bad ? ': ' + bad : ''));
  // the char sits inside a word / string / comment where it belongs
  const s1 = styles('{name\u00a0"a\u3000b" 1} ; c\ufeff', 'sdl')[0];
  ok(s1[5] === null && s1[8] === 'string' && s1[12] === 'number' && s1[18] === 'comment', 'odd spaces keep string / comment styles: ' + JSON.stringify(s1));
  const esrc = fs.readFileSync(path.join(__dirname, 'editor.src.js'), 'utf8');
  const m = /var SPECIAL = (\/\[[^\n]*\]\/);/.exec(esrc);
  const SPECIAL = m && vm.runInThisContext(m[1]);
  ok(SPECIAL && ODD.every((c) => SPECIAL.test(c)) && SPECIAL.test('\u200b') && SPECIAL.test('\t') && !SPECIAL.test(' ') && !SPECIAL.test('a') && !SPECIAL.test('\u0416'),
    'specialChars marks U+00A0, U+3000, U+FEFF (and keeps CodeMirror defaults, not plain text)');
}

// brace folding: fake editor over the mode's token styles (what foldgutter + brace-fold see in the browser)
{
  const lines = def.split('\n');
  const fakeCm = {
    getLine: (i) => lines[i], lastLine: () => lines.length - 1,
    getTokenTypeAt: (p) => { const ch = Math.max(0, p.ch - 1); return dm[p.line][ch] || null; },
  };
  const rf = helpers['fold:brace'];
  ok(typeof rf === 'function', 'brace-fold helper loaded');
  const r0 = rf(fakeCm, CM.Pos(0, 0)), r8 = rf(fakeCm, CM.Pos(8, 0)), r1 = rf(fakeCm, CM.Pos(1, 0));
  ok(r0 && r0.to.line === 11, 'fold line 1 to line 12 (got ' + JSON.stringify(r0) + ')');
  ok(r8 && r8.from.ch === 2 && r8.to.line === 10, 'fold line 9 skips braces in string and comment (got ' + JSON.stringify(r8) + ')');
  ok(r1 === null, 'one-line block does not fold');
}

// indent + electric brace + mode props
{
  const mode = CM.getMode({ indentUnit: 4 }, 'sdl');
  ok(mode.electricChars === '}' && mode.lineComment === ';' && mode.fold === 'brace', 'sdl mode props');
  const state = CM.startState(mode), lines = def.split('\n');
  const run = (upto) => {
    for (let i = 0; i < upto; i++) {
      const st = new CM.StringStream(lines[i], 4);
      if (!st.string && mode.blankLine) mode.blankLine(state);
      while (!st.eol()) { mode.token(st, state); st.start = st.pos; }
    }
  };
  run(9);
  ok(mode.indent(state, '{x 1}') === 8, 'indent inside two blocks = 8');
  const s2 = CM.startState(mode);
  for (let i = 0; i < 10; i++) { const st = new CM.StringStream(lines[i], 4); while (!st.eol()) { mode.token(st, s2); st.start = st.pos; } }
  ok(mode.indent(s2, '}') === 4, 'electric close brace dedents to 4');
}

// wordAt + diff helpers
{
  const W = lib.ideWordRange;
  const t = '\t{name "semi;inside" off} ; tail';
  let r = W(t, 3, true); ok(r && t.slice(r.from, r.to) === 'name' && !r.quoted, 'wordAt plain word');
  r = W(t, 10, true); ok(r && t.slice(r.from, r.to) === 'semi;inside' && r.quoted, 'wordAt quoted string body');
  r = W(t, 21, true); ok(r && t.slice(r.from, r.to) === 'off', 'wordAt after string');
  r = W('  ', 1, true); ok(r === null, 'wordAt on blanks = null');
  const D2 = lib.ideLineDiff;
  let d = D2(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']);
  ok(JSON.stringify(d.left) === '[1]' && JSON.stringify(d.right) === '[1,4]' && d.exact, 'diff LCS ' + JSON.stringify(d));
  d = D2(['a', 'b'], ['b']); ok(JSON.stringify(d.left) === '[0]' && d.right.length === 0, 'diff delete head');
  const big = []; for (let i = 0; i < 6000; i++) big.push('l' + i);
  const big2 = big.slice(); big2[0] = 'X'; big2[5999] = 'Y';
  d = D2(big, big2);
  ok(d.exact === false && d.left.indexOf(0) >= 0 && d.left.indexOf(5999) >= 0 && d.left.length === 2, 'diff >5000 lines falls back to position compare');
}
} // HAVE_PKG

// Edge can hand a headless run to a relaunched process whose stdout never reaches us, so --dump-dom prints nothing. Then
// the same page is opened with a DevTools port and #out is read over it (Node 22+: fetch and WebSocket built in). The
// browser is closed through DevTools at the end; returns the text between the @@ marks, or null.
async function viaDevTools(cp, EDGE, work, url) {
  if (typeof WebSocket !== 'function' || typeof fetch !== 'function') return null;
  const prof = path.join(work, 'profile-cdp');
  fs.rmSync(prof, { recursive: true, force: true });
  const p = cp.spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + prof, '--window-size=1280,900', '--allow-file-access-from-files', '--remote-debugging-port=0', url],
  { shell: false, windowsHide: true, stdio: 'ignore' });
  p.on('error', () => {});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now(), left = () => 90000 - (Date.now() - t0);
  const socket = (u) => new Promise((res, rej) => {
    const ws = new WebSocket(u), pend = {};
    let id = 0;
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend[j.id]) { pend[j.id](j); delete pend[j.id]; } };
    ws.onerror = () => rej(new Error('DevTools socket error'));
    ws.onopen = () => res({
      send: (method, params) => new Promise((r) => { const k = ++id; pend[k] = r; ws.send(JSON.stringify({ id: k, method, params: params || {} })); }),
      close: () => { try { ws.close(); } catch (e) { /* closed */ } },
    });
  });
  const json = async (u) => { try { return await (await fetch(u)).json(); } catch (e) { return null; } };
  let base = null, out = null;
  try {
    while (!base && left() > 0) {
      try { const port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); if (port) base = 'http://127.0.0.1:' + port; } catch (e) { /* not yet */ }
      if (!base) await wait(200);
    }
    let pg = null;
    while (base && !pg && left() > 0) {
      const list = await json(base + '/json/list');
      pg = list && list.find((x) => x.type === 'page' && /page\.html/.test(x.url));
      if (!pg) await wait(200);
    }
    if (!pg) return null;
    const s = await socket(pg.webSocketDebuggerUrl);
    while (!out && left() > 0) {
      const r = await s.send('Runtime.evaluate', { expression: 'document.getElementById("out") ? document.getElementById("out").textContent : ""', returnByValue: true });
      const t = r && r.result && r.result.result ? String(r.result.result.value || '') : '';
      const m = /@@(.*)@@/.exec(t);
      if (m) out = m[1]; else await wait(250);
    }
    s.close();
  } finally {
    const v = base ? await json(base + '/json/version') : null;
    if (v && v.webSocketDebuggerUrl) {
      try { const b = await socket(v.webSocketDebuggerUrl); b.send('Browser.close'); await wait(500); b.close(); } catch (e) { /* gone */ }
    }
    try { p.kill(); } catch (e) { /* gone */ }
  }
  return out;
}
let BROWSER = null;

// browser: real CodeMirror in headless Edge (Tab mode, phrases in dialogs, swap flush, dropEol, odd-space marks, 2 MB
// timing, compare layout, the kit calls). Skipped (not failed) when Edge is not installed. Scratch: argv[3] or <ARSENAL_TMP or os temp>/ide/cmfix.
{
  const cp = require('child_process');
  const EDGE = require('../../../browser').find({ want: 'edge' });
  if (!EDGE) console.log('SKIP browser checks: Edge not found (env ARSENAL_BROWSER sets it)');
  else {
    const work = path.resolve(process.argv[3] || path.join(TMPROOT, 'ide', 'cmfix'));
    fs.mkdirSync(work, { recursive: true });
    const bundle = require('../../../vendor/cm5/cm5.bundle.json');
    fs.writeFileSync(path.join(work, 'cm.js'), bundle.js);
    fs.writeFileSync(path.join(work, 'cm.css'), bundle.css);
    fs.writeFileSync(path.join(work, 'ide.js'), out.js);
    fs.writeFileSync(path.join(work, 'ide.css'), out.css);
    fs.copyFileSync(path.join(__dirname, 'fx', 'browser.js'), path.join(work, 'browser.js'));
    // the page's colour tokens (read from tools/gui/page.js) + what the theme checks expect, so the Editor is seen on real tokens
    const th = require('./theme.js');
    const tok = th.parseTokens(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'page.js'), 'utf8'));
    const rgb = (h) => { const x = parseInt(h, 16); return 'rgb(' + ((x >> 16) & 255) + ', ' + ((x >> 8) & 255) + ', ' + (x & 255) + ')'; };
    const expect = { light: { bg: rgb(tok.light.in), key: rgb(th.themeVars('light').key), gutter: rgb(tok.light.th) },
      dark: { bg: rgb(tok.dark.in), key: rgb(th.themeVars('dark').key), gutter: rgb(tok.dark.th) } };
    fs.writeFileSync(path.join(work, 'expect.js'), 'window.IDE_EXPECT = ' + JSON.stringify(expect) + ';\n');
    fs.writeFileSync(path.join(work, 'page.html'), '<!doctype html><html><head><meta charset="utf-8"><style>' + tok.css + '</style><link rel="stylesheet" href="cm.css"><link rel="stylesheet" href="ide.css"><script src="expect.js"></script></head>' +
      '<body style="margin:0"><script src="cm.js"></script><script src="ide.js"></script><script src="browser.js"></script></body></html>');
    const prof = path.join(work, 'profile');
    const r = cp.spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--user-data-dir=' + prof, '--window-size=1280,900', '--allow-file-access-from-files', '--dump-dom',
      'file:///' + path.join(work, 'page.html').replace(/\\/g, '/')], { encoding: 'utf8', timeout: 90000, shell: false, windowsHide: true });
    const m = /@@(.*)@@/.exec(String(r.stdout || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    const report = (text) => {
      const res = JSON.parse(text);
      for (const [good, msg] of res.results) ok(good, 'browser: ' + msg);
      console.log('browser: ' + res.results.length + ' checks; 2 MB perf ' + JSON.stringify(res.perf));
    };
    if (m) report(m[1]);
    else {
      BROWSER = viaDevTools(cp, EDGE, work, require('url').pathToFileURL(path.join(work, 'page.html')).href).then((t) => {
        if (!t) { ok(false, 'browser checks produced no result (status ' + r.status + ') ' + String(r.stderr || r.error || '').slice(0, 400)); return; }
        console.log('browser: --dump-dom printed nothing; page read over the DevTools port');
        report(t);
      });
    }
  }
}

Promise.resolve(BROWSER).catch((e) => ok(false, 'browser checks: ' + (e && e.stack || e))).then(() => {
  console.log(oks + ' ok, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  process.exitCode = fails ? 1 : 0;
});
