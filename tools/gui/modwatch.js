// modwatch: the GUI keeps the listing of the picked mod warm 6b, job X8). One recursive fs.watch of the mod folder
// (ReadDirectoryChangesW on Windows, no admin), the lib/modtree scan made again a few seconds after the changes settle, so a check started
// from the GUI is handed that scan (check --listing, the lib/modtree T as JSON: the format wouldload --keep-out writes) instead of walking
// the mod again. A scan is handed on only when it is provably current: every watch event since it began was looked at and none of them
// moves a row of it (path + size + modified time, letter case, the left-out folders and links). Anything unsure = no listing (the check
// lists the mod itself, the old way).
//   create({modtree, settleMs = 3000, enabled = true, watch = fs.watch}) -> {
//     set(dir)        the mod the page has picked ('' or null = none: the watch stops). Kept while disabled, so enabling starts it.
//     enable(on)      the window setting (Settings > Watch the picked mod; as2gui.modwatch false = off) and env ARSENAL_MODWATCH=0
//     status(dir)     {enabled, dir, watching, ready, sid, gen, err}: ready = the scan is current; gen counts scans whose rows changed
//                     since the watch sid began
//                     (the Check page's "check again when the mod changes" box runs once per new gen)
//     listing(dir)    the current scan T of dir, or null (not watched, not enabled, changes not settled, a scan running, a fault)
//     listingFile(dir, tmpDir) -> Promise<file | null>   T written as JSON into a new temp folder under tmpDir; drop(file) removes it
//     close() }
// Events: a change inside a left-out folder (.git, .svn, .arsenal, node_modules, .arsenal-undo) never moves the scan and is ignored;
// any other event is checked against the scan (lstat: a file whose size, time or case moved, a folder or link the scan does not know,
// a known path gone). An event with no name (the watch buffer overflowed), a watch error or the folder gone = rescan / stop.
// A change marks the scan stale at once (lib/modtree touch, so pages asking modtree.ensure walk again too).
// Author: Imperator_Aug (ARSENAL, ia-73dfb056)
'use strict';
const fs = require('fs'), path = require('path');

const SKIP = new Set(['.git', '.svn', '.arsenal', 'node_modules', '.arsenal-undo']);
const lc = s => String(s).toLowerCase();
const keyOf = d => { const p = path.resolve(String(d)).replace(/\\/g, '/'); return process.platform === 'win32' ? p.toLowerCase() : p; };

// what the scan T says is on disk: files by lowercased rel -> row, folders (from the rows' paths) and left-out entries by lowercased rel -> rel
function index(T) {
  const files = new Map(), dirs = new Map(), left = new Map();
  for (const r of T.files) {
    files.set(lc(r[0]), r);
    let i = r[0].lastIndexOf('/');
    while (i > 0) { const d = r[0].slice(0, i), k = lc(d); if (dirs.has(k)) break; dirs.set(k, d); i = d.lastIndexOf('/'); }
  }
  for (const l of T.left) left.set(lc(l), l);
  return { files, dirs, left };
}

function create(o = {}) {
  const mt = o.modtree || require('../lib/modtree'), settleMs = o.settleMs === undefined ? 3000 : o.settleMs, watchFn = o.watch || fs.watch;
  let enabled = o.enabled !== false && process.env.ARSENAL_MODWATCH !== '0';
  let want = '', cur = null, closed = false, sid = 0;
  // cur = {dir, key, w, ver, okVer, T, ix, gen, scanning, timer, pend, err, extra}
  //   ver: bumped by every event that may move the scan; okVer: the ver the scan in T was started at (current when equal)
  function stop(err) {
    if (!cur) return;
    const c = cur; cur = null;
    try { if (c.w) c.w.close(); } catch (e) { /* gone */ }
    if (c.timer) clearTimeout(c.timer);
    if (err) lastErr = { dir: c.dir, err };
  }
  let lastErr = null;
  function begin(dir) {
    const c = { sid: ++sid, dir: path.resolve(dir), key: keyOf(dir), w: null, ver: 0, okVer: -1, T: null, ix: null, gen: 0, scanning: false, timer: null, pend: 0, err: '', extra: new Map(), allSeen: '' };
    cur = c; lastErr = null;
    try {
      c.w = watchFn(c.dir, { recursive: true, persistent: false }, (ev, name) => onEvent(c, name));
      c.w.on('error', e => { if (cur === c) { mt.touch(c.dir); stop(e.code || e.message || 'watch error'); } });
    } catch (e) { cur = null; lastErr = { dir: c.dir, err: e.code || e.message || 'watch failed' }; return; }
    scan(c);
  }
  // dirty: the scan may be stale. Every further event only bumps ver (no lstat) until a new scan is started
  function dirty(c) {
    if (cur !== c) return;
    c.ver++; mt.touch(c.dir);
    arm(c);
  }
  function arm(c) {
    if (c.timer) clearTimeout(c.timer);
    c.timer = setTimeout(() => { c.timer = null; if (cur === c) scan(c); }, settleMs);
    if (c.timer.unref) c.timer.unref();
  }
  function onEvent(c, name) {
    if (cur !== c || closed) return;
    if (name == null || name === '') return dirty(c);                     // overflow: names lost
    if (c.okVer !== c.ver || !c.ix) { c.ver++; mt.touch(c.dir); if (!c.scanning) arm(c); return; }   // already stale (or first scan running)
    const rel = String(name).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const segs = rel.split('/');
    for (let i = 0; i < segs.length - 1; i++) if (SKIP.has(lc(segs[i]))) return;   // inside a left-out folder: not in the scan
    for (let i = 1; i < segs.length; i++) if (c.ix.left.has(lc(segs.slice(0, i).join('/')))) return;   // under a left-out link
    c.pend++;
    const verAt = c.ver;
    fs.lstat(path.join(c.dir, rel), (err, st) => {
      c.pend--;
      if (cur !== c || c.ver !== verAt) return;                          // stopped, or already stale
      if (!c.ix) return dirty(c);
      const k = lc(rel), ix = c.ix;
      let moved;
      if (err) moved = ix.files.has(k) || ix.dirs.has(k) || ix.left.has(k) || c.extra.has(k);
      else if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) moved = ix.left.get(k) !== rel;
      else if (st.isDirectory()) {
        const last = segs[segs.length - 1];
        if (SKIP.has(lc(last))) moved = ix.left.get(k) !== rel;
        else moved = (ix.dirs.has(k) ? ix.dirs.get(k) : c.extra.get(k)) !== rel;   // a folder the scan does not know (or another case)
        if (moved && !ix.dirs.has(k)) c.probe = (c.probe || new Map()).set(k, rel);
      } else {
        const r = ix.files.get(k);
        moved = !r || r[0] !== rel || r[1] !== st.size || r[2] !== st.mtimeMs;
      }
      if (moved) dirty(c);
    });
  }
  function scan(c) {
    if (c.scanning) { c.again = true; return; }
    c.scanning = true; c.again = false;
    const verAt = c.ver, probe = c.probe; c.probe = null;
    mt.scan(c.dir).then(T => {
      if (cur !== c) return;
      c.scanning = false;
      if (c.ver !== verAt) { arm(c); return; }                          // changed while it walked: the settle timer walks again
      const ix = index(T);
      // an empty folder made in the mod is in no row: remember it, so its next event is not taken for a new one (no walk loop)
      if (probe) for (const [k, rel] of probe) if (!ix.dirs.has(k)) c.extra.set(k, rel);
      for (const k of [...c.extra.keys()]) if (ix.dirs.has(k)) c.extra.delete(k);
      if (c.allSeen && c.allSeen !== T.all) c.gen++;
      c.T = T; c.ix = ix; c.okVer = verAt; c.err = ''; c.allSeen = T.all;
      if (c.again) scan(c);
    }, e => {
      if (cur !== c) return;
      c.scanning = false; c.T = null; c.ix = null; c.okVer = -1;
      c.err = e.code || e.message || 'scan failed';
      if (e.code === 'ENOENT') stop(c.err);
    });
  }
  function apply() {
    if (closed) return;
    const k = want && enabled ? keyOf(want) : '';
    if (cur && cur.key === k) return;
    stop();
    if (k) begin(want);
  }
  const mine = dir => !!(dir && cur && cur.key === keyOf(dir));
  function listing(dir) {
    if (!enabled || !mine(dir)) return null;
    const c = cur;
    if (!c.T || c.okVer !== c.ver || c.pend || c.scanning || c.timer || c.err) return null;
    return c.T;
  }
  return {
    set(dir) { want = typeof dir === 'string' && dir.trim() && path.isAbsolute(dir.trim()) ? dir.trim() : ''; apply(); return this.status(want); },
    enable(on) { on = !!on && process.env.ARSENAL_MODWATCH !== '0'; if (on === enabled) return; enabled = on; if (!on) stop(); apply(); },
    status(dir) {
      const d = dir || want, m = mine(d), c = m ? cur : null;
      const err = c ? c.err : lastErr && d && keyOf(lastErr.dir) === keyOf(d) ? lastErr.err : '';
      return { enabled, dir: c ? c.dir : d ? path.resolve(d) : '', watching: !!c, ready: !!listing(d), sid: c ? c.sid : 0, gen: c ? c.gen : 0, err: err || '' };
    },
    listing,
    async listingFile(dir, tmpDir) {
      const T = listing(dir);
      if (!T) return null;
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const d = await fs.promises.mkdtemp(path.join(tmpDir, 'mw-'));
        const f = path.join(d, 'listing.json');
        await fs.promises.writeFile(f, JSON.stringify(T));
        return listing(dir) === T ? f : (drop(f), null);   // changed while it was written: the old way
      } catch (e) { return null; }
    },
    drop,
    close() { closed = true; stop(); },
  };
}
function drop(f) { if (!f) return; try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch (e) { /* temp only */ } }

module.exports = { create, drop, index };
