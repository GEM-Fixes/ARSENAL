// Author: Imperator_Aug (ARSENAL, ia-a2d8f3d3)
'use strict';
// testplan part "items": the change list -> the things to test (README.md "items").
//   items.from(stack, changes, opt) -> Promise<{ items:[item], unmapped:[rel], notes:[text], needsGame:boolean }>
//     opt.deps (default true)   pull in what depends on a change
//     opt.index {idx,keys,src}  the entityindex build (else stack.index(stack), else none: file-level items only)
//     opt.units [unit]          statsheet --units-json units (else stack.units(stack), else [])
//     opt.maxDeps (default 500) cap of entities one changed file may pull in (mod entities first; a note says what was cut)
//   item = { id, kind, key, name, cls, source:'changed'|'depends', why:[{rel,state}], via:[itemId], weapons:[stuff name],
//            carriers:[entity name], cards:[{card,army,buyable}], file }
//   items.classify(rel) -> { kind, key, gkey, name }   file-level kind of one mod path (no index); kind null = unmapped
//   items.gameKey(rel)  -> lower-case game path without resource/ ('<pak>!<entry>' -> the entry)
//   items.clsOf(key, name, cards, isSkin, goh) -> vehicle|gun|human|static|other
//   items.KINDS, items.CLS
// Reads: the index and the units list it is handed, breed files through index.src.get. Writes nothing. No game needed for the test.
const path = require('path');

const KINDS = ['entity', 'model', 'weapon', 'ammo', 'breed', 'squad', 'card', 'mission', 'text', 'interface', 'sound', 'script', 'properties', 'other'];
const CLS = ['vehicle', 'gun', 'human', 'static', 'other'];
const MODEL_EXT = /\.(mdl|ply|vol|anm|mtl|skn|mesh)$/, TEX_EXT = /\.(dds|tga|bmp|png|jpg|jpeg|ebm|tif|tiff)$/, SND_EXT = /\.(wav|ogg|mp3|aud|bnk)$/;
const WEAPON_DIR = /^(gun|mgun|rifle|smg|pistol|bazooka|mortar|flame\w*|explosive\w*|weapon\w*|cannon\w*|launcher\w*|rocket\w*|shotgun\w*|sniper\w*|howitzer\w*|grenade\w*|throw\w*|melee|knife\w*|tank\w*|artillery\w*)$/;
const AREAS = ['set', 'entity', 'map', 'properties', 'interface', 'script', 'text', 'pak', 'other'];

const lc = s => String(s == null ? '' : s).toLowerCase();
const slash = s => String(s == null ? '' : s).replace(/\\/g, '/');
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const noExt = k => { const b = k.lastIndexOf('/'), d = k.lastIndexOf('.'); return d > b + 0 && d > b ? k.slice(0, d) : k; };
const push = (m, k, v) => { let l = m.get(k); if (!l) m.set(k, l = []); l.push(v); };
const words = s => lc(s).split(/\s+/).filter(Boolean);

function gameKey(rel) {
  let k = lc(slash(rel));
  const bang = k.indexOf('!');
  if (bang >= 0) k = k.slice(bang + 1);
  k = k.replace(/^\.?\/+/, '');
  return k.replace(/^resource\//, '');
}

// file-level kind of one path. kind null = no rule (unmapped)
function classify(rel) {
  const raw = lc(slash(rel)), g = gameKey(rel), b = baseOf(g), seg = g.split('/');
  const out = (kind, key, name) => ({ kind, key: key === undefined ? g : key, gkey: g, name: name === undefined ? b : name });
  if (!g || (/\.pak$/.test(g) && raw.indexOf('!') < 0) || /\.pat$/.test(g)) return out(null);
  if (/\.(lng|pot)$/.test(g) || /^(localizations?|interface\/text)\//.test(g)) return out('text');
  if (/\.(mi|mission)$/.test(g)) return out('mission');
  if (seg[0] === 'map') {
    // one item per map folder: the folder that holds the file (files right under map/ stand alone)
    const d = dirOf(g).replace(/\/$/, '');
    return d === 'map' ? out('mission') : out('mission', d, baseOf(d));
  }
  if (seg[0] === 'entity') {
    if (/\.def$/.test(b)) { const n = b.slice(0, -4); return out('entity', n, n); }
    if (MODEL_EXT.test(b) || TEX_EXT.test(b)) return out('model');
    if (/\.(inc|ext|lua|fsm)$/.test(b)) return out('script');
    if (SND_EXT.test(b)) return out('sound');
    return out(null);
  }
  if (seg[0] === 'set') {
    if (seg[1] === 'stuff') {
      if (/\.(inc|presets)$/.test(b) || /^\./.test(b)) return out('script');
      const n = b.replace(/\.[a-z0-9_]+$/, '') || b;
      if (seg[2] === 'ammo' || /\.ammo$/.test(b)) return out('ammo', n, n);
      if (WEAPON_DIR.test(seg[2] || '') || /\.weapon$/.test(b)) return out('weapon', n, n);
      return out(null);
    }
    if (seg[1] === 'breed') return /\.inc$/.test(b) ? out('script') : out('breed', g, noExt(g.slice('set/breed/'.length)));
    if (seg[1] === 'multiplayer' && seg[2] === 'units') return out('card');
    if (seg[1] === 'squad' || seg[1] === 'squads') return out('squad');
    if (/^interaction/.test(seg[1] || '')) return out('script');
    return out(null);
  }
  if (seg[0] === 'interface') return out('interface');
  if (seg[0] === 'sound' || seg[0] === 'music' || SND_EXT.test(b)) return out('sound');
  if (seg[0] === 'script' || /^interaction/.test(seg[0]) || /\.lua$/.test(b)) return out('script');
  if (seg[0] === 'properties') return /interaction/.test(g) ? out('script') : out('properties');
  if (seg[0] === 'texture' || seg[0] === 'textures' || TEX_EXT.test(b) || MODEL_EXT.test(b)) return out('model');
  if (/\.inc$/.test(b)) return out('script');
  return out(null);
}

// class of an entity. cards = units-list rows of the entity (any shape with tags + content), goh: no edrun/pack.js
function clsOf(key, name, cards, isSkin, goh) {
  const k = '/' + lc(slash(key)).replace(/^\/+/, '');
  if (!goh && cards && cards.length) {
    let pack = null;
    try { pack = require('../../edrun/pack.js'); } catch (e) { pack = null; }
    if (pack) {
      const c = cards[0], card = { card: String(c.id || c.card || name), tags: Array.isArray(c.tags) ? c.tags.map(String) : words(c.tags), content: String(c.content || '') };
      let w = null;
      try { w = pack.classOf(card, name); } catch (e) { w = null; }
      if (w === 'infantry') return 'human';
      if (w === 'gun' || w === 'mortar' || w === 'mg') return 'gun';
      if (w === 'vehicle') return /\/cannon\//.test(k) ? 'gun' : 'vehicle';
    }
  }
  if (cards && cards.length && goh) {
    const c = cards[0];
    if (c.kind === 'soldier' || c.kind === 'squad') { if (isSkin || /humanskin\//.test(k)) return 'human'; }
    else if (words(Array.isArray(c.tags) ? c.tags.join(' ') : c.tags).includes('cannon')) return 'gun';
  }
  if (/\/cannon\//.test(k)) return 'gun';
  if (/\/-vehicle\//.test(k)) return 'vehicle';
  if (/humanskin\//.test(k) || isSkin) return 'human';
  if (!key) return 'other';
  return 'static';
}

// ---------- the index, read once per call ----------
function makeLook(index, units, goh, notes) {
  const idx = index && index.idx ? index.idx : null, src = index && index.src ? index.src : null;
  const ents = idx && idx.entities ? idx.entities : {}, stuff = idx && idx.stuff ? idx.stuff : {}, models = idx && idx.models ? idx.models : {};
  const L = { idx, has: !!idx };
  const IK = g => 'resource/' + g;           // game key -> index key
  const GK = k => lc(k).replace(/^resource\//, '');
  L.IK = IK; L.GK = GK;
  L.entAt = g => ents[IK(g)] || null;
  L.entsNamed = n => { if (!idx) return []; if (typeof idx.byName === 'function') return idx.byName(n) || []; return Object.values(ents).filter(r => r.name === lc(n)); };
  L.ent = (n, g) => (g && L.entAt(g)) || L.entsNamed(n)[0] || null;

  // stuff
  const stuffName = k => { const r = stuff[k]; return lc((r && r.name) || baseOf(k).replace(/\.[a-z0-9_]+$/, '')); };
  const stuffKind = k => { const c = classify(k); return c.kind === 'weapon' || c.kind === 'ammo' ? c.kind : null; };
  let byStuffName = null;
  const stuffByName = n => {
    if (!byStuffName) { byStuffName = new Map(); for (const k of Object.keys(stuff)) push(byStuffName, stuffName(k), k); }
    return byStuffName.get(lc(n)) || [];
  };
  const findMemo = new Map();
  // a raw reference ("76mm_zis5", "ammo bullet76 ap", "mp40") -> stuff keys
  const stuffOf = v => {
    const t = lc(v).trim();
    if (findMemo.has(t)) return findMemo.get(t);
    let r = stuffByName(t);
    if (!r.length && idx && typeof idx.stuffFind === 'function') { try { r = idx.stuffFind(t) || []; } catch (e) { r = []; } }
    if (!r.length) { const w = words(t).filter(x => x !== 'ammo'); for (const x of w) { const h = stuffByName(x); if (h.length) { r = h; break; } } }
    findMemo.set(t, r);
    return r;
  };
  L.stuffAt = g => stuff[IK(g)] || null;
  L.stuffName = stuffName;

  // entity -> weapon / ammo names, and the reverse
  let wOfEnt = null, entsOfW = null, entsOfA = null;
  const refsMaps = () => {
    if (wOfEnt) return;
    wOfEnt = new Map(); entsOfW = new Map(); entsOfA = new Map();
    for (const r of Object.values(ents)) {
      const ws = [];
      for (const f of r.refs || []) {
        const kind = f[0], val = f[1];
        if (kind === 'weapon') {
          const ks = stuffOf(val).filter(k => stuffKind(k) !== 'ammo');
          const ns = ks.length ? [...new Set(ks.map(stuffName))] : [words(val)[0]].filter(Boolean);
          for (const n of ns) { if (!ws.includes(n)) ws.push(n); push(entsOfW, n, r); }
        } else if (kind === 'ammo' || (kind === 'item' && /^(ammo\s|bullet|shell)/i.test(String(val)))) {
          const ks = stuffOf(val).filter(k => stuffKind(k) === 'ammo');
          const ns = ks.length ? [...new Set(ks.map(stuffName))] : words(val).filter(x => x !== 'ammo').slice(0, 1);
          for (const n of ns) push(entsOfA, n, r);
        }
      }
      wOfEnt.set(r.key, ws);
    }
  };
  L.weaponsOfEnt = r => { refsMaps(); return (wOfEnt.get(r.key) || []).slice(); };
  L.entsOfWeapon = n => { refsMaps(); return [...new Set(entsOfW.get(lc(n)) || [])]; };
  L.entsOfAmmo = n => { refsMaps(); return [...new Set(entsOfA.get(lc(n)) || [])]; };

  // breeds: { name, key, skin, weapons:[stuff name], items:[raw] } read from the breed files (index.src.get)
  let breeds = null;
  const readBreeds = () => {
    if (breeds) return breeds;
    breeds = { list: [], byName: new Map(), bySkin: new Map(), byWeapon: new Map() };
    const keys = index && index.keys ? [...index.keys] : [];
    if (!src || typeof src.get !== 'function') { if (keys.length || idx) notes.push('breed files not readable (no index source): human weapons come from the units list only'); }
    else for (const key of keys.sort()) {
      const k = lc(key);
      if (!k.startsWith('resource/set/breed/') || /\/\.|\.inc$/.test(k)) continue;
      let text = null;
      try { const b = src.get(key); text = b == null ? null : (Buffer.isBuffer(b) ? b.toString('latin1') : String(b)); } catch (e) { text = null; }
      if (text === null) continue;
      text = text.replace(/;[^\n]*/g, '');
      const b = { name: noExt(k.slice('resource/set/breed/'.length)), key: k, skin: null, weapons: [], items: [] };
      const sm = /\{\s*skin\s+"?([^"\s{}]+)"?/i.exec(text);
      if (sm) b.skin = lc(baseOf(slash(sm[1])));
      const re = /\{\s*item\s+"([^"]*)"/gi;
      let m;
      while ((m = re.exec(text))) {
        b.items.push(m[1]);
        if (/^ammo\b/i.test(m[1].trim())) continue;
        for (const sk of stuffOf(m[1])) if (stuffKind(sk) === 'weapon') { const n = stuffName(sk); if (!b.weapons.includes(n)) b.weapons.push(n); }
      }
      breeds.list.push(b); breeds.byName.set(b.name, b);
      if (b.skin) push(breeds.bySkin, b.skin, b);
      for (const w of b.weapons) push(breeds.byWeapon, w, b);
    }
    return breeds;
  };
  L.breed = n => readBreeds().byName.get(lc(n)) || null;
  L.breedsOfSkin = n => readBreeds().bySkin.get(lc(n)) || [];
  L.breedsOfWeapon = n => readBreeds().byWeapon.get(lc(n)) || [];

  // units list
  const U = Array.isArray(units) ? units.filter(u => u && u.id !== undefined) : [];
  const unitVehicle = u => {
    if (u.kind !== 'vehicle') return null;
    if (u.vehicle) return lc(u.vehicle);
    if (goh) { const w = /^\s*([^\s()*:]+)/.exec(String(u.content || '')); if (w) return lc(baseOf(w[1])); }
    return lc(baseOf(String(u.id).replace(/\([^)]*\)\s*$/, '').trim()));
  };
  let uByDef = null, uByVeh = null, uByBreed = null, uByFile = null;
  const unitMaps = () => {
    if (uByDef) return;
    uByDef = new Map(); uByVeh = new Map(); uByBreed = new Map(); uByFile = new Map();
    for (const u of U) {
      if (u.def) push(uByDef, lc(u.def), u);
      const v = unitVehicle(u);
      if (v) push(uByVeh, v, u);
      for (const m of u.members || []) if (m && m.breed) push(uByBreed, lc(m.breed), u);
      if (u.cardFile) push(uByFile, gameKey(u.cardFile), u);
    }
  };
  const uniqU = l => [...new Set(l)];
  L.unitsOfBreed = n => { unitMaps(); return uByBreed.get(lc(n)) || []; };
  L.unitsOfFile = g => { unitMaps(); return uByFile.get(g) || []; };
  // direct = the card is this entity (vehicle, gun); crew = a member's breed wears this skin
  L.unitsOfEnt = (name, key) => {
    unitMaps();
    const direct = (key && uByDef.get(lc(key))) || [], veh = uByVeh.get(lc(name)) || [];
    const d = uniqU(direct.concat(veh));
    const skin = [];
    for (const b of L.breedsOfSkin(name)) for (const u of L.unitsOfBreed(b.name)) if (u.kind !== 'vehicle') skin.push(u);
    return { direct: d, skin: uniqU(skin), all: uniqU(d.concat(skin)) };
  };
  L.cardRef = u => ({ card: String(u.id), army: u.army === undefined ? null : u.army, buyable: u.buyable === undefined ? null : !!u.buyable });

  // files -> entities that were derived from them (deps, inherits, model)
  let byDep = null, byModel = null;
  const depMaps = () => {
    if (byDep) return;
    byDep = new Map(); byModel = new Map();
    for (const r of Object.values(ents)) {
      const seen = new Set();
      for (const k of (r.deps || []).concat(r.inherits || [])) { const l = lc(k); if (l === r.key || seen.has(l)) continue; seen.add(l); push(byDep, l, r); }
      if (r.model) push(byModel, lc(r.model), r);
    }
  };
  L.entsOfFile = g => { depMaps(); return byDep.get(IK(g)) || []; };
  L.entsOfModel = g => { depMaps(); return byModel.get(IK(g)) || []; };

  // a model file (ply vol anm mtl texture) -> the .mdl files that name it
  let byRef = null;
  const refMap = () => {
    if (byRef) return;
    byRef = new Map();
    for (const mk of Object.keys(models)) for (const f of models[mk].refs || []) {
      const v = lc(slash(f[1])).replace(/^\$?\/+/, '');
      if (!v) continue;
      push(byRef, baseOf(noExt(v)), { mdl: lc(mk), kind: f[0], val: v, rooted: /^\$?[\\/]/.test(String(f[1])) });
    }
  };
  L.modelsOfFile = g => {
    refMap();
    if (/\.mdl$/.test(g)) return [];
    const full = IK(g), stem = noExt(full), base = baseOf(stem), tex = TEX_EXT.test(g);
    const same = [], far = [];
    for (const h of byRef.get(base) || []) {
      if ((h.kind === 'texture') !== tex && !(h.kind !== 'texture' && /\.mtl$/.test(g))) continue;
      const d = dirOf(h.mdl), bare = h.val.indexOf('/') < 0;
      const want = noExt(h.rooted ? 'resource/' + h.val : path.posix.normalize(d + h.val));
      if (want === stem) same.push(h.mdl);
      else if (h.rooted && stem.endsWith('/' + noExt(h.val))) same.push(h.mdl);
      else if (tex && bare) far.push(h.mdl);
      else if (tex && stem.endsWith('/' + noExt(h.val))) far.push(h.mdl);
    }
    // a .mtl belongs to the model of its name
    if (/\.mtl$/.test(g)) { const m = stem.replace(/#\d+$/, '') + '.mdl'; if (models[m]) same.push(m); }
    return [...new Set(same.length ? same : far)].map(GK);
  };
  L.isModel = g => !!models[IK(g)];
  return L;
}

async function from(stack, changes, opt) {
  stack = stack || {}; opt = opt || {};
  const deps = opt.deps !== false, maxDeps = opt.maxDeps > 0 ? opt.maxDeps : 500;
  const notes = [], goh = stack.kind === 'goh' || stack.exe === 'goh' || stack.gid === 'goh';
  const files = [];
  for (const f of (changes && Array.isArray(changes.files) ? changes.files : [])) {
    if (!f || typeof f.rel !== 'string' || !f.rel.trim()) { notes.push('a change with no path was left out: ' + JSON.stringify(f === undefined ? null : f)); continue; }
    files.push(f);
  }
  if (changes && !Array.isArray(changes.files)) notes.push('changes.files is not a list: nothing to map');

  // the index and the units list: injected, else through the stack's functions; a missing game = file-level items only
  let index = opt.index || null, units = Array.isArray(opt.units) ? opt.units : null, needsGame = false;
  if (!index) {
    if (!stack.gameDir) { needsGame = true; notes.push('no game dir: file-level items only (no class, weapons, carriers, cards or dependants)'); }
    else if (typeof stack.index === 'function') {
      try { index = await stack.index(stack); } catch (e) { notes.push('entity index not built: ' + String(e && e.message || e).split('\n')[0]); }
    } else notes.push('the stack has no index function: file-level items only');
    if (stack.gameDir && !index) needsGame = true;
  }
  if (!units) {
    units = [];
    if (stack.gameDir && typeof stack.units === 'function') {
      try { const u = await stack.units(stack); units = Array.isArray(u) ? u : (u && Array.isArray(u.units) ? u.units : []); } catch (e) { notes.push('units list not read: ' + String(e && e.message || e).split('\n')[0]); }
    }
  }
  const L = makeLook(index, units, goh, notes);

  const items = [], byId = new Map(), unmapped = [];
  const mk = (kind, key, name, source, file) => {
    const id = kind + ':' + key;
    let it = byId.get(id);
    if (!it) {
      it = { id, kind, key, name: name || key, cls: null, source, why: [], via: [], weapons: [], carriers: [], cards: [], file: file || null };
      byId.set(id, it); items.push(it);
    } else {
      if (source === 'changed' && it.source !== 'changed') { it.source = 'changed'; it.via = []; }
      if (!it.file && file) it.file = file;
    }
    return it;
  };
  const addWhy = (it, f) => { if (!it.why.some(w => w.rel === f.rel && w.state === f.state)) it.why.push({ rel: f.rel, state: f.state || 'changed' }); };
  const addVia = (it, from) => {
    if (it.source === 'changed' || it === from) return;
    if (!it.via.includes(from.id)) it.via.push(from.id);
    for (const w of from.why) addWhy(it, w);
  };
  const addCards = (it, us) => { for (const u of us) { const c = L.cardRef(u); if (!it.cards.some(x => x.card === c.card)) it.cards.push(c); } };

  // facts of an entity item: file, class, weapons, cards
  const fillEntity = (it, rec, g) => {
    const key = rec ? rec.key : (g ? L.IK(g) : '');
    if (!it.file) it.file = key ? L.GK(key) : null;
    const us = L.has || units.length ? L.unitsOfEnt(it.key, key) : { direct: [], skin: [], all: [] };
    const skins = L.has ? L.breedsOfSkin(it.key) : [];
    it.cls = clsOf(key, it.key, us.direct.length ? us.direct : us.skin, skins.length > 0, goh);
    addCards(it, us.all);
    const ws = [];
    if (it.cls === 'human') for (const b of skins) for (const w of b.weapons) if (!ws.includes(w)) ws.push(w);
    if (rec) for (const w of L.weaponsOfEnt(rec)) if (!ws.includes(w)) ws.push(w);
    if (it.cls === 'human' && !ws.length) for (const u of us.all) for (const w of [].concat(u.gun && u.gun.weapon ? [u.gun.weapon] : [], Array.isArray(u.weapons) ? u.weapons : [])) { const n = lc(typeof w === 'string' ? w : w && w.weapon); if (n && !ws.includes(n)) ws.push(n); }
    it.weapons = ws;
    const u0 = us.direct[0];
    if (u0 && u0.name) it.name = String(u0.name);
    return us;
  };
  const cardItem = (u, source) => {
    const it = mk(u.kind === 'squad' ? 'squad' : 'card', String(u.id), u.name ? String(u.name) : String(u.id), source, u.cardFile ? gameKey(u.cardFile) : null);
    addCards(it, [u]);
    return it;
  };
  const pullCards = (from, us) => { for (const u of us) addVia(cardItem(u, 'depends'), from); };
  // entity recs -> depends items of `from` (capped), each with its cards
  const pullEnts = (from, recs) => {
    let list = [...new Set(recs)].filter(r => r && ('entity:' + r.name) !== from.id);
    if (list.length > maxDeps) {
      list.sort((a, b) => (a.source === 'mod' ? 0 : 1) - (b.source === 'mod' ? 0 : 1) || (a.key < b.key ? -1 : 1));
      notes.push(from.id + ' is used by ' + list.length + ' entities: the first ' + maxDeps + ' are in the plan (mod entities first)');
      list = list.slice(0, maxDeps);
    }
    const out = [];
    for (const r of list) {
      const was = byId.get('entity:' + r.name);
      const it = mk('entity', r.name, r.name, 'depends', L.GK(r.key));
      addVia(it, from);
      if (!was) { const us = fillEntity(it, r, null); pullCards(it, us.all); }
      out.push(it);
    }
    return out;
  };

  // 1) one item per changed file
  const changed = [];   // {it, c, f}
  for (const f of files) {
    const c = classify(f.rel);
    let kind = c.kind, key = c.key, name = c.name;
    if (kind === 'entity' && L.has) { const r = L.entAt(c.gkey); if (r && r.name) key = name = r.name; }
    if ((kind === 'weapon' || kind === 'ammo') && L.has) {
      const r = L.stuffAt(c.gkey);
      if (r) key = name = L.stuffName(L.IK(c.gkey));
      else if (f.state !== 'removed') kind = null;   // in a weapon folder but the index holds no stuff there: not a weapon
    }
    if (!kind && L.has && c.gkey.startsWith('set/stuff/') && L.stuffAt(c.gkey)) {
      // a stuff file outside the known weapon folders is a weapon when something mounts or carries it
      const n = L.stuffName(L.IK(c.gkey));
      if (L.entsOfWeapon(n).length) { kind = 'weapon'; key = name = n; }
    }
    if (!kind && c.gkey.startsWith('entity/') && L.has) {
      // any other file of an entity folder belongs to the .def of that folder
      const d = dirOf(c.gkey), n = baseOf(d.replace(/\/$/, '')), r = L.entAt(d + n + '.def');
      if (r) { const it = mk('entity', r.name, r.name, 'changed', L.GK(r.key)); addWhy(it, f); changed.push({ it, c, f, rec: r }); continue; }
    }
    if (!kind) {
      unmapped.push(f.rel);
      let area = AREAS.includes(f.area) ? f.area : null;
      if (!area) { try { area = require('../../lib/modtree').areaOf(slash(f.rel)); } catch (e) { area = 'other'; } }
      const it = mk('other', area || 'other', area || 'other', 'changed', null);
      addWhy(it, f);
      continue;
    }
    const it = mk(kind, key, name, 'changed', c.gkey);
    addWhy(it, f);
    changed.push({ it, c, f, rec: null });
  }

  // 2) facts and dependants
  const done = new Set();
  for (const ch of changed) {
    const it = ch.it, g = ch.c.gkey, tag = it.id + '\0' + g;
    if (done.has(tag)) continue;
    done.add(tag);
    if (it.kind === 'entity') {
      const rec = ch.rec || (L.has ? L.ent(it.key, /\.def$/.test(g) ? g : null) : null);
      const first = it.cls === null;
      const us = first ? fillEntity(it, rec, /\.def$/.test(g) ? g : null) : null;
      if (deps) {
        if (first) pullCards(it, us.all);
        if (rec && L.has) pullEnts(it, L.entsOfFile(L.GK(rec.key)));
      }
    } else if (it.kind === 'model') {
      if (!L.has || !deps) continue;
      const mdls = /\.mdl$/.test(g) ? [g] : L.modelsOfFile(g);
      const recs = L.entsOfFile(g).slice();
      for (const m of mdls) {
        let from = it;
        if (m !== g) { from = mk('model', m, baseOf(m), 'depends', m); addVia(from, it); }
        const users = L.entsOfModel(m).concat(L.entsOfFile(m));
        if (from !== it) pullEnts(from, users); else for (const r of users) recs.push(r);
      }
      pullEnts(it, recs);
    } else if (it.kind === 'weapon') {
      if (!L.has) continue;
      const recs = L.entsOfWeapon(it.key).slice();
      for (const b of L.breedsOfWeapon(it.key)) if (b.skin) for (const r of L.entsNamed(b.skin)) recs.push(r);
      it.carriers = [...new Set(recs.map(r => r.name))].sort();
      if (deps) {
        pullEnts(it, recs.concat(L.entsOfFile(g)));
        for (const b of L.breedsOfWeapon(it.key)) pullCards(it, L.unitsOfBreed(b.name));
      }
    } else if (it.kind === 'ammo') {
      if (!L.has) continue;
      const recs = L.entsOfAmmo(it.key);
      it.carriers = [...new Set(recs.map(r => r.name))].sort();
      if (deps) pullEnts(it, recs.concat(L.entsOfFile(g)));
    } else if (it.kind === 'breed') {
      const us = L.unitsOfBreed(it.name);
      addCards(it, us);
      const b = L.has ? L.breed(it.name) : null;
      if (b) it.weapons = b.weapons.slice();
      if (deps) {
        if (b && b.skin) pullEnts(it, L.entsNamed(b.skin));
        pullCards(it, us);
      }
    } else if (it.kind === 'card' || it.kind === 'squad') {
      // the rows of a changed units file: which row changed is not known, so every card of the file depends on it
      const us = L.unitsOfFile(g);
      addCards(it, us);
      if (deps) pullCards(it, us);
    } else if (it.kind === 'script' || it.kind === 'properties') {
      if (L.has && deps) pullEnts(it, L.entsOfFile(g));
    }
  }
  if (!L.has && files.length && !needsGame && !opt.index) needsGame = true;
  return { items, unmapped, notes, needsGame };
}

module.exports = { from, classify, gameKey, clsOf, KINDS, CLS };
