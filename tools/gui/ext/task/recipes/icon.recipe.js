// recipe "make or change an icon": which picture (buy card and small card, portrait, squad card, damage scheme), its name and the
// picture (an own PNG, another game icon, or the copy's own). Contract: ../README.md. Census: census/icon.json.
// An own picture (PNG as it is; TGA, BMP or DDS turned into PNG in staging, so what the outside program cards say is taken at upload)
// goes through the Art page's POST /api/x/art/icon-png (dry in plan, restore point at Write): it writes every frame of the
// kind at the game's size (read from the game's icon of that name, else the vanilla size; art/core.js PNG_KINDS). A game icon is copied
// frame by frame (`copies` {key}). Census note fixed here: unit_icon_small frames are <name>_00.._03 like unit_icon (3463 vanilla files).
// Author: Imperator_Aug (ARSENAL, ia-e258ee98)
'use strict';
const fs = require('fs'), path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const art = () => require('../../art/core');
const SCENE = 'resource/interface/scene/';
const GM = () => require('../../../../lib/games');
// the game: ctx.gameId (the gui.js function, or the draft's word lib/compile.js lookupCtx puts there), else as64
function gidOf(ctx) { let x = null; try { x = ctx && (typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId); } catch (e) { x = null; } return GM().idOf(x) || 'as64'; }
// Gates of Hell (2026-11-23): icon.goh.js makes the frames itself at the GoH sizes (unitcard kinds GOH: buy card 144x72 + small 112x48,
// shop card portrait_squad 112x140, portrait 128x164, squad 48x48), with an own .ebm where the game has one; GoH asks kind_goh and
// name_goh (an extra shop card; the damage scheme is the vehicle view vehicle_view/<vehicle>/body), the AS2 games kind and name as before
const IG = () => require('./icon.goh');
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const AS2 = ['as64', 'mowas2'];
// the GoH install of a lookup ctx (the task's, the request's, else the one found on this PC)
const gohDir = ctx => require('./skin.goh').gohDirOf(ctx);
// the game's pictures plus the mod's, through the Art page's view (one cache with the Art page, keyed by folder and exe): as64 (or
// no game named) as before; mowas2 the mowas_2 file set (no as64/core)
function viewOf(g, mod, gid) {
  const md = mod && fs.existsSync(mod) ? mod : null, id = GM().idOf(gid) || 'as64';
  if (id === 'as64') return art().view(g, md);
  if (id === 'goh') return IG().viewOf(g, md);
  return art().view({ dir: g, exe: GM().exeOf(id), kind: 'as2' }, md);
}
const lc = s => String(s == null ? '' : s).toLowerCase();
const DIR_KIND = { unit_icon: 'icon', unit_icon_small: 'icon', portrait: 'portrait', squad: 'squad', structure: 'scheme' };

// the files a kind writes for a name: [{key, dir, frame}] (frame null: one file)
function targets(kind, name) {
  const out = [];
  for (const [d, , frames] of art().PNG_KINDS[kind] || []) {
    if (frames === 'scheme') out.push({ key: SCENE + d + '/' + name + '/scheme.tga', dir: d, frame: null });
    else if (!frames) out.push({ key: SCENE + d + '/' + name + '.tga', dir: d, frame: null });
    else for (let i = 0; i < frames; i++) out.push({ key: SCENE + d + '/' + name + '_0' + i + '.tga', dir: d, frame: i });
  }
  return out;
}
// a picked picture key -> {dir, name} when it is a game icon (any frame), else null
function iconOf(key) {
  const k = lc(key).replace(/\\/g, '/');
  let m = /^resource\/interface\/scene\/structure\/(.+)\/scheme\.[a-z0-9]+$/.exec(k);
  if (m) return { dir: 'structure', name: m[1] };
  m = /^resource\/interface\/scene\/(unit_icon|unit_icon_small|squad|portrait)\/(.+?)(?:_0\d)?\.[a-z0-9]+$/.exec(k);
  return m ? { dir: m[1], name: m[2] } : null;
}
// the game icon of `from` for one target: the same folder and frame, else frame 0 of that folder
function sourceFor(V, from, t) {
  const stem = t.dir === 'structure' ? SCENE + 'structure/' + from + '/scheme' : SCENE + t.dir + '/' + from + (t.frame == null ? '' : '_0' + t.frame);
  if (V.has(stem + '.tga')) return stem + '.tga';
  if (t.frame != null && V.has(SCENE + t.dir + '/' + from + '_00.tga')) return SCENE + t.dir + '/' + from + '_00.tga';
  return null;
}
// lookup "iconname": the names that already have a picture of the kind picked (in = the kind answer), so a squad card's name
// (riflemans(eng)) is picked, not guessed; the typed words come first as a new name when no picture has them
const KIND_DIR = { icon: 'unit_icon', portrait: 'portrait', squad: 'squad', scheme: 'structure' };
const NAME_RE = /^[a-z0-9][a-z0-9_().-]{0,79}$/;
async function lookIconName(ctx, words, opt) {
  if (gidOf(ctx) === 'goh') return IG().lookName(ctx, gohDir(ctx), words, opt, NAME_RE);
  let g = null; try { g = ctx.game && ctx.game(); } catch (e) { /* none */ }
  const kind = KIND_DIR[opt && opt.in] ? opt.in : 'icon', dir = SCENE + KIND_DIR[kind] + '/', w = lc(words).trim(), out = [], seen = new Set();
  if (g && gidOf(ctx) !== 'goh') {
    const V = viewOf(g, opt && opt.mod, gidOf(ctx));
    for (const k of V.keys()) {
      if (!k.startsWith(dir) || !k.endsWith('.tga')) continue;
      const ic = iconOf(k); if (!ic || seen.has(ic.name) || (w && !ic.name.includes(w))) continue;
      seen.add(ic.name);
      out.push({ id: ic.name, name: ic.name, where: V.m.has(k) ? 'mod' : 'game', ref: { key: k }, sub: 'has a picture: yours replaces it' });
    }
  }
  out.sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
  const exact = seen.has(w);
  if (w && NAME_RE.test(w) && !exact) out.unshift({ id: w, name: w, where: 'new', ref: null, sub: 'a new name: no picture has it yet' });
  return { results: out.slice(0, 400), exact };
}
// a brought picture -> the PNG the icon-png route reads: a PNG as it is; TGA, BMP or DDS decoded and saved as PNG in staging
function pngOf(c, f) {
  if (/\.png$/i.test(f)) return f;
  const ext = (/\.([a-z0-9]+)$/i.exec(f) || [])[1], type = ext ? ext.toLowerCase() : '';
  if (!['tga', 'bmp', 'dds'].includes(type)) throw bad('Bring the picture as PNG, TGA, BMP or DDS.');
  const r = require('../../../../lib/model/picture').decode(type, fs.readFileSync(f));
  if (!r || r.error || !r.rgba) throw bad('The picture ' + path.basename(f) + ' cannot be read: ' + ((r && r.error) || 'unknown format') + '. Save it as PNG and bring it again.');
  const out = path.join(c.staging, 'png', path.basename(f).replace(/\.[^.]+$/, '') + '.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, require('../../../../artport/artport').encodePng({ w: r.width, h: r.height, rgba: Buffer.isBuffer(r.rgba) ? r.rgba : Buffer.from(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength) }));
  return out;
}
async function lookIcon(ctx, words, opt) {
  if (gidOf(ctx) === 'goh') return IG().lookIcon(ctx, gohDir(ctx), words, opt);
  let g = null; try { g = ctx.game && ctx.game(); } catch (e) { /* none */ }
  if (!g || gidOf(ctx) === 'goh') return [];
  const V = viewOf(g, opt && opt.mod, gidOf(ctx)), ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [], seen = new Set();
  for (const k of V.keys()) {
    if (!k.startsWith(SCENE) || !k.endsWith('.tga')) continue;
    const ic = iconOf(k); if (!ic || seen.has(ic.dir + '/' + ic.name)) continue;
    if (ws.length && !ws.every(w => k.includes(w))) continue;
    seen.add(ic.dir + '/' + ic.name);
    out.push({ id: k, name: ic.name, where: ic.dir, ref: { key: k }, sub: V.m.has(k) ? 'mod' : 'game' });
  }
  return out.sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1)).slice(0, 400);
}

// upload check (README change 50, picker.check): a TGA, BMP or DDS this tool can turn into PNG (a PNG goes to icon-png as it is)
function picCheck(f) {
  const t = String(f.name).toLowerCase().replace(/^.*\./, '');
  if (!['tga', 'bmp', 'dds'].includes(t)) return null;
  const r = require('../../../../lib/model/picture').decode(t, f.bytes);
  return r && !r.error && r.rgba ? null : { key: 'task.icon.e.read', params: { n: f.name, w: String((r && r.error) || 'unknown') } };
}

module.exports = {
  id: 'icon',
  verbs: ['make', 'change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 90,
  title: 'task.icon.t',
  census: 'icon',
  base: { lookup: 'entity' },
  groups: [
    { id: 'which', title: 'task.icon.g.which', essential: true, q: [
      { id: 'kind', kind: 'choice', ask: 'task.icon.q.kind', help: 'task.icon.h.kind',
        covers: ['buy.file', 'small.file', 'soldier.portrait', 'soldier.squad_card', 'structure.scheme', 'buy.size', 'small.size', 'buy.frames', 'small.frames'],
        limits: { values: ['icon', 'portrait', 'squad', 'scheme'], limit: 'UI-03' }, when: { $game: AS2 } },
      // GoH: the shop card (portrait_squad) is there; the damage scheme is the vehicle view (icon.goh.js scheme)
      { id: 'kind_goh', kind: 'choice', ask: 'task.icon.q.kind', help: 'task.icon.h.kindgoh',
        covers: ['buy.file', 'small.file', 'soldier.portrait', 'soldier.squad_card', 'buy.size', 'small.size', 'buy.frames', 'small.frames'],
        limits: { values: ['icon', 'shop', 'portrait', 'squad', 'scheme'], limit: 'UI-03' }, when: { $game: 'goh' } },
      // a pick list of the names that have a picture of the kind (the typed words as a new name): no squad id to guess
      { id: 'name', kind: 'thing', ask: 'task.icon.q.name', help: 'task.icon.h.name', covers: ['buy.squad_name', 'buy.stats_name'],
        picker: { sources: ['keep', 'exist'], lookup: 'iconname', in: 'kind' }, when: { $game: AS2 } },
      { id: 'name_goh', kind: 'thing', ask: 'task.icon.q.name', help: 'task.icon.h.name', covers: ['buy.squad_name', 'buy.stats_name'],
        picker: { sources: ['keep', 'exist'], lookup: 'iconname', in: 'kind_goh' }, when: { $game: 'goh' } },
    ] },
    // the formats the cards name (PNG or TGA) and every picture this task can turn into PNG are taken at upload
    { id: 'picture', title: 'task.icon.g.picture', essential: true, q: [
      { id: 'image', kind: 'file', ask: 'task.icon.q.image', help: 'task.icon.h.image', covers: ['buy.format'], when: { $verb: ['make'] },
        limits: { limit: 'FMT-04' },
        picker: { sources: ['keep', 'exist', 'file', 'ext'], lookup: 'icon', kinds: ['.png', '.tga', '.bmp', '.dds'], ext: ['image-editor', 'icon-editor'], check: picCheck } },
      // change: a new picture is the point, so no Keep (it would leave the icon as it is)
      { id: 'newimage', kind: 'file', ask: 'task.icon.q.newimage', help: 'task.icon.h.newimage', when: { $verb: ['change'] },
        limits: { limit: 'FMT-04' },
        picker: { sources: ['exist', 'file', 'ext'], lookup: 'icon', kinds: ['.png', '.tga', '.bmp', '.dds'], ext: ['image-editor', 'icon-editor'], check: picCheck } },
    ] },
  ],
  kept: [
    ['soldier.breed_icon', 'asked by the soldier task (gen breed set icon); this task makes the picture it names'],
    ['soldier.icon_priority', 'asked by the soldier task (gen breed set): it is about the squad, not the picture'],
    ['soldier.nationality', 'asked by the soldier task (gen breed set nationality); here it is only part of the name in brackets'],
    ['category.button', 'no tool step yet: no writer for a buy menu category button (two files and a hint text); icon-png has no kind for it'],
    ['category.hint', 'no tool step yet: the category button writer is missing, so its hint text is too'],
    ['category.side_marker', 'no tool step yet: no writer for a side marker of a new nation (icon_tank(<nation>), 48x48, 3 frames); icon-png has no kind for it'],
    ['structure.part', 'no tool step yet: no writer for the damage scheme part overlays (part .mtl per volume); the scheme kind writes the background only'],
    ['structure.vehicle_view', 'no tool step yet: no writer, and no vanilla file uses it [T]'],
    ['preview.mode', 'no tool step yet: the inventory picture is a live render set in the model (preview extender); no editor for it'],
    ['preview.camera.origin', 'no tool step yet: no preview extender editor (camera)'],
    ['preview.camera.lookat', 'no tool step yet: no preview extender editor (camera)'],
    ['preview.camera.horizon', 'no tool step yet: no preview extender editor (camera)'],
    ['preview.camera.fov', 'no tool step yet: no preview extender editor (camera)'],
    ['preview.lights', 'no tool step yet: no preview extender editor (lights)'],
    ['panel.file', 'no tool step yet: no writer for command panel buttons (44x44 or 27x27, up to 16 frames); icon-png has no kind for it'],
    ['minimap.symbol', 'engine rule: the minimap draws symbols coloured by minimap.set; a unit has no own minimap picture'],
    ['text.desc', 'asked by the vehicle, soldier and squad tasks (gen card name): the card text belongs to the unit'],
    ['text.info', 'asked by the vehicle, soldier and squad tasks (gen card): the card text belongs to the unit'],
  ],
  test: 'task.icon.test',
  checklist: ['task.icon.c.buy', 'task.icon.c.sharp', 'task.icon.c.log'],
  lookups: { icon: lookIcon, iconname: lookIconName },
  viewOf, gidOf,
  values: async (ctx, base, o) => {
    o = o || {};
    const pb = o.pass && o.pass.base && o.pass.base.id, id = lc((base && base.id) || pb || '').replace(/\\/g, '/').replace(/\.def$/, '');
    const own = id.slice(id.lastIndexOf('/') + 1);
    const f = lc((o.pass && o.pass.for) || (o.draft && o.draft.parent && o.draft.parent.q) || '');
    const kind = /portrait|face/.test(f) ? 'portrait' : /squad/.test(f) ? 'squad' : /scheme|structure|damage/.test(f) ? 'scheme' : 'icon';
    // change: the unit's own icon. make: a parent task passes the new unit's name; alone, a new name next to the copy (left as it
    // is, it never replaces the copy's card)
    const name = o.verb === 'change' || pb || !own ? own : (own + '_new').slice(0, 80);
    if (gidOf(ctx) === 'goh') return { kind_goh: kind, name_goh: name, image: null, newimage: null };
    return { kind, name, image: null, newimage: null };
  },
  compile: (draft, c) => {
    const g = c.gameDir, gid = gidOf({ gameId: c.game });
    if (gid === 'goh') return IG().compile(draft, c, { bad, badK, NAME_RE });
    if (!g) throw bad('Set the game folder first (the Game folder button at the top): the task reads the game\'s pictures and sizes.');
    const C = art(), V = viewOf(g, c.mod, gid), kind = String(c.value('kind') || 'icon'), name = lc(c.value('name'));
    if (!C.PNG_KINDS[kind]) throw bad('Pick which picture to make.');
    if (!NAME_RE.test(name)) throw bad('Type the icon name: usually the unit name, small English letters, digits, _ and brackets.');
    const iq = c.verb === 'change' ? 'newimage' : 'image';
    const T = targets(kind, name), a = c.answer(iq), copies = [], calls = [], notes = [];
    if (c.verb === 'change' && (!a || a.src === 'keep')) throw bad('Bring the new picture, or pick another icon of the game: a change needs a new picture.');
    const pngCall = png => ({ route: 'POST /api/x/art/icon-png', body: { name, kind, png } });
    if (a && a.src === 'file') {
      const f = [].concat(c.value(iq) || [])[0];
      if (!f || !fs.existsSync(f)) throw bad('The picture you brought is gone from the staging folder. Bring it again.');
      const png = pngOf(c, f);
      if (png !== f) notes.push(path.basename(f) + ' is turned into PNG here, then scaled like a PNG.');
      calls.push(pngCall(png));
      notes.push('Your picture is scaled to the game size of each frame at Write: ' + [...new Set(C.PNG_KINDS[kind].map(x => x[0] + ' ' + x[1]))].join(', ') + ' (the size of the game\'s own icon of that name wins when there is one).');
    } else {
      const picked = a && a.src === 'exist' ? String(a.value || '') : '';
      const fromBase = lc(c.base && c.base.id).replace(/\\/g, '/').replace(/\.def$/, ''), baseName = fromBase.slice(fromBase.lastIndexOf('/') + 1);
      // an own PNG in the mod folder, on disk: the route converts it like a brought one
      const onDisk = picked && /\.png$/i.test(picked) && c.mod ? path.join(c.mod, ...lc(picked).replace(/\\/g, '/').split('/')) : null;
      if (onDisk && fs.existsSync(onDisk)) calls.push(pngCall(onDisk));
      else {
        const ic = picked ? iconOf(picked) : (baseName ? { dir: null, name: baseName } : null);
        if (!ic) throw bad('Bring a PNG picture or pick an icon of the game.');
        if (ic.dir && DIR_KIND[ic.dir] !== kind) throw bad('That picture is a ' + ic.dir + ' icon; pick a picture of the same kind, or bring a PNG and it is scaled to the game size.');
        if (ic.name === name) throw bad('The icon would stay as it is: bring a new picture or pick another one from the game.');
        for (const t of T) {
          const k = sourceFor(V, ic.name, t);
          if (k) copies.push({ key: k, to: t.key }); else notes.push('No picture for ' + t.key + ' in the game: it is left out.');
        }
        if (!copies.length) throw bad('The game has no ' + kind + ' picture named ' + ic.name + '. Bring a PNG or pick another icon.');
      }
    }
    if (!targets(kind, name).some(t => V.g.has(t.key))) notes.push('The game has no ' + kind + ' picture named ' + name + ': a new icon, the vanilla size is used. Only a unit (or squad) named ' + name + ' shows it.');
    else notes.push('This replaces the game\'s ' + kind + ' picture ' + name + ' in your mod: every card that shows ' + name + ' shows your picture while the mod is on.');
    return { copies, calls, notes, result: name };
  },
};
