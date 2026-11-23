#!/usr/bin/env node
// defcheck: a mod's .def bone blocks, light extenders and set/stuff file names against the mdl files they name. rows PORT-138 PORT-146 PORT-147 PORT-153 PORT-166 PORT-171 PORT-186
// usage: node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--format json] [-q] [--summary] [--no-rc]
//   --no-rc is accepted (no .lintrc is read); an unknown option or a missing mod folder: one usage line, exit 2
//        node tools/defcheck/defcheck.js --vfs --game <dir> [--exe ..] [--mods a,b]   (whole mounted vfs, the vanilla run)
// --exe: the vfs view of that game (lib/games; mowas_2 = no as64/core); none = as before (as64.exe first). --exe goh, or a --game folder
//   that is a GoH game (binaries/x64/call_to_arms.exe) with no --exe, refuses (exit 2, one line):
//   the checks are the AS2 engine readers, a GoH def is the port source (PORT-171)
// codes (all crash class, [V] rows):
//   BONE_LIMITS_ONE_NUMBER (PORT-138)  {limits N} with one number on a revolute/prizmatic bone (mdl bone, or def {bone} block whose mdl bone has that type)
//   STUFF_FILE_EXT (PORT-146)          a file under set/stuff whose extension is not a stuff one (x.weapon.off): the engine reads it anyway
//   DEF_BONE_NOT_IN_MDL (PORT-147 PORT-153 PORT-166)  entity-level def {bone "x"} block, x absent from the mdl the def's {Extension} names
//   LIGHT_EXTENDER_GOH_FORM (PORT-171) {extender "light"} with a child other than lamp/lightfx/breakfx/check_operatable (GoH {preset ...})
//   LAMP_GLASS_BONE_MISSING (PORT-186) {extender "light"} {lamp "N"} and the mdl has no lamp_glassN bone (a blast that breaks the lamp crashes)
// scope [I]: only the def's own text is read (macros and includes are not expanded); the mdl is the def's {Extension "*.mdl"} resolved like an
//   engine relative/absolute name, read from the mod folder (loose or its paks) then the vfs (--game). An mdl that includes other files is skipped.
// Author: Imperator_Aug (ARSENAL, ia-3076cb22)
require('../lib/help')(__filename);
const path = require('path');
const sdl = require('../lib/sdl');
const sdlset = require('../lib/sdlset');
const names = require('../lib/names');
const games = require('../lib/games');
const { createReport } = require('../lib/report');

const lc = s => String(s == null ? '' : s).toLowerCase();
const TYPED = new Set(['revolute', 'prizmatic', 'socket', 'planarsocket']);
const ONE_BAD = new Set(['revolute', 'prizmatic']);   // these read bare or 2 numbers
const STUFF_EXT = new Set(['', 'ammo', 'weapon', 'grenade', 'hand', 'mine', 'pattern', 'presets', 'fsm']);   // vanilla set/stuff extensions [V survey]
const LIGHT_KIDS = new Set(['lamp', 'lightfx', 'breakfx', 'check_operatable']);   //
const parseText = buf => sdl.parseLines(buf.toString('latin1').split('\n'));
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const str = n => { const s = n.vals.filter(t => t.t === 's'); return s.length ? s[s.length - 1].v : (n.vals.length ? n.vals[n.vals.length - 1].v : null); };

// mdl -> { bones: Map lcName -> type, limits: [{line, bone, type, n}] } or null (opaque: includes / external skeleton)
function readMdl(buf) {
  const text = buf.toString('latin1');
  if (/\(\s*include\b/i.test(text)) return null;
  const root = parseText(buf);
  const bones = new Map(), limits = [];
  let opaque = false;
  (function walk(n, inVol) {
    for (const c of n.kids) {
      const nm = lc(c.name);
      if (nm === 'skeleton' && c.vals.some(t => t.t === 's')) opaque = true;
      if (nm === 'bone' && !inVol) {
        const name = str(c), w = c.vals.find(t => t.t === 'w'), type = w && TYPED.has(lc(w.v)) ? lc(w.v) : '';
        if (name != null && !bones.has(lc(name))) bones.set(lc(name), type);
        for (const l of c.kids) if (lc(l.name) === 'limits') limits.push({ line: l.line, bone: name, type, n: l.vals.length });
      }
      walk(c, inVol || nm === 'volume');
    }
  })(root, false);
  return opaque ? null : { bones, limits };
}

function check(opts) {
  const out = createReport(), found = [];
  const rep = { add: (file, line, code, msg) => found.push({ file, line, code, msg }) };   // buffered: sorted by file, line, code at the end
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.dirname(path.resolve(opts.folder)).toLowerCase() === path.resolve(opts.gameDir, 'mods').toLowerCase()) mods = [names.normalize(path.basename(path.resolve(opts.folder)))];   // the vfs keys mods by the lowercase folder name (VFS-12)
  const src = sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: games.exeOf(opts.exe) || undefined });
  const items = new Map();   // key -> display file
  if (opts.vfs) { if (src.v) for (const k of src.v.files.keys()) items.set(k, k); }
  else {
    for (const [k, f] of src.local) if (!src.hasRes || k.startsWith('resource/')) items.set(k, path.relative(src.folder, f).split(path.sep).join('/'));
    for (const [k, r] of src.packed()) if (!items.has(k)) items.set(k, r.file);
  }
  const keys = [...items.keys()].sort();
  const mdlCache = new Map();
  const mdlOf = key => {
    if (mdlCache.has(key)) return mdlCache.get(key);
    let m = null; try { const b = src.get(key); if (b) m = readMdl(b); } catch (e) { m = null; }
    mdlCache.set(key, m); return m;
  };
  let files = 0;
  for (const key of keys) {
    const file = items.get(key), ext = extOf(key);
    // PORT-146
    if (key.startsWith('resource/set/stuff/') && !key.includes('/_settings/') && !STUFF_EXT.has(ext)) {
      rep.add(file, 0, 'STUFF_FILE_EXT', `set/stuff reads every file whatever its extension: "${key.slice(key.lastIndexOf('/') + 1)}" (.${ext}) is still loaded as a stuff and crashes the load; move it out of set/ to disable it (PORT-146)`);
    }
    if (ext !== 'def' && ext !== 'ext' && ext !== 'inc' && ext !== 'mdl') continue;
    let buf; try { buf = src.get(key); } catch (e) { buf = null; }
    if (!buf || (buf.includes(0) && ext === 'mdl')) continue;
    files++;
    // PORT-138 in a mod mdl
    if (ext === 'mdl') {
      const m = mdlOf(key);
      if (m) for (const l of m.limits) if (l.n === 1 && ONE_BAD.has(l.type)) rep.add(file, l.line, 'BONE_LIMITS_ONE_NUMBER', `{limits} with one number on ${l.type} bone "${l.bone}": "Number expected!" stops the whole load; give it two numbers {limits min max} or none (PORT-138)`);
      continue;
    }
    const root = parseText(buf);
    // PORT-171: any {extender "light"} in def/ext/inc text
    (function walk(n) {
      for (const c of n.kids) {
        if (lc(c.name) === 'extender' && lc(str(c)) === 'light') {
          for (const x of c.kids) if (!LIGHT_KIDS.has(lc(x.name))) rep.add(file, x.line, 'LIGHT_EXTENDER_GOH_FORM', `{extender "light"} holds {${x.name || ''}}: as64 reads only {lamp "N"} {lightfx "x"} {breakfx} {check_operatable} and stops the load on "unexpected token"; rewrite the GoH {preset ...} form or drop the extender (PORT-171)`);
        }
        walk(c);
      }
    })(root);
    if (ext !== 'def') continue;
    for (const top of root.kids) {
      const exts = top.kids.filter(c => lc(c.name) === 'extension').map(c => ({ c, v: str(c) })).filter(x => x.v && /\.mdl$/i.test(x.v));
      if (!exts.length) continue;
      const mk = names.resolve(exts[exts.length - 1].v, path.posix.dirname(key)).key;
      const m = mdlOf(mk);
      if (!m) continue;
      const mname = mk.slice(mk.lastIndexOf('/') + 1);
      for (const b of top.kids) {
        if (lc(b.name) !== 'bone') continue;
        const bn = str(b); if (bn == null || /^%/.test(bn)) continue;
        if (!m.bones.has(lc(bn))) {
          const what = b.kids.map(x => x.name).filter(Boolean).join(', ');
          rep.add(file, b.line, 'DEF_BONE_NOT_IN_MDL', `{bone "${bn}"}${what ? ' (' + what + ')' : ''}: ${mname} has no bone "${bn}"; the load stops with "Block terminator expected"; drop the block or rename it to a bone the mdl has (PORT-147/153/166)`);
          continue;
        }
        const type = m.bones.get(lc(bn));
        for (const l of b.kids) if (lc(l.name) === 'limits' && l.vals.length === 1 && ONE_BAD.has(type)) rep.add(file, l.line, 'BONE_LIMITS_ONE_NUMBER', `{limits} with one number for ${type} bone "${bn}" of ${mname}: "Number expected!" stops the whole load; give it two numbers {limits min max} (PORT-138)`);
      }
      // PORT-186: lamps of a def-level light extender
      for (const e of top.kids) {
        if (lc(e.name) !== 'extender' || lc(str(e)) !== 'light') continue;
        for (const l of e.kids) {
          if (lc(l.name) !== 'lamp') continue;
          const glass = 'lamp_glass' + (str(l) == null ? '' : str(l));
          if (!m.bones.has(lc(glass))) rep.add(file, l.line, 'LAMP_GLASS_BONE_MISSING', `{lamp "${str(l) == null ? '' : str(l)}"}: ${mname} has no bone "${glass}"; a hit that breaks the lamp raises an app error and crashes the game; add the bone to the mdl or drop the light extender (PORT-186)`);
        }
      }
    }
  }
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  found.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || cmp(a.code, b.code) || cmp(a.msg, b.msg));
  for (const f of found) out.add(f.file, f.line, f.code, f.msg);
  return { rep: out, files };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { o.exe = args[++i]; if (!games.get(o.exe)) { console.error('defcheck: --exe ' + o.exe + ': as64 or mowas_2 (mowas2); goh is refused (PORT-171)'); process.exit(2); } }
    else if (a === '--format') o.format = args[++i];
    else if (a === '--vfs') o.vfs = true; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true;
    else if (a === '--no-rc') o.noRc = true;   // accepted like the sibling lints; defcheck reads no .lintrc
    else if (/^-/.test(a)) { console.error('defcheck: unknown option ' + a + '; usage: node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--format json] [-q] [--summary] [--no-rc]'); process.exit(2); }
    else pos.push(a);
  }
  o.folder = pos[0];
  if (o.folder && !require('fs').existsSync(o.folder)) { console.error('defcheck: mod folder not found: ' + o.folder); process.exit(2); }
  // goh by --exe, or by the game folder itself (no --exe: the vfs would pick goh from binaries/x64/call_to_arms.exe)
  if (games.kindOf(o.exe) === 'goh' || !o.exe && o.gameDir && games.detect(o.gameDir) === 'goh') games.refuse('defcheck', 'goh', 'it checks defs against the as64 and MoW:AS2 engine readers; a GoH def is the port source side (its light form is LIGHT_EXTENDER_GOH_FORM here)', 'PORT-171');
  if (o.exe && o.vfs && !o.gameDir) o.gameDir = games.install(o.exe).dir || undefined;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--format json] | --vfs --game <dir> [--mods a,b] [-q] [--summary]'); process.exit(2); }
  const { rep, files } = check(o);
  if (o.format === 'json') { rep.print({ format: 'json', showInfo: !o.q, meta: { tool: 'defcheck' } }); }
  else { rep.print({ showInfo: !o.q, byCode: true, summary: o.summary }); console.log(`${files} files`); }
  process.exitCode = rep.count ? 1 : 0;
}
module.exports = { check, readMdl };
