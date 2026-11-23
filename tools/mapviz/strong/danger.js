// strong danger (MV-STR): mortar and howitzer danger to a side, Reach x Observed in bands (rules.md 6.3, ruling 15):
// 0 none, 1 reach only, 2 reach + observed (binocular reach of enemy ground or the flag sight radius of an enemy flag,
// both per game from the vision profile, fallback 175 m and 20 m), 3 reach +
// direct spotting (threat heat > 0). Reach = within the weapon's aim range of enemy-held ground G_e(d) [I: "out of my
// direct fire" is not subtracted]. nocrest = 250 where df from terrain >= 0.7 and danger > 0 (design 6).
// weapons(I): the reaches strong uses, read from the stack's files first (rules.md 9.4), else the fallback numbers:
//   mortar  as2 resource/set/stuff/reactive/werfer42.weapon {aimRange} (vanilla 110 m) [V data];
//           goh resource/set/stuff/mortar/.presets (define "medium_mortar_range") {aimRange} (vanilla 160 m, the 80 and
//           82 mm squad mortars) [V data; which mortar a side brings is I]
//   grenade as2 resource/set/stuff/grenade/grenade_ap.pattern {range} (17 m) [V];
//           goh resource/set/stuff/grenade/anti-personnel.pattern {range} (vanilla 20.7 m) [V data]
//   howitzer as2 resource/set/stuff/gun/.presets (define "range_medium_howitzer") {range 215 225} -> 225 m, the preset of the
//           vanilla field howitzers 122mm_m30, 105mm_m2a1, 105mm_l31 [V]; heavy ones (150mm_sfh18)
//           reach 250 m;
//           goh resource/set/stuff/gun/.presets (define "range_190_howitzer") {range 190 190} -> 190 m, the preset of
//           122mm_m30s, 105mm_m4, 152mm_m10t [V]; the presets run 160 to 210 m
//           (was a fixed 1000 m on every game, [I] with no source; which howitzer a side brings is still I)
// Author: Imperator_Aug (ARSENAL, ia-96e66c5e)
'use strict';
const F = require('./frame');

const FALLBACK = { mortar: { as2: 110, goh: 160 }, grenade: { as2: 17, goh: 20.7 }, howitzer: { as2: 225, goh: 190 } };
const FILES = {
  as2: { mortar: ['resource/set/stuff/reactive/werfer42.weapon', null, 'werfer42'], grenade: ['resource/set/stuff/grenade/grenade_ap.pattern', null, 'grenade_ap'],
    howitzer: ['resource/set/stuff/gun/.presets', 'range_medium_howitzer', 'range_medium_howitzer'] },
  goh: { mortar: ['resource/set/stuff/mortar/.presets', 'medium_mortar_range', 'medium_mortar_range'], grenade: ['resource/set/stuff/grenade/anti-personnel.pattern', null, 'anti-personnel'],
    howitzer: ['resource/set/stuff/gun/.presets', 'range_190_howitzer', 'range_190_howitzer'] },
};
// the first {aimRange n} (else {maxRange n}, else the last number of {range a b?}) of a text, inside the define when named
function rangeOf(text, define) {
  let s = String(text).replace(/;[^\n]*/g, '');
  if (define) {
    const i = s.indexOf('(define "' + define + '"');
    if (i < 0) return null;
    const j = s.indexOf('(define', i + 8);
    s = s.slice(i, j < 0 ? undefined : j);
  }
  for (const re of [/\{aimRange\s+([\d.]+)\s*\}/i, /\{maxRange\s+([\d.]+)\s*\}/i, /\{range\s+([\d.]+)(?:\s+([\d.]+))?\s*\}/i]) {
    const m = s.match(re);
    if (m) { const v = Number(m[2] !== undefined ? m[2] : m[1]); if (Number.isFinite(v) && v > 0) return v; }
  }
  return null;
}
function weapons(I) {
  if (I.weapons) return I.weapons;
  const game = I.game === 'goh' ? 'goh' : 'as2';
  let src = null;
  try { src = I.src || (I.srcFn ? I.source('weapons') : null); } catch (e) { src = null; }
  const read = what => {
    const [key, define, name] = FILES[game][what];
    let v = null;
    try { if (src && src.has(key)) v = rangeOf(src.read(key), define); } catch (e) { v = null; }
    return v === null ? { name: what, reachM: FALLBACK[what][game], source: 'fallback' } : { name, reachM: v, source: 'stack' };
  };
  I.weapons = { mortar: read('mortar'), grenade: read('grenade'), howitzer: read('howitzer') };
  return I.weapons;
}

function band(ctx, x, y, reachU) {
  const dg = ctx.distG ? F.valAt(ctx.distG, x, y) : null;
  if (dg === null || dg > reachU) return 0;
  const k = F.cellOf(ctx.fr, x, y);
  if (k >= 0 && Number.isFinite(ctx.heat[k]) && ctx.heat[k] > 0) return 3;
  if (dg <= ctx.R.binocU) return 2;
  for (const fl of ctx.enemyFlags) if (Math.hypot(fl.x - x, fl.y - y) <= ctx.R.flagU) return 2;
  return 1;
}

function layers(ctx) {
  const fr = ctx.fr, wb = ctx.doc.boxes.world, base = 'strong.' + ctx.s + '.' + ctx.kind + '.';
  const D = F.layer(fr, base + 'danger', 1, { weapon: ctx.weapons.mortar.name, reachM: ctx.weapons.mortar.reachM });
  const H = F.layer(fr, base + 'howitzer', 1, { weapon: ctx.weapons.howitzer.name, reachM: ctx.weapons.howitzer.reachM });
  const N = F.layer(fr, base + 'nocrest', 0.004, {});
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
    const p = F.centre(fr, i, j), k = j * fr.w + i;
    if (!F.inBox(wb, p.x, p.y) || F.hAt(ctx.grids.height, p.x, p.y) === null) continue;
    D.data[k] = band(ctx, p.x, p.y, ctx.R.mortarU);
    H.data[k] = band(ctx, p.x, p.y, ctx.R.howitzerU);
    N.data[k] = Number.isFinite(ctx.dfT[k]) && ctx.dfT[k] >= 0.7 && D.data[k] > 0 ? 250 : 0;
  }
  return [D, H, N];
}

module.exports = { band, layers, weapons, rangeOf, FALLBACK };
