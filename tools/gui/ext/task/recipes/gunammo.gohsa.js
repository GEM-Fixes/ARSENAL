// recipes "gun" and "ammo" on Gates of Hell, small arms (gunammo.goh.js hands over): weapons in set/stuff/rifle|smg|mgun|pistol and
// their magazines (*.ammo in those folders and bazooka/). Form read from the vanilla GoH files [V GoH data 2026-11-23]:
//   weapon {from "pattern rifle" ..} with calls ("reload time" seconds(n)) ("fire rate" rpm(n)) ("velocity" mps(n)) ("human health"
//   damage(n)) ("armor health" damage(n)) ("penetration" args a b c ..), each in the file, its pattern (<dir>/<x>.pattern) or inside a
//   folder macro of <dir>/.presets (("semi_rifle") brings ("human health" damage(70)) ("fire rate" rpm(150))); plain {calibre n} {mass n}.
//   The macros expand to (set/small_firearms_accuracy.inc, <dir>/.presets): reload time -> {rechargeTime s}, fire rate -> {recoveryTime
//   (/ 60 (* rpm 1.07))}, velocity -> {speed (* 0.70 mps)}, human health -> {healthDamage d}, armor health -> {minimumDamageModifier d},
//   penetration -> {projectileDamageTable {20 %0} {100 %1} ..} (the distances of the folder's own define; smg 2 values, pistol 2, rifle
//   and mgun 5).
//   magazine {bullet .. {inventory {weight w} {block n} {size a b}} {mass m}}: a whole file, no {from}; a launcher round (bazooka/)
//   is {from "pattern rpg_ammo" .. {mass m}}: the set rows go on its root (from). Grenades (subfolders, {from "pattern throwable"}) stay refused.
// Change: gen macro ops on the weapon's own calls (bytes kept); a value it only inherits (pattern or folder macro) = a set row of the
// plain key the macro gives, added in its own file (later wins [I]). Make: gen gun op with class (lib/ops-asset.js opGunAny: the
// folder's macros, {from "<like>"}); a magazine = the file copied whole under the new name, then set rows. Every write [T].
// Author: Imperator_Aug (ARSENAL, ia-028ae3dd)
'use strict';
const GG = require('../../../../gen/lib/gohgun');
const STUFF = 'resource/set/stuff/';
const SA_DIRS = ['rifle/', 'smg/', 'mgun/', 'pistol/'], MAG_DIRS = SA_DIRS.concat(['bazooka/']);
const CLASS = { 'rifle/': 'rifle', 'smg/': 'smg', 'mgun/': 'mg', 'pistol/': 'pistol' };
// question -> [call, its argument, plain key the macro gives, value of the key from the number]
const CALLS = {
  reload: ['reload time', 'seconds', 'rechargeTime', n => n],
  grpm: ['fire rate', 'rpm', 'recoveryTime', n => Math.round(60 / (n * 1.07) * 10000) / 10000],
  speed: ['velocity', 'mps', 'speed', n => Math.round(n * 0.70 * 100) / 100],
  health: ['human health', 'damage', 'healthDamage', n => n],
  gdamage: ['armor health', 'damage', 'minimumDamageModifier', n => n],
};
const lc = s => String(s == null ? '' : s).toLowerCase();
const dirOf = key => { const m = /^resource\/set\/stuff\/([a-z_]+\/)/.exec(key); return m ? m[1] : null; };
const top = key => !key.slice(STUFF.length + dirOf(key).length).includes('/');   // not in a subfolder (grenade/ and the like)
const isSmall = key => SA_DIRS.includes(dirOf(key)) && top(key) && !/\.(ammo|pattern|inc)$/.test(key) && !/\/\./.test(key);
const isMag = key => MAG_DIRS.includes(dirOf(key)) && top(key) && /\.ammo$/.test(key);

// the {from} chain of a small arm: [{key, text}], own file first
function chain(readStr, key) {
  const out = [], dir = dirOf(key);
  let k = key;
  for (let i = 0; i < 8 && k; i++) {
    const t = readStr(k); if (t == null) break;
    out.push({ key: k, text: t });
    const m = /^\s*\{\s*from\s+"([^"]+)"/m.exec(t.replace(/^\s*;.*$/gm, '')); if (!m) break;
    const f = lc(m[1]).trim(), p = /^pattern\s+(.+)$/.exec(f);
    const tries = p ? [STUFF + dir + p[1] + '.pattern', STUFF + p[1] + '.pattern'] : [STUFF + dir + f].concat(SA_DIRS.map(d => STUFF + d + f));
    k = tries.find(x => readStr(x) != null) || null;
  }
  return out;
}
// the defines of <dir>/.presets: name -> body text
function defines(readStr, dir) {
  const t = readStr(STUFF + dir + '.presets') || '', out = new Map();
  for (const m of t.matchAll(/\(\s*define\s+"([^"]+)"/g)) { const e = GG.sdlEnd(t, m.index); if (e > 0) out.set(lc(m[1]), t.slice(m.index + m[0].length, e)); }
  return out;
}
// the numbers a small arm has: {chain, calls: {q: {value, own, via}}, pen: {v[], own, via, n (values the folder define takes)}, calibre, mass}
function facts(readStr, key) {
  const ch = chain(readStr, key), dir = dirOf(key), defs = defines(readStr, dir), f = { found: ch.length > 0, chain: ch.map(c => c.key), calls: {}, pen: null };
  const lists = ch.map(c => GG.calls(c.text).filter(k => !k.inParams));
  const find = name => {
    for (let i = 0; i < lists.length; i++) {
      for (const k of lists[i]) if (k.name === name) return { k, own: i === 0, via: ch[i].key };
      // a folder macro called here whose body calls it: ("semi_rifle") -> ("human health" damage(70))
      for (const k of lists[i]) if (defs.has(k.name)) { const inner = GG.calls('(' + defs.get(k.name) + ')').find(x => x.name === name); if (inner) return { k: inner, own: false, via: '.presets ' + k.name }; }
    }
    return null;
  };
  for (const [q, [name, arg]] of Object.entries(CALLS)) {
    const h = find(name); if (!h) continue;
    const a = h.k.named.find(x => x[0] === arg), v = a ? Number(a[1]) : NaN;
    if (isFinite(v)) f.calls[q] = { value: v, own: h.own, via: h.via, arity: h.k.named.filter(x => x[0] === arg).length };
  }
  const pd = defs.get('penetration') || '', dist = [...pd.matchAll(/\{\s*([\d.]+)\s+%(\d+)\s*\}/g)].map(x => [x[1], +x[2]]);
  // the table the define writes, %N left in: {25 %0} {100 0} (smg) keeps its fixed rows
  const tpl = ((/\{\s*projectileDamageTable\s+([\s\S]*?)\}\s*$/.exec(pd.replace(/;[^\n]*/g, '').trim()) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const ph = find('penetration');
  if (ph && ph.k.args.length) f.pen = { v: ph.k.args.map(Number), own: ph.own, via: ph.via, dist, tpl };
  else if (dist.length) f.pen = { v: null, own: false, via: null, dist, tpl };
  const key1 = (re) => { for (const c of ch) { const m = re.exec(c.text.replace(/;[^\n]*/g, '')); if (m) return +m[1]; } return null; };
  f.calibre = key1(/\{\s*calibre\s+([\d.]+)\s*\}/i);
  f.mass = key1(/^\s*\{\s*mass\s+([\d.]+)\s*\}/im);
  return f;
}

// ---- gun: values (the caller set id, name, kindq, the none fields)
function gunValues(readStr, key, v) {
  const f = facts(readStr, key);
  for (const q of Object.keys(CALLS)) if (f.calls[q]) v[q] = f.calls[q].value;
  if (f.pen && f.pen.v) v.gpen = f.pen.v.join(' ');
  if (f.calibre != null) v.calibre = f.calibre;
  if (f.mass != null) v.mass = f.mass;
  for (const k of Object.keys(CALLS).concat(['gpen'])) v['f_' + k] = v[k] != null;
  v.f_grange = false; v.f_gacc = false;
  v.kindq = CLASS[dirOf(key)] === 'mg' ? 'mg' : CLASS[dirOf(key)];
  return f;
}
// ---- gun: compile (h: helpers of gunammo.goh.js: val, n, changed, make, id, notes, bad)
function compileGun(h, m, f) {
  const ops = [], notes = h.notes, rows = [], dir = dirOf(m.key);
  const pen = h.changed('gpen') ? String(h.val('gpen')).trim().split(/[\s,]+/).map(Number) : null;
  const want = f.pen ? (f.pen.v ? f.pen.v.length : f.pen.dist.length) : 0;
  if (pen && (!want || pen.length !== want || pen.some(x => !isFinite(x) || x < 0))) throw h.bad('Penetration: ' + (want ? want + ' numbers (mm at ' + f.pen.dist.map(d => d[0]).join(', ') + ' m), as the ' + dir.slice(0, -1) + ' folder takes them' : 'this weapon folder has no penetration table') + '.');
  if (h.make) {
    const g = { op: 'gun', class: CLASS[dir], name: h.id, like: m.id };
    if (h.changed('reload')) g.reload = h.n('reload');
    if (h.changed('grpm')) g.rof = h.n('grpm');
    if (h.changed('speed')) g.speed = h.n('speed');
    if (h.changed('health')) g.health = h.n('health');
    const params = {};
    if (h.changed('gdamage')) params['armor health'] = 'damage(' + h.n('gdamage') + ')';
    if (pen) params.penetration = 'args ' + pen.join(' ');
    if (Object.keys(params).length) g.params = params;
    ops.push(g);
    const nk = 'file:' + STUFF + dir + h.id;
    if (h.changed('calibre')) rows.push({ entity: nk, path: 'from/calibre', value: String(h.n('calibre')), op: 'add' });
    if (h.changed('mass')) rows.push({ entity: nk, path: 'from/mass', value: String(h.n('mass')), op: 'add' });
    if (rows.length) ops.push({ op: 'set', rows });
    return ops;
  }
  const ent = 'file:' + m.key;
  for (const [q, [name, arg, plain, conv]] of Object.entries(CALLS)) {
    if (!h.changed(q)) continue;
    const c = f.calls[q];
    if (c && c.own && c.arity === 1) ops.push({ op: 'macro', entity: ent, macro: name, arg, value: h.n(q) });
    else { rows.push({ entity: ent, path: 'from/' + plain, value: String(conv(h.n(q))), op: 'add' }); notes.push(q + ': the weapon only inherits ("' + name + '") (' + (c ? c.via.replace(/^resource\/set\/stuff\//, '') : 'the pattern') + '), so its own {' + plain + ' ' + conv(h.n(q)) + '} is added to its file (the same value the macro gives) [I].'); }
  }
  if (pen) {
    if (f.pen.own) ops.push({ op: 'macro', entity: ent, macro: 'penetration', arg: 'args', value: pen.join(' ') });
    else rows.push({ entity: ent, path: 'from/projectileDamageTable', value: f.pen.tpl.replace(/%(\d+)/g, (x, i) => pen[+i]), op: 'add' });
  }
  if (h.changed('calibre')) rows.push({ entity: ent, path: 'from/calibre', value: String(h.n('calibre')), op: 'add' });
  if (h.changed('mass')) rows.push({ entity: ent, path: 'from/mass', value: String(h.n('mass')), op: 'add' });
  if (rows.length) ops.unshift({ op: 'set', rows });
  return ops;
}

// ---- ammo: magazines (*.ammo of the small arms folders and bazooka/)
function ammoValues(readStr, key, v) {
  const t = (readStr(key) || '').replace(/;[^\n]*/g, '');
  const ms = /^\s*\{\s*mass\s+([\d.]+)\s*\}/im.exec(t), sz = /\{\s*size\s+(\d+)\s+(\d+)\s*\}/i.exec(t), wt = /\{\s*weight\s+([\d.]+)\s*\}/i.exec(t);
  if (ms) v.mass = +ms[1];
  if (sz) v.isize = sz[1] + ' ' + sz[2];
  v.f_preset = false; v.f_he = false;
  return { root: (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(t) || [])[1] || 'bullet', from: /^\s*\{\s*from\b/m.test(t), weight: wt ? +wt[1] : null };
}
function compileAmmo(h, m, info) {
  const ops = [], rows = [], copies = [];
  const key = h.make ? STUFF + dirOf(m.key) + h.id + (/\.ammo$/.test(h.id) ? '' : '.ammo') : m.key, ent = 'file:' + key;
  // a magazine has no {from}: Make copies it whole (bytes kept) under the new name, the set rows go into the copy
  if (h.make) copies.push({ key: m.key, to: key });
  const root = info.root;
  if (h.changed('strength')) h.notes.push('Strength: a ' + (dirOf(m.key) === 'bazooka/' ? 'launcher round' : 'magazine') + ' has no blast preset of its own, so there is no number to change.');
  if (h.changed('mass')) rows.push({ entity: ent, path: root + '/mass', value: String(h.n('mass')), op: 'add' });
  if (h.changed('isize')) rows.push({ entity: ent, path: root + '/inventory/size', value: String(h.val('isize')).trim().split(/\s+/).join(' '), op: 'add' });
  if (rows.length) ops.push({ op: 'set', rows });
  if (h.make) h.notes.push('A new magazine is used only by a weapon whose {filling ..} names it: change the weapon\'s ammo to it (gun task, ammo).');
  return { ops, copies, key };
}

// ---- the task side: c = the recipe compile ctx, m = values._meta, env = helpers of gunammo.goh.js {source, readStr, L, bad, badK}
function helpers(c, env, idRe, idMsg, m) {
  const v = c.values || {}, val = id => c.value(id);
  const h = { make: c.verb !== 'change', notes: [], bad: env.bad, val, n: id => Number(val(id)),
    changed: id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !env.L().same(val(id), v[id]) };
  h.id = lc(val('id')).trim();
  if (h.make) {
    if (!idRe.test(h.id)) throw env.bad(idMsg);
    if (h.id === m.id) throw env.bad('The id ' + h.id + ' is the id of the one you copy. Pick a new id.');
  }
  return h;
}
function gunTask(c, m, env) {
  const src = env.source(c.gameDir, c.mod);
  if (!src) throw env.badK('task.gun.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the weapon files there.');
  const f = facts(env.readStr(src), m.key);
  if (!f.found) throw env.bad('The weapon ' + m.id + ' was not found in the game or the mod any more. Pick it again (What to copy).');
  const h = helpers(c, env, /^[a-z0-9][a-z0-9_]{1,40}$/, 'The new weapon needs an id: small English letters, digits and _.', m);
  const ops = compileGun(h, m, f);
  if (h.changed('name')) h.notes.push('Name: a GoH weapon name is not written by this task (the new weapon shows its file name); give it a name in the Text task.');
  if (!ops.length) h.notes.push('Nothing to change: no answer differs from the weapon as it is.');
  if (!h.make && !m.inMod && ops.length) h.notes.push('The weapon lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  return { gen: ops.length ? { ops } : null, copies: [], notes: h.notes, result: h.make ? h.id : m.id };
}
function ammoTask(c, m, env) {
  const src = env.source(c.gameDir, c.mod);
  if (!src) throw env.badK('task.ammo.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the ammunition files there.');
  const t = env.readStr(src)(m.key);
  if (t == null) throw env.bad('The magazine ' + m.id + ' was not found in the game or the mod any more. Pick it again (What to copy).');
  const info = ammoValues(env.readStr(src), m.key, {});
  const h = helpers(c, env, /^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'The new magazine needs an id: small English letters, digits and _, parts joined by a dot.', m);
  const r = compileAmmo(h, m, info);
  if (h.changed('name')) h.notes.push('Name: a GoH magazine name is not written by this task; give it a name in the Text task.');
  if (!h.make && !m.inMod && r.ops.length) h.notes.push('The magazine lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  return Object.assign({ gen: r.ops.length ? { ops: r.ops } : null, copies: r.copies, notes: h.notes, result: h.make ? h.id : m.id }, r.copies.length ? { copiesFirst: true } : {});
}

module.exports = { SA_DIRS, MAG_DIRS, CALLS, isSmall, isMag, dirOf, chain, defines, facts, gunValues, compileGun, ammoValues, compileAmmo, gunTask, ammoTask };
