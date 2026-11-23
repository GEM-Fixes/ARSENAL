// ide theme test: the Editor follows the page theme (header switch light / dark / auto). Checks:
// 1. effective theme: data-theme attribute wins, else prefers-color-scheme; safe without matchMedia / MutationObserver
// 2. live switch: one re-theme call per real change (attribute flip, system flip in auto), none for no-ops
// 3. the shell wires it (IDE_THEME.watch, no own switch, no saved preference read); the cm layer re-themes every live view
// 4. no fixed surface or text colours in the client strings: only the two syntax palettes (+ neutral shadows) are hex
// 5. contrast: main token colours on the page surfaces, both themes, printed (text >= 4.5, comments >= 4.5, marks >= 3)
// 6. the page token copy in cm/theme.js equals tools/gui/page.js
// Arg: scratch dir (unused). Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-f26c6a8e)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXT = path.join(ROOT, 'tools', 'gui', 'ext', 'ide');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };

const THEME = require(path.join(EXT, 'ui', 'theme.js'));
const TH = require(path.join(EXT, 'cm', 'theme.js'));

// ---- fake DOM bits
function fakeEnv(o) {
  o = o || {};
  const attrs = {};
  if (o.attr) attrs['data-theme'] = o.attr;
  const root = o.noAttr ? {} : { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
  const mq = { matches: !!o.dark, ls: [] };
  if (o.legacy) { mq.addListener = (f) => mq.ls.push(f); mq.removeListener = (f) => { mq.ls = mq.ls.filter((x) => x !== f); }; }
  else { mq.addEventListener = (t, f) => { if (t === 'change') mq.ls.push(f); }; mq.removeEventListener = (t, f) => { mq.ls = mq.ls.filter((x) => x !== f); }; }
  const mos = [];
  const win = { console };
  if (!o.noMedia) win.matchMedia = (q) => { mq.q = q; return mq; };
  if (!o.noMO) {
    win.MutationObserver = function (cb) { this.cb = cb; this.on = false; mos.push(this); };
    win.MutationObserver.prototype.observe = function (el, opt) { this.el = el; this.opt = opt; this.on = true; };
    win.MutationObserver.prototype.disconnect = function () { this.on = false; };
  }
  const doc = { documentElement: root };
  win.document = doc;
  const sb = { window: win, document: doc, console };
  vm.runInNewContext(THEME.script, sb);
  return {
    T: win.IDE_THEME, mq, mos, win,
    set(v) { if (v == null) delete attrs['data-theme']; else attrs['data-theme'] = v; mos.forEach((m) => { if (m.on) m.cb([{ type: 'attributes', attributeName: 'data-theme' }]); }); },
    sys(dark) { mq.matches = dark; mq.ls.slice().forEach((f) => f({ matches: dark })); },
  };
}

// 1. resolution
{
  ok(fakeEnv({ attr: 'light', dark: true }).T.now() === 'light', 'attribute light wins over a dark system');
  ok(fakeEnv({ attr: 'dark', dark: false }).T.now() === 'dark', 'attribute dark wins over a light system');
  ok(fakeEnv({ dark: true }).T.now() === 'dark', 'no attribute + system dark = dark');
  ok(fakeEnv({ dark: false }).T.now() === 'light', 'no attribute + system light = light');
  ok(fakeEnv({ attr: 'auto', dark: true }).T.now() === 'dark', 'unknown attribute value falls to the system');
  const e = fakeEnv({ dark: true });
  e.T.now();
  ok(e.mq.q === '(prefers-color-scheme: dark)', 'media query text: ' + e.mq.q);
  const bare = fakeEnv({ noMedia: true, noMO: true, noAttr: true });
  ok(bare.T.now() === 'light', 'fake DOM without matchMedia / getAttribute: light, no throw');
  let w = null, threw = null;
  try { w = bare.T.watch(() => {}); w.stop(); } catch (x) { threw = x; }
  ok(!threw && w && w.theme() === 'light', 'watch() without MutationObserver / matchMedia does not throw');
  console.log('resolution: light+dark-sys=light, dark+light-sys=dark, none+dark=dark, none+light=light');
}

// 2. live switch
{
  const e = fakeEnv({ dark: false });
  const calls = [];
  const w = e.T.watch((t) => calls.push(t));
  ok(e.mos.length === 1 && e.mos[0].on && e.mos[0].opt.attributes && e.mos[0].opt.attributeFilter.join() === 'data-theme', 'observer on the html attributes (data-theme only)');
  ok(e.mq.ls.length === 1, 'media change listener added');
  ok(calls.length === 0, 'no call at start');
  e.set('dark');
  ok(calls.length === 1 && calls[0] === 'dark', 'header switch to dark: one re-theme call: ' + JSON.stringify(calls));
  e.set('dark');
  ok(calls.length === 1, 'same value again: no call');
  e.sys(true);
  ok(calls.length === 1, 'system flips while the header pins dark: no call');
  e.set(null);
  ok(calls.length === 1, 'back to auto with a dark system: still dark, no call');
  e.sys(false);
  ok(calls.length === 2 && calls[1] === 'light', 'auto + system turns light: one call: ' + JSON.stringify(calls));
  e.set('light');
  ok(calls.length === 2, 'pin light while already light: no call');
  e.set('dark'); e.set('light');
  ok(calls.length === 4 && calls[2] === 'dark' && calls[3] === 'light', 'two flips, two calls');
  w.stop();
  ok(!e.mos[0].on && e.mq.ls.length === 0, 'stop() removes both watchers');
  e.set('dark');
  ok(calls.length === 4, 'no call after stop');
  // older engines: addListener
  const l = fakeEnv({ legacy: true, dark: false }), lc = [];
  l.T.watch((t) => lc.push(t));
  l.sys(true);
  ok(lc.length === 1 && lc[0] === 'dark', 'MediaQueryList.addListener fallback');
  // a throwing callback does not break the watcher
  const x = fakeEnv({ dark: false });
  let k = 0;
  x.win.console = { error() {} };
  x.T.watch(() => { k++; throw new Error('boom'); });
  x.set('dark'); x.set('light');
  ok(k === 2, 'throwing re-theme is contained');
}

// 3. wiring in the shell and the cm layer
{
  const core = require(path.join(EXT, 'ui', 'core.js'));
  ok(core.script.indexOf(THEME.script) === 0, 'shell script starts with the theme watcher');
  ok(/IDE_THEME\.watch\(retheme\)/.test(core.script), 'shell watches the page theme');
  ok(!/ide\.theme/.test(core.script.replace(/\/\/[^\n]*/g, '')) && !/class:'ide-theme'/.test(core.script), 'no own theme switch, no saved preference read');
  ok(/theme:pageTheme\(\)==='dark'\?'gem2':'light'/.test(core.script), 'editor starts in the page theme');
  ok(/retheme\(pageTheme\(\)\)/.test(core.script), 'shell re-checks on show');
  const lang = require(path.join(EXT, 'lang', 'core.js'));
  ok(!lang.some((r) => /^ide\.theme/.test(r[0])), 'old switch strings removed');
  const esrc = fs.readFileSync(path.join(EXT, 'cm', 'editor.src.js'), 'utf8');
  ok(/ED\.theme = function/.test(esrc) && /LIVE\.push\(retheme\)/.test(esrc) && /LIVE\.push\(recv\)/.test(esrc), 'cm layer: one ED.theme for editors and compare views');
  ok(/unlive\(retheme\)/.test(esrc) && /unlive\(recv\)/.test(esrc), 'cm layer: views leave the list when closed');
}

// 4. fixed colours
{
  const core = require(path.join(EXT, 'ui', 'core.js'));
  const exp = require(path.join(EXT, 'ui', 'explorer.js'));
  const pan = require(path.join(EXT, 'ui', 'panels.js'));
  const cm = require(path.join(EXT, 'cm', 'index.js'));
  // allowed hex: the two tuned syntax palettes (+ the shell warning colour, a palette entry) and nothing else
  const allow = new Set();
  for (const t of ['dark', 'light']) {
    const v = TH.themeVars(t);
    for (const k of Object.keys(TH.SYNTAX[t])) allow.add(v[k].toUpperCase());
    allow.add(TH.shellVars(t).iw.toUpperCase());
  }
  const rgbOf = (h) => { const x = parseInt(h, 16); return [(x >> 16) & 255, (x >> 8) & 255, x & 255].join(','); };
  const allowRgb = new Set([...allow].map(rgbOf));
  const NEUTRAL_SHADOW = /box-shadow:[^;}]*rgba\(0,0,0,\.\d+\)/;
  const NAMED = /(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-[a-z]+)?(?:-color)?|outline(?:-color)?|fill|stroke|text-decoration-color)\s*:[^;}]*\b(white|black|red|blue|green|yellow|gray|grey|silver|orange|purple|navy|maroon|teal|olive|lime|aqua|fuchsia)\b/i;
  const sources = [['core.css', core.css], ['explorer.css', exp.css], ['panels.css', pan.css], ['cm css', cm.css],
    ['core.js', core.script], ['explorer.js', exp.script], ['panels.js', pan.script], ['ide.js', cm.js]];
  let found = 0;
  for (const [name, s] of sources) {
    const isCss = /css/.test(name);
    // scripts: CSS-ish colour only (inline style writes); the sdl '#tag' token and '#' + id strings are not colours
    for (const m of s.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![\w-])/g)) {
      const pre = s.slice(Math.max(0, m.index - 30), m.index);
      if (!isCss && !/(color|background|border|outline|fill|stroke)\W{0,4}$/i.test(pre) && !/style/.test(pre)) continue;
      let h = m[1].toUpperCase(); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      found++;
      ok(allow.has(h), name + ': fixed colour #' + m[1] + ' is not a syntax palette entry, near: ' + s.slice(Math.max(0, m.index - 60), m.index + 20).replace(/\s+/g, ' '));
    }
    for (const m of s.matchAll(/rgba?\(([^)]*)\)/g)) {
      const rule = s.slice(s.lastIndexOf('{', m.index) + 1, s.indexOf('}', m.index));
      const decl = s.slice(Math.max(s.lastIndexOf(';', m.index), s.lastIndexOf('{', m.index)) + 1, m.index + m[0].length);
      const rgb = m[1].split(',').slice(0, 3).map((x) => x.trim()).join(',');
      found++;
      ok(allowRgb.has(rgb) || NEUTRAL_SHADOW.test(decl), name + ': ' + m[0] + ' is neither a palette tint nor a neutral shadow, in: ' + rule.slice(0, 120));
    }
    const nm = NAMED.exec(s);
    ok(!nm, name + ': named colour ' + (nm && nm[1]) + ' near ' + (nm ? s.slice(Math.max(0, nm.index - 40), nm.index + 60) : ''));
    ok(!/hsla?\(/.test(s), name + ': no hsl() colours');
  }
  // the old own-theme light block and dark surfaces are gone
  ok(!/\.ide-light\b/.test(core.css) && !/1c1b1a/i.test(core.css), 'shell: no own light/dark surface sets');
  ok(/\.ide-shell\{--ib:var\(--in\);--ip:var\(--th\)/.test(core.css), 'shell surfaces are page tokens');
  ok(/\.cm-s-gem2\.CodeMirror\{background:var\(--in\);color:var\(--fg\)\}/.test(cm.css) && /\.cm-s-idelight\.CodeMirror\{background:var\(--in\);color:var\(--fg\)\}/.test(cm.css), 'text pane surfaces are page tokens in both palettes');
  console.log('fixed colours checked: ' + found + ' hex/rgb values, all palette entries or neutral shadows');
}

// 5. contrast
{
  for (const t of ['dark', 'light']) {
    const v = TH.themeVars(t), rows = [];
    for (const [f, bs, min] of TH.CHECKS) for (const b of bs) {
      const r = TH.contrast(v[f], v[b]);
      ok(r >= min, t + ' contrast ' + f + ' #' + v[f] + ' on ' + b + ' #' + v[b] + ' = ' + r.toFixed(2) + ' < ' + min);
    }
    for (const k of ['fg', 'key', 'type', 'number', 'string', 'operator', 'preproc', 'comment', 'brace', 'error', 'warn'])
      rows.push(k + ' #' + v[k] + ' ' + TH.contrast(v[k], v.bg).toFixed(2) + '/' + TH.contrast(v[k], v.currentLine).toFixed(2));
    console.log('contrast ' + t + ' (on text bg #' + v.bg + ' / active line #' + v.currentLine + '): ' + rows.join(', '));
    const s = TH.shellVars(t), sr = [];
    for (const [k, min] of TH.SHELL_CHECKS) for (const b of ['ip', 'ib']) {
      const r = TH.contrast(s[k], s[b]);
      ok(r >= min, t + ' shell --' + k + ' #' + s[k] + ' on --' + b + ' #' + s[b] + ' = ' + r.toFixed(2));
      sr.push(k + '/' + b + ' ' + r.toFixed(2));
    }
    console.log('contrast ' + t + ' shell: ' + sr.join(', '));
    ok(TH.contrast(v.comment, v.bg) >= 3, t + ' comments >= 3:1');
    ok(TH.contrast(v.fg, v.bg) >= 4.5, t + ' code text >= 4.5:1');
  }
}

// 6. page token copy
{
  const page = fs.readFileSync(path.join(ROOT, 'tools', 'gui', 'page.js'), 'utf8');
  const P = TH.parseTokens(page);
  ok(P.light && P.dark, 'page.js token blocks found');
  for (const t of ['light', 'dark']) for (const k of Object.keys(TH.PAGE[t]))
    ok(P[t] && P[t][k] === TH.PAGE[t][k], t + ' --' + k + ': cm/theme.js #' + TH.PAGE[t][k] + ' vs page.js #' + (P[t] && P[t][k]));
  // every token the Editor CSS uses exists on the page
  const used = new Set();
  const all = [require(path.join(EXT, 'ui', 'core.js')).css, require(path.join(EXT, 'ui', 'explorer.js')).css, require(path.join(EXT, 'ui', 'panels.js')).css, require(path.join(EXT, 'cm', 'index.js')).css].join('\n');
  for (const m of all.matchAll(/var\(--([a-z0-9]+)\)/g)) used.add(m[1]);
  const own = new Set(['ib', 'ip', 'il', 'it', 'ih', 'ia', 'iw', 'ie', 'ik']);
  for (const k of used) ok(own.has(k) || (P.light && k in P.light && k in P.dark), 'token --' + k + ' is defined by the page in both themes');
  console.log('page tokens used: ' + [...used].sort().join(' '));
}

console.log(n + ' checks, ' + bad + ' failed');
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
