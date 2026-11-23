// recipe "army": a side of the multiplayer lobby. make = a new army copied from a stock one (gen army op: armies/<tag>.set, flag,
// empty vehicles_<tag>.set, alliance line, name) with its first cards; change = name, number, flag, cards added (picked from
// another army by the name players see, or made through a vehicle, squad or soldier branch), cards taken off (picked from its
// own), picked cards moved to a cooldown group or buy tab, the side's name and picture, the money tabs every army shares
// (presets_all.inc). An own flag picture (PNG, TGA, GIF) is converted to the game's TGA by the flag route. Prices and bots are
// their own tasks (branches). Census: census/army.json.
// Contract: ../README.md. The readers at the end (_read) are shared with the prices and bots recipes. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-3fe8a020)
'use strict';
const os = require('os'), path = require('path');

const ARMIES = 'resource/set/multiplayer/armies/', ALLY = 'resource/set/multiplayer/games/preset_alliances.inc';
const PRESETS = 'resource/set/multiplayer/games/presets_all.inc', FLAGS = 'resource/interface/pages/multi/';
const TAG = /^[a-z][a-z0-9_]{0,15}$/, UNIT = '[A-Za-z0-9_.()]+';
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const lower = s => String(s == null ? '' : s).toLowerCase();
const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);

// ---------- readers: the game plus the picked mod, through the gen Ctx overlay (read only, plan mode)
const NOMOD = path.join(os.tmpdir(), 'arsenal-task-army-no-mod');
const CACHE = new Map();
const GM = () => require('../../../../lib/games');
// the game a task works for (as64 | mowas2 | goh): the draft's game or a game word given (d: a draft or a word), else the request's
// (ctx.gameId: the gui.js function, or the word lib/compile.js lookupCtx puts there), else as64 (nothing named: as before)
function gidOf(ctx, d) {
  let x = d && (typeof d === 'string' ? d : d.game);
  if (!x && ctx) { try { x = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { x = null; } }
  return GM().idOf(x) || 'as64';
}
// the plain line of a task that cannot run on a game (README "games"; brief rule c): "Not available in <game>: <why> (<row>)"
const naLine = (gid, why, row) => 'Not available in ' + ((GM().get(gid) || {}).name || gid) + ': ' + why + (row ? ' (' + row + ')' : '');
// the AS2 install (as64 and mowas2 share it): ctx.game() is the AS2 install on every game tab (gui.js), so it serves both
function gameOf(ctx) { try { return (ctx && ctx.game && ctx.game()) || null; } catch (e) { return null; } }
// gid: the game whose file set is read. as64 or none: the gen Ctx view as before (as64 first); mowas2: the vfs of mowas_2 (no
// as64/core, no as64+); goh: null (these readers read the AS2 forms only)
function reader(gameDir, mod, gid) {
  if (!gameDir) return null;
  const id = GM().idOf(gid) || 'as64';
  if (id === 'goh') return null;
  const m = mod && path.isAbsolute(String(mod)) ? path.resolve(String(mod)) : NOMOD;
  const k = gameDir + '|' + m + (id === 'as64' ? '' : '|' + id), hit = CACHE.get(k);
  if (hit && Date.now() - hit.at < 15000) return hit.g;
  // newCtx with the game id: as64 the gen Ctx as before (no exe named); mowas2 a Ctx of target mowas2, whose vfs is built with exe mowas_2
  const g = id === 'as64' ? require('../../units/server').lib.newCtx(gameDir, m, true) : require('../../units/server').lib.newCtx(gameDir, m, true, id);
  CACHE.set(k, { g, at: Date.now() });
  while (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  return g;
}
function alliances(g) {
  const out = {}, t = g.readStr(ALLY) || '';
  let cur = '';
  for (const l of t.split(/\r?\n/)) {
    const a = /^\s*\{\s*"([^"]+)"/.exec(l); if (a) cur = lower(a[1]);
    const m = /\{\s*armies\s+"([^"]+)"/i.exec(l); if (m && cur) out[lower(m[1])] = cur;
  }
  return out;
}
// the two sides: {axis: {title, icon}, allies: {..}} from preset_alliances.inc (GoH: games/presets/alliances_generic.inc, same form)
function sides(g) {
  const out = {}, t = g.readStr(g && g._goh ? AM().ALLY : ALLY) || '';
  let cur = '';
  for (const l of t.split(/\r?\n/)) {
    const a = /^\s*\{\s*"([^"]+)"/.exec(l); if (a) { cur = lower(a[1]); out[cur] = out[cur] || {}; }
    const ti = /\{\s*title\s+"([^"]*)"/i.exec(l); if (ti && cur) out[cur].title = ti[1];
    const ic = /\{\s*icon\s+"([^"]*)"/i.exec(l); if (ic && cur) out[cur].icon = ic[1];
  }
  return out;
}
function armies(g) {
  // GoH: the sides are in games/presets/alliances_generic.inc (army.gohmake.js), not preset_alliances.inc
  const ally = g && g._goh ? AM().alliances(g) : alliances(g);
  return g.keys(/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/).map(k => {
    const t = g.readStr(k) || '', tag = k.split('/').pop().slice(0, -4), m = re => { const x = re.exec(t); return x ? x[1] : null; };
    const id = m(/\{\s*id\s+(-?\d+)/i);
    return { tag, key: k, id: id == null ? null : +id, title: m(/\{\s*title\s+"([^"]*)"/i), icon: m(/\{\s*icon\s+"([^"]*)"/i), alliance: ally[tag] || '' };
  });
}
// the GoH branch (army.goh.js): its reader (gen Ctx of target goh) for the GoH tab, the AS2 reader above for the others
const AG = () => require('./army.goh');
const rdOf = (ctx, mod, gid) => (GM().idOf(gid) === 'goh' ? AG().reader(AG().gohDir(ctx), mod) : reader(gameOf(ctx), mod, gid));
const AS2 = ['as64', 'mowas2'];
// the shown text of a text key (mp/army/rus -> Soviet Union), from the .lng files of game and mod (GoH: its .pot files)
function textOf(g, key) {
  if (!key) return '';
  if (g && g._goh) return AG().textOf(g, key);
  if (!g._armyText) {
    g._armyText = new Map();
    let L = null; try { L = require('../../../../upgrade/lib/lngpot'); } catch (e) { return ''; }
    for (const k of g.keys(/^resource\/interface\/text\/.*\.lng$/)) {
      const b = g.read(k); if (!b) continue;
      try { for (const [kk, t] of L.lngKeys(b, k.slice('resource/interface/text/'.length))) if (/^mp\//i.test(kk)) g._armyText.set(lower(kk), t); } catch (e) { /* unreadable lng */ }
    }
  }
  return g._armyText.get(lower(key)) || '';
}
// one block that starts at line i: the lines until the braces close (quotes and ; comments skipped)
function blockAt(lines, i) {
  let d = 0, out = [];
  for (let j = i; j < lines.length && j < i + 60; j++) {
    out.push(lines[j]);
    let q = false;
    for (const ch of lines[j]) { if (ch === '"') q = !q; else if (!q && ch === ';') break; else if (!q && (ch === '{' || ch === '(')) d++; else if (!q && (ch === '}' || ch === ')')) d--; }
    if (d <= 0) return { text: out.join('\n'), end: j };
  }
  return { text: out.join('\n'), end: i };
}
const num = (t, re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
// the cards of one army in the multiplayer lists: vehicles (card name) and squads ("name(army)"), with the fields a price task needs
function cards(g, army) {
  army = lower(army);
  const out = [];
  for (const key of g.keys(/^resource\/set\/multiplayer\/units\/vehicles[^/]*\.set$/)) {
    const lines = (g.readStr(key) || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*\{\s*"([^"]+)"\s*\(/.exec(lines[i]); if (!m) continue;
      const b = blockAt(lines, i), t = b.text; i = b.end;
      const s = /(?:^|[\s(])s\(([^)]*)\)/.exec(t), sides = s ? lower(s[1]).split(/\s+/) : [];
      if (!(sides.includes(army) || (!s && key.endsWith('_' + army + '.set')))) continue;
      const tab = /(?:^|[\s(])b\(([^)]*)\)/.exec(t), gr = /(?:^|[\s(])g\(([^)]*)\)/.exec(t);
      out.push({ id: m[1], name: m[1], kind: 'vehicle', army, key, tab: tab ? lower(tab[1].trim()) : '', group: gr ? lower(gr[1].trim()) : '', shared: sides.length > 1,
        cost: num(t, /\{\s*cost\s+(-?[\d.]+)/), level: num(t, /\{\s*level\s+(-?[\d.]+)/), fore: num(t, /\{\s*fore\s+(-?[\d.]+)/),
        charge: num(t, /(?:^|[\s(])c\((-?[\d.]+)\)/), cp: num(t, /(?:^|[\s(])cp\((-?[\d.]+)\)/), sc: num(t, /(?:^|[\s(])sc\((-?[\d.]+)\)/), cw: num(t, /(?:^|[\s(])cw\((-?[\d.]+)\)/) });
    }
  }
  for (const key of g.keys(/^resource\/set\/multiplayer\/units\/squads[^/]*\.set$/)) {
    for (const l of (g.readStr(key) || '').split(/\r?\n/)) {
      if (!/^\s*\(\s*"(?:squad|single)_with\w*"/i.test(l)) continue;
      const side = /\bside\(([^)]*)\)/i.exec(l), nm = /\bname\(([^)]*)\)/i.exec(l);
      if (!side || !nm || lower(side[1].trim()) !== army) continue;
      const tab = /(?:^|[\s(])b\(([^)]*)\)/.exec(l), gr = /(?:^|[\s(])g\(([^)]*)\)/.exec(l), id = nm[1].trim() + '(' + army + ')';
      out.push({ id, name: nm[1].trim(), kind: 'squad', army, key, tab: tab ? lower(tab[1].trim()) : '', group: gr ? lower(gr[1].trim()) : '', shared: false,
        cost: num(l, /\bcost\((-?[\d.]+)\)/), level: num(l, /\blevel\((-?[\d.]+)\)/), fore: num(l, /(?:^|[\s(])f\((-?[\d.]+)\)/), charge: num(l, /(?:^|[\s(])c\((-?[\d.]+)\)/), cp: null, sc: null, cw: null });
    }
  }
  return out;
}
const hit = (words, ...xs) => { const w = lower(words).trim(); return !w || xs.some(x => lower(x).includes(w)); };
async function lookArmy(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return [];
  return armies(g).filter(a => a.id == null || a.id >= 0).map(a => ({ id: a.tag, name: textOf(g, a.title) || a.tag, where: a.key, ref: { key: a.key }, sub: 'id ' + a.id + (a.alliance ? ', ' + a.alliance : '') }))
    .filter(r => hit(words, r.id, r.name));
}
async function lookFlag(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return [];
  return g.keys(/^resource\/interface\/pages\/multi\/flag_[^/]+\.tga$/).map(k => { const n = k.split('/').pop().slice(5, -4); return { id: n, name: 'flag_' + n, where: k, ref: { key: k }, sub: '' }; })
    .filter(r => hit(words, r.id));
}
// the army a branch works on: the new tag (make) or the picked army (change)
const tagOf = d => {
  const a = d && d.answers && d.answers.tag;
  if (d && d.verb === 'make') return a && a.value != null ? lower(String(a.value).trim()) : '';
  return d && d.base && d.base.id ? lower(d.base.id) : '';
};
// the draft a lookup is asked for (opt.draft is its id): the army it works on, and whether it makes a new one
function draftOf(ctx, opt) { try { return opt && opt.draft ? require('../lib/draft').load(ctx, String(opt.draft)) : null; } catch (e) { return null; } }
const TABS = ['squad1', 'squad2', 'v1', 'v2', 'v3', 'v4', 'v5', 'hero'];
// a card to add: the vehicle and gun cards of every army but this one (a squad's men belong to their own army, so squads are made
// through the squad task). The id is the card name; the page names it from the game texts (desc/entity/<card>), so the search
// finds the name a player sees too
async function lookCard(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return [];
  const d = draftOf(ctx, opt), me = tagOf(d), mine = new Set(me ? cards(g, me).map(x => lower(x.id)) : []), out = [];
  for (const a of armies(g)) {
    if (a.tag === me || (a.id != null && a.id < 0)) continue;
    for (const x of cards(g, a.tag)) if (x.kind === 'vehicle' && !mine.has(lower(x.id)) && hit(words, x.id)) out.push({ id: x.id, name: '', where: x.key, ref: { key: x.key, army: a.tag }, sub: a.tag + (x.tab ? ', tab ' + x.tab : '') + (x.cost != null ? ', ' + x.cost : '') });
  }
  return out;
}
// a card this army has (to take off its list or to move to another group or tab): vehicles by card name, squads as name(army)
async function lookOwn(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return [];
  const me = tagOf(draftOf(ctx, opt)); if (!me) return [];
  if (g._goh) return AK().lookOwn(g, me, periodOf(draftOf(ctx, opt)), words);
  return cards(g, me).filter(x => !x.shared && hit(words, x.id)).map(x => ({ id: x.id, name: '', where: x.key, ref: { key: x.key }, sub: (x.kind === 'squad' ? 'squad' : 'vehicle') + (x.tab ? ', tab ' + x.tab : '') + (x.group ? ', group ' + x.group : '') }));
}
// the cooldown groups this army's cards use, each with its cards
async function lookGroup(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return [];
  const me = tagOf(draftOf(ctx, opt)); if (!me) return [];
  if (g._goh) return AK().lookGroup(g, me, periodOf(draftOf(ctx, opt)), words);
  const by = new Map();
  for (const x of cards(g, me)) if (x.group) { if (!by.has(x.group)) by.set(x.group, []); by.get(x.group).push(x.name); }
  return [...by.keys()].sort().filter(k => hit(words, k)).map(k => ({ id: k, name: k, where: '', ref: null, sub: by.get(k).length + ': ' + by.get(k).slice(0, 6).join(', ') + (by.get(k).length > 6 ? ' ..' : '') }));
}
// the buy panel tabs, each with how many of this army's cards are on it
async function lookTab(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, gidOf(ctx, opt && opt.game));
  const me = tagOf(draftOf(ctx, opt)), n = {};
  if (g && g._goh) return AK().lookTab(g, me, periodOf(draftOf(ctx, opt)), words);
  if (g && me) for (const x of cards(g, me)) if (x.tab) n[x.tab] = (n[x.tab] || 0) + 1;
  return [...new Set(TABS.concat(Object.keys(n)))].filter(k => hit(words, k)).map(k => ({ id: k, name: k, where: '', ref: null, sub: String(n[k] || 0) }));
}
// GoH (army.gohcards.js): a card of this army in any period, to copy into the picked period list (<card id>@<period>)
const AK = () => require('./army.gohcards');
const AM = () => require('./army.gohmake');
const periodOf = d => { const a = d && d.answers && d.answers.gohperiod, v = lower(a && a.value != null ? a.value : ''); return AK().PERIODS.includes(v) ? v : 'mid'; };
async function lookGohCard(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, 'goh'); if (!g) return [];
  const me = tagOf(draftOf(ctx, opt)); return me ? AK().lookCard(g, me, words) : [];
}
// GoH make (army.gohmake.js): a card of the stock army the new one copies, in any period (<card id>@<period>)
async function lookGohBase(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, 'goh'); if (!g) return [];
  const d = draftOf(ctx, opt), b = d && d.base && d.base.id ? lower(d.base.id) : '';
  return TAG.test(b) ? AM().lookBase(g, b, words) : [];
}
// GoH: a card of any other army in any period (<army>:<card id>@<period>), copied into this army (make or change)
async function lookGohOther(ctx, words, opt) {
  const g = rdOf(ctx, (opt && opt.mod) || ctx.mod, 'goh'); if (!g) return [];
  return AM().lookOther(g, tagOf(draftOf(ctx, opt)), armies(g).filter(a => a.id == null || a.id >= 0).map(a => a.tag), words);
}
// which tabs the money (vehicle budget) and the hero budget pay for, in presets_all.inc (GoH: the budget files under games/)
function buttonsOf(g) {
  if (g && g._goh) { const B = AG().budgetOf(g); return { vehicle: B.vehicle, hero: B.hero }; }
  const pa = (g && g.readStr(PRESETS)) || '', m = re => { const x = re.exec(pa); return x ? x[1] : undefined; };
  return { vehicle: m(/\{\s*vehicle\b[\s\S]*?\{\s*buttons\s+"([^"]*)"/i), hero: m(/\{\s*hero\b[\s\S]*?\{\s*buttons\s+"([^"]*)"/i) };
}
// a stock flag's size from its TGA header (bytes 12..15): the size an own picture is converted to
function flagSize(g, key) {
  const b = g && g.read(key);
  if (!b || b.length < 18) return '';
  const w = b.readUInt16LE(12), h = b.readUInt16LE(14);
  return w > 0 && h > 0 && w <= 4096 && h <= 4096 ? w + 'x' + h : '';
}
// own route: an uploaded flag picture (PNG, TGA or GIF) converted to the game's TGA at the stock size (artport convert), written
// into the mod; dry (no write) converts into a temp folder only, so the plan finds a picture it cannot read
const FLAG_TO = /^resource\/interface\/pages\/multi\/flag_[a-z0-9_]+\.tga$/;
async function flagRoute(url, b, ctx) {
  const fsx = require('fs'), D = require('../lib/draft');
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), to = String(b.to || ''), size = String(b.size || '');
  if (!FLAG_TO.test(to)) throw bad('A flag goes to resource/interface/pages/multi/flag_<name>.tga.');
  if (size && !/^\d{1,4}x\d{1,4}$/.test(size)) throw bad('Bad flag size.');
  const src = D.stagedPath(ctx, String(b.draft || ''), String(b.name || ''));
  if (!/\.(png|tga|gif)$/i.test(src) || !fsx.existsSync(src)) throw bad('The flag picture was not uploaded, or is not a PNG, TGA or GIF.');
  const tmp = fsx.mkdtempSync(path.join(os.tmpdir(), 'arsenal-task-army-flag-')), out = path.join(tmp, 'flag.tga');
  try {
    // JOBS: a write is marked (the footer asks twice before a stop); a stop while the picture is converted ends here, nothing written
    if (b.write && ctx.job) ctx.job.writes = true;
    const r = await ctx.runTool('artport', 'artport/artport.js', ['convert', src, out].concat(size ? ['--size', size] : []), { timeoutMs: 60000 });
    if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, stopped: true };
    if (r.code !== 0 || !fsx.existsSync(out)) {
      const why = (String(r.stderr || '').split(/\r?\n/).find(l => /png|tga|gif|not/i.test(l)) || '').slice(0, 120);
      throw bad('The flag picture could not be read' + (why ? ' (' + why.trim() + ')' : '') + '. Save it again as a plain PNG (8 bits per colour, not interlaced) and upload that.');
    }
    if (!b.write) return { ok: true, files: [to], size };
    let g = null; try { g = ctx.kind && ctx.kind() === 'goh' && ctx.gohDir ? ctx.gohDir() : ctx.game && ctx.game(); } catch (e) { /* no game */ }
    const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: g, purpose: 'save a flag picture' });
    if (why) throw bad(why);
    const dst = path.join(mod, ...to.split('/'));
    fsx.mkdirSync(path.dirname(dst), { recursive: true });
    fsx.copyFileSync(out, dst);
    return { ok: true, wrote: true, files: [to], size };
  } finally { try { fsx.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
}
// the lines of a list answer: [{src, value, child}]; a plain list of typed lines reads as value lines
function linesOf(c, id) {
  const a = c.answer(id); if (!a) return [];
  if (a.src === 'list') { const vs = c.value(id) || []; return (a.items || []).map((it, i) => ({ src: it ? it.src : '', value: vs[i], child: it && it.child, recipe: it && it.recipe })); }
  if (a.src === 'value') return [].concat(a.value == null ? [] : a.value).map(v => ({ src: 'value', value: v }));
  return [];
}
const FLAG = /^\/?interface\/pages\/multi\/flag_([a-z0-9_]+)$/i;
// a stock text key (mp/army/rus, mp/alliance/allies) of the game's #dlg_mp.lng: the gen text finish writes it into a mod copy of
// that file, which replaces the game's whole (GEN_TEXT_VANILLA_FILE, LOC-19); the '#' file order is [T]
const stockTextNote = (what, key) => what + ': the stock text ' + key + ' is in the game\'s #dlg_mp.lng, so the new one goes into a mod copy of that file, which replaces it whole (LOC-19); check the lobby [T].';
const KINDS = ['vehicle', 'squad', 'soldier'];
// Gates of Hell (2026-11-23): army.goh.js changes a stock army's name (.pot through lng-add), number and flag, the side's name and
// picture (alliances_generic.inc) and the money tabs (gohbudget route); army.gohcards.js adds, takes off and moves cards in one period
// list (gohperiod, gohadd, unitremove, groupcards, cardgroup, gohtab); a new army is army.gohmake.js (gohfirst, gohother, alliance);
// cards of other armies go into a stock army through the gohadopt route (gohother); prices and bots are the same branches as on AS2.
// The AS2 card list questions (firstunits, unitlist, cardtab) are asked on the AS2 games only
// the flag pictures an upload takes, by name: the flag route converts each to the game's TGA at the stock size
const FLAG_KINDS = ['.png', '.tga', '.gif'];
// the upload's own check: the flag route converts the picture with artport, so a picture artport cannot read (a 16 bit or interlaced
// PNG, a TGA that is not 24 or 32 bit) is refused at upload, not later at Review
function flagCheck(f) {
  const AP = require('../../../../artport/artport'), ext = path.extname(String(f && f.name || '')).toLowerCase(), b = f && f.bytes;
  if (!b || !b.length) return 'task.army.e.flag';
  try { if (ext === '.png') AP.decodePng(b); else if (ext === '.tga') AP.decodeTga(b); else if (ext === '.gif') AP.decodeGif(b); else return 'task.army.e.flag'; } catch (e) { return 'task.army.e.flag'; }
  return null;
}

module.exports = {
  id: 'army',
  verbs: ['make', 'change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 60,
  title: { make: 'task.army.t', change: 'task.army.tc' },
  test: 'task.army.test',
  census: 'army',
  base: { lookup: 'army' },
  // Quick asks the essential group only: a new army needs its word, name, side, flag and at least one card; a change needs nothing
  // (name and flag are offered, kept as they are). Everything else keeps the copy until asked
  groups: [
    { id: 'army', title: 'task.army.g.army', essential: true, q: [
      { id: 'tag', kind: 'id', ask: 'task.army.q.tag', help: 'task.army.h.tag', covers: ['army.tag', 'list.vehicles'], when: { $verb: 'make' }, limits: { re: '^[a-z][a-z0-9_]{0,15}$' }, unique: { lookup: 'army' } },
      { id: 'title', kind: 'text', ask: 'task.army.q.title', help: 'task.army.h.title', covers: ['army.title', 'text.army'], limits: { re: '^[^"{}]{1,40}$' } },
      { id: 'alliance', kind: 'choice', ask: 'task.army.q.alliance', help: 'task.army.h.alliance', covers: ['alliance'], when: { $verb: 'make', $game: ['as64', 'mowas2', 'goh'] }, limits: { values: ['allies', 'axis'] } },
      { id: 'flag', kind: 'file', ask: 'task.army.q.flag', help: 'task.army.h.flag', covers: ['army.icon', 'army.flag_picture'],
        picker: { sources: ['keep', 'exist', 'file', 'ext'], lookup: 'flag', kinds: FLAG_KINDS, ext: ['image-editor'], check: flagCheck } },
      // a new army starts with an empty list: at least one card, picked from another army or made new
      { id: 'firstunits', kind: 'list', ask: 'task.army.q.firstunits', help: 'task.army.h.firstunits', when: { $verb: 'make', $game: AS2 },
        covers: ['card.name', 'text.vehicle', 'list.squads', 'text.squad', 'list.soldiers', 'text.soldier'],
        limits: { re: '^' + UNIT + '$', limit: 'TST-94' }, picker: { sources: ['exist', 'branch'], lookup: 'card', branch: KINDS, order: 'after', pass: { for: 'army' } } },
      // GoH: the first cards of a new army are copies of cards of the stock army it copies (army.gohmake.js), each in its own period
      { id: 'gohfirst', kind: 'list', ask: 'task.army.q.gohfirst', help: 'task.army.h.gohfirst', when: { $verb: 'make', $game: ['goh'] },
        covers: [], limits: { re: '^[A-Za-z0-9_.()]+@(early|mid|late)$' }, picker: { sources: ['exist'], lookup: 'gohbase' } },
    ] },
    { id: 'more', title: 'task.army.g.more', essential: false, q: [
      { id: 'armyid', kind: 'number', ask: 'task.army.q.armyid', help: 'task.army.h.armyid', covers: ['army.id', 'army.rank'], limits: { min: 0, max: 99, step: 1, limit: 'MIS-07' } },
    ] },
    // the unit lists of a stock army: cards to add (picked or made) and cards to take off (picked from its own)
    { id: 'units', title: 'task.army.g.units', essential: false, q: [
      // GoH: cards are listed per period (units/<period>/units_<army>.set); taking off and moving work in the picked list
      { id: 'gohperiod', kind: 'choice', ask: 'task.army.q.gohperiod', help: 'task.army.h.gohperiod', when: { $verb: 'change', $game: ['goh'] }, limits: { values: ['early', 'mid', 'late'] } },
      { id: 'gohadd', kind: 'list', ask: 'task.army.q.gohadd', help: 'task.army.h.gohadd', optional: true, when: { $verb: 'change', $game: ['goh'] },
        covers: [], limits: { re: '^[A-Za-z0-9_.()]+@(early|mid|late)$' }, picker: { sources: ['exist'], lookup: 'gohcard' } },
      // GoH: cards of other armies, copied into this army with its side and soldiers (make: with the first cards; change: the gohadopt route)
      { id: 'gohother', kind: 'list', ask: 'task.army.q.gohother', help: 'task.army.h.gohother', optional: true, when: { $game: ['goh'] },
        covers: [], limits: { re: '^[a-z][a-z0-9_]{0,15}:[A-Za-z0-9_.()]+@(early|mid|late)$' }, picker: { sources: ['exist'], lookup: 'gohother' } },
      { id: 'unitlist', kind: 'list', ask: 'task.army.q.unitlist', help: 'task.army.h.unitlist', optional: true, when: { $verb: 'change', $game: AS2 },
        covers: ['card.name', 'text.vehicle', 'card.content', 'card.info', 'card.tags', 'list.squads', 'text.squad', 'list.soldiers', 'text.soldier'],
        limits: { re: '^' + UNIT + '$', limit: 'TST-94' }, picker: { sources: ['exist', 'branch'], lookup: 'card', branch: KINDS, order: 'after', pass: { for: 'army' } } },
      { id: 'unitremove', kind: 'list', ask: 'task.army.q.unitremove', help: 'task.army.h.unitremove', optional: true, when: { $verb: 'change' },
        covers: ['card.remove'], limits: { re: '^' + UNIT + '$' }, picker: { sources: ['exist'], lookup: 'own' } },
      { id: 'prices', kind: 'thing', ask: 'task.army.q.prices', help: 'task.army.h.prices', covers: ['card.cost', 'card.level', 'card.charge', 'card.fore', 'card.cp', 'card.score', 'card.cw'], picker: { sources: ['keep', 'branch'], branch: 'prices', order: 'after', pass: { for: 'army' } } },
      { id: 'bots', kind: 'thing', ask: 'task.army.q.bots', help: 'task.army.h.bots', covers: ['bots.units', 'bots.row', 'bots.presets'], picker: { sources: ['keep', 'branch'], branch: 'bots', order: 'after', pass: { for: 'army' } } },
    ] },
    // move picked cards of this army to another cooldown group and/or buy tab
    { id: 'groups', title: 'task.army.g.groups', essential: false, q: [
      { id: 'groupcards', kind: 'list', ask: 'task.army.q.groupcards', help: 'task.army.h.groupcards', optional: true, when: { $verb: 'change' },
        covers: ['card.group', 'card.button'], limits: { re: '^' + UNIT + '$' }, picker: { sources: ['exist'], lookup: 'own' } },
      { id: 'cardgroup', kind: 'thing', ask: 'task.army.q.cardgroup', help: 'task.army.h.cardgroup', covers: ['group.ids'], when: { $verb: 'change' }, picker: { sources: ['keep', 'exist'], lookup: 'group' } },
      { id: 'cardtab', kind: 'thing', ask: 'task.army.q.cardtab', help: 'task.army.h.cardtab', covers: ['button.ids'], when: { $verb: 'change', $game: AS2 }, picker: { sources: ['keep', 'exist'], lookup: 'tab' } },
      // GoH tabs: inf1 inf2 empl vehicles tanks doctrine
      { id: 'gohtab', kind: 'thing', ask: 'task.army.q.cardtab', help: 'task.army.h.gohtab', covers: [], when: { $verb: 'change', $game: ['goh'] }, picker: { sources: ['keep', 'exist'], lookup: 'tab' } },
    ] },
    // the side the army plays on: its name and picture are shared by every army on that side
    { id: 'side', title: 'task.army.g.side', essential: false, q: [
      { id: 'sidename', kind: 'text', ask: 'task.army.q.sidename', help: 'task.army.h.sidename', covers: ['text.alliance', 'alliance.title'], limits: { re: '^[^"{}]{1,40}$' } },
      { id: 'sideflag', kind: 'file', ask: 'task.army.q.sideflag', help: 'task.army.h.sideflag', covers: ['alliance.icon'],
        picker: { sources: ['keep', 'exist', 'file', 'ext'], lookup: 'flag', kinds: FLAG_KINDS, ext: ['image-editor'], check: flagCheck } },
    ] },
    // presets_all.inc: one rule for every army in the modes that use it
    { id: 'mode', title: 'task.army.g.mode', essential: false, q: [
      { id: 'budgetbuttons', kind: 'text', ask: 'task.army.q.budgetbuttons', help: 'task.army.h.budgetbuttons', covers: ['budget.buttons'], limits: { re: '^[a-z0-9_]+( [a-z0-9_]+)*$' } },
    ] },
  ],
  kept: [
    ['unitset.tags', 'a rule of the game mode for every army (presets_all.inc), not of one army: the mission task asks it (unitset)'],
    ['unitlimits', 'a rule of the game mode for every army (presets_all.inc), not of one army: the mission task asks it (unit_limits, one per line)'],
    ['army.flag', 'not read by the game (MIS-07): a second flag path; a new army keeps the copy of the stock line'],
    ['army.appid_base', 'a Steam DLC gate, not offered: the army op drops it from a copy, so a new army needs no DLC; a stock DLC army keeps its gate'],
    ['army.selection', 'meaning not proven [I], and no tool step yet: armySelectionMode, teams and alliances of a mode (games/<mode>.set) have no op'],
    ['list.root', 'no tool step yet: no op writes a new root unit list (common.set or <gameType>.set); every step adds to the chain the game loads'],
    ['list.apply', 'meaning not proven [I], and no tool step yet: a preset {apply "file"} extra unit list has no op'],
    ['card.icon', 'meaning not proven [I]: no vanilla card has {icon}; the card op only changes fields a card already has'],
    ['card.breed', 'no tool step yet: the soldier card mark has no card op field'],
    ['card.basic', 'meaning not proven [I] (kept by apply remove); the card op only changes fields a card already has'],
    ['card.not_for_sale', 'meaning not proven [I]; a new squad gets it in the squad task; no tool step yet for vehicle cards and stock squads'],
    ['card.order', 'meaning not proven [I]; a new squad is placed by the squad task; no tool step yet moves a stock card on its tab'],
    ['button.hint', 'meaning not proven [I]: no vanilla .lng has an mp/scene/hint_<tab> text, so the key name is a guess'],
    ['bots.repeat', 'no tool step yet: the Bots page reads the Repeat of a buy wave in bot.data.lua but no route writes it'],
  ],
  checklist: ['task.army.c.lobby', 'task.army.c.side', 'task.army.c.cards', 'task.army.c.limits', 'task.army.c.log'],
  lookups: { army: lookArmy, flag: lookFlag, card: lookCard, own: lookOwn, group: lookGroup, tab: lookTab, gohcard: lookGohCard, gohbase: lookGohBase, gohother: lookGohOther },
  routes: { 'POST /api/x/task/r/army/flag': flagRoute, 'POST /api/x/task/r/army/text': (u, b, ctx) => AG().textRoute(u, b, ctx),
    'POST /api/x/task/r/army/gohcards': (u, b, ctx) => AK().cardsRoute(u, b, ctx), 'POST /api/x/task/r/army/gohmake': (u, b, ctx) => AM().makeRoute(u, b, ctx),
    'POST /api/x/task/r/army/gohadopt': (u, b, ctx) => AM().adoptRoute(u, b, ctx), 'POST /api/x/task/r/army/gohbudget': (u, b, ctx) => AG().budgetRoute(u, b, ctx) },
  // what a branch gets: the army it works on. squad and soldier get it as their army answer, prices and bots as the army to change
  pass: async (parent, qid, ctx, opt) => {
    const tag = tagOf(parent); if (!tag) return { for: 'army' };
    const kind = opt && opt.recipe;
    if ((qid === 'unitlist' || qid === 'firstunits') && (kind === 'squad' || kind === 'soldier')) return { for: 'army', keys: { army: tag }, answers: { army: tag } };
    if (qid === 'prices' || qid === 'bots') return { for: 'army', keys: { army: tag }, base: { id: tag }, verb: 'change' };
    return { for: 'army', keys: { army: tag } };
  },
  values: async (ctx, base, opt) => {
    const g = rdOf(ctx, ctx && ctx.mod, gidOf(ctx, opt && opt.game)); if (!g) return {};
    const make = !!opt && opt.verb === 'make';
    const out = {}, bb = buttonsOf(g);
    if (g._goh) out.gohperiod = 'mid';
    if (bb.vehicle != null) out.budgetbuttons = bb.vehicle;
    const all = armies(g), a = base && base.id ? all.find(x => x.tag === lower(base.id)) : null;
    if (a) {
      if (!make) out.tag = a.tag;
      if (make) { const used = new Set(all.map(x => x.id)); for (let n = 6; n <= 99; n++) if (!used.has(n)) { out.armyid = n; break; } }
      else if (a.id != null) out.armyid = a.id;
      if (a.alliance) out.alliance = a.alliance;
      const f = /flag_([^/]+)$/.exec(a.icon || ''); if (f) out.flag = lower(f[1]);
      // a new army gets no name from its copy: two armies with one lobby name cannot be told apart
      const t = textOf(g, a.title); if (t && !make) out.title = t;
      const sd = a.alliance && sides(g)[a.alliance];
      if (sd) {
        const st = textOf(g, sd.title); if (st) out.sidename = st;
        const sf = FLAG.exec(sd.icon || ''); if (sf) out.sideflag = lower(sf[1]);
      }
    }
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  },
  compile: async (draft, c) => {
    if (gidOf(null, c.game) === 'goh') return AG().compile(draft, c, { TAG, same, linesOf, armies, sides, flagSize });
    const base = c.base && c.base.id ? lower(c.base.id) : '';
    if (!TAG.test(base)) throw bad('Pick the army to copy or change first.');
    const ops = [], copies = [], notes = [];
    const said = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && !same(c.value(id), c.values[id]); };
    const make = c.verb === 'make';
    const g = reader(c.gameDir, c.mod, c.game);
    let tag = lower(String(c.value('tag') || '').trim());
    if (make) {
      if (!TAG.test(tag)) throw bad('Type the short word of the new army: small English letters, digits and _ (up to 16), for example fin.');
      if (tag === base) throw bad('The new army needs its own short word; ' + base + ' is the army it copies.');
    } else {
      if (tag && tag !== base) throw bad('An army\'s short word cannot be renamed (cards, files and bots use it). To copy ' + base + ' under a new word, use "make" instead.');
      tag = base;
    }
    const calls = [];
    // a flag answer -> into <to>: a game flag is copied; an uploaded picture (PNG, TGA or GIF) goes through the flag route, which
    // converts it to the game's TGA at the size of the flag it replaces; the picture editor card leaves a note
    const flagCopy = (id, to, label, sizeOf) => {
      const fa = c.answer(id); if (!fa || fa.src === 'keep') return;
      if (fa.src === 'exist') { const k = FLAGS + 'flag_' + lower(fa.value) + '.tga'; if (k !== to) copies.push({ key: k, to }); }
      else if (fa.src === 'file') {
        const n = (fa.staged || [])[0];
        if (!n) throw bad(label + ': the picture was not uploaded.');
        if (!/\.(png|tga|gif)$/i.test(n)) throw bad(label + ': upload a PNG, TGA or GIF picture.');
        const size = flagSize(g, sizeOf || to);
        calls.push({ route: 'POST /api/x/task/r/army/flag', body: { draft: c.draftId, name: n, to, size }, dryFlag: 'write' });
        notes.push(label + ': your picture is converted to the game\'s TGA' + (size ? ' at ' + size + ' pixels, the stock flag size' : '') + ' and saved as ' + to + '.');
      } else notes.push(label + ': draw it in the picture editor and save it as ' + to + ' in the mod.');
    };
    const flagTo = FLAGS + 'flag_' + (make ? tag : (c.values.flag || tag)) + '.tga', fa = c.answer('flag');
    const all = g ? armies(g) : [];
    if (make) {
      const title = String(c.value('title') || '').trim();
      if (!title) throw bad('Type the name players see for the new army in the lobby, for example Finland.');
      const taken = g ? all.find(a => lower(textOf(g, a.title)) === lower(title)) : null;
      if (taken) throw bad('Army ' + taken.tag + ' is already called ' + title + ' in the lobby; give the new army its own name.');
      const spec = { op: 'army', tag, like: base, title };
      const ia = c.answer('armyid');
      if (ia && ia.src === 'value') {
        const n = Number(ia.value);
        if (!Number.isInteger(n) || n < 6 || n > 99) throw bad('A new army needs a number from 6 to 99: 0 to 5 are the stock armies (MIS-07). Keep it to take the lowest free one.');
        const other = all.find(a => a.id === n);
        if (other) throw bad('Number ' + n + ' is already army ' + other.tag + '; two armies with one number share ranks (MIS-07). Keep it to take the lowest free one.');
        spec.id = n;
      }
      const al = c.value('alliance'); if (al === 'axis' || al === 'allies') spec.alliance = al;
      // the army op copies a stock flag as flag_<tag>.tga; an own picture is written over it after (route calls run last)
      spec.icon_like = fa && fa.src === 'exist' ? lower(fa.value) : (c.values.flag || base);
      ops.push(spec);
      if (fa && fa.src !== 'exist') flagCopy('flag', flagTo, 'Flag', FLAGS + 'flag_' + spec.icon_like + '.tga');
      if (linesOf(c, 'groupcards').length) throw bad('Card groups change cards the army already has: write the new army first, then change it to group its cards.');
    } else {
      if (said('title')) {
        const title = String(c.value('title')).trim();
        const taken = g ? all.find(a => a.tag !== tag && lower(textOf(g, a.title)) === lower(title)) : null;
        if (taken) throw bad('Army ' + taken.tag + ' is already called ' + title + ' in the lobby; pick another name.');
        ops.push({ op: 'text', key: 'mp/army/' + tag, text: title });
        if (g && textOf(g, 'mp/army/' + tag)) notes.push(stockTextNote('Army name', 'mp/army/' + tag));
      }
      if (said('armyid')) {
        const n = Number(c.value('armyid'));
        if (!Number.isInteger(n) || n < 0 || n > 99) throw bad('The army number is a whole number from 0 to 99 (MIS-07).');
        const other = all.find(a => a.tag !== tag && a.id === n);
        if (other) throw bad('Number ' + n + ' is already army ' + other.tag + '; two armies with one number share ranks (MIS-07). Pick a free one.');
        ops.push({ op: 'set', rows: [{ entity: 'file:' + ARMIES + tag + '.set', path: 'army/id', value: String(n) }] });
        notes.push('Players\' ranks are kept per army number: a new number starts every player at the first rank on this army (MIS-07).');
      }
      if (fa && !(fa.src === 'exist' && lower(fa.value) === lower(c.values.flag || ''))) flagCopy('flag', flagTo, 'Flag');
      // cards moved to a cooldown group and/or a buy tab: every picked card gets what was picked
      const gl = linesOf(c, 'groupcards'), ga = c.answer('cardgroup'), ta = c.answer('cardtab');
      const gr = ga && ga.src === 'exist' ? lower(ga.value) : '', tb = ta && ta.src === 'exist' ? lower(ta.value) : '';
      if (gl.length && !gr && !tb) throw bad('Pick the cooldown group or the buy tab the picked cards move to (or take the cards off that list).');
      if (!gl.length && (gr || tb)) throw bad('Pick the cards that move to ' + [gr && 'group ' + gr, tb && 'tab ' + tb].filter(Boolean).join(' and ') + ' (or keep the group and tab as they are).');
      if (gr && !/^[a-z0-9_]{1,30}$/.test(gr)) throw bad('Pick the cooldown group from the list.');
      if (tb && !/^[a-z0-9_]{1,30}$/.test(tb)) throw bad('Pick the buy tab from the list.');
      const mine = g ? cards(g, tag) : null;
      for (const l of gl) {
        const id = String(l.value || '').trim(), x = mine ? mine.find(y => lower(y.id) === lower(id) || (y.kind === 'squad' && lower(y.name) === lower(id))) : null;
        if (mine && !x) throw bad(tag + ' has no card ' + id + ' to move. Pick it from the list.');
        const fields = {}; if (gr) fields.g = gr; if (tb) fields.b = tb;
        if (x && x.kind === 'squad') ops.push({ op: 'squad', name: x.name, army: tag, change: true, fields });
        else ops.push({ op: 'card', unit: x ? x.id : id, army: tag, fields });
      }
      if (tb && tb !== 'hero') { const bb = g ? buttonsOf(g) : {}; const paid = String(c.value('budgetbuttons') || bb.vehicle || '').split(/\s+/); if (bb.vehicle != null && !paid.includes(tb)) notes.push('Tab ' + tb + ' is not paid with money (budget buttons), so its cards cost nothing there.'); }
    }
    // the unit list: a picked card of another army is copied into this army's list as it is (roster: written into this army's own
    // file with s(<army>)); a typed line is a card name, checked the same way; a branch line is the kind's own task for this army
    const own = g ? cards(g, tag) : [], others = g ? all.filter(a => a.tag !== tag).map(a => a.tag) : [];
    const addQ = make ? 'firstunits' : 'unitlist', adds = linesOf(c, addQ);
    if (make && !adds.length) throw bad('A new army starts with no cards: add at least one, picked from another army or made new.');
    const seen = new Set();
    for (const l of adds) {
      if (l.src === 'branch') {
        const k = (l.recipe || '') || 'unit';
        notes.push((k === 'vehicle' ? 'Vehicle ' : k === 'squad' ? 'Squad ' : k === 'soldier' ? 'Soldier ' : 'Unit ') + (l.value || '(open)') + ': made by the ' + k + ' task for ' + tag + ', after the army.');
        continue;
      }
      const unit = String(l.value || '').trim();
      if (!new RegExp('^' + UNIT + '$').test(unit)) throw bad('A card line is one card name, for example pz4h. Pick it from the list to be sure it exists.');
      if (seen.has(lower(unit))) throw bad('Card ' + unit + ' is in the list twice.');
      seen.add(lower(unit));
      if (g) {
        if (own.some(x => lower(x.id) === lower(unit))) throw bad(tag + ' already has card ' + unit + '.');
        const from = others.find(a => cards(g, a).some(x => x.kind === 'vehicle' && lower(x.id) === lower(unit)));
        if (!from) throw bad('No army has a vehicle card ' + unit + '. Pick the card from the list (search with the name players see).');
        notes.push('Card ' + unit + ' of ' + from + ' is copied into the ' + tag + ' list; buy it as ' + tag + ' in a test match [T].');
      }
      ops.push({ op: 'roster', unit, like: unit, army: tag });
    }
    // cards taken off this army's list: a vehicle card gets {remove}, a squad a {"name(army)" {remove}} line
    for (const l of make ? [] : linesOf(c, 'unitremove')) {
      const id = String(l.value || '').trim(), sq = /^([A-Za-z0-9_]+)\(([a-z0-9_]+)\)$/.exec(id);
      const x = g ? own.find(y => lower(y.id) === lower(id) || (y.kind === 'squad' && lower(y.name) === lower(id))) : null;
      if (g && !x) throw bad(tag + ' has no card ' + id + ' to take off. Pick it from the list.');
      if (x && x.shared) throw bad('Card ' + id + ' is shared with other armies; taking it off would take it off theirs too.');
      if (sq && lower(sq[2]) !== tag) throw bad('Squad ' + id + ' is not a squad of ' + tag + '.');
      if ((x && x.kind === 'squad') || sq) { const name = x ? x.name : sq[1]; ops.push({ op: 'squad', name, army: tag, remove: true }); notes.push('Squad ' + name + '(' + tag + ') is taken off the list with a {remove} line; check the buy panel in game [T].'); }
      else { ops.push({ op: 'card', unit: x ? x.id : id, army: tag, remove: true }); notes.push('Card ' + (x ? x.id : id) + ' is taken off the ' + tag + ' list with {remove}; check the buy panel in game [T].'); }
    }
    // the side: its shown name (text) and picture, shared by every army on it
    const side = make ? (c.value('alliance') || c.values.alliance) : c.values.alliance;
    if (said('sidename') || (c.answer('sideflag') && c.answer('sideflag').src !== 'keep')) {
      const sd = g && side ? sides(g)[side] : null;
      if (!sd) throw bad('The army is on no side (preset_alliances.inc), so there is no side name or picture to change.');
      const on = all.filter(a => a.alliance === side).map(a => a.tag).join(', ');
      if (said('sidename')) { const k = lower(sd.title || 'mp/alliance/' + side); ops.push({ op: 'text', key: k, text: String(c.value('sidename')).trim() }); notes.push('The side name is shown for every army on the ' + side + ' side (' + on + ').'); if (g && textOf(g, k)) notes.push(stockTextNote('Side name', k)); }
      const sf = FLAG.exec(sd.icon || '');
      if (!sf) throw bad('The ' + side + ' side has no picture path in preset_alliances.inc to write over.');
      if (c.answer('sideflag') && c.answer('sideflag').src !== 'keep') notes.push('The side picture is shown for every army on the ' + side + ' side (' + on + ').');
      flagCopy('sideflag', FLAGS + 'flag_' + lower(sf[1]) + '.tga', 'Side picture');
    }
    // budget buttons: one rule for every army; a tab that cards use and no budget pays for would make them free
    if (said('budgetbuttons')) {
      const now = String(c.value('budgetbuttons')).trim(), list = now.split(/\s+/), bb = g ? buttonsOf(g) : {}, hero = String(bb.hero || '').split(/\s+/);
      const used = new Set(); if (g) for (const a of all) for (const x of cards(g, a.tag)) if (x.tab) used.add(x.tab);
      const free = [...used].filter(t => !list.includes(t) && !hero.includes(t)).sort();
      if (free.length) throw bad('Cards are bought on tab ' + free.join(', ') + '; with no money paying for it they would cost nothing. Keep every tab your cards use.');
      ops.push({ op: 'preset', file: 'presets_all.inc', name: 'all', set: { 'budgets/vehicle/buttons': now } });
      notes.push('The money tabs are a rule in presets_all.inc: they change for every army (' + all.map(a => a.tag).join(', ') + ') in the modes that use it.');
    }
    for (const q of ['prices', 'bots']) { const a = c.answer(q); if (a && a.src === 'branch') notes.push(q + ': written by its own task after the army' + (a.result ? ' (' + (typeof a.result === 'object' ? JSON.stringify(a.result).slice(0, 80) : a.result) + ')' : '') + '.'); }
    return { gen: ops.length ? { ops } : null, calls, copies, notes, result: tag };
  },
  _read: { gameOf, gidOf, naLine, reader, armies, alliances, sides, textOf, cards, lookArmy },
};
