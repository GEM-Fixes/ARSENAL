// games: the tools' one table of the three games (AS64, MoW:AS2, Gates of Hell) and the helpers every tool uses to carry the game.
//   GAMES = [{id, exe, file, kind, name, version}]
//     id      the GUI and tools word: 'as64' | 'mowas2' | 'goh' (gen --target, upgrade --to, check --exe, groups.js GAMES id)
//     exe     the vfs exe (lib/vfs build opts.exe, v.exe): 'as64' | 'mowas_2' | 'goh'
//     file    the exe file under the install: as64.exe, mowas_2.exe, binaries/x64/call_to_arms.exe
//     kind    'as2' (the AS2 install, shared by AS64 and MoW:AS2) | 'goh' (the GoH install)
//     name    shown name, as in tools/gui/groups.js GAMES; version = data version as there (GoH: '' = the exe's own, PORT-46)
//   DEFAULT = 'as64' (no game named: everything as before, as64 first)
//   get(x)     entry for an id or a vfs exe (also a GAMES entry, or the exe file name; case ignored), else null
//   idOf(x), exeOf(x), kindOf(x)  that entry's id, vfs exe, kind, else null
//   detect(gameDir, {exists}?) -> id from the exe files in the folder, the vfs order: as64.exe -> as64, binaries/x64/call_to_arms.exe -> goh,
//     else mowas2; no folder -> null. exists(p) is injectable (tests); default: lib/cipath (case-blind on Linux)
//   install(x, {arg, goh, ...gamedir options}) -> {dir, source}: as64 and mowas2 through gamedir.resolve({arg}) (source arg|env|as2.json|steam,
//     dir null when none); goh through gamedir.goh({arg: goh || arg}) (source 'arg' when given, else 'goh' = GOH_GAME, as2.json "goh" or Steam,
//     null when none). Every gamedir option (env, cwd, readFile, exists, readReg, noSteam ...) is passed through (tests). Unknown x throws.
//   notFor(tool, x, why, row) -> '<tool>: not available for <game name>: <why> (<row>)'  (no row: no brackets)
//   refuse(tool, x, why, row, {exit, log}?) prints that line on stderr and exits 2 (exit, log injectable for tests); returns the line
// mod.info ranges per target are NOT here: tools/newmod/newmod.js RANGE is their one source (botrecipe, map-clone read it).
// No IO at require time.
// Author: Imperator_Aug (ARSENAL, ia-5c2c996e)
const path = require('path');

const GAMES = [
  { id: 'as64', exe: 'as64', file: 'as64.exe', kind: 'as2', name: 'AS64', version: '3.301' },
  { id: 'mowas2', exe: 'mowas_2', file: 'mowas_2.exe', kind: 'as2', name: 'MoW:AS2', version: '3.262' },
  { id: 'goh', exe: 'goh', file: 'binaries/x64/call_to_arms.exe', kind: 'goh', name: 'GoH', version: '' },
];
const DEFAULT = 'as64';

function get(x) {
  if (!x) return null;
  if (typeof x === 'object') return GAMES.includes(x) ? x : (x.id ? get(x.id) : null);
  const k = String(x).toLowerCase();
  return GAMES.find(g => g.id === k || g.exe === k || g.file === k || path.posix.basename(g.file) === k) || null;
}
const idOf = x => { const g = get(x); return g ? g.id : null; };
const exeOf = x => { const g = get(x); return g ? g.exe : null; };
const kindOf = x => { const g = get(x); return g ? g.kind : null; };

function detect(gameDir, opt = {}) {
  if (!gameDir) return null;
  const has = opt.exists || (rel => { const p = require('./cipath').resolve(gameDir, rel, { cache: new Map() }); if (!p) return false; try { return require('fs').statSync(p).isFile(); } catch { return false; } });
  const at = rel => (opt.exists ? has(path.join(gameDir, ...rel.split('/'))) : has(rel));
  if (at('as64.exe')) return 'as64';
  if (at('binaries/x64/call_to_arms.exe')) return 'goh';
  return 'mowas2';
}

function install(x, opt = {}) {
  const g = get(x);
  if (!g) throw new Error('unknown game: ' + x + ' (as64, mowas2, goh)');
  const gamedir = require('./gamedir');
  const { goh, ...rest } = opt;
  if (g.kind === 'goh') {
    const given = goh || opt.arg;
    const dir = gamedir.goh({ ...rest, arg: given }) || null;
    return { dir, source: dir ? (given ? 'arg' : 'goh') : null };
  }
  const r = gamedir.resolve(rest);
  return { dir: r.dir || null, source: r.source || null };
}

function notFor(tool, x, why, row) {
  const g = get(x), name = g ? g.name : String(x);
  return tool + ': not available for ' + name + ': ' + why + (row ? ' (' + row + ')' : '');
}
function refuse(tool, x, why, row, opt = {}) {
  const line = notFor(tool, x, why, row);
  (opt.log || (s => console.error(s)))(line);
  (opt.exit || process.exit)(2);
  return line;
}

module.exports = { GAMES, DEFAULT, get, idOf, exeOf, kindOf, detect, install, notFor, refuse };
