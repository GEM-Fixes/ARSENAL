// modmove static: what must change when a mod moves from -> to (as64 | mowas2 | goh). read-only, no launch.
//   check(modDir, from, to, o) -> {findings:[{file,line,code,msg,group}], infos:[..], notes:[..]}   group: must | likely | fine
//   WARN_ prefix = [I]/[T] evidence (group likely); other MOVE_ codes = rule verified in source (group must). infos = fine.
// Author: Imperator_Aug (ARSENAL, ia-cf1ff4ff)
const fs = require('fs'), path = require('path'), cipath = require('../../lib/cipath');
// root + rel ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);
const C = require('./common'), exestr = require('./exestr'), keysets = require('./keysets');
const { readText, sdlScan } = require('../../lib/enc'), sdl = require('../../lib/sdl'), sdlx = require('../../lib/sdlx'), pak = require('../../lib/pak');

const TEXT_EXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const REF_EXT = /\.(mdl|mtl|ply|vol|anm|dds|tga|png|jpg|wav|ogg|mp3|def|ext|inc|fx|ammo|weapon|pattern|mine|hand|grenade|set|fsm|mi|presets|bik|avi|ttf)$/i;
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const isAs2 = t => t === 'as64' || t === 'mowas2';
const NAME = { as64: 'as64.exe', mowas2: 'mowas_2.exe', goh: 'Gates of Hell' };

function parseModInfo(dir) {
  const f = path.join(dir, 'mod.info');
  if (!fs.existsSync(f)) return null;
  const r = readText(f, 'cp1251'), out = { file: f, name: '', min: '', max: '', requires: [], lines: {} };
  if (r.fatal) return out;
  const top = sdl.parseLines(r.lines, () => {});
  const root = sdl.kids(top, 'mod')[0];
  if (!root) return out;
  for (const k of root.kids) {
    const lk = String(k.name || '').toLowerCase(), v = k.vals.length ? String(k.vals[0].v) : '';
    if (lk === 'mingameversion') { out.min = v; out.lines.min = k.line; }
    else if (lk === 'maxgameversion') { out.max = v; out.lines.max = k.line; }
    else if (lk === 'name') out.name = v;
    else if (lk === 'require') out.requires.push({ name: v, line: k.line });
  }
  return out;
}
const isModern = mi => { const v = C.verParse(mi && mi.min); return v.length > 0 && C.verCmp(v, C.MODERN_MIN) >= 0; };

// assets in paks are named, not parsed. everything else is extracted so the reference and key checks see it
const PAK_BINARY = /\.(dds|tga|png|jpe?g|bmp|ogg|wav|mp3|bik|anm|ply|vol|mesh|bin|ttf|otf|dll|exe|cab|zip|pak)$/i;
// one pak can hold a file and a folder of the same name (an extension-less entry "x" plus "x/y.def"); a disk cannot, so
// mkdir/write hits EEXIST/ENOTDIR/EISDIR. such an entry is skipped and counted, never fatal to the other paks [V: seen on a 115-file mod]
function extractText(p, view, clash) {
  const ents = pak.list(p);
  for (const e of ents) {
    if (e.name.endsWith('/') || PAK_BINARY.test(e.name)) continue;
    const out = path.join(view, ...e.name.split('/'));
    if (!path.resolve(out).startsWith(path.resolve(view))) throw new Error('path escapes target: ' + e.name);
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, pak.read(ents, e)); }
    catch (err) { if (/^(EEXIST|ENOTDIR|EISDIR|EPERM|EACCES)$/.test(err.code)) clash.push(path.basename(p) + '!' + e.name); else throw err; }
  }
}
function pakView(modDir, paks) {
  const view = C.tmpDir('modmove-pak-'), names = new Set(), clash = [];
  for (const f of paks) {
    const p = path.join(modDir, f);
    for (const e of pak.list(p)) names.add(e.name.toLowerCase());
    extractText(p, view, clash);
  }
  // layer order (row 161): a mod mounts resource.pak, then resource/ (so loose beats the root pak), then N.pat [V,].
  // inside resource/, one directory scan registers files and each nested .pak at its place in scan order: "the package's names replace the
  // files found before it and are replaced by the ones after it" [V].
  // so a loose file beats a NESTED pak only when its path sorts after the pak's (NTFS: case-insensitive name order [I]; `entity/` < `entity.pak`
  // means the pak wins). this copy lets the loose text win in every case: a known over-approximation, see fix-later. assets stay behind, known by name through extraKeys
  for (const f of C.walk(modDir)) {
    if (/\.(pak|pat)$/i.test(f)) continue;   // N.pat is read as an archive (patList), never copied as a text file
    names.add(keysets.stripRes(f.toLowerCase()));
    if (PAK_BINARY.test(f)) continue;
    const dst = path.join(view, f); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(modDir, f), dst);
  }
  return { view, names, clash };
}
// N.pat at the mod root, consecutive from 1.pat as the engine mounts them (vfs.js discover; a gap stops it, lim VFS-14); each mounts at resource/ like a root pak
function patList(modDir) { const r = []; let p; while (fs.existsSync(p = ciJoin(modDir, (r.length + 1) + '.pat'))) r.push(path.basename(p)); return r; }
function check(modDir, from, to, o = {}) {
  const paks = [...C.walk(modDir).filter(f => /\.pak$/i.test(f)), ...patList(modDir)];   // RobZ plan said "7 pak(s) read" of 8 archives: 1.pat was the 8th, never read
  if (!paks.length) return checkDir(modDir, from, to, o);
  const loose = checkDir(modDir, from, to, { ...o, pakPass: true });
  let view;
  try {
    const v = pakView(modDir, paks); view = v.view;
    const packed = checkDir(view, from, to, { ...o, extraKeys: v.names });
    const seen = new Set(), key = x => x.file + ':' + x.line + ':' + x.code + ':' + x.msg;
    const findings = [...loose.findings, ...packed.findings].filter(x => !seen.has(key(x)) && seen.add(key(x)));
    const notes = [...new Set([...loose.notes, ...packed.notes, `${paks.length} pak(s) read${paks.some(f => /\.pat$/i.test(f)) ? ' (N.pat included)' : ''}: text checked, assets by name only`, ...(v.clash.length ? [`${v.clash.length} pak entr${v.clash.length > 1 ? 'ies' : 'y'} share a name with a folder and were skipped (file/folder clash): ${v.clash.slice(0, 3).join(', ')}`] : [])])];
    return { ...loose, findings, infos: packed.infos, notes };
  } catch (e) {
    loose.findings.push({ file: 'mod', line: 0, code: 'WARN_MOVE_PAKS_UNREAD', msg: `${paks.length} pak(s) not readable (${e.message}): results cover loose files only. change: unpack the mod and rerun`, group: 'likely' });
    return loose;
  } finally { if (view) fs.rmSync(view, { recursive: true, force: true }); }
}
function checkDir(modDir, from, to, o = {}) {
  const F = [], I = [], notes = [], top = o.top || 20;
  const add = (file, line, code, msg) => F.push({ file, line: line || 0, code, msg, group: code.startsWith('WARN_') ? 'likely' : 'must' });
  const fine = (code, msg) => I.push({ code, msg });
  const inst = C.installs(o), files = C.walk(modDir), low = files.map(f => f.toLowerCase());
  // loose pass of a packed mod: clean verdicts come from the pass that read the paks
  const unread = o.pakPass;
  const mi = parseModInfo(modDir);
  const infoRel = 'mod.info';
  let fatal = false;
  const dstVer = C.dataVersion(to, C.exeOf(to, inst, o));

  // ---- mod.info: parse/fatal, version, mode, Require
  if (!mi) add(infoRel, 0, 'MOVE_NO_MOD_INFO', 'folder has no mod.info; no target lists it as a mod. change: add mod.info {mod {name "x"} ...}');
  else {
    const mj = C.runTool('modinfo', [modDir, '-q']);
    for (const f of C.parseFindings(mj.out)) if (/^(SYNTAX|MODINFO_PARSE|ENC_BOM)$/.test(f.code)) fatal = true;
    for (const f of C.parseFindings(mj.out)) if (/^(SYNTAX|MODINFO_PARSE|ENC_BOM)$/.test(f.code))
      add(infoRel, f.line, 'MOVE_MODINFO_FATAL', `${f.code}: ${f.msg} (ENG-24: one bad mod.info stops game start on every target). change: fix mod.info syntax first`);
    const modern = isModern(mi), mn = C.verParse(mi.min), mx = C.verParse(mi.max);
    const dv = C.verParse(dstVer.ver);
    if (fatal) { /* version rules need a parsable mod.info */ }
    else if (to === 'goh') {
      fine('MOVE_OK_MODINFO_GOH', 'mod.info keys are the same SDL keys (name/desc/minGameVersion/maxGameVersion/require; mods/template)');
      if (from !== 'goh' && C.verParse(mi.min)[0] !== 1) add(infoRel, mi.lines.min, 'MOVE_GOH_VERSION_SCALE', `Min/Max "${mi.min}"/"${mi.max}" are AS2-scale; GoH needs the range to hold its own exe version ${dstVer.ver || '(unknown)'} (seen: 1.067 shown as 1.67): "was disabled: Unsupported game version" [V live 2026-11-04]. mods/template ships 1.500-1.510 and is refused on 1.067, don't copy those numbers. change: minGameVersion to the exe version`);
      else if (dstVer.ver && mi.min && C.verParse(mi.min)[0] === 1 && C.verCmp(mn, dv) > 0) add(infoRel, mi.lines.min, 'MOVE_VERSION_ABOVE_TARGET', `minGameVersion ${mi.min} is above GoH exe ${dstVer.ver}: no ACTIVATE in the Workshop list, and a file-listed mod is not activated and is dropped from {mods} on exit. change: lower minGameVersion`);
    } else {
      const mode = modern ? 'modern' : 'legacy';
      if (to === 'as64') {
        if (modern) {
          if (C.verCmp(mn, [3, 301]) > 0) add(infoRel, mi.lines.min, 'MOVE_VERSION_ABOVE_TARGET', `MinGameVersion ${mi.min} is above as64 plain version 3.301: mod skipped. change: lower MinGameVersion to 3.301`);
          else fine('MOVE_OK_VERSION', `modern mod (Min ${mi.min} >= 3.301) fits as64 Enhanced; no Max needed`);
          fine('MOVE_OK_MODE_LIST', 'as64: Enhanced mode; mod list must contain as64+ (before the mod); without it startup font crash (ENG-26)');
        } else {
          if (!mn.length || !mx.length || C.verCmp(dv, mn) < 0 || C.verCmp(dv, mx) > 0)
            add(infoRel, mi.lines.min || mi.lines.max, 'MOVE_VERSION_RANGE', `legacy mod needs both MinGameVersion and MaxGameVersion with data version ${dstVer.ver} inside, got Min "${mi.min}" Max "${mi.max}": mod skipped. change: set {MinGameVersion "3.262"} {MaxGameVersion "3.262"} (Classic) or MinGameVersion "3.301" (Enhanced)`);
          else fine('MOVE_OK_VERSION', `legacy range ${mi.min}..${mi.max} contains ${dstVer.ver}`);
          if (mi.requires.some(r => r.name.toLowerCase() === 'as64+')) add(infoRel, mi.requires.find(r => r.name.toLowerCase() === 'as64+').line, 'MOVE_ENG26_LEGACY_BESIDE_AS64PLUS', 'legacy mod (Min < 3.301) requires as64+: Enhanced + legacy mod crashes at startup in the font fallback (ENG-26). change: drop the Require or set MinGameVersion "3.301"');
          else fine('MOVE_OK_ENG26', 'legacy mod (Min < 3.301) works in Classic only: keep as64+ out of the mod list or startup crashes in the font fallback (ENG-26); modmove live does this');
        }
      } else {   // mowas2
        if (modern) add(infoRel, mi.lines.min, 'MOVE_VERSION_ABOVE_TARGET', `MinGameVersion ${mi.min} > mowas_2 data version ${dstVer.ver} (${dstVer.src}): mod skipped. change: set Min/Max to the legacy range "3.262".."3.262" and remove as64+-only content`);
        else if (!mn.length || !mx.length || C.verCmp(dv, mn) < 0 || C.verCmp(dv, mx) > 0)
          add(infoRel, mi.lines.min || mi.lines.max, 'MOVE_VERSION_RANGE_MOWAS2', `mowas_2 wants Min and Max with ${dstVer.ver} inside, got Min "${mi.min}" Max "${mi.max}": "was disabled: Unsupported game version" [V live 2026-11-04]. change: set {MinGameVersion "3.262"} {MaxGameVersion "3.262"}`);
        else fine('MOVE_OK_VERSION', `legacy range ${mi.min}..${mi.max} contains ${dstVer.ver}`);
        void mode;
      }
    }
    for (const r of mi.requires) {
      const rn = r.name.toLowerCase();
      if (rn === 'as64+' && to === 'mowas2') add(infoRel, r.line, 'MOVE_REQUIRE_AS64PLUS', 'Require "as64+" cannot be met on mowas_2 (no as64/plus built-in). change: drop the Require and the as64+-only content');
      else if (rn === 'as64+' && to === 'goh') add(infoRel, r.line, 'MOVE_REQUIRE_AS64PLUS', 'Require "as64+" has no GoH equivalent. change: drop it');
      else {
        const root = C.rootOf(to, inst);
        if (root && !fs.existsSync(ciJoin(root, 'mods/' + r.name + '/mod.info')) && !(rn === 'as64+' && to === 'as64'))
          add(infoRel, r.line, 'WARN_MOVE_REQUIRE_NOT_INSTALLED', `Require "${r.name}": no mods/${r.name}/mod.info in the ${NAME[to]} install. change: install that mod for ${to} or drop the Require`);
        else if (root) fine('MOVE_OK_REQUIRE', `Require "${r.name}" present on ${to}`);
      }
    }
  }

  // ---- files/paths meaningful on one target
  const hit = (re) => files.filter((f, i) => re.test(low[i]));
  if (to !== 'as64') {
    for (const f of hit(/^as64\/core\//)) add(f, 0, 'MOVE_AS64_CORE_ONLY', `path as64/core/ is mounted only by as64.exe, after the game and before mods (VFS-46); ${to} never reads it. change: move needed files under resource/ or drop`);
    for (const f of hit(/^localization\/(as64\/[^/]+\.lng|#as64\.lng)$/)) add(f, 0, 'MOVE_AS64_LNG', `as64 .lng (keys as64/<lang>/<name>, LOC-23) exist only on as64.exe; on ${to} those keys show raw. change: drop the file or copy the texts into a normal .lng key`);
    for (const f of hit(/^resource\/set\/as64\//)) add(f, 0, 'MOVE_AS64_PLUS_SET', `set/as64/*.set (AS64+ modules/squad_size) is read only by as64.exe Enhanced; ${to} ignores it. change: drop it or express the setting in vanilla keys`);
    for (const f of hit(/^resource\/shader\/(?!cache\/)/)) add(f, 0, 'WARN_MOVE_SHADER_AS64_ONLY', `shader source overrides target as64/core/resource/shader (dx10 hlsl, VFS-46); ${to} has none of that layout [I]. change: verify shaders are loaded on ${to} or drop`);
  } else if (from !== 'as64') {
    for (const f of hit(/^resource\/set\/as64\//)) if (mi && !isModern(mi)) add(f, 0, 'WARN_MOVE_AS64_SET_CLASSIC', 'set/as64/*.set is AS64+ config; a legacy mod runs in Classic (no as64+), so it is likely unused. change: make the mod modern (MinGameVersion 3.301) to use it');
  }
  // PORT-81: a GoH interface/ folder (UI data) mounted on an AS2 exe crashes boot [V live as64]; one finding per mod, first file named
  if (from === 'goh' && isAs2(to)) {
    const ui = hit(/^(resource\/|as64\/core\/resource\/)?interface\//);
    if (ui.length) add(ui[0], 0, 'MOVE_GOH_INTERFACE', `GoH interface/ folder (${ui.length} file${ui.length > 1 ? 's' : ''}) goes to ${to}: GoH UI data crashes the game at boot [V live as64, PORT-81]. change: delete the interface/ folder from the mod or layer; GoH UI does not port by data`);
  }
  if (!F.some(f => /^MOVE_AS64_|^WARN_MOVE_SHADER|^WARN_MOVE_AS64/.test(f.code))) fine('MOVE_OK_PATHS', `no as64-only paths (as64/core, set/as64, localization/as64) that ${to} would ignore`);
  if (to === 'goh') for (const f of hit(/^localization\/.+\.lng$/)) {
    const m = /^localization\/(?:(.+)\/)?#?([^/]+)\.lng$/i.exec(f);
    add(f, 0, 'WARN_MOVE_LNG_GOH', `GoH has 0 .lng: text is gettext .pot, UTF-8, msgctxt keys [V data]; a .lng there is ignored [I]. change: move to localizations/default/interface/text/${m && m[1] ? m[1] + '/' : ''}${m ? m[2] : 'name'}.pot (folder localizations, not localization)`);
  }

  // ---- patch layout + zip64
  for (let i = 0; i < files.length; i++) {
    if (!/\.(pat|pak)$/.test(low[i])) continue;
    const p = path.join(modDir, files[i]);
    let names = null;
    try { names = pak.list(p).map(e => e.name); } catch (e) { add(files[i], 0, 'MOVE_PATCH_LAYOUT', `not a readable zip (${e.message}); all targets mount .pat/.pak as zip. change: repack as zip`); continue; }
    if (/\.pat$/.test(low[i]) && !names.includes('.patch')) add(files[i], 0, 'MOVE_PATCH_LAYOUT', 'N.pat zip has no ".patch" entry ({Patch {id N}}, GoH template 1.pat has it); patch ignored. change: add .patch');
    if (to === 'mowas2' && z64(p)) add(files[i], 0, 'WARN_MOVE_ZIP64', 'zip64 archive (GoH-style); retail 32-bit mowas_2 zip64 support unknown [I,T]. change: repack as plain zip');
  }
  if (!F.some(f => f.code === 'MOVE_PATCH_LAYOUT')) fine('MOVE_OK_PATCH', 'N.pat/.pak layout (zip, .patch entry) is the same on all targets');

  // ---- text encoding (PORT-15) + portdiff checks
  const textFiles = files.filter(f => TEXT_EXT.has(extOf(f)) || /(^|\/)\.presets$/.test(f.toLowerCase()));
  let encN = 0;
  if (isAs2(to) !== isAs2(from)) {
    for (const f of textFiles) {
      const b = fs.readFileSync(path.join(modDir, f));
      if (!b.some(c => c > 127)) continue;
      // ENCFIX: as64 and GoH both read string values as UTF-8; only legacy cp1251 strings need re-saving
      const sc = sdlScan(b, 1);
      const bad = sc.badStr.length ? sc.badStr[0].line : sc.outside.length && !require('../../lib/enc').isUtf8(b) ? sc.outside[0].line : 0;
      if (bad) { if (encN++ < top) add(f, bad, 'MOVE_ENC_CP1251', 'string value is not UTF-8 (legacy cp1251 bytes, shows as U+FFFD on as64 and GoH). change: re-save the strings as UTF-8 (lib/enc cp1251StringsToUtf8)'); }
    }
    if (!encN) fine('MOVE_OK_ENC', 'no text file needs re-encoding');
  }
  if (isAs2(to) !== isAs2(from)) {
    const empty = C.tmpDir('mm-empty-');
    const resDir = fs.existsSync(path.join(modDir, 'resource')), mod = path.resolve(modDir);
    const args = from === 'goh' ? ['--as2', empty, '--goh', mod] : ['--as2', mod, '--goh', empty];
    const r = C.runTool('portdiff', [...args, '--min', '1', '--no-cache', '--top', String(top), '-q']);
    fs.rmSync(empty, { recursive: true, force: true });
    const seenExt = new Set();
    let as2Ext = null;   // GoH-only means: absent from AS2 vanilla (the empty portdiff side would call every extension GoH-only)
    try { if (inst.as2) { const ks = keysets.vanillaKeys('as64', inst.as2); if (ks.size > 20) { as2Ext = new Set(); for (const k of ks) as2Ext.add(extOf(k)); } } } catch { /* no AS2 vanilla */ }
    let n = 0;
    for (const f of C.parseFindings(r.out)) {
      if (/^WARN_PORT_(KEY|SHAPE|STRUCT)_/.test(f.code)) continue;
      if (!f.file || f.file === '-') continue;
      const rel = (resDir ? 'resource/' : '') + f.file;
      const lm = /line (\d+)/.exec(f.msg), ln = lm ? +lm[1] : f.line;
      if (f.code === 'PORT_EXT_GOH_ONLY') {
        if (from !== 'goh' || !as2Ext) continue;
        if (as2Ext.has(f.msg.split(' ')[0].replace(/^\./, ''))) continue;
        const x = f.msg.split(' ')[0]; if (seenExt.has(x)) continue; seenExt.add(x);
        add(rel, 0, 'MOVE_EXT_GOH_ONLY', `${f.msg}: GoH-only file kind, no AS2 loader (PORT-31). change: omit from the AS2 mod`); n++;
      } else if (/^(WARN_)?PORT_PARSE_FAIL|^WARN_PORT_PARSE_FAIL/.test(f.code)) { add(rel, ln, 'WARN_MOVE_PARSE_FAIL', f.msg.replace(/^(GoH|AS2) /, '') + '. change: fix or accept if intentional'); n++; }
      else if (/^WARN_PORT_/.test(f.code)) { add(rel, ln, 'WARN_MOVE_' + f.code.slice(5), f.msg + ' change: apply ' + ((/PORT-\d+/.exec(f.msg) || ['the PORT rule'])[0]) + ' (limits/PORT.md) by hand; this tool never converts'); n++; }
    }
    if (!n) fine('MOVE_OK_PORTDIFF', 'portdiff per-file checks found nothing');
  }

  if (from !== 'goh' && to === 'goh') assetRules(modDir, files, low, add);
  const srcRoot = C.rootOf(from, inst), dstRoot = C.rootOf(to, inst);
  if ((from === 'goh') !== (to === 'goh')) {
    let dk; const exist = k => { if (dk === undefined) { try { dk = dstRoot && fs.existsSync(dstRoot) ? keysets.vanillaKeys(to, dstRoot) : null; } catch { dk = null; } } return (dk && dk.has(k)) || (o.extraKeys ? o.extraKeys.has(k) : false); };
    dataRules(modDir, files, low, add, to, exist);
  }

  // ---- macro calls (row 78): a ("name" ...) call whose define is in no file of the chain reads OK in the reference check and dies live
  if (dstRoot && fs.existsSync(dstRoot) && !o.noLint && !unread && textFiles.length) macroCalls(modDir, to, dstRoot, add, fine, top);

  // ---- vanilla references and exe key check need both installs
  if (srcRoot && dstRoot && fs.existsSync(srcRoot) && fs.existsSync(dstRoot) && !(from !== 'goh' && to !== 'goh' && false)) {
    refs(modDir, files, textFiles, from, to, srcRoot, dstRoot, add, unread ? () => {} : fine, top, o);
  } else notes.push('resource reference check skipped: need install roots (--as2/--goh) for both targets');
  const sx = C.exeOf(from, inst, o), dx = C.exeOf(to, inst, o);
  if (sx && dx && fs.existsSync(sx) && fs.existsSync(dx)) exeKeys(modDir, textFiles, sx, dx, from, to, add, unread ? () => {} : fine, top, [...(o.extraKeys || []), ...files.map(f => f.toLowerCase()), ...(srcRoot && fs.existsSync(srcRoot) ? keysets.vanillaKeys(from, srcRoot) : [])]);
  else notes.push('engine key check skipped: need both exes (--as2/--goh, --exe-<target>)');

  // ---- AS2-family lint tools against the destination install
  if (isAs2(to) && inst.as2 && !o.noLint) {
    const lint = (tool, args, tag) => {
      const r = C.runTool(tool, args), by = {};
      for (const f of C.parseFindings(r.out)) {
        if (f.info) continue;
        const k = by[f.code] || (by[f.code] = []); k.push(f);
      }
      let any = false;
      for (const [code, l] of Object.entries(by)) {
        any = true;
        for (const f of l.filter(x => !/^(localization\/(as64\/|#as64)|as64\/core\/)/i.test(x.file.replace(/\\/g, '/'))).slice(0, 5)) add(f.file.replace(/\\/g, '/'), f.line, 'WARN_MOVE_' + tag + '_' + code.replace(/^WARN_/, ''), `${tool}: ${f.msg}${l.length > 5 ? ` (+${l.length - 5} more of this code)` : ''}. change: fix per ${tool} code ${code}`);
      }
      if (!any) fine('MOVE_OK_' + tag, `${tool} against ${to} install: clean`);
    };
    if (from === 'goh') lint('keylint', [modDir, '--game', inst.as2, '-q'], 'KEYLINT');
    lint('loccover', [modDir, '--game', inst.as2, '--exe', to === 'as64' ? 'as64' : 'mowas_2', '-q'], 'LOCCOVER');
  }
  return { findings: F, infos: I, notes, mod: mi ? mi.name || path.basename(modDir) : path.basename(modDir) };
}

// AS2 <-> GoH data rules from tools/gamediff. names and counts [V data], game effect [I]
// row 160: a rule names a file (veterancy.inc); the include is dangling only when the PATH it resolves to is neither a mod file
// nor a target vanilla file. exist(key) -> bool for a resource-relative key (resource/ stripped); default: mod files only
function dataRules(modDir, files, low, add, to, exist) {
  // names live in tools/upgrade/rules, shared with the writer. to GoH stuff_weapon.ext is an asset rule, weapon defs only (GoH keeps stuff_small.ext)
  const pairs = require('../../upgrade/lib/rules').includePairs(to === 'goh' ? 'mowas2' : 'goh', to);
  const byName = new Map(pairs.map(([a, b]) => [a.toLowerCase(), [a, b]]));
  const modKeys = new Set(low.map(x => keysets.stripRes(x)));
  const has = k => modKeys.has(k) || (exist ? exist(k) : false);
  const seen = new Set();
  files.forEach((f, i) => {
    const l = low[i], res = l.replace(/^resource\//, '');
    if (/\.(def|ext|inc|set)$/.test(l)) {
      const t = fs.readFileSync(path.join(modDir, f), 'latin1'), reported = new Set(), re = /include\s+"([^"]+)"/gi;
      let m;
      while ((m = re.exec(t))) {
        const p = m[1], base = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1).toLowerCase(), pair = byName.get(base);
        if (!pair || reported.has(base)) continue;
        const r = sdlx.resolveInclude(p, 'resource/' + res);
        if (r.kind === 'virtual' && has(keysets.stripRes(r.key))) continue;   // that exact path exists on the target or in the mod
        reported.add(base);
        add(f, t.slice(0, m.index).split('\n').length, 'MOVE_INCLUDE_RENAME', `${pair[0]} does not exist on ${to}: dangling include, def not loaded [I]. change: include "${pair[1]}"`);
      }
    }
    if (to === 'goh' && /^map\/.+\.mtl$/.test(res) && /\{\s*layer\b/i.test(fs.readFileSync(path.join(modDir, f), 'latin1'))) add(f, 0, 'WARN_MOVE_MAP_MTL_LAYER', 'AS2 map .mtl with layer; GoH maps have 0 .mtl, layers live in .materials (288 maps) [I equivalence]. change: move the layer blocks to a .materials file');
    const d = /^set\/(breed|environment)\//.exec(res);
    if (d && !seen.has(d[1])) { seen.add(d[1]); add(f, 0, 'WARN_MOVE_SET_NEW_FILE', `set/${d[1]}: the two games share 0 file names, so this is a new file on ${to}, it overrides nothing and only what names it reads it. change: copy keys from a ${to} set/${d[1]} file`); }
  });
}

// AS2 asset -> GoH: what a moved weapon, helmet or vehicle must change, PORT rows). data measured, in-game [T]
const GOH_FORESIGHT = { smg: 'foresight11', mg: 'foresight14', rifle: 'foresight12' };
function assetRules(modDir, files, low, add) {
  const read = f => fs.readFileSync(path.join(modDir, f), 'latin1');
  const lineOf = (t, re) => { const m = re.exec(t); return m ? t.slice(0, m.index).split('\n').length : 0; };
  files.forEach((f, i) => {
    const l = low[i], res = l.replace(/^resource\//, '');
    if (/\.def$/.test(l) && /^entity\/(-?vehicle)\//.test(res)) add(f, 0, 'WARN_MOVE_GOH_VEHICLE_DEF', 'AS2 vehicle .def kept; GoH vehicles use other includes and keys. change: copy a GoH donor .def of same class, calibre and weight, point {extension} at this .mdl, delete the donor model include (PORT)');
    else if (/\.def$/.test(l) && /^entity\/(-?inventory)\//.test(res)) {
      const t = read(f), re = /include\s+"\/properties\/stuff_small\.ext"/i;
      if (/\/-?weapon\//.test(res) && re.test(t)) add(f, lineOf(t, re), 'WARN_MOVE_GOH_WEAPON_INCLUDE', 'weapon .def includes stuff_small.ext; GoH weapons use stuff_weapon.ext (177/281 vanilla defs). change: include "/properties/stuff_weapon.ext"');
    }
    if (/^set\/stuff\/head\//.test(res)) {
      const t = read(f), re = /\{\s*from\s+"(helmet pattern|pattern headgear|fieldcap_rus)"/i;
      if (re.test(t)) add(f, lineOf(t, re), 'WARN_MOVE_GOH_HEAD_PATTERN', 'AS2 head pattern; GoH head sets use "pattern heavy_headgear" (helmet) or "pattern light_headgear" (cap). change: replace the from line');
    }
    const c = /^set\/stuff\/(smg|mg|rifle)\//.exec(res);
    if (c) {
      const ent = (/\{\s*entity\s+"([^"]+)"/i.exec(read(f)) || [])[1];
      const j = ent ? low.findIndex(x => x.endsWith('/' + ent.toLowerCase() + '.mdl')) : -1;
      if (j < 0) return;
      const t = read(files[j]), re = /\{\s*bone\s+"foresight3"/i;
      if (re.test(t)) add(files[j], lineOf(t, re), 'WARN_MOVE_GOH_FORESIGHT', `${c[1]} .mdl uses AS2 bone foresight3; GoH ${c[1]} uses ${GOH_FORESIGHT[c[1]]}. without it the weapon is reported to load but not fire [T]. change: rename the bone in the .mdl`);
    }
  });
}

// sdllint output -> [{file,line,msg}] for undefined macro calls only (sdllint resolves includes: mod folder first, then the game vfs, and
// judges include files through the file that includes them, so a define held by an includer is not reported)
// an .inc / roster root is judged through its includers, so sdllint demotes its undefined call to info SDL_FRAGMENT_MACRO: kept here as a WARN [I]
function macroHits(out) { return C.parseFindings(out).filter(f => (!f.info && /^(WARN_)?MACRO_UNDEFINED$/.test(f.code)) || f.code === 'SDL_FRAGMENT_MACRO'); }
function macroCalls(modDir, to, dstRoot, add, fine, top) {
  const r = C.runTool('sdllint', [modDir, '--game', dstRoot, '-q']);
  if (r.error || (r.status !== 0 && r.status !== 1 && !r.out)) { add('mod', 0, 'WARN_MOVE_MACROS_UNREAD', `macro check did not run (sdllint: ${(r.error && r.error.message) || 'exit ' + r.status}). change: run tools/sdllint on the mod against ${to}`); return; }
  const hits = macroHits(r.out);
  for (const f of hits.filter(x => x.code === 'SDL_FRAGMENT_MACRO').slice(0, top)) add(f.file.replace(/\\/g, '/'), f.line, 'WARN_MOVE_MACRO_FRAGMENT', `${f.msg}: include/roster file calls a macro no file visible to it defines [I: its real includer may be outside the mod]. change: check the includer defines it, or ship/Require the parent mod`);
  for (const f of hits.filter(x => x.code !== 'SDL_FRAGMENT_MACRO').slice(0, top)) add(f.file.replace(/\\/g, '/'), f.line, 'MOVE_MACRO_UNDEFINED', `${f.msg} against the ${NAME[to]} install: fatal "define not found" at boot when this file loads [V PORT-52 live, as64 + mowas_2]; a child mod needs its parent listed first. change: define it in the include chain, ship the file that defines it, or Require/list the parent mod`);
  if (hits.length > top) add('mod', 0, 'WARN_MOVE_MACROS_MORE', `${hits.length - top} more undefined macro calls (--top ${top}). change: rerun with a larger --top`);
  if (!hits.length) fine('MOVE_OK_MACROS', `every macro call resolves in the mod or the ${NAME[to]} vfs (sdllint)`);
}

function z64(p) {
  const fd = fs.openSync(p, 'r');
  try {
    const sz = fs.fstatSync(fd).size, n = Math.min(sz, 22 + 65535 + 20), b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, sz - n);
    return b.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07])) >= 0;
  } finally { fs.closeSync(fd); }
}

// quoted strings naming a file / entity that the source vanilla has and the destination vanilla lacks
function refs(modDir, files, textFiles, from, to, srcRoot, dstRoot, add, fine, top, o) {
  let src, dst;
  try { src = keysets.vanillaKeys(from, srcRoot); dst = from === to ? src : keysets.vanillaKeys(to, dstRoot); } catch (e) { fine('MOVE_OK_REFS', 'reference check skipped: ' + e.message); return; }
  const modKeys = new Set(files.map(f => keysets.stripRes(f.toLowerCase())));
  for (const f of files) if (/\.pak$/i.test(f)) { try { for (const e of pak.list(path.join(modDir, f))) modKeys.add(e.name.toLowerCase()); } catch { /* reported by patch check */ } }
  for (const k of o.extraKeys || []) modKeys.add(k);
  const entName = k => { const m = /^entity\/(?:.*\/)?([^/]+)\.def$/.exec(k); return m && m[1]; };
  const srcEnt = new Set(), dstEnt = new Set(), modEnt = new Set();
  for (const k of src) { const n = entName(k); if (n) srcEnt.add(n); }
  for (const k of dst) { const n = entName(k); if (n) dstEnt.add(n); }
  for (const k of modKeys) { const n = entName(k); if (n) modEnt.add(n); }
  let nf = 0, ne = 0, total = 0;
  const seen = new Set();
  for (const f of textFiles) {
    const key = keysets.stripRes(f.toLowerCase()), dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
    const lines = fs.readFileSync(path.join(modDir, f)).toString('latin1').split(/\r?\n/);
    lines.forEach((l, i) => {
      const c = l.indexOf(';'); const t = c >= 0 ? l.slice(0, c) : l;
      const re = /"([^"]{3,120})"/g; let m;
      while ((m = re.exec(t))) {
        const s = m[1].toLowerCase().trim();
        if (/[<%{}\\]|^https?:/.test(s)) continue;
        if (REF_EXT.test(s)) {
          const r1 = s.replace(/^\/+/, ''), cands = [r1, norm(dir + r1)];
          if (cands.some(x => modKeys.has(x) || dst.has(x))) continue;
          const hitKey = cands.find(x => src.has(x));
          if (!hitKey) continue;
          const id = f + '|' + hitKey; if (seen.has(id)) continue; seen.add(id);
          total++;
          if (nf++ < top) add(f, i + 1, 'MOVE_REF_MISSING_ON_TARGET', `"${m[1]}" exists in ${NAME[from]} vanilla (resource/${hitKey}) but not in ${NAME[to]} vanilla or the mod. change: ship that file in the mod or point to an equivalent ${to} asset`);
        } else if (s.length >= 4 && /^[a-z0-9_\-()+]+$/.test(s) && srcEnt.has(s) && !dstEnt.has(s) && !modEnt.has(s)) {
          const id = f + '|e|' + s; if (seen.has(id)) continue; seen.add(id);
          total++;
          if (ne++ < top) add(f, i + 1, 'WARN_MOVE_ENTITY_MISSING_ON_TARGET', `"${m[1]}" matches an entity def in ${NAME[from]} vanilla but none in ${NAME[to]} vanilla or the mod (name-only match [I]). change: ship the entity or substitute one that exists on ${to}`);
        }
      }
    });
  }
  if (total > nf + ne) add('mod', 0, 'WARN_MOVE_REF_MORE', `${total - nf - ne} more unresolved references not listed (--top ${top}). change: rerun with a larger --top`);
  if (!total) fine('MOVE_OK_REFS', `every file/entity reference resolves on ${to} vanilla or inside the mod`);
}
function norm(p) { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); }

// SDL block names in mod text that the source exe has as a whole string but the destination exe lacks [I]
function exeKeys(modDir, textFiles, sx, dx, from, to, add, fine, top, resources = []) {
  const S = exestr.info(sx).idents, D = exestr.info(dx).idents;
  // file stems: {is2} {puddle} {barbwire} name entities and textures in lists
  const stems = new Set(); for (const k of resources) { const b = k.slice(k.lastIndexOf('/') + 1), i = b.indexOf('.'); stems.add(i > 0 ? b.slice(0, i) : b); }
  const by = new Map();
  const walk = (node, file) => {
    for (const k of node.kids || []) {
      const n = String(k.name || '').toLowerCase();
      const dataName = !(k.vals || []).length && !(k.kids || []).length && stems.has(n);
      if (n && S.has(n) && !D.has(n) && !dataName) {
        const e = by.get(n) || by.set(n, { name: k.name, file, line: k.line, n: 0 }).get(n);
        e.n++;
      }
      walk(k, file);
    }
  };
  for (const f of textFiles) {
    try { const r = readText(path.join(modDir, f), 'cp1251'); if (r.fatal) continue; walk(sdl.parseLines(r.lines, () => {}), f); } catch { /* unparsable: other checks */ }
  }
  const l = [...by.values()].sort((a, b) => b.n - a.n);
  for (const e of l.slice(0, top)) add(e.file, e.line, 'WARN_MOVE_KEY_NOT_IN_DEST_EXE', `key {${e.name}} (x${e.n}) is a string in the ${from} exe but not in the ${to} exe [I: strings are not proof of use]. change: check whether ${to} reads it; remove or replace if not`);
  if (l.length > top) add('mod', 0, 'WARN_MOVE_KEY_MORE', `${l.length - top} more keys only in the ${from} exe strings. change: rerun with a larger --top`);
  if (!l.length) fine('MOVE_OK_EXE_KEYS', `no block name in the mod is exclusive to the ${from} exe strings`);
}
module.exports = { check, parseModInfo, isModern, exeKeys, dataRules, macroHits, _ci: { ciJoin, patList } };
