// EDRUN-3 seeded test, no game. one block per job. node edrun3-test.js
// Author: Imperator_Aug (ARSENAL, ia-dc0b6479)
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const e = require('../edrun.js'), pf = require('../preflight');
const fail = [];
const t = (name, f) => { try { f(); } catch (x) { fail.push(name + ': ' + x.message); } };
const crew = ['mp/rus/tankman'];
const base = { name: 'h', class: 'vehicle', shooter: 't34_0', crew, foe: 'covb_house', static: true };
const lineOf = (m, n) => m.split('\n').find(l => l.includes(`{"${n}" `)) || '';

// old pair list: the mission of a list written before EDRUN-3 is byte-for-byte what the build before it wrote (hash taken from that build)
t('old pair list unchanged', () => {
  const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, 'old-pairs.json'), 'utf8'));
  assert.deepStrictEqual(e.validate(pairs, false), []);
  // SILENT-1F adds only the two NOORDER marker rows per pair: without them the text is still the old build's, byte for byte
  // VOL-5F adds the tick row, the foe-crew mark row, and the hold on shooter + crew with the crew's release: without those it is still the old text
  const m = e.buildMission(pairs, 'rBASE', { speed: 'very_fast', fog: undefined, ratio: undefined }).split(/\r?\n/).filter(l => !/\{"p_[^"]+_(fr|sr|fx)" |\{"ed_tick" /.test(l)).join('\n')
    .replace(/\{"actor_state" \{selector \{tag \S+_[sc]\}\} \{fire_mode hold\}\} /g, '').replace(/\{"actor_state" \{selector \{tag \S+_c\}\} \{fire_mode open\}\} /g, '')
    // KILLPROOF adds the order re-issues ({"delay" {time 120}} + the same actor_fire, 5 times; ORDERRUN: each after a "reorder k" mark): without them it is still the old text
    // VOLHP adds an early re-issue on infantry pairs ({"delay" {time 5}} + "reorder 0" mark, then the first 120 delay reads 115)
    // REVHARNESS adds {drop orders} + a second only_weapon actor_fire to the ground row, and {offset 20} to its waypoint: without them it is still the old text
    .replace(/ \{drop orders\}( \{attack position\})/g, '$1').replace(/ \{"actor_fire" \{selector \{tag \S+_s\}\} \{attack position\} \{waypoint "\d+"\} \{only_weapon \{use 1\}\}\}/g, '').replace(/ \{offset 20\}/g, '')
    // FIX-EDRUN adds a second early re-issue at 15 s ("reorder 0b", delay 10, then the first 120 delay reads 105) and {xform zl 90} on infantry fire-pair men
    .replace(/(\{"actor_fire" [^\n]*?\{time \d+\}\})( (?:\{"delay" \{time (?:120|115|105|5)\}\} (?:\{"con" \{text "EDRUN \S+ \S+ reorder \d+"\}\} )?|\{"delay" \{time 10\}\} \{"con" \{text "EDRUN \S+ \S+ reorder 0b"\}\} )\{"actor_fire" [^\n]*?\{time \d+\}\})+/g, '$1')
    .replace(/(\{Human [^\n]*\n\t\t\{Position [^\n]*)\n\t\t\{xform zl 90\}/g, '$1').replace(/\r?\n/g, '\r\n');
  assert.strictEqual(crypto.createHash('sha1').update(m, 'latin1').digest('hex'), '2629178a8379e7e7c11eeb077efde88c7ca0ebc3');
});

// (1) no {Player} on a static, still on everything else
t('job1: static has no Player', () => {
  const m = e.buildMission([{ ...base, foeCrew: undefined }], 'rX', {});
  const blk = /\{Entity "covb_house" (0x[0-9a-f]+)\n([\s\S]*?)\n\t\}/.exec(m);
  assert.ok(blk, 'house entity written');
  assert.ok(!/Player/.test(blk[2]), 'no Player in the house block: ' + blk[2]);
  assert.ok(/\{Entity "t34_0" 0x[0-9a-f]+\n\t\t\{Position [^}]*\}\n\t\t\{Player 1\}/.test(m), 'shooter keeps Player 1');
  assert.ok(m.includes('{Tags "h_f" ' + blk[1] + '}'), 'static still tagged');
  assert.ok(!/\{Human[^\n]*\n[^}]*\}\n\t\t\{Player 2\}/.test(m), 'no foe crew');
  const r = e.buildMission([{ ...base, rear: true, face: 40 }], 'rX', {});
  assert.ok(!/covb_house[^]*?Player[^]*?\{Tags/.test(/\{Entity "covb_house" [\s\S]*?\n\t\}/.exec(r)[0]), 'rear static: no Player');
  assert.ok(/\{Entity "covb_house"[^\n]*\n\t\t\{Position [^\n]*\n\t\t\{xform zl 40\}\n\t\}/.test(r), 'rear static keeps its heading');
  // foeClass form, and the vehicle foe still gets a Player
  assert.ok(e.isStatic({ foe: 'x', foeClass: 'static' }) && !e.isStatic({ foe: 'x' }) && !e.isStatic({ foe: 'x', foeClass: 'vehicle' }));
  assert.ok(/\{Entity "gaz67b"[^\n]*\n[^\n]*\n\t\t\{Player 2\}/.test(e.buildMission([{ ...base, foe: 'gaz67b', static: undefined, foeCrew: ['mp/ger/rifle'] }], 'rX', {})));
  // a static needs no foeCrew; a vehicle foe still does
  assert.deepStrictEqual(e.validate([{ ...base }], false), []);
  assert.ok(e.validate([{ ...base, static: undefined }], false).some(x => /foeCrew/.test(x)));
  assert.ok(e.validate([{ ...base, foeCrew: ['mp/ger/rifle'] }], false).some(x => /enter:true/.test(x)));
});
// (2) destroyed mark and enter probe
t('job2: destroyed rows and enter probe', () => {
  const m = e.buildMission([base], 'rX', {});
  assert.ok(/\{tag h_f\} \{state dead\}/.test(lineOf(m, 'p_h_k')), 'state dead row');
  assert.ok(/destroyed_components \{masks "\*"\}/.test(lineOf(m, 'p_h_k2')), 'part destroyed row');
  assert.ok(/\{tag h_f\}\} \{count \{op "="\} \{value 0\}\}/.test(lineOf(m, 'p_h_k3')), 'tag gone row');
  for (const n of ['p_h_k', 'p_h_k2', 'p_h_k3']) assert.ok(lineOf(m, n).includes('EDRUN rX h kill') && lineOf(m, n).includes('"p_h"'), n + ' marks kill after the order');
  assert.ok(/\{tag h_f\}\} \{count \{op ">"\} \{value 0\}\}/.test(lineOf(m, 'p_h')) && !/state moveable/.test(lineOf(m, 'p_h')), 'order waits for the tag only');
  assert.ok(!/actor_state" \{selector \{tag h_f\}/.test(m), 'no hold order on a static');
  assert.ok(!lineOf(m, 'p_h_e'), 'no enter row without enter');
  const en = e.buildMission([{ ...base, enter: true, foeCrew: ['mp/ger/rifle', 'mp/ger/rifle'], noorder: true, mark: 'inhabited' }], 'rX', {});
  assert.ok(/\{"board" \{selector \{tag h_fc\}\} \{vehicle \{tag h_f\}\}\}/.test(lineOf(en, 'p_h_arm')), 'foeCrew ordered in');
  assert.ok(/\{tag h_f\} \{state inhabited\}/.test(lineOf(en, 'p_h_e')) && lineOf(en, 'p_h_e').includes('EDRUN rX h entered'), 'entered mark');
  assert.ok(!lineOf(en, 'p_h_k2'), 'an explicit mark replaces the destroyed set');
  assert.ok(/\{tag h_f\} \{state inhabited\}/.test(lineOf(en, 'p_h_k')), 'mark inhabited ends the pair');
  assert.strictEqual((en.match(/\{Human "mp\/ger\/rifle"[^\n]*\n\t\t\{Position [^\n]*\n\t\t\{Player 2\}/g) || []).length, 2, 'enterers are side 2 men');
  assert.ok(e.validate([{ ...base, enter: true }], false).some(x => /foeCrew/.test(x)));
  assert.ok(e.validate([{ ...base, static: undefined, enter: true, foeCrew: ['a/b'] }], false).some(x => /static foe/.test(x)));
  assert.ok(e.validate([{ ...base, static: undefined, mark: 'destroyed', foeCrew: ['a/b'] }], false).some(x => /static/.test(x)));
  assert.deepStrictEqual(e.validate([{ ...base, mark: 'destroyed' }], false), []);
  assert.ok(e.validate([{ ...base, foeRadius: -1 }], false).length);
  // report rows
  const rows = [{ name: 'h' }]; void rows;
});
// (3) shots split
t('job3: mgShots, cannonShots, cannonVisible', () => {
  const pairs = [{ name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew }, { name: 'b', class: 'gun', shooter: 'zis2', crew, foe: 't34_0', foeCrew: crew }];
  // entities: 1 pz6bh, 2 crew, 3 t34_0 (a foe), 4 crew, 5 zis2, 6 crew, 7 t34_0 (b foe), 8 crew
  const L = (id, nm, head, vol) => `BLAST[${head.split('/')[0]}/${head.split('/')[1]}]: ${nm}[${id}]/${vol} (x)\n`;
  const log = [
    ...[1, 2, 3].map(() => L(1, 'pz6bh', '0.2/1-2', 'gun')),          // 3 MG bursts (events counted per busiest volume: one line = one event)
    L(3, 't34_0', '3/3-8', 'body'), L(3, 't34_0', '10/2.5-10', 'turret'), L(3, 't34_0', '0.5/1-3', 'body'),
    L(5, 'zis2', '0.2/1-2.5', 'gun'), L(5, 'zis2', '0.2/1-2.5', 'gun'), L(5, 'zis2', '0.2/1-1.5', 'gun'),
    L(7, 't34_0', '3/3-8', 'body'),
  ].join('');
  const s = e.shotsOf(log, pairs, true).rows;
  // SILENT-1F: every 0.2/ line is a cannon round, r1 1.5, 2.0, 2.5 = muzzle_medium, large, maximum; mgShots stays null
  assert.strictEqual(s.a.shots, 3); assert.strictEqual(s.a.mgShots, null); assert.strictEqual(s.a.cannonShots, 3);
  assert.strictEqual(s.a.cannonVisible, 2, 'two foe blasts of charge >= 3'); assert.strictEqual(s.a.hits, 3);
  assert.deepStrictEqual(s.a.muzzleKinds, { '0.2/1-2': 3 });
  assert.strictEqual(s.b.shots, 3); assert.strictEqual(s.b.cannonShots, 3); assert.strictEqual(s.b.mgShots, null);
  assert.strictEqual(s.b.cannonVisible, 1);
  // blast cvar off: all null, shots unchanged
  const off = e.shotsOf(log, pairs, false).rows.a;
  assert.strictEqual(off.shots, null); assert.strictEqual(off.mgShots, null); assert.strictEqual(off.cannonShots, null); assert.strictEqual(off.cannonVisible, null);
  // foe damaged and no muzzle line: shots null, the split too
  const none = e.shotsOf(L(3, 't34_0', '3/3-8', 'body'), pairs.slice(0, 1), true).rows.a;
  assert.strictEqual(none.shots, null); assert.strictEqual(none.mgShots, null); assert.strictEqual(none.cannonVisible, 1);
});
// (4) marginal
t('job4: marginal warning', () => {
  const minOf = () => ({ min: 191.7, by: 'depression', reach: 100, ground: 191.7, D: 7 });
  const run = d => pf.check([{ name: 'p', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew, dist: d }], e.layout, { minOf, rangeOf: () => ({ unknown: 'x' }) }).p;
  const a = run(200), b = run(240), c = run(150);
  assert.strictEqual(a.status, 'OK'); assert.ok(a.warns.some(w => /marginal/.test(w) && /239\.6/.test(w)), a.warns.join('|'));
  assert.ok(!b.warns.some(w => /marginal/.test(w)), '240 is over 191.7 x 1.25 = 239.6 (SILENT-1F raised 1.15 to 1.25)');
  assert.strictEqual(c.status, 'TOOCLOSE'); assert.ok(!c.warns.some(w => /marginal/.test(w)));
  // noRangeCheck releases a TOOCLOSE hold too (it did not: sdkfz7_2 at 300 held, VOL-N150), with a warning
  const nr = pf.check([{ name: 'p', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew, dist: 150, noRangeCheck: true }], e.layout, { minOf, rangeOf: () => ({ unknown: 'x' }) }).p;
  assert.notStrictEqual(nr.status, 'TOOCLOSE'); assert.ok(nr.warns.some(w => /noRangeCheck skips it too/.test(w)), nr.warns.join('|'));
});
// (5) prepare
t('job5: prepare key', () => {
  const g = { name: 'g', class: 'gun', shooter: 'm1mortar', crew, foe: 'mp/rus/rifle', prepare: 'cannon fire' };
  const m = e.buildMission([g], 'rX', {});
  const ord = lineOf(m, 'p_g');
  assert.ok(/\{fire_mode open\} \{move_mode hold\}\} \{"actor_state" \{selector \{tag g_c\}\} \{fire_mode open\}\} \{"actor_state" \{selector \{tag g_s\}\} \{cannon fire\}\} /.test(ord), ord);
  assert.ok(ord.indexOf('{cannon fire}') < ord.indexOf('"actor_fire"'), 'before the fire order');
  assert.ok(e.buildMission([{ ...g, prepare: 'weapon_prepare on' }], 'rX', {}).includes('{weapon_prepare on}'));
  assert.ok(!e.buildMission([{ ...g, prepare: undefined }], 'rX', {}).includes('cannon fire'));
  assert.ok(e.validate([{ ...g, prepare: 'cannon dance' }], false).some(x => /prepare/.test(x)));
  assert.ok(e.validate([{ ...g, class: 'infantry', prepare: 'cannon fire' }], false).some(x => /prepare/.test(x)));
});
// (6) house as obstacle
t('job6: static is an obstacle', () => {
  const mk = (n, x, y, o) => ({ name: n, class: 'vehicle', shooter: 't34_0', crew, foe: 'gaz67b', foeCrew: crew, x, y, ...o });
  // pair b's static foe stands 40 off pair a's line (a: 100 long, at x -450): the 12 m point test passes it, a house of radius 60 blocks
  const a = mk('a', -450, -900, { dist: 100 });
  const lay = (p) => e.layout(p, 0);
  const near = (p, i) => (p.name === 'a' ? e.layout(p, 0) : e.layout(p, 0));
  void near;
  const house = mk('b', -410, -900, { dist: 100, foe: 'covb_house', foeCrew: undefined, static: true });
  const tree = mk('b', -410, -900, { dist: 100 });
  const blocked = pf.check([a, house], lay, {});
  assert.strictEqual(blocked.a.status, 'BLOCKED', JSON.stringify(blocked.a));
  assert.ok(/b\/f/.test(blocked.a.notes[0]));
  assert.strictEqual(pf.check([a, tree], lay, {}).a.status, 'OK', 'a vehicle foe 40 off the line does not block');
  assert.strictEqual(pf.check([a, { ...house, foeRadius: 10 }], lay, {}).a.status, 'OK', 'foeRadius shrinks it');
  // the height check aims at the wall: minOf gets staticFoe
  let got = null;
  const minOf = (s, f, m, o) => { got = o; return { min: 50, by: 'reach', reach: 10, ground: null, D: 7 }; };
  pf.check([{ ...house, name: 'a' }], lay, { minOf });
  assert.deepStrictEqual(got, { staticFoe: true, foeAim: 60 }, 'FIX-EDRUN: aim at half wall height');
  got = 'unset'; pf.check([mk('a', -450, -900, { dist: 100 })], lay, { minOf });
  assert.strictEqual(got, undefined, 'a vehicle foe: minOf called as before');
});
// (7) --map from a mod, --prep-map, --map-from
t('job7: mod map, prep-map, map-from', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun3-'));
  try {
    const mod = path.join(tmp, 'modx');
    assert.throws(() => e.prepMap(path.join(tmp, 'resource', 'x')), /resource/);
    const d = e.prepMap(mod);
    for (const f of fs.readdirSync(e.FIX)) assert.ok(fs.existsSync(path.join(d, f)), f);
    assert.throws(() => e.prepMap(mod), /exists/);
    // place-entity would rewrite `map`: stand in for it
    fs.writeFileSync(path.join(d, 'map'), 'PLACED');
    const out = path.join(tmp, 'run'); fs.mkdirSync(out);
    const done = e.copyFixture(out, mod);
    assert.strictEqual(fs.readFileSync(path.join(out, 'map'), 'utf8'), 'PLACED');
    assert.ok(done.includes('map (from --map-from)') && !fs.existsSync(path.join(out, 'combat.mi')));
    const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain); e.copyFixture(plain, null);
    assert.ok(fs.readFileSync(path.join(plain, 'map')).length > 6, 'no --map-from: the fixture map');
    assert.throws(() => e.copyFixture(plain, path.join(tmp, 'nomod')), /--map-from/);
    // mappick: a mod's loose map and a mod's own pak, found with a fake game dir
    const mp = require('../mappick'), G = path.join(tmp, 'G');
    const fixMap = path.join(e.FIX);
    const loose = path.join(G, 'mods', 'm1', 'resource/map/multi/zz_one'); fs.mkdirSync(loose, { recursive: true });
    for (const f of ['map', 'map.net']) fs.copyFileSync(path.join(fixMap, f), path.join(loose, f));
    const r1 = mp.load(G, 'zz_one', ['m1']);
    assert.ok(/^mod m1/.test(r1.pak), r1.pak);
    assert.throws(() => mp.load(G, 'zz_one', []), /map refuses/, 'without the mod the map is not there');
    // a pak in the mod
    const pdir = path.join(G, 'mods', 'm2', 'resource'); fs.mkdirSync(pdir, { recursive: true });
    const key = 'map/multi/zz_two/';
    fs.writeFileSync(path.join(pdir, 'm2.pak'), require('../../lib/zipwrite').zip(['map', 'map.net'].map(f => [key + f, fs.readFileSync(path.join(fixMap, f)), true])));
    const r2 = mp.load(G, 'zz_two', ['m2']);
    assert.ok(/^mod m2 m2\.pak/.test(r2.pak), r2.pak);
    assert.strictEqual(r2.clip.length, 4);
    assert.throws(() => mp.load(G, 'zz_two', ['m1']), /map refuses/, 'another mod does not have it');
    // GoH layout: <mod>/resource/map/multi.pak with keys multi/<name>/.. (no map/ prefix)
    const gdir = path.join(G, 'mods', 'm3', 'resource', 'map'); fs.mkdirSync(gdir, { recursive: true });
    fs.writeFileSync(path.join(gdir, 'multi.pak'), require('../../lib/zipwrite').zip(['map', 'map.net'].map(f => ['multi/zz_three/' + f, fs.readFileSync(path.join(fixMap, f)), true])));
    const r3 = mp.load(G, 'zz_three', ['m1', 'm3']);
    assert.ok(/^mod m3 map\/multi\.pak/.test(r3.pak), r3.pak);
    assert.throws(() => mp.load(G, 'zz_nope', ['m3']), /multi\.pak.*try zz_three/, 'refusal names the map pak and its maps');
    fs.mkdirSync(path.join(G, 'mods', 'm3', 'resource/map/multi/zz_three'), { recursive: true });
    for (const f of ['map', 'map.net']) fs.copyFileSync(path.join(fixMap, f), path.join(G, 'mods', 'm3', 'resource/map/multi/zz_three', f));
    assert.strictEqual(mp.load(G, 'zz_three', ['m3']).pak, 'mod m3', 'loose beats the map pak in one mod');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
// (8) no hard-coded game path in the edrun sources and tests
t('job8: no hard-coded paths', () => {
  const bad = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|sh|json)$/.test(f.name) && p !== __filename && !/old-pairs/.test(p) && /[A-Za-z]:[\\/]/.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(path.join(__dirname, '..'), p));
  } };
  walk(path.join(__dirname, '..'));
  assert.deepStrictEqual(bad, []);
});
// MB-R8: a static fire pair is fired at as a position on the foe (attack enemies found no enemy: 0 shots), waypoint 960+i at z 20; probes gone/fallen/parts
t('mbr8: static fire at a position', () => {
  const m = e.buildMission([{ ...base, foeCrew: undefined }], 'rX', {});
  const order = lineOf(m, 'p_h');
  assert.ok(!/attack enemies/.test(order), 'no attack enemies on a static');
  assert.ok(/\{"actor_fire" \{selector \{tag h_s\}\} \{drop orders\} \{attack position\} \{waypoint "960"\}\} \{"actor_fire" \{selector \{tag h_s\}\} \{attack position\} \{waypoint "960"\} \{only_weapon \{use 1\}\}\}/.test(order), 'position order + compass aim');
  // FIX-EDRUN: the aim point is on the near face (foe minus foeRadius 60 + 5 toward the shooter), z half the wall height 60, not the foe centre at z 20
  const L = e.layout({ ...base }, 0), wp = /\{"960" \{position (-?\d+\.\d\d) (-?\d+\.\d\d) (\d+)\} \{radius 20\}\}/.exec(m);
  assert.ok(wp, 'aim waypoint written');
  assert.strictEqual(+wp[1], L.f.x); assert.strictEqual(+wp[2], +(L.f.y - 65).toFixed(2), 'near face, 65 toward the shooter'); assert.strictEqual(+wp[3], 60, 'half wall height');
  for (const k of ['pg', 'pf', 'pp']) assert.ok(lineOf(m, 'p_h_' + k), 'probe row ' + k);
  // a move pair into a static keeps actor_to_waypoint and gets no aim waypoint; a vehicle foe keeps attack enemies
  const mv = e.buildMission([{ ...base, foeCrew: undefined, mark: 'destroyed', move: { dy: 800 } }], 'rX', {});
  assert.ok(/actor_to_waypoint/.test(lineOf(mv, 'p_h')) && !/"960"/.test(mv));
  assert.ok(/attack enemies/.test(lineOf(e.buildMission([{ ...base, foe: 'gaz67b', static: undefined, foeCrew: ['mp/ger/rifle'] }], 'rX', {}), 'p_h')));
});
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('edrun3 ok');
