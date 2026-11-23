// ply: minimal .ply (EPLY/BPLY) reader for exporter-limit checks. layouts:;
//   (chunk loop), poly mesh/mesh part ReadMesh (MESH/SUBM headers), bone map (bonemap). Full validation stays in tools/binhdr/ply.js.
//   parse(buf) -> { magic, big, skin: [boneNames]|null, parts: [{ tag, flags, bonemap: [u8]|null }], inline, error }
//   skin = names from the SKIN chunk (null = no SKIN chunk = unskinned); parts = MESH/SUBM headers up to the first undecodable
//   section (inline = a layered inline material stopped the walk; error = string, structure desync/truncation; partial result kept)
// Author: Imperator_Aug (ARSENAL, ia-b407798a)
const { Reader, BinError } = require('./bin');

const KNOWN = new Set(['BNDS', 'SKIN', 'MESH', 'SUBM', 'VERT', 'INDX', 'ADJA', 'SHDW', 'MROR']);
const BIG_KNOWN = new Set([...KNOWN, 'BAS2', 'BASS', 'IND4', 'InfG', 'LBEG', 'LEND']);
const F = { skinned: 0x10, light: 0x200, material: 0x400, boneMap: 0x800, detail: 0x100, keep: 0x1000 };
const TYPE_SIZE = [4, 8, 12, 16, 4, 4, 4];
const cstr = r => { const b = r.u8(); return b === 255 ? r.u8() | r.u8() << 8 | r.u8() << 16 : b; };
const readString = r => r.str(cstr(r), 'latin1');

function parse(buf) {
  const out = { magic: null, big: false, skin: null, parts: [], inline: false, error: null };
  if (buf.length < 4) { out.error = 'file shorter than 4 bytes'; return out; }
  out.magic = buf.toString('latin1', 0, 4);
  if (out.magic !== 'EPLY' && out.magic !== 'BPLY') { out.error = 'bad magic'; return out; }
  const big = out.big = out.magic === 'BPLY', known = big ? BIG_KNOWN : KNOWN;
  const r = new Reader(buf, 4);
  try {
    while (!r.eof() && !out.inline) {
      const tag = r.tag();
      if (!known.has(tag)) { out.error = `unknown chunk ${JSON.stringify(tag)} at ${r.pos - 4}`; return out; }
      switch (tag) {
        case 'BNDS': r.skip(24); break;
        case 'ADJA': r.skip(r.i32() * 6); break;
        case 'SHDW': r.skip(r.i32()); break;
        case 'SKIN': { const n = r.i32(); out.skin = []; for (let i = 0; i < n; i++) out.skin.push(readString(r)); break; }
        case 'BAS2': r.skip(48); break;
        case 'BASS': r.skip(72); break;
        case 'MESH': case 'SUBM': {
          const p = { tag, flags: 0, bonemap: null };
          let fvf = 0, tex = 0;
          if (tag === 'SUBM') {
            for (let run = 0; run < 2; run++) for (;;) {
              const c = r.u8(); if (c === 0xff) break;
              r.u8(); r.u8();
              if ((c & 15) > 6) { out.error = 'bad vertex element type'; return out; }
              if ((c >> 4) === 3) tex++;
            }
            r.skip(16); p.flags = r.u32();
          } else { fvf = r.u32(); r.skip(8); p.flags = r.u32(); tex = (fvf & 0xF00) >> 8; }
          const fl = p.flags;
          if (fl & F.light) r.skip(4);
          if (fl & F.material) { if (readString(r) === '') { out.inline = true; out.parts.push(p); break; } }
          else {
            let n = 0; const t = tex + ((fl & F.detail && fl & F.light) ? 1 : 0);
            if (fl & (F.detail | F.light)) n = 1 + (fl & F.detail ? 1 : 0) + (fl & F.light ? 1 : 0);
            else if (t === 2 || fl & F.keep) n = 2; else if (t === 1) n = 1;
            for (let i = 0; i < n; i++) readString(r);
          }
          if (fl & F.boneMap) p.bonemap = Array.from(r.bytes(r.u8()));
          out.parts.push(p);
          break;
        }
        case 'VERT': { const c = r.i32(); if (big) r.skip(c * r.i32()); else { const s = r.u16(); r.u16(); r.skip(c * s); } break; }
        case 'INDX': r.skip(r.i32() * 2); break;
        case 'IND4': r.skip(r.i32() * 4); break;
        case 'InfG': r.skip(24); r.skip(r.i32() * 2); break;
        default: break; // MROR LBEG LEND
      }
    }
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    out.error = 'truncated: ' + e.message;
  }
  return out;
}

module.exports = { parse };
