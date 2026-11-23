// ext view, server routes of the framework (JSON out; errors = Error with .status, as every ext route):
//   GET /api/x/view/bytes?<ref>             -> { name, size, b64 }   the whole file, at most 32 MB (413 above)
//   GET /api/x/view/info?<ref>              -> { name, key, rel, size, ext, kind, magic, text, type, where, layer, inPak, entry, file }
//   GET /api/x/view/hex?<ref>&off=&len=     -> { off, len, size, b64 }   one slice, at most 64 KB (a 2 GB pak entry is paged, not loaded)
// <ref> = mod=&rel= | mod=&key=[&idx=] | [mod=&]path=  (./ref.js). Read only; a phone is asked about every file (ctx.pathOk).
// Author: Imperator_Aug (ARSENAL, ia-b8460d78)
'use strict';
const R = require('./ref');

const MAX_BYTES = 32 * 1024 * 1024, PAGE = 64 * 1024, HEAD = 8192;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
let KINDS = [];   // [{kind, exts, match}] from the kinds' server files (index.js)
const extOf = name => { const b = String(name || '').split('::').pop().split('/').pop(), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
const hex = b => Array.from(b, x => (x < 16 ? '0' : '') + x.toString(16)).join(' ');
const at = (b, i, s) => b.length >= i + s.length && b.toString('latin1', i, i + s.length) === s;

// what the first bytes say (a code; the page words it as view.t.<code>)
function guess(b, ext) {
  if (!b.length) return 'empty';
  if (at(b, 0, 'DDS ')) return 'dds';
  if (b.length >= 8 && b[0] === 0x89 && at(b, 1, 'PNG')) return 'png';
  if (at(b, 0, 'RIFF') && at(b, 8, 'WAVE')) return 'wav';
  if (at(b, 0, 'RIFF') && at(b, 8, 'AVI ')) return 'avi';
  if (at(b, 0, 'OggS')) return 'ogg';
  if (at(b, 0, 'ID3') || (b.length > 1 && b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 && ext === 'mp3')) return 'mp3';
  if (at(b, 0, 'PK\x03\x04') || at(b, 0, 'PK\x05\x06')) return 'zip';
  if (at(b, 0, '8BPS')) return 'psd';
  if (at(b, 0, 'BMF') && b.length > 3 && b[3] === 3) return 'bmfont';
  if (b.length > 2 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (at(b, 0, 'GIF8')) return 'gif';
  if (at(b, 0, 'EANM')) return 'anm';
  if (at(b, 0, 'EPLY')) return 'ply';
  if (at(b, 0, 'EVOL')) return 'vol';
  if (at(b, 0, 'GRASPMAP')) return 'grs';
  if (at(b, 1, 'ps[PS]') || at(b, 1, 'ps[')) return 'pso';
  if (at(b, 1, 'vs[VS]') || at(b, 1, 'vs[')) return 'vso';
  if (at(b, 0, 'MZ') && /^(exe|dll)$/.test(ext)) return 'exe';
  if (at(b, 0, 'BM') && b.length >= 6 && (ext === 'bmp' || b.readUInt32LE(2) > 54)) return 'bmp';
  if (ext === 'tga' && b.length >= 18 && [1, 2, 3, 9, 10, 11].includes(b[2])) return 'tga';
  if ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF)) return 'utf16';
  if (!b.subarray(0, HEAD).includes(0)) return 'text';
  return 'data';
}
// the kind the server would pick: a kind's server file claims it (exts / match), else 'hex' for bytes and null for text.
// The page decides by VIEW.kindOf (the kinds registered there); this is the same idea for callers without a page.
function kindFor(name, key, head) {
  const ext = extOf(name || key);
  for (const k of KINDS) if (k.match) { try { if (k.match(name, key)) return k.kind; } catch { /* a broken match claims nothing */ } }
  for (const k of KINDS) if (ext && k.exts.includes(ext)) return k.kind;
  return head && !head.subarray(0, HEAD).includes(0) ? null : 'hex';
}
async function info(ctx, q) {
  const r = R.resolve(ctx, q);
  const head = await R.readRange(r.src, 0, Math.min(r.size, HEAD));
  const ext = extOf(r.name);
  return { name: r.name, key: r.key || null, rel: r.rel || null, size: r.size, ext, kind: kindFor(r.name, r.key, head), magic: hex(head.subarray(0, 16)),
    text: !head.includes(0), type: guess(head, ext), where: r.where, layer: r.layer || null, inPak: r.inPak || null, entry: r.entry || null, file: r.file || null };
}
function bytes(ctx, q) {
  const r = R.readRef(ctx, q, { max: MAX_BYTES });
  return { name: r.name, size: r.size, b64: r.buf.toString('base64') };
}
async function page(ctx, q, url) {
  const sp = url.searchParams, off = Number(sp.get('off') || 0), len = Number(sp.get('len') || PAGE);
  if (!Number.isFinite(off) || off < 0 || off > Number.MAX_SAFE_INTEGER || Math.floor(off) !== off) throw bad('off: a byte offset from 0 is needed');
  if (!Number.isFinite(len) || len < 1 || len > PAGE || Math.floor(len) !== len) throw bad('len: 1 to ' + PAGE + ' bytes');
  const r = R.resolve(ctx, q);
  if (off > r.size) throw bad('off: past the end of the file (' + r.size + ' bytes)', 416);
  const b = await R.readRange(r.src, off, len);
  return { off, len: b.length, size: r.size, b64: b.toString('base64') };
}

module.exports = {
  routes: {
    'GET /api/x/view/bytes': async (url, body, ctx) => bytes(ctx, R.refOfQuery(url)),
    'GET /api/x/view/info': async (url, body, ctx) => info(ctx, R.refOfQuery(url)),
    'GET /api/x/view/hex': async (url, body, ctx) => page(ctx, R.refOfQuery(url), url),
  },
  setKinds: k => { KINDS = k || []; },
  guess, kindFor, extOf, MAX_BYTES, PAGE,
};
