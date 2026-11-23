// describe on Gates of Hell: the gun words (calibre, reload, penetration, range) as a gun op the GUI Units page runs on the card's own
// vehicle copy (tools/gui/ext/units/gohgun-copy.js). describe.js gohPlan calls plan(); the facts come from lib/gohgun.js facts() over the
// GoH view (factsOf). A gun this cannot read (not a cannon of set/stuff/gun) or a card with no vehicle copy of its own = refused piece
// 'gun'. Accuracy words: GoH accuracy_* curves have no order from worse to better, so they are said as assumed, not changed. [I][T]
// Author: Imperator_Aug (ARSENAL, ia-23a3c494)
'use strict';
const lc = s => String(s == null ? '' : s).toLowerCase();
const RANGE_N = [160, 170, 180, 190, 200, 210, 220];
const calOf = w => { const m = /(?:^|_)(\d{2,3})mm/.exec(lc(w)); return m ? +m[1] : null; };

// the facts a GoH describe reads: {found, recharge, pen[5] (main shell row), range (preset), accuracy (name)} or null
function factsOf(ctx) {
  const G = require('./gohgun'), memo = new Map();
  return n => {
    const k = lc(n);
    if (!memo.has(k)) {
      let f = null;
      try {
        const x = G.facts(key => ctx.readStr(key), k);
        if (x.found) f = { found: true, recharge: x.reload ? x.reload.value : null, pen: x.mainPen ? x.mainPen.v : null, range: x.range ? x.range.preset : null, rangeN: x.rangeN || null, accuracy: x.accuracy ? x.accuracy.name : null };
      } catch (e) { f = null; }
      memo.set(k, f);
    }
    return memo.get(k);
  };
}

// a: {base, id, num, K, dRange, dAcc, all (catalogue units), gf, understood, assumed, no}; returns the gun op body for the card op, or null
function plan(a) {
  const { base, id, num, K, dRange, dAcc, assumed, no } = a;
  const asked = num.cal || num.pen || num.reload || K.pen !== 1 || K.reload !== 1 || dRange || dAcc;
  if (!asked) return null;
  if (!base.gun || !base.gun.weapon) { assumed.push((base.name || base.id) + ' carries no gun: the gun words were left out'); return null; }
  const gf = n => (a.gf ? a.gf(n) : null);
  let like = lc(base.gun.weapon), cal = calOf(like);
  if (num.cal && (!cal || Math.abs(num.cal - cal) / num.cal > 0.06)) {
    const guns = new Map();
    for (const u of a.all || []) {
      if (!u || u.kind !== 'vehicle' || !u.gun || !u.gun.weapon) continue;
      const g = lc(u.gun.weapon), c = calOf(g); if (!c || !gf(g)) continue;
      const own = lc(u.army) === lc(base.army) ? 0 : 1, cur = guns.get(g);
      if (!cur || own < cur.own) guns.set(g, { g, c, own });
    }
    const best = [...guns.values()].sort((x, y) => Math.abs(x.c - num.cal) - Math.abs(y.c - num.cal) || x.own - y.own || x.g.localeCompare(y.g))[0];
    if (best) { like = best.g; cal = best.c; if (best.c !== num.cal) assumed.push('no ' + num.cal + ' mm gun in the game: the nearest, ' + best.c + ' mm (' + best.g + '), is the starting point'); }
  }
  const f = gf(like);
  if (!f) { no('gun'); return null; }
  const g = { name: ((cal ? cal + 'mm_' : 'gun_') + id).slice(0, 40), like, place: lc(base.gun.place || 'gun') }, said = [];
  if (num.reload) { g.recharge = num.reload; said.push('reload ' + num.reload + ' s'); }
  else if (K.reload !== 1 && f.recharge) { g.recharge = Math.round(f.recharge * K.reload * 10) / 10; said.push('reload ' + f.recharge + ' -> ' + g.recharge + ' s'); }
  // penetration: the main shell row's b (100 m) against the asked number, or the trait factor; every row scales (gen pen_scale)
  let pk = K.pen;
  if (num.pen && f.pen && f.pen[1] > 0) pk = num.pen / f.pen[1];
  if (pk !== 1 && f.pen) { g.pen_scale = Math.round(pk * 100) / 100; said.push('penetration at 100 m ' + f.pen[1] + ' -> ' + Math.round(f.pen[1] * pk) + ' mm'); }
  else if (pk !== 1) assumed.push('the gun ' + like + ' has no penetration row to scale: its strength was left as it is');
  // range: range_<n>[_howitzer] one step of 10 per range word
  const rm = /^(\d+)(_howitzer)?$/.exec(String(f.range || ''));
  if (dRange && rm) {
    const n = RANGE_N.indexOf(+rm[1]), to = n < 0 ? -1 : Math.max(0, Math.min(RANGE_N.length - 1, n + dRange));
    if (to >= 0 && to !== n) { g.range = RANGE_N[to] + (rm[2] || ''); said.push('range ' + f.range + ' -> ' + g.range); }
    else assumed.push('the gun\'s range (' + f.range + ') has no step in that direction: range left as it is');
  } else if (dRange) assumed.push('the gun\'s range (' + (f.range || 'none') + ') is not a numbered range: range left as it is');
  if (dAcc) assumed.push('accuracy words are not mapped on Gates of Hell (its accuracy curves have no order): accuracy left as it is');
  if (!said.length && like === lc(base.gun.weapon)) return null;
  g.said = said;
  return g;
}

module.exports = { factsOf, plan, RANGE_N };
