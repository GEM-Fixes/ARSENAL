// Server side of the Balance page: the whole buy panel as rows (tools/balance/lib), the price models, the units that do not fit,
// what each button is paid with (manpower or another resource), and a bulk change of one column for the units the page names.
// The page filters, sorts, groups and draws on its own; the server only reads the catalogue and writes a change into the mod folder.
// Author: Imperator_Aug (ARSENAL, ia-273d6c21)
const B = require('../../../balance/lib');
const lc = s => String(s == null ? '' : s).toLowerCase();
const bal = () => require('../../../balance/balance');
const apply = () => require('../../../balance/apply');
const U = () => require('../units/server').lib;

// The table is built synchronously from the whole catalogue (about 1 s on the real game, the server's only thread), and every
// page load asks for it. CACHE (gui README, contract 1): the finished table is kept in the shared store (lib/cachestore), section
// 'balance.table', parts {game, gid, mod}, stamps {game (lib/gameview stamp: exe version + paks), mod:<areas>} where the areas are
// the ones the unit catalogue reads (units CAT_AREAS: set, entity, properties, script, interface, text, pak; the price presets and
// gun files this page reads on top are in set). The mod's signatures come from the one shared walk (lib/modtree, async, the last
// walk while younger than 15 s; a write of any page calls modtree.touch): this page walks nothing itself. In front of the store:
// identical requests in flight share one build (RUN) and the last tables stay in memory (MEMO). An edit in one of those areas (this
// page, another page, an editor outside) gives a new stamp and a fresh build; an edit elsewhere in the mod (a map, a texture) does not.
const fs = require('fs'), path = require('path');
const VER = 1, SECTION = 'balance.table';
// the maker's version per game: GoH is 2 since its catalogue carries the purchase list rows (column Bots buy); AS2 games keep 1
const verOf = gid => gid === 'goh' ? 2 : VER;
const MEMO = new Map(), RUN = new Map(), MEMO_MAX = 4;
const stats = { builds: 0, merged: 0, hits: 0, stored: 0 };
const GV = ctx => (ctx && ctx.gameview) || require('../../../lib/gameview');
const MT = ctx => (ctx && ctx.modtree) || require('../../../lib/modtree');
// gid: the page's game (units lib gidOf: as64 | mowas2 | goh). AS64 and MoW:AS2 share the folder, so the game is part of the identity;
// under GoH the folder is the GoH install (units gameOf) and writes go only outside it (finish guard)
const partsOf = (game, mod, gid) => ({ game: path.resolve(game), gid: gid || 'as64', mod: mod ? path.resolve(mod) : '' });
const stampsOf = (ctx, game, mod, gid, T) => Object.assign({ game: GV(ctx).stamp({ gameDir: game, gid: gid || 'as64' }) }, mod ? MT(ctx).stamps(T, U().CAT_AREAS) : {});
const keyOf = (parts, stamps) => JSON.stringify([parts, stamps]);
// the game half of a table's identity as one string (no mod walk: the mod's signature is modtree's); kept for the price sessions' tests
const stampOf = (game, mod, gid) => [game, GV().stamp({ gameDir: game, gid: gid || 'as64' }), mod || ''].concat(gid && gid !== 'as64' ? [gid] : []).join('\n');
async function build(ctx, game, b, gid) {
  stats.builds++;
  const L = await bal().load(game, b.mod || null, null, ctx, { game: gid, read: true });   // read: a GoH mod in <GoH>/mods is shown, never changed here; the stamp's game (body.gid first): stamp and build agree
  // through JSON, as the store keeps it: a fresh table and a stored one are the same value
  return JSON.parse(JSON.stringify({ mod: L.mod, rows: L.d.rows.map(r => { const o = Object.assign({}, r); delete o._k; return o; }), models: L.d.models, odd: L.d.odd, economy: L.d.economy }));
}
async function table(ctx, b) {
  const u = U(), game = u.gameOf(ctx, b);
  const mod = b.mod ? u.modOf({ mod: b.mod }, game, true) : null;   // the same guards load() applies (refusals stay 400)
  const gid = u.gidOf(ctx, b, game), T = await u.modTree(ctx, mod);
  const parts = partsOf(game, mod, gid), stamps = stampsOf(ctx, game, mod, gid, T), key = keyOf(parts, stamps);
  let p = MEMO.get(key);
  if (p) stats.hits++;
  else if ((p = RUN.get(key))) stats.merged++;
  else {
    let made = false;
    p = u.storeOf(ctx).wrap(SECTION, verOf(gid), parts, stamps, () => { made = true; return build(ctx, game, b, gid); })
      .then(res => { if (!made) stats.stored++; MEMO.delete(key); MEMO.set(key, res); while (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value); return res; });
    RUN.set(key, p); p.then(() => RUN.delete(key), () => RUN.delete(key));
  }
  const t = await p;   // shared rows: nothing on the server changes them after the build
  // GoH: the change box offers the columns GoH reads (lib GOH_EDIT); rank and fore are not read by the game, so they are not offered
  const edit = gid === 'goh' ? Object.fromEntries(Object.entries(B.EDIT).filter(([f]) => B.GOH_EDIT.includes(f))) : B.EDIT;
  return { mod: t.mod, cols: B.COLS, edit, rows: t.rows, models: t.models, odd: t.odd, economy: t.economy };
}
// Prepare section balance.table (gui README, "Prepare sections")
function prepState(ctx, q) {
  const u = U(); let w; try { w = u.prepWhere(ctx, q); } catch (e) { return { state: 'na', why: [], note: e.message }; }
  const T = w.mod ? MT(w.c).last(w.mod) : null;
  if (w.mod && !T) return { state: 'none', why: ['mod'] };
  return u.storeOf(w.c).state(SECTION, verOf(w.gid), partsOf(w.game, w.mod, w.gid), stampsOf(w.c, w.game, w.mod, w.gid, T));
}
async function prepRun(ctx, q, job) {
  const w = U().prepWhere(ctx, q), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  set({ stage: 'table', done: 0, total: 1 });
  await table(w.c, w.mod ? { mod: w.mod } : {});
  set({ stage: 'done', done: 1, total: 1 });
}
// {mod, ids:[..], field, op, value, step, write}: the change goes to exactly the ids the page shows or has ticked
async function change(ctx, b) {
  const u = U(), game = u.gameOf(ctx, b), gid = u.gidOf(ctx, b, game);
  if (!b.mod) u.bad('Pick your mod folder first. Changes are written only there.');
  u.guardWrite(gid, game, u.modOf({ mod: b.mod }, game, true), b);
  if (!Array.isArray(b.ids) || !b.ids.length) u.bad('No units selected. Narrow the list or tick the units to change.');
  if (b.ids.length > 2000) u.bad('Too many units in one change.');
  const L = await bal().load(game, b.mod, null, ctx, { game: gid });
  const rs = B.select(L.d.rows, [], b.ids.map(String));
  if (!rs.length) u.bad('None of the selected units is in the buy panel any more. Reload the list.');
  // the game of the load (L.game, from ctx.gameId): GoH plans carry the per-period card key (lib.gohKey) and apply edits that card
  const ch = { field: lc(b.field), op: lc(b.op || 'set'), value: b.value, step: b.step }; if (L.game === 'goh') ch.game = 'goh';
  let plan; try { plan = B.planChange(rs, ch); } catch (e) { u.bad(e.message); }
  if (!plan.rows.length) return { selected: rs.length, rows: [], skipped: plan.skipped, errors: [], warnings: [], info: [], files: [], names: [], written: false, nothing: true };
  const g = L.newCtx(L.mod, !b.write), ap = apply().apply(g, L.cur, plan, { game: L.game });
  if (b.write) MEMO.clear();   // this mod's files change now: finish() calls modtree.touch, so the next table waits for a walk that saw the write
  const res = u.finish(g, game, L.mod, { write: !!b.write }, { rows: ap.rows, skipped: ap.skipped });
  res.selected = rs.length;
  return res;
}
// JOBS: a request that writes into the mod (write: true) says so: the footer asks twice before stopping it
const wrap = fn => async (url, body, ctx) => { if (body && body.write && ctx && ctx.job) ctx.job.writes = true; return fn(ctx, body || {}); };
// the price calculator's routes (prices.js: Breeds, Model, Cards views)
const prep = [{ id: 'balance.table', title: 'balance.prep.table', needs: ['units.catalogue'], areas: U().CAT_AREAS, state: prepState, run: prepRun }].concat(require('./prices').prep);
// _forget(): the in-memory tables go (a restart, for tests); the store keeps its entries
module.exports = { stats, stampOf, prep, VER, SECTION, _forget() { MEMO.clear(); RUN.clear(); }, routes: Object.assign({ 'POST /api/x/balance/table': wrap(table), 'POST /api/x/balance/change': wrap(change) }, require('./prices').routes) };
