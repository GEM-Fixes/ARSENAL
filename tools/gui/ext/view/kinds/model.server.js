// view kind model, server side (../README.md): a mesh (.ply), a collision volume (.vol) or an animation (.anm) opens on the Models
// page, on the model that uses it. One route finds that model:
//   GET /api/x/view/model/owner?<ref>
//     -> { found, target, key, name, sub, sel: {bone?, volume?, anm?}, ply, loose, candidates: [{target, key, name, uses}], file, where,
//          inPak, note }
//     target = what the Models page picks (a .mdl path on disk when the .mdl is a loose file, else its game key, never a copy);
//     sub = the Models sub-tab ('ply' Mesh, 'vol' Volumes, 'anim' Animation, 'model'); sel = what to select there (D.select);
//     ply = the mesh to show on the Mesh sub-tab (the document's rel); loose = no .mdl names the file, the .mdl of its folder is
//     shown and the file is one of its loose files; candidates = every .mdl that uses it, best first.
//   Where it looks: the .mdl files of the file's folder, then of the parent folder and its subfolders, then one level higher (a
//   `common/` mesh folder that the models in the folders beside it use as ../common/x.ply). A .mdl uses a .ply through a bone's View/VolumeView/LODView, a .vol through {Volume {Polyhedron}}, an .anm
//   through {sequence {file}} (or the sequence name). A .mdl is its own owner; a .def names its .mdl by {Extension}; a .mtl or a
//   texture is used by a .mdl when one of its meshes (or a .mtl of the folder that names the texture) holds the name [I: a name
//   search in the bytes, not a material parse].
// exts: ply vol anm. A map's own map.ply sits in a map folder: the map kind's match takes it first (map.server.js).
// Reads only (R.listKeys, R.readKey; a file outside the game view is read from its folder on disk), never writes.
// Author: Imperator_Aug (ARSENAL, ia-d3ce086f)
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../ref');
const names = require('../../../../lib/names');
const M = require('../../../../lib/model/mdl');

const MAX_MDL = 30, MAX_PLY = 80, MAX_READ = 8 << 20, UP = 2;
const fwd = p => String(p).replace(/\\/g, '/');
const low = s => fwd(s).toLowerCase();
const base = s => low(s).split('::').pop().split('/').pop();
const extOf = s => { const b = base(s), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1) : ''; };
const stemOf = s => base(s).replace(/\.[^.]*$/, '');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const up = d => d.replace(/[^/]+\/$/, '');
const refKey = (s, dir) => path.posix.normalize(low(names.resolve(s, dir.replace(/\/$/, '')).key)).replace(/^\.\//, '');
const SUB = { ply: 'ply', vol: 'vol', anm: 'anim' };

// the place to look in: the game's layered view seen from the mod (keys), or a folder on disk (a file outside the game view)
function spaceOf(ctx, q, r) {
  if (q.mod && r.key) {
    const mod = q.mod, cache = new Map();
    return {
      file: low(r.key), docRel: low(r.key),
      mdls(dir, sub) { return R.listKeys(ctx, mod, dir).filter(k => /\.mdl$/.test(k) && (dirOf(k) === dir || (sub && up(dirOf(k)) === dir))); },
      list(dir, ext) { return R.listKeys(ctx, mod, dir).filter(k => dirOf(k) === dir && k.endsWith('.' + ext)); },
      read(k) { if (cache.has(k)) return cache.get(k); let b = null; try { b = R.readKey(ctx, mod, k, { max: MAX_READ }); } catch (e) { b = null; } cache.set(k, b); return b; },
      // the Models page target: the .mdl file itself when it is loose on disk, else its key (the page reads the game view)
      target(k) { try { const x = R.resolve(ctx, { mod, key: k }); return { target: x.inPak ? k : fwd(x.file), inPak: x.inPak || null, where: x.where }; } catch (e) { return { target: k, inPak: null, where: null }; } },
    };
  }
  if (r.file && !r.inPak) {
    const f = low(path.resolve(r.file)), i = f.lastIndexOf('/resource/');
    const toDisk = k => path.resolve(k);
    return {
      file: f, docRel: i >= 0 ? f.slice(i + 1) : 'resource/' + base(f),
      mdls(dir, sub) {
        let a = this.list(dir, 'mdl');
        if (sub) { try { for (const e of fs.readdirSync(toDisk(dir), { withFileTypes: true })) if (e.isDirectory()) a = a.concat(this.list(dir + e.name.toLowerCase() + '/', 'mdl')); } catch (e) { /* none */ } }
        return a;
      },
      list(dir, ext) { try { return fs.readdirSync(toDisk(dir)).map(n => dir + n.toLowerCase()).filter(k => k.endsWith('.' + ext)); } catch (e) { return []; } },
      read(k) { try { const p = toDisk(k), st = fs.statSync(p); return st.size > MAX_READ ? null : fs.readFileSync(p); } catch (e) { return null; } },
      target(k) { return { target: k, inPak: null, where: 'outside' }; },
    };
  }
  return null;
}

// what a .mdl names: [{key, kind, bone?, volume?, seq?}]
function usesOf(buf, dir) {
  const out = [], m = M.parse(buf);
  const add = (s, kind, x) => { if (s) { try { out.push(Object.assign({ key: refKey(s, dir), kind }, x)); } catch (e) { /* a bad name */ } } };
  for (const b of m.bones || []) for (const v of b.views || []) { add(v.file, 'ply', { bone: b.path }); for (const l of v.lods || []) add(l.file, 'ply', { bone: b.path }); }
  for (const v of m.volumes || []) add(v.file, 'vol', { volume: v.id });
  for (const s of m.sequences || []) add(s.file || (s.name ? s.name + (/\.anm$/i.test(s.name) ? '' : '.anm') : ''), 'anm', { seq: s.name });
  return out;
}
// a .mdl's rank among several: one named like its folder, then one whose name starts the file's name, then by name
function rank(mdlKey, fileKey) {
  const s = stemOf(mdlKey), d = dirOf(mdlKey).split('/').filter(Boolean).pop() || '', f = stemOf(fileKey);
  return (s === d ? 0 : 2) + (f.startsWith(s) || s.startsWith(f) ? 0 : 1);
}
function sortC(a, fileKey) { return a.sort((x, y) => (x.level - y.level) || (rank(x.key, fileKey) - rank(y.key, fileKey)) || (x.key < y.key ? -1 : 1)); }

function find(sp, ext) {
  const file = sp.file, hits = [], dir0 = dirOf(file);
  let looked = 0;
  // .mdl: itself. .def: its {Extension "x.mdl"}, else the .mdl of the same name next to it
  if (ext === 'mdl') return { hits: [{ key: file, level: 0, uses: 'self' }], sub: 'model' };
  if (ext === 'def') {
    const t = String((sp.read(file) || Buffer.alloc(0)).toString('latin1')), m = /\{\s*extension\s+"([^"]+\.mdl)"/i.exec(t);
    const k = m ? refKey(m[1], dir0) : dir0 + stemOf(file) + '.mdl';
    if (sp.read(k)) hits.push({ key: k, level: 0, uses: m ? 'extension' : 'name' });
    return { hits, sub: 'model' };
  }
  const tex = ext === 'mtl' || /^(dds|tga|png|bmp|jpg)$/.test(ext);
  let plyRead = 0;
  for (let lv = 0, dir = dir0; lv <= UP && dir && dir !== 'resource/'; lv++, dir = up(dir)) {
    const mdls = sp.mdls(dir, lv > 0).slice(0, MAX_MDL * 2);   // above the file's folder: also the folders beside it (a shared common/)
    for (const k of mdls) {
      if (looked++ > MAX_MDL * 3) break;
      const buf = sp.read(k); if (!buf) continue;
      let uses = []; try { uses = usesOf(buf, dirOf(k)); } catch (e) { uses = []; }
      if (!tex) {
        const u = uses.find(x => x.kind === ext && x.key === file) || uses.find(x => x.kind === ext && base(x.key) === base(file) && lv === 0);
        if (u) hits.push({ key: k, level: lv, uses: u.kind, bone: u.bone, volume: u.volume, seq: u.seq });
        continue;
      }
      // a texture or a .mtl: a mesh of this model holds its name (or the name of a .mtl of the folder that holds it)
      const needles = [stemOf(file)];
      if (ext !== 'mtl') for (const mk of sp.list(dirOf(k), 'mtl').slice(0, 60)) { const b = sp.read(mk); if (b && b.toString('latin1').toLowerCase().includes(stemOf(file))) needles.push(stemOf(mk)); }
      const plies = [...new Set(uses.filter(x => x.kind === 'ply').map(x => x.key))];
      const u = plies.find(pk => { if (plyRead++ > MAX_PLY) return false; const b = sp.read(pk); if (!b) return false; const s = b.toString('latin1').toLowerCase(); return needles.some(n => n && s.includes(n)); });
      if (u) hits.push({ key: k, level: lv, uses: 'texture', mesh: u });
    }
    if (hits.length) break;
  }
  if (hits.length || tex) return { hits, sub: tex ? 'model' : SUB[ext] };
  // no .mdl names it: the .mdl of its own folder, where it shows as a loose file (a mesh, an animation of the folder)
  const own = sp.mdls(dir0).slice(0, MAX_MDL).map(k => ({ key: k, level: 0, uses: 'folder' }));
  return { hits: own, sub: SUB[ext] || 'model', loose: own.length > 0 };
}

async function owner(url, body, ctx) {
  const q = R.refOfQuery(url), r = R.resolve(ctx, q), ext = extOf(r.name);
  const sp = spaceOf(ctx, q, r);
  const res = { found: false, target: null, key: null, name: null, sub: null, sel: {}, ply: null, loose: false, candidates: [], file: sp ? sp.file : null, where: r.where, inPak: null, note: null };
  if (!sp) { res.note = 'nofolder'; return res; }
  const f = find(sp, ext), list = sortC(f.hits, sp.file);
  if (!list.length) return res;
  const best = list[0], t = sp.target(best.key);
  Object.assign(res, { found: true, target: t.target, key: best.key, name: base(best.key), sub: f.sub, loose: !!f.loose, inPak: t.inPak });
  if (t.inPak && t.where && t.where !== 'vanilla') res.note = 'modpak';   // a .mdl inside a mod's pak: the page reads the game view
  if (ext === 'ply') { res.ply = sp.docRel; if (best.bone) res.sel.bone = best.bone; }
  if (ext === 'vol' && best.volume) res.sel.volume = best.volume;
  if (ext === 'anm') { res.sel.anm = sp.docRel; res.sel.frame = 0; }
  res.candidates = list.slice(0, 20).map(c => ({ target: sp.target(c.key).target, key: c.key, name: base(c.key), uses: c.uses }));
  return res;
}

module.exports = {
  exts: ['ply', 'vol', 'anm'],
  routes: { 'GET /api/x/view/model/owner': owner },
  remote: ['GET /api/x/view/model/owner'],
  _t: { usesOf, refKey, rank, find, spaceOf },
};
