// GUI-EXT units: the Units page. Find a unit (vanilla + mod, through statsheet --units-json), read its stats in plain words,
// change price / name / armour / unlock, copy it as a new unit (wreck, bots), balance (compare, army-wide %, price hints)
// and two recipes (bigger squad, longer rifle range). Preview first, then write into the mod folder the user picked.
// Tool "Unit card" (card.js routes, card.client.js): the unit's interface pictures in the vanilla style (tools/unitcard).
// Author: Imperator_Aug (ARSENAL, ia-125ca64b)
const S = require('./server');
const CARD = require('./card')(S);
// the card tool's client part runs inside the Units screen (it uses the page's picked unit, mod, flow and blocks): its text goes in
// at the //@unitcard mark of client.js
const client = require('./client'), cardClient = require('./card.client');
module.exports = {
  id: 'units', nav: 'units.nav', adv: false,
  script: client.indexOf('//@unitcard') >= 0 ? client.replace('//@unitcard', () => cardClient) : client,
  lang: require('./lang.json'),
  commands: {},
  routes: Object.assign({}, S.routes, CARD, require('./goharmour').routes),
  prep: S.prep,
  _t: S._t,
};
