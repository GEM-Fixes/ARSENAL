// ext task: drafts. One JSON file per draft in <GUI data>/tasks (ctx.taskDir or env AS2_TASK_DIR win, so tests stay in a scratch
// folder); staged files in <tmpRoot>/task/<draft id>/. Saved on every answer, so a closed window or GUI loses nothing.
// Contract: ../README.md "Draft". Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-d81ea09c)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MAX = 1 << 20;   // one draft file: 1 MB
const STATES = ['open', 'written', 'checked', 'done'];

function bad(msg, status) { const e = new Error(msg); e.status = status || 400; return e; }
// the same with a translation key (and its slots) the page shows in its own language (task.e.* rows in ../lang.js)
function badK(key, msg, status, params) { const e = bad(msg, status); e.key = key; if (params) e.params = params; return e; }
function dir(ctx) {
  const d = (ctx && ctx.taskDir) || process.env.AS2_TASK_DIR || path.join(require('../../../../lib/platform').dataDir(), 'tasks');
  return path.resolve(d);
}
function stageRoot(ctx) { return path.resolve(path.join((ctx && ctx.tmpRoot) || path.join(require('os').tmpdir(), 'arsenal-gui'), 'task')); }
function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) throw bad('That is not a task id: ' + String(id).slice(0, 60)); return id; }
function fileOf(ctx, id) { return path.join(dir(ctx), checkId(id) + '.json'); }
function stageDir(ctx, id) { return path.join(stageRoot(ctx), checkId(id)); }
function stamp() { const d = new Date(), z = (n, w) => String(n).padStart(w || 2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); }
function newId(recipe) { return String(recipe).replace(/[^a-z0-9-]/g, '').slice(0, 30) + '-' + stamp() + '-' + crypto.randomBytes(3).toString('hex'); }

function load(ctx, id) {
  const f = fileOf(ctx, id);
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') throw badK('task.e.gone', 'That task is not saved here any more: ' + id, 404); throw e; }
  try { return JSON.parse(s); } catch (e) { throw badK('task.e.damaged', 'The task file is damaged: ' + f, 500); }
}
function exists(ctx, id) { try { return fs.statSync(fileOf(ctx, id)).isFile(); } catch { return false; } }

// keep only the fields the contract names; check the shape
function clean(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('A task must be an object.');
  checkId(d.id);
  if (!/^[a-z][a-z0-9-]*$/.test(String(d.recipe || ''))) throw bad('A task needs its recipe id.');
  const answers = d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers) ? d.answers : {};
  // one answer; a list answer holds one per line (any source but list)
  const one = (k, a, line) => {
    if (!a || typeof a !== 'object' || !['value', 'keep', 'exist', 'branch', 'file', 'ext'].concat(line ? [] : ['list']).includes(a.src)) throw bad('Answer ' + k + ' needs src value, keep, exist, branch, file, ext' + (line ? '' : ' or list') + '.');
    if (a.src === 'branch' && a.child != null) checkId(a.child);
    // a branch answer keeps which recipe its child is (picker.branch may name several)
    if (a.src === 'branch' && a.recipe != null && !/^[a-z][a-z0-9-]*$/.test(String(a.recipe))) throw bad('Answer ' + k + ': recipe must be a recipe id.');
    if (a.src === 'file') { if (!Array.isArray(a.staged) || a.staged.length > 2000) throw bad('Answer ' + k + ': staged must be a list of file names.'); try { a.staged = a.staged.map(stagedName); } catch (e) { throw bad('Answer ' + k + ': staged must be a list of file names.'); } }
    if (a.src === 'list') { if (!Array.isArray(a.items) || a.items.length > 500) throw bad('Answer ' + k + ': items must be a list (at most 500 lines).'); a.items.forEach((it, i) => one(k + '[' + i + ']', it, true)); }
  };
  for (const [k, a] of Object.entries(answers)) {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) throw bad('Answer name ' + k.slice(0, 40) + ' is not a question id.');
    one(k, a, false);
  }
  const o = {
    id: d.id, recipe: d.recipe, verb: ['make', 'change', 'explore'].includes(d.verb) ? d.verb : 'make',
    game: typeof d.game === 'string' ? d.game : '', mod: typeof d.mod === 'string' ? d.mod : '',
    base: d.base && typeof d.base === 'object' ? { id: d.base.id == null ? null : String(d.base.id), ref: d.base.ref || null, name: d.base.name == null ? null : String(d.base.name) } : null,
    parent: d.parent && typeof d.parent === 'object' ? Object.assign({ draft: checkId(d.parent.draft), q: String(d.parent.q || '') }, Number.isInteger(d.parent.line) && d.parent.line >= 0 ? { line: d.parent.line } : {}) : null,
    pass: passOf(d.pass),
    answers, kept: Array.isArray(d.kept) ? d.kept.filter(x => typeof x === 'string').slice(0, 200) : [],
    // mode quick: groups that are not essential stay as copied, one line each, until "Ask these" (asked: those group ids);
    // all (or no mode, a draft from before): every question is a step
    mode: d.mode === 'quick' ? 'quick' : 'all',
    asked: Array.isArray(d.asked) ? d.asked.filter(x => typeof x === 'string').slice(0, 200) : [],
    state: STATES.includes(d.state) ? d.state : 'open', step: typeof d.step === 'string' ? d.step.slice(0, 80) : '',
    ticks: Array.isArray(d.ticks) ? d.ticks.filter(x => typeof x === 'string').slice(0, 200) : [],
    restore: Array.isArray(d.restore) ? d.restore.filter(x => typeof x === 'string').slice(0, 500) : [],
    title: typeof d.title === 'string' ? d.title.slice(0, 200) : '',
    at: new Date().toISOString(),
  };
  const st = stoppedOf(d.stopped); if (st) o.stopped = st;
  return o;
}
// what a stopped write left (server.js writeRoute; README "Stopping"): {at, steps: [{name, kind, state}], changed, points, unguarded}
function stoppedOf(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const KINDS = ['cmd', 'tool', 'route', 'copies', 'gen'], ST = ['left', 'done', 'stopped', 'failed'];
  return {
    at: typeof s.at === 'string' ? s.at.slice(0, 40) : '',
    steps: (Array.isArray(s.steps) ? s.steps : []).filter(x => x && typeof x === 'object').slice(0, 200).map(x => ({ name: String(x.name || '').slice(0, 120), kind: KINDS.includes(x.kind) ? x.kind : 'tool', state: ST.includes(x.state) ? x.state : 'left' })),
    changed: !!s.changed, points: Number.isInteger(s.points) && s.points >= 0 ? s.points : 0,
    unguarded: (Array.isArray(s.unguarded) ? s.unguarded : []).filter(x => typeof x === 'string').slice(0, 30).map(x => x.slice(0, 300)),
  };
}
// what a parent question passed to its branch: {for, keys, base, answers, verb}, JSON only, 64 KB at most
function passOf(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  let s; try { s = JSON.stringify(p); } catch { throw bad('A branch can be passed plain data only.'); }
  if (s.length > 65536) throw bad('What a question passes to its branch is over 64 KB.', 413);
  return JSON.parse(s);
}
function save(ctx, d) {
  const o = clean(d), s = JSON.stringify(o, null, 1);
  if (s.length > MAX) throw bad('The task is too big to save (over 1 MB).', 413);
  const f = fileOf(ctx, o.id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp-' + process.pid; fs.writeFileSync(tmp, s); fs.renameSync(tmp, f);
  return o;
}
function all(ctx) {
  let names = []; try { names = fs.readdirSync(dir(ctx)); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!/\.json$/.test(n) || !ID_RE.test(n.slice(0, -5))) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir(ctx), n), 'utf8'))); } catch { /* a damaged file is skipped in the list */ }
  }
  return out;
}
// top-level drafts for Continue (children show inside their parent), newest first
function list(ctx) {
  const a = all(ctx), kids = {};
  for (const d of a) if (d.parent && d.parent.draft) kids[d.parent.draft] = (kids[d.parent.draft] || 0) + 1;
  return a.filter(d => !d.parent).map(d => ({ id: d.id, recipe: d.recipe, verb: d.verb, game: d.game, mod: d.mod, state: d.state, step: d.step, title: d.title || '', base: d.base, at: d.at, children: kids[d.id] || 0 }))
    .sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
function childrenOf(ctx, id) { return all(ctx).filter(d => d.parent && d.parent.draft === id); }
// removes the draft, its children (all the way down) and their staged files
function remove(ctx, id) {
  checkId(id);
  const gone = [], walk = x => { for (const c of childrenOf(ctx, x)) walk(c.id); try { fs.unlinkSync(fileOf(ctx, x)); gone.push(x); } catch (e) { if (e.code !== 'ENOENT') throw e; } rmStage(ctx, x); };
  walk(id);
  return gone;
}
function rmStage(ctx, id) {
  const root = stageRoot(ctx), d = stageDir(ctx, id);
  if (path.dirname(d) !== root) return;
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
}
// opt: {line: the list line it answers, pass: {for, keys, base, answers, verb}}: pass.base is the child's base ({id, ref, name} or an
// id), pass.answers its preset answers (a plain value is {src: 'value', value}), pass.verb make or change (default make)
function child(ctx, parentId, q, recipe, opt) {
  const p = load(ctx, parentId); opt = opt || {};
  if (!/^[a-z][a-z0-9_]*$/.test(String(q || ''))) throw bad('A branch needs the question it answers.');
  const pass = passOf(opt.pass), answers = {};
  if (pass && pass.answers && typeof pass.answers === 'object') for (const [k, v] of Object.entries(pass.answers)) answers[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof v.src === 'string' ? v : { src: 'value', value: v };
  const parent = { draft: p.id, q }; if (Number.isInteger(opt.line) && opt.line >= 0) parent.line = opt.line;
  const base = pass && pass.base && typeof pass.base === 'object' ? pass.base : pass && pass.base != null ? { id: String(pass.base) } : null;
  return save(ctx, { id: newId(recipe), recipe, verb: pass && ['make', 'change'].includes(pass.verb) ? pass.verb : 'make', game: p.game, mod: p.mod, base, parent, pass, answers, kept: [], mode: p.mode === 'quick' ? 'quick' : 'all', asked: [], state: 'open' });
}
// a staged name: a file name or a path of names inside the staging folder ('a.wav', 'pics/a.dds'); a backslash reads as '/'; refuses
// '..', '.', drive letters and anything that is not a plain name. -> 'a/b.wav'
function stagedName(name) {
  const n = String(name == null ? '' : name).replace(/\\/g, '/'), segs = n.split('/');
  if (!n || n.length > 400 || segs.length > 8 || segs.some(x => !/^[^\\/:*?"<>|\0]{1,120}$/.test(x) || /^\.+$/.test(x))) throw bad('That file name cannot be staged: ' + n.slice(0, 60));
  return segs.join('/');
}
// a staged name -> its path; refuses a name that leaves the draft's staging folder
function stagedPath(ctx, id, name) {
  const d = stageDir(ctx, id), n = stagedName(name);
  const f = path.resolve(d, ...n.split('/')), r = path.relative(d, f);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw bad('That file name leaves the staging folder: ' + n.slice(0, 60));
  return f;
}

module.exports = { dir, stageRoot, stageDir, stagedPath, stagedName, passOf, newId, load, exists, save, list, all, childrenOf, remove, child, clean, checkId, ID_RE, bad, badK };
