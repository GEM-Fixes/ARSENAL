// book → one HTML file → PDF via headless Edge/Chrome.
//   node guide/build-pdf.js [--book guide|engine] [--html-only] [--browser exe] [--out dir] [--src root] [--public]
//   --book guide (default): guide/*.md → guide/dist/AS2-Modding-Guide-v<ver>.html/.pdf, version from guide/CHANGELOG.md
//   --book engine:*.md →<ver>.html/.pdf, version
//   --src root: a folder that holds guide/ and in the source layout (default: this repo); --out defaults under it.
//   --public: the public edition (docgen --books runs it on its public tree). No git call and no commit anywhere; the head gets
//     <meta name="arsenal-edition" content="public"> after the arsenal-whole meta; the engine book's part texts say nothing of where
//     its facts come, and its title is the public README's H1. On a root that has (the repo layout) the
//     engine book is read from there with its own CHANGELOG.md, never
// Every page goes through tools/docgen/pub.js strip(): a public build drops the blocks between whole-line `<!-- internal -->` and
// `<!-- /internal -->` (docgen feeds it pages already stripped); an internal build keeps their content and drops the marker lines.
// A bad marker (nested, unclosed, no open block) stops the build: exit 1 with file:line.
// version + date from the top row of the book's CHANGELOG.md, commit from git (marked "+dirty" when the book folder has uncommitted edits;
// printed on the console only).
// guide order: cover, contents, README, Part I (p01..), Part II (01..), Part III (r01..); engine: cover, contents, README, Part I (01..),
// Part II (A-.., B-..), as tools/gui/ext/docs/routes.js BOOKS orders them (by number or letter, then name). Files found by pattern.
// md subset used by the chapters: # headings, - / 1. lists (one nesting level), | tables, ``` fences, > quotes, ---, **b** *i* `code` [t](link);
// whole-line <!-- comments --> are dropped (they hold the author stamp, never text).
// heading ids: "f-<file>" for the title, "f-<file>-<GitHub slug>" below it (duplicates in one file get -1, -2 as on GitHub),
// so [t](r06-weapons-and-ammunition.md#range) and [t](#range) resolve inside the one document.
// The HTML is a whole document for the GUI Docs page (tools/wholedoc): starts with <!doctype html><html lang="en">, one file, no network,
// <meta name="arsenal-whole" content="<book> <ver>">; on screen it has the house look (tools/wholedoc/style.js: GUI tokens, light,
// OS dark, data-theme dark); in print (the PDF) the old look stays: Georgia body, navy headings, A4.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const style = require('../tools/wholedoc/style');
const pub = require('../tools/docgen/pub');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SRC = path.resolve(opt('--src') || path.join(__dirname, '..'));
const PUBLIC = args.includes('--public');
// public engine book: the public set itself on a repo-layout root, else (a public tree) already holds it
const ENGINE_PUB = PUBLIC && fs.existsSync(path.join(SRC, 'techdoc', 'engine-public'));
const COMMUNITY = 'https://discord.gg/pgmfaaBVbf';

const BOOKS = {
  guide: {
    dir: path.join(SRC, 'guide'), changelog: path.join(SRC, 'guide', 'CHANGELOG.md'), dist: path.join(SRC, 'guide', 'dist'),
    base: 'AS2-Modding-Guide', sub: 'A text modding guide for Men of War: Assault Squad 2', sort: 'name',
    parts: [
      { key: 'I', title: 'Part I. By process', rx: /^p(\d\d)-.*\.md$/, subs: 0, unit: 'pages',
        text: 'One job per page, the short way. Each page says what you need, gives the steps (the ARSENAL window way first, then the command way), lists what can go wrong on that job with its fix, and points to the chapter and the reference entries that hold the detail. Start here when you know what you want to make.' },
      { key: 'II', title: 'Part II. In detail', rx: /^(\d\d)-.*\.md$/, subs: 2, unit: 'chapters',
        text: 'How each area of the game works: the install and the mod folder, the data language, units, soldiers, weapons, bots, interaction scripts, missions, maps, text, interface, effects, balance, testing, the tools and release. Read a chapter when a Part I page is not enough, or when you want to know why a change behaves the way it does.' },
      { key: 'III', title: 'Part III. Reference', rx: /^r(\d\d)-.*\.md$/, subs: 3, unit: 'reference pages',
        text: 'Every key and every function, one entry each, always in the same shape: where it is written, its type, the values the game accepts, what it does, its limits, an example and where to read more. Look a name up here when you need its exact facts. Names that no source describes yet are listed at the end of each page.' },
    ],
  },
  engine: {
    dir: path.join(SRC, 'techdoc', ENGINE_PUB ? 'engine-public' : 'engine'), changelog: path.join(SRC, 'techdoc', ...(ENGINE_PUB ? ['engine-public', 'CHANGELOG.md'] : ['CHANGELOG.md'])), dist: path.join(SRC, 'techdoc', 'dist'),
    base: 'AS64-Engine-Technical-Document', sub: 'The engine of the 64-bit Men of War: Assault Squad 2 build', sort: 'key',
    parts: [
      { key: 'I', title: 'Part I. Subsystems', rx: /^(\d+)-.*\.md$/, subs: 2, unit: 'chapters',
        text: PUBLIC ? 'How the engine works, subsystem by subsystem: what each part does step by step, the rules and numbers it follows, what it reads and writes, its limits, and how Gates of Hell differs.'
          : 'How the engine works, subsystem by subsystem. Every statement names the source file and line it was read from.' },
      { key: 'II', title: 'Part II. Appendices', rx: /^([A-Z])-.*\.md$/, subs: 2, unit: 'chapters', text: PUBLIC ? 'Known faults and open questions.' : 'Suspected faults and open questions.' },
    ],
  },
};
const bookId = opt('--book') || 'guide';
const B = BOOKS[bookId];
if (!B) { console.error(`--book must be one of ${Object.keys(BOOKS).join(', ')}`); process.exit(1); }
const dir = B.dir, PARTS = B.parts;
const outDir = path.resolve(opt('--out') || B.dist);

// every page through strip(): public = internal blocks out, internal = their content kept; marker lines and whole-line comments out
const read = f => {
  const s = pub.strip(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'), { file: path.relative(SRC, path.join(dir, f)).split(path.sep).join('/'), keepInternal: !PUBLIC });
  if (s.errors.length) { for (const e of s.errors) console.error(e); process.exit(1); }
  return s.text;
};
const listing = fs.readdirSync(dir).sort();
const keyOf = (p, f) => { const k = p.rx.exec(f)[1]; return /^\d+$/.test(k) ? +k : k; };
for (const p of PARTS) {
  p.files = listing.filter(f => p.rx.test(f));
  if (B.sort === 'key') p.files.sort((a, b) => { const x = keyOf(p, a), y = keyOf(p, b); return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0; });
}
const inBook = new Set(['README.md', ...PARTS.flatMap(p => p.files)]);

if (!fs.existsSync(B.changelog)) { console.error(`${path.relative(SRC, B.changelog)}: missing (it holds the version row)`); process.exit(1); }
const log = fs.readFileSync(B.changelog, 'utf8');
const top = /^\|\s*(\d+\.\d+)\s*\|\s*([\d-]+)\s*\|/m.exec(log);
if (!top) { console.error(`${path.relative(SRC, B.changelog)}: no version row (| 1.0 | YYYY-MM-DD | ... |)`); process.exit(1); }
const [, version, date] = top;
const git = a => (spawnSync('git', a, { cwd: dir, encoding: 'utf8' }).stdout || '').trim();
const commit = PUBLIC ? 'public' : (git(['rev-parse', '--short', 'HEAD']) || 'no-git') + (git(['status', '--porcelain', '--', '.']) ? '+dirty' : '');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// GitHub heading slug: markup dropped, lower case, punctuation other than - and _ removed, spaces to -
const plain = s => s.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
const ghSlug = s => plain(s).trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
const fileId = f => 'f-' + f.replace(/\.md$/, '');
let linksOut = 0;
function inline(s, file) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (all, t, u) => {
      if (/^(https?|mailto):/.test(u)) return `<a href="${u}">${t}</a>`;
      const m = /^([\w.-]+\.md)?(?:#(.*))?$/.exec(u);
      const f = m && (m[1] || file);
      if (!m || !f || !inBook.has(f)) { linksOut++; return t; } // a file outside the book: keep the words only
      return `<a href="#${m[2] ? fileId(f) + '-' + m[2].toLowerCase() : fileId(f)}">${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const LABEL = /^(Where|Type|Values|Does|Limits|Example|See):/;
// one md file → html; heads collects {n, id, h} for the contents
function md(text, file, heads, seen = {}) {
  const L = text.split('\n'), out = [], ref = /^r\d\d-/.test(file);
  let i = 0;
  const para = [];
  const flush = () => {
    if (!para.length) return;
    let h = inline(para.join(' '), file);
    if (ref && LABEL.test(para[0])) h = h.replace(LABEL, '<strong>$1:</strong>').replace(/(\s)Type:/, '$1<strong>Type:</strong>');
    out.push(`<p>${h}</p>`); para.length = 0;
  };
  while (i < L.length) {
    const l = L[i];
    let m;
    if (/^```/.test(l)) {
      flush(); const code = []; i++;
      while (i < L.length && !/^```/.test(L[i])) code.push(L[i++]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); i++; continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
      flush(); const n = m[1].length, h = inline(m[2], file);
      let id = fileId(file);
      if (n > 1) { const b = ghSlug(m[2]); let s = b; if (seen[b] != null) s = b + '-' + ++seen[b]; else seen[b] = 0; id += '-' + s; }
      if (heads) heads.push({ n, id, h });
      out.push(`<h${n} id="${id}">${h}</h${n}>`); i++; continue;
    }
    if (/^\s*$/.test(l)) { flush(); i++; continue; }
    if (/^---+\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^\|/.test(l)) {
      flush(); const rows = [];
      while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      const cells = r => r.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => inline(c.trim().replace(/\\\|/g, '|'), file));
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+$/.test(r)));
      // the div lets a wide table scroll sideways on a phone screen; print has no rule for it
      out.push('<div class="tw"><table><thead><tr>' + cells(body[0]).map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        body.slice(1).map(r => '<tr>' + cells(r).map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^>/.test(l)) {
      flush(); const q = [];
      while (i < L.length && /^>/.test(L[i])) q.push(L[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(q.join('\n'), file, null, seen)}</blockquote>`); continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      flush();
      // list block: items at the base indent; deeper-indented lines and continuations belong to the previous item
      const base = /^\s*/.exec(l)[0].length, ordered = /^\s*\d+\./.test(l), items = [];
      while (i < L.length) {
        const x = L[i], ind = /^\s*/.exec(x)[0].length;
        if (/^\s*$/.test(x)) { const nx = L[i + 1] || ''; if (/^\s*([-*]|\d+\.)\s+/.test(nx) && /^\s*/.exec(nx)[0].length >= base) { i++; continue; } break; }
        if (ind === base && /^\s*([-*]|\d+\.)\s+/.test(x)) items.push([x.replace(/^\s*([-*]|\d+\.)\s+/, '')]);
        else if (ind > base || !/^\s*([-*]|\d+\.|#|\||>|```)/.test(x)) items[items.length - 1].push(ind > base ? x.slice(Math.min(ind, base + 2)) : x);
        else break;
        i++;
      }
      const start = ordered ? (/^\s*(\d+)\./.exec(l)[1]) : null;
      out.push((ordered ? `<ol${start !== '1' ? ` start="${start}"` : ''}>` : '<ul>') + items.map(it => {
        const sub = it.findIndex((x, k) => k > 0 && /^\s*([-*]|\d+\.)\s+/.test(x));
        const head = inline((sub < 0 ? it : it.slice(0, sub)).join(' '), file);
        return `<li>${head}${sub < 0 ? '' : md(it.slice(sub).join('\n'), file, null, seen)}</li>`;
      }).join('') + (ordered ? '</ol>' : '</ul>'));
      continue;
    }
    // a reference entry puts each labelled line (Where, Values, Does, ...) in its own paragraph
    if (ref && LABEL.test(l)) flush();
    para.push(l.trim()); i++;
  }
  flush();
  // reference entry: keep the heading with its first lines (Where/Type, Values) on one page
  if (ref) {
    for (let k = out.length - 1; k >= 0; k--) {
      if (!/^<h3 /.test(out[k])) continue;
      let e = k + 1; while (e < out.length && e - k <= 2 && /^<p>/.test(out[e])) e++;
      out.splice(k, e - k, `<div class="entry-head">${out.slice(k, e).join('\n')}</div>`);
    }
  }
  return out.join('\n');
}

const titleOf = f => /^#\s+(.*)$/m.exec(read(f))[1];
const sections = [];
sections.push(`<section class="intro">${md(read('README.md'), 'README.md', null)}</section>`);
for (const p of PARTS) {
  p.id = 'part-' + p.key.toLowerCase();
  sections.push(`<section class="part" id="${p.id}"><div class="part-no">${esc(p.title.split('. ')[0])}</div><h1>${esc(p.title.split('. ').slice(1).join('. '))}</h1><p>${esc(p.text)}</p>` +
    `<p class="part-list">${p.files.length} ${p.unit}</p></section>`);
  p.toc = p.files.map(f => { const heads = []; sections.push(`<section class="chapter part-${p.key.toLowerCase()}">${md(read(f), f, heads)}</section>`); return { f, heads }; });
}
const tocHtml = '<section class="toc" id="contents"><h1>Contents</h1>' + PARTS.map(p => {
  const items = p.toc.map(({ heads }) => {
    const h1 = heads.find(h => h.n === 1); if (!h1) return '';
    let subs = '';
    if (p.subs === 2) subs = `<ul class="subs">${heads.filter(h => h.n === 2).map(s => `<li><a href="#${s.id}">${s.h}</a></li>`).join('')}</ul>`;
    if (p.subs === 3) subs = `<ul class="entries">${heads.filter(h => h.n === 3).map(s => `<li><a href="#${s.id}">${s.h}</a></li>`).join('')}</ul>`;
    return `<li><a href="#${h1.id}">${h1.h}</a>${subs}</li>`;
  }).join('');
  return `<h2 class="toc-part"><a href="#${p.id}">${esc(p.title)}</a></h2><ol class="toc toc-${p.key.toLowerCase()}">${items}</ol>`;
}).join('') + '</section>';
const title = titleOf('README.md');

// print look: the PDF as it has always been (only applies in print, so the screen look below cannot change it)
const printCss = `
section.chapter, section.front, section.toc, section.intro, section.part { break-before: page; }
body { font: 10.5pt/1.5 Georgia, "Times New Roman", serif; color: #1d1d1f; }
h1, h2, h3 { font-family: "Segoe UI", Arial, sans-serif; color: #12324a; line-height: 1.25; break-after: avoid; }
h1 { font-size: 22pt; border-bottom: 2px solid #12324a; padding-bottom: 6pt; margin-top: 0; }
h2 { font-size: 14pt; margin-top: 18pt; } h3 { font-size: 11.5pt; margin-top: 14pt; }
section.part { padding-top: 70mm; font-family: "Segoe UI", Arial, sans-serif; }
section.part .part-no { font-size: 13pt; letter-spacing: 2pt; text-transform: uppercase; color: #456; }
section.part h1 { font-size: 30pt; } section.part p { font: 12pt/1.6 Georgia, serif; max-width: 140mm; }
section.part .part-list { color: #777; font-size: 10pt; }
section.part-iii h3 { font-size: 10.5pt; margin: 10pt 0 2pt; border-top: 1px solid #dde2e7; padding-top: 4pt; }
section.part-iii p { margin: 2pt 0; }
.entry-head { break-inside: avoid; }
code { font: 9pt Consolas, "Courier New", monospace; background: #f1f3f5; padding: 0 2px; border-radius: 2px; }
pre { background: #f6f8fa; border: 1px solid #dde2e7; border-left: 3px solid #12324a; padding: 7pt 9pt; white-space: pre-wrap; word-break: break-all; break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9pt; break-inside: auto; }
th, td { border: 1px solid #cfd6dd; padding: 3pt 5pt; vertical-align: top; text-align: left; }
th { background: #e8eef3; } tr { break-inside: avoid; }
blockquote { margin: 8pt 0; padding: 4pt 10pt; background: #fff8e6; border-left: 3px solid #d9a400; }
a { color: #1a5c8a; text-decoration: none; }
h2.toc-part { font-size: 15pt; margin-top: 16pt; border-bottom: 1px solid #12324a; }
section.toc h2.toc-part:not(:first-of-type) { break-before: page; }
ol.toc > li { font-family: "Segoe UI", Arial, sans-serif; font-weight: 600; margin-top: 5pt; }
ol.toc ul { font-weight: normal; list-style: none; padding-left: 10pt; margin: 2pt 0; }
ol.toc ul.subs { font-size: 9pt; column-count: 2; column-gap: 14pt; }
ol.toc ul.entries { font: 7.5pt/1.35 Consolas, "Courier New", monospace; column-count: 3; column-gap: 12pt; margin-bottom: 6pt; }
ol.toc ul.entries li { break-inside: avoid; overflow-wrap: anywhere; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; text-align: center; font-family: "Segoe UI", Arial, sans-serif; }
.cover h1 { border: none; font-size: 32pt; margin-bottom: 10pt; }
.cover .sub { font-size: 13pt; color: #456; } .cover .parts { margin-top: 14mm; font-size: 11pt; color: #345; line-height: 1.8; }
.cover .parts a { color: inherit; }
.cover .rev { margin-top: 40mm; font-size: 10pt; color: #555; line-height: 1.8; }
.cover .community { margin-top: 4mm; font-size: 11pt; color: #555; } .cover .community a { font-weight: 600; text-decoration: underline; }
.totoc { display: none; }
`;
const css = `
@page { size: A4; margin: 20mm 18mm 22mm; @bottom-center { content: counter(page); font: 9pt Georgia, serif; color: #777; }
  @bottom-right { content: "v${version}"; font: 8pt Georgia, serif; color: #aaa; } }
@page :first { @bottom-center { content: none; } @bottom-right { content: none; } }
@media print {${printCss}}
${style.themeCss({}, { media: 'screen' })}@media screen {
${style.baseCss()}${style.bookCss()}}
`;
// every in-book link must land on an id; an anchor written in another slug style (as64-core for as64/core) is matched
// loosely and counted, one with no target is listed so the chapter can be fixed
const body = `${tocHtml}\n${sections.join('\n')}`;
const ids = new Set([...body.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
const loose = s => s.replace(/[^\p{L}\p{N}]/gu, '');
const looseIds = new Map([...ids].map(x => [loose(x), x]));
let fuzzy = 0; const dead = new Set();
const linked = body.replace(/href="#([^"]+)"/g, (all, x) => {
  if (ids.has(x)) return all;
  const y = looseIds.get(loose(x)); if (y) { fuzzy++; return `href="#${y}"`; }
  dead.add(x); return all;
});
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="arsenal-whole" content="${bookId} ${version}">${PUBLIC ? '<meta name="arsenal-edition" content="public">' : ''}<title>${esc(title)} v${version}</title><style>${css}</style></head><body>
<div class="cover"><h1>${esc(title)}</h1><div class="sub">${esc(B.sub)}</div>
<div class="parts">${PARTS.map(p => `<a href="#${p.id}">${esc(p.title)}</a>`).join('<br>')}</div>
<div class="rev">Version ${version} &middot; ${date}</div>
<div class="community"><a href="${COMMUNITY}">Join The AS64 Community!</a> ${COMMUNITY}</div></div>
${linked}
<a class="totoc" href="#contents">Contents</a>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const base = `${B.base}-v${version}`;
const htmlFile = path.join(outDir, base + '.html');
fs.writeFileSync(htmlFile, html);
const counts = PARTS.map(p => `${p.key}: ${p.files.length}`).join(', ');
console.log(`html: ${htmlFile} (${counts}; v${version}, ${commit}${linksOut ? `; ${linksOut} links to files outside the book printed as text` : ''})`);
if (fuzzy) console.log(`links: ${fuzzy} anchors matched loosely (not the GitHub heading slug; fix in the page)`);
if (dead.size) console.log(`links: ${dead.size} anchors with no heading: ${[...dead].join(', ')}`);
if (args.includes('--html-only')) process.exit(0);

// browser: --browser, else env ARSENAL_BROWSER, the usual install folders, then PATH (tools/gui/browser.js)
const exe = (opt('--browser') && fs.existsSync(opt('--browser')) ? opt('--browser') : null) || require('../tools/gui/browser').find();
if (!exe) { console.error('no Edge/Chrome found: pass --browser <exe> or set env ARSENAL_BROWSER, or print the html file from a browser'); process.exit(1); }
const pdf = path.join(outDir, base + '.pdf');
if (fs.existsSync(pdf)) fs.unlinkSync(pdf); // a rerun overwrites; a failed print never leaves the old file looking new
const r = spawnSync(exe, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, 'file:///' + htmlFile.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 300000 });
// on Windows the Edge launcher can return before its headless child has written the file: wait until the size holds still (at most 5 min)
const nap = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let t = 0, last = -1; t < 300; t++) {
  const sz = fs.existsSync(pdf) ? fs.statSync(pdf).size : -1;
  if (sz > 0 && sz === last) break;
  last = sz; nap(1000);
}
if (!fs.existsSync(pdf)) { console.error('pdf failed:', r.stderr || r.error || 'no file written'); process.exit(1); }
const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
console.log(`pdf:  ${pdf} (${(fs.statSync(pdf).size / 1024).toFixed(0)} KB, ${pages || '?'} pages)`);
