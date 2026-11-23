// Models page part `look` (sub/README.md): the texture variants of the open model and the human skins. Reads only: writes nothing.
// Engine facts with their source lines: ../../units/look.js (a variant is a file "<texture>#<variant>.<ext>" beside a texture, a def
// names its own with {texmod "x"}, a soldier's skin is the {skin} line of his file; Gates of Hell soldiers also have "<mesh>#<variant>.ply"
// meshes). The file reading is the Units page's (../../units/texvar.js), on the same kept reader as its look routes.
//   POST /api/x/models/look { target, mod? } -> { ok, target, def (the def's game key | null), model (the .mdl key | null), entity,
//     human (a soldier skin), skin (its name, '' = not a skin), goh, textures (how many textures the model names),
//     variants [{ name, textures, meshes }], current (the def's own {texmod}, '' = none), hasLine, known (current has files),
//     aliases [[name, variant]] of {TexMods}, worn (how many multiplayer soldiers wear the skin), by [{ id, name }] (the first six:
//     id = the soldier's unit id on the Units page "mp/<army>/<name>", name = the game's name or ''), unit ({ id, name } of the
//     vehicle's unit card when the Units page lists it, else null) }  |  { ok: false, error: plain sentence }
//     target: an entity name, the game key or disk path of a .def / .mdl / soldier .set, or breed:<name> (tools/soedit/target.js)
//   POST /api/x/models/look/skins { mod?, lang? } -> the Units page's skin list (../../units/server.js lookSkins):
//     { skins [{ skin, group, sub, file, texmod, worn, by [{ id, name }] }], groups [{ group, n }], total }
//   POST /api/x/models/look/pose { target, variant?, kind?, mod? } -> { ok, scene (scene/1, the Units line-up of that one model:
//     a soldier skin stands at rest on the shared human skeleton; a Gates of Hell variant also shows its "#variant.ply" meshes),
//     figures, notes, variant (the one shown, '' = none), swapped (meshes drawn from variant files) }  |  { ok: false, error }
//     variant: a name, or false / '-' = the plain textures whatever the def says, absent = as the def has it.
//     kind: 'soldier' | 'vehicle' (default: soldier for a skin or a soldier file, else vehicle)
// Body fields of every route: gid 'as64' | 'mowas2' | 'goh' (or exe, as the other Models routes; default: the page's game),
// game = the install folder (default: the page's).
// Author: Imperator_Aug (ARSENAL, ia-494f3ddb)
'use strict';
const path = require('path');
const TG = require('../../../../soedit/target');
const G = require('../game');
const U = () => require('../../units/server').lib;
const lc = s => String(s == null ? '' : s).toLowerCase();
const fwd = s => String(s).replace(/\\/g, '/');
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VAR = /^[a-z0-9_][a-z0-9_.\-]{0,40}$/;

// the game, the mod and the kept reader of a request, as the Units page's look routes open them
async function open(ctx, b) {
  const L = U(), body = Object.assign({}, b, { gid: b.gid || G.idOf(ctx, b) });
  const game = L.gameOf(ctx, body), mod = L.modOf(body, game, false), gid = L.gidOf(ctx, body, game);
  const { cur } = await L.both(ctx, game, mod, true);
  return { L, T: L.texvar(), body, game, mod, gid, goh: gid === 'goh', cur, c: L.kitCtx(cur, ctx, game, mod, gid) };
}
// a disk path or a game key -> the key under resource/ ('' = not one)
function keyOf(v) {
  const a = lc(fwd(v)), i = a.lastIndexOf('/resource/');
  return i >= 0 ? a.slice(i + 1) : a.startsWith('resource/') ? a : '';
}
// the def of an entity name: the mod's own first, a skin by the skin list (one name in two folders: the engine keeps one)
function defOf(o, name) {
  const n = lc(name), sk = o.T.skinKey(o.c, n);
  if (sk) return sk;
  const hits = o.c.keys(new RegExp('^resource/entity/(?:.*/)?' + esc(n) + '\\.def$')), mine = hits.filter(k => o.c.inMod(k));
  return mine[0] || hits.sort()[0] || null;
}
// target -> { def, mdl, breed } | { error }
function find(o, target) {
  const p = TG.parse(target);
  if (p.error) return { error: p.error };
  let def = null, mdl = null, breed = null, name = null;
  if (p.form === 'breed') breed = 'resource/set/breed/' + lc(p.value) + '.set';
  else if (p.form === 'name') name = p.value;
  else {
    const k = p.form === 'pak' ? '' : keyOf(p.value);
    if (!k || !o.c.exists(k)) return { error: 'The file ' + fwd(p.value) + ' is not in the mod folder or the game.' };
    if (p.ext === '.set') breed = k; else if (p.ext === '.def') def = k; else if (p.ext === '.mdl') mdl = k;
    else return { error: 'Pick a model: a unit name or a .mdl or .def file.' };
  }
  if (breed) {
    const t = o.c.readStr(breed);
    if (t == null) return { error: 'No soldier file ' + breed.slice('resource/'.length) + ' in the mod folder or the game.' };
    name = TG.skinOf(Buffer.from(t, 'latin1'));
    if (!name) return { error: 'The soldier file ' + breed.slice('resource/'.length) + ' names no skin.' };
  }
  if (name) { def = defOf(o, name); if (!def) return { error: 'No entity named "' + name + '" in the mod folder or the game.' }; }
  // a .mdl given by itself: the def of the same name beside it, when there is one (its {texmod} line is then shown)
  if (mdl && !def) { const d = mdl.replace(/\.mdl$/, '.def'); if (o.c.exists(d)) def = d; }
  return { def, mdl, breed };
}

async function lookRoute(ctx, b) {
  try {
    if (!String(b.target || '').trim()) return { ok: false, error: 'Pick a model first: a unit name or the path to a .mdl file.' };
    const o = await open(ctx, b), f = find(o, b.target);
    if (f.error) return { ok: false, error: f.error };
    const T = o.T, c = o.c, D = f.def ? T.defLook(c, f.def) : { found: false };
    const V = f.def && D.found && (!f.mdl || T.mdlOf(c, f.def, D) === f.mdl) ? T.variantsOf(c, f.def, o.goh, D) : T.variantsOfMdl(c, f.mdl || (f.def ? T.mdlOf(c, f.def, D) : null), o.goh);
    const entity = f.def ? T.stemOf(f.def) : '', human = !!((f.def || V.mdl || '').startsWith(T.SKIN_ROOT));
    const isSkin = human && !!f.def && T.skinKey(c, entity) === f.def;
    const users = isSkin ? (T.skinUsers(c).get(entity) || []) : [];
    const by = users.slice(0, 6).map(p => { const x = o.cur.byId.get('mp/' + p); return { id: 'mp/' + p, name: (x && x.name) || '' }; });
    const u = !human && entity ? o.cur.byId.get(entity) : null;
    const current = D.found ? D.texmod || '' : '';
    return { ok: true, target: String(b.target), def: f.def, model: V.mdl || null, entity, human, skin: isSkin ? entity : '', goh: o.goh,
      textures: V.textures, variants: V.variants, current, hasLine: !!(D.found && D.lines > 0), known: !current || V.variants.some(v => v.name === current),
      aliases: D.found ? D.aliases : [], worn: users.length, by, unit: u ? { id: u.id, name: u.name || '' } : null };
  } catch (e) {
    if (e && e.status === 400) return { ok: false, error: String(e.message).split('\n')[0] };
    throw e;
  }
}
async function skinsRoute(ctx, b) {
  const L = U();
  return L.lookSkins(ctx, Object.assign({}, b, { gid: b.gid || G.idOf(ctx, b) }));
}
async function poseRoute(ctx, b) {
  try {
    if (!String(b.target || '').trim()) return { ok: false, error: 'Pick a model first.' };
    const o = await open(ctx, b), f = find(o, b.target);
    if (f.error) return { ok: false, error: f.error };
    const human = !!f.breed || !!((f.def || f.mdl || '').startsWith(o.T.SKIN_ROOT));
    const kind = b.kind === 'vehicle' || b.kind === 'soldier' ? b.kind : human ? 'soldier' : 'vehicle';
    const variant = b.variant === false || b.variant === '-' ? '-' : VAR.test(lc(b.variant || '')) ? lc(b.variant) : '';
    const name = f.def ? o.T.stemOf(f.def) : path.posix.basename(f.mdl || '', '.mdl');
    const r = await require('../../units/lineup').lineup({ game: o.game, gid: o.gid, mod: o.mod, max: 1,
      models: [Object.assign({ kind, target: String(b.target), id: name, name, n: 1 }, variant ? { variant } : {})] });
    const fig = (r.figures || [])[0];
    if (!fig) return { ok: false, error: (r.notes || [])[0] || 'The model could not be shown.' };
    return { ok: true, scene: r.scene, figures: r.figures, notes: r.notes || [], variant: fig.variant || '', swapped: fig.swapped || 0, kind };
  } catch (e) {
    if (e && e.status === 400) return { ok: false, error: String(e.message).split('\n')[0] };
    throw e;
  }
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  routes: { 'POST /api/x/models/look': wrap(lookRoute), 'POST /api/x/models/look/skins': wrap(skinsRoute), 'POST /api/x/models/look/pose': wrap(poseRoute) },
  _t: { keyOf, find },
};
