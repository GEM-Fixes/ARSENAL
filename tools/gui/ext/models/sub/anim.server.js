// Models page, Animation part wave 2): batch changes to a staged .anm without opening SOEdit.
// Routes: POST /api/x/models/anim/info { mod, anm } -> facts; /run { mod, anm, operation, bone, from, to, at, count, name, track, dry }
// -> the tool's result + raw text; /undo { mod, anm } -> puts the .bak back (in process).
// Command line [V tools/soedit/ops/anim.js, run by anim.test.js], spelling kept in OPS below so it is corrected in one place:
//   node tools/soedit/soedit.js ops anim <operation> <file.anm> [--bone b] [--from N] [--to N] [--at N] [--count N] [--name n]
//     [--track f.json] [--visible 0|1] --json [--dry]   one JSON object on stdout { ok, operation, file, out, frames, bones, version, changed, error, bak }
// The .anm must sit inside the mod folder and exist (same test as ../server.js staged): only staged copies are ever changed.
// Game: the ops work on the staged .anm in the mod only, the same on AS64 and MoW:AS2 (no game read, no --exe). Under Gates of Hell
// the same (the GoH sequence keys events and additive are kept and may be set, lib/model/edit/anm.js).
// Author: Imperator_Aug (ARSENAL, ia-680362f5)
const fs = require('fs'), path = require('path');
const G = require('../game');
const ENTRY = 'soedit/soedit.js';

// ---------- the operation table: name -> group and the fields it takes (order = argv order) ----------
// group: frames | bones | whole (how the page groups the select); need: fields that must be given; opt: fields that may be given.
// [V tools/soedit/ops/anim.js OPS + animops.js header]. Left out on purpose: `new` (makes a file) and `--matrix` (12 numbers).
const OPS = {
  'info':             { group: null,     need: [], opt: [] },
  'insert-frame':     { group: 'frames', need: ['at'], opt: ['count'] },
  'delete-frames':    { group: 'frames', need: ['from'], opt: ['to'] },
  'duplicate':        { group: 'frames', need: ['from', 'to'], opt: [] },
  'move':             { group: 'frames', need: ['from', 'to', 'at'], opt: [] },
  'copy-forward':     { group: 'frames', need: ['bone', 'at'], opt: ['count'] },
  'fill':             { group: 'frames', need: ['from', 'to'], opt: ['bone'] },
  'clone-bone':       { group: 'bones',  need: ['bone'], opt: ['name'] },
  'rename-bone':      { group: 'bones',  need: ['bone', 'name'], opt: [] },
  'reset-bone':       { group: 'bones',  need: ['bone'], opt: ['from', 'to'] },
  'add-bone':         { group: 'bones',  need: ['name'], opt: [] },
  'remove-bone':      { group: 'bones',  need: ['bone'], opt: [] },
  'export-bone':      { group: 'bones',  need: ['bone', 'track'], opt: [] },
  'import-bone':      { group: 'bones',  need: ['track'], opt: ['name'] },
  'set-visibility':   { group: 'bones',  need: ['bone', 'from', 'to', 'visible'], opt: [] },
  'reverse':          { group: 'whole',  need: [], opt: ['from', 'to'] },
  'drop-first-frame': { group: 'whole',  need: [], opt: [] },
};
const FIELDS = ['bone', 'from', 'to', 'at', 'count', 'name', 'track', 'visible'];   // argv order
const FLAG = { bone: '--bone', from: '--from', to: '--to', at: '--at', count: '--count', name: '--name', track: '--track', visible: '--visible' };
const NUM = ['from', 'to', 'at', 'count'];

const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const U = () => require('../../units/server').lib;
function inside(a, b) { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modNeed(ctx, b) { return G.modGuard(ctx, b, path.resolve(U().modOf(b, gameOpt(ctx, b), true))); }
function stagedAnm(mod, rel) {
  if (!rel) bad('Pick an animation first.');
  const p = path.resolve(mod, String(rel));
  if (!inside(p, mod)) bad('The animation must be inside your mod folder.');
  if (path.extname(p).toLowerCase() !== '.anm') bad('The animation must be a .anm file.');
  if (!fs.existsSync(p)) bad('The animation is not in your mod yet. Press "Copy into my mod" first.');
  return p;
}
// the copy kept before the first change: <file>.anm.bak [V ops/anim.js writeSafe: dest + '.bak', an existing one is kept]
function bakOf(p) { const b = p + '.bak'; return fs.existsSync(b) ? b : null; }
function visibleOf(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  if (['1', 'true', 'show'].includes(s)) return '1';
  if (['0', 'false', 'hide'].includes(s)) return '0';
  return bad('Choose Show or Hide.');
}
const outOf = r => String((r.stdout || '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '')).trim();
function toolFailed(r) {
  const t = outOf(r);
  if (/Cannot find module[^\n]*soedit/i.test(t)) return 'The SOEdit helper (tools/soedit/soedit.js) is not part of this copy of ARSENAL yet.';
  if (r.timedOut) return 'The animation helper took too long and was stopped.';
  return t.split('\n').slice(-6).join('\n') || ('exit code ' + r.code);
}
// one JSON object on stdout: the whole text, or the last line that is one
function jsonOut(r) {
  const s = String(r.stdout || '').trim();
  try { return JSON.parse(s); } catch (e) { /* try lines */ }
  const lines = s.split(/\r?\n/).reverse();
  for (const l of lines) if (/^\s*\{/.test(l)) { try { return JSON.parse(l); } catch (e) { /* next */ } }
  return null;
}
function whole(k, v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
  if (!Number.isInteger(n) || n < 0) bad('"' + k + '" must be a whole number, 0 or more (frames count from 0).');
  return String(n);
}
function word(k, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) bad('Fill in "' + k + '".');
  if (s[0] === '-') bad('A name cannot start with "-".');
  if (/[\x00-\x1f\x7f]/.test(s)) bad('A name cannot hold control characters.');
  return s;
}
// the track file of export-bone / import-bone: inside the mod; for export the default sits beside the animation
function trackOf(mod, anm, b, op) {
  let t = b.track ? String(b.track) : '';
  if (!t) { if (op === 'import-bone') bad('Pick the bone file to read.'); t = anm.replace(/\.anm$/i, '') + '.' + String(b.bone || 'bone').replace(/[^\w.\-]/g, '_') + '.json'; }
  if (t[0] === '-') bad('A file name cannot start with "-".');
  const p = path.resolve(mod, t);
  if (!inside(p, mod)) bad('The bone file must be inside your mod folder.');
  if (op === 'import-bone' && !fs.existsSync(p)) bad('The bone file was not found: ' + p);
  return p;
}

function argvOf(op, anm, mod, b) {
  const spec = OPS[op];
  const args = ['ops', 'anim', op, anm];
  for (const k of FIELDS) {
    const given = b[k] != null && b[k] !== '';
    const needed = spec.need.includes(k);
    if (!needed && !(spec.opt.includes(k) && given)) continue;
    if (k === 'track') { args.push(FLAG[k], trackOf(mod, anm, b, op)); continue; }
    if (!given && needed) bad('Fill in "' + k + '".');
    args.push(FLAG[k], k === 'visible' ? visibleOf(b[k]) : NUM.includes(k) ? whole(k, b[k]) : word(k, b[k]));
  }
  const fi = args.indexOf('--from'), ti = args.indexOf('--to');
  if (fi > 0 && ti > 0 && Number(args[fi + 1]) > Number(args[ti + 1])) bad('"from" must not be after "to".');
  args.push('--json');
  if (b.dry) args.push('--dry');
  return args;
}

// ---------- info: facts read loosely (several field names accepted) ----------
function verNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}
// real shape [V ops/anim.js]: { ok, frames, bones: [name], version, info: { keyed: [{bone,keys}], visibility: [{bone,frame,visible}], problems } }
function shapeInfo(j) {
  j = j || {};
  const inf = (j.info && typeof j.info === 'object') ? j.info : {};
  const keyed = {}, vis = {};
  for (const k of Array.isArray(inf.keyed) ? inf.keyed : []) keyed[String(k.bone)] = Number(k.keys);
  for (const v of Array.isArray(inf.visibility) ? inf.visibility : []) vis[String(v.bone)] = (vis[String(v.bone)] || 0) + 1;
  if (!Array.isArray(j.problems) && Array.isArray(inf.problems)) j = Object.assign({}, j, { problems: inf.problems });
  const list = [j.boneList, j.boneInfo, j.bonesInfo, Array.isArray(j.bones) ? j.bones : null, Array.isArray(inf.bones) ? inf.bones : null].find(Array.isArray) || [];
  const boneList = list.map(x => typeof x === 'string' ? { name: x, keys: x in keyed ? keyed[x] : null, visibilityChanges: x in vis ? vis[x] : (inf.visibility ? 0 : null) } : {
    name: String(x.name || x.bone || ''),
    keys: x.keys != null ? (Array.isArray(x.keys) ? x.keys.length : Number(x.keys)) : x.keyCount != null ? Number(x.keyCount) : x.keyed != null ? Number(x.keyed) : null,
    visibilityChanges: x.visibilityChanges != null ? Number(x.visibilityChanges) : x.visibility != null ? (Array.isArray(x.visibility) ? x.visibility.length : Number(x.visibility)) : x.vis != null ? Number(x.vis) : null,
  }).filter(x => x.name);
  const bones = typeof j.bones === 'number' ? j.bones : typeof j.boneCount === 'number' ? j.boneCount : boneList.length;
  const frames = typeof j.frames === 'number' ? j.frames : typeof j.frameCount === 'number' ? j.frameCount : (Array.isArray(j.frames) ? j.frames.length : null);
  return { ok: j.ok !== false, file: j.file || '', frames, bones, version: verNum(j.version), boneList, problems: Array.isArray(j.problems) ? j.problems.map(String) : [], error: j.error || null };
}

async function info(ctx, b) {
  const mod = modNeed(ctx, b), anm = stagedAnm(mod, b.anm);
  const r = await ctx.runTool('soedit', ENTRY, ['ops', 'anim', 'info', anm, '--json'], { timeoutMs: 60000 });
  if (r.cancelled) return { cancelled: true };   // JOBS: stopped from the footer
  const j = jsonOut(r);
  if (!j) bad(toolFailed(r));
  const res = shapeInfo(j); res.hasBak = !!bakOf(anm); res.code = r.code; res.raw = outOf(r);
  return res;
}
async function run(ctx, b) {
  const mod = modNeed(ctx, b), anm = stagedAnm(mod, b.anm);
  const op = String(b.operation || '');
  if (!Object.prototype.hasOwnProperty.call(OPS, op)) bad('That change is not one this page knows.');
  const args = argvOf(op, anm, mod, b);
  if (!b.dry && ctx.job) ctx.job.writes = true;   // JOBS: the animation file in the mod is rewritten (the tool keeps a .bak)
  const r = await ctx.runTool('soedit', ENTRY, args, { timeoutMs: 120000 });
  if (!b.dry) (ctx.modtree || require('../../../../lib/modtree')).touch(mod);   // CACHE: the mod changed (or may have, when stopped): the next reader walks it again
  if (r.cancelled) return { cancelled: true };
  const j = jsonOut(r);
  if (!j) bad(toolFailed(r));
  if (r.code === 2) bad('The animation helper did not understand this request: ' + (j.error || toolFailed(r)));
  const changed = Array.isArray(j.changed) ? j.changed.map(c => typeof c === 'string' ? c : JSON.stringify(c)) : [];
  const ok = r.code === 0 && j.ok !== false;
  return { ok, message: ok ? '' : 'The animation helper refused this change: ' + String(j.error || 'no reason given').replace(/\s+/g, ' ').trim() + '.',
    operation: op, dry: !!b.dry, file: j.file || anm, out: j.out || null,
    frames: j.frames != null ? j.frames : null, bones: Array.isArray(j.bones) ? j.bones.length : (j.bones != null ? j.bones : null),
    version: verNum(j.version), changed, error: j.error || (r.code === 0 ? null : toolFailed(r)), hasBak: !!bakOf(anm), code: r.code, raw: outOf(r) };
}
async function undo(ctx, b) {
  const mod = modNeed(ctx, b), anm = stagedAnm(mod, b.anm), bak = bakOf(anm);
  if (!bak || !inside(bak, mod)) bad('There is no earlier copy of this animation to go back to.');
  if (ctx.job) ctx.job.writes = true;
  fs.copyFileSync(bak, anm);
  fs.rmSync(bak, { force: true });
  (ctx.modtree || require('../../../../lib/modtree')).touch(mod);   // CACHE: the mod changed
  return { ok: true, file: anm, restoredFrom: bak, hasBak: false };
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  routes: {
    'POST /api/x/models/anim/info': wrap(info),
    'POST /api/x/models/anim/run': wrap(run),
    'POST /api/x/models/anim/undo': wrap(undo),
  },
  _t: { OPS, FIELDS, argvOf, shapeInfo, bakOf },
};
