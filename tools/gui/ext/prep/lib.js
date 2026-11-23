// GUI ext prep: server side of the Prepare page (gui README, CACHE contract 1, "tools/gui/ext/prep").
//   OWN            the two shared sections: game.view (the game file view, lib/gameview) and mod.tree (the walk of the mod, lib/modtree)
//   state(ctx, mod) -> {release, updated, checking, store, sections: [row]}   no walk, no build in the answer; a named mod's walk is
//     started in the background after it (earlyWalk), never awaited
//     row {id, ext, title, needs, areas, state, why, at, bytes, note, running, queued, error, stage, done, total}
//       state 'ready' | 'none' | 'stale' | 'na'. na + why ['nomod'] = the section reads the mod and no mod is picked.
//       note: a text, a lang key, or {key, p}. error: why the last run of it here did not work (gone on the next run or clear).
//       stage, done, total: the running job's progress (null otherwise). areas, error and the progress are beyond the contract row.
//     updated: true on the first read after a start that removed another release's entries (ctx.cacheSwept), false after.
//       The start's sweep runs after the listen (gui.js): state waits for ctx.cacheReady (a promise, when the server gives one), so
//       its first answer comes after the sweep and no read of the whole store blocks the server meanwhile. A ctx whose cacheSwept
//       is still null (no cacheReady) says false and that read is not counted as the first one.
//   run(ctx, {mod, sections: [ids] | 'all' | 'stale', lang?}) -> {queued: [ids]}   one background job per section, one at a time, needs first.
//     A need that was not asked for runs only when it is not ready. 'stale' = usable sections whose state is stale or none.
//     A section that fails is reported in its row (error) and the next one runs. lang (en ru uk zh) picks the title text of the job name.
//   stop(ctx) -> {stopped}   cancels the running job (and a running check) and empties the queue
//   clear(ctx, {section?, mod?}) -> {removed, bytes}   one section (its clear(), else its store names, else the store section named
//     like it) or everything (the whole store and every section's clear()); what runs or waits for it is stopped first
//   check(ctx, {mod}) -> {started}   modtree.touch + ensure as a background job; state says checking until it ends
//   settle(ctx) -> Promise   resolves when nothing runs or waits (tests)
// One runner per server (keyed by ctx.jobs); a ctx without a job registry (tests) gets a private one.
// Author: Imperator_Aug (ARSENAL, ia-9deb829a)
'use strict';
const fs = require('fs'), path = require('path');

const BOOT = Date.now() - Math.round(process.uptime() * 1000);   // a walk dated before this was kept from an earlier start
const STATES = new Set(['ready', 'none', 'stale', 'na']);
const bad = (msg, key, params, status) => Object.assign(new Error(msg), { status: status || 400, key, params });
const low = d => path.resolve(String(d)).replace(/\\/g, '/').toLowerCase();
const gopt = g => ({ gameDir: g.dir, exe: g.exe, gid: g.id });

// ---------- own sections
const VIEWS = new Map();     // game folder|game id -> {stamp, at}: the views this page built (lib/gameview keeps the view itself)
const CLEARED = new Map();   // mod folder -> ms of the last Clear: a walk dated before it no longer counts
const gkey = g => low(g.dir) + '|' + g.id;

const GAME_VIEW = {
  id: 'game.view', title: 'prep.s.view', needs: [], areas: [],
  state(ctx, q) {
    if (!q.game.dir) return { state: 'none', why: [], at: null, bytes: null, note: 'prep.note.nogame' };
    const gv = ctx.gameview, o = gopt(q.game), st = gv.stamp(o), r = VIEWS.get(gkey(q.game));
    const mine = !!r && r.stamp === st, live = typeof gv.has === 'function' ? !!gv.has(o) : mine;
    if (live) return { state: 'ready', why: [], at: mine ? r.at : null, bytes: null, note: 'prep.note.view' };
    if (r) return { state: 'stale', why: ['game'], at: r.at, bytes: null, note: 'prep.note.view' };
    return { state: 'none', why: [], at: null, bytes: null, note: 'prep.note.view' };
  },
  async run(ctx, q, job) {
    if (!q.game.dir) throw bad('The game folder is not set.', 'prep.e.nogame');
    job.set({ stage: 'prep.st.view' });
    await new Promise(z => setImmediate(z));   // the answer to the click goes out before the build holds the loop
    const o = gopt(q.game);
    if (!ctx.gameview.get(o)) throw bad('The game folder is not set.', 'prep.e.nogame');
    VIEWS.set(gkey(q.game), { stamp: ctx.gameview.stamp(o), at: Date.now() });
  },
  clear(ctx, q) { if (q.game.dir) { ctx.gameview.drop(q.game.dir); VIEWS.delete(gkey(q.game)); } },
};

const MOD_TREE = {
  id: 'mod.tree', title: 'prep.s.tree', needs: [], areas: ['all'],
  state(ctx, q) {
    const T = ctx.modtree.last(q.mod), c = CLEARED.get(low(q.mod));
    if (!T || (c !== undefined && T.at <= c)) return { state: 'none', why: [], at: null, bytes: null, note: '' };
    if (T.at >= BOOT) return { state: 'ready', why: [], at: T.at, bytes: null, note: { key: 'prep.note.files', p: { n: T.count } } };
    return { state: 'stale', why: ['mod'], at: T.at, bytes: null, note: { key: 'prep.note.kept', p: { n: T.count } } };
  },
  async run(ctx, q, job) {
    const ac = new AbortController();
    if (typeof job.onCancel === 'function') job.onCancel(() => ac.abort());
    job.set({ stage: 'prep.st.tree' });
    if (CLEARED.has(low(q.mod))) ctx.modtree.touch(q.mod);
    await ctx.modtree.ensure(q.mod, { signal: ac.signal, onProgress: p => job.set({ done: p && p.count }) });
  },
  // the walk kept for the next start is one store section for every mod; the walk in memory stops counting for this mod
  clear(ctx, q) {
    const r = ctx.cache ? ctx.cache.clear('modtree') : null;
    if (q.mod) { ctx.modtree.touch(q.mod); CLEARED.set(low(q.mod), Date.now()); }
    return r;
  },
};
const OWN = [GAME_VIEW, MOD_TREE];

// ---------- the request: game, mod, the section list
function sectionsOf(ctx) {
  if (ctx && Array.isArray(ctx.prepSections)) return ctx.prepSections;
  let all = null; try { all = require('../index').prep; } catch (e) { /* the ext list is not there (a test of this folder alone) */ }
  return Array.isArray(all) ? all : require('./collect')([{ id: 'prep', lang: require('./lang'), prep: OWN }]).prep;
}
function qOf(ctx, mod) {
  const call = f => { try { return typeof ctx[f] === 'function' ? ctx[f]() : null; } catch (e) { return null; } };
  const id = call('gameId') || 'as64';
  return { mod: mod || '', game: { id, dir: call('curDir') || call('game') || null, exe: call('exe') || id } };
}
// the mod folder of a request: '' when none is named; must be a full path of a folder (a phone: one the PC page shows)
function modOf(ctx, raw, soft) {
  if (raw == null || raw === '') return '';
  const no = (msg, key, st) => { if (soft) return ''; throw bad(msg, key, { m: String(raw).slice(0, 300) }, st); };
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) return no('The mod folder must be a full path.', 'prep.e.mod');
  const p = path.resolve(raw);
  if (ctx && typeof ctx.pathOk === 'function' && !ctx.pathOk(p)) return no('view only on this device: the PC page does not show that folder', 'rmt.viewOnly', 403);
  let st = null; try { st = fs.statSync(p); } catch (e) { /* missing */ }
  if (!st || !st.isDirectory()) return no('That mod folder does not exist: ' + raw, 'prep.e.mod');
  return p;
}
const applies = (s, q) => !Array.isArray(s.games) || s.games.includes(q.game.id);
const needsMod = s => (s.areas || []).length > 0;
const usable = (s, q) => applies(s, q) && (!needsMod(s) || !!q.mod);
const ekey = (s, q) => s.id + '|' + q.game.id + '|' + (needsMod(s) && q.mod ? low(q.mod) : '');   // a game-only section is one thing whatever the mod
const titleOf = (s, lang) => (s.titles && (s.titles[lang] || s.titles.en)) || s.title;

async function stateOf(ctx, s, q) {
  if (!applies(s, q)) return { state: 'na', why: [] };
  if (needsMod(s) && !q.mod) return { state: 'na', why: ['nomod'] };
  let r; try { r = await s.state(ctx, q); } catch (e) { return { state: 'none', why: [], stateError: e.message }; }
  r = r && typeof r === 'object' ? r : {};
  return Object.assign({}, r, { state: STATES.has(r.state) ? r.state : 'none', why: Array.isArray(r.why) ? r.why.map(String) : [] });
}

// ---------- the runner
const RUNNERS = new WeakMap(), LONE = {};
function runner(ctx) {
  const k = (ctx && ctx.jobs) || LONE;
  let R = RUNNERS.get(k);
  if (!R) RUNNERS.set(k, R = { jobs: (ctx && ctx.jobs) || require('../../joblist').create({ keepMs: 0 }), queue: [], cur: null, check: null, errors: new Map(), told: false, wait: [] });
  return R;
}
const busy = R => !!(R.cur || R.queue.length || R.check);
function idle(R) { if (busy(R)) return; const w = R.wait; R.wait = []; for (const f of w) f(); }
function settle(ctx) { const R = runner(ctx); return busy(R) ? new Promise(z => R.wait.push(z)) : Promise.resolve(); }

function pump(R) {
  if (R.cur || !R.queue.length) { idle(R); return; }
  const it = R.queue.shift();
  const h = R.jobs.add({ kind: 'bg', what: 'prep.job.run', whatP: { s: titleOf(it.s, it.lang) }, page: 'prep', game: it.q.game.id, canCancel: true, cancel() { /* the section watches job.cancelled */ } });
  R.cur = { key: it.key, id: it.s.id, job: h };
  // the section's ctx: its job is this background job, and the tools it starts belong to that job (cancel kills them)
  const sctx = Object.assign({}, it.ctx, { job: h });
  if (typeof it.ctx.runTool === 'function') sctx.runTool = (tool, entry, args, o) => it.ctx.runTool(tool, entry, args, Object.assign({ job: h }, o));
  Promise.resolve().then(() => it.s.run(sctx, it.q, h)).then(
    () => (h.cancelled ? 'cancelled' : 'done'),
    e => { if (h.cancelled) return 'cancelled'; R.errors.set(it.key, String((e && e.message) || e)); return 'failed'; }
  ).then(st => { h.end(st); R.cur = null; pump(R); });
}

async function run(ctx, body) {
  body = body || {};
  const R = runner(ctx), q = qOf(ctx, modOf(ctx, body.mod)), all = sectionsOf(ctx), by = new Map(all.map(s => [s.id, s]));
  const want = body.sections, lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'en';
  const st = new Map(), state = async s => { if (!st.has(s.id)) st.set(s.id, (await stateOf(ctx, s, q)).state); return st.get(s.id); };
  let pick;
  if (want === 'all') pick = all.filter(s => usable(s, q));
  else if (want === 'stale') { pick = []; for (const s of all) if (usable(s, q) && ['stale', 'none'].includes(await state(s))) pick.push(s); }
  else if (Array.isArray(want)) {
    const un = want.filter(id => !by.has(id));
    if (un.length) throw bad('No such prepared data: ' + un.slice(0, 5).join(', '), 'prep.e.section', { s: un.slice(0, 5).join(', ') });
    pick = all.filter(s => want.includes(s.id) && usable(s, q));
  } else throw bad("sections: a list of ids, 'all' or 'stale'", 'prep.e.body');
  // needs first: a need that was asked for, or that is not ready, goes in front of the section that names it
  const chosen = new Set(pick.map(s => s.id)), order = [], seen = new Set();
  const visit = async s => {
    if (seen.has(s.id)) return; seen.add(s.id);
    for (const n of s.needs || []) { const d = by.get(n); if (d && usable(d, q) && (chosen.has(n) || (await state(d)) !== 'ready')) await visit(d); }
    order.push(s);
  };
  for (const s of pick) await visit(s);
  const queued = [];
  for (const s of order) {
    const key = ekey(s, q);
    if ((R.cur && R.cur.key === key) || R.queue.some(x => x.key === key)) continue;
    R.errors.delete(key); R.queue.push({ s, q, key, ctx, lang }); queued.push(s.id);
  }
  pump(R);
  return { queued };
}

function stop(ctx) {
  const R = runner(ctx), was = busy(R);
  R.queue.length = 0;
  if (R.cur) R.jobs.cancel(R.cur.job.id);
  if (R.check) R.jobs.cancel(R.check.job.id);
  idle(R);
  return { stopped: was };
}

async function clear(ctx, body) {
  body = body || {};
  const R = runner(ctx), q = qOf(ctx, modOf(ctx, body.mod, true)), all = sectionsOf(ctx), out = { removed: 0, bytes: 0 };
  const add = r => { if (r && typeof r === 'object') { out.removed += Number(r.removed) || 0; out.bytes += Number(r.bytes) || 0; } };
  const own = async s => { if (typeof s.clear === 'function') { try { add(await s.clear(ctx, q)); } catch (e) { /* its own clean-up */ } return true; } return false; };
  if (body.section == null || body.section === '') {
    stop(ctx);
    if (ctx.cache) add(ctx.cache.clear());
    for (const s of all) await own(s);
    R.errors.clear();
    return out;
  }
  const s = all.find(x => x.id === body.section);
  if (!s) throw bad('No such prepared data: ' + String(body.section).slice(0, 80), 'prep.e.section', { s: String(body.section).slice(0, 80) });
  R.queue = R.queue.filter(x => x.s.id !== s.id);
  if (R.cur && R.cur.id === s.id) R.jobs.cancel(R.cur.job.id);
  if (!(await own(s)) && ctx.cache) for (const n of s.store || [s.id]) add(ctx.cache.clear(n));
  for (const k of [...R.errors.keys()]) if (k.startsWith(s.id + '|')) R.errors.delete(k);
  idle(R);
  return out;
}

function check(ctx, body) {
  body = body || {};
  const R = runner(ctx), mod = modOf(ctx, body.mod);
  if (!mod) throw bad('Pick a mod first.', 'prep.e.nomod');
  if (R.check) return { started: false };
  const q = qOf(ctx, mod), ac = new AbortController(), key = ekey(MOD_TREE, q);
  const h = R.jobs.add({ kind: 'bg', what: 'prep.job.check', page: 'prep', game: q.game.id, canCancel: true, cancel: () => ac.abort() });
  R.check = { job: h, mod }; R.errors.delete(key);
  ctx.modtree.touch(mod);
  Promise.resolve().then(() => ctx.modtree.ensure(mod, { maxAgeMs: 0, signal: ac.signal, onProgress: p => h.set({ done: p && p.count }) })).then(
    () => (h.cancelled ? 'cancelled' : 'done'),
    e => { if (h.cancelled) return 'cancelled'; R.errors.set(key, String((e && e.message) || e)); return 'failed'; }
  ).then(st => { h.end(st); R.check = null; idle(R); });
  return { started: true };
}

// A mod is named: its shared walk (lib/modtree) starts now, in the background, so the first page that needs it does not wait for it.
// Never awaited and started after this answer is made (setImmediate), so state stays as fast as before and answers what it would have.
// Not when this process already has a walk nothing touched since (fresh), while a check runs, or after Clear (that stays cleared
// until something asks for the walk). A walk that fails is the business of the page that needs it.
function earlyWalk(ctx, R, mod) {
  const mt = ctx && ctx.modtree;
  if (!mod || !mt || typeof mt.ensure !== 'function' || typeof mt.fresh !== 'function') return;
  setImmediate(() => {
    try { if (R.check || CLEARED.has(low(mod)) || mt.fresh(mod)) return; Promise.resolve(mt.ensure(mod)).catch(() => { /* not ours to report */ }); }
    catch (e) { /* the walk could not start: the page that needs it says why */ }
  }).unref();
}

async function state(ctx, rawMod) {
  if (ctx && ctx.cacheReady) await ctx.cacheReady;
  const R = runner(ctx), q = qOf(ctx, modOf(ctx, rawMod, true)), sections = [];
  const updated = !R.told && Number(ctx.cacheSwept) > 0; if (ctx.cacheSwept !== null) R.told = true;
  for (const s of sectionsOf(ctx)) {
    const st = await stateOf(ctx, s, q), key = ekey(s, q), run = !!(R.cur && R.cur.key === key), j = run ? R.cur.job : null;
    sections.push({ id: s.id, ext: s.ext || '', title: s.title, needs: (s.needs || []).slice(), areas: (s.areas || []).slice(),
      state: st.state, why: st.why, at: st.at ? st.at : null, bytes: st.bytes == null ? null : st.bytes, note: st.note == null ? '' : st.note,
      running: run, queued: R.queue.some(x => x.key === key), error: R.errors.get(key) || st.stateError || '',
      stage: j ? j.stage : null, done: j ? j.done : null, total: j ? j.total : null });
  }
  let store = null; try { store = ctx.cache ? ctx.cache.stats() : null; } catch (e) { /* the folder cannot be read just now */ }
  earlyWalk(ctx, R, q.mod);
  return { release: ctx.cache ? String(ctx.cache.release || '') : '', updated, checking: !!R.check, mod: q.mod, store, sections };
}

module.exports = { OWN, state, run, stop, clear, check, settle, sectionsOf, qOf, BOOT };
