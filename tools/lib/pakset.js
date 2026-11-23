// pakset: walk every *.pak under a root dir (no vfs/mod chain; e.g. GoH resource/), open(root,{ext}) → {entries,close}; sample(arr,n) even spread per extension; read(e)
// Author: Imperator_Aug (ARSENAL, ia-42ae9ef7)
const fs = require('fs'), path = require('path'), pak = require('./pak');

const extOf = n => { const i = n.lastIndexOf('.'); return i > n.lastIndexOf('/') ? n.slice(i) : ''; };

function findPaks(dir, out) {
  let ds;
  try { ds = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  ds.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const d of ds) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) findPaks(p, out);
    else if (/\.pak$/i.test(d.name)) out.push(p);
  }
  return out;
}

// ext: Set of '.ext' (lowercase) or null = all. dir entries skipped. unreadable paks → .errors [{file, message}]
// entry: {pak, name (lowercase, '/'), key (name rooted at pak dir rel root: GoH resource/entity/x.pak holds x/.. → entity/x/.., PORT-34), size, ent (central dir record), L (pak.list result, fd kept open)}
function open(root, opts) {
  const ext = (opts && opts.ext) || null, entries = [], errors = [], lists = [];
  for (const file of findPaks(root, [])) {
    const pdir = path.relative(root, path.dirname(file)).replace(/\\/g, '/').toLowerCase(), pre = pdir ? pdir + '/' : '';
    let L;
    try { L = pak.list(file); } catch (e) { errors.push({ file, message: e.message }); continue; }
    L.fd = fs.openSync(file, 'r');
    lists.push(L);
    for (const ent of L) {
      if (ent.name.endsWith('/')) continue;
      const name = ent.name.toLowerCase();
      if (ext && !ext.has(extOf(name))) continue;
      entries.push({ pak: file, name, key: pre + name, size: ent.size, ent, L });
    }
  }
  return { entries, errors, close() { for (const L of lists) if (L.fd !== undefined) { try { fs.closeSync(L.fd); } catch (e) {} L.fd = undefined; } } };
}

// per extension, n items spread evenly: index floor(i*len/n); n>=len → all. input order kept inside each extension; → flat array grouped by ext (first-seen order)
function sample(arr, n) {
  const g = new Map();
  for (const e of arr) { const x = extOf(e.name); (g.get(x) || g.set(x, []).get(x)).push(e); }
  const out = [];
  for (const l of g.values()) {
    if (n >= l.length) out.push(...l);
    else for (let i = 0; i < n; i++) out.push(l[Math.floor(i * l.length / n)]);
  }
  return out;
}

function read(e) { return pak.read(e.L, e.ent); }

module.exports = { open, sample, read };
