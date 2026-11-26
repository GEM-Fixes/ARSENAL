// refcheck per-file cache across checks (X3, 5 "Repeat checks"). The per-file part of refcheck is the parse
// refs: entityindex records and the aux tables (refcheck auxSpec), each kept while the signature of every file it came from is
// the same (entityindex dh). The cross-file resolve (dangling refs, duplicates, cycles, the checks in refcheck.js) runs live on them.
// A caller that hands refcheck a new --cache file each run (tools/check: an overlay game folder in temp, its caches deleted at the
// end) got none of that: every check parsed the whole mod again. The slot keeps the built cache file in lib/cachestore (section
// 'refcheck-files', one entry per real game install + exe + mod list or folder, by real path) and, when the --cache file is not
// there at the start of a run, puts the slot's copy there first (its meta.game / meta.folder set to this run's), so entityindex
// takes every record whose files are unchanged and parses the rest. The records check themselves as before; the slot is also
// dropped when any tools/ module loaded so far (refcheck, entityindex, lib/sdlx, ...) or the game stamp (lib/gameview) differs, or
// the set of .presets files / paks in the mod folders moved (presetsStamp: records do not note a .presets that did not exist).
// Needs a full lib/modtree scan of each mod folder (refcheck makes one when no --listing covers it); none with --restore-points.
// Only a run whose cache file was missing at the start writes the slot back (once per change). Off: refcheck --no-file-cache or
// env ARSENAL_FILE_CACHE=0 (cold as before). Any error = no slot (as before).
//   seed(o, to, restorePoints, trees) -> s | null   o = refcheck options {gameDir, exe, mods, folder}; to = the cache file entityindex
//     reads; trees = the modtree scans of the folder / each mounted mod folder
//   s.used (the slot was put at `to`)   s.save()   after the build: the file at `to` into the slot when it is new or changed
// Author: Imperator_Aug (ARSENAL, ia-ff3df6e7)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const SECTION = 'refcheck-files', FORMAT = 1;
const WIN = process.platform === 'win32';
const low = s => (WIN ? s.toLowerCase() : s);
const realDir = d => { try { return fs.realpathSync.native(path.resolve(d)); } catch (e) { return path.resolve(d); } };
function codeVer() {
  const tools = path.resolve(__dirname, '..');
  const files = Object.keys(require.cache).filter(f => low(f).startsWith(low(tools + path.sep))).map(f => path.relative(tools, f).split(path.sep).join('/')).sort();
  const h = crypto.createHash('sha1').update('format ' + FORMAT + '\n');
  for (const f of files) h.update(f + '\n').update(fs.readFileSync(path.join(tools, f))).update('\n');
  return h.digest('hex');
}
// the meta object at the head of an entityindex cache file ({"meta":{...},...}, meta holds no object): [meta, end byte] | null
function headMeta(buf) {
  const s = buf.toString('utf8', 0, Math.min(buf.length, 1 << 16));
  if (!s.startsWith('{"meta":{')) return null;
  let q = false;
  for (let i = 9; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') i++; else if (ch === '"') q = false; }
    else if (ch === '"') q = true;
    else if (ch === '{') return null;
    else if (ch === '}') return [JSON.parse(s.slice(8, i + 1)), Buffer.byteLength(s.slice(0, i + 1))];
  }
  return null;
}
const sigOf = f => { try { const st = fs.statSync(f); return st.size + '|' + st.mtimeMs; } catch (e) { return null; } };

// the .presets files and the paks of the mod folders (their scans): entityindex records note a stuff dir's .presets only when it
// exists, so one added later would not show in their signatures; any change in that set (or any pak: it may hold one) = no slot
function presetsStamp(trees) {
  const rows = [];
  for (const T of trees) for (const r of T.files) {
    const l = String(r[0]).toLowerCase();
    if (l.endsWith('.presets')) rows.push(l); else if (/\.(pak|pat)$/.test(l)) rows.push(l + '|' + r[1] + '|' + r[2]);
  }
  return crypto.createHash('sha1').update(rows.sort().join('\n')).digest('hex');
}

function seed(o, to, restorePoints, trees) {
  if (process.env.ARSENAL_FILE_CACHE === '0' || o.fileCache === false || !o.gameDir || !to || !(o.folder || (o.mods && o.mods.length))) return null;
  // restore points (not in a scan) or a mod folder with no full scan: no slot
  if (restorePoints || !trees || !trees.length || trees.some(T => !T || !Array.isArray(T.files) || T.names)) return null;
  const t0 = Date.now();
  try {
    if (fs.existsSync(to)) return null;           // a cache of its own: entityindex uses it as before
    const ix = require('../entityindex/index');
    const game = path.resolve(o.gameDir);
    const parts = { v: FORMAT, game: low(realDir(ix.realGame(game))), exe: o.exe || null, mods: o.mods || null,
      modDirs: (o.mods || []).map(m => low(realDir(path.join(game, 'mods', String(m).split(':')[0])))),
      folder: o.folder ? low(realDir(o.folder)) : null, rp: !!restorePoints };
    let gst = ''; try { gst = require('../lib/gameview').stamp({ gameDir: game, exe: o.exe }); } catch (e) { gst = '?'; }
    const S = require('../lib/cachestore').open(), ver = codeVer(), stamps = { game: gst, presets: presetsStamp(trees) };
    const s = { used: false, wrote: null, saved: 0, ms: 0, save() {} };
    const g = S.getRaw(SECTION, ver, parts, stamps);
    const hm = g && g.raw ? headMeta(g.buf) : null;
    if (hm && hm[0].version === ix.VERSION && !hm[0].partial) {
      const meta = { ...hm[0], game, folder: o.folder || null };
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const tmp = to + '.' + process.pid + '.slot';
      fs.writeFileSync(tmp, Buffer.concat([Buffer.from('{"meta":' + JSON.stringify(meta)), g.buf.subarray(hm[1])]));
      fs.renameSync(tmp, to);
      s.used = true; s.wrote = sigOf(to);
    }
    s.save = () => {
      const t1 = Date.now();
      try {
        const now = sigOf(to);
        if (!now || (s.used && now === s.wrote)) return;   // unchanged since the slot was put there
        const b = fs.readFileSync(to), m = headMeta(b);
        if (!m || m[0].partial || m[0].version !== ix.VERSION) return;
        S.put(SECTION, ver, parts, stamps, b);
        s.saved = b.length;
      } catch (e) { /* best effort: the next check is cold for this mod, as before */ }
      finally { s.ms += Date.now() - t1; }
    };
    s.ms = Date.now() - t0;
    return s;
  } catch (e) { return null; }
}
module.exports = { seed, headMeta, SECTION };
