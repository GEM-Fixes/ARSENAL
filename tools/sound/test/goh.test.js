// sound game parity: --exe reaches sdlset createSource (MoW:AS2 view), GoH play rules on a made-up tree (GHVIS-29 folder distances kept,
// GHVIS-30 folder volume on ambient, GHVIS-31 no min distance = stopped, GHVIS-33 filters.set chains), AS2 rules unchanged on the same tree,
// and the CLI on a made-up GoH install (--exe goh: info, resolve, sweep). node tools/sound/test/goh.test.js <scratch> -> PASS last.
// Author: Imperator_Aug (ARSENAL, ia-905ff90c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), assert = require('assert');
const wav = require('../../lib/wav'), model = require('../model');
const W = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'sound-goh-' + process.pid));
require('../../lib/testscratch').guard(W);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
let n = 0, bad = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const tone = wav.encodePcm16({ rate: 22050, channels: 1, pcm: new Int16Array(2205).fill(1000) });
const TREE = {
  'resource/sound/sound.set': '{sound\r\n\t{percent "effects" 50 8}\r\n\t{loudness "default" 20 100}\r\n\t{loudness "far" 50 400}\r\n}\r\n',
  'resource/sound/folder.set': '{sound\r\n\t{tag effects}\r\n\t{loudness "far"}\r\n}\r\n',
  'resource/sound/weapon/folder.set': '{sound\r\n\t{volume 0.5}\r\n}\r\n',
  'resource/sound/weapon/shot.wav': tone,
  'resource/sound/zero/folder.set': '{sound\r\n\t{distance 0 30}\r\n}\r\n',
  'resource/sound/zero/z.wav': tone,
  'resource/sound/filters/filters.set': '; made-up chains\r\n{enclosed_vehicle\r\n\t{lowpass\r\n\t\t{cutoff 1000.0}\r\n\t}\r\n}\r\n{opentop_vehicle\r\n}\r\n{bad_chain\r\n\t{reverb\r\n\t\t{mix 1}\r\n\t}\r\n\t{bandpass\r\n\t\t{center 5}\r\n\t\t{strength 2}\r\n\t}\r\n}\r\n',
};
const src = model.memSource(TREE);

t('GHVIS-29: a sub-folder keeps the parent distances under GoH, resets to default under AS2', () => {
  const as2 = model.folder('resource/sound/weapon', src.read);
  assert.equal(as2.minDistance, 20); assert.equal(as2.maxDistance, 100);   // AS2: every folder.set starts from 'default'
  const goh = model.folder('resource/sound/weapon', src.read, undefined, undefined, { game: 'goh' });
  assert.equal(goh.minDistance, 50); assert.equal(goh.maxDistance, 400); assert.equal(goh.loudness, 'far');
  const root = model.folder('resource/sound', src.read, undefined, undefined, { game: 'goh' });
  assert.equal(root.minDistance, 50);   // the top folder reads its own {loudness}
});
t('a shared cache keeps the games apart', () => {
  const cache = new Map();
  const a = model.folder('resource/sound/weapon', src.read, undefined, cache);
  const g = model.folder('resource/sound/weapon', src.read, undefined, cache, { game: 'goh' });
  assert.notEqual(a.minDistance, g.minDistance); assert.ok(cache.has('resource/sound/weapon') && cache.has('goh:resource/sound/weapon'));
});
t('GHVIS-30: folder volume scales ambient plays under GoH only', () => {
  const as2 = model.plan({ key: 'resource/sound/weapon/shot.wav', ambient: true }, src);
  const goh = model.plan({ key: 'resource/sound/weapon/shot.wav', ambient: true, game: 'goh' }, src);
  assert.ok(Math.abs(goh.gain.channel - as2.gain.channel * 0.5) < 1e-6, as2.gain.channel + ' ' + goh.gain.channel);
  assert.ok(goh.notes.some(x => x.code === 'AMBIENT_FOLDER_VOLUME')); assert.ok(as2.notes.some(x => x.code === 'AMBIENT_NO_FOLDER_VOLUME'));
  assert.equal(as2.game, undefined); assert.equal(as2.filters, undefined);   // AS2 plan shape unchanged
});
t('GHVIS-31: positioned play with no min distance is stopped under GoH', () => {
  const goh = model.plan({ key: 'resource/sound/zero/z.wav', game: 'goh' }, src);
  assert.equal(goh.ok, false); assert.ok(goh.notes.some(x => x.code === 'GOH_NO_MIN_DISTANCE' && x.level === 'error'));
  const as2 = model.plan({ key: 'resource/sound/zero/z.wav' }, src);
  assert.equal(as2.ok, true); assert.ok(as2.notes.some(x => x.code === 'LOW_PASS_ZERO'));
});
t('GHVIS-33: filters.set chains, defaults, clamps, unknown type', () => {
  const f = model.filtersSet(src.read);
  assert.equal(f.present, true); assert.deepEqual(f.chains.map(c => c.name), ['enclosed_vehicle', 'opentop_vehicle', 'bad_chain']);
  assert.deepEqual(f.chains[0].filters[0], { type: 'lowpass', stage: 1, cutoff: 1000, strength: 1 });
  assert.deepEqual(f.chains[2].filters.map(x => [x.type, x.stage, x.center, x.width, x.strength]), [['bandpass', 2, 20, 400, 1]]);
  const codes = f.errors.map(e => e.code).sort();
  assert.deepEqual(codes, ['FILTER_UNKNOWN', 'FREQ_RAISED', 'STRENGTH_CLAMPED']);
  assert.equal(f.stages, 2);
  const p = model.plan({ key: 'resource/sound/weapon/shot.wav', game: 'goh' }, src);
  assert.deepEqual(p.filters, { present: true, chains: ['enclosed_vehicle', 'opentop_vehicle', 'bad_chain'], stages: 2, applied: true });
  assert.ok(p.notes.some(x => x.code === 'GOH_FILTERS')); assert.ok(p.notes.some(x => x.code === 'FILTER_UNKNOWN' && x.from === 'filters.set'));
  assert.equal(model.filtersSet(model.memSource({}).read).present, false);
});
t('--exe reaches sdlset.createSource (MoW:AS2 view), no --exe passes none', () => {
  const sdlset = require('../../lib/sdlset'), real = sdlset.createSource, seen = [];
  sdlset.createSource = o => { seen.push(o.exe); return { v: { files: new Map() }, local: new Map(), packed: () => new Map(), get: () => null }; };
  try {
    const S = require('../sound');
    S.makeSource(S.args(['info', 'x', '--game', W, '--exe', 'mowas2']));
    S.makeSource(S.args(['info', 'x', '--game', W]));
    S.makeSource(S.args(['info', 'x', '--game', W, '--exe', 'goh']));
  } finally { sdlset.createSource = real; }
  assert.deepEqual(seen, ['mowas_2', undefined, 'goh']);
});

// CLI on a made-up GoH install (loose files under resource/)
const G = path.join(W, 'gohgame');
fs.mkdirSync(path.join(G, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(G, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
for (const [k, v] of Object.entries(TREE)) { const p = path.join(G, ...k.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, v); }
const SOUND = path.join(__dirname, '..', 'sound.js');
const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' }); delete env.AS2_GAME; delete env.GOH_GAME;
const run = (...a) => { const r = cp.spawnSync(process.execPath, [SOUND, ...a], { cwd: W, env, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
t('CLI info --exe goh: GoH rules + filters line', () => {
  const r = run('info', 'weapon/shot', '--exe', 'goh', '--game', G, '--json');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.plan.game, 'goh'); assert.equal(j.plan.settings.minDistance, 50); assert.deepEqual(j.plan.filters.chains, ['enclosed_vehicle', 'opentop_vehicle', 'bad_chain']);
  const tx = run('info', 'weapon/shot', '--exe', 'goh', '--game', G).out;
  assert.ok(/^filters   enclosed_vehicle, opentop_vehicle, bad_chain \(2 stages, on this positioned channel, dry at rest\)  \[GoH\]$/m.test(tx), tx);
});
t('CLI resolve and sweep --exe goh', () => {
  const r = run('resolve', 'weapon', '--exe', 'goh', '--game', G);
  assert.equal(r.code, 0, r.err); assert.ok(/distance 50\.\.400 m/.test(r.out), r.out);
  const s = run('sweep', '--exe', 'goh', '--game', G, '--json');
  assert.equal(s.code, 0, s.err);
  const j = JSON.parse(s.out); assert.equal(j.wav, 2); assert.equal(j.filters.stages, 2); assert.equal(j.filters.chains.length, 3);
  const st = run('sweep', '--exe', 'goh', '--game', G).out; assert.ok(/^filters   enclosed_vehicle\[lowpass\] opentop_vehicle\[\] bad_chain\[bandpass\], 2 stages \(GoH, GHVIS-33\)$/m.test(st), st);
  const a = run('sweep', '--game', G, '--json'); assert.equal(JSON.parse(a.out).filters, undefined);   // no --exe: as before
});
t('CLI play --exe goh on the no-min-distance folder: not played, exit 1', () => {
  const r = run('play', 'zero/z.wav', '--exe', 'goh', '--game', G, '--dry');
  assert.equal(r.code, 1, r.out + r.err); assert.ok(/GOH_NO_MIN_DISTANCE/.test(r.out), r.out);
});
console.log(`${n} ok, ${bad} failed`);
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
