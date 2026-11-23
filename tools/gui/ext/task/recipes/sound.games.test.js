// recipe "sound" games test: node sound.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, sound.set with three
// loudness rows, defines.inc with one preset, a rifle shot folder whose folder.set calls it, a rifle that names it): goh is in games with no
// na; the lookups and values read the GoH sounds (the preset resolves to 100 to 200 m); a make names every key in its own folder.set
// (no gen sound op), copies the start folder's wavs, sets the rifle's fireSound; distances of another row name that row, new ones add a
// soundclass row; a 48 kHz file is copied as it is on GoH, a 32 kHz one goes through wav-convert; change copies over the game names; no
// GoH folder and a zero distance refuse; the write puts folder.set (CRLF), wavs, sound.set and the rifle into the mod.
// Author: Imperator_Aug (ARSENAL, ia-goh-sound)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-sound-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const W = require('../../../../lib/wav');
const R = require('./sound.recipe'), L = require('./sound.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
function tone(rate, ch, secs) { const k = Math.round(rate * secs), pcm = new Int16Array(k * ch); for (let i = 0; i < k; i++) for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(6000 * Math.sin(i / 7)); return { rate, channels: ch, frames: k, pcm }; }
const v = x => ({ src: 'value', value: x });
const SND = 'resource/sound/', RIFLE = 'resource/set/stuff/rifle/zzrifle', LIKE = 'weapon/shot/zz/rifle';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'sound_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(SND + 'sound.set', '{sound\r\n\t{percent "effects" 70}\r\n\t{percent "emotions" 20}\r\n\t{percent "speech" 2 1}\r\n\t{percent "environment" 8 4}\r\n\t{loudness "default" 5 100 0}\r\n\t{loudness "weapon_3p" 100 200 80}\r\n\t{loudness "rifle_close" 10 300 30}\r\n}\r\n');
  G(SND + 'defines.inc', '(define "Rifle_3p"\r\n\t{loudness "weapon_3p"}\r\n\t{signal shot 120}\r\n\t{SignalPeriod 2}\r\n\t{tag effects}\r\n)\r\n');
  G(SND + 'weapon/folder.set', '{sound\r\n\t{tag effects}\r\n}\r\n');
  G(SND + LIKE + '/folder.set', '{sound\r\n(include "\\sound\\defines.inc")\r\n("Rifle_3p")\r\n}\r\n');
  G(SND + LIKE + '/zz_01.wav', W.encodePcm16(tone(44100, 1, 0.05))); G(SND + LIKE + '/zz_02.wav', W.encodePcm16(tone(44100, 1, 0.05)));
  G(RIFLE, '{from "pattern rifle"\r\n\t{fireSound "zz/rifle/"}\r\n\t{reloadsound "rifle"}\r\n\t{mass 4}\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const mk = (answers, files, verb, base) => {
    const d = D.newId('sound'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
    for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
    return D.save(ctx, { id: d, recipe: 'sound', verb: verb || 'make', game: 'goh', mod, base: { id: base || LIKE }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { sound: R });
  const MAKE = o => Object.assign({ where: v('fire'), name: v('zz_new'), like: { src: 'exist', value: LIKE }, files: { src: 'keep' } }, o || {});

  await t('games: goh in, no na; the GoH rows in four languages without dashes; dist questions GoH only, new class AS2 only', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.sound.na.goh'));
    for (const k of ['task.sound.q.dist_min', 'task.sound.h.dist_min', 'task.sound.q.dist_max', 'task.sound.h.dist_max', 'task.sound.e.nogoh']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
    const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
    assert.deepEqual(Q.dist_min.when.$game, ['goh']); assert.deepEqual(Q.dist_max.when.$game, ['goh']);
    for (const id of ['newclass', 'class_name', 'class_min', 'class_max', 'class_prio']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
  });
  await t('lookups and values read the GoH sounds: the preset resolves to weapon_3p, 100 to 200 m', async () => {
    const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
    const s = await R.lookups.soundname(lc, 'zz', { game: 'goh' });
    assert.deepEqual(s.map(x => x.id), [LIKE]);
    const wp = await R.lookups.weapon(lc, 'zzrifle', { game: 'goh' });
    assert.deepEqual(wp.map(x => x.id), [RIFLE]);
    const ld = await R.lookups.loudness(lc, '', { game: 'goh' });
    assert.deepEqual(ld.map(x => x.id), ['default', 'weapon_3p', 'rifle_close']);
    const vs = await R.values(Object.assign({}, lc, { mod }), { id: LIKE }, { game: 'goh', verb: 'make' });
    assert.equal(vs.dist_min, 100); assert.equal(vs.dist_max, 200); assert.equal(vs.loudness, 'weapon_3p'); assert.equal(vs.signal_m, 120);
    const v0 = await R.values(lc, null, { game: 'goh', verb: 'make' });
    assert.equal(v0.dist_min, 5); assert.equal(v0.dist_max, 100);
    const va = await R.values({ gameId: 'as64', game: () => null }, null, { verb: 'make' });
    assert.ok(!('dist_min' in va), 'AS2 values have no GoH distance');
  });
  let keepDraft;
  await t('make, distances kept: wav copies, a folder.set naming every key, the rifle fireSound row, no gen sound op', async () => {
    keepDraft = mk(MAKE({ user: { src: 'exist', value: RIFLE } }));
    const r = await run(keepDraft);
    const ops = (r.gen && r.gen.ops) || [];
    assert.ok(!ops.some(o => o.op === 'sound' || o.op === 'soundclass'), JSON.stringify(ops));
    const set = ops.find(o => o.op === 'set');
    assert.deepEqual(set.rows, [{ entity: 'file:' + RIFLE, path: 'from/fireSound', value: '"zz/zz_new/"', op: 'add' }]);
    assert.deepEqual(r.copies.filter(c => c.key).map(c => c.to), [SND + 'weapon/shot/zz/zz_new/zz_01.wav', SND + 'weapon/shot/zz/zz_new/zz_02.wav']);
    const fsC = r.copies.find(c => c.staged); assert.equal(fsC.to, SND + 'weapon/shot/zz/zz_new/folder.set');
    const txt = fs.readFileSync(path.join(D.stageDir(ctx, keepDraft.id), ...fsC.staged.split('/')), 'latin1');
    assert.equal(txt, '{sound\r\n\t{tag effects}\r\n\t{loudness "weapon_3p"}\r\n\t{volume 1}\r\n\t{signal shot 120}\r\n\t{SignalPeriod 2}\r\n}\r\n');
    assert.equal(r.result, 'zz/zz_new/');
  });
  await t('make: distances of another row name it; new distances add a soundclass row; reload keeps the file spelling reloadsound', async () => {
    const r1 = await run(mk(MAKE({ dist_min: v(10), dist_max: v(300) })));
    assert.ok(!((r1.gen && r1.gen.ops) || []).some(o => o.op === 'soundclass'));
    assert.ok(r1.notes.some(x => /sound\.set row rifle_close/.test(x)), JSON.stringify(r1.notes));
    const r2 = await run(mk(MAKE({ dist_min: v(12), dist_max: v(400) })));
    assert.deepEqual(r2.gen.ops.filter(o => o.op === 'soundclass'), [{ op: 'soundclass', name: 'arsenal_zz_new', min: 12, max: 400, priority: 80 }]);
    const r3 = await run(mk(MAKE({ where: v('reload'), user: { src: 'exist', value: RIFLE } })));
    assert.equal(r3.gen.ops.find(o => o.op === 'set').rows[0].path, 'from/reloadsound');
    assert.ok(r3.copies.some(c => c.to === SND + 'weapon/reload/zz_new/folder.set'), JSON.stringify(r3.copies.map(c => c.to)));
  });
  await t('make with files: 48 kHz PCM16 is copied as it is on GoH, 32 kHz goes through wav-convert; refusals', async () => {
    const files = { 'a48.wav': W.encodePcm16(tone(48000, 1, 0.05)), 'b32.wav': W.encodePcm16(tone(32000, 1, 0.05)) };
    const r = await run(mk(MAKE({ files: { src: 'file', staged: ['a48.wav', 'b32.wav'] } }), files));
    assert.ok(r.copies.some(c => c.staged === 'a48.wav' && c.to === SND + 'weapon/shot/zz/zz_new/a48.wav'), JSON.stringify(r.copies));
    assert.deepEqual(r.calls.map(c => [c.route, c.body.out, c.body.rate]), [['POST /api/x/art/wav-convert', SND + 'weapon/shot/zz/zz_new/b32.wav', 44100]]);
    assert.ok(!r.copies.some(c => c.key), 'no copy of the start wavs when files are brought');
    let e = null; try { await run(mk(MAKE({ dist_min: v(0) }))); } catch (x) { e = x; } assert.ok(e && /GHVIS-31/.test(e.message), e && e.message);
    e = null; try { await R.compile({ game: 'goh' }, { game: 'goh', verb: 'make', gameDir: null, mod, value: () => undefined, answer: () => undefined, kept: () => false, values: {} }); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.sound.e.nogoh');
  });
  await t('change: the brought file takes the game names; a 48 kHz file is copied', async () => {
    const r = await run(mk({ target: { src: 'keep' }, newfiles: { src: 'file', staged: ['n.wav'] } }, { 'n.wav': W.encodePcm16(tone(48000, 1, 0.05)) }, 'change'));
    assert.deepEqual(r.copies.map(c => c.to).sort(), [SND + LIKE + '/zz_01.wav', SND + LIKE + '/zz_02.wav']);
    assert.equal(r.calls.length, 0); assert.ok(!r.gen);
  });
  await t('write: folder.set (CRLF), the wavs, the new sound.set row and the rifle go into the mod; the game files stay', async () => {
    const d = mk(MAKE({ dist_min: v(12), dist_max: v(400), user: { src: 'exist', value: RIFLE } }));
    const r = await CP.write(ctx, d, { sound: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const M = k => path.join(mod, ...k.split('/'));
    const fset = fs.readFileSync(M(SND + 'weapon/shot/zz/zz_new/folder.set'), 'latin1');
    assert.ok(/\{loudness "arsenal_zz_new"\}/.test(fset) && !/(^|[^\r])\n/.test(fset), fset);
    assert.ok(fs.existsSync(M(SND + 'weapon/shot/zz/zz_new/zz_01.wav')) && fs.existsSync(M(SND + 'weapon/shot/zz/zz_new/zz_02.wav')));
    const ss = fs.readFileSync(M(SND + 'sound.set'), 'latin1');
    assert.ok(/\{loudness "arsenal_zz_new" 12 400 80\}/.test(ss) && /\{loudness "rifle_close" 10 300 30\}/.test(ss), ss);
    assert.ok(/\{fireSound "zz\/zz_new\/"\}/.test(fs.readFileSync(M(RIFLE), 'latin1')));
    assert.ok(/fireSound "zz\/rifle\/"/.test(fs.readFileSync(path.join(g, ...RIFLE.split('/')), 'latin1')), 'the game rifle stays');
    assert.ok(r.restore.length >= 1, JSON.stringify(r.restore));
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
