// lib/model game variants test (made-up fixtures only): GoH wind params float4 element in a SUBM declaration (GHFMT-02),
// bump slot order per game (GHFMT-28), numbered roller_NN bones (GHFMT-20), the picture verdict per game for BC5
// (GHFMT-03), the sweeps' --exe option (sweepargs.js) and the as64/core view per exe of sweep-anm.
// Author: Imperator_Aug (ARSENAL, ia-e8e5d18e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ply = require('../ply'), mdl = require('../mdl'), dds = require('../dds'), picture = require('../picture'), SA = require('../sweepargs');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
const i32 = x => { const b = Buffer.alloc(4); b.writeInt32LE(x); return b; };
const u32 = x => { const b = Buffer.alloc(4); b.writeUInt32LE(x >>> 0); return b; };
const f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((x, i) => b.writeFloatLE(x, 4 * i)); return b; };
const str = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);

// 1. a GoH-style SUBM: position f3 + wind params (usage 8, type 3 = float4); 3 vertices, 1 face
{
  const decl = Buffer.from([0x02, 0, 0, 0x83, 0, 0, 0xff, 0xff]);
  const sub = Buffer.concat([Buffer.from('SUBM'), decl, i32(0), i32(1), i32(0), i32(3), u32(0x400), str('tree.mtl')]);
  const verts = Buffer.concat([f32([0, 0, 0, 1, 2, 3, 4]), f32([1, 0, 0, 5, 6, 7, 8]), f32([0, 1, 0, 9, 10, 11, 12])]);
  const vert = Buffer.concat([Buffer.from('VERT'), i32(3), Buffer.from([28, 0, 1, 0]), verts]);
  const indx = Buffer.concat([Buffer.from('INDX'), i32(3), Buffer.from([0, 0, 1, 0, 2, 0])]);
  const buf = Buffer.concat([Buffer.from('EPLY'), sub, vert, indx]);
  const o = ply.parse(buf);
  ok(!o.error, 'wind ply parses: ' + o.error);
  const e = o.vertices && o.vertices.layout.find(x => x.key === 'extra0');
  eq(e && [e.type, e.size, e.comps, e.offset], [3, 16, 4, 12], 'wind params element: float4 at offset 12 (GHFMT-02)');
  eq(o.vertices && Array.from(o.vertices.extra0.slice(4, 8)), [5, 6, 7, 8], 'wind params values of vertex 1');
  ok(ply.write(o).equals(buf), 'wind ply writes back byte-identical');
}

// 2. bump slot order per game (GHFMT-28)
eq(ply.BUMP_SLOTS.as2, ['diffuse', 'bump', 'specular', 'height'], 'AS2 bump slots');
eq(ply.BUMP_SLOTS.goh, ['diffuse', 'lightmap', 'bump', 'specular', 'height'], 'GoH bump slots');
eq([ply.bumpSlot('goh', 1), ply.bumpSlot('as64', 1), ply.bumpSlot('mowas_2', 2), ply.bumpSlot('mowas2', 1), ply.bumpSlot(undefined, 1), ply.bumpSlot('goh', 9)],
  ['lightmap', 'bump', 'specular', 'bump', 'bump', null], 'bumpSlot by game id, vfs exe and default');

// 3. roller bones per game (GHFMT-20)
{
  const text = '{Skeleton\r\n\t{bone "basis"\r\n\t\t{bone "roller"}\r\n\t\t{bone "roller_joint"}\r\n\t\t{bone "roller_01"}\r\n\t\t{bone "roller_01_joint"}\r\n' +
    '\t\t{bone "roller_02"}\r\n\t\t{bone "roller_04"}\r\n\t\t{bone "roller_04_joint"}\r\n\t}\r\n}\r\n';
  const m = mdl.parse(Buffer.from(text, 'latin1'));
  ok(!m.error, 'roller mdl parses');
  eq(mdl.rollers(m, 'as2').map(r => [r.name, !!r.joint]), [['roller', true]], 'AS2: the one roller bone and its joint');
  eq(mdl.rollers(m, 'mowas2').map(r => r.name), ['roller'], 'MoW:AS2 = AS2 rule');
  eq(mdl.rollers(m, 'goh').map(r => [r.name, !!r.joint]), [['roller_01', true], ['roller_02', false]], 'GoH: roller_01, roller_02, stops at the missing 03');
  eq(mdl.rollers(mdl.parse(Buffer.from('{Skeleton {bone "basis"}}')), 'goh'), [], 'no rollers: empty list');
  eq(mdl.rollers(mdl.parse(Buffer.from('{Skeleton {bone "basis" {bone "roller"} {bone "roller_joint"}}}')), 'goh'), [], 'GoH: a plain roller bone is not a GoH roller (GHFMT-20)');
}

// 4. the picture verdict per game for the BC5 forms (GHFMT-03); signed BC5 stays not decoded
const ddsHead = (four, w, h) => { const b = Buffer.alloc(128); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x1007, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); b.writeUInt32LE(1, 28); b.writeUInt32LE(32, 76); b.writeUInt32LE(4, 80); b.write(four, 84, 'latin1'); return b; };
{
  // signed BC5 is not decoded here (lib/test/model-dds-bc5 keeps that refusal); the game verdict below is header-only
  eq(/BC5S is not read/.test(dds.decode(Buffer.concat([ddsHead('BC5S', 4, 4), Buffer.alloc(16)])).error || ''), true, 'BC5S decode: still refused (not read)');
  for (const four of ['ATI2', 'BC5U', 'BC5S']) {
    const b = Buffer.concat([ddsHead(four, 4, 4), Buffer.alloc(16)]);
    const fa = picture.facts('dds', b), fm = picture.facts('dds', b, { game: 'mowas2' }), fg = picture.facts('dds', b, { game: 'goh' });
    eq([fa.game.ok, fa.game.why, fm.game.ok, fg.game.ok], [false, 'format', false, true], four + ': refused for AS64 / MoW:AS2, loads under GoH');
    eq(picture.notes(fg).filter(x => x.code === 'format').length, 0, four + ' under GoH: no format note');
  }
  const odd = Buffer.concat([ddsHead('ATI2', 6, 4), Buffer.alloc(32)]);
  eq(picture.facts('dds', odd, { game: 'goh' }).game.why, 'dxt4', 'GoH BC5 with a side not a multiple of 4: the dxt4 verdict');
  const dxt = Buffer.concat([ddsHead('DXT1', 4, 4), Buffer.alloc(8)]);
  eq([picture.facts('dds', dxt).game.ok, picture.facts('dds', dxt, { game: 'goh' }).game.ok], [true, true], 'DXT1: loads in every game');
  eq(picture.decode('dds', Buffer.concat([ddsHead('ATI2', 4, 4), Buffer.alloc(16)]), { game: 'goh' }).width, 4, 'picture.decode passes the game on');
}

// 5. sweepargs: --exe taken out of the arguments, the game folder per exe, the vfs options
{
  eq(SA.take(['x', '--exe', 'mowas2', '--sample', '5']), { exe: 'mowas_2', args: ['x', '--sample', '5'] }, 'take: mowas2 -> mowas_2, removed from args');
  eq(SA.take(['x']), { exe: undefined, args: ['x'] }, 'take: no --exe');
  let err = null; try { SA.take(['--exe', 'nope']); } catch (e) { err = e; }
  ok(err && err.code === 'BAD_EXE', 'take: a word that names no game throws BAD_EXE');
  for (const s of ['mdl', 'ply', 'vol', 'scene', 'anm']) {
    const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'sweep-' + s + '.js'), '--exe', 'bogus'], { encoding: 'utf8' });
    eq([r.status, r.stderr.trim().split(/\r?\n/).length, /--exe must be/.test(r.stderr)], [2, 1, true], 'sweep-' + s + ' --exe bogus: one line, exit 2');
  }
  const b5 = Buffer.concat([ddsHead('BC5S', 4, 4), Buffer.alloc(16)]);
  eq([picture.facts('dds', b5).format, picture.facts('dds', b5, { game: 'goh' }).format], ['BC5S', 'BC5 signed'], 'BC5S label: fourCC under AS2 (as before), BC5 signed under GoH');
  eq(SA.gameFor('D', 'goh', () => 'F'), 'D', 'gameFor: a folder given wins');
  eq(SA.gameFor(null, 'mowas_2', () => 'F'), 'F', 'gameFor: AS2 games keep the sweep default');
  eq(SA.vfsOpts({ gameDir: 'g' }), { gameDir: 'g' }, 'vfsOpts: no exe, unchanged');
  eq(SA.vfsOpts({ gameDir: 'g' }, 'mowas_2'), { gameDir: 'g', exe: 'mowas_2' }, 'vfsOpts: exe added');
}

// 6. sweep-anm: --exe mowas_2 leaves the as64/ folder out (fixture install with one anm in as64/core and one in resource/)
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-goh-test-'));
  try {
    const anm = Buffer.concat([Buffer.from('EANM'), i32(0x60000), Buffer.from('FRMS'), i32(1), Buffer.from('BMAP'), i32(0)]);
    for (const rel of ['resource/a.anm', 'as64/core/resource/b.anm']) { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, anm); }
    const sw = require('../sweep-anm');
    const lines = [], log0 = console.log;
    const run = args => { lines.length = 0; console.log = s => lines.push(String(s)); try { sw.main(args); } finally { console.log = log0; } return lines[0] || ''; };
    ok(/^2 files/.test(run([root])), 'sweep-anm no exe: both folders: ' + lines[0]);
    ok(/^1 files/.test(run([root, '--exe', 'mowas_2'])), 'sweep-anm --exe mowas_2: no as64/ folder: ' + lines[0]);
    ok(/^2 files/.test(run([root, '--exe', 'as64'])), 'sweep-anm --exe as64: both folders: ' + lines[0]);
  } finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* temp */ } }
}

console.log(`lib/model goh: ${n - fails}/${n} ok`);
if (fails) { console.log('FAIL'); process.exit(1); }
