#!/usr/bin/env node
// packer: plan + pre-flight checks + write role paks from a mod's loose resource/ files. rows VFS-04,39 SDL-53
// usage: node tools/packer/packer.js <modDir> [--out <dir>] [--dry] [--allow-private] [-q] [--summary]   (--help: usage, exit 0, no side effects)
//   default = --dry (plan + checks, writes nothing). --out writes <role>.pak ONLY into <dir>; refused inside a game install.
//   packs <modDir>/resource/<top>/** by role: gamelogic=set,properties,script; entity; map;
//   interface; texture; sound; music; shader goes to gamelogic (vanilla gamelogic.pak holds shader/). other files (resource/difficulties, top-level
//   loose files) stay loose: --out copies them to <dir>/<path under resource/> (LOOSE_COPIED), so <dir> is a whole resource/ folder. entry name = path under resource/ (as vanilla paks).
// --package (with --out): writes <dir>/<mod folder name>/ as a ready mod folder (mod.info, other top-level files, resource/<role>.pak,
//   the mod's own resource/*.pak, loose files) that works when dropped into <game>/mods. codes PACK_NO_MODINFO WARN_PACK_PAK_CLASH; info PACKAGE PACKAGE_WROTE
// codes: ZIP_NAME_TOO_LONG (VFS-04) LNG_NOT_UTF8 WARN_TEXT_BOM WARN_STR_NOT_UTF8 WARN_TEXT_NONASCII_IDENT WARN_TEXT_NOT_CRLF WARN_LOOSE_SHADOWS_PAK
//        WARN_PACK_DUP_NAME PACK_ENTRY_TOO_BIG (VFS-39) PACK_ROUNDTRIP ; info: PLAN MOD_DELETE EXCLUDED UNPACKED
// GoH guard (gohguard.js, rev-port #3): PACK_GOH_ORIGIN PACK_GOH_RENAMED PACK_PRIVATE -> nothing written, exit 1.
//   --allow-private: written anyway as <role>-PRIVATE.pak + PRIVATE-GOH-README.txt, hits become WARN_PACK_PRIVATE; release-check --publish refuses it
// --goh (or --exe goh; --exe as64|mowas_2|mowas2 = the AS2 form, unchanged: both AS2 exes read the same paks): a Gates of Hell mod.
//   GoH mounts only resource/, N.pat and localizations/ of a mod (GHVFS-04 [V]); a pak in resource/ mounts at its own folder, as here
//   (lib/vfs, [V data]), so the role paks are the same; localizations/ text stays loose (the GoH template mod's form) and --package
//   copies it. WARN_PACK_GOH_UNREAD: root localization/, localization.pak or resource.pak, which GoH never reads (GHVFS-04);
//   WARN_PACK_GOH_NAME: a package folder name GoH skips (space, non-ASCII, <>+()[]{}!@#$%^&*-=;:\|'", GHVFS-27).
//   The GoH-origin guard is for AS2 mods: info GOH_GUARD_NA, not run.
// Author: Imperator_Aug (ARSENAL, ia-bfc2cd0c)
const fs = require('fs'), path = require('path');
const names = require('../lib/names'), sdlset = require('../lib/sdlset'), sdl = require('../lib/sdl');
const pak = require('../lib/pak'), enc = require('../lib/enc');
const { writeZip, dosStamp } = require('../lib/zipwrite');
const { createReport, relPath } = require('../lib/report');
const gohguard = require('./gohguard');

const ROLE = { set: 'gamelogic', properties: 'gamelogic', script: 'gamelogic', shader: 'gamelogic', entity: 'entity', map: 'map',
  interface: 'interface', texture: 'texture', sound: 'sound', music: 'music' };
const JUNK_DIR = new Set(['.git', '.svn', '.hg', '.vs', '.idea', '.vscode', '.claude']);
const JUNK_FILE = /^(\.gitignore|\.gitattributes|thumbs\.db|desktop\.ini|\.ds_store|.*\.(bak|swp|orig|rej)|.*~)$/i;
// toolkit marker files (tools/lib/writeguard .arsenal-made, tools/as2/flow .as2-installed): ours, not editor junk; never packed, never reported (GX-next idiot pass)
const TOOL_MARKER = /^\.(arsenal-made|as2-installed)$/i;
const MAX_ENTRY = 0xFFFFFFFF;   // engine entry size u32 (VFS-39); whole pak may pass 4 GB (zip64)

const fwd = p => p.split(path.sep).join('/');
const wire = n => Buffer.from(n, 'utf8').toString('latin1');   // entry name as pak.list returns it (raw bytes, latin1)

function inGameInstall(out) {
  let d = path.resolve(out);
  for (;;) {
    try {
      const hasMods = fs.existsSync(path.join(d, 'mods')) && fs.statSync(path.join(d, 'mods')).isDirectory();
      const res = path.join(d, 'resource');
      if (hasMods && fs.existsSync(res) && fs.readdirSync(res).some(f => /\.pak$/i.test(f))) return d;
    } catch { /* unreadable ancestor */ }
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}

function scan(resDir, rep, modDir) {
  const files = [];
  (function walk(dir) {
    for (const nm of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, nm), st = fs.statSync(p);
      if (st.isDirectory()) { if (JUNK_DIR.has(nm.toLowerCase())) rep.info(relPath(modDir, p), 0, 'EXCLUDED', 'editor/VCS junk dir not packed'); else walk(p); continue; }
      if (TOOL_MARKER.test(nm)) continue;
      if (JUNK_FILE.test(nm)) { rep.info(relPath(modDir, p), 0, 'EXCLUDED', 'editor junk file not packed'); continue; }
      files.push({ file: p, rel: fwd(path.relative(resDir, p)), size: st.size });
    }
  })(resDir);
  return files;
}

function textCheck(f, buf, rep, rel) {
  const isLng = /\.lng$/i.test(f.rel);
  if (!isLng && !sdlset.isSdl('resource/' + f.rel.toLowerCase())) return;
  if (buf.includes(0)) return;                         // binary despite text-ish name
  if (isLng) {
    const r = enc.readText(buf, 'utf8');
    if (r.fatal) rep.add(rel, 1, 'LNG_NOT_UTF8', r.fatal + ' (LOC-05)');
    else if (r.badLines.length) rep.add(rel, r.badLines[0], 'LNG_NOT_UTF8', `invalid UTF-8 (${r.badLines.length} lines); .lng must be UTF-8 (LOC-05)`);
  } else {
    const bom = enc.bomKind(buf);
    // ENCFIX: as64 reads string values as UTF-8 (UTF-8 BOM skipped); identifiers must be ASCII; comments any bytes
    if (bom && bom !== 'utf8') rep.add(rel, 1, 'WARN_TEXT_BOM', `${bom} BOM; the SDL reader stops on it, save as UTF-8 or ASCII`);
    else if (buf.some(c => c >= 0x80)) {
      const sc = enc.sdlScan(buf, 1);
      if (sc.badStr.length) rep.add(rel, sc.badStr[0].line, 'WARN_STR_NOT_UTF8', 'string value is not UTF-8: legacy cp1251 bytes, shows as U+FFFD');
      if (sc.outside.length) rep.add(rel, sc.outside[0].line, 'WARN_TEXT_NONASCII_IDENT', `byte 0x${sc.outside[0].byte.toString(16)} outside a string or comment; identifiers must be ASCII`);
    }
  }
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0A && buf[i - 1] !== 0x0D) {
    let n = 1; for (let k = 0; k < i; k++) if (buf[k] === 0x0A) n++;
    rep.add(rel, n, 'WARN_TEXT_NOT_CRLF', 'bare LF line ending; parses fine but vanilla text is CRLF (SDL-53)'); break;
  }
}

function plan(modDir) {
  const rep = createReport(), resDir = path.join(modDir, 'resource');
  const roles = new Map();   // role → [{file, rel, name, size}]
  const loose = [];          // [{file, rel}] files that stay loose; write() copies them
  if (!fs.existsSync(resDir)) { rep.add('resource', 0, 'NO_RESOURCE_DIR', 'mod has no resource/ folder; nothing to pack'); return { rep, roles }; }
  // mod.info {Delete}
  const mi = path.join(modDir, 'mod.info');
  if (fs.existsSync(mi)) {
    const root = sdl.kids(sdl.parseLines(enc.readText(mi, 'cp1251').lines, () => {}), 'mod')[0];
    if (root) for (const d of sdl.kids(root, 'Delete')) rep.info('mod.info', d.line, 'MOD_DELETE', `{Delete "${d.vals.length ? d.vals[0].v : ''}"}: removed before this mod's files load; not packed (VFS-22)`);
  }
  // existing paks in resource/ → names a loose copy would shadow
  const pakNames = new Map();
  for (const nm of fs.readdirSync(resDir)) if (/\.pak$/i.test(nm)) {
    try { for (const e of pak.list(path.join(resDir, nm))) if (!e.name.endsWith('/')) pakNames.set(names.normalize(e.name), nm); }
    catch (e) { rep.add(relPath(modDir, path.join(resDir, nm)), 0, 'PAK_UNREADABLE', e.message); }
  }
  const seen = new Map();
  for (const f of scan(resDir, rep, modDir)) {
    if (/\.pak$/i.test(f.rel) && !f.rel.includes('/')) continue;
    const rel = relPath(modDir, f.file), top = f.rel.split('/')[0].toLowerCase();
    const role = f.rel.includes('/') ? ROLE[top] : null;
    if (!role) { rep.info(rel, 0, 'UNPACKED', 'not under a pak-role folder; stays loose (--out copies it beside the paks)'); loose.push({ file: f.file, rel: f.rel }); continue; }
    const wireName = wire(f.rel);
    if (Buffer.byteLength(f.rel, 'utf8') > names.ZIP_NAME_MAX) {
      rep.add(rel, 0, 'ZIP_NAME_TOO_LONG', `entry name ${Buffer.byteLength(f.rel, 'utf8')} bytes > ${names.ZIP_NAME_MAX}; engine truncates (VFS-04); excluded from pak`);
      continue;
    }
    const key = names.normalize(f.rel);
    if (seen.has(key)) { rep.add(rel, 0, 'WARN_PACK_DUP_NAME', `same normalised name as ${seen.get(key)}; engine keeps one (VFS-02)`); continue; }
    seen.set(key, rel);
    if (pakNames.has(key)) rep.add(rel, 0, 'WARN_LOOSE_SHADOWS_PAK', `loose file overrides same entry in ${pakNames.get(key)} (scan order, packing.md)`);
    if (f.size >= MAX_ENTRY) { rep.add(rel, 0, 'PACK_ENTRY_TOO_BIG', `${(f.size / 1048576) | 0} MB >= 4 GB; engine entry size is 32-bit (VFS-39); excluded`); continue; }
    const text = /\.lng$/i.test(f.rel) || sdlset.isSdl('resource/' + f.rel.toLowerCase());
    if (text) textCheck(f, fs.readFileSync(f.file), rep, rel);   // binaries read only at write time
    if (!roles.has(role)) roles.set(role, []);
    roles.get(role).push({ rel: f.rel, name: wireName, file: f.file, size: f.size, text });
  }
  for (const [role, arr] of roles) {
    const sum = arr.reduce((s, e) => s + e.size, 0);
    rep.info(role + '.pak', 0, 'PLAN', `${arr.length} files, ${(sum / 1024) | 0} KB`);
  }
  roles.loose = loose;
  return { rep, roles };
}

function write(roles, outDir, rep, tag = '') {
  fs.mkdirSync(outDir, { recursive: true });
  if (tag) fs.writeFileSync(path.join(outDir, 'PRIVATE-GOH-README.txt'), 'PRIVATE: these paks hold GoH-origin bytes (GOH-ORIGIN.tsv). Local use only. Never publish, upload or share.\r\n');
  const when = new Date();   // entry dates = time of packing (GT-08)
  for (const [role, arr] of roles) {
    const out = path.join(outDir, role + tag + '.pak');
    writeZip(out, arr.map(e => [e.name, () => fs.readFileSync(e.file), e.text]), { date: when });   // streamed; zip64 past 4 GB
    const got = pak.list(out).filter(e => !e.name.endsWith('/')).map(e => e.name).sort();
    const want = arr.map(e => e.name).sort();
    let ok = got.length === want.length && got.every((n, i) => n === want[i]);
    if (ok) { const ents = pak.list(out), m = new Map(arr.map(e => [e.name, e.file])); ok = ents.every(e => e.name.endsWith('/') || Buffer.compare(pak.read(ents, e), fs.readFileSync(m.get(e.name))) === 0); }
    if (!ok) rep.add(role + tag + '.pak', 0, 'PACK_ROUNDTRIP', 'written pak listing/content differs from input file set');
    else rep.info(role + tag + '.pak', 0, 'WROTE', `${out} (${got.length} entries, round-trip ok)`);
  }
  // loose files (difficulties, top-level files): copied at the same path under resource/, so the --out folder is complete
  for (const l of roles.loose || []) {
    const d = path.join(outDir, l.rel);
    fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(l.file, d);
    rep.info(l.rel, 0, 'LOOSE_COPIED', `copied loose to ${fwd(d)}`);
  }
}

// files of a mod that a friend does not need (authoring notes, tool backups): left out of a package
const PKG_SKIP = /^(upgrade\.md|goh-origin\.tsv\.bak|notes?([._ -].*)?|todo([._ -].*)?|.*\.(tmp|log))$/i;
// --package: <out>/<mod folder name>/ = a ready mod folder (mod.info, files outside resource/, resource/<role>.pak, the mod's own paks, loose files)
function packagePlan(modDir, roles, rep) {
  const name = path.basename(modDir), other = [], paks = [];
  if (!fs.existsSync(path.join(modDir, 'mod.info'))) rep.add('mod.info', 0, 'PACK_NO_MODINFO', 'no mod.info: the game lists a mod folder only when it has one; nothing to package');
  (function walk(dir, rel) {
    for (const nm of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, nm), r = rel ? rel + '/' + nm : nm, st = fs.statSync(p);
      if (!rel && nm.toLowerCase() === 'resource' && st.isDirectory()) continue;
      if (st.isDirectory()) { if (!JUNK_DIR.has(nm.toLowerCase())) walk(p, r); continue; }
      if (TOOL_MARKER.test(nm) || JUNK_FILE.test(nm) || PKG_SKIP.test(nm)) { rep.info(r, 0, 'EXCLUDED', 'not needed by the game; left out of the package'); continue; }
      other.push({ file: p, rel: r });
    }
  })(modDir, '');
  const resDir = path.join(modDir, 'resource'), rename = new Map();
  if (fs.existsSync(resDir)) for (const nm of fs.readdirSync(resDir).sort()) if (/\.pak$/i.test(nm) && fs.statSync(path.join(resDir, nm)).isFile()) paks.push(nm);
  for (const role of roles.keys()) {
    if (paks.some(p => p.toLowerCase() === role + '.pak')) {
      rename.set(role, role + '_loose');
      rep.add('resource/' + role + '.pak', 0, 'WARN_PACK_PAK_CLASH', `the mod already has ${role}.pak; its loose ${role} files go into ${role}_loose.pak beside it; it sorts after ${role}.pak, so it should win for a file both hold (pak vs pak = later name wins, modweb/vfs/order, unconfirmed)`);
    }
  }
  rep.info(name, 0, 'PACKAGE', `mod folder ${name}: mod.info + ${other.length} file(s) outside resource/, ${paks.length} pak(s) of its own, ${roles.size} pak(s) made from loose files`);
  return { name, other, paks, rename };
}
function writePackage(modDir, roles, outDir, rep, pp, tag = '') {
  const dest = path.join(outDir, pp.name), res = path.join(dest, 'resource');
  fs.mkdirSync(res, { recursive: true });
  for (const o of pp.other) { const d = path.join(dest, o.rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(o.file, d); }
  for (const nm of pp.paks) fs.copyFileSync(path.join(modDir, 'resource', nm), path.join(res, nm));
  const named = new Map(); for (const [role, arr] of roles) named.set(pp.rename.get(role) || role, arr);
  named.loose = roles.loose;
  write(named, res, rep, tag);
  rep.info(pp.name, 0, 'PACKAGE_WROTE', fwd(dest));
  return dest;
}

// GoH checks of the mod root (GHVFS-04, GHVFS-27)
const GOH_BAD_NAME = /[^\x21-\x7e]|[<>+()[\]{}!@#$%^&*\-=;:\\|'"]/;
function gohCheck(modDir, rep, pkg) {
  for (const nm of fs.readdirSync(modDir)) {
    const l = nm.toLowerCase(), p = path.join(modDir, nm);
    if (l === 'localization' || l === 'localization.pak' || l === 'resource.pak')
      rep.add(nm, 0, 'WARN_PACK_GOH_UNREAD', `Gates of Hell never reads a mod's root ${nm} (it mounts resource/, N.pat and localizations/ only, GHVFS-04); ${l === 'resource.pak' ? 'put the pak inside resource/' : 'move the text to localizations/<code>/interface/text/'}`);
    else if (l === 'localizations' && fs.statSync(p).isDirectory()) rep.info(nm, 0, 'GOH_TEXT_LOOSE', 'localizations/ stays loose (copied by --package), as in the GoH template mod');
  }
  if (pkg && GOH_BAD_NAME.test(path.basename(modDir))) rep.add(path.basename(modDir), 0, 'WARN_PACK_GOH_NAME', `Gates of Hell skips a mod folder named "${path.basename(modDir)}" (space, non-ASCII or one of <>+()[]{}!@#$%^&*-=;:\\|'", GHVFS-27); rename the folder before packaging`);
}

const USAGE = 'usage: node tools/packer/packer.js <modDir> [--out <dir>] [--package] [--dry] [--allow-private] [--goh | --exe as64|mowas_2|goh] [-q] [--summary]';
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE + '\n  default --dry: plan + checks, writes nothing. GoH guard: a mod with GOH-ORIGIN.tsv bytes still in it is refused (exit 1);\n  --allow-private packs it anyway as <role>-PRIVATE.pak, local only, never publish.'); process.exit(0); }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') o.out = args[++i]; else if (a === '--dry') o.dry = true; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true;
    else if (a === '--allow-private') o.priv = true; else if (a === '--package') o.pkg = true;
    else if (a === '--goh') o.goh = true;
    else if (a === '--exe') { const g = require('../lib/games').get(args[++i]); if (!g) { console.error('--exe must be as64, mowas_2 (mowas2) or goh\n' + USAGE); process.exit(2); } if (g.id === 'goh') o.goh = true; }
    else if (a[0] === '-' && a.length > 1) { console.error(`unknown arg ${a}\n` + USAGE); process.exit(2); }
    else pos.push(a);
  }
  if (!pos[0] || pos.length > 1 || (o.out === undefined && args.includes('--out'))) { console.error(USAGE); process.exit(2); }
  const modDir = path.resolve(pos[0]);
  if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) { console.error(`no such mod folder: ${pos[0]}\n` + USAGE); process.exit(2); }
  if (o.out && !o.dry) {
    const g = inGameInstall(o.out);
    if (g) { console.error(`refusing: --out is inside a game install (${g}); pack to a scratch dir and copy`); process.exit(2); }
  }
  const { rep, roles } = plan(modDir);
  if (o.goh) { gohCheck(modDir, rep, o.pkg); rep.info('.', 0, 'GOH_GUARD_NA', 'GoH-origin guard not run: it keeps GoH assets out of AS2 mods, this is a Gates of Hell mod'); }
  const refused = o.goh ? false : guard(modDir, rep, o.priv);
  const pp = o.pkg ? packagePlan(modDir, roles, rep) : null, noInfo = !!(pp && !fs.existsSync(path.join(modDir, 'mod.info')));
  if (o.out && !o.dry) {
    if (refused) rep.info('GOH-ORIGIN.tsv', 0, 'PACK_REFUSED', 'nothing written: GoH-origin bytes in the mod (--allow-private packs a local-only PRIVATE pak)');
    else if (noInfo) rep.info('mod.info', 0, 'PACK_REFUSED', 'nothing written: no mod.info');
    else if (pp) writePackage(modDir, roles, path.resolve(o.out), rep, pp, o.priv ? '-PRIVATE' : '');
    else write(roles, path.resolve(o.out), rep, o.priv ? '-PRIVATE' : '');
  }
  rep.print({ showInfo: !o.q, byCode: true, summary: o.summary });
  if (refused || noInfo) process.exitCode = 1;
}
// GoH guard (PACKGUARD): hits -> error findings (refuse) unless allowPrivate (-> WARN_PACK_PRIVATE). returns true when the pack must be refused
function guard(modDir, rep, allowPrivate) {
  const g = gohguard.check(modDir);
  for (const n of g.notes) rep.info(n.rel, 0, n.code, n.msg);
  if (!g.hits.length) return false;
  if (allowPrivate) {
    for (const h of g.hits) rep.add(h.rel, 0, 'WARN_PACK_PRIVATE', `${h.code}: ${h.msg}; --allow-private: local-only PRIVATE pak`);
    return false;
  }
  for (const h of g.hits) rep.add(h.rel, 0, h.code, h.msg);
  return true;
}
module.exports = { JUNK_FILE, TOOL_MARKER, plan, write, inGameInstall, guard, dosStamp, packagePlan, writePackage, gohCheck };
