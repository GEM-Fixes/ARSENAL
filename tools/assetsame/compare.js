// Author: Imperator_Aug (ARSENAL, ia-de0e5ad9)
'use strict';
// assetsame compare (stage 3): per-class samples with decoded top-mip stats, shared-name AS2/GoH pairs, converter-output vs .
// Read-only. Writes JSON into the out dir only.
const fs = require('fs'), path = require('path');

function normalKind(img, fmt) {
  if (!img) return 'n/a';
  const n = img.w * img.h, m = [0, 0, 0, 0], step = Math.max(1, Math.floor(n / 4096));
  let c = 0;
  for (let i = 0; i < n; i += step) { for (let k = 0; k < 4; k++) m[k] += img.rgba[i * 4 + k]; c++; }
  const a = m.map(v => v / c);
  let kind;
  if (fmt === 'ATI2' || fmt === 'BC5U') kind = 'rg-two-channel (z rebuilt in shader)';
  else if (a[2] > 190 && Math.abs(a[0] - 128) < 40 && Math.abs(a[1] - 128) < 40) kind = 'rgb-xyz (b high)';
  else if (a[0] > 190 && Math.abs(a[1] - 128) < 40 && Math.abs(a[3] - 128) < 40) kind = 'dxt5nm (r high, g=y, a=x)';
  else if (a[3] > 190 && Math.abs(a[0] - 128) < 40 && Math.abs(a[1] - 128) < 40) kind = 'rg + a high';
  else kind = 'other';
  return kind + ' mean=' + a.map(v => Math.round(v)).join(',');
}
function stats(img) {
  if (!img) return null;
  const n = img.w * img.h, m = [0, 0, 0, 0], step = Math.max(1, Math.floor(n / 4096)); let c = 0;
  for (let i = 0; i < n; i += step) { for (let k = 0; k < 4; k++) m[k] += img.rgba[i * 4 + k]; c++; }
  return m.map(v => Math.round(v / c));
}
const top = (rows, f, n) => { const m = new Map(); for (const r of rows) { const k = f(r); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, n); };

function run(out, A) {
  const ps = require(path.resolve(__dirname, '..', 'lib', 'pakset'));
  const cen = {}, sets = {}, byKey = {};
  for (const g of ['as2', 'goh']) {
    cen[g] = JSON.parse(fs.readFileSync(path.join(out, 'census-' + g + '.json')));
    sets[g] = ps.open(A.INSTALL[g]);
    byKey[g] = new Map(sets[g].entries.map(e => [e.key, e]));
  }
  const res = { samples: [], shared: {}, conv: {}, units: {}, humanScale: {} };
  const rd = (g, key) => { const e = byKey[g].get(key); return e ? ps.read(e) : null; };

  // ---- 1. texture class samples (<=3 per class, decode top mip)
  for (const g of ['as2', 'goh']) {
    const rows = cen[g].tex.filter(t => !t.error && (t.ext === '.dds' || t.ext === '.tga'));
    const cls = new Map();
    for (const t of rows) {
      const role = A.roleOf(t).replace(/^unref.*/, 'unref');
      const k = [t.ext, String(t.fmt).replace(/\/.*/, '').replace(/^TGA\d+$/, 'TGA'), role].join('|') + (t.fmt && /TGA/.test(t.fmt) ? '|' + t.fmt : '');
      const o = cls.get(k) || cls.set(k, { n: 0, list: [] }).get(k);
      o.n++; o.list.push(t);
    }
    for (const [k, o] of cls) {
      const pick = [0, Math.floor(o.list.length / 2), o.list.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => o.list[i]);
      const smp = pick.map(t => {
        let img = null, err = null;
        try { img = A.decode(t.key, rd(g, t.key)); } catch (e) { err = e.message; }
        return { key: t.key, w: t.w, h: t.h, mips: t.mips, fmt: t.fmt, size: t.size, decoded: !!img, meanRGBA: stats(img), normal: /bump/.test(k) ? normalKind(img, t.fmt) : undefined, err };
      });
      res.samples.push({ game: g, cls: k, n: o.n, sample: smp });
    }
  }

  // ---- 2. same-key textures and anm in both installs
  const sharedT = cen.goh.tex.filter(t => !t.error && cen.as2.tex.length && byKey.as2.has(t.key) && (t.ext === '.dds' || t.ext === '.tga'));
  const sharedA = cen.goh.anm.filter(t => !t.error && byKey.as2.has(t.key));
  res.shared.texCount = sharedT.length; res.shared.anmCount = sharedA.length;
  let eq = 0, neq = 0; const diffs = [], byKind = {};
  const spread = (a, n) => a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor(i * a.length / n)]);
  for (const t of spread(sharedT, 300)) {
    const a = rd('as2', t.key), b = rd('goh', t.key);
    if (a.equals(b)) { eq++; continue; }
    neq++;
    const A2 = A.decode(t.key, a), G2 = A.decode(t.key, b);
    const o = { key: t.key, fmtAs2: A.textureHeader(t.key, a).fmt, fmtGoh: t.fmt, sizeAs2: [A.textureHeader(t.key, a).w, A.textureHeader(t.key, a).h], sizeGoh: [t.w, t.h] };
    if (A2 && G2) Object.assign(o, A.pixelDiff(A2, G2));
    diffs.push(o);
  }
  res.shared.texSampled = Math.min(300, sharedT.length); res.shared.texByteEqual = eq; res.shared.texDiffer = neq; res.shared.texDiffSamples = diffs.slice(0, 12);
  res.shared.texPixelMeanAbsDiff = diffs.filter(d => d.mad).length ? +(diffs.filter(d => d.mad).reduce((s, d) => s + d.mad.slice(0, 3).reduce((x, y) => x + y, 0) / 3, 0) / diffs.filter(d => d.mad).length).toFixed(2) : null;
  eq = 0; neq = 0; const pd = [];
  for (const t of spread(sharedA, 300)) {
    const a = rd('as2', t.key), b = rd('goh', t.key);
    if (a.equals(b)) { eq++; continue; }
    neq++;
    if (pd.length < 40) { const o = A.poseDiff(a, b); o.key = t.key; pd.push(o); }
  }
  res.shared.anmSampled = Math.min(300, sharedA.length); res.shared.anmByteEqual = eq; res.shared.anmDiffer = neq; res.shared.anmPoseDiff = pd.slice(0, 12);

  // ---- 3. human skeleton scale: per bone mean |pos| over the files of the commonest 25-bone skeleton in both games
  const sigs = {};
  for (const g of ['as2', 'goh']) {
    const rows = cen[g].anm.filter(a => a.kind === 'human' && a.bones === 25 && a.boneSig);
    const sig = top(rows, a => a.boneSig, 1)[0];
    sigs[g] = sig;
    const files = rows.filter(a => a.boneSig === sig[0]);
    const acc = {};
    for (const f of spread(files, 60)) {
      const P = require(path.resolve(__dirname, '..', 'covanm', 'anmparse')).parse(rd(g, f.key));
      for (const r of P.recs) if (r.pos) { const nm = P.bones[r.bone]; (acc[nm] = acc[nm] || []).push(Math.hypot(...r.pos)); }
    }
    res.humanScale[g] = { sig: sig[0], files: sig[1], perBone: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +A.median(v).toFixed(3)])) };
  }
  res.humanScale.sameSig = sigs.as2[0] === sigs.goh[0];
  const bn = Object.keys(res.humanScale.as2.perBone).filter(k => k in res.humanScale.goh.perBone && res.humanScale.as2.perBone[k] > 0.5);
  const ratios = bn.map(k => res.humanScale.goh.perBone[k] / res.humanScale.as2.perBone[k]);
  res.humanScale.boneRatioMedian = +A.median(ratios).toFixed(3); res.humanScale.bonesCompared = bn.length;

  // ---- 4. units touched by each risky texture class (GoH): users = entity folder of each .mtl naming it
  const gE = sets.goh.entries, risky = new Map();   // stem -> class label
  for (const t of cen.goh.tex) {
    if (t.error || !(t.ext === '.dds')) continue;
    const f = String(t.fmt);
    const label = f === 'ATI2' || f === 'BC5U' ? 'ATI2/BC5 (' + f + ')' : /^RAW8/.test(f) ? 'RAW8' : /^DX10/.test(f) || f === 'undefined' || f === 't' ? 'DX10/unparsed' : (t.w > 8192 || t.h > 8192) ? 'over 8192' : t.mips > 15 ? 'mips>15' : t.cube ? 'cube' : '';
    if (label) risky.set(A.stemOf(t.key), label);
  }
  const unitsBy = {}, unitOf = k => k.split('/').slice(0, k.startsWith('entity/-vehicle') ? 5 : 4).join('/');
  const unitsAll = new Set(), unitsKeys = {};
  for (const e of gE) {
    if (!e.name.endsWith('.mtl')) continue;
    const m = A.parseMtl(ps.read(e).toString('latin1'));
    for (const [k, v] of m.kv) {
      const kl = k.toLowerCase();
      if (!['diffuse', 'diffuse1', 'bump', 'specular', 'lightmap', 'mask', 'envmap', 'environment', 'height'].includes(kl) || !v) continue;
      for (const c of A.resolveTex(e.key, v)) {
        const lab = risky.get(c) || risky.get(A.baseStem(c));
        if (lab) { (unitsBy[lab] = unitsBy[lab] || new Set()).add(unitOf(e.key)); }
        if (risky.has(c) || risky.has(A.baseStem(c))) break;
      }
      const lk = kl;
      if (['lightmap'].includes(lk)) (unitsKeys.lightmap = unitsKeys.lightmap || new Set()).add(unitOf(e.key));
    }
    for (const [k] of m.kv) { const kl = k.toLowerCase(); if (['specular_intensity', 'gloss_scale', 'full_specular', 'lightmap'].includes(kl)) (unitsKeys['mtl-key:' + kl] = unitsKeys['mtl-key:' + kl] || new Set()).add(unitOf(e.key)); }
  }
  res.units = Object.fromEntries([...Object.entries(unitsBy), ...Object.entries(unitsKeys)].map(([k, v]) => [k, v.size]));
  res.units.riskyTextures = Object.fromEntries(top([...risky.values()].map(x => ({ x })), r => r.x, 10));
  // GoH units overall (folders holding .mdl in vehicle trees) for the denominator
  res.units.gohVehicleFoldersWithMdl = new Set(gE.filter(e => e.name.endsWith('.mdl') && e.key.startsWith('entity/-vehicle')).map(e => unitOf(e.key))).size;

  // ---- 5. converter outputs under ../run/b8: goh2as2 resource trees vs bytes
  const base = path.resolve(out, '..', '..', '..', 'b8');
  const conv = { trees: 0, files: {}, examples: [] };
  const walk = (d, acc) => { let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return acc; } for (const x of ds) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
  const trees = [];
  for (const g1 of fs.existsSync(base) ? fs.readdirSync(base) : []) for (const g2 of (fs.statSync(path.join(base, g1)).isDirectory() ? fs.readdirSync(path.join(base, g1)) : [])) {
    const t = path.join(base, g1, g2, 'goh2as2', 'resource'); if (fs.existsSync(t)) trees.push(t);
  }
  conv.trees = trees.length;
  const same = {}, miss = {}, differ = {};
  const ex = {};
  for (const t of trees) for (const f of walk(t, [])) {
    const ext = A.extOf(f.toLowerCase()); if (!['.dds', '.tga', '.anm', '.mtl', '.ply'].includes(ext)) continue;
    const key = path.relative(t, f).replace(/\\/g, '/').toLowerCase();
    const b = byKey.goh.get(key);
    if (!b) { miss[ext] = (miss[ext] || 0) + 1; continue; }
    const ob = fs.readFileSync(f), gb = ps.read(b);
    if (ob.equals(gb)) same[ext] = (same[ext] || 0) + 1;
    else { differ[ext] = (differ[ext] || 0) + 1; if ((ex[ext] = ex[ext] || []).length < 3) ex[ext].push({ key, outBytes: ob.length, srcBytes: gb.length }); }
  }
  conv.byteIdentical = same; conv.differ = differ; conv.noGohSource = miss; conv.differExamples = ex;
  // mtl diffs: which keys vanished
  const dropped = {};
  for (const t of trees) for (const f of walk(t, [])) {
    if (!f.endsWith('.mtl')) continue;
    const b = byKey.goh.get(path.relative(t, f).replace(/\\/g, '/').toLowerCase()); if (!b) continue;
    const a1 = new Set(A.parseMtl(ps.read(b).toString('latin1')).kv.map(x => x[0].toLowerCase())), a2 = new Set(A.parseMtl(fs.readFileSync(f, 'latin1')).kv.map(x => x[0].toLowerCase()));
    for (const k of a1) if (!a2.has(k)) dropped[k] = (dropped[k] || 0) + 1;
  }
  conv.mtlKeysDropped = dropped;
  res.conv = conv;
  fs.writeFileSync(path.join(out, 'compare.json'), JSON.stringify(res, null, 1));
  console.log('samples', res.samples.length, 'shared tex', res.shared.texCount, 'anm', res.shared.anmCount, 'conv trees', conv.trees);
  console.log(JSON.stringify({ shared: Object.assign({}, res.shared, { texDiffSamples: undefined, anmPoseDiff: undefined }), units: res.units, conv: Object.assign({}, conv, { differExamples: undefined }), humanScale: { sameSig: res.humanScale.sameSig, ratio: res.humanScale.boneRatioMedian, n: res.humanScale.bonesCompared } }));
  for (const g of ['as2', 'goh']) sets[g].close();
}
module.exports = { run, normalKind };
