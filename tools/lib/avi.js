// avi: read an .avi the way the game's own RIFF parser does (chunk reader), not as a
// generic AVI reader. Reads through read(off, len) -> Promise<Buffer> in 1 MB windows, so a 40 MB file inside a pak is walked, never
// loaded whole. Read only. No dependencies.
//   parse(read, size) -> Promise<{ ok, fail, avih, fps, streams, movi, video, audio, other, lists, idx1, dur, verdict, notes }>
//     fail = null | { code,, src } the first engine check that fails (the game then shows nothing: open stays false)
//     video = { count, bytes, chunks:[[off,len]], cut } '00dc' payloads in file order (stream 0)
//     audio = { count, bytes, chunks:[[off,len]], cut } '01wb' payloads (stream 1)
//     verdict = { picture: 'plays'|'none'|'wont'|'unknown', sound: 'plays'|'silent'|'wont'|'unknown', why: [{code, src, p}] }
// Engine rules (each why.code carries its source line):
//   size < 0x20 -> nothing (:382). 'RIFF' (:386), the RIFF size is not checked (:390), 'AVI ' (:391), 'LIST' (:395), the hdrl size must
//   fit in the file (:400), 'hdrl' (:404), 'avih' (:408), avih size exactly 0x38 (:414), hdrl at least 12 + 0x38 (:418); the rest of
//   hdrl (the strl lists: codec headers) is skipped unread (:424), so the fourcc is never checked. Then top-level chunks until
//   LIST movi: JUNK is skipped by its size (:434), another LIST by its size (:445-455), anything else is stepped over 4 bytes at a time
//   (:432: the loop reads one id and goes on); the end of the file first = nothing (:429). Stream 0 = video, chunks '00dc' only
//   (:464), avih.streams < 1 = no picture (:465); stream 1 = audio, chunks '01wb' only (:478), avih.streams < 2 = silent (:479);
//   fps = 1e6 / avih.microSecPerFrame (:470), size = avih width x height (:467). Chunks are read in file order from the start of
//   movi to the end of the file: a chunk of another id (a LIST 'rec ', idx1, '00db') is skipped whole with its pad byte (:543), so
//   frames inside a LIST 'rec ' are never seen; a chunk cut by the end of the file ends the stream (:563). Video goes to xvid
//   (MPEG-4 Part 2: XVID/DIVX/DX50/FMP4/MP4V), audio to the Miles ASI .mp3 decoder (:131): audio must be MP3 (format tag 0x55).
// Author: Imperator_Aug (ARSENAL, ia-27a73749)
'use strict';
const SRC = '';
const WIN = 1 << 20, MAXLIST = 400000;
const MPEG4 = ['xvid', 'divx', 'dx50', 'fmp4', 'mp4v', 'dxgm', '3iv2', 'm4s2', 'rmp4', 'smp4', 'div3', 'div4'];
const BROWSER = ['mjpg', 'avc1', 'h264', 'x264', 'vp80', 'vp90'];
const WAVE_TAGS = { 0x1: 'PCM', 0x2: 'MS ADPCM', 0x3: 'float PCM', 0x11: 'IMA ADPCM', 0x50: 'MPEG-1 Layer 1/2', 0x55: 'MP3', 0xff: 'AAC', 0x1610: 'AAC', 0x2000: 'AC-3', 0x161: 'WMA', 0x162: 'WMA Pro', 0x674f: 'Vorbis', 0x6771: 'Vorbis', 0xfffe: 'extensible' };

// a reader over read(off, len) with one 1 MB window kept
function win(read, size) {
  let wo = -1, wb = null;
  async function bytes(off, len) {
    if (off < 0 || len <= 0 || off >= size) return Buffer.alloc(0);
    len = Math.min(len, size - off);
    if (wb && off >= wo && off + len <= wo + wb.length) return wb.subarray(off - wo, off - wo + len);
    if (len > WIN) return read(off, len);
    wb = await read(off, Math.min(WIN, size - off)); wo = off;
    return wb.subarray(0, Math.min(len, wb.length));
  }
  return { bytes, async tag(off) { const b = await bytes(off, 4); return b.length === 4 ? b.toString('latin1') : null; },
    async i32(off) { const b = await bytes(off, 4); return b.length === 4 ? b.readInt32LE(0) : null; } };
}
const fcc = s => (s || '').replace(/[^\x20-\x7e]/g, '.');

// the strl lists inside hdrl (the game skips them; read here for the facts only)
async function strls(W, from, end) {
  const out = [];
  let p = from;
  while (p + 8 <= end && out.length < 16) {
    const id = await W.tag(p), sz = await W.i32(p + 4);
    if (id == null || sz == null || sz < 0) break;
    if (id === 'LIST' && (await W.tag(p + 8)) === 'strl') {
      const s = { type: null, handler: null, scale: 0, rate: 0, length: 0, compression: null, width: 0, height: 0, fmt: null };
      let q = p + 12; const qe = Math.min(end, p + 8 + sz);
      while (q + 8 <= qe) {
        const cid = await W.tag(q), csz = await W.i32(q + 4);
        if (cid == null || csz == null || csz < 0) break;
        const b = await W.bytes(q + 8, Math.min(csz, 256));
        if (cid === 'strh' && b.length >= 36) {
          s.type = fcc(b.toString('latin1', 0, 4)); s.handler = fcc(b.toString('latin1', 4, 8));
          s.scale = b.readUInt32LE(20); s.rate = b.readUInt32LE(24); s.length = b.readUInt32LE(32);
        } else if (cid === 'strf' && b.length >= 16 && s.type === 'vids' && b.length >= 20) {
          s.width = b.readInt32LE(4); s.height = b.readInt32LE(8); s.compression = fcc(b.toString('latin1', 16, 20));
        } else if (cid === 'strf' && s.type === 'auds' && b.length >= 14) {
          const tag = b.readUInt16LE(0);
          s.fmt = { tag, name: WAVE_TAGS[tag] || null, channels: b.readUInt16LE(2), rate: b.readUInt32LE(4), avgBytes: b.readUInt32LE(8), align: b.readUInt16LE(12), bits: b.length >= 16 ? b.readUInt16LE(14) : 0 };
        }
        q += 8 + csz + (csz & 1);
      }
      out.push(s);
    }
    p += 8 + sz + (sz & 1);
  }
  return out;
}

async function parse(read, size) {
  const W = win(read, size);
  const o = { ok: false, fail: null, size, avih: null, fps: 0, streams: [], top: [], movi: null, video: null, audio: null, other: {}, lists: 0, idx1: false, dur: null, verdict: null, notes: [] };
  const fail = (code, at, line) => { o.fail = { code, at, src: SRC + ':' + line }; return finish(o); };
  if (size < 0x20) return fail('small', 0, 382);
  if ((await W.tag(0)) !== 'RIFF') return fail('riff', 0, 386);
  if ((await W.tag(8)) !== 'AVI ') return fail('avi', 8, 391);
  if ((await W.tag(12)) !== 'LIST') return fail('list', 12, 395);
  let listSize = await W.i32(16);
  if (size - 20 < listSize) return fail('hdrlSize', 16, 400);
  if ((await W.tag(20)) !== 'hdrl') return fail('hdrl', 20, 404);
  if ((await W.tag(24)) !== 'avih') return fail('avih', 24, 408);
  const avihSize = await W.i32(28);
  o.avihSize = avihSize;
  if (avihSize !== 0x38) return fail('avihSize', 28, 414);
  listSize -= 12;
  if (listSize < 0x38) return fail('hdrlShort', 16, 418);
  const a = await W.bytes(32, 0x38);
  if (a.length < 0x38) return fail('small', 32, 422);
  o.avih = { usPerFrame: a.readUInt32LE(0), maxBytesPerSec: a.readUInt32LE(4), flags: a.readUInt32LE(12), totalFrames: a.readInt32LE(16), streams: a.readUInt32LE(24), width: a.readInt32LE(32), height: a.readInt32LE(36) };
  o.fps = o.avih.usPerFrame ? 1e6 / o.avih.usPerFrame : 0;
  const hdrlEnd = 32 + listSize;
  o.streams = await strls(W, 32 + 0x38, Math.min(size, hdrlEnd));
  // top-level chunks until LIST movi, as the game walks them (:427-457)
  let p = hdrlEnd, steps = 0;
  for (;;) {
    if (size - p < 4) return fail('noMovi', p, 429);
    const id = await W.tag(p); p += 4;
    if (id === 'JUNK') {
      const sz = await W.i32(p); p += 4;
      o.top.push({ id, off: p - 8, size: sz });
      if (sz == null || size - p < sz) return fail('junkSize', p - 4, 437);
      p += sz;
    } else if (id === 'LIST') {
      let sz = await W.i32(p); p += 4;
      if (sz == null || sz < 4) return fail('listSmall', p - 4, 444);
      sz -= 4;
      const t = await W.tag(p); p += 4;
      o.top.push({ id: 'LIST ' + fcc(t), off: p - 12, size: sz + 4 });
      if (t === 'movi') break;
      if (size - p < sz) return fail('listSize', p - 8, 450);
      p += sz;
    } else if (++steps === 1) o.notes.push({ code: 'stepped', p: { id: fcc(id), at: p - 4 }, src: SRC + ':432' });
  }
  o.ok = true;
  o.movi = { off: p, size: o.top[o.top.length - 1].size };
  const moviEnd = p - 4 + o.movi.size;
  o.after = [];
  // the chunk walk: from the start of movi to the end of the file (:520-575)
  const v = { count: 0, bytes: 0, chunks: [], cut: false, max: 0 }, au = { count: 0, bytes: 0, chunks: [], cut: false, max: 0 };
  while (size - p >= 8) {
    const h = await W.bytes(p, 8), id = h.toString('latin1', 0, 4), sz = h.readInt32LE(4);
    p += 8;
    const left = size - p, s = sz < 0 ? 0 : sz;
    const tgt = id === '00dc' ? v : id === '01wb' ? au : null;
    if (tgt) {
      const n = Math.min(s, left);
      tgt.count++; tgt.bytes += n; if (n > tgt.max) tgt.max = n;
      if (tgt.chunks.length < MAXLIST) tgt.chunks.push([p, n]);
      if (left < s) { tgt.cut = true; break; }
      p += s + ((s & 1) && size - p - s > 0 ? 1 : 0);
    } else {
      if (id === 'LIST') { if (p - 8 < moviEnd) o.lists++; else o.after.push('LIST ' + fcc((await W.bytes(p, 4)).toString('latin1'))); }   // a LIST INFO after idx1 is harmless
      else if (id === 'idx1') o.idx1 = true;
      else o.other[fcc(id)] = (o.other[fcc(id)] || 0) + 1;
      p += Math.min(s + (s & 1), left);
    }
  }
  o.video = v; o.audio = au;
  return finish(o);
}

// durations, agreement and the game's verdict in codes (the page words them)
function finish(o) {
  const why = [], add = (code, line, p) => why.push({ code, src: SRC + ':' + line, p: p || {} });
  const vd = { picture: 'unknown', sound: 'unknown', why };
  o.verdict = vd;
  if (o.fail) { vd.picture = 'wont'; vd.sound = 'wont'; add('fail.' + o.fail.code, +o.fail.src.split(':').pop(), { at: o.fail.at }); return o; }
  const A = o.avih, s0 = o.streams[0] || null, s1 = o.streams[1] || null;
  const vfcc = String((s0 && (s0.compression || s0.handler)) || '').toLowerCase().trim();
  const hfcc = String((s0 && s0.handler) || '').toLowerCase().trim();
  o.fourcc = s0 ? (s0.compression || s0.handler) : null;
  o.browser = BROWSER.includes(vfcc) ? vfcc : null;
  // picture
  if (A.streams < 1) { vd.picture = 'none'; add('noStreams', 465); }
  else if (s0 && s0.type && s0.type !== 'vids') { vd.picture = 'wont'; add('notVideo0', 464, { t: s0.type }); }
  else if (!o.video.count) { vd.picture = 'wont'; add(o.lists ? 'inRec' : 'noFrames', o.lists ? 543 : 464, { n: o.lists }); }
  else if (vfcc && !MPEG4.includes(vfcc) && !MPEG4.includes(hfcc)) { vd.picture = 'wont'; add('codec', 115, { f: o.fourcc }); }
  else if (!A.usPerFrame) { vd.picture = 'wont'; add('fps0', 470); }
  else { vd.picture = 'plays'; if (!vfcc) add('codecUnknown', 424); }
  if (o.video.count && o.lists) add('inRec', 543, { n: o.lists });
  if (o.video.cut || o.audio.cut) add('cut', 563);
  if (A.totalFrames && o.video.count && A.totalFrames !== o.video.count) add('frameCount', 469, { a: A.totalFrames, n: o.video.count });
  if (A.width <= 0 || A.height <= 0) add('size0', 467, { w: A.width, h: A.height });
  // sound
  if (A.streams < 2) { vd.sound = 'silent'; add('oneStream', 479); }
  else if (s1 && s1.type && s1.type !== 'auds') { vd.sound = 'wont'; add('notAudio1', 478, { t: s1.type }); }
  else if (!o.audio.count) { vd.sound = 'silent'; add('noAudio', 478); }
  else if (s1 && s1.fmt && s1.fmt.tag !== 0x55) { vd.sound = 'wont'; add('notMp3', 131, { f: s1.fmt.name || ('0x' + s1.fmt.tag.toString(16)) }); }
  else vd.sound = 'plays';
  // durations from both streams
  const vs = A.usPerFrame ? o.video.count * A.usPerFrame / 1e6 : null;
  let as = null;
  if (s1 && s1.fmt && s1.fmt.avgBytes) as = o.audio.bytes / s1.fmt.avgBytes;
  else if (s1 && s1.rate && s1.scale) as = s1.length * s1.scale / s1.rate;
  o.dur = { video: vs, audio: as, agree: vs == null || as == null ? null : Math.abs(vs - as) <= Math.max(1, 0.05 * Math.max(vs, as)) };
  if (o.dur.agree === false) add('durations', 470, { v: vs.toFixed(1), a: as.toFixed(1) });
  return o;
}

// the '01wb' payloads joined (an MP3 stream the browser can decode), at most max bytes -> { buf, total, cut }
async function audioBytes(read, chunks, max) {
  let total = 0; for (const c of chunks) total += c[1];
  const out = []; let got = 0;
  // join neighbouring chunks into one read where they are close (fewer reads)
  for (let i = 0; i < chunks.length && got < max;) {
    let j = i, end = chunks[i][0] + chunks[i][1];
    while (j + 1 < chunks.length && chunks[j + 1][0] - end < 4096 && chunks[j + 1][0] + chunks[j + 1][1] - chunks[i][0] < (4 << 20)) { j++; end = chunks[j][0] + chunks[j][1]; }
    const base = chunks[i][0], b = await read(base, end - base);
    for (let k = i; k <= j && got < max; k++) { const s = b.subarray(chunks[k][0] - base, chunks[k][0] - base + chunks[k][1]); const t = s.subarray(0, Math.min(s.length, max - got)); out.push(t); got += t.length; }
    i = j + 1;
  }
  return { buf: Buffer.concat(out), total, cut: got < total };
}

module.exports = { parse, audioBytes, MPEG4, BROWSER, WAVE_TAGS, SRC };
