// lngspy: preload (node -r) for exe.test.js. Wraps child_process.spawnSync: a call to lng-add.js appends its argument list
// (JSON, one line) to the file named by MC_LNG_SPY, then runs as before. Lets the test see the --exe mission-clone hands lng-add.
// Author: Imperator_Aug (ARSENAL, ia-881cf892)
'use strict';
const fs = require('fs'), cp = require('child_process');
const orig = cp.spawnSync;
cp.spawnSync = function (cmd, args, ...rest) {
  if (process.env.MC_LNG_SPY && Array.isArray(args) && /lng-add\.js$/.test(String(args[0] || ''))) fs.appendFileSync(process.env.MC_LNG_SPY, JSON.stringify(args.slice(1)) + '\n');
  return orig.call(this, cmd, args, ...rest);
};
