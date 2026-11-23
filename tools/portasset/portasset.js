#!/usr/bin/env node
// portasset: asset references of a ported mod folder (goh2as2 output) that resolve nowhere (mod + vanilla AS2), and texture files the
// engine cannot use or that shadow a vanilla key. rows PORT-114 115 119 120 139 142 143 144 152 160 161 163 164 167 168 172
// usage: node tools/portasset/portasset.js <mod dir> --game <AS2 dir> [--exe as64|mowas_2|mowas2] [--format text|json] [-q] [--all]
//   files byte-equal to vanilla at the same key are skipped (vanilla ships dead refs in unused files); --all checks them too.
//   <mod dir> = mod folder (its resource/ is used) or a resource dir; loose files and paks under it are the mod.
//   vanilla = <game>/resource + (as64 only) <game>/as64/core/resource + <game>/as64/plus/resource (loose + paks), lowercase keys.
//   --exe: the AS2 build; none = the vfs rule (as64.exe in <game> -> as64, else mowas_2). mowas_2: <game>/resource only (MoW:AS2 mounts
//   no as64 layer, so a ref only those hold is a miss). goh: refused, exit 2 (GoH is the port's source)
// codes:
//   PORTA_TEXTURE_MISSING      .mtl texture name (diffuse, bump, ... quoted, spaces kept) resolves in neither mod nor vanilla (PORT-114, 152, 160)
//   WARN_PORTA_MTL_PATH        a .mdl/.ply names an .mtl that is not at that path but a same-named .mtl sits elsewhere in the mod (PORT-115)
//   PORTA_MODEL_REF_MISSING    a .mdl names a .ply/.anm/.mtl, or a .ply names an .mtl, found nowhere (PORT-119)
//   PORTA_VOL_MISSING          a .mdl {polyhedron "x.vol"} (any key case) found nowhere (PORT-120)
//   PORTA_EBM_FRAME_MISSING    an .ebm {Frame "x"} found nowhere, relative to the .ebm dir, '/' = resource root (PORT-139, 142)
//   PORTA_DDS_FORMAT           a mod .dds with fourcc ATI2 or BC5U (PORT-143)
//   WARN_PORTA_SPRITE_MTL_MISSING a def/inc/set/ext {Sprite "x.mtl"} found nowhere (PORT-172; crash link [I])
//   WARN_PORTA_TEXTURE_CLASH   a mod texture file at a vanilla key with other bytes (PORT-144, 161)
//   PORTA_MAP_ENV_MISSING      a .mi {Environment "x"} with no set/environment/x.set in mod or vanilla (PORT-167)
//   WARN_PORTA_SHADER_PARTIAL  the mod holds some but not all of the AS2 shader/ files (PORT-163)
//   PORTA_LAND_TEXTURE_MISSING a texture of a map/**.mtl resolves nowhere (PORT-164)
//   PORTA_MAP_MTL_MISSING      a map .materials entry "mtlN" with no mtlN.mtl beside it in mod or vanilla (PORT-168)
// Resolution [I]: "$/x" = texture/common/x, "/x" = rooted, else next to the referring file then rooted; ".." collapsed; texture names
// try as written then .ebm .tex .dds .tga .bmp .jpg .png. Keys compared lowercase (latin1 bytes; non-ASCII cp1251 names are not folded).
// Author: Imperator_Aug (ARSENAL, ia-75a0fd96)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const pakset = require('../lib/pakset');
const { createReport } = require('../lib/report');

const IMG_EXT = ['', '.ebm', '.tex', '.dds', '.tga', '.bmp', '.jpg', '.png', '.tga.tex'];
const TEX_FILE = /\.(dds|tga|ebm|tex|bmp|jpg|png)$/;
const TEX_KEY = /\{\s*(diffuse\d*|bump|specular|mask|lightmap|height|envmap|normal|texture)\s+"([^"\r\n]*)"/gi;

const norm = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); };
const dirOf = k => k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '';
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);

function walk(d, out = []) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  es.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); }
  return out;
}
const rootOf = d => fs.existsSync(path.join(d, 'resource')) ? path.join(d, 'resource') : d;

// index of a resource root: key -> { rel, size, crc(), read() }. loose files win over pak entries of the same key.
function indexRoot(root, relPre, into = new Map()) {
  const loose = new Map();
  for (const f of walk(root)) {
    const r = path.relative(root, f).replace(/\\/g, '/');
    if (/\.pak$/i.test(r)) continue;
    let st; try { st = fs.statSync(f); } catch { continue; }
    let buf = null; const read = () => buf || (buf = fs.readFileSync(f));
    loose.set(r.toLowerCase(), { rel: relPre + r, size: st.size, read, crc: () => zlib.crc32(read()) });
  }
  const ps = pakset.open(root, null);
  for (const e of ps.entries) if (!loose.has(e.key) && !into.has(e.key)) into.set(e.key, { rel: relPre + e.key, size: e.size, read: () => pakset.read(e), crc: () => e.ent.crc >>> 0 });
  for (const [k, v] of loose) into.set(k, v);
  return { map: into, close: () => ps.close() };
}

// keep positions; drop ';' comments outside quotes
function stripComments(t) {
  let out = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\n') { q = false; out += c; continue; }
    if (c === '"') q = !q;
    if (!q && c === ';') { while (i < t.length && t[i] !== '\n') { out += t[i] === '\r' ? '\r' : ' '; i++; } i--; continue; }
    out += c;
  }
  return out;
}
const lineAt = (t, i) => { let n = 1; for (let j = 0; j < i; j++) if (t.charCodeAt(j) === 10) n++; return n; };

// .mtl names inside a .ply: a length byte then the name, ending ".mtl"
function plyMtlNames(buf) {
  const out = new Set(), s = buf.toString('latin1'), low = s.toLowerCase();
  let i = -1;
  while ((i = low.indexOf('.mtl', i + 1)) >= 0) {
    const e = i + 4;
    for (let L = 5; L <= Math.min(254, e - 1); L++) {
      if (buf[e - L - 1] !== L) continue;
      const name = s.slice(e - L, e);
      if (/^[\x20-\x7e]+$/.test(name)) { out.add(name); break; }
    }
  }
  return [...out].sort();
}

function check(o) {
  const rep = createReport(), found = [];
  const add = (rel, line, code, msg) => found.push({ rel, line, code, msg });
  const modRoot = rootOf(o.folder), modPre = path.basename(modRoot).toLowerCase() === 'resource' ? 'resource/' : '';
  const mod = indexRoot(modRoot, modPre), M = mod.map;
  const van = new Map(), layers = [], closers = [mod.close], baseShader = new Set();
  const g = o.gameDir;
  // the build: --exe, else the vfs rule (lib/games detect: as64.exe in the folder -> as64). MoW:AS2 mounts neither as64/core nor as64+
  const exe = o.exe || require('../lib/games').exeOf(require('../lib/games').detect(g)) || 'as64';
  const vroots = [path.join(g, 'resource')].concat(exe === 'as64' ? [path.join(g, 'as64', 'core', 'resource'), path.join(g, 'as64', 'plus', 'resource')] : []);
  for (const r of vroots) {
    if (!fs.existsSync(r)) continue;
    const one = indexRoot(r, '', new Map()); closers.push(one.close); layers.push(one.map);
    for (const [k, v] of one.map) van.set(k, v);       // mount order base, as64 core, as64+: the later layer is what the game shows
    if (r === vroots[0]) for (const k of one.map.keys()) if (k.startsWith('shader/')) baseShader.add(k);
  }
  const sameAsVanilla = (k, v) => layers.some(L => { const w = L.get(k); return w && w.size === v.size && w.crc() === v.crc(); });
  const has = k => M.has(k) || van.has(k);
  const cands = (name, dir) => {
    const s = name.trim().toLowerCase().replace(/\\/g, '/');
    const b = s.startsWith('/') ? [s.slice(1)] : s.startsWith('$/') ? ['texture/common/' + s.slice(2)] : [dir ? dir + '/' + s : s, s];
    return [...new Set(b.map(norm))];
  };
  const texOk = (name, dir) => cands(name, dir).some(b => IMG_EXT.some(e => has(b + e)));
  const fileOk = (name, dir) => cands(name, dir).some(b => has(b));
  const mtlByBase = new Map();
  for (const k of M.keys()) if (k.endsWith('.mtl')) { const b = baseOf(k); mtlByBase.set(b, (mtlByBase.get(b) || []).concat(k)); }
  const elsewhere = name => (mtlByBase.get(baseOf(name.trim().toLowerCase().replace(/\\/g, '/'))) || []);
  const txt = v => stripComments(v.read().toString('latin1'));

  let files = 0, same = 0;
  for (const k of [...M.keys()].sort()) {
    const v = M.get(k), dir = dirOf(k);
    try {
      // a file byte-equal to vanilla at its key is not the mod's doing: vanilla ships dead refs in unused files (pz6e/material1.mtl)
      if (!o.all && sameAsVanilla(k, v)) { same++; continue; }
      if (k.endsWith('.mtl')) {
        files++;
        const t = txt(v), seen = new Set();
        for (const m of t.matchAll(TEX_KEY)) {
          const role = m[1].toLowerCase(), name = m[2];
          if (!name.trim() || seen.has(role + '|' + name)) continue;
          seen.add(role + '|' + name);
          if (texOk(name, dir)) continue;
          if (k.startsWith('map/')) add(v.rel, lineAt(t, m.index), 'PORTA_LAND_TEXTURE_MISSING', `${role} "${name}": land texture is in neither the mod nor vanilla, ground draws as checker; carry the map's land textures under their keys`);
          else add(v.rel, lineAt(t, m.index), 'PORTA_TEXTURE_MISSING', `${role} "${name}": no such texture in the mod or vanilla; copy the .dds into the mod at that key (keep spaces and folders as written)`);
        }
      } else if (k.endsWith('.mdl')) {
        files++;
        const t = txt(v);
        for (const m of t.matchAll(/\{\s*polyhedron\s+"([^"\r\n]+)"/gi)) {
          if (!fileOk(m[1], dir)) add(v.rel, lineAt(t, m.index), 'PORTA_VOL_MISSING', `polyhedron "${m[1]}" is not in the mod or vanilla, mission load aborts; copy the .vol next to the .mdl`);
        }
        for (const m of t.matchAll(/"([^"\r\n]+\.(ply|anm|mtl))"/gi)) {
          if (fileOk(m[1], dir)) continue;
          const el = m[2].toLowerCase() === 'mtl' ? elsewhere(m[1]) : [];
          if (el.length) add(v.rel, lineAt(t, m.index), 'WARN_PORTA_MTL_PATH', `"${m[1]}" is not at that path, but the mod holds ${el.sort()[0]}; keep the .mtl at the path the reference names`);
          else add(v.rel, lineAt(t, m.index), 'PORTA_MODEL_REF_MISSING', `"${m[1]}" is in neither the mod nor vanilla, the game aborts at load; copy it from the source unit`);
        }
      } else if (k.endsWith('.ply')) {
        files++;
        for (const n of plyMtlNames(v.read())) {
          if (fileOk(n, dir)) continue;
          const el = elsewhere(n);
          if (el.length) add(v.rel, 0, 'WARN_PORTA_MTL_PATH', `material "${n}" is not at that path, but the mod holds ${el.sort()[0]}; keep the .mtl at the path the mesh names`);
          else add(v.rel, 0, 'PORTA_MODEL_REF_MISSING', `material "${n}" is in neither the mod nor vanilla, the game aborts at load; copy the .mtl next to the mesh`);
        }
      } else if (k.endsWith('.ebm')) {
        files++;
        const t = txt(v);
        for (const m of t.matchAll(/\{\s*frame\s+"([^"\r\n]+)"/gi)) {
          const n = m[1].trim().toLowerCase().replace(/\\/g, '/'), fk = norm(n.startsWith('/') ? n.slice(1) : (dir ? dir + '/' : '') + n);
          const tries = /\.\w+$/.test(baseOf(fk)) ? [fk] : [fk + '.dds', fk + '.ebm', fk + '.tga'];
          if (!tries.some(has)) add(v.rel, lineAt(t, m.index), 'PORTA_EBM_FRAME_MISSING', `Frame "${m[1]}" is in neither the mod nor vanilla, the game dies when the effect first loads; copy the texture or drop the Frame`);
        }
      } else if (/\.(def|inc|set|ext)$/.test(k)) {
        const t = txt(v);
        if (!/sprite/i.test(t)) continue;
        files++;
        for (const m of t.matchAll(/\{\s*sprite\s+"([^"\r\n]+\.mtl)"/gi)) {
          if (!fileOk(m[1], dir)) add(v.rel, lineAt(t, m.index), 'WARN_PORTA_SPRITE_MTL_MISSING', `Sprite "${m[1]}" is in neither the mod nor vanilla, sprite crashes on it; copy the .mtl beside the def`);
        }
      }
      if (k.endsWith('.dds')) {
        files++;
        const b = v.read();
        const cc = b.length >= 88 && b.toString('latin1', 0, 4) === 'DDS ' ? b.toString('latin1', 84, 88) : '';
        if (cc === 'ATI2' || cc === 'BC5U') add(v.rel, 0, 'PORTA_DDS_FORMAT', `DDS format ${cc} is not read by AS2 ("Unknown DDS picture format"); convert to A8R8G8B8 or DXT5`);
      }
      if (k.endsWith('.mi')) {
        files++;
        const t = txt(v);
        for (const m of t.matchAll(/\{\s*environment\s+"([^"\r\n]+)"/gi)) {
          const key = 'set/environment/' + norm(m[1].trim().toLowerCase().replace(/\\/g, '/')) + '.set';
          if (!has(key)) add(v.rel, lineAt(t, m.index), 'PORTA_MAP_ENV_MISSING', `Environment "${m[1]}" has no preset (${key}) in the mod or vanilla, the map gets the default white haze; write the preset under that id`);
        }
      }
      if (/^map\/.+\/\.materials$/.test(k)) {
        files++;
        const t = txt(v);
        for (const m of t.matchAll(/\{\s*"(mtl\d+)"/g)) {
          if (!has(dir + '/' + m[1].toLowerCase() + '.mtl')) add(v.rel, lineAt(t, m.index), 'PORTA_MAP_MTL_MISSING', `material "${m[1]}" has no ${m[1]}.mtl beside it, AS2 reads only mtlN.mtl so that ground layer draws as checker; write ${m[1]}.mtl`);
        }
      }
      if (TEX_FILE.test(k) && van.has(k)) {
        if (!sameAsVanilla(k, v)) add(v.rel, 0, 'WARN_PORTA_TEXTURE_CLASH', `same key as a vanilla texture with other bytes, it replaces the picture for every AS2 user of it; rename the key (e.g. _goh) and its references, or drop it`);
      }
    } catch (e) {
      rep.info(v.rel, 0, 'READ_ERROR', `cannot read, not checked: ${e.message}`);
    }
  }
  // shader files of the mod that no vanilla layer holds byte-equal (as64 core's own 64 sources are equal to the core layer, so they pass)
  const modShader = [...M.keys()].filter(k => k.startsWith('shader/') && !sameAsVanilla(k, M.get(k)));
  if (modShader.length && baseShader.size) {
    const miss = [...baseShader].filter(k => !M.has(k)).sort();
    if (miss.length) add(modPre + 'shader', 0, 'WARN_PORTA_SHADER_PARTIAL', `the mod swaps ${modShader.length} shader files and lacks ${miss.length} of the ${baseShader.size} AS2 ones (first ${miss[0]}); a partial shader folder draws white or fails to compile: ship the whole AS2 shader folder or none`);
  }
  for (const c of closers) c();
  found.sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : a.msg < b.msg ? -1 : a.msg > b.msg ? 1 : 0));
  for (const f of found) rep.add(f.rel, f.line, f.code, f.msg);
  return { rep, files, same };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = { format: 'text' }, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--format') o.format = args[++i];
    else if (a === '--exe') {
      const games = require('../lib/games'), g = games.get(args[++i]);
      if (!g) { console.error('portasset: --exe must be one of as64|mowas_2|mowas2'); process.exit(2); }
      if (g.kind === 'goh') games.refuse('portasset', g, 'the refs of a port must resolve in an AS2 build (as64 or mowas_2); GoH is the port\'s source', 'plan/reports/game-parity/t-port-b.md: n/a (source game)');
      o.exe = g.exe;
    }
    else if (a === '-q') o.q = true; else if (a === '--all') o.all = true; else if (a === '--limits') {} else pos.push(a);
  }
  o.folder = pos[0];
  if (!o.folder || !o.gameDir || !fs.existsSync(o.folder) || !['text', 'json'].includes(o.format)) { console.error('usage: node tools/portasset/portasset.js <mod dir> --game <AS2 dir> [--exe as64|mowas_2] [--format text|json] [-q]'); process.exit(2); }
  const { rep, files, same } = check(o);
  rep.print({ showInfo: !o.q, byCode: true, format: o.format, meta: { tool: 'portasset' } });
  if (o.format === 'text') console.log(`${files} files, ${same} skipped as byte-equal to vanilla`);
  process.exitCode = rep.count ? 1 : 0;
}
module.exports = { check, plyMtlNames, stripComments };
