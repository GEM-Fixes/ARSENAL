// unitcard/camera: how each card kind is rendered: the camera (angle, lens, fit) and the light the 3D viewer's picture is taken with.
//   preset(gid, kind, group) -> { kind, group, scene, az, el, fov, ortho, mirror, margin, part, light, why, fitted }
//     scene = what is drawn: 'vehicle' (the vehicle or gun alone, no crew), 'soldier' (the breed's one soldier), 'weapon' (the
//     squad's main weapon alone: an infantry buy card shows a weapon, not a soldier; stack = how many of the squad's weapon types,
//     most carried first, one render each), 'buy' (the whole buy), 'emblem' (nothing is rendered: the game shows an emblem, the kind
//     takes an image or a game badge); az = degrees around the model from its nose (+X) toward its left (+Y), el = degrees above the ground (the
//     camera looks at the model from there; a model's nose is +X, so az 0 = from the front, -90 = its right side); fov = degrees across the picture's height (0 / ortho: a flat view); mirror = the
//     picture's x flipped (default true: the game's own pictures are left-handed, engineFrame right = up x forward, so decals read
//     right only mirrored); margin = part of the picture left free on each side; part = { from, to } in 0..1 of the subject's height:
//     only that band is fitted (a head); light = { az (from the camera's own az), el, amb, dif, sky, grade (colour step) }.
//   view(p, over?) -> the snapshot view of the viewer (tools/gui/ext/models/sub/viewer.client.js viewCam): { az, el, fov, ortho, mirror,
//     fit: 'silhouette', margin, part }; over = { az, el, fov } from the page's boxes (empty = the preset)
//   light(p) -> the snapshot light (viewer viewLight)
//   The viewer fits the frame to the projected mesh (the subject fills the picture); the class numbers of lib/layers.js then size and
//   place it on the plate, so a preset decides the pose, the perspective and the light, not the size.
//   FIT: what each preset was fitted on (render.js renders of units with a game card, compared with the card's subject by silhouette
//   overlap). turn / turnScene: the old trick (a scene turned in front of the viewer's one fixed angle),
//   kept for old callers only.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-4d66d471)
'use strict';
const K = require('./kinds');

// grade = the colour step on the drawn picture (viewer snapGrade: x = (c/255)^gamma, (x-mid)*con+mid, * tint), fitted 2026-11-23 on
// the mean colour and luminance spread of the subject pixels of 6 vehicle cards per game (see FIT light/*)
const G_AS2 = { gamma: 1, con: 1.15, mid: 0.25, tint: [1, 0.98, 0.95] };
const G_GOH = { gamma: 1, con: 1.7, mid: 0.22, tint: [0.93, 0.92, 1.12] };
const L_AS2 = { az: -40, el: 50, amb: 0.5, dif: 0.62, sky: 0.16, grade: G_AS2 };
const L_GOH = { az: -50, el: 40, amb: 0.34, dif: 0.75, sky: 0.12, grade: G_GOH };
// GoH portraits: low-key, a hard side light, a dark far side [I by eye on the game portraits]
const L_GOH_PT = { az: -60, el: 35, amb: 0.22, dif: 0.85, sky: 0.1, grade: G_GOH };
// squad pictures: the game shows an emblem (AS2 rank badge, GoH shield), no soldier: nothing is rendered, the kind takes an image or a
// game badge (scene 'emblem')
const EMBLEM = { scene: 'emblem', az: 0, el: 0, fov: 22, margin: 0.02 };
// [kind][group] with '*' as the fallback of each
const PRESETS = {
  as2: {
    '*': {
      vehicle: { scene: 'vehicle', az: -46, el: 17, fov: 25, margin: 0.02, light: L_AS2, why: 'AS2 vehicle cards and small icons: 3/4 front view from the right side of the vehicle, nose to the lower left, 17 deg from above [V fitted]' },
      gun: { scene: 'vehicle', az: -40, el: 17, fov: 20, margin: 0.02, light: L_AS2, why: 'AS2 gun cards and small icons: 3/4 front view from the right of the gun, barrel to the lower left, 17 deg from above [V fitted]' },
      infantry: { scene: 'weapon', az: 90, el: 90, ortho: true, margin: 0.02, light: L_AS2, why: 'AS2 infantry cards: no soldier, the flat side silhouette of the squad main weapon, barrel to the right, stock left; a weapon model lies on its side (up = -Y), so its side is seen from +Z [V seen on the game cards and renders]' },
      hero: { scene: 'buy', az: -20, el: 6, fov: 20, margin: 0.02, light: L_AS2, why: 'AS2 hero cards are medals, not a figure: a render is only a stand-in [I]' },
    },
    portrait: { '*': { scene: 'soldier', az: 15, el: 4, fov: 22, margin: 0.01, light: L_AS2, why: 'AS2 portraits: the whole soldier standing, chest to the viewer (az 0 shows the idle pose a little turned to his right, 30 to his left; the composer makes it the dark silhouette) [I by eye 2026-11-23]' } },
    squad: { '*': Object.assign({ light: L_AS2, why: 'AS2 squad pictures are rank badges, not a soldier: no render, an image or a game badge [V seen on the game cards]' }, EMBLEM) },
    scheme: { '*': { scene: 'vehicle', az: 180, el: 90, ortho: true, margin: 0.02, light: { az: 0, el: 80, amb: 0.7, dif: 0.3, sky: 0 }, why: 'Damage scheme: from above, flat, nose up [I]' } },
  },
  goh: {
    '*': {
      vehicle: { scene: 'vehicle', az: -60, el: 19, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH vehicle cards: 3/4 front view from the right side, nose to the lower left, 19 deg from above [V fitted]' },
      gun: { scene: 'vehicle', az: -30, el: 8, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH gun cards: 3/4 front view, barrel to the lower left, low (8 deg) [V fitted, IoU about 0.5]' },
      infantry: { scene: 'weapon', az: 90, el: 90, ortho: true, margin: 0.02, stack: 3, light: L_GOH, why: 'GoH infantry cards: the squad weapons from the side, barrels to the right, stocks left; up to 3 weapon types, most carried first, stacked by the composer (stack) [V seen on the game cards and renders]' },
      hero: { scene: 'buy', az: 30, el: 6, fov: 22, margin: 0.02, light: L_GOH, why: 'GoH: as infantry [I]' },
    },
    shop: {
      vehicle: { scene: 'vehicle', az: 45, el: 16, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH shop: 3/4 front, nose to the lower right [V fitted, IoU about 0.53; 10..22 deg fit the same]' },
      gun: { scene: 'vehicle', az: 30, el: 8, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH shop guns: barrel to the right, low as the gun card [I]' },
      '*': { scene: 'soldier', az: 35, el: 6, fov: 22, margin: 0.02, part: { from: 0.78, to: 1 }, light: L_GOH, why: 'GoH shop squads: a head and shoulders [I]' },
    },
    small: {
      vehicle: { scene: 'vehicle', az: -45, el: 10, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH small vehicle icons: 3/4 front, nose to the lower left, lower than the card [V fitted, IoU about 0.53]' },
      gun: { scene: 'vehicle', az: -30, el: 8, fov: 25, margin: 0.02, light: L_GOH, why: 'GoH small gun icons: as the gun card [I]' },
    },
    portrait: { '*': { scene: 'soldier', az: 15, el: 4, fov: 22, margin: 0.02, part: { from: 0.72, to: 1 }, light: L_GOH_PT, why: 'GoH portraits: head and shoulders nearly from the front, eye level, low-key light [I by eye 2026-11-23]' } },
    squad: { '*': Object.assign({ light: L_GOH, why: 'GoH squad pictures are an emblem on a shield, not a soldier: no render, an image or a game badge [V seen on the game cards]' }, EMBLEM) },
  },
};
// what each preset was fitted on (filled by the fitting runs; empty = chosen by eye)
const FIT = {
  'as2/*/vehicle': { on: 'as64 card: achilles chi-to hetzer jagdpanther m26e4 m4a4_tulip ostwind_ger2 pz4g_ger2 t20 (sdkfz250_1 has no model)', az: -46, el: 17, iou: 0.92 },
  'as2/*/gun': { on: 'as64 card: pak40 pak38 zis3 m1_57mm qf6 qf17 flak37 lefh18 m5 type94', az: -40, el: '13..20', iou: 0.72, note: 'type94 0.26 (an odd model), the rest 0.70..0.84' },
  'goh/*/vehicle': { on: 'goh card: bt2 crusader_mk1 kv1_40e_fin m36b1_gmc m4a1_75_mid_armor m4a3_76w_field2 matilda2_mk4_cs su100y t26e valentine_mk3', az: -60, el: '16..22', iou: 0.59, note: 'GoH cards paint a backdrop and smoke behind the vehicle, so the overlap stays lower' },
  'as2/*/infantry': { on: 'as64 and goh infantry buy cards looked at: a weapon side view, stock left, barrel right', az: 90, el: 90, iou: null },
  'goh/*/gun': { on: 'goh card: 100mm_bs3 300mm_nebelwerfer42 76mm_m1927', az: '-30 (grid -75..-15)', el: '8 (grid 4..20)', iou: 0.51, note: 'quick pass, 3 units' },
  'goh/shop/vehicle': { on: 'goh shop: 150mm_sw34 m18_hellcat sdkfz251c_2', az: '45 (grid 30..60 and -60..-45)', el: '16 (10..22 within 0.002)', iou: 0.527, note: 'quick pass, 3 units' },
  'goh/small/vehicle': { on: 'goh small: 150mm_sw34 m24_chaffee sdkfz251d_1_stuka', az: -45, el: 10, iou: 0.535, note: 'quick pass, 3 units; the cut loses what lies in the badge zone' },
  'as2/portrait/*': { on: 'as64 bazookers(ger) rendered at az 0 and 60 beside the game portraits', az: 15, iou: null, note: 'by eye: the game portraits are a front-facing dark silhouette' },
  'goh/portrait/*': { on: 'goh game portraits looked at', az: 15, iou: null, note: 'by eye, not rendered against them: head and shoulders, low-key' },
  // the light: the colour step (grade) fitted on the subject pixels (render alpha > 200 vs the game card subject mask: AS2 frame 0 = frame
  // 2, GoH differs from the class median plate), mean RGB and luminance spread
  'light/as2': { on: 'as64 card: achilles hetzer jagdpanther m26e4 pz4g_ger2 t20', before: 'mean 64,65,61 sd 38 (game 65,65,60 sd 43)', after: 'mean 64,64,58 sd 43', grade: G_AS2, note: 'the mean was right; the renders were flatter and a little blue (hetzer, jagdpanther, pz4g); per-unit error 7.6 (was 7.8), the rest is the textures' },
  'light/goh': { on: 'goh card: bt2 crusader_mk1 kv1_40e_fin m36b1_gmc su100y valentine_mk3', before: 'mean 55,52,44 sd 23 (game 49,46,43 sd 38)', after: 'mean 51,47,42 sd 35', grade: G_GOH, note: 'renders were too flat and too bright, red = green; per-unit error 4.9 (was 11.1)' },
};

function preset(gid, kind, group) {
  const fam = K.family(gid), P = PRESETS[fam];
  const byKind = P[kind] || P['*'], g = group || 'vehicle';
  const p = byKind[g] || byKind['*'] || P['*'][g] || P['*'].vehicle;
  const key = fam + '/' + (P[kind] ? kind : '*') + '/' + (byKind[g] ? g : '*');
  const f = FIT[key] || FIT[fam + '/' + kind + '/' + g] || null;
  return Object.assign({ kind, group: g, key, ortho: false, mirror: true, part: null, fitted: f }, p);
}
const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
function view(p, over) {
  over = over || {};
  const v = { az: num(over.az, p.az), el: num(over.el, p.el), fov: p.ortho ? 0 : num(over.fov, p.fov || 30), ortho: !!p.ortho, mirror: !!p.mirror, fit: 'silhouette', margin: p.margin == null ? 0.02 : p.margin };
  if (p.part) v.part = { from: p.part.from, to: p.part.to };
  return v;
}
function light(p) { const l = p.light || L_AS2, o = { az: l.az, el: l.el, amb: l.amb, dif: l.dif, sky: l.sky }; if (l.grade) o.grade = { gamma: l.grade.gamma, con: l.grade.con, mid: l.grade.mid, tint: l.grade.tint.slice() }; return o; }

// ---------- the old trick, for old callers only: the scene turned so the viewer's fixed picture angle (SHOT0) sees it from (az, el) ----------
const SHOT_FROM = [156.41, 118.91, 77.31], SHOT_AT = [25.68, -36.04, 2.61];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function frame(F) {
  F = norm(F); let up = [0, 0, 1];
  if (Math.abs(dot(F, up)) > 0.999) up = [1, 0, 0];
  const Uu = norm([up[0] - dot(up, F) * F[0], up[1] - dot(up, F) * F[1], up[2] - dot(up, F) * F[2]]);
  return [F, Uu, cross(Uu, F)];
}
function turn(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  const m = frame([Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]);
  const w = frame([SHOT_FROM[0] - SHOT_AT[0], SHOT_FROM[1] - SHOT_AT[1], SHOT_FROM[2] - SHOT_AT[2]]);
  const Q = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Q[r][c] += w[i][r] * m[i][c];
  return [Q[0][0], Q[1][0], Q[2][0], Q[0][1], Q[1][1], Q[2][1], Q[0][2], Q[1][2], Q[2][2], 0, 0, 0];
}
function mul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j];
  return r;
}
const apply = (p, M) => [p[0] * M[0] + p[1] * M[3] + p[2] * M[6] + M[9], p[0] * M[1] + p[1] * M[4] + p[2] * M[7] + M[10], p[0] * M[2] + p[1] * M[5] + p[2] * M[8] + M[11]];
function turnScene(scene, M) {
  if (!scene) return scene;
  const b = scene.bounds, c = b ? [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2) : [0, 0, 0];
  const T = mul([1, 0, 0, 0, 1, 0, 0, 0, 1, -c[0], -c[1], -c[2]], M);
  const out = Object.assign({}, scene, { meshes: (scene.meshes || []).map(m => Object.assign({}, m, { world: m.world ? mul(Array.from(m.world), T) : T })) });
  if (b) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) { const p = apply([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]], T); for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], p[j]); mx[j] = Math.max(mx[j], p[j]); } }
    out.bounds = { min: mn, max: mx };
  }
  if (scene.bones) out.bones = [];
  if (scene.volumes) out.volumes = [];
  return out;
}
module.exports = { PRESETS, FIT, preset, view, light, turn, turnScene, mul, apply };
