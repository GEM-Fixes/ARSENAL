// kit index: loads the Code Pieces data (pieces and lang rows of every group), compiles the templates, answers the route.
//   load() -> { pieces, sections, views, rows, groups:[{ id, state:'ok'|'absent'|'error', n, error? }], errors:[text] }
//     raw, for tests; rows = { key: [en, ru, uk, zh] }. A group whose files are missing is 'absent'; a group that fails any
//     other way is 'error' with its name and the message, and the other groups still load.
//   catalog(kind, lang, { game }) -> { v, kind, lang, game, sections, views, pieces, words, kinds }   (tools/ide/README.md
//     "tools/ide/kit"; kinds = { <kitKind>: title } so the page can name a kind in a refusal). Throws an Error with
//     .status 400 for a bad kind or lang. ia-entity gets its pieces plus the sdl pieces, every other known kind the sdl
//     pieces except bot-lua (a Lua script is not SDL text: no pieces), 'none' no pieces.
//     A piece's notKinds (kit kind ids) leaves it out of those kinds (an sdl piece that is no interaction code). Memo per kind, lang and game.
//     o.game = a game id or exe word ('as64' | 'mowas2' | 'mowas_2' | 'goh', lib/games) or, as before, a has-game flag (true/false);
//     o.gameId = the game id next to a flag ({ game: true, gameId: 'goh' }); it wins over a string o.game.
//     The answer keeps game = has-game flag and adds gameId (the id; absent for a flag, so that answer is as before). Under 'goh' the words are those of
//     words.goh.json (GoH events GHINT-15, GHINT-17, GoH terrains and helper events), the pieces listed in its hidden (a block word
//     the AS2 files have and the GoH files have not [I]) are left out and named in hidden:[{ id, words }], and v is the GoH one.
//     AS64 and MoW:AS2 get the same pieces and words (MoW:AS2 has the AS2 interaction files; words.json is built from mowas_2).
//   Round 2 (2026-11-21): the 31 groups of GROUPS_R2 (each absent until its files land); catalog passes a piece's no,
//     size, mp and whole through (absent on v1 pieces). A kind gets the pieces whose kinds hold it and whose section its
//     tree lists, plus the sdl pieces (sdl.any, sdl.files) as before.
//   _make(read) -> { load, catalog }   the same over other data (tests): read() -> [{ id, pieces:{ mod|absent|error },
//     lang:{ mod|absent|error } }]
// Author: Imperator_Aug (ARSENAL, ia-a6987fff)
'use strict';
const crypto = require('crypto');
const kitKinds = require('./kinds'), kitPlan = require('./plan'), SEC = require('./sections'), WORDS = require('./words');
const GAMES = require('../../lib/games');
// the words of a game: GoH its own file when present (words.js --goh --write), else the AS2 words
const wordsFor = id => (id === 'goh' && typeof WORDS.goh === 'function' && WORDS.goh()) || WORDS;

const GROUPS_V1 = ['ia-start', 'ia-ideas-1', 'ia-ideas-2', 'ia-ideas-3', 'ia-when-1', 'ia-when-2', 'ia-if-1', 'ia-if-2', 'ia-do-1', 'ia-do-2',
  'ia-do-3', 'ia-do-4', 'ia-pat', 'ia-adv-1', 'ia-adv-2', 'sdl'];
// round 2 (2026-11-21): the 643 approved pieces groups); a group not written yet is 'absent'
const GROUPS_R2 = ['ter-1', 'ia2-forms-1', 'ia2-forms-2', 'ia2-pat', 'ia2-ideas-1', 'ia2-ideas-2', 'ia2-ideas-3', 'ia2-sys',
  'ent-a-1', 'ent-a-2', 'ent-a-3', 'ent-b-1', 'ent-b-2', 'ent-c-1', 'ent-c-2', 'ent-e-1', 'ent-e-2',
  'mi-start-1', 'mi-start-2', 'mi-start-3', 'mi-lang-1', 'mi-lang-2', 'mi-lang-3', 'mi-lang-4',
  'mi-pat-1', 'mi-pat-2', 'mi-pat-3', 'mi-idea-1', 'mi-idea-2', 'mi-sys-1', 'mi-sys-2'];
const GROUPS = GROUPS_V1.concat(GROUPS_R2);
const LANGS = ['en', 'ru', 'uk', 'zh'];
// literal paths, one per file (the single-exe bundler follows them); a missing file is an absent group
const PIECE_FILES = {
  'ia-start': () => require('./pieces/ia-start'),
  'ia-ideas-1': () => require('./pieces/ia-ideas-1'),
  'ia-ideas-2': () => require('./pieces/ia-ideas-2'),
  'ia-ideas-3': () => require('./pieces/ia-ideas-3'),
  'ia-when-1': () => require('./pieces/ia-when-1'),
  'ia-when-2': () => require('./pieces/ia-when-2'),
  'ia-if-1': () => require('./pieces/ia-if-1'),
  'ia-if-2': () => require('./pieces/ia-if-2'),
  'ia-do-1': () => require('./pieces/ia-do-1'),
  'ia-do-2': () => require('./pieces/ia-do-2'),
  'ia-do-3': () => require('./pieces/ia-do-3'),
  'ia-do-4': () => require('./pieces/ia-do-4'),
  'ia-pat': () => require('./pieces/ia-pat'),
  'ia-adv-1': () => require('./pieces/ia-adv-1'),
  'ia-adv-2': () => require('./pieces/ia-adv-2'),
  'sdl': () => require('./pieces/sdl'),
  'ter-1': () => require('./pieces/ter-1'),
  'ia2-forms-1': () => require('./pieces/ia2-forms-1'),
  'ia2-forms-2': () => require('./pieces/ia2-forms-2'),
  'ia2-pat': () => require('./pieces/ia2-pat'),
  'ia2-ideas-1': () => require('./pieces/ia2-ideas-1'),
  'ia2-ideas-2': () => require('./pieces/ia2-ideas-2'),
  'ia2-ideas-3': () => require('./pieces/ia2-ideas-3'),
  'ia2-sys': () => require('./pieces/ia2-sys'),
  'ent-a-1': () => require('./pieces/ent-a-1'),
  'ent-a-2': () => require('./pieces/ent-a-2'),
  'ent-a-3': () => require('./pieces/ent-a-3'),
  'ent-b-1': () => require('./pieces/ent-b-1'),
  'ent-b-2': () => require('./pieces/ent-b-2'),
  'ent-c-1': () => require('./pieces/ent-c-1'),
  'ent-c-2': () => require('./pieces/ent-c-2'),
  'ent-e-1': () => require('./pieces/ent-e-1'),
  'ent-e-2': () => require('./pieces/ent-e-2'),
  'mi-start-1': () => require('./pieces/mi-start-1'),
  'mi-start-2': () => require('./pieces/mi-start-2'),
  'mi-start-3': () => require('./pieces/mi-start-3'),
  'mi-lang-1': () => require('./pieces/mi-lang-1'),
  'mi-lang-2': () => require('./pieces/mi-lang-2'),
  'mi-lang-3': () => require('./pieces/mi-lang-3'),
  'mi-lang-4': () => require('./pieces/mi-lang-4'),
  'mi-pat-1': () => require('./pieces/mi-pat-1'),
  'mi-pat-2': () => require('./pieces/mi-pat-2'),
  'mi-pat-3': () => require('./pieces/mi-pat-3'),
  'mi-idea-1': () => require('./pieces/mi-idea-1'),
  'mi-idea-2': () => require('./pieces/mi-idea-2'),
  'mi-sys-1': () => require('./pieces/mi-sys-1'),
  'mi-sys-2': () => require('./pieces/mi-sys-2')
};
const LANG_FILES = {
  'ia-start': () => require('./lang/ia-start'),
  'ia-ideas-1': () => require('./lang/ia-ideas-1'),
  'ia-ideas-2': () => require('./lang/ia-ideas-2'),
  'ia-ideas-3': () => require('./lang/ia-ideas-3'),
  'ia-when-1': () => require('./lang/ia-when-1'),
  'ia-when-2': () => require('./lang/ia-when-2'),
  'ia-if-1': () => require('./lang/ia-if-1'),
  'ia-if-2': () => require('./lang/ia-if-2'),
  'ia-do-1': () => require('./lang/ia-do-1'),
  'ia-do-2': () => require('./lang/ia-do-2'),
  'ia-do-3': () => require('./lang/ia-do-3'),
  'ia-do-4': () => require('./lang/ia-do-4'),
  'ia-pat': () => require('./lang/ia-pat'),
  'ia-adv-1': () => require('./lang/ia-adv-1'),
  'ia-adv-2': () => require('./lang/ia-adv-2'),
  'sdl': () => require('./lang/sdl'),
  'ter-1': () => require('./lang/ter-1'),
  'ia2-forms-1': () => require('./lang/ia2-forms-1'),
  'ia2-forms-2': () => require('./lang/ia2-forms-2'),
  'ia2-pat': () => require('./lang/ia2-pat'),
  'ia2-ideas-1': () => require('./lang/ia2-ideas-1'),
  'ia2-ideas-2': () => require('./lang/ia2-ideas-2'),
  'ia2-ideas-3': () => require('./lang/ia2-ideas-3'),
  'ia2-sys': () => require('./lang/ia2-sys'),
  'ent-a-1': () => require('./lang/ent-a-1'),
  'ent-a-2': () => require('./lang/ent-a-2'),
  'ent-a-3': () => require('./lang/ent-a-3'),
  'ent-b-1': () => require('./lang/ent-b-1'),
  'ent-b-2': () => require('./lang/ent-b-2'),
  'ent-c-1': () => require('./lang/ent-c-1'),
  'ent-c-2': () => require('./lang/ent-c-2'),
  'ent-e-1': () => require('./lang/ent-e-1'),
  'ent-e-2': () => require('./lang/ent-e-2'),
  'mi-start-1': () => require('./lang/mi-start-1'),
  'mi-start-2': () => require('./lang/mi-start-2'),
  'mi-start-3': () => require('./lang/mi-start-3'),
  'mi-lang-1': () => require('./lang/mi-lang-1'),
  'mi-lang-2': () => require('./lang/mi-lang-2'),
  'mi-lang-3': () => require('./lang/mi-lang-3'),
  'mi-lang-4': () => require('./lang/mi-lang-4'),
  'mi-pat-1': () => require('./lang/mi-pat-1'),
  'mi-pat-2': () => require('./lang/mi-pat-2'),
  'mi-pat-3': () => require('./lang/mi-pat-3'),
  'mi-idea-1': () => require('./lang/mi-idea-1'),
  'mi-idea-2': () => require('./lang/mi-idea-2'),
  'mi-sys-1': () => require('./lang/mi-sys-1'),
  'mi-sys-2': () => require('./lang/mi-sys-2')
};
function guard(fn, rel) {
  try { return { mod: fn() }; }
  catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).split('\n')[0].indexOf(rel) >= 0) return { absent: true };
    return { error: e };
  }
}
function readReal() {
  return GROUPS.map(id => ({ id, pieces: guard(PIECE_FILES[id], 'pieces/' + id), lang: guard(LANG_FILES[id], 'lang/' + id) }));
}
function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

function make(read) {
  let loaded = null;
  const memo = new Map();
  function load() {
    if (loaded) return loaded;
    const rows = {}, pieces = [], groups = [], errors = [], ids = new Set();
    const addRows = (list, from) => {
      if (!Array.isArray(list)) { errors.push(from + ': lang file is not a list of rows'); return; }
      for (const r of list) {
        if (!Array.isArray(r) || typeof r[0] !== 'string') { errors.push(from + ': a lang row is not [key, en, ru, uk, zh]'); continue; }
        if (rows[r[0]]) { errors.push(from + ': lang key ' + r[0] + ' is given twice'); continue; }
        rows[r[0]] = [1, 2, 3, 4].map(i => typeof r[i] === 'string' ? r[i] : '');
      }
    };
    addRows(require('./lang/common'), 'common');
    for (const g of read()) {
      const st = { id: g.id, state: 'ok', n: 0 };
      groups.push(st);
      if (g.pieces.absent) { st.state = 'absent'; continue; }
      if (g.pieces.error) { st.state = 'error'; st.error = String(g.pieces.error && g.pieces.error.message || g.pieces.error); errors.push(g.id + ': pieces file: ' + st.error); continue; }
      const m = g.pieces.mod;
      if (!m || !Array.isArray(m.pieces)) { st.state = 'error'; st.error = 'module.exports is not { group, pieces:[...] }'; errors.push(g.id + ': ' + st.error); continue; }
      if (g.lang.error) { st.state = 'error'; st.error = 'lang file: ' + String(g.lang.error && g.lang.error.message || g.lang.error); errors.push(g.id + ': ' + st.error); continue; }
      if (g.lang.absent) errors.push(g.id + ': lang file is missing (titles fall back to ids)');
      else addRows(g.lang.mod, g.id);
      for (const p of m.pieces) {
        if (!p || typeof p.id !== 'string' || typeof p.code !== 'string') { errors.push(g.id + ': a piece has no id or no code'); continue; }
        if (ids.has(p.id)) { errors.push(g.id + ': piece id ' + p.id + ' is given twice'); continue; }
        ids.add(p.id);
        pieces.push(Object.assign({ group: g.id }, p));
        st.n++;
      }
    }
    const sections = SEC.SECTIONS.map(s => Object.assign({}, s));
    const v = crypto.createHash('sha1').update(JSON.stringify({ pieces, rows, sections, views: SEC.VIEWS, words: WORDS })).digest('hex').slice(0, 12);
    loaded = { pieces, sections, views: SEC.VIEWS, rows, groups, errors, v };
    return loaded;
  }
  function catalog(kind, lang, o) {
    if (typeof kind !== 'string' || !/^[a-z][a-z0-9-]{1,23}$/.test(kind)) throw bad('bad kind');
    if (LANGS.indexOf(lang) < 0) throw bad('bad lang');
    const K = kitKinds();
    if (kind !== 'none' && !K.KINDS.some(k => k.id === kind)) throw bad('bad kind');
    const gw = o ? (typeof o.gameId === 'string' ? o.gameId : typeof o.game === 'string' ? o.game : null) : null;
    const g = gw ? GAMES.get(gw) : null;
    const game = !!(o && o.game), gameId = g ? g.id : null, mk = kind + '|' + lang + '|' + game + '|' + (gameId || '');
    if (memo.has(mk)) return memo.get(mk);
    const L = load(), li = LANGS.indexOf(lang), P = kitPlan(), W = wordsFor(gameId);
    const hid = gameId === 'goh' && W !== WORDS && W.hidden ? W.hidden : {}, hidden = [];
    const t = key => { const r = L.rows[key]; return r ? (r[li] || r[0] || null) : null; };
    const en = key => { const r = L.rows[key]; return r ? (r[0] || null) : null; };
    const secs = kind === 'none' ? [] : SEC.forKind(kind);
    const secIds = new Set(secs.map(s => s.id));
    const sections = secs.map(s => {
      const x = { id: s.id, parent: s.parent, title: t('ide.kit.s.' + s.id) || s.id, order: s.order };
      if (s.adv) x.adv = true;
      if (s.view) x.view = true;
      return x;
    });
    const views = {};
    for (const id of Object.keys(L.views)) if (secIds.has(id)) views[id] = L.views[id].slice();
    const pieces = [];
    for (const p of L.pieces) {
      const kinds = Array.isArray(p.kinds) ? p.kinds : [];
      const notKinds = Array.isArray(p.notKinds) ? p.notKinds : [];
      if (kind === 'none' || !(kinds.indexOf(kind) >= 0 || (kinds.indexOf('sdl') >= 0 && kind !== 'bot-lua')) || notKinds.indexOf(kind) >= 0 || !secIds.has(p.sec)) continue;
      if (Object.prototype.hasOwnProperty.call(hid, p.id)) { hidden.push({ id: p.id, words: hid[p.id].slice() }); continue; }
      const base = 'ide.kit.p.' + p.id;
      const parts = P.parse(p.code, p.f || {}).map(x => {
        if (typeof x === 'string' || x.caret) return x;
        const y = Object.assign({}, x);
        y.label = t(base + '.f.' + x.f) || t('ide.kit.fk.' + x.k) || x.f;
        const h = t(base + '.f.' + x.f + '.h'); if (h) y.hint = h;
        return y;
      });
      const q = {
        id: p.id, sec: p.sec, title: t(base) || p.id, titleEn: en(base) || p.id, what: t(base + '.d') || '',
        kinds: kinds.slice(), scope: (p.scope || []).slice(), role: p.role, parts, wrap: !!p.wrap, needs: (p.needs || []).slice(),
        event: p.event || null, tag: p.tag, short: !!p.short, lim: (p.lim || []).slice(), src: p.src || '', adv: !!p.adv, task: p.task == null ? null : p.task
      };
      const w = t(base + '.w'); if (w) q.watch = w;
      const n = t(base + '.n'); if (n) q.needsText = n;
      if (Array.isArray(p.events) && p.events.length) q.events = p.events.slice();
      if (notKinds.length) q.notKinds = notKinds.slice();
      // round 2 fields, passed through when the piece has them (v1 pieces have none of them)
      if (typeof p.no === 'number') q.no = p.no;
      if (typeof p.size === 'string') q.size = p.size;
      if (typeof p.mp === 'string') q.mp = p.mp;
      if (p.whole === true) q.whole = true;
      // a cite into the game's resource tree (set/, and since round 2 entity/, map/, properties/, interface/, script/, sound/)
      const m = /^((?:set|entity|map|properties|interface|script|sound)\/[^:]+):(\d+)(?:-\d+)?$/.exec(q.src);
      if (m) { q.key = 'resource/' + m[1]; q.line = +m[2]; }
      pieces.push(q);
    }
    const kinds = {};
    for (const k of K.KINDS) kinds[k.id] = t('ide.kit.k.' + k.id) || k.id;
    const ans = {
      v: W === WORDS ? L.v : crypto.createHash('sha1').update(L.v + '|' + JSON.stringify(W)).digest('hex').slice(0, 12), kind, lang, game, sections, views, pieces,
      words: { events: W.events, terrains: W.terrains, ables: W.ables, places: W.places, helperEvents: W.helperEvents, containers: W.containers,
        valueBlocks: W.valueBlocks, ctxOfEvent: W.ctxOfEvent, ctxOfCond: W.ctxOfCond, ctxOfAct: W.ctxOfAct },
      kinds
    };
    // the kinds that have pieces of their own (the pane's "Pieces so far for" note and first-visit opening)
    const wp = new Set();
    for (const p of L.pieces) for (const k of (Array.isArray(p.kinds) ? p.kinds : [])) wp.add(k);
    ans.withPieces = K.KINDS.map(k => k.id).filter(id => wp.has(id));
    if (gameId) ans.gameId = gameId;   // only when a game id was named: the flag answer keeps its AS64 shape
    if (gameId === 'goh') ans.hidden = hidden;
    memo.set(mk, ans);
    return ans;
  }
  return { load, catalog };
}
const real = make(readReal);
module.exports = { load: real.load, catalog: real.catalog, GROUPS, GROUPS_V1, GROUPS_R2, _make: make };
