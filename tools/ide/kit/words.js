#!/usr/bin/env node
// kit words: the engine words the Code Pieces planner and its tests know (design 7.1, Appendix B).
//   module.exports = the data of words.json { src, events, terrainEvents, conditions, actions, containers, valueBlocks,
//     ctxOfEvent, ctxOfCond, ctxOfAct, terrains, ables, places, helperEvents }   (helperEvents as duplicate keys: plan.js scanNames)
//   node tools/ide/kit/words.js --check [--game DIR]   rebuild and compare with words.json; exit 1 on a difference
//   node tools/ide/kit/words.js --write [--game DIR]   rebuild and write words.json (the build, not the Editor)
//   Sources: events = ialint EVENTS minus inflammation_time; actions = tools/fxlint/actions.json; conditions =
//   REGISTER_CONDITION names of (kept from words.json when that folder is absent);
//   terrains = block names of set/interaction_terrain/terrains.set and helperEvents = the {on ...} events inside each
//   (define "name" ...) of set/interaction_entity/** (followed through the helpers it calls), both read from the game's
//   own files (read only: --game DIR, a folder holding set/ or resource/set/ loose, else the game found by
//   tools/lib/gamedir through its paks); without a game both are kept from words.json and the check says "skip".
//   node tools/ide/kit/words.js --goh --check|--write [--game GOHDIR] [--as2 AS2DIR]   the GoH words: words.goh.json (read by
//   index.js catalog under game 'goh'). It is words.json with, from the GoH install (vfs exe goh, read only; default lib/games
//   install('goh')): terrains and helperEvents of the GoH interaction files, events plus the GoH-only reactions destroy (GHINT-17
//   [V]) and bullet_hit_effect, pierce_effect (GHINT-15 [V]), and hidden = { pieceId: [words] }: the kit pieces that use a block
//   word found in the AS2 interaction files (exe mowas_2) and in none of GoH's [I] (not seen in GoH vanilla; the GoH engine
//   reader of interaction words is not noted). No GoH install: nothing written, exit 2. No AS2 install: hidden kept from the file.
//   module.exports.goh() -> words.goh.json data, or null when the file is absent
// Author: Imperator_Aug (ARSENAL, ia-fa754858)
'use strict';
const path = require('path'), fs = require('fs');
const FILE = path.join(__dirname, 'words.json');

// Appendix B: what each event's command carries (words: bullet volume part instigator value sender source).
// Events missing here (crew, custom) = not known: no context warning there, except that a timer under such a reaction
// is taken to drop what it drops everywhere (plan.js describe: lost).
const CTX_EVENT = {
  spawn: [],
  // the game tests effector and name in {on board out} (human.inc:725-726): the other unit and the sender
  board: ['instigator', 'sender'],
  bullet_hit: ['bullet', 'volume', 'part', 'instigator', 'value', 'source'],
  pierce: ['bullet', 'volume', 'part', 'instigator', 'value', 'source'],
  blast_hit: ['volume', 'part', 'value', 'source'],
  blast: ['volume', 'part', 'value', 'source'],
  // the bullet's command goes on to break_armor (bullet, instigator, source); a blast passes its source when it has ammo
  break_armor: ['bullet', 'volume', 'part', 'instigator', 'value', 'sender', 'source'],
  break_armor_again: ['bullet', 'volume', 'part', 'instigator', 'value', 'sender', 'source'],
  contact: ['volume', 'part', 'instigator', 'value'],
  ground_hit: ['volume', 'part', 'value', 'sender'],
  break: ['part'],
  repair: ['part'],
  fire: ['value', 'sender'],
  blow: ['instigator', 'value', 'sender'],
  move: ['value'],
  turn: ['value'],
  movement_mode_changed: ['sender'],
  animation_end: ['sender'],
  ik: ['sender'],
  overlap: ['instigator'],
  operatable: [], accelerate: [], brake: [], engine: [], swim: [], grounded: [], terrain_pp: [], terrain_fx: []
};
// what a condition needs from the command (any one of the list)
const CTX_COND = {
  stuff: ['source'],
  volume: ['volume'], material: ['volume'], volume_bone_level: ['volume'], volume_armored: ['volume'],
  component: ['part', 'volume'],
  min_energy: ['value'], min_speed: ['value'], contact_velocity: ['value'],
  move_forward: ['value'], move_backward: ['value'], turn_left: ['value'], turn_right: ['value'],
  effector: ['instigator'], effector_velocity: ['instigator'], mine_effector: ['instigator'], can_crush: ['instigator'],
  name: ['sender'],
  hit_side: ['bullet']
};
// what an action needs from the command (any one of the list); key 'head' or 'head word' (that word anywhere in the action)
const CTX_ACT = {
  volume: ['volume'], component: ['part', 'volume'], for_each_volume: ['volume', 'part'],
  'tear from_volume': ['volume', 'part'], 'blastwave position': ['volume', 'part'],
  with_effector: ['instigator']
};
// ability names: the 20 the engine takes plus the two vanilla adds sec. 7)
const ABLES = ['ally_crew', 'ammo_out_indicator', 'any_crew', 'crew', 'fight', 'minimap', 'neutral', 'personage', 'recruit', 'repair', 'repaired',
  'select', 'talk', 'unmask', 'burning', 'emit_crew_on_injure', 'emit_on_attack', 'emit_on_mandie', 'emit_passangers_on_enemy', 'sinking', 'exploded', 'collect'];
const SRC = {
  events: 'tools/ialint/ialint.js EVENTS minus inflammation_time',
  terrainEvents: 'set/interaction_terrain/effects (hit, detonate; bullet never fires)',
  conditions: ' REGISTER_CONDITION',
  actions: 'tools/fxlint/actions.json actions',
  containers: 'tools/fxlint/actions.json containers without if, delay, delay_ex; plus tear',
  valueBlocks: 'blocks that hold values, not actions',
  ctxOfEvent: 'design Appendix B', ctxOfCond: 'design Appendix B', ctxOfAct: 'the pieces\' watch-outs (volume, part or the other unit)',
  terrains: 'set/interaction_terrain/terrains.set block names',
  ables: 'engine ability names plus exploded, collect',
  places: 'tools/ialint/ialint.js VANILLA_PLACES',
  helperEvents: 'set/interaction_entity/** (define) bodies, events of the helpers they call included'
};

function sorted(a) { return Array.from(new Set(a)).sort(); }
function readIf(f) { try { return fs.readFileSync(f, 'latin1'); } catch (e) { return null; } }
// the game's interaction files: Map 'set/interaction_entity/x.inc' -> text (null = no game)
function gameFiles(dir, exe) {
  const out = new Map();
  const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
  const walk = (d, rel) => { for (const nm of fs.readdirSync(d)) { const p = path.join(d, nm), r = rel + '/' + nm.toLowerCase(); if (isDir(p)) walk(p, r); else out.set(r, fs.readFileSync(p, 'latin1')); } };
  for (const root of [dir, path.join(dir, 'resource')]) {
    if (isDir(path.join(root, 'set', 'interaction_entity'))) {
      walk(path.join(root, 'set', 'interaction_entity'), 'set/interaction_entity');
      if (isDir(path.join(root, 'set', 'interaction_terrain'))) walk(path.join(root, 'set', 'interaction_terrain'), 'set/interaction_terrain');
      return out;
    }
  }
  const sdlset = require('../../lib/sdlset');
  const s = sdlset.createSource({ gameDir: dir, mods: [], exe: exe || 'mowas_2' });
  if (!s.v) return null;
  for (const k of s.v.files.keys()) {
    if (!/^resource\/set\/interaction_(entity|terrain)\//.test(k)) continue;
    const b = s.readVfs(k); if (b) out.set(k.slice(9), b.toString('latin1'));
  }
  try { require('../../lib/vfs').closeRecs(s.v); } catch (e) { /* nothing open */ }
  return out.size ? out : null;
}
function helperEventsOf(files) {
  const P = require('./plan')();
  const defs = new Map();
  for (const [k, text] of files) {
    if (!k.startsWith('set/interaction_entity/')) continue;
    const ls = text.split(/\r?\n/);
    for (const d of P.scanNames({ count: ls.length, line: n => ls[n - 1] }).defines) {
      const x = defs.get(d.name) || { events: new Set(), calls: new Set() };
      d.events.forEach(e => x.events.add(e)); d.calls.forEach(c => x.calls.add(c));
      defs.set(d.name, x);
    }
  }
  const memo = new Map();
  const all = (name, seen) => {
    if (memo.has(name)) return memo.get(name);
    const x = defs.get(name); if (!x || seen.has(name)) return new Set();
    seen.add(name);
    const out = new Set(x.events);
    for (const c of x.calls) for (const e of all(c, seen)) out.add(e);
    memo.set(name, out);
    return out;
  };
  const res = {};
  for (const name of [...defs.keys()].sort()) res[name] = sorted([...all(name, new Set())]);
  return res;
}
function terrainsOf(files) {
  const t = files.get('set/interaction_terrain/terrains.set');
  if (!t) return null;
  const out = [], re = /^\s*\{"([^"]+)"/gm; let m;
  while ((m = re.exec(t))) out.push(m[1].toLowerCase());
  return out;
}
// rebuild -> { data, skipped:[what was kept from words.json] }
function build(o = {}) {
  const old = readIf(FILE) ? JSON.parse(readIf(FILE)) : {};
  const ia = require('../../ialint/ialint'), acts = require('../../fxlint/actions.json');
  const skipped = [];
  let conditions = old.conditions || [];
  const cpp = readIf(path.join(__dirname, '..', '..', '..', 'game', 'interaction', ''));
  if (cpp) { conditions = []; const re = /^REGISTER_CONDITION\((\w+),/gm; let m; while ((m = re.exec(cpp))) conditions.push(m[1]); conditions = sorted(conditions); }
  else skipped.push('conditions (game/interaction is not in this checkout)');
  let gdir = o.game || null;
  if (!gdir && !o.noGame) { try { gdir = require('../../lib/gamedir').resolve({}).dir; } catch (e) { gdir = null; } }
  let files = null;
  if (gdir) { try { files = gameFiles(gdir); } catch (e) { files = null; } }
  let terrains = old.terrains || [], helperEvents = old.helperEvents || {};
  if (files) { terrains = terrainsOf(files) || terrains; helperEvents = helperEventsOf(files); }
  else skipped.push('terrains and helperEvents (no game folder found)');
  const data = {
    src: SRC,
    events: sorted([...ia.EVENTS].filter(e => e !== 'inflammation_time')),
    terrainEvents: ['hit', 'detonate', 'bullet'],
    conditions,
    actions: sorted(acts.actions),
    containers: sorted(acts.containers.filter(c => c !== 'if' && c !== 'delay' && c !== 'delay_ex').concat(['tear'])),
    valueBlocks: sorted(['explode_inventory', 'table', 'effects'].concat(acts.actions.filter(a => a.indexOf('health_damage_') === 0))),
    ctxOfEvent: CTX_EVENT,
    ctxOfCond: CTX_COND,
    ctxOfAct: CTX_ACT,
    terrains,
    ables: ABLES.slice(),
    places: sorted([...ia.VANILLA_PLACES]),
    helperEvents
  };
  return { data, skipped, game: files ? gdir : null };
}
const text = d => JSON.stringify(d, null, 1) + '\n';
const lf = s => (s == null ? s : s.replace(/\r\n/g, '\n'));   // --check: a CRLF checkout of the json is the same text

// ---- GoH words (words.goh.json): see the header
const GOH_FILE = path.join(__dirname, 'words.goh.json');
const GOH_EVENTS = ['bullet_hit_effect', 'destroy', 'pierce_effect'];   // GHINT-15 [V], GHINT-17 [V]: reactions as64 has not
// block words of a text: the word after each '{' (quoted or not), comments dropped, lower case
function headWords(text) {
  const s = new Set(), re = /\{\s*"?([A-Za-z_][\w]*)"?/g; let m;
  const t = String(text).replace(/;[^\n]*/g, '');
  while ((m = re.exec(t))) s.add(m[1].toLowerCase());
  return s;
}
const wordsOf = files => { const s = new Set(); for (const t of files.values()) for (const w of headWords(t)) s.add(w); return s; };
// pieces that use a word the AS2 files have and the GoH files have not -> { id: [words] } (kit pieces of the interaction kinds)
function hiddenFor(pieces, as2, goh) {
  const out = {};
  for (const p of pieces) {
    if (!(p.kinds || []).some(k => /^ia-/.test(k))) continue;
    const ws = [...headWords(String(p.code).replace(/@[^@]*@/g, 'X'))];
    if (p.event) ws.push(String(p.event).replace(/"/g, '').toLowerCase());
    const miss = sorted(ws.filter(w => as2.has(w) && !goh.has(w)));
    if (miss.length) out[p.id] = miss;
  }
  return out;
}
function buildGoh(o = {}) {
  const base = JSON.parse(readIf(FILE));
  const old = readIf(GOH_FILE) ? JSON.parse(readIf(GOH_FILE)) : {};
  const games = require('../../lib/games'), skipped = [];
  let gdir = o.game || null;
  if (!gdir && !o.noGame) { try { gdir = games.install('goh').dir; } catch (e) { gdir = null; } }
  let files = null;
  if (gdir) { try { files = gameFiles(gdir, 'goh'); } catch (e) { files = null; } }
  if (!files) return { data: null, skipped: ['everything (no GoH install found: give --game)'], game: null };
  let adir = o.as2 || null;
  if (!adir && !o.noGame) { try { adir = games.install('mowas2').dir; } catch (e) { adir = null; } }
  let as2 = null;
  if (adir) { try { as2 = gameFiles(adir, 'mowas_2'); } catch (e) { as2 = null; } }
  let hidden = old.hidden || {};
  if (as2) hidden = hiddenFor(require('./index').load().pieces, wordsOf(as2), wordsOf(files));
  else skipped.push('hidden (no AS2 install found: give --as2)');
  const data = Object.assign({}, base, {
    game: 'goh',
    src: Object.assign({}, base.src, {
      events: base.src.events + '; plus the GoH-only reactions bullet_hit_effect, pierce_effect (GHINT-15) and destroy (GHINT-17)',
      terrains: 'GoH ' + base.src.terrains, helperEvents: 'GoH ' + base.src.helperEvents,
      hidden: 'kit pieces with a block word in the AS2 interaction files and in none of the GoH ones [I]'
    }),
    events: sorted(base.events.concat(GOH_EVENTS)),
    terrains: terrainsOf(files) || base.terrains,
    helperEvents: helperEventsOf(files),
    hidden
  });
  return { data, skipped, game: gdir };
}
// a literal require, so the single-file exe embeds the file
function goh() { try { return require('./words.goh.json'); } catch (e) { return null; } }

if (require.main === module) {
  const a = process.argv.slice(2), gi = a.indexOf('--game'), ai = a.indexOf('--as2');
  const o = { game: gi >= 0 ? a[gi + 1] : null };
  if (a.includes('--goh')) {
    o.as2 = ai >= 0 ? a[ai + 1] : null;
    const r = buildGoh(o);
    for (const s of r.skipped) console.log('skip ' + s);
    if (!r.data) process.exit(2);
    const n = Object.keys(r.data.hidden).length;
    if (a.includes('--write')) { fs.writeFileSync(GOH_FILE, text(r.data)); console.log('wrote ' + GOH_FILE + ' (' + n + ' pieces hidden under GoH)'); process.exit(0); }
    if (a.includes('--check')) {
      const now = lf(readIf(GOH_FILE));
      if (now === text(r.data)) { console.log('words.goh.json is up to date (' + n + ' pieces hidden under GoH)'); process.exit(0); }
      const cur = now ? JSON.parse(now) : {};
      for (const k of Object.keys(r.data)) if (JSON.stringify(cur[k]) !== JSON.stringify(r.data[k])) console.log('differs: ' + k);
      console.log('words.goh.json is out of date: node tools/ide/kit/words.js --goh --write');
      process.exit(1);
    }
    console.log('usage: node tools/ide/kit/words.js --goh --check|--write [--game GOHDIR] [--as2 AS2DIR]'); process.exit(2);
  }
  const r = build(o);
  for (const s of r.skipped) console.log('skip ' + s);
  if (a.includes('--write')) { fs.writeFileSync(FILE, text(r.data)); console.log('wrote ' + FILE + (r.game ? ' (game ' + r.game + ')' : '')); process.exit(0); }
  if (a.includes('--check')) {
    const now = lf(readIf(FILE));
    if (now === text(r.data)) { console.log('words.json is up to date' + (r.game ? ' (game ' + r.game + ')' : '')); process.exit(0); }
    const cur = now ? JSON.parse(now) : {};
    for (const k of Object.keys(r.data)) if (JSON.stringify(cur[k]) !== JSON.stringify(r.data[k])) console.log('differs: ' + k);
    console.log('words.json is out of date: node tools/ide/kit/words.js --write');
    process.exit(1);
  }
  console.log('usage: node tools/ide/kit/words.js --check|--write [--game DIR]'); process.exit(2);
}
module.exports = require('./words.json');
// build stays off the data (not enumerable: JSON.stringify and Object.keys of the words do not see it)
if (!Object.prototype.hasOwnProperty.call(module.exports, 'build')) {
  Object.defineProperty(module.exports, 'build', { value: build, enumerable: false });
  Object.defineProperty(module.exports, 'gameFiles', { value: gameFiles, enumerable: false });
  Object.defineProperty(module.exports, 'buildGoh', { value: buildGoh, enumerable: false });
  Object.defineProperty(module.exports, 'hiddenFor', { value: hiddenFor, enumerable: false });
  Object.defineProperty(module.exports, 'headWords', { value: headWords, enumerable: false });
  Object.defineProperty(module.exports, 'goh', { value: goh, enumerable: false });
}
