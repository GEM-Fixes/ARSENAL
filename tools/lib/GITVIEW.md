# lib/gitview for caches: content keys and "what changed since the last check"

Many mods are git work trees (RobZ: repo "<mods folder>/RobZ Realism", mod folder "robz realism mod 1.31.0" inside). git already holds
a content hash (blob sha) of every tracked file and the stat it saw when the file was clean. gitview reads that, READ-ONLY
(GIT_OPTIONAL_LOCKS=0, no fsmonitor, no command that writes .git; tools/lib/test/gitview.test.js proves .git is unchanged).
API and edge rules: the header of tools/lib/gitview.js. Not wired into any cache yet.

## The fallback rule (always)
A non-git mod, git not installed, ARSENAL_GITVIEW=0, or ANY gitview call that returns null -> the cache keys that file by
size+mtime (or reads it) exactly as before. A file in the dirty set has no git key: size+mtime for it. Never mix: a cache
entry records which key kind it was stored under (`git:<sha>` vs `st:<size>:<mtimeMs>`); a lookup of the other kind misses.

## Content keys (per-file caches: sdllint/refcheck facts, reach entries, binhdr headers)
1. Once per check: `snap = gitview.snapshot(mod, {listing: T})` (T = the lib/modtree scan the check already has).
   One `ls-files -s --debug` + the stat compare; no extra disk pass.
2. Per file: `contentKey(mod, rel, snap)` -> sha or null. Key the entry by `rel + sha` (+ the cache's own rule version
   and, for findings that depend on includes, the include keys as now). null -> size+mtime.
3. Gain over size+mtime: survives a checkout / clone / copy that rewrites mtimes but not content (a fresh clone of RobZ
   hits every entry stored from another clone at the same commit). Keys are blob shas, i.e. after git's clean filter
   (autocrlf): the working bytes are what git checks out from that blob on this machine with this config; if the
   config changes, the files' mtimes change and git sees them dirty until re-added, so they fall back to size+mtime.

## "What changed since the last check" (whole-check reuse X1, reach cache, finding caches)
Store with the cache: `{head, dirty: [...snap.dirty]}` of the mod, and `gitview.toolStamp().key` for the tools.
Next check:
1. `snap2 = snapshot(mod, {listing})`. If either head is null -> full fallback (size+mtime of every file).
2. changed = `changedBetween(mod, old.head, snap2.head)` (empty when the head is the same)
   ∪ old.dirty ∪ snap2.dirty. A file dirty last time is in the set even if clean now (it may have been reverted).
3. Every file outside `changed` has the same content as at the last check; files in `changed` are looked up by their
   current key (git sha if clean now, else size+mtime) or parsed again.
4. If `changedBetween` returns null (history rewritten, old head gc'd, shallow clone) -> full fallback.
5. Whole-check reuse: same mod head, empty dirty set both times, same toolStamp key, same game stamp and args -> replay.
   With dirty files: their size+mtime rows join the key.

## dirty: two ways, same answer
- `dirty(mod)`: git status (RobZ ~32 s cold on the USB disk: a stat of all 112k files + the untracked walk).
- `dirty(mod, {listing: T})`: compares T's size+mtime with the index's cached stat; hashes only files whose mtime moved
  (git's own rule), racy entries, size-0 entries; check-ignore for unlisted files; git status only for folders the scan
  left out (.arsenal-undo, .svn, node_modules, links). ARSENAL_GIT_CHEAP_DIRTY=0 forces git status.
- Known gap of the cheap way: git also compares ctime, so a file replaced with the same size AND the same mtime but other
  bytes is dirty to git, clean here. Every size+mtime cache has the same blind spot.

## toolStamp (cache key part for "the tools changed")
`{head, tools, key}`: ARSENAL HEAD + sha1 of `status --porcelain -- tools` and the content hash of each changed or
untracked file there, so editing an already-dirty file moves the key. null in an installed ARSENAL (no .git): use a hash
of tools/**/*.js instead.

## Async
In a process that reads child output (wouldload, doctor) use `gitview.promises.*`: a sync git status blocks the loop
(the reach scan stall wave 3 was exactly that).
<!-- Author: Imperator_Aug (ARSENAL, ia-12b1d07a) -->
