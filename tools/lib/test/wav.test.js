// wav tests: synthetic fixtures only (no game needed); optional vanilla check when the game is found.
// Standalone: `node tools/lib/test/wav.test.js` prints PASS last. As a module: require('./wav.test')(t, assert) like sdlx.test.js.
// Author: Imperator_Aug (ARSENAL, ia-e858fe8c)
'use strict';
const wav = require('../wav');

function riff(fmtBody, chunks) {           // chunks: [[id, Buffer]]
  const parts = [Buffer.from('WAVE')];
  const ck = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  if (fmtBody) parts.push(ck('fmt ', fmtBody));
  for (const [id, b] of chunks) parts.push(ck(id, b));
  const body = Buffer.concat(parts), h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}
function fmt(tag, ch, rate, bits, align, extra) {
  const b = Buffer.alloc(16 + (extra ? 2 + extra.length : 0));
  b.writeUInt16LE(tag, 0); b.writeUInt16LE(ch, 2); b.writeUInt32LE(rate, 4); b.writeUInt32LE(rate * align, 8); b.writeUInt16LE(align, 12); b.writeUInt16LE(bits, 14);
  if (extra) { b.writeUInt16LE(extra.length, 16); extra.copy(b, 18); }
  return b;
}
const i16 = a => { const b = Buffer.alloc(a.length * 2); a.forEach((v, i) => b.writeInt16LE(v, i * 2)); return b; };

function tests(t, assert) {
  t('wav pcm16 round trip + header', () => {
    const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768, 5]);
    const b = wav.encodePcm16({ rate: 22050, channels: 2, pcm });
    const p = wav.parse(b);
    assert.ok(p.ok); assert.equal(p.fmt.codec, 'pcm'); assert.equal(p.fmt.channels, 2); assert.equal(p.frames, 3); assert.equal(p.dataOffset, 44);
    assert.deepEqual(p.chunks.map(c => c.id), ['fmt ', 'data']);
    assert.deepEqual(p.notes.map(n => n.code).sort(), ['STEREO']);
    const d = wav.decode(b); assert.deepEqual(Array.from(d.pcm), Array.from(pcm)); assert.equal(d.frames, 3);
  });
  t('wav pcm 8/24/32 bit', () => {
    let d = wav.decode(riff(fmt(1, 1, 44100, 8, 1), [['data', Buffer.from([0, 128, 255])]]));
    assert.deepEqual(Array.from(d.pcm), [-32768, 0, 32512]);
    const b24 = Buffer.from([0xFF, 0xFF, 0x7F, 0x00, 0x00, 0x80, 0x00, 0x01, 0x00, 0xFF, 0xFF, 0xFF]);
    d = wav.decode(riff(fmt(1, 1, 44100, 24, 3), [['data', b24]]));
    assert.deepEqual(Array.from(d.pcm), [32767, -32768, 1, -1]);
    const b32 = Buffer.alloc(8); b32.writeInt32LE(0x7FFFFFFF, 0); b32.writeInt32LE(-65536, 4);
    d = wav.decode(riff(fmt(1, 1, 44100, 32, 4), [['data', b32]]));
    assert.deepEqual(Array.from(d.pcm), [32767, -1]);
    assert.ok(wav.parse(riff(fmt(1, 1, 44100, 24, 3), [['data', b24]])).notes.some(n => n.code === 'PCM_BITS' && n.level === 'warn'));
  });
  t('wav float 32/64 + G.711', () => {
    const f = Buffer.alloc(16); [0.5, -1, 1, NaN].forEach((v, i) => f.writeFloatLE(v, i * 4));
    assert.deepEqual(Array.from(wav.decode(riff(fmt(3, 1, 8000, 32, 4), [['data', f]])).pcm), [16384, -32768, 32767, 0]);
    const g = Buffer.alloc(16); [0.25, -0.25].forEach((v, i) => g.writeDoubleLE(v, i * 8));
    assert.deepEqual(Array.from(wav.decode(riff(fmt(3, 1, 8000, 64, 8), [['data', g]])).pcm), [8192, -8192]);
    assert.deepEqual(Array.from(wav.decode(riff(fmt(6, 1, 8000, 8, 1), [['data', Buffer.from([0xD5, 0x55, 0xAA])]])).pcm), [8, -8, 32256]);
    assert.deepEqual(Array.from(wav.decode(riff(fmt(7, 1, 8000, 8, 1), [['data', Buffer.from([0xFF, 0x00, 0x80])]])).pcm), [0, -32124, 32124]);
    assert.ok(wav.parse(riff(fmt(6, 1, 8000, 8, 1), [['data', Buffer.from([0xD5])]])).notes.some(n => n.code === 'CODEC'));
  });
  t('wav extensible PCM subtype', () => {
    const ex = Buffer.alloc(22); ex.writeUInt16LE(16, 0); ex.writeUInt32LE(4, 2);
    Buffer.from('0100000000001000800000aa00389b71', 'hex').copy(ex, 6);
    const b = riff(fmt(0xFFFE, 1, 44100, 16, 2, ex), [['data', i16([7, -7])]]);
    const p = wav.parse(b);
    assert.equal(p.fmt.codec, 'extensible/pcm'); assert.equal(p.fmt.subTag, 1); assert.equal(p.fmt.validBits, 16); assert.equal(p.fmt.channelMask, 4);
    assert.deepEqual(Array.from(wav.decode(b).pcm), [7, -7]);
  });
  // hand-checked IMA block (step table index 0 = 7): header pred 0 index 0, bytes 87 00 4C 00
  //   n7: diff 0+7+3+1 = 11 -> 11, idx 8 | n8: step 16, diff 2 -> 9, idx 7 | n0: step 14 -> +1 = 10, idx 6 | n0: step 13 -> 11, idx 5
  //   nC: step 12, diff 1+12 = 13 -> -2, idx 7 | n4: step 14, diff 1+14 -> 13, idx 9 | n0: step 17 -> 15, idx 8 | n0: step 16 -> 17, idx 7
  const imaFmt = (ch, align, spb) => { const e = Buffer.alloc(2); e.writeUInt16LE(spb, 0); const f = fmt(0x11, ch, 44100, 4, align, e); f.writeUInt32LE(Math.floor(44100 * align / spb), 8); return f; };
  t('wav IMA ADPCM hand-checked block', () => {
    const blk = Buffer.from([0, 0, 0, 0, 0x87, 0x00, 0x4C, 0x00]);
    const d = wav.decode(riff(imaFmt(1, 8, 9), [['data', blk]]));
    assert.ok(d.ok); assert.deepEqual(Array.from(d.pcm), [0, 11, 9, 10, 11, -2, 13, 15, 17]);
    const st = { pred: 32767, index: 88 }; assert.equal(wav.imaExpand(st, 7), 32767); assert.equal(st.index, 88);
    const st2 = { pred: -32768, index: 0 }; assert.equal(wav.imaExpand(st2, 15), -32768); assert.equal(st2.index, 8);
    // ffmpeg's multiply form gives 12 (not 11) on the first nibble: ((2*7+1)*7)>>3 = 13 -> the variants differ
    assert.equal(wav.decode(riff(imaFmt(1, 8, 9), [['data', blk]]), { ima: 'ffmpeg' }).pcm[1], 13);
  });
  t('wav IMA ADPCM stereo layout = two mono streams interleaved per 4 bytes', () => {
    const L = Buffer.from([100, 0, 3, 0, 0x17, 0x9A, 0x32, 0x0F, 0x44, 0x81, 0x7F, 0x00]);
    const R = Buffer.from([0x9C, 0xFF, 10, 0, 0xF0, 0x11, 0x23, 0x34, 0x99, 0x88, 0x77, 0x66]);
    const st = Buffer.concat([L.subarray(0, 4), R.subarray(0, 4), L.subarray(4, 8), R.subarray(4, 8), L.subarray(8, 12), R.subarray(8, 12)]);
    const dl = wav.decode(riff(imaFmt(1, 12, 17), [['data', L]])), dr = wav.decode(riff(imaFmt(1, 12, 17), [['data', R]]));
    const ds = wav.decode(riff(imaFmt(2, 24, 17), [['data', st]]));
    assert.equal(ds.frames, 17); assert.equal(dl.frames, 17);
    for (let i = 0; i < 17; i++) { assert.equal(ds.pcm[i * 2], dl.pcm[i]); assert.equal(ds.pcm[i * 2 + 1], dr.pcm[i]); }
    assert.equal(dr.pcm[0], -100);
  });
  t('wav IMA ADPCM encode -> decode round trip (vanilla profile)', () => {
    const n = 44100, pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / 44100) + 3000 * Math.sin(2 * Math.PI * 3100 * i / 44100));
    const b = wav.encodeImaAdpcm({ rate: 44100, channels: 1, pcm });
    const p = wav.parse(b);
    assert.equal(p.fmt.tag, 0x11); assert.equal(p.fmt.blockAlign, 1024); assert.equal(p.fmt.samplesPerBlock, 2041); assert.equal(p.fmt.cbSize, 2);
    assert.equal(p.fmt.avgBytes, 22125); assert.equal(p.fmt.bits, 4); assert.deepEqual(p.chunks.map(c => c.id), ['fmt ', 'fact', 'data']);
    assert.equal(p.fact.samples, n); assert.equal(p.frames, n); assert.equal(p.chunks[0].size, 20);
    assert.deepEqual(p.notes, []);
    const d = wav.decode(b);
    assert.equal(d.frames, n); assert.ok(d.trimmedByFact);
    let se = 0, ss = 0, mx = 0;
    // the first block starts at step index 0, so the first few samples lag while the step adapts; skip 64
    for (let i = 0; i < n; i++) { const e = d.pcm[i] - pcm[i]; se += e * e; ss += pcm[i] * pcm[i]; if (i >= 64) mx = Math.max(mx, Math.abs(e)); }
    const snr = 10 * Math.log10(ss / se);
    assert.ok(snr > 30, 'snr ' + snr); assert.ok(mx < 1000, 'max err ' + mx);
    // block headers carry the exact input sample
    for (let k = 0; k * 2041 < n; k++) assert.equal(d.pcm[k * 2041], pcm[k * 2041]);
    // stereo encode -> decode
    const sp = new Int16Array(2000); for (let i = 0; i < 1000; i++) { sp[2 * i] = pcm[i]; sp[2 * i + 1] = -pcm[i]; }
    const ds = wav.decode(wav.encodeImaAdpcm({ rate: 44100, channels: 2, pcm: sp }));
    assert.equal(ds.channels, 2); assert.equal(ds.frames, 1000); assert.ok(Math.abs(ds.pcm[2 * 500 + 1] + pcm[500]) < 1500);
  });
  t('wav IMA ADPCM partial last block + fact trim', () => {
    const pcm = new Int16Array(5000).map((_, i) => (i * 37) % 2000 - 1000);
    const full = wav.encodeImaAdpcm({ rate: 44100, channels: 1, pcm });
    const p = wav.parse(full);
    const cut = Buffer.from(full.subarray(0, p.dataOffset + 1024 + 104));   // block 1 + header + 100 body bytes
    cut.writeUInt32LE(1024 + 104, p.dataOffset - 4);
    const q = wav.parse(cut);
    assert.equal(q.frames, 2041 + 1 + 200); assert.ok(q.notes.some(n => n.code === 'FACT'));
    const d = wav.decode(cut); assert.equal(d.frames, 2242);
    assert.deepEqual(Array.from(d.pcm.subarray(0, 2242)), Array.from(wav.decode(full).pcm.subarray(0, 2242)));
  });
  // MS ADPCM hand-checked: coef pair 0 (256,0), delta 16, s1 100, s2 50; bytes 12 F8 (high nibble first)
  //   n1: 100 + 16 = 116, delta 230*16>>8 = 14 -> 16 | n2: 116 + 32 = 148 | nF(-1): 148 - 16 = 132 | n8(-8): 132 - 128 = 4, delta 768*16>>8 = 48
  t('wav MS ADPCM hand-checked block + custom coefs', () => {
    const ext = Buffer.alloc(32); ext.writeUInt16LE(6, 0); ext.writeUInt16LE(7, 2);
    wav.MS_COEF.forEach((c, i) => { ext.writeInt16LE(c[0], 4 + 4 * i); ext.writeInt16LE(c[1], 6 + 4 * i); });
    const blk = Buffer.alloc(9); blk[0] = 0; blk.writeInt16LE(16, 1); blk.writeInt16LE(100, 3); blk.writeInt16LE(50, 5); blk[7] = 0x12; blk[8] = 0xF8;
    const b = riff(fmt(2, 1, 22050, 4, 9, ext), [['data', blk]]);
    const p = wav.parse(b); assert.equal(p.fmt.samplesPerBlock, 6); assert.equal(p.fmt.coefs.length, 7); assert.equal(p.fmt.codec, 'ms-adpcm');
    const d = wav.decode(b); assert.deepEqual(Array.from(d.pcm), [50, 100, 116, 148, 132, 4]);
    // coef index 1 (512,-256): pred = (2*s1 - s2) + n*delta: s1 100 s2 50 n1 -> 150 + 16 = 166; n2 -> (332-100) + 32 = 264
    blk[0] = 1; blk[7] = 0x12; blk[8] = 0x00;
    assert.deepEqual(Array.from(wav.decode(riff(fmt(2, 1, 22050, 4, 9, ext), [['data', blk]])).pcm).slice(2, 4), [166, 264]);
    // stereo: nibbles alternate L/R
    const sb = Buffer.alloc(16); sb[0] = 0; sb[1] = 0; sb.writeInt16LE(16, 2); sb.writeInt16LE(16, 4); sb.writeInt16LE(10, 6); sb.writeInt16LE(-10, 8); sb.writeInt16LE(0, 10); sb.writeInt16LE(0, 12); sb[14] = 0x1F; sb[15] = 0x21;
    const ext2 = Buffer.from(ext); ext2.writeUInt16LE(4, 0);
    const ds = wav.decode(riff(fmt(2, 2, 22050, 4, 16, ext2), [['data', sb]]));
    assert.deepEqual(Array.from(ds.pcm), [0, 0, 10, -10, 26, -26, 58, -10]);
  });
  t('wav toMono: mean of the channels, rate kept, mono untouched (GEN-FIX4)', () => {
    const st = { rate: 48000, channels: 2, frames: 3, pcm: Int16Array.from([100, 300, -32768, -32768, 32767, 32766]) };
    const m = wav.toMono(st);
    assert.strictEqual(m.channels, 1); assert.strictEqual(m.rate, 48000); assert.strictEqual(m.frames, 3);
    assert.deepStrictEqual([...m.pcm], [200, -32768, 32767]);   // seeded: left only would give 100, sum without mean overflows
    const p = wav.parse(wav.encodePcm16(m)); assert.strictEqual(p.fmt.channels, 1);
    assert.deepStrictEqual([...wav.toMono({ rate: 22050, channels: 1, pcm: Int16Array.from([5, -5]) }).pcm], [5, -5]);
  });
  t('wav seeded defects and kinds', () => {
    const good = wav.encodePcm16({ rate: 44100, channels: 1, pcm: new Int16Array(100) });
    const tr = good.subarray(0, 44 + 50);
    const p = wav.parse(tr); assert.ok(p.ok); assert.equal(p.frames, 25); assert.ok(p.notes.some(n => n.code === 'TRUNCATED'));
    assert.equal(wav.decode(tr).frames, 25);
    const kinds = { ogg: Buffer.from('OggS\0\x02\0\0\0\0\0\0\0\0'), mp3: Buffer.from('ID3\x03\0\0\0\0\0\0\0\0\0\0'), flac: Buffer.from('fLaC\0\0\0\x22\0\0\0\0'), notwav: Buffer.from('RIFX\0\0\0\0WAVEfmt '), short: Buffer.from('RIFF') };
    const codes = { ogg: 'OGG_RENAMED', mp3: 'MP3_RENAMED', flac: 'FLAC_RENAMED', notwav: 'NOT_RIFF', short: 'SHORT' };
    for (const k of Object.keys(kinds)) { const q = wav.parse(kinds[k]); assert.equal(q.ok, false); assert.equal(q.kind, k); assert.equal(q.notes[0].code, codes[k]); assert.equal(wav.decode(kinds[k]).ok, false); }
    const sync = Buffer.from([0xFF, 0xFB, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]); assert.equal(wav.parse(sync).kind, 'mp3');
    const nofmt = riff(null, [['data', i16([1, 2])]]); assert.equal(wav.parse(nofmt).kind, 'nofmt'); assert.equal(wav.parse(nofmt).notes[0].code, 'NO_FMT');
    const nodata = riff(fmt(1, 1, 44100, 16, 2), []); assert.equal(wav.parse(nodata).ok, false); assert.equal(wav.parse(nodata).notes[0].code, 'NO_DATA');
    const odd = riff(fmt(1, 1, 32000, 16, 2), [['data', i16([1])]]); assert.ok(wav.parse(odd).notes.some(n => n.code === 'RATE'));
    // MP3 in WAV: not decoded, payload range given
    const mp = riff(fmt(0x55, 1, 44100, 0, 1), [['fact', Buffer.from([0x10, 0, 0, 0])], ['data', Buffer.from([0xFF, 0xFB, 1, 2, 3])]]);
    const dm = wav.decode(mp); assert.equal(dm.ok, false); assert.equal(dm.code, 'MP3_IN_WAV');
    assert.deepEqual(mp.subarray(dm.payload.off, dm.payload.off + dm.payload.len), Buffer.from([0xFF, 0xFB, 1, 2, 3]));
    assert.ok(wav.parse(mp).notes.some(n => n.code === 'CODEC'));
    // smpl loop points, odd chunk padding before data
    const sm = Buffer.alloc(36 + 24); sm.writeUInt32LE(1, 28); sm.writeUInt32LE(7, 36); sm.writeUInt32LE(0, 40); sm.writeUInt32LE(10, 44); sm.writeUInt32LE(90, 48);
    const lp = wav.parse(riff(fmt(1, 1, 44100, 16, 2), [['JUNK', Buffer.from([1, 2, 3])], ['smpl', sm], ['data', i16([5, 6])]]));
    assert.deepEqual(lp.loops, [{ id: 7, type: 0, start: 10, end: 90, fraction: 0, playCount: 0 }]); assert.equal(lp.frames, 2);
    assert.deepEqual(lp.chunks.map(c => c.id), ['fmt ', 'JUNK', 'smpl', 'data']);
  });
  t('wav kinds agree with gui art wavInfo', () => {
    let core; try { core = require('../../gui/ext/art/core'); } catch (e) { return; }   // skip when the gui is absent
    const bufs = [wav.encodePcm16({ rate: 44100, channels: 1, pcm: new Int16Array(4) }), Buffer.from('OggS\0\x02\0\0\0\0\0\0\0\0'), Buffer.from('ID3\x03\0\0\0\0\0\0\0\0\0\0'), Buffer.from('fLaC\0\0\0\x22\0\0\0\0'), Buffer.from('RIFX\0\0\0\0WAVEfmt '), Buffer.from('RIFF'), riff(null, [['data', i16([1])]])];
    for (const b of bufs) assert.equal(wav.parse(b).kind, core.wavInfo(b).kind);
    const st = wav.encodePcm16({ rate: 32000, channels: 2, pcm: new Int16Array(4) });
    assert.equal(core.wavInfo(st).warn.length, 2); assert.deepEqual(wav.parse(st).notes.map(n => n.code).sort(), ['RATE', 'STEREO']);
  });
  t('wav ffmpeg cross-check (optional, skipped when ffmpeg is absent)', () => {
    const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
    const v = cp.spawnSync('ffmpeg', ['-version'], { shell: false });
    if (v.error || v.status !== 0) return;
    const pcm = new Int16Array(6000).map((_, i) => Math.round(9000 * Math.sin(i / 7)));
    const f = path.join(os.tmpdir(), 'wavtest-' + process.pid + '.wav');
    fs.writeFileSync(f, wav.encodeImaAdpcm({ rate: 44100, channels: 1, pcm }));
    try {
      const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 's16le', '-acodec', 'pcm_s16le', '-'], { shell: false, maxBuffer: 1 << 24 });
      const ff = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
      const ours = wav.decode(fs.readFileSync(f), { ima: 'ffmpeg' }).pcm;
      assert.ok(ff.length >= ours.length - 2041, 'ffmpeg length ' + ff.length);
      for (let i = 0; i < Math.min(ff.length, ours.length); i++) assert.equal(ours[i], ff[i], 'sample ' + i);
    } finally { try { fs.unlinkSync(f); } catch (e) { } }
  });
  t('wav vanilla sample (optional, game found)', () => {
    let gdir = process.env.AS2_GAME;
    if (!gdir) try { gdir = require('../gamedir').resolve().dir; } catch (e) { gdir = null; }
    const fs = require('fs'), path = require('path');
    const sp = gdir && path.join(gdir, 'resource', 'sound.pak');
    if (!sp || !fs.existsSync(sp)) return;
    const pak = require('../pak'), L = pak.list(sp);
    let seen = 0;
    for (const e of L) {
      if (seen >= 30 || !/\.wav$/i.test(e.name)) continue;
      const w = e.name, b = pak.read(L, e), p = wav.parse(b);
      if (!p.ok || p.tag !== 0x11 || p.fmt.blockAlign !== 1024) continue;
      seen++;
      const d = wav.decode(b);
      assert.ok(d.ok, w); assert.equal(p.fmt.samplesPerBlock, 2041); assert.equal(d.frames, p.frames);
      // the encoder carries the step index across blocks: decoding block k must end at block k+1's header index
      const nb = Math.floor(p.dataBytes / 1024);
      for (let k = 0; k + 1 < nb; k++) {
        const o = p.dataOffset + k * 1024, st = { pred: b.readInt16LE(o), index: b[o + 2] };
        for (let q = o + 4; q < o + 1024; q++) { wav.imaExpand(st, b[q] & 15); wav.imaExpand(st, b[q] >> 4); }
        assert.equal(st.index, b[o + 1024 + 2], w + ' block ' + k);
      }
    }
    assert.equal(seen, 30, 'vanilla IMA files checked');
  });
}

module.exports = tests;
if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
  tests(t, assert);
  console.log(`${n} ok, ${bad} failed`);
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exitCode = 1;
}
