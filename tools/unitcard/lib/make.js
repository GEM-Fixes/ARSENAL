// unitcard/make: plan, compose and write the pictures of one unit.
//   plan(V, u, o) -> { unit, kinds: [{ kind, stem, w, h, frames, files: [{ key, frame }], ebm, had, why }], data: [{ key, from, line, text }], notes, skip }
//     o.kinds = [ids] (default every kind of the unit), o.newPortrait = name (breed {portrait} changed to it; default: a new
//     name when other breeds share the portrait), o.keepPortrait = true (write over the shared name, every breed using it changes)
//   compose(style, subject, o) -> [picture per frame]   o: fit {mode, box, scale, dx, dy, anchor, mirror}, look ('auto'|'colour'|
//     'silhouette'|'grey'), tone [r,g,b], shadow (true|false), outline (true|false)
//   prep(pic, o) -> picture    background removal: o.key 'auto' (only when the picture has no alpha: corner colour) | 'none' | [r,g,b]
//   make(V, u, srcs, o) -> { plan, out: [{ key, buf, frame, kind }], previews: { kind: [dataUrl per frame] }, styles }
//     the class reading of lib/layers.js (with the GIMP cutouts of the class when cached) per kind: modelOf(V, k, group, army, o);
//     o.layoutBy[kind] = Lk layout id (strip32, full: default the unit's own card's, else the most used), o.stripBy[kind] = stem of a strip
//     (Lk.summary(C).strips), o.styleBy[kind] = { look, tone, shadow, match, height, width, baseline, cx } (the class numbers, editable), o.badgeBy[kind] =
//     badge id | 'none' | picture, o.templateBy[kind] = reference stem, o.layersBy[kind] = { background, army, frame, badge, subject }
//     (preview only), o.matchMod = the mod's own style, o.builtIn = no GIMP cutouts
//     o.plate = 'plain' (default: every layer drawn by code from the class numbers, no game pixel) | 'game' (the cutout layers of the
//     game's cards, below); o.plateBy[kind] per kind. srcs[kind] may be an array (GoH infantry card: up to three weapons, stacked)
//     squad in plain style: srcs.squad or o.badgeBy.squad picture = the emblem on the shield; none = a generic mark (srcs.default is
//     not used there: a soldier render is wrong on a squad picture)
//     srcs = { default: picture, <kind>: picture }; o.fits = { default: fit, <kind>: fit }; o.ext = '.tga' (only TGA: vanilla)
//   write(res, mod) -> [{ key, path, bytes }]    files under <mod>/<key>, text files CRLF; refuses a path outside the mod
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-14635cd6)
'use strict';
const fs = require('fs'), path = require('path');
const I = require('./img'), K = require('./kinds'), U = require('./unit'), Ly = require('./layers'), Cu = require('./cutouts'), Lk = require('./look'), Pl = require('./plain');

function prep(p, o) {
  o = o || {};
  if (o.key === 'none') return p;
  if (Array.isArray(o.key)) return I.key(p, o.key, o.tol, o.soft);
  if (!I.hasAlpha(p)) return I.keyEdge(p, o.tol == null ? 36 : o.tol, o.soft == null ? 24 : o.soft);
  return p;
}
// default fit of a kind: vanilla vehicles sit low and fill the box, portraits are cut from the top (head and shoulders)
function fitOf(k, group, f) {
  const d = k.id === 'portrait' ? { mode: 'cover', anchor: [0.5, 0] } : k.id === 'scheme' ? { mode: 'contain', anchor: [0.5, 0.5] } : { mode: 'contain', anchor: [0.5, group === 'infantry' ? 0.5 : 0.62] };
  return Object.assign(d, f || {});
}
function compose(st, subject, o) {
  o = o || {};
  const W = st.w, H = st.h, b = st.box, fit = o.fit || {};
  let s = subject ? prep(subject, o) : null;
  if (s && fit.mirror) s = I.mirror(s);
  const look = o.look && o.look !== 'auto' ? o.look : st.kind === 'scheme' ? 'grey' : st.kind === 'portrait' ? 'colour' : st.look;
  let sub = s ? I.fit(s, b[2], b[3], fit) : null;
  if (sub && look === 'silhouette') sub = I.silhouette(sub, o.tone || st.tone || [72, 66, 56]);
  if (sub && look === 'grey') sub = I.grey(sub);
  if (sub && look === 'colour' && o.shadow !== false && st.shadow) sub = I.shadow(sub, st.shadow.dx, st.shadow.dy, st.shadow.r, st.shadow.op);
  const f0 = I.copy(st.plate[0]);
  if (sub) I.over(f0, sub, b[0], b[1], 1);
  // how much of each pixel is subject (0..1)
  const S0 = new Float32Array(W * H);
  if (sub) for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) { const X = b[0] + x, Y = b[1] + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; S0[Y * W + X] = sub.d[(y * sub.w + x) * 4 + 3] / 255; }
  const paste = (p, f) => { if (!st.mark || !st.mark.frames[f]) return; const z = st.mark.zone; for (let y = 0; y < z[3]; y++) for (let x = 0; x < z[2]; x++) { const si = (y * z[2] + x) * 4, di = ((z[1] + y) * W + z[0] + x) * 4; for (let c = 0; c < 4; c++) p.d[di + c] = st.mark.frames[f].d[si + c]; } };
  const out = [f0];
  for (let f = 1; f < (st.frames || 1); f++) {
    const fx = st.fx[f] || {}, pl = st.plate[f] || st.plate[0], p = I.copy(pl);
    const src = fx.grey ? I.grey(f0) : f0;
    for (let i = 0; i < W * H; i++) {
      const a = S0[i]; if (a <= 0) continue;
      for (let c = 0; c < 3; c++) {
        let v = src.d[i * 4 + c]; if (fx.lut) v = fx.lut[c][v]; if (fx.resid) v += fx.resid[i * 3 + c];
        p.d[i * 4 + c] = I.cl(pl.d[i * 4 + c] * (1 - a) + v * a);
      }
      const av = fx.alut ? fx.alut[f0.d[i * 4 + 3]] : f0.d[i * 4 + 3];
      p.d[i * 4 + 3] = I.cl(pl.d[i * 4 + 3] * (1 - a) + av * a);
    }
    if (fx.outline && o.outline !== false && sub) {
      // the ring just outside the subject, in the frame's outline colour
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (S0[i] > 0.5) continue;
        let m = 0; for (let j = -1; j <= 1; j++) for (let q = -1; q <= 1; q++) { const X = x + q, Y = y + j; if (X >= 0 && Y >= 0 && X < W && Y < H && S0[Y * W + X] > m) m = S0[Y * W + X]; }
        if (m < 0.5) continue;
        const t = (m - S0[i]) * 0.8; for (let c = 0; c < 3; c++) p.d[i * 4 + c] = I.cl(p.d[i * 4 + c] * (1 - t) + fx.outline.rgb[c] * t);
      }
    }
    paste(p, f); out.push(p);
  }
  paste(f0, 0);
  return out;
}

// breeds that name a portrait (to tell whether a picture is shared)
function portraitUsers(V, name) {
  if (!V.memo.portraits) {
    const m = new Map();
    for (const k of V.keys('resource/set/breed/')) {
      if (!/\.set$/.test(k)) continue; const b = V.read(k); if (!b) continue;
      const x = /\{\s*portrait\s+"?([^"}\s]+)"?\s*\}/i.exec(b.toString('latin1')); if (!x) continue;
      const p = x[1].toLowerCase(); if (!m.has(p)) m.set(p, []); m.get(p).push(k);
    }
    V.memo.portraits = m;
  }
  return V.memo.portraits.get(String(name || '').toLowerCase()) || [];
}
const safeStem = s => String(s || '').toLowerCase().replace(/^breed:/, '').replace(/[^a-z0-9_().-]+/g, '_').replace(/^_+|_+$/g, '');

function plan(V, u, o) {
  o = o || {};
  const all = K.list(V.gid), want = o.kinds && o.kinds.length ? new Set(o.kinds) : null;
  const res = { unit: u, kinds: [], data: [], notes: [], skip: [], plate: o.plate === 'game' ? 'game' : 'plain', plateBy: o.plateBy || {} };
  for (const n of K.NOT[K.family(V.gid)] || []) if (!want || want.has(n.id)) res.skip.push({ kind: n.id, why: n.why });
  // portrait name: shared with other breeds -> a name of its own, unless the caller keeps it
  let portrait = u.portrait, newPortrait = null;
  if ((u.kind === 'soldier' || u.kind === 'squad') && u.breedKey) {
    const users = u.portrait ? portraitUsers(V, u.portrait) : [];
    if (o.newPortrait) newPortrait = safeStem(o.newPortrait);
    else if (!o.keepPortrait && (!u.portrait || users.filter(k => k !== u.breedKey).length)) newPortrait = 'uc_' + safeStem(u.breed);
    if (newPortrait && newPortrait !== u.portrait) {
      portrait = newPortrait;
      const from = V.fromMod(u.breedKey) ? 'mod' : 'game';
      const t = (V.read(u.breedKey) || Buffer.alloc(0)).toString('latin1');
      const line = '{portrait "' + newPortrait + '"}';
      const text = /\{\s*portrait\s+"?[^"}\s]*"?\s*\}/i.test(t) ? t.replace(/\{\s*portrait\s+"?[^"}\s]*"?\s*\}/i, line) : t.replace(/\{\s*breed\b/i, m => m + ' ' + line);
      res.data.push({ key: u.breedKey, from, line, text, was: u.portrait || '', shared: users.length });
      if (from === 'game') res.notes.push('The breed file ' + u.breedKey + ' is copied from the game into the mod with one line changed (' + line + '); the copy shadows the game file, so later game updates to it are not seen while the mod is on.');
    }
  } else if ((u.kind === 'soldier' || u.kind === 'squad') && !u.breedKey) res.notes.push('No breed was found for this unit, so the squad picture and the portrait are left out (give the breed: --breed mp/<army>/<name>).');
  const uu = Object.assign({}, u, { portrait });
  for (const k of all) {
    if (want && !want.has(k.id)) continue;
    if (!k.on.includes(u.kind)) { if (want) res.skip.push({ kind: k.id, why: 'not a picture of a ' + u.kind }); continue; }
    const stem = K.stemOf(k, uu);
    if (!stem) { res.skip.push({ kind: k.id, why: k.name === 'portrait' ? 'no soldier picked: the ' + k.id + ' picture is named after the soldier (breed) portrait. Pick the soldier of the buy (breed mp/<army>/<name>, CLI --breed) and make again' : 'no name for it (' + k.name + ')' }); continue; }
    const stems = [stem];
    if (k.also && u.kind === 'vehicle') { const s2 = K.stemOf(Object.assign({}, k, { name: k.also }), uu); if (s2 && s2 !== stem) stems.push(s2); }
    for (const s of stems) {
      const files = K.filesOf(k, s, '.tga');
      const ebmKey = k.frames ? K.SCENE + k.folder + '/' + s + '.ebm' : null;
      const ebm = !!(ebmKey && V.has(ebmKey));
      const had = files.filter(f => V.has(f.key) || V.has(f.key.replace(/\.tga$/, '.dds')) || V.has(f.key.replace(/\.tga$/, '.png'))).map(f => ({ key: f.key, from: V.fromMod(f.key) ? 'mod' : 'game' }));
      // a .dds or .png of the same name would win over the .tga (FMT-04: the last of .dds .tga .bmp .jpg .png)
      const shadow = files.filter(f => V.has(f.key.replace(/\.tga$/, '.png'))).map(f => f.key.replace(/\.tga$/, '.png'));
      if (shadow.length) res.notes.push('A .png of the same name is in the game or mod (' + shadow[0] + '): it wins over the .tga written here (FMT-04). Remove it from the mod, or the new picture is not shown.');
      res.kinds.push({ kind: k.id, stem: s, w: k.w, h: k.h, frames: k.frames, files: ebm ? files.concat([{ key: ebmKey, frame: -1, ebm: true }]) : files, ebm, had, tag: k.tag, use: k.use, miss: k.miss, wants: wantsOf(V, k, u) });
    }
  }
  return res;
}
// what picture a kind needs from the person, before the class is read (make: styles[kind].look.wants, from the class)
function wantsOf(V, k, u) {
  if (K.family(V.gid) === 'as2' && k.id === 'card' && (u.kind === 'squad' || u.kind === 'soldier') && u.group !== 'gun')
    return 'A side picture of the squad main WEAPON (any RGBA, e.g. a side render of the weapon model), not a soldier: the buy card draws it as a flat grey silhouette.';
  if (k.id === 'scheme') return 'A view of the vehicle from above (any RGBA): drawn as a grey line drawing.';
  if (k.id === 'squad') return 'An emblem or badge picture (RGBA) for the shield, not a soldier: the game draws no figure there (plain style draws a generic mark when none is given).';
  if (K.family(V.gid) === 'goh' && k.id === 'card' && (u.kind === 'squad' || u.kind === 'soldier')) return 'Side pictures of the squad weapons (RGBA, up to three: srcs.card may be an array, stacked top to bottom), or one picture.';
  if (k.id === 'portrait') return 'A head-and-shoulders picture of the soldier (RGBA).';
  return 'A colour picture of the unit (RGBA, transparent background, side view; a render at 4x the card size is best).';
}
function ebmText(stem, frames) {
  const l = ['{bitmap']; for (let i = 0; i < frames; i++) l.push('    {frame "' + stem.split('/').pop() + '_0' + i + '.tga"}'); l.push('}');
  return Buffer.from(l.join('\r\n') + '\r\n', 'latin1');
}
// keep each text file's own line ends: a file with CRLF stays CRLF; a new or LF-only text gets CRLF (vanilla data is CRLF)
function crlf(t) { return /\r\n/.test(t) ? t : t.replace(/\n/g, '\r\n'); }

// the class reading of a kind (lib/layers.js), with the GIMP cutouts of that class when they are in the cache (lib/cutouts.js);
// o.matchMod = read the mod's own cards of the class (its style) instead of the game's; o.builtIn = never the GIMP cutouts
function modelOf(V, k, group, army, o) {
  o = o || {};
  const memo = o.modelMemo || (o.modelMemo = new Map()), src = o.matchMod ? 'mod' : 'game';
  const key = V.gid + '|' + k.id + '|' + group + '|' + (army || '') + '|' + src + (o.builtIn ? '|b' : '');
  let m = memo.get(key); if (m) return m;
  m = Ly.analyse(V, k, group, army || '', { source: src });
  if (src === 'mod' && (m.template || !m.bg) && !(m._sets || []).length) { m = Ly.analyse(V, k, group, army || '', {}); m.notes.push('The mod has no cards of this class: the game\'s style is used.'); }
  m.cutter = 'builtin';
  if (!o.builtIn && !m.template && m.bg) {
    const dir = Cu.dirOf(V.gid, k, group, army, { source: m.source, mod: V.mod, root: o.cutoutRoot });
    const set = Cu.load(dir);
    if (set) Cu.apply(m, set); else m.cutoutDir = dir;
  }
  memo.set(key, m); return m;
}
// the clean class of lib/look.js (null when the class is too thin to read: the layer reading is used then)
function lookOf(V, k, group, army, o, stem, kid) {
  let C = null;
  // the card layout: the one asked (o.layoutBy[kind]), else the layout of the unit's own game card, else the class's most used
  const src = o.matchMod ? 'mod' : 'game';
  let layout; try { layout = (o.layoutBy && o.layoutBy[kid]) || (stem && Lk.layoutOfStem(V, k, group, stem, { source: src })) || undefined; } catch (e) { layout = undefined; }
  try { C = Lk.classOf(V, k, group, army, { source: src, layout }); } catch (e) { return null; }
  if (!C || C.none) return null;
  // plates the person painted over in the class .xcf (marked hand-made in the cutout index) win over the read ones
  try {
    const set = Cu.load(Cu.dirOf(V.gid, k, group, army, { source: C.source, mod: V.mod, root: o.cutoutRoot }));
    const F = (set && set.index && set.index.files) || {}, hand = [];
    for (let f = 0; f < C.frames; f++) { const e = F['plate_' + f + '.png']; if (e && e.hand && set.files['plate_' + f + '.png']) { const p = I.decode(fs.readFileSync(set.files['plate_' + f + '.png']), 'p.png'); if (p.w === C.w && p.h === C.h) hand[f] = p; } }
    if (hand.length) { C = Object.assign({}, C, { plate: C.plate.map((p, f) => hand[f] || p), notes: C.notes.concat(['Hand-painted plates of the class .xcf are used.']) }); if (C.roleUsed !== 'badge') C.clean = C.plate; }
  } catch (e) { /* the read plates */ }
  return C;
}
// a picture the page sent for a badge ('none', a badge id, or a picture)
const badgeOf = b => (b && typeof b === 'object' && b.d ? b : typeof b === 'string' && b ? b : undefined);
function make(V, u, srcs, o) {
  o = o || {};
  const p = plan(V, u, o), out = [], previews = {}, styles = {}, layers = {};
  const kinds = p.kinds.slice(); p.kinds = [];
  for (const ki of kinds) {
    const k = K.get(V.gid, ki.kind), mode = (o.plateBy && o.plateBy[ki.kind]) || o.plate || 'plain';
    if (mode !== 'game') { plainKind(V, u, k, ki, srcs, o, p, out, previews, styles); continue; }
    const m = modelOf(V, k, u.group, u.army || '', o);
    // no picture of the class at all: nothing to take the style from, so nothing is made (no made-up art)
    if (m.template && !(m._sets || []).length) { p.skip.push({ kind: ki.kind, why: m.notes.slice(-1)[0] || 'no picture of this class to take the style from' }); continue; }
    const src0 = srcOf(srcs, ki.kind, o), src = src0 ? prep(src0, { key: o.key, tol: o.tol, soft: o.soft }) : null;
    // no picture for this kind: nothing is made (a card with an empty plate is no card)
    if (!src) { p.skip.push({ kind: ki.kind, why: 'No picture given for the ' + k.name + ': give one (or a default picture) to make it.' }); continue; }
    const by = Object.assign({}, o.style || {}, (o.styleBy && o.styleBy[ki.kind]) || {});
    const fit = Object.assign({}, (o.fits && o.fits.default) || {}, (o.fits && o.fits[ki.kind]) || {});
    // squad pictures draw a badge in the shield, not the soldier: the source becomes that badge unless a game badge is picked
    let badge = badgeOf(o.badgeBy && o.badgeBy[ki.kind]);
    if (badge === undefined && m.subject && m.subject.draws === 'badge' && src) badge = src;
    // the clean-plate path (lib/look.js): the class plate without blur, the subject placed by the measured numbers; the older
    // layer reading stays for the built-in cutter, a template card and the layer preview
    const lk = !o.builtIn && !(o.layersBy && o.layersBy[ki.kind]) && !(o.templateBy && o.templateBy[ki.kind]) ? lookOf(V, k, u.group, u.army || '', o, ki.stem, ki.kind) : null;
    if (lk) {
      const lo = { look: by.look === 'auto' ? undefined : by.look, tone: by.tone, shadow: by.shadow, match: by.match, height: by.height, width: by.width, baseline: by.baseline, cx: by.cx,
        scale: fit.scale, dx: fit.dx, dy: fit.dy, mirror: fit.mirror };
      if (badge && typeof badge === 'object') lo.badge = badge; else if (typeof badge === 'string' && lk.cards.some(c => c.stem === badge)) lo.badgeFrom = badge;
      const stp = o.stripBy && o.stripBy[ki.kind]; if (typeof stp === 'string' && lk.cards.some(c => c.stem === stp)) lo.strip = stp;   // a strip of Lk.summary(...).strips
      const r = Lk.compose(lk, src, lo);
      if (!r.frames) { p.skip.push({ kind: ki.kind, why: r.why }); continue; }
      p.kinds.push(ki); ki.w = lk.w; ki.h = lk.h;
      styles[ki.kind] = Object.assign(Ly.summary(m), { cutter: 'look', look: Lk.summary(lk), badgeUsed: lo.badgeFrom || (lo.badge ? 'picture' : '') });
      previews[ki.kind] = r.frames.map(f => I.dataUrl(f));
      for (const f of ki.files) {
        if (f.ebm) { out.push({ key: f.key, buf: ebmText(ki.stem, ki.frames), frame: -1, kind: ki.kind }); continue; }
        const pic = r.frames[Math.min(f.frame, r.frames.length - 1)];
        out.push({ key: f.key, buf: I.tga(pic), frame: f.frame, kind: ki.kind, size: pic.w + 'x' + pic.h });
      }
      continue;
    }
    p.kinds.push(ki);
    const co = Object.assign({ look: by.look, tone: by.tone, shadow: by.shadow, match: by.match, height: by.height, width: by.width, baseline: by.baseline, cx: by.cx,
      scale: fit.scale, dx: fit.dx, dy: fit.dy, mirror: fit.mirror }, { badge, layers: (o.layersBy && o.layersBy[ki.kind]) || undefined, template: o.templateBy && o.templateBy[ki.kind] });
    const r = Ly.compose(m, src, co), fr = r.frames;
    ki.w = m.w; ki.h = m.h;
    styles[ki.kind] = Object.assign(Ly.summary(m), { cutter: m.cutter, cutouts: m.cutouts || null, badgeUsed: r.badge });
    if (!previews[ki.kind]) previews[ki.kind] = fr.map(f => I.dataUrl(f));
    // the layers hidden on the page are a preview choice: the files always carry every layer
    const frw = co.layers ? Ly.compose(m, src, Object.assign({}, co, { layers: undefined })).frames : fr;
    for (const f of ki.files) {
      if (f.ebm) { out.push({ key: f.key, buf: ebmText(ki.stem, ki.frames), frame: -1, kind: ki.kind }); continue; }
      const pic = frw[Math.min(f.frame, frw.length - 1)];
      out.push({ key: f.key, buf: I.tga(pic), frame: f.frame, kind: ki.kind, size: pic.w + 'x' + pic.h });
    }
  }
  for (const d of p.data) out.push({ key: d.key, buf: Buffer.from(crlf(d.text), 'latin1'), frame: -1, kind: 'data', text: true });
  return { plan: p, out, previews, styles };
}
// the picture of a kind: srcs[kind] (an array: up to three stacked), else srcs.default
function srcOf(srcs, kid, o) {
  const v = (srcs && (srcs[kid] || srcs.default)) || null;
  if (!Array.isArray(v)) return v;
  const ps = v.filter(Boolean).map(p => prep(p, { key: o.key, tol: o.tol, soft: o.soft }));
  return ps.length > 1 ? Pl.stack(ps) : ps[0] || null;
}
// the plain class of a kind for a unit (layout as make picks it); the window's styles answer uses it too
function plainClassOf(V, u, k, stem, o) {
  o = o || {}; const src0 = o.matchMod ? 'mod' : 'game';
  let layout; try { layout = (o.layoutBy && o.layoutBy[k.id]) || (stem && Lk.layoutOfStem(V, k, u.group, stem, { source: src0 })) || undefined; } catch (e) { layout = undefined; }
  if (!layout && K.family(V.gid) === 'as2' && k.id === 'card' && u.group === 'gun') layout = 'full';
  return Pl.plainOf(V, k, u.group, u.army || '', { source: src0, layout, cache: o.plainCache, measure: o.plainMeasure, badge: o.badgeBy && o.badgeBy[k.id] === 'none' ? 'none' : undefined });
}
// plain style (lib/plain.js): the plate drawn by code from the class numbers, the subject placed by them (lib/look.js compose)
function plainKind(V, u, k, ki, srcs, o, p, out, previews, styles) {
  const P = plainClassOf(V, u, k, ki.stem, o);
  const by = Object.assign({}, o.style || {}, (o.styleBy && o.styleBy[ki.kind]) || {});
  const fit = Object.assign({}, (o.fits && o.fits.default) || {}, (o.fits && o.fits[ki.kind]) || {});
  let src = null, generic = false;
  const bp = o.badgeBy && o.badgeBy[ki.kind];
  if (P.roleUsed === 'badge') {
    // an emblem on the shield: the picture given for this kind (or a badge picture), never the default soldier render
    const v = bp && typeof bp === 'object' && bp.d ? bp : srcs && srcs[ki.kind] ? srcOf({ [ki.kind]: srcs[ki.kind] }, ki.kind, o) : null;
    src = v ? prep(v, { key: o.key, tol: o.tol, soft: o.soft }) : null;
    if (!src) { src = Pl.chevrons(240, 200); generic = true; }
  } else {
    const v = srcOf(srcs, ki.kind, o); src = v ? prep(v, { key: o.key, tol: o.tol, soft: o.soft }) : null;
  }
  if (!src) { p.skip.push({ kind: ki.kind, why: 'No picture given for the ' + k.name + ': give one (or a default picture) to make it.' }); return; }
  const lo = { look: by.look === 'auto' ? undefined : by.look, tone: by.tone, shadow: by.shadow, match: by.match, height: by.height, width: by.width, baseline: by.baseline, cx: by.cx,
    scale: fit.scale, dx: fit.dx, dy: fit.dy, mirror: fit.mirror };
  if (bp && typeof bp === 'object' && bp.d && P.roleUsed !== 'badge' && P.zones.length) lo.badge = bp;
  const r = Lk.compose(P, src, lo);
  if (!r.frames) { p.skip.push({ kind: ki.kind, why: r.why }); return; }
  p.kinds.push(ki); ki.w = P.w; ki.h = P.h;
  styles[ki.kind] = { cutter: 'plain', plate: 'plain', measured: !!P.plain.measured, generic, look: Lk.summary(P), numbers: Object.assign({}, P.plain, { m: undefined, tf: undefined }) };
  previews[ki.kind] = r.frames.map(f => I.dataUrl(f));
  for (const f of ki.files) {
    if (f.ebm) { out.push({ key: f.key, buf: ebmText(ki.stem, ki.frames), frame: -1, kind: ki.kind }); continue; }
    const pic = r.frames[Math.min(f.frame, r.frames.length - 1)];
    out.push({ key: f.key, buf: I.tga(pic), frame: f.frame, kind: ki.kind, size: pic.w + 'x' + pic.h });
  }
}
function inside(root, p) { const r = path.resolve(root), q = path.resolve(p); return q.toLowerCase().startsWith(r.toLowerCase() + path.sep) ; }
function write(res, mod, o) {
  o = o || {};
  if (!mod) throw new Error('no mod folder given');
  // the folder itself is checked by the caller through lib/writeguard (the game's own folders, the GoH install, Workshop)
  const done = [];
  for (const f of res.out) {
    const p = path.join(mod, ...f.key.split('/'));
    if (!inside(mod, p)) throw new Error('refused: ' + f.key + ' is outside the mod folder');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.buf);
    done.push({ key: f.key, path: p, bytes: f.buf.length, kind: f.kind, frame: f.frame });
  }
  return done;
}
module.exports = { plan, compose, prep, make, modelOf, plainClassOf, write, fitOf, portraitUsers, ebmText, safeStem };
