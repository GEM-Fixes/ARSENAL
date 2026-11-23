// gohgun: Gates of Hell cannon files (resource/set/stuff/gun/<name>) read and written at the text level, for gen opGun on GoH, the
// gun and ammo tasks (GUI task recipes, GoH tab) and Describe on the GoH Units page.
//   chain(readStr, name)      [{name, key, text}] nearest first: {from "x"} -> gun/x, {from "pattern gun"} -> gun/gun.pattern
//   calls(text)               macro calls ("name" k(v) .. | args n ..) with {start, end, inParams: shell type or null}
//   facts(readStr, name)      the gun's values through its chain (the nearest file that calls a macro wins; [V GoH data] forms below)
//   penTable(p)               the {projectileDamageTable} points a penetration_* call makes (gun/.presets [V GoH data]) -> [[dist, mm]]
//   penMacroFor(range)        penetration_long (> 205), _medium (> 155), _short (else): the .presets curve that fits a range
//   penLine(p)                ("penetration_x" shell(s) range(r) a() b() c() d() e()) or ("penetration" a() .. e()) for a pen row
//   scalePens(pens, k, rangeShift)  every shell row scaled (a..e x k, rounded) and its range moved, macro picked again for the range
//   velocityLines(f, n)       ("velocity m/s" ..) with every type scaled so ap (else he, else the first) is n; {parameters} gv too
//   armorLines(f, n)          ("armor health" damage(n)) + each ("armor health custom" shell(x) ..) scaled by n / the old damage
//   gohPen(ctx, spec, where)  the GoH part of gen opGun: pen / pen_scale / damage / speed and a numeric range for penetration rows ->
//                             {L, said, spec} (spec with the fields it wrote taken out) or null when none of them apply; {bad} on an error
// GoH forms read here (vanilla gamelogic.pak set/stuff/gun [V GoH data]): ("reload time" seconds(n)) ("fire rate" rpm(n))
// ("velocity m/s" ap(n) apcr(n) he(n) heat(n)) ("velocity" mps(n)) ("range_220") ("accuracy_direct" r1() range_ap() ..)
// ("penetration_long|medium|short" shell(x) range(r) a() b() c() d() e()) ("penetration" a() .. e()) ("armor health" damage(n))
// ("armor health custom" shell(x) damage(n) velocity(n) filler(n)) ("human health" damage(n)) {parameters "x" ("global velocity" gv(n))}.
// Whether several {parameters "x"} blocks merge over a {from} chain is [I] (vanilla files hold two of one shell type in one file).
// Author: Imperator_Aug (ARSENAL, ia-0a0d2752)
'use strict';
const GUNDIR = 'resource/set/stuff/gun/';
// the pen_scale range every caller uses (gen opGun here and in ops.js, Units Describe gohgun-copy.js)
const PEN_SCALE = [0.2, 4];
const lc = s => String(s == null ? '' : s).toLowerCase();
const PEN_MACROS = ['penetration_long', 'penetration_medium', 'penetration_short', 'penetration'];
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

// index of the brace that closes the block opening at i ('{' or '('), strings and ; comments skipped. -1 = unbalanced
function sdlEnd(s, i) {
  const open = s[i], close = open === '(' ? ')' : '}';
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"') { j = s.indexOf('"', j + 1); if (j < 0) return -1; continue; }
    if (c === ';') { const e = s.indexOf('\n', j); if (e < 0) return -1; j = e; continue; }
    if (c === open) d++; else if (c === close && --d === 0) return j;
  }
  return -1;
}
function keyOf(name) {
  const n = lc(name).trim(), p = /^pattern\s+(\S+)$/.exec(n);
  return GUNDIR + (p ? p[1] + '.pattern' : n);
}
function chain(readStr, name) {
  const out = [], seen = new Set(); let n = lc(name).trim();
  for (let i = 0; i < 10 && n && !seen.has(n); i++) {
    seen.add(n);
    const key = keyOf(n), text = readStr(key);
    if (text == null) break;
    out.push({ name: n, key, text });
    const m = /\{\s*from\s+"([^"]+)"/i.exec(text);
    n = m ? lc(m[1]) : '';
  }
  return out;
}
// the {parameters "x" ..} ranges of a text: [{a, e, shell}]
function paramRanges(text) {
  const out = [], re = /\{\s*parameters\s+"([^"]*)"/gi; let m;
  while ((m = re.exec(text))) { const e = sdlEnd(text, m.index); if (e < 0) break; out.push({ a: m.index, e, shell: lc(m[1]) }); }
  return out;
}
// ("name" k(v) .. ) and ("name" args n ..): named args as [[k, v]], args as a list; ; comments skipped
function calls(text) {
  const out = [], pr = paramRanges(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ';') { const e = text.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (c === '"') { const e = text.indexOf('"', i + 1); if (e < 0) break; i = e; continue; }
    if (c !== '(') continue;
    const m = /^\(\s*"([^"]+)"/.exec(text.slice(i, i + 200));
    if (!m) continue;
    const e = sdlEnd(text, i);
    if (e < 0) break;
    const body = text.slice(i + m[0].length, e).replace(/;[^\n]*/g, ' ');
    const named = [...body.matchAll(/([A-Za-z_][\w-]*)\(\s*([^()]*?)\s*\)/g)].map(x => [lc(x[1]), x[2]]);
    const am = /\bargs\s+([^()]*)$/i.exec(body.trim());
    const p = pr.find(r => r.a < i && r.e > e);
    out.push({ name: lc(m[1]), named, args: am ? am[1].trim().split(/\s+/) : [], start: i, end: e, inParams: p ? p.shell : null, text: text.slice(i, e + 1) });
    i = e;
  }
  return out;
}
const arg = (c, k) => { const x = c.named.find(a => a[0] === k); return x ? x[1] : undefined; };
const numArg = (c, k) => { const v = Number(arg(c, k)); return isFinite(v) && arg(c, k) !== undefined && arg(c, k) !== '' ? v : undefined; };

function facts(readStr, name) {
  const ch = chain(readStr, name), f = { found: ch.length > 0, chain: ch.map(c => c.name), key: ch.length ? ch[0].key : null };
  const all = ch.map((c, i) => ({ c, i, calls: calls(c.text) }));
  // the nearest call of a name outside {parameters}: {call, own (in the gun's own file), file}
  const first = name => {
    for (const x of all) for (const k of x.calls) if (!k.inParams && k.name === name) return { call: k, own: x.i === 0, file: x.c.name };
    return null;
  };
  let h;
  if ((h = first('reload time')) && numArg(h.call, 'seconds') !== undefined) f.reload = { value: numArg(h.call, 'seconds'), own: h.own, file: h.file };
  else for (const x of all) { const m = /\{\s*rechargeTime\s+([\d.]+)/i.exec(x.c.text); if (m) { f.reload = { value: +m[1], own: x.i === 0, file: x.c.name, plain: true }; break; } }
  if ((h = first('fire rate')) && numArg(h.call, 'rpm') !== undefined) f.rpm = { value: numArg(h.call, 'rpm'), own: h.own };
  if ((h = first('velocity m/s'))) { const t = {}; for (const [k, v] of h.call.named) if (isFinite(+v)) t[k] = +v; f.velocity = { kind: 'types', types: t, own: h.own, file: h.file }; }
  else if ((h = first('velocity')) && numArg(h.call, 'mps') !== undefined) f.velocity = { kind: 'mps', value: numArg(h.call, 'mps'), own: h.own, file: h.file };
  if (f.velocity && f.velocity.kind === 'types') { const t = f.velocity.types; f.speed = t.ap > 1 ? t.ap : t.he > 1 ? t.he : Object.values(t).find(v => v > 1); }
  else if (f.velocity) f.speed = f.velocity.value;
  // {parameters "x" ("global velocity" gv(n))}: the nearest file's per type speed
  f.gv = {};
  for (const x of all.slice().reverse()) for (const k of x.calls) if (k.inParams && k.name === 'global velocity' && numArg(k, 'gv') !== undefined) f.gv[k.inParams] = { value: numArg(k, 'gv'), own: x.i === 0 };
  if ((h = (() => { for (const x of all) for (const k of x.calls) if (!k.inParams && /^range_/.test(k.name)) return { call: k, own: x.i === 0, file: x.c.name }; return null; })())) {
    f.range = { preset: h.call.name.slice(6), own: h.own, file: h.file };
    const rn = /^(\d+)/.exec(f.range.preset); if (rn) f.rangeN = +rn[1];
  }
  for (const x of all) { const k = x.calls.find(k2 => !k2.inParams && /^accuracy_/.test(k2.name)); if (k) { f.accuracy = { name: k.name.slice(9), args: k.named, own: x.i === 0, file: x.c.name }; break; } }
  // penetration rows, one per shell type ('' = the plain table), nearest file wins
  f.pens = [];
  const seenShell = new Set();
  for (const x of all) for (const k of x.calls) {
    if (k.inParams || !PEN_MACROS.includes(k.name)) continue;
    const shell = k.name === 'penetration' ? '' : lc(arg(k, 'shell') || '');
    if (seenShell.has(shell)) continue;
    const v = LETTERS.map(l => numArg(k, l));
    if (v.some(n => n === undefined)) continue;
    seenShell.add(shell);
    f.pens.push({ macro: k.name, shell, range: numArg(k, 'range'), v, own: x.i === 0, file: x.c.name, call: k.text });
  }
  if ((h = first('armor health')) && numArg(h.call, 'damage') !== undefined) f.armor = { value: numArg(h.call, 'damage'), own: h.own, file: h.file };
  f.armorCustom = [];
  const seenC = new Set();
  for (const x of all) for (const k of x.calls) if (!k.inParams && k.name === 'armor health custom') {
    const s = lc(arg(k, 'shell') || ''); if (seenC.has(s)) continue; seenC.add(s);
    f.armorCustom.push({ shell: s, named: k.named, damage: numArg(k, 'damage'), own: x.i === 0 });
  }
  if ((h = first('human health')) && numArg(h.call, 'damage') !== undefined) f.human = { value: numArg(h.call, 'damage'), own: h.own, file: h.file };
  for (const x of all) { const m = /\{\s*calibre\s+([\d.]+)/i.exec(x.c.text); if (m) { f.calibre = +m[1]; break; } }
  for (const x of all) { const m = /\{\s*filling\s+"([^"]+)"/i.exec(x.c.text); if (m) { f.filling = lc(m[1]); break; } }
  // the main row: the first shell row of the nearest file that has any (vanilla order: the standard round first)
  f.mainPen = f.pens[0] || null;
  return f;
}
function penTable(p) {
  const [a, b, c, d, e] = p.v, r = p.range, near = Math.round((a + 1.3 + (a - b) / 4.4) * 10) / 10;
  if (p.macro === 'penetration') return [[10, near], [30, a], [100, b], [155, c], [205, d], [250, e], [500, e - 5 * (a - e)]];
  if (p.macro === 'penetration_long') return [[10, near], [30, a], [100, b], [155, c], [205, d], [r, Math.round(((250 - r) / 50 * (d - e) + e) * 10) / 10], [r + 15, 0]];
  if (p.macro === 'penetration_medium') return [[10, near], [30, a], [100, b], [155, c], [r, Math.round(((205 - r) / 50 * (c - d) + d) * 10) / 10], [r + 15, 0]];
  return [[10, near], [30, a], [100, b], [r, Math.round(((155 - r) / 55 * (b - c) + c) * 10) / 10], [r + 15, 0]];
}
const penMacroFor = r => r > 205 ? 'penetration_long' : r > 155 ? 'penetration_medium' : 'penetration_short';
function penLine(p) {
  const abc = LETTERS.map((l, i) => `${l}(${p.v[i]})`).join(' ');
  return p.macro === 'penetration' || !p.shell ? `("penetration" ${abc})` : `("${p.macro}" shell(${p.shell}) range(${p.range}) ${abc})`;
}
function scalePens(pens, k, rangeTo) {
  return pens.map(p => {
    const q = Object.assign({}, p, { v: p.v.map(x => Math.max(0, Math.round(x * k))) });
    if (rangeTo && p.shell && p.macro !== 'penetration') { q.range = Math.max(1, Math.round(rangeTo(p.range))); q.macro = penMacroFor(q.range); }
    return q;
  });
}
const r2 = n => Math.round(n * 100) / 100;
function velocityLines(f, n) {
  const v = f.velocity;
  if (!v) return null;
  if (v.kind === 'mps') return { lines: [`("velocity" mps(${n}))`], k: v.value ? n / v.value : 1 };
  const k = f.speed ? n / f.speed : 1, t = Object.entries(v.types).map(([ty, x]) => `${ty}(${x > 1 ? Math.round(x * k) : x})`).join(' ');
  const lines = [`("velocity m/s" ${t})`];
  for (const [s, g] of Object.entries(f.gv || {})) lines.push(`{parameters "${s}" ("global velocity" gv(${Math.round(g.value * k)}))}`);
  return { lines, k };
}
function armorLines(f, n) {
  if (!f.armor) return null;
  const k = f.armor.value ? n / f.armor.value : 1, lines = [`("armor health" damage(${n}))`];
  for (const c of f.armorCustom) if (c.damage !== undefined) lines.push(`("armor health custom" ${c.named.map(([a, v]) => a + '(' + (a === 'damage' ? r2(c.damage * k) : v) + ')').join(' ')})`);
  return { lines, k };
}

// gen opGun on GoH: the fields this module writes (pen, pen_scale, damage, a per type speed, and the penetration rows that follow a
// numeric range_<n>), the rest left to opGun (recharge, speed as one mps value, range, accuracy) [I][T]
function gohPen(ctx, spec, where) {
  const like = lc(spec.like).trim();
  const want = ['pen', 'pen_scale', 'damage', 'speed', 'range'].some(k => spec[k] !== undefined);
  if (!want || !like) return null;
  const f = facts(k => ctx.readStr(k), like);
  if (!f.found) return null;   // opGun says the like is missing
  const L = [], said = [], out = Object.assign({}, spec); let bad = false;
  const num = (v, what, lo, hi) => { const x = Number(v); if (!isFinite(x) || x < lo || x > hi) { ctx.err('GEN_GUN_VALUE', `${what} "${v}": a number ${lo}..${hi}`, where); bad = true; return null; } return r2(x); };
  // pen rows: scaled by pen_scale, or set from pen (5 numbers = a b c d e of the main row, every other row by the same ratio)
  let k = null;
  if (spec.pen !== undefined) {
    const p = (Array.isArray(spec.pen) ? spec.pen : String(spec.pen).trim().split(/[\s,]+/)).map(Number);
    if (p.length !== 5 || p.some(x => !isFinite(x) || x < 0 || x > 1000)) { ctx.err('GEN_GUN_VALUE', `pen "${spec.pen}": on GoH 5 numbers, a b c d e of the main shell row (mm at 30 100 155 205 m and the end of range, gun/.presets penetration_*)`, where); bad = true; }
    else if (!f.mainPen) { ctx.err('GEN_GUN_GOH_NO_PEN', `"${like}" calls no ("penetration*" ..) row in its chain (${f.chain.join(' <- ')}): there is no table to set; pick a like that has one`, where); bad = true; }
    else k = { set: p, ratio: f.mainPen.v[0] > 0 ? p[0] / f.mainPen.v[0] : 1 };
  } else if (spec.pen_scale !== undefined) {
    const x = num(spec.pen_scale, 'pen_scale', PEN_SCALE[0], PEN_SCALE[1]);
    if (x !== null && !f.mainPen) { ctx.err('GEN_GUN_GOH_NO_PEN', `"${like}" calls no ("penetration*" ..) row in its chain (${f.chain.join(' <- ')}): there is no table to scale`, where); bad = true; }
    else if (x !== null) k = { ratio: x };
  }
  // a numeric range_<n>: the shell rows' range(r) moves with it (their {range r r} per shell would keep the old reach otherwise)
  const rm = spec.range !== undefined ? /^(?:range_)?(\d+)$/.exec(lc(spec.range).trim()) : null;
  const shift = rm && f.rangeN ? (r => r + (+rm[1] - f.rangeN)) : rm ? (() => +rm[1]) : null;
  if (k || (shift && f.pens.some(p => p.shell))) {
    let rows = scalePens(f.pens, k ? k.ratio : 1, shift);
    if (k && k.set) rows = rows.map((p, i) => i === 0 ? Object.assign({}, p, { v: k.set.map(Math.round) }) : p);
    for (const p of rows) L.push(penLine(p));
    if (k) said.push(`penetration ${f.mainPen.shell || 'plain'} ${f.mainPen.v.join('/')} -> ${rows[0].v.join('/')} mm (${rows.length} shell row(s))`);
    if (shift) said.push(`penetration rows reach ${rows.filter(p => p.shell).map(p => p.shell + ' ' + p.range).join(', ')}`);
    ctx.test.push(`gun ${lc(spec.name)}: GoH, fire each shell type of ${like} at a parked tank at 30 m and at the end of range: penetration as the new rows say; the rows of ${like} are replaced by {parameters "<shell>"} blocks of the new file [I][T].`);
  }
  out.pen = undefined; out.pen_scale = undefined;
  if (spec.damage !== undefined) {
    const n = num(spec.damage, 'damage (GoH "armor health" damage)', 1, 5000);
    const a = n === null ? null : armorLines(f, n);
    if (n !== null && !a) { ctx.err('GEN_GUN_GOH_NO_ARMOR', `"${like}" calls no ("armor health" damage(..)) in its chain: there is no damage to vehicles to set`, where); bad = true; }
    else if (a) { L.push(...a.lines); said.push(`damage to vehicles ${f.armor.value} -> ${n}${f.armorCustom.length ? ' (' + f.armorCustom.length + ' per shell row(s) by the same ratio)' : ''}`); }
    out.damage = undefined;
  }
  // speed with a speed per ammo type: every type scaled (their differences kept); one mps value is opGun's own line
  if (spec.speed !== undefined && f.velocity && f.velocity.kind === 'types') {
    const n = num(spec.speed, 'speed (muzzle velocity, m/s)', 50, 2000);
    if (n !== null) {
      const v = velocityLines(f, n); L.push(...v.lines); said.push(`shell speed ${f.speed} -> ${n} m/s (every ammo type x ${r2(v.k)})`);
      ctx.test.push(`gun ${lc(spec.name)}: GoH, fire each ammo type of ${like} at a target: every type's shell speed is x ${r2(v.k)} of the like's (ap ${n} m/s) [T].`);
    }
    out.speed = undefined;
  }
  if (bad) return { bad: true };
  return { L, said, spec: out };
}

module.exports = { PEN_SCALE, GUNDIR, PEN_MACROS, sdlEnd, keyOf, chain, calls, facts, penTable, penMacroFor, penLine, scalePens, velocityLines, armorLines, gohPen };
