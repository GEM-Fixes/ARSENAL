// GUI-EXT help: "Start here" page, shown first. What a mod is, the 4 steps, where the other pages fit, safety strip, warning-word legend,
// glossary (bundled), guide reader (run-time docs), limits row lookup, "my change is not showing", file-type cheat sheet, diagnostics text. Read-only.
// Author: Imperator_Aug (ARSENAL, ia-0cc67e5b)
const r = require('./routes');
module.exports = {
  id: 'help',
  nav: 'help.nav',
  adv: false,
  script: require('./script'),
  lang: require('./lang'),
  routes: r.routes,
};
