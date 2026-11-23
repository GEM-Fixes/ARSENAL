// model.js: sound.set, folder.set inheritance, name resolution, shuffle bag, options, plan, render, voice-limit simulation.
// Synthetic sources only; an optional vanilla check runs when the game is found. node tools/sound/test/model.test.js [scratch] -> PASS last.
// Author: Imperator_Aug (ARSENAL, ia-19d7a823)
'use strict';
const assert = require('assert');
const model = require('../model'), wav = require('../../lib/wav');
let n = 0, bad = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); } };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ' ' + a + ' != ' + b);
const codes = ns => ns.map(x => x.code);

const tone = (rate, ch, frames, v) => wav.encodePcm16({ rate, channels: ch, pcm: new Int16Array(frames * ch).fill(v === undefined ? 1000 : v) });
const SET = '{sound\r\n {percent "effects" 45}\r\n {percent "emotions" 15 2}\r\n {percent "main_environment" 10}\r\n {loudness "default" 20 0}\r\n {loudness "loud" 100 200 3}\r\n {loudness "quiet" 2 10}\r\n}\r\n';
function fixture(extra) {
  return model.memSource(Object.assign({
    'resource/sound/sound.set': SET,
    'resource/sound/folder.set': '{sound {tag effects} {loudness "loud"}}',
    'resource/sound/a/folder.set': '{sound {Volume 0.5}}',
    'resource/sound/a/1.wav': tone(22050, 1, 22050), 'resource/sound/a/2.wav': tone(22050, 1, 100), 'resource/sound/a/3.wav': tone(22050, 1, 100),
    'resource/sound/a/b/x.wav': tone(22050, 1, 100),
    'resource/sound/c/folder.set': '{sound {tag weird} {loudness "nope"}}',
    'resource/sound/c/s.wav': tone(44100, 2, 100),
    'resource/sound/d/folder.set': '{sound {distance 3 30} {VOLUME 2}}',
    'resource/sound/d/only.wav': tone(44100, 1, 100),
    'resource/sound/e/folder.set': '{sound {tag speech}}',
    'resource/sound/e/sub/z.wav': tone(44100, 1, 100),
  }, extra || {}));
}

t('soundSet: groups, loudness, stale default, missing default', () => {
  const s = model.soundSet(fixture().read);
  assert.equal(s.fatal, null); near(s.groups.effects.share, 0.45); assert.equal(s.groups.emotions.max, 2); near(s.groups.other.share, 0.1);
  near(s.groups.speech.share, 0.2); assert.equal(s.groups.speech.max, 1000);
  assert.deepEqual(s.order, ['default', 'loud', 'quiet']); assert.equal(s.loudness.loud.minUnits, 2000); assert.equal(s.loudness.loud.priority, 3); assert.equal(s.loudness.quiet.priority, -1);
  assert.ok(s.staleDefault); assert.ok(codes(s.errors).includes('STALE_DEFAULT')); assert.ok(codes(s.errors).includes('GROUP_OTHER'));
  const last = model.soundSet(model.memSource({ 'resource/sound/sound.set': '{sound {loudness "x" 1 2} {loudness "Default" 5 0}}' }).read);
  assert.equal(last.staleDefault, false); assert.equal(last.fatal, null);
  const none = model.soundSet(model.memSource({ 'resource/sound/sound.set': '{sound {loudness "x" 1 2}}' }).read);
  assert.equal(none.fatal, 'NO_DEFAULT_LOUDNESS');
  assert.equal(model.soundSet(model.memSource({}).read).fatal, 'NO_DEFAULT_LOUDNESS');
  assert.ok(codes(model.soundSet(model.memSource({ 'resource/sound/sound.set': '{sound {loudness "default" 1 2} {frob 1}}' }).read).errors).includes('UNEXPECTED_TOKEN'));
});
t('folder.set inheritance: default reset, priority kept, case-insensitive keys, unknown tag and loudness', () => {
  const src = fixture(), set = model.soundSet(src.read), cache = new Map();
  const root = model.folder('resource/sound', src.read, set, cache);
  assert.equal(root.group, 'effects'); assert.equal(root.minDistance, 100); assert.equal(root.maxDistance, 200); assert.equal(root.priority, 3); assert.equal(root.loudness, 'loud');
  const a = model.folder('resource/sound/a', src.read, set, cache);
  assert.equal(a.group, 'effects'); assert.equal(a.volume, 0.5); assert.equal(a.minDistance, 20); assert.equal(a.maxDistance, 0); assert.equal(a.priority, 3); assert.equal(a.loudness, 'default');
  assert.deepEqual(a.chain.map(c => c.key), ['resource/sound', 'resource/sound/a']); assert.equal(a.chain[1].own.reset, 'default');
  const b = model.folder('resource/sound/a/b', src.read, set, cache);
  assert.equal(b.hasSet, false); assert.equal(b.anySet, true); assert.equal(b.volume, 0.5); assert.equal(b.minDistance, 20);
  const c = model.folder('resource/sound/c', src.read, set, cache);
  assert.equal(c.group, 'other'); assert.equal(c.groupKnown, false); assert.equal(c.minDistance, 20);
  assert.ok(codes(c.warnings).includes('TAG_UNKNOWN')); const lu = c.warnings.find(w => w.code === 'LOUDNESS_UNKNOWN'); assert.ok(/stale pointer/.test(lu.msg));
  const d = model.folder('resource/sound/d', src.read, set, cache);
  assert.equal(d.minDistance, 3); assert.equal(d.maxDistance, 30); assert.equal(d.minUnits, 60); assert.equal(d.volume, 2); assert.equal(d.loudness, null);
  assert.strictEqual(model.folder('resource/sound/d', src.read, set, cache), d);
  assert.throws(() => model.folder('resource/music/x', src.read, set));
  // no folder.set anywhere: folder defaults
  const bare = model.memSource({ 'resource/sound/sound.set': SET, 'resource/sound/x/1.wav': tone(44100, 1, 10) });
  const x = model.folder('resource/sound/x', bare.read);
  assert.deepEqual([x.group, x.minUnits, x.maxUnits, x.priority, x.volume, x.anySet], ['other', 0, 100, -1, 1, false]);
  // a folder.set read with no default loudness: the engine crashes
  const nd = model.memSource({ 'resource/sound/sound.set': '{sound {loudness "x" 1 2}}', 'resource/sound/folder.set': '{sound {volume 1}}' });
  const f = model.folder('resource/sound', nd.read); assert.equal(f.fatal, true); assert.ok(codes(f.warnings).includes('NO_DEFAULT_LOUDNESS'));
});
t('resolve: folder, file, title, unknown, folder.set-only folder', () => {
  const L = fixture().list;
  const a = model.resolve('a', L); assert.equal(a.exists, true); assert.equal(a.folderKey, 'resource/sound/a'); assert.equal(a.files.length, 3); assert.equal(a.pick, 'random'); assert.equal(a.warn, null);
  const a2 = model.resolve('A/2', L); assert.equal(a2.exists, false); assert.equal(a2.folderKey, 'resource/sound/a'); assert.equal(a2.fixed, 'resource/sound/a/2.wav'); assert.equal(a2.pick, 'fixed');
  assert.equal(model.resolve('a\\2.wav', L).fixed, 'resource/sound/a/2.wav');
  assert.equal(model.resolve('a/9', L).warn, "unknown sound file 'a/9'");
  assert.equal(model.resolve('d', L).pick, 'single');
  const e = model.resolve('e', L); assert.equal(e.exists, true); assert.equal(e.files.length, 0); assert.ok(e.warn);   // folder.set alone makes it exist, no wav: warns
  assert.equal(model.resolve('nothere', L).warn, "unknown sound file 'nothere'");
});
t('bag: no repeat before it empties, engine LCG, seeded', () => {
  assert.equal(model.engineRandom(1)(), 0xAA98C1);
  const files = ['a', 'b', 'c', 'd', 'e'], b = model.bag(files, model.engineRandom(7));
  const seq = [];
  for (let r = 0; r < 4; r++) { const round = []; for (let i = 0; i < 5; i++) round.push(b.next()); assert.deepEqual(round.slice().sort(), files, 'round ' + r); seq.push(...round); }
  const b2 = model.bag(files, model.engineRandom(7)), seq2 = []; for (let i = 0; i < 20; i++) seq2.push(b2.next());
  assert.deepEqual(seq, seq2);
  assert.deepEqual(files, ['a', 'b', 'c', 'd', 'e']);   // input not mutated
  const one = model.bag(['x']); assert.equal(one.next(), 'x'); assert.equal(one.next(), 'x');
  assert.equal(model.bag([]).next(), null);
});
t('options and group volumes', () => {
  const o = model.options('{options\r\n {sound {speaker_config stereo} {rate "22_khz"} {buffers "64"}\r\n  {volume {master 80} {effects 150} {narrator 40} {environment 25}}}}');
  assert.equal(o.rate, 22050); assert.equal(o.buffers, 56); assert.equal(o.master, 80); assert.equal(o.effects, 50); assert.equal(o.narrator, 40);
  assert.ok(o.found.master && !o.found.effects);
  const g = model.groupVolumes(o); near(g.speech, 0.32); near(g.environment, 0.2); near(g.other, 0.2); near(g.effects, 0.4);
  const d = model.options(null); assert.equal(d.rate, 44100); assert.equal(d.master, 100); assert.equal(d.buffers, 16);
});
t('plan: positional, ambient, duration, stereo, unknown, beyond max, no folder.set, fatal', () => {
  const src = fixture();
  const p = model.plan({ name: 'a/1', distance: 40, bearing: 90 }, src);
  assert.ok(p.ok); assert.equal(p.key, 'resource/sound/a/1.wav'); assert.equal(p.settings.group, 'effects');
  near(p.gain.group, 0.5); near(p.gain.channel, 0.25); near(p.gain.distance, 0.5); near(p.gain.pan, 1); near(p.gain.left, 0, 1e-6); near(p.gain.right, 0.125);
  assert.equal(p.distances.milesMin, 20); assert.equal(p.distances.milesMax, null); near(p.lowPass.cutoff, 0.5); assert.ok(p.lowPass.active); near(p.lowPass.hz, 5512.5, 0.1);
  assert.equal(p.loop, 1); assert.equal(p.rate.file, 22050); assert.equal(p.rate.out, 44100); assert.equal(p.wav.frames, 22050);
  const am = model.plan({ name: 'a/1', ambient: true, loop: true }, src);
  near(am.gain.channel, 0.5); assert.equal(am.lowPass.active, false); assert.equal(am.loop, 0); assert.ok(codes(am.notes).includes('AMBIENT_NO_FOLDER_VOLUME'));
  const du = model.plan({ name: 'a/1', duration: 2 }, src); near(du.rate.factor, 0.5); assert.equal(du.rate.playback, 11025); assert.ok(codes(du.notes).includes('RATE'));
  const st = model.plan({ name: 'c/s' }, src); assert.ok(codes(st.notes).includes('STEREO_3D')); assert.ok(codes(st.notes).includes('TAG_UNKNOWN'));
  const un = model.plan({ name: 'a/9' }, src); assert.equal(un.ok, false); assert.equal(un.notes[0].code, 'UNKNOWN_SOUND');
  const far = model.plan({ name: 'd', distance: 40 }, src); assert.equal(far.gain.distance, 0); assert.ok(codes(far.notes).includes('BEYOND_MAX')); assert.ok(!codes(far.notes).includes('VOLUME_CLIPPED'));   // 2 x 0.5 = 1
  const loud = model.plan({ name: 'd', volumes: { effects: 100 } }, src); assert.ok(codes(loud.notes).includes('VOLUME_CLIPPED')); assert.equal(loud.gain.channel, 1);
  const cam = model.plan({ name: 'd', camera: { eye: [0, 0, 10], target: [0, 10, 0], viewAngle: 0 }, source: [5, 1, 9] }, src);
  near(cam.distances.listener[1], 1); near(cam.distances.listener[2], 9); near(cam.distances.distance, 5); near(cam.distances.bearing, 90, 1e-3);
  const bare = model.memSource({ 'resource/sound/sound.set': SET, 'resource/sound/x/1.wav': tone(44100, 1, 10) });
  const nb = model.plan({ name: 'x/1', distance: 10 }, bare); assert.ok(codes(nb.notes).includes('NO_FOLDER_SET')); assert.ok(codes(nb.notes).includes('LOW_PASS_ZERO')); assert.ok(codes(nb.notes).includes('BEYOND_MAX'));
  const nd = model.memSource({ 'resource/sound/sound.set': '{sound {loudness "x" 1 2}}', 'resource/sound/folder.set': '{sound {volume 1}}', 'resource/sound/y/1.wav': tone(44100, 1, 10) });
  const fp = model.plan({ name: 'y/1' }, nd); assert.equal(fp.ok, false); assert.ok(codes(fp.notes).includes('FATAL'));
  const k = model.plan({ key: 'resource/sound/a/2.wav' }, src); assert.equal(k.key, 'resource/sound/a/2.wav'); assert.equal(k.settings.volume, 0.5);
  const missing = model.plan({ key: 'resource/sound/a/zz.wav' }, src); assert.equal(missing.ok, false); assert.ok(codes(missing.notes).includes('NO_FILE'));
  // seeded pick: same seed, same file
  assert.equal(model.plan({ name: 'a', seed: 5 }, src).key, model.plan({ name: 'a', seed: 5 }, src).key);
});
t('render: length, resample, loops, gains, ambient stereo', () => {
  const src = fixture();
  const dec = wav.decode(src.read('resource/sound/a/1.wav'));
  const p = model.plan({ name: 'a/1' }, src);
  const r = model.render(dec, p);
  assert.equal(r.rate, 44100); assert.equal(r.channels, 2); assert.equal(r.frames, 44099); assert.equal(r.pcm.length, 44099 * 2);
  assert.equal(r.pcm[1000], 250); assert.equal(r.pcm[1001], 250);   // 1000 * channel 0.25 (pan centre)
  assert.equal(model.render(dec, p, { loops: 2 }).frames, 88199);
  assert.equal(model.render(dec, p, { maxSeconds: 0.5 }).frames, 22050);
  assert.equal(model.render(dec, model.plan({ name: 'a/1', duration: 2 }, src)).frames, 88197);
  const st = { rate: 44100, channels: 2, frames: 4, pcm: Int16Array.from([100, -100, 100, -100, 100, -100, 100, -100]) };
  const ra = model.render(st, { positional: false, gain: { left: 1, right: 0.5 }, rate: { factor: 1, out: 44100 } });
  assert.deepEqual(Array.from(ra.pcm), [100, -50, 100, -50, 100, -50, 100, -50]);
  const rp = model.render(st, { positional: true, lowPass: { cutoff: 1 }, gain: { left: 1, right: 1 }, rate: { factor: 1, out: 44100 } });
  assert.deepEqual(Array.from(rp.pcm), [0, 0, 0, 0, 0, 0, 0, 0]);   // positioned stereo -> mono mix
  // low pass attenuates a Nyquist tone, passes DC
  const alt = { rate: 44100, channels: 1, frames: 400, pcm: new Int16Array(400).map((_, i) => (i & 1 ? -8000 : 8000)) };
  const lp = model.render(alt, { positional: true, lowPass: { cutoff: 0.1 }, gain: { left: 1, right: 1 }, rate: { factor: 1, out: 44100 } });
  assert.ok(Math.abs(lp.pcm[700]) < 200, 'nyquist after low pass ' + lp.pcm[700]);
});
t('limits: constants, group budget, anti-reverb, copies, keep-time steal, loops', () => {
  const L = model.limits();
  assert.equal(L.antiReverbMs, 50); assert.equal(L.maxPlaying, 3); assert.equal(L.keepTimeMs, 200);
  const g = L.groupFree(model.soundSet(fixture().read), 20); assert.equal(g.effects, 9); assert.equal(g.emotions, 2); assert.equal(g.other, 2); assert.equal(g.speech, 4);
  let s = L.simulate([0, 0], { fileMs: 1000 });
  assert.equal(s.copies[0].result, 'played'); assert.equal(s.copies[1].result, 'rejected'); assert.equal(s.copies[1].reason, 'anti-reverb');
  s = L.simulate([0, 100], { fileMs: 1000 }); assert.deepEqual(s.copies.map(c => c.result), ['played', 'played']);
  // 4th copy at 300 ms: the copy 300 ms in has passed keepTime (order 1e38) and sorts below the new one: it is cut, the new one plays
  s = L.simulate([0, 100, 200, 300], { fileMs: 1000 });
  assert.deepEqual(s.copies.map(c => c.result), ['cut', 'played', 'played', 'played']); assert.equal(s.copies[0].reason, 'max-copies'); assert.equal(s.copies[0].endedAt, 300);
  // PCM16 mono counts bytes: played passes cutoffPart early -> priority 0 path; still four copies cannot play
  s = L.simulate([0, 60, 120, 180], { fileMs: 1000, bytesPerFrame: 2 });
  assert.equal(s.copies.filter(c => c.result === 'played').length, 3);
  // group budget 1: the new copy (not started, 5e37) outranks the one 500 ms in (past keepTime, 1e38): the old one is cut
  s = L.simulate([0, 500], { fileMs: 1000, groupFree: 1 }); assert.equal(s.copies[0].result, 'cut'); assert.equal(s.copies[0].reason, 'group-budget'); assert.equal(s.copies[1].result, 'played');
  // ... but inside keepTime the playing copy keeps its place and the new one is rejected
  s = L.simulate([0, 100], { fileMs: 1000, groupFree: 1 }); assert.equal(s.copies[0].result, 'played'); assert.equal(s.copies[1].result, 'rejected'); assert.equal(s.copies[1].reason, 'group-budget');
  s = L.simulate([{ t: 0, loop: true }], { fileMs: 300, untilMs: 2000 }); assert.equal(s.copies[0].result, 'playing'); assert.equal(s.copies[0].starts, 1);
  assert.deepEqual(L.simulate([]).copies, []);
});
t('vanilla (optional, game found): sound.set loads, root folder.set, a weapon name resolves', () => {
  let gdir = process.env.AS2_GAME;
  if (!gdir && !process.env.AS2_NO_STEAM) try { gdir = require('../../lib/gamedir').resolve().dir; } catch (e) { gdir = null; }
  if (!gdir || !require('fs').existsSync(require('path').join(gdir, 'resource', 'sound.pak'))) return;
  const sound = require('../sound');
  const src = sound.makeSource({ gameDir: gdir, mods: [], x: {} });
  const set = model.soundSet(src.read);
  assert.equal(set.fatal, null); assert.ok(set.loudness.default); assert.ok(set.groups.effects.share > 0);
  const root = model.folder('resource/sound', src.read, set); assert.equal(root.hasSet, true);
  const r = model.resolve('weapon/shot', src.list); assert.equal(r.warn === null || r.files.length === 0, true);
  const p = model.plan({ name: 'animal/chicken/cluck', distance: 10 }, src);
  assert.ok(p.ok, JSON.stringify(p.notes)); assert.equal(p.wav.codec, 'ima-adpcm');
});

console.log(`${n} ok, ${bad} failed`);
console.log(bad ? 'FAIL' : 'PASS');
if (bad) process.exitCode = 1;
