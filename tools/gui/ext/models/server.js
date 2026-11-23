// Server side of the Models page step 1c). Every route calls tools/soedit/soedit.js through ctx.runTool
// exactly the command line of tools/soedit/README.md: locate --json; stage <target> --out <mod> [--game G] [--dry] --json f;
// open <staged mdl> [--anm f] --lang L; check <staged mdl> [--game G] --json f. The mod folder goes through the Units page's
// guard (never the game install, GoH or Workshop); the model and animation paths for open and check must sit inside it.
// The JSON shapes of stage and check are read loosely (several field names accepted) because soedit.js is written in
// parallel [I]: the file set is grouped here by extension and "already in the mod" is a plain existence test.
// Game (./game.js): under MoW:AS2 stage and check get --exe mowas_2 (the shared install read without as64/core); under AS64 the argument
// lists stay exactly as above. Under Gates of Hell stage and check get --exe goh and the GoH install as --game; a mod in <GoH>/mods that ARSENAL did not make needs Advanced (lib/writeguard), ./game.js modGuard.
// Author: Imperator_Aug (ARSENAL, ia-320fc06f)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENTRY = 'soedit/soedit.js';
const LANGS = ['en', 'ru', 'uk', 'zh'];
const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const U = () => require('../units/server').lib;
const G = require('./game');

// file set groups, in the order the page shows them
const GROUPS = ['model', 'meshes', 'volumes', 'animations', 'materials', 'textures', 'other'];
function groupOf(rel) {
  const e = path.extname(String(rel)).toLowerCase();
  if (e === '.mdl') return 'model';
  if (e === '.ply') return 'meshes';
  if (e === '.vol') return 'volumes';
  if (e === '.anm') return 'animations';
  if (e === '.mtl') return 'materials';
  if (['.dds', '.tga', '.png', '.bmp', '.jpg'].includes(e)) return 'textures';
  return 'other';
}
function inside(a, b) { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
// read = true: the route only reads the mod (the dry file set, the check), so the GoH write guard is not asked
function modNeed(ctx, b, read) { const m = U().modOf(b, gameOpt(ctx, b), true); return read ? m : G.modGuard(ctx, b, m); }
function tmpJson(ctx, what) {
  const d = path.join(ctx.tmpRoot || require('os').tmpdir(), 'models'); fs.mkdirSync(d, { recursive: true });
  return path.join(d, what + '-' + crypto.randomBytes(6).toString('hex') + '.json');
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } finally { try { fs.rmSync(f, { force: true }); } catch (e) { /* temp */ } } }
const outOf = r => String((r.stdout || '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '')).trim();
function toolFailed(r) {
  const t = outOf(r);
  if (/Cannot find module[^\n]*soedit/i.test(t)) return 'The SOEdit helper (tools/soedit/soedit.js) is not part of this copy of ARSENAL yet.';
  if (r.timedOut) return 'SOEdit\'s helper took too long and was stopped.';
  return t.split('\n').slice(-6).join('\n') || ('exit code ' + r.code);
}
// what to stage: every form of tools/soedit/target.js (one helper for this page, its sub-parts and soedit stage): an entity name,
// a game key or a disk path of a .mdl / .def / breed .set (the Editor's viewers pass a game key), breed:<key>, pak:<pak>!<entry>
const TG = () => require('../../../soedit/target');
function target(b) {
  const p = TG().parse(b.target);
  if (p.error) bad(p.error);
  return TG().canonical(p);
}
// a staged file named relative to the mod (or absolute): must be inside the mod and exist
function staged(mod, rel, ext, what) {
  if (!rel) bad('Copy the model into your mod first ("Copy into my mod").');
  const p = path.resolve(mod, String(rel));
  if (!inside(p, mod)) bad('The ' + what + ' must be inside your mod folder.');
  if (path.extname(p).toLowerCase() !== ext) bad('The ' + what + ' must be a ' + ext + ' file.');
  if (!fs.existsSync(p)) bad('The ' + what + ' is not in your mod yet. Press "Copy into my mod" first.');
  return p;
}
function lang(b) { const l = String(b.lang || 'en'); return LANGS.includes(l) ? l : 'en'; }

// ---------- locate ----------
// JOBS: a request stopped from the footer: every route returns right after a cancelled ctx.runTool (the dispatcher answers 499
// whatever comes back) and reads no output of the killed tool. writes(ctx): the footer asks twice before stopping the request.
const STOPPED = { cancelled: true };
const writes = ctx => { if (ctx && ctx.job) ctx.job.writes = true; };
async function locate(url, body, ctx) {
  const r = await ctx.runTool('soedit', ENTRY, ['locate', '--json'], { timeoutMs: 30000 });
  if (r.cancelled) return { found: false, path: '', message: '', cancelled: true };
  if (r.code === 0) {
    let j = null; try { j = JSON.parse(String(r.stdout || '').trim()); } catch (e) { j = null; }
    if (j && typeof j === 'object') return { found: j.found !== false && !!(j.path || j.exe), path: j.path || j.exe || '', source: j.source || '', hash: j.hash || j.sha256 || '', version: j.version || '', message: j.message || '' };
    return { found: true, path: String(r.stdout || '').trim().split('\n')[0], source: '', hash: '', version: '', message: '' };
  }
  let j = null; try { j = JSON.parse(String(r.stdout || '').trim()); } catch (e) { j = null; }
  return { found: false, path: '', message: (j && (j.message || j.error)) || toolFailed(r), code: r.code, get: getInfo() };
}
// what Open SOEdit would download when SOEdit is not here: the latest release of the pinned GitHub repository (else the pinned package)
// and the folder it is installed into (shown before the user confirms)
function getInfo() {
  try {
    const pin = require('../../../soedit/install').readPin(), dest = require('../../../soedit/locate').installDir();
    if (pin && pin.repo) return { url: 'https://github.com/' + pin.repo + '/releases/latest', name: 'the latest release of ' + pin.repo, size: 0, dest: dest.split(path.sep).join('/') };
    if (!pin || !pin.url) return null;
    return { url: pin.url, name: pin.url.split('/').pop(), size: pin.size || 0, dest: dest.split(path.sep).join('/') };
  } catch (e) { return null; }
}

// Open SOEdit, the program alone: on this computer -> started; not on it -> downloaded and installed (soedit install: the
// package named in tools/soedit/soedit-pin.json, checksum checked), then started. {lang, dry}
async function start(ctx, b) {
  let got = await locate(null, null, ctx), installed = false, note = '';
  if (got.cancelled) return STOPPED;
  if (!got.found) {
    writes(ctx);   // the download and the install folder (never a mod)
    const r = await ctx.runTool('soedit', ENTRY, ['install'], { timeoutMs: 900000 });
    if (r.cancelled) return STOPPED;
    if (r.code !== 0) return { ok: false, installed: false, noDownload: r.code === 3, message: outOf(r) || toolFailed(r) };
    installed = true; note = outOf(r);
    got = await locate(null, null, ctx);
    if (got.cancelled) return STOPPED;
    if (!got.found) return { ok: false, installed: true, message: got.message || 'SOEdit was installed but is still not found.' };
  }
  const args = ['start', '--lang', lang(b)]; if (b.dry) args.push('--dry');
  const r = await ctx.runTool('soedit', ENTRY, args, { timeoutMs: 60000 });
  if (r.cancelled) return STOPPED;
  if (r.code !== 0) bad(toolFailed(r));
  return { ok: true, installed, path: got.path, source: got.source, message: [note, outOf(r)].filter(Boolean).join('\n') };
}

// ---------- stage (dry = the file set only) ----------
function fileList(j) {
  const a = (j && (j.files || j.set || j.fileset)) || [];
  return Array.isArray(a) ? a : [];
}
function relOf(f, mod) {
  if (typeof f === 'string') return f;
  let r = f.rel || f.path || f.key || f.dst || f.target || f.file || '';
  if (r && path.isAbsolute(r) && mod && inside(path.resolve(r), mod)) r = path.relative(mod, path.resolve(r));
  return String(r).replace(/\\/g, '/');
}
function shapeSet(j, mod) {
  const files = fileList(j).map(f => {
    const rel = relOf(f, mod);
    const inMod = !!(rel && mod && fs.existsSync(path.join(mod, rel)));
    const o = typeof f === 'object' ? f : {};
    // where: mod | game | file (a file given by path), pak: the pak's file name when the file comes out of one, shared: a file
    // of the shared human model a skin or breed needs (not the picked model's own)
    const pakName = o.pakName != null ? o.pakName : (o.pak ? String(o.pak).split(/[\\/]/).pop() : '');
    return { rel, group: groupOf(rel), inMod, from: o.from || o.src || o.source || '', size: o.size == null ? null : o.size, missing: !!(o.missing || o.notFound),
      where: o.where || (o.source === 'mod' ? 'mod' : o.source === 'file' ? 'file' : o.source ? 'game' : ''), pak: pakName, shared: !!o.shared };
  }).filter(f => f.rel);
  const groups = {}; for (const g of GROUPS) groups[g] = files.filter(f => f.group === g);
  // the picked model first (a breed's file set also holds the shared human.mdl, which may sort before it)
  const main = j && j.model && groups.model.find(f => f.rel === j.model);
  if (main) groups.model = [main, ...groups.model.filter(f => f !== main)];
  const mdl = (groups.model[0] || {}).rel || '';
  return { files, groups, order: GROUPS, mdl, staged: !!(mdl && groups.model[0].inMod), anm: groups.animations.filter(f => f.inMod).map(f => f.rel), record: (j && (j.record || j.recordPath)) || '',
    entity: (j && j.entity) || '', def: (j && j.def) || '', breed: (j && j.breed) || '', human: !!(j && j.human) };
}
async function stage(ctx, b) {
  const t = target(b), mod = modNeed(ctx, b, !!b.dry), game = gameOpt(ctx, b), jf = tmpJson(ctx, 'stage');
  const args = ['stage', t, '--out', mod];
  if (game) args.push('--game', game);
  args.push(...G.exeArgs(ctx, b));
  if (b.dry) args.push('--dry');
  args.push('--json', jf);
  if (!b.dry) writes(ctx);   // the model's files are copied into the mod
  const r = await ctx.runTool('soedit', ENTRY, args, { timeoutMs: 300000 });
  if (!b.dry) (ctx.modtree || require('../../../lib/modtree')).touch(mod);   // CACHE: files were copied into the mod, the next reader walks it again
  // stopped: the files copied so far stay in the mod (whole files; the tool keeps a file that is already there, so pressing
  // "Copy into my mod" again finishes the set). Nothing is removed: the route cannot tell its own copies from earlier ones
  if (r.cancelled) { readJson(jf); return STOPPED; }
  const j = readJson(jf);
  if (r.code !== 0 && !j) bad(toolFailed(r));
  const res = shapeSet(j, mod);
  res.counts = { copied: ((j && j.counts) || {}).copied || 0, kept: ((j && j.counts) || {}).kept || 0, textures: ((j && j.counts) || {}).textures || 0 }; res.dry = !!b.dry; res.mod = mod; res.target = t; res.ok = r.code === 0; res.message = r.code === 0 ? '' : toolFailed(r); res.raw = outOf(r);
  return res;
}

// ---------- open / check ----------
async function open(ctx, b) {
  const mod = modNeed(ctx, b), mdl = staged(mod, b.mdl, '.mdl', 'model');
  const args = ['open', mdl];
  if (b.anm) args.push('--anm', staged(mod, b.anm, '.anm', 'animation'));
  args.push('--lang', lang(b));
  if (b.dry) args.push('--dry');
  const r = await ctx.runTool('soedit', ENTRY, args, { timeoutMs: 60000 });
  if (r.cancelled) return STOPPED;
  if (r.code !== 0) bad(toolFailed(r));
  return { ok: true, message: outOf(r) };
}
// check.js writes a report (tools/lib/report.js toJSON): findings + info, one FILE_* code per file. The file states are read from
// those codes; FILE_CHANGED and FILE_NEW are counted, not listed as losses. An older { files: [...] } shape is still accepted.
const FILE_STATE = { FILE_UNCHANGED: 'unchanged', FILE_CHANGED: 'changed', FILE_NEW: 'new', FILE_MISSING: 'missing' };
function shapeCheck(j) {
  let files = ((j && j.files) || []).map(f => typeof f === 'string' ? { rel: f, state: 'changed' } : { rel: String(f.rel || f.file || f.path || ''), state: String(f.state || f.status || 'changed') });
  const all = ((j && j.findings) || []).concat((j && j.info) || []);
  if (!files.length) files = all.filter(f => FILE_STATE[f.code]).map(f => ({ rel: String(f.file || ''), state: FILE_STATE[f.code] }));
  const fs0 = ((j && j.findings) || []).filter(f => f.code !== 'FILE_CHANGED' && f.code !== 'FILE_NEW');
  const findings = fs0.map(f => ({ file: String(f.file || ''), line: f.line || null, code: String(f.code || ''), msg: String(f.msg || f.message || ''), severity: f.severity || '' }));
  return { files, findings, total: findings.length };
}
async function check(ctx, b) {
  const mod = modNeed(ctx, b, true), mdl = staged(mod, b.mdl, '.mdl', 'model'), game = gameOpt(ctx, b), jf = tmpJson(ctx, 'check');
  const args = ['check', mdl];
  if (game) args.push('--game', game);
  args.push(...G.exeArgs(ctx, b));
  args.push('--json', jf);
  const r = await ctx.runTool('soedit', ENTRY, args, { timeoutMs: 300000 });
  if (r.cancelled) { readJson(jf); return STOPPED; }
  const j = readJson(jf);
  if (!j) bad(toolFailed(r));
  const res = shapeCheck(j); res.code = r.code; res.raw = outOf(r);
  return res;
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  routes: {
    'GET /api/x/models/locate': locate,
    'POST /api/x/models/start': wrap(start),
    'POST /api/x/models/stage': wrap(stage),
    'POST /api/x/models/open': wrap(open),
    'POST /api/x/models/check': wrap(check),
  },
  _t: { groupOf, shapeSet, shapeCheck, target, GROUPS },
};
