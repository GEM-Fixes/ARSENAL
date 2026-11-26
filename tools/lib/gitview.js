// gitview: what git already knows about a mod folder (or ARSENAL itself), READ-ONLY. For caches that want a content key or
// "what changed since the last check" without reading files (GITVIEW.md). Every call: env GIT_OPTIONAL_LOCKS=0 (git status
// does not rewrite the index), GIT_LITERAL_PATHSPECS=1, -c core.fsmonitor=false (no daemon), gc.auto=0; no command that writes
// config, objects, refs or the index (rev-parse, ls-files, status, diff --name-only, hash-object without -w, check-ignore).
// Paths in and out are relative to the folder asked about, forward slashes, case as git stores them.
// Any failure (git missing, not a repo, dubious ownership, bad rev) gives null, never a throw: the caller falls back to
// size+mtime. ARSENAL_GITVIEW=0: every call null (old way). Sync forms below; the same names under `promises` give Promises
// (use those in a process that must keep reading child output: a 30 s sync git status blocks the loop).
//   repoOf(folder) -> {root, rel, gitDir} | null   rel '' = folder is the work-tree root
//   head(folder) -> commit id | null (no commit yet)
//   blobs(folder) -> Map rel -> {sha, mode, size, mtimeNs, ctimeNs}   `ls-files -s --debug -z`, stage 0 only (a conflicted path
//     is left out). size/mtime/ctime: the working-tree stat git cached when it last saw the file clean (size mod 2^32).
//   dirty(folder, {listing}) -> {set, ms, via, hashed}   set: rels whose working copy differs from the index (modified, deleted,
//     conflicted) or that are untracked and not ignored. Without listing: `git status --porcelain -z -uall --no-renames`
//     (via 'status'; full stat pass + untracked walk). With listing = a lib/modtree scan T of the same folder (not names-only):
//     via 'stat': each listed file's size+mtime against the index's cached stat (git's rule: size differs = dirty; mtime differs,
//     racy (file mtime >= index mtime) or cached size 0 = content hashed with `hash-object --stdin-paths`, same filters as
//     git); index entries not listed = deleted; unlisted files = untracked unless `check-ignore` says ignored (more than ask,
//     default 300: one `ls-files -o --exclude-standard` walk instead); the folders the
//     scan left out (T.left) asked of git status alone. hashed = files hashed. Gap: git also compares ctime; a file replaced
//     with the same size AND mtime but other bytes is seen by git, not here (same blind spot as every size+mtime key).
//     ARSENAL_GIT_CHEAP_DIRTY=0: listing ignored, git status used.
//   changedBetween(folder, revA, revB) -> [rel]   `git diff --name-only -z --no-renames revA revB` (both sides of a rename)
//   contentKey(folder, rel, snap?) -> blob sha when the file is clean (git's content hash of the cleaned bytes), else null.
//     snap = snapshot(folder) result: no git call per file; without it two git calls for that one path.
//   snapshot(folder, {listing}) -> {root, rel, head, blobs, dirty: Set, ms, via}   what a cache stores
//   toolStamp() -> {head, tools, key} | null   ARSENAL's HEAD + sha1 of `status --porcelain -z -uall -- tools` and the content
//     hash of each changed or untracked file there; key = sha1 of both. null when ARSENAL is not a git checkout (an install).
// Author: Imperator_Aug (ARSENAL, ia-fda4e378)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), crypto = require('crypto');

const off = () => process.env.ARSENAL_GITVIEW === '0';
const PRE = ['-c', 'core.fsmonitor=false', '-c', 'gc.auto=0'];
// check-ignore refuses literal pathspec magic; it matches each path as given anyway (q.lit false)
const env = q => ({ ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: q.lit === false ? '0' : '1', GIT_TERMINAL_PROMPT: '0' });
const BIG = 1 << 30;

// one git call: {cwd, args, input, ok: [exit codes]} -> {code, out: Buffer}
function gitSync(q) {
  const r = cp.spawnSync('git', PRE.concat(q.args), { cwd: q.cwd, env: env(q), input: q.input, maxBuffer: BIG, windowsHide: true });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout };
}
function gitAsync(q) {
  return new Promise((res, rej) => {
    const c = cp.execFile('git', PRE.concat(q.args), { cwd: q.cwd, env: env(q), encoding: 'buffer', maxBuffer: BIG, windowsHide: true },
      (e, out) => { if (e && typeof e.code !== 'number') rej(e); else res({ code: e ? e.code : 0, out }); });
    c.stdin.on('error', () => {});
    c.stdin.end(q.input || '');
  });
}
// each API call is a generator that yields git calls; run sync or async
function runSync(it) { let v; for (;;) { const r = it.next(v); if (r.done) return r.value; v = gitSync(r.value); } }
async function runAsync(it) { let v; for (;;) { const r = it.next(v); if (r.done) return r.value; v = await gitAsync(r.value); } }
const fail = e => { if (process.env.ARSENAL_GITVIEW_DEBUG) console.error('gitview: ' + (e && e.stack || e)); return null; };
const S = g => (...a) => { if (off()) return null; try { return runSync(g(...a)); } catch (e) { return fail(e); } };
const A = g => async (...a) => { if (off()) return null; try { return await runAsync(g(...a)); } catch (e) { return fail(e); } };
const must = r => { if (r.code !== 0) throw new Error('git exit ' + r.code); return r.out; };
const zsplit = b => { const s = b.toString('utf8'); const a = s.split('\0'); if (a[a.length - 1] === '') a.pop(); return a; };
const spec = rel => rel ? ['--', rel] : [];
const strip = (rel, p) => !rel ? p : p.startsWith(rel + '/') ? p.slice(rel.length + 1) : null;

function* gRepo(folder) {
  const r = yield { cwd: path.resolve(folder), args: ['rev-parse', '--show-toplevel', '--show-prefix', '--absolute-git-dir'] };
  const l = must(r).toString('utf8').split(/\r?\n/);
  if (!l[0]) return null;
  return { root: l[0], rel: (l[1] || '').replace(/\/$/, ''), gitDir: l[2] };
}

function* gHead(folder) {
  const r = yield { cwd: path.resolve(folder), args: ['rev-parse', '--verify', '-q', 'HEAD'] };
  return r.code === 0 ? r.out.toString('utf8').trim() || null : null;
}

// ls-files -s --debug -z: "<mode> <sha> <stage>\t<path>\0" then "  key: v\tkey: v\n" lines
function parseIndex(buf, rel) {
  const s = buf.toString('utf8'), m = new Map(), conflict = new Set();
  let i = 0;
  while (i < s.length) {
    const z = s.indexOf('\0', i); if (z < 0) break;
    const h = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]*)$/.exec(s.slice(i, z));
    let j = z + 1; const st = {};
    while (j < s.length && s.charCodeAt(j) === 32) {
      const nl = s.indexOf('\n', j), line = s.slice(j, nl < 0 ? s.length : nl);
      for (const kv of line.trim().split('\t')) { const k = /^(\w+): (.*)$/.exec(kv.trim()); if (k) st[k[1]] = k[2]; }
      j = nl < 0 ? s.length : nl + 1;
    }
    i = j;
    if (!h) continue;
    const p = strip(rel, h[4]); if (p === null) continue;
    if (h[3] !== '0') { conflict.add(p); continue; }
    const ns = v => { const t = /^(\d+):(\d+)$/.exec(v || ''); return t ? BigInt(t[1]) * 1000000000n + BigInt(t[2]) : null; };
    m.set(p, { sha: h[2], mode: h[1], size: st.size !== undefined ? +st.size : null, mtimeNs: ns(st.mtime), ctimeNs: ns(st.ctime) });
  }
  for (const p of conflict) m.delete(p);
  return { map: m, conflict };
}

function* gIndex(repo) {
  const r = yield { cwd: repo.root, args: ['ls-files', '-s', '--debug', '-z', ...spec(repo.rel)] };
  return parseIndex(must(r), repo.rel);
}

function* gBlobs(folder) {
  const repo = yield* gRepo(folder); if (!repo) return null;
  return (yield* gIndex(repo)).map;
}

// porcelain v1 -z, --no-renames: "XY path\0". dirty = worktree column Y not ' ' (?? untracked, D deleted, U conflict)
function* gStatus(repo, specs) {
  const r = yield { cwd: repo.root, args: ['status', '--porcelain', '-z', '-uall', '--no-renames', '--ignore-submodules=none', '--', ...specs] };
  const out = new Map();
  for (const e of zsplit(must(r))) if (e.length > 3) out.set(e.slice(3), e.slice(0, 2));
  return out;
}

function* gDirtyStatus(repo) {
  const set = new Set();
  for (const [p, xy] of yield* gStatus(repo, repo.rel ? [repo.rel] : ['.'])) {
    const q = strip(repo.rel, p); if (q !== null && xy[1] !== ' ') set.add(q);
  }
  return { set, via: 'status', hashed: 0 };
}

const full = (repo, p) => repo.rel ? repo.rel + '/' + p : p;
function* gHash(repo, rels) {   // rels relative to folder -> shas in the same order
  if (!rels.length) return [];
  const r = yield { cwd: repo.root, args: ['hash-object', '--stdin-paths'], input: rels.map(p => full(repo, p)).join('\n') + '\n' };
  const a = must(r).toString('utf8').split(/\r?\n/).filter(Boolean);
  if (a.length !== rels.length) throw new Error('hash-object count');
  return a;
}

// untracked candidates git status would show: not ignored themselves, no ignored folder above them (git does not enter an
// ignored folder). check-ignore costs ~0.5 ms a path, so folders are asked first, one depth per call, and nothing below an
// ignored folder is asked again
function* gNotIgnored(repo, cand) {
  const ask = function* (paths) {
    if (!paths.length) return new Set();
    const r = yield { cwd: repo.root, args: ['check-ignore', '-z', '--stdin'], lit: false, input: paths.join('\0') + '\0' };
    if (r.code !== 0 && r.code !== 1) throw new Error('check-ignore exit ' + r.code);
    return new Set(zsplit(r.out));
  };
  const files = cand.map(p => full(repo, p)), byDepth = [], seen = new Set(), dead = new Set();
  for (const f of files) for (let d = path.posix.dirname(f); d !== '.' && !seen.has(d); d = path.posix.dirname(d)) {
    seen.add(d); const k = d.split('/').length; (byDepth[k] = byDepth[k] || []).push(d);
  }
  const deadUp = d => dead.has(path.posix.dirname(d));
  for (const level of byDepth) if (level) {
    const live = [];
    for (const d of level) if (deadUp(d)) dead.add(d); else live.push(d);
    for (const d of yield* ask(live)) dead.add(d);
  }
  const rest = files.filter(f => !dead.has(path.posix.dirname(f)));
  const ign = yield* ask(rest);
  return cand.filter((p, i) => !dead.has(path.posix.dirname(files[i])) && !ign.has(files[i]));
}

const ASK_MAX = 300;   // more untracked candidates than this: ls-files -o walk instead of check-ignore (~0.5 ms a path)
function* gDirtyStat(repo, T, o = {}) {
  const { map: idx, conflict } = yield* gIndex(repo);
  let ixNs = 0n; try { ixNs = fs.statSync(path.join(repo.gitDir, 'index'), { bigint: true }).mtimeNs; } catch { }
  const set = new Set(conflict), seen = new Set(), hash = [], cand = [];
  let lower = null;
  const find = rel => {
    if (idx.has(rel)) return rel;
    if (!lower) { lower = new Map(); for (const k of idx.keys()) lower.set(k.toLowerCase(), k); }
    return lower.get(rel.toLowerCase());
  };
  for (const [rel, size, mtimeMs] of T.files) {
    if (conflict.has(rel)) continue;
    const k = find(rel);
    if (k === undefined) { cand.push(rel); continue; }
    seen.add(k);
    const e = idx.get(k);
    if (e.size === null || e.mtimeNs === null) { hash.push(k); continue; }
    if (e.size !== 0 && e.size !== size % 4294967296) { set.add(k); continue; }
    const eMs = Number(e.mtimeNs / 1000n) / 1000;
    if (e.size === 0 || Math.abs(eMs - mtimeMs) >= 0.001 || (ixNs && ixNs <= e.mtimeNs)) hash.push(k);
  }
  const left = (T.left || []).filter(l => !/(^|\/)\.git$/i.test(l));
  const under = p => left.some(l => p === l || p.startsWith(l + '/'));
  for (const k of idx.keys()) if (!seen.has(k) && !under(k)) set.add(k);
  const shas = yield* gHash(repo, hash);
  hash.forEach((k, i) => { if (shas[i] !== idx.get(k).sha) set.add(k); });
  if (cand.length <= (o.ask === undefined ? ASK_MAX : o.ask)) { for (const p of yield* gNotIgnored(repo, cand)) set.add(p); }
  else {   // many: one walk for untracked files (git's own rule, no stat of tracked files)
    const r = yield { cwd: repo.root, args: ['ls-files', '-o', '--exclude-standard', '-z', ...spec(repo.rel)] };
    for (const p of zsplit(must(r))) { const q = strip(repo.rel, p); if (q !== null) set.add(q); }
  }
  if (left.length) for (const [p, xy] of yield* gStatus(repo, left.map(l => full(repo, l)))) {
    const q = strip(repo.rel, p); if (q !== null && xy[1] !== ' ') set.add(q);
  }
  return { set, via: 'stat', hashed: hash.length };
}

function* gDirty(folder, o = {}) {
  const t0 = Date.now();
  const repo = yield* gRepo(folder); if (!repo) return null;
  const T = o.listing;
  const cheap = T && Array.isArray(T.files) && !T.names && process.env.ARSENAL_GIT_CHEAP_DIRTY !== '0';
  const r = cheap ? yield* gDirtyStat(repo, T, o) : yield* gDirtyStatus(repo);
  r.ms = Date.now() - t0;
  return r;
}

function* gChanged(folder, revA, revB) {
  if (![revA, revB].every(v => typeof v === 'string' && v && !v.startsWith('-'))) return null;
  const repo = yield* gRepo(folder); if (!repo) return null;
  const r = yield { cwd: repo.root, args: ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', revA, revB, '--', repo.rel || '.'] };
  return zsplit(must(r)).map(p => strip(repo.rel, p)).filter(p => p !== null);
}

function* gSnapshot(folder, o = {}) {
  const t0 = Date.now();
  const repo = yield* gRepo(folder); if (!repo) return null;
  const head = yield* gHead(folder);
  const { map } = yield* gIndex(repo);
  const T = o.listing, cheap = T && Array.isArray(T.files) && !T.names && process.env.ARSENAL_GIT_CHEAP_DIRTY !== '0';
  const d = cheap ? yield* gDirtyStat(repo, T, o) : yield* gDirtyStatus(repo);
  return { root: repo.root, rel: repo.rel, head, blobs: map, dirty: d.set, ms: Date.now() - t0, via: d.via };
}

function* gContentKey(folder, rel, snap) {
  rel = String(rel).replace(/\\/g, '/');
  if (snap) { if (snap.dirty.has(rel)) return null; const e = snap.blobs.get(rel); return e ? e.sha : null; }
  const repo = yield* gRepo(folder); if (!repo) return null;
  const r = yield { cwd: repo.root, args: ['ls-files', '-s', '-z', '--', full(repo, rel)] };
  const ent = zsplit(must(r)).map(e => /^(\d+) ([0-9a-f]+) (\d)\t(.*)$/.exec(e)).filter(Boolean);
  if (ent.length !== 1 || ent[0][3] !== '0' || ent[0][4] !== full(repo, rel)) return null;
  const st = yield* gStatus(repo, [full(repo, rel)]);
  const xy = st.get(full(repo, rel));
  return xy && xy[1] !== ' ' ? null : ent[0][2];
}

function* gToolStamp(dir = path.join(__dirname, '..')) {
  const repo = yield* gRepo(dir); if (!repo) return null;
  const head = yield* gHead(repo.root);
  const r = yield { cwd: repo.root, args: ['status', '--porcelain', '-z', '-uall', '--no-renames', '--', repo.rel] };
  const raw = must(r), live = zsplit(raw).filter(e => e.length > 3 && e[1] !== 'D' && e[0] !== 'D').map(e => e.slice(3));
  const h = crypto.createHash('sha1').update(raw);
  if (live.length) {
    const r2 = yield { cwd: repo.root, args: ['hash-object', '--stdin-paths'], input: live.join('\n') + '\n' };
    h.update('\0').update(must(r2));
  }
  const tools = h.digest('hex');
  return { head, tools, key: crypto.createHash('sha1').update((head || '') + '\0' + tools).digest('hex') };
}

const repoOf = (folder) => S(gRepo)(folder);
const head = (folder) => S(gHead)(folder);
const blobs = (folder) => S(gBlobs)(folder);
const dirty = (folder, o) => S(gDirty)(folder, o);
const changedBetween = (folder, revA, revB) => S(gChanged)(folder, revA, revB);
const contentKey = (folder, rel, snap) => S(gContentKey)(folder, rel, snap);
const snapshot = (folder, o) => S(gSnapshot)(folder, o);
const toolStamp = (dir) => S(gToolStamp)(dir);   // dir: tests only (default tools/)
const promises = { repoOf: A(gRepo), head: A(gHead), blobs: A(gBlobs), dirty: A(gDirty), changedBetween: A(gChanged),
  contentKey: A(gContentKey), snapshot: A(gSnapshot), toolStamp: A(gToolStamp) };

module.exports = { repoOf, head, blobs, dirty, changedBetween, contentKey, snapshot, toolStamp, promises };
