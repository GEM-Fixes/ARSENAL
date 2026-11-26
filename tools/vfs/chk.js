// vfs static checks over a lib/vfs build() result (CHK-VFS). each returns problems { code, msg, where, level:'error' }
//   MOD_DELETE_REFERENCED  VFS-35  mod.info Delete / patch delete removes a file other indexed data still names
//   WARN_SHADER_PARTIAL    VFS-57  a mod ships some shader .hlsl/.inc but not the whole include family
//   MOD_LIST_WORKSHOP_ID   VFS-53  mod list line is a numeric Workshop id, the engine wants the normalized title
//   WARN_VIDEO_MISSION_PATH VFS-58 a mod's video/mission/*.avi is not <mission folder>/start|tactical|strategic.avi
//   VFS-54 had: MOD_MODE (lib/vfs build) already flags every listed mod of the other mode
//   checksAsync(v, o): checks with the VFS-35 texts read ahead (refTexts; o.ra: the loose ones through a read-once pass), same findings
// Author: Imperator_Aug (ARSENAL, ia-6ac18805)
const fs = require('fs'), path = require('path');
const vfs = require('../lib/vfs'), names = require('../lib/names');

const BASE_LAYER = l => l === 'base' || /^patch \d+$/.test(l) || l === 'as64/core';
const srcOf = l => String(l).replace(/ patch \d+$/, '');
const REF_EXT = new Set(['.def', '.set', '.ext', '.inc', '.mi', '.mtl', '.lua', '.mis', '.scn']);
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(i); };
const SHOWN = 10;      // findings per mod and code, the rest is counted

// VFS-35: deleted key (mod layer) absent at the end, whose resource-relative path (with or without extension) still appears in
// another indexed text file. reference form is [I]; the fatal on a missing non-optional open is [V]
const delsOf = v => v.shadows.filter(s => s.by && s.by.deleted && !BASE_LAYER(s.by.layer) && !v.files.has(s.key));
const refText = b => b.toString('latin1').toLowerCase().replace(/\\/g, '/');
// the texts deleteReferenced searches, read ahead: loose files `window` at a time through the thread pool, pak entries in offset
// order (vfs.readRecsOrdered). -> Map key -> text; a file it could not read is not in it (deleteReferenced reads it itself)
async function refTexts(v, o = {}) {
  const pre = new Map();
  if (!delsOf(v).length) return pre;
  const loose = [], packed = [];
  for (const [k, rec] of v.files) {
    if (!REF_EXT.has(extOf(k)) || rec.size > 4e6) continue;
    (rec.source === 'loose' ? loose : packed).push({ k, rec });
  }
  if (o.ra) await looseVia(o.ra, loose, pre);
  let i = o.ra ? loose.length : 0;
  const one = async () => {
    while (i < loose.length) {
      const it = loose[i++];
      try { pre.set(it.k, refText(await fs.promises.readFile(path.join(it.rec.container, it.rec.entry)))); } catch { /* read again below */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.window || 32, loose.length) }, one));
  try { for (const _ of vfs.readRecsOrdered(packed, (it, b) => pre.set(it.k, refText(b)), { maxBytes: Infinity })) { /* one read a step */ } }
  finally { vfs.closeRecs(); }
  return pre;
}
// o.ra: a readAhead stand-in (lib/modset read-once pass, vfs ctx.js): the loose files are read through it instead, in v.files
// order; a file it does not give is read here as above. The caller closes it.
async function looseVia(ra, loose, pre) {
  for (const it of loose) ra.add(it.k, path.join(it.rec.container, it.rec.entry));
  for (const it of loose) {
    const p = ra.wait(it.k); if (p) await p;
    const b = ra.take(it.k);
    if (b !== undefined) { pre.set(it.k, refText(b)); continue; }
    try { pre.set(it.k, refText(await fs.promises.readFile(path.join(it.rec.container, it.rec.entry)))); } catch { /* read again below */ }
  }
}
// pre: refTexts(v) (optional; a key it lacks is read here, as before)
function deleteReferenced(v, pre) {
  const out = [], dels = delsOf(v);
  if (!dels.length) return out;
  const corpus = [];
  try {
    for (const [k, rec] of v.files) {
      if (!REF_EXT.has(extOf(k)) || rec.size > 4e6) continue;
      const t = pre && pre.get(k);
      if (t !== undefined) { corpus.push([k, t]); continue; }
      let b; try { b = vfs.readRec(rec); } catch { continue; }
      corpus.push([k, refText(b)]);
    }
  } finally { vfs.closeRecs(); }
  const idc = /[a-z0-9_\-]/;
  const find = (needle) => {
    for (const [k, t] of corpus) {
      for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + 1)) {
        const after = t[i + needle.length], before = t[i - 1];
        if ((after === undefined || !idc.test(after)) && (before === undefined || !/[a-z0-9_\-.]/.test(before) )) return k;
      }
    }
    return null;
  };
  const per = new Map();
  for (const s of dels) {
    const mod = srcOf(s.by.layer), rel = s.key.replace(/^resource\//, '');
    const hit = find(rel) || find(rel.replace(/\.[^./]+$/, ''));
    if (!hit) continue;
    let a = per.get(mod); if (!a) per.set(mod, a = []);
    if (!a.some(x => x.key === s.key)) a.push({ key: s.key, hit, how: s.by.how });
  }
  for (const mod of [...per.keys()].sort()) {
    const a = per.get(mod).sort((x, y) => x.key < y.key ? -1 : 1);
    a.slice(0, SHOWN).forEach(x => out.push({ code: 'MOD_DELETE_REFERENCED', level: 'error', where: x.key,
      msg: `${mod}: ${x.how} removes this file but ${x.hit} still names it; opening it later is a fatal "File not found" unless that open is optional. Keep the file or remove the reference (lim VFS-35)` }));
    if (a.length > SHOWN) out.push({ code: 'MOD_DELETE_REFERENCED', level: 'error', where: '.', msg: `${mod}: ${a.length - SHOWN} more deleted files are still named elsewhere (first ${SHOWN} listed)` });
  }
  return out;
}

// VFS-57: include graph over every indexed shader source (winners); a family = connected component. a mod that ships a file of
// a family but not all of it is partial. cause is [I] (log: undeclared MAX_LIGHTS_PER_PASS, material.inc errors)
function shaderPartial(v) {
  const out = [], SH = k => k.startsWith('resource/shader/') && /\.(hlsl|inc)$/.test(k);
  const mods = new Map();                    // mod -> Set(key)
  for (const k of new Set([...v.files.keys(), ...v.shadows.map(s => s.key)])) {
    if (!SH(k)) continue;
    for (const r of v.chain(k)) {
      if (r.deleted || BASE_LAYER(r.layer) || srcOf(r.layer) === 'as64+') continue;
      const id = srcOf(r.layer); let s = mods.get(id); if (!s) mods.set(id, s = new Set()); s.add(k);
    }
  }
  if (!mods.size) return out;
  const keys = [...v.files.keys()].filter(SH).sort(), adj = new Map(keys.map(k => [k, new Set()]));
  try {
    for (const k of keys) {
      let t; try { t = vfs.readRec(v.files.get(k)).toString('latin1'); } catch { continue; }
      for (const m of t.matchAll(/#\s*include\s*["<]([^">]+)[">]/gi)) {
        const rel = names.normalize(m[1]), dir = path.posix.dirname(k);
        let tgt = path.posix.normalize(dir + '/' + rel);
        if (!adj.has(tgt)) { const bn = path.posix.basename(rel); tgt = keys.find(x => path.posix.dirname(x) === dir && path.posix.basename(x) === bn) || null; }
        if (tgt && tgt !== k) { adj.get(k).add(tgt); adj.get(tgt).add(k); }
      }
    }
  } finally { vfs.closeRecs(); }
  const comp = new Map();                    // key -> component (array of keys)
  for (const k of keys) {
    if (comp.has(k)) continue;
    const c = [], st = [k]; comp.set(k, c);
    while (st.length) { const x = st.pop(); c.push(x); for (const y of adj.get(x)) if (!comp.has(y)) { comp.set(y, c); st.push(y); } }
    c.sort();
  }
  for (const id of [...mods.keys()].sort()) {
    const have = mods.get(id), seen = new Set();
    for (const k of [...have].sort()) {
      const c = comp.get(k); if (!c || seen.has(c)) continue; seen.add(c);
      const miss = c.filter(x => !have.has(x));
      if (!miss.length) continue;
      out.push({ code: 'WARN_SHADER_PARTIAL', level: 'error', where: k,
        msg: `${id} ships ${c.length - miss.length} of ${c.length} shader files of this include family (missing ${miss.slice(0, 3).map(x => x.replace(/^resource\/shader\//, '')).join(', ')}${miss.length > 3 ? ', ...' : ''}); a part-set breaks shader compile: ship or swap the whole shader folder (lim VFS-57) [I]` });
    }
  }
  return out;
}

// VFS-53: list text with no letters that is a long number = Workshop item id. engine names Workshop mods by the normalized title
function listWorkshopId(list, gameDir, exe) {
  const out = [];
  if (!list || !list.length) return out;
  let found = null;
  const get = () => found || (found = vfs.discover(gameDir, [], { plus: exe === 'as64', items: exe === 'goh' }));
  for (const text of list) {
    const name = String(text).split(':')[0].trim();
    if (!/^\d{6,}$/.test(name)) continue;
    const f = get();
    if (f.has(name)) continue;
    const t = [...f.values()].find(m => m.fileId === name);
    out.push({ code: 'MOD_LIST_WORKSHOP_ID', level: 'error', where: text,
      msg: `list line "${text}" is a Workshop item id; the engine matches the normalized mod title, so this mod is disabled` + (t ? `: write "${t.id}"` : ': write the title as it shows in mods/ (lowercase, normalized)') + ' (lim VFS-53)' });
  }
  return out;
}

// VFS-58: loading video of a mission = video/mission/<mission location path>/<start|tactical|strategic>.avi; vanilla also has
// tactical_2.avi / tactical2.avi style variants (checked against all 42 vanilla mission videos). a mod .avi elsewhere under video/mission is never read [I]
function videoMissionPath(v) {
  const out = [], P = 'resource/video/mission/', OK = /^(start|tactical|strategic)_?\d*$/;
  for (const [k, r] of [...v.files].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (!k.startsWith(P) || !k.endsWith('.avi') || BASE_LAYER(r.layer)) continue;
    const parts = k.slice(P.length).split('/'), stem = parts[parts.length - 1].slice(0, -4);
    if (parts.length >= 2 && OK.test(stem)) continue;
    out.push({ code: 'WARN_VIDEO_MISSION_PATH', level: 'error', where: k,
      msg: `${srcOf(r.layer)}: mission video must be video/mission/<mission location folder>/start.avi, tactical.avi or strategic.avi; this one is never read (lim VFS-58) [I]` });
  }
  return out;
}

function checks(v, o = {}, pre) {
  return [].concat(deleteReferenced(v, pre), shaderPartial(v), listWorkshopId(o.list, v.gameDir, v.exe), videoMissionPath(v));
}
// the same findings, the files VFS-35 searches read ahead first
async function checksAsync(v, o = {}) { return checks(v, o, await refTexts(v, o)); }
module.exports = { checks, checksAsync, refTexts, deleteReferenced, shaderPartial, listWorkshopId, videoMissionPath };
