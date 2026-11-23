// GUI-EXT mapai: the Map scripts for AI page (Game Modes & AI > Map scripts for AI). Orders the bot itself cannot give (attack, hold,
// retreat), written into a map's mission file. Group E of the Bots parts (part mission): the page draws it with BOTS_UI.drawGroups from
// the bots script (ext/bots/script.js), so it must load after ./bots in ext/index.js. No routes of its own: the
// parts' routes stay under /api/x/bots/<part>/ (ext/bots/index.js), and so do their strings.
// Author: Imperator_Aug (ARSENAL, ia-57377306)
module.exports = {
  id: 'mapai',
  nav: 'mapai.nav',
  adv: false,
  after: 'unitai',
  script: require('./script'),
  lang: require('./lang'),
  commands: {},
  routes: {},
};
