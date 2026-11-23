// ide/intel/game: which game an editor request is for, from ictx (game parity: AS64, MoW:AS2, GoH share this code).
//   gameOf(ictx) -> { id, exe, kind, named }
//     ictx.exe or ictx.game names it ('as64' | 'mowas2' | 'mowas_2' | 'goh', through lib/games get): id, exe (the vfs exe) and kind
//     of that game, named true. Nothing named: exe undefined (lib/vfs picks as before: as64 when as64.exe is in the folder), id
//     'goh' and kind 'goh' when ictx.gameDir holds binaries/x64/call_to_arms.exe (keylint isGoh rule), else id null, kind 'as2'.
//     An unknown word counts as nothing named.
//   keyPart(g) -> '' for no exe and for as64 (cache keys of AS64 stay as they were), else '|' + exe
// Author: Imperator_Aug (ARSENAL, ia-99c85d51)
'use strict';
const fs = require('fs'), path = require('path');
const games = require('../../lib/games');

const isGohDir = d => { try { return ['binaries/x64/call_to_arms.exe', 'call_to_arms.exe'].some(x => fs.statSync(path.join(String(d), ...x.split('/'))).isFile()); } catch (e) { return false; } };
const _goh = new Map();
function gohDir(d) {
  const k = path.resolve(String(d)).toLowerCase();
  if (!_goh.has(k)) { _goh.set(k, isGohDir(d)); if (_goh.size > 16) _goh.delete(_goh.keys().next().value); }
  return _goh.get(k);
}
function gameOf(ictx) {
  const x = ictx && (ictx.exe || ictx.game);
  const g = x ? games.get(String(x)) : null;
  if (g) return { id: g.id, exe: g.exe, kind: g.kind, named: true };
  if (ictx && ictx.gameDir && gohDir(ictx.gameDir)) return { id: 'goh', exe: undefined, kind: 'goh', named: false };
  return { id: null, exe: undefined, kind: 'as2', named: false };
}
const keyPart = g => (g && g.exe && g.exe !== 'as64' ? '|' + g.exe : '');

module.exports = { gameOf, keyPart, isGohDir };
