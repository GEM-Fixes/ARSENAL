// fsretry: preload (node --require) that retries sync fs calls on the transient locks OneDrive and AV put on just-written files.
// test-all.sh sets it through NODE_OPTIONS so every tool and child process gets it. real errors still throw after about 5 s.
// Author: Imperator_Aug (ARSENAL, ia-5a66f5c6)
const fs = require('fs');
const TRANSIENT = new Set(['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES']);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (const name of ['writeFileSync', 'appendFileSync', 'copyFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'openSync', 'mkdirSync']) {
  const real = fs[name];
  fs[name] = function (...a) {
    for (let i = 0; ; i++) {
      try { return real.apply(fs, a); } catch (e) {
        if (i >= 20 || !TRANSIENT.has(e.code)) throw e;
        sleep(250);
      }
    }
  };
}
