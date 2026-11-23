// recipe "a gun or weapon" test: node gun.test.js <scratch>. The kit checks the recipe, strings, census coverage (+ seeded defect),
// steps, compile and the gen --plan of three drafts on vanilla bases: a new rifle copied from mosin (gun op + set rows + kit), a change
// of the mosin itself (an override: set rows and the speed macro), and a new cannon copied from a vanilla gun (gun op cannon path).
// Then the reader and compile are checked directly (values read through tools/lib sdlset, ops the answers give). Writes only under <scratch>.
// Author: Imperator_Aug (ARSENAL, ia-3d6c4e19)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const recipe = require('./gun.recipe'), lang = require('./gun.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-gun-')));
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
const MOSIN = { id: 'mosin', ref: { key: 'resource/set/stuff/rifle/mosin' } };

(async () => {
  let fails = 0;
  const sum = r => { if (r && r.fails) fails += r.fails; };
  // 1 make: a rifle from mosin, numbers changed, a carrier
  sum(await kit.run(recipe, lang, {
    base: MOSIN, verb: 'make',
    answers: { id: 'mosin_task', name: 'Mosin task rifle', reload: 4, range: 80, between: 2, speed: 900, isize: '5 2', weight: 120, aimtol: 2, giveq: true, carriers: ['rus/rifle'] },
    mod: path.join(scratch, 'mods', 'gun_make'),
    planFiles: ['resource/set/stuff/rifle/mosin_task'],
  }, path.join(scratch, 'make')));
  // 2 change: the vanilla mosin, an override in the mod
  sum(await kit.run(recipe, lang, {
    base: MOSIN, verb: 'change',
    answers: { reload: 2.5, speed: 900, mass: 4, bshort: 2 },
    mod: path.join(scratch, 'mods', 'gun_change'),
    planFiles: ['resource/set/stuff/rifle/mosin'],
  }, path.join(scratch, 'change')));

  // 3 direct checks: values and the ops of a cannon make and of the change above
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('FAIL ' + m + (d ? ': ' + d : '')); } };
  const gdir = kit.findGame({});
  if (!gdir) { console.log('SKIP direct checks: no game folder'); }
  else {
    const ctx = { game: () => gdir, mod: '' };
    const v = await recipe.values(ctx, MOSIN);
    ok(v.kindq === 'rifle', 'mosin is a rifle', v.kindq);
    ok(v.magazine === 5, 'mosin holds 5 rounds', v.magazine);
    ok(v.speed === 850, 'mosin speed read through the s() macro as 850 m/s', v.speed);
    ok(typeof v.reload === 'number' && v.reload > 0, 'mosin reload read from rifle.pattern', v.reload);
    ok(v._meta && v._meta.calls.includes('speed'), 'the raw mosin file sets speed by a macro call', JSON.stringify(v._meta && v._meta.calls));
    const ans = a => { const o = {}; for (const [k, x] of Object.entries(a)) o[k] = { src: 'value', value: x }; return o; };
    const cc = (verb, a, values) => ({ verb, gameDir: gdir, mod: path.join(scratch, 'none'), values, answer: id => a[id] || null, value: id => a[id] ? a[id].value : values[id], kept: id => !a[id] });
    const ch = recipe.compile({}, cc('change', ans({ speed: 900, reload: 2.5 }), v));
    const mac = ch.gen.ops.find(o => o.op === 'macro');
    ok(mac && mac.macro === 'speed' && mac.arg === 's' && mac.value === 900, 'change: speed goes through the macro op', JSON.stringify(ch.gen.ops));
    const set = ch.gen.ops.find(o => o.op === 'set');
    ok(set && set.rows.some(r => r.path === 'from/rechargeTime' && r.value === '2.5' && r.op === 'add'), 'change: reload is a set row on the mosin file', JSON.stringify(set));
    ok(!ch.gen.ops.some(o => o.op === 'set' && o.rows.some(r => /speed/i.test(r.path))), 'change: no set row on the speed macro list');
    const mk = recipe.compile({}, cc('make', ans({ id: 'mosin_x' }), v));
    ok(mk.gen.ops[0].op === 'gun' && mk.gen.ops[0].class === 'rifle' && mk.gen.ops[0].like === 'mosin', 'make: one gun op with class rifle like mosin', JSON.stringify(mk.gen.ops));
    // advanced questions: a burst minimum on make goes into the whole inherited burst block; a cursor on change is a set row
    const adv = recipe.compile({}, cc('change', ans({ cursor: 'smg_on', norico: true, ricodamp: ['20 0.5'] }), v));
    const as = adv.gen.ops.find(o => o.op === 'set'), rp = p => as && as.rows.find(r => r.path === p);
    ok(rp('from/cursor') && rp('from/cursor').value === '"smg_on"', 'advanced: cursor is a set row', JSON.stringify(as));
    ok(rp('from/DisableRicochet') && rp('from/RicochetEnergyDamping').value === '{20 0.5}', 'advanced: a flag and a pairs list are set rows', JSON.stringify(as));
    const mb = recipe.compile({}, cc('make', ans({ id: 'mosin_b', kindq: 'rifle', bmin: 2 }), v));
    const ms = mb.gen.ops.find(o => o.op === 'set');
    ok(ms && ms.rows.some(r => /\/burst$/.test(r.path) && /\{min 2\}/.test(r.value)), 'advanced: burst min on make is in the burst block', JSON.stringify(mb.gen.ops));
    let threw = null; try { recipe.compile({}, cc('make', ans({ id: 'mosin' }), v)); } catch (e) { threw = e.message; }
    ok(threw && /new id/i.test(threw), 'make: the id of the copy is refused', threw);
    // a cannon
    const can = (await recipe.lookups.weapon(ctx, 'pak40', {})).find(x => /\/gun\//.test(x.ref.key));
    ok(!!can, 'the weapon lookup finds a pak40 cannon', can && can.ref.key);
    if (can) {
      const cv = await recipe.values(ctx, can);
      ok(cv.kindq === 'cannon', 'pak40 is a cannon', cv.kindq);
      const cm = recipe.compile({}, cc('make', ans({ id: 'pak40_task', reload: 3.5, rangep: 'long', isize: '6 3' }), cv));
      const g = cm.gen.ops.find(o => o.op === 'gun');
      ok(g && g.class === 'cannon' && g.reload === 3.5 && g.range === 'long', 'cannon make: gun op with reload and the range preset', JSON.stringify(g));
      // the plan of the cannon draft
      const G = require('../../units/server').lib.gen();
      const mod = path.join(scratch, 'mods', 'gun_cannon'); fs.mkdirSync(mod, { recursive: true });
      const gctx = new G.Ctx({ target: 'as64', game: gdir, out: mod, plan: true, deps: [] });
      cm.gen.ops.forEach(s => G.ops[G.genMain.OPS[s.op]](gctx, s, s.op === 'set' ? scratch : { name: 'gun_cannon' }));
      const f = require('../../units/server').lib.findings(gctx);
      ok(!f.errors.length, 'cannon make: gen plan has no errors', JSON.stringify(f.errors).slice(0, 600));
      ok([...gctx.dirty.keys()].includes('resource/set/stuff/gun/pak40_task'), 'cannon make: plan writes set/stuff/gun/pak40_task', [...gctx.dirty.keys()].join(' '));
    }
    // a machine gun on a vehicle: the weapon op mounts outside gun/ too, place mgun by default
    const mg = (await recipe.lookups.weapon(ctx, 'mg34', {})).find(x => /\/mgun\/mg34$/.test(x.ref.key));
    if (mg) {
      const mv = await recipe.values(ctx, mg), ma = Object.assign(ans({ id: 'mg34_task', mountq: true }), { vehicle: { src: 'exist', value: 'pz4h' } });
      ok(mv.kindq === 'mg' && mv.place === 'mgun' && mv.mountq === false, 'mg34 is a machine gun, place mgun, not mounted unless asked', JSON.stringify([mv.kindq, mv.place, mv.mountq]));
      // pz4h has no place "mgun": the first machine gun place of the vehicle is taken, with a note
      const mc = recipe.compile({}, cc('make', ma, mv)), wo = mc.gen.ops.find(o => o.op === 'weapon');
      ok(wo && wo.weapon === 'mg34_task' && wo.place === 'mgun1' && /pz4h/.test(wo.entity), 'mount: an mg goes on the first mg place of the vehicle', JSON.stringify(wo));
      ok(mc.notes.some(x => /mgun1/.test(x)), 'mount: the place swap is said in a note', JSON.stringify(mc.notes));
      const nm = recipe.compile({}, cc('make', Object.assign(ans({ id: 'mg34_task' }), { vehicle: { src: 'exist', value: 'pz4h' } }), mv));
      ok(!nm.gen.ops.some(o => o.op === 'weapon'), 'mount: a vehicle answer without "put it on a vehicle" mounts nothing', JSON.stringify(nm.gen.ops.map(o => o.op)));
      const mp = await recipe.lookups.mountplace(ctx, '', { in: 'pz4h' });
      ok(mp.map(x => x.id).join(' ') === 'gun mgun1 mgun2' && mp[1].sub === 'mg34', 'mount: the place picker lists the places of pz4h with their weapons', JSON.stringify(mp));
      // tag words: an own word dropped and a new one added on the own tag line by value index
      const tw = recipe.compile({}, cc('change', ans({ tags: mv.tags.filter(w => w !== 'to_hand').concat('nokeep') }), mv)).gen.ops.find(o => o.op === 'set');
      const tr = tw && tw.rows.find(r => /tag/.test(r.path));
      ok(tr && /nokeep/.test(tr.value) && !/(^|[" ])to_hand/.test(tr.value), 'tags: a word added, one dropped (own, or cancelled with -word)', JSON.stringify(tw));
    } else ok(false, 'the weapon lookup finds mg34');
    // the lookup a novice sees: the player name from the .lng, the id beside it; words match the name and the file both
    const lw = await recipe.lookups.weapon(ctx, 'mosin sniper', {});
    ok(lw.length && lw[0].name === 'Mosin sniper' && lw[0].id === 'mosin_s', 'lookup: player name Mosin sniper, id mosin_s', JSON.stringify(lw.slice(0, 2)));
    const lb = await recipe.lookups.breed(ctx, 'rus/at_rifle', {});
    ok(lb.length && lb[0].id === 'rus/at_rifle' && lb[0].name !== lb[0].id, 'lookup: a soldier type shows its player name', JSON.stringify(lb.slice(0, 2)));
    // novice: a rifle, an MG, a tank cannon and an AT gun show the real value of every essential question Quick asks
    const RR = require('../lib/recipe');
    const SAMPLE = [['mosin', /\/rifle\/mosin$/, ['range', 'reload', 'between', 'speed', 'damage', 'health']], ['mg34', /\/mgun\/mg34$/, ['range', 'reload', 'between', 'speed', 'damage', 'health']],
      ['kwk43', /\/gun\/88mm_kwk43$/, ['rangep', 'reload', 'speed', 'damage', 'pen']], ['pak40', /\/gun\/75mm_pak40$/, ['rangep', 'reload', 'speed', 'damage', 'pen']]];
    for (const [w, re, want] of SAMPLE) {
      const it = (await recipe.lookups.weapon(ctx, w, {})).find(x => re.test(x.ref.key));
      if (!it) { ok(false, 'the weapon lookup finds ' + w); continue; }
      const sv = await recipe.values(ctx, it, { verb: 'make' });
      const ess = RR.steps(recipe, { verb: 'make', mode: 'quick', answers: {} }, sv).filter(s => s.kind === 'q' && s.essential).map(s => s.q);
      ok(want.every(k => ess.includes(k) && sv[k] != null && sv[k] !== ''), w + ': every essential number is asked with its current value', JSON.stringify(ess.map(k => k + '=' + sv[k])));
      ok(!ess.some(k => ['special', 'throw', 'mountq', 'giveq'].includes(k)), w + ': Quick asks no aimed shot, throw or carry question', ess.join(' '));
      ok(sv.id !== it.id && /_\d+$/.test(sv.id) && sv.name && sv.name !== it.id, w + ': the id default is a free name, the name default is the player name', JSON.stringify([sv.id, sv.name]));
    }
    // the id question refuses a taken name at the question, not at Review
    const u1 = await recipe.lookups.newweapon(ctx, 'mosin', {}), u2 = await recipe.lookups.newweapon(ctx, v.id, {});
    ok(u1.exact === true && u2.exact === false, 'id: mosin is taken, the suggested ' + v.id + ' is free', JSON.stringify([u1, u2]));
    const idq = recipe.groups.flatMap(g => g.q).find(q => q.id === 'id');
    ok(idq.unique && idq.unique.lookup === 'newweapon', 'id: the question checks the name is free');
    // carriers: written only when the user said yes to "give it to soldiers now"
    const g0 = recipe.compile({}, cc('make', ans({ id: 'mosin_g', carriers: ['rus/rifle'] }), v)), g1 = recipe.compile({}, cc('make', ans({ id: 'mosin_g', giveq: true, carriers: ['rus/rifle'] }), v));
    ok(!g0.gen.ops.some(o => o.op === 'kit') && g1.gen.ops.some(o => o.op === 'kit'), 'carry: soldiers get it only after a yes', JSON.stringify([g0.gen.ops.map(o => o.op), g1.gen.ops.map(o => o.op)]));
    await hazards(recipe, lang, ctx, 'weapon', ok);
  }
  console.log('direct: ' + pass + ' passed, ' + fail + ' failed');
  fails += fail;
  console.log(fails ? 'FAIL gun' : 'PASS gun');
  if (fails) process.exitCode = 1;
})();
