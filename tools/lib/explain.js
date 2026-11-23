// explain: plain-words card for a finding code. what it means, why the game cares, how to fix it by hand, and which fix-tool fixer (if any) does it.
// Author: Imperator_Aug (ARSENAL, ia-490f56e6)
//   API: explain(code, finding?) -> {code, what, why, impact, severity, limits:[ids], fix:[steps], auto, safe, tag, known, where}
//        auto = tools/fix --only kind (lng|repoint|include|macro|stubmtl) or null ; safe = auto fix is gated (lib/gate reverts a bad edit) and changes no visuals
//        known = false -> honest generic fallback (code not in the table) ; tag [V]/[I] = how sure the text is
//        where = 'file:line' from the finding ({file,line} or {samples:[..]} or {first}) or ''
//   collect(root?) -> Set of every code the front-door tools emit (scan of their sources; used by the test), FIXERS, IMPACT, limitsFor(code)
// entries: SPECIFIC first (exact code), then FAMILIES (regex, first match). severity from lib/registry (one table). limits IDs from lib/limmap, then limits/*.md `chk <tool> CODE` cells.
'use strict';
const fs = require('fs'), path = require('path');
const { severity } = require('./registry');

const IMPACT = {
  crash: 'Crash risk: the game can crash, hang or refuse to load the mod when it reads this.',
  silent: 'Silent fail: the game loads, but this value is ignored or read wrong. No error is shown.',
  desync: 'Multiplayer desync: players get different results and the match splits.',
  cosmetic: 'Cosmetic: something looks, sounds or reads wrong. Gameplay is not affected.',
  review: 'Review: not a definite error. Look at it once and decide.',
  info: 'Info: a note about what the tool did. Nothing to fix.',
};
// fix-tool fixer kinds (tools/fix --only). safe = gated + no visual change. stubmtl writes a placeholder material: mesh shows, but looks plain.
const FIXERS = {
  lng: { safe: true, label: 'merge the .lng with the vanilla file so vanilla strings are kept' },
  repoint: { safe: true, label: 'point the path at the one file that exists (refcheck must agree)' },
  include: { safe: true, label: 'point the include at the one file that exists' },
  macro: { safe: true, label: 'add the include that defines the macro' },
  enc: { safe: true, label: 'resave cp1251 text values as UTF-8 (for as64; the old mowas_2.exe needs cp1251)' },
  asread: { safe: true, label: 'write the file the way the game already reads it (no change in game)' },
  botkeys: { safe: true, label: 'remove bot data keys the bot never reads (no change in game)' },
  lngdup: { safe: true, label: 'remove the earlier copy of a repeated text key; the game already shows the later one' },
  syntax: { safe: false, label: 'rewrite the line the way the game reads it (quote a texture name, join tag strings)' },
  spell: { safe: false, label: 'respell a name the game skips (the game starts to read that line)' },
  stubmtl: { safe: false, label: 'write a placeholder .mtl next to the mesh (mesh loads, looks plain)' },
};
const AUTO = {
  REF_MODEL_MISSING: 'repoint', REF_MESH_MISSING: 'repoint', REF_TEXTURE_MISSING: 'repoint', REF_SOUND_MISSING: 'repoint', REF_WRONG_FOLDER: 'repoint',
  INCLUDE_MISSING: 'include', MACRO_UNDEFINED: 'macro', PLY_MTL_MISSING: 'stubmtl', ENV_PRESET_MISSING: 'repoint',
  STR_NOT_UTF8: 'enc', WARN_STR_NOT_UTF8: 'enc', THRESHOLD_LT1: 'asread', MAP_PLAYERS: 'asread', WARN_KEY_REPEAT: 'asread', KEY_REPEAT: 'asread', WARN_PAREN_STRAY: 'asread', PAREN_STRAY: 'asread', WARN_RICOCHET_CLAMP: 'asread', RICOCHET_CLAMP: 'asread', THUNDER_NO_SOUND: 'asread', BOT_DATA_UNUSED_KEY: 'botkeys', DUP_KEY: 'lngdup', DUP_KEY_SAME: 'lngdup',
  MTL_DIFFUSE_BARE: 'syntax', TAGS_MULTI_STRING: 'syntax', WARN_TAGS_MULTI_STRING: 'syntax',
  MACRO_CASE_MISMATCH: 'spell', KEY_CASE: 'spell', WARN_KEY_CASE: 'spell', MI_KEY_CASE: 'spell', MIS_TEAMKEY_UNREAD: 'spell',
  LNG_OVERRIDES_VANILLA: 'lng', WARN_LNG_FILE_SHADOWS_VANILLA: 'lng', LOC_FILE_REPLACED: 'lng',
};

// [what, why, fix steps, tag?] ; why = what the game does with it ; tag defaults to [V] when a limits row backs the code, else [I]
const S = {
  // ---- SDL text syntax (sdllint): the engine parser has no recovery
  BOM_UTF16: ['The file is saved as UTF-16.', 'The engine reads text files as 8-bit; UTF-16 bytes break the parser at the first character.', ['Open the file in a text editor.', 'Save it as UTF-8 (no BOM) with CRLF line ends.']],
  // ---- crash rules (doctor/crashrules.js): files that load, then crash the game later
  CRASH_OBSTACLE_UNKNOWN: ['An obstacleID names a block not in obstacles.reg.', 'The id becomes 0xff; the game crashes when a tank tries to crush the object (STR-29).', ['Add a block with that name to the mod resource/set/registry/obstacles.reg (copy the nearest vanilla row).', 'Or use a name the table already lists (case-sensitive).']],
  CRASH_OBSTACLE_NO_TABLE: ['obstacleID is used but no obstacles.reg was found.', 'The names could not be checked; an unknown one crashes on crush.', ['Check that the mod or its deps mount resource/set/registry/obstacles.reg.']],
  CRASH_TERRAIN_LAYERS: ['A terrain material has a number of {layer} blocks other than 2.', 'The engine reads the second layer unchecked; the map loads, then crashes at the first crater (MAP-29).', ['Open the .mtl shown.', 'Add a second {layer} (a copy of the first works).']],
  CRASH_FLAG_CLIPS: ['captureflag mode, but the map {Clips} lacks captureflaga or captureflagb.', 'The clipper is null at match start and the game crashes (MIS-62).', ['Add both clips to the map {Clips} (copy from a map that has them).', 'Or drop captureflag.mi from the map.']],
  BAD_BYTE: ['A byte the parser cannot read (control or invalid byte).', 'The tokenizer stops on it; the rest of the file is lost or the load fails.', ['Go to the line shown.', 'Delete or retype the odd character.', 'Save as UTF-8 with CRLF.']],
  INVALID_CHAR: ['A character that is not allowed outside a "quoted string".', 'The parser stops at it.', ['Go to the line shown.', 'Put the value in "quotes" or remove the character.']],
  BLOCK_START: ['A { is missing or in the wrong place.', 'Braces define the data tree; a missing one shifts every block after it.', ['Go to the line shown.', 'Count { and } in that block and add the missing one.']],
  BLOCK_END: ['A } is missing.', 'The block never closes; everything after it is read as its child.', ['Find where the block should end.', 'Add the missing }.']],
  BLOCK_END_STRAY: ['An extra } with no open block.', 'The parser closes a parent block too early or stops.', ['Go to the line shown.', 'Delete the extra }.']],
  BLOCK_UNCLOSED: ['A block opened with { is never closed.', 'The file ends inside a block; the load fails or the tail is lost.', ['Find the block that starts at the line shown.', 'Add its closing }.']],
  LIST_START: ['A ( list is malformed.', 'Lists are parsed strictly; a broken one stops the parser.', ['Go to the line shown.', 'Fix the ( ... ) pair.']],
  LIST_END: ['A ) is missing or extra.', 'Lists are parsed strictly; a broken one stops the parser.', ['Go to the line shown.', 'Match each ( with one ).']],
  STR_EOF: ['A "string" is never closed before the end of the file.', 'The rest of the file is swallowed into one string.', ['Find the string that starts at the line shown.', 'Add the closing ".']],
  STR_NEWLINE: ['A "string" runs over a line end.', 'The engine does not allow line breaks in strings; the parse breaks.', ['Close the string on the same line.']],
  MACRO_UNDEFINED: ['A macro ({name ...} or (name ...)) is used, but no included file defines it.', 'The engine cannot expand it and stops loading the file.', ['Find the vanilla or mod file that defines the macro (define "name").', 'Add an include of that file above the use.', 'Or fix the macro name spelling.']],
  MACRO_CYCLE: ['Two macros expand into each other.', 'The engine has no cycle guard: it recurses until it crashes.', ['Follow the macro names shown.', 'Break the loop so one macro does not use the other.']],
  INCLUDE_MISSING: ['An include points at a file that does not exist in the mod or the game.', 'The engine cannot open it and stops loading the including file.', ['Check the include path spelling and folder.', 'Copy the missing file into the mod, or point the include at the right file.']],
  CASE_CLASH: ['Two files or folders in the same place have names that differ only by capital letters.', 'Windows and the game treat them as one name, so only one of the two is used. On Linux and macOS they are two files, which hides the clash until the mod is moved.', ['Keep one of the two and delete or rename the other.', 'Use lower-case names for mod files.']],
  // the model editor (tools/lib/model/edit, the Models page)
  UNKNOWN_OP: ['The model editor was asked for a change it does not have.', 'Nothing was changed. Usually a part of the editor could not be loaded, or a page and the tools come from different versions.', ['Reload the page.', 'If it stays, look at the editor parts that could not be loaded, shown under the Undo and Save bar.']],
  UNKNOWN_STATE: ['The model editor was asked for a view of the model it does not have.', 'That panel stays empty. Usually a part of the editor could not be loaded, or a page and the tools come from different versions.', ['Reload the page.', 'If it stays, look at the editor parts that could not be loaded, shown under the Undo and Save bar.']],
  LOSS_CHECK_FAILED: ['The check that compares a saved file with the one it replaces could not read one of them.', 'The save list cannot say whether something in that file would be lost.', ['Open the file named in the message and check it reads as a model file.', 'Keep a copy of the old file before you write over it.']],
  LINTER_FAILED: ['One of the file checks (binhdr or expcheck) did not run.', 'Its findings are missing, so a broken file could pass unseen.', ['Run the same check by hand from the toolchain page.', 'Make sure the tools folder is complete.']],
  NO_SKELETON: ['The model file has no Skeleton block.', 'The game builds every model from its skeleton; without one the model cannot load and the game stops.', ['Add a Skeleton with at least one bone, or start from a template on the Models page.']],
  VOLUME_NO_BONE: ['A volume (hit box) is not tied to any bone.', 'The game attaches each volume to a bone; one without a bone does not move with the model or is refused at load.', ['Give the volume a bone on the Volumes tab, or delete it.']],
  PLY_ERROR: ['A mesh file (.ply) could not be read.', 'The model shows nothing or the game stops when it loads that mesh.', ['Check the file is a real game mesh and not cut short.', 'Export or import the mesh again.']],
  VOL_ERROR: ['A collision shape file (.vol) could not be read.', 'Shots and contact pass through the part, or the game stops while loading it.', ['Check the file is a real game volume and not cut short.', 'Make the polyhedron volume again from its mesh.']],
  ANM_ERROR: ['An animation file (.anm) could not be read.', 'The animation does not play, or the game stops when the model loads it.', ['Check the file is a real game animation and not cut short.', 'Save the animation again from the Animation tab.']],
  REF_DISK_PATH: ['The model names a file by a full path on this computer (such as C:\\...).', 'The game only looks inside its own resource folders, so on any other computer the file is not found.', ['Use a name relative to the model folder or to resource/.', 'Copy the file into the mod next to the model.']],
  REF_MISSING: ['The model names a file that is in neither the mod nor the game.', 'The game cannot open it and stops loading the model, or the part shows nothing.', ['Check the spelling of the name.', 'Copy the missing file into the mod, or point the model at a file that exists.']],
  PLATFORM_UNSUPPORTED: ['This action is not available on this operating system.', 'The game and its editor run on Windows; the tool cannot start or reach them here.', ['Run this step on Windows.', 'The other tools (check, build, pack, compare) work on this system.']],
  INCLUDE_CYCLE: ['A file includes itself (directly or through others).', 'There is no depth guard: the game process dies on load.', ['Follow the include chain shown.', 'Remove the include that closes the loop.']],
  // lib/lnginc (.lng include reader, LOC-21; lngsplit reports these codes as they are)
  INCLUDE_DEPTH: ['A text file\'s includes nest more than 32 levels deep.', 'ARSENAL stops reading the chain there, so the keys of the deeper files are not checked; such deep nesting is almost always an include loop.', ['Follow the include chain shown.', 'Flatten it, or remove the include that loops back.'], 'I'],
  INCLUDE_FATAL: ['A text file named by an include cannot be read as text (for example it is saved as UTF-16).', 'Its keys are not read, so the game may show missing text where they are used.', ['Open the file named in the message.', 'Save it as UTF-8 (the .lng rule) and check again.'], 'I'],
  DEFINE_SKIPPED: ['A text file holds a (define ...) line.', 'ARSENAL does not expand defines in text files, so any keys a define would make are not checked here.', ['Nothing to do if the text shows in game.', 'If keys are missing, write them out in the file instead of a define.'], 'I'],
  DEFINE_UNCLOSED: ['A define block is never closed.', 'Everything after it becomes part of the macro body.', ['Add the closing } of the define.']],
  MOD_NESTED: ['A {mod ...} block is inside another one.', 'mod blocks cannot nest; the patch fails to load.', ['Close the first {mod} block before the next one starts.']],
  MOD_START: ['A {mod ...} block header is malformed.', 'The patch block is not recognised; load fails.', ['Fix the block header to {mod "name" ...}.']],
  MOD_UNCLOSED: ['A {mod ...} block is never closed.', 'The rest of the file is read as part of the patch.', ['Add the closing }.']],
  MOD_NAME: ['A {mod "name"} block names a mod that is not loaded.', 'The block is skipped when that mod is not loaded; usually harmless (common in shared files).', ['Use the exact mod folder name, or remove the block.']],
  CONTROL_BAD: ['A {##...} control line is malformed.', 'The preprocessor stops on it.', ['Fix the control line syntax.']],
  PARAM_BAD: ['A macro parameter (%name) is malformed.', 'Macro expansion fails.', ['Fix the parameter name.']],
  PARAM_PAREN: ['A macro parameter is followed by a stray (.', 'Macro expansion fails.', ['Fix the brackets around the parameter.']],
  PARAM_SPACE: ['A macro parameter contains a space.', 'Macro expansion fails.', ['Remove the space or quote the value.']],
  ARGS_CASE: ['A macro is called with a different letter case than its define.', 'Macro names are case-sensitive here; the call fails.', ['Use the same case as the define.']],
  UNREPLACED_PARAM: ['A %param was left in after macro expansion.', 'The literal %param is read as data and breaks the parse.', ['Pass that parameter in the macro call, or remove it from the macro body.']],
  IDENT_SPLIT: ['A name is split by a character the parser treats as a break.', 'It becomes two tokens and the line no longer parses.', ['Quote the name or remove the character.']],
  NUMBER_GLUED: ['A number runs straight into letters (like 12abc).', 'The tokenizer cannot split it; the parse breaks.', ['Add a space, or quote the value.']],
  LEADING_DOT: ['A number starts with a dot (like .5).', 'The engine tokenizer does not read it as a number.', ['Write 0.5 instead of .5.']],
  STRAY_OPERATOR: ['An operator (+ - * /) where a value is expected.', 'The parser stops.', ['Remove it or finish the expression.']],
  ARITH_BAD: ['An arithmetic expression the engine cannot evaluate.', 'The value is not computed; the parse may stop.', ['Simplify it to a plain number.']],
  HASH_COMMENT: ['A # comment. The engine uses ; for comments.', 'The # text is read as data and breaks the line.', ['Change # to ;.']],
  NUMBER_EXP0: ['A number with an empty exponent (like 1e).', 'The engine cannot read it.', ['Write the full number.']],
  NUMBER_SUFFIX: ['A number with a letter suffix (like 1.0f).', 'The engine tokenizer does not accept suffixes.', ['Remove the suffix.']],
  NEG_HEX: ['A negative hex number.', 'The engine cannot read it.', ['Write the value in decimal.']],
  TAG_SWALLOWS: ['An unclosed <tag> in a string swallows the text after it.', 'The parser may read later lines as part of the string.', ['Close the tag.']],
  TAG_UNCLOSED: ['A text tag (like <color ...>) is never closed.', 'The rest of the string shows in that style or the tag shows as text.', ['Add the closing tag.']],
  TAG_STRAY: ['A closing text tag with no opener.', 'Shows as raw text.', ['Delete it.']],
  NO_TAGS: ['A .lng file has no {tags root.', 'The engine finds no strings in it; every key shows as its raw name.', ['Wrap the entries in {tags ... }.']],
  DUP_KEY: ['The same key is set twice in one block with different values.', 'Only one wins (usually the last); the other is silently ignored.', ['Delete the line you do not want.']],
  DUP_KEY_SAME: ['The same key is set twice with the same value.', 'Harmless duplicate.', ['Delete one of the two lines.']],
  UNKNOWN_KEY: ['A key the engine does not read in this block.', 'It is ignored without an error, so the setting has no effect.', ['Check spelling and letter case against vanilla.', 'Move it to the block that reads it, or delete it.']],
  DEAD_KEY: ['A key the engine reads but never uses in this place.', 'It has no effect.', ['Delete it, or move it to where it is used.']],
  KEY_CASE: ['A key with the wrong letter case.', 'Keys are case-sensitive; the key is ignored.', ['Use the vanilla spelling.']],
  KEY_FATAL: ['A key whose value the engine treats as fatal when wrong.', 'Loading the entity fails.', ['Fix the value to the vanilla form.']],
  KEY_REPEAT: ['A key repeated where only one is allowed.', 'One of them is ignored.', ['Keep one line.']],
  ENTITY_TYPE_UNKNOWN: ['An entity uses a class (type) the engine does not know.', 'The entity cannot be created; spawning it can crash the game.', ['Use a vanilla class name (look at a similar vanilla .def).']],
  ENTITY_REDEFINITION: ['Two files define the same entity name.', 'Only one wins; which one depends on load order.', ['Rename one of them, or delete the copy you do not want.']],
  EXTENDER_UNKNOWN: ['An extender name the engine does not know.', 'The extender is skipped silently.', ['Use a vanilla extender name.']],
  ENUM_UNKNOWN: ['A value that is not one of the allowed words for this key.', 'The engine uses a default instead, without an error.', ['Pick one of the words vanilla uses for this key.']],
  BOOL_BAD_TOKEN: ['A yes/no key has a value that is not a yes/no word.', 'Read as false (or default) silently.', ['Use 1 or 0 (or the vanilla word).']],
  BOOL_NO_IS_TRUE: ['A yes/no key is written as "no", which the engine reads as true.', 'Does the opposite of what was meant.', ['Use 0 for false.']],
  FLOAT_GOT_NONNUM: ['A number key holds text.', 'Read as 0 silently.', ['Write a number.']],
  STRING_EXPECTED: ['A text key holds something that is not a string.', 'Read wrong or ignored.', ['Put the value in "quotes".']],
  VALUE_MISSING: ['A key has no value.', 'Ignored or read as 0.', ['Add the value.']],
  VALUE_SURPLUS: ['A key has more values than it reads.', 'The extra values are ignored.', ['Remove the extra values.']],
  TIMESPAN_TRUNC: ['A time value with more precision than the engine keeps.', 'It is rounded silently.', ['Round it yourself so the result is what you expect.']],
  QUANT_FLOAT: ['A count is written with a fraction.', 'The fraction is dropped silently.', ['Write a whole number.']],
  ENC_BOM: ['The file starts with a byte order mark (BOM).', 'Some engine readers see the BOM as text.', ['Save without BOM.']],
  ENC_UTF8: ['Text is not valid UTF-8.', 'Strings show as boxes or ? in game.', ['Save the file as UTF-8.']],
  MIXED_SCRIPT: ['A string mixes Latin and Cyrillic letters that look the same.', 'Searches and keys do not match; text may look fine but be wrong.', ['Retype the word in one alphabet.']],
  PAREN_STRAY: ['A ( or ) with no partner.', 'The parser loses track of lists; the line or file fails.', ['Go to the line shown.', 'Delete the extra bracket or add its partner.']],
  BAD_FILEID: ['A binary file has the wrong file id in its header.', 'The engine rejects the file.', ['Re-export the file, or copy a working one.']],
  EBM_SDL: ['A .ebm model file is actually text (SDL), not binary.', 'The engine expects binary here and cannot load it.', ['Export the model as binary .ebm, or use the .mdl text form.'], 'I'],
  PLY_BIG_OBSOLETE: ['A mesh uses the old big-mesh layout.', 'Older layout; may load wrong in this game version.', ['Re-export the mesh with a current exporter.'], 'I'],
  STUFF_KEY_MISSING: ['An inventory (stuff) file is missing a key it needs.', 'The item is skipped or has no name/picture.', ['Compare with a vanilla stuff file and add the key.'], 'I'],
  STUFF_STRAY_FILE: ['A file in the stuff folder that nothing uses.', 'Harmless, but it may be a misplaced file.', ['Move it to where it belongs, or delete it.'], 'I'],
  // ---- refs (refcheck)
  REF_MODEL_MISSING: ['A .mdl model path points at a file that does not exist.', 'The entity cannot build its model; spawning it can crash the game.', ['Check the path spelling and folder.', 'Copy the model into the mod, or point at an existing one.']],
  REF_MESH_MISSING: ['A mesh (.ply) path points at a file that does not exist.', 'The model fails to build; the game can crash on spawn.', ['Check the path, or copy the mesh into the mod.']],
  REF_TEXTURE_MISSING: ['A texture path points at a file that does not exist.', 'The surface shows as a default or missing texture.', ['Check the path, or copy the texture into the mod.']],
  REF_SOUND_MISSING: ['A sound path points at a file that does not exist.', 'The sound is silent.', ['Check the path, or copy the sound into the mod.']],
  REF_WRONG_FOLDER: ['The file exists, but in another folder than the path says.', 'The engine looks only where the path says, so it is treated as missing.', ['Fix the folder part of the path.']],
  REF_ANIM_MISSING: ['An animation file is missing.', 'The unit skips that animation; mods like RobZ ship with some of these and run fine.', ['Copy the .anm into the mod or fix the path.']],
  REF_FSM_MISSING: ['A state-machine (fsm) file is missing.', 'The unit has no behaviour states; can crash on spawn.', ['Fix the path to the fsm file.']],
  REF_WEAPON_UNKNOWN: ['A weapon name that no loaded file defines.', 'The unit spawns without it or the game crashes when it is used.', ['Use an existing weapon name, or add the weapon file to the mod.']],
  REF_AMMO_UNKNOWN: ['An ammo name that no loaded file defines.', 'The weapon has nothing to fire; can crash when it fires.', ['Use an existing ammo name, or add it to the mod.']],
  REF_ITEM_UNKNOWN: ['An item name that no loaded file defines.', 'The game logs a warning and puts a dummy item in the slot; the real item is missing.', ['Use an existing item name.']],
  REF_VISION_UNKNOWN: ['A vision preset that is not defined.', 'The unit uses no vision or crashes on spawn.', ['Use a vanilla vision name.']],
  REF_STUFF_ENTITY_MISSING: ['An inventory (stuff) line names an entity that does not exist.', 'The item is skipped silently.', ['Fix the entity name.']],
  REF_FILLING_CYCLE: ['Ammo fillings refer to each other in a loop.', 'The loader can loop or skip the ammo.', ['Break the loop.']],
  PICTURE_MISSING: ['An icon or picture file is missing.', 'The icon shows blank.', ['Add the picture to the mod or fix the path.']],
  FILE_MISSING: ['A referenced file is missing.', 'The game skips it or fails, depending on who reads it.', ['Add the file or fix the path.']],
  // ---- binary assets
  PLY_MTL_MISSING: ['A mesh names a material (.mtl) that does not exist.', 'The model fails to load; the game can crash on spawn.', ['Copy the .mtl from the source game or mod.', 'Or let fix write a placeholder .mtl (mesh loads, but looks plain).']],
  PLY_VERT_LIMIT: ['The mesh has more vertices than the engine allows per part.', 'The engine cannot load it.', ['Split or reduce the mesh in your 3D tool and re-export.']],
  PLY_BONEMAP_LIMIT: ['A mesh part uses more bones than the engine allows.', 'The engine cannot load it.', ['Split the part so each uses fewer bones.']],
  ANM_BONE_LIMIT: ['An animation uses more bones than the engine allows.', 'The engine cannot load it.', ['Reduce the bones and re-export.']],
  DDS_FORMAT: ['A texture in a DDS format the engine does not read.', 'The texture is blank or the game errors.', ['Re-save as DXT1/DXT5 (or the vanilla format).']],
  DDS_DX10: ['A DDS texture with the DX10 header.', 'The engine cannot read DX10 DDS.', ['Re-save without the DX10 header (legacy DDS).']],
  // lib/model/ddsenc.js, lib/model/scenecache.js (tool faults, not mod data)
  DDSENC_SIZE: ['A picture could not be written as a game texture: its size is not allowed.', 'Nothing is written. Game textures need a width and a height of at least 1, and enough pixel data for that size.', ['Give the picture a valid size and run the step again.', 'If a tool chose the size, report it with the map or picture name.']],
  SCENECACHE_TARGET: ['A model was asked for without saying which game it is for, or for the wrong game.', 'Nothing is loaded. The tools never guess the game, because AS64, MoW:AS2 and Gates of Hell read models differently.', ['Pick the game (AS64, MoW:AS2 or Gates of Hell) and run the step again.']],
  SCENECACHE_GAME: ['The game folder for this model was not found.', 'Nothing is loaded, so no model can be shown or drawn.', ['Set the game folder on the Settings page.', 'Run the step again.']],
  // ---- mod.info / vfs
  MODINFO_PARSE: ['mod.info cannot be parsed.', 'The launcher cannot read the mod; it does not show or load.', ['Fix the mod.info syntax (compare with a working mod).']],
  MOD_REQUIRE_MISSING: ['mod.info requires a mod that is not installed.', 'The mod does not load.', ['Install the required mod, or remove the require.']],
  MOD_NOT_MOUNTED: ['The mod is not mounted (not in the active mod list).', 'Nothing in it is read by the game.', ['Enable the mod in the launcher, or check the folder name.']],
  MOD_VERSION: ['mod.info version range does not match the game.', 'The mod is hidden or refused in this game version.', ['Set the version range to the game version.']],
  MOD_MODE: ['The mod mode (single/multi) is set so this mod does not load here.', 'The mod is skipped.', ['Set the mode you want in mod.info.']],
  MOD_DUP_FOLDER: ['Two mod folders have the same name.', 'Only one is mounted.', ['Rename or remove one.']],
  MOD_WORKSHOP_COPY: ['The mod is a copy of a Workshop mod.', 'Both may load and fight each other.', ['Keep one copy.']],
  WARN_LOOSE_SHADOWS_PAK: ['A loose file replaces a file inside a pak of the same mod.', 'The loose file wins; the pak copy is never read.', ['Delete the one you do not want.']],
  CONFLICT_FILE_OVERRIDES: ['This mod replaces a whole file another mod also changes.', 'Only one mod\'s version is used; the other mod\'s change is lost.', ['Turn the file into a {mod} patch, or set the load order on purpose.'], 'I'],
  CONFLICT_KEY_OVERRIDDEN: ['A key this mod sets is set again by a later mod.', 'This mod\'s value is lost.', ['Check the load order.'], 'I'],
  // ---- localisation
  LNG_OVERRIDES_VANILLA: ['A mod .lng file replaces a vanilla .lng file whole.', 'Every vanilla string not in the mod copy disappears (shows raw key names).', ['Merge: keep the vanilla lines and add yours.', 'Or put your strings in a new .lng file with its own name.']],
  WARN_LNG_FILE_SHADOWS_VANILLA: ['A mod .lng file has the same name as a vanilla one and hides it.', 'Vanilla strings not in the mod copy show as raw keys.', ['Merge with vanilla, or rename your file.']],
  LOC_FILE_REPLACED: ['A localisation file replaces the vanilla one.', 'Vanilla strings not in the mod copy are lost.', ['Merge with vanilla, or rename your file.']],
  LNG_NOT_UTF8: ['A .lng file is not UTF-8.', 'Strings show as boxes or garbage.', ['Save the .lng as UTF-8.']],
  LNG_KEY_NEW: ['A new string key the game does not have yet.', 'Fine, as long as something uses it.', ['Nothing, unless it is a typo of a vanilla key.'], 'I'],
  LOC_NAME_MISSING: ['A unit has no name string.', 'The unit name shows as a raw key.', ['Add the name key to the mod .lng.']],
  LOC_INFO_MISSING: ['A unit has no info string.', 'The info card is blank or a raw key.', ['Add the info key to the mod .lng.']],
  WARN_LNG_PARAM_MISMATCH: ['A translation has different {params} than the source string.', 'The game shows the wrong number or a raw {param}.', ['Make the {params} match the source.']],
  // ---- later additions: sdllint/rawchecks.js, keylint/chkkey.js, refcheck/refcheck.js
  STUFF_FROM_SELF: ['A {from "tags"} line in a stuff file picks tags that this same file name carries, and the file sorts before its base.', 'The lookup finds the file itself and the game exits with an access violation at load, with no log line.', ['Name the {from} by the base file tags.', 'Do not name a clone <x>.<base>.']],
  STUFF_DAMAGE_NUMBER: ['A weapon in a stuff file has {damage} followed by a number.', 'damage takes an effect type (damage blastwave); a number is a fatal load error.', ['Change it to an effect type, or use projectile keys for numbers.']],
  DDA_DISABLED_BLOCK: ['A {## disabled block sits in multiplayer.set or breed.set.', 'Normal readers skip it, but the DDA readers only flag it, so it is not really removed.', ['Delete the block, or comment it out with ;.']],
  MACRO_CASE_MISMATCH: ['A macro is used with different letter case than the one it was defined with.', 'Names are case-sensitive, so "Armor" is not "armor" and the macro is not found.', ['Write the name exactly as defined.']],
  MTL_DIFFUSE_BARE: ['A material has {diffuse name} with a bare word instead of a quoted string.', 'The map fails to load with "String expected!".', ['Quote the texture name: {diffuse "name"}.']],
  SELECT_NO_CATCHALL: ['Every group in select.set has select terms and none is a late catch-all.', 'A contact that matches no group is never attacked.', ['Add a last {group} without {select}, or a group with {select {in_range m}}.']],
  AMMO_RULE_GAP: ['An ammo class in ammo.set has no rule, or only in_bush/in_cover blocks and no plain block.', 'First match wins and the engine catch-all has priority -1, so those targets are never shot at (silent).', ['Add a plain rule for the class, for example {"bullet"}.']],
  TERRAIN_EFFECT_UNKNOWN: ['A terrain material in terrains.set names an {effect} that has no block in set/interaction_terrain/effects.set.', 'The game logs "Unknown terrain effect" and the stock build then crashes with a null call when something hits that ground.', ['Add the effect block to effects.set, or fix the effect name.']],
  CARD_VEHICLE_MISSING: ['A crewed card names a vehicle that has no .def on the mount.', 'The vehicle is not created, and the crew step crashes the match when the card is bought.', ['Add the entity to the mod, or fix the name in the card.', 'Do not leave a card for a mod that is switched off.']],
  ENV_PRESET_MISSING: ['An environment preset name has no file set/environment/<name>.set.', 'The blend does nothing (command) or defaults are used (map); no error is shown.', ['Add the preset file, or fix the name.']],
  SOUND_LOUDNESS_MISSING: ['A mod sound.set replaces the whole file but lacks a loudness name that is used, or "default".', 'An unknown name reads stale memory, which can crash the game.', ['Keep every loudness name in use plus default in your sound.set.']],
  // ---- mission / map
  MAP_NO_MODE: ['A multiplayer map has no game mode.', 'The map does not show for that mode; it does not crash the game.', ['Add a mode block (compare with a vanilla map).']],
  MAP_PATCH_MISSING: ['A map patch file is missing.', 'The map can crash on load.', ['Add the file or remove the reference.']],
  // ---- multiplayer
  LOG_OOS: ['The log shows an out-of-sync (OOS) event.', 'Players disagree on game state; the match splits.', ['Make sure all players have the exact same mod files (mpsync).']],
  // ---- fix tool outcomes
  FIX_MODINFO: ['Fix rewrote the version lines in mod.info.', 'A mod whose MinGameVersion/MaxGameVersion do not match the game is switched off and hidden from Options > Mods. Fix set them for the target you picked (as64, classic or mowas2). The message says what changed.', ['Copy the fixed mod.info over the old one (or install the fixed folder).', 'Start the game, tick the mod in Options > Mods and press Apply.'], 'V'],
  FIX_MODINFO_UNREADABLE: ['mod.info has no {Mod ...} block, so Fix could not change its version lines.', 'Fix only edits a mod.info it can read. A damaged one is left alone.', ['Make a new mod with the Make page and copy its mod.info here.', 'Put your Name and Desc lines back in it, then run Fix again.'], 'V'],
  BAD_EXE: ['The --exe value names no game this tool knows.', 'The tool reads the files of one game: as64, mowas_2 (also written mowas2) or goh. Any other word stops it before it reads anything.', ['Run it again with --exe as64, --exe mowas_2 or --exe goh, or leave --exe out for AS64.'], 'V'],
  EXP_GOH_BASIS: ['On Gates of Hell the exporter checks use the AS2 rules.', 'The model and texture limits of the AS2 exporter (FMT-18 to FMT-21) were applied to GoH files. The GoH readers match the AS2 ones in the game, but the GoH exporter limits are not in the notes, so a finding here may not hold on GoH.', ['Nothing to do for this note. Read each finding with it in mind; check a doubtful one in the GoH editor.'], 'I'],
  FIX_MODINFO_DEP_BLOCKED: ['A required mod does not load on this game, so fixing this mod\'s version lines alone will not let it load.', 'The game leaves out a mod whose Require names a mod that is missing or switched off on that game. Fix only rewrote this mod\'s own mod.info; the required mod stays as it is. The message names it and says why it does not load.', ['Install the required mod, or fix its own mod.info (run Fix on it with the same target).', 'Tick both mods in Options > Mods and press Apply, then run Check again.'], 'V'],
  FIX_GOH_FOLDER_NAME: ['On Gates of Hell this mod folder name is not allowed, so the game never loads the mod.', 'Gates of Hell skips a mods/ folder whose name has a space, a letter outside plain English, or one of these signs: < > + ( ) [ ] { } ! @ # $ % ^ & * - = ; : \\ | \' ". It only writes "invalid mod folder name" in game.log (GHVFS-27). Fix never renames your source folder.', ['Rename the folder with letters, digits and _ only (for example my_mod instead of my-mod).', 'Change any {Require} in other mods that names the old folder.', 'Run Fix again on the renamed folder.'], 'V'],
  FIX_OUT_REFUSED: ['The output folder was refused.', 'Writing there could change the original mod or the game install.', ['Choose a new folder outside the mod and outside the game (or a new mods/<name> folder).']],
  FIX_REFCHECK_FAILED: ['refcheck did not finish, so path fixes were skipped.', 'Without refcheck the tool cannot prove a new path is right.', ['Check the game folder setting.', 'Run Check again and read its errors.']],
  FIX_EDIT_CONFLICT: ['Two fixes want to change the same file.', 'Only the first is applied this time.', ['Apply again into a new folder to get the rest.']],
  FIX_GATE_REVERTED: ['A fix was undone because the result did not pass the safety check.', 'The edit would have added a new error.', ['Fix this one by hand (see the steps above).']],
  FIX_ENC_UTF8: ['Fix resaved text values in this file as UTF-8.', 'as64 reads text values as UTF-8. Text saved in the old Windows Cyrillic code page (cp1251) shows as broken characters. Only the quoted values changed; comments keep their bytes.', ['Open the fixed file and check the text reads right.', 'For the old mowas_2.exe keep the original file: it reads cp1251 (run Fix with target classic).'], 'I'],
  FIX_ENC_AMBIGUOUS: ['Fix did not resave this text, because it does not read as Cyrillic cp1251.', 'The bytes may be another code page (such as Western cp1252). Converting them as cp1251 would write wrong letters.', ['Open the file in an editor that shows the text right.', 'Save it as UTF-8 there.'], 'I'],
  FIX_SPELLING: ['Fix respelled a name so the game reads the line.', 'The game compares these names exactly. With the old spelling the line was skipped; now it takes effect, so the mod may behave differently than before.', ['Test the unit, map or game mode that uses this file.', 'If the old behaviour was what you wanted, delete the fixed file from the patch folder.'], 'I'],
  FIX_SPELL_AMBIGUOUS: ['Fix did not respell this name, because more than one spelling is possible.', 'Picking the wrong one could switch on a line you did not mean.', ['Read the message for the spellings found.', 'Change the name by hand to the one you mean.'], 'V'],
  FIX_SYNTAX: ['Fix rewrote one line the way the game reads it.', 'A texture name without quotes or tags split over several strings is read wrong or dropped. The new line says what the old one meant.', ['Check the unit in the game: its texture or tags now apply.'], 'I'],
  FIX_ASREAD: ['Fix wrote the place the way the game already reads it.', 'The game changes this value when it reads the file (it clamps or rounds it), or it ignores the line (an earlier copy of a repeated key, a stray bracket, a thunder with no sound). The file now shows what the game really uses. Nothing changes in the game.', ['Nothing to do.'], 'V'],
  QUARANTINE_REFUSED: ['Quarantine refused to remove this entity.', 'Removing it could break something that refers to it.', ['Fix the entity by hand.']],
  // ---- GX-help: plain cards for codes that used to get a family/generic card. Meaning read from the tool that emits each code (path in the comment).
  // modinfo/modinfo.js (VFS-19, PORT-48, VFS-47): a version gate failure HIDES the mod; it does not crash the game
  VER_MISSING: ['mod.info has no MinGameVersion or no MaxGameVersion (or one is empty).', 'The game treats a mod with an empty version range as made for an unsupported version. It switches the mod off, does not show it in Options > Mods and writes "was disabled: Unsupported game version" in game.log. Nothing crashes (VFS-19, PORT-48).', ['Open mod.info in Notepad (it is plain text).', 'Classic mod (old 3.262 data): add {MinGameVersion "3.262"} and {MaxGameVersion "3.262"} inside the root block.', 'Enhanced mod (made for as64): add {MinGameVersion "3.301"} and {Require "as64+"}.', 'Save, start the game, tick the mod in Options > Mods and press Apply.'], 'V'],
  VER_RANGE: ['The game version is outside the MinGameVersion..MaxGameVersion range in mod.info.', 'At start the game compares its version with the range. Outside the range the mod is switched off and hidden ("Unsupported game version"). A Classic mod must have 3.262 inside its range; a mod with MinGameVersion 3.301 or more is Enhanced-only. Nothing crashes.', ['Open mod.info in Notepad.', 'Classic mod: {MinGameVersion "3.262"} {MaxGameVersion "3.262"}.', 'Enhanced mod: {MinGameVersion "3.301"} (no upper limit is checked).', 'Restart the game and tick the mod again.'], 'V'],
  VER_ORDER: ['MinGameVersion is higher than MaxGameVersion.', 'No game version fits a range like that, so the mod can never load. The game does not warn; the mod just stays hidden.', ['Swap the two numbers in mod.info so Min is the lower one (for example 3.262 and 3.262).'], 'V'],
  REQ_MISSING: ['mod.info requires a mod folder that is not in the same mods folder.', 'A {Require "name"} line names a mod this one needs. If that mod is not installed (and active) this mod is not loaded either.', ['Install the required mod into the same mods folder and tick it too.', 'Check the spelling: Require uses the folder name, not the title.', 'Or delete the Require line if the mod does not really need it.'], 'I'],
  WARN_MOD_MODERN: ['This is an Enhanced-only mod (MinGameVersion 3.301 or higher).', 'The game loads it only in Enhanced mode, that is with as64+ in the active mod list. In Classic mode it is hidden. No upper version is checked for such mods.', ['Nothing to fix if you meant an Enhanced mod.', 'For a Classic mod write {MinGameVersion "3.262"} {MaxGameVersion "3.262"} instead.'], 'V'],
  WARN_REQ_BUILTIN: ['The mod requires as64+, the built-in Enhanced mod.', 'as64+ ships inside the game (as64/plus), not in the mods folder, so it is not looked for there. It always loads before player mods (VFS-47).', ['Nothing to do.', 'Do not make a folder called as64+ in mods: the game drops it.'], 'V'],
  DELETE_PREFIX: ['A Delete line in mod.info does not start with resource/.', 'Delete hides a vanilla file from the game. The path is matched from the game root, so without resource/ it matches nothing and the vanilla file stays in use.', ['Write the path as {Delete "resource/set/..."} (full path from resource/).'], 'I'],
  WARN_NOT_MOD: ['A folder in mods has no mod.info file.', 'The game treats only folders with a mod.info as mods. This folder is ignored: nothing in it is loaded.', ['If it should be a mod, add a mod.info (Make page: new mod).', 'Look for one folder level too many: mods/MyMod/MyMod/mod.info must be mods/MyMod/mod.info.', 'If it is a backup, move it out of the mods folder.'], 'V'],
  NOT_MOUNTED: ['The checked mod is not active for this check.', 'Two causes: its mod.info has no MinGameVersion or MaxGameVersion, so the game drops it (PORT-48); or the folder is not under <game>/mods with a mod.info. Check still reads its files as a plain folder, but cannot say how they combine with other mods, and multiplayer sync is skipped.', ['Read the NOT_MOUNTED line: it names the cause.', 'Add the version lines to mod.info (see the VER_MISSING card).', 'Or install the mod into the game mods folder (Play page) and check again.'], 'V'],
  LOADS_STATIC: ['Verdict: no known crash pattern was found by reading the files.', 'The check did not run the game. It means "no crash class we know of", not "it works". Silent problems (ignored values, wrong looks, wrong numbers) can still be there.', ['Play it: start a quick skirmish with the mod on and use what you changed.', 'Afterwards read game.log (Logs page).'], 'V'],
  FIX_REFCHECK_FAILED: ['The path checker (refcheck) did not finish, so every path fix was skipped.', 'Fix changes a path only when the checker proves the new file exists. Without its answer it changes nothing. Usual causes: a mod.info the game refuses (wrong version range: Fix repairs that first, then run Fix again), a missing required mod, the game folder is not found, the mod is not active (NOT_MOUNTED), or the run ran out of time or memory.', ['Set the game folder at the top of the page.', 'Run Check on the mod and read its first lines.', 'Run Fix again.'], 'V'],
  FIX_REPOINT_AMBIGUOUS: ['A missing file has more than one file of the same name it could point at, so Fix did not guess.', 'Picking the wrong one would load the wrong model, texture or sound. The candidates are listed in the message.', ['Look at the candidates in the message.', 'Open the file shown in Notepad and write the right path by hand.'], 'V'],
  FIX_OUT_REFUSED: ['The output folder was refused.', 'Fix writes its result into a new folder. It refuses the game install, vanilla data, the mod itself, and a folder that already holds something that is not a fix patch, so nothing of yours is overwritten.', ['Pick a new, empty folder (for example next to the mod, named MyMod_fix).'], 'V'],
  // gen/lib/ops.js, newmod/newmod.js
  GEN_ROSTER_REPLACES: ['The mod now carries its own full copy of an army list (or bot) file.', 'The game uses the mod copy instead of the original file. Later game updates, or other mods, that change the same file will not reach the game while your copy is there.', ['Nothing to do now.', 'After a game update, run the generator again so the copy is rebuilt from the new file.'], 'V'],
  // GEN-FIX2: roster of a new army, weapon outside gun/, set add/append, shell/item tags and damage, voice rate, burst seconds, wrecks, army price
  GEN_ROSTER_OTHER_ARMY: ['The card was copied from another army\'s list into this army\'s own list.', 'A new army starts with an empty list, so the like card came from another army. The copy gets this army\'s side tag s(<army>) and goes into vehicles_<army>.set.', ['Start a test match as the new army and check that the card is in the purchase panel and can be bought.'], 'T'],
  GEN_WEAPON_USE_KIT: ['A soldier does not hold weapons on a mount: the weapon step cannot change it.', 'The weapon step swaps the gun on a vehicle mount ({place}). A soldier\'s weapons are inventory lines of its breed. Nothing was written.', ['Use the kit step (op: kit) with the breed and the weapon as an item, as the message shows.'], 'V'],
  GEN_WEAPON_OUTSIDE_GUN: ['The weapon is not a cannon (it is in mgun, flame, reactive or another weapon folder); it was mounted anyway.', 'The engine finds weapons by file name in any folder, so the mount takes it. The unit\'s ammo lines were not changed, so it may carry no ammo this weapon fires.', ['Spawn the unit, fire the weapon, and check it has ammo. Add ammo lines to the unit if it has none.'], 'T'],
  GEN_WEAPON_AMBIGUOUS: ['The weapon name matches more than one weapon file.', 'The engine picks one by its file-name words; gen will not guess which you meant. Nothing was written.', ['Give more of the file name (for example "browning m2" instead of "browning"); the message lists the files.'], 'V'],
  GEN_SET_KEY_MACRO: ['The value you want to change is made by a macro call, not written as a plain line.', 'A line like ("speed" s(800)) builds its value from a macro of the folder. Setting it as a plain key would leave the macro line in place too. Nothing was written.', ['Use the macro step (op: macro) to change the macro\'s argument, or del the macro line and set the plain key.'], 'V'],
  GEN_SET_APPEND_SINGLE: ['append adds a second line of a key that the file holds only once and without a name.', 'Such a key (for example {mass 30000}) is read once; a second line would make the game read only one of them. Nothing was written.', ['Use set (or add) to change the line in place.'], 'V'],
  GEN_SET_ADD_KEYLESS: ['add gave a plain value where the key\'s lines each carry a name.', 'The lines of this key are told apart by a name (like {place "gun"}). A line without one cannot be matched. Nothing was written.', ['Give the value with its name first, the way the other lines of that key are written.'], 'V'],
  GEN_SET_ADD_SET: ['add found the key once, without a name, so it changed that line instead of adding one.', 'A single unnamed key is read once by the game, so a second line would not count.', ['Nothing to do. Use append if you really want a second line.'], 'V'],
  GEN_SET_ADD_APPENDED: ['add put a new line after the existing lines of that key.', 'The key may appear several times (it repeats, or its lines carry names), so the new line is added next to them.', ['Nothing to do. Check the new line in the plan.'], 'V'],
  PATCH_KEY_MACRO: ['The key to change is made by a macro call.', 'A line like ("speed" s(800)) builds its value from a macro. A plain set would leave the macro line too. Nothing was written.', ['Change the macro argument with gen\'s macro step, or delete the macro line and set the plain key.'], 'V'],
  PATCH_APPEND_SINGLE: ['append adds a second line of a key the file has only once, without a name.', 'The game reads such a key once. Nothing was written.', ['Use set or add to change the line in place.'], 'V'],
  PATCH_ADD_KEYLESS: ['add gave a plain value where every line of that key carries a name.', 'The lines are told apart by their name; one without it cannot be matched. Nothing was written.', ['Write the name first, as the other lines of that key are written.'], 'V'],
  PATCH_ADD_SET: ['add found the key once, without a name, and changed that line.', 'A single unnamed key is read once, so a second line would not count.', ['Nothing to do; use --append for a second line.'], 'V'],
  PATCH_ADD_APPENDED: ['add put a new line after the existing lines of that key.', 'The key repeats or its lines carry names, so a new line is how another one is added.', ['Nothing to do.'], 'V'],
  GEN_SHELL_TAG_INHERITED: ['The tag word to drop is on the parent file, not on this shell.', 'The copy inherits that word from its parent ({from ..}); it cannot drop a word it does not hold itself. Nothing was written.', ['Pick a like that does not carry the word, or make the shell from the parent and leave the word out there.'], 'I'],
  GEN_ITEM_TAG_INHERITED: ['The tag word to drop is on the parent file, not on this item.', 'The copy inherits that word from its parent ({from ..}); it cannot drop a word it does not hold itself. Nothing was written.', ['Pick a like that does not carry the word.'], 'I'],
  GEN_SHELL_TAG_ABSENT: ['The tag word to drop is not on the shell or its parents.', 'There is nothing to drop. Nothing was written.', ['Check the spelling of the word against the shell\'s {tag} lines.'], 'V'],
  GEN_ITEM_TAG_ABSENT: ['The tag word to drop is not on the item or its parents.', 'There is nothing to drop. Nothing was written.', ['Check the spelling of the word against the item\'s {tag} lines.'], 'V'],
  GEN_SHELL_DAMAGE_INHERITED: ['The damage layer to change is inherited from the parent file, so it cannot be changed in place.', 'A {damage x} line in the copy replaces the inherited effect of that type, it does not change it (KEY-17); only the copy\'s own layers can be edited. Nothing was written.', ['Use blast (or a full damage block) to write the layer into the copy, or pick a like that holds the layer itself.'], 'V'],
  GEN_ITEM_DAMAGE_INHERITED: ['The damage layer to change is inherited from the parent file, so it cannot be changed in place.', 'A {damage x} line in the copy replaces the inherited effect of that type (KEY-17); only the copy\'s own layers can be edited. Nothing was written.', ['Pick a like that holds the layer itself, or write a full damage block.'], 'V'],
  GEN_VOICE_RESAMPLED: ['A voice file was converted to a sample rate the game files use (44100 or 22050 Hz).', 'The file had another rate (for example 48000 Hz). It was resampled into the mod; your own file is not changed.', ['Listen to it in game: the pitch and speed should sound right.'], 'T'],
  GEN_GUN_BURST_TIME_LIKE: ['The burst seconds were kept from the like weapon.', 'The burst sets rounds and seconds for a short and a long burst; you gave the rounds only, so the seconds come from the weapon you copied.', ['Nothing to do, or give "short long short_s long_s" to set the seconds.'], 'V'],
  GEN_GUN_BURST_TIME_DEFAULT: ['The like weapon has no burst, so 0.3 and 0.7 seconds were used.', 'The burst sets rounds and seconds; no seconds could be read from the weapon you copied.', ['Give "short long short_s long_s" if the burst timing matters.'], 'I'],
  GEN_WRECK_AUTOCLONE: ['The wreck of the new unit (_x) was cloned too.', 'When a unit is destroyed the game swaps it for the def with the same name plus _x; a clone without it would leave no wreck.', ['Nothing to do; set wreck: false on the clone step to skip it.'], 'V'],
  GEN_XX_AUTOCLONE: ['The second wreck stage (_xx) of the new unit was cloned too.', 'The game swaps a wreck for the def with the same name plus _xx when it is destroyed again.', ['Nothing to do.'], 'V'],
  WARN_UNITS_PRICE_SKIPPED: ['A unit was left out of the army price change: its card with a cost was not found.', 'The unit is listed for the army but no card with {cost} was found in the army lists, so its price was not changed.', ['Change that unit\'s price on the Units page by hand.'], 'V'],
  NOT_IN_MODS: ['The new mod folder is not directly inside the game mods folder.', 'The game reads mods only from <game>/mods/<name>. The folder is fine for editing, but the game will not see it there.', ['When you want to play it, copy it with the Play page (Install), or make the mod inside the mods folder.'], 'V'],
  // GEN-FIX3: gen.js text, ops-unit.js preset/card/squad/kit/macro/army bots, gui/ext/bots buy-first extras
  GEN_TEXT_VANILLA_FILE: ['The text key already exists in a game text file, so the text went into a mod copy of that file.', 'A key the game already defines (for example mp/army/rus in #dlg_mp.lng) would lose to the game file if the mod wrote it into its own text file (LOC-19). The mod copy has the same path and replaces the game file whole, so the new text shows.', ['Check the name in game.', 'Another mod that also edits that file is shadowed by this copy; load order decides which copy wins.'], 'I'],
  GEN_PRESET_KEY_ADDED: ['The preset had no such key, so it was added.', 'The key is one the preset reader takes under that block, written in the case the game expects (names are case-sensitive, MIS-11).', ['Start a match of a mode that uses the preset and check the effect.'], 'T'],
  GEN_PRESET_KEY_UNKNOWN: ['The preset reader does not take a key of that name there.', 'The game skips an unknown preset key without a word (MIS-01), and names are case-sensitive (MIS-11), so the line would do nothing. Nothing was written. The message lists the keys it does take.', ['Use one of the listed names.'], 'V'],
  GEN_CARD_EDIT: ['The unit card was changed.', 'The message lists what changed: price, cp, score, icon, tags or the not_for_sale / basic / remove flags.', ['Open the purchase panel in a test match and check the card.'], 'T'],
  GEN_CARD_EXPANDED: ['The card was written out in full instead of as a macro call.', 'The value you changed comes from the macro the card calls, so the call was replaced by the macro text with its arguments filled in. The card means the same, with your change.', ['Nothing to do; check the card in the plan.'], 'V'],
  GEN_CARD_TAGS_BAD: ['A card tag is not a single word.', 'Tags are words of letters, digits and _ ; -word takes a tag off. Nothing was written.', ['Write each tag as one word, like heavy or -medium.'], 'V'],
  GEN_CARD_FLAG_BAD: ['not_for_sale, basic or remove was not true or false.', 'These are on/off flags of the card. Nothing was written.', ['Give true to add the flag or false to take it off.'], 'V'],
  GEN_CARD_NO_TAGS: ['The card has no tags line to change.', 'Neither the card nor the macro it calls has {tags ..} or t(..). Nothing was written.', ['Give the card tags with a set op, or drop the tags change.'], 'V'],
  GEN_CARD_TAG_ABSENT: ['The tag to take off is not on the card.', 'It may be added by the card macro itself (the side tag is), so the card cannot drop it. Nothing was written.', ['Check the spelling against the card tags in the message.'], 'V'],
  WARN_GEN_CARD_FLAG_ABSENT: ['The flag to take off is not on the card.', 'There was nothing to remove; the rest of the step went on.', ['Nothing to do, or check the flag name.'], 'V'],
  GEN_CARD_FLAG_SET: ['The flag is already on the card.', 'It is there as a line or comes from the macro the card calls, so nothing was added.', ['Nothing to do.'], 'V'],
  GEN_CARD_INFO_SOLDIER: ['A soldier card has no info text of its own.', 'The purchase panel shows the squad text (info/squad/<squad>(<army>)) for soldiers. Nothing was written.', ['Set the info with the squad op instead.'], 'V'],
  GEN_CARD_NOT_SDL: ['The card could not be read as game data.', 'The card text or the macro it calls did not parse, so it was not changed. Nothing was written.', ['Open the file the message names and check its brackets.'], 'V'],
  GEN_SQUAD_CHANGE_UNKNOWN: ['There is no squad of that name to change.', 'change: true edits a squad the army already has. Nothing was written.', ['Check the squad name, or drop change: true to make a new squad.'], 'V'],
  GEN_SQUAD_MEMBER_ABSENT: ['The member to take out is not in the squad.', 'The message lists the members the squad has. Nothing was written.', ['Use a breed name from that list.'], 'V'],
  GEN_KIT_COUNT_SAME: ['The item already has that count.', 'Nothing to change.', ['Nothing to do.'], 'V'],
  GEN_ARMY_BOTS: ['The new army got a bot shopping list.', 'Each unit the same spec gave the army was added to every bot stage, copying the bot row of the unit it was made like. Without a list the bots of this army buy nothing.', ['Play a match against bots of the new army and check they buy units.'], 'T'],
  GEN_ARMY_BOTS_THERE: ['The bot file already has a list for this army.', 'It was left as it is, so it is not written twice.', ['Edit that list with the bots page if it needs the new units.'], 'V'],
  WARN_GEN_ARMY_BOTS_PART: ['Some units of the new army are not on its bot list.', 'Their like unit is on no bot list, so there was no row to copy.', ['Add them with the bots page (buy first) if bots should buy them.'], 'I'],
  BOT_EXTRA_LINE_MISSING: ['The bot line to give min_income / min_team was not found after the change.', 'The unit was not on that stage of the bot list, so the extra values were not written.', ['Check the unit and stage, then run it again.'], 'V'],
  // GEN-FIX4: gen sound / soundclass / voice keys, patch-entity block create and #* value lists
  GEN_SOUND_MONO: ['A stereo wav was mixed down to one channel.', 'mono: true averages the channels into one and keeps the sample rate. A sound placed in the world should be mono; on a stereo file the 3D placement is likely lost (not tested).', ['Listen to it in game; a file whose channels cancel out may come out quieter.'], 'T'],
  GEN_VOICE_MONO: ['A stereo voice wav was mixed down to one channel.', 'mono: true on the voice op averages the channels into one, the same as on the sound op.', ['Listen to the phrase in game.'], 'T'],
  GEN_SOUNDCLASS_PERCENT: ['A {percent "group" share max} row in sound.set was set.', 'The row gives a sound group its share of the playing voices and, as the optional third number, how many of them play at once (vanilla: {percent "speech" 10 1}). An existing row is changed in place; a new one goes after the last percent row.', ['Play a busy match and listen whether that group is heard as often as you want.'], 'T'],
  WARN_GEN_SOUNDCLASS_PERCENT_SUM: ['The percent rows of sound.set no longer add up to 100.', 'Vanilla AS2 and GoH both give shares that sum to 100. What the engine does with another sum is not checked; it may scale or cut the shares.', ['Change another group in the same step so the shares sum to 100.'], 'I'],
  GEN_VOICE_LOUDNESS: ['The new voice got its own loudness class.', 'The voice folder talk/<id>/folder.set was written as vanilla writes the talk folders ({sound {tag emotions} {loudness "talk"}}). Sub folders that have their own folder.set, like death_cry, keep their own loudness.', ['Listen in game how far the voice carries.'], 'T'],
  GEN_VOICE_LOUDNESS_UNKNOWN: ['The loudness class is not in sound.set.', 'A folder.set loudness names a {loudness "name" min max} row of resource/sound/sound.set. A name with no row gives no distances. Nothing was written.', ['Use a name from sound.set, or add the class first with the soundclass op.'], 'V'],
  PATCH_ADD_BLOCK: ['The block the new line goes in was missing, so it was made.', 'The file had no such block; it now has one that holds only the new line. Later adds to the same block in the same run go into it. Lines the file gets from its source through {from ..} are not copied in. Whether the game merges the new block with the inherited one or replaces it has not been tested.', ['Check in game that the other values of that block (from the source) still apply.', 'If they are lost, add them too.'], 'T'],
  PATCH_VALUE_FIRST_ONLY: ['Only the first value of the line was replaced.', 'The line holds several values ({tag "a" "b" "c"}) and the edit gave one, so only the first changed and the rest stayed.', ['To replace the whole list, add #* to the path: --set \'x/tag#*="a" "b"\'.'], 'V'],
  // gen/lib/ops-unit.js: refusals and warnings the generic GEN_ families would call a note
  GEN_ARMY_ID_RANGE: ['The army id is outside 6 to 99.', 'Ids 0 to 5 are the stock armies and 100 to 102 are kept by the engine, so a new army needs an id from 6 to 99 (TST-95). Nothing was written.', ['Leave id out to get the lowest free id, or pick a number from 6 to 99.'], 'V'],
  GEN_ARMY_ID_USED: ['Another army already has this id.', 'Two armies with one id share rank and lobby selection (MIS-07). The message names the army that has it. Nothing was written.', ['Leave id out to get the lowest free id, or pick another number from 6 to 99.'], 'I'],
  GEN_MACRO_ARGC: ['The number of values does not match the macro call.', 'An args list is replaced value for value; the call has a fixed count, given in the message. Nothing was written.', ['Give exactly that many values; write _ for one you want to keep.'], 'V'],
  GEN_PRESET_VALUE: ['A preset value is not in a form the game reads.', 'Lists such as unitLimits are tag=number pairs separated by ; and a key that holds blocks has no single value. Nothing was written.', ['Write tag=number, -tag to remove one, or =a=1;b=2 to replace the whole list.', 'For a key with blocks inside, name a key inside it (budgets/vehicle/resource/start).'], 'V'],
  GEN_KIT_HANDS_GONE: ['The item the soldier holds would be deleted.', 'The {in_hands N} line points at an item by its place in the list. Deleting that item leaves the soldier with nothing valid in hands. Nothing was written.', ['Add another item with in_hands: true in the same step.', 'Or keep that item.'], 'V'],
  GEN_KIT_ITEM_ABSENT: ['The item to delete is not in the soldier inventory.', 'The message lists the items the inventory has. Nothing was written.', ['Use a name from that list, spelled the same.'], 'V'],
  GEN_BREED_DEL_ABSENT: ['The perk to delete is not in the soldier file.', 'The message lists the perk lines the file has. Nothing was written.', ['Use a perk name from that list.'], 'V'],
  GEN_SQUAD_CONTENT_BAD: ['The squad content text is empty or has quotes or braces.', 'content is written inside {content ".."} as it is, so quotes or braces would break the file. Nothing was written.', ['Write only the inside text, e.g. m3 ( mp/rus/rifle:6 mp/rus/squadleader:2 ).'], 'V'],
  GEN_BOTS_VALUE: ['A bots setting is not a number or has an unknown key.', 'bots: {..} takes priority, class, min_income and min_team; the numbers must be 0 or more. Nothing was written.', ['Fix the value named in the message.'], 'V'],
  WARN_GEN_PRESET_TAG_UNUSED: ['No unit carries the tag this limit or factor names.', 'unitLimits and chargeFactors match units by the tags on their cards. A tag no card has matches nothing, so the unit stays unlimited.', ['Check the spelling against the card tags (t(..) or {tags ..}).', 'Or give the card that tag with a card or roster op.'], 'I'],
  WARN_GEN_CARD_LIST_NO_MODE: ['The price list is named after no game mode.', 'The engine reads units/<gameType>.set or units/<gameClass>.set before common.set (TST-94). A list named after no mode is never read.', ['Use the name of a game mode (cooperative, ..).'], 'I'],
  WARN_GEN_MACRO_ARG_UNUSED: ['The macro never reads the argument you changed.', 'A macro uses only the %names in its define. A value for any other name changes nothing in the game.', ['Pick an argument the define uses; the message names the define file.'], 'I'],
  WARN_GEN_ARMY_NO_ALLIANCE: ['The new army is in no alliance.', 'Modes that pick armies by alliance (combat, frontline ..) never offer an army that is in none.', ['Add alliance: axis or alliance: allies to the army step.'], 'I'],
  GEN_ARMOR_ARG_MISSING: ['The armour edit names a part (argument) that the armour macro of this unit does not have.', 'Armour is set by a macro call like ("armor_tank" front side rear top ...). The message lists the parts the macro really has; nothing was written for this row.', ['Use one of the part names listed in the message.', 'Or set the value with a set row on the volume instead.'], 'V'],
  PATCH_KEY_MISSING: ['The block or key path to change does not exist in this unit file.', 'Edit paths must match the data exactly (block names, order, letter case). Nothing was written; the message may suggest a close name.', ['Open the unit (.def) in the Units page or Notepad and copy the exact block names.', 'Use the suggested name if the message has one.'], 'V'],
  CLONE_BASE_MISSING: ['The unit or item you wanted to copy was not found.', 'The name must match an existing entity, breed or inventory item in the game or the active mods. A name from a mod that is not active is not seen.', ['Check the spelling (use the Units page list).', 'If it comes from another mod, list that mod as a dependency and make sure it is active.'], 'V'],
  MAPCLONE_NO_MAP: ['The map to copy was not found, or its name is not in the form map/multi/<name>.', 'Map clone copies an existing multiplayer map folder. Without the source map there is nothing to copy.', ['Pick the map from the Maps page list.', 'If it is a mod map, list that mod and make sure it is active.'], 'V'],
  BOT_ARMY_MISMATCH: ['A bot buy rule puts a unit after a unit from another army.', 'Each army has its own bot shopping list. The other army\'s bot would buy your unit, and your army\'s bot never would.', ['Pick an "after" unit from the same army as your unit.'], 'V'],
  // goh2as2 (PORT-*, porting notes): a GoH unit ported to AS2
  PORT_BINARY_COPY: ['A GoH binary file (mesh, animation, texture) was copied as it is.', 'The tool does not convert this file type. Most such files load in AS2, but it is not proven for every file (FMT-01/10/13).', ['Spawn the ported unit in the game and look at it.', 'If it is invisible or crashes, re-export the file for AS2.'], 'I'],
  WARN_PORT_CREW_CAPPED: ['The ported vehicle gets fewer crew than in GoH.', 'The model has fewer crew places (doors and seats) than the GoH crew. A card or squad with more crew fails with "Link failed" and the extra soldier stays outside (PORT-137).', ['Use the crew number in the message for the unit card.', 'Or add the missing crew places to the model.'], 'V'],
  WARN_PORT_WEAPON_SWAPPED: ['The donor weapon was replaced by the nearest vanilla AS2 weapon.', 'The GoH weapon has no AS2 match, so the tool picked the AS2 weapon with the closest calibre in the same class. Damage and range follow the AS2 weapon.', ['Read the message: it names both weapons and calibres.', 'If you want another gun, change the weapon name in the unit file.'], 'I'],
  WARN_PORT_ARMOUR: ['The donor armour is far from the GoH unit armour.', 'The port takes rules from an AS2 donor unit. When its armour class or thickness differs a lot, hits and penetration will not match the GoH unit.', ['Pick a donor with similar armour, or set the armour values by hand (Units page).'], 'I'],
};
// GX-help: severity override where the registry class (crash) is wrong for a novice: a version gate failure hides the whole mod, nothing crashes
const SEV = { VER_MISSING: 'silent', VER_RANGE: 'silent', VER_ORDER: 'silent', REQ_MISSING: 'silent', LOADS_STATIC: 'info', NOT_MOUNTED: 'review', DEFINE_SKIPPED: 'info' };
const HIDDEN = 'Hidden mod: the game switches the whole mod off and does not list it. It does not crash.';
const IMPACT_OVR = { VER_MISSING: HIDDEN, VER_RANGE: HIDDEN, VER_ORDER: HIDDEN, REQ_MISSING: HIDDEN };
// GX-help (C14 part): translated text for the impact lines, the hidden-mod cards and the fallback. Other cards stay English (the GUI says so).
const TR = {
  ru: {
    impact: { crash: 'Риск вылета: игра может упасть, зависнуть или отказаться грузить мод, когда читает это.', silent: 'Тихий сбой: игра грузится, но значение игнорируется или читается неверно. Ошибки не видно.', desync: 'Рассинхрон в сетевой игре: у игроков разные результаты, матч распадается.', cosmetic: 'Косметика: что-то выглядит, звучит или пишется неверно. На игру не влияет.', review: 'Проверьте: не точная ошибка. Посмотрите один раз и решите.', info: 'Заметка о том, что сделал инструмент. Исправлять нечего.', hidden: 'Скрытый мод: игра отключает весь мод и не показывает его в списке. Вылета нет.' },
    VER_MISSING: ['В mod.info нет MinGameVersion или MaxGameVersion (или они пустые).', 'Мод с пустым диапазоном версий игра считает сделанным для неподдерживаемой версии: отключает его, не показывает в Options > Mods и пишет в game.log "was disabled: Unsupported game version". Вылета нет.', ['Откройте mod.info в Блокноте (это обычный текст).', 'Классический мод (данные 3.262): добавьте {MinGameVersion "3.262"} и {MaxGameVersion "3.262"} в корневой блок.', 'Мод для Enhanced (as64): {MinGameVersion "3.301"} и {Require "as64+"}.', 'Сохраните, запустите игру, отметьте мод в Options > Mods и нажмите Apply.']],
    VER_RANGE: ['Версия игры вне диапазона MinGameVersion..MaxGameVersion из mod.info.', 'При запуске игра сравнивает свою версию с диапазоном. Вне диапазона мод отключается и скрывается. Вылета нет.', ['Откройте mod.info в Блокноте.', 'Классический мод: {MinGameVersion "3.262"} {MaxGameVersion "3.262"}.', 'Мод для Enhanced: {MinGameVersion "3.301"}.', 'Перезапустите игру и снова отметьте мод.']],
    VER_ORDER: ['MinGameVersion больше MaxGameVersion.', 'Такому диапазону не подходит ни одна версия, мод не загрузится никогда. Игра не предупреждает.', ['Поменяйте числа местами, чтобы Min был меньшим.']],
    REQ_MISSING: ['mod.info требует мод, которого нет в той же папке mods.', 'Строка {Require "имя"} называет нужный мод. Если его нет (или он не включён), этот мод тоже не грузится.', ['Установите нужный мод в ту же папку mods и включите его.', 'Проверьте написание: Require использует имя папки.', 'Или удалите строку Require, если она не нужна.']],
    WARN_NOT_MOD: ['В папке mods есть папка без файла mod.info.', 'Игра считает модом только папку с mod.info. Эта папка игнорируется.', ['Если это мод, добавьте mod.info (страница «Создать»).', 'Проверьте лишний уровень: mods/MyMod/MyMod/mod.info должно быть mods/MyMod/mod.info.']],
    NOT_MOUNTED: ['Проверяемый мод не активен для этой проверки.', 'Причины: в mod.info нет MinGameVersion или MaxGameVersion, и игра его отбрасывает; или папка не лежит в <игра>/mods с mod.info. Файлы всё равно проверены как обычная папка.', ['Прочитайте строку NOT_MOUNTED: там причина.', 'Добавьте версии в mod.info (карточка VER_MISSING).', 'Или установите мод в папку mods игры (страница «Играть») и проверьте снова.']],
    LOADS_STATIC: ['Вердикт: по файлам не найдено известных причин вылета.', 'Игра не запускалась. Это значит «известных причин вылета нет», а не «всё работает». Тихие ошибки могут остаться.', ['Поиграйте: быстрая схватка с включённым модом.', 'Потом прочитайте game.log (страница «Логи»).']],
    fallback: ['Для этого кода ещё нет описания простыми словами.', 'Инструмент знает правило, но у карточки нет объяснения. Прочитайте сообщение рядом.', ['Прочитайте сообщение инструмента и посмотрите указанное место.']],
  },
  uk: {
    impact: { crash: 'Ризик вильоту: гра може впасти, зависнути або відмовитися вантажити мод, коли читає це.', silent: 'Тихий збій: гра вантажиться, але значення ігнорується або читається неправильно. Помилки не видно.', desync: 'Розсинхрон у мережевій грі: у гравців різні результати, матч розпадається.', cosmetic: 'Косметика: щось виглядає, звучить або пишеться неправильно. На гру не впливає.', review: 'Перевірте: не точна помилка. Подивіться один раз і вирішіть.', info: 'Нотатка про те, що зробив інструмент. Виправляти нічого.', hidden: 'Прихований мод: гра вимикає весь мод і не показує його у списку. Вильоту немає.' },
    VER_MISSING: ['У mod.info немає MinGameVersion або MaxGameVersion (або вони порожні).', 'Мод з порожнім діапазоном версій гра вважає зробленим для непідтримуваної версії: вимикає його, не показує в Options > Mods і пише в game.log "was disabled: Unsupported game version". Вильоту немає.', ['Відкрийте mod.info у Блокноті (це звичайний текст).', 'Класичний мод (дані 3.262): додайте {MinGameVersion "3.262"} і {MaxGameVersion "3.262"} у кореневий блок.', 'Мод для Enhanced (as64): {MinGameVersion "3.301"} і {Require "as64+"}.', 'Збережіть, запустіть гру, позначте мод в Options > Mods і натисніть Apply.']],
    VER_RANGE: ['Версія гри поза діапазоном MinGameVersion..MaxGameVersion з mod.info.', 'Під час запуску гра порівнює свою версію з діапазоном. Поза діапазоном мод вимикається і ховається. Вильоту немає.', ['Відкрийте mod.info у Блокноті.', 'Класичний мод: {MinGameVersion "3.262"} {MaxGameVersion "3.262"}.', 'Мод для Enhanced: {MinGameVersion "3.301"}.', 'Перезапустіть гру і знову позначте мод.']],
    VER_ORDER: ['MinGameVersion більша за MaxGameVersion.', 'Такому діапазону не підходить жодна версія, мод не завантажиться ніколи. Гра не попереджає.', ['Поміняйте числа місцями, щоб Min був меншим.']],
    REQ_MISSING: ['mod.info вимагає мод, якого немає в тій самій папці mods.', 'Рядок {Require "ім\'я"} називає потрібний мод. Якщо його немає (або він не увімкнений), цей мод теж не вантажиться.', ['Встановіть потрібний мод у ту саму папку mods і увімкніть його.', 'Перевірте написання: Require використовує ім\'я папки.', 'Або видаліть рядок Require, якщо він не потрібен.']],
    WARN_NOT_MOD: ['У папці mods є папка без файлу mod.info.', 'Гра вважає модом лише папку з mod.info. Ця папка ігнорується.', ['Якщо це мод, додайте mod.info (сторінка «Створити»).', 'Перевірте зайвий рівень: mods/MyMod/MyMod/mod.info має бути mods/MyMod/mod.info.']],
    NOT_MOUNTED: ['Мод, що перевіряється, не активний для цієї перевірки.', 'Причини: у mod.info немає MinGameVersion або MaxGameVersion, і гра його відкидає; або папка не лежить у <гра>/mods з mod.info. Файли все одно перевірено як звичайну папку.', ['Прочитайте рядок NOT_MOUNTED: там причина.', 'Додайте версії в mod.info (картка VER_MISSING).', 'Або встановіть мод у папку mods гри (сторінка «Грати») і перевірте знову.']],
    LOADS_STATIC: ['Вердикт: у файлах не знайдено відомих причин вильоту.', 'Гра не запускалася. Це означає «відомих причин вильоту немає», а не «усе працює». Тихі помилки можуть лишитися.', ['Пограйте: швидка сутичка з увімкненим модом.', 'Потім прочитайте game.log (сторінка «Логи»).']],
    fallback: ['Для цього коду ще немає опису простими словами.', 'Інструмент знає правило, але картка не має пояснення. Прочитайте повідомлення поруч.', ['Прочитайте повідомлення інструмента і подивіться вказане місце.']],
  },
  zh: {
    impact: { crash: '崩溃风险：游戏读取到这里时可能崩溃、卡死或拒绝加载模组。', silent: '静默失败：游戏能加载，但这个值被忽略或读错，不会显示错误。', desync: '联机不同步：玩家得到不同结果，对局分裂。', cosmetic: '外观问题：画面、声音或文字不对，不影响玩法。', review: '请复查：不一定是错误，看一眼再决定。', info: '提示：说明工具做了什么，无需修复。', hidden: '模组被隐藏：游戏关闭整个模组并且不在列表中显示。不会崩溃。' },
    VER_MISSING: ['mod.info 缺少 MinGameVersion 或 MaxGameVersion（或为空）。', '版本范围为空的模组会被游戏视为不支持的版本：游戏关闭它，不在 Options > Mods 中显示，并在 game.log 写入 "was disabled: Unsupported game version"。不会崩溃。', ['用记事本打开 mod.info（纯文本）。', '经典模组（3.262 数据）：在根块中加入 {MinGameVersion "3.262"} 和 {MaxGameVersion "3.262"}。', '增强版模组（as64）：{MinGameVersion "3.301"} 和 {Require "as64+"}。', '保存，启动游戏，在 Options > Mods 勾选模组并点 Apply。']],
    VER_RANGE: ['游戏版本不在 mod.info 的 MinGameVersion..MaxGameVersion 范围内。', '启动时游戏用自己的版本对比该范围。超出范围的模组会被关闭并隐藏。不会崩溃。', ['用记事本打开 mod.info。', '经典模组：{MinGameVersion "3.262"} {MaxGameVersion "3.262"}。', '增强版模组：{MinGameVersion "3.301"}。', '重启游戏并重新勾选模组。']],
    VER_ORDER: ['MinGameVersion 大于 MaxGameVersion。', '没有任何版本落在这个范围内，模组永远不会加载。游戏不会提示。', ['交换两个数字，让 Min 较小。']],
    REQ_MISSING: ['mod.info 需要的模组不在同一个 mods 文件夹中。', '{Require "名称"} 指定本模组依赖的模组。它没有安装（或未启用）时，本模组也不会加载。', ['把需要的模组装到同一个 mods 文件夹并启用。', '检查拼写：Require 使用文件夹名。', '如果不需要，删除这行 Require。']],
    WARN_NOT_MOD: ['mods 中有一个文件夹没有 mod.info 文件。', '游戏只把有 mod.info 的文件夹当作模组。这个文件夹会被忽略。', ['如果它应该是模组，加入 mod.info（"制作"页）。', '检查是否多了一层：mods/MyMod/MyMod/mod.info 应为 mods/MyMod/mod.info。']],
    NOT_MOUNTED: ['被检查的模组在本次检查中没有启用。', '原因有二：mod.info 缺少 MinGameVersion 或 MaxGameVersion，游戏丢弃它；或文件夹不在 <游戏>/mods 下或没有 mod.info。文件仍按普通文件夹检查。', ['阅读 NOT_MOUNTED 行：里面写了原因。', '在 mod.info 中加入版本行（见 VER_MISSING 卡片）。', '或用"游玩"页把模组安装到游戏的 mods 文件夹后再检查。']],
    LOADS_STATIC: ['结论：读取文件后没有发现已知的崩溃模式。', '检查没有运行游戏。意思是"没有已知的崩溃类型"，不是"能正常工作"。静默问题仍可能存在。', ['实际玩一下：开启模组打一局快速遭遇战。', '之后阅读 game.log（"日志"页）。']],
    fallback: ['这个代码还没有通俗解释。', '工具知道这条规则，但卡片没有说明。请阅读旁边的消息。', ['阅读工具消息并查看所指位置。']],
  },
};
// running inside the single exe (node SEA): no node tools/q/q.js there, point at the GUI help page instead
let SEA_ON = null;
const isSea = () => { if (SEA_ON === null) { try { SEA_ON = !!require('node:sea').isSea(); } catch { SEA_ON = false; } } return SEA_ON; };

// families: [regex, what, why, fix steps, tag]. first match wins. %c = the code. tag [I]: written from the code name + tool, not checked row by row.
const F = [
  // GX-help: generator / clone / patch / map-clone / bot / translate families (gen/lib/ops.js, clone-entity, patch-entity, map-clone, botrecipe, goh2as2/translate.js)
  [/^(GEN|CLONE|MAPCLONE|PATCH|BOT)_.*(ARGS|BAD_SPEC|BAD_OP|BAD_NAME|EMPTY)$/, 'The generator input is incomplete or malformed (%c).', 'A step of the recipe lacks a value it needs (a name, an army, a source unit) or has one in the wrong form. Nothing was written for that step.', ['Read the message: it lists what the step needs.', 'Fill the missing field on the page and preview again.'], 'V'],
  [/^(GEN|CLONE|MAPCLONE|PATCH)_.*(EXISTS|TAG_EXISTS)$/, 'Something with that name already exists (%c).', 'The tool never overwrites an existing unit, card, squad or map. Two things with one name would make the game keep only one, silently.', ['Pick another name.', 'Or remove the old one first if you meant to replace it.'], 'V'],
  [/^(GEN|CLONE|MAPCLONE|PATCH)_.*(OUT_UNSAFE|REFUSED|OUT_EXISTS)$/, 'The tool refused to write there (%c).', 'Writes go only into a mod folder you picked, never into the game install or vanilla data, and a full output folder is not overwritten.', ['Pick an empty folder, or a mod folder under <game>/mods/<name>.'], 'V'],
  [/^(GEN|CLONE|PATCH)_.*(AMBIGUOUS)$/, 'The name you gave matches more than one thing (%c).', 'The tool does not guess which one you meant; the message lists the matches.', ['Use a longer, exact name from the list in the message.'], 'V'],
  [/^(GEN|CLONE|MAPCLONE|PATCH|BOT)_.*(MISSING|UNKNOWN|NO_[A-Z]+|NOT_FOUND|UNDEFINED|UNRESOLVED|NOT_LOADED|LIKE_MISSING)$|^PATCH_NO_/, 'Something the step refers to was not found (%c).', 'The unit, card, squad, breed, macro, map or file named in the step does not exist in the game or the active mods. Nothing was written for that step.', ['Check the spelling against the lists on the Units or Maps page.', 'If it comes from another mod, make that mod a dependency and keep it active.'], 'V'],
  [/^(GEN|PATCH)_.*FULL_COPY$|^PATCH_COPIED$/, 'The mod now holds a whole copy of a game file (%c).', 'The game reads your copy instead of the original. Game updates or other mods that change the same file will not reach the game while your copy is there (VFS-01).', ['Nothing to do now.', 'After a game update, build the mod again so the copy is fresh.'], 'V'],
  [/^(GEN|CLONE|MAPCLONE|PATCH)_.*(CRASH|TOOL_FAILED|NOT_SDL|BINARY|NOT_WRITTEN|SWAP_COUNT|SET_BAD|TINT_UNSUPPORTED|MOD_DROPPED|GAME_MISMATCH|NET_PROBLEM|AS2_ONLY|FROM_SELF)$/, 'A generator step could not be done (%c).', 'The tool hit something it cannot handle safely (a file it cannot read as text, a helper tool that failed, or a case it does not support). It wrote nothing for that step.', ['Read the message for the exact reason.', 'Change the step, or make that part of the change by hand.'], 'V'],
  // gen/lib/ops-asset.js (gun class fields, shell, item, sound, soundclass, voice, skin, stuffmodel, mapinfo)
  [/^GEN_.*_(VALUE|CLASS)$/, 'A value in the generator step is out of range or of the wrong kind (%c).', 'The step names a number, preset or weapon class the game data does not take there (for example a rate of fire of 0, a burst preset the weapon folder lacks, or a rifle as the model for a cannon). Nothing was written for that step.', ['Read the message: it gives the range or the names allowed.', 'Change the value and preview again.'], 'V'],
  [/^GEN_.*_(BAD_WAV|NOT_DDS)$/, 'A file you gave is not in a format the game reads (%c).', 'The game plays .wav sounds (16-bit PCM or IMA ADPCM) and reads .dds textures. A file it cannot read is silent or shows as a blank texture, so the step wrote nothing.', ['Save sounds as 16-bit PCM .wav (or IMA ADPCM).', 'Save textures as DXT1 or DXT5 .dds.'], 'V'],
  [/^GEN_.*_CONVERTED$/, 'A sound was converted to a format the game plays (%c).', 'The file you gave was in a .wav format the game does not play (for example 24-bit or float). The mod holds a 16-bit PCM (or IMA ADPCM) copy; your file is not changed.', ['Nothing to do. Listen to it in the game once.'], 'I'],
  [/^WARN_GEN_.*_(RATE|STEREO|SIZE|KEY_UNCHECKED)$/, 'A generator input the game may handle differently than you expect (%c).', 'A sound with an unusual sample rate or two channels, a texture of another size than the one it replaces, or a map.info key gen does not know. It was written, but check it in the game.', ['Read the message.', 'Test the result in the game.'], 'I'],
  [/^(GEN|CLONE|MAPCLONE|PATCH)_/, 'A note from the generator about what it did (%c).', 'Nothing is broken. It tells you what was copied, renamed or skipped, so you know what the mod now contains.', ['Read the note. Test the result in the game.'], 'I'],
  [/^BOT_/, 'A bot data problem (%c).', 'Bot buy lists are read by bot.lua; a key it does not know is ignored, so the bot does not buy what you meant.', ['Compare the entry with a vanilla bot entry of the same army.'], 'I'],
  [/^(ERR_DONOR|ERR_DEF_READER|BUILD_FAIL)/, 'The GoH port could not fit the donor unit to the GoH model (%c).', 'The donor unit names a bone, seat, weapon or file that the GoH model does not have, so the port was refused rather than written broken.', ['Read the message: it names the missing part.', 'Pick another donor unit of the same kind, or add the part to the model.'], 'I'],
  [/^(DF|SP|SEAT|PORTGAP)_|^LEFT_BEHIND$/, 'A note from the GoH port fit or scaling step (%c).', 'It records what the port changed, scaled, mapped or dropped so the unit fits AS2 rules. Values marked [T] still need an in-game test.', ['Spawn the ported unit and check that part.'], 'I'],
  [/^(MISSING_TEXTURE|DDS_UNLOADABLE)$/, 'A texture of the port is missing or in a format AS2 cannot read (%c).', 'The engine reads DDS DXT1-5 and plain 32-bit only. A missing or unreadable texture shows as a blank or default surface.', ['Copy the texture from GoH, or re-save it as DXT1/DXT5.'], 'V'],
  [/^UNIT_|^NO_VANILLA$/, 'A unit name note from the GoH port (%c).', 'The port takes unit names from GoH text files. A missing or near-match name means the in-game title may be wrong or a raw key.', ['Check the unit name in the game; set the text on the Units page if it is wrong.'], 'I'],
  [/^ROSTER_/, 'A note about the army list (roster) file (%c).', 'The clone adds a card line to the army list. When the mod holds a whole copy of the list, later game or mod changes to that file do not reach the game.', ['Nothing to do now. Rebuild after a game update.'], 'I'],
  [/^(SELFCHECK_MODINFO|LANG_NOOP|GAME_NO_MODS)$/, 'A note from making the new mod (%c).', 'The new-mod tool checked its own output or the game folder and tells you what it found.', ['Read the message. Nothing breaks.'], 'I'],
  [/^XLATE_(SKIP|SKIPPED)$/, 'Part of the GoH-to-AS2 translation was skipped (%c).', 'The tool has no AS2 rule for this part, so it kept the donor unit value instead.', ['Check that value by hand in the unit file if it matters.'], 'I'],
  [/^XLATE_/, 'A note from the GoH-to-AS2 translation (%c).', 'It says which GoH value was turned into which AS2 value, and from which donor unit. Values marked [T] still need an in-game test.', ['Spawn the unit and check speed, armour and weapons in the game.'], 'I'],
  [/^FIX_.*_(AMBIGUOUS)$/, 'The fix tool found more than one possible file, so it did not guess.', 'Picking the wrong file would make the mod load the wrong thing.', ['Look at the candidates in the message.', 'Change the path by hand to the right one.'], 'V'],
  [/^FIX_.*_NO_(CANDIDATE|DEFINITION|SOURCE)$/, 'The fix tool found no file to point at.', 'There is nothing to repoint to; the original problem stays.', ['Copy the missing file into the mod, or fix the reference by hand.'], 'V'],
  [/^FIX_.*_NOT_MINE$/, 'The finding is in a file this mod does not own (vanilla or another mod).', 'The fix tool never edits files the mod does not ship.', ['If it matters, override the file in your mod and fix it there.'], 'V'],
  [/^FIX_.*_(PARSE|NOT_ON_LINE|INHERITED|ODD_PATH|NON_ASCII|BAD_SPEC|NO_FILE|NOT_UTF8|NO_TAGS|BASE_UNREAD|BASE_UNREADABLE|UNNAMED|BINHDR_FAILED|REFCHECK_FAILED|NEW_REFCHECK)$/, 'The fix tool could not apply this fix safely.', 'It refuses rather than writing something it cannot check.', ['Read the message for the exact reason.', 'Fix by hand (see the original finding).'], 'I'],
  [/^FIX_|^ITM_|^LOOSE_|^STAMP_|^STUFF_SKIPPED$|^SKIPPED_EXT$/, 'A note from a tool about what it did.', 'Nothing breaks; this only tells you what changed.', ['Nothing to do. Check the changed files if you want.'], 'I'],
  [/^(ANM|PLY|VOL|DDS|EBM|NET|WAV)_(BAD|TRUNCATED|HEADER|SIGNATURE|VERSION|NO_|NOT_|INDEX|PART|FRAME|BONE|SIDE|ORDER|CELL|TABLE|SIZE|CUBE|VOLUME|MIPS)/, 'A binary asset file (%t) is damaged or in a layout the engine does not read.', 'The engine reads binary assets without checks: a bad file crashes or the asset is missing.', ['Re-export the file from the source tool.', 'Or copy a working file from the source game/mod.'], 'I'],
  [/^WARN_(EXP|PLY|EBM)_|^LOD_/, 'A model export detail the engine handles poorly (%c).', 'Usually a visual fault: wrong LOD, stretched mesh, or a missing collision part.', ['Check the export settings for this model and re-export.'], 'I'],
  [/^(WARN_)?(MI|MIS)_|^WARN_MISDIFF|^MIS_DIFF/, 'A mission script or mission data problem (%c).', 'Mission scripts fail quietly: the trigger, unit or task does not run, no error shown.', ['Open the mission file at the line shown.', 'Compare the name with what is defined in the mission (zones, units, triggers).'], 'I'],
  [/^(WARN_)?MAP_|^NET_|^PAT_GAP|^PATCH_/, 'A map data problem (%c).', 'Map data is read raw: a bad value can break pathing or crash on load.', ['Open the map files at the place shown.', 'Compare with a vanilla map of the same type.'], 'I'],
  [/^(WARN_)?MPSYNC|^LOG_OOS/, 'Files that differ between players in multiplayer (%c).', 'Different files give different results: the match desyncs.', ['Give every player the same mod build.', 'Exclude client-only files from the sync check if they are purely visual.'], 'I'],
  [/^LOG_/, 'A line found in game.log (%c).', 'The log tells what the game did at run time; this one is sorted by kind.', ['Read the log line shown.', 'Fix the file it names, then run the game again.'], 'I'],
  [/^(WARN_)?INT_|^IA_|^ACTION_/, 'An interaction script problem (%c).', 'Interaction scripts fail quietly: the action does nothing or uses a wrong value.', ['Open the script at the line shown.', 'Compare with the vanilla interaction that does the same thing.'], 'I'],
  [/^(WARN_)?HUM_/, 'A soldier (human) data problem (%c).', 'Soldier data is read without checks: the value is ignored or the unit acts wrong.', ['Compare with a vanilla soldier .def.'], 'I'],
  [/^(WARN_)?MOV_|^MDL_|^IK_|^SPEED_|^STRAFE|^GEARS|^TURNTIME|^FOOT_|^WARN_PORT_BONE/, 'A movement or model-bone problem (%c).', 'The unit moves wrong, cannot move, or the model breaks on spawn.', ['Check the bone names and speeds against the model and a vanilla unit.'], 'I'],
  [/^(WARN_)?STR_|^DEF_VOLUME|^COLLIDER/, 'A structure (building/object) data problem (%c).', 'The object may not place, break, or block like it should.', ['Compare with a vanilla object .def of the same kind.'], 'I'],
  [/^(WARN_)?(PANEL|KEYS|MOUSE|FONT|UI)_|^WARN_FONT|^COLOR_|^PROFILE_/, 'A user interface or controls problem (%c).', 'The button, hotkey or text shows wrong or does nothing.', ['Compare with the vanilla ui/controls file.'], 'I'],
  [/^(WARN_)?(DAMAGE|ARMOR|VOLUME_NO_BLAST|THRESHOLD|OVERMATCH|NO_CALIBRE|PERK|ACCURACY|RICOCHET|WARN_RICOCHET|WARN_BURN)/, 'A damage, armour or ballistics value problem (%c).', 'The engine uses a default or the wrong table: hits do too much or too little.', ['Compare with the vanilla weapon/armour values.'], 'I'],
  [/^(WARN_)?(FX|SND|THUNDER|WARN_SOUND|WARN_ENV)_?/, 'An effect or sound problem (%c).', 'The effect or sound does not play or plays wrong.', ['Check the effect/sound name and file.'], 'I'],
  [/^(WARN_)?(PORT|GOH|SDL_GOH|PACK_GOH)_/, 'A Gates of Hell port difference (%c).', 'GoH data that AS2 reads differently or not at all; the ported unit may act wrong.', ['Read the message: it names the key and what was done with it.', 'Spawn the unit in AS2 and check that part.'], 'I'],
  [/^(WARN_)?(LNG|LOC|PO)_|^(WARN_)?(LNG|LOC)[A-Z]|^WARN_TEXT|^NAME_|^WARN_NAME/, 'A text or localisation problem (%c).', 'Text shows as raw key names, boxes, or the wrong language.', ['Check the .lng file: UTF-8, {tags root, key spelling.'], 'I'],
  [/^(WARN_)?(MOD|MODS|REQ|VER|DEP|DOC|REL|DRIFT|OVR|VANILLA|CONFLICT|PACK|PAK|ZIP|TEX_EXT|NO_RESOURCE|NO_STAMP|MOVE_REF|WARN_MOVE|MODINFO|DELETE|DISABLED|WARN_NOT_MOD|WARN_REQ)/, 'A mod setup, packing or load-order note (%c).', 'Decides which files the game reads: a wrong setup hides your change or loads an old one.', ['Read the message: it names the file or mod.', 'Fix mod.info, the folder layout or the load order.'], 'I'],
  [/^(WARN_)?(PORT|GOH|SDL_GOH|PACK_GOH)_|^WARN_PORT/, 'A Gates of Hell port difference (%c).', 'GoH data that AS2 reads differently or not at all; the ported unit may act wrong.', ['Read the porting note for this key.', 'Use the AS2 form of the value.'], 'I'],
  [/^(WARN_)?(UPGRADE)_/, 'A note from the upgrade tool (%c).', 'Old mod data the tool changed or could not change.', ['Read the message and check the file it names.'], 'I'],
  [/^(WARN_)?(PARAM|TAG|ESCAPE|BARE|ARITH|NUMBER|SDL|BODY|CLEAN|LINE|FN|KEY|ENUM|GOH_KEY|TERM|VISION|PATHER|OVERMATCH|DUP)_?/, 'A data file syntax or value note (%c).', 'The engine may read this value wrong or skip it.', ['Go to the line shown and compare with vanilla.'], 'I'],
  [/^(PREFLIGHT)_/, 'A test-setup problem found before a game test (%c).', 'The test would not show what you expect.', ['Read the message and fix the test setup.'], 'I'],
  [/^(RC|KEYLINT|SDLLINT|WARN_SDLLINT|WARN_KEYS)_/, 'A tool setup note (%c).', 'The tool could not read everything; results may be incomplete.', ['Check the game folder and .lintrc settings.'], 'I'],
  [/^(OGG|MP3|FLAC)_RENAMED$|^NOT_RIFF$|^NO_FMT$|^NO_DATA$|^FMT_ZERO$/, 'The sound file is not a .wav the game can play (%c).', 'The game sound library (Miles) takes only a real RIFF/WAVE file with a format and a data part; anything else stays silent, with no error on screen.', ['Open the sound in an audio editor.', 'Save it as a .wav: 16-bit PCM or IMA ADPCM, like the vanilla sounds.'], 'I'],
  [/^RIFF_SIZE$|^(PCM|IMA|FLOAT)_BITS$|^IMA_ALIGN$|^MP3_IN_WAV$/, 'The sound file uses a format detail the vanilla sounds do not use (%c).', 'The game may still play it, but it can stay silent, click or sound rough; the Editor may not be able to play it either.', ['Open the sound in an audio editor.', 'Save it as a .wav: 16-bit PCM or IMA ADPCM, like the vanilla sounds.'], 'T'],
  [/^WARN_/, 'A warning (%c).', 'Not a definite error; the game may still behave unexpectedly.', ['Read the message and look at the line shown.'], 'I'],
];
// codes the scanner picks up that are not finding codes (labels, sentinels, test markers)
const NOT_CODES = new Set(['ABORT_ERR', 'CLIP_DISTANCE', 'CULL_DISTANCE', 'RENDER_TARGET_ARRAY_INDEX', 'VIEWPORT_ARRAY_INDEX', 'VERTEX_ID', 'PRIMITIVE_ID', 'INSTANCE_ID', 'IS_FRONT_FACE', 'SAMPLE_INDEX', 'LOADS_STATIC', 'LIKELY_CRASH', 'WARN_X', 'OVERMATCH_SHORT', 'GOH_ORIGIN_CHANGED', 'GOH_ORIGIN_GONE', 'VANILLA_SAME', 'VANILLA_CHANGED', 'VANILLA_REMOVED', 'AS2_GAME',
  'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']);   // environment variable names read by lib/platform.js

let LIM = null;
function limitsMap() {
  if (LIM) return LIM;
  LIM = new Map();
  const dir = path.join(__dirname, '..', '..', 'limits');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^[A-Z0-9]+\.md$/.test(f) && f !== 'INDEX.md' && f !== 'KEY.md'); } catch { return LIM; }
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const l of txt.split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9]+-\d+) \|/); if (!m) continue;
      const chk = l.match(/chk [a-z0-9]+((?: [A-Z][A-Z0-9_]+)+)/g) || [];
      for (const c of chk) for (const code of c.split(' ').slice(2)) { if (!LIM.has(code)) LIM.set(code, []); const a = LIM.get(code); if (!a.includes(m[1])) a.push(m[1]); }
    }
  }
  return LIM;
}
// lib/limmap entry first (the mapped rows), then the chk cells of limits/*.md; deduped, at most 4
const limitsFor = code => {
  let mapped = [];
  try { const e = require('./limmap').limitOf(code); if (e) mapped = e.lim; } catch { /* limmap unreadable: chk cells only */ }
  return [...new Set(mapped.concat(limitsMap().get(code) || []))].slice(0, 4);
};

function whereOf(f) {
  if (!f) return '';
  if (f.file) return f.file + (f.line ? ':' + f.line : '');
  const s = (f.samples || [])[0];
  if (s) return typeof s === 'string' ? s : (s.file || s.key || '') + (s.line ? ':' + s.line : '');
  if (f.first) return String(f.first).split(' | ')[0].slice(0, 200);
  return '';
}
const KIND = { ANM: 'animation .anm', PLY: 'mesh .ply', VOL: 'collision .vol', DDS: 'texture .dds', EBM: 'model .ebm', NET: 'map .net', WAV: 'sound .wav' };

// opt = {lang: 'en'|'ru'|'uk'|'zh', sea: bool (default: running in the exe)}. lang: impact lines + the cards in TR are translated, the rest stays English (lang field says which)
function explain(code, finding, opt) {
  code = String(code || '').trim();
  opt = opt || {};
  const sea = opt.sea === undefined ? isSea() : !!opt.sea;
  const L = TR[opt.lang] || null;
  const sev = SEV[code] || (/^(FIX_|ITM_|LOOSE_|STAMP_)/.test(code) ? 'info' : /MPSYNC|^LOG_OOS/.test(code) ? 'desync' : severity(code));
  const auto = AUTO[code] || null;
  const impact = L ? (IMPACT_OVR[code] ? L.impact.hidden : L.impact[sev]) : (IMPACT_OVR[code] || IMPACT[sev]);
  const base = { code, severity: sev, impact, limits: limitsFor(code), auto, safe: auto ? FIXERS[auto].safe : false, where: whereOf(finding), lang: L ? opt.lang : 'en' };
  const s = S[code];
  if (s) {
    const tr = L && L[code];
    return { ...base, what: (tr || s)[0], why: (tr || s)[1], fix: (tr || s)[2], tag: '[' + (s[3] || (base.limits.length ? 'V' : 'I')) + ']', known: true, lang: tr ? opt.lang : 'en' };
  }
  for (const [re, what, why, fix, tag] of F) if (re.test(code)) {
    const t = KIND[code.split('_')[0]] || 'asset';
    const sub = x => x.replace('%c', code).replace('%t', t);
    return { ...base, what: sub(what), why: sub(why), fix: fix.map(sub), tag: '[' + tag + ']', known: true, lang: 'en' };
  }
  const fb = L ? L.fallback : [`${code || 'This finding'}: no plain-words entry yet.`, 'The tool that found it knows the rule, but this card has no explanation for it. Read the message next to it.', ['Read the tool message and look at the place shown.']];
  const look = sea ? 'Open the "Start here" page (Get help) and look up a limits ID from the message, or copy the diagnostics text when you ask for help.' : 'Search the limits table: node tools/q/q.js -k ' + (code || '<code>');
  return { ...base, what: L ? code + ': ' + fb[0] : fb[0], why: fb[1], fix: fb[2].concat([look]), tag: '[I]', known: false };
}

// front-door tools whose codes the GUI can show (check, doctor's linters, upgrade, fix)
const SCAN = ['gen', 'clone-entity', 'patch-entity', 'map-clone', 'botrecipe', 'newmod', 'goh2as2', 'modinfo', 'sdllint', 'keylint', 'ialint', 'uilint', 'strlint', 'humlint', 'movlint', 'fxlint', 'expcheck', 'refcheck', 'lnglint', 'loccover', 'milint', 'packer', 'vfs', 'binhdr', 'conflicts', 'mpsync', 'overdiff', 'logtriage', 'portdiff', 'misdiff', 'drift', 'upgrade', 'fix', 'check', 'doctor', 'lib'];
function collect(root) {
  root = root || path.join(__dirname, '..');
  const out = new Set(), re = /['"`]([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)['"`]/g;
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'node_modules' && e.name !== 'fixture') walk(p); }
      else if (/\.js$/.test(e.name) && e.name !== 'explain.js') { const t = fs.readFileSync(p, 'utf8'); let m; while ((m = re.exec(t))) if (!NOT_CODES.has(m[1])) out.add(m[1]); } } };
  for (const t of SCAN) walk(path.join(root, t));
  return out;
}

module.exports = { explain, collect, limitsFor, FIXERS, IMPACT, AUTO, NOT_CODES, SEV, TR, isSea };
