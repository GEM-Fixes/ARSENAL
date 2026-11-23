// Undo for the parts of this folder and modeready: the exact bytes a file had before a write, put back on request (page standard S4).
// The frame's require('../../lib').undo = {save(ctx, mod, rel), restore(ctx, mod, rel)} is used when it is there (use()); this file is
// the same calls kept here until then. rel = a path under <mod>/resource (bots lib modPath). save() before a write records the bytes (or
// "there was no file"); done() after the write records what was written, so restore() can refuse plainly when the file was changed since
// (by hand or by another page). Kept in memory for this window session: an undo is offered right after a write, never across a restart.
// Errors carry a code: undo.none (nothing saved), undo.changed (the file differs from what was written).
// Author: Imperator_Aug (ARSENAL, ia-217bd41d)
'use strict';
const fs = require('fs'), path = require('path');

const STORE = new Map();   // mod|rel -> {before: Buffer|null, after: Buffer|null|undefined}
const fileOf = (mod, rel) => path.join(mod, 'resource', ...String(rel).split('/'));
const keyOf = (mod, rel) => path.resolve(mod).toLowerCase() + '|' + String(rel).toLowerCase();
const read = f => { try { return fs.readFileSync(f); } catch (e) { return null; } };
const same = (a, b) => (a == null ? b == null : b != null && Buffer.compare(a, b) === 0);
const fail = (code, rel) => Object.assign(new Error(code + ': ' + rel), { code, rel });

function save(ctx, mod, rel) { STORE.set(keyOf(mod, rel), { before: read(fileOf(mod, rel)), after: undefined }); }
function done(ctx, mod, rel) { const s = STORE.get(keyOf(mod, rel)); if (s) s.after = read(fileOf(mod, rel)); }
const has = (mod, rel) => STORE.has(keyOf(mod, rel));
// what restore would refuse, without touching anything: null = fine
function check(ctx, mod, rel) {
  const s = STORE.get(keyOf(mod, rel));
  if (!s) return 'undo.none';
  if (s.after !== undefined && !same(read(fileOf(mod, rel)), s.after)) return 'undo.changed';
  return null;
}
// -> {rel, action: 'restored' | 'deleted'}
function restore(ctx, mod, rel) {
  const why = check(ctx, mod, rel);
  if (why) throw fail(why, rel);
  const s = STORE.get(keyOf(mod, rel)), f = fileOf(mod, rel);
  if (s.before == null) { try { fs.unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s.before); }
  STORE.delete(keyOf(mod, rel));
  return { rel, action: s.before == null ? 'deleted' : 'restored' };
}

const local = { save, done, restore, check, has, fileOf };
// the frame's undo (lib.undo: save -> ticket, commit after the write, check/restore throw bots.e.undoNone / bots.e.undoChanged) behind
// this file's calls: done = commit, check -> 'undo.none' | 'undo.changed' | null, restore -> {rel, action}, errors with .code
const codeOf = e => (/changed/i.test(String((e && (e.key || e.code)) || '') + ' ' + String((e && e.message) || '')) ? 'undo.changed' : 'undo.none');
function adapt(L) {
  return {
    save: (ctx, mod, rel) => { L.save(ctx, mod, rel); },
    done: (ctx, mod, rel) => { if (typeof L.commit === 'function') L.commit(ctx, mod, rel); },
    check: (ctx, mod, rel) => { if (typeof L.check !== 'function') return null; try { L.check(ctx, mod, rel); return null; } catch (e) { return codeOf(e); } },
    restore: (ctx, mod, rel) => {
      let r;
      try { r = L.restore(ctx, mod, rel); } catch (e) { const c = /^bots\.e\.undo(None|Changed)$/.test(String(e && e.key)) || /undo/i.test(String(e && e.message)) ? codeOf(e) : null; if (c) throw Object.assign(fail(c, rel), { cause: e }); throw e; }
      return { rel, action: r && (r.removed || r.action === 'deleted') ? 'deleted' : 'restored' };
    },
    has: (mod, rel) => false,
    fileOf,
  };
}
// the frame's undo when it has one, else this file
function use() {
  let L = null;
  try { L = require('../../lib').undo; } catch (e) { L = null; }
  return L && typeof L.save === 'function' && typeof L.restore === 'function' ? adapt(L) : local;
}
module.exports = Object.assign({ use }, local);
