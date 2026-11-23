// recipe "armour", the Gates of Hell branch (game parity 2026-11-23): change the per-part armour of one GoH vehicle or gun. GoH keeps
// armour per hit volume in the vehicle's def and the files it includes ({volume "body1" {thickness 30 {front 80}}}, shield macro
// lines, (".." thickness(N)) group lines), read and planned by tools/lib/goharmour.js, the same reader the Units page (Change, Armour)
// and the Models page use. The AS64 steps on GoH:
//   armour preset (armor_* macros)       -> the armour class: a preset of properties/armor.ext called by the unit, like
//                                           ("tank_heavy_tier1"), swapped for another of its *_durability family (gohpreset)
//   armour lines (armor_* areas, mm)     -> every part at once as a percent (gohpct, goharmour plan scale)
//   hit volume thickness, side mm        -> one line per part: name base mm, then the sides that differ (gohparts); a side kept
//                                           at the old base while the base changes gets a block of its own in the same run
//   repair time                          -> repair(N) of the group lines (gohrepair: "tracks 40")
//   volume keys                          -> CastSteel, HighHardness, Quality, material, density, able flags (gohvolx)
//   hull material                        -> the def's own {props} words steel / wood (gohmaterial)
//   part flags (break_by_pierce)         no GoH form: the game's part reader takes no flags and no game vehicle has one: refused
// (the forms and their counts in the vanilla files: tools/lib/goharmour.js header)
// The base is the unit's def, picked from the GoH vehicle defs (resource/entity/-vehicle/.., wrecks under x/ left out). The write is
// this recipe's own route POST /api/x/task/r/armour/goh {mod, def, change, write}: plan again on the game plus the mod, then every
// target guarded (lib/modwrite guardFile: inside the mod, links followed), a restore point per file (lib/modwrite restorePoints, the
// Files page form) and the files written (lib/modwrite writeFiles). A game file is copied whole into the mod and changed there; a
// file shared with other units is copied next to this unit and its include pointed at the copy (goharmour). Every number in game is [T].
// Author: Imperator_Aug (ARSENAL, ia-7281eaad)
'use strict';
const fs = require('fs'), path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const GA = () => require('../../../../lib/goharmour');
const UA = () => require('../../units/goharmour');
const MW = () => require('../../../../lib/modwrite');
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const NOGOH = () => badK('task.armour.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the unit file of the vehicle.');
const ROUTE = 'POST /api/x/task/r/armour/goh';
const DEF_RE = /^resource\/entity\/[a-z0-9_\-[\]\/.#+ ]+\.def$/;
const VEH_RE = /^resource\/entity\/-vehicle\/.*\.def$/;
const modOk = m => (m && typeof m === 'string' && fs.existsSync(m) ? m : null);
const srcOf = (dir, mod) => GA().sourceOf(dir, modOk(mod));
const unitOf = def => def.slice(def.lastIndexOf('/') + 1).replace(/\.def$/, '');
const tidy = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');

// lookup "vehicle" on the GoH tab: the vehicle and gun defs of the game plus the mod (no wreck views)
function look(ctx, words, opt) {
  const dir = gohDir(ctx); if (!dir) return [];
  const src = srcOf(dir, (opt && opt.mod) || (ctx && ctx.mod)), ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [];
  for (const k of src.keys(VEH_RE)) {
    if (/\/x\//.test(k)) continue;
    const rel = k.slice('resource/entity/-vehicle/'.length);
    if (!ws.every(w => rel.includes(w))) continue;
    out.push({ id: unitOf(k), name: unitOf(k), where: src.inMod(k) ? 'mod' : 'game', ref: { key: k }, sub: rel.slice(0, rel.lastIndexOf('/')) });
    if (out.length >= ((opt && opt.limit) || 60)) break;
  }
  return out;
}
function defOf(src, base) {
  const k = lc(base && base.ref && base.ref.key);
  if (k && DEF_RE.test(k) && !k.split('/').includes('..') && src.read(k)) return k;
  const id = lc(base && base.id).replace(/\.def$/, '');
  return /^[a-z0-9_\-#+.]+$/.test(id) ? src.defOf(id) : null;
}
const lineOf = p => tidy(p.name + ' ' + UA().valueOf(p));
// one line per volume key: "body1 caststeel 0.8063", "turret1 able.holed 1"
const volxLines = R => [].concat(...R.volx.map(v => GA().volLines(v).map(l => v.name + ' ' + l)));

// values on the GoH tab
async function values(ctx, base) {
  const none = { gohpct: 100, gohparts: [], gohrepair: [], gohvolx: [] };
  const dir = gohDir(ctx); if (!dir || !base) return none;
  const src = srcOf(dir, ctx && ctx.mod), def = defOf(src, base);
  if (!def) return none;
  const R = GA().read(src, def);
  if (!R.files.length) return none;
  const out = { gohpct: 100, gohparts: R.parts.map(lineOf), gohrepair: R.repairs.map(r => r.name + ' ' + r.value), gohvolx: volxLines(R),
    _goh: { def, unit: unitOf(def), parts: R.parts.map(p => ({ name: p.name, kind: p.kind, shared: !!p.shared })), presets: R.preset ? R.preset.options : [], problems: R.problems.slice(0, 10) } };
  if (R.preset) out.gohpreset = R.preset.name;
  if (R.material.words.length === 1) out.gohmaterial = R.material.value;
  return out;
}

// the part a line names: the longest part name the line starts with (a name followed by a space)
function partOf(R, line) {
  const l = lc(line);
  return R.parts.filter(p => l === lc(p.name) || l.startsWith(lc(p.name) + ' ')).sort((a, b) => b.name.length - a.name.length)[0] || null;
}
// the changed lines of gohparts as goharmour set rows [{part, side, mm}]
function setsFrom(R, baseLines, lines, unit) {
  const seen = new Set((baseLines || []).map(x => lc(tidy(x)))), out = [];
  for (const raw of lines) {
    const l = tidy(raw);
    if (!l || seen.has(lc(l))) continue;
    const p = partOf(R, l);
    if (!p) throw bad('"' + l.split(' ')[0] + '" is not an armoured part of ' + unit + '. Its parts: ' + (R.parts.map(q => q.name).join(', ') || 'none') + '.');
    const rest = l.slice(p.name.length).trim();
    const want = UA().setsOf(p.name, rest);
    if (p.kind !== 'volume') {
      if (want.length !== 1 || (want[0].side !== 'all' && want[0].side !== 'base')) throw bad(p.name + ' has one number for every side (' + (p.macro || 'macro') + ' line): write the name and one number, like ' + p.name + ' 20.');
      if (want[0].mm !== p.base) out.push({ part: p.name, side: 'all', mm: want[0].mm });
      continue;
    }
    if (want.length === 1 && want[0].side === 'all') { out.push({ part: p.name, side: 'all', mm: want[0].mm }); continue; }
    let nb = p.base; const named = {};
    for (const s of want) { if (s.side === 'base' || s.side === 'all') nb = s.mm; else named[s.side] = s.mm; }
    if (nb == null) throw bad(p.name + ': write the millimetres for every side first, like ' + p.name + ' 30, front 80.');
    if (nb !== p.base) out.push({ part: p.name, side: 'base', mm: nb });
    for (const s of GA().SIDES) {
      const target = named[s] != null ? named[s] : nb, after = p.own.includes(s) ? p.sides[s] : nb;
      if (target === after) continue;
      // a side kept at the old base while the base changes: goharmour gives it a block of its own in the same run
      out.push({ part: p.name, side: s, mm: target });
    }
  }
  return out;
}
// the changed lines of gohrepair as goharmour repair rows [{part, s}]
function repairsFrom(R, baseLines, lines, unit) {
  const seen = new Set((baseLines || []).map(x => lc(tidy(x)))), out = [];
  for (const raw of lines) {
    const l = tidy(raw);
    if (!l || seen.has(lc(l))) continue;
    const m = /^(\S+) (\d+(?:\.\d+)?)$/.exec(l);
    if (!m) throw bad('Write each repair time as: part seconds, for example tracks 40.');
    if (!R.repairs.some(r => lc(r.name) === lc(m[1]))) throw bad('"' + m[1] + '" has no repair time of its own in the files of ' + unit + '. Parts with one: ' + (R.repairs.map(r => r.name).join(', ') || 'none') + '.');
    out.push({ part: m[1], s: +m[2] });
  }
  return out;
}
// the changed lines of gohvolx as goharmour volx rows [{part, key, value}]; a line taken away takes that key away (value none)
function volxFrom(R, baseLines, lines, unit) {
  const base = new Map(), now = new Map(), out = [];
  const keyOf = (l, strict) => {
    const m = /^(\S+) (caststeel|highhardness|quality|material|density|able\.[a-z_]+) (\S+)$/i.exec(l);
    if (!m && strict) throw bad('Write each volume key as: volume key value, for example body1 caststeel 0.8. Keys: caststeel, highhardness, quality, material, density, able.<flag>.');
    return m ? { id: lc(m[1]) + ' ' + lc(m[2]), part: m[1], key: lc(m[2]), value: lc(m[3]) } : null;
  };
  for (const x of baseLines || []) { const k = keyOf(tidy(x), false); if (k) base.set(k.id, k); }
  for (const raw of lines) { const l = tidy(raw); if (!l) continue; const k = keyOf(l, true); now.set(k.id, k); }
  for (const [id, k] of now) {
    if (!R.volx.some(v => lc(v.name) === lc(k.part))) throw bad('"' + k.part + '" is not a volume written in the files of ' + unit + '. Its volumes: ' + (R.volx.map(v => v.name).join(', ') || 'none') + '.');
    if (!base.has(id) || base.get(id).value !== k.value) out.push({ part: k.part, key: k.key, value: k.value });
  }
  for (const [id, k] of base) if (!now.has(id)) out.push({ part: k.part, key: k.key, value: 'none' });
  return out;
}
function changeOf(c, R, v) {
  const ch = {}, pct = c.kept('gohpct') ? null : c.value('gohpct');
  if (pct != null && pct !== '' && Number(pct) !== 100) {
    const k = Number(pct);
    if (!(k >= 5 && k <= 1000)) throw bad('The armour percent is 5 to 1000 (120 = 20 percent thicker, 100 keeps it).');
    ch.scale = k / 100;
  }
  if (!c.kept('gohparts')) {
    const sets = setsFrom(R, v.gohparts, [].concat(c.value('gohparts') || []).map(String), v._goh.unit);
    if (sets.length) ch.set = sets;
  }
  if (!c.kept('gohrepair')) { const r = repairsFrom(R, v.gohrepair, [].concat(c.value('gohrepair') || []).map(String), v._goh.unit); if (r.length) ch.repair = r; }
  if (!c.kept('gohvolx')) { const r = volxFrom(R, v.gohvolx, [].concat(c.value('gohvolx') || []).map(String), v._goh.unit); if (r.length) ch.volx = r; }
  if (!c.kept('gohpreset')) { const p = lc(tidy(c.value('gohpreset'))); if (p && p !== lc(v.gohpreset || '')) ch.preset = p; }
  if (!c.kept('gohmaterial')) { const m = lc(c.value('gohmaterial')); if (m && m !== lc(v.gohmaterial || '')) ch.material = m; }
  return ch;
}

// compile on GoH: one call to the own route (its dry run names the files, so each gets a restore point before the real call)
function compile(draft, c) {
  if (!c.gameDir) throw NOGOH();
  const v = c.values || {}, m = v._goh;
  if (!m || !m.def) throw bad('Pick the vehicle first (What to change).');
  const src = srcOf(c.gameDir, c.mod), R = GA().read(src, m.def);
  if (!R.files.length) throw bad('The unit file ' + m.def + ' is not there any more. Pick the vehicle again.');
  const notes = [], calls = [], ch = changeOf(c, R, v);
  if (!Object.keys(ch).length) { notes.push('Nothing differs from the armour of ' + m.unit + ': there is nothing to write.'); return { gen: null, copies: [], calls, notes, result: m.unit }; }
  const P = GA().plan(src, R, ch, {});
  if (!P.ok) throw bad(P.reason);
  if (P.nothing) { notes.push('The numbers are the ones ' + m.unit + ' has now: there is nothing to write.'); return { gen: null, copies: [], calls, notes, result: m.unit }; }
  calls.push({ route: ROUTE, body: { def: m.def, change: ch }, dryFlag: 'write' });
  notes.push(P.rows.length + ' armour number(s) of ' + m.unit + ' change in ' + [...P.files.keys()].map(k => k.slice(k.lastIndexOf('/') + 1)).join(', ') + '. Check them in game [T].');
  notes.push(...P.notes);
  if (R.problems.length) notes.push('Read with problems: ' + R.problems.slice(0, 5).join('; '));
  return { gen: null, copies: [], calls, notes, result: m.unit };
}

// the change a route body may carry: {scale}, {set: [{part, side, mm}]}, {repair: [{part, s}]}, {volx: [{part, key, value}]},
// {preset}, {material}
function cleanChange(x) {
  const ch = {};
  if (!x || typeof x !== 'object') throw bad('Name the armour change.');
  if (x.scale != null) { const k = Number(x.scale); if (!(k > 0 && k <= 10)) throw bad('The scale must be above 0 and at most 10.'); ch.scale = k; }
  if (x.set != null) {
    if (!Array.isArray(x.set) || x.set.length > 500) throw bad('The armour rows are a list.');
    ch.set = x.set.map(s => ({ part: String((s && s.part) || '').slice(0, 120), side: lc(s && s.side).slice(0, 10), mm: Number(s && s.mm) }));
  }
  if (x.repair != null) {
    if (!Array.isArray(x.repair) || x.repair.length > 500) throw bad('The repair rows are a list.');
    ch.repair = x.repair.map(s => ({ part: String((s && s.part) || '').slice(0, 120), s: Number(s && s.s) }));
  }
  if (x.volx != null) {
    if (!Array.isArray(x.volx) || x.volx.length > 2000) throw bad('The volume key rows are a list.');
    ch.volx = x.volx.map(s => ({ part: String((s && s.part) || '').slice(0, 120), key: lc(s && s.key).slice(0, 40), value: String(s && s.value != null ? s.value : '').slice(0, 40) }));
  }
  if (x.preset != null) { if (!/^[a-z0-9_]{1,80}$/i.test(String(x.preset))) throw bad('The armour class is one word, like tank_heavy_tier1.'); ch.preset = lc(x.preset); }
  if (x.material != null) ch.material = lc(x.material).slice(0, 20);
  if (!Object.keys(ch).length) throw bad('Name the armour change.');
  return ch;
}
// own route: POST /api/x/task/r/armour/goh {mod, def, change, write, from}. from (the model task): the def def is copied from at
// Write; a dry run before that copy plans on from and names the files as they will sit next to def. opt.action: the restore point name.
async function gohRoute(url, b, ctx, opt) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), dir = gohDir(ctx);
  if (!dir) throw NOGOH();
  const def = lc(b.def), okDef = k => DEF_RE.test(k) && !k.split('/').includes('..');
  if (!okDef(def)) throw bad('Name the unit file as written (resource/entity/.../name.def).');
  const ch = cleanChange(b.change), src = srcOf(dir, mod);
  let R = GA().read(src, def), from = null;
  if (!R.files.length && b.from != null && !b.write) {
    from = lc(b.from);
    if (!okDef(from)) throw bad('Name the unit file as written (resource/entity/.../name.def).');
    R = GA().read(src, from);
  }
  if (!R.files.length) throw bad('The unit file ' + def + ' was not found in the game or the mod.', b.from != null ? 409 : 400);
  const P = GA().plan(src, R, ch, {});
  if (!P.ok) throw bad(P.reason);
  // a dry run on from: its folder and def name become def's (a shared file's copy name may differ at Write; the task guards it then)
  const fd = from ? from.slice(0, from.lastIndexOf('/') + 1) : '', dd = def.slice(0, def.lastIndexOf('/') + 1);
  const as = k => (!from ? k : k === from ? def : k.startsWith(fd) ? dd + k.slice(fd.length) : k);
  const keys = [...P.files.keys()].map(as), rows = P.changes.map(x => ({ file: as(x.key), line: x.line, part: x.part, side: x.side, old: x.before, new: x.after }));
  if (!b.write) return { ok: true, files: keys, rows, notes: P.notes };
  const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'change the armour' });
  if (why) throw bad(why);
  if (ctx && ctx.job) ctx.job.writes = true;
  // the final files inside the mod (links followed), a restore point of each first, then temp file + rename (lib/modwrite)
  for (const k of keys) { try { MW().guardFile(mod, path.join(mod, ...k.split('/')), { game: dir }); } catch (e) { throw bad(e.message); } }
  const restore = MW().restorePoints(mod, keys, (opt && opt.action) || 'task-armour-goh', { game: dir });
  MW().writeFiles(mod, P.files, { game: dir });
  // read back: every file in the mod holds the planned bytes
  for (const [k, buf] of P.files) {
    let got = null; try { got = fs.readFileSync(path.join(mod, ...k.split('/'))); } catch (e) { got = null; }
    if (!got || !got.equals(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'latin1'))) throw bad('The file ' + k + ' in the mod does not hold what was written. Undo the write from the Files page restore points and try again.', 500);
  }
  return { ok: true, wrote: true, files: keys, rows, notes: P.notes, restore, undo: MW().restoreRoot(mod) };
}

module.exports = { ROUTE, look, values, compile, gohRoute, setsFrom, partOf, changeOf, cleanChange, defOf };
