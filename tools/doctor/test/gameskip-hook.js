// test hook (games-test.js, node -r): gives uilint a games limit without GoH, so the GAME_SKIP path of doctor is tested while no
// registry entry has one. touches the loaded registry object only, never a file.
// Author: Imperator_Aug (ARSENAL, ia-81741a4b)
require('../../lib/registry').byName('uilint').games = ['as64', 'mowas2'];
