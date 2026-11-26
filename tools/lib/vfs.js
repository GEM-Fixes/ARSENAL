// vfs: emulate the engine's resource index (key -> storage) for base game + active mods.
// algorithm = (+ order mount mods patch); rows VFS-06,07,12,14,16,17,22..26. names -> lib/names.js
//   const v = build({ gameDir, mods: ['a','b:1'] | profile: 'options.set' });
//   v.files  Map virtualKey -> { source:'pak'|'loose', container, entry, layer, size, ent? }
//   v.shadows [{ key, by, over }]  by = record | { deleted:true, layer, how }; over = record|null (every overwrite/delete/re-add)
//   readRec(rec) -> Buffer (pak entry or loose file)
//   readRecsOrdered([{rec}], put(item, buf), {gap, chunk, maxBytes}) -> generator: pak entries read in offset order (one forward pass a pak)
//   v.problems [{ code, msg, where, level:'error'|'info' }]   v.mods = ordered active mod ids   v.chain(key)
//   v.exe 'as64'|'mowas_2'|'goh' (opts.exe, 'mowas2' taken as 'mowas_2' (the GUI/tools id, lib/games), else as64.exe -> as64, binaries/x64/call_to_arms.exe -> goh); opts.lang = GoH text language; v.mode 'classic'|'enhanced'|null (as64: enhanced iff list has as64+)
//   as64: layer 'as64/core' mounted after base (always), built-in mod 'as64+' = <game>/as64/plus (listed only), MOD_MODE = Classic/Enhanced filter
//   goh: roots mount resource/, N.pat, localizations/ only (GHVFS-04); Workshop item id mod_<item> (GHVFS-24); version gate: Tags develop
//     = any version, else each of Min/Max optional (GHVFS-26, GHVFS-02); mod records carry tags[] and priority (mod.info Priority,
//     default 1): mods of an equal Require count are applied in Priority order, the higher one later (GHVFS-25, GHVFS-36); goh only
// layer: 'base' | 'patch N' (base N.pat) | '<mod>' | '<mod> patch N'
//   opts.modDirs = [dir | {dir, id}]: mod folders by path mounted on top as layers (tools only; see step 5), v.modDirs = [{dir, id}]
//   opts.listings = [T]: lib/modtree scans ({dir, files: [[rel, size, mtimeMs]], left: [rel]}) of mod folders. A folder mounted
//     from inside such a dir (a listed mod, a modDirs folder) is read from the listing: no readdir, no stat per file (112k
//     files: 13 s of stat calls). Same records, same order, same problems as the walk: the listing is turned back into a
//     folder tree and gone through in the same NTFS name order; names in T.left (what modtree does not enter or list: links,
//     node_modules, .arsenal, ...) are read from disk as the walk does. A T with no left array is not used (walk).
//     Without opts.listings nothing changes. listTree(T) -> Map name -> size | Map (folder) | LIST_FS (ask the disk), the tree
//     of a scan, kept per T; usableListing(T). listed(opts) -> [{id, dir}] the installed mods opts.mods names (for the caller
//     that wants their listings first); opts as for build.
//   opts.base = a view of build({gameDir, mods: [], exe}) of the same game (lib/gameview get): the game layers (base, patches,
//     as64/core) are taken from it (records shared, not copied) and not mounted again: the result is the same view. Not used when
//     it is of another game folder or exe, has mods, or opts.profile is given. GoH: the caller sees to it that it has the same lang.
//   Without opts.base the game layers come from lib/gamecache when it holds them for this game's fingerprint (else mounted and
//     stored there): the same records, order and problems. Env ARSENAL_GAME_CACHE=0 = always mounted, nothing stored.
// Author: Imperator_Aug (ARSENAL, ia-1bb6067c)
const fs = require('fs'), path = require('path');
const names = require('./names'), pak = require('./pak'), sdl = require('./sdl'), { readText } = require('./enc'), cipath = require('./cipath');
const gamecache = require('./gamecache');
// case: index keys are names.normalize (lowercase) of on-disk names, folded once; records keep the real on-disk path for reading.
// Fixed names the engine asks for (mods, mod.info, resource[.pak], localization[.pak], N.pat, as64/core, ...) go through
// ci(): exact path when it exists (Windows: always, so results there are unchanged), else a case-blind match in the
// listing (case-sensitive file systems). opts.fs = { readdirSync, statSync, readFileSync } seam (tests: a case-strict fs).
let RUN = null;                       // { fs, cache, onClash } for one build/discover call
const F = () => (RUN ? RUN.fs : fs);
function inRun(o, fn) {
  if (RUN) return fn();
  RUN = { fs: (o && o.fs) || fs, cache: new Map(), onClash: null };
  try { return fn(); } finally { RUN = null; }
}
const ci = (dir, rel) => cipath.resolve(dir, rel, RUN ? { fs: RUN.fs, cache: RUN.cache, onClash: RUN.onClash } : { cache: new Map() });

const SKIP_EXT = new Set(['.temp', '.scc', '.s_tmp', '.s_msg', '.org', '.s_bcp', '.msg', '.txt']); // VFS-06
const SKIP_FILE = new Set(['.gitignore']), SKIP_DIR = new Set(['.svn', '.git']);                       // VFS-07
const LOC_ROOT = 'resource/interface/text/';

const fwd = p => p.replace(/\\/g, '/');
const exists = p => { if (!p) return null; try { return F().statSync(p); } catch { return null; } };
// NTFS FindNextFile order: case-insensitive (upcase) name order; engine does not sort (order.md)
const ntfsSort = a => a.sort((x, y) => { const X = x.toUpperCase(), Y = y.toUpperCase(); return X < Y ? -1 : X > Y ? 1 : 0; });
const verParse = s => String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
const verCmp = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };

// options.set -> { mods: ['name:ver',...], problems }. also settings.set lastGameVersion check (list wiped on mismatch)
function readModList(optionsFile, gameVersion = '3.262.1') {
  const problems = [];
  const r = readText(optionsFile, 'cp1251');
  if (r.fatal) return { mods: [], problems: [{ code: 'PROFILE_BAD', msg: r.fatal, where: optionsFile, level: 'error' }] };
  const top = sdl.parseLines(r.lines);
  let mods = [];
  (function walk(n) { for (const k of n.kids) { if ((k.name || '').toLowerCase() === 'mods' && !k.kids.length) mods = mods.concat(k.vals.map(v => v.v)); else walk(k); } })(top);
  const sf = ci(path.dirname(optionsFile), 'settings.set');
  if (sf && exists(sf)) {
    const s = readText(sf, 'cp1251'), t = sdl.parseLines(s.lines);
    let lv = null;
    (function walk(n) { for (const k of n.kids) { if ((k.name || '').toLowerCase() === 'lastgameversion' && k.vals.length) lv = k.vals[0].v; else walk(k); } })(t);
    if (lv !== null && verCmp(verParse(lv), verParse(gameVersion)) !== 0 && mods.length) {
      problems.push({ code: 'MODS_WIPED_VERSION', msg: `settings.set lastGameVersion ${lv} != ${gameVersion}: engine empties {mods} (${mods.length} dropped)`, where: sf, level: 'error' });
      mods = [];
    }
  }
  return { mods, problems };
}

// discover mods/<folder>/mod.info
// as64 only: the built-in mod as64/plus/ is loaded FIRST ( LoadMods), so a mods/ folder of the same name
// never replaces it (g_mods.insert fails); its id is forced to PLUS_MOD_NAME
const PLUS_MOD_NAME = 'as64+';
function discover(gameDir, problems, o = {}) { return inRun(o, () => discover0(gameDir, problems, o)); }
function discover0(gameDir, problems, o) {
  const found = new Map(), md = ci(gameDir, 'mods') || path.join(gameDir, 'mods');
  const readMod = (id, f, dir, mi, builtIn) => {
    const r = readText(mi, 'cp1251');
    const root = sdl.kids(sdl.parseLines(r.lines), 'mod')[0];
    const vals = k => root ? sdl.kids(root, k).map(b => b.vals.length ? b.vals[0].v : '') : [];
    let pats = 0;
    while (exists(ci(dir, (pats + 1) + '.pat'))) pats++;
    return {
      id, folder: f, dir, patches: pats, builtIn, title: vals('Name').pop(),
      min: vals('MinGameVersion').pop(), max: vals('MaxGameVersion').pop(),
      requires: vals('Require').map(s => names.normalize(s.split(':')[0])).filter(Boolean),
      deletes: vals('Delete'),
      // GoH Tags (GHVFS-02 [V]): one string of space-separated words; 'develop' lifts the version gate. AS2 games ignore the key (VFS-20)
      tags: vals('Tags').join(' ').split(/\s+/).filter(Boolean),
      // GoH Priority (GHVFS-36 [V] ): an integer (ReadInt), default 1; orders mods of an equal Require count. AS2 games ignore it (VFS-20)
      priority: (() => { const p = vals('Priority').pop(); const n = p === undefined || p === '' ? 1 : parseInt(p, 10); return Number.isFinite(n) ? n : 0; })(),
    };
  };
  if (o.plus) { const pd = ci(gameDir, 'as64/plus'), pi = pd && ci(pd, 'mod.info'); if (exists(pi)) found.set(PLUS_MOD_NAME, readMod(PLUS_MOD_NAME, 'plus', pd, pi, true)); }
  // as64 only (VFS-51): installed Workshop items load in place, after mods/. mods/<item> = file with the title of the game's old copy: that folder is skipped
  // GoH (o.items): Workshop items too, appid 400750 when no steam_appid.txt [I order: as as64, after mods/]; id mod_<item> (GHVFS-24),
  // so the as64 'old copy by title' check (VFS-51) is as64 only
  const items = o.plus || o.items ? workshopItems(gameDir, o.workshop, o.items ? '400750' : '244450') : [], copies = new Set();
  if (o.plus) for (const it of items) { const c = ci(md, it.item); if (exists(c) && !exists(c).isDirectory()) { const t = F().readFileSync(c, 'latin1').split(/\r?\n/)[0]; if (t) copies.add(names.normalize(t)); } }
  const loadItems = () => {
    for (const it of items) {
      const mi = ci(it.dir, 'mod.info'); if (!exists(mi)) continue;
      const m = readMod(it.item, it.item, it.dir, mi, false);
      // as64: id = the normalised title; GoH: id = mod_<item number>, fixed by the item (GHVFS-24 [V]), as in a GoH {mods} list
      m.id = o.items ? 'mod_' + it.item : m.title ? names.normalize(m.title) : it.item; m.fileId = it.item;
      if (!found.has(m.id)) found.set(m.id, m);     // a mods/ folder of that name wins
    }
  };
  if (!exists(md)) { loadItems(); return found; }
  for (const f of ntfsSort(F().readdirSync(md))) {
    const dir = path.join(md, f), mi = ci(dir, 'mod.info');
    if (!exists(mi) || !exists(dir).isDirectory()) continue;
    const id = names.normalize(f);
    if (copies.has(id)) { problems.push({ code: 'MOD_WORKSHOP_COPY', msg: `folder "${f}" is an old copy of a Workshop item, which is loaded instead`, where: dir, level: 'info' }); continue; }
    if (found.has(id)) { problems.push({ code: 'MOD_DUP_FOLDER', msg: `folder "${f}" has same normalised name as an earlier folder; engine releases it`, where: dir, level: 'error' }); continue; }
    found.set(id, readMod(id, f, dir, mi, false));
  }
  loadItems();
  return found;
}

// [{ item, dir }]: opts.workshop = dir | false; default <steamapps>/workshop/content/<appid> beside a game in steamapps/common
function workshopItems(gameDir, dir, appid = '244450') {
  if (dir === false) return [];
  if (!dir) {
    if (path.basename(path.dirname(gameDir)).toLowerCase() !== 'common') return [];
    const idf = ci(gameDir, 'steam_appid.txt'), id = exists(idf) ? F().readFileSync(idf, 'latin1').trim() : appid;
    dir = ci(path.resolve(gameDir, '..', '..'), 'workshop/content/' + id);
  }
  if (!exists(dir)) return [];
  return F().readdirSync(dir).filter(n => /^\d+$/.test(n)).map(item => ({ item, dir: path.join(dir, item) })).filter(x => exists(x.dir).isDirectory());
}

// ---- opts.listings: a modtree scan as a folder tree. node = Map name -> size (file) | Map (folder) | FS (ask the disk)
const FS = Symbol('fs'), TREES = new WeakMap();
const lowDir = d => { const p = fwd(path.resolve(String(d))).replace(/\/+$/, ''); return process.platform === 'win32' ? p.toLowerCase() : p; };
function listTree(T) {
  let root = TREES.get(T);
  if (root) return root;
  root = new Map();
  const dirs = new Map([['', root]]);
  const dirOf = d => {
    let m = dirs.get(d);
    if (m) return m;
    const i = d.lastIndexOf('/'), up = dirOf(i < 0 ? '' : d.slice(0, i)), nm = d.slice(i + 1);
    m = up.get(nm);
    if (!(m instanceof Map)) { m = new Map(); up.set(nm, m); }
    dirs.set(d, m);
    return m;
  };
  const put = (rel, val) => { const i = rel.lastIndexOf('/'); dirOf(i < 0 ? '' : rel.slice(0, i)).set(rel.slice(i + 1), val); };
  for (const r of T.files) put(r[0], r[1]);
  for (const rel of T.left) put(rel, FS);
  TREES.set(T, root);
  return root;
}
const usable = T => !!T && typeof T === 'object' && !!T.dir && Array.isArray(T.files) && Array.isArray(T.left);
// the tree node of dir: undefined = no listing covers it (walk), null = covered and nothing listed there, else the Map
function listNode(lists, dir) {
  if (!lists || !lists.length) return undefined;
  const d = lowDir(dir);
  for (const L of lists) {
    if (d !== L.low && !d.startsWith(L.low + '/')) continue;
    let node = listTree(L.T);
    for (const seg of d === L.low ? [] : fwd(path.resolve(dir)).replace(/\/+$/, '').slice(L.low.length + 1).split('/')) {
      let c = node.get(seg);
      if (c === undefined) { const ls = seg.toLowerCase(); for (const [k, v] of node) if (k.toLowerCase() === ls) { c = v; break; } }
      if (c === undefined) return null;
      if (!(c instanceof Map)) return undefined;      // a link or a left-out folder: the disk knows
      node = c;
    }
    return node;
  }
  return undefined;
}

function build(opts) { return inRun(opts, () => build0(opts)); }
// the installed mods the list names, in list order: [{id, dir}] (not whether build will apply them)
function listed(opts) {
  return inRun(opts, () => {
    const gameDir = path.resolve(opts.gameDir);
    const exe = (opts.exe === 'mowas2' ? 'mowas_2' : opts.exe) || (exists(ci(gameDir, 'as64.exe')) ? 'as64' : exists(ci(gameDir, 'binaries/x64/call_to_arms.exe')) ? 'goh' : 'mowas_2');
    const found = discover(gameDir, [], { plus: exe === 'as64', items: exe === 'goh', workshop: opts.workshop }), out = [], seen = new Set();
    for (const s of opts.mods || []) {
      const i = String(s).indexOf(':'), name = i < 0 ? String(s) : String(s).slice(0, i), m = found.get(name);
      if (m && !seen.has(name)) { seen.add(name); out.push({ id: m.id, dir: m.dir }); }
    }
    return out;
  });
}
function build0(opts) {
  const t0 = Date.now();
  const gameDir = path.resolve(opts.gameDir);
  let gameVersion = opts.gameVersion || '3.262.1';
  const problems = [], gone = new Set();
  let files = new Map(), shadows = [];   // the game layers' own when lib/gamecache holds them
  const lists = (opts.listings || []).filter(usable).map(T => ({ low: lowDir(T.dir), T }));
  const prob = (code, msg, where, level = 'error') => problems.push({ code, msg, where: where || '', level });
  // two names in one folder that differ only by case (case-sensitive fs only; NTFS cannot hold them): the game would see one
  RUN.onClash = c => prob('CASE_CLASH', `${c.names.join(' / ')} differ only by letter case; the game sees one name, "${c.chosen}" used here`, fwd(c.dir), 'info');

  // ---- storage ops
  const reg = (key, rec) => {
    const old = files.get(key);
    if (old) shadows.push({ key, by: rec, over: old });
    else if (gone.delete(key)) shadows.push({ key, by: rec, over: null });
    files.set(key, rec);
  };
  const del = (key, layer, how) => {
    const old = files.get(key);
    if (!old) return 0;
    shadows.push({ key, by: { deleted: true, layer, how }, over: old });
    files.delete(key); gone.add(key);
    return 1;
  };
  const delPath = (key, layer, how) => {           // trailing '/' = prefix delete
    if (!key.endsWith('/')) return del(key, layer, how);
    let n = 0;
    for (const k of [...files.keys()]) if (k.startsWith(key)) n += del(k, layer, how);
    return n;
  };

  function mountPak(file, root, layer) {
    let ents;
    try { ents = pak.list(file); } catch (e) { prob('PAK_BAD', e.message, fwd(file)); return false; }
    const container = fwd(file);
    for (const ent of ents) {
      if (ent.name.endsWith('/')) continue;
      reg(root + names.zipEntryName(ent.name), { source: 'pak', container, entry: ent.name, layer, size: ent.size, ent });
    }
    return true;
  }

  // 3b: walk dir in NTFS order, files+dirs interleaved. vroot = virtual dir prefix (ends '/')
  function mountDir(dir, vroot, layer, container = dir) {
    const seen = new Map();
    for (const nm of ntfsSort(F().readdirSync(dir))) {
      const p = path.join(dir, nm), st = exists(p);
      if (!st) continue;
      const lname = names.normalize(nm);
      if (seen.has(lname)) prob('CASE_CLASH', `${seen.get(lname)} / ${nm} differ only by letter case; the game sees one name (here the later one shadows the earlier)`, fwd(dir), 'info');
      else seen.set(lname, nm);
      if (st.isDirectory()) {
        if (SKIP_DIR.has(lname)) continue;
        mountDir(p, vroot + lname + '/', layer, container);
      } else {
        if (SKIP_FILE.has(lname)) continue;
        const ext = names.ext(lname);
        if (ext === '.pak') { mountPak(p, vroot, layer); continue; }
        if (SKIP_EXT.has(ext)) { prob('SKIPPED_EXT', `loose ${ext} never indexed (lim VFS-06)`, fwd(p), 'info'); continue; }
        reg(vroot + lname, { source: 'loose', container: fwd(container), entry: fwd(path.relative(container, p)), layer, size: st.size });
      }
    }
  }

  // the same from a listing node (opts.listings): names in name order, a size from the row; FS names go the disk way
  // fcont = fwd(container), erel = dir's path below container ('' or 'a/b/'): what path.relative gives, without asking per file
  function mountList(node, dir, vroot, layer, container, fcont = fwd(container), erel = dir === container ? '' : fwd(path.relative(container, dir)) + '/') {
    const seen = new Map();
    for (const nm of ntfsSort([...node.keys()])) {
      const c = node.get(nm);
      let st = null;
      if (c === FS && !(st = exists(path.join(dir, nm)))) continue;
      const lname = names.normalize(nm);
      if (seen.has(lname)) prob('CASE_CLASH', `${seen.get(lname)} / ${nm} differ only by letter case; the game sees one name (here the later one shadows the earlier)`, fwd(dir), 'info');
      else seen.set(lname, nm);
      if (c === FS ? st.isDirectory() : c instanceof Map) {
        if (SKIP_DIR.has(lname)) continue;
        if (c === FS) mountDir(path.join(dir, nm), vroot + lname + '/', layer, container);
        else mountList(c, path.join(dir, nm), vroot + lname + '/', layer, container, fcont, erel + nm + '/');
      } else {
        if (SKIP_FILE.has(lname)) continue;
        const ext = names.ext(lname);
        if (ext === '.pak') { mountPak(path.join(dir, nm), vroot, layer); continue; }
        if (SKIP_EXT.has(ext)) { prob('SKIPPED_EXT', `loose ${ext} never indexed (lim VFS-06)`, fwd(path.join(dir, nm)), 'info'); continue; }
        reg(vroot + lname, { source: 'loose', container: fcont, entry: erel + nm, layer, size: c === FS ? st.size : c });
      }
    }
  }
  // a mount root's folder: from its listing when one covers it, else walked
  function mountTop(dir, vroot, layer, container = dir) {
    const node = listNode(lists, dir);
    if (node === undefined) mountDir(dir, vroot, layer, container);
    else if (node) mountList(node, dir, vroot, layer, container);
  }

  // ---- patches (patch.md)
  function docKey() {
    let best = null;
    for (const k of files.keys()) if (k.startsWith('resource/') && k.endsWith('.patch') && (best === null || k < best)) best = k;
    return best;
  }
  function mountPatches(root, limit, layerOf) {
    for (let n = 1; n <= limit; n++) {
      const f = ci(root, n + '.pat');
      if (!exists(f)) break;
      const layer = layerOf(n), where = fwd(f);
      if (!mountPak(f, 'resource/', layer)) continue;
      const dk = docKey();
      if (!dk) { prob('PATCH_NO_DOC', `Wrong patch ${n}: no *.patch document found (lim VFS-24)`, where); continue; }
      const rec = files.get(dk);
      const buf = rec.source === 'pak' ? pak.read({ file: rec.container }, rec.ent) : F().readFileSync(path.join(rec.container, rec.entry));
      const doc = readText(buf, 'cp1251');
      const pr = sdl.kids(sdl.parseLines(doc.lines), 'patch')[0];
      files.delete(dk);
      if (!pr) { prob('PATCH_ID', `Wrong patch ${n} version: ${dk} has no {Patch} block`, where); continue; }
      for (const b of pr.kids) {
        const nm = (b.name || '').toLowerCase(), a = b.vals.map(v => v.v);
        if (nm === 'id') {
          if (Number(a[0]) !== n) { prob('PATCH_ID', `Wrong patch ${n} version: {id ${a[0]}} in ${dk} (lim VFS-24)`, where); break; }
        } else if (nm === 'delete' && a.length) {
          delPath(names.normalize('resource/' + a[0]), layer, '.patch delete');
        } else if (nm === 'remap' && a.length >= 2) {
          const from = names.normalize('resource/' + a[0]), to = names.normalize('resource/' + a[1]), src = files.get(from);
          if (!src) { prob('PATCH_REMAP_MISSING', `File is not found - ${a[0]} (remap source missing; fatal, lim VFS-23)`, where); continue; }
          del(from, layer, `.patch remap -> ${a[1]}`);
          reg(to, Object.assign({}, src, { layer }));
        }
      }
    }
  }

  // GoH (opts.exe 'goh', or binaries/x64/call_to_arms.exe present): paks sit in resource/ and its subfolders, keyed at their own folder
  // (resource/entity/humanskin.pak entry humanskin/x.def = resource/entity/humanskin/x.def) [V data]; mountDir already does this.
  // localizations/<lang>.pak and localizations/<lang>/ carry <lang>/interface/text/*.pot: mounted for 'default' then opts.lang,
  // with the <lang>/ part dropped, at resource/ [I]. Version = exe version (1.067 scale), PORT-46.
  const gohExe = () => ci(gameDir, 'binaries/x64/call_to_arms.exe');
  const exe0 = (opts.exe === 'mowas2' ? 'mowas_2' : opts.exe) || (exists(ci(gameDir, 'as64.exe')) ? 'as64' : exists(gohExe()) ? 'goh' : 'mowas_2');
  const isGoh = exe0 === 'goh';
  if (isGoh && !opts.gameVersion) {
    const pe = require('./gamever').peVersion(gohExe() || path.join(gameDir, 'binaries', 'x64', 'call_to_arms.exe'));
    const g = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe);
    gameVersion = g ? g[1] + '.' + g[2] + g[3] + g[4] : '1.067';
  }
  const gohLangs = ['default', ...(opts.lang && opts.lang !== 'default' ? [names.normalize(opts.lang)] : [])];
  function mountGohLoc(root, layer) {
    const ld = ci(root, 'localizations');
    if (!exists(ld)) return;
    for (const lang of gohLangs) {
      const pk = ci(ld, lang + '.pak'), dir = ci(ld, lang);
      if (exists(pk)) {
        let ents; try { ents = pak.list(pk); } catch (e) { prob('PAK_BAD', e.message, fwd(pk)); ents = []; }
        for (const ent of ents) {
          const n = names.zipEntryName(ent.name);
          if (ent.name.endsWith('/') || !n.startsWith(lang + '/')) continue;
          reg('resource/' + n.slice(lang.length + 1), { source: 'pak', container: fwd(pk), entry: ent.name, layer, size: ent.size, ent });
        }
      }
      if (exists(dir) && exists(dir).isDirectory()) mountTop(dir, 'resource/', layer, dir);
    }
  }

  // ---- 3: base
  const layerBase = 'base';
  // resource.pak, resource/, N.pat, localization.pak, localization/ of one mount root, matched without regard to case.
  // GoH (GHVFS-04 [V], ): base and each mod mount only resource/, N.pat, localizations/; a root resource.pak
  // localization.pak and localization/ are never read (a mod root lists them as MOD_ROOT_IGNORED)
  const mountRoot = (root, L, patches, layerOf) => {
    let p;
    if (!isGoh && exists(p = ci(root, 'resource.pak'))) mountPak(p, 'resource/', L);
    if (exists(p = ci(root, 'resource'))) mountTop(p, 'resource/', L);
    if (patches) mountPatches(root, patches, layerOf);
    if (!isGoh && exists(p = ci(root, 'localization.pak'))) mountPak(p, LOC_ROOT, L);
    if (!isGoh && exists(p = ci(root, 'localization'))) mountTop(p, LOC_ROOT, L);
    if (isGoh) mountGohLoc(root, L);
  };
  const B = opts.base, base = B && B.files instanceof Map && Array.isArray(B.shadows) && Array.isArray(B.problems) && !opts.profile && B.exe === exe0
    && !(B.mods || []).length && !(B.modDirs || []).length && lowDir(B.gameDir) === lowDir(gameDir) ? B : null;
  // ---- 3c: as64.exe only: as64/core/ right after the game, always (every mode), patches=0, before any mod
  // ( MountGame: MountMod(game, ALL_PATCHES); MountMod("as64/core/", 0); MountMod
  // = resource.pak, resource/, N.pat (none for 0), localization.pak, localization/ -> resource/interface/text/)
  const exe = exe0;
  const isAs64 = exe === 'as64';
  // the game layers (base, patches, as64/core) from lib/gamecache when it holds this game's (same fingerprint), else mounted and
  // offered to it. Not with an fs seam (tests), nor when a listing covers a mounted game folder (it would be read from there).
  // Its lookups go through their own case cache: no clash line from them, the mount reports as before. Off: ARSENAL_GAME_CACHE=0
  let GC = null;
  if (!base && !opts.fs && process.env.ARSENAL_GAME_CACHE !== '0') {
    try {
      const own = new Map(), gci = (d, r) => cipath.resolve(d, r, { cache: own });
      GC = { gameDir, exe: exe0, isGoh, langs: gohLangs, coreDir: isAs64 ? gci(gameDir, 'as64/core') : null, ci: gci, exists, covered: false };
      if (lists.length) {
        const r = isGoh ? [gci(gameDir, 'resource'), ...gohLangs.map(l => gci(gameDir, 'localizations/' + l))]
          : [gameDir, GC.coreDir].filter(Boolean).flatMap(d => [gci(d, 'resource'), gci(d, 'localization')]);
        GC.covered = r.some(d => d && listNode(lists, d) !== undefined);
      }
    } catch (e) { GC = null; }
  }
  const held = GC && gamecache.take(GC);
  if (base) {
    for (const [k, r] of base.files) files.set(k, r);
    for (const sh of base.shadows) { shadows.push(sh); if (sh.by.deleted) gone.add(sh.key); else gone.delete(sh.key); }
    for (const p of base.problems) problems.push(p);
  } else if (held) {
    files = held.files; shadows = held.shadows;
    for (const sh of shadows) { if (sh.by.deleted) gone.add(sh.key); else gone.delete(sh.key); }
    for (const p of held.problems) problems.push(p);
  } else mountRoot(gameDir, layerBase, Infinity, n => 'patch ' + n);
  const coreDir = isAs64 ? ci(gameDir, 'as64/core') : null;
  if (!base && !held && isAs64 && exists(coreDir)) mountRoot(coreDir, 'as64/core', 0);
  if (GC && !held) gamecache.save(GC, { files, shadows, problems });

  // ---- 1-2: mod list
  let list = opts.mods;
  if (!list && opts.profile) {
    const r = readModList(opts.profile, gameVersion);
    list = r.mods; problems.push(...r.problems);
  }
  list = list || [];
  const found = discover(gameDir, base ? [] : problems, { plus: isAs64, items: isGoh, workshop: opts.workshop });   // base has its lines already
  const parsed = list.map(s => { const i = s.indexOf(':'); return { text: s, name: i < 0 ? s : s.slice(0, i), ver: i < 0 ? 0 : (parseInt(s.slice(i + 1), 10) || 0) }; });
  const listNames = new Set(parsed.map(p => p.name));
  const gv = verParse(gameVersion);
  // as64 mode: Enhanced iff the list names as64+; else Classic. FitsMode
  // plain version (as64 modern mods compare against it, min only) = PRODUCT_VERSION 3.301 + patch level
  const enhanced = isAs64 && parsed.some(p => p.name === PLUS_MOD_NAME);
  const mode = isAs64 ? (enhanced ? 'enhanced' : 'classic') : null;
  const pv = verParse(opts.plainVersion || ('3.301.' + (gv[2] || 0)));
  const MODERN_MIN = [3, 301];
  let act = [];
  const seen = new Set();
  for (const p of parsed) {
    const m = found.get(p.name);
    if (!m) {
      const alt = found.get(names.normalize(p.name));
      prob('MOD_UNKNOWN', `Mod '${p.text}' was disabled: Not installed` + (alt ? ` (folder "${alt.id}" exists; list text must match lowercase folder exactly, lim VFS-12)` : ' (no mods/<name>/mod.info)'), p.text);
      continue;
    }
    if (seen.has(p.name)) { prob('WARN_MOD_DUPLICATE', `mod "${p.name}" listed twice`, p.text); continue; }
    seen.add(p.name);
    const mn = verParse(m.min), mx = verParse(m.max);
    if (isAs64) {
      const modern = mn.length > 0 && verCmp(mn, MODERN_MIN) >= 0;      // IsModern
      if (!m.builtIn && modern !== enhanced) { prob('MOD_MODE', `mod "${p.name}" is made for ${modern ? 'Enhanced' : 'Classic'} mode: not applied (list ${enhanced ? 'has' : 'lacks'} as64+)`, m.dir && fwd(m.dir)); continue; }
      if (!opts.disableVersionControl && (modern ? verCmp(pv, mn) < 0 : (!mn.length || !mx.length || verCmp(gv, mn) < 0 || verCmp(gv, mx) > 0))) {
        prob('MOD_VERSION', `mod "${p.name}" unsupported on ${modern ? pv.join('.') : gameVersion} (Min "${m.min || ''}" Max "${m.max || ''}"); skipped`, m.dir && fwd(m.dir)); continue;
      }
    } else if (isGoh) {
      //  (GHVFS-26 [V], GHVFS-02 [V]): tag develop = any version; else below Min or above Max refused, each
      // bound optional (missing = open: a mod.info with no bounds loads); "any" = open. Game version: exe 1.0.6.7 read as 1.067 (GHNET-22)
      const anyMn = /^any$/i.test(m.min || ''), anyMx = /^any$/i.test(m.max || '');
      const develop = (m.tags || []).some(t => t.toLowerCase() === 'develop');
      const bad = !develop && ((mn.length && !anyMn && verCmp(gv, mn) < 0) || (mx.length && !anyMx && verCmp(gv, mx) > 0));
      if (!opts.disableVersionControl && bad) { prob('MOD_VERSION', `mod "${p.name}" unsupported on GoH ${gameVersion} (Min "${m.min || ''}" Max "${m.max || ''}"); skipped`, m.dir && fwd(m.dir)); continue; }
    } else if (!opts.disableVersionControl && (!mn.length || !mx.length || verCmp(gv, mn) < 0 || verCmp(gv, mx) > 0)) {
      prob('MOD_VERSION', `mod "${p.name}" unsupported on ${gameVersion} (Min "${m.min || ''}" Max "${m.max || ''}"); skipped`, m.dir && fwd(m.dir)); continue;
    }
    const missing = m.requires.filter(r => !found.has(r) || !listNames.has(r));
    if (missing.length) { prob('MOD_REQUIRE_MISSING', `mod "${p.name}" requires ${missing.join(', ')}: not installed or not in list; skipped (lim VFS-17)`, fwd(m.dir)); continue; }
    if (p.ver > m.patches) { prob('MOD_VER_GATE', `mod "${p.name}:${p.ver}" but only ${m.patches} consecutive N.pat; silently dropped (lim VFS-14)`, fwd(m.dir)); continue; }
    act.push(m);
  }
  for (let again = true; again;) {          // required mod itself skipped
    again = false;
    const ids = new Set(act.map(m => m.id));
    act = act.filter(m => {
      const miss = m.requires.filter(r => !ids.has(r));
      if (miss.length) { prob('MOD_REQUIRE_MISSING', `mod "${m.id}" requires ${miss.join(', ')} which was skipped; skipped`, fwd(m.dir)); again = true; return false; }
      return true;
    });
  }
  // SortByDependencies (VFS-16): stable by requires count, then first entry with all requires placed
  // GoH only (GHVFS-25 [V] ): the stable sort is by Require count, then Priority ascending, so among mods of an equal
  // Require count the higher Priority is applied later and wins; equal Priority keeps the list order. AS2 games have no Priority.
  const rest = act.map((m, i) => [m, i]).sort((a, b) => a[0].requires.length - b[0].requires.length || (isGoh ? (a[0].priority || 0) - (b[0].priority || 0) : 0) || a[1] - b[1]).map(x => x[0]);
  const ordered = [];
  while (rest.length) {
    const i = rest.findIndex(m => m.requires.every(r => ordered.some(o => o.id === r)));
    if (i < 0) {
      prob('DEP_CYCLE', `Dependency test error! cycle among: ${rest.map(m => m.id).join(', ')}; engine DROPS THE WHOLE MOD LIST (lim VFS-16)`, '');
      ordered.length = 0; break;
    }
    ordered.push(rest.splice(i, 1)[0]);
  }
  // AS64+ under the player's mods: theirs change its files, not the other way round ( stable_partition)
  if (ordered.some(m => m.builtIn)) ordered.splice(0, ordered.length, ...ordered.filter(m => m.builtIn), ...ordered.filter(m => !m.builtIn));

  // ---- 4: mount each mod
  for (const m of ordered) {
    const L = m.id, root = m.dir;
    for (const d of m.deletes) {                  // mod.info Delete: before the mod's own files (VFS-22)
      const n = names.normalize(d);
      if (n.startsWith('resource')) delPath(n, L, 'mod.info Delete');
    }
    mountRoot(root, L, m.patches, n => `${L} patch ${n}`);
    // VFS-25/26: root files never mounted; N.pat past a gap never mounted
    const rootSeen = new Map();
    for (const f of F().readdirSync(root)) {
      const lf = f.toLowerCase(), pm = /^(\d+)\.pat$/.exec(lf);
      if (rootSeen.has(lf)) { prob('CASE_CLASH', `${rootSeen.get(lf)} / ${f} differ only by letter case; the game sees one name`, fwd(root), 'info'); continue; }
      rootSeen.set(lf, f);
      if ((isGoh ? ['mod.info', 'resource', 'localizations'] : ['mod.info', 'resource.pak', 'resource', 'localization.pak', 'localization']).includes(lf)) continue;
      if (isGoh && ['resource.pak', 'localization.pak', 'localization'].includes(lf)) { prob('MOD_ROOT_IGNORED', `${f} in mod root is never read by GoH: it mounts only resource/, N.pat and localizations/ (GHVFS-04)`, fwd(path.join(root, f)), 'info'); continue; }
      if (pm) { if (Number(pm[1]) > m.patches) prob('PAT_GAP', `${f} not mounted: patches must be consecutive from 1.pat (have ${m.patches}) (lim VFS-14)`, fwd(path.join(root, f))); continue; }
      if (lf.endsWith('.patch')) prob('MOD_ROOT_PATCH', `${f} in mod root is never read; build it into N.pat (lim VFS-25)` + (m.patches ? ' (mod has N.pat: probably the editable source)' : ''), fwd(path.join(root, f)), m.patches ? 'info' : 'error');
      else prob('MOD_ROOT_IGNORED', `${f} in mod root is not mounted (lim VFS-26)`, fwd(path.join(root, f)), 'info');
    }
  }

  // ---- 5 (tools only, not the engine): opts.modDirs = [dir | { dir, id }], mod folders given by path, mounted after the list as
  // layers on top, whatever the mod list, the mode or the version say and wherever the folder is (inside mods/ or not). Each is
  // mounted like a mod (mod.info Delete lines, resource.pak, resource/ with its paks, N.pat, localization). A folder that is the
  // game itself or one of the mods already mounted is skipped. Layer id = the given id, else the folder name in lowercase
  // ('<name> (folder)' when a listed mod already has that id). v.modDirs = [{ dir, id }] of the folders mounted.
  const dirLayers = [];
  for (const it of opts.modDirs || []) {
    const dir0 = it && typeof it === 'object' ? it.dir : it;
    if (!dir0) continue;
    const dir = path.resolve(String(dir0)), low = fwd(dir).toLowerCase();
    const st = exists(dir);
    if (!st || !st.isDirectory()) { prob('MODDIR_MISSING', `mod folder ${fwd(dir)} is not there`, fwd(dir)); continue; }
    if (low === fwd(gameDir).toLowerCase() || ordered.some(m => fwd(path.resolve(m.dir)).toLowerCase() === low) || dirLayers.some(d => fwd(d.dir).toLowerCase() === low)) continue;
    let id = (it && typeof it === 'object' && it.id) || names.normalize(path.basename(dir));
    if (ordered.some(m => m.id === id) || dirLayers.some(d => d.id === id)) id += ' (folder)';
    const mi = ci(dir, 'mod.info');
    let deletes = [], pats = 0;
    if (exists(mi)) {
      const root = sdl.kids(sdl.parseLines(readText(mi, 'cp1251').lines), 'mod')[0];
      deletes = root ? sdl.kids(root, 'Delete').map(b => b.vals.length ? b.vals[0].v : '') : [];
    }
    while (exists(ci(dir, (pats + 1) + '.pat'))) pats++;
    for (const d of deletes) { const n = names.normalize(d); if (n.startsWith('resource')) delPath(n, id, 'mod.info Delete'); }
    mountRoot(dir, id, pats, n => `${id} patch ${n}`);
    dirLayers.push({ dir: fwd(dir), id });
  }

  if (opts.checkNames) for (const k of files.keys()) for (const p of names.validate(k)) prob(p.code, p.msg, k);

  let idx = null;
  const shadowIndex = () => { if (!idx) { idx = new Map(); for (const s of shadows) { let a = idx.get(s.key); if (!a) idx.set(s.key, a = []); a.push(s); } } return idx; };
  // all records ever bound to key, mount order (deletes included); winner = last if not a delete
  const chain = key => {
    const out = [];
    for (const s of shadowIndex().get(key) || []) { if (!out.length && s.over) out.push(s.over); out.push(s.by); }
    if (!out.length && files.has(key)) out.push(files.get(key));
    return out;
  };
  return { files, shadows, problems, mods: ordered.map(m => m.id), modDirs: dirLayers, chain, ms: Date.now() - t0, gameDir, exe, mode };
}

// bytes of one v.files record (pak entry read in place via a cached central directory, or loose file)
const _ents = new Map();   // container -> { file, fd } kept open across readRec calls; closeRecs() releases
function readRec(rec) {
  if (rec.source === 'loose') return fs.readFileSync(path.join(rec.container, rec.entry));
  let e = _ents.get(rec.container);
  if (!e) _ents.set(rec.container, e = { file: rec.container, fd: fs.openSync(rec.container, 'r') });
  return pak.read(e, rec.ent);
}
function closeRecs() { for (const e of _ents.values()) fs.closeSync(e.fd); _ents.clear(); }
// readRecsOrdered(items, put, o) -> generator: the pak records of items ([{rec}], loose ones left out) read container by container in
// offset order, neighbours less than o.gap (256 KB) apart in one read of at most o.chunk (8 MB); put(item, buf) gets the same bytes
// readRec gives. Stops starting reads once o.maxBytes (256 MB) were handed out. An entry it cannot place (bad header, cut read) is
// left out, so the caller's own readRec reads it (and fails) as before. Yields after each read (a turn for an async caller).
// Why: a key-ordered read of a cold pak on a disk is one seek per entry (GoH -vehicle.pak 5.5 GB, models + defs: 6-10 ms a read on a
// USB disk, 32k reads); offset order makes them one forward pass
function* readRecsOrdered(items, put, o = {}) {
  const gap = o.gap || 262144, chunk = o.chunk || 8388608, cap = o.maxBytes || 268435456, slack = 30 + 1024;
  const by = new Map();
  for (const it of items) { const r = it && it.rec; if (!r || r.source !== 'pak' || !r.ent) continue; let l = by.get(r.container); if (!l) by.set(r.container, l = []); l.push(it); }
  let bytes = 0;
  for (const [c, l] of by) {
    l.sort((a, b) => a.rec.ent.off - b.rec.ent.off);
    let e = _ents.get(c);
    if (!e) { try { _ents.set(c, e = { file: c, fd: fs.openSync(c, 'r') }); } catch (x) { continue; } }
    for (let i = 0; i < l.length && bytes < cap;) {
      const start = l[i].rec.ent.off; let end = start + slack + l[i].rec.ent.csize, j = i + 1;
      while (j < l.length) { const n = l[j].rec.ent, ne = n.off + slack + n.csize; if (n.off - end >= gap || ne - start > chunk) break; end = Math.max(end, ne); j++; }
      const buf = Buffer.alloc(end - start); let got = 0;
      try { while (got < buf.length) { const n = fs.readSync(e.fd, buf, got, buf.length - got, start + got); if (n <= 0) break; got += n; } } catch (x) { got = 0; }
      for (let k = i; k < j; k++) {
        const it = l[k], ent = it.rec.ent, p = ent.off - start;
        if (p + 30 > got || buf.readUInt32LE(p) !== 0x04034b50) continue;
        const ds = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
        if (ds + ent.csize > got) continue;
        let out;
        try { out = ent.method === 0 ? Buffer.from(buf.subarray(ds, ds + ent.csize)) : ent.method === 8 ? require('zlib').inflateRawSync(buf.subarray(ds, ds + ent.csize)) : null; } catch (x) { out = null; }
        if (!out) continue;
        bytes += out.length; put(it, out);
      }
      i = j;
      yield;
    }
  }
}

// same bytes? pak size+crc32 short-circuit, else byte compare
function sameRec(a, b) {
  const ea = a.ent, eb = b.ent;
  if (typeof a.size === 'number' && typeof b.size === 'number' && a.size !== b.size) return false;   // another length: no read needed
  if (ea && eb && ea.crc !== undefined && eb.crc !== undefined && ea.size !== undefined && eb.size !== undefined) return ea.size === eb.size && ea.crc === eb.crc;
  return readRec(a).equals(readRec(b));
}

// C2c: listed mods the build did not apply (not installed, wrong Classic/Enhanced mode, version, missing Require, N.pat gate), as
// "CODE msg" lines, so a caller whose key is missing can name the real cause instead of "not in the vfs"
const DROP = new Set(['MOD_UNKNOWN', 'MOD_MODE', 'MOD_VERSION', 'MOD_REQUIRE_MISSING', 'MOD_VER_GATE']);
function dropped(v) { return (v && v.problems || []).filter(p => DROP.has(p.code)).map(p => p.code + ' ' + p.msg); }
// GT-04: why one listed mod is not applied, for a page: {code, reason, text} or null when it is applied (or was never listed).
// reason is a stable key a page translates (enhanced-in-classic, classic-in-enhanced, version, not-installed, requires, patches);
// text is the same in plain English. enhanced-in-classic = the mod is made for the Enhanced mode (MinGameVersion 3.301 or more) and the
// list has no as64+, so the game runs Classic and leaves the mod out; it is not a fault of the mod files.
function dropReason(v, id) {
  if (!v || !id) return null;
  const want = names.normalize(String(id).split(':')[0]);
  if ((v.mods || []).includes(want)) return null;
  const q = s => s.includes(`mod "${want}"`) || s.includes(`Mod '${want}`) || s.includes(`Mod '${want}:`);
  const p = (v.problems || []).find(x => DROP.has(x.code) && q(x.msg || ''));
  if (!p) return null;
  const R = {
    MOD_MODE: /made for Enhanced/.test(p.msg)
      ? ['enhanced-in-classic', 'Your mod is made for the Enhanced mode (MinGameVersion 3.301 or more), but the mod list has no as64+, so the game runs in Classic mode and leaves your mod out. Enable as64+ (and only Enhanced mods) to use it.']
      : ['classic-in-enhanced', 'Your mod is an older Classic mod, but the mod list has as64+, so the game runs in Enhanced mode and leaves your mod out. Give it MinGameVersion 3.301, or play it without as64+.'],
    MOD_VERSION: ['version', 'The version range in your mod.info does not fit this game version, so the game leaves your mod out.'],
    MOD_UNKNOWN: ['not-installed', 'The game does not find your mod in its mods folder (the name in the list must be the folder name in lowercase).'],
    MOD_REQUIRE_MISSING: ['requires', 'Your mod needs another mod (Require in mod.info) that is not installed or not in the list, so the game leaves it out.'],
    MOD_VER_GATE: ['patches', 'The mod list asks for more numbered patch files (N.pat) than your mod has, so the game leaves it out.'],
  }[p.code];
  return { code: p.code, reason: R[0], text: R[1] };
}

module.exports = { build, listed, listTree, usableListing: usable, LIST_FS: FS, readModList, readRec, readRecsOrdered, sameRec, closeRecs, SKIP_EXT, discover, dropped, dropReason };
