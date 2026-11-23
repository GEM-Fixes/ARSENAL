// Units page, Equipment card: a soldier's inventory as the grid of cells the game shows. Pure helpers (no GUI ctx): the caller
// passes a reader. Engine facts (as64 source, paths from the repo root):
// - the box: {extender "inventory" {box {Size w h}{Weight W}}} of the human, resource/properties/human.ext: 6 x 10 cells, cell
//   weight 100 in Assault Squad 2, 8 x 12 and 100 in Gates of Hell [V real data]
// - an item's cells: stuff {inventory {size w h}{weight f}}; a stuff inherits both from its {from "tags"} parent, field by field
//  ; a stuff that names neither is 2 x 2 with weight 1 [V]
// - a breed item {item "tags" [n [dev]] [filled [N] | filling "tags" n]}: stuff found by tags (a file's
//   tags are its name split on "." [I: which of several matches wins is the engine's list order; here the exact name, else the
//   first by path]); count = (int)(n + 0.5), 1 when absent; with a spread (dev) the game rolls the count per soldier:
//   n + dev * r, r even between -1 and 1 (ends not reached), then (int)(.. + 0.5); a roll of 0 puts nothing in
//   [V]. This page shows the least and the most (range) and lays out the most; the editor
//   takes the centre. A roll under 0 counted as 0 [I]
// - nothing held: inHands starts at -1 and the file's {in_hands} line is the only thing that sets it (;
//   written back only when >= 0), so a breed without the line starts with empty hands [V]
// - an item's name in the game: {desc "key"} of the stuff, else desc/<ammo|weapon|stuff>/<file-name tags without grenade,
//   pattern, ammo, weapon> [V]; nameKeys gives the keys to look up
// - fill rule, one breed line after the other ( -> PutInto):
//   first into the stacks of the same stuff with the same filling, in cell order, as far as a cell takes
//   (floor(cell weight / item weight) per stack); the rest onto the first
//   free place, rows top to bottom, cells left to right (called without rearrange); what finds no place
//   is dropped without a word (PutWhole deletes it) [V]. The tag "stackable" plays no part in this rule [V]
// - {in_hands idx}: 0-based among the {item} lines; the item goes to the right hand and keeps its cells (drawn with the holder
//   picture) [V]
// - item pictures: the game has no icon file per item. It renders the item's 3D model ({entity "name"} of the stuff, an entity
//   under entity/inventory) into a picture when the inventory opens [V]. So this page names
//   the model and the 3D view of the Models page renders it once into the tile's picture (viewer snapshot)
// Gates of Hell: same keys and the same breed form (set/breed/mp/<army>/<period>/<name>.set), read from the GoH data [V real
// data]; the fill code of the GoH exe was not read (gohweb GHGPL-25 names a FitCounts that walks row by row) [I]
// Author: Imperator_Aug (ARSENAL, ia-e79124bb)
const lc = s => String(s == null ? '' : s).toLowerCase();

// ---------- a small reader of the game's brace text ----------
// {name args.. {kids}}; ( .. ) calls and includes are kept as kids named '(' so a caller can see there was one. ; starts a comment
function parse(text) {
  const s = String(text || ''), n = s.length, root = { name: '', args: [], kids: [] }, stack = [root];
  let i = 0, par = 0;
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') {
      let j = i + 1; while (j < n && s[j] !== '"') j++;
      if (!par) { const top = stack[stack.length - 1]; if (top.name === '' && top !== root && !top.named) { top.name = lc(s.slice(i + 1, j)); top.named = true; } else top.args.push(s.slice(i + 1, j)); }
      i = j + 1; continue;
    }
    if (c === '(') { if (!par) stack[stack.length - 1].kids.push({ name: '(', args: [], kids: [] }); par++; i++; continue; }
    if (c === ')') { if (par) par--; i++; continue; }
    if (par) { i++; continue; }
    if (c === '{') { const b = { name: '', args: [], kids: [], named: false }; stack[stack.length - 1].kids.push(b); stack.push(b); i++; continue; }
    if (c === '}') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let j = i; while (j < n && !/[\s{}()";]/.test(s[j])) j++;
    const w = s.slice(i, j), top = stack[stack.length - 1];
    if (top !== root) { if (!top.named) { top.name = lc(w); top.named = true; } else top.args.push(w); }
    i = j;
  }
  return root;
}
const kid = (b, name) => (b ? b.kids : []).find(k => k.name === name) || null;

// ---------- the stuff table ----------
const STUFF = 'resource/set/stuff/';
const WEAPON_DIRS = ['pistol', 'smg', 'rifle', 'mgun', 'bazooka', 'flame', 'reactive', 'mortar', 'melee'];
// folders a soldier does not carry (vehicle guns and their shells, air bombs, liquids): left out of the Add list, not refused
const NOT_CARRIED = ['gun', 'shell', 'bombing', 'content', 'dummy_checker', '_settings'];
// folders left out of a vehicle's Add list (a vehicle's box holds shells; its slots hold guns)
const NOT_VEHICLE = ['bombing', 'content', 'dummy_checker', '_settings'];
function kindOf(e) {
  if (e.tags.includes('ammo')) return 'ammo';
  if (e.top === 'grenade' || e.tags.includes('grenade')) return 'grenade';
  if (WEAPON_DIRS.includes(e.top) || e.tags.includes('weapon')) return 'weapon';
  return 'other';
}
// the heading an item stands under in the equipment browser of the page. From the game data, the same rule for every game:
// ammunition and grenades by kind (the file's tags), the rest by its folder under set/stuff (real data of Assault Squad 2 and
// Gates of Hell use the same folder names [V]); a folder this list does not know (a mod's own) falls back to the item's tags,
// then to "other weapons" / "other". The order here is the order on the page
const HEADINGS = ['rifle', 'smg', 'mgun', 'pistol', 'antitank', 'flame', 'heavy', 'melee', 'gun', 'weapon', 'grenade', 'explosive', 'ammo', 'medical', 'tools', 'headgear', 'gear', 'container', 'other'];
const HEAD_OF = { rifle: 'rifle', smg: 'smg', mgun: 'mgun', pistol: 'pistol', bazooka: 'antitank', flame: 'flame', mortar: 'heavy', reactive: 'heavy', melee: 'melee', gun: 'gun',
  explosive: 'explosive', med: 'medical', special: 'tools', head: 'headgear', body: 'gear', capacity: 'container' };
function headingOf(st) {
  if (st.kind === 'ammo') return 'ammo';
  if (st.kind === 'grenade') return 'grenade';
  if (HEAD_OF[st.top]) return HEAD_OF[st.top];
  for (const t of st.all || st.tags || []) if (HEAD_OF[t]) return HEAD_OF[t];
  return st.kind === 'weapon' ? 'weapon' : 'other';
}
// read(key) -> latin1 text | null; keys = every file key under resource/set/stuff/. tick() may yield (async callers)
async function buildTable(keys, read, tick) {
  const raw = [];
  let n = 0;
  for (const key of keys.slice().sort()) {
    const rel = key.slice(STUFF.length), base = rel.split('/').pop();
    if (!key.startsWith(STUFF) || base.startsWith('.') || /\.fsm$/.test(base)) continue;
    const text = read(key); if (text == null) continue;
    if (tick && ++n % 150 === 0) await tick();
    const root = parse(text).kids.find(k => k.name !== '(');
    if (!root) continue;
    const inv = kid(root, 'inventory'), size = kid(inv, 'size'), wt = kid(inv, 'weight'), ent = kid(root, 'entity'), fill = kid(root, 'filling'), desc = kid(root, 'desc');
    const e = { key, base, top: rel.includes('/') ? rel.split('/')[0] : '', dir: rel.slice(0, rel.length - base.length), tags: base.split('.').filter(Boolean).map(lc),
      from: root.name === 'from' ? lc(root.args[0] || '').split(/\s+/).filter(Boolean) : null, type: root.name === 'from' ? null : root.name,
      extra: root.kids.filter(k => k.name === 'tag').map(k => lc(k.args.join(' '))).join(' ').split(/\s+/).filter(Boolean) };
    if (size && size.args.length >= 2 && isFinite(+size.args[0]) && isFinite(+size.args[1])) { e.w = Math.trunc(+size.args[0]); e.h = Math.trunc(+size.args[1]); }
    if (wt && isFinite(+wt.args[0])) e.weight = +wt.args[0];
    if (ent && ent.args[0]) e.entity = ent.args[0];
    if (fill && fill.args[0]) e.filling = { tags: lc(fill.args[0]).split(/\s+/).filter(Boolean), mag: fill.args[1] != null && isFinite(+fill.args[1]) ? +fill.args[1] : 1, max: fill.args[2] != null && isFinite(+fill.args[2]) ? +fill.args[2] : null };
    if (desc && desc.args[0]) e.desc = desc.args[0];
    e.macro = root.kids.some(k => k.name === '(');
    raw.push(e);
  }
  // inheritance: each field from the nearest file of the {from} chain that names it (a parent in the same folder first)
  const find = tags => {
    const hits = raw.filter(x => tags.every(t => x.tags.includes(t)));
    return { hits, exact: hits.filter(x => x.tags.length === tags.length) };
  };
  const out = [];
  for (const e of raw) {
    const o = { key: e.key, name: e.tags.join(' '), tags: e.tags, top: e.top, pattern: e.tags.includes('pattern'), all: e.tags.concat(e.extra) };
    let cur = e;
    for (let d = 0; d < 10 && cur; d++) {
      if (o.w == null && cur.w != null) { o.w = cur.w; o.h = cur.h; }
      if (o.weight == null && cur.weight != null) o.weight = cur.weight;
      if (o.entity == null && cur.entity) o.entity = cur.entity;
      if (o.filling == null && cur.filling) o.filling = cur.filling;
      if (o.type == null && cur.type) o.type = cur.type;
      if (o.desc == null && cur.desc) o.desc = cur.desc;
      if (cur !== e) for (const t of cur.extra) if (!o.all.includes(t)) o.all.push(t);
      if (!cur.from) break;
      const f = find(cur.from), here = cur, same = a => a.find(x => x.dir === here.dir && x !== here);
      cur = same(f.exact) || f.exact.find(x => x !== here) || same(f.hits) || f.hits.find(x => x !== here) || null;
    }
    // sized: the files name the size; false = the engine default 2 x 2 (or a size that comes from a ( ) call this reader does not expand)
    o.sized = o.w != null; if (!o.sized) { o.w = 2; o.h = 2; }
    if (o.weight == null) o.weight = 1;
    o.stackable = o.all.includes('stackable');
    o.kind = kindOf(e); o.macro = e.macro;
    out.push(o);
  }
  return out;
}
// the stuff a breed line names: every tag of the line in the file's name tags, else in its name + {tag} tags; patterns never
function findItem(table, item) {
  const want = lc(item).trim().split(/\s+/).filter(Boolean); if (!want.length) return null;
  const pool = table.filter(x => !x.pattern);
  const a = pool.filter(x => want.every(t => x.tags.includes(t)));
  const exact = a.find(x => x.tags.length === want.length);
  if (exact) return exact;
  if (a.length) return a[0];
  return pool.find(x => want.every(t => x.all.includes(t))) || null;
}

// ---------- the human's box ----------
const BOX_FILE = 'resource/properties/human.ext';
const BOX_DEFAULT = { as64: { w: 6, h: 10, weight: 100 }, mowas2: { w: 6, h: 10, weight: 100 }, goh: { w: 8, h: 12, weight: 100 } };
function boxOf(text, gid) {
  const d = BOX_DEFAULT[gid] || BOX_DEFAULT.as64, out = { w: d.w, h: d.h, weight: d.weight, file: null };
  if (text == null) return out;
  const walk = b => { for (const k of b.kids) { if (k.name === 'extender' && lc(k.args[0]) === 'inventory') return kid(k, 'box'); const r = walk(k); if (r) return r; } return null; };
  const box = walk(parse(text)); if (!box) return out;
  const s = kid(box, 'size'), w = kid(box, 'weight');
  if (s && +s.args[0] > 0 && +s.args[1] > 0) { out.w = Math.trunc(+s.args[0]); out.h = Math.trunc(+s.args[1]); out.file = BOX_FILE; }
  if (w && +w.args[0] > 0) out.weight = +w.args[0];
  return out;
}

// ---------- a breed's inventory lines ----------
// the counts a line can give: without a spread always (int)(n + 0.5); with one the game rolls n + dev * r for each soldier, r even
// in the open range -1..1, so the least is floor(n - dev + 0.5) and the most is the whole number just under n + dev + 0.5
// ( [V]; under 0 counted as 0 [I])
function range(n, dev) {
  const c = n == null ? 1 : n, d = Math.abs(dev || 0);
  if (d < 1e-5) { const k = Math.max(0, Math.trunc(c + 0.5)); return { min: k, max: k, varies: false }; }
  const min = Math.max(0, Math.floor(c - d + 0.5)), max = Math.max(0, Math.ceil(c + d + 0.5) - 1);
  // chance: how often the soldier gets at least one (a line like {item "x" 0.5 0.5} is a 50 % item): the share of the rolled
  // range n - dev .. n + dev that lies at 0.5 or above. Only said when the count can be 0
  const out = { min, max, varies: max !== min };
  if (out.varies && min === 0) out.chance = Math.min(1, Math.max(0, (c + d - 0.5) / (2 * d)));
  return out;
}
// the text keys of a stuff's name in the game, the most likely first: its own {desc}, then desc/<kind>/<name> as the engine
// builds it (kind from every tag: ammo, else weapon, else stuff; name = the file-name tags without grenade, pattern, ammo, weapon),
// then the same name under the other kinds (real data has a few filed so)
function nameKeys(st) {
  if (!st) return [];
  const out = [], push = k => { if (k && !out.includes(k)) out.push(k); };
  if (st.desc) push(st.desc);
  const name = st.tags.filter(t => !['grenade', 'pattern', 'ammo', 'weapon'].includes(t)).join(' ');
  const kind = st.all.includes('ammo') ? 'ammo' : st.all.includes('weapon') ? 'weapon' : 'stuff';
  if (name) for (const k of [kind, 'weapon', 'stuff', 'ammo']) push('desc/' + k + '/' + name);
  return out;
}
// -> {found, items:[{item, n (as written, absent = 1), count (centre), dev, min, max, varies, filled, filledN,
//     filling:{tags,count}|null, macro: true = the line comes from an include or a macro call (a text written out by lib/breedflat
//     with marks), not from the soldier file itself}], inHands: index|null, calls: true when the block holds a ( ) call or include
//     whose lines are not read here (a text that was not written out)}
function readBreed(text) {
  const br = kid(parse(text), 'breed'), inv = kid(br, 'inventory'), out = { found: !!br, hasInventory: !!inv, items: [], inHands: null, calls: false };
  if (!inv) return out;
  for (const k of inv.kids) {
    if (k.name === '(') { out.calls = true; continue; }
    if (k.name === 'in_hands') { if (/^\d+$/.test(k.args[0] || '')) out.inHands = +k.args[0]; continue; }
    if (k.name !== 'item') continue;
    const a = k.args.slice(), it = { item: lc(a.shift() || '').trim().replace(/\s+/g, ' '), count: 1, dev: 0, filled: false, filledN: null, filling: null };
    if (a.length && isFinite(+a[0])) { it.n = +a.shift(); it.count = Math.trunc(it.n + 0.5); if (a.length && isFinite(+a[0])) it.dev = Math.abs(+a.shift()); }
    const mode = lc(a.shift() || '');
    if (mode === 'filled') { it.filled = true; if (a.length && isFinite(+a[0])) it.filledN = +a[0]; }
    else if (mode === 'filling') it.filling = { tags: lc(a[0] || '').trim().replace(/\s+/g, ' '), count: isFinite(+a[1]) ? +a[1] : 0 };
    Object.assign(it, range(it.n, it.dev));
    if (k.kids.some(x => x.name === '__macro')) it.macro = true;
    out.items.push(it);
  }
  // an index past the last line holds nothing (the engine checks the bounds)
  if (out.inHands != null && !out.items[out.inHands]) out.inHands = null;
  return out;
}

// ---------- the pending edit of the page ----------
// pending {add:[{item, count?, spread?, filled?, rounds? (a number | 'full'), filling?}], del:[item], inHands?: item | false} -> the list after the
// edit, as gen's kit op makes it (tools/gen/lib/ops-unit.js kitEdit):
// - deleted lines go; a new item is a new last line
// - an item the soldier has once keeps its line: the parts the entry names are set (count, spread, filled true/false, rounds,
//   filling "tags"), the rest of the line stays
// - inHands: an item = that line is held (it does not move); false = nothing held; absent = the held line stays held. When the
//   held line is removed and nothing else is named, the next weapon after it in the list is held (else the first weapon, else
//   nothing): handover {from, to | null}
// kindOfItem(item) -> 'weapon' | .. (the stuff table's kind); without it nothing counts as a weapon
// -> {items, inHands, spec:{add, del, in_hands?}, touched:[item], handover | null, why: refusal | null}
const norm = x => lc(x).trim().replace(/\s+/g, ' ');
function applyPending(cur, pending, kindOfItem) {
  const p = pending || {}, del = (Array.isArray(p.del) ? p.del : []).map(norm).filter(Boolean);
  const add = (Array.isArray(p.add) ? p.add : []).map(a => (typeof a === 'string' ? { item: a } : a || {}));
  let items = cur.items.map(x => Object.assign({}, x, { filling: x.filling ? Object.assign({}, x.filling) : null }));
  const order = items.slice(), held = cur.inHands != null && items[cur.inHands] ? items[cur.inHands] : null;
  const spec = { add: [], del: [] }, touched = [], fresh = [];
  for (const d of del) {
    if (!items.some(x => x.item === d)) return { why: 'The soldier does not carry "' + d + '", so it cannot be removed.' };
    items = items.filter(x => x.item !== d); spec.del.push(d);
  }
  const num = v => /^\d+(\.\d+)?$/.test(String(v).trim());
  const key = h => JSON.stringify([h.n === undefined ? null : h.n, h.dev || 0, !!h.filled, h.filledN, h.filling]);
  for (const a of add) {
    // rounds: 'full' = a loaded weapon starts with all its own ammunition holds (the N of "filled N" goes)
    const item = norm(a.item), full = a.rounds === 'full', has = k => a[k] !== undefined && a[k] !== null && a[k] !== '' && !(k === 'rounds' && full);
    if (!item || /["{}()]/.test(item)) return { why: 'An item name is made of letters, digits, _ and spaces (for example "grenade f1").' };
    if (has('count') && !(num(a.count) && +a.count <= 9999)) return { why: 'The count of "' + item + '" must be a number from 0 to 9999.' };
    if (has('spread') && !(num(a.spread) && +a.spread <= 9999)) return { why: 'The spread of "' + item + '" must be a number from 0 to 9999 (0 = the count never varies).' };
    if (has('rounds') && !(/^\d+$/.test(String(a.rounds).trim()) && +a.rounds >= 1 && +a.rounds <= 99999)) return { why: 'The rounds loaded in "' + item + '" must be a whole number from 1 up.' };
    const have = items.filter(x => x.item === item);
    if (fresh.includes(item)) return { why: '"' + item + '" is in the list of new items twice. Give it once with a count.' };
    if (have.length > 1) return { why: 'The soldier has ' + have.length + ' lines of "' + item + '". Remove it here first, then add it once with the count.' };
    const isNew = !have.length, h = isNew ? { item, count: 1, dev: 0, filled: false, filledN: null, filling: null, isNew: true } : have[0], was = key(h);
    if (has('count')) h.n = +a.count;
    if (has('spread')) h.dev = +a.spread;
    const tags = typeof a.filling === 'string' ? norm(a.filling) : '';
    if (tags) {
      if (/["{}()]/.test(tags)) return { why: 'The ammunition loaded in "' + item + '" is named like an item (for example "ammo mp40").' };
      if (a.filled === true) return { why: '"' + item + '" is loaded with its own ammunition or with the ammunition you name, not both.' };
      const r = has('rounds') ? +a.rounds : (h.filling ? h.filling.count : null);
      if (r == null) return { why: 'Say how many rounds of "' + tags + '" are loaded in "' + item + '".' };
      h.filling = { tags, count: r }; h.filled = false; h.filledN = null;
    } else if (a.filled === true) { h.filledN = full ? null : has('rounds') ? +a.rounds : (h.filled ? h.filledN : null); h.filled = true; h.filling = null; }
    else if (a.filled === false || a.filling !== undefined) { h.filled = false; h.filledN = null; h.filling = null; }
    else if (full && h.filled) h.filledN = null;
    else if (has('rounds')) {
      if (h.filling) h.filling.count = +a.rounds; else if (h.filled) h.filledN = +a.rounds;
      else return { why: '"' + item + '" is not loaded, so it has no rounds to set. Load it first.' };
    }
    if (h.dev > 0 && h.n === undefined) h.n = 1;
    const n = h.n === undefined ? 1 : h.n;
    if (!(h.dev > 0) && !(Number.isInteger(n) && n >= 1)) return { why: 'The count of "' + item + '" must be a whole number from 1 up. A count with a fraction, or 0, needs a spread (then the game rolls the count for each soldier). To carry none, remove the item.' };
    h.count = Math.trunc(n + 0.5); Object.assign(h, range(h.n, h.dev));
    if (isNew) { items.push(h); fresh.push(item); }
    if (!isNew && key(h) === was) continue;
    // the whole line in the op's words: the op keeps the text of every part that did not change
    const s = { item };
    if (h.n !== undefined) s.count = h.n;
    if (!isNew || h.dev > 0) s.spread = h.dev || 0;
    if (h.filling) { s.filling = h.filling.tags; s.rounds = h.filling.count; }
    else if (h.filled) { s.filled = true; if (h.filledN != null) s.rounds = h.filledN; }
    else if (!isNew) s.filled = false;
    spec.add.push(s); touched.push(item);
  }
  // lines an include or a macro supplies are not in the soldier file: they are not changed here, and with them in the list the
  // file's own line numbers differ from the game's, so nothing is removed and the held item stays (new items go to the end)
  const MAC = 'Part of this equipment comes from a shared line of the soldier file (a macro or an include). ';
  const mac = cur.items.find(x => x.macro && touched.includes(x.item));
  if (mac) return { why: MAC + '"' + mac.item + '" is one of those items, so it is changed in the shared file, not here.' };
  if (cur.items.some(x => x.macro) && spec.del.length) return { why: MAC + 'Items can be added here; to remove one, edit the soldier file.' };
  const first = name => items.findIndex(x => x.item === name), weapon = x => !!kindOfItem && kindOfItem(x.item) === 'weapon';
  let inHands = null, handover = null;
  if (p.inHands === false) { if (held) spec.in_hands = false; }
  else if (p.inHands != null && p.inHands !== '') {
    const want = norm(p.inHands); inHands = first(want);
    if (inHands < 0) return { why: 'The item to hold, "' + want + '", is not in the inventory. Add it first.' };
    if (!(held && items.indexOf(held) === inHands)) spec.in_hands = want;
  } else if (held && items.includes(held)) inHands = items.indexOf(held);
  else if (held) {
    const next = order.slice(order.indexOf(held) + 1).find(x => items.includes(x) && weapon(x)) || items.find(weapon) || null;
    handover = { from: held.item, to: next ? next.item : null };
    if (next) { inHands = first(next.item); spec.in_hands = next.item; } else spec.in_hands = false;
  }
  if (cur.items.some(x => x.macro) && spec.in_hands !== undefined) return { why: MAC + 'The held item is set in the soldier file, not here.' };
  return { items, inHands: inHands != null && inHands >= 0 ? inHands : null, spec, touched, handover, why: null };
}

// ---------- the engine's fill ----------
// items [{item, count, filled, filledN, filling}] in breed order -> {pieces:[{x,y,w,h,count,items:[index],stuff}], left:[{index,count}]}
function fill(box, table, items) {
  const W = box.w, H = box.h, grid = new Array(W * H).fill(-1), pieces = [], left = [], rows = [];
  const at = (x, y) => grid[y * W + x];
  items.forEach((it, index) => {
    const st = findItem(table, it.item);
    const w = st ? st.w : 2, h = st ? st.h : 2, weight = st ? st.weight : 1;
    const row = { index, known: !!st, w, h, placed: 0, left: 0, cells: [] }; rows.push(row);
    let n = it.max != null ? it.max : it.count;   // a count the game rolls: the most it can be, so every one has its place
    if (!(n > 0)) return;
    // what the stack carries inside (a loaded magazine): two stacks merge only with the same filling stuff and count
    const fk = it.filled ? 'filled:' + (it.filledN != null ? it.filledN : '') : it.filling ? it.filling.tags + ':' + it.filling.count : '';
    const sk = (st ? st.key : 'unknown:' + it.item) + '|' + fk;
    const room = weight > 0 ? Math.floor(box.weight / weight) : 1e9;
    const put = (p, c) => { p.count += c; if (!p.items.includes(index)) p.items.push(index); row.placed += c; n -= c; if (!row.cells.some(q => q.x === p.x && q.y === p.y)) row.cells.push({ x: p.x, y: p.y }); };
    if (w < 1 || h < 1) { row.noCells = true; row.placed = n; return; }
    // 1. into the stacks already there, in cell order
    for (const p of pieces.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (n <= 0) break;
      if (p.sk !== sk) continue;
      const c = Math.min(n, room - p.count); if (c > 0) put(p, c);
    }
    // 2. onto the first free place, rows top to bottom
    while (n > 0 && room > 0) {
      let spot = null;
      for (let y = 0; y <= H - h && !spot; y++) for (let x = 0; x <= W - w && !spot; x++) {
        let free = true;
        for (let yy = y; yy < y + h && free; yy++) for (let xx = x; xx < x + w; xx++) if (at(xx, yy) !== -1) { free = false; break; }
        if (free) spot = { x, y };
      }
      if (!spot) break;
      const p = { x: spot.x, y: spot.y, w, h, count: 0, items: [], sk, stuff: st ? st.name : it.item }; pieces.push(p);
      for (let yy = p.y; yy < p.y + h; yy++) for (let xx = p.x; xx < p.x + w; xx++) grid[yy * W + xx] = pieces.length - 1;
      put(p, Math.min(n, room));
    }
    if (n > 0) { row.left = n; left.push({ index, count: n }); }
  });
  pieces.forEach(p => { delete p.sk; });
  return { pieces, left, rows };
}

// ---------- a vehicle's inventory and weapon slots ----------
// Engine facts (as64 source, paths from the repo root):
// - a vehicle's inventory is {extender "inventory" ..} of its entity file, read block by block in file order, includes and
//   ( ) calls expanded: {box ..} is the box, any other block is a holder named by its type, {<type> "name" ..}; a holder of a
//   name read before is read on top of the first one [V]. Holder types the engine
//   knows: weapon, armor, hand_left, hand_right (,
// ) [V]
// - THE MASK: {mask ["clear"] "tags" ..} inside a holder block is the holder's tag list; each
//   read adds its tags, the word clear empties the list first [V]. When the player uses an item
//   count 1 in a vehicle's inventory, the engine walks the weapon places in order and puts the item into the first place whose
//   holder mask is not empty and whose every tag the item has (stuff all-tags = file-name tags + {tag} lines, own and inherited:
//   ); what was mounted goes back into the box; a holder with an empty mask takes nothing and the
//   game writes a warning [V]. A weapon holder belongs to the weapon place
//   of its own name [V]
// - the box: {box {Size w h}{Weight W}{clear}{item ..}}; an item line is {item "tags" ["tags" ..] [n] [filled | filling "tags" [n]]
//   {cell x y} {user "holder"}}: n is a whole number (1 when absent), filled = one load of the item's own ammunition, {user} names
//   the holder the item starts in (the weapon is mounted when the vehicle spawns), {cell} its place (when it does not fit there
//   the item goes to the first free place) (,
//) [V]. {user} is not checked against the mask: the item is put into the holder as it is
//   [V]; this page still offers only what the mask takes, so a player can mount it again
// - a weapon fixed in the vehicle: {Weaponry {place "name" {weapon "tags" [filled | filling "tags" n]}}}; the place owns that weapon
//   [V] and an item sent to its holder is turned away with a warning
//   [V]. So a fixed place has no mask to ask: the file names its weapon
// - a mounted item keeps its cells in the box [I: as an item in a soldier's hand does]
// - soldiers: human.ext gives every soldier the holders hand_left, hand_right (no mask) and armor "head" {mask "head"}, armor "body"
//   {mask "body"} (Gates of Hell also armor "accessories" {mask "head2"}) [V real data]; the soldier file fills them with
//   {armors {head <item>} {body <item>}} [V]; in the game an item
//   with the tag head / body goes into that holder when used [V]
// Gates of Hell: the same blocks in its data ({weapon "mgun" {mask "mountable"}} in properties/vehicle.ext and the vehicle files,
// {item .. {user "mgun"}}) [V real data]; the GoH exe was not read for this [I]
// open(key) -> Buffer | null (game + mod view). -> {found, box {w, h, weight, file}, items [..], holders [..], places [..]}
//   item: {item, count, filled, filling {tags, count} | null, user, cell, file, line, own}; own = written in the vehicle's own file
//   (not in an included file and not by a ( ) call), so this page can change the line
//   holder: {type, name, mask [tags], file, line, bone}   place: {name, type, weapon {item, filled, filling} | null, file, line, own}
function readVehicle(open, key) {
  const sdlx = require('../../../lib/sdlx');
  const out = { found: false, key, box: { w: 0, h: 0, weight: 0, file: null }, hasBox: false, items: [], holders: [], places: [], ownBox: false, ownInventory: false };
  const buf = open(key); if (!buf) return out;
  let root;
  try {
    root = sdlx.read(buf, { file: key, key, open: r => { const b = r && r.key ? open(r.key) : null; return b ? { buf: b, file: r.key, key: r.key } : null; }, onError() {} }).root;
  } catch (e) { return out; }
  out.found = true;
  const nameOf = b => (b.items[0] && (b.items[0].k === 'IDENT' || b.items[0].k === 'STRING') ? lc(b.items[0].k === 'STRING' ? b.items[0].value : b.items[0].text) : '');
  const str = t => (t.k === 'STRING' ? t.value : t.text), isNum = t => !!t && (t.k === 'INTEGER' || t.k === 'FLOAT');
  const own = n => n.file === key && !n.via;
  // {item ..} / {weapon ..}: tags, count, loaded
  const desc = (toks, o) => {
    let p = 0; const tags = [];
    while (toks[p] && toks[p].k === 'STRING') tags.push(str(toks[p++]));
    o.item = norm(tags.join(' ')); o.count = 1; o.filled = false; o.filling = null;
    if (isNum(toks[p])) o.count = Math.trunc(toks[p++].value);
    if (toks[p] && toks[p].k === 'IDENT') {
      const w = lc(toks[p].text); p++;
      if (w === 'filled') o.filled = true;
      else if (w === 'filling') { const ft = []; while (toks[p] && toks[p].k === 'STRING') ft.push(str(toks[p++])); o.filling = { tags: norm(ft.join(' ')), count: isNum(toks[p]) ? Math.trunc(toks[p].value) : 1 }; }
    }
    return o;
  };
  const inventory = b => {
    if (own(b)) out.ownInventory = true;
    for (const k of b.items) {
      if (k.k !== 'BLOCK' || k.disabled) continue;
      const n = nameOf(k);
      if (n === 'box') {
        out.hasBox = true; if (own(k)) out.ownBox = true;
        for (const x of k.items) {
          if (x.k !== 'BLOCK' || x.disabled) continue;
          const xn = nameOf(x), a = x.items.slice(1);
          if (xn === 'size' && isNum(a[0]) && isNum(a[1])) { out.box.w = Math.trunc(a[0].value); out.box.h = Math.trunc(a[1].value); out.box.file = x.file; }
          else if (xn === 'weight' && isNum(a[0])) out.box.weight = a[0].value;
          else if (xn === 'clear') out.items = [];
          else if (xn === 'item') {
            const it = desc(a.filter(t => t.k !== 'BLOCK'), { user: '', cell: null, file: x.file, line: x.line, own: own(x) });
            for (const s of a) if (s.k === 'BLOCK') { const sn = nameOf(s); if (sn === 'user' && s.items[1]) it.user = lc(str(s.items[1])); else if (sn === 'cell' && isNum(s.items[1]) && isNum(s.items[2])) it.cell = { x: s.items[1].value, y: s.items[2].value }; }
            if (it.item) out.items.push(it);
          }
        }
        continue;
      }
      const tag = k.items[1] && k.items[1].k === 'STRING' ? lc(str(k.items[1])) : n;
      let h = out.holders.find(x => x.name === tag);
      if (!h) { h = { type: n, name: tag, mask: [], file: k.file, line: k.line, bone: '' }; out.holders.push(h); }
      for (const x of k.items) {
        if (x.k !== 'BLOCK' || x.disabled) continue;
        const xn = nameOf(x);
        if (xn === 'mask') {
          h.file = x.file; h.line = x.line;
          for (const t of x.items.slice(1)) { if (t.k === 'IDENT' && lc(t.text) === 'clear') h.mask = []; else if (t.k === 'STRING') for (const w of lc(str(t)).split(/\s+/).filter(Boolean)) if (!h.mask.includes(w)) h.mask.push(w); }
        } else if (xn === 'bone' && x.items[1]) h.bone = str(x.items[1]);
      }
    }
  };
  const weaponry = b => {
    for (const k of b.items) {
      if (k.k !== 'BLOCK' || k.disabled || nameOf(k) !== 'place' || !k.items[1]) continue;
      const name = lc(str(k.items[1]));
      let p = out.places.find(x => x.name === name);
      if (!p) { p = { name, type: '', weapon: null, file: k.file, line: k.line, own: false, ownPlace: false }; out.places.push(p); }
      if (own(k)) p.ownPlace = true;
      for (const x of k.items) {
        if (x.k !== 'BLOCK' || x.disabled) continue;
        const xn = nameOf(x);
        if (xn === 'type' && x.items[1]) p.type = lc(str(x.items[1]));
        else if (xn === 'weapon') {
          const a = x.items.slice(1).filter(t => t.k !== 'BLOCK');
          if (!a.length) p.weapon = null; else { p.weapon = desc(a, {}); p.file = x.file; p.line = x.line; p.own = own(x); }
        }
      }
    }
  };
  const walk = b => {
    for (const k of b.items) {
      if (k.k === 'MOD') { walk(k); continue; }
      if (k.k !== 'BLOCK' || k.disabled) continue;
      const n = nameOf(k);
      if (n === 'extender' && k.items[1] && lc(str(k.items[1])) === 'inventory') inventory(k);
      else if (n === 'weaponry') weaponry(k);
      else if (b === root) walk(k);   // the entity's own block ({game_entity ..}); deeper blocks hold no inventory
    }
  };
  walk(root);
  return out;
}
// what a mask takes: every tag of the mask among the item's tags; an empty mask takes nothing; patterns are no items
const maskTakes = (mask, st) => !!st && !st.pattern && Array.isArray(mask) && mask.length > 0 && mask.every(t => st.all.includes(t));
// ---------- the pending edit of a vehicle ----------
// pending {add:[{item, count?, filled?, filling?, rounds?}], del:[item], slots:{<slot name>: item | false}} -> the box after the
// edit, as gen's vehkit op makes it (tools/gen/lib/ops-unit.js opVehKit):
// - add / del as for a soldier, with whole counts and no spread; "filled" is one load (the box line has no "filled N")
// - only lines written in the vehicle's own file are changed or removed; a line an included file or a ( ) call gives is shared
//   with other vehicles and stays
// - slots: a masked slot gets the item (its line becomes the one with {user "slot"}; the item that was mounted loses its {user}
//   and stays in the box), or false = nothing mounted. A fixed place gets another weapon in its {weapon} line
// accepts(slot, item) -> '' | the plain reason it does not go; kindOfItem as applyPending
// -> {items, places, spec:{add, del, mount:{slot: item|false}, weapons:{place: item}}, touched, why}
function applyVehicle(cur, pending, accepts) {
  const p = pending || {}, fromFile = f => 'It comes from ' + String(f || '').replace(/^resource\//, '') + ', which other vehicles share, so it is not changed here.';
  const items = cur.items.map(x => Object.assign({}, x, { filling: x.filling ? Object.assign({}, x.filling) : null }));
  const places = cur.places.map(x => Object.assign({}, x, { weapon: x.weapon ? Object.assign({}, x.weapon) : null }));
  const view = { items: items.map(x => Object.assign(x, { dev: 0, filledN: null, n: x.count === 1 ? undefined : x.count })), inHands: null };
  const refused = (Array.isArray(p.del) ? p.del : []).map(norm).concat((Array.isArray(p.add) ? p.add : []).map(a => norm(typeof a === 'string' ? a : (a || {}).item)))
    .map(n => items.find(x => x.item === n && !x.own)).find(Boolean);
  if (refused) return { why: '"' + refused.item + '" cannot be changed. ' + fromFile(refused.file) };
  for (const a of Array.isArray(p.add) ? p.add : []) {
    if (a && typeof a === 'object' && a.spread !== undefined && a.spread !== null && a.spread !== '' && +a.spread !== 0) return { why: 'A vehicle carries an exact count of each item: no spread.' };
    if (a && typeof a === 'object' && a.filled === true && a.rounds !== undefined && a.rounds !== null && a.rounds !== '' && a.rounds !== 'full') return { why: 'In a vehicle a loaded weapon starts with one full load of its own ammunition. To set the rounds, name the ammunition.' };
    if (a && typeof a === 'object' && a.count !== undefined && a.count !== '' && a.count !== null && !/^\d+$/.test(String(a.count).trim())) return { why: 'The count of "' + norm(a.item) + '" must be a whole number from 1 up.' };
  }
  const r = applyPending(view, { add: p.add, del: p.del }, null);
  if (r.why) return { why: r.why.replace(/The soldier/g, 'The vehicle').replace(/the soldier/g, 'the vehicle') };
  if (r.items.some(x => x.filled && x.filledN != null)) return { why: 'In a vehicle a loaded weapon starts with one full load of its own ammunition. To set the rounds, name the ammunition.' };
  const out = r.items.map(x => { const o = Object.assign({ user: '', cell: null, own: true, file: cur.key, line: 0 }, x); if (o.n !== undefined) o.count = Math.trunc(o.n); delete o.min; o.max = o.count; o.varies = false; return o; });
  const spec = { add: r.spec.add.map(a => { const s = Object.assign({}, a); delete s.spread; return s; }), del: r.spec.del, mount: {}, weapons: {} }, touched = r.touched.slice();
  const sl = p.slots && typeof p.slots === 'object' ? p.slots : {};
  for (const name0 of Object.keys(sl)) {
    const name = lc(name0), want = sl[name0] === false || sl[name0] == null || sl[name0] === '' ? null : norm(sl[name0]);
    const place = places.find(x => x.name === name), holder = (cur.holders || []).find(x => x.name === name);
    if (!place && !holder) return { why: 'The vehicle has no weapon slot named "' + name + '".' };
    if (want && /["{}()]/.test(want)) return { why: 'A weapon name is made of letters, digits, _ and spaces.' };
    if (place && place.weapon) {
      // a weapon fixed in the file
      if (!want) return { why: 'The weapon of the slot "' + name + '" is fixed in the vehicle file. It can be swapped for another weapon, not taken out.' };
      if (want === place.weapon.item) continue;
      if (!place.own) return { why: 'The weapon of the slot "' + name + '" cannot be changed. ' + fromFile(place.file) };
      const no = accepts ? accepts({ name, fixed: true, mask: [] }, want) : '';
      if (no) return { why: no };
      place.weapon = Object.assign({}, place.weapon, { item: want }); spec.weapons[name] = want; continue;
    }
    if (!place) return { why: 'The vehicle has no weapon place named "' + name + '", so the game never uses this slot.' };
    if (!holder) return { why: 'The slot "' + name + '" holds no weapon and has no list of what it takes, so nothing can be put into it.' };
    const now = out.find(x => x.user === name);
    if ((now ? now.item : null) === want) continue;
    if (now && !now.own) return { why: 'The weapon in the slot "' + name + '" cannot be changed. ' + fromFile(now.file) };
    if (want) {
      const no = accepts ? accepts({ name, fixed: false, mask: holder.mask }, want) : '';
      if (no) return { why: no };
      const other = out.find(x => x.item === want && !x.user);
      if (other && !other.own) return { why: '"' + want + '" is in the box already, from a shared file. ' + fromFile(other.file) };
      if (other && other.count !== 1) return { why: 'The vehicle carries ' + other.count + ' of "' + want + '" in one line. Set that count to 1 first: a mounted weapon is one item.' };
      if (now) now.user = '';
      if (other) other.user = name; else out.push({ item: want, count: 1, max: 1, n: undefined, dev: 0, varies: false, filled: true, filledN: null, filling: null, user: name, cell: null, own: true, file: cur.key, line: 0, isNew: true });
      touched.push(want);
    } else if (now) now.user = '';
    spec.mount[name] = want || false;
  }
  return { items: out, places, inHands: null, spec, touched, why: null };
}

module.exports = { parse, buildTable, findItem, kindOf, headingOf, HEADINGS,boxOf, readBreed, applyPending, fill, range, nameKeys, STUFF, BOX_FILE, NOT_CARRIED, NOT_VEHICLE, readVehicle, maskTakes, applyVehicle };
