// sight vision: the vision profile (vprof, rules.md 3.2) of a stack, and rangeM.
//   profile(src) -> vprof   resource/set/vision/vision.set of the stack (sdlx: macros, includes, arithmetic expanded;
//                           (mod "mp" ..) taken, (mod not "mp" ..) left out), else the vanilla table (note
//                           SIGHT_VISION_VANILLA). A viewer preset that is missing or has no radius: the table row for it,
//                           note SIGHT_VISION_ROW_BAD.
//   rangeM(vprof, viewer, target, o?) -> metres   viewer inf|mg|at|tank|officer; target inf|mg|at|tank|officer
//                           (officer as inf); o {pose, cover, firing, still, stealth}
//   evalRules(rules, conds) -> factor the engine walk ( [V]): siblings in order, the first
//                           whose property holds sets the factor and is entered, a leaf ends the walk; mods multiply.
//   STATES, CLASS, VIEWERS
// Rule model [V]: radius x factor of the deepest matched rule (replace, not multiply), x every
// mod whose property holds. Both games use it: AS2 radius 52.5 x human 1 = 52.5 m; GoH radius 1 x human 100 = 100 m
// (the GoH rule numbers are metres at radius 1). vprof stores radiusM = radius x rule(human, stand) and per viewer the
// factors of each target state over that (rules.md ruling 4), so rangeM = radiusM x factor on every game.
// Author: Imperator_Aug (ARSENAL, ia-b560f9e5)
'use strict';

const VISION_KEY = 'resource/set/vision/vision.set';
const BINO_KEY = 'resource/set/stuff/special/binocular';

// target state -> the properties that hold (pose: stand, squat, crawl) [I: a first spotting, so 'visible' never holds]
const STATES = Object.freeze({
  stand: ['stand'], kneel: ['squat'], prone: ['crawl'],
  standCover: ['cover', 'stand'], kneelCover: ['cover', 'squat'], proneCover: ['cover', 'crawl'],
  firing: ['firing', 'stand'], still: ['still', 'stand'], stealth: ['stealth', 'stand'],
});
// the vision class term of each target kind [I]
const CLASS = Object.freeze({
  as2: { inf: 'human', officer: 'human', mg: 'cannon_01', at: 'cannon_02', tank: 'vehicle_03' },
  goh: { inf: 'human', officer: 'human', mg: 'cannon_00', at: 'cannon_02', tank: 'vehicle_04' },
});
// the vision preset of each viewer kind [I: the presets the vanilla unit kinds use]
const VIEWERS = Object.freeze({
  as2: { inf: 'human', mg: 'cannon_mgun', at: 'cannon_main', tank: 'tank_main-m', officer: 'mp_officer' },
  goh: { inf: 'human', mg: 'human', at: 'cannon_main', tank: 'tank_main-m', officer: 'human_elite' },
});
const RADIUS_FACTOR = { as2: 0.75, goh: 1.0 };

// ---------------------------------------------------------------- vanilla table (read from the installs 2026-11-14)
// rule node: [property, factor, kids?]
const AS2_HUMAN_KIDS = [['firing', 1.15], ['cover', 0.8, [['stand', 0.8, [['stealth', 0.4]]], ['squat', 0.6, [['stealth', 0.3]]], ['crawl', 0.4, [['stealth', 0.2]]]]],
  ['squat', 0.8, [['stealth', 0.4]]], ['crawl', 0.6, [['stealth', 0.3], ['still', 0.4, [['stealth', 0.2]]]]], ['still', 0.9], ['visible', 1]];
const AS2_REST = [['cannon_01', 1, [['firing', 1.1], ['visible', 1], ['still', 1]]], ['cannon_02', 1.1, [['firing', 1.2], ['visible', 1.1], ['still', 1.1]]],
  ['cannon_03', 1.2, [['firing', 1.3], ['visible', 1.2], ['still', 1.2]]], ['cannon_04', 1.3, [['firing', 1.4], ['visible', 1.3], ['still', 1.3]]],
  ['cannon_05', 1.4, [['firing', 1.5], ['visible', 1.4], ['still', 1.4]]], ['vehicle_01', 1.1, [['firing', 2], ['visible', 1.6], ['still', 1.6]]],
  ['vehicle_02', 1.8, [['firing', 2.25], ['visible', 1.7], ['still', 1.7]]], ['vehicle_03', 2, [['firing', 2.5], ['visible', 1.8], ['still', 1.8]]],
  ['vehicle_04', 2.2, [['firing', 2.75], ['visible', 1.9], ['still', 1.9]]], ['vehicle_05', 2.4, [['firing', 3], ['visible', 2], ['still', 2]]]];
const as2Rules = h => [['human', h, AS2_HUMAN_KIDS.map(k => k[0] === 'firing' && h !== 1 ? ['firing', 0.85] : k)]].concat(AS2_REST);
const GOH_HUMAN_KIDS = [['firing', 150], ['visible', 100], ['cover', 100, [['stand', 100, [['stealth', 50]]], ['squat', 100, [['stealth', 50]]], ['crawl', 50, [['stealth', 25]]]]],
  ['stand', 100, [['stealth', 75], ['still', 100, [['stealth', 50]]]]], ['squat', 100, [['stealth', 50], ['still', 100, [['stealth', 50]]]]],
  ['crawl', 50, [['stealth', 30], ['still', 50, [['stealth', 25]]]]]];
function gohRules(s) {   // s = 1 human eye, 2/3 optics (cannon_main, tank_main-m)
  const sc = (n) => [n[0], Math.round(n[1] * s * 1000) / 1000, n[2] ? n[2].map(sc) : undefined];
  const out = [['human', Math.round(100 * s * 1000) / 1000, GOH_HUMAN_KIDS.map(sc)]];
  const fire = s === 1 ? 170 : 146.667, vis = s === 1 ? 150 : 133.333;
  for (let i = 0; i <= 5; i++) out.push(['cannon_0' + i, 100, [['firing', fire], ['visible', vis], ['still', 100]]]);
  out.push(['vehicle_00', 100, [['firing', fire], ['visible', 100], ['still', 100]]]);
  for (let i = 1; i <= 6; i++) out.push(['vehicle_0' + i, vis, [['firing', fire], ['visible', vis], ['still', 100]]]);
  return out;
}
const VANILLA = {
  as2: {
    presets: {
      human: { radius: 52.5, uncover: 7, hFov: 70, vFov: 200, rules: as2Rules(1) },
      mp_soldier: { radius: 52.5, uncover: 10, hFov: 150, vFov: 200, rules: as2Rules(1) },
      mp_officer: { radius: 52.5, uncover: 50, hFov: 180, vFov: 200, rules: as2Rules(1) },
      cannon_mgun: { radius: 52.5, uncover: 5, hFov: 50, vFov: 140, rules: as2Rules(1) },
      cannon_main: { radius: 67.5, uncover: 5, hFov: 60, vFov: 140, rules: as2Rules(0.75) },
      'tank_main-m': { radius: 67.5, uncover: 5, hFov: 25, vFov: 140, rules: as2Rules(0.75) },
      field_glass: { radius: 18.75, uncover: 5, hFov: 360, vFov: 120, rules: [['zero', 0]] },
      flag_point: { radius: 20, uncover: 20, hFov: 360, vFov: 180, rules: [] },
    },
    binoReach: 180,
  },
  goh: {
    presets: {
      human: { radius: 1, uncover: 20, hFov: 150, vFov: 180, rules: gohRules(1) },
      human_elite: { radius: 1.1, uncover: 20, hFov: 150, vFov: 180, rules: gohRules(1 / 1.1) },
      cannon_main: { radius: 1.5, uncover: 25, hFov: 30, vFov: 170, rules: gohRules(2 / 3) },
      'tank_main-m': { radius: 1.5, uncover: 20, hFov: 15, vFov: 30, rules: gohRules(2 / 3) },
      field_glass: { radius: 30, uncover: 30, hFov: 360, vFov: 120, rules: [] },
      flag_point: { radius: 20, uncover: 20, hFov: 360, vFov: 180, rules: [] },
    },
    binoReach: 200,
  },
};
const nodeOf = a => ({ p: a[0], f: a[1], kids: (a[2] || []).map(nodeOf) });

// ---------------------------------------------------------------- rule walk
// rules: [{p, f, kids}]; conds: Set or array of properties that hold; mods: [{p, f}]
function evalRules(rules, conds, mods) {
  const has = conds instanceof Set ? conds : new Set(conds || []);
  let factor = 1, list = rules || [];
  for (;;) {
    const hit = list.find(r => has.has(r.p));
    if (!hit) break;
    factor = hit.f;
    if (!hit.kids || !hit.kids.length) break;
    list = hit.kids;
  }
  for (const m of mods || []) if (has.has(m.p)) factor *= m.f;
  return factor;
}

// ---------------------------------------------------------------- reading vision.set
function gameOf(t) { return t === 'goh' ? 'goh' : 'as2'; }

// items of a block with (mod "mp" ..) taken and (mod not "mp" ..) left out (multiplayer maps)
function items(b) {
  const out = [];
  (function walk(list) {
    for (const x of list || []) {
      if (x.k === 'MOD') { const on = String(x.name || '').toLowerCase() === 'mp'; if (x.not ? !on : on) walk(x.items); }
      else out.push(x);
    }
  })(b && b.items);
  return out;
}
const wordOf = x => x.k === 'STRING' ? x.value : x.k === 'IDENT' ? x.text : (x.k === 'INTEGER' || x.k === 'FLOAT') ? Number(x.value) : undefined;
const wordsOf = b => items(b).filter(x => x.k !== 'BLOCK').map(wordOf);
const blocksOf = b => items(b).filter(x => x.k === 'BLOCK' && !x.disabled);
const headOf = b => { const w = wordsOf(b); return w.length ? String(w[0]).toLowerCase() : ''; };
const numOf = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

function rulesOf(b) {
  return blocksOf(b).map(r => { const w = wordsOf(r); return { p: String(w[0]).toLowerCase(), f: numOf(w[1]) === null ? 1 : w[1], kids: rulesOf(r) }; });
}
function presetOf(b) {
  const one = name => { const k = blocksOf(b).find(x => headOf(x) === name); return k ? numOf(wordsOf(k)[1]) : null; };
  const rb = blocksOf(b).find(x => headOf(x) === 'rules');
  const mb = blocksOf(b).find(x => headOf(x) === 'mods');
  return { radius: one('radius'), uncover: one('uncover'), hFov: one('h_fov'), vFov: one('v_fov'),
    rules: rb ? rulesOf(rb) : [], mods: mb ? blocksOf(mb).map(m => { const w = wordsOf(m); return { p: String(w[0]).toLowerCase(), f: numOf(w[1]) === null ? 1 : w[1] }; }) : [] };
}

function readStack(src, notes) {
  if (!src || typeof src.has !== 'function' || !src.has(VISION_KEY)) return null;
  const S = require('../../lib/mapkit/sdl');
  let r;
  try { r = S.parse(src, VISION_KEY); } catch (e) { notes.push({ code: 'SIGHT_VISION_ROW_BAD', msg: 'vision.set does not parse: ' + (e && e.message || e) }); return null; }
  const top = blocksOf(r.root).find(b => headOf(b) === 'visions') || r.root;
  const presets = {};
  for (const b of blocksOf(top)) {
    const w = wordsOf(b);
    if (typeof w[0] !== 'string') continue;
    presets[w[0].toLowerCase()] = presetOf(b);
  }
  let bino = null;
  if (src.has(BINO_KEY)) {
    try {
      const br = S.parse(src, BINO_KEY);
      (function find(b) {
        for (const k of blocksOf(b)) {
          if (bino !== null) return;
          if (headOf(k) === 'range') { const w = wordsOf(k).slice(1).filter(v => numOf(v) !== null); if (w.length) bino = Math.max(...w); return; }
          find(k);
        }
      })(br.root);
    } catch (e) { bino = null; }
  }
  return { presets, binoReach: bino };
}

// ---------------------------------------------------------------- vprof
function vanillaPreset(game, name) {
  const p = VANILLA[game].presets[name];
  return p ? { radius: p.radius, uncover: p.uncover, hFov: p.hFov, vFov: p.vFov, rules: p.rules.map(nodeOf), mods: [] } : null;
}

function profile(src) {
  const target = src && src.target;
  const game = gameOf(target);
  const notes = [];
  const st = readStack(src, notes);
  if (!st) notes.push({ code: 'SIGHT_VISION_VANILLA', msg: VISION_KEY + ' not in the stack; vanilla ' + game + ' table used' });
  const take = (name, need) => {
    const p = st && st.presets[name];
    if (p && numOf(p.radius) !== null && (!need || p.rules.length)) return { p, at: VISION_KEY + ' "' + name + '"', from: 'stack' };
    if (st) notes.push({ code: 'SIGHT_VISION_ROW_BAD', msg: 'vision preset "' + name + '" ' + (p ? 'has no radius or rules' : 'is missing') + '; vanilla row used' });
    return { p: vanillaPreset(game, name), at: 'vanilla table "' + name + '"', from: 'vanilla' };
  };
  const cls = CLASS[game];
  const viewers = {};
  let infFactors = null;
  for (const [kind, preset] of Object.entries(VIEWERS[game])) {
    const t = take(preset, true);
    const p = t.p;
    const base = evalRules(p.rules, ['human'].concat(STATES.stand), p.mods) || 1;
    const radiusM = r3(p.radius * base);
    const factors = {};
    for (const [tk, c] of Object.entries(cls)) {
      if (tk === 'officer') continue;
      factors[tk] = {};
      for (const [s, conds] of Object.entries(STATES)) factors[tk][s] = r6(evalRules(p.rules, [c].concat(conds), p.mods) / base);
    }
    viewers[kind] = { radiusM, uncoverM: numOf(p.uncover) === null ? 0 : p.uncover, hFovDeg: p.hFov, vFovDeg: p.vFov, preset, at: t.at, factors };
    if (kind === 'inf') infFactors = factors;
  }
  const fg = take('field_glass', false), fl = take('flag_point', false);
  const reach = st && numOf(st.binoReach) !== null ? st.binoReach : VANILLA[game].binoReach;
  viewers.binocular = { reachM: reach, discM: fg.p.radius, uncoverM: fg.p.uncover, at: (st && numOf(st.binoReach) !== null ? BINO_KEY : 'vanilla table') + ' range; ' + fg.at };
  viewers.flag = { radiusM: fl.p.radius, uncoverM: fl.p.uncover, at: fl.at };
  const anyStack = !!st;
  return { v: 1, game, source: anyStack ? 'stack' : 'vanilla', radiusFactor: RADIUS_FACTOR[game], viewers, factors: infFactors, notes };
}
const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;
const r6 = v => Math.round(v * 1e6) / 1e6;

// state name of an o {pose, cover, firing, still, stealth}
function stateOf(o) {
  o = o || {};
  if (o.firing) return 'firing';
  const pose = o.pose === 'kneel' ? 'kneel' : o.pose === 'prone' ? 'prone' : 'stand';
  if (o.cover) return pose + 'Cover';
  if (o.stealth && pose === 'stand') return 'stealth';
  if (o.still && pose === 'stand') return 'still';
  return pose;
}

function rangeM(vprof, viewer, target, o) {
  const v = vprof && vprof.viewers && vprof.viewers[viewer];
  if (!v || typeof v.radiusM !== 'number') throw Object.assign(new Error('no viewer ' + viewer + ' in the vision profile'), { code: 'SIGHT_VIEWER' });
  const t = target === 'officer' ? 'inf' : target;
  const table = (v.factors && v.factors[t]) || (vprof.factors && vprof.factors[t]);
  if (!table) throw Object.assign(new Error('no target ' + target + ' in the vision profile'), { code: 'SIGHT_TARGET' });
  const f = table[stateOf(o)];
  return r2(v.radiusM * (typeof f === 'number' ? f : 1));
}

module.exports = { profile, rangeM, evalRules, stateOf, STATES, CLASS, VIEWERS, VANILLA, gameOf, VISION_KEY };
