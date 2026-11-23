// recipe "an item" test: node item.test.js <scratch>. The kit checks the recipe, strings, census coverage (+ seeded defect), steps,
// compile and the gen --plan of two drafts on the vanilla F1 hand grenade: a new grenade copied beside it (gen item with throw, fuse and a
// scaled blast + desc + text) and a change of the F1 itself (an override: set rows) given to a soldier type. Then the reader and compile are
// checked directly. Writes only under <scratch>. Author: Imperator_Aug (ARSENAL, recipe-weapon)
// Author: Imperator_Aug (ARSENAL, ia-1c8cc8c8)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const recipe = require('./item.recipe'), lang = require('./item.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-item-')));
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
const F1 = { id: 'f1 grenade', ref: { key: 'resource/set/stuff/grenade/01 grenade_ap/f1.grenade' } };

(async () => {
  let fails = 0;
  const sum = r => { if (r && r.fails) fails += r.fails; };
  sum(await kit.run(recipe, lang, {
    base: F1, verb: 'make',
    answers: { id: 'f1_task', name: 'F1 long fuse', range: 20, fuse: 4, blast_radius: 12, giveq: true, carriers: ['rus/rifle'], count: 2 },
    mod: path.join(scratch, 'mods', 'item_make'),
    planFiles: ['resource/set/stuff/grenade/01 grenade_ap/f1_task.grenade'],
  }, path.join(scratch, 'make')));
  sum(await kit.run(recipe, lang, {
    base: F1, verb: 'change',
    answers: { mass: 0.8, weight: 90, angle: 45 },
    mod: path.join(scratch, 'mods', 'item_change'),
    planFiles: ['resource/set/stuff/grenade/01 grenade_ap/f1.grenade'],
  }, path.join(scratch, 'change')));

  let pass = 0, fail = 0;
  const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('FAIL ' + m + (d ? ': ' + d : '')); } };
  const gdir = kit.findGame({});
  if (!gdir) console.log('SKIP direct checks: no game folder');
  else {
    const ctx = { game: () => gdir, mod: '' };
    const v = await recipe.values(ctx, F1);
    ok(v.range === 17 && v.angle === 40 && v.fuse === 4.5, 'F1: throw range 17, angle 40, fuse 4.5', JSON.stringify(v));
    ok(v._meta.thrown && v._meta.special && v._meta.layers.length === 1 && v.blast_radius === 5, 'F1: thrown, has a fuse, one blast layer 5 m', JSON.stringify(v._meta.layers));
    const ans = a => { const o = {}; for (const [k, x] of Object.entries(a)) o[k] = { src: 'value', value: x }; return o; };
    const cc = (verb, a, values) => ({ verb, gameDir: gdir, mod: path.join(scratch, 'none'), values, answer: id => a[id] || null, value: id => a[id] ? a[id].value : values[id], kept: id => !a[id] });
    const mk = recipe.compile({}, cc('make', ans({ id: 'f1_long', fuse: 6, blast_radius: 10, range: 25 }), v));
    const it = mk.gen.ops.find(o => o.op === 'item');
    ok(it && it.fuse === 6 && it.throw && it.throw.range === 25 && it.blast && it.blast.length === 1 && /\b10\s*$/.test(it.blast[0]), 'make: one item op with fuse, throw range and the blast scaled to 10 m', JSON.stringify(it));
    ok(mk.result === 'f1_long', 'make: the result is the new id', mk.result);
    const same = recipe.compile({}, cc('make', ans({ id: 'f1_long' }), v));
    const it2 = same.gen.ops.find(o => o.op === 'item');
    ok(it2 && it2.fuse == null && it2.blast == null, 'make: kept answers give no fields', JSON.stringify(it2));
    const ch = recipe.compile({}, cc('change', ans({ fuse: 3 }), v));
    const st = ch.gen.ops.find(o => o.op === 'set');
    // F1 inherits {special} from its {from} pattern, so the whole block (inherited children kept) is added with the new PrepareTime
    ok(st && st.rows.some(r => (/PrepareTime$/.test(r.path) && String(r.value) === '3') || (/\/special$/.test(r.path) && /\{PrepareTime 3\}/.test(r.value) && /PrepareCursor/.test(r.value))), 'change: the fuse through a set row', JSON.stringify(ch.gen.ops));
    // advanced questions on make: set rows on the new file
    const mk2 = recipe.compile({}, cc('make', ans({ id: 'f1_adv', aidanger: 3, hold: 'stuff' }), v));
    const s2 = mk2.gen.ops.find(o => o.op === 'set');
    ok(s2 && s2.rows.some(r => /f1_adv/.test(r.entity) && /possibleDamageRadius$/.test(r.path) && r.value === '3'), 'advanced: danger radius is a set row on the new item', JSON.stringify(mk2.gen.ops));
    ok(s2 && s2.rows.some(r => /inventory/.test(r.path) && /stuff/.test(r.value)), 'advanced: how it is carried is a set row', JSON.stringify(s2));
    let threw = null; try { recipe.compile({}, cc('make', ans({ id: 'f1' }), v)); } catch (e) { threw = e.message; }
    ok(threw && /new id/i.test(threw), 'make: the id of the copy is refused', threw);
    // a soldier that has the item: the count is set in place (kit add {item, count}, no del)
    const kc = recipe.compile({}, cc('change', ans({ giveq: true, carriers: ['rus/rifle'], count: 3 }), v)).gen.ops.find(o => o.op === 'kit');
    ok(kc && !kc.del && kc.add.length === 1 && kc.add[0].item === 'grenade f1' && kc.add[0].count === 3, 'kit: rus/rifle has grenade f1, its count becomes 3 in place', JSON.stringify(kc));
    const kr = recipe.compile({}, cc('change', ans({ giveq: true, carriers: ['rus/rifle'] }), v)), kk = kr.gen && kr.gen.ops.find(o => o.op === 'kit');
    ok(!kk, 'kit: a kept count leaves a soldier that has it as it is', JSON.stringify(kk));
    // shaped charge: the own {damage cumulative} block of rpg43 (damage_edit on make, damage[n] rows on change)
    const R43 = { id: 'rpg43 grenade', ref: { key: 'resource/set/stuff/grenade/02 grenade_at/rpg43.grenade' } }, v43 = await recipe.values(ctx, R43);
    ok(v43.cumdmg === 100 && v43.cumdist === 1, 'rpg43: shaped charge 100 mm, 1 m', JSON.stringify([v43.cumdmg, v43.cumdist]));
    const i43 = recipe.compile({}, cc('make', ans({ id: 'rpg99', cumdmg: 120 }), v43)).gen.ops.find(o => o.op === 'item');
    ok(i43 && i43.damage_edit && i43.damage_edit[0].type === 'cumulative' && i43.damage_edit[0].layer === 1 && i43.damage_edit[0].set.damage === 120, 'make: shaped charge through item damage_edit', JSON.stringify(i43));
    const c43 = recipe.compile({}, cc('change', ans({ cumdist: 0.5 }), v43)).gen.ops.find(o => o.op === 'set');
    ok(c43 && c43.rows.some(r => /damage\[0\]\/distance$/.test(r.path) && r.value === '0.5'), 'change: shaped charge through a damage[n] row', JSON.stringify(c43));
    const nf1 = recipe.compile({}, cc('change', ans({ cumdmg: 120 }), v));
    ok(nf1.notes.some(x => /no \{damage cumulative\}/.test(x)), 'F1 has no shaped charge of its own: a note, no row', JSON.stringify(nf1.notes));
    // tag words: the hands word on F1 (inherited, cancelled with -word); dynamite's line of three values is written again whole
    const t1 = recipe.compile({}, cc('change', ans({ taghands: 'itemin2hands' }), v)).gen.ops.find(o => o.op === 'set');
    ok(t1 && t1.rows.some(r => /tag/.test(r.path) && /itemin2hands/.test(r.value) && /-smallitemin1hand/.test(r.value)), 'tags: a new hands word, the inherited one cancelled', JSON.stringify(t1));
    const DY = { id: 'dynamite', ref: { key: 'resource/set/stuff/explosive/dynamite' } }, vd = await recipe.values(ctx, DY);
    const td = recipe.compile({}, cc('change', ans({ tagflags: vd.tagflags.concat('nokeep') }), vd)).gen.ops.find(o => o.op === 'set');
    ok(td && td.rows.length === 1 && /tag\[0\]#\*$/.test(td.rows[0].path) && /"nokeep"/.test(td.rows[0].value) && /"dynamite"/.test(td.rows[0].value), 'tags: a line of several values is set whole by tag[0]#*, one quoted value per word', JSON.stringify(td));
    // one word left on such a line: the whole value list is set (patch-entity path suffix #*), one row
    const t9 = recipe.compile({}, cc('change', ans({ taghands: 'itemin2hands', tagclass: [], tagflags: ['missile', 'throwable'] }), vd)).gen.ops.find(o => o.op === 'set');
    ok(t9 && t9.rows.length === 1 && /tag\[0\]#\*$/.test(t9.rows[0].path) && t9.rows[0].value === '"itemin2hands"', 'tags: one word left on a line of several values: the whole list set by tag[0]#*', JSON.stringify(t9));
    // the lookup a novice sees: the player name from the .lng, the id beside it, words matched against both
    const lk = await recipe.lookups.thing(ctx, 'AT grenade', {});
    ok(lk.some(x => x.name === 'AT grenade RPG-43' && x.id === 'rpg43 grenade'), 'lookup: player name AT grenade RPG-43, id rpg43 grenade', JSON.stringify(lk.slice(0, 3)));
    const lk2 = await recipe.lookups.thing(ctx, 'rpg43', {});
    ok(lk2.length && lk2[0].name === 'AT grenade RPG-43', 'lookup: the file words still find it', JSON.stringify(lk2.slice(0, 2)));
    // blast: dynamite's own two layers, each by its place among the {damage} blocks
    const bd = recipe.compile({}, cc('change', ans({ blast_radius: 9 }), vd)).gen.ops.find(o => o.op === 'set');
    ok(bd && bd.rows.some(r => /damage\[0\]\/area$/.test(r.path)) && bd.rows.some(r => /damage\[1\]\/area$/.test(r.path) && / 9$/.test(r.value)), 'blast: own layers through damage[n] rows', JSON.stringify(bd));
    // novice: the id default is a free name, a taken one is refused at the question; the name default is the player name
    const RR = require('../lib/recipe'), qsOf = (verb, vals, mode) => RR.steps(recipe, { verb, mode, answers: {} }, vals).filter(s => s.kind === 'q').map(s => s.q);
    ok(v.id === 'f1_2' && v._meta.id === 'f1' && v.name === 'AP grenade F1', 'F1: id default f1_2, name default the player name', JSON.stringify([v.id, v.name]));
    const u1 = await recipe.lookups.newitem(ctx, 'f1', {}), u2 = await recipe.lookups.newitem(ctx, 'f1_2', {});
    ok(u1.exact === true && u2.exact === false, 'id: f1 is taken, f1_2 is free', JSON.stringify([u1, u2]));
    ok(recipe.groups.flatMap(g => g.q).find(q => q.id === 'id').unique.lookup === 'newitem', 'id: the question checks the name is free');
    // blast, throw and fuse only where the copy has them
    const MED = { id: 'medkit', ref: { key: 'resource/set/stuff/med/medkit' } }, vm = await recipe.values(ctx, MED, { verb: 'make' });
    const qm = qsOf('make', vm, 'quick'), qf = qsOf('make', await recipe.values(ctx, F1, { verb: 'make' }), 'quick');
    ok(!qm.some(q => /^blast_|^range$|^fuse$/.test(q)), 'medkit: Quick asks no blast, throw or fuse', qm.join(' '));
    ok(['blast_energy', 'blast_radius', 'range', 'fuse'].every(q => qf.includes(q)), 'F1 make: Quick asks the blast, the throw range and the fuse', qf.join(' '));
    ok(!qsOf('change', await recipe.values(ctx, F1, { verb: 'change' })).some(q => /^blast_/.test(q)), 'F1 change: its blast comes from a parent file, so it is not asked');
    // the filling: a choice of plain kinds and an amount, written as one line
    ok(vm.fillkind === 'drug' && vm.fillamt === 500 && qsOf('change', vm).includes('fillkind'), 'medkit: filling drug 500 as a choice and an amount', JSON.stringify([vm.fillkind, vm.fillamt]));
    const fm = recipe.compile({}, cc('change', ans({ fillamt: 800 }), vm)).gen.ops.find(o => o.op === 'set');
    ok(fm && fm.rows.some(r => /filling(\[0\])?$/.test(r.path) && r.value === '"drug" 800'), 'medkit: a new amount writes the filling line', JSON.stringify(fm));
    ok(!qsOf('change', v).includes('fillkind'), 'F1 holds nothing: no filling asked');
    // the fuse help says what is not proven
    ok(/check it in game/.test(lang.find(r => r[0] === 'task.item.h.fuse')[1]), 'fuse: the help says to check it in game');
    // carriers only after a yes
    ok(!qsOf('change', v).includes('carriers') && !qsOf('change', v).includes('count'), 'carry: carriers and count wait for a yes');
    await hazards(recipe, lang, ctx, 'thing', ok);
  }
  console.log('direct: ' + pass + ' passed, ' + fail + ' failed');
  fails += fail;
  console.log(fails ? 'FAIL item' : 'PASS item');
  if (fails) process.exitCode = 1;
})();
