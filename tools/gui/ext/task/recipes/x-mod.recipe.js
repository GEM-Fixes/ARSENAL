// recipe "look at a mod" (explore): pick a mod; which files it changes against the game (files/tree, then pro/overdiff on a button);
// what clashes with other installed mods (pro/conflicts); the problems the checker finds (the check command); how big it is and
// what takes the room (files/tree sizes, /api/mod); a search over its files (files/search). It ends with "fix my mod's problems"
// (recipe fixmod) and "make a release" (recipe release). Reads only: nothing is ever written. Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-7b79b104)
'use strict';
module.exports = {
  id: 'x-mod',
  verbs: ['explore'],
  games: ['as64', 'mowas2', 'goh'],
  needs: [],
  order: 250,
  title: 'task.x-mod.t',
  census: 'explore',
  groups: [
    { id: 'which', title: 'task.x-mod.g.which', essential: true, q: [
      { id: 'pick', kind: 'xm-pick', ask: 'task.x-mod.q.pick', help: 'task.x-mod.h.pick' },
    ] },
    { id: 'look', title: 'task.x-mod.g.look', essential: true, q: [
      { id: 'changes', kind: 'xm-changes', ask: 'task.x-mod.q.changes', help: 'task.x-mod.h.changes', covers: ['mod.files', 'mod.diff'] },
      { id: 'clash', kind: 'xm-clash', ask: 'task.x-mod.q.clash', help: 'task.x-mod.h.clash', covers: ['mod.conflicts'] },
      { id: 'problems', kind: 'xm-check', ask: 'task.x-mod.q.problems', help: 'task.x-mod.h.problems' },
      { id: 'size', kind: 'xm-size', ask: 'task.x-mod.q.size', help: 'task.x-mod.h.size' },
      { id: 'search', kind: 'xm-search', ask: 'task.x-mod.q.search', help: 'task.x-mod.h.search', covers: ['mod.search'] },
    ] },
    { id: 'then', title: 'task.x-mod.g.then', essential: true, q: [
      { id: 'next', kind: 'xm-next', ask: 'task.x-mod.q.next', help: 'task.x-mod.h.next' },
    ] },
  ],
  // every explore.json key: asked here (covers), or covered by another explore recipe (named), or a named gap
  kept: [
    ['unit.find', 'covered by x-thing (the wins screen)'],
    ['unit.stats', 'covered by x-thing (the numbers screen)'],
    ['unit.compare', 'covered by x-thing (the compare screen)'],
    ['unit.price', 'covered by x-thing (the price screen)'],
    ['unit.refs', 'covered by x-thing (the used screen)'],
    ['unit.name_lookup', 'covered by x-thing (the thing screen)'],
    ['gun.armor', 'covered by x-thing (the pierce screen)'],
    ['gun.balance', 'covered by x-thing (the balance screen)'],
    ['map.list', 'covered by x-thing (the numbers screen)'],
    ['map.picture', 'covered by x-thing (the look screen)'],
    ['map.entities', 'covered by x-thing (the onmap screen)'],
    ['sound.play', 'covered by x-thing (the look screen)'],
    ['sound.weapon', 'covered by x-thing (the look screen)'],
    ['model.open', 'covered by x-thing (the look screen)'],
    ['model.owner', 'covered by x-thing (the used screen)'],
    ['picture.view', 'covered by x-thing (the look screen)'],
    ['picture.font', 'covered by x-thing (the look screen)'],
    ['log.read', 'covered by x-log (the errors screen)'],
    ['limits.search', 'covered by x-limits (the limits screen)'],
    ['limits.guides', 'covered by x-limits (the guides screen)'],
    ['limits.glossary', 'covered by x-limits (the words screen)'],
    ['log.exe_compare', 'gap: no page reads the GoH and AS64 exe side by side (q.js -g reads internal notes that are not shipped); a modder acts on the limits row of an error instead'],
  ],
};
