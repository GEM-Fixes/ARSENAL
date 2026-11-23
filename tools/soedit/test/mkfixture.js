// soedit test fixture: a synthetic mini game tree (dummy mowas_2.exe, loose files + one pak made with lib/zipwrite) and an empty mod folder.
//   node mkfixture.js <dir>   or   require('./mkfixture').make(dir) -> {game, mod, mdlKey, expect}
//   model resource/entity/vehicle/tank1/tank1.mdl (entity tank1): 3 ply (one in parts/), 1 vol + 1 anm in the pak, 2 anm loose,
//   3 mtl, textures loose (incl. a #1 variant and one under texture/common), and three refs that resolve nowhere (ghost.ply, missing_tex, nope.mtl).
// Author: Imperator_Aug (ARSENAL, ia-0b8287d0)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');

const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const str = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);
const tag = t => Buffer.from(t, 'latin1');
const MAT = 0x400;
// one MESH part (fvf with 1 texcoord) naming a material
const meshPart = mtl => Buffer.concat([tag('MESH'), u32(0x112), i32(0), i32(0), u32(MAT), str(mtl)]);
// one SUBM part: two empty vertex declarations, 4 ints, flags, material
const submPart = mtl => Buffer.concat([tag('SUBM'), Buffer.from([0xff, 0xff]), i32(0), i32(0), i32(0), i32(0), u32(MAT), str(mtl)]);
const plyOf = (...parts) => Buffer.concat([tag('EPLY'), ...parts]);
const anmOf = (version, bones) => Buffer.concat([tag('EANM'), i32(version), tag('FRMS'), i32(2), tag('BMAP'), i32(bones.length), ...bones.map(b => Buffer.concat([i32(b.length), Buffer.from(b, 'latin1')]))]);
const volOf = () => Buffer.concat([tag('EVLM'), tag('VERT'), i32(0), tag('INDX'), i32(0)]);
const dds = n => Buffer.concat([tag('DDS '), Buffer.alloc(124 + n)]);
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');

const MDL = `; Exported by: fixture
; File: tank1.max
{Skeleton
	{animation
		{sequence "start"}
		{sequence "fire" {file "shot.anm"} {speed 2}}
		{sequence "open" {resume}}
	}
	{bone "basis"
		{Orientation
			1 0 0
			0 -1 0
			0 0 1
		}
		{bone "body"
			{parameters "ID=body;"}
			{VolumeView "body.ply"}
			{bone revolute "turret"
				{limits -30 30}
				{speed 10}
				{VolumeView "parts/turret.ply"}
			}
			{bone "lod"
				{LODView {View "body_lod1.ply"} {OFF}}
			}
			{bone "ghost"
				{VolumeView "ghost.ply"}
			}
		}
	}
}
{Volume "body"
	{Polyhedron "body.vol"}
	{Bone "body"}
	{Position 0 0 0}
}
{Volume "crew"
	{Box 1 2 3}
	{Bone "body"}
}
`;

function make(dir) {
  const game = path.join(dir, 'game'), mod = path.join(dir, 'mods_src', 'mymod');
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (rel, buf) => { const p = path.join(game, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  put('mowas_2.exe', Buffer.from('MZ fake'));
  const T = 'resource/entity/vehicle/tank1/';
  put(T + 'tank1.def', crlf('{game_entity\n\t{Extension "tank1.mdl"}\n}\n'));
  put(T + 'tank1.mdl', crlf(MDL));
  put(T + 'body.ply', plyOf(submPart('body.mtl'), submPart('body.mtl')));
  put(T + 'body_lod1.ply', plyOf(meshPart('body')));
  put(T + 'parts/turret.ply', plyOf(meshPart('turret.mtl'), meshPart('nope.mtl')));
  put(T + 'shot.anm', anmOf(3, ['basis', 'turret']));
  put(T + 'open.anm', anmOf(3, ['basis']));
  put(T + 'body.mtl', crlf('{material bump\n\t{diffuse "tank1"}\n\t{bump "$/model/tank1_bp"}\n\t{blend none}\n}\n'));
  put(T + 'turret.mtl', crlf('{material simple\n\t{diffuse "$/model/missing_tex"}\n}\n'));
  put(T + 'tank1#1.mtl', crlf('{material simple\n\t{diffuse "tank1#1"}\n}\n'));
  put(T + 'tank1.dds', dds(16));
  put(T + 'tank1#1.dds', dds(8));
  put(T + 'unrelated.ply', plyOf(meshPart('x.mtl')));
  put('resource/texture/common/model/tank1_bp.dds', dds(4));
  // pak: start.anm + body.vol (entries relative to resource/entity/)
  fs.writeFileSync(path.join(game, 'resource', 'entity', 'e1.pak'), zip([
    ['vehicle/tank1/start.anm', anmOf(3, ['basis', 'body'])],
    ['vehicle/tank1/body.vol', volOf(), true],
  ]));
  fs.mkdirSync(mod, { recursive: true });
  return {
    game, mod, mdlKey: T + 'tank1.mdl', T,
    expect: {
      mdl: [T + 'tank1.mdl'],
      ply: [T + 'body.ply', T + 'body_lod1.ply', T + 'parts/turret.ply'],
      vol: [T + 'body.vol'],
      anm: [T + 'open.anm', T + 'shot.anm', T + 'start.anm'],
      mtl: [T + 'body.mtl', T + 'tank1#1.mtl', T + 'turret.mtl'],
      texture: [T + 'tank1#1.dds', T + 'tank1.dds', 'resource/texture/common/model/tank1_bp.dds'],
      unresolved: ['ply ghost.ply', 'mtl nope.mtl', 'texture $/model/missing_tex'],
    },
  };
}

// humans and a mod with its own pak, laid on a make() fixture (target.js, modelindex.js, the Models page find/folder routes):
//   game resource/entity/e2.pak: humanskin/human/human.{def,mdl} (the shared human model: only in this pak) + humanskin/ger_officer
//     (a skin: def, mdl, skin.ply);  game resource/gamelogic.pak: properties/animation/human/{human_anm.ext, walk.anm},
//     set/breed/mp/ger/admiral.set {skin "ger_officer"};  loose: entity/construction/barrel/barrel.{def,mdl} (an object)
//   mod resource/entity.pak: -vehicle/t99/{t99.def, t99.mdl, hull.ply} (a vehicle only in the mod's pak), humanskin/rus_rifle skin;
//   mod loose: set/breed/mp/rus/rifleman.set {skin "rus_rifle"}; a folder outside any resource tree: <dir>/loose/lone.{def,mdl}
const HUMAN_MDL = `{Skeleton
	{extension "/properties/animation/human/human_anm.ext"}
	{bone "basis"
		{bone "body"}
	}
}
`;
const SKIN_MDL = `{Skeleton
	{bone "basis"
		{bone "body"
			{bone "skin"
				{VolumeView "skin.ply"}
			}
		}
	}
}
`;
const VEH_MDL = `{Skeleton
	{bone "basis"
		{bone "body"
			{VolumeView "hull.ply"}
		}
	}
}
`;
function makeHuman(fx, dir) {
  const { game, mod } = fx;
  const H = 'humanskin/';
  fs.writeFileSync(path.join(game, 'resource', 'entity', 'e2.pak'), zip([
    [H + 'human/human.def', crlf('{human\n\t{Extension "human.mdl"}\n}\n')],
    [H + 'human/human.mdl', crlf(HUMAN_MDL)],
    [H + 'ger_officer/ger_officer.def', crlf('{human\n\t{Extension "ger_officer.mdl"}\n}\n')],
    [H + 'ger_officer/ger_officer.mdl', crlf(SKIN_MDL)],
    [H + 'ger_officer/skin.ply', plyOf(meshPart('ger_officer'))],
  ]));
  fs.writeFileSync(path.join(game, 'resource', 'gamelogic.pak'), zip([
    ['properties/animation/human/human_anm.ext', crlf('{animation\n\t{sequence "walk"}\n\t{sequence "nofile"}\n}\n')],
    ['properties/animation/human/walk.anm', anmOf(3, ['basis', 'body'])],
    ['set/breed/mp/ger/admiral.set', crlf('{breed\n\t{skin "ger_officer"}\n}\n')],
  ]));
  const put = (root, rel, buf) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  put(game, 'resource/entity/construction/barrel/barrel.def', crlf('{entity\n\t{Extension "barrel.mdl"}\n}\n'));
  put(game, 'resource/entity/construction/barrel/barrel.mdl', crlf(SKIN_MDL.replace('skin.ply', 'barrel.ply')));
  put(game, 'resource/entity/construction/barrel/barrel.ply', plyOf(meshPart('barrel')));
  fs.mkdirSync(path.join(mod, 'resource'), { recursive: true });
  fs.writeFileSync(path.join(mod, 'resource', 'entity.pak'), zip([
    ['entity/-vehicle/t99/t99.def', crlf('{game_entity\n\t{Extension "t99.mdl"}\n}\n')],
    ['entity/-vehicle/t99/t99.mdl', crlf(VEH_MDL)],
    ['entity/-vehicle/t99/hull.ply', plyOf(meshPart('hull'))],
    ['entity/humanskin/rus_rifle/rus_rifle.def', crlf('{human\n\t{Extension "rus_rifle.mdl"}\n}\n')],
    ['entity/humanskin/rus_rifle/rus_rifle.mdl', crlf(SKIN_MDL)],
    ['entity/humanskin/rus_rifle/skin.ply', plyOf(meshPart('rus_rifle'))],
  ]));
  put(mod, 'resource/set/breed/mp/rus/rifleman.set', crlf('{breed\n\t{skin "rus_rifle"}\n}\n'));
  const loose = path.join(dir, 'loose');
  put(loose, 'lone.def', crlf('{entity\n\t{Extension "lone.mdl"}\n}\n'));
  put(loose, 'lone.mdl', crlf(SKIN_MDL.replace('skin.ply', 'lone.ply')));
  put(loose, 'lone.ply', plyOf(meshPart('lone')));
  return { loose, entityPak: path.join(mod, 'resource', 'entity.pak'), gamePak: path.join(game, 'resource', 'entity', 'e2.pak') };
}

if (require.main === module) { const r = make(path.resolve(process.argv[2] || 'fixture')); console.log(JSON.stringify(r, null, 1)); }
module.exports = { make, makeHuman, plyOf, meshPart, submPart, anmOf, volOf };
