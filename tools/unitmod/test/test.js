// Author: Imperator_Aug (ARSENAL, ia-7021aa63)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const u = require('../unitmod.js');
const t = fs.mkdtempSync(path.join(os.tmpdir(), 'unitmod-'));
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
try {
  const a = path.join(t, 'a'), b = path.join(t, 'b'), m = path.join(t, 'mods', 'x');
  put(path.join(a, 'resource/entity/one/ONE.def'), 'one');
  put(path.join(a, 'resource/properties/same.ext'), 'same');
  put(path.join(a, 'resource/texture/common/t.dds'), 'first');
  put(path.join(b, 'resource/entity/two/two.def'), 'two');
  put(path.join(b, 'resource/properties/same.ext'), 'same');
  put(path.join(b, 'resource/texture/common/t.dds'), 'second');
  assert.ok(u.findDef(a, 'one').endsWith('ONE.def'), 'def found ignoring case');
  assert.strictEqual(u.findDef(a, 'none'), null, 'absent def');
  u.writeModInfo(m);
  assert.ok(/Name "x"/.test(fs.readFileSync(path.join(m, 'mod.info'), 'latin1')), 'mod.info named');
  const r1 = u.overlay(a, m), r2 = u.overlay(b, m);
  assert.strictEqual(r1.copied, 3);
  assert.strictEqual(r2.copied, 1, 'only the new def');
  assert.strictEqual(r2.same, 1, 'identical file counted same');
  assert.deepStrictEqual(r2.conflicts, ['texture/common/t.dds'], 'different bytes listed');
  assert.strictEqual(fs.readFileSync(path.join(m, 'resource/texture/common/t.dds'), 'utf8'), 'first', 'first writer keeps');
  assert.throws(() => u.parse(['--nope']), /unknown arg/);
  // game parity: mod.info per target, --exe handed to goh2as2 and donorfit only when given, --exe goh refused
  assert.strictEqual(fs.readFileSync(path.join(m, 'mod.info'), 'latin1'), '{Mod\r\n {Name "x"}\r\n {MinGameVersion "3.301"}\r\n}\r\n', 'as64 mod.info bytes as before');
  const m2 = path.join(t, 'mods', 'y'); u.writeModInfo(m2, 'mowas2');
  assert.strictEqual(fs.readFileSync(path.join(m2, 'mod.info'), 'latin1'), '{Mod\r\n {Name "y"}\r\n {MinGameVersion "3.262.0"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n', 'mowas2 mod.info range');
  const o0 = u.parse(['--goh', 'G', '--base', 'B', '--game', 'A']), o1 = u.parse(['--goh', 'G', '--base', 'B', '--game', 'A', '--exe', 'mowas2']), uu = { rep: 'r', donor: 'd' };
  assert.strictEqual(o1.exe, 'mowas_2', '--exe mowas2 -> the vfs exe');
  assert.ok(!u.buildArgs(uu, o0, 'O').includes('--exe') && !u.fitArgs(uu, o0, 'O', 'D').includes('--exe'), 'no --exe: child lists as before');
  const b1 = u.buildArgs(uu, o1, 'O'), f1 = u.fitArgs(uu, o1, 'O', 'D');
  assert.strictEqual(b1[b1.indexOf('--exe') + 1], 'mowas_2', 'goh2as2 gets --exe mowas_2');
  assert.strictEqual(f1[f1.indexOf('--exe') + 1], 'mowas_2', 'donorfit gets --exe mowas_2');
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'unitmod.js'), '--exe', 'goh'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2, '--exe goh exit 2');
  assert.ok(/^unitmod: not available for GoH: /.test(r.stderr), '--exe goh plain line: ' + r.stderr);
  console.log('unitmod 15 checks pass');
} finally { fs.rmSync(t, { recursive: true, force: true }); }
