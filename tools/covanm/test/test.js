// covanm game test (no Blender, no game): --parse over made-up installs. GoH .anm v0x60001 in a subfolder pak; AS2 base vs the
// as64/core layer (as64 reads core over base, mowas_2 does not). node tools/covanm/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-517817d7)
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { writeZip } = require('../../lib/zipwrite');
const TOOL = path.join(__dirname, '..', 'covanm.js');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'covanm-'));
let n = 0;
// a one-bone FRM2 .anm, 2 frames: EANM ver FRMS 2 BMAP 1 "bone1" FRM2(frame, 1 rec, bone 0, flags 1 = pos, 3 floats)
function anm(ver) {
  const parts = [Buffer.from('EANM'), i32(ver), Buffer.from('FRMS'), i32(2), Buffer.from('BMAP'), i32(1), i32(5), Buffer.from('bone1')];
  for (const fr of [0, 1]) { const b = Buffer.alloc(4 + 2 + 1 + 1 + 2 + 12); let p = 0; b.write('FRM2', p); p += 4; b.writeUInt16LE(fr, p); p += 2; b[p++] = 1; b[p++] = 0; b.writeUInt16LE(1, p); p += 2; b.writeFloatLE(fr, p); parts.push(b); }
  return Buffer.concat(parts);
}
function i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }
const pak = (file, entries) => { fs.mkdirSync(path.dirname(file), { recursive: true }); writeZip(file, entries); };
const run = (...a) => cp.spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8' });
try {
  // GoH: resource/entity/-vehicle.pak holds -vehicle/..; keyed entity/-vehicle/.. (PORT-34)
  const goh = path.join(T, 'goh');
  pak(path.join(goh, 'resource', 'entity', '-vehicle.pak'), [['-vehicle/eng/airborne/blenheim_mk1_eng/open.anm', anm(0x60001)]]);
  let r = run('--exe', 'goh', '--game', goh, '--parse', '--case', 'rigid');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert(/^OK {3}rigid .* v60001 frames 2 bones 1/m.test(r.stdout), r.stdout); n++;
  r = run('--exe', 'goh', '--game', goh, '--parse', '--case', 'matrix');
  assert.notStrictEqual(r.status, 0); assert(/no case matrix for GoH/.test(r.stderr), r.stderr); n++;
  r = run('--exe', 'goh', '--game', goh, '--parse', '--case', 'skeletal');
  assert.strictEqual(r.status, 1); assert(/ERR {2}skeletal .* not in the paks/.test(r.stdout), r.stdout); n++;
  // AS2: base holds a good file, as64/core a bad one over it
  const as2 = path.join(T, 'as2');
  pak(path.join(as2, 'resource', 'a.pak'), [['entity/-vehicle/cannon/m8_howitzer/gun_r.anm', anm(0x60000)]]);
  pak(path.join(as2, 'as64', 'core', 'resource', 'core.pak'), [['entity/-vehicle/cannon/m8_howitzer/gun_r.anm', Buffer.from('XXXXjunk')]]);
  r = run('--exe', 'mowas_2', '--game', as2, '--parse', '--case', 'rigid');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert(/OK {3}rigid .* v60000/.test(r.stdout), r.stdout); n++;
  r = run('--exe', 'as64', '--game', as2, '--parse', '--case', 'rigid');
  assert.strictEqual(r.status, 1); assert(/ERR {2}rigid .*no EANM/.test(r.stdout), 'as64 reads as64/core over base: ' + r.stdout); n++;
  r = run('--game', as2, '--parse', '--case', 'rigid');
  assert.strictEqual(r.status, 0, 'no --exe: base paks only, as before'); n++;
  r = run('--exe', 'nosuch', '--list');
  assert.strictEqual(r.status, 2); n++;
  console.log('covanm games: ' + n + ' checks ok');
} finally { fs.rmSync(T, { recursive: true, force: true }); }
