// gohsample part B: non-entity GoH files (set/**, properties/**, mission/**, ...) picked by greedy cover so every format-difference code
// that any scanned GoH file triggers has --per-code samples. Entities cannot carry these codes: their closures do not pull set/stuff
// or shared properties. Triggers come from goh2as2's own converter (plan.analyzeFile -> convertText), never guessed.
// Part B files are built into a SEPARATE mod (<out>/mod_b): they override vanilla names. Load behaviour per file kind: loadKindOf().
// Author: Imperator_Aug (ARSENAL, ia-c4b36725)
const fs = require('fs'), path = require('path');
const C = require('./common');

const TEXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const SIZE_CAP = 1500000;   // bytes: bigger text files are not scanned (listed in the stats)
const IGNORE = /^(WARN_PORT_SHARED_PROPS|PORT_BINARY_COPY|WARN_PORT_SKIP_KIND)$/;   // SHARED_PROPS is part A's; the others are not per-file format diffs

// how as64 loads the file, [I]: the game reads every set/stuff file and set/*.set at boot
function loadKindOf(key) {
  if (key.startsWith('set/stuff/')) return 'BOOT_STUFF';
  if (key.startsWith('set/')) return 'BOOT_SET';
  if (key.startsWith('properties/')) return 'ON_INCLUDE';
  if (key.startsWith('mission/')) return 'MISSION';
  return 'OTHER';
}
const groupOf = key => { const s = key.split('/'); return s.slice(0, Math.min(2, s.length - 1)).join('/') + '/*.' + (C.extOf(key) || 'noext'); };
const CITE = {
  BOOT_STUFF: 'the game reads every file under /set/stuff/ at data load [I]',
  BOOT_SET: 'the game reads set/*.set at data load [I]',
  ON_INCLUDE: 'read only when an entity .def includes it (class SPAWN of the including def) [I]',
  MISSION: 'read when a mission starts [I]',
  OTHER: 'unknown load point [I]',
};

// scan every non-entity text file once (cached key -> {codes,size}); ~195 s cold for the GoH 1.x tree, seconds when cached
function scan(ix, memo, analyze, cacheFile, log) {
  let cache = {};
  if (fs.existsSync(cacheFile)) { try { cache = C.readJson(cacheFile); } catch { cache = {}; } }
  const out = [], t0 = Date.now();
  let over = 0, fresh = 0;
  for (const [key, e] of ix.map) {
    if (key.startsWith('entity/') || !TEXT.has(C.extOf(key))) continue;
    if (e.size > SIZE_CAP) { over++; continue; }
    let r = cache[key];
    if (!r || r.size !== e.size) { const a = analyze(key, ix, memo); r = cache[key] = { size: e.size, codes: a.codes }; fresh++; }
    out.push({ key, size: e.size, codes: r.codes.filter(c => !IGNORE.test(c)) });
    memo.delete(key);
  }
  if (fresh) { try { C.writeJson(cacheFile, cache); } catch { /* optional */ } }
  log(`part B scan: ${out.length} non-entity text files (${fresh} converted now, ${over} over ${SIZE_CAP} bytes skipped, ${Date.now() - t0} ms)`);
  return { files: out, over, fresh };
}

function select(cands, opt) {
  const { perCode, maxB, seed, as2Keys } = opt;
  const universe = new Map();
  for (const c of cands) for (const code of c.codes) { if (!universe.has(code)) universe.set(code, []); universe.get(code).push(c); }
  const need = new Map([...universe.keys()].map(k => [k, perCode]));
  const picked = new Map();
  const take = (c, why) => { if (picked.has(c.key)) { picked.get(c.key).why.push(why); return; } picked.set(c.key, { c, why: [why] }); for (const code of c.codes) need.set(code, (need.get(code) || 0) - 1); };
  const gain = c => c.codes.filter(k => (need.get(k) || 0) > 0).reduce((s, k) => s + 1 / Math.sqrt(universe.get(k).length), 0);
  while (picked.size < maxB) {
    let best = null, bv = 0;
    for (const c of cands) {
      if (picked.has(c.key)) continue;
      const v = Math.round(gain(c) / (1 + c.size / 20000) * 1e6);
      if (v <= 0) continue;
      if (!best || v > bv || (v === bv && (c.size < best.size || (c.size === best.size && C.rank(seed, c.key) < C.rank(seed, best.key))))) { best = c; bv = v; }
    }
    if (!best) break;
    take(best, 'cover ' + best.codes.filter(k => (need.get(k) || 0) > 0).join(','));
  }
  // controls: the smallest code-free file of each group (so a clean outcome per kind is also measured)
  const groups = new Map();
  for (const c of cands) { const g = groupOf(c.key); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  for (const g of [...groups.keys()].sort()) {
    if (picked.size >= maxB) break;
    const list = groups.get(g);
    if (list.some(c => picked.has(c.key))) continue;
    list.sort((a, b) => a.size - b.size || C.rank(seed, a.key) - C.rank(seed, b.key));
    take(list[0], 'group ' + g);
  }
  const files = [...picked.values()].map(({ c, why }) => ({
    key: c.key, name: C.baseName(c.key), group: groupOf(c.key), loadKind: loadKindOf(c.key), cite: CITE[loadKindOf(c.key)], size: c.size, codes: c.codes,
    inAs2: as2Keys ? as2Keys.has(c.key) : null, why: why.join('; '),
  })).sort((a, b) => a.key < b.key ? -1 : 1);
  return { files, universe, need };
}

function selectB(ix, memo, analyze, o) {
  const log = o.log || (() => { });
  const sc = scan(ix, memo, analyze, o.cacheFile, log);
  let as2Keys = null;
  if (o.as2 && fs.existsSync(o.as2)) { const a = C.buildIndex(o.as2); as2Keys = new Set(a.map.keys()); a.close(); }
  const r = select(sc.files, { perCode: o.perCode, maxB: o.maxB, seed: o.seed, as2Keys });
  return { files: r.files, universe: new Map([...r.universe].map(([k, v]) => [k, v.length])), scanned: sc.files.length, over: sc.over, fresh: sc.fresh };
}

module.exports = { selectB, select, scan, loadKindOf, groupOf, CITE, SIZE_CAP };
