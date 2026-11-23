// Models page part `ply` (sub/README.md): the one thing the Meshes and materials sub-tab needs that is not an op or a state read.
//   POST /api/x/models/ply/import-read { path } -> { ok, kind: 'obj', name, text, mtl: [{ name, text }], mtlMissing: [names] }
//                                                | { ok, kind: 'ply', name, data (base64) } | { ok: false, error: plain sentence }
// Reads one .obj (with the .mtl libraries it names, from its own folder) or one .ply anywhere on this computer and hands the
// text or bytes to the page, which passes them to the ply.import / ply.attach ops. Reads only: writes nothing.
// Game: reads a disk file only, the same on AS64 and MoW:AS2. Under Gates of Hell the same.
// Author: Imperator_Aug (ARSENAL, ia-3abb0ed7)
'use strict';
const fs = require('fs'), path = require('path');
const G = require('../game');

const MAX = 64 * 1024 * 1024, MAX_MTL = 4 * 1024 * 1024;

function readRoute(ctx, b) {
  try {
    const p = String((b && b.path) || '').trim().replace(/^"(.*)"$/, '$1');
    if (!p) return { ok: false, error: 'Type the full path of an .obj or .ply file.' };
    if (p.includes('\0') || p[0] === '-') return { ok: false, error: 'That path cannot be used.' };
    if (!path.isAbsolute(p)) return { ok: false, error: 'Type the full path, starting with the drive letter.' };
    const ext = path.extname(p).toLowerCase();
    if (ext !== '.obj' && ext !== '.ply') return { ok: false, error: 'Only .obj and .ply files can be brought in.' };
    let st;
    try { st = fs.statSync(p); } catch (e) { return { ok: false, error: 'There is no file at ' + p + '.' }; }
    if (!st.isFile()) return { ok: false, error: p + ' is not a file.' };
    if (st.size > MAX) return { ok: false, error: 'The file is larger than 64 MB.' };
    const name = path.basename(p, path.extname(p));
    if (ext === '.ply') return { ok: true, kind: 'ply', name, data: fs.readFileSync(p).toString('base64') };
    const text = fs.readFileSync(p, 'utf8');
    const mtl = [], mtlMissing = [];
    const libs = [];
    for (const line of text.split(/\r\n|\n|\r/)) { const m = /^\s*mtllib\s+(.+?)\s*$/.exec(line); if (m) libs.push(...m[1].split(/\s+/)); }
    for (const l of [...new Set(libs)]) {
      const f = path.resolve(path.dirname(p), l);
      if (path.extname(f).toLowerCase() !== '.mtl') { mtlMissing.push(l); continue; }
      try { const s = fs.statSync(f); if (!s.isFile() || s.size > MAX_MTL) throw new Error('size'); mtl.push({ name: l, text: fs.readFileSync(f, 'utf8') }); } catch (e) { mtlMissing.push(l); }
    }
    return { ok: true, kind: 'obj', name, text, mtl, mtlMissing };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).split('\n')[0] };
  }
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = { routes: { 'POST /api/x/models/ply/import-read': wrap(readRoute) } };
