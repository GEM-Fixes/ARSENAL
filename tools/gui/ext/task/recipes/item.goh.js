// recipe "item", the Gates of Hell branch (game parity 2026-11-23): copy or change a carried thing under set/stuff/ and hand it to
// soldiers. Read on the GoH install [V 2026-11-23]: the items are files under resource/set/stuff/<folder>/.. named
// <name>[.<kind>] (grenade/anti-tank grenade/rpg43.grenade, med/bandage_eng, explosive/dynamite_ger_x3); the file name words are
// the item's tags, so a breed names it by them ({item "rpg43 grenade" 2}); a file is {item ..} / {grenade ..} or {from "<tags>" ..}
// (a copy of another stuff, nearest in the same folder first: units/kit.js buildTable). Soldiers get items only from the
// {inventory} of their breed file resource/set/breed/mp/<army>/<period>/<name>.set: a line {item "<tags>" count [spread]}, an unknown
// name adds nothing (GHED-33). Make: the copied file under the new name beside the like (a staged copy, bytes and CRLF kept; mass,
// inventory weight and size edited in place). Change: the item's file copied into the mod and edited there. Hand out: the Units
// page's kit edit (POST /api/x/units/kit/set, gen kit op, the grid checked) per soldier, through this recipe's route
// POST /api/x/task/r/item/gohgive (a new item is not in the game yet at Preview: its lines are checked at Write). The name players
// see is a .pot text (the text task); not asked here. Every item in game is [T].
// Author: Imperator_Aug (ARSENAL, ia-b1fc03c4)
'use strict';
const fs = require('fs'), path = require('path');

const STUFF = 'resource/set/stuff/', BREED = 'resource/set/breed/mp/';
const DIRS = ['grenade', 'explosive', 'med', 'special', 'melee', 'capacity', 'content', 'head', 'body'];
const SPEC = /^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const AG = () => require('./army.goh'), K = () => require('../../units/kit');
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const r4 = v => Math.round(Number(v) * 10000) / 10000;
const NOGOH = () => badK('task.item.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');

// the item table of the game plus the mod (kit.js: tags, inherited size and weight), kept on the reader
async function table(g) {
  if (!g._itemTable) g._itemTable = await K().buildTable(g.keys(/^resource\/set\/stuff\//), k => g.readStr(k));
  return g._itemTable;
}
const carried = x => !x.pattern && DIRS.includes(x.top);
const relOf = key => key.slice(STUFF.length);

// lookups on the GoH tab
async function lookThing(ctx, words, opt) {
  const g = AG().reader(gohDir(ctx), (opt && opt.mod) || ctx.mod); if (!g) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [];
  for (const x of await table(g)) {
    if (!carried(x)) continue;
    const hay = lc(relOf(x.key) + ' ' + x.name);
    if (ws.every(w => hay.includes(w))) out.push({ id: x.key, name: x.name, where: x.key, ref: { key: x.key }, sub: relOf(x.key).split('/').slice(0, -1).join('/') });
    if (out.length >= ((opt && opt.limit) || 60)) break;
  }
  return out;
}
// soldiers as army/period/name (the breed files of the multiplayer armies)
function lookBreed(ctx, words, opt) {
  const g = AG().reader(gohDir(ctx), (opt && opt.mod) || ctx.mod); if (!g) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [];
  for (const k of g.keys(/^resource\/set\/breed\/mp\/[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+\.set$/).sort()) {
    const id = k.slice(BREED.length, -4);
    if (ws.every(w => id.includes(w))) out.push({ id, name: id.split('/').pop(), where: k, ref: { key: k }, sub: id.split('/').slice(0, 2).join(' ') });
    if (out.length >= ((opt && opt.limit) || 60)) break;
  }
  return out;
}
// a new item name is free when no stuff file of the game or mod has that file name
async function lookNew(ctx, words, opt) {
  const g = AG().reader(gohDir(ctx), (opt && opt.mod) || ctx.mod), w = lc(words).trim(); if (!g || !w) return [];
  return (await table(g)).filter(x => x.tags[0] === w).slice(0, 5).map(x => ({ id: w, name: x.name, where: x.key, ref: { key: x.key }, sub: '' }));
}

// the item's own file: {mass}, {inventory {size} {weight}} as numbers it names itself
function ownOf(text) {
  const t = String(text || ''), inv = blockAt(t, 'inventory');
  const one = (s, re) => { const m = re.exec(s); return m ? m : null; };
  const mass = one(t, /\{\s*mass\s+([-\d.]+)\s*\}/i);
  const iv = inv ? t.slice(inv.a, inv.b + 1) : '';
  const size = inv && one(iv, /\{\s*size\s+(\d+)\s+(\d+)\s*\}/i), weight = inv && one(iv, /\{\s*weight\s+([-\d.]+)\s*\}/i);
  return { mass: mass ? Number(mass[1]) : null, size: size ? size[1] + ' ' + size[2] : null, weight: weight ? Number(weight[1]) : null, inventory: !!inv };
}
// the first {<name> block of the text (not in a comment): {a: index of '{', b: index of its '}'}
function blockAt(t, name) {
  const re = new RegExp('\\{\\s*' + name + '\\b', 'gi'); let m;
  while ((m = re.exec(t))) {
    const ls = t.lastIndexOf('\n', m.index) + 1; if (t.slice(ls, m.index).includes(';')) continue;
    let d = 0;
    for (let i = m.index; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') { const j = t.indexOf('"', i + 1); if (j < 0) break; i = j; continue; }
      if (ch === ';') { const j = t.indexOf('\n', i); if (j < 0) break; i = j; continue; }
      if (ch === '{') d++; else if (ch === '}' && --d === 0) return { a: m.index, b: i };
    }
  }
  return null;
}

// values on the GoH tab
async function values(ctx, base, opt) {
  const none = { carriers: [], count: 1, giveq: false, f_mass: false, f_inv: false };
  const g = AG().reader(gohDir(ctx), ctx && ctx.mod); if (!g || !base) return none;
  const key = (base.ref && base.ref.key) || base.id;
  if (!key || !String(key).startsWith(STUFF)) return none;
  const T = await table(g), x = T.find(y => y.key === key); if (!x) return none;
  const text = g.readStr(key) || '', own = ownOf(text), base0 = key.slice(key.lastIndexOf('/') + 1), ext = base0.includes('.') ? base0.slice(base0.indexOf('.')) : '';
  const id0 = base0.slice(0, base0.length - ext.length), taken = new Set(T.map(y => y.tags[0]));
  let id = id0 + '_2', n = 3; while (taken.has(id)) id = id0 + '_' + n++;
  const opt2 = opt || {};
  const v = { id, mass: own.mass != null ? own.mass : undefined, isize: x.sized ? x.w + ' ' + x.h : undefined, weight: x.weight, carriers: [], count: 1, giveq: false,
    f_mass: own.mass != null || opt2.verb !== 'change', f_inv: true };
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  v._meta = { goh: true, key, id: id0, ext, dir: key.slice(STUFF.length, key.lastIndexOf('/')), item: x.name, own, inMod: !!(g.scanDisk && g.scanDisk().has(key)) };
  return v;
}

// the edits of one item file text: {mass, size, weight} (null = kept) -> {text, notes}
function editText(text, e, from) {
  let t = String(text), notes = [];
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const afterRoot = line => {
    const i = t.search(/\{/); if (i < 0) throw bad('The item file has no block to change.');
    const nl = t.indexOf('\n', i); if (nl < 0) throw bad('The item file is one line; change it in a text editor.');
    t = t.slice(0, nl + 1) + '\t' + line + eol + t.slice(nl + 1);
  };
  if (e.mass != null) {
    if (/\{\s*mass\s+[-\d.]+\s*\}/i.test(t)) t = t.replace(/(\{\s*mass\s+)[-\d.]+(\s*\})/i, (m, a, b) => a + r4(e.mass) + b);
    else afterRoot('{mass ' + r4(e.mass) + '}');
  }
  if (e.size != null || e.weight != null) {
    const inv = blockAt(t, 'inventory');
    if (inv) {
      let iv = t.slice(inv.a, inv.b + 1);
      if (e.size != null) iv = /\{\s*size\s+\d+\s+\d+\s*\}/i.test(iv) ? iv.replace(/(\{\s*size\s+)\d+\s+\d+(\s*\})/i, (m, a, b) => a + e.size + b) : iv.slice(0, -1).replace(/\s*$/, '') + ' {size ' + e.size + '}' + iv.slice(-1);
      if (e.weight != null) iv = /\{\s*weight\s+[-\d.]+\s*\}/i.test(iv) ? iv.replace(/(\{\s*weight\s+)[-\d.]+(\s*\})/i, (m, a, b) => a + r4(e.weight) + b) : iv.slice(0, -1).replace(/\s*$/, '') + ' {weight ' + r4(e.weight) + '}' + iv.slice(-1);
      t = t.slice(0, inv.a) + iv + t.slice(inv.b + 1);
    } else {
      afterRoot('{inventory' + (e.size != null ? ' {size ' + e.size + '}' : '') + (e.weight != null ? ' {weight ' + r4(e.weight) + '}' : '') + '}');
      notes.push('The item takes its inventory block from ' + (from || 'the file it copies') + '; its own new block names only the size and weight, the rest is kept from there [I]. Check it in game [T].');
    }
  }
  return { text: t, notes };
}

// compile on GoH
function compile(draft, c) {
  const v = c.values || {}, m = v._meta;
  if (!c.gameDir) throw NOGOH();
  if (!m || !m.goh || !m.key) throw bad('Pick the item to copy first (What to copy).');
  const g = AG().reader(c.gameDir, c.mod), text = g && g.readStr(m.key);
  if (text == null) throw bad('The item ' + m.key + ' is not there any more. Pick it again.');
  const make = c.verb !== 'change', notes = [], copies = [], calls = [];
  const val = id => c.value(id), changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && String(val(id)).trim() !== String(v[id] == null ? '' : v[id]).trim();
  const id = lc(val('id') || '').trim();
  if (make) {
    if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) throw bad('The new item needs an id: small English letters, digits and _.');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the item you copy. Pick a new id.');
    if (g.keys(new RegExp('^' + STUFF.replace(/\//g, '\\/') + '.*\\/' + id + '(\\.[^/]*)?$')).length) throw bad('There is already an item named ' + id + '. Gates of Hell finds an item by its file name words, so pick another id.');
  }
  const e = { mass: changed('mass') ? Number(val('mass')) : null, size: changed('isize') ? String(val('isize')).trim().split(/\s+/).join(' ') : null, weight: changed('weight') ? Number(val('weight')) : null };
  if (e.mass != null && !(e.mass > 0)) throw bad('The mass is more than 0 kg.');
  if (e.weight != null && !(e.weight >= 1)) throw bad('The inventory weight is at least 1.');
  if (e.size != null && !/^[1-6] [1-6]$/.test(e.size)) throw bad('The inventory size is two numbers of 1 to 6: width height, like 2 1.');
  const from = (/^\s*\{\s*from\s+"([^"]+)"/m.exec(text) || [])[1] || '';
  const ed = editText(text, e, from); notes.push(...ed.notes);
  const key = make ? STUFF + m.dir + '/' + id + m.ext : m.key, item = make ? [id].concat(m.ext.split('.').filter(Boolean)).join(' ') : m.item;
  if (make || ed.text !== text) {
    const rel = 'gohitem/' + key.slice(STUFF.length), f = path.join(c.staging, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(ed.text, 'latin1'));
    copies.push({ staged: rel, to: key });
    notes.push(make ? 'The new item ' + key + ' is a copy of ' + m.key + (ed.text !== text ? ', with the changed numbers' : '') + '; soldiers name it "' + item + '". Check it in game [T].'
      : (m.inMod ? 'The item file of your mod is changed.' : 'The item lives in the game: its file is copied whole into your mod and changed there (an override).'));
  }
  if (make || changed('name')) notes.push('The name players see is a .pot text of Gates of Hell: write it with the text task.');
  const breeds = val('giveq') === true ? [].concat(val('carriers_goh') || []).map(x => lc(x).trim()).filter(Boolean) : [];
  const count = Number(val('count')) > 0 ? Math.round(Number(val('count'))) : 1;
  if (breeds.length) {
    for (const b of breeds) if (!SPEC.test(b)) throw bad('Pick each soldier from the list: army/period/name, like ger/early/rifleman.');
    calls.push({ route: 'POST /api/x/task/r/item/gohgive', body: { item, count, breeds, fresh: make }, dryFlag: 'write' });
    notes.push(breeds.length + ' soldier(s) get ' + count + ' x "' + item + '" in their breed inventory (the Units page kit edit, the grid checked). Check it in game [T].');
  }
  if (!copies.length && !calls.length) notes.push('Nothing differs from ' + m.key + ': there is nothing to write.');
  return { gen: null, copies, calls, notes, result: make ? id : m.id };
}

// own route: POST /api/x/task/r/item/gohgive {mod, item, count, breeds, fresh, write}: each soldier through the Units page kit edit
// (gen kit op on the breed file); a fresh item (made by this task, copied at Write before this call) is not in the game at Preview,
// so the dry run names the breed files only
async function giveRoute(url, b, ctx) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), item = lc(b.item).trim(), count = Math.round(Number(b.count) || 1);
  if (!/^[a-z0-9_][a-z0-9_ ]{0,80}$/.test(item)) throw bad('Pick the item first.');
  if (!(count >= 1 && count <= 100)) throw bad('The count is 1 to 100.');
  const breeds = (Array.isArray(b.breeds) ? b.breeds : []).map(x => lc(x).trim()).filter(Boolean).slice(0, 60);
  if (!breeds.length || breeds.some(x => !SPEC.test(x))) throw bad('Pick each soldier from the list: army/period/name.');
  const dir = gohDir(ctx); if (!dir) throw NOGOH();
  if (b.write) { const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'give the item' }); if (why) throw bad(why); if (ctx.job) ctx.job.writes = true; }
  const files = BREEDS => BREEDS.map(x => BREED + x + '.set');
  if (!b.write && b.fresh) return { ok: true, files: files(breeds), rows: breeds.map(x => ({ breed: x, item, count, checked: false })) };
  const kitSet = require('../../units/server').routes['POST /api/x/units/kit/set'], rows = [], out = [];
  for (const x of breeds) {
    const r = await kitSet(url, { gid: 'goh', game: dir, mod, breed: x, add: [{ item, count }], write: !!b.write }, ctx);
    if (r.errors && r.errors.length) throw bad('Soldier ' + x + ': ' + r.errors.map(e => e.msg).join(' ').slice(0, 300));
    rows.push({ breed: x, item, count, rows: r.rows || [] });
    for (const f of r.files || []) out.push(f.file || f);
  }
  return { ok: true, wrote: !!b.write, files: out.length ? out : files(breeds), rows };
}

module.exports = { DIRS, table, lookThing, lookBreed, lookNew, values, ownOf, editText, compile, giveRoute };
