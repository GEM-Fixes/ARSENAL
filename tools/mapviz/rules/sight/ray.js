// sight ray: the engine's line of sight over the sight grid ( point test, cell line).
//   canSee(sg, a, b, o?) -> bool             o {uncoverU, rangeU, vFovDeg}
//   visibleHeight(sg, a, b, o?) -> z | null | Infinity   lowest visible world z at b (u)
//   hiddenValue(sg, a, b, o?) -> value | null    the same in level units (float)
//   cellOf(sg, x, y) -> {i, j} | null         ToCellX: the nearest cell corner, trunc((x + C/2 - ox) / C) [V]
//   toValue(sg, z), Line                      ToValue = (z - hMin) / step as a float [V]
// sg = {grid, ground, field} grid objects of rules/sight grid (meta cellU, hMinU, stepU). a, b world u {x, y, z}.
// Port [V, 397-420]:
//   cell line: Bresenham from the eye cell, value = step / length x (end - start) + start.
//   IsClear(line, ToValue(b.z) + 1): one step; the low view bound (pitch 0 [I], v_fov / 2 down, at the distance of the
//   first step's cell) fails the line when it is not under the line there; then each cell: its value, or its ground
//   value when the field is 2 (soft) and the cell is inside uncover (uncover cells > step x step length); a value at or
//   over the line hides. The last cell (the target's) is tested too. The eye cell itself: seen.
//   Out of the grid, or not rangeU > distance (cells x C), is not seen.
// hFov is not tested: the spot looks all round (ruling, sight.view).
// Author: Imperator_Aug (ARSENAL, ia-be945601)
'use strict';

function M(sg) {
  const g = sg.grid, m = g.meta || {};
  const C = m.cellU || g.cell;
  return { g, ground: sg.ground || g, field: sg.field || null, C, ox: g.ox, oy: g.oy, w: g.w, h: g.h,
    hMin: m.hMinU !== undefined ? m.hMinU : g.offset, step: m.stepU !== undefined ? m.stepU : g.scale };
}
function cellOf(sg, x, y) {
  const S = sg.C ? sg : M(sg);
  const fx = (x + S.C / 2 - S.ox) / S.C, fy = (y + S.C / 2 - S.oy) / S.C;
  if (!(fx >= 0 && fy >= 0)) return null;
  const i = Math.trunc(fx), j = Math.trunc(fy);
  if (i >= S.w || j >= S.h) return null;
  return { i, j };
}
const toValue = (S, z) => (z - S.hMin) / S.step;

class Line {
  constructor(fi, fj, ti, tj, value) {
    this.start = value; this.end = value;
    const dx = ti - fi, dy = tj - fj, ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay) { this.length = ax; this.short = ay; this.axis = 0; } else { this.length = ay; this.short = ax; this.axis = 1; }
    this.error = 0; this.step = 0;
    this.stepLength = Math.sqrt(dx * dx + dy * dy) / this.length;
    this.pos = [fi, fj];
    this.dir = [dx >= 0 ? 1 : -1, dy >= 0 ? 1 : -1];
  }
  next() {
    if (this.step >= this.length) return false;
    this.step++;
    this.pos[this.axis] += this.dir[this.axis];
    this.error += this.short;
    if (this.error > this.length) { this.error -= this.length; this.pos[1 - this.axis] += this.dir[1 - this.axis]; }
    return true;
  }
  value() { return this.step / this.length * (this.end - this.start) + this.start; }
}

// the low view bound at the first step's cell (GetViewBounds with pitch 0 [I])
function lowBound(S, a, i, j, vFovDeg) {
  if (!(typeof vFovDeg === 'number' && vFovDeg > 0 && vFovDeg < 180)) return -Infinity;
  const x = i * S.C + S.ox, y = j * S.C + S.oy;
  const d = Math.hypot(x - a.x, y - a.y);
  const lowest = Math.max(-1.5707864, Math.min(1.5707864, -vFovDeg * Math.PI / 360));
  return toValue(S, Math.tan(lowest) * d + a.z);
}
function cellValue(S, i, j, step, line, uncoverCells) {
  const c = j * S.w + i;
  if (S.field && uncoverCells > step * line.stepLength && S.field.data[c] === 2) return S.ground.data[c];
  return S.g.data[c];
}
function prep(sg, a, b, o) {
  const S = M(sg);
  const ea = cellOf(S, a.x, a.y), eb = cellOf(S, b.x, b.y);
  if (!ea || !eb) return { S, out: true };
  const dx = eb.i - ea.i, dy = eb.j - ea.j;
  if (o && typeof o.rangeU === 'number' && !(o.rangeU * o.rangeU > (dx * dx + dy * dy) * S.C * S.C)) return { S, out: true };
  return { S, ea, eb, same: dx === 0 && dy === 0, uncoverCells: o && o.uncoverU > 0 ? o.uncoverU / S.C : 0 };
}

function canSee(sg, a, b, o) {
  const P = prep(sg, a, b, o);
  if (P.out) return false;
  if (P.same) return true;
  const S = P.S;
  const line = new Line(P.ea.i, P.ea.j, P.eb.i, P.eb.j, toValue(S, a.z));
  line.next();
  line.end = toValue(S, b.z) + 1;
  if (lowBound(S, a, line.pos[0], line.pos[1], o && o.vFovDeg) >= line.value()) return false;
  for (;;) {
    if (cellValue(S, line.pos[0], line.pos[1], line.step, line, P.uncoverCells) >= line.value()) return false;
    if (!line.next()) return true;
  }
}

function hiddenValue(sg, a, b, o) {
  const P = prep(sg, a, b, o);
  if (P.out) return null;
  const S = P.S;
  if (P.same) return toValue(S, a.z);
  const line = new Line(P.ea.i, P.ea.j, P.eb.i, P.eb.j, toValue(S, a.z));
  line.next();
  const lb = lowBound(S, a, line.pos[0], line.pos[1], o && o.vFovDeg);
  line.end = lb === -Infinity ? -1e30 : (lb - line.start) * line.length / line.step + line.start;
  let result;
  for (;;) {
    const cell = cellValue(S, line.pos[0], line.pos[1], line.step, line, P.uncoverCells);
    const on = line.value();
    if (cell >= on) { result = cell; line.end = (cell - line.start) * line.length / line.step + line.start; }
    else result = on;
    if (!line.next()) return result;
  }
}

function visibleHeight(sg, a, b, o) {
  const v = hiddenValue(sg, a, b, o);
  if (v === null) return null;
  const S = M(sg);
  if (v >= 256) return Infinity;
  return v * S.step + S.hMin;
}

module.exports = { canSee, visibleHeight, hiddenValue, cellOf, toValue, Line, lowBound, meta: M };
