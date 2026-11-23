// atlas: the doctrine pack's one-page atlas, matched to the ARSENAL house look, as a whole document for the Docs page.
//   node tools/wholedoc/atlas.js <pack>/atlas.html [--out] [--check]
// Keeps every section, diagram, details block, table, the filter buttons and their script. Changes only: the page style (GUI tokens
// and fonts from tools/wholedoc/style.js; diagram meaning colours own/enemy/ground/cover/move/fire and the fit classes
// direct/proxy/engine/out kept as meaning, re-picked for the GUI's light and dark backgrounds), the head (Google Fonts link and the
// viewport-fit meta dropped, arsenal-whole and arsenal-source metas added; the source meta names the pack page and its counts, no
// fingerprint) and small exact wording tables: WORDS (terms explained, one first-person sentence), MODWORDS (the third-party mod profile
// named by a description) and SOURCES (source ids the pack cites without a title, shown as fixed labels, with one sentence saying so).
// Deterministic: the same pack file always gives the same bytes. Nothing is written unless the whole result passes the checks.
// --check: exit 1 when the out file differs from what this run would write (nothing written).
// exit 0 ok, 1 --check found a difference, 2 bad call or a pack file whose structure the matcher does not know (nothing written)
// Author: Imperator_Aug (ARSENAL, ia-02271ba6)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const S = require('./style');

const SRC = path.resolve(__dirname, '..', '..');
const OUT = path.join(SRC, 'techdoc', 'doctrine', 'atlas.html');
const PREFIX = '<!doctype html><html lang="en">';

// classes the pack uses today; a class outside this list means the pack grew a part this style does not know: refuse, never guess
const KNOWN = new Set(['path', 'lede', 'meta', 'legend', 'layers', 'layer', 'layer-fig', 'kw', 'chip', 'nat-chip', 'filters', 'fgroup', 'flabel',
  'f', 'on', 'cells', 'cell', 'cell-top', 'cell-text', 'nat', 'fig', 'l2', 'l3', 'refs', 'gaps', 'tag', 'num', 'rules', 'rule', 'why', 'fits',
  'fitpair', 'fit', 'fit-direct', 'fit-proxy', 'fit-engine', 'fit-out', 'tablewrap', 'modern-toggle', 'modern', 'persona', 'lore', 'free',
  'missions', 'mission', 'voices', 'aar', 'dep',
  'g-zone-ground', 'g-zone-cover', 'g-zone-objective', 'g-zone-label', 'g-move', 'g-move-head', 'g-fire', 'g-fire-head', 'g-own', 'g-enemy',
  'g-unit-label', 'g-own-text', 'g-enemy-text', 'g-note', 'g-label']);

// wording table: exact, small, meaning kept. Glosses come from the pack itself (markdown/core.md "Fit:", markdown/personas.md).
// An entry that matches nothing (the pack wording changed) is reported, not fatal.
const WORDS = [
  ['A fit tag says how far the game can express it: <span class="fit fit-direct">direct</span> <span class="fit fit-proxy">proxy</span> <span class="fit fit-engine">engine</span> <span class="fit fit-out">out</span>.</p>',
    'A fit tag says how far the game can express it: <span class="fit fit-direct">direct</span> the game has it, <span class="fit fit-proxy">proxy</span> only approximately, <span class="fit fit-engine">engine</span> depends on the adaptation, <span class="fit fit-out">out</span> skip it.</p>'],
  ['<h2>Compartments</h2><p>Stop at the summary,',
    '<h2>Compartments</h2><p>A compartment is one echelon (the size of the force), one branch (the arm, such as infantry or tanks) and one phase (the kind of fight, such as attack or defense). Stop at the summary,'],
  ['<h2>Personas and missions (larp)</h2>', '<h2>Personas and missions (role-play, "larp")</h2>'],
  ['Traits tagged larp lore are not from the sources', 'Traits tagged larp lore (role-play flavour) are not from the sources'],
  ['Soviet text has mediocre OCR.', 'Soviet text has mediocre OCR (text read by machine from page scans).'],
  ['<p>Schema 1: ', '<p>Schema version 1 holds '],
  ['Money as reserve is my translation,', "Money as reserve is the pack author's own translation,"],
];
// public edition: no third-party mod name. The pack gives that profile no description (markdown/profiles/robz.md holds only its values),
// so it reads "the overhaul mod"; each entry is one wording read in its sentence, numbers and version kept. A string entry replaces every
// copy; a RegExp entry must be global. A mod name left after these is reported (note), so a pack update shows up.
const MODWORDS = [
  [', RobZ no_retreat)', ", the overhaul mod's no_retreat)"],
  ['<b>Gaps:</b> RobZ RecognizeTime', "<b>Gaps:</b> The overhaul mod's RecognizeTime"],
  ['; RobZ idle soldiers never do', "; the overhaul mod's idle soldiers never do"],
  [', RobZ grenade about 90 s)', ", the overhaul mod's grenade about 90 s)"],
  [/<th>RobZ (\d+(?:\.\d+)*)<\/th>/g, '<th>Overhaul mod $1</th>'],
  ['<td>RobZ: your units', '<td>Overhaul mod: your units'],
  ['<small>robz, ', '<small>overhaul mod, '],
];
// the same names the public scan refuses (tools/docgen/docgen.js MODNAME)
const MODNAME = /\b(?:robz\w*|godny\w*|valour\w*|gohfull|refmods?)\b/gi;
// source ids the pack cites without a title. Looked up in the pack (markdown/evidence/*.md, sdk/, README.md, atlas.html): none gives a
// title, so each gets a fixed neutral label; the numbers are fixed here (ids in sorted order), never by order on the page.
const SOURCES = {
  '1b76c86418e4828f': 'Untitled source 1',
  '379071e9b16a29bb': 'Untitled source 2',
  '93af2071ca643e8f': 'Untitled source 3',
  'c0cf2c7e84a77cf0': 'Untitled source 4',
};
const HEXID = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,64}\b/g;   // the public scan's hash shape
// one sentence in "How solid this is", after the Numbers point, when a label was used
const UNTITLED_AT = /(<li><b>Numbers\.<\/b>[^<]*<\/li>)/;
const UNTITLED = '<li><b>Untitled sources.</b> A few sources have no title in the pack, so their citations name them as an untitled source with a fixed number.</li>';

// meaning colours. Values name GUI tokens where one fits (series s1/s2, synk, err, ok, warnfg, hint); the rest are picked for 4.5:1 text
// and 3:1 lines on the GUI card and background colours (tools/wholedoc/test checks the ratios)
const MEANING = {
  light: { own: 'var(--s1)', 'own-ink': 'var(--synk)', 'own-soft': '#e3ecfa', enemy: 'var(--s2)', 'enemy-ink': 'var(--err)', 'enemy-soft': '#f9e1de',
    ground: '#e9ece4', cover: '#cfdcc4', 'zone-ink': '#4a5545', move: 'var(--s1)', fire: 'var(--s2)',
    direct: 'var(--ok)', proxy: 'var(--warnfg)', engine: 'var(--synk)', out: 'var(--hint)' },
  dark: { own: 'var(--s1)', 'own-ink': 'var(--synk)', 'own-soft': '#1d3150', enemy: 'var(--s2)', 'enemy-ink': 'var(--err)', 'enemy-soft': '#45231f',
    ground: '#262b26', cover: '#33422f', 'zone-ink': '#b4bdae', move: 'var(--s1)', fire: 'var(--s2)',
    direct: 'var(--ok)', proxy: 'var(--warnfg)', engine: 'var(--synk)', out: 'var(--hint)' },
};

function css() {
  const F = S.FONT, M = S.MONO;
  return S.themeCss(MEANING) + S.baseCss() + `/* doctrine atlas: GUI cards and tokens; own blue, enemy red, ground and cover as zones, fit classes as tags */
main{max-width:1120px;margin:0 auto;padding:24px 16px 64px;display:grid;grid-template-columns:minmax(0,1fr);gap:36px}
main>header,section,.layer,.cell,.rule,.cell-text,.l2,.l3{grid-template-columns:minmax(0,1fr)}
h1,h2,h3,h4{font-family:${F};line-height:1.2;margin:0;color:var(--fg)}
h1{font-size:clamp(1.8rem,5vw,2.6rem);font-weight:700}
h2{font-size:1.45rem;font-weight:650;border-bottom:2px solid var(--line);padding-bottom:4px}
h3{font-size:1.12rem;font-weight:650}h4{font-size:1rem}
p{margin:0;max-width:72ch}
section{display:grid;gap:14px;min-width:0}section>*{min-width:0}
.lede{font-size:1.08rem}
.meta,.path,.flabel,small,.tag,.refs,.num{font-family:${M};font-size:.78rem;color:var(--hint)}
.path{text-transform:uppercase;letter-spacing:.05em}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-family:${M};font-size:.8rem}
.legend i{display:inline-block;width:22px;height:0;border-top:3px solid;vertical-align:middle;margin-right:6px}
.chip{display:inline-block;font-size:.85rem;border:1px solid var(--line);border-radius:10px;padding:0 8px;margin:0 4px 4px 0;background:var(--chip);color:var(--fg)}
.nat-chip{font-family:${M};font-size:.72rem}
.layers{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}
.layer,.cell,.rule{background:var(--card);border:1px solid var(--line);border-radius:4px;min-width:0}
.layer{display:grid;gap:8px;padding:12px;align-content:start}
.filters{display:grid;gap:6px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5;border-bottom:1px solid var(--line)}
.fgroup{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.flabel{width:64px;flex:0 0 auto}
.f{font:500 .88rem ${F};background:var(--btn);color:var(--fg);border:1px solid var(--btnl);border-radius:3px;padding:2px 9px;cursor:pointer}
.f:hover{background:var(--hov)}
.f.on{background:var(--pri);color:var(--prifg);border-color:var(--pril)}
.cells,.rules{display:grid;gap:14px}
.cell{padding:14px;display:grid;gap:10px}
.cell-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.cell-text{display:grid;gap:8px;align-content:start;min-width:0}
.fig,.layer-fig{min-width:0;border-radius:4px}
svg{width:100%;height:auto;display:block}
details{border-top:1px solid var(--line);padding-top:8px}
summary{font:600 1rem ${F}}
.l2{display:grid;gap:10px;padding-top:8px}
.l3{display:grid;gap:8px;padding-left:20px;margin:8px 0 0;font-size:.92rem}
.gaps,.why{color:var(--hint)}
.rules{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.rule{padding:14px;display:grid;gap:8px;align-content:start}
.rule ul{margin:0;padding-left:18px}
.fits{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.85rem}
.fit{font-family:${M};font-size:.74rem;font-weight:600;border:1px solid currentColor;border-radius:3px;padding:0 4px}
.fit-direct{color:var(--direct)}.fit-proxy{color:var(--proxy)}.fit-engine{color:var(--engine)}.fit-out{color:var(--out)}
.tablewrap{overflow-x:auto;max-width:100%;border:1px solid var(--line);border-radius:4px}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;width:100%;background:var(--card)}
th,td{text-align:left;padding:6px 12px;border-bottom:1px solid var(--line2);font-size:.9rem;vertical-align:top}
thead th{font-weight:650;background:var(--th);border-bottom:1px solid var(--line)}
tbody th{font-weight:400;color:var(--hint)}
.g-zone-ground{fill:var(--ground)}.g-zone-cover{fill:var(--cover)}.g-zone-objective{fill:var(--enemy-soft)}
.g-zone-label{font:500 22px ${M};fill:var(--zone-ink)}
.g-move{stroke:var(--move);stroke-width:3.5;fill:none}.g-move-head{fill:var(--move)}
.g-fire{stroke:var(--fire);stroke-width:2.5;fill:none}.g-fire-head{fill:var(--fire)}
.g-own{fill:var(--own-soft);stroke:var(--own);stroke-width:2}.g-enemy{fill:var(--enemy-soft);stroke:var(--enemy);stroke-width:2}
.g-unit-label{font:600 21px ${F}}.g-own-text{fill:var(--own-ink)}.g-enemy-text{fill:var(--enemy-ink)}
.g-note,.g-label{font:400 23px ${M};fill:var(--fg)}
.tag.free{border:1px solid currentColor;border-radius:3px;padding:0 .3em;white-space:nowrap}
.modern-toggle>summary{margin:.5rem 0}.rule.modern{border-style:dashed}
.tag.lore{color:var(--proxy);border:1px solid var(--proxy);border-radius:3px;padding:0 .3em;background:transparent}
.missions li{margin:.35rem 0}
details.mission{border:1px solid var(--line);border-radius:4px;padding:.5rem .75rem;margin:.5rem 0;background:var(--card)}
details.mission p,details.mission ul{margin:.4rem 0}
.voices td,.voices th{font-size:.85rem}
.aar{border-left:3px solid var(--line);padding-left:.75rem;margin:1rem 0}.aar h4{margin:.75rem 0 .25rem}
b.dep{color:var(--proxy)}
@media (max-width:720px){
 .cell-top{grid-template-columns:minmax(0,1fr)}
 .fgroup{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px}.f{flex:0 0 auto}
}
@media (max-width:420px){main{padding:16px 10px 48px}.cell,.rule,.layer{padding:10px 8px}}
@media print{.filters{position:static}}
`;
}

class Bad extends Error {}
const count = (s, rx) => (s.match(rx) || []).length;
function counts(s) {
  return { sections: count(s, /<section\b/g), svg: count(s, /<svg\b/g), details: count(s, /<details\b/g), h2: count(s, /<h2\b/g),
    h3: count(s, /<h3\b/g), tables: count(s, /<table\b/g), tr: count(s, /<tr\b/g), buttons: count(s, /<button\b/g), cells: count(s, /<article class="cell"/g) };
}
// contract rules 2 and 6 on a finished page: list what would load from outside or touch storage
function leaks(s) {
  const out = [];
  if (/<link\b/i.test(s)) out.push('<link>');
  if (/<(img|iframe|object|embed|audio|video|source)\b/i.test(s)) out.push('an embedded resource element');
  if (/\ssrc\s*=/i.test(s)) out.push('a src= attribute');
  if (/@import/i.test(s)) out.push('@import');
  for (const m of s.matchAll(/url\(\s*(['"]?)([^'")]*)/gi)) if (!/^(#|data:)/i.test(m[2])) { out.push('url(' + m[2] + ')'); break; }
  if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(s)) out.push('browser storage');
  if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/.test(s) || /new\s+(XMLHttpRequest|WebSocket|EventSource)\b/.test(s)) out.push('a network call in script');
  return out;
}

function match(src) {
  src = src.replace(/^﻿/, '');
  if (!src.startsWith(PREFIX)) throw new Bad(`does not start with ${PREFIX}`);
  const mi = src.indexOf('<main>'), me = src.lastIndexOf('</main>');
  if (mi < 0 || me < mi || count(src, /<main\b/g) !== 1) throw new Bad('expected exactly one <main> ... </main>');
  const head = src.slice(PREFIX.length, mi);
  if (count(head, /<style\b/g) !== 1 || count(src, /<style\b/g) !== 1) throw new Bad('expected exactly one <style> block, in the head');
  const title = /<title>([^<]+)<\/title>/.exec(head);
  if (!title) throw new Bad('no <title> in the head');
  // the head may hold only: charset, viewport, the viewport-fit meta, Google Fonts links, title, style
  const rest = head.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<title>[^<]*<\/title>/, '').replace(/<meta charset="utf-8">/, '')
    .replace(/<meta name="viewport" content="[^"]*">/, '').replace(/<meta name="claude:viewport-fit-sides" content="[^"]*">/, '')
    .replace(/<link rel="(?:stylesheet|preconnect)" href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"(?: crossorigin)?>/g, '')
    .replace(/<\/?head>/g, '').trim();
  if (rest) throw new Bad('unexpected head content: ' + rest.slice(0, 120));
  let body = src.slice(mi, me + 7);
  const tail = src.slice(me + 7).trim().replace(/<\/body>\s*<\/html>\s*$/, '').trim();
  const sm = /^<script>([\s\S]*?)<\/script>$/.exec(tail);
  if (!sm) throw new Bad('expected exactly one inline <script> after </main> and nothing else');
  const script = sm[1];
  for (const need of ["querySelectorAll('.cell')", "querySelectorAll('.f')", "getElementById('none')"])
    if (!script.includes(need)) throw new Bad('the filter script no longer has ' + need);
  if (/<script\b/.test(body)) throw new Bad('a <script> inside <main>');
  if (!/<div class="filters">/.test(body) || !/<p id="none"/.test(body)) throw new Bad('no filter bar (div.filters) or no "none" message (p#none)');
  const c0 = counts(body);
  if (!c0.sections || !c0.svg || !c0.cells) throw new Bad(`no sections, diagrams or compartment cells (sections ${c0.sections}, svg ${c0.svg}, cells ${c0.cells})`);
  if (count(body, /<svg\b/g) !== count(body, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+"/g)) throw new Bad('a diagram without the expected <svg xmlns viewBox> root');
  const unknown = new Set();
  for (const m of body.matchAll(/\bclass="([^"]*)"/g)) for (const k of m[1].split(/\s+/)) if (k && !KNOWN.has(k)) unknown.add(k);
  if (unknown.size) throw new Bad('classes the matcher has no style for: ' + [...unknown].sort().join(', '));
  const L = leaks(body + script);
  if (L.length) throw new Bad('the pack page loads or stores something: ' + L.join(', '));
  // wording table (outside the diagrams only: SVG text is labels, never prose)
  const notes = [];
  for (const [from, to] of WORDS) {
    const n = body.split(from).length - 1;
    if (!n) { notes.push('wording: no match for "' + from.replace(/<[^>]+>/g, '').slice(0, 60) + '"'); continue; }
    body = body.split(from).join(to);
  }
  for (const [from, to] of MODWORDS) {
    const n = typeof from === 'string' ? body.split(from).length - 1 : count(body, from);
    if (!n) { notes.push('mod name: no match for "' + String(from).replace(/<[^>]+>/g, '').slice(0, 60) + '"'); continue; }
    body = typeof from === 'string' ? body.split(from).join(to) : body.replace(from, to);
  }
  let labelled = 0;
  body = body.replace(HEXID, id => SOURCES[id] ? (labelled++, SOURCES[id]) : id);
  if (labelled) {
    if (UNTITLED_AT.test(body)) body = body.replace(UNTITLED_AT, '$1' + UNTITLED);
    else notes.push('untitled sources: no "Numbers." point in "How solid this is" to put the sentence after');
  }
  const left = new Set();
  for (const t of [body, script]) for (const m of t.matchAll(HEXID)) left.add((m[0].length === 16 ? 'source id not in the SOURCES table: ' : 'hex token: ') + m[0]);
  for (const t of [body, script]) for (const m of t.matchAll(MODNAME)) left.add('mod name left: "' + t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '"');
  notes.push(...[...left].sort());
  const cssText = css();
  for (const m of body.matchAll(/var\(--([\w-]+)\)/g)) if (!new RegExp('--' + m[1] + ':').test(cssText)) throw new Bad('the page uses var(--' + m[1] + '), which the style does not define');
  const ver = (/Schema (\d+(?:\.\d+)*):/.exec(src) || [, '1'])[1];
  const cs = Object.entries(c0).map(([k, v]) => `${k} ${v}`).join(', ');
  const html = PREFIX + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${title[1]}</title>\n<meta name="arsenal-whole" content="atlas ${ver}">\n` +
    `<meta name="arsenal-source" content="men-of-war-doctrine atlas.html; ${cs}">\n` +
    `<style>\n${cssText}</style>\n</head>\n<body>\n${body}\n<script>${script}</script>\n</body></html>\n`;
  const c1 = counts(html.slice(html.indexOf('<main>')));
  for (const k of Object.keys(c0)) if (c0[k] !== c1[k]) throw new Bad(`the result lost structure: ${k} ${c0[k]} -> ${c1[k]}`);
  const L2 = leaks(html);
  if (L2.length) throw new Bad('the result would load or store something: ' + L2.join(', '));
  return { html, counts: c0, ver, notes };
}

function main(argv) {
  const files = [], o = { out: OUT, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') o.out = path.resolve(argv[++i] || '');
    else if (argv[i] === '--check') o.check = true;
    else if (argv[i].startsWith('--')) { console.error('atlas: unknown option ' + argv[i]); return 2; }
    else files.push(argv[i]);
  }
  if (files.length !== 1) { console.error('usage: node tools/wholedoc/atlas.js <pack>/atlas.html [--out file] [--check]'); return 2; }
  let src;
  try { src = fs.readFileSync(files[0], 'utf8'); } catch (e) { console.error('atlas: cannot read ' + files[0] + ': ' + e.code); return 2; }
  let r;
  try { r = match(src); } catch (e) {
    if (e instanceof Bad) { console.error('atlas: not the doctrine atlas shape this matcher knows (' + e.message + '); nothing written'); return 2; }
    throw e;
  }
  for (const n of r.notes) console.log(n);
  const cs = Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(', ');
  if (o.check) {
    let cur = null; try { cur = fs.readFileSync(o.out, 'utf8'); } catch (e) { /* missing */ }
    if (cur === r.html) { console.log(`atlas: ${path.relative(process.cwd(), o.out)} is up to date (${cs})`); return 0; }
    console.log(`atlas: ${path.relative(process.cwd(), o.out)} ${cur == null ? 'is missing' : 'differs from the matched pack page'}; rerun without --check`);
    return 1;
  }
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  const tmp = o.out + '.tmp';
  fs.writeFileSync(tmp, r.html); fs.renameSync(tmp, o.out);
  console.log(`atlas: wrote ${path.relative(process.cwd(), o.out)} (${(r.html.length / 1024).toFixed(0)} KB, atlas ${r.ver}; ${cs})`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { match, counts, leaks, css, MEANING, WORDS, MODWORDS, MODNAME, SOURCES, HEXID, UNTITLED, PREFIX, Bad };
