// GUI-EXT mapviz: the Map Viewer page (AS64, MoW:AS2 and Gates of Hell). Contract: tools/mapviz/README.md 1.10 (page parts,
// page API, part order), 5.5 (colour rule), 6.1 (routes), 9.3 (page rules); behaviour: 11.
// The page is built from parts in sub/ (one owner each, README section 1): <part>.client.js (a String.raw ES5 script),
// <part>.lang.json ({en,ru,uk,zh}, keys mapviz.<part>.*), <part>.server.js ({routes}), <part>.test.js. This file joins them.
// - The parts table is literal (the single-exe build only sees requires spelled out) and in README 1.10 order.
// - A part file that is absent is skipped (part not built yet). A part file that exists and throws, or that names a module
//   that is missing, fails loudly here: the GUI does not start with a broken part.
// - script = the skeleton's own script, then the built parts' client strings in table order.
// - lang = the skeleton's keys plus every part's; a key defined twice is an error. routes = every part's; a route twice is an error.
// - The skeleton's own script holds only the "not built yet" hint screen, and only while sub/shell.client.js is absent: the shell
//   defines the screen and the page API (README 1.10), so with the shell present the skeleton's hint is not used.
// tools/gui/ext/mapviz/README.md: how a part plugs in and how the coordinator registers the page.
// Author: Imperator_Aug (ARSENAL, ia-9d91fc93)
'use strict';
const path = require('path'), os = require('os');
const MV = require('../../../mapviz/mapviz');

// opt: the part file's export, or undefined when that very file is absent. A deeper missing module or any other throw passes
// on. The export is boxed so a file that exports null (present but broken) is not taken for an absent one.
const opt = (load, spec) => { const r = MV.opt(() => ({ v: load() }), spec, __filename); return r === null ? undefined : r.v; };

// README 1.10 part order. One literal line per part; tools/gui/ext/mapviz/test.js reads these lines.
const PARTS = [
  { part: 'shell', c: () => opt(() => require('./sub/shell.client'), './sub/shell.client'), l: () => opt(() => require('./sub/shell.lang.json'), './sub/shell.lang.json'), s: () => opt(() => require('./sub/shell.server'), './sub/shell.server') },
  { part: 'list', c: () => opt(() => require('./sub/list.client'), './sub/list.client'), l: () => opt(() => require('./sub/list.lang.json'), './sub/list.lang.json'), s: () => opt(() => require('./sub/list.server'), './sub/list.server') },
  { part: 'base', c: () => opt(() => require('./sub/base.client'), './sub/base.client'), l: () => opt(() => require('./sub/base.lang.json'), './sub/base.lang.json'), s: () => opt(() => require('./sub/base.server'), './sub/base.server') },
  { part: 'game', c: () => opt(() => require('./sub/game.client'), './sub/game.client'), l: () => opt(() => require('./sub/game.lang.json'), './sub/game.lang.json'), s: () => opt(() => require('./sub/game.server'), './sub/game.server') },
  { part: 'water', c: () => opt(() => require('./sub/water.client'), './sub/water.client'), l: () => opt(() => require('./sub/water.lang.json'), './sub/water.lang.json'), s: () => opt(() => require('./sub/water.server'), './sub/water.server') },
  { part: 'hover', c: () => opt(() => require('./sub/hover.client'), './sub/hover.client'), l: () => opt(() => require('./sub/hover.lang.json'), './sub/hover.lang.json'), s: () => opt(() => require('./sub/hover.server'), './sub/hover.server') },
  { part: 'measure', c: () => opt(() => require('./sub/measure.client'), './sub/measure.client'), l: () => opt(() => require('./sub/measure.lang.json'), './sub/measure.lang.json'), s: () => opt(() => require('./sub/measure.server'), './sub/measure.server') },
  { part: 'profile', c: () => opt(() => require('./sub/profile.client'), './sub/profile.client'), l: () => opt(() => require('./sub/profile.lang.json'), './sub/profile.lang.json'), s: () => opt(() => require('./sub/profile.server'), './sub/profile.server') },
  { part: 'layers', c: () => opt(() => require('./sub/layers.client'), './sub/layers.client'), l: () => opt(() => require('./sub/layers.lang.json'), './sub/layers.lang.json'), s: () => opt(() => require('./sub/layers.server'), './sub/layers.server') },
  { part: 'objects', c: () => opt(() => require('./sub/objects.client'), './sub/objects.client'), l: () => opt(() => require('./sub/objects.lang.json'), './sub/objects.lang.json'), s: () => opt(() => require('./sub/objects.server'), './sub/objects.server') },
  { part: 'card', c: () => opt(() => require('./sub/card.client'), './sub/card.client'), l: () => opt(() => require('./sub/card.lang.json'), './sub/card.lang.json'), s: () => opt(() => require('./sub/card.server'), './sub/card.server') },
  { part: 'strong', c: () => opt(() => require('./sub/strong.client'), './sub/strong.client'), l: () => opt(() => require('./sub/strong.lang.json'), './sub/strong.lang.json'), s: () => opt(() => require('./sub/strong.server'), './sub/strong.server') },
  { part: 'checks', c: () => opt(() => require('./sub/checks.client'), './sub/checks.client'), l: () => opt(() => require('./sub/checks.lang.json'), './sub/checks.lang.json'), s: () => opt(() => require('./sub/checks.server'), './sub/checks.server') },
  { part: 'pictures', c: () => opt(() => require('./sub/pictures.client'), './sub/pictures.client'), l: () => opt(() => require('./sub/pictures.lang.json'), './sub/pictures.lang.json'), s: () => opt(() => require('./sub/pictures.server'), './sub/pictures.server') },
  { part: 'export', c: () => opt(() => require('./sub/export.client'), './sub/export.client'), l: () => opt(() => require('./sub/export.lang.json'), './sub/export.lang.json'), s: () => opt(() => require('./sub/export.server'), './sub/export.server') },
  { part: 'style', c: () => opt(() => require('./sub/style.client'), './sub/style.client'), l: () => opt(() => require('./sub/style.lang.json'), './sub/style.lang.json'), s: () => opt(() => require('./sub/style.server'), './sub/style.server') },
];
const NAMES = PARTS.map(p => p.part);

// The skeleton's own strings (not a part's: no mapviz.<part>. prefix of a table part).
const LANG0 = {
  en: { 'mapviz.nav': 'Map Viewer', 'mapviz.page.notBuilt': 'The Map Viewer is not built yet. Its parts come in later builds of ARSENAL.' },
  ru: { 'mapviz.nav': '\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043a\u0430\u0440\u0442',
    'mapviz.page.notBuilt': '\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043a\u0430\u0440\u0442 \u0435\u0449\u0451 \u043d\u0435 \u0441\u043e\u0431\u0440\u0430\u043d. \u0415\u0433\u043e \u0447\u0430\u0441\u0442\u0438 \u0434\u043e\u0431\u0430\u0432\u044f\u0442\u0441\u044f \u0432 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0445 \u0441\u0431\u043e\u0440\u043a\u0430\u0445 ARSENAL.' },
  uk: { 'mapviz.nav': '\u041f\u0435\u0440\u0435\u0433\u043b\u044f\u0434 \u043c\u0430\u043f',
    'mapviz.page.notBuilt': '\u041f\u0435\u0440\u0435\u0433\u043b\u044f\u0434 \u043c\u0430\u043f \u0449\u0435 \u043d\u0435 \u0437\u0456\u0431\u0440\u0430\u043d\u043e. \u0419\u043e\u0433\u043e \u0447\u0430\u0441\u0442\u0438\u043d\u0438 \u0434\u043e\u0434\u0430\u0434\u0443\u0442\u044c\u0441\u044f \u0432 \u043d\u0430\u0441\u0442\u0443\u043f\u043d\u0438\u0445 \u0437\u0431\u0456\u0440\u043a\u0430\u0445 ARSENAL.' },
  zh: { 'mapviz.nav': '\u5730\u56fe\u67e5\u770b\u5668',
    'mapviz.page.notBuilt': '\u5730\u56fe\u67e5\u770b\u5668\u5c1a\u672a\u6784\u5efa\u3002\u5b83\u7684\u5404\u4e2a\u90e8\u5206\u5c06\u5728 ARSENAL \u7684\u540e\u7eed\u7248\u672c\u4e2d\u52a0\u5165\u3002' },
};

// The hint screen (ES5, page rules): one leaf, no call. It also gives the parts list, so a part loaded without the shell
// can push to it without stopping the page's script. Used only while the shell part is absent.
const HINT = [
  '// mapviz skeleton: the Map Viewer is not built yet (no shell part)',
  'EXT_SCREENS.mapviz=function(root){',
  " var leaf=h('div',{blk:'hint','class':'card','data-blkname':tx('mapviz.nav')},[h('h2',{text:tx('mapviz.nav')}),h('div',{'class':'hint',text:tx('mapviz.page.notBuilt')})]);",
  ' root.appendChild(leaf);',
  ' return {refresh:function(){},focus:function(){},view:function(v){}};',
  '};',
  'EXT_SCREENS.mapviz.parts=[];',
].join('\n');

const fail = msg => { throw new Error('mapviz page: ' + msg); };

// The picture cache follows the server's scratch folder. The cache root is toolcache.dir('mapviz'): %LOCALAPPDATA%ARSENALcachemapviz
// unless ARSENAL_CACHE names another root (tools/lib/toolcache.js; read on every call, and the job child processes inherit it).
// A normal start gives every route ctx.tmpRoot = <os temp>/arsenal-gui (gui.js): the default cache, untouched. A server started on a
// scratch folder (start({tmpRoot}), the tests and reviewers) gets <tmpRoot>/cache instead, so nothing lands in the real per-user cache.
// An ARSENAL_CACHE somebody else set (a test, portable use) always wins; the value set here is taken back when a normal server answers.
// Set as ARSENAL_CACHE_MAPVIZ (the mapviz root only, lib/toolcache), never ARSENAL_CACHE: the env is the whole process's, and every
// other page's child processes (check, wouldload, refcheck, testplan) then built their whole-game caches cold in an empty folder.
const CACHE_VAR = 'ARSENAL_CACHE_MAPVIZ';
let CACHE_SET = null;
function cacheRootFor(ctx, env = process.env, tmp = os.tmpdir()) {
  const t = ctx && typeof ctx.tmpRoot === 'string' && path.isAbsolute(ctx.tmpRoot) ? path.resolve(ctx.tmpRoot) : '';
  const scratch = t && t.toLowerCase() !== path.resolve(tmp, 'arsenal-gui').toLowerCase();
  if (env[CACHE_VAR] && env[CACHE_VAR] !== CACHE_SET) return env[CACHE_VAR];   // set outside: keep
  if (env.ARSENAL_CACHE) { if (CACHE_SET) { delete env[CACHE_VAR]; CACHE_SET = null; } return env.ARSENAL_CACHE; }   // set outside: keep
  if (scratch) { CACHE_SET = env[CACHE_VAR] = path.join(t, 'cache'); return CACHE_SET; }
  if (CACHE_SET) { delete env[CACHE_VAR]; CACHE_SET = null; }
  return '';   // the default per-user cache
}
const withCache = fn => function (u, body, ctx) { cacheRootFor(ctx); return fn.apply(this, arguments); };

// build(parts) -> the ext object. parts = [{part, c(), l(), s()}] (the literal table, or fromDir's for a test).
function build(parts) {
  const lang = {}, routes = {}, from = {}, at = {}, scripts = [], built = [];
  for (const code of Object.keys(LANG0)) { lang[code] = Object.assign({}, LANG0[code]); for (const k of Object.keys(LANG0[code])) from[code + ' ' + k] = 'skeleton'; }
  let shell = false;
  for (const p of parts) {
    const c = p.c(), l = p.l(), s = p.s();
    // undefined = the file is absent (skipped); anything else, null included, is the file's export and must be right.
    if (c !== undefined && typeof c !== 'string') fail('sub/' + p.part + '.client.js must export a string');
    if (l !== undefined && (!l || typeof l !== 'object' || Array.isArray(l))) fail('sub/' + p.part + '.lang.json must hold {en, ru, uk, zh}');
    if (s !== undefined && (!s || typeof s.routes !== 'object' || !s.routes || Array.isArray(s.routes))) fail('sub/' + p.part + '.server.js must export {routes}');
    if (c === undefined && l === undefined && s === undefined) continue;
    built.push(p.part);
    if (c !== undefined) { scripts.push('// mapviz part ' + p.part + '\n' + c); if (p.part === 'shell') shell = true; }
    if (l !== undefined) for (const code of Object.keys(l)) {
      const L = l[code];
      if (!L || typeof L !== 'object' || Array.isArray(L)) fail('sub/' + p.part + '.lang.json: ' + code + ' is not an object');
      lang[code] = lang[code] || {};
      for (const k of Object.keys(L)) {
        if (Object.prototype.hasOwnProperty.call(lang[code], k)) fail('lang key ' + k + ' (' + code + ') of part ' + p.part + ' is already defined by ' + from[code + ' ' + k]);
        lang[code][k] = L[k]; from[code + ' ' + k] = p.part;
      }
    }
    if (s !== undefined) for (const r of Object.keys(s.routes)) {
      if (Object.prototype.hasOwnProperty.call(routes, r)) fail('route ' + r + ' of part ' + p.part + ' is already defined by ' + at[r]);
      routes[r] = typeof s.routes[r] === 'function' ? withCache(s.routes[r]) : s.routes[r]; at[r] = p.part;
    }
  }
  return {
    id: 'mapviz', nav: 'mapviz.nav', adv: false, after: 'maps',
    script: (shell ? [] : [HINT]).concat(scripts).join('\n'),
    lang, commands: {}, routes,
    _t: { built, shell },
  };
}

// fromDir(dir) -> the same table, read from a folder (tests: fake parts in a scratch dir), through the same opt as the literal
// table, so the tests exercise the loader the GUI uses. Absent file: skipped; present: required, and a fault passes on.
function fromDir(dir) {
  const one = f => () => opt(() => require(f), f);
  return NAMES.map(part => ({ part, c: one(path.join(dir, part + '.client.js')), l: one(path.join(dir, part + '.lang.json')), s: one(path.join(dir, part + '.server.js')) }));
}

module.exports = build(PARTS);
Object.assign(module.exports._t, { build, fromDir, NAMES, LANG0, HINT, cacheRootFor });
