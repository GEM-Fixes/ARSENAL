// recipe "make or change a skin": a camouflage (a picture variant the def's TexMods picks per season or option), a plain texture
// replacement, a fixed variant the unit always wears ({texmod "x"}), or a new soldier look (a humanskin copied from another one).
// Contract: ../README.md. Census: census/skin.json. Page side: skin.client.js (kind "gametex": POST /api/x/task/r/skin/gametex saves
// the game texture to paint over as PNG and as it is in the staging folder, then shows it in its folder). Each kind has its own
// picture question that takes at upload only what that kind can write (camo: DDS, PNG, TGA, BMP; the others DDS).
// Tool steps: the gen skin op (a DDS variant <texture>#<id>.dds of a unit, {texmod} with texmod:true, a humanskin copy with renamed
// def / mdl / textures), the gen set op ({texmod} without a picture), the Art page's POST /api/x/art/camo-write (the def's TexMods line;
// dry in plan, restore point at Write) and copies. Gap (named in kept and the notes): nothing in the repo writes DDS, and no route turns
// a picture into a model texture TGA; a PNG/BMP/GIF/PSD camouflage is made a 32 bit TGA here (artport) in the staging folder.
// Author: Imperator_Aug (ARSENAL, ia-3a4f0b00)
'use strict';
const fs = require('fs'), path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const art = () => require('../../art/core');
const lc = s => String(s == null ? '' : s).toLowerCase().replace(/\\/g, '/');
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i).toLowerCase(); };
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
const stemOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? b : b.slice(0, i); };
const unitOf = v => lc(v).replace(/\.def$/, '').split('/').pop();
const GEN_ID = /^[a-z0-9][a-z0-9_]*$/;   // what the gen skin op takes as a variant or humanskin id
const HS = 'resource/entity/humanskin/';
// seasons.inc option names and the variant suffix vanilla uses for each (census variant.texmods / variant.file)
const OPTIONS = ['Autumn', 'AutumnL', 'Winter', 'Bare', 'Spring', 'V1', 'V2', 'V3'];
const SUFFIX = { Autumn: 'aut', AutumnL: 'autlate', Winter: 'win', Bare: 'bare', Spring: 'spring', V1: '1', V2: '2', V3: '3' };
const ROLES = ['diffuse', 'bump', 'specular'];

// the unit's main texture: the one in the unit's own folder, the one with variants first
function mainTexture(info) {
  const t = (info && info.textures) || [], d = info && info.def ? dirOf(info.def) : '';
  const own = t.filter(x => dirOf(x.key) === d);
  return ((own.find(x => x.variants.length) || own[0] || t[0]) || {}).key || null;
}
// any picture -> {w, h, rgba} for the TGA writer (the named gap: no route makes a model texture)
function decodeAny(buf, name) {
  const A = require('../../../../artport/artport'), P = require('../../../../lib/model/picture');
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504E47) return A.decodePng(buf);
  if (buf.length > 6 && buf.toString('latin1', 0, 3) === 'GIF') return A.decodeGif(buf);
  const type = buf.toString('latin1', 0, 2) === 'BM' ? 'bmp' : buf.toString('latin1', 0, 4) === '8BPS' ? 'psd' : /\.jpe?g$/i.test(name) ? 'jpg' : 'tga';
  if (type === 'jpg') throw bad('A JPG picture cannot be converted here. Save it as PNG or DDS and bring it again.');
  const r = P.decode(type, buf);
  if (!r || r.error || !r.rgba) throw bad('The picture ' + name + ' cannot be read: ' + ((r && r.error) || 'unknown format') + '.');
  return { w: r.width, h: r.height, rgba: r.rgba };
}
// size and format checks the game cares about (census tex.dds.*), as notes; a DDS the game cannot load is refused
function checkDds(buf, label, notes, want) {
  const C = art(), i = C.imgInfo(buf, '.dds');
  if (!i || !i.w) throw bad('The file ' + label + ' is not a DDS picture.');
  if (i.w > 8192 || i.h > 8192) throw bad(label + ' is ' + i.w + 'x' + i.h + ': the game loads at most 8192 on a side (FMT-02).');
  for (const w of i.warn || []) notes.push(label + ': ' + w);
  if ((i.w & (i.w - 1)) || (i.h & (i.h - 1))) notes.push(label + ' is ' + i.w + 'x' + i.h + ': not a power of two (128, 256, 512, 1024, 2048). Almost every game texture is; it may look blurred or fail on old cards (FMT-02).');
  if (!i.mips) notes.push(label + ' has no mipmaps: far away it shimmers. Save it with mipmaps in the DDS editor.');
  if (want && want.w && (want.w !== i.w || want.h !== i.h)) notes.push(label + ' is ' + i.w + 'x' + i.h + ', the game texture is ' + want.w + 'x' + want.h + '. The model keeps its mapping, so the picture must have the same layout.');
  return i;
}
const isDds = f => { try { const b = Buffer.alloc(4), fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('latin1') === 'DDS '; } catch (e) { return false; } };
// game parity: the game art/core reads. AS64: the AS2 install folder (as before: the vfs picks as64). MoW:AS2: {dir, exe 'mowas_2',
// kind}, so the shared install shows no as64/core (art/core keys its cache by folder and exe). The game is x (draft.game, c.game,
// opt.game), else ctx.task.id, else ctx.gameId (a string in values, a function on a route ctx). GoH (2026-11-23): {dir: the GoH
// install, exe 'goh', kind 'goh'}; its compile is skin.goh.js (camo, replace, fixed, and a new soldier look as a sibling humanskin folder).
const GM = require('../../../../lib/games');
function gidOf(ctx, x) {
  let v = x;
  if (!v && ctx && ctx.task && ctx.task.id) v = ctx.task.id;
  if (!v && ctx) { try { v = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { v = null; } }
  return GM.idOf(v) || 'as64';
}
const SG = () => require('./skin.goh');
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const viewG = (dir, id) => (!dir ? null : id === 'goh' ? SG().gameG(dir) : id === 'as64' ? dir :{ dir, exe: GM.exeOf(id), kind: GM.kindOf(id) });
const noGame = gid => (gid === 'goh' ? badK('task.skin.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the unit\'s def and textures.') : bad('Set the game folder first (the Game folder button at the top): the task reads the unit\'s def and textures.'));
const gameOf = (ctx, x) => { const id = gidOf(ctx, x); let d = null; try { d = id === 'goh' ? SG().gohDirOf(ctx) : (ctx && ctx.game && ctx.game()) || null; } catch (e) { d = null; } return viewG(d, id); };

// lookup "humanskin": the soldier looks of the game and the mod (resource/entity/humanskin/<id>/<id>.def)
async function lookHumanskin(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g) return [];
  const V = art().view(g, opt && opt.mod && fs.existsSync(opt.mod) ? opt.mod : null), ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [];
  // GoH: every look by its def name (resource/entity/humanskin/[germans]/ger_heer_39/ger_heer_39_at.def), several per folder
  if (g.kind === 'goh') {
    for (const k of V.keys()) {
      const m = /^resource\/entity\/humanskin\/(.+)\/([^/]+)\.def$/.exec(k);
      if (!m || (ws.length && !ws.every(w => m[2].includes(w) || m[1].includes(w)))) continue;
      out.push({ id: m[2], name: m[2], where: V.m.has(k) ? 'mod' : 'game', ref: { key: k }, sub: m[1] });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  for (const k of V.keys()) {
    const m = /^resource\/entity\/humanskin\/([^/]+)\/([^/]+)\.def$/.exec(k);
    if (!m || m[1] !== m[2] || (ws.length && !ws.every(w => m[1].includes(w)))) continue;
    out.push({ id: m[1], name: m[1], where: V.m.has(k) ? 'mod' : 'game', ref: { key: k }, sub: 'humanskin' });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// lookup "gohbreed" (GoH): the breeds that wear the look of the draft ({skin "<look>"} in resource/set/breed/..)
async function lookGohBreed(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g || g.kind !== 'goh') return [];
  let look = ''; try { const d = opt && opt.draft ? D_().load(ctx, String(opt.draft)) : null; look = lc(d && ((d.answers && d.answers.look && d.answers.look.value) || (d.base && d.base.id)) || ''); } catch (e) { look = ''; }
  if (!look) return [];
  const V = art().view(g, opt && opt.mod && fs.existsSync(opt.mod) ? opt.mod : null), w = lc(words).trim();
  return SG().breedsOf(V, look.replace(/^.*\//, '').replace(/\.def$/, '')).filter(k => !w || k.includes(w)).map(k => ({ id: k, name: k.slice('resource/set/breed/'.length), where: V.m.has(k) ? 'mod' : 'game', ref: { key: k }, sub: 'wears ' + look }));
}
// the unit a lookup or route works on: the unit answer (opt.in), else the draft's base
function unitFor(ctx, inV, draftId) {
  let u = unitOf(inV);
  if (!u && draftId) { try { const d = require('../lib/draft').load(ctx, String(draftId)); u = unitOf(d.answers && d.answers.unit && d.answers.unit.value || (d.base && d.base.id)); } catch (e) { /* no draft */ } }
  return u;
}
// lookup "variant": the paint schemes a unit has (the part after # of its textures), and a typed new name
async function lookVariant(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g) return [];
  const unit = unitFor(ctx, opt && opt.in, opt && opt.draft); if (!unit) return [];
  let info = null; try { info = art().camoInfo(g, opt && opt.mod && fs.existsSync(opt.mod) ? opt.mod : null, unit); } catch (e) { return []; }
  if (!info || !info.found) return [];
  const w = String(words || '').trim(), lw = w.toLowerCase(), seen = new Map();
  const ebm = g.kind === 'goh' ? (k => SG().ebmVariants(art().view(g, opt && opt.mod && fs.existsSync(opt.mod) ? opt.mod : null), k)) : () => [];
  for (const t of info.textures || []) for (const v of (t.variants || []).concat(ebm(t.key))) { const k = String(v); if (!seen.has(k)) seen.set(k, []); seen.get(k).push(stemOf(lc(t.key)).split('#')[0]); }
  const opt2 = (info.texmods || []).reduce((m, [o, v]) => { m[String(v)] = (m[String(v)] || []).concat(o); return m; }, {});
  const out = [...seen.entries()].filter(([k]) => !lw || k.toLowerCase().includes(lw))
    .map(([k, ts]) => ({ id: k, name: k + (opt2[k] ? ' (' + opt2[k].join(', ') + ')' : ''), where: 'game', sub: 'variant of ' + [...new Set(ts)].slice(0, 3).join(', ') }));
  const exact = out.some(x => x.id.toLowerCase() === lw);
  if (w && !exact && /^[a-z0-9][a-z0-9_]{0,39}$/.test(w)) out.unshift({ id: w, name: w, where: 'new', sub: 'a new paint scheme: bring its pictures' });
  return { results: out, exact };
}
// the game texture a skin paints: the picked texture, the unit's main one, or the soldier look's diffuse
function paintKey(V, C, g, mod, c) {
  const kind = String(c.value('kind') || 'camo');
  if (kind === 'soldier') {
    if (g && g.kind === 'goh') return SG().lookMain(V, c.value('look') || (c.base && c.base.id));
    const look = lc(c.value('look') || (c.base && c.base.id) || '').replace(/^.*humanskin\//, '').replace(/\/.*$/, '').replace(/\.def$/, '');
    for (const e of ['.dds', '.tga']) if (look && V.has(HS + look + '/' + look + e)) return HS + look + '/' + look + e;
    return null;
  }
  const unit = unitOf(c.value('unit') || (c.base && c.base.id)); if (!unit) return null;
  const info = C.camoInfo(g, mod, unit); if (!info.found) return null;
  const t = kind === 'fixed' ? null : lc(c.value('texture') || '');
  return t && V.has(t) ? t : mainTexture(info);
}
// POST /api/x/task/r/skin/gametex {draft}: the game texture to paint over, saved in the staging folder as PNG and as it is
async function gameTexRoute(url, body, ctx) {
  const ST = require('./upgrade.recipe').ST, CP = require('../lib/compile');
  ST.remote(ctx);
  const d = ST.draftOf(ctx, body, 'skin'), R = module.exports, g = gameOf(ctx, d.game) || viewG(ctx.gameDir && ctx.gameDir(), gidOf(ctx, d.game));
  if (!g) throw gidOf(ctx, d.game) === 'goh' ? noGame('goh') : bad('Set the game folder first (the Game folder button at the top).');
  const c = CP.makeCctx(ctx, d, await CP.valuesOf(ctx, R, d), R), mod = d.mod && fs.existsSync(d.mod) ? d.mod : null;
  const C = art(), V = C.view(g, mod), key = paintKey(V, C, g, mod, c);
  if (!key) throw bad('Pick the unit (or the soldier look) first: the texture comes from it.');
  const buf = V.readAny(V.get(key)), ext = extOf(key), stem = stemOf(key);
  const r = require('../../../../lib/model/picture').decode(ext.slice(1), buf);
  if (!r || r.error || !r.rgba) throw bad('The game texture ' + key + ' cannot be read: ' + ((r && r.error) || 'unknown format') + '.');
  const A = require('../../../../artport/artport'), rgba = Buffer.from(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength);
  const png = 'game/' + stem + '.png', raw = 'game/' + stem + ext;
  fs.mkdirSync(path.dirname(D_().stagedPath(ctx, d.id, png)), { recursive: true });
  fs.writeFileSync(D_().stagedPath(ctx, d.id, png), A.encodePng({ w: r.width, h: r.height, rgba }));
  fs.writeFileSync(D_().stagedPath(ctx, d.id, raw), buf);
  return { ok: true, key, png, raw, w: r.width, h: r.height, name: stem + ext };
}
const D_ = () => require('../lib/draft');

// upload check (README change 50, picker.check): a DDS the game loads (at most 8192 on a side), or a picture this tool can read
function picCheck(f) {
  const n = String(f.name), dds = f.bytes.length > 4 && f.bytes.toString('latin1', 0, 4) === 'DDS ';
  let w = 0, h = 0;
  if (dds) { const i = art().imgInfo(f.bytes, '.dds'); if (!i || !i.w) return { key: 'task.skin.e.read', params: { n, w: 'DDS header' } }; w = i.w; h = i.h; }
  else { try { const r = decodeAny(f.bytes, n); w = r.w; h = r.h; } catch (e) { return { key: 'task.skin.e.read', params: { n, w: e.message } }; } }
  return w > 8192 || h > 8192 ? { key: 'task.skin.e.big', params: { n, w, h } } : null;
}

module.exports = {
  id: 'skin',
  verbs: ['make', 'change'],
  // GoH (2026-11-23): skin.goh.js writes camo, replace and fixed as plain copies plus the def lines, and a new soldier look as a sibling folder
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 80,
  title: 'task.skin.t',
  census: 'skin',
  base: { lookup: 'entity' },
  groups: [
    { id: 'what', title: 'task.skin.g.what', essential: true, q: [
      { id: 'kind', kind: 'choice', ask: 'task.skin.q.kind', help: 'task.skin.h.kind', limits: { values: ['camo', 'replace', 'fixed', 'soldier'] } },
      { id: 'unit', kind: 'thing', ask: 'task.skin.q.unit', help: 'task.skin.h.unit', picker: { sources: ['keep', 'exist'], lookup: 'entity' }, when: { kind: ['camo', 'replace', 'fixed'] } },
      { id: 'texture', kind: 'thing', ask: 'task.skin.q.texture', help: 'task.skin.h.texture', covers: ['tex.file', 'mtl.diffuse', 'tex.ext_order'],
        limits: { limit: 'FMT-04' }, picker: { sources: ['keep', 'exist'], lookup: 'texture' }, when: { kind: ['camo', 'replace'] } },
      { id: 'look', kind: 'thing', ask: 'task.skin.q.look', help: 'task.skin.h.look', covers: ['human.def', 'human.def.extension', 'human.mdl'],
        limits: { limit: 'PORT-185' }, picker: { sources: ['keep', 'exist'], lookup: 'humanskin' }, when: { kind: ['soldier'] } },
      { id: 'look_id', kind: 'id', ask: 'task.skin.q.look_id', help: 'task.skin.h.look_id', when: { kind: ['soldier'] },
        limits: { re: '^[a-z0-9][a-z0-9_]{0,39}$' }, unique: { lookup: 'humanskin' } },
      // GoH: the breeds that wear the new look ({skin "<new id>"} in the mod's copy of each)
      { id: 'look_breed', kind: 'list', ask: 'task.skin.q.look_breed', help: 'task.skin.h.look_breed', optional: true, covers: [], when: { kind: ['soldier'], $game: ['goh'] },
        limits: { re: '^resource/set/breed/[a-z0-9_./-]+\\.set$' }, picker: { sources: ['exist'], lookup: 'gohbreed' } },
      { id: 'wear', kind: 'thing', ask: 'task.skin.q.wear', help: 'task.skin.h.wear', covers: ['variant.def_texmod', 'human.def.texmod'],
        picker: { sources: ['exist'], lookup: 'variant', in: 'unit' }, when: { kind: ['fixed'] } },
    ] },
    // one picture question per kind: each takes at upload only what its kind can use (no picture passes upload and fails later)
    { id: 'picture', title: 'task.skin.g.picture', essential: true, q: [
      { id: 'gametex', kind: 'gametex', ask: 'task.skin.q.gametex', help: 'task.skin.h.gametex' },
      { id: 'image', kind: 'file', multi: true, ask: 'task.skin.q.image', help: 'task.skin.h.image', covers: ['tex.dds.format', 'tex.dds.size', 'tex.dds.pow2', 'tex.dds.mips'],
        limits: { max: 8192, unit: 'px', limit: 'FMT-02' }, when: { kind: ['camo'] },
        picker: { sources: ['file', 'ext'], kinds: ['.dds', '.png', '.tga', '.bmp'], ext: ['dds-editor', 'texture-batch'], check: picCheck } },
      { id: 'image_dds', kind: 'file', multi: true, ask: 'task.skin.q.image', help: 'task.skin.h.image_dds', covers: ['tex.dds.format', 'tex.dds.size'],
        limits: { max: 8192, unit: 'px', limit: 'FMT-02' }, when: { kind: ['replace'] },
        picker: { sources: ['file', 'ext'], kinds: ['.dds'], ext: ['dds-editor', 'texture-batch'], check: picCheck } },
      { id: 'image_wear', kind: 'file', multi: true, ask: 'task.skin.q.image_wear', help: 'task.skin.h.image_wear', covers: ['tex.dds.format'],
        limits: { max: 8192, unit: 'px', limit: 'FMT-02' }, when: { kind: ['fixed'] },
        picker: { sources: ['keep', 'file', 'ext'], kinds: ['.dds'], ext: ['dds-editor', 'texture-batch'], check: picCheck } },
      { id: 'image_look', kind: 'file', multi: true, ask: 'task.skin.q.image_look', help: 'task.skin.h.image_look', covers: ['tex.dds.format'],
        limits: { max: 8192, unit: 'px', limit: 'FMT-02' }, when: { kind: ['soldier'] },
        picker: { sources: ['keep', 'file', 'ext'], kinds: ['.dds'], ext: ['dds-editor', 'texture-batch'], check: picCheck } },
    ] },
    { id: 'variant', title: 'task.skin.g.variant', essential: false, q: [
      { id: 'option', kind: 'choice', ask: 'task.skin.q.option', help: 'task.skin.h.option', covers: ['variant.texmods', 'variant.season_map'],
        limits: { values: OPTIONS }, when: { kind: ['camo'] } },
      { id: 'variant', kind: 'id', ask: 'task.skin.q.variant', help: 'task.skin.h.variant', covers: ['variant.file'],
        limits: { re: '^[A-Za-z0-9_.-]{0,40}$' }, optional: true, when: { kind: ['camo'] } },
    ] },
  ],
  kept: [
    ['tex.frame_suffix', 'interface and map pictures only (_00 frames); a model skin has no frames'],
    ...['mtl.type', 'mtl.diffuse.alphachannel', 'mtl.diffuse.axis', 'mtl.diffuse.mipmap', 'mtl.diffuse.nocompression', 'mtl.diffuse1', 'mtl.blend',
      'mtl.alpharef', 'mtl.alphatocoverage', 'mtl.tile', 'mtl.modulate2x', 'mtl.bump', 'mtl.bumpvolume', 'mtl.specular', 'mtl.specular.alphachannel',
      'mtl.color', 'mtl.mask', 'mtl.envmap', 'mtl.envamount', 'mtl.amount', 'mtl.period', 'mtl.fakereflection', 'mtl.layer', 'mtl.parallax_scale',
      'mtl.height', 'mtl.extra_flags'].map(k => [k, 'kept as it is: a skin swaps the picture, the material stays (the Models page edits materials)']),
    ...['ebm.form', 'ebm.bitmap.frame', 'ebm.bitmap.blend', 'ebm.bitmap.filtering', 'ebm.bitmap.axis', 'ebm.bitmap.alphachannel', 'ebm.bitmap.animation',
      'ebm.bitmap.cursor', 'ebm.bitmap.mipmap', 'ebm.bitmap.textureanimation'].map(k => [k, 'no tool step yet: no .ebm writer (FMT-17)']),
    ['tex.wrapper', 'no tool step yet: no .ebm/.tex wrapper writer (FMT-17); a plain picture of the same name is used'],
    ['variant.dynamic', 'no tool step yet: the $ variant (picked at run time) has no writer and its rule is not verified [T]'],
    ['variant.mission_texmod', 'no tool step yet: the map editor sets a unit\'s texmod on a placed unit; no op writes it into a map'],
    ['variant.mp_texmod', 'no tool step yet: multiplayer picks the texmod from the player\'s side; no op for it'],
    ['variant.script', 'owned by a mission script task: tex_mod and tex_morph are mission script calls'],
    ['human.skin', 'owned by the soldier task: which humanskin a soldier wears (gen breed set skin, PORT-185); this task makes the look it names'],
    ...['human.def.tag', 'human.def.rimlight', 'human.def.shadows'].map(k => [k, 'no tool step yet: the gen skin op copies the def of the look it starts from unchanged; no writer changes this key']),
    ['human.ply.bones', 'owned by the model task: bones of a soldier mesh (FMT-10, FMT-23)'],
    ...['def.rimlight', 'def.shadows', 'def.decal'].map(k => [k, 'meaning not proven [I]: the def key forms are not verified; a gen set row would guess them']),
  ],
  test: 'task.skin.test',
  checklist: ['task.skin.c.look', 'task.skin.c.season', 'task.skin.c.log'],
  lookups: { humanskin: lookHumanskin, variant: lookVariant, gohbreed: lookGohBreed },
  routes: { 'POST /api/x/task/r/skin/gametex': gameTexRoute },
  values: async (ctx, base, o) => {
    o = o || {};
    const out = { kind: 'camo', unit: null, texture: null, look: null, look_id: '', wear: '', gametex: '', image: null, image_dds: null, image_wear: null, image_look: null, look_breed: null, option: 'Winter', variant: '' };
    const f = lc((o.pass && o.pass.for) || (o.draft && o.draft.parent && o.draft.parent.q) || '');
    const id = lc((base && base.id) || (o.pass && o.pass.base && o.pass.base.id) || '');
    if (/humanskin|uniform|soldier|skin$/.test(f) || id.startsWith(HS)) {
      out.kind = 'soldier';
      const m = /humanskin\/([^/]+)/.exec(id) || /^([a-z0-9_]+)$/.exec(id);
      if (m) { out.look = m[1]; out.look_id = (m[1] + '_new').slice(0, 40); }
      return out;
    }
    if (/texmod|fixed/.test(f)) out.kind = 'fixed';
    if (!id) return out;
    out.unit = unitOf(id);
    const g = gameOf(ctx, o && o.game);
    if (g) { try { const i = art().camoInfo(g, null, out.unit); if (i && i.found) out.texture = mainTexture(i); } catch (e) { /* unit not found: asked */ } }
    return out;
  },
  compile: (draft, c) => {
    if (gidOf(c, c.game) === 'goh') return SG().compile(draft, c, { bad, badK, lc, stemOf, dirOf, extOf, unitOf, mainTexture, checkDds, isDds, decodeAny, OPTIONS, SUFFIX, art });
    const g = viewG(c.gameDir, gidOf(c, c.game));
    if (!g) throw noGame(gidOf(c, c.game));
    const C = art(), kind = String(c.value('kind') || 'camo'), copies = [], notes = [], ops = [], calls = [];
    const V = C.view(g, c.mod && fs.existsSync(c.mod) ? c.mod : null);
    const iq = { camo: 'image', replace: 'image_dds', fixed: 'image_wear', soldier: 'image_look' }[kind] || 'image';
    const a = c.answer(iq), files = a && a.src === 'file' ? [].concat(c.value(iq) || []).filter(Boolean) : [];
    for (const f of files) if (!fs.existsSync(f)) throw bad('A picture you brought is gone from the staging folder: ' + path.basename(f) + '. Bring it again.');
    // the game texture saved on the picture step, brought back unchanged: nothing would change
    const saved = [].concat(c.value('gametex') || []).filter(Boolean).map(n => { try { return c.stagedPath(n); } catch (e) { return null; } }).filter(p => p && fs.existsSync(p));
    for (const f of files) {
      const sz = fs.statSync(f).size;
      if (saved.some(s => fs.statSync(s).size === sz && fs.readFileSync(s).equals(fs.readFileSync(f)))) throw bad(path.basename(f) + ' is the game texture you saved, unchanged. Paint it first, then bring it again.');
    }
    const fileStem = f => stemOf(lc(f)).split('#')[0];

    if (kind === 'soldier') {
      const look = lc(c.value('look') || (c.base && c.base.id) || '').replace(/^.*humanskin\//, '').replace(/\/.*$/, '').replace(/\.def$/, '');
      const id = lc(c.value('look_id') || '').trim();
      if (!look || !V.has(HS + look + '/' + look + '.def')) throw bad('Pick the soldier look to start from (a humanskin of the game or your mod).');
      if (!GEN_ID.test(id) || id.length > 40) throw bad('Type a name for the new look: small English letters, digits and _, starting with a letter or digit.');
      if (id === look) throw bad('The new look needs its own name.');
      const textures = {};
      files.forEach((f, i) => {
        if (!isDds(f)) throw bad(path.basename(f) + ' is not a DDS: a soldier texture must be DDS (nothing in this tool writes DDS). Save it as DDS in a DDS editor (the hand off on this step) and bring it again.');
        const s = fileStem(f), key = ROLES.includes(s) || V.has(HS + look + '/' + s + '.dds') ? s : i === 0 ? 'diffuse' : null;
        if (!key) throw bad(path.basename(f) + ': name the file after the texture it replaces (' + look + ', ' + look + '_bp, ' + look + '_sp) or after its role (diffuse, bump, specular).');
        checkDds(fs.readFileSync(f), path.basename(f), notes, null);
        textures[key] = f;
      });
      ops.push({ op: 'skin', id, like: look, textures });
      if (!files.length) notes.push('The new look ' + id + ' wears the textures of ' + look + ' under new names; bring DDS pictures to paint it.');
      notes.push('Give a soldier this look in the soldier task (its skin): ' + id + '.');
      return { gen: { ops }, notes, result: id };
    }

    const unit = unitOf(c.value('unit') || (c.base && c.base.id));
    if (!unit) throw bad('Pick the unit that gets the skin.');
    const info = C.camoInfo(g, c.mod && fs.existsSync(c.mod) ? c.mod : null, unit);
    if (!info.found) throw bad('Unit not found: ' + unit + (info.suggestions && info.suggestions.length ? ' (did you mean ' + info.suggestions.slice(0, 5).join(', ') + '?)' : ''));

    if (kind === 'fixed') {
      const v = String(c.value('wear') || '').trim();
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(v)) throw bad('Pick the paint scheme the unit always wears (or type a new name).');
      if (files.length) {
        // pictures with it: the gen skin op writes <texture>#<v>.dds and sets {texmod} in one step
        if (!GEN_ID.test(v)) throw bad('With new pictures the paint scheme name takes small English letters, digits and _ only.');
        const textures = {};
        files.forEach((f, i) => {
          if (!isDds(f)) throw bad(path.basename(f) + ' is not a DDS: a fixed variant is written as DDS (nothing in this tool writes DDS). Save it as DDS in a DDS editor and bring it again.');
          const s = fileStem(f), main = stemOf(mainTexture(info) || unit).split('#')[0];
          textures[info.textures.some(t => stemOf(lc(t.key)) === s) ? s : i === 0 ? main : s] = f;
          checkDds(fs.readFileSync(f), path.basename(f), notes, null);
        });
        ops.push({ op: 'skin', id: v, entity: unit, textures, texmod: true });
        return { gen: { ops }, notes, result: v };
      }
      const t = require('../../../../lib/sdlwrite').parse(V.readAny(V.get(info.def)));
      const root = (t.root.items || []).find(x => x.type === 'block' || x.type === 'list');
      const rn = root && root.name ? String(root.name).replace(/^"|"$/g, '') : 'game_entity';
      ops.push({ op: 'set', rows: [{ entity: 'file:' + info.def, path: rn + '/texmod', value: '"' + v + '"', op: 'add' }] });
      if (!info.textures.some(x => x.variants.includes(lc(v)) || x.variants.includes(v))) throw bad(unit + ' has no paint scheme ' + v + ' yet: bring its pictures on the picture step, or pick a scheme from the list.');
      notes.push(unit + ' always wears its paint scheme ' + v + ' in your mod, on every map.');
      return { gen: { ops }, notes, result: v };
    }

    const tex = lc(c.value('texture') || mainTexture(info));
    if (!tex || !V.has(tex)) throw bad('Pick the texture of ' + unit + ' to paint (the game has no ' + (tex || 'texture') + ').');
    if (!files.length) throw bad(kind === 'replace' ? 'Bring the picture of the new skin as DDS.' : 'Bring the picture of the new skin (DDS is best; PNG, TGA or BMP work for a camouflage).');
    const texExt = extOf(tex), want = C.imgInfo(V.readAny(V.get(tex)), texExt) || null, stem = stemOf(tex).split('#')[0];
    // the first picture paints the picked texture; more pictures paint the textures of the unit they are named after
    const texOf = (f, i) => {
      if (i === 0) return tex;
      const s = fileStem(f), hit = info.textures.find(t => stemOf(lc(t.key)) === s && dirOf(lc(t.key)) === dirOf(tex)) || info.textures.find(t => stemOf(lc(t.key)) === s);
      if (!hit) throw bad(path.basename(f) + ': name an extra picture after the texture of ' + unit + ' it paints (' + [...new Set(info.textures.map(t => stemOf(lc(t.key))))].slice(0, 8).join(', ') + ').');
      return lc(hit.key);
    };
    const staged = f => path.relative(path.resolve(c.staging), path.resolve(f)).replace(/\\/g, '/');
    const toTga = (f, to) => {   // the named gap: any picture -> a 32 bit TGA in the staging folder (no route makes a model texture)
      const A = require('../../../../artport/artport'), img = decodeAny(fs.readFileSync(f), path.basename(f));
      if (want && want.w && (want.w !== img.w || want.h !== img.h)) notes.push(path.basename(f) + ' is ' + img.w + 'x' + img.h + ', the game texture is ' + want.w + 'x' + want.h + '. The model keeps its mapping, so the picture must have the same layout.');
      const rel = 'tga/' + to.split('/').pop();
      fs.mkdirSync(path.join(c.staging, 'tga'), { recursive: true });
      fs.writeFileSync(path.join(c.staging, ...rel.split('/')), A.encodeTga(img));
      return rel;
    };

    if (kind === 'replace') {
      files.forEach((f, i) => {
        const t = texOf(f, i), ts = stemOf(t).split('#')[0], te = extOf(t);
        if (isDds(f)) { checkDds(fs.readFileSync(f), path.basename(f), notes, i === 0 ? want : null); copies.push({ staged: staged(f), to: dirOf(t) + '/' + ts + '.dds' }); if (te !== '.dds') notes.push('The game texture is ' + te + '; the game looks for .dds first, so your DDS wins (FMT-04).'); }
        else if (te === '.dds') throw bad('The game texture ' + t + ' is a DDS, and the game looks for .dds before .tga, so a PNG or TGA next to it is never used (FMT-04). Nothing in this tool writes DDS: open the picture in a DDS editor (hand off), save it as DDS (DXT1, or DXT5 with see-through parts, with mipmaps) and bring the .dds.');
        else copies.push({ staged: toTga(f, dirOf(t) + '/' + ts + '.tga'), to: dirOf(t) + '/' + ts + '.tga' });
      });
      return { copies, notes, result: tex };
    }

    // camo: each picture becomes <texture>#<variant> next to its texture, and the def's TexMods maps the option to the variant
    const option = String(c.value('option') || 'Winter');
    if (!OPTIONS.includes(option)) throw bad('Pick when the camouflage is worn.');
    const variant = String(c.value('variant') || '').trim() || SUFFIX[option];
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(variant)) throw bad('The variant name can use English letters, digits, _, dot and minus.');
    const textures = {};
    files.forEach((f, i) => {
      const t = texOf(f, i), ts = stemOf(t).split('#')[0], vstem = dirOf(t) + '/' + ts + '#' + variant;
      if (isDds(f)) {
        checkDds(fs.readFileSync(f), path.basename(f), notes, i === 0 ? want : null);
        // the gen skin op when it can (a new variant file beside the model's .mtl); else a copy (a name the op does not take, or over a file already there)
        if (GEN_ID.test(variant) && !V.has(vstem + '.dds') && dirOf(t) === dirOf(info.def)) textures[ts] = f;
        else copies.push({ staged: staged(f), to: vstem + '.dds' });
      } else {
        copies.push({ staged: toTga(f, vstem + '.tga'), to: vstem + '.tga' });
        notes.push('The camouflage ' + path.basename(f) + ' is written as ' + ts + '#' + variant + '.tga, a 32 bit TGA, and the game reads that TGA as it is (it looks for ' + ts + '#' + variant + '.dds first and there is none) [T]. Nothing in this tool writes DDS. Want a DDS (smaller, with mipmaps)? Go back to the picture step and pick the DDS image editor card: it shows how to save it (DXT1, or DXT5 with see through parts, with mipmaps), then bring the .dds instead.');
      }
      if (V.has(vstem + '.dds') || V.has(vstem + '.tga')) notes.push('The game already has a #' + variant + ' picture of ' + ts + ': yours replaces it in your mod.');
    });
    if (Object.keys(textures).length) ops.push({ op: 'skin', id: variant, entity: unit, textures });
    calls.push({ route: 'POST /api/x/art/camo-write', body: { name: unit, option, variant } });
    if (info.inheritsOnly) notes.push(unit + ' has no TexMods block of its own; a new one is added to its def [T]: check the old variants still show in the game.');
    return { gen: ops.length ? { ops } : null, copies, calls, notes, result: variant };
  },
};
