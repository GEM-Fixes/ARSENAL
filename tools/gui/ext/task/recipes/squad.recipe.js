// recipe "squad": make a new squad (a buy card in set/multiplayer/units/squads.set) from a copy, or change one. Census
// census/squad.json. Members are a list of breed:count lines; up to two new soldiers branch to the soldier task. Written through gen
// ops: squad (make: the line or card block, texts, bots), macro (change: the squad's own line), text (change: shown name and
// tooltip), and file copies (the four buy card icon frames). Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-8e5a3fd3)
'use strict';
const fs = require('fs'), path = require('path');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');

const ARMIES = ['eng', 'ger', 'ger2', 'jap', 'rus', 'usa'];
const GROUPS = ['squad_1', 'squad_2', 'squad_3', 'squad_4', 'squad_5', 'squad_6', 'squad_7', 'squad_8', 'squad_9',
  'soldier_1', 'soldier_2', 'soldier_3', 'soldier_4', 'soldier_5', 'soldier_6', 'soldier_7', 'soldier_8', 'soldier_9', 'soldier_10'];
const BUTTONS = ['squad1', 'squad2'];
const BOT_CLASSES = ['Infantry', 'ATInfantry', 'Vehicle', 'Tank', 'HeavyTank', 'ATTank', 'AATank', 'ArtilleryTank'];
const SQUADS = 'resource/set/multiplayer/units/squads.set';
const BREED_KEY = /^resource\/set\/breed\/mp\/([a-z0-9_]+)\/([a-z0-9_]+)\.set$/;
const BOTKEY = 'resource/script/multiplayer/bot.data.lua';
const ICONS = 'resource/interface/scene/unit_icon/';

const P = 'task.squad.';
const Q = (id, kind, covers, extra) => Object.assign({ id, kind, ask: P + 'q.' + id, help: P + 'h.' + id, covers }, extra || {});
const MAKE = { $verb: 'make' }, CHANGE = { $verb: 'change' };
// card block fields a new squad may set (optional text answers, empty = not set): field, min, max
const OVR = { ccp: ['cp', 0.25, 40], cscore: ['score', 0.25, 40], ccw: ['cw', 0.25, 10], cicon: ['icon', 0, 99] };
// the same ranges as patterns, so the page refuses a number out of range at the question (empty = not set)
const FRAC = '(\\.[0-9]+)?';
const OVR_RE = {
  ccp: '^(|0\\.(2[5-9]|[3-9])[0-9]*|([1-9]|[1-3][0-9])' + FRAC + '|40(\\.0+)?)$',
  cscore: '^(|0\\.(2[5-9]|[3-9])[0-9]*|([1-9]|[1-3][0-9])' + FRAC + '|40(\\.0+)?)$',
  ccw: '^(|0\\.(2[5-9]|[3-9])[0-9]*|[1-9]' + FRAC + '|10(\\.0+)?)$',
  cicon: '^([0-9]{1,2})?$',
};

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
function hasKey(g, mod, key) { if (modFile(mod, key)) return true; const v = vfsOf(g); return !!(v && v.files.has(key)); }
function keysUnder(g, mod, prefix) {
  const s = new Set(), v = vfsOf(g);
  if (v) for (const k of v.files.keys()) if (k.startsWith(prefix)) s.add(k);
  if (mod) (function walk(d, rel) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) { const r = rel + e.name.toLowerCase(); if (e.isDirectory()) walk(path.join(d, e.name), r + '/'); else s.add(r); }
  })(path.join(mod, ...prefix.split('/')), prefix);
  return [...s].sort();
}
const S = x => (x == null ? '' : String(x));
// the soldier recipe's readers (texts, free names, the draft's army)
const SL = () => require('./soldier.recipe')._lib;
const low = x => S(x).trim().toLowerCase();
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
function parseId(id) { const m = /^([a-z0-9_]+)\(([a-z0-9_]+)\)$/.exec(low(id)); return m ? { name: m[1], army: m[2] } : null; }
const arg = (code, k) => { const m = new RegExp('(?:^|[\\s(])' + k + '\\(([^()]*)\\)', 'i').exec(code); return m ? m[1].trim() : undefined; };
const blockVal = (blk, k) => { const m = new RegExp('\\{\\s*' + k + '\\s+("[^"]*"|[^{}\\s]+)\\s*\\}', 'i').exec(blk); return m ? m[1].replace(/^"|"$/g, '') : undefined; };

// every squad of every army in squads.set: macro lines and card blocks {"name(army)" ..}
function readSquads(g, mod) {
  const b = readKey(g, mod, SQUADS);
  if (!b) return [];
  const t = b.toString('latin1'), lines = t.split(/\r?\n/), out = [];
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/;.*$/, '');
    const mc = /^\s*\(\s*"((?:squad|single)_with\w*)"/i.exec(code);
    if (mc) {
      const side = arg(code, 'side'), name = arg(code, 'name');
      if (!side || !name) continue;
      const members = [...code.matchAll(/(?:^|\s)(c\d+)\(([a-z0-9_]+):(\d+)\)/ig)].map(x => ({ arg: x[1].toLowerCase(), breed: x[2].toLowerCase(), n: +x[3] }));
      out.push({ form: 'line', army: side.toLowerCase(), name: name.toLowerCase(), macro: mc[1].toLowerCase(), line: code.replace(/\s+/g, ' ').trim(), members,
        f: { cost: arg(code, 'cost'), c: arg(code, 'c'), f: arg(code, 'f'), g: arg(code, 'g'), b: arg(code, 'b'), t: arg(code, 't'), level: arg(code, 'level') } });
      continue;
    }
    const bm = /^\s*\{\s*"([a-z0-9_]+)\(([a-z0-9_]+)\)"/i.exec(code);
    if (bm) {
      let d = 0, j = i, blk = '';
      for (; j < lines.length; j++) { const l = lines[j].replace(/;.*$/, '').replace(/"[^"]*"/g, m => m.replace(/[{}]/g, '')); blk += lines[j].replace(/;.*$/, '') + '\n'; for (const ch of l) { if (ch === '{') d++; else if (ch === '}') d--; } if (d <= 0) break; }
      const content = blockVal(blk, 'content') || '', members = [];
      for (const w of content.split(/\s+/)) { const m = /^(?:mp\/[a-z0-9_]+\/)?([a-z0-9_]+)(?::(\d+))?$/i.exec(w); if (m) members.push({ arg: '', breed: m[1].toLowerCase(), n: +(m[2] || 1) }); }
      const tags = S(blockVal(blk, 'tags')).replace(new RegExp('^frontline_cp infantry ' + bm[2] + '\\s*', 'i'), '');
      out.push({ form: 'block', army: bm[2].toLowerCase(), name: bm[1].toLowerCase(), macro: '', line: '', members, content, remove: /\{\s*remove\s*\}/i.test(blk), nfs: /\{\s*not_for_sale\s*\}/i.test(blk),
        f: { cost: blockVal(blk, 'cost'), c: blockVal(blk, 'charge'), f: blockVal(blk, 'fore'), g: blockVal(blk, 'group'), b: blockVal(blk, 'button'), t: tags, level: blockVal(blk, 'level') } });
      i = j;
    }
  }
  return out.filter(x => !x.remove);
}
function findSquad(g, mod, army, name) { const all = readSquads(g, mod); for (let i = all.length - 1; i >= 0; i--) if (all[i].army === army && all[i].name === name) return all[i]; return null; }
// bot.data.lua Purchases entries of name(army): {buy, priority, class, min_income, min_team} from the first one
function readBots(g, mod, army, name) {
  const b = readKey(g, mod, BOTKEY), re = new RegExp('\\bunit\\s*=\\s*"' + name + '\\(' + army + '\\)"', 'i');
  const l = b ? b.toString('latin1').split(/\r?\n/).find(x => !/^\s*--/.test(x) && re.test(x)) : null;
  if (!l) return { buy: false, priority: 1, class: 'Infantry', min_income: 0, min_team: 1 };
  const n = k => { const m = new RegExp('\\b' + k + '\\s*=\\s*([\\d.]+)').exec(l); return m ? Number(m[1]) : undefined; };
  const c = /\bclass\s*=\s*UnitClass\.(\w+)/.exec(l);
  return { buy: true, priority: n('priority') == null ? 1 : n('priority'), class: c ? c[1] : 'Infantry', min_income: n('min_income') || 0, min_team: n('min_team') || 1 };
}
function squadValues(g, mod, army, name) {
  const sq = findSquad(g, mod, army, name);
  if (!sq) return null;
  const bo = readBots(g, mod, army, name), num = x => (x === undefined || x === '' || isNaN(Number(x)) ? undefined : Number(x));
  const v = { army, name, display: '', info: '', content: '', icon: '', order: '',
    members: sq.members.map(m => m.breed + ':' + m.n),
    cost: num(sq.f.cost), charge: num(sq.f.c), fore: num(sq.f.f), group: low(sq.f.g), button: low(sq.f.b),
    tags: S(sq.f.t).split(/\s+/).filter(Boolean), level: num(sq.f.level), not_for_sale: !!sq.nfs,
    buy: bo.buy, priority: bo.priority, class: bo.class, min_income: bo.min_income, min_team: bo.min_team };
  for (const k of Object.keys(OVR).concat('cinfo')) v[k] = '';
  v.remove = false;
  return { values: v, squad: sq };
}
// the macro op's match text for one squad line: side(..) .. name(..) plus the next character (riflemans is not riflemans2)
function squadMatch(sq) {
  const t = sq.line.toLowerCase(), a = t.indexOf('side(' + sq.army + ')'), n = t.indexOf('name(' + sq.name + ')');
  const end = n + ('name(' + sq.name + ')').length;
  return a >= 0 && a < n ? t.slice(a, end + 1) : t.slice(n, end + 1);
}
// the four buy card frames of an icon set, for one army when there are some, else for any army
function iconFrames(g, mod, icon, army) {
  const ks = keysUnder(g, mod, ICONS), pre = ICONS + low(icon);
  const of = a => ks.filter(k => k.startsWith(pre + '(' + a + ')_'));
  let hit = of(army);
  if (!hit.length) { const m = ks.find(k => k.startsWith(pre + '(')); if (m) hit = of(/\(([a-z0-9_]+)\)_/.exec(m.slice(pre.length))[1]); }
  if (!hit.length) hit = ks.filter(k => new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_\\d\\d\\.tga$').test(k));
  return hit;
}

// ---------- lookups
function filt(list, words, limit) {
  const w = low(words);
  const hit = list.filter(x => !w || x.id.toLowerCase().includes(w) || low(x.name).includes(w));
  hit.sort((a, b) => (a.id.toLowerCase() === w ? -1 : 0) - (b.id.toLowerCase() === w ? -1 : 0) || a.id.localeCompare(b.id));
  return hit.slice(0, limit || 200);
}
// Gates of Hell (2026-11-23): card.goh.js (the Units page's GoH catalogue, Add, describe, change; army.gohcards to take a card off)
const CG = () => require('./card.goh');
const isGoh = (ctx, opt) => gidOf(ctx, opt && opt.game) === 'goh';
const lookups = {
  gohfree: async (ctx, words, opt) => CG().lookFree(ctx, words, opt),
  squad: async (ctx, words, opt) => {
    if (isGoh(ctx, opt)) return CG().look('squad', ctx, words, opt);
    const all = readSquads(gameOf(ctx, opt && opt.game), ctx.mod).map(q => ({ id: q.name + '(' + q.army + ')', name: q.name, where: q.army, ref: { key: SQUADS }, sub: q.members.map(m => m.breed + ':' + m.n).join(' ') }));
    // opt.in = an army: that army's squads only, and exact means its name (the unique check of the name question)
    const a = low(opt && opt.in), hit = a ? all.filter(x => x.where === a) : all, res = filt(hit, words, opt && opt.limit);
    return a ? { results: res, exact: hit.some(x => x.name === low(words)) } : res;
  },
  // the unique check of the name: a name a squad of any army has is taken (the page sends no army with it)
  squadname: async (ctx, words, opt) => {
    const all = [...new Set(readSquads(gameOf(ctx, opt && opt.game), ctx.mod).map(q => q.name))].map(n => ({ id: n, name: n, where: '', ref: null, sub: '' }));
    return { results: filt(all, words, opt && opt.limit), exact: all.some(x => x.id === low(words)) };
  },
  // soldiers of the squad's army (the army of the squad copied) for a members line; one man, type :count to add more
  breed: async (ctx, words, opt) => {
    const a = SL().draftArmy(ctx, opt, parseId), out = [];
    for (const k of keysUnder(gameOf(ctx, opt && opt.game), ctx.mod, 'resource/set/breed/mp/' + (a ? a + '/' : ''))) { const m = BREED_KEY.exec(k); if (m) out.push({ id: m[1] + '/' + m[2], name: '', where: m[1], ref: { key: k }, sub: m[2] }); }
    const res = filt(out, words, opt && opt.limit);
    return res.length ? res : { results: [], why: P + 'w.nobreed', do: P + 'w.nobreedDo' };
  },
  uniticon: async (ctx, words, opt) => {
    const by = new Map();
    for (const k of keysUnder(gameOf(ctx, opt && opt.game), ctx.mod, ICONS)) { const m = /unit_icon\/(.+)\(([a-z0-9_]+)\)_00\.tga$/.exec(k); if (m && !by.has(m[1])) by.set(m[1], { id: m[1], name: m[1], where: 'unit_icon', ref: { key: k }, sub: m[2] }); }
    return filt([...by.values()], words, opt && opt.limit);
  },
};

// ---------- compile helpers
function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [].concat(a == null ? [] : a).map(low).join('\n') === [].concat(b == null ? [] : b).map(low).join('\n');
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (S(a).trim() !== '' && S(b).trim() !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) === Number(b);
  return low(a) === low(b);
}
// the soldier this squad was opened for (a soldier task's joinsquad branch): {breed, n} from the parent draft's answers, or null
function parentSoldier(draft, c, army) {
  const p = c.parent;
  if (!p || p.recipe !== 'soldier' || !draft.parent || draft.parent.q !== 'joinsquad') return null;
  const a = p.answers || {}, v = k => (a[k] && (a[k].src === 'value' || a[k].src === 'exist') ? a[k].value : undefined);
  const b = /^([a-z0-9_]+)\/([a-z0-9_]+)$/.exec(low(p.base && p.base.id)) || [];
  const pa = low(p.verb === 'change' ? b[1] : v('army') || b[1]), pn = low(p.verb === 'change' ? b[2] : v('name') || b[2]);
  if (!pn) return null;
  if (pa && pa !== army) throw bad('The soldier ' + pa + '/' + pn + ' belongs to another army than the squad (' + army + ').');
  return { breed: pn, n: Math.max(1, Math.min(8, Math.round(Number(v('joincount')) || 1))) };
}
function memberList(lines, army) {
  const out = [];
  for (const s of [].concat(lines || [])) {
    const t = low(s); if (!t) continue;
    // a line picked from the list is army/name (one man), or army/name:count
    const am = /^([a-z0-9_]+)\/(.+)$/.exec(t);
    if (am && army && am[1] !== army) throw bad('The soldier ' + s + ' belongs to another army than the squad (' + army + '). Pick a soldier of ' + army + '.');
    const tt = am ? am[2].trim() : t, m = /^([a-z0-9_]+)\s*:\s*(\d+)$/.exec(tt) || /^([a-z0-9_]+)$/.exec(tt);
    if (!m) throw bad('This member line cannot be read: ' + s + '. Write the soldier type, a colon and the count, like rifle:4.');
    const n = m[2] ? +m[2] : 1;
    if (n < 1 || n > 8) throw bad('A member count is 1 to 8 men: ' + s + '.');
    const had = out.find(x => x.breed === m[1]); if (had) had.n += n; else out.push({ breed: m[1], n });
  }
  return out;
}

module.exports = {
  id: 'squad',
  verbs: ['make', 'change'],
  // Gates of Hell: the group goh (card.goh.js); every other question is AS2 only (the loop at the end)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 40,
  title: P + 't',
  census: 'squad',
  base: { lookup: 'squad' },
  groups: [
    { id: 'goh', title: P + 'g.goh', essential: true, q: require('./card.goh').questions('squad', 'squad') },
    { id: 'id', title: P + 'g.id', essential: true, q: [
      // on a change the first answer: yes takes the squad off the buy list and every other question goes away (none would be written)
      Q('remove', 'yesno', ['squad.card.remove'], { when: CHANGE, limits: { limit: 'TST-94' } }),
      // a change keeps the name; the army is always the copy's (pick a squad of the army you want in What to copy)
      Q('name', 'id', ['squad.name'], { when: MAKE, unique: { lookup: 'squadname' }, limits: { re: '^[a-z][a-z0-9_]{0,40}$', reHint: P + 'x.name', limit: 'SDL-30' } }),
      Q('display', 'text', ['squad.text.name'], { optional: true, limits: { limit: 'LOC-02' } }),
    ] },
    { id: 'price', title: P + 'g.price', essential: true, q: [
      Q('cost', 'number', ['squad.card.cost'], { limits: { min: 1, max: 2000, step: 1, usual: [10, 340], unit: 'points' } }),
    ] },
    { id: 'members', title: P + 'g.members', essential: true, q: [
      Q('members', 'list', ['squad.members', 'squad.members.breed', 'squad.members.count', 'squad.member_types', 'squad.size', 'squad.leader'],
        { picker: { sources: ['keep', 'exist', 'branch', 'value'], lookup: 'breed', branch: 'soldier', pass: { for: 'squad' } }, limits: { reHint: P + 'x.members', re: '^([a-z0-9_]+/)?[a-z0-9_]+\\s*(:\\s*[1-8])?$', limit: 'MIS-75' } }),
    ] },
    { id: 'card', title: P + 'g.card', essential: false, q: [
      Q('info', 'text', ['squad.text.info'], { optional: true, limits: { limit: 'LOC-02' } }),
      Q('charge', 'number', ['squad.card.charge'], { limits: { min: 0, max: 600, step: 1, unit: 's', limit: 'SDL-30' } }),
      Q('fore', 'number', ['squad.card.fore'], { limits: { min: -1, max: 1, step: 0.1, unit: 'fraction' } }),
      Q('group', 'choice', ['squad.card.group'], { limits: { values: GROUPS } }),
      Q('button', 'choice', ['squad.card.button'], { limits: { values: BUTTONS } }),
      Q('tags', 'list', ['squad.card.tags'], { optional: true, limits: { re: '^[a-z0-9_]+$', limit: 'MIS-04' } }),
      Q('level', 'number', ['squad.card.level'], { limits: { min: 1, max: 21, step: 1, unit: 'level', limit: 'MIS-15' } }),
      Q('order', 'text', ['squad.card.order'], { optional: true, limits: { re: '^[a-z0-9_]*$', limit: 'SDL-30' } }),
      Q('not_for_sale', 'yesno', ['squad.card.not_for_sale'], {}),
    ] },
    { id: 'icon', title: P + 'g.icon', essential: false, q: [
      Q('icon', 'thing', ['squad.icon.unit_icon', 'squad.icon.small'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'uniticon', branch: 'icon' }, limits: { limit: 'UI-03' } }),
    ] },
    { id: 'bots', title: P + 'g.bots', essential: false, q: [
      // the squad op copies the bots entry of a new squad: asked on make only
      Q('buy', 'yesno', ['squad.bots.buy'], { when: MAKE, limits: { limit: 'MIS-79' } }),
      Q('priority', 'number', ['squad.bots.priority'], { when: { $verb: 'make', buy: true }, limits: { min: 0, max: 10, step: 0.1, unit: 'weight', limit: 'MIS-80' } }),
      Q('class', 'choice', ['squad.bots.class'], { when: { $verb: 'make', buy: true }, limits: { values: BOT_CLASSES, limit: 'MIS-83' } }),
      Q('min_income', 'number', ['squad.bots.min_income'], { when: { $verb: 'make', buy: true }, limits: { min: 0, max: 10, step: 0.1, usual: [0, 3], unit: 'points/s', limit: 'MIS-84' } }),
      Q('min_team', 'number', ['squad.bots.min_team'], { when: { $verb: 'make', buy: true }, limits: { min: 1, max: 8, step: 1, unit: 'players', limit: 'MIS-84' } }),
    ] },
    // advanced: the member text by hand (both verbs) and card block fields of a new squad (any of them writes the squad as a card
    // block); a number field is checked against its range at the question (OVR_RE)
    { id: 'cardx', title: P + 'g.cardx', essential: false, q: [
      Q('content', 'text', ['squad.content.raw'], { optional: true, limits: { re: '^[^"{}]*$', limit: 'MIS-75' } }),
      Q('ccp', 'text', ['squad.card.cp'], { when: MAKE, optional: true, limits: { re: OVR_RE.ccp, reHint: P + 'x.ccp', unit: 'points', limit: 'SDL-30' } }),
      Q('cscore', 'text', ['squad.card.score'], { when: MAKE, optional: true, limits: { re: OVR_RE.cscore, reHint: P + 'x.cscore', unit: 'points', limit: 'SDL-30' } }),
      Q('ccw', 'text', ['squad.card.cw'], { when: MAKE, optional: true, limits: { re: OVR_RE.ccw, reHint: P + 'x.ccw', unit: 'x', limit: 'SDL-30' } }),
      Q('cinfo', 'text', ['squad.card.info'], { when: MAKE, optional: true, limits: { re: '^[a-z0-9_/()]*$', limit: 'LOC-02' } }),
      Q('cicon', 'text', ['squad.card.icon'], { when: MAKE, optional: true, limits: { re: OVR_RE.cicon, reHint: P + 'x.cicon', unit: 'index', limit: 'SDL-30' } }),
    ] },
  ],
  kept: [
    ['squad.army', 'its army is the army of the squad picked in What to copy: to make a squad of another army, copy a squad of that army'],
    // reason classes: shared, owned by another task, no tool step yet
    ['squad.file', 'no tool step yet: the squad op writes squads.set only (the file the units files include); another units file needs a list option on it (TST-94)'],
    ['squad.card.basic', 'no tool step yet: the card block fields of the squad op have no {basic} flag'],
    ['squad.icon.bar', 'owned by the soldier task: the squad bar shows the member with the highest icon_priority'],
    ['squad.mode.limit', 'shared: a game mode limit counts every squad with that tag; the preset op changes it for all of them'],
    ['squad.mode.charge_factor', 'shared: a game mode charge factor changes every card wait'],
  ],
  test: P + 'test',
  checklist: [P + 'c.panel', P + 'c.buy', P + 'c.wait', P + 'c.bots', P + 'c.log'],
  lookups,
  // the copy's answers; on make the name is already a free one (copy's name plus _2 ..) and the shown name is the copy's text
  routes: { 'POST /api/x/task/r/squad/gohcard': (url, b, ctx) => CG().cardRoute(url, b, ctx) },
  values: async (ctx, base, opt) => {
    if (isGoh(ctx, opt)) return CG().values('squad', ctx, base, opt);
    const id = parseId(base && base.id);
    if (!id) return { remove: false };
    const g = gameOf(ctx, opt && opt.game), mod = ctx && ctx.mod, r = squadValues(g, mod, id.army, id.name);
    if (!r) return { remove: false };
    const v = Object.assign({}, r.values);
    v.display = SL().textOf(g, mod, 'desc/squad/' + id.name + '(' + id.army + ')');
    if (!(opt && opt.verb === 'change')) v.name = SL().freeName(readSquads(g, mod).map(q => q.name), id.name);
    return v;
  },
  // what a members line branch gives the new soldier: the squad's army and, as the soldier to copy, the soldier of that line (else
  // the first member); the soldier task then answers army/name:count
  pass: async (parent, qid, ctx, opt) => {
    if (qid !== 'members') return null;
    const id = parseId(parent && parent.base && parent.base.id) || {}, army = low(id.army);
    if (!army) return { for: 'squad' };
    const sq = id.name ? findSquad(gameOf(ctx, parent && parent.game), ctx && ctx.mod, id.army, id.name) : null, mem = sq ? sq.members : [];
    const line = opt && Number.isInteger(opt.line) ? opt.line : -1, m = mem[line] || mem[0];
    return Object.assign({ for: 'squad' }, m ? { base: { id: army + '/' + m.breed, name: m.breed } } : {});
  },
  compile: (draft, c) => {
    if (String(c.game) === 'goh') return CG().compile('squad', 'squad', draft, c);
    const base = parseId(c.base && c.base.id);
    if (!base) throw bad('Pick the squad to copy first.');
    // the army is always the copy's; a change keeps the name (the name question is asked on make only)
    const make = c.verb !== 'change', army = base.army, name = make ? low(c.value('name') || base.name) : base.name;
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(name)) throw bad('The name takes small letters, digits and _ only.');
    const g = handle(c.gameDir, c.game), mod = c.mod;
    if (!g) throw bad('No game folder found. Set the game folder first (the Game folder button at the top).');
    if (make && findSquad(g, mod, army, name)) throw bad('There is already a squad ' + name + '(' + army + '). Pick a new name.');
    const like = squadValues(g, mod, army, base.name);
    if (!like) throw bad('The squad ' + base.name + '(' + army + ') to copy is not there any more. Pick the squad to copy again.');
    like.values.display = SL().textOf(g, mod, 'desc/squad/' + base.name + '(' + army + ')');
    const lv = like.values, sq = like.squad, notes = [], copies = [], ops = [];
    const val = id => c.value(id);
    const changed = id => { const v = val(id); return v !== undefined && v !== null && !same(v, lv[id]); };
    // take it off the buy list: the squad op writes {"name(army)" {remove}} after it; nothing else changes
    if (!make && val('remove') === true) {
      notes.push('The squad ' + name + '(' + army + ') is taken off the buy list; its other answers are not written.');
      return { gen: { ops: [{ op: 'squad', name, army, remove: true }] }, notes, result: name + '(' + army + ')' };
    }
    // card block fields of a new squad (empty = not set)
    const ovr = {};
    for (const [k, [field, lo, hi]] of Object.entries(OVR)) {
      const s = S(val(k)).trim();
      if (!s) continue;
      const n = Number(s);
      if (isNaN(n) || n < lo || n > hi || (k === 'cicon' && !Number.isInteger(n))) throw bad('The ' + field + ' of the card is ' + lo + ' to ' + hi + (k === 'cicon' ? ', a whole number' : '') + ': ' + s + '.');
      ovr[field] = String(n);
    }
    const ci = low(val('cinfo'));
    if (ci) { if (!/^[a-z0-9_/()]+$/.test(ci)) throw bad('The tooltip key takes small letters, digits, _, / and brackets, like info/squad/riflemans(ger).'); ovr.info = '"' + ci + '"'; }
    if (!make && Object.keys(ovr).length) throw bad('The card block fields (cp, score, cw, info, icon) are written on a new squad only.');
    // members: each line as copied, typed (breed:count) or a new soldier made in its own task (its result is army/name:count)
    const ma = c.answer('members'), mv = [].concat(val('members') || []);
    let lines = lv.members.slice();
    if (ma && ma.src === 'list') lines = (ma.items || []).map((it, i) => {
      const s = S(mv[i]).trim();
      if (!it || it.src !== 'branch') return s;
      if (!s) throw bad('Line ' + (i + 1) + ' of the members is a new soldier whose task has no result yet. Finish that task first.');
      const r = /^(?:([a-z0-9_]+)\/)?([a-z0-9_]+)(?::(\d+))?$/.exec(low(s));
      if (!r) throw bad('Line ' + (i + 1) + ' of the members: the soldier task gave ' + s + ', not army/name:count.');
      if (r[1] && r[1] !== army) throw bad('The new soldier ' + s + ' belongs to another army than the squad (' + army + ').');
      return r[2] + ':' + (r[3] || 1);
    }).filter(Boolean);
    else if ((!ma || ma.src !== 'keep') && mv.length) lines = mv;
    let mem = memberList(lines, army);
    // made in the joinsquad branch of a soldier task: that soldier joins (his ops run before this squad's)
    const ps = parentSoldier(draft, c, army);
    if (ps) { const had = mem.find(x => x.breed === ps.breed); if (had) had.n = ps.n; else mem.push(ps); notes.push('The soldier ' + army + '/' + ps.breed + ' made in the task this squad was opened from goes in (' + ps.n + ' men).'); }
    if (!mem.length && !S(val('content')).trim()) throw bad('The squad needs at least one member.');
    const memChanged = !same(mem.map(m => m.breed + ':' + m.n), lv.members);
    // the shown name: written when it differs from the copy's text
    const display = changed('display') ? S(val('display')).trim() : '', info = S(val('info')).trim();
    const tags = [].concat(val('tags') || []).map(low).filter(Boolean);
    const content = S(val('content')).trim(), order = low(val('order')), nfs = !!val('not_for_sale');
    // icon frames: keep copies the base squad's frames under the new name (make); a picked or new icon set is copied on both verbs
    const iconAns = c.answer('icon'), iconSrc = iconAns ? iconAns.src : 'keep', icon = S(val('icon')).trim();
    const from = make && iconSrc === 'keep' ? base.name : (iconSrc !== 'keep' && icon ? icon : '');
    if (from) {
      const fr = iconFrames(g, mod, from, army);
      if (!fr.length && iconSrc !== 'branch') { if (iconSrc === 'keep') notes.push('The base squad has no buy card icon to copy; the card shows a stub.'); else throw bad('The icon set ' + from + ' has no frames in interface/scene/unit_icon.'); }
      if (iconSrc === 'branch' && !fr.length) for (const n of ['00', '01', '02', '03']) copies.push({ key: ICONS + low(from) + '(' + army + ')_' + n + '.tga', to: ICONS + name + '(' + army + ')_' + n + '.tga' });
      for (const k of fr) { const n = /_(\d\d)\.tga$/.exec(k); if (n) copies.push({ key: k, to: ICONS + name + '(' + army + ')_' + n[1] + '.tga' }); }
    }
    const bo = {};
    for (const k of ['priority', 'class', 'min_income', 'min_team']) if (val('buy') && changed(k)) bo[k] = k === 'class' ? S(val(k)) : String(Number(val(k)));
    if (make) {
      // card block fields need the block form: the op writes it when it gets content, so the members go in as content too
      const needBlock = Object.keys(ovr).length > 0;
      const block = new Set(mem.map(m => m.breed)).size > 4 || !!content || nfs || needBlock;
      const q = v => '"' + S(v).replace(/"/g, '') + '"';
      const fields = Object.assign({}, ovr);
      if (changed('cost')) fields.cost = String(Number(val('cost')));
      if (changed('charge')) fields.c = String(Number(val('charge')));
      if (changed('fore')) fields.f = String(Number(val('fore')));
      if (changed('group')) fields.g = block ? q(val('group')) : low(val('group'));
      if (changed('button')) fields.b = block ? q(val('button')) : low(val('button'));
      if (changed('tags')) { if (block) fields.tags = q(('frontline_cp infantry ' + army + ' ' + tags.join(' ')).trim()); else fields.t = tags.join(' '); }
      if (changed('level')) fields.level = String(Number(val('level')));
      if (block && sq.form !== 'line') throw bad('The base squad ' + base.name + ' is a card block, not a squad line; a task copies squad lines only.');
      const op = { op: 'squad', name, army, like: base.name, members: mem.map(m => m.breed + ':' + m.n) };
      if (Object.keys(fields).length) op.fields = fields;
      if (display) op.display = display;
      if (info) op.info = info;
      if (content) op.content = content;
      else if (needBlock) op.content = mem.map(m => 'mp/' + army + '/' + m.breed + ':' + m.n).join(' ');
      if (order) op.order = order;
      if (nfs) op.not_for_sale = true;
      if (!val('buy')) op.bots = false;
      else if (!lv.buy) throw bad('Bots do not buy ' + base.name + '(' + army + '), so there is no bots entry to copy. Answer no to bots buying it.');
      else op.bots = Object.keys(bo).length ? bo : true;
      ops.push(op);
    } else {
      if (changed('buy') || Object.keys(bo).length) throw bad('The bots entry of a squad that is already there cannot be changed by a task yet. Keep the bots answers as copied.');
      // members, content, order, not_for_sale, or any edit of a card block: one squad op with change: true (gen expands a line into a
      // block for content, not_for_sale or more than 4 types). Plain field edits of a line keep the smaller macro-argument path below.
      const big = memChanged || !!content || !!order || changed('not_for_sale') || sq.form !== 'line';
      if (big) {
        // gen refuses content together with members (GEN_SQUAD_ARGS): the content line is the whole new list
        if (content && memChanged) throw bad('Give the soldiers either as members or as a content line, not both. Keep the members as copied when you fill content.');
        const fields = {};
        for (const [id, a] of [['cost', 'cost'], ['charge', 'c'], ['fore', 'f'], ['level', 'level']]) if (changed(id)) fields[a] = String(Number(val(id)));
        for (const [id, a] of [['group', 'g'], ['button', 'b']]) if (changed(id)) fields[a] = low(val(id));
        if (changed('tags')) fields.t = tags.join(' ');
        const op = { op: 'squad', name, army, change: true };
        if (memChanged && !content) op.members = mem.map(m => m.breed + ':' + m.n);
        if (Object.keys(fields).length) op.fields = fields;
        if (content) op.content = content;
        if (order) op.order = order;
        if (changed('not_for_sale')) op.not_for_sale = nfs;
        ops.push(op);
        if (display) ops.push({ op: 'text', key: 'desc/squad/' + name + '(' + army + ')', text: display });
        if (info) ops.push({ op: 'text', key: 'info/squad/' + name + '(' + army + ')', text: info });
        if (!ops.length && !copies.length) notes.push('Nothing differs from ' + base.name + '(' + base.army + '): there is nothing to write.');
        return { gen: { ops }, copies, notes, result: name + '(' + army + ')' };
      }
      const ent = 'file:' + SQUADS, match = squadMatch(sq), mac = { op: 'macro', entity: ent, macro: sq.macro, match };
      const setArg = (a, v) => ops.push(Object.assign({}, mac, { arg: a, value: v }));
      for (const [id, a] of [['cost', 'cost'], ['charge', 'c'], ['fore', 'f'], ['level', 'level']]) if (changed(id)) { if (sq.f[a] === undefined) throw bad('The squad line has no ' + a + '(..) to change.'); setArg(a, String(Number(val(id)))); }
      for (const [id, a] of [['group', 'g'], ['button', 'b']]) if (changed(id)) { if (sq.f[a] === undefined) throw bad('The squad line has no ' + a + '(..) to change.'); setArg(a, low(val(id))); }
      if (changed('tags')) { if (sq.f.t === undefined) throw bad('The squad line has no t(..) to change.'); setArg('t', tags.join(' ')); }
      if (display) ops.push({ op: 'text', key: 'desc/squad/' + name + '(' + army + ')', text: display });
      if (info) ops.push({ op: 'text', key: 'info/squad/' + name + '(' + army + ')', text: info });
    }
    if (!ops.length && !copies.length) notes.push('Nothing differs from ' + base.name + '(' + base.army + '): there is nothing to write.');
    return { gen: ops.length ? { ops } : null, copies, notes, result: name + '(' + army + ')' };
  },
  _lib: { gidOf, handle, unhandle, gameOf, vfsOf },   // game parity test (x-game.test.js)
};
// on a change, the remove answer comes first: yes hides every other question (none of them would be written)
// the AS2 questions: asked on the AS2 tabs only (the goh group is the Gates of Hell form)
for (const g of module.exports.groups) for (const q of g.q) if (!/^goh/.test(q.id)) {
  if (q.id !== 'remove') q.when = Object.assign({ remove: false }, q.when || {});
  q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });
}
