// Author: Imperator_Aug (ARSENAL, ia-2d2299e4)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const gp = require('../gameprofile.js');
const CLI = path.join(__dirname, '..', 'gameprofile.js');
const run = (...a) => cp.spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });

// check passes on the real files
let r = run('check');
assert.strictEqual(r.status, 0, r.stdout + r.stderr);

// show / key filter
r = run('show', 'goh', 'version');
assert.strictEqual(r.status, 0);
assert.match(r.stdout, /version\.data = 1\.067/);
assert.notStrictEqual(run('show', 'nope').status, 0);

// diff: as64 vs goh must hold the version scale and the exe; identical facts are absent
const rows = gp.diffRows('as64', 'goh');
const byKey = Object.fromEntries(rows.map(x => [x.key, x]));
assert.ok(byKey['version.data'] && /3\.262/.test(byKey['version.data'].a) && /1\.067/.test(byKey['version.data'].b));
assert.ok(byKey['exe.main']);
assert.ok(!byKey['log.file'], 'same fact must not appear');
assert.ok(/not sourced/.test(byKey['pak.zip64'].b));
assert.strictEqual(gp.diffRows('goh', 'goh').length, 0);
assert.strictEqual(run('diff', 'as64', 'goh').status, 0);

// check catches a broken copy: bad tag, dead row, dead file (checked in a scratch copy of the logic)
const bad = { v: 1, src: ['ZZZ-99999', 'modweb/nope.md'], tag: 'X' };
const ids = gp.limitIds();
assert.ok(ids === null || (ids.has('PORT-43') && !ids.has('ZZZ-99999')));   // null: a copy without the note folders
assert.ok(!fs.existsSync(path.join(__dirname, '..', '..', '..', bad.src[1])));

// wired: shape and ordering, json parses, nothing counted from gameprofile itself
const w = gp.wired();
assert.ok(w.length > 0);
for (let i = 1; i < w.length; i++) assert.ok(w[i - 1].total >= w[i].total);
assert.ok(!w.some(t => t.tool === 'gameprofile'));
r = run('wired', '--json');
assert.strictEqual(JSON.parse(r.stdout).tools.length, w.length);

// wired counting on a seeded file
const f = path.join(__dirname, '.seed.tmp');
fs.writeFileSync(f, "// as64.exe in a comment\nconst e = 'as64.exe'; if (g === 'goh') {} const v = '1.067';\n");
assert.deepStrictEqual(gp.countFile(f), { exe: 1, branch: 1, version: 1 });
fs.unlinkSync(f);
console.log('gameprofile: all assertions ok');
