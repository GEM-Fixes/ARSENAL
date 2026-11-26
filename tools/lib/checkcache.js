// checkcache: whole-check reuse for tools/check (job X1). A repeat check of an unchanged mod replays the stored report, JSON
// and exit code instead of running wouldload + doctor again.
//   signature(spec) -> Promise<{parts, stamps, ms, files}>   what the check reads, as cachestore parts + stamps:
//     spec = {mod, with, restorePoints, games: [dir], args: {...}}
//     stamps.mod    the mod folder: lib/modtree scan (path + size + mtime of every file, paks and N.pat too; restore points
//                   and every folder modtree leaves out walked as well) + every symbolic link / junction inside it, followed
//     stamps.with   the same for the --with patch folder ('' when none)
//     stamps.game   each game folder (sorted, lower case): path + size + mtime of every file outside mods/ (exes, paks,
//                   resource/, localization(s)/, as64/core, as64/plus, ...; a superset of lib/gameview stamp and of the
//                   entityindex fingerprint), every entry of mods/ with the size + mtime of its top-level files (mod.info,
//                   N.pat, paks: what lib/vfs discover reads), the same for each Workshop item beside the game (244450,
//                   400750, steam_appid.txt)
//     stamps.deps   the Require closure of the mod (lib/vfs discover of each game, plus + items): each required mod folder
//                   scanned as the mod is
//     stamps.tools  path + size + mtime of tools/** the check can run (test, cache, fixture, gui, mcp, dist, installer
//                   folders left out), the repo package.json, node version + arch
//     stamps.env    env vars of the ARSENAL / check / child tools families (ARSENAL_CACHE, ARSENAL_TEST_STORE, ARSENAL_TMP left out)
//     parts         {mod: the mod folder, lower case, args: canonical JSON of spec.args}: one entry per mod + arguments
//   get(sig) -> {lines, json, code, at, ms} | null   the entry when every stamp is the same (lib/cachestore rule)
//   put(sig, rec)   rec = {lines: stdout lines, json: string | null, code, ms}; best effort
//   offWhy(o) -> string | null   why reuse is off: --no-reuse, ARSENAL_CHECK_REUSE=0, CHECK_TEST_ARGS (a test hook that
//     needs the children to run)
//   SECTION, VER
// A failure anywhere (unreadable folder, damaged entry) throws or gives null: the caller then runs the check as before.
// Author: Imperator_Aug (ARSENAL, ia-88fd3fdd)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const modtree = require('./modtree');

const SECTION = 'check-reuse', VER = 1, CONC = 32, MAX_FILES = 2000000;
const TOOLS = path.resolve(__dirname, '..'), REPO = path.dirname(TOOLS);
const TOOL_SKIP = new Set(['test', 'tests', 'node_modules', 'cache', '.git', '.svn', '_retired', 'dist', 'gui', 'mcp', 'installer', 'fx', 'fixtures', 'samples']);
const ENV_RE = /^(?:(?:ARSENAL|CHECK|DOCTOR|SDLLINT|REFCHECK|WOULDLOAD|ENTITYINDEX|MODSET|BINHDR|KEYLINT|MILINT|HUMLINT|GOH|AS2|AS64)_.*|AS|GOH_GAME|UV_THREADPOOL_SIZE|NODE_OPTIONS|USERPROFILE|APPDATA|LOCALAPPDATA)$/i;
const ENV_SKIP = new Set(['ARSENAL_CACHE', 'ARSENAL_TEST_STORE', 'ARSENAL_TMP']);
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const low = d => { const p = path.resolve(String(d)).replace(/\\/g, '/'); return process.platform === 'win32' ? p.toLowerCase() : p; };

// path + size + mtime of every file under dir, links followed, rows 'tag/rel|size|mtime'. skip(name, depth) leaves a folder out
// (named in the rows, so a new or removed one still counts). A missing dir gives one row saying so.
async function statWalk(dir, tag, rows, skip) {
  const q = [['', 0]];
  let live = 0, err = null, n = 0;
  await new Promise(res => {
    const next = () => {
      while (!err && live < CONC && q.length) start(q.pop());
      if (!live && (err || !q.length)) res();
    };
    const start = ([rel, depth]) => {
      live++;
      const p = rel ? path.join(dir, rel) : dir;
      fs.stat(p, (e, st) => {
        if (e) { if (!rel) rows.push(tag + '|missing'); live--; return next(); }   // gone meanwhile: left out, as modtree does
        if (!st.isDirectory()) {
          rows.push(tag + rel + '|' + st.size + '|' + st.mtimeMs);
          if (++n > MAX_FILES) err = err || new Error('checkcache: too many files under ' + dir);
          live--; return next();
        }
        if (depth > 64) { err = err || new Error('checkcache: folders too deep (a link loop?) at ' + p); live--; return next(); }
        rows.push(tag + rel + '/');
        fs.readdir(p, (e2, names) => {
          if (e2) err = err || e2;
          else for (const nm of names) {
            const r = rel ? rel + '/' + nm : nm;
            if (skip && skip(nm, depth)) rows.push(tag + r + '|skipped'); else q.push([r, depth + 1]);
          }
          live--; next();
        });
      });
    };
    next();
  });
  if (err) throw err;
  return rows;
}

// a folder the check reads as a mod: the modtree scan (restore points walked too) + whatever modtree leaves out, followed
async function modSig(dir) {
  const T = await modtree.scan(dir, { restorePoints: true });
  const extra = [];
  for (const rel of T.left) await statWalk(path.join(dir, rel), rel + '/', extra);
  extra.sort();
  return sha(T.all + '\n' + T.left.join('\n') + '\n' + extra.join('\n'));
}

// top-level files of a folder with size + mtime (mod.info, N.pat, paks), folder names only
function topRows(dir, tag, rows) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { rows.push(tag + '|unreadable'); return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    let st = null; try { st = fs.statSync(p); } catch (x) { /* gone */ }
    rows.push(tag + '/' + e.name + (st ? st.isDirectory() ? '/' : '|' + st.size + '|' + st.mtimeMs : '|gone'));
  }
}

async function gameRows(g, rows) {
  const tag = low(g) + '/';
  await statWalk(g, tag, rows, (nm, depth) => depth === 0 && /^mods$/i.test(nm) || /^\.(?:git|svn)$/i.test(nm));
  let es = [];
  const md = (() => { try { return fs.readdirSync(g).find(n => /^mods$/i.test(n)); } catch (e) { return null; } })();
  if (md) { try { es = fs.readdirSync(path.join(g, md), { withFileTypes: true }); } catch (e) { rows.push(tag + 'mods|unreadable'); } }
  for (const e of es) {
    const p = path.join(g, md, e.name);
    let st = null; try { st = fs.statSync(p); } catch (x) { /* gone */ }
    if (st && st.isDirectory()) topRows(p, tag + 'mods/' + e.name, rows);
    else rows.push(tag + 'mods/' + e.name + (st ? '|' + st.size + '|' + st.mtimeMs : '|gone'));
  }
  for (const app of ['244450', '400750']) {
    const wd = path.resolve(g, '..', '..', 'workshop', 'content', app);
    let items = []; try { items = fs.readdirSync(wd); } catch (e) { continue; }
    for (const it of items) topRows(path.join(wd, it), 'ws/' + low(wd) + '/' + it, rows);
  }
}

// the Require closure of the mod over each game's discover (as64+ and Workshop items included)
function requiresOf(modDir) {
  let t = ''; try { t = fs.readFileSync(path.join(modDir, 'mod.info'), 'latin1'); } catch (e) { return []; }
  const names = require('./names');
  return [...t.matchAll(/\{\s*Require\s+"?([^"}\s]*)"?/gi)].map(m => names.normalize(m[1].split(':')[0])).filter(Boolean);
}
function depDirs(modDir, gamesDirs) {
  const vfs = require('./vfs'), out = new Map(), self = low(modDir);
  for (const g of gamesDirs) {
    let found; try { found = vfs.discover(g, [], { plus: true, items: true }); } catch (e) { throw new Error('checkcache: mod discovery failed in ' + g + ': ' + e.message); }
    let gohFound = null; try { gohFound = vfs.discover(g, [], { items: true }); } catch (e) { /* plus list above is enough */ }
    const seen = new Set(), visit = (id, ms) => {
      if (seen.has(id)) return; seen.add(id);
      for (const F of ms) { const m = F && F.get(id); if (m) { if (low(m.dir) !== self) out.set(low(m.dir), m.dir); for (const r of m.requires || []) visit(r, ms); } }
    };
    for (const r of requiresOf(modDir)) visit(r, [found, gohFound]);
  }
  return [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

async function toolsSig() {
  const rows = [];
  await statWalk(TOOLS, 'tools/', rows, nm => TOOL_SKIP.has(nm.toLowerCase()));
  for (const f of ['package.json', 'modweb/porting/exe-versions.md']) await statWalk(path.join(REPO, f), f, rows);
  rows.sort();
  return sha(process.version + ' ' + process.arch + '\n' + rows.join('\n'));
}

function envSig() {
  const ks = Object.keys(process.env).filter(k => ENV_RE.test(k) && !ENV_SKIP.has(k.toUpperCase())).sort();
  return sha(ks.map(k => k + '=' + process.env[k]).join('\n'));
}

async function signature(spec) {
  const t0 = Date.now();
  const gs = [...new Map((spec.games || []).filter(Boolean).map(g => [low(g), path.resolve(g)])).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(x => x[1]);
  const gameP = (async () => { const rows = []; for (const g of gs) await gameRows(g, rows); rows.sort(); return sha(gs.map(low).join('|') + '\n' + rows.join('\n')); })();
  const depP = (async () => { const ds = depDirs(spec.mod, gs), out = []; for (const [k, d] of ds) out.push(k + '=' + await modSig(d)); return sha(out.join('\n')); })();
  const [mod, wth, game, deps, tools] = await Promise.all([modSig(spec.mod), spec.with ? modSig(spec.with) : '', gameP, depP, toolsSig()]);
  const stamps = { mod, with: wth, game, deps, tools, env: envSig() };
  return { parts: { mod: low(spec.mod), args: canon(spec.args || {}) }, stamps, ms: Date.now() - t0 };
}

function canon(v) { return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x)); }

let S;
const store = () => S || (S = require('./cachestore').open());
function get(sig) {
  const r = store().get(SECTION, VER, sig.parts, sig.stamps);
  const v = r && r.value;
  if (!v || !Array.isArray(v.lines) || !v.lines.every(l => typeof l === 'string') || !Number.isInteger(v.code) || (v.json !== null && typeof v.json !== 'string')) return null;
  return v;
}
function put(sig, rec) {
  return store().put(SECTION, VER, sig.parts, sig.stamps, { lines: rec.lines, json: rec.json === undefined ? null : rec.json, code: rec.code, at: Date.now(), ms: rec.ms || 0 });
}
function same(a, b) { return !!a && !!b && canon(a.parts) === canon(b.parts) && canon(a.stamps) === canon(b.stamps); }

function offWhy(o = {}) {
  if (o.noReuse) return '--no-reuse';
  if (process.env.ARSENAL_CHECK_REUSE === '0') return 'ARSENAL_CHECK_REUSE=0';
  if (process.env.CHECK_TEST_ARGS) return 'CHECK_TEST_ARGS';
  return null;
}

module.exports = { signature, get, put, same, offWhy, SECTION, VER, _statWalk: statWalk, _reset() { S = undefined; } };
