// gohsample plan: enumerate GoH entity defs, pick a deterministic small sample covering every content kind and every
// format-difference code (goh2as2 convertText WARN_PORT_* + portdiff textChecks + file-type pseudo codes), small dependency closures first.
// Closure analysis MIRRORS goh2as2's closure (REF_KEYS/resolveTok are not exported there) [I]; the real closure is recorded by `build`.
// Author: Imperator_Aug (ARSENAL, ia-5eb5a9cd)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('./common');
const sdlw = require('../lib/sdlwrite'), enc = require('../lib/enc'), pakset = require('../lib/pakset');
const { createReport } = require('../lib/report');
const { convertText } = require('../goh2as2/goh2as2');
const CK = require('../portdiff/checks');

const TEXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const SKIP_EXT = new Set(['materials', 'omask', 'bzc', 'dso', 'hso', 'cso', 'html', 'js', 'css', 'htm']);
const DEP_EXT = ['def', 'ext', 'mdl', 'mtl', 'inc', 'ply', 'vol', 'anm', 'dds', 'mine', 'ammo', 'weapon', 'pattern'];
const IMG_EXT = ['ebm', 'tex', 'dds', 'tga', 'bmp', 'jpg', 'png'];
const SIB_EXT = ['ext', 'mdl', 'mtl', 'ply', 'vol', 'anm'];
const REF_KEYS = new Set(['extension', 'include', 'file', 'volumeview', 'mesh', 'model', 'texture', 'diffuse', 'bump', 'specular', 'normal', 'material', 'mtl', 'ply', 'anm', 'vol',
  'ammo', 'weapon', 'entity', 'item', 'sound', 'sounds', 'fx', 'effect', 'animation', 'pattern', 'projectile', 'applyprojectile', 'shell', 'inventory', 'from', 'base', 'parent', 'template', 'skin', 'set', 'def', 'collision', 'volume_view', 'view']);
const CAP = 400;   // goh2as2 --max-files default
const norm = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); };

function tokens(src) {
  const t = sdlw.parse(Buffer.from(src, 'latin1')), out = [];
  (function w(n) {
    for (const k of n.items) {
      if (k.type === 'string' || k.type === 'atom') { if (k === n.items[0] || !REF_KEYS.has(n.name)) continue; out.push({ s: k.type === 'string' ? k.text.replace(/^"|"$/g, '') : k.text, q: k.type === 'string', key: n.name }); }
      else if (k.items) w(k);
    }
  })(t.root);
  return out;
}
function implicitAnms(src) {
  const out = [];
  (function w(n) {
    const kids = n.items.filter(k => k.items);
    if (n.name === 'sequence' && n.items[1] && n.items[1].type === 'string' && !kids.some(k => k.name === 'file')) out.push(n.items[1].text.replace(/^"|"$/g, '').toLowerCase());
    kids.forEach(w);
  })(sdlw.parse(Buffer.from(src, 'latin1')).root);
  return out;
}
function resolveTok(tok, dir, map) {
  let s = tok.s.trim();
  if (!s || s.length < 3 || /\s/.test(s) || /^[-+\d.%]/.test(s) && !s.includes('/')) return null;
  s = s.toLowerCase().replace(/\\/g, '/');
  if (!tok.q && !s.includes('/')) return null;
  const isTex = /^(diffuse|bump|specular|texture)$/.test(tok.key);
  const bases = s.startsWith('/') ? [s.slice(1)] : s.startsWith('$/') ? ['texture/common/' + s.slice(2), 'entity/' + s.slice(2), s.slice(2), 'texture/' + s.slice(2), dir + '/' + s.slice(2)] : [dir + '/' + s, s];
  const ex = C.extOf(s), hasExt = ex !== '' && (TEXT.has(ex) || SKIP_EXT.has(ex) || ['ply', 'vol', 'anm', 'dds', 'tga', 'png', 'jpg', 'bmp', 'ebm', 'tex'].includes(ex));
  for (const b of bases) for (const x of hasExt ? [''] : (isTex ? IMG_EXT : DEP_EXT).map(e => '.' + e)) { const k = norm(b + x); if (map.has(k)) return k; }
  return null;
}

// one file -> {codes, refs, sibs, size, text}. never throws
function analyzeFile(key, ix, memo) {
  if (memo.has(key)) return memo.get(key);
  const ent = ix.map.get(key), ext = C.extOf(key), dir = key.slice(0, key.lastIndexOf('/')), stem = key.slice(0, key.lastIndexOf('.'));
  const r = { codes: [], refs: [], sibs: [], size: ent ? ent.size : 0, text: false };
  memo.set(key, r);
  if (!ent) return r;
  if (['def', 'ext', 'mdl'].includes(ext)) for (const x of SIB_EXT) if (ix.map.has(stem + '.' + x)) r.sibs.push(stem + '.' + x);
  const codes = new Set();
  if (SKIP_EXT.has(ext)) codes.add('WARN_PORT_SKIP_KIND');
  if (TEXT.has(ext)) {
    r.text = true;
    try {
      const buf = ix.read(ent);
      let b = buf; if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
      const src = b.toString('latin1').replace(/\r?\n/g, '\r\n');   // ENCFIX: bytes pass through, as goh2as2 decodeText
      const sc = enc.sdlScan(b, 1);
      if (sc.outside.length) codes.add('WARN_PORT_NONASCII_IDENT');
      if (sc.badStr.length) codes.add('WARN_PORT_STR_NOT_UTF8');
      const rep = createReport();
      try { convertText(src, 'resource/' + key, key, ext, rep); } catch { codes.add('PORT_CRASH'); }
      const j = rep.toJSON({ tool: 'x' });
      for (const f of j.findings.concat(j.info)) codes.add(f.code);
      for (const f of CK.textChecks(src, true)) codes.add(f.code);
      if (ext === 'mdl') for (const a of implicitAnms(src)) { if (ix.map.has(norm(dir + '/' + a + '.anm'))) r.refs.push(norm(dir + '/' + a + '.anm')); else codes.add('WARN_PORT_ANM_MISSING'); }
      for (const tok of tokens(src)) {
        const k = resolveTok(tok, dir, ix.map);
        if (!k) continue;
        if (k.startsWith('properties/')) codes.add('WARN_PORT_SHARED_PROPS'); else r.refs.push(k);
      }
    } catch { codes.add('PORT_CRASH'); }
  }
  r.codes = [...codes].sort();
  r.refs = [...new Set(r.refs)];
  return r;
}

function closureOf(key, ix, memo) {
  const seen = new Set([key]), q = [key], codes = new Set(), exts = new Set();
  let capped = false;
  while (q.length) {
    const k = q.shift(), a = analyzeFile(k, ix, memo);
    for (const c of a.codes) codes.add(c);
    exts.add(C.extOf(k));
    for (const n of a.sibs.concat(a.refs)) {
      if (seen.has(n)) continue;
      if (seen.size >= CAP) { capped = true; continue; }
      seen.add(n); q.push(n);
    }
  }
  for (const e of exts) if (e) codes.add('FILE_' + e);
  return { files: seen.size, capped, codes: [...codes].sort() };
}

// kind = content stratum. vehicle country is dropped, inventory split where formats differ
function kindOf(key) {
  const s = key.split('/'), top = s[1] || '', st = x => String(x || '').replace(/^[-_~]+/, '');
  if (top === '-vehicle') { const t = s[3] || ''; return /^tank_/.test(t) ? 'vehicle/tank' : ['btr', 'cannon', 'car', 'airborne'].includes(t) ? 'vehicle/' + t : 'vehicle/other'; }
  if (top === 'inventory') return s[2] === '-weapon' ? 'inventory/weapon/' + st(s[3]) : 'inventory/' + st(s[2]);
  if (top === 'construction') return /\/(buildings?|houses?)\//.test(key) ? 'construction/buildings' : 'construction/props';
  return st(top) || 'misc';
}
const subOf = key => key.split('/').slice(2, 4).join('/');
const SPECIAL_NAME = /[#,"\\\s;]/;   // preloadsweep splitNames strips `#...` and splits on `,`: such a name cannot go through a names list [V]

async function plan(o) {
  const goh = o.goh || C.DEFAULT_GOH, as2 = o.as2 || C.DEFAULT_AS2, out = path.resolve(o.out);
  C.guardOut(out, goh, as2);
  const max = +(o.max || 100), perCode = +(o['per-code'] || 2), perKind = +(o['per-kind'] || 3), maxB = +(o['max-b'] || 60), seed = String(o.seed || '1');
  const T0 = Date.now(), log = o.q ? () => { } : console.log;
  const ix = C.buildIndex(goh);
  const defs = [...ix.map.keys()].filter(k => k.startsWith('entity/') && k.endsWith('.def')).sort();
  log(`index: ${ix.map.size} files, ${defs.length} entity defs (${Date.now() - T0} ms)`);
  // AS2 vanilla names: a converted def with a vanilla name would overlay vanilla and muddy the result
  let as2Names = new Set();
  if (fs.existsSync(as2)) { const a = C.buildIndex(as2); for (const k of a.map.keys()) if (k.startsWith('entity/') && k.endsWith('.def')) as2Names.add(C.baseName(k)); a.close(); }
  const byName = new Map();
  for (const k of defs) { const n = C.baseName(k); if (!byName.has(n)) byName.set(n, []); byName.get(n).push(k); }
  const excl = { duplicate_name: 0, as2_name_collision: 0, special_name: 0 }, exclList = { special_name: [] };
  const cands = [];
  for (const k of defs) {
    const n = C.baseName(k);
    if (SPECIAL_NAME.test(n)) { excl.special_name++; if (exclList.special_name.length < 5) exclList.special_name.push(n); continue; }
    if (byName.get(n).length > 1) { excl.duplicate_name++; continue; }
    if (as2Names.has(n)) { excl.as2_name_collision++; continue; }
    cands.push({ entity: n, key: k, kind: kindOf(k), sub: subOf(k) });
  }
  log(`candidates: ${cands.length} (excluded ${JSON.stringify(excl)})`);

  // stage A: def-level analysis of every candidate (cached on disk)
  const memo = new Map();
  const sig = crypto.createHash('md5').update([goh, ix.map.size, defs.length, [...ix.map.values()].reduce((s, e) => s + e.size, 0)].join('|')).digest('hex').slice(0, 12);
  const cacheFile = path.join(out, 'cache', 'analysis-' + sig + '.json');
  let cached = 0;
  if (fs.existsSync(cacheFile)) { try { for (const [k, v] of Object.entries(C.readJson(cacheFile))) { memo.set(k, v); cached++; } } catch { memo.clear(); } }
  const tA = Date.now();
  for (const c of cands) { const a = analyzeFile(c.key, ix, memo); c.proxy = a.refs.length + a.sibs.length + a.size / 2000; c.defCodes = a.codes; }
  log(`stage A: ${cands.length} defs analysed (${cached} cache entries, ${Date.now() - tA} ms)`);

  // pool: per kind the 25 smallest + 3 smallest per sub group, plus the 6 smallest holders of each def-level code
  const bySort = (a, b) => a.proxy - b.proxy || C.rank(seed, a.entity) - C.rank(seed, b.entity) || (a.entity < b.entity ? -1 : 1);
  const poolSet = new Map();
  const kinds = new Map();
  for (const c of cands) { if (!kinds.has(c.kind)) kinds.set(c.kind, []); kinds.get(c.kind).push(c); }
  for (const [, list] of kinds) {
    list.sort(bySort);
    list.slice(0, 25).forEach(c => poolSet.set(c.entity, c));
    const subs = new Map();
    for (const c of list) { const n = subs.get(c.sub) || 0; if (n < 3) { poolSet.set(c.entity, c); subs.set(c.sub, n + 1); } }
  }
  const byCode = new Map();
  for (const c of cands) for (const code of c.defCodes) { if (!byCode.has(code)) byCode.set(code, []); byCode.get(code).push(c); }
  for (const [, list] of byCode) list.slice().sort(bySort).slice(0, 6).forEach(c => poolSet.set(c.entity, c));
  const pool = [...poolSet.values()].sort((a, b) => a.entity < b.entity ? -1 : 1);
  const tB = Date.now();
  for (const c of pool) { const cl = closureOf(c.key, ix, memo); c.est = cl.files; c.capped = cl.capped; c.codes = cl.codes; if (/[#~\[\]]/.test(c.key)) c.codes.push('NAME_PATH_SPECIAL'); }
  log(`stage B: ${pool.length} pool entities, closures walked (${Date.now() - tB} ms)`);
  try { const o2 = {}; for (const [k, v] of memo) o2[k] = v; C.writeJson(cacheFile, o2); } catch { /* cache is optional */ }
  const PB = require('./partB');
  const partB = PB.selectB(ix, memo, analyzeFile, { cacheFile: path.join(out, 'cache', 'scanB-' + sig + '.json'), as2, perCode, maxB, seed, log });
  ix.close();

  // selection
  const universe = new Map();   // code -> pool holders
  for (const c of pool) for (const code of c.codes) { if (!universe.has(code)) universe.set(code, []); universe.get(code).push(c); }
  const picked = new Map(), need = new Map([...universe.keys()].map(k => [k, perCode]));
  const take = (c, why) => {
    if (picked.has(c.entity)) { picked.get(c.entity).why.push(why); return; }
    picked.set(c.entity, { c, why: [why] });
    for (const code of c.codes) need.set(code, (need.get(code) || 0) - 1);
  };
  const gain = c => c.codes.filter(k => (need.get(k) || 0) > 0).reduce((s, k) => s + 1 / Math.sqrt(universe.get(k).length), 0);
  const uncoveredKinds = [];
  const kindNames = [...kinds.keys()].sort();
  for (let round = 0; round < perKind; round++) for (const kd of kindNames) {
    if (picked.size >= max) { if (round === 0) uncoveredKinds.push(kd); continue; }
    const inKind = pool.filter(c => c.kind === kd && !picked.has(c.entity));
    if (!inKind.length) continue;
    const usedSubs = new Set([...picked.values()].filter(p => p.c.kind === kd).map(p => p.c.sub));
    const fresh = inKind.filter(c => !usedSubs.has(c.sub)), from = fresh.length ? fresh : inKind;
    const small = from.slice().sort((a, b) => a.est - b.est).slice(0, Math.max(5, Math.ceil(from.length / 4)));
    small.sort((a, b) => Math.round(gain(b) * 100) - Math.round(gain(a) * 100) || a.est - b.est || C.rank(seed, a.entity) - C.rank(seed, b.entity));
    take(small[0], `kind ${kd} #${round + 1}`);
  }
  while (picked.size < max) {
    let best = null, bv = 0;
    for (const c of pool) {   // pool is name-sorted: ties fall to smaller closure, then seeded rank
      if (picked.has(c.entity)) continue;
      const v = Math.round(gain(c) / (1 + c.est / 20) * 1e6);
      if (v <= 0) continue;
      if (!best || v > bv || (v === bv && (c.est < best.est || (c.est === best.est && C.rank(seed, c.entity) < C.rank(seed, best.entity))))) { best = c; bv = v; }
    }
    if (!best) break;
    const newly = best.codes.filter(k => (need.get(k) || 0) > 0);
    take(best, 'cover ' + newly.join(','));
  }
  const entities = [...picked.values()].map(({ c, why }) => ({ entity: c.entity, key: c.key, kind: c.kind, sub: c.sub, codes: c.codes, estClosure: c.est, estCapped: c.capped, why: why.join('; ') })).sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.entity < b.entity ? -1 : 1);

  // uncovered
  const lim = C.limitCodes(o.limits), unc = [];
  const selCount = code => entities.filter(e => e.codes.includes(code)).length;
  for (const kd of kindNames) { const n = entities.filter(e => e.kind === kd).length; if (n < perKind) unc.push(`STRATUM ${kd}: ${n} of ${perKind} wanted${uncoveredKinds.includes(kd) ? ' (--max budget reached before this kind)' : ''}`); }
  if (excl.special_name) unc.push(`STRATUM special names: ${excl.special_name} defs have a name preloadsweep cannot list (contains # , " \\ space ;; e.g. ${exclList.special_name.join(' ')}); splitNames strips '#...' [V]`);
  const allCodes = new Set([...universe.keys(), ...[...lim.keys()]]);
  for (const code of [...allCodes].sort()) {
    if ((!/^(WARN_)?PORT_/.test(code) && !/^FILE_|^NAME_/.test(code)) || /^PORT_(KEY|EXT|SHAPE|STRUCT|PARSE)_/.test(code)) continue;   // PORT_KEY_* etc. are portdiff whole-tree tallies, not per-entity
    const nA = selCount(code), nB = partB.files.filter(f => f.codes.includes(code)).length, n = nA + nB;
    const haveA = (universe.get(code) || []).length, haveB = partB.universe.get(code) || 0, haveDef = cands.filter(c => c.defCodes.includes(code)).length, rows = lim.get(code);
    if (n >= perCode) continue;
    if (haveA + haveB + haveDef > 0 && nB >= haveB && nA >= Math.min(haveA, haveDef || haveA)) continue;   // every holder was taken: fewer holders than --per-code is not a gap
    const rowTxt = rows ? '; rows ' + rows.join(',') : '; no limits row names it';
    if (code === 'WARN_PORT_SKIP_KIND' || code === 'WARN_PORT_SKIP_SET_KIND') unc.push(`NOT_TESTABLE CODE ${code}: rows ${(rows || []).join(',')}; goh2as2 omits these files (.materials/.omask/shaders; set/dynamic_campaign, difficulties, layout/profiles/scene sets), so nothing reaches the game: build records them as skipped, there is no load to test [I]`);
    else if (haveA + haveB + haveDef === 0) unc.push(`NO_TRIGGER CODE ${code}: no GoH file triggers it in the scan (every entity def, every non-entity text file up to ${PB.SIZE_CAP} bytes, sampled closures); nothing to sample${rowTxt} [I: entity-side ext/mdl/mtl outside the sampled closures are not scanned]`);
    else unc.push(`UNSAMPLED CODE ${code}: ${n} of ${perCode} sampled (entities ${nA}, part B files ${nB}); holders: ${haveDef} entity defs, ${haveA} pool closures, ${haveB} part B files${rowTxt}; ${haveB === 0 ? 'its holders are entity-side files no sampled closure pulls' : 'budget (--max-b) reached or fewer holders than --per-code'}`);
  }
  const perKindCounts = {};
  for (const e of entities) perKindCounts[e.kind] = (perKindCounts[e.kind] || 0) + 1;
  const sample = {
    tool: 'gohsample', version: 1, notice: C.NOTICE,
    meta: { goh: C.fwd(goh), as2: C.fwd(as2), seed, max, perCode, perKind, defs: defs.length, candidates: cands.length, excluded: excl, pool: pool.length, kinds: kindNames.length, ms: Date.now() - T0, ...(o.exe ? { exe: C.target(o).exe } : {}) },
    perKind: perKindCounts, entities,
    partB: { note: 'non-entity files (set/**, properties/**, ...): built into mod_b, never mod; load points in files[].cite', maxB, scanned: partB.scanned, oversized: partB.over, files: partB.files,
      groups: partB.files.reduce((m, f) => { m[f.loadKind] = (m[f.loadKind] || 0) + 1; return m; }, {}) },
    codes: Object.fromEntries([...universe.keys()].sort().map(k => [k, { pool: universe.get(k).length, sampled: selCount(k), rows: lim.get(k) || [] }])),
  };
  C.writeJson(path.join(out, 'sample.json'), sample);
  fs.writeFileSync(path.join(out, 'uncovered.txt'), unc.join('\r\n') + (unc.length ? '\r\n' : ''));
  fs.writeFileSync(path.join(out, 'LOCAL_ONLY.txt'), C.NOTICE + '\r\n');
  log(`sample: ${entities.length} entities, ${kindNames.length} kinds, ${unc.length} uncovered lines -> ${path.join(out, 'sample.json')} (${Date.now() - T0} ms)`);
  return { sample, uncovered: unc, ms: Date.now() - T0 };
}

module.exports = { plan, kindOf, closureOf, analyzeFile };
