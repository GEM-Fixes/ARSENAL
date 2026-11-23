// recipe "soldier": make a new soldier type (a breed: set/breed/mp/<army>/<name>.set plus its soldiers.set card) from a copy, or
// change one. Step list 4.2, census census/soldier.json. Written through gen ops only: breed (the copy and its card)
// set (every breed line), kit (inventory), text (shown name on change), macro (join a squad line in squads.set).
// Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-2de14103)
'use strict';
const fs = require('fs'), path = require('path');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');

const ARMIES = ['eng', 'ger', 'ger2', 'jap', 'rus', 'usa'];
const pct = a => a.map(n => n + '%');
const HEALTH = pct([20, 30, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 350, 400, 500, 600, 750, 1000]);
const REGEN = pct([20, 30, 50, 75, 100, 125, 150, 200, 250, 275, 300, 350, 400, 500, 600, 750, 1000]);
const SREGEN = pct([20, 30, 50, 75, 100, 125, 150, 175, 200, 250, 275, 300, 350, 400, 500, 600, 750, 1000]);
const LVL = ['none', 'lvl_1', 'lvl_2', 'lvl_3', 'lvl_4', 'lvl_5'];
const VISION = ['mp_soldier', 'mp_officer', 'mp_sniper', 'human'];
const SKILLS = ['rifle', 'smg', 'pistol', 'mgun', 'mgun_light', 'at_rifle', 'rocketlauncher', 'melee', 'avoidance'];
const PCT_PERKS = ['health', 'health_regeneration', 'stamina', 'stamina_regeneration'];
const NUM_PERKS = ['speed', 'tank', 'vehicle', 'cannon'];
const FLAG_PERKS = ['field_glass', 'telescope', 'stealth', 'aimedshot'];
const UNITS = 'resource/set/multiplayer/units/';
const SQUADS = UNITS + 'squads.set';

const P = 'task.soldier.';
const MAKE = { $verb: 'make' };
const STAR = /^\*\s*/, VET = /^veterancy_(?:lvl_)?(\d+)$/;
const Q = (id, kind, covers, extra) => Object.assign({ id, kind, ask: P + 'q.' + id, help: P + 'h.' + id, covers }, extra || {});
// weapon skills (abilities "from weapon"): the engine takes the FIRST one in his perk list that fits the weapon in his hands (HUM-15),
// so a skill he did not have is written before the ones he has
const WSKILLS = ['rifle', 'smg', 'pistol', 'mgun', 'mgun_light', 'at_rifle', 'rocketlauncher'];
const skillQ = s => Q(s, 'choice', ['breed.perks.' + s].concat(WSKILLS.includes(s) ? ['breed.perks.order'] : []), { limits: { values: s === 'avoidance' ? ['none', 'lvl_1'] : LVL, unit: 'level', limit: s === 'mgun_light' || s === 'at_rifle' ? 'HUM-15' : 'GPL-13' } });

// ---------- reading the game and the picked mod (vfs of the game, loose files of the mod first)
// the task's game: the draft's (c.game, values and lookups opt.game, parent.game), else the page's (ctx.gameId(), gui.js; a string
// where compile.js lookupCtx set it); nothing = as64. The readers below take a game handle: the game folder, plus '|' and the vfs
// exe for a game other than AS64 (MoW:AS2: 'mowas_2', the same install without as64/core, tools/lib/games; '|' is never in a Windows
// path). Every cache below is keyed by the handle, so the AS64 and MoW:AS2 views of one install stay apart; AS64 is the plain folder.
function gidOf(ctx, g) {
  if (g) return String(g);
  if (ctx && ctx.task && ctx.task.id) return String(ctx.task.id);   // README "The game of a task": lib/game.js hands it to every step
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch (e) { return 'as64'; }
}
function handle(dir, gid) { if (!dir) return null; const exe = gid && gid !== 'as64' ? require(path.join(TOOLS, 'lib', 'games')).exeOf(gid) : null; return exe ? dir + '|' + exe : dir; }
function unhandle(g) { const s = String(g || ''), i = s.lastIndexOf('|'); return i > 0 ? { dir: s.slice(0, i), exe: s.slice(i + 1) } : { dir: s, exe: undefined }; }
function gameOf(ctx, game) { let d = null; try { d = (ctx && (typeof ctx.game === 'function' ? ctx.game() : ctx.gameDir)) || null; } catch (e) { d = null; } return handle(d, gidOf(ctx, game)); }
function vfsOf(g) {
  if (!g) return null;
  // the game-only view every page shares (lib/gameview get: the same build options, kept while the game's files are unchanged)
  const h = unhandle(g);
  try { return require(path.join(TOOLS, 'lib', 'gameview')).get({ gameDir: h.dir, exe: h.exe }); } catch (e) { return null; }
}
function modFile(mod, key) { if (!mod) return null; const f = path.join(mod, ...key.split('/')); try { return fs.statSync(f).isFile() ? f : null; } catch (e) { return null; } }
function readKey(g, mod, key) {
  const f = modFile(mod, key);
  if (f) return fs.readFileSync(f);
  const v = vfsOf(g), r = v && v.files.get(key);
  return r ? require(path.join(TOOLS, 'lib', 'vfs')).readRec(r) : null;
}
function modKeys(mod, prefix) {
  const out = [];
  if (!mod) return out;
  (function walk(d, rel) {
    if (out.length > 20000) return;
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) { const r = rel + e.name.toLowerCase(); if (e.isDirectory()) walk(path.join(d, e.name), r + '/'); else out.push(r); }
  })(path.join(mod, ...prefix.split('/')), prefix);
  return out;
}
function keysUnder(g, mod, prefix) {
  const s = new Set(), v = vfsOf(g);
  if (v) for (const k of v.files.keys()) if (k.startsWith(prefix)) s.add(k);
  for (const k of modKeys(mod, prefix)) s.add(k);
  return [...s].sort();
}
const SDL = () => require(path.join(TOOLS, 'lib', 'sdl'));
const treeOf = buf => SDL().parseLines(buf.toString('latin1').split(/\r?\n/));
const kid = (n, name) => (n ? SDL().kids(n, name)[0] : null) || null;
const v0 = n => (n && n.vals[0] ? n.vals[0].v : undefined);
const S = x => (x == null ? '' : String(x));
const low = x => S(x).trim().toLowerCase();
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const breedKey = (army, name) => 'resource/set/breed/mp/' + army + '/' + name + '.set';
function parseId(id) { const m = /^([a-z0-9_]+)\/([a-z0-9_]+)$/.exec(low(id)); return m ? { army: m[1], name: m[2] } : null; }

// text from an index to its matching close bracket (strings and ; comments skipped)
function closeAt(t, i, open, close) {
  let d = 0;
  for (let j = i; j < t.length; j++) {
    const ch = t[j];
    if (ch === '"') { j = t.indexOf('"', j + 1); if (j < 0) return -1; continue; }
    if (ch === ';') { j = t.indexOf('\n', j); if (j < 0) return -1; continue; }
    if (ch === open) d++;
    else if (ch === close && --d === 0) return j;
  }
  return -1;
}
// the soldiers.set card of mp/<army>/<name>: {cp, score, cw, tags}, a macro call read through its (define ..)
function readDecl(g, mod, army, name) {
  const b = readKey(g, mod, UNITS + 'soldiers.set');
  if (!b) return null;
  const t = b.toString('latin1'), m = new RegExp('\\{\\s*"mp/' + army + '/' + name + '"', 'i').exec(t);
  if (!m) return null;
  const end = closeAt(t, m.index, '{', '}');
  let blk = end < 0 ? '' : t.slice(m.index, end + 1);
  const call = /\(\s*"([A-Za-z0-9_]+)"/.exec(blk);
  if (call) {
    const dm = new RegExp('\\(define\\s+"' + call[1] + '"', 'i').exec(t);
    if (dm) { const de = closeAt(t, dm.index, '(', ')'); if (de > 0) blk = t.slice(dm.index, de + 1).replace(/%side\b/g, army) + blk; }
  }
  const num = k => { const r = new RegExp('\\{\\s*' + k + '\\s+([-\\d.]+)\\s*\\}', 'ig'); let x, last; while ((x = r.exec(blk))) last = x[1]; return last === undefined ? undefined : Number(last); };
  const tg = [...blk.matchAll(/\{\s*tags\s+"([^"]*)"\s*\}/ig)].pop();
  return { cp: num('cp'), score: num('score'), cw: num('cw'), tags: tg ? tg[1].replace(/\s+/g, ' ').trim() : undefined, basic: /\{\s*basic\s*\}/i.test(blk) };
}
// a breed file -> {values: per question id, has: set of present paths, items: [{raw, name, hands}]}
function readSoldier(g, mod, army, name) {
  const b = readKey(g, mod, breedKey(army, name));
  if (!b) return null;
  const br = kid(treeOf(b), 'breed');
  if (!br) return null;
  const has = new Set(), vals = { army, name, display: '', newgun: '', newitem: '', joinsquad: '', joincount: 1 };
  const one = (k, id, dflt) => { const n = kid(br, k); if (n) has.add(k); vals[id] = n ? S(v0(n)) : dflt; };
  one('skin', 'skin', ''); one('portrait', 'portrait', 'none'); one('icon', 'icon', ''); one('nationality', 'nationality', army);
  one('voice', 'voice', 'auto'); one('behaviour', 'behaviour', 'soldier');
  const ip = kid(br, 'icon_priority'); if (ip) has.add('icon_priority'); vals.icon_priority = ip ? Number(v0(ip)) : 0;
  const hero = kid(br, 'hero'); if (hero) has.add('hero'); vals.hero = !!hero;
  const tg = kid(br, 'tags'); if (tg) has.add('tags'); vals.tags = tg ? tg.vals.map(x => x.v).join(' ').split(/\s+/).filter(Boolean) : [];
  const ar = kid(br, 'armors'); if (ar) has.add('armors');
  const hd = kid(ar, 'head'), bd = kid(ar, 'body');
  if (hd) has.add('armors/head'); if (bd) has.add('armors/body');
  vals.helmet = hd ? S(v0(hd)) : 'none'; vals.bodyarmor = bd ? S(v0(bd)) : 'none';
  const pk = kid(br, 'perks'); if (pk) has.add('perks');
  const perk = p => { const n = kid(pk, p); if (n) has.add('perks/' + p); return n; };
  for (const p of PCT_PERKS) { const n = perk(p); vals[p] = n ? S(v0(n)) : '100%'; }
  for (const p of NUM_PERKS) { const n = perk(p); vals[p] = n ? Number(v0(n)) : 1; }
  for (const p of SKILLS) { const n = perk(p); vals[p] = n ? S(v0(n)) : 'none'; }
  for (const p of FLAG_PERKS) vals[p] = !!perk(p);
  { const n = perk('vision'); vals.vision = n ? S(v0(n)) : 'mp_soldier'; }
  const inv = kid(br, 'inventory'), items = [];
  if (inv) {
    has.add('inventory');
    const its = SDL().kids(inv, 'item'), hn = kid(inv, 'in_hands'), hi = hn ? Number(v0(hn)) : -1;
    its.forEach((n, i) => items.push({ raw: n.vals.map(x => x.v).join(' ').replace(/\s+/g, ' ').trim(), name: low(v0(n)), hands: i === hi }));
  }
  vals.inventory = items.map(x => (x.hands ? '*' : '') + x.raw);
  const vt = /\(\s*"(veterancy_(?:lvl_)?\d+)"\s*\)/i.exec(b.toString('latin1'));
  vals.veterancy = vt ? vt[1].toLowerCase() : '';
  const d = readDecl(g, mod, army, name);
  if (d) { vals.cp = d.cp; vals.score = d.score; vals.cw = d.cw; vals.dtags = d.tags; vals.basic = d.basic; }
  vals.cremove = false; vals.join = false;
  return { values: vals, has, items, decl: !!d, perkOrder: pk ? pk.kids.map(n => low(n.name)).filter(Boolean) : [] };
}
// squads.set lines: [{army, name, line, macro, members: [{arg, breed, n}]}]
function readSquads(g, mod) {
  const b = readKey(g, mod, SQUADS);
  if (!b) return [];
  const out = [];
  for (const l of b.toString('latin1').split(/\r?\n/)) {
    const code = l.replace(/;.*$/, ''), mc = /^\s*\(\s*"((?:squad|single)_with\w*)"/i.exec(code);
    const sd = /\bside\(([a-z0-9_]+)\)/i.exec(code), nm = /\bname\(([a-z0-9_]+)\)/i.exec(code);
    if (!mc || !sd || !nm) continue;
    const members = [...code.matchAll(/\b(c\d+)\(([a-z0-9_]+):(\d+)\)/ig)].map(x => ({ arg: x[1].toLowerCase(), breed: x[2].toLowerCase(), n: +x[3] }));
    out.push({ army: sd[1].toLowerCase(), name: nm[1].toLowerCase(), line: code.replace(/\s+/g, ' ').trim(), macro: mc[1].toLowerCase(), members });
  }
  return out;
}
// the macro op's match text for one squad line: side(..) .. name(..) plus the next character (riflemans is not riflemans2)
function squadMatch(sq) {
  const t = sq.line.toLowerCase(), a = t.indexOf('side(' + sq.army + ')'), n = t.indexOf('name(' + sq.name + ')');
  const end = n + ('name(' + sq.name + ')').length;
  return a >= 0 && a < n ? t.slice(a, end + 1) : t.slice(n, end + 1);
}

// the text a player sees for a key (desc/human/mp/ger/rifle): first line, colour tags dropped; the mod's loose .lng files win
const TEXTS = new Map();
function gameTexts(g) {
  const k = g ? path.resolve(g).toLowerCase() : '';
  if (TEXTS.has(k)) return TEXTS.get(k);
  const out = new Map(), v = vfsOf(g);
  try {
    const lp = require(path.join(TOOLS, 'upgrade', 'lib', 'lngpot')), V = require(path.join(TOOLS, 'lib', 'vfs')), pre = 'resource/interface/text/';
    const ks = v ? [...v.files.keys()].filter(x => x.startsWith(pre) && /\.lng$/.test(x)) : [];
    ks.sort((a, b) => (a.split('/').pop().startsWith('#') ? 0 : 1) - (b.split('/').pop().startsWith('#') ? 0 : 1) || (a < b ? -1 : 1));
    for (const x of ks) { let kv = []; try { kv = lp.lngKeys(V.readRec(v.files.get(x)), x.slice(pre.length)); } catch (e) { continue; } for (const [key, t] of kv) if (/^(desc|info)\//i.test(key)) out.set(key.toLowerCase(), String(t)); }
  } catch (e) { /* no texts: defaults stay empty */ }
  TEXTS.set(k, out);
  return out;
}
function modTexts(mod) {
  const out = new Map();
  if (!mod) return out;
  try {
    const lp = require(path.join(TOOLS, 'upgrade', 'lib', 'lngpot'));
    for (const k of modKeys(mod, 'resource/interface/text/')) if (/\.lng$/.test(k)) { const f = modFile(mod, k); if (f) for (const [key, t] of lp.lngKeys(fs.readFileSync(f), k.slice(24))) out.set(key.toLowerCase(), String(t)); }
  } catch (e) { /* unreadable: the game's text stands */ }
  return out;
}
const plainText = t => S(t).replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').split('\n')[0].trim();
function textOf(g, mod, key) { const k = low(key), m = modTexts(mod); return plainText(m.has(k) ? m.get(k) : gameTexts(g).get(k)); }
// a name no soldier of any army has: the copy's name plus _2, _3 ..
function freeName(names, base) {
  const have = new Set([...names].map(low)), b = low(base).slice(0, 36) || 'soldier';
  for (let i = 2; i < 10000; i++) if (!have.has(b + '_' + i)) return b + '_' + i;
  return b + '_x';
}
const breedNames = (g, mod) => keysUnder(g, mod, 'resource/set/breed/mp/').map(k => /^resource\/set\/breed\/mp\/[a-z0-9_]+\/([a-z0-9_]+)\.set$/.exec(k)).filter(Boolean).map(m => m[1]);
// the army of the draft a lookup is asked for (its copy), else the opt.in word when it is an army
function draftArmy(ctx, opt, parse) {
  const w = low(opt && opt.in);
  if (w && w !== 'army') return w;
  try { const d = require(path.join(__dirname, '..', 'lib', 'draft')).load(ctx, S(opt && opt.draft)); const id = parse(d && d.base && d.base.id); return id ? id.army : ''; } catch (e) { return ''; }
}
// every item line soldiers of the game carry (kit lines the kit op can write): the most used line per item, for the kit picker
const KITS = new Map();
function kitItems(g, mod) {
  const k = (g ? path.resolve(g).toLowerCase() : '') + '|' + S(mod);
  if (KITS.has(k)) return KITS.get(k);
  const by = new Map();
  for (const key of keysUnder(g, mod, 'resource/set/breed/mp/')) {
    if (!/\.set$/.test(key)) continue;
    const b = readKey(g, mod, key); if (!b) continue;
    let inv = null; try { inv = kid(kid(treeOf(b), 'breed'), 'inventory'); } catch (e) { inv = null; }
    for (const n of inv ? SDL().kids(inv, 'item') : []) {
      const raw = n.vals.map(x => x.v).join(' ').replace(/\s+/g, ' ').trim().toLowerCase(), kl = kitLine(raw);
      if (!kl) continue;
      const it = low(kl.item), e = by.get(it) || { lines: new Map(), n: 0 };
      e.n++; e.lines.set(raw, (e.lines.get(raw) || 0) + 1); by.set(it, e);
    }
  }
  const out = [...by.entries()].map(([it, e]) => { const top = [...e.lines.entries()].sort((a, b) => b[1] - a[1])[0][0]; return { id: top, name: it, where: 'kit', ref: null, sub: top }; });
  KITS.set(k, out);
  return out;
}

// ---------- lookups
function filt(list, words, limit) {
  const w = low(words);
  const hit = list.filter(x => !w || x.id.toLowerCase().includes(w) || low(x.name).includes(w));
  hit.sort((a, b) => (a.id.toLowerCase() === w ? -1 : 0) - (b.id.toLowerCase() === w ? -1 : 0) || a.id.localeCompare(b.id));
  return hit.slice(0, limit || 200);
}
function folderNames(g, mod, prefix) {
  const s = new Set();
  for (const k of keysUnder(g, mod, prefix)) { const r = k.slice(prefix.length).split('/'); if (r.length > 1 && r[0]) s.add(r[0]); }
  return [...s];
}
// opt.in = an army: only that army's entries, and exact means its name (the unique check of the name question)
function inArmy(list, words, opt) {
  const a = low(opt && opt.in), hit = a ? list.filter(x => low(x.where) === a) : list, res = filt(hit, words, opt && opt.limit);
  return a ? { results: res, exact: hit.some(x => low(x.name) === low(words)) } : res;
}
// Gates of Hell (2026-11-23): soldier.goh.js (change: the card price and name, what he carries, through the Units page; make: gen breed + kit)
const SG = () => require('./soldier.goh');
const isGoh = (ctx, opt) => gidOf(ctx, opt && opt.game) === 'goh';
const lookups = {
  gohitem: async (ctx, words, opt) => SG().lookItem(ctx, words, opt),
  gohbreedname: async (ctx, words, opt) => SG().lookFree(ctx, words, opt),
  breed: async (ctx, words, opt) => {
    if (isGoh(ctx, opt)) return SG().look(ctx, words, opt);
    const g = gameOf(ctx, opt && opt.game), out = [];
    for (const k of keysUnder(g, ctx.mod, 'resource/set/breed/mp/')) { const m = /^resource\/set\/breed\/mp\/([a-z0-9_]+)\/([a-z0-9_]+)\.set$/.exec(k); if (m) out.push({ id: m[1] + '/' + m[2], name: m[2], where: m[1], ref: { key: k }, sub: k }); }
    return inArmy(out, words, opt);
  },
  // the unique check of the name: a name a soldier of any army has is taken (the page sends no army with it)
  breedname: async (ctx, words, opt) => {
    const names = [...new Set(breedNames(gameOf(ctx, opt && opt.game), ctx.mod))].map(n => ({ id: n, name: n, where: '', ref: null, sub: '' }));
    return { results: filt(names, words, opt && opt.limit), exact: names.some(x => x.id === low(words)) };
  },
  // kit lines soldiers of the game carry: name, then filled or a count
  kititem: async (ctx, words, opt) => { const r = filt(kitItems(gameOf(ctx, opt && opt.game), ctx.mod), words, opt && opt.limit); return r.length ? r : { results: [], why: P + 'w.noitem', do: P + 'w.noitemDo' }; },
  // the rank tables (define "veterancy_N") in the breed .inc files of an army (opt.in) or of every army
  veterancy: async (ctx, words, opt) => {
    const g = gameOf(ctx, opt && opt.game), a = low(opt && opt.in), by = new Map();
    for (const k of keysUnder(g, ctx.mod, 'resource/set/breed/')) {
      if (!/\.inc$/.test(k) || (a && !k.startsWith('resource/set/breed/mp/' + a + '/'))) continue;
      const b = readKey(g, ctx.mod, k);
      if (b) for (const m of b.toString('latin1').matchAll(/\(\s*define\s+"(veterancy_(?:lvl_)?\d+)"/ig)) if (!by.has(m[1].toLowerCase())) by.set(m[1].toLowerCase(), { id: m[1].toLowerCase(), name: m[1].toLowerCase(), where: k.split('/').slice(-2, -1)[0], ref: { key: k }, sub: k });
    }
    return filt([...by.values()], words, opt && opt.limit);
  },
  humanskin: async (ctx, words, opt) => filt(folderNames(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/entity/humanskin/').map(n => ({ id: n, name: n, where: 'humanskin', ref: { key: 'resource/entity/humanskin/' + n + '/' + n + '.def' }, sub: '' })), words, opt && opt.limit),
  headgear: async (ctx, words, opt) => filt([{ id: 'none', name: 'none', where: '', ref: null, sub: '' }].concat(folderNames(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/entity/inventory/-equipment/head/').map(n => ({ id: n, name: n, where: 'head', ref: null, sub: '' }))), words, opt && opt.limit),
  portrait: async (ctx, words, opt) => {
    const out = [{ id: 'none', name: 'none', where: '', ref: null, sub: '' }];
    for (const k of keysUnder(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/interface/scene/portrait/')) { const m = /portrait\/([^/]+)\.tga$/.exec(k); if (m) out.push({ id: m[1], name: m[1], where: 'portrait', ref: { key: k }, sub: '' }); }
    return filt(out, words, opt && opt.limit);
  },
  uniticon: async (ctx, words, opt) => {
    const by = new Map();
    for (const k of keysUnder(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/interface/scene/unit_icon/')) { const m = /unit_icon\/(.+)\(([a-z0-9_]+)\)_00\.tga$/.exec(k); if (m && !by.has(m[1])) by.set(m[1], { id: m[1], name: m[1], where: 'unit_icon', ref: { key: k }, sub: m[2] }); }
    return filt([...by.values()], words, opt && opt.limit);
  },
  voice: async (ctx, words, opt) => {
    const b = readKey(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/set/talk.set'), s = new Set();
    if (b) for (const m of b.toString('latin1').matchAll(/\(\s*"phrase_voice\w*"\s+args\s+%0\s+([a-z0-9_]+)/ig)) s.add(m[1].toLowerCase());
    return filt([{ id: 'auto', name: 'auto', where: '', ref: null, sub: 'nationality' }].concat([...s].map(n => ({ id: n, name: n, where: 'talk.set', ref: { key: 'resource/set/talk.set' }, sub: '' }))), words, opt && opt.limit);
  },
  // squads of his army (the army of the soldier copied)
  squad: async (ctx, words, opt) => {
    const r = inArmy(readSquads(gameOf(ctx, opt && opt.game), ctx.mod).map(q => ({ id: q.name + '(' + q.army + ')', name: q.name, where: q.army, ref: { key: SQUADS }, sub: q.members.map(m => m.breed + ':' + m.n).join(' ') })), words, Object.assign({}, opt, { in: draftArmy(ctx, opt, parseId) }));
    const res = Array.isArray(r) ? r : r.results;
    return res.length ? res : { results: [], why: P + 'w.nosquad', do: P + 'w.nosquadDo' };
  },
};

// ---------- compile helpers
function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [].concat(a == null ? [] : a).map(low).join('\n') === [].concat(b == null ? [] : b).map(low).join('\n');
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (S(a).trim() !== '' && S(b).trim() !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) === Number(b);
  return low(a) === low(b);
}
const q = s => '"' + S(s).replace(/"/g, '') + '"';
// one kit line: "name filled" | "name 100" | "name"
function kitLine(raw) {
  const s = S(raw).trim().replace(/^\*\s*/, ''), m = /^([a-z0-9_ .\-]+?)(?:\s+(filled|\d+))?$/i.exec(s);
  if (!m || /\b(filling|dev)\b/i.test(s)) return null;
  return { item: m[1].trim(), filled: low(m[2]) === 'filled', count: m[2] && /^\d+$/.test(m[2]) ? +m[2] : undefined };
}

module.exports = {
  id: 'soldier',
  verbs: ['make', 'change'],
  // Gates of Hell: the group goh (soldier.goh.js): change through the Units page, make through the gen steps breed and kit
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 30,
  title: P + 't',
  census: 'soldier',
  base: { lookup: 'breed' },
  groups: [
    { id: 'goh', title: P + 'g.goh', essential: true, q: require('./soldier.goh').questions() },
    { id: 'id', title: P + 'g.id', essential: true, q: [
      // on a change the first answer: yes takes his card off the list and every other question goes away (they would not be written)
      Q('cremove', 'yesno', ['card.remove'], { when: { $verb: 'change' }, limits: { limit: 'TST-94' } }),
      // a change keeps the name; the army is always the copy's (pick a soldier of the army you want in What to copy)
      Q('name', 'id', ['breed.name', 'card.decl'], { when: MAKE, unique: { lookup: 'breedname' }, limits: { re: '^[a-z][a-z0-9_]{0,40}$', reHint: P + 'x.name', limit: 'HUM-18' } }),
      Q('display', 'text', ['text.desc_human'], { optional: true, limits: { limit: 'LOC-02' } }),
    ] },
    { id: 'look', title: P + 'g.look', essential: false, q: [
      Q('skin', 'thing', ['breed.skin', 'humanskin.def.extension', 'humanskin.def.texmod', 'humanskin.mtl.diffuse', 'humanskin.mtl.bump', 'humanskin.mtl.specular', 'humanskin.texture.files'],
        { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'humanskin', branch: 'skin' } }),
      Q('helmet', 'thing', ['breed.armors.head'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'headgear', branch: 'item' }, limits: { limit: 'HUM-22' } }),
      Q('bodyarmor', 'choice', ['breed.armors.body'], { limits: { values: ['none', 'body_armor', 'kamikaze_bomb'], limit: 'HUM-22' } }),
    ] },
    { id: 'card', title: P + 'g.card', essential: true, q: [
      Q('cp', 'number', ['card.cp'], { limits: { min: 0.25, max: 10, step: 0.05, unit: 'points', limit: 'SDL-30' } }),
    ] },
    { id: 'kind', title: P + 'g.kind', essential: false, q: [
      Q('behaviour', 'choice', ['breed.behaviour'], { limits: { values: ['soldier', 'civilian'] } }),
      Q('hero', 'yesno', ['breed.hero']),
      Q('tags', 'list', ['breed.tags'], { optional: true, limits: { re: '^[a-z0-9_]+$', limit: 'HUM-19' } }),
      Q('nationality', 'choice', ['breed.nationality'], { limits: { values: ARMIES } }),
    ] },
    { id: 'face', title: P + 'g.face', essential: false, q: [
      Q('portrait', 'thing', ['breed.portrait'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'portrait', branch: 'icon' }, limits: { limit: 'UI-03' } }),
      Q('icon', 'thing', ['breed.icon', 'icon.unit_icon', 'icon.unit_icon_small'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'uniticon', branch: 'icon' }, limits: { limit: 'UI-03' } }),
      Q('icon_priority', 'number', ['breed.icon_priority'], { limits: { min: 0, max: 10, step: 1, unit: 'rank' } }),
    ] },
    { id: 'voice', title: P + 'g.voice', essential: false, q: [
      Q('voice', 'thing', ['breed.voice'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'voice', branch: 'voice' } }),
    ] },
    { id: 'kit', title: P + 'g.kit', essential: false, q: [
      // one line each: as copied, typed, or a new gun made in its own task (branch per line)
      Q('inventory', 'list', ['breed.inventory.item', 'breed.inventory.item.tags', 'breed.inventory.item.count', 'breed.inventory.item.filled', 'breed.inventory.in_hands'],
        { picker: { sources: ['keep', 'exist', 'branch', 'value'], lookup: 'kititem', branch: 'gun' }, limits: { reHint: P + 'x.inventory', re: '^\\*?\\s*[^"{}()]+$', limit: 'HUM-21' } }),
      Q('newitem', 'thing', ['breed.inventory.item'], { picker: { sources: ['keep', 'branch'], branch: 'item' } }),
    ] },
    // a kit line with a random spread (dev) or a filling, written as is over the line of an item he keeps (set op add on keyed lines)
    { id: 'kitx', title: P + 'g.kitx', essential: false, q: [
      Q('kitx', 'list', ['breed.inventory.item.dev', 'breed.inventory.item.filling'], { optional: true, limits: { re: '^[a-z0-9_ ]+ ([0-9]+ dev [0-9]+|filling [a-z0-9_ ]+ [0-9]+)$', reHint: P + 'x.kitx', unit: 'pieces', limit: 'HUM-21' } }),
    ] },
    { id: 'body', title: P + 'g.body', essential: false, q: [
      Q('health', 'choice', ['breed.perks.health'], { limits: { values: HEALTH, unit: '%', limit: 'GPL-13' } }),
      Q('health_regeneration', 'choice', ['breed.perks.health_regeneration'], { limits: { values: REGEN, unit: '%', limit: 'GPL-13' } }),
      Q('stamina', 'choice', ['breed.perks.stamina'], { limits: { values: REGEN, unit: '%', limit: 'GPL-13' } }),
      Q('stamina_regeneration', 'choice', ['breed.perks.stamina_regeneration'], { limits: { values: SREGEN, unit: '%', limit: 'HUM-02' } }),
      Q('speed', 'number', ['breed.perks.speed'], { limits: { min: 0.5, max: 1.5, step: 0.05, unit: 'x', usual: [0.8, 1], limit: 'HUM-36' } }),
    ] },
    { id: 'skill', title: P + 'g.skill', essential: false, q: SKILLS.map(skillQ).concat([
      Q('tank', 'number', ['breed.perks.tank'], { limits: { min: 0.1, max: 2, step: 0.05, unit: 'x', usual: [0.6, 1] } }),
      Q('vehicle', 'number', ['breed.perks.vehicle'], { limits: { min: 0.1, max: 2, step: 0.05, unit: 'x', usual: [0.8, 1] } }),
      Q('cannon', 'number', ['breed.perks.cannon'], { limits: { min: 0.1, max: 2, step: 0.05, unit: 'x', usual: [0.8, 1] } }),
      // the breed op swaps the ("veterancy_N") call of a new soldier; on a change the macro op renames the call (the define must be there)
      Q('veterancy', 'thing', ['breed.veterancy'], { picker: { sources: ['keep', 'exist'], lookup: 'veterancy', in: 'army' }, limits: { limit: 'HUM-17' } }),
    ]) },
    { id: 'sight', title: P + 'g.sight', essential: false, q: [
      Q('vision', 'choice', ['breed.perks.vision'], { limits: { values: VISION } }),
      Q('field_glass', 'yesno', ['breed.perks.field_glass']),
      Q('telescope', 'yesno', ['breed.perks.telescope']),
    ] },
    { id: 'perks', title: P + 'g.perks', essential: false, q: [
      Q('stealth', 'yesno', ['breed.perks.stealth']),
      Q('aimedshot', 'yesno', ['breed.perks.aimedshot']),
    ] },
    { id: 'points', title: P + 'g.points', essential: false, q: [
      // the card of a soldier that is already there is a shared macro call: asked on make only (the breed op writes it)
      Q('score', 'number', ['card.score'], { limits: { min: 0.25, max: 20, step: 0.05, unit: 'points', limit: 'SDL-30' } }),
      Q('cw', 'number', ['card.cw'], { limits: { min: 0.25, max: 10, step: 0.05, unit: 'x', limit: 'SDL-30' } }),
      Q('dtags', 'text', ['card.tags'], { limits: { re: '^[A-Za-z0-9_% ]+$', limit: 'MIS-04' } }),
      // card flags (the card op): basic keeps the card when a game mode takes units out; remove takes his card off the list
      Q('basic', 'yesno', ['card.basic']),
    ] },
    { id: 'squads', title: P + 'g.squads', essential: false, q: [
      // yes asks which squad and how many; no asks neither (preset yes when he is made for a line of a squad: the count goes there)
      Q('join', 'yesno', ['soldier.squads']),
      // a squad of his army, or a new squad made in its own task after him (its ops go after his, so his breed is there)
      Q('joinsquad', 'thing', ['soldier.squads'], { when: { join: true }, picker: { sources: ['keep', 'exist', 'branch'], lookup: 'squad', branch: 'squad', order: 'after', pass: { for: 'soldier' } }, limits: { limit: 'MIS-75' } }),
      Q('joincount', 'number', ['soldier.squads'], { when: { join: true }, limits: { min: 1, max: 8, step: 1, unit: 'men' } }),
    ] },
  ],
  kept: [
    // reason classes: shared (a file every soldier, or every wearer of a skin, reads), model (tied to the 3D model), owned by another
    // task, no effect, no tool step yet
    ['humanskin.def.tag', 'shared and owned by the skin task: the skin def is read by every soldier who wears that skin; the skin task has no def writer yet'],
    ['humanskin.def.rimlight', 'shared and owned by the skin task: the skin def is read by every soldier who wears that skin; the skin task has no def writer yet'],
    ['humanskin.mtl.kind', 'shared and owned by the skin task: skin.mtl is read by every soldier who wears that skin'],
    ['humanskin.mtl.color', 'shared and owned by the skin task: skin.mtl is read by every soldier who wears that skin'],
    ['humanskin.mtl.blend', 'shared and owned by the skin task: skin.mtl is read by every soldier who wears that skin'],
    ['humanskin.mtl.tile', 'shared and owned by the skin task: skin.mtl is read by every soldier who wears that skin'],
    ['humanskin.mesh', 'tied to the model: the body mesh comes with the picked skin; a new mesh is a model task (38 bone skeleton, PORT-185)'],
    ['humanskin.skeleton', 'tied to the model: the skeleton comes with the picked skin; a new one is a model task (PORT-185)'],
    ['icon.squad_panel', 'owned by the icon task (squad card picture, kind squad): the breed icon question picks the set or branches there'],
    ['breed.inventory.item.filled_n', 'no tool step yet: the kit op writes filled only; the magazine size belongs to the gun and changes it for every soldier (HUM-20)'],
    ['breed.army', 'his army is the army of the soldier picked in What to copy: to make a soldier of another army, copy a soldier of that army'],
    ['breed.perks.weapon_reload', 'no effect: the engine reads no weapon_reload perk, so a value would change nothing (HUM-11)'],
    ['breed.veterancy.thresholds', 'shared: the veterancy_generic.inc table is read by every soldier of the army'],
    ['text.names', 'shared: the name lists are per nationality and every soldier of that nationality draws from them (the nationality question picks the list)'],
    ['card.breed', 'no tool step yet: the breed op cannot drop the {breed} flag, and every soldier card needs it (no safe other value)'],
    ['human.health.max', 'shared: human.ext changes every soldier; health is set per soldier as a percent'],
    ['human.health.current', 'shared: human.ext changes every soldier'],
    ['human.health.inc', 'shared: human.ext changes every soldier; regeneration is set per soldier as a percent'],
    ['human.stamina.max', 'shared: human.ext changes every soldier; stamina is set per soldier as a percent'],
    ['human.stamina.current', 'shared: human.ext changes every soldier'],
    ['human.stamina.load', 'shared: human.ext changes every soldier'],
    ['human.stamina.inc', 'shared: human.ext changes every soldier'],
    ['human.stamina.movement_limits', 'shared: human.ext changes every soldier'],
    ['human.box.size', 'shared: human.ext changes every soldier'],
    ['human.box.weight', 'shared: human.ext changes every soldier'],
    ['human.armor.head.pierceabsorb', 'shared: human.ext changes every soldier'],
    ['human.armor.body.pierceabsorb', 'shared: human.ext changes every soldier'],
    ['human.armor.body.heatdamping', 'shared: human.ext changes every soldier'],
    ['human.talk.talker', 'shared: the talker set changes every soldier'],
    ['human.foot_speed', 'shared: the engine foot speeds change every soldier; speed is set per soldier as a factor'],
    ['ability.levels', 'shared: set/ability changes every soldier; levels are picked per soldier'],
    ['ability.weapon.accuracy', 'shared: set/ability changes every soldier'],
    ['veterancy.rank.health', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.health_regeneration', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.stamina', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.stamina_regeneration', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.crew', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.weapon_reload', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.weapon_skill', 'shared: veterancy.set changes every soldier'],
    ['veterancy.rank.medic', 'shared: veterancy.set changes every soldier'],
  ],
  test: P + 'test',
  checklist: [P + 'c.buy', P + 'c.look', P + 'c.kit', P + 'c.card', P + 'c.log'],
  lookups,
  // the copy's answers; on make the name is already a free one (copy's name plus _2 ..) and the shown name is the copy's text
  values: async (ctx, base, opt) => {
    if (isGoh(ctx, opt)) return SG().values(ctx, base, opt);
    const id = parseId(base && base.id);
    if (!id) return { cremove: false, join: false };
    const g = gameOf(ctx, opt && opt.game), mod = ctx && ctx.mod, r = readSoldier(g, mod, id.army, id.name);
    if (!r) return { cremove: false, join: false };
    const v = Object.assign({}, r.values);
    v.display = textOf(g, mod, 'desc/human/mp/' + id.army + '/' + id.name);
    if (!(opt && opt.verb === 'change')) v.name = freeName(breedNames(g, mod), id.name);
    // made for a line of a squad (the squad task's members branch): the count is asked, it goes to that squad
    if (opt && opt.pass && opt.pass.for === 'squad') v.join = true;
    return v;
  },
  // what the joinsquad branch gives the new squad: a squad line of his army to copy (one he is in, else the first)
  pass: async (parent, qid, ctx) => {
    if (qid !== 'joinsquad') return null;
    const id = parseId(parent && parent.base && parent.base.id) || {}, army = low(id.army);
    if (!army) return { for: 'soldier' };
    const sq = readSquads(gameOf(ctx, parent && parent.game), ctx && ctx.mod).filter(x => x.army === army && /^squad_with\dtypes$/.test(x.macro));
    const like = sq.find(x => x.members.some(m => m.breed === id.name)) || sq[0];
    return Object.assign({ for: 'soldier' }, like ? { base: { id: like.name + '(' + army + ')', name: like.name } } : {});
  },
  compile: (draft, c) => {
    if (String(c.game) === 'goh') return SG().compile(draft, c);
    const base = parseId(c.base && c.base.id);
    if (!base) throw bad('Pick the soldier to copy first.');
    // the army is always the copy's; a change keeps the name (the name question is asked on make only)
    const make = c.verb !== 'change', army = base.army, name = make ? low(c.value('name') || base.name) : base.name;
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(name)) throw bad('The name takes small letters, digits and _ only.');
    const g = handle(c.gameDir, c.game), mod = c.mod;
    if (!g) throw bad('No game folder found. Set the game folder first (the Game folder button at the top).');
    if (make && readKey(g, mod, breedKey(army, name))) throw bad('There is already a soldier ' + army + '/' + name + '. Pick a new name.');
    // the copy is the base soldier's name in the target army (the breed op copies within one army)
    const like = readSoldier(g, mod, army, base.name);
    if (!like) throw bad('The soldier ' + army + '/' + base.name + ' to copy is not there any more. Pick the soldier to copy again.');
    const lv = like.values, has = like.has, notes = [];
    lv.display = textOf(g, mod, 'desc/human/mp/' + army + '/' + base.name);
    const val = id => c.value(id);
    const changed = id => { const v = val(id); return v !== undefined && v !== null && !same(v, lv[id]); };
    const rows = [];
    const put = (p, v) => rows.push({ op: has.has(p) ? 'set' : 'add', path: 'breed/' + p, value: v });
    const del = p => { if (has.has(p)) rows.push({ op: 'del', path: 'breed/' + p, value: '' }); };
    // plain lines
    for (const [id, k, quoted] of [['skin', 'skin', 1], ['portrait', 'portrait', 1], ['icon', 'icon', 1], ['icon_priority', 'icon_priority', 0], ['nationality', 'nationality', 0]]) {
      if (changed(id)) { const v = S(val(id)).trim(); if (!v) throw bad('The ' + id + ' answer is empty.'); put(k, quoted ? q(v) : v); }
    }
    if (changed('voice')) { const v = low(val('voice')); if (!v || v === 'auto') del('voice'); else put('voice', v); }
    if (changed('behaviour')) { const v = low(val('behaviour')); if (v === 'soldier' && !has.has('behaviour')) { /* default */ } else put('behaviour', v); }
    if (changed('hero')) { if (val('hero')) put('hero', ''); else del('hero'); }
    if (changed('tags')) { const t = [].concat(val('tags') || []).map(low).filter(Boolean); if (!t.length) del('tags'); else put('tags', q(t.join(' '))); }
    // armors
    for (const [id, k] of [['helmet', 'head'], ['bodyarmor', 'body']]) {
      if (!changed(id)) continue;
      const v = low(val(id));
      if (!v || v === 'none') { del('armors/' + k); continue; }
      if (!has.has('armors')) { rows.push({ op: 'add', path: 'breed/armors', value: '' }); has.add('armors'); }
      put('armors/' + k, q(v));
    }
    // perks
    const perkRow = (p, v) => {
      if (!has.has('perks')) { rows.push({ op: 'add', path: 'breed/perks', value: '' }); has.add('perks'); }
      if (has.has('perks/' + p)) rows.push({ op: 'set', path: 'breed/perks/' + p, value: v });
      else rows.push({ op: 'add', path: 'breed/perks/"' + p + '"', value: v });
    };
    for (const p of PCT_PERKS) if (changed(p)) perkRow(p, q(val(p)));
    for (const p of NUM_PERKS) if (changed(p)) perkRow(p, String(Number(val(p))));
    if (changed('vision')) perkRow('vision', q(val('vision')));
    // weapon skills: a skill he did not have goes first. The engine takes the first weapon skill in his perk list that fits the weapon
    // in his hands (HUM-15), and an add lands at the end of the list, so his other weapon skill lines are taken out and written again
    // after the new ones (in their old order, with their new levels)
    const wantW = id => { const v = changed(id) ? low(val(id)) : low(lv[id]); return v && v !== 'none' ? v : null; };
    const newW = WSKILLS.filter(p => !has.has('perks/' + p) && wantW(p));
    for (const p of SKILLS.filter(x => !WSKILLS.includes(x))) if (changed(p)) { const v = low(val(p)); if (v === 'none') del('perks/' + p); else perkRow(p, v); }
    if (newW.length) {
      const oldW = like.perkOrder.filter(p => WSKILLS.includes(p) && has.has('perks/' + p));
      for (const p of oldW) del('perks/' + p);
      for (const p of oldW) has.delete('perks/' + p);
      for (const p of newW.concat(oldW)) { const v = wantW(p); if (v) perkRow(p, v); }
    } else for (const p of WSKILLS) if (changed(p)) { const v = low(val(p)); if (v === 'none') del('perks/' + p); else perkRow(p, v); }
    for (const p of FLAG_PERKS) if (changed(p)) { if (val(p)) perkRow(p, ''); else del('perks/' + p); }
    // kit: the answer lines against the copy's items; '*' marks the item in hands. A branch line is a new gun (its task's result)
    const kit = { add: [], del: [] };
    const ia = c.answer('inventory'), iv = [].concat(val('inventory') || []), guns = [], typed = [];
    let starTyped = false;   // a line the user typed (not kept as copied) carries the *
    if (ia && ia.src === 'list') (ia.items || []).forEach((it, i) => {
      const s = S(iv[i]).trim();
      if (it && it.src === 'branch') { if (!s) throw bad('Line ' + (i + 1) + ' of his kit is a new gun whose task has no result yet. Finish that task first.'); guns.push(s.split('/').pop()); }
      else if (s) { typed.push(s); if (it && it.src !== 'keep' && STAR.test(s)) starTyped = true; }
    });
    else { typed.push(...iv.map(s => S(s).trim()).filter(Boolean)); starTyped = typed.some(s => STAR.test(s)); }
    // a new gun goes into his hands unless a line you typed carries the *
    const gunHands = guns.length > 0 && !starTyped;
    const invChanged = !!ia && ia.src !== 'keep' && !same(typed, lv.inventory);
    if (invChanged || guns.length || S(val('newitem')).trim()) {
      const ans = (invChanged ? typed : lv.inventory.slice()).map(s => (gunHands ? s.replace(STAR, '') : s));
      const raws = ans.map(s => s.replace(/^\*\s*/, '').replace(/\s+/g, ' ').toLowerCase());
      const marked = ans.filter(s => /^\*/.test(s));
      if (marked.length > 1) throw bad('Only one item can be in his hands: mark one line with *.');
      const likeRaw = like.items.map(x => x.raw.toLowerCase());
      for (const it of like.items) if (!raws.includes(it.raw.toLowerCase())) kit.del.push(it.name);
      const handsNow = like.items.find(x => x.hands), want = marked.length ? marked[0].replace(/^\*\s*/, '').replace(/\s+/g, ' ').toLowerCase() : null;
      ans.forEach((s, i) => {
        const r = raws[i], isNew = !likeRaw.includes(r), toHands = want === r && !(handsNow && handsNow.raw.toLowerCase() === r);
        if (!isNew && !toHands) return;
        const k = kitLine(s);
        if (!k) throw bad('This kit line cannot be written: ' + s + '. Write the item name, then filled or a count.');
        if (!isNew) kit.del.push(low(k.item));
        kit.add.push(Object.assign({ item: k.item }, k.filled ? { filled: true } : { count: k.count || 1 }, toHands ? { in_hands: true } : {}));
      });
      // new guns go in loaded; the first one into his hands (gunHands)
      if (handsNow && kit.del.includes(handsNow.name) && !kit.add.some(a => a.in_hands) && !gunHands) throw bad('The item in his hands (' + handsNow.raw + ') is taken out. Mark another line with *.');
      guns.forEach((gname, i) => {
        if (kit.add.some(a => low(a.item) === low(gname))) throw bad('The gun ' + gname + ' is in his kit twice.');
        kit.add.push(Object.assign({ item: gname, filled: true }, gunHands && i === 0 ? { in_hands: true } : {}));
        if (gunHands && i === 0) notes.push('The new gun ' + gname + ' goes into his hands (no line you typed is marked with *).');
      });
      const item = S(val('newitem')).trim();
      if (item) kit.add.push({ item: item.split('/').pop(), count: 1 });
    }
    // a new count for an item he has: the kit op sets that line in place (no del)
    kit.del = kit.del.filter(n => !kit.add.some(a => low(a.item) === low(n) && a.count !== undefined && !a.in_hands));
    // kit lines with a spread or a filling: a set row (add on keyed item lines sets the line of that item in place)
    for (const s of [].concat(val('kitx') || []).map(x => low(x).replace(/\s+/g, ' ')).filter(Boolean)) {
      const m = /^(.+?) (\d+) dev (\d+)$/.exec(s), f = m ? null : /^(.+?) filling (.+) (\d+)$/.exec(s);
      if (!m && !f) throw bad('This kit line cannot be read: ' + s + '. Write the item, its count, dev and the spread (ammo rifle 100 dev 20), or the item, filling, the thing and its count (flamethrower filling fuel 80).');
      const it = (m || f)[1];
      if (m && +m[3] > +m[2]) throw bad('The spread of ' + it + ' is 0 to its count (' + m[2] + '): ' + s + '.');
      if (!like.items.some(x => low(x.name) === it)) throw bad('The kit line ' + s + ' is for an item he does not carry as copied (' + it + '). Give him the item in the kit list first, in an earlier task.');
      if (kit.add.some(a => low(a.item) === it) || kit.del.includes(it)) throw bad('The item ' + it + ' is changed in the kit list too. Change it in one place.');
      rows.push({ op: 'add', path: 'breed/inventory/item', value: m ? q(it) + ' ' + m[2] + ' dev ' + m[3] : q(it) + ' filling ' + q(f[2]) + ' ' + f[3] });
    }
    // card fields
    const decl = {};
    for (const k of ['cp', 'score', 'cw']) if (changed(k)) decl[k] = String(Number(val(k)));
    if (changed('dtags')) decl.tags = q(S(val('dtags')).replace(/\s+/g, ' ').trim());
    // card flags: basic on both verbs, remove on a change (the card op)
    const flags = {};
    if (changed('basic')) flags.basic = !!val('basic');
    if ((Object.keys(decl).length || Object.keys(flags).length || val('cremove') === true) && !like.decl) throw bad('The soldier has no card in soldiers.set, so its card fields cannot be set.');
    if (make && Object.keys(decl).length && !like.decl) throw bad('The copied soldier has no card in soldiers.set, so its card fields cannot be set.');
    // the shown name: written when it differs from the copy's text (kept as copied, a new soldier gets the copy's text)
    const display = changed('display') ? S(val('display')).trim() : '';
    // ops
    const key = breedKey(army, name), ops = [];
    let vet;
    if (changed('veterancy') && S(val('veterancy')).trim()) {
      const vm = VET.exec(low(val('veterancy')));
      if (!vm) throw bad('Pick a rank table (veterancy_N) from the list.');
      if (!lv.veterancy) throw bad('The copied soldier has no ("veterancy_N") call to change.');
      vet = vm[1];
    }
    const vetOp = !make && vet !== undefined ? { op: 'macro', entity: 'file:' + breedKey(army, name), macro: lv.veterancy, rename: low(val('veterancy')) } : null;
    const unit = 'mp/' + army + '/' + name;
    // take his card off the list: the card op writes {remove}; nothing else is written then
    if (!make && val('cremove') === true) return { gen: { ops: [{ op: 'card', unit, army, remove: true }] }, notes: ['The card of ' + unit + ' is taken off the list; his other answers are not written.'], result: army + '/' + name };
    let cardOp = null;
    if (!make && Object.keys(decl).length) {
      cardOp = { op: 'card', unit, army };
      if (decl.cp !== undefined) cardOp.cp = decl.cp;
      if (decl.score !== undefined) cardOp.score = decl.score;
      if (decl.cw !== undefined) cardOp.fields = { cw: decl.cw };
      if (decl.tags !== undefined) {
        const was = S(lv.dtags).split(/\s+/).filter(Boolean).map(low), now = S(val('dtags')).split(/\s+/).filter(Boolean).map(low);
        const tg = now.filter(w => !was.includes(w)).concat(was.filter(w => !now.includes(w)).map(w => '-' + w));
        if (tg.length) cardOp.tags = tg;
      }
    }
    if (Object.keys(flags).length) cardOp = Object.assign(cardOp || { op: 'card', unit, army }, flags);
    if (make) ops.push(Object.assign({ op: 'breed', name, army, like: base.name }, Object.keys(decl).length ? { decl } : {}, display ? { display } : {}, vet !== undefined ? { veterancy: vet } : {}));
    else if (display) ops.push({ op: 'text', key: 'desc/human/mp/' + army + '/' + name, text: display });
    if (cardOp) ops.push(cardOp);
    if (vetOp) ops.push(vetOp);
    if (rows.length) ops.push({ op: 'set', rows: rows.map(r => ({ entity: 'file:' + key, path: r.path, value: r.value, op: r.op })) });
    if (kit.add.length || kit.del.length) ops.push(Object.assign({ op: 'kit', breed: army + '/' + name }, kit.add.length ? { add: kit.add } : {}, kit.del.length ? { del: kit.del } : {}));
    // join a squad: change its count when he is in it, else add a c<N+1>(name:n) and move the line to the next squad_with<N>types macro.
    // A new squad made in the branch takes him in itself (its ops run after his: picker order after)
    // no to joining asks neither the squad nor the count, so both are left out then
    const joins = val('join') === true;
    const ja = joins ? c.answer('joinsquad') : null, jn = joins ? Math.max(1, Math.min(8, Math.round(Number(val('joincount')) || 1))) : 1;
    const js = !joins || (ja && ja.src === 'branch') ? '' : S(val('joinsquad')).trim();
    if (ja && ja.src === 'branch') notes.push('He goes into the new squad ' + S(ja.result || '') + ' (' + jn + ' men), made in its own task after him.');
    if (js) {
      const m = /^([a-z0-9_]+)\(([a-z0-9_]+)\)$/.exec(low(js));
      if (!m) throw bad('Pick a squad from the list.');
      if (m[2] !== army) throw bad('The squad ' + js + ' belongs to another army. Pick a squad of ' + army + '.');
      const sq = readSquads(g, mod).find(x => x.name === m[1] && x.army === m[2]);
      if (!sq) throw bad('The squad ' + js + ' is not a squad line in squads.set (a squad written as a card block cannot be joined by a task yet).');
      const n = jn, match = squadMatch(sq), ent = 'file:' + SQUADS;
      const mine = sq.members.find(x => x.breed === name);
      if (mine) ops.push({ op: 'macro', entity: ent, macro: sq.macro, match, arg: mine.arg, value: name + ':' + n });
      else {
        const mm = /^squad_with(\d+)types$/.exec(sq.macro);
        if (!mm || +mm[1] !== sq.members.length) throw bad('The squad ' + js + ' is not a plain squad_with<N>types line, so a task cannot add a soldier type to it.');
        if (sq.members.length >= 4) throw bad('The squad ' + js + ' has 4 soldier types already, the most a squad line holds. Pick another squad, or make a new squad.');
        ops.push({ op: 'macro', entity: ent, macro: sq.macro, match, arg: 'c' + (sq.members.length + 1), value: name + ':' + n, add: true });
        ops.push({ op: 'macro', entity: ent, macro: sq.macro, match, rename: 'squad_with' + (sq.members.length + 1) + 'types' });
      }
    }
    if (!ops.length) notes.push('Nothing differs from ' + base.army + '/' + base.name + ': there is nothing to write.');
    // made for a line of a squad (the squad task's members branch): the squad reads army/name:count
    const forSquad = !!(c.pass && c.pass.for === 'squad');
    return { gen: ops.length ? { ops } : null, notes, result: army + '/' + name + (forSquad ? ':' + jn : '') };
  },
  // shared with the lang file and the test
  _lib: { gidOf, handle, unhandle, gameOf, vfsOf, readSoldier, readSquads, readDecl, readKey, parseId, textOf, freeName, draftArmy, kitItems, WSKILLS, ARMIES, HEALTH, REGEN, SREGEN, LVL, VISION, SKILLS },
};
// on a change, the remove answer comes first: yes hides every other question (none of them would be written)
// the AS2 questions: asked on the AS2 tabs only (the goh group is the Gates of Hell form)
for (const g of module.exports.groups) for (const q of g.q) if (!/^goh/.test(q.id)) {
  if (q.id !== 'cremove') q.when = Object.assign({ cremove: false }, q.when || {});
  q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });
}
