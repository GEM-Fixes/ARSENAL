// remote: LAN Remote, the GUI viewed from another device on the network (gui.js --remote, or the LAN Remote button at the top of
// the PC page). View only.
//   key: 192 bits from crypto.randomBytes, kept in the settings file (settings.js __priv.remoteKey) so the link survives a restart;
//        "New link" replaces it (the old link and its cookie die at once). Compared in constant time (sha256 + timingSafeEqual).
//   link: http://<lan ip>:<port>/?k=<key> once; the server answers with an HttpOnly SameSite=Lax cookie (Strict is not sent after a link opened from another app, a QR scanner) and a redirect to the clean
//        address, so the key does not stay in the address bar or the history.
//   refusals: wrong or missing key = 403 without detail; 20 bad tries from one address = that address refused for 10 minutes.
//   view only: ALLOW below is the whole list of routes a remote session may call (default deny: a new route is closed until listed).
//        Path arguments (query values and top-level body strings that look like absolute paths) must lie under the folders the PC
//        page already shows (game folders, mod folders and roots in the settings, the server's temp root); ".." is refused; the real
//        path (links and junctions followed) must lie under a root too. Routes that read files ask again per file (gui.js ctx.pathOk).
// Author: Imperator_Aug (ARSENAL, ia-95419381)
'use strict';
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');

const COOKIE = 'as2rk';
const BAD_MAX = 20, BAD_MS = 10 * 60 * 1000;

// the read-only routes a remote device may call (method + path). Everything else answers 403 "view only on this device".
const ALLOW = new Set([
  'GET /', 'GET /api/live', 'GET /api/health', 'GET /api/commands', 'GET /api/settings', 'GET /api/game', 'GET /api/installed',
  'GET /api/mods', 'GET /api/mod', 'GET /api/explain', 'GET /api/limit', 'GET /api/text', 'GET /api/peek', 'GET /api/jobs',
  'GET /api/x/help/glossary', 'GET /api/x/help/chapters', 'GET /api/x/help/chapter', 'GET /api/x/help/limit',
  'GET /api/x/docs/status', 'GET /api/x/docs/list', 'GET /api/x/docs/file', 'GET /api/x/docs/search', 'GET /api/x/docs/limit',
  'GET /api/x/docs/book', 'GET /api/x/docs/booksearch', 'GET /api/x/docs/whole',   // whole: served under the CSP sandbox (gui.js rawHead)
  'GET /api/x/guides/status', 'GET /api/x/guides/gaps', 'GET /api/x/units/status', 'GET /api/x/models/locate',
  'GET /api/x/maps/list', 'GET /api/x/maps/picture', 'GET /api/x/art/unit', 'GET /api/x/art/camo', 'GET /api/x/art/icons',
  'GET /api/x/art/assets', 'GET /api/x/logs/find', 'GET /api/x/logs/enabled', 'GET /api/x/logs/ticklist',
  'GET /api/x/share/mods', 'GET /api/x/share/info', 'GET /api/x/goh/status', 'GET /api/x/goh/units', 'GET /api/x/goh/donors',
  'GET /api/x/bots/buys', 'GET /api/x/bots/table', 'GET /api/x/doctrine/data', 'GET /api/x/doctrine/voice',
  'GET /api/x/doctrine/profile', 'GET /api/x/doctrine/detect', 'GET /api/x/pro/tools',
  // browsing files (Editor, Mod files), read only: the mod tree with pak entries, the game's layered folders, which copy wins, every
  // copy of one game file, open a text file (files/open answers editable:false to a phone), the editor's own script and style.
  // Each read file is checked again inside the route (ctx.pathOk: real path under a root). Not here: ide/words (it starts the entity
  // index build in the background), ide/lint, hover, def, refs (the same index), ide/log (the game log lives in the user folder).
  'GET /api/x/files/tree', 'GET /api/x/files/which', 'GET /api/x/files/open', 'GET /api/x/ide/vdir', 'GET /api/x/ide/copies', 'GET /api/x/ide/asset',
  'GET /api/x/ide/tree', 'GET /api/x/ide/vfind',   // the explorer's paged mod tree and its name search (same path checks as files/tree and ide/vdir)
  // reads the screens make by POST (a JSON query, nothing written)
  'POST /api/x/units/search', 'POST /api/x/units/stats', 'POST /api/x/units/describe', 'POST /api/x/units/compare',
  'POST /api/x/balance/table', 'POST /api/x/guides/search', 'POST /api/x/guides/show', 'POST /api/x/guides/faq',
  'POST /api/x/files/search', 'POST /api/x/ide/symbols',   // text search in the mod (and the game's files), the outline of one file
  // the remote page's screen for a PC page that follows it: {screen} only, a known screen id; in memory, dropped unless the PC switch is on
  'POST /api/follow/remote',
  // file viewers (ext view), read only, each file checked by ctx.pathOk: the bytes, the facts, one 64 KB page
  'GET /api/x/view/bytes', 'GET /api/x/view/info', 'GET /api/x/view/hex',
  // Missions and Game Modes (ext missions, modes), read only: a map's modes with flags, start points and bots, my mod's loose maps,
  // the game modes list. facts and mine ask ctx.pathOk for the mod folders they read or walk (ext/missions/index.js). missions/diff runs
  // misdiff (it reads the game and the mod, writes nothing), one at a time for remote devices. Not here: missions/add, modes/bots.
  'GET /api/x/missions/facts', 'GET /api/x/missions/mine', 'GET /api/x/modes/list', 'POST /api/x/missions/diff',
  // Docs > Historical Sources (ext/docs/routes.js hist*): the source list, its groups, one saved text, the text search. They read only the
  // tool's own data through tools/gemindex/lib/history.js (the guide index and the WW2 sources folder it finds itself, the database opened
  // read only); the body names no file (group, q, id, offset, limit, filters), and Discord rows are never passed on.
  'POST /api/x/docs/history/groups', 'POST /api/x/docs/history/rows', 'POST /api/x/docs/history/text', 'POST /api/x/docs/history/search',
  // Guides (ext/guides/routes.js): where the links and saved texts came from, the tools list (both read the GEM index like guides/search:
  // the default index, or body.dir, which the path check above confines), and the progress of an update the PC started (memory only).
  // Not here: guides/update/plan, start, stop (they plan, go online, stop a run) and guides/export (writes a file).
  'POST /api/x/guides/sources', 'POST /api/x/guides/tools', 'GET /api/x/guides/update/progress',
  // the search boxes' read-only name lists (searchKit index and Browse): names only, nothing is written
  'GET /api/x/logs/units', 'GET /api/x/art/names', 'GET /api/x/pro/names', 'GET /api/x/help/limitids', 'GET /api/x/docs/heads',
  'GET /api/x/bots/units', 'GET /api/x/maps/entities', 'GET /api/x/goh/names', 'POST /api/x/guides/titles', 'POST /api/x/docs/history/titles',
  'POST /api/x/units/index', 'POST /api/x/units/weapons',
  // Left closed on purpose: POST /api/x/maps/check (Missions "Check my missions"): milint also reads the .lintrc it finds walking up from
  // the mod folder (folders above every root, not asked through ctx.pathOk), and each call starts a milint run of up to 300 s.
]);
// and each viewer kind's own read-only GET routes (its `remote` list, ext/view/index.js); a kind that fails to load adds none
try { for (const r of require('./ext/view').remote || []) if (/^GET \/api\/x\/view\//.test(r)) ALLOW.add(r); } catch { /* no viewers */ }
// and the guided task's read-only GET routes (ext/task/index.js `remote`): the row and saved tasks show, nothing is written
try { for (const r of require('./ext/task').remote || []) if (/^GET \/api\/x\/task\//.test(r)) ALLOW.add(r); } catch { /* no task ext */ }
const allowed = (method, pathname) => ALLOW.has(method + ' ' + pathname);

function newKey() { return crypto.randomBytes(24).toString('base64url'); }
const digest = s => crypto.createHash('sha256').update(String(s)).digest();
function keyEq(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false; return crypto.timingSafeEqual(digest(a), digest(b)); }

// this machine's IPv4 LAN addresses (not loopback, not link-local 169.254)
function lanAddrs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces() || {})) for (const a of list || []) {
    const fam = a.family === 4 ? 'IPv4' : a.family;
    if (fam === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address) && !out.includes(a.address)) out.push(a.address);
  }
  return out;
}

function cookieOf(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([A-Za-z0-9_-]{1,200})').exec(String(req.headers.cookie || ''));
  return m ? m[1] : null;
}
const setCookie = key => COOKIE + '=' + key + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000';

// bad tries per address: 20 within 10 minutes = refused for 10 minutes
function throttle(now = () => Date.now()) {
  const m = new Map();
  return {
    locked(ip) { const e = m.get(ip); return !!e && e.until > now(); },
    bad(ip) {
      let e = m.get(ip); const t = now();
      if (!e || t - e.t0 > BAD_MS) { e = { n: 0, t0: t, until: 0 }; m.delete(ip); if (m.size > 2000) m.delete(m.keys().next().value); m.set(ip, e); }
      if (++e.n >= BAD_MAX) e.until = t + BAD_MS;
    },
    good(ip) { const e = m.get(ip); if (e && !(e.until > now())) m.delete(ip); },
  };
}

// path arguments of a remote request: every value that looks like an absolute path must lie under one of roots; '..' never.
// Twice: as written (lexical), and again after links: the real path of the deepest part that exists (symlinks, junctions, subst)
// must lie under the real path of a root, so a link inside a root that leads out of every root is refused.
const ABS = /^(?:[A-Za-z]:[\\/]|[\\/])/;
const low = p => p.toLowerCase().replace(/[\\/]+$/, '');
const under = (p, R) => R.some(r => p === r || p.startsWith(r + path.sep) || p.startsWith(r + '/'));
// real path of p: realpath of the deepest existing folder or file, the rest (not there yet, a pak entry name) appended as written
function realOf(p) {
  let d = path.resolve(p); const rest = [];
  for (let i = 0; i < 200; i++) {
    try { const r = fs.realpathSync.native(d); return rest.length ? path.join(r, ...rest.reverse()) : r; } catch (e) { /* not there: one up */ }
    const up = path.dirname(d); if (up === d) return path.resolve(p);
    rest.push(path.basename(d)); d = up;
  }
  return path.resolve(p);
}
// a root whose real path is a whole drive or the user folder would open everything: dropped (fail closed)
const wideRoot = r => path.parse(r).root === r || low(r) === low(path.resolve(os.homedir()));
// roots: an array of folders, or rootSet(array) made once for many checks (the real path of each root is looked up once)
function rootSet(roots) {
  const base = roots.filter(Boolean).map(r => path.resolve(r));
  return { R: base.map(low), RR: base.map(realOf).filter(r => !wideRoot(r)).map(low) };
}
function pathRefusal(values, roots) {
  const { R, RR } = Array.isArray(roots) ? rootSet(roots) : roots;
  const flat = [], walk = (v, d) => { if (d > 6 || v == null) return; if (typeof v === 'string') flat.push(v); else if (typeof v === 'object') Object.values(v).forEach(x => walk(x, d + 1)); };
  walk(values, 0);   // nested body values too
  for (const v of flat) {
    if (!v) continue;
    if (/(^|[\\/])\.\.([\\/]|$)/.test(v) || v.includes('\0') || /^[A-Za-z]:(?![\\/])/.test(v)) return 'path';   // "C:name" = relative to that drive's current folder
    if (!ABS.test(v)) continue;
    if (!under(low(path.resolve(v)), R)) return 'path';
    if (!under(low(realOf(v)), RR)) return 'path';
  }
  return null;
}
// a phone's game override (?game= or body.game) must be a full path (then pathRefusal checks it): a relative one is resolved against
// the server's working folder, which is no root
const gameRefusal = v => (typeof v === 'string' && v !== '' && !ABS.test(v) ? 'path' : null);
// absolute folders named in the window settings (game folders, mods, mod roots): walks the values of the given keys
function settingsRoots(all) {
  const out = [];
  const walk = (v, d) => { if (d > 5 || v == null) return; if (typeof v === 'string') { if (ABS.test(v) && !/^[\\/]{2}/.test(v)) out.push(v); return; }
    if (Array.isArray(v)) v.forEach(x => walk(x, d + 1)); else if (typeof v === 'object') Object.values(v).forEach(x => walk(x, d + 1)); };
  for (const k of Object.keys(all || {})) if (/^as2gui\.(games|game|mod|roots|modByPage(\..*)?)$/.test(k)) walk(all[k], 0);
  // a drive root or the home folder named as a mod root would open everything: never a root here
  return out.filter(p => { const r = path.resolve(p); return path.parse(r).root !== r && r.toLowerCase() !== path.resolve(os.homedir()).toLowerCase(); });
}

module.exports = { ALLOW, allowed, newKey, keyEq, lanAddrs, cookieOf, setCookie, throttle, pathRefusal, gameRefusal, realOf, rootSet, settingsRoots, COOKIE, BAD_MAX, BAD_MS };
