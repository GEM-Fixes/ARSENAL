// ext task: draft -> work. compile() runs recipe.compile(draft, cctx) with the children compiled first and merged in (or after, when
// the branch question says order: 'after'); plan() is the dry run (gen ops in a plan Ctx plus the full gen finish, the commands with
// their dry-run flag, each route with its own dry flag, the copy list); write() plans first, refuses on any error, takes a restore
// point of every file it is about to change (the Editor's format: files/lib undoRoot, restore-point.json, so the Editor lists and
// restores them), then runs the same steps for real. Files a step writes without naming them ahead (wrapped gen tools, routes with no
// dry run) are found by a listing of the mod before and after; their old bytes come from a copy kept before the first step. Every
// write goes into the picked mod only (draft.mod, or the mod a "make a mod" recipe makes); game and vanilla data are read only.
// Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-48efe5b6)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const D = require('./draft'), RC = require('./recipe'), GM = require('./game');

const bad = (m, s) => D.bad(m, s);
const MANIFEST = 'restore-point.json', UNDO_SUFFIX = '.arsenal-undo';
// a copy into the mod: 2 GB by default (a packed release, a model folder); a copy may say its own max (up to 8 GB). Uploads keep their
// own 64 MB limit (server.js UPLOAD_MAX); a staged copy streams, it is not read into memory
const COPY_MAX = 2048 * (1 << 20), COPY_MAX_TOP = 8192 * (1 << 20), KEY_MAX = 512 << 20;
const GUARD_FILE_MAX = 32 << 20, GUARD_ALL_MAX = 256 << 20;   // old bytes kept before a write: each file up to 32 MB, 256 MB in all
// the commands and tools a compile may name (each has a dry-run flag); routes: any ext POST route except this ext's own, plus the
// recipe's own routes under /api/x/task/r/<its id>/
// contract commands (tools/gui/contract.js) a task may run; none starts the game (a command with launch is refused). Per command:
// dry: the bool field set true in plan | dryField/dryOn/dryOff: an enum field (fix mode plan|apply) | read: writes nothing, runs in plan
// and write alike | out: the field naming the folder it writes, which must be the picked mod or inside it (exact: the mod itself) |
// drop: fields left out in plan | fail: exit code -> what it means. Exit code 3 is a partial result: done with notes, not a failure.
const CMDS = {
  new: { dry: 'dryRun', out: 'dir', exact: true },
  upgrade: { dry: 'plan', out: 'out', drop: ['out', 'thenFix', 'export'], long: true },
  fix: { dryField: 'mode', dryOn: 'plan', dryOff: 'apply', out: 'out', drop: ['out'], long: true },
  check: { read: true, long: true, fail: { 1: 'the check found problems that can crash the game or stop it loading this mod' } },
  gohport: { dry: 'dryRun', out: 'out', long: true },
};
const CMD_ALIAS = { goh2as2: 'gohport' };
const PARTIAL_CODE = 3;
const TOOLS = { newmod: { entry: 'newmod/newmod.js', dry: '--dry-run' } };
// route -> the body flag its dry run reads. write: write false is the dry run | dry, plan, dryRun: true is the dry run | read: writes
// nothing, runs in plan and write alike | none: no dry run (not called in plan, runs at Write, its files guarded by the listing).
// A call may name its own with dryFlag; a route in neither place is none (the safe default).
const DRY_FLAGS = ['write', 'dry', 'plan', 'dryRun', 'read', 'none'];
const ROUTE_DRY = {
  'POST /api/x/balance/change': 'write', 'POST /api/x/bots/edit': 'write', 'POST /api/x/bots/reset': 'write', 'POST /api/x/bots/buyfirst': 'write',
  'POST /api/x/doctrine/gen': 'write', 'POST /api/x/units/change': 'write', 'POST /api/x/units/add': 'write', 'POST /api/x/maps/clone': 'write',
  'POST /api/x/maps/place': 'write', 'POST /api/x/files/save': 'write', 'POST /api/x/files/copy': 'write', 'POST /api/x/files/restore': 'write',
  'POST /api/x/art/copy': 'dry', 'POST /api/x/art/camo-write': 'dry', 'POST /api/x/art/wav-convert': 'dry', 'POST /api/x/art/icon-png': 'dry',
  'POST /api/x/models/stage': 'dry', 'POST /api/x/models/anim/run': 'dry',
  'POST /api/x/doctrine/check': 'read', 'POST /api/x/maps/check': 'read', 'POST /api/x/art/check': 'read', 'POST /api/x/models/check': 'read',
  'POST /api/x/balance/table': 'read', 'POST /api/x/units/search': 'read', 'POST /api/x/units/stats': 'read',
  // share: package and workshop write only with write true (plan never packs or copies out); the rest read
  'POST /api/x/share/info': 'write', 'POST /api/x/share/preview': 'write', 'POST /api/x/share/package': 'write', 'POST /api/x/share/workshop': 'write',
  'POST /api/x/share/version': 'write', 'POST /api/x/share/gate': 'read', 'POST /api/x/share/outcheck': 'read', 'POST /api/x/share/card': 'read',
  'POST /api/x/share/clashes': 'read', 'POST /api/x/share/updated': 'read',
};
// routes a task never calls: they start an outside program or write into the game folder
const REFUSED_ROUTES = ['POST /api/x/share/uploader'];
// gen ops that run a tool which writes into the mod itself (its files are not in the plan's list)
const TOOL_OPS = ['mod', 'clone', 'map-clone', 'mission-clone', 'place'];

function isInside(root, p) { const r = path.relative(root, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }
function same(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function gameDir(ctx) { try { return (ctx.game && ctx.game()) || null; } catch { return null; } }
const gk = rel => String(rel).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
function findQ(recipe, qid) { for (const g of (recipe && recipe.groups) || []) for (const x of g.q || []) if (x && x.id === qid) return x; return null; }
function parentOf(ctx, d) { try { return d && d.parent && d.parent.draft && D.exists(ctx, d.parent.draft) ? D.load(ctx, d.parent.draft) : null; } catch { return null; } }

// the answer helpers a recipe's compile gets
function makeCctx(ctx, draft, values, recipe, parent) {
  const ans = draft.answers || {};
  const staging = D.stageDir(ctx, draft.id);
  const one = (a, id, i) => {
    const base = i == null ? values[id] : (Array.isArray(values[id]) ? values[id][i] : undefined);
    if (!a || a.src === 'keep') return base;
    if (a.src === 'value' || a.src === 'exist') return a.value;
    if (a.src === 'branch') return a.result !== undefined ? a.result : base;
    if (a.src === 'file') return (a.staged || []).map(n => D.stagedPath(ctx, draft.id, n));
    if (a.src === 'ext' && i != null) return a.value;
    return base;
  };
  const value = id => { const a = ans[id]; if (a && a.src === 'list') return (a.items || []).map((it, i) => one(it, id, i)); return one(a, id, null); };
  // the task's game (README "The game of a task"): gameDir is the install of that game (the GoH install under goh)
  const tg = GM.of(ctx, draft);
  // runTool, job: the request's own (not listed: a cctx prints and copies as before), for a compile that runs a tool beside the
  // server (text: lng merge). undefined in a ctx that has none; the recipe then runs the tool its sync way
  return Object.defineProperties({
    game: tg.id, gameDir: tg.kind === 'goh' ? tg.dir : gameDir(ctx), mod: draft.mod, target: tg.target, exe: tg.exe, task: tg, staging, values,
    draftId: draft.id, recipe: recipe.id, verb: draft.verb, base: draft.base || null,
    answer: id => ans[id] || null, value, kept: id => !ans[id] || ans[id].src === 'keep',
    // added (README Changes 22..): the parent draft of a branch, what the parent passed, the line of a list branch, staged paths
    parent: parent || null, pass: draft.pass || null, line: draft.parent && typeof draft.parent.line === 'number' ? draft.parent.line : null,
    stagedPath: n => D.stagedPath(ctx, draft.id, n),
  }, { runTool: { value: ctx && typeof ctx.runTool === 'function' ? ctx.runTool : undefined, enumerable: false }, job: { value: (ctx && ctx.job) || undefined, enumerable: false } });
}

async function valuesOf(ctx, recipe, draft, parent) {
  if (typeof recipe.values !== 'function') return {};
  if (parent === undefined) parent = parentOf(ctx, draft);
  const rc = lookupCtx(ctx, draft);
  try { return (await recipe.values(rc, draft.base, { draft, verb: draft.verb, parent, pass: draft.pass || null, game: rc.gameId })) || {}; } catch (e) { return {}; }
}
// the ctx of values, check and pass: route ctx + {mod, gameId (string), task, routeCtx()} for the draft's game (lib/game.js)
function lookupCtx(ctx, draft) { return GM.recipeCtx(ctx, draft || {}); }

// -> {gen: {ops: []} | null, genBases: [stage dir per op], calls, copies, notes, mod, result, children: [ids]}
async function compile(ctx, draft, recipes, depth, parent) {
  depth = depth || 0;
  if (depth > 12) throw bad('Branches go deeper than 12 tasks.');
  if (typeof draft === 'string') draft = D.load(ctx, draft);
  const recipe = recipes[draft.recipe];
  if (!recipe) throw bad('The recipe ' + draft.recipe + ' is not built yet.', 404);
  if (typeof recipe.compile !== 'function') throw bad('The recipe ' + draft.recipe + ' writes nothing (explore).');
  const d = JSON.parse(JSON.stringify(draft));
  const part = () => ({ ops: [], bases: [], calls: [], copies: [], notes: [] }), pre = part(), post = part(), children = [];
  let kidsFirst = false;
  const add = (into, r) => { const ops = (r.gen && r.gen.ops) || []; into.ops.push(...ops); into.bases.push(...ops.map((o, i) => (r.genBases && r.genBases[i]) || null)); into.calls.push(...r.calls); into.copies.push(...r.copies); into.notes.push(...r.notes); };
  if (parent === undefined) parent = depth === 0 ? parentOf(ctx, d) : null;
  for (const [qid, a] of Object.entries(d.answers || {})) {
    if (!a) continue;
    const items = a.src === 'branch' ? [a] : a.src === 'list' && Array.isArray(a.items) ? a.items : [];
    const q = findQ(recipe, qid), late = !!(q && q.picker && q.picker.order === 'after'), kinds = q ? RC.branchIds(q.picker) : [];
    for (const it of items) {
      if (!it || it.src !== 'branch' || !it.child) continue;
      if (!D.exists(ctx, it.child)) { pre.notes.push('branch ' + qid + ': the task it opened is gone'); continue; }
      const c = D.load(ctx, it.child);
      // each child runs with its own recipe; one outside the question's picker.branch list is refused (a draft changed by hand)
      if (kinds.length && !kinds.includes(c.recipe)) throw bad('branch ' + qid + ': the task it opened is a ' + c.recipe + ' task, which this question does not take (' + kinds.join(', ') + ').');
      it.recipe = c.recipe;
      if (!c.mod) c.mod = d.mod;
      const r = await compile(ctx, c, recipes, depth + 1, d);
      it.result = r.result;
      if (r.copiesFirst) kidsFirst = true;
      add(late ? post : pre, r);
      children.push(c.id, ...r.children);
    }
  }
  const values = await valuesOf(ctx, recipe, d, parent);
  const out = (await recipe.compile(d, makeCctx(ctx, d, values, recipe, parent))) || {};
  if (out.gen != null && (typeof out.gen !== 'object' || !Array.isArray(out.gen.ops))) throw bad('recipe ' + recipe.id + ': gen must be {ops: [...]}', 500);
  for (const k of ['calls', 'copies', 'notes']) if (out[k] != null && !Array.isArray(out[k])) throw bad('recipe ' + recipe.id + ': ' + k + ' must be a list', 500);
  // own parts carry where they come from: a copy's staged name is read from this draft's staging, a call may reach this recipe's routes
  const stage = D.stageDir(ctx, d.id), mine = part();
  const tag = (o, k, v) => { if (o && typeof o === 'object' && o[k] == null) Object.defineProperty(o, k, { value: v, enumerable: false, writable: true, configurable: true }); return o; };
  add(mine, { gen: out.gen ? { ops: out.gen.ops } : null, genBases: out.gen ? out.gen.ops.map(() => stage) : [], calls: (out.calls || []).map(c => tag(c, '_recipe', recipe.id)), copies: (out.copies || []).map(c => tag(c, '_draft', d.id)), notes: out.notes || [] });
  const all = part(); add(all, { gen: { ops: pre.ops }, genBases: pre.bases, calls: pre.calls, copies: pre.copies, notes: pre.notes }); add(all, { gen: { ops: mine.ops }, genBases: mine.bases, calls: mine.calls, copies: mine.copies, notes: mine.notes }); add(all, { gen: { ops: post.ops }, genBases: post.bases, calls: post.calls, copies: post.copies, notes: post.notes });
  return { gen: all.ops.length ? { ops: all.ops } : null, genBases: all.bases, calls: all.calls, copies: all.copies, notes: all.notes, mod: out.mod || d.mod || '', result: out.result, children,
    // copies before the gen steps at Write (some ops read files the copies bring): the compile result or the recipe says copiesFirst
    copiesFirst: !!(out.copiesFirst || recipe.copiesFirst || kidsFirst) };
}

// the game a task writes for: recipe.genGame(draft) -> a game id ('as64' | 'mowas2' | 'goh') when the recipe has it and names a known
// game (gohunit on the GoH tab: the unit goes into an AS2 mod, so gen, the copy marks, the calls and the mod folder guard run as that
// AS2 game), else the draft's own game. Returns the draft itself, or a shallow copy with game set to that id.
// ctx (the request): a draft saved with no game ('') is first read as the page's game (GM.of), the game its stage and the mod step
// use, so '' on the MoW:AS2 tab writes for mowas2 and '' on the GoH tab still for as64
function writeDraft(draft, recipes, ctx) {
  const r = recipes && draft && recipes[draft.recipe];
  if (!r || typeof r.genGame !== 'function') return draft;
  const asked = !draft.game && ctx ? Object.assign({}, draft, { game: GM.of(ctx, draft).id }) : draft;
  let g = null; try { g = require('../../../../lib/games').get(r.genGame(asked)); } catch { g = null; }
  return g && g.id !== draft.game ? Object.assign({}, draft, { game: g.id }) : draft;
}

// the one folder this task may write into
function modOf(ctx, draft, c) {
  const m = c.mod || draft.mod;
  if (!m || typeof m !== 'string' || !path.isAbsolute(m)) throw bad('Pick your mod first: a task writes only into the mod you picked.');
  if (draft.mod && c.mod && !same(draft.mod, c.mod)) throw bad('The task wants to write into ' + c.mod + ', but the mod you picked is ' + draft.mod + '. Nothing was written.', 403);
  const WG = require('../../../../lib/writeguard');
  // the install of the draft's game (the GoH install under goh: a folder inside it gets the guard's refusal, the plain line)
  const tg = GM.of(ctx, draft);
  const why = WG.refuseWrite(m, { game: (tg.kind === 'goh' ? tg.dir : gameDir(ctx)) || undefined, purpose: 'write a guided task' });
  if (why) throw bad(why, 403);
  return path.resolve(m);
}
// a path inside the mod, or a refusal
function inMod(mod, rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (!r || /\0/.test(r) || path.isAbsolute(r) || /^[a-z]:/i.test(r) || r.split('/').includes('..')) throw bad('A task may write only inside the picked mod: ' + r.slice(0, 120), 403);
  const f = path.resolve(mod, r);
  if (!isInside(mod, f)) throw bad('A task may write only inside the picked mod: ' + r.slice(0, 120), 403);
  return f;
}
function copyFrom(ctx, draft, mod, cp) {
  if (cp.staged != null) return { kind: 'staged', file: D.stagedPath(ctx, cp._draft || draft.id, cp.staged), label: cp.staged };
  if (cp.key != null) return { kind: 'key', key: String(cp.key).toLowerCase().replace(/\\/g, '/').replace(/^\/+/, ''), label: cp.key };
  throw bad('A copy needs staged (a staged file name) or key (a game file key).', 500);
}
function copyMax(cp) { const m = Number(cp && cp.max); return m > 0 ? Math.min(m, COPY_MAX_TOP) : COPY_MAX; }
function readCopy(ctx, mod, src, max) {
  if (src.kind === 'staged') { const st = fs.statSync(src.file); if (st.size > (max || COPY_MAX)) throw bad('A staged file is over ' + Math.round((max || COPY_MAX) / 1048576) + ' MB: ' + src.label, 413); return fs.readFileSync(src.file); }
  const R = require('../../view/ref');
  const b = fs.existsSync(mod) ? R.readKey(ctx, mod, src.key) : null;
  if (!b) throw bad('The game has no file ' + src.key, 404);
  if (b.length > Math.min(max || COPY_MAX, KEY_MAX)) throw bad('The game file is too big to copy: ' + src.key, 413);
  return b;
}
// one copy into the mod through a temp name; a staged file streams (no read into memory)
function putCopy(ctx, mod, src, to, max) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = to + '.arsenal-tmp';
  if (src.kind === 'staged') { const st = fs.statSync(src.file); if (st.size > (max || COPY_MAX)) throw bad('A staged file is over ' + Math.round((max || COPY_MAX) / 1048576) + ' MB: ' + src.label, 413); fs.copyFileSync(src.file, tmp); }
  else fs.writeFileSync(tmp, readCopy(ctx, mod, src, max));
  fs.renameSync(tmp, to);
}
function cmdName(c) { return CMD_ALIAS[c] || c; }
function dryOf(c) { return c.dryFlag || ROUTE_DRY[c.route] || 'none'; }
function checkCall(ctx, mod, c) {
  if (c && c.cmd) {
    const name = cmdName(c.cmd), spec = CMDS[name];
    if (!spec) throw bad('A task may run only these commands: ' + Object.keys(CMDS).concat(Object.keys(CMD_ALIAS)).join(', '), 403);
    const cmd = require('../../../contract').COMMANDS[name];
    if (!cmd || cmd.launch) throw bad('The ' + c.cmd + ' command starts the game: a task never runs it.', 403);
    if (c.input != null && (typeof c.input !== 'object' || Array.isArray(c.input))) throw bad('A command call needs input as an object.', 500);
    if (spec.out) {
      const dir = c.input && c.input[spec.out];
      if (!dir || !(spec.exact ? same(dir, mod) : same(dir, mod) || isInside(path.resolve(mod), path.resolve(String(dir))))) throw bad(spec.exact ? 'The ' + c.cmd + ' command must name the picked mod (' + spec.out + ').' : 'The ' + c.cmd + ' command must write into the picked mod or a folder inside it (' + spec.out + ').', 403);
    }
    if (c.ok != null && typeof c.ok !== 'function') throw bad('A call\'s ok must be a function (result) -> true when it worked.', 500);
    return 'cmd';
  }
  if (c && c.tool) {
    const t = TOOLS[c.tool];
    if (!t) throw bad('A task may run only these tools: ' + Object.keys(TOOLS).join(', '), 403);
    if (!Array.isArray(c.args) || !c.args.length || !same(c.args[0], mod)) throw bad('The ' + c.tool + ' tool must name the picked mod first.', 403);
    return 'tool';
  }
  if (c && c.route) {
    if (REFUSED_ROUTES.includes(String(c.route))) throw bad('A task never calls ' + c.route + ': it starts an outside program or writes into the game folder.', 403);
    const own = /^POST \/api\/x\/task\/r\/([a-z][a-z0-9-]*)\/[a-z0-9/_-]+$/.exec(String(c.route));
    if (own) { if (!c._recipe || own[1] !== c._recipe) throw bad('A task may call only its own routes under /api/x/task/r/<its id>/: ' + String(c.route).slice(0, 80), 403); }
    else if (!/^POST \/api\/x\/[a-z0-9-]+\/[a-z0-9/_-]+$/.test(c.route) || /^POST \/api\/x\/task\//.test(c.route)) throw bad('A task may call only another page\'s POST route: ' + String(c.route).slice(0, 80), 403);
    if (c.dryFlag != null && !DRY_FLAGS.includes(c.dryFlag)) throw bad('dryFlag must be one of ' + DRY_FLAGS.join(', ') + ': ' + String(c.dryFlag).slice(0, 20), 500);
    if (c.ok != null && typeof c.ok !== 'function') throw bad('A call\'s ok must be a function (result) -> true when it worked.', 500);
    return 'route';
  }
  throw bad('A call is {cmd, input}, {tool, args} or {route, body}.', 500);
}
function extRoute(name) {
  const all = require('../../index');
  for (const x of all) if (x.routes && x.routes[name]) return x.routes[name];
  throw bad('No route ' + name, 404);
}
function routeFn(c, recipes) {
  if (/^POST \/api\/x\/task\/r\//.test(c.route)) { const r = recipes && recipes[c._recipe], f = r && r.routes && r.routes[c.route]; if (typeof f !== 'function') throw bad('No route ' + c.route, 404); return f; }
  return extRoute(c.route);
}
// why a route call failed (empty: it worked): a throw, errors (a list, or a count above 0), ok false, a status outside 2xx, an
// error field, or the call's own ok(result) saying no
function failsOf(r, thrown, c) {
  const out = [], msg = e => (e && (e.msg || e.message)) || String(e);
  if (thrown) out.push(msg(thrown));
  if (r && typeof r === 'object') {
    if (Array.isArray(r.errors)) out.push(...r.errors.map(msg));
    else if (typeof r.errors === 'number' && r.errors > 0) out.push(r.errors + ' error(s) found');
    // a call with its own ok(result) decides for itself: some routes use ok:false for "worked, with a warning" (a stereo sound)
    if (r.ok === false && typeof (c && c.ok) === 'function') { /* the call's own test below decides */ }
    else if (r.ok === false) out.push(String(r.message || r.why || (typeof r.error === 'string' ? r.error : '') || 'the step said it did not work').slice(0, 400));
    else if (r.error) out.push(typeof r.error === 'string' ? r.error : msg(r.error));
    if (typeof r.status === 'number' && (r.status < 200 || r.status > 299)) out.push('status ' + r.status);
  }
  if (!thrown && c && typeof c.ok === 'function') { try { if (!c.ok(r)) out.push('the step did not pass its own test'); } catch (e) { out.push('the step\'s own test failed: ' + msg(e)); } }
  return [...new Set(out)];
}
// a command's game fields when the draft's game is not as64 and the recipe left them out: target (new, fix: the enum has the id),
// exe (check: a list of ids), goh (a command with a goh field: the GoH install), game (new under goh: --game is the GoH install,
// newmod rangeOf). as64 (or no tg): nothing added, the AS64 argument list stays as it was
function cmdGame(name, cmd, input, tg) {
  if (!tg || tg.id === 'as64') return;
  const fl = n => (cmd.fields || []).find(f => f.name === n);
  const t = fl('target');
  if (t && input.target == null && (!t.values || t.values.includes(tg.target))) input.target = tg.target;
  // exe: a list of ids (check) takes the id; an enum takes the vfs exe only when it lists it (gohport/translate: as64|mowas_2, the AS2
  // view: a MoW:AS2 draft gets mowas_2, a GoH draft nothing); a path or a free exe file name is never filled
  const e = fl('exe');
  if (e && input.exe == null) {
    if (e.type === 'list') input.exe = tg.id;
    else if (e.type === 'enum' && (e.values || []).includes(tg.exe)) input.exe = tg.exe;
  }
  if (tg.kind === 'goh') {
    if (fl('goh') && !input.goh && tg.gohDir) input.goh = tg.gohDir;
    // --game is the GoH install where it means the install of the target game (new: newmod rangeOf; fix: fix.js refuses an AS2 folder)
    if ((name === 'new' || name === 'fix') && !input.game && tg.gohDir) input.game = tg.gohDir;
  }
}
// the newmod tool: --target <id> (and under goh --game <GoH install>) when the game is not as64 and the args name none
function toolGame(tool, args, tg) {
  if (!tg || tg.id === 'as64' || tool !== 'newmod') return;
  if (!args.includes('--target')) args.push('--target', tg.target);
  if (tg.kind === 'goh' && !args.includes('--game') && tg.gohDir) args.push('--game', tg.gohDir);
}
// JOBS (tools/gui/README.md "JOBS"): the request that plans or writes a task is one job. jobOf: its handle (none in a test ctx);
// stopped: the footer's Cancel was pressed (or the page went away); jobStep: the step that starts now, n of total, for the footer row
// ("n-1 / total" done). A step loop asks stopped() before every step: after a stop no further step starts and nothing more is written.
// canCancel is set at each step start so Cancel can be pressed during a step that runs no tool of its own (it takes effect at the
// next step); a ctx.runTool child (tool, contract command, another page's route called in process with this ctx) is killed at once.
const jobOf = ctx => (ctx && ctx.job && typeof ctx.job.set === 'function' ? ctx.job : null);
const stopped = ctx => !!(ctx && ctx.job && ctx.job.cancelled);
function jobStep(ctx, name, n, total) { const j = jobOf(ctx); if (!j) return; j.set({ stage: String(name || ''), done: n - 1, total }); if (!j.cancelled) j.canCancel = true; }
const callName = c => c.cmd || c.tool || String(c.route || '').replace(/^POST \/api\/x\//, '');
// the name of the task in the job list (another window reads it; the page that asked names its own row): the draft's title, else
// what it is made from, else the recipe id
function jobTitle(draft) { const b = draft && draft.base; return String((draft && draft.title) || (b && (b.name || b.id)) || (draft && draft.recipe) || '').slice(0, 80); }
function jobName(ctx, draft) { const j = jobOf(ctx); if (j) j.set({ what: 'job.w.task', whatP: { name: jobTitle(draft) } }); }

// tg: the draft's game (lib/game.js of); none = as before (the request's own ctx, AS64 defaults)
async function runCall(ctx, mod, c, write, recipes, tg) {
  const kind = checkCall(ctx, mod, c);
  if (kind === 'cmd') return runCmd(ctx, c, write, tg);
  if (kind === 'tool') {
    const t = TOOLS[c.tool], args = c.args.map(String).filter(a => a !== t.dry);
    toolGame(c.tool, args, tg);
    if (!write) args.push(t.dry);
    const r = await ctx.runTool(c.tool, t.entry, args, { timeoutMs: 120000 });
    return { kind, tool: c.tool, args, code: r.code, out: String(r.stdout || '').slice(0, 8000), err: String(r.stderr || '').slice(0, 4000), ok: r.code === 0 && !r.timedOut, cancelled: !!r.cancelled || stopped(ctx) };
  }
  const flag = dryOf(c), body = Object.assign({}, c.body || {}, { mod });
  if (flag !== 'read') {
    if (write) { body.write = true; if (flag !== 'write' && flag !== 'none') body[flag] = false; }
    else { if (flag === 'none') return { kind, route: c.route, flag, later: true, ok: true, errors: [], result: null }; body.write = false; if (flag !== 'write') body[flag] = true; }
  }
  const fn = routeFn(c, recipes);
  // the route reads the draft's game through its ctx (gameId() exe() kind() gohDir() curDir()), not the tab's
  const rctx = tg ? GM.routeCtx(ctx, tg) : ctx;
  let r = null, thrown = null;
  try { r = await fn(new URL('http://127.0.0.1' + c.route.slice(5)), body, rctx); } catch (e) { thrown = e; }
  const errs = failsOf(r, thrown, c);
  // the inner route got this request's ctx (GM.routeCtx copies it: job, jobs and the job-aware runTool), so its children are this
  // request's and a stop kills them; what it answered after a stop is not a result
  return { kind, route: c.route, flag, ok: !errs.length, errors: errs, result: r, cancelled: stopped(ctx) };
}

// a contract command: plan sets its dry field (or leaves it as is when it only reads); a jsonfile result is read back. Exit 0 = ok,
// 3 = done with notes (the tool's findings go in notes), anything else (or the call's own ok(result) saying no) = failed
async function runCmd(ctx, c, write, tg) {
  const contract = require('../../../contract'), name = cmdName(c.cmd), spec = CMDS[name], cmd = contract.COMMANDS[name];
  const input = Object.assign({}, c.input);
  cmdGame(name, cmd, input, tg);
  // a command that takes the game folder gets the GUI's own when the recipe did not name one
  if (!input.game && (cmd.fields || []).some(f => f.name === 'game') && gameDir(ctx)) input.game = gameDir(ctx);
  if (!spec.read) {
    if (spec.dryField) input[spec.dryField] = write ? spec.dryOff : spec.dryOn;
    else if (write) delete input[spec.dry]; else input[spec.dry] = true;
    if (!write) for (const k of spec.drop || []) delete input[k];
  }
  const built = contract.buildArgv(name, input);
  if (built.launches) throw bad('The ' + c.cmd + ' command would start the game: refused.', 403);
  let args = built.args, tmp = null;
  if (cmd.result === 'jsonfile' && cmd.jsonFlag) { if (ctx && ctx.tmpRoot) fs.mkdirSync(ctx.tmpRoot, { recursive: true }); tmp = fs.mkdtempSync(path.join((ctx && ctx.tmpRoot) || os.tmpdir(), 'task-cmd-')); args = args.concat([cmd.jsonFlag, path.join(tmp, 'result.json')]); }
  let r, result = null;
  try {
    r = await ctx.runTool(cmd.tool, cmd.entry, args, { timeoutMs: spec.long ? 1800000 : 120000 });
    if (tmp) { try { result = JSON.parse(fs.readFileSync(path.join(tmp, 'result.json'), 'utf8')); } catch { /* none written */ } }
  } finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ } } }
  const out = { kind: 'cmd', cmd: c.cmd, args, code: r.code, out: String(r.stdout || '').slice(0, 8000), err: String(r.stderr || '').slice(0, 4000), result, ok: false, notes: [], errors: [] };
  if (r.cancelled || stopped(ctx)) { out.cancelled = true; out.errors.push('stopped'); return out; }
  if (r.timedOut) out.errors.push('timed out');
  else if (r.code === 0) out.ok = true;
  else if (r.code === PARTIAL_CODE) { out.ok = true; out.partial = true; out.notes = findingsOf(result, out.err || out.out); }
  else out.errors.push((spec.fail && spec.fail[r.code]) || ('exit code ' + r.code + ': ' + (out.err || out.out).trim().split(/\r?\n/).slice(-3).join(' ')));
  if (out.ok && typeof c.ok === 'function') { try { if (!c.ok(result || out)) { out.ok = false; out.errors.push('the step did not pass its own test'); } } catch (e) { out.ok = false; out.errors.push('the step\'s own test failed: ' + e.message); } }
  return out;
}
// the findings a tool's report holds, as short lines (for "done with notes")
function findingsOf(result, text) {
  const out = [], line = x => (typeof x === 'string' ? x : x && typeof x === 'object' ? [x.code, x.msg || x.message || x.why || x.file].filter(Boolean).join(': ') : String(x));
  if (result && typeof result === 'object') for (const k of ['partial', 'findings', 'notes', 'warnings', 'errors']) if (Array.isArray(result[k])) out.push(...result[k].slice(0, 50).map(line));
  if (!out.length && text) out.push(...String(text).trim().split(/\r?\n/).filter(Boolean).slice(-5));
  return out.slice(0, 80);
}

// the mod's Require list from its mod.info, with their own Require (deps first), for the gen run's view of the game. exe (the vfs
// exe of the draft's game): the as64+ built-in is found only for as64 (none given: as before, as64.exe in the folder decides)
function depsOf(game, mod, exe) {
  try {
    const mi = path.join(mod, 'mod.info');
    if (!game || !fs.existsSync(mi)) return [];
    const sdl = require('../../../../lib/sdl'), { readText } = require('../../../../lib/enc'), names = require('../../../../lib/names'), V = require('../../../../lib/vfs');
    const root = sdl.kids(sdl.parseLines(readText(mi, 'cp1251').lines), 'mod')[0];
    const own = root ? sdl.kids(root, 'Require').map(b => (b.vals.length ? String(b.vals[0].v) : '')).map(s => names.normalize(s.split(':')[0])).filter(Boolean) : [];
    if (!own.length) return [];
    const plus = (exe == null || exe === 'as64') && fs.existsSync(path.join(game, 'as64.exe'));
    const found = V.discover(game, [], { plus }), order = [], seen = new Set([names.normalize(path.basename(mod))]);
    const visit = id => {
      if (seen.has(id)) return; seen.add(id);
      const m = found.get(id);
      if (m) for (const r of m.requires || []) visit(r);
      if (m && !m.builtIn) order.push(m.folder); else if (m || (id === 'as64+' && (exe == null || exe === 'as64'))) order.push(id);
    };
    own.forEach(visit);
    return order;
  } catch { return []; }
}

// the planned copies as gen keys -> bytes, for the gen plan of a copiesFirst task (see plan)
const SEED_FILE_MAX = 64 << 20, SEED_ALL_MAX = 256 << 20;
function planSeed(ctx, draft, mod, copies, notes) {
  const seed = new Map(); let total = 0;
  for (const cp of copies) {
    let b;
    try {
      const src = copyFrom(ctx, draft, mod, cp);
      if (src.kind === 'staged' && fs.statSync(src.file).size > SEED_FILE_MAX) { notes.push('The gen plan does not see the copy to ' + cp.to + ' (over 64 MB); Write copies it first all the same.'); continue; }
      b = readCopy(ctx, mod, src, Math.min(copyMax(cp), SEED_FILE_MAX));
    } catch { continue; }   // a staged file gone or too big is an error of the plan already; a game key that cannot be read is too at Write
    if (total + b.length > SEED_ALL_MAX) { notes.push('The gen plan does not see the copy to ' + cp.to + ' (the planned copies are over 256 MB); Write copies it first all the same.'); continue; }
    total += b.length; seed.set(gk(cp.to), b);
  }
  return seed;
}
// gen ops in process, into the mod (plan mode writes nothing). bases: the staging folder per op (a branch's op reads its own).
// seed (plan only): key -> bytes put in the gen Ctx overlay first (the planned copies of a copiesFirst task)
function genRun(ctx, draft, mod, ops, plan, bases, seed) {
  const g = gameDir(ctx), tg = GM.of(ctx, draft);
  if (tg.kind === 'goh' && !tg.dir) throw bad('No Gates of Hell folder found. Set the GoH folder on the Start page first.');
  if (tg.kind !== 'goh' && !g) throw bad('No game folder found. Set the game folder on the Start page first.');
  const U = require('../../units/server').lib, G = U.gen(), OPS = G.genMain.OPS;
  // the gen Ctx of the draft's game: target as64|mowas2|goh, exe (the vfs exe), goh = the GoH install under goh; as64 as before
  const o = { target: tg.target, game: g, out: mod, plan, deps: depsOf(tg.kind === 'goh' ? tg.dir : g, mod, tg.exe) };
  if (tg.id !== 'as64') o.exe = tg.exe;
  if (tg.kind === 'goh') o.goh = tg.dir;
  // gen's Ctx builds its view with o.exe itself (gen/lib/ctx.js): a MoW:AS2 task never mounts the AS64 set (as64/core)
  const gctx = new G.Ctx(o);
  if (plan && seed) for (const [k, b] of seed) gctx.write(k, b);
  const base = D.stageDir(ctx, draft.id), name = path.basename(mod);
  ops.forEach((s, i) => {
    const kind = s && s.op, fn = OPS[kind];
    gctx.base = (bases && bases[i]) || base;   // ops-asset reads staged .wav / .dds files from ctx.base
    if (!fn) { gctx.err('GEN_BAD_SPEC', 'ops[' + i + ']: unknown op "' + kind + '"', 'task'); return; }
    try { G.ops[fn](gctx, s, kind === 'set' ? gctx.base : { name }); } catch (e) { gctx.err('GEN_CRASH', 'ops[' + i + '] ' + kind + ': ' + (e.message || e), 'task'); }
  });
  gctx.base = base;
  return gctx;
}
// the end of a gen run (as tools/gen/gen.js main): flush, the text keys every op collected (text, card, roster, army names) into
// localization/#<mod>.lng (or a mod copy of the vanilla file that has the key), flush, fold newmod's empty text file. Plan: notes only
function finishGen(gctx, mod) {
  const G = require('../../units/server').lib.gen(), slug = G.ops.slug(path.basename(mod));
  for (const f of gctx.pendingX || []) gctx.rep.info(f.file, f.line, f.code, f.msg);
  gctx.pendingX = [];
  gctx.flush();
  if (typeof G.genMain.finishText === 'function') {
    try { G.genMain.finishText(gctx, slug); } catch (e) { gctx.err('GEN_CRASH', 'text: ' + (e.message || e), 'task'); }
    gctx.flush();
    try { if (typeof G.genMain.renameTextFile === 'function') G.genMain.renameTextFile(gctx, slug); } catch (e) { gctx.err('GEN_CRASH', 'text file: ' + (e.message || e), 'task'); }
    return;
  }
  // a gen without the finish exported: one lng-add per key into #<slug>.lng
  if (gctx.goh) { if (gctx.texts.length) gctx.err('GEN_TOOL_FAILED', 'text keys were not written (GoH needs gen finishText)', 'text'); return; }
  const file = '#' + slug + '.lng';
  for (const t of gctx.texts) {
    if (gctx.plan) { gctx.rep.info('localization/' + (t.file || file), 0, 'GEN_PLAN_TEXT', t.key + ' = ' + t.text); continue; }
    const r = G.lngAdd.run({ dir: gctx.out, file: t.file || file, key: t.key, text: t.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'), game: gctx.game, force: true });
    if (r.fail) { gctx.err('GEN_TOOL_FAILED', 'lng-add ' + t.key + ': refused', 'text'); continue; }
    fs.mkdirSync(path.dirname(r.abs), { recursive: true }); fs.writeFileSync(r.abs, r.newBuf);
  }
}
// the files the gen finish says it will write (plan): GEN_PLAN_TEXT notes name localization/<file>
function genTextFiles(gctx) {
  const out = [];
  for (const f of gctx.rep.toJSON({ tool: 'gen' }).info) if (f.code === 'GEN_PLAN_TEXT' && f.file && !out.includes(f.file)) out.push(String(f.file).replace(/\\/g, '/'));
  return out;
}

// the files another page's dry run says it will write, as rels inside the mod. Read loosely (each page names them its own way):
// files/written/changed/wrote lists of strings or {rel|file|key|path|to}, and a single rel/file/path; anything outside the mod is dropped
function routeFiles(mod, r) {
  const out = [], add = v => {
    if (v == null) return;
    if (typeof v === 'object') { for (const k of ['rel', 'file', 'key', 'path', 'to']) if (typeof v[k] === 'string') { add(v[k]); return; } return; }
    let s = String(v).replace(/\\/g, '/');
    if (!s || s.indexOf('\u0000') >= 0) return;
    if (path.isAbsolute(s) || /^[a-z]:/i.test(s)) { if (!isInside(mod, path.resolve(s))) return; s = path.relative(mod, path.resolve(s)).replace(/\\/g, '/'); }
    if (s.split('/').includes('..')) return;
    s = s.replace(/^\/+/, '');
    if (s && !out.includes(s)) out.push(s);
  };
  if (!r || typeof r !== 'object') return out;
  for (const k of ['files', 'written', 'changed', 'wrote']) if (Array.isArray(r[k])) r[k].slice(0, 2000).forEach(add);
  for (const k of ['rel', 'file', 'path']) if (typeof r[k] === 'string') add(r[k]);
  return out;
}
// a listing of the mod (rel -> size and time) to find what a step changed; at most 50000 files, the undo folder is beside it
function treeOf(mod) {
  const out = new Map(), walk = (d, rel) => {
    if (out.size > 50000) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const r = rel ? rel + '/' + e.name : e.name, f = path.join(d, e.name); if (e.isDirectory()) walk(f, r); else if (e.isFile() && !/\.arsenal-tmp$/.test(e.name)) { try { const st = fs.statSync(f); out.set(r, st.size + ':' + st.mtimeMs); } catch { /* gone */ } } }
  };
  walk(mod, '');
  return out;
}

// -> {mod, files: [{rel, action}], calls: [...], copies: [...], errors, warnings, notes}
// opt.write: the plan is the first half of a write (the footer counts the write's own steps after the plan's). A stop (stopped(ctx))
// ends it before the next step: {..., stopped: true}, what it holds is not a whole plan
async function plan(ctx, draftOrId, recipes, opt) {
  const draft = typeof draftOrId === 'string' ? D.load(ctx, draftOrId) : draftOrId;
  jobName(ctx, draft);
  const rr = recipes[draft.recipe];
  if (draft.verb === 'explore' || (rr && Array.isArray(rr.verbs) && rr.verbs.length && rr.verbs.every(v => v === 'explore'))) throw bad('An explore task writes nothing: there is no plan or write for it.', 400);
  const c = await compile(ctx, draft, recipes), wd = writeDraft(draft, recipes, ctx), tg = GM.of(ctx, wd);
  const mod = modOf(ctx, wd, c);
  const res = { mod, files: [], calls: [], copies: [], errors: [], warnings: [], notes: c.notes.slice(), gen: c.gen, genFiles: [], raw: c };
  // action: change (the mod has the file), copy (the mod gets its own changed copy of a game file), new (no such file anywhere yet)
  let game; const inGame = rel => { if (game === undefined) { game = null; try { const v = GM.view(ctx, tg, '').v; game = v && v.files ? v.files : null; } catch { game = null; } } return !!(game && game.has(gk(rel))); };
  const actOf = rel => fs.existsSync(path.join(mod, rel)) ? 'change' : inGame(rel) ? 'copy' : 'new';
  const addFile = (rel, by) => { if (!res.files.some(x => gk(x.rel) === gk(rel))) res.files.push(Object.assign({ rel, action: actOf(rel) }, by ? { by } : {})); };
  for (const cl of c.calls) checkCall(ctx, mod, cl);
  const pt = planSteps(c), total = pt + (opt && opt.write ? writeSteps(c).length : 0);
  let sn = 0;
  // a list line answered by a source its question does not name (a typed line where picker.sources has no 'value') is refused
  if (rr) for (const [qid, a] of Object.entries(draft.answers || {})) {
    const q = findQ(rr, qid), srcs = q && q.kind === 'list' && q.picker && Array.isArray(q.picker.sources) ? q.picker.sources : null;
    if (srcs && a && a.src === 'list') (a.items || []).forEach((it, i) => { if (it && it.src && it.src !== 'keep' && !srcs.includes(it.src)) res.errors.push({ code: 'TASK_LINE_SRC', msg: qid + ' line ' + (i + 1) + ': this list takes ' + srcs.join(', ') + ', not ' + it.src }); });
  }
  res.copiesFirst = !!c.copiesFirst;
  // copies first: the gen plan sees the planned copies as an overlay (gen Ctx dirty, the same way gen holds its own planned files),
  // each up to 64 MB, 256 MB in all; a copy over that, or one that cannot be read, is left out with a note
  const seed = c.copiesFirst && c.gen ? planSeed(ctx, draft, mod, c.copies, res.notes) : null;
  if (seed && !seed.size) res.notes.push('Copies go first at Write: the plan of the gen steps reads the mod as it is now, before the copies.');
  else if (seed) res.notes.push('Copies go first at Write: the plan of the gen steps sees the planned copies (' + seed.size + ') as if they were in the mod already; the gen steps ' + TOOL_OPS.join(', ') + ' read the mod folder itself and do not see them.');
  for (const cp of c.copies) { const f = inMod(mod, cp.to); const src = copyFrom(ctx, draft, mod, cp); if (src.kind === 'staged' && !fs.existsSync(src.file)) res.errors.push({ code: 'TASK_STAGED_GONE', msg: 'A staged file is gone: ' + src.label }); else if (src.kind === 'staged' && fs.statSync(src.file).size > copyMax(cp)) res.errors.push({ code: 'TASK_COPY_BIG', msg: 'A staged file is over ' + Math.round(copyMax(cp) / 1048576) + ' MB: ' + src.label }); res.copies.push({ from: src.label, to: cp.to, exists: fs.existsSync(f) }); res.files.push({ rel: String(cp.to).replace(/\\/g, '/'), action: actOf(cp.to) }); }
  for (const cl of c.calls.filter(x => x.cmd || x.tool)) {
    if (stopped(ctx)) { res.stopped = true; return res; }
    jobStep(ctx, callName(cl), ++sn, total);
    const r = await runCall(ctx, mod, cl, false, recipes, tg); r.files = [];
    if (r.cancelled) { res.stopped = true; return res; }
    res.calls.push(r);
    if (r.ok) for (const line of r.out.split(/\r?\n/)) { const m = /^file (\S.*?)(?: \(\d+ bytes\))?$/.exec(line.trim()); if (m) { r.files.push(m[1]); res.files.push({ rel: m[1], action: actOf(m[1]) }); } }
    if (!r.ok) res.errors.push({ code: 'TASK_CALL', msg: (r.cmd || r.tool) + ': ' + (r.errors && r.errors.length ? r.errors.join('; ') : (r.err || r.out).trim().split(/\r?\n/).slice(-3).join(' ')) });
    else if (r.partial) res.notes.push((r.cmd || r.tool) + ' (plan) is done with notes: ' + r.notes.slice(0, 5).join('; '));
    if (r.kind === 'cmd' && !r.files.length && !CMDS[cmdName(r.cmd)].read) res.notes.push('The ' + r.cmd + ' command names its files only when it runs: the files it writes get a restore point at Write (listed after the write).');
  }
  if (stopped(ctx)) { res.stopped = true; return res; }
  if (c.gen) {
    jobStep(ctx, 'gen', ++sn, total);
    if (!fs.existsSync(mod)) res.errors.push({ code: 'TASK_NO_MOD', msg: 'The mod folder is not there yet: ' + mod });
    else {
      const g = genRun(ctx, wd, mod, c.gen.ops, true, c.genBases, seed), F = require('../../units/server').lib;
      let f = F.findings(g);
      if (!f.errors.length) { finishGen(g, mod); f = F.findings(g); }
      res.errors.push(...f.errors); res.warnings.push(...f.warnings);
      // a seeded copy the gen steps left as it was is the copy's file, not a gen file
      for (const k of g.dirty.keys()) { if (seed && seed.has(k) && seed.get(k) === g.dirty.get(k)) continue; addFile(k); res.genFiles.push(k); }
      // copies after the gen steps (no copiesFirst): a copy to a file the gen steps write replaces what they wrote
      if (!c.copiesFirst) for (const cp of c.copies) if (res.genFiles.includes(gk(cp.to))) res.notes.push('The copy to ' + cp.to + ' goes after the gen steps at Write and replaces what they write there (say copiesFirst to copy first).');
      for (const k of genTextFiles(g)) { addFile(k); res.genFiles.push(k); }
      const tools = [...new Set(c.gen.ops.map(o => o && o.op).filter(o => TOOL_OPS.includes(o)))];
      if (tools.length) res.notes.push('The gen steps ' + tools.join(', ') + ' name their files only when they run: those files get a restore point at Write too.');
    }
  }
  for (const cl of c.calls.filter(x => x.route)) {
    if (stopped(ctx)) { res.stopped = true; return res; }
    jobStep(ctx, callName(cl), ++sn, total);
    const r = await runCall(ctx, mod, cl, false, recipes, tg);
    if (r.cancelled) { res.stopped = true; return res; }
    res.calls.push(r); for (const e of r.errors) res.errors.push({ code: 'TASK_ROUTE', msg: cl.route.replace(/^POST \/api\/x\//, '') + ': ' + e });
    // the files the route's own dry run names get a restore point before the real call; a route with no dry run runs at Write
    r.files = routeFiles(mod, r.result);
    for (const rel of r.files) addFile(rel, cl.route);
    if (r.later) res.notes.push('The ' + cl.route.replace(/^POST \/api\/x\//, '') + ' step has no dry run: it will run at Write; the files it writes get a restore point then.');
    else if (!r.files.length && r.flag !== 'read') res.notes.push('The ' + cl.route.replace(/^POST \/api\/x\//, '') + ' step did not name its files ahead: the files it writes get a restore point at Write (listed after the write).');
  }
  if (stopped(ctx)) res.stopped = true;
  return res;
}
// the steps of a plan (a number) and of a write (in the order write() runs them): {name, kind: tool|cmd|route|copies|gen, state}
// state: left (not started), done, stopped (it was running when the stop came: what it had written by then stays), failed
const planSteps = c => c.calls.length + (c.gen ? 1 : 0);
function writeSteps(c) {
  const st = (name, kind) => ({ name, kind, state: 'left' }), out = [];
  for (const cl of c.calls.filter(x => x.cmd || x.tool)) out.push(st(callName(cl), cl.cmd ? 'cmd' : 'tool'));
  const cps = c.copies.length ? [st('copies', 'copies')] : [];
  if (c.copiesFirst) out.push(...cps);
  if (c.gen) out.push(st('gen', 'gen'));
  if (!c.copiesFirst) out.push(...cps);
  for (const cl of c.calls.filter(x => x.route)) out.push(st(callName(cl), 'route'));
  return out;
}

// a restore point in the Editor's format (tools/gui/ext/files/lib.js snapshot): one folder per file, the old bytes under files/<rel>.
// opt.old: the old bytes kept earlier (null: the file was not there); without opt the file on disk now is the old copy
function stampId() { const d = new Date(), z = (n, w) => String(n).padStart(w || 2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '-' + z(d.getMilliseconds(), 3); }
function snapshot(mod, rel, action, opt) {
  const root = path.join(path.dirname(mod), path.basename(mod) + UNDO_SUFFIX), f = inMod(mod, rel);
  let id = stampId(), n = 1;
  while (fs.existsSync(path.join(root, id))) id = stampId() + '-' + (++n);
  const dir = path.join(root, id);
  let b = null;
  if (opt && 'old' in opt) b = opt.old; else { try { if (fs.statSync(f).isFile()) b = fs.readFileSync(f); } catch { /* new file */ } }
  fs.mkdirSync(dir, { recursive: true });
  const m = { id, time: new Date().toISOString(), rel: String(rel).replace(/\\/g, '/'), action, existed: !!b, size: b ? b.length : 0, hash: null };
  if (b) { m.hash = crypto.createHash('sha1').update(b).digest('hex'); const to = path.join(dir, 'files', ...m.rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, b); }
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 1));
  return m.id;
}
// before the first step: the listing of the mod and a copy of the old bytes (smallest files first, within the caps) in the temp folder
function guardStart(ctx, mod) {
  const tree = treeOf(mod), dir = path.join((ctx && ctx.tmpRoot) || path.join(os.tmpdir(), 'arsenal-gui'), 'task-guard', stampId() + '-' + crypto.randomBytes(3).toString('hex'));
  const list = [...tree].map(([rel, sig]) => ({ rel, size: Number(sig.split(':')[0]) || 0 })).sort((a, b) => a.size - b.size);
  const kept = new Set(); let total = 0;
  for (const f of list) {
    if (f.size > GUARD_FILE_MAX || total + f.size > GUARD_ALL_MAX) break;
    try { const to = path.join(dir, ...f.rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(mod, ...f.rel.split('/')), to); kept.add(f.rel); total += f.size; } catch { /* not kept: unguarded if it changes */ }
  }
  return { tree, dir, kept };
}
// after the last step: every file that is new, changed or gone and has no restore point yet gets one (old bytes from the copy);
// a changed file whose old bytes were not kept (over the caps) is returned as unguarded
function guardEnd(gd, mod, action, guarded, restore) {
  const after = treeOf(mod), un = [], rels = new Set([...gd.tree.keys(), ...after.keys()]);
  gd.changed = 0;
  for (const rel of rels) {
    if (gd.tree.get(rel) === after.get(rel)) continue;
    gd.changed++;
    if (guarded.has(gk(rel))) continue;
    try {
      if (!gd.tree.has(rel)) { restore.push(snapshot(mod, rel, action, { old: null })); guarded.add(gk(rel)); }
      else if (gd.kept.has(rel)) { restore.push(snapshot(mod, rel, action, { old: fs.readFileSync(path.join(gd.dir, ...rel.split('/'))) })); guarded.add(gk(rel)); }
      else un.push(rel);
    } catch { un.push(rel); }
  }
  try { fs.rmSync(gd.dir, { recursive: true, force: true }); } catch { /* temp */ }
  return un;
}

// an outside program that saves straight into the mod (external.js back.inMod): before it opens, the mod's listing and old bytes are
// kept (guardStart) and noted in <staging root>/<draft id>.extguard.json; "I am done", Write and Throw away close it: each file the
// program made, changed or removed gets a restore point (action task:<id>:<program>). A second open keeps the first copy.
function extGuardFile(ctx, id) { return path.join(D.stageRoot(ctx), D.checkId(id) + '.extguard.json'); }
function extGuardOpen(ctx, draft, mod, prog) {
  const f = extGuardFile(ctx, draft.id);
  try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); if (o && o.mod && path.resolve(o.mod).toLowerCase() === path.resolve(mod).toLowerCase()) return { open: true, kept: true }; extGuardClose(ctx, draft.id); } catch { /* none yet */ }
  const gd = guardStart(ctx, mod);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ mod: path.resolve(mod), prog: String(prog || ''), dir: gd.dir, tree: [...gd.tree], kept: [...gd.kept], at: new Date().toISOString() }));
  return { open: true, kept: false, files: gd.tree.size };
}
function extGuardClose(ctx, id) {
  const f = extGuardFile(ctx, id);
  let o; try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  try { fs.unlinkSync(f); } catch { /* gone */ }
  const restore = [];
  if (!o || !o.mod || !fs.existsSync(o.mod)) { try { if (o && o.dir) fs.rmSync(o.dir, { recursive: true, force: true }); } catch { /* temp */ } return { closed: true, restore, changed: 0, unguarded: [] }; }
  const gd = { tree: new Map(o.tree || []), kept: new Set(o.kept || []), dir: o.dir };
  const unguarded = guardEnd(gd, o.mod, 'task:' + id + (o.prog ? ':' + o.prog : ''), new Set(), restore);
  return { closed: true, restore, changed: gd.changed, unguarded, prog: o.prog || '' };
}

// plan first; any error stops it before a byte is written. -> plan result + {written: true, restore: [ids], unguarded, steps}
// A stop (the footer's Cancel, the page gone): no further step starts, nothing more is written, and the answer is {written: false,
// stopped: true, partial (files changed), restore, unguarded, steps}: every file the steps so far changed (also a step killed part way)
// has its restore point (guardEnd), so the undo works as after a whole write. ctx.job.writes is set when the first write step is due
// (stopping the plan half is harmless: the footer asks once there, twice from then on).
async function write(ctx, draftOrId, recipes) {
  if (ctx.session && ctx.session.remote) throw bad('view only on this device', 403);
  const draft = typeof draftOrId === 'string' ? D.load(ctx, draftOrId) : draftOrId;
  const p = await plan(ctx, draft, recipes, { write: true }), wd = writeDraft(draft, recipes, ctx), tg = GM.of(ctx, wd);
  const steps = writeSteps(p.raw), pt = planSteps(p.raw), total = pt + steps.length;
  if (p.stopped || stopped(ctx)) return Object.assign(p, { written: false, stopped: true, partial: false, restore: [], unguarded: [], steps, errors: [] });
  if (p.errors.length) return Object.assign(p, { written: false, restore: [] });
  const job = jobOf(ctx); if (job) job.writes = true;
  let si = -1, stop = false;
  // the next step: false (and nothing runs) once the stop came
  const begin = () => { if (stop || stopped(ctx)) { stop = true; return false; } si++; jobStep(ctx, steps[si].name, pt + si + 1, total); return true; };
  const end = state => { steps[si].state = state; if (state === 'stopped') stop = true; };
  // what an outside program saved into the mod since it opened gets its restore points first (its own action)
  const pre = extGuardClose(ctx, draft.id);
  const mod = p.mod, c = p.raw, restore = pre ? pre.restore.slice() : [], action = 'task:' + draft.id, done = [], guarded = new Set();   // guarded: rels (lower case) with a restore point
  const named = rel => { if (guarded.has(gk(rel))) return; restore.push(snapshot(mod, rel, action)); guarded.add(gk(rel)); };
  const dryOfCall = (i, kinds) => p.calls.filter(x => kinds.includes(x.kind))[i] || null;
  let fail = null, unguarded = [];
  const gd = guardStart(ctx, mod);
  try {
    const ct = c.calls.filter(x => x.cmd || x.tool);
    for (const [i, cl] of ct.entries()) {
      if (!begin()) break;
      const dry = dryOfCall(i, ['cmd', 'tool']);
      for (const rel of (dry && dry.files) || []) named(rel);
      const r = await runCall(ctx, mod, cl, true, recipes, tg);
      if (r.cancelled) { end('stopped'); break; }
      done.push(r); end(r.ok ? 'done' : 'failed');
      if (!r.ok) { fail = [{ code: 'TASK_CALL', msg: (r.cmd || r.tool) + ': ' + (r.errors && r.errors.length ? r.errors.join('; ') : (r.err || r.out).trim().split(/\r?\n/).slice(-3).join(' ')) }]; break; }
    }
    const copies = () => { if (!c.copies.length || !begin()) return; for (const cp of c.copies) {
      const to = inMod(mod, cp.to), src = copyFrom(ctx, draft, mod, cp);
      named(String(cp.to).replace(/\\/g, '/'));
      putCopy(ctx, mod, src, to, copyMax(cp));
    } end('done'); };
    if (!fail && c.copiesFirst) copies();
    if (!fail && c.gen && begin()) {
      for (const rel of p.genFiles) named(rel);
      const g = genRun(ctx, wd, mod, c.gen.ops, false, c.genBases), F = require('../../units/server').lib;
      let f = F.findings(g);
      if (!f.errors.length) { finishGen(g, mod); f = F.findings(g); }
      if (f.errors.length) fail = f.errors;
      else for (const k of g.dirty.keys()) named(k);
      if (!fail) g.flush();
      end(fail ? 'failed' : 'done');
    }
    if (!fail && !c.copiesFirst) copies();
    if (!fail) for (const [i, cl] of c.calls.filter(x => x.route).entries()) {
      if (!begin()) break;
      const dry = dryOfCall(i, ['route']);
      for (const rel of (dry && dry.files) || []) named(rel);
      const r = await runCall(ctx, mod, cl, true, recipes, tg);
      // a stop that came while the last step ran, the step itself done: nothing is left undone, the write is whole
      if (r.cancelled && !(r.ok && si === steps.length - 1)) { end('stopped'); break; }
      done.push(r); end(r.ok ? 'done' : 'failed');
      if (!r.ok) { fail = r.errors.map(e => ({ code: 'TASK_ROUTE', msg: cl.route.replace(/^POST \/api\/x\//, '') + ': ' + e })); break; }
    }
  } catch (e) { if (si >= 0 && steps[si].state === 'left') steps[si].state = 'failed'; throw e; }
  finally { unguarded = (pre ? pre.unguarded : []).concat(guardEnd(gd, mod, action, guarded, restore)); }
  if (!fail && !stop && stopped(ctx) && steps.some(s => s.state === 'left')) stop = true;
  if (stop) return Object.assign(p, { written: false, stopped: true, partial: gd.changed > 0, restore, unguarded, calls: done, steps, errors: [] });
  if (fail) return Object.assign(p, { written: false, partial: gd.changed > 0, restore, unguarded, calls: done, steps, errors: fail });
  if (job) job.set({ done: total, total });
  const notes = done.filter(r => r.partial).map(r => (r.cmd || r.tool || r.route) + ' is done with notes: ' + (r.notes || []).slice(0, 8).join('; '));
  return Object.assign(p, { written: true, restore, unguarded, steps, calls: done.length ? done : p.calls, notes: p.notes.concat(notes) });
}

module.exports = { compile, plan, write, writeDraft, snapshot, extGuardOpen, extGuardClose, extGuardFile, routeFiles, treeOf, inMod, modOf, checkCall, runCmd, runCall, cmdGame, toolGame, findingsOf, putCopy, copyMax, makeCctx, valuesOf, lookupCtx, depsOf, genRun, finishGen, failsOf, dryOf, jobOf, stopped, jobStep, jobTitle, writeSteps, planSteps, guardStart, guardEnd, parentOf, findQ, CMDS, CMD_ALIAS, TOOLS, ROUTE_DRY, REFUSED_ROUTES, DRY_FLAGS, COPY_MAX };
