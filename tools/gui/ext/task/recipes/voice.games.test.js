// recipe "voice" games test: node voice.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, talk.set with the
// three lists phrases, phrases_tank, phrases_cannon as the GoH file, sound/talk/<actor>/<language>/<folder>/v<N> trees): goh is in games
// with no na; the AS2 speakers, loudness, at once and the two moments GoH has no folder for are asked on AS2 only; the lookups list the
// GoH voices and a moment's lines from its GoH folder (in_action is in_battle); a make is the gen voice op (GoH form: the human and
// tank trees copied, the lines added to the lists that name the copied voice) with the brought lines under the GoH folder; borrowed
// lines are copied into sound/talk/..; loudness and at once refuse with their plain line; the write puts talk.set (CRLF) and the trees
// into the mod and leaves the game alone; change copies over the game names in the GoH tree.
// Author: Imperator_Aug (ARSENAL, ia-goh-voice)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-voice-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const W = require('../../../../lib/wav');
const R = require('./voice.recipe'), L = require('./voice.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
function tone(rate, ch, secs) { const k = Math.round(rate * secs), pcm = new Int16Array(k * ch); for (let i = 0; i < k; i++) for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(6000 * Math.sin(i / 7)); return { rate, channels: ch, frames: k, pcm }; }
const v = x => ({ src: 'value', value: x });
const TK = 'resource/sound/talk/', TALK = 'resource/set/talk.set';
const TALKSET = ['{talks', '(define "phrase_voice"', '\t{phrase', '\t\t{language "%1"}', '\t\t{voice %2}', '\t\t{sound "talk/%0/%1/%3/v%2"}', '\t}', ')', '',
  '(define "phrases"\t; args: actor | language | voice | foldername', '\t("phrase_voice" args %0 rus 1 %1)', '\t("phrase_voice" args %0 rus 2 %1)', '', '\t("phrase_voice" args %0 ger 1 %1)', ')', '',
  '(define "phrases_cannon"', '\t("phrase_voice" args %0 ger 1 %1)', ')', '', '(define "phrases_tank"', '\t("phrase_voice" args %0 rus 1 %1)', ')', '}', ''].join('\r\n');

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'voice_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  const WAV = W.encodePcm16(tone(44100, 1, 0.05));
  G('binaries/x64/call_to_arms.exe', 'x');
  G(TALK, TALKSET);
  for (const [k, names] of Object.entries({ 'human/rus/attack/v1': ['a1', 'a2'], 'human/rus/attack/v2': ['b1'], 'human/rus/in_battle/v1': ['f1'], 'human/rus/in_battle/v2': ['f2'],
    'human/rus/selection_of_units/v1': ['s1'], 'human/rus/selection_of_units/v2': ['s2'], 'human/ger/in_battle/v1': ['g1', 'g2'], 'tank/rus/in_battle/v1': ['t1'], 'cannon/ger/in_battle/v1': ['c1'] }))
    for (const nm of names) G(TK + k + '/' + nm + '.wav', WAV);
  G(TK + 'human/rus/attack/folder.set', '{sound\r\n(include "\\sound\\defines.inc")\r\n("talk_low")\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod });
  const mk = (answers, files, verb, base) => {
    const d = D.newId('voice'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
    for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
    return D.save(ctx, { id: d, recipe: 'voice', verb: verb || 'make', game: 'goh', mod, base: { id: base || 'rus' }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { voice: R });
  const qOf = id => [].concat(...R.groups.map(gr => gr.q)).find(q => q.id === id);

  await t('games: goh in, no na; the GoH rows in four languages without dashes; AS2-only questions say so', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.voice.na.goh'));
    for (const k of ['h.gohspeakers', 'na.gohloud', 'na.gohonce']) { const row = L.find(r => r[0] === 'task.voice.' + k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k); }
    for (const id of ['speakers', 'loudness', 'at_once', 'blue', 'grenades']) assert.deepEqual(qOf(id).when.$game, ['as64', 'mowas2'], id);
    assert.deepEqual(qOf('gohspeakers').when, { $game: ['goh'], $verb: ['make'] });
    for (const id of ['sel', 'fight', 'tank_fight', 'gun_leave']) assert.ok(!qOf(id).when || !qOf(id).when.$game, id);
  });
  await t('lookups: the GoH voices; a moment\'s lines from its GoH folder (fight = in_battle)', async () => {
    assert.deepEqual((await R.lookups.voiceset(lc, '', { game: 'goh', mod })).map(x => x.id + ':' + x.sub), ['rus:2 speakers', 'ger:1 speaker']);
    const l = await R.lookups.voiceline(lc, '', { game: 'goh', mod, filter: { talker: 'human', folder: 'in_action' } });
    assert.deepEqual(l.map(x => x.id), ['talk/human/ger/in_battle/v1', 'talk/human/rus/in_battle/v1', 'talk/human/rus/in_battle/v2']);
    assert.deepEqual(await R.lookups.voiceline(lc, '', { game: 'goh', mod, filter: { talker: 'human', folder: 'things_look_blue' } }), []);
  });
  await t('values: a make gets a free id and the copied voice\'s speakers', async () => {
    const x = await R.values(lc, { id: 'rus' }, { game: 'goh', verb: 'make' });
    assert.deepEqual([x.voice_id, x.gohspeakers], ['rus_new', 2]);
  });
  await t('make: the gen voice op on the GoH tree, brought lines under the GoH folder, borrowed lines copied into sound/talk', async () => {
    const r = await run(mk({ voice_id: v('rus_zz'), gohspeakers: v(3), convert: v('auto'), attack: { src: 'file', staged: ['my_go.wav'] }, fight: { src: 'exist', value: 'talk/human/ger/in_battle/v1' } }, { 'my_go.wav': WAV }));
    const op = r.gen.ops[0];
    assert.deepEqual([op.op, op.id, op.like, op.speakers, op.format, Object.keys(op.sounds)], ['voice', 'rus_zz', 'rus', 3, 'pcm', ['human/attack']]);
    assert.equal(r.gen.ops.length, 1);
    const to = r.copies.map(c => c.to).sort();
    assert.ok(to.length === 3 && to.every(x => /^resource\/sound\/talk\/human\/rus_zz\/in_battle\/v[123]\/f[12]\.wav$/.test(x)), JSON.stringify(to));
    assert.ok(r.notes.some(x => /\{voice rus_zz\}/.test(x)), JSON.stringify(r.notes));
  });
  await t('refusals: loudness and at once (their plain lines), 9 speakers, a taken id', async () => {
    const bad = async (ans, re, key) => { let e = null; try { await run(mk(ans)); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message); if (key) assert.equal(e.key, key); };
    await bad({ voice_id: v('rus_zz'), loudness: { src: 'exist', value: 'talk2' } }, /how far the new voice carries/, 'task.voice.na.gohloud');
    await bad({ voice_id: v('rus_zz'), at_once: v(3) }, /play at once/, 'task.voice.na.gohonce');
    await bad({ voice_id: v('rus_zz'), gohspeakers: v(9) }, /1 to 8/);
    await bad({ voice_id: v('ger') }, /already exists/);
  });
  await t('write: talk.set (CRLF) with the new lines in the human and tank lists, the trees, into the mod; the game stays', async () => {
    const d = mk({ voice_id: v('rus_zz'), gohspeakers: v(2), attack: { src: 'file', staged: ['my_go.wav'] } }, { 'my_go.wav': WAV });
    const p = await CP.plan(ctx, d, { voice: R });
    assert.ok(!p.errors.length, JSON.stringify(p.errors));
    assert.ok(!fs.existsSync(path.join(mod, 'resource')), 'plan wrote nothing');
    const wr = await CP.write(ctx, d, { voice: R });
    assert.ok(wr.written, JSON.stringify(wr.errors));
    const ts = fs.readFileSync(path.join(mod, ...TALK.split('/')), 'utf8');
    assert.ok(/args %0 ger 1 %1\)\r\n\r\n\t; gen: voice rus_zz[^\r\n]*\r\n\t\("phrase_voice" args %0 rus_zz 1 %1\)\r\n\t\("phrase_voice" args %0 rus_zz 2 %1\)\r\n\)\r\n\r\n\(define "phrases_cannon"\r\n\t\("phrase_voice" args %0 ger 1 %1\)\r\n\)/.test(ts) && !/(^|[^\r])\n/.test(ts), ts);
    assert.ok(/\(define "phrases_tank"\r\n\t\("phrase_voice" args %0 rus 1 %1\)\r\n\r\n\t; gen: voice rus_zz[^\r\n]*\r\n\t\("phrase_voice" args %0 rus_zz 1 %1\)\r\n\t\("phrase_voice" args %0 rus_zz 2 %1\)\r\n\)/.test(ts), ts);
    const has = k => fs.existsSync(path.join(mod, ...(TK + k).split('/')));
    assert.ok(has('human/rus_zz/attack/v1/my_go.wav') && has('human/rus_zz/attack/v2/my_go.wav') && !has('human/rus_zz/attack/v1/a1.wav') && has('human/rus_zz/attack/folder.set'));
    assert.ok(has('human/rus_zz/in_battle/v2/f2.wav') && has('tank/rus_zz/in_battle/v2/t1.wav') && !fs.existsSync(path.join(mod, ...(TK + 'cannon').split('/'))));
    assert.ok(wr.restore.length >= 1);
    assert.equal(fs.readFileSync(path.join(g, ...TALK.split('/')), 'utf8'), TALKSET);
    fs.rmSync(path.join(mod, 'resource'), { recursive: true, force: true });
  });
  await t('change: a moment copied over the game names in the GoH tree', async () => {
    const r = await run(mk({ fight: { src: 'exist', value: 'talk/human/ger/in_battle/v1' } }, {}, 'change'));
    assert.deepEqual(r.copies.map(c => c.to).sort(), ['resource/sound/talk/human/rus/in_battle/v1/f1.wav', 'resource/sound/talk/human/rus/in_battle/v2/f2.wav']);
    assert.ok(r.copies.every(c => /^resource\/sound\/talk\/human\/ger\/in_battle\/v1\/g[12]\.wav$/.test(c.key)), JSON.stringify(r.copies));
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
