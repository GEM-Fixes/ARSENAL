// paint marks (MV-PNT1): the marks layer drawn after a style, in that style's hand (paint contract 4.7). Light at load.
//   KINDS, SETS, HANDS
//   items(input, kinds, extra?) -> [item]   world-u items from input.doc (flags, spawns of input.mode, every phase),
//                                            input.vectors['water.labels'] and extra (routes, strong, fans, measure,
//                                            danger given by the caller); reads only doc, mode and vectors
//   draw(grid, frame, items, o) -> {drawn:{kind:n}, dropped:{kind:n}, scaleBar}
//                                            o = {hand, palette, thumb, minStroke, maxSymbols, kinds, seed, pencil?}
//   read(input, o) -> [item]                 items() plus routes.json, strong.<kind>.json (top candidates) and
//                                            strong.<side>.<kind>.danger.mvg from o.in; o = {in, kinds, kind, extra}
//   toFile(items) -> marks.json items        danger items carry the layer name instead of the grid
// Marks draw numerals and symbols only, never words. Positions and zone outlines map through the frame (a round zone is an
// ellipse in a stretched frame); symbols and numerals keep their pixel size. With mode null the flags and spawns of every
// mode are taken, each (kind, name, x, y) once [I].
// Author: Imperator_Aug (ARSENAL, ia-b1f56e08)
'use strict';
const fs = require('fs');

const KINDS = ['zones', 'flags', 'spawns', 'water', 'routes', 'strong', 'danger', 'fans', 'measure', 'scale', 'north'];
const SETS = { none: [], flags: ['zones', 'flags', 'spawns'], full: ['zones', 'flags', 'spawns', 'water', 'routes', 'scale', 'north'] };
const HANDS = { staff: 'ink', painted: 'poster', recon: 'grease', sketch: 'pencil' };
const ORDER = ['danger', 'zones', 'routes', 'fans', 'flags', 'spawns', 'water', 'strong', 'measure', 'scale', 'north'];
// item kind -> KINDS word
const KIND_OF = { zone: 'zones', flag: 'flags', spawn: 'spawns', water: 'water', route: 'routes', strong: 'strong', danger: 'danger', fan: 'fans', measure: 'measure' };
const UPM = 20;

function C() { return require('./canvas'); }

function teamOf(t) { return t === 'a' || t === 'b' ? t : null; }

function items(input, kinds, extra) {
  const want = new Set(kinds || KINDS);
  const doc = input.doc || {}, mode = input.mode || null;
  const modes = (doc.modes || []).filter(m => !mode || m.id === mode);
  const out = [], seen = new Set();
  const once = (k, n, x, y) => { const key = k + '|' + n + '|' + x + '|' + y; if (seen.has(key)) return false; seen.add(key); return true; };
  for (const m of modes) {
    for (const f of m.flags || []) {
      if (!once('flag', f.name, f.x, f.y)) continue;
      if (want.has('zones') && f.zone) out.push({ kind: 'zone', team: teamOf(f.team), flag: f.name, zone: f.zone, x: f.x, y: f.y });
      if (want.has('flags')) out.push({ kind: 'flag', name: f.name, team: teamOf(f.team), order: f.order, x: f.x, y: f.y });
    }
    if (want.has('spawns')) for (const s of m.spawns || []) {
      if (!once('spawn', s.name, s.x, s.y)) continue;
      out.push({ kind: 'spawn', team: teamOf(s.team), order: s.order, x: s.x, y: s.y, yaw: s.yaw });
    }
  }
  if (want.has('water')) {
    const labels = (input.vectors && input.vectors['water.labels']) || [];
    // drown = a ground vehicle or gun class drowns (input.js groundDrownIds: GoH 'airborne' at -0.75 m does not count)
    const I = require('./input'), dg = (input.layers && input.layers['water.drown']) || null;
    for (const l of labels) {
      if (!l || !(l.band >= 1)) continue;
      const dr = Array.isArray(l.drown) ? I.groundDrownIds(l.drown, dg).length > 0 : !!l.drown;
      out.push({ kind: 'water', band: l.band, drown: dr, x: l.x, y: l.y, depthMax: l.depthMax });
    }
  }
  for (const e of extra || []) if (e && KIND_OF[e.kind] && want.has(KIND_OF[e.kind])) out.push(e);
  return out;
}

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }

function read(input, o) {
  o = o || {};
  const M = require('../mapviz');
  const kinds = o.kinds || KINDS, dirs = o.in || [], kind = o.kind || 'inf';
  const extra = [];
  if (kinds.includes('routes')) {
    const f = M.findIn(dirs, 'routes.json'), j = f && readJson(f);
    for (const it of (j && j.items) || []) if (it && Array.isArray(it.pts)) extra.push({ kind: 'route', team: teamOf(it.side), pts: it.pts });
  }
  if (kinds.includes('strong')) {
    const f = M.findIn(dirs, 'strong.' + kind + '.json'), j = f && readJson(f);
    for (const c of (j && j.candidates) || []) if (c && c.top) extra.push({ kind: 'strong', team: teamOf(c.side), code: String(c.label || 'score'), x: c.x, y: c.y });
  }
  if (kinds.includes('danger')) {
    for (const side of ['a', 'b']) {
      const name = 'strong.' + side + '.' + kind + '.danger';
      const f = M.findIn(dirs, name + '.mvg');
      if (!f) continue;
      try {
        const g = require('../lib/raster/gridfile').read(f);
        extra.push({ kind: 'danger', team: side, weapon: (g.meta && g.meta.weapon) || 'mortar', grid: g, layer: name });
      } catch (e) { /* a bad danger file is left out */ }
    }
  }
  return items(input, kinds, extra.concat(o.extra || []));
}

function toFile(list) {
  return list.map(it => it.kind === 'danger' ? { kind: 'danger', team: it.team, weapon: it.weapon, layer: it.layer || null } : it);
}

// ---- hands
function hand(o, team) {
  const P = o.palette || {}, cv = C();
  const side = (P.sides || {})[team || 'neutral'] || (P.sides || {}).neutral || { fill: '#7F7F7F', line: '#4D4D4D', wash: '#7F7F7F26', shape: 'filled' };
  const st = P.styles || {}, mk = P.marks || {};
  const minS = o.thumb ? (o.minStroke || 2) : (o.minStroke || 1);
  const shape = side.shape === 'outlined' ? 'outlined' : 'filled';
  const h = o.hand || 'ink';
  const withA = (c, a) => { const x = cv.color(c); return [x[0], x[1], x[2], a]; };
  let r;
  if (h === 'poster') r = { line: cv.color(side.line), fill: cv.color(side.fill), wash: cv.color(side.wash), width: 3, amp: 0, ring: cv.color(side.line), inkMarks: true };
  else if (h === 'grease') {
    const pc = (st.recon && st.recon.pencil) || {};
    const col = cv.color(team === 'a' ? pc.a || '#2F5FA8' : team === 'b' ? pc.b || '#D2481E' : pc.mark || '#C0392B');
    r = { line: col, fill: col, wash: withA(col, 0x33), width: pc.width || 3, amp: 1.5, ring: col, inkMarks: false };
  } else if (h === 'pencil') {
    const fs2 = st.field_sketch || {};
    const base = o.thumb && fs2.thumbnail && fs2.thumbnail.pencil ? fs2.thumbnail.pencil : (o.pencil || fs2.graphite || '#3A3A3A');
    const col = cv.color(base);
    r = { line: col, fill: col, wash: withA(col, 0x26), width: 1.2, amp: 1, ring: col, inkMarks: false };
  } else {
    const ink = cv.color((st.staff && st.staff.ink) || '#2B2B2B');
    r = { line: ink, fill: cv.color(side.fill), wash: cv.color(side.wash), width: 1.5, amp: 0, ring: cv.color(mk.flagRing || '#1A1A1A'), inkMarks: true };
  }
  r.width = Math.max(r.width, minS);
  r.shape = h === 'grease' || h === 'pencil' ? 'outlined' : shape;
  r.halo = mk.halo ? cv.color(mk.halo) : [255, 255, 255, 204];
  r.mk = mk;
  return r;
}

function ellipse(cx, cy, rx, ry, n) {
  const out = [];
  for (let q = 0; q < n; q++) { const a = 2 * Math.PI * q / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

function stopsAt(stops, t) {
  const cv = C();
  if (!stops || !stops.length) return [0, 0, 0, 0];
  if (t <= stops[0].at) return cv.color(stops[0].color);
  for (let q = 1; q < stops.length; q++) {
    if (t <= stops[q].at) { const a = stops[q - 1], b = stops[q]; return cv.mix(a.color, b.color, (t - a.at) / ((b.at - a.at) || 1)); }
  }
  return cv.color(stops[stops.length - 1].color);
}

function niceMetres(m) {
  if (!(m > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const k of [5, 2, 1]) if (k * p <= m) return k * p;
  return p;
}
function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }

function draw(grid, frame, list, o) {
  o = o || {};
  const cv = C();
  const kinds = new Set(o.kinds || KINDS);
  const drawn = {}, dropped = {};
  const add = (t, k) => { t[k] = (t[k] || 0) + 1; };
  const seed = o.seed === undefined ? 1 : o.seed;
  const thumb = !!o.thumb;
  const P = o.palette || {};
  const px = (x, y) => cv.toPx(frame, x, y);
  const wob = (pts, amp) => amp > 0 ? cv.wobble(pts, { amp, seed, frame }) : pts;
  const numSize = 11;   // numerals keep 11 px; never under 10 px (thumb rule)

  // which symbol items survive the thumbnail cap: flags by order, then spawns, water, strong
  const keep = new Set();
  const symKinds = ['flag', 'spawn', 'water', 'strong'];
  const syms = [];
  for (const k of symKinds) {
    const part = list.filter(it => it.kind === k && kinds.has(KIND_OF[k]));
    if (k === 'flag') part.sort((a, b) => (a.order === null || a.order === undefined ? 1e9 : a.order) - (b.order === null || b.order === undefined ? 1e9 : b.order));
    syms.push(...part);
  }
  const cap = thumb && Number.isInteger(o.maxSymbols) ? o.maxSymbols : Infinity;
  syms.forEach((it, q) => { if (q < cap) keep.add(it); else add(dropped, KIND_OF[it.kind]); });

  const groups = {};
  for (const it of list) { const k = KIND_OF[it.kind]; if (!k || !kinds.has(k)) continue; (groups[k] = groups[k] || []).push(it); }

  for (const k of ORDER) {
    if (k === 'scale' || k === 'north') {
      if (!kinds.has(k)) continue;
      const h = hand(o, null);
      const col = h.inkMarks ? cv.color(k === 'scale' ? h.mk.scaleBar || '#1A1A1A' : h.mk.northArrow || '#1A1A1A') : h.line;
      if (k === 'north') {
        const s = thumb ? 14 : 22;
        cv.symbol(grid, 'north', frame.W - s * 0.9, s * 0.9, { size: s, rgba: col, line: h.halo, width: Math.max(1, h.width / 2) });
        add(drawn, 'north');
        continue;
      }
      if (Math.abs(frame.sx / frame.sy - 1) > 0.05) continue;
      const m = niceMetres(frame.W / 5 * frame.sx / UPM), L = m * UPM / frame.sx;
      const x0 = 12, y0 = frame.H - 12, lw = Math.max(h.width, 2);
      const bar = [[x0, y0], [x0 + L, y0]];
      cv.strokePath(grid, bar, lw + 2, h.halo);
      cv.strokePath(grid, wob(bar, h.amp), lw, col);
      cv.strokePath(grid, [[x0, y0 - 5], [x0, y0]], lw, col);
      cv.strokePath(grid, [[x0 + L, y0 - 5], [x0 + L, y0]], lw, col);
      if (!thumb || numSize >= 10) cv.digits(grid, String(m) + 'm', x0 + L / 2, y0 - 12, { size: numSize, rgba: col, halo: h.halo, align: 'center' });
      add(drawn, 'scale');
      drawn.scale = 1;
      continue;
    }
    for (const it of groups[k] || []) {
      const h = hand(o, it.team || null);
      if (k === 'danger') {
        const g = it.grid;
        if (!g || !g.data) { add(dropped, 'danger'); continue; }
        const stops = (P.danger && P.danger.stops) || [];
        const cols = [null, stopsAt(stops, 1 / 3), stopsAt(stops, 2 / 3), stopsAt(stops, 1)];
        const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell, d = grid.data, nd = g.nodata;
        for (let j = 0; j < frame.H; j++) {
          const r = Math.floor((frame.y0 + (j + 0.5) * frame.sy - g.oy) / cy);
          if (r < 0 || r >= g.h) continue;
          for (let i = 0; i < frame.W; i++) {
            const c = Math.floor((frame.x0 + (i + 0.5) * frame.sx - g.ox) / g.cell);
            if (c < 0 || c >= g.w) continue;
            const v = g.data[r * g.w + c];
            if (v === nd || !(v >= 1 && v <= 3)) continue;
            cv.blendIdx(d, (j * frame.W + i) * 4, cols[v], 16);
          }
        }
        add(drawn, 'danger');
      } else if (k === 'zones') {
        const z = it.zone;
        let pts = null, inner = null;
        if (z && z.kind === 'circle' && z.rA > 0) {
          const f = Number.isFinite(it.x) ? it : findFlag(list, it);
          if (!f) { add(dropped, 'zones'); continue; }
          const cc = px(f.x, f.y);
          pts = ellipse(cc[0], cc[1], z.rA / frame.sx, z.rA / frame.sy, 72);
          if (z.rB > 0 && z.rB !== z.rA) inner = ellipse(cc[0], cc[1], z.rB / frame.sx, z.rB / frame.sy, 72);
        } else if (z && z.kind === 'poly' && Array.isArray(z.pts) && z.pts.length >= 3) pts = z.pts.map(p => px(p[0], p[1]));
        if (!pts) { add(dropped, 'zones'); continue; }
        cv.fillPoly(grid, pts, h.wash);
        cv.strokePath(grid, wob(pts, h.amp), Math.max(h.width, (h.mk.flagRingWidth || 2)), h.ring, { closed: h.amp <= 0 });
        if (inner) cv.strokePath(grid, wob(inner, h.amp), Math.max(o.minStroke || 1, h.width / 2), h.ring, { closed: h.amp <= 0, dash: [6, 4] });
        add(drawn, 'zones');
      } else if (k === 'routes') {
        if (!Array.isArray(it.pts) || it.pts.length < 2) { add(dropped, 'routes'); continue; }
        cv.strokePath(grid, wob(it.pts.map(p => px(p[0], p[1])), h.amp), h.width, h.line, { cap: 'round' });
        add(drawn, 'routes');
      } else if (k === 'fans') {
        const n = Math.max(4, Math.ceil((it.arc || 60) / 5)), yaw = (it.yaw || 0) * Math.PI / 180, arc = (it.arc || 60) * Math.PI / 180;
        const pts = [px(it.x, it.y)];
        for (let q = 0; q <= n; q++) { const a = yaw - arc / 2 + arc * q / n; pts.push(px(it.x + it.range * Math.cos(a), it.y + it.range * Math.sin(a))); }
        cv.fillPoly(grid, pts, h.wash);
        cv.strokePath(grid, wob(pts, h.amp), h.width, h.line, { closed: h.amp <= 0 });
        add(drawn, 'fans');
      } else if (k === 'measure') {
        if (!Array.isArray(it.pts) || it.pts.length < 2) { add(dropped, 'measure'); continue; }
        const P2 = it.pts.map(p => px(p[0], p[1]));
        const mc = cv.color(h.mk.measureCasing || '#FFFFFF'), ml = h.inkMarks ? cv.color(h.mk.measure || '#000000') : h.line;
        cv.strokePath(grid, P2, h.width + 2, mc, { cap: 'round' });
        cv.strokePath(grid, wob(P2, h.amp), h.width, ml, { cap: 'round' });
        let L = 0;
        for (let q = 1; q < it.pts.length; q++) L += Math.hypot(it.pts[q][0] - it.pts[q - 1][0], it.pts[q][1] - it.pts[q - 1][1]);
        const e = P2[P2.length - 1];
        cv.digits(grid, fmt1(L / UPM) + 'm', e[0] + 6, e[1] - 8, { size: numSize, rgba: ml, halo: h.halo });
        add(drawn, 'measure');
      } else {
        if (!keep.has(it)) continue;
        const c = px(it.x, it.y);
        const size = thumb ? 10 : 14;
        if (k === 'flags') {
          cv.symbol(grid, 'flag', c[0], c[1] - size / 2, { size, rgba: h.fill, line: h.line, shape: h.shape, halo: h.halo, width: Math.max(1, h.width * 0.8) });
          if (Number.isFinite(it.order)) cv.digits(grid, String(it.order), c[0] + size * 0.45, c[1] - size * 0.75, { size: numSize, rgba: h.line, halo: h.halo });
          add(drawn, 'flags');
        } else if (k === 'spawns') {
          const yaw = (it.yaw || 0) * Math.PI / 180;
          const dir = [Math.cos(yaw) / frame.sx, -Math.sin(yaw) / frame.sy];
          cv.symbol(grid, 'spawn', c[0], c[1], { size, rgba: h.fill, line: h.line, shape: h.shape, halo: h.halo, dir, width: Math.max(1, h.width * 0.8) });
          add(drawn, 'spawns');
        } else if (k === 'water') {
          const name = it.drown ? 'drown' : it.band >= 2 ? 'swim' : 'noProne';
          const wc = h.inkMarks ? cv.color((P.water && P.water.label && P.water.label.text) || '#0B2F38') : h.line;
          cv.symbol(grid, name, c[0], c[1], { size, rgba: wc, width: Math.max(1, h.width * 0.7) });
          if (Number.isFinite(it.depthMax)) cv.digits(grid, fmt1(it.depthMax), c[0] + size * 0.7, c[1], { size: numSize, rgba: wc, halo: h.halo });
          add(drawn, 'water');
        } else if (k === 'strong') {
          cv.symbol(grid, 'strong.' + it.code, c[0], c[1], { size, rgba: h.fill, line: h.line, shape: h.shape, halo: h.halo, width: Math.max(1, h.width * 0.8) });
          add(drawn, 'strong');
        }
      }
    }
  }
  return { drawn, dropped, scaleBar: !!drawn.scale };
}

// a zone item names its flag; the flag item (when drawn too) or the doc gives the centre of a circle zone
function findFlag(list, z) { return list.find(it => it.kind === 'flag' && it.name === z.flag) || (z.x !== undefined ? z : null); }

module.exports = { KINDS, SETS, HANDS, ORDER, KIND_OF, items, read, draw, toFile, hand, niceMetres };
