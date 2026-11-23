// toolcache: where a tool keeps its cache files. Default <platform.cacheDir()>/<tool>:
//   Windows %LOCALAPPDATA%\ARSENAL\cache\<tool>, Linux $XDG_CACHE_HOME/arsenal/<tool> (~/.cache/arsenal/<tool>),
//   macOS ~/Library/Caches/ARSENAL/<tool>. Env ARSENAL_CACHE=<dir> replaces the root (tests, portable use);
//   ARSENAL_CACHE_<TOOL>=<dir> replaces it for that tool only (e.g. ARSENAL_CACHE_MAPVIZ) and wins over ARSENAL_CACHE.
// The old place was tools/<tool>/cache inside the install folder, which may be read-only. An old cache file there is still read:
// file() copies it to the per-user folder the first time it is asked for (best effort); new caches are written per user only.
//   dir(tool, opt) -> per-user folder of the tool (not created)
//   file(tool, name, legacyDir?, opt) -> per-user path of the cache file name (old file copied over when only it exists;
//     when the copy fails, the old file's path is returned so it can still be read; a write there then warns once through cachewrite)
//   redirect(tool, f, legacyDir, opt) -> f when it is not inside legacyDir (an explicit --cache elsewhere stays), else file(tool, rel)
// opt: {platform, env, home} as lib/platform.
// Author: Imperator_Aug (ARSENAL, ia-af9925f3)
'use strict';
const fs = require('fs'), path = require('path');
const platform = require('./platform');

// Env ARSENAL_CACHE_<TOOL> (upper case, - as _) = a root for that one tool only, before ARSENAL_CACHE: a GUI on a scratch folder points
// the mapviz picture cache there without moving every other tool's cache (a process-wide ARSENAL_CACHE made each child process it
// started, check, wouldload, refcheck, testplan, build its whole-game cache again cold: the GoH share gate timed out).
const own = (tool, env) => { const v = env['ARSENAL_CACHE_' + String(tool).toUpperCase().replace(/[^A-Z0-9]/g, '_')]; return v && path.isAbsolute(v) ? v : ''; };
function dir(tool, opt = {}) {
  const env = opt.env || process.env;
  const root = own(tool, env) || (env.ARSENAL_CACHE && path.isAbsolute(env.ARSENAL_CACHE) ? env.ARSENAL_CACHE : platform.cacheDir(opt));
  const P = opt.platform ? (opt.platform === 'win32' ? path.win32 : path.posix) : path;   // the asked system's separators
  return P.join(root, tool);
}
const isFile = f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } };

function file(tool, name, legacyDir, opt = {}) {
  const f = path.join(dir(tool, opt), name);
  if (!legacyDir || isFile(f)) return f;
  const old = path.join(legacyDir, name);
  if (path.resolve(old) === path.resolve(f) || !isFile(old)) return f;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(old, f); return f; } catch (e) { return old; }
}

function redirect(tool, f, legacyDir, opt = {}) {
  if (!f || !legacyDir) return f;
  const rel = path.relative(path.resolve(legacyDir), path.resolve(f));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return f;
  return file(tool, rel, legacyDir, opt);
}

module.exports = { dir, file, redirect };
