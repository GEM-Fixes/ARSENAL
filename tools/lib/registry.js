// registry: ONE table of every linter/checker tool. doctor, build, as2 (and tests) read it; add a new linter HERE.
//   TOOLS: [{name, entry, input, format, mods, game, rc, areas, build, doctor, note}]
//     entry  path rel tools/ ; input = 'mod' (mod folder) | 'game' (game dir) | 'file' (file/dir/log, no mod) | 'multi' (own subcommands)
//     format = accepts --format text|json|sarif (lib/cli) ; mods/game = accepts --mods / --game ; rc = parses --rc/--no-rc (.lintrc)
//     areas  = limits row areas it checks ; build = build.js stage group (lint|ref|loc|mission|pack) or null ; doctor = run by doctor
//     games  = optional list of game ids (lib/games: as64, mowas2, goh) its rules are written for; absent = all three
//     exe    = optional true: the tool takes --exe as64|mowas_2|mowas2|goh (lib/cli parse gives it, or its own parser); absent = no --exe yet
//   IGNORE: tools/<n>/<n>.js that are NOT linters (test enforces: every tools/*/<n>.js is in TOOLS or IGNORE)
//   API: byName(n), names(), forDoctor(game?) (game = id or vfs exe: only the tools whose games include it; no game = all, as before),
//        forGame(game) (every tool for that game), forBuild(group?), rcTools(), entryPath(n), IGNORE, TOOLS, severity(code),
//        severityFromRows(code, lm?), sevDiff(lm?) -> [{code, now, rows}] (lib/limmap classes)
// Author: Imperator_Aug (ARSENAL, ia-66767f76)
const path = require('path');
const T = (name, input, o) => Object.assign({ name, entry: `${name}/${name}.js`, input, format: false, mods: false, game: false, rc: false, areas: [], build: null, doctor: false }, o);
// severity of a finding code for a player of the mod. first match wins. [I] from limits rows and what the code checks;
// crash = load or play stops, silent = feature wrong with no message, cosmetic = works, looks or reads off, review = unranked
const SEVERITY = [
  // check-false audit: warning-class codes that were ranked crash; each names the limits row that says silent.
  // MOV-20 (pivot: wrong steering geometry), INT-04 (undefined call: silent no-op), MIS-24 (map with no mode: skipped with a log line),
  // ENG-33 (boarder anim looked up by name in mdl {anm}, no error), SDL-25 (unknown mod block never applies), FMT-07 (volume on a missing bone dropped).
  // *_MACRO: IDENT_SPLIT / NUMBER_GLUED that come from a %param substituted by a macro (sdllint) [I]
  // REF_ITEM_UNKNOWN: GetStuff logs 'No Stuff found for tags' and hands out a dummy item, the load goes on [V];
  // a mod with such an item in a live squad runs (owner, RobZ 1.31.0 fiat35). what the dummy does when used: [T]
  ['silent', /^(MOV_PIVOT_MISSING|INT_CALL_UNDEFINED|MAP_NO_MODE|REF_ANIM_[A-Z_]+|MOD_NAME|MDL_VOLUME_BONE|REF_ITEM_UNKNOWN|IDENT_SPLIT_MACRO|NUMBER_GLUED_MACRO)$/],
  ['crash', /^(BOM_UTF16|BAD_BYTE|INVALID_CHAR|BLOCK_(END|END_STRAY|START|UNCLOSED)|LIST_(END|START)|STR_(EOF|NEWLINE)|MACRO_(UNDEFINED|CYCLE)|INCLUDE_(MISSING|CYCLE)|DEFINE_UNCLOSED|MAX_DEPTH|MOD_(NESTED|START|UNCLOSED)|CONTROL_BAD|PARAM_(BAD|PAREN|SPACE)|ARGS_CASE|UNREPLACED_PARAM)$/],
  ['crash', /^(IDENT_SPLIT|NUMBER_GLUED|LEADING_DOT|STRAY_OPERATOR|ARITH_BAD|HASH_COMMENT|NUMBER_EXP0|NUMBER_SUFFIX|NEG_HEX|TAG_SWALLOWS)$/],
  ['crash', /^REF_(WEAPON|AMMO|ITEM|MODEL|MESH|FSM|VISION)_/],
  ['crash', /^(ANM|PLY|VOL|DDS|EBM|NET|WAV)_(BAD|TRUNCATED|HEADER|SIGNATURE|VERSION|TABLE|SIZE|INDEX|NO_|NOT_|BONE_LIMIT|VERT_LIMIT|BONEMAP_LIMIT|FORMAT|DX10|CUBE|VOLUME|MTL_MISSING|PART_RANGE|FRAME_INDEX|BONE_INDEX)/],
  ['crash', /^(ENTITY_TYPE_UNKNOWN|PLY_MTL_MISSING|MDL_(BONE_PARAM|BONE_TYPE|ZERO_SPEED)$|DEF_VOLUME_NO_SHAPE|STR_(MDL_MISSING|PLACE_ENTITY|TEAR_ENTITY|FORT_ENTITY)|MOV_(BONE|WHEEL)_RADIUS_ZERO|FONT_MAIN10_MISSING|WARN_FONT_(MAIN10|BINARY)_MISSING|HUM_FSM_|IK_ZERO_SPEED|GEARS_BAD|COLLIDER_IDS_MAX|MAP_(NET_FORMAT|NET_ID_RANGE|PATCH_MISSING)|NET_CELL|MI_(CMD|TERM|HELPER)_UNKNOWN|MODINFO_PARSE|VER_(MISSING|ORDER|RANGE)|REQ_MISSING|STR_CALL_UNDEFINED|KEY_FATAL|CRASH)/],
  ['cosmetic', /^(WARN_)?(PICTURE_MISSING|REF_TEXTURE|REF_SOUND|FONT_|COLOR_|TAG_|NO_TAGS|MIXED_SCRIPT|BARE|TAG_CSLASH|DDS_|EXP_|PLY_BIG|PLY_STRIDE|EBM_MIPMAP|SOUND_MP3|DUP_KEY_SAME|THUNDER|ENV_)/],
  ['silent', /^(WARN_)?(EXTENDER_UNKNOWN|DEAD_KEY|UNKNOWN_KEY|KEY_CASE|BOOL_|ENUM_UNKNOWN|INT_|FLOAT_GOT|VALUE_|STRING_EXPECTED|TIMESPAN_TRUNC|QUANT_FLOAT|DAMAGE_|PATHER_|REF_|CONFLICT_|MPSYNC|MIS_|MI_|WARN_MI|MAP_|WARN_MAP|STR_|HUM_|MOV_|PANEL_|KEYS_|ACTION_|INT_|IA_|SND_|FX_|LOD_|TERM_|VISION_|SPEED_|STRAFE|THRESHOLD|TURNTIME|FOOT_|OVERMATCH|BURN|DUP_KEY$|LNG_OVERRIDES|LNG_FILE_SHADOWS|LNG_PARAM|ENC_)/],
];
const severity = code => { for (const [s, r] of SEVERITY) if (r.test(code)) return s; return 'review'; };
// severity from the limits rows (lib/limmap): the class of the code's limmap entry, else the worst class of its lim rows.
// crash|hang -> crash, silent|desync -> silent, cosmetic -> cosmetic, tool|info|review|unknown -> review. lm = a limmap.load() instance (tests)
const ROWSEV = { crash: 'crash', hang: 'crash', silent: 'silent', desync: 'silent', cosmetic: 'cosmetic' };
const SEVRANK = { crash: 3, silent: 2, cosmetic: 1, review: 0 };
const rowsInfo = (code, lm) => {
  lm = lm || require('./limmap');
  const e = lm.limitOf(code);
  if (!e) return { sev: 'review', known: false };
  if (e.class) return { sev: ROWSEV[e.class] || 'review', known: true };
  let sev = 'review', known = false;
  for (const id of e.lim) { const c = lm.rowClass(id); if (!c) continue; known = true; const s = ROWSEV[c] || 'review'; if (SEVRANK[s] > SEVRANK[sev]) sev = s; }
  return { sev, known };
};
const severityFromRows = (code, lm) => rowsInfo(code, lm).sev;
// codes where severity() and severityFromRows() differ, sorted by code. codes with no class anywhere (entry and rows unclassed) are left out
const sevDiff = lm => {
  lm = lm || require('./limmap');
  const out = [];
  for (const code of lm.codes()) {
    const r = rowsInfo(code, lm), now = severity(code);
    if (r.known && r.sev !== now) out.push({ code, now, rows: r.sev });
  }
  return out;
};
// order = build stage order (lint, ref, loc, mission, pack) then doctor/other
// exe: true = takes --exe: the lib/cli parse users (modinfo, sdllint, keylint, humlint, movlint, fxlint, lnglint, misdiff) and the tools
// with their own parser that take --exe as64|mowas_2|mowas2|goh (game parity wave 2: each source has its '--exe' option). portdiff has none.
// No games limit left: uilint has its GoH tables (tables.js GOH: GHUI-75, GHUI-76, GHUI-251), binhdr takes GoH map.net cell 5 (GHMAP-06);
// both give 0 findings on GoH vanilla (game parity check c-lint2).
const TOOLS = [
  T('modinfo', 'mod', { exe: true, areas: ['VFS'], build: 'lint', doctor: true }),
  T('sdllint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['SDL'], build: 'lint', doctor: true }),
  T('keylint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['SDL', 'KEY', 'MOD'], build: 'lint', doctor: true }),
  T('ialint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['INT'], build: 'lint', doctor: true, needs: 'interaction files' }),
  T('uilint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['UI'], build: 'lint', doctor: true, needs: 'ui files' }),
  T('strlint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['STR'], build: 'lint', doctor: true }),
  T('humlint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['HUM'], build: 'lint', doctor: true }),
  T('movlint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['MOV'], build: 'lint', doctor: true }),
  T('fxlint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['VIS'], build: 'lint', doctor: true }),
  T('expcheck', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['FMT'], build: 'lint', doctor: true, needs: 'game dir' }),
  T('refcheck', 'game', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['ENG', 'DMG', 'HUM', 'MOV', 'VIS'], build: 'ref', doctor: true }),
  T('lnglint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['LOC'], build: 'loc', doctor: true }),
  T('loccover', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['LOC', 'VFS'], build: 'loc' }),
  T('milint', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['MIS', 'MAP'], build: 'mission', doctor: true, needs: 'map/mission files' }),
  T('packer', 'mod', { exe: true, areas: ['VFS', 'SDL'], build: 'pack' }),
  // doctor-only / stand-alone checkers
  T('vfs', 'game', { exe: true, mods: true, game: true, areas: ['VFS'], doctor: true }),
  T('binhdr', 'game', { exe: true, format: true, mods: true, rc: true, areas: ['FMT'], doctor: true }),
  T('conflicts', 'game', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['VFS'], doctor: true, note: 'needs --game + --mods (load-order view)' }),
  T('mpsync', 'multi', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['NET'], doctor: true, note: '--mod <dir> mode in doctor' }),
  T('overdiff', 'mod', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['VFS'] }),
  T('logtriage', 'file', { exe: true, format: true, mods: true, game: true, rc: true, areas: ['LOG', 'NET'] }),
  T('portdiff', 'multi', { areas: ['PORT'] }),
  T('misdiff', 'file', { exe: true, format: true, areas: ['MIS'] }),
  T('drift', 'multi', { exe: true, areas: ['VFS'] }),
];
// not linters: creators, editors, viewers, web/dev tooling, wrappers
const IGNORE = ['testplan', 'gimp', 'unitcard', 'sound', 'soedit', 'workshop', 'armorsim', 'iasim', 'balance', 'bootcheck', 'native', 'roundtrip', 'keyprof', 'shotcrop', 'misgen', 'spmis', 'mapgen', 'rzsys', 'assetsame', 'mapscen', 'valourk', 'covanm', 'wpn', 'artport', 'cards', 'covcheck', 'covlint', 'covreplay', 'firecheck', 'gui', 'ide', 'score', 'unitmod', 'lngsplit', 'lngstd', 'lnglayout', 'cardrename', 'macrostd', 'pricecalc', 'xlate', 'as2', 'edrun', 'donorfit', 'donorpick', 'prove', 'bootloop', 'portfix', 'mapport', 'helmetport', 'mapviz', 'gohsample', 'shapecheck', 'snap', 'as2togoh', 'exever', 'gamediff', 'batch', 'build', 'chains', 'clone-entity', 'rows2scn', 'doctor','entityindex', 'goh2as2', 'golden', 'libapi', 'lng-add', 'mapview', 'modmove',
  'mission-clone', 'modswitch', 'newmod', 'patch-entity', 'place-entity', 'q', 'scaffold', 'statsheet', 'testrun', 'uidrive', 'upgrade', 'wouldload', 'preloadsweep', 'verdiff', 'release-check', 'lng', 'map-clone', 'botrecipe', 'fix', 'check', 'gen', 'testmap', 'unitgroups', 'pairdiff', 'blogkeys', 'doctrine', 'gemindex', 'determ', 'gameprofile', 'limmap', 'nativepass', 'portverdict', 'unitbox', 'portcensus', 'defcheck', 'portlint', 'portasset'];

const byName = n => TOOLS.find(t => t.name === n) || null;
// game filter: game = id or vfs exe (lib/games); unknown throws; null/undefined = no filter
const gameId = g => { if (!g) return null; const id = require('./games').idOf(g); if (!id) throw new Error('registry: unknown game ' + g + ' (as64, mowas2, goh)'); return id; };
const forGame = g => { const id = gameId(g); return TOOLS.filter(t => !id || !t.games || t.games.includes(id)); };
module.exports = { severity, severityFromRows, sevDiff,
  TOOLS, IGNORE, byName, forGame,
  names: () => TOOLS.map(t => t.name),
  forDoctor: g => forGame(g).filter(t => t.doctor),
  forBuild: g => TOOLS.filter(t => t.build && (!g || t.build === g)),
  rcTools: () => TOOLS.filter(t => t.rc).map(t => t.name),
  entryPath: n => { const t = byName(n); return t ? path.join(__dirname, '..', t.entry) : null; },
};
