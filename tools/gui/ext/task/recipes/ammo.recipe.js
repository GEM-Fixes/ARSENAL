// recipe "make or change ammunition": a shell type (set/stuff/shell/<family>.<type>.ammo), small arms rounds (set/stuff/ammo/), a rocket
// (bazooka/, reactive/). Questions: id and name, model, preset strength, blast, shaped charge, mass, inventory, who carries it.
// Make: gen `shell` (a full copy of the round, edited: preset args, blast layers, mass, cumulative, model) + `set` rows on the new file for
// the inventory values + `text` for the name. Change: `set` rows on the round's own file, `macro` for the preset call's args; the blast of
// an existing round changes only where one op can do it (the fg preset's args, or a single own layer), else a note.
// Reads through the stuff reader of gun.recipe.js (tools/lib sdlset, the folder .presets expanded). Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-8f1bd7bf)
'use strict';
const path = require('path');
const L = require('./gun.recipe').lib;
// Gates of Hell: its shells call shell/.presets blast macros ("ap_blast" args n, "he_level_<n>" weight() filler()): gunammo.goh.js
const GOH = () => require('./gunammo.goh');
const { freeId, idLookup, stuffName, source, chain, node, vals, num, str, raw, rows, lookupStuff, lookupKeys, baseKey, same, bad, kitOps, tagsOf, r4, lc, layers, scaleLayers, entityOf, advEdit, advValue, ownDamage, tagWords, tagChange, tagRows } = L;
const STUFF = 'resource/set/stuff/';
const SHELL_DIRS = ['shell', 'bazooka', 'ammo', 'reactive'];
const PRESET = /\(\s*"(ap|apcr|fg|fg_medium|fg_heavy)"\s+args\s+([\d.]+)\s*\)/i;
const q = (id, kind, covers, o) => Object.assign({ id, kind, ask: 'task.ammo.q.' + id, help: 'task.ammo.h.' + id, covers }, o || {});
// what a weapon's {filling} and a soldier's {item} name: a shell family, or the tags of the file
const itemOf = key => /\/shell\//.test(key) ? tagsOf(key)[0] : tagsOf(key).join(' ');
// the tracer pictures of vanilla rounds (texture/fx/), asked by short name
const TRACES = ['trace', 'trace2', 'trace3', 'trace4', 'trace_zenite1', 'trace_zenite2', 'trace_shotgun', 'trace_apcr'];
// the advanced questions: one round file path each (advEdit / advValue of gun.recipe.js; tex and qwords here). need: written only when
// the copy has that block (a flying model, a tracer), since a tracer or a trail with no picture draws nothing
const ADV = [
  { g: 'flight', id: 'view', kind: 'text', covers: ['ammo.view'], p: 'view', t: 'quoted', head: true, need: 'view', limits: { re: '^[a-z0-9_]+$' } },
  { g: 'flight', id: 'tail', kind: 'text', covers: ['ammo.view.tail'], p: 'view/tail', t: 'qwords', need: 'view', limits: { re: '^\\s*[a-z0-9_]+\\s+[A-Za-z0-9_]+\\s*$', unit: 'effect, bone' } },
  { g: 'flight', id: 'trace', kind: 'choice', covers: ['ammo.trace.view'], p: 'trace/view', t: 'tex', head: true, need: 'trace', limits: { values: TRACES, limit: 'KEY-02' } },
  { g: 'flight', id: 'tracelight', kind: 'number', covers: ['ammo.trace.light'], p: 'trace/view/Light', need: 'trace', limits: { min: 0, max: 20, unit: 'brightness' } },
  { g: 'flight', id: 'tracewidth', kind: 'number', covers: ['ammo.trace.scale'], p: 'trace/view/ScaleY', need: 'trace', limits: { min: 0, max: 2, unit: 'm' } },
  { g: 'flight', id: 'tracelen', kind: 'number', covers: ['ammo.trace.length'], p: 'trace/length', need: 'trace', limits: { min: 0, max: 200, unit: 'm' } },
  { g: 'fuse', id: 'detthick', kind: 'number', covers: ['ammo.detonationthickness'], p: 'detonationThickness', limits: { min: 0.1, max: 50, unit: 'mm', limit: 'DMG-11' } },
  { g: 'fuse', id: 'applyproj', kind: 'yesno', covers: ['ammo.applyprojectile'], p: 'applyProjectile', t: 'flag' },
  { g: 'fuse', id: 'aidanger', kind: 'number', covers: ['ammo.possibledamageradius'], p: 'possibleDamageRadius', limits: { min: 0.1, max: 100, unit: 'm' } },
  { g: 'inventory', id: 'hold', kind: 'choice', covers: ['ammo.inventory.fsm'], p: 'inventory/fsm', t: 'quoted', limits: { values: ['stuff', 'belt'], limit: 'HUM-26' } },
  { g: 'inventory', id: 'noview', kind: 'yesno', covers: ['ammo.inventory.noview'], p: 'inventory/noView', t: 'flag' },
];
// tag words by role (census): the kind word picks the weapon's per round values (DMG-01); the size word picks hit effects and sounds;
// the shell class word is read by the vehicle damage scripts (DMG-27); the rest are flag words
const TKIND = ['ap', 'apcr', 'fg', 'sm', 'cumulative', 'bomb'];
const TSIZE = ['size_minimum', 'size_small', 'size_medium', 'size_big', 'size_maximum'];
const TCLASS = ['shell_minimum', 'shell_small', 'shell_medium', 'shell_big', 'shell_verybig', 'shell_maximum'];
const TROLE = [TKIND, TSIZE, TCLASS];
// fire damage of a flame round: the round's own {damage fire} block (gen shell damage_edit on make, a damage[n] set row on change)
const FIRE = [['firerad', 'radius', 0.5, 100, 'm'], ['fireheat', 'heating', 0.05, 20, 'heat'], ['firetime', 'time', 0.5, 60, 's']];
const FACTS = ['preset', 'energy', 'radius', 'cum', 'block', 'view', 'trace', 'fire'];
// asked only where the copy has it: values() sets f_<k> true when the copy has that value and this task can write it (when $copy)
const has = (k, o) => Object.assign({}, o || {}, { when: Object.assign({ $copy: { id: 'f_' + k, is: true } }, (o && o.when) || {}) });
// a row with need is asked only when the copy has that block
const advQ = g => ADV.filter(a => a.g === g).map(a => { const o = a.limits ? { limits: a.limits } : {}; return q(a.id, a.kind, a.covers, a.need ? has(a.need, o) : o); });
function advEditA(a, value) {
  if (a.t === 'tex') return { p: a.p, v: '"/texture/fx/' + String(value).replace(/["\\/]/g, '').trim() + '"', head: true };
  if (a.t === 'qwords') return { p: a.p, v: String(value).trim().split(/\s+/).map(w => '"' + w.replace(/"/g, '') + '"').join(' ') };
  return advEdit(a, value);
}
function advValueA(ch, a) {
  const n = node(ch, a.p);
  if (a.t === 'tex') { const x = str(ch, a.p); return x ? x.replace(/^\/?texture\/fx\//i, '') : undefined; }
  if (a.t === 'qwords') return n ? vals(n).join(' ') : undefined;
  return advValue(ch, a);
}

const recipe = {
  id: 'ammo',
  verbs: ['make', 'change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 51,
  title: 'task.ammo.t',
  census: 'ammo',
  base: { lookup: 'round' },
  groups: [
    { id: 'what', title: 'task.ammo.g.what', essential: true, q: [
      q('id', 'id', ['ammo.id', 'ammo.family'], { limits: { re: '^[a-z0-9_]+(\\.[a-z0-9_]+)*$', limit: 'KEY-10' }, when: { $verb: 'make' }, unique: { lookup: 'newround' } }),
      q('name', 'text', ['ammo.text.name', 'ammo.desc'], { limits: { limit: 'LOC-15' } }),
    ] },
    // the damage a first time user answers: each only where the copy has it and this task can write it
    { id: 'damage', title: 'task.ammo.g.damage', essential: true, q: [
      q('strength', 'number', ['ammo.preset_args'], has('preset', { limits: { min: 0.05, max: 30, unit: 'preset number' } })),
      q('blast_energy', 'number', ['ammo.damage.blastwave.energy'], has('energy', { limits: { min: 0.05, max: 500, unit: 'energy', limit: 'KEY-02' } })),
      q('blast_radius', 'number', ['ammo.damage.blastwave.area', 'ammo.damage.blastwave.add'], has('radius', { limits: { min: 0.2, max: 100, unit: 'm', limit: 'GPL-01' } })),
      q('cumulative', 'number', ['ammo.cumulative'], has('cum', { limits: { min: 0, max: 1, unit: 'share' } })),
      // GoH only: weight() and filler() of the shell's own ("he_level_<n>" ..) call (shell/.presets, set/blast.inc)
      q('heweight', 'number', ['ammo.preset_args'], has('he', { limits: { min: 0.01, max: 1000, unit: 'kg' }, when: { $game: 'goh' } })),
      q('hefiller', 'number', ['ammo.preset_args'], has('he', { limits: { min: 0.01, max: 1000, unit: 'kg' }, when: { $game: 'goh' } })),
    ] },
    { id: 'look', title: 'task.ammo.g.look', essential: false, q: [
      q('model', 'thing', ['ammo.entity', 'ammo.model.def'], { picker: { sources: ['keep', 'exist', 'branch', 'ext'], lookup: 'roundmodel', branch: 'model', ext: ['soedit', 'blender-gem2'] } }),
    ] },
    { id: 'inventory', title: 'task.ammo.g.inventory', essential: false, q: [
      q('mass', 'number', ['ammo.mass'], { limits: { min: 0.005, max: 3000, unit: 'kg' } }),
      q('isize', 'text', ['ammo.inventory.size'], { limits: { re: '^\\s*[0-8]\\s+[0-8]\\s*$', unit: 'cells', limit: 'HUM-23' } }),
      q('weight', 'number', ['ammo.inventory.weight'], { limits: { min: 1, max: 2000, unit: 'load points' } }),
      q('block', 'number', ['ammo.inventory.block'], has('block', { limits: { min: 1, max: 500, step: 1, unit: 'rounds' } })),
    ].concat(advQ('inventory')) },
    { id: 'carry', title: 'task.ammo.g.carry', essential: false, q: [
      q('giveq', 'yesno', ['ammo.carry.breed_item']),
      q('carriers', 'list', ['ammo.carry.breed_item'], { picker: { sources: ['exist', 'branch'], lookup: 'breed', branch: 'soldier' }, limits: { re: '^[a-z0-9_]+/[a-z0-9_]+$', limit: 'HUM-20' }, when: { giveq: true } }),
      q('count', 'number', ['ammo.carry.breed_item'], { limits: { min: 1, max: 1000, step: 1, unit: 'rounds' }, when: { giveq: true } }),
    ] },
    { id: 'flight', title: 'task.ammo.g.flight', essential: false, q: advQ('flight') },
    { id: 'fuse', title: 'task.ammo.g.fuse', essential: false, q: advQ('fuse') },
    { id: 'tags', title: 'task.ammo.g.tags', essential: false, q: [
      q('tagkind', 'choice', ['ammo.tag.kind'], { limits: { values: TKIND, limit: 'DMG-01' }, optional: true }),
      q('tagsize', 'choice', ['ammo.tag.size', 'ammo.fx.hit', 'ammo.sound.hit'], { limits: { values: TSIZE }, optional: true }),
      q('tagclass', 'choice', ['ammo.tag.shell_class'], { limits: { values: TCLASS, limit: 'DMG-27' }, optional: true }),
      q('tagflags', 'list', ['ammo.tag.flags'], { limits: { re: '^-?[a-z0-9_]+$', limit: 'DMG-09' }, optional: true }),
    ] },
    { id: 'firedmg', title: 'task.ammo.g.firedmg', essential: false, q: FIRE.map(([id, k, min, max, unit]) => q(id, 'number', ['ammo.damage.fire.' + k], has('fire', { limits: { min, max, unit } }))) },
  ],
  kept: [
    // structural: the What to copy step
    ['ammo.type', 'the kind of round follows the copy: pick a round of the kind you want in What to copy'],
    ['ammo.from', 'the What to copy step picks it: the new round is a copy of it'],
    // meaning not proven [I], no safe range, no vanilla use
    ['ammo.damage.fire.follow', 'kept as copied: what it changes in game is not known yet'],
    ['ammo.damage.flash', 'kept as copied: what it changes in game is not known yet'],
    ['ammo.damage.cumulative', 'kept as copied: what it changes in game is not known yet'],
    // a bone
    ['ammo.inventory.link_bone', 'a bone of the soldier model; follows the copy'],
    // set in another file: each weapon's {parameters} block (the gun task asks it, params)
    ['ammo.weapon.projectiledamagetable', 'lives in each weapon file, not in the round: the gun task asks it (per round values)'],
    ['ammo.weapon.projectiledamage', 'lives in each weapon file ({parameters}), not in the round: the gun task asks it (per round values)'],
    ['ammo.weapon.healthdamage', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.range', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.speed', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.gravity', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.rechargetime', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.spreading', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.curve', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.cursor', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.bullet_view', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    ['ammo.weapon.tracefreq', 'lives in each weapon file ({parameters}): the gun task asks it (per round values)'],
    // no tool step yet
    ['ammo.ai.rule', 'kept as copied: the rules for which round the AI picks cannot be changed by a task yet'],
    ['ammo.carry.vehicle_box', 'kept as copied: vehicle ammunition boxes cannot be changed by a task yet; mounting a cannon swaps its shells'],
    // vehicle task
    ['ammo.carry.first_load', 'vehicle task: set when a cannon is put on a vehicle'],
  ],
  test: 'task.ammo.test',
  checklist: ['task.ammo.c.inv', 'task.ammo.c.fire', 'task.ammo.c.blast', 'task.ammo.c.log'],
  lookups: {
    round: async (ctx, w, o) => GOH().isGoh(ctx) ? GOH().rounds(ctx, w, o) : lookupStuff(ctx, w, o, rel => SHELL_DIRS.includes(rel.split('/')[0]) && /\.ammo$/.test(rel)),
    roundmodel: async (ctx, w, o) => lookupKeys(ctx, w, o, /^resource\/entity\/.+\.def$/, k => /\/(inventory|shell|ammo|bullet|rocket|bomb)/.test(k) ? k.slice(k.lastIndexOf('/') + 1).replace(/\.def$/, '') : null).slice(0, 300),
    breed: async (ctx, w, o) => L.breeds(ctx, w, o),
    newround: async (ctx, w, o) => (GOH().isGoh(ctx) ? GOH().idLookup(ctx, w, o) : idLookup(ctx, w, o)),
  },
  values: async (ctx, base, opt) => {
    if (GOH().isGoh(ctx)) return GOH().ammoValues(ctx, base);
    const c = source(ctx, ctx && ctx.mod), none = { carriers: [], count: 10, giveq: false };
    if (!c || !base) return none;
    const key = baseKey(c, base);
    if (!key) return none;
    const ch = chain(c, key), rw = raw(c, key) || { root: 'bullet', calls: [], inMod: false };
    const own = c.s.get(key).toString('latin1'), pm = PRESET.exec(own), ls = layers(ch);
    const name = key.slice(key.lastIndexOf('/') + 1), ext = /\.ammo$/.test(name) ? '.ammo' : '', id = name.slice(0, name.length - ext.length);
    const sz = vals(node(ch, 'inventory/size'));
    const v = {
      id: freeId(c, id), name: stuffName(c, key) || id, model: str(ch, 'entity'), strength: pm ? Number(pm[2]) : undefined,
      blast_energy: ls.length ? r4(ls[0].energy) : undefined, blast_radius: ls.length ? r4(ls[ls.length - 1].area[1]) : undefined,
      cumulative: num(ch, 'cumulative'), mass: num(ch, 'mass'), isize: sz.length >= 2 ? sz.slice(0, 2).join(' ') : undefined,
      weight: num(ch, 'inventory/weight'), block: num(ch, 'inventory/block'), carriers: [], count: num(ch, 'inventory/block') || 10, giveq: false,
    };
    for (const a of ADV) v[a.id] = advValueA(ch, a);
    const tw = tagWords(c, key), dm = ownDamage(c, key), fire = dm.find(d => d.type === 'fire');
    TROLE.forEach((vs, i) => { const w = tw.all.find(x => vs.includes(x)); if (w) v[['tagkind', 'tagsize', 'tagclass'][i]] = w; });
    v.tagflags = tw.all.filter(x => !TROLE.some(vs => vs.includes(x)));
    if (fire) for (const [id, k] of FIRE) if (fire.v[k] && fire.v[k].length) v[id] = Number(fire.v[k][0]);
    for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
    // what this task can write on this round: on a change a blast comes from the round's own layers or the fg preset's number; the
    // radius only from its own layers (a preset sets it from its number)
    const change = opt && opt.verb === 'change', ownB = dm.filter(d => d.type === 'blastwave').length, ownAll = ls.length > 0 && ownB === ls.length, fg = !!(pm && /^fg/i.test(pm[1]));
    const F = { preset: !!pm, energy: ls.length > 0 && (!change || fg || ownAll), radius: ls.length > 0 && (!change || (ownAll && !fg)), cum: v.cumulative != null, block: v.block != null,
      view: !!node(ch, 'view'), trace: !!node(ch, 'trace'), fire: !!fire };
    for (const k of FACTS) v['f_' + k] = F[k];
    v._meta = { id, key, root: rw.root, inMod: rw.inMod, dir: key.slice(STUFF.length, key.lastIndexOf('/')), ext, preset: pm ? { name: lc(pm[1]), args: Number(pm[2]) } : null,
      layers: ls, ownLayers: (own.match(/\{\s*damage\b/gi) || []).length, desc: str(ch, 'desc'), has: { view: !!node(ch, 'view'), trace: !!node(ch, 'trace') }, tw, dm };
    return v;
  },
  compile: (draft, c) => compileAmmo(draft, c),
};

function compileAmmo(draft, c) {
  if (L.gidOf({ gameId: c.game }) === 'goh') return GOH().compileAmmo(draft, c);
  const v = c.values || {}, m = v._meta;
  if (!m || !m.key) throw bad('Pick the ammunition to copy first (What to copy).');
  const src = c.gameDir ? source({ game: () => c.gameDir, gameId: c.game }, c.mod) : null, ch0 = src ? chain(src, m.key) : [];
  const make = c.verb !== 'change', notes = [], ops = [];
  const val = id => c.value(id), n = id => Number(val(id));
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !same(val(id), v[id]);
  const id = String(val('id') || '').toLowerCase().trim();
  if (make) {
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(id)) throw bad('The new ammunition needs an id: small English letters, digits and _, parts joined by a dot (bullet75.heat).');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the ammunition you copy. Pick a new id.');
  }
  // a new round always gets a name players see (the copy's name when kept); a change writes it only when it changed
  const display = String(val('name') || '').trim(), nameChanged = !!display && (make || changed('name'));
  const newKey = make ? STUFF + m.dir + '/' + id + (m.ext && !id.split('.').includes('ammo') ? m.ext : '') : m.key;
  const item = itemOf(newKey);
  // the edits
  const E = [];
  if (changed('isize')) E.push({ p: 'inventory/size', v: String(val('isize')).trim().split(/\s+/).join(' ') });
  if (changed('weight')) E.push({ p: 'inventory/weight', v: String(n('weight')) });
  if (changed('block')) E.push({ p: 'inventory/block', v: String(n('block')) });
  // the advanced questions, one path each; a flying model or a tracer the copy does not have is not made up
  for (const a of ADV) {
    if (!changed(a.id)) continue;
    if (a.need && !(m.has || {})[a.need]) { notes.push(a.id + ': the round you copy has no {' + a.need + '} block, so this value was not written.'); continue; }
    E.push(advEditA(a, val(a.id)));
  }
  // tag words: the three role words and the flags, compared with the copy's effective words
  const tagsOf2 = get => ['tagkind', 'tagsize', 'tagclass'].map(get).filter(Boolean).concat([].concat(get('tagflags') || []).map(x => String(x).trim()));
  const tagAsked = ['tagkind', 'tagsize', 'tagclass', 'tagflags'].some(changed);
  const tc = tagAsked && m.tw ? tagChange(m.tw, tagsOf2(k => v[k]), tagsOf2(k => val(k))) : null;
  if (tc && tc.inhDrops.length) notes.push('Tag words: ' + tc.inhDrops.join(', ') + ' come from a parent file; a -word of its own cancels each one (check in game).');
  // fire damage: only the round's own {damage fire} block can be changed (an inherited one would be replaced, KEY-17)
  const fireOwn = (m.dm || []).find(d => d.type === 'fire'), fireSet = {};
  for (const [id, k] of FIRE) if (changed(id)) fireSet[k] = n(id);
  if (Object.keys(fireSet).length && !fireOwn) { notes.push('Fire damage: the round you copy has no {damage fire} block of its own, so it was not written.'); for (const k of Object.keys(fireSet)) delete fireSet[k]; }
  const ma = c.answer('model'), model = ma && (ma.src === 'exist' || ma.src === 'branch') && changed('model') ? entityOf(val('model')) || null : null;
  if (ma && ma.src === 'ext') notes.push('Model: finish it in the outside program, then pick it here (the copy keeps its model until then).');
  const blastNew = changed('blast_energy') || changed('blast_radius');
  const E2 = changed('blast_energy') ? n('blast_energy') : null, R2 = changed('blast_radius') ? n('blast_radius') : null;
  if (make) {
    const so = { op: 'shell', id, like: tagsOf(m.key).join(' ') };
    if (blastNew) { const lay = scaleLayers(m.layers, E2 != null ? E2 : v.blast_energy, R2 != null ? R2 : v.blast_radius); if (lay) so.blast = lay; }
    if (changed('strength')) {
      if (!m.preset) notes.push('Strength: the round you copy calls no preset, so there is no preset number to change.');
      else if (so.blast && /^fg/.test(m.preset.name)) notes.push('Strength: the new blast replaces the ' + m.preset.name + ' preset (it writes the blast), so its number is not used.');
      else { so.preset = m.preset.name; so.args = n('strength'); }
    }
    if (changed('mass')) so.mass = n('mass');
    if (changed('cumulative')) so.cumulative = n('cumulative');
    // a model made by the model task in this run: a set row (the model op runs first); a picked one: the shell op checks it
    if (model && ma.src === 'branch') E.push({ p: 'entity', v: '"' + model + '"' }); else if (model) so.entity = model;
    if (Object.keys(fireSet).length) so.damage_edit = [{ type: 'fire', layer: fireOwn.n, set: fireSet }];
    // tag words through the shell op; a dropped inherited word needs a -word on the copy's tag line (one set row writes the line)
    let tagLine = null;
    if (tc && !tc.inhDrops.length) { const t = tc.adds.concat(tc.ownDrops.map(w => '-' + w)); if (t.length) so.tags = t; } else if (tc) tagLine = tc;
    ops.push(so);
    if (nameChanged) E.push({ p: 'desc', v: '"desc/ammo/' + id + '"' });
    // the new file is a full copy of the round, so the round's own layout says what is a block there
    const rr = src ? raw(src, m.key) : null, r = rows(newKey, { root: m.root, at: p => rr ? rr.at(p) : null }, ch0, E);
    if (tagLine) r.rows.push(...tagRows(newKey, m.root, m.tw, tagLine, notes));
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
    if (nameChanged) ops.push({ op: 'text', key: 'desc/ammo/' + id, text: display });
  } else {
    const rr = src ? raw(src, m.key) : null, rw = { root: m.root, at: p => rr ? rr.at(p) : null };
    if (changed('mass')) E.push({ p: 'mass', v: String(n('mass')) });
    if (changed('cumulative')) E.push({ p: 'cumulative', v: String(n('cumulative')) });
    if (model) E.push({ p: 'entity', v: '"' + model + '"' });
    for (const [k, x] of Object.entries(fireSet)) E.push({ p: 'damage[' + fireOwn.idx + ']/' + k, v: String(x) });
    const macros = [];
    // a new blast energy on an fg round wins over the strength number (both set the preset's one number)
    const fgE = m.preset && /^fg/.test(m.preset.name) && E2 != null;
    if (changed('strength') && !fgE) { if (m.preset) macros.push({ op: 'macro', entity: 'file:' + m.key, macro: m.preset.name, arg: 'args', value: n('strength') }); else notes.push('Strength: this round calls no preset, so there is no preset number to change.'); }
    if (changed('strength') && fgE) notes.push('Strength: the new blast energy sets the preset number, so the strength answer was not used.');
    const ownBlast = (m.dm || []).filter(d => d.type === 'blastwave');
    if (blastNew) {
      // fg / fg_medium write energy = number x 1.15, fg_heavy energy = number (set/stuff/shell/.presets); the radius follows the number there
      if (fgE) {
        macros.push({ op: 'macro', entity: 'file:' + m.key, macro: m.preset.name, arg: 'args', value: r4(m.preset.name === 'fg_heavy' ? E2 : E2 / 1.15) });
        if (R2 != null) notes.push('Blast radius: the ' + m.preset.name + ' preset sets it from its number (the new energy changes it), so a radius of its own cannot be written on this round.');
      } else if (ownBlast.length && ownBlast.length === m.layers.length) {
        // the round's own layers, each by its place among the {damage} blocks (damage[n]): energy on the first, every area scaled
        const lay = scaleLayers(m.layers, E2 != null ? E2 : v.blast_energy, R2 != null ? R2 : v.blast_radius) || [];
        lay.forEach((l, i) => { const [e, a0, a1] = l.split(' '); if (i === 0 && E2 != null) E.push({ p: 'damage[' + ownBlast[i].idx + ']/energy', v: e }); if (R2 != null) E.push({ p: 'damage[' + ownBlast[i].idx + ']/area', v: a0 + ' ' + a1 }); });
      } else notes.push('Blast: the blast layers of this round come from a file it copies; one inherited layer cannot be changed in place. Make a new round from it instead.');
    }
    const r = rows(m.key, rw, ch0, E);
    if (tc) r.rows.push(...tagRows(m.key, m.root, m.tw, tc, notes));
    if (r.skipped.length) notes.push('Not changed (set by a macro call this task cannot edit): ' + r.skipped.join(', '));
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
    ops.push(...macros);
    if (nameChanged) ops.push({ op: 'text', key: m.desc ? String(m.desc) : 'desc/ammo/' + tagsOf(m.key).join(' '), text: display });
    if (!m.inMod) notes.push('The round lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  }
  const cnt = Number(val('count')) > 0 ? Math.round(Number(val('count'))) : 10;
  ops.push(...kitOps(val('giveq') === true ? [].concat(val('carriers') || []).map(entityOf).filter(Boolean) : [], item, undefined, src, notes, { count: cnt }, !changed('count')));
  return { gen: ops.length ? { ops } : null, copies: [], notes, result: item };
}

// what the game's own data uses (a scan of every vanilla round): outside it a warning under the field (limits.usual), never a
// refusal. A hard max only where a bigger number means nothing (none here); the mins keep what the game cannot take
const USUAL = {strength: [0.27,14], blast_energy: [0.2,150], blast_radius: [1.5,30], mass: [0.013,1500], weight: [1,150], block: [5,100], tracelight: [0,8], tracewidth: [0,0.4], tracelen: [0,108], detthick: [1,2], aidanger: [4,4], firerad: [5,20], fireheat: [0.8,4], firetime: [3,5]};
const HARDMAX = [];
for (const g of recipe.groups) for (const x of g.q) if (x.kind === 'number' && USUAL[x.id]) {
  x.limits = Object.assign({}, x.limits, { usual: USUAL[x.id] });
  if (!HARDMAX.includes(x.id)) delete x.limits.max;
}
// GoH asks only what gunammo.goh.js writes; every other question is for the AS2 tabs
for (const g of recipe.groups) for (const x of g.q) if (!GOH().AMMO_Q.includes(x.id)) x.when = Object.assign({}, x.when, { $game: ['as64', 'mowas2'] });

module.exports = recipe;
