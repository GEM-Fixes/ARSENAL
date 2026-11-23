// Author: Imperator_Aug (ARSENAL, ia-c17f93b6)
'use strict';
// units ext: what a unit looks like, as far as the text files decide it: the skin a soldier wears and the texture variant
// ("texmod") a model shows. Reads only; the writes are gen's ops wear and texmod (tools/gen/lib/ops-unit.js).
//   every function takes c = a gen Ctx (or anything with keys(re) -> [key], read(key) -> Buffer|null, exists(key), inMod(key))
//
// Engine facts (as64 source path:line; [V] read in the source or the data, [I] inferred, [T] needs a run in the game):
//   skin [V] ,: {breed {skin "name"}} is the breed's skin; the engine's list of skin
//           names is every .def under /entity/humanskin (:24); a breed with no line wears "skeleton" (:71-73).
//           [V] CopySkin, SetSkin: the skin entity's views go onto the soldier's bones
//           and then the skin entity's texture variant is given to the soldier (:72-77).
//   texmod [V] : a texture variant is a file "<texture>#<variant>.<ext>" beside the texture
//           (a "$" after the variant marks a dynamic one); the lookup; the {TexMod "variant"} line.
//           [V] ,: an entity def reads {TexMods {"name" "variant"} ..} (names a
//           map can ask for; several of one name = one is picked at random) and {TexMod "variant"} (the variant the model
//           shows by itself); the readers, PickTexVariant
//           HasTexVariant, SetTexVariant (nothing happens when no texture of the model has the variant).
//           [V] : a variant no texture of the model has is dropped when the model starts.
//           [V] multiplayer: the map's game mode line texMod (map.info) is given
//           every unit a player buys and replaces the def's own variant when
//           the model has files of that name ( a vehicle, a soldier, after his
//           breed and skin are set). Vanilla as64 maps use 0, 1, 2 and d [V data].
//           [V] a soldier's armour item takes the wearer's variant: .
//           [V] in a mission: the interaction action tex_mod "variant" | reset.
//   so a soldier has no texmod line of his own: his variant is the {texmod} line of his skin's def. Vanilla as64 does exactly
//           that: entity/humanskin/ger_officer/ger2_officer.def = {Extension "ger_officer.mdl"} {texmod "camo"} [V data].
//   GoH     [V data 2026-11-23] 3667 skin defs, none has a texmod line; a soldier's season look is files "<mesh>#winter.ply" and
//           "<texture>#winter.dds" (humanskin variant names: winter only, 4433 files); no skin or human def has {TexMods} and
//           seasons.inc is included only by bush, tree and post, so "winter" is the variant name itself. Where the season comes
//           from [V data]: every multiplayer mode file resource/map/multi/<map>/<mode>.info has {game .. {texMod winter|camo} ..}
//           (winter 100 modes on 66 maps, camo 202 on 121, 45 with none or the line commented out; vanilla comment "tex mod given
//           to units"); single player map.info names none and
//           the mission places each soldier with his own {TexMod "winter"} (4697 placed humans in the .mi files). As in as64
//           (above) the map's texMod replaces the soldier's look only when his skin has files of that name, so on a camo map a
//           soldier keeps his plain look [I, GHINT-43]. Vehicle defs do carry {texmod "x"} (41 defs, own line after
//           {extension}) and {TexMods} (15 defs) [V data]. A skin def copy with {texmod "winter"} = a soldier in winter on every map
//           ( SetSkin gives the skin's variant to the soldier) is as64 untested, never used by vanilla GoH skins [I][T].
//           Not run in the game.
// The parts both this page and the Models page read (the variant files of a model, the skin list, a def's own lines) are in ./texvar.js.
const K = require('./kit'), T = require('./texvar');
const { lc, dirOf, stemOf, defLook } = T;

// the {skin} line of a soldier file: { found, skin ('' = none), own (lines in the file's own {breed} block), calls (the block
// also takes lines from other files), canChange, why }
function breedSkin(src) {
  const t = K.parse(String(src || '')), br = t.kids.find(k => k.name === 'breed');
  if (!br) return { found: false, skin: '', own: 0, calls: false, canChange: false, why: 'nobreed' };
  const own = br.kids.filter(k => k.name === 'skin'), calls = br.kids.some(k => k.name === '(');
  const skin = own.length ? lc(own[0].args[0] || '') : '';
  const why = own.length > 1 ? 'many' : !own.length && calls ? 'inherited' : own.length && !skin ? 'form' : '';
  return { found: true, skin, own: own.length, calls, canChange: !why, why };
}

// another def of the same model in the same folder that shows `variant` ('' = none) and differs in nothing else: its name, or null
function siblingWith(c, key, L, variant) {
  const dir = dirOf(key) + '/';
  for (const k of c.keys(new RegExp('^' + dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^/]+\\.def$'))) {
    if (k === key) continue;
    const o = defLook(c, k);
    if (o.found && o.lines <= 1 && o.form !== 'list' && o.texmod === variant && lc(o.extension) === lc(L.extension) && o.sig === L.sig) return stemOf(k);
  }
  return null;
}
// a free def name for a copy of `stem` that shows `variant` ('' = none): stem_variant, stem_plain, then _2, _3 ..
function freeName(c, stem, was, variant) {
  let base = was && stem.endsWith('_' + was) ? stem.slice(0, -was.length - 1) : stem;
  base = (base + '_' + (variant || 'plain')).replace(/[^a-z0-9_]/g, '_');
  const taken = n => c.keys(new RegExp('^resource/entity/(?:.*/)?' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.def$')).length > 0;
  let name = base;
  for (let i = 2; taken(name) && i < 100; i++) name = base + '_' + i;
  return name;
}

// GoH: the seasons the multiplayer maps give the units they spawn, from {texMod x} of each resource/map/multi/<map>/<mode>.info
// (header above) -> { seasons [{name, modes, maps, ex (three map names)}] most used first, none (mode files that name no season) };
// kept on the reader
function gohSeasons(c) {
  if (c._gohSeasons) return c._gohSeasons;
  const by = new Map(); let none = 0;
  for (const k of c.keys(/^resource\/map\/multi\/[^/]+\/[^/]+\.info$/)) {
    const b = c.read(k); if (!b) continue;
    const m = /\{\s*texmod\s+"?([^"}\s]+)/i.exec(b.toString('latin1').replace(/;[^\n]*/g, ''));
    if (!m) { none++; continue; }
    const v = lc(m[1]), map = k.split('/')[3];
    if (!by.has(v)) by.set(v, { name: v, modes: 0, maps: new Set() });
    const e = by.get(v); e.modes++; e.maps.add(map);
  }
  const seasons = [...by.values()].map(e => ({ name: e.name, modes: e.modes, maps: e.maps.size, ex: [...e.maps].sort().slice(0, 3) }))
    .sort((a, b) => b.modes - a.modes || (a.name < b.name ? -1 : 1));
  return (c._gohSeasons = { seasons, none });
}

module.exports = Object.assign({}, T, { breedSkin, siblingWith, freeName, gohSeasons });
