// recipe "make or change a mission (game mode)": on a picked multiplayer map, add a stock mode it lacks or a new mode of your own
// (gen mission-clone), set the sides, goals and rules of that mode's card (gen set rows on set/multiplayer/games/<mode>.set), its
// economy and buy limits (gen preset on the lobby presets), add new units to buy (list lines that branch to the vehicle, soldier and
// squad recipes), hand armies and bots to their own tasks, and hand the mission file (.mi) to the game editor.
// Contract: ../README.md. Author: Imperator_Aug (ARSENAL, RECIPE-MAP)
// Author: Imperator_Aug (ARSENAL, ia-8f2e356f)
'use strict';
const M = require('./map.recipe')._t;
const GOH = () => require('./mission.goh');

const FROM = ['combat', 'battle_zones', 'battle_zones_8x8', 'captureflag', 'frontline'];
const TO = ['combat', 'battle_zones', 'captureflag'];
const FROM_MODE = ['combat', 'battle_zones', 'captureflag', 'cooperative', 'frontline'];
const MODE_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
const OPTS = ['preparationTime', 'friendlyFire', 'fogOfWar', 'showPiercing', 'showDamageReports', 'useUnitLevelRestrictions'];
const ENTRY_RE = /^\s*(-?)\s*([A-Za-z0-9_^|.\-]+|\*)\s*(?:=\s*(-?\d+(?:\.\d+)?|%[a-z]+))?\s*$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const cardKey = m => 'resource/set/multiplayer/games/' + m + '.set';
const yes = v => v === true || v === 'true' || v === 1 || v === '1';
const ALLY_KEY = 'resource/set/multiplayer/games/preset_alliances.inc';

// the values of a mode card that the questions ask about
function cardOf(game, mod, mode) {
  const b = M.readKey(game, mod, cardKey(mode));
  if (!b) return null;
  const t = M.live(b.toString('latin1'));
  const val = k => { const m = new RegExp('\\{\\s*' + k + '\\s+("[^"]*"|[^\\s{}]+)', 'i').exec(t); return m ? m[1].replace(/^"|"$/g, '') : null; };
  const flag = k => new RegExp('\\{\\s*' + k + '\\s*\\}', 'i').test(t);
  const pm = /\{\s*parameters\s+"([^"]*)"/i.exec(t), params = {};
  if (pm) for (const kv of pm[1].split(';')) { const i = kv.indexOf('='); if (i > 0) params[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  const n = k => { const v = val(k); return v != null && isFinite(+v) ? +v : null; };
  const rk = /\{\s*ranked\s*\{\s*enabled\s*(\d)?\s*\}/i.exec(t), oa = /\{\s*optionsAdvanced\s+([^{}]*)\}/i.exec(t), dur = /\{\s*gameDuration\s+"(\d+)\s*min"/i.exec(t);
  const top = k => { const x = topVal(t, k); return x != null && isFinite(+x) ? +x : null; };
  return { text: t, hasParams: !!pm, params, paramOrder: pm ? pm[1].split(';').map(s => s.split('=')[0].trim()).filter(Boolean) : [],
    score: n('scoreFinal'), fog: val('fogOfWar'), friendly: flag('friendlyFire'), prep: n('preparationTime'), impregnable: n('impregnableTimeout'),
    showhits: flag('showPiercing') && flag('showDamageReports'), unitlevel: n('useUnitLevelRestrictions') === 1, flora: n('floraRespawn') === 1,
    bots: flag('enableBots'), armies: val('armySelectionMode'), teamsMode: val('teamsMode'), equalize: flag('equalizeTeams'), hasRanked: /\{\s*ranked\b/i.test(t), ranked: !!rk && rk[1] !== '0',
    options: oa ? oa[1].trim().split(/\s+/).filter(Boolean) : [], duration: dur ? +dur[1] : null, veterancy: val('veterancyMode'), resourceAmount: n('resourceAmount'),
    order: top('order'), minPlayers: top('minPlayers'), maxPlayers: top('maxPlayers') };
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
// the text of the first brace block whose head matches re
function blockOf(t, re) {
  const m = t ? re.exec(t) : null; if (!m) return null;
  for (let j = m.index, d = 0; j < t.length; j++) {
    const ch = t[j];
    if (ch === '"') { j = t.indexOf('"', j + 1); if (j < 0) break; continue; }
    if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return t.slice(m.index, j + 1); }
  }
  return null;
}
// the two teams of a card: {teamSettings {teams {"a" {title}{armies "x y"}{minTeamSlots}{maxTeamSlots}{aiTeamPlayers}}}}
const TEAM_KEYS = { title: 'title', armies: 'armies', min_slots: 'minTeamSlots', max_slots: 'maxTeamSlots', ai: 'aiTeamPlayers' };
function teamsOf(text) {
  const tb = blockOf(blockOf(text, /\{\s*teamSettings\b/i), /\{\s*teams\b/i), out = {};
  for (const s of ['a', 'b']) {
    const sb = blockOf(tb, new RegExp('\\{\\s*"' + s + '"', 'i')), o = { has: !!sb };
    for (const [q, k] of Object.entries(TEAM_KEYS)) { const m = sb && new RegExp('\\{\\s*' + k + '\\s+("[^"]*"|[^\\s{}]+)', 'i').exec(sb.slice(1)); o[q] = m ? m[1].replace(/^"|"$/g, '') : null; }
    out[s] = o;
  }
  return out;
}
// the alliances every mode includes (preset_alliances.inc): {"axis" {armies "ger"} {armies "jap"} ..}
const ALLIES = ['axis', 'allies'];
function alliancesOf(game, mod, mods) {
  const b = M.readKey(game, mod, ALLY_KEY, mods), t = b ? M.live(b.toString('latin1')) : '', out = {};
  for (const a of ALLIES) {
    const bl = blockOf(t, new RegExp('\\{\\s*"' + a + '"', 'i'));
    const lines = bl ? [...bl.matchAll(/\{\s*armies\s+"([^"]*)"/gi)].map(m => m[1].trim().split(/\s+/).filter(Boolean)) : null;
    out[a] = lines ? { lines, ids: lines.flat() } : null;
  }
  return out;
}
function armiesKnown(game, mod, mods) { return M.keysUnder(game, mod, 'resource/set/multiplayer/armies/', mods).map(k => k.split('/').pop().replace(/\.set$/i, '')).filter(Boolean); }
const PARAM = { freeze_time: 'freezeTime', capture_time: 'flag_capture_time', release_time: 'flag_release_time', capture_factor: 'flag_capture_factor' };

// ---- economy: the lobby presets of a mode. A card with its own (define ..) presets (captureflag) holds them; the others include
// presets.inc, whose presets_all.inc holds the "all units" presets standard_all and custom_all
const ECO = {
  unitset: { path: 'unitset', kind: 'text' }, command_points: { path: 'commandPoints', kind: 'list' }, unit_limits: { path: 'unitLimits', kind: 'list' },
  charge_factors: { path: 'chargeFactors', kind: 'list' }, balance_cp: { path: 'balancingFactorBonus/cp', kind: 'num' }, balance_mp: { path: 'balancingFactorBonus/mp', kind: 'num' },
  budget_mode: { path: 'budgets/vehicle/mode', kind: 'text' }, money_start: { path: 'budgets/vehicle/resource/start', kind: 'num' }, money_finish: { path: 'budgets/vehicle/resource/finish', kind: 'num' },
  grow_time: { path: 'budgets/vehicle/resource/growTime', kind: 'num' }, money_min: { path: 'budgets/vehicle/resource/limitmin', kind: 'num' }, money_max: { path: 'budgets/vehicle/resource/limitmax', kind: 'num' },
  payback_cp: { path: 'budgets/vehicle/resource/payback/cp', kind: 'text' }, payback_restore: { path: 'budgets/vehicle/resource/payback/restore', kind: 'text' },
  // add: keys no vanilla standard or custom preset has; gen preset adds them under a parent the preset has
  grow_factors: { path: 'common/growFactors', kind: 'pairs', add: true }, money_period: { path: 'budgets/vehicle/resource/period', kind: 'num', add: true },
  money_speed: { path: 'budgets/vehicle/resource/speed', kind: 'num', add: true },
};
function presetFile(game, mod, mode) {
  const c = cardOf(game, mod, mode);
  if (c && /\(\s*define\s+"/i.test(c.text)) return { file: mode + '.set', key: cardKey(mode) };
  return { file: 'presets_all.inc', key: 'resource/set/multiplayer/games/presets_all.inc' };
}
// one (define "name" ..) body as text
function defineOf(game, mod, key, name) {
  const b = M.readKey(game, mod, key); if (!b) return null;
  const t = M.live(b.toString('latin1')), i = t.search(new RegExp('\\(\\s*define\\s+"' + name + '"', 'i'));
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < t.length; j++) { const ch = t[j]; if (ch === '(' || ch === '{') d++; else if (ch === ')' || ch === '}') { d--; if (!d) break; } else if (ch === '"') { j = t.indexOf('"', j + 1); if (j < 0) break; } }
  return t.slice(i, j + 1);
}
// the economy values of one preset (paths as ECO), read loosely from its text
function ecoOf(text) {
  const out = {}; if (!text) return out;
  const blk = name => { const i = text.search(new RegExp('\\{\\s*' + name + '\\b', 'i')); if (i < 0) return ''; let d = 0, j = i; for (; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}') { d--; if (!d) break; } } return text.slice(i, j + 1); };
  const one = (t, k) => { const m = new RegExp('\\{\\s*' + k + '\\s+("[^"]*"|[^\\s{}]+)', 'i').exec(t); return m ? m[1].replace(/^"|"$/g, '') : null; };
  const us = blk('unitset'); out.unitset = one(us, 'value');
  const cp = one(text, 'commandPoints'); out.command_points = cp != null ? cp.split(';').map(s => s.trim()).filter(Boolean) : null;
  const ul = one(text, 'unitLimits'); out.unit_limits = ul != null ? ul.split(';').map(s => s.trim()).filter(Boolean) : null;
  const cf = one(blk('chargeFactors'), 'value'); out.charge_factors = cf != null ? cf.split(';').map(s => s.trim()).filter(Boolean) : null;
  const bf = blk('balancingFactorBonus'); out.balance_cp = numOr(one(bf, 'cp')); out.balance_mp = numOr(one(bf, 'mp'));
  const veh = blk('vehicle'), res = (() => { const i = veh.search(/\{\s*resource\b/i); if (i < 0) return ''; let d = 0, j = i; for (; j < veh.length; j++) { if (veh[j] === '{') d++; else if (veh[j] === '}') { d--; if (!d) break; } } return veh.slice(i, j + 1); })();
  out.budget_mode = one(veh, 'mode');
  const gf = one(blk('common') || text, 'growFactors'); out.grow_factors = gf != null ? gf.split(';').map(s => s.trim()).filter(Boolean) : null;
  out.money_period = numOr(one(res, 'period')); out.money_speed = numOr(one(res, 'speed'));
  for (const [q, k] of [['money_start', 'start'], ['money_finish', 'finish'], ['grow_time', 'growTime'], ['money_min', 'limitmin'], ['money_max', 'limitmax']]) out[q] = numOr(one(res, k));
  const pb = blk('payback'); out.payback_cp = (one(pb, 'cp') || '').replace(/\s+/g, ' ').trim() || null; out.payback_restore = (one(pb, 'restore') || '').replace(/\s+/g, ' ').trim() || null;
  return out;
}
function numOr(v) { return v != null && isFinite(+v) ? +v : null; }
// list answers as gen preset merge entries: changed or new lines tag=n, removed tags -tag; lines left as they are give nothing
function listMerge(before, after, what) {
  const tag = s => String(s).split('=')[0].trim().replace(/^-/, '').toLowerCase(), b = new Map((before || []).map(s => [tag(s), String(s).trim()])), out = [], seen = new Set();
  for (const raw of after) {
    const s = String(raw).trim(); if (!s) continue;
    const m = ENTRY_RE.exec(s); if (!m) throw bad(what + ': each line reads name=number, or -name to remove it. This one does not: ' + s.slice(0, 60));
    const t = m[2].toLowerCase(); seen.add(t);
    if (m[1]) { out.push('-' + m[2]); continue; }
    if (m[3] == null) throw bad(what + ': ' + s + ' needs =number.');
    if (b.get(t) && b.get(t).replace(/\s+/g, '') === s.replace(/\s+/g, '')) continue;
    if (/^%/.test(m[3])) throw bad(what + ': ' + s + ': a %name value comes from the lobby choice; leave that line as it was.');
    out.push(m[2] + '=' + m[3]);
  }
  for (const [t, s] of b) if (!seen.has(t)) out.push('-' + s.split('=')[0].trim());
  return out;
}

const Q = (id, kind, extra) => Object.assign({ id, kind, ask: 'task.mission.q.' + id, help: 'task.mission.h.' + id }, extra);
const UNIT_KINDS = ['vehicle', 'soldier', 'squad'];
// army lines: a picked army (the lobby name is shown, the tag is kept) or a typed tag
const ARMY_PICK = { sources: ['keep', 'exist', 'value'], lookup: 'army' };
const armyList = v => [].concat(v == null ? [] : v).join(' ').split(/\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
// one question per team key and team (a, b): a set row on game/teamSettings/teams/"a"/<key>
const TEAM_QS = [].concat(...['a', 'b'].map(s => [
  Q('team_' + s + '_title', 'text', { covers: ['teams.team.title'], optional: true, limits: { re: '^[A-Za-z0-9_/.\\-]{0,80}$' } }),
  Q('team_' + s + '_armies', 'list', { covers: ['teams.team.armies'], optional: true, limits: { re: '^[a-z0-9_]{1,24}$' }, picker: ARMY_PICK }),
  Q('team_' + s + '_min_slots', 'number', { covers: ['teams.team.slots'], optional: true, limits: { min: 0, max: 8, step: 1, limit: 'MIS-18' } }),
  Q('team_' + s + '_max_slots', 'number', { covers: ['teams.team.slots'], optional: true, limits: { min: 0, max: 8, step: 1, limit: 'MIS-18' } }),
  Q('team_' + s + '_ai', 'number', { covers: ['teams.team.ai'], optional: true, limits: { min: 0, max: 8, step: 1 } }),
]));
const CARD = { newmode: false };
const ECOW = { newmode: false, eco_on: true };

module.exports = {
  id: 'mission',
  verbs: ['make', 'change'],
  // GoH (mission.goh.js): the rules of a mode the map has (or adds as a copy of the same engine class), in its GoH mode card, through the recipe's own route, plus a new mode,
  // teams, alliances and lobby money start and finish; units and the other money keys are hidden there ($game)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 131,
  title: { make: 'task.mission.t', change: 'task.mission.tc' },
  test: 'task.mission.test',
  census: 'mission',
  base: { lookup: 'map' },
  groups: [
    { id: 'mode', title: 'task.mission.g.mode', essential: true, q: [
      Q('from', 'misfrom', { covers: ['source.from'], limits: { values: FROM } }),
      Q('newmode', 'yesno', {}),
      Q('with_mode', 'id', { covers: ['source.with_mode'], limits: { re: '^[a-z0-9][a-z0-9_]{0,39}$', limit: 'MAP-22' }, when: { newmode: true } }),
      Q('from_mode', 'choice', { covers: ['source.from_mode', 'card.class'], limits: { values: FROM_MODE, limit: 'MIS-19' }, when: { newmode: true } }),
      Q('to', 'choice', { covers: ['source.to'], limits: { values: TO, limit: 'MIS-62' }, when: { newmode: false } }),
      // GoH: the mode card to change (a mode the map has)
      Q('goh_mode', 'choice', { covers: ['source.to'], limits: { values: ['battle_zones', 'ammunition', 'campaign_capture_the_flag', 'evacuation', 'frontlines', 'cooperative'] }, when: { $game: ['goh'] } }),
    ] },
    { id: 'text', title: 'task.mission.g.text', essential: true, q: [
      Q('mode_title', 'text', { covers: ['source.title', 'text.mode_title'], limits: { re: '^[^\\r\\n"]{1,80}$', limit: 'LOC-24' }, when: { newmode: true } }),
    ] },
    { id: 'sides', title: 'task.mission.g.sides', essential: false, q: [
      Q('armies', 'choice', { covers: ['teams.armyselection'], limits: { values: ['alliance', 'team', 'player', 'default'] } }),
      Q('teams_mode', 'choice', { covers: ['teams.mode'], limits: { values: ['normal', 'teammatch', 'deathmatch', 'default', 'none'] } }),
      Q('equalize', 'yesno', { covers: ['teams.equalize'] }),
      Q('card_order', 'number', { covers: ['card.order'], optional: true, limits: { min: 0, max: 1000, step: 1 } }),
      Q('card_minplayers', 'number', { covers: ['card.minplayers'], limits: { min: 1, max: 16, step: 1, limit: 'MAP-02' }, optional: true }),
      Q('card_maxplayers', 'number', { covers: ['card.maxplayers'], limits: { min: 2, max: 16, step: 2, limit: 'MAP-02' }, optional: true }),
      Q('bots', 'yesno', { covers: ['card.enablebots'], limits: { limit: 'MIS-65' } }),
      Q('card_ranked', 'yesno', { covers: ['card.ranked'], limits: { limit: 'MAP-11' } }),
      Q('army_task', 'thing', { covers: ['teams.armies'], optional: true, picker: { sources: ['keep', 'branch'], branch: 'army', order: 'before' } }),
      Q('bots_task', 'thing', { covers: ['preset.bots'], optional: true, picker: { sources: ['keep', 'branch'], branch: 'bots', order: 'after' } }),
    ] },
    { id: 'goals', title: 'task.mission.g.goals', essential: false, q: [
      Q('flags', 'number', { covers: ['source.flags'], limits: { min: 1, max: 9, step: 1, limit: 'MAP-34' }, when: { newmode: false, to: 'battle_zones' } }),
      Q('score', 'number', { covers: ['card.score'], limits: { min: 25, max: 10000, step: 25, usual: [100, 500], limit: 'MIS-63' }, when: { newmode: false, to: ['combat', 'battle_zones'] } }),
      Q('duration', 'number', { covers: ['card.gameduration'], limits: { min: 10, max: 120, step: 5, unit: 'min' }, when: { newmode: false, to: 'combat' } }),
      Q('freeze_time', 'number', { covers: ['rules.freezetime', 'card.parameters'], limits: { min: 0, max: 600, step: 5, unit: 's', limit: 'MIS-69' }, when: { newmode: false, to: ['combat', 'captureflag'] } }),
      Q('capture_time', 'number', { covers: ['rules.flag_capture_time', 'card.parameters'], limits: { min: 1, max: 1200, step: 1, usual: [50, 300], unit: 's', limit: 'MIS-63' }, when: { newmode: false, to: ['battle_zones', 'captureflag'] } }),
      Q('release_time', 'number', { covers: ['rules.flag_release_time'], limits: { min: 1, max: 1200, step: 1, usual: [10, 90], unit: 's', limit: 'MIS-69' }, when: { newmode: false, to: ['battle_zones', 'captureflag'] } }),
      Q('capture_factor', 'number', { covers: ['rules.flag_capture_factor'], limits: { min: 0.05, max: 1, step: 0.05, usual: [0.5, 0.9], limit: 'MIS-69' }, when: { newmode: false, to: ['battle_zones', 'captureflag'] } }),
      // GoH: scoreFinal of the card (added when the card lacks it: every card is read with it)
      Q('goh_score', 'number', { covers: ['card.score'], optional: true, limits: { min: 25, max: 100000, step: 25 }, when: { $game: ['goh'] } }),
      // GoH: gameDuration of the card, a length of the game's lobby list (10 to 120 min)
      Q('goh_duration', 'number', { covers: ['card.gameduration'], optional: true, limits: { min: 10, max: 120, step: 5, unit: 'min' }, when: { $game: ['goh'] } }),
    ] },
    { id: 'rules', title: 'task.mission.g.rules', essential: false, q: [
      Q('fog', 'choice', { covers: ['card.fogofwar'], limits: { values: ['fog_off', 'fog_realistic'] } }),
      Q('friendly', 'yesno', { covers: ['card.friendlyfire'] }),
      Q('prep', 'number', { covers: ['card.preparationtime'], limits: { min: 0, max: 60, step: 1, unit: 's' }, when: { newmode: false, to: ['combat', 'battle_zones'] } }),
      // GoH: preparationTime of the card (the game's cards use 15 to 1200)
      Q('goh_prep', 'number', { covers: ['card.preparationtime'], optional: true, limits: { min: 0, max: 3600, step: 1, unit: 's' }, when: { $game: ['goh'] } }),
      Q('impregnable', 'number', { covers: ['card.impregnable'], limits: { min: 0, max: 120, step: 1, unit: 's' } }),
      Q('showhits', 'yesno', { covers: ['card.showpiercing'] }),
      Q('unitlevel', 'yesno', { covers: ['card.unitlevel'] }),
      Q('flora', 'yesno', { covers: ['card.florarespawn'] }),
      Q('lobby_options', 'text', { covers: ['card.optionsadvanced'], optional: true, limits: { re: '^[A-Za-z ]{0,200}$' } }),
      Q('veterancy', 'choice', { covers: ['card.veterancymode'], limits: { values: ['keep', 'all', 'beginners', 'veterans'] } }),
      Q('resource_amount', 'number', { covers: ['card.resourceamount'], optional: true, limits: { min: 0, max: 1000000, step: 100, limit: 'MIS-17' } }),
    ] },
    { id: 'economy', title: 'task.mission.g.economy', essential: false, q: [
      Q('eco_on', 'yesno', { when: CARD }),
      Q('eco_preset', 'choice', { limits: { values: ['standard', 'custom', 'both'] }, when: ECOW }),
      Q('unitset', 'text', { covers: ['preset.unitset'], limits: { re: '^[A-Za-z0-9_^|]{1,120}$', limit: 'MIS-03' }, when: ECOW }),
      Q('command_points', 'list', { covers: ['preset.commandpoints'], optional: true, limits: { re: ENTRY_RE.source, limit: 'MIS-22' }, when: ECOW }),
      Q('unit_limits', 'list', { covers: ['preset.unitlimits'], optional: true, limits: { re: ENTRY_RE.source, limit: 'MIS-04' }, when: ECOW }),
      Q('charge_factors', 'list', { covers: ['preset.chargefactors'], optional: true, limits: { re: ENTRY_RE.source }, when: ECOW }),
      Q('balance_cp', 'number', { covers: ['preset.balancingfactorbonus'], limits: { min: 0, max: 5, step: 0.05, limit: 'MIS-02' }, when: ECOW }),
      Q('balance_mp', 'number', { covers: ['preset.balancingfactorbonus'], limits: { min: 0, max: 5, step: 0.05, limit: 'MIS-02' }, when: ECOW }),
      Q('budget_mode', 'choice', { covers: ['budget.mode'], limits: { values: ['standard', 'custom', 'with_update', 'without_update', 'fullpayback'], limit: 'MIS-17' }, when: ECOW }),
      Q('money_start', 'number', { covers: ['budget.start'], limits: { min: 0, max: 100000, step: 10 }, when: ECOW }),
      Q('money_finish', 'number', { covers: ['budget.finish'], limits: { min: 0, max: 100000, step: 10 }, when: ECOW }),
      Q('grow_time', 'number', { covers: ['budget.growtime'], limits: { min: 0, max: 36000, step: 10, unit: 's' }, when: ECOW }),
      Q('money_min', 'number', { covers: ['budget.limits'], limits: { min: 0, max: 1000000, step: 100 }, when: { newmode: false, eco_on: true, eco_preset: 'custom' } }),
      Q('money_max', 'number', { covers: ['budget.limits'], limits: { min: 0, max: 1000000, step: 100 }, when: { newmode: false, eco_on: true, eco_preset: 'custom' } }),
      Q('payback_cp', 'text', { covers: ['budget.payback'], optional: true, limits: { re: '^\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?){0,19}\\s*$', limit: 'MIS-06' }, when: { newmode: false, eco_on: true, to: ['combat', 'battle_zones'] } }),
      Q('payback_restore', 'text', { covers: ['budget.payback'], optional: true, limits: { re: '^\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?){0,19}\\s*$', limit: 'MIS-06' }, when: { newmode: false, eco_on: true, to: ['combat', 'battle_zones'] } }),
      // keys no vanilla standard or custom preset has: gen preset adds them under a parent the preset has (GEN_PRESET_KEY_ADDED)
      Q('grow_factors', 'list', { covers: ['budget.growfactors'], optional: true, limits: { re: '^\\s*\\d+(\\.\\d+)?\\s*/\\s*\\d+(\\.\\d+)?\\s*$' }, when: ECOW }),
      Q('money_period', 'number', { covers: ['budget.period'], optional: true, limits: { min: 0, max: 3600, step: 1, unit: 's', limit: 'MIS-17' }, when: { newmode: false, eco_on: true, budget_mode: ['with_update', 'without_update'] } }),
      Q('money_speed', 'number', { covers: ['budget.period'], optional: true, limits: { min: 0, max: 1000, step: 0.1, limit: 'MIS-17' }, when: { newmode: false, eco_on: true, budget_mode: 'with_update' } }),
    ] },
    { id: 'teams', title: 'task.mission.g.teams', essential: false, q: TEAM_QS.concat([
      Q('alliance_axis', 'list', { covers: ['teams.alliances'], optional: true, limits: { re: '^[a-z0-9_]{1,24}$' }, picker: ARMY_PICK }),
      Q('alliance_allies', 'list', { covers: ['teams.alliances'], optional: true, limits: { re: '^[a-z0-9_]{1,24}$' }, picker: ARMY_PICK }),
    ]) },
    { id: 'units', title: 'task.mission.g.units', essential: false, q: [
      Q('units', 'list', { covers: ['unit.entry'], optional: true, limits: { limit: 'MIS-64' }, picker: { sources: ['keep', 'branch'], branch: UNIT_KINDS, order: 'before' } }),
    ] },
    { id: 'editor', title: 'task.mission.g.editor', essential: false, q: [
      Q('editor', 'handoff', { limits: { limit: 'MAP-17' }, picker: { sources: ['keep', 'ext'], ext: ['game-editor'] },
        covers: ['mi.players.count', 'mi.players.diplomacy', 'mi.environment', 'mi.fog', 'mi.azimuth', 'mi.map_point.team', 'mi.map_point.order', 'mi.map_point.phase', 'mi.map_point.zonea', 'mi.map_point.zoneb', 'mi.map_point.show', 'mi.map_point.visor', 'mi.map_point.allow', 'mi.spawn_point.mappoint', 'mi.flag_entities', 'mi.helpers', 'mi.triggers', 'mi.mid'] }),
    ] },
  ],
  kept: [
    // built in
    ['source.map', 'built in: the "what to copy" step (the base map)'],
    ['source.mods', 'built in: taken from the maps list; the copy searches the mods the picked map lives in'],
    ['source.target', 'built in: set from the game in the header'],
    ['source.src', 'built in: only for ports from Gates of Hell paks (the GoH port command), not for an Assault Squad 2 mode'],
    ['test.map', 'built in: the Test step starts a match on the map and mode'],
    ['test.inst', 'built in: the Test step hands over to the Play page'],
    ['test.lint', 'built in: the Check step runs the mission linter'],
    // meaning not proven
    ['rules.points_table', '[I] what each points_table pair does is not proven (census tag I)'],
    ['card.mission_options', '[I] no vanilla card has it; what the .mi reads from it is not proven (census tag I)'],
    ['card.difficulty', '[I] multiplayer is the only value known; what other values name is not proven'],
    ['budget.tag', '[I] what the hero budget tag (special) does is not proven'],
    // the engine never reads it
    ['budget.restore', 'no effect: restoreBegin and restoreEnd are written and never read (MIS-14 [V]); a question would change nothing'],
    // no tool step yet
    ['source.flag_zone', 'no tool step yet: gen mission-clone has no flag_zone (mission-clone --flag-zone is CLI only)'],
    ['source.no_bots', 'built in: a new mode made from a mission without flags gets no_bots by itself (bots need flags, MIS-65)'],
    ['source.obs_fix', 'no tool step yet: gen mission-clone has no obs_fix (mission-clone --obs-fix is CLI only)'],
    ['preset.gamemode', '[I] what values the lobby menu keys gameMode, unitMode and specMode of a {presets} entry take is not proven'],
    ['preset.apply', 'no tool step yet: apply, common and teams are the shape of a preset; gen preset sets values inside them (the economy questions)'],
    ['misgen.mode', 'no tool step yet: misgen (a new captureflag mission from a spec) is CLI only'],
    ['misgen.sides', 'no tool step yet: misgen is CLI only'],
    ['misgen.flag', 'no tool step yet: misgen is CLI only'],
    ['misgen.spawns', 'no tool step yet: misgen is CLI only'],
    ['misgen.environment', 'no tool step yet: misgen is CLI only'],
    ['misgen.prepare_margin', 'no tool step yet: misgen is CLI only'],
    ['misgen.force', 'no tool step yet: misgen is CLI only'],
  ],
  checklist: ['task.mission.c.lobby', 'task.mission.c.start', 'task.mission.c.flags', 'task.mission.c.bots', 'task.mission.c.end', 'task.mission.c.money', 'task.mission.c.units'],
  lookups: { map: M.lookupMap, army: require('./army.recipe').lookups.army },
  // preselected answers: the first stock mode of the map and what its card and lobby presets say now
  values: async (ctx, base, opt) => {
    const out = { from: 'combat', newmode: false, to: 'combat', from_mode: 'combat', flags: 3, mode_title: '', with_mode: '', eco_on: false, eco_preset: 'standard' };
    if (M.gidOf(ctx, opt && opt.game) === 'goh') return GOH().values(ctx, base, opt, out);
    const key = M.mapKeyOf(base && base.id), g = M.gameView(ctx, opt && opt.game), mod = ctx.mod || '';
    if (!key || !g) return out;
    const modes = M.modesOf(g, mod, key, M.modsOf(base), base);
    const from = ['battle_zones', 'combat', 'captureflag', 'battle_zones_8x8', 'frontline'].find(m => modes.includes(m)) || 'combat';
    out.from = out.to = from;
    // make: a stock mode the map lacks, else a mode of its own; change (or no verb): the first stock mode it has
    if (opt && opt.verb === 'make') { const lack = TO.find(m => !modes.includes(m)); if (lack) out.to = lack; else out.newmode = true; }
    out.from_mode = FROM_MODE.includes(from) ? from : 'battle_zones';
    out.with_mode = (key.split('/').pop().replace(/[^a-z0-9_]/g, '_') + '_' + from).slice(0, 34) + '_new';
    out.mode_title = 'My ' + from.replace(/_/g, ' ');
    const inf = M.infoOf(M.readKey(g, mod, 'resource/' + key + '/map.info', M.modsOf(base)));
    out.flags = Math.max(1, Math.min(9, (inf.maxPlayers || 2) + 1));
    // a new mode starts as a copy of its class card (with {order 100}); a stock mode has its own card
    const cd = out.newmode ? cardOf(g, mod, out.from_mode) : TO.includes(out.to) ? cardOf(g, mod, out.to) : null;
    if (cd && out.newmode) cd.order = 100;
    if (cd) {
      const tm = teamsOf(cd.text);
      for (const s of ['a', 'b']) for (const k of Object.keys(TEAM_KEYS)) { const x = tm[s][k]; out['team_' + s + '_' + k] = k === 'armies' ? armyList(x) : x == null ? '' : /slots|ai/.test(k) && isFinite(+x) ? +x : x; }
      const al = alliancesOf(g, mod, M.modsOf(base));
      for (const a of ALLIES) if (al[a]) out['alliance_' + a] = al[a].ids;
    }
    if (cd) {
      Object.assign(out, { armies: cd.armies || 'alliance', teams_mode: cd.teamsMode || 'normal', bots: cd.bots, fog: cd.fog || 'fog_realistic', friendly: cd.friendly, impregnable: cd.impregnable == null ? 7 : cd.impregnable,
        showhits: cd.showhits, unitlevel: cd.unitlevel, flora: cd.flora, equalize: cd.equalize, card_ranked: cd.ranked, lobby_options: cd.options.join(' '),
        veterancy: cd.veterancy || 'keep', card_order: cd.order == null ? '' : cd.order, card_minplayers: cd.minPlayers == null ? '' : cd.minPlayers,
        card_maxplayers: cd.maxPlayers == null ? '' : cd.maxPlayers, resource_amount: cd.resourceAmount == null ? '' : cd.resourceAmount });
      if (cd.score != null) out.score = cd.score;
      if (cd.prep != null) out.prep = cd.prep;
      if (cd.duration != null) out.duration = cd.duration;
      for (const [q, p] of Object.entries(PARAM)) if (cd.params[p] != null && isFinite(+cd.params[p])) out[q] = +cd.params[p];
      // match length (combat) and freeze time (combat, captureflag) are shown from the combat card when this card has none
      if (out.duration == null || out.freeze_time == null) { const cc = cardOf(g, mod, 'combat'); if (cc && out.duration == null && cc.duration != null) out.duration = cc.duration; if (cc && out.freeze_time == null && cc.params.freezeTime != null && isFinite(+cc.params.freezeTime)) out.freeze_time = +cc.params.freezeTime; }
      const pf = presetFile(g, mod, out.to), eco = ecoOf(defineOf(g, mod, pf.key, 'standard_all'));
      for (const [q, v] of Object.entries(eco)) if (v != null) out[q] = v;
      if (!/^\d/.test(String(out.money_start || ''))) out.money_start = 160;   // %start: the lobby picks it; 160 is the lowest vanilla start
      if (!/^\d/.test(String(out.money_finish || ''))) out.money_finish = 3000;
    }
    return out;
  },
  compile: (draft, c) => {
    if (M.gidOf(c, c && c.game) === 'goh') return GOH().compile(draft, c);
    const key = M.mapKeyOf(c.base && c.base.id);
    if (!key || !/^map\/(multi|single)\/[a-z0-9_\-./]+$/.test(key) || key.includes('..')) throw bad('Pick the map the mode is played on first.');
    const g = M.compView(c), mod = c.mod, mods = M.modsOf(c.base), ops = [], notes = [], V = c.values || {};
    const modes = M.modesOf(g, mod, key, mods, c.base);
    const from = String(c.value('from') || '');
    if (!FROM.includes(from)) throw bad('Pick the mode to start from.');
    if (!modes.includes(from)) throw bad('This map has no ' + from + ' mode to start from. It has: ' + (modes.join(', ') || 'none') + '.');
    const newmode = yes(c.value('newmode'));
    const asked = id => { const a = c.answer(id); return !!a && a.src !== 'keep'; };
    let mode, cls, flagless = false;
    if (newmode) {
      const w = String(c.value('with_mode') || '').toLowerCase();
      if (!MODE_RE.test(w)) throw bad('The new mode name may hold small English letters, digits and _ only, starting with a letter or digit (1 to 40).');
      if (FROM_MODE.concat(FROM, ['armored_warfare', 'combined_arms']).includes(w)) throw bad('The new mode needs a name of its own, not the name of a game mode (' + w + ') (MAP-22).');
      if (modes.includes(w)) throw bad('This map already has a mode called ' + w + '.');
      flagless = !/"flag_point/i.test((M.readKey(g, mod, 'resource/' + key + '/' + from + '.mi', mods) || Buffer.alloc(0)).toString('latin1'));
      const fm = String(c.value('from_mode') || from);
      if (!FROM_MODE.includes(fm)) throw bad('Pick which game mode the new one plays like.');
      const title = String(c.value('mode_title') == null ? '' : c.value('mode_title')).trim();
      if (title && !/^[^\r\n"]{1,80}$/.test(title)) throw bad('The mode name in the lobby: one line, up to 80 signs, no " sign.');
      const op = { op: 'mission-clone', map: key, from, with_mode: w, from_mode: fm };
      if (title) op.title = title;
      // mission-clone turns bots on in a new mode's card; bots need flags (MIS_BOT_NO_FLAGS, MIS-65), so a mission without them gets no_bots
      if (flagless) { op.no_bots = true; notes.push('The ' + from + ' mission has no flags: the new mode is made without bots (MIS-65).'); }
      if (mods.length) op.mods = mods;
      ops.push(op);
      notes.push('A new mode copies the card of ' + fm + ' into ' + w + '.set (MAP-22); the answers below change that copy.');
      mode = w; cls = fm;
    } else {
      const to = String(c.value('to') || from);
      if (!TO.includes(to)) throw bad('Pick the mode to make or change.');
      mode = cls = to;
      if (!modes.includes(to)) {
        if (to === 'captureflag') { const mp = M.readKey(g, mod, 'resource/' + key + '/map', mods), t = mp ? mp.toString('latin1') : ''; if (!/"captureflaga"/i.test(t) || !/"captureflagb"/i.test(t)) throw bad('This map has no captureflag start areas (captureflaga and captureflagb); the game crashes when the mode starts (MIS-62). Pick another mode.'); }
        const op = { op: 'mission-clone', map: key, from, to };
        if (to === 'battle_zones' && asked('flags')) { const n = Math.round(Number(c.value('flags'))); if (!(n >= 1 && n <= 9)) throw bad('Flags: 1 to 9 (MAP-34).'); op.flags = String(n); }
        if (mods.length) op.mods = mods;
        ops.push(op);
      } else if (asked('flags') && to === 'battle_zones') notes.push('The map already has battle zones: its flags stay where they are. Move or add flags in the game editor (MAP-34).');
    }
    // the card of the mode: one row per changed answer (compared with what the card says now, not with the preselected value)
    const rows = [];
    {
      // a new mode's card is the copy mission-clone makes of its class card: {order 100}, and {enableBots} unless no_bots (then verbatim)
      const cd = cardOf(g, mod, cls);
      if (!cd) throw bad('No card found for the ' + cls + ' mode (' + cardKey(cls) + ').');
      if (newmode) { cd.order = 100; if (!flagless) cd.bots = true; }
      const ent = 'file:' + cardKey(mode);
      const setv = (p, v) => rows.push({ entity: ent, path: p.includes('/') ? p : 'game/settings/' + p, value: String(v), op: 'add' });
      const flag = (p, on, has) => { const full = p.includes('/') ? p : 'game/settings/' + p; if (on && !has) rows.push({ entity: ent, path: full, value: '', op: 'add' }); if (!on && has) rows.push({ entity: ent, path: full, op: 'del' }); };
      const numIn = (id, lo, hi, what) => { const x = Number(String(c.value(id)).replace(',', '.')); if (!isFinite(x) || x < lo || x > hi) throw bad(what + ': ' + lo + ' to ' + hi + '.'); return x; };
      if (asked('armies')) { const v = String(c.value('armies')); if (!['alliance', 'team', 'player', 'default'].includes(v)) throw bad('Pick how players choose armies.'); if (v !== cd.armies) setv('game/teamSettings/armySelectionMode', v); }
      if (asked('teams_mode')) { const v = String(c.value('teams_mode')); if (!['normal', 'teammatch', 'deathmatch', 'default', 'none'].includes(v)) throw bad('Pick how teams are formed.'); if (v !== (cd.teamsMode || 'normal')) setv('game/teamSettings/teamsMode', v); }
      if (asked('equalize')) flag('game/teamSettings/equalizeTeams', yes(c.value('equalize')), cd.equalize);
      const filled = id => asked(id) && c.value(id) != null && String(c.value(id)).trim() !== '';
      if (filled('card_order')) { const x = Math.round(numIn('card_order', 0, 1000, 'Place in the mode list')); if (x !== cd.order) setv('game/order', x); }
      let lo = cd.minPlayers, hi = cd.maxPlayers;
      if (filled('card_minplayers')) { lo = Math.round(numIn('card_minplayers', 1, 16, 'Fewest players in this mode')); if (lo < 2 && cls !== 'cooperative') throw bad('Fewest players in this mode: 2 or more. Only a mode that plays like cooperative may start with 1 player.'); if (lo !== cd.minPlayers) setv('game/minPlayers', lo); }
      if (filled('card_maxplayers')) { hi = Math.round(numIn('card_maxplayers', 2, 16, 'Most players in this mode')); if (hi % 2) throw bad('Most players in this mode: an even number (MAP-02).'); if (hi !== cd.maxPlayers) setv('game/maxPlayers', hi); }
      if (lo != null && hi != null && lo > hi) throw bad('The fewest players in this mode is more than the most players.');
      if (asked('veterancy')) { const v = String(c.value('veterancy')); if (!['keep', 'all', 'beginners', 'veterans'].includes(v)) throw bad('Pick who may join by veterancy.'); if (v !== 'keep' && v !== cd.veterancy) setv('veterancyMode', v); }
      if (filled('resource_amount')) { const x = Math.round(numIn('resource_amount', 0, 1000000, 'Money for a custom game')); if (x !== cd.resourceAmount) setv('resourceAmount', x); }
      if (newmode && flagless && asked('bots') && yes(c.value('bots'))) throw bad('The ' + from + ' mission of this map has no flags: bots in the new mode would buy units and give no orders (MIS-65). Leave bots off, or start from a mode with flags.');
      if (newmode && flagless && cd.bots && !asked('bots')) { flag('enableBots', false, true); notes.push('The ' + cls + ' card has bots on; they are turned off in the new mode, which has no flags (MIS-65).'); }
      if (asked('bots')) { flag('enableBots', yes(c.value('bots')), cd.bots); if (yes(c.value('bots')) && cls === 'combat') notes.push('Bots on combat buy units but give no orders: combat has no flags (MIS-65).'); }
      if (asked('card_ranked')) { const on = yes(c.value('card_ranked')); if (on && !cd.ranked) { if (!cd.hasRanked) rows.push({ entity: ent, path: 'game/ranked', value: '', op: 'add' }); rows.push({ entity: ent, path: 'game/ranked/enabled', value: '', op: 'add' }); } if (!on && cd.ranked) rows.push({ entity: ent, path: 'game/ranked/enabled', op: 'del' }); }
      if (asked('score')) {
        if (cls === 'captureflag') notes.push('Capture the flag has no score limit; the match ends when a flag is taken (MIS-63). Score not changed.');
        else { const x = Math.round(numIn('score', 25, 10000, 'Score to win')); if (x !== cd.score) setv('scoreFinal', x); }
      }
      if (asked('duration')) { const x = Math.round(numIn('duration', 10, 120, 'Match length')); if (x !== cd.duration) setv('gameDuration', '"' + x + ' min"'); }
      if (asked('fog')) { const v = String(c.value('fog')); if (!['fog_off', 'fog_realistic'].includes(v)) throw bad('Fog of war: fog_off or fog_realistic.'); if (v !== cd.fog) setv('fogOfWar', v); }
      if (asked('friendly')) flag('friendlyFire', yes(c.value('friendly')), cd.friendly);
      if (asked('prep')) { const x = Math.round(numIn('prep', 0, 60, 'Preparation time')); if (x !== cd.prep) setv('preparationTime', x); }
      if (asked('impregnable')) { const x = Math.round(numIn('impregnable', 0, 120, 'Spawn protection')); if (x !== cd.impregnable) setv('impregnableTimeout', x); }
      if (asked('showhits')) { const on = yes(c.value('showhits')); for (const p of ['showPiercing', 'showDamageReports']) flag(p, on, new RegExp('\\{\\s*' + p + '\\s*\\}', 'i').test(cd.text)); }
      if (asked('unitlevel')) { const on = yes(c.value('unitlevel')); if (on !== cd.unitlevel) setv('useUnitLevelRestrictions', on ? 1 : 0); }
      if (asked('flora')) { const on = yes(c.value('flora')); if (on !== cd.flora) setv('floraRespawn', on ? 1 : 0); }
      if (asked('lobby_options')) {
        const want = String(c.value('lobby_options') || '').trim().split(/\s+/).filter(Boolean);
        const unknown = want.filter(o => !OPTS.includes(o)); if (unknown.length) throw bad('Lobby options known to the game: ' + OPTS.join(', ') + '. Not known: ' + unknown.join(', ') + '.');
        if (want.join(' ') !== cd.options.join(' ')) setv('optionsAdvanced', want.join(' '));
      }
      // goals inside the parameters string: merged key by key, other keys kept in their order
      const P = Object.assign({}, cd.params), order = cd.paramOrder.slice(); let pch = false;
      for (const [q, p] of Object.entries(PARAM)) {
        if (!asked(q)) continue;
        if (cls === 'combat' && q !== 'freeze_time') { notes.push('Combat has no flags: ' + p + ' not set.'); continue; }
        const x = q === 'capture_factor' ? numIn(q, 0.05, 1, 'Capture factor') : Math.round(numIn(q, q === 'freeze_time' ? 0 : 1, q === 'freeze_time' ? 600 : 1200, 'Time'));
        if (String(P[p]) === String(x)) continue;
        P[p] = String(x); if (!order.includes(p)) order.push(p); pch = true;
      }
      if (pch) rows.push({ entity: ent, path: 'game/parameters', value: '"' + order.map(k => k + '=' + P[k]).join(';') + '"', op: cd.hasParams ? 'set' : 'add' });
      // the two teams of the card (quoted blocks {"a"} {"b"})
      {
        const tm = teamsOf(cd.text), known = armiesKnown(g, mod, mods);
        for (const sd of ['a', 'b']) {
          const T0 = tm[sd], base = 'game/teamSettings/teams/"' + sd + '"/';
          for (const [k, key] of Object.entries(TEAM_KEYS)) {
            const id = 'team_' + sd + '_' + k; if (k === 'armies' ? !asked(id) || !armyList(c.value(id)).length : !filled(id)) continue;
            let v = k === 'armies' ? armyList(c.value(id)).join(' ') : String(c.value(id)).trim();
            if (k === 'title') { if (!/^[A-Za-z0-9_/.\-]{1,80}$/.test(v)) throw bad('Team ' + sd + ' name: a text key such as mp/alliance/axis, with no spaces (letters, digits, _ / . -). For a name of your own, add a text key with the text task first and type that key here.'); if (v === T0.title) continue; v = '"' + v + '"'; }
            else if (k === 'armies') {
              const ids = v.split(/\s+/).filter(Boolean), unk = known.length ? ids.filter(x => !known.includes(x)) : [];
              if (!ids.length || ids.some(x => !/^[a-z0-9_]{1,24}$/.test(x))) throw bad('Team ' + sd + ' armies: pick one army per line.');
              if (unk.length) throw bad('Team ' + sd + ' armies: no army ' + unk.join(', ') + ' in set/multiplayer/armies (known: ' + known.join(' ') + ').');
              if (ids.join(' ') === String(T0.armies || '').trim().split(/\s+/).join(' ')) continue; v = '"' + ids.join(' ') + '"';
            } else { const x = Math.round(numIn(id, 0, 8, 'Team ' + sd + ' ' + k.replace(/_/g, ' '))); if (String(x) === String(T0[k])) continue; v = String(x); }
            if (!T0.has) throw bad('The ' + cls + ' card has no team ' + sd + ' block to change.');
            rows.push({ entity: ent, path: base + key, value: v, op: 'add' });
          }
          const mn = filled('team_' + sd + '_min_slots') ? +c.value('team_' + sd + '_min_slots') : +T0.min_slots, mx = filled('team_' + sd + '_max_slots') ? +c.value('team_' + sd + '_max_slots') : +T0.max_slots;
          if (isFinite(mn) && isFinite(mx) && mx > 0 && mn > mx) throw bad('Team ' + sd + ': reserved slots are more than the most slots (MIS-18).');
        }
      }
      if (rows.length) { ops.push({ op: 'set', rows }); notes.push(newmode ? 'The card of the new mode ' + mode + ' is set from your answers.' : 'The ' + mode + ' card is changed for every map played in ' + mode + ' while the mod is on.'); }
      // the alliances every mode includes (preset_alliances.inc): add {armies "x"} lines, drop or shorten the lines of removed armies
      {
        const al = alliancesOf(g, mod, mods), known = armiesKnown(g, mod, mods), arows = [];
        for (const a of ALLIES) {
          const q = 'alliance_' + a; if (!asked(q)) continue;
          const now = al[a]; if (!now) throw bad('No "' + a + '" alliance in ' + ALLY_KEY + '.');
          const want = armyList(c.value(q));
          const unk = want.filter(x => !/^[a-z0-9_]{1,24}$/.test(x) || (known.length && !known.includes(x)));
          if (unk.length) throw bad('Alliance ' + a + ': no army ' + unk.join(', ') + ' in set/multiplayer/armies (known: ' + known.join(' ') + ').');
          if (!want.length) throw bad('Alliance ' + a + ' needs at least one army.');
          // removals from the last line up, so the [n] of earlier lines stays right
          for (let i = now.lines.length - 1; i >= 0; i--) {
            const keep = now.lines[i].filter(x => want.includes(x));
            if (keep.length === now.lines[i].length) continue;
            arows.push(keep.length ? { entity: 'file:' + ALLY_KEY, path: '"' + a + '"/armies[' + i + ']', value: '"' + keep.join(' ') + '"', op: 'set' } : { entity: 'file:' + ALLY_KEY, path: '"' + a + '"/armies[' + i + ']', op: 'del' });
          }
          for (const x of want) if (!now.ids.includes(x)) arows.push({ entity: 'file:' + ALLY_KEY, path: '"' + a + '"/armies', value: '"' + x + '"', op: 'add' });
        }
        if (arows.length) { ops.push({ op: 'set', rows: arows }); notes.push('Alliances: preset_alliances.inc is read by every mode, so the change counts for all of them while the mod is on.'); }
      }
      // economy: gen preset on the lobby presets this mode reads
      if (!newmode && yes(c.value('eco_on'))) {
        const pf = presetFile(g, mod, mode), which = String(c.value('eco_preset') || 'standard');
        const name = which === 'both' ? 'all' : which + '_all';
        if (name !== 'all' && !defineOf(g, mod, pf.key, name)) throw bad('The ' + mode + ' mode has no ' + which + ' preset (' + pf.file + '). Pick another preset.');
        const now = ecoOf(defineOf(g, mod, pf.key, name === 'all' ? 'standard_all' : name)), set = {};
        for (const [q, d] of Object.entries(ECO)) {
          if (!asked(q)) continue;
          const v = c.value(q);
          if (d.kind === 'list') { const m = listMerge(now[q], [].concat(v || []), q.replace(/_/g, ' ')); if (m.length) set[d.path] = m.join(';'); continue; }
          const missing = () => notes.push(q.replace(/_/g, ' ') + ': the ' + name + ' preset in ' + pf.file + ' has no such key, and gen preset cannot add one there; not set.');
          if (d.kind === 'pairs') {
            const lines = [].concat(v || []).map(x => String(x).trim()).filter(Boolean);
            const badl = lines.find(x => !/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(x)); if (badl) throw bad('Grow factors: each line reads command points/factor, such as 100/1.2. This one does not: ' + badl.slice(0, 40));
            const val = lines.map(x => x.replace(/\s+/g, '')).join(';');
            if (!val || val === (now[q] || []).join(';')) continue;
            set[d.path] = val; continue;
          }
          if (d.add && (q === 'money_period' || q === 'money_speed')) {
            const x = Number(String(v).replace(',', '.')), bm = String(set['budgets/vehicle/mode'] || now.budget_mode || '');
            if (isFinite(x) && x !== 0 && /^(standard|custom|fullpayback)$/.test(bm)) throw bad(q.replace(/_/g, ' ') + ': a ' + bm + ' budget needs period and speed 0; the match stops with "Invalid parameter value" (MIS-17). Pick the with_update or without_update budget first.');
            if (isFinite(x) && x !== 0 && q === 'money_speed' && bm === 'without_update') throw bad('money speed: a without_update budget needs speed 0 (MIS-17).');
          }
          if (d.kind === 'num') {
            const x = Number(String(v).replace(',', '.')); if (!isFinite(x) || x < 0) throw bad(q.replace(/_/g, ' ') + ': a number 0 or more.');
            if (now[q] === x) continue;
            if (now[q] == null && !['money_start', 'money_finish'].includes(q) && !d.add) { missing(); continue; }   // start and finish hold %start, %finish
            set[d.path] = String(x); continue;
          }
          const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
          if (!s || s === now[q]) continue;
          if (now[q] == null) { missing(); continue; }
          if (/^payback_/.test(q)) set[d.path] = s.split(' ').join('\t');   // TAB separated (MIS-06)
          else set[d.path] = s;
        }
        { const pc = set['budgets/vehicle/resource/payback/cp'] || (now.payback_cp || '').replace(/ /g, '\t'), pr = set['budgets/vehicle/resource/payback/restore'] || (now.payback_restore || '').replace(/ /g, '\t');
          if ((set['budgets/vehicle/resource/payback/cp'] || set['budgets/vehicle/resource/payback/restore']) && pc && pr) {
            const a = pc.split('\t').map(Number), b = pr.split('\t');
            if (a.length !== b.length) throw bad('Payback: the command point steps and the money back steps need the same count (' + a.length + ' and ' + b.length + ') (MIS-06).');
            if (a.some((x, i) => i && x < a[i - 1])) throw bad('Payback: the command point steps must go up (MIS-06).');
          } }
        if (set['budgets/vehicle/mode'] === 'standard' && ((now.money_min || 0) || (now.money_max || 0))) notes.push('A standard budget needs limitmin and limitmax 0 (MIS-17).');
        if (set['budgets/vehicle/resource/limitmin'] && set['budgets/vehicle/resource/limitmax'] && +set['budgets/vehicle/resource/limitmin'] > +set['budgets/vehicle/resource/limitmax']) throw bad('The lowest money is above the highest money.');
        if (Object.keys(set).length) {
          ops.push({ op: 'preset', file: pf.file, name, set });
          notes.push('Economy: the ' + (name === 'all' ? 'standard and custom' : which) + ' presets in ' + pf.file + ' change for every mode that reads them while the mod is on.');
          if (set['budgets/vehicle/resource/start'] || set['budgets/vehicle/resource/finish']) notes.push('A fixed start or finish money replaces the lobby choice (%start, %finish) in every preset of that kind.');
        }
      }
    }
    // new units to buy: each list line that branches is a vehicle, soldier or squad task of its own, which writes its buy entry
    { const a = c.answer('units'), by = {};
      for (const it of (a && a.src === 'list' && a.items) || []) if (it && it.src === 'branch') { const k = UNIT_KINDS.includes(it.recipe) ? it.recipe : 'unit'; by[k] = (by[k] || 0) + 1; }
      for (const [k, n] of Object.entries(by)) notes.push(n + ' new ' + k + (n > 1 ? 's' : '') + ': each one\'s own task adds it to the buy list (MIS-64).'); }
    if (asked('army_task')) notes.push('The new army comes from its own task, before this mode.');
    if (asked('bots_task')) notes.push('Bot levels come from their own task, after this mode.');
    const ed = c.answer('editor');
    if (ed && ed.src === 'ext') notes.push('After Write: 1. Start the game editor (' + M.editorOf(M.gidOf(null, c.game)) + ' in the game folder) with this mod on; this task never starts it. 2. Open the map ' + key.split('/').pop() + '. 3. Load the ' + mode + ' mission (' + mode + '.mi), set flags, start points and triggers, and save. 4. Come back to this task and press Check: it counts the flags and start points (MAP-17).');
    return { gen: ops.length ? { ops } : null, notes, result: key.replace(/^map\//, '') + ':' + mode };
  },
  // after the check view: bots on a mode whose mission has no flags (MIS-65), start points (MAP-23)
  check: async (draft, ctx) => {
    if (M.gidOf(ctx, draft.game) === 'goh') return GOH().check(draft, ctx);
    const g = M.gameView(ctx, draft.game), mod = draft.mod || ctx.mod || '', a = draft.answers || {}, v = x => (a[x] && a[x].src === 'value' ? a[x].value : undefined);
    const key = M.mapKeyOf(draft.base && draft.base.id); if (!key || !g) return [];
    const mode = yes(v('newmode')) ? String(v('with_mode') || '') : String(v('to') || v('from') || '');
    if (!mode) return [];
    const mi = M.readKey(g, mod, 'resource/' + key + '/' + mode + '.mi', M.modsOf(draft.base)), lines = [];
    if (!mi) return [{ title: 'Mission ' + mode, lines: ['No ' + mode + '.mi on ' + key + ' yet: write the task first.'], level: 'warn' }];
    const flags = (M.live(mi.toString('latin1')).match(/"flag_point[^"]*"/gi) || []).length, sp = M.spawnsOf(mi), bots = M.cardBots(g, mod, mode);
    lines.push(flags + ' flags, ' + sp + ' start points marked as spawn points, bots ' + (bots ? 'on' : 'off'));
    const cards = [{ title: 'Mission ' + mode + ' on ' + key, lines, level: 'info' }];
    if (bots && !flags) cards.push({ title: 'Bots without flags', lines: ['Bots are on in ' + mode + ' but the mission has no flags: they buy units and give no orders (MIS-65).'], level: 'warn' });
    return cards;
  },
  // own route: the GoH card write (mission.goh.js route: lib/modwrite, restore point first)
  routes: { 'POST /api/x/task/r/mission/goh': (u, b, ctx) => GOH().route(u, b, ctx) },
  _t: { cardOf, PARAM, ECO, presetFile, defineOf, ecoOf, listMerge, teamsOf, alliancesOf, armiesKnown },
};
// GoH: the mode pick, a new mode of your own, the card keys, teams, alliances, lobby money start and finish and the editor hand-off are
// asked there; every other question (other money keys, units, the AS2 mode questions) is AS2 only (mission.goh.js notes them)
const GOH_ASKED = ['goh_mode', 'goh_score', 'goh_prep', 'goh_duration', 'bots', 'friendly', 'showhits', 'impregnable', 'flora', 'card_order', 'editor', 'newmode', 'with_mode', 'mode_title',
  'armies', 'teams_mode', 'equalize', 'card_minplayers', 'card_maxplayers', 'card_ranked', 'fog', 'unitlevel', 'lobby_options', 'veterancy', 'resource_amount',
  'eco_on', 'eco_preset', 'money_start', 'money_finish', 'alliance_axis', 'alliance_allies'].concat(TEAM_QS.map(q => q.id));
for (const g of module.exports.groups) for (const x of g.q) if (!GOH_ASKED.includes(x.id)) x.when = Object.assign({}, x.when, { $game: ['as64', 'mowas2'] });
