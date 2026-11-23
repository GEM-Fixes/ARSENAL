#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-d515f163)
'use strict';
// ASSET-1 (PORT-152): texture check on a BUILT mod folder. Every texture name in every .mtl (diffuse, diffuse1, bump, specular, mask, lightmap, height, envmap, normal)
// must resolve in the mod, in vanilla AS2 (--game) or in --also trees; every .dds in the mod must be a format the loader reads (ATI2/BC5U/raw8/DX10 are not).
//   node texcheck.js <mod dir | resource dir> [--game <AS2 dir>] [--also <resource dir>]... [-q]
//   line: <file>:0: MISSING_TEXTURE <role> "<name>" (tried ...)  |  <file>:0: DDS_UNLOADABLE <kind> ...      exit 1 on any, 0 clean, 2 usage.
// ASSET-2: --goh <GoH resource dir> (repeat; base first, Valour after, later wins) adds a word to each MISSING_TEXTURE line, .mtl
//   (same path under resource/, else the one same-named .mtl in a GoH folder of the same name):
//   LEFT_BEHIND = GoH mtl names that map and the file exists in GoH data, the port has none | GOH_LACKS = GoH mtl names no such map, or a file GoH lacks
//   UNKNOWN = source mtl not found/ambiguous or no --goh (never guessed). Still a finding; exit code unchanged.
// name rule (same as goh2as2 closure): "$/x" = texture/common/x; "/x" = rooted; a bare or ../ name = next to the mtl, then rooted. ".." is collapsed. Extensions tried: as written, then ebm tex dds tga bmp jpg png.
// Names with spaces are names ("$/model/m4a3e8/sherman m4a3e8"). Resolution is [I] (engine lookup order not read); a hit on the AS2 side may still be the wrong picture (see the key-clash rename in goh2as2).
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), tc = require('./texconv');
const IMG_EXT = ['', '.ebm', '.tex', '.dds', '.tga', '.bmp', '.jpg', '.png', '.tga.tex'];
const TEX_KEY = /\{\s*(diffuse\d*|bump|specular|mask|lightmap|height|envmap|normal|texture)\s+"([^"\r\n]*)"/gi;
const norm = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); };
const GOOD = new Set(['dxt1', 'dxt2', 'dxt3', 'dxt4', 'dxt5', 'a8r8g8b8', 'x8r8g8b8', 'a8b8g8r8', 'r32f']);
const G = () => require('../lib/gamedir').resolve().dir;   // no --game: the AS2 install (lib/gamedir: env AS2_GAME, as2.json, Steam); none found -> no vanilla keys

function walk(d, out = []) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); }
  return out;
}
const rootOf = d => fs.existsSync(path.join(d, 'resource')) ? path.join(d, 'resource') : d;
// key set of a tree: loose files + every pak under it
function keysOf(dir, into) {
  const root = rootOf(dir);
  for (const f of walk(root)) if (!/\.pak$/i.test(f)) into.add(path.relative(root, f).replace(/\\/g, '/').toLowerCase());
  const ps = pakset.open(root, null); for (const e of ps.entries) into.add(e.key.toLowerCase()); ps.close();
  return into;
}

function candidates(name, dir) {
  const s = name.trim().toLowerCase().replace(/\\/g, '/');
  const bases = s.startsWith('/') ? [s.slice(1)] : s.startsWith('$/') ? ['texture/common/' + s.slice(2)] : [dir + '/' + s, s];
  return bases.map(norm);
}
const resolves = (cands, keys) => cands.some(b => IMG_EXT.some(e => keys.has(b + e)));

//  index: keys of everything, readers .mtl by key (later dir wins)
function gohIndex(dirs) {
  const keys = new Set(), mtl = new Map();
  for (const d of dirs) {
    const root = rootOf(d);
    for (const f of walk(root)) if (!/\.pak$/i.test(f)) { const k = path.relative(root, f).replace(/\\/g, '/').toLowerCase(); keys.add(k); if (k.endsWith('.mtl')) mtl.set(k, () => fs.readFileSync(f, 'latin1')); }
    const ps = pakset.open(root, null);
    for (const e of ps.entries) { const k = e.key.toLowerCase(); keys.add(k); if (k.endsWith('.mtl')) mtl.set(k, () => pakset.read(e).toString('latin1')); }
  }
  const byBase = new Map();
  for (const k of mtl.keys()) { const p = k.split('/'), kk = p.slice(-2).join('/'); byBase.set(kk, (byBase.get(kk) || []).concat(k)); }
  return { keys, mtl, byBase };
}
// -> { word, why }. Source mtl = same path in GoH, else the one same-named mtl in a GoH folder of the same name.
function classify(gi, rel, role) {
  if (!gi) return { word: 'UNKNOWN', why: 'no --goh given' };
  let k = rel.toLowerCase();
  if (!gi.mtl.has(k)) {
    const c = gi.byBase.get(k.split('/').slice(-2).join('/')) || [];
    if (c.length !== 1) return { word: 'UNKNOWN', why: c.length ? 'source mtl ambiguous (' + c.length + ' same-named in GoH)' : 'source mtl not found in GoH' };
    k = c[0];
  }
  let txt; try { txt = gi.mtl.get(k)(); } catch (e) { return { word: 'UNKNOWN', why: 'source mtl unreadable' }; }
  const dir = k.slice(0, k.lastIndexOf('/')), names = [];
  for (const m of txt.matchAll(TEX_KEY)) if (m[1].toLowerCase() === role && m[2].trim()) names.push(m[2]);
  if (!names.length) return { word: 'GOH_LACKS', why: 'GoH mtl names no ' + role };
  for (const n of names) if (resolves(candidates(n, dir), gi.keys)) return { word: 'LEFT_BEHIND', why: 'GoH names "' + n + '" and has the file' };
  return { word: 'GOH_LACKS', why: 'GoH names "' + names[0] + '" but has no such file' };
}

// -> { findings:[{file, code, msg}], mtls, names, missing, unloadable, words, noVanilla }
function check(modDir, opts = {}) {
  const root = rootOf(modDir), mod = new Set(), findings = [];
  const files = walk(root);
  for (const f of files) mod.add(path.relative(root, f).replace(/\\/g, '/').toLowerCase());
  const other = new Set(), gi = opts.goh && opts.goh.length ? gohIndex(opts.goh) : null, words = { LEFT_BEHIND: 0, GOH_LACKS: 0, UNKNOWN: 0 };
  let noVanilla = false;   // true: no --game and no AS2 install found, so a vanilla name shows as MISSING_TEXTURE (the CLI says so on stderr)
  if (opts.game !== null) { const g = opts.game || G(); if (g) keysOf(g, other); else noVanilla = true; }
  for (const a of opts.also || []) keysOf(a, other);
  let mtls = 0, names = 0, missing = 0, unloadable = 0;
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/'), low = rel.toLowerCase();
    if (/\.mtl$/.test(low)) {
      mtls++;
      const dir = low.slice(0, low.lastIndexOf('/')), txt = fs.readFileSync(f, 'latin1'), seen = new Set();
      for (const m of txt.matchAll(TEX_KEY)) {
        const role = m[1].toLowerCase(), name = m[2];
        if (!name.trim() || seen.has(role + '|' + name)) continue;
        seen.add(role + '|' + name); names++;
        const c = candidates(name, dir);
        if (!resolves(c, mod) && !resolves(c, other)) { missing++; const w = classify(gi, rel, role); words[w.word]++; findings.push({ file: 'resource/' + rel, code: 'MISSING_TEXTURE', word: w.word, role, msg: `${role} "${name}" resolves nowhere (tried ${c.join(', ')}) [I: lookup order] ${w.word}: ${w.why}` }); }
      }
    } else if (/\.dds$/.test(low)) {
      let k; try { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(128); const n = fs.readSync(fd, b, 0, 128, 0); fs.closeSync(fd); k = tc.kindOf(b.subarray(0, n)); } catch { k = 'notdds'; }
      if (!GOOD.has(k)) { unloadable++; findings.push({ file: 'resource/' + rel, code: 'DDS_UNLOADABLE', msg: `${k}: the loader reads DXT1-5, A8R8G8B8, X8R8G8B8, A8B8G8R8, R32F only [V]; goh2as2 converts ATI2/BC5U/raw8` }); }
    }
  }
  return { findings, mtls, names, missing, unloadable, words, noVanilla };
}

module.exports = { check, candidates, keysOf, gohIndex, classify };
if (require.main === module) {
  const a = process.argv.slice(2), o = { also: [], goh: [] }; let dir = null, q = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--also') o.also.push(a[++i]); else if (a[i] === '--goh') o.goh.push(a[++i]); else if (a[i] === '-q') q = true;
    else if (a[i].startsWith('-')) { console.error('unknown arg ' + a[i]); process.exit(2); } else dir = a[i];
  }
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node texcheck.js <mod dir|resource dir> [--game AS2 dir] [--also dir]... [--goh GoH dir]... [-q]'); process.exit(2); }
  const r = check(dir, o);
  if (r.noVanilla) console.error('texcheck: no AS2 install found (give --game, env AS2_GAME or as2.json): vanilla textures not read, a vanilla name shows as MISSING_TEXTURE');
  for (const f of r.findings) console.log(`${f.file}:0: ${f.code} ${f.msg}`);
  if (!q || r.findings.length) console.log(`texcheck: ${r.mtls} mtl, ${r.names} texture names, ${r.missing} MISSING_TEXTURE, ${r.unloadable} DDS_UNLOADABLE` + (o.goh.length ? `, LEFT_BEHIND ${r.words.LEFT_BEHIND}, GOH_LACKS ${r.words.GOH_LACKS}, UNKNOWN ${r.words.UNKNOWN}` : ''));
  process.exit(r.findings.length ? 1 : 0);
}
