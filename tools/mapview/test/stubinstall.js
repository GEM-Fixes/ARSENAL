// Test helper: run mapview main with lib/games install stubbed to the fixture game folder, so --exe with no --game
// (and no AS2_GAME / as2.json: run.sh clears the env and runs this from a temp folder) takes the install from games.install.
// Prints "install <exe>" for each install call, then mapview's own output. Args: mapview arguments.
const path = require('path');
const games = require('../../lib/games');
games.install = x => { console.log('install ' + x); return { dir: path.join(__dirname, 'fixture', 'game'), source: 'stub' }; };
require('../mapview').main(process.argv.slice(2));
