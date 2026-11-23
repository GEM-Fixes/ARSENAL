// doctor --release: ship checklist for a mod folder before Workshop upload / sharing (VFS-32, NET-01/13/16, VFS-06/08/26).
//   release(folder, {bigMb, quiet, game}) → report (createReport); findings = REL_*, info = size/net summaries.
//   game 'goh' (lib/games id): localizations/ (<lang>/ folders and <lang>.pak, GHLOC-01 [V], lib/vfs.js GoH mount) is mounted, not stray;
//   its <lang>.pak entries join the loose-vs-pak duplicate check. 'mowas2': modinfo runs with --exe mowas_2. as64 / none: as before
// Author: Imperator_Aug (ARSENAL, ia-2f9c0874)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { createReport } = require('../lib/report'), pak = require('../lib/pak');

const STRAY_DIRS = new Set(['.git', '.svn', '.hg', '.vs', '.vscode', '.idea', 'node_modules', '__macosx', '.github', '.claude', '.superpowers', '.worktrees']);
// certain junk: never useful to subscribers
const STRAY_FILE = /(^|\/)(thumbs\.db|desktop\.ini|\.ds_store|\.gitignore|\.gitattributes|ehthumbs\.db)$|\.(bak|orig|tmp|rej|swp|swo|autosave|old|log)$|~$|(^|\/)~\$[^/]*$|\.sav~$/i;
// heuristic: editor sources / archives / docs
const SOURCE_FILE = /\.(psd|max|blend|blend1|xcf|kra|3ds|fbx|ma|mb|zip|rar|7z|sln|suo|user|code-workspace)$/i;
const NOTE_FILE = /\.(txt|md|doc|docx|rtf|odt|pdf|xlsx?|url|lnk|bat|cmd|ps1|sh|js|py)$/i;
// NET-01: size-only classes; lobby ignores keys under these dirs (and .dds .tga .wav .ebm .lng entirely)
const SIZE_ONLY = /\.(ply|vol|mtl|anm|lua|pat)$/i;
const NET_EXEMPT_DIR = /^(resource\/)?(script|interface|texture)\//i;
const MOUNTED_ROOT = /^(mod\.info|resource\.pak|localization\.pak|\d+\.pat)$/i;

function walk(root) {
  const files = [], dirs = [];
  const rec = (d, rel) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); } catch { return; }   // DET-FIX: readdir order varies; findings and the size-only class list follow walk order
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name, full = path.join(d, e.name);
      if (e.isDirectory()) { dirs.push(r); if (!STRAY_DIRS.has(e.name.toLowerCase())) rec(full, r); }
      else files.push({ rel: r, size: fs.statSync(full).size });
    }
  };
  rec(root, '');
  return { files, dirs };
}
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const key = n => n.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '').replace(/^resource\//, '');

function release(folder, { bigMb = 50, game = null } = {}) {
  const rep = createReport(), { files, dirs } = walk(folder), goh = game === 'goh';
  const MOUNTED_DIR = goh ? /^(resource|localization|localizations)\//i : /^(resource|localization)\//i;
  // mod.info
  if (!fs.existsSync(path.join(folder, 'mod.info'))) rep.add('mod.info', 0, 'REL_NO_MOD_INFO', 'no mod.info at folder root: not a mod (VFS-20)');
  else {
    // modinfo --goh: GoH rules (tags key, one-bound gate); mowas2: --exe mowas_2 (Min+Max gate on 3.262, PORT-48), as64 / none: as before
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'modinfo', 'modinfo.js'), folder, '-q', ...(goh ? ['--goh'] : game === 'mowas2' ? ['--exe', 'mowas_2'] : [])], { encoding: 'utf8' });
    const n = (r.stdout.match(/^(\d+) findings/m) || [])[1];
    if (+n > 0) rep.add('mod.info', 0, 'REL_MODINFO_FINDINGS', `modinfo reports ${n} findings: run tools/modinfo/modinfo.js`);
  }
  // stray
  for (const d of dirs) {
    const base = d.split('/').pop();
    if (STRAY_DIRS.has(base.toLowerCase())) rep.add(d + '/', 0, 'REL_STRAY_FILE', `dev folder ships to subscribers (VFS-32)`);
  }
  for (const f of files) {
    const root = !f.rel.includes('/');
    if (STRAY_FILE.test(f.rel)) rep.add(f.rel, 0, 'REL_STRAY_FILE', 'junk/backup/autosave file ships to subscribers (VFS-32)');
    else if (SOURCE_FILE.test(f.rel)) rep.add(f.rel, 0, 'WARN_REL_STRAY_FILE', 'editor source/archive: likely not meant to ship (VFS-32 heuristic)');
    else if (root && !MOUNTED_ROOT.test(f.rel)) rep.add(f.rel, 0, 'WARN_REL_STRAY_FILE', `${NOTE_FILE.test(f.rel) ? 'note/script' : 'file'} at mod root: not mounted by the engine (VFS-26) but uploaded (VFS-32)`);
    else if (!root && !MOUNTED_DIR.test(f.rel) && !/^(\.git|\.svn)/i.test(f.rel)) rep.add(f.rel, 0, 'WARN_REL_STRAY_FILE', `outside resource/ and ${goh ? 'localizations' : 'localization'}/: not mounted (VFS-26) but uploaded (VFS-32)`);
  }
  // pak entries + loose duplicates
  const pakEnts = [], loose = new Map();
  for (const f of files) {
    if (/^(resource|localization)\.pak$/i.test(f.rel)) {
      try { for (const e of pak.list(path.join(folder, f.rel))) if (!e.name.endsWith('/')) pakEnts.push({ name: e.name, pak: f.rel, size: e.size }); }
      catch (e) { rep.add(f.rel, 0, 'REL_PAK_UNREADABLE', e.message); }
    } else if (goh && /^localizations\/[^/]+\.pak$/i.test(f.rel)) {
      // GoH <lang>.pak: entries <lang>/interface/text/.. mount like loose localizations/<lang>/.. (lib/vfs.js mountGohLoc)
      try { for (const e of pak.list(path.join(folder, f.rel))) if (!e.name.endsWith('/')) pakEnts.push({ name: 'localizations/' + e.name, pak: f.rel, size: e.size }); }
      catch (e) { rep.add(f.rel, 0, 'REL_PAK_UNREADABLE', e.message); }
    } else if (MOUNTED_DIR.test(f.rel)) loose.set(key(f.rel.replace(/^localization\//i, 'localization/')), f);
  }
  const seenDup = new Set();
  for (const e of pakEnts) {
    const k = key(e.name);
    if ((e.pak.toLowerCase().startsWith('resource') || (goh && /^localizations\//i.test(e.pak))) && loose.has(k) && !seenDup.has(k)) {
      seenDup.add(k);
      rep.add(loose.get(k).rel, 0, 'WARN_REL_PAK_LOOSE_DUP', `also in ${e.pak}: loose-vs-pak tie decided by directory order (VFS-08 [I])`);
    }
  }
  // NET-01: size-only classes
  const cls = {}, add = (name, size) => {
    if (!SIZE_ONLY.test(name)) return;
    const k = key(name);
    if (NET_EXEMPT_DIR.test(name.replace(/\\/g, '/').replace(/^\/+/, '')) || /^(script|interface|texture)\//.test(k)) return;
    const x = (cls[path.extname(name).toLowerCase()] = cls[path.extname(name).toLowerCase()] || { n: 0, b: 0 });
    x.n++; x.b += size;
  };
  for (const f of files) if (/^resource\//i.test(f.rel)) add(f.rel, f.size);
  for (const e of pakEnts) add(e.name, e.size);
  const tot = Object.values(cls).reduce((s, x) => s + x.n, 0);
  if (tot) rep.info('.', 0, 'REL_NET_SIZE_ONLY', `${tot} files lobby-checked by byte size only (same-size edits desync silently, NET-01): ` + Object.entries(cls).map(([e, x]) => `${e}×${x.n}`).join(' '));
  rep.info('.', 0, 'REL_NET_NOTE', 'players need identical game build (NET-13) and mod set for .rec replays (NET-16); keys under entity/ fx/ properties/ set/ sound/ map/ must match (VFS-29)');
  // size
  const sum = files.reduce((s, f) => s + f.size, 0);
  rep.info('.', 0, 'REL_TOTAL_SIZE', `${files.length} files, ${mb(sum)}${pakEnts.length ? `, ${pakEnts.length} pak entries` : ''}`);
  for (const f of files) if (f.size > bigMb * 1048576) rep.info(f.rel, 0, 'REL_BIG_FILE', mb(f.size));
  for (const d of dirs) if (!STRAY_DIRS.has(d.split('/').pop().toLowerCase()) && !files.some(f => f.rel.startsWith(d + '/')) && !dirs.some(x => x.startsWith(d + '/'))) rep.info(d + '/', 0, 'REL_EMPTY_DIR', 'empty directory');
  return rep;
}
module.exports = { release };
