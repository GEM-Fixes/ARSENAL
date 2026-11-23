// Bots part modeready (group C, Match setup): "Can bots join this game mode?". One row per game mode of the effective mod + game, read
// with the Game Modes page's own reader (ext/modes _t.listOf / cardOf: set/multiplayer/games/<mode>.set of the game view and the mod's
// loose copy; AS64, MoW:AS2 and GoH, GoH value form {enableBots 1}). Each row: bots allowed yes/no, why (TST-03 {enableBots}; MIS-65 combat
// has no flags; MIS-71 a generated map's combat answers "no AI here"), the card's armySelectionMode (team pins a team's army, MIS-37) and
// where the card comes from. "Allow bots" goes through the Game Modes page's allow route (POST /api/x/modes/bots): preview, then write.
// Each row also carries plain lines (bots.modeready.p.*) for the page; the why lines with {enableBots} and the IDs go into its Details.
// A write keeps the card's bytes before (recipes/undo.js, or the frame's lib.undo) so Undo puts them back exactly (page standard S4).
// Routes: GET list, GET botmodes (the modes bots can play, for other parts), POST allow {mode, write} -> the modes answer + undo, POST undo {mode} -> {ok, mode, action}.
// Refusals come as lang keys (bots.modeready.e.*, maps.e.*, modes.e.*), shown in the page language.
// Author: Imperator_Aug (ARSENAL, ia-edf8cbf0)
'use strict';
const MODES = require('../../../modes');
const M = MODES._t;

const { bad: badKey } = require('../recipes/errs');
const undo = require('../recipes/undo');
const bad = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });
const E = (k, p) => badKey('bots.modeready.' + k, p, 409);
const relOf = mode => 'set/multiplayer/games/' + mode + '.set';   // the undo rel: under <mod>/resource
// the bots write guard (bots/lib checkWrite: a real mod folder, the card inside it) before the card is written or put back
const guard = (ctx, mod, mode) => { try { return require('../../lib').checkWrite(ctx, mod, [relOf(mode)]); } catch (e) { throw badKey('bots.modeready.e.guard', { m: String((e && e.message) || e).slice(0, 400) }); } };
const arg = (url, body, k) => (body && body[k] != null ? String(body[k]) : (url && url.searchParams && url.searchParams.get(k)) || '');

// the card's {armySelectionMode x} (in-play-team: team = mp_set team.X.army pins a team's army; alliance = no such field, MIS-37); none = null
function armyModeOf(text) { const m = /\{\s*armySelectionMode\s+"?([A-Za-z_]+)/i.exec(String(text || '')); return m ? m[1].toLowerCase() : null; }

// why one row is what it is: [{k, p}] lang keys (the modes page's warnings kept, its combat line replaced by ours)
function whyOf(kind, r) {
  const w = [];
  w.push({ k: r.bots ? 'bots.modeready.why.on' : kind === 'goh' ? 'bots.modeready.why.offGoh' : 'bots.modeready.why.off', p: { mode: r.mode } });
  if (r.bots && r.from !== 'game') w.push({ k: 'bots.modeready.why.fromMod', p: { mode: r.mode } });
  if (kind !== 'goh' && r.cls === 'combat') w.push({ k: 'bots.modeready.why.combat', p: { mode: r.mode } });   // MIS-65 + MIS-71
  if (kind !== 'goh' && r.bots && r.armyMode !== 'team') w.push({ k: 'bots.modeready.why.alliance', p: { mode: r.mode } });   // MIS-37
  for (const x of r.warn || []) if (x.k !== 'modes.w.combat') w.push(x);
  return w;
}

// the plain lines of a row, for the page (no card words, no IDs): [lang key]
function plainOf(kind, r) {
  const p = [r.bots ? 'bots.modeready.p.on' : 'bots.modeready.p.off'];
  if (r.bots && r.from !== 'game') p.push('bots.modeready.p.fromMod');
  if (kind !== 'goh' && r.cls === 'combat') p.push(r.bots ? 'bots.modeready.p.combat' : 'bots.modeready.p.combatOff');
  if (kind !== 'goh' && r.bots && r.armyMode !== 'team') p.push('bots.modeready.p.alliance');
  return p;
}

// ---- in-game mode names: the game's own words from #dlg_mp.lng (mp/game/<mode>, read from localization.pak, as the lobby shows them [V]),
// the mod's loose copy over it; the known English names when the text cannot be read; the mode id last
const KNOWN_NAMES = { combat: 'Combat', battle_zones: 'Assault Zones', battle_zones_8x8: 'Assault Zones Extreme', captureflag: 'Day of Victory',
  frontline: 'Frontlines', cooperative: 'Skirmish' };
const LNG = 'resource/interface/text/#dlg_mp.lng';
// read from the one shared game view (lib/gameview, CACHE contract 1), kept in memory while the game stamp stands
const VIEWS = new Map();   // game id|folder -> {stamp, text}
function gameLng(g) {
  if (!g || !g.dir) return null;
  const GV = require('../../../../../lib/gameview'), k = g.id + '|' + require('path').resolve(g.dir).toLowerCase();
  let stamp = ''; try { stamp = GV.stamp({ gameDir: g.dir, gid: g.id }); } catch (e) { stamp = ''; }
  const c = VIEWS.get(k);
  if (c && c.stamp === stamp) return c.text;
  let t = null;
  try { t = GV.text(GV.get({ gameDir: g.dir, gid: g.id }), LNG, 'utf8'); } catch (e) { t = null; }
  VIEWS.set(k, { stamp, text: t });
  return t;
}
function modLng(mod) {
  if (!mod) return null;
  const fs = require('fs'), path = require('path');
  for (const rel of ['localization/#dlg_mp.lng', 'resource/interface/text/#dlg_mp.lng']) { try { return fs.readFileSync(path.join(mod, ...rel.split('/')), 'utf8'); } catch (e) { /* not there */ } }
  return null;
}
// {mode: name} from the mp/game block of one #dlg_mp.lng text: its {"<mode>" "<name>"} leaves (mp/presets/game is another block)
function namesIn(text) {
  const out = {}, t = String(text || ''), st = [];
  const str = i => { let j = i + 1, v = ''; for (; j < t.length && t[j] !== '"'; j++) { if (t[j] === '\\' && j + 1 < t.length) j++; v += t[j]; } return { v, end: j + 1 }; };
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (c === '{') {
      i++; while (i < t.length && /\s/.test(t[i])) i++;
      let name = '';
      if (t[i] === '"') { const q = str(i); name = q.v; i = q.end; } else { while (i < t.length && /[^\s{}"]/.test(t[i])) name += t[i++]; }
      st.push({ name: name.toLowerCase(), vals: [] }); continue;
    }
    if (c === '}') {
      const n = st.pop(), p = st[st.length - 1], pp = st[st.length - 2];
      if (n && n.vals.length && p && pp && p.name === 'game' && pp.name === 'mp' && !out[n.name]) { const v = n.vals[0].replace(/<[^>]*>/g, '').trim(); if (v) out[n.name] = v; }
      i++; continue;
    }
    if (c === '"') { const q = str(i); if (st.length) st[st.length - 1].vals.push(q.v); i = q.end; continue; }
    i++;
  }
  return out;
}
function namesOf(g, mod) { return Object.assign({}, KNOWN_NAMES, namesIn(gameLng(g)), namesIn(modLng(mod))); }

// modes bots cannot really play though the lobby may offer them (S16, S19): combat has no flags (MIS-65), so bots buy and never send squads;
// frontline: one side attacks after a countdown, and a bot bought one squad in 238 s of a test match [V]);
// cooperative (Skirmish): played together against the map's own enemy, the multiplayer bot script there not tried in the game [T]
const RISK = { combat: 'combat', frontline: 'frontline', cooperative: 'cooperative' };

// every mode of the request's game (+ the mod when given and allowed): {gid, kind, mod, modWhy, rows}
function readiness(ctx, modRaw) {
  const g = M.gameOf(ctx);
  if (!g.dir) throw bad(g.kind === 'goh' ? 'bots.modeready.e.nogoh' : 'bots.modeready.e.nogame');
  let mod = '', modWhy = null;
  if (modRaw) { try { mod = M.modCheck(modRaw, ctx, g); } catch (e) { modWhy = e.message; } }
  const names = namesOf(g, mod);
  const rows = M.listOf(g, mod).map(r => {
    const cd = M.cardOf(g, mod, r.mode), row = Object.assign({}, r, { armyMode: armyModeOf(cd && cd.text) });
    row.name = names[r.mode] || r.mode;
    row.risk = g.kind === 'goh' ? null : RISK[r.cls] || RISK[r.mode] || null;
    row.canUndo = !!(mod && LAST.get(lastKey(mod, r.mode)));
    row.why = whyOf(g.kind, row);
    row.plain = plainOf(g.kind, row);
    return row;
  });
  return { gid: g.id, kind: g.kind, mod, modWhy, rows };
}

async function listRoute(url, body, ctx) { return readiness(ctx, arg(url, body, 'mod')); }

// the modes bots can play, for other parts (Map Scripts, Try a bot match) to default to one (page standard S16):
// {gid, kind, na, modes: [{mode, name, bots, orders, risk}], play: [mode], best: mode|null}. bots = the lobby offers bot slots; risk = a RISK key
// (bots cannot really play it); orders = bots also
// send their squads somewhere (false for class combat: no flags, MIS-65); play = bots && orders && !risk, in the card order; best = battle_zones when
// it is in play, else play[0]. na = a lang key when this game is not covered (GoH: the rows are still its cards, unchecked in game)
const PREFER = ['battle_zones', 'captureflag', 'battle_zones_8x8'];
function botModes(ctx, modRaw) {
  const r = readiness(ctx, modRaw);
  const modes = r.rows.map(x => ({ mode: x.mode, name: x.name, bots: !!x.bots, orders: r.kind === 'goh' || x.cls !== 'combat', risk: x.risk || null }));
  const play = modes.filter(x => x.bots && x.orders && !x.risk).map(x => x.mode);
  const best = PREFER.find(m => play.includes(m)) || play[0] || null;
  return { gid: r.gid, kind: r.kind, na: r.kind === 'goh' ? 'bots.modeready.na.goh' : null, modes, play, best };
}
async function botModesRoute(url, body, ctx) { return botModes(ctx, arg(url, body, 'mod')); }

// the Game Modes page's allow route (preview with write false, then write): {ok, state, say, warn, file, copy, needsTest}; a write that
// adds the line keeps the card's bytes before for Undo
const LAST = new Map();   // mod|mode -> true while an Undo is open
const lastKey = (mod, mode) => require('path').resolve(mod).toLowerCase() + '|' + mode;
async function allowRoute(url, body, ctx) {
  body = body || {};
  const mod = arg(url, body, 'mod'), mode = String(body.mode || '').toLowerCase(), write = !!body.write;
  if (!mod) throw bad('bots.modeready.e.needmod');
  const call = w => MODES.routes['POST /api/x/modes/bots'](url, { mod, mode, write: w }, ctx);
  if (!write) return call(false);
  const safe = guard(ctx, M.modCheck(mod, ctx, M.gameOf(ctx)), mode);
  const pre = await call(false);
  if (!pre.ok || pre.state !== 'added') return call(true);
  const U = undo.use();
  U.save(ctx, safe, relOf(mode));
  let j;
  try { j = await call(true); } catch (e) { if (typeof U.drop === 'function') U.drop(ctx, safe, relOf(mode)); throw e; }
  if (typeof U.done === 'function') U.done(ctx, safe, relOf(mode));
  LAST.set(lastKey(safe, mode), true);
  return Object.assign({}, j, { undo: true });
}
// Undo of the last Allow bots in a mode: the card's exact bytes back (or the mod's copy removed when the write made it)
async function undoRoute(url, body, ctx) {
  body = body || {};
  const mod = arg(url, body, 'mod'), mode = String(body.mode || '').toLowerCase();
  if (!mod) throw bad('bots.modeready.e.needmod');
  if (!/^[a-z0-9_]+$/.test(mode)) throw bad('modes.e.mode');
  const safe = guard(ctx, M.modCheck(mod, ctx, M.gameOf(ctx)), mode), U = undo.use(), rel = relOf(mode);
  if (!LAST.get(lastKey(safe, mode))) throw E('e.noUndo');
  const why = typeof U.check === 'function' ? U.check(ctx, safe, rel) : null;
  if (why) throw E(why === 'undo.changed' ? 'e.changed' : 'e.noUndo', { mode });
  let r;
  try { r = U.restore(ctx, safe, rel); } catch (e) { const c = String((e && e.code) || ''); throw E(/changed/.test(c) ? 'e.changed' : 'e.noUndo', { mode }); }
  LAST.delete(lastKey(safe, mode));
  return { ok: true, mode, action: (r && r.action) || 'restored' };
}

module.exports = {
  id: 'modeready', group: 'C', order: 10,
  routes: {
    'GET /api/x/bots/modeready/list': listRoute,
    'GET /api/x/bots/modeready/botmodes': botModesRoute,
    'POST /api/x/bots/modeready/allow': allowRoute,
    'POST /api/x/bots/modeready/undo': undoRoute,
  },
  lang: require('./lang'),
  script: require('./client'),
  _t: { readiness, botModes, namesIn, namesOf, armyModeOf, whyOf, plainOf, KNOWN_NAMES },
};
