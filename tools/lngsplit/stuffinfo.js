// stuffinfo: which stuff file a desc/ammo|weapon|stuff key belongs to, for the lngsplit layout and its context lines.
//   read({ modDir, gameDir, exe, cacheDir, log }) -> { fileOf(lkey) -> stuff rec | null, ctx(rec) -> string, route(rec) -> {nation, kind} }
//   key -> file: desc/<kind>/<words>; the words equal a stuff file's file-name tags minus grenade/pattern/ammo/weapon (engine tags
//   /:128), else a {desc "key"} field, else the first file whose wide word pool holds every word (dead.js rule) [I].
//   kind = folder under set/stuff (shell, rifle, smg, ..); nation = a side token in the file-name tags or {tag} words, else 'common'.
//   calibre: "NNxNN" / "NNmm" in the name, tags or a leading comment; weight: {inventory {weight N}} or {mass N}.
//   users: weapons whose {filling "tags" n} / {ammo "tags"} finds this ammo (file-name tags, patterns skipped: engine FindStuff) [I].
// Author: Imperator_Aug (ARSENAL, ia-af4f2eff)
const fs = require('fs'), path = require('path');
const lc = s => String(s).toLowerCase();
const SKIP = new Set(['grenade', 'pattern', 'ammo', 'weapon']);
const NATIONS = ['ger', 'rus', 'usa', 'eng', 'jap', 'fra', 'hun', 'ita', 'fin', 'pol', 'rom', 'chi', 'usmc', 'ger2', 'ger_ss', 'axis_minor', 'brit', 'us', 'uk', 'germany', 'russia', 'japan', 'italy', 'hungary', 'romania', 'france', 'finland', 'poland', 'china'];
const NMAP = { us: 'usa', uk: 'eng', brit: 'eng', germany: 'ger', russia: 'rus', japan: 'jap', italy: 'ita', hungary: 'hun', romania: 'rom', france: 'fra', finland: 'fin', poland: 'pol', china: 'chi' };
const cap = (a, n) => a.length <= n ? a.join(', ') : a.slice(0, n).join(', ') + ` +${a.length - n} more`;

function extract(buf) {
  const s = buf.toString('latin1'), d = /\{\s*desc\s+"([^"]*)"/i.exec(s), macros = [], tags = [], fill = [];
  for (const m of s.matchAll(/\(\s*"([^"]+)"/g)) macros.push(lc(m[1]));
  for (const m of s.matchAll(/\{\s*tag((?:\s+"[^"]*")+)/gi)) for (const q of m[1].matchAll(/"([^"]*)"/g)) tags.push(...lc(q[1]).split(/\s+/).filter(Boolean));
  for (const m of s.matchAll(/\{\s*(?:filling|ammo)\s+"([^"]+)"/gi)) fill.push(lc(m[1]));
  const w = /\{\s*weight\s+([\d.]+)/i.exec(s) || /\{\s*mass\s+([\d.]+)/i.exec(s);
  const head = (/^\s*;+\s*\/*\s*([^\r\n]{1,40})/.exec(s) || [])[1] || '';
  return { desc: d ? d[1] : null, macros, tags, fill, weight: w ? w[1] : null, head };
}
const CAL = /(\d+(?:[.,_-]\d+)?x\d+(?:[.,]\d+)?(?:mm)?r?|\d+(?:[.,]\d+)?\s?mm)/i;

function read(o) {
  const ix = require('../entityindex/index');
  const cache = path.join(o.cacheDir, 'entityindex.' + require('crypto').createHash('md5').update(path.resolve(o.gameDir) + '|' + path.resolve(o.modDir) + '|' + (o.exe || '')).digest('hex').slice(0, 8) + '.json');
  fs.mkdirSync(o.cacheDir, { recursive: true });
  const b = ix.build({ gameDir: o.gameDir, folder: o.modDir, exe: o.exe, allowUnmounted: true, cache,
    aux: { lngsplit_stuff3: { raw: true, select: k => k.startsWith('resource/set/stuff/'), extract } } });
  const idx = b.idx, recs = new Map(), bySet = new Map(), byDesc = new Map(), pools = [];
  for (const k of Object.keys(idx.stuff)) {
    const st = idx.stuff[k], x = (idx.aux.lngsplit_stuff3 && idx.aux.lngsplit_stuff3[k] || {}).data || {};
    const name = st.name || k.slice(k.lastIndexOf('/') + 1), ft = [...idx.fileTagsOf(k)];
    const rel = k.replace(/^resource\/set\/stuff\//, ''), kind = rel.includes('/') ? lc(rel.split('/')[0]).replace(/^-/, '').replace(/\.pattern$/, '') : 'misc';
    const words = [...ft, ...(x.tags || [])].map(lc);
    let nat = words.find(w => NATIONS.includes(w));
    if (!nat) for (const w of lc(name).split(/[._]/)) if (NATIONS.includes(w)) { nat = w; break; }
    nat = nat ? (NMAP[nat] || nat) : 'common';
    const calM = CAL.exec(lc(name)) || CAL.exec((x.tags || []).join(' ')) || CAL.exec(x.head || '');
    const r = { key: k, rel, name: lc(name).replace(/\.(weapon|ammo|stuff|item)$/, ''), kind, nation: nat, cal: calM ? calM[1].replace(/_/g, '.') : null, weight: x.weight || null, fill: x.fill || [], users: [], ammo: [] };
    recs.set(k, r);
    const set = ft.filter(t => !SKIP.has(t)).sort().join(' ');
    if (!bySet.has(set)) bySet.set(set, r);
    if (x.desc && !byDesc.has(lc(x.desc))) byDesc.set(lc(x.desc), r);
    const parts = lc(name).split('.').filter(Boolean), pool = new Set([...parts, ...idx.tagsOf(k)]);
    for (let i = 0; i < parts.length; i++) for (let j = i + 2; j <= parts.length; j++) pool.add(parts.slice(i, j).join('_'));
    for (const w of [...(x.tags || []), ...(x.macros || [])]) pool.add(w);
    pools.push([pool, r]);
  }
  // weapon -> ammo it takes, ammo -> weapons that use it
  for (const r of recs.values()) for (const t of r.fill) {
    let hits = []; try { hits = idx.stuffFind(t); } catch { hits = []; }
    for (const h of hits) { const a = recs.get(h); if (!a || a === r) continue; if (!r.ammo.includes(a.name)) r.ammo.push(a.name); if (!a.users.includes(r.name)) a.users.push(r.name); }
  }
  // nation of a file with no side token [I]: weapon <- the ammo it takes, then ammo <- the weapons that use it (majority, ties: first)
  const byName = new Map([...recs.values()].map(x => [x.name, x]));
  const vote = names => { const c = new Map(); for (const nm of names) { const x = byName.get(nm); let n = x && x.nation !== 'common' ? x.nation : null;
    if (!n) for (const w of nm.split(/[._]/)) if (NATIONS.includes(w)) { n = NMAP[w] || w; break; }
    if (n) c.set(n, (c.get(n) || 0) + 1); } let best = null; for (const [n, k] of c) if (!best || k > c.get(best)) best = n; return best; };
  for (const x of recs.values()) if (x.nation === 'common' && x.ammo.length) { const n = vote(x.ammo); if (n) { x.nation = n; x.nationFrom = 'ammo'; } }
  for (const x of recs.values()) if (x.nation === 'common' && x.users.length) { const n = vote(x.users); if (n) { x.nation = n; x.nationFrom = 'users'; } }
  if (b.idx && require('../lib/vfs').closeRecs) try { require('../lib/vfs').closeRecs(); } catch {}
  const fileOf = lkey => {
    const m = /^desc\/(ammo|weapon|stuff|container)\/(.+)$/.exec(lc(lkey)); if (!m || m[2].includes('/')) return null;
    const words = m[2].split(/\s+/).filter(Boolean);
    return bySet.get(words.filter(t => !SKIP.has(t)).sort().join(' ')) || byDesc.get(lc(lkey)) || (pools.find(([p]) => words.filter(t => !SKIP.has(t)).every(w => p.has(w))) || [])[1] || null;
  };
  const ctx = (r, cat) => {
    const mark = cat === 'C' ? '[changed]' : cat === 'V' ? '[vanilla]' : '[new]';
    if (!r) return `; ${mark} no stuff file gives this key`;
    const parts = [`stuff ${r.rel}`];
    if (r.cal) parts.push('cal ' + r.cal);
    if (r.weight) parts.push('weight ' + r.weight);
    if (r.users.length) parts.push('used by ' + cap(r.users, 4));
    if (r.ammo.length) parts.push('takes ' + cap(r.ammo, 4));
    return (`; ${mark} ` + parts.join(' | ')).replace(/[^\x20-\x7e]/g, '?');
  };
  return { fileOf, ctx, count: recs.size };
}

module.exports = { read, NATIONS };
