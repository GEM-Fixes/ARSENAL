// wholedoc tests: GUI token sync (page.js vs every built whole document), the whole-document contract on the three files
// (atlas, newest guide, newest engine; a missing built file is listed, not failed), atlas matcher counts on a fixture and on the
// tracked atlas (against its arsenal-source meta; no mod name, no hex token), public-edition wording (mod profile described,
// untitled source ids labelled, unknown id noted), --check, seeded bad pack pages (exit 2, nothing written), meaning colour contrast,
// build-pdf.js (both books into a work folder: contract, print look kept, bad --book). No network, no E: drive, no game.
// Author: Imperator_Aug (ARSENAL, ia-bcd02050)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const S = require('../style'), A = require('../atlas');
const SRC = path.resolve(__dirname, '..', '..', '..'), W = path.join(__dirname, 'work'), FX = path.join(__dirname, 'fx', 'atlas-mini.html');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL: ' + m); } };
const node = (a, o = {}) => spawnSync(process.execPath, a, Object.assign({ encoding: 'utf8', cwd: SRC }, o));
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });

// --- token sync: every token page.js defines must have the same value in the document's three theme blocks
const T = S.tokens();
function themeBlocks(html) {
  const L = /:root\{color-scheme:light;([^}]*)\}/.exec(html), M = /:root:not\(\[data-theme=light\]\)\{color-scheme:dark;([^}]*)\}/.exec(html),
    D = /:root\[data-theme=dark\]\{color-scheme:dark;([^}]*)\}/.exec(html);
  const p = s => { const o = {}; for (const m of s.matchAll(/--([\w-]+):([^;}]+)/g)) o[m[1]] = m[2].trim(); return o; };
  return L && M && D ? { light: p(L[1]), media: p(M[1]), dark: p(D[1]) } : null;
}
function syncErrors(html, t = T) {
  const b = themeBlocks(html); if (!b) return ['no light / OS-dark / forced-dark :root blocks'];
  const e = [];
  for (const k of Object.keys(t.light)) if (b.light[k] !== t.light[k]) e.push(`light --${k}: ${b.light[k]} vs page.js ${t.light[k]}`);
  for (const k of Object.keys(t.dark)) {
    if (b.dark[k] !== t.dark[k]) e.push(`dark --${k}: ${b.dark[k]} vs page.js ${t.dark[k]}`);
    if (b.media[k] !== t.dark[k]) e.push(`OS dark --${k}: ${b.media[k]} vs page.js ${t.dark[k]}`);
  }
  return e;
}
for (const k of S.NEED) ok(T.light[k] && T.dark[k], 'page.js token --' + k);
const pageSrc = fs.readFileSync(S.PAGE, 'utf8');
const mini = A.match(fs.readFileSync(FX, 'utf8'));
ok(syncErrors(mini.html).length === 0, 'fixture atlas in sync with page.js: ' + syncErrors(mini.html).join('; '));
// the check bites: a page.js whose --bg changed disagrees with a document built before the change
const moved = S.tokens(pageSrc.replace(':root{color-scheme:light;--bg:#f4f5f7;', ':root{color-scheme:light;--bg:#f4f5f8;'));
ok(syncErrors(mini.html, moved).some(e => /light --bg/.test(e)), 'a changed page.js token is caught');
ok((() => { try { S.tokens(pageSrc.replace(':root[data-theme=dark]{', ':root[data-x=dark]{')); return false; } catch (e) { return /not found/.test(e.message); } })(), 'page.js without theme blocks refused');

// --- the whole-document contract on one file
const verNum = v => v.split('.').map(Number);
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
function newest(dir, rx) {
  let best = null;
  try { for (const f of fs.readdirSync(dir)) { const m = rx.exec(f); if (m && (!best || newer(m[1], best.v))) best = { f: path.join(dir, f), v: m[1] }; } } catch (e) { /* none */ }
  return best;
}
function contract(file, id, ver) {
  const h = fs.readFileSync(file, 'utf8'), n = path.relative(SRC, file);
  ok(h.startsWith(A.PREFIX), n + ': starts with ' + A.PREFIX);
  ok(A.leaks(h).length === 0, n + ': no network or storage: ' + A.leaks(h).join(', '));
  const m = /<meta name="arsenal-whole" content="([^"]*)">/.exec(h.slice(0, h.indexOf('</head>')));
  ok(m && m[1] === `${id} ${ver}`, `${n}: meta arsenal-whole "${id} ${ver}" (got ${m && m[1]})`);
  ok(h.includes(':root[data-theme=dark]') && h.includes(':root:not([data-theme=light])') && h.includes('prefers-color-scheme:dark'), n + ': both theme selectors and the OS query');
  ok(/<meta name="viewport" content="width=device-width/.test(h), n + ': viewport meta (phone width)');
  ok(h.includes(S.FONT) && h.includes(S.MONO), n + ': GUI body and code fonts');
  const e = syncErrors(h); ok(e.length === 0, n + ': tokens in sync with tools/gui/page.js: ' + e.slice(0, 3).join('; '));
  ok(!/\bhref="(?!#|https?:|mailto:)/.test(h), n + ': links are in-page anchors or web links only');
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]));
  const dead = [...h.matchAll(/href="#([^"]+)"/g)].map(x => x[1]).filter(x => !ids.has(x));
  ok(dead.length === 0, n + ': every #anchor lands: ' + dead.slice(0, 5).join(', '));
  return h;
}
const missing = [];
const atlasFile = path.join(SRC, 'techdoc', 'doctrine', 'atlas.html');
if (fs.existsSync(atlasFile)) {
  const h = contract(atlasFile, 'atlas', (/content="atlas ([^"]+)"/.exec(fs.readFileSync(atlasFile, 'utf8')) || [])[1] || '?');
  const src = /<meta name="arsenal-source" content="[^;"]*; ([^"]*)">/.exec(h);
  ok(src, 'tracked atlas has its arsenal-source counts');
  // public edition: no third-party mod name anywhere, no hex token (hash or source id) in the page or its head meta
  const mn = h.match(A.MODNAME) || [], hx = h.match(A.HEXID) || [];
  ok(mn.length === 0, 'tracked atlas names no third-party mod: ' + mn.slice(0, 3).join(', '));
  ok(hx.length === 0, 'tracked atlas has no 8+ hex token (fingerprint, source id): ' + hx.slice(0, 3).join(', '));
  ok(!/sha256/.test(h.slice(0, h.indexOf('</head>'))), 'tracked atlas head has no fingerprint');
  if (src) {
    const want = Object.fromEntries(src[1].split(', ').map(x => x.split(' ')).map(([k, v]) => [k, +v]));
    const got = A.counts(h.slice(h.indexOf('<main>')));
    for (const k of Object.keys(want)) ok(got[k] === want[k], `tracked atlas ${k}: ${got[k]}, pack had ${want[k]}`);
  }
} else missing.push('techdoc/doctrine/atlas.html');
const g = newest(path.join(SRC, 'guide', 'dist'), /^AS2-Modding-Guide-v(\d+(?:\.\d+)*)\.html$/);
if (g) contract(g.f, 'guide', g.v); else missing.push('guide/dist/AS2-Modding-Guide-v*.html');
const en = newest(path.join(SRC, 'techdoc', 'dist'), /^AS64-Engine-Technical-Document-v(\d+(?:\.\d+)*)\.html$/);
if (en) contract(en.f, 'engine', en.v); else missing.push('techdoc/dist/AS64-Engine-Technical-Document-v*.html');
if (missing.length) console.log('not built, contract not checked: ' + missing.join(', '));
ok(newer('2.0', '1.12') && newer('1.12', '1.2') && !newer('1.2', '1.12'), 'newest = highest version number');

// --- atlas matcher on the fixture: counts kept, wording table, deterministic, script kept
const fx = fs.readFileSync(FX, 'utf8'), c0 = A.counts(fx.slice(fx.indexOf('<main>'))), c1 = A.counts(mini.html.slice(mini.html.indexOf('<main>')));
for (const k of ['sections', 'svg', 'details', 'h3', 'tr', 'tables', 'buttons', 'cells']) ok(c0[k] === c1[k] && c0[k] > 0, `fixture ${k}: ${c0[k]} -> ${c1[k]}`);
ok(A.match(fx).html === mini.html, 'matcher is deterministic');
ok(!/fonts\.googleapis|claude:viewport-fit-sides|#eef0e8/.test(mini.html), 'font link, viewport-fit meta and the old paper colour are gone');
ok(mini.html.includes("document.getElementById('none').hidden = shown > 0;"), 'filter script kept');
ok(mini.html.includes('only approximately') && mini.html.includes('A compartment is one echelon'), 'wording table applied');
const wnotes = mini.notes.filter(n => n.startsWith('wording:'));
ok(wnotes.length === A.WORDS.filter(([from]) => !fx.includes(from)).length && wnotes.length > 0, 'wording entries with no match are reported (' + wnotes.length + ')');
ok(mini.notes.filter(n => n.startsWith('mod name: no match')).length === A.MODWORDS.length, 'mod-name entries with no match are reported');
ok(/<meta name="arsenal-whole" content="atlas 1">/.test(mini.html), 'atlas version from "Schema 1"');
ok(mini.html.includes('url(#f-1-move)'), 'in-page marker references kept');

// --- public edition: third-party mod name described, untitled source ids labelled, unknown id noted, no fingerprint in the head
const nHits = (s, rx) => (s.match(rx) || []).length;   // MODNAME and HEXID are global: never .test()
const headOf = h => h.slice(0, h.indexOf('</head>'));
ok(!/sha256/.test(headOf(mini.html)) && nHits(headOf(mini.html), A.HEXID) === 0, 'no fingerprint (hex token) in the head');
ok(/<meta name="arsenal-source" content="men-of-war-doctrine atlas\.html; sections \d+/.test(mini.html), 'arsenal-source meta keeps the pack page name and counts');
const ids = Object.keys(A.SOURCES), labels = Object.values(A.SOURCES);
ok(ids.length > 0 && ids.every(k => /^[0-9a-f]{16}$/.test(k)) && ids.join() === [...ids].sort().join(), 'SOURCES keys are 16-hex ids in sorted order');
ok(labels.every((l, i) => l === 'Untitled source ' + (i + 1)), 'SOURCES labels are numbered in table order: ' + labels.join(', '));
const pubFx = fx.replace('<p>Schema 1: 1 rules.</p>', '<ul><li><b>Numbers.</b> Checked against text.</li></ul>' +
  '<p>Retreat settings (vanilla retreat_ratio, RobZ no_retreat) only steer idle units. <b>Gaps:</b> RobZ RecognizeTime 0.01 makes spotting near instant. ' +
  'Expect leaks; RobZ idle soldiers never do (no_retreat). Smoke life (vanilla about 60 s, RobZ grenade about 90 s).</p>' +
  '<div class="tablewrap"><table><thead><tr><th>Value</th><th>Vanilla</th><th>RobZ 1.30.10</th></tr></thead><tbody><tr><td>RobZ: your units never fall back.</td><td>US<br><small>robz, 2v2</small></td><td>UK<br><small>robz, 8v8</small></td></tr></tbody></table></div>' +
  '<ol><li><small>379071e9b16a29bb, leaf 16</small></li><li><small>93af2071ca643e8f, leaf 186</small></li><li><small>93af2071ca643e8f, leaf 222</small></li><li><small>0123456789abcdef, leaf 1</small></li></ol>' +
  '<p>Schema 1: 1 rules.</p>');
ok(pubFx !== fx, 'public-edition seed changes the fixture');
const pm = A.match(pubFx);
ok(nHits(pubFx, A.MODNAME) === 8 && nHits(pm.html, A.MODNAME) === 0, `no mod name left in the result (${nHits(pubFx, A.MODNAME)} in the seed, ${nHits(pm.html, A.MODNAME)} after)`);
for (const want of ["(vanilla retreat_ratio, the overhaul mod's no_retreat)", "<b>Gaps:</b> The overhaul mod's RecognizeTime 0.01", "; the overhaul mod's idle soldiers never do",
  "(vanilla about 60 s, the overhaul mod's grenade about 90 s)", '<th>Overhaul mod 1.30.10</th>', '<td>Overhaul mod: your units', '<small>overhaul mod, 2v2</small>', '<small>overhaul mod, 8v8</small>'])
  ok(pm.html.includes(want), 'mod profile described, numbers and version kept: ' + want);
ok(pm.html.includes('<small>Untitled source 2, leaf 16</small>') && pm.html.includes('<small>Untitled source 3, leaf 186</small>') && pm.html.includes('<small>Untitled source 3, leaf 222</small>'), 'known source ids shown as their fixed labels');
ok(!/379071e9b16a29bb|93af2071ca643e8f/.test(pm.html), 'known source ids gone from the result');
ok(pm.html.split(A.UNTITLED).length === 2 && pm.html.includes('<li><b>Numbers.</b> Checked against text.</li>' + A.UNTITLED), 'one sentence on untitled sources, after the Numbers point');
ok(pm.notes.includes('source id not in the SOURCES table: 0123456789abcdef') && pm.html.includes('0123456789abcdef, leaf 1'), 'an id not in the table is noted, not changed');
ok(!pm.notes.some(n => /^mod name/.test(n)), 'every mod-name entry matched, nothing left: ' + pm.notes.filter(n => /^mod name/.test(n)).join('; '));
ok(A.match(pubFx).html === pm.html, 'public-edition wording is deterministic');
{ const a = A.counts(pubFx.slice(pubFx.indexOf('<main>'))), b = A.counts(pm.html.slice(pm.html.indexOf('<main>'))); ok(Object.keys(a).every(k => a[k] === b[k]), 'public-edition wording keeps the structure counts'); }
ok(!mini.html.includes(A.UNTITLED), 'no untitled-sources sentence when no label was used');
const left = A.match(pubFx.replace('<p>Schema 1: 1 rules.</p>', '<p>Godny bot here.</p><p>Schema 1: 1 rules.</p>'));
ok(left.notes.some(n => /^mod name left: ".*Godny bot here/.test(n)), 'a mod name no entry covers is noted: ' + left.notes.filter(n => /left/.test(n)).join('; '));
const noNum = A.match(pubFx.replace('<li><b>Numbers.</b> Checked against text.</li>', '<li>Checked.</li>'));
ok(!noNum.html.includes(A.UNTITLED) && noNum.notes.some(n => /^untitled sources: no "Numbers\."/.test(n)), 'no Numbers point: sentence not placed, noted');

// --- CLI: write, --check, seeded bad input
const out = path.join(W, 'atlas.html');
let r = node(['tools/wholedoc/atlas.js', FX, '--out', out]);
ok(r.status === 0 && fs.readFileSync(out, 'utf8') === mini.html, 'cli writes the matched page: ' + r.stdout + r.stderr);
r = node(['tools/wholedoc/atlas.js', FX, '--out', out, '--check']); ok(r.status === 0, '--check up to date exits 0');
fs.appendFileSync(out, ' '); r = node(['tools/wholedoc/atlas.js', FX, '--out', out, '--check']); ok(r.status === 1, '--check on a changed file exits 1');
r = node(['tools/wholedoc/atlas.js', FX, '--out', path.join(W, 'none.html'), '--check']); ok(r.status === 1 && !fs.existsSync(path.join(W, 'none.html')), '--check on a missing file exits 1, writes nothing');
const seeds = {
  'no filter bar': fx.replace('<div class="filters">', '<div class="filterz">'),
  'outside image': fx.replace('<h1>Mini Atlas</h1>', '<h1>Mini Atlas</h1><img src="https://example.invalid/a.png">'),
  'unknown class': fx.replace('<p class="lede">', '<p class="banner">'),
  'not the doctype prefix': fx.replace('<!doctype html><html lang="en">', '<!DOCTYPE html>\n<html>'),
  'storage in script': fx.replace('let shown = 0;', 'let shown = 0; localStorage.x = 1;'),
  'second script': fx.replace('</main>', '</main><script src="x.js"></script>'),
  'svg without viewBox': fx.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480"', '<svg xmlns="http://www.w3.org/2000/svg"'),
  'undefined colour token': fx.replace('border-color:var(--own)', 'border-color:var(--friend)'),
};
for (const [name, text] of Object.entries(seeds)) {
  ok(text !== fx, 'seed changes the page: ' + name);
  const f = path.join(W, 'bad.html'), o = path.join(W, 'bad-out.html');
  fs.writeFileSync(f, text); fs.rmSync(o, { force: true });
  r = node(['tools/wholedoc/atlas.js', f, '--out', o]);
  ok(r.status === 2 && !fs.existsSync(o) && /nothing written/.test(r.stderr), `bad pack page (${name}) exits 2, writes nothing: ${r.status} ${r.stderr.trim()}`);
}
r = node(['tools/wholedoc/atlas.js']); ok(r.status === 2, 'no argument exits 2');
r = node(['tools/wholedoc/atlas.js', path.join(W, 'nope.html')]); ok(r.status === 2, 'unreadable file exits 2');

// --- meaning colours: text 4.5:1 and lines 3:1 on the GUI card and background, light and dark
for (const th of ['light', 'dark']) {
  const tok = T[th], mean = A.MEANING[th];
  const v = k => { let x = mean[k] != null ? mean[k] : tok[k]; for (let i = 0; i < 4 && /^var\(--/.test(x); i++) { const n = /^var\(--([\w-]+)\)$/.exec(x)[1]; x = mean[n] != null ? mean[n] : tok[n]; } return x; };
  const need = (a, b, min) => { const c = S.contrast(v(a), v(b)); ok(c >= min, `${th}: ${a} on ${b} ${c.toFixed(2)} >= ${min}`); };
  for (const bg of ['card', 'bg']) { for (const k of ['enemy', 'direct', 'proxy', 'engine', 'out', 'fg', 'own-ink']) need(k, bg, 4.5); need('own', bg, 3); }
  need('own-ink', 'own-soft', 4.5); need('enemy-ink', 'enemy-soft', 4.5); need('zone-ink', 'ground', 4.5); need('zone-ink', 'cover', 4.5); need('zone-ink', 'enemy-soft', 4.5);
  for (const z of ['ground', 'cover', 'card']) { need('fg', z, 4.5); need('move', z, 3); need('fire', z, 3); }
  need('move', 'enemy-soft', 3); need('fire', 'enemy-soft', 3); need('own', 'own-soft', 3); need('enemy', 'enemy-soft', 3);
}

// --- build-pdf.js: both books, html only, into the work folder
for (const [book, id, rx] of [['guide', 'guide', /^AS2-Modding-Guide-v(\d+(?:\.\d+)*)\.html$/], ['engine', 'engine', /^AS64-Engine-Technical-Document-v(\d+(?:\.\d+)*)\.html$/]]) {
  const d = path.join(W, book);
  r = node(['guide/build-pdf.js', ...(book === 'guide' ? [] : ['--book', book]), '--html-only', '--out', d]);
  ok(r.status === 0, `build-pdf ${book}: ` + r.stdout + r.stderr);
  const f = newest(d, rx);
  ok(f, `build-pdf ${book} wrote its html`);
  if (!f) continue;
  const h = contract(f.f, id, f.v);
  ok(/@media print \{[\s\S]*Georgia[\s\S]*#12324a[\s\S]*\}/.test(h) && /@page \{ size: A4/.test(h), `${book}: print look (Georgia, navy, A4) kept`);
  ok(/@media screen\{\s*:root\{color-scheme:light;/.test(h), `${book}: house tokens only on screen`);
  ok(!/&lt;!--/.test(h), `${book}: no comment printed as text`);
  ok(/<section class="toc" id="contents">/.test(h) && /class="totoc" href="#contents"/.test(h), `${book}: contents and the way back to it`);
}
const parts = h => [...h.matchAll(/<section class="chapter part-(\w+)"><h1 id="f-([^"]+)"/g)].map(m => m[2]);
const ef = newest(path.join(W, 'engine'), /^AS64-Engine-Technical-Document-v(\d+(?:\.\d+)*)\.html$/);
if (ef) {
  const order = parts(fs.readFileSync(ef.f, 'utf8'));
  ok(/^01-/.test(order[0]) && /^A-/.test(order[order.length - 2]) && /^B-/.test(order[order.length - 1]), 'engine order: 01.. then A, B: ' + order.join(' '));
}
r = node(['guide/build-pdf.js', '--book', 'nosuch', '--html-only', '--out', path.join(W, 'x')]);
ok(r.status === 1 && /--book must be one of guide, engine/.test(r.stderr), 'unknown --book refused');

fs.rmSync(W, { recursive: true, force: true });
console.log(`${fails ? 'FAIL' : 'PASS'}: wholedoc ${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
