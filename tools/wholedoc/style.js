// wholedoc style: the house look of the ARSENAL whole documents (doctrine atlas, modding guide book, engine document), one module.
// The colours are the GUI's own tokens, read at build time out of tools/gui/page.js (never typed a second time here), so a
// whole document shown inside the Docs page looks like the page around it. Light is the default; dark follows the OS unless the
// html tag says data-theme="light"; data-theme="dark" forces dark (the Docs page writes the attribute before it serves the file).
//   tokens([pageSrc]) -> {light:{name:value}, dark:{name:value}}   throws when page.js has no theme blocks or lacks a NEED token
//   themeCss({light,dark} extra tokens, {media}) -> the three :root blocks (light, OS dark guarded by :root:not([data-theme=light]), forced dark)
//   baseCss() -> body, links, focus rings, code, details/summary: what every whole document shares
//   bookCss() -> long-document screen styles: column width, headings, tables, pre, quotes, lists, contents, cover
//   contrast(a, b) -> WCAG contrast ratio of two #rgb/#rrggbb colours (the tests check the meaning colours with it)
//   FONT, MONO, NEED
// Author: Imperator_Aug (ARSENAL, ia-b47048a4)
const fs = require('fs'), path = require('path');

const PAGE = path.join(__dirname, '..', 'gui', 'page.js');
const NEED = ['bg', 'fg', 'card', 'line', 'line2', 'th', 'hint', 'acc', 'link', 'code', 'pre'];
const FONT = 'system-ui,Segoe UI,sans-serif', MONO = 'Consolas,monospace';

const parse = s => { const o = {}; for (const m of s.matchAll(/--([\w-]+):([^;}]+)/g)) o[m[1]] = m[2].trim(); return o; };
function tokens(src) {
  if (src == null) src = fs.readFileSync(PAGE, 'utf8');
  const L = /:root\{color-scheme:light;([^}]*)\}/.exec(src);
  const M = /@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme=light\]\)\{color-scheme:dark;([^}]*)\}\}/.exec(src);
  const D = /:root\[data-theme=dark\]\{color-scheme:dark;([^}]*)\}/.exec(src);
  if (!L || !M || !D) throw new Error('tools/gui/page.js: the light, OS-dark and forced-dark :root token blocks were not found (GT-37 layout changed?)');
  const light = parse(L[1]), dark = parse(D[1]), media = parse(M[1]);
  for (const k of NEED) if (!light[k] || !dark[k]) throw new Error(`tools/gui/page.js: token --${k} missing in the ${light[k] ? 'dark' : 'light'} block`);
  if (JSON.stringify(media) !== JSON.stringify(dark)) throw new Error('tools/gui/page.js: the OS-dark and forced-dark token blocks differ');
  return { light, dark };
}
const decl = o => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');
function themeCss(extra = {}, opt = {}) {
  const t = tokens(opt.src);
  const L = Object.assign({}, t.light, extra.light || {}), D = Object.assign({}, t.dark, extra.dark || {});
  const css = `:root{color-scheme:light;${decl(L)}}\n` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;${decl(D)}}}\n` +
    `:root[data-theme=dark]{color-scheme:dark;${decl(D)}}\n`;
  return opt.media ? `@media ${opt.media}{\n${css}}\n` : css;
}

function baseCss() {
  return `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 ${FONT};overflow-wrap:break-word}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
a:focus-visible,button:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:2px}
code,kbd,samp,pre{font-family:${MONO}}
code{font-size:.9em;background:var(--code);padding:0 .25em;border-radius:3px}
pre code{background:none;padding:0;font-size:inherit}
summary{cursor:pointer;font-weight:600}
svg{max-width:100%}
[hidden]{display:none!important}
`;
}

// screen look of a long book (guide, engine). Scoped by the caller (build-pdf.js puts it under @media screen; print keeps the PDF look)
function bookCss() {
  return `body{padding:0 16px 48px}
body>*{max-width:50rem;margin-left:auto;margin-right:auto}
h1,h2,h3,h4{font-family:${FONT};color:var(--fg);line-height:1.25;scroll-margin-top:12px}
h1{font-size:1.75rem;margin:0 0 .6em;padding-bottom:.3em;border-bottom:2px solid var(--line)}
h2{font-size:1.3rem;margin:1.6em 0 .5em}h3{font-size:1.08rem;margin:1.3em 0 .4em}h4{font-size:1rem;margin:1.1em 0 .3em}
p{margin:.55em 0}ul,ol{padding-left:1.5em;margin:.5em 0}li{margin:.2em 0}
p,li,td,th{overflow-wrap:anywhere}
hr{border:0;border-top:1px solid var(--line);margin:1.5em 0}
pre{background:var(--pre);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:4px;padding:.6em .8em;
 font-size:13px;line-height:1.45;white-space:pre;overflow-x:auto;max-width:100%}
.tw{overflow-x:auto;max-width:100%;margin:.7em 0}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card)}
th,td{border:1px solid var(--line);padding:.3em .55em;text-align:left;vertical-align:top}
thead th{background:var(--th)}
blockquote{margin:.8em 0;padding:.35em .9em;background:var(--who);border-left:3px solid var(--whol);border-radius:0 4px 4px 0}
blockquote p{margin:.3em 0}
section.chapter,section.intro,section.part,section.toc{padding-top:1.4em;margin-top:2.2em;border-top:1px solid var(--line)}
section.toc{border-top:0;padding-top:0;margin-top:1.6em}
.cover{margin-top:24px;padding:28px 20px;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:4px}
.cover h1{border:0;font-size:2rem;margin:0 0 .3em;padding:0}
.cover .sub{color:var(--hint);font-size:1.05rem}
.cover .parts{margin-top:1em;line-height:1.9}.cover .parts a{font-weight:600}
.cover .rev{margin-top:1.2em;color:var(--hint);font-size:.9rem}
.cover .community{margin-top:.4em;color:var(--hint);font-size:.9rem;overflow-wrap:anywhere}
section.part{text-align:left}
section.part .part-no{font-size:.85rem;letter-spacing:.15em;text-transform:uppercase;color:var(--hint)}
section.part h1{font-size:1.9rem}
section.part .part-list{color:var(--hint);font-size:.9rem}
section.part-iii h3{margin:1em 0 .2em;padding-top:.5em;border-top:1px solid var(--line2);font-size:1rem}
section.part-iii p{margin:.2em 0}
h2.toc-part{font-size:1.15rem;margin:1.2em 0 .4em;padding-bottom:.2em;border-bottom:1px solid var(--line)}
ol.toc{padding-left:1.8em}ol.toc>li{font-weight:600;margin-top:.45em}
ol.toc ul{font-weight:normal;list-style:none;padding-left:.8em;margin:.15em 0 .3em}
ol.toc ul.subs{font-size:.88rem;columns:2 15em;column-gap:1.5em}
ol.toc ul.entries{font:12px/1.5 ${MONO};columns:3 11em;column-gap:1.2em}
ol.toc ul li{break-inside:avoid;margin:0}
.totoc{position:fixed;right:12px;bottom:12px;z-index:3;max-width:none;margin:0;background:var(--card);border:1px solid var(--line);
 border-radius:14px;padding:3px 12px;font-size:13px;box-shadow:0 1px 4px var(--shadow)}
@media (max-width:600px){body{padding:0 12px 48px}h1{font-size:1.45rem}.cover h1{font-size:1.6rem}section.part h1{font-size:1.5rem}}
`;
}

const lum = h => {
  let x = h.replace('#', ''); if (x.length === 3) x = x.split('').map(c => c + c).join('');
  const v = [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

module.exports = { tokens, themeCss, baseCss, bookCss, contrast, FONT, MONO, NEED, PAGE };
