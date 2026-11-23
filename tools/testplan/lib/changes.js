// testplan changes: what a mod changed since a base (README "changes").
//   find(stack, {since}) -> Promise of {since, base:{kind, at, ref}, files:[{rel, state, area, size, mtimeMs}], counts, notes}
//     stack = lib/stack.js resolve(): {gameDir, exe, folder, name, state, ...}; only folder is needed (gameDir for `vanilla`).
//     since: last (default) | <N>h | <N>d | <ISO time> | git | git:<ref> | vanilla | all. Anything else rejects.
//     base.kind is the base really used: `last` with no snapshot answers with kind 'vanilla' and says so in notes.
//     files: sorted by rel. state added|changed|removed. A removed file carries the snapshot's size and mtimeMs (git: 0, null).
//     A pak entry row: rel `<pak>!<entry>`, plus `pak` (the pak's rel) and `entry`; area = the area of the path the entry
//       mounts at (resource.pak!set/x -> set), size = the entry's size, mtimeMs = the pak's. Written for a pak that is new,
//       changed or gone (last; time and git when a snapshot knows the pak; all; vanilla: the entries that differ from the game).
//     counts = the rows of files by state (a pak entry row counts as one).
//     Rejects with err.code: TP_SINCE (bad since word), TP_NOT_GIT (git mode, the mod is in no git work tree), TP_GIT (git
//       failed, unknown ref), TP_NO_MOD (no mod folder).
//   mark(stack, {plan}) -> Promise of the history line {at, files, rowsPassed, rowsFailed, rowsOpen}: writes last.json (every
//     file hashed; a hash is taken over from the last snapshot when size and mtime did not move; a file over 64 MB that is
//     no pak is not hashed) and appends the line to history.json. Row counts: opts.plan (a plan.json object), else
//     <state>/run/plan.json, else the player's ticks (rowsOpen 0).
//   parseSince(word, now) -> {kind, since, at, ref}; BIG.
// Files and areas come from lib/modtree (no .git, .arsenal, links). Byte compare everywhere: a CRLF change is a change.
// Author: Imperator_Aug (ARSENAL, ia-e98f7aa4)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const state = require('./state');

const BIG = 64 * 1024 * 1024;         // a larger file that is no pak is not hashed (snapshot sig null)
const fwd = p => String(p).replace(/\\/g, '/');
const err = (code, msg) => Object.assign(new Error(msg), { code });
const modtree = () => require('../../lib/modtree');
const pakLib = () => require('../../lib/pak');
const isPak = rel => modtree().areaOf(rel) === 'pak';

function parseSince(word, now) {
  const s = String(word === undefined || word === null ? '' : word).trim(), l = s.toLowerCase();
  const t = now === undefined ? Date.now() : now;
  if (l === '' || l === 'last') return { kind: 'last', since: 'last', at: null, ref: null };
  if (l === 'vanilla' || l === 'all') return { kind: l, since: l, at: null, ref: null };
  if (l === 'git') return { kind: 'git', since: 'git:HEAD', at: null, ref: 'HEAD' };
  if (l.startsWith('git:')) {
    const ref = s.slice(4).trim();
    if (!ref || ref[0] === '-' || /\s/.test(ref)) throw err('TP_SINCE', 'testplan: since git:<ref> needs a ref, got ' + JSON.stringify(s));
    return { kind: 'git', since: 'git:' + ref, at: null, ref };
  }
  const m = /^(\d+(?:\.\d+)?)([hd])$/.exec(l);
  if (m) return { kind: 'time', since: l, at: new Date(t - Number(m[1]) * (m[2] === 'h' ? 3600e3 : 86400e3)).toISOString(), ref: null };
  const d = /^\d{4}-\d{2}/.test(s) ? Date.parse(s) : NaN;
  if (!Number.isNaN(d)) return { kind: 'time', since: s, at: new Date(d).toISOString(), ref: null };
  throw err('TP_SINCE', 'testplan: since is last, <N>h, <N>d, an ISO time, git[:ref], vanilla or all; got ' + JSON.stringify(s));
}

// ---- file signatures ----
function sha1File(file) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha1'), s = fs.createReadStream(file);
    s.on('error', rej); s.on('data', b => h.update(b)); s.on('end', () => res(h.digest('hex')));
  });
}
// [[entry, size, crc]] sorted by entry, folders left out; null when the file is no zip
function pakEntries(file) {
  let ents;
  try { ents = pakLib().list(file); } catch (e) { return null; }
  const out = [];
  for (const e of ents) if (e.name && !e.name.endsWith('/')) out.push([e.name, e.size, e.crc >>> 0]);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
const entriesSig = ents => 'pak:' + crypto.createHash('sha1').update(ents.map(e => e.join('|')).join('\n')).digest('hex');
// sig of one file as the snapshot keeps it. out.ents = the entry list of a readable pak
async function sigOf(folder, rel, size, out) {
  const file = path.join(folder, rel);
  if (isPak(rel)) { const ents = pakEntries(file); if (ents) { if (out) out.ents = ents; return entriesSig(ents); } }
  if (size > BIG) return null;
  try { return await sha1File(file); } catch (e) { return null; }
}
async function each(list, n, fn) {
  let i = 0;
  const run = async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, run));
}

// ---- rows ----
const row = (rel, st, size, mtimeMs) => ({ rel, state: st, area: modtree().areaOf(rel), size, mtimeMs });
// the area of the path a pak entry mounts at
function entryArea(pakRel, entry) {
  const base = pakRel.slice(pakRel.lastIndexOf('/') + 1).toLowerCase(), e = fwd(entry).replace(/^\/+/, '');
  if (base.startsWith('localization')) return 'text';
  const virt = /^\d+\.pat$/.test(base) || /^resource\//i.test(e) ? e : 'resource/' + e;
  const a = modtree().areaOf(virt);
  return a === 'pak' ? 'other' : a;
}
const entryRow = (pakRel, entry, st, size, mtimeMs) => ({ rel: pakRel + '!' + entry, state: st, area: entryArea(pakRel, entry), size, mtimeMs, pak: pakRel, entry });
// entry rows of one pak: now (null = gone or unreadable) against the snapshot's list (null = none)
function entryRows(pakRel, now, was, mtimeMs) {
  const out = [], old = new Map((was || []).map(e => [e[0], e]));
  for (const e of now || []) {
    const o = old.get(e[0]);
    if (!o) out.push(entryRow(pakRel, e[0], 'added', e[1], mtimeMs));
    else { if (o[1] !== e[1] || o[2] !== e[2]) out.push(entryRow(pakRel, e[0], 'changed', e[1], mtimeMs)); old.delete(e[0]); }
  }
  for (const o of old.values()) out.push(entryRow(pakRel, o[0], 'removed', o[1], mtimeMs));
  return out;
}

// ---- since last ----
async function sinceLast(folder, T, snap, notes) {
  const out = [], was = new Map(snap.files.map(r => [r[0], r])), check = [];
  let unhashed = 0;
  for (const [rel, size, mtimeMs] of T.files) {
    const o = was.get(rel);
    was.delete(rel);
    if (!o) { out.push(row(rel, 'added', size, mtimeMs)); continue; }
    if (o[1] !== size) { out.push(row(rel, 'changed', size, mtimeMs)); continue; }
    if (o[2] !== mtimeMs) check.push([rel, size, mtimeMs, o[3]]);
  }
  await each(check, 8, async ([rel, size, mtimeMs, sig]) => {
    if (!sig) { unhashed++; out.push(row(rel, 'changed', size, mtimeMs)); return; }
    if (await sigOf(folder, rel, size) !== sig) out.push(row(rel, 'changed', size, mtimeMs));
  });
  if (unhashed) notes.push(unhashed + ' file(s) have a new time and no hash in the snapshot (over ' + (BIG >> 20) + ' MB or unreadable then): listed as changed');
  for (const o of was.values()) out.push(row(o[0], 'removed', o[1], o[2]));
  return out;
}

// pak entry rows for the pak rows of `files` (added: every entry; changed, removed: against the snapshot)
function addPakEntries(folder, files, snap, notes, mode) {
  const extra = [];
  for (const f of files) {
    if (f.area !== 'pak' || f.pak) continue;
    const was = snap && snap.paks ? snap.paks[f.rel] || null : null;
    if (f.state === 'removed') { extra.push(...entryRows(f.rel, null, was, f.mtimeMs)); continue; }
    const now = pakEntries(path.join(folder, f.rel));
    if (!now) { notes.push(f.rel + ': not readable as a pak (zip), entries not listed'); continue; }
    if (f.state === 'changed' && !was) {
      notes.push(f.rel + ': no entry list in a snapshot to compare with' + (mode === 'last' ? ', every entry listed as added' : ', entries not listed'));
      if (mode !== 'last') continue;
    }
    extra.push(...entryRows(f.rel, now, f.state === 'added' ? null : was, f.mtimeMs));
  }
  return extra;
}

// ---- since time ----
async function sinceTime(folder, T, cut, snap) {
  const out = [], known = snap ? new Set(snap.files.map(r => r[0])) : null;
  const newer = T.files.filter(r => r[2] > cut);
  await each(newer, 16, async ([rel, size, mtimeMs]) => {
    let added;
    if (known) added = !known.has(rel);
    else { try { added = (await fs.promises.stat(path.join(folder, rel))).birthtimeMs > cut; } catch (e) { added = false; } }
    out.push(row(rel, added ? 'added' : 'changed', size, mtimeMs));
  });
  return out;
}

// ---- since git ----
function git(folder, args) {
  return new Promise(res => {
    cp.execFile('git', ['-c', 'core.quotepath=off', '-C', folder, ...args], { maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      (e, so, se) => res({ ok: !e, out: String(so || ''), err: String(se || (e && e.message) || '').trim(), missing: !!(e && e.code === 'ENOENT') }));
  });
}
async function sinceGit(folder, T, base, notes) {
  const top = await git(folder, ['rev-parse', '--is-inside-work-tree']);
  if (top.missing) throw err('TP_GIT', 'testplan: git is not installed (since ' + base.since + ')');
  if (!top.ok || top.out.trim() !== 'true') throw err('TP_NOT_GIT', 'testplan: ' + fwd(folder) + ' is not in a git work tree; use --since last, a time, vanilla or all');
  const ref = await git(folder, ['rev-parse', '--verify', '--quiet', base.ref + '^{commit}']);
  if (!ref.ok) throw err('TP_GIT', 'testplan: git knows no commit ' + JSON.stringify(base.ref) + (ref.err ? ' (' + ref.err.split('\n')[0] + ')' : ''));
  const when = await git(folder, ['log', '-1', '--format=%cI', base.ref]);
  if (when.ok && when.out.trim()) { const d = Date.parse(when.out.trim()); if (!Number.isNaN(d)) base.at = new Date(d).toISOString(); }
  const diff = await git(folder, ['diff', '--name-status', '--no-renames', '-z', '--relative', base.ref, '--', '.']);
  if (!diff.ok) throw err('TP_GIT', 'testplan: git diff failed: ' + diff.err.split('\n')[0]);
  const un = await git(folder, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (!un.ok) throw err('TP_GIT', 'testplan: git ls-files failed: ' + un.err.split('\n')[0]);
  const here = new Map(T.files.map(r => [r[0].toLowerCase(), r]));
  const out = [], seen = new Set();
  let skipped = 0;
  const live = (p, st) => {
    const r = here.get(p.toLowerCase());
    if (!r) { skipped++; return; }                     // not a mod file for lib/modtree (.arsenal, node_modules, a link) or gone
    if (seen.has(r[0])) return;
    seen.add(r[0]); out.push(row(r[0], st, r[1], r[2]));
  };
  const parts = diff.out.split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const st = parts[i].trim()[0], p = parts[i + 1];
    if (!st || !p) continue;
    if (st === 'D') { if (!here.has(p.toLowerCase()) && !/(^|\/)(\.git|\.svn|\.arsenal|node_modules)\//i.test(p)) out.push(row(p, 'removed', 0, null)); }
    else live(p, st === 'A' ? 'added' : 'changed');
  }
  for (const p of un.out.split('\0')) if (p) live(p, 'added');
  if (skipped) notes.push(skipped + ' path(s) git names are not mod files (.arsenal, node_modules, links) and are left out');
  notes.push('git: files that git ignores (.gitignore) are not seen');
  return out;
}

// ---- since vanilla ----
const inLayer = (rec, id) => !!rec && typeof rec.layer === 'string' && (rec.layer === id || rec.layer.startsWith(id + ' patch '));
function sinceVanilla(stack, folder, T, notes) {
  const allAdded = () => T.files.map(r => row(r[0], 'added', r[1], r[2]));
  if (!stack.gameDir) { notes.push('no game folder: nothing to compare with, every file of the mod is listed as added'); return allAdded(); }
  const vfs = require('../../lib/vfs');
  let v;
  const id0 = path.basename(folder).toLowerCase();
  try {
    v = vfs.build(Object.assign({ gameDir: stack.gameDir, mods: [], disableVersionControl: true, modDirs: [{ dir: folder, id: id0 }], listings: [T] }, stack.exe ? { exe: stack.exe } : {}));
  } catch (e) { notes.push('the game folder could not be read (' + e.message + '): every file of the mod is listed as added'); return allAdded(); }
  const layer = (v.modDirs || []).find(d => fwd(d.dir).toLowerCase() === fwd(folder).toLowerCase());
  if (!layer) { notes.push('the mod folder could not be mounted over the game: every file of the mod is listed as added'); try { vfs.closeRecs(); } catch (e) { /* none open */ } return allAdded(); }
  const id = layer.id, seen = new Map(), ents = new Map();      // lower rel -> state | null (same as the game); pak rel lower -> entry rows
  const mt = new Map(T.files.map(r => [r[0].toLowerCase(), r]));
  let same = 0, unread = 0, deleted = 0;
  try {
    for (const s of v.shadows || []) if (s.by && s.by.deleted && inLayer(s.by, id)) deleted++;
    for (const [key, win] of v.files) {
      if (!inLayer(win, id)) continue;
      const ch = v.chain(key), fi = ch.findIndex(r => inLayer(r, id));
      const base = fi > 0 && !ch[fi - 1].deleted ? ch[fi - 1] : null;
      for (const r of ch) {
        if (!inLayer(r, id) || r.deleted) continue;
        let st = 'added';
        if (base) {
          try { st = (base.size !== undefined && r.size !== undefined && base.size !== r.size) || !vfs.sameRec(base, r) ? 'changed' : null; }
          catch (e) { st = 'changed'; unread++; }
        }
        if (st === null) same++;
        if (r.source === 'loose') seen.set(fwd(path.relative(folder, path.join(r.container, r.entry))).toLowerCase(), st);
        else {
          const prel = fwd(path.relative(folder, r.container)), low = prel.toLowerCase();
          if (!ents.has(low)) ents.set(low, []);
          if (st) { const p = mt.get(low); ents.get(low).push(entryRow(p ? p[0] : prel, r.entry, st, r.size, p ? p[2] : null)); }
        }
      }
    }
  } finally { try { vfs.closeRecs(); } catch (e) { /* none open */ } }
  const out = [];
  let unmounted = 0;
  for (const [rel, size, mtimeMs] of T.files) {
    const low = rel.toLowerCase();
    if (ents.has(low)) { const e = ents.get(low); if (e.length) { out.push(row(rel, 'added', size, mtimeMs)); out.push(...e); } continue; }
    if (seen.has(low)) { const st = seen.get(low); if (st) out.push(row(rel, st, size, mtimeMs)); continue; }
    unmounted++; out.push(row(rel, 'added', size, mtimeMs));
  }
  if (same) notes.push(same + ' file(s) are byte-identical copies of the game\'s own file and are left out');
  if (unmounted) notes.push(unmounted + ' file(s) are not game data the game mounts (mod.info, notes, skipped types): listed as added');
  if (unread) notes.push(unread + ' file(s) could not be compared (read error): listed as changed');
  if (deleted) notes.push(deleted + ' game file(s) are removed by this mod\'s mod.info Delete lines (not listed: no file of the mod)');
  overdiffNotes(stack, folder, notes);
  return out;
}
// key-level detail of the files that replace a game file: into notes only
function overdiffNotes(stack, folder, notes) {
  try {
    const od = require('../../overdiff/overdiff.js');
    const r = od.check(Object.assign({ folder, gameDir: stack.gameDir }, stack.exe ? { exe: stack.exe } : {}));
    const j = r.rep.toJSON({ tool: 'overdiff' }), n = {};
    for (const f of [...(j.findings || []), ...(j.info || [])]) n[f.code] = (n[f.code] || 0) + 1;
    const codes = Object.keys(n).sort();
    notes.push('overdiff: ' + r.files + ' file(s) replace a file of the game' + (codes.length ? '; ' + codes.map(c => c + ' ' + n[c]).join(', ') : ''));
    for (const f of (j.findings || []).slice(0, 20)) notes.push('overdiff: ' + f.file + ': ' + f.code + ' ' + f.msg);
    if ((j.findings || []).length > 20) notes.push('overdiff: ' + ((j.findings || []).length - 20) + ' more');
  } catch (e) { notes.push('overdiff: no key-level detail (' + String(e && e.message || e).split('\n')[0] + ')'); }
}

// ---- find ----
function folderOf(stack) {
  if (!stack || !stack.folder) throw err('TP_NO_MOD', 'testplan: no mod folder in the stack');
  return path.resolve(String(stack.folder));
}
async function find(stack, opts) {
  const folder = folderOf(stack);
  const base = parseSince(opts && opts.since);
  const notes = [], since = base.since;
  let T;
  try { T = ownFiles(await modtree().scan(folder)); } catch (e) { throw err('TP_NO_MOD', 'testplan: the mod folder ' + fwd(folder) + ' cannot be read (' + e.message + ')'); }
  let snap = null;
  if (base.kind === 'last' || base.kind === 'time' || base.kind === 'git') snap = state.open(state.dirOf(stack)).lastSnapshot();
  let files;
  if (base.kind === 'last' && !snap) {
    notes.push('no snapshot yet (no `mark` so far): compared with the game instead (since vanilla)');
    base.kind = 'vanilla';
  }
  if (base.kind === 'last') {
    base.at = snap.at;
    files = await sinceLast(folder, T, snap, notes);
    files.push(...addPakEntries(folder, files, snap, notes, 'last'));
  } else if (base.kind === 'time') {
    files = await sinceTime(folder, T, Date.parse(base.at), snap);
    files.push(...addPakEntries(folder, files, snap, notes, 'time'));
    notes.push('since a time: removed files cannot be seen (use since last or git)');
  } else if (base.kind === 'git') {
    files = await sinceGit(folder, T, base, notes);
    files.push(...addPakEntries(folder, files.filter(f => f.state !== 'removed'), snap, notes, 'git'));
  } else if (base.kind === 'vanilla') {
    base.ref = stack.gameDir ? fwd(stack.gameDir) : null;
    files = sinceVanilla(stack, folder, T, notes);
  } else {
    files = T.files.map(r => row(r[0], 'added', r[1], r[2]));
    files.push(...addPakEntries(folder, files, null, notes, 'all'));
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const counts = { added: 0, changed: 0, removed: 0 };
  for (const f of files) counts[f.state]++;
  return { since, base: { kind: base.kind, at: base.at, ref: base.ref }, files, counts, notes };
}

// ---- mark ----
function rowCounts(st, plan) {
  const p = plan || st.read('run/plan');
  const c = { rowsPassed: 0, rowsFailed: 0, rowsOpen: 0 };
  if (p && Array.isArray(p.rows)) {
    for (const r of p.rows) {
      if (r.status === 'pass') c.rowsPassed++;
      else if (r.status === 'fail') c.rowsFailed++;
      else if (r.status !== 'skip' && r.status !== 'na') c.rowsOpen++;
    }
    return c;
  }
  for (const t of Object.values(st.ticks())) { if (t && t.v === 'pass') c.rowsPassed++; else if (t && t.v === 'fail') c.rowsFailed++; }
  return c;
}
async function mark(stack, opts) {
  const folder = folderOf(stack), st = state.open(state.dirOf(stack));
  let T;
  try { T = ownFiles(await modtree().scan(folder)); } catch (e) { throw err('TP_NO_MOD', 'testplan: the mod folder ' + fwd(folder) + ' cannot be read (' + e.message + ')'); }
  const prev = st.lastSnapshot(), was = new Map((prev ? prev.files : []).map(r => [r[0], r]));
  const rows = new Array(T.files.length), paks = {};
  await each(T.files, 8, async ([rel, size, mtimeMs], i) => {
    const o = was.get(rel), pk = isPak(rel);
    if (o && o[1] === size && o[2] === mtimeMs && o[3] && (!pk || !o[3].startsWith('pak:') || prev.paks[rel])) {
      rows[i] = [rel, size, mtimeMs, o[3]];
      if (pk && prev.paks[rel]) paks[rel] = prev.paks[rel];
      return;
    }
    const got = {};
    rows[i] = [rel, size, mtimeMs, await sigOf(folder, rel, size, got)];
    if (got.ents) paks[rel] = got.ents;
  });
  const snap = st.snapshot({ dir: T.dir, bytes: T.bytes, all: T.all, files: rows, paks });
  return st.addMark(Object.assign({ at: snap.at, files: snap.count }, rowCounts(st, opts && opts.plan)));
}

// a mod's dot folders (.arsenal-undo = ARSENAL's undo copies, .vscode ...) are not game content: the game never reads them
function ownFiles(T) { const keep = T.files.filter(r => !/(^|\/)\.[^\/]+\//.test(String(r[0]).split('\\').join('/'))); return keep.length === T.files.length ? T : Object.assign({}, T, { files: keep, count: keep.length }); }

module.exports = { find, mark, parseSince, BIG };
