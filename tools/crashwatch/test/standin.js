// crashwatch test stand-in: writes its pid to argv[2], then sleeps until the watcher's -Out file (argv[3]) says "attached pid"
// (or 40 s pass) and exits, so the attached watcher ends at once. Extra arguments (e.g. -instance 7) only sit on the command line.
// Author: Imperator_Aug (ARSENAL, ia-ba7fdcba)
const fs = require('fs');
const [pidFile, outFile] = process.argv.slice(2);
fs.writeFileSync(pidFile, String(process.pid));
const end = Date.now() + 40000;
const t = setInterval(() => {
  let s = '';
  try { s = fs.readFileSync(outFile, 'utf8'); } catch (e) { /* not written yet */ }
  if (/attached pid/.test(s) || Date.now() > end) { clearInterval(t); setTimeout(() => process.exit(0), 300); }
}, 200);
