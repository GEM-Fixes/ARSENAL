// seeded mod: range + include fix in a pak, DLL + Lua + map.net in paks, mod folder never written
// Author: Imperator_Aug (ARSENAL, ia-98ad5f09)
const fs = require('fs'), path = require('path'), cp = require('child_process'), U = require('../upgrade');
const w = process.argv[2]; let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
function zip(files) {
  const lfs = [], cds = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(d.length, 18); lf.writeUInt32LE(d.length, 22); lf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    lfs.push(lf, n, d); cds.push(cd, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cds), e = Buffer.alloc(22), cnt = Object.keys(files).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cnt, 8); e.writeUInt16LE(cnt, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lfs, cd, e]);
}
const m = path.join(w, 'mod'), none = path.join(w, 'none');
fs.mkdirSync(path.join(m, 'resource'), { recursive: true });
fs.writeFileSync(path.join(m, 'mod.info'), '{mod\r\n {name "t"}\r\n {MinGameVersion "3.262.1"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n');
fs.writeFileSync(path.join(m, 'resource/t.pak'), zip({
  'set/stuff/a.def': '{include "/properties/resupply_generic.inc"}\r\n', 'entity/x/x.def': '{x}\r\n',
  'bin/hook.dll': 'MZ', 'script/a.lua': 'x', 'map/m1/map.net': 'n',
}));
const snap = () => fs.statSync(path.join(m, 'resource/t.pak')).mtimeMs + fs.readdirSync(m).join();
const before = snap();
const p = U.plan(m, 'goh', { as2: none, goh: none });
ok(p.from === 'mowas2', 'from read from mod.info: ' + p.from);
ok(p.inv.paks === 1 && p.inv.packed === 5 && p.inv.loose === 1, 'inventory ' + JSON.stringify(p.inv));
ok(p.auto.some(([k]) => k === 'include path rename'), 'include fix inside pak: ' + p.auto.map(x => x[0]));
ok(p.auto.some(([k]) => k === 'mod.info version range'), 'version fix: ' + p.auto.map(x => x[0]) + ' | ' + p.review.map(x => x[0]));
ok(p.cant.some(c => /DLL/.test(c)) && p.cant.some(c => /Lua/.test(c)) && p.cant.some(c => /map\.net/.test(c)), 'cants: ' + p.cant);
ok(p.verdict === 'partial, untested' && /VERDICT partial, untested/.test(U.render(p)), 'verdict never passes without a game');
ok(p.test.some(t => /preload/.test(t)), 'entity asks for a preload sweep');
ok(!U.plan(m, 'as64', { as2: none, goh: none }).cant.some(c => /map\.net/.test(c)), 'map.net is fine inside AS2');
ok(U.detectFrom({ min: '1.067' }) === 'goh' && U.detectFrom({ min: '3.301' }) === 'as64' && U.detectFrom({ min: '3.262' }) === 'mowas2', 'detect');
// counts are totals: static's default cap of 20 per code must not reach the plan
const m2 = path.join(w, 'mod2'); fs.mkdirSync(path.join(m2, 'resource/set'), { recursive: true });
for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(m2, `resource/set/e${i}.def`), Buffer.from([0x7b, 0x78, 0x20, 0xe0, 0x7d, 13, 10]));
const enc = U.plan(m2, 'goh', { from: 'mowas2', as2: none, goh: none }).review.find(([k]) => k === 'MOVE_ENC_CP1251');
ok(enc && enc[1].n === 25, 'count not capped: ' + (enc && enc[1].n));
const js = path.join(__dirname, '../upgrade.js'), run = (...a) => cp.spawnSync(process.execPath, [js, ...a], { encoding: 'utf8' });
{ const a1 = run(m, '--to', 'goh', '--plan', '--as2', none, '--goh', none), a2 = run(m, '--to', 'goh', '--plan', '--as2', none, '--goh', none);   // DET-FIX: same bytes twice, no clock
  ok(a1.status === 0 && a1.stdout.length > 0 && a1.stdout === a2.stdout, 'two --plan runs give the same stdout bytes'); ok(!/\d s$/.test(a1.stdout.split('\n').find(l => /^READ/.test(l)) || ''), 'no seconds in READ by default'); }
const out = path.join(w, 'out'), r = run(m, '--to', 'goh', '--plan', '--as2', none, '--goh', none, '--out', out);
ok(r.status === 0 && fs.existsSync(path.join(out, 'UPGRADE.md')), 'report written: ' + r.stderr);
ok(run(m, '--to', 'goh', '--plan', '--as2', none, '--goh', none, '--out', path.join(m, 'x')).status === 2, 'out inside mod refused');
ok(run(m, '--to', 'goh').status === 2, 'no --plan and no --out refused');
ok(run(m, '--to', 'nope', '--plan').status === 2, 'bad target');
ok(snap() === before, 'mod untouched');
// --- writer
const pak = require('../../lib/pak');
const entries = f => { const es = pak.list(f); es.fd = fs.openSync(f, 'r'); const o = {}; for (const e of es) o[e.name] = pak.read(es, e); fs.closeSync(es.fd); return o; };
const lngT = '{tags\r\n\t{"name" "\u0422\u0430\u043d\u043a"}\r\n\t{"menu"\r\n\t\t{"start" "Go"}\r\n\t}\r\n}\r\n';
const a = path.join(w, 'a'); fs.mkdirSync(path.join(a, 'resource/set'), { recursive: true }); fs.mkdirSync(path.join(a, 'localization'), { recursive: true });
fs.writeFileSync(path.join(a, 'mod.info'), '{mod\r\n\t{name "a"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
fs.writeFileSync(path.join(a, 'localization/#ui.lng'), lngT);
fs.writeFileSync(path.join(a, 'resource/set/ru.def'), Buffer.from([0x7b, 0x78, 0x20, 0x22, 0xf2, 0x22, 0x7d, 13, 10]));   // cp1251 te
fs.mkdirSync(path.join(a, 'resource/entity/-vehicle/v'), { recursive: true }); fs.writeFileSync(path.join(a, 'resource/entity/-vehicle/v/v.def'), '{v}\r\n');   // no fixer: must still show after
const keep = { 'set/keep.def': '{keep}\r\n', 'texture/x.dds': 'DDS raw' };
fs.writeFileSync(path.join(a, 'resource/same.pak'), zip(keep));
fs.writeFileSync(path.join(a, 'resource/t.pak'), zip({ 'set/s.def': '{include "/properties/resupply_generic.inc"}\r\n', 'set/keep2.def': '{k}\r\n', 'map/m1/map.net': 'n' }));
const a0 = fs.readFileSync(path.join(a, 'resource/same.pak')), go = path.join(w, 'togoh');
const rg = run(a, '--to', 'goh', '--out', go, '--as2', none, '--goh', none, '--goh-version', '1.067');
ok(rg.status === 3, 'to goh is partial: ' + rg.status + rg.stderr);
if (rg.status === 3) {
  ok(/min|Min/.test(fs.readFileSync(path.join(go, 'mod.info'), 'latin1')) && /"1\.067"/.test(fs.readFileSync(path.join(go, 'mod.info'), 'latin1')), 'exe version written: ' + fs.readFileSync(path.join(go, 'mod.info'), 'latin1'));
  ok(Buffer.compare(fs.readFileSync(path.join(go, 'resource/same.pak')), a0) === 0, 'unchanged pak copied byte for byte');
  const t = entries(path.join(go, 'resource/t.pak'));
  ok(/"\/properties\/resupply\.inc"/.test(t['set/s.def'].toString()), 'include fixed inside pak: ' + t['set/s.def']);
  ok(t['set/keep2.def'].toString() === '{k}\r\n' && !t['map/m1/map.net'], 'other entries kept, map.net folder not');
  ok(fs.readFileSync(path.join(go, 'resource/set/ru.def')).includes(Buffer.from([0xd1, 0x82])), 'cp1251 to UTF-8');
  ok(!fs.existsSync(path.join(go, 'localization/#ui.lng')), '.lng gone');
  const pot = fs.readFileSync(path.join(go, 'localizations/default/interface/text/ui.pot'), 'utf8');
  ok(/msgctxt "name"\nmsgid "\u0422\u0430\u043d\u043a"/.test(pot) && /msgctxt "menu\/start"\nmsgid "Go"/.test(pot), '.pot keys: ' + pot.slice(-120));
  const md = fs.readFileSync(path.join(go, 'UPGRADE.md'), 'utf8');
  ok(/VERDICT partial, untested/.test(md) && /map\.net/.test(md), 'report says untested and names the block');
  ok(/MOVE_VERSION_RANGE: 1 -> 0/.test(md) || !/MOVE_VERSION_RANGE/.test(md), 'recheck clears the range: ' + md);
  ok(/WARN_MOVE_GOH_VEHICLE_DEF: 1 -> 1/.test(md), 'recheck uses the cross-game rules, what no fixer touched stays: ' + md);
  // and back: every text the same, key for key
  const back = path.join(w, 'back'), rb = run(go, '--to', 'as64', '--from', 'goh', '--out', back, '--as2', none, '--goh', none);
  ok(rb.status === 0 || rb.status === 3, 'to as64: ' + rb.stderr);
  if (rb.status === 0 || rb.status === 3) {
    const LP = require('../lib/lngpot'), k = LP.lngKeys(fs.readFileSync(path.join(back, 'localization/#ui.lng')), '#ui.lng');
    ok(JSON.stringify(k) === JSON.stringify([['name', '\u0422\u0430\u043d\u043a'], ['menu/start', 'Go']]), 'lng round trip: ' + JSON.stringify(k));
    ok(fs.readFileSync(path.join(back, 'resource/set/ru.def')).includes(0xf2), 'UTF-8 back to cp1251');
    ok(/"3\.262"/.test(fs.readFileSync(path.join(back, 'mod.info'), 'latin1')), 'range back in AS2 scale');
  }
}
// a Workshop id goes: vfs mounts the Workshop copy of the same id instead of this folder, and the copy is not that item
const w1 = path.join(w, 'w1'), w1o = path.join(w, 'w1o'); fs.mkdirSync(w1);
fs.writeFileSync(path.join(w1, 'mod.info'), '{mod\r\n\t{name "w"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n\t{FileId "123"}\r\n}\r\n');
const rw = run(w1, '--to', 'as64', '--out', w1o, '--as2', none, '--goh', none);
ok(rw.status === 0 && !/FileId/i.test(fs.readFileSync(path.join(w1o, 'mod.info'), 'latin1')) && /Workshop FileId/.test(rw.stdout), 'FileId dropped and reported: ' + rw.stdout + rw.stderr);
ok(/FileId/.test(fs.readFileSync(path.join(w1, 'mod.info'), 'latin1')), 'source keeps FileId');
// FIX-PORT (COV-BLD covb_t LF mod.info): an LF mod.info is written CRLF in the output, the source keeps its bytes
const lf1 = path.join(w, 'lf1'), lfo = path.join(w, 'lfo'); fs.mkdirSync(lf1);
fs.writeFileSync(path.join(lf1, 'mod.info'), '{mod\n\t{name "l"}\n\t{MinGameVersion "3.262.1"}\n\t{MaxGameVersion "3.262.1"}\n}\n');
const rlf = run(lf1, '--to', 'as64', '--out', lfo, '--as2', none, '--goh', none);
const lfmi = fs.existsSync(path.join(lfo, 'mod.info')) ? fs.readFileSync(path.join(lfo, 'mod.info'), 'latin1') : '';
ok(rlf.status === 0 && /\{name "l"\}\r\n/.test(lfmi) && !/[^\r]\n/.test(lfmi) && /CRLF/.test(rlf.stdout), 'LF mod.info written CRLF and reported: ' + JSON.stringify(lfmi) + rlf.stdout + rlf.stderr);
ok(!/\r/.test(fs.readFileSync(path.join(lf1, 'mod.info'), 'latin1')), 'source mod.info keeps LF');
// batch 4.5: blocks are enforced, verdict is computed, subset, patch, the small fixes
const pack = (f, list) => require('../../lib/zipwrite').writeZip(f, list.map(([n, b]) => [n, Buffer.from(b), true]));
const b1 = path.join(w, 'b1'); fs.mkdirSync(path.join(b1, 'resource'), { recursive: true });
fs.writeFileSync(path.join(b1, 'mod.info'), '{mod\r\n\t{name "b"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
pack(path.join(b1, 'resource', 'game.pak'), [['map/multi/m1/map.net', 'x'], ['map/multi/m1/m1.mi', '{a}\r\n'], ['map/multi/m2/m2.mi', '{a}\r\n'], ['entity/inventory/w/g.def', '(include "my_resupply_generic.inc")\r\n'], ['set/stuff/s.inc', '(include "/x/resupply_generic.inc")\r\n'], ['script/h.dll', 'MZ']]);
const bo = path.join(w, 'b1o'), rx = run(b1, '--to', 'goh', '--out', bo, '--as2', none, '--goh', none, '--goh-version', '1.067.0');
const names = fs.existsSync(path.join(bo, 'resource', 'game.pak')) ? pak.list(path.join(bo, 'resource', 'game.pak')).map(e => e.name) : [];
ok(rx.status === 3, 'blocked means partial: ' + rx.status + rx.stderr);
ok(!names.some(n => /m1\//.test(n)) && names.includes('map/multi/m2/m2.mi'), 'whole folder of a map.net left out, others stay: ' + names);
ok(!names.includes('script/h.dll') && /DLL left out/.test(rx.stdout) && /map left out/.test(rx.stdout), 'DLL left out, both listed: ' + rx.stdout);
const po = pak.list(path.join(bo, 'resource', 'game.pak')); po.fd = fs.openSync(path.join(bo, 'resource', 'game.pak'), 'r');
const rd = n => pak.read(po, po.find(e => e.name === n)).toString('latin1');
ok(/my_resupply_generic\.inc/.test(rd('entity/inventory/w/g.def')), 'a longer name ending the same is not renamed: ' + rd('entity/inventory/w/g.def'));
ok(/\/properties\/resupply\.inc/.test(rd('set/stuff/s.inc')), 'the real name in a folder is renamed: ' + rd('set/stuff/s.inc'));
fs.closeSync(po.fd);
const so = path.join(w, 'b1s'), rs = run(b1, '--to', 'goh', '--out', so, '--only', 'entity/inventory', '--as2', none, '--goh', none, '--goh-version', '1.067.0');
const sn = pak.list(path.join(so, 'resource', 'game.pak')).map(e => e.name);
ok(rs.status === 3 && sn.length === 1 && sn[0] === 'entity/inventory/w/g.def' && fs.existsSync(path.join(so, 'mod.info')) && /outside --only/.test(rs.stdout), '--only keeps that path and mod.info: ' + sn);
const po2 = path.join(w, 'b1d'), rd2 = run(b1, '--to', 'goh', '--out', po2, '--drop', 'map,script,set,entity', '--as2', none, '--goh', none, '--goh-version', '1.067.0');
ok(rd2.status === 3 && !fs.existsSync(path.join(po2, 'resource', 'game.pak')), 'all of a pak left out: no empty pak ' + rd2.status);
const pt = path.join(w, 'pt'); fs.mkdirSync(path.join(pt, 'resource', 'set', 'stuff'), { recursive: true }); fs.writeFileSync(path.join(pt, 'resource', 'set', 'stuff', 's.inc'), 'PATCHED'); fs.writeFileSync(path.join(pt, 'resource', 'new.txt'), 'N'); fs.writeFileSync(path.join(pt, 'mod.info'), 'NOT THIS');
const pto = path.join(w, 'b1p'), rp = run(b1, '--to', 'as64', '--out', pto, '--patch', pt, '--as2', none, '--goh', none);
const pk = pak.list(path.join(pto, 'resource', 'game.pak')); pk.fd = fs.openSync(path.join(pto, 'resource', 'game.pak'), 'r');
ok(pak.read(pk, pk.find(e => e.name === 'set/stuff/s.inc')).toString() === 'PATCHED' && fs.existsSync(path.join(pto, 'resource', 'new.txt')) && !/NOT THIS/.test(fs.readFileSync(path.join(pto, 'mod.info'), 'latin1')), '--patch replaces inside a pak, adds new, leaves mod.info: ' + rp.stdout + rp.stderr);
fs.closeSync(pk.fd);
ok(run(b1, '--to', 'as64', '--plan', '--out', b1, '--as2', none, '--goh', none).status === 2 && !fs.existsSync(path.join(b1, 'UPGRADE.md')), '--plan --out <the mod itself> refused');
ok(run(b1, '--to', 'as64', '--out', path.join(w, 'b1x'), '--patch', path.join(w, 'nope')).status === 2, 'missing --patch refused');
const u1 = path.join(w, 'u1'); fs.mkdirSync(path.join(u1, 'resource'), { recursive: true });
fs.writeFileSync(path.join(u1, 'mod.info'), '{mod\r\n\t{name "u"}\r\n\t{minGameVersion "1.067.0"}\r\n\t{maxGameVersion "1.067.0"}\r\n}\r\n');
fs.writeFileSync(path.join(u1, 'resource', 'b.set'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{a "\u0416"}\n', 'utf8')]));
const u1o = path.join(w, 'u1o'), ru = run(u1, '--to', 'as64', '--out', u1o, '--as2', none, '--goh', none);
const ub = fs.readFileSync(path.join(u1o, 'resource', 'b.set'));
ok(ub[0] === 0x7b && ub.includes(0xc6), 'goh -> AS2: UTF-8 BOM is gone, not a ? byte: ' + ub.slice(0, 8).toString('hex') + ru.stderr);
const l1 = path.join(w, 'l1'); fs.mkdirSync(path.join(l1, 'resource', 'localization'), { recursive: true });
fs.writeFileSync(path.join(l1, 'mod.info'), '{mod\r\n\t{name "l"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
fs.writeFileSync(path.join(l1, 'resource', 'localization', '#x.lng'), '{other {k "v"}}\r\n');
fs.writeFileSync(path.join(l1, 'resource', 'c.set'), Buffer.concat([Buffer.from('caf'), Buffer.from([0xe9]), Buffer.from(' na'), Buffer.from([0xef]), Buffer.from('ve d'), Buffer.from([0xe9]), Buffer.from('j\r\n')]));
const l1o = path.join(w, 'l1o'), rl = run(l1, '--to', 'goh', '--out', l1o, '--as2', none, '--goh', none, '--goh-version', '1.067.0');
ok(/WARN_UPGRADE_LNG_NO_KEYS/.test(rl.stdout) && fs.existsSync(path.join(l1o, 'resource', 'localization', '#x.lng')), '.lng with no keys is kept and warned: ' + rl.stdout + rl.stderr);

// as64 upgrade off a legacy range that fits: nothing changes, the paks stay byte-identical; enhanced is explicit
const c1 = path.join(w, 'c1');
const rc = run(a, '--to', 'as64', '--out', c1, '--as2', none, '--goh', none);
ok(rc.status === 0 && /CHANGED\n {2}nothing/.test(rc.stdout), 'as64 classic changes nothing: ' + rc.stdout + rc.stderr);
const c2 = path.join(w, 'c2'), re = run(a, '--to', 'as64', '--mode', 'enhanced', '--out', c2, '--as2', none, '--goh', none);
const mi2 = re.status === 0 ? fs.readFileSync(path.join(c2, 'mod.info'), 'latin1') : '';
ok(/MinGameVersion "3\.301"/.test(mi2) && !/MaxGameVersion/.test(mi2), 'enhanced min and no max: ' + mi2 + re.stderr);
ok(run(a, '--to', 'as64', '--out', c1, '--as2', none, '--goh', none).status === 2, 'non-empty out refused');
// writeguard (I-6, I-13): another game's resource/ and a GoH dir found by content though --as2/--goh name nothing there; out = a file.
// GoH (owner 2026-11-15): a new folder in <GoH>/mods may be written, a mod ARSENAL did not make only with Advanced on -> the case is such a mod
{ const gB = path.join(w, 'gameB'); fs.mkdirSync(path.join(gB, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gB, 'as64.exe'), '');
  const gh = path.join(w, 'gohB'); fs.mkdirSync(path.join(gh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(gh, 'binaries', 'x64', 'call_to_arms.exe'), ''); fs.mkdirSync(path.join(gh, 'mods', 'theirs'), { recursive: true }); fs.writeFileSync(path.join(gh, 'mods', 'theirs', 'mod.info'), '{mod}');
  const f = path.join(w, 'afile.txt'); fs.writeFileSync(f, 'x');
  for (const [o, re] of [[path.join(gB, 'resource', 'up'), /game folder/], [path.join(gh, 'mods', 'theirs', 'up'), /Gates of Hell mod that ARSENAL did not make/], [f, /is a file, not a folder/]]) {
    const r = run(a, '--to', 'as64', '--out', o, '--as2', none, '--goh', none);
    ok(r.status === 2 && re.test(r.stderr) && !/ENOTDIR|at .*.js:d+/.test(r.stderr) && !fs.existsSync(path.join(gh, 'mods', 'theirs', 'up')) && !fs.existsSync(path.join(gB, 'resource', 'up')), 'out ' + o + ' refused plainly: ' + r.stderr.slice(0, 300));
  }
}
process.exit(bad ? 1 : 0);
