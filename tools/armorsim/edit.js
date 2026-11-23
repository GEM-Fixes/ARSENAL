// armorsim/edit: change one armour number of a unit in place, in a mod folder (never the game install).
//   edit(unit, { volume, side ('front'..'bottom'|'all'), mm, out (mod folder), dry, shared, game, mods, exe }) ->   (exe: the game's
//     vfs exe as armordata opts; 'goh' is refused: AS2 and the 64-bit build only, owner decision 2026-11-10)
//     { ok, refused, reason, volume, side, changes: [{ key, file, line, before, after, created }], shared: { volumes, sides } | null,
//       verify: { want, got } | null, notes: [] }
// Where the number lives (armordata source locs, RULES.md "Edit in place"):
//   area value (source.area[s]): the `{thickness F S R T}` of the area setting; a `%param` there is taken from the macro
//     call at loc.site (`("armor_x" body(80 30 20 22))`). Shared when the area covers other volumes or the side slot
//     covers two sides (side = left+right, top = top+bottom): refused without `shared`.
//   own value (source.own[s]): the `{front N}` sub-block (set it) or the volume's `{thickness N ..}` (all sides): for one
//     side a `{side N}` sub-block is added to that block instead of changing N. Inside a macro/include (loc.site or a file
//     other than the def): shared, refused without `shared`.
//   no source (a model-only volume such as vanilla pz4h `mantled`): `{volume "x" {thickness 0 {side N}}}` is added to the def.
// Every edit is a splice through tools/lib/sdlwrite (bytes, CRLF and comments kept). After writing, vehicleArmor is read
// again over the folder; a value the reader does not see puts the files back and reports failure.
// Author: Imperator_Aug (ARSENAL, ia-ae59285e)
'use strict';
const fs = require('fs'), path = require('path');
const ad = require('./armordata'), sdlset = require('../lib/sdlset'), sw = require('../lib/sdlwrite');
const { refuseWrite } = require('../lib/writeguard');

const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
const SLOT = [0, 3, 1, 1, 2, 3];   // engine side -> area {thickness front side rear top} slot
const SLOT_SIDES = [[0], [2, 3], [4], [1, 5]];
const lc = s => String(s == null ? '' : s).toLowerCase();
const unq = s => String(s || '').replace(/^"|"$/g, '');

function lineStarts(src) { const a = [0]; for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) a.push(i + 1); return a; }
function lineOf(starts, off) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; }
function nodes(t) { const out = []; (function w(n) { for (const it of n.items || []) { out.push(it); if (it.items) w(it); } })(t.root); return out; }
function blocksOnLine(t, line, name) {
  const st = t._starts || (t._starts = lineStarts(t.src));
  return nodes(t).filter(n => n.type === 'block' && n.name === name && lineOf(st, n.start) === line);
}
const isNumNode = n => n && n.type === 'atom' && /^-?[\d.]+$/.test(n.text);
const fmt = n => String(Math.round(n * 1000) / 1000);

// a file under edit: bytes from the folder (if there) else the vfs; written to <out>/<key>
function fileCtx(src, out, key) {
  const local = src.local && src.local.get(key);
  const buf = src.get(key);
  if (!buf) return null;
  const dest = local || path.join(out, ...key.split('/'));
  return { key, dest, created: !local, before: buf, tree: sw.parse(buf) };
}

// macro call at a site line: the list after `param` -> its number nodes
function macroArgs(t, line, param) {
  const st = t._starts || (t._starts = lineStarts(t.src));
  for (const n of nodes(t)) {
    if (!n.items || lineOf(st, n.start) !== line) continue;
    for (let i = 0; i < n.items.length - 1; i++) {
      const a = n.items[i], b = n.items[i + 1];
      if (a.type === 'atom' && lc(a.text) === lc(param) && b.type === 'list' && b.start === a.end) return b.items.filter(isNumNode);
    }
  }
  return null;
}

// a parameter passed on by an inner macro call: `tur(%turret)` in the macro file forwards %tur to the outer `turret(..)`
// (vanilla tank_unarmed.ext armor_medium -> armor_tank). Follows pure single-name forwards in the macro file, up to 6 hops [I].
function outerParam(callTree, line, p, macroText) {
  const seen = new Set();
  let cur = [p];
  for (let hop = 0; hop < 6 && cur.length; hop++) {
    for (const q of cur) if (macroArgs(callTree, line, q)) return q;
    const next = [];
    for (const q of cur) {
      if (seen.has(lc(q))) continue;
      seen.add(lc(q));
      const re = new RegExp('(^|[\\s(])' + q.replace(/[^\w]/g, '') + '\\(\\s*%(\\w+)\\s*\\)', 'gi');
      let m;
      while ((m = re.exec(macroText))) if (!next.includes(m[2])) next.push(m[2]);
    }
    cur = next;
  }
  return null;
}

// plan the splice(s) for one side; returns { file, apply(tree), before, shared, sides, why } or { error }
function planArea(src, out, A, v, s, mm) {
  const area = A.areas.find(a => a.name === v.area);
  const l = area && area.source.thickness;
  if (!l) return { error: 'the area ' + v.area + ' has no thickness line on record' };
  const slot = SLOT[s];
  const others = Object.values(A.volumes).filter(x => x.area === v.area && x !== v).map(x => x.name);
  const sides = SLOT_SIDES[slot].map(i => SIDES[i]);
  const body = fileCtx(src, out, l.file);
  if (!body) return { error: 'cannot read ' + l.file };
  const tb = blocksOnLine(body.tree, l.line, 'thickness');
  if (tb.length !== 1) return { error: 'expected one {thickness} block at ' + l.file + ':' + l.line + ', found ' + tb.length };
  const args = tb[0].items.slice(1);
  const flat = [];
  for (const a of args) {
    if (a.type === 'atom' && a.text[0] === '%') {
      if (!l.site) return { error: 'macro parameter ' + a.text + ' at ' + l.file + ':' + l.line + ' but no call site on record' };
      const call = fileCtx(src, out, l.site.file);
      const p = call && outerParam(call.tree, l.site.line, a.text.slice(1), body.tree.src);
      const ns = p && macroArgs(call.tree, l.site.line, p);
      if (!ns) return { error: 'cannot find the argument ' + a.text.slice(1) + '(...) at ' + l.site.file + ':' + l.site.line + ' (nested macro?): edit by hand' };
      ns.forEach((n, k) => flat.push({ fc: call, line: l.site.line, param: p, k, n }));
    } else if (isNumNode(a)) flat.push({ fc: body, line: l.line, node: a, n: a });
  }
  const e = flat[slot];
  if (!e) return { error: 'the area thickness at ' + l.file + ':' + l.line + ' has no value for slot ' + slot };
  const inMacroFile = !e.param && (l.site || lc(l.file) !== lc(A.key));
  const why = [];
  if (others.length) why.push('the area "' + v.area + '" also covers ' + others.join(', '));
  if (sides.length > 1) why.push('one area value sets ' + sides.join(' and '));
  if (inMacroFile) why.push('the value sits in ' + l.file + ', shared by every unit that uses it');
  return { fc: e.fc, line: e.line, before: e.n.text, after: fmt(mm), shared: why.length ? { volumes: others, sides, why } : null,
    apply: t => { const n = e.param ? macroArgs(t, e.line, e.param)[e.k] : nodeAt(t, e.n); sw.setValue(n, fmt(mm)); } };
}
function nodeAt(t, old) { return nodes(t).find(n => n.start === old.start && n.end === old.end); }

function planOwn(src, out, A, v, sideIdx, mm) {
  const ss = sideIdx === 'all' ? [0, 1, 2, 3, 4, 5] : [sideIdx];
  const l = v.source.own[ss[0]];
  if (!l) {   // no thickness anywhere: add a volume block to the def
    const def = fileCtx(src, out, A.key);
    if (!def) return { error: 'cannot read ' + A.key };
    const top = def.tree.root.items.find(n => n.type === 'block');
    if (!top) return { error: 'no top block in ' + A.key };
    const vb = nodes(def.tree).find(n => n.type === 'block' && n.name === 'volume' && n.items[1] && lc(unq(n.items[1].text)) === lc(v.name));
    const th = sideIdx === 'all' ? '{thickness ' + fmt(mm) + '}' : '{thickness 0 {' + SIDES[sideIdx] + ' ' + fmt(mm) + '}}';
    return { fc: def, line: lineOf(lineStarts(def.tree.src), (vb || top).start), before: '(none)', after: vb ? th : '{volume "' + v.name + '" ' + th + '}', shared: null,
      apply: t => { const p = nodes(t).find(n => n.start === (vb || top).start); sw.insertChild(p, p.items.length, vb ? th : '{volume "' + v.name + '" ' + th + '}'); } };
  }
  const fc = fileCtx(src, out, l.file);
  if (!fc) return { error: 'cannot read ' + l.file };
  const tbs = blocksOnLine(fc.tree, l.line, 'thickness');
  let tb = tbs.length === 1 ? tbs[0] : null;
  if (!tb) {   // the loc may be a lone side sub-block line
    const subs = nodes(fc.tree).filter(n => n.type === 'block' && SIDES.concat('back').includes(n.name) && n.parent && n.parent.name === 'thickness' && lineOf(fc.tree._starts || (fc.tree._starts = lineStarts(fc.tree.src)), n.start) === l.line);
    if (subs.length) tb = subs[0].parent;
  }
  if (!tb) return { error: 'expected one {thickness} block at ' + l.file + ':' + l.line };
  const why = [];
  if (l.site || lc(l.file) !== lc(A.key) && !/\.mdl$/i.test(l.file)) why.push('the value sits in a macro or include (' + l.file + ':' + l.line + '), shared by every unit that uses it');
  const subOf = name => tb.items.find(n => n.type === 'block' && (n.name === name || name === 'rear' && n.name === 'back'));
  const gen = tb.items.slice(1).find(isNumNode);
  if (sideIdx === 'all') {
    const targets = [gen, ...SIDES.map(subOf).filter(Boolean).map(b => b.items.find((n, i) => i && isNumNode(n)))].filter(Boolean);
    return { fc, line: lineOf(lineStarts(fc.tree.src), tb.start), before: tb.text || fc.tree.src.slice(tb.start, tb.end), after: 'every own value ' + fmt(mm), shared: why.length ? { volumes: [], sides: SIDES, why } : null,
      apply: t => { for (const n of targets) sw.setValue(nodeAt(t, n), fmt(mm)); if (!gen) sw.setValue(nodeAt(t, tb), fmt(mm), 1); } };
  }
  const sub = subOf(SIDES[sideIdx]);
  const subNum = sub && sub.items.find((n, i) => i && isNumNode(n));
  if (subNum) return { fc, line: lineOf(lineStarts(fc.tree.src), sub.start), before: subNum.text, after: fmt(mm), shared: why.length ? { volumes: [], sides: [SIDES[sideIdx]], why } : null, apply: t => sw.setValue(nodeAt(t, subNum), fmt(mm)) };
  const add = '{' + SIDES[sideIdx] + ' ' + fmt(mm) + '}';
  return { fc, line: lineOf(lineStarts(fc.tree.src), tb.start), before: (gen ? gen.text : '0') + ' (all sides)', after: add + ' added', shared: why.length ? { volumes: [], sides: [SIDES[sideIdx]], why } : null,
    apply: t => { const b = nodeAt(t, tb); sw.setValue(b, add, b.items.length); } };
}

function edit(unit, o) {
  const res = { ok: false, refused: false, reason: null, unit, volume: null, side: o.side, mm: o.mm, changes: [], shared: null, verify: null, notes: [] };
  const fail = (r, refused) => Object.assign(res, { reason: r, refused: !!refused });
  if (o.exe && require('../lib/games').exeOf(o.exe) === 'goh') return fail(require('../lib/games').notFor('armorsim', 'goh', 'the armour simulator is for MoW:AS2 and the 64-bit build only', 'owner decision 2026-11-10, plan/decisions.md SOEdit'), true);
  if (!o.out) return fail('--out <mod folder> is required', true);
  const out = path.resolve(o.out);
  const guard = refuseWrite(path.join(out, 'resource'), { game: o.game, purpose: 'armorsim edit' });
  if (guard) return fail('refused to write in ' + out + ': ' + guard, true);
  const mm = Number(o.mm);
  if (!isFinite(mm) || mm < 0) return fail('--mm must be a number >= 0', true);
  const sideIdx = lc(o.side) === 'all' ? 'all' : SIDES.indexOf(lc(o.side) === 'back' ? 'rear' : lc(o.side));
  if (sideIdx === -1) return fail('--side must be front|top|left|right|rear|bottom|all', true);
  const ex = o.exe ? require('../lib/games').exeOf(o.exe) : null;
  const mk = () => sdlset.createSource(Object.assign({ gameDir: o.game, mods: o.mods || [], folder: fs.existsSync(out) ? out : undefined }, ex ? { exe: ex } : {}));
  const ro = src => Object.assign({ game: o.game, mods: o.mods || [], folder: fs.existsSync(out) ? out : undefined, src }, ex ? { exe: ex } : {});
  const src = mk();
  const A = ad.vehicleArmor(unit, ro(src));
  if (!A) return fail('No vehicle def named "' + unit + '".', true);
  const q = lc(String(o.volume || '').split('/').pop());
  const v = Object.values(A.volumes).find(x => lc(x.name) === q);
  if (!v) return fail('No volume "' + o.volume + '" in ' + A.key + ' (volumes: ' + Object.keys(A.volumes).join(', ') + ')', true);
  res.volume = v.name;
  let plan;
  if (sideIdx !== 'all' && v.source.area[sideIdx]) plan = planArea(src, out, A, v, sideIdx, mm);
  else {
    plan = planOwn(src, out, A, v, sideIdx, mm);
    if (sideIdx === 'all') { const sh = SIDES.filter((s, i) => v.source.area[i]); if (sh.length) res.notes.push('sides ' + sh.join(', ') + ' come from the area "' + v.area + '" and stay as they are (edit them one by one with --shared)'); }
  }
  if (plan.error) return fail(plan.error, true);
  res.shared = plan.shared;
  res.changes.push({ key: plan.fc.key, file: plan.fc.dest.replace(/\\/g, '/'), line: plan.line, before: plan.before, after: plan.after, created: plan.fc.created });
  if (plan.shared && !o.shared) {
    return fail('This value is shared: ' + plan.shared.why.join('; ') + '. Changing it would also change ' +
      [plan.shared.volumes.length ? 'volumes ' + plan.shared.volumes.join(', ') : null, plan.shared.sides.length > 1 ? 'sides ' + plan.shared.sides.join(', ') : null].filter(Boolean).join(' and ') +
      '. Add --shared to change it anyway.', true);
  }
  const g2 = refuseWrite(plan.fc.dest, { game: o.game, purpose: 'armorsim edit' });
  if (g2) return fail('refused to write ' + plan.fc.dest + ': ' + g2, true);
  plan.apply(plan.fc.tree);
  const after = sw.serialize(plan.fc.tree);
  res.changes[0].bytes = after.length - plan.fc.before.length;
  if (o.dry) { res.ok = true; res.notes.push('dry run: nothing written'); return res; }
  fs.mkdirSync(path.dirname(plan.fc.dest), { recursive: true });
  fs.writeFileSync(plan.fc.dest, after);
  // verify through a fresh reader over the folder
  let got = null;
  try {
    const B = ad.vehicleArmor(unit, ro(mk()));
    const bv = B && Object.values(B.volumes).find(x => lc(x.name) === lc(v.name));
    got = bv ? (sideIdx === 'all' ? bv.sides.slice() : bv.effectiveSides[sideIdx]) : null;
  } catch (e) { got = 'read failed: ' + e.message; }
  const want = sideIdx === 'all' ? [mm, mm, mm, mm, mm, mm] : mm;
  res.verify = { want, got };
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    if (plan.fc.created) fs.unlinkSync(plan.fc.dest); else fs.writeFileSync(plan.fc.dest, plan.fc.before);
    return fail('written, but the reader now sees ' + JSON.stringify(got) + ' instead of ' + JSON.stringify(want) + ': file put back', false);
  }
  res.ok = true;
  return res;
}

module.exports = { edit, SIDES };
