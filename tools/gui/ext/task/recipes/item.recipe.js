// recipe "make or change an item": a grenade, a mine or explosive, or a carried thing (medkit, bandage, helmet ..) under set/stuff/
// (grenade, explosive, med, capacity, content, head, body, special, melee). Questions: id and name, model and skin, mass, blast, throw,
// fuse, inventory, who carries it. Make: gen `item` (a copy beside the like, edited: throw, fuse, mass, weight, size, blast, model) +
// `text` for the name. Change: `set` rows on the item's own file (a block it only inherits is written whole), `text` for the name.
// Reads through the stuff reader of gun.recipe.js (tools/lib sdlset). Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-612dd6e6)
'use strict';
const L = require('./gun.recipe').lib;
const { freeId, idLookup, stuffName, source, chain, node, vals, num, str, raw, rows, lookupStuff, baseKey, same, bad, kitOps, tagsOf, r4, layers, scaleLayers, invModels, entityOf, advEdit, advValue, ownDamage, tagWords, tagChange, tagRows } = L;
const STUFF = 'resource/set/stuff/';
const ITEM_DIRS = ['grenade', 'explosive', 'med', 'capacity', 'content', 'head', 'body', 'special', 'melee'];
const q = (id, kind, covers, o) => Object.assign({ id, kind, ask: 'task.item.q.' + id, help: 'task.item.h.' + id, covers }, o || {});
// what a {filling} line holds: fuel cans and barrels (liquid), the medkit (drug), binoculars and the searchlight (light)
const FILL = ['liquid', 'drug', 'light'];
// the advanced questions: one item file path each (advEdit / advValue of gun.recipe.js). need: asked and written only when the copy
// has that block (a special use, a filling)
const ADV = [
  { g: 'inventory', id: 'hold', kind: 'choice', covers: ['item.inventory.fsm'], p: 'inventory/fsm', t: 'quoted', limits: { values: ['belt', 'stuff', 'hand-only'], limit: 'HUM-26' } },
  { g: 'inventory', id: 'noview', kind: 'yesno', covers: ['item.inventory.noview'], p: 'inventory/noView', t: 'flag' },
  { g: 'use', id: 'preloaded', kind: 'yesno', covers: ['item.preloaded'], p: 'preloaded', t: 'flag' },
  { g: 'fuse', id: 'smode', kind: 'choice', covers: ['item.special.mode'], p: 'special/mode', t: 'word', need: 'special', limits: { values: ['detonate', 'aim'] } },
  { g: 'use', id: 'aidanger', kind: 'number', covers: ['item.possibledamageradius'], p: 'possibleDamageRadius', limits: { min: 0.1, max: 50, unit: 'm' } },
];
// tag words by role (census): how it is held (HUM-28), what it counts as, and the rest (flags)
const THANDS = ['smallitemin1hand', 'itemin1hand', 'itemin2hands', 'to_hand'];
const TCLASS = ['grenade', 'dynamite', 'smoke', 'armor', 'capacity', 'liquid', 'fortification', 'knife', 'ap', 'big', 'cumulative', 'ic'];
// the shaped charge of an anti-tank grenade: the item's own {damage cumulative} block (gen item damage_edit / a damage[n] set row)
const CUM = [['cumdmg', 'damage', 1, 1000, 'mm'], ['cumdist', 'distance', 0.05, 10, 'm']];
const FACTS = ['mass', 'blast', 'throw', 'special', 'cum', 'fill'];
// asked only where the copy has it: values() sets f_<k> true when the copy has that value and this task can write it (when $copy)
const has = (k, o) => Object.assign({}, o || {}, { when: Object.assign({ $copy: { id: 'f_' + k, is: true } }, (o && o.when) || {}) });
// a row with need is asked only when the copy has that block
const advQ = g => ADV.filter(a => a.g === g).map(a => { const o = a.limits ? { limits: a.limits } : {}; return q(a.id, a.kind, a.covers, a.need ? has(a.need, o) : o); });
const advEditI = (a, value) => advEdit(a, value);
const advValueI = (ch, a) => advValue(ch, a);

const recipe = {
  id: 'item',
  verbs: ['make', 'change'],
  // Gates of Hell (2026-11-23): item.goh.js. Its own stuff set (only 150 of 535 names shared with AS2), read by units/kit.js; make
  // copies the file beside the like, change copies it into the mod, both edit mass and inventory in place; soldiers get it through
  // their breed inventory (GHED-33, the Units page kit edit). The AS2 only questions carry $game AS2G (see the loop at the end)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 52,
  title: 'task.item.t',
  census: 'item',
  base: { lookup: 'thing' },
  groups: [
    { id: 'what', title: 'task.item.g.what', essential: true, q: [
      q('id', 'id', ['item.id'], { limits: { re: '^[a-z0-9][a-z0-9_]{1,40}$' }, when: { $verb: 'make' }, unique: { lookup: 'newitem' } }),
      q('name', 'text', ['item.text.name', 'item.desc'], { limits: { limit: 'LOC-15' } }),
    ] },
    // the numbers a first time user answers: each only where the copy has it (a blast, a throw, a fuse)
    { id: 'numbers', title: 'task.item.g.numbers', essential: true, q: [
      q('mass', 'number', ['item.mass'], has('mass', { limits: { min: 0.05, max: 2000, unit: 'kg' } })),
      q('blast_energy', 'number', ['item.damage.blastwave.energy'], has('blast', { limits: { min: 0.05, max: 200, unit: 'energy', limit: 'KEY-02' } })),
      q('blast_radius', 'number', ['item.damage.blastwave.area', 'item.damage.blastwave.add'], has('blast', { limits: { min: 0.2, max: 60, unit: 'm', limit: 'GPL-01' } })),
      q('range', 'number', ['item.throw.range'], has('throw', { limits: { min: 0.5, max: 100, unit: 'm' } })),
      q('fuse', 'number', ['item.special.preparetime'], has('special', { limits: { min: 0.01, max: 60, unit: 's' } })),
    ] },
    { id: 'look', title: 'task.item.g.look', essential: false, q: [
      q('model', 'thing', ['item.entity', 'item.model.def'], { picker: { sources: ['keep', 'exist', 'branch', 'ext'], lookup: 'itemmodel', branch: 'model', ext: ['soedit', 'blender-gem2'] }, limits: { limit: 'KEY-32' } }),
      q('skin', 'thing', ['item.skin.texture'], { picker: { sources: ['keep', 'branch', 'ext'], branch: 'skin', ext: ['dds-editor', 'soedit'] } }),
    ] },
    { id: 'throw', title: 'task.item.g.throw', essential: false, q: [
      q('angle', 'number', ['item.throw.startangle'], has('throw', { limits: { min: 5, max: 90, unit: 'deg' } })),
      q('speed', 'number', ['item.throw.constantspeed'], has('throw', { limits: { min: 1, max: 40, unit: 'm/s' } })),
      q('spread', 'number', ['item.throw.spreading'], has('throw', { limits: { min: 0.05, max: 2, unit: 'm' } })),
    ] },
    { id: 'fuse', title: 'task.item.g.fuse', essential: false, q: advQ('fuse') },
    { id: 'inventory', title: 'task.item.g.inventory', essential: false, q: [
      q('isize', 'text', ['item.inventory.size'], { limits: { re: '^\\s*[1-6]\\s+[1-6]\\s*$', unit: 'cells', limit: 'HUM-23' } }),
      q('weight', 'number', ['item.inventory.weight'], { limits: { min: 1, max: 2000, unit: 'load points' } }),
    ].concat(advQ('inventory')) },
    { id: 'use', title: 'task.item.g.use', essential: false, q: [
      q('fillkind', 'choice', ['item.filling'], has('fill', { limits: { values: FILL } })),
      q('fillamt', 'number', ['item.filling'], has('fill', { limits: { min: 0, max: 100000, unit: 'amount' } })),
    ].concat(advQ('use')) },
    { id: 'tags', title: 'task.item.g.tags', essential: false, q: [
      q('taghands', 'choice', ['item.tag.hands'], { limits: { values: THANDS, limit: 'HUM-28' }, optional: true }),
      q('tagclass', 'list', ['item.tag.class'], { limits: { re: '^-?[a-z0-9_]+$' }, optional: true }),
      q('tagflags', 'list', ['item.tag.flags'], { limits: { re: '^-?[a-z0-9_]+$', limit: 'HUM-23' }, optional: true }),
    ] },
    { id: 'shaped', title: 'task.item.g.shaped', essential: false, q: CUM.map(([id, k, min, max, unit]) => q(id, 'number', ['item.damage.cumulative.' + k], has('cum', { limits: { min, max, unit } }))) },
    { id: 'carry', title: 'task.item.g.carry', essential: false, q: [
      q('giveq', 'yesno', ['item.carry.breed_item']),
      q('carriers', 'list', ['item.carry.breed_item'], { picker: { sources: ['exist', 'branch'], lookup: 'breed', branch: 'soldier' }, limits: { re: '^[a-z0-9_]+/[a-z0-9_]+$', limit: 'HUM-21' }, when: { giveq: true } }),
      // Gates of Hell: soldiers as army/period/name (resource/set/breed/mp/<army>/<period>/<name>.set)
      q('carriers_goh', 'list', [], { picker: { sources: ['exist'], lookup: 'breed' }, limits: { re: '^[a-z0-9_]+/[a-z0-9_]+/[a-z0-9_]+$', limit: 'GHED-33' }, when: { giveq: true, $game: ['goh'] } }),
      q('count', 'number', ['item.carry.breed_item'], { limits: { min: 1, max: 100, step: 1, unit: 'pieces' }, when: { giveq: true } }),
    ] },
  ],
  kept: [
    // structural: the What to copy step
    ['item.kind', 'the kind (grenade, mine, medkit ..) is the folder of the thing you copy: pick one of the kind you want in What to copy'],
    ['item.type', 'the root block follows the copy: pick one of the kind you want in What to copy'],
    ['item.from', 'the What to copy step picks it: the new item is a copy of it'],
    ['item.sound', 'kept as copied: what it changes in game is not known yet'],
    // the model task: settings of the model def or the inventory model
    ['item.model.props', 'model task: a setting of the model def (the model question opens it)'],
    ['item.model.collider', 'model task: a setting of the model def (the model question opens it)'],
    ['item.icon.preview', 'model task: the inventory picture camera lives in the inventory model'],
    ['item.mine.time', 'model task: lives in the mine model def, not in the item file'],
    ['item.mine.obstacle', 'model task: lives in the mine model def, not in the item file'],
    // a bone
    ['item.inventory.link_bone', 'a bone of the soldier model; follows the copy'],
    // shared files every item inherits
    ['item.thrower', 'shared: the throwing hand every soldier uses; a change there changes every thrown item'],
    ['item.smoke', 'shared: the smoke screen numbers live in the shared interaction file (grenade.inc), not in the item'],
    // engine names, no safe list
    ['item.special.preparecursor', 'kept as copied: only cursors the game program has work here'],
    // meaning not proven
    ['item.fuse.time', 'kept as copied: what it changes in game is not known yet'],
    ['item.damage.fire', 'kept as copied: what it changes in game is not known yet'],
    // no tool step yet
    ['item.explosive_amount', 'follows the blast questions: the game adds up the blasts of the items a soldier carries'],
    ['item.carry.vehicle_box', 'kept as copied: vehicle boxes cannot be changed by a task yet'],
    ['item.carry.supply', 'kept as copied: supply lists cannot be changed by a task yet'],
    // the soldier task
    ['item.armor.slot', 'soldier task: worn helmets and armour are given there'],
  ],
  test: 'task.item.test',
  checklist: ['task.item.c.inv', 'task.item.c.use', 'task.item.c.blast', 'task.item.c.log'],
  lookups: {
    thing: async (ctx, w, o) => (isGoh(ctx, o) ? IG().lookThing(ctx, w, o) : lookupStuff(ctx, w, o, rel => ITEM_DIRS.includes(rel.split('/')[0]) && !/\.pattern$/.test(rel))),
    itemmodel: async (ctx, w, o) => (isGoh(ctx, o) ? [] : invModels(ctx, w, o)),
    breed: async (ctx, w, o) => (isGoh(ctx, o) ? IG().lookBreed(ctx, w, o) : L.breeds(ctx, w, o)),
    newitem: async (ctx, w, o) => (isGoh(ctx, o) ? IG().lookNew(ctx, w, o) : idLookup(ctx, w, o)),
  },
  routes: { 'POST /api/x/task/r/item/gohgive': (url, b, ctx) => IG().giveRoute(url, b, ctx) },
  values: async (ctx, base, opt) => {
    if (isGoh(ctx, opt)) return IG().values(ctx, base, opt);
    const c = source(ctx, ctx && ctx.mod), none = { carriers: [], count: 1, giveq: false };
    if (!c || !base) return none;
    const key = baseKey(c, base);
    if (!key) return none;
    const ch = chain(c, key), rw = raw(c, key) || { root: 'item', inMod: false }, ls = layers(ch);
    const name = key.slice(key.lastIndexOf('/') + 1), ext = name.includes('.') ? name.slice(name.indexOf('.')) : '', id = name.slice(0, name.length - ext.length);
    const sz = vals(node(ch, 'inventory/size'));
    const v = {
      id: freeId(c, id), name: stuffName(c, key) || id, model: str(ch, 'entity'), mass: num(ch, 'mass'),
      blast_energy: ls.length ? r4(ls[0].energy) : undefined, blast_radius: ls.length ? r4(ls[ls.length - 1].area[1]) : undefined,
      range: num(ch, 'throw/range'), angle: num(ch, 'throw/startAngle'), speed: num(ch, 'throw/constantSpeed'), spread: num(ch, 'throw/spreading'),
      fuse: num(ch, 'special/PrepareTime'), isize: sz.length >= 2 ? sz.slice(0, 2).join(' ') : undefined, weight: num(ch, 'inventory/weight'),
      carriers: [], count: 1, giveq: false,
    };
    for (const a of ADV) v[a.id] = advValueI(ch, a);
    const fl = vals(node(ch, 'filling'));
    if (fl.length) { v.fillkind = String(fl[0]).toLowerCase(); if (fl.length > 1 && !isNaN(Number(fl[1]))) v.fillamt = Number(fl[1]); }
    const tw = tagWords(c, key), dm = ownDamage(c, key), cum = dm.find(d => d.type === 'cumulative');
    const hw = tw.all.find(x => THANDS.includes(x)); if (hw) v.taghands = hw;
    v.tagclass = tw.all.filter(x => TCLASS.includes(x)); v.tagflags = tw.all.filter(x => !THANDS.includes(x) && !TCLASS.includes(x));
    if (cum) for (const [id, k] of CUM) if (cum.v[k] && cum.v[k].length) v[id] = Number(cum.v[k][0]);
    for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
    const own = c.s.get(key).toString('latin1');
    // what this task can write on this item: a new item copies every blast layer; a change writes only the item's own layers
    const change = opt && opt.verb === 'change', ownB = dm.filter(d => d.type === 'blastwave').length;
    const F = { mass: v.mass != null, blast: ls.length > 0 && (!change || ownB === ls.length), throw: !!node(ch, 'throw'), special: !!node(ch, 'special'), cum: !!cum, fill: FILL.includes(v.fillkind) };
    for (const k of FACTS) v['f_' + k] = F[k];
    v._meta = { id, key, root: rw.root, inMod: rw.inMod, dir: key.slice(STUFF.length, key.lastIndexOf('/')), ext, layers: ls, ownLayers: (own.match(/\{\s*damage\b/gi) || []).length,
      thrown: !!node(ch, 'throw'), special: !!node(ch, 'special'), desc: str(ch, 'desc'), tw, dm };
    return v;
  },
  compile: (draft, c) => (String(c.game) === 'goh' ? IG().compile(draft, c) : compileItem(draft, c)),
};
// Gates of Hell: the branch, and the game of a lookup or values ctx (the given word, the task's game, ctx.gameId)
const IG = () => require('./item.goh');
function isGoh(ctx, o) {
  let g = o && o.game;
  if (!g && ctx && ctx.task && ctx.task.id) g = ctx.task.id;
  if (!g) { try { const x = ctx && ctx.gameId; g = typeof x === 'function' ? x.call(ctx) : x; } catch (e) { g = null; } }
  return String(g || '') === 'goh';
}

function compileItem(draft, c) {
  const v = c.values || {}, m = v._meta;
  if (!m || !m.key) throw bad('Pick the item to copy first (What to copy).');
  // gameId: the draft's game, so a MoW:AS2 task reads the mowas_2 file set (no as64/core) through gun.recipe source
  const src = c.gameDir ? source({ game: () => c.gameDir, gameId: c.game || 'as64' }, c.mod) : null, ch0 = src ? chain(src, m.key) : [];
  const make = c.verb !== 'change', notes = [], ops = [];
  const val = id => c.value(id), n = id => Number(val(id));
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !same(val(id), v[id]);
  const id = String(val('id') || '').toLowerCase().trim();
  if (make) {
    if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) throw bad('The new item needs an id: small English letters, digits and _.');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the item you copy. Pick a new id.');
  }
  // a new item always gets a name players see (the copy's name when kept); a change writes it only when it changed
  const target = make ? id : m.id, display = String(val('name') || '').trim(), nameChanged = !!display && (make || changed('name'));
  const ma = c.answer('model'), model = ma && (ma.src === 'exist' || ma.src === 'branch') && changed('model') ? entityOf(val('model')) || null : null;
  if (ma && ma.src === 'ext') notes.push('Model: finish it in the outside program, then pick it here (the copy keeps its model until then).');
  const sk = c.answer('skin'); if (sk && sk.src === 'ext') notes.push('Skin: finish the texture in the outside program; the skin task places it.');
  const T = {}, TK = { range: 'range', angle: 'startAngle', speed: 'constantSpeed', spread: 'spreading' };
  for (const k of Object.keys(TK)) if (changed(k)) T[k] = n(k);
  if (Object.keys(T).length && !m.thrown) { notes.push('Throwing: the item you copy is not thrown (no {throw} block), so the throw values were not written.'); for (const k of Object.keys(T)) delete T[k]; }
  const fuse = changed('fuse') ? n('fuse') : null;
  if (fuse != null && !m.special) notes.push('Fuse: the item you copy has no {special} block (no fuse), so the fuse was not written.');
  const blastNew = changed('blast_energy') || changed('blast_radius');
  const E2 = changed('blast_energy') ? n('blast_energy') : null, R2 = changed('blast_radius') ? n('blast_radius') : null;
  // the advanced questions, one path each; a special use the copy does not have is not made up
  const A = [];
  for (const a of ADV) {
    if (!changed(a.id)) continue;
    if (a.need && !m[a.need]) { notes.push(a.id + ': the item you copy has no {' + a.need + '} block, so this value was not written.'); continue; }
    A.push(advEditI(a, val(a.id)));
  }
  // the filling: one line "kind" amount, written whole when either part changed
  if (changed('fillkind') || changed('fillamt')) {
    const fk = String(val('fillkind') || v.fillkind || '').trim(), fa = Number(val('fillamt') != null && val('fillamt') !== '' ? val('fillamt') : v.fillamt);
    if (!v.f_fill) notes.push('Filling: the item you copy holds nothing, so the filling was not written.');
    else if (FILL.includes(fk) && isFinite(fa)) A.push({ p: 'filling', v: '"' + fk + '" ' + r4(fa) });
  }
  // tag words: the hands word, the class words and the flags, compared with the copy's effective words
  const words = get => [get('taghands')].filter(Boolean).concat([].concat(get('tagclass') || []), [].concat(get('tagflags') || [])).map(x => String(x).trim());
  const tc = ['taghands', 'tagclass', 'tagflags'].some(changed) && m.tw ? tagChange(m.tw, words(k => v[k]), words(k => val(k))) : null;
  if (tc && tc.inhDrops.length) notes.push('Tag words: ' + tc.inhDrops.join(', ') + ' come from a parent file; a -word of its own cancels each one (check in game).');
  // the shaped charge: only the item's own {damage cumulative} block can be changed (an inherited one would be replaced, KEY-17)
  const cumOwn = (m.dm || []).find(d => d.type === 'cumulative'), cumSet = {};
  for (const [qid, k] of CUM) if (changed(qid)) cumSet[k] = n(qid);
  if (Object.keys(cumSet).length && !cumOwn) { notes.push('Shaped charge: the item you copy has no {damage cumulative} block of its own, so it was not written.'); for (const k of Object.keys(cumSet)) delete cumSet[k]; }
  const ownBlast = (m.dm || []).filter(d => d.type === 'blastwave');
  const rr = src ? raw(src, m.key) : null;
  if (make) {
    const io = { op: 'item', id, like: tagsOf(m.key).join(' ') };
    if (Object.keys(T).length) io.throw = T;
    if (fuse != null && m.special) io.fuse = fuse;
    if (changed('mass')) io.mass = n('mass');
    if (changed('weight')) io.weight = n('weight');
    if (changed('isize')) io.size = String(val('isize')).trim().split(/\s+/).join(' ');
    if (blastNew) { const lay = scaleLayers(m.layers, E2 != null ? E2 : v.blast_energy, R2 != null ? R2 : v.blast_radius); if (lay) io.blast = lay; }
    // a model made by the model task in this run: a set row (the model op runs first); a picked one: the item op checks it
    if (model && ma.src === 'branch') A.push({ p: 'entity', v: '"' + model + '"' }); else if (model) io.entity = model;
    if (Object.keys(cumSet).length) io.damage_edit = [{ type: 'cumulative', layer: cumOwn.n, set: cumSet }];
    // tag words through the item op; a dropped inherited word needs a -word on the copy's tag line (one set row writes the line)
    let tagLine = null;
    if (tc && !tc.inhDrops.length) { const t = tc.adds.concat(tc.ownDrops.map(w => '-' + w)); if (t.length) io.tags = t; } else if (tc) tagLine = tc;
    ops.push(io);
    // set rows on the new file: a copy of the like, plus the throw / special / inventory block the item op copied in when it edited it
    const key = STUFF + m.dir + '/' + id + m.ext;
    const opBlocks = new Set([io.throw && 'throw', io.fuse != null && 'special', (io.weight != null || io.size) && 'inventory'].filter(Boolean));
    const at = p => { const top = p.split('/')[0]; if (opBlocks.has(top)) return p === top || node(ch0, p) ? 'block' : null; return rr ? rr.at(p) : null; };
    if (nameChanged) A.push({ p: 'desc', v: '"desc/stuff/' + id + '"' });
    const r = rows(key, { root: m.root, at }, ch0, A);
    if (tagLine) r.rows.push(...tagRows(key, m.root, m.tw, tagLine, notes));
    if (r.skipped.length) notes.push('Not changed (set by a macro call this task cannot edit): ' + r.skipped.join(', '));
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
    if (nameChanged) ops.push({ op: 'text', key: 'desc/stuff/' + id, text: display });
  } else {
    const rw = { root: m.root, at: p => rr ? rr.at(p) : null }, E = A.slice();
    for (const k of Object.keys(T)) E.push({ p: 'throw/' + TK[k], v: String(T[k]) });
    if (fuse != null && m.special) E.push({ p: 'special/PrepareTime', v: String(fuse) });
    if (changed('mass')) E.push({ p: 'mass', v: String(n('mass')) });
    if (changed('weight')) E.push({ p: 'inventory/weight', v: String(n('weight')) });
    if (changed('isize')) E.push({ p: 'inventory/size', v: String(val('isize')).trim().split(/\s+/).join(' ') });
    if (model) E.push({ p: 'entity', v: '"' + model + '"' });
    for (const [k, x] of Object.entries(cumSet)) E.push({ p: 'damage[' + cumOwn.idx + ']/' + k, v: String(x) });
    if (blastNew) {
      if (ownBlast.length && ownBlast.length === m.layers.length) {
        // the item's own layers, each by its place among the {damage} blocks (damage[n]): energy on the first, every area scaled
        const lay = scaleLayers(m.layers, E2 != null ? E2 : v.blast_energy, R2 != null ? R2 : v.blast_radius) || [];
        lay.forEach((l, i) => { const [e, a0, a1] = l.split(' '); if (i === 0 && E2 != null) E.push({ p: 'damage[' + ownBlast[i].idx + ']/energy', v: e }); if (R2 != null) E.push({ p: 'damage[' + ownBlast[i].idx + ']/area', v: a0 + ' ' + a1 }); });
      } else notes.push('Blast: this item has its blast in a file it copies; one inherited layer cannot be changed in place. Make a new item from it instead.');
    }
    const r = rows(m.key, rw, ch0, E);
    if (tc) r.rows.push(...tagRows(m.key, m.root, m.tw, tc, notes));
    if (r.skipped.length) notes.push('Not changed (set by a macro call this task cannot edit): ' + r.skipped.join(', '));
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
    if (nameChanged) ops.push({ op: 'text', key: m.desc ? String(m.desc) : 'desc/stuff/' + tagsOf(m.key).join(' '), text: display });
    if (!m.inMod) notes.push('The item lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  }
  const cnt = Number(val('count')) > 0 ? Math.round(Number(val('count'))) : 1;
  ops.push(...kitOps(val('giveq') === true ? [].concat(val('carriers') || []).map(entityOf).filter(Boolean) : [], tagsOf(make ? STUFF + m.dir + '/' + id + m.ext : m.key).join(' '), undefined, src, notes, { count: cnt }, !changed('count')));
  return { gen: ops.length ? { ops } : null, copies: [], notes, result: target };
}

// what the game's own data uses (a scan of every vanilla item): outside it a warning under the field (limits.usual), never a
// refusal. A hard max only where a bigger number means nothing (angle); the mins keep what the game cannot take
const USUAL = {mass: [0.1,1000], weight: [1,1000], blast_energy: [1.5,50], blast_radius: [4,15], range: [1.5,25], fuse: [0.01,10], angle: [8,90], spread: [0.1,0.5], aidanger: [0.3,5], speed: [6,20], cumdmg: [85,150], cumdist: [1,1]};
const HARDMAX = ['angle'];
for (const g of recipe.groups) for (const x of g.q) if (x.kind === 'number' && USUAL[x.id]) {
  x.limits = Object.assign({}, x.limits, { usual: USUAL[x.id] });
  if (!HARDMAX.includes(x.id)) delete x.limits.max;
}

// Gates of Hell asks only these (item.goh.js writes them); every other question is AS2 only
const GOH_Q = ['id', 'mass', 'isize', 'weight', 'giveq', 'carriers_goh', 'count'];
for (const g of recipe.groups) for (const x of g.q) if (!GOH_Q.includes(x.id)) x.when = Object.assign({}, x.when || {}, { $game: ['as64', 'mowas2'] });

module.exports = recipe;
