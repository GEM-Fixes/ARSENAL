// recipes "gun" and "ammo", the Gates of Hell branch (game parity 2026-11-23). The AS2 path reads AS2 keys ({rechargeTime},
// ("damage" a()..e()), ("fg" args n)); a GoH cannon keeps its numbers in gun/.presets macro calls and a GoH shell in shell/.presets
// blast calls, so this file reads and writes those (tools/gen/lib/gohgun.js reads a gun through its {from} chain).
//   gun on GoH: cannons only (set/stuff/gun). Make: one gen gun op (reload, speed, range_<n>, accuracy_<x>, pen = a..e of the main
//     shell row, damage = "armor health", health = {healthDamage}); change: gen macro ops on the calls of the gun's own file (the same
//     numbers; pen per shell row, the range moves each row's range(r) and the accuracy ranges) and set rows where the value is a plain
//     key ({rechargeTime}, {healthDamage}, a {parameters "<shell>"} table for a row the file only inherits); what the file only inherits
//     through a macro it cannot add (speed per type, accuracy, damage) is a note.
//   ammo on GoH: shells (set/stuff/shell/*.ammo). Strength = the number of its own ("*_blast" args n) call, HE = weight() filler() of
//     ("he_level_<n>" ..), mass, inventory size. Penetration lives on the gun, not the shell (gun task).
// Small arms (rifle/ smg/ mgun/ pistol/) and their magazines (*.ammo there and in bazooka/): gunammo.gohsa.js.
// Refused on GoH with a plain line in four languages (task.gun.e.goh* / task.ammo.e.goh*): other weapons, grenades, other rounds.
// Every write is [T] (not run in game); the merge of {parameters "<shell>"} blocks over a {from} chain is [I].
// Author: Imperator_Aug (ARSENAL, ia-371ca615)
'use strict';
const fs = require('fs'), path = require('path');
const GG = require('../../../../gen/lib/gohgun');
const L = () => require('./gun.recipe').lib;
const SA = () => require('./gunammo.gohsa');   // small arms and magazines
const STUFF = 'resource/set/stuff/', GUNDIR = STUFF + 'gun/', SHELLDIR = STUFF + 'shell/';
const lc = s => String(s == null ? '' : s).toLowerCase();
const r4 = v => Math.round(v * 10000) / 10000;
const bad = m => Object.assign(new Error(m), { status: 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
// the range_ and accuracy_ defines of vanilla GoH gun/.presets [V GoH data]; the gen gun op checks them against the game's own file
const RANGES = ['160', '170', '180', '190', '200', '210', '220', '160_howitzer', '170_howitzer', '180_howitzer', '190_howitzer', '200_howitzer', '210_howitzer', 'autocannon_12-20', 'autocannon_37-40', 'aircraft_gun'];
const ACCS = ['direct', 'direct_arrowhead', 'direct_auto', 'spg', 'indirect'];
// the questions each task asks on GoH (the rest carry when $game as64|mowas2)
const GUN_Q = ['id', 'reload', 'speed', 'health', 'grange', 'gacc', 'gpen', 'gdamage', 'grpm'];
const AMMO_Q = ['id', 'strength', 'heweight', 'hefiller', 'mass', 'isize'];

const fnOr = (v, d) => { try { return typeof v === 'function' ? v() : (v == null ? d : v); } catch (e) { return d; } };
function gohDirOf(ctx) {
  const t = ctx && ctx.task && ctx.task.kind === 'goh' ? ctx.task.dir : null;
  if (t) return t;
  const d = ctx ? fnOr(ctx.gohDir, null) : null;
  if (d) return d;
  try { return require('../../../../lib/gamedir').goh() || null; } catch (e) { return null; }
}
const isGoh = ctx => L().gidOf(ctx) === 'goh';
// the GoH view (vfs exe goh) + the mod folder, the same shape gun.recipe.js source() gives (keys, stuff, chain, takenId read it)
const SRC = new Map();
function source(dir, mod) {
  if (!dir || !fs.existsSync(dir)) return null;
  let m = ''; try { m = mod && fs.existsSync(mod) && fs.statSync(mod).isDirectory() ? path.resolve(mod) : ''; } catch (e) { m = ''; }
  const k = path.resolve(dir).toLowerCase() + '|' + m.toLowerCase() + '|goh';
  let c = SRC.get(k);
  if (!c || Date.now() - c.t > 60000) {
    const S = require('../../../../lib/sdlset');
    c = { t: Date.now(), s: S.createSource({ gameDir: dir, folder: m || undefined, exe: 'goh' }), stuff: null, mod: m, game: dir, gid: 'goh' };
    SRC.set(k, c); if (SRC.size > 4) SRC.delete(SRC.keys().next().value);
  }
  return c;
}
const srcOf = (ctx, mod) => source(gohDirOf(ctx), mod);
const readStr = c => k => { const b = c.s.get(k); return b ? b.toString('latin1') : null; };
const inMod = (c, key) => !!(c.mod && fs.existsSync(path.join(c.mod, key)));
const ownCalls = (c, key) => GG.calls(readStr(c)(key) || '');

// ---- lookups: files of one folder, by file name words; where = mod or game
function listDir(ctx, words, opt, dir, test) {
  const c = srcOf(ctx, opt && opt.mod); if (!c) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [];
  for (const k of L().stuff(c)) {
    if (!k.startsWith(dir)) continue;
    const rel = k.slice(STUFF.length), file = k.slice(dir.length);
    if (file.includes('/') || /^\.|\.(pattern|inc)$/.test(file) || (test && !test(file))) continue;
    if (ws.length && !ws.every(w => rel.includes(w))) continue;
    out.push({ id: L().tagsOf(k).join(' '), name: file, where: c.s.local.has(k) ? 'mod' : 'game', ref: { key: k }, sub: rel });
  }
  const ex = ws.join('.');
  out.sort((a, b) => (a.name === ex ? 0 : 1) - (b.name === ex ? 0 : 1) || a.sub.localeCompare(b.sub));
  return out;
}
const weapons = (ctx, w, o) => [GUNDIR].concat(SA().SA_DIRS.map(d => STUFF + d)).flatMap(d => listDir(ctx, w, o, d));
const rounds = (ctx, w, o) => [SHELLDIR].concat(SA().MAG_DIRS.map(d => STUFF + d)).flatMap(d => listDir(ctx, w, o, d, f => /\.ammo$/.test(f)));
const idLookup = async (ctx, w, o) => { const c = srcOf(ctx, o && o.mod); return { results: [], exact: !!c && L().takenId(c, w) }; };

// ---- gun: values
function gunValues(ctx, base) {
  const none = { inhands: true, carriers: [], place: 'gun', ammocount: 0, mountq: false, giveq: false };
  const c = srcOf(ctx, ctx && ctx.mod);
  if (!c || !base) return none;
  const key = L().baseKey(c, base);
  if (!key) return none;
  const name = key.slice(key.lastIndexOf('/') + 1);
  const v = Object.assign({}, none, { kindq: 'cannon', id: L().freeId(c, name), name });
  if (SA().isSmall(key)) { const f = SA().gunValues(readStr(c), key, v); v._meta = { id: name, key, kind: 'small', goh: true, inMod: inMod(c, key), chain: f.chain }; return v; }
  if (!key.startsWith(GUNDIR) || name.includes('/')) { v._meta = { id: name, key, kind: 'other', goh: true }; return v; }
  const f = GG.facts(readStr(c), name);
  if (f.reload) v.reload = f.reload.value;
  if (f.speed > 1) v.speed = f.speed;
  if (f.human) v.health = f.human.value;
  if (f.range) v.grange = f.range.preset;
  if (f.accuracy) v.gacc = f.accuracy.name;
  if (f.mainPen) v.gpen = f.mainPen.v.join(' ');
  if (f.armor) v.gdamage = f.armor.value;
  for (const k of ['reload', 'speed', 'health', 'grange', 'gacc', 'gpen', 'gdamage']) v['f_' + k] = v[k] != null;
  v._meta = { id: name, key, kind: 'cannon', goh: true, inMod: inMod(c, key), chain: f.chain, pens: f.pens.map(p => (p.shell || 'plain') + ' ' + p.v.join('/')) };
  return v;
}

// ---- gun: compile
function compileGun(draft, c) {
  const v = c.values || {}, m = v._meta;
  if (!m || !m.key) throw bad('Pick the weapon to copy first (What to copy).');
  if (m.kind === 'small') return SA().gunTask(c, m, { source, readStr, L, bad, badK });
  if (m.kind !== 'cannon') throw badK('task.gun.e.gohdir', 'On Gates of Hell this task makes and changes cannons (set/stuff/gun) only; ' + m.key.slice(STUFF.length) + ' is another kind of weapon. Pick a cannon to copy.');
  const src = source(c.gameDir, c.mod);
  if (!src) throw badK('task.gun.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the gun files there.');
  const f = GG.facts(readStr(src), m.id);
  if (!f.found) throw bad('The gun ' + m.id + ' was not found in the game or the mod any more. Pick it again (What to copy).');
  const make = c.verb !== 'change', notes = [], ops = [];
  const val = id => c.value(id), n = id => Number(val(id));
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !L().same(val(id), v[id]);
  const id = lc(val('id')).trim();
  if (make) {
    if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) throw bad('The new weapon needs an id: small English letters, digits and _.');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the weapon you copy. Pick a new id.');
  }
  const pen = changed('gpen') ? String(val('gpen')).trim().split(/[\s,]+/).map(Number) : null;
  if (pen && (pen.length !== 5 || pen.some(x => !isFinite(x) || x < 0))) throw bad('Penetration: five numbers a b c d e (mm), the main shell row of the gun.');
  if (make) {
    // one gen gun op: {from "<like>"} + the GoH macro lines (gen opGun on GoH, lib/gohgun.js for pen, damage and per type speed)
    const g = { op: 'gun', name: id, like: m.id };
    if (changed('reload')) g.recharge = n('reload');
    if (changed('speed')) g.speed = n('speed');
    if (changed('grange')) g.range = String(val('grange'));
    if (changed('gacc')) g.accuracy = String(val('gacc'));
    if (pen) g.pen = pen.join(' ');
    if (changed('gdamage')) g.damage = n('gdamage');
    if (changed('health')) { g.class = 'cannon'; g.health = n('health'); }
    ops.push(g);
    if (changed('name')) notes.push('Name: a GoH weapon name is not written by this task (the new gun shows its file name); give it a name in the Text task.');
    return { gen: { ops }, copies: [], notes, result: id };
  }
  // change: macro ops on the calls of the gun's own file, set rows for plain keys; the file is copied into the mod when it is the game's
  const key = m.key, ent = 'file:' + key, own = ownCalls(src, key), mac = (macro, arg, value, o) => ops.push(Object.assign({ op: 'macro', entity: ent, macro, arg, value }, o || {}));
  const rows = [], row = (p, value) => rows.push({ entity: ent, path: 'from/' + p, value: String(value), op: 'add' });
  const nthOf = (name, test) => { const hs = own.filter(k => k.name === name); const i = hs.findIndex(test); return hs.length > 1 && i >= 0 ? { nth: i + 1 } : {}; };
  const from = what => notes.push(what + ' comes from ' + (f.chain[1] || 'the gun it copies') + ' (this gun only inherits it), so it was not changed here. Change that gun, or make a new gun from this one (Make).');
  if (changed('reload')) { if (f.reload && f.reload.own && !f.reload.plain) mac('reload time', 'seconds', n('reload')); else row('rechargeTime', n('reload')); }
  if (changed('health')) { if (f.human && f.human.own) mac('human health', 'damage', n('health')); else row('healthDamage', n('health')); }
  if (changed('speed')) {
    const vl = f.velocity;
    if (vl && vl.own && vl.kind === 'mps') mac('velocity', 'mps', n('speed'));
    else if (vl && vl.own) {
      const k = f.speed ? n('speed') / f.speed : 1;
      for (const [t, x] of Object.entries(vl.types)) if (x > 1) mac('velocity m/s', t, Math.round(x * k));
      for (const [s, g] of Object.entries(f.gv || {})) if (g.own) mac('global velocity', 'gv', Math.round(g.value * k), nthOf('global velocity', x => x.inParams === s));
      notes.push('Shell speed: every ammo type x ' + r4(k) + ' (their differences kept).');
    } else from('The shell speed');
  }
  if (changed('gdamage')) {
    if (f.armor && f.armor.own) {
      const k = f.armor.value ? n('gdamage') / f.armor.value : 1;
      mac('armor health', 'damage', n('gdamage'));
      for (const cu of f.armorCustom) if (cu.own && cu.damage !== undefined) mac('armor health custom', 'damage', r4(cu.damage * k), { match: 'shell(' + cu.shell + ')' });
    } else from('The damage to vehicles ("armor health")');
  }
  // range: the range_<n> call renamed; each own shell row's range(r) and the accuracy ranges move by new n - old n
  let shift = null;
  if (changed('grange')) {
    const to = String(val('grange')), rn = /^(\d+)/.exec(to);
    if (f.range && f.range.own) {
      ops.push({ op: 'macro', entity: ent, macro: 'range_' + f.range.preset, rename: 'range_' + to });
      if (rn && f.rangeN) shift = r => Math.max(1, r + (+rn[1] - f.rangeN));
      if (shift && f.accuracy && f.accuracy.own) for (const [k, x] of f.accuracy.args) if (/^range_(ap|he|heat)$/.test(k) && /^\s*\d+(\.\d+)?\s*$/.test(x)) mac('accuracy_' + f.accuracy.name, k, Math.round(shift(+x)));
    } else from('The range');
  }
  if (changed('gacc')) {
    if (f.accuracy && f.accuracy.own) { ops.push({ op: 'macro', entity: ent, macro: 'accuracy_' + f.accuracy.name, rename: 'accuracy_' + String(val('gacc')) }); notes.push('Accuracy: the call keeps its own values (r1, range_ap, range_he, range_heat); a curve that needs more (indirect: r2, rmax) stops the write with the missing names.'); }
    else from('The accuracy');
  }
  // penetration: own rows by macro (a..e, range), inherited rows as a {parameters "<shell>"} table of the same curve
  if (pen || shift) {
    const ratio = pen && f.mainPen && f.mainPen.v[0] > 0 ? pen[0] / f.mainPen.v[0] : 1;
    let rws = GG.scalePens(f.pens, ratio, shift);
    if (pen) rws = rws.map((p, i) => i === 0 ? Object.assign({}, p, { v: pen.map(Math.round) }) : p);
    if (pen && !f.mainPen) notes.push('Penetration: this gun calls no penetration row in its chain, so there is no table to change.');
    rws.forEach((p, i) => {
      const o = f.pens[i], match = o.shell ? { match: 'shell(' + o.shell + ')' } : {};
      if (o.own) {
        if (pen) ['a', 'b', 'c', 'd', 'e'].forEach((l, j) => { if (p.v[j] !== o.v[j]) mac(o.macro, l, p.v[j], match); });
        if (shift && o.shell && p.range !== o.range) { mac(o.macro, 'range', p.range, match); if (p.macro !== o.macro) ops.push(Object.assign({ op: 'macro', entity: ent, macro: o.macro, rename: p.macro }, match)); }
      } else if (pen) {
        const tbl = GG.penTable(p).map(([d, x]) => '{' + d + ' ' + x + '}').join(' ');
        if (o.shell) rows.push({ entity: ent, path: 'from/parameters', value: '"' + o.shell + '" {projectileDamageTable ' + tbl + '}' + (p.range ? ' {range ' + p.range + ' ' + p.range + '}' : ''), op: 'add' });
        else row('projectileDamageTable', tbl);
      }
    });
    if (pen && f.pens.some(o => !o.own)) notes.push('Penetration: rows this gun only inherits are written as {parameters "<shell>"} tables of the same curve (gun/.presets) in its own file [I].');
    if (shift && f.pens.some(o => !o.own && o.shell)) notes.push('Range: shell rows this gun only inherits keep their own reach (range(r)); set the penetration too to write them here.');
  }
  if (rows.length) ops.unshift({ op: 'set', rows });
  if (!ops.length) notes.push('Nothing to change: no answer differs from the gun as it is.');
  if (!m.inMod && ops.length) notes.push('The gun lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  return { gen: ops.length ? { ops } : null, copies: [], notes, result: m.id };
}

// ---- ammo: values
const BLAST = /\(\s*"([a-z_]+_blast)"\s+args\s+([\d.]+)\s*\)/i, HE = /\(\s*"(he_level_\d+)"\s+weight\(\s*([\d.]+)\s*\)\s+filler\(\s*([\d.]+)\s*\)\s*\)/i;
function ammoValues(ctx, base) {
  const none = { carriers: [], count: 10, giveq: false };
  const c = srcOf(ctx, ctx && ctx.mod);
  if (!c || !base) return none;
  const key = L().baseKey(c, base);
  if (!key) return none;
  const name = key.slice(key.lastIndexOf('/') + 1), id = name.replace(/\.ammo$/, '');
  const v = Object.assign({}, none, { id: L().freeId(c, id), name: id });
  if (SA().isMag(key)) { SA().ammoValues(readStr(c), key, v); v._meta = { id, key, kind: 'mag', goh: true, inMod: inMod(c, key) }; return v; }
  if (!key.startsWith(SHELLDIR) || !/\.ammo$/.test(name)) { v._meta = { id, key, kind: 'other', goh: true }; return v; }
  const own = readStr(c)(key) || '', bm = BLAST.exec(own), hm = HE.exec(own);
  const ch = L().chain(c, key), sz = L().vals(L().node(ch, 'inventory/size'));
  if (bm) v.strength = Number(bm[2]);
  if (hm) { v.heweight = Number(hm[2]); v.hefiller = Number(hm[3]); }
  const ms = L().num(ch, 'mass'); if (ms != null) v.mass = ms;
  if (sz.length >= 2) v.isize = sz.slice(0, 2).join(' ');
  v.f_preset = !!bm; v.f_he = !!hm;
  v._meta = { id, key, kind: 'shell', goh: true, inMod: inMod(c, key), preset: bm ? { name: lc(bm[1]), args: Number(bm[2]) } : null, he: hm ? lc(hm[1]) : null };
  return v;
}
function compileAmmo(draft, c) {
  const v = c.values || {}, m = v._meta;
  if (!m || !m.key) throw bad('Pick the ammunition to copy first (What to copy).');
  if (m.kind === 'mag') return SA().ammoTask(c, m, { source, readStr, L, bad, badK });
  if (m.kind !== 'shell') throw badK('task.ammo.e.gohdir', 'On Gates of Hell this task makes and changes cannon shells (set/stuff/shell/*.ammo) only; ' + m.key.slice(STUFF.length) + ' is another kind of round. Pick a shell to copy.');
  if (!source(c.gameDir, c.mod)) throw badK('task.ammo.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the shell files there.');
  const make = c.verb !== 'change', notes = [], ops = [];
  const val = id => c.value(id), n = id => Number(val(id));
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !L().same(val(id), v[id]);
  const id = lc(val('id')).trim();
  if (make) {
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(id)) throw bad('The new ammunition needs an id: small English letters, digits and _, parts joined by a dot (bulletrus_100.aphe2).');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the ammunition you copy. Pick a new id.');
  }
  const key = make ? SHELLDIR + id + (id.split('.').includes('ammo') ? '' : '.ammo') : m.key, ent = 'file:' + key;
  const macros = [], rows = [];
  if (make) {
    const so = { op: 'shell', id, like: L().tagsOf(m.key).join(' ') };
    if (changed('strength')) { if (m.preset) so.args = n('strength'); else notes.push('Strength: the shell you copy calls no blast preset ("*_blast" args n), so there is no number to change.'); }
    if (changed('mass')) so.mass = n('mass');
    ops.push(so);
  } else {
    if (changed('strength')) { if (m.preset) macros.push({ op: 'macro', entity: ent, macro: m.preset.name, arg: 'args', value: n('strength') }); else notes.push('Strength: this shell calls no blast preset of its own, so there is no number to change.'); }
    if (changed('mass')) rows.push({ entity: ent, path: 'from/mass', value: String(n('mass')), op: 'add' });
  }
  for (const [q, a] of [['heweight', 'weight'], ['hefiller', 'filler']]) if (changed(q)) {
    if (m.he) macros.push({ op: 'macro', entity: ent, macro: m.he, arg: a, value: n(q) });
    else notes.push('HE: the shell calls no ("he_level_<n>" weight() filler()) of its own, so ' + a + ' was not changed.');
  }
  if (changed('isize')) rows.push({ entity: ent, path: 'from/inventory/size', value: String(val('isize')).trim().split(/\s+/).join(' '), op: 'add' });
  if (rows.length) ops.push({ op: 'set', rows });
  ops.push(...macros);
  if (changed('name')) notes.push('Name: a GoH shell name is not written by this task; give it a name in the Text task.');
  if (!make && !m.inMod && ops.length) notes.push('The shell lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  notes.push('Penetration of a GoH shell is set on each gun ("penetration_*" rows per shell type): the gun task changes it.');
  return { gen: ops.length ? { ops } : null, copies: [], notes, result: make ? id : m.id };
}

module.exports = { RANGES, ACCS, GUN_Q, AMMO_Q, gohDirOf, isGoh, source, weapons, rounds, idLookup, gunValues, compileGun, ammoValues, compileAmmo };
