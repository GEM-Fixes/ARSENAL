// goharmour: Gates of Hell per-part armour and top speed of one vehicle, read from its own files and changed in place (bytes kept).
// GoH writes armour per hit volume of the unit's def and the files it includes (vanilla: a sibling <unit>.ext, CRLF):
//   {volume "body1" {thickness 30 {front 80} {top 20}}}      base mm for every side, a side block overrides one side
//   ("shield" args "shieldl1" 5)   ("shield_group" args "s1" 8 "shield")   one number for every side (%1 of the macro, properties/vehicle.ext)
//   ("tracks" repair(30) thickness(20))   ("gun" repair(30) thickness(25))  one number for a group of volumes (%thickness)
// and top speed in the chassis: ("mobility_tank" speed(40) reverse(8) ..) (properties/mobility.inc: MaxSpeed %speed) or {MaxSpeed N}.
// Survey of the vanilla GoH data (2026-11-23, 822 vehicle defs): 405 keep volumes in an included .ext, 221 in the def; every
// {thickness} starts with a number; 677 chassis use a mobility_* macro, a few boats {Locomotion {MaxSpeed N}}, planes flight_model
// (not read here). Same-name blocks: the one read last is shown and changed; a scale changes every one [I].
//   src = { read(key) -> Buffer|null, keys?(re) -> [key], inMod?(key) -> bool }   (gen lib/ctx Ctx fits; sourceOf below builds one)
//   read(src, defKey) -> { def, files: [key], parts: [part], speed: {value, key, line, macro}|null, problems: [] }
//     part = { id, name, kind 'volume'|'macro'|'group', macro, key, line, base, sides {front: mm, ..}, shared, all: [occurrence] }
//   table(R) -> the Models armour table form (armorsim table --json: rows[{name, id, kind, sides[{side, mm, rule, at, macro}], flags}], summary)
//   plan(src, R, change, opt) -> { ok, reason, rows[{part, side, old, new, key, line}], files Map outKey -> Buffer, changes[], notes[] }
//     change = { scale: k } | { set: [{part, side: 'base'|'all'|front..bottom, mm}] } | { speed: kmh } | { speedScale: k }, may combine.
//     A value in a file shared with other units (another unit's folder, or another def of the folder includes it): the file is copied
//     next to the def as its own and the include line points there (opt.shared = change the shared file itself instead).
//   frontOf(R) -> the thickest front of the hull (body*/hull volumes, else any volume): describe's "120 mm front armour"
//   sourceOf(gameDir, mod) -> src over the GoH game view (lib/gameview) with the mod folder's loose files on top
//   restorePoints(mod, keys, action, opt) -> [id]   restore points in the Files page form, where lib/modwrite restoreRoot keeps them
//   writeFiles(mod, files, opt) -> [rel]   each target guarded (lib/modwrite guardFile), then temp file + rename, folders made
// [I] side semantics and same-name merging read from the data, not run in game; [T] in game.
// More GoH forms (survey of the vanilla vehicle files, 2026-11-23, 1334 .def/.ext/.inc under -vehicle, wrecks left out):
//   repair time   repair(N) on a group line (properties/vehicle.ext: {component .. {RepairTime %repair}}): ("gun" ..) 479,
//                 ("tracks" ..) 357, ("turret" ..) 52, ("bodyback" ..) 47, ("component" volume(..) component("x") repair(N)) 21
//                 (properties/marine.ext), aux_turret, mantlet, engine, cabin, body; values 10 to 130 (30 in 912 lines). No unit
//                 file sets {RepairTime} itself. read: R.repairs [{name, value, macro, key, line, all}]; plan {repair: [{part, s}]}
//                 sets every repair(N) of that name.
//   armour class  a no-argument call of a preset of properties/armor.ext (tank_heavy_tier1 49, tank_medium_tier2 122,
//                 armor_medium_cannon 53 ..): each calls one *_durability macro (part health) and basic_armor (thresholds).
//                 read: R.preset {name, family, options, key, line}; plan {preset: name} swaps the call for another preset of
//                 the same *_durability family (the part list of the family stays the same).
//   volume keys   {CastSteel q} 1161 (0.3 to 0.88), {HighHardness} 268, {Quality "large_flaw"} 33 (the only value in the data),
//                 {material "wood|steel|fabric|sand|concrete|glass|flesh"} 230, {density 0|0.01} 5, {able {holed}} on / {able
//                 {visible 0}} off (holed 876, nowounddecal, obstacle, contact, visible ..). read: R.volx [{name, keys, line}];
//                 plan {volx: [{part, key, value}]} (key caststeel|highhardness|quality|material|density|able.<flag>, value
//                 'none' removes the key).
//   hull material {props "steel" ..} in properties/vehicle.ext; a wooden unit adds "wood" "-steel" to its own {props} (horsa_mk1,
//                 fi156, po2, goatley_boat); a word with "-" takes an earlier word away (tags reader of the game, gem ).
//                 read: R.material {value, words}; plan {material: 'steel'|'wood'} rewrites the def's own {props}.
//   break_by_pierce: no GoH form (no vanilla file has it; the part reader of the game takes RepairTime, RepairOrder, Tags,
//                 Health only: ). Not read, not planned.
// Author: Imperator_Aug (ARSENAL, ia-c7e17679)
'use strict';
const fs = require('fs'), path = require('path');
const sw = require('./sdlwrite');

const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
const ARG_MACROS = new Set(['shield', 'shield_track', 'shield_group', 'shield_part', 'shield_tear', 'gun_shield', 'armor']);
// GoH volume keys this reader shows and changes (each seen in the vanilla vehicle files); spelling as the game's files write them
const VOL_KEYS = ['caststeel', 'highhardness', 'quality', 'material', 'density'];
const VOL_SPELL = { caststeel: 'CastSteel', highhardness: 'HighHardness', quality: 'Quality', material: 'material', density: 'density' };
const VOL_MATERIALS = ['steel', 'wood', 'fabric', 'sand', 'concrete', 'glass', 'flesh'];
const QUALITIES = ['large_flaw'];
const ABLE = ['visible', 'bullet', 'obstacle', 'contact', 'contact_ground', 'blast', 'hole', 'holed', 'touch', 'float', 'nowounddecal'];
const MATERIALS = ['steel', 'wood'];
const REPAIR = [1, 600];
const lc = s => String(s == null ? '' : s).toLowerCase();
const unq = s => String(s || '').replace(/^"|"$/g, '');
const isNum = n => !!n && n.type === 'atom' && /^-?\d*\.?\d+$/.test(n.text);
const fmt = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
const fmtQ = n => String(Math.round(n * 1e6) / 1e6);
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function lineAt(text, off) { let n = 1; for (let i = 0; i < off && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }
// an include target: "/entity/.." rooted in resource/ (unit files only; /properties/ are the game's shared macros), else next to the file
function incKey(from, s) {
  s = unq(s).replace(/\\/g, '/');
  if (s[0] === '/') return /^\/entity\//i.test(s) ? lc('resource' + s) : null;
  return lc(path.posix.normalize(dirOf(from) + '/' + s));
}

function read(src, defKey) {
  defKey = lc(defKey);
  const R = { def: defKey, files: [], texts: new Map(), trees: new Map(), edges: [], occ: [], speeds: [], problems: [], reps: [], calls: [], vols: [], props: [] };
  const seen = new Set(), seenP = new Set();
  function walkFile(key, depth) {
    if (seen.has(key)) return;
    seen.add(key);
    const buf = src.read(key);
    if (!buf) { R.problems.push('missing file ' + key); return; }
    let t;
    try { t = sw.parse(buf); } catch (e) { R.problems.push(key + ': ' + e.message); return; }
    R.files.push(key); R.texts.set(key, buf.toString('latin1')); R.trees.set(key, t);
    walk(key, t.root, depth, false);
  }
  // the game's shared files (/properties/..): read only for the {props} words they give (the hull material), never changed here
  function scanProps(key, depth) {
    if (seenP.has(key) || depth > 8) return;
    seenP.add(key);
    const buf = src.read(key); if (!buf) return;
    let t; try { t = sw.parse(buf); } catch (e) { return; }
    (function w(node) {
      for (const n of node.items || []) {
        if (n.type === 'list' && n.name === 'define') continue;
        if (n.type === 'list' && n.name === 'include' && n.items[1] && n.items[1].type === 'string') {
          const s = unq(n.items[1].text).replace(/\\/g, '/');
          scanProps(s[0] === '/' ? lc('resource' + s) : lc(path.posix.normalize(dirOf(key) + '/' + s)), depth + 1);
          continue;
        }
        if (n.type === 'block' && n.name === 'props') { R.props.push({ key, own: false, words: n.items.filter(x => x.type === 'string').map(x => lc(unq(x.text))) }); continue; }
        if (n.items) w(n);
      }
    })(t.root);
  }
  function walk(key, node, depth, inLoco) {
    for (const n of node.items || []) {
      if (n.type === 'list' && n.name === 'define') continue;
      if (n.type === 'list' && n.name === 'include' && n.items[1] && n.items[1].type === 'string') {
        const k = incKey(key, n.items[1].text);
        if (k && depth < 6) { R.edges.push({ parent: key, node: n.items[1], key: k, rooted: unq(n.items[1].text)[0] === '/' }); walkFile(k, depth + 1); }
        else if (!k && /^\/properties\//i.test(unq(n.items[1].text).replace(/\\/g, '/'))) scanProps(lc('resource' + unq(n.items[1].text).replace(/\\/g, '/')), 0);
        continue;
      }
      if (n.type === 'block' && n.name === 'props') { const ws = n.items.filter(x => x.type === 'string').map(x => unq(x.text)); R.props.push({ key, own: true, node: n, raw: ws, words: ws.map(lc) }); continue; }
      if (n.type === 'block' && n.name === 'volume' && n.items[1] && n.items[1].type === 'string') {
        R.vols.push({ name: unq(n.items[1].text), key, node: n, at: n.start });
        const th = (n.items || []).find(x => x.type === 'block' && x.name === 'thickness');
        if (th) {
          const o = { name: unq(n.items[1].text), kind: 'volume', key, at: n.start, thick: th, base: isNum(th.items[1]) ? th.items[1] : null, sides: {} };
          for (const s of th.items) if (s.type === 'block' && SIDES.includes(s.name) && isNum(s.items[1])) o.sides[s.name] = s.items[1];
          R.occ.push(o);
        }
        continue;
      }
      if (n.type === 'list' && n.name && n.items[0] && n.items[0].type === 'string') {
        const it = n.items;
        if (it.length === 1) { R.calls.push({ name: n.name, key, node: it[0], at: n.start }); continue; }
        for (let i = 1; i < it.length - 1; i++) {
          if (it[i].type !== 'atom' || lc(it[i].text) !== 'repair' || it[i + 1].type !== 'list' || !isNum(it[i + 1].items[0])) continue;
          // ("component" volume("body1") component("body1") repair(10)): the part is the component's name; else the group's name
          let name = n.name;
          if (n.name === 'component') for (let j = 1; j < it.length - 1; j++) if (it[j].type === 'atom' && lc(it[j].text) === 'component' && it[j + 1].type === 'list' && it[j + 1].items[0]) name = unq(it[j + 1].items[0].text);
          R.reps.push({ name, macro: n.name, key, at: n.start, node: it[i + 1].items[0] });
        }
        if (ARG_MACROS.has(n.name) && it[1] && lc(it[1].text) === 'args' && it[2] && isNum(it[3])) {
          R.occ.push({ name: unq(it[2].text), kind: 'macro', macro: n.name, key, at: n.start, base: it[3], sides: {} });
          continue;
        }
        for (let i = 1; i < it.length - 1; i++) {
          if (it[i].type !== 'atom' || it[i + 1].type !== 'list' || !isNum(it[i + 1].items[0])) continue;
          const w = lc(it[i].text);
          if (w === 'thickness') R.occ.push({ name: '(' + n.name + ')', kind: 'group', macro: n.name, key, at: n.start, base: it[i + 1].items[0], sides: {} });
          if (w === 'speed' && /^mobility_/.test(n.name)) R.speeds.push({ node: it[i + 1].items[0], key, at: n.start, macro: n.name });
        }
        continue;
      }
      if (n.type === 'block' && n.name === 'maxspeed' && inLoco && isNum(n.items[1])) { R.speeds.push({ node: n.items[1], key, at: n.start, macro: 'MaxSpeed' }); continue; }
      if (n.items) walk(key, n, depth, inLoco || n.name === 'locomotion');
    }
  }
  walkFile(defKey, 0);
  // rows: one per name, the occurrence read last shows; every occurrence is kept for a scale
  const by = new Map();
  for (const o of R.occ) { const k = lc(o.name); if (!by.has(k)) by.set(k, []); by.get(k).push(o); }
  R.parts = [...by.values()].map(list => {
    const o = list[list.length - 1], text = R.texts.get(o.key), sides = {};
    const base = o.base ? +o.base.text : null;
    for (const s of SIDES) sides[s] = o.sides[s] ? +o.sides[s].text : base;
    return { id: o.name, name: o.name, kind: o.kind, macro: o.macro || null, key: o.key, line: lineAt(text, o.at), base, sides, own: Object.keys(o.sides), shared: isShared(src, R, o.key), all: list, last: o };
  });
  const sp = R.speeds[R.speeds.length - 1];
  R.speed = sp ? { value: +sp.node.text, key: sp.key, line: lineAt(R.texts.get(sp.key), sp.at), macro: sp.macro, shared: isShared(src, R, sp.key), node: sp.node } : null;
  const group = (list, f) => { const m = new Map(); for (const o of list) { const k = lc(f(o)); if (!m.has(k)) m.set(k, []); m.get(k).push(o); } return [...m.values()]; };
  R.repairs = group(R.reps, o => o.name).map(all => {
    const o = all[all.length - 1];
    return { name: o.name, value: +o.node.text, macro: o.macro, key: o.key, line: lineAt(R.texts.get(o.key), o.at), shared: isShared(src, R, o.key), all };
  });
  // the armour class: the last no-argument call of a preset of properties/armor.ext
  const defs = presetDefs(src), pc = R.calls.filter(c => defs.has(c.name)).pop();
  R.presetDefs = defs;
  R.preset = pc ? { name: pc.name, family: defs.get(pc.name), options: [...defs.keys()].filter(k => defs.get(k) === defs.get(pc.name)), key: pc.key, line: lineAt(R.texts.get(pc.key), pc.at), shared: isShared(src, R, pc.key), node: pc.node } : null;
  // volume keys: one row per volume name; a key read last wins over the same key earlier [I]
  R.volx = group(R.vols, o => o.name).map(all => {
    const keys = {};
    for (const o of all) for (const b of o.node.items) {
      if (b.type !== 'block') continue;
      if (VOL_KEYS.includes(b.name)) keys[b.name] = { occ: o, node: b, value: b.name === 'highhardness' ? 'yes' : b.items[1] ? unq(b.items[1].text) : '' };
      if (b.name === 'able') for (const f of b.items) if (f.type === 'block' && ABLE.includes(f.name)) keys['able.' + f.name] = { occ: o, node: f, able: b, value: f.items[1] && /^0$/.test(f.items[1].text) ? '0' : '1' };
    }
    const o = all[all.length - 1];
    return { name: o.name, keys, last: o, all, key: o.key, line: lineAt(R.texts.get(o.key), o.at), shared: isShared(src, R, o.key) };
  });
  R.material = materialOf(R);
  return R;
}
// preset name -> its *_durability family, from the game's properties/armor.ext (a mod's copy first when the source has one)
function presetDefs(src) {
  const out = new Map(), buf = src.read('resource/properties/armor.ext');
  if (!buf) return out;
  let t; try { t = sw.parse(buf); } catch (e) { return out; }
  for (const d of t.root.items) {
    if (d.type !== 'list' || d.name !== 'define' || !d.items[1] || d.items[1].type !== 'string') continue;
    const fam = d.items.find(x => x.type === 'list' && /_durability$/.test(x.name));
    if (fam) out.set(lc(unq(d.items[1].text)), fam.name);
  }
  return out;
}
// the props words in reading order (a "-x" word takes x away): the material words left, and the def's own last {props}
function applyProps(evs) { const s = new Set(); for (const e of evs) for (const w of e.words) { if (w[0] === '-') s.delete(w.slice(1)); else s.add(w); } return s; }
function materialOf(R) {
  const set = applyProps(R.props), own = R.props.filter(e => e.own && e.key === R.def).pop() || null;
  const words = MATERIALS.filter(m => set.has(m));
  return { value: words.length === 1 ? words[0] : words.length ? words.join('+') : null, words, own };
}

// a file other units read too: not the def, and in another folder or named by another def of its folder
function isShared(src, R, key) {
  if (key === R.def) return false;
  R._sh = R._sh || new Map();
  if (R._sh.has(key)) return R._sh.get(key);
  let sh = dirOf(key) !== dirOf(R.def);
  if (!sh && src.keys) {
    const b = baseOf(key);
    for (const d of src.keys(new RegExp('^' + esc(dirOf(key)) + '/[^/]+\\.def$'))) {
      if (d === R.def) continue;
      const t = src.read(d); if (t && lc(t.toString('latin1')).includes(b)) { sh = true; break; }
    }
  }
  R._sh.set(key, sh);
  return sh;
}

function table(R) {
  const rows = R.parts.map(p => ({ name: p.name, id: p.id, kind: p.kind, bone: null, area: null, material: null,
    sides: SIDES.map(s => ({ side: s, mm: p.sides[s] == null ? 0 : p.sides[s], rule: p.sides[s] == null ? 'none' : 'own', at: p.key.replace(/^resource\//, '') + ':' + p.line, macro: p.macro })),
    flags: [] }));
  const sum = re => {
    const vs = R.parts.filter(p => p.kind === 'volume' && re.test(p.name));
    if (!vs.length) return null;
    const best = vs.reduce((a, b) => ((b.sides.front || 0) > (a.sides.front || 0) ? b : a));
    return { volume: best.name, front: best.sides.front || 0, side: Math.max(best.sides.left || 0, best.sides.right || 0), rear: best.sides.rear || 0, top: best.sides.top || 0 };
  };
  return { unit: baseOf(R.def).replace(/\.def$/, ''), key: R.def, model: null, material: null, rows, summary: { hull: sum(/^(body|hull)/i), turret: sum(/^turret/i) },
    join: null, problems: R.problems, speed: R.speed ? { kmh: R.speed.value, at: R.speed.key.replace(/^resource\//, '') + ':' + R.speed.line, macro: R.speed.macro } : null, game: 'goh' };
}
function frontOf(R) {
  const vs = R.parts.filter(p => p.kind === 'volume'), hull = vs.filter(p => /^(body|hull)/i.test(p.name));
  const pick = hull.length ? hull : vs;
  return pick.length ? Math.max(...pick.map(p => p.sides.front || 0)) : null;
}

const scaled = (v, k) => (v === 0 ? 0 : v >= 5 ? Math.max(1, Math.round(v * k)) : Math.max(0.1, Math.round(v * k * 10) / 10));
function plan(src, R, ch, opt) {
  opt = opt || {};
  const sp = new Map(), rows = [], notes = [];
  const put = (key, start, end, text, row) => {
    if (!sp.has(key)) sp.set(key, new Map());
    const m = sp.get(key), id = start + ':' + end, had = m.get(id);
    // two insertions at one place (two new side blocks of one volume) both go in, in the order asked
    if (had && start === end) had.text += text; else m.set(id, { start, end, text });
    if (row) rows.push(Object.assign({ key, line: lineAt(R.texts.get(key), start) }, row));
  };
  // a new child block before a block's closing brace: on its own line (indent of the brace line plus a tab) when the brace starts a
  // line, else after a space
  const insertIn = (key, block, text, row) => {
    const t = R.texts.get(key), e = block.end - 1;
    let j = e; while (j > block.start && (t[j - 1] === ' ' || t[j - 1] === '\t')) j--;
    if (t[j - 1] === '\n') put(key, j, j, t.slice(j, e) + '\t' + text + (t[j - 2] === '\r' ? '\r\n' : '\n'), row);
    else put(key, e, e, ' ' + text, row);
  };
  // a block taken out: its whole line when it is alone there, else with the blanks before it
  const removeBlock = (key, b, row) => {
    const t = R.texts.get(key);
    let s = b.start; while (s > 0 && (t[s - 1] === ' ' || t[s - 1] === '\t')) s--;
    let e = b.end; while (e < t.length && (t[e] === ' ' || t[e] === '\t')) e++;
    if ((s === 0 || t[s - 1] === '\n') && (t[e] === '\r' || t[e] === '\n')) e += t[e] === '\r' && t[e + 1] === '\n' ? 2 : 1;
    else e = b.end;
    put(key, s, e, '', row);
  };
  const no = reason => ({ ok: false, reason, rows: [], files: new Map(), changes: [], notes });
  const setNode = (o, node, v, part, side) => { const old = +node.text; if (old !== v) put(o.key, node.start, node.end, fmt(v), { part, side, old, new: v }); };
  if (ch.scale != null) {
    const k = +ch.scale;
    if (!(k > 0 && k <= 10)) return no('The scale must be above 0 and at most 10 (1.2 = 20% thicker).');
    for (const p of R.parts) for (const o of p.all) {
      if (o.base) setNode(o, o.base, scaled(+o.base.text, k), p.name, 'base');
      for (const s of Object.keys(o.sides)) setNode(o, o.sides[s], scaled(+o.sides[s].text, k), p.name, s);
    }
  }
  // the base number each volume gets in this change: a side without a block of its own follows it, so a side asked at the old base
  // gets a block of its own in the same run
  const newBase = new Map();
  for (const x of ch.set || []) {
    const s = lc(x.side || 'all'), p = R.parts.find(q => lc(q.id) === lc(x.part));
    if (p && p.kind === 'volume' && (s === 'all' || s === 'base') && +x.mm >= 0) newBase.set(lc(p.id), +x.mm);
  }
  for (const x of ch.set || []) {
    const p = R.parts.find(q => lc(q.id) === lc(x.part));
    if (!p) return no('"' + x.part + '" is not an armoured part of this unit. Its parts: ' + (R.parts.map(q => q.name).join(', ') || 'none') + '.');
    const mm = +x.mm, side = lc(x.side || 'all'), o = p.last;
    if (!(mm >= 0 && mm <= 2000)) return no('Armour is 0 to 2000 mm.');
    if (side !== 'all' && side !== 'base' && !SIDES.includes(side)) return no('The side is one of: ' + SIDES.join(', ') + ', all.');
    if (o.kind !== 'volume') {
      if (side !== 'all' && side !== 'base') return no(p.name + ' has one number for every side (' + (o.macro || '') + ' line): pick all sides.');
      setNode(o, o.base, mm, p.name, 'all'); continue;
    }
    if (side === 'all' || side === 'base') {
      if (o.base) setNode(o, o.base, mm, p.name, side === 'all' && !Object.keys(o.sides).length ? 'all' : 'base');
      else put(o.key, o.thick.items[0].end, o.thick.items[0].end, ' ' + fmt(mm), { part: p.name, side: 'base', old: null, new: mm });
      if (side === 'all') for (const s of Object.keys(o.sides)) setNode(o, o.sides[s], mm, p.name, s);
    } else if (o.sides[side]) setNode(o, o.sides[side], mm, p.name, side);
    else {
      const cur = o.base ? +o.base.text : null, eff = newBase.has(lc(p.id)) ? newBase.get(lc(p.id)) : cur;
      if (eff !== mm) insertIn(o.key, o.thick, '{' + side + ' ' + fmt(mm) + '}', { part: p.name, side, old: cur, new: mm });
    }
  }
  // repair time: every repair(N) of the named part
  for (const x of ch.repair || []) {
    const r = (R.repairs || []).find(q => lc(q.name) === lc(x.part));
    if (!r) return no('"' + x.part + '" has no repair time of its own in this unit\'s files. Parts with one: ' + ((R.repairs || []).map(q => q.name).join(', ') || 'none') + '.');
    const s = +x.s;
    if (!(s >= REPAIR[0] && s <= REPAIR[1])) return no('A repair time is ' + REPAIR[0] + ' to ' + REPAIR[1] + ' seconds (the game\'s vehicles use 10 to 130).');
    for (const o of r.all) if (+o.node.text !== s) put(o.key, o.node.start, o.node.end, fmt(s), { part: r.name, side: 'repair', old: +o.node.text, new: s });
  }
  // armour class: the preset call renamed to another preset of the same family
  if (ch.preset != null) {
    const pr = R.preset, want = lc(ch.preset);
    if (!pr) return no('This unit calls no armour class of the game (like tank_heavy_tier1) in its own files, so there is none to swap.');
    if (!pr.options.includes(want)) return no('"' + ch.preset + '" is not an armour class of the same kind as ' + pr.name + '. Pick one of: ' + pr.options.join(', ') + '.');
    if (want !== pr.name) put(pr.key, pr.node.start, pr.node.end, '"' + want + '"', { part: 'preset', side: 'preset', old: pr.name, new: want });
  }
  // volume keys
  for (const x of ch.volx || []) {
    const v = (R.volx || []).find(q => lc(q.name) === lc(x.part));
    if (!v) return no('"' + x.part + '" is not a volume written in this unit\'s files. Its volumes: ' + ((R.volx || []).map(q => q.name).join(', ') || 'none') + '.');
    const key = lc(x.key), val = lc(String(x.value == null ? '' : x.value).trim()), have = v.keys[key], row = { part: v.name, side: key, old: have ? have.value : null, new: val };
    const none = val === 'none';
    if (key.startsWith('able.')) {
      const f = key.slice(5);
      if (!ABLE.includes(f)) return no('"' + f + '" is not a volume flag the game\'s vehicles use. Flags: ' + ABLE.join(', ') + '.');
      if (!none && val !== '0' && val !== '1') return no(v.name + ' ' + key + ': a flag is 0, 1 or none.');
      if (none) { if (have) { if (have.able.items.filter(b => b.type === 'block').length === 1) removeBlock(have.occ.key, have.able, row); else removeBlock(have.occ.key, have.node, row); } continue; }
      const text = '{' + f + (val === '0' ? ' 0' : '') + '}';
      if (have) { if (have.value !== val) put(have.occ.key, have.node.start, have.node.end, text, row); continue; }
      const ab = v.last.node.items.filter(b => b.type === 'block' && b.name === 'able').pop();
      if (ab) put(v.last.key, ab.end - 1, ab.end - 1, ' ' + text, row); else insertIn(v.last.key, v.last.node, '{able ' + text + '}', row);
      continue;
    }
    if (!VOL_KEYS.includes(key)) return no('"' + x.key + '" is not a volume key this task changes on Gates of Hell. Keys: ' + VOL_KEYS.join(', ') + ', able.<flag>.');
    if (none || (key === 'highhardness' && /^(no|0|off|false)$/.test(val))) { if (have) removeBlock(have.occ.key, have.node, Object.assign(row, { new: 'none' })); continue; }
    let out;
    if (key === 'caststeel') { const q = +val; if (!(q > 0 && q <= 1)) return no(v.name + ' caststeel: a cast steel quality is above 0 and at most 1 (the game\'s vehicles use 0.3 to 0.88), or none.'); out = fmtQ(q); }
    else if (key === 'density') { const q = +val; if (!(val !== '' && q >= 0 && q <= 0.1)) return no(v.name + ' density: 0 to 0.1, or none.'); out = fmtQ(q); }
    else if (key === 'quality') { if (!QUALITIES.includes(val)) return no(v.name + ' quality: ' + QUALITIES.join(', ') + ' or none (the only plate quality the game\'s vehicles use).'); out = '"' + val + '"'; }
    else if (key === 'material') { if (!VOL_MATERIALS.includes(val)) return no(v.name + ' material: one of ' + VOL_MATERIALS.join(', ') + ', or none.'); out = '"' + val + '"'; }
    else { if (!/^(yes|1|on|true)$/.test(val)) return no(v.name + ' highhardness: yes or no.'); if (!have) insertIn(v.last.key, v.last.node, '{HighHardness}', Object.assign(row, { new: 'yes' })); continue; }
    row.new = unq(out);
    if (have) { const a = have.node.items[1]; if (a) { if (unq(a.text) !== unq(out)) put(have.occ.key, a.start, a.end, out, row); } else put(have.occ.key, have.node.end - 1, have.node.end - 1, ' ' + out, row); }
    else insertIn(v.last.key, v.last.node, '{' + VOL_SPELL[key] + ' ' + out + '}', row);
  }
  // hull material: the def's own {props} words (a "-x" word takes an inherited x away)
  if (ch.material != null) {
    const want = lc(ch.material), M = R.material;
    if (!MATERIALS.includes(want)) return no('The hull material is one of: ' + MATERIALS.join(', ') + '.');
    const own = M.own, i = own ? R.props.indexOf(own) : R.props.length;
    const before = applyProps(R.props.slice(0, i)), after = R.props.slice(own ? i + 1 : i);
    const words = (own ? own.raw : []).filter(w => !MATERIALS.includes(lc(w).replace(/^-/, '')));
    if (!before.has(want)) words.push(want);
    for (const m of MATERIALS) if (m !== want && before.has(m)) words.push('-' + m);
    const got = MATERIALS.filter(m => applyProps([{ words: [...before] }, { words: words.map(lc) }].concat(after)).has(m));
    if (got.length !== 1 || got[0] !== want) return no('A file read after the unit file sets the material words again (' + [...new Set(after.map(e => baseOf(e.key)))].join(', ') + '), so the hull cannot be made ' + want + ' from the unit file.');
    const text = '{props ' + words.map(w => '"' + w + '"').join(' ') + '}', row = { part: 'material', side: 'material', old: M.value, new: want };
    if (M.value !== want) {
      if (own) put(R.def, own.node.start, own.node.end, text, row);
      else {
        const t = R.trees.get(R.def), top = t && t.root.items.find(b => b.type === 'block');
        if (!top) return no('The unit file has no main block to add the material words to.');
        insertIn(R.def, top, text, row);
      }
    }
  }
  if (ch.speed != null || ch.speedScale != null) {
    const s = R.speed;
    if (!s) return no('No top speed of its own was found in this unit\'s files (no mobility_* line or MaxSpeed in its chassis).');
    const v = ch.speed != null ? Math.round(+ch.speed) : Math.max(1, Math.round(s.value * +ch.speedScale));
    if (!(v >= 1 && v <= 1000)) return no('Top speed is 1 to 1000 km/h.');
    if (v !== s.value) put(s.key, s.node.start, s.node.end, String(v), { part: 'speed', side: s.macro, old: s.value, new: v });
  }
  // shared files: a copy next to the def, the include pointed at it (one level: its includer must be the unit's own)
  const out = new Map(), moved = new Map();
  for (const key of sp.keys()) {
    if (!isShared(src, R, key) || opt.shared) continue;
    // every include of the shared file from this unit's own files is pointed at the copy (a file named twice, or by the def and by
    // its own .ext, would otherwise still read the shared one through the include left behind)
    const es = R.edges.filter(x => x.key === key), e = es[0];
    if (!e) return no(key + ' is shared with other units and is not named by an include of this unit; it was not changed.');
    const via = es.find(x => x.parent !== R.def && isShared(src, R, x.parent));
    if (via) return Object.assign(no(baseOf(key) + ' is read through another shared file (' + baseOf(via.parent) + '), so it can only be changed for every unit that reads it.'), { shared: { files: [key, via.parent] } });
    if (dirOf(key) !== dirOf(R.def) && R.edges.some(x => x.parent === key && !x.rooted)) return Object.assign(no(baseOf(key) + ' is shared and names more files next to it; a copy beside this unit would lose them, so it can only be changed for every unit that reads it.'), { shared: { files: [key] } });
    const unit = baseOf(R.def).replace(/\.def$/, ''), b = baseOf(key), stem = b.replace(/\.[^.]+$/, '');
    const other = baseOf(dirOf(key));
    let nb = stem === other && unit !== other ? unit + b.slice(stem.length) : unit + '_' + b;
    for (let i = 2; src.read(dirOf(R.def) + '/' + nb) && i < 50; i++) nb = unit + '_' + i + '_' + b;
    const nk = dirOf(R.def) + '/' + nb;
    for (const x of es) put(x.parent, x.node.start, x.node.end, '"' + (dirOf(x.parent) === dirOf(nk) ? nb : '/' + nk.replace(/^resource\//, '')) + '"', null);
    moved.set(key, nk);
    notes.push(baseOf(key) + ' is shared with other units: this unit gets its own copy ' + nb + ' and its include line points there; the others keep the old file.');
  }
  for (const [key, m] of sp) {
    const t = R.texts.get(key), list = [...m.values()].sort((a, b) => b.start - a.start || b.end - a.end);
    let s = t;
    for (const x of list) s = s.slice(0, x.start) + x.text + s.slice(x.end);
    out.set(moved.get(key) || key, Buffer.from(s, 'latin1'));
  }
  for (const r of rows) if (moved.has(r.key)) r.key = moved.get(r.key);
  const changes = rows.map(r => ({ key: r.key, file: r.key, line: r.line, part: r.part, side: r.side, before: r.old == null ? '' : String(r.old), after: String(r.new),
    created: !(src.inMod ? src.inMod(r.key) : false) }));
  if (!rows.length) return { ok: true, nothing: true, rows, files: new Map(), changes, notes };
  return { ok: true, rows, files: out, changes, notes };
}

// the volume keys of one volume row as words: ['caststeel 0.8063', 'highhardness yes', 'able.holed 1', ..] (reading order of VOL_KEYS)
function volLines(v) {
  const ks = Object.keys(v.keys), order = VOL_KEYS.concat(ks.filter(k => k.startsWith('able.')).sort());
  return order.filter(k => v.keys[k]).map(k => k + ' ' + (v.keys[k].value === '' ? 'yes' : v.keys[k].value));
}

// ---------- a source over the GoH game view with a mod folder's loose files on top ----------
function sourceOf(gameDir, mod) {
  const gv = require('./gameview'), vfs = require('./vfs');
  const view = gameDir ? gv.get({ gameDir, gid: 'goh' }) : null;
  let disk = null;
  const scan = () => {
    if (disk) return disk;
    disk = new Map();
    if (mod && fs.existsSync(mod)) (function w(d, rel) {
      let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) {
        if (e.isDirectory()) { if (!/^\./.test(e.name) && rel.split('/').length < 14) w(path.join(d, e.name), rel + lc(e.name) + '/'); }
        else disk.set(rel + lc(e.name), path.join(d, e.name));
      }
    })(path.join(mod, 'resource'), 'resource/');
    return disk;
  };
  return {
    read(key) { key = lc(key); const f = scan().get(key); if (f) return fs.readFileSync(f); const r = view && view.files.get(key); return r ? vfs.readRec(r) : null; },
    keys(re) { const s = new Set(); if (view) for (const k of view.files.keys()) if (re.test(k)) s.add(k); for (const k of scan().keys()) if (re.test(k)) s.add(k); return [...s].sort(); },
    inMod(key) { return scan().has(lc(key)); },
    defOf(name) { const n = lc(name).replace(/\.def$/, ''), re = new RegExp('^resource/entity/.*/' + esc(n) + '\\.def$'); const ks = this.keys(re); return ks.find(k => scan().has(k)) || ks[0] || null; },
    fresh() { disk = null; },
  };
}

// ---------- restore points and the write (lib/modwrite, the shared write side) ----------
// restorePoints: the Files page form, in lib/modwrite restoreRoot: beside the mod (<mod>.arsenal-undo) unless the mod sits in a game
// install (every <GoH>/mods/<mod>): then <mod>/.arsenal/undo, never a new folder in the game's mods folder. writeFiles: every target
// guarded first (inside the mod as written and with links followed, lib/writeguard), then temp file + rename.
function restorePoints(mod, keys, action, opt) { return require('./modwrite').restorePoints(mod, keys, action || 'goh-armour', opt); }
function writeFiles(mod, files, opt) { return require('./modwrite').writeFiles(mod, files, opt); }

module.exports = { SIDES, VOL_KEYS, VOL_MATERIALS, QUALITIES, ABLE, MATERIALS, REPAIR, read, table, plan, frontOf, sourceOf, restorePoints, writeFiles, incKey, volLines,
  _t: { scaled, isShared, fmt, presetDefs, applyProps } };
