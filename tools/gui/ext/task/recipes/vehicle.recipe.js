// recipe "make or change a vehicle": copy a game vehicle (clone, wreck, sounds block, buy card) or change one, then set its model,
// armour lines, movement, crew preset, guns and mounts, sight, effects, inventory, supply, wreck, icons, buy card and texts. Steps
// follow 4.1; every census variable with a tool step is a question (advanced groups per area), the rest is kept
// its reason. Reads the base through tools/lib (vfs with the mod's Require deps, sdlwrite own tree, sdlx with macros and includes);
// writes through gen ops (clone with the gen wreck step, set with append, macro, weapon on every mount, iblock, roster into any army,
// card, preset, text) and staged copies (own model files).
// _lib (readers, lookups, armour lines, row helpers) is shared with armour.recipe.js. Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-d7f52119)
'use strict';
const fs = require('fs'), path = require('path');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');
const vfsLib = require(path.join(TOOLS, 'lib', 'vfs'));
const GAMES = require(path.join(TOOLS, 'lib', 'games'));
const SW = require(path.join(TOOLS, 'lib', 'sdlwrite'));
const SX = require(path.join(TOOLS, 'lib', 'sdlx'));

// ---------- census limits (vanilla ranges, units and limits ids)
let CEN = []; try { CEN = require('../census/vehicle.json').vars || []; } catch { CEN = []; }
const cv = k => CEN.find(v => v.key === k) || {};
function lim(k, o) {
  const v = cv(k), a = v.vanilla || {}, L = {};
  if (typeof a.min === 'number') L.min = a.min;
  if (typeof a.max === 'number') L.max = a.max;
  if (v.unit) L.unit = v.unit;
  if (v.limit) L.limit = v.limit;
  return Object.assign(L, o || {});
}
const words = k => ((cv(k).vanilla || {}).values || []).map(s => String(s).replace(/:\d+$/, ''));
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lc = s => String(s == null ? '' : s).toLowerCase();

// ---------- reader: the game view with the mod's Require deps (what the gen run sees) plus the picked mod's own files
let depsOf = () => [];
try { depsOf = require('../lib/compile').depsOf; } catch { /* an older core: no deps */ }
// the task's game: the draft's (c.game, draft.game, values and lookups o.game), else the page's (ctx.gameId(), gui.js; a string where
// compile.js lookupCtx set it); nothing = as64. exeFor: the vfs exe of that game, undefined for as64 (the vfs picks as64.exe first, as
// before), 'mowas_2' for MoW:AS2 (the same install without as64/core; tools/lib/games). Caches below are keyed by it.
function gidOf(ctx, g) {
  if (g) return String(g);
  if (ctx && ctx.task && ctx.task.id) return String(ctx.task.id);   // README "The game of a task": lib/game.js hands it to every step
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch { return 'as64'; }
}
function exeFor(ctx, g) { const id = gidOf(ctx, g); return id === 'as64' ? undefined : (GAMES.exeOf(id) || undefined); }
// the game view with the mod's Require deps: the shared one of tools/lib/gameview (PERF A2: no copy kept here; a moved game or dep
// is seen by stamp and signature, not after two minutes). vfsOf is sync (the readers are): by signature once the deps have a scan,
// which warm() awaits first on every path that can wait; else lib/vfs walks them as before and the scan starts in the background
const GV = require(path.join(TOOLS, 'lib', 'gameview'));
const viewOpt = (game, deps, exe) => (exe ? { gameDir: game, exe, list: deps } : { gameDir: game, list: deps });
function vfsOf(game, deps, exe) { return GV.withModsSync(viewOpt(game, deps, exe), { revalidate: true }); }
function modKeys(mod) {
  const out = new Map();
  if (!mod) return out;
  const root = path.join(mod, 'resource');
  if (!fs.existsSync(root)) return out;
  (function walk(d, rel) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const f = path.join(d, e.name), r = rel + e.name.toLowerCase(); if (e.isDirectory()) walk(f, r + '/'); else out.set(r, f); }
  })(root, 'resource/');
  return out;
}
function reader(game, mod, exe) {
  let deps = []; try { deps = (mod && depsOf(game, mod, exe)) || []; } catch { deps = []; }
  const v = game && fs.existsSync(game) ? vfsOf(game, deps, exe) : null, mk = modKeys(mod);
  const norm = k => lc(k).replace(/\\/g, '/').replace(/^\/+/, '');
  return {
    game, mod, deps, exe,
    read(key) { key = norm(key); if (mk.has(key)) return fs.readFileSync(mk.get(key)); const r = v && v.files.get(key); return r ? vfsLib.readRec(r) : null; },
    has(key) { key = norm(key); return mk.has(key) || !!(v && v.files.has(key)); },
    keys(re) { const s = new Set(); if (v) for (const k of v.files.keys()) if (re.test(k)) s.add(k); for (const k of mk.keys()) if (re.test(k)) s.add(k); return [...s].sort(); },
    mine(key) { return mk.has(norm(key)); },
  };
}
const RC = new Map();
// exe: a vfs exe or a game id ('mowas2' and 'mowas_2' are one reader); as64 or none = the reader of before
function readerFor(game, mod, exe) {
  exe = exe && exe !== 'as64' ? (GAMES.exeOf(exe) || undefined) : undefined;
  const k = game + '|' + (mod || '') + (exe ? '|exe=' + exe : ''), e = RC.get(k);
  if (e && Date.now() - e.at < 15000) return e.r;
  const r = reader(game, mod, exe); RC.set(k, { r, at: Date.now() });
  return r;
}
// before readerFor on a path that can wait (same arguments): the deps' shared scan and the view, awaited, so readerFor does not
// hold the server thread on a walk. Never throws (readerFor says what is wrong); no deps: nothing to wait for
async function warm(game, mod, exe) {
  try {
    exe = exe && exe !== 'as64' ? (GAMES.exeOf(exe) || undefined) : undefined;
    const e = RC.get(game + '|' + (mod || '') + (exe ? '|exe=' + exe : ''));
    if ((e && Date.now() - e.at < 15000) || !game || !fs.existsSync(game)) return;
    let deps = []; try { deps = (mod && depsOf(game, mod, exe)) || []; } catch { deps = []; }
    if (deps.length) await GV.withMods(viewOpt(game, deps, exe));
  } catch { /* readerFor says it */ }
}

// ---------- one unit: own tree (sdlwrite), expanded tree (sdlx), card
const defKeys = (R, id) => R.keys(new RegExp('^resource/entity/.*/' + esc(lc(id)) + '\\.def$'));
function unitOf(R, id) {
  id = lc(id).trim();
  if (!/^[a-z0-9_\-]+$/.test(id)) return null;
  const ks = defKeys(R, id);
  if (!ks.length) return null;
  const key = ks.find(k => R.mine(k)) || ks[0], buf = R.read(key);
  let own = null, top = null, full = null;
  try { own = SW.parse(buf); top = own.root.items.find(n => n.type === 'block') || null; } catch { own = null; }
  try {
    const open = r => { const b = r && r.kind === 'virtual' ? R.read(r.key) : null; return b ? { buf: b, file: r.key, key: r.key } : null; };
    const root = SX.read(buf, { file: key, key, open, onError() {} }).root;
    full = (root.items || []).find(n => n.k === 'BLOCK') || null;
  } catch { full = null; }
  const m = /^resource\/entity\/(.*)\/[^/]+\/[^/]+\.def$/.exec(key);
  return { id, key, dir: key.replace(/\/[^/]+$/, ''), cls: m ? m[1] : '', own, top, full, mine: R.mine(key), card: cardOf(R, id) };
}

// own tree helpers (sdlwrite names are lower case)
const kids = (n, name) => ((n && n.items) || []).filter(x => x.type === 'block' && x.name === name);
const plain = (u, n) => ((n && n.items) || []).slice(1).filter(x => x.type === 'atom' || x.type === 'string').map(x => x.type === 'string' ? x.text.replace(/^"|"$/g, '') : x.text);
const rawOf = (u, n) => n.items.length > 1 ? u.own.src.slice(n.items[1].start, n.closeStart).trim().replace(/\s+/g, ' ') : '';
const keyed = (n, name, key) => kids(n, name).find(x => lc(plain(null, x)[0]) === lc(key)) || null;
function pathOf(u, node) {
  const segs = [];
  for (let n = node; n && n !== u.top; n = n.parent) {
    const p = n.parent; if (!p) break;
    const sib = p.items.filter(x => (x.type === 'block' || x.type === 'list') && x.name === n.name);
    segs.unshift(sib.length > 1 ? n.name + '[' + sib.indexOf(n) + ']' : n.name);
  }
  return [u.top ? u.top.name : 'game_entity'].concat(segs).join('/');
}
// a set row where the own file has the block, else an add under the deepest block it has (an override of an include or macro)
function rowFor(u, segs, value, from) {
  let node = from || u.top, i = 0;
  for (; i < segs.length && node; i++) {
    const h = kids(node, segs[i]);
    if (!h.length) break;
    node = h[h.length - 1];
  }
  if (i === segs.length && node) return { op: 'set', path: pathOf(u, node), value: String(value) };
  let v = String(value);
  for (let j = segs.length - 1; j > i; j--) v = '{' + segs[j] + ' ' + v + '}';
  return { op: 'add', path: (node === u.top && !i && !from ? (u.top ? u.top.name : 'game_entity') : pathOf(u, node)) + '/' + segs[i], value: v };
}
const ownAt = (u, segs, from) => { let node = from || u.top; for (const s of segs) { const h = kids(node, s); if (!h.length) return null; node = h[h.length - 1]; } return node; };
function ownCalls(u) {
  const out = [];
  (function walk(n) { for (const c of (n && n.items) || []) { if (c.type === 'list' && c.items[0] && c.items[0].type === 'string') out.push(c); if (c.items) walk(c); } })(u.top);
  return out;
}
const callName = c => lc(c.items[0].text.replace(/^"|"$/g, ''));
function callArgs(u, call) {
  const named = {}, it = call.items; let args = null;
  for (let k = 1; k < it.length; k++) {
    const a = it[k];
    if (a.type === 'atom' && lc(a.text) === 'args') { args = []; for (let j = k + 1; j < it.length && it[j].type === 'atom' && !(it[j + 1] && it[j + 1].type === 'list'); j++) args.push(it[j].text); continue; }
    if (a.type === 'atom' && it[k + 1] && it[k + 1].type === 'list') { named[lc(a.text)] = u.own.src.slice(it[k + 1].start + 1, it[k + 1].closeStart).trim().replace(/\s+/g, ' '); k++; }
  }
  return { named, args };
}
const within = (n, anc) => { for (let p = n; p; p = p.parent) if (p === anc) return true; return false; };
// nth among the own calls of that name (1 based), and how many there are
function nthOf(u, call) { const same = ownCalls(u).filter(c => callName(c) === callName(call)); return { nth: same.indexOf(call) + 1, count: same.length }; }

// expanded tree helpers: the last block on the path wins [I]
function effBlock(u, segs) {
  let cur = u.full ? [u.full] : [];
  for (const s of segs) {
    const nx = [];
    for (const b of cur) for (const x of b.items || []) if (x.k === 'BLOCK' && x.items[0] && x.items[0].k === 'IDENT' && lc(x.items[0].text) === s) nx.push(x);
    cur = nx;
  }
  return cur.length ? cur[cur.length - 1] : null;
}
const valsOf = b => b ? b.items.slice(1).filter(x => x.k !== 'BLOCK' && x.k !== 'MOD').map(x => x.k === 'STRING' ? x.value : x.value !== undefined ? x.value : x.text) : null;
function eff(u, segs) { const v = valsOf(effBlock(u, segs)); return v && v.length ? v[0] : undefined; }
function effList(u, segs) { const v = valsOf(effBlock(u, segs)); return v && v.length ? v.map(String) : undefined; }
function effProps(u) {
  const out = [];
  for (const x of (u.full && u.full.items) || []) if (x.k === 'BLOCK' && x.items[0] && x.items[0].k === 'IDENT' && lc(x.items[0].text) === 'props') out.push(...valsOf(x).map(String));
  return out;
}

// ---------- the buy card (units/vehicles*.set)
function cardOf(R, id) {
  for (const key of R.keys(/^resource\/set\/multiplayer\/units\/vehicles[^/]*\.set$/)) {
    const b = R.read(key); if (!b) continue;
    const s = b.toString('latin1'), m = new RegExp('^[ \\t]*\\{\\s*"' + esc(id) + '"[\\s(]', 'im').exec(s);
    if (!m) continue;
    const i = m.index + m[0].indexOf('{'); let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && !--d) break; }
    const text = s.slice(i, j + 1), sm = /\bs(?:ide)?\(([a-z0-9_]+)\)/i.exec(text), fm = /vehicles_([a-z0-9_]+)\.set$/.exec(key);
    return { key, text, army: sm ? lc(sm[1]) : fm ? fm[1] : null };
  }
  return null;
}
const CARD = { cost: ['cost'], level: ['level'], charge: ['c', 'charge'], fore: ['fore', 'f'], group: ['g'], button: ['b'], cp: ['cp'], score: ['sc'], cw: ['cw'], tags: ['t'], content: ['content'], tow: ['c1'], cardinfo: ['info'] };
const QUOTED = ['content', 'cardinfo'];
const hasField = (t, k) => new RegExp('\\{\\s*' + esc(k) + '\\s+', 'i').test(t) || new RegExp('(?:^|[\\s(])' + esc(k) + '\\(', 'i').test(t);
function fieldOf(t, k) { const a = new RegExp('\\{\\s*' + esc(k) + '\\s+([^{}]*)\\}', 'i').exec(t) || new RegExp('(?:^|[\\s(])' + esc(k) + '\\(([^()]*)\\)', 'i').exec(t); return a ? a[1].trim() : null; }
const cardKey = (card, f) => card ? (CARD[f] || [f]).find(k => hasField(card.text, k)) || null : null;
function cardVal(card, f) { const k = cardKey(card, f); return k ? fieldOf(card.text, k) : null; }

// ---------- armour lines (shared with the armour recipe): "<preset>[#n] <area> <numbers>"
const ARMOUR = /^(armor_[a-z0-9_]+|shield)$/;
function partLines(u) {
  const out = [], cnt = {};
  for (const c of ownCalls(u).filter(x => ARMOUR.test(callName(x)))) {
    const n = callName(c); cnt[n] = (cnt[n] || 0) + 1;
    const tag = n + (cnt[n] > 1 ? '#' + cnt[n] : ''), a = callArgs(u, c);
    for (const [k, v] of Object.entries(a.named)) out.push(tag + ' ' + k + ' ' + v);
    if (a.args) out.push(tag + ' args ' + a.args.join(' '));
  }
  return out;
}
const PART = /^([a-z0-9_]+)(?:#(\d+))?\s+([a-z0-9_]+)\s+(.+)$/i;
// an armour line on the page: preset, area, then numbers of 0 to 250 mm (the thickest game plate is about 200) or _ to keep one
const ARMOUR_RE = '^[a-z0-9_]+(#[0-9]+)? [a-z0-9_]+( (_|(250|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})(\\.[0-9]+)?))+$';
function partOps(u, ent, baseLines, lines) {
  const base = new Map(), total = {}, ops = [];
  for (const l of baseLines || []) { const m = PART.exec(l); if (!m) continue; base.set(lc(m[1]) + '#' + (m[2] || 1) + ' ' + lc(m[3]), m[4]); total[lc(m[1])] = Math.max(total[lc(m[1])] || 0, +(m[2] || 1)); }
  for (const raw of lines || []) {
    const l = String(raw).trim().replace(/\s+/g, ' ');
    if (!l) continue;
    const m = PART.exec(l);
    if (!m) throw bad('Write each armour line as: preset, area, then the numbers, for example armor_medium turret 60 45 45 20.');
    const k = lc(m[1]) + '#' + (m[2] || 1) + ' ' + lc(m[3]);
    if (!base.has(k)) throw bad('"' + l + '" is not an armour line of ' + u.id + '. Change only the numbers of the lines it has.');
    if (!m[4].split(' ').every(t => t === '_' || /^-?\d+(\.\d+)?$/.test(t))) throw bad('"' + l + '": the armour values must be numbers (mm, or a factor after args).');
    if (base.get(k) === m[4]) continue;
    const op = { op: 'macro', entity: ent, macro: lc(m[1]), arg: lc(m[3]), value: m[4] };
    if (total[lc(m[1])] > 1) op.nth = +(m[2] || 1);
    ops.push(op);
  }
  return ops;
}

// ---------- rows on one def: sets and adds first, then deletes (last index first), then new lines (append: always a new sibling
// line after the others, the gen set op's real add; they come last so the delete indexes still hold)
function rowBag(u) {
  const sets = [], dels = [], late = [];
  return {
    set: r => sets.push(r),
    del: n => dels.push({ op: 'del', path: pathOf(u, n), value: '' }),
    append: (n, name, value) => late.push({ op: 'append', path: pathOf(u, n) + '/' + name, value }),
    rows() {
      const num = p => p.replace(/\[(\d+)\]/g, (m, d) => '[' + d.padStart(4, '0') + ']');
      dels.sort((a, b) => num(b.path) < num(a.path) ? -1 : num(b.path) > num(a.path) ? 1 : 0);
      return sets.concat(dels, late);
    },
    get size() { return sets.length + dels.length + late.length; },
  };
}

// ---------- lookups
function stuffOf(R, name) { return R.keys(new RegExp('^resource/set/stuff/[^/]+/' + esc(lc(name)) + '$')); }
function mdlOf(R, key) {
  const b = R.read(key); if (!b) return null;
  const s = b.toString('latin1'), all = [...s.matchAll(/\{\s*extension\s+"([^"]+\.mdl)"/gi)];
  if (!all.length) return null;
  const e = lc(all[all.length - 1][1]);
  return e.startsWith('/') ? 'resource' + e : key.replace(/\/[^/]+$/, '') + '/' + e;
}
// player-visible names: every {"key" "text"} leaf of the game's resource/interface/text/*.lng (the file name is the first key part,
// desc.lng -> desc/entity/<id>) and of the mod's localization/*.lng ({tags {"desc" {"entity" ..}}}); the mod wins
function lngLeaves(text, pre, out) {
  const re = /"((?:[^"\\]|\\.)*)"|[{}]|[^\s{}"]+/g, stack = [];
  let m, open = false, cur = null;
  while ((m = re.exec(text))) {
    const t = m[0];
    if (t === '{') { open = true; cur = { name: null, vals: [] }; stack.push(cur); continue; }
    if (t === '}') { const b = stack.pop(); if (b && b.name != null && b.vals.length === 1 && b.leaf !== false) out.set(lc(pre.concat(stack.map(x => x.name).filter(x => x != null && x !== 'tags'), b.name).join('/')), b.vals[0]); if (stack.length) stack[stack.length - 1].leaf = false; cur = stack[stack.length - 1] || null; continue; }
    if (!cur) continue;
    const v = m[1] !== undefined ? m[1].replace(/\\"/g, '"') : t;
    if (open) { cur.name = v; open = false; } else cur.vals.push(v);
  }
  return out;
}
const LNG = new Map();
function namesOf(R) {
  const k = R.game + '|' + (R.mod || '') + '|' + R.deps.join('|') + (R.exe ? '|exe=' + R.exe : ''), e = LNG.get(k);
  if (e && Date.now() - e.at < 120000) return e.m;
  const m = new Map();
  for (const key of R.keys(/^resource\/interface\/text\/[^/#]+\.lng$/)) { const b = R.read(key); if (b) lngLeaves(b.toString('utf8'), [key.slice(key.lastIndexOf('/') + 1, -4)], m); }
  for (const dir of R.deps.concat(R.mod ? [R.mod] : [])) {
    const d = path.join(dir, 'localization'); let fs0 = [];
    try { fs0 = fs.readdirSync(d).filter(f => /\.lng$/i.test(f)); } catch { fs0 = []; }
    for (const f of fs0) { try { lngLeaves(fs.readFileSync(path.join(d, f), 'utf8'), /^#/.test(f) ? [] : [f.slice(0, -4).toLowerCase()], m); } catch { /* unreadable */ } }
  }
  LNG.set(k, { m, at: Date.now() });
  return m;
}
const nameFor = (R, sect, id) => { const m = namesOf(R); for (const s of sect) { const v = m.get(s + '/' + lc(id)); if (v) return v.replace(/<[^>]*>/g, '').trim(); } return null; };
const qwords = w =>lc(Array.isArray(w) ? w.join(' ') : w).split(/[\s,]+/).filter(Boolean);
const gameOfCtx = ctx => { try { return (ctx && ctx.game && ctx.game()) || null; } catch { return null; } };
async function lookupVehicle(ctx, w, opt) {
  const g = gameOfCtx(ctx);
  if (!g) return [];
  await warm(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game));
  const R = readerFor(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game)), ws = qwords(w), lim0 = (opt && opt.limit) || 50, out = [];
  for (const k of R.keys(/^resource\/entity\/-vehicle\/.*\.def$/)) {
    if (/\/x\//.test(k) || /_x+\.def$/.test(k)) continue;
    const id = k.slice(k.lastIndexOf('/') + 1, -4), cls = (/^resource\/entity\/(.*)\/[^/]+\/[^/]+$/.exec(k) || [])[1] || '';
    const name = nameFor(R, ['desc/entity'], id) || id, nl = lc(name);
    if (ws.length && !ws.every(x => id.includes(x) || cls.includes(x) || nl.includes(x))) continue;
    out.push({ id, name, where: cls, ref: null, sub: R.mine(k) ? 'mod' : 'game', key: k });
  }
  const q = ws.join(' ');
  out.sort((a, b) => (b.id === q || lc(b.name) === q) - (a.id === q || lc(a.name) === q) || a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
  for (const r of out.slice(0, lim0)) { const m = mdlOf(R, r.key); r.ref = m ? { key: m } : { key: r.key }; }
  return out.map(r => ({ id: r.id, name: r.name, where: r.where, ref: r.ref, sub: r.sub }));
}
function stuffLookup(re, label) {
  return async (ctx, w, opt) => {
    const g = gameOfCtx(ctx);
    if (!g) return [];
    await warm(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game));
    const R = readerFor(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game)), ws = qwords(w), out = [];
    for (const k of R.keys(re)) {
      const id = k.slice(k.lastIndexOf('/') + 1), where = k.slice(0, k.lastIndexOf('/')).replace(/^resource\/set\//, '');
      const name = nameFor(R, ['desc/weapon', 'desc/ammo', 'desc/stuff', 'desc/container', 'desc/entity'], id) || id, nl = lc(name);
      if (ws.length && !ws.every(x => id.includes(x) || where.includes(x) || nl.includes(x))) continue;
      out.push({ id, name, where: where || label, ref: { key: k }, sub: R.mine(k) ? 'mod' : 'game' });
    }
    const q = ws.join(' ');
    return out.sort((a, b) => (b.id === q || lc(b.name) === q) - (a.id === q || lc(a.name) === q) || a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
  };
}
const lookupGun = stuffLookup(/^resource\/set\/stuff\/gun\/[^/.][^/]*$/, 'stuff/gun');
const lookupWeapon = stuffLookup(/^resource\/set\/stuff\/(gun|mgun|flame|reactive|bombing|rifle|smg)\/[^/.][^/]*$/, 'stuff');
const lookupItem = stuffLookup(/^resource\/set\/stuff\/[^/]+\/[^/.][^/]*$/, 'stuff');

// ---------- what the base has (preselected answers)
const SKIP_PROPS = /^(vision_|muzzle_|no_minimap_view$)/;
function places(u) {
  const out = [];
  for (const w of kids(u.top, 'weaponry')) for (const p of kids(w, 'place')) { const wn = kids(p, 'weapon')[0] || null; out.push({ node: p, name: plain(u, p)[0] || '', weapon: wn ? lc(plain(u, wn)[0] || '') : null, wnode: wn }); }
  return out;
}
function mainPlace(R, u) { return places(u).find(p => p.weapon && R.has('resource/set/stuff/gun/' + p.weapon)) || null; }
const callIn = (u, test, anc) => ownCalls(u).find(c => test(c) && (!anc || within(c, anc))) || null;
const invExt = u => keyed(u.top, 'extender', 'inventory');
const supplyExt = u => keyed(u.top, 'extender', 'supply_zone');
function inventoryBox(u) { const ex = invExt(u); return ex ? kids(ex, 'box')[0] || null : null; }
const ownProps = u => { const p = kids(u.top, 'props'); return p.length ? p[p.length - 1] : null; };
const MOVE = [
  ['mass', ['mass']], ['maxspeed', ['chassis', 'locomotion', 'maxspeed']], ['turnspeed', ['chassis', 'locomotion', 'maxspeedatmaxturn']],
  ['starttime', ['chassis', 'locomotion', 'starttime']], ['braketime', ['chassis', 'locomotion', 'braketime']], ['stoptime', ['chassis', 'locomotion', 'stoptime']],
  ['turnradius', ['chassis', 'locomotion', 'turnradius']], ['turntime', ['chassis', 'locomotion', 'turntime']], ['turnstart', ['chassis', 'locomotion', 'turnstart']],
  ['turnstop', ['chassis', 'locomotion', 'turnstop']], ['speedslow', ['chassis', 'speed', 'slow']], ['speednormal', ['chassis', 'speed', 'normal']],
  ['speedfast', ['chassis', 'speed', 'fast']], ['fuelrate', ['chassis', 'fuelbag', 'rate']],
];
// one value per question on a fixed path of the def. t: num | word (quoted) | words (list, each quoted) | raw (as typed) |
// flag (a block that is there or not) | bit (1 or 0) | hold (fire_mode "hold" or none)
const FIELDS = [
  ['able', 'able', ['able'], 'words'], ['tag', 'tag', ['tag'], 'word'], ['obstacle', 'obstacleid', ['obstacleid'], 'word'],
  ['physics', 'simulation.able', ['simulation', 'able'], 'bit'], ['linkedphys', 'simulation.disablelinked', ['simulation', 'disablelinked'], 'bit'],
  ['simulator', 'simulatorid', ['simulatorid'], 'word'], ['constrain', 'constrain', ['constrain'], 'word'], ['autooperate', 'autooperatable', ['autooperatable'], 'bit'],
  ['quantable', 'forcequantable', ['forcequantable'], 'flag'], ['targetclass', 'targetclass', ['targetclass'], 'words'], ['targetselector', 'targetselector', ['targetselector'], 'word'],
  ['holdfire', 'brain.properties.fire_mode', ['brain', 'properties', 'fire_mode'], 'hold'], ['hearing', 'hearingbias', ['hearingbias'], 'num'],
  ['gearswitch', 'chassis.locomotion.gearswitchdelay', ['chassis', 'locomotion', 'gearswitchdelay'], 'num'],
  ['steeron', 'chassis.locomotion.steeron', ['chassis', 'locomotion', 'steeron'], 'num'], ['steeroff', 'chassis.locomotion.steeroff', ['chassis', 'locomotion', 'steeroff'], 'num'],
  ['spline', 'chassis.locomotion.splineradius', ['chassis', 'locomotion', 'splineradius'], 'num'], ['maxslope', 'chassis.locomotion.maxslope', ['chassis', 'locomotion', 'maxslope'], 'num'],
  ['fallslope', 'chassis.locomotion.fallslope', ['chassis', 'locomotion', 'fallslope'], 'num'], ['sideslope', 'chassis.maxsideslope', ['chassis', 'maxsideslope'], 'num'],
  ['sideslopespeed', 'chassis.sideslopespeed', ['chassis', 'sideslopespeed'], 'num'], ['elevacc', 'chassis.elevationacceleration', ['chassis', 'elevationacceleration'], 'num'],
  ['elevspeed', 'chassis.maxelevationspeed', ['chassis', 'maxelevationspeed'], 'num'],
  ['nomovefire', 'chassis.disablemovewhilefiring', ['chassis', 'disablemovewhilefiring'], 'flag'], ['noreverse', 'chassis.disablebackward', ['chassis', 'disablebackward'], 'flag'],
  ['ignorebounds', 'chassis.ignorepatherbounds', ['chassis', 'ignorepatherbounds'], 'flag'], ['noslope', 'chassis.dontuseslope', ['chassis', 'dontuseslope'], 'flag'],
  ['waterterrain', 'chassis.switch.terrain', ['chassis', 'switch', 'terrain'], 'raw'], ['exitwater', 'chassis.switch.exitfromwater', ['chassis', 'switch', 'exitfromwater'], 'flag'],
  ['chassisstart', 'chassismanager.current', ['chassismanager', 'current'], 'word'], ['fuelitem', 'chassis.fuelbag.fuel', ['chassis', 'fuelbag', 'fuel'], 'word'],
  ['restoreik', 'weaponry.restoreiktime', ['weaponry', 'restoreiktime'], 'num'], ['manualacc', 'weaponry.manualaccuracy', ['weaponry', 'manualaccuracy'], 'num'],
  ['recognize', 'sensor.recognizetime', ['sensor', 'recognizetime'], 'num'], ['inform', 'sensor.informrange', ['sensor', 'informrange'], 'raw'],
];
const FIELD = new Map(FIELDS.map(f => [f[0], f]));
function fieldValue(u, f) {
  const [, , segs, t] = f, b = effBlock(u, segs), vs = valsOf(b);
  if (t === 'flag') return !!b && !(vs && vs.length && String(vs[0]) === '0');
  if (t === 'hold') return !!b && lc(vs && vs[0]) === 'hold';
  if (!b) return undefined;
  if (t === 'bit') return !(vs && vs.length && String(vs[0]) === '0');
  if (!vs || !vs.length) return undefined;
  if (t === 'num') return isNaN(+vs[0]) ? undefined : +vs[0];
  if (t === 'word') return lc(vs[0]);
  if (t === 'words') return vs.map(String);
  return vs.map(String).join(' ');
}
const quote = s => '"' + String(s).replace(/"/g, '') + '"';
function fieldRows(u, f, v, bag) {
  const [q, , segs, t] = f, own = ownAt(u, segs);
  if (t === 'flag' || t === 'hold') {
    const on = v === true || v === 'true';
    if (on) { if (!own) bag.set(rowFor(u, segs, t === 'hold' ? '"hold"' : '')); else if (t === 'hold') bag.set({ op: 'set', path: pathOf(u, own), value: '"hold"' }); return; }
    if (own) { bag.del(own); return; }
    throw bad(q + ': ' + segs.join('/') + ' comes from a shared file of ' + u.id + ' and cannot be switched off in its def alone.');
  }
  if (t === 'word' && lc(v) === 'none') {
    if (own) { bag.del(own); return; }
    if (effBlock(u, segs)) throw bad(q + ': ' + segs.join('/') + ' comes from a shared file of ' + u.id + ' and cannot be taken out in its def alone.');
    return;
  }
  let val;
  if (t === 'num') { if (isNaN(+v)) throw bad(q + ': a number is needed.'); val = String(+v); }
  else if (t === 'bit') val = v === true || v === 'true' ? '1' : '0';
  else if (t === 'word') { if (!/^[A-Za-z0-9_.\-]+$/.test(String(v).trim())) throw bad(q + ': one word is needed.'); val = quote(lc(String(v).trim())); }
  else if (t === 'words') val = asList(v).map(quote).join(' ');
  else { val = String(v).trim(); if (/[{}]/.test(val)) throw bad(q + ': no braces.'); }
  bag.set(rowFor(u, segs, val));
}
// lines of a per-block list: "<block name> <key> <value>" for the keys a mount, bone or visor has
const MOUNT = { type: 'word', foresight: 'word', basic: 'flag', rotate: 'flag', restoreikafteraim: 'flag', stationaryfiring: 'flag', barrels: 'num' };
const BONE = { speed: 'num', speed2: 'num', limits: 'raw' };
function blockLines(u, nodes, keys) {
  const out = [];
  for (const n of nodes) {
    const name = plain(u, n)[0]; if (!name) continue;
    for (const [k, t] of Object.entries(keys)) { const b = kids(n, k)[0]; if (!b) continue; out.push(name + ' ' + k + ' ' + (t === 'flag' ? 'yes' : t === 'word' ? lc(plain(u, b)[0] || '') : plain(u, b).join(' '))); }
  }
  return out;
}
function blockRows(u, what, nodes, keys, baseLines, lines, bag) {
  const base = new Set((baseLines || []).map(s => lc(String(s).trim().replace(/\s+/g, ' '))));
  for (const raw of lines) {
    const l = String(raw).trim().replace(/\s+/g, ' ');
    if (!l || base.has(lc(l))) continue;
    const m = /^(\S+) ([a-z0-9_]+) (.+)$/i.exec(l);
    if (!m) throw bad('Write each ' + what + ' line as: name, key, value, for example ' + (baseLines[0] || 'mgun1 type mgun_hull') + '.');
    const n = nodes.find(x => lc(plain(u, x)[0]) === lc(m[1])), k = lc(m[2]), t = keys[k];
    if (!n) throw bad('"' + m[1] + '" is not a ' + what + ' of ' + u.id + ' in its own file. It has: ' + (nodes.map(x => plain(u, x)[0]).join(', ') || 'none'));
    if (!t) throw bad('"' + m[2] + '": a ' + what + ' line can set ' + Object.keys(keys).join(', ') + '.');
    const own = kids(n, k)[0], v = m[3].trim();
    if (t === 'flag') {
      const on = /^(yes|1|true|on)$/i.test(v);
      if (on && !own) bag.set({ op: 'add', path: pathOf(u, n) + '/' + k, value: '' });
      else if (!on && own) bag.del(own);
      continue;
    }
    if (t === 'num' && isNaN(+v)) throw bad('"' + l + '": the value must be a number.');
    if (t === 'raw' && !/^[-0-9. ]+$/.test(v)) throw bad('"' + l + '": the values must be numbers.');
    const val = t === 'word' ? quote(lc(v)) : t === 'num' ? String(+v) : v;
    bag.set(own ? { op: 'set', path: pathOf(u, own), value: val } : { op: 'add', path: pathOf(u, n) + '/' + k, value: val });
  }
}
function visors(u) { const s = kids(u.top, 'sensor'); return s.length ? kids(s[s.length - 1], 'visor') : []; }
function effVisors(u) {
  const out = new Map();
  for (const x of (u.full && u.full.items) || []) if (x.k === 'BLOCK' && x.items[0] && lc(x.items[0].text) === 'sensor')
    for (const v of x.items) if (v.k === 'BLOCK' && v.items[0] && lc(v.items[0].text) === 'visor') { const nm = valsOf(v)[0], vi = v.items.find(y => y.k === 'BLOCK' && y.items[0] && lc(y.items[0].text) === 'vision'); if (nm && vi) out.set(String(nm), String(valsOf(vi)[0])); }
  return [...out].map(([k, v]) => k + ' ' + v);
}
function iconsOf(R, id) { return R.keys(new RegExp('^resource/interface/scene/unit_icon(_small)?/' + esc(lc(id)) + '(_0\\d)?\\.tga$')); }
function hasIblock(R, id) {
  const re = new RegExp('^[ \\t]*\\{\\s*"[^"\\r\\n]*\\b' + esc(lc(id)) + '\\b[^"\\r\\n]*"', 'im');
  return R.keys(/^resource\/set\/interaction_entity\/.*\.(inc|set)$/).some(k => { const b = R.read(k); return !!b && re.test(b.toString('latin1')); });
}
const unq = s => s == null ? s : String(s).replace(/^"|"$/g, '');
function freeId(R, id) { for (let i = 2; i < 99; i++) { const n = id.replace(/_\d+$/, '') + '_m' + i; if (!defKeys(R, n).length) return n; } return id + '_new'; }
function baseValues(R, u, verb) {
  const v = { newid: verb === 'change' ? u.id : freeId(R, u.id) };
  const ext = kids(u.top, 'extension').map(n => plain(u, n)[0] || '').filter(s => /\.mdl$/i.test(s));
  if (ext.length) v.model = ext[ext.length - 1];
  const card = u.card;
  v.sell = !!card;
  if (card) {
    for (const f of ['cost', 'level', 'charge', 'fore', 'cp', 'score', 'cw']) { const x = cardVal(card, f); if (x != null && x !== '' && !isNaN(+x)) v[f] = +x; }
    for (const f of ['group', 'button', 'tow']) { const x = cardVal(card, f); if (x) v[f] = x; }
    for (const f of ['content', 'cardinfo']) { const x = cardVal(card, f); if (x) v[f] = unq(x); }
    const t = cardVal(card, 'tags'); if (t) v.tags = t.split(/\s+/).filter(Boolean);
    for (const [q, k] of [['notforsale', 'not_for_sale'], ['basic', 'basic'], ['remove', 'remove']]) v[q] = new RegExp('\\{\\s*' + k + '\\s*\\}', 'i').test(card.text);
    const n = card.text.match(/(?:^|[\s(])n\d?\([^()]*\)/g); if (n) v.crewn = n.map(s => s.trim().replace(/^\(/, '')).join(' ');
    if (v.cost != null) v.coop = v.cost;
  }
  const op = ownProps(u);
  v.props = op ? plain(u, op).filter(w => !SKIP_PROPS.test(lc(w))) : [];
  const ep = effProps(u).map(lc);
  const vis = ep.filter(w => /^vision_/.test(w)), muz = ep.filter(w => /^muzzle_/.test(w));
  if (vis.length) v.vision = vis[vis.length - 1];
  if (muz.length) v.muzzle = muz[muz.length - 1];
  v.minimap = !ep.includes('no_minimap_view');
  const lod = eff(u, ['lodclass']); if (lod != null) v.lod = lc(lod);
  const inc = ((u.top && u.top.items) || []).find(c => c.type === 'list' && c.items[0] && c.items[0].type === 'atom' && /^include$/i.test(c.items[0].text) && /selection/i.test(u.own.src.slice(c.start, c.end)));
  if (inc) { const s = /scale\s*\(\s*([-\d.]+)\s*\)/i.exec(u.own.src.slice(inc.start, inc.end)); v.ring = s ? +s[1] : 1; }
  const en = keyed(u.top, 'extender', 'enumerator');
  v.numbers = !!en;
  if (en && kids(en, 'digit_folder')[0]) v.digits = lc(plain(u, kids(en, 'digit_folder')[0])[0]);
  v.armour = partLines(u);
  for (const [q, segs] of MOVE) { const x = eff(u, segs); if (x != null && !isNaN(+x)) v[q] = +x; }
  for (const f of FIELDS) { const x = fieldValue(u, f); if (x !== undefined) v[f[0]] = x; }
  const fuel = eff(u, ['chassis', 'fuelbag', 'volume']); if (fuel != null) v.fuel = +fuel;
  const g = effList(u, ['chassis', 'locomotion', 'gears']); if (g) v.gears = g;
  const rg = effList(u, ['chassis', 'locomotion', 'reargears']); if (rg) v.reargears = rg;
  const loco = kids(kids(u.top, 'chassis')[0], 'locomotion')[0], lp = loco && callIn(u, c => c.parent === loco);
  if (lp) v.locopreset = callName(lp);
  const pa = eff(u, ['patherid']); if (pa != null) v.pather = lc(pa);
  const co = eff(u, ['collider']); if (co != null) v.collider = lc(co);
  const crew = callIn(u, c => /^crew_/.test(callName(c))); if (crew) v.crew = callName(crew);
  const mp = mainPlace(R, u);
  if (mp) { v.gun = mp.weapon; const abm = callIn(u, c => /^abm_/.test(callName(c)), mp.node); if (abm) v.abm = callName(abm); }
  v.mguns = places(u).filter(p => p.weapon && !(mp && p.node === mp.node)).map(p => p.name + ' = ' + p.weapon);
  v.mounts = blockLines(u, places(u).map(p => p.node), MOUNT);
  v.bones = blockLines(u, kids(u.top, 'bone'), BONE);
  v.visors = effVisors(u);
  const tr = callIn(u, c => 'fx' in callArgs(u, c).named);
  if (tr) { const a = callArgs(u, tr).named; v.trackfx = lc(a.fx.replace(/"/g, '')); if (a.step != null && !isNaN(+a.step)) v.trackstep = +a.step; }
  const box = inventoryBox(u);
  if (box) {
    v.load = kids(box, 'item').map(n => rawOf(u, n));
    const sz = kids(box, 'size')[0]; if (sz) v.boxsize = plain(u, sz).join(' ');
    const wt = kids(box, 'weight')[0]; if (wt && !isNaN(+plain(u, wt)[0])) v.boxweight = +plain(u, wt)[0];
    v.boxclear = !!kids(box, 'clear')[0];
  }
  const ie = invExt(u); if (ie) v.slots = kids(ie, 'weapon').map(n => (plain(u, n)[0] || '') + ' = ' + ((kids(n, 'mask')[0] && plain(u, kids(n, 'mask')[0]).join(' ')) || ''));
  const sup = callIn(u, c => /^truck_/.test(callName(c))); if (sup) v.supplykind = callName(sup);
  const sz = supplyExt(u);
  if (sz) {
    const rs = kids(sz, 'resupply')[0]; if (rs) v.supplyitems = kids(rs, 'item').map(n => rawOf(u, n));
    for (const [q, k] of [['supplyradius', 'radius'], ['regenerate', 'regenerationperiod'], ['resupply', 'resupplyperiod'], ['supplylimit', 'limit']]) { const b = kids(sz, k)[0]; if (b && !isNaN(+plain(u, b)[0])) v[q] = +plain(u, b)[0]; }
  }
  v.wreck = defKeys(R, u.id + '_x').length > 0;
  const ux = unitOf(R, u.id + '_x'), uxx = unitOf(R, u.id + '_xx');
  if (ux) { const t = eff(ux, ['texmod']); if (t != null) v.wrecktexmod = lc(t); const o = eff(ux, ['obstacleid']); if (o != null) v.wreckobstacle = lc(o); }
  if (uxx) v.wreckarmour = kids(uxx.top, 'volume').map(n => plain(uxx, n)[0] + ' ' + (kids(n, 'thickness')[0] ? plain(uxx, kids(n, 'thickness')[0]).join(' ') : 'auto'));
  if (iconsOf(R, u.id).length) v.icon = u.id;
  if (card) { v.army = card.army; v.cardlike = u.id; }
  // the copy's own words where a choice has a "none" (no block), the shown name and the card flag a new vehicle starts without
  for (const q of ['simulator', 'constrain']) if (v[q] == null) v[q] = 'none';
  const lpc = callIn(u, c => /^loco_/.test(callName(c))); if (lpc) v.locopreset = callName(lpc); else delete v.locopreset;
  const nm = nameFor(R, ['desc/entity'], u.id); if (nm) v.title = nm;
  if (verb !== 'change' || v.remove == null) v.remove = false;
  if (hasIblock(R, u.id)) v.sounds = u.id;
  return v;
}

// ---------- compile helpers
const itemStr = s => s && typeof s === 'object' ? String(s.id || s.value || s.name || s.mdl || JSON.stringify(s)) : String(s == null ? '' : s);
function normV(x) {
  if (Array.isArray(x)) return JSON.stringify(x.map(s => itemStr(s).trim().replace(/\s+/g, ' ')).filter(Boolean));
  if (x == null) return '';
  if (typeof x === 'object') return itemStr(x);
  const s = String(x).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? String(+s) : s;
}
const changed = (c, id) => { const a = c.answer(id); return !!a && a.src !== 'keep' && a.src !== 'ext' && normV(c.value(id)) !== normV(c.values[id]); };
const asList = x => Array.isArray(x) ? x.map(s => itemStr(s).trim()).filter(Boolean) : String(x == null ? '' : x).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
// the source of each line of a list answer (value, keep, exist, branch, file); a plain array answer is all typed lines
const lineSrc = (c, id, i) => { const a = c.answer(id); return a && a.src === 'list' && a.items && a.items[i] ? a.items[i].src : 'value'; };
function idOf(x) { if (x && typeof x === 'object') x = x.id || x.value || x.name; const s = lc(x).trim(); return /^[a-z0-9_\-.]+$/.test(s) ? s : ''; }
function modelRef(x) {
  if (x && typeof x === 'object') x = x.mdl || x.key || x.id || x.value;
  let s = String(x || '').replace(/\\/g, '/').trim();
  if (!s) return '';
  if (/^resource\//i.test(s)) s = '/' + s.slice(9);
  return s;
}
function context(c) {
  if (!c.gameDir) throw bad('Set the game folder first (the Game folder button at the top): the task reads the vehicle it starts from.');
  const id = c.base && c.base.id;
  if (!id) throw bad('Pick the vehicle to start from first.');
  const R = readerFor(c.gameDir, c.mod, exeFor(null, c.game)), u = unitOf(R, id);
  if (!u) throw bad('The vehicle ' + id + ' is not in the game data, in your mod or in the mods it requires.', 404);
  return { R, u };
}
// replace the item lines of a box: each old line is set in place, extra old lines are deleted, extra new lines are appended
function replaceItems(u, box, lines, bag, check) {
  const its = kids(box, 'item');
  for (const l of lines) if (!check.test(l)) throw bad('Write each item as: "name" then its numbers, for example "ammo mgun" 2500.');
  lines.forEach((l, i) => { if (i < its.length) { if (rawOf(u, its[i]) !== l) bag.set({ op: 'set', path: pathOf(u, its[i]), value: l }); } else bag.append(box, 'item', l); });
  for (const n of its.slice(lines.length)) bag.del(n);
}

async function compile(draft, c) {
  const { R, u } = context(c);
  const make = c.verb !== 'change', ops = [], bag = rowBag(u), calls = [], copies = [], notes = [], texts = [];
  const ch = id => changed(c, id), val = id => c.value(id);
  let ent = u.id;
  const title = String(val('title') || '').trim();
  if (make) {
    const nid = lc(val('newid')).trim();
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(nid)) throw bad('The new id must be small letters, digits and _, 2 to 41 characters, starting with a letter.');
    if (/_x+$/.test(nid)) throw bad('Do not end the new id with _x: that name is kept for the wreck.');
    if (nid === u.id || defKeys(R, nid).length) throw bad('A vehicle with the id ' + nid + ' already exists. Pick another id.');
    ent = nid;
    // the gen wreck step clones _x and _xx at the end of the run by itself; only when this task changes the wreck are they cloned
    // here first (the wreck step skips a wreck already cloned), so the wreck rows below have the copies to edit
    const wreckRows = ['wrecktexmod', 'wreckobstacle', 'wreckarmour'].some(ch);
    if (val('wreck') === false) ops.push({ op: 'clone', entity: u.id, as: nid, wreck: false });
    else {
      ops.push({ op: 'clone', entity: u.id, as: nid });
      if (wreckRows) for (const sx of ['_x', '_xx']) if (defKeys(R, u.id + sx).length) ops.push({ op: 'clone', entity: u.id + sx, as: nid + sx });
    }
    if (!title) notes.push('No display name was given: the buy panel shows the id until a name is written.');
  } else if (!u.mine) notes.push(u.key + ' is copied whole into your mod and changed there (a whole file override).');
  // texts: the gen text finish writes them into the mod's .lng
  if (title && (make || ch('title'))) texts.push({ key: 'desc/entity/' + ent, text: title });
  if (String(val('info') || '').trim() && (make || ch('info'))) texts.push({ key: 'info/entity/' + ent, text: String(val('info')).trim() });
  // model
  const ma = c.answer('model');
  const extNode = () => { const e = kids(u.top, 'extension').filter(n => /\.mdl$/i.test(plain(u, n)[0] || '')); return e.length ? e[e.length - 1] : null; };
  const extRow = v => { const n = extNode(); return n ? { op: 'set', path: pathOf(u, n), value: '"' + v + '"' } : rowFor(u, ['extension'], '"' + v + '"'); };
  if (ma && ma.src === 'ext') notes.push('Model: edit it in the outside program and save it into your mod, then run this task again and pick the file.');
  else if (ma && ma.src === 'file') {
    const dir = make ? 'resource/entity/' + u.cls + '/' + ent : u.dir;
    let mdl = null;
    for (const f of [].concat(val('model') || [])) { const n = path.basename(String(f)); copies.push({ staged: n, to: dir + '/' + n }); if (/\.mdl$/i.test(n)) mdl = n; }
    if (mdl) bag.set(extRow(mdl)); else notes.push('Model: no .mdl among the files, so the vehicle still uses its old model.');
  } else if (ch('model')) { const m = modelRef(val('model')); if (m) bag.set(extRow(m)); }
  // skin: on change the skin task writes the def itself; on make its variant name goes on the copy [I]
  const sk = c.answer('skin');
  if (sk && sk.src === 'branch' && make) {
    const r = val('skin'), name = r && typeof r === 'object' ? r.texmod || r.id : r;
    if (typeof name === 'string' && /^[A-Za-z0-9_]+$/.test(name)) bag.set(rowFor(u, ['texmod'], '"' + name + '"'));
  }
  // props, sight, muzzle, minimap: one props line
  if (ch('props') || ch('vision') || ch('muzzle') || ch('minimap')) {
    const op = ownProps(u), ownW = op ? plain(u, op).map(lc) : [];
    const w = asList(val('props')).map(lc).filter(x => !SKIP_PROPS.test(x));
    if (val('vision') && (ch('vision') || ownW.some(x => /^vision_/.test(x)))) w.push(lc(val('vision')));
    if (val('muzzle') && (ch('muzzle') || ownW.some(x => /^muzzle_/.test(x)))) w.push(lc(val('muzzle')));
    if (val('minimap') === false) w.push('no_minimap_view');
    const line = w.filter((x, i) => w.indexOf(x) === i).map(x => '"' + x + '"').join(' ');
    bag.set(op ? { op: 'set', path: pathOf(u, op), value: line } : rowFor(u, ['props'], line));
    if (ch('minimap') && val('minimap') === true && !ownW.includes('no_minimap_view')) notes.push('Minimap: no_minimap_view comes from a shared file, so the icon stays hidden.');
  }
  if (ch('lod')) bag.set(rowFor(u, ['lodclass'], '"' + lc(val('lod')) + '"'));
  if (ch('ring')) ops.push({ op: 'macro', entity: ent, macro: 'include', match: 'selection', arg: 'scale', value: String(+val('ring')), add: true });
  // turret numbers (enumerator extender)
  const en = keyed(u.top, 'extender', 'enumerator');
  if (ch('numbers')) { if (val('numbers') === true || val('numbers') === 'true') { if (!en && !ch('digits')) bag.append(u.top, 'extender', '"enumerator"'); } else if (en) bag.del(en); }
  if (ch('digits')) {
    if (!en && !(val('numbers') === true)) throw bad('Turret numbers are off for ' + u.id + ': answer Yes to turret numbers first.');
    if (en) { const d = kids(en, 'digit_folder')[0]; bag.set(d ? { op: 'set', path: pathOf(u, d), value: quote(lc(val('digits'))) } : { op: 'add', path: pathOf(u, en) + '/digit_folder', value: quote(lc(val('digits'))) }); }
    else bag.append(u.top, 'extender', '"enumerator" {digit_folder ' + quote(lc(val('digits'))) + '}');
  }
  // armour lines
  if (ch('armour')) ops.push(...partOps(u, ent, c.values.armour, asList(val('armour'))));
  // movement and the other one value fields
  for (const [q, segs] of MOVE) if (ch(q)) bag.set(rowFor(u, segs, String(+val(q))));
  for (const f of FIELDS) if (ch(f[0])) fieldRows(u, f, val(f[0]), bag);
  if (ch('fuel')) { bag.set(rowFor(u, ['chassis', 'fuelbag', 'volume'], String(+val('fuel')))); bag.set(rowFor(u, ['chassis', 'fuelbag', 'remain'], String(+val('fuel')))); }
  for (const q of ['gears', 'reargears']) if (ch(q)) {
    const g = asList(val(q)).join(' ').split(/\s+/).filter(Boolean);
    if (!g.length || g.length > 5 || g.some(x => isNaN(+x))) throw bad('Gears: 1 to 5 numbers, rising, for example 0.2 0.5 1.0.');
    bag.set(rowFor(u, ['chassis', 'locomotion', q], g.join(' ')));
  }
  const rename = (q, call) => {
    if (!ch(q)) return;
    if (!call) throw bad('The ' + q + ' preset of ' + u.id + ' comes from a shared file, so this task cannot swap it.');
    const n = nthOf(u, call), op = { op: 'macro', entity: ent, macro: callName(call), rename: lc(val(q)) };
    if (n.count > 1) op.nth = n.nth;
    ops.push(op);
  };
  // the movement preset of a towed gun (properties/cannon_armor.ext loco_*), not the locomotion parameters of other vehicles
  rename('locopreset', callIn(u, x => /^loco_/.test(callName(x))));
  if (ch('pather')) bag.set(rowFor(u, ['patherid'], '"' + lc(val('pather')) + '"'));
  if (ch('collider')) bag.set(rowFor(u, ['collider'], '"' + lc(val('collider')) + '"'));
  rename('crew', callIn(u, x => /^crew_/.test(callName(x))));
  // guns
  const mp = mainPlace(R, u);
  if (ch('gun')) {
    const g = idOf(val('gun'));
    if (!g) throw bad('Pick the gun from the game list or open a gun task.');
    if (!mp) throw bad(u.id + ' has no main gun place this task can swap.');
    ops.push({ op: 'weapon', entity: ent, weapon: g, place: mp.name });
  }
  if (ch('mguns')) {
    const ps = places(u), baseL = c.values.mguns || [], ls = [].concat(val('mguns') || []);
    ls.forEach((x, i) => {
      // a typed line is "place = weapon"; a picked or branched line is the weapon for the place of the base line at that spot
      const s = itemStr(x).trim(), src = lineSrc(c, 'mguns', i);
      let place, weapon;
      const m = /^([^=]+?)\s*=\s*([a-z0-9_\-.]+)$/i.exec(s);
      if (m && src !== 'exist' && src !== 'branch') { place = m[1]; weapon = m[2]; }
      else { const b = /^([^=]+?)\s*=/.exec(baseL[i] || ''); if (!b) throw bad('Line ' + (i + 1) + ' of the mounts has no place: write it as place = weapon.'); place = b[1]; weapon = idOf(x); }
      const p = ps.find(y => lc(y.name) === lc(place) && y.wnode);
      if (!p) throw bad('"' + place + '" is not a weapon place of ' + u.id + '.');
      if (!weapon || lc(weapon) === p.weapon) return;
      if (src !== 'branch' && !stuffOf(R, weapon).length) throw bad('There is no weapon "' + weapon + '" in the game data.');
      // the gen weapon op mounts any stuff folder (mgun, flame, reactive ...); the ammo lines of the inventory stay as they are [T]
      ops.push({ op: 'weapon', entity: ent, weapon: lc(weapon), place: p.name });
    });
  }
  rename('abm', mp && callIn(u, x => /^abm_/.test(callName(x)), mp.node));
  if (ch('mounts')) blockRows(u, 'mount', places(u).map(p => p.node), MOUNT, c.values.mounts || [], asList(val('mounts')), bag);
  if (ch('bones')) blockRows(u, 'bone', kids(u.top, 'bone'), BONE, c.values.bones || [], asList(val('bones')), bag);
  if (ch('visors')) {
    const vs = visors(u), base = new Set((c.values.visors || []).map(lc));
    for (const l of asList(val('visors'))) {
      if (base.has(lc(l))) continue;
      const m = /^(\S+) ([a-z0-9_\-]+)$/i.exec(l);
      if (!m) throw bad('Write each view port as: name vision, for example main vehicle_main.');
      const n = vs.find(x => lc(plain(u, x)[0]) === lc(m[1]));
      if (!n) throw bad('The view port "' + m[1] + '" comes from a shared file of ' + u.id + ' (vehicle.ext): its vision can be changed only on a vehicle that has its own sensor block.');
      const vi = kids(n, 'vision')[0];
      bag.set(vi ? { op: 'set', path: pathOf(u, vi), value: quote(lc(m[2])) } : { op: 'add', path: pathOf(u, n) + '/vision', value: quote(lc(m[2])) });
    }
  }
  // effects
  const tr = callIn(u, x => 'fx' in callArgs(u, x).named);
  for (const [q, arg] of [['trackfx', 'fx'], ['trackstep', 'step']]) if (ch(q)) {
    if (!tr) throw bad(u.id + ' leaves no track marks of its own to change.');
    const n = nthOf(u, tr), op = { op: 'macro', entity: ent, macro: callName(tr), arg, value: String(val(q)), add: true };
    if (n.count > 1) op.nth = n.nth;
    ops.push(op);
  }
  // inventory
  const box = inventoryBox(u), needBox = q => { if (!box) throw bad(u.id + ' takes its inventory from a shared file, so this task cannot change ' + q + '.'); };
  if (ch('load')) {
    needBox('what it carries');
    const baseL = c.values.load || [], cnt = l => (/"\s+(\S.*)$/.exec(l || '') || [])[1] || '1';
    const lines = [].concat(val('load') || []).map((x, i) => { const src = lineSrc(c, 'load', i); return src === 'exist' || src === 'branch' ? '"' + idOf(x) + '" ' + cnt(baseL[i]) : itemStr(x).trim(); }).filter(Boolean);
    replaceItems(u, box, lines, bag, /^"[^"]+"(\s+\S+)*$/);
  }
  if (ch('boxsize')) { needBox('its size'); if (!/^\d+ \d+$/.test(String(val('boxsize')).trim())) throw bad('Inventory size: two whole numbers, width then height, for example 8 6.'); const n = kids(box, 'size')[0]; bag.set(n ? { op: 'set', path: pathOf(u, n), value: String(val('boxsize')).trim() } : { op: 'add', path: pathOf(u, box) + '/size', value: String(val('boxsize')).trim() }); }
  if (ch('boxweight')) { needBox('its weight'); const n = kids(box, 'weight')[0]; bag.set(n ? { op: 'set', path: pathOf(u, n), value: String(+val('boxweight')) } : { op: 'add', path: pathOf(u, box) + '/weight', value: String(+val('boxweight')) }); }
  if (ch('boxclear')) { needBox('the clear switch'); const n = kids(box, 'clear')[0]; if (val('boxclear') === true && !n) bag.set({ op: 'add', path: pathOf(u, box) + '/clear', value: '' }); else if (val('boxclear') !== true && n) bag.del(n); }
  if (ch('slots')) {
    const ie = invExt(u); if (!ie) throw bad(u.id + ' takes its weapon slots from a shared file.');
    const ws = kids(ie, 'weapon'), base = new Set((c.values.slots || []).map(lc));
    for (const l of asList(val('slots'))) {
      if (base.has(lc(l))) continue;
      const m = /^(\S+)\s*=\s*(.+)$/.exec(l); if (!m) throw bad('Write each slot as: slot = words, for example mgun = weapon mgun.');
      const n = ws.find(x => lc(plain(u, x)[0]) === lc(m[1])); if (!n) throw bad('"' + m[1] + '" is not a weapon slot of ' + u.id + '.');
      const mk = kids(n, 'mask')[0], v = m[2].trim().split(/\s*,\s*/).map(quote).join(' ');
      bag.set(mk ? { op: 'set', path: pathOf(u, mk), value: v } : { op: 'add', path: pathOf(u, n) + '/mask', value: v });
    }
  }
  // supply trucks
  rename('supplykind', callIn(u, x => /^truck_/.test(callName(x))));
  const sz = supplyExt(u), needSz = () => { if (!sz) throw bad(u.id + ' is not a supply vehicle of its own: start from a supply truck.'); };
  if (ch('supplyitems')) { needSz(); const rs = kids(sz, 'resupply')[0]; if (!rs) throw bad(u.id + ' has no resupply list of its own.'); replaceItems(u, rs, asList(val('supplyitems')), bag, /^"[^"]+"(\s+\S+)*$/); }
  for (const [q, k] of [['supplyradius', 'radius'], ['regenerate', 'regenerationPeriod'], ['resupply', 'resupplyPeriod'], ['supplylimit', 'limit']]) if (ch(q)) {
    needSz(); const n = kids(sz, lc(k))[0];
    bag.set(n ? { op: 'set', path: pathOf(u, n), value: String(+val(q)) } : { op: 'add', path: pathOf(u, sz) + '/' + k, value: String(+val(q)) });
  }
  if (bag.size) ops.push({ op: 'set', rows: bag.rows().map(r => Object.assign({ entity: ent }, r)) });
  // wreck: the _x def (paint, obstacle) and the _xx def (part armour)
  const wr = (sx, q, fn) => {
    if (!ch(q)) return;
    if (make && val('wreck') === false) throw bad('No wreck is copied, so the wreck answers cannot be written: answer Yes to the wreck.');
    const w = unitOf(R, u.id + sx); if (!w) throw bad(u.id + ' has no ' + sx + ' wreck.');
    const b = rowBag(w); fn(w, b);
    if (b.size) ops.push({ op: 'set', rows: b.rows().map(r => Object.assign({ entity: ent + sx }, r)) });
  };
  wr('_x', 'wrecktexmod', (w, b) => b.set(rowFor(w, ['texmod'], quote(lc(val('wrecktexmod'))))));
  wr('_x', 'wreckobstacle', (w, b) => b.set(rowFor(w, ['obstacleid'], quote(lc(val('wreckobstacle'))))));
  wr('_xx', 'wreckarmour', (w, b) => {
    // every wreck part is listed: millimetres, or auto (no number of its own: the game default)
    const vols = kids(w.top, 'volume'), base = new Set((c.values.wreckarmour || []).map(s => lc(String(s).trim().replace(/\s+/g, ' '))));
    for (const raw of asList(val('wreckarmour'))) {
      const l = raw.replace(/\s+/g, ' ');
      if (base.has(lc(l))) continue;
      const m = /^(\S+) (auto|\d+(\.\d+)?)$/i.exec(l); if (!m) throw bad('Write each wreck part as: name millimetres, for example part1 10, or name auto.');
      const n = vols.find(x => lc(plain(w, x)[0]) === lc(m[1])); if (!n) throw bad('"' + m[1] + '" is not a part of the wreck. Its parts: ' + vols.map(x => plain(w, x)[0]).join(', '));
      const t = kids(n, 'thickness')[0];
      if (lc(m[2]) === 'auto') { if (t) b.del(t); continue; }
      b.set(t ? { op: 'set', path: pathOf(w, t), value: m[2] } : { op: 'add', path: pathOf(w, n) + '/thickness', value: m[2] });
    }
  });
  // sounds: the interaction block keyed by the unit id
  const sa = c.answer('sounds');
  if (make) {
    const like = sa && sa.src !== 'keep' ? idOf(val('sounds')) : u.id;
    if (like && hasIblock(R, like)) ops.push({ op: 'iblock', entity: ent, like });
    else notes.push('Sounds: ' + (like || u.id) + ' has no sound block of its own, so the new vehicle uses the shared sounds of its kind.');
  } else if (ch('sounds')) {
    const like = idOf(val('sounds'));
    if (hasIblock(R, u.id)) notes.push('Sounds: ' + u.id + ' already has its own sound block. Change that block by hand on the IDE tab; nothing was copied.');
    else if (like) ops.push({ op: 'iblock', entity: u.id, like });
  }
  // buy card
  // a new vehicle may copy the buy card of another vehicle (its card form and fields) into any army that has a vehicle list
  const sell = val('sell') === true || val('sell') === 'true', cla = c.answer('cardlike');
  const likeId = make && cla && cla.src !== 'keep' ? idOf(val('cardlike')) || u.id : u.id;
  const card = likeId === u.id ? u.card : cardOf(R, likeId), fields = {};
  if (make && sell && likeId !== u.id && !card) throw bad(likeId + ' has no buy card to copy. Pick a vehicle that is in the buy panel.');
  let army = card && card.army;
  if (make && ch('army')) {
    army = idOf(val('army')) || lc(val('army')).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(army)) throw bad('The army is its short code, for example rus or ger.');
    if (!R.has('resource/set/multiplayer/units/vehicles_' + army + '.set')) throw bad('The army ' + army + ' has no vehicle list (units/vehicles_' + army + '.set). Make the army first with the army task.');
  }
  // tags as word edits (word adds, -word removes) and the three card flags, as the gen card and roster ops take them
  const baseTags = (c.values.tags || []).map(lc);
  let tagWords = asList(c.value('tags')).map(lc);
  if (ch('limit') && sell) {
    const n = +val('limit');
    if (!(n >= 0) || Math.floor(n) !== n) throw bad('Buy limit: a whole number, 0 or more.');
    const limitTag = 'lim_' + ent;
    if (!tagWords.includes(limitTag)) tagWords = tagWords.concat(limitTag);
    ops.push({ op: 'preset', file: 'presets_all.inc', name: 'all', set: { unitLimits: limitTag + '=' + n } });
  }
  const tagEdits = tagWords.filter(w => !baseTags.includes(w)).concat(baseTags.filter(w => !tagWords.includes(w)).map(w => '-' + w));
  if (tagEdits.some(w => /\s/.test(w))) throw bad('Card tags: one word per line, small letters, digits and _.');
  const flags = {};
  for (const [q, k] of [['notforsale', 'not_for_sale'], ['basic', 'basic'], ['remove', 'remove']]) if (ch(q)) flags[k] = val(q) === true || val(q) === 'true';
  // named card keys of the gen card op; the rest go in fields (a key the card lacks is added as a line on change)
  const named = {};
  if (ch('cost')) named.price = +val('cost');
  if (ch('cp')) named.cp = +val('cp');
  if (ch('score')) named.score = +val('score');
  if (ch('cardinfo')) named.info = String(val('cardinfo')).trim();
  for (const q of ['level', 'charge', 'fore', 'group', 'button', 'cw', 'content', 'tow']) if (ch(q)) {
    const k = cardKey(card, q) || (CARD[q] || [q])[0];
    fields[k] = QUOTED.includes(q) ? quote(val(q)) : String(val(q)).trim();
  }
  if (ch('crewn')) for (const m of String(val('crewn')).matchAll(/\b(n\d?)\s*\(\s*(\d+)\s*\)/g)) fields[m[1]] = m[2];
  let icon = null;
  const ia = c.answer('icon');
  if (ia && ia.src !== 'keep') icon = idOf(val('icon'));
  else if (make && iconsOf(R, u.id).length) icon = u.id;
  if (icon && !iconsOf(R, icon).length) { notes.push('Icons: ' + icon + ' has no buy panel picture to copy.'); icon = null; }
  if (make) {
    if (sell && !card) throw bad(u.id + ' has no buy card to copy. Pick a vehicle that is in the buy panel, or answer No to selling it.');
    if (sell) {
      // the roster copies the card, then sets the fields; price, cp, score and info are card fields there too
      if (named.price != null) fields[cardKey(card, 'cost') || 'cost'] = String(named.price);
      if (named.cp != null) fields[cardKey(card, 'cp') || 'cp'] = String(named.cp);
      if (named.score != null) fields[cardKey(card, 'score') || 'sc'] = String(named.score);
      if (named.info != null) fields[cardKey(card, 'cardinfo') || 'info'] = quote(named.info);
      const r = Object.assign({ op: 'roster', unit: ent, like: likeId, army, fields }, flags);
      if (tagEdits.length) r.tags = tagEdits;
      if (icon) r.icon_like = icon;
      ops.push(r);
      if (ch('coop')) ops.push({ op: 'card', unit: ent, army, list: 'cooperative', fields: { [cardKey(card, 'cost') || 'cost']: String(+val('coop')) } });
    } else notes.push('No buy card: place the vehicle with the map editor or a mission.');
  } else if (card) {
    // taking a vehicle off the buy panel: the card gets {remove} [T]
    if (ch('sell') && !sell && !ch('remove')) flags.remove = true;
    const r = Object.assign({ op: 'card', unit: u.id, army: card.army }, named, flags);
    if (Object.keys(fields).length) r.fields = fields;
    if (tagEdits.length) r.tags = tagEdits;
    if (icon && ch('icon')) r.icon_like = icon;
    if (Object.keys(r).length > 3) ops.push(r);
    if (ch('coop')) ops.push({ op: 'card', unit: u.id, army: card.army, list: 'cooperative', fields: { [cardKey(card, 'cost') || 'cost']: String(+val('coop')) } });
  } else if (sell || Object.keys(fields).length || Object.keys(named).length) notes.push(u.id + ' has no buy card, so the buy answers were not written.');
  if (texts.length) ops.push({ op: 'text', items: texts });
  return { gen: ops.length ? { ops } : null, calls, copies, notes, result: ent };
}

// what a branch gets: the gun, mount or item of its line, the vehicle for a skin or icon
async function pass(parent, qid, ctx, o) {
  const g = gameOfCtx(ctx), id = parent && parent.base && parent.base.id;
  if (!g || !id) return null;
  await warm(g, parent.mod || '', exeFor(ctx, parent.game));
  const R = readerFor(g, parent.mod || '', exeFor(ctx, parent.game)), u = unitOf(R, id);
  if (!u) return null;
  if (qid === 'skin' || qid === 'icon') return { for: 'vehicle', base: { id: u.id } };
  if (qid === 'gun') { const mp = mainPlace(R, u); return mp ? { for: 'vehicle', base: { id: mp.weapon } } : { for: 'vehicle' }; }
  if (qid === 'mguns' && o && typeof o.line === 'number') { const p = places(u).filter(x => x.weapon && x !== mainPlace(R, u))[o.line]; return p ? { for: 'vehicle', base: { id: p.weapon } } : { for: 'vehicle' }; }
  return { for: 'vehicle' };
}

// ---------- crew preset against the model: the doors and link bones a crew preset needs must be bones of the model, or nobody can
// get in and the vehicle is never driven, with no log line (PORT-137). Expands the def twice (with the picked preset, and with no
// crew call) and keeps what only the preset brings.
const crewCall = u => callIn(u, c => /^crew_/.test(callName(c)));
function crewBones(R, u, preset) {
  const call = crewCall(u); if (!call) return null;
  const src = u.own.src, at = call.items[0];
  const text = preset ? src.slice(0, at.start) + '"' + preset + '"' + src.slice(at.end) : src.slice(0, call.start) + src.slice(call.end);
  const open = r => { const b = r && r.kind === 'virtual' ? R.read(r.key) : null; return b ? { buf: b, file: r.key, key: r.key } : null; };
  let full = null, unknown = false;
  const onError = (f, l, code, msg) => { if (preset && code === 'MACRO_UNDEFINED' && lc(msg).includes(preset)) unknown = true; };
  try { full = (SX.read(Buffer.from(text, 'latin1'), { file: u.key, key: u.key, open, onError }).root.items || []).find(n => n.k === 'BLOCK'); } catch { return null; }
  // place -> the doors that lead to it (boarder link), and the link bones of the places
  const out = { unknown, places: new Map(), bones: new Map() };
  (function walk(b, inB, inP) {
    for (const x of (b && b.items) || []) if (x.k === 'BLOCK' && x.items[0]) {
      const n = lc(x.items[0].text), v = valsOf(x) || [];
      if (inB && n === 'link' && v[0] != null && v[1] != null) { const pl = lc(v[1]); if (!out.places.has(pl)) out.places.set(pl, new Set()); out.places.get(pl).add(lc(v[0])); }
      if (inP && n === 'place' && v[0] != null) { const lb = x.items.find(y => y.k === 'BLOCK' && y.items[0] && lc(y.items[0].text) === 'linkbone'); const w = lb && valsOf(lb); if (w && w[0] != null) out.bones.set(lc(v[0]), lc(w[0])); }
      walk(x, inB || n === 'boarder', inP || n === 'placer');
    }
  })(full, false, false);
  return out;
}
// the bone names of a model: a game or mod key, or a staged upload (path on disk)
function mdlBones(R, ref, disk) {
  let buf = null;
  if (disk) { try { buf = fs.readFileSync(disk); } catch { buf = null; } } else if (ref) buf = R.read(ref);
  if (!buf) return null;
  return new Set([...buf.toString('latin1').matchAll(/\{\s*bone\s+"([^"]+)"/gi)].map(m => lc(m[1])));
}
// the model the draft ends up with: {key} in the game view, {disk} for an upload, or null when it cannot be read (an outside program)
function modelOfDraft(ctx, d, u) {
  const a = d && d.answers && d.answers.model;
  const ownKey = () => { const e = kids(u.top, 'extension').map(n => plain(u, n)[0] || '').filter(s => /\.mdl$/i.test(s)).pop(); return e ? (e.startsWith('/') ? 'resource' + e : u.dir + '/' + e) : null; };
  if (!a || a.src === 'keep') return { key: ownKey() };
  if (a.src === 'ext') return null;
  if (a.src === 'file') {
    const names = [].concat(a.value || a.names || a.files || []).map(x => typeof x === 'object' ? x.name || x.value : x).map(String);
    const mdl = names.find(n => /\.mdl$/i.test(n)); if (!mdl) return { key: ownKey() };
    try { return { disk: require('../lib/draft').stagedPath(ctx, d.id, path.basename(mdl)) }; } catch { return null; }
  }
  const m = modelRef(a.value); if (!m) return { key: ownKey() };
  return { key: /^\//.test(m) ? 'resource' + m : /\//.test(m) ? m : u.dir + '/' + m };
}
// -> {ok, missing: [bone], model} | null (nothing to check)
function crewFit(R, u, preset, model) {
  if (!preset || !model) return null;
  const need = crewBones(R, u, lc(preset)), base = crewBones(R, u, null), have = mdlBones(R, model.key, model.disk);
  if (!need || !have) return null;
  const where = model.key || (model.disk && path.basename(model.disk));
  if (need.unknown) return { ok: false, unknown: true, missing: [], model: where };
  // a place the preset brings is reached when one of its doors is a bone of the model; its link bone must be one too
  const missing = [];
  for (const [pl, doors] of need.places) {
    if (base && base.places.has(pl)) continue;
    if (![...doors].some(d => have.has(d))) missing.push([...doors].join(' or '));
    const lb = need.bones.get(pl); if (lb && !have.has(lb)) missing.push(lb);
  }
  if ([...need.places.keys()].some(pl => /%/.test(pl)) || missing.some(m => /%/.test(m))) return { ok: false, unknown: true, missing: [], model: where };
  return { ok: !missing.length, missing: missing.filter((m, k) => missing.indexOf(m) === k), model: where };
}
async function crewRoute(url, b, ctx) {
  const q = k => (url && url.searchParams ? url.searchParams.get(k) : null) || '';
  const D = require('../lib/draft'); let d;
  try { d = D.load(ctx, q('draft')); } catch { return { ok: true, skip: 'draft' }; }
  const g = gameOfCtx(ctx) || ctx.gameDir; if (!g || !d || !d.base || !d.base.id) return { ok: true, skip: 'base' };
  await warm(g, d.mod || '', exeFor(ctx, d.game));
  const R = readerFor(g, d.mod || '', exeFor(ctx, d.game)), u = unitOf(R, d.base.id); if (!u) return { ok: true, skip: 'base' };
  const preset = lc(q('preset'));
  if (!/^crew_[a-z0-9_]+$/.test(preset)) throw bad('Pick a crew preset from the list.');
  const f = crewFit(R, u, preset, modelOfDraft(ctx, d, u));
  return f ? Object.assign({ ok: f.ok }, f) : { ok: true, skip: crewCall(u) ? 'model' : 'shared' };
}

// the armies that have a vehicle list (game, the mod's Require deps and the mod): units/vehicles_<army>.set
async function lookupArmy(ctx, w, opt) {
  const g = gameOfCtx(ctx); if (!g) return [];
  await warm(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game));
  const R = readerFor(g, (opt && opt.mod) || ctx.mod || '', exeFor(ctx, opt && opt.game)), ws = qwords(w), out = [];
  for (const k of R.keys(/^resource\/set\/multiplayer\/units\/vehicles_[a-z0-9_]+\.set$/)) {
    const id = k.replace(/^.*vehicles_|\.set$/g, '');
    if (ws.length && !ws.every(x => id.includes(x))) continue;
    out.push({ id, name: id, where: 'units/vehicles_' + id + '.set', ref: null, sub: R.mine(k) ? 'mod' : 'game' });
  }
  return out;
}
// Check: the crew preset the draft ends with against the model it ends with (PORT-137), in plain words
async function check(d, ctx) {
  const g = gameOfCtx(ctx) || (ctx && ctx.gameDir); if (!g || !d || !d.base || !d.base.id) return [];
  await warm(g, d.mod || '', exeFor(ctx, d.game));
  const R = readerFor(g, d.mod || '', exeFor(ctx, d.game)), u = unitOf(R, d.base.id); if (!u) return [];
  const a = d.answers && d.answers.crew, cc = crewCall(u);
  const preset = a && a.src === 'value' && a.value ? lc(a.value) : cc ? callName(cc) : null;
  if (!preset) return [{ title: 'Crew and doors', level: 'info', lines: ['The crew comes from a shared file of ' + u.id + ', so its doors are the ones the copy already has.'] }];
  const f = crewFit(R, u, preset, modelOfDraft(ctx, d, u));
  if (!f) return [{ title: 'Crew and doors', level: 'info', lines: ['The model is made in an outside program, so its doors were not read. Check in game that the crew can get in and drive.'] }];
  if (f.unknown) return [{ title: 'Crew and doors', level: 'error', lines: ['The crew preset ' + preset + ' is not known to this kind of vehicle, so it gets no crew. Pick a preset from the same kind of vehicle.'] }];
  if (!f.ok) return [{ title: 'Crew and doors', level: 'error', lines: ['The model ' + f.model + ' has no bone ' + f.missing.join(', ') + '. The crew preset ' + preset + ' needs it to get in, so nobody can drive the vehicle and the game writes no error.', 'Pick a crew preset of a vehicle with the same doors, or add the bone to the model.'] }];
  return [{ title: 'Crew and doors', level: 'info', lines: ['The model has every door and seat bone the crew preset ' + preset + ' needs.'] }];
}

const lib = { reader, readerFor, warm, gidOf, exeFor, unitOf, defKeys, kids, plain, keyed, pathOf, rowFor, rowBag, ownCalls, callName, callArgs, nthOf, partLines, partOps, lookupVehicle, lookupGun, changed, asList, normV, context, bad, lc, quote, effBlock, valsOf, effProps, crewFit, modelOfDraft, nameFor, ARMOUR_RE };

// ---------- the recipe
const Q = (id, kind, covers, o) => Object.assign({ id, kind, ask: 'task.vehicle.q.' + id, help: 'task.vehicle.h.' + id, covers }, o || {});
// a number question: census range and unit, then RANGE (the game value inside, with headroom) where the census has one value only
const rng = (id, L) => {
  const r = RANGE[id]; if (r) { L.min = r[0]; L.max = r[1]; if (r[2]) L.limit = r[2]; }
  const u = USUAL[id];
  if (u) { const lo = L.min != null ? Math.max(L.min, u[0]) : u[0], hi = L.max != null ? Math.min(L.max, u[1]) : u[1]; if (lo <= hi) L.usual = [lo, hi]; }
  return L;
};
const N = (id, key, o) => Q(id, 'number', [key], { limits: rng(id, lim(key, o)) });
// a FIELDS question: number, yes/no, word (a choice of the game's own words), list or raw text
function F(id, o) {
  const f = FIELD.get(id), key = f[1], t = f[3];
  if (t === 'num') return N(id, key, o);
  if (t === 'flag' || t === 'bit' || t === 'hold') return Q(id, 'yesno', [key], { limits: lim(key, o) });
  if (t === 'words') return Q(id, 'list', [key], { limits: Object.assign({ re: '^-?[A-Za-z0-9_ ]+$' }, lim(key, o)) });
  if (t === 'word' && CH[id]) return C(id, [key], { limits: lim(key, o) });
  return Q(id, 'text', [key], { optional: true, limits: Object.assign({ re: t === 'raw' ? '^[A-Za-z0-9_." ]+$' : '^[A-Za-z0-9_.\\-]+$' }, lim(key, o)) });
}
const K = (reason, ...keys) => keys.map(k => [k, reason]);
// number ranges where every game vehicle has the same value (census min = max) or a slow unit would be refused: the game value sits
// inside, with headroom the engine allows (scan of all 349 game vehicles with values(): scratch vscan, 2026-11-12)
const RANGE = {
  hearing: [0, 20, 'VIS-04'], gearswitch: [0, 3], maxslope: [10, 80, 'MOV-21'], fallslope: [15, 89, 'MOV-21'], sideslope: [10, 90],
  sideslopespeed: [1, 60], elevacc: [0.5, 10], elevspeed: [1, 20], manualacc: [0.5, 3], recognize: [0.05, 5],
  supplyradius: [3, 50], regenerate: [5, 120], resupply: [1, 30], supplylimit: [10, 1000], boxweight: [0, 50000],
  speedslow: [1, 60, 'MOV-07'], speednormal: [1, 90, 'MOV-07'], speedfast: [1, 130, 'MOV-07'], maxspeed: [1, 150], turnspeed: [1, 60],
};
// limits.usual: the lowest and highest value the 349 game vehicles use (their values() read, scratch scan); outside it the page
// warns under the field and still takes the answer. Supply numbers: the shared supply file of the game trucks.
const USUAL = {
  ring: [0.5, 3], mass: [50, 1500000], maxspeed: [2, 95], starttime: [1, 20], braketime: [0.6, 15], stoptime: [0.2, 10], turnradius: [2, 90],
  speedslow: [10, 25], speednormal: [4, 65], speedfast: [25, 90], fuelrate: [3, 300], steeron: [15, 30], steeroff: [15, 40], spline: [1, 5],
  sideslope: [45, 90], sideslopespeed: [25, 25], elevacc: [2, 2], elevspeed: [6, 6], recognize: [0.25, 0.25], cost: [50, 2400], hearing: [4.5, 4.5],
  turnspeed: [5, 20], restoreik: [4, 10], trackstep: [0.07, 0.56], level: [1, 18], charge: [0, 300], cp: [0, 40], score: [0, 120], cw: [0, 2],
  coop: [50, 2400], turntime: [2, 60], turnstart: [0.6, 6], turnstop: [0.5, 1.1], gearswitch: [0.5, 0.5], manualacc: [1, 1], fallslope: [60, 60],
  maxslope: [50, 50], boxweight: [25000, 25000], supplyradius: [10, 10], regenerate: [30, 30], resupply: [3, 3],
};
// the allowed words of each word question, from the game's own files (choice: each has a label task.vehicle.v.<q>.<word>).
// pather: set/pather.set profiles; collider: set/colliders.set; obstacle: set/registry/obstacles.reg; target selector: set/target/*.inc;
// crew: properties/*_crew.ext (presets that take no arguments); abm: properties abm_* defines; tracks: entity/fx/common;
// loco: properties/cannon_armor.ext; armies: set/multiplayer/units/vehicles_<army>.set; the rest: every value game vehicles use
const CH = {
  pather: ['tank', 'tank.light', 'armored', 'amphibia', 'vehicle.large', 'vehicle.small', 'moto', 'cannon.large', 'cannon.small', 'cannon.carried', 'cannon.micro', 'airborne', 'railway', 'water', 'shallow_water', 'shallow_water_0', 'deep_water', 'deep_water_0'],
  collider: ['tank.heavy', 'tank.medium', 'tank.light', 'armored', 'truck', 'car', 'moto', 'cannon', 'cannon_small', 'goliath'],
  obstacle: ['tank', 'marine', 'unbreakable', 'nothing'],
  wreckobstacle: ['tank', 'unbreakable', 'nothing'],
  simulator: ['none', 'water', 'airborne'],
  constrain: ['ground', 'none'],
  targetselector: ['tank', 'tank_bullet', 'cannon_shell', 'cannon_bullet', 'cannon_rocket', 'moto', 'searchlight'],
  crew: ['crew_2_human', 'crew_3_human', 'crew_4_human', 'crew_4_human_extended', 'crew_inside', 'crew_gunner', 'crew_gun', 'crew_stan_gunner', 'crew_wheeled_gun'],
  abm: ['abm_low', 'abm_medium', 'abm_high', 'abm_mgun', 'abm_mgun_heavy', 'abm_field_gun', 'abm_howitzer', 'abm_zenite'],
  trackfx: ['tracks_sm', 'tracks_sm2', 'tracks_mid', 'tracks_big', 'tracewheel01', 'tracewheel01a', 'tracewheel02', 'tracewheel02a', 'tracewheel03', 'tracewheel03a', 'tracewheel04', 'tracewheel05', 'tracewheel05a', 'tracewheel06'],
  locopreset: ['loco_carrier', 'loco_carrier_big', 'loco_small', 'loco_medium', 'loco_massive', 'loco_big', 'loco_verybig'],
  digits: ['ger', 'ger2', 'usa'],
  chassisstart: ['wheel', 'airborne', 'water'],
  supplykind: ['truck_ammo', 'truck_ammo_art'],
  wrecktexmod: ['ger_x', 'sov_x', 'ally_x'],
  button: ['v1', 'v2', 'v3', 'v4', 'v5'],
  army: ['ger', 'ger2', 'rus', 'eng', 'usa', 'jap', 'x', 'xnotanks'],
  tow: ['t20', 'sdkfz7', 'universal_carrier', 'gmc_cckw'],
};
const CANNON = ['cannon.large', 'cannon.small', 'cannon.carried', 'cannon.micro'];
const C = (id, covers, o) => { o = o || {}; return Q(id, 'choice', covers, Object.assign({}, o, { limits: Object.assign({}, o.limits || {}, { values: CH[id] }) })); };
const ACC = ['maxlinearspeed', 'bylinearspeed', 'maxangularspeed', 'byangularspeed', 'disordertime', 'ordertime'].map(k => 'weaponry.place.accuracybymotion.' + k);
const MAKE = { $verb: 'make' };
// a question asked only where the copy has that part of its own (else the task could not change it)
const W = (q, w) => Object.assign(q, { when: Object.assign({}, q.when, w) });

module.exports = {
  id: 'vehicle',
  verbs: ['make', 'change'],
  // Gates of Hell: the group goh (card.goh.js, added at the end); every other question is AS2 only
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 20,
  title: 'task.vehicle.t',
  census: 'vehicle',
  base: { lookup: 'vehicle' },
  groups: [
    // what a first time maker must answer: the id, the name, the look, the price and the army; every other group keeps the copy
    { id: 'name', title: 'task.vehicle.g.name', essential: true, q: [
      Q('newid', 'id', ['id'], { when: MAKE, unique: { lookup: 'vehicle' }, limits: { re: '^[a-z][a-z0-9_]{1,40}$', limit: 'STR-14' } }),
      Q('title', 'text', ['text.name'], { limits: { limit: 'LOC-20' } }),
    ] },
    { id: 'look', title: 'task.vehicle.g.look', essential: true, q: [
      Q('model', 'thing', ['extension'], { limits: { limit: 'ENG-32' }, picker: { sources: ['keep', 'exist', 'branch', 'file', 'ext'], lookup: 'model', branch: 'model', kinds: ['model', 'text', '.mdl', '.ply', '.vol', '.anm'], ext: ['soedit', 'blender-gem2'] }, multi: true }),
      Q('skin', 'thing', ['texmod', 'skin.textures', 'skeleton.texmods'], { picker: { sources: ['keep', 'branch'], branch: 'skin', order: 'after' } }),
    ] },
    { id: 'price', title: 'task.vehicle.g.price', essential: true, q: [
      Q('sell', 'yesno', ['card'], { limits: { limit: 'TST-94' } }),
      Object.assign(N('cost', 'card.cost', { unit: 'MP', step: 5 }), { when: { sell: true } }),
      Q('army', 'thing', ['card.army'], { when: Object.assign({ sell: true }, MAKE), limits: { limit: 'TST-94' }, picker: { sources: ['keep', 'exist'], lookup: 'army' } }),
    ] },
    { id: 'kind', title: 'task.vehicle.g.kind', q: [
      Q('props', 'list', ['props', 'props.kind', 'props.size', 'props.material', 'props.turret', 'props.tow', 'props.special'], { limits: { re: '^-?[a-z][a-z0-9_]*$', limit: 'PORT-151' } }),
      Q('lod', 'choice', ['lodclass'], { limits: { values: words('lodclass') } }),
      N('ring', 'selection.scale', { unit: 'x', step: 0.1 }),
    ] },
    { id: 'kindx', title: 'task.vehicle.g.kindx', q: [
      F('able'), F('tag'), F('obstacle'), F('physics'), F('linkedphys'), F('simulator'), F('constrain'),
    ] },
    { id: 'aim', title: 'task.vehicle.g.aim', q: [
      F('autooperate'), F('quantable'), F('targetclass'), F('targetselector'), F('holdfire'), F('hearing', { unit: 'x', step: 0.5 }),
    ] },
    { id: 'lookx', title: 'task.vehicle.g.lookx', q: [
      Q('numbers', 'yesno', ['enumerator']),
      C('digits', ['enumerator.digit_folder'], { when: { numbers: true } }),
    ] },
    { id: 'armour', title: 'task.vehicle.g.armour', q: [
      Q('armour', 'list', ['armour', 'extender.shield'], { limits: { re: ARMOUR_RE, limit: 'DMG-25', unit: 'mm' } }),
    ] },
    { id: 'move', title: 'task.vehicle.g.move', q: [
      N('mass', 'mass', { unit: 'kg', step: 100 }),
      N('maxspeed', 'chassis.locomotion.maxspeed', { unit: 'km/h' }),
      N('speedslow', 'chassis.speed.slow', { unit: 'km/h' }),
      N('speednormal', 'chassis.speed.normal', { unit: 'km/h' }),
      N('speedfast', 'chassis.speed.fast', { unit: 'km/h' }),
      Q('fuel', 'number', ['chassis.fuelbag.volume', 'chassis.fuelbag.remain'], { limits: lim('chassis.fuelbag.volume', { unit: 'l' }) }),
      N('fuelrate', 'chassis.fuelbag.rate', { unit: 'l/km' }),
      C('pather', ['patherid'], { limits: { limit: 'KEY-30' } }),
      C('collider', ['collider'], { limits: { limit: 'KEY-22' } }),
      C('locopreset', ['chassis.locomotion.preset'], { when: { pather: CANNON, $copy: 'locopreset' } }),
    ] },
    { id: 'turn', title: 'task.vehicle.g.turn', q: [
      N('turnspeed', 'chassis.locomotion.maxspeedatmaxturn', { unit: 'km/h' }),
      N('starttime', 'chassis.locomotion.starttime', { unit: 's' }),
      N('braketime', 'chassis.locomotion.braketime', { unit: 's' }),
      N('stoptime', 'chassis.locomotion.stoptime', { unit: 's' }),
      N('turnradius', 'chassis.locomotion.turnradius', { unit: 'm' }),
      N('turntime', 'chassis.locomotion.turntime', { unit: 's' }),
      N('turnstart', 'chassis.locomotion.turnstart', { unit: 's' }),
      N('turnstop', 'chassis.locomotion.turnstop', { unit: 's' }),
      Q('gears', 'list', ['chassis.locomotion.gears'], { limits: { re: '^((0?\\.[1-9][0-9]*|1(\\.0+)?)( |$))+$', unit: 'ratio', limit: 'KEY-15' } }),
      Q('reargears', 'list', ['chassis.locomotion.reargears'], { limits: { re: '^((0?\\.([1-5][0-9]*|6[0-4]?))( |$))+$', unit: 'ratio', limit: 'MOV-02' } }),
    ] },
    { id: 'movex', title: 'task.vehicle.g.movex', q: [
      F('gearswitch', { unit: 's', step: 0.1 }), F('steeron', { step: 1 }), F('steeroff', { step: 1 }), F('spline', { step: 0.5 }), F('maxslope', { step: 1 }),
      F('fallslope', { step: 1 }), F('sideslope', { step: 1 }), F('sideslopespeed', { step: 1 }),
      Object.assign(F('elevacc', { unit: 'm/s2', step: 0.5 }), { when: { simulator: ['water', 'airborne'] } }), Object.assign(F('elevspeed', { unit: 'm/s', step: 0.5 }), { when: { simulator: ['water', 'airborne'] } }),
    ] },
    { id: 'terrain', title: 'task.vehicle.g.terrain', q: [
      F('nomovefire'), F('noreverse'), F('ignorebounds'), F('noslope'), F('waterterrain'), F('exitwater'), F('chassisstart'),
    ] },
    { id: 'crew', title: 'task.vehicle.g.crew', q: [
      Q('crew', 'vcrew', ['crew.macro'], { when: { $copy: 'crew' }, limits: { values: CH.crew, limit: 'PORT-137' } }),
    ] },
    { id: 'guns', title: 'task.vehicle.g.guns', q: [
      Q('gun', 'thing', ['weaponry.place.weapon', 'weaponry.place.weapon.filling'], { when: { $copy: 'gun' }, limits: { limit: 'SDL-59' }, picker: { sources: ['keep', 'exist', 'branch'], lookup: 'gun', branch: 'gun' } }),
      Q('mguns', 'list', ['weaponry.place'], { limits: { re: '^([A-Za-z0-9_]+ = )?[a-z0-9_\\-.]+$', limit: 'PORT-79' }, picker: { sources: ['keep', 'exist', 'branch'], lookup: 'weapon', branch: 'gun' } }),
      C('abm', ['weaponry.place.abm.preset'].concat(ACC), { when: { $copy: 'abm' }, limits: { limit: 'KEY-18' } }),
    ] },
    { id: 'gunsx', title: 'task.vehicle.g.gunsx', q: [
      Q('mounts', 'list', ['weaponry.place.type', 'weaponry.place.foresight', 'weaponry.place.basic', 'weaponry.place.rotate', 'weaponry.place.restoreikafteraim', 'weaponry.place.stationaryfiring', 'weaponry.place.barrels'], { limits: { re: '^\\S+ ((?!barrels )[a-z0-9_]+ \\S+|barrels ([1-9]|[1-5][0-9]|60))$' } }),
      Q('bones', 'list', ['bone.speed', 'bone.speed2', 'bone.limits'], { limits: { re: '^\\S+ (speed|speed2|limits) [-0-9. ]+$' } }),
      F('restoreik', { step: 1 }), F('manualacc', { unit: 'x', step: 0.1 }),
    ] },
    { id: 'sight', title: 'task.vehicle.g.sight', q: [
      Q('vision', 'choice', ['props.vision'], { limits: { values: words('props.vision') } }),
    ] },
    { id: 'sightx', title: 'task.vehicle.g.sightx', q: [
      Q('visors', 'list', ['sensor.visor.vision'], { limits: { re: '^\\S+ [a-z0-9_\\-]+$' } }),
      F('recognize', { step: 0.05 }), F('inform', { unit: 'm' }),
    ] },
    { id: 'sounds', title: 'task.vehicle.g.sounds', q: [
      Q('sounds', 'thing', ['sound.engine', 'sound.engine_end', 'sound.exhaust', 'sound.move', 'sound.rotate_turret', 'sound.other', 'effects.burn_by_engine'], { limits: { limit: 'INT-01' }, picker: { sources: ['keep', 'exist'], lookup: 'vehicle' } }),
    ] },
    { id: 'effects', title: 'task.vehicle.g.effects', q: [
      Q('muzzle', 'choice', ['props.muzzle'], { limits: { values: words('props.muzzle'), limit: 'TST-112' } }),
      C('trackfx', ['chassis.track.tracer.view'], { when: { $copy: 'trackfx' }, limits: { limit: 'VIS-19' } }),
      W(N('trackstep', 'chassis.track.tracer.step', { unit: 'm', step: 0.01 }), { $copy: 'trackfx' }),
    ] },
    { id: 'inventory', title: 'task.vehicle.g.inventory', q: [
      Q('load', 'list', ['extender.box.item', 'extender.box.item.ammo', 'extender.box.item.cell', 'extender.box.item.user'], { limits: { re: '^("[^"]+"( .+)?|[a-z0-9_\\-. ]+)$', reHint: 'task.vehicle.h.loadEx', limit: 'HUM-23' }, picker: { sources: ['keep', 'exist', 'branch', 'value'], lookup: 'item', branch: 'item' } }),
      Q('boxsize', 'text', ['extender.box.size'], { optional: true, limits: Object.assign(lim('extender.box.size'), { re: '^\\d+ \\d+$', unit: 'cells' }) }),
      N('boxweight', 'extender.box.weight', { unit: 'kg', step: 500 }),
      Q('boxclear', 'yesno', ['extender.box.clear']),
      W(Q('slots', 'list', ['extender.weapon.mask'], { limits: { re: '^\\S+ = .+$' } }), { $copy: 'slots' }),
    ].map(q => q.id === 'slots' ? q : W(q, { $copy: 'boxclear' })) },
    { id: 'supply', title: 'task.vehicle.g.supply', q: [
      C('supplykind', ['resupply.macro']),
      Q('supplyitems', 'list', ['extender.resupply.item'], { limits: { re: '^"[^"]+"( .+)?$' } }),
      N('supplyradius', 'extender.radius', { unit: 'm', step: 1 }), N('regenerate', 'extender.regenerationperiod', { unit: 's', step: 1 }),
      N('resupply', 'extender.resupplyperiod', { unit: 's', step: 1 }), N('supplylimit', 'extender.limit', { unit: 'points', step: 10 }),
    ].map((q, i) => i ? Object.assign(q, { when: Object.assign({ supplykind: CH.supplykind }, q.id === 'supplyitems' ? { $copy: 'supplyitems' } : {}) }) : W(q, { $copy: 'supplykind' })) },
    { id: 'wreck', title: 'task.vehicle.g.wreck', q: [
      Q('wreck', 'yesno', ['wreck.x', 'wreck.xx'], { when: MAKE, limits: { limit: 'STR-14' } }),
      C('wrecktexmod', ['wreck.texmod'], { when: { wreck: true } }),
      C('wreckobstacle', ['wreck.obstacleid'], { when: { wreck: true }, limits: { limit: 'STR-29' } }),
      Q('wreckarmour', 'list', ['wreck.volume.thickness'], { when: { wreck: true, $copy: 'wreckarmour' }, limits: { re: '^\\S+ (auto|([0-9]{1,3}|1[0-4][0-9]{2}|1500)(\\.[0-9]+)?)$', unit: 'mm' } }),
    ] },
    { id: 'icons', title: 'task.vehicle.g.icons', q: [
      Q('icon', 'thing', ['icon.buy', 'icon.small'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'vehicle', branch: 'icon' } }),
      Q('minimap', 'yesno', ['icon.minimap']),
    ] },
    { id: 'texts', title: 'task.vehicle.g.texts', q: [
      Q('info', 'text', ['text.info'], { optional: true, limits: { limit: 'LOC-20' } }),
    ] },
    // the buy card: on change "take it out" comes first and skips the rest; on make the card form comes first
    { id: 'buy', title: 'task.vehicle.g.buy', q: [
      Q('remove', 'yesno', ['card.remove'], { when: { $verb: 'change' } }),
      Q('cardlike', 'thing', ['card.macro'], { when: MAKE, picker: { sources: ['keep', 'exist'], lookup: 'vehicle' } }),
      Q('notforsale', 'yesno', ['card.not_for_sale']),
      Q('basic', 'yesno', ['card.basic']),
      N('level', 'card.level', { unit: 'rank', step: 1 }),
      N('charge', 'card.charge', { unit: 's', step: 5 }),
      Q('fore', 'number', ['card.fore', 'card.wait_first'], { limits: lim('card.fore', { unit: 'share', step: 0.1 }) }),
      Q('limit', 'number', ['card.limit'], { limits: { min: 0, max: 20, step: 1, unit: 'units', limit: 'TST-94' } }),
      C('button', ['card.button']),
      Q('group', 'text', ['card.group'], { limits: { re: '^[a-z][0-9]+$' } }),
    ].map(q => Object.assign(q, { when: Object.assign({ sell: true }, q.id === 'remove' ? {} : { remove: false }, q.when) })) },
    { id: 'card', title: 'task.vehicle.g.card', q: [
      N('cp', 'card.cp', { unit: 'points', step: 1, limit: 'SDL-30' }),
      N('score', 'card.score', { unit: 'points', step: 0.5 }),
      N('cw', 'card.cw', { unit: 'x', step: 1 }),
      Q('tags', 'list', ['card.tags'], { limits: { re: '^-?[a-z][a-z0-9_]*$' } }),
      Q('crewn', 'text', ['card.crew'], { limits: { re: '^(n\\d?\\(\\d+\\) ?)+$' } }),
      Q('coop', 'number', ['card.price_coop'], { limits: lim('card.cost', { unit: 'MP', step: 5, limit: 'TST-94' }) }),
      Q('content', 'text', ['card.content'], { optional: true, limits: { re: '^[^"{}]*$' } }),
      C('tow', ['card.tow']),
      Q('cardinfo', 'text', ['card.info'], { optional: true, limits: { re: '^[a-z0-9_/]+$' } }),
    ].map(q => Object.assign(q, { when: Object.assign({ sell: true, remove: false }, q.when) })) },
  ],
  kept: [].concat(
    K('no tool step yet: a copy keeps the class folder, the first block and the (include) lines of the vehicle it starts from; no gen op swaps them', 'class', 'root', 'include.properties', 'selection.include'),
    K('kept as copied: the selection ring picture; changing only part of it may wipe the whole ring [I], so the ring size question scales it instead', 'decalview.sprite.prescalex', 'decalview.sprite.prescaley', 'decalview.sprite', 'decalview.offset'),
    K('meaning not proven [I]: RimLight is on for every vehicle from vehicle.ext; switching an inherited flag off in one def ({RimLight 0}) is not proven', 'rimlight'),
    K('tied to the model bones: comes with the model (model question, SOEdit)', 'bone.spriteview', 'skeleton', 'bone.terminator', 'bone.matrix34'),
    K('tied to the model bones: tracks, wheels and their bones come with the model; another kind means starting from such a vehicle (PORT-63)', 'chassis.type', 'tracks', 'wheel', 'chassis.track', 'chassis.track.texturescroller.length', 'chassis.track.texturescroller.bone', 'chassis.track.tracer.bone', 'chassis.carrierbone', 'chassis.carrierplace'),
    K('meaning not proven [I]: no vanilla vehicle sets it (census count 0), no safe range', 'chassis.disableforward', 'sensor.remembertime', 'sensor.threatzone', 'sensor.attackzone', 'sensor.operatablerequired', 'sensor.unmaskprofile'),
    K('no tool step yet: the extender that holds TerrainType on the two trains is not mapped', 'extender.terraintype'),
    K('lives in a file shared by every unit: the brain_vehicle define in vehicle.ext; a change there changes every vehicle', 'brain', 'brain.const.crush', 'placer.crew'),
    K('tied to the model bones: seats, doors and boarding animations sit on model bones; they come with the model and the crew preset', 'placer.place', 'placer.place.group', 'placer.place.linkbone', 'placer.place.visor', 'placer.place.turnoff', 'placer.place.usevision', 'placer.place.openforcrush', 'placer.place.attach', 'placer.place.handlebone', 'seat_human', 'seat_human.animation', 'crew_human', 'crew_human.visor', 'gunner_visible', 'boarder.door', 'boarder.link', 'boarder.anm', 'boarder.anm.forward.begin', 'boarder.anm.forward.end', 'boarder.anm.forward.base', 'boarder.anm.reverse.end', 'boarder.anm.reverse.base', 'board_animation', 'crew.ext'),
    K('tied to the model bones: gun crew animations and IK of towed guns come with the model', 'extender.cannon.animation.aim', 'extender.cannon.animation.fire', 'extender.cannon.animation.reload', 'extender.cannon.animation.move', 'extender.cannon.animation.switch', 'extender.cannon.animation.gunners', 'extender.cannon.attack.obstacle', 'extender.cannon.attack.workers', 'extender.cannon.move.obstacle', 'extender.cannon.move.workers', 'extender.rotate_ik_limit'),
    K('tied to the model bones: a mount\'s bone, animation, shooter and the seats of its gunner and loader come with the model', 'weaponry.place.linkbone', 'weaponry.place.linkanimation', 'weaponry.place.shooter', 'weaponry.place.gunner', 'weaponry.place.charger'),
    K('tied to the model bones: view ports sit on model bones; the view ports question changes what each one sees', 'sensor.visor', 'sensor.visor.bone'),
    K('lives in a file shared by every unit: the talk extender of the kind file (tank.ext, cannon.ext); a second extender block in a def is not safe [I]', 'extender.talker'),
    K('owned by another task: sound (the sound folders and their wavs)', 'sound.folder'),
    K('tied to the model bones: effect bones, lamps and their glass come with the model (Models page)', 'effects.fx_bones', 'extender.light', 'extender.breakfx'),
    K('meaning not proven [I]: the death effect is picked by props words in the shared interaction files', 'effects.death'),
    K('owned by another task: model (it copies the broken and destroyed views of a model)', 'wreck.extension'),
    K('tied to the model bones: the wreck parts, their flags and extenders come with the wreck model', 'wreck.volume', 'wreck.volume.able', 'wreck.extender', 'component.tags.nodestroyedview'),
    K('meaning not proven [I]: no vanilla card has an icon sequence number (census count 0)', 'card.icon'),
    K('meaning not proven [I]: the single player list name is not known', 'card.price_sp'),
    K('owned by another task: kept as copied; the Bots task adds the vehicle to what the computer players buy (class, priority, wave)', 'bots.buy', 'bots.priority', 'bots.class', 'bots.min_income', 'bots.min_team', 'bots.purchase_wave'),
    K('one value only: every game vehicle refills from the item fuel and no other fuel item exists in the game data', 'chassis.fuelbag.fuel'),
    K('meaning not proven [I]: no vanilla .lng has info/special or info/armor_angle keys (census count 0)', 'text.special', 'text.armor_angle'),
  ),
  test: 'task.vehicle.test',
  checklist: ['task.vehicle.c.buy', 'task.vehicle.c.look', 'task.vehicle.c.drive', 'task.vehicle.c.fire', 'task.vehicle.c.log'],
  lookups: { vehicle: (ctx, w, o) => (isGoh(ctx, o) ? CG().look('vehicle', ctx, w, o) : lookupVehicle(ctx, w, o)), gun: lookupGun, weapon: lookupWeapon, item: lookupItem, army: lookupArmy,
    gohfree: (ctx, w, o) => CG().lookFree(ctx, w, o) },
  routes: { 'GET /api/x/task/r/vehicle/crew': crewRoute, 'POST /api/x/task/r/vehicle/gohcard': (url, b, ctx) => CG().cardRoute(url, b, ctx) },
  check: async (d, ctx) => (d && d.game === 'goh' ? [] : check(d, ctx)),
  values: async (ctx, base, o) => {
    if (isGoh(ctx, o)) return CG().values('vehicle', ctx, base, o);
    const g = gameOfCtx(ctx);
    if (!g || !base || !base.id) return {};
    await warm(g, ctx.mod || '', exeFor(ctx, o && o.game));
    const R = readerFor(g, ctx.mod || '', exeFor(ctx, o && o.game)), u = unitOf(R, base.id);
    return u ? baseValues(R, u, o && o.verb) : {};
  },
  pass,
  compile: (draft, c) => (String(c.game) === 'goh' ? CG().compile('vehicle', 'vehicle', draft, c) : compile(draft, c)),
  _lib: lib,
};
// Gates of Hell (2026-11-23): card.goh.js (the Units page's GoH catalogue, Add, describe, change; army.gohcards to take a card off);
// the group goh first, every other question AS2 only
function CG() { return require('./card.goh'); }
function isGoh(ctx, o) { return gidOf(ctx, o && o.game) === 'goh'; }
module.exports.groups.unshift({ id: 'goh', title: 'task.vehicle.g.goh', essential: true, q: CG().questions('vehicle', 'vehicle') });
for (const g of module.exports.groups) for (const q of g.q) if (!/^goh/.test(q.id)) q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });
