// renames: pair removed files with added files that look like the same file under a new name.
//   scan(buf) -> { keys:Set, elems:Set }   SDL text scan: keys = block key paths "a>b>c"; elems = keys + "path=first 3 value tokens"
//   jaccard(a, b)                          |a n b| / |a u b|
//   nameSim(a, b)                          basename similarity 0..1 (dice on bigrams); tiebreak only
//   pair(removed, added, opts) -> { renames:[{from,to,score,how}], maybes:[{from,to,score,how,why}] }
//     item = { name, ext, crc?, size?, elems?:Set }   elems null = binary / unread (CRC only)
//     score: crc-equal 1; text = jaccard over elems. ranked by score + 0.05*nameSim, assigned one-to-one best first.
//     rename = assigned, score >= hi (0.8), and >= minKeys (3) elems; the rest of the candidates >= lo (0.5) are maybe
//     (assigned below hi, or contested: lost to a better pair for the same file)
//     keys-only fallback: item.keys (Set) on both, key+value under lo, key paths alone >= lo -> maybe 'keys only', never a rename; ranked at half so it never takes a real pair's file
// Author: Imperator_Aug (ARSENAL, ia-aa9e77a9)
function scan(buf) {
  const s = buf.toString('latin1'), keys = new Set(), elems = new Set(), st = [];
  let i = 0;
  const n = s.length;
  const next = () => {   // -> { t:'{'|'}'|'s'|'w', v } | null
    for (;;) {
      while (i < n && s.charCodeAt(i) <= 32) i++;
      if (i >= n) return null;
      const c = s[i];
      if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === '{' || c === '}') { i++; return { t: c }; }
      if (c === '"') {
        let j = i + 1;
        while (j < n && s[j] !== '"' && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
        const v = s.slice(i + 1, j); i = j + 1; return { t: 's', v };
      }
      let j = i;
      while (j < n && s.charCodeAt(j) > 32 && s[j] !== '{' && s[j] !== '}' && s[j] !== '"' && s[j] !== ';') j++;
      if (j === i) { i++; continue; }
      const v = s.slice(i, j); i = j; return { t: 'w', v };
    }
  };
  let tk, top = null;
  while ((tk = next())) {
    if (tk.t === '{') { top = { name: null, toks: [] }; st.push(top); continue; }
    if (tk.t === '}') {
      const f = st.pop(); top = st[st.length - 1] || null;
      if (!f) continue;
      const path = st.map(x => x.name || '*a').concat(f.name || '*a').join('>');
      keys.add(path); elems.add(path);
      if (f.toks.length) elems.add(path + '=' + f.toks.slice(0, 3).join(' '));
      continue;
    }
    if (!top) continue;
    const label = tk.t === 's' ? '*s' : /^[-+.\d]/.test(tk.v) ? '#n' : tk.v.replace(/^[#+]+/, '').toLowerCase();
    if (top.name === null) top.name = label; else top.toks.push(tk.t === 's' ? '"' + tk.v + '"' : tk.v);
  }
  return { keys, elems };
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  const [x, y] = a.size <= b.size ? [a, b] : [b, a];
  let k = 0; for (const e of x) if (y.has(e)) k++;
  return k / (a.size + b.size - k);
}

const base = n => n.slice(n.lastIndexOf('/') + 1).toLowerCase().replace(/\.[^.]*$/, '');
function nameSim(a, b) {
  const x = base(a), y = base(b);
  if (x === y) return 1;
  const g = t => { const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const p = t.slice(i, i + 2); m.set(p, (m.get(p) || 0) + 1); } return m; };
  const A = g(x), B = g(y);
  let k = 0, ta = 0, tb = 0;
  for (const [p, c] of A) { ta += c; k += Math.min(c, B.get(p) || 0); }
  for (const c of B.values()) tb += c;
  return ta + tb ? 2 * k / (ta + tb) : 0;
}

function pair(removed, added, o = {}) {
  const hi = o.hi || 0.8, lo = o.lo || 0.5, minKeys = o.minKeys || 3, maxDf = o.maxDf || 300;
  const cand = [];   // { r, a, score, how, rank }
  const add = (r, a, score, how) => cand.push({ r, a, score, how, rank: (how === 'keys-only' ? 0.5 : 1) * score + 0.05 * nameSim(r.name, a.name) });
  // crc-equal: any file kind
  const byCrc = new Map();
  for (const a of added) if (a.crc !== undefined && a.crc !== null) { const k = a.crc + '/' + a.size; (byCrc.get(k) || byCrc.set(k, []).get(k)).push(a); }
  for (const r of removed) if (r.crc !== undefined && r.crc !== null) for (const a of byCrc.get(r.crc + '/' + r.size) || []) add(r, a, 1, 'crc');
  // text: inverted index of added elems per ext; rare elems pick candidates, jaccard scores them
  const idx = new Map();
  for (const a of added) if (a.elems) for (const e of a.elems) { const k = a.ext + '\0' + e; (idx.get(k) || idx.set(k, []).get(k)).push(a); }
  for (const r of removed) {
    if (!r.elems || !r.elems.size) continue;
    const hit = new Map();
    for (const e of r.elems) { const l = idx.get(r.ext + '\0' + e); if (l && l.length <= maxDf) for (const a of l) hit.set(a, (hit.get(a) || 0) + 1); }
    const top = [...hit].sort((x, y) => y[1] - x[1]).slice(0, 12);
    for (const [a] of top) { const sc = jaccard(r.elems, a.elems); if (sc >= lo) add(r, a, sc, 'keys'); else if (r.keys && a.keys) { const ks = jaccard(r.keys, a.keys); if (ks >= lo) add(r, a, ks, 'keys-only'); } }
  }
  cand.sort((x, y) => y.rank - x.rank);
  const usedR = new Set(), usedA = new Set(), renames = [], maybes = [];
  for (const c of cand) {
    if (usedR.has(c.r) || usedA.has(c.a)) continue;
    usedR.add(c.r); usedA.add(c.a);
    const small = c.how === 'keys' && Math.min(c.r.elems.size, c.a.elems.size) < minKeys;
    const rec = { from: c.r.name, to: c.a.name, score: Math.round(c.score * 1000) / 1000, how: c.how };
    if (c.score >= hi && !small && c.how !== 'keys-only') renames.push(rec); else maybes.push({ ...rec, why: c.how === 'keys-only' ? 'keys only' : small ? 'few keys' : 'low score' });
  }
  for (const c of cand) {   // contested: this file lost its best partner to a better pair
    if (usedR.has(c.r)) continue;
    usedR.add(c.r);
    maybes.push({ from: c.r.name, to: c.a.name, score: Math.round(c.score * 1000) / 1000, how: c.how, why: 'contested' });
  }
  return { renames, maybes };
}

module.exports = { scan, jaccard, nameSim, pair };
