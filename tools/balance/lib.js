// BALANCE lib: one flat row per buyable unit from the statsheet unit catalogue, selection by any column, group statistics,
// pivots, price model (ridge fit of ln(cost) on armour, gun, speed per unit class), units that do not fit the pattern
// (price off the model, a value far from its class, dearer but no better, same stats at another price, holes), and the plan
// of a bulk change (set, add, multiply, percent, fit to the model). Pure functions: no game, no files.
// Author: Imperator_Aug (ARSENAL, ia-45ad7b97)
const D = require('../gen/lib/describe');
const lc = s => String(s == null ? '' : s).toLowerCase();
const num = v => (v == null || v === '' || !isFinite(+v) ? null : +v);

// ---- columns: id, label, type (s text, n number), what it is. `edit` = the bulk change can write it
const COLS = [
  { id: 'id', t: 's', label: 'Id' }, { id: 'name', t: 's', label: 'Name' }, { id: 'kind', t: 's', label: 'Kind' }, { id: 'army', t: 's', label: 'Army' },
  { id: 'cls', t: 's', label: 'Class' }, { id: 'weight', t: 's', label: 'Weight' }, { id: 'group', t: 's', label: 'Cooldown group' }, { id: 'src', t: 's', label: 'From' },
  { id: 'res', t: 's', label: 'Paid with' }, { id: 'cost', t: 'n', label: 'Price', edit: true }, { id: 'fit', t: 'n', label: 'Model price' }, { id: 'off', t: 'n', label: 'Off model %' },
  { id: 'rank', t: 'n', label: 'Rank', edit: true }, { id: 'charge', t: 'n', label: 'Cooldown s', edit: true }, { id: 'fore', t: 'n', label: 'Fore', edit: true },
  { id: 'wait', t: 'n', label: 'Wait at start s', edit: true }, { id: 'again', t: 'n', label: 'Wait after buy s' },
  { id: 'cp', t: 'n', label: 'Command pts' }, { id: 'men', t: 'n', label: 'Men' },
  { id: 'af', t: 'n', label: 'Armour front', edit: 'armor' }, { id: 'as', t: 'n', label: 'Armour side' }, { id: 'ar', t: 'n', label: 'Armour rear' }, { id: 'at', t: 'n', label: 'Armour top' },
  { id: 'speed', t: 'n', label: 'Top speed', edit: true }, { id: 'mass', t: 'n', label: 'Mass kg' },
  { id: 'gun', t: 's', label: 'Gun' }, { id: 'cal', t: 'n', label: 'Calibre mm' }, { id: 'pen', t: 'n', label: 'Pen 100 m' }, { id: 'dmg', t: 'n', label: 'Damage' },
  { id: 'reload', t: 'n', label: 'Reload s', edit: true }, { id: 'range', t: 'n', label: 'Range m' },
  { id: 'bots', t: 'n', label: 'Bots buy' }, { id: 'dcost', t: 'n', label: 'Price vs game' }, { id: 'odd', t: 'n', label: 'Odd' },
];
const COL = new Map(COLS.map(c => [c.id, c]));
const EDIT = { cost: { min: 0, max: 100000, step: 5 }, rank: { min: 0, max: 50, step: 1 }, charge: { min: 0, max: 3600, step: 1 }, fore: { min: -10, max: 1, step: 0.05 }, wait: { min: 0, max: 7200, step: 1 },
  speed: { min: 1, max: 200, step: 1 }, armor: { min: 1, max: 2000, step: 1 }, reload: { min: 0.05, max: 120, step: 0.05 } };

function armourOf(u) {
  let mp = null;
  for (const m of u.armorMacro || []) for (const p of m.parts) if (p.values.length === 4 && (!mp || p.values[0] > mp[0])) mp = p.values;
  if (mp) return mp;
  const a = (u.armorAreas || []).find(x => lc(x.name) === 'body') || u.armorMax;
  return a && a.front != null ? [a.front, a.side, a.rear, a.top] : null;
}
function penAt(s, m) { const r = new RegExp('(?:^|\\s)' + m + 'm:([\\d.]+)').exec(String(s || '')); return r ? +r[1] : null; }

// ---- economy: what each buy panel button is paid with, and the cooldown factors, from the game presets
// {budgets {vehicle {resource ..} {buttons "squad1 v1 .."}} {hero {resource {start 10}} {buttons "hero"} {tag "special"}}} {chargeFactors {value "*=1"}}
// The budget "vehicle" is manpower (mp). Every other budget is its own resource: vanilla "hero" = special points (sp); a mod's
// budget keeps its own name (dp ..). Prices in different resources are never compared or modelled together.
function block(text, at) { let d = 0; for (let i = at; i < text.length; i++) { const c = text[i]; if (c === '"') { i = text.indexOf('"', i + 1); if (i < 0) break; } else if (c === '{') d++; else if (c === '}' && --d === 0) return text.slice(at, i + 1); } return text.slice(at); }
function children(b) { const out = []; let d = 0; for (let i = 0; i < b.length; i++) { const c = b[i]; if (c === '"') { i = b.indexOf('"', i + 1); if (i < 0) break; } else if (c === '{') { if (++d === 2) { const x = block(b, i); out.push(x); i += x.length - 1; d--; } } else if (c === '}') d--; } return out; }
const RES = { vehicle: 'mp', hero: 'sp' };
// GoH (opt.game 'goh'): the same {budgets} form [V data: presets/global_parameters/budget.inc], the hero budget pays the doctrine
// button: dp (doctrine points) [I]. Its start is a macro argument there (start %s, start %d), so the start of each budget is the most
// used start(N) / doctrine(N) argument of the preset calls, finish(N) likewise [V data: presets/preset_*.inc]; the side's
// balancing mpStart/mpFinish (GHGPL-12) is not applied (1) [I]
const RES_GOH = { vehicle: 'mp', hero: 'dp' };
function economy(texts, opt) {
  const goh = !!(opt && opt.game === 'goh');
  const eco = economy1(texts, goh ? RES_GOH : RES);
  if (!goh) return eco;
  eco.game = 'goh';
  const tally = re => { const m = new Map(); for (const raw of texts || []) { const t = String(raw).replace(/;[^\r\n]*/g, ''); let x; const r = new RegExp(re.source, 'g'); while ((x = r.exec(t))) m.set(+x[1], (m.get(+x[1]) || 0) + 1); } let b = null; for (const [k, n] of m) if (!b || n > b[1]) b = [k, n]; return b ? b[0] : null; };
  const st = tally(/\bstart\(\s*([\d.]+)\s*\)/), fi = tally(/\bfinish\(\s*([\d.]+)\s*\)/), dc = tally(/\bdoctrine\(\s*([\d.]+)\s*\)/);
  for (const b of eco.budgets) {
    if (b.name === 'vehicle') { if (b.start == null) b.start = st; b.finish = fi; }
    else if (b.name === 'hero' && b.start == null) b.start = dc;
  }
  return eco;
}
function economy1(texts, RES) {
  const eco = { budgets: [], factors: null, factorSets: [] }, fc = new Map(), top = m => { let b = null; for (const [k, n] of m) if (!b || n > b[1]) b = [k, n]; return b ? b[0] : null; };
  for (const raw of texts || []) {
    const t = String(raw).replace(/"[^"\r\n]*"|;[^\r\n]*/g, x => x[0] === '"' ? x : ''); let m; const re = /\{\s*budgets\b/g;
    while ((m = re.exec(t))) for (const c of children(block(t, m.index))) {
      const name = lc((/^\{\s*([\w-]+)/.exec(c) || [])[1]); if (!name || !/\{\s*resource\b/.test(c)) continue;
      const buttons = lc((/\{\s*buttons\s+"([^"]*)"/.exec(c) || [])[1] || '').split(/\s+/).filter(Boolean), start = num((/\{\s*start\s+([\d.]+)/.exec(c) || [])[1]);
      let b = eco.budgets.find(x => x.name === name); if (!b) { b = { name, res: RES[name] || name, buttons: [], start: null, _st: new Map(), tag: (/\{\s*tag\s+"([^"]*)"/.exec(c) || [])[1] || '' }; eco.budgets.push(b); }
      for (const x of buttons) if (!b.buttons.includes(x)) b.buttons.push(x);
      if (start != null) b._st.set(start, (b._st.get(start) || 0) + 1);
    }
    const fr = /\{\s*chargeFactors\s*\{\s*value\s+"([^"]*)"/g; let f; while ((f = fr.exec(t))) { const k = f[1].split(';').map(p => /^\s*([^=\s]+)\s*=\s*([\d.]+)/.exec(p)).filter(Boolean).map(p => lc(p[1]) + '=' + (+p[2])).join(';'); if (!k) continue; fc.set(k, (fc.get(k) || 0) + 1); }
  }
  // presets differ (a mode may set its own factors): the most used set is the one the numbers are shown for, the rest are listed
  eco.factors = top(fc); eco.factorSets = [...fc.keys()];
  for (const b of eco.budgets) { b.start = top(b._st); delete b._st; }
  return eco;
}
// resource of a unit: the budget that owns its panel button; without presets: button or tag "hero" = sp, the rest mp
function resOf(u, eco) {
  const b = lc(u.button);
  for (const x of (eco && eco.budgets) || []) if (x.buttons.includes(b)) return x.res;
  if (eco && eco.game === 'goh') return b === 'doctrine' ? 'dp' : 'mp';
  return b === 'hero' || / hero /.test(' ' + lc(u.tags) + ' ') ? 'sp' : 'mp';
}
// cooldown factor of a unit: first of its tags named in chargeFactors, else "*", else 1
function factorOf(u, eco) {
  const f = {}; for (const p of String((eco && eco.factors) || '').split(';')) { const m = /^\s*([^=\s]+)\s*=\s*([\d.]+)/.exec(p); if (m) f[lc(m[1])] = +m[2]; }
  for (const t of lc(u.tags).split(/\s+/)) if (t && f[t] != null) return f[t];
  return f['*'] != null ? f['*'] : 1;
}
// the wait before the first buy = cooldown x factor x (1 - fore); fore 1 = ready at once, 0 = one full cooldown, below 0 = longer
const waitOf = (charge, fore, k) => charge == null ? null : Math.max(0, Math.round(charge * (k == null ? 1 : k) * (1 - (fore == null ? 0 : fore)) * 10) / 10);

// GoH unit class: GoH unit files sit one folder deeper (resource/entity/-vehicle/<country>/<type>/..), so the class reads the def
// path with the country folder dropped [V data: 1596 GoH defs under -vehicle/<country>/]; GoH cards have no rank (level not read)
const gohClassOf = u => D.classOf(Object.assign({}, u, { def: String(u.def || '').replace(/^(resource\/entity\/[^/]+\/)[^/]+\/(?=[^/]+\/)/i, '$1') }));
// rows of one catalogue; `van` (the game without the mod) adds src and dcost
// GoH (opt.game 'goh' or cat.exe 'goh'): wait at start = charge.delay x factor (once at game start), wait after a buy = interval x
// factor (GHMIS-86 [V]; the balancing chargeDelay / charge factors are taken as 1 [I]); rank and fore are not read by GoH: empty
function rows(cat, van, opt) {
  const gf = opt && opt.gunFacts, eco = opt && opt.economy, memo = new Map();
  const goh = (opt && opt.game) === 'goh' || cat.exe === 'goh';
  if (goh) return gohRows(cat, van, opt);
  const facts = n => { if (!gf) return null; const k = lc(n); if (!memo.has(k)) { let v = null; try { v = gf(n); } catch (e) { v = null; } memo.set(k, v && v.found ? v : null); } return memo.get(k); };
  const out = [];
  for (const u of cat.units || []) {
    if (!u.buyable || u.kind === 'soldier') continue;
    // many: a group buy (a vehicle card that brings more than its own one vehicle): its armour columns read N/A on the page
    // same rule as the Units page (ext/units/server.js manyOf): outside the crew brackets more than one thing, one of them a vehicle;
    // ":0" counts as none; one vehicle with its crew ("* ( .. )", "pz5g ( .. )") is not a group
    const manyOf = x => { if (x.kind !== 'vehicle' || !x.content) return 0; let n = 0, veh = 0; for (const w of String(x.content).replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean)) { const i = w.lastIndexOf(':'), p = i > 0 ? parseInt(w.slice(i + 1), 10) : 1, c = p >= 0 ? p : 1; n += c; if (c && !/^mp\//i.test(w)) veh++; } return n > 1 && veh ? 1 : 0; };
    const a = u.kind === 'vehicle' ? armourOf(u) : null, g = u.gun || null, v = van && van.byId ? van.byId.get(lc(u.id)) : null, k = factorOf(u, eco), ch = num(u.charge);
    const r = {
      id: u.id, name: u.name || u.id, kind: u.kind, many: manyOf(u), army: u.army, cls: D.classOf(u), weight: (/ (sheavy|heavy|medium|light) /.exec(' ' + lc(u.tags) + ' ') || [])[1] || '',
      group: u.group || '', src: !van ? 'game' : !v ? 'new' : (u.cardMod || u.defMod) ? 'mod' : 'game',
      res: resOf(u, eco), cost: num(u.cost), fit: null, off: null, rank: num(u.level), charge: ch, fore: num(u.fore), wait: waitOf(ch, num(u.fore), k), again: ch == null ? null : Math.round(ch * k * 10) / 10, cp: num(u.cp),
      men: u.kind === 'squad' ? (u.members || []).reduce((s, m) => s + (m.n || 0), 0) || null : num(u.crew),
      af: a ? a[0] : null, as: a ? a[1] : null, ar: a ? a[2] : null, at: a ? a[3] : null,
      speed: num(u.speed), mass: num(u.mass), gun: g ? g.weapon : '', cal: D.calibre(u), pen: g ? penAt(g.pen, 100) : null, dmg: g ? num(g.damage) : null,
      reload: g ? num(g.recharge) : null, range: g && g.range ? Math.max(...String(g.range).split(/[^\d.]+/).filter(Boolean).map(Number)) : null,
      _k: k, bots: (u.bots || []).some(b => lc(b.army) === lc(u.army)) ? 1 : 0, dcost: v && v.cost != null && u.cost != null ? u.cost - v.cost : null, odd: 0,
    };
    // a gun the catalogue could not read (inherited file, name with brackets): the gun file chain fills the gaps
    if (g && (r.reload == null || r.dmg == null || r.pen == null)) { const x = facts(g.weapon); if (x) { if (r.reload == null) r.reload = num(x.recharge); if (r.dmg == null) r.dmg = num(x.damage); if (r.pen == null && x.pen) r.pen = num(x.pen[3]); } }
    out.push(r);
  }
  return out;
}

function gohRows(cat, van, opt) {
  const out = rows({ units: cat.units }, van, Object.assign({}, opt, { game: null }));
  const us = (cat.units || []).filter(u => u.buyable && u.kind !== 'soldier');
  // the game copy of a card is the one with the same id in the same period file (rows() looked it up by id alone)
  const vk = van && van.units ? new Map(van.units.map(x => [gohKey(x), x])) : null;
  out.forEach((r, i) => {
    const u = us[i], k = r._k == null ? 1 : r._k, d = num(u.delay);
    r.cls = gohClassOf(u); r.rank = null; r.fore = null; r._delay = d; r._goh = true; r._card = gohKey(u);
    if (vk) { const v = vk.get(r._card); r.src = !v ? 'new' : (u.cardMod || u.defMod) ? 'mod' : 'game'; r.dcost = v && v.cost != null && u.cost != null ? u.cost - v.cost : null; }
    r.wait = d == null ? null : Math.max(0, Math.round(d * k * 10) / 10);
    if (!r.name || r.name === r.id) r.name = u.name || u.id;
  });
  return out;
}

// ---- selection: [{f, op, v}] all must hold. ops: = != > >= < <= ~ (regex) in (list)
function parseWhere(text) {
  const out = [];
  for (const tok of String(text || '').match(/(?:[^\s"]+|"[^"]*")+/g) || []) {
    const m = /^([a-z_]+)(>=|<=|!=|=|>|<|~)(.*)$/i.exec(tok.replace(/"/g, ''));
    if (!m) throw new Error('filter "' + tok + '": write column=value, column>number, column~text (columns: ' + COLS.map(c => c.id).join(' ') + ')');
    if (!COL.has(lc(m[1]))) throw new Error('filter "' + tok + '": no column "' + m[1] + '" (columns: ' + COLS.map(c => c.id).join(' ') + ')');
    out.push({ f: lc(m[1]), op: m[2], v: m[3] });
  }
  return out;
}
function test(r, c) {
  const x = r[c.f], col = COL.get(c.f);
  if (c.op === '~') { try { return new RegExp(c.v, 'i').test(String(x == null ? '' : x)); } catch (e) { return false; } }
  if (c.op === '=' || c.op === '!=') {
    const list = String(c.v).split(',').map(s => s.trim()).filter(s => s !== '');
    const hit = list.some(v => col && col.t === 'n' ? num(x) === num(v) : lc(x) === lc(v));
    return c.op === '=' ? hit : !hit;
  }
  const a = num(x), b = num(c.v); if (a == null || b == null) return false;
  return c.op === '>' ? a > b : c.op === '>=' ? a >= b : c.op === '<' ? a < b : a <= b;
}
function select(rs, where, ids) {
  const set = ids && ids.length ? new Set(ids.map(lc)) : null;
  return rs.filter(r => (!set || set.has(lc(r.id))) && (where || []).every(c => test(r, c)));
}

// ---- statistics
const sorted = a => a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y);
function quant(a, p) { const s = sorted(a); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
const median = a => quant(a, 0.5);
function stat(a) {
  const s = sorted(a); if (!s.length) return { n: 0, min: null, q1: null, median: null, mean: null, q3: null, max: null, sum: null };
  const sum = s.reduce((x, y) => x + y, 0), r = x => Math.round(x * 100) / 100;
  return { n: s.length, min: s[0], q1: r(quant(s, 0.25)), median: r(quant(s, 0.5)), mean: r(sum / s.length), q3: r(quant(s, 0.75)), max: s[s.length - 1], sum: r(sum) };
}
function mad(a) { const m = median(a); if (m == null) return null; return 1.4826 * median(a.filter(x => x != null).map(x => Math.abs(x - m))); }
// groups by one or more columns; every numeric column in `of` gets its statistics
function groupBy(rs, keys, of) {
  const g = new Map();
  for (const r of rs) { const k = keys.map(x => String(r[x] == null || r[x] === '' ? '-' : r[x])).join(' | '); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g].map(([key, list]) => { const o = { key, n: list.length }; for (const f of of) o[f] = stat(list.map(r => r[f])); return o; }).sort((a, b) => a.key < b.key ? -1 : 1);
}
// matrix: row key x column key -> one statistic of one measure
function pivot(rs, rowKey, colKey, of, what) {
  const rk = [...new Set(rs.map(r => String(r[rowKey] || '-')))].sort(), ck = colKey ? [...new Set(rs.map(r => String(r[colKey] || '-')))].sort() : ['all'];
  const cell = (a, b) => { const l = rs.filter(r => String(r[rowKey] || '-') === a && (!colKey || String(r[colKey] || '-') === b)); const s = stat(l.map(r => of === 'n' ? 1 : r[of])); return what === 'count' ? l.length : s[what || 'median']; };
  return { rows: rk, cols: ck, of, what: what || 'median', cells: rk.map(a => ck.map(b => cell(a, b))) };
}

// ---- price model: ln(cost) = b0 + b . z(features), ridge, one model per class with enough units
const FEATS = { squad: ['men'], _: ['af', 'as', 'pen', 'dmg', 'speed', 'reload', 'men'] };
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}
// two passes: the units far off the first fit are left out of the second, so one wild price does not bend the pattern it is judged by
function fitModel(list, feats) {
  const m = fit1(list, feats); if (!m) return null;
  const keep = list.filter(r => { const p = r.cost > 0 ? m.pred(r) : null; return p == null || Math.abs(Math.log(r.cost) - p) <= 3 * m.spread; });
  return (keep.length < list.length && fit1(keep, feats)) || m;
}
function fit1(list, feats) {
  const use = feats.filter(f => list.filter(r => r[f] != null).length >= list.length * 0.8 && new Set(list.map(r => r[f])).size > 1);
  const data = list.filter(r => r.cost > 0 && use.every(f => r[f] != null));
  if (!use.length || data.length < Math.max(8, 2 * use.length + 2)) return null;
  const mu = use.map(f => data.reduce((s, r) => s + r[f], 0) / data.length), sd = use.map((f, i) => Math.sqrt(data.reduce((s, r) => s + (r[f] - mu[i]) ** 2, 0) / data.length) || 1);
  const X = data.map(r => [1].concat(use.map((f, i) => (r[f] - mu[i]) / sd[i]))), y = data.map(r => Math.log(r.cost)), p = use.length + 1;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, x) => s + x[i] * x[j], 0) + (i === j && i ? 1 : 0)));
  const b = solve(A, Array.from({ length: p }, (_, i) => X.reduce((s, x, k) => s + x[i] * y[k], 0)));
  if (!b) return null;
  const pred = r => use.every(f => r[f] != null) ? b[0] + use.reduce((s, f, i) => s + b[i + 1] * (r[f] - mu[i]) / sd[i], 0) : null;
  const res = data.map(r => Math.log(r.cost) - pred(r)), my = y.reduce((s, v) => s + v, 0) / y.length;
  const r2 = 1 - res.reduce((s, v) => s + v * v, 0) / (y.reduce((s, v) => s + (v - my) ** 2, 0) || 1);
  return { feats: use, n: data.length, r2: Math.round(r2 * 100) / 100, spread: Math.max(0.08, mad(res) || 0), pred, weights: use.map((f, i) => ({ f, w: Math.round(b[i + 1] * 100) / 100 })) };
}
// fills fit and off on every row; returns the models (class -> {feats, n, r2, weights})
function model(rs) {
  const by = new Map(), out = {};
  for (const r of rs) { if (r.res !== 'mp') continue; if (!by.has(r.cls)) by.set(r.cls, []); by.get(r.cls).push(r); }   // manpower prices only: other resources have their own scale
  for (const [cls, list] of by) {
    const m = fitModel(list, FEATS[cls] || FEATS._); if (!m) continue;
    if (m.r2 < 0.5) { out[cls] = { feats: m.feats, n: m.n, r2: m.r2, weak: true, weights: m.weights }; continue; }   // no real pattern: no model price
    out[cls] = { feats: m.feats, n: m.n, r2: m.r2, spread: Math.round(m.spread * 100) / 100, weights: m.weights };
    for (const r of list) { const p = r.cost > 0 ? m.pred(r) : null; if (p == null) continue; r.fit = Math.round(Math.exp(p) / 5) * 5; r.off = Math.round((r.cost / Math.exp(p) - 1) * 100); r._z = (Math.log(r.cost) - p) / m.spread; }
  }
  return out;
}

// ---- units that do not fit: [{id, code, sev 1..3, text, other?}], and r.odd = count
const BETTER = ['af', 'pen', 'dmg', 'speed'];
function odd(rs, models, eco) {
  const out = [], add = (r, code, sev, text, other) => out.push({ id: r.id, name: r.name, army: r.army, cls: r.cls, code, sev, text, other: other || null });
  const by = (f) => { const m = new Map(); for (const r of rs) { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  // holes
  for (const r of rs) {
    if (r.cost == null || r.cost <= 0) add(r, 'NO_PRICE', 3, 'has no price (or price 0) but is in the buy panel');
    if ((!r.name || r.name === r.id) && r.cls !== 'other') add(r, 'NO_NAME', 1, 'has no name text: the buy panel shows its id');
  }
  // price off the model of its class
  for (const r of rs) if (r._z != null && Math.abs(r._z) > 2.5 && Math.abs(r.off) >= 20) {
    const m = models[r.cls];
    add(r, r.off < 0 ? 'PRICE_LOW' : 'PRICE_HIGH', Math.abs(r._z) > 4 ? 3 : 2, 'price ' + r.cost + ' is ' + Math.abs(r.off) + '% ' + (r.off < 0 ? 'below' : 'above') + ' what ' + r.cls + ' units with its ' + m.feats.map(f => COL.get(f).label.toLowerCase()).join(', ') + ' cost (about ' + r.fit + ')');
  }
  // one value far from the rest of its class
  for (const [, list] of by(r => r.res + '|' + r.cls)) {
    if (list.length < 8 || list[0].cls === 'other') continue;
    for (const f of ['speed', 'af', 'pen', 'dmg', 'reload', 'range', 'again', 'wait', 'men', 'cp']) {
      const vals = list.map(r => r[f]), m = median(vals), s = mad(vals);
      if (m == null || !s) continue;
      for (const r of list) if (r[f] != null && Math.abs(r[f] - m) / s > 4.5) add(r, 'FAR_' + f.toUpperCase(), 1, COL.get(f).label.toLowerCase() + ' ' + r[f] + ' is far from other ' + r.cls + ' units' + (r.res === 'mp' ? '' : ' paid with ' + r.res) + (f === 'wait' ? ' (cooldown ' + r.charge + ' s, fore ' + (r.fore == null ? 0 : r.fore) + ')' : '') + ' (usual ' + Math.round(quant(vals, 0.1) * 10) / 10 + ' to ' + Math.round(quant(vals, 0.9) * 10) / 10 + ')');
    }
  }
  // dearer but no better than a unit of the same army and class
  for (const [, list] of by(r => r.army + '|' + r.cls + '|' + r.res)) {
    for (const a of list) {
      if (!(a.cost > 0) || a.kind !== 'vehicle') continue;
      let worst = null;
      for (const b of list) {
        if (b === a || !(b.cost > 0) || a.cost < b.cost * 1.1) continue;
        const fs = BETTER.filter(f => a[f] != null && b[f] != null); if (fs.length < 3) continue;
        if (fs.every(f => a[f] <= b[f]) && fs.some(f => a[f] < b[f]) && (a.reload == null || b.reload == null || a.reload >= b.reload) && (!worst || b.cost < worst.cost)) worst = b;
      }
      if (worst) add(a, 'DEARER_NO_BETTER', 2, 'costs ' + a.cost + ' but ' + worst.name + ' (' + worst.id + ', ' + worst.cost + ') of the same army has at least its armour, gun and speed', worst.id);
    }
  }
  // same stats, different price (across armies too)
  const sig = r => r.kind === 'vehicle' && r.af != null && r.gun ? [r.res, r.cls, r.af, r.as, r.ar, r.gun, r.speed, r.men].join('/') : null;
  for (const [k, list] of by(sig)) {
    if (k === 'null' || k == null || list.length < 2) continue;
    const cs = list.filter(r => r.cost > 0).sort((a, b) => a.cost - b.cost); if (cs.length < 2) continue;
    const lo = cs[0], hi = cs[cs.length - 1];
    if (hi.cost > lo.cost * 1.15) { add(hi, 'TWIN_PRICE', 2, 'same armour, gun and speed as ' + lo.name + ' (' + lo.id + ', ' + lo.army + ') but costs ' + hi.cost + ' against ' + lo.cost, lo.id); }
  }
  // a price in another resource (special points ..): checked against the start budget of that resource and against its own kind
  for (const [res, list] of by(r => r.res)) {
    if (res === 'mp') continue;
    const b0 = ((eco && eco.budgets) || []).find(x => x.res === res), vals = list.map(r => r.cost), m = median(vals);
    for (const r of list) {
      if (!(r.cost > 0)) continue;
      if (m > 0 && list.length >= 4 && (r.cost > m * 20 || r.cost > 50)) add(r, 'RES_SCALE', 3, 'is paid with ' + res + ' (button "' + (b0 ? b0.buttons.join(' ') : 'hero') + '") but its price ' + r.cost + ' looks like a manpower price (other ' + res + ' prices are around ' + m + ')');
      else if (b0 && b0.start != null && r.cost > b0.start) add(r, 'OVER_BUDGET', 3, 'costs ' + r.cost + ' ' + res + ' but a player only ever gets ' + b0.start + ' ' + res);
    }
  }
  // wait at start out of order: inside one army and class, a dearer unit that is ready much sooner than a cheaper one
  for (const [, list] of by(r => r.army + '|' + r.cls + '|' + r.res)) {
    const l = list.filter(r => r.cost > 0 && r.wait != null && r.kind === 'vehicle').sort((a, b) => a.cost - b.cost); if (l.length < 4) continue;
    const top = l[l.length - 1], rest = l.slice(0, -1).filter(r => r.cost <= top.cost * 0.6), mw = median(rest.map(r => r.wait));
    if (rest.length >= 3 && mw >= 30 && top.wait < mw * 0.25) add(top, 'READY_EARLY', 2, 'is the most expensive ' + top.cls + ' of ' + top.army + ' (' + top.cost + ') yet can be bought after ' + top.wait + ' s (cooldown ' + top.charge + ' s, fore ' + (top.fore == null ? 0 : top.fore) + '); cheaper ones wait about ' + Math.round(mw) + ' s');
  }
  const n = new Map(); for (const o of out) n.set(o.id, (n.get(o.id) || 0) + 1);
  for (const r of rs) r.odd = n.get(r.id) || 0;
  return out.sort((a, b) => b.sev - a.sev || (a.id < b.id ? -1 : 1));
}

// ---- bulk change plan: change = {field, op: set|add|mul|pct|fit, value, step}; -> {rows:[{id, field, old, new}], skipped:[{id, why}]}
function planChange(rs, ch) {
  const f = ch.field === 'af' ? 'armor' : ch.field, lim = EDIT[f], out = { rows: [], skipped: [] };
  if (!lim) throw new Error('This column cannot be changed in bulk. Changeable: ' + Object.keys(EDIT).join(', ') + '.');
  if (ch.game === 'goh' || rs.some(r => r._goh)) return planGoh(rs, ch, f, lim, out);
  const op = ch.op || 'set', v = num(ch.value);
  if (op === 'fit' ? f !== 'cost' : v == null) throw new Error(op === 'fit' ? 'Fit to the model works on the price only.' : 'Type a number.');
  if (!['set', 'add', 'mul', 'pct', 'fit'].includes(op)) throw new Error('Unknown operation "' + op + '" (set, add, mul, pct, fit).');
  if (op === 'mul' && !(v > 0)) throw new Error('Multiply by a number above 0.');
  if (op === 'pct' && !(v > -95 && v <= 1000)) throw new Error('Percent between -95 and 1000.');
  const step = num(ch.step) > 0 ? num(ch.step) : lim.step, src = f === 'armor' ? 'af' : f;
  if (f === 'cost' && op !== 'fit') { const kinds = [...new Set(rs.map(r => r.res))]; if (kinds.length > 1) throw new Error('The selection mixes prices in different resources (' + kinds.join(', ') + '). Narrow it first, for example res=mp.'); }
  for (const r of rs) {
    if (f === 'cost' && op === 'fit' && r.res !== 'mp') { out.skipped.push({ id: r.id, why: 'is paid with ' + r.res + ', the price model is for manpower' }); continue; }
    const old = r[src];
    if (old == null && !(op === 'set' && f !== 'armor')) { out.skipped.push({ id: r.id, why: 'has no ' + (COL.get(src) || { label: src }).label.toLowerCase() }); continue; }
    let nv;
    if (f === 'armor') {   // every armour number of the unit is scaled by the same factor
      const k = op === 'set' ? v / old : op === 'add' ? (old + v) / old : op === 'mul' ? v : 1 + v / 100;
      if (!(old > 0) || !(k > 0) || k > 20) { out.skipped.push({ id: r.id, why: 'armour factor out of range' }); continue; }
      if (Math.abs(k - 1) < 1e-9) continue;
      out.rows.push({ id: r.id, name: r.name, field: 'armor', old: [r.af, r.as, r.ar, r.at].join(' '), new: [r.af, r.as, r.ar, r.at].map(x => Math.max(1, Math.round(x * k))).join(' '), factor: Math.round(k * 1000) / 1000 });
      continue;
    }
    if (op === 'fit') { if (r.fit == null) { out.skipped.push({ id: r.id, why: 'no price model for its class' }); continue; } nv = r.fit; }
    else nv = op === 'set' ? v : op === 'add' ? old + v : op === 'mul' ? old * v : old * (1 + v / 100);
    nv = Math.round(Math.round(nv / step) * step * 1000) / 1000;
    nv = Math.min(lim.max, Math.max(lim.min, nv));
    if (nv === old) continue;
    const k = r._k == null ? 1 : r._k, w = { waitOld: r.wait };
    if (f === 'wait') {   // the wait at start is not stored: it is reached through fore = 1 - wait / (cooldown x factor)
      if (!(r.charge > 0)) { out.skipped.push({ id: r.id, why: 'has no cooldown, so no wait to set (change the cooldown first)' }); continue; }
      const fore = Math.min(EDIT.fore.max, Math.max(EDIT.fore.min, Math.round((1 - nv / (r.charge * k)) * 100) / 100));
      if (fore === (r.fore == null ? 0 : r.fore)) continue;
      out.rows.push({ id: r.id, name: r.name, field: 'fore', old: r.fore, new: fore, waitOld: r.wait, waitNew: waitOf(r.charge, fore, k) }); continue;
    }
    if (f === 'charge') w.waitNew = waitOf(nv, r.fore, k); else if (f === 'fore') w.waitNew = waitOf(r.charge, nv, k);
    out.rows.push(Object.assign({ id: r.id, name: r.name, field: f, old, new: nv }, w.waitNew != null ? w : {}));
  }
  return out;
}

// GoH bulk change: cost (the card's own cost moves by the same amount as the buy price, GHGPL-10), charge (the interval) and wait
// (the first delay = new wait / factor), written into the card's macro arguments or keys (apply.js). GoH does not read rank or fore
// (goh-unit-card-cost [V]); reload goes into the gun file (apply.js -> gohreload.js, [T]); speed and armour into the unit's def
// and its included files (apply.js -> gohbody.js -> lib/goharmour.js: top speed, every armour part scaled by one factor, [T]).
const GOH_EDIT = ['cost', 'charge', 'wait', 'reload', 'speed', 'armor'];
// why a --change column is not offered on GoH: {why, row} (row null = not built yet, no cited row), or null when it can change
function gohChangeNo(f) {
  if (f === 'rank' || f === 'fore') return { why: 'Gates of Hell does not read the card ' + (f === 'rank' ? 'level' : 'fore') + ' (no rank lock, no start progress)', row: 'gohweb gameplay/goh-unit-card-cost' };
  if (!GOH_EDIT.includes(f)) return { why: 'not built yet for Gates of Hell: this column is written into GoH unit or gun files through gen ops that are not checked on GoH data yet; change it on the unit file', row: null };
  return null;
}
// a GoH card is one id in one period file: the same id repeats in the early, mid and late files with its own values
const gohKey = u => lc(u.id) + '@' + lc(u.cardFile || '');
function planGoh(rs, ch, f, lim, out) {
  const no = gohChangeNo(f);
  if (no) throw new Error(require('../lib/games').notFor('balance --change ' + f, 'goh', no.why, no.row));
  const op = ch.op || 'set', v = num(ch.value);
  if (op === 'fit' ? f !== 'cost' : v == null) throw new Error(op === 'fit' ? 'Fit to the model works on the price only.' : 'Type a number.');
  if (!['set', 'add', 'mul', 'pct', 'fit'].includes(op)) throw new Error('Unknown operation "' + op + '" (set, add, mul, pct, fit).');
  if (op === 'mul' && !(v > 0)) throw new Error('Multiply by a number above 0.');
  if (op === 'pct' && !(v > -95 && v <= 1000)) throw new Error('Percent between -95 and 1000.');
  const step = num(ch.step) > 0 ? num(ch.step) : lim.step;
  if (f === 'cost' && op !== 'fit') { const kinds = [...new Set(rs.map(r => r.res))]; if (kinds.length > 1) throw new Error('The selection mixes prices in different resources (' + kinds.join(', ') + '). Narrow it first, for example res=mp.'); }
  for (const r of rs) {
    if (f === 'cost' && op === 'fit' && r.res !== 'mp') { out.skipped.push({ id: r.id, why: 'is paid with ' + r.res + ', the price model is for manpower' }); continue; }
    if (f === 'armor') {   // every armour number of the unit's files is scaled by the same factor (front armour as the measure)
      const a = r.af;
      if (a == null) { out.skipped.push({ id: r.id, why: 'has no armour front' }); continue; }
      const k = op === 'set' ? v / a : op === 'add' ? (a + v) / a : op === 'mul' ? v : 1 + v / 100;
      if (!(a > 0) || !(k > 0) || k > 10) { out.skipped.push({ id: r.id, why: 'armour factor out of range (above 0, at most 10)' }); continue; }
      if (Math.abs(k - 1) < 1e-9) continue;
      out.rows.push({ id: r.id, name: r.name, card: r._card, field: 'armor', old: [r.af, r.as, r.ar, r.at].join(' '), new: [r.af, r.as, r.ar, r.at].map(x => x == null ? '' : Math.max(1, Math.round(x * k))).join(' '), factor: Math.round(k * 1000) / 1000 });
      continue;
    }
    const old = r[f];
    if (old == null && op !== 'set') { out.skipped.push({ id: r.id, why: 'has no ' + COL.get(f).label.toLowerCase() }); continue; }
    let nv;
    if (op === 'fit') { if (r.fit == null) { out.skipped.push({ id: r.id, why: 'no price model for its class' }); continue; } nv = r.fit; }
    else nv = op === 'set' ? v : op === 'add' ? old + v : op === 'mul' ? old * v : old * (1 + v / 100);
    nv = Math.min(lim.max, Math.max(lim.min, Math.round(Math.round(nv / step) * step * 1000) / 1000));
    if (nv === old) continue;
    const k = r._k == null ? 1 : r._k;
    if (f === 'wait') { const d = Math.round(nv / k * 10) / 10; if (d === r._delay) continue; out.rows.push({ id: r.id, name: r.name, card: r._card, field: 'delay', old: r._delay, new: d, waitOld: r.wait, waitNew: Math.round(d * k * 10) / 10 }); continue; }
    out.rows.push({ id: r.id, name: r.name, card: r._card, field: f, old, new: nv });
  }
  return out;
}

// ---- text outputs
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(rs, cols) { cols = cols || COLS.map(c => c.id); return [cols.join(',')].concat(rs.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\r\n') + '\r\n'; }
function toMd(rs, cols) { cols = cols || COLS.map(c => c.id); return ['| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|'].concat(rs.map(r => '| ' + cols.map(c => r[c] == null ? '' : String(r[c]).replace(/\|/g, '/')).join(' | ') + ' |')).join('\n') + '\n'; }
function sortRows(rs, key) {
  const desc = key[0] === '-', f = desc ? key.slice(1) : key, t = (COL.get(f) || {}).t;
  return rs.slice().sort((a, b) => { const x = a[f], y = b[f]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; const c = t === 'n' ? x - y : String(x).localeCompare(String(y)); return desc ? -c : c; });
}
// everything a view needs in one go
function build(cat, van, opt) { const rs = rows(cat, van, opt), models = model(rs), eco = (opt && opt.economy) || null, odds = odd(rs, models, eco); for (const r of rs) delete r._z; return { rows: rs, models, odd: odds, economy: eco }; }

module.exports = { COLS, COL, EDIT, GOH_EDIT, gohChangeNo, gohKey, gohClassOf, economy, resOf, factorOf, waitOf, rows, parseWhere, select, stat, quant, median, mad, groupBy, pivot, model, odd, planChange, toCsv, toMd, sortRows, build, armourOf };
