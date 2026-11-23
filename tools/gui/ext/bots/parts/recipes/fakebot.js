// A fake bot host for tests: BotApi as the engine gives it (AI-12, MIS-08: Spawn, CaptureFlag, SayChat, Income, EnemyHasTanks,
// Scene.Flags {name, occupant}, Scene.Squads, IsSquadExists, Instance, Events with ONE handler per event where the first Subscribe
// stays (AI-22), SetQuantTimer / KillQuantTimer on game time), run in luamini. Spawn says yes for an unknown unit and buys nothing
// (MIS-32); it says no while a buy is on its way, during the buy countdown, or when the money is short.
//   sim(opt) -> S   opt: {files: {resourcePath: text} (keys like '/script/multiplayer/bot'), army, team, income (points/s),
//     money, cost: {unit: price} (default 100), known: Set of unit names (default: any name with a price or in opt.known),
//     tanks: bool, flags: [{name, occupant}], countdown (ms between buys, default 3000), quantMs (default 100), random}
//   S.start(args) S.quant(n) S.kill(id) S.flag(name, occupant) S.board(id, bool)   state: S.buys [{unit, t}], S.orders [{squad, flag, t}],
//   S.prints, S.squads (Map id -> unit), S.lua (the luamini run), S.files (the io files), S.handlers
//   opt.goh: the Gates of Hell host (goh-bot-api-*): its event numbers (EV_GOH), Spawn of an unknown unit is a crash (S.crashes, error),
//     IsUnitAvailable, CanSpawn, TimeToSpawnUnit, SeekAndDestroy, QueryScene(tags, s) -> rows {playerId, counts} (opt.enemyPid, S.tanks),
//     Scene:IsSquadTagged (S.tags: Map squad -> Set), Scene.Waypoints (opt.waypoints), Instance gameMode (opt.mode), difficulty, no EnemyHasTanks
// Author: Imperator_Aug (ARSENAL, ia-609f36d5)
'use strict';
const L = require('./luamini');

const EV = { Init: 0, Done: 1, GameStart: 2, GameEnd: 3, Quant: 4, GameSpawn: 5, NonQuant: 6 };
const EV_GOH = { Init: 0, Done: 1, GameStart: 2, PrepTimeOver: 3, WinnerDecided: 4, GameEnd: 5, Quant: 6, GameSpawn: 7, NonQuant: 8, Waypoint: 9 };

function sim(opt) {
  opt = opt || {};
  const EVS = opt.goh ? EV_GOH : EV;
  const S = { t: 0, buys: [], orders: [], prints: [], squads: new Map(), boarded: new Set(), handlers: new Map(), timers: new Map(), money: opt.money || 0,
    pending: null, nextBuy: 0, nid: 100, tanks: !!opt.tanks, income: opt.income == null ? 2 : opt.income, chats: [], crashes: [], tags: new Map(), seeks: [], spawnCalls: [] };
  const flags = (opt.flags || [{ name: 'f1', occupant: 1 }, { name: 'f2', occupant: 0 }, { name: 'f3', occupant: 2 }]).map(f => Object.assign({}, f));
  const cost = u => (opt.cost && opt.cost[u] != null ? opt.cost[u] : 100);
  const known = u => (opt.known ? opt.known.has(u) : true);
  const T = L.toLua;
  let tid = 0;
  const fn = f => args => { const r = f(...args); return r === undefined ? [] : [r]; };
  const Events = T(Object.assign({}, EVS));
  Events.set('Subscribe', fn((self, ev, h) => { if (!S.handlers.has(ev)) S.handlers.set(ev, h); }));
  Events.set('Unsubscribe', fn((self, ev) => { S.handlers.delete(ev); }));
  Events.set('SetQuantTimer', fn((self, f, ms) => { const id = ++tid; S.timers.set(id, { at: S.t + Number(ms), f }); return id; }));
  Events.set('KillQuantTimer', fn((self, id) => { S.timers.delete(id); }));
  Events.set('SetTimer', Events.get('SetQuantTimer'));
  Events.set('KillTimer', Events.get('KillQuantTimer'));
  const Commands = new L.LuaTable();
  Commands.set('Spawn', fn((self, unit, split, ...more) => {
    S.spawnCalls.push({ unit, split, more, t: S.t });   // every call of the real Spawn, with any further arguments
    if (S.pending || S.t < S.nextBuy) return false;
    if (!known(unit)) { if (opt.goh) { S.crashes.push(unit); throw new Error('GoH crash: Spawn of unknown unit ' + unit); } S.prints.push('DBG: Spawning Unit Not found - ' + unit); return true; }
    if (S.money < cost(unit)) return false;
    S.money -= cost(unit); S.pending = unit; S.nextBuy = S.t + (opt.countdown == null ? 3000 : opt.countdown);
    S.buys.push({ unit, t: S.t });
    return true;
  }));
  Commands.set('CaptureFlag', fn((self, squad, flag) => { S.orders.push({ squad, flag, t: S.t }); }));
  Commands.set('SayChat', fn((self, text) => { S.chats.push(text); }));
  Commands.set('Income', fn(() => S.income));
  if (!opt.goh) Commands.set('EnemyHasTanks', fn(() => S.tanks));
  else {
    Commands.set('IsUnitAvailable', fn((self, unit) => known(unit)));
    Commands.set('CanSpawn', fn(() => !S.pending && S.t >= S.nextBuy));
    Commands.set('TimeToSpawnUnit', fn(() => 0));
    Commands.set('SeekAndDestroy', fn((self, squad) => { S.seeks.push(squad); }));
  }
  const Scene = new L.LuaTable();
  Scene.set('IsSquadExists', fn((self, id) => S.squads.has(id) && !S.boarded.has(id)));
  if (opt.goh) {
    Scene.set('IsSquadTagged', fn((self, id, tag) => !!(S.tags.get(id) && S.tags.get(id).has(tag))));
    // one row per other player: {playerId, {count per asked tag}}; the enemy (opt.enemyPid, default 5) has one of the first tag while S.tanks
    Scene.set('QueryScene', fn((self, tags, secs) => { const n = tags instanceof L.LuaTable ? tags.len() : 0, c = []; for (let k = 0; k < n; k++) c.push(S.tanks && k === 0 ? 1 : 0);
      return T([[opt.enemyPid == null ? 5 : opt.enemyPid, c]]); }));
  }
  const Instance = T(Object.assign({ hostId: 7, playerId: opt.playerId == null ? 3 : opt.playerId, team: opt.team == null ? 1 : opt.team, enemyTeam: opt.team === 2 ? 1 : 2, army: opt.army || 'ger' },
    opt.goh ? { ownTeamSize: 2, gameMode: opt.mode || 'battle_zones', difficulty: opt.difficulty || 'normal' } : { teamSize: 2 }));
  const api = new L.LuaTable();
  api.set('Events', Events); api.set('Commands', Commands); api.set('Scene', Scene); api.set('Instance', Instance);
  // Scene.Flags and Scene.Squads: fresh tables on each read, indexed from 2 as the engine's (bot-lua.md)
  Scene.mt = T({});
  Scene.mt.set('__index', (args) => {
    const k = args[1];
    if (k === 'Flags') { const t = new L.LuaTable(); flags.forEach((f, i) => t.set(i + 2, T({ name: f.name, occupant: f.occupant }))); return [t]; }
    if (k === 'Waypoints' && opt.goh) return [T(opt.waypoints || [])];
    if (k === 'Squads') { const t = new L.LuaTable(); let i = 2; for (const id of S.squads.keys()) if (!S.boarded.has(id)) t.set(i++, id); return [t]; }
    return [undefined];
  });
  const files = opt.files || {};
  S.files = new Map();
  S.lua = L.run(files['/script/multiplayer/bot.main'] || 'require([[/script/multiplayer/bot]])', {
    name: 'bot.main', globals: { BotApi: api }, require: p => (files[p] != null ? files[p] : null), print: s => S.prints.push(s),
    random: opt.random || (() => 0.5), env: opt.env || { USERPROFILE: 'C:\\fakehome' }, files: S.files, canOpen: opt.canOpen,
  });
  S.api = api;
  const fire = (ev, args) => { const h = S.handlers.get(ev); if (h) return h([args === undefined ? T({}) : T(args)]); };
  S.fire = fire;
  S.start = args => fire(EVS.GameStart, args || { map: 'test map', difficulty: 'normal' });
  S.end = () => fire(EVS.GameEnd);
  S.tag = (id, tag, on) => { if (!S.tags.has(id)) S.tags.set(id, new Set()); if (on === false) S.tags.get(id).delete(tag); else S.tags.get(id).add(tag); };
  S.quant = n => {
    for (let k = 0; k < (n || 1); k++) {
      S.t += opt.quantMs || 100;
      S.money += S.income * (opt.quantMs || 100) / 1000;
      for (const [id, tm] of [...S.timers]) if (tm.at <= S.t && S.timers.has(id)) { S.timers.delete(id); tm.f([]); }
      // one buy can make several squads (opt.squadsPer {unit: n}, or n for every buy): one SpawnUnit -> two OnGameSpawn in the game (ai-pages-game-checks B [V])
      if (S.pending && S.t >= S.nextBuy - 2000) { const u = S.pending, n = typeof opt.squadsPer === "number" ? opt.squadsPer : (opt.squadsPer && opt.squadsPer[u]) || 1; S.pending = null; for (let k = 0; k < n; k++) { const id = ++S.nid; S.squads.set(id, u); fire(EVS.GameSpawn, { squadId: id }); } }
      fire(EVS.Quant);
    }
  };
  S.seconds = s => S.quant(Math.round(s * 1000 / (opt.quantMs || 100)));
  S.kill = id => { S.squads.delete(id); };
  S.board = (id, on) => { if (on) S.boarded.add(id); else S.boarded.delete(id); };
  S.flag = (name, occ) => { const f = flags.find(x => x.name === name); if (f) f.occupant = occ; };
  S.flags = flags;
  return S;
}
module.exports = { sim, EV, EV_GOH };
