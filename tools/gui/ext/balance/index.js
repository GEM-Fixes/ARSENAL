// GUI-EXT balance: the Balance page. Every buy-panel unit as one row (tools/balance), seen as a sheet, in groups, as a graph
// and side by side; the units that do not fit the pattern; and a bulk change of one value for any selection, preview first.
// The price calculator card (tools/pricecalc as a library): Model, Breeds and Cards views; it writes only the model file and comment lines.
// Knows which resource a button is paid with (manpower or special points) and the wait at start (cooldown x factor x (1 - fore)).
// Author: Imperator_Aug (ARSENAL, ia-96759d12)
const S = require('./server');
module.exports = {
  id: 'balance', nav: 'balance.nav', adv: false,
  script: require('./client') + require('./prices.client'),
  lang: require('./lang.json'),
  commands: {},
  routes: S.routes,
  prep: S.prep,
};
