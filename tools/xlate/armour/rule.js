// Author: Imperator_Aug (ARSENAL, ia-b6377433)
'use strict';
// GL-3 / XLATE-2: GoH vehicle armour -> mowas2 armour-area thickness (front, side, rear, top) for body and turret.
//   const { armourRule } = require('./tools/xlate/armour/rule.js');
//   armourRule('tank_medium', volumes) -> { body:{front,side,rear,top}, turret:{...}|null, how:{body:{front:'mode'|'peer'},...}, flags:[...] }
// volumes: GoH per-volume thickness as statsheet.armorOf gives them: [{ name, sides:{front,left,right,rear,top} }] (v.s also accepted).
// Rule [V from data, [T] in game]:
//   tank_light / tank_medium / tank_heavy: per part (body = volumes named body*|hull*, turret = turret*) and face, the MODE of the
//     non-zero thickness over that part's volumes (ties: the larger), copied 1:1. side = max(left,right) per volume.
//     A tank class whose table.json entry says use:'peer' (held-back error not under 17%, or under 10 stems; tank_heavy is exempt from the stems line, ARMF-1F) gets the peer value too.
//   every other class (car, btr, cannon, airborne, ...): the class peer value (AS2 native median per part and face) from table.json.
//   no matching volume for a face: peer value, flagged.
// Mass, health, durability are not touched here.
const fs = require('fs'), path = require('path');
let TABLE = null;
function table() { if (!TABLE) { try { TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'table.json'), 'utf8')); } catch (e) { TABLE = { peer: {}, classes: {} }; } } return TABLE; }
const FACES = ['front', 'side', 'rear', 'top'];
const PART = { body: /^(body|hull)/i, turret: /^turret/i };
const TANK = new Set(['tank_light', 'tank_medium', 'tank_heavy']);

function mode(l) {
  const c = new Map(); for (const x of l) c.set(x, (c.get(x) || 0) + 1);
  let best = null; for (const [v, n] of c) if (!best || n > best[1] || (n === best[1] && v > best[0])) best = [v, n];
  return best ? best[0] : null;
}
function faceList(volumes, part, f) {
  const out = [];
  for (const v of volumes) {
    if (!PART[part].test(v.name || '')) continue;
    const s = v.sides || v.s || {};
    const x = f === 'side' ? Math.max(s.left || 0, s.right || 0) : (s[f] || 0);
    if (x > 0) out.push(x);
  }
  return out;
}
function armourRule(cls, volumes, opt) {
  const T = (opt && opt.table) || table(), peer = (T.peer && T.peer[cls]) || {};
  const res = { body: {}, turret: {}, how: { body: {}, turret: {} }, flags: [] };
  let any = { body: false, turret: false };
  const cc0 = (T.classes || {})[cls], useMode = TANK.has(cls) && !(cc0 && cc0.use === 'peer');
  for (const part of ['body', 'turret']) for (const f of FACES) {
    const l = useMode ? faceList(volumes || [], part, f) : [];
    const m = l.length ? mode(l) : null;
    const pv = peer[part] && peer[part][f] !== undefined ? peer[part][f] : null;
    if (m !== null) { res[part][f] = m; res.how[part][f] = 'mode'; any[part] = true; }
    else if (pv !== null) { res[part][f] = pv; res.how[part][f] = 'peer'; if (TANK.has(cls)) if (useMode) res.flags.push(`${part}.${f}: no volume, class peer value`); }
  }
  if (!any.turret && !Object.keys(res.turret).length) res.turret = null;
  const cc = (T.classes || {})[cls];
  if (cc && cc.confidence === 'weak') res.flags.push(`${cls}: weak rule (${cc.note})`);
  if (TANK.has(cls) && !useMode) res.flags.push(`${cls}: class peer value (too few units to hold back); see table.json units`);
  if (useMode && cc && cc.p5 && res.body.front !== undefined && (res.body.front < cc.p5.body_front || res.body.front > cc.p95.body_front)) res.flags.push('body.front outside AS2 class p5..p95');
  return res;
}
module.exports = { armourRule, mode, faceList, FACES, TANK };

if (require.main === module) {
  // self-test on invented volumes
  const vols = [{ name: 'body', sides: { front: 40, left: 30, right: 30, rear: 20, top: 15 } }, { name: 'body1', sides: { front: 40, left: 30, right: 25, rear: 20, top: 10 } },
    { name: 'body2', sides: { front: 60, left: 30, right: 30, rear: 20, top: 10 } }, { name: 'turret', sides: { front: 70, left: 50, right: 50, rear: 45, top: 20 } }, { name: 'trackleft', sides: { front: 20, left: 20, right: 20, rear: 20, top: 20 } }];
  const fake = { peer: { tank_medium: { body: { front: 1, side: 2, rear: 3, top: 4 }, turret: { front: 5, side: 6, rear: 7, top: 8 } }, car: { body: { front: 9, side: 9, rear: 9, top: 9 } } } };
  const r = armourRule('tank_medium', vols, { table: fake });
  const ok = r.body.front === 40 && r.body.side === 30 && r.body.rear === 20 && r.body.top === 10 && r.turret.front === 70 && r.how.body.front === 'mode';
  const c = armourRule('car', vols, { table: fake });
  const ok2 = c.body.front === 9 && c.turret === null && c.how.body.front === 'peer';
  const e = armourRule('tank_medium', [], { table: fake });
  const ok3 = e.body.front === 1 && e.flags.length === 8;
  console.log(ok && ok2 && ok3 ? 'rule.js self-test: pass 3/3' : 'rule.js self-test: FAIL ' + JSON.stringify({ ok, ok2, ok3, r, c, e }));
  // ARMF-1F: heavy tanks follow their own volumes, through the real table.json and the code that writes the block. Stems are labels; every thickness is invented, only the shape (plain plates, extra hull_armor plates) follows the real units.
  const TR = require('../../goh2as2/translate.js');
  const vol = (name, front, side, rear, top) => `{volume "${name}" {thickness 10 {front ${front}}{left ${side}}{right ${side}}{rear ${rear}}{top ${top}}}}\r\n`;
  const REPS = {
    tiger_p: { key: 'germany/tank_heavy/tiger_p/tiger_p', vols: vol('body1', 190, 80, 80, 24) + vol('body2', 190, 80, 80, 24) + vol('body3', 190, 80, 80, 24) + vol('turret', 95, 80, 80, 24), body: '190 80 80 24', turret: '95 80 80 24' },
    'us-m26e4_pershing': { key: 'usaf/tank_heavy/us-m26e4_pershing/us-m26e4_pershing', vols: vol('body1', 110, 70, 55, 20) + vol('body2', 75, 70, 55, 20) + vol('body3', 110, 70, 55, 20) + vol('turret1', 105, 70, 72, 26) + vol('turret2', 105, 70, 72, 26), body: '110 70 55 20', turret: '105 70 72 26' },
    kv1_l11_40: { key: 'ussr/tank_heavy/kv1_40/kv1_l11_40', vols: vol('body1', 70, 70, 12, 38) + vol('hull_armor1', 95, 95, 95, 60) + vol('hull_armor2', 95, 95, 95, 95) + vol('turret1', 72, 72, 72, 36) + vol('turret2', 72, 72, 72, 72) + vol('turret3', 72, 72, 72, 72), body: '95 95 95 95', turret: '72 72 72 72' },
  };
  const DONOR = '{game_entity\r\n\t("armor_heavy" turret(1 2 3 4) body(5 6 7 8) body2(32 43 25 25) body3(63 43 25 25))\r\n}\r\n';
  const written = {};
  for (const [s, x] of Object.entries(REPS)) written[s] = /\("armor_heavy"[^\r\n]*\)/.exec(TR.translate({ text: DONOR, repAll: '{game_entity\r\n' + x.vols + '}\r\n', repKey: `entity/-vehicle/${x.key}.def`, donorKey: 'resource/entity/-vehicle/tank_heavy/donor/donor.def', vf: { files: new Map() }, vfsLib: null, types: null, unit: s, opt: { ask: 'off' }, extract: () => ({ k: {} }), add: () => {}, info: () => {} }).text)[0];
  const ok4 = new Set(Object.values(written)).size === 3;
  const ok5 = Object.entries(REPS).every(([s, x]) => written[s] === `("armor_heavy" turret(${x.turret}) body(${x.body}) body2(32 43 25 25) body3(63 43 25 25))`);
  const hp = table().peer.tank_heavy, h = armourRule('tank_heavy', [{ name: 'body1', sides: { front: 90, left: 40, right: 40, rear: 30 } }]);
  const ok6 = h.body.front === 90 && h.how.body.front === 'mode' && h.body.top === hp.body.top && h.how.body.top === 'peer' && h.how.turret.front === 'peer' && h.flags.includes('body.top: no volume, class peer value') && h.flags.includes('turret.front: no volume, class peer value');
  const big = [{ name: 'body', sides: { front: 99, left: 99, right: 99, rear: 99, top: 99 } }, { name: 'turret', sides: { front: 99, left: 99, right: 99, rear: 99, top: 99 } }];
  const ok7 = ['car', 'btr', 'cannon'].every(k => { const p = armourRule(k, big); return p.body.front !== 99 && p.how.body.front === 'peer'; });
  const names = ['heavy blocks not equal', 'heavy block = mode of own volumes, donor body2 body3 kept', 'heavy face with no volume = flagged peer', 'car btr cannon stay peer'], res4 = [ok4, ok5, ok6, ok7];
  res4.forEach((g, i) => console.log((g ? 'ok   ' : 'FAIL ') + 'ARMF-1F: ' + names[i] + (g ? '' : '  ' + JSON.stringify(i < 2 ? written : h.flags))));
  process.exit(ok && ok2 && ok3 && res4.every(Boolean) ? 0 : 1);
}
