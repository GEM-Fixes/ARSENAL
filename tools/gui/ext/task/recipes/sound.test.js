// recipe "a sound" test: node sound.test.js <scratch>. Three wavs are staged for the draft: a 48 kHz stereo one (made mono by default,
// then the wav-convert route; mono no keeps stereo with a note), a game-ready 44.1 kHz mono one (kept byte for byte) and a 48 kHz mono one (the route). The kit
// checks the recipe, strings, census coverage and its seeded defect, steps, compile, the plan (gen soundclass + sound + the set of
// mg34's fireSound, a wav-convert route call) and writes into the scratch mod; after() reads the files back. Before the kit: a "change"
// compile (new files take the game file names in turn) and values() preselecting from what a parent passes.
// Author: Imperator_Aug (ARSENAL, ia-c8c8c238)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const W = require('../../../../lib/wav');
const recipe = require('./sound.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-sound-')));
fs.mkdirSync(scratch, { recursive: true });

const id = 'sound-test-kit', tmpRoot = path.join(scratch, 'tmp');
const stage = D.stageDir({ tmpRoot }, id);
fs.mkdirSync(stage, { recursive: true });
function tone(rate, ch, secs, hz) { const n = Math.round(rate * secs), pcm = new Int16Array(n * ch); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(8000 * Math.sin(2 * Math.PI * hz * i / rate)); return { rate, channels: ch, frames: n, pcm }; }
fs.writeFileSync(path.join(stage, 'shot_a.wav'), W.encodePcm16(tone(48000, 2, 0.3, 220)));
fs.writeFileSync(path.join(stage, 'shot_b.wav'), W.encodePcm16(tone(44100, 1, 0.2, 330)));
fs.writeFileSync(path.join(stage, 'shot_c.wav'), W.encodePcm16(tone(48000, 1, 0.25, 440)));
const FILES = ['shot_a.wav', 'shot_b.wav', 'shot_c.wav'];
const DIR = 'resource/sound/weapon/shot/mgun/task_mg/', CONV = 'POST /api/x/art/wav-convert';

(async () => {
  const gameDir = kit.findGame({}), ctx = kit.ctxFor(scratch, { gameDir });
  let fails = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  // values: a branch child preselects what the sound is for from its parent
  const v1 = await recipe.values(ctx, null, { verb: 'make', pass: { for: 'reloadSound', keys: { weapon: 'resource/set/stuff/mgun/mg34' } } });
  ok(v1.where === 'reload' && v1.user === 'resource/set/stuff/mgun/mg34', 'values: pass.for reloadSound preselects reload and the weapon', JSON.stringify(v1));
  const v2 = await recipe.values(ctx, null, { verb: 'make', draft: { parent: { q: 'engine_sound' } } });
  ok(v2.where === 'vehicle', 'values: a parent question about an engine preselects vehicle', v2.where);
  // upload checks (picker.check): a file the wav reader refuses, and a make file name the gen op would refuse, never pass upload
  {
    const SQ = {}; for (const g of recipe.groups) for (const q of g.q) SQ[q.id] = q;
    const good = fs.readFileSync(path.join(stage, 'shot_b.wav'));
    ok(SQ.files.picker.check({ name: 'x.wav', bytes: Buffer.from('RIFF....WAVEjunk') }).key === 'task.sound.e.wav' && SQ.newfiles.picker.check({ name: 'x.wav', bytes: Buffer.from('nope') }).key === 'task.sound.e.wav', 'upload: a wav the reader refuses is refused at upload');
    ok(SQ.files.picker.check({ name: 'Shot #1!.wav', bytes: good }).key === 'task.sound.e.name' && SQ.newfiles.picker.check({ name: 'Shot #1!.wav', bytes: good }) === null && SQ.files.picker.check({ name: 'Shot_B.wav', bytes: good }) === null, 'upload: a make file name the generator refuses is refused at upload (a change takes the game names)');
    ok(recipe.test === 'task.sound.test' && require('./sound.lang').some(r => r[0] === 'task.sound.test'), 'the Test step says where to listen');
  }
  if (!ctx.game()) console.log('note: SKIP change compile: no game folder');
  else {
    // a change: the files take the game names of the folder in turn
    const id2 = 'sound-test-change', st2 = D.stageDir(ctx, id2); fs.mkdirSync(st2, { recursive: true });
    for (const f of FILES) fs.copyFileSync(path.join(stage, f), path.join(st2, f));
    // a stale "start from" answer of another sound must not decide what a change overwrites: only target (or the base) does
    const d = D.save(ctx, { id: id2, recipe: 'sound', verb: 'change', game: 'as64', mod: path.join(scratch, 'mods', 'sound_test'), base: { id: 'weapon/shot/mgun/mg34_burst' },
      answers: { like: { src: 'exist', value: 'weapon/shot/rifle/k98' }, where: { src: 'value', value: 'world' }, target: { src: 'keep' }, newfiles: { src: 'file', staged: FILES } }, kept: [], state: 'open' });
    const c = await CP.compile(ctx, d, { sound: recipe });
    ok(c.notes.some(n => /^Replaced in your mod: 5 recordings of the game sound weapon\/shot\/mgun\/mg34_burst \(mg34_01\.wav by shot_a\.wav/.test(n)), 'change: Review lists every game recording replaced and by which file', JSON.stringify(c.notes));
    ok(c.result === 'mgun/mg34_burst/', 'change: where comes from the replaced sound, not from a stale answer', c.result);
    const names = c.copies.map(x => x.to).concat(c.calls.map(x => x.body.out)).sort();
    ok(names.length === 5 && names.every((n, i) => n === 'resource/sound/weapon/shot/mgun/mg34_burst/mg34_0' + (i + 1) + '.wav'), 'change: the files take all 5 game names of mg34_burst', JSON.stringify(names));
    const by = s => c.copies.filter(x => x.staged === s).length;
    ok(c.copies.length === 2 && by('shot_b.wav') === 2, 'change: the game-ready file is copied', JSON.stringify(c.copies));
    const viaA = c.calls.filter(x => /shot_a\.wav$/.test(x.body.src)).length, viaC = c.calls.filter(x => /shot_c\.wav$/.test(x.body.src)).length;
    ok(c.calls.length === 3 && viaA === 2 && viaC === 1 && c.calls.every(x => x.route === CONV && x.body.format === 'pcm16' && x.body.rate === 44100 && x.body.overwrite), 'change: both 48 kHz files (stereo and mono) go through wav-convert to 44100 Hz PCM16', JSON.stringify(c.calls));
    // README change 38: the call's own ok() decides; a stereo warning (route ok:false) is not a failure, an error or a missing write is
    const fn = c.calls[0].ok, real = path.join(st2, 'shot_b.wav');
    ok(typeof fn === 'function' && fn({ ok: false, plan: true, dest: real, written: false }) && fn({ ok: false, plan: false, written: true, dest: real })
      && !fn({ ok: false, error: 'x', dest: real }) && !fn({ ok: true, plan: false, written: false, dest: real }) && !fn(null), 'change: each wav-convert call has an ok() test (stereo warning passes, error or no write fails)');
    ok(c.notes.some(n => /^Made mono \(shot_a\.wav\)/.test(n) && /Not tested in game/.test(n)), 'change: a stereo file is made mono by default, Review says so', JSON.stringify(c.notes));
    const ms = c.calls.find(x => /shot_a\.wav$/.test(x.body.src)).body.src;
    ok(/[\\/]mono[\\/]shot_a\.wav$/.test(ms) && W.parse(fs.readFileSync(ms)).fmt.channels === 1, 'change: the converter reads a mono copy made in staging (it does not downmix)', ms);
    const stS = D.stageDir(ctx, 'sound-test-stereo'); fs.mkdirSync(stS, { recursive: true }); for (const f of FILES) fs.copyFileSync(path.join(stage, f), path.join(stS, f));
    const dm = D.save(ctx, Object.assign({}, d, { id: 'sound-test-stereo', answers: Object.assign({}, d.answers, { mono: { src: 'value', value: false } }) }));
    const cm = await CP.compile(ctx, dm, { sound: recipe });
    ok(cm.notes.some(n => /Stereo stays stereo \(shot_a\.wav\), as you asked/.test(n)) && cm.calls.every(x => !/[\\/]mono[\\/]/.test(x.body.src)), 'mono no: stereo stays, Review says so', JSON.stringify(cm.notes));
    ok(!c.gen && c.result === 'mgun/mg34_burst/', 'change: no gen op, result is the slot name', c.result);
    // a make for a world sound: nothing plays it, Review says so
    const id3 = 'sound-test-world', st3 = D.stageDir(ctx, id3); fs.mkdirSync(st3, { recursive: true }); fs.copyFileSync(path.join(stage, 'shot_b.wav'), path.join(st3, 'shot_b.wav'));
    const d3 = D.save(ctx, { id: id3, recipe: 'sound', verb: 'make', game: 'as64', mod: path.join(scratch, 'mods', 'sound_test'), base: { id: 'weapon/shot/mgun/mg34_burst' },
      answers: { where: { src: 'value', value: 'world' }, name: { src: 'value', value: 'task_wind' }, like: { src: 'keep' }, files: { src: 'file', staged: ['shot_b.wav'] } }, kept: [], state: 'open' });
    const c3 = await CP.compile(ctx, d3, { sound: recipe });
    ok(c3.notes.some(n => /^Nothing plays the new sound .*task_wind yet/.test(n)), 'make: a world sound says at Review that nothing plays it yet', JSON.stringify(c3.notes));
    ok(c3.gen.ops[0].mono === undefined, 'make: a mono file sends no mono field to gen');
    fs.copyFileSync(path.join(stage, 'shot_a.wav'), path.join(st3, 'shot_a.wav'));
    const c4 = await CP.compile(ctx, D.save(ctx, Object.assign({}, d3, { answers: Object.assign({}, d3.answers, { files: { src: 'file', staged: ['shot_a.wav'] }, share: { src: 'value', value: 40 } }) })), { sound: recipe });
    const so = c4.gen.ops.find(o => o.op === 'sound'), sp = c4.gen.ops.find(o => o.op === 'soundclass');
    ok(so.mono === true && /shot_a\.wav$/.test(so.files[0]) && !/[\\/]mono[\\/]/.test(so.files[0]), 'make: a stereo file goes to gen as brought with mono: true (gen downmixes)', JSON.stringify(so));
    ok(sp && sp.percent && /^40/.test(String(Object.values(sp.percent)[0])) && c4.notes.some(n => /sound\.set is shared/.test(n) && /Not tested in game/.test(n)), 'make: a share answer is one soundclass percent row, Review says it is shared', JSON.stringify(sp) + JSON.stringify(c4.notes));
  }
  // the questions a verb does not use are not asked in it (owner rule: no question asked and then ignored)
  const Q = {}; for (const g of recipe.groups) for (const q of g.q) Q[q.id] = Object.assign({ group: g }, q);
  const verbs = q => (q.when && q.when.$verb) || ['make', 'change'];
  ok(['where', 'name', 'like', 'files', 'user'].every(k => verbs(Q[k]).join() === 'make') && ['target', 'newfiles'].every(k => verbs(Q[k]).join() === 'change'), 'a make question is asked only in make, the replace questions only in change');
  ok(!Q.newfiles.picker.sources.includes('keep'), 'change: the recordings step offers no Keep (a change needs new recordings)');
  ok(Q.target.group.essential && Q.user.group.essential && Q.files.group.essential && !Q.convert.group.essential && !Q.rate.group.essential, 'essential groups: what to replace or make, the weapon, the recordings; the file format is advanced');
  const LG = new Map(require('./sound.lang').map(r => [r[0], r]));
  ok(/voice task/.test(LG.get('task.sound.v.where.voice')[1]) && /change/.test(LG.get('task.sound.h.where')[1]), 'where: the voice choice points to the voice task, the help says a new vehicle or blast sound is not played');
  ok(!/voices/.test(LG.get('task.sound.h.class_prio')[1]) && !Q.volume.limits.unit, 'class priority speaks of sound channels, not voices; volume shows no stray unit');
  ok(/replace/.test(LG.get('task.sound.q.target')[1]) && !/loud/.test(LG.get('task.sound.q.target')[1]), 'change asks plainly which sound is replaced');
  console.log(fails ? 'FAIL (direct checks)' : 'PASS (direct checks)');
  if (fails) process.exitCode = 1;
  await kit.run(recipe, require('./sound.lang'), {
    id, gameDir: gameDir || undefined,
    base: { id: 'weapon/shot/mgun/mg34_burst' },
    answers: {
      where: 'fire', name: 'task_mg', like: { src: 'exist', value: 'weapon/shot/mgun/mg34_burst' },
      files: { src: 'file', staged: FILES }, convert: 'auto', rate: 'keep',
      user: { src: 'exist', value: 'resource/set/stuff/mgun/mg34' },
      tag: 'effects', volume: 0.8, signal: 'shot', signal_m: 60,
      newclass: true, class_name: 'task loud', class_min: 300, class_max: 1500, share: 50, at_once: 8,
    },
    planFiles: FILES.map(f => DIR + f).concat([DIR + 'folder.set', 'resource/sound/sound.set', 'resource/set/stuff/mgun/mg34']),
    write: true,
    after: (mod, res, ok) => {
      const rd = f => W.parse(fs.readFileSync(path.join(mod, DIR + f)));
      const a = rd('shot_a.wav'), cc = rd('shot_c.wav');
      ok(a.ok && a.fmt.rate === 44100 && a.fmt.channels === 1, 'the 48 kHz stereo file was made mono and converted to 44100 Hz', JSON.stringify(a.fmt));
      ok(a.tag === 1 && a.fmt.bits === 16, 'automatic keeps PCM16 when only the rate is wrong', a.tag);
      ok(cc.ok && cc.fmt.rate === 44100 && cc.tag === 1 && cc.fmt.bits === 16, 'the 48 kHz mono file was converted to 44100 Hz by the wav-convert route', JSON.stringify(cc.fmt));
      ok(JSON.stringify(res.calls || []).includes('wav-convert'), 'the write ran the wav-convert route', JSON.stringify(res.calls).slice(0, 300));
      ok(fs.readFileSync(path.join(mod, DIR + 'shot_b.wav')).equals(fs.readFileSync(path.join(stage, 'shot_b.wav'))), 'the game-ready file was kept byte for byte');
      const fset = fs.readFileSync(path.join(mod, DIR + 'folder.set'), 'latin1');
      ok(/\{tag effects\}/.test(fset) && /\{loudness "task loud"\}/.test(fset) && /\{signal shot 60\}/.test(fset) && /\{volume 0\.8\}/.test(fset), 'folder.set holds the advanced answers', fset);
      ok(/\r\n/.test(fset), 'folder.set is CRLF');
      const set = fs.readFileSync(path.join(mod, 'resource/sound/sound.set'), 'latin1');
      ok(/\{percent "effects" 50 8\}/.test(set) && /\{percent "speech"\s+10\s+1\s*\}/.test(set), 'sound.set: the effects share and limit changed, the other groups kept', set.slice(0, 600));
      ok(/\{loudness "task loud" 300 1500\}/.test(set) && /\{loudness "default"/i.test(set), 'sound.set has the new class and keeps default', set.slice(-300));
      const stuff = fs.readFileSync(path.join(mod, 'resource/set/stuff/mgun/mg34'), 'latin1');
      ok(/fireSound\s+"mgun\/task_mg\/"/.test(stuff), 'mg34 fires the new sound (weapon/shot/ left off, as the engine adds it)', stuff.slice(0, 300));
      ok(res.raw && res.raw.result === 'mgun/task_mg/', 'the branch result is the name the slot takes', res.raw && res.raw.result);
    },
  }, scratch);
})();
