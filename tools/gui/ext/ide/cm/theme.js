// ide cm theme: CSS for the editor. Two kinds of colour only:
// - surfaces (text background, gutter, selection, active line, dialogs, hint list, hover card, compare chrome) are the page's
//   own tokens, var(--in) var(--fg) var(--th) ... from tools/gui/page.js, so the Editor flips with the header switch by CSS alone;
// - syntax colours are two tuned palettes chosen by the effective page theme: dark = GEM2 hues (tools/ide/palette.js) on the
//   page's dark surfaces (.cm-s-gem2), light = palette.light on the page's light surfaces (.cm-s-idelight).
// PAGE below is a copy of the page token values, used only to tune palette colours to 4.5:1; theme.test.js checks it against
// page.js so a token change there shows up as a failing test, not as unreadable text. Also the atom words for the sdl mode.
// Author: Imperator_Aug (ARSENAL, ia-27e08ede)
'use strict';
const pal = require('../../../../ide/palette.js');

const hex = (h) => '#' + h;
const rgba = (h, a) => {
  const n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};

// Consolas first; Cyrillic is in Consolas; CJK falls to monospaced CJK faces (NSimSun / MS Gothic are full width).
const FONT = "Consolas, 'Cascadia Mono', 'Lucida Console', 'NSimSun', 'SimSun', 'MS Gothic', 'Microsoft YaHei UI', monospace";

// the page tokens the Editor draws with (values copied from tools/gui/page.js :root blocks; checked by theme.test.js)
const PAGE = {
  light: { bg: 'F4F5F7', fg: '1C1F24', card: 'FFFFFF', line: 'D5D8DE', line2: 'E6E8EC', th: 'EEF0F3', in: 'FFFFFF', inl: 'B9BEC7', hint: '666666',
    sel: 'D9E6FB', hov: 'EEF3FB', acc: '2C6FD1', err: 'B3382C', ok: '1D7A3B', hbox: 'FFF4F2', who: 'FFFBE6', whol: 'E8D38A', chip: 'E9EBEF', badge: 'E1E4EA', qp: 'EEF4FF', ban: 'F3F6FB', pre: 'F1F2F5' },
  dark: { bg: '16181C', fg: 'DDE1E7', card: '1F2328', line: '3A4049', line2: '2C3138', th: '262B31', in: '15181C', inl: '4A515D', hint: '9AA3AD',
    sel: '24406B', hov: '252C37', acc: '4B8EF0', err: 'FF8A7A', ok: '5FD08A', hbox: '33201D', who: '2B2716', whol: '6B5D26', chip: '2F353F', badge: '2F353F', qp: '1A2638', ban: '1C2533', pre: '1A1D22' },
};
// editor surface role -> page token
// sessSel: the selection while a Code Pieces field session runs. Each field gets focus selected, so its value is drawn on
// it; the page --sel is under 4.5:1 for some syntax colours (gem2 string 4.13), the page's pale blue --qp is not
const SURF = { bg: 'in', currentLine: 'hov', selection: 'sel', gutterBg: 'th', gutterFg: 'hint', foldBg: 'th', foldFg: 'hint', caret: 'fg',
  fg: 'fg', card: 'card', panel: 'th', cardDim: 'hint', cardBorder: 'line', acc: 'acc', sessSel: 'qp' };

// ---- WCAG 2 contrast ----
const lum = (h) => {
  const n = parseInt(h, 16);
  const ch = (s) => { const c = ((n >> s) & 255) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0);
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (h, to, t) => {
  const a = parseInt(h, 16), b = parseInt(to, 16);
  const c = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1).toUpperCase();
};
// move `fg` toward white (on dark backgrounds) or black (on light ones) in 1% steps until it reaches `min` on every bg
const ensure = (fg, bgs, min) => {
  const ok = (c) => bgs.every((b) => contrast(c, b) >= min);
  if (ok(fg)) return fg;
  const dark = bgs.reduce((s, b) => s + lum(b), 0) / bgs.length < 0.18;
  for (let t = 0.01; t <= 1.0001; t += 0.01) { const c = mix(fg, dark ? 'FFFFFF' : '000000', t); if (ok(c)) return c; }
  return fg;
};
// [colour key, [background keys], minimum ratio]. 4.5 = text (12 px); 3.0 = wavy marks, dots, icons.
// Palette colours are moved until they pass; page-token pairs (fg, gutterFg, cardDim, foldFg) are only measured.
const TOKENS = ['key', 'type', 'number', 'string', 'operator', 'preproc', 'error', 'warn', 'brace'];
const CHECKS = [].concat(
  TOKENS.map((k) => [k, ['bg', 'currentLine', 'sessSel'], 4.5]),
  [
    ['comment', ['bg', 'currentLine', 'sessSel'], 4.5],
    ['fg', ['bg', 'currentLine', 'card', 'panel', 'gutterBg', 'selection', 'sessSel'], 4.5],
    ['gutterFg', ['gutterBg', 'bg', 'currentLine'], 4.5],
    ['badBraceFg', ['badBraceBg'], 4.5],
    ['cardDim', ['card', 'panel'], 4.5],
    ['key', ['card', 'panel'], 4.5],
    ['foldFg', ['foldBg'], 3.0],
    ['error', ['bg', 'currentLine', 'gutterBg'], 3.0],
    ['warn', ['bg', 'currentLine', 'gutterBg'], 3.0],
    ['info', ['bg', 'currentLine', 'gutterBg'], 3.0],
  ]
);
const fixVars = (v) => {
  for (const [f, bs, min] of CHECKS) {
    if (SURF[f]) continue; // a page token: measured by the test, never changed here
    if (f === 'badBraceFg') { v.badBraceBg = ensure(v.badBraceBg, [v.badBraceFg], min); continue; }
    v[f] = ensure(v[f], bs.map((b) => v[b]), min);
  }
  return v;
};

// the two syntax palettes (hex, no '#'); everything else is a page token
const SYNTAX = {
  dark: { key: pal.key, type: pal.type, number: pal.number, string: pal.string, operator: pal.operator, preproc: pal.preproc,
    comment: pal.comment, brace: pal.brace, badBraceFg: pal.badBraceFg, badBraceBg: pal.badBraceBg, smart: pal.smart,
    error: pal.error, warn: pal.warn, info: pal.info },
  light: { key: pal.light.key, type: pal.light.type, number: pal.light.number, string: pal.light.string, operator: pal.light.operator,
    preproc: pal.light.preproc, comment: pal.light.comment, brace: pal.light.brace, badBraceFg: 'FFFFFF', badBraceBg: pal.light.error,
    smart: pal.light.brace, error: pal.light.error, warn: pal.light.warn, info: pal.light.info },
};
const effName = (name) => (name === 'light' || name === 'idelight' ? 'light' : 'dark');

// resolved values for one theme: page token values for the surface roles + the tuned palette
function themeVars(name) {
  const t = effName(name), P = PAGE[t], v = Object.assign({}, SYNTAX[t]);
  for (const k of Object.keys(SURF)) v[k] = P[SURF[k]];
  return fixVars(v);
}

// shell (tools/gui/ext/ide/ui/core.js): --i* map to page tokens; --iw (warning text) is the only palette entry
const SHELL_MAP = { ib: 'in', ip: 'th', il: 'line', it: 'fg', ih: 'hint', ia: 'sel', ie: 'err', ik: 'ok' };
function shellVars(name) {
  const t = effName(name), P = PAGE[t], s = {};
  for (const k of Object.keys(SHELL_MAP)) s[k] = P[SHELL_MAP[k]];
  s.iw = ensure(themeVars(t).warn, [P.th, P.in, P.card, P.bg], 4.5);
  return s;
}
const SHELL_CHECKS = [['it', 4.5], ['ih', 4.5], ['iw', 4.5], ['ie', 4.5], ['ik', 4.5]];
const SHELL = { gem2: shellVars('dark'), light: shellVars('light') };
// CSS for the shell: tokens on .ide-shell, warning colour per theme (.ide-dark is set by the shell from IDE_THEME)
function shellCss() {
  const tok = Object.keys(SHELL_MAP).map((k) => '--' + k + ':var(--' + SHELL_MAP[k] + ')').join(';');
  return '.ide-shell{' + tok + ';--iw:' + hex(SHELL.light.iw) + '}\n.ide-shell.ide-dark{--iw:' + hex(SHELL.gem2.iw) + '}';
}

// css value for a role: page token for surfaces, tuned hex for palette entries
const col = (v, k) => (SURF[k] ? 'var(--' + SURF[k] + ')' : hex(v[k]));

function themeCss(cls, v, keyBold, cardCls, cvCls) {
  const s = '.cm-s-' + cls;
  const c = (k) => col(v, k);
  const r = [];
  // surfaces (page tokens)
  r.push(s + '.CodeMirror{background:' + c('bg') + ';color:' + c('fg') + '}');
  r.push(s + ' div.CodeMirror-selected,' + s + '.CodeMirror-focused div.CodeMirror-selected{background:' + c('selection') + '}');
  r.push(s + ' .CodeMirror-line:\x3aselection,' + s + ' .CodeMirror-line>span:\x3aselection,' + s + ' .CodeMirror-line>span>span:\x3aselection{background:' + c('selection') + '}');
  // in a field session (.ide-insession on the wrapper) the selection is the active field's value: sessSel keeps 4.5:1
  r.push(s + '.ide-insession div.CodeMirror-selected,' + s + '.ide-insession.CodeMirror-focused div.CodeMirror-selected{background:' + c('sessSel') + '}');
  r.push(s + ' .CodeMirror-activeline-background{background:' + c('currentLine') + '}');
  r.push(s + ' .CodeMirror-gutters{background:' + c('gutterBg') + ';border-right:1px solid var(--line2)}');
  r.push(s + ' .CodeMirror-scrollbar-filler,' + s + ' .CodeMirror-gutter-filler{background:' + c('gutterBg') + '}');
  r.push(s + ' .CodeMirror-linenumber,' + s + ' .CodeMirror-guttermarker-subtle{color:' + c('gutterFg') + '}');
  r.push(s + ' .CodeMirror-guttermarker{color:' + c('fg') + '}');
  r.push(s + ' .CodeMirror-gutter.CodeMirror-foldgutter{background:' + c('foldBg') + '}');
  r.push(s + ' .CodeMirror-foldgutter-open,' + s + ' .CodeMirror-foldgutter-folded{color:' + c('foldFg') + '}');
  r.push(s + ' .CodeMirror-foldmarker{color:' + c('fg') + ';background:' + c('foldBg') + ';text-shadow:none;font-family:inherit;border-radius:2px;padding:0 3px}');
  r.push(s + ' .CodeMirror-cursor{border-left:2px solid ' + c('caret') + '}');
  r.push(s + ' div.CodeMirror-secondarycursor{border-left:1px solid ' + c('gutterFg') + '}');
  r.push(s + '.cm-fat-cursor .CodeMirror-cursor{background:' + c('gutterFg') + '}');
  r.push(s + ' .CodeMirror-ruler{border-left:1px solid var(--line)}');
  r.push(s + ' span.cm-variable,' + s + ' span.cm-def,' + s + ' span.cm-variable-3,' + s + ' span.cm-property{color:' + c('fg') + '}');
  r.push(s + ' span.cm-ldim{color:' + c('gutterFg') + '}');
  // syntax (palette)
  r.push(s + '.CodeMirror span.CodeMirror-matchingbracket{color:' + c('brace') + ';font-weight:bold;outline:1px solid ' + rgba(v.brace, 0.6) + '}');
  r.push(s + '.CodeMirror span.CodeMirror-nonmatchingbracket{color:' + c('badBraceFg') + ';background:' + c('badBraceBg') + '}');
  r.push(s + ' .cm-matchhighlight{background:' + rgba(v.smart, 0.28) + '}');
  r.push(s + ' .cm-searching{background:' + rgba(v.warn, 0.35) + '}');
  r.push(s + ' span.cm-keyword{color:' + c('key') + (keyBold ? ';font-weight:bold' : '') + '}');
  r.push(s + ' span.cm-atom,' + s + ' span.cm-builtin{color:' + c('type') + '}');
  r.push(s + ' span.cm-number{color:' + c('number') + '}');
  r.push(s + ' span.cm-string{color:' + c('string') + '}');
  r.push(s + ' span.cm-string.cm-strsub{color:' + c('preproc') + '}');
  r.push(s + ' span.cm-comment{color:' + c('comment') + ';background:none}');
  r.push(s + ' span.cm-meta,' + s + ' span.cm-variable-2{color:' + c('preproc') + '}');
  r.push(s + ' span.cm-bracket,' + s + ' span.cm-operator{color:' + c('operator') + '}');
  r.push(s + ' span.cm-error,' + s + ' .cm-invalidchar,' + s + ' span.cm-negative{color:' + c('error') + ';background:none}');
  r.push(s + ' span.cm-positive{color:' + c('key') + '}');
  r.push(s + ' span.cm-lerr{color:' + c('error') + '}');
  r.push(s + ' span.cm-lwarn{color:' + c('warn') + '}');
  r.push(s + ' span.cm-link{color:' + c('type') + ';text-decoration:underline}');
  for (const k of ['error', 'warn', 'info']) {
    r.push(s + ' .ide-mark-' + k + '{text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:' + c(k) + '}');
    r.push(s + ' .ide-dot-' + k + '{background:' + c(k) + '}');
  }
  r.push(s + ' .ide-mark.ide-mark-inexact{text-decoration-style:dashed}');
  r.push(s + ' .ide-ctrl-link{text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:' + c('type') + ';color:' + c('type') + '}');
  r.push(s + ' .ide-odd{background:' + rgba(v.warn, 0.16) + ';outline:1px dotted ' + rgba(v.warn, 0.7) + ';outline-offset:-1px}');
  r.push(s + ' .ide-cmp-del{background:' + rgba(v.error, cls === 'idelight' ? 0.12 : 0.2) + '}');
  r.push(s + ' .ide-cmp-add{background:' + rgba(v.key, cls === 'idelight' ? 0.14 : 0.2) + '}');
  // Code Pieces (kit): field session marks and bar, gap marker, flash after an insert
  // fields: underlined in the palette's type colour, the active one in the page accent. No background tint under the
  // text: the palette sits just above 4.5:1 on the active line, so any tint would push syntax text under it (selfcheck
  // measures every background these three classes get against every syntax colour)
  r.push(s + ' .ide-field{box-shadow:inset 0 -1px 0 ' + c('type') + '}');
  r.push(s + ' .ide-field-on{box-shadow:inset 0 -2px 0 ' + c('acc') + '}');
  r.push(s + ' .ide-field-bad{text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:' + c('error') + '}');
  r.push(s + ' .ide-gap-ok{border-top-color:' + c('acc') + '}');
  r.push(s + ' .ide-gap-no{border-top-color:' + c('error') + '}');
  // flash after an insert: a bar at the left of each inserted line (no tint under the text, as for fields)
  r.push(s + ' .ide-flash{box-shadow:inset 4px 0 0 ' + c('key') + '}');
  r.push(s + ' .ide-fbar{background:' + c('card') + ';color:' + c('fg') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .ide-fbar-n,' + s + ' .ide-fbar-h,' + s + ' .ide-fbar-more{color:' + c('cardDim') + '}');
  r.push(s + ' .ide-fbar-word{background:' + c('panel') + ';color:' + c('fg') + '}');
  r.push(s + ' .ide-fbar-word:hover{outline:1px solid ' + c('acc') + '}');
  r.push(s + ' .ide-fbar-msg{color:var(--err)}');
  r.push(s + ' .ide-fbar.ide-fbar-deny{border-color:var(--err)}');
  r.push(s + ' .ide-fbar-b{color:' + c('fg') + ';background:' + c('panel') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .ide-fbar-b:hover,' + s + ' .ide-fbar-done{border-color:' + c('acc') + '}');
  // find / replace bar (editor.src.js findBar; page tokens); the current match: the match tint plus an accent ring
  r.push(s + ' .ide-find{background:' + c('panel') + ';color:' + c('fg') + ';border:1px solid ' + c('cardBorder') + ';border-top:0;box-shadow:0 3px 10px rgba(0,0,0,.3)}');
  r.push(s + ' .ide-find-q{color:' + c('fg') + ';background:' + c('bg') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .ide-find-q:focus{border-color:' + c('acc') + ';outline:none}');
  r.push(s + ' .ide-find-q.ide-find-bad{border-color:var(--err)}');
  r.push(s + ' .ide-find-b{color:' + c('fg') + ';background:' + c('gutterBg') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .ide-find-b:hover,' + s + ' .ide-find-b:focus,' + s + ' .ide-find-b[aria-pressed=true]{border-color:' + c('acc') + '}');
  r.push(s + ' .ide-find-b[aria-pressed=true]{box-shadow:inset 0 -2px 0 ' + c('acc') + '}');
  r.push(s + ' .ide-find-n{color:' + c('cardDim') + '}');
  r.push(s + ' .ide-find-cur{background:' + rgba(v.warn, 0.35) + ';box-shadow:0 0 0 1px ' + c('acc') + '}');
  // search / jump dialog (page tokens)
  r.push(s + ' .CodeMirror-dialog{background:' + c('panel') + ';color:' + c('fg') + ';font-family:' + FONT + '}');
  r.push(s + ' .CodeMirror-dialog-top{border-bottom:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .CodeMirror-dialog-bottom{border-top:1px solid ' + c('cardBorder') + '}');
  r.push(s + ' .CodeMirror-dialog input{color:' + c('fg') + ';background:' + c('bg') + ';border:1px solid ' + c('cardBorder') + ';padding:1px 4px;font-family:inherit;font-size:inherit}');
  r.push(s + ' .CodeMirror-dialog input:focus{border-color:' + c('acc') + '}');
  // the addon writes style="color:#666|#888" inline; !important keeps the hint readable in both themes
  r.push(s + ' .CodeMirror-search-hint{color:' + c('cardDim') + ' !important}');
  r.push(s + ' .CodeMirror-dialog button{color:' + c('fg') + ';background:' + c('gutterBg') + ';border:1px solid ' + c('cardBorder') + ';border-radius:2px}');
  // hint popup (show-hint puts the theme name on the list: class "CodeMirror-hints <theme>")
  const hs = '.CodeMirror-hints.' + cls;
  r.push(hs + '{background:' + c('card') + ';border:1px solid ' + c('cardBorder') + ';box-shadow:0 4px 14px rgba(0,0,0,.35);font-family:' + FONT + ';font-size:10pt;z-index:1000;max-height:18em}');
  r.push(hs + ' li.CodeMirror-hint{color:' + c('fg') + ';padding:1px 6px}');
  r.push(hs + ' li.CodeMirror-hint-active{background:' + c('selection') + ';color:' + c('fg') + '}');
  r.push(hs + ' .ide-hint-sub{color:' + c('cardDim') + ';margin-left:1.2em;font-size:90%}');
  // hover card (on body: class ide-hover-light | ide-hover-dark picks the palette)
  const cs = '.ide-hover' + cardCls;
  r.push(cs + '{background:' + c('card') + ';color:' + c('fg') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(cs + ' .ide-hover-l,' + cs + ' .ide-hover-k{color:' + c('cardDim') + '}');
  r.push(cs + ' .ide-hover-t{color:' + c('key') + '}');
  r.push(cs + ' .ide-hover-a{color:' + c('fg') + ';background:' + c('panel') + ';border:1px solid ' + c('cardBorder') + '}');
  r.push(cs + ' .ide-hover-a:hover,' + cs + ' .ide-hover-a:focus{border-color:' + c('acc') + ';outline:none}');
  r.push(cs + ' .ide-hover-fix{border-color:' + c('key') + '}');
  // compare view chrome
  const vs = cvCls;
  r.push(vs + '{background:' + c('bg') + ';color:' + c('fg') + '}');
  r.push(vs + ' .ide-cv-sum{background:' + c('panel') + ';color:' + c('fg') + '}');
  r.push(vs + ' .ide-cv-title{background:' + c('gutterBg') + ';color:' + c('fg') + '}');
  r.push(vs + ' .ide-cv-mark{color:' + c('fg') + '}');
  return r.join('\n');
}

const BASE = [
  // the editor fills its host (a flex child); never a fixed pixel height
  '.ide-cm-host{position:relative;min-width:0;min-height:0;overflow:hidden}',
  '.ide-cm-host>.CodeMirror{position:absolute;top:0;left:0;right:0;bottom:0;height:auto}',
  '.CodeMirror.ide-cm{font-family:' + FONT + ';font-size:11pt;line-height:1.35;font-variant-ligatures:none;-webkit-font-feature-settings:"liga" 0;font-feature-settings:"liga" 0}',
  '.CodeMirror.ide-cm.ide-ctrl .CodeMirror-lines{cursor:pointer}',
  '.CodeMirror.ide-cm .CodeMirror-dialog input{width:24em}',
  '.ide-find{position:absolute;top:0;right:14px;z-index:9;display:flex;flex-direction:column;gap:3px;padding:4px 6px;border-radius:0 0 4px 4px;max-width:calc(100% - 28px);box-sizing:border-box;font:12px/1.3 system-ui,"Segoe UI",sans-serif}',
  '.ide-find[hidden],.ide-find-rr[hidden]{display:none}',
  '.ide-find-r{display:flex;align-items:center;gap:3px;flex-wrap:wrap}',
  '.ide-find-q{width:16em;min-width:6em;padding:2px 5px;font:inherit;box-sizing:border-box}',
  '.ide-find .sk{flex:1 1 auto;min-width:10em}', '.ide-find .sk>.ide-find-q{width:auto;flex:1 1 auto}',
  '.ide-find-b{font:inherit;padding:1px 6px;min-width:1.9em;cursor:pointer;border-radius:3px}',
  '.ide-find-n{min-width:6em;padding:0 4px;white-space:nowrap}',
  '.CodeMirror-gutter.ide-marks{width:12px}',
  '.ide-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 2px;vertical-align:middle;cursor:default}',
  '.ide-sr{position:absolute;left:-10000px;top:auto;width:1px;overflow:hidden;white-space:nowrap}',
  '.ide-odd{border-radius:2px}',
  '.ide-mark{text-decoration-thickness:1px;text-decoration-skip-ink:none;text-underline-offset:3px}',
  '.ide-hover{position:fixed;z-index:1001;max-width:min(520px,90vw);max-height:60vh;overflow:auto;box-sizing:border-box;padding:6px 9px;border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.4);font:12px/1.45 system-ui,"Segoe UI",sans-serif;word-wrap:break-word;overflow-wrap:anywhere}',
  '.ide-hover-t{font-weight:600;font-family:' + FONT + ';margin-bottom:2px}',
  '.ide-hover-l{margin-bottom:4px}',
  '.ide-hover-rows{display:table;border-spacing:0 1px}',
  '.ide-hover-r{display:table-row}',
  '.ide-hover-k{display:table-cell;padding-right:10px;white-space:nowrap}',
  '.ide-hover-v{display:table-cell;font-family:' + FONT + '}',
  '.ide-hover-acts{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}',
  '.ide-hover-a{font:inherit;padding:2px 8px;border-radius:3px;cursor:pointer}',
  // compare view (ide-cv: the shell owns .ide-cmp for its overlay box). Two equal columns; stacked when narrow (JS class).
  '.ide-cmp-host{position:relative;min-width:0;min-height:0;overflow:hidden}',
  '.ide-cmp-host>.ide-cv{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column}',
  '.ide-cv-sum{flex:0 0 auto;padding:3px 8px;font:12px system-ui,"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ide-cv>.ide-cv-row{flex:1 1 auto;min-height:0;display:flex;flex-direction:row}',
  '.ide-cv.ide-cv-narrow>.ide-cv-row{flex-direction:column}',
  '.ide-cv-row>.ide-cv-pane{flex:1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column}',
  '.ide-cv-row>.ide-cv-pane+.ide-cv-pane{border-left:1px solid var(--line)}',
  '.ide-cv-narrow>.ide-cv-row>.ide-cv-pane+.ide-cv-pane{border-left:0;border-top:1px solid var(--line)}',
  '.ide-cv-title{flex:0 0 auto;padding:3px 8px;font:12px system-ui,"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ide-cv-body{flex:1 1 auto;position:relative;min-height:0}',
  '.ide-cv-body>.CodeMirror{position:absolute;top:0;left:0;right:0;bottom:0;height:auto}',
  '.CodeMirror-gutter.ide-cv-sign{width:14px}',
  // Code Pieces (kit): gap marker (absolute in the sizer, no line height change), field bar (cm.addWidget, never focused)
  '.ide-gap{position:absolute;height:0;border-top:2px solid;margin-top:-1px;pointer-events:none;z-index:2}',
  '.ide-gap.ide-gap-no{border-top-style:dashed}',
  '.ide-fbar{z-index:5;box-sizing:border-box;max-width:min(460px,90%);padding:4px 8px;margin-top:2px;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.35);font:12px/1.4 system-ui,"Segoe UI",sans-serif;white-space:normal;cursor:default;-webkit-user-select:none;user-select:none}',
  // an empty field: a widget at its place (an empty mark draws nothing), as wide as one character so its underline shows
  '.ide-field-empty{display:inline-block;width:1ch;height:1.1em;vertical-align:text-bottom}',
  '.ide-fbar-top{display:flex;gap:6px;align-items:baseline}',
  '.ide-fbar-l{font-weight:600}',
  '.ide-fbar-w{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;font-family:' + FONT + '}',
  '.ide-fbar-word{padding:0 4px;border-radius:2px;cursor:pointer}',
  '.ide-fbar-msg{margin-top:3px}',
  '.ide-fbar-acts{display:flex;gap:4px;margin-top:4px;justify-content:flex-end}',
  '.ide-fbar-b{font:inherit;padding:1px 8px;border-radius:3px;cursor:pointer}',
  '.ide-cv-mark{display:block;text-align:center;font-weight:bold}',
].join('\n');

function css() {
  return [
    '/* ide editor theme: surfaces = page tokens, syntax = tools/ide/palette.js tuned per page theme */',
    BASE,
    themeCss('gem2', themeVars('dark'), pal.keyBold, '.ide-hover-dark', '.ide-cv'),
    themeCss('idelight', themeVars('light'), pal.keyBold, '.ide-hover-light', '.ide-cv.ide-cv-light'),
  ].join('\n') + '\n';
}

// test helper: the light and dark token maps from the text of tools/gui/page.js (first :root{...} and :root[data-theme=dark]{...})
function parseTokens(text) {
  const grab = (re) => {
    const m = re.exec(text), o = {};
    if (!m) return null;
    for (const d of m[1].matchAll(/--([a-z0-9]+):\s*#([0-9a-fA-F]{3,6})\b/g)) {
      let h = d[2].toUpperCase();
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      o[d[1]] = h;
    }
    return o;
  };
  return { light: grab(/:root\{([^}]*)\}/), dark: grab(/:root\[data-theme=dark\]\{([^}]*)\}/), css: (/(:root\{[^}]*\}[\s\S]*?:root\[data-theme=dark\]\{[^}]*\})/.exec(text) || [])[1] || '' };
}

function atoms() {
  const out = ['on', 'off', 'true', 'false'];
  for (const w of [].concat(pal.themeWords1 || [], pal.themeWords2 || [])) if (out.indexOf(w) < 0) out.push(w);
  return out;
}

module.exports = { css, atoms, FONT, themeVars, contrast, CHECKS, SHELL, SHELL_CHECKS, SHELL_MAP, shellVars, shellCss, PAGE, SURF, SYNTAX, parseTokens };
