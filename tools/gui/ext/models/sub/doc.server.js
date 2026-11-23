// Models page part `doc` (sub/README.md): the routes of the editable model document (tools/lib/model/edit/core.js, contract README.md there).
//   POST /api/x/models/doc/open   { mod, target | mdl }        -> { doc, rev, mdl, target, mod, files: [{ rel, kind, from, dirty, size, removed? }],
//                                                                   canUndo, canRedo, dirty, unresolved, ops: [names], problems: [{ file, error }] }
//   POST /api/x/models/doc/op     { doc, op, args }            -> { rev, changed, info, canUndo, canRedo, dirty, files }
//   POST /api/x/models/doc/undo   { doc }   /redo               -> { rev, changed, op, canUndo, canRedo, dirty, files }
//   POST /api/x/models/doc/state  { doc, what, query }         -> the JSON of the registered state function
//   POST /api/x/models/doc/scene  { doc, anm, frame, meshes, lod } -> scene/1 JSON of the current bytes (+ rev, anm, frame, frames, lod,
//                                                                   lodCount, obstacles, areas)
//   POST /api/x/models/doc/save   { doc, dry, force, backup, lint } -> { writes: [{ rel, was, size }], removes, refused, notes, check (+ lint,
//                                                                   ran when lint), backups, written, mdl, + state }
//   POST /api/x/models/doc/close  { doc }                      -> { closed }
//   POST /api/x/models/doc/dir    { doc, dir?, ext? }          -> { dir, files: [rel] } (default: the .mdl's folder, '.anm')
//   /op, /undo, /redo also give mdl (the main file: it follows save as and rename)
// Refusals are thrown with status 400 and a plain sentence (as ../server.js). The mod folder is checked as there (the Units page's modOf:
// never the game install, Gates of Hell or the Workshop); the document keeps it, later routes name the document only.
// Game (../game.js): under MoW:AS2 core.open and target.resolve read with exe 'mowas_2' (no as64/core); the document keeps it, so its
// later reads (doc.dir, scene) use the same file set. Under AS64 the calls are as before. Under Gates of Hell the
// GoH install is read (exe goh) and a mod in <GoH>/mods that ARSENAL did not make needs Advanced (lib/writeguard).
// Author: Imperator_Aug (ARSENAL, ia-09fb3d7a)
'use strict';
const fs = require('fs'), path = require('path');
const core = require('../../../../lib/model/edit/core');
const G = require('../game');

const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modNeed(ctx, b) { return G.modGuard(ctx, b, require('../../units/server').lib.modOf(b, gameOpt(ctx, b), true)); }
// every form of tools/soedit/target.js; a .mdl key or path goes to core.open as written, the rest is resolved here first
const TG = require('../../../../soedit/target');
function targetOf(b) {
  const t = String(b.mdl || b.target || '').trim();
  if (!t) bad('Pick a model first: a unit name or the path to a .mdl file.');
  const p = TG.parse(t);
  if (p.error) bad(p.error);
  return /\.mdl$/i.test(t) && (p.form === 'key' || p.form === 'file') ? t : TG.canonical(p);
}
// the .mdl key a target stands for, read with the mod folder as a layer (its loose files and paks, active or not) over the game:
// core.open finds names over the game and the listed mods only, and takes no breed, .def, .set or pak entry
function mdlKeyOf(t, mod, game, exe) {
  const r = TG.resolve(Object.assign({ target: t, game, modDirs: [mod] }, exe ? { exe } : {}));
  if (r.src) r.src.close();
  if (r.error) bad(r.error);
  return r.mdlKey;
}
function docOf(b) {
  const d = core.get(b && b.doc);
  if (!d) bad('That model is no longer open here. Pick it again.');
  return d;
}
const st = d => { const s = d.summary(); return { canUndo: s.canUndo, canRedo: s.canRedo, dirty: s.dirty, files: s.files }; };
// a core error is already a plain sentence; anything else is cut to its first line
function run(fn) {
  try { return fn(); } catch (e) {
    if (e && e.status) throw e;
    bad(String((e && e.message) || e).split('\n')[0]);
  }
}

async function open(ctx, b) {
  const mod = modNeed(ctx, b), game = gameOpt(ctx, b), t = targetOf(b), form = TG.parse(t).form;
  const exe = G.exeOpt(ctx, b), X = exe ? { exe } : {};   // nothing added under AS64
  let d;
  if (form === 'name') {
    // a name core.open does not find (an entity only in the mod's own paks, or a mod that is not active): resolved here
    try { d = core.open(Object.assign({ mod, game, [b.mdl ? 'mdl' : 'target']: t }, X)); } catch (e) {
      if (!game || !/No entity named|has no \.mdl/i.test(String(e && e.message))) run(() => { throw e; });
      const key = mdlKeyOf(t, mod, game, exe);
      d = run(() => core.open(Object.assign({ mod, game, mdl: key, target: t }, X)));
    }
  } else if (/\.mdl$/i.test(t) && (form === 'key' || form === 'file')) d = run(() => core.open(Object.assign({ mod, game, [b.mdl ? 'mdl' : 'target']: t }, X)));
  else d = run(() => core.open(Object.assign({ mod, game, mdl: mdlKeyOf(t, mod, game, exe), target: t }, X)));
  return Object.assign(d.summary(), { ops: core.ops(), problems: core.problems() });
}
async function op(ctx, b) {
  const d = docOf(b), name = String(b.op || '').trim();
  if (!name) bad('Say which edit to make.');
  const r = run(() => d.apply(name, b.args || {}));
  return Object.assign({ rev: r.rev, changed: r.changed, info: r.info == null ? null : r.info, mdl: d.mdl }, st(d));
}
async function undo(ctx, b) { const d = docOf(b); const r = d.undo(); return Object.assign({ rev: r.rev, changed: r.changed, op: r.op || null, mdl: d.mdl }, st(d)); }
async function redo(ctx, b) { const d = docOf(b); const r = d.redo(); return Object.assign({ rev: r.rev, changed: r.changed, op: r.op || null, mdl: d.mdl }, st(d)); }
async function state(ctx, b) { const d = docOf(b); return run(() => d.state(String(b.what || ''), b.query || {})); }
async function scene(ctx, b) { const d = docOf(b); return run(() => d.scene({ anm: b.anm || null, frame: b.frame, meshes: b.meshes, lod: b.lod })); }
async function save(ctx, b) {
  const d = docOf(b);
  // lint (binhdr, expcheck) only when asked, on the check before writing; ctx.runLint as the Files part's lint route
  const lint = b.lint ? (typeof ctx.runLint === 'function' ? ctx.runLint : true) : false;
  const r = run(() => d.save({ dry: !!b.dry, force: !!b.force, backup: !!b.backup, lint }));
  return Object.assign({ writes: r.writes.map(w => ({ rel: w.rel, was: w.was, size: w.size })), removes: r.removes, refused: r.refused, notes: r.notes,
    check: r.check, backups: r.backups || [], written: r.written, rev: d.rev, mdl: d.mdl }, st(d));
}
// the .anm files (or another extension) of the model's folder, from the document, the mod and the game (Page Up / Page Down)
async function dir(ctx, b) { const d = docOf(b); return run(() => d.state('doc.dir', { dir: b.dir || null, ext: b.ext || '.anm' })); }
async function close(ctx, b) { return { closed: core.close(b && b.doc) }; }

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  routes: {
    'POST /api/x/models/doc/open': wrap(open),
    'POST /api/x/models/doc/op': wrap(op),
    'POST /api/x/models/doc/undo': wrap(undo),
    'POST /api/x/models/doc/redo': wrap(redo),
    'POST /api/x/models/doc/state': wrap(state),
    'POST /api/x/models/doc/scene': wrap(scene),
    'POST /api/x/models/doc/save': wrap(save),
    'POST /api/x/models/doc/close': wrap(close),
    'POST /api/x/models/doc/dir': wrap(dir),
  },
  _t: { targetOf },
};
