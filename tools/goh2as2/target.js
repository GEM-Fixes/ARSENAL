// target: the AS2 build a GoH port is made for (AS64 or MoW:AS2), shared by goh2as2, stuffport, gohsample and unitmod.
//   exeArg(tool, v)        --exe value -> the vfs exe 'as64' | 'mowas_2' (as64, mowas_2, mowas2, case ignored; lib/games);
//                          'goh' -> games.refuse (exit 2: GoH is the source of a port, never its target); any other word: exit 2
//   targetOf(exe, as2Dir)  -> 'as64' | 'mowas2': the named exe, else lib/games.detect on the AS2 install (as64.exe there -> as64,
//                          the vfs default), else 'as64' (no install: everything as before)
//   stuffMods(t)           vfs mods of the stuff view: ['as64+'] for as64 (its built-in mod), [] for mowas2 (no as64+ there)
//   modInfoLines(t, ind)   the version lines of a mod.info: as64 MinGameVersion "3.301"; mowas2 MinGameVersion "3.262.0" +
//                          MaxGameVersion "3.262.1" (copied from tools/newmod RANGE; test/parity.js pins the copy); ind = line indent
//   exeFlag(exe)           ['--exe', exe] when an exe was named, else [] (a child tool's AS64 argument list stays as it was)
// No IO at require time.
// Author: Imperator_Aug (ARSENAL, ia-c2f0a1d7)
'use strict';
const games = require('../lib/games');

function exeArg(tool, v) {
  const g = games.get(v);
  if (!g) { console.error(`${tool}: --exe must be one of as64|mowas_2|mowas2 (got ${v})`); process.exit(2); }
  if (g.kind === 'goh') games.refuse(tool, g, 'the target of a GoH port is an AS2 build (as64 or mowas_2); GoH is the source, given by --goh', 'plan/reports/game-parity/t-port-a.md: n/a (source game)');
  return g.exe;
}
function targetOf(exe, as2Dir) {
  if (exe) return games.idOf(exe) === 'mowas2' ? 'mowas2' : 'as64';
  let d = null; try { d = as2Dir ? games.detect(as2Dir) : null; } catch { d = null; }
  return d === 'mowas2' ? 'mowas2' : 'as64';
}
const stuffMods = t => (t === 'mowas2' ? [] : ['as64+']);
function modInfoLines(t, ind = ' ') {
  if (t !== 'mowas2') return [`${ind}{MinGameVersion "3.301"}`];
  const r = { min: '3.262.0', max: '3.262.1' };   // = tools/newmod/newmod.js RANGE.mowas2 (test/parity.js check 1 pins this equal to tools/newmod/newmod.js RANGE.mowas2)
  return [`${ind}{MinGameVersion "${r.min}"}`, `${ind}{MaxGameVersion "${r.max}"}`];
}
const exeFlag = exe => (exe ? ['--exe', exe] : []);

module.exports = { exeArg, targetOf, stuffMods, modInfoLines, exeFlag };
