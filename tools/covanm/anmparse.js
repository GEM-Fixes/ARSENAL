// Author: Imperator_Aug (ARSENAL, ia-a6409e89)
'use strict';
// anmparse: full .anm (EANM) frame reader for covanm. layout: [V].
//   parse(buf) -> { version, frames, bones:[names], recs:[{frame,bone,pos?,rot?,mirrored?,show?,hide?,matr?,visi?,meshBytes?}], error }
//   FRM2 (0x60000): per frame u16 frame, u8 count, per record u8 bone, u16 flags, data. FRMN (0x40000/0x50000): i32 frame, BONE/MATR/VISI/MESH.
//   category(parsed) -> set of strings: frm2-posrot, frmn-matrix, mesh-morph, visibility
function parse(buf) {
  const out = { version: 0, frames: 0, bones: [], recs: [], error: null };
  let p = 0;
  const tag = () => { const t = buf.toString('latin1', p, p + 4); p += 4; return t; };
  const i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  try {
    if (tag() !== 'EANM') { out.error = 'no EANM'; return out; }
    out.version = i32();
    if (tag() !== 'FRMS') { out.error = 'no FRMS'; return out; }
    out.frames = i32();
    if (tag() !== 'BMAP') { out.error = 'no BMAP'; return out; }
    const n = i32();
    for (let i = 0; i < n; i++) { const l = i32(); out.bones.push(buf.toString('latin1', p, p + l)); p += l; }
    let curFrame = 0, curBone = -1, cur = null;
    while (p < buf.length) {
      const t = tag();
      if (t === 'FRM2') {
        const fr = buf.readUInt16LE(p); p += 2;
        const cnt = buf[p++];
        for (let k = 0; k < cnt; k++) {
          const bone = buf[p++]; const fl = buf.readUInt16LE(p); p += 2;
          const r = { frame: fr, bone, flags: fl };
          if (fl & 1) r.pos = [f32(), f32(), f32()];
          if (fl & 2) r.rot = [f32(), f32(), f32()];
          if (fl & 4) r.mirrored = true;
          if (fl & 8) r.show = true;
          if (fl & 16) r.hide = true;
          if (fl & 32) { const sz = i32(); r.meshBytes = buf.subarray(p, p + sz); p += sz; }
          out.recs.push(r);
        }
      } else if (t === 'FRMN') { curFrame = i32(); cur = null;
      } else if (t === 'BONE') { curBone = i32(); cur = { frame: curFrame, bone: curBone }; out.recs.push(cur);
      } else if (t === 'MATR') { cur.matr = []; for (let k = 0; k < 12; k++) cur.matr.push(f32());
      } else if (t === 'VISI') { cur.visi = i32();
      } else if (t === 'MESH') { const sz = i32(); cur.meshBytes = buf.subarray(p, p + sz); p += sz;
      } else { out.error = 'unknown chunk ' + JSON.stringify(t) + ' at ' + (p - 4); return out; }
    }
  } catch (e) { out.error = 'truncated: ' + e.message; }
  return out;
}

function category(a) {
  const c = new Set();
  for (const r of a.recs) {
    if (r.pos || r.rot) c.add('frm2-posrot');
    if (r.matr) c.add('frmn-matrix');
    if (r.meshBytes) c.add('mesh-morph');
    if (r.show || r.hide || r.visi !== undefined) c.add('visibility');
  }
  return c;
}

// per-record comparison keyed (frame,bone): returns list of {frame,bone,what}
function diffRecs(a, b, eps) {
  eps = eps || 1e-6;
  const key = r => r.frame + ':' + r.bone;
  const ma = new Map(a.recs.map(r => [key(r), r])), mb = new Map(b.recs.map(r => [key(r), r]));
  const out = [];
  const far = (x, y) => !x !== !y || (x && x.some((v, i) => Math.abs(v - y[i]) > eps));
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const x = ma.get(k), y = mb.get(k);
    const [frame, bone] = k.split(':').map(Number);
    if (!x || !y) { out.push({ frame, bone, what: x ? 'removed' : 'added' }); continue; }
    if (far(x.pos, y.pos)) out.push({ frame, bone, what: 'pos' });
    if (far(x.rot, y.rot)) out.push({ frame, bone, what: 'rot' });
    if (far(x.matr, y.matr)) out.push({ frame, bone, what: 'matr' });
    if (!!x.show !== !!y.show || !!x.hide !== !!y.hide || x.visi !== y.visi) out.push({ frame, bone, what: 'visibility' });
    if (!!x.mirrored !== !!y.mirrored) out.push({ frame, bone, what: 'mirrored' });
    if ((x.meshBytes && x.meshBytes.toString('hex')) !== (y.meshBytes && y.meshBytes.toString('hex'))) out.push({ frame, bone, what: 'mesh' });
  }
  return out;
}
module.exports = { parse, category, diffRecs };
