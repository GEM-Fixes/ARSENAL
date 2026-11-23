// recipe "item" games test: node item.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, a grenade with its own
// {mass} and {inventory}, a pattern, a dynamite that copies the pattern, a breed): goh is in games with no na; the lookups list the GoH
// items (no pattern) and soldiers as army/period/name; values read mass, size and weight; a make copies the file beside the like under
// the new name (bytes and CRLF kept, numbers edited in place), a weight on a file with no inventory block of its own adds one, the
// carriers go to the item route (a fresh item: the dry run names the breed files only); change copies the item over; the AS2 only
// questions are hidden on GoH; no GoH folder and a taken id refuse; the write puts the new item into the mod.
// Author: Imperator_Aug (ARSENAL, ia-goh-item)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-item-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./item.recipe'), L = require('./item.lang'), IG = require('./item.goh');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const ST = 'resource/set/stuff/', GREN = ST + 'grenade/anti-tank grenade/zzg.grenade', DYN = ST + 'explosive/zzdyn_x3';
const GTXT = '{grenade\r\n\t{tag "dropboxed"}\r\n\t{mass 1.2}\r\n\t{inventory\r\n\t\t{size 1 1}\r\n\t\t{weight 120}\r\n\t}\r\n\t{entity "zzg"}\r\n}\r\n';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'item_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(GREN, GTXT);
  G(ST + 'explosive/explosive.pattern', '{item\r\n\t{inventory {size 2 1} {weight 300} {fsm "belt"}}\r\n\t{mass 2}\r\n}\r\n');
  G(DYN, '{from "pattern explosive"\r\n\t{entity "zzdyn"}\r\n}\r\n');
  G('resource/set/breed/mp/ger/early/zzrifle.set', '{breed\r\n\t{inventory\r\n\t\t{item "zzg grenade" 1}\r\n\t}\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
  const mk = (answers, verb, base) => {
    const d = D.newId('item');
    return D.save(ctx, { id: d, recipe: 'item', verb: verb || 'make', game: 'goh', mod, base: { id: base || GREN, ref: { key: base || GREN } }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { item: R });

  await t('games: goh in, no na; the GoH rows in four languages without dashes; AS2 only questions carry $game', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.item.na.goh'));
    for (const k of ['task.item.q.carriers_goh', 'task.item.h.carriers_goh', 'task.item.e.nogoh']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
    const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
    for (const id of ['name', 'model', 'blast_energy', 'range', 'carriers', 'taghands']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
    for (const id of ['id', 'mass', 'isize', 'weight', 'giveq', 'count']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
    assert.deepEqual(Q.carriers_goh.when.$game, ['goh']);
  });
  await t('lookups: GoH items without patterns, soldiers as army/period/name, a taken id', async () => {
    const th = await R.lookups.thing(lc, 'zz', { game: 'goh', mod });
    assert.deepEqual(th.map(x => x.id).sort(), [DYN, GREN]);
    const br = await R.lookups.breed(lc, '', { game: 'goh', mod });
    assert.deepEqual(br.map(x => x.id), ['ger/early/zzrifle']);
    const nw = await R.lookups.newitem(lc, 'zzg', { game: 'goh', mod });
    assert.equal(nw.length, 1);
  });
  await t('values: own mass, size and weight; a copy of a pattern takes the inherited size and weight', async () => {
    const a = await R.values(lc, { id: GREN, ref: { key: GREN } }, { game: 'goh', verb: 'make' });
    assert.equal(a.mass, 1.2); assert.equal(a.isize, '1 1'); assert.equal(a.weight, 120); assert.equal(a.id, 'zzg_2'); assert.equal(a._meta.item, 'zzg grenade');
    const b = await R.values(lc, { id: DYN, ref: { key: DYN } }, { game: 'goh', verb: 'change' });
    assert.equal(b.isize, '2 1'); assert.equal(b.weight, 300); assert.ok(!('mass' in b)); assert.equal(b.f_mass, false);
  });
  let makeD;
  await t('make: the copy beside the like, numbers edited in place, CRLF kept; the carriers go to the item route', async () => {
    makeD = mk({ id: v('zzg_new'), mass: v(1.5), weight: v(90), giveq: v(true), carriers_goh: { src: 'list', items: [{ src: 'exist', value: 'ger/early/zzrifle' }] }, count: v(2) });
    const r = await run(makeD);
    assert.ok(!r.gen, 'no gen op');
    assert.equal(r.copies.length, 1); assert.equal(r.copies[0].to, ST + 'grenade/anti-tank grenade/zzg_new.grenade');
    const txt = fs.readFileSync(path.join(D.stageDir(ctx, makeD.id), ...r.copies[0].staged.split('/')), 'latin1');
    assert.equal(txt, GTXT.replace('{mass 1.2}', '{mass 1.5}').replace('{weight 120}', '{weight 90}'));
    assert.equal(r.calls.length, 1);
    assert.deepEqual(r.calls[0].body, { item: 'zzg_new grenade', count: 2, breeds: ['ger/early/zzrifle'], fresh: true });
    assert.equal(r.result, 'zzg_new');
  });
  await t('the item route: a fresh item at Preview names the breed files only', async () => {
    const out = await IG.giveRoute(null, { mod, item: 'zzg_new grenade', count: 2, breeds: ['ger/early/zzrifle'], fresh: true }, Object.assign({}, lc, { gohDir: () => g }));
    assert.deepEqual(out.files, ['resource/set/breed/mp/ger/early/zzrifle.set']);
    await assert.rejects(() => IG.giveRoute(null, { mod, item: 'x', breeds: ['ger/zzrifle'], fresh: true }, lc), /army\/period\/name/);
  });
  await t('change: a copy of a pattern with no inventory block of its own gets one naming the weight; mass added at the top', async () => {
    const d = mk({ weight: v(250), mass: v(3) }, 'change', DYN), r = await run(d);
    assert.equal(r.copies[0].to, DYN);
    const txt = fs.readFileSync(path.join(D.stageDir(ctx, d.id), ...r.copies[0].staged.split('/')), 'latin1');
    assert.equal(txt, '{from "pattern explosive"\r\n\t{inventory {weight 250}}\r\n\t{mass 3}\r\n\t{entity "zzdyn"}\r\n}\r\n');
    assert.ok(r.notes.some(x => /inventory block from pattern explosive/.test(x)), r.notes.join('|'));
  });
  await t('editText: in place edits, a block added after the root line', () => {
    const a = IG.editText('{from "pattern explosive"\r\n\t{entity "x"}\r\n}\r\n', { mass: 3, size: null, weight: 250 }, 'pattern explosive');
    assert.equal(a.text, '{from "pattern explosive"\r\n\t{inventory {weight 250}}\r\n\t{mass 3}\r\n\t{entity "x"}\r\n}\r\n');
    const b = IG.editText('{item\r\n\t{inventory {size 2 1}}\r\n}\r\n', { mass: null, size: '1 1', weight: 5 });
    assert.equal(b.text, '{item\r\n\t{inventory {size 1 1} {weight 5}}\r\n}\r\n');
  });
  await t('refusals: a taken id, the like id, no GoH folder', async () => {
    await assert.rejects(() => run(mk({ id: v('zzdyn_x3') })), /already an item named zzdyn_x3/);
    await assert.rejects(() => run(mk({ id: v('zzg') })), /id of the item you copy/);
    const c0 = kit.ctxFor(scratch, { game: 'goh', gohDir: null });
    let e = null; try { IG.compile({}, { values: {}, gameDir: null }); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.item.e.nogoh'); void c0;
  });
  await t('write: the new item goes into the mod (CRLF), the game file stays', async () => {
    const d = mk({ id: v('zzg_w'), mass: v(1.4) });
    const r = await CP.write(ctx, d, { item: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const f = path.join(mod, ...(ST + 'grenade/anti-tank grenade/zzg_w.grenade').split('/'));
    const txt = fs.readFileSync(f, 'latin1');
    assert.ok(/\{mass 1\.4\}/.test(txt) && !/(^|[^\r])\n/.test(txt), txt);
    assert.equal(fs.readFileSync(path.join(g, ...GREN.split('/')), 'latin1'), GTXT);
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
