// bots part "recipes": the card "Teach the bot new habits". Nine habits on top of the stock multiplayer bot (attack together, fall back,
// pick the front line, replace losses, answer tanks, save for a big unit, units per map / difficulty / match time, live squad cap, match
// log), written into the user's mod as three files (gen.js): the settings bot.habits.lua (read back and edited here), the runner
// bot.habits.run.lua (habits.run.lua, written once) and one marked line in the mod's bot.main.lua. "Remove habits" restores the entry.
// Reads go through lib.effective (the mod's copy, else the game's through the vfs); writes only into the mod (lib.checkWrite), CRLF.
// Games: AS64 and MoW:AS2 share the files; mowas_2 ends the match on a bot Lua error, as64 leaves the bot idle (MIS-33), so the runner
// keeps everything in pcall. GoH (GHMIS-66: other events, the bot picks a mode script): the same three files with its own runner
// (habits.goh.run.lua; gen.runLua('goh')) hooked after the game's bot.main.lua; order habits only in battle zones and ammunition, none in
// conquest; meta.goh = the per-habit note the page shows; proof = not proven there [T]. A GoH mod with no bot.main.lua anywhere is refused.
// Refusals are codes the page words in four languages (errs.js: bots.recipes.e.*). Write and remove keep the exact bytes before (undo.js,
// or the frame's lib.undo) so Undo puts them back; proof.json = the in-game check flag the page shows ({proven, note}).
// Routes (mod and game id from the frame: query on GET, body on POST):
//   GET  recipes/state    -> {goh, settings, from, files, installed, ownBot, warn, logDir, proof, meta}
//   GET  recipes/units    -> {units: [{unit, army, src, name?}], armies: {army: label}}  (the searchKit index of the unit boxes)
//   POST recipes/preview  {settings} -> {files: [{rel, path, action, diff}], warn}     POST recipes/write {settings} -> the same + written, undo
//   POST recipes/remove   {write} -> {files, removed, undo}      POST recipes/undo -> {undone, files: [{rel, action}]}
//   GET  recipes/log      -> {dir, files: [{name, path, mtime, lines}]}
// Author: Imperator_Aug (ARSENAL, ia-5f60e0c3)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const lib = require('../../lib');
const gen = require('./gen');
const lang = require('./lang');
const { bad, libErr } = require('./errs');
const undo = require('./undo');

const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const GOH_LINE = 'Gates of Hell: the habits hook into the mode scripts (modes/*.lua) that bot.main.lua picks; attack together, fall back and front line work in battle zones and ammunition only, nothing in conquest (GHMIS-66). Not yet tried in a match.';
// GoH: where each habit works there (the page words them: bots.recipes.goh.<note>)
const GOH_NOTES = { attack: 'bz', fallback: 'bz', front: 'bz', replace: 'all', tanks: 'tanks', save: 'all', phases: 'all', cap: 'all', log: 'log' };
const E = (key, params, status) => bad('bots.recipes.' + key, params, status);
// the in-game check of the habits (the coordinator sets it after a real match): {proven, note, report (path of the game check report),
// untried [habit id] = habits that match did not have on, said "not yet tried" on their own row}; read on each state ask
function proof() {
  let p = null;
  try { p = JSON.parse(fs.readFileSync(path.join(__dirname, 'proof.json'), 'utf8')); } catch (e) { try { p = require('./proof.json'); } catch (x) { p = null; } }
  const ids = gen.HABITS.map(h => h.id);
  return { proven: !!(p && p.proven === true), note: p && typeof p.note === 'string' ? p.note.slice(0, 600) : '', report: p && typeof p.report === 'string' ? p.report.slice(0, 200) : '',
    untried: p && Array.isArray(p.untried) ? p.untried.filter(x => ids.includes(x)) : [] };
}
const modPath = (mod, rel) => path.join(mod, 'resource', ...rel.split('/'));
const modText = (mod, rel) => { const p = modPath(mod, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : null; };

// the request's game: the id the frame sends, else the server's current one
function gameOf(ctx, gid) {
  const G = lib.gameOf(ctx), id = String(gid || '').toLowerCase();
  if (id === 'goh') return { id: 'goh', kind: 'goh' };
  if (id === 'as64' || id === 'mowas2' || id === 'mowas_2') return { id: id === 'mowas_2' ? 'mowas2' : id, kind: 'as2' };
  return { id: G.id, kind: G.kind };
}

// the user's game folder for the match log (outside the install): always instance 0 of <Documents>/my games/... (the runner writes there for
// every instance, ai-pages-game-checks B [V])
function userDirs(kind) {
  const ud = require('../../../../../lib/userdir'), out = [];
  if (kind === 'goh') { let d = null; try { d = ud.gohUserDir(); } catch (e) { d = null; } return d ? [d] : []; }
  for (let i = 0; i < 5; i++) { let d = null; try { d = ud.userDir(i); } catch (e) { d = null; } if (d && (i === 0 || fs.existsSync(d))) out.push(d); }
  return out;
}
// the Documents folder relative to the user profile, written into the settings so the runner finds the log folder with no user name in the mod
// GoH: only when its user folder is <Documents>\My Games\Gates of Hell (the runner tries %LOCALAPPDATA% by itself)
function docsRel(kind) {
  const d = userDirs(kind)[0]; if (!d) return '';
  if (kind === 'goh' && !/^my games$/i.test(path.basename(path.dirname(d)))) return '';
  const docs = path.dirname(path.dirname(d)), r = path.relative(os.homedir(), docs);
  return !r || r.startsWith('..') || path.isAbsolute(r) ? '' : gen.docsRel(r);
}

// unit name -> [armies] from the game's and the mod's unit sets (lib.unitList); null when none could be read
function unitIndex(ctx, mod) {
  let list = [];
  try { list = lib.unitList(ctx, mod).units || []; } catch (e) { list = []; }
  if (!list.length) return null;
  const m = new Map();
  for (const u of list) { if (!m.has(u.unit)) m.set(u.unit, []); if (!m.get(u.unit).includes(u.army)) m.get(u.unit).push(u.army); }
  return m;
}

function current(ctx, mod) {
  const t = modText(mod, gen.REL.data);
  if (t == null) return { settings: gen.defaults(), from: 'default', readErr: null };
  try { return { settings: gen.normalize(gen.readData(t)).settings, from: 'mod', readErr: null }; } catch (e) { return { settings: gen.defaults(), from: 'default', readErr: e.message }; }
}

function state(ctx, mod, gid) {
  const G = gameOf(ctx, gid);
  const goh = G.kind === 'goh', tpl = gen.runLua(G.kind);
  const cur = current(ctx, mod), run = modText(mod, gen.REL.run), main = modText(mod, gen.REL.main), data = modText(mod, gen.REL.data);
  const runV = gen.runVersion(run), tplV = gen.runVersion(tpl);
  const files = {
    data: { has: data != null, rel: gen.REL.data },
    run: { has: run != null, rel: gen.REL.run, version: runV, current: run != null && gen.crlf(run) === tpl, older: run != null && runV > 0 && runV < tplV, foreign: run != null && !runV },
    main: { has: main != null, rel: gen.REL.main, hooked: gen.hasHook(main) },
  };
  const ownBot = fs.existsSync(modPath(mod, 'script/multiplayer/bot.lua'));
  const eff = lib.effective(ctx, mod, gen.REL.main);
  const warn = [];
  if (G.id === 'mowas2') warn.push('mis33');
  if (ownBot) warn.push('ownBot');
  if (eff.text != null && !gen.loadsBot(eff.text, G.kind)) warn.push('mainNoBot');
  if (goh && eff.text == null) warn.push('gohNoMain');
  if (cur.readErr) warn.push('readErr');
  if (files.run.older) warn.push('runOlder');
  if (files.run.foreign) warn.push('runForeign');
  const ld = userDirs(G.kind)[0];
  const meta = { habits: gen.HABITS, rule: gen.RULE_NUMS, diffs: gen.DIFFS };
  if (goh) meta.goh = GOH_NOTES;
  return { goh, plain: goh ? GOH_LINE : undefined, game: G, settings: cur.settings, from: cur.from, readErr: cur.readErr, files, installed: files.main.hooked && files.run.has && files.data.has,
    ownBot, warn, logDir: ld ? path.join(ld, 'log') : null, proof: goh ? { proven: false, note: '', report: '', untried: [] } : proof(), canUndo: !!(LAST.get(lastKey(mod)) || []).length, meta };
}

// the unit boxes' index: every buy card by army, with its in-game name (stages part reader, the mod's texts over the game's) and the
// army's name from the bot list comments; names are a bonus: a reader that fails leaves the card names alone
function unitsWithNames(ctx, mod) {
  const r = lib.unitList(ctx, mod), units = r.units || [];
  let names = {}, armies = {};
  try { names = require('../stages/cards').namesOf(ctx, mod, [...new Set(units.map(u => u.unit))]) || {}; } catch (e) { names = {}; }
  try { armies = lib.buys(ctx, mod).labels || {}; } catch (e) { armies = {}; }
  return { units: units.map(u => Object.assign({}, u, names[u.unit] ? { name: names[u.unit] } : {})), armies };
}

const warmed = fn => require('../stages/cards').route(fn);

// the last write or remove per mod: the files Undo puts back (undo.js, or the frame's lib.undo)
const LAST = new Map();
const lastKey = mod => path.resolve(mod).toLowerCase();
function keepUndo(ctx, mod, files, when) {
  const U = undo.use(), rels = files.filter(f => f.action !== 'same').map(f => f.rel);
  if (when === 'before') { for (const r of rels) U.save(ctx, mod, r); LAST.set(lastKey(mod), rels); return rels; }
  if (typeof U.done === 'function') for (const r of rels) U.done(ctx, mod, r);
  return rels;
}
// Undo: every file of the last write back to its bytes before; refused plainly (nothing touched) when one was changed since
function undoLast(ctx, body) {
  let mod; try { mod = lib.checkMod(ctx, body.mod); } catch (e) { throw libErr('bots.recipes', e); }
  const rels = LAST.get(lastKey(mod));
  if (!rels || !rels.length) throw E('e.noUndo');
  writeOk(ctx, mod, rels);
  const U = undo.use();
  if (typeof U.check === 'function') for (const r of rels) { const why = U.check(ctx, mod, r); if (why) throw E(why === 'undo.changed' ? 'e.changed' : 'e.noUndo', { rel: r }); }
  const files = [];
  // the entry line first: the bot never loads a runner that is gone
  for (const r of rels.slice().sort((a, b) => (a === gen.REL.main ? -1 : b === gen.REL.main ? 1 : 0))) {
    try { const x = U.restore(ctx, mod, r); files.push({ rel: r, action: (x && x.action) || 'restored' }); }
    catch (e) { const c = String((e && e.code) || (e && e.message) || ''); throw E(/changed/.test(c) ? 'e.changed' : /none/.test(c) ? 'e.noUndo' : 'e.undo', { rel: r, m: String((e && e.message) || e).slice(0, 300) }); }
  }
  LAST.delete(lastKey(mod));
  return { undone: true, files };
}

// what Write would do: one entry per file, with a diff against what the mod has now
// kind 'goh': its runner; the entry must be the mod's or the game's bot.main.lua (no stock line: GoH's picks the mode script)
function plan(ctx, mod, settings, kind) {
  const idx = unitIndex(ctx, mod), n = gen.normalize(settings, idx);
  n.settings.log.docs = docsRel(kind);
  const eff = lib.effective(ctx, mod, gen.REL.main), ownMain = modText(mod, gen.REL.main);
  if (kind === 'goh' && ownMain == null && eff.text == null) throw E('e.gohNoMain', { rel: gen.REL.main });
  const want = {
    data: gen.dataLua(n.settings, kind),
    run: gen.runLua(kind),
    main: gen.mainWith(ownMain != null ? ownMain : (eff.text != null ? eff.text : gen.STOCK_MAIN)),
  };
  const files = ['data', 'run', 'main'].map(k => {
    const was = modText(mod, gen.REL[k]), now = want[k];
    const action = was == null ? 'new' : gen.crlf(was) === now ? 'same' : 'change';
    return { key: k, rel: gen.REL[k], path: modPath(mod, gen.REL[k]), action, diff: action === 'same' ? [] : gen.diff(was, now), text: now };
  });
  const warn = n.warn.slice();
  if (ownMain == null && eff.from === 'game') warn.push({ code: 'mainCopy' });
  if (eff.text == null && ownMain == null) warn.push({ code: 'mainStock' });
  if (!gen.loadsBot(want.main, kind)) warn.push({ code: 'mainNoBot' });
  if (fs.existsSync(modPath(mod, 'script/multiplayer/bot.lua'))) warn.push({ code: 'ownBot' });
  if (idx == null) warn.push({ code: 'noIndex' });
  if (kind === 'goh') { if (n.settings.log.on && !userDirs('goh').length) warn.push({ code: 'gohNoDocs' }); }
  else if (n.settings.log.on && !n.settings.log.docs) warn.push({ code: 'noDocs' });
  return { files, warn, settings: n.settings };
}

const modOk = (ctx, v) => { try { return lib.checkMod(ctx, v); } catch (e) { throw libErr('bots.recipes', e); } };
const writeOk = (ctx, mod, rels) => { try { return lib.checkWrite(ctx, mod, rels); } catch (e) { throw libErr('bots.recipes', e); } };
const kindOf = (ctx, body) => gameOf(ctx, body.game || body.gid).kind;
function preview(ctx, body) {
  const mod = modOk(ctx, body.mod), p = plan(ctx, mod, body.settings || {}, kindOf(ctx, body));
  return { files: p.files.map(f => ({ key: f.key, rel: f.rel, path: f.path, action: f.action, diff: f.diff })), warn: p.warn, settings: p.settings, written: false };
}
function write(ctx, body) {
  const mod = writeOk(ctx, modOk(ctx, body.mod), Object.values(gen.REL));
  const p = plan(ctx, mod, body.settings || {}, kindOf(ctx, body));
  const rels = keepUndo(ctx, mod, p.files, 'before');
  // settings and runner first, the entry line last: the line never points at a file that is not there
  for (const f of p.files) {
    if (f.action === 'same') continue;
    fs.mkdirSync(path.dirname(f.path), { recursive: true });
    fs.writeFileSync(f.path, f.text, 'latin1');
  }
  keepUndo(ctx, mod, p.files, 'after');
  return { files: p.files.map(f => ({ key: f.key, rel: f.rel, path: f.path, action: f.action, diff: f.diff })), warn: p.warn, settings: p.settings, written: true, undo: rels.length > 0 };
}

// Remove habits: the entry line out (the mod's copy goes when what is left is the stock entry), the runner and settings deleted
// when they carry the page's mark; a file without it is left and named
function remove(ctx, body) {
  const mod = modOk(ctx, body.mod), doIt = !!body.write;
  if (doIt) writeOk(ctx, mod, Object.values(gen.REL));
  const files = [], keep = [];
  const main = modText(mod, gen.REL.main);
  if (main != null && gen.hasHook(main)) {
    let stockMain = null;   // the game's own entry (vfs), else the known stock line
    try { stockMain = typeof lib.gameText === 'function' ? lib.gameText(ctx, gen.REL.main) : null; } catch (e) { stockMain = null; }
    const w = gen.mainWithout(main, stockMain != null ? stockMain : gen.STOCK_MAIN);
    files.push({ key: 'main', rel: gen.REL.main, path: modPath(mod, gen.REL.main), action: w.same ? 'delete' : 'change', diff: gen.diff(main, w.same ? null : w.text), text: w.text });
  }
  const run = modText(mod, gen.REL.run);
  if (run != null) { if (gen.runVersion(run)) files.push({ key: 'run', rel: gen.REL.run, path: modPath(mod, gen.REL.run), action: 'delete', diff: [] }); else keep.push(gen.REL.run); }
  const data = modText(mod, gen.REL.data);
  if (data != null) { if (data.startsWith(gen.DATA_MARK)) files.push({ key: 'data', rel: gen.REL.data, path: modPath(mod, gen.REL.data), action: 'delete', diff: [] }); else keep.push(gen.REL.data); }
  if (doIt && files.length) {
    writeOk(ctx, mod, files.map(f => f.rel));
    keepUndo(ctx, mod, files, 'before');
    for (const f of files) {   // entry first: the bot never loads a runner that is gone
      if (f.action === 'delete') fs.unlinkSync(f.path); else fs.writeFileSync(f.path, f.text, 'latin1');
    }
    keepUndo(ctx, mod, files, 'after');
  }
  return { files: files.map(f => ({ key: f.key, rel: f.rel, path: f.path, action: f.action, diff: f.diff })), keep, removed: doIt && files.length > 0, undo: doIt && files.length > 0 };
}

// the match logs the runner wrote (newest first), the last 400 lines of each
function logs(kind) {
  const dirs = userDirs(kind).map(d => path.join(d, 'log')), out = [];
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (const n of names) {
      if (!/^bot_habits_\d+\.log$/i.test(n)) continue;
      const p = path.join(d, n);
      try {
        const st = fs.statSync(p);
        const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
        out.push({ name: n, path: p, mtime: st.mtimeMs, lines: lines.slice(-400), more: Math.max(0, lines.length - 400) });
      } catch (e) { /* busy or gone */ }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return { dir: dirs[0] || null, files: out.slice(0, 8) };
}

const modOf = (ctx, v) => modOk(ctx, v);
module.exports = {
  id: 'recipes',
  group: 'B',
  order: 10,
  routes: {
    'GET /api/x/bots/recipes/state': async (url, body, ctx) => state(ctx, modOf(ctx, q(url, 'mod')), q(url, 'game') || q(url, 'gid')),
    // SPEED: warmed = the route with the shared mod scan waited for first (stages/cards warm): the unit lists and names read the mounted view
    'GET /api/x/bots/recipes/units': warmed(async (url, body, ctx) => unitsWithNames(ctx, modOf(ctx, q(url, 'mod')))),
    'POST /api/x/bots/recipes/preview': warmed(async (url, body, ctx) => preview(ctx, body || {})),
    'POST /api/x/bots/recipes/write': warmed(async (url, body, ctx) => write(ctx, body || {})),
    'POST /api/x/bots/recipes/remove': async (url, body, ctx) => remove(ctx, body || {}),
    'POST /api/x/bots/recipes/undo': async (url, body, ctx) => undoLast(ctx, body || {}),
    'GET /api/x/bots/recipes/log': async (url, body, ctx) => logs(gameOf(ctx, q(url, 'game') || q(url, 'gid')).kind),
  },
  lang,
  script: require('./client'),
  // for the test
  _: { state, plan, preview, write, remove, undoLast, logs, docsRel, proof, GOH_LINE, GOH_NOTES },
};
