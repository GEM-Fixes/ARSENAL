// kit kinds: which kind of game file a path is, for the Code Pieces pane (design 4.3).
// module.exports = kitKinds, ONE self-contained ES5 function (the page gets it by toString(): no closure, no require).
//   kitKinds() -> { KINDS:[{ id, pieces }], kitKindOf(keyOrRel) -> kitKind|'none' }
//   kitKindOf takes the part after the last '::' (a text file inside the mod's own pak), lower case, '/' separators,
//   an optional 'resource/' prefix. 'mod.info' with no folder = the mod root file.
//   Round 2 (2026-11-21): pieces on for ia-terrain, lng, mi, mapinfo, stuff, breed, entity-def and the new kind props (SDL
//   files under properties/); entity/** files with ext def, inc or ext are entity-def.
// Author: Imperator_Aug (ARSENAL, ia-d1578486)
'use strict';
function kitKinds() {
  var KINDS = [
    { id: 'ia-entity', pieces: true },
    { id: 'ia-terrain', pieces: true },
    { id: 'ia-terrain-map', pieces: false },
    { id: 'modinfo', pieces: false },
    { id: 'lng', pieces: true },
    { id: 'bot-lua', pieces: false },
    { id: 'mi', pieces: true },
    { id: 'mapinfo', pieces: true },
    { id: 'mp-units', pieces: false },
    { id: 'mp-games', pieces: false },
    { id: 'stuff', pieces: true },
    { id: 'breed', pieces: true },
    { id: 'entity-def', pieces: true },
    { id: 'props', pieces: true },
    { id: 'mtl', pieces: false },
    { id: 'sound-set', pieces: false },
    { id: 'sdl', pieces: true }
  ];
  // extensions of SDL data files (tools/lib/sdlset.js SDL_EXT without the empty one)
  var SDL = ' def mdl mtl def1 inc tex ext set dl reg ammo weapon pattern mine grenade hand fsm fx font ps mi info mod ctm etf presets accuracy tpl ';
  function starts(p, s) { return p.slice(0, s.length) === s; }
  function ends(p, s) { return s.length <= p.length && p.slice(p.length - s.length) === s; }
  function kitKindOf(keyOrRel) {
    var p = String(keyOrRel == null ? '' : keyOrRel);
    var i = p.lastIndexOf('::');
    if (i >= 0) p = p.slice(i + 2);
    p = p.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
    if (!p) return 'none';
    if (p === 'mod.info') return 'modinfo';
    if (starts(p, 'resource/')) p = p.slice(9);
    var base = p.slice(p.lastIndexOf('/') + 1), dot = base.lastIndexOf('.');
    var ext = dot < 0 ? '' : base.slice(dot + 1);
    if (starts(p, 'set/interaction_entity/') && (ext === 'inc' || p === 'set/interaction_entity/entity.set')) return 'ia-entity';
    if (p === 'set/interaction_terrain/effects.set' || (starts(p, 'set/interaction_terrain/effects/') && ext === 'inc')) return 'ia-terrain';
    if (p === 'set/interaction_terrain/terrains.set' || p === 'set/interaction_terrain/textures.set') return 'ia-terrain-map';
    if (ext === 'lng') return 'lng';
    if (starts(p, 'script/multiplayer/') && ext === 'lua' && p.indexOf('/', 19) < 0) return 'bot-lua';
    if (ext === 'mi') return 'mi';
    if (starts(p, 'map/') && base === 'map.info') return 'mapinfo';
    if (starts(p, 'set/multiplayer/units/')) return 'mp-units';
    if (starts(p, 'set/multiplayer/games/') || starts(p, 'set/multiplayer/armies/')) return 'mp-games';
    if (starts(p, 'set/stuff/')) return 'stuff';
    if (starts(p, 'set/breed/')) return 'breed';
    if (starts(p, 'entity/') && (ext === 'def' || ext === 'inc' || ext === 'ext')) return 'entity-def';
    // shared unit data (properties/tank.ext, properties/human.inc ...): its own kind, the entity pieces of properties/**
    if (starts(p, 'properties/') && ext && SDL.indexOf(' ' + ext + ' ') >= 0) return 'props';
    if (ext === 'mtl') return 'mtl';
    if (p === 'sound/sound.set' || (starts(p, 'sound/') && ends(p, '/folder.set'))) return 'sound-set';
    if (ext && SDL.indexOf(' ' + ext + ' ') >= 0) return 'sdl';
    return 'none';
  }
  return { KINDS: KINDS, kitKindOf: kitKindOf };
}
module.exports = kitKinds;
