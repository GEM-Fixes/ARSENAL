// sdlset: which files are SDL data + a resolver/reader over (mod folder -> vfs) shared by sdllint, keylint.
//   isSdl(key) extOf(key)   key = virtual key 'resource/...'
//   const s = createSource({ gameDir?, mods?, exe?, folder?, gameVersion?, disableVersionControl?, restorePoints?, listing? })
//     (gameVersion, disableVersionControl go to vfs.build; restorePoints: read <mod>/.arsenal-undo too, default restorePoints();
//      listing: a lib/modtree scan of folder to list it from, else the process's fresh one, else a walk. See keepOf. A full
//      (not names-only) listing is also taken as this process's fresh scan (modtree.adopt), so a mounted mod's view comes from it)
//     s.v        vfs index (or null)       s.local  Map key -> abs path of loose folder files the game mounts (keepOf)    s.folder (abs)
//     s.hasRes   folder has resource/ (then only resource/ is mounted, VFS-26)
//     s.get(key) Buffer | null   folder (+ its paks, mount order) first, then vfs      s.readVfs(key)  vfs only
//     s.packed() folder paks Map key -> {file '<pak>!<entry>'}   s.winner(key) 'local'|'pak'|'vfs'|null
//     s.open(r, from)            sdlx include resolver (records s.included)
//     s.included Set of keys that some read included (fragments)
//     s.preInclude(key)          [keys] loader-implicit includes (stuff dir .presets)
//     s.read(item, onError)      sdlx.read of {key,file,get}; null for binary
//     s.modItems() / s.isModKey(key)   vfs files whose winning layer is an active mod (paks of a mounted mod)
//     s.folderItems()            [{key,file,path,get}] SDL files of the folder (path: abs, for a readAhead)     s.vfsItems()  {key,file,get} for the whole vfs
//   restorePoints(on) -> was   process default of createSource o.restorePoints (off)
//     s.memo(on) -> was          on: get/open read each key once until memo(false) (a read-only phase of the caller); off by default
//     s.prefetch(keys) -> Promise<n>   memo on: the loose folder files of keys read through the thread pool into the memo (see there)
//     s.ahead(ra) -> was         get/open take a loose folder file from the readAhead ra when it holds it (null = off, the default)
//     s.loosePath(key)           the folder file get would read for key, else null (what a caller gives ra.add)
//   readAhead({ window, maxBytes }) -> ra   loose files read through the thread pool ahead of a reader (see the function)
// Author: Imperator_Aug (ARSENAL, ia-a308519e)
const fs = require('fs'), path = require('path');
const { bomKind } = require('./enc'), sdlx = require('./sdlx'), vfs = require('./vfs'), pak = require('./pak');
const { relPath } = require('./report');
const gameview = require('./gameview'), modtree = require('./modtree');

// the game (+ listed mods) view: the shared one of lib/gameview (the game is mounted once per process, a listed mod is read from
// its lib/modtree scan when this process has one, else walked as before; never served by age). An exe word gameview would read
// another way than vfs.build (as64 named for a folder without as64.exe, an unknown word) is built directly, as before.
function viewOf(o) {
  const bo = { gameDir: o.gameDir, mods: o.mods, exe: o.exe, gameVersion: o.gameVersion, disableVersionControl: o.disableVersionControl };
  const e = o.exe, shared = !e || e === 'mowas_2' || e === 'mowas2' || e === 'goh' || (e === 'as64' && fs.existsSync(path.join(o.gameDir, 'as64.exe')));
  if (!shared || (o.mods != null && !Array.isArray(o.mods))) return vfs.build(bo);
  // o.listing (a full scan of the folder, also the scan a worker thread is handed): when that folder is a mounted mod, the view
  // lists it from there too (lib/vfs listings: same records), not by a walk with a stat per file (~22 s on a 112k-file mod)
  if (o.listing && vfs.usableListing(o.listing) && !o.listing.names) modtree.adopt(o.listing);
  return gameview.withModsSync({ gameDir: o.gameDir, exe: e, list: o.mods || [], gameVersion: o.gameVersion, disableVersionControl: o.disableVersionControl }, { noAge: true });
}
// what of a mod folder the loose map takes (1B,: the game mounts only resource/, resource.pak, localization*
// (GoH localizations/) and N.pat from a mod root (modweb vfs/mount:23, VFS-26). keepOf({ layout, rp }) -> keep(rel) on a path
// below the folder (forward slashes, a folder or a file):
//   rp false (the default): nothing under a folder .arsenal-undo (restore points, never mounted) at any depth
//   layout (the folder has resource/): root files (mod.info, N.pat, resource.pak, as before) + resource/ + localization*/; any
//     other root folder is not mounted and not read (before: keyed resource/<folder>/..., e.g. resource/.arsenal-undo/...).
//     rp true keeps <mod>/.arsenal-undo there too, under the key it had before (resource/.arsenal-undo/...)
//   no layout (a loose resource tree): every folder but .arsenal-undo (rp false), as before
// restorePoints(on) -> was: the default of createSource o.restorePoints for this process (a caller that builds its source
// through another module, refcheck through entityindex)
let RP_DEFAULT = false;
const sameDir = (a, b) => { const A = path.resolve(String(a)), B = path.resolve(String(b)); return process.platform === 'win32' ? A.toLowerCase() === B.toLowerCase() : A === B; };
const restorePoints = on => { const was = RP_DEFAULT; RP_DEFAULT = !!on; return was; };
const UNDO = '.arsenal-undo';
function keepOf({ layout, rp }) {
  return rel => {
    const l = rel.toLowerCase();
    if (!rp && (l === UNDO || l.startsWith(UNDO + '/') || l.includes('/' + UNDO + '/') || l.endsWith('/' + UNDO))) return false;
    if (!layout) return true;
    const i = l.indexOf('/'), top = i < 0 ? null : l.slice(0, i);
    return top === null ? true : top === 'resource' || top.startsWith('localization') || (rp && top === UNDO);
  };
}
// report.walkFiles(dir, /./) that does not enter a folder keep() refuses (rel = below folder)
function walkKept(dir, relDir, keep, acc) {   // relDir: '' or 'a/b/'
  const ents = fs.readdirSync(dir, { withFileTypes: true });   // throws as walkFiles did
  for (const e of ents) {
    const p = path.join(dir, e.name), rel = relDir + e.name;
    if (e.isDirectory()) { if (keep(rel + '/')) walkKept(p, rel + '/', keep, acc); } else if (keep(rel)) acc.push(p);
  }
}
// every file of the folder keep() takes, as report.walkFiles(folder, /./) gives them, from the folder's modtree scan when this
// process has a fresh one (no readdir per folder): the listed files, plus what the scan leaves out and walkFiles takes (a link
// is one file, a folder modtree does not enter is walked)
function folderFiles(folder, T, keep) {
  const acc = [];
  if (!T) { walkKept(folder, '', keep, acc); return acc.sort(); }
  for (const r of T.files) if (keep(r[0])) acc.push(path.join(folder, r[0]));
  for (const rel of T.left) {
    const p = path.join(folder, rel);
    let st; try { st = fs.lstatSync(p); } catch (x) { continue; }
    if (st.isDirectory()) { if (keep(rel + '/')) walkKept(p, rel + '/', keep, acc); } else if (keep(rel)) acc.push(p);
  }
  return acc.sort();
}

const SDL_EXT = new Set(['def', 'mdl', 'mtl', 'def1', 'inc', 'tex', 'ext', 'set', 'dl', 'reg', 'ammo', 'weapon', 'pattern', 'mine',
  'grenade', 'hand', 'fsm', 'fx', 'font', 'ps', 'mi', 'info', 'mod', 'ctm', 'etf', 'presets', 'accuracy', 'tpl', '']);
const NOT_SDL = new Set(['resource/map/multi/pattern.info', 'resource/map/multi/ranked.info']);   // placeholder template / line list
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
// set/stuff: engine loads any file as a stuff whatever its extension ( LoadStuff; clone-entity tags like g43.test)
const isStuff = k => k.startsWith('resource/set/stuff/') && !k.includes('/_settings/');
const VCS = /(^|\/)\.(git|svn)\//;
const isSdl = k => (SDL_EXT.has(extOf(k)) || isStuff(k)) && !k.startsWith('resource/shader/') && !NOT_SDL.has(k) && !VCS.test(k);   // shaders = HLSL

// readAhead: loose files read through the thread pool ahead of a reader that takes them in a known order (entityindex buildAsync,
// soedit modelindex buildAsync, a source's memo phase). Only when the bytes arrive changes: the reader still asks for each file
// itself, in its own order; a file that was not read ahead (never added, not finished, failed, dropped) is read by the reader
// as before, so a missing or unreadable file fails there exactly as it does without the read-ahead.
//   const ra = readAhead({ window = 32, maxBytes = 64 MB })
//   ra.add(key, file)   next file the reader will want (call in the reader's order; a key is added once)
//   ra.wait(key) -> Promise | null   null: nothing to wait for (not added, or its read has ended); else resolves (never rejects)
//     when that read has ended
//   ra.take(key) -> Buffer | undefined   the bytes, once; undefined = read it yourself
//   ra.drop(key)   the reader has passed key: bytes it did not take are let go (a file it never asked for must not stay held)
//   ra.close()   drop everything; reads still running are thrown away when they end
//   ra.stats -> { added, read, taken, failed, dropped, peak }   (peak = most bytes held at once)
// Memory: at most `window` reads run at once and no new read starts while the finished, untaken bytes are over maxBytes
// (the file the reader waits for is always started), so what is held is about maxBytes plus one window of files.
function readAhead(o = {}) {
  const win = o.window || 32, cap = o.maxBytes || 64 * 1024 * 1024;
  const ents = new Map(), order = [];   // key -> { i, file, st: 0 queued | 1 reading | 2 ended, buf, p, done }
  let next = 0, flying = 0, held = 0, closed = false;
  const stats = { added: 0, read: 0, taken: 0, failed: 0, dropped: 0, peak: 0 };
  const start = e => {
    e.st = 1; flying++;
    e.p = new Promise(res => { e.done = res; });
    fs.readFile(e.file, (err, buf) => {
      flying--; e.st = 2;
      if (closed || e.gone) { /* nobody wants it any more */ }
      else if (err) stats.failed++;
      else { e.buf = buf; held += buf.length; stats.read++; if (held > stats.peak) stats.peak = held; }
      e.done(); pump();
    });
  };
  const pump = () => {
    while (!closed && next < order.length && flying < win && held < cap) { const e = order[next]; order[next++] = null; if (e.st === 0 && !e.gone) start(e); }
  };
  const forget = e => { if (e.buf) { held -= e.buf.length; e.buf = null; } e.gone = true; ents.delete(e.key); };
  return {
    stats,
    add(key, file) {
      if (closed || ents.has(key) || !file) return;
      const e = { key, i: order.length, file, st: 0, buf: null, p: null, done: null, gone: false };
      ents.set(key, e); order.push(e); stats.added++;
      pump();
    },
    wait(key) {
      const e = ents.get(key);
      if (!e || closed) return null;
      if (e.st === 0) start(e);   // the file the reader waits for is read whatever is held
      return e.st === 2 ? null : e.p;
    },
    take(key) {
      const e = ents.get(key);
      if (!e || e.st !== 2 || !e.buf) return undefined;
      const b = e.buf; forget(e); stats.taken++;
      pump();
      return b;
    },
    drop(key) { const e = ents.get(key); if (e) { stats.dropped++; forget(e); pump(); } },
    close() { closed = true; for (const e of ents.values()) { e.buf = null; e.gone = true; } ents.clear(); order.length = 0; held = 0; },
  };
}

function createSource(o) {
  const v = o.gameDir ? viewOf(o) : null;
  const readVfs = key => { const r = v && v.files.get(key); return r ? vfs.readRec(r) : null; };   // pak fd kept open (vfs.closeRecs)
  const local = new Map(), folder = o.folder && path.resolve(o.folder);
  const keyRel = r => { const rel = r.toLowerCase(); return rel.startsWith('resource/') ? rel : 'resource/' + rel; };
  const keyOf = f => keyRel(relPath(folder, f));
  // the folder's scan: o.listing (a lib/modtree scan of this folder the caller hands over, e.g. to a worker thread), else this
  // process's (modtree fresh: untouched since), when there is one: no walk, no stat per file
  let FT = null;
  if (folder && vfs.usableListing(o.listing) && sameDir(o.listing.dir, folder)) FT = o.listing;
  else { try { FT = folder ? modtree.fresh(folder) : null; } catch (x) { FT = null; } }
  if (!vfs.usableListing(FT)) FT = null;
  // (from a scan: the path below the folder is cut off the string, path.relative for 100k files costs a second)
  const cut = FT && !/[\\/]$/.test(folder) ? folder.length + 1 : 0;
  const hasRes = !!folder && fs.existsSync(path.join(folder, 'resource'));
  // restore points (<mod>/.arsenal-undo) read only when asked (o.restorePoints, else the process default restorePoints())
  const rp = o.restorePoints != null ? !!o.restorePoints : RP_DEFAULT, keep = keepOf({ layout: hasRes, rp });
  if (folder && fs.statSync(folder).isDirectory()) for (const f of folderFiles(folder, FT, keep)) local.set(cut ? keyRel(f.slice(cut).split(path.sep).join('/')) : keyOf(f), f);
  const included = new Set();
  // the folder's own paks count unless the folder is itself one of the mods mounted in v (then v holds them). Before, any
  // `mods` value (also []) dropped them, so a mod given as a folder read the vanilla copy of every packed file.
  // Mount order = the engine's MountMod (vfs.js mountRoot): resource.pak at resource/, resource/ walked
  // NTFS name order (files and dirs interleaved, a .pak keyed at its own folder, later registration wins:
  // ), localization.pak + localization/ at resource/interface/text/. A folder with none of those
  // (a loose resource tree) is walked as resource/. seq = registration number: loose vs pak of one key = higher seq wins
  // (loose set/ beats gamelogic.pak, entity.pak beats loose entity/).
  const mountedAsMod = !!(folder && v && (v.mods || []).some(id => String(id).toLowerCase() === path.basename(folder).toLowerCase()));
  const LOC = 'resource/interface/text/';
  let packedIdx = null;
  const seqIdx = new Map();
  const ntfs = a => a.sort((x, y) => { const X = x.toUpperCase(), Y = y.toUpperCase(); return X < Y ? -1 : X > Y ? 1 : 0; });
  const packed = () => {
    if (packedIdx) return packedIdx;
    packedIdx = new Map();
    if (!folder || mountedAsMod) return packedIdx;
    let n = 0;
    const addPak = (f, root) => {
      try { const l = pak.list(f); l.fd = fs.openSync(f, 'r'); for (const e of l) if (!e.name.endsWith('/')) packedIdx.set(root + e.name.toLowerCase().replace(/\\/g, '/'), { l, e, file: relPath(folder, f) + '!' + e.name, seq: ++n }); } catch (x) {}
    };
    const walk = (dir, root) => {
      // one readdir with file types per folder; only a link (or a name the listing cannot type) is stat'ed, to follow it as
      // statSync did. Before: one statSync per name (101k on the big mod when the process has no scan of it)
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (x) { return; }
      const byName = new Map(); for (const e of ents) byName.set(e.name, e);
      for (const nm of ntfs([...byName.keys()])) {
        const p = path.join(dir, nm), lnm = nm.toLowerCase(), e = byName.get(nm);
        let isDir = e.isDirectory();
        if (!isDir && !e.isFile()) { let st; try { st = fs.statSync(p); } catch (x) { continue; } isDir = st.isDirectory(); }
        if (isDir) { if (lnm !== '.git' && lnm !== '.svn' && (rp || lnm !== UNDO)) walk(p, root + lnm + '/'); }
        else if (/\.pak$/.test(lnm)) addPak(p, root);
        else seqIdx.set(keyOf(p), ++n);
      }
    };
    // the same walk over the folder's scan (FT): names in the same order, sizes not needed; what the scan left out asks the disk
    const tree = FT ? vfs.listTree(FT) : null;
    const walkL = (node, dir, root, rel) => {      // rel = dir below the folder, '' or 'a/b/'
      for (const nm of ntfs([...node.keys()])) {
        const c = node.get(nm), lnm = nm.toLowerCase();
        if (c === vfs.LIST_FS) {
          const p = path.join(dir, nm);
          let st; try { st = fs.statSync(p); } catch (x) { continue; }
          if (st.isDirectory()) { if (lnm !== '.git' && lnm !== '.svn' && (rp || lnm !== UNDO)) walk(p, root + lnm + '/'); }
          else if (/\.pak$/.test(lnm)) addPak(p, root);
          else seqIdx.set(keyOf(p), ++n);
        } else if (c instanceof Map) { if (lnm !== '.git' && lnm !== '.svn' && (rp || lnm !== UNDO)) walkL(c, path.join(dir, nm), root + lnm + '/', rel + nm + '/'); }
        else if (/\.pak$/.test(lnm)) addPak(path.join(dir, nm), root);
        else seqIdx.set(keyRel(rel + nm), ++n);
      }
    };
    // a folder of the mod root: from the scan when it is a listed folder there, else walked
    const go = (p, root) => {
      if (!tree) return walk(p, root);
      if (p === folder) return walkL(tree, p, root, '');
      const want = path.basename(p).toLowerCase();
      let c, name; for (const [k, x] of tree) if (k.toLowerCase() === want) { c = x; name = k; break; }
      if (c === undefined) return;                         // nothing listed below it
      if (c instanceof Map) walkL(c, p, root, name + '/'); else walk(p, root);
    };
    const at = nm => { const p = path.join(folder, nm); return fs.existsSync(p) ? p : null; };
    const roots = ['resource.pak', 'resource', 'localization.pak', 'localization'].map(at);
    if (!roots.some(Boolean)) { go(folder, 'resource/'); return packedIdx; }
    if (roots[0]) addPak(roots[0], 'resource/');
    if (roots[1]) go(roots[1], 'resource/');
    if (roots[2]) addPak(roots[2], LOC);
    if (roots[3]) go(roots[3], LOC);
    return packedIdx;
  };
  // who serves a key: 'local' (loose folder file) | 'pak' (a pak of the folder) | 'vfs' | null
  const winner = key => {
    const p = packed().get(key);
    if (p && (!local.has(key) || !(seqIdx.get(key) > p.seq))) return 'pak';
    if (local.has(key)) return 'local';
    return v && v.files.has(key) ? 'vfs' : null;
  };
  const readPacked = key => { const r = packed().get(key); return r ? pak.read(r.l, r.e) : null; };
  // memo(on): while on, get and open (virtual keys) read each key once and hand the same Buffer out again (read it, never write
  // it); off drops every kept byte. Off unless a caller switches it on for a phase in which nothing it reads is written
  // (pricecalc gather, one whole-mod check): a tool that writes and reads back must have it off. -> the state before the call
  let kept = null;
  const memo = on => { const was = !!kept; if (on) kept = kept || new Map(); else kept = null; return was; };
  // ahead(ra): a readAhead (above) the loose folder files are taken from when it holds them, null = none (the default). The caller
  // adds the files it is about to read (ra.add(key, s.loosePath(key)), in its reading order) and awaits ra.wait(key) before each
  // read; a file the read-ahead does not hold is read as before. loosePath(key) -> the folder file get reads for key, else null
  let ahead = null;
  const loosePath = key => winner(key) === 'local' ? local.get(key) : null;
  const readLocal = key => { const b = ahead ? ahead.take(key) : undefined; return b !== undefined ? b : fs.readFileSync(local.get(key)); };
  const get0 = key => { const w = winner(key); return w === 'local' ? readLocal(key) : w === 'pak' ? readPacked(key) : readVfs(key); };
  const get = key => { if (!kept) return get0(key); let b = kept.get(key); if (b === undefined) kept.set(key, b = get0(key)); return b; };
  // prefetch(keys, { window = 32, maxBytes = 64 MB }) -> Promise<count>: while memo is on, the loose folder files of keys are read
  // through the thread pool, window at a time, into the memo, so the caller's own get/open of them (in any order, afterwards)
  // finds the bytes there. Only a file get would read from the folder (winner 'local') and the memo does not hold yet; a file
  // that cannot be read is left out (the caller's read then fails as before). No more reads start once maxBytes were put in.
  // Memo off (now, or switched off meanwhile): nothing is kept. For a sync reader that can await once before it starts.
  const prefetch = async (keys, po = {}) => {
    const m = kept; if (!m) return 0;
    const win = po.window || 32, cap = po.maxBytes || 64 * 1024 * 1024, list = [...new Set(keys)].filter(k => !m.has(k) && winner(k) === 'local');
    let i = 0, bytes = 0, n = 0;
    const one = async () => {
      while (i < list.length && bytes < cap && kept === m) {
        const k = list[i++];
        let b; try { b = await fs.promises.readFile(local.get(k)); } catch (e) { continue; }
        if (kept === m && !m.has(k)) { m.set(k, b); bytes += b.length; n++; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(win, list.length) }, one));
    return n;
  };
  const open = (r, from) => {
    included.add(r.key);
    if (r.kind === 'fs') {
      const p = path.join(o.gameDir || '.', r.key);
      return fs.existsSync(p) ? { buf: fs.readFileSync(p), file: r.key, key: r.key } : null;
    }
    if (r.kind === 'user') return null;
    const w = winner(r.key);
    // (kept on: get reads the same layer winner picked here: local file, the folder's pak, else the vfs)
    if (w === 'local') return { buf: kept ? get(r.key) : readLocal(r.key), file: relPath(folder, local.get(r.key)), key: r.key };
    const pb = w === 'pak' && (kept ? get(r.key) : readPacked(r.key));
    if (pb) return { buf: pb, file: packed().get(r.key).file, key: r.key };
    const b = v && (kept ? get(r.key) : readVfs(r.key));
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  const preInclude = key => {   //  ReadStuff includes the directory's .presets into every stuff file
    if (!key.startsWith('resource/set/stuff/') || key.endsWith('/.presets') || extOf(key) === 'fsm') return [];
    const pk = key.slice(0, key.lastIndexOf('/') + 1) + '.presets';
    return (local.has(pk) || packed().has(pk) || (v && v.files.has(pk))) ? [pk] : [];
  };
  const read = (t, onError) => {
    const b = t.get();
    if (b.includes(0) && !bomKind(b)) return null;
    return sdlx.read(b, { file: t.file, key: t.key, open, onError, preInclude: preInclude(t.key) });
  };
  const folderItems = () => {
    const acc = [];
    for (const [k, f] of local) if (isSdl(k) && (!hasRes || k.startsWith('resource/')) && !/(^|\/)\.(git|svn)\//.test(k)) acc.push({ key: k, file: relPath(folder, f), path: f, get: () => fs.readFileSync(f) });
    return acc;
  };
  const vfsItems = () => { const acc = []; if (v) for (const [k] of v.files) if (isSdl(k)) acc.push({ key: k, file: k, get: () => readVfs(k) }); return acc; };
  // layer of a vfs key is a mod (not 'base' / 'patch N'): the winner record came from an active mod
  const isModKey = k => { const r = v && v.files.get(k); return !!r && r.layer !== 'base' && !/^patch [0-9]+$/.test(r.layer); };
  const modItems = layer => vfsItems().filter(t => isModKey(t.key) && (!layer || String(v.files.get(t.key).layer).toLowerCase() === layer.toLowerCase()));
  return { v, local, packed, readPacked, winner, folder, hasRes, get, readVfs, open, included, preInclude, read, folderItems, vfsItems, modItems, isModKey, memo, prefetch, loosePath, ahead: ra => { const was = ahead; ahead = ra || null; return was; } };
}

module.exports = { isSdl, extOf, createSource, readAhead, restorePoints, SDL_EXT, NOT_SDL };
