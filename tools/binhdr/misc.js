// binary/text header checks other than .ply: .anm (FMT-08), .vol (FMT-06), .dds (FMT-02), map.net (FMT-15), .wav (FMT-14), .ebm/.tex (FMT-17)
// ctx: { key, buf, rep, rel, game? }   game 'goh': GoH form where it differs (map.net only, see checkNet)
// Author: Imperator_Aug (ARSENAL, ia-70ed85e1)
const { Reader, BinError } = require('../lib/bin');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl');

// ---- .anm. returns { bones: [names], ok } for cross-file checks (FMT-09)
function parseAnm(ctx) {
  const { buf, rep, rel } = ctx;
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  const r = new Reader(buf);
  const out = { bones: [], ok: false };
  try {
    if (r.tag() !== 'EANM') return add('ANM_BAD_HEADER', 'file does not start with EANM'), out;
    const ver = r.i32();
    if (ver < 0x30000) add('ANM_VERSION', `version 0x${ver.toString(16)} < 0x30000: "Unsupported animation version"`);
    if (r.tag() !== 'FRMS') return add('ANM_BAD_HEADER', 'FRMS chunk missing after version'), out;
    const frames = r.i32();
    if (frames < 1) add('ANM_NO_FRAMES', `FRMS frame count ${frames}: "At least one frame required"`);
    if (r.tag() !== 'BMAP') return add('ANM_BAD_HEADER', 'BMAP chunk missing after FRMS'), out;
    const n = r.i32();
    if (n > 255) add('ANM_BONE_LIMIT', `${n} animated bones > 255: "Animated bones count is limited to 255!"`);
    if (n < 0 || n > 100000) return add('ANM_BAD_HEADER', `bone count ${n}`), out;
    for (let i = 0; i < n; i++) {
      const len = r.i32();
      if (len < 0 || len > 1024) return add('ANM_BAD_HEADER', `bone name ${i} length ${len}`), out;
      out.bones.push(r.str(len));
    }
    let nFrames = 0, last = -1;
    while (!r.eof()) {
      const at = r.pos, id = r.tag();
      if (id === 'FRM2') {
        const fno = r.u16(); nFrames++;
        if (fno >= frames) add('ANM_FRAME_INDEX', `frame ${fno} at offset ${at} >= FRMS count ${frames}: "Invalid frame #"`);
        last = fno;
        let cnt = r.u8();
        while (cnt-- > 0) {
          const b = r.u8();
          if (b >= n) return add('ANM_BONE_INDEX', `bone index ${b} >= ${n} at offset ${r.pos - 1}: "Invalid bone index"`), out;
          const fl = r.u16();
          if (fl & 1) r.skip(12);
          if (fl & 2) r.skip(12);
          if (fl & 0x20) r.skip(r.i32());
        }
      } else if (id === 'FRMN') {
        const fno = r.i32(); nFrames++;
        if (fno < 0 || fno >= frames) add('ANM_FRAME_INDEX', `frame ${fno} at offset ${at} outside FRMS count ${frames}: "Invalid frame #"`);
        while (r.peekTag() === 'BONE') {
          r.skip(4);
          const b = r.i32();
          if (b < 0 || b >= n) return add('ANM_BONE_INDEX', `bone index ${b} outside 0..${n - 1} at offset ${r.pos - 4}: "Invalid bone index"`), out;
          for (;;) {
            const t = r.peekTag();
            if (t === 'MATR') { r.skip(4 + 48); }
            else if (t === 'VISI') { r.skip(8); }
            else if (t === 'MESH') { r.skip(4); r.skip(r.i32()); }
            else break;
          }
        }
      } else return add('ANM_BAD_CHUNK', `unknown frame tag ${JSON.stringify(id)} at offset ${at}: "unknown chunk in animation" (earlier field desync?)`), out;
    }
    void last;
    if (nFrames === 0) {
      if (n === 0 && buf.length === 24) ctx.rep.info(rel, 0, 'ANM_NO_FRAMES', 'header-only file (vanilla has 11 of these): "Empty animation frames" if ever loaded');
      else add('ANM_NO_FRAMES', 'no frame chunks: "Empty animation frames"');
    }
    out.ok = true;
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    add('ANM_TRUNCATED', `data runs past end of file (${e.message}): field desync or truncated file`);
  }
  return out;
}

// ---- .vol
function checkVol(ctx) {
  const { buf, rep, rel } = ctx;
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  const r = new Reader(buf);
  try {
    if (r.tag() !== 'EVLM') return add('VOL_BAD_MAGIC', 'file does not start with EVLM');
    let verts = -1, idx = -1, side = null, haveVert = false;
    while (!r.eof()) {
      const at = r.pos, t = r.tag();
      if (t === 'VERT') { verts = r.i32(); r.skip(verts * 12); haveVert = true; }
      else if (t === 'INDX') {
        if (!haveVert) add('VOL_ORDER', `INDX at offset ${at} before VERT: INDX must follow VERT`);
        idx = r.i32(); const b = r.bytes(idx * 2);
        for (let i = 0; i < idx; i++) if (verts >= 0 && b.readUInt16LE(i * 2) >= verts) { add('VOL_INDEX_RANGE', `index ${b.readUInt16LE(i * 2)} >= vertex count ${verts}`); break; }
      }
      else if (t === 'SIDE') { const n = r.i32(); side = r.bytes(n); }
      else return add('VOL_BAD_CHUNK', `unknown block ${JSON.stringify(t)} at offset ${at}: "Invalid block in .VOL file!"`);
    }
    if (idx < 0 || verts < 0) return add('VOL_BAD_CHUNK', 'missing VERT/INDX chunk');
    if (!side) add('VOL_NO_SIDE', 'no SIDE chunk: empty material list, every triangle needs a side id (thickness lookup breaks)');
    else {
      if (side.length * 3 < idx) add('VOL_SIDE_COUNT', `SIDE has ${side.length} entries for ${Math.floor(idx / 3)} triangles`);
    }
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    add('VOL_TRUNCATED', `data runs past end of file (${e.message})`);
  }
}

// ---- .dds
function checkDds(ctx) {
  const { buf, rep, rel } = ctx;
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  if (buf.length < 128) return add('DDS_HEADER', 'DDS file stream is too short (<128 bytes)');
  if (buf.readUInt32LE(0) !== 0x20534444) return add('DDS_HEADER', 'Missing DDS header magic');
  const u = o => buf.readUInt32LE(o);
  if (u(4) !== 124 || u(76) !== 32) return add('DDS_HEADER', `Cannot parse DDS header (size ${u(4)}, pixelformat size ${u(76)})`);
  const flags = u(8), h = u(12), w = u(16), mips = u(28) || 1, pf = u(80), cc = buf.toString('latin1', 84, 88), bits = u(88), caps2 = u(112);
  if (pf & 4 && cc === 'DX10') return add('DDS_DX10', 'DXT10 textures are not supported (use DXT1-5 or 32-bit RGB)');
  let fmt = false;
  if (pf & 0x40) {
    if (bits === 32) {
      const m = [u(92), u(96), u(100), u(104)].join();
      fmt = [[0xff0000, 0xff00, 0xff, 0xff000000], [0xff0000, 0xff00, 0xff, 0], [0xff, 0xff0000, 0xff00, 0xff000000], [0xffffffff, 0, 0, 0]].some(a => a.join() === m);
    }
  } else if (pf & 4) fmt = /^DXT[1-5]$/.test(cc);
  if (!fmt) return add('DDS_FORMAT', `Unknown DDS picture format. FourCC=${JSON.stringify(cc)}, flags=${pf}, bits=${bits}: use DXT1-5 or 32-bit RGB`);
  if (flags & 0x800000) return add('DDS_VOLUME', 'DDS files with volume textures are not supported');
  if (caps2 & 0x200 && (caps2 & 0xFE00) !== 0xFE00) add('DDS_CUBE', 'cubemap DDS does not contain all six faces');
  if (mips > 15) add('DDS_MIPS', `${mips} mipmaps > 15`);
  if (w > 8192 || h > 8192) add('DDS_SIZE', `${w}x${h} exceeds 8192`);
}

// ---- map.net: u8 cell, u8 version, i16 w, i16 h, f32 offX, f32 offY, [v>=2: MAP0 table, MAP1 table, GRID], cells
// ctx.game 'goh' (GoH data): cell 5 is the GoH grid and a piece of another cell size is no error (GHMAP-06 [V]), so no NET_CELL;
//   the version byte is read and ignored, every file is read as version 2 (GHMAP-16, GHFMT-09 [V]): version 0/1 is NET_VERSION there
function checkNet(ctx) {
  const { buf, rep, rel } = ctx, goh = ctx.game === 'goh';
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  const r = ctx.mkReader ? ctx.mkReader(buf, 0) : new Reader(buf);   // binhdr: a reader over a partly read file (list.js sparse)
  try {
    const cell = r.u8(), ver0 = r.u8(), w = r.i16(), h = r.i16();
    r.skip(8);
    if (goh && ver0 !== 2) return add('NET_VERSION', `heightmap version ${ver0}: GoH ignores the version byte and reads every map.net as version 2 (MAP0/MAP1 tables, GRID, 4-byte cells), so this file reads as garbage; re-save it as version 2 (GHMAP-16)`);
    else if (ver0 > 2) add('NET_VERSION', `heightmap version ${ver0} (engine handles 0..2)`);
    const ver = goh ? 2 : ver0;
    if (w <= 0 || h <= 0) add('NET_SIZE', `size ${w}x${h}: width/height are i16 (max 32767), larger maps are unrepresentable`);
    if (cell === 0) add('NET_SIZE', 'cell size 0');
    else if (cell !== 10 && !goh) add('NET_CELL', `cell ${cell}: land patches assume 10, fatal \`Different grid cell sizes!\` (, PORT-70). Fix: node tools/mapport/mapport.js <mod resource> --out <dir> resamples cell 5 to 10`);
    let per = ver === 0 ? 3 : 4;
    if (ver >= 2) {
      for (const marker of ['MAP0', 'MAP1']) {
        if (r.tag() !== marker) return add('NET_TABLE', `ground table ${marker} missing: "string map not found"`);
        let n = r.u8();
        while (n-- > 0) { r.u8(); const l = r.u8(); r.skip(l === 255 ? r.u8() | r.u8() << 8 | r.u8() << 16 : l); }
      }
      if (r.tag() !== 'GRID') return add('NET_TABLE', 'no GRID marker');
    }
    if (w > 0 && h > 0 && r.left !== w * h * per) add('NET_SIZE', `${r.left} bytes of cells, header says ${w}x${h}x${per} = ${w * h * per}`);
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    add('NET_SIZE', `heightmap header runs past end of file (${e.message})`);
  }
}

// ---- .wav
// ctx.buf = the whole file, or ctx.len + ctx.at(pos, n) -> Buffer (binhdr list.wavHead: only the chunk headers are read)
function checkWav(ctx) {
  const { buf, rep, rel } = ctx;
  const len = buf ? buf.length : ctx.len, at = buf ? (q, n) => buf.subarray(q, q + n) : ctx.at;
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  if (len < 12 || at(0, 4).toString('latin1') !== 'RIFF' || at(8, 4).toString('latin1') !== 'WAVE') return add('WAV_NOT_RIFF', 'not a RIFF/WAVE file (Miles AIL_WAV_info fails)');
  let p = 12, fmt = false, data = false;
  while (p + 8 <= len) {
    const h = at(p, 8), id = h.toString('latin1', 0, 4), sz = h.readUInt32LE(4);
    if (id === 'fmt ') fmt = true; else if (id === 'data') data = true;
    p += 8 + sz + (sz & 1);
  }
  if (!fmt) add('WAV_NOT_RIFF', 'no fmt chunk');
  else if (!data) add('WAV_NOT_RIFF', 'no data chunk');
  else if (at(4, 4).readUInt32LE(0) + 8 > len) add('WAV_NOT_RIFF', 'RIFF size larger than file (truncated)');
}

// ---- .ebm / .tex (SDL text)
function checkEbm(ctx) {
  const { buf, rep, rel } = ctx;
  const r = readText(buf, 'cp1251');
  if (r.fatal) return rep.add(rel, 0, 'EBM_SDL', 'Not SDL file! ' + r.fatal);
  const toks = sdl.tokenize(r.lines, () => {});
  if (!toks.length || toks[0].t !== '{') return rep.add(rel, 0, 'EBM_SDL', 'Not SDL file!: first token is not "{"');
  const tree = sdl.parse(toks, () => {});
  const top = tree.kids[0];
  if (!top) return rep.add(rel, 0, 'EBM_SDL', 'Not SDL file!');
  const sig = (top.name || '').toLowerCase();
  if (sig !== 'bitmap' && sig !== 'reference') return rep.add(rel, top.line, 'EBM_SIGNATURE', `File signature mismatch (read '${top.name}' instead of 'reference')`);
  for (const k of top.kids) if ((k.name || '').toLowerCase() === 'mipmap') rep.add(rel, k.line, 'WARN_EBM_MIPMAP', '"Mipmap" key: engine warns "Automatic MIP generation not supported"');
}

module.exports = { parseAnm, checkVol, checkDds, checkNet, checkWav, checkEbm };
