#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-7e16ba26)
// statsheet: stat tables (weapon/ammo damage+penetration, armor, unit price) + data checks for GPL/DMG/KEY rows.
//   node statsheet.js <gameDir|-> [--mods a,b] [--folder dir] [--cache f] [--scope all|mod] [-q] [--summary]      checks only
//   node statsheet.js <gameDir|-> ... --sheet weapons,ammo,armor,price|all [--fmt md|csv] [-o file] [--filter regex]  tables only
//   node statsheet.js <gameDir|-> ... --units-json [-o file]   JSON catalogue of every MP card (name, army, price, armour, gun, bots; units.js)
//   --exe as64|mowas_2|mowas2|goh   the game whose file set is read (lib/games): AS64 and MoW:AS2 share one install, so name mowas_2
//     to read the MoW:AS2 view (no as64/core); goh = Gates of Hell (no gameDir given: the GoH install, games.install). No --exe: as
//     before (the vfs picks as64 when as64.exe is in the folder). The entity index keeps one cache per exe (entityindex cachePath).
//     --units-json under GoH: names from the .pot texts (GHLOC-01, GHLOC-06), no bot rows (GoH has no bot.data.lua, GHMIS-66),
//       buy price by the GoH squad rule (GHGPL-10), {charge {delay} {interval}} (GHMIS-86), doctrine/conditions (GHGPL-05)
//     --sheet under GoH: price = the GoH card columns (buy price, own cost, squad cost factor, first wait, interval, research stage,
//       doctrine, conditions); research = the dynamic campaign research tree (unit_research_<army>.set, GHCQ-16), GoH only
//       (another game: refused with exit 2); all = weapons,ammo,armor,price,research
//   --roster-insert: a file inside a Gates of Hell install (its mods/ folder too) is refused with ROSTER_VANILLA (lib/writeguard)
//   --filter is always case-insensitive (`--filter -i x` is accepted)
//   --scope mod: sheets list only mod-sourced rows. checks count only mod data (vanilla hits are info, 0 counted).
// codes (limits rows): ARMOR_VOLUME_SHADOWED (GPL-04 DMG-06 KEY-16)  PARAM_BLOCK_SHADOWED PARAM_TAG_UNKNOWN (DMG-01)
//   DMG_TABLE_UNTERMINATED (DMG-02)  BLASTWAVE_REPLACED (DMG-13)  PERK_LEVEL_UNDEFINED (GPL-13)
//   WARN_ARMOR_AREA_REPEATED (DMG-23)  WARN_ARMOR_SPLIT_FLATTENED (DMG-25)  WARN_PEN_TABLE_SHORT (GPL-03)  [mod data only]
//   info (not counted): ARMOR_THICKNESS_ARGS (3 area values = engine error) and every vanilla-data hit
// knowledge only (no static check): GPL-06 (ialint INT_FLAG_OVERFLOW) GPL-08 (keylint) GPL-09 (milint MIS_LIMITS_FORMAT)
//   GPL-11 (sdllint MACRO_UNDEFINED) GPL-15 (refcheck REF_SOUND_MISSING) DMG-15 DMG-17 (runtime interaction tags)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ix = require('../entityindex/index');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');
const { nameOf, argsOf, str0 } = ix;
const kidsOf = b => ix.kids(b);

const lc = s => String(s).toLowerCase();
const tokVal = t => t.k === 'STRING' ? t.value : (t.k === 'INTEGER' || t.k === 'FLOAT') ? t.value : t.text;
const isNum = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT');
const vals = b => b.items.filter(t => t.k !== 'BLOCK' && t.k !== 'MOD').map(tokVal);
const nums = b => argsOf(b).filter(isNum).map(t => t.value);
const kid = (b, n) => kidsOf(b).find(c => lc(nameOf(c) || '') === n);
const kidsN = (b, n) => kidsOf(b).filter(c => lc(nameOf(c) || '') === n);
const f2 = v => Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
const wild = (pat, s) => new RegExp('^' + lc(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(lc(s));

// the entity index is built with ix.buildAsync: the same index and cache file as ix.build, the loose files read ahead through the
// thread pool (entityindex/index.js header). STATSHEET_SYNC_INDEX=1 = ix.build, the reads one by one as before (for comparing)
async function loadAll(o) {
  const built = process.env.STATSHEET_SYNC_INDEX === '1' ? ix.build({ ...o }) : await ix.buildAsync({ ...o });
  const { idx, src, keys } = built;
  const treeOf = key => { try { const p = ix.parseKey(src, key); return p && p.tree; } catch (e) { return null; } };
  const modFile = f => src.local.has(f) || src.isModKey(f);
  return { idx, src, keys, treeOf, modFile };
}

// ---------- armor model ----------
function armorOf(tree) {
  const volumes = [], areas = [], errs = [], dups = [];
  for (const c of kidsOf(tree)) {
    const n = lc(nameOf(c) || '');
    if (n === 'volume') {
      const nm = str0(c), tg = kid(c, 'tags'), tags = tg ? argsOf(tg).filter(t => t.k === 'STRING').map(t => t.value).join(' ').split(/s+/).filter(Boolean) : [];
      const th = kid(c, 'thickness');
      if (!th) continue;
      const v = nums(th), s = { front: 0, rear: 0, left: 0, right: 0, top: 0, bottom: 0 };
      if (v.length) for (const k in s) s[k] = v[0];
      for (const sb of kidsOf(th)) { const sn = lc(nameOf(sb) || ''); const x = nums(sb); if (sn in s && x.length) s[sn] = x[0]; }
      volumes.push({ node: c, comp: (kid(c, 'component') && str0(kid(c, 'component'))) || '', name: nm || '', tag: tags[0] || nm || '', sides: s, line: th.line, file: th.file });
    } else if (n === 'armor') {
      const seenT = new Set();   // DMG-23: repeats inside one {armor} block only (vanilla macros re-set areas across blocks on purpose)
      for (const st of kidsN(c, 'setting')) {
        const name = str0(st) || '';
        let a = areas.find(x => x.name === name);
        if (!a) areas.push(a = { name, pats: [], t: null, ray: false, node: st });
        for (const k of kidsOf(st)) {
          const kn = lc(nameOf(k) || '');
          if (kn === 'thickness') {
            const v = nums(k);
            if (v.length && seenT.has(name) && k.line !== a.tline && !/(^|\/)properties\//i.test(String(k.file))) dups.push({ name, node: k, first: a.tline });
            if (v.length) seenT.add(name);
            if (v.length === 3) errs.push(k);
            a.t = v.length === 0 ? null : v.length === 1 ? { front: v[0], side: v[0], rear: v[0], top: v[0] }
              : v.length === 2 || v.length === 3 ? { front: v[0], side: v[1], rear: v[1], top: v[1] } : { front: v[0], side: v[1], rear: v[2], top: v[3] };
            if (v.length === 3) a.t.rear = a.t.top = v[1];
            a.tline = k.line; a.tfile = k.file;
          } else if (kn === 'volumes') a.pats = argsOf(k).filter(t => t.k === 'STRING').map(t => t.value);
          else if (kn === 'ray_cast_thickness') { const x = argsOf(k)[0]; a.ray = !!x && !/^(0|false|no|off)$/i.test(String(tokVal(x))); }
        }
      }
    }
  }
  return { volumes, areas, errs, dups };
}
const areaFor = (areas, tag) => areas.find(a => !a.pats.length || a.pats.some(p => wild(p, tag)));
const sideVal = (a, side) => side === 'front' ? a.t.front : side === 'rear' ? a.t.rear : (side === 'left' || side === 'right') ? a.t.side : a.t.top;

// ---------- checks ----------
function runChecks(L, opts) {
  const { idx, src, keys, treeOf, modFile } = L;
  const rep = createReport();
  const groups = new Map();
  const add = (file, line, code, msg, counted) => {
    const k = file + '\0' + line + '\0' + code;
    const g = groups.get(k);
    if (g) { g.n++; return; }
    groups.set(k, { file, line, code, msg, counted, n: 1 });
  };

  // armor: GPL-04 / DMG-06 / KEY-16
  for (const e of Object.values(idx.entities)) {
    if (e.source === 'vanilla' && opts.scope === 'mod') continue;
    const tree = treeOf(e.key); if (!tree) continue;
    for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
      const { volumes, areas, errs, dups } = armorOf(root);
      for (const k of errs) add(k.file, k.line, 'ARMOR_THICKNESS_ARGS', 'armor area {thickness} with 3 values is an engine error (use 1, 2 or 4)', false);
      for (const d of dups) add(d.node.file, d.node.line, 'WARN_ARMOR_AREA_REPEATED', `armor {setting "${d.name}"} already has a {thickness} (line ${d.first}): same-name areas merge and this value replaces it, the area keeps its first position; rename the area or edit the first one (DMG-23)`, e.source === 'mod' || modFile(d.node.file));
      if (!areas.length) continue;
      // DMG-25: several volumes of one component with different thicknesses, one nonzero area side overwrites them all
      for (const a of areas) {
        if (!a.t || a.ray) continue;
        const byComp = new Map();
        for (const v of volumes) if (v.comp && areaFor(areas, v.tag) === a) { if (!byComp.has(v.comp)) byComp.set(v.comp, []); byComp.get(v.comp).push(v); }
        for (const [comp, vs] of byComp) {
          if (vs.length < 2) continue;
          const sides = Object.keys(vs[0].sides).filter(sd => sideVal(a, sd) !== 0 && new Set(vs.map(v => v.sides[sd]).filter(x => x !== 0)).size > 1);
          if (vs.some(v => /(^|\/)properties\//i.test(String(v.file)))) continue;   // volumes written inside a vanilla macro: not the modder's split
          if (!(e.source === 'mod' || modFile(vs[0].file))) continue;   // vanilla hulls (m7, grant) do flatten a split on purpose: mod data only
          if (sides.length) add(vs[0].file, vs[0].line, 'WARN_ARMOR_SPLIT_FLATTENED', `armor area "${a.name}" has a nonzero ${sides.join('/')} value, so the ${vs.length} volumes of component "${comp}" (${vs.map(v => v.name).join(', ')}) all get that one value; set 0 on that side or give each plate its own area (DMG-25)`, e.source === 'mod' || modFile(vs[0].file));
        }
      }
      for (const v of volumes) {
        const a = areaFor(areas, v.tag);
        if (!a || !a.t || a.ray) continue;
        const hit = [];
        for (const sd in v.sides) if (v.sides[sd] !== 0 && sideVal(a, sd) !== 0 && sideVal(a, sd) !== v.sides[sd]) hit.push(`${sd} ${v.sides[sd]}->${sideVal(a, sd)}`);
        if (!hit.length) continue;
        add(v.file, v.line, 'ARMOR_VOLUME_SHADOWED', `volume "${v.name}" {thickness} overridden by armor area "${a.name}" (first match for tag "${v.tag}"): ${hit.join(', ')}; edit the armor area / macro args instead (GPL-04 DMG-06 KEY-16)`, e.source === 'mod' || modFile(v.file));
      }
    }
  }

  // stuff: DMG-01 / DMG-02 / DMG-13
  const words = new Set();
  for (const s of Object.values(idx.stuff)) for (const t of s.tags || []) words.add(lc(t));
  for (const sr of Object.values(idx.stuff)) {
    const tree = treeOf(sr.key); if (!tree) continue;
    for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
      const params = [];
      for (const p of kidsN(root, 'parameters')) {
        const w = lc(str0(p) || '').split(/\s+/).filter(Boolean);
        params.push({ node: p, w, key: w.slice().sort().join(' ') });
      }
      const seen = [];
      for (const p of params) {
        if (seen.some(q => q.key === p.key)) continue;   // same tags merge into one entry
        const cnt = modFile(p.node.file);
        const sh = seen.find(q => q.w.length < p.w.length && q.w.every(x => p.w.includes(x)));
        if (sh) add(p.node.file, p.node.line, 'PARAM_BLOCK_SHADOWED', `{parameters "${p.w.join(' ')}"} never used: earlier block "${sh.w.join(' ')}" matches every ammo it would (first match wins, DMG-01)`, cnt);
        const bad = p.w.filter(x => !words.has(x));
        if (bad.length) add(p.node.file, p.node.line, 'PARAM_TAG_UNKNOWN', `{parameters "${p.w.join(' ')}"}: no stuff carries tag "${bad.join(' ')}"; tags match exactly ("apc" != "apcbc"), block never selected (DMG-01)`, cnt);
        seen.push(p);
      }
      const tables = [...kidsN(root, 'projectiledamagetable'), ...params.flatMap(p => kidsN(p.node, 'projectiledamagetable'))];
      for (const t of tables) {
        const rows = kidsOf(t).map(r => ({ r, v: vals(r) })).filter(x => x.v.length > 1);
        const last = rows[rows.length - 1];
        if (last && Number(last.v[1]) > 0) add(last.r.file, last.r.line, 'DMG_TABLE_UNTERMINATED', `last {${last.v[0]} ${last.v[1]}} > 0: damage stays ${last.v[1]} beyond ${last.v[0]} m (table clamps, no extrapolation); add an end point with 0 (DMG-02)`, modFile(last.r.file));
      }
      const plain = kidsN(root, 'damage').filter(d => { const a = argsOf(d).map(x => lc(tokVal(x))); return a.includes('blastwave') && !a.includes('add'); });
      for (let i = 0; i < plain.length - 1; i++) add(plain[i].file, plain[i].line, 'BLASTWAVE_REPLACED', `plain {damage blastwave} (no "add") replaced by a later one at line ${plain[plain.length - 1].line}; only the last survives (DMG-13)`, modFile(plain[i].file));
    }
  }

  // GPL-03: the penetration table has to reach range+5 (no pen beyond its last point)
  for (const r of weaponRows(L, { scope: opts.scope }).rows) {
    if (!r.rg || !r.tbl || !modFile(r.file)) continue;   // vanilla has 2 guns that stop short (a howitzer, a sniper rifle): mod files only
    const rn = nums(r.rg), rmax = rn.length ? Math.max(...rn) : 0;
    const pr = pairs(r.tbl).map(p => +p[0]); if (!pr.length) continue;
    const last = Math.max(...pr);
    if (rmax > 0 && last < rmax + 5) add(r.rg.file, r.rg.line, 'WARN_PEN_TABLE_SHORT', `weapon "${r[0]}" ammo ${r[1]}: penetration table ends at ${f2(last)} m but {range} reaches ${f2(rmax)} m; shots past the last point get no penetration, so extend the table to ${f2(rmax + 5)} m or lower the range (GPL-03)`, modFile(r.file));
  }

  // breeds: GPL-13
  const levels = new Map();
  for (const k of keys) if (/^resource\/set\/ability\/[^/]+\.set$/.test(k)) {
    const tree = treeOf(k); if (!tree) continue;
    for (const r of tree.items.filter(i => i.k === 'BLOCK')) {
      const lv = kidsN(r, 'level').map(l => { const a = argsOf(l)[0]; return a ? lc(String(tokVal(a))) : ''; });
      if (lv.length) levels.set(lc(nameOf(r) || ''), new Set(lv));
    }
  }
  for (const k of keys) if (/^resource\/set\/breed\/.*\.set$/.test(k) && !(opts.scope === 'mod' && !modFile(k))) {
    const tree = treeOf(k); if (!tree) continue;
    for (const r of tree.items.filter(i => i.k === 'BLOCK')) for (const pk of kidsN(r, 'perks')) for (const p of kidsOf(pk)) {
      const kind = lc(nameOf(p) || ''), lv = levels.get(kind), val = argsOf(p)[0];
      if (!lv || !val) continue;
      const s = lc(String(tokVal(val)));
      if (!lv.has(s)) add(p.file, p.line, 'PERK_LEVEL_UNDEFINED', `perk "${kind}" level "${tokVal(val)}" is not a {level} of set/ability/${kind}.set: soldier silently gets the TOP level (GPL-13)`, modFile(p.file));
    }
  }

  for (const g of groups.values()) {
    const msg = g.msg + (g.n > 1 ? ` (+${g.n - 1} entities)` : '');
    (g.counted ? rep.add : rep.info).call(rep, g.file, g.line, g.code, msg);
  }
  return rep;
}

// ---------- sheets ----------
const F = (file, row) => { row.file = file; return row; };   // source file of a sheet row (--paths)
function pairs(t) {
  return kidsOf(t).map(vals).filter(x => x.length > 1 && isFinite(Number(x[0])) && isFinite(Number(x[1])));
}
// {from} chain of a stuff record, nearest parent first (TST-38): `{from "pattern rifle"}` names rifle.pattern,
// `{from "garand"}` names the stuff garand. Child keys override parent keys [I: same rule as entity {from}].
function fromChain(L, sr) {
  if (!L.stuffByName) { L.stuffByName = new Map(); for (const s of Object.values(L.idx.stuff)) L.stuffByName.set(lc(s.name), s); }
  const out = [], seen = new Set([sr.key]);
  for (let cur = sr; cur && cur.from;) {
    const f = lc(cur.from).trim(), m = /^pattern\s+(\S+)$/.exec(f);
    const nx = L.stuffByName.get(m ? m[1] + '.pattern' : f) || L.stuffByName.get(f);
    if (!nx || seen.has(nx.key)) break;
    seen.add(nx.key);
    const t = L.treeOf(nx.key), r = t && t.items.find(i => i.k === 'BLOCK');
    if (r) out.push({ rec: nx, root: r });
    cur = nx;
  }
  return out;
}
function weaponRows(L, o) {
  const rows = [];
  for (const sr of Object.values(L.idx.stuff)) {
    if (o.scope === 'mod' && !L.modFile(sr.key)) continue;
    const tree = L.treeOf(sr.key); if (!tree) continue;
    const anc = fromChain(L, sr).reverse().map(x => x.root);   // oldest ancestor first, so later blocks win in kl
    for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
      const kl = (bl, n) => { for (let i = bl.length - 1; i >= 0; i--) { const k = kid(bl[i], n); if (k) return k; } return null; };
      const base = [...anc, root];
      const emit = (bl, ammo) => {
        const t = kl(bl, 'projectiledamagetable'), pd = kl(bl, 'projectiledamage'), rg = kl(bl, 'range'), rc = kl(base, 'rechargetime'), th = kl(bl, 'projectiledamagethreshold');
        if (!t && !pd) return;
        const row = F(sr.key, [sr.name, ammo, rg ? nums(rg).join('/') : '', rc ? nums(rc)[0] : '', pd ? nums(pd)[0] : '', th ? nums(th)[0] : '',
          t ? pairs(t).map(p => `${f2(+p[0])}m:${f2(+p[1])}`).join(' ') : '']);
        row.rg = rg; row.tbl = t;   // nodes for the GPL-03 check
        rows.push(row);
      };
      if (!kl(base, 'projectiledamagetable') && !kl(base, 'projectiledamage') && !base.some(b => kidsN(b, 'parameters').length)) continue;
      emit(base, '(default)');
      const grp = new Map();   // same tags merge into one entry; a child's block comes after its parent's
      for (const b of base) for (const p of kidsN(b, 'parameters')) { const a = lc(str0(p) || '').split(/\s+/).filter(Boolean).join(' '); if (!grp.has(a)) grp.set(a, []); grp.get(a).push(p); }
      for (const [a, bl] of grp) if (kl(bl, 'projectiledamagetable') || kl(bl, 'projectiledamage')) emit([...base, ...bl], a);
    }
  }
  return { head: ['weapon', 'ammo', 'range', 'recharge', 'damage', 'threshold', 'pen table (dist:mm)'], rows };
}
function ammoRows(L, o) {
  const rows = [];
  for (const sr of Object.values(L.idx.stuff)) {
    if (o.scope === 'mod' && !L.modFile(sr.key)) continue;
    const tree = L.treeOf(sr.key); if (!tree) continue;
    for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
      const bw = kidsN(root, 'damage').filter(d => argsOf(d).some(x => lc(tokVal(x)) === 'blastwave'));
      const ms = kid(root, 'mass'), dt = kid(root, 'detonationthickness'), en = kid(root, 'entity');
      if (!bw.length && !ms && !dt) continue;
      const layers = bw.map(d => { const e = kid(d, 'energy'), a = kid(d, 'area'); return `${e ? f2(nums(e)[0]) : '-'}E r${a ? nums(a).map(f2).join('-') : '-'}`; });
      rows.push(F(sr.key, [sr.name, (sr.tags || []).join(' '), ms ? nums(ms)[0] : '', dt ? nums(dt)[0] : '', layers.join(' + '), en ? str0(en) || '' : '']));
    }
  }
  return { head: ['ammo', 'tags', 'mass', 'detonation mm', 'blast layers', 'entity'], rows };
}
function armorRows(L, o) {
  const rows = [];
  for (const e of Object.values(L.idx.entities)) {
    if (o.scope === 'mod' && e.source !== 'mod') continue;
    const tree = L.treeOf(e.key); if (!tree) continue;
    for (const root of tree.items.filter(i => i.k === 'BLOCK')) {
      const { volumes, areas } = armorOf(root);
      if (!areas.length && !volumes.length) continue;
      const cover = new Set();
      for (const a of areas) {
        const vs = volumes.filter(v => areaFor(areas, v.tag) === a);
        vs.forEach(v => cover.add(v));
        const t = a.t ? [a.t.front, a.t.side, a.t.rear, a.t.top].map(f2).join('/') : '-';
        rows.push(F(e.key, [e.name, e.source, a.name, t, a.pats.join(' ') || '*', vs.map(v => v.name).join(' ')]));
      }
      for (const v of volumes) if (!cover.has(v) && areas.length === 0) rows.push(F(e.key, [e.name, e.source, '(volume)', ['front', 'left', 'rear', 'top'].map(s => f2(v.sides[s])).join('/'), v.tag, v.name]));
    }
  }
  return { head: ['entity', 'source', 'area', 'front/side/rear/top mm', 'volumes', 'matched volumes'], rows };
}
function priceRows(L, o) {
  const rows = [], key = 'resource/set/multiplayer/units/common.set';
  const buf = L.src.get(key); if (!buf) return { head: [], rows };
  const r = L.src.read({ key, file: key, get: () => L.src.get(key) }, () => {});
  const u = r && r.root.items.find(i => i.k === 'BLOCK'); if (!u) return { head: [], rows };
  const a1 = (b, n) => { const k = kid(b, n); const x = k && argsOf(k).map(tokVal).join(' '); return x === undefined || x === null ? '' : x; };
  for (const b of kidsOf(u)) {
    const name = nameOf(b); if (!name) continue;
    const kind = name.includes('(') ? 'squad' : kid(b, 'breed') ? 'soldier' : 'vehicle';
    rows.push(F(key, [name, kind, a1(b, 'cost'), a1(b, 'score'), a1(b, 'cp'), a1(b, 'cw'), a1(b, 'level'), a1(b, 'fore'), a1(b, 'group'), a1(b, 'tags')]));
  }
  return { head: ['unit', 'kind', 'cost', 'score', 'cp', 'cw', 'level', 'fore', 'group', 'tags'], rows };
}
function fmtTable(title, t, fmt, re, paths) {
  let rows = re ? t.rows.filter(r => re.test(r.join(' '))) : t.rows;
  if (paths) { t = { head: [...t.head, 'source file'], rows }; rows = rows.map(r => [...r, r.file || '']); }
  const esc = s => fmt === 'csv' ? (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s)) : String(s).replace(/\|/g, '/');
  const L = [];
  if (fmt === 'csv') { L.push('# ' + title); L.push(t.head.map(esc).join(',')); for (const r of rows) L.push(r.map(esc).join(',')); }
  else { L.push('## ' + title + ` (${rows.length})`, '', '| ' + t.head.join(' | ') + ' |', '|' + t.head.map(() => '---').join('|') + '|'); for (const r of rows) L.push('| ' + r.map(esc).join(' | ') + ' |'); }
  return L.join('\n') + '\n';
}
const SHEETS = { weapons: weaponRows, ammo: ammoRows, armor: armorRows, price: priceRows };
// ---------- GoH sheets ----------
// price: the card's buy price by the GoH rule (own cost + parts x squad_cost_factor, rounded up to round_multiple; GHGPL-10 [V]),
// first wait and interval of {charge {delay} {interval}} (GHMIS-86 [V]), research stage, doctrine and conditions (GHGPL-05 [V])
function gohPriceRows(L) {
  const U = require('./units'), H = { kid, kidsOf, nameOf, argsOf, str0, tokVal };
  const rows = [], key = 'resource/set/multiplayer/units/common.set';
  if (!L.src.get(key)) return { head: [], rows };
  const r = L.src.read({ key, file: key, get: () => L.src.get(key) }, () => {});
  const u = r && r.root.items.find(i => i.k === 'BLOCK'); if (!u) return { head: [], rows };
  const a1 = (b, n) => { const k = kid(b, n); const x = k && argsOf(k).map(tokVal).join(' '); return x === undefined || x === null ? '' : x; };
  const cards = kidsOf(u).filter(b => nameOf(b)), own = U.gohOwnCosts(cards, H), v = x => x == null ? '' : x;
  for (const b of cards) {
    const c = U.gohCard(b, H, own), file = b.file || (b.items && b.items[0] && b.items[0].file) || key;
    rows.push(F(file, [c.id, c.kind, c.army, c.period, v(c.cost), v(c.ownCost), c.scf || '', c.rm || '', a1(b, 'score'), a1(b, 'cp'), a1(b, 'cw'), v(c.delay), v(c.charge), v(c.researchStage), c.doctrine, c.conditions, a1(b, 'group'), a1(b, 'button'), c.tags.join(' ')]));
  }
  return { head: ['unit', 'kind', 'army', 'period', 'buy price', 'own cost', 'squad cost factor', 'round multiple', 'score', 'cp', 'cw', 'first wait', 'interval', 'research stage', 'doctrine', 'conditions', 'group', 'button', 'tags'], rows };
}
// research: the dynamic campaign research tree (set/dynamic_campaign/unit_research_<army>.set, GHCQ-16 [V]): entry = unit card or
// tech, requires, costs (research points), position x y | mid
function researchRows(L, o) {
  const rows = [], re = /^\{\s*(tech\s+)?"([^"]*)"\s+requires\s+"([^"]*)"\s+costs\s+([-\d.]+)\s+position\s+(mid|[-\d.]+(?:\s+[-\d.]+)?)/i;
  const keys = [...L.keys].filter(k => /^resource\/set\/dynamic_campaign\/unit_research_[^/]+\.set$/.test(k)).sort();
  for (const k of keys) {
    if (o.scope === 'mod' && !L.modFile(k)) continue;
    const b = L.src.get(k); if (!b) continue;
    const army = /unit_research_([^/]+)\.set$/.exec(k)[1];
    for (const line of b.toString('latin1').split(/\r?\n/)) {
      const m = re.exec(line.replace(/;.*$/, '').trim()); if (!m) continue;
      rows.push(F(k, [army, m[2], m[1] ? 'tech' : 'unit', m[3].trim(), m[4], m[5].replace(/\s+/g, ' ')]));
    }
  }
  return { head: ['army', 'entry', 'kind', 'requires', 'costs RP', 'position'], rows };
}
const GOH_SHEETS = { weapons: weaponRows, ammo: ammoRows, armor: armorRows, price: gohPriceRows, research: researchRows };

// --roster-insert <roster .set> <entity> [--dry]: add a card line for <entity> to a MOD-LOCAL copy of a units roster
// (set/multiplayer/units/*.set). The line is the last existing card ({"name" ...}) of the file with the name replaced, so cost/tags
// are a starting point to edit. Bytes stay cp1251 (latin1 round trip), EOL kept. Refuses a file inside the game install outside mods/ (vanilla is read-only).
// codes: ROSTER_FILE_MISSING ROSTER_VANILLA ROSTER_EXISTS ROSTER_NO_TEMPLATE; success prints ROSTER_INSERT + diff
function rosterInsert(file, ent, dry, gameDir) {
  const fail = (code, msg, line) => { console.log(file + ':' + (line || 0) + ': ' + code + ' ' + msg); console.log('1 findings'); process.exit(1); };
  if (!ent || /["\x00-\x1f]/.test(ent)) { console.error('usage: node statsheet.js --roster-insert <mod-local roster .set> <entity> [--dry]'); process.exit(2); }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) fail('ROSTER_FILE_MISSING', 'roster file not found (copy the vanilla roster into your mod first, VFS-42)');
  if (gameDir) {
    const g = path.resolve(gameDir).toLowerCase() + path.sep, a = abs.toLowerCase();
    if (a.startsWith(g) && !a.startsWith(g + 'mods' + path.sep) && !a.startsWith(g + 'as64' + path.sep + 'plus' + path.sep)) fail('ROSTER_VANILLA', 'file is inside the game install; vanilla data is read-only, edit a mod-local copy');
  }
  // Gates of Hell: ARSENAL never writes inside the GoH install, its mods/ folder included (lib/writeguard); the --game folder is not needed
  const inst = require('../lib/writeguard').detectInstall(abs);
  if (inst && inst.kind === 'goh') fail('ROSTER_VANILLA', 'file is inside the Gates of Hell install (its mods folder too); ARSENAL does not write there, edit a copy in a GoH mod folder outside the install');
  const text = fs.readFileSync(abs).toString('latin1'), eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/);
  const esc = ent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const has = lines.findIndex(l => new RegExp('^\\s*\\{"' + esc + '"\\s', 'i').test(l));
  if (has >= 0) fail('ROSTER_EXISTS', 'card for "' + ent + '" already present', has + 1);
  let t = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^\s*\{"[^"]+"\s/.test(lines[i])) { t = i; break; }
  if (t < 0) fail('ROSTER_NO_TEMPLATE', 'no card line ({"name" ...}) in the file to copy the shape from');
  const nl = lines[t].replace(/^(\s*\{")[^"]+(")/, (m, a, b) => a + ent + b);
  console.log(file + ':' + (t + 2) + ': ROSTER_INSERT ' + (dry ? '(dry) ' : '') + 'after line ' + (t + 1));
  console.log('--- ' + file + '\n+++ ' + file + '\n@@ -' + (t + 1) + ',0 +' + (t + 2) + ',1 @@\n+' + nl);
  if (!dry) { lines.splice(t + 1, 0, nl); fs.writeFileSync(abs, Buffer.from(lines.join(eol), 'latin1')); }
}

async function main() {
  // S13: `--filter -i word` (grep habit): the match is always case-insensitive, so drop the -i
  const argv = process.argv.slice(2);
  for (let i = 0; i + 2 < argv.length; i++) if (argv[i] === '--filter' && argv[i + 1] === '-i') argv.splice(i + 1, 1);
  const p = cli.parse(argv, { flags: ['--paths', '--dry', '--units-json'], values: ['--roster-insert', '--mod', '--folder', '--cache', '--scope', '--sheet', '--fmt', '--filter'] });
  const sp = a => a.split(',').map(x => x.trim()).filter(Boolean);
  const mods = p.mods.length ? p.mods.map(x => x.trim()).filter(Boolean) : p.x.mod ? sp(p.x.mod) : null;
  const o = { mods, folder: p.x.folder || null, cache: p.x.cache || null, scope: p.x.scope || 'all' };
  const pos = p.pos, sheet = p.x.sheet || (p.x.paths ? 'all' : null), fmt = p.x.fmt || 'md', out = p.output;
  const filter = p.x.filter ? new RegExp(p.x.filter, 'i') : null;
  if (p.x['roster-insert']) return rosterInsert(p.x['roster-insert'], pos[pos.length - 1], !!p.x.dry, p.gameDir);
  if (p.exe) o.exe = p.exe;   // only when named: no --exe keeps the build options (and the cache name) as before
  if (pos[0] && pos[0] !== '-') o.gameDir = pos.shift();
  else if (!pos.length && p.exe && p.gameDir) o.gameDir = p.gameDir;   // --exe with no gameDir: that game's install (cli: --game, GoH: games.install)
  if (!o.gameDir && !o.folder) { console.error('usage: node statsheet.js <gameDir|-> [--exe as64|mowas_2|goh] [--mods a,b] [--folder dir] [--cache f] [--scope all|mod] [--sheet weapons,ammo,armor,price,research|all] [--fmt md|csv] [-o file] [--filter re] [--units-json] [-q] [--summary] [--format text|json|sarif|html|csv] [--rc file|--no-rc]  (-o = sheet file with --sheet, else report file)'); process.exit(2); }
  if (!o.cache) o.cache = path.join(__dirname, '..', 'entityindex', 'cache', (o.mods && o.mods.length ? 'mods-' + crypto.createHash('md5').update(o.mods.join(',')).digest('hex').slice(0, 8) : o.folder ? 'folder-' + crypto.createHash('md5').update(path.resolve(o.folder)).digest('hex').slice(0, 8) : 'vanilla') + '.json');
  // progress note on a terminal only (golden tests capture stderr)
  const prog = process.stderr.isTTY && !p.q ? m => process.stderr.write('statsheet: ' + m + '\n') : null;
  // the research sheet is GoH only: refuse before the game data is read (the game from --exe, else the exe files of the game folder)
  const RESEARCH_WHY = 'the research sheet reads the Gates of Hell dynamic campaign research tree (set/dynamic_campaign/unit_research_<army>.set), which this game does not have';
  if (sheet && sheet !== 'all' && sheet.split(',').includes('research')) {
    const games = require('../lib/games'), gid = o.exe || (o.gameDir && games.detect(o.gameDir)) || 'as64';
    if (games.exeOf(gid) !== 'goh') games.refuse('statsheet', gid, RESEARCH_WHY, 'GHCQ-16');
  }
  if (prog) prog('reading game data (the first run builds a cache and can take a minute)');
  const L = await loadAll(o);
  if (p.x['units-json']) {
    const res = require('./units').unitsJson(L, Object.assign({}, o, { progress: prog }), { kid, kidsOf, nameOf, argsOf, str0, tokVal, armorOf, weaponRows });
    const js = JSON.stringify(res);
    if (out) fs.writeFileSync(out, js); else process.stdout.write(js + '\n');
    return;
  }
  if (sheet) {
    const goh = ((L.src.v && L.src.v.exe) || o.exe) === 'goh', SH = goh ? GOH_SHEETS : SHEETS;
    const names = sheet === 'all' ? Object.keys(SH) : sheet.split(',');
    let text = '';
    for (const n of names) {
      if (n === 'research' && !goh) require('../lib/games').refuse('statsheet', (L.src.v && L.src.v.exe) || o.exe || 'as64', RESEARCH_WHY, 'GHCQ-16');
      if (!SH[n]) { console.error('unknown sheet ' + n); process.exit(2); }
      text += fmtTable(n, SH[n](L, o), fmt, filter, !!p.x.paths) + '\n';
    }
    if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
    return;
  }
  const rep = runChecks(L, o);
  cli.printReport(rep, p, { tool: 'statsheet' });
}
if (require.main === module) cli.run(main);
module.exports = { armorOf, runChecks, loadAll, weaponRows, H: { kid, kidsOf, nameOf, argsOf, str0, tokVal, armorOf, weaponRows } };
