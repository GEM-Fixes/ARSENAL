// testfolders: the one list of <game>/mods/ folders tools may stage, write and restore: e2e_test, e2e_test2 .. e2e_test8.
//   FOLDERS            ['e2e_test','e2e_test2',..,'e2e_test8']  (mount order = list order). Names only: the same names in any game's
//                      mods folder (AS2 install for AS64 and MoW:AS2; for GoH lib/writeguard still refuses the GoH install itself)
//   PATTERN            /^e2e_test[2-8]?$/
//   isApproved(name)   exact name only (no paths, no case folding: names come from our own lists)
//   pool(n)            first n folders (1..8)
//   forWorker(w)       worker w (1..8) -> folder w  (w=1 -> e2e_test)
//   instFor(w, base, game?)  worker w (1..) -> game instance base+w-1, base default 1; null when it passes 9 (-instance allows 1..9) or base < 1.
//                      game (a lib/games id or exe, optional): a game with no -instance (hasInstances false) -> always null.
//                      No game: as64, as before.
//   hasInstances(game?) true only for as64 (and no game named). Per game, with the row:
//                      as64    -instance N, own user dir "<user dir> - instance N" (as64.exe strings; userdir.js, TST-22)
//                      mowas2  no -instance (TST-19 [I]: the flag strings are absent in mowas_2.exe)
//                      goh     no -instance and one user dir (GHVFS-13, LOG-22: Documents/My Games/Gates of Hell or
//                              LocalAppData; [I] call_to_arms.exe 1.067 strings: no " - instance " and no instance flag, read 2026-11-14)
//                      unknown game -> false
//   refusal(list)      comma string or array -> message naming the unapproved entries | null
// Author: Imperator_Aug (ARSENAL, ia-f41591b0)
const FOLDERS = ['e2e_test'].concat([2, 3, 4, 5, 6, 7, 8].map(n => 'e2e_test' + n));
const PATTERN = /^e2e_test[2-8]?$/;
const isApproved = name => typeof name === 'string' && PATTERN.test(name);
const pool = n => FOLDERS.slice(0, Math.max(0, Math.min(FOLDERS.length, n | 0)));
const forWorker = w => FOLDERS[w - 1] || null;
function hasInstances(game) {
  if (game === undefined || game === null || game === '') return true;
  return require('./games').idOf(game) === 'as64';
}
function instFor(w, base, game) {
  if (!hasInstances(game)) return null;
  const b = base === undefined || base === null || base === 0 ? 1 : base, i = b + w - 1;
  return b >= 1 && i >= 1 && i <= 9 ? i : null;
}
function refusal(list) {
  const a = Array.isArray(list) ? list : String(list || '').split(',').filter(Boolean);
  const bad = a.filter(f => !isApproved(f));
  return bad.length ? `folder(s) ${bad.join(',')} not approved: only ${FOLDERS.join(', ')} may be staged or restored` : null;
}
module.exports = { FOLDERS, PATTERN, isApproved, pool, forWorker, instFor, hasInstances, refusal };
