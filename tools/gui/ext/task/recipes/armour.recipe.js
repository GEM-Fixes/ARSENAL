// recipe "change the armour of a unit": the armour preset, the millimetres of each armour line (gen macro op on the armor_* calls),
// the own thickness of the hit volumes (gen set rows), the millimetres of one side of a volume (the Models page armour edit route,
// armorsim edit), the advanced volume keys (density, whole wound, able flags), the part flags and repair times (gen set rows) and the
// hull material word. The base is the unit itself: a game unit gets a whole-file override in the picked mod, a unit of the picked mod
// is edited in place. Readers and the armour line helpers come from vehicle.recipe.js (_lib). Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-8119d98d)
'use strict';
const L = require('./vehicle.recipe')._lib;

const PRESETS = ['armor_medium', 'armor_light', 'armor_heavy', 'armor_spa_heavy', 'armor_spa_light', 'armor_mortar'];
const SIDES = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const ABLE = ['blast', 'bullet', 'contact', 'contact_ground', 'float', 'hole', 'holed', 'nolook', 'nowounddecal', 'obstacle', 'select', 'touch', 'visible', 'window'];
const MATERIALS = ['steel', 'wood'];
const GM = () => require('../../../../lib/games');
// the game: the draft's word, else ctx.gameId (the gui.js function or lib/compile.js lookupCtx's word), else as64
function gidOf(ctx, d) { let x = d || null; if (!x && ctx) { try { x = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { x = null; } } return GM().idOf(x) || 'as64'; }
// Gates of Hell (2026-11-23): armour.goh.js, on tools/lib/goharmour.js (the reader the Units page Change > Armour and the Models page
// use): every part as a percent and the base and side millimetres of each part (group goh), then the GoH forms of the rest (group
// gohmore): the armour class (a properties/armor.ext preset call), repair(N) of the group lines, the volume keys (CastSteel,
// HighHardness, Quality, material, density, able flags) and the hull material ({props} steel / wood). Every AS2 question is AS2
// only. The part flags (break_by_pierce) have no GoH form: the game's part reader takes no flags, no game vehicle has one: refused.
const GH = () => require('./armour.goh');
const NA_GOH = 'Not available in GoH: these are the Assault Squad 2 armour questions. Use the Gates of Hell questions instead: armour class, part millimetres, repair times, volume keys and hull material. A part flag like break_by_pierce has no Gates of Hell form at all: the game reads no flags for a vehicle part and no game vehicle has one (GHDMG-01)';
const presetCall = u => L.ownCalls(u).find(c => PRESETS.includes(L.callName(c))) || null;
function volumes(u) { return L.kids(u.top, 'volume').map(n => ({ node: n, name: L.plain(u, n)[0] || '', thick: L.kids(n, 'thickness')[0] || null })); }
// the effective hit volumes and parts (own file, includes and macros): repeated blocks of one name merge, the last value wins [I]
function effNamed(u, head, key) {
  const m = new Map();
  for (const x of (u.full && u.full.items) || []) {
    if (x.k !== 'BLOCK' || !x.items[0] || x.items[0].k !== 'IDENT' || L.lc(x.items[0].text) !== head) continue;
    const name = String((L.valsOf(x) || [])[0] || ''); if (!name) continue;
    const o = m.get(L.lc(name)) || { name, val: null }; m.set(L.lc(name), o);
    for (const y of x.items) if (y.k === 'BLOCK' && y.items[0] && L.lc(y.items[0].text) === key) o.val = L.valsOf(y).map(String).join(' ');
  }
  return [...m.values()];
}
const effVols = u => effNamed(u, 'volume', 'thickness');
const effParts = u => effNamed(u, 'component', 'repairtime');
function parts(u) { return L.kids(u.top, 'component').map(n => ({ node: n, name: L.plain(u, n)[0] || '', time: L.kids(n, 'repairtime')[0] || null })); }
// the advanced keys a volume has: density N, whole_wound yes, able.<flag> N
function volLines(u) {
  const out = [];
  for (const v of volumes(u)) {
    const d = L.kids(v.node, 'density')[0]; if (d) out.push(v.name + ' density ' + L.plain(u, d).join(' '));
    if (L.kids(v.node, 'whole_wound')[0]) out.push(v.name + ' whole_wound yes');
    for (const a of L.kids(v.node, 'able')) for (const f of ABLE) { const x = L.kids(a, f)[0]; if (x) out.push(v.name + ' able.' + f + ' ' + (L.plain(u, x)[0] || '1')); }
  }
  return out;
}
function baseValues(u) {
  const v = {}, pc = presetCall(u);
  if (pc) v.preset = L.callName(pc);
  v.parts = L.partLines(u);
  // every hit volume of the unit with its thickness, or auto where it has none (the game default)
  v.volumes = effVols(u).map(x => x.name + ' ' + (x.val || 'auto'));
  v.sides = [];
  for (const x of volumes(u)) if (x.thick) for (const s of SIDES) { const n = L.kids(x.thick, s)[0]; if (n) v.sides.push(x.name + ' ' + s + ' ' + L.plain(u, n).join(' ')); }
  v.volx = volLines(u);
  v.repair = effParts(u).filter(x => x.val).map(x => x.name + ' ' + x.val);
  v.partx = [];
  for (const p of parts(u)) for (const a of L.kids(p.node, 'able')) { const b = L.kids(a, 'break_by_pierce')[0]; if (b) v.partx.push(p.name + ' break_by_pierce ' + (L.plain(u, b)[0] || '1')); }
  const mat = L.effProps(u).map(L.lc).filter(w => MATERIALS.includes(w));
  if (mat.length) v.material = mat[mat.length - 1];
  return v;
}
const lines = (c, id) => L.asList(c.value(id)).map(s => s.replace(/\s+/g, ' '));
const baseMap = arr => { const m = new Map(); for (const l of arr || []) { const i = l.indexOf(' '); if (i > 0) m.set(L.lc(l.slice(0, i)), l.slice(i + 1)); } return m; };
const baseSet = arr => new Set((arr || []).map(s => L.lc(String(s).trim().replace(/\s+/g, ' '))));

async function compile(draft, c) {
  if (gidOf(null, c.game) === 'goh') {
    // an AS2 question answered in a GoH draft (an old draft, a hand-made body): refused with the plain line, nothing half written
    const as2 = AS2_Q.filter(id => { const a = typeof c.answer === 'function' ? c.answer(id) : null; return a && a.src && a.src !== 'keep'; });
    if (as2.length) throw L.bad(NA_GOH + ' [' + as2.join(', ') + ']');
    return GH().compile(draft, c);
  }
  const { u } = L.context(c), ops = [], bag = L.rowBag(u), calls = [], notes = [];
  if (!u.mine) notes.push(u.key + ' is copied whole into your mod and changed there (a whole file override).');
  if (L.changed(c, 'parts')) ops.push(...L.partOps(u, u.id, c.values.parts, lines(c, 'parts')));
  if (L.changed(c, 'preset')) {
    const pc = presetCall(u);
    if (!pc) throw L.bad(u.id + ' has no armour preset of its own to swap: its armour comes from its volumes or a shared file.');
    const n = L.nthOf(u, pc), op = { op: 'macro', entity: u.id, macro: L.callName(pc), rename: L.lc(c.value('preset')) };
    if (n.count > 1) op.nth = n.nth;
    ops.push(op);
  }
  const have = volumes(u), volOf = name => {
    const v = have.find(x => L.lc(x.name) === L.lc(name));
    if (!v) throw L.bad('"' + name + '" is not a hit volume in the own file of ' + u.id + '. Its volumes: ' + (have.map(x => x.name).join(', ') || 'none'));
    return v;
  };
  if (L.changed(c, 'volumes')) {
    const base = baseMap(c.values.volumes);
    for (const l of lines(c, 'volumes')) {
      const m = /^(\S+) (auto|(?:hollow )?\d*\.?\d+(?: \d*\.?\d+)?)$/i.exec(l);
      if (!m) throw L.bad('Write each volume as: name millimetres, for example body 25, or hollow 3, or auto.');
      if (base.get(L.lc(m[1])) === m[2]) continue;
      const all = effVols(u), eff = all.find(x => L.lc(x.name) === L.lc(m[1]));
      if (!eff) throw L.bad('"' + m[1] + '" is not a hit volume of ' + u.id + '. Its volumes: ' + (all.map(x => x.name).join(', ') || 'none'));
      const vol = have.find(x => L.lc(x.name) === L.lc(m[1]));
      if (L.lc(m[2]) === 'auto') {
        if (vol && vol.thick) bag.del(vol.thick);
        else if (eff.val) throw L.bad('The volume ' + m[1] + ' takes its thickness from a shared file: write a number instead of auto.');
        continue;
      }
      // a volume from an include or macro: a block of the same name at the end of the own file adds the thickness [I]
      if (!vol) { bag.append(u.top, 'volume', L.quote(eff.name) + ' {thickness ' + m[2] + '}'); continue; }
      if (vol.thick) {
        // a thickness with side blocks: the plain number goes before them (a set row would drop the sides)
        if (L.kids(vol.thick, 'front').length || SIDES.some(s => L.kids(vol.thick, s).length)) throw L.bad('The volume ' + m[1] + ' has its own side numbers: change them in the side lines, or remove them first.');
        bag.set({ op: 'set', path: L.pathOf(u, vol.thick), value: m[2] });
      } else bag.set({ op: 'add', path: L.pathOf(u, vol.node) + '/thickness', value: m[2] });
    }
  }
  // one side of a volume: the Models page armour edit (armorsim edit) writes {thickness N {side mm}}
  if (L.changed(c, 'sides')) {
    const base = baseSet(c.values.sides);
    for (const l of lines(c, 'sides')) {
      if (base.has(L.lc(l))) continue;
      const m = /^(\S+) (front|rear|left|right|top|bottom|all) (\d+(\.\d+)?)$/i.exec(l);
      if (!m) throw L.bad('Write each side as: volume side millimetres, for example body front 20. Sides: ' + SIDES.join(', ') + ', all.');
      volOf(m[1]);
      calls.push({ route: 'POST /api/x/models/armor/edit', body: { target: u.id, volume: m[1], side: L.lc(m[2]), mm: +m[3] }, dryFlag: 'dry' });
    }
  }
  if (L.changed(c, 'volx')) {
    const base = baseSet(c.values.volx);
    for (const l of lines(c, 'volx')) {
      if (base.has(L.lc(l))) continue;
      const m = /^(\S+) (density|whole_wound|able\.([a-z_]+)) (\S+)$/i.exec(l);
      if (!m) throw L.bad('Write each line as: volume key value, for example body able.visible 0. Keys: density, whole_wound, able.<flag>.');
      const vol = volOf(m[1]), key = L.lc(m[2]), v = m[4];
      if (key === 'density') {
        if (isNaN(+v) || +v < 0) throw L.bad('"' + l + '": the density is a number, 0 or more.');
        bag.set(L.rowFor(u, ['density'], String(+v), vol.node));
      } else if (key === 'whole_wound') {
        const on = /^(yes|1|true|on)$/i.test(v), own = L.kids(vol.node, 'whole_wound')[0];
        if (on && !own) bag.set({ op: 'add', path: L.pathOf(u, vol.node) + '/whole_wound', value: '' });
        else if (!on && own) bag.del(own);
      } else {
        const f = L.lc(m[3]);
        if (!ABLE.includes(f)) throw L.bad('"' + m[3] + '" is not a volume flag. Flags: ' + ABLE.join(', ') + '.');
        if (!/^[01]$/.test(v)) throw L.bad('"' + l + '": a flag is 0 or 1.');
        bag.set(L.rowFor(u, ['able', f], v, vol.node));
      }
    }
  }
  const ps = parts(u), partOf = name => {
    const p = ps.find(x => L.lc(x.name) === L.lc(name));
    if (!p) throw L.bad('"' + name + '" is not a part of ' + u.id + ' in its own file. Its parts: ' + (ps.map(x => x.name).join(', ') || 'none'));
    return p;
  };
  if (L.changed(c, 'repair')) {
    const base = baseMap(c.values.repair);
    for (const l of lines(c, 'repair')) {
      const m = /^(\S+) (\d+(\.\d+)?)$/.exec(l);
      if (!m) throw L.bad('Write each part as: name seconds, for example turret 25.');
      if (base.get(L.lc(m[1])) === m[2]) continue;
      const p = ps.find(x => L.lc(x.name) === L.lc(m[1]));
      if (!p) {
        // a part from an include or macro: a block of the same name at the end of the own file adds the time [I]
        const e = effParts(u).find(x => L.lc(x.name) === L.lc(m[1]));
        if (!e) throw L.bad('"' + m[1] + '" is not a part of ' + u.id + '. Its parts: ' + (effParts(u).map(x => x.name).join(', ') || 'none'));
        bag.append(u.top, 'component', L.quote(e.name) + ' {RepairTime ' + m[2] + '}'); continue;
      }
      bag.set(p.time ? { op: 'set', path: L.pathOf(u, p.time), value: m[2] } : { op: 'add', path: L.pathOf(u, p.node) + '/RepairTime', value: m[2] });
    }
  }
  if (L.changed(c, 'partx')) {
    const base = baseSet(c.values.partx);
    for (const l of lines(c, 'partx')) {
      if (base.has(L.lc(l))) continue;
      const m = /^(\S+) break_by_pierce ([01])$/i.exec(l);
      if (!m) throw L.bad('Write each part as: name break_by_pierce 0 or 1, for example body break_by_pierce 0.');
      bag.set(L.rowFor(u, ['able', 'break_by_pierce'], m[2], partOf(m[1]).node));
    }
  }
  if (L.changed(c, 'material')) {
    const w = L.lc(c.value('material'));
    if (!MATERIALS.includes(w)) throw L.bad('The hull material is one of: ' + MATERIALS.join(', ') + '.');
    const own = L.kids(u.top, 'props'), op = own.length ? own[own.length - 1] : null;
    const words = (op ? L.plain(u, op) : L.effProps(u)).map(L.lc).filter(x => !MATERIALS.includes(x)).concat(w);
    const line = words.filter((x, i) => words.indexOf(x) === i).map(L.quote).join(' ');
    bag.set(op ? { op: 'set', path: L.pathOf(u, op), value: line } : L.rowFor(u, ['props'], line));
  }
  if (bag.size) ops.push({ op: 'set', rows: bag.rows().map(r => Object.assign({ entity: u.id }, r)) });
  return { gen: ops.length ? { ops } : null, calls, copies: [], notes, result: u.id };
}

const Q = (id, kind, covers, o) => Object.assign({ id, kind, ask: 'task.armour.q.' + id, help: 'task.armour.h.' + id, covers }, o || {});
const AREA = ['turret', 'body', 'body2', 'body3', 'body4', 'body5', 'args'];
const K = (reason, ...keys) => keys.map(k => [k, reason]);
const setting = ['armor.setting', 'armor.setting.thickness', 'armor.setting.volumes', 'armor.setting.durability.blast.value', 'armor.setting.durability.blast.koef',
  'armor.setting.durability.pierce.value', 'armor.setting.durability.pierce.koef', 'armor.setting.threshold.blast.value', 'armor.setting.threshold.blast.koef',
  'armor.setting.threshold.pierce.value', 'armor.setting.threshold.pierce.koef', 'armor.setting.threshold.pierce.calibre', 'armor.setting.whole_wound',
  'armor.setting.ray_cast_thickness', 'armor.setting.disable_damage_acc'];

const AS2_Q = ['preset', 'parts', 'volumes', 'sides', 'repair', 'volx', 'partx', 'material'];
// Gates of Hell asks only these (armour.goh.js); the AS2 questions above carry $game as64 / mowas2
const GQ = (id, kind, o) => Object.assign({ id, kind, ask: 'task.armour.q.' + id, help: 'task.armour.h.' + id, covers: [], when: { $game: ['goh'] } }, o || {});

module.exports = {
  id: 'armour',
  verbs: ['change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 25,
  title: 'task.armour.t',
  census: 'armour',
  base: { lookup: 'vehicle' },
  groups: [
    { id: 'goh', title: 'task.armour.g.goh', essential: true, q: [
      GQ('gohpct', 'number', { limits: { min: 5, max: 1000, step: 1, unit: '%', usual: [50, 200], limit: 'GHDMG-01' } }),
      GQ('gohparts', 'list', { limits: { re: '^\\S+( [0-9]+(\\.[0-9]+)?)?(,? (front|top|left|right|rear|bottom) [0-9]+(\\.[0-9]+)?)*$', min: 0, max: 2000, unit: 'mm' } }),
    ] },
    { id: 'gohmore', title: 'task.armour.g.gohmore', q: [
      GQ('gohpreset', 'text', { optional: true, limits: { re: '^[a-z0-9_]*$' } }),
      GQ('gohrepair', 'list', { limits: { re: '^\\S+ (600|[1-5][0-9]{2}|[1-9][0-9]?)(\\.[0-9]+)?$', min: 1, max: 600, unit: 's' } }),
      GQ('gohvolx', 'list', { limits: { re: '^\\S+ (caststeel ([0-9]*\\.?[0-9]+|none)|highhardness (yes|no)|quality (large_flaw|none)|material (steel|wood|fabric|sand|concrete|glass|flesh|none)|density ([0-9]*\\.?[0-9]+|none)|able\\.(visible|bullet|obstacle|contact|contact_ground|blast|hole|holed|touch|float|nowounddecal) (0|1|none))$' } }),
      GQ('gohmaterial', 'choice', { limits: { values: MATERIALS } }),
    ] },
    { id: 'line', title: 'task.armour.g.line', essential: true, q: [
      Q('preset', 'choice', ['armor.macro'], { limits: { values: PRESETS, limit: 'STR-13' } }),
      Q('parts', 'list', [].concat(...['armor_light', 'armor_medium', 'armor_heavy'].map(m => AREA.map(a => m + '.' + a))).concat(
        ['armor_spa_heavy.armor', 'armor_spa_heavy.armor2', 'armor_spa_heavy.armor3', 'armor_spa_heavy.armor4', 'armor_spa_heavy.armor5', 'armor_spa_light.armor', 'armor_engine.t', 'armor_mantlet.t', 'shield.args']),
        { limits: { re: L.ARMOUR_RE, min: 0, max: 250, unit: 'mm', limit: 'DMG-25' } }),
    ] },
    { id: 'volumes', title: 'task.armour.g.volumes', q: [
      Q('volumes', 'list', ['volume', 'volume.thickness', 'volume.thickness.hollow'], { limits: { re: '^\\S+ (auto|(hollow )?(1500|1[0-4][0-9]{2}|[0-9]{1,3}|[0-9]{0,3}\\.[0-9]+)( [0-9]*\\.?[0-9]+)?)$', min: 0, max: 1500, unit: 'mm', limit: 'DMG-06' } }),
      Q('sides', 'list', SIDES.map(s => 'volume.thickness.' + s), { limits: { re: '^\\S+ (front|rear|left|right|top|bottom|all) (1000|[0-9]{1,3})(\\.[0-9]+)?$', min: 0, max: 1000, unit: 'mm', limit: 'PORT-06' } }),
    ] },
    { id: 'repair', title: 'task.armour.g.repair', q: [
      Q('repair', 'list', ['component', 'component.repairtime'], { limits: { re: '^\\S+ (600|[1-5][0-9]{2}|[1-9][0-9]?)(\\.[0-9]+)?$', min: 1, max: 600, unit: 's' } }),
    ] },
    { id: 'advanced', title: 'task.armour.g.advanced', q: [
      Q('volx', 'list', ['volume.density', 'volume.whole_wound'].concat(ABLE.map(k => 'volume.able.' + k)), { limits: { re: '^\\S+ (density (0|0?\\.0[0-9]*|0?\\.10*)|whole_wound (yes|no)|able\\.(' + ABLE.join('|') + ') [01])$' } }),
      Q('partx', 'list', ['component.able.break_by_pierce'], { limits: { re: '^\\S+ break_by_pierce [01]$' } }),
      Q('material', 'choice', ['props.material'], { limits: { values: MATERIALS } }),
    ] },
  ],
  kept: [].concat(
    K('lives in a file shared by every unit: the armour presets and part repair factors live in tank_unarmed.ext; pick another preset instead', 'armor_tank.params', 'components_tank.repair'),
    K('kept as copied: the preset question swaps these settings as one safe set, while one value written alone may replace the whole set [I]', ...setting),
    K('tied to the model bones: the link of a hit volume to its part, its tags and its shape are model geometry (SOEdit, Models page)', 'volume.component', 'volume.tags', 'component.tags', 'volume.shape'),
    K('kept as copied: no game volume names a material of its own, so there is no safe value to offer [I]', 'volume.material'),
    K('lives in a file shared by every unit: materials are in the shared material.set; a change changes every unit of that material', 'material.ricochet', 'material.steelequivalent'),
    K('no tool step yet: the shot test is a look on the Models page (armour picture and shot), named in the checklist', 'test.shot'),
  ),
  test: 'task.armour.test',
  checklist: ['task.armour.c.shot', 'task.armour.c.pierce', 'task.armour.c.log'],
  // GoH: the vehicle and gun defs of the GoH install plus the mod (armour.goh.js)
  lookups: { vehicle: (ctx, w, opt) => (gidOf(ctx, opt && opt.game) === 'goh' ? GH().look(ctx, w, opt) : L.lookupVehicle(ctx, w, opt)) },
  routes: { 'POST /api/x/task/r/armour/goh': (url, b, ctx) => GH().gohRoute(url, b, ctx) },
  values: async (ctx, base, opt) => {
    const gid = gidOf(ctx, opt && opt.game);
    if (gid === 'goh') return GH().values(ctx, base, opt);
    const g = ctx && ctx.game && ctx.game();
    if (!g || !base || !base.id) return {};
    // the game as a third word (vehicle.recipe.js readerFor reads the mowas_2 file set for mowas2 once it takes it; as64 as before)
    await L.warm(g, ctx.mod || '', gid);
    const u = L.unitOf(gid === 'as64' ? L.readerFor(g, ctx.mod || '') : L.readerFor(g, ctx.mod || '', gid), base.id);
    return u ? baseValues(u) : {};
  },
  compile,
};
// every AS2 question is asked on the AS2 tabs only (the GoH group carries $game goh)
for (const g of module.exports.groups) for (const q of g.q) if (AS2_Q.includes(q.id)) q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });
