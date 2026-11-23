// Bots part brain, sight range (AS2 forms only): how far AI units see. The game reads set/vision/vision.set,
// whose profiles take their base radius from the "vision_*" presets of vision_generic.inc through
// the "radius" macro of vision.set: {radius (* 0.75 %r)} = every r(N) times 0.75.
// The AI sensor uses that radius times the sight rules of the target and
// notices a seen enemy after distance / sight range x RecognizeTime seconds. So a soldier profile "human" sees a
// standing enemy soldier in the open at r(70) x 0.75 = 52.5 m. Values are shown and taken in metres (r x the multiplier); a change
// writes r = metres / multiplier (2 decimals) into the preset's r(N), or the multiplier into the macro: surgical splices, all other
// bytes kept. Unknown forms (a mod that rewrote these files) are reported, never guessed.
// GoH: set/vision is another form there (spotting.inc, vision_fields.inc): not offered (na 'goh').
// Author: Imperator_Aug (ARSENAL, ia-ca0d686d)
'use strict';
const lib = require('../../lib');

const VS = 'set/vision/vision.set', VG = 'set/vision/vision_generic.inc';
const ITEMS = require('./catalog.json').sight;
const fmt = x => String(Math.round(Number(x) * 100) / 100);
const fm = x => String(Math.round(Number(x) * 10) / 10);   // metres shown: one decimal
const err = (key, params, msg, status) => Object.assign(new Error(msg), { status: status || 400, key, params: params || {} });
const live = (t, i) => { const s = t.lastIndexOf('\n', i - 1) + 1; return t.slice(s, i).indexOf(';') < 0; };   // not inside a ; comment

// the multiplier of the "radius" macro: {at:[a,b], v}
function multOf(t) {
  if (t == null) return null;
  const re = /\(\s*define\s+"radius"\s*\{\s*radius\s*\(\s*\*\s*([0-9]*\.?[0-9]+)\s+%r\s*\)\s*\}\s*\)/g;
  let m; while ((m = re.exec(t))) if (live(t, m.index)) { const a = m.index + m[0].indexOf(m[1], m[0].indexOf('*')); return { at: [a, a + m[1].length], v: m[1] }; }
  return null;
}
// r(N) of the preset (define "name" ... ("radius" r(N)) ...): the first one before the next define
function radiusOf(t, preset) {
  if (t == null) return null;
  const re = new RegExp('\\(\\s*define\\s+"' + preset + '"', 'g');
  let m; while ((m = re.exec(t))) {
    if (!live(t, m.index)) continue;
    const end = (() => { const r2 = /\(\s*define\s+"/g; r2.lastIndex = m.index + m[0].length; const n = r2.exec(t); return n ? n.index : t.length; })();
    const body = t.slice(m.index, end), r = /\(\s*"radius"\s+r\(\s*([0-9]*\.?[0-9]+)\s*\)\s*\)/g;
    let k; while ((k = r.exec(body))) { const a = m.index + k.index; if (!live(t, a)) continue; const s = a + k[0].lastIndexOf(k[1]); return { at: [s, s + k[1].length], v: k[1], line: t.slice(0, s).split('\n').length }; }
    return null;
  }
  return null;
}
const splice = (t, at, v) => t.slice(0, at[0]) + v + t.slice(at[1]);

function files(ctx, mod) {
  const s = lib.effective(ctx, mod, VS), g = lib.effective(ctx, mod, VG);
  return { s, g };
}
// {ok, rows:[{id, preset, mod, stock, r, line, file}], mult, stockMult, from} or {na: 'goh'|'noFile'|'form'}
function values(ctx, mod) {
  if (lib.gameOf(ctx).kind === 'goh') return { na: 'goh' };
  const { s, g } = files(ctx, mod);
  if (s.text == null || g.text == null) return { na: 'noFile' };
  const M = multOf(s.text), SM = multOf(s.vanilla);
  if (!M) return { na: 'form', file: VS };
  const rows = ITEMS.map(it => {
    if (it.kind === 'mult') return { id: it.id, mod: fmt(M.v), stock: SM ? fmt(SM.v) : null, stockKnown: s.vanilla != null, file: VS, line: s.text.slice(0, M.at[0]).split('\n').length, from: s.from };
    const R = radiusOf(g.text, it.preset), SR = radiusOf(g.vanilla, it.preset);
    return { id: it.id, mod: R ? fm(R.v * M.v) : null, found: !!R, r: R ? R.v : null, stock: SR && SM ? fm(SR.v * SM.v) : null, stockKnown: g.vanilla != null && s.vanilla != null, file: VG, line: R ? R.line : null, from: g.from };
  });
  return { ok: true, rows, mult: M.v, from: s.from === 'mod' || g.from === 'mod' ? 'mod' : 'game' };
}

function checkNum(it, v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) throw err('bots.brain.e.num', { id: it.id, a: it.min, b: it.max, u: it.unit || '' }, it.id + ': "' + s + '" is not a number (allowed ' + it.min + ' to ' + it.max + ').');
  if (Number(s) < it.min || Number(s) > it.max) throw err('bots.brain.e.range', { id: it.id, v: s, a: it.min, b: it.max, u: it.unit || '' }, it.id + ': ' + s + ' is out of range (allowed ' + it.min + ' to ' + it.max + ').');
  return Number(s);
}
// changes {id: value} (sight ids only) -> {list:[{id,key,was,now}], out:[{rel, text (new), old (effective), from}]}
function plan(ctx, mod, changes) {
  const ids = Object.keys(changes || {});
  if (!ids.length) return { list: [], out: [] };
  const V = values(ctx, mod);
  if (V.na) throw err('bots.brain.e.sight.' + V.na, { f: V.file || VS }, V.na === 'goh' ? 'Sight range is set in another form in Gates of Hell; not offered here.' : V.na === 'form' ? VS + ' is not in the stock form (no "radius" macro), so nothing was changed.' : 'Cannot read ' + VS + ' or ' + VG + ': set the game folder in Settings.', V.na === 'noFile' ? 404 : 400);
  const { s, g } = files(ctx, mod);
  let ts = s.text, tg = g.text;
  const by = new Map(ITEMS.map(it => [it.id, it])), list = [];
  for (const id of ids) if (!by.has(id)) throw err('bots.brain.e.unknown', { id }, 'Unknown setting for this game: ' + id);
  const M0 = Number(multOf(ts).v);
  let M1 = M0;
  if ('sight-all' in changes) {
    const it = by.get('sight-all'), n = checkNum(it, changes['sight-all']);
    if (n !== M0) { ts = splice(ts, multOf(ts).at, fmt(n)); M1 = n; list.push({ id: it.id, key: it.key, was: fmt(M0), now: fmt(n) }); }
  }
  for (const id of ids) {
    const it = by.get(id); if (it.kind === 'mult') continue;
    const m = checkNum(it, changes[id]), R = radiusOf(tg, it.preset);
    if (!R) throw err('bots.brain.e.sight.form', { f: VG }, VG + ' has no ("radius" r(N)) in ' + it.preset + ': not in the stock form, so nothing was changed.');
    if (fm(R.v * M1) === fm(m)) continue;
    tg = splice(tg, R.at, fmt(m / M1));
    list.push({ id, key: it.key, was: fm(R.v * M0), now: fm(m) });
  }
  const out = [];
  if (ts !== s.text) out.push({ rel: VS, text: ts, old: s.text, from: s.from });
  if (tg !== g.text) out.push({ rel: VG, text: tg, old: g.text, from: g.from });
  return { list, out };
}
// reset: the listed sight ids back to the game's numbers (r and multiplier) -> same shape as plan
function resetPlan(ctx, mod, ids) {
  if (lib.gameOf(ctx).kind === 'goh') return { list: [], out: [] };
  const { s, g } = files(ctx, mod), want = ITEMS.filter(it => !ids || ids.includes(it.id));
  if (!want.length || s.text == null || g.text == null || s.vanilla == null || g.vanilla == null) return { list: [], out: [] };
  let ts = s.text, tg = g.text; const list = [];
  for (const it of want) {
    if (it.kind === 'mult') { const a = multOf(ts), b = multOf(s.vanilla); if (a && b && a.v !== b.v) { ts = splice(ts, a.at, b.v); list.push({ id: it.id, key: it.key, was: fmt(a.v), now: fmt(b.v) }); } continue; }
    const a = radiusOf(tg, it.preset), b = radiusOf(g.vanilla, it.preset);
    const mc = multOf(s.text), mv = multOf(s.vanilla);
    if (a && b && a.v !== b.v) { tg = splice(tg, a.at, b.v); list.push({ id: it.id, key: it.key, was: mc ? fm(a.v * mc.v) : a.v, now: mv ? fm(b.v * mv.v) : b.v }); }
  }
  const out = [];
  if (ts !== s.text) out.push({ rel: VS, text: ts, old: s.text, from: s.from, vanilla: s.vanilla });
  if (tg !== g.text) out.push({ rel: VG, text: tg, old: g.text, from: g.from, vanilla: g.vanilla });
  return { list, out };
}
module.exports = { VS, VG, ITEMS, multOf, radiusOf, values, plan, resetPlan, fm };
