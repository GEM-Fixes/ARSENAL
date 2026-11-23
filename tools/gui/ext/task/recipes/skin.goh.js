// recipe "skin", the Gates of Hell branch (game parity 2026-11-23): camouflage, replace and always wear, written as GoH has them.
// Read on the GoH install [V 2026-11-23]: a unit's paint is <texture>#<variant>.dds next to its texture (most GoH textures
// sit in resource/texture/common/..., shared by every unit whose .mtl names them: "$/model/panzerivd"); vanilla GoH names variants
// #winter (2223 files), #win (718), #1, #camo, #aut ...; some variants are an .ebm wrapper ({ reference "panzerivd#1" }); a variant may
// also swap the mesh (<mesh>#<variant>.ply, GHFMT-10); resource/properties/seasons.inc maps the same options as AS2 (Winter -> win,
// Autumn -> aut, V1 -> 1 ...); a vehicle def may fix one variant with {texmod "x"} (45 vanilla lines). The AS2 path's gen skin op stops
// on GoH (GEN_SKIN_AS2_ONLY), so here every picture is a plain copy into the mod and the def lines go through the same gen set row and
// the Art page's camo-write route (both know GoH). A picture that is not DDS is made a DXT1 DDS with mipmaps (lib/model/ddsenc) when
// it has no see through parts; else the DDS editor hand off. A new soldier look (soldierLook below): GoH keeps several looks per
// humanskin folder (resource/entity/humanskin/[germans]/ger_heer_39/ger_heer_39_at.def {extension "ger_heer_39_at.mdl"}; the .mdl names
// its meshes "../[ger_source]/..", the meshes name materials by file name, and the materials sit in the look's folder [V 2026-11-23:
// no .mtl in [ger_source]; their pictures are "$/_hum/..." = resource/texture/common/_hum/..]). The new look is a sibling folder
// <parent>/<new id>/ with <new id>.def, a copy of the .mdl (paths inside the old folder made "../<old folder>/..") and every .mtl of the
// old folder; a material whose picture you bring names "$/_hum/arsenal_<new id>/<picture>" and the picture goes there. Breeds name a
// look by its def name ({skin "ger_heer_39_at"}, def names are unique [V]): a picked breed gets {skin "<new id>"} in the mod. Which name
// the game picks for a season when the def maps none (winter vs win) is [I]; every camouflage and look is [T] (not run in game).
// Author: Imperator_Aug (ARSENAL, ia-83037022)
'use strict';
const fs = require('fs'), path = require('path');

const fnOr = (v, d) => { try { return typeof v === 'function' ? v() : (v == null ? d : v); } catch (e) { return d; } };
// the GoH install of a lookup, values or route ctx: the task's (ctx.task), else the request's gohDir, else the one found on this PC
function gohDirOf(ctx) {
  const t = ctx && ctx.task && ctx.task.kind === 'goh' ? ctx.task.dir : null;
  if (t) return t;
  const d = ctx ? fnOr(ctx.gohDir, null) : null;
  if (d) return d;
  try { return require('../../../../lib/gamedir').goh() || null; } catch (e) { return null; }
}
const gameG = dir => (dir ? { dir, exe: 'goh', kind: 'goh' } : null);

// the .ebm wrapper variants of a texture (<stem>#<v>.ebm in its folder): GoH only, the Art page lists picture variants only
function ebmVariants(V, texKey) {
  const k = String(texKey || ''), d = k.slice(0, k.lastIndexOf('/') + 1), stem = k.slice(d.length).replace(/\.[a-z0-9]+$/, '').split('#')[0], out = [];
  for (const x of V.keys()) if (x.startsWith(d + stem + '#') && x.endsWith('.ebm') && !x.slice(d.length).includes('/')) out.push(x.slice(d.length + stem.length + 1, -4));
  return out;
}
// the option -> variant pairs every GoH unit includes (resource/properties/seasons.inc, mod first)
function seasonMap(V) {
  const out = new Map(), k = 'resource/properties/seasons.inc';
  if (!V.has(k)) return out;
  const t = V.readAny(V.get(k)).toString('latin1'), re = /\{\s*"([^"]+)"\s+"([^"]+)"\s*\}/g; let m;
  while ((m = re.exec(t))) if (!out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), m[2].toLowerCase());
  return out;
}

// a brought picture -> a DDS the game reads: a DDS as it is; another picture made DXT1 with mipmaps here (no see through parts, sides
// a multiple of 4). -> {file, made}
function ddsOf(c, f, H, notes, want) {
  if (H.isDds(f)) { H.checkDds(fs.readFileSync(f), path.basename(f), notes, want); return { file: f, made: false }; }
  const n = path.basename(f), img = H.decodeAny(fs.readFileSync(f), n);
  if ((img.w & 3) || (img.h & 3)) throw H.badK('task.skin.e.gohsize', n + ' is ' + img.w + 'x' + img.h + ': a picture made into DDS here needs sides that divide by 4 (best 1024 or 2048, the size of the game texture). Resize it, or save it as DDS in a DDS editor and bring the .dds.', { n, w: img.w, h: img.h });
  if (img.w > 8192 || img.h > 8192) throw H.bad(n + ' is ' + img.w + 'x' + img.h + ': the game loads at most 8192 on a side (FMT-02).');
  const rgba = img.rgba;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) throw H.badK('task.skin.e.gohalpha', n + ' has see through parts. This tool makes DXT1 only (no see through parts). Save it as DDS (DXT5, mipmaps on) in a DDS editor (the hand off on the picture step) and bring the .dds.', { n });
  if (want && want.w && (want.w !== img.w || want.h !== img.h)) notes.push(n + ' is ' + img.w + 'x' + img.h + ', the game texture is ' + want.w + 'x' + want.h + '. The model keeps its mapping, so the picture must have the same layout.');
  const out = path.join(c.staging, 'dds', n.replace(/\.[^.]+$/, '') + '.dds');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, require('../../../../lib/model/ddsenc').encode(rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba), img.w, img.h, { mips: true }));
  notes.push(n + ' is made a DXT1 DDS with mipmaps here (no see through parts). Want DXT5 or a better encoder? Save it as DDS yourself and bring the .dds [T].');
  return { file: out, made: true };
}

// compile on GoH. H: the recipe's helpers (bad, badK, lc, stemOf, dirOf, extOf, unitOf, mainTexture, checkDds, isDds, decodeAny,
// OPTIONS, SUFFIX, art)
// ---- a soldier look: def stem -> {def, mdl, dir, folder, parent} (the def's {extension} names the .mdl beside it)
const HS = 'resource/entity/humanskin/', BREED = 'resource/set/breed/';
const lcs = s => String(s == null ? '' : s).toLowerCase();
function lookOf(V, look) {
  const id = lcs(look).replace(/^.*\//, '').replace(/\.def$/, '');
  if (!/^[a-z0-9_.-]{1,80}$/.test(id)) return null;
  const def = [...V.keys()].find(k => k.startsWith(HS) && k.endsWith('/' + id + '.def'));
  if (!def) return null;
  const dir = def.slice(0, def.lastIndexOf('/')), t = V.readAny(V.get(def)).toString('latin1'), m = /\{\s*extension\s+"([^"]+)"/i.exec(t);
  const mdl = m && !/[\\/]/.test(m[1]) ? dir + '/' + lcs(m[1]) : null;
  return { id, def, defText: t, mdl: mdl && V.has(mdl) ? mdl : null, mdlName: m ? m[1] : '', dir, folder: dir.slice(dir.lastIndexOf('/') + 1), parent: dir.slice(0, dir.lastIndexOf('/')) };
}
// the pictures the materials of a look's folder name: [{mtl, word, path, stem, key}] (key: the game file, '$' = resource/texture/common)
function lookTextures(V, L) {
  const out = [];
  for (const k of V.keys()) {
    if (!k.startsWith(L.dir + '/') || !k.endsWith('.mtl') || k.slice(L.dir.length + 1).includes('/')) continue;
    const t = V.readAny(V.get(k)).toString('latin1'), re = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s+"([^"]+)"/g; let m;
    while ((m = re.exec(t))) {
      const p = m[2].replace(/\\/g, '/'), w = lcs(m[1]);
      if (w === 'material' || !/[/$]/.test(p)) continue;
      const base = lcs(p.replace(/^\$\//, 'resource/texture/common/')).replace(/\.(dds|tga|png)$/, '');
      const key = ['.dds', '.tga'].map(e => base + e).find(x => V.has(x)) || null;
      out.push({ mtl: k, word: w, path: m[2], stem: base.slice(base.lastIndexOf('/') + 1), key });
    }
  }
  return out;
}
// the picture a look shows most: the diffuse of its uniform material, else the first diffuse
function lookMain(V, look) {
  const L = lookOf(V, look); if (!L) return null;
  const ts = lookTextures(V, L).filter(x => x.word === 'diffuse' && x.key);
  return (ts.find(x => /uniform/.test(x.mtl.slice(x.mtl.lastIndexOf('/')))) || ts[0] || {}).key || null;
}
// the breeds that wear a look ({skin "<look>"} in resource/set/breed/..)
function breedsOf(V, look) {
  const re = new RegExp('\\{\\s*skin\\s+"' + lcs(look).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'i'), out = [];
  for (const k of V.keys()) if (k.startsWith(BREED) && k.endsWith('.set') && re.test(V.readAny(V.get(k)).toString('latin1'))) out.push(k);
  return out.sort();
}
function soldierLook(c, H, V, files, notes) {
  const copies = [], st = (rel, text) => { const f = path.join(c.staging, 'look', ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text, 'latin1')); copies.push({ staged: 'look/' + rel, to: null }); return copies[copies.length - 1]; };
  const L = lookOf(V, c.value('look') || (c.base && c.base.id));
  if (!L) throw H.bad('Pick the soldier look to start from (a humanskin of the game or your mod).');
  if (!L.mdl) throw H.bad('The look ' + L.id + ' names ' + (L.mdlName || 'no model') + ' in its def, which is not in its folder ' + L.dir + '; pick another look.');
  const id = lcs(c.value('look_id') || '').trim();
  if (!/^[a-z0-9][a-z0-9_]{0,39}$/.test(id)) throw H.bad('Type a name for the new look: small English letters, digits and _, starting with a letter or digit.');
  if (id === L.id) throw H.bad('The new look needs its own name.');
  if (lookOf(V, id)) throw H.bad('A look ' + id + ' is already there; Gates of Hell finds a look by its name, so pick another.');
  const nd = L.parent + '/' + id;
  if ([...V.keys()].some(k => k.startsWith(nd + '/'))) throw H.bad('The folder ' + nd + ' is already there; pick another name.');
  // the def: its {extension} names the new model
  st(nd + '/' + id + '.def', L.defText.replace(/(\{\s*extension\s+")[^"]+(")/i, (m, a, b) => a + id + '.mdl' + b)).to = nd + '/' + id + '.def';
  // the model: a mesh path inside the old folder ("heads/x.ply") is made "../<old folder>/heads/x.ply"; "../[ger_source]/.." stays
  let mt = V.readAny(V.get(L.mdl)).toString('latin1'), moved = 0;
  mt = mt.replace(/(\{\s*[A-Za-z_]+\s+")([^"$:]+\.(?:ply|vol|anm|mdl))(")/gi, (m, a, p, b) => (/^(\.\.[\\/]|[\\/])/.test(p) ? m : (moved++, a + '../' + L.folder + '/' + p + b)));
  st(nd + '/' + id + '.mdl', mt).to = nd + '/' + id + '.mdl';
  if (moved) notes.push(moved + ' part paths of ' + L.id + '.mdl point into its own folder; the copy names them ../' + L.folder + '/.. so the parts are shared [I].');
  // the pictures: each brought one replaces the picture of the same name in the folder's materials (the first one: the uniform's)
  const tex = lookTextures(V, L), main = (tex.find(x => x.word === 'diffuse' && /uniform/.test(x.mtl.slice(x.mtl.lastIndexOf('/')))) || tex.find(x => x.word === 'diffuse') || {}).stem;
  const stemOf = f => lcs(path.basename(f)).replace(/\.[a-z0-9]+$/, '').split('#')[0];
  const put = new Map();
  files.forEach((f, i) => {
    let s = stemOf(f);
    if (!tex.some(x => x.stem === s)) {
      if (i === 0 && main && !/_(bp|sp|nm|n)$/.test(s)) s = main;
      else throw H.bad(path.basename(f) + ': name the picture after the one of ' + L.id + ' it paints (' + [...new Set(tex.map(x => x.stem))].slice(0, 10).join(', ') + ').');
    }
    if (put.has(s)) throw H.bad('Two pictures paint ' + s + '; bring one.');
    const want = (tex.find(x => x.stem === s && x.key) || {}).key, info = want ? H.art().imgInfo(V.readAny(V.get(want)), H.extOf(want)) : null;
    const d = ddsOf(c, f, H, notes, info);
    put.set(s, d.file);
  });
  const TD = '_hum/arsenal_' + id + '/';
  for (const [s, f] of put) copies.push({ staged: path.relative(path.resolve(c.staging), path.resolve(f)).replace(/\\/g, '/'), to: 'resource/texture/common/' + TD + s + '.dds' });
  // the materials: all of the old folder; the ones that name a brought picture are rewritten, the others copied as they are
  const mtls = [...new Set(tex.map(x => x.mtl))].concat([...V.keys()].filter(k => k.startsWith(L.dir + '/') && k.endsWith('.mtl') && !k.slice(L.dir.length + 1).includes('/') && !tex.some(x => x.mtl === k)));
  let changed = 0;
  for (const k of [...new Set(mtls)]) {
    const name = k.slice(L.dir.length + 1), to = nd + '/' + name, mine = tex.filter(x => x.mtl === k && put.has(x.stem));
    if (!mine.length) { copies.push({ key: k, to }); continue; }
    let t = V.readAny(V.get(k)).toString('latin1');
    for (const x of mine) t = t.split('"' + x.path + '"').join('"$/' + TD + x.stem + '"');
    st(to + '', t).to = to; changed++;
  }
  if (files.length && !changed) throw H.bad('No material of ' + L.id + ' names the pictures you brought.');
  if (!files.length) notes.push('The new look ' + id + ' wears the pictures of ' + L.id + '; bring pictures to paint it (named after the ones it paints: ' + [...new Set(tex.map(x => x.stem))].slice(0, 6).join(', ') + ').');
  else notes.push(changed + ' materials of the new look name your pictures in resource/texture/common/' + TD + '; the others keep the pictures of ' + L.id + '. A season picture (#winter) of the old one is not used by the new pictures [I] [T].');
  // the breeds that wear it now
  const br = [].concat(c.value('look_breed') || []).map(x => lcs(String(x).trim())).filter(Boolean);
  for (const k of br) {
    if (!k.startsWith(BREED) || !k.endsWith('.set') || k.includes('..') || !V.has(k)) throw H.bad('Pick the breed from the list (' + k + ' is not one).');
    const t = V.readAny(V.get(k)).toString('latin1'), re = /(\{\s*skin\s+")([^"]*)(")/i, m = re.exec(t);
    if (!m) throw H.bad(k + ' names no skin; pick a breed that wears ' + L.id + '.');
    st('breed/' + k.slice(BREED.length), t.replace(re, (x, a, b, e) => a + id + e)).to = k;
    notes.push(k + ' wears ' + id + ' in your mod (was ' + m[2] + ') [T].');
  }
  if (!br.length) notes.push('Give a soldier this look: pick its breed here, or set {skin "' + id + '"} in a breed in the soldier task.');
  notes.push('The new look is ' + nd + '/' + id + '.def; check it in game [T].');
  return { copies, notes, result: id };
}

function compile(draft, c, H) {
  const g = gameG(c.gameDir);
  if (!g) throw H.badK('task.skin.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the unit\'s def and textures.');
  const kind = String(c.value('kind') || 'camo');
  const C = H.art(), mod = c.mod && fs.existsSync(c.mod) ? c.mod : null, V = C.view(g, mod), copies = [], notes = [], ops = [], calls = [];
  if (kind === 'soldier') {
    const a = c.answer('image_look'), fl = a && a.src === 'file' ? [].concat(c.value('image_look') || []).filter(Boolean) : [];
    for (const f of fl) if (!fs.existsSync(f)) throw H.bad('A picture you brought is gone from the staging folder: ' + path.basename(f) + '. Bring it again.');
    return soldierLook(c, H, V, fl, notes);
  }
  const iq = { camo: 'image', replace: 'image_dds', fixed: 'image_wear' }[kind] || 'image';
  const a = c.answer(iq), files = a && a.src === 'file' ? [].concat(c.value(iq) || []).filter(Boolean) : [];
  for (const f of files) if (!fs.existsSync(f)) throw H.bad('A picture you brought is gone from the staging folder: ' + path.basename(f) + '. Bring it again.');
  const saved = [].concat(c.value('gametex') || []).filter(Boolean).map(n => { try { return c.stagedPath(n); } catch (e) { return null; } }).filter(p => p && fs.existsSync(p));
  for (const f of files) { const sz = fs.statSync(f).size; if (saved.some(s => fs.statSync(s).size === sz && fs.readFileSync(s).equals(fs.readFileSync(f)))) throw H.bad(path.basename(f) + ' is the game texture you saved, unchanged. Paint it first, then bring it again.'); }
  const unit = H.unitOf(c.value('unit') || (c.base && c.base.id));
  if (!unit) throw H.bad('Pick the unit that gets the skin.');
  const info = C.camoInfo(g, mod, unit);
  if (!info.found) throw H.bad('Unit not found: ' + unit + (info.suggestions && info.suggestions.length ? ' (did you mean ' + info.suggestions.slice(0, 5).join(', ') + '?)' : ''));
  const staged = f => path.relative(path.resolve(c.staging), path.resolve(f)).replace(/\\/g, '/');
  const fileStem = f => H.stemOf(H.lc(f)).split('#')[0];
  const shared = t => { if (/^resource\/texture\//.test(t)) notes.push(t + ' is in the shared texture folder: every unit whose material names it shows the new picture too (GoH keeps most unit textures there).'); };
  // the picture i paints: the first one the picked (or main) texture, more pictures the texture of the unit they are named after
  const texOf = (f, i, first) => {
    if (i === 0) return first;
    const s = fileStem(f), hit = info.textures.find(t => H.stemOf(H.lc(t.key)) === s);
    if (!hit) throw H.bad(path.basename(f) + ': name an extra picture after the texture of ' + unit + ' it paints (' + [...new Set(info.textures.map(t => H.stemOf(H.lc(t.key))))].slice(0, 8).join(', ') + ').');
    return H.lc(hit.key);
  };

  if (kind === 'fixed') {
    const v = String(c.value('wear') || '').trim();
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(v)) throw H.bad('Pick the paint scheme the unit always wears (or type a new name).');
    const main = H.mainTexture(info);
    files.forEach((f, i) => {
      const t = texOf(f, i, main), d = ddsOf(c, f, H, notes, null);
      copies.push({ staged: staged(d.file), to: H.dirOf(t) + '/' + H.stemOf(t).split('#')[0] + '#' + H.lc(v) + '.dds' });
      shared(t);
    });
    const has = info.textures.some(x => x.variants.includes(H.lc(v)) || x.variants.includes(v) || ebmVariants(V, x.key).includes(H.lc(v))) || (info.meshes || []).some(m => m.variants.includes(H.lc(v)));
    if (!files.length && !has) throw H.bad(unit + ' has no paint scheme ' + v + ' yet: bring its pictures on the picture step, or pick a scheme from the list.');
    const t = require('../../../../lib/sdlwrite').parse(V.readAny(V.get(info.def)));
    const root = (t.root.items || []).find(x => x.type === 'block' || x.type === 'list');
    const rn = root && root.name ? String(root.name).replace(/^"|"$/g, '') : 'game_entity';
    if (info.texmod && H.lc(info.texmod) === H.lc(v)) notes.push(unit + ' already wears ' + v + ' ({texmod} in its def): only the pictures change.');
    else ops.push({ op: 'set', rows: [{ entity: 'file:' + info.def, path: rn + '/texmod', value: '"' + v + '"', op: info.texmod ? 'set' : 'add' }] });
    notes.push(unit + ' always wears its paint scheme ' + v + ' in your mod, on every map [T].');
    return { gen: ops.length ? { ops } : null, copies, notes, result: v };
  }

  const tex = H.lc(c.value('texture') || H.mainTexture(info));
  if (!tex || !V.has(tex)) throw H.bad('Pick the texture of ' + unit + ' to paint (the game has no ' + (tex || 'texture') + ').');
  if (!files.length) throw H.bad(kind === 'replace' ? 'Bring the picture of the new skin as DDS.' : 'Bring the picture of the new skin (DDS is best; PNG, TGA or BMP without see through parts are made DDS here).');
  const want = C.imgInfo(V.readAny(V.get(tex)), H.extOf(tex)) || null;
  if (want && /^(ATI2|BC5U)$/.test(want.format || '')) notes.push(tex + ' is a BC5 normal map (GHFMT-03): bring a BC5 DDS for it.');

  if (kind === 'replace') {
    files.forEach((f, i) => {
      const t = texOf(f, i, tex);
      if (!H.isDds(f)) throw H.bad(path.basename(f) + ' is not a DDS: replace takes DDS only (the game looks for .dds first, FMT-04).');
      H.checkDds(fs.readFileSync(f), path.basename(f), notes, i === 0 ? want : null);
      copies.push({ staged: staged(f), to: H.dirOf(t) + '/' + H.stemOf(t).split('#')[0] + '.dds' });
      shared(t);
    });
    return { copies, notes, result: tex };
  }

  // camo: <texture>#<variant>.dds beside each texture; the def's TexMods line only when no rule of the game maps the option to it
  const option = String(c.value('option') || 'Winter');
  if (!H.OPTIONS.includes(option)) throw H.bad('Pick when the camouflage is worn.');
  const seasons = seasonMap(V), typed = String(c.value('variant') || '').trim();
  const have = new Set(); for (const x of info.textures) { for (const v of x.variants) have.add(H.lc(v)); for (const v of ebmVariants(V, x.key)) have.add(v); }
  // no name typed: the name the unit uses already for that season (winter, win), else the seasons.inc one, else the AS2 suffix
  const variant = typed || [option.toLowerCase(), seasons.get(option.toLowerCase())].find(x => x && have.has(x)) || seasons.get(option.toLowerCase()) || H.SUFFIX[option];
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(variant)) throw H.bad('The variant name can use English letters, digits, _, dot and minus.');
  const lv = H.lc(variant), mapped = info.texmods.some(p => H.lc(p[0]) === option.toLowerCase() && H.lc(p[1]) === lv) || seasons.get(option.toLowerCase()) === lv;
  files.forEach((f, i) => {
    const t = texOf(f, i, tex), vk = H.dirOf(t) + '/' + H.stemOf(t).split('#')[0] + '#' + lv;
    const d = ddsOf(c, f, H, notes, i === 0 ? want : null);
    copies.push({ staged: staged(d.file), to: vk + '.dds' });
    if (V.has(vk + '.dds') || V.has(vk + '.ebm')) notes.push('The game already has the #' + lv + ' picture of ' + H.stemOf(t).split('#')[0] + ': yours replaces it in your mod.');
    if (V.has(vk + '.ebm')) notes.push(vk + '.ebm is a wrapper the game may read before the .dds; check the new paint shows [T].');
    shared(t);
  });
  if ((info.meshes || []).some(m => m.variants.includes(lv))) notes.push(unit + ' also has a #' + lv + ' mesh (GHFMT-10): it is used with your paint.');
  if (mapped) notes.push('The game maps ' + option + ' to ' + lv + ' already (seasons.inc or the def): no def line is written.');
  else if (lv === option.toLowerCase()) notes.push('No def line is written: GoH units wear #' + lv + ' on ' + option + ' maps by name, as its own #winter pictures do [I] [T].');
  else {
    calls.push({ route: 'POST /api/x/art/camo-write', body: { name: unit, option, variant: lv } });
    if (info.inheritsOnly) notes.push(unit + ' has no TexMods block of its own; a new one is added to its def [T]: check the old variants still show in the game.');
  }
  return { copies, calls, notes, result: lv };
}

module.exports = { gohDirOf, gameG, ebmVariants, seasonMap, ddsOf, compile, lookOf, lookTextures, lookMain, breedsOf };
