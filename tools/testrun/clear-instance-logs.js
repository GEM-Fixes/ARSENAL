#!/usr/bin/env node
// empty the AS64 instance log folders (instance 1-9, never the real profile's) into one holding folder. game must be closed.
//   instances exist only for AS64 (lib/testfolders hasInstances): mowas_2.exe has no -instance (TST-19), GoH keeps one user dir (GHVFS-13).
//   node tools/testrun/clear-instance-logs.js --to <holding dir> [--dry]
// moves, never deletes: delete the holding folder by hand once nothing in it is wanted. holding dir must be on the same drive.
// Author: Imperator_Aug (ARSENAL, ia-62824412)
const fs = require('fs'), path = require('path');
const ud = require('../lib/userdir.js');
const opt = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : process.argv[i + 1]; };
const to = opt('to'), dry = process.argv.includes('--dry');
if (!to) { console.error('usage: clear-instance-logs.js --to <holding dir> [--dry]'); process.exit(2); }
const size = p => { const s = fs.statSync(p); return s.isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : s.size; };
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let moved = 0, bytes = 0, failed = 0;
for (let inst = 1; inst <= 9; inst++) {
  const log = ud.logDir(inst);
  if (!fs.existsSync(log)) continue;
  for (const f of fs.readdirSync(log)) {
    const src = path.join(log, f), dst = path.join(to, stamp, `instance ${inst}`, f), b = size(src);
    if (dry) { console.log(`would move ${src} (${(b / 1e6).toFixed(1)} MB)`); moved++; bytes += b; continue; }
    try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.renameSync(src, dst); moved++; bytes += b; }
    catch (e) { failed++; console.error(`FAIL ${src}: ${e.code || e.message}`); }
  }
}
console.log(`${dry ? 'would move' : 'moved'} ${moved} items, ${(bytes / 1e9).toFixed(2)} GB${dry ? '' : ` to ${path.join(to, stamp)}`}; ${failed} failed`);
process.exit(failed ? 1 : 0);
