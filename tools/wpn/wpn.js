#!/usr/bin/env node
// wpn: GoH weapon -> AS2 weapon table, answer sheet, translated import (WPN-1, stage 0, no game).
//   node tools/wpn/wpn.js build [--goh <GoH dir>] [--goh-mod <workshop dir>] [--as2 <AS2 dir>] [--out tools/wpn/table.json] [--sheet] [--max N]
//   node tools/wpn/wpn.js show <goh weapon>            the row, swap target, import text
//   node tools/wpn/wpn.js answers <sheet.md> [out.json]   read the filled sheet back into an answers file
// API (goh2as2 --match-weapon, one call): decide(name, {answers, table}) -> {action:'swap'|'keep'|'import'|'none', as2, row, basis, text()}
// Rule (decisions "Weapon rule", Q7, Q49): exact in vanilla = swap; close = the user's sheet; no answer or no candidate = import the GoH weapon translated.
// Numbers: tools/xlate/table.json factors `w:<class>` via translate.predict. [I] calibre is read from the name; penetration knots a/c/e = xlate weaponFacts.
// Author: Imperator_Aug (ARSENAL, ia-d791a816)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const TABLE_PATH = path.join(__dirname, 'table.json');
const FIRE = ['gun', 'mgun', 'smg', 'rifle', 'pistol', 'special', 'reactive', 'flame', 'bazooka', 'mortar', 'melee'];   // `head` (690 GoH entries) is not a firing weapon: left out
const TOL = { pen: 0.10, range: 0.25, recharge: 0.30, nearPen: 0.40, nearRange: 0.50, nearRech: 0.60 };

const lc = s => String(s).toLowerCase();
const calOf = n => { const m = /(\d+)\s*mm/i.exec(n) || /mortar(\d+)/i.exec(n) || /^(\d+)cm_/i.exec(n); return m ? (/cm_/i.test(m[0]) ? +m[1] * 10 : +m[1]) : 0; };
const rel = (a, b) => (a == null || b == null) ? null : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);

// ---------- reading ----------
function sideOf(dir, mod) {
  const pd = require('../pairdiff/pairdiff.js'), base = pd.collect(dir);
  if (!mod) return base;
  const m = pd.collect(mod), map = new Map(base.map); for (const [k, v] of m.map) { v.__mod = true; map.set(k, v); }
  return { map, base };
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : require('../lib/pakset').read(e);
const stuffName = k => { const p = k.split('/'); return p[0] === 'set' && p[1] === 'stuff' && p.length === 4 && (!p[3].includes('.') || p[3].endsWith('.weapon')) ? { dir: p[2], name: lc(p[3].replace(/\.weapon$/, '')) } : null; };

// every stuff entry name -> key (any class dir), for `from` chains
// `pattern <cls>` entries (set/stuff/<cls>/<cls>.pattern) are indexed as "pattern <cls>": the rifle/gun defaults (reload, recovery, range) live there
function stuffIndex(side) {
  const m = new Map();
  for (const k of side.map.keys()) {
    const p = k.split('/'); if (p[0] !== 'set' || p[1] !== 'stuff' || p.length !== 4) continue;
    if (p[3].endsWith('.pattern')) { m.set('pattern ' + lc(p[3].slice(0, -8)), k); continue; }
    const s = stuffName(k); if (s) m.set(s.name, k);
  }
  return m;
}

// facts of one weapon, following {from "<other stuff>"} (the child's own numbers win); ammo = first {filling "ammo X"} / "bulletN" on the chain
function factsOf(side, game, sidx, key) {
  const X = require('../xlate/xlate.js'), out = { chain: [] };
  for (let k = key, i = 0; k && i < 8; i++) {
    out.chain.push(k);
    let r = null; try { r = X.extract(side, game, { key: k, stem: k.split('/').pop(), cls: 'w:x', scope: 'weapon' }, game); } catch { /* none */ }
    for (const n of ['pen_a', 'pen_c', 'pen_e', 'recharge', 'range', 'damage']) if (out[n] === undefined && r && r.k[n] !== undefined) out[n] = r.k[n];
    let txt = ''; try { txt = readEnt(side.map.get(k)).toString('latin1'); } catch { /* */ }
    if (out.ammo === undefined) { const f = /\{\s*filling\s+"(?:ammo\s+)?([^"\s]+)/i.exec(txt); if (f) out.ammo = lc(f[1]); }
    // SILENT-1F: no {foresight} anywhere on the chain = no aim bone from the weapon. howitzer = a range_*howitzer macro on the chain
    if (/\{\s*foresight\b/i.test(txt)) out.foresight = true;
    if (/\(\s*"range_\w*howitzer/i.test(txt)) out.howitzer = true;
    const fr = /\{\s*from\s+"([^"]+)"/i.exec(txt);
    if (out.range === undefined) { const rg = /\{\s*range\s+(\d+(?:\.\d+)?)/i.exec(txt); if (rg) out.range = +rg[1]; }
    if (out.recharge === undefined) { const rc = /\{\s*rechargeTime\s+(\d+(?:\.\d+)?)/i.exec(txt); if (rc) out.recharge = +rc[1]; }
    if (out.recovery === undefined) { const rv = /\{\s*recoveryTime\s+(\d+(?:\.\d+)?)/i.exec(txt); if (rv) out.recovery = +rv[1]; }
    k = fr ? sidx.get(lc(fr[1].replace(/^weapon\s+/i, ''))) : null;
  }
  return out;
}

function weapons(side, game) {
  const sidx = stuffIndex(side), out = [];
  for (const [name, key] of sidx) {
    const dir = key.split('/')[2]; if (!FIRE.includes(dir) || name.startsWith('pattern ')) continue;
    const f = factsOf(side, game, sidx, key);
    // a flat table (a = c = e) is an HE round's damage, not armour penetration: compared as "no penetration", and not written as a damage table on import [I]
    const flat = f.pen_a != null && f.pen_a === f.pen_c && f.pen_c === f.pen_e;
    out.push({ name, cls: dir, key, cal: calOf(name), pen_a: f.pen_a, pen_c: f.pen_c, pen_e: f.pen_e, flat, range: f.range, recharge: f.recharge, recovery: f.recovery, ammo: f.ammo, foresight: !!f.foresight, howitzer: !!f.howitzer, mod: !!side.map.get(key).__mod });
  }
  return out;
}

// vehicle defs that name each weapon (valour units first): rough usage, for ranking the sheet
function usage(side) {
  const use = new Map(), WRE = /\{\s*weapon\s+"([^"\r\n]+)"|"weapon\s+([^"\r\n]+)"/gi;
  for (const [k, e] of side.map) {
    if (!k.startsWith('entity/-vehicle/') || !/\.(def|ext|inc)$/.test(k)) continue;
    let t; try { t = readEnt(e).toString('latin1'); } catch { continue; }
    const unit = k.split('/').slice(0, -1).join('/');
    for (const m of t.matchAll(WRE)) { const n = lc((m[1] || m[2]).replace(/^weapon\s+/i, '').trim()), u = use.get(n) || { units: new Set(), mod: new Set() }; u.units.add(unit); if (e.__mod) u.mod.add(unit); use.set(n, u); }
  }
  return use;
}

// ---------- the rule ----------
const pn = (w, k) => w.flat ? null : w[k];
const diffs = (g, a) => ({ pen_a: rel(pn(g, 'pen_a'), pn(a, 'pen_a')), pen_c: rel(pn(g, 'pen_c'), pn(a, 'pen_c')), pen_e: rel(pn(g, 'pen_e'), pn(a, 'pen_e')), range: rel(g.range, a.range), recharge: rel(g.recharge, a.recharge) });
const worst = (d, ks) => Math.max(0, ...ks.map(k => d[k]).filter(x => x !== null));
const score = d => ['pen_a', 'pen_c', 'pen_e', 'range', 'recharge'].reduce((s, k) => s + (d[k] === null ? 0.1 : d[k]), 0);
const fmt = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === null ? null : +v.toFixed(2)]));

function classify(g, as2all) {
  const cands = as2all.filter(a => a.cls === g.cls), small = !g.cal && !['gun', 'mortar'].includes(g.cls);
  const same = cands.find(a => a.name === g.name);
  const PEN = ['pen_a', 'pen_c', 'pen_e'];
  // [I] penetration is the tight number (sheet Q53); range differs between the games by design (xlate range rule copy x0.93) so it only gates a swap loosely.
  // A one-sided penetration (HE gun on one side, AP table on the other) is never a match.
  const penOK = (g1, a1, d, lim) => (pn(g1, 'pen_c') == null) !== (pn(a1, 'pen_c') == null) ? false : worst(d, PEN) <= lim;
  const settled = (a1, d) => penOK(g, a1, d, TOL.pen) && (d.range === null || d.range <= TOL.range * 2) && (d.recharge === null || d.recharge <= TOL.recharge);
  const row = { verdict: 'import', as2: null, basis: 'no candidate', cand: [] };
  const tol = Math.max(3, Math.round(g.cal * 0.1));
  // small arms carry no calibre in the name: a peer must shoot the same ammo base
  const pool = cands.filter(a => g.cal ? (a.cal && Math.abs(a.cal - g.cal) <= tol) : small ? (g.ammo && a.ammo === g.ammo) : !a.cal);
  const oneSide = a => (pn(g, 'pen_c') == null) !== (pn(a, 'pen_c') == null);   // an AP/HE mismatch ranks behind every true peer
  const noSight = a => a.cls === 'gun' && a.foresight === false;   // SILENT-1F: a gun template with no foresight on its chain ranks last (37mm_hori: pz38t turned and never fired). Small arms, flame, special have none by design. undefined = not read (older rows, tests)
  const ranked = pool.map(a => ({ a, d: diffs(g, a) })).sort((x, y) => (noSight(x.a) - noSight(y.a)) || (oneSide(x.a) - oneSide(y.a)) || score(x.d) - score(y.d));
  row.cand = ranked.slice(0, 3).map(r => ({ name: r.a.name, cal: r.a.cal, d: fmt(r.d) }));
  if (same) {
    const d = diffs(g, same);
    // a machine gun / rifle / smg / pistol of the same name is the same weapon: AS2 carries no penetration table for them, so a one-sided table is no disagreement [I]
    if (['mgun', 'rifle', 'smg', 'pistol', 'melee', 'flame'].includes(g.cls) && (d.recharge === null || d.recharge <= 0.6)) return Object.assign(row, { verdict: 'swap', as2: same.name, basis: 'same name, small arm', cand: [{ name: same.name, cal: same.cal, d: fmt(d) }] });
    if (penOK(g, same, d, 0.25) && (d.recharge === null || d.recharge <= TOL.recharge * 1.5)) return Object.assign(row, { verdict: 'swap', as2: same.name, basis: 'same name, numbers agree', cand: [{ name: same.name, cal: same.cal, d: fmt(d) }] });
    return Object.assign(row, { verdict: 'ask', as2: same.name, basis: 'same name, numbers differ', cand: [{ name: same.name, cal: same.cal, d: fmt(d) }].concat(row.cand.filter(c => c.name !== same.name)).slice(0, 3) });
  }
  // SILENT-1F: a gun under 90 mm with no penetration numbers does not take a howitzer template when a flat gun of near calibre exists. a10 on 75mm_m2: shells never reached the t-34; on 76mm_f34: kill at 139 [V game, one gun]. 90 mm and up (real howitzers, 114mm_uk-bl) stay: no game says otherwise. No flat gun near: the howitzer stays. A row the data settles as a swap is left alone. FLAT_TESTED: the template the game saw goes first
  const FLAT_TESTED = ['76mm_f34'], tested = a => FLAT_TESTED.includes(a.name) ? 0 : 1;
  const flat = () => {
    if (g.cls !== 'gun' || !g.cal || g.cal >= 90 || pn(g, 'pen_c') != null) return null;
    const f = pool.filter(a => a.howitzer === false && !noSight(a)).map(a => ({ a, d: diffs(g, a) })).sort((x, y) => (tested(x.a) - tested(y.a)) || (Math.abs(x.a.cal - g.cal) - Math.abs(y.a.cal - g.cal)) || (score(x.d) - score(y.d)));
    return f.length ? f[0].a.name : null;
  };
  const b = ranked[0];
  if (b) {
    if (g.cal && b.a.cal === g.cal && settled(b.a, b.d)) return Object.assign(row, { verdict: 'swap', as2: b.a.name, basis: 'data: same calibre, numbers agree' });
    const near = penOK(g, b.a, b.d, TOL.nearPen - 0.15) && (b.d.recharge === null || b.d.recharge <= TOL.nearRech);
    if (near && (g.cal || (b.d.recharge !== null && b.d.recharge <= TOL.recharge))) {
      Object.assign(row, { verdict: 'ask', as2: b.a.name, basis: g.cal ? 'near calibre, numbers differ' : 'same ammo base, numbers differ' });
      if (b.a.howitzer && flat()) row.tmpl = flat();   // unanswered ask imports on tmpl, else on as2: an answer can still pick the howitzer
      return row;
    }
  }
  // template for an import: nearest calibre in the class (then nearest numbers), else the nearest numbers; ammo and sounds come from it [I]
  const wantPen = pn(g, 'pen_c') != null;   // an AP gun needs a template that has a penetration table, an HE gun one that has none
  const all = cands.map(a => ({ a, d: diffs(g, a) })).sort((x, y) => (noSight(x.a) - noSight(y.a)) || ((pn(x.a, 'pen_c') != null) !== wantPen) -((pn(y.a, 'pen_c') != null) !== wantPen) || (Math.abs((x.a.cal || 0) - g.cal) - Math.abs((y.a.cal || 0) - g.cal)) || (score(x.d) - score(y.d)));
  row.tmpl = all.length ? all[0].a.name : null;
  if (all.length && all[0].a.howitzer && flat()) row.tmpl = flat();
  // a hand weapon without calibre takes the class's plain bolt/standard item as template (de_lisle, the nearest rifle by numbers, is automatic) [I]
  const PREF = { rifle: 'mauzer' }; if (!g.cal && PREF[g.cls] && cands.some(a => a.name === PREF[g.cls])) row.tmpl = PREF[g.cls];
  return row;
}

function translatedNumbers(g, T, TR) {
  const f = (T.factors || {})['w:' + g.cls] || {}, out = {};
  for (const k of ['pen_a', 'pen_c', 'pen_e', 'range', 'recharge']) if (g[k] != null) {
    const rule = f[k], has = rule && rule.mode && rule.mode !== 'none';
    let v = has ? TR.predict(rule, g[k]) : g[k];
    // range is kept inside the AS2 class's own p95 (the engine and the AI were only seen on native ranges) [I]; penetration is tight and never clamped
    if (k === 'range' && rule && rule.as2_p95 && v > rule.as2_p95) { out.range_goh = v; v = rule.as2_p95; }
    out[k] = +v.toFixed(2); out['mode_' + k] = has ? rule.mode : 'copy (no rule)';
  }
  if (g.recovery != null) out.recovery = g.recovery;   // bolt/cycle time, no rule in the table: copied
  if (g.flat) out.flat = true;
  return out;
}

function build(o) {
  const TR = require('../goh2as2/translate.js'), T = TR.loadTable();
  const gs = sideOf(o.goh, o.gohMod), as = sideOf(o.as2);
  const gw = weapons(gs, 'goh'), aw = weapons(as, 'as2'), use = usage(gs);
  const rows = {};
  for (const g of gw) {
    const r = classify(g, aw), u = use.get(g.name);
    const tr = translatedNumbers(g, T, TR);
    rows[g.name] = Object.assign({ cls: g.cls, cal: g.cal, goh: { key: g.key, mod: g.mod, pen_a: g.pen_a, pen_c: g.pen_c, pen_e: g.pen_e, flat: g.flat, range: g.range, recharge: g.recharge, recovery: g.recovery, ammo: g.ammo }, vehicles: u ? u.units.size : 0, modVehicles: u ? u.mod.size : 0 }, r, { imp: tr });
  }
  const as2 = Object.fromEntries(aw.map(a => [a.name, { cls: a.cls, key: a.key, cal: a.cal, pen_a: a.pen_a, pen_c: a.pen_c, pen_e: a.pen_e, flat: a.flat, range: a.range, recharge: a.recharge, ammo: a.ammo, foresight: a.foresight, howitzer: a.howitzer }]));
  const count = {}; for (const r of Object.values(rows)) count[r.verdict] = (count[r.verdict] || 0) + 1;
  return { meta: { tol: TOL, classes: FIRE, count, goh: gw.length, as2: aw.length, note: 'verdict swap = data settles; ask = on the sheet, unanswered imports (Q7); import = GoH weapon written translated (Q49). All [I] until a game stage.' }, rows, as2 };
}

// ---------- sheet ----------
function sheet(tab, max) {
  const asks = Object.entries(tab.rows).filter(([, r]) => r.verdict === 'ask').sort((a, b) => (b[1].modVehicles - a[1].modVehicles) || (b[1].vehicles - a[1].vehicles) || (a[0] < b[0] ? -1 : 1));
  const n = (v, d = 0) => v == null ? '-' : String(+(+v).toFixed(d));
  const pens = w => w.flat ? 'HE ' + n(w.pen_a) : `${n(w.pen_a)}/${n(w.pen_c)}/${n(w.pen_e)}`;
  const L = ['# WPN-1 answer sheet: which AS2 weapon stands in for these GoH weapons', '',
    'Fill the **Answer** column for each row: the AS2 weapon name (the candidate or another), or `import` to bring the GoH weapon over translated. Blank = `import` (the default, Q7).',
    `${asks.length} rows could not be settled by data; the ${Math.min(max, asks.length)} most used by GoH vehicles are shown (valour units first). Rows already settled by data are swapped without asking (${tab.meta.count.swap || 0}); ${tab.meta.count.import || 0} have no AS2 peer and import.`,
    'Pen = penetration mm at the first/middle/last knot (a/c/e). Range in metres. Rch = reload seconds. Numbers are GoH -> AS2 candidate.', '',
    '| # | GoH weapon | class | used by | pen a/c/e GoH | range | rch | candidate (AS2) | pen a/c/e AS2 | range | rch | why | Answer |', '|--|--|--|--|--|--|--|--|--|--|--|--|--|'];
  asks.slice(0, max).forEach(([name, r], i) => {
    const c = tab.as2[r.as2] || {};
    L.push(`| ${i + 1} | ${name} | ${r.cls} | ${r.vehicles}${r.modVehicles ? ' (' + r.modVehicles + ' valour)' : ''} | ${pens(r.goh)} | ${n(r.goh.range)} | ${n(r.goh.recharge, 1)} | ${r.as2} | ${pens(c)} | ${n(c.range)} | ${n(c.recharge, 1)} | ${r.basis} | |`);
  });
  if (asks.length > max) L.push('', `${asks.length - max} further rows (little used) are not shown and import by default; \`node tools/wpn/wpn.js build --max 999\` prints them all.`);
  L.push('', 'Read back with `node tools/wpn/wpn.js answers <this file> answers.json`; goh2as2 takes it through `--wpn-answers`.');
  return L.join('\n') + '\n';
}
function readSheet(text) {
  const out = {};
  for (const l of text.split(/\r?\n/)) { const c = l.split('|').map(s => s.trim()); if (c.length < 14 || !/^\d+$/.test(c[1])) continue; const a = lc(c[13].replace(/`/g, '')); if (a) out[lc(c[2])] = a; }
  return out;
}

// ---------- goh2as2 call ----------
let TAB = null;
const loadTable = p => TAB || (TAB = JSON.parse(fs.readFileSync(p || TABLE_PATH, 'utf8')));
function importText(name, row, tab, extra) {
  const t = row.tmpl || row.as2, n = row.imp || {};   // an unanswered ask row has no tmpl: its candidate is the nearest peer
  if (!t) return null;
  const L = [`; goh2as2 WPN-1 [T]: GoH weapon ${name} imported translated (tools/xlate/table.json w:${row.cls}); template ${t} gives ammo, sounds, accuracy; numbers below are the GoH ones through the table`, `{from "${t}"`];
  if (extra && extra.entity) L.push(`\t{entity "${extra.entity}"}`);
  // SILENT-1F: a template with no foresight on its chain leaves the gun with no aim bone: pattern gun's bone, lower case as the rep mdls name it [T for mdls without it]
  if (row.cls === 'gun' && tab && tab.as2 && tab.as2[t] && tab.as2[t].foresight === false) L.push('\t{foresight "foresight1"}');
  if (n.recharge != null) L.push(`\t{rechargeTime ${n.recharge}}`);
  if (n.recovery != null && row.cls !== 'gun') L.push(`\t{recoveryTime ${n.recovery}}`);
  if (n.range != null) L.push(`\t{range ${Math.round(n.range)} ${Math.round(n.range)}}`);
  if (['gun'].includes(row.cls) && !n.flat && n.pen_a != null && n.pen_c != null && n.pen_e != null) L.push(`\t("damage" a(${n.pen_a}) b(${+((n.pen_a + n.pen_c) / 2).toFixed(1)}) c(${n.pen_c}) d(${+((n.pen_c + n.pen_e) / 2).toFixed(1)}) e(${n.pen_e}))`);
  L.push('}');
  return L.join('\n') + '\n';
}
// decide(name, {answers, table}) -> what goh2as2 does with the rep weapon `name`
//   swap: use vanilla `as2` (data or the user's answer); keep: donor already shoots it; import: write `text()` as set/stuff/<cls>/<name>.weapon; none: not in the table (old nearest-calibre rule stays)
function decide(name, opt = {}) {
  const tab = opt.table || loadTable(), key = lc(String(name).replace(/^weapon\s+/i, '')), row = tab.rows[key];
  if (!row) return { action: 'none' };
  let verdict = row.verdict, as2 = row.as2, basis = row.basis;
  if (verdict === 'ask') {
    const a = opt.answers && opt.answers[key];
    if (a && a !== 'import' && tab.as2[a]) { verdict = 'swap'; as2 = a; basis = 'sheet answer'; }
    else { verdict = 'import'; as2 = null; basis = a === 'import' ? 'sheet answer: import' : 'unanswered, default import (Q7)'; }
  }
  const res = { action: verdict, as2, row, basis, cls: row.cls };
  if (opt.donorWeapon && verdict === 'swap' && lc(opt.donorWeapon) === as2) res.action = 'keep';
  if (verdict === 'import') { res.text = extra => importText(key, row, tab, extra); }   // extra.entity: the inventory entity of a hand weapon (inf route)
  return res;
}

module.exports = { decide, loadTable, build, sheet, readSheet, importText, classify, calOf, FIRE, TOL };

if (require.main === module) {
  const a = process.argv.slice(2), cmd = a[0], arg = n => { const i = a.indexOf(n); return i < 0 ? null : a[i + 1]; };
  if (cmd === 'build') {
    // defaults: the installs through lib/games (gamedir), the GoH Valour workshop item next to the GoH install's Steam library (when it is there)
    const games = require('../lib/games'), goh = arg('--goh') || games.install('goh').dir, as2 = arg('--as2') || games.install('as64').dir;
    const ws = goh && path.join(goh, '..', '..', 'workshop', 'content', '400750', '2537987794');
    const o = { goh, gohMod: arg('--goh-mod') || (ws && fs.existsSync(ws) ? ws : null), as2 };
    if (!o.goh || !o.as2) { console.error('wpn build: no ' + (!o.goh ? 'GoH' : 'AS2') + ' install found (give --goh / --as2)'); process.exit(2); }
    const tab = build(o);
    fs.writeFileSync(arg('--out') || TABLE_PATH, JSON.stringify(tab, null, 1));
    const sp = arg('--sheet'); if (sp) fs.writeFileSync(sp, sheet(tab, +(arg('--max') || 40)));
    console.log(JSON.stringify(tab.meta));
  } else if (cmd === 'show') {
    const d = decide(a[1] || '', { answers: {} }); console.log(JSON.stringify(Object.assign({}, d, { text: d.text ? d.text() : undefined }), null, 1));
  } else if (cmd === 'answers') {
    const r = readSheet(fs.readFileSync(a[1], 'utf8')); if (a[2]) fs.writeFileSync(a[2], JSON.stringify(r, null, 1)); console.log(JSON.stringify(r));
  } else { console.error('usage: wpn.js build|show <name>|answers <sheet> [out]'); process.exit(2); }
}
