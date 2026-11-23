#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-469f0986)
'use strict';
// unitbox: is a ported unit the size vanilla units of its class are? Static, no game. Contract unitbox/1.
//   node tools/unitbox/unitbox.js <mod dir> --game <G> [--goh <H>] [--class <c>] [-o out.json]
// box: def {extension "x.mdl"} -> mdl skeleton bones -> {VolumeView|View "p.ply"} -> ply BNDS (6 x f32 min/max, own units 20 per metre [V].
//   Each bone's world transform is composed down the chain from {Position} {Orientation} {Matrix34} (rows = axes, t = last row) [I];
//   the 8 corners of a ply box go through it and the union AABB is taken. Animation poses, LOD > 0, volumes (.vol), scale in the ply itself
//   are not looked at. Axes are kept: L = x, W = y, H = z of the basis frame [I] (vehicle models run forward along x, z up).
// peers: vanilla -vehicle/<class>/<stem>/<stem>.def of the same class, same pick as tools/native (sorted by key, spread evenly, up to 30).
//   ok = each of L W H inside peer min..max widened by 10 percent. Fewer than 3 peers with a box: ok null.
// model not in the mod: with --goh the same def key is read from GoH (loose + paks); else box null, ok null, why "no model".
// mdl in the mod but its plys not (goh2as2 --text-only): with --goh each missing ply is read from GoH at the same key the mdl names;
//   u.src "goh-ply" and why starts "goh source model". A ply present but not EPLY/BPLY+BNDS: named with its first 8 header bytes in why.
// u.src: mod | goh (def+mdl from GoH) | goh-ply (mod mdl, GoH plys).
// Reads only. Output: sorted, no dates, no absolute paths, same input same bytes.
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset');

const J = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const PER_M = 20, WIDEN = 0.1;
const r3 = x => Math.round(x * 1000) / 1000;

// ---- side = a file map (key -> entry), read-only
function sideOf(dir) {
  const { collect } = require('../pairdiff/pairdiff.js');
  const s = collect(dir);
  s.has = k => s.map.has(k);
  s.read = k => { const e = s.map.get(k); if (!e) return null; try { return e.path ? fs.readFileSync(e.path) : pakset.read(e); } catch (e2) { return null; } };
  return s;
}

// ---- tiny SDL tree: {name arg arg {child ...}}; ';' comments; parens ignored
function tokenize(txt) {
  const t = []; let i = 0; const n = txt.length;
  while (i < n) {
    const c = txt[i];
    if (c === ';') { while (i < n && txt[i] !== '\n') i++; }
    else if (c === '"') { let j = i + 1; while (j < n && txt[j] !== '"') j++; t.push({ s: txt.slice(i + 1, j) }); i = j + 1; }
    else if (c === '{' || c === '}') { t.push(c); i++; }
    else if (/\s|[()]/.test(c)) i++;
    else { let j = i; while (j < n && !/[\s{}();"]/.test(txt[j])) j++; t.push({ w: txt.slice(i, j) }); i = j; }
  }
  return t;
}
function tree(txt) {
  const t = tokenize(txt), root = { name: '', args: [], kids: [] }, st = [root];
  for (let i = 0; i < t.length; i++) {
    const k = t[i], top = st[st.length - 1];
    if (k === '{') {
      const nx = t[i + 1], nm = nx && typeof nx === 'object' ? (nx.w || nx.s || '') : '';
      if (nx && typeof nx === 'object') i++;
      const nd = { name: nm.toLowerCase(), args: [], kids: [] }; top.kids.push(nd); st.push(nd);
    } else if (k === '}') { if (st.length > 1) st.pop(); }
    else top.args.push(k.s !== undefined ? { s: k.s } : { w: k.w });
  }
  return root;
}
const nums = nd => nd.args.map(a => (a.w !== undefined ? Number(a.w) : NaN)).filter(x => !isNaN(x));
const strs = nd => nd.args.filter(a => a.s !== undefined).map(a => a.s);

// ---- transforms: R row-major 3x3 (rows = axes), t 3-vector; point p -> p*R + t
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mulR = (a, b) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; };
const apply = (T, p) => [0, 1, 2].map(j => p[0] * T.R[j] + p[1] * T.R[3 + j] + p[2] * T.R[6 + j] + T.t[j]);
function child(par, loc) { // loc in the parent's frame
  const tp = apply({ R: par.R, t: [0, 0, 0] }, loc.t);
  return { R: mulR(loc.R, par.R), t: [tp[0] + par.t[0], tp[1] + par.t[1], tp[2] + par.t[2]] };
}

// ---- ply BNDS: tag at byte 4 (EPLY BNDS ..., BPLY BNDS ...) [V], 6 x f32 min xyz max xyz
function plyBox(buf) {
  if (!buf || buf.length < 32) return null;
  const m = buf.toString('latin1', 0, 4);
  if ((m !== 'EPLY' && m !== 'BPLY') || buf.toString('latin1', 4, 8) !== 'BNDS') return null;
  const v = []; for (let i = 0; i < 6; i++) v.push(buf.readFloatLE(8 + 4 * i));
  if (v.some(x => !isFinite(x))) return null;
  return v;
}

// ---- mdl -> box
// fb: a second side (GoH) the plys are read from when the mod has none at the same key (text-only port: mdl copied, plys not)
function mdlBox(side, mdlKey, fb) {
  const buf = side.read(mdlKey); if (!buf) return { box: null, why: 'mdl unreadable' };
  const root = tree(buf.toString('latin1')), dir = mdlKey.slice(0, mdlKey.lastIndexOf('/') + 1);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], got = 0, miss = 0, fromFb = 0; const badFmt = [];
  const addPly = (name, T) => {
    const k = name.includes('/') ? name.toLowerCase().replace(/^\//, '') : dir + name.toLowerCase();
    let raw = side.read(k), b = plyBox(raw);
    if (!raw && fb) { raw = fb.read(k); b = plyBox(raw); if (b) fromFb++; }
    if (!b) { miss++; if (raw) badFmt.push(k + ' header ' + raw.slice(0, 8).toString('hex')); return; }
    got++;
    for (let c = 0; c < 8; c++) {
      const p = apply(T, [c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]]);
      for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
    }
  };
  const walk = (nd, T) => {
    let loc = { R: I3, t: [0, 0, 0] };
    for (const c of nd.kids) {
      const n = nums(c);
      if (c.name === 'position' && n.length >= 3) loc = { R: loc.R, t: n.slice(0, 3) };
      else if (c.name === 'orientation' && n.length >= 9) loc = { R: n.slice(0, 9), t: loc.t };
      else if (c.name === 'matrix34' && n.length >= 12) loc = { R: n.slice(0, 9), t: n.slice(9, 12) };
    }
    const W = child(T, loc);
    for (const c of nd.kids) {
      if (c.name === 'volumeview' || c.name === 'view') { const s = strs(c); if (s[0] && /\.ply$/i.test(s[0])) addPly(s[0], W); }
      else if (c.name === 'lodview') { const v = c.kids.find(x => x.name === 'view'); const s = v ? strs(v) : []; if (s[0] && /\.ply$/i.test(s[0])) addPly(s[0], W); }
      else if (c.name === 'bone') walk(c, W);
    }
  };
  const idT = { R: I3, t: [0, 0, 0] };
  const sk = []; const find = nd => { for (const c of nd.kids) { if (c.name === 'skeleton') sk.push(c); else if (c.name !== 'bone') find(c); } };
  find(root);
  for (const s of sk) for (const c of s.kids) if (c.name === 'bone') walk(c, idT);
  badFmt.sort(J);
  const fmt = badFmt.length ? '; ' + badFmt.length + ' ply not EPLY/BPLY+BNDS, first ' + badFmt[0] : '';
  if (!got) return { box: null, fb: 0, why: sk.length ? 'no ply with bounds' + (miss ? ' (' + miss + ' missing)' : '') + fmt : 'no skeleton' };
  return { box: [0, 1, 2].map(a => r3((hi[a] - lo[a]) / PER_M)), fb: fromFb, why: (miss ? miss + ' ply missing, box partial' : '') + fmt };
}

// ---- def -> mdl key (def text, then (include ..) files, depth 3)
function findMdl(side, defKey, seen = new Set(), depth = 0) {
  if (seen.has(defKey) || depth > 3) return null; seen.add(defKey);
  const b = side.read(defKey); if (!b) return null;
  const txt = b.toString('latin1'), dir = defKey.slice(0, defKey.lastIndexOf('/') + 1);
  const rel = n => path.posix.normalize(n.startsWith('/') ? n.slice(1) : dir + n).toLowerCase();
  const m = /\{\s*extension\s+"([^"]+\.mdl)"/i.exec(txt);
  if (m) { const k = rel(m[1]); if (side.has(k)) return k; }
  for (const r of txt.matchAll(/\(\s*include\s+"([^"]+)"/gi)) {
    const k = rel(r[1]); if (!/\.(ext|inc)$/.test(k) || !side.has(k)) continue;
    const f = findMdl(side, k, seen, depth + 1); if (f) return f;
  }
  return null;
}

// ---- peers: same pick as native (peerList + spread), box per peer
function peerList(base) {
  const by = {};
  for (const k of base.map.keys()) {
    if (!k.startsWith('entity/-vehicle/') || !k.endsWith('.def')) continue;
    const p = k.split('/'), stem = p[p.length - 1].slice(0, -4);
    if (p.length !== 5 || p[3] !== stem) continue;
    (by[p[2]] = by[p[2]] || []).push(k);
  }
  for (const c of Object.keys(by)) by[c].sort(J);
  return by;
}
const spread = (l, n) => { if (l.length <= n) return l; const o = []; for (let i = 0; i < n; i++) o.push(l[Math.floor(i * l.length / n)]); return o; };

// units: entity/-vehicle/../<stem>/<stem>.def, plus a variant def in another unit's folder (57mm_m1/57mm_m1_early.def) when
// <mod>/gaps/<stem>.gaps.json names it as a ported unit
function unitList(input) {
  const root = fs.existsSync(path.join(input, 'resource')) ? path.join(input, 'resource') : input, out = [];
  const gd = path.join(input, 'gaps');
  const gaps = fs.existsSync(gd) ? new Set(fs.readdirSync(gd).filter(x => /.gaps.json$/i.test(x)).map(x => x.replace(/.gaps.json$/i, '').toLowerCase())) : new Set();
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = f.replace(/\\/g, '/').split('/'), b = p[p.length - 1];
    if (b.endsWith('.def') && p.length >= 2 && (p[p.length - 2] === b.slice(0, -4) || gaps.has(b.slice(0, -4).toLowerCase())) && p[0].toLowerCase() === 'entity' && (p[1] || '').toLowerCase() === '-vehicle') out.push(p.join('/').toLowerCase());
  }
  return out.sort(J);
}

function run(o) {
  const game = sideOf(o.game), mod = sideOf(o.input), goh = o.goh ? sideOf(o.goh) : null;
  const peersBy = peerList(game), cache = new Map(), units = [];
  const peerStat = cls => {
    if (cache.has(cls)) return cache.get(cls);
    const boxes = [];
    for (const k of spread(peersBy[cls] || [], o.peers || 30)) {
      const mk = findMdl(game, k); if (!mk) continue;
      const r = mdlBox(game, mk); if (r.box) boxes.push(r.box);
    }
    const st = { n: boxes.length };
    ['L', 'W', 'H'].forEach((a, i) => { const v = boxes.map(b => b[i]); st[a] = v.length ? [Math.min(...v), Math.max(...v)] : [null, null]; });
    cache.set(cls, st); return st;
  };
  for (const key of unitList(o.input)) {
    const stem = key.slice(key.lastIndexOf('/') + 1, -4);
    const u = { unit: stem, class: null, box: null, peers: { n: 0, L: [null, null], W: [null, null], H: [null, null] }, ok: null, why: '' };
    units.push(u);
    const m = /^entity\/-vehicle\/(?:[^/]+\/)?([^/]+)\//.exec(key);
    u.class = o.class || (m && peersBy[m[1]] ? m[1] : null);
    let src = 'mod', side = mod, mk = findMdl(mod, key);
    if (!mk) {
      if (goh && goh.has(key)) { side = goh; src = 'goh'; mk = findMdl(goh, key); }
      if (!mk) { u.why = 'no model'; continue; }
    }
    const r = mdlBox(side, mk, side === mod ? goh : null);
    u.box = r.box;
    if (!r.box) { u.why = (goh && side === mod ? 'not judged: ' : '') + r.why + (goh && side === mod ? ' (mod and GoH ' + mk + ')' : ''); continue; }
    if (r.fb) { src = 'goh source model (' + r.fb + ' ply from GoH)'; u.src = 'goh-ply'; } else u.src = src;
    const notes = [src]; if (r.why) notes.push(r.why.replace(/^; /, ''));
    if (!u.class) { u.why = notes.concat('no class').join('; '); continue; }
    const ps = peerStat(u.class); u.peers = ps;
    if (ps.n < 3) { u.why = notes.concat('fewer than 3 peers with a box').join('; '); continue; }
    const bad = [];
    ['L', 'W', 'H'].forEach((a, i) => { const lo = ps[a][0] * (1 - WIDEN), hi = ps[a][1] * (1 + WIDEN); if (u.box[i] < lo - 1e-9 || u.box[i] > hi + 1e-9) bad.push(a + ' ' + u.box[i] + ' outside ' + r3(lo) + '..' + r3(hi)); });
    u.ok = !bad.length;
    u.why = notes.concat(bad).join('; ');
  }
  game.close(); mod.close(); if (goh) goh.close();
  units.sort((a, b) => J(a.unit, b.unit));
  return { form: 'unitbox/1', units };
}

function main() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--goh') o.goh = a[++i]; else if (a[i] === '--class') o.class = a[++i];
    else if (a[i] === '-o') o.out = a[++i]; else if (a[i] === '--peers') o.peers = +a[++i]; else if (!o.input) o.input = a[i];
  }
  if (!o.input || !o.game) { console.error('usage: unitbox <mod dir> --game <G> [--goh <H>] [--class c] [-o f.json]'); return 2; }
  const j = run(o), txt = JSON.stringify(j, null, 1) + '\n';
  if (o.out) { fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true }); fs.writeFileSync(o.out, txt); } else process.stdout.write(txt);
  const n = j.units;
  console.error(`unitbox: ${n.length} units, ok ${n.filter(u => u.ok === true).length}, not ok ${n.filter(u => u.ok === false).length}, unknown ${n.filter(u => u.ok === null).length}`);
  return 0;
}
module.exports = { run, mdlBox, findMdl, tree };
if (require.main === module) process.exitCode = main();
