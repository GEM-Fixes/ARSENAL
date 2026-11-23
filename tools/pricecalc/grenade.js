// pricecalc/grenade: throwable (hand grenade) data read from its stuff file, a score from model weights, a tier 1..N from cut points;
// and the rifle-grenade launcher's strongest AP load (projectileDamageTable). All read from the mod's final stuff files.
//   createStuffReader(src, resolve(itemName)->{key}|null) -> { throwable(key) -> info|null, launcherAp(key) -> {param, pen, ammo}|null }
//   info = { key, energy (sum of blastwave energy, kg), energyParts[], pen (damage cumulative {damage}), fire (damage fire {radius}),
//            range (throw {range}), fuse (special {PrepareTime} with {mode detonate}) | 'impact', patterns[] }
//   scoreThrowable(info, ts{mode, energy, penetration, fire_radius, range, fuse, cuts[]}) -> { score, tier }
//     mode 'armor' (owner rule, AT grenades ranked by what they can kill): score = max(energy x strongest blast layer, penetration x cumulative damage)
// Inheritance [I]: {from "pattern X"} = X.pattern under set/stuff (nearest folder first, chained). A child's plain
//   {damage T ...} replaces the pattern's T entries; {damage add T ...} appends; {throw {range}} and {special} override.
// Author: Imperator_Aug (ARSENAL, ia-f8a51edc)
const sdlx = require('../lib/sdlx');

const val = t => !t ? null : t.k === 'STRING' ? t.value : t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text;
const blocksOf = items => items.flatMap(i => i.k === 'BLOCK' ? [i] : i.k === 'MOD' ? blocksOf(i.items) : []);
const nm = b => b.items.length ? String(val(b.items[0])).toLowerCase() : null;
const kid = (b, k) => blocksOf(b.items).find(x => nm(x) === k) || null;
const num = (b, k) => { const c = b && kid(b, k); return c && typeof val(c.items[1]) === 'number' ? val(c.items[1]) : null; };

function createStuffReader(src, resolve) {
  const keys = new Set([...src.local.keys()]);
  if (src.v) for (const k of src.v.files.keys()) keys.add(k);
  const patterns = new Map();   // name -> [keys]
  for (const k of keys) {
    if (!k.startsWith('resource/set/stuff/')) continue;
    const m = /\/([^/]+)\.pattern$/.exec(k);
    if (m) { const n = m[1].toLowerCase(); if (!patterns.has(n)) patterns.set(n, []); patterns.get(n).push(k); }
  }
  const findPattern = (name, fromKey) => {
    const list = patterns.get(String(name).toLowerCase()) || [];
    if (!list.length) return null;
    // nearest: longest shared folder prefix with the file that names it
    const score = k => { let i = 0; while (i < k.length && i < fromKey.length && k[i] === fromKey[i]) i++; return i; };
    return list.slice().sort((a, b) => score(b) - score(a) || a.length - b.length)[0];
  };
  const parsed = new Map();
  const parse = key => {
    if (parsed.has(key)) return parsed.get(key);
    let top = null;
    const buf = src.get(key);
    if (buf) {
      try {
        const r = sdlx.read(buf, { file: key, key, open: src.open, onError: () => {} });
        top = blocksOf(r.root.items)[0] || null;
      } catch (e) { top = null; }
    }
    parsed.set(key, top);
    return top;
  };
  // own facts of one file + its pattern chain
  const facts = (key, depth = 0) => {
    const top = parse(key);
    if (!top || depth > 8) return null;
    let base = { damage: [], range: null, special: null, patterns: [], params: [] };
    if (nm(top) === 'from' && typeof val(top.items[1]) === 'string') {
      // {from "pattern X"} = X.pattern; {from "grenade rpg40"} = another stuff item, resolved like an item name [I]
      const pm = /^pattern\s+(.+)$/i.exec(val(top.items[1]).trim());
      const ir = !pm && resolve ? resolve(val(top.items[1])) : null;
      const pk = pm ? findPattern(pm[1], key) : ir && ir.key !== key ? ir.key : null;
      const pf = pk ? facts(pk, depth + 1) : null;
      if (pf) base = { damage: pf.damage.slice(), range: pf.range, special: pf.special, patterns: [pk].concat(pf.patterns), params: pf.params.slice() };
    }
    const own = blocksOf(top.items);
    const replaced = new Set();
    for (const b of own) {
      const n = nm(b);
      if (n === 'damage') {
        const words = b.items.slice(1).filter(t => t.k === 'IDENT').map(t => t.text.toLowerCase());
        const add = words[0] === 'add', type = add ? words[1] : words[0];
        if (!add && !replaced.has(type)) { base.damage = base.damage.filter(d => d.type !== type); replaced.add(type); }
        base.damage.push({ type, energy: num(b, 'energy'), damage: num(b, 'damage'), radius: num(b, 'radius') });
      } else if (n === 'throw') { const r = num(b, 'range'); if (r !== null) base.range = r; }
      else if (n === 'special') {
        const md = kid(b, 'mode');
        base.special = { prepare: num(b, 'preparetime'), mode: md ? String(val(md.items[1])).toLowerCase() : null };
      } else if (n === 'parameters') {
        const t = kid(b, 'projectiledamagetable');
        const firstRow = t ? blocksOf(t.items)[0] : null;
        base.params.push({ name: String(val(b.items[1])), pen: firstRow ? val(firstRow.items[1]) : null });
      } else if (n === 'filling') base.filling = String(val(b.items[1]));
    }
    return base;
  };
  const cache = new Map();
  function throwable(key) {
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    const f = facts(key);
    let info = null;
    if (f) {
      const bw = f.damage.filter(d => d.type === 'blastwave' && typeof d.energy === 'number');
      const cu = f.damage.filter(d => d.type === 'cumulative' && typeof d.damage === 'number');
      const fi = f.damage.filter(d => d.type === 'fire' && typeof d.radius === 'number');
      const det = f.special && f.special.mode === 'detonate' && typeof f.special.prepare === 'number';
      info = { key, energy: Math.round(bw.reduce((s, d) => s + d.energy, 0) * 1e4) / 1e4, energyParts: bw.map(d => d.energy),
        pen: cu.length ? Math.max(...cu.map(d => d.damage)) : 0, fire: fi.length ? Math.max(...fi.map(d => d.radius)) : 0,
        range: f.range, fuse: det ? f.special.prepare : 'impact', patterns: f.patterns };
    }
    cache.set(key, info);
    return info;
  }
  // rifle-grenade launcher: the parameters block with the highest projectileDamageTable value among ap* loads
  function launcherAp(key) {
    const f = key ? facts(key) : null;
    if (!f) return null;
    const ap = f.params.filter(p => /^ap\d*$/i.test(p.name) && typeof p.pen === 'number').sort((a, b) => b.pen - a.pen);
    if (!ap.length) return null;
    const ammo = f.filling ? f.filling.replace(/^ammo\s+/i, '') : null;
    return { param: ap[0].name, pen: ap[0].pen, ammo, all: ap.map(p => p.name + '=' + p.pen) };
  }
  return { throwable, launcherAp };
}

function scoreThrowable(info, ts) {
  if (!info || !ts) return { score: null, tier: null };
  const fuse = info.fuse === 'impact' ? 0 : info.fuse;
  // {mode "armor"}: what the charge defeats = the better of its strongest single blast layer and its shaped charge (armour units)
  const score = ts.mode === 'armor' ? Math.max((ts.energy || 0) * Math.max(0, ...(info.energyParts || [])), (ts.penetration || 0) * info.pen) :
    (ts.energy || 0) * info.energy + (ts.penetration || 0) * info.pen + (ts.fire_radius || 0) * info.fire +
    (ts.range || 0) * (info.range || 0) + (ts.fuse || 0) * fuse;
  const s = Math.round(score * 100) / 100;
  let tier = 1;
  for (const c of ts.cuts || []) if (s >= c) tier++;
  return { score: s, tier };
}

module.exports = { createStuffReader, scoreThrowable };
