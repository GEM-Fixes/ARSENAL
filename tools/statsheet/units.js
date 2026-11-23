// statsheet --units-json: one JSON catalogue of every multiplayer card (vehicle, squad, soldier) with the facts a player asks for:
// display name (.lng), army, price fields, unlock time inputs, armour (macro form or per-volume form), main gun range/damage,
// speed, crew, the units file that holds the card and the bot purchase rows (script/multiplayer/bot.data.lua) that name it.
// Used by the GUI "Units" page (tools/gui/ext/units). Read only.
// Author: Imperator_Aug (ARSENAL, ia-b494d408)
const lngpot = require('../upgrade/lib/lngpot');

const lc = s => String(s == null ? '' : s).toLowerCase();
const num = v => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; };

// names: every .lng under interface/text (vanilla) or localization (mod). '#' files load first and lose to plain files (LOC-19 [I])
// GoH (goh true): the texts are .pot (msgctxt = the whole key, msgid = English; GHLOC-06) and .lng (as64 key rule, GHLOC-09) at any
// depth below interface/text/ (the vfs mounts localizations/<lang> there); the .pot layer loads first, .lng after it (GHLOC-01)
// the keys of one .lng file -> [[key, text]]. A file that keeps its texts in (include "x") parts (a mod whose text files were split)
// is read with the includes written out, as the game does (lib/lnginc, LOC-21); a part is looked up in the game's text folder
// and beside the file that names it (a mod's localization/ folder stands for interface/text)
const TEXT_ROOT = 'resource/interface/text/';
function lngFileKeys(L, k, b, rel) {
  if (b.indexOf('(include') < 0) return lngpot.lngKeys(b, rel);
  const base = k.slice(0, k.length - rel.length), get = x => { try { return L.src.get(x) || null; } catch (e) { return null; } };
  const open = v => { const low = lc(v); let buf = get(low) || get(v); if (!buf && low.startsWith(TEXT_ROOT)) buf = get(base + low.slice(TEXT_ROOT.length)); return buf ? { buf, file: v } : null; };
  return [...require('../lib/lnginc').readLngKeys(b, rel, { open, onError() {} })].map(([low, v]) => [low, v.txt]);
}
function lngNames(L, progress, goh) {
  const out = new Map(), files = [];
  for (const k of L.src.v ? L.src.v.files.keys() : []) files.push(k);
  if (L.src.local) for (const k of L.src.local.keys ? L.src.local.keys() : L.src.local) files.push(k);
  if (goh) return gohNames(L, [...new Set(files)], out, progress);
  const want = [...new Set(files)].filter(k => /(^|\/)(interface\/text|localization)\/[^/]+\.lng$/i.test(k) && !/\/mission\//i.test(k));
  const rel = k => k.replace(/^.*?(interface\/text|localization)\//i, '');
  want.sort((a, b) => (rel(a).startsWith('#') ? 0 : 1) - (rel(b).startsWith('#') ? 0 : 1) || (L.modFile(a) ? 1 : 0) - (L.modFile(b) ? 1 : 0));
  for (const k of want) {
    let kv; try { const b = L.src.get(k); if (!b) continue; kv = lngFileKeys(L, k, b, rel(k)); } catch (e) { continue; }
    for (const [key, text] of kv) if (/^(desc|info)\/(entity|squad|human)\//i.test(key)) out.set(lc(key), { text: String(text).replace(/<[^>]*>/g, '').trim(), file: k });
  }
  if (progress) progress('names ' + out.size);
  return out;
}
const NAMEKEY = /^(desc|info)\/(entity|squad|human|special)\//i;
// a mod folder's own files keep their folder path (resource/localizations/<lang>/interface/text/...): only the default language is
// taken (the fallback layer, GHLOC-01; the vfs mounts the install the same way), and the key prefix starts after interface/text/
function gohNames(L, files, out, progress) {
  const want = files.filter(k => /(^|\/)(interface\/text|localizations?)\/.+\.(pot|lng)$/i.test(k) && !/\/mission\//i.test(k) &&
    !/(^|\/)localizations\/(?!default\/)[^/]+\//i.test(k));
  const rel = k => /(^|\/)interface\/text\//i.test(k) ? k.replace(/^(.*?\/)?interface\/text\//i, '') : k.replace(/^.*?localizations?\//i, '');
  // .pot (fallback layer) first, then .lng; game before mod; later wins
  want.sort((a, b) => (/\.pot$/i.test(a) ? 0 : 1) - (/\.pot$/i.test(b) ? 0 : 1) || (L.modFile(a) ? 1 : 0) - (L.modFile(b) ? 1 : 0) || (a < b ? -1 : 1));
  for (const k of want) {
    let kv;
    try {
      const b = L.src.get(k); if (!b) continue;
      kv = /\.pot$/i.test(k) ? lngpot.potKeys(b.toString('utf8').replace(/^﻿/, '')).map(([key, t]) => [key, t.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1')]) : lngFileKeys(L, k, b, rel(k));
    } catch (e) { continue; }
    for (const [key, text] of kv) if (NAMEKEY.test(key) && String(text).trim()) out.set(lc(key), { text: String(text).replace(/<[^>]*>/g, '').trim(), file: k });
  }
  if (progress) progress('names ' + out.size);
  return out;
}

// bot.data.lua: Purchases = { {--purchase N  Units = { ["army"] = { {priority = P, class = UnitClass.C, unit = "U"}, ... } } } }
function botRows(L) {
  const key = ['resource/script/multiplayer/bot.data.lua', 'script/multiplayer/bot.data.lua'].find(k => L.src.get(k));
  const rows = [];
  if (!key) return { key: null, rows };
  const text = L.src.get(key).toString('latin1').split(/\r?\n/);
  let army = null, purchase = 0;
  text.forEach((l, i) => {
    if (/--\s*purchase\s*\d+/i.test(l) || /^\s*\{\s*$/.test(l) && army === null && purchase === 0) { const m = /purchase\s*(\d+)/i.exec(l); if (m) purchase = +m[1]; }
    const a = /^\s*\[\s*"([^"]+)"\s*\]\s*=/.exec(l); if (a) army = a[1];
    const u = /\bunit\s*=\s*"([^"]+)"/.exec(l);
    if (u) {
      const p = /\bpriority\s*=\s*([0-9.]+)/.exec(l), c = /\bclass\s*=\s*UnitClass\.(\w+)/.exec(l);
      rows.push({ unit: u[1], army, purchase, priority: p ? +p[1] : null, cls: c ? c[1] : null, line: i + 1 });
    }
  });
  return { key, rows };
}

// one read and one parse per file for the whole catalogue (PERF L2), for the time of one unitsJson: the source's byte memo keeps the
// included files (properties, stuff .presets), every file read for itself is kept too (a def is parsed, then read again for armorMacro),
// trees are kept by key (weaponRows parses a gun's {from} ancestors again for each child). The defs and stuff the catalogue reads are
// read first in pak offset order (entityindex src.pakAhead). Nothing is written while it runs; all of it is dropped at the end.
function unitsJson(L, o, H) {
  const src = L.src, get0 = src.get, tree0 = L.treeOf, hadBytes = 'bytes' in src ? src.bytes : undefined, got = new Map(), trees = new Map();
  if (hadBytes === null) src.bytes = new Map();
  src.get = k => { let b = got.get(k); if (b === undefined) { b = get0(k); got.set(k, b === undefined ? null : b); } return b; };
  L.treeOf = k => { if (!trees.has(k)) trees.set(k, tree0(k)); return trees.get(k); };
  try {
    if (typeof src.pakAhead === 'function' && L.idx) {
      const want = [];
      for (const e of Object.values(L.idx.entities || {})) want.push(e.key);
      for (const s of Object.values(L.idx.stuff || {})) { want.push(s.key); if (src.preInclude) want.push(...src.preInclude(s.key)); }
      // only the defs a card names are read: a def with an entity record of the cards' names (vehicle id or GoH content vehicle)
      const names = new Set();
      for (const k of src.v ? src.v.files.keys() : []) if (/^resource\/set\/multiplayer\/units\//.test(k)) { const b = src.get(k); if (b) for (const m of b.toString('latin1').matchAll(/[\w\-.()]+/g)) names.add(m[0].toLowerCase()); }
      const keep = want.filter(k => !/\.def$/.test(k) || names.has(k.slice(k.lastIndexOf('/') + 1, -4).toLowerCase()));
      for (const _ of src.pakAhead(keep)) { /* sync: one forward pass a pak */ }
    }
    return unitsJson1(L, o, H);
  } finally {
    src.get = get0; L.treeOf = tree0;
    if (hadBytes === null) src.bytes = null;
    if (src.pakDrop) src.pakDrop();
  }
}
function unitsJson1(L, o, H) {
  const { kid, kidsOf, nameOf, argsOf, str0, tokVal, armorOf, weaponRows } = H;
  const progress = o.progress || null;
  const key = 'resource/set/multiplayer/units/common.set';
  const exe = o.exe || (L.src.v && L.src.v.exe) || null, goh = exe === 'goh';
  const res = { tool: 'statsheet', kind: 'units', game: o.gameDir || null, folder: o.folder || null, units: [], botFile: null, warnings: [] };
  if (o.exe) res.exe = o.exe;
  if (!L.src.get(key)) { res.warnings.push('no ' + key + ' (multiplayer unit list) in this game or mod'); return res; }
  const r = L.src.read({ key, file: key, get: () => L.src.get(key) }, () => {});
  const root = r && r.root.items.find(i => i.k === 'BLOCK');
  if (!root) { res.warnings.push(key + ': no {units ...} block'); return res; }
  const a1 = (b, n) => { const k = kid(b, n); const x = k && argsOf(k).map(tokVal).join(' '); return x == null ? '' : String(x); };
  const names = lngNames(L, progress, goh);
  if (goh) return gohUnits(L, o, H, { root, res, names, a1, progress });
  // entities by name; a mod record wins
  const ents = new Map();
  for (const e of Object.values(L.idx.entities)) { const n = lc(e.name); const cur = ents.get(n); if (!cur || e.source === 'mod') ents.set(n, e); }
  // weapon rows by stuff name, (default) ammo first
  let wrows = null;
  const gunOf = w => {
    if (!wrows) { wrows = new Map(); try { for (const row of weaponRows(L, { scope: 'all' }).rows) { const n = lc(row[0]); if (!wrows.has(n) || row[1] === '(default)') wrows.set(n, row); } } catch (e) { res.warnings.push('weapon table: ' + e.message); } }
    const row = wrows.get(lc(w)) || null;   // a shell-type row (apcr ..) only when the gun has no (default) row: the chain comes first then
    return row && row[1] === '(default)' ? row : gunFromChain(L, w, wrows) || row;
  };
  const bots = botRows(L); res.botFile = bots.key;
  const botBy = new Map(); for (const b of bots.rows) { const k = lc(b.unit); if (!botBy.has(k)) botBy.set(k, []); botBy.get(k).push(b); }
  const cards = kidsOf(root).filter(b => nameOf(b));
  // unit lists a game mode adds: a preset's {apply "name"} loads set/multiplayer/units/<name>.set on top of common.set, so a mod
  // may keep common.set empty and put every card in such lists (one per era). Each named list is read once; the first card of an id wins.
  {
    const have = new Set(cards.map(c => lc(nameOf(c)))), all = new Set(), applied = new Set();
    for (const k of L.src.v ? L.src.v.files.keys() : []) all.add(k);
    if (L.src.local) for (const k of L.src.local.keys ? L.src.local.keys() : L.src.local) all.add(k);
    for (const k of all) {
      if (!/(^|\/)set\/multiplayer\/games\/[^/]+\.(set|inc)$/i.test(k)) continue;
      const buf = L.src.get(k); if (!buf) continue;
      const re = /^[^;\n]*\{apply\s+(?!remove\b)"([^"]+)"\s*\}/gim, txt = buf.toString('latin1'); let m;
      while ((m = re.exec(txt))) applied.add(lc(m[1]));
    }
    res.lists = [key];
    for (const name of [...applied].sort()) {
      const k2 = 'resource/set/multiplayer/units/' + name + '.set';
      if (k2 === key || !L.src.get(k2)) continue;
      let r2 = null; try { r2 = L.src.read({ key: k2, file: k2, get: () => L.src.get(k2) }, () => {}); } catch (e) { res.warnings.push(k2 + ': ' + e.message); continue; }
      const root2 = r2 && r2.root.items.find(i => i.k === 'BLOCK'); if (!root2) continue;
      res.lists.push(k2);
      for (const c of kidsOf(root2)) { const id2 = nameOf(c); if (!id2 || have.has(lc(id2))) continue; have.add(lc(id2)); cards.push(c); }
    }
  }
  if (progress) progress('cards ' + cards.length);
  let n = 0;
  for (const b of cards) {
    const id = nameOf(b), tags = a1(b, 'tags').split(/\s+/).filter(Boolean);
    const squad = /\(([^)]+)\)\s*$/.exec(id);
    const kind = squad ? 'squad' : kid(b, 'breed') ? 'soldier' : 'vehicle';
    const sold = /^mp\/([^/]+)\//i.exec(id);
    let army = squad ? squad[1] : sold ? sold[1] : tags.length ? tags[tags.length - 1] : '';
    if (/%/.test(army)) army = '';
    const file = b.file || (b.items && b.items[0] && b.items[0].file) || null;
    const u = { id, kind, army, cost: num(a1(b, 'cost')), level: num(a1(b, 'level')), charge: num(a1(b, 'charge')), fore: num(a1(b, 'fore')),
      score: num(a1(b, 'score')), cp: num(a1(b, 'cp')), cw: num(a1(b, 'cw')), group: a1(b, 'group'), button: a1(b, 'button'), tags: tags.join(' '),
      content: a1(b, 'content'), cardFile: file, cardLine: b.line || null, cardMod: file ? !!L.modFile(file) : false };
    u.buyable = u.cost != null && !!army;
    const nk = squad ? 'desc/squad/' + lc(id) : kind === 'soldier' ? 'desc/human/' + lc(id) : 'desc/entity/' + lc(id);
    const nm = names.get(nk) || (squad ? names.get('desc/squad/' + lc(id.replace(/\([^)]*\)\s*$/, ''))) : null);
    u.name = nm ? nm.text : ''; u.nameKey = nk; u.nameFile = nm ? nm.file : null;
    const info = names.get(nk.replace(/^desc/, 'info')); u.info = info ? info.text.slice(0, 400) : '';
    // crew from content: "* ( mp/rus/tankman:2 mp/rus/tankman2:1)" or squad members "mp/rus/rifle:3 ..."
    const mem = []; (u.content.match(/mp\/[^\s:()]+(:\d+)?/g) || []).forEach(m => { const x = /mp\/[^/]+\/([^:]+)(?::(\d+))?/.exec(m); if (x) mem.push({ breed: x[1], n: x[2] ? +x[2] : 1 }); });
    u.members = mem; u.crew = mem.reduce((s, m) => s + m.n, 0) || null;
    const e = kind === 'vehicle' ? ents.get(lc(id)) : null;
    if (e) {
      u.def = e.key; u.defMod = e.source === 'mod';
      const t = L.treeOf(e.key), rb = t && t.items.find(i => i.k === 'BLOCK');
      if (rb) Object.assign(u, defFacts(L, rb, t, H, gunOf));
      try { const raw = L.src.get(e.key); if (raw) u.armorMacro = armorMacro(raw.toString('latin1')); } catch (x) { /* binary */ }
      u.wreck = !!ents.get(lc(id) + '_x');
    }
    u.bots = (botBy.get(lc(id)) || []).map(x => ({ army: x.army, purchase: x.purchase, priority: x.priority, cls: x.cls }));
    res.units.push(u);
    if (progress && ++n % 200 === 0) progress('units ' + n + '/' + cards.length);
  }
  res.bots = bots.rows.length;
  return res;
}

// ---- Gates of Hell cards [V] ). Differences from AS2:
//   ids carry the period (mp/ger/early/tankman, doctrine_p204_f_early); the vehicle of a card is the first word of {content}, not the id
//   army = the side in the members' mp/<side>/<period>/ paths (the last tag is the period) [I]
//   price (GHGPL-10 [V]): own cost + sum over content parts (not the card itself) count x part cost x squad_cost_factor, rounded up to
//     round_multiple; u.cost = that buy price, u.ownCost = the card's {cost}
//   cooldown (GHMIS-86 [V]): {charge {delay N} {interval N}}: u.delay = first wait (once at game start), u.charge = interval after a buy
//   level and fore are not read by GoH: null; research_stage, doctrine, conditions, action, not_for_sale, enabled kept as read
//   buyable: a cost, an army and a button (a card without button is hidden), not not_for_sale
//   bots: GoH has no script/multiplayer/bot.data.lua (GHMIS-66); its bots buy from the purchase lists
//     script/multiplayer/units/<army>/<list>.<army>.lua (tools/botrecipe/gohbuys, [I]/[T]). u.bots = one row per list entry naming the
//     card id: {army, list, purchase (stage number), priority, availability, cls}. A period list (early, mid, late) counts only for the
//     card of that period; conquest and any other list for every period copy of the id.
const SIDES = ['ger', 'rus', 'usa', 'eng', 'fin', 'ita', 'jap', 'fra', 'pol', 'hun', 'rom', 'can', 'ned', 'uk'];
const a1Of = H => (b, n) => { const k = H.kid(b, n); const x = k && H.argsOf(k).map(H.tokVal).join(' '); return x == null ? '' : String(x); };
// card id (lower case) -> the card's own {cost} (0 when none): the part costs a content adds up
function gohOwnCosts(cards, H) {
  const a1 = a1Of(H), own = new Map();
  for (const b of cards) { const c = num(a1(b, 'cost')); own.set(lc(H.nameOf(b)), c == null ? 0 : c); }
  return own;
}
// the facts of one GoH card block (parsed, macros expanded): price by GHGPL-10, charge by GHMIS-86, doctrine/conditions (GHGPL-05)
function gohCard(b, H, own) {
  const { kid, nameOf, argsOf, tokVal } = H, a1 = a1Of(H);
  const sub = (x, n) => { const k = kid(x, n); if (!k) return null; const v = argsOf(k).find(t => t.k === 'INTEGER' || t.k === 'FLOAT'); return v ? v.value : num(a1(x, n)); };
  const flag = n => { const k = kid(b, n); if (!k) return null; const a = argsOf(k).map(tokVal); return !a.length || !/^(0|false|no|off)$/i.test(String(a[0])); };
  const id = nameOf(b), tags = a1(b, 'tags').split(/\s+/).filter(Boolean);
  const squad = /\(([^)]+)\)\s*$/.exec(id);
  const kind = squad ? 'squad' : kid(b, 'breed') || /^mp\//i.test(id) ? 'soldier' : 'vehicle';
  const content = a1(b, 'content');
  const parts = [];   // {id, n}: every unit the content names (vehicles and members); '*' = the card itself, not counted
  for (const m of content.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)) { const x = /^([^:]+)(?::(\d+))?$/.exec(m); if (x && x[1] !== '*') parts.push({ id: x[1], n: x[2] ? +x[2] : 1 }); }
  const side = (/(?:^|\s)mp\/([^/\s]+)\//i.exec(content) || /^mp\/([^/]+)\//i.exec(id) || [])[1];
  const period = (/(?:^|\s)mp\/[^/\s]+\/([^/\s]+)\//i.exec(content) || /^mp\/[^/]+\/([^/]+)\//i.exec(id) || [])[1] || '';
  let army = squad ? squad[1] : side || tags.slice().reverse().find(t => SIDES.includes(lc(t))) || '';
  if (/%/.test(army)) army = '';
  const vehicle = kind === 'vehicle' ? ((/^\s*([^\s()*:]+)\s*\(/.exec(content) || [])[1] || id) : null;
  const ch = kid(b, 'charge');
  const ownCost = num(a1(b, 'cost')), scf = sub(b, 'squad_cost_factor') || 0, rm = sub(b, 'round_multiple') || 0;
  let cost = ownCost;
  if (ownCost != null || parts.length) {
    const sq = parts.reduce((s, p) => s + p.n * ((own && own.get(lc(p.id))) || 0) * scf, 0);
    cost = (ownCost || 0) + sq;
    if (rm > 0) { const f = cost % rm; if (f > 1e-9) cost = cost + (rm - f); }
    cost = Math.round(cost * 1000) / 1000;
    if (ownCost == null && !sq) cost = null;
  }
  return { id, kind, squad, tags, content, parts, army, period, vehicle, ownCost, cost, scf, rm,
    delay: ch ? sub(ch, 'delay') : null, charge: ch ? (sub(ch, 'interval') != null ? sub(ch, 'interval') : num(a1(b, 'charge'))) : null,
    researchStage: sub(b, 'research_stage'), doctrine: a1(b, 'doctrine'), conditions: a1(b, 'conditions'), action: a1(b, 'action'),
    notForSale: !!flag('not_for_sale'), enabled: flag('enabled') !== false };
}
// every GoH purchase list the source serves (game, mod folder, its paks): rows like botRows plus list and availability
function gohBotRows(L) {
  const GB = require('../botrecipe/gohbuys'), src = L.src, keys = new Set();
  for (const k of src.v ? src.v.files.keys() : []) keys.add(k);
  if (src.local) for (const k of src.local.keys()) keys.add(k);
  try { if (typeof src.packed === 'function') for (const k of src.packed().keys()) keys.add(k); } catch (e) { /* no paks */ }
  const rows = [], files = [];
  for (const k of [...keys].sort()) {
    const rel = k.replace(/^resource\//, ''); if (!GB.fileOf(rel)) continue;
    const b = src.get(k); if (!b) continue;
    const r = GB.readList(b.toString('latin1'), rel); files.push(rel);
    for (const st of r.stages) for (const x of st.units) rows.push({ unit: x.unit, army: r.army, list: r.list, purchase: st.n, priority: x.priority, availability: x.availability, cls: x.cls, line: x.line });
  }
  return { key: files.length ? files.length + ' purchase lists' : null, rows };
}
const GOH_PERIOD_LISTS = ['early', 'mid', 'late'];
function gohUnits(L, o, H, X) {
  const { kid, kidsOf, nameOf, argsOf, str0, tokVal, armorOf, weaponRows } = H, { root, res, names, a1, progress } = X;
  res.game = o.gameDir || null; res.exe = 'goh';
  const ents = new Map();
  for (const e of Object.values(L.idx.entities)) { const n = lc(e.name); const cur = ents.get(n); if (!cur || e.source === 'mod') ents.set(n, e); }
  let wrows = null;
  const gunOf = w => {
    if (!wrows) { wrows = new Map(); try { for (const row of weaponRows(L, { scope: 'all' }).rows) { const n = lc(row[0]); if (!wrows.has(n) || row[1] === '(default)') wrows.set(n, row); } } catch (e) { res.warnings.push('weapon table: ' + e.message); } }
    const row = wrows.get(lc(w)) || null;
    return row && row[1] === '(default)' ? row : gunFromChain(L, w, wrows) || row;
  };
  const bots = gohBotRows(L); res.botFile = bots.key;
  if (!bots.key) res.warnings.push('no bot rows: no purchase list script/multiplayer/units/<army>/<list>.<army>.lua (GoH has no bot.data.lua, GHMIS-66)');
  const botBy = new Map(); for (const b of bots.rows) { const k = lc(b.unit); if (!botBy.has(k)) botBy.set(k, []); botBy.get(k).push(b); }
  const cards = kidsOf(root).filter(b => nameOf(b));
  if (progress) progress('cards ' + cards.length);
  const own = gohOwnCosts(cards, H);
  let n = 0;
  for (const b of cards) {
    const c = gohCard(b, H, own), { id, kind, squad, vehicle, parts } = c;
    const file = b.file || (b.items && b.items[0] && b.items[0].file) || null;
    const u = { id, kind, army: c.army, period: c.period, cost: c.cost, ownCost: c.ownCost, squadCostFactor: c.scf || null, roundMultiple: c.rm || null, level: null, researchStage: c.researchStage,
      delay: c.delay, charge: c.charge, fore: null,
      score: num(a1(b, 'score')), cp: num(a1(b, 'cp')), cw: num(a1(b, 'cw')), group: a1(b, 'group'), button: a1(b, 'button'), tags: c.tags.join(' '),
      doctrine: c.doctrine, conditions: c.conditions, action: c.action, notForSale: c.notForSale, enabled: c.enabled,
      content: c.content, vehicle, cardFile: file, cardLine: b.line || null, cardMod: file ? !!L.modFile(file) : false };
    u.buyable = u.cost != null && !!u.army && !!u.button && !u.notForSale;
    const nk = squad ? 'desc/squad/' + lc(id) : kind === 'soldier' ? 'desc/human/' + lc(id) : 'desc/entity/' + lc(id);
    const keys = [nk]; if (squad) keys.push('desc/squad/' + lc(id.replace(/\([^)]*\)\s*$/, ''))); if (vehicle && vehicle !== id) keys.push('desc/entity/' + lc(vehicle));
    const hitKey = keys.find(k => names.has(k)), nm = hitKey ? names.get(hitKey) : null;
    u.name = nm ? nm.text : ''; u.nameKey = hitKey || nk; u.nameFile = nm ? nm.file : null;
    const info = names.get(u.nameKey.replace(/^desc/, 'info')) || (vehicle ? names.get('info/special/' + lc(vehicle)) : null); u.info = info ? info.text.slice(0, 400) : '';
    const mem = parts.filter(p => /^mp\//i.test(p.id)).map(p => { const x = /^mp\/[^/]+\/(.+)$/i.exec(p.id); return { breed: x ? x[1] : p.id, n: p.n, card: p.id }; });
    u.members = mem; u.crew = mem.reduce((s, m) => s + m.n, 0) || null;
    const e = vehicle ? ents.get(lc(vehicle)) : null;
    if (e) {
      u.def = e.key; u.defMod = e.source === 'mod';
      const t = L.treeOf(e.key), rb = t && t.items.find(i => i.k === 'BLOCK');
      if (rb) Object.assign(u, defFacts(L, rb, t, H, gunOf));
      try { const raw = L.src.get(e.key); if (raw) u.armorMacro = armorMacro(raw.toString('latin1')); } catch (x) { /* binary */ }
      u.wreck = !!ents.get(lc(vehicle) + '_x');
    }
    u.bots = (botBy.get(lc(id)) || []).filter(x => !c.period || !GOH_PERIOD_LISTS.includes(x.list) || x.list === lc(c.period))
      .map(x => ({ army: x.army, list: x.list, purchase: x.purchase, priority: x.priority, availability: x.availability, cls: x.cls }));
    res.units.push(u);
    if (progress && ++n % 200 === 0) progress('units ' + n + '/' + cards.length);
  }
  res.bots = bots.rows.length;
  return res;
}

// a gun with no weapon row of its own: follow its file's {from "x"} chain (nearest first, as gen/lib/ops.js gunChain/gunFacts)
// and take the first ancestor that has a row; rechargeTime / projectileDamage set in a nearer file (outside {parameters ..}) win.
// Needed because a file that only inherits (75mm_kwk40(l48) = {from "75mm_pak39"}) gets no row: the stuff index records no
// {from} for gun files (entityindex extractStuff reads the first block of the parse, which is the .presets block).
const GUNDIRS = ['resource/set/stuff/gun/', 'set/stuff/gun/'];
function gunText(L, name) {
  for (const d of GUNDIRS) { try { const b = L.src.get(d + name); if (b) return b.toString('latin1'); } catch (e) { /* unreadable */ } }
  return null;
}
function gunOwnText(text) {   // {parameters "x" ..} blocks cut out: their values belong to one shell type
  let out = '', d = 0, skip = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ';') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; if (skip < 0) out += '\n'; continue; }
    if (c === '"') { const e = text.indexOf('"', i + 1); const str = text.slice(i, e < 0 ? text.length : e + 1); i = e < 0 ? text.length : e; if (skip < 0) out += str; continue; }
    if (c === '{') { if (skip < 0 && /^\{\s*parameters\s+"/i.test(text.slice(i, i + 40))) skip = d; d++; }
    else if (c === '}') { d--; if (skip >= 0 && d === skip) { skip = -1; continue; } }
    if (skip < 0) out += c;
  }
  return out;
}
function gunFromChain(L, w, wrows) {
  const own = { recharge: null, damage: null }, seen = new Set();
  let n = lc(w).trim();
  for (let i = 0; i < 8 && n && n !== 'pattern gun' && !seen.has(n); i++) {
    seen.add(n);
    const row = i ? wrows.get(n) : null;
    if (row) {
      const out = row.slice();
      if (own.recharge != null) out[3] = own.recharge;
      if (own.damage != null) out[4] = own.damage;
      out.from = n;
      return out;
    }
    const text = gunText(L, n);
    if (text === null) return null;
    const t = gunOwnText(text);
    let m;
    if (own.recharge == null && (m = /\{\s*rechargeTime\s+([\d.]+)/i.exec(t))) own.recharge = +m[1];
    if (own.damage == null && (m = /\{\s*projectileDamage\s+([\d.]+)/i.exec(t))) own.damage = +m[1];
    m = /\{\s*from\s+"([^"]+)"/i.exec(t);
    n = m ? lc(m[1]).trim() : '';
  }
  return null;
}

// armour macro form in the raw def text: ("armor_medium" turret(52 52 52 20) body(45 45 45 22)) or ("armor_light" args 10 20 30 40)
function armorMacro(text) {
  const out = [], re = /\(\s*"(armor_[^"]+)"([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
  let m;
  while ((m = re.exec(text))) {
    const body = m[2], parts = [];
    const pr = /([A-Za-z_][\w]*)\s*\(([^()]*)\)/g; let p;
    while ((p = pr.exec(body))) parts.push({ name: p[1].toLowerCase(), values: p[2].trim().split(/\s+/).filter(Boolean).map(Number) });
    const a = /\bargs\b\s+([-0-9.\s]+)/i.exec(body);
    if (a) parts.push({ name: 'args', values: a[1].trim().split(/\s+/).filter(Boolean).map(Number) });
    out.push({ macro: m[1].toLowerCase(), parts });
  }
  return out;
}

function defFacts(L, rb, t, H, gunOf) {
  const { kid, kidsOf, nameOf, argsOf, str0, tokVal, armorOf } = H;
  const f = {};
  // shallowest blocks named n (later includes/blocks override earlier ones at the same depth)
  const findAll = (b, n) => { let lvl = [b]; for (let d = 0; d < 8 && lvl.length; d++) { const hit = [], nx = []; for (const x of lvl) for (const c of kidsOf(x)) { if (lc(nameOf(c)) === n) hit.push(c); else nx.push(c); } if (hit.length) return hit; lvl = nx; } return []; };
  const find = (b, n) => { const a = findAll(b, n); return a.length ? a[a.length - 1] : null; };
  const n1 = b => { const x = b && argsOf(b).find(a => a.k === 'INTEGER' || a.k === 'FLOAT'); return x ? x.value : null; };
  const loco = find(rb, 'locomotion');
  f.speed = n1(loco ? find(loco, 'maxspeed') : null);
  f.mass = n1(find(rb, 'mass'));
  // main gun: Weaponry > place "gun"|first place > weapon "name"
  const wrs = findAll(rb, 'weaponry');
  if (wrs.length) {
    const places = [].concat(...wrs.map(wr => kidsOf(wr).filter(c => lc(nameOf(c)) === 'place')));
    const wOf = c => kidsOf(c).find(x => lc(nameOf(x)) === 'weapon');
    const armed = places.filter(wOf);
    const p = armed.filter(c => lc(str0(c)) === 'gun').pop() || armed[0];
    const w = p && wOf(p);
    const wn = w && str0(w);
    if (wn) {
      f.gun = { weapon: wn, place: str0(p) || '' };
      const row = gunOf(wn);
      if (row) Object.assign(f.gun, { range: row[2], recharge: row[3], damage: row[4], pen: row[6] });
    }
    f.weapons = places.map(c => { const w2 = kidsOf(c).find(x => lc(nameOf(x)) === 'weapon'); return w2 ? str0(w2) : null; }).filter(Boolean);
  }
  const ar = armorOf(rb);
  if (ar.areas.length) f.armorAreas = ar.areas.filter(a => a.t).map(a => ({ name: a.name, front: a.t.front, side: a.t.side, rear: a.t.rear, top: a.t.top }));
  if (ar.volumes.length) {
    const s = { front: 0, side: 0, rear: 0, top: 0 };
    for (const v of ar.volumes) { s.front = Math.max(s.front, v.sides.front); s.side = Math.max(s.side, v.sides.left, v.sides.right); s.rear = Math.max(s.rear, v.sides.rear); s.top = Math.max(s.top, v.sides.top); }
    f.armorVolumes = ar.volumes.map(v => ({ name: v.name, front: v.sides.front, side: v.sides.left, rear: v.sides.rear, top: v.sides.top }));
    f.armorMax = s;
  }
  return f;
}

module.exports = { unitsJson, armorMacro, botRows, lngNames, gohCard, gohOwnCosts };
