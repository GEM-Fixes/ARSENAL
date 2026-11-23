// sound.js CLI with no game (AS2_NO_STEAM=1, AS2_GAME unset, cwd = scratch): play --dry/--json/--keep, info, decode --out, write refusal.
// node tools/sound/test/cli.test.js <scratch> -> PASS last. Author: Imperator_Aug (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-7cc771c8)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), assert = require('assert');
const wav = require('../../lib/wav');
const W = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'sound-cli-' + process.pid));
fs.mkdirSync(W, { recursive: true });
const SOUND = path.join(__dirname, '..', 'sound.js');
const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' }); delete env.AS2_GAME;
const run = (...a) => { const r = cp.spawnSync(process.execPath, [SOUND, ...a], { cwd: W, env, encoding: 'utf8', shell: false }); return { code: r.status, out: r.stdout, err: r.stderr }; };
let n = 0, bad = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };

const loose = path.join(W, 'loose.wav');
fs.writeFileSync(loose, wav.encodePcm16({ rate: 22050, channels: 1, pcm: new Int16Array(4410).fill(2000) }));
const ima = path.join(W, 'ima.wav');
fs.writeFileSync(ima, wav.encodeImaAdpcm({ rate: 44100, channels: 1, pcm: new Int16Array(5000).map((_, i) => Math.round(8000 * Math.sin(i / 9))) }));

t('play --dry --json (loose file, no game)', () => {
  const r = run('play', loose, '--dry', '--json', '--distance', '40', '--bearing', '-90');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true); assert.equal(j.positional, true); assert.equal(j.render.played, false); assert.equal(j.render.rate, 44100);
  assert.ok(Math.abs(j.render.seconds - 0.2) < 0.001, j.render.seconds);
  assert.equal(j.distances.milesMin, 20); assert.ok(Math.abs(j.gain.distance - 0.5) < 1e-6); assert.ok(j.gain.left > 0 && j.gain.right < 1e-6);
});
t('play --dry text + --keep writes the render', () => {
  const keep = path.join(W, 'keep.wav');
  const r = run('play', loose, '--dry', '--ambient', '--loop', '3', '--keep', keep);
  assert.equal(r.code, 0, r.err); assert.ok(/ambient 2D, 3 passes/.test(r.out), r.out); assert.ok(/dry: not played/.test(r.out));
  const p = wav.parse(fs.readFileSync(keep)); assert.equal(p.fmt.channels, 2); assert.equal(p.fmt.rate, 44100); assert.ok(Math.abs(p.frames - 3 * 8820) <= 2, p.frames);
});
t('play --duration stretches the render', () => {
  const j = JSON.parse(run('play', loose, '--dry', '--json', '--duration', '0.4').out);
  assert.ok(Math.abs(j.rate.factor - 0.5) < 1e-6); assert.ok(Math.abs(j.render.seconds - 0.4) < 0.001);
});
t('info --json', () => {
  const r = run('info', ima, '--json'); assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out); assert.equal(j.wav.ok, true); assert.equal(j.wav.fmt.codec, 'ima-adpcm'); assert.equal(j.wav.frames, 5000); assert.equal(j.plan, null);
  assert.ok(/ima-adpcm \(tag 0x11\)/.test(run('info', ima).out));
});
t('decode --out to scratch', () => {
  const o = path.join(W, 'dec.wav');
  const r = run('decode', ima, '--out', o, '--json'); assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out); assert.equal(j.ok, true); assert.equal(j.frames, 5000); assert.equal(j.codec, 'ima-adpcm');
  const p = wav.parse(fs.readFileSync(o)); assert.equal(p.fmt.codec, 'pcm'); assert.equal(p.fmt.bits, 16); assert.equal(p.frames, 5000);
  assert.deepEqual(Array.from(wav.decode(fs.readFileSync(o)).pcm), Array.from(wav.decode(fs.readFileSync(ima)).pcm));
});
t('decode refuses a game / Steam library target, writes nothing', () => {
  const o = path.join(W, 'steamapps', 'common', 'Fake', 'dec.wav');
  const r = run('decode', ima, '--out', o); assert.notEqual(r.code, 0); assert.ok(/steam/i.test(r.err + r.out), r.err);
  assert.equal(fs.existsSync(o), false);
  const k = run('play', loose, '--dry', '--keep', path.join(W, 'steamapps', 'common', 'Fake', 'k.wav')); assert.notEqual(k.code, 0);
});
t('defects: renamed ogg is reported, not decoded', () => {
  const ogg = path.join(W, 'fake.wav'); fs.writeFileSync(ogg, Buffer.from('OggS\0\x02\0\0\0\0\0\0\0\0'));
  const j = JSON.parse(run('info', ogg, '--json').out); assert.equal(j.wav.ok, false); assert.equal(j.wav.kind, 'ogg');
  const d = run('decode', ogg, '--out', path.join(W, 'x.wav')); assert.notEqual(d.code, 0);
  const p = run('play', ogg, '--dry'); assert.notEqual(p.code, 0);
});
t('names need the game: clear error, no Steam probe', () => {
  const r = run('resolve', 'weapon/shot/gun'); assert.notEqual(r.code, 0); assert.ok(/game files/.test(r.err), r.err);
  assert.notEqual(run('play', 'animal/chicken/cluck', '--dry').code, 0);
  assert.equal(run().code, 2);
});

console.log(`${n} ok, ${bad} failed`);
console.log(bad ? 'FAIL' : 'PASS');
if (bad) process.exitCode = 1;
