// model/sweepargs: the --exe option every tools/lib/model/sweep-*.js takes (one place, so the sweeps cannot drift).
//   take(args) -> { exe, args }   removes `--exe <game>` from a copy of args; exe = the vfs exe 'as64' | 'mowas_2' | 'goh'
//     (lib/games: as64, mowas_2, mowas2, goh), undefined when not given; a word that names no game throws Error (code BAD_EXE).
//   cli(args) -> take(args) for a sweep's main: a BAD_EXE word prints its one line on stderr and exits 2 (as soedit and armorsim).
//   gameFor(dir, exe, fallback) -> the folder to sweep: dir when given; exe goh -> the GoH install (lib/games install('goh'));
//     else fallback() (each sweep keeps its own default, as before).
//   vfsOpts(o, exe) -> o plus { exe } only when exe was given (vfs.build: no exe = the default as before, as64 when as64.exe is there).
// AS64 and MoW:AS2 share the AS2 install: --exe mowas_2 is what keeps the as64/core files out of a sweep.
// GoH sweeps read the GoH install in place (read only); the model files are the same chunk forms (tools/lib/model/README.md, GoH).
// Author: Imperator_Aug (ARSENAL, ia-a1224da2)
'use strict';
const games = require('../games');

function take(args) {
  const a = Array.from(args || []), i = a.indexOf('--exe');
  if (i < 0) return { exe: undefined, args: a };
  const v = a[i + 1], g = games.get(v);
  if (!g) { const e = new Error('--exe must be as64, mowas_2, mowas2 or goh (got ' + v + ')'); e.code = 'BAD_EXE'; throw e; }
  a.splice(i, 2);
  return { exe: g.exe, args: a };
}
function cli(args) {
  try { return take(args); } catch (e) { if (e.code !== 'BAD_EXE') throw e; process.stderr.write(e.message + '\n'); process.exit(2); }
}
function gameFor(dir, exe, fallback) {
  if (dir) return dir;
  if (exe === 'goh') return games.install('goh').dir || null;
  return fallback();
}
const vfsOpts = (o, exe) => (exe ? Object.assign({}, o, { exe }) : o);

module.exports = { take, cli, gameFor, vfsOpts };
