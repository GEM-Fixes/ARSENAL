// mapviz page test (coordinator, wave 0): the ext object of ./index.js under the rules tools/gui/test/test-ext.js applies to every
// ext, the four languages (same keys and slots, no TODO: value, AS64 in capitals, no dash as a separator), the page rules on the
// script (no backtick, no dollar-brace, no HTML writes, it parses), no colour literal in any page file, the literal parts table
// against tools/mapviz/README.md 1.10 and the sub/ folder, the "not built yet" hint screen (one leaf, all four languages, no call),
// then every sub/<part>.test.js run alone with a scratch dir (exit 0 and last line "PASS mapviz <part> (N)").
// Seeded defects, built in the scratch dir: a duplicate lang key, a duplicate route, a client with a backtick, a broken part,
// a part test without its PASS line, a part test that exits 1, a table line that names another part, a stray file in sub/.
// usage: node tools/gui/ext/mapviz/test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-e31a0a37)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), WT = require('../../../lib/test/wait');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-page-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');   // before anything that caches is required

const HERE = __dirname, SUB = path.join(HERE, 'sub');
const README = path.join(HERE, '..', '..', '..', 'mapviz', 'README.md');
const CODES = ['en', 'ru', 'uk', 'zh'];
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz page: ' + what + (extra ? '\n  ' + String(extra).slice(0, 900) : '')); } };

// ---------- the checks, as functions so seeded defects go through the same code ----------
// extProblems: tools/gui/test/test-ext.js on one ext, plus the mapviz page rules (README 9.3, brief window-text rules)
const CORE_EN = (() => { try { return require('../../lang/en.json'); } catch (e) { return {}; } })();
const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const BARE = /(?<![\w.\/\\#+$'"`-])as64(?![\w+\/\\"`]|'(?!s\b)|\.\w)/, FLAG = /--(?:to|target|exe|from|game)[ =]as64\b/g;   // test-lang.js
function extProblems(x) {
  const bad = [];
  if (!x || !/^[a-z][a-z0-9]*$/.test(x.id || '')) { bad.push('ext id ' + (x && x.id)); return bad; }
  if (x.script) {
    if (/`|\$\{/.test(x.script)) bad.push('script has a backtick or dollar-brace');
    if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(x.script)) bad.push('script writes HTML (use h() and textContent)');
    if (x.tab !== false && !x.script.includes('EXT_SCREENS.' + x.id) && !x.script.includes("EXT_SCREENS['" + x.id + "']")) bad.push('script does not set EXT_SCREENS.' + x.id);
    if (x.tab !== false && !x.nav) bad.push('script but no nav key');
    try { new vm.Script(x.script, { filename: 'mapviz:script' }); } catch (e) { bad.push('script does not parse: ' + e.message); }
  }
  const L = x.lang || {}, en = Object.keys(L.en || {});
  for (const c of CODES) if (!L[c] || typeof L[c] !== 'object') bad.push('lang ' + c + ' missing');
  for (const c of CODES.slice(1)) for (const k of en) if (!(L[c] && typeof L[c][k] === 'string' && L[c][k])) bad.push('lang ' + c + ' missing ' + k);
  for (const c of CODES.slice(1)) for (const k of Object.keys(L[c] || {})) if (!(k in (L.en || {}))) bad.push('lang ' + c + ' extra key ' + k);
  if (x.nav && !(L.en && L.en[x.nav])) bad.push('nav key ' + x.nav + ' not in its en strings');
  for (const m of (x.script || '').matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.') && !(L.en && L.en[m[1]]) && !CORE_EN[m[1]]) bad.push('tx key ' + m[1] + ' undefined');
  if (Object.keys(x.commands || {}).length) {
    const contract = require('../../contract');
    for (const k of Object.keys(x.commands)) if (!contract.COMMANDS[k]) bad.push('command ' + k + ' not merged');
  }
  for (const k of Object.keys(x.routes || {})) {
    if (!/^(GET|POST) \/api\/x\/[a-z0-9/_-]+$/.test(k)) bad.push('route ' + k + ' must be GET|POST /api/x/...');
    else if (!/^(GET|POST) \/api\/x\/mapviz\//.test(k)) bad.push('route ' + k + ' is not under /api/x/mapviz/ (README 6.1)');
    if (typeof x.routes[k] !== 'function') bad.push('route ' + k + ' is not a function');
  }
  for (const c of CODES) for (const [k, v] of Object.entries(L[c] || {})) {
    if (typeof v !== 'string') { bad.push('lang ' + c + ' ' + k + ' is not text'); continue; }
    if (/^TODO:/.test(v)) bad.push('lang ' + c + ' ' + k + ' starts with TODO:');
    if (L.en && k in L.en && slots(v) !== slots(L.en[k])) bad.push('lang ' + c + ' ' + k + ' slots differ');
    if (BARE.test(v.replace(FLAG, '--flag'))) bad.push('lang ' + c + ' ' + k + ' writes the game name in lower case (AS64)');
    if (/\u2014/.test(v) || / - /.test(v)) bad.push('lang ' + c + ' ' + k + ' uses a dash as a separator');
  }
  return bad;
}
// colourProblems: tools/gui/test/test-theme.js section 4 on one text (README 5.5)
const NAMED = 'white|black|red|green|blue|gray|grey|yellow|orange|silver|navy|maroon|purple|teal|lime|pink|gold|brown|cyan|magenta|olive|aqua|fuchsia|darkgray|lightgray|darkgrey|lightgrey';
const LIT = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const NAMEDRE = new RegExp('(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline|fillStyle|strokeStyle|box-shadow)[\'"]?\\s*[:=,]\\s*[\'"]?[^;\'"]*?\\b(' + NAMED + ')\\b', 'gi');
function colourProblems(text, name) {
  const bad = [];
  String(text).split('\n').forEach((l, i) => { for (const hit of (l.match(LIT) || []).concat(l.match(NAMEDRE) || [])) bad.push(name + ':' + (i + 1) + ' ' + hit.slice(0, 60)); });
  return bad;
}
// tableProblems: the literal parts table in index.js source, in README 1.10 order, each line naming one part three times
const LINE = /\{ part: '([a-z]+)', c: \(\) => opt\(\(\) => require\('\.\/sub\/([a-z]+)\.client'\), '\.\/sub\/([a-z]+)\.client'\), l: \(\) => opt\(\(\) => require\('\.\/sub\/([a-z]+)\.lang\.json'\), '\.\/sub\/([a-z]+)\.lang\.json'\), s: \(\) => opt\(\(\) => require\('\.\/sub\/([a-z]+)\.server'\), '\.\/sub\/([a-z]+)\.server'\) \},?$/;
function tableProblems(src, order, names) {
  const bad = [], lines = String(src).split('\n').filter(l => /^\s*\{ part: '/.test(l)), got = [];
  for (const l of lines) {
    const m = LINE.exec(l.trim());
    if (!m) { bad.push('table line not in the literal form: ' + l.trim().slice(0, 80)); continue; }
    if (m.slice(2).some(x => x !== m[1])) bad.push('table line ' + m[1] + ' requires another part: ' + m.slice(2).join(','));
    got.push(m[1]);
  }
  if (got.join() !== order.join()) bad.push('table order ' + got.join() + ' is not README 1.10 ' + order.join());
  if (names && names.join() !== got.join()) bad.push('exported names ' + names.join() + ' differ from the literal lines');
  return bad;
}
// subProblems: every file in sub/ belongs to a table part (or is .gitkeep / README.md)
function subProblems(files, names) {
  return files.filter(f => {
    if (f === '.gitkeep' || f === 'README.md') return false;
    const m = /^([a-z]+)\.(client\.js|lang\.json|server\.js|test\.js)$/.exec(f);
    return !(m && names.includes(m[1]));
  }).map(f => 'sub/' + f + ' is not a file of a table part');
}
// partLangProblems: one part's lang file: the four languages, keys mapviz.<part>. (or mapviz.err.<code>, README 6.1)
function partLangProblems(part, l) {
  const bad = [];
  if (!l || Object.keys(l).sort().join() !== CODES.slice().sort().join()) bad.push(part + '.lang.json must hold exactly en, ru, uk, zh');
  for (const c of Object.keys(l || {})) for (const k of Object.keys(l[c] || {})) if (k.indexOf('mapviz.' + part + '.') !== 0 && !/^mapviz\.err\.[A-Za-z0-9_]+$/.test(k)) bad.push(part + '.lang.json ' + c + ' key ' + k + ' lacks the prefix mapviz.' + part + '.');
  return bad;
}
// runPartTests(dir, scratch): run each <part>.test.js alone -> [{file, ok, why}]
function runPartTests(dir, scratch) {
  const out = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort() : [];
  for (const f of files) {
    const part = f.slice(0, -8), sw = path.join(scratch, 'sub-' + part);
    fs.mkdirSync(sw, { recursive: true });
    const r = WT.spawnSync(process.execPath, [path.join(dir, f), sw], { encoding: 'utf8', timeout: 600000, windowsHide: true, env: Object.assign({}, process.env, { ARSENAL_CACHE: path.join(sw, 'cache') }) }, 'mapviz test');
    String(r.stderr || '').split(/\r?\n/).filter(s => /^WAIT /.test(s)).forEach(s => process.stderr.write(s + '\n'));
    const lines = String(r.stdout || '').split(/\r?\n/).filter(s => s.trim());
    const last = lines.length ? lines[lines.length - 1].trim() : '';
    const passLine = new RegExp('^PASS mapviz ' + part + ' \\(\\d+\\)$').test(last);
    const why = r.status !== 0 ? 'exit ' + r.status + (r.error ? ' ' + r.error.message : '') : !passLine ? 'last line is not "PASS mapviz ' + part + ' (N)": ' + last.slice(0, 80) : '';
    out.push({ file: f, ok: !why, why, tail: String((r.stdout || '') + (r.stderr || '')).split('\n').slice(-10).join('\n') });
  }
  return out;
}
// renderHint(ext, code): run the script in a stub page, build the screen -> {leaves, text, calls, screen, X}
function renderHint(x, code) {
  const mk = tag => ({ tag, kids: [], attrs: {}, className: '', textContent: '',
    appendChild(c) { if (c && typeof c === 'object') this.kids.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener() {} });
  const h = (tag, a, kids) => { const e = mk(tag); for (const k of Object.keys(a || {})) { const v = a[k]; if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.attrs[k] = String(v); } (kids || []).forEach(k => e.appendChild(k)); return e; };
  const L = x.lang[code] || {}, tx = k => (k in L ? L[k] : (x.lang.en[k] || k));
  let calls = 0; const api = () => { calls++; return new Promise(() => {}); };
  const X = {};
  const ctx = { EXT_SCREENS: X, h, tx, api, fetch: api, XMLHttpRequest: function () { calls++; }, S: {}, LANG: code, RMT: false, console };
  vm.createContext(ctx);
  vm.runInContext(x.script, ctx, { filename: 'mapviz:script' });
  const root = mk('section');
  const screen = typeof X.mapviz === 'function' ? X.mapviz(root) : null;
  const all = []; (function walk(e) { all.push(e); e.kids.forEach(walk); })(root);
  const leaves = all.filter(e => e.attrs.blk != null);
  const text = all.map(e => e.textContent).filter(Boolean).join('\n');
  return { leaves, text, calls, screen, X, root };
}
const throwsLike = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e && e.message)); } };

// ---------- 1. the real ext ----------
let ext = null;
try { ext = require('./index'); } catch (e) { ok(false, 'index.js loads', e && e.stack); }
if (ext) {
  const T = ext._t;
  const p = extProblems(ext);
  ok(!p.length, 'ext object passes the test-ext.js rules and the page rules', p.join('\n  '));
  ok(ext.id === 'mapviz' && ext.nav === 'mapviz.nav' && ext.adv === false && ext.after === 'maps' && typeof ext.script === 'string', 'id, nav, adv, after, script');
  ok(ext.commands && typeof ext.commands === 'object' && !Object.keys(ext.commands).length, 'no commands of its own');
  ok(ext.routes && typeof ext.routes === 'object', 'routes object');
  const en = Object.keys(ext.lang.en).sort();
  for (const c of CODES) ok(Object.keys(ext.lang[c] || {}).sort().join() === en.join(), 'lang ' + c + ': the same keys as en (' + en.length + ')');
  for (const c of CODES.slice(1)) ok(ext.lang[c]['mapviz.page.notBuilt'] !== ext.lang.en['mapviz.page.notBuilt'] && ext.lang[c]['mapviz.nav'] !== ext.lang.en['mapviz.nav'], 'lang ' + c + ': the skeleton strings are translated');

  // the literal table against the README and the sub/ folder
  const src = fs.readFileSync(path.join(HERE, 'index.js'), 'utf8');
  const rm = fs.existsSync(README) ? fs.readFileSync(README, 'utf8') : '';
  const om = /Part order \(ext\/mapviz\/index\.js,\s+coordinator\):([\s\S]*?)\./.exec(rm);
  const ORDER = om ? om[1].split(/,|\bthen\b/).map(s => s.trim()).filter(Boolean) : [];
  ok(ORDER.length === 16, 'README 1.10 names the 16 parts in order (' + ORDER.join(',') + ')');
  const tp = tableProblems(src, ORDER, T.NAMES);
  ok(!tp.length, 'parts table: literal lines in README 1.10 order', tp.join('\n  '));
  ok(!/require\(\s*[^'")\s]/.test(src.replace(/require\(f\)/, '')), 'every require in index.js names its module literally (fromDir excepted)');
  const subFiles = fs.existsSync(SUB) ? fs.readdirSync(SUB) : [];
  ok(fs.existsSync(SUB), 'sub/ folder exists');
  const sp = subProblems(subFiles, T.NAMES);
  ok(!sp.length, 'every file in sub/ belongs to a table part', sp.join('\n  '));
  for (const part of T.NAMES) {
    const f = path.join(SUB, part + '.lang.json');
    if (!fs.existsSync(f)) continue;
    let l = null; try { l = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { ok(false, part + '.lang.json parses', e.message); continue; }
    const lp = partLangProblems(part, l);
    ok(!lp.length, part + '.lang.json: four languages, key prefix', lp.join('\n  '));
  }
  ok(T.built.every(b => T.NAMES.includes(b)), 'built parts: ' + (T.built.join(',') || 'none'));

  // no colour literal: the script and every page file (tests excluded, as test-theme.js does)
  const files = ['index.js'].concat(subFiles.filter(f => /\.js$/.test(f) && !/test\.js$/.test(f)).map(f => 'sub/' + f));
  const cp = colourProblems(ext.script, 'script');
  for (const f of files) cp.push(...colourProblems(fs.readFileSync(path.join(HERE, f), 'utf8'), f));
  ok(!cp.length, 'no colour literal in the script or in ' + files.length + ' page files', cp.join('\n  '));
  for (const f of files.concat(['README.md', 'test.js'])) {
    const s = fs.readFileSync(path.join(HERE, f), 'utf8');
    ok(!s.includes('\r') && !/[^\x00-\x7f]/.test(s), f + ' is ASCII with LF');
    ok(!/[A-Z]:[\\/][Uu]sers[\\/]|\/home\/[a-z]/.test(s), f + ' holds no home folder path');
  }

  // the hint screen while the shell is absent; with the shell present the hint is not in the script
  if (!T.shell) {
    ok(ext.script.indexOf(T.HINT) === 0, 'no shell part: the script starts with the skeleton hint');
    for (const c of CODES) {
      const r = renderHint(ext, c);
      ok(r.leaves.length === 1 && r.leaves[0].attrs.blk === 'hint', c + ': one hint leaf (' + r.leaves.length + ')');
      ok(r.text.includes(ext.lang[c]['mapviz.page.notBuilt']) && r.text.includes(ext.lang[c]['mapviz.nav']) && !/mapviz\.[a-z]/.test(r.text), c + ': the hint text in this language, no raw key', r.text);
      ok(r.calls === 0, c + ': no call');
      ok(r.screen && ['refresh', 'focus', 'view'].every(k => typeof r.screen[k] === 'function'), c + ': screen object {refresh, focus, view}');
      ok(Array.isArray(r.X.mapviz.parts), c + ': EXT_SCREENS.mapviz.parts is there for parts loaded without the shell');
      r.screen.refresh(); r.screen.focus(); r.screen.view('as64~a/b~combat~~0,0,1');
      ok(r.calls === 0, c + ': refresh, focus and view make no call');
    }
  } else {
    ok(ext.script.indexOf(T.HINT) < 0, 'shell part present: the skeleton hint is not in the script');
    ok(/EXT_SCREENS\.mapviz\s*=/.test(ext.script), 'shell part present: it sets EXT_SCREENS.mapviz');
  }
  ok(!/\bV\s*=|EXT_SCREENS\.mapviz\.parts\s*=/.test(T.HINT.replace('EXT_SCREENS.mapviz.parts=[];', '')) && !/\bV\./.test(T.HINT), 'the skeleton hint defines no page API (V)');

  // ---------- 2. fakes in the scratch dir: built from a folder through the same build ----------
  const fake = (name, files) => { const d = path.join(W, 'fake-' + name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(d, f), s); return d; };
  const langOf = (part, keys) => JSON.stringify(Object.fromEntries(CODES.map(c => [c, Object.fromEntries(keys.map(k => ['mapviz.' + part + '.' + k, c + ' ' + k]))])));
  const B = d => T.build(T.fromDir(d));
  {
    const e0 = B(fake('none', {}));
    ok(!extProblems(e0).length && e0.script === T.HINT && !Object.keys(e0.routes).length && !e0._t.built.length, 'no part built: the hint alone, no route, passes the rules');
  }
  {
    const d = fake('good', {
      'list.client.js': "module.exports = \"EXT_SCREENS.mapviz.parts.push({id:'list',init:function(V){V.say('mapviz.list.a')}});\";\n",
      'list.lang.json': langOf('list', ['a', 'b']),
      'list.server.js': "module.exports = { routes: { 'GET /api/x/mapviz/list/x': async () => ({ ok: true }) } };\n",
      'base.lang.json': langOf('base', ['a']),
      'water.server.js': "module.exports = { routes: { 'GET /api/x/mapviz/water/y': async () => ({}) } };\n",
    });
    const e1 = B(d);
    ok(e1._t.built.join() === 'list,base,water' && Object.keys(e1.routes).join() === 'GET /api/x/mapviz/list/x,GET /api/x/mapviz/water/y', 'parts merged in table order: ' + e1._t.built.join());
    ok(e1.lang.uk['mapviz.list.b'] === 'uk b' && e1.lang.zh['mapviz.base.a'] === 'zh a' && e1.lang.en['mapviz.nav'] === 'Map Viewer', 'lang merged with the skeleton strings');
    ok(e1.script.indexOf(T.HINT) === 0 && e1.script.indexOf('// mapviz part list') > 0, 'no shell: hint first, then the parts');
    ok(!extProblems(e1).length, 'merged fake ext passes the rules', extProblems(e1).join('; '));
    const r = renderHint(e1, 'ru');
    ok(r.leaves.length === 1 && r.calls === 0 && r.X.mapviz.parts.length === 1, 'a part loaded without the shell pushes to the hint list and the page still shows the hint');
  }
  {
    const d = fake('shell', {
      'shell.client.js': "module.exports = \"EXT_SCREENS.mapviz=function(root){root.appendChild(h('div',{blk:'map',text:tx('mapviz.shell.t')}));return {refresh:function(){},focus:function(){},view:function(){}}};EXT_SCREENS.mapviz.parts=[];\";\n",
      'shell.lang.json': langOf('shell', ['t']),
      'hover.client.js': "module.exports = \"EXT_SCREENS.mapviz.parts.push({id:'hover',init:function(V){}});\";\n",
    });
    const e2 = B(d);
    ok(e2._t.shell && e2.script.indexOf(T.HINT) < 0 && e2.script.indexOf('// mapviz part shell') === 0, 'shell present: the skeleton hint is not used');
    const r = renderHint(e2, 'en');
    ok(r.leaves.length === 1 && r.leaves[0].attrs.blk === 'map' && r.text === 'en t' && r.X.mapviz.parts.length === 1, 'shell present: its screen is the page');
  }
  // seeded: duplicate lang key across parts
  ok(throwsLike(() => B(fake('duplang', { 'shell.lang.json': langOf('shell', ['a']), 'list.lang.json': JSON.stringify({ en: { 'mapviz.shell.a': 'x' }, ru: {}, uk: {}, zh: {} }) })), /lang key mapviz\.shell\.a \(en\) of part list is already defined by shell/),
    'seeded: a duplicate lang key across parts is an error');
  ok(throwsLike(() => B(fake('dupnav', { 'game.lang.json': JSON.stringify({ en: { 'mapviz.nav': 'x' }, ru: {}, uk: {}, zh: {} }) })), /already defined by skeleton/), 'seeded: a part redefining a skeleton key is an error');
  // seeded: duplicate route
  ok(throwsLike(() => B(fake('duproute', {
    'shell.server.js': "module.exports = { routes: { 'GET /api/x/mapviz/palette': async () => ({}) } };\n",
    'style.server.js': "module.exports = { routes: { 'GET /api/x/mapviz/palette': async () => ({}) } };\n" })), /route GET \/api\/x\/mapviz\/palette of part style is already defined by shell/), 'seeded: a duplicate route is an error');
  // seeded: a client with a backtick (and one with innerHTML) is caught by the script rules
  {
    const eb = B(fake('backtick', { 'card.client.js': "module.exports = \"var t='\\x60';EXT_SCREENS.mapviz.parts.push({id:'card',init:function(){}});\";\n" }));
    ok(eb.script.indexOf(String.fromCharCode(96)) > 0, 'seeded backtick part is in the merged script');
    ok(extProblems(eb).some(p => /backtick or dollar-brace/.test(p)), 'seeded: a part client with a backtick is caught', extProblems(eb).join('; '));
    const eh = B(fake('html', { 'card.client.js': "module.exports = \"EXT_SCREENS.mapviz.parts.push({id:'card',init:function(V){document.body.innerHTML='x'}});\";\n" }));
    ok(extProblems(eh).some(p => /writes HTML/.test(p)), 'seeded: a part client writing innerHTML is caught');
    const ec = B(fake('colour', { 'card.client.js': "module.exports = \"EXT_SCREENS.mapviz.parts.push({id:'card',init:function(V){var g=null;if(g)g.fillStyle='#ff0000'}});\";\n" }));
    ok(colourProblems(ec.script, 'script').length === 1, 'seeded: a colour literal in a part client is caught');
    const et = B(fake('todo', { 'list.lang.json': JSON.stringify({ en: { 'mapviz.list.a': 'Maps of as64' }, ru: { 'mapviz.list.a': 'TODO: x' }, uk: { 'mapviz.list.a': 'a - b' }, zh: {} }) }));
    const tp2 = extProblems(et);
    ok(tp2.some(p => /TODO:/.test(p)) && tp2.some(p => /zh missing mapviz\.list\.a/.test(p)) && tp2.some(p => /lower case/.test(p)) && tp2.some(p => /dash/.test(p)), 'seeded: TODO: value, missing language, bare as64, dash separator are caught', tp2.join('; '));
    ok(partLangProblems('list', { en: { 'mapviz.shell.x': 'a' }, ru: {}, uk: {} }).length === 2, 'seeded: a lang file without zh and with another part\'s prefix is caught');
  }
  // seeded: broken parts fail loudly; a client that is not a string fails
  ok(throwsLike(() => B(fake('broken', { 'measure.server.js': "throw new Error('boom in measure');\n" })), /boom in measure/), 'seeded: a part file that throws fails loudly');
  ok(throwsLike(() => B(fake('deep', { 'measure.server.js': "require('./not_there');\nmodule.exports = { routes: {} };\n" })), /not_there/), 'seeded: a part whose own require is missing fails loudly');
  ok(throwsLike(() => B(fake('badjson', { 'profile.lang.json': '{ "en": ' })), /JSON|Unexpected|end of/i), 'seeded: a lang file that does not parse fails loudly');
  ok(throwsLike(() => B(fake('notstr', { 'objects.client.js': 'module.exports = { x: 1 };\n' })), /must export a string/), 'seeded: a client that is not a string fails');
  ok(throwsLike(() => B(fake('noroutes', { 'objects.server.js': 'module.exports = {};\n' })), /must export \{routes\}/), 'seeded: a server without routes fails');
  // seeded: a file that exists but exports null is broken, not absent
  ok(throwsLike(() => B(fake('nullc', { 'list.client.js': 'module.exports = null;\n' })), /list\.client\.js must export a string/), 'seeded: a client exporting null fails');
  ok(throwsLike(() => B(fake('nulls', { 'list.server.js': 'module.exports = null;\n' })), /list\.server\.js must export \{routes\}/), 'seeded: a server exporting null fails');
  ok(throwsLike(() => B(fake('nulll', { 'list.lang.json': 'null' })), /list\.lang\.json must hold/), 'seeded: a lang file holding null fails');
  // index.js's own opt (fromDir goes through it, as the literal table does): absent -> undefined; present but faulty -> throws
  {
    const t0 = T.fromDir(path.join(W, 'fake-none'));
    ok(t0[0].c() === undefined && t0[0].l() === undefined && t0[0].s() === undefined, 'opt: an absent part file is undefined (skipped)');
    const t1 = T.fromDir(fake('optdeep', { 'shell.client.js': "require('./missing_dep');\nmodule.exports = '';\n", 'list.client.js': 'module.exports = null;\n' }));
    ok(throwsLike(() => t1[0].c(), /missing_dep/), 'opt: a present part file with a missing module throws');
    ok(t1[1].c() === null, 'opt: a present file exporting null is null, not absent');
  }
  // seeded: the table and sub/ checks
  ok(tableProblems(src.replace("require('./sub/game.lang.json'), './sub/game.lang.json')", "require('./sub/base.lang.json'), './sub/base.lang.json')"), ORDER).some(p => /requires another part/.test(p)), 'seeded: a table line requiring another part\'s file is caught');
  {
    const sw = src.split('\n'), i = sw.findIndex(l => /\{ part: 'list'/.test(l)), j = sw.findIndex(l => /\{ part: 'base'/.test(l));
    if (i >= 0 && j >= 0) { const t = sw[i]; sw[i] = sw[j]; sw[j] = t; }
    ok(tableProblems(sw.join('\n'), ORDER).some(p => /table order/.test(p)), 'seeded: two table lines swapped are caught');
    ok(tableProblems(src.replace("{ part: 'style', c: () => opt(() => require('./sub/style.client')", "{ part: 'style', c: () => opt(() => require(P + 'style.client')"), ORDER).some(p => /literal form/.test(p)), 'seeded: a table line with a computed require is caught');
  }
  ok(subProblems(['.gitkeep', 'shell.client.js', 'zzz.client.js', 'shell.notes.txt'], T.NAMES).length === 2, 'seeded: stray files in sub/ are caught');

  // ---------- 3. part tests: the runner on seeded tests, then every real sub/*.test.js ----------
  {
    const d = fake('tests', {
      'good.test.js': "console.log('ok 1'); console.log('PASS mapviz good (1)');\n",
      'nopass.test.js': "console.log('ok 1'); console.log('all done');\n",
      'exit1.test.js': "console.log('PASS mapviz exit1 (1)'); process.exit(1);\n",
      'other.test.js': "console.log('PASS mapviz good (1)');\n",
    });
    const r = runPartTests(d, path.join(W, 'runner'));
    const by = Object.fromEntries(r.map(x => [x.file, x]));
    ok(by['good.test.js'] && by['good.test.js'].ok, 'runner: a test ending "PASS mapviz <part> (N)" passes', JSON.stringify(by['good.test.js']));
    ok(by['nopass.test.js'] && !by['nopass.test.js'].ok && /last line/.test(by['nopass.test.js'].why), 'seeded: a part test without its PASS line is caught');
    ok(by['exit1.test.js'] && !by['exit1.test.js'].ok && /exit 1/.test(by['exit1.test.js'].why), 'seeded: a part test that exits 1 is caught');
    ok(by['other.test.js'] && !by['other.test.js'].ok, 'seeded: a part test whose PASS line names another part is caught');
  }
  const real = runPartTests(SUB, W);
  for (const r of real) ok(r.ok, 'part test sub/' + r.file + (r.ok ? '' : ': ' + r.why), r.tail);
  console.log('# part tests run: ' + real.length + (real.length ? ' (' + real.map(r => r.file).join(', ') + ')' : ''));
}

// ---------- the layer list is rebuilt once per animation frame and once at the end of the page build (shell drawGroups / flush) ----------
if (ext && ext.script) {
  const fake = require('../../test/fakedom');
  const mkShell = raf => {
    const doc = fake.make(); let made = 0; const make = doc.createElement; doc.createElement = t => { made++; return make(t); };
    const h = (tag, attrs, kids) => {   // tools/gui/page.js h(), same rules
      const e = doc.createElement(tag);
      if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false || k === 'blk' || k === 'box') continue;
        if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }
      if (attrs && attrs.blk != null) { e.setAttribute('data-blk', String(attrs.blk)); e.className = (e.className ? e.className + ' ' : '') + 'blk' + (attrs.box ? ' blc box-' + attrs.box : ''); }
      (kids || []).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
      return e;
    };
    const E = ext.lang.en, tx = (k, p) => { const s = E[k]; return s == null ? k : p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s; };
    const frames = [], win = { matchMedia: () => ({ matches: false }) };
    if (raf === 'queue') win.requestAnimationFrame = f => { frames.push(f); return frames.length; }; else if (raf === 'now') win.requestAnimationFrame = f => f();
    const X = {}, S = { cur: 'mods', sec: {}, mod: '', gameId: 'as64', game: {}, goh: {} };
    new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', ext.script)(
      X, h, tx, () => new Promise(() => {}), S, false, (n, d) => d || '', () => () => {}, doc, win, () => 0, function () {}, () => '', undefined);
    const root = doc.createElement('section'); doc.body.appendChild(root); made = 0;
    const screen = X.mapviz(root);
    const P = { root, screen, frames, built: made, made: () => made, run: () => { let n = 0; while (frames.length && n < 50) { frames.shift()(); n++; } return n; } };
    P.sig = () => root.all().map(e => e.tagName + '|' + Object.keys(e.attrs).sort().map(k => k + '=' + e.attrs[k]).join(',') + '|' + e.className + '|' + (e.children.length ? '' : e.textContent) + '|' + (e.hidden ? 'h' : '') + (e.checked ? 'c' : '')).join('\n');
    P.rows = () => root.all().filter(e => e.attrs['data-layer'] != null);
    P.filt = () => root.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === E['mapviz.shell.filter']);
    P.type = v => { const f = P.filt(); f.value = v; f.fire('input'); };
    return P;
  };
  let Q = null, N = null, Z = null;
  try { Q = mkShell('queue'); N = mkShell('now'); Z = mkShell('none'); } catch (e) { ok(false, 'layer list: the page builds in the fake DOM', e && e.stack); }
  if (Q && N && Z) {
    const total = Q.root.all().length, nRows = Q.rows().length;
    ok(nRows > 20 && typeof Q.screen.flush === 'function', 'layer list: built with every layer row before any frame ran (' + nRows + ' rows), the page has flush()');
    ok(Q.built < total * 2, 'layer list: the build makes the list once, not once per layer (' + Q.built + ' elements made for a page of ' + total + ')');
    ok(Q.built === N.built && Q.built === Z.built && Q.sig() === N.sig() && Q.sig() === Z.sig(), 'layer list: the build is the same with frames, with frames that run at once and with none', Q.built + ' ' + N.built + ' ' + Z.built);
    Q.run(); ok(Q.sig() === N.sig(), 'layer list: the frames left by the build change nothing');
    const m0 = Q.made(), f0 = Q.frames.length, shown = P => P.rows().filter(r => !r.hidden).length;
    for (const v of ['c', 'co', 'cov', 'cove', 'cover']) Q.type(v);
    ok(Q.made() === m0 && Q.frames.length === f0 + 1 && shown(Q) === shown(mkShell('now')), 'layer list: five keys in the filter box ask for one frame and rebuild nothing yet', (Q.made() - m0) + ' ' + (Q.frames.length - f0));
    Q.run(); const m1 = Q.made() - m0;
    for (const v of ['c', 'co', 'cov', 'cove', 'cover']) { N.type(v); Z.type(v); }
    ok(Q.sig() === N.sig() && Q.sig() === Z.sig() && shown(Q) < nRows && shown(Q) > 0, 'layer list: after the frame the list is what five rebuilds gave (' + shown(Q) + ' of ' + nRows + ' rows shown)');
    ok(m1 > 0 && m1 < total, 'layer list: one rebuild for the five keys (' + m1 + ' elements)', m1);
    // flush(): the waiting rebuild runs now, and its frame then finds nothing to do
    Q.type('water'); N.type('water'); const m2 = Q.made();
    Q.screen.flush(); const m3 = Q.made();
    ok(m3 > m2 && Q.sig() === N.sig(), 'layer list: flush() runs the waiting rebuild at once');
    Q.run(); Q.screen.flush();
    ok(Q.made() === m3 && Q.sig() === N.sig(), 'layer list: the frame after a flush, and a flush with nothing waiting, rebuild nothing');
    Q.type(''); N.type(''); Q.run();
    ok(Q.sig() === N.sig() && shown(Q) === shown(N), 'layer list: the filter cleared: the same list again');
  }
} else ok(false, 'index.js gives the page script');

// ---------- the picture cache follows a scratch server folder (index.js cacheRootFor); a normal start keeps the per-user cache ----------
if (ext && ext._t && ext._t.cacheRootFor) {
  const F = ext._t.cacheRootFor, TC = require('../../../lib/toolcache'), TMP = os.tmpdir(), DEF = path.join(TMP, 'arsenal-gui');
  const real = TC.dir('mapviz', { env: {} });
  let env = {};
  ok(F({ tmpRoot: DEF }, env, TMP) === '' && !('ARSENAL_CACHE' in env) && !('ARSENAL_CACHE_MAPVIZ' in env) && TC.dir('mapviz', { env }) === real, 'cache: a normal start (tmpRoot = <temp>/arsenal-gui) keeps the default per-user cache', JSON.stringify(env));
  ok(F({}, env, TMP) === '' && F(null, env, TMP) === '' && F({ tmpRoot: 'rel' }, env, TMP) === '' && !('ARSENAL_CACHE' in env) && !('ARSENAL_CACHE_MAPVIZ' in env), 'cache: no or a relative tmpRoot: the default');
  const scr = path.join(W, 'srv-a'), scr2 = path.join(W, 'srv-b');
  ok(F({ tmpRoot: scr }, env, TMP) === path.join(scr, 'cache') && TC.dir('mapviz', { env }) === path.join(scr, 'cache', 'mapviz'), 'cache: a scratch server folder: <tmpRoot>/cache/mapviz', TC.dir('mapviz', { env }));
  ok(TC.dir('mapviz', { env }) !== real && !TC.dir('mapviz', { env }).toLowerCase().startsWith(path.dirname(real).toLowerCase() + path.sep), 'cache: not under the real per-user cache');
  ok(F({ tmpRoot: scr2 }, env, TMP) === path.join(scr2, 'cache'), 'cache: another scratch server in the same process gets its own');
  ok(F({ tmpRoot: DEF }, env, TMP) === '' && !('ARSENAL_CACHE' in env) && !('ARSENAL_CACHE_MAPVIZ' in env), 'cache: a normal server after a scratch one: the default again');
  env = { ARSENAL_CACHE: path.join(W, 'mine') };
  ok(F({ tmpRoot: scr }, env, TMP) === path.join(W, 'mine') && F({ tmpRoot: DEF }, env, TMP) === path.join(W, 'mine') && env.ARSENAL_CACHE === path.join(W, 'mine'), 'cache: an ARSENAL_CACHE set outside is kept');
  // every route goes through it: a route called with a scratch ctx sees the scratch root
  const keep = process.env.ARSENAL_CACHE, keepV = process.env.ARSENAL_CACHE_MAPVIZ; delete process.env.ARSENAL_CACHE; delete process.env.ARSENAL_CACHE_MAPVIZ;
  try {
    let seen = null;
    const x = ext._t.build([{ part: 'shell', c: () => undefined, l: () => undefined, s: () => ({ routes: { 'GET /api/x/mapviz/t': async (u, b, ctx) => { seen = [process.env.ARSENAL_CACHE_MAPVIZ || '', ctx.tmpRoot, process.env.ARSENAL_CACHE || '']; return { ok: 1 }; } } }) }]);
    const r = x.routes['GET /api/x/mapviz/t'](null, null, { tmpRoot: scr });
    ok(r && typeof r.then === 'function' && seen && seen[0] === path.join(scr, 'cache') && seen[1] === scr && seen[2] === '', 'cache: a route of a scratch server runs with the scratch cache root (mapviz only: ARSENAL_CACHE, the root of every other tool, stays unset)', JSON.stringify(seen));
    x.routes['GET /api/x/mapviz/t'](null, null, { tmpRoot: DEF });
    ok(seen && seen[0] === '', 'cache: a route of a normal server runs with the default root', JSON.stringify(seen));
  } finally { if (keep === undefined) delete process.env.ARSENAL_CACHE; else process.env.ARSENAL_CACHE = keep; if (keepV === undefined) delete process.env.ARSENAL_CACHE_MAPVIZ; else process.env.ARSENAL_CACHE_MAPVIZ = keepV; }
} else ok(false, 'index.js exports _t.cacheRootFor');

if (OWN && !failN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { } }
if (failN) { console.log('FAIL mapviz page: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
console.log('PASS mapviz page (' + pass + ')');
