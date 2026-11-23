// logs ext: plain-words tables. Pure data + small helpers, no I/O. Written for a player who has never modded.
// logCard(group) -> {title, what, fix:[...], level:'stop'|'crash'|'warn'|'note'}; crashHint(code, fn, addr); modinfoPlain(code, msg); verdictPlain(verdict)
// Author: Imperator_Aug (ARSENAL, ia-87fb75c7)

// logtriage code -> plain card. level: stop = the game ended or the mod is dropped, crash = crashes when used, warn = something is missing or wrong but the game runs
const LOG = {
  LOG_SCRIPT_ERROR: { level: 'stop', title: 'The game stopped on a data error', what: 'A mod data file has a mistake the game cannot skip, so it closed itself on purpose.', fix: ['Open the file named in the line below and look at the line number.', 'The usual causes are a missing bracket, a name that is not defined, or a wrong word.', 'Fix it, then start the game again.'] },
  LOG_ERROR_MSG: { level: 'stop', title: 'The game stopped on a fatal error', what: 'The game printed a fatal message and closed.', fix: ['Read the message below. It names the file or the thing that is wrong.', 'Fix that file, then start the game again.'] },
  LOG_FALLBACK_FONT: { level: 'stop', title: 'The game stopped while loading fonts', what: 'This usually follows a mod that the game skipped because its game version line does not match the game mode.', fix: ['Open the mod.info of the newest mod you added.', 'Set MinGameVersion and MaxGameVersion so they fit your game (use the "Why is my mod not in the list?" box).'] },
  LOG_MOD_INFO_ERROR: { level: 'stop', title: 'A mod.info file is broken', what: 'The game could not read a mod.info file and closed at start-up.', fix: ['Open that mod.info and check every { and } and every quote.', 'Compare it with a working mod.info. Use "Why is my mod not in the list?" below.'] },
  LOG_CRASH: { level: 'stop', title: 'The game crashed', what: 'The game hit a hard error and was shut down by Windows. The crash block names the part of the game that failed.', fix: ['Look at "Crash reports" below for the same crash in plain words.', 'The warnings that came just before it usually name the real cause.'] },
  LOG_MOD_MODE: { level: 'stop', title: 'A mod was skipped: wrong game mode', what: 'The game did not apply this mod because its version lines say it is for the other mode (Classic or Enhanced).', fix: ['Open the mod.info of that mod.', 'Old mods need both MinGameVersion and MaxGameVersion. New mods use MinGameVersion 3.301 or higher and need as64+ in the mod list.', 'Use "Why is my mod not in the list?" below.'] },
  LOG_NO_STUFF: { level: 'crash', title: 'An item has no matching content', what: 'Some data asks for an ammo or item tag that nothing provides. The game puts in a dummy and carries on, then crashes when the item is used.', fix: ['Find the tag named in the line below and check the spelling in the weapon or unit file.', 'Or add the missing ammo or item file.', 'Test by buying and firing that unit.'] },
  LOG_MISSING_FILE: { level: 'warn', title: 'A file the data names is missing', what: 'A model, texture, animation or sound is named in your data, but the game cannot find the file.', fix: ['Check the spelling and the capital letters of the file name.', 'Check the file is really inside your mod folder (or in the game).', 'A missing model can make the unit invisible or crash when it spawns.'] },
  LOG_WARN: { level: 'warn', title: 'The game noticed a problem', what: 'The game kept running, but something in the data is wrong or missing.', fix: ['Read the message below. It names the thing that is wrong.', 'If it says "can\'t preload" for a unit, that unit may not be on the buy list.'] },
  LOG_LEVEL_PARAM: { level: 'warn', title: 'A level name is not valid', what: 'An ability asks for a level that does not exist, so the game uses the highest level instead.', fix: ['Fix the level name in the breed or ability file named below.'] },
  LOG_PANEL_ITEM: { level: 'warn', title: 'A panel button has no definition', what: 'The command panel lists a button the game does not know, so a blank button is used.', fix: ['Remove the button from the panel list, or add its definition.'] },
  LOG_OOS: { level: 'warn', title: 'An online match fell out of sync', what: 'Players in an online match saw different things (an "out of sync" report).', fix: ['Make sure every player has the same game version and the same mods in the same order.'] },
  LOG_OOS_VERSION: { level: 'warn', title: 'Players had different game versions', what: 'The players in that match were not on the same version of the game. This is the most common cause of out of sync.', fix: ['Everyone must run the same build.'] },
  LOG_NO_LOG: { level: 'note', title: 'There is no game.log here', what: 'This folder has no game.log, so there is nothing to read yet.', fix: ['Start the game once with your mod, play until the problem shows, then close it.', 'Press "Explain my last game log" again.'] },
};
const INFO = new Set(['LOG_BENIGN', 'LOG_UNCLASSIFIED', 'LOG_LUA', 'LOG_PHASE', 'LOG_NOTE', 'LOG_DUMP', 'LOG_SYNC', 'LOG_LOBBY_DUP', 'LOG_EXE_SWITCH', 'LOG_PREV_LOST', 'LOG_MOD_SHADOWED']);
const INFO_PLAIN = {
  LOG_MOD_SHADOWED: 'A mod folder in your game also exists as a Workshop item. The Workshop one is used. You can delete the local copy.',
  LOG_PREV_LOST: 'The older game (mowas_2.exe) erases the log every start and keeps no game.prev.log, so a crash log from the run before is gone.',
  LOG_EXE_SWITCH: 'The last two starts used different game programs.',
  LOG_BENIGN: 'Harmless messages the game always prints.',
  LOG_UNCLASSIFIED: 'Messages this tool does not know yet. Not necessarily a problem.',
};

function logCard(g) {
  const c = LOG[g.code];
  if (c) return Object.assign({ code: g.code }, c);
  return null;
}

// faulting function -> plain subsystem (mirrors logtriage CRASH_FN, in words)
const CRASH_FN = [
  [/eCannonExtender|eAmmo::Reload/i, 'A gun or its ammo. Look for "No Stuff found" or an ammo name that does not match, especially on towed guns and howitzers.'],
  [/eActor::Quant|eSensor|eVision/i, 'A soldier\'s sight or senses. A soldier or squad has incomplete data. Buy squads one at a time to find which one.'],
  [/eChassis|eWheel|eTrack/i, 'Wheels or tracks of a vehicle. Check the chassis, wheel and track data of the new vehicle.'],
  [/eGameEntityArmor|eDamage/i, 'Armour or damage. Check the armour and material data of the unit that was hit.'],
  [/eSDLReader/i, 'A data file with a typing mistake. The lines just before the crash name the file.'],
  [/eBoneIK|eSkeleton|eModel/i, 'A model or animation. The model has a bone or animation the data does not match.'],
  [/eTextFont/i, 'Fonts. Usually a mod was skipped because of its version lines (see LOG_MOD_MODE).'],
];
function crashHint(code, fn, addr) {
  const out = [];
  const f = CRASH_FN.find(([re]) => re.test(fn || ''));
  if (f) out.push(f[1]);
  const n = addr != null ? parseInt(String(addr).replace(/^0x/i, ''), 16) : NaN;
  if (/ACCESS_VIOLATION/i.test(code || '') && Number.isFinite(n) && n < 0x1000) out.push('A very small address like this means the game followed a reference to something that does not exist: a missing file, name, or entry in your data.');
  else if (/ACCESS_VIOLATION/i.test(code || '')) out.push('The game read memory it should not. Often a broken or mismatched model, or a mod that does not fit this game version.');
  if (/STACK_OVERFLOW/i.test(code || '')) out.push('Something refers to itself in a loop (for example a file that includes itself).');
  if (/OUT_OF_MEMORY|NO_MEMORY/i.test(code || '')) out.push('The game ran out of memory. Too many or too large textures or models.');
  if (!out.length) out.push('The name of the failing part is the best clue. Check what you changed last and undo it to confirm.');
  return out;
}

const MODINFO = {
  SYNTAX: ['The game cannot read mod.info, so it will not list the mod.', 'The file must start with {Mod ...} and have matching brackets. Copy a working mod.info and change the words.'],
  MODINFO_PARSE: ['A line in mod.info is not in the form the game expects. The game stops at start-up.', 'Each line looks like {Name "My mod"}: the value must be one word or sentence in quotes.'],
  ENC_BOM: ['mod.info starts with a hidden marker byte. The game cannot read it.', 'Save the file as plain UTF-8 without BOM.'],
  VER_MISSING: ['The game hides this mod: it has no game version lines.', 'Add {MinGameVersion "3.262"} and {MaxGameVersion "3.262.1"} for an old-style mod, or {MinGameVersion "3.301"} for a mod that needs as64+.'],
  VER_RANGE: ['The game hides this mod: the version range does not include your game version.', 'Change MinGameVersion so it is not above your game, and MaxGameVersion so it is not below.'],
  VER_ORDER: ['The game hides this mod: Min is higher than Max.', 'Swap the two numbers.'],
  REQ_MISSING: ['The mod needs another mod that is not in your mods folder.', 'Install the required mod, or remove the Require line if you do not need it.'],
  WARN_MOD_MODERN: ['This mod is written for the new mode (Enhanced). It only loads with as64+ switched on.', 'Put as64+ in the mod list above this mod.'],
  WARN_REQ_BUILTIN: ['The mod lists a built-in package as required. The game treats these as always there.', 'Usually nothing to do.'],
  DELETE_PREFIX: ['A Delete line is written in a way the game may not match.', 'Delete paths start with a slash and the folder name, like /entity/x.'],
  WARN_NOT_MOD: ['This folder has a mod.info but is not marked as a mod.', 'Check the first word in the file is Mod.'],
  UNKNOWN_KEY: ['mod.info has a word the game does not know. It is ignored.', 'Check the spelling (Name, Desc, MinGameVersion, MaxGameVersion, Require, Delete, FileId).'],
  DUP_KEY: ['mod.info has the same line twice. Only one is used.', 'Remove the extra one.'],
  BAD_FILEID: ['The FileId line is not a number.', 'Leave FileId out unless the mod is on the Workshop.'],
  WARN_NAME_FOLDER: ['The mod name and the folder name differ.', 'Not an error. The folder name is what the mod list uses.'],
};
function modinfoPlain(code) { const m = MODINFO[code]; return m ? { what: m[0], fix: m[1] } : null; }

// wouldload verdict -> plain
function verdictPlain(v) {
  switch (String(v || '').split(':')[0].trim()) {
    case 'REFUSED': return { level: 'stop', text: 'The game will refuse this mod and not list it.' };
    case 'LIKELY_CRASH': return { level: 'stop', text: 'The game will probably crash or stop on this mod.' };
    case 'LOADS_STATIC': return { level: 'ok', text: 'On paper the game should load this mod. A real test is still needed.' };
    case 'UNKNOWN': return { level: 'note', text: 'Could not judge. Part of the game files could not be read.' };
    default: return { level: 'note', text: String(v || '') };
  }
}

// logtriage LOG_NOTE "this log was written by <a>.exe, not <b>.exe" (LOG-20: AS64 and MoW:AS2 share one log folder) or "this is a
// Gates of Hell log, not a <b>.exe one" -> one plain sentence; any other note -> null (LOG_NOTE stays out of the cards)
const EXE_NAME = { as64: 'AS64 (as64.exe)', mowas_2: 'MoW:AS2 (mowas_2.exe)', call_to_arms: 'Gates of Hell (call_to_arms.exe)' };
const exeName = x => EXE_NAME[String(x || '').toLowerCase()] || String(x || '') + '.exe';
function exeNotePlain(msg) {
  const s = String(msg || '');
  let m = /^this log was written by ([\w.]+?)\.exe, not ([\w.]+?)\.exe/i.exec(s);
  if (m) return 'This log was written by ' + exeName(m[1]) + ', not by ' + exeName(m[2]) + '. ' + (/LOG-20/.test(s) ? 'AS64 and MoW:AS2 share one log folder: the game started last wrote it. Start ' + exeName(m[2]) + ' once to get its own log.' : 'It is read in the form of the game that wrote it.');
  m = /^this is a Gates of Hell log, not a ([\w.]+?)\.exe one/i.exec(s);
  if (m) return 'This is a Gates of Hell log, not one of ' + exeName(m[1]) + '. It is read in the Gates of Hell form.';
  return null;
}

module.exports = { LOG, INFO, INFO_PLAIN, logCard, crashHint, modinfoPlain, verdictPlain, MODINFO, exeNotePlain };
