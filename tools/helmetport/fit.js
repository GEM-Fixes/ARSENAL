// Author: Imperator_Aug (ARSENAL, ia-ffc33ad1)
'use strict';
// helmetport fit + tone: GoH headgear sits low/back on AS2 heads and its diffuse is darker than AS2's.
//   attach [V]: loads the item model, SetWorld(scaling 1,-1,1)
//     = the ROOT bone's own transform is replaced, then Attach(head bone). So an offset on the root bone is lost: it goes on the root's
//     child bones (GoH ships `;{Position 0 0 0}` there), or a new child bone "hp_fit" wraps views that sit on the root.
//   offset units = ply space of the root's child (root orientation diag(1,-1,1) in both games; child bones of GoH heads carry no rotation).
//   auto offset = AS2 helmet1_ger/helmet.ply vs GoH ger_stalhelm/ger_helm_m39.ply: x,y = bbox centre of the dome (z >= top-h, mean over
//     h 1.5 2 2.5 3), z = top. [V data] measured 2026-11-08: +0.42 +0.06 +0.24 (FIT_DEFAULT, used when a reference ply is missing).
//   per shape: helmet = heavy head item, cap = light head item, body = body armour (tone only).
//     helmet auto: the item's own main ply (first VolumeView of the mdl; GoH ref ply when it has no vertices) vs AS2 helmet1_ger,
//       dome-centre offset as above, scale 1 (or --fit-scale).
//     cap auto (capFit): vs AS2 fieldcap1_ger/cap.ply: s = width ratio (y 2..98 pct, clamped 1..1.25: never shrink, the AS2 hair
//       needs a cap at least as wide as the vanilla one), then x = crown FRONT (98 pct x of z >= top-1.5, visor left out) matched,
//       z = top (99 pct) matched, y = centre. Front, not centre: GoH sidecaps are long at the back and hair pokes at the front.
//   tone: diffuse RGB * k (one k or per channel r,g,b), written A8R8G8B8 (loader-safe) with a box mip chain
//     top mip <= TONE_MAX. auto k per channel = median AS2 ref / median GoH ref of the shape's pair (helmet: helmet M40 vs ger_helm_39
//     = 1.54 1.6 2.03 on real data; cap: fieldcap_ger vs ger_cap_fieldcap_43 = 1 1.07 1.29; body uses the helmet pair [I]), each
//     clamped 0.8..2.5. The old luminance-only k (1.64) kept the GoH green-brown cast.
const as = require('../assetsame/assetsame');

const FIT_DEFAULT = [0.42, 0.06, 0.24];   // helmet, scale 1
const FIT_DEFAULTS = { helmet: { off: FIT_DEFAULT, s: 1 }, cap: { off: [0.25, 0.01, -0.32], s: 1.12 } };   // cap: m41 sidecap measured [V data]
const TONE_DEFAULT = 1.6, TONE_MAX = 512;
const TONE_DEFAULTS = { helmet: [1.54, 1.6, 2.03], cap: [1, 1.07, 1.29], body: [1.54, 1.6, 2.03] };
const AH = 'resource/entity/inventory/-equipment/head/', GH = 'entity/inventory/-gear_wearable/head/[germany]/ger_headwear_source/';
const REF = {
  as2Ply: AH + 'helmet1_ger/helmet.ply',
  gohPly: GH + 'ger_stalhelm/ger_helm_m39.ply',
  as2Dds: AH + 'helmet1_ger/helmet m40.dds',
  gohDds: 'texture/common/_hum/ger_headwear/heer/ger_helm_39.dds',
  cap: { as2Ply: AH + 'fieldcap1_ger/cap.ply', gohPly: GH + 'ger_cap_fieldcaps/ger_heer_fieldcap_m43.ply',
    as2Dds: AH + 'fieldcap1_ger/fieldcap_ger.dds', gohDds: 'texture/common/_hum/ger_headwear/heer/ger_cap_fieldcap_43.dds' },
};
REF.cap.as2Mtl = AH + 'fieldcap1_ger/base.mtl';
// cap spec: GoH caps ship {specular ger_sp_null} (black) + power 25; vanilla fieldcap1_ger base.mtl has
// {specular "fieldcap_ger_sp"} + {color "229 229 229 76"} [V data]. --cap-spec ref points the cap mtl at that texture by absolute
// path (AS2 mtls use "/entity/..." refs, 2090 vanilla mtls [V data]) and takes its power; this default is used without --game.
const CAP_SPEC_DEFAULT = { ref: '/entity/inventory/-equipment/head/fieldcap1_ger/fieldcap_ger_sp', power: 76 };
// mtl text -> { spec ref (absolute, resource-rooted), power } of an AS2 mtl at key (resource/...); null when it has no specular
function mtlSpec(text, key) {
  const s = /\{\s*specular\s+"([^"]+)"/i.exec(text), c = /\{\s*color\s+"\s*\d+\s+\d+\s+\d+\s+(\d+)\s*"/i.exec(text);
  if (!s) return null;
  let r = s[1].replace(/\\/g, '/');
  if (!r.startsWith('/') && !r.startsWith('$')) r = '/' + key.replace(/^resource\//, '').replace(/[^/]*$/, '') + r;
  return { ref: r, power: c ? Number(c[1]) : CAP_SPEC_DEFAULT.power };
}
// mtl text -> text with {specular} = ref and the color alpha (spec power) = power; notes empty when nothing to change
function patchSpec(text, ref, power) {
  const notes = []; let t = text;
  const s = /(\{\s*specular\s+")([^"]*)(")/i.exec(t);
  if (s) { if (s[2] !== ref) { t = t.slice(0, s.index) + s[1] + ref + s[3] + t.slice(s.index + s[0].length); notes.push(`specular ${s[2]} -> ${ref}`); } }
  else { const m = /\{\s*material\b[^\n]*\n/i.exec(t); if (m) { const eol = /\r\n/.test(t) ? '\r\n' : '\n'; t = t.slice(0, m.index + m[0].length).replace(/\r?\n$/, '') + eol + `\t{specular \t"${ref}"}` + eol + t.slice(m.index + m[0].length); notes.push(`specular added ${ref}`); } }
  const c = /(\{\s*color\s+"\s*\d+\s+\d+\s+\d+\s+)(\d+)(\s*")/i.exec(t);
  if (c && Number(c[2]) !== power) { t = t.slice(0, c.index) + c[1] + power + c[3] + t.slice(c.index + c[0].length); notes.push(`power ${c[2]} -> ${power}`); }
  else if (!c) { const s2 = /\{\s*specular\s+"[^"]*"\s*\}[^\n]*\n/i.exec(t); if (s2) { const eol = /\r\n/.test(t) ? '\r\n' : '\n'; const at = s2.index + s2[0].length; t = t.slice(0, at) + `\t{color "229 229 229 ${power}"}` + eol + t.slice(at); notes.push(`color added, power ${power}`); } }
  return { text: t, notes };
}
REF.helmet = { as2Ply: REF.as2Ply, gohPly: REF.gohPly, as2Dds: REF.as2Dds, gohDds: REF.gohDds };
REF.body = REF.helmet;

// ---- ply vertex positions (EPLY/BPLY chunk walk as tools/lib/ply.js; position = first 12 bytes of a vertex [V data on 2 helmets])
function plyVerts(buf) {
  const V = [];
  if (buf.length < 4) return V;
  const big = buf.toString('latin1', 0, 4) === 'BPLY';
  if (!big && buf.toString('latin1', 0, 4) !== 'EPLY') return V;
  let p = 4;
  const u8 = () => buf[p++], u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
  const cstr = () => { const b = u8(); return b === 255 ? (u8() | u8() << 8 | u8() << 16) : b; };
  const str = () => { const n = cstr(); p += n; };
  try {
    while (p + 4 <= buf.length) {
      const tag = buf.toString('latin1', p, p + 4); p += 4;
      switch (tag) {
        case 'BNDS': p += 24; break;
        case 'ADJA': p += u32() * 6; break;
        case 'SHDW': p += u32(); break;
        case 'SKIN': { const n = u32(); for (let i = 0; i < n; i++) str(); break; }
        case 'BAS2': p += 48; break;
        case 'BASS': p += 72; break;
        case 'MESH': case 'SUBM': {
          let tex = 0, fl;
          if (tag === 'SUBM') { for (let run = 0; run < 2; run++) for (;;) { const c = u8(); if (c === 0xff) break; p += 2; if ((c >> 4) === 3) tex++; } p += 16; fl = u32(); }
          else { const fvf = u32(); p += 8; fl = u32(); tex = (fvf & 0xF00) >> 8; }
          if (fl & 0x200) p += 4;
          if (fl & 0x400) { const n = cstr(); const name = buf.toString('latin1', p, p + n); p += n; if (name === '') return V; }
          else {
            let n = 0; const t = tex + ((fl & 0x100 && fl & 0x200) ? 1 : 0);
            if (fl & 0x300) n = 1 + (fl & 0x100 ? 1 : 0) + (fl & 0x200 ? 1 : 0); else if (t === 2 || fl & 0x1000) n = 2; else if (t === 1) n = 1;
            for (let i = 0; i < n; i++) str();
          }
          if (fl & 0x800) p += u8();
          break;
        }
        case 'VERT': {
          const c = u32(); let s;
          if (big) s = u32(); else { s = buf.readUInt16LE(p); p += 4; }
          if (s >= 12) for (let i = 0; i < c; i++) { const o = p + i * s; V.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]); }
          p += c * s; break;
        }
        case 'INDX': p += u32() * 2; break;
        case 'IND4': p += u32() * 4; break;
        case 'InfG': p += 24; p += u32() * 2; break;
        case 'MROR': case 'LBEG': case 'LEND': break;
        default: return V;
      }
    }
  } catch { /* truncated: keep what was read */ }
  return V;
}

function domeBox(V, h) {
  let top = -Infinity; for (const v of V) if (v[2] > top) top = v[2];
  const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  for (const v of V) if (v[2] >= top - h) for (let k = 0; k < 2; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
  return { top, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2] };
}
// offset that moves GoH ply `g` onto AS2 ply `a` (both vertex lists); null when either is empty
function autoOffset(a, g) {
  if (!a.length || !g.length) return null;
  const H = [1.5, 2, 2.5, 3], o = [0, 0, 0];
  for (const h of H) { const A = domeBox(a, h), G = domeBox(g, h); o[0] += (A.c[0] - G.c[0]) / H.length; o[1] += (A.c[1] - G.c[1]) / H.length; o[2] = A.top - G.top; }
  return o.map(v => Math.round(v * 100) / 100);
}
const pctl = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p / 100 * a.length)))]; };
function capStats(V) {
  const top = pctl(V.map(v => v[2]), 99), cr = V.filter(v => v[2] >= top - 1.5);
  const y0 = pctl(V.map(v => v[1]), 2), y1 = pctl(V.map(v => v[1]), 98);
  return { top, front: pctl(cr.map(v => v[0]), 98), w: y1 - y0, yc: (y0 + y1) / 2 };
}
// cap `g` onto AS2 vanilla cap `a` -> { off, s } (s fixed when given); null when either is empty
function capFit(a, g, sFixed) {
  if (!a.length || !g.length) return null;
  const A = capStats(a), G = capStats(g), r = v => Math.round(v * 100) / 100;
  const s = sFixed || Math.min(1.25, Math.max(1, A.w / G.w));
  return { s: r(s), off: [r(A.front - s * G.front), r(A.yc - s * G.yc), r(A.top - s * G.top)] };
}

// ---- mdl patch
function scanBlock(s, i) {   // s[i] === '{' -> index after its match (strings and ; comments respected)
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"') { const k = s.indexOf('"', j + 1); j = k < 0 ? s.length : k; continue; }
    if (c === ';') { const k = s.indexOf('\n', j); j = k < 0 ? s.length : k; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return j + 1; }
  }
  return s.length;
}
function children(s, a, b) {   // direct child blocks of the block s[a..b) -> [{ name, start, end }]
  const out = [];
  for (let j = s.indexOf('{', a) + 1; j < b - 1; j++) {
    const c = s[j];
    if (c === '"') { const k = s.indexOf('"', j + 1); j = k < 0 ? b : k; continue; }
    if (c === ';') { const k = s.indexOf('\n', j); j = k < 0 ? b : k; continue; }
    if (c === '{') { const e = scanBlock(s, j), m = /^\{\s*([A-Za-z_0-9]+)/.exec(s.slice(j, j + 64)); out.push({ name: m ? m[1].toLowerCase() : '', start: j, end: e }); j = e - 1; }
  }
  return out;
}
const num = v => String(Math.round(v * 1e5) / 1e5);
const nums = t => (t.replace(/^\{\s*[A-Za-z_0-9]+/, '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
function xform(rows, t, ind) {   // rows 3x3 + t -> {Position} when rows = I, else {Matrix34}
  const ident = rows.every((r, i) => r.every((v, k) => Math.abs(v - (i === k ? 1 : 0)) < 1e-6));
  if (ident) return `{Position ${t.map(num).join(' ')}}`;
  return `{Matrix34\n${rows.concat([t]).map(r => ind + '\t' + r.map(num).join('\t')).join('\n')}\n${ind}}`;
}
// bone block text -> same bone with offset/scale composed onto its own transform (or a new one); -> { text, how }
function patchBone(bt, off, s, ind) {
  const kids = children(bt, 0, bt.length);
  const tr = kids.find(k => k.name === 'position' || k.name === 'matrix34' || k.name === 'orientation');
  let rows = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t = [0, 0, 0];
  if (tr) {
    const n = nums(bt.slice(tr.start, tr.end));
    if (tr.name === 'position') t = n.slice(0, 3);
    else { rows = [n.slice(0, 3), n.slice(3, 6), n.slice(6, 9)]; if (tr.name === 'matrix34') t = n.slice(9, 12); }
  }
  rows = rows.map(r => r.map(v => v * s)); t = t.map((v, k) => v * s + off[k]);
  const x = xform(rows, t, ind);
  if (tr) return { text: bt.slice(0, tr.start) + x + bt.slice(tr.end), how: 'composed ' + tr.name };
  const m = /^\{\s*bone\s+"[^"]*"/i.exec(bt);
  return { text: bt.slice(0, m[0].length) + '\n' + ind + x + bt.slice(m[0].length), how: 'added' };
}
// -> { text, notes: [..] } ; text unchanged (notes empty) when no Skeleton
function patchMdl(text, off, s) {
  const notes = []; const sk = /\{\s*skeleton\b/i.exec(text);
  if (!sk) return { text, notes };
  const se = scanBlock(text, sk.index), edits = [];
  for (const root of children(text, sk.index, se).filter(k => k.name === 'bone')) {
    const kids = children(text, root.start, root.end), bones = kids.filter(k => k.name === 'bone');
    const views = kids.filter(k => k.name === 'volumeview' || k.name === 'lodview');
    const ind = (/\n([\t ]*)[^\n]*$/.exec(text.slice(0, root.start)) || [, ''])[1] + '\t\t';
    for (const b of bones) { const r = patchBone(text.slice(b.start, b.end), off, s, ind); edits.push({ a: b.start, b: b.end, t: r.text }); notes.push('child bone ' + /"([^"]*)"/.exec(text.slice(b.start, b.end))[1] + ': ' + r.how); }
    if (views.length) {   // views on the root: the root transform is replaced at attach -> wrap them in a child bone
      const body = views.map(v => text.slice(v.start, v.end)).join('\n' + ind);
      const wrap = `{bone "hp_fit"\n${ind}${xform([[s, 0, 0], [0, s, 0], [0, 0, s]], off, ind)}\n${ind}${body}\n${ind.slice(1)}}`;
      views.forEach((v, i) => edits.push({ a: v.start, b: v.end, t: i === 0 ? wrap : '' }));
      notes.push(`root ${views.length} view(s) wrapped in bone "hp_fit"`);
    }
  }
  edits.sort((x, y) => y.a - x.a);
  let out = text; for (const e of edits) out = out.slice(0, e.a) + e.t + out.slice(e.b);
  return { text: out, notes };
}

// ---- tone
function medianLum(img) {
  const L = []; const n = img.w * img.h, step = Math.max(1, Math.floor(n / 65536));
  for (let i = 0; i < n; i += step) { const o = i * 4; if (img.rgba[o + 3] === 0) continue; L.push(0.299 * img.rgba[o] + 0.587 * img.rgba[o + 1] + 0.114 * img.rgba[o + 2]); }
  L.sort((a, b) => a - b); return L.length ? L[L.length >> 1] : 0;
}
function medianRgb(img) {
  const C = [[], [], []]; const n = img.w * img.h, step = Math.max(1, Math.floor(n / 65536));
  for (let i = 0; i < n; i += step) { const o = i * 4; if (img.rgba[o + 3] === 0) continue; for (let c = 0; c < 3; c++) C[c].push(img.rgba[o + c]); }
  return C.map(a => a.length ? pctl(a, 50) : 0);
}
// per-channel k [r,g,b] = median AS2 / median GoH, each clamped 0.8..2.5; null when a texture is missing, not decodable or black
function autoTone(as2Buf, gohBuf) {
  const a = as2Buf && as.decodeDds(as2Buf), g = gohBuf && as.decodeDds(gohBuf);
  if (!a || !g) return null;
  const ma = medianRgb(a), mg = medianRgb(g);
  if (mg.some(v => !v)) return null;
  return ma.map((v, c) => Math.round(Math.min(2.5, Math.max(0.8, v / mg[c])) * 100) / 100);
}
function half(img) {
  const w = Math.max(1, img.w >> 1), h = Math.max(1, img.h >> 1), out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) {
    let a = 0, c = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const sx = Math.min(img.w - 1, 2 * x + dx), sy = Math.min(img.h - 1, 2 * y + dy); a += img.rgba[(sy * img.w + sx) * 4 + k]; c++; }
    out[(y * w + x) * 4 + k] = Math.round(a / c);
  }
  return { w, h, rgba: out };
}
// DDS buffer -> toned A8R8G8B8 DDS buffer (or null when not decodable)
function toneDds(buf, k, max = TONE_MAX) {
  let img = as.decodeDds(buf); if (!img) return null;
  img = { w: img.w, h: img.h, rgba: Buffer.from(img.rgba) };
  const K = Array.isArray(k) ? k : [k, k, k];
  for (let i = 0; i < img.w * img.h; i++) for (let c = 0; c < 3; c++) img.rgba[i * 4 + c] = Math.min(255, Math.round(img.rgba[i * 4 + c] * K[c]));
  while (Math.max(img.w, img.h) > max) img = half(img);
  const levels = [img]; while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) levels.push(half(levels[levels.length - 1]));
  const hd = Buffer.alloc(128);
  hd.write('DDS ', 0, 'latin1'); hd.writeUInt32LE(124, 4); hd.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | 0x20000, 8);
  hd.writeUInt32LE(img.h, 12); hd.writeUInt32LE(img.w, 16); hd.writeUInt32LE(img.w * 4, 20); hd.writeUInt32LE(levels.length, 28);
  hd.writeUInt32LE(32, 76); hd.writeUInt32LE(0x41, 80); hd.writeUInt32LE(32, 88);
  hd.writeUInt32LE(0xff0000, 92); hd.writeUInt32LE(0xff00, 96); hd.writeUInt32LE(0xff, 100); hd.writeUInt32LE(0xff000000, 104);
  hd.writeUInt32LE(0x1000 | 0x400000 | 0x8, 108);
  const parts = [hd];
  for (const l of levels) { const o = Buffer.alloc(l.w * l.h * 4); for (let i = 0; i < l.w * l.h; i++) { o[i * 4] = l.rgba[i * 4 + 2]; o[i * 4 + 1] = l.rgba[i * 4 + 1]; o[i * 4 + 2] = l.rgba[i * 4]; o[i * 4 + 3] = l.rgba[i * 4 + 3]; } parts.push(o); }
  return { buf: Buffer.concat(parts), w: img.w, h: img.h, mips: levels.length };
}

// --cap-tone screen: per-channel k measured in game, same edrun frame, GoH caps vs vanilla fieldcap1_ger [V shot]
const CAP_TONE_SCREEN = '1.65,1.75,1.65';
module.exports = { FIT_DEFAULT, FIT_DEFAULTS, TONE_DEFAULT, TONE_DEFAULTS, TONE_MAX, REF, CAP_SPEC_DEFAULT, CAP_TONE_SCREEN, mtlSpec, patchSpec, plyVerts, autoOffset, capFit, capStats, patchMdl, autoTone, toneDds, medianLum, medianRgb };
