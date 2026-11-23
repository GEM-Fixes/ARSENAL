// GUI-EXT logs: "Read game.log" (read the game log, crash reports, what is enabled, why a mod is missing, unit chain). Read-only.
// Author: Imperator_Aug (ARSENAL, ia-c48da2c7)
const r = require('./routes');
module.exports = {
  id: 'logs',
  nav: 'logs.nav',
  adv: false,
  script: require('./script'),
  lang: require('./lang'),
  routes: r.routes,
};
