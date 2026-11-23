// wouldload/classes: what the engine does with each registry 'crash' input, from source (58826db6, read-only clone). Not run in game.
//   cls: LOAD    fatal at game data load (LoadData/ReloadGameData read the file at start or mod change)
//        SPAWN fatal when the entity .def is first read (lazy: ENG-05) = match load / preload / spawn
//        USE     warning at read, dummy substituted, dies only when the item is used
//        LOGGED  warning/skip, no crash path in source
//        UNKNOWN source does not settle it, or vanilla carries the same pattern and runs
//   ERROR_MSG is never skipped (IgnoreErrors is an empty stub, / ENG-01): any ERROR_MSG on a read path is fatal.
//   verdict use (wouldload.js classify): a sdllint finding whose code isHard() and whose include-chain root is an entity def -> SPAWN candidate.
//   A candidate counts toward LIKELY_CRASH unless reach.js proves it ORPHAN (nothing can name the entity). OTHER gives .cls for refcheck codes
//   (only REF_WEAPON_UNKNOWN is a candidate). HARD codes on a set/ root (loadRoot) are wired (TF-15): classify gives them cls LOAD, key 'set:<path>', reach REACHABLE.
//   every HARD cite below was re-read at its line in TF-15 (the eSDL*/iorepository ones hold; BLOCK_END_STRAY cite corrected). re-read, holds; was not re-read.
// Author: Imperator_Aug (ARSENAL, ia-653644d1)
const HARD = {   // ERROR_MSG site exists for the input [V]
  MACRO_UNDEFINED: ' ERROR_MSG("define not found")',
  INCLUDE_MISSING: ' OpenStorage "File not found" ERROR_MSG unless OPEN_OPTIONAL;  CreateParser opens non-optional',
  BOM_UTF16: ' SDL_BOM_ERROR',
  BLOCK_UNCLOSED: ' "Block terminator expected!"',
  BLOCK_END: ',459', BLOCK_END_STRAY: ' "Block start expected!" / :270 "End of SDL file expected" (TF-15: the old :154 cite is ReadKeyword, not a stray "}")', BLOCK_START: ' "Block start expected!"',
  DEFINE_UNCLOSED: ' "Block terminator expected!"',
  CONTROL_BAD: ' "Invalid control block!" / control block start/terminator',
  PARAM_PAREN: ' /  "\')\' required"', PARAM_SPACE: ' "\'(\' required"',
  MOD_NESTED: ' "Nested mods not supported"',
  PLY_MTL_MISSING: ':LoadMaterial 947-966 returns null when .mtl not registered and no .materials (FMT-03); null deref on mesh read',
  ENTITY_TYPE_UNKNOWN: ' ERROR_MSG("unknown entity type") (ENG-02)',
};
const OTHER = {
  // lexical heuristics: INVALID/split tokens are fatal only where a reader consumes them (SDL-05/06/21); vanilla carries `%0`/`10w` shaped hits and runs
  UNREPLACED_PARAM: ['UNKNOWN', 'SDL-21 stays identifier; vanilla construction_generic.inc:52/127/207 has the same %0 pattern and runs'],
  ARITH_BAD: ['UNKNOWN', 'same source as UNREPLACED_PARAM (godnymod eg.def: vanilla pattern)'],
  NUMBER_GLUED: ['UNKNOWN', 'consumed or skipped depends on the reader (SDL-05)'], IDENT_SPLIT: ['UNKNOWN', 'SDL-04'], HASH_COMMENT: ['UNKNOWN', 'SDL-02: INVALID char; fatal if the file is read'],
  TAG_SWALLOWS: ['UNKNOWN', 'SDL-10'], STRAY_OPERATOR: ['UNKNOWN', 'SDL-04'], LEADING_DOT: ['UNKNOWN', 'SDL-05'], NUMBER_SUFFIX: ['UNKNOWN', 'SDL-05'], NUMBER_EXP0: ['UNKNOWN', 'SDL-06'], NEG_HEX: ['UNKNOWN', 'SDL-06'],
  MACRO_CYCLE: ['UNKNOWN', 'recursion depth not bounded in source read'], INCLUDE_CYCLE: ['UNKNOWN', 'same'],
  REF_WEAPON_UNKNOWN: ['USE', 'GetStuff  WARNING "No Stuff found (may lead to crash)", dummy_checker copy; live-confirmed crash on fire/reload (LOG-07)'],
  REF_AMMO_UNKNOWN: ['USE', 'same GetStuff path'],
  REF_ITEM_UNKNOWN: ['USE', 'same GetStuff path'],
  EXTENDER_UNKNOWN: ['LOGGED', ' WARNING_MSG "Extender not found", block skipped (ENG-06)'],
  REF_STUFF_ENTITY_MISSING: ['LOGGED', ' returns nullptr for an unknown name; vanilla has 4 such refs and runs'],
  // read per code (TF-15). refcheck codes below are NOT candidates in wouldload.classify (only REF_WEAPON_UNKNOWN is); cls is the engine behaviour from source
  REF_MODEL_MISSING: ['SPAWN', '{Extension "x"} read with the def:  eSDLReader(name) ->  (OPEN_READ, not optional) ->  ERROR_MSG "File not found" [V path; [I]]'],
  REF_MESH_MISSING: ['SPAWN', 'kinds ply/vol/anm of a model file: .anm  GetResource ->  ERROR_MSG "Resource not found" at model read [V]; .vol   ->  [V]; .ply  ERROR_MSG "read error" [V], when the mesh is first created [I]'],
  REF_ANIM_MISSING: ['LOGGED', 'refcheck kind = boarder seat animation NAME; engine only stores the tag, lookup at play:  unknown name -> no animator, Notify (ends at once), no error [V]; matches vanilla m19 running with it. NOTE: the engine looks up by animation name from the model {anm} blocks, refcheck checks a .anm FILE of that name [I: may differ]'],
  REF_FSM_MISSING: ['LOAD', 'stuff {fsm "x"}: state = title of a set/stuff/_settings *.fsm; not found ->  ERROR_MSG "Unknown fsm state", fatal at LoadStuff [V]'],
  REF_VISION_UNKNOWN: ['SPAWN', 'sensor visor {vision "x"}:  g_visions.Find null -> ERROR_MSG "Vision not found" when the def is read [V]; breed usage passes null without error, not this path'],
};
// lexical codes above stay UNKNOWN on purpose, from the source read (TF-15): the lexer only splits tokens, fatal-or-not depends on the reader slot.
//   UNREPLACED_PARAM: '%' starts an identifier; fatal where a number/string is read ( "Number expected!", "String expected!"), fine in an identifier slot [V]
//   ARITH_BAD: operand read by ReadFloat ( ->) fatal on a non-number; divide by 0 has no check (:346-347) = inf, not an error [V]
//   NUMBER_GLUED/NUMBER_SUFFIX/NUMBER_EXP0/NEG_HEX: number ends at the first foreign char, the rest is an identifier token left in the stream; fatal when the field then closes ("Block terminator expected!") [V], a flag-loop reader may eat it [I]
//   HASH_COMMENT: '#' not in the start table -> SDL_INVALID; fatal only when the reader reaches it (SkipBlock and define body error on INVALID; other readers stop on "..expected") [V]
//   TAG_SWALLOWS: split by the message. "{##x": tag "#x" holds '#', block silently skipped (default skips tagged) = LOGGED, content lost [V]. "{#x" (one '#'): block name swallowed, next ReadIdentifier fails "Identifier expected!" [I]
//   STRAY_OPERATOR/IDENT_SPLIT/LEADING_DOT: extra token left in the stream, same rule as NUMBER_GLUED [I]
//   MACRO_CYCLE/INCLUDE_CYCLE: PushParser has no depth or cycle guard, ReadDirective pushes unconditionally [V]; the outcome (stack/memory exhaustion, process dies) is [I], same as sdlx.js says
const isHard = c => Object.prototype.hasOwnProperty.call(HARD, c);
const classOf = c => isHard(c) ? 'HARD' : (OTHER[c] ? OTHER[c][0] : null);
const entityRoot = f => /^(resource\/)?entity\/.*\.def$/i.test(String(f).replace(/\\/g, '/'));
// data read at game start: set/stuff/** (LoadStuff ) and set/**/*.set roots (ReloadGameData , armies/interactions )
const loadRoot = f => { const k = String(f).replace(/\\/g, '/').toLowerCase(); return /^resource\/set\/stuff\//.test(k) ? !/\.presets$|\.fsm$/.test(k) : /^resource\/set\/.*\.set$/.test(k); };
module.exports = { HARD, OTHER, isHard, classOf, entityRoot, loadRoot };
