// lngsplit/buylist: MP buy-list facts for the info.lng layout (split --buylist, default on for info.lng).
//   read({ modDir, gameDir, exe, breeds }) -> { cards:[card], buttons:[tag], sides:[tag], labels:Map button -> text|null }
//     card = { name, lname, side, button, group, cost, level, tags:[..], info, content, kind, ents:[..], soldiers:[..], where, order,
//              commented }   kind: infantry | vehicle | vehicle_group | soldier
//   classify(bl, key) -> { kind:'squad'|'hero'|'vehicle_group'|'entity'|'unlisted', card, side, button, order, notes:[..] }
// Card order = the order the engine lists cards under a button: g_units read order ( walks
//   .items, filtered by button; group g only drives cooldown sharing, not order). Units load
//   /set/multiplayer/units/<game type|class|common>.set; the files are read here in the order common.set
//   units_44-45.set, units_45, units_43, units_42, units_41, then every other units file (vanilla + mod, sorted); a card's first
//   appearance sets its place, later appearances are "also under <side>/<button>".
// Buttons in budget order ({buttons "..."} in set/multiplayer/games/**, first seen), else squad1 squad2 v1 v2 v22 v3 .. v12 sf hero.
// Sides: usa ger rus eng jap ger2 (stock army ids 0-5, modweb mission/mp-units) then the rest alphabetically. A card's side = its
//   (side) name suffix, else the first tag that is a side (the folders under units/ and every (side) suffix seen).
// Commented-out cards (';' lines in units files holding b(..) and a card name) give grouping context only when no live card does;
//   the context line says "card commented out".
// Author: Imperator_Aug (ARSENAL, ia-462f8a0d)
const sdlset = require('../lib/sdlset');

const lc = s => String(s).toLowerCase();
const U = 'resource/set/multiplayer/units/';
const STOCK_SIDES = ['usa', 'ger', 'rus', 'eng', 'jap', 'ger2'];
const DEF_BUTTONS = ['squad1', 'squad2', 'v1', 'v2', 'v22', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'sf', 'hero'];
const FIRST = ['common.set', 'units_44-45.set', 'units_45.set', 'units_43.set', 'units_42.set', 'units_41.set'].map(f => U + f);

const val = it => it ? (it.value !== undefined ? it.value : it.text) : null;
function field(b, name) { const f = b.items.find(x => x.k === 'BLOCK' && x.items[0] && x.items[0].k === 'IDENT' && lc(x.items[0].text) === name); return f ? f : null; }

// content "a:2 b ( crew:2 ) *" -> top-level things and crew
function parseContent(s, breeds) {
  const ents = [], soldiers = [], crew = []; let depth = 0, self = false;
  for (const tok of String(s || '').replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean)) {
    if (tok === '(') { depth++; continue; }
    if (tok === ')') { depth = Math.max(0, depth - 1); continue; }
    const m = /^(.*?)(?::(\d+))?$/.exec(tok), name = lc(m[1]), n = m[2] === undefined ? 1 : +m[2];
    if (depth) { crew.push({ name, n }); continue; }
    if (name === '*') { self = true; continue; }
    if (name.includes('/') || (breeds && breeds.has(name))) soldiers.push({ name, n }); else ents.push({ name, n });
  }
  return { ents, soldiers, crew, self };
}

function read(o) {
  const src = sdlset.createSource({ gameDir: o.gameDir, folder: o.modDir, exe: o.exe });
  const keys = new Set();
  if (src.v) for (const k of src.v.files.keys()) if (k.startsWith(U)) keys.add(k);
  for (const k of src.local.keys()) if (k.startsWith(U)) keys.add(k);
  const order = [...FIRST.filter(k => keys.has(k)), ...[...keys].filter(k => !FIRST.includes(k)).sort()];
  const sideSet = new Set(STOCK_SIDES);
  for (const k of keys) { const m = /^resource\/set\/multiplayer\/units\/([^/]+)\//.exec(k); if (m) sideSet.add(m[1]); }
  const lineOf = new Map();
  const srcLine = (file, line) => { if (!lineOf.has(file)) { const b = src.get(file); lineOf.set(file, b ? b.toString('latin1').split(/\r?\n/) : []); } return lineOf.get(file)[line - 1] || ''; };
  const cards = [], byName = new Map();
  let n = 0;
  for (const k of order) {
    let r; try { r = src.read({ key: k, file: k, get: () => src.get(k) }, () => {}); } catch { r = null; }
    if (!r) continue;
    const walk = (b, inU) => {
      for (const it of b.items || []) {
        if (it.k === 'MOD') { walk(it, inU); continue; }
        if (it.k !== 'BLOCK') continue;
        const f = it.items[0];
        if (f && f.k === 'IDENT' && lc(f.text) === 'units') { walk(it, true); continue; }
        if (!inU || !f || (f.k !== 'STRING' && f.k !== 'IDENT')) { if (!inU) walk(it, false); continue; }
        const name = val(f), ln = lc(name);
        // where: the first place in the macro/include chain whose source line names the card
        const bare = ln.replace(/\([^()]*\)$/, '');
        let where = null;
        for (let x = f, g = 0; x && g < 20; x = x.via, g++) if (x.file && lc(srcLine(x.file, x.line)).includes(bare)) { where = { file: x.file, line: x.line }; break; }
        if (!where) where = { file: f.via ? f.via.file : f.file, line: f.via ? f.via.line : f.line };
        const rec = { name, lname: ln, where, order: n++ };
        const g = (nm) => { const x = field(it, nm); return x ? val(x.items[1]) : null; };
        rec.button = g('button') && lc(g('button')); rec.group = g('group') && lc(g('group'));
        rec.cost = g('cost'); rec.level = g('level'); rec.info = g('info') && lc(g('info'));
        rec.tags = lc(g('tags') || '').split(/\s+/).filter(Boolean);
        rec.content = g('content');
        rec.breed = !!field(it, 'breed');
        let c = byName.get(ln);
        if (c) { c.also.push(rec); for (const kk of ['button', 'group', 'cost', 'level', 'info', 'content']) if (rec[kk] !== null && rec[kk] !== undefined) c[kk] = c[kk] ?? rec[kk]; for (const t of rec.tags) if (!c.tags.includes(t)) c.tags.push(t); continue; }
        rec.also = []; byName.set(ln, rec); cards.push(rec);
      }
    };
    walk(r.root, false);
  }
  // commented-out cards
  const commented = [];
  for (const k of order) {
    const b = src.get(k); if (!b) continue;
    b.toString('latin1').split(/\r?\n/).forEach((L, i) => {
      const m0 = /^\s*;+\s*(.*)$/.exec(L); if (!m0) return;
      const s = m0[1], bt = /\bb\(\s*([^)\s]+)\s*\)/i.exec(s); if (!bt) return;
      const q = /^\{\s*"([^"]+)"/.exec(s), nm = /\bname\(\s*([^)\s]+)\s*\)/i.exec(s), sd = /\b(?:s|side)\(\s*([^)\s]+)\s*\)/i.exec(s);
      if (!q && !nm) return;
      const side = sd ? lc(sd[1]) : null;
      const name = q ? q[1] : (side ? `${nm[1]}(${side})` : nm[1]);
      const gp = /\bg\(\s*([^)\s]+)\s*\)/i.exec(s), cost = /\bcost\(\s*([^)\s]+)\s*\)|\{cost\s+([\d.]+)\}/i.exec(s), info = /\{info\s+"?([^"}\s]+)/i.exec(s);
      commented.push({ name, lname: lc(name), side, button: lc(bt[1]), group: gp ? lc(gp[1]) : null, cost: cost ? (cost[1] || cost[2]) : null, info: info ? lc(info[1]) : null,
        tags: [], content: null, where: { file: k, line: i + 1 }, order: n++, commented: true, also: [] });
    });
  }
  for (const c of cards) { const m = /\(([^()]+)\)$/.exec(c.lname); if (m) sideSet.add(m[1]); }
  const sideOf = c => { const m = /\(([^()]+)\)$/.exec(c.lname); if (m) return m[1]; if (c.side) return c.side; return c.tags.find(t => sideSet.has(t)) || null; };
  for (const c of [...cards, ...commented]) {
    c.side = sideOf(c);
    const p = parseContent(c.content, o.breeds);
    c.ents = p.ents; c.soldiers = [...p.soldiers, ...p.crew]; c.topSoldiers = p.soldiers;
    if (c.breed) c.kind = 'soldier';
    else if (!p.ents.length) c.kind = p.self || (!c.content && !c.commented && !p.soldiers.length) ? 'vehicle' : 'infantry';
    else if (p.ents.length === 1 && p.ents[0].name === c.lname && !p.soldiers.length) c.kind = 'vehicle';
    else c.kind = 'vehicle_group';
    if (c.commented && !c.content) c.kind = 'unknown';
  }
  for (const c of cards) for (const a of c.also) a.side = sideOf(a);
  // buttons in budget order
  const buttons = [];
  const gk = [...(src.v ? src.v.files.keys() : []), ...src.local.keys()].filter(k => k.startsWith('resource/set/multiplayer/games/')).sort();
  for (const k of [...new Set(gk)]) { const b = src.get(k); if (!b) continue; for (const m of b.toString('latin1').matchAll(/\{\s*buttons\s+"([^"]*)"/gi)) for (const t of lc(m[1]).split(/\s+/).filter(Boolean)) if (!buttons.includes(t)) buttons.push(t); }
  for (const t of DEF_BUTTONS) if (!buttons.includes(t)) buttons.push(t);
  for (const c of cards) if (c.button && !buttons.includes(c.button)) buttons.push(c.button);
  const seenSides = new Set([...cards, ...commented].map(c => c.side).filter(Boolean));
  const sides = [...STOCK_SIDES.filter(s => seenSides.has(s)), ...[...seenSides].filter(s => !STOCK_SIDES.includes(s)).sort()];
  if (src.v) require('../lib/vfs').closeRecs();
  // index: info key -> cards (live first, buy-list order)
  const ref = new Map();
  const add = (k, c, note) => { if (!ref.has(k)) ref.set(k, []); ref.get(k).push({ c, note }); };
  for (const c of [...cards, ...commented]) {
    if (c.kind === 'soldier') continue;
    if (c.info) { add('info/squad/' + c.info, c, `{info ${c.info}}`); add('info/entity/' + c.info, c, `{info ${c.info}}`); }
    else add('info/squad/' + c.lname, c, null);
    if (c.kind === 'vehicle' && !c.info) add('info/entity/' + c.lname, c, null);
  }
  // desc grouping: entity -> cards that carry it in {content}; breed -> cards that hold that soldier (live, buy button, read order)
  const eref = new Map(), breedCards = new Map();
  for (const c of [...cards, ...commented]) {
    if (c.kind === 'soldier') continue;
    for (const e of c.ents || []) { if (!eref.has(e.name)) eref.set(e.name, []); const a = eref.get(e.name); if (!a.some(r => r.c === c)) a.push({ c, note: `in {content} of card "${c.name}"` }); }
    if (c.commented || !(c.button || c.also.some(a => a.button))) continue;
    for (const s of c.soldiers || []) { if (!breedCards.has(s.name)) breedCards.set(s.name, []); const a = breedCards.get(s.name); if (!a.includes(c)) a.push(c); }
  }
  return { cards, commented, buttons, sides, ref, eref, breedCards, byName };
}

// soldier names that read as vehicle crew: a card of one vehicle + these = a copy of that vehicle [I]
const CREW = /supporter|crew|tank_?man|tankcommander|driver|gunner|pilot/i;

function classify(bl, key) {
  const k0 = lc(key), m = /^(?:info|desc)\/(squad|entity)\/(.+)$/.exec(k0);
  if (!m) return null;
  const k = `info/${m[1]}/${m[2]}`;   // desc/squad|entity keys group like the info key of the same name
  let refs = bl.ref.get(k) || [], notes = [];
  if (k0.startsWith('desc/') && m[1] === 'entity') for (const r of bl.eref.get(m[2]) || []) if (!refs.some(x => x.c === r.c)) refs = [...refs, r];
  if (!refs.length && m[1] === 'squad') {   // key name(side), card bare-named (vehicle-ish macros)
    const bare = m[2].replace(/\(([^()]*)\)$/, '');
    if (bare !== m[2]) { refs = (bl.ref.get('info/squad/' + bare) || []); if (refs.length) notes.push(`card is "${bare}" (bare name; engine looks up info/squad/${bare})`); }
  }
  if (!refs.length) return { kind: 'unlisted', group: m[1], notes };
  // cards with no {button} (e.g. "extra" call-in cards) are loaded but never listed under a buy-list button
  const onList = r => !!(r.c.button || r.c.also.some(a => a.button));
  const listed = refs.filter(onList);
  if (!listed.length) {
    const r0 = refs[0].c;
    notes.push(`only on card "${r0.name}" without a buy button (${r0.where.file.replace(/^resource\/set\/multiplayer\//, '')}:${r0.where.line}), not in any buy list`);
    return { kind: 'unlisted', group: m[1], notes };
  }
  refs = listed;
  const live = refs.filter(r => !r.c.commented), use = live.length ? live : refs;
  const hero = use.find(r => r.c.button === 'hero' || r.c.also.some(a => a.button === 'hero'));
  const first = hero || use[0], c = first.c;
  if (first.note) notes.push(first.note);
  if (c.commented) notes.push('card commented out');
  const places = [];
  for (const r of use) for (const p of [r.c, ...r.c.also]) { if (!p.button) continue; const s = `${p.side || '?'}/${p.button || '?'}`; if (!places.includes(s)) places.push(s); }
  const here = `${c.side || '?'}/${c.button || '?'}`;
  const others = places.filter(p => p !== here);
  if (others.length) notes.push('also under ' + others.join(', '));
  if (use.length > 1) notes.push('cards ' + use.map(r => r.c.name).slice(0, 4).join(', ') + (use.length > 4 ? ` +${use.length - 4}` : ''));
  if (c.kind === 'vehicle_group' && c.ents.length === 1 && !c.topSoldiers.length && c.soldiers.every(x => CREW.test(x.name))) notes.push(`copy of ${c.ents[0].name} (with crew)`);
  let kind;
  if (hero) kind = 'hero';
  else if (m[1] === 'squad' && c.kind === 'vehicle_group') kind = 'vehicle_group';
  else kind = m[1] === 'squad' ? 'squad' : 'entity';
  return { kind, group: m[1], card: c, side: c.side || 'noside', button: c.button || 'nobutton', order: c.order, notes, heroVg: !!hero && c.kind === 'vehicle_group' };
}

// "; [new] card "x" cost 84 lvl 1 | soldiers a x4, b | vehicles guzzi-sa500 x8 | tags .. | units/ger/squads_44.set:4 | notes"
function contextLine(cl, cat) {
  const mark = cat === 'C' ? '[changed]' : cat === 'V' ? '[vanilla]' : '[new]';
  if (!cl || !cl.card) return `; ${mark} no buy-list card names this key${cl && cl.notes.length ? ' | ' + cl.notes.join('; ') : ''}`;
  const c = cl.card, parts = [`card "${c.name}"${c.cost !== null && c.cost !== undefined ? ' cost ' + c.cost : ''}${c.level !== null && c.level !== undefined ? ' lvl ' + c.level : ''}`];
  const sum = arr => { const m = new Map(); for (const x of arr) if (!String(x.name).includes('%')) m.set(x.name, (m.get(x.name) || 0) + x.n); return [...m].map(([nm, n]) => nm.replace(/^mp\/[^/]+\//, '') + (n > 1 ? ' x' + n : '')).join(', '); };
  if (c.soldiers && c.soldiers.length) parts.push('soldiers ' + sum(c.soldiers));
  if (c.ents && c.ents.length) parts.push('vehicles ' + sum(c.ents));
  const tags = (c.tags || []).filter(t => t !== c.side && t !== 'frontline_cp' && !t.includes('%'));
  if (tags.length) parts.push('tags ' + tags.join(' '));
  parts.push(c.where.file.replace(/^resource\/set\/multiplayer\//, '') + ':' + c.where.line);
  if (cl.notes.length) parts.push(cl.notes.join('; '));
  let s = `; ${mark} ` + parts.join(' | ');
  s = s.replace(/[^\x20-\x7e]/g, '?');
  return s.length > 400 ? s.slice(0, 397) + '...' : s;
}

// desc/human/<breed> context: the first buy-list card holding the breed. Exact breed path first; a card naming the soldier by
// bare name (no folder) counts when the name and the side folder match [I]
function humanLine(bl, breed, cat) {
  const b = lc(breed), mark = cat === 'C' ? '[changed]' : cat === 'V' ? '[vanilla]' : '[new]';
  let cs = bl.breedCards.get(b) || [];
  if (!cs.length) { const base = b.slice(b.lastIndexOf('/') + 1), sd = b.split('/')[1]; cs = (bl.breedCards.get(base) || []).filter(c => !sd || c.side === sd); }
  if (!cs.length) return `; ${mark} not in any buy-list card`;
  const c = cs[0];
  let s = `; ${mark} first in card "${c.name}" ${c.side || '?'}/${c.button || '?'}${c.cost !== null && c.cost !== undefined ? ' cost ' + c.cost : ''} | ${c.where.file.replace(/^resource\/set\/multiplayer\//, '')}:${c.where.line}${cs.length > 1 ? ` | in ${cs.length} cards` : ''}`;
  return s.replace(/[^\x20-\x7e]/g, '?');
}

module.exports = { read, classify, contextLine, humanLine, parseContent };
