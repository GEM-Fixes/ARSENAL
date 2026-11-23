// W6 theme sweep: the page colours follow the light, dark and auto theme.
// 1. the three :root token blocks in page.js (light, OS dark, switch dark) name the same tokens; the two dark blocks agree.
// 2. every var(--x) the swept files use is a token of those blocks (a typo would paint nothing).
// 3. contrast: text tokens on their surfaces at least 4.5:1 in both themes, hint text at least 3:1 (ratios printed).
// 4. no fixed colour comes back: colour literals and named colours in the swept files fail, outside the :root blocks and ALLOW.
// 5. onTheme(fn,key) runs after the header switch and after the OS change; a key replaces the earlier fn; cssv reads a token.
// usage: node test-theme.js
// Author: Imperator_Aug (ARSENAL, ia-9bdb9c64)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const fakedom = require('./fakedom');
const GUI = path.join(__dirname, '..');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

// ---- the swept files (session W6 T2): page.js, every ext page except ide, docs and models; plus the models Armor part
const SKIP_DIRS = ['ide', 'docs', 'models'];
function walk(d, out) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.js$/.test(e.name) && !/test\.js$/.test(e.name)) out.push(p); } return out; }
const FILES = [path.join(GUI, 'page.js'), path.join(GUI, 'ext', 'models', 'sub', 'armor.client.js')];
for (const e of fs.readdirSync(path.join(GUI, 'ext'), { withFileTypes: true })) if (e.isDirectory() && !SKIP_DIRS.includes(e.name)) walk(path.join(GUI, 'ext', e.name), FILES);
const rel = f => path.relative(GUI, f).replace(/\\/g, '/');

// ---- 1. token blocks
const pageSrc = fs.readFileSync(path.join(GUI, 'page.js'), 'utf8');
function block(re, name) { const m = re.exec(pageSrc); assert.ok(m, 'block ' + name); const o = {}; m[1].replace(/--([\w-]+):([^;}]+)/g, (x, k, v) => { o[k] = v.trim(); }); return o; }
const LIGHT = block(/\n:root\{([^}]*)\}/, 'light');
const DARKOS = block(/:root:not\(\[data-theme=light\]\)\{([^}]*)\}/, 'dark (OS)');
const DARK = block(/\n:root\[data-theme=dark\]\{([^}]*)\}/, 'dark (switch)');
const keys = o => Object.keys(o).sort().join(',');
assert.strictEqual(keys(DARKOS), keys(LIGHT), 'OS dark block names the same tokens as light');
assert.strictEqual(keys(DARK), keys(LIGHT), 'switch dark block names the same tokens as light');
for (const k of Object.keys(DARK)) assert.strictEqual(DARKOS[k], DARK[k], 'dark blocks agree on --' + k);
ok('token blocks: ' + Object.keys(LIGHT).length + ' tokens, same names in light, OS dark and switch dark; the two dark blocks agree');

// the text a swept file contributes, with the :root token blocks cut out of page.js
function body(f) { let s = fs.readFileSync(f, 'utf8'); if (/page\.js$/.test(f)) { const a = s.indexOf(':root{'), b = s.indexOf('*{box-sizing'); assert.ok(a > 0 && b > a, 'token blocks found'); s = s.slice(0, a) + s.slice(b); } return s; }

// ---- 2. every var(--x) is a token (or the one runtime value, --hdh, set by hdhWatch with a fallback)
// mvy, mvl, mvr: the Map Viewer's own layout values (its top in the page, its two side column widths), each used with a
// fallback and set by the shell (ext/mapviz/sub/shell.client.js); sizes, not colours
const RUNTIME = new Set(['hdh', 'mvy', 'mvl', 'mvr']);
const unknown = [];
// 'var(--s'+i+')' in the Balance page builds the chart series --s1..--s12
for (let i = 1; i <= 12; i++) assert.ok(('s' + i) in LIGHT, 'series token --s' + i);
for (const f of FILES) { const s = body(f); let m; const re = /var\(--([\w-]+)(')?/g; while ((m = re.exec(s))) if (!(m[1] in LIGHT) && !RUNTIME.has(m[1]) && !(m[1] === 's' && m[2])) unknown.push(rel(f) + ' --' + m[1]); }
// cssv('--x') and tok('--x') reads, and the armour CAT_TOK names
for (const f of FILES) { const s = body(f); let m; const re = /(?:cssv|tok)\('--([\w-]+)'/g; const reads = [];
  while ((m = re.exec(s))) reads.push(m[1]);
  const ct = /CAT_TOK=\{([^}]*)\}/.exec(s); if (ct) ct[1].replace(/'--([\w-]+)'/g, (x, k) => { reads.push(k); });
  for (const k of reads) if (!(k in LIGHT) && !RUNTIME.has(k)) unknown.push(rel(f) + ' --' + k + ' (read)'); }
assert.deepStrictEqual(unknown, [], 'tokens used but not defined');
ok('every var(--x) and token read in ' + FILES.length + ' swept files is defined');

// ---- 3. contrast (WCAG relative luminance)
function rgb(v) { v = String(v).trim(); let m = /^#([0-9a-f]{3})$/i.exec(v); if (m) v = '#' + m[1].split('').map(c => c + c).join(''); m = /^#([0-9a-f]{6})$/i.exec(v); if (!m) throw new Error('not a solid colour: ' + v); const x = parseInt(m[1], 16); return [x >> 16 & 255, x >> 8 & 255, x & 255]; }
function lum(c) { return c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0); }
function ratio(a, b) { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const SURF = ['bg', 'card', 'in', 'btn', 'th', 'sel', 'hov', 'soft', 'ban', 'who', 'hbox', 'qp', 'chip', 'badge', 'code', 'pre', 'bad',
  'crash', 'silent', 'review', 'cosm', 'goodbg', 'infobg', 'warnbg', 'violbg', 'hit'];
const PAIRS = [];   // [text token, surface token, minimum]
for (const s of SURF) PAIRS.push(['fg', s, 4.5]);
for (const s of ['bg', 'card', 'soft', 'th', 'in', 'ban']) PAIRS.push(['hint', s, 3]);
for (const t of ['err', 'ok', 'link', 'warnfg', 'synk']) for (const s of ['bg', 'card']) PAIRS.push([t, s, 4.5]);
PAIRS.push(['hdfg', 'hd', 4.5], ['tabfg', 'tab', 4.5], ['hdhint', 'hd', 4.5], ['hdhint', 'tab', 4.5], ['hdbad', 'hd', 4.5], ['tabfg', 'hd', 4.5]);
PAIRS.push(['prifg', 'pri', 4.5], ['prifg', 'dan', 4.5], ['tipfg', 'tip', 4.5]);
for (const t of ['logfg', 'loge', 'logq', 'loga']) PAIRS.push([t, 'log', 4.5]);
for (const s of ['lvbad', 'lvwarn', 'lvnote', 'lvok', 'lvsync', 'lvinfo']) PAIRS.push(['lvfg', s, 4.5]);
const bad = [];
for (const [name, T] of [['light', LIGHT], ['dark', DARK]]) {
  const line = [];
  for (const [t, s, min] of PAIRS) { const r = ratio(T[t], T[s]); line.push(t + '/' + s + ' ' + r.toFixed(2)); if (r < min) bad.push(name + ' ' + t + ' on ' + s + ' ' + r.toFixed(2) + ' < ' + min); }
  console.log('# ' + name + ': ' + line.join(', '));
}
assert.deepStrictEqual(bad, [], 'contrast');
ok('contrast: ' + PAIRS.length + ' text/surface pairs pass in light and in dark (text 4.5:1, hint 3:1)');

// ---- 4. no fixed colour in the swept files
// ALLOW: [file, exact text, why]. An entry needs a reason a token cannot carry (a colour that is data, not paint).
const ALLOW = [
  // the picture viewer's backdrop choices are fixed test surfaces for the image's alpha, the same in light and dark
  ['ext/view/kinds/picture.client.js', '.vw-pic-bg-black{background:#000}', 'backdrop is data: black and white to judge alpha'],
  ['ext/view/kinds/picture.client.js', '.vw-pic-bg-checker{background-color:#fff', 'backdrop is data: the alpha checker'],
  ['ext/view/kinds/picture.client.js', 'linear-gradient(45deg,transparent 75%,#c8c8c8 75%)', 'backdrop is data: the alpha checker'],
];
const NAMED = 'white|black|red|green|blue|gray|grey|yellow|orange|silver|navy|maroon|purple|teal|lime|pink|gold|brown|cyan|magenta|olive|aqua|fuchsia|darkgray|lightgray|darkgrey|lightgrey';
const LIT = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const NAMEDRE = new RegExp('(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline|fillStyle|strokeStyle|box-shadow)[\'"]?\\s*[:=,]\\s*[\'"]?[^;\'"]*?\\b(' + NAMED + ')\\b', 'gi');
const found = [];
for (const f of FILES) {
  const s = body(f); const lines = s.split('\n');
  lines.forEach((l, i) => {
    const hits = (l.match(LIT) || []).concat((l.match(NAMEDRE) || []));
    for (const h of hits) if (!ALLOW.some(a => a[0] === rel(f) && l.includes(a[1]))) found.push(rel(f) + ':' + (i + 1) + ' ' + h.slice(0, 60));
  });
}
assert.deepStrictEqual(found, [], 'fixed colours outside the token blocks');
ok('no colour literal or named colour outside the :root token blocks in ' + FILES.length + ' swept files');

// ---- 5. onTheme / cssv in the page under node (fake DOM, fake getComputedStyle and matchMedia)
const html = require('../page.js');
const doc = fakedom.make(), store = new Map();
const mq = { fns: [], addEventListener(t, f) { if (t === 'change') this.fns.push(f); } };
const ctx = {
  document: doc, console, TextDecoder, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  fetch: () => new Promise(() => {}),
  matchMedia: q => { assert.ok(/prefers-color-scheme/.test(q)); return mq; },
  getComputedStyle: el => ({ getPropertyValue: k => { const t = el.getAttribute('data-theme') === 'dark' ? DARK : LIGHT; return ' ' + (t[k.replace(/^--/, '')] || ''); } }),
};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' });
assert.strictEqual(typeof ctx.onTheme, 'function'); assert.strictEqual(typeof ctx.cssv, 'function');
assert.strictEqual(mq.fns.length, 1, 'page listens to the OS light/dark change');
let a = 0, b = 0, c = 0, seen = [];
ctx.onTheme(() => { a++; seen.push(ctx.cssv('--bg')); }, 'k1');
ctx.onTheme(() => { b++; }, 'k1');   // replaces the first
const off = ctx.onTheme(() => { c++; });
const ts = doc.getElementById('themebox').children[0];
ts.value = 'dark'; ts.fire('change');
assert.deepStrictEqual([a, b, c], [0, 1, 1], 'switch fires each fn once; a key replaces');
ctx.onTheme(() => { seen.push(ctx.cssv('--bg')); }, 'k1');
ts.value = 'light'; ts.fire('change');
assert.deepStrictEqual(seen, [LIGHT.bg], 'cssv reads the token of the theme just set (trimmed)');
mq.fns[0](); assert.strictEqual(c, 3, 'OS change fires too'); off(); mq.fns[0](); assert.strictEqual(c, 3, 'off() removes');
assert.strictEqual(ctx.cssv('--nope', 'x'), 'x', 'missing token gives the fallback');
ok('onTheme fires on the header switch and on the OS change, a key replaces, off() removes; cssv reads the current token');

// the fake DOM without getComputedStyle / matchMedia: the page still runs and cssv gives the fallback
{ const d2 = fakedom.make(), c2 = { document: d2, console, TextDecoder, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, localStorage: { getItem: () => null, setItem: () => {} }, fetch: () => new Promise(() => {}) };
  c2.window = c2; vm.createContext(c2); vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], c2, { filename: 'page.js:script' });
  assert.strictEqual(c2.cssv('--bg', 'fb'), 'fb'); }
ok('without getComputedStyle and matchMedia (the test fake DOM) the page runs and cssv falls back');
console.log('PASS test-theme ' + n);
