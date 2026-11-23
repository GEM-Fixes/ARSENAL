// view kind picture, server side (contract: ../README.md). Pictures and textures decoded here, sent to the page as RGBA:
//   GET /api/x/view/picture/info?<ref>                      -> { ok, name, key, type, format, width, height, mips, mipSizes, alpha,
//        cube, faces, game:{ok,why}, notes:[{code,msg,p,level}], mdl, frame, size }   header facts only (cheap: the phone, big files)
//   GET /api/x/view/picture/image?<ref>&mip=&max=&face=     -> { ok, name, width, height, format, mips, mip, hasAlpha, cube, faces,
//        face, scaled, srcWidth, srcHeight (the shown level's size before any scaling), fileWidth, fileHeight (the top level),
//        rgba: base64 (width*height*4, top row first), notes, mdl, frame }
//     max = the largest side sent (default 2048, 16..2048: never more than 16 MB of pixels); a bigger picture is box-filtered down
//     here (a DDS first takes the largest mip that fits). PNG and JPEG are passed through: { pass: 'image/png', b64: the file }.
// .dds .tga .bmp .psd .png .jpg are claimed. A .ebm/.tex description is text (the Editor edits it), so it is not claimed; opened as a
// picture (IDE.openView(ref, 'picture')) it shows the frame it names (frame: the key). Decoders: tools/lib/model/{dds,tga,bmp,psd,
// picture,ebm}.js. The verdicts (notes) are the game's own rules (lib/model/picture.js). Read only.
// Game parity: the verdict is the page's game's (ctx.gameId; facts and notes get {game}). AS64 and MoW:AS2 take the same DDS
// formats (DXT1-5, 32-bit). Gates of Hell also loads two-channel BC5: fourCC ATI2, BC5U, BC5S (GHFMT-03 [V]); such a file gets the
// other checks (header, volume, cube faces, mips, size, 4-pixel sides) and an info note bc5goh instead of the 'format' refusal.
// Author: Imperator_Aug (ARSENAL, ia-c9204088)
'use strict';
const R = require('../ref');
const P = require('../../../../lib/model/picture'), E = require('../../../../lib/model/ebm');

const MAX_FILE = 128 * 1024 * 1024, MAX_PASS = 16 * 1024 * 1024, MAX_SIDE = 2048, HEAD = 320 * 1024;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const LEVEL = { dx10: 'bad', format: 'bad', header: 'bad', volume: 'bad', cubefaces: 'bad', mips15: 'bad', big: 'bad', dxt4: 'bad', tgaType: 'bad', tgaPal: 'bad',
  noframe: 'bad', bc5goh: 'info', tgaRtl: 'warn', tga16: 'warn', shadow: 'warn', nomips: 'warn', alphaZero: 'warn', psd: 'info', npot: 'info', wins: 'info', frame: 'info', frames: 'info', cube: 'info' };
const lv = n => Object.assign(n, { level: LEVEL[n.code] || 'info' });
const dirOf = k => String(k || '').replace(/[^/]*$/, '');
const gidOf = ctx => { try { const g = ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : null; return g === 'mowas2' || g === 'goh' ? g : 'as64'; } catch { return 'as64'; } };
// GoH loads BC5 (GHFMT-03 [V], bitmap image dds GetFormat): the 'format' refusal of a BC5 file becomes the remaining checks
const GOH_BC5 = ['ATI2', 'BC5U', 'BC5S'];
// (lib/model/picture facts(.., {game}) may give the GoH verdict itself; either way a BC5 file that GoH loads gets the note bc5goh)
function gameVerdict(f, gid) {
  if (gid !== 'goh' || !f || f.type !== 'dds' || !f.game || GOH_BC5.indexOf(f.fourCC) < 0) return f;
  if (f.game.ok) { f.bc5goh = true; return f; }
  if (f.game.why !== 'format') return f;
  const w = f.width, h = f.height, m = f.mips || 1;
  f.game = !f.headerOk ? { ok: false, why: 'header' } : f.volume ? { ok: false, why: 'volume' } : f.cube && f.faces < 6 ? { ok: false, why: 'cubefaces' }
    : m > 15 ? { ok: false, why: 'mips15' } : w > 8192 || h > 8192 ? { ok: false, why: 'big' } : ((w | h) & 3) ? { ok: false, why: 'dxt4' } : { ok: true };
  if (f.game.ok) f.bc5goh = true;
  return f;
}
function gameNotes(f, o, gid) {
  const out = P.notes(f, Object.assign({ game: gid }, o));
  if (f.bc5goh && !out.some(n => n.code === 'bc5goh')) out.push({ code: 'bc5goh', msg: 'Gates of Hell loads this two-channel BC5 texture (' + f.format + '). AS64 and MoW:AS2 do not: convert it to DXT5 or A8R8G8B8 for them.', p: { f: f.format } });
  return out;
}

// the files next to this one in the game's layered view (same folder only); [] when that cannot be asked (a path ref, a phone refused)
function neighbours(ctx, r) {
  if (!r.mod || !r.key) return [];
  const d = dirOf(r.key);
  try { return R.listKeys(ctx, r.mod, d).filter(k => k.lastIndexOf('/') === d.length - 1); } catch { return []; }
}
const mdlOf = sib => sib.find(k => /\.mdl$/.test(k)) || null;

// a .ebm/.tex: the picture it names (a reference is followed, at most 4 deep) -> { key, buf, notes } | { notes } when not found
function followDesc(ctx, mod, key, buf, depth = 0) {
  const d = E.parse(buf), notes = [];
  const name = d.root === 'reference' ? d.ref : d.frames.length ? d.frames[0].file : null;
  if (d.frames.length > 1) notes.push(P.note('frames', { n: d.frames.length }));
  if (!name) return { notes: notes.concat(P.note('noframe', { f: d.error || '?' })) };
  const fk = /^\$/.test(name) ? null : E.frameKey(key, name);
  if (fk && mod) {
    for (const c of E.candidates(fk)) {   // the game's order: .tex, .ebm, then the last picture extension first (FMT-04)
      let b = null; try { b = R.readKey(ctx, mod, c, { max: MAX_FILE }); } catch (e) { if (e.status === 403) throw e; }
      if (!b) continue;
      if (P.typeOf(c) === 'desc') { if (depth >= 4) break; const n = followDesc(ctx, mod, c, b, depth + 1); return Object.assign(n, { notes: notes.concat(n.notes) }); }
      return { key: c, buf: b, notes: [P.note('frame', { f: c.replace(/^resource\//, '') })].concat(notes) };
    }
  }
  return { notes: notes.concat(P.note('noframe', { f: name })) };
}

async function headOf(r, type) {
  const n = type === 'psd' || type === 'jpg' ? Math.min(r.size, MAX_FILE) : Math.min(r.size, HEAD);
  return n ? R.readRange(r.src, 0, n) : Buffer.alloc(0);
}
function factsOut(type, f, extra) {
  return Object.assign({ type, format: f.format || '', width: f.width || 0, height: f.height || 0, mips: f.mips || 1, mipSizes: f.mipSizes || [[f.width || 0, f.height || 0]],
    alpha: f.alpha || 'no', cube: !!f.cube, faces: f.faces || 1, game: f.game || { ok: true }, error: f.error || null }, extra || {});
}

// what to show for a ref: the file itself, or the frame its description names
async function target(ctx, url, whole) {
  const r = R.resolve(ctx, R.refOfQuery(url)), type = P.typeOf(r.name);
  if (!type) throw bad('Not a picture: ' + r.name, 415);
  if (r.size > MAX_FILE && (whole || type === 'desc')) throw bad('File over ' + (MAX_FILE >> 20) + ' MB: too big to show (' + r.size + ' bytes).', 413);
  let t = { type, key: r.key || null, frame: null, pre: [], sib: neighbours(ctx, r) };
  if (type === 'desc') {
    const fd = followDesc(ctx, r.mod, r.key, R.readAll(r.src));
    t.pre = fd.notes;
    if (!fd.buf) return Object.assign(t, { r, buf: null });
    t = Object.assign(t, { type: P.typeOf(fd.key), key: fd.key, frame: fd.key, buf: fd.buf });
    const fr = Object.assign({}, r, { key: fd.key });
    t.sib = neighbours(ctx, fr);
  } else t.buf = whole ? R.readAll(r.src) : await headOf(r, type);
  return Object.assign(t, { r });
}

async function info(url, body, ctx) {
  const t = await target(ctx, url, false), r = t.r, gid = gidOf(ctx);
  const base = { ok: true, name: r.name, key: r.key || null, size: r.size, frame: t.frame, mdl: mdlOf(t.sib) };
  if (!t.buf) return Object.assign(base, factsOut('desc', { format: '', game: { ok: false, why: 'noframe' } }), { notes: t.pre.map(lv) });
  const f = gameVerdict(Object.assign(P.facts(t.type, t.buf, { game: gid }), { type: t.type }), gid);
  return Object.assign(base, factsOut(t.type, f), { game_id: gid, notes: t.pre.concat(gameNotes(f, { key: t.key, siblings: t.sib }, gid)).map(lv) });
}

async function image(url, body, ctx) {
  const sp = url.searchParams, num = (k, d) => { const v = sp.get(k); if (v == null || v === '') return d; const n = Number(v); if (!Number.isInteger(n) || n < 0) throw bad(k + ': a whole number from 0 is needed'); return n; };
  const max = Math.max(16, Math.min(MAX_SIDE, num('max', MAX_SIDE))), mip = num('mip', null), face = num('face', 0);
  const t = await target(ctx, url, true), r = t.r, gid = gidOf(ctx);
  const base = { ok: true, name: r.name, key: r.key || null, size: r.size, frame: t.frame, mdl: mdlOf(t.sib) };
  if (!t.buf) throw Object.assign(bad(t.pre.map(n => n.msg).join(' ') || 'No picture found.', 404), { notes: t.pre });
  const f = gameVerdict(Object.assign(P.facts(t.type, t.buf, { game: gid }), { type: t.type }), gid);
  const d = P.decode(t.type, t.buf, { mip, face, maxSize: max, game: gid });
  if (d.error) throw bad('This picture cannot be shown: ' + d.error + (f.format ? ' (' + f.format + ')' : ''), 422);
  if (d.alphaAllZero) f.alphaZero = true;
  const notes = t.pre.concat(gameNotes(f, { key: t.key, siblings: t.sib, face: d.face || 0 }, gid)).map(lv);
  const out = Object.assign(base, factsOut(t.type, f), { notes, mip: d.mip || 0, face: d.face || 0, fileWidth: f.width || 0, fileHeight: f.height || 0 });
  if (d.pass) {
    if (t.buf.length > MAX_PASS) throw bad('Picture over 16 MB: too big to send.', 413);
    return Object.assign(out, { pass: d.pass, b64: t.buf.toString('base64'), hasAlpha: f.alpha === 'yes', scaled: false, srcWidth: f.width, srcHeight: f.height });
  }
  const px = Buffer.from(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length);
  return Object.assign(out, { width: d.width, height: d.height, srcWidth: d.srcWidth || d.width, srcHeight: d.srcHeight || d.height, scaled: !!d.scaled,
    hasAlpha: !!d.alphaUsed, rgba: px.toString('base64') });
}

module.exports = {
  exts: ['dds', 'tga', 'bmp', 'psd', 'png', 'jpg', 'jpeg'],
  routes: { 'GET /api/x/view/picture/info': info, 'GET /api/x/view/picture/image': image },
  remote: ['GET /api/x/view/picture/info', 'GET /api/x/view/picture/image'],
};
