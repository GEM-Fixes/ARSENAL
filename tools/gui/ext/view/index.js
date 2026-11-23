// GUI-EXT view: file viewers. No tab of its own (tab:false, no nav): its script is on every page and sets window.VIEW, through which
// any page opens a file "in the relevant area": a kind with a home page jumps there (models -> Models, map files -> Maps), every other
// kind opens as a viewer tab in the Editor (sound, picture, video, font, shader, hex ...), and VIEW.mount puts a viewer inside any
// element. The framework reads only (./ref.js over ../files/lib); kinds are drop-in file sets in ./kinds (README.md here).
// The requires are literal so the single-exe bundler keeps each module; a kind file that is not there is skipped.
// Author: Imperator_Aug (ARSENAL, ia-cffab5e1)
'use strict';
const S = require('./server');
// a kind file that is missing is skipped; an error inside a kind file that is there is not hidden
const opt = (name, fn) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).split('\n')[0].includes(name)) return null; throw e; } };
const KINDS = ['hex', 'sound', 'picture', 'model', 'map', 'video', 'font', 'shader', 'misc'];
const PARTS = [
  { kind: 'hex', s: opt('hex.server', () => require('./kinds/hex.server')), c: opt('hex.client', () => require('./kinds/hex.client')), l: opt('hex.lang', () => require('./kinds/hex.lang')) },
  { kind: 'sound', s: opt('sound.server', () => require('./kinds/sound.server')), c: opt('sound.client', () => require('./kinds/sound.client')), l: opt('sound.lang', () => require('./kinds/sound.lang')) },
  { kind: 'picture', s: opt('picture.server', () => require('./kinds/picture.server')), c: opt('picture.client', () => require('./kinds/picture.client')), l: opt('picture.lang', () => require('./kinds/picture.lang')) },
  { kind: 'model', s: opt('model.server', () => require('./kinds/model.server')), c: opt('model.client', () => require('./kinds/model.client')), l: opt('model.lang', () => require('./kinds/model.lang')) },
  { kind: 'map', s: opt('map.server', () => require('./kinds/map.server')), c: opt('map.client', () => require('./kinds/map.client')), l: opt('map.lang', () => require('./kinds/map.lang')) },
  { kind: 'video', s: opt('video.server', () => require('./kinds/video.server')), c: opt('video.client', () => require('./kinds/video.client')), l: opt('video.lang', () => require('./kinds/video.lang')) },
  { kind: 'font', s: opt('font.server', () => require('./kinds/font.server')), c: opt('font.client', () => require('./kinds/font.client')), l: opt('font.lang', () => require('./kinds/font.lang')) },
  { kind: 'shader', s: opt('shader.server', () => require('./kinds/shader.server')), c: opt('shader.client', () => require('./kinds/shader.client')), l: opt('shader.lang', () => require('./kinds/shader.lang')) },
  { kind: 'misc', s: opt('misc.server', () => require('./kinds/misc.server')), c: opt('misc.client', () => require('./kinds/misc.client')), l: opt('misc.lang', () => require('./kinds/misc.lang')) },
];

// strings: the framework's rows, then each kind's rows (prefix view.<kind>.)
const lang = { en: {}, ru: {}, uk: {}, zh: {} };
const addRows = (rows, pre) => { for (const r of rows || []) { if (pre && !String(r[0]).startsWith(pre)) throw new Error('ext view: string ' + r[0] + ' must start with ' + pre); lang.en[r[0]] = r[1]; lang.ru[r[0]] = r[2]; lang.uk[r[0]] = r[3]; lang.zh[r[0]] = r[4]; } };
addRows(require('./lang'));
for (const p of PARTS) addRows(p.l, 'view.' + p.kind + '.');

// routes: the framework's, then each kind's (only under /api/x/view/<kind>/); remote = the read-only GET routes a phone may call
const routes = Object.assign({}, S.routes), remote = Object.keys(S.routes).filter(k => k.startsWith('GET '));
const serverKinds = [];
for (const p of PARTS) {
  if (!p.s) continue;
  const own = new RegExp('^(GET|POST) /api/x/view/' + p.kind + '/[a-z0-9/_-]+$');
  for (const [k, f] of Object.entries(p.s.routes || {})) {
    if (!own.test(k)) throw new Error('ext view: kind ' + p.kind + ' route ' + k + ' must be GET|POST /api/x/view/' + p.kind + '/...');
    if (routes[k]) throw new Error('ext view: route ' + k + ' exists');
    routes[k] = f;
  }
  for (const k of p.s.remote || []) if (k.startsWith('GET ') && routes[k] && (p.s.routes || {})[k]) remote.push(k);
  serverKinds.push({ kind: p.kind, exts: (p.s.exts || []).map(x => String(x).toLowerCase()), match: typeof p.s.match === 'function' ? p.s.match : null });
}
S.setKinds(serverKinds);
// SPEED: every viewer route reads ../files/lib's view of the game + mod through sync code (ref.js resolve, readKey, listKeys, the
// kinds). Each waits for files/lib vfsWarm first: the shared scan of the mod's folders, not blocking, so that view is found by
// signature instead of a 13-16 s walk on the first call. Same view, same answer; never throws, nothing for a request with no mod.
const warm = async (ctx, mod) => { try { const L = require('../files/lib'); if (mod && typeof L.vfsWarm === 'function') await L.vfsWarm(ctx, mod); } catch (e) { /* the route says it */ } };
for (const k of Object.keys(routes)) {
  const f = routes[k];
  routes[k] = async (url, body, ctx) => { await warm(ctx, (url && url.searchParams && url.searchParams.get('mod')) || (body && typeof body.mod === 'string' ? body.mod : '')); return f(url, body, ctx); };
}

const C = require('./client');
const css = [C.css].concat(PARTS.map(p => (p.c && p.c.css) || '')).filter(Boolean).join('\n');
module.exports = {
  id: 'view',
  nav: null,
  tab: false,   // no screen: the script runs on every page (window.VIEW) and adds no tab (test-ext.js knows this flag)
  script: C.script(css) + '\n' + PARTS.map(p => (p.c && p.c.script) || '').filter(Boolean).join('\n'),
  lang,
  commands: {},
  routes,
  remote,
  kinds: PARTS.filter(p => p.s || p.c).map(p => p.kind),
  KINDS,
};
