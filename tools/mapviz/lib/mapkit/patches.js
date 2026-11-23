// mapkit patches: land patches laid on the height grid as the engine does at map load (design 2; README 1.1 grids).
// the game [V]: Build, AlignView, PatchView (186-395), GetFootprint (109-145)
//  GetCellRect (111-116) and Apply, gem/render/terrain AddLand, gem/math
//  IsInsideXY / Intersect, plane, heightmap GetHeight (original branch), GetCell.
//   apply(ctx) -> {applied, skipped}   ctx = {src, target, net:{w, h, cell, offX, offY}, height, type, typeStored, mat,
//     W, records: [mapdoc entityRecord], mt (material table), notes, tick?(done, total) (called once per record)}
//   Float maths follow the engine's float32 steps (Math.fround after each operation) [I: x64 SSE single precision].
//   Pure helpers for tests: insideXY(tri, px, py), planeHeight(tri, px, py), getCell(net, x, y), heightAt(ctx, x, y),
//   entityMatrix(r, z), mul(a, b), footprintRect(...), defPatch(src, key)
// Author: Imperator_Aug (ARSENAL, ia-fea01596)
'use strict';
const tables = require('./tables'), S = require('./sdl');

const f = Math.fround;
const lc = s => String(s == null ? '' : s).toLowerCase();
const PATCH_EXT = ['land_patch', 'land_patch_height'];
const MAX_TRI_CELLS = 4e6;

// ---------------------------------------------------------------- matrices (row vectors, 12 numbers: X, Y, Z, T)
function mul(a, b) {   // p * a * b
  const o = new Array(12);
  for (let r = 0; r < 4; r++) {
    const x = a[r * 3], y = a[r * 3 + 1], z = a[r * 3 + 2];
    for (let c = 0; c < 3; c++) o[r * 3 + c] = x * b[c] + y * b[3 + c] + z * b[6 + c] + (r === 3 ? b[9 + c] : 0);
  }
  return o;
}
// entity xform: SetAngles(zl, y, zw), scale on the scale bone [I: applied to the whole model],
// position (x, y, z)
function entityMatrix(r, z) {
  const rad = Math.PI / 180;
  let s = Math.sin(r.zl * rad), c = Math.cos(r.zl * rad);
  const m = [c, s, 0, -s, c, 0, 0, 0, 1];
  if (r.yr) {
    s = Math.sin(r.yr * rad); c = Math.cos(r.yr * rad);
    for (let i = 0; i < 9; i += 3) { const x0 = m[i], z0 = m[i + 2]; m[i] = x0 * c + z0 * s; m[i + 2] = z0 * c - x0 * s; }
  }
  if (r.zw) {
    s = Math.sin(r.zw * rad); c = Math.cos(r.zw * rad);
    for (let i = 0; i < 9; i += 3) { const x0 = m[i], y0 = m[i + 1]; m[i + 1] = x0 * s + y0 * c; m[i] = x0 * c - y0 * s; }
  }
  const sc = r.scale === null || r.scale === undefined ? 1 : r.scale;
  const S1 = [sc, 0, 0, 0, sc, 0, 0, 0, sc, 0, 0, 0];
  return { scale: S1, rot: m.concat([r.x, r.y, z]) };
}
// p * m in float32 steps (matrix 43 Vec3 multiply)
function xf(m, x, y, z) {
  return [
    f(f(f(f(x * m[0]) + f(y * m[3])) + f(z * m[6])) + m[9]),
    f(f(f(f(x * m[1]) + f(y * m[4])) + f(z * m[7])) + m[10]),
    f(f(f(f(x * m[2]) + f(y * m[5])) + f(z * m[8])) + m[11]),
  ];
}

// ---------------------------------------------------------------- the engine's grid maths
// FloatToInt (truncation) of offset + coordinate, integer division by the cell size
function getCell(net, x, y) {
  return { x: Math.trunc(Math.trunc(f(f(net.offX) + f(x))) / net.cell), y: Math.trunc(Math.trunc(f(f(net.offY) + f(y))) / net.cell) };
}
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
//  (original branch): cells clamped one by one, bilinear in float32
function heightAt(ctx, x, y) {
  const n = ctx.net, c = getCell(n, x, y), H = ctx.height;
  const at = (i, j) => H[clampI(j, 0, n.h - 1) * n.w + clampI(i, 0, n.w - 1)];
  const h00 = at(c.x, c.y), h10 = at(c.x + 1, c.y), h01 = at(c.x, c.y + 1), h11 = at(c.x + 1, c.y + 1);
  const inv = f(1 / n.cell);
  const fy = f(f(f(f(n.offY) + f(y)) * inv) - c.y), fx = f(f(f(f(n.offX) + f(x)) * inv) - c.x);
  const left = f(h00 + f(f(h01 - h00) * fy)), right = f(h10 + f(f(h11 - h10) * fy));
  return f(left + f(f(right - left) * fx));
}
function insideXY(t, px, py) {
  const e = (a, b) => f(f(f(b[0] - a[0]) * f(py - a[1])) - f(f(px - a[0]) * f(b[1] - a[1])));
  if (e(t[0], t[1]) > 1e-4) return false;
  if (e(t[1], t[2]) > 1e-4) return false;
  if (e(t[2], t[0]) > 1e-4) return false;
  return true;
}
// csgplane 3(a, b, c) then from (px, py, 0) along +z; null for a vertical face (engine 1e38)
const VEC_MIN_LENGTH_SQUARED = f(f(1e-5) * f(1e-5));
function plane(t) {
  const ux = f(t[1][0] - t[0][0]), uy = f(t[1][1] - t[0][1]), uz = f(t[1][2] - t[0][2]);
  const vx = f(t[2][0] - t[0][0]), vy = f(t[2][1] - t[0][1]), vz = f(t[2][2] - t[0][2]);
  let nx = f(f(uy * vz) - f(uz * vy)), ny = f(f(uz * vx) - f(ux * vz)), nz = f(f(ux * vy) - f(uy * vx));
  const l2 = f(f(f(nx * nx) + f(ny * ny)) + f(nz * nz));
  if (l2 > VEC_MIN_LENGTH_SQUARED) { const s = f(1 / Math.sqrt(l2)); nx = f(nx * s); ny = f(ny * s); nz = f(nz * s); } else { nx = 0; ny = 0; nz = 1; }
  const d = f(-f(f(f(t[0][0] * nx) + f(t[0][1] * ny)) + f(t[0][2] * nz)));
  return { nx, ny, nz, d };
}
function planeHeight(p, px, py) {
  const cosine = p.nz;
  if (cosine > -1e-4 && cosine < 1e-4) return null;
  const dist = f(f(-p.d) - f(f(f(p.nx * px) + f(p.ny * py)) + f(p.nz * 0)));
  return f(dist / cosine);
}

// ---------------------------------------------------------------- the def's land patch extender
function defPatch(src, key) {
  let parsed;
  try { parsed = S.parse(src, key); } catch (e) { return { error: 'def ' + key + ': ' + e.message }; }
  let found = null;
  (function walk(b, depth) {
    for (const c of S.blocks(b)) {
      if (found) return;
      const w = S.words(c);
      if (lc(w[0]) === 'extender' && PATCH_EXT.includes(lc(w[1]))) { found = c; return; }
      if (depth < 3) walk(c, depth + 1);
    }
  })(parsed.root, 0);
  if (!found) return null;
  const p = { kind: lc(S.words(found)[1]), on: true, randomRotate: false, alignEnabled: false, alignStacked: false, alignVolumes: false,
    noNormals: false, terrain: null };
  const bool = v => (typeof v === 'number' ? v !== 0 : !/^(0|false)$/i.test(String(v)));
  for (const c of S.blocks(found)) {
    const w = S.words(c), k = lc(w[0]);
    if (k === 'on') p.on = bool(w[1]);
    else if (k === 'randomrotate') p.randomRotate = bool(w[1]);
    else if (k === 'alignenabled') p.alignEnabled = bool(w[1]);
    else if (k === 'alignstacked') p.alignStacked = bool(w[1]);
    else if (k === 'alignvolumes') p.alignVolumes = bool(w[1]);
    else if (k === 'nonormals') p.noNormals = bool(w[1]);
    else if (k === 'terraintype') p.terrain = { type: lc(w[1]), material: lc(w[2]) };
  }
  return p;
}
// ground type(typeName, materialName): an unknown name gives id 1
function terrainIds(target, t, mt) {
  const ty = tables.typeId(target, t.type), ma = mt.byName.has(t.material) ? mt.byName.get(t.material) : null;
  return [ty === null ? 1 : ty, ma === null ? 1 : ma];
}

// ---------------------------------------------------------------- one entity
const hasParam = (bone, name) => !!bone && Object.keys(bone.paramMap || {}).some(k => k.toLowerCase() === name);
function vertsOf(ply) {
  const v = ply && ply.vertices;
  if (!v || !v.position) return null;
  const el = (v.layout || []).find(e => e.key === 'position');
  return { pos: v.position, comps: el && el.comps ? el.comps : 3, count: v.count };
}

function patchEntity(ctx, r, P, loaded) {
  const n = ctx.net, model = loaded.model, scene = loaded.scene;
  const views = [];
  for (const m of scene.meshes) {
    const bone = model.bones[m.boneIndex];
    const land = hasParam(bone, 'land'), align = hasParam(bone, 'align');
    if (!land && !align) continue;
    if (!m.ply || !m.world) throw new Error('mesh ' + m.file + ' not loaded');
    const vt = vertsOf(m.ply);
    if (!vt || !m.ply.indices) throw new Error('mesh ' + m.file + ' has no positions or faces');
    views.push({ m, land, align, vt, idx: m.ply.indices });
  }
  if (!views.length || !views.some(v => v.land)) return false;   // Build returns views.land: nothing is patched
  const z = r.z !== null ? r.z : heightAt(ctx, r.x, r.y);   // [I] an entity without z stands on the ground
  const E = entityMatrix(r, z);
  const hasArea = P.kind === 'land_patch_height' ? true : (scene.areas || []).some(a => lc(a.name) === 'cut');
  // world matrix of each view: bone world (model) * scale * entity, as float32
  for (const v of views) {
    v.world = mul(mul(v.m.world, E.scale), E.rot).map(f);
    const nv = v.vt.count, c = v.vt.comps, src = v.vt.pos;
    const local = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { local[i * 3] = src[i * c]; local[i * 3 + 1] = src[i * c + 1]; local[i * 3 + 2] = src[i * c + 2]; }
    v.local = local;
  }
  // AlignView: each vertex raised by the ground under it, half a unit above it (stacked or not: one height grid here)
  if (P.alignEnabled) {
    for (const v of views) {
      if (!v.align) continue;
      const w = v.world, nv = v.local.length / 3;
      const out = new Float32Array(v.local.length);
      for (let i = 0; i < nv; i++) {
        const p = xf(w, v.local[i * 3], v.local[i * 3 + 1], v.local[i * 3 + 2]);
        const h = heightAt(ctx, p[0], p[1]);
        const lift = f(f(h - w[11]) + 0.5);
        // SetUnrotated(toFrame, (0, 0, lift)): the lift through the transposed rotation
        out[i * 3] = f(v.local[i * 3] + f(lift * w[2]));
        out[i * 3 + 1] = f(v.local[i * 3 + 1] + f(lift * w[5]));
        out[i * 3 + 2] = f(v.local[i * 3 + 2] + f(lift * w[8]));
      }
      v.local = out;
    }
  }
  // PatchView: every face of every land view, turned over, into the cells under it
  const H = ctx.height, T = ctx.type, TS = ctx.typeStored, M = ctx.mat, isU16 = H instanceof Uint16Array;
  const clip = ctx.target === 'as64';   // AS2_BUGFIX GetCellsOnMap in the AS64 build [I]; the shipped exes clamp each write
  const terr = P.terrain ? terrainIds(ctx.target, P.terrain, ctx.mt) : null;
  for (const v of views) {
    if (!v.land) continue;
    const L = v.local, idx = v.idx, w = v.world;
    const nf = Math.floor(idx.length / 3);
    for (let i = 0; i < nf; i++) {
      const a = idx[i * 3 + 2], b = idx[i * 3 + 1], c = idx[i * 3];
      if (a * 3 + 2 >= L.length || b * 3 + 2 >= L.length || c * 3 + 2 >= L.length) throw new Error('face index past the vertices in ' + v.m.file);
      const t = [xf(w, L[a * 3], L[a * 3 + 1], L[a * 3 + 2]), xf(w, L[b * 3], L[b * 3 + 1], L[b * 3 + 2]), xf(w, L[c * 3], L[c * 3 + 1], L[c * 3 + 2])];
      const pl = plane(t);
      const lo = getCell(n, Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]));
      const hi = getCell(n, Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1]));
      if (clip) { lo.x = Math.max(0, lo.x); lo.y = Math.max(0, lo.y); hi.x = Math.min(n.w - 1, hi.x); hi.y = Math.min(n.h - 1, hi.y); }
      if (!(hi.x >= lo.x && hi.y >= lo.y)) continue;
      if ((hi.x - lo.x + 1) * (hi.y - lo.y + 1) > MAX_TRI_CELLS) throw new Error('a face covers more than ' + MAX_TRI_CELLS + ' cells');
      const zmax = Math.max(t[0][2], t[1][2], t[2][2]);
      for (let x = lo.x; x <= hi.x; x++) {
        for (let y = lo.y; y <= hi.y; y++) {
          const px = f(f(x * n.cell) - f(n.offX)), py = f(f(y * n.cell) - f(n.offY));
          if (!insideXY(t, px, py)) continue;
          let h = planeHeight(pl, px, py);
          if (h === null) h = zmax;
          const k = clampI(y, 0, n.h - 1) * n.w + clampI(x, 0, n.w - 1);
          if (!(hasArea || h >= H[k])) continue;
          const hi16 = (Math.trunc(h) << 16) >> 16;
          H[k] = isU16 ? hi16 & 0xffff : hi16;
          if (terr) {
            let g = terr;
            if (terr[0] >= 3 && terr[0] <= 5) g = tables.waterGround(f(f(ctx.W) - h));
            if (g[0] || g[1]) { T[k] = g[0]; TS[k] = g[0]; M[k] = g[1]; }
          }
        }
      }
    }
  }
  // AddLand: the cells of the patch's rectangle that are water (3..5) take the water type of their height
  retypeRect(ctx, footprintRect(views, E.rot));
  return true;
}

// GetFootprint (axis = the entity's x axis) -> GetCellRect (the box of it, 1 u more each side, int32)
function footprintRect(views, rot) {
  let ax = rot[0], ay = rot[1];
  const len = Math.hypot(ax, ay);
  if (len > 1e-5) { ax /= len; ay /= len; } else { ax = 1; ay = 0; }
  let loA = 1e38, hiA = -1e38, loL = 1e38, hiL = -1e38;
  for (const v of views) {
    const L = v.local, nv = L.length / 3;
    let b = [1e38, 1e38, 1e38, -1e38, -1e38, -1e38];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const q = L[i * 3 + k]; if (q < b[k]) b[k] = q; if (q > b[k + 3]) b[k + 3] = q; }
    if (!nv) continue;
    for (let ci = 0; ci < 8; ci++) {
      const p = xf(v.world, ci & 1 ? b[3] : b[0], ci & 2 ? b[4] : b[1], ci & 4 ? b[5] : b[2]);
      const across = p[1] * -ax + p[0] * ay, along = p[1] * ay + p[0] * ax;
      if (across < loA) loA = across; if (across > hiA) hiA = across;
      if (along < loL) loL = along; if (along > hiL) hiL = along;
    }
  }
  const mAlong = (hiL + loL) * 0.5, mAcross = (hiA + loA) * 0.5, hsAlong = (hiL - loL) * 0.5, hsAcross = (hiA - loA) * 0.5;
  const cx = ax * mAlong + ay * mAcross, cy = ay * mAlong - ax * mAcross;
  const ex = Math.abs(ax) * hsAlong + Math.abs(ay) * hsAcross, ey = Math.abs(ay) * hsAlong + Math.abs(ax) * hsAcross;
  return { left: Math.trunc(cx - ex - 1), top: Math.trunc(cy - ey - 1), right: Math.trunc(cx + ex + 1), bottom: Math.trunc(cy + ey + 1) };
}
//  re-type of a land's rectangle; the engine divides by 10 (the AS2 cell); other cell sizes use the cell [I]
function retypeRect(ctx, rect) {
  const n = ctx.net, step = n.cell === 10 ? 10 : n.cell;
  const sx = Math.trunc(n.offX), sy = Math.trunc(n.offY);
  const firstX = Math.max(0, Math.trunc((rect.left + sx) / step) - 1), firstY = Math.max(0, Math.trunc((rect.top + sy) / step) - 1);
  const endX = Math.min(n.w - 1, Math.trunc((rect.right + sx) / step) + 1), endY = Math.min(n.h - 1, Math.trunc((rect.bottom + sy) / step) + 1);
  for (let x = endX - 1; x >= firstX; x--) {
    for (let y = endY - 1; y >= firstY; y--) {
      const k = y * n.w + x, g = tables.retypeCell(ctx.type[k], ctx.height[k], ctx.W);
      if (g) { ctx.type[k] = g[0]; ctx.mat[k] = g[1]; }
    }
  }
}

// ---------------------------------------------------------------- every patch of a map
function apply(ctx) {
  const src = ctx.src;
  const cache = src._patchDefs || (src._patchDefs = new Map());
  let L = src._scenes || null;
  const scenes = () => {
    if (!L) L = src._scenes = require('../../../lib/model/scenecache').open({ target: ctx.target, vfs: src.vfs });
    return L;
  };
  let applied = 0, skipped = 0;
  const tick = typeof ctx.tick === 'function' ? ctx.tick : null, nr = ctx.records.length;
  for (let ri = 0; ri < nr; ri++) {
    const r = ctx.records[ri];
    if (tick) tick(ri, nr);
    if (r.x === null || r.y === null || !r.def) continue;
    let info = cache.get(r.def);
    if (info === undefined) {
      info = null;
      try {
        const e = scenes().entity(r.def);
        if (e && e.key) {
          const p = defPatch(src, e.key);
          if (p && p.error) info = { error: p.error };
          else if (p && p.on) info = { patch: p };
        }
      } catch (e) { info = { error: e.message }; }
      cache.set(r.def, info);
    }
    if (!info) continue;
    const skip = why => { skipped++; ctx.notes.push({ code: 'MAPKIT_PATCH_SKIPPED', text: 'land patch of ' + r.def + (r.uid === null ? '' : ' ' + r.uid) + ' not applied: ' + why, at: [r.x, r.y] }); };
    if (info.error) { skip(info.error); continue; }
    let loaded;
    try { loaded = scenes().load(r.def); } catch (e) { skip(e.message); continue; }
    if (!loaded || loaded.error || !loaded.scene || !loaded.model) { skip(loaded && loaded.error ? loaded.error : 'model not loaded'); continue; }
    try { if (patchEntity(ctx, r, info.patch, loaded)) applied++; } catch (e) { skip(e.message); }
  }
  if (L) src.addInputs(L.reads());
  return { applied, skipped };
}

module.exports = { apply, defPatch, insideXY, plane, planeHeight, getCell, heightAt, entityMatrix, mul, xf, footprintRect, retypeRect, patchEntity, terrainIds };
