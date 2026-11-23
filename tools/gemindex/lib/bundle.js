// gemindex bundle: the data folder that ships beside ARSENAL.exe as gemindex/ (lib/load.js finds <exe dir>/gemindex before the Desktop toolkit).
// From the toolkit (or any data folder): guides.json, builtin-faq.json, builtin-edits.json, the page texts unpacked into pages/ (results.json,
// guides.snapshot.json, text/<id>.txt: the toolkit's own crawl layout, plain text so the release gate can read every word), the user's own fetch
// (scrape/) merged on top where it read "ok", a README and manifest.json (file, bytes, sha256; rows, pages, built date). No wall clock: the same
// input gives the same bytes. --pack ships builtin-pages.pack as is instead of pages/ (the zip gate refuses a .pack: not text).
// scan(dir): the zip release gate's text rules (tools/dist/zip.js scanText) over the folder, with counts by kind; it changes nothing.
// Author: Imperator_Aug (ARSENAL, ia-cc6494c5)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const L = require('./load');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const README = (m) => ['# GEM External Index data (gemindex)', '',
  'Read by ARSENAL\'s Guides page and `gemindex` (tools/gemindex). Built with `gemindex bundle` from the GEM External Index and Scraper Toolkit.', '',
  'Where the text came from: link titles, topics and notes were collected for the index from public modding sites, forums, Steam guides,',
  'the Wayback Machine (copies of closed forums) and links posted on Discord servers. The page texts in pages/text/ were fetched from those',
  'public pages by the toolkit\'s scraper (robots.txt obeyed) and are other people\'s words, kept as fetched: credit belongs to their authors,',
  'and each page\'s address is in pages/results.json. Links are not opened or safety-checked by ARSENAL.', '',
  'Index built ' + (m.built || '?') + '. ' + m.rows + ' links, ' + m.pages + ' saved pages (' + m.okPages + ' read well), ' + m.faq + ' FAQ entries. Files and sha256: manifest.json.', ''].join('\r\n');

function walk(dir, base, out) {
  for (const n of fs.readdirSync(dir).sort()) { const p = path.join(dir, n), rel = base ? base + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, rel, out); else out.push(rel); }
  return out;
}

// plan the files: [{name, bytes: Buffer}]
function collect(from, o) {
  const loc = L.probe(from);
  if (!loc) throw Object.assign(new Error('no guides.json in ' + from + ' (or its work/ folder)'), { status: 400 });
  const idx = L.load({ data: loc.dir });
  const files = [];
  const add = (name, buf) => files.push({ name, bytes: Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8') });
  add('guides.json', fs.readFileSync(loc.guides));
  if (loc.faq) add('builtin-faq.json', fs.readFileSync(loc.faq));
  if (loc.edits) add('builtin-edits.json', fs.readFileSync(loc.edits));
  const src = idx.pack(), own = idx.own();
  let pages = 0, okPages = 0, merged = 0;
  if (o.pack) {
    if (!loc.pack) throw Object.assign(new Error('--pack: no builtin-pages.pack in ' + loc.dir), { status: 400 });
    add('builtin-pages.pack', fs.readFileSync(loc.pack));
    const r = idx.results('builtin'); pages = r.length; okPages = r.filter(x => x.verdict === 'ok').length;
  } else if (src || own) {
    let res = src ? idx.results('builtin') : [];
    const take = new Map();   // id -> source of its text
    for (const x of res) if (x && x.id && src.has('text/' + x.id + '.txt')) take.set(x.id, src);
    if (own) {   // the user's own fetch replaces a built-in copy when it read "ok" (scrape.cs UsablePage order), and adds new pages
      const byId = new Map(res.map(x => [x.id, x]));
      for (const x of idx.results('own')) {
        if (!x || !x.id || !own.has('text/' + x.id + '.txt')) continue;
        const had = byId.get(x.id);
        if (had && !(x.verdict === 'ok' || had.verdict !== 'ok')) continue;
        byId.set(x.id, x); take.set(x.id, own); merged++;
      }
      res = [...byId.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      add('pages/results.json', JSON.stringify(res));
      const snap = new Map();
      for (const s of [src, own]) { if (!s) continue; try { for (const r of JSON.parse(s.get('guides.snapshot.json') || '{"rows":[]}').rows || []) snap.set(String(r.url), r); } catch (e) { /* none */ } }
      add('pages/guides.snapshot.json', JSON.stringify({ rows: [...snap.values()] }));
    } else {
      add('pages/results.json', src.bytes('results.json'));
      if (src.has('guides.snapshot.json')) add('pages/guides.snapshot.json', src.bytes('guides.snapshot.json'));
    }
    for (const id of [...take.keys()].sort()) add('pages/text/' + id + '.txt', take.get(id).bytes('text/' + id + '.txt'));
    pages = take.size; okPages = res.filter(x => take.has(x.id) && x.verdict === 'ok').length;
  }
  const g = JSON.parse(fs.readFileSync(loc.guides, 'utf8').replace(/^﻿/, ''));
  const meta = { built: g.built || '', rows: Array.isArray(g.rows) ? g.rows.length : 0, pages, okPages, faq: idx.faq.length, ownMerged: merged };
  add('README.md', README(meta));
  files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const manifest = Object.assign({ tool: 'gemindex bundle', format: 1, layout: o.pack ? 'pack' : 'pages', source: 'GEM External Index and Scraper Toolkit' }, meta,
    { files: files.map(f => ({ file: f.name, bytes: f.bytes.length, sha256: sha(f.bytes) })) });
  files.push({ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest, null, 1) + '\n', 'utf8') });
  return { loc, files, manifest };
}

// bundle({from, out, dry, pack}) -> {out, files, bytes, manifest, wrote}
function bundle(o) {
  if (!o.from || !o.out) throw Object.assign(new Error('bundle needs --from <toolkit or data folder> --out <folder>'), { status: 400 });
  const out = path.resolve(o.out), from = path.resolve(o.from);
  const { files, manifest, loc } = collect(from, o);
  const rel = path.relative(loc.dir, out);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw Object.assign(new Error('--out must be outside the source folder ' + loc.dir), { status: 400 });
  const bytes = files.reduce((a, f) => a + f.bytes.length, 0);
  const res = { out, files: files.length, bytes, manifest, wrote: false };
  if (o.dry) return res;
  const why = require('../../lib/writeguard').refuseWrite(out, { purpose: 'write the gemindex bundle', allowGameMods: false });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  if (fs.existsSync(out)) {
    const had = fs.readdirSync(out);
    if (had.length) {
      let m = null; try { m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')); } catch (e) { m = null; }
      if (!m || m.tool !== 'gemindex bundle') throw Object.assign(new Error('--out is not empty and holds no gemindex bundle: ' + out), { status: 400 });
      for (const f of walk(out, '', [])) fs.rmSync(path.join(out, ...f.split('/')), { force: true });   // only a previous bundle, file by file
      for (const d of ['pages/text', 'pages']) { try { fs.rmdirSync(path.join(out, ...d.split('/'))); } catch (e) { /* not empty or gone */ } }
    }
  }
  for (const f of files) { const p = path.join(out, ...f.name.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.bytes); }
  res.wrote = true;
  return res;
}

// ---- the zip release gate's text rules over a folder
function identities() {
  const ids = new Set();
  try { const u = os.userInfo().username; if (u && u.length >= 3) ids.add(u); } catch (e) { /* none */ }
  try { const g = require('child_process').spawnSync('git', ['config', 'user.name'], { cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf8', windowsHide: true }); if (g.status === 0 && g.stdout.trim().length >= 3) ids.add(g.stdout.trim()); } catch (e) { /* none */ }
  return [...ids];
}
const mask = e => { const [a, d] = e.split('@'); return a.slice(0, 1) + '***@' + d; };
// scan(dir) -> {files, text, findings:{kind:{files, matches, where:{}, examples[]}}, gateRefused, notText[]}
function scan(dir, o) {
  o = o || {};
  const opt = f => { try { return f(); } catch (e) { return null; } };   // tools/dist is not part of the release exe
  const Z = opt(() => require('../../dist/zip.js'));
  if (!Z) throw new Error('scan needs tools/dist/zip.js (the source tree)');
  const pub = o.pubIds || Z.publicIds();
  const ids = o.ids || identities();
  const TEXT = /\.(js|json|txt|yaml|yml|md|set|csv|tsv|html|css)$|(^|\/)(LICENSE|README|NOTICE)[^/]*$/i;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, OK_MAIL = /@(example\.(com|org)|users\.noreply\.github\.com)$/i;
  const USERPATH = /([A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}|\/home\/|\/Users\/)([^\\/\s"'`<>*?|:)\]}]+)/gi;
  const NOT_A_USER = /^(public|default|all users|<[^>]*|\$\{?\w+\}?|%\w+%|you|your|me|name|user|username|\.\.\.?|x|someone|runner)$/i;
  const kinds = {}, k = n => kinds[n] || (kinds[n] = { files: 0, matches: 0, where: {}, examples: [] });
  const res = { dir: path.resolve(dir), files: 0, text: 0, gateRefused: 0, notText: [], findings: kinds };
  const look = (where, bucket, text) => {
    // the collected public texts pass the gate as published (owner's decision, tools/dist/zip.js COLLECTED); the counts below still show what is in them
    const coll = Z.COLLECTED.test('x/gemindex/' + where);
    const hit = coll ? Z.scanText('zip gemindex/' + where, text, ids.filter(i => !pub.includes(i)), false, true) : Z.scanText('zip gemindex/' + where, text, ids, true);
    if (hit.length) res.gateRefused++;
    const em = [...text.matchAll(EMAIL)].map(m => m[0]).filter(x => !OK_MAIL.test(x));
    const up = [...text.matchAll(USERPATH)].filter(m => !NOT_A_USER.test(m[2]));
    const un = ids.filter(id => new RegExp('(^|[^A-Za-z0-9])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)', 'i').test(text));
    for (const [name, list, ex] of [['email', em, x => mask(x)], ['user path', up, m => m[1] + '<name>'], ['local/git user name', un, () => '(the build machine user)']]) {
      if (!list.length) continue;
      const K = k(name); K.files++; K.matches += list.length; K.where[bucket] = (K.where[bucket] || 0) + 1;
      if (K.examples.length < 3) K.examples.push(where + ': ' + ex(list[0]));
    }
  };
  for (const rel of walk(dir, '', [])) {
    res.files++;
    const buf = fs.readFileSync(path.join(dir, ...rel.split('/')));
    if (TEXT.test(rel)) { res.text++; look(rel, rel.startsWith('pages/text/') ? 'page texts (pages/text)' : rel, buf.toString('utf8')); continue; }
    res.notText.push(rel); res.gateRefused++;
    if (/\.pack$/.test(rel)) { const p = L.readPack(path.join(dir, rel)); for (const n of p.names()) look(rel + '!' + n, 'inside ' + rel, p.get(n)); }
  }
  return res;
}

module.exports = { bundle, collect, scan, identities, walk };
