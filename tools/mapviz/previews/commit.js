// previews commit: write the encoded pictures into the mod with backups, a journal and a way back (previews.md 10).
//   commit(modDir, plan, pictures, o) -> {written:[path], backups:[path], renamed:[path], entry}
//     pictures = {targetId: Buffer}; o = {renameStronger:[rel path], mapKey, now?}. Order: lock -> per file: back up the
//     mod's own file when no backup exists yet and the file is not one mapviz wrote -> write to .mapviz-backup/tmp/<file>.<pid>
//     -> rename into place -> journal -> unlock. No temp file is ever made in a map folder (a <stem>...NN file there is an
//     animation frame, design 10).
//   undo(modDir, o) -> {v:1, target, map, n, restored:[path], kept:[path], notes:[{code, text}], deleted:[path], already:[path]}
//     o = {n?, map?, target?}; restored = every file put back to its state before the write (deleted = those removed)
//   lock(modDir) -> release()   throws MvError MV_BUSY when another live process holds it
//   journal(modDir) -> {v:1, writes:[...]}   sha1(buf)
// Journal <mod>/.mapviz-backup/journal.json (LF): {v:1, writes:[{n, made, target, map, mode, planHash, files:[{path, sha1,
// bytes, before:'absent'|'backup'|'ours', size?:[w, h], mips?, renamed?}], undone?}]}; n from 1; the last 50 kept.
// undo k: a file whose sha1 is not the journal's is kept (PRV_UNDO_CHANGED); else 'absent' -> removed; 'backup' or 'ours' ->
// the backup copied back when it exists, else removed. Undo goes back to the original before mapviz's first write of that
// file (the first backup is kept forever), a ruling.
// Author: Imperator_Aug (ARSENAL, ia-94c88fc6)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('./guard');

const BK = '.mapviz-backup';
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const mv = () => require('../mapviz');
const abs = (mod, rel) => path.join(mod, ...rel.split('/'));

function journalFile(mod) { return path.join(mod, BK, 'journal.json'); }
function journal(mod) {
  try { const j = JSON.parse(fs.readFileSync(journalFile(mod), 'utf8')); if (j && Array.isArray(j.writes)) return j; } catch (e) { /* none */ }
  return { v: 1, writes: [] };
}
function saveJournal(mod, j) {
  j.writes = j.writes.slice(-50);
  const f = journalFile(mod), tmp = path.join(mod, BK, 'tmp', 'journal.json.' + process.pid);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(j, null, 1).replace(/\r/g, '') + '\n');
  fs.renameSync(tmp, f);
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function lock(mod) {
  const d = path.join(mod, BK), f = path.join(d, 'lock');
  fs.mkdirSync(d, { recursive: true });
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = fs.openSync(f, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }) + '\n');
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(f); } catch (e) { /* gone */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let held = null; try { held = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { held = null; }
      // a lock whose process is gone is stale: taken over (ruling)
      if (held && Number.isInteger(held.pid) && held.pid !== process.pid && alive(held.pid)) break;
      if (held && held.pid === process.pid) break;
      try { fs.unlinkSync(f); } catch (x) { /* raced */ }
    }
  }
  throw new (mv().MvError)('MV_BUSY', 'another previews write holds the lock of this mod', { code: 'PRV_LOCK' });
}

// was this exact content written by mapviz for this path before?
function ours(j, rel, hash) { return j.writes.some(w => (w.files || []).some(f => f.path === rel && f.sha1 === hash)); }

function commit(modDir, plan, pictures, o) {
  o = o || {};
  const mod = path.resolve(modDir), mapKey = plan.map;
  const rows = plan.targets.filter(t => t.state === 'write' && pictures[t.id]);
  const renames = (o.renameStronger || []).slice();
  for (const rel of rows.map(r => r.path).concat(renames, rows.map(r => BK + '/' + r.path))) {
    const bad = G.pathOk(mod, rel, mapKey);
    if (bad) throw new (mv().MvError)('MV_REFUSED', bad.why, { code: bad.code });
  }
  const release = lock(mod);
  try {
    const j = journal(mod);
    const files = [], written = [], backups = [], renamed = [];
    // a stronger file of the owner's mod: moved into the backup folder (kept there; undo moves it back)
    for (const rel of renames) {
      const f = abs(mod, rel);
      if (!fs.existsSync(f)) continue;
      const b = abs(mod, BK + '/' + rel);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      if (!fs.existsSync(b)) fs.copyFileSync(f, b);
      fs.unlinkSync(f);
      renamed.push(rel);
      files.push({ path: rel, sha1: null, bytes: 0, before: 'backup', renamed: true });
    }
    for (const r of rows) {
      const buf = pictures[r.id], f = abs(mod, r.path), b = abs(mod, BK + '/' + r.path);
      let before = 'absent';
      if (fs.existsSync(f)) {
        const h = sha1(fs.readFileSync(f));
        if (ours(j, r.path, h)) before = 'ours';
        else {
          before = 'backup';
          if (!fs.existsSync(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(f, b); backups.push(BK + '/' + r.path); }
        }
      }
      const tmp = path.join(mod, BK, 'tmp', path.basename(f) + '.' + process.pid);
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, f);
      written.push(r.path);
      // size and mips of the target row as written: check reads them back against these (a minimap's size moves with the stack)
      files.push({ path: r.path, sha1: sha1(buf), bytes: buf.length, before, size: r.size ? r.size.slice() : null, mips: r.mips || null });
    }
    const n = (j.writes.length ? j.writes[j.writes.length - 1].n : 0) + 1;
    const entry = { n, made: o.now || new Date().toISOString(), target: plan.target, map: mapKey, mode: plan.mode || null, planHash: plan.hash, files };
    j.writes.push(entry);
    saveJournal(mod, j);
    return { written, backups, renamed, entry };
  } finally { release(); }
}

// the entry undo or check works on: n given, else the last one of this map (and target) not undone
function pick(j, o) {
  if (o && o.n != null) return j.writes.find(w => w.n === o.n) || null;
  for (let i = j.writes.length - 1; i >= 0; i--) {
    const w = j.writes[i];
    if (w.undone) continue;
    if (o && o.map && w.map !== o.map) continue;
    if (o && o.target && w.target !== o.target) continue;
    return w;
  }
  return null;
}

function undo(modDir, o) {
  o = o || {};
  const mod = path.resolve(modDir);
  const j = journal(mod), e = pick(j, o);
  if (!e) throw new (mv().MvError)('MV_NOT_FOUND', 'no journal entry ' + (o.n != null ? o.n : 'for this map') + ' in this mod', { code: 'PRV_NO_JOURNAL' });
  for (const fl of e.files) { const bad = G.pathOk(mod, fl.path, e.map); if (bad) throw new (mv().MvError)('MV_REFUSED', bad.why, { code: bad.code }); }
  const release = lock(mod);
  try {
    const restored = [], deleted = [], kept = [], already = [], notes = [];
    // a file removed again (absent before the write, or no backup) counts as restored and is listed in deleted too
    const remove = p => { restored.push(p); deleted.push(p); };
    for (const fl of e.files) {
      const f = abs(mod, fl.path), b = abs(mod, BK + '/' + fl.path);
      const now = fs.existsSync(f) ? sha1(fs.readFileSync(f)) : null;
      if (now !== fl.sha1) {
        // a file an earlier (partial) undo of this entry already put back is done, not changed
        const was = fl.before === 'absent' ? null : fs.existsSync(b) ? sha1(fs.readFileSync(b)) : undefined;
        if (was !== undefined && now === was) already.push(fl.path); else kept.push(fl.path);
        continue;
      }
      if (fl.before === 'absent') { if (now) { fs.unlinkSync(f); remove(fl.path); } continue; }
      if (fs.existsSync(b)) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = path.join(mod, BK, 'tmp', path.basename(f) + '.' + process.pid);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.copyFileSync(b, tmp); fs.renameSync(tmp, f);
        restored.push(fl.path);
      } else if (now) { fs.unlinkSync(f); remove(fl.path); }
    }
    if (kept.length) notes.push({ code: 'PRV_UNDO_CHANGED', text: 'A file changed since the write and was kept: ' + kept.join(', ') + '.' });
    else e.undone = new Date().toISOString();   // a partial undo stays open: undo it again once the kept files are dealt with
    saveJournal(mod, j);
    // late P3 shape {v, target, map, n, restored, kept, notes:[{code, text}]}; extra: deleted (the restored files that were
    // absent before the write, now removed) and already (put back by an earlier partial undo)
    return { v: 1, target: e.target, map: e.map, n: e.n, restored, kept, notes, deleted, already };
  } finally { release(); }
}

module.exports = { commit, undo, lock, journal, pick, sha1, BK };
