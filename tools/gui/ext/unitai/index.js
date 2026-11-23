// GUI-EXT unitai: the Unit AI page (Game Modes & AI > Unit AI). How computer-controlled soldiers, crews and guns behave once they are on
// the map; applies to every AI unit, single-player enemies too. Group D of the Bots parts (parts brain, targets): the page draws them with
// BOTS_UI.drawGroups from the bots script (ext/bots/script.js), so it must load after ./bots in ext/index.js. No routes of its own: the
// parts' routes stay under /api/x/bots/<part>/ (ext/bots/index.js), and so do their strings.
// Author: Imperator_Aug (ARSENAL, ia-d2dab0fe)
module.exports = {
  id: 'unitai',
  nav: 'unitai.nav',
  adv: false,
  after: 'bots',
  script: require('./script'),
  lang: require('./lang'),
  commands: {},
  routes: {},
};
