// recipe "fix my mod's problems": look for problems (check --fast and fix plan, both read only), fix the safe ones in one go, then walk
// the rest one problem per screen (the plain words card from tools/lib/explain and the one click fix where a fixer exists). The fixes
// are made by `fix apply` into this task's staging folder (route POST /api/x/task/r/fixmod/stage) and the Write step copies them into
// the mod in place, a restore point per file. Gates of Hell: check only (fix has no GoH target), the walk shows the cards, nothing is
// written. Why staging and not {cmd: 'fix'}: compile.js lets fix write only into the picked mod (out inside it), and fix refuses an
// --out inside or equal to the source mod (tools/fix outRefusal), so a fix in place cannot be one command. The scan stays a route: the
// walk is over a list found at run time. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-473ecdb0)
'use strict';
const fs = require('fs'), path = require('path');
const ST = require('./upgrade.recipe').ST;
const D = require('../lib/draft');
const X = require('../../../../lib/explain');

const KINDS = 'modinfo,lng,repoint,set,include,macro,enc,spell,syntax,asread,stubmtl,quarantine,botkeys,lngdup'.split(',');
const TARGETS = ['as64', 'classic', 'mowas2'];
// the fixes in plain words for the Review notes (the English column of the f.* rows)
const FIXWORDS = {};
for (const r of require('./fixmod.lang')) { const m = /^task\.fixmod\.f\.(.+)$/.exec(r[0]); if (m) FIXWORDS[m[1]] = r[1]; }
const safeKind = k =>!!(X.FIXERS[k] && X.FIXERS[k].safe);
const MAX_ITEMS = 150, MAX_SAMPLES = 5;

// game: the task's game (compile: c.game = tg.id; a route: the ctx's game); the draft's own word wins (lib/game.js of()), so a draft
// saved with game '' on the GoH tab is a GoH check here too, not an AS2 scan of the GoH folder
function inputs(v, draft, gameDir, game) {
  const gw = (draft && draft.game) || game || '';
  const list = x => [].concat(x || []).map(s => String(s).trim()).filter(Boolean);
  const scan = v('scan') || {}, walk = v('walk') || {}, picks = (walk && walk.picks) || {};
  const kinds = [];
  if (v('safe') !== false) for (const s of scan.safe || []) if (safeKind(s.kind) && !kinds.includes(s.kind)) kinds.push(s.kind);
  for (const it of scan.items || []) if (it && it.fix && picks[it.id] === 'fix' && KINDS.includes(it.fix) && it.fix !== 'quarantine' && !kinds.includes(it.fix)) kinds.push(it.fix);
  const sets = list(v('sets')).filter(s => /^[^:]+:[^=]+=.*$/.test(s));
  if (sets.length && !kinds.includes('set')) kinds.push('set');
  const typed = String(v('game_dir') || '').trim();
  return { mod: String(draft.mod || ''), game: typed || String(gameDir || ''), typed: !!typed, goh: gw === 'goh', target: TARGETS.includes(v('target')) ? v('target') : (gw === 'mowas2' ? 'mowas2' : 'as64'), mods: list(v('mods')), kinds: kinds.sort(), sets };
}
const sigOf = i => ST.sig(['fixmod', i.mod, i.game, i.target, i.mods, i.kinds, i.sets]);
const scanSig = i => ST.sig(['fixmod-scan', i.mod, i.game, i.target, i.mods]);
function exeOf(i) { return i.goh ? 'goh' : i.target === 'mowas2' || i.target === 'classic' ? 'mowas2' : 'as64'; }
function sample(s) { if (!s || typeof s !== 'object') return { file: '', line: 0, msg: String(s || '').slice(0, 200) }; return { file: String(s.file || s.key || s.rel || '').slice(0, 300), line: +s.line || 0, msg: String(s.msg || s.text || s.why || '').slice(0, 200) }; }
function needMod(i) {
  if (!ST.isAbs(i.mod) || !fs.existsSync(i.mod)) throw ST.bad('Pick your mod first.');
  if (i.typed && (!ST.isAbs(i.game) || !fs.existsSync(i.game))) throw ST.bad('The game folder you typed is not there: ' + i.game);
  if (!i.game || !fs.existsSync(i.game)) throw ST.bad('Set the game folder first (the Game folder button at the top).');
}
const GM = () => require('../../../../lib/games');
function gidOf(ctx, game) {
  let x = game && typeof game === 'string' ? game : null;
  if (!x && ctx) { try { x = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch { x = null; } }
  return GM().idOf(x) || 'as64';
}
// the folder the scan reads when none is typed: the AS2 install (ctx.game(), shared by AS64 and MoW:AS2); for a Gates of Hell draft
// the GoH install: ctx.gohDir() (gui.js), else a ctx.game() that holds call_to_arms.exe, else the GoH finder (games.install: env,
// as2.json "goh", Steam). Never the AS2 install as the GoH folder
function gameDirFor(ctx, draft) {
  const call = k => { try { const f = ctx && ctx[k]; return (typeof f === 'function' ? f.call(ctx) : f) || null; } catch { return null; } };
  const g = call('game');
  if (gidOf(ctx, draft && draft.game) !== 'goh') return g;
  // the task's GoH folder (lib/game.js: ctx.task.gohDir) first, then ctx.gohDir()
  let h = null; try { h = (ctx && ctx.task && ctx.task.gohDir) || null; } catch { h = null; }
  if (!h) h = call('gohDir');
  if (!h && g && fs.existsSync(g) && GM().detect(g) === 'goh') h = g;
  if (!h) { try { h = GM().install('goh').dir; } catch { h = null; } }
  return h || null;
}
// the time the scan gives check: 10 minutes; Gates of Hell 25: check --fast on the GoH install can stop refcheck/wouldload at the
// 600 s limit this page gives it (--pass-limit 600; check has none of its own) and run wouldload again alone (about 1240 s seen on the real install), and only a check that ends itself writes
// its json (the parts that finished and the plain "did not finish" line); killed first, the page gets no findings
const checkMs = i => (i && i.goh ? 1500000 : 600000);
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

// look for problems: check (fast) and fix plan, read only; -> the safe fixes and the walk list
async function scanRoute(url, body, ctx) {
  ST.remote(ctx);
  const R = module.exports, d = ST.draftOf(ctx, body, 'fixmod');
  const vals = (await R.values(Object.assign({}, ctx, { mod: d.mod, gameId: d.game }))) || {};
  const gameDir = gameDirFor(ctx, d), i = inputs(ST.getter(d, vals), d, gameDir, gidOf(ctx, d.game));
  needMod(i);
  const work = ST.work(ctx, d.id, 'fx-scan'), cj = path.join(work, 'check.json'), fj = path.join(work, 'fix.json');
  const ca = [i.mod, '--exe', exeOf(i), '--target', exeOf(i), '--json', cj, '--fast', '-q', '--pass-limit', '600'];
  if (i.goh) ca.push('--goh', i.game); else ca.push('--game', i.game);
  const cr = await ctx.runTool('check', 'check/check.js', ca, { timeoutMs: checkMs(i) });
  if (ST.stopped(ctx, cr)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
  const chk = readJson(cj), out = { ok: true, sig: scanSig(i), goh: i.goh, check: null, safe: [], items: [], fixRan: false };
  if (chk && chk.overall) out.check = { verdict: String(chk.overall.verdict || ''), text: String(chk.overall.text || ''), plain: [].concat(chk.plain || []).slice(0, 12).map(String) };
  else out.check = { verdict: 'unfinished', text: '', plain: ST.tail(String(cr.stderr || '') + '\n' + String(cr.stdout || ''), 4) };
  const byKind = new Map(), seen = new Set();
  if (!i.goh) {
    const fa = [i.mod, 'plan', '--game', i.game, '--target', i.target, '--json', fj];
    if (i.mods.length) fa.push('--mods', i.mods.join(','));
    const fr = await ctx.runTool('fix', 'fix/fix.js', fa, { timeoutMs: 600000 });
    if (ST.stopped(ctx, fr)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
    const fx = readJson(fj);
    out.fixRan = !!fx;
    if (!fx) out.fixLines = ST.tail(String(fr.stderr || '') + '\n' + String(fr.stdout || ''), 4);
    for (const c of (fx && fx.changed) || []) {
      const k = String(c.kind || ''); if (!KINDS.includes(k)) continue;
      let g = byKind.get(k); if (!g) { g = { kind: k, n: 0, files: [], codes: [] }; byKind.set(k, g); }
      g.n++; if (g.files.length < MAX_SAMPLES) g.files.push({ file: String(c.file || ''), line: 0, msg: String(c.detail || '').slice(0, 200) });
      for (const t of c.targets || []) if (t && t.code && !g.codes.includes(t.code)) { g.codes.push(String(t.code)); seen.add(String(t.code)); }
    }
    for (const g of byKind.values()) {
      if (safeKind(g.kind)) out.safe.push({ kind: g.kind, n: g.n, label: X.FIXERS[g.kind].label });
      else out.items.push({ id: 'k-' + g.kind, fix: g.kind, code: g.codes[0] || '', codes: g.codes.slice(0, 8), n: g.n, samples: g.files });
    }
    // what fix refuses: one screen per code
    const cant = new Map();
    for (const c of (fx && fx.cant) || []) { const code = String(c.code || 'FIX_CANT'); let g = cant.get(code); if (!g) { g = { id: 'c-' + code, fix: null, code, n: 0, samples: [] }; cant.set(code, g); } g.n++; if (g.samples.length < MAX_SAMPLES) g.samples.push(sample({ file: c.key !== '-' ? c.key : '', line: c.line, msg: c.msg })); }
    for (const g of cant.values()) { seen.add(g.code); out.items.push(g); }
  }
  // check findings no fix step covers: one screen per code (the card says what to change by hand)
  for (const f of (chk && chk.findings) || []) {
    const code = String(f.code || ''); if (!code || seen.has(code)) continue; seen.add(code);
    out.items.push({ id: 'c-' + code, fix: null, code, n: +f.n || 1, samples: [].concat(f.samples || []).slice(0, MAX_SAMPLES).map(sample) });
  }
  out.items = out.items.slice(0, MAX_ITEMS);
  fs.rmSync(work, { recursive: true, force: true });
  return out;
}

// make the picked fixes: fix apply into staging, the patch files moved to flat staged names (its own mod.info is not copied;
// mod.info.fixed becomes mod.info)
async function stageRoute(url, body, ctx) {
  ST.remote(ctx);
  const R = module.exports, d = ST.draftOf(ctx, body, 'fixmod');
  const vals = (await R.values(Object.assign({}, ctx, { mod: d.mod, gameId: d.game }))) || {};
  const i = inputs(ST.getter(d, vals), d, gameDirFor(ctx, d), gidOf(ctx, d.game));
  if (i.goh) return { ok: true, files: 0, goh: true, sig: sigOf(i) };
  needMod(i);
  // same: the values step makes the fixes again only when they would differ from the ones the walk made
  if (body && body.same) { const m = ST.load(D.stageDir(ctx, d.id), 'fx'); if (m && m.sig === sigOf(i)) return { ok: true, same: true, files: (m.files || []).length, sig: m.sig, kinds: i.kinds }; }
  if (!i.kinds.length) { ST.stage(ctx, d.id, 'fx', [], i.mod, { sig: sigOf(i), changed: [] }); return { ok: true, files: 0, sig: sigOf(i), kinds: [] }; }
  const work = ST.work(ctx, d.id, 'fx-work'), out = path.join(work, 'patch'), fj = path.join(work, 'fix.json');
  const a = [i.mod, 'apply', '--out', out, '--game', i.game, '--target', i.target, '--only', i.kinds.join(','), '--json', fj];
  if (i.mods.length) a.push('--mods', i.mods.join(','));
  for (const s of i.sets) a.push('--set', s);
  const r = await ctx.runTool('fix', 'fix/fix.js', a, { timeoutMs: 600000 });
  // stopped: the fixes made so far are thrown away, the staged ones of an earlier run stay as they were
  if (ST.stopped(ctx, r)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
  const fx = readJson(fj);
  if (r.timedOut || r.code !== 0 || !fx) { fs.rmSync(work, { recursive: true, force: true }); return { ok: false, code: r.code, lines: ST.tail(String(r.stdout || '') + '\n' + String(r.stderr || ''), 10) }; }
  const pairs = [];
  for (const rel of fs.existsSync(out) ? ST.walk(out) : []) {
    const lo = rel.toLowerCase();
    if (lo === 'mod.info') continue;
    pairs.push({ from: path.join(out, ...rel.split('/')), rel: lo === 'mod.info.fixed' ? 'mod.info' : rel });
  }
  const changed = (fx.changed || []).slice(0, 300).map(c => ({ kind: c.kind, file: c.file, detail: String(c.detail || '').slice(0, 160) }));
  const map = ST.stage(ctx, d.id, 'fx', pairs, i.mod, { sig: sigOf(i), changed, cant: (fx.cant || []).length });
  fs.rmSync(work, { recursive: true, force: true });
  return { ok: true, files: map.files.length, sig: map.sig, kinds: i.kinds, changed: changed.slice(0, 40), cant: map.cant, verdict: String(fx.verdict || '') };
}

module.exports = {
  id: 'fixmod',
  verbs: ['change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod', 'game'],
  order: 210,
  title: { change: 'task.fixmod.t' },
  test: 'task.fixmod.test',   // the Test step: where to look in the game
  census: 'fixmod',
  groups: [
    { id: 'look', title: 'task.fixmod.g.look', essential: true, q: [
      { id: 'target', kind: 'choice', ask: 'task.fixmod.q.target', help: 'task.fixmod.h.target', covers: ['in.target'], limits: { values: TARGETS } },
      { id: 'mods', kind: 'list', ask: 'task.fixmod.q.mods', help: 'task.fixmod.h.mods', covers: ['in.mods'], optional: true, limits: { re: '^[^\\\\/:*?"<>|]+$' } },
      // before the scan: the scan reads this folder (empty: the game folder at the top of the page)
      { id: 'game_dir', kind: 'text', ask: 'task.fixmod.q.game_dir', help: 'task.fixmod.h.game_dir', covers: ['in.game'], optional: true },
      { id: 'scan', kind: 'fix-scan', ask: 'task.fixmod.q.scan', help: 'task.fixmod.h.scan', covers: ['chk.with', 'chk.verdict'] },
    ] },
    // essential too: the walk ends by making the fixes, and a "keep all" skip would leave nothing to write
    { id: 'fix', title: 'task.fixmod.g.fix', essential: true, q: [
      { id: 'safe', kind: 'yesno', ask: 'task.fixmod.q.safe', help: 'task.fixmod.h.safe', covers: ['fix.only'] },
      { id: 'walk', kind: 'fix-walk', ask: 'task.fixmod.q.walk', help: 'task.fixmod.h.walk', covers: ['fix.mode', 'fix.spell', 'ide.fixes'] },
    ] },
    // expert values after the essential groups (Quick keeps them empty): the kind fix-sets makes the fixes again (stage route, same
    // mode) when the values change what the walk made, so Review never asks for the walk again
    { id: 'more', title: 'task.fixmod.g.more', essential: false, q: [
      { id: 'sets', kind: 'fix-sets', ask: 'task.fixmod.q.sets', help: 'task.fixmod.h.sets', covers: ['fix.set'], optional: true, limits: { re: '^[^:]+:[^=]+=.*$' } },
    ] },
  ],
  kept: [
    ['in.mod', 'no tool step yet as a question: the built in first step picks the mod'],
    ['fix.out', 'no tool step yet: fix refuses an --out inside the source mod (tools/fix outRefusal) and compile.js lets {cmd: fix} write only inside the picked mod; the patch goes to this task\'s scratch folder and the Write step copies it in with a restore point per file'],
    ['fix.quarantine', 'not safe to offer a novice: a quarantine removes .def files through a Delete row in a patch mod.info, which a copy into the mod itself cannot carry and a novice cannot judge; use Mods > Check & Fix'],
    ['log.find', 'no tool step yet: the game logs exist only after a game run; the Test step hands over to Play, the Read Game.log page reads them'],
    ['log.explain', 'no tool step yet: needs a game run first; the Read Game.log page explains the log'],
    ['log.dump', 'no tool step yet: needs a crash dump from a game run; the Read Game.log page reads it'],
    ['log.enabled', 'no tool step yet: needs a game run first; the Read Game.log page lists the mods that were on'],
    ['log.modwhy', 'no tool step yet: read only answer on the Read Game.log page (why the mod does not show)'],
    ['log.unit', 'no tool step yet: read only answer on the Read Game.log page (why a unit fails)'],
    ['after.play', 'not safe: a task never starts the game; the built in Test step hands over to the Play page'],
  ],
  checklist: ['task.fixmod.c.check', 'task.fixmod.c.load', 'task.fixmod.c.text', 'task.fixmod.c.undo'],
  values: (ctx, base, opt) => ({ target: gidOf(ctx, opt && opt.game) === 'mowas2' ? 'mowas2' : 'as64', mods: [], safe: true, sets: [], walk: { picks: {} }, game_dir: '' }),
  compile: (draft, c) => {
    const i = inputs(c.value, draft, c.gameDir, c.game);
    if (i.goh) return { notes: ['Gates of Hell: fix has no one click fixes for this game. The cards say what to change by hand; nothing is written.'] };
    const scan = c.value('scan');
    if (!scan || !scan.sig) throw ST.bad('Run the step "Look for problems" first.');
    if (i.typed && (!ST.isAbs(i.game) || !fs.existsSync(i.game))) throw ST.bad('The game folder you typed is not there: ' + i.game);
    if (scan.sig !== scanSig(i)) throw ST.bad('The game folder, the game build or the other mods changed after the step "Look for problems". Run it again.');
    const st = ST.copies(c, 'fx', sigOf(i), 'Look at the rest');
    const notes = st.notes.concat([i.kinds.length ? 'Makes ' + st.copies.length + ' file(s) with these fixes: ' + i.kinds.map(k => FIXWORDS[k] || k).join('; ') + '.' : 'No fixes picked.']);
    if (!st.copies.length) notes.push('Nothing to fix was picked: nothing is written.');
    return { copies: st.copies, notes, result: st.copies.length };
  },
  routes: { 'POST /api/x/task/r/fixmod/scan': scanRoute, 'POST /api/x/task/r/fixmod/stage': stageRoute },
  inputs, KINDS, gameDirFor, gidOf, checkMs,
};
