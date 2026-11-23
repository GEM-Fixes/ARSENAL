// wav: RIFF/WAVE reader + bit-exact standard decoders + PCM16 / IMA ADPCM writers, for the game's sounds (Miles, whole file).
//   parse(buf)  -> { ok, kind, error?, riff:{size}, fmt:{tag, codec, channels, rate, bits, blockAlign, avgBytes, cbSize,
//                    samplesPerBlock?, coefs?, validBits?, channelMask?, subTag?}, dataOffset, dataBytes, frames, seconds,
//                    fact?:{samples}, loops?:[{id,type,start,end,fraction,playCount}], chunks:[{id,off,size}], notes:[{code,level,msg}] }
//   decode(buf, {ima:'reference'|'ffmpeg'}?) -> { ok:true, rate, channels, frames, pcm:Int16Array (interleaved), codec, trimmedByFact }
//                | { ok:false, code, error, payload?:{off,len,codec} }   (MP3-in-WAV: payload = the raw mp3 bytes for a browser)
//   encodePcm16({rate, channels, pcm}) -> Buffer   plain 16-bit PCM RIFF (fmt 16 bytes, data)
//   encodeImaAdpcm({rate, channels, pcm}, {blockAlign=1024}) -> Buffer   vanilla profile: fmt 20 bytes, tag 0x11, 4 bits, cbSize 2,
//                    samplesPerBlock 2041 at align 1024 mono, fact chunk = real frame count, last block padded with silence
//   CODEC names, IMA tables (IMA_STEP, IMA_INDEX), imaExpand(state, nibble) for tests.
// What the game does with a file (notes): reads the whole file and hands it to AIL_WAV_info
//  only lists *.wav.
// Note codes agree with tools/gui/ext/art/core.js wavInfo (kinds short/ogg/mp3/flac/notwav/nofmt; warns codec/bits/stereo/rate).
// Author: Imperator_Aug (ARSENAL, ia-e3f0aa79)
'use strict';

const TAG = { PCM: 0x0001, MS_ADPCM: 0x0002, FLOAT: 0x0003, ALAW: 0x0006, MULAW: 0x0007, IMA_ADPCM: 0x0011, MP3: 0x0055, EXTENSIBLE: 0xFFFE };
const CODEC = { 0x0001: 'pcm', 0x0002: 'ms-adpcm', 0x0003: 'float', 0x0006: 'alaw', 0x0007: 'mulaw', 0x0011: 'ima-adpcm', 0x0055: 'mp3', 0xFFFE: 'extensible' };
// the codecs vanilla sound.pak uses (sweep 2026-11-12: ima-adpcm and pcm 16 only); Miles 9 plays PCM 8/16 and IMA ADPCM natively [I: MSS docs]
const GAME_SAFE = new Set([0x0001, 0x0011]);
// KSDATAFORMAT_SUBTYPE_* = xxxx0000-0000-0010-8000-00aa00389b71: bytes 2..15 of the GUID
const KS_TAIL = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71]);

// IMA ADPCM (IMA Digital Audio Focus and Technical Working Groups, 1992; Microsoft "IMA ADPCM" WAVE_FORMAT 0x0011)
const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
  143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
  1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635,
  13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
// MS ADPCM (Microsoft ADPCM, WAVE_FORMAT 0x0002): adaptation table and the 7 standard coefficient pairs
const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const MS_COEF = [[256, 0], [512, -256], [0, 0], [192, 64], [240, 0], [460, -208], [392, -232]];

const clamp16 = v => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);
const note = (notes, code, level, msg) => notes.push({ code, level, msg });

// ---------- parse ----------
function sniff(buf) {
  if (buf.length < 12) return 'short';
  const m4 = buf.toString('latin1', 0, 4);
  if (m4 === 'OggS') return 'ogg';
  if (m4.slice(0, 3) === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return 'mp3';
  if (m4 === 'fLaC') return 'flac';
  if (m4 !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return 'notwav';
  return 'wav';
}
const SNIFF_MSG = {
  short: ['SHORT', 'too small to be a sound (under 12 bytes): Miles refuses it, the sound is silent'],
  ogg: ['OGG_RENAMED', 'an .ogg file renamed to .wav: Miles AIL_WAV_info needs RIFF/WAVE, the sound is silent; convert to a real .wav'],
  mp3: ['MP3_RENAMED', 'an .mp3 file renamed to .wav: not RIFF/WAVE, the sound is silent; convert to a real .wav (an .mp3 next to it is not listed, FMT-14)'],
  flac: ['FLAC_RENAMED', 'a .flac file renamed to .wav: not RIFF/WAVE, the sound is silent; convert to a real .wav'],
  notwav: ['NOT_RIFF', 'no RIFF/WAVE header: Miles refuses it, the sound is silent'],
};

function samplesPerBlockOf(tag, ch, align, bits) {
  if (!ch || !align) return 0;
  if (tag === TAG.IMA_ADPCM) return bits === 4 ? ((align - 4 * ch) * 8) / (4 * ch) + 1 : 0;
  if (tag === TAG.MS_ADPCM) return ((align - 7 * ch) * 8) / (4 * ch) + 2;
  return 0;
}

function parse(buf) {
  const notes = [], chunks = [];
  const out = { ok: false, kind: sniff(buf), riff: null, fmt: null, dataOffset: -1, dataBytes: 0, frames: 0, seconds: 0, chunks, notes };
  if (out.kind !== 'wav') {
    const [code, msg] = SNIFF_MSG[out.kind];
    note(notes, code, 'error', msg); out.error = msg; return out;
  }
  const riffSize = buf.readUInt32LE(4);
  out.riff = { size: riffSize };
  if (riffSize + 8 > buf.length) note(notes, 'RIFF_SIZE', 'info', `RIFF size says ${riffSize + 8} bytes, file has ${buf.length}`);
  let o = 12, fmtC = null, dataC = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), size = buf.readUInt32LE(o + 4);
    chunks.push({ id, off: o, size });
    if (id === 'fmt ' && !fmtC) fmtC = { off: o + 8, size };
    else if (id === 'data' && !dataC) dataC = { off: o + 8, size };
    else if (id === 'fact' && size >= 4 && o + 12 <= buf.length) out.fact = { samples: buf.readUInt32LE(o + 8) };
    else if (id === 'smpl' && size >= 36 && o + 44 <= buf.length) out.loops = readSmpl(buf, o + 8, size);
    if (o + 8 + size > buf.length) break;           // truncated chunk: stop walking
    o += 8 + size + (size & 1);
  }
  if (!fmtC || fmtC.size < 16 || fmtC.off + 16 > buf.length) {
    out.kind = 'nofmt'; out.error = 'no usable fmt chunk';
    note(notes, 'NO_FMT', 'error', 'the .wav header is damaged (no fmt chunk): Miles refuses it, the sound is silent'); return out;
  }
  const f = fmtC.off;
  const fmt = {
    tag: buf.readUInt16LE(f), codec: null, channels: buf.readUInt16LE(f + 2), rate: buf.readUInt32LE(f + 4), avgBytes: buf.readUInt32LE(f + 8),
    blockAlign: buf.readUInt16LE(f + 12), bits: buf.readUInt16LE(f + 14), cbSize: fmtC.size >= 18 && f + 18 <= buf.length ? buf.readUInt16LE(f + 16) : 0,
  };
  fmt.codec = CODEC[fmt.tag] || ('tag-0x' + fmt.tag.toString(16).padStart(4, '0'));
  let tag = fmt.tag;
  if (tag === TAG.EXTENSIBLE && fmt.cbSize >= 22 && fmtC.size >= 40 && f + 40 <= buf.length) {
    fmt.validBits = buf.readUInt16LE(f + 18); fmt.channelMask = buf.readUInt32LE(f + 20);
    const g = buf.subarray(f + 24, f + 40);
    if (g.subarray(2).equals(KS_TAIL)) { fmt.subTag = g.readUInt16LE(0); tag = fmt.subTag; fmt.codec = 'extensible/' + (CODEC[tag] || 'tag-0x' + tag.toString(16)); }
    else fmt.codec = 'extensible/guid-' + g.toString('hex');
  }
  if ((tag === TAG.IMA_ADPCM || tag === TAG.MS_ADPCM) && fmt.cbSize >= 2 && f + 20 <= buf.length) fmt.samplesPerBlock = buf.readUInt16LE(f + 18);
  if (tag === TAG.MS_ADPCM && fmt.cbSize >= 4 && f + 22 <= buf.length) {
    const n = buf.readUInt16LE(f + 20); fmt.coefs = [];
    for (let i = 0; i < n && f + 22 + 4 * i + 4 <= buf.length && 4 + 4 * (i + 1) <= fmt.cbSize; i++) fmt.coefs.push([buf.readInt16LE(f + 22 + 4 * i), buf.readInt16LE(f + 24 + 4 * i)]);
  }
  out.fmt = fmt; out.tag = tag;
  if (!dataC) { out.error = 'no data chunk'; note(notes, 'NO_DATA', 'error', 'no data chunk: nothing to play'); return out; }
  out.dataOffset = dataC.off;
  const avail = Math.max(0, buf.length - dataC.off);
  out.dataBytes = Math.min(dataC.size, avail);
  if (dataC.size > avail) note(notes, 'TRUNCATED', 'warn', `data chunk says ${dataC.size} bytes, only ${avail} in the file: playback stops early or clicks [T]`);
  out.frames = framesOf(out, tag);
  out.seconds = fmt.rate ? out.frames / fmt.rate : 0;
  out.ok = true;
  gameNotes(out, tag);
  return out;
}

function readSmpl(buf, p, size) {
  const n = buf.readUInt32LE(p + 28), loops = [];
  for (let i = 0; i < n && 36 + 24 * (i + 1) <= size && p + 36 + 24 * (i + 1) <= buf.length; i++) {
    const q = p + 36 + 24 * i;
    loops.push({ id: buf.readUInt32LE(q), type: buf.readUInt32LE(q + 4), start: buf.readUInt32LE(q + 8), end: buf.readUInt32LE(q + 12), fraction: buf.readUInt32LE(q + 16), playCount: buf.readUInt32LE(q + 20) });
  }
  return loops;
}

// frames the decoder yields (before the fact trim) and, with a fact chunk, the fact count when smaller
function decodableFrames(p, tag) {
  const f = p.fmt, ch = f.channels, n = p.dataBytes;
  if (!ch) return 0;
  switch (tag) {
    case TAG.PCM: case TAG.FLOAT: case TAG.ALAW: case TAG.MULAW: {
      const bps = Math.ceil(f.bits / 8) * ch; return bps ? Math.floor(n / bps) : 0;
    }
    case TAG.IMA_ADPCM: case TAG.MS_ADPCM: {
      const spb = f.samplesPerBlock || samplesPerBlockOf(tag, ch, f.blockAlign, f.bits), al = f.blockAlign;
      if (!al || !spb) return 0;
      const full = Math.floor(n / al), rest = n - full * al;
      return full * spb + partialFrames(tag, ch, rest);
    }
    default: return 0;
  }
}
function partialFrames(tag, ch, rest) {
  if (tag === TAG.IMA_ADPCM) { if (rest < 4 * ch) return 0; return 1 + Math.floor((rest - 4 * ch) / (4 * ch)) * 8; }
  if (tag === TAG.MS_ADPCM) { if (rest < 7 * ch) return 0; return 2 + Math.floor(((rest - 7 * ch) * 2) / ch); }
  return 0;
}
function framesOf(p, tag) {
  const d = decodableFrames(p, tag);
  if (p.fact && (tag === TAG.IMA_ADPCM || tag === TAG.MS_ADPCM) && p.fact.samples <= d) return p.fact.samples;
  if (tag === TAG.MP3 && p.fact) return p.fact.samples;
  return d;
}

function gameNotes(p, tag) {
  const f = p.fmt, n = p.notes;
  if (!GAME_SAFE.has(tag)) {
    const how = tag === TAG.MP3 ? 'MP3 in WAV: Miles needs its MP3 ASI codec for a sample; untested in game [T]'
      : `${f.codec}: vanilla data never uses it; Miles 9 samples play PCM 8/16 and IMA ADPCM, others are refused or silent [I]`;
    note(n, 'CODEC', 'warn', how + '. Use mono IMA ADPCM or 16-bit PCM');
  }
  if (tag === TAG.PCM && f.bits === 8) note(n, 'PCM_BITS', 'info', 'PCM is 8-bit: Miles plays it (5 vanilla files are 8-bit) but 16-bit sounds cleaner');
  else if (tag === TAG.PCM && f.bits !== 16) note(n, 'PCM_BITS', 'warn', `PCM is ${f.bits}-bit: Miles 9 samples take 8 or 16 bits [I]; one vanilla file is 24-bit (does it sound in game? [T]); use 16-bit`);
  if (tag === TAG.IMA_ADPCM && f.bits !== 4) note(n, 'IMA_BITS', 'warn', `IMA ADPCM with ${f.bits} bits per sample: only 4-bit is standard`);
  if (f.channels !== 1) note(n, 'STEREO', 'warn', `${f.channels} channels: a positioned sound (shot, voice) should be mono; Miles 3D on a stereo sample loses its place [T]`);
  if (f.rate !== 44100 && f.rate !== 22050) note(n, 'RATE', 'warn', `sample rate ${f.rate} Hz: game files use 44100 (22050 also exists); Miles resamples to the output rate (option sound/rate)`);
  if (!f.channels || !f.rate) note(n, 'FMT_ZERO', 'error', 'channels or rate is 0: nothing can play');
  if ((tag === TAG.IMA_ADPCM || tag === TAG.MS_ADPCM) && f.samplesPerBlock !== undefined) {
    const want = samplesPerBlockOf(tag, f.channels, f.blockAlign, f.bits);
    if (want && f.samplesPerBlock !== want) note(n, 'SPB', 'warn', `samplesPerBlock ${f.samplesPerBlock} does not match block align ${f.blockAlign} (${want}): decoders disagree`);
  }
  if (tag === TAG.IMA_ADPCM && f.blockAlign !== 1024 * f.channels && f.blockAlign !== 2048 * f.channels) note(n, 'IMA_ALIGN', 'info', `IMA ADPCM block align ${f.blockAlign}: vanilla uses 1024 (2041 samples per block; 719 language.pak voices 2048 / 4089)`);
  // vanilla: about 900 IMA files carry a fact a few samples (< 1 block) above what the data holds (encoder quirk, harmless): not noted
  if (p.fact && (tag === TAG.IMA_ADPCM || tag === TAG.MS_ADPCM)) {
    const d = decodableFrames(p, tag), spb = f.samplesPerBlock || samplesPerBlockOf(tag, f.channels, f.blockAlign, f.bits);
    if (p.fact.samples >= d + spb) note(n, 'FACT', 'info', `fact says ${p.fact.samples} samples, data holds ${d}: data shorter than the encoder wrote`);
  }
  if (p.frames === 0) note(n, 'EMPTY', 'warn', 'no samples: the sound is silent');
}

// ---------- decoders ----------
function imaExpand(st, nib) {           // st = { pred, index }; reference bitwise form (Microsoft IMAADPCM / IMA spec), not the x*step multiply
  const step = IMA_STEP[st.index];
  let diff = step >> 3;
  if (nib & 4) diff += step;
  if (nib & 2) diff += step >> 1;
  if (nib & 1) diff += step >> 2;
  st.pred = clamp16(nib & 8 ? st.pred - diff : st.pred + diff);
  st.index += IMA_INDEX[nib];
  if (st.index < 0) st.index = 0; else if (st.index > 88) st.index = 88;
  return st.pred;
}

// ffmpeg's adpcm_ima_expand_nibble form: diff = ((2*(n&7)+1)*step)>>3 (one rounding). Differs from the reference by up to
// ~1000 LSB inside a block on vanilla shots (mean ~26); only for comparing with ffmpeg output (decode(buf, {ima:'ffmpeg'})).
function imaExpandMul(st, nib) {
  const step = IMA_STEP[st.index], diff = ((2 * (nib & 7) + 1) * step) >> 3;
  st.pred = clamp16(nib & 8 ? st.pred - diff : st.pred + diff);
  st.index += IMA_INDEX[nib];
  if (st.index < 0) st.index = 0; else if (st.index > 88) st.index = 88;
  return st.pred;
}

function decodeIma(buf, p, out, frames, expand) {
  const ch = p.fmt.channels, al = p.fmt.blockAlign, spb = p.fmt.samplesPerBlock || samplesPerBlockOf(TAG.IMA_ADPCM, ch, al, 4);
  let o = p.dataOffset, end = p.dataOffset + p.dataBytes, w = 0;   // w = frame index written
  const st = []; for (let c = 0; c < ch; c++) st.push({ pred: 0, index: 0 });
  while (o + 4 * ch <= end && w < frames) {
    const bEnd = Math.min(o + al, end);
    for (let c = 0; c < ch; c++) {
      st[c].pred = buf.readInt16LE(o + 4 * c); st[c].index = Math.min(88, buf[o + 4 * c + 2]);   // byte 3 reserved
      out[w * ch + c] = st[c].pred;
    }
    let base = w + 1, q = o + 4 * ch, done = 1;
    // body: groups of 4 bytes per channel = 8 samples per channel, low nibble first
    while (q + 4 * ch <= bEnd && done < spb) {
      for (let c = 0; c < ch; c++) {
        for (let b = 0; b < 4; b++) {
          const byte = buf[q + 4 * c + b];
          const i0 = base + b * 2, i1 = i0 + 1;
          const s0 = expand(st[c], byte & 15), s1 = expand(st[c], byte >> 4);
          if (i0 < frames) out[i0 * ch + c] = s0;
          if (i1 < frames) out[i1 * ch + c] = s1;
        }
      }
      base += 8; done += 8; q += 4 * ch;
    }
    w = Math.min(frames, base);
    o += al;
  }
  return w;
}

function decodeMs(buf, p, out, frames) {
  const ch = p.fmt.channels, al = p.fmt.blockAlign, spb = p.fmt.samplesPerBlock || samplesPerBlockOf(TAG.MS_ADPCM, ch, al, 4);
  const coefs = p.fmt.coefs && p.fmt.coefs.length ? p.fmt.coefs : MS_COEF;
  let o = p.dataOffset, w = 0;
  const end = p.dataOffset + p.dataBytes;
  while (o + 7 * ch <= end && w < frames) {
    const bEnd = Math.min(o + al, end), st = [];
    for (let c = 0; c < ch; c++) {
      const pi = buf[o + c], cf = coefs[pi] || [0, 0];
      st.push({ c1: cf[0], c2: cf[1], delta: buf.readInt16LE(o + ch + 2 * c), s1: buf.readInt16LE(o + 3 * ch + 2 * c), s2: buf.readInt16LE(o + 5 * ch + 2 * c) });
    }
    for (let c = 0; c < ch; c++) { if (w < frames) out[w * ch + c] = st[c].s2; if (w + 1 < frames) out[(w + 1) * ch + c] = st[c].s1; }
    let idx = 0, q = o + 7 * ch;          // nibbles high first, channels interleaved per nibble
    const total = (spb - 2) * ch;
    for (; q < bEnd && idx < total; q++) {
      for (const nib of [buf[q] >> 4, buf[q] & 15]) {
        if (idx >= total) break;
        const c = idx % ch, s = st[c];
        const signed = nib & 8 ? nib - 16 : nib;
        const pred = clamp16(((s.s1 * s.c1 + s.s2 * s.c2) >> 8) + signed * s.delta);
        s.s2 = s.s1; s.s1 = pred;
        s.delta = (MS_ADAPT[nib] * s.delta) >> 8; if (s.delta < 16) s.delta = 16;
        const fi = w + 2 + Math.floor(idx / ch);
        if (fi < frames) out[fi * ch + c] = pred;
        idx++;
      }
    }
    w = Math.min(frames, w + 2 + Math.floor(idx / ch));
    o += al;
  }
  return w;
}

// G.711 (ITU-T) expansions to 16-bit
function alaw(a) {
  a ^= 0x55;
  let t = (a & 0x0F) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8; else if (seg === 1) t += 0x108; else { t += 0x108; t <<= seg - 1; }
  return a & 0x80 ? t : -t;
}
function mulaw(u) {
  u = ~u & 0xFF;
  let t = ((u & 0x0F) << 3) + 0x84;
  t <<= (u & 0x70) >> 4;
  return u & 0x80 ? 0x84 - t : t - 0x84;
}

function decode(buf, opt = {}) {
  const p = parse(buf);
  if (!p.ok) return { ok: false, code: (p.notes[0] || {}).code || 'BAD', error: p.error || 'not a usable wav', parse: p };
  const f = p.fmt, ch = f.channels, tag = p.tag;
  if (tag === TAG.MP3) return { ok: false, code: 'MP3_IN_WAV', error: 'MP3 inside a WAV: not decoded here; the payload is raw MPEG audio a browser can decode', payload: { off: p.dataOffset, len: p.dataBytes, codec: 'mp3' }, parse: p };
  if (!ch || !f.rate) return { ok: false, code: 'FMT_ZERO', error: 'channels or rate is 0', parse: p };
  const frames = p.frames, pcm = new Int16Array(frames * ch), d = p.dataOffset;
  let got = frames;
  switch (tag) {
    case TAG.PCM: {
      const B = Math.ceil(f.bits / 8);
      if (![1, 2, 3, 4].includes(B)) return { ok: false, code: 'PCM_BITS', error: `PCM ${f.bits}-bit not decodable`, parse: p };
      for (let i = 0; i < frames * ch; i++) {
        const q = d + i * B;
        pcm[i] = B === 1 ? (buf[q] - 128) << 8 : B === 2 ? buf.readInt16LE(q) : B === 3 ? buf.readIntLE(q, 3) >> 8 : buf.readInt32LE(q) >> 16;
      }
      break;
    }
    case TAG.FLOAT: {
      if (f.bits !== 32 && f.bits !== 64) return { ok: false, code: 'FLOAT_BITS', error: `float ${f.bits}-bit not decodable`, parse: p };
      for (let i = 0; i < frames * ch; i++) {
        const x = f.bits === 32 ? buf.readFloatLE(d + i * 4) : buf.readDoubleLE(d + i * 8);
        pcm[i] = clamp16(Math.round((x !== x ? 0 : x) * 32768));   // NaN -> 0; full scale 1.0 -> 32767 (clip)
      }
      break;
    }
    case TAG.ALAW: for (let i = 0; i < frames * ch; i++) pcm[i] = alaw(buf[d + i]); break;
    case TAG.MULAW: for (let i = 0; i < frames * ch; i++) pcm[i] = mulaw(buf[d + i]); break;
    case TAG.IMA_ADPCM:
      if (f.bits !== 4) return { ok: false, code: 'IMA_BITS', error: `IMA ADPCM ${f.bits}-bit not decodable here`, parse: p };
      got = decodeIma(buf, p, pcm, frames, opt.ima === 'ffmpeg' ? imaExpandMul : imaExpand); break;
    case TAG.MS_ADPCM: got = decodeMs(buf, p, pcm, frames); break;
    default: return { ok: false, code: 'CODEC', error: `codec ${f.codec} not decodable`, parse: p };
  }
  const trimmed = !!(p.fact && (tag === TAG.IMA_ADPCM || tag === TAG.MS_ADPCM) && p.fact.samples < decodableFrames(p, tag));
  return { ok: true, rate: f.rate, channels: ch, frames: got, pcm: got === frames ? pcm : pcm.subarray(0, got * ch), codec: f.codec, trimmedByFact: trimmed, parse: p };
}

// ---------- writers ----------
function riff(fmtBody, extra, data) {
  const parts = [Buffer.from('WAVE', 'latin1'), chunk('fmt ', fmtBody)];
  for (const e of extra) parts.push(e);
  parts.push(chunk('data', data));
  const body = Buffer.concat(parts), head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
function chunk(id, body) {
  const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return body.length & 1 ? Buffer.concat([h, body, Buffer.alloc(1)]) : Buffer.concat([h, body]);
}

// decoded audio (decode() shape) -> one channel: each frame the mean of its channels (rounded), rate and frame count kept
function toMono(dec) {
  const ch = dec.channels, n = Math.floor(dec.pcm.length / ch), pcm = new Int16Array(n);
  if (ch === 1) return { rate: dec.rate, channels: 1, frames: n, pcm: Int16Array.from(dec.pcm.subarray(0, n)) };
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += dec.pcm[i * ch + c]; pcm[i] = clamp16(Math.round(s / ch)); }
  return { rate: dec.rate, channels: 1, frames: n, pcm };
}

function encodePcm16(dec) {
  const ch = dec.channels, n = Math.floor(dec.pcm.length / ch) * ch;
  const f = Buffer.alloc(16);
  f.writeUInt16LE(1, 0); f.writeUInt16LE(ch, 2); f.writeUInt32LE(dec.rate, 4); f.writeUInt32LE(dec.rate * ch * 2, 8); f.writeUInt16LE(ch * 2, 12); f.writeUInt16LE(16, 14);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(dec.pcm[i], i * 2);
  return riff(f, [], data);
}

function imaEncodeNibble(st, sample) {
  const step = IMA_STEP[st.index];
  let diff = sample - st.pred, nib = 0;
  if (diff < 0) { nib = 8; diff = -diff; }
  let s = step;
  if (diff >= s) { nib |= 4; diff -= s; }
  s >>= 1; if (diff >= s) { nib |= 2; diff -= s; }
  s >>= 1; if (diff >= s) nib |= 1;
  imaExpand(st, nib);             // keep the encoder's predictor equal to the decoder's
  return nib;
}

function encodeImaAdpcm(dec, opt = {}) {
  const ch = dec.channels, al = opt.blockAlign || 1024 * ch;
  if ((al - 4 * ch) % (4 * ch)) throw new Error('blockAlign must be 4*channels + a multiple of 4*channels');
  const spb = samplesPerBlockOf(TAG.IMA_ADPCM, ch, al, 4), frames = Math.floor(dec.pcm.length / ch);
  const blocks = Math.max(1, Math.ceil(frames / spb)), data = Buffer.alloc(blocks * al);
  const st = []; for (let c = 0; c < ch; c++) st.push({ pred: 0, index: 0 });
  const at = (i, c) => (i < frames ? dec.pcm[i * ch + c] : 0);
  for (let b = 0; b < blocks; b++) {
    const o = b * al, first = b * spb;
    for (let c = 0; c < ch; c++) {
      st[c].pred = at(first, c);
      data.writeInt16LE(st[c].pred, o + 4 * c); data[o + 4 * c + 2] = st[c].index; data[o + 4 * c + 3] = 0;
    }
    let q = o + 4 * ch, i = first + 1;
    while (q < o + al) {
      for (let c = 0; c < ch; c++) {
        for (let k = 0; k < 4; k++) {
          const lo = imaEncodeNibble(st[c], at(i + 2 * k, c)), hi = imaEncodeNibble(st[c], at(i + 2 * k + 1, c));
          data[q + 4 * c + k] = lo | (hi << 4);
        }
      }
      q += 4 * ch; i += 8;
    }
  }
  const f = Buffer.alloc(20);
  f.writeUInt16LE(TAG.IMA_ADPCM, 0); f.writeUInt16LE(ch, 2); f.writeUInt32LE(dec.rate, 4);
  f.writeUInt32LE(Math.floor((dec.rate * al) / spb), 8); f.writeUInt16LE(al, 12); f.writeUInt16LE(4, 14); f.writeUInt16LE(2, 16); f.writeUInt16LE(spb, 18);
  const fact = Buffer.alloc(4); fact.writeUInt32LE(frames, 0);
  return riff(f, [chunk('fact', fact)], data);
}

module.exports = { parse, decode, toMono, encodePcm16, encodeImaAdpcm, imaExpand, imaExpandMul, imaEncodeNibble, samplesPerBlockOf, alaw, mulaw, TAG, CODEC, IMA_STEP, IMA_INDEX, MS_ADAPT, MS_COEF, GAME_SAFE };
