// anm: .anm (EANM) header reader. layout:; (Loader)
//   header = 'EANM' i32 version | 'FRMS' i32 frames | 'BMAP' i32 boneCount, boneCount x { i32 len, bytes }; frame chunks follow (not read)
//   parseHeader(buf) -> { version, frames, boneCount, bones: [names], error }  (error = string; fields read so far are kept)
// Author: Imperator_Aug (ARSENAL, ia-8ed2092d)
const { Reader, BinError } = require('./bin');

function parseHeader(buf) {
  const out = { version: 0, frames: 0, boneCount: 0, bones: [], error: null };
  const r = new Reader(buf);
  try {
    if (r.tag() !== 'EANM') { out.error = 'no EANM magic'; return out; }
    out.version = r.i32();
    if (r.tag() !== 'FRMS') { out.error = 'FRMS missing'; return out; }
    out.frames = r.i32();
    if (r.tag() !== 'BMAP') { out.error = 'BMAP missing'; return out; }
    const n = out.boneCount = r.i32();
    if (n < 0 || n > 100000) { out.error = 'bone count ' + n; return out; }
    if (n > 255) return out; // names not needed past the limit
    for (let i = 0; i < n; i++) { const len = r.i32(); if (len < 0 || len > 1024) { out.error = 'bone name length'; return out; } out.bones.push(r.str(len)); }
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    out.error = 'truncated: ' + e.message;
  }
  return out;
}

module.exports = { parseHeader };
