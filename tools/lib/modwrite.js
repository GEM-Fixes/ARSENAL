// modwrite: the write side every tool shares when it writes into the mod the user named (hard rule: only into that mod, through
// lib/writeguard, with a restore point, bytes kept).
//   fileWhy(mod, file, opt) -> '' | plain reason. The final file must sit strictly inside the mod folder both as written and with links
//     followed (the realpath of the part of the file's path that exists, inside the realpath of the mod), and pass
//     writeguard.refuseWrite(file, opt) (opt: {game, games, purpose, advanced}). A link (junction, symlink) inside the mod that points out
//     of it is refused here, before anything is written.
//   guardFile(mod, file, opt) -> file | throws Error(reason) {status 400, code 'MOD_WRITE_OUTSIDE'}
//   restoreRoot(mod) -> the folder that keeps the mod's restore points: <mod>.arsenal-undo beside the mod (the Files page form,
//     tools/gui/ext/files/lib.js), except when the mod sits in a game install (<game>/mods/<mod>, AS2 or GoH) or a Steam library: then
//     <mod>/.arsenal/undo, so no new folder ever appears in a game's mods folder (the game mounts <mod>/resource only; .arsenal is
//     not read by it). The Files page lists and restores from both.
//   restorePoints(mod, rels, action) -> [id]   one point per file in the Files page form (<root>/<id>/restore-point.json + files/<rel>),
//     rel = the path under the mod ('resource/...'). A file that does not exist yet gets a point with existed:false (restore = remove).
//   newFilePoints(mod, rels, action) -> [id]   points for files a child tool already made (existed:false, restore = remove)
//   writeFiles(mod, files, opt) -> [rel]   files: Map|[[rel, Buffer]]; each target guarded (guardFile) first, then temp file + rename
// Author: Imperator_Aug (ARSENAL, ia-73677296)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const UNDO_SUFFIX = '.arsenal-undo', IN_MOD = ['.arsenal', 'undo'];
const win = process.platform === 'win32';
const key = p => { const s = path.resolve(p).replace(/[\\/]+$/, ''); return win ? s.toLowerCase() : s; };
// a strictly inside b (both already resolved the same way)
const under = (a, b) => { const r = path.relative(key(b), key(a)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
// the path with links followed, for the part that exists (the rest is kept as written)
function realOf(p) {
  let d = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(d), ...tail); } catch (e) { /* missing: one up */ }
    const up = path.dirname(d); if (up === d) return path.resolve(p);
    tail.unshift(path.basename(d)); d = up;
  }
}
const bad = msg => Object.assign(new Error(msg), { status: 400, code: 'MOD_WRITE_OUTSIDE' });

function fileWhy(mod, file, opt) {
  if (typeof mod !== 'string' || !mod.trim()) return 'refused: no mod folder was given';
  if (typeof file !== 'string' || !file.trim()) return 'refused: no file was given';
  const m = path.resolve(mod), f = path.resolve(file);
  if (!under(f, m)) return 'refused: ' + f + ' is outside the mod folder ' + m;
  const rm = realOf(m), rf = realOf(f);
  if (!under(rf, rm)) return 'refused: ' + f + ' leads out of the mod folder (a link inside the mod points to ' + rf + ')';
  const why = require('./writeguard').refuseWrite(f, Object.assign({ purpose: 'write a file of the mod' }, opt || {}));
  return why || '';
}
function guardFile(mod, file, opt) { const w = fileWhy(mod, file, opt); if (w) throw bad(w); return file; }

// in a game install or a Steam library: the restore points stay inside the mod
function inGameFolder(mod) {
  const parent = path.dirname(path.resolve(mod));
  if (/[\\/]steamapps[\\/]/i.test(parent + path.sep)) return true;
  try { return !!require('./writeguard').detectInstall(parent); } catch (e) { return false; }
}
function restoreRoot(mod) {
  const m = path.resolve(mod);
  return inGameFolder(m) ? path.join(m, ...IN_MOD) : path.join(path.dirname(m), path.basename(m) + UNDO_SUFFIX);
}
function stamp() { const d = new Date(), z = (n, w = 2) => String(n).padStart(w, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '-' + z(d.getMilliseconds(), 3); }
function restorePoints(mod, rels, action, opt) {
  const m = path.resolve(mod), root = restoreRoot(m), ids = [];
  if (!(rels || []).length) return ids;
  // the store itself: inside the mod = the file guard; beside the mod = the shared write guard on that folder
  if (under(root, m)) guardFile(m, path.join(root, 'x'), opt);
  else { const why = require('./writeguard').refuseWrite(root, Object.assign({ purpose: 'keep restore points' }, opt || {})); if (why) throw bad(why); }
  for (const rel0 of rels) {
    const rel = String(rel0).replace(/\\/g, '/').replace(/^\/+/, '');
    let id = stamp(), n = 1;
    while (fs.existsSync(path.join(root, id))) id = stamp() + '-' + (++n);
    const dir = path.join(root, id), f = path.join(m, ...rel.split('/'));
    let st = null; try { st = fs.statSync(f); } catch (e) { st = null; }
    fs.mkdirSync(dir, { recursive: true });
    const mf = { id, time: new Date().toISOString(), rel, action: action || 'write', existed: !!st, size: st ? st.size : 0, hash: null };
    if (st) { const b = fs.readFileSync(f); mf.hash = crypto.createHash('sha1').update(b).digest('hex'); const to = path.join(dir, 'files', ...rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, b); }
    fs.writeFileSync(path.join(dir, 'restore-point.json'), JSON.stringify(mf, null, 1));
    ids.push(id);
  }
  return ids;
}
// a file that was made after the fact (a child tool wrote it): a point that says it did not exist before (restore = remove)
function newFilePoints(mod, rels, action, opt) {
  const m = path.resolve(mod), root = restoreRoot(m), ids = [];
  if (!(rels || []).length) return ids;
  if (under(root, m)) guardFile(m, path.join(root, 'x'), opt);
  else { const why = require('./writeguard').refuseWrite(root, Object.assign({ purpose: 'keep restore points' }, opt || {})); if (why) throw bad(why); }
  for (const rel0 of rels) {
    const rel = String(rel0).replace(/\\/g, '/').replace(/^\/+/, '');
    let id = stamp(), n = 1;
    while (fs.existsSync(path.join(root, id))) id = stamp() + '-' + (++n);
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'restore-point.json'), JSON.stringify({ id, time: new Date().toISOString(), rel, action: action || 'write', existed: false, size: 0, hash: null }, null, 1));
    ids.push(id);
  }
  return ids;
}
function writeFiles(mod, files, opt) {
  const done = [], list = files instanceof Map ? [...files] : files || [];
  for (const [rel] of list) guardFile(mod, path.join(path.resolve(mod), ...String(rel).split('/')), opt);
  for (const [rel, buf] of list) {
    const f = path.join(path.resolve(mod), ...String(rel).split('/')), tmp = f + '.arsenal-tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f);
    done.push(rel);
  }
  return done;
}

module.exports = { fileWhy, guardFile, restoreRoot, restorePoints, newFilePoints, writeFiles, realOf, UNDO_SUFFIX, IN_MOD };
