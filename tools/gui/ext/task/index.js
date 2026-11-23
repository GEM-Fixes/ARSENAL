// GUI-EXT task: the "Quick Guided Task" row above the tabs and the task window (contract: ./README.md, plan:.
// No tab of its own (tab:false, no nav): its script runs on every page, sets window.TASK and fills the row slot #taskrow.
// Recipes are drop-in file sets in ./recipes (<id>.recipe.js, .lang.js, .client.js). The requires are literal so the single-exe bundler
// keeps each module; a recipe file that is not there is skipped. A recipe that fails to load (a throw in its files, a bad id, a recipe
// that does not validate, a string outside its prefix, a client script that does not parse) is skipped too, so the GUI keeps running:
// its row shows greyed with "this task has a fault" and the error, the server logs it, and FAULTS names it (the framework test fails
// loudly on any fault).
// Author: Imperator_Aug (ARSENAL, ia-e2761ac5)
'use strict';
const S = require('./server'), RC = require('./lib/recipe');
class Fault { constructor(e) { this.error = e; } }
const opt = (name, fn) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).split('\n')[0].includes(name)) return null; return new Fault(e); } };
const PARTS = [
  { id: 'mod', r: opt('mod.recipe', () => require('./recipes/mod.recipe')), l: opt('mod.lang', () => require('./recipes/mod.lang')), c: opt('mod.client', () => require('./recipes/mod.client')) },
  { id: 'vehicle', r: opt('vehicle.recipe', () => require('./recipes/vehicle.recipe')), l: opt('vehicle.lang', () => require('./recipes/vehicle.lang')), c: opt('vehicle.client', () => require('./recipes/vehicle.client')) },
  { id: 'soldier', r: opt('soldier.recipe', () => require('./recipes/soldier.recipe')), l: opt('soldier.lang', () => require('./recipes/soldier.lang')), c: opt('soldier.client', () => require('./recipes/soldier.client')) },
  { id: 'squad', r: opt('squad.recipe', () => require('./recipes/squad.recipe')), l: opt('squad.lang', () => require('./recipes/squad.lang')), c: opt('squad.client', () => require('./recipes/squad.client')) },
  { id: 'gun', r: opt('gun.recipe', () => require('./recipes/gun.recipe')), l: opt('gun.lang', () => require('./recipes/gun.lang')), c: opt('gun.client', () => require('./recipes/gun.client')) },
  { id: 'ammo', r: opt('ammo.recipe', () => require('./recipes/ammo.recipe')), l: opt('ammo.lang', () => require('./recipes/ammo.lang')), c: opt('ammo.client', () => require('./recipes/ammo.client')) },
  { id: 'item', r: opt('item.recipe', () => require('./recipes/item.recipe')), l: opt('item.lang', () => require('./recipes/item.lang')), c: opt('item.client', () => require('./recipes/item.client')) },
  { id: 'skin', r: opt('skin.recipe', () => require('./recipes/skin.recipe')), l: opt('skin.lang', () => require('./recipes/skin.lang')), c: opt('skin.client', () => require('./recipes/skin.client')) },
  { id: 'icon', r: opt('icon.recipe', () => require('./recipes/icon.recipe')), l: opt('icon.lang', () => require('./recipes/icon.lang')), c: opt('icon.client', () => require('./recipes/icon.client')) },
  { id: 'sound', r: opt('sound.recipe', () => require('./recipes/sound.recipe')), l: opt('sound.lang', () => require('./recipes/sound.lang')), c: opt('sound.client', () => require('./recipes/sound.client')) },
  { id: 'voice', r: opt('voice.recipe', () => require('./recipes/voice.recipe')), l: opt('voice.lang', () => require('./recipes/voice.lang')), c: opt('voice.client', () => require('./recipes/voice.client')) },
  { id: 'army', r: opt('army.recipe', () => require('./recipes/army.recipe')), l: opt('army.lang', () => require('./recipes/army.lang')), c: opt('army.client', () => require('./recipes/army.client')) },
  { id: 'map', r: opt('map.recipe', () => require('./recipes/map.recipe')), l: opt('map.lang', () => require('./recipes/map.lang')), c: opt('map.client', () => require('./recipes/map.client')) },
  { id: 'mission', r: opt('mission.recipe', () => require('./recipes/mission.recipe')), l: opt('mission.lang', () => require('./recipes/mission.lang')), c: opt('mission.client', () => require('./recipes/mission.client')) },
  { id: 'bots', r: opt('bots.recipe', () => require('./recipes/bots.recipe')), l: opt('bots.lang', () => require('./recipes/bots.lang')), c: opt('bots.client', () => require('./recipes/bots.client')) },
  { id: 'text', r: opt('text.recipe', () => require('./recipes/text.recipe')), l: opt('text.lang', () => require('./recipes/text.lang')), c: opt('text.client', () => require('./recipes/text.client')) },
  { id: 'model', r: opt('model.recipe', () => require('./recipes/model.recipe')), l: opt('model.lang', () => require('./recipes/model.lang')), c: opt('model.client', () => require('./recipes/model.client')) },
  { id: 'prices', r: opt('prices.recipe', () => require('./recipes/prices.recipe')), l: opt('prices.lang', () => require('./recipes/prices.lang')), c: opt('prices.client', () => require('./recipes/prices.client')) },
  { id: 'armour', r: opt('armour.recipe', () => require('./recipes/armour.recipe')), l: opt('armour.lang', () => require('./recipes/armour.lang')), c: opt('armour.client', () => require('./recipes/armour.client')) },
  { id: 'upgrade', r: opt('upgrade.recipe', () => require('./recipes/upgrade.recipe')), l: opt('upgrade.lang', () => require('./recipes/upgrade.lang')), c: opt('upgrade.client', () => require('./recipes/upgrade.client')) },
  { id: 'gohunit', r: opt('gohunit.recipe', () => require('./recipes/gohunit.recipe')), l: opt('gohunit.lang', () => require('./recipes/gohunit.lang')), c: opt('gohunit.client', () => require('./recipes/gohunit.client')) },
  { id: 'fixmod', r: opt('fixmod.recipe', () => require('./recipes/fixmod.recipe')), l: opt('fixmod.lang', () => require('./recipes/fixmod.lang')), c: opt('fixmod.client', () => require('./recipes/fixmod.client')) },
  { id: 'release', r: opt('release.recipe', () => require('./recipes/release.recipe')), l: opt('release.lang', () => require('./recipes/release.lang')), c: opt('release.client', () => require('./recipes/release.client')) },
  { id: 'x-thing', r: opt('x-thing.recipe', () => require('./recipes/x-thing.recipe')), l: opt('x-thing.lang', () => require('./recipes/x-thing.lang')), c: opt('x-thing.client', () => require('./recipes/x-thing.client')) },
  { id: 'x-mod', r: opt('x-mod.recipe', () => require('./recipes/x-mod.recipe')), l: opt('x-mod.lang', () => require('./recipes/x-mod.lang')), c: opt('x-mod.client', () => require('./recipes/x-mod.client')) },
  { id: 'x-log', r: opt('x-log.recipe', () => require('./recipes/x-log.recipe')), l: opt('x-log.lang', () => require('./recipes/x-log.lang')), c: opt('x-log.client', () => require('./recipes/x-log.client')) },
  { id: 'x-limits', r: opt('x-limits.recipe', () => require('./recipes/x-limits.recipe')), l: opt('x-limits.lang', () => require('./recipes/x-limits.lang')), c: opt('x-limits.client', () => require('./recipes/x-limits.client')) },
];

// a recipe file set dropped into ./recipes whose id is not in PARTS yet still loads when the folder can be read (a source copy; the
// single exe has only the literal list above): the drop-down shows a recipe as soon as its files exist
const EXTRA = (() => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, 'recipes'), out = [];
  let names = []; try { names = fs.readdirSync(dir); } catch { return out; }
  // outside the contract list: a file that throws is skipped with a warning (a literal row's error still stops the load)
  const req = n => { const f = path.join(dir, n); try { return fs.existsSync(f) ? require(f) : null; } catch (e) { return new Fault(e); } };
  for (const n of names.sort()) {
    const m = /^([a-z][a-z0-9-]*)\.recipe\.js$/.exec(n);
    if (!m || PARTS.some(p => p.id === m[1])) continue;
    out.push({ id: m[1], r: req(n), l: req(m[1] + '.lang.js'), c: req(m[1] + '.client.js') });
  }
  return out;
})();
PARTS.push(...EXTRA);
const IDS = PARTS.filter(p => !EXTRA.includes(p)).map(p => p.id);

// strings: the core rows, then each recipe's rows (prefix task.<id>.)
const lang = { en: {}, ru: {}, uk: {}, zh: {} };
const addRows = (rows, pre) => { for (const r of rows || []) { if (pre && !String(r[0]).startsWith(pre)) throw new Error('ext task: string ' + r[0] + ' must start with ' + pre); lang.en[r[0]] = r[1]; lang.ru[r[0]] = r[2]; lang.uk[r[0]] = r[3]; lang.zh[r[0]] = r[4]; } };
addRows(require('./lang'), 'task.');

// why a recipe file set cannot load (null: it can): its files threw, its id is wrong, it does not validate, a string is outside its
// prefix or its client script does not parse
function faultOf(p) {
  for (const [k, m] of [['recipe', p.r], ['lang', p.l], ['client', p.c]]) if (m instanceof Fault) return 'recipes/' + p.id + '.' + k + '.js: ' + String((m.error && m.error.message) || m.error).split('\n')[0];
  if (!p.r) return null;
  if (p.r.id !== p.id) return 'recipes/' + p.id + '.recipe.js has id ' + p.r.id;
  const errs = RC.validate(p.r, null, { kinds: (p.c && p.c.kinds) || [], ids: PARTS.map(x => x.id) }).filter(x => x.level === 'error');
  if (errs.length) return errs.map(x => x.msg).join('; ');
  const pre = 'task.' + p.id + '.', bad = (p.l || []).find(r => !Array.isArray(r) || !String(r[0]).startsWith(pre));
  if (p.l && !Array.isArray(p.l)) return 'recipes/' + p.id + '.lang.js must be a list of rows';
  if (bad) return 'string ' + String(Array.isArray(bad) ? bad[0] : bad).slice(0, 60) + ' must start with ' + pre;
  if (p.c && p.c.script != null) {
    if (typeof p.c.script !== 'string') return 'recipes/' + p.id + '.client.js script must be a string';
    try { new (require('vm').Script)(p.c.script, { filename: p.id + '.client.js' }); } catch (e) { return 'recipes/' + p.id + '.client.js script does not parse: ' + e.message; }
  }
  if (p.c && p.c.css != null && typeof p.c.css !== 'string') return 'recipes/' + p.id + '.client.js css must be a string';
  return null;
}
const FAULTS = [];
const list = [];
for (const p of PARTS) {
  const why = faultOf(p);
  if (why) { FAULTS.push({ id: p.id, error: why }); console.error('ext task: recipe ' + p.id + ' has a fault and is skipped: ' + why); p.r = null; p.l = null; p.c = null; continue; }
  addRows(p.l, 'task.' + p.id + '.');
  if (p.r) list.push(p.r);
}
for (const id of S.setRecipes(list, FAULTS)) if (!FAULTS.some(x => x.id === id)) FAULTS.push({ id, error: S.faults()[id] });
for (const x of FAULTS) { const p = PARTS.find(y => y.id === x.id); if (p && p.r) { p.r = null; p.l = null; p.c = null; } }

const routes = Object.assign({}, S.routes, S.recipeRoutes());
const remote = Object.keys(routes).filter(k => k.startsWith('GET '));
const C = require('./client');
const css = [C.css].concat(PARTS.map(p => (p.c && p.c.css) || '')).filter(Boolean).join('\n');
module.exports = {
  id: 'task',
  nav: null,
  tab: false,   // no screen: the script runs on every page (window.TASK, the row) and adds no tab (test-ext.js knows this flag)
  script: C.script(css) + '\n' + PARTS.map(p => (p.c && p.c.script) || '').filter(Boolean).join('\n'),
  lang,
  commands: {},
  routes,
  remote,
  recipes: list.map(r => r.id),
  IDS,                                   // the literal list (27 rows of the plan)
  EXTRA: EXTRA.filter(p => p.r).map(p => p.id),   // recipe files found in ./recipes outside the literal list
  FAULTS,                                // [{id, error}] recipes that failed to load (skipped; greyed in the catalogue)
};
