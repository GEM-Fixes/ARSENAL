// Models page part `file` (sub/README.md): what the Files sub-tab needs that is not an op or a state read of the document.
//   POST /api/x/models/file/new      { mod, path, template, def, author } -> { ok, mdl (rel), target (disk path of the .mdl), files: [rel] }
//        a new model (tools/lib/model/edit/file.js blank) written into the mod; refused when any of its files is already there.
//   POST /api/x/models/file/write    { mod, files: [{ rel, data }], overwrite } -> { ok, written: [rel], target }
//        save as / save a copy: the file set from the state file.copyPlan written into the mod (all or nothing).
//   POST /api/x/models/file/export   { mod, dest, zip, files: [{ rel, data }], overwrite } -> { ok, path, written: [rel] }
//        the whole file set as a folder <mod>/<dest>/<rel..> or one zip <mod>/<dest>.zip (entries = rel), inside the mod.
//   POST /api/x/models/file/source   { mod, from } -> { ok, name, kind, data, size, origin }   a file to import: a disk path
//        (another mod, anywhere: reading only) or a game path (entity/.., /entity/.., resource/..) read from the mod folder (its loose
//        files and its own paks) over the game's files; origin 'mod' | 'game' | 'disk', pak: the pak's file name when read from one.
//   POST /api/x/models/file/autosave { mod, files: [{ rel, data }] } -> { ok, dir, written }   a draft copy in
//        <mod>/.arsenal/models-autosave/<rel> (the game mounts <mod>/resource only, so the draft is never loaded).
//   POST /api/x/models/file/lint     { mod, files: [{ rel, data }] } -> { ok, findings: [{ file, line, code, msg }], ran }
//        the unsaved files written to a temp folder, then tools/binhdr and tools/expcheck through tools/soedit/check.js linters.
//   POST /api/x/models/file/backup   { mod, rels: [rel] } -> { ok, dir, written, skipped }   before a save: <mod>/.arsenal-bak/<rel>.bak
//   POST /api/x/models/file/whoami   {} -> { user }   the Windows user name: the default author nickname (SOEdit's default, PREF-04).
// Every answer is { ok: false, error: plain sentence } when it cannot run. Writes go only inside the picked mod folder, each path
// through tools/lib/writeguard.js refuseWrite. The mod check is the Units page's modOf, as ../server.js and viewer.server.js.
// Game (../game.js): under MoW:AS2 a game path is read with exe 'mowas_2' (no as64/core) and the kept source carries the game; under
// AS64 nothing changes. Under Gates of Hell the GoH install is read (exe goh) and for writes a mod in <GoH>/mods that ARSENAL did not make needs Advanced (lib/writeguard).
// Author: Imperator_Aug (ARSENAL, ia-73666dc2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const F = require('../../../../lib/model/edit/file'), wg = require('../../../../lib/writeguard'), { zip } = require('../../../../lib/zipwrite');
const G = require('../game');

const MAX = 256 << 20;
const IMPORT = new Set(['.ply', '.vol', '.anm', '.mtl']);
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modNeed(ctx, b) { return G.modGuard(ctx, b, require('../../units/server').lib.modOf(b, gameOpt(ctx, b), true)); }
const no = msg => { throw Object.assign(new Error(msg), { plain: true }); };
function inside(a, b) { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }

// a path inside the mod: forward slashes, no drive, no '..', names Windows and the game accept
function relIn(mod, rel, what) {
  const r = String(rel == null ? '' : rel).trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!r) no('A ' + what + ' has no name.');
  if (/^[a-z]:/i.test(r)) no('The ' + what + ' ' + r + ' is a full disk path; it must be a path inside the mod.');
  const segs = r.split('/').filter(Boolean);
  for (const s of segs) { const p = wg.nameProblem(s); if (p) no('The ' + what + ' ' + r + ' cannot be written: ' + p + '.'); }
  const abs = path.join(mod, ...segs);
  if (!inside(abs, mod)) no('The ' + what + ' ' + r + ' is outside your mod folder.');
  return { rel: segs.join('/'), abs };
}
function decode(f) {
  if (!f || typeof f.data !== 'string') no('A file came without its bytes.');
  const b = Buffer.from(f.data, 'base64');
  if (b.length > MAX) no('The file ' + f.rel + ' is larger than 256 MB.');
  return b;
}
// check every target first, then write them all (nothing is written when one is refused)
function writeAll(ctx, b, mod, items, opt) {
  const game = gameOpt(ctx, b), seen = new Set();
  for (const it of items) {
    const k = it.abs.toLowerCase();
    if (seen.has(k)) no('Two files would be written to ' + it.rel + '.');
    seen.add(k);
    const why = wg.refuseWrite(it.abs, { game, purpose: opt.purpose });
    if (why) no(why);
    if (!opt.overwrite && fs.existsSync(it.abs)) no('Your mod already has ' + it.rel + '. Pick another name, or allow replacing it.');
  }
  for (const it of items) { fs.mkdirSync(path.dirname(it.abs), { recursive: true }); fs.writeFileSync(it.abs, it.buf); }
  // CACHE: the mod changed, the next reader walks it again (lib/modtree). Drafts under .arsenal/ are not part of the walk
  if (items.some(it => !/^\.arsenal\//i.test(it.rel))) (ctx.modtree || require('../../../../lib/modtree')).touch(mod);
  return items.map(it => it.rel);
}
function filesOf(b) {
  const a = Array.isArray(b.files) ? b.files : null;
  if (!a || !a.length) no('There are no files to write.');
  return a;
}

async function newModel(ctx, b) {
  const mod = modNeed(ctx, b);
  const nb = F.blank({ path: b.path, template: b.template || 'empty', def: !!b.def, author: b.author || '', date: b.date || '' });
  const items = Object.entries(nb.files).map(([rel, buf]) => Object.assign(relIn(mod, rel, 'file'), { buf }));
  const written = writeAll(ctx, b, mod, items, { purpose: 'make a new model', overwrite: false });
  return { ok: true, mdl: nb.mdl, def: nb.def, files: written, target: path.join(mod, ...nb.mdl.split('/')) };
}
async function write(ctx, b) {
  const mod = modNeed(ctx, b);
  const items = filesOf(b).map(f => {
    const why = F.relProblem(String(f.rel || '')); if (why) no(why);
    return Object.assign(relIn(mod, f.rel, 'file'), { buf: decode(f) });
  });
  const written = writeAll(ctx, b, mod, items, { purpose: 'save the model under a new name', overwrite: !!b.overwrite });
  const m = items.find(it => /\.mdl$/i.test(it.rel));
  return { ok: true, written, target: m ? m.abs : null };
}
async function exportSet(ctx, b) {
  const mod = modNeed(ctx, b), files = filesOf(b);
  const d = relIn(mod, String(b.dest || '').replace(/\.zip$/i, '').replace(/[\\/]+$/, '') || 'export', 'export folder');
  if (/^resource(\/|$)/i.test(d.rel)) no('Export somewhere outside resource/ (for example export/' + path.basename(d.abs) + '): files under resource/ are loaded by the game.');
  const bufs = files.map(f => ({ rel: relIn(mod, f.rel, 'file').rel, buf: decode(f) }));
  if (b.zip) {
    const it = { rel: d.rel + '.zip', abs: d.abs + '.zip', buf: zip(bufs.map(x => [x.rel, x.buf, true]), { date: new Date() }) };
    writeAll(ctx, b, mod, [it], { purpose: 'export the model as a zip', overwrite: !!b.overwrite });
    return { ok: true, path: it.abs, written: bufs.map(x => x.rel) };
  }
  if (!b.overwrite && fs.existsSync(d.abs) && fs.readdirSync(d.abs).length) no('The folder ' + d.rel + ' in your mod is not empty. Pick another folder, or allow replacing files.');
  const items = bufs.map(x => Object.assign(relIn(mod, d.rel + '/' + x.rel, 'file'), { buf: x.buf }));
  writeAll(ctx, b, mod, items, { purpose: 'export the model', overwrite: !!b.overwrite });
  return { ok: true, path: d.abs, written: bufs.map(x => x.rel) };
}

let SRC = null;   // { id, src } the game's files with the mod folder as a layer (its loose files and paks), kept between imports
// CACHE: the view comes from soedit/stage openSource = lib/gameview withModsSync: the shared game view as the base (the game is
// not mounted again) and the mod laid on from this server's walk of it (lib/modtree fresh), no stat per mod file. fresh (a miss:
// the mod may have gained the file outside the GUI since that walk): the walk is marked old first (modtree.touch), so the
// folder is read from the disk now, as before.
function gameSource(game, mod, fresh, exe, ctx) {
  const id = game + '|' + (mod || '') + (exe ? '|' + exe : '');
  if (SRC && SRC.id === id && !fresh) return SRC.src;
  if (SRC) { try { SRC.src.close(); } catch (e) { /* closed */ } }
  if (fresh && mod) { try { ((ctx && ctx.modtree) || require('../../../../lib/modtree')).touch(mod); } catch (e) { /* walked anyway */ } }
  SRC = { id, src: require('../../../../soedit/stage').openSource(Object.assign({ game, mods: [], modDirs: mod ? [mod] : [], noInfer: true }, exe ? { exe } : {})) };
  return SRC.src;
}
async function source(ctx, b) {
  const mod = modNeed(ctx, b);
  const from = String(b.from || '').trim();
  if (!from) no('Type the file to add: a path on disk, or a game path such as entity/-vehicle/x/x.ply.');
  const ext = path.extname(from).toLowerCase();
  if (!IMPORT.has(ext)) no('Only .ply, .vol, .anm and .mtl files can be added to a model.');
  if (path.isAbsolute(from) && /^([a-z]:|\\\\)/i.test(from)) {
    let st; try { st = fs.statSync(from); } catch (e) { no('The file ' + from + ' was not found.'); }
    if (!st.isFile()) no(from + ' is a folder, not a file.');
    if (st.size > MAX) no('The file ' + from + ' is larger than 256 MB.');
    const buf = fs.readFileSync(from);
    return { ok: true, name: path.basename(from).toLowerCase(), kind: ext.slice(1), data: buf.toString('base64'), size: buf.length, origin: 'disk' };
  }
  const game = gameOpt(ctx, b);
  if (!game) no('No game folder is set, so game files cannot be read. Pick the game folder at the top of the page.');
  const key = F.normRel(from);
  // the mod folder over the game; a miss reads again once (a file the mod gained since the last import)
  const exe = G.exeOpt(ctx, b);
  const g = gameSource(game, mod, false, exe, ctx).get(key) || gameSource(game, mod, true, exe, ctx).get(key);
  if (!g) no('The mod folder and the game have no file ' + key + '.');
  const o = g.origin || {};
  return { ok: true, name: path.posix.basename(key), kind: ext.slice(1), data: g.buf.toString('base64'), size: g.buf.length, origin: o.where === 'mod' ? 'mod' : 'game', key, pak: o.pakName || null };
}
async function autosave(ctx, b) {
  const mod = modNeed(ctx, b), base = '.arsenal/models-autosave';
  const items = filesOf(b).map(f => Object.assign(relIn(mod, base + '/' + String(f.rel || '').replace(/^\/+/, ''), 'draft'), { buf: decode(f) }));
  const written = writeAll(ctx, b, mod, items, { purpose: 'keep a draft copy of the model', overwrite: true });
  return { ok: true, dir: path.join(mod, '.arsenal', 'models-autosave'), written };
}
async function lint(ctx, b) {
  const mod = modNeed(ctx, b), files = filesOf(b), game = gameOpt(ctx, b);
  const root = path.join(ctx.tmpRoot || os.tmpdir(), 'models-lint-' + crypto.randomBytes(6).toString('hex'));
  const rels = [];
  try {
    for (const f of files) { const it = relIn(root, f.rel, 'file'); fs.mkdirSync(path.dirname(it.abs), { recursive: true }); fs.writeFileSync(it.abs, decode(f)); rels.push(it.rel); }
    const { createReport } = require('../../../../lib/report'), rep = createReport();
    require('../../../../soedit/check').linters(root, rels, game, rep, ctx.runLint);
    const j = rep.toJSON({ tool: 'models' });
    const findings = (j.findings || []).map(f => ({ file: String(f.file || ''), line: f.line || 0, code: String(f.code || ''), msg: String(f.msg || '') }));
    const ran = (j.info || []).filter(x => /^LINTER_/.test(x.code)).map(x => ({ code: x.code, msg: String(x.msg || '') }));
    return { ok: true, findings, ran, mod };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
// backup on save (PREF backup): the mod's own copy of each file about to change goes to <mod>/.arsenal-bak/<rel>.bak (replaced each save).
// A file not in the mod yet (it comes from the game) has nothing to back up and is skipped.
async function backup(ctx, b) {
  const mod = modNeed(ctx, b), rels = Array.isArray(b.rels) ? b.rels : [];
  const items = [], skipped = [];
  for (const r of rels) {
    const src = relIn(mod, r, 'file');
    if (!fs.existsSync(src.abs) || !fs.statSync(src.abs).isFile()) { skipped.push(src.rel); continue; }
    items.push(Object.assign(relIn(mod, '.arsenal-bak/' + src.rel + '.bak', 'backup'), { buf: fs.readFileSync(src.abs) }));
  }
  const written = items.length ? writeAll(ctx, b, mod, items, { purpose: 'keep a backup before saving', overwrite: true }) : [];
  return { ok: true, dir: path.join(mod, '.arsenal-bak'), written, skipped };
}
async function whoami() { let u = ''; try { u = os.userInfo().username || ''; } catch (e) { u = process.env.USERNAME || ''; } return { ok: true, user: u }; }

const wrap = fn => async (url, body, ctx) => {
  try { return await fn(ctx || {}, body || {}); }
  catch (e) { return { ok: false, error: String((e && e.message) || e).split('\n')[0] }; }
};
module.exports = {
  routes: {
    'POST /api/x/models/file/new': wrap(newModel),
    'POST /api/x/models/file/write': wrap(write),
    'POST /api/x/models/file/export': wrap(exportSet),
    'POST /api/x/models/file/source': wrap(source),
    'POST /api/x/models/file/autosave': wrap(autosave),
    'POST /api/x/models/file/lint': wrap(lint),
    'POST /api/x/models/file/backup': wrap(backup),
    'POST /api/x/models/file/whoami': wrap(whoami),
  },
  _t: { relIn, drop() { if (SRC) { try { SRC.src.close(); } catch (e) { /* closed */ } } SRC = null; } },
};
