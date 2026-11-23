// specschema.js: the contract of a gen spec. build(tables) -> JSON Schema (draft 2020-12) of what gen accepts today; checkSpec() validates a parsed spec
// against it plus gen's own static refusals (no game, nothing written). `gen --schema` prints build(); `gen --check-spec <spec>` runs checkSpec().
//   tables (from gen.js, so the schema follows the code): OPS (op name -> function name), TARGETS, GOH_FIELDS. ops.js supplies SET_OPS, FACTION, SQUAD_NAME, MAPNAME, MAPKEY.
//   FIELDS below = the per-op field table. test/spec.js reads gen.js + ops.js and fails when the code reads a field this table lacks (and the reverse), or an op has no row.
//   x-limits = limits row IDs that bound the field; ids taken from the limits map's own entry for the gen code that fires on that field (tools/lib/limmap: limitOf).
// codes (tool-kind, counted): GEN_SPEC_PARSE GEN_SPEC_TYPE GEN_SPEC_VALUE GEN_SPEC_FIELD_UNKNOWN GEN_SPEC_FIELD_MISSING GEN_SPEC_OP_UNKNOWN GEN_SPEC_TARGET GEN_SPEC_TARGET_OP GEN_SPEC_CSV_MISSING
// Author: Imperator_Aug (ARSENAL, ia-2e69a932)
const fs = require('fs'), path = require('path');
const ops = require('./ops');

const CODES = ['GEN_SPEC_PARSE', 'GEN_SPEC_TYPE', 'GEN_SPEC_VALUE', 'GEN_SPEC_FIELD_UNKNOWN', 'GEN_SPEC_FIELD_MISSING', 'GEN_SPEC_OP_UNKNOWN', 'GEN_SPEC_TARGET', 'GEN_SPEC_TARGET_OP', 'GEN_SPEC_CSV_MISSING'];
const ref = n => ({ $ref: '#/$defs/' + n });
const ci = w => w.split('').map(c => '[' + c + c.toUpperCase() + ']').join('');   // case-insensitive literal (gen lowercases set-row ops)
// a field: schema fragment + description + x-limits
const F = (s, description, lim, extra) => Object.assign({}, s, { description }, lim && lim.length ? { 'x-limits': lim } : {}, extra || {});
const S1 = ref('scalar'), STR = { type: 'string' };

// ---- the field table: op -> { props, items (fields of one element of items:[..]), any: [[required alternatives]], req }
// props not read by the code are refused by the test; fields read by the code and missing here too.
const FIELDS = {
  mod: { props: {
    title: F(S1, 'mod.info Name; else name'), name: F(S1, 'fallback for title'),
    deps: F(ref('scalarOrList'), 'mods the new mod depends on (mod.info Dependencies); folder names under <game>/mods'),
    game_version: F(S1, 'mod.info game version (GoH: 1.067 style)') } },
  clone: { any: [['stuff', 'tags'], ['entity', 'as']], props: {
    stuff: F(S1, 'stuff (weapon/ammo) to copy; with tags'), tags: F(S1, 'new stuff name (dots allowed); with stuff'),
    entity: F(S1, 'entity def name to copy; with as'), as: F(S1, 'new entity def name'),
    name: F(S1, 'display name, written to desc/entity/<as> (clone-entity --name)'),
    set: F({ anyOf: [ref('scalarMap'), { type: 'array', items: S1 }, STR] }, 'edits applied to the copy: {path: value} or ["path=value"]'),
    copy_assets: F({ type: 'boolean' }, 'copy model/anim files into the mod', [], { default: false }),
    roster: F({ type: 'boolean' }, 'also add a roster card (clone-entity --roster)', [], { default: false }),
    material: F(S1, 'material override (clone-entity --material)'),
    wreck: F({ type: ['boolean', 'string'] }, 'false = do not auto-clone the _x / _xx wreck defs (N8; the wreck swap is by name)', ['STR-14'], { default: true }) } },
  gun: { req: ['name', 'like'], props: {
    name: F(S1, 'new gun name = file resource/set/stuff/gun/<name> (a-z 0-9 _ ( ) -)'), like: F(S1, 'existing gun the new one inherits from ({from "<like>"})'),
    recharge: F({ type: ['number', 'string'] }, 'seconds between shots (rechargeTime)'), speed: F({ type: ['number', 'string'] }, 'shell speed, m/s (("speed" s(N)))'),
    damage: F({ type: ['number', 'string'] }, 'projectileDamage; default = pen at 100 m when pen is given'),
    pen: F({ type: ['string', 'array'] }, 'penetration in mm at 100 500 1000 1500 2000 m: "150 138 126 115 105"'),
    pen_scale: F({ type: ['number', 'string'] }, 'instead of pen: multiply the base gun\'s table (1.2 = 20% more)'),
    range: F(S1, 'range preset of gun/.presets: minimum short medium long maximum ..'), accuracy: F(S1, 'accuracy preset: minimum low medium high maximum ..'),
    caliber: F(S1, 'caliber preset: minimum medium large maximum howitzer ..'), display: F(S1, 'display name (desc/weapon/<name>)') } },
  weapon: { req: ['entity', 'weapon'], props: {
    entity: F(S1, 'entity def name (or file:<key>) whose weapon place is changed', ['VFS-01', 'VFS-41']), weapon: F(S1, 'gun name to mount (a game gun or one made by a gun op)'),
    place: F(S1, 'Weaponry place name', [], { default: 'gun' }) } },
  kitbash: { req: ['entity', 'turret_from'], props: {
    entity: F(S1, 'the new unit (cloned with copy_assets: true, so it owns its model files)'), turret_from: F(S1, 'vehicle whose turret (bones, meshes, hit volumes) replaces the unit\'s own'),
    part: F(S1, 'bone name of the part to swap', [], { default: 'turret' }) } },
  set: { any: [['csv'], ['rows'], ['entity', 'values']], props: {
    csv: F(STR, 'CSV file (entity,path,value[,op]), path relative to the spec file', ['VFS-01', 'VFS-41']),
    rows: F({ type: 'array', items: { oneOf: [STR, ref('setRow')] } }, 'edit rows: "entity,path,value[,op]" strings or objects', ['VFS-01', 'VFS-41']),
    entity: F(S1, 'with values: entity (def name | file:<key>) every values path is applied to', ['VFS-01', 'VFS-41']),
    values: F(ref('scalarMap'), 'with entity: {path: value}') } },
  armor: { any: [['items'], ['entity', 'value']], props: {
    items: F({ type: 'array', items: ref('armorItem') }, 'several armor edits'),
    entity: F(S1, 'entity def name (or file:<key>) whose armor_* macro call is edited', ['VFS-01', 'VFS-41']),
    macro: F(S1, 'macro name when the def has several armor_* calls', ['DMG-06']),
    arg: F(S1, 'which argument list: args (default) or a part name', ['DMG-06']),
    value: F({ type: ['string', 'number', 'object'] }, '"f s r t" (_ keeps) | "part f s r t part f s r t" | {part: "f s r t"}', ['DMG-06', 'GPL-04']) },
    items: { req: ['entity', 'value'], props: ['entity', 'macro', 'arg', 'value'] } },
  text: { any: [['items'], ['key', 'text']], props: {
    items: F({ type: 'array', items: ref('textItem') }, 'several texts'),
    key: F(S1, 'localization key, e.g. desc/entity/<unit>', ['LOC-04', 'LOC-19', 'LOC-22', 'LOC-25']),
    text: F(S1, 'the text (UTF-8)'),
    file: F(S1, 'lng file (relative to localization/) to write into instead of #<slug>.lng', ['LOC-01']) },
    items: { req: ['key', 'text'], props: ['key', 'text', 'file'] } },
  roster: { req: ['like', 'army'], any: [['unit'], ['entity']], props: {
    unit: F(S1, 'new unit (card name); entity is the alias'), entity: F(S1, 'alias of unit'),
    like: F(S1, 'existing card whose block is copied under unit'),
    army: F(ref('army'), 'army (side) list file to edit', ['VFS-41']),
    period: F(S1, 'GoH period dir (units/<period>/units_<army>.set); unused on AS2', [], { default: 'late' }),
    fields: F(ref('scalarMap'), 'card fields to set: cost ... ({k v} or k(v) in the card line); GoH names are listed in x-goh-fields', [], { 'x-goh-fields': ops.GOH_FIELDS }),
    name: F(S1, 'display name, written to desc/entity/<unit>'),
    icon_like: F(S1, 'unit whose unit_icon files are copied for the new unit'),
    tags: F({ type: 'array', items: { type: 'string', pattern: '^-?[A-Za-z0-9_]+$' } }, 'tag words to add, -word to take out ({tags ".."} or t(..); a macro-call card is expanded first); same-name cards merge tags, so the removal is written into the card itself'),
    not_for_sale: F({ type: 'boolean' }, 'true adds {not_for_sale} (hidden from purchase), false takes it out'),
    basic: F({ type: 'boolean' }, 'true adds {basic} (survives a preset apply remove), false takes it out'),
    remove: F({ type: 'boolean' }, 'true adds {remove} (the entry is deleted once read), false takes it out'),
    bots: F(ref('bots'), 'true | priority: also add the unit to bot.data.lua Purchases next to like (AI bots buy only listed units); false = meant') } },
  card: { req: ['unit', 'army'], props: {
    unit: F(S1, 'existing card to change: a vehicle/gun card name, or a soldier card (tankman or mp/<army>/tankman in soldiers.set)'), army: F(ref('army'), 'army (side) list file', ['VFS-41']),
    period: F(S1, 'GoH period dir; unused on AS2', [], { default: 'late' }),
    fields: F(ref('scalarMap'), 'card fields to set (cost ...)', [], { 'x-goh-fields': ops.GOH_FIELDS }),
    name: F(S1, 'new display name'), key: F(S1, 'localization key for name (default desc/entity/<unit>)', ['LOC-19']),
    icon_like: F(S1, 'unit whose unit_icon files are copied'),
    tags: F({ type: 'array', items: { type: 'string', pattern: '^-?[A-Za-z0-9_]+$' } }, 'tag words to add, -word to take out ({tags ".."} or t(..); a macro-call card is expanded first); same-name cards merge tags, so the removal is written into the card itself'),
    not_for_sale: F({ type: 'boolean' }, 'true adds {not_for_sale} (hidden from purchase), false takes it out'),
    basic: F({ type: 'boolean' }, 'true adds {basic} (survives a preset apply remove), false takes it out'),
    remove: F({ type: 'boolean' }, 'true adds {remove} (the entry is deleted once read), false takes it out'),
    price: F(ref('scalar'), 'short for fields cost'), cp: F(ref('scalar'), 'short for fields cp (vehicle cards: cp(..), soldier cards: {cp} after the macro is expanded)'),
    score: F(ref('scalar'), 'short for fields score (sc(..) on a vehicle card line)'), icon: F(ref('scalar'), 'the {icon N} sequence number (same non-zero icon in a group shows one card at a time); the picture is icon_like'),
    info: F(S1, 'info text (tooltip), written to info/entity/<unit>; refused on a soldier card (the squad info shows)'), info_key: F(S1, 'localization key for info (default info/entity/<unit>)'),
    list: F({ type: 'string', pattern: '^[a-z0-9_]+$' }, 'AS2: write the fields into units/<list>.set (cooperative, a game type or class name) instead of the army list; [T] no vanilla such file', ['TST-94']) } },
  squad: { req: ['name', 'army'], any: [['like', 'members'], ['like', 'content'], ['remove'], ['change']], props: {
    name: F({ type: 'string', pattern: '^[A-Za-z0-9_]+$' }, 'new squad id (SQUAD_NAME in ops.js is the same set, case-insensitive)'),
    army: F(ref('army'), 'army (side)', ['VFS-41']),
    like: F(S1, 'existing squad whose line is copied'),
    members: F({ type: 'array', minItems: 1, items: { oneOf: [{ type: 'string', pattern: '^[^:]+(:[0-9]+)?$' }, ref('member')] } }, 'squad members: "breed:n" or {breed, n}; breeds are resource/set/breed/mp/<army>/<breed>.set names; the macro squad_with<N>types must exist', ['SDL-17']),
    fields: F(ref('scalarMap'), 'squad line fields to set (cost ...)', [], { 'x-goh-fields': ops.GOH_FIELDS }),
    display: F(S1, 'display name (desc/squad/<name>(<army>)); else the like\'s text'), info: F(S1, 'info text (info/squad/<name>(<army>))'),
    bots: F(ref('bots'), 'true | priority: copy the like\'s bot.data.lua Purchases entries; false = meant'),
    period: F(S1, 'GoH period dir', [], { default: 'late' }),
    content: F(S1, 'raw {content ".."} text (e.g. "m3 ( mp/rus/a:6 mp/rus/b:2 )"); writes an expanded card block instead of the macro line'),
    order: F(S1, 'where the squad goes in the list: first | last | <squad name> to follow'),
    not_for_sale: F({ type: ['boolean', 'string'] }, 'true: add {not_for_sale} (shown, not buyable) [T]'),
    remove: F({ type: ['boolean', 'string'] }, 'true: take the existing squad <name> off the list ({"<name>(<army>)" {remove}}) [T]'),
    change: F({ type: ['boolean', 'string'] }, 'true: edit the existing squad <name> in place: members (the whole new list, or only "-breed" entries to take types out), content, fields, not_for_sale true/false, order') } },
  breed: { req: ['name', 'army', 'like'], props: {
    name: F({ type: 'string', pattern: '^[A-Za-z0-9_]+$' }, 'new breed id'), army: F(ref('army'), 'army (side)', ['VFS-41']),
    like: F(S1, 'existing breed file copied'),
    set: F(ref('scalarMap'), 'edits in the breed file: {path: value}, a leading + adds'),
    veterancy: F(S1, 'veterancy level; the macro veterancy_[lvl_]<n> must exist', ['GPL-11']),
    decl: F(ref('scalarMap'), 'fields of the soldiers.set / inf_<army>.set declaration', [], { 'x-goh-fields': ops.GOH_FIELDS }),
    display: F(S1, 'soldier display name (desc/human/mp/<army>/<name>)'), period: F(S1, 'GoH period dir', [], { default: 'late' }),
    del: F({ anyOf: [ref('scalarOrList'), { type: 'object', additionalProperties: false, properties: { items: ref('scalarOrList'), perks: ref('scalarOrList') } }] }, 'lines to drop from the copy: [item ..] or {items: [..], perks: [..]}') } },
  iblock: { req: ['entity', 'like'], props: {
    entity: F(S1, 'the new unit id (a clone made earlier in the spec, or a def)'),
    like: F(S1, 'unit whose own {"<like> tank"} style block(s) in set/interaction_entity/*.inc are copied (engine/track sounds, burn chance)') } },
  macro: { req: ['entity', 'macro'], any: [['arg', 'value'], ['rename']], props: {
    entity: F(S1, 'entity def name (or file:<key>)', ['VFS-01', 'VFS-41']),
    macro: F(S1, 'called macro name ("seat_human", "tank_trace" ..) or include'),
    match: F(S1, 'text the call must contain when the def has several calls of that macro'), nth: F(S1, 'or: which call, 1..n'),
    arg: F(S1, 'named argument (step, place, scale ..), args (the numbers after args) or a position 1..n'),
    value: F(S1, 'new value; for args "a b c" with _ keeping one'), add: F({ type: ['boolean', 'string'] }, 'true: append arg(value) when the call lacks it'),
    rename: F(S1, 'call another macro instead; its define must exist and get every %param it reads') } },
  preset: { req: ['file', 'name', 'set'], props: {
    file: F(S1, 'file under set/multiplayer/games (presets_all.inc, frontline.set ..) or a key'),
    name: F(S1, '(define "x") or {"x"} preset name, or all'),
    set: F(ref('scalarMap'), '{key path: value}; unitLimits chargeFactors commandPoints merge "tag=N;-tag" (=.. replaces), others replace') } },
  army: { req: ['tag', 'like'], props: {
    tag: F({ type: 'string', pattern: '^[a-z][a-z0-9_]{0,15}$' }, 'new army id (armies/<tag>.set, mp/army/<tag>)'),
    id: F(S1, 'army id 6..99; default the lowest free', ['TST-95', 'MIS-07']),
    like: F(S1, 'army whose file is copied (rus ger ..)'), title: F(S1, 'army name in the lobby (mp/army/<tag>)'),
    icon_like: F(S1, 'army whose flag picture is copied as flag_<tag>'), alliance: F(S1, 'alliance in preset_alliances.inc (axis allies)', ['MIS-77']) } },
  kit: { req: ['breed'], any: [['add'], ['del'], ['in_hands']], props: {
    breed: F(S1, 'soldier breed: army/name (rus/rifle) or name with army'), army: F(ref('army'), 'army when breed has no army/ part'),
    period: F(S1, 'GoH period dir', [], { default: 'late' }),
    add: F({ type: 'array', items: { oneOf: [STR, ref('kitItem')] } }, 'items to add: "name" or {item, count | filled, in_hands}'),
    del: F(ref('scalarOrList'), 'item names whose {item ..} lines are dropped'),
    in_hands: F({ type: ['boolean', 'string'] }, 'the item the soldier holds (its {in_hands} line moves there), or false: nothing held') } },
  'map-clone': { any: [['map', 'name'], ['map', 'as'], ['from', 'name'], ['from', 'as']], props: {
    map: F({ type: 'string', pattern: '^(map/)?[A-Za-z0-9_\\-]+(/[A-Za-z0-9_\\-]+)+$' }, 'source map, map/multi/<m>'), from: F(S1, 'alias of map'),
    name: F({ type: 'string', pattern: ops.MAPNAME.source }, 'new map name'), as: F(S1, 'alias of name'),
    mods: F(ref('scalarOrList'), 'extra mods searched for the source map') } },
  'mission-clone': { req: ['map', 'from'], any: [['to'], ['with_mode']], props: {
    map: F({ type: 'string', pattern: '^(map/)?[A-Za-z0-9_\\-]+(/[A-Za-z0-9_\\-]+)+$' }, 'map, map/multi/<m>'),
    from: F(S1, 'source game mode'), to: F(S1, 'target game mode'),
    with_mode: F(S1, 'new mode name (an alias of to when to is absent)'), from_mode: F(S1, 'with with_mode: mode the new one is copied from'),
    flags: F(S1, 'flag handling (mission-clone --flags)'), title: F(S1, 'with with_mode: mode title'),
    no_bots: F({ type: 'boolean' }, 'with with_mode: the new mode card keeps bots off (mission-clone --no-bots); needed when the source mission has no flag_point (MIS_BOT_NO_FLAGS)', ['MIS-65'], { default: false }),
    mods: F(ref('scalarOrList'), 'extra mods searched for the source map'), src: F(STR, 'extra root (e.g. a GoH dir) whose paks supply includes') } },
  place: { any: [['items'], ['map', 'entity', 'pos']], props: {
    items: F({ type: 'array', items: ref('placeItem') }, 'several objects'),
    map: F(S1, 'multi/<m>', ['VFS-29']), entity: F(S1, 'entity def name'),
    pos: F({ type: ['string', 'array'] }, '"x,y[,z]" or [x,y,z] in map units', ['MAP-16']),
    dir: F(S1, 'heading'), scale: F(S1, 'scale'), tex: F(S1, 'texture variant') },
    items: { req: ['map', 'entity', 'pos'], props: ['map', 'entity', 'pos', 'dir', 'scale', 'tex'] } },
};
// lib/ops-asset.js rows: shell item sound soundclass voice skin stuffmodel mapinfo, and gun = the row above plus the class fields
Object.assign(FIELDS, require('./ops-asset').assetFields({ F, ref, S1, STR, FIELDS }));
// nested element tables (rows of set, members of squad): field names the code reads; drift-tested
const NESTED = { setRow: ['entity', 'file', 'path', 'value', 'op'], member: ['breed', 'n', 'count'] };

function build(t) {
  const opNames = Object.keys(t.OPS);
  for (const k of opNames) if (!FIELDS[k]) throw new Error('gen --schema: op "' + k + '" is in OPS but has no row in lib/specschema.js FIELDS');
  for (const k of Object.keys(FIELDS)) if (!t.OPS[k]) throw new Error('gen --schema: FIELDS has "' + k + '" but gen has no such op');
  const defs = {
    scalar: { type: ['string', 'number'], description: 'text or number (gen reads every scalar as text)' },
    scalarMap: { type: 'object', additionalProperties: ref('scalar') },
    scalarOrList: { anyOf: [ref('scalar'), { type: 'array', items: ref('scalar') }] },
    bots: { type: ['boolean', 'string', 'number', 'object'], description: 'true | false | priority number | {priority, class, min_income, min_team}', additionalProperties: false, properties: {
      priority: F(S1, 'Purchases priority'), class: F(S1, 'UnitClass.<x>: Infantry ATInfantry Vehicle Tank HeavyTank ATTank AATank ArtilleryTank'),
      min_income: F(S1, 'min_income of the entry'), min_team: F(S1, 'min_team of the entry') } },
    kitItem: { type: 'object', additionalProperties: false, required: ['item'], properties: {
      item: F(S1, 'stuff name ("ppsh41", "grenade f1")'), count: F(S1, 'how many (not with filled)'),
      filled: F({ type: ['boolean', 'string'] }, 'a loaded weapon'), in_hands: F({ type: ['boolean', 'string'] }, 'the soldier holds it') } },
    army: { type: 'string', pattern: ops.FACTION.source, description: 'lower-case side id, e.g. rus ger usa' },
    setRow: { type: 'object', additionalProperties: false, anyOf: [{ required: ['entity'] }, { required: ['file'] }], required: ['path'], properties: {
      entity: F(S1, 'entity def name | file:<vfs key> | key with /', ['VFS-01', 'VFS-41']), file: F(S1, 'alias of entity'),
      path: F(STR, 'SDL path inside the def, e.g. actor/k1', ['DMG-06', 'GPL-04']), value: F(S1, 'new value (UTF-8)'),
      op: F({ type: 'string', pattern: '^(' + ops.SET_OPS.map(ci).join('|') + ')$', examples: ops.SET_OPS }, 'set | add (new line where the name repeats or is keyed, else set) | append (always a new line) | del (case-insensitive)', [], { default: 'set' }) } },
    member: { type: 'object', additionalProperties: false, required: ['breed'], properties: { breed: F(S1, 'breed name'), n: F(S1, 'count >= 1', [], { default: 1 }), count: F(S1, 'alias of n') } },
  };
  const opDef = k => {
    const d = FIELDS[k], props = { op: { const: k, description: 'the operation' } };
    for (const [f, s] of Object.entries(d.props)) props[f] = s;
    const o = { type: 'object', title: k + ' op', additionalProperties: false, required: ['op', ...(d.req || [])], properties: props };
    if (d.any) o.anyOf = d.any.map(r => ({ required: r }));
    return o;
  };
  for (const k of ['armor', 'text', 'place']) {
    const it = FIELDS[k].items, key = k + 'Item', props = {};
    for (const f of it.props) props[f] = FIELDS[k].props[f];
    defs[key] = { type: 'object', additionalProperties: false, required: it.req, properties: props };
  }
  for (const k of opNames) defs[k + '-op'] = opDef(k);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:arsenal:gen-spec', title: 'ARSENAL gen spec',
    description: 'What `gen <spec>` accepts today. Unknown fields are ignored by gen itself; this schema (and gen --check-spec) refuse them so a typo is not silent. Specs are YAML (subset) or JSON.',
    type: 'object', required: ['ops'], additionalProperties: false,
    properties: {
      name: F(S1, 'mod name; default = the spec file name'), title: F(S1, 'mod.info Name of the implicit first mod op'),
      deps: F(ref('scalarOrList'), 'mods the new mod depends on'), game_version: F(S1, 'mod.info game version'),
      target: F({ type: 'string', enum: t.TARGETS.slice() }, 'which exe the mod is for; --target overrides'),
      ops: { type: 'array', description: 'operations in order; the first op is `mod` or an implicit mod is made', items: { oneOf: opNames.map(k => ref(k + '-op')) } } },
    $defs: defs,
    'x-codes': CODES, 'x-goh-fields': ops.GOH_FIELDS,
  };
}

// ---- validation: the JSON Schema subset build() uses. emit(code, msg)
const tOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const tOk = (t, v) => t === 'integer' ? Number.isInteger(v) : tOf(v) === t;
function validate(root, node, v, at, emit) {
  if (node.$ref) node = root.$defs[node.$ref.replace('#/$defs/', '')];
  if (node.type) {
    const ts = [].concat(node.type);
    if (!ts.some(t => tOk(t, v))) { emit('GEN_SPEC_TYPE', `${at}: expected ${ts.join('|')}, got ${tOf(v)}`); return; }
  }
  if (node.const !== undefined && v !== node.const) { emit('GEN_SPEC_VALUE', `${at}: must be "${node.const}"`); return; }
  if (node.enum && !node.enum.includes(v)) { emit('GEN_SPEC_VALUE', `${at}: "${v}" is not one of ${node.enum.join(' ')}`); return; }
  if (node.pattern && typeof v === 'string' && !new RegExp(node.pattern).test(v)) { emit('GEN_SPEC_VALUE', `${at}: "${v}" does not match ${node.pattern}`); return; }
  if (Array.isArray(v)) {
    if (node.minItems !== undefined && v.length < node.minItems) emit('GEN_SPEC_VALUE', `${at}: needs at least ${node.minItems} item(s)`);
    if (node.items) v.forEach((x, i) => validate(root, node.items, x, `${at}[${i}]`, emit));
  } else if (v && typeof v === 'object') {
    const props = node.properties || {};
    for (const r of node.required || []) if (v[r] === undefined || v[r] === null) emit('GEN_SPEC_FIELD_MISSING', `${at}: missing "${r}"`);
    for (const k of Object.keys(v)) {
      if (props[k]) validate(root, props[k], v[k], at + '.' + k, emit);
      else if (node.additionalProperties === false) emit('GEN_SPEC_FIELD_UNKNOWN', `${at}: unknown field "${k}" (gen would ignore it). allowed: ${Object.keys(props).join(' ')}`);
      else if (node.additionalProperties && typeof node.additionalProperties === 'object') validate(root, node.additionalProperties, v[k], at + '.' + k, emit);
    }
  }
  if (node.anyOf) {
    const reqOnly = node.anyOf.every(b => Object.keys(b).length === 1 && b.required);
    if (reqOnly) {
      if (v && typeof v === 'object' && !node.anyOf.some(b => b.required.every(r => v[r] !== undefined && v[r] !== null)))
        emit('GEN_SPEC_FIELD_MISSING', `${at}: needs ${node.anyOf.map(b => b.required.join('+')).join(' or ')}`);
    } else if (!node.anyOf.some(b => { const e = []; validate(root, b, v, at, (c, m) => e.push(m)); return !e.length; })) emit('GEN_SPEC_TYPE', `${at}: matches none of the allowed forms`);
  }
  if (node.oneOf && !node.oneOf.some(b => b.$ref && /-op$/.test(b.$ref))) {
    const ok = node.oneOf.filter(b => { const e = []; validate(root, b, v, at, (c, m) => e.push(m)); return !e.length; });
    if (!ok.length) {
      // report the findings of the branch whose type fits (one object form among strings), else the type mismatch
      const fit = node.oneOf.map(b => b.$ref ? root.$defs[b.$ref.replace('#/$defs/', '')] : b).find(b => b.type && tOk(b.type, v));
      if (fit) validate(root, fit, v, at, emit); else emit('GEN_SPEC_TYPE', `${at}: expected ${node.oneOf.map(b => (b.$ref ? root.$defs[b.$ref.replace('#/$defs/', '')] : b).type).join(' or ')}, got ${tOf(v)}`);
    }
  }
}

// gen's own refusals that need no game: tool.checkSpec(spec, schema, {target, dir}) -> [{code,msg}]
function checkSpec(spec, schema, o) {
  const out = [], emit = (code, msg) => out.push({ code, msg });
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { emit('GEN_SPEC_TYPE', 'spec: expected a map with name and ops: [..]'); return out; }
  const target = String(o.target || spec.target || '').toLowerCase();
  const tg = schema.properties.target.enum;
  if (!tg.includes(target)) emit('GEN_SPEC_TARGET', `target "${target}": needs --target or spec target: ${tg.join('|')}`);
  // top level, op by op (the op branch is picked by its op name)
  const top = Object.assign({}, schema, { properties: Object.assign({}, schema.properties, { ops: { type: 'array' } }) });
  validate(schema, top, spec, 'spec', emit);
  if (!Array.isArray(spec.ops)) return out;
  spec.ops.forEach((s, i) => {
    const at = `ops[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { emit('GEN_SPEC_TYPE', `${at}: expected a map with op:`); return; }
    const def = typeof s.op === 'string' ? schema.$defs[s.op + '-op'] : null;
    if (!def) { emit('GEN_SPEC_OP_UNKNOWN', `${at}: ${s.op === undefined ? 'no op' : 'unknown op "' + s.op + '"'} (${Object.keys(schema.$defs).filter(k => /-op$/.test(k)).map(k => k.slice(0, -3)).join(' ')})`); return; }
    validate(schema, def, s, `${at} (${s.op})`, emit);
    semantic(s, at, target, o.dir || '.', emit);
  });
  return out;
}
function semantic(s, at, target, dir, emit) {
  const lst = ops.list;
  if ((s.op === 'army' || (s.op === 'card' && s.list !== undefined)) && target === 'goh') emit('GEN_SPEC_TARGET_OP', `${at} (${s.op}): not run on GoH (AS2 armies/ and units/<list>.set layout only); use --target as64|mowas2`);
  if (s.op === 'mission-clone' && target === 'goh') emit('GEN_SPEC_TARGET_OP', `${at} (mission-clone): not run on GoH (AS2 games/<mode>.set layout only); use --target as64|mowas2`);
  if (s.op === 'set') {
    const rowCheck = (r, w) => {
      if (!ops.SET_OPS.includes(r.op)) emit('GEN_SPEC_VALUE', `${w}: row op "${r.op}" must be ${ops.SET_OPS.join('|')}`);
      else if (!r.path) emit('GEN_SPEC_VALUE', `${w}: row for "${r.entity}" has an empty path`);
    };
    if (typeof s.csv === 'string') {
      const f = path.resolve(dir, s.csv);
      if (!fs.existsSync(f)) emit('GEN_SPEC_CSV_MISSING', `${at} (set): csv file ${s.csv} not found next to the spec`);
      else try { ops.csvRows(fs.readFileSync(f, 'utf8')).forEach(r => rowCheck(r, `${at} (set) csv:${r.line}`)); } catch (e) { /* unreadable: the run reports it */ }
    }
    lst(s.rows).forEach((r, i) => {
      if (typeof r === 'string') ops.csvRows(r).forEach(x => rowCheck(x, `${at} (set) rows[${i}]`));
      else if (r && typeof r === 'object' && r.path !== undefined && typeof r.path === 'string' && !r.path) emit('GEN_SPEC_VALUE', `${at} (set) rows[${i}]: empty path`);
    });
  }
  if (s.op === 'squad') lst(s.members).forEach((m, i) => {
    const n = typeof m === 'string' ? +(m.split(':')[1] || 1) : m && typeof m === 'object' ? +(m.n || m.count || 1) : 1;
    if (!(n >= 1)) emit('GEN_SPEC_VALUE', `${at} (squad) members[${i}]: count must be >= 1`);
  });
}

module.exports = { build, checkSpec, validate, FIELDS, NESTED, CODES };
