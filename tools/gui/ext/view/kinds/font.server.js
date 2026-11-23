// view kind font, server side (.fnt: binary AngelCode BMFont, read as the game reads it: tools/lib/bmfont.js).
// The .font next to it is SDL text and stays in the Editor; the viewer shows its facts.
//   GET /api/x/view/font/info?<ref>       -> { sig, version, blocks, info, common, pages, chars[[id,x,y,w,h,xo,yo,adv,page,chnl]],
//                                             kerning[[first,second,amount]], notes[{code,src,p}], font{name,size,height,style,binary,
//                                             file} | null, pageFiles[{i, name, stem, ref, file, ext, kind, all}] }
//   GET /api/x/view/font/page?<ref>&i=    -> { i, name, file, ext, w, h, png }  page i's texture as the engine finds it
//                                             (/interface/font/<stem>: .ebm/.tex first, else .dds .tga .bmp .jpg .png, the later wins),
//                                             drawn when it is .tga or .dds (png = base64 PNG); else { drawn:false, why }
// The texture lookup uses the game's layered view when the font has a key in a mod (the copy the game loads), else the folder of
// the file. Read only.
// Author: Imperator_Aug (ARSENAL, ia-5cf0a30f)
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../ref'), B = require('../../../../lib/bmfont');

const MAX_FNT = 32 << 20, MAX_TEX = 64 << 20;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const stemOf = n => { const b = String(n).replace(/\\/g, '/'), i = b.lastIndexOf('.'); return i > b.lastIndexOf('/') ? b.slice(0, i) : b; };

// a ref to the file next to this one with another extension
function sibling(q, ext) {
  const sw = s => s.replace(/\.[^./\\:]+$/, '.' + ext);
  if (q.key) return { mod: q.mod, key: sw(q.key) };
  if (q.rel) return { mod: q.mod, rel: sw(q.rel) };
  if (q.path) return Object.assign(q.mod ? { mod: q.mod } : {}, { path: sw(q.path) });
  return null;
}
function fontOf(ctx, q) {
  const s = sibling(q, 'font'); if (!s) return null;
  try { const r = R.readRef(ctx, s, { max: 1 << 20 }); return Object.assign(B.fontFacts(r.buf.toString('utf8')), { file: r.name }); } catch { return null; }
}
// where the engine finds page i: /interface/font/<stem>.<ext>
function pageFile(ctx, q, r, name, i) {
  const stem = stemOf(name), out = { i, name, stem, ref: null, file: null, ext: null, kind: null, all: [] };
  if (q.mod && (r.key || q.key)) {
    let keys = [];
    try { keys = R.listKeys(ctx, q.mod, 'interface/font/' + stem.toLowerCase() + '.'); } catch { keys = []; }
    const pk = B.pickPage(stem, keys);
    out.all = pk.all; out.ext = pk.ext; out.kind = pk.kind;
    if (pk.use) { out.ref = { mod: q.mod, key: pk.use }; out.file = pk.use; }
    return out;
  }
  // a file outside the game's view: its own folder (loose files only)
  if (r.src && r.src.type === 'file') {
    const dir = path.dirname(r.file);
    let names = []; try { names = fs.readdirSync(dir); } catch { names = []; }
    const pk = B.pickPage(path.basename(stem), names);
    out.all = pk.all; out.ext = pk.ext; out.kind = pk.kind;
    if (pk.use) { const f = path.join(dir, pk.use); out.ref = Object.assign(q.mod ? { mod: q.mod } : {}, { path: f }); out.file = pk.use; }
  }
  return out;
}

function load(ctx, url) {
  const q = R.refOfQuery(url), r = R.resolve(ctx, q);
  if (r.size > MAX_FNT) throw bad('The font file is over 32 MB.', 413);
  const buf = R.readRef(ctx, q, { max: MAX_FNT }).buf;
  const o = B.parse(buf);
  o.pageFiles = (o.common ? o.pages.slice(0, Math.max(o.common.pages, 0)) : o.pages).map((p, i) => pageFile(ctx, q, r, p, i));
  for (const pf of o.pageFiles) if (!pf.ref) o.notes.push({ code: 'noTexture', p: { n: pf.stem } });
  for (const n of o.notes) delete n.src;   // the page shows each note by its code; the reader's source lines stay out of the answer
  return { q, o };
}
async function info(url, body, ctx) {
  const { q, o } = load(ctx, url);
  o.font = fontOf(ctx, q);
  return o;
}
async function page(url, body, ctx) {
  const { o } = load(ctx, url);
  const i = Number(url.searchParams.get('i') || 0);
  if (!Number.isInteger(i) || i < 0 || i >= o.pageFiles.length) throw bad('i: a page from 0 to ' + (o.pageFiles.length - 1));
  const pf = o.pageFiles[i];
  if (!pf.ref) return { i, name: pf.name, file: null, drawn: false, why: 'missing' };
  if (pf.ext !== 'tga' && pf.ext !== 'dds') return { i, name: pf.name, file: pf.file, ext: pf.ext, drawn: false, why: 'format' };
  const buf = R.readRef(ctx, pf.ref, { max: MAX_TEX }).buf;
  let im;
  if (pf.ext === 'tga') { try { im = B.tga(buf); } catch (e) { return { i, name: pf.name, file: pf.file, ext: pf.ext, drawn: false, why: 'decode', m: e.message }; } }
  else {
    const d = require('../../../../lib/model/dds').decode(buf, { maxSize: 4096 });
    if (d.error) return { i, name: pf.name, file: pf.file, ext: pf.ext, drawn: false, why: 'decode', m: d.error };
    im = { w: d.width, h: d.height, rgba: Buffer.from(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length) };
  }
  return { i, name: pf.name, file: pf.file, ext: pf.ext, drawn: true, w: im.w, h: im.h, png: B.png(im.rgba, im.w, im.h).toString('base64') };
}

module.exports = {
  exts: ['fnt'],
  routes: { 'GET /api/x/view/font/info': info, 'GET /api/x/view/font/page': page },
  remote: ['GET /api/x/view/font/info', 'GET /api/x/view/font/page'],
};
