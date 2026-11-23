// recipe "change an old mod to 64-bit": pick the old mod, the games, the new folder, a few options; compile returns one {cmd:
// 'upgrade'} call: Review runs it as `upgrade --plan` (no --out, nothing written), Write runs it into the new folder (the task's
// mod; the core lists the folder before and after for restore points). The old mod is only read. Contract: ../README.md.
// ST (below) is the stage helper the fixmod and gohunit recipes share. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-59e31015)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const D = require('../lib/draft');

const COPY_MAX = 2048 << 20, COPY_BIG = 8192 * 1048576;   // compile.js: 2 GB a copy, cp.max up to 8 GB

// ---------- stage helpers (shared by upgrade, fixmod, gohunit)
const ST = {
  bad: (m, s) => D.bad(m, s),
  // JOBS (tools/gui/README.md): the footer's Cancel was pressed for this request (r: a ctx.runTool result, killed by it). A route
  // then ends at once with {ok: false, stopped: true} and stages or writes nothing more; the dispatcher answers 499 whatever it returns
  stopped: (ctx, r) => !!((r && r.cancelled) || (ctx && ctx.job && ctx.job.cancelled)),
  STOPPED: { ok: false, stopped: true },
  // answer getter like compile.js makeCctx().value (value, exist, keep)
  getter(draft, values) {
    const ans = (draft && draft.answers) || {}; values = values || {};
    return id => { const a = ans[id]; if (!a || a.src === 'keep') return values[id]; if (a.src === 'value' || a.src === 'exist') return a.value; return values[id]; };
  },
  sig: o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16),
  hashFile: f => { try { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } },
  // a fresh work folder inside the draft's staging folder
  work(ctx, id, name) { const d = path.join(D.stageDir(ctx, id), name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; },
  mapFile: (stage, prefix) => path.join(stage, prefix + '-map.json'),
  load(stage, prefix) { try { return JSON.parse(fs.readFileSync(ST.mapFile(stage, prefix), 'utf8')); } catch { return null; } },
  // drop the flat files an earlier run staged
  clear(ctx, id, prefix) {
    const stage = D.stageDir(ctx, id), old = ST.load(stage, prefix);
    if (old) for (const f of old.files || []) { try { fs.unlinkSync(D.stagedPath(ctx, id, f.s)); } catch { /* gone */ } }
    try { fs.unlinkSync(ST.mapFile(stage, prefix)); } catch { /* none */ }
  },
  walk(root) { const out = []; (function w(d, rel) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else if (e.isFile()) out.push(r); } })(root, ''); return out.sort(); },
  // pairs [{from: abs file, rel}] -> moved to flat staged names; the map keeps rel, size and the hash of the file the copy replaces
  stage(ctx, id, prefix, pairs, target, extra) {
    ST.clear(ctx, id, prefix);
    const files = [];
    pairs.forEach((p, i) => {
      const base = path.basename(p.rel).replace(/[\\/:*?"<>|\0]/g, '_').slice(-80), s = prefix + i + '_' + base, to = D.stagedPath(ctx, id, s);
      try { fs.renameSync(p.from, to); } catch { fs.copyFileSync(p.from, to); }
      const size = fs.statSync(to).size, tf = target ? path.join(target, ...p.rel.split('/')) : null;
      files.push({ s, rel: p.rel, size, was: tf && fs.existsSync(tf) ? ST.hashFile(tf) : null });
    });
    const map = Object.assign({ prefix, at: new Date().toISOString(), target: target || '', files }, extra || {});
    fs.writeFileSync(ST.mapFile(D.stageDir(ctx, id), prefix), JSON.stringify(map, null, 1));
    return map;
  },
  // compile side: the staged map -> copies; refuses a stale stage (answers changed) and a target file changed since
  copies(c, prefix, sig, stepName) {
    const map = ST.load(c.staging, prefix);
    if (!map) throw ST.bad('Run the step "' + stepName + '" first: it prepares the files this task writes.');
    if (map.sig !== sig) throw ST.bad('Your answers changed after the step "' + stepName + '". Run it again, then come back here.');
    const notes = [], copies = [];
    for (const f of map.files) {
      if (f.size > COPY_BIG) { notes.push('too big for a task copy (over 8 GB): ' + f.rel); continue; }
      if (map.target && f.was) { const now = ST.hashFile(path.join(map.target, ...f.rel.split('/'))); if (now !== f.was) throw ST.bad(f.rel + ' changed in the mod after the step "' + stepName + '". Run it again.'); }
      copies.push(f.size > COPY_MAX ? { staged: f.s, to: f.rel, max: COPY_BIG } : { staged: f.s, to: f.rel });
    }
    return { map, copies, notes };
  },
  isAbs: p => typeof p === 'string' && path.isAbsolute(p),
  inside(a, b) { const r = path.relative(path.resolve(b), path.resolve(a)); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); },
  remote(ctx) { if (ctx && ctx.session && ctx.session.remote) throw Object.assign(ST.bad('view only on this device', 403), { key: 'rmt.viewOnly' }); },
  // the draft a recipe route works on: the page sends its draft (saved answers may lag one step); it must exist on disk
  draftOf(ctx, body, recipe) {
    const d = D.clean(body && body.draft);
    if (d.recipe !== recipe) throw ST.bad('That task is not a ' + recipe + ' task.');
    if (!D.exists(ctx, d.id)) throw ST.bad('That task is not saved here any more: ' + d.id, 404);
    return d;
  },
  tail: (s, n) => String(s || '').split(/\r?\n/).filter(l => l.trim()).slice(-(n || 8)),
};

// ---------- what the answers mean
const GAMES_TO = ['as64', 'mowas2', 'goh'];
function inputs(v, mod, gameDir) {
  const list = x => [].concat(x || []).map(s => String(s).trim()).filter(Boolean), txt = x => String(x == null ? '' : x).trim();
  const to = GAMES_TO.includes(v('to')) ? v('to') : 'as64';
  return {
    src: txt(v('src')), from: ['mowas2', 'as64', 'goh'].includes(v('from')) ? v('from') : '', to,
    mode: to === 'as64' && ['classic', 'enhanced'].includes(v('mode')) ? v('mode') : '',
    only: list(v('only')), toBuild: txt(v('to_build')), patch: txt(v('patch')),
    donor: to === 'goh' ? txt(v('donor')) : '', exp: v('export') === true,
    // the AS2 install: the typed folder, else the GUI's game folder; GoH: typed, else upgrade finds it itself
    as2: txt(v('as2_dir')) || txt(gameDir), goh: txt(v('goh_dir')), gohVersion: to === 'goh' ? txt(v('goh_version')) : '',
    out: txt(mod),
  };
}
function refuse(i) {
  if (!ST.isAbs(i.src) || !fs.existsSync(i.src) || !fs.statSync(i.src).isDirectory()) return 'Pick the old mod folder first.';
  if (!ST.isAbs(i.out)) return 'Pick the new folder the copy goes into.';
  if (ST.inside(i.out, i.src) || ST.inside(i.src, i.out)) return 'The new folder must not be the old mod or inside it.';
  if (fs.existsSync(i.out) && (!fs.statSync(i.out).isDirectory() || fs.readdirSync(i.out).length)) return 'The new folder must be new or empty: upgrade never writes over files. Pick another folder: ' + i.out;
  if (i.patch && (!ST.isAbs(i.patch) || !fs.existsSync(i.patch))) return 'The folder to lay over the copy is not there: ' + i.patch;
  for (const [k, p] of [['AS2', i.as2], ['Gates of Hell', i.goh]]) if (p && (!ST.isAbs(p) || !fs.existsSync(p))) return 'The ' + k + ' game folder is not there: ' + p;
  return null;
}
// the contract input of tools/gui/contract.js COMMANDS.upgrade; compile.js sets plan and drops out/thenFix/export at Review
function cmdInput(i) {
  const o = { mod: i.src, to: i.to, out: i.out };
  if (i.from) o.from = i.from;
  if (i.mode) o.mode = i.mode;
  if (i.only.length) o.only = i.only;
  if (i.toBuild) o.toBuild = i.toBuild;
  if (i.patch) o.patch = i.patch;
  if (i.donor) o.donor = i.donor;
  if (i.gohVersion) o.gohVersion = i.gohVersion;
  if (i.as2) o.as2 = i.as2;
  if (i.goh) o.goh = i.goh;
  if (i.exp) o.export = true;
  return o;
}

// the task's game: the draft's (values, lookups opt.game), else the page's (ctx.gameId(), gui.js; a string where compile.js lookupCtx
// set it); nothing = as64. The GoH install of the page: ctx.curDir() under goh, else ctx.gohDir(); '' when the page has none (upgrade
// then finds it itself)
function gidOf(ctx, g) {
  if (g) return String(g);
  if (ctx && ctx.task && ctx.task.id) return String(ctx.task.id);   // README "The game of a task": lib/game.js hands it to every step
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch { return 'as64'; }
}
function gohDirOf(ctx) {
  if (ctx && ctx.task && ctx.task.gohDir) return String(ctx.task.gohDir);
  for (const k of ['curDir', 'gohDir']) { try { const f = ctx && ctx[k]; const d = typeof f === 'function' ? f.call(ctx) : null; if (d && (k === 'gohDir' || gidOf(ctx) === 'goh')) return String(d); } catch { /* next */ } }
  return '';
}
// the old mods the user may pick: the game's mods folder, plus the mod picked in the header, plus a typed folder path; on the Gates of
// Hell tab the GoH install's mods too (a GoH mod copied to AS64 or MoW:AS2), after the AS2 ones (an AS2 mod copied to GoH)
async function oldmods(ctx, words, opt) {
  const g = ctx.game && ctx.game(), seen = new Set(), out = [];
  const gohMods = gidOf(ctx, opt && opt.game) === 'goh' ? gohDirOf(ctx) : '';
  const add = dir => {
    const k = path.resolve(dir).toLowerCase(); if (seen.has(k)) return; seen.add(k);
    let info = ''; try { info = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1'); } catch { /* none */ }
    const nm = (/\{\s*Name\s+"([^"]*)"/i.exec(info) || [])[1] || path.basename(dir), min = (/MinGameVersion\s+"([^"]*)"/i.exec(info) || [])[1] || '';
    out.push({ id: path.resolve(dir), name: nm, where: path.dirname(path.resolve(dir)), ref: { path: path.resolve(dir) }, sub: path.basename(dir) + (min ? '  ' + min : '') });
  };
  const w = String(words || '').trim();
  if (ST.isAbs(w) && fs.existsSync(w) && fs.statSync(w).isDirectory()) add(w);
  if (opt && ST.isAbs(opt.mod) && fs.existsSync(opt.mod)) add(opt.mod);
  for (const base of [g, gohMods]) {
    if (!base) continue;
    const root = path.join(base, 'mods'); let names = []; try { names = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { /* none */ } for (const n of names) add(path.join(root, n));
  }
  const lw = w.toLowerCase();
  return out.filter(x => !lw || ST.isAbs(w) || (x.name + ' ' + x.sub).toLowerCase().includes(lw));
}

module.exports = {
  id: 'upgrade',
  verbs: ['change'],
  // goh: on the Gates of Hell tab the copy goes to Gates of Hell by default (upgrade --to goh, the GoH install from the tab); the new
  // folder is the user's: one inside the GoH install gets the write guard's refusal in plain words (ARSENAL never writes there)
  games: ['as64', 'mowas2', 'goh'],
  needs: [],                       // the old mod is a question; the folder written is the new copy (draft.mod, set by the up-out step)
  order: 200,
  title: { change: 'task.upgrade.t' },
  test: 'task.upgrade.test',   // the Test step: where to look in the game
  census: 'upgrade',
  groups: [
    { id: 'source', title: 'task.upgrade.g.source', essential: true, q: [
      { id: 'src', kind: 'thing', ask: 'task.upgrade.q.src', help: 'task.upgrade.h.src', covers: ['src.mod'], picker: { sources: ['exist'], lookup: 'oldmod' } },
      { id: 'from', kind: 'choice', ask: 'task.upgrade.q.from', help: 'task.upgrade.h.from', covers: ['src.from'], limits: { values: ['auto', 'mowas2', 'as64', 'goh'] } },
      { id: 'to', kind: 'choice', ask: 'task.upgrade.q.to', help: 'task.upgrade.h.to', covers: ['src.to'], limits: { values: ['as64', 'mowas2', 'goh'] } },
      { id: 'mode', kind: 'choice', ask: 'task.upgrade.q.mode', help: 'task.upgrade.h.mode', covers: ['src.mode'], limits: { values: ['enhanced', 'classic'], limit: 'VFS-19' }, when: { to: 'as64' } },
    ] },
    { id: 'place', title: 'task.upgrade.g.place', essential: true, q: [
      { id: 'out', kind: 'up-out', ask: 'task.upgrade.q.out', help: 'task.upgrade.h.out', covers: ['run.out'] },
    ] },
    { id: 'parts', title: 'task.upgrade.g.parts', essential: false, q: [
      { id: 'export', kind: 'yesno', ask: 'task.upgrade.q.export', help: 'task.upgrade.h.export', covers: ['run.export'] },
      { id: 'only', kind: 'list', ask: 'task.upgrade.q.only', help: 'task.upgrade.h.only', covers: ['run.only'], optional: true, limits: { re: '^[a-z0-9_./-]+$' } },
      { id: 'to_build', kind: 'text', ask: 'task.upgrade.q.to_build', help: 'task.upgrade.h.to_build', covers: ['src.to_build'], optional: true, limits: { re: '^[0-9a-f.]{0,40}$' } },
      { id: 'patch', kind: 'up-dir', ask: 'task.upgrade.q.patch', help: 'task.upgrade.h.patch', covers: ['carry.donor'], optional: true },
      { id: 'donor', kind: 'text', ask: 'task.upgrade.q.donor', help: 'task.upgrade.h.donor', covers: ['carry.donor'], optional: true, when: { to: 'goh' } },
      { id: 'goh_version', kind: 'text', ask: 'task.upgrade.q.goh_version', help: 'task.upgrade.h.goh_version', covers: ['src.to_build'], optional: true, when: { to: 'goh' }, limits: { re: '^[0-9.]{0,20}$' } },
      { id: 'as2_dir', kind: 'up-dir', ask: 'task.upgrade.q.as2_dir', help: 'task.upgrade.h.as2_dir', covers: ['carry.paths'], optional: true },
      // asked only for a Gates of Hell copy; a copy from Gates of Hell finds the folder by itself (a when cannot say "from or to")
      { id: 'goh_dir', kind: 'up-dir', ask: 'task.upgrade.q.goh_dir', help: 'task.upgrade.h.goh_dir', covers: ['carry.paths'], optional: true, when: { to: 'goh' } },
    ] },
  ],
  kept: [
    ['res.exit', 'no tool step yet as a question: the task reads the result itself (done, done with notes, or failed) and shows it at Review and Write'],
    ['run.plan', 'no tool step yet as a question: Review always shows what would change and Write always writes; there is nothing to choose'],
    ['run.then_fix', 'not safe to offer a novice: the fix step would write a second folder beside the new copy, outside the one folder a task may write; run the task "Fix a mod" on the new copy instead'],
    ['run.no_link', 'no tool step yet: the new copy always shares the unchanged paks with the old mod (hard links, no extra disk space); the old mod is never written through them. Copy the folder by hand when you want them apart'],
    ['carry.on', 'not safe to offer a novice: carrying game files into the mod needs a person to check each one first; use the Upgrade page'],
    ['chg.version_lines', 'no tool step yet: the version lines are always set by the rules of the two games and listed in UPGRADE.md'],
    ['chg.add_modinfo', 'no tool step yet: mod.info is always written when the mod has none'],
    ['chg.include_paths', 'no tool step yet: include paths are always renamed by the rules'],
    ['chg.encoding', 'no tool step yet: the text is always written in the encoding and line ends the target game reads'],
    ['chg.fileid', 'not safe to offer a novice: keeping the Workshop FileId would upload the copy over the original item; it is always dropped'],
    ['chg.require', 'no tool step yet: a Require the target game has built in is always dropped'],
    ['chg.dll', 'not safe to offer a novice: a DLL is built for one game exe; it is always left out and listed under CAN\'T in UPGRADE.md'],
    ['after.check', 'no tool step yet: the check reads the written copy, which is not there at Review; the Check step runs it after Write'],
    ['after.ticklist', 'no tool step yet: the tick list reads a written mod only; the checklist at the end lists what to look at'],
    ['after.play', 'not safe: a task never starts the game; the Test step hands over to the Play page'],
  ],
  checklist: ['task.upgrade.c.list', 'task.upgrade.c.report', 'task.upgrade.c.units', 'task.upgrade.c.fix'],
  lookups: { oldmod: oldmods },
  // the defaults by the task's game: AS64 and MoW:AS2 copy to AS64 (the MoW:AS2 tab keeps the 64-bit target, as the Upgrade page's easy
  // card); Gates of Hell copies to Gates of Hell with the tab's GoH install as the GoH folder
  values: (ctx, base, o) => {
    const goh = gidOf(ctx, o && o.game) === 'goh';
    return { from: 'auto', to: goh ? 'goh' : 'as64', mode: 'enhanced', export: false, only: [], to_build: '', patch: '', donor: 'auto', goh_version: '', as2_dir: '', goh_dir: goh ? gohDirOf(ctx) : '' };
  },
  compile: (draft, c) => {
    // --as2 is the AS2 install on every tab (c.gameDir is the GoH install under goh: README "The game of a task")
    const as2 = c.task && c.task.kind === 'goh' ? c.task.as2Dir : c.gameDir;
    const i = inputs(c.value, c.mod, as2), why = refuse(i);
    if (why) throw ST.bad(why);
    const notes = ['The old mod is only read: ' + i.src];
    if (!i.exp) notes.push('The new folder gets UPGRADE.md: what upgrade changed and what it left for you.');
    return { mod: i.out, calls: [{ cmd: 'upgrade', input: cmdInput(i) }], notes, result: path.basename(i.out) };
  },
  ST, inputs, cmdInput, _t: { gidOf, gohDirOf, oldmods },
};
