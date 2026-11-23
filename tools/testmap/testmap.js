// testmap: writes a small flat multiplayer map, so a test match loads fast and every step sits close together
//   node tools/testmap/testmap.js --out <modDir> [--name pv_tiny] [--size 250] [--gap 70]
//   const { build } = require('tools/testmap/testmap.js'); build({ name, size, gap }) -> { dir, files: { name: Buffer } }
// size = terrain side in metres, gap = metres between the two teams' spawn points. formats:
// map.net = , map.ply = + . no game files are read or copied
//   --exe as64|mowas_2|mowas2|goh: as64 and mowas_2 write the same map (same files as with no --exe). goh prints one "not available"
//   line and exits 2: GoH has no set/environment/multi/multi_01, no combat mode (its modes are battle_zones, ammunition,
//   campaign_capture_the_flag, evacuation, frontlines, each with zone helpers and its own <mode>.info) and no texture/land/grass;
//   which mode and textures boot is settled only by one GoH boot of pv_tiny [T]. map.net v2 with cell 10 is in GoH use (17 maps) [V]
// Author: Imperator_Aug (ARSENAL, ia-623a7f5a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const UNITS = 20, CELL = 10, QUAD = 100, TEX = 300; // units per metre, heightmap cell, mesh quad, units per texture repeat
const tag = s => Buffer.from(s, 'latin1');
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
const f32 = list => { const b = Buffer.alloc(list.length * 4); list.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };

function names(list) {
  const out = [Buffer.from([list.length])];
  list.forEach(([i, s]) => out.push(Buffer.from([i, s.length]), tag(s)));
  return Buffer.concat(out);
}
function net(half) {
  const n = half * 2 / CELL, head = Buffer.alloc(14);
  head.writeUInt8(CELL, 0); head.writeUInt8(2, 1); head.writeInt16LE(n, 2); head.writeInt16LE(n, 4);
  head.writeFloatLE(half, 6); head.writeFloatLE(half, 10);
  const cells = Buffer.alloc(n * n * 4);
  for (let i = 2; i < cells.length; i += 4) { cells[i] = 1; cells[i + 1] = 1; } // height 0, type 1, material 1
  return Buffer.concat([head, tag('MAP0'), names([[1, 'ground']]), tag('MAP1'), names([[1, 'ground']]), tag('GRID'), cells]);
}
// vertex declaration and part flags as the map editor saves them: position, normal, colour, 3-part texcoord
const DECL = Buffer.from('02000012000026000031' + '0000ffff', 'hex');
const PART_FLAGS = 0x1404;
function ply(half) {
  const n = Math.round(half * 2 / QUAD), vc = (n + 1) * (n + 1), faces = n * n * 2;
  const vert = Buffer.alloc(vc * 36);
  let p = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -half + i * QUAD, y = -half + j * QUAD;
    vert.writeFloatLE(x, p); vert.writeFloatLE(y, p + 4); vert.writeFloatLE(0, p + 8);
    vert.writeFloatLE(0, p + 12); vert.writeFloatLE(0, p + 16); vert.writeFloatLE(1, p + 20);
    vert.writeUInt32LE(0x007d7d7d, p + 24);
    vert.writeFloatLE(x / TEX, p + 28); vert.writeFloatLE(y / TEX, p + 32);
    p += 36;
  }
  const ind = Buffer.alloc(faces * 12);
  p = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    for (const v of [a, c, b, b, c, d]) { ind.writeUInt32LE(v, p); p += 4; } // clockwise from above, as stock
  }
  const name = tag('mtl0.mtl');
  return Buffer.concat([
    tag('BPLY'), tag('BNDS'), f32([-half, -half, -1, half, half, 1]),
    tag('SUBM'), DECL, i32(0), i32(faces), i32(0), i32(0), i32(PART_FLAGS), Buffer.from([name.length]), name,
    tag('BAS2'), f32([0, 0, 60, 0, 0, 60, 0, 0, 60 / TEX, 0, 0, 60 / TEX]),
    tag('VERT'), i32(vc), i32(36), vert,
    tag('IND4'), i32(faces * 3), ind,
  ]);
}
// exactly 2 layers: reads layers[1] unchecked, one layer crashes on the first crater
const LAYER = `	{layer bump
		{diffuse "/texture/land/grass/gramma_8"}
		{bump "/texture/land/grass/gramma_8_nm"}
		{color 0xffffffff}
		{parallax_scale 0}
	}
`;
const MTL = `{material\n${LAYER}${LAYER}}\n`;
function mapFile(half) {
  const w = half - 500, c = half - 700;
  return `{map
	{Land
		{Position 0 0}
		{TexMod ""}
	}
	{Clips
		{"[auto]"
			{world ${-w} ${-w} ${w} ${w}}
			{camera ${-c} ${-c} ${c} ${c}}
			{pather ${-c} ${-c} ${c} ${c}}
			{distance 200 800}
			{viewAngle 20 50}
		}
	}
}
`;
}
function point(id, name, team, order, x, y, z) {
  return `	{Entity "map_point" 0x${id.toString(16)}
		{Position ${x} ${y}}
		{xform zl ${z}}
		{Extender "map_point"
			{name ${name}}
			{team ${team}}
			{phase 0}
			{order ${order}}
			{visor SpawnPoint}
		}
		{Player 0}
		{MID ${id - 0x8000}}
	}
`;
}
function mission(gap) {
  const y = gap * UNITS / 2, row = '\t\t\t' + Array(17).fill(1).join(' ').replace(/^1/, '0');
  const dip = ['\t\t\t1 ' + Array(16).fill(0).join(' '), ...Array(16).fill(row)].join('\n');
  return `{mission
${[1, 2].map(k => point(0x8000 + k, 'a' + k, 'a', k, (k - 1) * 200, y, -90) + point(0x8004 + k, 'b' + k, 'b', k, (k - 1) * 200, -y, 90)).join('')}	{Environment "multi/multi_01"}
	{Helpers
		{reinforcements
			{scoreTotal 0}
			{scoreCurrent 0}
		}
		{triggers
		}
	}
	{Players
		{count 17}
		{diplomacy
${dip}
		}
	}
	{Fog 1}
	{EntityManager {Enabled}
		{CountScale "x0.5"}
	}
}
`;
}
function build(o = {}) {
  const name = o.name || 'pv_tiny', size = +(o.size || 250), gap = +(o.gap || 70);
  const half = Math.round(size * UNITS / 2 / QUAD) * QUAD;
  if (half < 1000) throw new Error('size must be at least 100 m');
  if (gap * UNITS / 2 > half - 900) throw new Error('gap puts a spawn point outside the playable area');
  return {
    dir: 'multi/' + name, mode: 'combat',
    files: {
      'map.net': net(half), 'map.ply': ply(half), 'mtl0.mtl': crlf(MTL), map: crlf(mapFile(half)),
      'map.info': crlf(';SDL\n{game\n  {maxPlayers 4}\n  {texMod 2}\n}\n'), 'combat.mi': crlf(mission(gap)),
    },
  };
}
function write(modDir, m) {
  const d = path.join(modDir, 'resource/map', m.dir);
  fs.mkdirSync(d, { recursive: true });
  for (const [f, b] of Object.entries(m.files)) fs.writeFileSync(path.join(d, f), b);
  return d;
}
const NOT_FOR = {
  goh: ['the map names Environment multi/multi_01, a combat .mi and texture/land/grass/gramma_8, none of which GoH has; a GoH form needs a GoH mode (zones, <mode>.info), environment and ground texture, settled by one GoH boot of pv_tiny',
    'plan/reports/game-parity/t-run-b.md'],
};
// --exe check before anything is written: unknown -> exit 2, goh -> one plain line, exit 2; as64/mowas_2 -> null (same map)
function gameGate(exe, opt = {}) {
  if (exe === undefined) return null;
  const games = require('../lib/games'), id = games.idOf(exe);
  if (!id) { (opt.log || console.error)('testmap: unknown --exe ' + exe + ' (as64, mowas_2, mowas2, goh)'); (opt.exit || process.exit)(2); return 'usage'; }
  if (NOT_FOR[id]) return games.refuse('testmap', id, NOT_FOR[id][0], NOT_FOR[id][1], opt);
  return null;
}
module.exports = { build, write, gameGate, NOT_FOR };
if (require.main === module) {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  gameGate(a.exe);
  if (!a.out) { console.error('usage: testmap.js --out <modDir> [--name pv_tiny] [--size 250] [--gap 70]'); process.exit(2); }
  try {
    const m = build(a), d = write(a.out, m);
    console.log(`${d}: ${Object.values(m.files).reduce((n, b) => n + b.length, 0)} bytes`);
  } catch (e) { console.error(e.message); process.exit(2); }
}
