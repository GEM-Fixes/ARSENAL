// previews safe area: warnings for flags and spawns the game's loading screen may hide (previews.md 5; design 10).
//   safeArea(target, mapKind, size, frame, points, o?) -> [warning]
//     target 'as64'|'mowas2'|'goh'; mapKind 'mp'|'sp'; size [W, H] of the preview; frame = world box drawn into it
//     (stretched per axis); points [{what:'flag'|'spawn', name, x, y}] (centre points; zones are not tested).
//     o.id = target id (default 'preview'): only the preview is tested (small, header, header_interface and minimap are
//     stretched into fixed boxes or filled, no warnings).
//   warning {code, what, name, at:[x, y] (world u), px:[x, y] (target px, row 0 = top)}
// Rules: as64, mowas2 (MP and SP) and goh MP: top or bottom 16% of the height -> PRV_SAFE_TOP / PRV_SAFE_BOTTOM (the cover
// crop of the loading page [V], thresholds [I G9]); x outside the 4:3
// centre, strict (x < 12.5% or x > 87.5% of the width) -> PRV_SAFE_SIDE [I G9]. goh SP: x >= 50% -> PRV_GOH_DESK (the mission
// desk panel covers the right half [V PageLoadingSingle.xml]). goh MP uses the as64 rules, a ruling [I G9].
// Author: Imperator_Aug (ARSENAL, ia-43f6d85d)
'use strict';

function toPx(frame, size, x, y) {
  const fx = (x - frame[0]) / (frame[2] - frame[0]), fy = (frame[3] - y) / (frame[3] - frame[1]);
  return { fx, fy, px: [Math.round(fx * size[0]), Math.round(fy * size[1])] };
}

function safeArea(target, mapKind, size, frame, points, o) {
  const id = (o && o.id) || 'preview';
  const out = [];
  if (id !== 'preview') return out;
  for (const p of points || []) {
    const { fx, fy, px } = toPx(frame, size, p.x, p.y);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;      // not in the picture (crop)
    const w = code => out.push({ code, what: p.what, name: p.name, at: [p.x, p.y], px: px.slice() });
    if (target === 'goh' && mapKind === 'sp') { if (fx >= 0.5) w('PRV_GOH_DESK'); continue; }
    if (fy < 0.16) w('PRV_SAFE_TOP');
    else if (fy > 0.84) w('PRV_SAFE_BOTTOM');
    if (fx < 0.125 || fx > 0.875) w('PRV_SAFE_SIDE');
  }
  return out;
}

module.exports = { safeArea, toPx };
