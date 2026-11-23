// GUI-EXT modes: the Game Modes page (Game Modes & AI > Game Modes; AS64, MoW:AS2 and GoH). A game mode is a mode card,
// resource/set/multiplayer/games/<mode>.set, plus the lobby presets; a card change applies to every map of that mode while the mod is on.
// Lists the modes of the game and of my mod (plays like, players, order, bots, from), allows bots in a mode (maps botsFor/addBots:
// preview, then write), and shows the multiplayer start settings (the bots ext's BOTS_UI.mpCard on the /api/x/bots/* routes).
// Card values come from the mission and map recipes' readers; writes go only to the mod folder picked.
// Routes: GET list, POST bots {write}.
// Game (game parity): the game view is the request's game (ctx.gameId/kind/curDir): MoW:AS2 reads the shared AS2 install through the vfs
// with exe mowas_2 (no as64/core), AS64 names no exe (as before), GoH reads the GoH install (exe goh). GoH cards sit at the same path in the
// same {game {settings {enableBots}}} form [V vanilla battle_zones.set], with the GoH class list (gohweb mission/goh-game-mode-registry [V]:
// frontlines not frontline, no combat). The combat warning (MIS-65) is AS2 only. GoH mod folder: any folder outside the GoH install
// (<GoH>/mods/<mod> may be read); a write passes lib/writeguard, which refuses every path inside the GoH install.
// CACHE (gui README, contract 1): the game's files are the one shared view (lib/gameview), no view is built here; the list itself is a
// few small cards read on each ask (milliseconds once the view stands), so nothing of it is kept. A write tells the shared mod listing
// (ctx.modtree.touch).
// Author: Imperator_Aug (ARSENAL, ia-a5c5b6aa)
const fs = require('fs'), path = require('path');
const LANG = require('./lang.json');
const MP = require('../maps')._t;
const R = require('../task/recipes/map.recipe')._t;
const games = require('../../../lib/games');

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const DIR = 'resource/set/multiplayer/games/';
const MODE_RE = /^[a-z0-9_]{1,40}$/;
// engine game classes (modweb mission/mp-chain, MIS-19); a card with no {class} plays as its file name
const CLASSES = ['combat', 'captureflag', 'cooperative', 'frontline', 'battle_zones', 'battle_zones_8x8', 'armored_warfare', 'combined_arms'];
// GoH registered names (gohweb mission/goh-game-mode-registry [V]): combat is not registered, frontline is frontlines
const GOH_CLASSES = ['battle_zones', 'frontlines', 'captureflag', 'cooperative', 'campaign_capture_the_flag', 'ammunition', 'evacuation', 'koth', 'heroes', 'guerrilla', 'battle_zones_8x8', 'armored_warfare', 'combined_arms'];
const classesOf = kind => (kind === 'goh' ? GOH_CLASSES : CLASSES);

// the request's game: {id, kind, exe (none under AS64: as before), dir (GoH install under GoH, else the AS2 one)}
function gameOf(ctx) {
  const id = (ctx && ctx.gameId && ctx.gameId()) || 'as64', kind = games.kindOf(id) || 'as2';
  let dir = null;
  try { dir = kind === 'goh' ? (ctx.curDir ? ctx.curDir() : ctx.gohDir && ctx.gohDir()) : (ctx.game && ctx.game()); } catch (e) { /* none */ }
  return { id, kind, exe: id === 'as64' ? undefined : games.exeOf(id), dir: dir || null };
}
function needGame(ctx) {
  const g = gameOf(ctx);
  if (!g.dir) throw bad(g.kind === 'goh' ? 'The GoH folder was not found. Set it in the top bar first.' : 'The game folder was not found. Set it on the Mods page first.');
  return g;
}
// the game's own files (no mod): the one shared view of that game (lib/gameview; AS64 no exe, MoW:AS2 mowas_2, GoH goh); null = unreadable
function viewOf(g) {
  if (!g || !g.dir) return null;
  try { return require('../../../lib/gameview').get({ gameDir: g.dir, gid: g.id }); } catch (e) { return null; }
}
// a card: the mod's loose copy first, else the game's
function cardBuf(g, mod, rel) {
  if (mod) { const f = path.join(mod, ...rel.split('/')); try { if (fs.statSync(f).isFile()) return fs.readFileSync(f); } catch (e) { /* not in the mod */ } }
  const v = viewOf(g), rec = v && v.files.get(rel);
  if (!rec) return null;
  try { return require('../../../lib/vfs').readRec(rec); } catch (e) { return null; }
}
// a value straight under the card's {game ..} block (minPlayers, maxPlayers and order also sit inside {ranked} and team blocks)
function topVal(t, key) {
  const s = t.search(/\{\s*game\b/i); if (s < 0) return null;
  const re = new RegExp('^\\{\\s*' + key + '\\s+("[^"]*"|[^\\s{}]+)', 'i');
  for (let i = t.indexOf('{', s) + 1, d = 1; i < t.length && d > 0; i++) {
    const ch = t[i];
    if (ch === '"') { i = t.indexOf('"', i + 1); if (i < 0) break; continue; }
    if (ch === '{' || ch === '(') { if (d === 1 && ch === '{') { const m = re.exec(t.slice(i, i + 200)); if (m) return m[1].replace(/^"|"$/g, ''); } d++; }
    else if (ch === '}' || ch === ')') d--;
  }
  return null;
}
// the card facts the page shows (the same reading as the mission recipe's cardOf: live text, top-level players and order, {enableBots})
// GoH also writes {enableBots 1} (vanilla campaign_capture_the_flag.set [V]): a value other than 0 counts as on there [I]
function cardOf(g, mod, mode) {
  g = asGame(g);
  const b = cardBuf(g, mod, DIR + mode + '.set');
  if (!b) return null;
  const t = R.live(b.toString('latin1'));
  const top = k => { const x = topVal(t, k); return x != null && isFinite(+x) ? +x : null; };
  const gb = /\{\s*enableBots(?:\s+(\d+))?\s*\}/i.exec(t);
  const bots = g.kind === 'goh' ? !!gb && gb[1] !== '0' : /\{\s*enableBots\s*\}/i.test(t);
  return { text: t, bots, order: top('order'), minPlayers: top('minPlayers'), maxPlayers: top('maxPlayers') };
}
// {enableBots} into a card; GoH: a {enableBots 0} line becomes {enableBots 1} [I: value form of the vanilla card; what 0 does in game is T]
function addBotsTo(g, text) {
  if (g.kind === 'goh') {
    const m = /\{\s*enableBots\s+0\s*\}/i.exec(R.live(text));
    if (m) { const z = m.index + m[0].lastIndexOf('0'); return { text: text.slice(0, z) + '1' + text.slice(z + 1), state: 'added' }; }
  }
  return MP.addBots(text);
}

// the mod folder: AS2 through the Maps rule (safeMod); GoH: an existing folder that is not the GoH install itself or inside it (except
// <GoH>/mods/<mod>, read only). Refusals are Maps keys, shown in the page language
function modCheck(p, ctx, g) {
  if (g.kind !== 'goh') return MP.safeMod(p, ctx);
  if (typeof p !== 'string' || !p.trim()) throw bad('maps.e.nomod');
  const abs = path.resolve(p.trim());
  let st; try { st = fs.statSync(abs); } catch (e) { throw bad('maps.e.nofolder'); }
  if (!st.isDirectory()) throw bad('maps.e.notfolder');
  if (g.dir) {
    const r = path.relative(path.resolve(g.dir), abs).replace(/\\/g, '/').toLowerCase();
    if (r === '') throw bad('maps.e.gameroot');
    if (!r.startsWith('..') && !path.isAbsolute(r) && !/^mods\/[^/]+$/.test(r)) throw bad('maps.e.ingame');
  }
  return abs;
}
// the mod folder, if one was given and it is allowed; a refused one leaves the list on the game alone and says why
function modOpt(p, ctx, g) { if (!p) return { mod: '', why: null }; try { return { mod: modCheck(p, ctx, g), why: null }; } catch (e) { return { mod: '', why: e.message }; } }
const inMod = (mod, rel) => { try { return !!mod && fs.statSync(path.join(mod, ...rel.split('/'))).isFile(); } catch (e) { return false; } };
const classOf = (text, mode) => { const m = /\{\s*class\s+"?([A-Za-z0-9_]+)"?\s*\}/i.exec(text || ''); return { cls: m ? m[1].toLowerCase() : mode, own: !!m }; };

// ---- one mode card -> a table row and its warnings. g: gameOf(ctx), or a folder (older callers: AS64 on that folder)
const asGame = g => (typeof g === 'string' ? { id: 'as64', kind: 'as2', exe: undefined, dir: g } : g);
function rowOf(g, mod, mode) {
  g = asGame(g);
  const rel = DIR + mode + '.set', cd = cardOf(g, mod, mode);
  if (!cd) return null;
  const v = viewOf(g), inGame = !!(v && v.files.has(rel)), mine = inMod(mod, rel), c = classOf(cd.text, mode), K = classesOf(g.kind);
  const row = { mode, cls: c.cls, clsSet: c.own, known: K.includes(c.cls), min: cd.minPlayers, max: cd.maxPlayers, order: cd.order, bots: !!cd.bots,
    from: mine ? (inGame ? 'changed' : 'mod') : 'game', warn: [] };
  if (!row.known) row.warn.push({ k: g.kind === 'goh' ? 'modes.w.clsGoh' : 'modes.w.cls', p: { mode, cls: c.cls } });   // MIS-19; GoH: the registry note
  if (g.kind !== 'goh' && row.bots && c.cls === 'combat') row.warn.push({ k: 'modes.w.combat', p: { mode } });   // MIS-65 (AS2)
  return row;
}
// card names: top-level <mode>.set of the game view and of the mod's loose folder
function namesOf(g, mod) {
  const names = new Set(), re = /^resource\/set\/multiplayer\/games\/([a-z0-9_]+)\.set$/;
  const v = viewOf(g);
  if (v) for (const k of v.files.keys()) { const m = re.exec(k); if (m) names.add(m[1]); }
  if (mod) { let es = []; try { es = fs.readdirSync(path.join(mod, ...DIR.split('/').filter(Boolean)), { withFileTypes: true }); } catch (e) { /* none */ } for (const e of es) { const m = e.isFile() && re.exec(DIR + e.name.toLowerCase()); if (m) names.add(m[1]); } }
  return names;
}
function listOf(g, mod) {
  g = asGame(g);
  const K = classesOf(g.kind), rows = [];
  for (const n of namesOf(g, mod)) { const r = rowOf(g, mod, n); if (r) rows.push(r); }
  rows.sort((a, b) => (a.order == null ? 1e6 : a.order) - (b.order == null ? 1e6 : b.order) || (K.indexOf(a.mode) < 0 ? 99 : K.indexOf(a.mode)) - (K.indexOf(b.mode) < 0 ? 99 : K.indexOf(b.mode)) || (a.mode < b.mode ? -1 : 1));
  return rows;
}
async function listRoute(url, body, ctx) {
  const g = needGame(ctx), mo = modOpt(url.searchParams.get('mod'), ctx, g);
  return { modes: listOf(g, mo.mod), mod: mo.mod, modWhy: mo.why };
}

// ---- allow bots in one mode: {enableBots} into the mod's copy of the card (the game's card is copied first). Preview, then write.
// Same steps as the Maps botsFor, on the request's game view
function botsFor(g, mod, mode, write) {
  const rel = DIR + mode + '.set', dst = path.join(mod, ...rel.split('/')), buf = cardBuf(g, mod, rel);
  if (!buf) return { mode, state: 'nocard' };
  const r = addBotsTo(g, buf.toString('latin1'));
  if (r.state === 'added' && write) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, Buffer.from(r.text, 'latin1')); }
  return { mode, state: r.state };
}
async function botsRoute(url, body, ctx) {
  body = body || {};
  const g = needGame(ctx), mod = modCheck(body.mod, ctx, g), mode = String(body.mode || '').toLowerCase(), write = !!body.write;
  if (!MODE_RE.test(mode)) throw bad('modes.e.mode');
  if (write && ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a write
  const row = rowOf(g, mod, mode);
  if (!row) throw bad('modes.e.nocard');
  if (write && g.kind === 'goh') { const why = require('../../../lib/writeguard').refuseWrite(mod, { game: g.dir, purpose: 'allow bots in a mode' }); if (why) throw bad(why); }
  const r = botsFor(g, mod, mode, write);
  if (write && ctx && ctx.modtree && typeof ctx.modtree.touch === 'function') ctx.modtree.touch(mod);   // CACHE: the mod listing is walked again
  const out = { ok: r.state === 'added' || r.state === 'present', write, mode, state: r.state, file: DIR + mode + '.set', copy: row.from === 'game', say: [], warn: [] };
  out.say.push({ k: 'modes.s.' + r.state + (r.state === 'added' && !write ? '.will' : ''), p: { mode, file: out.file } });
  if (r.state === 'added' && !write && row.from === 'game') out.say.push({ k: 'modes.s.copy', p: { file: out.file } });
  if (g.kind !== 'goh' && row.cls === 'combat') out.warn.push({ k: 'modes.w.combat', p: { mode } });   // MIS-65 (AS2)
  if (r.state === 'added' && write) out.needsTest = true;
  return out;
}

module.exports = {
  id: 'modes', nav: 'modes.nav', adv: false, after: 'missions',
  script: require('./client'),
  lang: LANG,
  commands: {},
  routes: {
    'GET /api/x/modes/list': listRoute,
    'POST /api/x/modes/bots': botsRoute,
  },
  _t: { listOf, rowOf, classOf, gameOf, cardOf, modCheck, viewOf, CLASSES, GOH_CLASSES },
};
