// The parts of the Bots pages (ext/bots, ext/unitai, ext/mapai): one folder per part, parts/<id>/index.js =
//   { id, group: 'A'..'F', order: number, routes: {'GET|POST /api/x/bots/<id>/...': async (url, body, ctx) => JSON},
//     lang: rows [key, en, ru, uk, zh] (keys 'bots.<id>.'), script: require('./client') (browser JS that does BOTS_PARTS.push({...})) }.
// The list is literal so the single-exe bundler keeps each module. A folder that is missing, throws while loading, or breaks the
// contract is left out with a console warning (module.exports.skipped says which and why), never a crash of the GUI.
// Groups: A What bots buy, B How bots think, C Match setup, F Test and limits (Bots page); D How units fight (Unit AI page);
// E Map scripts (Map scripts for AI page).
// Author: Imperator_Aug (ARSENAL, ia-b41bbdfb)
'use strict';
const vm = require('vm');
const skipped = [];
const warn = (id, why) => { skipped.push({ id, why }); console.warn('bots part ' + id + ' skipped: ' + why); };

function check(id, p) {
  if (!p || typeof p !== 'object') return 'index.js exports nothing';
  if (p.id !== id) return 'id is ' + JSON.stringify(p.id) + ', the folder is ' + id;
  if (!/^[A-F]$/.test(p.group || '')) return 'group must be one letter A..F, got ' + JSON.stringify(p.group);
  if (typeof p.order !== 'number' || !isFinite(p.order)) return 'order must be a number';
  if (p.routes != null && typeof p.routes !== 'object') return 'routes must be an object';
  for (const k of Object.keys(p.routes || {})) {
    if (!new RegExp('^(GET|POST) /api/x/bots/' + id + '(/[a-z0-9/_-]*)?$').test(k)) return 'route ' + k + ' must be GET|POST /api/x/bots/' + id + '/...';
    if (typeof p.routes[k] !== 'function') return 'route ' + k + ' is not a function';
  }
  if (p.lang != null && !Array.isArray(p.lang)) return 'lang must be a list of rows';
  for (const r of p.lang || []) {
    if (!Array.isArray(r) || r.length !== 5 || r.some(s => typeof s !== 'string' || !s)) return 'lang row ' + JSON.stringify(r && r[0]) + ' must be [key, en, ru, uk, zh], none empty';
    if (r[0].indexOf('bots.' + id + '.') !== 0) return 'lang key ' + r[0] + ' must start with bots.' + id + '.';
  }
  if (p.script != null) {
    if (typeof p.script !== 'string') return 'script must be a string';
    if (/`|\$\{/.test(p.script)) return 'script has a backtick or dollar-brace (page rules)';
    if (/<\/script/i.test(p.script)) return 'script holds a closing script tag';
    if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(p.script)) return 'script writes HTML (use h() and textContent)';
    try { new vm.Script('(function(){' + p.script + '\n})', { filename: 'parts/' + id + '/client.js' }); } catch (e) { return 'script does not parse: ' + e.message; }
  }
  return '';
}

function load(id, get) {
  let p;
  try { p = get(); } catch (e) {
    const gone = e && e.code === 'MODULE_NOT_FOUND' && String(e.message).indexOf("'./" + id + "'") >= 0;   // the folder itself, not a file it requires
    warn(id, gone ? 'no folder parts/' + id + ' yet' : 'loading threw: ' + ((e && e.message) || e));
    return null;
  }
  const why = check(id, p);
  if (why) { warn(id, why); return null; }
  return p;
}

const parts = [
  load('buycheck', () => require('./buycheck')),
  load('stages', () => require('./stages')),
  load('recipes', () => require('./recipes')),
  load('modeready', () => require('./modeready')),
  load('botmatch', () => require('./botmatch')),
  load('brain', () => require('./brain')),
  load('targets', () => require('./targets')),
  load('mission', () => require('./mission')),
  load('limits', () => require('./limits')),
].filter(Boolean);

module.exports = parts;
module.exports.skipped = skipped;
module.exports.check = check;
module.exports.IDS = ['buycheck', 'stages', 'recipes', 'modeready', 'botmatch', 'brain', 'targets', 'mission', 'limits'];
