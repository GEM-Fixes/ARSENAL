// ide intel: the editor's language service in one module (contract: tools/ide/README.md).
// check + locate (intel/check.js), hover/def/refs/symbols/words (intel/nav.js), line-local fixes (intel/fixes.js).
// Author: Imperator_Aug (ARSENAL, ia-ebacdf02)
module.exports = Object.assign({}, require('./intel/check'), require('./intel/nav'), require('./intel/fixes'));
