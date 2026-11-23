// Bots part "targets" (group D, order 20): who shoots at what (set/target/*.inc, in select.set order) and which shell or bullet for which
// target (set/target/ammo.set), plus the symptom picker (client entry 'targets.symptom', order 5). Reads the mod's copy first, else the
// game's own through the vfs (bots/lib.js effective, read only). Writes a changed copy into the mod folder only: surgical edits
// (tparse.js), latin1 bytes and CRLF kept. Reset removes the mod's copy of that one file. Write and Reset save the bytes before;
// the frame's one Undo (lib.undo; POST /api/x/bots/undo) puts them back, refused when the file changed since.
// Games: AS64 and MoW:AS2 through lib.gameOf; GoH the same readers (gohweb: unchanged vs the AS2 base)
// on the GoH files, with their own class names (tank_light...).
// Author: Imperator_Aug (ARSENAL, ia-5aaf6c90)
'use strict';
const fs = require('fs'), path = require('path');
const lib = require('../../lib');
const T = require('./tparse');

const DIR = 'set/target/';
const bad = T.bad;
const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const modPath = (mod, rel) => path.join(mod, 'resource', ...rel.split('/'));
const FILE = /^[A-Za-z0-9_.-]+\.inc$/;

function read(ctx, mod, file) {
  const e = lib.effective(ctx, mod, DIR + file);
  return { text: e.text, from: e.from, vanilla: e.vanilla };
}
// the files this part edits: ammo.set and the includes of the effective select.set
function filesOf(ctx, mod) {
  const s = read(ctx, mod, 'select.set');
  if (s.text == null) throw bad('Cannot read set/target/select.set. Set the game folder in Settings, or put set/target in your mod.', 404, 'noSelect', { noGame: !lib.gameOf(ctx).dir });
  return { incs: T.includes(s.text).filter(f => FILE.test(f)), selFrom: s.from };
}
function kindOf(ctx, mod, file) {
  if (file === 'ammo.set') return 'ammo';
  if (typeof file !== 'string' || !FILE.test(file)) throw bad('Unknown file: ' + String(file).slice(0, 80), 400, 'file', { f: String(file).slice(0, 80) });
  if (!filesOf(ctx, mod).incs.includes(file)) throw bad('Unknown file: ' + file + ' (select.set does not include it).', 400, 'file', { f: file });
  return 'sel';
}
const sameOrder = (a, b) => a.filter(x => b.includes(x)).concat(b.filter(x => !a.includes(x)));
// what an action may name: target classes and ammo tags the files use (the mod's copies and the game's own), tank classes, the bullet tag
function infoOf(ctx, mod, incs) {
  const classes = [], tags = [], put = (L, v) => { if (v && !L.includes(v)) L.push(v); };
  for (const f of incs) {
    const r = read(ctx, mod, f);
    for (const t of [r.vanilla, r.text]) {
      if (t == null) continue;
      let S = []; try { S = T.selectors(t); } catch (e) { continue; }
      for (const s of S) for (const g of s.groups) for (const w of ['select', 'ignore', 'sort']) for (const set of g[w]) for (const x of set) if (x.k === 'class') put(classes, x.v);
    }
  }
  const a = read(ctx, mod, 'ammo.set'), human = [], tanks = [];
  for (const t of [a.vanilla, a.text]) {
    if (t == null) continue;
    let B = []; try { B = T.ammo(t); } catch (e) { continue; }
    for (const b of B) { put(classes, b.cls); if (!b.cond && T.TANKCLS(b.cls)) put(tanks, b.cls); for (const r of b.rules) { put(tags, r.tags); if (b.cls === 'human') human.push(r.tags); } }
  }
  // tank classes = the ammo blocks of tanks (stock AS2: tank light_tank; GoH: tank_light tank_medium tank_heavy); no ammo.set: the stock names
  if (!tanks.length) classes.filter(c => /^(tank|light_tank|tank_(light|medium|heavy))$/.test(c)).forEach(c => put(tanks, c));
  const bulletTag = human.includes('bullet') ? 'bullet' : human.includes('small_arms') ? 'small_arms' : null;
  return { classes: classes.filter(c => c !== 'unknown'), tags, tankClasses: tanks, bulletTag };
}
// client models (no offsets)
const term = t => ({ not: t.not, k: t.k, v: t.v });
// stock = the game's own value of each range, shown beside its box: the game's group with the same text apart from the range numbers
// (so a moved group keeps its value); null when the game's file has no such group (a group the mod added) or cannot be read
const shape = raw => String(raw).replace(/(\{\s*in_range\s+)[\d.]+/gi, '$1').replace(/\s+/g, ' ').trim();
const selModel = (file, text, vanilla) => {
  let V = []; if (vanilla != null) try { V = T.selectors(vanilla); } catch (e) { V = []; }
  return T.selectors(text).map(s => {
    const vg = ((V.find(v => v.idx === s.idx) || {}).groups || []).map(g => ({ k: shape(g.raw), ranges: g.ranges, used: false }));
    return { file, idx: s.idx, type: s.type, unit: s.unit, weapon: s.weapon, launcher: T.isLauncher(s), tankList: T.isTankList(s),
      groups: s.groups.map((g, i) => {
        const k = shape(g.raw), m = vg.find(x => !x.used && x.k === k && x.ranges.length === g.ranges.length); if (m) m.used = true;
        return { i, select: g.select.map(x => x.map(term)), ignore: g.ignore.map(x => x.map(term)), sort: g.sort.map(x => x.map(term)), key: g.key,
          ranges: g.ranges.map((r, n) => ({ v: r.v, where: r.where, stock: m ? m.ranges[n].v : null })), raw: g.raw };
      }) };
  });
};
// the game's own text of a file: the vfs copy; a file read from the game is its own stock
const stockOf = r => (r.vanilla != null ? r.vanilla : r.from !== 'mod' ? r.text : null);
const ammoModel = text => T.ammo(text).map(b => ({ i: b.i, cls: b.cls, cond: b.cond,
  rules: b.rules.map(r => ({ j: r.j, tags: r.tags, opts: r.opts.map(o => ({ k: o.k, v: o.v })), ai: r.ai, user: r.user, human: r.human, disable: r.disable, raw: r.raw })) }));

function state(ctx, mod) {
  const G = lib.gameOf(ctx), F = filesOf(ctx, mod), files = [], selectors = [], errors = [];
  const info = infoOf(ctx, mod, F.incs), presets = [];
  const plan = (kind, text, file) => { for (const id of Object.keys(T.PRESETS)) if (T.PRESETS[id].kind === kind) { let n = 0; try { n = T.presetPlan(kind, text, id, info).length; } catch (e) { n = 0; } if (n || kind === 'ammo') presets.push({ id, file, needed: n > 0, n }); } };
  F.incs.forEach((file, order) => {
    const r = read(ctx, mod, file);
    if (r.text == null) { errors.push({ file, msg: 'not found' }); return; }
    files.push({ file, kind: 'sel', from: r.from, order });
    try { selectors.push(...selModel(file, r.text, stockOf(r))); plan('sel', r.text, file); } catch (e) { errors.push({ file, msg: e.message }); }
  });
  // presets on shooter lists: also say which file holds the lists they are for, when nothing there needs the fix
  for (const id of ['farTanks', 'closeInf']) if (!presets.some(p => p.id === id)) {
    const s = selectors.find(x => (id === 'farTanks' ? x.launcher : x.tankList));
    if (s) presets.push({ id, file: s.file, needed: false, n: 0 });
  }
  let ammoBlocks = null;
  const a = read(ctx, mod, 'ammo.set');
  if (a.text != null) {
    files.push({ file: 'ammo.set', kind: 'ammo', from: a.from });
    try { ammoBlocks = ammoModel(a.text); plan('ammo', a.text, 'ammo.set'); } catch (e) { errors.push({ file: 'ammo.set', msg: e.message }); }
  } else errors.push({ file: 'ammo.set', msg: 'not found' });
  return { gid: G.id, kind: G.kind, files, selectors, ammo: ammoBlocks, classes: info.classes, tags: info.tags, tankClasses: info.tankClasses, bulletTag: info.bulletTag, presets, errors };
}

// apply the actions to the effective text of one file; dry run unless write. Returns the plain list, a line diff and the new model
function change(ctx, mod, file, actions, write) {
  const kind = kindOf(ctx, mod, file), r = read(ctx, mod, file);
  if (r.text == null) throw bad('Cannot read ' + DIR + file + '. Set the game folder in Settings.', 404, 'noFile', { f: file, noGame: !lib.gameOf(ctx).dir });
  const F = filesOf(ctx, mod), info = infoOf(ctx, mod, F.incs);
  const res0 = T.applyAll(kind, r.text, actions, info), t = res0.text;
  const target = modPath(mod, DIR + file);
  const res = { file, kind, did: res0.did, diff: T.diff(r.text, t), same: t === r.text, target, copiesWholeFile: r.from !== 'mod', written: false,
    model: kind === 'ammo' ? ammoModel(t) : selModel(file, t, stockOf(r)) };
  if (write && !res.same) {
    lib.checkWrite(ctx, mod, [DIR + file]);
    const u = lib.undo.save(ctx, mod, DIR + file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, t, 'latin1');
    res.written = true;
    res.undo = [u.commit()];
  }
  return res;
}
// a removed mod file leaves no empty folders behind (set/target, set, resource); the mod folder itself stays
function prune(mod, p) {
  const top = path.resolve(mod);
  for (let d = path.dirname(path.resolve(p)); d.length > top.length && d.toLowerCase().startsWith(top.toLowerCase() + path.sep); d = path.dirname(d)) {
    try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { break; }
  }
}
function reset(ctx, mod, file, write) {
  kindOf(ctx, mod, file);
  const p = modPath(mod, DIR + file), had = fs.existsSync(p);
  let undo;
  if (write && had) { lib.checkWrite(ctx, mod, [DIR + file]); const u = lib.undo.save(ctx, mod, DIR + file); fs.unlinkSync(p); prune(mod, p); undo = [u.commit()]; }
  return { file, target: p, had, removed: !!write && had, undo };
}

const ROWS = require('./lang');
module.exports = {
  id: 'targets', group: 'D', order: 20,
  routes: {
    'GET /api/x/bots/targets/state': async (url, body, ctx) => state(ctx, lib.checkMod(ctx, q(url, 'mod'))),
    'POST /api/x/bots/targets/change': async (url, body, ctx) => { body = body || {}; const mod = lib.checkMod(ctx, body.mod); if (body.write) lib.checkWrite(ctx, mod); return change(ctx, mod, body.file, body.actions, !!body.write); },
    'POST /api/x/bots/targets/reset': async (url, body, ctx) => { body = body || {}; const mod = lib.checkMod(ctx, body.mod); if (body.write) lib.checkWrite(ctx, mod); return reset(ctx, mod, body.file, !!body.write); },
  },
  lang: ROWS,
  script: require('./client'),
  // for the test
  _: { state, change, reset, infoOf },
};
