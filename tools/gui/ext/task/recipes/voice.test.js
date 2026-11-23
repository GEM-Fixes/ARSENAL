// recipe "a voice set" test: node voice.test.js <scratch>. A 48 kHz mono wav line is staged for the draft; the kit checks the recipe,
// strings, census coverage and its seeded defect, steps, compile, the plan (gen voice: eng copied as tst, the selection line replaced by
// the staged one, resampled to 44100 Hz by the op itself (GEN_VOICE_RESAMPLED, no route call), kill lines borrowed from rus copied over eng's names, talk.set phrase
// lines) and writes into the scratch mod. When tools/gen has no voice op the kit fixture is a change draft instead. Before the kit, a
// change draft on rus is compiled directly, and values() is checked for a new voice. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-31a5bb29)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const W = require('../../../../lib/wav'), C = require('../../art/core');
const recipe = require('./voice.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-voice-')));
fs.mkdirSync(scratch, { recursive: true });

const id = 'voice-test-kit';
const stage = D.stageDir({ tmpRoot: path.join(scratch, 'tmp') }, id);
fs.mkdirSync(stage, { recursive: true });
function tone(rate, ch, secs, hz) { const n = Math.round(rate * secs), pcm = new Int16Array(n * ch); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(6000 * Math.sin(2 * Math.PI * hz * i / rate)); return { rate, channels: ch, frames: n, pcm }; }
fs.writeFileSync(path.join(stage, 'line_a.wav'), W.encodePcm16(tone(48000, 1, 0.4, 300)));
const hasOp = !!recipe._lib.genOps().voice;
const v = x => ({ src: 'value', value: x });
const CONV = 'POST /api/x/art/wav-convert';

(async () => {
  const gameDir = kit.findGame({}), ctx = kit.ctxFor(scratch, { gameDir });
  let fails = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  let rusKill = null, engKill = null;
  if (!ctx.game()) console.log('note: SKIP change compile: no game folder');
  else {
    const vm = await recipe.values(ctx, { id: 'eng' }, { verb: 'make' }), vc = await recipe.values(ctx, { id: 'rus' }, { verb: 'change' });
    ok(vm.voice_id === 'eng_new' && vc.voice_id === 'rus' && vc.speakers === 3, 'values: a new voice gets a free id, a change keeps the id and speakers', JSON.stringify([vm.voice_id, vc.voice_id, vc.speakers]));
    const V = C.view(gameDir, null), wavs = pre => [...V.g.keys()].filter(k => k.startsWith(pre) && k.endsWith('.wav') && k.slice(pre.length).indexOf('/') < 0).sort();
    rusKill = wavs('resource/sound/human/talk/rus/enemy_is_destroyed/v1/');
    engKill = wavs('resource/sound/human/talk/eng/enemy_is_destroyed/v1/');
    const d2 = 'voice-test-change', st2 = D.stageDir(ctx, d2); fs.mkdirSync(st2, { recursive: true }); fs.copyFileSync(path.join(stage, 'line_a.wav'), path.join(st2, 'line_a.wav'));
    const d = D.save(ctx, { id: d2, recipe: 'voice', verb: 'change', game: 'as64', mod: path.join(scratch, 'mods', 'voice_change'), base: { id: 'rus' },
      answers: { convert: v('auto'), sel: { src: 'file', staged: ['line_a.wav'] } }, kept: [], state: 'open' });
    const c = await CP.compile(ctx, d, { voice: recipe });
    ok(!c.notes.some(n => /keeps its id|speakers of a game voice/.test(n)), 'change: no note about questions that were not used', JSON.stringify(c.notes));
    // the base step names a shared tree; the line borrow lookup lists only the same line of other voices
    const lv = await recipe.lookups.voiceset(ctx, '', {}), shared = lv.find(x => /a change of it changes|a change changes them too/.test(x.where));
    ok(!!shared, 'base step: a voice that shares recordings says a change changes the other voice too', JSON.stringify(lv.map(x => x.id + ': ' + x.where)).slice(0, 300));
    const ll = await recipe.lookups.voiceline(ctx, '', { filter: { talker: 'human', folder: 'enemy_is_destroyed' } });
    ok(ll.length && ll.every(x => /^human\/talk\/[^/]+\/enemy_is_destroyed\/v\d+$/.test(x.id)) && ll.some(x => x.id === 'human/talk/rus/enemy_is_destroyed/v1'), 'a line borrows only the same line of other voices', JSON.stringify(ll.slice(0, 4)));
    const want = [1, 2, 3].reduce((n, t) => n + wavs('resource/sound/human/talk/rus/selection_of_units/v' + t + '/').length, 0);
    ok(c.calls.length === want && want > 0 && !c.copies.length && c.calls.every(x => x.route === CONV && /^resource\/sound\/human\/talk\/rus\/selection_of_units\/v[123]\/[^/]+\.wav$/.test(x.body.out) && /line_a\.wav$/.test(x.body.src) && x.body.rate === 44100),
      'change: the 48 kHz line takes every game name of selection_of_units for 3 speakers through wav-convert', JSON.stringify(c.calls).slice(0, 400));
    ok(!c.gen && c.result === 'rus', 'change: no gen op, the result is the voice id', c.result);
    ok(c.calls.every(x => typeof x.ok === 'function'), 'change: each wav-convert call has its own ok() test');
    if (hasOp) {
      // a make: the op resamples the 48 kHz line itself (no route); a game-ready 44.1 kHz PCM16 line with "always IMA" keeps a route
      // call per speaker (the op keeps a playable file as it is)
      const d3 = 'voice-test-make', st3 = D.stageDir(ctx, d3); fs.mkdirSync(st3, { recursive: true });
      fs.copyFileSync(path.join(stage, 'line_a.wav'), path.join(st3, 'line_a.wav'));
      fs.writeFileSync(path.join(st3, 'line_b.wav'), W.encodePcm16(tone(44100, 1, 0.3, 250)));
      const m = D.save(ctx, { id: d3, recipe: 'voice', verb: 'make', game: 'as64', mod: path.join(scratch, 'mods', 'voice_make'), base: { id: 'eng' },
        answers: { voice_id: v('tsm'), speakers: v(2), convert: v('ima'), sel: { src: 'file', staged: ['line_a.wav', 'line_b.wav'] } }, kept: [], state: 'open' });
      const cm = await CP.compile(ctx, m, { voice: recipe });
      ok(cm.calls.length === 2 && cm.calls.every(x => /line_b\.wav$/.test(x.body.src) && x.body.format === 'ima' && x.body.rate === null && /selection_of_units\/v[12]\/line_b\.wav$/.test(x.body.out)),
        'make: only the forced codec change of the game-ready line goes through wav-convert (one call per speaker)', JSON.stringify(cm.calls).slice(0, 400));
      const op = cm.gen && cm.gen.ops && cm.gen.ops[0];
      ok(op && op.format === 'ima' && cm.notes.some(n => /Made game ready by the generator: 1 file/.test(n)), 'make: the 48 kHz line is left to the voice op (resampled there, in IMA)', JSON.stringify(cm.notes));
      ok(!cm.notes.some(n => /change task to make them differ/.test(n)) && cm.notes.some(n => /same|brought or borrowed/.test(n)) && cm.notes.some(n => /^Nobody speaks the voice tsm yet/.test(n)),
        'make: no false note about change, the speakers note is true, and Review says nobody speaks the voice until a soldier uses it', JSON.stringify(cm.notes));
      // stereo line (mono by default), a loudness class and a limit of lines at once
      fs.writeFileSync(path.join(st3, 'line_s.wav'), W.encodePcm16(tone(44100, 2, 0.3, 200)));
      const ms = D.save(ctx, Object.assign({}, m, { answers: { voice_id: v('tsm'), speakers: v(2), convert: v('ima'), sel: { src: 'file', staged: ['line_s.wav'] }, loudness: { src: 'exist', value: 'talk2' }, at_once: v(3) } }));
      const cs = await CP.compile(ctx, ms, { voice: recipe });
      const vo = cs.gen.ops.find(o => o.op === 'voice'), pc = cs.gen.ops.find(o => o.op === 'soundclass');
      ok(vo.mono === true && vo.loudness === 'talk2' && cs.notes.some(n => /^Made mono \(line_s\.wav\)/.test(n)), 'make: a stereo line goes to the voice op with mono: true, the loudness class is the op\'s', JSON.stringify(vo));
      ok(cs.calls.every(x => /[\\/]mono[\\/]line_s\.wav$/.test(x.body.src)) && cs.calls.length === 2, 'make: the codec route reads the mono copy made in staging', JSON.stringify(cs.calls).slice(0, 300));
      ok(pc && pc.percent && /^\d+ 3$/.test(String(Object.values(pc.percent)[0])) && cs.notes.some(n => /every soldier line of every voice/.test(n) && /Not tested in game/.test(n)), 'at once: one soundclass percent row, Review says every voice changes', JSON.stringify(pc) + JSON.stringify(cs.notes));
      const mk2 = D.save(ctx, Object.assign({}, m, { answers: { voice_id: v('tsm'), speakers: v(2), sel: { src: 'file', staged: ['line_s.wav'] }, mono: v(false) } }));
      const c2 = await CP.compile(ctx, mk2, { voice: recipe });
      ok(!c2.gen.ops[0].mono && c2.notes.some(n => /Stereo stays stereo/.test(n)) && c2.gen.ops.length === 1, 'mono no: no mono field, Review says stereo stays; at once left empty adds no row', JSON.stringify(c2.notes));
    }
  }
  // owner rule: no question asked and then ignored; strings say only what is true
  const Q = {}; for (const g of recipe.groups) for (const q of g.q) Q[q.id] = Object.assign({ group: g }, q);
  ok(['voice_id', 'speakers'].every(k => Q[k].when && Q[k].when.$verb && Q[k].when.$verb.join() === 'make'), 'voice id and speakers are asked only in make');
  ok(Q.sel.group.essential && Q.order.group.essential && !Q.convert.group.essential && !Q.ammo.group.essential, 'essential: the id, speakers and the lines heard most; format and rare lines are advanced');
  const LG = require('./voice.lang');
  ok(LG.filter(r => /^task\.voice\.q\./.test(r[0])).every(r => !/[(（]/.test(r.slice(1).join(' '))), 'line questions carry no raw talk names in brackets');
  ok(/Nobody speaks/.test(LG.find(r => r[0] === 'task.voice.h.voice_id')[1]) && /the same for every speaker/.test(LG.find(r => r[0] === 'task.voice.h.speakers')[1]), 'id help says nobody speaks it yet; speakers help says the lines are the same');
  ok(Q.sel.picker.lookup === 'voiceline' && Q.sel.picker.filter.folder === 'selection_of_units', 'line questions borrow through the voice line lookup');
  ok(!Q.mono.group.essential && !Q.loudness.group.essential && !Q.at_once.group.essential && Q.loudness.when.$verb.join() === 'make', 'mono, loudness and at once are advanced; loudness is make only (the voice op writes it)');
  ok(['mono', 'loudness', 'at_once'].every(k => /Not tested in game/.test(LG.find(r => r[0] === 'task.voice.h.' + k)[1])), 'the new helps say not tested in game');
  const good = fs.readFileSync(path.join(stage, 'line_a.wav'));
  ok(Q.sel.picker.check({ name: 'a.wav', bytes: Buffer.from('nope') }).key === 'task.voice.e.wav' && Q.sel.picker.check({ name: 'Hey you!.wav', bytes: good }).key === 'task.voice.e.name' && Q.sel.picker.check({ name: 'line_a.wav', bytes: good }) === null, 'upload: an unreadable wav or a name the voice op refuses is refused at upload');
  ok(recipe.test === 'task.voice.test' && LG.some(r => r[0] === 'task.voice.test'), 'the Test step says how to hear the voice');
  console.log(fails ? 'FAIL (direct checks)' : 'PASS (direct checks)');
  if (fails) process.exitCode = 1;
  if (!hasOp) console.log('note: tools/gen has no voice op: the kit fixture is a change draft');
  const T = 'resource/sound/human/talk/tst/';
  const kill0 = engKill && engKill.length ? engKill[0].slice(engKill[0].lastIndexOf('/') + 1) : null;
  await kit.run(recipe, require('./voice.lang'), hasOp ? {
    id, gameDir: gameDir || undefined,
    verb: 'make',
    base: { id: 'eng' },
    answers: { voice_id: 'tst', speakers: 2, convert: 'auto', sel: { src: 'file', staged: ['line_a.wav'] }, kill: { src: 'exist', value: 'human/talk/rus/enemy_is_destroyed/v1' }, loudness: { src: 'exist', value: 'talk2' } },
    planFiles: ['resource/set/talk.set', T + 'selection_of_units/v1/line_a.wav', T + 'selection_of_units/v2/line_a.wav'].concat(kill0 ? [T + 'enemy_is_destroyed/v2/' + kill0] : []),
    write: true,
    after: (mod, res, ok) => {
      const talk = fs.readFileSync(path.join(mod, 'resource/set/talk.set'), 'latin1');
      ok(/\("phrase_voice" args %0 tst 1 %1\)/.test(talk) && /\("phrase_voice" args %0 tst 2 %1\)/.test(talk), 'talk.set has the 2 phrase lines of tst');
      const sel = fs.readdirSync(path.join(mod, ...(T + 'selection_of_units/v1').split('/')));
      ok(sel.length === 1 && sel[0] === 'line_a.wav', 'the selection folder holds only the new line (the copied eng lines left the shuffle)', sel.join(' '));
      for (const t of [1, 2]) {
        const a = W.parse(fs.readFileSync(path.join(mod, ...(T + 'selection_of_units/v' + t + '/line_a.wav').split('/'))));
        ok(a.ok && a.fmt.rate === 44100 && a.tag === 1 && a.fmt.bits === 16, 'speaker ' + t + ': the 48 kHz line was resampled to 44100 Hz PCM16 by the gen voice op', JSON.stringify(a.fmt));
      }
      ok(!JSON.stringify(res.calls || []).includes('wav-convert'), 'the write needed no wav-convert route (the op resampled)', JSON.stringify(res.calls).slice(0, 300));      const kill = fs.readdirSync(path.join(mod, ...(T + 'enemy_is_destroyed/v1').split('/'))).filter(n => n.endsWith('.wav')).sort();
      ok(engKill && kill.length === engKill.length, 'the kill folder keeps eng\'s names', kill.join(' '));
      ok(rusKill && rusKill.length && fs.readFileSync(path.join(mod, ...(T + 'enemy_is_destroyed/v1/' + kill[0]).split('/'))).equals(C.view(gameDir, null).readAny(C.view(gameDir, null).get(rusKill[0]))), 'the kill lines are the borrowed rus ones (copied over eng\'s names)');
      ok(fs.existsSync(path.join(mod, ...(T + 'attack/v1').split('/'))), 'a folder not answered keeps the eng lines (copied by the op)');
      ok(res.raw && res.raw.result === 'tst', 'the branch result is the voice id', res.raw && res.raw.result);
      const fset = fs.readFileSync(path.join(mod, ...(T + 'folder.set').split('/')), 'latin1');
      ok(/\{loudness "talk2"\}/.test(fset) && /\r\n/.test(fset), 'the voice tree folder.set names the picked loudness class (CRLF)', fset);
    },
  } : {
    id, gameDir: gameDir || undefined,
    verb: 'change',
    base: { id: 'eng' },
    answers: { voice_id: 'eng', speakers: 2, convert: 'auto', sel: { src: 'file', staged: ['line_a.wav'] } },
    write: true,
    after: (mod, res, ok) => { ok(res.raw && res.raw.result === 'eng', 'the branch result is the voice id', res.raw && res.raw.result); },
  }, scratch);
})();
