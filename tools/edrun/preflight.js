// Author: Imperator_Aug (ARSENAL, ia-52091f2d)
// edrun preflight (EDRUN-2): checks on a pair before it runs. no game, reads only.
//   range  : distance shooter-foe against the shooter's main weapon range, read from its def (entity -> first "weapon" ref -> set/stuff file, {range aim max} m)
//   mindist: distance against the smallest distance at which the gun can point at the foe (mindist.js: gun reach, pitch limits, foresight placement) (MINDIST-1)
//   line   : the shooter-foe segment against the other pairs' placements and the base map's known objects
//   isolate: a pair with "isolate": true keeps clear of every other placement
// status names (report.json pairs[].status, verdict is set to it when the pair is held back):
//   OUTOFRANGE  dist is beyond the weapon's max range (beyond the aim range only warns: damage falls off, aim is poor)
//   TOOCLOSE    dist is under the smallest usable distance (pairs[].preflight.min); "noMinCheck": true skips it. A pair with no dist also gets the minimum as a warning
//   BLOCKED     another pair's unit or a known map object stands on the line
//   CROWDED     an isolate pair has another placement inside ISOLATE_CLEAR
// where the data is unknown (no def found, no range key, a human shooter, a model with no pitch limits) the result is a warning, never a silent pass or a refusal.
// KILLPROOF (rev-harness 13): placements and dist are map units (20 per m, UNITS_PER_M); these were labelled m but compared with units.
const LINE_CLEAR_U = 40;      // map units (2 m): a unit or object closer than this to the line blocks it: hull half-width ~1.5 m + margin [I] (was 12 = 0.6 m, under half a hull)
const ISOLATE_CLEAR_U = 300;  // map units (15 m): nothing else this close to an isolate shooter or foe [I; mortar splash and spotting, sheet Q8]. value kept, label fixed (was "300 m")
const OVERSHOOT_U = 2000;     // map units (100 m): the line of fire runs on past the foe this far; a placement near it is warned (a miss lands there) [I]
const LINE_CLEAR = LINE_CLEAR_U, ISOLATE_CLEAR = ISOLATE_CLEAR_U;   // old names, same values
const UNITS_PER_M = 20;     // g_unitsPerMeter: weapon {range} is metres, pair dist is units
const MARGINAL = 1.25;      // dist under min x this warns "marginal" (EDRUN-3 1.15; SILENT-1F 1.25: tiger_p vs t34_0, min 182.3, barely fires at 210 = 1.15, fires at 230 = 1.26 and up; one gun's numbers, comet and 120mm fired fine at 1.15 [I])
const HOUSE_R = 60;         // map units: a static foe blocks other pairs' lines this far from its centre (a village house is about 100 across) [I]; pair "foeRadius" overrides
const STATIC_WALL_H = 120, STATIC_FACE_GAP = 5;   // FIX-EDRUN: map units; edrun aims a static at half this height, this far outside its radius (same values as edrun.js staticAimOf) [I]
const MAP_OBJECTS = [];     // the base test map holds no blocking props: only map_points (inert); named here so a map with props can list them

// shortest distance from point q to segment a-b
function distSeg(q, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

// first {range aim max} number list below a stuff tree's blocks; null when the file sets none (inherited from a pattern: unknown here)
function rangeIn(ix, tree) {
  const lc = s => String(s || '').toLowerCase();
  // macros are expanded in the tree: a pattern's default range comes first, the file's own ("range_220" = {range 220 220}) later, so the LAST one wins (statsheet takes the last too)
  let last = null, aim = null, max = null, aimFile = null;
  const num = c => ix.argsOf(c).filter(t => t.k === 'INTEGER' || t.k === 'FLOAT').map(t => t.value);
  const walk = (b, depth) => {
    for (const c of ix.kids(b)) {
      const n = lc(ix.nameOf(c));
      if (n === 'range') { const v = num(c); if (v.length) { last = v; last.file = c.file; } }
      // mortar and rocket weapons (set/stuff/reactive/werfer42.weapon) write {aimRange N} {maxRange N} instead of {range a b}
      else if (n === 'aimrange') { const v = num(c); if (v.length) { aim = v[0]; aimFile = c.file; } }
      else if (n === 'maxrange') { const v = num(c); if (v.length) { max = v[0]; aimFile = aimFile || c.file; } }
      else if (depth < 3 && n !== 'parameters') walk(c, depth + 1);
    }
  };
  for (const root of tree.items.filter(i => i.k === 'BLOCK')) walk(root, 0);
  if (!last && (aim !== null || max !== null)) { last = [aim !== null ? aim : max, max !== null ? max : aim]; last.file = aimFile; }
  return last;
}

// the base name of a stuff file's {from "base"} block (top level or one level down), null when none
function fromOf(ix, tree) {
  for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
    for (const b of [root, ...ix.kids(root)]) {
      if (String(ix.nameOf(b) || '').toLowerCase() !== 'from') continue;
      const a = ix.argsOf(b).find(t => t.k === 'STRING' || t.k === 'IDENT' || typeof t.value === 'string');
      if (a) return String(a.value).replace(/^"|"$/g, '');
    }
  }
  return null;
}

// TEST-2: the range of a weapon text by regex, for the mod-folder fallback (no parsed tree). the LAST {range a b} wins, like rangeIn; a bare macro {range_220} reads 220 220 [I]
function rangeFromText(text) {
  let best = null;
  for (const m of String(text || '').matchAll(/\{\s*range\s+([\d.]+)(?:\s+([\d.]+))?|\brange_(\d+)\b/gi)) {
    best = m[3] !== undefined ? [+m[3], +m[3]] : [+m[1], m[2] !== undefined ? +m[2] : +m[1]];
  }
  return best;
}
// first {weapon "name"} ref of an entity text, null when none [I: the entity syntax is assumed from the index's own "weapon" refs]
function weaponRefOf(text) {
  const m = /\{\s*weapon\s+"?([\w.\-]+)"?/i.exec(String(text || ''));
  return m ? m[1] : null;
}

// SPEED-B3: static unit faults of an entity def text (preflight HOLD). o: {refs, readModel(name) -> text|null, weaponChain(name) -> [texts, own file first]}
//   NOWEAPON  Weaponry holds no gun (only searchlight/none) and the def has no crew item {user "..."} (m20/m20_fr carry the browning as {user "mgun"}: not a fault)
//   NOBONE {Barrels n>1} and the model lacks shooter00..shooter<n-1> (PORT-135: the engine takes "shooter%02d", )
//   AMMO      a Weaponry filling's calibre ("bullet57" of "ammo bullet57 ap") differs from the weapon's own {filling} ({from} chain followed)
// -> {faults: [{code, text}], notes: [text]}. no Weaponry block (infantry, includes only): nothing checked
const NOT_GUN = /^(searchlight|none|binocular|flashlight|light)$/i;
function blockAt(t, i) {   // text of the {...} block whose "{" is at i
  let d = 0;
  for (let j = i; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) return t.slice(i, j + 1); }
  return t.slice(i);
}
const calOf = s => String(s || '').trim().toLowerCase().split(/\s+/).filter(w => w !== 'ammo')[0] || '';
function faultsIn(text, o = {}) {
  const t = String(text || '').replace(/;[^\n]*/g, ''), faults = [], notes = [];
  const wi = t.search(/\{\s*Weaponry\b/i);
  if (wi < 0) return { faults, notes: ['no Weaponry block in the def text: not checked'] };
  const wb = blockAt(t, wi);
  const ws = [...wb.matchAll(/\{\s*weapon\s+"([^"]+)"([^{}]*)/gi)].map(m => ({ name: m[1], tail: m[2] }));
  const refW = (o.refs || []).filter(f => f[0] === 'weapon').map(f => f[1]);
  const guns = [...ws.map(w => w.name), ...refW].filter(n => !NOT_GUN.test(n));
  if (!guns.length) {
    const user = /\{\s*user\s+"[^"]+"\s*\}/i.exec(t);
    if (user) notes.push('Weaponry has no gun, the crew carries it (' + user[0] + ')');
    else faults.push({ code: 'NOWEAPON', text: 'no weapon in Weaponry' + (ws.length ? ' (only ' + [...new Set(ws.map(w => w.name))].join(', ') + ')' : '') + ' and no crew item {user ..}' });
  }
  const bar = [...wb.matchAll(/\{\s*Barrels\s+(\d+)\s*\}/gi)].map(m => +m[1]).filter(n => n > 1);
  if (bar.length) {
    const n = Math.max(...bar), ext = /\{\s*Extension\s+"([^"]+\.mdl)"/i.exec(t), mref = (o.refs || []).find(f => f[0] === 'model');
    const mdl = ext ? ext[1] : mref && mref[1];
    const mt = mdl && o.readModel ? o.readModel(mdl) : null;
    if (!mt) notes.push(`{Barrels ${n}}: model ${mdl || '?'} not read, bones not checked`);
    else {
      const miss = [];
      for (let i = 0; i < n; i++) { const b = 'shooter' + String(i).padStart(2, '0'); if (!new RegExp('"' + b + '"', 'i').test(mt)) miss.push(b); }
      if (miss.length) faults.push({ code: 'NOBONE', text: `{Barrels ${n}} but ${mdl} has no bone ${miss.join(', ')} (PORT-135)` });
    }
  }
  for (const w of ws) {
    const f = /\bfilling\s+"([^"]+)"/i.exec(w.tail);
    if (!f || !o.weaponChain) continue;
    let own = null;
    for (const wt of o.weaponChain(w.name) || []) { const m = /\{\s*filling\s+"([^"]+)"/i.exec(String(wt).replace(/;[^\n]*/g, '')); if (m) { own = m[1]; break; } }
    if (!own) { notes.push(`${w.name}: own {filling} not read, ammo "${f[1]}" not checked`); continue; }
    if (calOf(own) !== calOf(f[1])) faults.push({ code: 'AMMO', text: `${w.name} loads "${f[1]}" but fires "${own}"` });
  }
  return { faults, notes };
}

// the mod folders named in --mods (G/mods/<name>), loose files and paks (tools/lib/pakset). scan(kind, name) -> text | null; kind 'weapon' | 'entity'.
// a later mod wins. used only when the index lacks the def or the weapon (a mod that did not mount, or a name outside set/stuff/gun) [I]
function makeModScan(game, mods) {
  const fs = require('fs'), path = require('path'), pakset = require('../lib/pakset'), cipath = require('../lib/cipath');
  // mods/<name>/resource ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join
  const ciJoin = rel => cipath.resolve(game, rel, { cache: new Map() }) || path.join(game, rel);
  const folders = (mods || []).map(m => String(m).split(':')[0]).filter(m => m && fs.existsSync(ciJoin('mods/' + m + '/resource'))).reverse();
  const cache = {};
  const baseOf = k => { const b = k.slice(k.lastIndexOf('/') + 1); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };
  const walk = (dir, rel, out) => {
    let ds; try { ds = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of ds) {
      if (d.isDirectory()) walk(path.join(dir, d.name), rel + d.name.toLowerCase() + '/', out);
      else if (!/\.pak$/i.test(d.name)) out.push({ key: rel + d.name.toLowerCase(), file: path.join(dir, d.name) });
    }
  };
  const indexOf = folder => {
    if (cache[folder]) return cache[folder];
    const root = ciJoin('mods/' + folder + '/resource'), ents = [];
    walk(root, 'resource/', ents);
    const ps = pakset.open(root, {});
    for (const e of ps.entries) ents.push({ key: 'resource/' + e.key, ent: e });
    return (cache[folder] = { ents, ps });
  };
  const scan = (kind, name) => {
    const want = String(name).toLowerCase();
    for (const f of folders) {
      const ix = indexOf(f);
      for (const e of ix.ents) {
        if (baseOf(e.key) !== want) continue;
        if (kind === 'weapon' ? !/\/set\/stuff\//.test(e.key) : !/\/entity\//.test(e.key)) continue;
        try { return (e.file ? fs.readFileSync(e.file) : pakset.read(e.ent)).toString('latin1'); } catch (err) { /* next */ }
      }
    }
    return null;
  };
  scan.folders = folders;
  scan.close = () => { for (const f of Object.keys(cache)) cache[f].ps.close(); };
  return scan;
}

// -> rangeOf(defName) = {weapon, aim, max, via} | {unknown: 'why'}. builds the entity index once (about 8 s), shared with mindist.js (rangeOf.minOf)
// inj {built, scan}: tests inject the index and the folder scan; inj.exe: the vfs exe of the index (game parity: mowas_2 for MoW:AS2; none = as before)
function makeRangeReader(game, mods, inj = {}) {
  const ix = inj.ix || (inj.built ? null : require('../entityindex/index.js'));   // inj.ix: a fake tree reader for seeded tests
  const md = inj.built ? null : require('./mindist.js');
  let built = inj.built || null, builtErr = null, scanFn = inj.scan || null;
  const stuffByName = {};
  const scanner = () => scanFn || (scanFn = makeModScan(game, mods));
  const fromText = (weapon, text, via) => {
    const v = rangeFromText(text);
    if (v) return { weapon, aim: v[0], max: v[1], via };
    const m = /\{\s*from\s+"([^"]+)"/i.exec(String(text || '')), s = m && stuffByName[m[1].toLowerCase()];
    if (s) return viaIndex(weapon, s, via + ', {from} ' + m[1] + ' in the index');
    return { unknown: `weapon ${weapon} sets no {range} in the mod folder text`, weapon };
  };
  // range of an indexed gun file, following {from} links
  const viaIndex = (weapon, s, via) => {
    let tree = null, v = null, cur = s, chain = [weapon];
    // COV-MIX3: a gun file with no {range} of its own inherits it through {from "base"} (75mm_stuk42 -> 75mm_kwk42); follow up to 4 links
    for (let hop = 0; hop < 5 && cur; hop++) {
      try { const p = ix.parseKey(built.src, cur.key); tree = p && p.tree; } catch (e) { return { unknown: 'weapon file unreadable' }; }
      v = tree && rangeIn(ix, tree);
      if (v) break;
      const base = tree && fromOf(ix, tree);
      cur = base && stuffByName[base.toLowerCase()];
      if (cur) chain.push(base);
    }
    const ch = chain.length > 1 ? ` (via {from} ${chain.join(' -> ')})` : '';
    if (!v) return { unknown: `weapon ${weapon} sets no {range} (pattern default)${ch}`, weapon };
    if (ch) via += ch;
    // a range that comes from a .presets pattern is only the pattern default: the file's own ("range_NNN") macro is not expanded in the tree, so the number would be wrong [V: 88mm_kwk43 gave 140/150, file says 220]
    if (/\.presets$/.test(String(v.file || ''))) return { unknown: `weapon ${weapon} range is a pattern default or an unexpanded macro (read ${v[0]}/${v[1]} is not trusted)`, weapon };
    return { weapon, aim: v[0], max: v.length > 1 ? v[1] : null, via };
  };
  const fn = def => {
    if (!built && !builtErr) {
      try {
        built = md.getBuilt(game, mods, inj.exe);
      } catch (e) { builtErr = e; }
    }
    if (built && !built.indexed) { built.indexed = true; for (const s of Object.values(built.idx.stuff)) if (/^resource\/set\/stuff\/gun\//.test(s.key)) stuffByName[String(s.name).toLowerCase()] = s; }
    const r = built ? built.idx.byName(def) : null;
    let weapon = null, via = 'def';
    if (r && r.length) { const w = (r[0].refs || []).find(f => f[0] === 'weapon'); weapon = w && w[1]; }
    if (!weapon && stuffByName[String(def).toLowerCase()]) { weapon = def; via = 'def name = weapon name'; }
    if (!weapon && !(r && r.length)) {   // def not in the index: its entity file in a named mod folder
      const t = scanner()('entity', def);
      if (t) { weapon = weaponRefOf(t); via = 'mod folder def'; }
    }
    if (!weapon) return { unknown: (r && r.length ? 'def lists no weapon' : 'def not in the index') + (builtErr ? ' (index not built: ' + builtErr.message.split('\n')[0] + ')' : '') };
    let s = stuffByName[String(weapon).toLowerCase()];
    // a weapon ref is a stuff tag string ("weapon werfer42", mortar.inc {Weaponry {weapon ..}}): the engine finds the stuff whose file-name tokens hold every word
    // (FindStuff), under any set/stuff folder (werfer42 is in set/stuff/reactive). was read as one name: "weapon weapon werfer42 not found"
    if (!s && built && /\s/.test(String(weapon).trim()) && built.idx.stuffFind) {
      const hit = built.idx.stuffFind(weapon)[0];
      if (hit && built.idx.stuff[hit]) { s = { ...built.idx.stuff[hit], key: built.idx.stuff[hit].key || hit }; via += ', tags "' + weapon + '" -> ' + hit.replace(/^resource\//, ''); }
    }
    if (!s) {
      const t = scanner()('weapon', weapon);
      if (t) return fromText(weapon, t, 'mod folder' + (via === 'def' ? '' : ', ' + via));
      return { unknown: `weapon ${weapon} not found under set/stuff/gun, nor in the mod folders named in --mods` + (builtErr ? ' (index not built: ' + builtErr.message.split('\n')[0] + ')' : '') };
    }
    return viaIndex(weapon, s, via);
  };
  let minRead = null;
  // FIX-EDRUN item 2: pass margin and opts on (staticFoe, foeAim); the old wrapper dropped the 4th arg, so the static rule never reached the reader
  fn.minOf = (shooter, foe, margin, o) => (minRead || (minRead = md.makeMinReader(game, mods, inj.exe ? { exe: inj.exe } : {})))(shooter, foe, margin, o);
  // FIX-EDRUN item 3: is the def in the mounted stack? true (index or a named mod folder) | false | undefined (index not built: unknown)
  fn.existsOf = def => {
    if (!built && !builtErr) { try { built = md.getBuilt(game, mods, inj.exe); } catch (e) { builtErr = e; } }
    if (!built) return undefined;
    const r = built.idx.byName(def);
    if (r && r.length) return true;
    return !!scanner()('entity', def);
  };
  // SILENT-1F: the def's muzzle prop (set/interaction_entity/muzzle.inc): "muzzle_x" | null the def has no such prop | undefined def not read
  fn.muzzleOf = def => {
    if (!built && !builtErr) { try { built = md.getBuilt(game, mods, inj.exe); } catch (e) { builtErr = e; } }
    const r = built ? built.idx.byName(def) : null;
    if (r && r.length) {
      const IX = ix || require('../entityindex/index.js');
      let p;
      try { p = IX.parseKey(built.src, r[0].key); } catch (e) { return undefined; }
      if (!p || !p.tree) return undefined;
      let found = null;
      const walk = (x, dep) => { for (const c of IX.kids(x)) { if (String(IX.nameOf(c) || '').toLowerCase() === 'props') for (const t of IX.argsOf(c)) if (!found && /^muzzle_/i.test(t.value || '')) found = t.value; if (dep < 3) walk(c, dep + 1); } };
      for (const root of p.tree.items.filter(i => i.k === 'BLOCK')) walk(root, 0);
      return found;
    }
    const t = scanner()('entity', def);
    if (!t) return undefined;
    const m = /"(muzzle_\w+)"/i.exec(t);
    return m ? m[1] : null;
  };
  // SPEED-B3: static unit faults (faultsIn) + MORTARRANGE: a mortar/rocket def whose range reads unknown. -> {faults, notes} | {unknown}
  fn.faultsOf = def => {
    if (!built && !builtErr) { try { built = md.getBuilt(game, mods, inj.exe); } catch (e) { builtErr = e; } }
    const r = built ? built.idx.byName(def) : null;
    let text = null, key = null, refs = [];
    if (r && r.length) { key = r[0].key; refs = r[0].refs || []; try { const b = built.src.get(key); text = b ? b.toString('latin1') : null; } catch (e) { /* null */ } }
    if (!text) text = scanner()('entity', def);
    if (!text) return { unknown: 'def not read' };
    if (built && !built.indexed) fn('');   // fills stuffByName
    const get = k => { try { const b = built && built.src.get(k); return b ? b.toString('latin1') : null; } catch (e) { return null; } };
    const dir = key ? key.slice(0, key.lastIndexOf('/') + 1) : null;
    const weaponChain = w => {
      const out = [];
      let s = stuffByName[String(w).toLowerCase()];
      if (!s) { const t = scanner()('weapon', w); if (!t) return out; out.push(t); const m = /\{\s*from\s+"([^"]+)"/i.exec(t); s = m && stuffByName[m[1].toLowerCase()]; }
      for (let hop = 0; hop < 5 && s; hop++) {
        const t = get(s.key);
        if (!t) break;
        out.push(t);
        const m = /\{\s*from\s+"([^"]+)"/i.exec(t);
        s = m && stuffByName[m[1].toLowerCase()];
      }
      return out;
    };
    const res = faultsIn(text, { refs, readModel: n => (dir ? get(dir + String(n).toLowerCase()) : null), weaponChain });
    const props = (/\{\s*props\s+([^}]*)\}/i.exec(text.replace(/;[^\n]*/g, '')) || [])[1] || '';
    if (/"(mortar|rocket\w*|katyusha|nebelwerfer)"/i.test(props)) {
      const rg = fn(def);
      if (rg.unknown) res.faults.push({ code: 'MORTARRANGE', text: 'mortar/rocket range unreadable: ' + rg.unknown });
    }
    return res;
  };
  return fn;
}

// placements of every pair as points: [{pair, role, x, y}]. lay = edrun's layout(p, i)
function pointsOf(pairs, lay) {
  const pts = [];
  pairs.forEach((p, i) => {
    const L = lay(p, i);
    pts.push({ pair: p.name, role: 's', x: L.s.x, y: L.s.y });
    if (p.foe) pts.push({ pair: p.name, role: 'f', x: L.f.x, y: L.f.y, ...(p.static === true || p.foeClass === 'static' ? { r: p.foeRadius !== undefined ? p.foeRadius : HOUSE_R } : {}) });
  });
  return pts;
}

// -> {pairName: {status: 'OK'|'OUTOFRANGE'|'TOOCLOSE'|'BLOCKED'|'CROWDED', notes: [..], warns: [..]}}
function check(pairs, lay, opt = {}) {
  const out = {}, pts = pointsOf(pairs, lay), cache = {};
  const rangeOf = opt.rangeOf ? d => (cache[d] || (cache[d] = opt.rangeOf(d))) : null;
  const minOf = opt.minOf || (opt.rangeOf && opt.rangeOf.minOf) || null;
  const existsOf = opt.existsOf || (opt.rangeOf && opt.rangeOf.existsOf) || null;
  pairs.forEach((p, i) => {
    const r = out[p.name] = { status: 'OK', notes: [], warns: [] };
    // FIX-EDRUN item 3: a shooter or foe def that is not in the mounted stack never spawns; say so before launch (was OK, then NOSPAWN after the game)
    // infantry breeds (mp/...) are set files, not entity defs: not looked up here
    if (existsOf && !p.noExistCheck) {
      const miss = [];
      for (const [role, d] of [['shooter', p.shooter], ['foe', p.foe]]) {
        if (!d || String(d).includes('/')) continue;
        let x; try { x = existsOf(d); } catch (e) { x = undefined; }
        if (x === false) miss.push(`${role} ${d}`);
        else if (x === undefined) r.warns.push(`def ${d} not looked up (index not built)`);
      }
      if (miss.length) { r.status = miss.some(m => m.startsWith('shooter')) ? 'NOUNIT' : 'NOSPAWN'; r.notes.push(`not in the mounted stack (index + mod folders named in --mods): ${miss.join(', ')}; it would not spawn`); return; }
    }
    if (!p.foe) return;
    const L = lay(p, i), dist = Math.hypot(L.f.x - L.s.x, L.f.y - L.s.y);
    r.dist = +dist.toFixed(1);
    // range
    if (p.noRangeCheck) r.warns.push('range check switched off by the pair');
    else if (!rangeOf) r.warns.push('range not checked: no weapon reader (dry run without --check)');
    else if (p.class === 'infantry') r.warns.push(`range not checked: infantry weapon comes from the breed and its squad, not read (dist ${r.dist})`);
    else {
      const w = rangeOf(p.shooter);
      if (w.unknown) r.warns.push('range unknown: ' + w.unknown);
      else {
        r.weapon = w.weapon; r.aim = w.aim; r.max = w.max;
        // {range} is metres, dist is engine units: g_unitsPerMeter 20 (modweb keys/conv; VOL-nH: 300 units held against range 190 fired 6/6)
        const m = dist / UNITS_PER_M;
        if (w.max !== null && w.max > 0 && m > w.max) { r.status = 'OUTOFRANGE'; r.notes.push(`dist ${r.dist} (${+m.toFixed(1)} m) over max range ${w.max} m of ${w.weapon}`); }
        else if (w.aim > 0 && m > w.aim) r.warns.push(`dist ${r.dist} (${+m.toFixed(1)} m) over aim range ${w.aim} m of ${w.weapon}: poor aim, damage falls off`);
      }
    }
    // smallest usable distance (MINDIST-1): the gun must be able to point at the foe. unknown data is a warning
    // noRangeCheck releases the TOOCLOSE hold too (rows: noRangeCheck did not release it, sdkfz7_2 at 300, VOL-N150): a pair that asks for no range check runs as placed [I]
    if (p.noRangeCheck && !p.noMinCheck && minOf && !p.move && p.class !== 'infantry') r.warns.push('smallest usable dist not checked: noRangeCheck skips it too (use noMinCheck for only this)');
    if (r.status === 'OK' && minOf && !p.noMinCheck && !p.noRangeCheck && !p.move && p.class !== 'infantry') {
      let m;
      // EDRUN-3: a static foe (house) is an obstacle with a wall, not a roof to hit: the height check aims at the wall, the foe model's height is not used (COV-BLD: a house made t34's min 717)
      const stat = p.static === true || p.foeClass === 'static';
      // FIX-EDRUN item 2: edrun aims a static at its near face (foeRadius + STATIC_FACE_GAP short of the centre) at half wall height (aimZ or STATIC_WALL_H/2):
      // check that point, not the centre at man height (MB-R8: a house at 300 read min 398.1 and was held, though the face is only 235 away)
      const aimZ = stat ? (p.aimZ !== undefined ? p.aimZ : STATIC_WALL_H / 2) : undefined;
      const near = stat ? Math.max(0, dist - Math.min((p.foeRadius !== undefined ? p.foeRadius : HOUSE_R) + STATIC_FACE_GAP, dist)) : dist;
      try { m = stat ? minOf(p.shooter, p.foe, undefined, { staticFoe: true, foeAim: aimZ }) : minOf(p.shooter, p.foe); } catch (e) { m = { unknown: 'not readable: ' + e.message }; }
      if (m.unknown) r.warns.push('smallest usable dist unknown: ' + m.unknown);
      else {
        r.min = m.min;
        if (stat) r.near = +near.toFixed(1);
        const why = `${m.by}: reach ${m.reach}, ground ${m.ground}, depression ${m.D} deg, vs ${p.foe}${stat ? ` (static: near face ${r.near}, half wall height ${aimZ})` : ''}`;
        if (near < m.min) { r.status = 'TOOCLOSE'; r.notes.push(`${stat ? 'near face ' + r.near : 'dist ' + r.dist} under the smallest usable ${m.min} (${why})`); }
        else if (p.dist === undefined) r.warns.push(`smallest usable dist ${m.min} (${why}); this pair has no dist`);
        // EDRUN-3: a pz6bh pair at 200 against a floor of 191.7 killed once in eight (AIM-1); SILENT-1: tiger_p 210 vs 182.3 fired 0-3 times. close to the floor is a coin toss [I]
        if (r.status === 'OK' && near < m.min * MARGINAL) r.warns.push(`marginal: dist ${stat ? r.near : r.dist} is under min ${m.min} x ${MARGINAL} = ${+(m.min * MARGINAL).toFixed(1)}; the aim may reach only some of the time (AIM-1, pz6bh 200 vs 191.7; SILENT-1, tiger_p 210 vs 182.3) [I]`);
      }
    }
    // clear line: other pairs' units and known map objects near the segment
    if (r.status === 'OK') {
      const blockers = [];
      for (const q of pts) if (q.pair !== p.name && distSeg(q, L.s, L.f) < Math.max(LINE_CLEAR, q.r || 0)) blockers.push(`${q.pair}/${q.role}`);
      for (const m of MAP_OBJECTS) if (distSeg(m, L.s, L.f) < (m.r || LINE_CLEAR)) blockers.push('map:' + (m.name || 'object'));
      if (blockers.length) { r.status = 'BLOCKED'; r.notes.push('on the line: ' + blockers.join(', ')); }
      // MB-R9 (harness-edrun:94): with --map, opt.terrain(s, f) = mappick.lineCheck on the map's heights: terrain over the line holds the pair (BLOCKED)
      if (!blockers.length && opt.terrain) {
        let t; try { t = opt.terrain(L.s, L.f); } catch (e) { t = { unknown: 'terrain not readable: ' + e.message }; }
        if (t.block) { r.status = 'BLOCKED'; r.notes.push('on the line: ' + t.block); }
        else r.warns.push(`line: map terrain checked (${t.samples || 0} samples, top rise ${t.rise})` + (t.unknown ? '; ' + t.unknown : '') + (t.ents ? `; ${t.ents} map entities within 60 of the line (may not spawn)` : ''));
      }
      else if (!blockers.length) r.warns.push('line: no terrain data (flat base map assumed), only placements and listed objects checked');
      // KILLPROOF: a miss flies on past the foe: placements near the ray beyond it are warned, not held
      const len = Math.hypot(L.f.x - L.s.x, L.f.y - L.s.y);
      if (len > 0) {
        const far = { x: L.f.x + (L.f.x - L.s.x) / len * OVERSHOOT_U, y: L.f.y + (L.f.y - L.s.y) / len * OVERSHOOT_U }, over = [];
        for (const q of pts) if (q.pair !== p.name && distSeg(q, L.f, far) < Math.max(LINE_CLEAR_U, q.r || 0)) over.push(`${q.pair}/${q.role}`);
        if (over.length) r.warns.push(`overshoot: within ${LINE_CLEAR_U} units of the line of fire past the foe (${OVERSHOOT_U} units on): ${over.join(', ')}`);
      }
    }
    // isolate: nothing else near the shooter or the foe
    if (p.isolate && r.status === 'OK') {
      const near = [];
      for (const q of pts) if (q.pair !== p.name && (Math.hypot(q.x - L.s.x, q.y - L.s.y) < ISOLATE_CLEAR || Math.hypot(q.x - L.f.x, q.y - L.f.y) < ISOLATE_CLEAR)) near.push(`${q.pair}/${q.role}`);
      if (near.length) { r.status = 'CROWDED'; r.notes.push(`isolate: within ${ISOLATE_CLEAR_U} units of ${near.join(', ')}`); }
    }
  });
  return out;
}

module.exports = { faultsIn, calOf, STATIC_WALL_H, STATIC_FACE_GAP, UNITS_PER_M, check, makeRangeReader, makeModScan, rangeFromText, weaponRefOf, rangeIn, distSeg, pointsOf, LINE_CLEAR, ISOLATE_CLEAR, LINE_CLEAR_U, ISOLATE_CLEAR_U, OVERSHOOT_U, MARGINAL, HOUSE_R };
