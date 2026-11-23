// unitcard/kinds: the unit pictures each game reads, where, at what size, how many frames, which data names them and what the
// engine shows when one is missing. Facts and tags: tools/unitcard/README.md (part 1). Sizes are the vanilla majority, read again
// at run time by styles.js from the game's own files (a game that shipped another size wins).
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-78cd1153)
'use strict';

const SCENE = 'resource/interface/scene/';
// family of a game id (lib/games): as64 and mowas2 share the data (as2), goh its own
const family = gid => (String(gid || 'as64').toLowerCase() === 'goh' ? 'goh' : 'as2');
const exeOf = gid => { const g = String(gid || 'as64').toLowerCase(); return g === 'goh' ? 'goh' : g === 'mowas2' || g === 'mowas_2' ? 'mowas_2' : 'as64'; };

// name: which unit fact gives the file stem.
//   card = the buy card id (set/multiplayer/units), def = the vehicle's entity name (def stem), portrait = the breed's {portrait},
//   icon = the breed's {icon} (falls back to portrait), structure = the vehicle's structure folder (scheme only)
// frames: 4 = _00 normal, _01 hover, _02 pressed, _03 locked;  3 = _00 .. _02;  0 = one file, no frame number
// on: unit kinds the picture belongs to.  tag: how sure the row is (V verified in source or data, I inferred, T needs a game test)
const AS2 = [
  { id: 'card', folder: 'unit_icon', w: 104, h: 52, frames: 4, name: 'card', on: ['vehicle', 'squad'], tag: 'V',
    use: 'buy panel card (multiplayer), reinforcement bar', miss: 'unit_icon/stub (a blank card); the unit can still be bought',
    src: ',365-369' },
  { id: 'small', folder: 'unit_icon_small', w: 112, h: 48, frames: 4, name: 'def', on: ['vehicle'], tag: 'V',
    use: 'in-game unit list (bottom left) of a vehicle; end-of-match statistics by card id', miss: 'unit_icon_small/icon_stub (list), unit_icon_small/stub (statistics)',
    src: '; ,516', also: 'card' },
  { id: 'squad', folder: 'squad', w: 48, h: 48, frames: 3, name: 'portrait', on: ['soldier', 'squad'], tag: 'V',
    use: 'in-game unit list of a soldier (squad/<breed portrait>), breed {icon} marks', miss: 'squad/icon_stub',
    src: '; ' },
  { id: 'portrait', folder: 'portrait', w: 97, h: 135, frames: 0, name: 'portrait', on: ['soldier', 'squad'], tag: 'V',
    use: 'soldier panel (one selected man), talks and messages', miss: 'portrait/skeleton when the breed has no {portrait}; a named file that is missing shows nothing [I]',
    src: '; ; ' },
  { id: 'scheme', folder: 'structure', w: 97, h: 140, frames: 0, name: 'structure', on: ['vehicle'], tag: 'I', file: 'scheme',
    use: 'damage scheme in the vehicle panel, drawn with multiply blend (white = no change)', miss: 'no scheme drawn [I]',
    src: ';  (folder = model name, or config units/<model>/structure)' },
];
const GOH = [
  { id: 'card', folder: 'unit_icon', w: 144, h: 72, frames: 4, name: 'card', on: ['vehicle', 'squad'], tag: 'I',
    use: 'buy panel card', miss: 'stub card [I, AS2 rule]', src: 'gohweb GHUI (not tested in game)' },
  { id: 'small', folder: 'unit_icon_small', w: 112, h: 48, frames: 4, name: 'def', on: ['vehicle'], tag: 'I',
    use: 'in-game unit list of a vehicle', miss: 'icon_stub [I, AS2 rule]', src: 'as2 rule, GoH exe has the same names (gohweb)', also: 'card' },
  { id: 'shop', folder: 'portrait_squad', w: 112, h: 140, frames: 4, name: 'card', on: ['vehicle', 'squad'], tag: 'I',
    use: 'Conquest shop and reinforcement portrait of a unit', miss: 'placeholder picture', src: 'modweb conquest/campaign-shop-squads:16 (GHCQ)' },
  { id: 'squad', folder: 'squad', w: 48, h: 48, frames: 3, name: 'portrait', on: ['soldier', 'squad'], tag: 'I',
    use: 'in-game unit list of a soldier', miss: 'squad/icon_stub [I, AS2 rule]', src: 'as2 rule' },
  { id: 'portrait', folder: 'portrait', w: 128, h: 164, frames: 0, name: 'portrait', on: ['soldier', 'squad'], tag: 'I',
    use: 'soldier panel, talks', miss: 'portrait/skeleton [I, AS2 rule]', src: 'GHUI-71, GHHUM-25' },
];
// not made here, and why (the page shows the line)
const NOT = {
  as2: [],
  goh: [{ id: 'scheme', why: 'The GoH install ships no structure/<vehicle>/scheme.tga, so there is no vanilla style or size to follow (the exe still reads the place; not checked).' },
    { id: 'vehicle_view', why: 'GoH vehicle_view/<model>/<part> pictures are per model part (damage view), not per unit card.' }],
};

// where a kind draws its class badge, as [x0, y0, x1, y1] in 0..1 of the picture (searched for badges there only), and the frame the
// game shows normally (the base the other frames are made from). Read from the vanilla files by eye, then confirmed by the badge
// clustering of lib/layers.js [I]: AS2 card = rank strip at the left; AS2 portrait = the box at the lower right; squad = the whole
// shield (no man is drawn there); GoH card = the role mark at the lower left and the class diamond at the right; GoH shop = top right.
// squad frame 0 is the purple "not available" state in both games, frame 1 the normal one [I measured].
const BADGE = {
  // an area with a group list is searched for that class group only (the AS2 rank strip is on infantry cards only)
  as2: { card: [[0, 0, 0.3, 1, ['infantry', 'hero']]], portrait: [[0.66, 0.67, 1, 1]], squad: [[0, 0, 1, 1]] },
  goh: { card: [[0, 0.45, 0.26, 1], [0.66, 0, 1, 1, ['infantry', 'hero']]], shop: [[0.5, 0, 1, 0.5]], squad: [[0, 0, 1, 1]] },
};
const BASE = { squad: 1 };
function badgeAreas(gid, id, group) { return ((BADGE[family(gid)] || {})[id] || []).filter(a => !a[4] || !group || a[4].includes(group)).map(a => a.slice(0, 4)); }
function baseFrame(id, frames) { const b = BASE[id] || 0; return frames > b ? b : 0; }
function list(gid) { return (family(gid) === 'goh' ? GOH : AS2).map(k => Object.assign({ game: family(gid) }, k)); }
function get(gid, id) { return list(gid).find(k => k.id === id) || null; }
// the stem each kind takes for a unit u ({ id, kind, def, portrait, icon, structure })
function stemOf(k, u) {
  const v = k.name === 'card' ? u.id : k.name === 'def' ? u.def || (u.kind === 'vehicle' ? u.id : '') : k.name === 'portrait' ? u.portrait || '' : k.name === 'structure' ? u.structure || u.def || '' : '';
  return String(v || '').toLowerCase();
}
// every file a kind writes for a stem: [{ key, frame }]
function filesOf(k, stem, ext) {
  const e = ext || '.tga', base = SCENE + k.folder + '/';
  if (k.id === 'scheme') return [{ key: base + stem + '/' + k.file + e, frame: 0 }];
  if (!k.frames) return [{ key: base + stem + e, frame: 0 }];
  const out = []; for (let i = 0; i < k.frames; i++) out.push({ key: base + stem + '_0' + i + e, frame: i });
  return out;
}
module.exports = { SCENE, AS2, GOH, NOT, list, get, family, exeOf, stemOf, filesOf, badgeAreas, baseFrame };
