// recipe "an icon" test: node icon.test.js <scratch>. A 200x100 PNG is staged for the draft; the kit checks the recipe, strings, census
// coverage and its seeded defect, steps, compile, the plan (one icon-png route call, dry) and writes into the scratch mod; after() reads
// the 8 cards back (4 big at 104x52, 4 small at 112x48, names _00.._03 in both folders). Before the kit, direct compiles: a "keep" draft
// that copies pz4h's cards under a new name, refusals, and values() preselecting the kind from the parent's question.
// Author: Imperator_Aug (ARSENAL, ia-40770e76)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const A = require('../../../../artport/artport');
const recipe = require('./icon.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-icon-')));
fs.mkdirSync(scratch, { recursive: true });

const id = 'icon-test-kit';
const stage = D.stageDir({ tmpRoot: path.join(scratch, 'tmp') }, id);
fs.mkdirSync(stage, { recursive: true });
const W0 = 200, H0 = 100, rgba = Buffer.alloc(W0 * H0 * 4);
for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { const o = (y * W0 + x) * 4; rgba[o] = x; rgba[o + 1] = y * 2; rgba[o + 2] = 128; rgba[o + 3] = 255; }
fs.writeFileSync(path.join(stage, 'card.png'), A.encodePng({ w: W0, h: H0, rgba }));
const S = 'resource/interface/scene/';
const cards = [0, 1, 2, 3].map(i => S + 'unit_icon/task_icon_0' + i + '.tga').concat([0, 1, 2, 3].map(i => S + 'unit_icon_small/task_icon_0' + i + '.tga'));

(async () => {
  const gameDir = kit.findGame({}), ctx = kit.ctxFor(scratch, { gameDir });
  let fails = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  const v1 = await recipe.values(ctx, null, { verb: 'make', draft: { parent: { q: 'portrait' } }, pass: { base: { id: 'resource/set/breed/mp/ger/rifleman.def' } } });
  ok(v1.kind === 'portrait' && v1.name === 'rifleman', 'values: a parent portrait question preselects portrait and the passed name', JSON.stringify(v1));
  const v2 = await recipe.values(ctx, { id: 'pz4h' }, { verb: 'make' });
  ok(v2.kind === 'icon' && v2.name === 'pz4h_new', 'values: a make with no parent defaults to a new name (left as it is, it never replaces the copy\'s card)', JSON.stringify(v2));
  const v3 = await recipe.values(ctx, { id: 'pz4h' }, { verb: 'change' });
  ok(v3.name === 'pz4h', 'values: a change works on the unit\'s own icon', JSON.stringify(v3));
  // card and picker agree: the icon editor card says TGA, the image editor PNG or TGA; both are taken at upload, in make and change
  const IQ = {}; for (const g of recipe.groups) for (const q of g.q) IQ[q.id] = q;
  ok(['image', 'newimage'].every(k => IQ[k].picker.kinds.includes('.tga') && IQ[k].picker.kinds.includes('.png')), 'the picture step takes PNG and TGA (what the cards say)');
  ok(!IQ.newimage.picker.sources.includes('keep') && IQ.newimage.when.$verb.join() === 'change' && IQ.image.when.$verb.join() === 'make', 'change asks for a new picture with no Keep');
  ok(IQ.name.kind === 'thing' && IQ.name.picker.lookup === 'iconname' && IQ.name.picker.in === 'kind', 'the name is picked from the names that have a picture of the kind');
  const IL = new Map(require('./icon.lang').map(r => [r[0], r[1]]));
  ok(!/unit_icon|structure\/|_00/.test(IL.get('task.icon.h.kind')) && /TGA/.test(IL.get('task.icon.h.image')) && /portrait/i.test(IL.get('task.icon.h.name')), 'kind help without file words; picture help says TGA; name help covers a portrait');
  ok(IQ.image.picker.check({ name: 'bad.tga', bytes: Buffer.from('not a picture') }).key === 'task.icon.e.read' && IQ.newimage.picker.check({ name: 'c.tga', bytes: A.encodeTga({ w: W0, h: H0, rgba }) }) === null && IQ.image.picker.check({ name: 'card.png', bytes: Buffer.alloc(8) }) === null, 'upload: a TGA this tool cannot read is refused at upload; a good TGA passes (PNG is checked by the core)');
  ok(recipe.test === 'task.icon.test' && IL.has('task.icon.test'), 'the Test step says where to see the icon');
  if (!ctx.game()) console.log('note: SKIP keep compile: no game folder');
  else {
    const mod = path.join(scratch, 'mods', 'icon_keep'); fs.mkdirSync(mod, { recursive: true });
    const save = (verb, answers) => D.save(ctx, { id: D.newId('icon'), recipe: 'icon', verb, game: 'as64', mod, base: { id: 'pz4h' }, answers, kept: [], state: 'open' });
    const v = x => ({ src: 'value', value: x });
    const c = await CP.compile(ctx, save('make', { kind: v('icon'), name: v('pz4h_task') }), { icon: recipe });
    ok(c.copies.length === 8 && c.copies.every(x => x.key && /pz4h_0\d\.tga$/.test(x.key) && /pz4h_task_0\d\.tga$/.test(x.to)), 'keep: the 8 game cards of pz4h are copied under the new name', JSON.stringify(c.copies));
    ok(c.copies.some(x => /unit_icon_small\/pz4h_03\.tga$/.test(x.key)), 'keep: unit_icon_small frames are _00.._03 (census note fixed)', JSON.stringify(c.copies));
    ok(!c.calls.length && c.result === 'pz4h_task', 'keep: no route call, the result is the icon name', c.result);
    const refuse = async (verb, answers, re, m) => { let e = null; try { await CP.compile(ctx, save(verb, answers), { icon: recipe }); } catch (x) { e = x; } ok(e && re.test(e.message), m, e && e.message); };
    await refuse('change', { kind: v('icon'), name: v('pz4h') }, /needs a new picture/, 'a change with no new picture refuses (nothing would change)');
    // a TGA from the icon editor card: turned into PNG in staging and sent to icon-png
    const tgaD = save('change', { kind: v('icon'), name: { src: 'exist', value: 'pz4h' }, newimage: { src: 'file', staged: ['card.tga'] } });
    const tgaP = D.stagedPath(ctx, tgaD.id, 'card.tga'); fs.mkdirSync(path.dirname(tgaP), { recursive: true }); fs.writeFileSync(tgaP, A.encodeTga({ w: W0, h: H0, rgba }));
    const ct = await CP.compile(ctx, tgaD, { icon: recipe });
    const pp = ct.calls[0] && ct.calls[0].body.png;
    ok(ct.calls.length === 1 && /\.png$/.test(pp) && fs.existsSync(pp) && fs.readFileSync(pp).readUInt32BE(0) === 0x89504E47, 'a brought TGA is turned into PNG and goes through icon-png', JSON.stringify(ct.calls));
    ok(ct.notes.some(n => /^This replaces the game's icon picture pz4h/.test(n)), 'Review says the game card is replaced', JSON.stringify(ct.notes));
    const ln = await recipe.lookups.iconname(ctx, '(', { in: 'squad' }), ln2 = await recipe.lookups.iconname(ctx, 'my_new_tank', { in: 'icon' });
    ok(ln.results.length && ln.results.every(x => x.where !== 'new' && /\(/.test(x.id)), 'the squad names with an army in brackets come from the game, no guessing', JSON.stringify(ln.results.slice(0, 3)));
    ok(ln2.results[0].id === 'my_new_tank' && ln2.results[0].where === 'new' && !ln2.exact, 'a typed name with no picture is offered as a new name', JSON.stringify(ln2.results.slice(0, 2)));
    await refuse('make', { kind: v('icon'), name: v('pz4h_x'), image: { src: 'exist', value: S + 'portrait/ger_officer.tga' } }, /same kind/, 'a portrait picked for a buy card refuses');
  }
  console.log(fails ? 'FAIL (direct checks)' : 'PASS (direct checks)');
  if (fails) process.exitCode = 1;
  await kit.run(recipe, require('./icon.lang'), {
    id, gameDir: gameDir || undefined,
    base: { id: 'pz4h' },
    answers: { kind: 'icon', name: 'task_icon', image: { src: 'file', staged: ['card.png'] } },
    write: true,
    after: (mod, res, ok) => {
      ok(JSON.stringify(res.calls || []).includes('icon-png'), 'the write ran the icon-png route', JSON.stringify(res.calls).slice(0, 300));
      for (const k of cards) {
        const p = path.join(mod, ...k.split('/'));
        if (!fs.existsSync(p)) { ok(false, 'written: ' + k); continue; }
        const b = fs.readFileSync(p), big = /unit_icon\//.test(k);
        ok(b[2] === 2 && b[16] === 32, k + ' is a 32 bit TGA type 2', b[2] + '/' + b[16]);
        ok(b.readUInt16LE(12) === (big ? 104 : 112) && b.readUInt16LE(14) === (big ? 52 : 48), k + ' has the game size', b.readUInt16LE(12) + 'x' + b.readUInt16LE(14));
      }
      ok(res.raw && res.raw.result === 'task_icon', 'the branch result is the icon name', res.raw && res.raw.result);
    },
  }, scratch);
})();
