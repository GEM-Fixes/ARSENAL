// Author: Imperator_Aug (ARSENAL, ia-ecc5ac46)
'use strict';
// testplan catalog: every line of the Checks table of tools/testplan/README.md as data.
//   CHECKS = [{id, title, kinds, cls, how, tool, proves, limits, games:{as64,mowas2,goh}, group, ...}]
//   get(id) -> the check or null. ids() -> check ids in table order. KINDS = the item kinds of the contract.
// Fields beyond the contract (additive, used by rows.js and checklist.js):
//   runner   edrun | prove | sweep | null   the runner of a `run` check (README: row.runner)
//   per      'item' | 'weapon' | 'plan'     one row per item, per weapon of an entity, or one for the whole plan
//   needs    'card' | 'weapons' | null      the item must carry cards / weapons to get the row
//   changedOnly  true = only items with source `changed` (the `over` check is about the changed file itself)
//   session  editor | skirmish | mission    the checklist session a player does it in
//   expect   one line: what a pass is
// games[gid] = the way the check is done in that game: static | run | player | no (no row is made).
//   a `run` check is `player` where the game cannot run it: goh (no test game runs) and mowas2 (edrun dry, prove plan: TST-19).
//   sync is as64 only. aim stays static under goh (firecheck reads GoH), faults is `no` there (edrun preflight refuses GoH).

const KINDS = ['entity', 'model', 'weapon', 'ammo', 'breed', 'squad', 'card', 'mission', 'text', 'interface', 'sound', 'script', 'properties', 'other'];
// item kinds whose files are text (parse); model goes through binhdr (binary heads), a sound file has no reader
const PARSED = KINDS.filter(k => k !== 'sound');

const G_STATIC = { as64: 'static', mowas2: 'static', goh: 'static' };
const G_RUN = { as64: 'run', mowas2: 'player', goh: 'player' };
const G_PLAYER = { as64: 'player', mowas2: 'player', goh: 'player' };

function chk(o) {
  return Object.assign({ cls: null, limits: [], runner: null, per: 'item', needs: null, changedOnly: false, session: null }, o,
    { games: Object.assign({}, o.games), kinds: o.kinds.slice(), limits: (o.limits || []).slice() });
}

const CHECKS = [
  chk({ id: 'refs', title: 'Names resolve', kinds: ['entity', 'model', 'weapon', 'ammo', 'breed', 'squad', 'card'], how: 'static', tool: 'refcheck', group: 'files', games: G_STATIC,
    proves: 'every model, weapon, ammo, item, animation, sound, texture, fsm the item names exists in the stack',
    expect: 'every name the item uses exists in the stack' }),
  chk({ id: 'parse', title: 'File reads', kinds: PARSED, how: 'static', tool: 'sdllint, binhdr', group: 'files', games: G_STATIC,
    proves: 'the file reads', expect: 'the file reads with no error' }),
  chk({ id: 'load', title: 'Load verdict', kinds: ['entity', 'model'], how: 'static', tool: 'check', group: 'files', games: G_STATIC,
    proves: 'the mod\'s load verdict for the exe; LIKELY_CRASH and REFUSED fail the rows of the named file',
    expect: 'no LIKELY_CRASH and no REFUSED for this file' }),
  chk({ id: 'aim', title: 'Gun can aim', kinds: ['entity'], cls: ['vehicle', 'gun'], how: 'static', tool: 'firecheck', group: 'guns', games: G_STATIC,
    proves: 'the gun can aim (aim bone, MG swap)', expect: 'the gun has what it needs to aim' }),
  chk({ id: 'faults', title: 'Gun faults', kinds: ['entity'], cls: ['vehicle', 'gun', 'human'], how: 'static', tool: 'edrun preflight', group: 'guns',
    games: { as64: 'static', mowas2: 'static', goh: 'no' },
    proves: 'NOWEAPON NOBONE AMMO MORTARRANGE', expect: 'no NOWEAPON, NOBONE, AMMO or MORTARRANGE fault' }),
  chk({ id: 'card', title: 'Buy card', kinds: ['card', 'squad', 'entity'], needs: 'card', how: 'static', tool: 'statsheet', group: 'cards', games: G_STATIC,
    proves: 'buyable, a price, a name text, crew breeds exist', expect: 'buyable, with a price, a name text and crew breeds that exist' }),
  chk({ id: 'text', title: 'Texts read', kinds: ['text', 'card'], how: 'static', tool: 'lnglint', group: 'files', games: G_STATIC,
    proves: 'keys read, no key lost', expect: 'every key reads and no key is lost' }),
  chk({ id: 'mission', title: 'Mission reads', kinds: ['mission'], how: 'static', tool: 'milint', group: 'mission', games: G_STATIC,
    proves: 'the map and mission read', expect: 'the map and the mission read' }),
  chk({ id: 'over', title: 'What it replaces', kinds: KINDS, changedOnly: true, how: 'static', tool: 'overdiff, conflicts', group: 'files', games: G_STATIC,
    proves: 'what it replaces in the game and in the other mods of the stack (info, fail only on OVR_FILE_DELETED of a file something still names)',
    expect: 'no deleted file that something still names' }),
  chk({ id: 'spawn', title: 'Loads and appears', kinds: ['entity'], how: 'run', runner: 'prove', tool: 'preloadsweep, prove, bootcheck', group: 'units', session: 'editor', games: G_RUN,
    limits: ['TST-19'], proves: 'the entity loads and appears in a match', expect: 'the entity loads and appears in a match' }),
  chk({ id: 'move', title: 'Drives', kinds: ['entity'], cls: ['vehicle'], how: 'run', runner: 'prove', tool: 'prove', group: 'units', session: 'editor', games: G_RUN,
    limits: ['TST-19'], proves: 'it drives', expect: 'it drives' }),
  chk({ id: 'fire', title: 'Gun fires', kinds: ['entity'], per: 'weapon', needs: 'weapons', how: 'run', runner: 'edrun', tool: 'edrun', group: 'guns', session: 'editor', games: G_RUN,
    limits: ['TST-19', 'TST-59', 'TST-73', 'TST-74', 'TST-112', 'TST-114'],
    proves: 'the gun fires: fireProof muzzle or hit, shots > 0', expect: 'the gun fires at least one shot' }),
  chk({ id: 'dmgout', title: 'Gun does damage', kinds: ['entity'], per: 'weapon', needs: 'weapons', how: 'run', runner: 'edrun', tool: 'edrun', group: 'guns', session: 'editor', games: G_RUN,
    limits: ['TST-19', 'TST-47', 'TST-72', 'TST-73', 'TST-74'],
    proves: 'the gun does damage: kill, or parts/damaged/hp on the foe', expect: 'the foe dies or loses parts or health' }),
  chk({ id: 'dmgin', title: 'Takes damage', kinds: ['entity'], how: 'run', runner: 'edrun', tool: 'edrun', group: 'units', session: 'editor', games: G_RUN,
    limits: ['TST-19', 'TST-47'],
    proves: 'the model takes damage: it is the foe; parts break, it dies, a man loses health', expect: 'parts break, it dies, or a man loses health' }),
  chk({ id: 'crew', title: 'Crew boards', kinds: ['entity'], cls: ['vehicle', 'gun'], how: 'run', runner: 'edrun', tool: 'edrun', group: 'units', session: 'editor', games: G_RUN,
    limits: ['TST-19'], proves: 'crew boards and the gun is manned', expect: 'the crew boards and the gun is manned' }),
  chk({ id: 'log', title: 'Clean log', kinds: [], per: 'plan', how: 'run', tool: 'logtriage', group: 'run', session: 'editor', games: G_RUN,
    limits: ['TST-19'], proves: 'no new error line in game.log of the run', expect: 'no new error line in game.log' }),
  chk({ id: 'sync', title: 'Multiplayer safe', kinds: [], per: 'plan', how: 'static', tool: 'mpsync', group: 'mod',
    games: { as64: 'static', mowas2: 'no', goh: 'no' }, proves: 'multiplayer-safe', expect: 'nothing that breaks a multiplayer match' }),
  chk({ id: 'look', title: 'Looks right', kinds: ['entity', 'model'], how: 'player', tool: '-', group: 'look', session: 'editor', games: G_PLAYER,
    proves: 'model, textures, wheels and tracks, wreck, in the right place and size', expect: 'model, textures, wheels, tracks and wreck are right' }),
  chk({ id: 'sound', title: 'Sounds right', kinds: ['weapon', 'entity', 'sound'], how: 'player', tool: '-', group: 'look', session: 'editor', games: G_PLAYER,
    proves: 'shot, reload, engine, voice', expect: 'shot, reload, engine and voice are heard' }),
  chk({ id: 'anim', title: 'Moves right', kinds: ['entity', 'model'], how: 'player', tool: '-', group: 'look', session: 'editor', games: G_PLAYER,
    limits: ['TST-121'], proves: 'reload, recoil, walk, hatch (TST-121: a clean log proves load at most)', expect: 'reload, recoil, walk and hatch play' }),
  chk({ id: 'icon', title: 'Buy menu', kinds: ['card', 'interface'], how: 'player', tool: '-', group: 'cards', session: 'skirmish', games: G_PLAYER,
    proves: 'buy menu icon, name and description, price shown', expect: 'icon, name, description and price show in the buy menu' }),
  chk({ id: 'feel', title: 'Gun feel', kinds: ['weapon', 'ammo'], how: 'player', tool: '-', group: 'guns', session: 'editor', games: G_PLAYER,
    limits: ['TST-72'], proves: 'range, accuracy, penetration against the foe named in `expect` (TST-72: no shell-impact log)',
    expect: 'range, accuracy and penetration are as meant' }),
  chk({ id: 'play', title: 'Plays', kinds: ['mission', 'script'], how: 'player', tool: '-', group: 'mission', session: 'mission', games: G_PLAYER,
    proves: 'the mission starts, the trigger or script does what changed', expect: 'the mission starts and the change works' }),
];

const BY = new Map(CHECKS.map(c => [c.id, c]));
function get(id) { return BY.get(String(id == null ? '' : id).toLowerCase()) || null; }
function ids() { return CHECKS.map(c => c.id); }

// stack -> the game word of `games` (as64 | mowas2 | goh); mowas_2 is the exe word of mowas2
function gid(stack) {
  const g = String((stack && (stack.gid || stack.exe)) || 'as64').toLowerCase();
  return g === 'mowas_2' ? 'mowas2' : g === 'goh' || g === 'mowas2' ? g : 'as64';
}

module.exports = { CHECKS, KINDS, get, ids, gid };
