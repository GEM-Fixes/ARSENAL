// pass speed (MV-PAS, wave C): run speed of a kind's unit, the active pather box and the spawns and targets of a side
// (wave C rules draft 5.3; design 5.2). Same code on as64, mowas2 and goh: only the unit defs differ (KIND_UNITS).
//   SPEED_FALLBACK {inf 15, mg 10, at 6, tank 30} km/h; inf [V data properties/human.ext Run Normal 15]; others [I]
//   speed(src, kind, prof?) -> {runMs, kmh, source:'def'|'fallback', def, at, key}
//     human def (inf): Chassis {Run {Normal v ..}} first number, km/h [V data: AS2 human.ext:81 Normal 15, GoH human.ext:166
//     Normal 13]. Vehicles and guns: Chassis {Locomotion {Normal v}} when given (GoH mobility.inc), else {MaxSpeed v}
//     (AS2 gives MaxSpeed only), the last one read wins, keys without case [I: an ordered move runs at Normal]
//   modeOf(doc, mode) -> mode row | null   mode null: the first mode with spawns of both sides, else the first mode
//   resolvePhase(doc, mode, phase) -> int | null   phase null = the lowest phase in the mode over spawns, flags and
//     clipsBySide (late R3); every reader below resolves through it, so both sides and the flags share one phase
//   activeBox(doc, mode, side, phase) -> [x0, y0, x1, y1] | null
//   spawnsOf(doc, mode, side, phase) -> [{name, x, y}]  (.phase on the array = the resolved phase)
//   flagsOf(doc, mode, phase) -> [{name, x, y}]
// Author: Imperator_Aug (ARSENAL, ia-464cb474)
'use strict';

const SPEED_FALLBACK = Object.freeze({ inf: 15, mg: 10, at: 6, tank: 30 });

function sdl() { return require('../../lib/mapkit/sdl'); }
const lc = s => String(s == null ? '' : s).toLowerCase();
const isNum = x => x && (x.k === 'INTEGER' || x.k === 'FLOAT') && Number.isFinite(x.value);
const headOf = b => { const h = b && b.items && b.items[0]; return h ? lc(h.k === 'STRING' ? h.value : h.text) : ''; };

// readSpeed(root, kind) -> {kmh, key, at} | null  (walks the parse tree in file order; mods (mp) already resolved by sdl)
function readSpeed(root, kind, file) {
  let hit = null, normal = null, max = null;
  (function walk(b, trail) {
    for (const x of (b && b.items) || []) {
      // (mod "mp" ...) counts, as pather.set reads it (maps are read as multiplayer maps) [I]
      if (x.k === 'MOD') { if ((String(x.name) === 'mp') !== !!x.not) walk({ items: x.items }, trail); continue; }
      if (x.k !== 'BLOCK' || x.disabled) continue;
      const h = headOf(x);
      const t = trail.concat([h]);
      const n = x.items.length;
      const where = (x.file || file) + ':' + x.line;
      if (kind === 'inf') {
        if (h === 'normal' && trail.length >= 2 && trail[trail.length - 1] === 'run' && trail[trail.length - 2] === 'chassis' && n > 1 && isNum(x.items[1])) {
          hit = { kmh: x.items[1].value, key: 'Chassis/Run/Normal', at: where };
        }
      } else if (trail.length >= 2 && trail[trail.length - 1] === 'locomotion' && trail[trail.length - 2] === 'chassis' && n > 1 && isNum(x.items[1])) {
        if (h === 'normal') normal = { kmh: x.items[1].value, key: 'Chassis/Locomotion/Normal', at: where };
        else if (h === 'maxspeed') max = { kmh: x.items[1].value, key: 'Chassis/Locomotion/MaxSpeed', at: where };
      }
      walk(x, t);
    }
  })(root, []);
  if (kind === 'inf') return hit;
  return normal || max;
}

function speed(src, kind, prof) {
  const Ps = require('./index');
  const g = src && src.target === 'goh' ? 'goh' : 'as2';
  const def = (prof && prof.unit && prof.unit.def) || Ps.KIND_UNITS[g][kind];
  const fb = SPEED_FALLBACK[kind];
  if (fb === undefined) throw new (require('../../mapviz').MvError)('MV_USAGE', 'pass speed: no kind ' + kind);
  if (src && def && src.has(def)) {
    let h = null;
    try { h = readSpeed(sdl().parse(src, def).root, kind, def); } catch (e) { h = null; }
    if (h && h.kmh > 0) return { runMs: h.kmh / 3.6, kmh: h.kmh, source: 'def', def, at: h.at, key: h.key };
  }
  return { runMs: fb / 3.6, kmh: fb, source: 'fallback', def: def || null, at: null, key: null };
}

// ---------------------------------------------------------------- modes, boxes, spawns
function modeOf(doc, mode) {
  const ms = (doc && doc.modes) || [];
  if (mode !== null && mode !== undefined && mode !== '') return ms.find(m => m.id === mode) || null;
  const both = ms.find(m => ['a', 'b'].every(s => (m.spawns || []).some(x => x.team === s)));
  return both || ms[0] || null;
}

const hasPh = p => p !== null && p !== undefined;
// an item of phase null belongs to every phase; ph null (the mode has no phase) keeps every item [I]
const phaseOk = (x, ph) => !hasPh(x.phase) || ph === null || x.phase === ph;

// resolvePhase(doc, mode, phase) -> int | null  (late R3, the same rule for every phase reader): phase given -> it;
// phase null -> the lowest phase present in the mode over spawns (all sides), flags and clipsBySide; null when none has one
function resolvePhase(doc, mode, phase) {
  if (hasPh(phase)) return phase;
  const m = modeOf(doc, mode);
  if (!m) return null;
  let lo = null;
  for (const x of [].concat(m.spawns || [], m.flags || [], m.clipsBySide || [])) {
    if (x && hasPh(x.phase) && Number.isFinite(Number(x.phase)) && (lo === null || Number(x.phase) < lo)) lo = Number(x.phase);
  }
  return lo;
}

// the spawns of the side in the resolved phase (resolvePhase) plus those with phase null
function spawnsOf(doc, mode, side, phase) {
  const m = modeOf(doc, mode);
  const all = m ? (m.spawns || []).filter(s => s.team === side && Number.isFinite(s.x) && Number.isFinite(s.y)) : [];
  const ph = resolvePhase(doc, mode, phase);
  const out = all.filter(s => phaseOk(s, ph)).map(s => ({ name: s.name || ('uid ' + s.uid), x: s.x, y: s.y }));
  Object.defineProperty(out, 'phase', { value: ph, enumerable: false });
  Object.defineProperty(out, 'mode', { value: m ? m.id : null, enumerable: false });
  return out;
}

function flagsOf(doc, mode, phase) {
  const m = modeOf(doc, mode);
  const ph = resolvePhase(doc, mode, phase);
  return m ? (m.flags || []).filter(f => Number.isFinite(f.x) && Number.isFinite(f.y) && phaseOk(f, ph))
    .map(f => ({ name: f.name || ('uid ' + f.uid), x: f.x, y: f.y })) : [];
}

function goodBox(b) { return Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) ? b.slice() : null; }

// the pather box of the side's clip (modes[].clipsBySide -> boxes.named[].pather), else boxes.pather, else boxes.auto
function activeBox(doc, mode, side, phase) {
  const bx = (doc && doc.boxes) || {};
  const m = modeOf(doc, mode);
  if (m && side) {
    const ph = resolvePhase(doc, mode, phase);
    const c = (m.clipsBySide || []).find(x => x.team === side && phaseOk(x, ph));
    const nm = c ? (bx.named || []).find(x => x.name === c.clip) : null;
    if (nm && goodBox(nm.pather)) return goodBox(nm.pather);
  }
  return goodBox(bx.pather) || goodBox(bx.auto) || null;
}

module.exports = { SPEED_FALLBACK, speed, readSpeed, modeOf, resolvePhase, spawnsOf, flagsOf, activeBox };
