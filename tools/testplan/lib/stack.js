// testplan stack: the one place where a game dir, an exe word, a mod list and the mod under test become a `stack` object
// (README "lib/stack.js"). Every other part takes the object and never resolves one itself.
//   resolve({game, exe, mods, folder, state}) -> {gameDir, exe, gid, kind, mods, folder, name, state, canRun, why, warnings}
//     game    game folder; '' or none = looked up: the folder above <game>/mods/<mod> when the mod sits there, else the install
//             (lib/games install, no Steam probe for the AS2 games, as lib/cli); '-' = no game on purpose. Not found: gameDir ''.
//     exe     as64 | mowas_2 | mowas2 | goh (any lib/games word); none = lib/games detect of the game folder, else as64. A bad word throws
//             (code BAD_EXE).
//     mods    mount list (array or 'a,b'), without the mod under test. None given: as64 = ['as64+'] (as edrun and pack), mowas2 and goh = [].
//     folder  the mod under test, by path (it may sit outside <game>/mods). name = its folder name.
//     state   state dir; default <folder>/.arsenal/testplan.
//     canRun  as64 {edrun:'run', prove:'run'}, mowas2 {edrun:'dry', prove:'plan'}, goh {edrun:'no', prove:'score'}; sweep 'plan' always.
//     why     {edrun, prove}: one plain sentence each when the game cannot run it for real, else ''.
//     warnings  lines index and units add (a failed units read); the cli puts them into plan.notes.
//   index(stack) -> Promise<{idx, keys, src}>   the entity index of game + mods + the mod (entityindex buildAsync, its own cache
//     file; one build per process and stack). No gameDir: rejects with code NEEDS_GAME, needsGame true.
//   units(stack) -> Promise<[unit]>   statsheet --units-json `.units` through a child process (--exe for a stack that is not as64).
//     Kept in <state>/units.json with the lib/modtree stamp of the areas set and entity; a failed run gives [] and a line in
//     stack.warnings. No gameDir: [] (the array carries needsGame true).
//   canRunOf(gid), inMods(stack) -> the mod's id when it sits in <gameDir>/mods, else null.
// No IO at require time.
// Author: Imperator_Aug (ARSENAL, ia-bd87f2d7)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const games = require('../../lib/games');

const TOOLS = path.join(__dirname, '..', '..');
const CAN = {
  as64: { edrun: 'run', prove: 'run', sweep: 'plan' },
  mowas2: { edrun: 'dry', prove: 'plan', sweep: 'plan' },
  goh: { edrun: 'no', prove: 'score', sweep: 'plan' },
};
const WHY = {
  as64: { edrun: '', prove: '' },
  mowas2: {
    edrun: 'MoW:AS2 has no control pipe: the pair missions are written (--dry) and a person plays them (TST-19)',
    prove: 'MoW:AS2 has no control pipe: the match is planned (--plan), not run (TST-19)',
  },
  goh: {
    edrun: 'the Gates of Hell editor never starts the mission and there is no control pipe (modweb/testing/in-play-nopipe.md)',
    prove: 'Gates of Hell has no control pipe: a match a person played can only be scored (modweb/testing/goh-drive.md)',
  },
};
const canRunOf = gid => Object.assign({}, CAN[gid] || CAN.as64);
const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } };
const low = p => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();

// the game folder a mod sits in: <game>/mods/<mod> and <game> has resource/ (loose or .pak) or an exe of one of the games
function gameAbove(folder) {
  const up = path.dirname(folder);
  if (path.basename(up).toLowerCase() !== 'mods') return '';
  const g = path.dirname(up);
  const has = rel => { try { fs.statSync(path.join(g, rel)); return true; } catch (e) { return false; } };
  return has('resource') || has('resource.pak') || games.GAMES.some(x => has(x.file)) ? g : '';
}

function resolve(o) {
  o = o || {};
  const folder = o.folder ? path.resolve(String(o.folder)) : '';
  let exe = null;
  if (o.exe !== undefined && o.exe !== null && o.exe !== '') {
    const g = games.get(o.exe);
    if (!g) { const e = new Error('--exe must be one of as64|mowas_2|mowas2|goh, not "' + o.exe + '"'); e.code = 'BAD_EXE'; throw e; }
    exe = g.exe;
  }
  let gameDir = '';
  if (o.game === '-') gameDir = '';
  else if (o.game) gameDir = path.resolve(String(o.game));
  else {
    if (folder) gameDir = gameAbove(folder);
    if (gameDir && exe === 'goh' && games.detect(gameDir) !== 'goh') gameDir = '';
    if (!gameDir) {
      try { gameDir = (exe === 'goh' ? games.install('goh').dir : games.install(exe || 'as64', { noSteam: true }).dir) || ''; } catch (e) { gameDir = ''; }
    }
  }
  if (!exe) exe = games.exeOf((gameDir && games.detect(gameDir)) || games.DEFAULT);
  const gid = games.idOf(exe), kind = games.kindOf(exe);
  const name = folder ? path.basename(folder) : '';
  let mods = o.mods === undefined || o.mods === null ? null : Array.isArray(o.mods) ? o.mods : String(o.mods).split(',');
  if (mods) mods = mods.map(m => String(m).trim()).filter(Boolean);
  else mods = gid === 'as64' ? ['as64+'] : [];
  const st = { gameDir, exe, gid, kind, mods, folder, name, state: '', canRun: canRunOf(gid), why: Object.assign({}, WHY[gid]), warnings: [] };
  // the mod under test is not part of the mount list: it is laid on top by path (index) or named last (units)
  const own = inMods(st);
  if (own) st.mods = st.mods.filter(m => m.split(':')[0].toLowerCase() !== own.toLowerCase());
  st.state = o.state ? path.resolve(String(o.state)) : folder ? path.join(folder, '.arsenal', 'testplan') : '';
  // a part that holds only the object reaches the two readers through it too (not listed, not in JSON): st.index(), st.units()
  Object.defineProperty(st, 'index', { value: s => index(s || st), enumerable: false });
  Object.defineProperty(st, 'units', { value: s => units(s || st), enumerable: false });
  return st;
}

function inMods(st) {
  if (!st.gameDir || !st.folder) return null;
  return low(path.dirname(st.folder)) === low(path.join(st.gameDir, 'mods')) ? path.basename(st.folder) : null;
}

const needsGame = what => { const e = new Error(what + ' needs the game folder (--game)'); e.code = 'NEEDS_GAME'; e.needsGame = true; return e; };
const keyOf = st => [st.gameDir, st.exe, st.mods.join(','), st.folder].join('|').toLowerCase();

const INDEXES = new Map();   // one build per process and stack
function index(st) {
  if (!st || !st.gameDir) return Promise.reject(needsGame('the entity index'));
  const k = keyOf(st);
  if (INDEXES.has(k)) return INDEXES.get(k);
  const p = (async () => {
    const ix = require('../../entityindex/index');
    const tag = crypto.createHash('md5').update(k).digest('hex').slice(0, 8);
    const o = { gameDir: st.gameDir, mods: st.mods, exe: st.exe, cache: path.join(TOOLS, 'entityindex', 'cache', 'testplan-' + tag + '.json') };
    if (st.folder && isDir(st.folder)) o.modDirs = [st.folder];
    const r = await ix.buildAsync(o);
    return { idx: r.idx, keys: r.keys, src: r.src, stats: r.stats };
  })();
  INDEXES.set(k, p);
  p.catch(() => INDEXES.delete(k));
  return p;
}

// statsheet arguments for the stack: a mod in <game>/mods goes last in --mods, a mod elsewhere is laid over by --folder
function unitsArgv(st) {
  const a = [path.join(TOOLS, 'statsheet', 'statsheet.js'), st.gameDir, '--units-json'];
  if (st.exe !== 'as64') a.push('--exe', st.exe);
  // the name in the mod list is the folder name in lower case (VFS-12: a name with capitals does not mount)
  const own = inMods(st), mods = own ? st.mods.concat(own.toLowerCase()) : st.mods.slice();
  if (mods.length) a.push('--mods', mods.join(','));
  if (!own && st.folder && isDir(st.folder)) a.push('--folder', st.folder);
  return a;
}

const UNITS = new Map();
function units(st) {
  if (!st || !st.gameDir) { const none = []; none.needsGame = true; return Promise.resolve(none); }
  const k = keyOf(st);
  if (UNITS.has(k)) return UNITS.get(k);
  const p = (async () => {
    let stamp = {};
    if (st.folder && isDir(st.folder)) {
      try { const mt = require('../../lib/modtree'); stamp = mt.stamps(await mt.ensure(st.folder), ['set', 'entity']); } catch (e) { stamp = {}; }
    }
    const want = JSON.stringify({ v: 1, key: k, stamp });
    const file = st.state ? path.join(st.state, 'units.json') : '';
    if (file) {
      try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c && c.want === want && Array.isArray(c.units)) return c.units; } catch (e) { /* no cache yet */ }
    }
    const argv = unitsArgv(st);
    let res;
    try {
      res = await new Promise((ok, no) => require('child_process').execFile(process.execPath, argv,
        { maxBuffer: 1 << 30, windowsHide: true, encoding: 'utf8' },
        (err, out, errText) => err ? no(new Error(String(errText || err.message).trim().split(/\r?\n/).slice(-3).join(' / '))) : ok(out)));
      res = JSON.parse(res);
    } catch (e) {
      st.warnings.push('units: statsheet --units-json failed, no unit names or numbers: ' + e.message);
      return [];
    }
    const list = Array.isArray(res) ? res : (res && Array.isArray(res.units) ? res.units : []);
    if (file) {
      try { fs.mkdirSync(st.state, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ want, at: new Date().toISOString(), units: list }) + '\n'); }
      catch (e) { st.warnings.push('units: could not keep ' + file + ': ' + e.message); }
    }
    return list;
  })();
  UNITS.set(k, p);
  return p;
}

module.exports = { resolve, index, units, canRunOf, inMods, unitsArgv, _reset() { INDEXES.clear(); UNITS.clear(); } };
