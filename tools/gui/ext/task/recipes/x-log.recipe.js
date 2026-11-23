// recipe "what went wrong in the last run" (explore): the last run of the game (logs/find), its errors in plain words, each with the
// file and line it points at (an Editor link made by GET /api/x/ide/log, else from the error's own place), and what to do about each
// (the fix steps, the tests and the limits row of POST /api/x/logs/explain). Reads only: nothing is ever written. Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-db632e56)
'use strict';
module.exports = {
  id: 'x-log',
  verbs: ['explore'],
  games: ['as64', 'mowas2', 'goh'],
  needs: [],
  order: 260,
  title: 'task.x-log.t',
  census: 'explore',
  groups: [
    { id: 'last', title: 'task.x-log.g.last', essential: true, q: [
      { id: 'run', kind: 'xl-run', ask: 'task.x-log.q.run', help: 'task.x-log.h.run' },
      { id: 'errors', kind: 'xl-errors', ask: 'task.x-log.q.errors', help: 'task.x-log.h.errors', covers: ['log.read'] },
      { id: 'todo', kind: 'xl-todo', ask: 'task.x-log.q.todo', help: 'task.x-log.h.todo' },
    ] },
  ],
  // the Done step (README Changes 34): fix what the log showed, or look up what the engine allows
  next: [{ recipe: 'fixmod', verb: 'change' }, { recipe: 'x-limits', verb: 'explore' }],
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
    ['mod.files', 'covered by x-mod (the changes screen)'],
    ['mod.diff', 'covered by x-mod (the changes screen)'],
    ['mod.conflicts', 'covered by x-mod (the clash screen)'],
    ['mod.search', 'covered by x-mod (the search screen)'],
    ['limits.search', 'covered by x-limits (the limits screen)'],
    ['limits.guides', 'covered by x-limits (the guides screen)'],
    ['limits.glossary', 'covered by x-limits (the words screen)'],
    ['log.exe_compare', 'gap: no page reads the GoH and AS64 exe side by side (q.js -g reads internal notes that are not shipped); a modder acts on the limits row of an error instead'],
  ],
};
