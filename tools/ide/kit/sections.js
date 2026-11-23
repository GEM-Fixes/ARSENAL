// kit sections: the section tree of the Code Pieces pane (design 4.2, 2). Titles are lang rows
// ide.kit.s.<id> (lang/common.js).
//   SECTIONS = [{ id, parent, order, adv?, view?, kinds?, count? }]   kinds on a top section = the kit kinds that list it
//     (sub-sections take their parent's); count = pieces in the section and its sub-sections in v1 (the test compares
//     when every v1 group is present; the round 2 sections carry no count);
//     view = a section that holds no pieces of its own, only the ids of VIEWS[id].
//   VIEWS = { <sec>: [piece ids] }
//   Round 2 (2026-11-21): the sections, copied here as data (nothing under is read
//   at run time). The v1 tree, ids and orders stay; ia.sys (Ready systems) goes after ia.start and ia.forms (From the
//   game's files) after ia.ideas (orders 1.5 and 2.5, organize.md 2: Start here, Ready systems, Ideas, language,
//   Patterns, Change, Advanced); new sub-sections of ia.ideas and ia.pat come after the old ones (orders from 20). The
//   tops of the other kinds keep their orders (20 and up). sdl.any moves from order 9 to 90 and the new top sdl.files
//   ("Whole files for other data files", every SDL kind) is 91, so the shared sections come last in every kind (in
//   ia-entity they were last already).
// Author: Imperator_Aug (ARSENAL, ia-0d9dfda3)
'use strict';
const ALL = ['ia-entity', 'ia-terrain', 'ia-terrain-map', 'modinfo', 'lng', 'bot-lua', 'mi', 'mapinfo', 'mp-units', 'mp-games', 'stuff', 'breed', 'entity-def', 'props', 'mtl', 'sound-set', 'sdl'];
const IA = ['ia-entity'];
// the kinds that list sdl.any and sdl.files: every kind whose files are SDL text (a Lua bot script is not)
const SDL_KINDS = ALL.filter(k => k !== 'bot-lua');
// v1: [id, count, [ [suffix, count], ... ]]  count null = a view
const TREE = [
  ['ia.start', 4, []],
  ['ia.ideas', 53, [['show', null], ['veh', 17], ['inf', 10], ['obj', 11], ['nat', 4], ['exp', 4], ['amb', 4], ['sys', 3]]],
  ['ia.when', 66, [['life', 10], ['hit', 13], ['move', 21], ['weap', 15], ['anim', 6], ['own', 1]]],
  ['ia.if', 68, [['rand', 1], ['hitby', 10], ['touch', 5], ['state', 19], ['parts', 13], ['move', 7], ['world', 6], ['logic', 7]]],
  ['ia.do', 110, [['fx', 6], ['snd', 6], ['make', 12], ['dmg', 24], ['crew', 23], ['push', 7], ['anim', 17], ['mem', 4], ['wait', 11]]],
  ['ia.pat', 36, [['setup', 4], ['fx', 8], ['time', 8], ['dmg', 11], ['move', 5]]],
  ['ia.change', 8, []],
  ['ia.adv', 41, [['ev', 6], ['if', 8], ['do', 24], ['setup', 2], ['idea', 1]]],
  ['sdl.any', 5, []]
];
// round 2 tops: [id, order, kinds, adv, [ [suffix, order], ... ]]
const ENT = ['entity-def', 'props'];
const NEW_TOPS = [
  ['ia.sys', 1.5, IA, false, []],
  ['ia.forms', 2.5, IA, false, [['aircraft', 20], ['boats', 21], ['vehicles', 22], ['soldiers', 23], ['objects', 24], ['buildings', 25], ['nature', 26], ['trains', 27], ['guns', 28], ['explosives', 29], ['markers', 30]]],
  ['ter.start-here', 20, ['ia-terrain'], false, []],
  ['ter.sys', 21, ['ia-terrain'], false, []],
  ['ter.ideas', 22, ['ia-terrain'], false, []],
  ['ter.test', 23, ['ia-terrain'], false, []],
  ['ter.water', 24, ['ia-terrain'], false, []],
  ['ter.air', 25, ['ia-terrain'], false, []],
  ['ter.hits', 26, ['ia-terrain'], false, []],
  ['ter.craters', 27, ['ia-terrain'], false, []],
  ['ter.explosions', 28, ['ia-terrain'], false, []],
  ['ter.special-grounds', 29, ['ia-terrain'], false, []],
  ['ent.ideas', 20, ENT, false, [['movement', 20], ['crew', 21], ['weapons', 22], ['more', 23]]],
  ['ent.vehicle', 21, ENT, false, [['tank', 20], ['weapons', 21], ['movement', 22], ['wreck', 23], ['car', 24], ['volumes-and-parts', 25], ['halftrack', 26], ['armour', 27], ['crew-and-seats', 28]]],
  ['ent.gun', 22, ENT, false, [['crew', 20], ['deploy', 21], ['movement', 22], ['turning-limits', 23], ['armour', 24], ['ammo', 25], ['mortar', 26], ['weapons', 27], ['whole-file', 28], ['searchlight', 29], ['multiplayer-only', 30]]],
  ['ent.any', 23, ENT, false, [['multiplayer-only', 20], ['look', 21], ['selection', 22], ['targeting', 23], ['variants', 24], ['includes', 25], ['macros', 26], ['tags', 27], ['volumes', 28], ['physics', 29], ['armour', 30], ['vision', 31], ['volumes-and-parts', 32], ['inventory', 33]]],
  ['ent.soldier', 24, ENT, false, [['whole-file', 20]]],
  ['ent.building', 25, ENT, false, [['whole-file', 20], ['parts', 21], ['fire-places', 22], ['armour', 23]]],
  ['ent.object', 26, ENT, false, [['whole-file', 20], ['crates', 21], ['supply', 22], ['items', 23], ['mine', 24], ['fire-places', 25]]],
  ['ent.aircraft', 27, ENT, false, [['parts', 20], ['movement', 21], ['weapons', 22], ['whole-file', 23]]],
  ['ent.boat', 28, ENT, false, [['volumes', 20], ['behaviour', 21], ['whole-file', 22]]],
  ['ent.train', 29, ENT, false, [['whole-file', 20]]],
  ['ent.sound-and-effects', 30, ENT, false, []],
  ['breed.whole-file', 20, ['breed'], false, []],
  ['breed.common-lines', 21, ['breed'], false, []],
  ['breed.less-common', 22, ['breed'], false, []],
  ['stuff.whole-file', 20, ['stuff'], false, []],
  ['stuff.common-lines', 21, ['stuff'], false, []],
  ['mi.start', 20, ['mi'], false, [['whole-file', 20], ['top-blocks', 21], ['placement', 22], ['placement-keys', 23], ['helpers', 24]]],
  ['mi.sys', 21, ['mi'], false, []],
  ['mi.ideas', 22, ['mi'], false, [['stealth', 20], ['atmosphere', 21], ['more', 22]]],
  ['mi.when', 23, ['mi'], false, [['trigger', 20]]],
  ['mi.if', 24, ['mi'], false, [['terms', 20], ['pick-units', 21]]],
  ['mi.do', 25, ['mi'], false, [['flow', 20], ['orders', 21], ['units-and-tags', 22], ['squads', 23], ['spawn-and-remove', 24], ['damage-and-inventory', 25], ['objectives-and-score', 26], ['variables-and-events', 27], ['camera-and-screen', 28], ['sound-and-weather', 29], ['end', 30]]],
  ['mi.pat', 26, ['mi'], false, [['start', 20], ['timing', 21], ['repeat', 22], ['logic', 23], ['zones', 24], ['units', 25], ['spawning', 26], ['reinforcements', 27], ['objectives', 28], ['win-and-lose', 29], ['cutscenes', 30], ['behaviour', 31], ['sound', 32], ['difficulty', 33], ['more', 34]]],
  ['mi.adv', 27, ['mi'], true, []],
  ['mi.debug', 28, ['mi'], false, []],
  ['lng.whole-file', 20, ['lng'], false, []],
  ['info.whole-file', 20, ['mapinfo'], false, []],
  ['info.lines', 21, ['mapinfo'], false, []],
  ['sdl.files', 91, SDL_KINDS, false, []]
];
// round 2 sub-sections under v1 tops: [parent, suffix, order]
const NEW_SUBS = [
  ['ia.ideas', 'guns', 20], ['ia.ideas', 'aircraft', 21], ['ia.ideas', 'trains', 22], ['ia.ideas', 'more', 23],
  ['ia.pat', 'n-timers', 20], ['ia.pat', 'n-macros', 21], ['ia.pat', 'more', 22]
];
const SECTIONS = [];
TREE.forEach(function (t, i) {
  const adv = t[0] === 'ia.adv', top = { id: t[0], parent: null, order: t[0] === 'sdl.any' ? 90 : i + 1, kinds: t[0] === 'sdl.any' ? SDL_KINDS.slice() : IA.slice(), count: t[1] };
  if (adv) top.adv = true;
  SECTIONS.push(top);
  t[2].forEach(function (s, j) {
    const x = { id: t[0] + '.' + s[0], parent: t[0], order: j + 1 };
    if (s[1] === null) x.view = true; else x.count = s[1];
    if (adv) x.adv = true;
    SECTIONS.push(x);
  });
  NEW_SUBS.filter(n => n[0] === t[0]).forEach(function (n) { SECTIONS.push({ id: n[0] + '.' + n[1], parent: n[0], order: n[2] }); });
});
NEW_TOPS.forEach(function (t) {
  const top = { id: t[0], parent: null, order: t[1], kinds: t[2].slice() };
  if (t[3]) top.adv = true;
  SECTIONS.push(top);
  t[4].forEach(function (s) {
    const x = { id: t[0] + '.' + s[0], parent: t[0], order: s[1] };
    if (t[3]) x.adv = true;
    SECTIONS.push(x);
  });
});
const VIEWS = {
  'ia.ideas.show': ['c.vehicle.cookoff', 'c.vehicle.selfdestruct', 'c.vehicle.turret.jam', 'c.vehicle.track.ram', 'c.object.fueldump.chain',
    'c.object.alarm.repeat', 'c.object.collapse.fuse', 'c.explosive.mine.dud', 'c.infantry.blast.tiers', 'c.ambient.flicker']
};
const BY_ID = new Map(SECTIONS.map(s => [s.id, s]));
// top section of any section id
function topOf(id) { let s = BY_ID.get(id); while (s && s.parent) s = BY_ID.get(s.parent); return s || null; }
// sections a kit kind lists (top sections whose kinds hold it, with their sub-sections), in SECTIONS order
function forKind(kind) { return SECTIONS.filter(s => { const t = topOf(s.id); return t && t.kinds.indexOf(kind) >= 0; }); }
module.exports = { SECTIONS, VIEWS, ALL_KINDS: ALL, topOf, forKind };
