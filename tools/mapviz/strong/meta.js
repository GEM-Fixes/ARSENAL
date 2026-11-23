// strong meta (MV-STR): how true to the engine each strong point factor is, the one source of truth for the tool
// (strong.<kind>.json factors[].engineTrue, grid meta) and the Map Viewer page (sub/strong.client.js reads it when the
// page is built, so the factor layer marks cannot drift from the tool again).
//   FACTOR_META {id: [how, inputs]}   how: 'rule' = an engine rule counted, 'port' = a ported engine routine,
//                                      'estimate' = a planning estimate; inputs: 'engine' = engine data only,
//                                      'inferred' = carries [I] numbers
//   engineTrue(id) -> bool            true for 'rule' and 'port': the page marks that factor layer (as the game sees it)
// Why each mark (rules.md 6.3 meta):
//   sp, df, hu rule: the share of enemy sight lines (actor vision rule walk, rules/sight) or fire lines (rules/sight
//               fireLine) that reach the spot, or the hull-down test over facings: engine sight and fire rules counted
//   cv          port: the cover points of rules/cover (a port of the game's cover detector) near the spot
//   ow, kz, rt, amb  estimate: shares over flag zones or enemy routes that come from our own route search
//               (rules/pass routes, not the game's pather) inside an engagement range that no game file gives (AIM_M,
//               index.js [I]); the engine never computes them
//   fr, px, enf estimate: travel time lead, closeness and route angle, all our own planning measures
// Author: Imperator_Aug (ARSENAL, ia-9b2591bc)
'use strict';

const FACTOR_META = Object.freeze({
  ow: Object.freeze(['estimate', 'engine']), kz: Object.freeze(['estimate', 'inferred']), sp: Object.freeze(['rule', 'inferred']),
  df: Object.freeze(['rule', 'engine']), cv: Object.freeze(['port', 'engine']), rt: Object.freeze(['estimate', 'inferred']),
  fr: Object.freeze(['estimate', 'inferred']), px: Object.freeze(['estimate', 'engine']), hu: Object.freeze(['rule', 'inferred']),
  amb: Object.freeze(['estimate', 'inferred']), enf: Object.freeze(['estimate', 'inferred']),
});
const engineTrue = id => !!FACTOR_META[id] && FACTOR_META[id][0] !== 'estimate';

module.exports = { FACTOR_META, engineTrue };
