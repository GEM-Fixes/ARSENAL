// goh2as2 avicheck <file.avi | GoH key> [...] [--goh <GoH dir>]   (COV-L8K, C27)
//   reads the AVI header (RIFF 'AVI ' > LIST hdrl > avih size, strh vids fccHandler, strf biCompression) and warns when the
//   AS2 menu/mission player is unlikely to play it: [I] AS2 plays XVID up to 1280x720 (cov-l8e: vanilla 720p XVID played;
//   GoH 1080p FMP4 and XVID stayed static). Also called by the goh2as2 port pass on every copied .avi.
// codes: WARN_PORT_AVI_SIZE (over 1280x720)  WARN_PORT_AVI_CODEC (video fourcc not XVID)  WARN_PORT_AVI_HEADER (not a readable AVI)
// Author: Imperator_Aug (ARSENAL, ia-5d204ec4)
'use strict';
const MAX_W = 1280, MAX_H = 720, OK_CODEC = new Set(['xvid']);

// buf: at least the first ~8 KB of the file. returns { w, h, fourcc, handler, frames, usPerFrame } or { err }
function aviInfo(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'AVI ') return { err: 'not RIFF/AVI' };
  const out = {};
  const walk = (s, e) => {
    for (let p = s; p + 8 <= e && p + 8 <= buf.length;) {
      const id = buf.toString('latin1', p, p + 4), sz = buf.readUInt32LE(p + 4), d = p + 8;
      if (id === 'LIST') { const t = buf.toString('latin1', d, d + 4); if (t === 'movi') return; walk(d + 4, Math.min(d + sz, buf.length)); }
      else if (id === 'avih' && d + 40 <= buf.length) { out.usPerFrame = buf.readUInt32LE(d); out.frames = buf.readUInt32LE(d + 16); out.w = buf.readUInt32LE(d + 32); out.h = buf.readUInt32LE(d + 36); }
      else if (id === 'strh' && d + 8 <= buf.length) { out._type = buf.toString('latin1', d, d + 4); if (out._type === 'vids') out.handler = buf.toString('latin1', d + 4, d + 8); }
      else if (id === 'strf' && out._type === 'vids' && d + 20 <= buf.length && out.fourcc === undefined) {
        out.fourcc = buf.toString('latin1', d + 16, d + 20);
        if (!out.w) { out.w = buf.readInt32LE(d + 4); out.h = Math.abs(buf.readInt32LE(d + 8)); }
      }
      p = d + sz + (sz & 1);
    }
  };
  walk(12, buf.length);
  delete out._type;
  if (!out.w && !out.fourcc) return { err: 'no avih/strf in the first ' + buf.length + ' bytes' };
  return out;
}
// list of { code, msg } findings for one AVI
function aviWarn(buf) {
  const i = aviInfo(buf), f = [];
  if (i.err) { f.push({ code: 'WARN_PORT_AVI_HEADER', msg: i.err }); return { info: i, warn: f }; }
  const cc = (i.fourcc || i.handler || '').replace(/\0/g, '').trim();
  if (i.w > MAX_W || i.h > MAX_H) f.push({ code: 'WARN_PORT_AVI_SIZE', msg: `${i.w}x${i.h} is over ${MAX_W}x${MAX_H}: [I] AS2 shows a still frame (cov-l8e: GoH 1080p stayed static)` });
  if (!OK_CODEC.has(cc.toLowerCase())) f.push({ code: 'WARN_PORT_AVI_CODEC', msg: `video fourcc '${cc}' is not XVID: [I] AS2's decoder is xvid_decore` });
  return { info: i, warn: f };
}
function main(a) {
  const fs = require('fs'), ex = require('./extras');
  let goh = null; const files = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '--goh') goh = a[++i]; else if (a[i].startsWith('--')) ex.die('X_BAD_ARG', 'unknown arg ' + a[i]); else files.push(a[i]); }
  if (!files.length) ex.die('X_BAD_ARG', 'usage: as2 goh2as2 avicheck <file.avi | GoH key> [...] [--goh G]');
  let bad = 0;
  for (const f of files) {
    let buf;
    if (fs.existsSync(f)) { const fd = fs.openSync(f, 'r'); buf = Buffer.alloc(65536); const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd); buf = buf.subarray(0, n); }
    else buf = ex.readSrc(f, goh).buf.subarray(0, 65536);
    const r = aviWarn(buf), i = r.info;
    console.log(i.err ? `${f}: ${i.err}` : `${f}: ${i.w}x${i.h} fourcc=${(i.fourcc || '').replace(/\0/g, '')} handler=${(i.handler || '').replace(/\0/g, '')} frames=${i.frames} fps=${i.usPerFrame ? (1e6 / i.usPerFrame).toFixed(2) : '?'}`);
    for (const w of r.warn) { console.log(`  ${w.code} ${w.msg}`); bad++; }
    if (!r.warn.length) console.log('  OK (XVID, <= 720p)');
  }
  process.exitCode = bad ? 1 : 0;
}
module.exports = { aviInfo, aviWarn, main, MAX_W, MAX_H };
