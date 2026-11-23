// Server side of the Balance page's price calculator (tools/pricecalc, called as a library: no child process per request).
// Model, Breeds and Cards views (+ prices/names: the in-game card and breed names, read only when the page asks). Reads the mod (and the game for what the mod does not ship); writes only the model file
// (price_model.inc, included by nothing) and `;{price ...}` comment lines, each write with an undo copy under <mod>/.arsenal-undo/<tag>/.
// AS2 / AS64 prices themselves (level_N, cost(N)) are never changed from here: the retail 32-bit game keeps reading the mod as it was
// (Gates of Hell: see below, the breed cost(N) numbers of the mod's own rows are).
// CACHE (gui README, contract 1). A session (mod + game read once, about 15 s on a big mod) holds the open file source, maps and
// lookups of tools/pricecalc: not plain data, so it stays in memory (SESS, 3 of them) and is gone after a restart. What the page
// shows first, the calc answer, is plain data and goes to the shared store: section 'balance.prices', parts {game, gid, mod, rules,
// sheetMp, sheetCp}, stamps {game (lib/gameview), mod:set / interface / text / pak (lib/modtree: what pricecalc reads of a mod, the
// texts for the names), files (size and time of the rules / sheet files)}. So after a restart the Prices card opens from the store
// and a session is read only when the page asks for more (try, names, seed, plan, a write). Nothing here walks the mod: the
// signatures are modtree's (the last walk while younger than 15 s; every write below calls modtree.touch).
// Gates of Hell (gid goh): tools/pricecalc/goh.js reads the breed price rows (units/<period>/inf_<army>.set) and cards of the mod over
// the game, fits its model on them each time and answers calc and names in the same shape (+ goh, quality, gohModel, leftOut). Its model
// file is the mod's units/price_model.inc ({goh_price_model ...}, the folder and name the AS2 one uses, read by no game): try edits the
// terms in memory (ops {op:'term', group, key, price}), seed shows / writes the fitted terms, save writes the text; once saved it is the
// measure. check / plan / apply measure the mod's own breed rows on that saved model, else on the model fitted on the game alone
// (gameFit, kept per game stamp in GFIT), and change only the price number of a far-off row (on its line, in its block or in the define
// it alone uses) in a loose file of the mod; body.copyGame (an explicit tick) also takes rows the mod gets from the game, copying their
// game file into the mod first. Every GoH write keeps lib/modwrite restore points as one group; Undo takes the newest group back
// (goh.js undoLast; [T] not tried in game). Its calc answer (about 5 s: read + fit) goes to the same store entry shape (parts carry
// gid goh, stamps the GoH game stamp + the mod areas); Prepare warms it.
// Author: Imperator_Aug (ARSENAL, ia-77c21f56)
const fs = require('fs'), path = require('path');
const P = () => require('../../../pricecalc/pricecalc').lib;
const GOH = () => require('../../../pricecalc/goh');   // Gates of Hell: read only, the model fitted on the game's own breed rows
const E = () => require('../../../pricecalc/edit');
const U = () => require('../units/server').lib;
const SESS = new Map(), RUN = new Map(), MAX = 3, GFIT = new Map();
const stats = { opens: 0, hits: 0, stored: 0 };
const VER = 1, SECTION = 'balance.prices', AREAS = ['set', 'interface', 'text', 'pak'];
const GV = ctx => (ctx && ctx.gameview) || require('../../../lib/gameview');
const MT = ctx => (ctx && ctx.modtree) || require('../../../lib/modtree');
const fileSig = f => { if (!f) return '-'; try { const st = fs.statSync(f); return st.size + ':' + st.mtimeMs; } catch (e) { return '?'; } };
// the identity and the stamps of a request (w from where()); T = the mod's tree (null without a mod)
function identOf(ctx, w, T) {
  const parts = { game: path.resolve(w.game), gid: w.gid, mod: w.mod ? path.resolve(w.mod) : '', rules: w.opt.rules || '', sheetMp: w.opt.sheetMp || '', sheetCp: w.opt.sheetCp || '' };
  const stamps = Object.assign({ game: GV(ctx).stamp({ gameDir: w.game, gid: w.gid }), files: [w.opt.rules, w.opt.sheetMp, w.opt.sheetCp].map(fileSig).join('|') },
    w.mod ? MT(ctx).stamps(T, AREAS) : {});
  return { parts, stamps, key: JSON.stringify([parts, stamps]) };
}

const fileOpt = (u, v, what) => {
  if (!v) return undefined;
  const a = path.resolve(String(v));
  if (!fs.existsSync(a) || !fs.statSync(a).isFile()) u.bad(what + ' not found: ' + a);
  return a;
};
function where(ctx, b) {
  const u = U(), game = u.gameOf(ctx, b), gid = u.gidOf(ctx, b, game);
  const mod = b.mod ? u.modOf({ mod: b.mod }, game, false) : null;
  const opt = { rules: fileOpt(u, b.rules, 'Rules file'), sheetMp: fileOpt(u, b.sheetMp, 'Sheet MP file'), sheetCp: fileOpt(u, b.sheetCp, 'Sheet CP file') };
  return { u, game, gid, mod, opt };
}
// no mod picked: the game alone, read through an empty scratch mod folder (nothing can be written)
function emptyMod(ctx) {
  const d = path.join(ctx.tmpRoot || require('os').tmpdir(), 'pricecalc-vanilla');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
async function session(ctx, b, w0, id0) {
  const w = w0 || where(ctx, b);
  const key = (id0 || identOf(ctx, w, await w.u.modTree(ctx, w.mod))).key;
  let p = SESS.get(key);
  if (p) stats.hits++;
  else if (!(p = RUN.get(key))) {
    p = new Promise((res, rej) => setImmediate(() => {
      try {
        stats.opens++;
        if (w.gid === 'goh') { const s = GOH().open({ mod: w.mod || emptyMod(ctx), game: w.game }); res({ s, model: null, base: GOH().result(s), vanilla: !w.mod, goh: true }); return; }
        const s = P().open(Object.assign({ mod: w.mod || emptyMod(ctx), game: w.game }, w.opt));
        const model = P().model(s, null);
        res({ s, model, base: P().result(s, model), vanilla: !w.mod });
      } catch (e) { rej(e); }
    }));
    RUN.set(key, p);
    p.then(v => { RUN.delete(key); SESS.delete(key); SESS.set(key, v); while (SESS.size > MAX) SESS.delete(SESS.keys().next().value); }, () => RUN.delete(key));
  }
  const v = await p;
  return Object.assign({ w }, v);
}
// after a write into the mod: its sessions go, and the next request waits for a walk that saw the write (modtree.touch)
const dropMod = (mod, ctx) => {
  const m = mod ? path.resolve(mod) : '';
  for (const k of [...SESS.keys()]) { let p; try { p = JSON.parse(k)[0]; } catch (e) { p = null; } if (!p || p.mod === m) SESS.delete(k); }
  if (mod) MT(ctx).touch(mod);
};

// what the page should say: no price rows / unknown layout / no model / game only
function stateOf(v, r) {
  const codes = r.counts || {};
  const say = [];
  if (v.vanilla) say.push('vanilla');
  if (codes.NO_PRICE_ROWS) say.push('noRows');
  if (codes.LAYOUT_UNKNOWN) say.push('layout');
  if (!r.model.file && !r.goh) say.push('noModel');
  if (!v.vanilla && r.rows && !r.rowsInMod) say.push('rowsFromGame');
  return say;
}
const slim = (v, r, extra) => Object.assign({
  state: stateOf(v, r), mod: v.vanilla ? null : r.mod, model: { rel: r.model.rel, file: r.model.file, seeded: r.model.seeded, edited: r.model.edited },
  text: r.model.text, outline: r.goh ? null : E().outline(r.model.text || ''), rules: r.rules, sheet: r.sheet, rows: r.rows, rowsFile: r.rowsFile, rowsInMod: r.rowsInMod, cardFiles: r.cardFiles,
  breeds: r.breeds, cards: r.cards, findings: r.findings.slice(0, 300), findingCount: r.findings.length, counts: r.counts, fit: r.fit,
  pointValue: r.pointValue, economy: r.economy,
  goh: !!r.goh, quality: r.quality || null, gohModel: r.gohModel || null, leftOut: r.leftOut || null, modelFrom: r.modelFrom || null,
  undo: v.vanilla ? null : r.goh ? GOH().lastUndo(r.mod) : P().latestUndo(r.mod)
}, extra || {});

// the card's first answer: from the store when the game, the mod's price files and the rules / sheet files are as they were.
// `undo` (the newest undo copy in the mod) is read now, each time: it is not part of what is kept.
async function calc(ctx, b) {
  const w = where(ctx, b), id = identOf(ctx, w, await w.u.modTree(ctx, w.mod));
  let made = false;
  const base = await w.u.storeOf(ctx).wrap(SECTION, VER, id.parts, id.stamps, async () => {
    made = true;
    const v = await session(ctx, b, w, id);
    return JSON.parse(JSON.stringify(slim(v, v.base, { undo: null })));   // through JSON, as the store keeps it
  });
  if (!made) stats.stored++;
  return Object.assign({}, base, { undo: !w.mod ? null : w.gid === 'goh' ? GOH().lastUndo(path.resolve(w.mod)) : P().latestUndo(path.resolve(w.mod)) });
}
// Prepare section balance.prices (gui README, "Prepare sections"): the calc answer of the mod (or of the game alone)
function prepState(ctx, q) {
  const u = U(); let pw; try { pw = u.prepWhere(ctx, q); } catch (e) { return { state: 'na', why: [], note: e.message }; }
  const T = pw.mod ? MT(pw.c).last(pw.mod) : null;
  if (pw.mod && !T) return { state: 'none', why: ['mod'] };
  const id = identOf(pw.c, { game: pw.game, gid: pw.gid, mod: pw.mod, opt: {} }, T);
  return u.storeOf(pw.c).state(SECTION, VER, id.parts, id.stamps);
}
async function prepRun(ctx, q, job) {
  const pw = U().prepWhere(ctx, q), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  set({ stage: 'prices', done: 0, total: 1 });
  await calc(pw.c, pw.mod ? { mod: pw.mod } : {});
  set({ stage: 'done', done: 1, total: 1 });
}
const prep = [{ id: 'balance.prices', title: 'balance.prep.prices', needs: ['units.catalogue'], areas: AREAS, games: ['as64', 'mowas2', 'goh'], state: prepState, run: prepRun }];
// in-game names of the cards and breeds (localized text of the mod over the game), asked by the page only when its toggle is on
async function names(ctx, b) {
  const v = await session(ctx, b);
  return v.goh ? GOH().names(v.s) : P().names(v.s);
}
// Gates of Hell: try / seed / save work on the GoH model text (goh.js editModel, modelText, saveModel)
function gohTry(v, b) {
  const G = GOH(), ed = G.editModel(typeof b.text === 'string' ? b.text : v.base.model.text, b.ops || []), m = G.readModel(ed.text);
  const r = G.result(v.s, m.model); r.model.text = ed.text; r.model.edited = true;
  const same = (a, c) => a === c || (a != null && c != null && Math.abs(a - c) < 1e-6);
  const b0 = new Map(v.base.breeds.map(x => [x.file + ':' + x.line, x])), c0 = new Map(v.base.cards.map(x => [x.file + ':' + x.line, x]));
  const movedB = r.breeds.filter(x => { const o = b0.get(x.file + ':' + x.line); return !o || !same(x.calc.mp, o.calc.mp); }).length;
  const movedC = r.cards.filter(x => { const o = c0.get(x.file + ':' + x.line); return !o || !same(x.calc, o.calc); }).length;
  return slim(v, r, { edits: ed.done, errs: ed.errs.concat(m.errs.map(e => 'line ' + e.line + ': ' + e.msg)), moved: { breeds: movedB, cards: movedC }, baseFit: v.base.fit });
}
function gohSave(ctx, v, text) {
  gohMod(v);
  if (!/\{\s*goh_price_model\b/.test(text)) U().bad('That text has no {goh_price_model ...} block.');
  let r; try { r = GOH().saveModel(v.s, text); } catch (e) { U().bad(e.message); }
  dropMod(v.w.mod, ctx);
  return Object.assign({ saved: true }, r);
}
// the model fitted on the game alone (read through the empty scratch folder), kept per game stamp
function gameFit(ctx, w) {
  const k = path.resolve(w.game) + '|' + JSON.stringify(GV(ctx).stamp({ gameDir: w.game, gid: w.gid }));
  let g = GFIT.get(k);
  if (!g) { g = GOH().gameFit({ game: w.game, empty: emptyMod(ctx) }); GFIT.clear(); GFIT.set(k, g); }
  return g;
}
function gohMod(v) { if (v.vanilla) U().bad('Pick your mod folder first (the Mod button at the top of the page). The price calculator writes only there.'); }
const gohOpt = b => ({ tol: b.tol, copyGame: b.copyGame === true });   // copyGame: only an explicit true (the page's tick)
const gohCheck = (ctx, b, v) => GOH().check(v.s, v.base, gameFit(ctx, v.w), gohOpt(b));
// GoH write: a fresh read of the mod (not the session), the plan written, then checked on another fresh read
function gohApply(ctx, b, v) {
  gohMod(v);
  const G = GOH(), gf = gameFit(ctx, v.w), o = gohOpt(b);
  const s1 = G.open({ mod: v.w.mod, game: v.w.game });
  let r; try { r = G.apply(s1, G.result(s1), gf, o); } catch (e) { U().bad(e.message); }
  const edits = r.edits; delete r.edits;
  if (r.nothing) return r;
  dropMod(v.w.mod, ctx);
  const s2 = G.open({ mod: v.w.mod, game: v.w.game });
  return Object.assign({ check: G.verify(s2, G.result(s2), gf, edits, o) }, r);
}
// {text, ops:[{op:'set', path, values} | {op:'move', item, to} | {op:'point', kind, value}]}: edit the model text in place, price everything again in memory
async function tryEdit(ctx, b) {
  const v = await session(ctx, b);
  if (v.goh) return gohTry(v, b);
  const ed = E().applyOps(typeof b.text === 'string' ? b.text : v.model.text, b.ops || []);
  let m;
  try { m = P().model(v.s, ed.text); } catch (e) { U().bad('The model does not read: ' + e.message); }
  const r = P().result(v.s, m);
  // how many breeds / cards price differently from the saved model
  const bk = x => x.side + '/' + x.breed + ':' + x.line, ck = x => x.file + ':' + x.line;
  const b0 = new Map(v.base.breeds.map(x => [bk(x), x])), c0 = new Map(v.base.cards.map(x => [ck(x), x]));
  const same = (a, c) => a === c || (a !== null && c !== null && a !== undefined && c !== undefined && Math.abs(a - c) < 1e-6);
  const movedB = r.breeds.filter(x => { const o = b0.get(bk(x)); const a = x.calc || {}, c = (o && o.calc) || {}; return !o || !same(a.mp, c.mp) || !same(a.cp, c.cp) || !same(a.cw, c.cw); }).length;
  const movedC = r.cards.filter(x => { const o = c0.get(ck(x)); return !o || !same(x.calc, o.calc); }).length;
  return slim(v, r, { edits: ed.done, errs: ed.errs.concat((m.errs || []).map(e => e.code + ' ' + e.msg)), moved: { breeds: movedB, cards: movedC }, baseFit: v.base.fit });
}
function needMod(v) { if (v.vanilla) U().bad('Pick your mod folder first (the Mod button at the top of the page). The price calculator writes only there.'); }
// write only price_model.inc (undo copy first)
async function save(ctx, b) {
  if (ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a request that writes into the mod
  const v = await session(ctx, b); needMod(v);
  if (typeof b.text !== 'string' || !b.text.trim()) U().bad('Nothing to save.');
  if (v.goh) return gohSave(ctx, v, b.text);
  if (!/\{\s*price_model\b/.test(b.text)) U().bad('That text has no {price_model ...} block.');
  let r; try { r = P().saveModel(v.s, b.text, b.tag || null); } catch (e) { U().bad(e.message); }
  dropMod(v.w.mod, ctx);
  return Object.assign({ saved: true }, r);
}
// a starting model from the mod (and optional sheet + rules); write only when the mod has no model yet
async function seed(ctx, b) {
  const v = await session(ctx, b);
  if (v.goh) {   // GoH: the fitted terms as a model text; written only when the mod has no model yet
    const G = GOH(), text = G.modelText(v.base.fitted), items = text.split('\n').filter(l => /^\t\{/.test(l)).length;
    if (!b.write) return { preview: text, items, source: 'fit', fitted: null, fit: v.base.fit, lines: text.split('\n').length, outline: null };
    if (ctx && ctx.job) ctx.job.writes = true;
    if (v.s.saved) U().bad('The mod already has a price model. Edit it in the Model view; a starting model never replaces it.');
    return Object.assign({ items, source: 'fit' }, gohSave(ctx, v, text));
  }
  const sd = P().seed(v.s);
  const r = P().result(v.s, P().model(v.s, sd.text));
  if (b.write) {
    needMod(v);
    if (ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a request that writes into the mod
    if (v.base.model.file) U().bad('The mod already has a price model. Edit it in the Model view; a starting model never replaces it.');
    let w; try { w = P().saveModel(v.s, sd.text, b.tag || null); } catch (e) { U().bad(e.message); }
    dropMod(v.w.mod, ctx);
    return Object.assign({ saved: true, items: sd.items, source: sd.source }, w);
  }
  return { preview: sd.text, items: sd.items, source: sd.source, fitted: sd.fitted, fit: r.fit, lines: sd.text.split('\n').length, outline: E().outline(sd.text) };
}
// comment lines: plan -> apply (undo tag) -> check
async function plan(ctx, b) {
  const v = await session(ctx, b);
  if (v.goh) { gohMod(v); return GOH().plan(v.s, v.base, gameFit(ctx, v.w), gohOpt(b)); }
  needMod(v);
  return P().plan(v.s, v.model);
}
async function applyComments(ctx, b) {
  if (ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a request that writes into the mod
  const v = await session(ctx, b);
  if (v.goh) return gohApply(ctx, b, v);
  needMod(v);
  let r; try { r = P().apply(v.s, v.model, b.tag || null); } catch (e) { U().bad(e.message); }
  dropMod(v.w.mod, ctx);
  if (!r.tag) return { nothing: true, changed: [], created: [] };
  // check against a fresh read of the mod: data identical to the undo copy, a second apply changes nothing, nothing includes the model
  const s2 = P().open(Object.assign({ mod: v.w.mod, game: v.w.game }, v.w.opt));
  const ck = P().check(s2, P().model(s2, null), r.tag);
  return Object.assign({ check: ck }, r);
}
async function check(ctx, b) {
  const v = await session(ctx, b);
  if (v.goh) { gohMod(v); return gohCheck(ctx, b, v); }
  needMod(v);
  return P().check(v.s, v.model, b.tag || null);
}
async function undo(ctx, b) {
  if (ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a request that writes into the mod
  const v = await session(ctx, b);
  if (v.goh) {   // GoH: the newest price write or model save of this card, from its restore points (goh.js undoLast)
    gohMod(v);
    let r; try { r = GOH().undoLast(GOH().open({ mod: v.w.mod, game: v.w.game })); } catch (e) { U().bad(e.message); }
    dropMod(v.w.mod, ctx);
    return r;
  }
  needMod(v);
  const tag = b.tag || P().latestUndo(v.w.mod);
  if (!tag) U().bad('Nothing to undo: no price calculator write found in this mod.');
  let r; try { r = P().undo({ mod: v.w.mod, game: v.w.game }, tag); } catch (e) { U().bad(e.message); }
  dropMod(v.w.mod, ctx);
  return r;
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  stats, prep, VER, SECTION, AREAS,
  _forget() { SESS.clear(); RUN.clear(); GFIT.clear(); },   // the sessions in memory go (a restart, for tests); the store keeps its entries
  routes: {
    'POST /api/x/balance/prices/calc': wrap(calc), 'POST /api/x/balance/prices/try': wrap(tryEdit), 'POST /api/x/balance/prices/save': wrap(save),
    'POST /api/x/balance/prices/seed': wrap(seed), 'POST /api/x/balance/prices/plan': wrap(plan), 'POST /api/x/balance/prices/apply': wrap(applyComments),
    'POST /api/x/balance/prices/check': wrap(check), 'POST /api/x/balance/prices/undo': wrap(undo), 'POST /api/x/balance/prices/names': wrap(names)
  }
};
