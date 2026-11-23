// Bots page part "stages" (group A, order 20): two cards on script/multiplayer/bot.data.lua. "Edit what bots buy, stage by stage" (the
// Purchases stages: rows, Repeat, add / remove / copy a stage, copy an army's list) and "Where bots go" (FlagPriority, OrderRotationPeriod,
// MaxSquadSize). Reads the mod's copy, else the game's (bots lib.effective, vfs of the request's game); every edit is a splice of that text
// (botdata.js), previewed as a change list and a line diff, written as the mod's copy (latin1: CRLF, comments, cp1251 bytes kept), the bytes
// before kept for Undo (buycheck/undo.js: the frame's lib.undo when it has one).
// Buy cards and names: the game, the mods this mod is built on and the mod, paks included (cards.js over buycheck/mount.js + deps.js).
// GoH has no bot.data.lua (GHMIS-66): read answers {goh: true}, preview and write refuse with code goh; cards answers the GoH buy cards
// per army (buycheck/gohcards.js), with goh: true.
// Routes (the frame adds mod and the game id): GET stages/read, GET stages/cards, POST stages/preview, POST stages/write, POST stages/undo.
// Every refusal is {ok: false, code, args} (the page words it in four languages); a refused edit also carries at (its index).
// Author: Imperator_Aug (ARSENAL, ia-d03b63a7)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const lib = require('../../lib');
const B = require('./botdata'), C = require('./cards'), UNDO = require('../buycheck/undo');

const BOTDATA = 'script/multiplayer/bot.data.lua';
const GOH_LINE = 'Not available in Gates of Hell: it has no script/multiplayer/bot.data.lua; its bots buy in bot.main.lua and modes/*.lua (GHMIS-66). Change those by hand in the Editor.';
const bad = (code, args, status) => Object.assign(new Error(code), { code, args: args || {}, status: status || 400 });
const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const hash = t => crypto.createHash('sha1').update(t, 'latin1').digest('hex');
const target = mod => path.join(mod, 'resource', ...BOTDATA.split('/'));
const isGoh = (ctx, gid) => gid === 'goh' || lib.gameOf(ctx).kind === 'goh';
const gidOf = (url, body) => q(url, 'game') || q(url, 'gid') || (body && (body.game || body.gid)) || '';

function textOf(ctx, mod) {
  const e = lib.effective(ctx, mod, BOTDATA);
  if (e.text == null) throw bad('noList', {}, 404);
  return e;
}
const ownBot = mod => fs.existsSync(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.lua'));
const unitsIn = m => [...new Set(m.stages.flatMap(s => Object.values(s.armies).flatMap(l => l.map(r => r.unit))))];

async function read(ctx, url) {
  if (isGoh(ctx, gidOf(url))) return { goh: true };
  const mod = lib.checkMod(ctx, q(url, 'mod')), e = textOf(ctx, mod), m = B.model(e.text);
  const stock = e.vanilla != null ? B.model(e.vanilla) : null;
  const O = await C.openData(ctx, mod);   // unit names and lobby army names: the shared store (cards.js openData), else made now
  return { ok: true, from: e.from, base: hash(e.text), target: target(mod), copiesWholeFile: e.from !== 'mod', ownBot: ownBot(mod), odd: m.odd, model: m,
    stock: stock && !stock.odd ? { move: stock.move } : null, names: C.namesOf(ctx, mod, unitsIn(m), O.lng), armies: O.armyNames, warnings: m.odd ? [] : B.warnings(e.text) };
}
async function cards(ctx, url) {
  // GoH: the buy cards per army (buycheck/gohcards.js: the game's and the mod's card sets, cached), names from its .pot texts; the stage
  // editor itself stays refused there (no bot.data.lua)
  if (isGoh(ctx, gidOf(url))) {
    const mod = lib.checkMod(ctx, q(url, 'mod')), list = {}, names = {};
    let units = [];
    try { units = await require('../buycheck/gohcards').cardList(ctx, mod); } catch (e) { return { goh: true, ok: true, known: false, cards: {}, names: {}, armies: {} }; }
    for (const u of units) { if (!u.army) continue; (list[u.army] = list[u.army] || []).push({ unit: u.unit, src: u.src }); if (u.name) names[u.unit] = u.name; }
    for (const a of Object.keys(list)) list[a].sort((x, y) => (x.unit < y.unit ? -1 : x.unit > y.unit ? 1 : 0));
    return { goh: true, ok: true, known: true, cards: list, names, armies: lib.armyNames(ctx, mod, Object.keys(list)), missing: [], base: null };
  }
  const mod = lib.checkMod(ctx, q(url, 'mod')), c = C.cardsOf(ctx, mod);
  const all = [...new Set(Object.values(c.list).flatMap(l => l.map(x => x.unit)))];
  return { ok: true, known: c.known, cards: c.list, names: C.namesOf(ctx, mod, all, c.lng), armies: c.armyNames || {}, missing: c.missing, base: c.base };
}
// preview (write = false) and write: the ops on the current text; {ok:false, code, args, at} for a refused op
async function run(ctx, body, write) {
  body = body || {};
  if (isGoh(ctx, gidOf(null, body))) throw bad('goh');
  const mod = lib.checkMod(ctx, body.mod), e = textOf(ctx, mod), ops = Array.isArray(body.ops) ? body.ops : [];
  if (write) lib.checkWrite(ctx, mod, [BOTDATA]);
  if (ops.length > 500) throw bad('tooMany', { max: 500 });
  if (body.base && body.base !== hash(e.text)) return { ok: false, code: 'changed', args: {} };
  const needCards = ops.some(o => o && (o.op === 'rowAdd' || o.op === 'armyCopy'));
  let r, cs = null;
  try { cs = needCards ? C.cardsOf(ctx, mod) : null; r = B.apply(e.text, ops, { cards: cs ? cs.cards : null, vanilla: e.vanilla }); }
  catch (x) { if (x instanceof B.Refuse) return { ok: false, code: x.code, args: x.args, at: x.at == null ? -1 : x.at }; throw x; }
  const m = B.model(r.text), res = { ok: true, changes: r.changes, warnings: r.warnings, diff: B.diff(e.text, r.text, 400), model: m, names: C.namesOf(ctx, mod, unitsIn(m), cs ? cs.lng : null),
    copiesWholeFile: e.from !== 'mod', target: target(mod), rel: BOTDATA, written: false, same: r.text === e.text };
  if (write && r.text !== e.text) {
    lib.checkWrite(ctx, mod, [BOTDATA]);
    const p = target(mod), tk = UNDO.pick().save(ctx, mod, BOTDATA);
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, r.text, 'latin1');
    tk.commit();
    res.written = true; res.base = hash(r.text); res.undo = true;
  }
  return res;
}
// Undo of the last write of this card: the exact bytes from before (or no file, when the write made it)
async function undo(ctx, body) {
  const mod = lib.checkMod(ctx, body && body.mod);
  lib.checkWrite(ctx, mod, [BOTDATA]);
  return Object.assign({ ok: true, rel: BOTDATA }, UNDO.pick().restore(ctx, mod, BOTDATA));
}

module.exports = {
  id: 'stages', group: 'A', order: 20,
  routes: {
    // SPEED: C.route = the shared mod scan waited for first (cards.js warm), so the buy cards and names are read without a walk of the mod
    'GET /api/x/bots/stages/read': UNDO.reply(C.route(async (url, body, ctx) => read(ctx, url))),
    'GET /api/x/bots/stages/cards': UNDO.reply(C.route(async (url, body, ctx) => cards(ctx, url))),
    'POST /api/x/bots/stages/preview': UNDO.reply(C.route(async (url, body, ctx) => run(ctx, body, false))),
    'POST /api/x/bots/stages/write': UNDO.reply(C.route(async (url, body, ctx) => run(ctx, body, true))),
    'POST /api/x/bots/stages/undo': UNDO.reply(async (url, body, ctx) => undo(ctx, body || {})),
  },
  lang: require('./lang'),
  script: require('./client'),
  BOTDATA, GOH_LINE,
};
