// REVHARNESS (rev-harness 19) seeded test, no game: a game.log older than the launch must not feed a log verdict. node stalelog.js
// Author: Imperator_Aug (ARSENAL, ia-b63668b9)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const { verdictLogOf } = require('../testrun.js');
const D = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'stalelog-')), log = path.join(D, 'game.log');
fs.writeFileSync(log, 'old run\nPROVE route\n');
const old = new Date(Date.now() - 3600e3); fs.utimesSync(log, old, old);
const spawnAt = Date.now();
// seeded defect: the old read (exists -> read) passes a positive regex on the last run's log
assert.ok(/PROVE route/m.test(fs.readFileSync(log, 'latin1')), 'seed: stale log holds the match');
const s = verdictLogOf(log, false, spawnAt);
assert.deepStrictEqual(s, { text: null, stale: true }, 'stale log must read as no log');
// a log written after the launch is read
fs.utimesSync(log, new Date(), new Date());
assert.ok(/PROVE route/.test(verdictLogOf(log, false, spawnAt).text));
// not run, missing log, mock (no spawnAt): unchanged
assert.deepStrictEqual(verdictLogOf(log, true, spawnAt), { text: null, stale: false });
assert.deepStrictEqual(verdictLogOf(path.join(D, 'none.log'), false, spawnAt), { text: null, stale: false });
fs.utimesSync(log, old, old);
assert.ok(verdictLogOf(log, false, undefined).text, 'mock run (no spawnAt) still reads the log');
fs.rmSync(D, { recursive: true, force: true });
console.log('PASS stalelog 5');
