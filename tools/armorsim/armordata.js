// armorsim/armordata: where the armour and shell numbers come from in game data (read-only, VFS + mods + a folder).
// Reads through tools/lib/sdlset (vfs.js + sdlx.js: includes, macros, stuff-dir .presets expanded as the engine does).
// Engine readers mirrored:
// volumes default material, ReadStuff/{from}, stuff weapon(Bullet)
// ReadParamsKeyword + params by ammo Add/Get/ApplyDefaultChanges
// , set/ballistics.set.
//
// opts (every call): { game: install dir, mods: ['id', ...], folder: loose mod folder (read first), src: a source from
//   openSource() to reuse, modes: ['mp', ...] which `(mod "x" ...)` blocks count (default none), exe: the game's vfs exe
//   'as64' | 'mowas_2' (alias 'mowas2') (sdlset.createSource exe; none = the vfs default, as64 when as64.exe is there) }
//
// Exports
//   openSource(opts) -> sdlset source (cached per game/mods/folder/exe)
//   vehicleArmor(entityName | def key | def file, opts) ->
//     { entity, key, defaultMaterial, model (mdl key | null),
//       volumes: { '<volume name>': { name, tags[], component, material, bone, inModel, inDef,
//           own { front, top, left, right, rear, bottom } the volume's {thickness} (volume generic sides)
//           sides [6]          own by engine side index (0 front 1 top 2 left 3 right 4 rear 5 bottom)
//           area               name of the first armour area covering the volume's first tag (null: none)
//           thickness { front, top, left, right, rear, bottom }   what GetThickness returns per side (area value if nonzero)
//           effectiveSides [6], rayCast (area ray_cast_thickness), source { own: [6 loc], area: [6 loc|null] } } },
//       areas: [ { name, thickness { front, side, rear, top }, volumes [patterns], threshold { pierce { value, koef },
//           blast { value, koef }, calibre }, durability { pierce { value, koef }, blast { value, koef } },
//           flags { wholeWound, rayCastThickness, disableDamageAcc }, source { thickness: loc, setting: loc } } ],
//       problems: [ { code, msg, loc } ] }
//     loc = { file, line, site? { file, line } }  site = outermost macro/include call in the def (where an edit goes)
//   shell(spec, opts) -> spec 'weapon name' | 'ammo tags' | { weapon, ammo }; opts.ammo also names the ammo
//     { weapon, weaponKey, ammo, ammoKey, kind 'ap'|'apcr'|'he'|'heat'|'smoke'|'other', tags[], params ('(default)' or
//       the matched {parameters "tags"}), calibre, table [[m, mm]] | null, projectileDamage, projectileDamageClip,
//       projectileDamageThreshold, curve { name, points } | null, aimRange (m), maxRange (m), overmatchDamping,
//       ricochetEnergyDamping, ricochetDamageClip, disableRicochet, noRicochet, detonationThickness, applyProjectile,
//       cumulative (m), damage [ { type, energy, area [in, out] } | { type:'cumulative', distance, damage }
//       | { type:'fire', radius (m), heating, time (s) } ],
//       penetration [[m, mm]] (sample points), candidates [names] (when the pair was guessed),
//       ammoNotLoaded { asked, weapon, loads: [names], near?: [loaded names whose tags start with the other asked words] } | null (a real ammo the weapon's filling does not take; still fired),
//       ammoFallback { asked, used, why, loads } | null (the asked ammo name resolved to nothing; `used` = the weapon's default), source { key: loc,
//       damage: [{ type, file, line, fields: { name: loc } }] (one per damage entry, same order) } }
//     the object is a pen.js Shell as is.
//   materials(opts) -> { name: { ricochet { chance [[deg, p]], angle [[in, out]], velocityDumping, gravityScale },
//       steelEquivalent, durabilityPierce, durabilityBlast, source } }
//   ballistics(opts) -> { curveName: [[x, y]] }
//   keys(src) -> [every file key the source serves, sorted]: loose folder files, the folder's own paks, the vfs
//   opts.goh (Gates of Hell, goh.js): shell() also returns goh { overmatchCalibre [[deg, x, y]], overmatchFixed / overmatchSlope [[deg, v]]
//     (as read: appended, not sorted), minimumDamageModifier }; parse/findDef/kids/nameOf/nums/strs/str0/modelVolumes/resolveRel exported for goh.js
// Author: Imperator_Aug (ARSENAL, ia-6cf76831)
'use strict';
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');

const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
const lc = s => String(s === undefined || s === null ? '' : s).toLowerCase();
const isNum = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT');
const nameOf = b => { const f = b.items[0]; return f && f.k === 'IDENT' ? f.text : f && f.k === 'STRING' ? f.value : null; };
const argsOf = b => b.items.slice(1).filter(t => t.k !== 'BLOCK' && t.k !== 'MOD');
const nums = b => argsOf(b).filter(isNum).map(t => t.value);
const strs = b => argsOf(b).filter(t => t.k === 'STRING').map(t => t.value);
const str0 = b => { const a = argsOf(b)[0]; return a && a.k === 'STRING' ? a.value : null; };
const words = s => lc(s).split(/\s+/).filter(Boolean);
const bool = b => { const a = argsOf(b)[0]; if (!a) return true; const v = lc(a.k === 'STRING' ? a.value : a.text); return !/^(0|false|no|off)$/.test(v); };

function siteOf(n) { let v = n.via, last = null; while (v) { last = v; v = v.via; } return last ? { file: last.file, line: last.line } : null; }
function loc(n) { const o = { file: n.file, line: n.line }; const s = siteOf(n); if (s) o.site = s; return o; }

// child blocks; `(mod "x" ...)` content counts when x is in modes (or `not` and x is not)
function kids(b, modes) {
  const out = [];
  (function walk(items) {
    for (const it of items) {
      if (it.k === 'BLOCK') out.push(it);
      else if (it.k === 'MOD') { const on = modes.has(lc(it.name)); if (it.not ? !on : on) walk(it.items); }
    }
  })(b.items);
  return out;
}

// ---------- source ----------
const SRC = new Map();
function openSource(o = {}) {
  if (o.src) return o.src;
  const exe = o.exe === 'mowas2' ? 'mowas_2' : (o.exe || null);
  const k = JSON.stringify([o.game || null, o.mods || null, o.folder ? path.resolve(o.folder) : null].concat(exe ? [exe] : []));
  if (!SRC.has(k)) SRC.set(k, sdlset.createSource(Object.assign({ gameDir: o.game, mods: o.mods, folder: o.folder }, exe ? { exe } : {})));
  return SRC.get(k);
}
function allKeys(src) {
  if (src._armorKeys) return src._armorKeys;
  const s = new Set(src.local.keys());
  if (src.v) for (const k of src.v.files.keys()) s.add(k);
  if (typeof src.packed === 'function') for (const k of src.packed().keys()) s.add(k);   // the folder's own paks (a mod given as --folder)
  return (src._armorKeys = [...s].sort());
}
function parse(src, key, buf) {
  const b = buf || src.get(key);
  if (!b) return null;
  return sdlx.read(b, { file: key, key, open: (r, from) => src.open(r, from), onError: () => {}, preInclude: src.preInclude(key) }).root;
}
const modesOf = o => new Set((o.modes || []).map(lc));

// ---------- vehicle armour ----------
const MATERIAL_TAGS = ['flesh', 'steel', 'wood', 'concrete', 'sand', 'ice', 'straw'];   //

function findDef(src, name) {
  const n = lc(name).replace(/\\/g, '/');
  const ks = allKeys(src);
  if (n.endsWith('.def') && n.includes('/')) {
    const k = n.startsWith('resource/') ? n : 'resource/' + n.replace(/^\//, '');
    if (ks.includes(k)) return { key: k };
  }
  const base = n.replace(/\.def$/, '').split('/').pop();
  const hits = ks.filter(k => k.startsWith('resource/entity/') && k.endsWith('/' + base + '.def'));
  return hits.length ? { key: hits[0], candidates: hits.length > 1 ? hits : undefined } : null;
}

function readVolume(blk, vols, order, problems) {
  const name = str0(blk);
  if (!name) return;
  const key = lc(name);
  let v = vols.get(key);
  if (!v) { v = { name, tags: [name], component: null, material: null, bone: null, inModel: false, inDef: true, sides: [0, 0, 0, 0, 0, 0], ownSrc: [null, null, null, null, null, null] }; vols.set(key, v); order.push(key); }
  v.inDef = true;
  for (const c of kids(blk, new Set())) {
    const n = lc(nameOf(c));
    if (n === 'tags') { for (const s of strs(c)) for (const w of words(s)) if (!v.tags.map(lc).includes(w)) v.tags.push(w); }
    else if (n === 'component') v.component = str0(c);
    else if (n === 'material') v.material = str0(c);
    else if (n === 'bone') v.bone = str0(c);
    else if (n === 'thickness') {
      // optional keyword, a number for every side (2nd number read and dropped)
      // then {front|rear|left|right|top|bottom N} per side
      const it = c.items.slice(1);
      let i = 0;
      if (it[i] && it[i].k === 'IDENT') i++;
      if (isNum(it[i])) { for (let s = 0; s < 6; s++) { v.sides[s] = it[i].value; v.ownSrc[s] = loc(c); } }
      for (const sb of kids(c, new Set())) {
        const s = SIDES.indexOf(lc(nameOf(sb)));
        const x = nums(sb);
        if (s < 0) { problems.push({ code: 'WRONG_SIDE', msg: `{thickness} sub-block "${nameOf(sb)}" is not a side (engine: ERROR "Wrong side")`, loc: loc(sb) }); continue; }
        if (x.length) { v.sides[s] = x[0]; v.ownSrc[s] = loc(sb); }
      }
    }
  }
}

function readArmor(blk, areas, problems, modes) {
  for (const st of kids(blk, modes)) {
    if (lc(nameOf(st)) !== 'setting') continue;
    const name = str0(st) || '';
    let a = areas.find(x => lc(x.name) === lc(name));            // same name merges (DMG-23)
    if (!a) {
      a = { name, thickness: { front: 0, side: 0, rear: 0, top: 0 }, volumes: [], threshold: { pierce: { value: 0, koef: 0 }, blast: { value: 0, koef: 0 }, calibre: 0 },
        durability: { pierce: { value: 0, koef: 0 }, blast: { value: 0, koef: 0 } }, flags: { wholeWound: false, rayCastThickness: false, disableDamageAcc: false }, source: { setting: loc(st), thickness: null } };
      areas.push(a);
    }
    for (const k of kids(st, modes)) {
      const n = lc(nameOf(k));
      if (n === 'thickness') {
        const v = nums(k);                                          // one / two / four values
        if (!v.length) continue;
        if (v.length === 1) a.thickness = { front: v[0], side: v[0], rear: v[0], top: v[0] };
        else if (v.length === 2) a.thickness = { front: v[0], side: v[1], rear: v[1], top: v[1] };
        else {
          a.thickness = { front: v[0], side: v[1], rear: v[2], top: v.length > 3 ? v[3] : 0 };
          if (v.length === 3) problems.push({ code: 'AREA_THICKNESS_3', msg: `armor area "${name}" {thickness} has 3 values: engine reads rear = 3rd, top from a non-number (ERROR, top 0 here) (DMG-24)`, loc: loc(k) });
        }
        a.source.thickness = loc(k);
      } else if (n === 'volumes') a.volumes.push(...strs(k));        // patterns add up across merges (push_back)
      else if (n === 'whole_wound') a.flags.wholeWound = bool(k);
      else if (n === 'ray_cast_thickness') a.flags.rayCastThickness = bool(k);
      else if (n === 'disable_damage_acc') a.flags.disableDamageAcc = bool(k);
      else if (n === 'threshold' || n === 'durability') {
        for (const kind of kids(k, modes)) {
          const kn = lc(nameOf(kind));
          if (kn !== 'pierce' && kn !== 'blast') continue;
          for (const f of kids(kind, modes)) {
            const fn = lc(nameOf(f)), x = nums(f)[0];
            if (x === undefined) continue;
            if (fn === 'value' || fn === 'koef') a[n][kn][fn] = x;
            else if (fn === 'calibre' && n === 'threshold' && kn === 'pierce') a.threshold.calibre = x;
          }
        }
      }
    }
  }
}

// MatchWildcard, compared lower case here [I: tag case]
function wild(name, mask) {
  const re = new RegExp('^' + lc(mask).replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(lc(name));
}
const covers = (a, tag) => !a.volumes.length || a.volumes.some(p => wild(tag, p));

function modelVolumes(src, mdlKey, vols, order) {
  const root = parse(src, mdlKey);
  if (!root) return false;
  (function walk(b) {
    for (const c of kids(b, new Set())) {
      if (lc(nameOf(c)) === 'volume' && str0(c)) {
        const name = str0(c), key = lc(name);
        let v = vols.get(key);
        if (!v) { v = { name, tags: [name], component: null, material: null, bone: null, inModel: true, inDef: false, sides: [0, 0, 0, 0, 0, 0], ownSrc: [null, null, null, null, null, null] }; vols.set(key, v); order.push(key); }
        v.inModel = true;
        for (const k of kids(c, new Set())) {
          const n = lc(nameOf(k));
          if (n === 'bone' && !v.bone) v.bone = str0(k);
          else if (n === 'material' && !v.material) v.material = str0(k);
          else if ((n === 'box' || n === 'cylinder' || n === 'sphere' || n === 'polyhedron') && !v.shape) v.shape = n;
        }
      } else walk(c);
    }
  })(root);
  return true;
}

function vehicleArmor(name, opts = {}) {
  const src = openSource(opts), modes = modesOf(opts);
  let key, root;
  if (fs.existsSync(String(name)) && fs.statSync(String(name)).isFile()) {
    const abs = path.resolve(String(name)).replace(/\\/g, '/');
    const m = /\/(resource\/.*)$/i.exec(abs);
    key = m ? lc(m[1]) : 'resource/entity/' + lc(path.basename(abs));
    root = parse(src, key, fs.readFileSync(abs));
  } else {
    const f = findDef(src, name);
    if (!f) return null;
    key = f.key;
    root = parse(src, key);
  }
  if (!root) return null;
  const ent = root.items.find(i => i.k === 'BLOCK');
  const vols = new Map(), order = [], areas = [], problems = [];
  const entTags = [], parts = [];
  let defaultMaterial = null, model = null;
  for (const c of kids(ent, modes)) {
    const n = lc(nameOf(c));
    if (n === 'volume') {
      const a1 = c.items[1];
      if (a1 && a1.k === 'IDENT' && lc(a1.text) === 'defaultmaterial') { const s = c.items[2]; if (s && s.k === 'STRING') defaultMaterial = s.value; continue; }
      readVolume(c, vols, order, problems);
    } else if (n === 'armor') readArmor(c, areas, problems, modes);
    else if (n === 'props' || n === 'tags' || n === 'tag') { for (const s of strs(c)) entTags.push(...words(s)); }
    else if (n === 'extension' && str0(c)) model = resolveRel(key, str0(c));
    else if (n === 'component' && str0(c)) {   // a def adds parts by {component "name" {tags ..} {repair_time s}}
      const pn = str0(c); let p = parts.find(x => lc(x.name) === lc(pn));
      if (!p) { p = { name: pn, tags: [lc(pn)], repairTime: 0, source: loc(c) }; parts.push(p); }
      for (const k of kids(c, modes)) { const kn = lc(nameOf(k)); if (kn === 'tags') { for (const s of strs(k)) for (const w of words(s)) if (!p.tags.includes(w)) p.tags.push(w); } else if (kn === 'repair_time') p.repairTime = nums(k)[0] || 0; }
    }
  }
  if (!defaultMaterial) defaultMaterial = MATERIAL_TAGS.find(t => entTags.includes(t)) || 'default';
  const hasModel = model && modelVolumes(src, model, vols, order);
  const volumes = {};
  for (const k of order) {
    const v = vols.get(k);
    const a = areas.find(x => covers(x, v.tags[0])) || null;          // first tag = volume name
    const eff = [0, 0, 0, 0, 0, 0], asrc = [null, null, null, null, null, null];
    for (let s = 0; s < 6; s++) {
      let t = v.sides[s];
      if (a && !a.flags.rayCastThickness) {
        const av = s === 0 ? a.thickness.front : (s === 2 || s === 3) ? a.thickness.side : s === 4 ? a.thickness.rear : a.thickness.top;
        if (av) { t = av; asrc[s] = a.source.thickness; }
      }
      eff[s] = t;
    }
    const obj = o6 => ({ front: o6[0], top: o6[1], left: o6[2], right: o6[3], rear: o6[4], bottom: o6[5] });
    volumes[v.name] = { name: v.name, tags: v.tags, component: v.component, material: v.material || null, bone: v.bone, shape: v.shape || null,
      inModel: v.inModel, inDef: v.inDef, own: obj(v.sides), sides: v.sides.slice(), area: a ? a.name : null,
      thickness: obj(eff), effectiveSides: eff, rayCast: !!(a && a.flags.rayCastThickness), source: { own: v.ownSrc, area: asrc } };
  }
  return { entity: path.basename(key, '.def'), key, defaultMaterial, model: hasModel ? model : null, volumes, areas, problems, tags: entTags, parts };
}
function resolveRel(fromKey, p) {
  let s = lc(p).replace(/\\/g, '/');
  if (s.startsWith('/')) return 'resource' + s;
  const base = fromKey.split('/'); base.pop();
  const out = [];
  for (const seg of base.concat(s.split('/'))) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
  return out.join('/');
}

// ---------- stuff (weapons, ammo) ----------
function stuffIndex(src) {
  if (src._armorStuff) return src._armorStuff;
  const list = [];
  for (const k of allKeys(src)) {
    if (!k.startsWith('resource/set/stuff/') || k.includes('/_settings/')) continue;
    const base = k.slice(k.lastIndexOf('/') + 1);
    if (!base || base.startsWith('.')) continue;
    list.push({ key: k, base, tags: base.split('.').filter(Boolean) });
  }
  return (src._armorStuff = list);
}
// FindStuff / ReadStuff pending lookup: every word among the file-name tags; exact name first
function findStuff(src, spec, withPatterns) {
  const w = words(spec).flatMap(x => x.split('.')).filter(Boolean);
  const exact = lc(spec);
  const list = stuffIndex(src).filter(s => withPatterns || !s.tags.includes('pattern'));
  const ex = list.find(s => s.base === exact);
  if (ex) return [ex];
  return list.filter(s => w.every(x => s.tags.includes(x))).sort((a, b) => a.tags.length - b.tags.length || (a.key < b.key ? -1 : 1));
}

// chain oldest first: [{ key, fields: [blocks] }]; .presets of the file's dir go first (included after the type)
function stuffChain(src, key, seen = new Set()) {
  if (!key || seen.has(key)) return [];
  seen.add(key);
  const root = parse(src, key);
  if (!root) return [];
  const roots = root.items.filter(i => i.k === 'BLOCK');
  const main = roots.find(b => b.file === key) || roots[roots.length - 1];
  if (!main) return [];
  const pre = roots.filter(b => b !== main && b.file !== key);
  const first = main.items[0];
  let parent = [];
  let fields = main.items.slice(1).filter(i => i.k === 'BLOCK' || i.k === 'MOD');
  if (first && first.k === 'IDENT' && lc(first.text) === 'from') {
    const bs = main.items[1] && main.items[1].k === 'STRING' ? main.items[1].value : '';
    const p = findStuff(src, bs, true)[0];
    if (p) parent = stuffChain(src, p.key, seen);
  }
  return parent.concat([{ key, type: first && first.k === 'IDENT' ? lc(first.text) : null, fields: pre.concat(fields), file: stuffIndex(src).find(s => s.key === key) }]);
}

const P_GROUPS = ['aimRange', 'maxRange', 'curve', 'g6', 'damage', 'ricochetDamageClip', 'ricochetEnergyDamping', 'overmatchDamping'];
const newParams = () => ({ aimRange: 0, maxRange: 1e38, curve: null, g6: { projectileDamage: 0, projectileDamageClip: 1e38, projectileDamageThreshold: 0, healthDamage: 0, healthDamageClip: 1e38 },
  damage: null, ricochetDamageClip: 0, ricochetEnergyDamping: null, overmatchDamping: null, src: {} });
const clone = x => JSON.parse(JSON.stringify(x));
const pairsOf = (b, modes) => kids(b, modes).map(r => r.items.filter(isNum).map(t => t.value)).filter(p => p.length >= 2).map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]);
// Gates of Hell only (opts.goh): OvermatchCalibre {angle x y} / Fixed / Slope {angle v} points appended as read, not sorted, angles whole
// degrees (ReadInt); MinimumDamageModifier (gohweb damage/goh-overmatch-rules, keys/goh-ammo-params). Never read for AS2 / AS64.
const rowsOf = (b, modes, n) => kids(b, modes).map(r => r.items.filter(isNum).map(t => t.value)).filter(p => p.length >= n).map(p => [Math.trunc(p[0])].concat(p.slice(1, n)));
const GOH_OF = { overmatchcalibre: 'gohCalibre', overmatchfixed: 'gohFixed', overmatchslope: 'gohSlope', minimumdamagemodifier: 'gohMinDamage' };
const GOH_GROUPS = ['gohCalibre', 'gohFixed', 'gohSlope', 'gohMinDamage'];
function gohKey(P, n, c, modes) {
  if (n === 'minimumdamagemodifier') P.gohMinDamage = nums(c)[0] || 0;
  else P[GOH_OF[n]] = (P[GOH_OF[n]] || []).concat(rowsOf(c, modes, n === 'overmatchcalibre' ? 3 : 2));
  P.src[n] = loc(c);
}

// one params keyword; false = not one
function paramKey(P, n, c, modes) {
  const x = nums(c);
  switch (n) {
    case 'range': if (x.length) { P.aimRange = x[0]; if (x.length > 1) P.maxRange = x[1]; } break;
    case 'aimrange': if (x.length) P.aimRange = x[0]; break;
    case 'maxrange': P.maxRange = x.length ? x[0] : 1e38; break;
    case 'curve': P.curve = str0(c); break;
    case 'projectiledamage': P.g6.projectileDamage = x[0] || 0; if (Math.abs(P.g6.healthDamage) < 1e-5) P.g6.healthDamage = P.g6.projectileDamage / 0.025; break;
    case 'projectiledamageclip': P.g6.projectileDamageClip = x[0]; break;
    case 'projectiledamagethreshold': P.g6.projectileDamageThreshold = Math.max(x[0] || 0, 1); break;   // clamp >= 1 (:327)
    case 'healthdamage': P.g6.healthDamage = x[0] || 0; if (Math.abs(P.g6.projectileDamage) < 1e-5) P.g6.projectileDamage = P.g6.healthDamage * 0.025; break;
    case 'healthdamageclip': P.g6.healthDamageClip = x[0]; break;
    case 'projectiledamagetable': P.damage = pairsOf(c, modes); break;
    case 'overmatchdamping': P.overmatchDamping = pairsOf(c, modes); break;
    case 'ricochetenergydamping': P.ricochetEnergyDamping = pairsOf(c, modes); break;
    case 'ricochetdamageclip': P.ricochetDamageClip = x[0] || 0; break;
    default: return false;
  }
  P.src[n] = loc(c);
  return true;
}
const G_OF = { range: ['aimRange', 'maxRange'], aimrange: ['aimRange'], maxrange: ['maxRange'], curve: ['curve'], projectiledamage: ['g6'], projectiledamageclip: ['g6'],
  projectiledamagethreshold: ['g6'], healthdamage: ['g6'], healthdamageclip: ['g6'], projectiledamagetable: ['damage'], overmatchdamping: ['overmatchDamping'],
  ricochetenergydamping: ['ricochetEnergyDamping'], ricochetdamageclip: ['ricochetDamageClip'] };

function readWeapon(src, key, modes, goh) {
  const W = { calibre: 0, filling: null, disableRicochet: false, reactive: false, defaults: newParams(), blocks: [], src: {}, chain: [] };
  if (goh) Object.assign(W.defaults, { gohCalibre: [], gohFixed: [], gohSlope: [], gohMinDamage: 0 });
  for (const f of stuffChain(src, key)) {
    W.chain.push(f.key);
    const walk = (fields, block) => {
      for (const it of fields) {
        if (it.k === 'MOD') { const on = modes.has(lc(it.name)); if (it.not ? !on : on) walk(it.items.filter(i => i.k === 'BLOCK' || i.k === 'MOD'), block); continue; }
        const n = lc(nameOf(it));
        if (!block && n === 'parameters') {                          // (same tag list = same entry)
          const tags = words(str0(it) || '');
          const id = tags.slice().sort().join(' ');
          let b = W.blocks.find(x => x.id === id);
          if (!b) { b = { id, tags, p: clone(W.defaults), src: loc(it) }; W.blocks.push(b); }
          walk(it.items.slice(1).filter(i => i.k === 'BLOCK' || i.k === 'MOD'), b);
          continue;
        }
        if (G_OF[n] || (goh && GOH_OF[n])) {
          const put = P => (G_OF[n] ? paramKey(P, n, it, modes) : gohKey(P, n, it, modes));
          if (block) { put(block.p); continue; }
          const before = clone(W.defaults);
          put(W.defaults);
          for (const b of W.blocks) for (const g of goh ? P_GROUPS.concat(GOH_GROUPS) : P_GROUPS) {     // ApplyDefaultChanges: changed default fields reach every block
            if (JSON.stringify(before[g]) !== JSON.stringify(W.defaults[g])) { b.p[g] = clone(W.defaults[g]); b.p.src[n] = W.defaults.src[n]; }
          }
          continue;
        }
        if (block) continue;
        if (n === 'calibre') { const x = nums(it); if (x.length) { W.calibre = x[0]; W.src.calibre = loc(it); } }
        else if (n === 'filling') { if (str0(it)) { W.filling = str0(it); W.src.filling = loc(it); } }
        else if (n === 'disablericochet') { W.disableRicochet = bool(it); W.src.disableRicochet = loc(it); }
        else if (n === 'reactive') W.reactive = bool(it);
      }
    };
    walk(f.fields, null);
    if (W.calibre === 0 && W.filling) {                              // FINISH: calibre from a "bulletNN" filling tag
      const t = words(W.filling).find(x => x.startsWith('bullet'));
      if (t) { const v = parseInt(t.slice(6), 10); W.calibre = isFinite(v) ? v : 0; W.src.calibre = W.src.filling; }
    }
  }
  return W;
}

function readAmmo(src, key, modes) {
  const A = { tags: [], detonationThickness: 1e38, applyProjectile: false, cumulative: 0, damage: [], entity: null, src: {}, chain: [] };
  const chain = stuffChain(src, key);
  for (const f of chain) {
    A.chain.push(f.key);
    if (f === chain[chain.length - 1]) for (const t of (f.file ? f.file.tags : [])) if (!A.tags.includes(t)) A.tags.push(t);   // own file-name tags only (ReadStuff)
    const walk = fields => {
      for (const it of fields) {
        if (it.k === 'MOD') { const on = modes.has(lc(it.name)); if (it.not ? !on : on) walk(it.items.filter(i => i.k === 'BLOCK' || i.k === 'MOD')); continue; }
        const n = lc(nameOf(it)), x = nums(it);
        if (n === 'tag') { for (const s of strs(it)) for (const w of words(s)) if (!A.tags.includes(w)) A.tags.push(w); }
        else if (n === 'detonationthickness' && x.length) { A.detonationThickness = x[0]; A.src.detonationThickness = loc(it); }
        else if (n === 'applyprojectile') { A.applyProjectile = bool(it); A.src.applyProjectile = loc(it); }
        else if (n === 'cumulative' && x.length) { A.cumulative = x[0]; A.src.cumulative = loc(it); }
        else if (n === 'entity') A.entity = str0(it);
        else if (n === 'damage') {
          const ids = argsOf(it).filter(t => t.k === 'IDENT').map(t => lc(t.text));
          const add = ids.includes('add'), type = ids.find(t => t !== 'add') || '';
          const e = { type, src: loc(it), fsrc: {} };
          for (const k of kids(it, modes)) {
            const kn = lc(nameOf(k)), v = nums(k);
            // blastwave: energy, area; cumulative: damage, distance (RULES 44); fire: radius m, heating, time s (RULES 45)
            if (kn === 'energy' || kn === 'distance' || kn === 'damage' || kn === 'radius' || kn === 'heating' || kn === 'time') { e[kn] = v[0]; e.fsrc[kn] = loc(k); }
            else if (kn === 'area') { e.area = v; e.fsrc.area = loc(k); }
          }
          const i = A.damage.findIndex(d => d.type === type);
          if (!add && i >= 0) A.damage[i] = e; else A.damage.push(e);  // without `add` replaces that type (DMG-13)
        }
      }
    };
    walk(f.fields);
  }
  return A;
}

// the curve a weapon gets when its params name none: built, not in ballistics.set
const DEFAULT_CURVE = [[0, 1.2], [0.5, 0.9], [1, 0.7], [2, 0]];
function ballistics(opts = {}) {
  const src = openSource(opts), modes = modesOf(opts);
  const root = parse(src, 'resource/set/ballistics.set');
  const out = {};
  if (!root) return out;
  for (const b of root.items.filter(i => i.k === 'BLOCK')) for (const c of kids(b, modes)) if (lc(nameOf(c)) === 'curve' && str0(c) !== null) out[lc(str0(c))] = pairsOf(c, modes);
  return out;
}

function materials(opts = {}) {
  const src = openSource(opts), modes = modesOf(opts);
  const root = parse(src, 'resource/set/material.set');
  const out = {};
  if (!root) return out;
  for (const b of root.items.filter(i => i.k === 'BLOCK')) for (const m of kids(b, modes)) {
    const name = nameOf(m);
    if (!name) continue;
    const M = out[lc(name)] = { ricochet: { chance: null, angle: null, velocityDumping: null, gravityScale: null }, steelEquivalent: 1, durabilityPierce: 1, durabilityBlast: 1, damageRadius: 1, wounds: 0, source: loc(m) };
    for (const k of kids(m, modes)) {
      const n = lc(nameOf(k));
      if (n === 'ricochet') for (const r of kids(k, modes)) {
        const rn = lc(nameOf(r));
        if (rn === 'chance') M.ricochet.chance = pairsOf(r, modes);
        else if (rn === 'angle') M.ricochet.angle = pairsOf(r, modes).map(([i, o]) => [i, Math.min(o, i)]);   // out > in clamped (:93)
        else if (rn === 'velocitydumping') M.ricochet.velocityDumping = nums(r)[0];
        else if (rn === 'gravityscale') M.ricochet.gravityScale = nums(r)[0];
      } else if (n === 'steelequivalent') M.steelEquivalent = nums(k)[0];
      else if (n === 'wound') M.wounds++;                                             //
      else if (n === 'damage') { for (const d of kids(k, modes)) if (lc(nameOf(d)) === 'radius') M.damageRadius = (nums(d)[0] || 0) * 20; }   // metres to units
      else if (n === 'durability') for (const d of kids(k, modes)) {
        const dn = lc(nameOf(d));
        if (dn === 'pierce') M.durabilityPierce = nums(d)[0]; else if (dn === 'blast') M.durabilityBlast = nums(d)[0];
      }
    }
  }
  return out;
}

const fillingWords = W => words(W.filling || '');
function shell(spec, opts = {}) {
  const src = openSource(opts), modes = modesOf(opts);
  let wName = spec && typeof spec === 'object' ? spec.weapon : null, aName = spec && typeof spec === 'object' ? spec.ammo : opts.ammo || null;
  if (typeof spec === 'string') {                                       // a stuff file name that is not ammo = the weapon
    const exact = stuffIndex(src).find(s => s.base === lc(spec));
    if (exact && !/\.(ammo|grenade|mine)$/.test(exact.base)) wName = exact.base; else aName = aName || spec;
  }
  const candidates = [];
  let wKey = null, aKey = null;
  // the weapon: a stuff file that is not ammo (katusha.weapon, not katusha.ammo, when both carry the asked name)
  const isAmmo = s => /\.(ammo|grenade|mine)$/.test(s.base);
  if (wName) { const all = findStuff(src, wName, false), f = all.find(s => !isAmmo(s)) || all[0]; if (f) wKey = f.key; }
  const goh = !!opts.goh;
  let W = wKey ? readWeapon(src, wKey, modes, goh) : null;
  let fallback = null, notLoaded = null;
  if (aName) {                                                          // weapon known: an ammo its filling loads first
    const f = findStuff(src, aName, false), fw = W && W.filling ? fillingWords(W) : [];
    const fit = fw.length ? f.filter(s => fw.every(x => s.tags.includes(x))) : [];
    const pick = fit[0] || f[0];
    if (pick) aKey = pick.key;
    else fallback = { asked: aName, why: 'no stuff file is named so or carries every word of the name' };
    // a real ammo the weapon's filling does not take (stuff weapon filling words, all in the ammo's tags): fired, flagged
    if (pick && fw.length && !fit.length) {
      const loads = stuffIndex(src).filter(s => !s.tags.includes('pattern') && fw.every(x => s.tags.includes(x)));
      // near = loaded ammo whose tags start with every asked word the filling does not name ("bullet75 heat" on a
      // "bullet75 ger" gun: bullet75.ger.heatb / .heatc); a hint only, the asked ammo is still the one fired
      const rest = words(aName).flatMap(x => x.split('.')).filter(x => x && !fw.includes(x) && x !== 'ammo');
      const near = rest.length ? loads.filter(s => rest.every(x => s.tags.some(t => t.startsWith(x)))).map(s => s.base) : [];
      notLoaded = { asked: aName, weapon: wKey.split('/').pop(), loads: loads.map(s => s.base) };
      if (near.length) notLoaded.near = near;
    }
    if (fit.length > 1) candidates.push(...fit.map(s => s.base));
  }
  if (W && !aKey && W.filling) {                                        // weapon only: an ammo it loads, 'ap' first
    const fw = fillingWords(W);
    const list = stuffIndex(src).filter(s => !s.tags.includes('pattern') && fw.every(x => s.tags.includes(x)));
    const pick = list.find(s => s.tags.includes('ap')) || list[0];
    if (pick) { aKey = pick.key; candidates.push(...list.map(s => s.base)); }
    if (fallback) fallback.loads = list.map(s => s.base);
  }
  const A = aKey ? readAmmo(src, aKey, modes) : null;
  if (!W && A) {                                                         // ammo only: a weapon whose filling it fits
    const list = [];
    for (const s of stuffIndex(src)) {
      if (s.tags.includes('pattern') || /\.(ammo|grenade|mine)$/.test(s.base)) continue;
      const r = parse(src, s.key); if (!r) continue;
      const txt = JSON.stringify(r.items.filter(i => i.k === 'BLOCK').map(b => b.items.filter(i => i.k === 'BLOCK').map(nameOf)));
      if (!/"filling"/i.test(txt)) continue;
      const w = readWeapon(src, s.key, modes, goh);
      const fw = fillingWords(w);
      if (fw.length && fw.every(x => A.tags.includes(x))) list.push({ s, w });
      if (list.length >= 20) break;
    }
    if (list.length) { wKey = list[0].s.key; W = list[0].w; candidates.push(...list.map(x => x.s.base)); }
  }
  if (!W && !A) return null;
  W = W || readWeapon(src, null, modes, goh);
  const tags = A ? A.tags : [];
  const blk = tags.length ? W.blocks.find(b => b.tags.every(t => tags.includes(t))) : null;   //
  const P = blk ? blk.p : W.defaults;
  const curves = ballistics(opts);
  const has = t => tags.includes(t);
  // a display kind only (no engine branch on it, RULES 19); mods name variants: heatb/heatc, apcbc/aphe/apc, apds
  const like = re => tags.some(t => re.test(t));
  const kind = has('fg') ? 'he' : (has('cumulative') || (A && A.cumulative > 0) || like(/^heat[a-z]?\d*$/)) ? 'heat' : like(/^ap(cr|ds)\d*$/) ? 'apcr' : has('sm') ? 'smoke' : like(/^ap[a-z]{0,3}\d*$/) ? 'ap' : 'other';
  const S = {
    weapon: wKey ? wKey.split('/').pop() : null, weaponKey: wKey, ammo: aKey ? aKey.split('/').pop() : null, ammoKey: aKey, kind, tags,
    params: blk ? blk.tags.join(' ') : '(default)', calibre: W.calibre,
    table: P.damage && P.damage.length ? P.damage : null, projectileDamage: P.g6.projectileDamage, projectileDamageClip: P.g6.projectileDamageClip,
    // no curve named: the engine's unnamed default curve (RULES 48)
    projectileDamageThreshold: P.g6.projectileDamageThreshold, curve: P.curve ? { name: P.curve, points: curves[lc(P.curve)] || null } : { name: null, points: DEFAULT_CURVE.map(p => p.slice()), engineDefault: true },
    aimRange: P.aimRange, maxRange: P.maxRange, overmatchDamping: P.overmatchDamping, ricochetEnergyDamping: P.ricochetEnergyDamping,
    ricochetDamageClip: P.ricochetDamageClip, disableRicochet: W.disableRicochet,
    noRicochet: W.disableRicochet || has('fg') || has('no_ricochet'),
    detonationThickness: A ? A.detonationThickness : 1e38, applyProjectile: A ? A.applyProjectile : false, cumulative: A ? A.cumulative : 0,
    damage: A ? A.damage.map(d => { const o = Object.assign({}, d); delete o.src; delete o.fsrc; return o; }) : [],
    candidates: candidates.length > 1 ? candidates : undefined,
    // the asked ammo did not resolve and the weapon's default ammo was taken: { asked, used, why, loads: [names] } (sim.shellFrom refuses it)
    // the asked ammo resolved to a real ammo the weapon does not load: { asked, weapon, loads: [names] }; null when it loads it
    // or the weapon's filling cannot be read (no weapon, no filling words)
    ammoNotLoaded: notLoaded,
    ammoFallback: fallback ? Object.assign({ used: aKey ? aKey.split('/').pop() : null }, fallback) : null,
    source: Object.assign({}, W.src, P.src, A ? A.src : {}, { weaponChain: W.chain, ammoChain: A ? A.chain : [] },
      { damage: A ? A.damage.map(d => Object.assign({ type: d.type }, d.src, { fields: d.fsrc })) : [] }),   // per filling entry, same order as damage
  };
  if (goh) S.goh = { overmatchCalibre: P.gohCalibre || [], overmatchFixed: P.gohFixed || [], overmatchSlope: P.gohSlope || [], minimumDamageModifier: P.gohMinDamage || 0 };
  const pen = require('./pen');
  const pts = S.table ? S.table.map(p => p[0]) : [0, 0.25, 0.5, 1, 1.5, 2, 2.5].map(f => f * (S.aimRange || 0));
  S.penetration = [...new Set(pts)].map(m => [m, Math.round(pen.penetrationAt(S, m) * 100) / 100]);
  return S;
}

module.exports = { openSource, vehicleArmor, shell, materials, ballistics, SIDES, keys: allKeys, parse, findDef, kids, nameOf, nums, strs, str0, modelVolumes, resolveRel };
