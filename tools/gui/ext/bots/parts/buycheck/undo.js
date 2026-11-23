// bots parts "buycheck" and "stages": one-step Undo of a write into the mod, used only while the frame's lib has no undo of its own
// (require('../../lib').undo = {save, restore} wins when present; same two calls). The bytes from before the write are kept OUTSIDE the
// mod, under <tmpRoot>/bots-undo/<hash of mod + file>/: before.bin (absent = the mod had no such file, so Undo removes it) and meta.json
// {existed, after: sha1 of the bytes written}. restore() puts the exact bytes back, refusing when the file changed since the write.
//   save(ctx, mod, rel)           call before the write (rel = path under resource/, '/' separated)
//   after(ctx, mod, rel)          call after the write: remembers what was written (the frame's version may not need it)
//   restore(ctx, mod, rel)        -> {restored: true, removed: bool}; throws {code: 'undoNone'|'undoChanged'}
// Author: Imperator_Aug (ARSENAL, ia-b8f39f6e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const no = code => Object.assign(new Error(code), { code, args: {}, status: 409 });
const target = (mod, rel) => path.join(mod, 'resource', ...String(rel).split('/'));
function dirOf(ctx, mod, rel) {
  const root = (ctx && typeof ctx.tmpRoot === 'string' && ctx.tmpRoot) || path.join(os.tmpdir(), 'arsenal-gui');
  return path.join(root, 'bots-undo', sha(path.resolve(mod).toLowerCase() + '|' + String(rel).toLowerCase()).slice(0, 20));
}
function save(ctx, mod, rel) {
  const d = dirOf(ctx, mod, rel), p = target(mod, rel);
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  const existed = fs.existsSync(p);
  if (existed) fs.writeFileSync(path.join(d, 'before.bin'), fs.readFileSync(p));
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ existed, rel, at: Date.now() }));
}
function after(ctx, mod, rel) {
  const d = dirOf(ctx, mod, rel), mp = path.join(d, 'meta.json');
  if (!fs.existsSync(mp)) return;
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')); m.after = sha(fs.readFileSync(target(mod, rel)));
  fs.writeFileSync(mp, JSON.stringify(m));
}
function restore(ctx, mod, rel) {
  const d = dirOf(ctx, mod, rel), mp = path.join(d, 'meta.json'), p = target(mod, rel);
  if (!fs.existsSync(mp)) throw no('undoNone');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')), now = fs.existsSync(p) ? sha(fs.readFileSync(p)) : null;
  if (!m.after || now !== m.after) throw no('undoChanged');
  if (m.existed) fs.writeFileSync(p, fs.readFileSync(path.join(d, 'before.bin')));
  else fs.rmSync(p, { force: true });
  fs.rmSync(d, { recursive: true, force: true });
  return { restored: true, removed: !m.existed };
}
// S13: the folders a write makes (resource/script/multiplayer in a fresh mod) are noted at save and removed again by an Undo that removes
// the file, when they are empty by then. Kept next to the undo bytes: <tmpRoot>/bots-undo-dirs/<hash>.json
function dirsFile(ctx, mod, rel) { const d = dirOf(ctx, mod, rel); return path.join(path.dirname(path.dirname(d)), 'bots-undo-dirs', path.basename(d) + '.json'); }
function missingDirs(mod, rel) {
  const out = [], root = path.resolve(mod);
  for (let d = path.dirname(target(mod, rel)); d.length > root.length && d.startsWith(root); d = path.dirname(d)) if (!fs.existsSync(d)) out.push(d);
  return out;   // deepest first
}
function noteDirs(ctx, mod, rel) {
  const f = dirsFile(ctx, mod, rel), l = missingDirs(mod, rel);
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(l)); } catch (e) { /* undo still works, folders may stay */ }
}
function dropDirs(ctx, mod, rel, removed) {
  const f = dirsFile(ctx, mod, rel); let l = [];
  try { l = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* none noted */ }
  try { fs.rmSync(f, { force: true }); } catch (e) { /* gone */ }
  if (!removed) return [];
  const gone = [], root = path.resolve(mod);
  for (const d of l) { if (!path.resolve(d).startsWith(root + path.sep)) continue; try { if (fs.readdirSync(d).length === 0) { fs.rmdirSync(d); gone.push(d); } } catch (e) { /* not empty or gone */ } }
  return gone;
}
// one face for both: pick().save(ctx, mod, rel) -> {commit()} (call commit after the write); pick().restore(ctx, mod, rel).
// The frame's lib.undo wins when it has save + restore (its save returns a ticket with commit(); its refusals carry key bots.e.undo*).
function pick() {
  let L = null; try { L = require('../../lib').undo; } catch (e) { /* none */ }
  // the frame's undo may remove the folders itself (its own dirsRemoved): both counts add up, a folder is removed once
  const done = (ctx, mod, rel, r) => { r = r || {}; const mine = dropDirs(ctx, mod, rel, !!r.removed).length; return Object.assign(r, { dirsRemoved: (Number(r.dirsRemoved) || 0) + mine }); };
  if (L && typeof L.save === 'function' && typeof L.restore === 'function') return {
    frame: true,
    save: (ctx, mod, rel) => { noteDirs(ctx, mod, rel); const tk = L.save(ctx, mod, rel); return { commit: () => (tk && typeof tk.commit === 'function' ? tk.commit() : null) }; },
    restore: (ctx, mod, rel) => done(ctx, mod, rel, L.restore(ctx, mod, rel)),
  };
  return { frame: false, save: (ctx, mod, rel) => { noteDirs(ctx, mod, rel); save(ctx, mod, rel); return { commit: () => after(ctx, mod, rel) }; },
    restore: (ctx, mod, rel) => done(ctx, mod, rel, restore(ctx, mod, rel)) };
}
// a route that never throws: a refusal comes back as {ok: false, code, args} for the page to word (S6/S9). Codes: this card's own
// (err.code + err.args), the frame lib's (err.key 'bots.e.X' -> 'X', err.params), anything else 'other' {m}
function codeOf(e) {
  if (e && typeof e.code === 'string' && e.args && typeof e.args === 'object') return { code: e.code, args: e.args };
  if (e && typeof e.key === 'string') return { code: e.key.replace(/^bots\.e\./, ''), args: e.params || {} };
  return { code: 'other', args: { m: String((e && e.message) || e) } };
}
const reply = fn => async (...a) => { try { return await fn(...a); } catch (e) { const c = codeOf(e); return { ok: false, code: c.code, args: c.args, msg: String((e && e.message) || e) }; } };

module.exports = { save, after, restore, pick, codeOf, reply };
