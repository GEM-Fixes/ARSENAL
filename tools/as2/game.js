// front-door game word (game parity, 2026-11-14): every ARSENAL front-door command takes `--target as64|mowas2|goh` (mowas_2 accepted);
// the run commands (play, probe, e2e, dev-loop) also take `--exe` as a game word or an exe file (the game is the file name: as64.exe,
// mowas_2.exe, call_to_arms.exe). No game named: AS64, everything as before.
//   word(v, flag) -> id (as64|mowas2|goh), throws on an unknown word
//   fromExe(v) -> {id, file}: a game word gives {id, file: null}; an exe path gives {id of its file name or null, file: v}
//   fromModInfo(dir) -> 'mowas2' (MaxGameVersion 3.x below 3.300: a Classic 3.262 range) | 'goh' (MaxGameVersion below 3: a GoH
//     exe version, PORT-46) | null (no mod.info, no Max, or an as64 range)
//   no(cmd, id, why, row) -> prints games.notFor('ARSENAL <cmd>', ...) on stderr, returns 2 (the front door returns exit codes, no process.exit)
//   ROW: the rows the refusals cite
// Author: Imperator_Aug (ARSENAL, ia-632f477c)
const fs = require('fs'), path = require('path');
const games = require('../lib/games');

const ROW = {
  pipe: 'TST-19: mowas_2.exe has no -control, -console or -instance',
  gohPipe: 'modweb/testing/goh-drive.md: GoH has no control pipe',
  gohWrite: 'tools/lib/writeguard.js: ARSENAL does not write into the Gates of Hell install; <GoH>/mods waits for the owner',
};

function word(v, flag = '--target') {
  const g = games.get(v);
  if (!g) throw new Error(flag + ' ' + v + ': unknown game (as64, mowas2, goh)');
  return g.id;
}
function fromExe(v) {
  const g = games.get(v);
  if (g) return { id: g.id, file: null };
  const b = games.get(path.basename(String(v)).toLowerCase());
  return { id: b ? b.id : null, file: v };
}
function fromModInfo(dir) {
  let t;
  try { t = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1'); } catch { return null; }
  const r = /[{]\s*MaxGameVersion\s+"([^"]*)"/i.exec(t);
  if (!r) return null;
  const v = r[1].replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
  if (!v.length) return null;
  if (v[0] < 3) return 'goh';
  if (v[0] === 3 && (v[1] || 0) < 300) return 'mowas2';
  return null;
}
function no(cmd, id, why, row) { console.error(games.notFor('ARSENAL ' + cmd, id, why, row)); return 2; }
const name = id => (games.get(id) || { name: id }).name;

module.exports = { word, fromExe, fromModInfo, no, name, ROW };
