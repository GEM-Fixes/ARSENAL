#!/usr/bin/env node
// overdiff: per file a mod shadows, which SDL keys it adds/removes/changes vs what it overrode (vanilla or earlier mod).
// usage: node tools/overdiff/overdiff.js <mod folder under <game>/mods/> [--game dir] [--mods dep1,mod] [-q] [--summary]
//        node tools/overdiff/overdiff.js --game <dir> --mods a,b    (every listed mod, each vs what precedes it)
//   --exe as64|mowas_2|mowas2|goh   the game whose vfs view is compared (lib/games): MoW:AS2 has no as64/core layer, so its baseline is
//        the base game; none = the vfs default (as64 when as64.exe is in the folder, as before). --exe goh with no --game and no mod folder
//        under <GoH>/mods: the GoH install (games.install). GoH only: a mod folder outside <GoH>/mods (ARSENAL writes GoH mods outside the
//        install, lib/writeguard) is mounted by path on top (vfs modDirs) and diffed the same way. A 'mods' parent outside a GoH install
//        is not taken as <game>/mods. --exe mowas_2|goh keeps the game's mod version gate: a mod it skips gives info VFS_MOD_VERSION.
// baseline = record just before the mod's first record in vfs.chain(key); winner = mod's last record.
// key tree (lib/sdldiff.flatten; values compare semantically: 1.4 == 1.40): every block flattens to path "name/child/..." (name = first item; repeats get "[n]"); value = remaining
// scalar items. includes/macros resolve against the final vfs view; `{from "x"}` inheritance is NOT resolved.
// codes: OVR_KEY_ADDED OVR_KEY_CHANGED OVR_KEY_REMOVED (info) | OVR_FULL_SHADOW (warn: SDL file replaced and vanilla
//   keys dropped; anything layered on them or patch targets lose them) | info OVR_IDENTICAL OVR_OPAQUE_REPLACED
//   OVR_FILE_DELETED OVR_UNREADABLE | vfs problems pass through as info VFS_<code>
// rows: VFS-22 (mod.info Delete shown as OVR_FILE_DELETED) -- no VFS `chk ?` row fits the diff itself
// Author: Imperator_Aug (ARSENAL, ia-271ffbf6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const vfs = require('../lib/vfs'), sdlx = require('../lib/sdlx'), { flatten, sameValue } = require('../lib/sdldiff');
const { createReport } = require('../lib/report');
const games = require('../lib/games');

const SDL_EXT = new Set(['.def', '.set', '.ext', '.inc', '.mi', '.info']);
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(i); };

function parse(v, rec, key) {
  const buf = vfs.readRec(rec);
  const r = sdlx.read(buf, {
    file: key, key,
    open: (rk) => { const f = v.files.get(rk.key); return f ? { buf: vfs.readRec(f), file: rk.key, key: rk.key } : null; },
    onError: () => {},
  });
  return { map: flatten(r.root), buf };
}

const inLayer = (rec, id) => !!rec && !rec.deleted && typeof rec.layer === 'string' && (rec.layer === id || rec.layer.startsWith(id + ' patch '));
const isMod = (rec, id) => !!rec && typeof rec.layer === 'string' && (rec.layer === id || rec.layer.startsWith(id + ' patch '));

function check(opts) {
  const rep = createReport();
  let mods = opts.mods, targets = null, modDirs;
  const exe = opts.exe ? games.exeOf(opts.exe) : undefined;
  if (opts.exe && !exe) throw new Error('--exe must be one of as64|mowas_2|mowas2|goh');
  if (opts.folder) {
    const f = path.resolve(opts.folder), id = path.basename(f).toLowerCase();
    const underMods = path.basename(path.dirname(f)).toLowerCase() === 'mods';
    // GoH: a 'mods' parent counts as <GoH>/mods only when the folder above it is a GoH install; else the GoH install is used
    if (!opts.gameDir && underMods && (exe !== 'goh' || games.detect(path.dirname(path.dirname(f))) === 'goh')) opts.gameDir = path.dirname(path.dirname(f));
    if (!opts.gameDir && exe === 'goh') opts.gameDir = games.install('goh').dir;
    targets = [id];
    // GoH: a mod folder outside <GoH>/mods is mounted by path (its id = folder name); --mods are then its dependencies
    if (exe === 'goh' && opts.gameDir && !(underMods && path.resolve(path.dirname(path.dirname(f))).toLowerCase() === path.resolve(opts.gameDir).toLowerCase())) modDirs = [{ dir: f, id }];
    else if (!mods) mods = [id];
  }
  if (!opts.gameDir && exe === 'goh') opts.gameDir = games.install('goh').dir;
  if (!opts.gameDir) throw new Error('need --game dir (or a mod folder under <game>/mods/)');
  if (!targets) targets = (mods || []).map(m => m.split(':')[0]);
  // a named non-AS64 game keeps the vfs version gate: a mod that game skips (MOD_VERSION) is not mounted and shows as VFS_MOD_VERSION
  const v = vfs.build(Object.assign({ gameDir: opts.gameDir, mods, disableVersionControl: !(exe && exe !== 'as64') }, exe ? { exe } : {}, modDirs ? { modDirs } : {}));
  const active = new Set([...v.mods, ...(v.modDirs || []).map(d => d.id)]);
  for (const p of v.problems) if (p.level === 'error') rep.info(p.where || '.', 0, 'VFS_' + p.code, p.msg);

  let files = 0;
  try {
    for (const id of targets) {
      if (!active.has(id)) { rep.info(id, 0, 'OVR_UNREADABLE', 'mod not active in vfs (see VFS_ problems)'); continue; }
      const keys = new Set();
      for (const s of v.shadows) if (isMod(s.by, id)) keys.add(s.key);
      for (const key of [...keys].sort()) {
        const ch = v.chain(key);
        const fi = ch.findIndex(r => isMod(r, id));
        if (fi <= 0) continue;                                  // new file or no baseline
        const base = ch[fi - 1];
        let last = null; for (const r of ch) if (isMod(r, id)) last = r;
        if (base.deleted) continue;
        if (last.deleted) { rep.info(key, 0, 'OVR_FILE_DELETED', `${id}: ${last.how} removes file (was ${base.layer})`); files++; continue; }
        files++;
        let a, b, same;
        try { same = vfs.sameRec(base, last); if (!same) { a = vfs.readRec(base); b = vfs.readRec(last); } } catch (e) { rep.info(key, 0, 'OVR_UNREADABLE', e.message); continue; }
        if (same) { rep.info(key, 0, 'OVR_IDENTICAL', `${id}: byte-identical copy of ${base.layer} file; pointless shadow`); continue; }
        if (!SDL_EXT.has(extOf(key))) { rep.info(key, 0, 'OVR_OPAQUE_REPLACED', `${id}: ${extOf(key) || 'file'} replaced whole (${a.length} -> ${b.length} bytes), not key-diffable`); continue; }
        let A, B;
        try { A = parse(v, base, key).map; B = parse(v, last, key).map; } catch (e) { rep.info(key, 0, 'OVR_UNREADABLE', e.message); continue; }
        let add = 0, chg = 0, rem = 0, remTop = 0;
        for (const [p, o] of A) {
          const n = B.get(p);
          if (!n) { rem++; if (p.indexOf("/") < 0) remTop++; rep.info(key, o.line, 'OVR_KEY_REMOVED', `${id}: ${p} (was "${o.val}" in ${base.layer})`); }
          else if (!sameValue(n, o)) { chg++; rep.info(key, n.line, 'OVR_KEY_CHANGED', `${id}: ${p}: ${o.val} -> ${n.val}`); }
        }
        for (const [p, n] of B) if (!A.has(p)) { add++; rep.info(key, n.line, 'OVR_KEY_ADDED', `${id}: ${p} = ${n.val}`); }
        if (remTop) rep.add(key, 0, 'OVR_FULL_SHADOW', `${id}: replaces ${base.layer} file and drops ${remTop} top-level entries (${rem} keys removed, +${add} added, ${chg} changed); consider a smaller override/patch`);
      }
    }
  } finally { vfs.closeRecs(); }
  return { rep, files };
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { const x = args[++i]; if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (!o.folder && !o.mods) { console.error('usage: node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|goh] [-q] [--summary]'); process.exit(2); }
  let res;
  try { res = check(o); } catch (e) { console.error(e.message); process.exit(2); }
  rcPrint(res.rep, o, o.folder || o.gameDir, 'overdiff', { showInfo: !o.q, byCode: true, summary: o.summary });
  console.log(`${res.files} files`);
}
module.exports = { check, flatten };
