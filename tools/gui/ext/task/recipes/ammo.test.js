// recipe "ammunition" test: node ammo.test.js <scratch>. The kit checks the recipe, strings, census coverage (+ seeded defect), steps,
// compile and the gen --plan of two drafts on vanilla bases: a new shell type copied from bullet75.fg (gen shell with new blast layers +
// set rows + text) and a change of the vanilla rifle rounds (an override: set rows) given to a soldier type. Then the reader and compile are
// checked directly. Writes only under <scratch>. Author: Imperator_Aug (ARSENAL, recipe-weapon)
// Author: Imperator_Aug (ARSENAL, ia-1409f0d5)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const recipe = require('./ammo.recipe'), lang = require('./ammo.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-ammo-')));
fs.mkdirSync(scratch, { recursive: true });
// novice hazards over every vanilla copy: each question shown (steps, Everything) takes the copy's own value (a limit never refuses
// what the game uses); each question Quick shows has a default to leave; the id default is free; help text names no limit id or file
async function hazards(rec, lng, ctx, lookup, ok) {
  const RR = require('../lib/recipe');
  const all = await rec.lookups[lookup](ctx, '', { limit: 99999 });
  ok(all.length > 20, 'hazards: the copy list is full', all.length);
  const qs = rec.groups.flatMap(g => g.q), breaks = [], missing = [], taken = [];
  for (const it of all) {
    let v; try { v = await rec.values(ctx, it, { verb: 'make' }); } catch (e) { breaks.push(it.ref.key + ' threw ' + e.message); continue; }
    const shown = RR.steps(rec, { verb: 'make', answers: {} }, v).filter(s => s.kind === 'q').map(s => s.q);
    const quick = RR.steps(rec, { verb: 'make', mode: 'quick', answers: {} }, v).filter(s => s.kind === 'q').map(s => s.q);
    if (v._meta && v.id === v._meta.id) taken.push(it.ref.key);
    for (const q of qs) {
      const x = v[q.id], L = q.limits || {}, at = q.id + '=' + JSON.stringify(x) + ' ' + it.ref.key;
      if (quick.includes(q.id) && !q.optional && ['number', 'text', 'choice', 'thing'].includes(q.kind) && (x === undefined || x === null || x === '')) missing.push(at);
      if (!shown.includes(q.id)) continue;
      for (const y of [].concat(x == null || x === '' ? [] : x)) {
        if (q.kind === 'number' && ((L.min != null && y < L.min) || (L.max != null && y > L.max))) breaks.push(at);
        if (q.kind === 'choice' && L.values && !L.values.includes(y)) breaks.push(at);
        if ((q.kind === 'text' || q.kind === 'list') && L.re && !new RegExp(L.re).test(String(y))) breaks.push(at);
      }
    }
  }
  ok(!breaks.length, 'hazards: every vanilla value passes the limits of the questions shown', breaks.length + ' ' + breaks.slice(0, 5).join(' | '));
  ok(!missing.length, 'hazards: every question Quick shows has a default', missing.length + ' ' + missing.slice(0, 5).join(' | '));
  ok(!taken.length, 'hazards: the id default is never the copy\'s own id', taken.slice(0, 5).join(' | '));
  const bad = lng.filter(r => /\.h\./.test(r[0]) && r.slice(1).some(s => /\b[A-Z]{2,5}-\d+\b|[a-z_]+\/[a-z_]+\.(set|def|inc|ext|mdl)\b|Vanilla/.test(s)));
  ok(!bad.length, 'hazards: help names no limit id or file path', bad.map(r => r[0]).join(' '));
  const allq = rec.groups.flatMap(g => g.q);
  ok(!allq.some(q => q.when && q.when.$verb === 'fact'), 'hazards: no hidden questions; what the copy has gates by when $copy');
  ok(allq.some(q => q.limits && q.limits.usual), 'hazards: numbers carry the range the game uses (limits.usual)');
  ok(allq.filter(q => q.limits && q.limits.usual).every(q => !/The game uses/.test((lng.find(r => r[0] === q.help) || [])[1] || '')), 'hazards: the game range is the usual warning, not a help sentence');
  ok(!!rec.test && lng.some(r => r[0] === rec.test), 'hazards: the Test step says what to do in the game');
}
const FG = { id: 'bullet75 fg ammo', ref: { key: 'resource/set/stuff/shell/bullet75.fg.ammo' } };
const RIFLE = { id: 'rifle ammo', ref: { key: 'resource/set/stuff/ammo/rifle.ammo' } };

(async () => {
  let fails = 0;
  const sum = r => { if (r && r.fails) fails += r.fails; };
  sum(await kit.run(recipe, lang, {
    base: FG, verb: 'make',
    answers: { id: 'bullet75.he2', name: 'HE heavy 75 mm', blast_energy: 5, blast_radius: 9, mass: 13, isize: '5 1', weight: 110 },
    mod: path.join(scratch, 'mods', 'ammo_make'),
    planFiles: ['resource/set/stuff/shell/bullet75.he2.ammo'],
  }, path.join(scratch, 'make')));
  sum(await kit.run(recipe, lang, {
    base: RIFLE, verb: 'change',
    answers: { mass: 0.02, block: 30, giveq: true, carriers: ['ger/rifle'], count: 60 },
    mod: path.join(scratch, 'mods', 'ammo_change'),
    planFiles: ['resource/set/stuff/ammo/rifle.ammo'],
  }, path.join(scratch, 'change')));

  let pass = 0, fail = 0;
  const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('FAIL ' + m + (d ? ': ' + d : '')); } };
  const gdir = kit.findGame({});
  if (!gdir) console.log('SKIP direct checks: no game folder');
  else {
    const ctx = { game: () => gdir, mod: '' };
    const v = await recipe.values(ctx, FG);
    ok(v._meta.preset && v._meta.preset.name === 'fg' && v.strength === 3.5, 'bullet75.fg calls ("fg" args 3.5)', JSON.stringify(v._meta.preset));
    ok(v._meta.layers.length === 2 && v.blast_energy === 4.025, 'two blast layers read, the first 4.025 (3.5 x 1.15)', JSON.stringify(v._meta.layers));
    const ans = a => { const o = {}; for (const [k, x] of Object.entries(a)) o[k] = { src: 'value', value: x }; return o; };
    const cc = (verb, a, values) => ({ verb, gameDir: gdir, mod: path.join(scratch, 'none'), values, answer: id => a[id] || null, value: id => a[id] ? a[id].value : values[id], kept: id => !a[id] });
    const mk = recipe.compile({}, cc('make', ans({ id: 'bullet75.he2', blast_radius: v.blast_radius * 2 }), v));
    const sh = mk.gen.ops.find(o => o.op === 'shell');
    ok(sh && sh.blast && sh.blast.length === 2 && /^4\.025 0\.4 1 *$/.test(sh.blast[0]), 'make: blast layers scaled with the radius', JSON.stringify(sh));
    ok(mk.result === 'bullet75', 'make: the result is the shell family a gun fills with', mk.result);
    const ch = recipe.compile({}, cc('change', ans({ strength: 4 }), v));
    const mac = ch.gen.ops.find(o => o.op === 'macro');
    ok(mac && mac.macro === 'fg' && mac.arg === 'args' && mac.value === 4, 'change: the preset number through the macro op', JSON.stringify(ch.gen.ops));
    const rv = await recipe.values(ctx, RIFLE);
    ok(rv.block === 25 && rv.mass === 0.015, 'rifle rounds: block 25, mass 0.015', JSON.stringify(rv));
    // advanced questions: the tracer picture of an existing round is set by value index (a new quoted value would be a second line)
    const mg = await recipe.values(ctx, { id: 'mgun ammo', ref: { key: 'resource/set/stuff/ammo/mgun.ammo' } });
    ok(mg.trace === 'trace3' && mg._meta.has.trace, 'mgun rounds: tracer trace3 read', JSON.stringify([mg.trace, mg._meta.has]));
    const tc = recipe.compile({}, cc('change', ans({ trace: 'trace4', tracelen: 5, hold: 'stuff' }), mg));
    const ts = tc.gen.ops.find(o => o.op === 'set'), tp = p => ts && ts.rows.find(r => r.path === p);
    ok(tp('bullet/trace/view[0]') && tp('bullet/trace/view[0]').value === '"/texture/fx/trace4"' && tp('bullet/trace/length'), 'advanced: tracer picture as view[0], length a set row', JSON.stringify(ts));
    ok(tp('bullet/inventory/fsm[0]') && tp('bullet/inventory/fsm[0]').value === '"stuff"', 'advanced: how it is carried as fsm[0]', JSON.stringify(ts));
    const nt = recipe.compile({}, cc('change', ans({ trace: 'trace4' }), v));
    ok(!nt.gen || !nt.gen.ops.some(o => o.op === 'set'), 'advanced: no tracer is made up on a round without one', JSON.stringify(nt));
    let threw = null; try { recipe.compile({}, cc('make', ans({ id: 'bullet75.fg' }), v)); } catch (e) { threw = e.message; }
    ok(threw && /new id/i.test(threw), 'make: the id of the copy is refused', threw);
    // fire damage and blast layers of arl: its own {damage} blocks (blastwave, add blastwave, fire)
    const la = await recipe.lookups.round(ctx, 'air rocket', {});
    ok(la.length && la[0].name === 'Air rocket' && la[0].id === 'arl ammo', 'lookup: player name Air rocket, id arl ammo', JSON.stringify(la.slice(0, 2)));
    const av = await recipe.values(ctx, { id: 'arl ammo', ref: { key: 'resource/set/stuff/reactive/arl.ammo' } });
    ok(av._meta.dm.map(d => d.type + d.idx).join(' ') === 'blastwave0 blastwave1 fire2', 'arl: own damage blocks blastwave, add blastwave, fire', JSON.stringify(av._meta.dm));
    const af = recipe.compile({}, cc('make', ans({ id: 'arl_hot', firerad: 12 }), av)).gen.ops.find(o => o.op === 'shell');
    ok(af && af.damage_edit && af.damage_edit[0].type === 'fire' && af.damage_edit[0].layer === 1 && af.damage_edit[0].set.radius === 12, 'make: fire radius through shell damage_edit', JSON.stringify(af));
    const ac = recipe.compile({}, cc('change', ans({ firetime: 4, blast_radius: 16 }), av)).gen.ops.find(o => o.op === 'set'), ap = p => ac && ac.rows.find(r => r.path.endsWith(p));
    ok(ap('damage[2]/time') && ap('damage[2]/time').value === '4' && ap('damage[0]/area') && ap('damage[1]/area'), 'change: fire and both blast layers by damage[n]', JSON.stringify(ac));
    // tag words: the kind word on make goes through the shell op (own word dropped) or a -word line (inherited)
    const tk = recipe.compile({}, cc('make', ans({ id: 'bullet75.ap9', tagkind: 'ap' }), v)).gen.ops;
    ok(tk.some(o => (o.op === 'shell' && [].concat(o.tags || []).includes('ap')) || (o.op === 'set' && o.rows.some(r => /tag/.test(r.path) && /\bap\b/.test(r.value) && /-fg\b/.test(r.value)))), 'tags: a new kind word ap, fg dropped', JSON.stringify(tk));
    // novice: the id default is a free name, a taken one is refused at the question; the name default is the player name
    const RR = require('../lib/recipe');
    ok(v.id === 'bullet75.fg2' && v._meta.id === 'bullet75.fg', 'id: the default is the free bullet75.fg2', v.id);
    const u1 = await recipe.lookups.newround(ctx, 'bullet75.fg', {}), u2 = await recipe.lookups.newround(ctx, v.id, {});
    ok(u1.exact === true && u2.exact === false, 'id: bullet75.fg is taken, bullet75.fg2 is free', JSON.stringify([u1, u2]));
    ok(recipe.groups.flatMap(g => g.q).find(q => q.id === 'id').unique.lookup === 'newround', 'id: the question checks the name is free');
    ok(v.name && v.name !== 'bullet75.fg' && v.name !== v._meta.id, 'name: the default is the player name', v.name);
    // a high explosive round with a preset: on change the radius is not asked (the preset number sets it), the energy is
    const vc = await recipe.values(ctx, FG, { verb: 'change' });
    const sc = RR.steps(recipe, { verb: 'change', answers: {} }, vc).filter(s => s.kind === 'q').map(s => s.q);
    ok(sc.includes('strength') && sc.includes('blast_energy') && !sc.includes('blast_radius'), 'change of bullet75.fg: strength and energy asked, radius not', sc.join(' '));
    const sm = RR.steps(recipe, { verb: 'make', answers: {} }, v).filter(s => s.kind === 'q').map(s => s.q);
    ok(sm.includes('blast_radius') && !sm.includes('block') && !sm.some(q => /^f_/.test(q)), 'make from bullet75.fg: radius asked, no stack size for a shell, no hidden facts shown', sm.join(' '));
    // a new energy wins over the strength: one macro with the energy's preset number, a note for the strength
    const ew = recipe.compile({}, cc('change', ans({ strength: 2, blast_energy: 5.75 }), vc));
    const em = ew.gen.ops.filter(o => o.op === 'macro');
    ok(em.length === 1 && em[0].value === 5 && ew.notes.some(x => /strength answer was not used/.test(x)), 'change: a new energy wins over the strength (5.75 / 1.15 = 5)', JSON.stringify([em, ew.notes]));
    // stacked rounds ask the stack size; carriers only after a yes
    const sr = RR.steps(recipe, { verb: 'change', answers: {} }, rv).filter(s => s.kind === 'q').map(s => s.q);
    ok(sr.includes('block') && !sr.includes('carriers') && !sr.includes('count'), 'rifle rounds: stack size asked; carriers and count wait for a yes', sr.join(' '));
    const k0 = recipe.compile({}, cc('change', ans({ carriers: ['ger/rifle'], count: 60 }), rv)), k1 = recipe.compile({}, cc('change', ans({ giveq: true, carriers: ['ger/rifle'], count: 60 }), rv));
    ok(!(k0.gen && k0.gen.ops.some(o => o.op === 'kit')) && k1.gen.ops.some(o => o.op === 'kit'), 'carry: soldiers get it only after a yes', JSON.stringify([k0.gen, k1.gen && k1.gen.ops.map(o => o.op)]));
    // tracer pictures are named by the rounds that use them, not by a number
    ok(lang.filter(r => /\.v\.trace\./.test(r[0])).every(r => !/tracer \d/.test(r[1])), 'trace: labels name the rounds that use each picture');
    await hazards(recipe, lang, ctx, 'round', ok);
  }
  console.log('direct: ' + pass + ' passed, ' + fail + ' failed');
  fails += fail;
  console.log(fails ? 'FAIL ammo' : 'PASS ammo');
  if (fails) process.exitCode = 1;
})();
