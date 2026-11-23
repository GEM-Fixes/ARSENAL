'use strict';
// whole documents: the shared contract read by docgen (the docs editions), tools/dist/zip.js (release) and tools/dist/enginezip.js
// (engine package). One self-contained HTML file per document, at a fixed path under a docs root; a PDF beside it for two of them:
//   id      whole HTML (under the docs root)                                  pdf beside it
//   atlas (+ none
//   guide   guide/dist/AS2-Modding-Guide-v<ver>.html                            guide/dist/AS2-Modding-Guide-v<ver>.pdf
//   engine <ver>.html <ver>.pdf
// Newest = highest version number (2.0 after 1.12 after 1.2); HTML and PDF are picked each on its own.
// A whole HTML is valid when: at most MAX bytes, starts with exactly PREFIX, carries <meta name="arsenal-whole" content="<id> <ver>">
// in its head (the version equal to the file name's for guide and engine), and loads nothing from the network (no script, style,
// image, frame or font from http(s): or //; links a reader clicks are fine). check() returns the first broken rule, or null.
// Author: Imperator_Aug (ARSENAL, ia-10d8797b)
const fs = require('fs'), path = require('path');

const PREFIX = '<!doctype html><html lang="en">';
const MAX = 32 << 20;   // size sanity limit: the designed atlas is about 1.8 MB, the guide about 2 MB
const WHOLES = [
  { id: 'guide', dir: 'guide/dist', base: 'AS2-Modding-Guide', pdf: true, build: 'node guide/build-pdf.js --html-only' },
  { id: 'engine', dir: 'techdoc/dist', base: 'AS64-Engine-Technical-Document', pdf: true, build: 'node guide/build-pdf.js --book engine --html-only' },
  { id: 'atlas', dir: 'techdoc/doctrine', file: 'atlas.html', readme: 'README.md', build: 'node tools/wholedoc/atlas.js <pack>/atlas.html' },
];
const byId = id => WHOLES.find(w => w.id === id);
const nameRe = (base, ext) => new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-v(\\d+(?:\\.\\d+)*)\\.' + ext + '$');
// version compare: -1/0/1 by number, part by part (1.12 > 1.2, 2.0 > 1.12, 1.2.0 = 1.2)
function cmpVer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
// newest(dir, base, ext) -> {name, file, ver} | null
function newest(dir, base, ext) {
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const re = nameRe(base, ext); let best = null;
  for (const n of names) {
    const m = re.exec(n); if (!m) continue;
    try { if (!fs.statSync(path.join(dir, n)).isFile()) continue; } catch (e) { continue; }
    if (!best || cmpVer(m[1], best.ver) > 0) best = { name: n, file: path.join(dir, n), ver: m[1] };
  }
  return best;
}
// pick(root, w) -> {html: {rel, file, ver}|null, pdf: {rel, file, ver}|null, readme: {rel, file}|null}: what exists at the contract paths
function pick(root, w) {
  const at = r => path.join(root, ...r.split('/'));
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  const out = { html: null, pdf: null, readme: null };
  if (w.file) {
    const r = w.dir + '/' + w.file; if (isFile(at(r))) out.html = { rel: r, file: at(r), ver: null };
    const rr = w.dir + '/' + w.readme; if (w.readme && isFile(at(rr))) out.readme = { rel: rr, file: at(rr) };
    return out;
  }
  const h = newest(at(w.dir), w.base, 'html'); if (h) out.html = { rel: w.dir + '/' + h.name, file: h.file, ver: h.ver };
  if (w.pdf) { const p = newest(at(w.dir), w.base, 'pdf'); if (p) out.pdf = { rel: w.dir + '/' + p.name, file: p.file, ver: p.ver }; }
  return out;
}
const META = /<meta\s+(?:name\s*=\s*["']arsenal-whole["']\s+content\s*=\s*["']([^"']*)["']|content\s*=\s*["']([^"']*)["']\s+name\s*=\s*["']arsenal-whole["'])\s*\/?>/i;
// anything the browser would fetch by itself: an element's src, a stylesheet/icon/preload link, a CSS url() or @import, srcset
const NET = [
  /<(?:script|img|iframe|frame|embed|source|audio|video|track|input|object)\b[^>]*?\s(?:src|data|poster)\s*=\s*["']?\s*(?:https?:)?\/\/[^\s"'>]*/i,
  /<link\b[^>]*?\shref\s*=\s*["']?\s*(?:https?:)?\/\/[^\s"'>]*/i,
  /\ssrcset\s*=\s*["'][^"']*(?:https?:)?\/\/[^\s"',]*/i,
  /url\(\s*["']?\s*(?:https?:)?\/\/[^)"'\s]*/i,
  /@import\s+["']\s*(?:https?:)?\/\/[^"']*/i,
];
// the <meta arsenal-whole> content: '<id> <ver>' -> {id, ver} | null (looked for in the head only)
function meta(text) {
  const head = text.slice(0, Math.max(0, text.search(/<\/head\s*>/i)) || Math.min(text.length, 65536));
  const m = META.exec(head); if (!m) return null;
  const v = (m[1] != null ? m[1] : m[2]).trim().split(/\s+/);
  return { id: v[0] || '', ver: v[1] || '' };
}
// check(buf, id, ver) -> null when valid, else the rule it breaks (one line)
function check(buf, id, ver) {
  if (buf.length > MAX) return `larger than the ${MAX >> 20} MB sanity limit (${buf.length} B)`;
  if (buf.slice(0, PREFIX.length).toString('latin1') !== PREFIX) return `does not start with ${PREFIX}`;
  const text = buf.toString('utf8'), m = meta(text);
  if (!m) return 'no <meta name="arsenal-whole" content="<id> <version>"> in its head';
  if (m.id !== id) return `its arsenal-whole meta names "${m.id}", not ${id}`;
  if (!m.ver) return 'its arsenal-whole meta has no version';
  if (ver && cmpVer(m.ver, ver) !== 0) return `its arsenal-whole meta says version ${m.ver}, the file name ${ver}`;
  for (const re of NET) { const n = re.exec(text); if (n) return `loads from the network: ${n[0].slice(0, 100)}`; }
  return null;
}
const checkPdf = buf => (buf.slice(0, 5).toString('latin1') === '%PDF-' ? null : 'not a PDF file (no %PDF- at the start)');
// visible text of a whole HTML, one line per block element: scripts, styles, comments and tags out, entities decoded
function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:p|br|li|h[1-6]|div|tr|td|th|pre|section|article|header|footer|nav|aside|table|ul|ol|dl|dt|dd|figure|figcaption|blockquote|title|text|tspan|desc)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ' '; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(+d); } catch (e) { return ' '; } })
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

module.exports = { PREFIX, MAX, WHOLES, byId, nameRe, cmpVer, newest, pick, meta, check, checkPdf, visibleText };
