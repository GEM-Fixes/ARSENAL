// Author: Imperator_Aug (ARSENAL, ia-ec7d6109)
'use strict';
// The texture variants and the human skins the game files have: the shared reading part of the Units page's look (./look.js) and of
// the Models page's variant control and skin list (../models/sub/look.server.js). Reads only. Engine facts with their source
// lines: the header of ./look.js.
//   every function takes c = a gen Ctx (or anything with keys(re) -> [key], read(key) -> Buffer|null, exists(key), inMod(key))
const K = require('./kit');
const lc = s => String(s == null ? '' : s).toLowerCase();
const dirOf = k => k.slice(0, k.lastIndexOf('/')), stemOf = k => k.slice(k.lastIndexOf('/') + 1).replace(/\.[^./]*$/, '');
const IMG = 'dds|tga|png|jpg|bmp|ebm|tex';
const SKIN_ROOT = 'resource/entity/humanskin/';
// not skins a soldier wears: the shared skeleton models
const NOT_SKIN = new Set(['human', 'human_for_cover', 'skeleton']);
const text = (c, key) => { const b = c.read(key); return b ? b.toString('latin1') : null; };
const fold = k => { if (!k.includes('..') && !k.includes('/./')) return k; const o = []; for (const s of k.split('/')) { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); } return o.join('/'); };

// one pass over the file names, kept on the reader: texture variants by texture, GoH mesh variants by mesh, the skin defs
function index(c) {
  if (c._lookIx) return c._lookIx;
  const tex = new Map(), ply = new Map(), skins = [];
  const reT = new RegExp('^(.*)#([^/#]+)\\.(?:' + IMG + ')$'), reP = /^(.*)#([^/#]+)\.ply$/;
  for (const k of c.keys(/#[^/]*\.[a-z0-9]+$/)) {
    let m = reT.exec(k), into = tex;
    if (!m) { m = reP.exec(k); into = ply; }
    if (!m) continue;
    const v = m[2].replace(/\$$/, '');
    if (!v) continue;
    if (!into.has(m[1])) into.set(m[1], new Set());
    into.get(m[1]).add(v);
  }
  for (const k of c.keys(/^resource\/entity\/humanskin\/.*\.def$/)) skins.push(k);
  return (c._lookIx = { tex, ply, skins: skins.sort() });
}

// ---- skins ----
// every skin def: { skin (the name a breed writes), file, group (army or folder it is listed under), sub (its folder) }.
// as64 / AS2: entity/humanskin/<folder>/<name>.def, the folder starts with the army (ger_officer, rus_tankman): group = the part
// before the first "_". GoH: entity/humanskin/[germans]/ger_heer_39/<name>.def: group = the first folder without its brackets.
function skinList(c) {
  if (c._lookSkins) return c._lookSkins;
  const seen = new Map();
  for (const k of index(c).skins) {
    const rel = k.slice(SKIN_ROOT.length), parts = rel.split('/'), name = stemOf(k), dirs = parts.slice(0, -1);
    if (NOT_SKIN.has(name) || !dirs.length || NOT_SKIN.has(dirs[0])) continue;
    const group = dirs.length >= 2 ? dirs[0].replace(/^\[|\]$/g, '') : (dirs[0].split('_')[0] || dirs[0]);
    const row = { skin: name, file: k, group, sub: dirs.join('/') };
    // one name in two folders: the engine keeps one entity per name; the mod's file is the one shown
    if (!seen.has(name) || (c.inMod && c.inMod(k) && !c.inMod(seen.get(name).file))) seen.set(name, row);
  }
  const skins = [...seen.values()].sort((a, b) => a.group < b.group ? -1 : a.group > b.group ? 1 : a.sub < b.sub ? -1 : a.sub > b.sub ? 1 : a.skin < b.skin ? -1 : 1);
  const groups = []; for (const s of skins) { const g = groups.find(x => x.group === s.group); if (g) g.n++; else groups.push({ group: s.group, n: 1 }); }
  return (c._lookSkins = { skins, groups, byName: seen });
}
const skinKey = (c, name) => { const r = skinList(c).byName.get(lc(name)); return r ? r.file : null; };

// skin name -> the mp soldiers that wear it: Map(name -> [breed path under set/breed/mp, no .set]); kept on the reader
function skinUsers(c) {
  if (c._lookUsers) return c._lookUsers;
  const m = new Map(), re = /\{\s*skin\s+"?([^"\s{};]+)/i;
  for (const k of c.keys(/^resource\/set\/breed\/mp\/.*\.set$/)) {
    const t = text(c, k); if (!t) continue;
    const x = re.exec(t.replace(/;[^\n]*/g, '')); if (!x) continue;
    const s = lc(x[1]); if (!m.has(s)) m.set(s, []);
    m.get(s).push(k.slice('resource/set/breed/mp/'.length, -4));
  }
  return (c._lookUsers = m);
}

// ---- an entity def: its own lines that decide the look ----
// { found, top, extension ('' = none of its own), texmod (the variant its own {texmod "x"} names, '' = none), form: '' | 'name' |
//   'list' ({texmod {"texture" "variant"}}: not edited here), lines (own texmod lines), aliases [[name, variant]] of {TexMods},
//   calls (the def also takes lines from other files), sig (its other lines, to tell two defs of one model apart) }
function defLook(c, key) {
  const src = text(c, key);
  if (src == null) return { found: false };
  const t = K.parse(src), top = t.kids.find(k => k.name && k.name !== '(');
  if (!top) return { found: false };
  const own = top.kids.filter(k => k.name === 'texmod'), ext = top.kids.filter(k => k.name === 'extension');
  const al = top.kids.filter(k => k.name === 'texmods'), aliases = [];
  for (const a of al) for (const p of a.kids) if (p.name && p.name !== '(' && p.args.length) aliases.push([p.name, lc(p.args[0])]);
  const first = own[0], name = first && first.args.length ? lc(first.args[0]) : '';
  const rest = top.kids.filter(k => k.name !== 'texmod').map(k => JSON.stringify([k.name, k.args, k.kids]));
  return { found: true, top: top.name, extension: ext.length ? String(ext[ext.length - 1].args[0] || '') : '', texmod: name, form: !first ? '' : name ? 'name' : 'list', lines: own.length,
    aliases, calls: top.kids.some(k => k.name === '('), sig: rest.join('\n') };
}
// the model file of a def: its own {extension}, else <def name>.mdl beside it
function mdlOf(c, key, L) {
  const dir = dirOf(key), ref = lc((L || defLook(c, key)).extension || '').replace(/\\/g, '/');
  const cands = ref ? (ref.startsWith('/') ? ['resource' + ref] : [dir + '/' + ref, 'resource/entity/' + ref, 'resource/' + ref]).map(fold) : [dir + '/' + stemOf(key) + '.mdl'];
  return cands.find(k => /\.mdl$/.test(k) && c.exists(k)) || null;
}
const strings = (buf, re) => { const s = buf.toString('latin1').replace(/[^\x20-\x7e\t\r\n]/g, '\n'), out = new Set(); let m; while ((m = re.exec(s))) out.add(lc(m[1]).replace(/\\/g, '/')); return [...out]; };
// the texture variants the files of a def's model have: [{ name, textures (how many of the model's textures have that file),
// meshes (GoH: how many meshes have a "<mesh>#name.ply") }], and how many textures the model names in all.
// def -> model -> meshes -> materials -> textures -> "<texture>#<variant>.<ext>" beside each texture ( [V]).
// A texture name: "$/x" = texture/common/x, "/x" = from the resource root, else beside the material [V vanilla materials].
function variantsOf(c, key, goh, L) { return variantsOfMdl(c, mdlOf(c, key, L), goh); }
// the same for a model file given by its key (a .mdl opened by path has no def)
function variantsOfMdl(c, mdl, goh) {
  const ix = index(c), out = { mdl, textures: 0, variants: [] };
  if (!mdl) return out;
  const mb = c.read(mdl); if (!mb) return out;
  const mdir = dirOf(mdl), plys = new Set(), mtls = new Set();
  const at = (ref, base) => fold(ref.startsWith('/') ? 'resource' + ref : base + '/' + ref);
  for (const ref of strings(mb, /"([^"\n]+\.ply)"/gi)) plys.add(at(ref, mdir));
  for (const ref of strings(mb, /"([^"\n]+\.mtl)"/gi)) mtls.add(at(ref, mdir));
  for (const pk of plys) {
    const b = c.read(pk); if (!b) continue;
    for (const ref of strings(b, /([\w$#()./\\-]+\.mtl)/gi)) { const a = at(ref, dirOf(pk)), d = at(ref, mdir); mtls.add(c.exists(a) ? a : d); }
  }
  const tex = new Set();
  for (const mk of mtls) {
    const t = text(c, mk); if (!t) continue;
    const rx = /\{\s*(?:diffuse\d?|simple|bump|specular|mask|envmap|lightmap|glow|height)\s+"([^"]+)"/gi; let m;
    while ((m = rx.exec(t))) {
      let ref = lc(m[1]).replace(/\\/g, '/').replace(new RegExp('\\.(?:' + IMG + ')$'), '');
      if (!ref || ref.startsWith('#')) continue;
      tex.add(fold(ref.startsWith('$/') ? 'resource/texture/common/' + ref.slice(2) : ref.startsWith('/') ? 'resource' + ref : dirOf(mk) + '/' + ref));
    }
  }
  const n = new Map(), bump = (v, f) => { if (!n.has(v)) n.set(v, { name: v, textures: 0, meshes: 0 }); n.get(v)[f]++; };
  for (const tk of tex) for (const v of ix.tex.get(tk) || []) bump(v, 'textures');
  if (goh) for (const pk of plys) for (const v of ix.ply.get(pk.replace(/\.ply$/, '')) || []) bump(v, 'meshes');
  out.textures = tex.size;
  out.variants = [...n.values()].sort((a, b) => a.name < b.name ? -1 : 1);
  return out;
}

module.exports = { skinList, skinKey, skinUsers, defLook, mdlOf, variantsOf, variantsOfMdl, index, SKIN_ROOT, lc, dirOf, stemOf };
