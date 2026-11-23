// --exe and the GoH branch (game parity). Made-up fixture in a temp folder:
//   G = an AS2 install with as64.exe + mowas_2.exe; the def "coreonly" exists only in as64/core (AS64 sees it, MoW:AS2 does not)
//   H = a GoH install: map inside resource/map/multi.pak (keyed at its folder, GoH layout), uid above 0xffff (GHMAP-26: 32-bit uids),
//       a .mi in the map folder, the def in a resource/entity/ sub-pak; mod folder inside the install refused, outside written
// Author: Imperator_Aug (ARSENAL, ia-d79dd02b)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { writeZip } = require('../../lib/zipwrite');
const tool = path.join(__dirname, '..', 'place-entity.js');
const W = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'place-entity-exe-'));   // a fresh folder under the scratch root
const put = (rel, lines) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + '\n' + out); } };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const MAP = ['{map', '\t{Clips', '\t\t{"[auto]"', '\t\t\t{world -1000 -1000 1000 1000}', '\t\t}', '\t}', '\t{Entity "box" 0x2', '\t\t{Position 10 10}', '\t}', '}'];
try {
  put('G/as64.exe', ['MZ']); put('G/mowas_2.exe', ['MZ']);
  put('G/resource/map/multi/tm/map', MAP);
  put('G/resource/entity/props/box/box.def', ['{game_entity', '\t{Extension "box.mdl"}', '}']);
  put('G/resource/entity/props/box/box.mdl', ['{model}']);
  put('G/as64/core/resource/entity/props/coreonly/coreonly.def', ['{game_entity', '\t{Extension "/entity/props/box/box.mdl"}', '}']);
  const G = path.join(W, 'G'), M = path.join(G, 'mods', 'pm');
  fs.mkdirSync(M, { recursive: true });
  let r = run(M, '--game', G, '--no-cache', '--map', 'multi/tm', '--entity', 'coreonly', '--pos', '1,2', '--dry-run');
  ok(r.code === 0 && /would write resource\/map\/multi\/tm\/map \(new\) uid 0x3/.test(r.out), 'no --exe: as64/core def found, as before', r.out);
  r = run(M, '--game', G, '--no-cache', '--exe', 'mowas_2', '--map', 'multi/tm', '--entity', 'coreonly', '--pos', '1,2', '--dry-run');
  ok(r.code === 1 && /PLACE_ENTITY_UNKNOWN/.test(r.out), '--exe mowas_2: no as64/core, the core-only def is unknown', r.out);
  r = run(M, '--game', G, '--no-cache', '--exe', 'mowas2', '--map', 'multi/tm', '--entity', 'box', '--pos', '1,2', '--dry-run');
  ok(r.code === 0 && /uid 0x3/.test(r.out), '--exe mowas2 (GUI id): base def placed', r.out);

  put('H/binaries/x64/call_to_arms.exe', ['MZ']);
  fs.mkdirSync(path.join(W, 'H/resource/map'), { recursive: true });
  const gmap = MAP.slice(0, -1).concat(['\t{Entity "box" 0x14002', '\t\t{Position 20 20}', '\t}', '}']).join('\r\n') + '\r\n';
  writeZip(path.join(W, 'H/resource/map/multi.pak'), [['multi/t1/map', Buffer.from(gmap, 'latin1'), true],
    ['multi/t1/a.mi', Buffer.from('{mission\r\n\t{Entity "box" 0x14003\r\n\t\t{Position 1 1}\r\n\t}\r\n}\r\n', 'latin1'), true]]);
  fs.mkdirSync(path.join(W, 'H/resource/entity'), { recursive: true });
  writeZip(path.join(W, 'H/resource/entity/props.pak'), [['props/box/box.def', Buffer.from('{game_entity\r\n\t{Extension "box.mdl"}\r\n}\r\n', 'latin1'), true]]);
  const H = path.join(W, 'H');
  const inside = path.join(H, 'mods', 'gm'); fs.mkdirSync(inside, { recursive: true });
  r = run(inside, '--game', H, '--exe', 'goh', '--map', 'multi/t1', '--entity', 'box', '--pos', '5,6');
  ok(r.code === 2 && r.out.trim().split(/\r?\n/).length === 1 && /Gates of Hell/.test(r.out) && !fs.existsSync(path.join(inside, 'resource')), 'GoH, mod folder inside the install: writeguard refusal, nothing written', r.out);
  const out = path.join(W, 'gohmods', 'gm'); fs.mkdirSync(out, { recursive: true });
  r = run(out, '--game', H, '--exe', 'goh', '--map', 'multi/t1', '--entity', 'box', '--pos', '5,6', '--dir', '45');
  const f = path.join(out, 'resource', 'map', 'multi', 't1', 'map'), txt = fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : '';
  ok(r.code === 0 && /uid 0x14004/.test(r.out) && txt.includes('{Entity "box" 0x14004\r\n\t\t{Position 5 6}\r\n\t\t{xform zl 45}\r\n\t}') && txt.includes('0x14002'),
    'GoH: map from resource/map/multi.pak, def from a sub-pak, 32-bit uid 0x14004 (map max 0x14002, 0x14003 used by the .mi)', r.out);
  // GoH write goes through lib/modwrite: a restore point first (beside the mod: <mod>.arsenal-undo), the vanilla bytes kept around the block
  const undo = out + '.arsenal-undo', pts = () => (fs.existsSync(undo) ? fs.readdirSync(undo).sort() : []).map(d => JSON.parse(fs.readFileSync(path.join(undo, d, 'restore-point.json'), 'utf8')));
  ok(/read back: in place; restore point /.test(r.out) && pts().length === 1 && pts()[0].existed === false && pts()[0].rel === 'resource/map/multi/t1/map', 'GoH write: restore point first (new file: existed false), read back said', r.out + JSON.stringify(pts()));
  ok(txt.replace('\t{Entity "box" 0x14004\r\n\t\t{Position 5 6}\r\n\t\t{xform zl 45}\r\n\t}\r\n', '') === gmap, 'GoH write: the rest of the vanilla bytes and CRLF kept', txt);
  r = run(out, '--game', H, '--map', 'multi/t1', '--entity', 'box', '--pos', '7,8', '--dry-run');
  ok(r.code === 0 && /uid 0x14005/.test(r.out), 'GoH found from the folder (no --exe); the mod copy is the effective map now (next uid 0x14005)', r.out);
  // second real write on the mod copy: fixed height, --dir 0 writes no xform (no vanilla GoH map has "zl 0"); restore point keeps the old copy
  r = run(out, '--game', H, '--exe', 'goh', '--map', 'multi/t1', '--entity', 'box', '--pos', '7,8,1.5', '--dir', '0');
  const txt2 = fs.readFileSync(f, 'latin1');
  ok(r.code === 0 && txt2 === txt.replace('\t{Entity "box" 0x14004\r\n\t\t{Position 5 6}\r\n\t\t{xform zl 45}\r\n\t}\r\n', '$&\t{Entity "box" 0x14005\r\n\t\t{Position 7 8 1.5}\r\n\t}\r\n'),
    'GoH second write: 0x14005 at 7,8,1.5 after the first, no {xform} for zl 0, nothing else changed', r.out + txt2);
  const p2 = pts();
  ok(p2.length === 2 && p2[1].existed === true && fs.readFileSync(path.join(undo, p2[1].id, 'files', 'resource', 'map', 'multi', 't1', 'map'), 'latin1') === txt, 'GoH second write: the restore point holds the copy as it was', JSON.stringify(p2));
  // AS2 --dir 0 keeps writing zl 0 as before
  r = run(M, '--game', G, '--no-cache', '--exe', 'mowas2', '--map', 'multi/tm', '--entity', 'box', '--pos', '1,2', '--dir', '0');
  ok(r.code === 0 && fs.readFileSync(path.join(M, 'resource/map/multi/tm/map'), 'latin1').includes('{Position 1 2}\r\n\t\t{xform zl 0}') && !fs.existsSync(M + '.arsenal-undo'), 'AS2 write as before (zl 0 written, plain write)', r.out);
  // read back catches: a moved entity, a changed byte elsewhere, bare LF in a CRLF map
  const { readBack, placeGoh } = require('../place-entity.js');
  const p = { mp: 'multi/t1', uid: 0x14005, entity: 'box', pos: [7, 8, 1.5], before: Buffer.from(txt, 'latin1') };
  ok(readBack(p, Buffer.from(txt2, 'latin1')) === '', 'readBack: the real write passes', readBack(p, Buffer.from(txt2, 'latin1')));
  ok(/reads back at 7,9,1.5/.test(readBack(p, Buffer.from(txt2.replace('{Position 7 8 1.5}', '{Position 7 9 1.5}'), 'latin1'))), 'readBack: a moved entity is caught', '');
  ok(/other bytes/.test(readBack(p, Buffer.from(txt2.replace('{Position 10 10}', '{Position 10 11}'), 'latin1'))), 'readBack: a changed byte elsewhere is caught', '');
  ok(/bare LF/.test(readBack(p, Buffer.from(txt2.replace('0x14005\r\n', '0x14005\n'), 'latin1'))), 'readBack: a bare LF block in a CRLF map is caught', '');
  ok(/found 0 times/.test(readBack(Object.assign({}, p, { uid: 0x14009 }), Buffer.from(txt2, 'latin1'))), 'readBack: a missing uid is caught', '');
  // in process (the guided map task's call): dry = plan only; write = file + restore point
  const out2 = path.join(W, 'gohmods', 'gm2'); fs.mkdirSync(out2, { recursive: true });
  const d = placeGoh({ mod: out2, gameDir: H, map: 'multi/t1', entity: 'box', pos: '40,60', dir: '90', dry: true });
  ok(!d.blocked && !d.written && d.plan[0].uid === 0x14004 && !fs.existsSync(path.join(out2, 'resource')), 'placeGoh dry: plan, nothing written', JSON.stringify(d.rep.counts));
  const w = placeGoh({ mod: out2, gameDir: H, map: 'multi/t1', entity: 'box', pos: '40,60', dir: '90' });
  ok(!w.blocked && w.written && w.written[0].uid === 0x14004 && /\{Entity "box" 0x14004\r\n\t\t\{Position 40 60\}\r\n\t\t\{xform zl 90\}/.test(fs.readFileSync(path.join(out2, 'resource/map/multi/t1/map'), 'latin1')) && fs.existsSync(path.join(undo.replace(/gm\.arsenal-undo$/, 'gm2.arsenal-undo'), w.written[0].restore)),
    'placeGoh write: in the mod copy, restore point made', JSON.stringify(w.written));
  r = run(out, '--game', H, '--exe', 'goh', '--map', 'multi/t1', '--entity', 'nosuch', '--pos', '7,8', '--dry-run');
  ok(r.code === 1 && /PLACE_ENTITY_UNKNOWN/.test(r.out), 'GoH: unknown def', r.out);
  // the milint run before/after placement gets the game (wave 3): no game named = the AS64 argument list as before
  const { milintArgs } = require('../place-entity.js');
  ok(milintArgs('d', 'g').slice(1).join(' ') === 'd --game g -q', 'milint args with no game: as before', milintArgs('d', 'g').join(' '));
  ok(milintArgs('d', 'g', 'mowas_2').slice(1).join(' ') === 'd --game g -q --exe mowas_2', 'milint args under MoW:AS2: --exe mowas_2', '');
  ok(milintArgs('d', 'g', 'goh').slice(1).join(' ') === 'd --game g -q --exe goh', 'milint args under GoH: --exe goh', '');
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
