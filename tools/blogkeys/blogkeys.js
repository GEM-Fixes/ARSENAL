#!/usr/bin/env node
// blogkeys: for each word (GoH-only data keys from a portdiff census, plus concept words) list the sentences in developer posts and
// guide pages that use it. Local grep, no network. Output holds short snippets, so it stays out of git.
//   node tools/blogkeys/blogkeys.js --census portdiff.json --news news.json [--pages dir] [--concepts words.txt] [--min N] --out hits.json
// news.json: Steam ISteamNews reply {appnews:{newsitems:[{title,contents,date,feedname}]}}. pages: dir of *.txt.
// A key matches as written, and with _ as space. Keys under 4 letters are skipped. Row: {key,n,kinds,posts,hits:[{t,d,s}]}
// Author: Imperator_Aug (ARSENAL, ia-efcbdcc0)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const clean = s => s.replace(/\[\/?[a-z0-9]+(=[^\]]*)?\]/gi, ' ').replace(/https?:\S+/g, ' ').replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ').replace(/\s+/g, ' ');
const sentences = s => clean(s).split(/(?<=[.!?:;])\s+/).filter(x => x.length > 12);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function docs(news, pages) {
  const out = [];
  if (news) for (const n of JSON.parse(fs.readFileSync(news, 'utf8')).appnews.newsitems) out.push({ t: n.title, d: new Date(n.date * 1000).toISOString().slice(0, 10), src: 'news', sents: sentences(n.contents || '') });
  if (pages) for (const f of fs.readdirSync(pages)) if (f.endsWith('.txt')) out.push({ t: f, d: '', src: 'page', sents: sentences(fs.readFileSync(path.join(pages, f), 'latin1')) });
  return out;
}
function keysOf(census, min) {
  const m = new Map();
  for (const [kind, d] of Object.entries(census.diff || {})) for (const r of d.gohOnly || []) {
    const leaf = r.key.split(' > ').pop().trim();
    if (leaf.length < 4 || /^[#*%]|[:/]/.test(leaf)) continue;
    const e = m.get(leaf) || m.set(leaf, { key: leaf, n: 0, kinds: new Set() }).get(leaf);
    e.n += r.n; e.kinds.add(kind);
  }
  return [...m.values()].filter(e => e.n >= min);
}
function scan(words, ds, maxHits = 8) {
  const rows = [];
  for (const w of words) {
    const forms = new Set([w.key, w.key.replace(/_/g, ' ')]);
    const re = new RegExp('(^|[^a-z0-9_])(' + [...forms].map(esc).join('|') + ')($|[^a-z0-9_])', 'i');
    const hits = []; let posts = 0;
    for (const d of ds) {
      let found = false;
      for (const s of d.sents) if (re.test(s)) { if (!found) { found = true; posts++; } if (hits.length < maxHits) hits.push({ t: d.t.slice(0, 50), d: d.d, src: d.src, s: s.slice(0, 220) }); }
    }
    rows.push({ key: w.key, n: w.n, kinds: [...(w.kinds || [])].slice(0, 6), posts, hits });
  }
  return rows.sort((a, b) => b.posts - a.posts || b.n - a.n);
}
function main() {
  const o = { min: 3 }, av = process.argv.slice(2);
  for (let i = 0; i < av.length; i += 2) o[av[i].slice(2)] = av[i + 1];
  if (!o.out || (!o.news && !o.pages)) { console.error('usage: blogkeys.js --census c.json --news n.json [--pages d] [--concepts f] [--min N] --out hits.json'); process.exit(2); }
  const ds = docs(o.news, o.pages);
  const words = o.census ? keysOf(JSON.parse(fs.readFileSync(o.census, 'utf8')), +o.min) : [];
  if (o.concepts) for (const l of fs.readFileSync(o.concepts, 'utf8').split(/\r?\n/)) if (l.trim()) words.push({ key: l.trim(), n: 0, kinds: ['concept'] });
  const rows = scan(words, ds);
  fs.writeFileSync(o.out, JSON.stringify(rows));
  console.log(`blogkeys: ${ds.length} docs, ${words.length} words, ${rows.filter(r => r.posts).length} with hits -> ${o.out}`);
}
if (require.main === module) main();
module.exports = { clean, sentences, keysOf, scan };
